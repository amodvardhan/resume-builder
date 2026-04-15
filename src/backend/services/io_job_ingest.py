"""
Fetch allowlisted RSS feeds, parse items, and upsert ``IoJobListing`` rows.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import io_job_rss_allowlist, settings
from src.backend.database import async_session_factory
from src.backend.models import IoJobIngestMeta, IoJobListing
from src.backend.services.io_job_rss import (
    infer_io_feed_source_label,
    infer_io_job_family,
    parse_rss_items,
    parse_rss_pub_date,
)
from src.backend.services.io_job_unjobs import expand_unjobs_hub_items

logger = logging.getLogger(__name__)

_INGEST_SINGLETON_KEY = "default"
_DEFAULT_UA = "MeridianIOCareers/1.0 (+https://github.com; IO RSS poller)"


def _dedupe_key(feed_url: str, guid: str | None, link: str) -> str:
    part = (guid or "").strip() or (link or "").strip()
    raw = f"{feed_url}\n{part}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass
class IoIngestResult:
    feeds_polled: int = 0
    items_upserted: int = 0
    feed_errors: list[str] = field(default_factory=list)


async def run_io_job_rss_ingest() -> IoIngestResult:
    """Poll every allowlisted feed and upsert listings."""
    feeds = io_job_rss_allowlist()
    result = IoIngestResult()

    if not feeds:
        logger.info("IO job RSS ingest skipped — no APP_IO_JOB_RSS_URLS")
        async with async_session_factory() as sess:
            await _write_meta(
                sess,
                datetime.now(timezone.utc),
                "No feeds configured",
            )
            await sess.commit()
        return result

    async with async_session_factory() as session:
        return await _run_ingest_body(session, feeds, result)


async def _run_ingest_body(
    session: AsyncSession,
    feeds: list[str],
    result: IoIngestResult,
) -> IoIngestResult:
    timeout = httpx.Timeout(settings.io_job_http_timeout_sec)
    now = datetime.now(timezone.utc)
    headers = {"User-Agent": _DEFAULT_UA}

    async with httpx.AsyncClient(timeout=timeout, headers=headers, follow_redirects=True) as client:
        for feed_url in feeds:
            result.feeds_polled += 1
            try:
                response = await client.get(feed_url)
                response.raise_for_status()
                body = response.text
            except Exception as e:
                msg = f"{feed_url}: {e!s}"
                logger.warning("IO RSS fetch failed: %s", msg)
                result.feed_errors.append(msg)
                continue

            items = parse_rss_items(body)
            items = await expand_unjobs_hub_items(
                client,
                items,
                enabled=settings.io_job_unjobs_expand_hubs,
                max_per_hub=settings.io_job_unjobs_max_vacancies_per_hub,
            )
            source_label = infer_io_feed_source_label(feed_url)

            for it in items:
                if not it.link and not it.title:
                    continue
                key = _dedupe_key(feed_url, it.guid, it.link)
                fam = infer_io_job_family(feed_url, it.title, it.link)
                posted = parse_rss_pub_date(it.pub_date)

                row = await session.execute(
                    select(IoJobListing).where(IoJobListing.external_dedupe_key == key)
                )
                existing = row.scalar_one_or_none()
                title = (it.title or "(No title)").strip()[:512]
                link = (it.link or "").strip()[:2048] or None

                if existing:
                    existing.title = title
                    existing.apply_url = link
                    existing.source_label = source_label
                    existing.feed_url = feed_url[:2048]
                    existing.rss_guid = (it.guid or "")[:2048] or None
                    existing.family = fam
                    existing.posted_at = posted or existing.posted_at
                    existing.last_seen_at = now
                else:
                    session.add(
                        IoJobListing(
                            external_dedupe_key=key,
                            title=title,
                            apply_url=link,
                            source_label=source_label,
                            feed_url=feed_url[:2048],
                            rss_guid=(it.guid or "")[:2048] or None,
                            family=fam,
                            posted_at=posted,
                            last_seen_at=now,
                        ),
                    )
                result.items_upserted += 1

    err_summary = (
        "; ".join(result.feed_errors)[:8000] if result.feed_errors else None
    )

    await _write_meta(session, now, err_summary)
    await session.commit()
    return result


async def _write_meta(session: AsyncSession, completed_at: datetime, error: str | None) -> None:
    row = await session.get(IoJobIngestMeta, _INGEST_SINGLETON_KEY)
    if row is None:
        row = IoJobIngestMeta(singleton_key=_INGEST_SINGLETON_KEY)
        session.add(row)
    row.last_completed_at = completed_at
    row.last_error = error


async def get_catalog_refreshed_at(session: AsyncSession) -> datetime | None:
    meta = await session.get(IoJobIngestMeta, _INGEST_SINGLETON_KEY)
    if meta and meta.last_completed_at:
        return meta.last_completed_at
    return await session.scalar(
        select(IoJobListing.last_seen_at)
        .order_by(IoJobListing.last_seen_at.desc())
        .limit(1),
    )
