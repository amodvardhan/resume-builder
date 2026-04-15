"""
UNjobs.org helpers for IO RSS ingestion.

RSS feeds may emit ``<item>`` links to listing hubs (``/New/N``) instead of per-vacancy URLs.
We optionally fetch those pages and expand to ``/vacancies/<id>`` items. Listing pages are
often behind Cloudflare; when no vacancy links appear in HTML, hub items are skipped (not stored
as fake jobs). Prefer RSS sources that emit one ``<item>`` per vacancy (``/vacancies/…``).
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from src.backend.services.io_job_rss import IoRssItem
from src.backend.services.job_posting_fetch import PostingFetchError, assert_fetchable_job_url

logger = logging.getLogger(__name__)

_UNJOBS_NEW_HUB = re.compile(
    r"^https?://(?:www\.)?unjobs\.org/New/\d+/?$",
    re.IGNORECASE,
)
_UNJOBS_VAC_PATH = re.compile(r"/vacancies/(\d+)", re.IGNORECASE)


def is_unjobs_new_hub_url(url: str) -> bool:
    return bool(url and _UNJOBS_NEW_HUB.search(url.strip()))


def extract_unjobs_vacancy_links(html: str, page_url: str) -> list[tuple[str, str]]:
    """
    Parse HTML for ``unjobs.org/vacancies/<id>`` links.

    Returns (canonical_https_url, anchor_text_or_empty) in document order, deduplicated.
    """
    soup = BeautifulSoup(html, "html.parser")
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if "/vacancies/" not in href:
            continue
        if not _UNJOBS_VAC_PATH.search(href):
            continue
        raw = urljoin(page_url, href.split("#")[0])
        canon = re.sub(
            r"^https?://www\.unjobs\.org",
            "https://unjobs.org",
            raw,
            flags=re.IGNORECASE,
        )
        canon = canon.split("?")[0]
        if canon in seen:
            continue
        seen.add(canon)
        tit = (a.get_text() or "").strip()
        out.append((canon, tit))

    if out:
        return out

    for m in re.finditer(
        r"https?://(?:www\.)?unjobs\.org/vacancies/(\d+)",
        html,
        re.IGNORECASE,
    ):
        vid = m.group(1)
        u = f"https://unjobs.org/vacancies/{vid}"
        if u not in seen:
            seen.add(u)
            out.append((u, ""))
    return out


async def expand_unjobs_hub_items(
    client: httpx.AsyncClient,
    items: list[IoRssItem],
    *,
    enabled: bool,
    max_per_hub: int,
) -> list[IoRssItem]:
    """
    Replace ``/New/N`` hub items with synthetic per-vacancy ``IoRssItem`` rows when possible.

    If expansion is disabled, hub items are dropped. If fetch or parsing yields no vacancies
    (common with Cloudflare bot challenges), hub items are dropped and a warning is logged.
    """
    if not items:
        return []

    if not enabled:
        dropped = sum(1 for it in items if is_unjobs_new_hub_url(it.link or ""))
        if dropped:
            logger.info(
                "UNjobs hub URLs skipped (%d items) — io_job_unjobs_expand_hubs=false",
                dropped,
            )
        return [it for it in items if not is_unjobs_new_hub_url(it.link or "")]

    out: list[IoRssItem] = []
    seen_vacancy_urls: set[str] = set()

    for it in items:
        link = (it.link or "").strip()
        if not is_unjobs_new_hub_url(link):
            out.append(it)
            continue

        try:
            assert_fetchable_job_url(link)
        except PostingFetchError as e:
            logger.warning("Skip UNjobs hub (URL check): %s — %s", link, e)
            continue

        try:
            response = await client.get(link)
            response.raise_for_status()
        except Exception as e:
            logger.warning("UNjobs hub fetch failed %s: %s", link, e)
            continue

        pairs = extract_unjobs_vacancy_links(response.text, link)
        if not pairs:
            logger.warning(
                "UNjobs hub page produced no vacancy links (often Cloudflare or layout). "
                "Use an RSS feed with one <item> per vacancy (…/vacancies/<id>). Skipping: %s",
                link,
            )
            continue

        for vac_url, vtitle in pairs[:max_per_hub]:
            if vac_url in seen_vacancy_urls:
                continue
            seen_vacancy_urls.add(vac_url)
            title = (vtitle or it.title or "UNjobs vacancy").strip()[:512] or "UNjobs vacancy"
            out.append(
                IoRssItem(
                    title=title,
                    link=vac_url,
                    guid=f"unjobs-hub:{link}:{vac_url}",
                    pub_date=it.pub_date,
                ),
            )

    return out
