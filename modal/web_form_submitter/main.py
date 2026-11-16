"""
Fault Line — Web Form Submitter (Modal + Playwright)

Deployed as a Modal app. Given a city web-form URL and the escalation
payload, spins up a headless Chromium, detects the CMS, fills the form,
submits it, and returns success/failure.

Current adapters:
  - CivicPlus  (used by Lowell MA, Chicopee MA, Hartford CT, Bangor ME,
                Rochester NH, Attleboro MA, and 5000+ other US municipalities)
  - SeeClickFix web (when an API-less city still renders the SCF form)
  - Generic (best-effort heuristic: the form holding the first textarea,
             its email input and its submit button)

Deploy:
    cd modal/web_form_submitter
    modal deploy main.py

Secret (Modal dashboard or CLI), both values required:
    modal secret create fault-line-web-form-worker \
        WEB_FORM_WORKER_SECRET=<random> \
        WEB_FORM_ALLOWED_HOSTS=<comma-separated hosts>

WEB_FORM_ALLOWED_HOSTS is the set of hosts of authorities' web_form
endpoints. Regenerate it from Supabase SQL whenever authorities change:
    SELECT string_agg(DISTINCT lower(substring(m->>'endpoint' FROM '^https://([^/:?#]+)')), ',')
    FROM authorities a, jsonb_array_elements(coalesce(a.submission_methods, '[]'::jsonb)) m
    WHERE m->>'method' = 'web_form' AND m->>'endpoint' LIKE 'https://%';

Invoke:
    POST https://<modal-endpoint>/submit
    Authorization: Bearer <WEB_FORM_WORKER_SECRET>
    Content-Type: application/json
    {
      "url": "https://www.lowellma.gov/formcenter/Staff-Directory-4/Contact-Public-Works-89",
      "name": "Fault Line Community Reports",
      "email": "moonlit-social-labs@proton.me",
      "subject": "...",
      "message": "...",
      "dry_run": false      # true: fill + screenshot, never press Submit
    }

Safety rules:
  - Fails closed: no secret or no allowlist configured → 503.
  - Only https URLs on an allowlisted host. Every request the page makes
    (including each redirect hop, which is fetched without following and
    checked before the browser sees it) must resolve to public addresses:
    private, loopback, link-local, CGNAT, ULA, multicast and reserved
    ranges are refused. Top-level navigations must stay on allowlisted
    https hosts.
  - Never solves CAPTCHAs: a CAPTCHA (widget, iframe, script or JS API),
    checked on load and again right before Submit → success:false, reason
    "captcha", so the report stays in the manual queue.
  - Fills and submits only the form that contains the message textarea;
    never submits with required fields in that form left empty.
  - Success only counts confirmation text that appeared AFTER submitting.
  - Screenshots are returned only for dry runs.
"""
from __future__ import annotations

import asyncio
import base64
import hmac
import ipaddress
import os
import socket
from urllib.parse import urljoin, urlparse

import modal
from fastapi import Header

APP_NAME = "fault-line-web-form-submitter"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("playwright==1.64.0", "fastapi[standard]==0.115.0")
    .run_commands(
        "playwright install --with-deps chromium",
    )
)

app = modal.App(APP_NAME, image=image)

# Secret for authenticating incoming requests + the host allowlist (see above).
auth_secret = modal.Secret.from_name("fault-line-web-form-worker")

MAX_FIELD_CHARS = {"url": 2048, "name": 200, "email": 254, "subject": 500, "message": 20000}


# ---- SSRF guard ------------------------------------------------------------

_BLOCKED_NETS = [ipaddress.ip_network(n) for n in (
    "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
    "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16",
    "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
    "::/128", "::1/128", "::ffff:0:0/96", "64:ff9b::/96", "64:ff9b:1::/48", "100::/64",
    "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7", "fe80::/10", "fec0::/10", "ff00::/8",
)]


def _ip_is_public(ip: ipaddress._BaseAddress) -> bool:
    # IPv4-mapped / NAT64 / 6to4 forms carry an IPv4 address: judge that too.
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return _ip_is_public(ip.ipv4_mapped)
        if ip.sixtofour is not None:
            return _ip_is_public(ip.sixtofour)
    if any(ip in net for net in _BLOCKED_NETS):
        return False
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
                or ip.is_reserved or ip.is_unspecified)


async def host_resolves_public(host: str, port: int) -> bool:
    """Every address the host resolves to must be public (no partial pass)."""
    if not host:
        return False
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        return False
    if not infos:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0].split("%", 1)[0])
        except ValueError:
            return False
        if not _ip_is_public(ip):
            return False
    return True


def allowed_hosts() -> set[str]:
    raw = os.environ.get("WEB_FORM_ALLOWED_HOSTS", "")
    return {h.strip().lower().rstrip(".") for h in raw.split(",") if h.strip()}


def _host_port(url: str) -> tuple[str, str, int]:
    p = urlparse(url)
    host = (p.hostname or "").lower().rstrip(".")
    port = p.port or (443 if p.scheme == "https" else 80)
    return p.scheme, host, port


async def url_allowed(url: str, top_level: bool, allow: set[str]) -> bool:
    """Top-level pages: https + allowlisted host. Everything: public addresses only."""
    try:
        scheme, host, port = _host_port(url)
    except ValueError:
        return False
    if scheme not in ("http", "https"):
        return False
    if top_level and (scheme != "https" or host not in allow):
        return False
    return await host_resolves_public(host, port)


async def install_request_guard(page, allow: set[str]) -> None:
    """Checks every request; fetches it without following redirects so each
    hop's Location is checked before the browser follows it."""

    async def handler(route, request):
        url = request.url
        if url.startswith(("data:", "blob:", "about:")):
            await route.continue_()
            return
        top_level = request.is_navigation_request() and request.frame == page.main_frame
        if not await url_allowed(url, top_level, allow):
            await route.abort("blockedbyclient")
            return
        try:
            response = await route.fetch(max_redirects=0, timeout=30000)
        except Exception:
            await route.abort("failed")
            return
        if 300 <= response.status < 400:
            location = response.headers.get("location")
            if location and not await url_allowed(urljoin(url, location), top_level, allow):
                await route.abort("blockedbyclient")
                return
        await route.fulfill(response=response)

    await page.route("**/*", handler)


# ---- Adapters --------------------------------------------------------------

async def detect_cms(page, url: str) -> str:
    """Identify the CMS powering the page so we can use the right adapter."""
    host = urlparse(url).netloc.lower()

    # CivicPlus URLs almost always have /formcenter/ or /FormCenter/
    if "/formcenter/" in url.lower():
        return "civicplus"

    # Some SeeClickFix embed pages
    if host == "seeclickfix.com" or host.endswith(".seeclickfix.com"):
        return "seeclickfix"

    # Granicus (GovAccess)
    if "govaccess" in host or "granicus" in host:
        return "granicus"

    # Inspect DOM as a fallback
    try:
        has_civicplus = await page.locator("meta[content*='CivicPlus']").count() > 0
        if has_civicplus:
            return "civicplus"
    except Exception:
        pass

    return "generic"


# Message field per adapter, in order of preference. The form that holds the
# first match is the only form we touch.
MESSAGE_SELECTORS = {
    "civicplus": ['textarea[id*="Comment" i]', 'textarea[id*="Message" i]', 'textarea'],
    "seeclickfix": ['textarea[name="issue[description]"]'],
    "generic": ['textarea'],
}


async def find_target_form(page, cms: str):
    """The form containing the message textarea, and that textarea's selector."""
    await page.wait_for_selector("form", timeout=20000)
    for sel in MESSAGE_SELECTORS.get(cms, MESSAGE_SELECTORS["generic"]):
        form = page.locator("form").filter(has=page.locator(sel)).first
        if await form.count() > 0:
            return form, sel
    raise RuntimeError("No form with a message field")


async def fill_civicplus(form, message_sel: str, name: str, email: str, subject: str, message: str) -> None:
    """CivicPlus forms have predictable field IDs generated from field labels.
    Almost every form has: First Name, Last Name, Email, Subject (sometimes),
    Comments/Message. We match by visible label text for resilience."""
    first, _, last = name.partition(" ")
    if not last:
        last = "Community Reports"

    await _fill_if_present(form, [
        'input[id*="FirstName" i]',
        'input[name*="first" i][type="text"]',
        'input[placeholder*="First" i]',
    ], first)

    await _fill_if_present(form, [
        'input[id*="LastName" i]',
        'input[name*="last" i][type="text"]',
        'input[placeholder*="Last" i]',
    ], last)

    await _fill_if_present(form, [
        'input[type="email"]',
        'input[id*="Email" i]',
        'input[name*="email" i]',
    ], email)

    # Optional subject (not every CivicPlus form has one)
    await _fill_if_present(form, [
        'input[id*="Subject" i]',
        'input[name*="subject" i]',
    ], subject, required=False)

    await _fill_if_present(form, [message_sel], message)


async def fill_generic(form, message_sel: str, name: str, email: str, subject: str, message: str) -> None:
    """Best-effort heuristic for unknown form structures."""
    await _fill_if_present(form, [
        'input[type="email"]',
        'input[name*="email" i]',
    ], email)

    await _fill_if_present(form, [
        'input[placeholder*="name" i]',
        'input[name*="name" i]',
        'input[type="text"]:first-of-type',
    ], name, required=False)

    await _fill_if_present(form, [
        'input[placeholder*="subject" i]',
        'input[name*="subject" i]',
        'input[id*="subject" i]',
    ], subject, required=False)

    await _fill_if_present(form, [message_sel], message)


async def fill_seeclickfix(form, message_sel: str, name: str, email: str, subject: str, message: str) -> None:
    """SeeClickFix embedded form has specific field names."""
    await _fill_if_present(form, ['input[name="issue[summary]"]'], subject)
    await _fill_if_present(form, [message_sel], message)
    await _fill_if_present(form, ['input[name="user[name]"]'], name)
    await _fill_if_present(form, ['input[name="user[email]"]'], email)


async def _fill_if_present(scope, selectors, value: str, required: bool = True) -> bool:
    """Try each selector (inside `scope`, the target form) until one matches;
    fill and return True. Raises if `required` and none match."""
    for sel in selectors:
        try:
            locator = scope.locator(sel).first
            if await locator.count() > 0:
                await locator.fill(value)
                return True
        except Exception:
            continue
    if required:
        raise RuntimeError(f"No selector matched: {selectors[0]}")
    return False


CAPTCHA_SELECTORS = [
    'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', 'iframe[src*="turnstile"]',
    'iframe[src*="challenges.cloudflare.com"]',
    'script[src*="recaptcha"]', 'script[src*="hcaptcha"]', 'script[src*="turnstile"]',
    'script[src*="challenges.cloudflare.com"]',
    '.g-recaptcha', '.h-captcha', '.cf-turnstile', 'div[data-sitekey]', '[data-hcaptcha-widget-id]',
]


async def has_captcha(page) -> bool:
    for sel in CAPTCHA_SELECTORS:
        try:
            if await page.locator(sel).count() > 0:
                return True
        except Exception:
            continue
    try:
        return bool(await page.evaluate(
            "() => typeof window.grecaptcha !== 'undefined' || typeof window.hcaptcha !== 'undefined'"
            " || typeof window.turnstile !== 'undefined'"))
    except Exception:
        return True  # can't tell → treat as protected; a person submits it


async def unfilled_required(form) -> list[str]:
    """Names/ids of visible required fields in the target form that are still empty."""
    return await form.evaluate("""(f) => [...f.querySelectorAll(
        'input[required], textarea[required], select[required], [aria-required="true"]')]
      .filter(el => el.offsetParent !== null && el.type !== 'hidden')
      .filter(el => el.type === 'checkbox' || el.type === 'radio' ? !el.checked : !String(el.value || '').trim())
      .map(el => el.name || el.id || el.getAttribute('aria-label') || el.tagName.toLowerCase())""")


async def click_submit(form) -> None:
    """Find and click the target form's submit button. Prefer labeled
    buttons, then fall back to any submit input."""
    candidates = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Send")',
        'button:has-text("Send Message")',
    ]
    for sel in candidates:
        try:
            locator = form.locator(sel).first
            if await locator.count() > 0:
                await locator.click()
                return
        except Exception:
            continue
    raise RuntimeError("Could not find submit button")


def _check_auth(authorization: str | None) -> None:
    from fastapi import HTTPException

    expected = os.environ.get("WEB_FORM_WORKER_SECRET", "")
    if not expected or not allowed_hosts():
        raise HTTPException(status_code=503, detail="Worker not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    given = authorization[len("Bearer "):]
    if not hmac.compare_digest(given.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid secret")


# ---- Endpoint --------------------------------------------------------------

@app.function(
    secrets=[auth_secret],
    timeout=120,
    memory=1024,
    min_containers=0,
)
@modal.fastapi_endpoint(method="POST", label="submit")
async def submit_web_form(body: dict, authorization: str | None = Header(default=None)):
    """POST /submit — fill and submit a city web form."""
    from fastapi import HTTPException

    _check_auth(authorization)

    fields = {k: body.get(k, "") for k in ("url", "name", "email", "subject", "message")}
    fields["name"] = fields["name"] or "Fault Line Community Reports"
    for k, v in fields.items():
        if not isinstance(v, str) or len(v) > MAX_FIELD_CHARS[k]:
            raise HTTPException(status_code=400, detail=f"{k} must be a string of at most {MAX_FIELD_CHARS[k]} characters")
    url, name, email, subject, message = (fields[k] for k in ("url", "name", "email", "subject", "message"))
    dry_run = body.get("dry_run", False) is True

    if not url or not email or not message:
        raise HTTPException(status_code=400, detail="url, email, and message are required")

    allow = allowed_hosts()
    if not await url_allowed(url, top_level=True, allow=allow):
        raise HTTPException(status_code=400, detail="url must be https on an allowlisted authority host with a public address")

    from playwright.async_api import async_playwright

    result: dict = {"url": url, "adapter": "unknown", "success": False, "dry_run": dry_run}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                context = await browser.new_context(
                    user_agent=(
                        "Mozilla/5.0 (FaultLine/1.0; +https://fault-line.dev) "
                        "CivicEscalationBot/1.0"
                    ),
                    service_workers="block",  # keep every request visible to the guard
                )
                page = await context.new_page()
                await install_request_guard(page, allow)
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)

                cms = await detect_cms(page, url)
                result["adapter"] = cms

                if await has_captcha(page):
                    result["reason"] = "captcha"
                    result["error"] = "Form has a CAPTCHA; left for manual submission"
                    return result

                before_text = (await page.inner_text("body")).lower()

                form, message_sel = await find_target_form(page, cms)
                if cms == "civicplus":
                    await fill_civicplus(form, message_sel, name, email, subject, message)
                elif cms == "seeclickfix":
                    await fill_seeclickfix(form, message_sel, name, email, subject, message)
                else:
                    await fill_generic(form, message_sel, name, email, subject, message)

                missing = await unfilled_required(form)
                if missing:
                    result["reason"] = "unfilled_required"
                    result["missing_fields"] = missing[:20]
                    result["error"] = f"Required fields not filled: {', '.join(missing[:8])}"
                    return result

                if dry_run:
                    result["reason"] = "dry_run"
                    png = await page.screenshot(full_page=True)
                    result["screenshot_base64"] = base64.b64encode(png).decode("ascii")
                    return result

                # A CAPTCHA can load late or appear once fields are filled.
                if await has_captcha(page):
                    result["reason"] = "captcha"
                    result["error"] = "Form has a CAPTCHA; left for manual submission"
                    return result

                await click_submit(form)

                # Wait for any of: URL change, success banner, error banner.
                try:
                    await page.wait_for_load_state("networkidle", timeout=20000)
                except Exception:
                    pass  # timeouts after submit aren't necessarily failures

                # Heuristic success check — presence of "thank" / "success" / "received" text.
                confirmation_patterns = [
                    "thank you",
                    "thanks",
                    "received",
                    "submitted",
                    "success",
                    "we'll be in touch",
                    "we have received",
                ]
                page_text = (await page.inner_text("body")).lower()
                # Only confirmation text that wasn't already on the form page counts.
                matched_pattern = next(
                    (pat for pat in confirmation_patterns if pat in page_text and pat not in before_text), None,
                )
                result["success"] = bool(matched_pattern)
                result["confirmation_marker"] = matched_pattern
            finally:
                await browser.close()
    except Exception as e:
        result["error"] = str(e)[:500]

    return result


@app.function(image=image)
@modal.fastapi_endpoint(method="GET", label="health")
async def health():
    return {"ok": True, "service": APP_NAME}
