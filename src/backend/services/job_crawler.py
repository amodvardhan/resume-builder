from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urljoin, urlunparse

import httpx
from bs4 import BeautifulSoup, Tag
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import settings
from src.backend.database import async_session_factory
from src.backend.job_sources import SourceConfig
from src.backend.models import CrawledJob, CrawlRun, JobPreference
from src.backend.services.crawl_sources_service import resolve_crawl_source_pairs

logger = logging.getLogger(__name__)

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
_HTTP_TIMEOUT = 45.0
_MAX_NETWORK_RETRIES = 3
_BACKOFF_BASE = 2
_MAX_429_RETRIES = 5

_HTML_FETCH_HEADERS: dict[str, str] = {
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}


def _dedupe_source_url_pairs(
    pairs: list[tuple[SourceConfig, str]],
) -> list[tuple[SourceConfig, str]]:
    """One fetch per (source, URL); duplicates come from repeated roles/locations."""
    seen: set[tuple[str, str]] = set()
    out: list[tuple[SourceConfig, str]] = []
    for sc, url in pairs:
        key = (sc.name, url)
        if key in seen:
            continue
        seen.add(key)
        out.append((sc, url))
    return out


def _prepare_crawl_url(source: SourceConfig, url: str) -> str | None:
    """Return URL to fetch, or None to skip (e.g. Adzuna without API keys)."""
    if source.name == "adzuna":
        if not (settings.adzuna_app_id and settings.adzuna_app_key):
            logger.warning(
                "Skipping adzuna: configure APP_ADZUNA_APP_ID and APP_ADZUNA_APP_KEY",
            )
            return None
        parsed = urlparse(url)
        if "adzuna.com" not in parsed.netloc:
            return url
        q = dict(parse_qsl(parsed.query, keep_blank_values=True))
        q["app_id"] = settings.adzuna_app_id
        q["app_key"] = settings.adzuna_app_key
        return urlunparse(parsed._replace(query=urlencode(q)))
    return url


def _parse_retry_after_seconds(header_val: str | None) -> float | None:
    if not header_val:
        return None
    try:
        return min(120.0, float(header_val.strip()))
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def run_crawl_for_user(user_id: uuid.UUID) -> uuid.UUID:
    """Execute a full crawl pipeline for the given user and return the CrawlRun id."""

    async with async_session_factory() as session:
        pref = (
            await session.execute(
                select(JobPreference).where(JobPreference.user_id == user_id)
            )
        ).scalar_one_or_none()

        if pref is None:
            run = CrawlRun(
                user_id=user_id,
                status="failed",
                jobs_found=0,
                jobs_new=0,
                started_at=datetime.now(timezone.utc),
                finished_at=datetime.now(timezone.utc),
                error_message="No job preferences configured",
            )
            session.add(run)
            await session.commit()
            return run.id

        run = CrawlRun(
            user_id=user_id,
            status="running",
            jobs_found=0,
            jobs_new=0,
            started_at=datetime.now(timezone.utc),
        )
        session.add(run)
        await session.commit()
        crawl_run_id: uuid.UUID = run.id

        try:
            def _as_list(v: object) -> list[str]:
                if v is None:
                    return []
                if isinstance(v, list):
                    return [str(x) for x in v]
                return []

            raw_pairs = await resolve_crawl_source_pairs(
                session=session,
                industry=pref.industry or "",
                role_categories=_as_list(pref.role_categories),
                locations=_as_list(pref.preferred_locations),
                keywords=_as_list(pref.keywords),
            )
            sources = _dedupe_source_url_pairs(raw_pairs)

            rc = pref.role_categories
            role_cat = str(rc[0]) if isinstance(rc, list) and rc else ""

            all_jobs: list[dict[str, Any]] = []
            for source_config, url in sources:
                try:
                    jobs = await _fetch_and_parse(
                        source=source_config,
                        url=url,
                        industry=pref.industry or "",
                        role_category=role_cat,
                    )
                    all_jobs.extend(jobs)
                except Exception:
                    logger.exception(
                        "Unexpected error fetching %s", source_config.name,
                    )
                await asyncio.sleep(source_config.rate_limit_seconds)

            jobs_found = len(all_jobs)
            jobs_new = await _deduplicate_and_insert(session, all_jobs)

            run = await session.get(CrawlRun, crawl_run_id)
            if run is not None:
                run.jobs_found = jobs_found
                run.jobs_new = jobs_new
                run.status = "completed"
                run.finished_at = datetime.now(timezone.utc)
            await session.commit()

            if jobs_new > 0:
                try:
                    from src.backend.services.job_matcher import score_new_matches

                    await score_new_matches(user_id)
                except Exception:
                    logger.exception(
                        "Post-crawl match scoring failed for user %s", user_id,
                    )

        except Exception as exc:
            logger.exception("Crawl failed for user %s", user_id)
            run = await session.get(CrawlRun, crawl_run_id)
            if run is not None:
                run.status = "failed"
                run.error_message = str(exc)[:2000]
                run.finished_at = datetime.now(timezone.utc)
            await session.commit()

        return crawl_run_id


# ---------------------------------------------------------------------------
# Fetch + parse
# ---------------------------------------------------------------------------


async def _fetch_and_parse(
    source: SourceConfig,
    url: str,
    industry: str,
    role_category: str,
) -> list[dict[str, Any]]:
    """Fetch a single source URL and return a list of job dicts."""

    prepared = _prepare_crawl_url(source, url)
    if prepared is None:
        return []

    headers: dict[str, str] = {"User-Agent": _USER_AGENT}
    if source.source_type == "html_scraper":
        headers.update(_HTML_FETCH_HEADERS)
    if source.headers:
        headers.update(source.headers)

    body = ""
    attempt_429 = 0
    attempt_network = 0
    attempt_5xx = 0

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        while True:
            try:
                resp = await client.get(
                    prepared, headers=headers, follow_redirects=True,
                )
            except httpx.RequestError as exc:
                attempt_network += 1
                if attempt_network >= _MAX_NETWORK_RETRIES:
                    logger.warning(
                        "Source %s: network error after %d attempts — %s",
                        source.name, attempt_network, exc,
                    )
                    return []
                wait = _BACKOFF_BASE ** attempt_network
                logger.debug(
                    "Source %s network retry %s in %ss",
                    source.name, attempt_network, wait,
                )
                await asyncio.sleep(wait)
                continue

            if resp.status_code == 429:
                attempt_429 += 1
                if attempt_429 > _MAX_429_RETRIES:
                    logger.warning(
                        "Source %s: HTTP 429 too many times, giving up",
                        source.name,
                    )
                    return []
                wait = _parse_retry_after_seconds(
                    resp.headers.get("Retry-After"),
                ) or min(90.0, float(_BACKOFF_BASE ** min(attempt_429 + 2, 6)))
                logger.warning(
                    "Source %s rate-limited (429), waiting %.0fs (%d/%d)",
                    source.name, wait, attempt_429, _MAX_429_RETRIES,
                )
                await asyncio.sleep(wait)
                continue

            if resp.status_code in (401, 403, 404):
                logger.warning(
                    "Source %s: HTTP %s — not fetching this URL",
                    source.name,
                    resp.status_code,
                )
                return []

            if 500 <= resp.status_code < 600:
                attempt_5xx += 1
                if attempt_5xx >= 4:
                    logger.warning(
                        "Source %s: HTTP %s after server retries",
                        source.name,
                        resp.status_code,
                    )
                    return []
                wait = _BACKOFF_BASE ** min(attempt_5xx, 4)
                await asyncio.sleep(wait)
                continue

            if resp.status_code >= 400:
                logger.warning(
                    "Source %s: HTTP %s — skipping",
                    source.name,
                    resp.status_code,
                )
                return []

            body = resp.text
            break

    now = datetime.now(timezone.utc)
    jobs: list[dict[str, Any]]

    if source.source_type == "html_scraper":
        jobs = _extract_from_html(
            html=body,
            selectors=source.selectors,
            source_name=source.name,
            base_url=prepared,
        )
    elif source.source_type == "api":
        try:
            data: Any = json.loads(body)
        except json.JSONDecodeError:
            logger.warning(
                "Source %s: response is not valid JSON",
                source.name,
            )
            return []
        jobs = _extract_from_api(data=data, source_name=source.name)
    elif source.source_type == "rss":
        jobs = _extract_from_rss(xml_text=body, source_name=source.name)
    else:
        logger.warning("Unknown source type %r for %s", source.source_type, source.name)
        return []

    for job in jobs:
        job.setdefault("industry", industry)
        job.setdefault("role_category", role_category)
        job.setdefault("scraped_at", now)
        job.setdefault("source_name", source.name)

    return jobs


# ---------------------------------------------------------------------------
# HTML extraction
# ---------------------------------------------------------------------------


def _extract_from_html(
    html: str,
    selectors: dict[str, str],
    source_name: str,
    base_url: str,
) -> list[dict[str, Any]]:
    """Parse an HTML page using CSS selectors from the source config."""

    soup = BeautifulSoup(html, "html.parser")
    card_selector = selectors.get("job_card", "")
    if not card_selector:
        logger.warning("No job_card selector for source %s", source_name)
        return []

    cards = soup.select(card_selector)
    results: list[dict[str, Any]] = []

    for card in cards:
        if not isinstance(card, Tag):
            continue

        title = _select_text(card, selectors.get("title", ""))
        if not title:
            continue

        company = _select_text(card, selectors.get("company", ""))
        location = _select_text(card, selectors.get("location", ""))
        desc_html = _select_html(card, selectors.get("description", ""))
        desc_text = _html_to_text(desc_html) if desc_html else ""
        link = _select_attr(card, selectors.get("link", ""), "href")

        if link:
            link = urljoin(base_url, link)

        external_id = hashlib.sha256((link or title).encode()).hexdigest()[:32]

        results.append(
            {
                "source_name": source_name,
                "external_id": external_id,
                "title": title[:512],
                "organization": (company or None),
                "location": (location or None),
                "description_html": desc_html or None,
                "description_text": desc_text or title,
                "url": link or None,
                "salary_range": None,
                "posted_at": None,
                "raw_data": None,
            }
        )

    return results


def _select_text(tag: Tag, selector: str) -> str:
    if not selector:
        return ""
    el = tag.select_one(selector)
    return el.get_text(strip=True) if el else ""


def _select_html(tag: Tag, selector: str) -> str:
    if not selector:
        return ""
    el = tag.select_one(selector)
    return str(el) if el else ""


def _select_attr(tag: Tag, selector: str, attr: str) -> str:
    if not selector:
        return ""
    el = tag.select_one(selector)
    if el is None:
        return ""
    val = el.get(attr, "")
    if isinstance(val, list):
        return val[0] if val else ""
    return val or ""


# ---------------------------------------------------------------------------
# API extraction
# ---------------------------------------------------------------------------


def _extract_from_api(
    data: dict[str, Any] | list[Any],
    source_name: str,
) -> list[dict[str, Any]]:
    """Handle JSON API responses from common job-board providers."""

    items: list[dict[str, Any]]
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = (
            data.get("results")
            or data.get("jobs")
            or data.get("data")
            or data.get("listings")
            or []
        )
        if isinstance(items, dict):
            items = [items]
    else:
        return []

    results: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue

        title = (
            item.get("title")
            or item.get("position")
            or item.get("job_title")
            or ""
        )
        if not title:
            continue

        company = (
            item.get("company")
            or item.get("company_name")
            or item.get("organization")
            or item.get("employer", {}).get("display_name")
        )
        location_val = (
            item.get("location")
            or item.get("candidate_required_location")
            or item.get("job_location")
        )
        if isinstance(location_val, dict):
            location_val = location_val.get("display_name", str(location_val))

        desc_html = (
            item.get("description")
            or item.get("description_html")
            or item.get("body")
            or ""
        )
        desc_text = _html_to_text(desc_html) if desc_html else title

        url_val = (
            item.get("url")
            or item.get("redirect_url")
            or item.get("apply_url")
            or item.get("link")
        )
        salary = (
            item.get("salary_range")
            or item.get("salary")
            or item.get("salary_string")
        )
        if isinstance(salary, dict):
            salary = f"{salary.get('min', '')} - {salary.get('max', '')}"
        if salary:
            salary = str(salary)[:255]

        ext_id = str(
            item.get("id")
            or item.get("external_id")
            or item.get("slug")
            or hashlib.sha256((str(url_val or title)).encode()).hexdigest()[:32]
        )

        posted_raw = item.get("date") or item.get("posted_at") or item.get("created_at")
        posted_at = _parse_datetime(posted_raw) if posted_raw else None

        results.append(
            {
                "source_name": source_name,
                "external_id": ext_id[:1024],
                "title": str(title)[:512],
                "organization": str(company)[:512] if company else None,
                "location": str(location_val)[:512] if location_val else None,
                "description_html": desc_html or None,
                "description_text": desc_text or title,
                "url": str(url_val)[:2048] if url_val else None,
                "salary_range": salary or None,
                "posted_at": posted_at,
                "raw_data": item,
            }
        )

    return results


# ---------------------------------------------------------------------------
# RSS extraction
# ---------------------------------------------------------------------------


def _extract_from_rss(xml_text: str, source_name: str) -> list[dict[str, Any]]:
    """Parse RSS or Atom feed entries into job dicts."""

    results: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        logger.warning("Failed to parse RSS/XML for source %s", source_name)
        return []

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    items = root.findall(".//item")
    if not items:
        items = root.findall(".//atom:entry", ns)

    for item in items:
        title = _xml_text(item, "title") or _xml_text(item, "atom:title", ns)
        if not title:
            continue

        link = _xml_text(item, "link") or _xml_attr(item, "atom:link", "href", ns) or ""
        desc_html = (
            _xml_text(item, "description")
            or _xml_text(item, "content:encoded")
            or _xml_text(item, "atom:content", ns)
            or _xml_text(item, "atom:summary", ns)
            or ""
        )
        desc_text = _html_to_text(desc_html) if desc_html else title

        pub_date = (
            _xml_text(item, "pubDate")
            or _xml_text(item, "atom:published", ns)
            or _xml_text(item, "atom:updated", ns)
        )
        posted_at = _parse_datetime(pub_date) if pub_date else None

        guid = _xml_text(item, "guid") or _xml_text(item, "atom:id", ns) or ""
        external_id = guid or hashlib.sha256((link or title).encode()).hexdigest()[:32]

        results.append(
            {
                "source_name": source_name,
                "external_id": str(external_id)[:1024],
                "title": title[:512],
                "organization": None,
                "location": None,
                "description_html": desc_html or None,
                "description_text": desc_text or title,
                "url": link or None,
                "salary_range": None,
                "posted_at": posted_at,
                "raw_data": None,
            }
        )

    return results


def _xml_text(
    element: ET.Element,
    tag: str,
    namespaces: dict[str, str] | None = None,
) -> str:
    child = element.find(tag, namespaces or {})
    if child is not None and child.text:
        return child.text.strip()
    return ""


def _xml_attr(
    element: ET.Element,
    tag: str,
    attr: str,
    namespaces: dict[str, str] | None = None,
) -> str:
    child = element.find(tag, namespaces or {})
    if child is not None:
        return child.get(attr, "")
    return ""


# ---------------------------------------------------------------------------
# Deduplication + insert
# ---------------------------------------------------------------------------


async def _deduplicate_and_insert(
    session: AsyncSession,
    jobs: list[dict[str, Any]],
) -> int:
    """Insert jobs using ON CONFLICT DO NOTHING. Returns count of newly inserted rows."""

    if not jobs:
        return 0

    new_count = 0
    for job in jobs:
        stmt = (
            pg_insert(CrawledJob.__table__)
            .values(
                id=uuid.uuid4(),
                source_name=job["source_name"],
                external_id=job["external_id"],
                title=job["title"],
                organization=job.get("organization"),
                location=job.get("location"),
                description_html=job.get("description_html"),
                description_text=job.get("description_text", job["title"]),
                url=job.get("url"),
                salary_range=job.get("salary_range"),
                posted_at=job.get("posted_at"),
                scraped_at=job.get("scraped_at", datetime.now(timezone.utc)),
                industry=job.get("industry"),
                role_category=job.get("role_category"),
                raw_data=job.get("raw_data"),
                created_at=datetime.now(timezone.utc),
            )
            .on_conflict_do_nothing(
                constraint="uq_crawled_jobs_source_external",
            )
        )
        result = await session.execute(stmt)
        if result.rowcount:
            new_count += result.rowcount

    await session.commit()
    return new_count


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _html_to_text(html: str) -> str:
    """Strip HTML tags and collapse whitespace into readable plain text."""

    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")

    for br in soup.find_all("br"):
        br.replace_with("\n")
    for tag in soup.find_all(["p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6"]):
        tag.insert_before("\n")
        tag.insert_after("\n")

    text = soup.get_text()
    text = re.sub(r"[^\S\n]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _parse_datetime(value: Any) -> datetime | None:
    """Best-effort parse of various datetime string formats."""

    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None

    formats = [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S %z",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue

    logger.debug("Could not parse datetime: %r", value)
    return None
