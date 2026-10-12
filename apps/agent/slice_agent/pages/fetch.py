"""Fetching merchant websites without becoming an SSRF proxy.

The URL comes from a signed-in merchant, but it is still untrusted: it could
point at localhost, a cloud metadata endpoint or a private network. Every hop
(including redirects) is resolved and every address must be public; the peer
address of the actual connection is checked again to close the DNS-rebinding
gap. Responses are size- and time-capped.
"""

from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

import httpx

MAX_REDIRECTS = 4
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
USER_AGENT = "Mozilla/5.0 (compatible; SliceBot/1.0; +https://github.com/slice) brand-kit-reader"

# Local development against the demo stores (localhost:3002). Never set in production.
ALLOW_PRIVATE = os.environ.get("PAGES_ALLOW_PRIVATE_HOSTS", "").lower() in ("1", "true", "yes")


class FetchError(Exception):
    pass


@dataclass
class Fetched:
    url: str
    status: int
    content_type: str
    body: bytes

    @property
    def text(self) -> str:
        charset = "utf-8"
        if "charset=" in self.content_type:
            charset = self.content_type.split("charset=")[-1].split(";")[0].strip() or "utf-8"
        try:
            return self.body.decode(charset, errors="replace")
        except LookupError:
            return self.body.decode("utf-8", errors="replace")


def _public(ip: str) -> bool:
    addr = ipaddress.ip_address(ip.split("%")[0])
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return addr.is_global and not addr.is_multicast


async def _check_host(host: str, port: int) -> None:
    if ALLOW_PRIVATE:
        return
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as err:
        raise FetchError(f"Couldn't find {host}") from err
    addrs = {info[4][0] for info in infos}
    if not addrs or not all(_public(a) for a in addrs):
        raise FetchError(f"{host} isn't a public address")


def _validate(url: str) -> tuple[str, int]:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise FetchError("Only http(s) addresses can be read")
    if not parts.hostname or parts.username or parts.password:
        raise FetchError("That doesn't look like a web address")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if not ALLOW_PRIVATE and port not in (80, 443):
        raise FetchError("Only standard web ports can be read")
    return parts.hostname, port


_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=TIMEOUT,
            follow_redirects=False,
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            # No env proxies: a proxy would make the peer-address check meaningless.
            trust_env=False,
        )
    return _client


async def fetch(url: str, *, max_bytes: int = 2_000_000, accept: tuple[str, ...] = ("text/html",)) -> Fetched:
    """GET a public URL, following up to MAX_REDIRECTS redirects, each re-validated."""
    for _ in range(MAX_REDIRECTS + 1):
        host, port = _validate(url)
        await _check_host(host, port)
        async with _http().stream("GET", url) as res:
            peer = _peer(res)
            if peer and not ALLOW_PRIVATE and not _public(peer):
                raise FetchError(f"{host} isn't a public address")
            if res.status_code in (301, 302, 303, 307, 308):
                location = res.headers.get("location")
                if not location:
                    raise FetchError("Redirect without a location")
                url = urljoin(url, location)
                continue
            if res.status_code >= 400:
                raise FetchError(f"{host} answered {res.status_code}")
            ctype = res.headers.get("content-type", "").lower()
            if accept and not any(a in ctype for a in accept):
                raise FetchError(f"Not a web page ({ctype or 'unknown type'})")
            chunks: list[bytes] = []
            size = 0
            async for chunk in res.aiter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    break
                chunks.append(chunk)
            return Fetched(url=str(res.url), status=res.status_code, content_type=ctype, body=b"".join(chunks))
    raise FetchError("Too many redirects")


def _peer(res: httpx.Response) -> str | None:
    stream = res.extensions.get("network_stream")
    if stream is None:
        return None
    try:
        addr = stream.get_extra_info("server_addr")
    except Exception:
        return None
    return addr[0] if addr else None
