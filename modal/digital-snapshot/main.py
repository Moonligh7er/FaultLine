"""
Fault Line — Digital Infrastructure Snapshot Worker (Modal + Playwright)

Captures a snapshot of a URL for digital-infrastructure evidence. Called
from the Fault Line app when a resident files a Group F report (broken city
website form, inaccessible PDF, missing translation, WCAG violation, etc.).

Snapshot artifacts stored in a private Supabase Storage bucket
(`digital-infra-snapshots`); returned reference key is stored on the
report's `digital.snapshotRef` field.

Deployment:
    modal secret create fault-line-digital-snapshot \\
        WORKER_SECRET=<32-byte-base64> \\
        SUPABASE_URL=https://dzewklljiksyivsfpunt.supabase.co \\
        SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
    modal deploy main.py

Consuming call:
    POST <modal-endpoint>/capture-snapshot
      Headers: x-worker-secret: <same>
      Body: { "url": "https://...", "reportId": "..." }
    Response: { "ref": "<bucket-key>", "capturedAt": "...", "httpStatus": 200 }
"""

import base64
import hashlib
import json
import os
import time
from typing import Optional

import modal

# ─────────────────────────────────────────────────────────────────
# Modal app + image
# ─────────────────────────────────────────────────────────────────

app = modal.App("fault-line-digital-snapshot")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("wget", "gnupg", "ca-certificates")
    .pip_install(
        "playwright==1.48.0",
        "httpx==0.27.0",
    )
    .run_commands(
        "playwright install --with-deps chromium",
    )
)

secret = modal.Secret.from_name("fault-line-digital-snapshot")


# ─────────────────────────────────────────────────────────────────
# Snapshot capture
# ─────────────────────────────────────────────────────────────────

@app.function(image=image, secrets=[secret], timeout=60)
@modal.fastapi_endpoint(method="POST")
def capture_snapshot(payload: dict, x_worker_secret: str = ""):
    """
    Capture a URL snapshot. Returns { ref, capturedAt, httpStatus, htmlBytes, screenshotBytes }.

    Errors return HTTP 400/401/500 with { error: "..." }.
    """
    from playwright.sync_api import sync_playwright  # type: ignore

    # Auth
    expected = os.environ.get("WORKER_SECRET", "")
    if not expected or x_worker_secret != expected:
        return {"error": "Unauthorized"}, 401

    url = payload.get("url")
    report_id = payload.get("reportId")
    if not url or not isinstance(url, str):
        return {"error": "Missing or invalid 'url'"}, 400
    if not url.startswith(("http://", "https://")):
        return {"error": "URL must be http:// or https://"}, 400

    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_key:
        return {"error": "Server not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)"}, 500

    captured_at = int(time.time())
    ref_hash = hashlib.sha256(f"{url}:{captured_at}".encode()).hexdigest()[:16]
    ref = f"snapshots/{captured_at}-{ref_hash}"

    # Capture
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                user_agent="Fault-Line-Snapshot/0.1 (moonlit-social-labs@proton.me)",
            )
            page = context.new_page()
            response = page.goto(url, wait_until="networkidle", timeout=30_000)
            http_status = response.status if response else 0

            html = page.content()
            screenshot = page.screenshot(full_page=True, type="png")

            browser.close()
    except Exception as exc:  # noqa: BLE001
        return {"error": f"Snapshot capture failed: {exc}"}, 500

    # Upload to Supabase Storage
    try:
        _upload_to_supabase(
            supabase_url,
            supabase_key,
            f"{ref}.html",
            html.encode("utf-8"),
            content_type="text/html; charset=utf-8",
        )
        _upload_to_supabase(
            supabase_url,
            supabase_key,
            f"{ref}.png",
            screenshot,
            content_type="image/png",
        )
        _upload_to_supabase(
            supabase_url,
            supabase_key,
            f"{ref}.meta.json",
            json.dumps(
                {
                    "url": url,
                    "reportId": report_id,
                    "capturedAt": captured_at,
                    "httpStatus": http_status,
                    "htmlBytes": len(html),
                    "screenshotBytes": len(screenshot),
                },
                indent=2,
            ).encode("utf-8"),
            content_type="application/json",
        )
    except Exception as exc:  # noqa: BLE001
        return {"error": f"Upload failed: {exc}"}, 500

    return {
        "ref": ref,
        "capturedAt": captured_at,
        "httpStatus": http_status,
        "htmlBytes": len(html),
        "screenshotBytes": len(screenshot),
    }


def _upload_to_supabase(
    supabase_url: str,
    supabase_key: str,
    key: str,
    body: bytes,
    content_type: str,
) -> None:
    import httpx

    bucket = "digital-infra-snapshots"
    url = f"{supabase_url}/storage/v1/object/{bucket}/{key}"
    headers = {
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    with httpx.Client(timeout=30) as client:
        response = client.post(url, content=body, headers=headers)
        response.raise_for_status()


# ─────────────────────────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────────────────────────

@app.function(image=image, secrets=[secret])
@modal.fastapi_endpoint(method="GET")
def health():
    """Liveness probe."""
    return {"ok": True, "app": "fault-line-digital-snapshot"}
