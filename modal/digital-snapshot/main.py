"""
Fault Line — Digital Infrastructure Snapshot Worker (Modal + Playwright)

Captures a snapshot of a URL for digital-infrastructure evidence. Called
from the Fault Line app when a resident files a Group F report (broken city
website form, inaccessible PDF, missing translation, WCAG violation, etc.).

The worker holds no Supabase credentials. The caller either:
  * passes signed upload URLs (Supabase `createSignedUploadUrl`, one each for
    html / png / meta in the private `digital-infra-snapshots` bucket) and
    the worker PUTs the files there, or
  * passes none and gets the HTML and PNG back base64-encoded.

Deployment:
    modal secret create fault-line-digital-snapshot \\
        WORKER_SECRET=<32-byte-base64> \\
        SUPABASE_URL=https://dzewklljiksyivsfpunt.supabase.co
    modal deploy main.py
  (SUPABASE_URL is not a secret: it only pins which host signed upload URLs
  may point at. SUPABASE_SERVICE_ROLE_KEY is no longer used; remove it from
  the Modal secret.)

Consuming call:
    POST <modal-endpoint>/capture-snapshot
      Headers: x-worker-secret: <same>
      Body: { "url": "https://...", "reportId": "...",
              "uploadUrls": { "html": "<signed>", "png": "<signed>", "meta": "<signed>" } }   # uploadUrls optional
    200: { capturedAt, httpStatus, finalUrl, htmlBytes, screenshotBytes,
           htmlSha256, screenshotSha256, uploaded: bool,
           html_base64?, screenshot_base64? (only when not uploaded) }
    400 bad input / non-public URL, 401 bad secret, 502 capture or upload
    failed, 503 worker not configured.

Isolation: the URL must be http(s) and resolve only to public addresses;
the browser checks every request and redirect hop the same way (capture.py).
Chromium runs with its sandbox on, as an unprivileged user in a child
process; if the sandbox can't start, the capture fails rather than running
unsandboxed.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import modal
from fastapi import Header
from fastapi.responses import JSONResponse

# ─────────────────────────────────────────────────────────────────
# Modal app + image
# ─────────────────────────────────────────────────────────────────

app = modal.App("fault-line-digital-snapshot")

SANDBOX_USER = "snapshot"
BROWSERS_PATH = "/ms-playwright"
CAPTURE_SCRIPT = "/opt/snapshot/capture.py"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("wget", "gnupg", "ca-certificates")
    .pip_install(
        "playwright==1.64.0",
        "httpx==0.27.0",
        "fastapi[standard]==0.115.0",
    )
    .env({"PLAYWRIGHT_BROWSERS_PATH": BROWSERS_PATH})
    .run_commands(
        "playwright install --with-deps chromium",
        f"chmod -R a+rX {BROWSERS_PATH}",
        f"useradd --create-home --shell /usr/sbin/nologin {SANDBOX_USER}",
    )
    .add_local_file(Path(__file__).parent / "capture.py", CAPTURE_SCRIPT)
)

secret = modal.Secret.from_name("fault-line-digital-snapshot")

MAX_URL_CHARS = 2048
MAX_CHILD_OUTPUT = 60 * 1024 * 1024  # base64 HTML + PNG
CAPTURE_TIMEOUT_S = 75


def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


def _valid_upload_url(url: object) -> bool:
    """Signed Supabase Storage upload URL on our own project only."""
    base = urlparse(os.environ.get("SUPABASE_URL", ""))
    if not isinstance(url, str) or len(url) > 4096 or not base.hostname:
        return False
    u = urlparse(url)
    return (u.scheme == "https" and u.hostname == base.hostname and u.port in (None, 443)
            and u.path.startswith("/storage/v1/object/upload/sign/digital-infra-snapshots/")
            and "token=" in u.query)


async def _run_capture(url: str) -> dict:
    """Runs capture.py as the unprivileged user (Chromium sandbox stays on)."""
    env = {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HOME": f"/home/{SANDBOX_USER}",
        "PLAYWRIGHT_BROWSERS_PATH": BROWSERS_PATH,
    }
    # Modal runs functions as root; drop to the sandbox user for the browser.
    drop = {"user": SANDBOX_USER, "group": SANDBOX_USER, "extra_groups": []} if os.geteuid() == 0 else {}
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-I", CAPTURE_SCRIPT,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env=env, cwd=env["HOME"], limit=MAX_CHILD_OUTPUT, **drop,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(json.dumps({"url": url}).encode()), CAPTURE_TIMEOUT_S)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {"error": "capture timed out"}
    if len(out) > MAX_CHILD_OUTPUT:
        return {"error": "snapshot too large"}
    try:
        return json.loads(out or b"{}") or {"error": "no output"}
    except ValueError:
        print("capture stderr:", err.decode("utf-8", "replace")[-2000:])
        return {"error": "capture produced no result"}


# ─────────────────────────────────────────────────────────────────
# Snapshot capture
# ─────────────────────────────────────────────────────────────────

@app.function(image=image, secrets=[secret], timeout=120)
@modal.fastapi_endpoint(method="POST")
async def capture_snapshot(payload: dict, x_worker_secret: str | None = Header(default=None, alias="x-worker-secret")):
    """Capture a URL snapshot (see module docstring for the contract)."""
    import base64

    import httpx

    sys.path.insert(0, os.path.dirname(CAPTURE_SCRIPT))
    from capture import url_is_public  # same check the browser applies

    expected = os.environ.get("WORKER_SECRET", "")
    if not expected:
        return _error(503, "Worker not configured")
    if not x_worker_secret or not hmac.compare_digest(x_worker_secret.encode("utf-8"), expected.encode("utf-8")):
        return _error(401, "Unauthorized")

    url = payload.get("url")
    report_id = payload.get("reportId")
    upload_urls = payload.get("uploadUrls")
    if not isinstance(url, str) or not url or len(url) > MAX_URL_CHARS:
        return _error(400, "Missing or invalid 'url'")
    if report_id is not None and (not isinstance(report_id, str) or len(report_id) > 64):
        return _error(400, "Invalid 'reportId'")
    if upload_urls is not None and (
        not isinstance(upload_urls, dict)
        or set(upload_urls) != {"html", "png", "meta"}
        or not all(_valid_upload_url(v) for v in upload_urls.values())
    ):
        return _error(400, "'uploadUrls' must be signed upload URLs for html, png and meta in digital-infra-snapshots")
    if not await url_is_public(url):
        return _error(400, "URL must be http(s) and resolve to a public address")

    captured_at = int(time.time())
    shot = await _run_capture(url)
    if "error" in shot:
        print("capture failed:", shot["error"])
        return _error(502, "Snapshot capture failed")

    html = base64.b64decode(shot["html_base64"])
    png = base64.b64decode(shot["screenshot_base64"])
    result = {
        "capturedAt": captured_at,
        "httpStatus": shot.get("httpStatus", 0),
        "finalUrl": shot.get("finalUrl"),
        "htmlBytes": len(html),
        "screenshotBytes": len(png),
        "htmlSha256": hashlib.sha256(html).hexdigest(),
        "screenshotSha256": hashlib.sha256(png).hexdigest(),
    }

    if upload_urls is None:
        return {**result, "uploaded": False,
                "html_base64": shot["html_base64"], "screenshot_base64": shot["screenshot_base64"]}

    meta = json.dumps({"url": url, "reportId": report_id, **result}, indent=2).encode("utf-8")
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            for key, body, content_type in (
                ("html", html, "text/html; charset=utf-8"),
                ("png", png, "image/png"),
                ("meta", meta, "application/json"),
            ):
                response = await client.put(upload_urls[key], content=body, headers={"Content-Type": content_type})
                response.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print("upload failed:", repr(exc)[:300])
        return _error(502, "Upload failed")

    return {**result, "uploaded": True}


# ─────────────────────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────────────────────

@app.function(image=image)
@modal.fastapi_endpoint(method="GET")
def health():
    """Liveness probe."""
    return {"ok": True, "app": "fault-line-digital-snapshot"}
