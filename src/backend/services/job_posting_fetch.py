"""Load full job descriptions from employer posting pages.

Aggregator JSON APIs intentionally expose only short snippets (e.g. Adzuna search,
Jooble ``snippet``). The complete job description must be retrieved from the
posting URL the user opens in the browser.

This module performs SSRF-safe HTTP GET + main-content extraction (trafilatura),
with a BeautifulSoup fallback when extraction returns little text.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import re
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape as html_escape
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_MAX_BYTES = 3 * 1024 * 1024
_TIMEOUT_SEC = 28.0
_MIN_MEANINGFUL_CHARS = 280
_SKIP_FETCH_IF_TEXT_CHARS = 12_000  # already likely complete (e.g. LinkedIn API body)

_BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata",
        "kubernetes",
    }
)


class PostingFetchError(Exception):
    """Recoverable failure (blocked URL, HTTP error, empty extraction)."""


@dataclass(frozen=True)
class PostingFetchResult:
    description_html: str
    description_text: str
    application_closes_at: datetime | None = None
    accepts_applications: bool | None = None


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _json_ld_is_job_posting(types: Any) -> bool:
    if types == "JobPosting":
        return True
    if isinstance(types, list):
        return any(_json_ld_is_job_posting(x) for x in types)
    if isinstance(types, str) and "JobPosting" in types:
        return True
    return False


def _walk_json_ld(obj: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(obj, dict):
        if _json_ld_is_job_posting(obj.get("@type")):
            found.append(obj)
        for v in obj.values():
            found.extend(_walk_json_ld(v))
    elif isinstance(obj, list):
        for item in obj:
            found.extend(_walk_json_ld(item))
    return found


def extract_jobposting_schema_org_meta(html: str) -> tuple[datetime | None, bool | None]:
    """Parse schema.org JobPosting JSON-LD for validThrough (apply-by) and directApply."""
    soup = BeautifulSoup(html, "html.parser")
    closes: datetime | None = None
    direct_apply: bool | None = None

    for script in soup.find_all("script", attrs={"type": lambda t: t and "ld+json" in t}):
        raw = script.string or script.get_text() or ""
        raw = raw.strip()
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for jp in _walk_json_ld(data):
            vt = jp.get("validThrough") or jp.get("valid_through")
            if isinstance(vt, str):
                parsed = _parse_iso_datetime(vt)
                if parsed and (closes is None or parsed < closes):
                    closes = parsed
            da = jp.get("directApply")
            if isinstance(da, bool):
                if da is False:
                    direct_apply = False
                elif direct_apply is not False:
                    direct_apply = True
    return closes, direct_apply


def _is_safe_hostname(host: str) -> bool:
    h = (host or "").strip().lower()
    if not h:
        return False
    if h in _BLOCKED_HOSTNAMES:
        return False
    if h.endswith(".local") or h.endswith(".internal") or h.endswith(".localhost"):
        return False
    return True


def _assert_ips_public(hostname: str) -> None:
    """Reject hostnames that resolve to loopback, private, or link-local addresses."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise PostingFetchError(f"Could not resolve host: {exc}") from exc

    if not infos:
        raise PostingFetchError("Host resolves to no addresses")

    for info in infos:
        sockaddr = info[4]
        addr = sockaddr[0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if ip.version == 4:
            if not ip.is_global:
                raise PostingFetchError("URL resolves to a non-public IPv4 address")
        else:
            if (
                ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_private
                or ip.is_reserved
                or ip.is_unspecified
            ):
                raise PostingFetchError("URL resolves to a non-public IPv6 address")


def assert_fetchable_job_url(url: str, *, allow_http: bool = False) -> str:
    """Validate scheme/host and DNS; raises PostingFetchError if unsafe."""
    raw = (url or "").strip()
    if not raw:
        raise PostingFetchError("No job posting URL")

    parsed = urlparse(raw)
    if parsed.scheme not in ("https", "http"):
        raise PostingFetchError("URL must use http or https")

    if parsed.scheme == "http" and not allow_http:
        raise PostingFetchError("Only https URLs are allowed for job fetching")

    host = parsed.hostname
    if not host:
        raise PostingFetchError("URL has no hostname")

    if not _is_safe_hostname(host):
        raise PostingFetchError("Hostname is not allowed")

    try:
        ipaddress.ip_address(host)
        # Literal IP — must be globally routable
        ip = ipaddress.ip_address(host)
        if ip.version == 4:
            if not ip.is_global:
                raise PostingFetchError("Non-public IP address")
        elif not ip.is_global or ip.is_loopback:
            raise PostingFetchError("Non-public IP address")
    except ValueError:
        _assert_ips_public(host)

    return raw


def _bs4_fallback_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "template"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.body
    if main:
        text = main.get_text("\n", strip=True)
    else:
        text = soup.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _text_to_safe_paragraph_html(text: str) -> str:
    blocks = [b.strip() for b in text.split("\n\n") if b.strip()]
    if not blocks:
        return "<p></p>"
    parts: list[str] = []
    for b in blocks:
        inner = html_escape(b).replace("\n", "<br/>")
        parts.append(f"<p>{inner}</p>")
    return "".join(parts)


def extract_main_content_from_html(html: str, page_url: str) -> tuple[str, str]:
    """Return (description_html, description_text) for storage and tailoring."""
    import trafilatura  # heavy deps; import on use

    html_piece = trafilatura.extract(
        html,
        url=page_url,
        output_format="html",
        include_tables=True,
        include_links=False,
        favor_precision=True,
    )
    txt_piece = trafilatura.extract(
        html,
        url=page_url,
        output_format="txt",
        include_tables=True,
        favor_recall=True,
    )

    plain = (txt_piece or "").strip()
    if html_piece and len(plain) >= _MIN_MEANINGFUL_CHARS:
        return html_piece.strip(), plain[:50000]

    if plain and len(plain) >= _MIN_MEANINGFUL_CHARS:
        return _text_to_safe_paragraph_html(plain), plain[:50000]

    fb = _bs4_fallback_text(html)
    if fb and len(fb) >= _MIN_MEANINGFUL_CHARS:
        return _text_to_safe_paragraph_html(fb), fb[:50000]

    raise PostingFetchError(
        "Could not extract a full job description from the page "
        "(content may be loaded by JavaScript or blocked for automated access).",
    )


async def fetch_posting_description(
    url: str,
    *,
    allow_http: bool = False,
) -> PostingFetchResult:
    """Download URL, extract main job description + schema.org apply-by when present."""
    safe_url = assert_fetchable_job_url(url, allow_http=allow_http)

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; MeridianCareers/1.0; "
            "+https://github.com/meridian-careers; job-description-fetch)"
        ),
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    def _sync_get() -> tuple[str, str]:
        with httpx.Client(
            timeout=_TIMEOUT_SEC,
            follow_redirects=True,
            max_redirects=10,
            headers=headers,
        ) as client:
            resp = client.get(safe_url)
            resp.raise_for_status()
            final = str(resp.url)
            # Re-validate final URL after redirects (SSRF)
            assert_fetchable_job_url(final, allow_http=allow_http)
            data = resp.content
            if len(data) > _MAX_BYTES:
                raise PostingFetchError("Posting page is too large")
            charset = resp.encoding or "utf-8"
            html = data.decode(charset, errors="replace")
            return html, final

    try:
        page_html, final_url = await asyncio.to_thread(_sync_get)
    except httpx.HTTPStatusError as exc:
        raise PostingFetchError(
            f"Posting returned HTTP {exc.response.status_code}",
        ) from exc
    except httpx.RequestError as exc:
        raise PostingFetchError(f"Could not load posting: {exc}") from exc
    except PostingFetchError:
        raise
    except Exception as exc:
        logger.exception("Unexpected error fetching job posting")
        raise PostingFetchError(str(exc)) from exc

    desc_html, desc_text = extract_main_content_from_html(page_html, final_url)
    closes_at, direct_apply = extract_jobposting_schema_org_meta(page_html)
    return PostingFetchResult(
        description_html=desc_html,
        description_text=desc_text,
        application_closes_at=closes_at,
        accepts_applications=direct_apply,
    )


def should_skip_url_fetch(existing_text: str | None, *, force: bool) -> bool:
    if force:
        return False
    t = (existing_text or "").strip()
    return len(t) >= _SKIP_FETCH_IF_TEXT_CHARS
