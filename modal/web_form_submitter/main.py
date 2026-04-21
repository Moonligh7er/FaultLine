"""
Fault Line — Web Form Submitter (Modal + Playwright)

Deployed as a Modal app. Given a city web-form URL and the escalation
payload, spins up a headless Chromium, detects the CMS, fills the form,
submits it, and returns success/failure with a screenshot.

Current adapters:
  - CivicPlus  (used by Lowell MA, Chicopee MA, Hartford CT, Bangor ME,
                Rochester NH, Attleboro MA, and 5000+ other US municipalities)
  - SeeClickFix web (when an API-less city still renders the SCF form)
  - Generic (best-effort heuristic: first email input + first textarea
             + first submit button)

Deploy:
    cd modal/web_form_submitter
    modal deploy main.py

Invoke:
    POST https://<modal-endpoint>/submit
    Authorization: Bearer <WEB_FORM_WORKER_SECRET>
    Content-Type: application/json
    {
      "url": "https://www.lowellma.gov/formcenter/Staff-Directory-4/Contact-Public-Works-89",
      "name": "Fault Line Community Reports",
      "email": "moonlit-social-labs@proton.me",
      "subject": "...",
      "message": "..."
    }
"""
from __future__ import annotations
import os
import base64
from urllib.parse import urlparse

import modal

APP_NAME = "fault-line-web-form-submitter"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("playwright==1.47.0", "fastapi==0.115.0")
    .run_commands(
        "playwright install --with-deps chromium",
    )
)

app = modal.App(APP_NAME, image=image)

# Secret for authenticating incoming requests. Set in Modal dashboard:
#   modal secret create fault-line-web-form-worker WEB_FORM_WORKER_SECRET=<random>
auth_secret = modal.Secret.from_name("fault-line-web-form-worker")


# ---- Adapters --------------------------------------------------------------

async def detect_cms(page, url: str) -> str:
    """Identify the CMS powering the page so we can use the right adapter."""
    host = urlparse(url).netloc.lower()

    # CivicPlus URLs almost always have /formcenter/ or /FormCenter/
    if "/formcenter/" in url.lower():
        return "civicplus"

    # Some SeeClickFix embed pages
    if "seeclickfix.com" in host:
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


async def fill_civicplus(page, name: str, email: str, subject: str, message: str) -> None:
    """CivicPlus forms have predictable field IDs generated from field labels.
    Almost every form has: First Name, Last Name, Email, Subject (sometimes),
    Comments/Message. We match by visible label text for resilience."""
    # Wait for any form on the page.
    await page.wait_for_selector("form", timeout=20000)

    first, _, last = name.partition(" ")
    if not last:
        last = "Community Reports"

    # Try labeled fields in order of reliability.
    await _fill_if_present(page, [
        'input[id*="FirstName" i]',
        'input[name*="first" i][type="text"]',
        'input[placeholder*="First" i]',
    ], first)

    await _fill_if_present(page, [
        'input[id*="LastName" i]',
        'input[name*="last" i][type="text"]',
        'input[placeholder*="Last" i]',
    ], last)

    await _fill_if_present(page, [
        'input[type="email"]',
        'input[id*="Email" i]',
        'input[name*="email" i]',
    ], email)

    # Optional subject (not every CivicPlus form has one)
    await _fill_if_present(page, [
        'input[id*="Subject" i]',
        'input[name*="subject" i]',
    ], subject, required=False)

    # Comments / message field — always a textarea on CivicPlus
    await _fill_if_present(page, [
        'textarea[id*="Comment" i]',
        'textarea[id*="Message" i]',
        'textarea',
    ], message)


async def fill_generic(page, name: str, email: str, subject: str, message: str) -> None:
    """Best-effort heuristic for unknown form structures."""
    await page.wait_for_selector("form, textarea, input[type='email']", timeout=20000)

    await _fill_if_present(page, [
        'input[type="email"]',
        'input[name*="email" i]',
    ], email)

    await _fill_if_present(page, [
        'input[placeholder*="name" i]',
        'input[name*="name" i]',
        'input[type="text"]:first-of-type',
    ], name, required=False)

    await _fill_if_present(page, [
        'input[placeholder*="subject" i]',
        'input[name*="subject" i]',
        'input[id*="subject" i]',
    ], subject, required=False)

    await _fill_if_present(page, ['textarea'], message)


async def fill_seeclickfix(page, name: str, email: str, subject: str, message: str) -> None:
    """SeeClickFix embedded form has specific field names."""
    await page.wait_for_selector("form", timeout=20000)
    await _fill_if_present(page, ['input[name="issue[summary]"]'], subject)
    await _fill_if_present(page, ['textarea[name="issue[description]"]'], message)
    await _fill_if_present(page, ['input[name="user[name]"]'], name)
    await _fill_if_present(page, ['input[name="user[email]"]'], email)


async def _fill_if_present(page, selectors, value: str, required: bool = True) -> bool:
    """Try each selector until one matches; fill and return True. Raises if
    `required` and none match."""
    for sel in selectors:
        try:
            locator = page.locator(sel).first
            if await locator.count() > 0:
                await locator.fill(value)
                return True
        except Exception:
            continue
    if required:
        raise RuntimeError(f"No selector matched: {selectors[0]}")
    return False


async def click_submit(page) -> None:
    """Find and click the submit button. Prefer labeled buttons, then fall
    back to any submit input."""
    candidates = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Send")',
        'button:has-text("Send Message")',
    ]
    for sel in candidates:
        try:
            locator = page.locator(sel).first
            if await locator.count() > 0:
                await locator.click()
                return
        except Exception:
            continue
    raise RuntimeError("Could not find submit button")


# ---- Endpoint --------------------------------------------------------------

@app.function(
    secrets=[auth_secret],
    timeout=120,
    memory=1024,
    min_containers=0,
)
@modal.fastapi_endpoint(method="POST", label="submit")
async def submit_web_form(body: dict, authorization: str | None = None):
    """POST /submit — fill and submit a city web form."""
    from fastapi import HTTPException

    expected = os.environ.get("WEB_FORM_WORKER_SECRET", "")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if authorization[len("Bearer "):] != expected:
        raise HTTPException(status_code=401, detail="Invalid secret")

    url = body.get("url")
    name = body.get("name", "Fault Line Community Reports")
    email = body.get("email", "")
    subject = body.get("subject", "")
    message = body.get("message", "")

    if not url or not email or not message:
        raise HTTPException(status_code=400, detail="url, email, and message are required")

    from playwright.async_api import async_playwright

    result: dict = {"url": url, "adapter": "unknown", "success": False}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (FaultLine/1.0; +https://faultline.app) "
                    "CivicEscalationBot/1.0"
                ),
            )
            page = await context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)

            cms = await detect_cms(page, url)
            result["adapter"] = cms

            if cms == "civicplus":
                await fill_civicplus(page, name, email, subject, message)
            elif cms == "seeclickfix":
                await fill_seeclickfix(page, name, email, subject, message)
            else:
                await fill_generic(page, name, email, subject, message)

            await click_submit(page)

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
            page_text = (await page.content()).lower()
            matched_pattern = next(
                (p for p in confirmation_patterns if p in page_text), None,
            )
            result["success"] = bool(matched_pattern)
            result["confirmation_marker"] = matched_pattern

            # Screenshot the result for audit trail
            png = await page.screenshot(full_page=False)
            result["screenshot_base64"] = base64.b64encode(png).decode("ascii")

            await browser.close()
    except Exception as e:
        result["error"] = str(e)

    return result


@app.function(image=image)
@modal.fastapi_endpoint(method="GET", label="health")
async def health():
    return {"ok": True, "service": APP_NAME}
