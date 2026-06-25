"""
Web scraper service — fetches pages and structures content into knowledge documents.

Flow:
  1. Fetch main URL (+ internal links if follow_links=True)
  2. Extract clean text per page with BeautifulSoup
  3. If api_key is provided: send all pages to Claude → structured JSON docs
  4. Otherwise: return raw per-page documents
"""
import json
import logging
import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; Alamex-KnowledgeBot/1.0; +https://alamex.mx)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
}
TIMEOUT = 15
MAX_TEXT_PER_PAGE = 4000


# ── Fetching ──────────────────────────────────────────────────────

def _fetch(url: str) -> str | None:
    # SSRF guard: reject internal/non-public targets before fetching, and
    # again after any redirects (a public host can 30x to an internal IP).
    from integrations.services.net_safety import url_safety_error
    reason = url_safety_error(url, require_https=False)
    if reason:
        logger.warning('[Scraper] Blocked unsafe URL %s: %s', url, reason)
        return None
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        resp.raise_for_status()
        if resp.url != url and url_safety_error(resp.url, require_https=False):
            logger.warning('[Scraper] Blocked redirect to unsafe URL %s', resp.url)
            return None
        ct = resp.headers.get('content-type', '')
        if 'text/html' not in ct:
            return None
        return resp.text
    except Exception as exc:
        logger.warning('[Scraper] Could not fetch %s: %s', url, exc)
        return None


# ── Extraction ────────────────────────────────────────────────────

_JUNK_TAGS = ['script', 'style', 'nav', 'footer', 'header', 'aside',
               'form', 'iframe', 'noscript', 'svg', 'img', 'button', 'input']


def _extract(html: str) -> tuple[str, str]:
    """Returns (title, clean_text)."""
    soup = BeautifulSoup(html, 'html.parser')

    for tag in soup(_JUNK_TAGS):
        tag.decompose()

    # Best title
    title_tag = soup.find('h1') or soup.find('title')
    page_title = title_tag.get_text(strip=True) if title_tag else 'Página'

    # Best content container
    main = (
        soup.find('main') or
        soup.find('article') or
        soup.find(id=re.compile(r'content|main|body', re.I)) or
        soup.find(class_=re.compile(r'content|main|page', re.I)) or
        soup.body or soup
    )

    text = main.get_text(separator='\n', strip=True)
    lines = [l.strip() for l in text.splitlines() if l.strip() and len(l.strip()) > 3]
    clean = '\n'.join(lines)

    return page_title, clean[:MAX_TEXT_PER_PAGE]


def _internal_links(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, 'html.parser')
    domain = urlparse(base_url).netloc
    seen = {base_url.rstrip('/')}
    links = []
    for a in soup.find_all('a', href=True):
        href = urljoin(base_url, a['href']).split('#')[0].split('?')[0].rstrip('/')
        parsed = urlparse(href)
        if parsed.netloc == domain and href not in seen and parsed.scheme in ('http', 'https'):
            seen.add(href)
            links.append(href)
    return links


# ── Claude structuring ────────────────────────────────────────────

def _structure_with_claude(pages: list[dict], api_key: str) -> list[dict]:
    import anthropic

    content_block = '\n\n---\n\n'.join(
        f"PÁGINA: {p['title']}\nURL: {p['url']}\n\n{p['text']}"
        for p in pages
    )

    prompt = (
        "Analiza el siguiente contenido de un sitio web empresarial y organízalo en "
        "documentos de base de conocimiento claros y útiles para un agente de atención al cliente.\n\n"
        f"CONTENIDO DEL SITIO:\n{content_block}\n\n"
        "Crea entre 4 y 10 documentos de conocimiento que cubran los temas más importantes: "
        "quiénes son, qué venden, precios, servicios, cobertura, contacto, preguntas frecuentes, etc.\n"
        "Cada documento debe tener un título descriptivo y contenido completo y útil.\n\n"
        "Devuelve SOLO un array JSON con este formato exacto (sin markdown, sin explicación):\n"
        '[{"title": "...", "content": "..."}, ...]'
    )

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=4096,
            messages=[{'role': 'user', 'content': prompt}],
        )
        text = response.content[0].text.strip()
        start, end = text.find('['), text.rfind(']') + 1
        if start >= 0 and end > start:
            docs = json.loads(text[start:end])
            return [d for d in docs if d.get('title') and d.get('content')]
    except Exception as exc:
        logger.error('[Scraper] Claude structuring failed: %s', exc)

    return []


# ── Public API ────────────────────────────────────────────────────

def _resolve_api_key(api_key: str) -> str:
    """Return provided key, falling back to the platform master key."""
    key = (api_key or '').strip()
    if key and key != '••••••••':
        return key
    try:
        from django.conf import settings
        return getattr(settings, 'ANTHROPIC_API_KEY', '') or ''
    except Exception:
        return ''


def scrape_website(
    url: str,
    follow_links: bool = False,
    max_pages: int = 5,
    api_key: str = '',
) -> dict:
    """
    Scrape a website and return structured knowledge documents.

    Returns:
        {
            "pages_scraped": int,
            "documents": [{"title": str, "content": str}],
            "ai_structured": bool,
            "error": str | None,
        }
    """
    url = url.strip().rstrip('/')
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    html = _fetch(url)
    if not html:
        return {
            'pages_scraped': 0, 'documents': [], 'ai_structured': False,
            'error': f'No se pudo acceder a {url}. Verifica que la URL sea correcta y el sitio esté en línea.',
        }

    title, text = _extract(html)
    pages = [{'url': url, 'title': title, 'text': text}]

    if follow_links:
        links = _internal_links(html, url)[: max_pages - 1]
        for link in links:
            link_html = _fetch(link)
            if link_html:
                ltitle, ltext = _extract(link_html)
                if len(ltext) > 150:
                    pages.append({'url': link, 'title': ltitle, 'text': ltext})

    # Try Claude structuring using master key (or caller-provided key)
    api_key = _resolve_api_key(api_key)
    if api_key:
        docs = _structure_with_claude(pages, api_key.strip())
        if docs:
            return {'pages_scraped': len(pages), 'documents': docs, 'ai_structured': True, 'error': None}

    # Raw fallback — one document per page
    docs = [
        {'title': p['title'], 'content': p['text']}
        for p in pages
        if len(p['text']) > 100
    ]
    return {'pages_scraped': len(pages), 'documents': docs, 'ai_structured': False, 'error': None}
