"""
Fault Line — digital snapshot capture (child process).

Started by main.py as the unprivileged `snapshot` user, so Chromium runs
with its sandbox on (Chromium refuses to sandbox as root). Reads
{"url": "..."} as JSON on stdin and writes one JSON object to stdout:
    {"httpStatus", "finalUrl", "html_base64", "screenshot_base64"}  or  {"error": "..."}

Every request the page makes is checked: http(s) only, and the host must
resolve only to public addresses (no private, loopback, link-local, CGNAT,
ULA, multicast or reserved ranges). Requests are fetched without following
redirects, and each redirect's Location is checked the same way before the
browser is allowed to follow it.
"""
from __future__ import annotations

import asyncio
import base64
import ipaddress
import json
import socket
import sys
from urllib.parse import urljoin, urlparse

_BLOCKED_NETS = [ipaddress.ip_network(n) for n in (
    "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
    "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16",
    "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
    "::/128", "::1/128", "::ffff:0:0/96", "64:ff9b::/96", "64:ff9b:1::/48", "100::/64",
    "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7", "fe80::/10", "fec0::/10", "ff00::/8",
)]


def ip_is_public(ip: ipaddress._BaseAddress) -> bool:
    # IPv4-mapped / 6to4 forms carry an IPv4 address: judge that too.
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return ip_is_public(ip.ipv4_mapped)
        if ip.sixtofour is not None:
            return ip_is_public(ip.sixtofour)
    if any(ip in net for net in _BLOCKED_NETS):
        return False
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast
                or ip.is_reserved or ip.is_unspecified)


async def url_is_public(url: str) -> bool:
    """http(s) URL whose host resolves only to public addresses."""
    try:
        p = urlparse(url)
        host = (p.hostname or "").rstrip(".")
        port = p.port or (443 if p.scheme == "https" else 80)
    except ValueError:
        return False
    if p.scheme not in ("http", "https") or not host:
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
        if not ip_is_public(ip):
            return False
    return True


async def install_request_guard(page) -> None:
    async def handler(route, request):
        url = request.url
        if url.startswith(("data:", "blob:", "about:")):
            await route.continue_()
            return
        if not await url_is_public(url):
            await route.abort("blockedbyclient")
            return
        try:
            response = await route.fetch(max_redirects=0, timeout=30000)
        except Exception:
            await route.abort("failed")
            return
        if 300 <= response.status < 400:
            location = response.headers.get("location")
            if location and not await url_is_public(urljoin(url, location)):
                await route.abort("blockedbyclient")
                return
        await route.fulfill(response=response)

    await page.route("**/*", handler)


async def capture(url: str) -> dict:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        # chromium_sandbox=True: Playwright disables the sandbox by default.
        browser = await p.chromium.launch(headless=True, chromium_sandbox=True)
        try:
            context = await browser.new_context(
                viewport={"width": 1440, "height": 900},
                user_agent="Fault-Line-Snapshot/0.2 (+https://fault-line.dev)",
                service_workers="block",  # keep every request visible to the guard
                accept_downloads=False,
            )
            page = await context.new_page()
            await install_request_guard(page)
            response = await page.goto(url, wait_until="networkidle", timeout=30_000)
            html = await page.content()
            png = await page.screenshot(full_page=True, type="png")
            return {
                "httpStatus": response.status if response else 0,
                "finalUrl": page.url,
                "html_base64": base64.b64encode(html.encode("utf-8")).decode("ascii"),
                "screenshot_base64": base64.b64encode(png).decode("ascii"),
            }
        finally:
            await browser.close()


def main() -> None:
    try:
        url = json.loads(sys.stdin.read())["url"]
        out = asyncio.run(capture(url))
    except Exception as exc:  # noqa: BLE001
        out = {"error": f"{type(exc).__name__}: {str(exc)[:300]}"}
    sys.stdout.write(json.dumps(out))


if __name__ == "__main__":
    main()
