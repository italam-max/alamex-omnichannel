"""
Shared SSRF guard for any server-side outbound fetch (webhooks, scraper).

`url_safety_error` resolves the host and rejects anything pointing at a
non-public address (loopback, private, link-local/metadata, reserved…), an
unsupported scheme, or a domain outside an optional allowlist.
"""
import ipaddress
import socket
from urllib.parse import urlparse


def url_safety_error(url: str, *, require_https: bool = True, allowlist: str = '') -> str | None:
    """Return a human-readable reason if `url` is unsafe to fetch, else None."""
    parsed = urlparse((url or '').strip())
    scheme = parsed.scheme.lower()

    if require_https:
        if scheme != 'https':
            return 'Debe usar HTTPS.'
    elif scheme not in ('http', 'https'):
        return 'Esquema de URL no permitido.'

    host = parsed.hostname
    if not host:
        return 'URL inválida.'

    allowed = [d.strip().lower() for d in (allowlist or '').split(',') if d.strip()]
    if allowed and not any(host.lower() == d or host.lower().endswith('.' + d) for d in allowed):
        return 'El dominio no está en la lista permitida.'

    port = parsed.port or (443 if scheme == 'https' else 80)
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return 'No se pudo resolver el dominio.'

    for *_, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return 'El destino apunta a una dirección interna.'
    return None


def is_safe_public_url(url: str, *, require_https: bool = True, allowlist: str = '') -> bool:
    return url_safety_error(url, require_https=require_https, allowlist=allowlist) is None
