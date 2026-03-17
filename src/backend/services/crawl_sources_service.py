"""DB-backed crawl source resolution and default seed (REQ-017)."""

from __future__ import annotations

import itertools
import logging
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.job_sources import SourceConfig, get_sources_for_preferences
from src.backend.models import JobCrawlSource

logger = logging.getLogger(__name__)

# Mirrors legacy job_sources.py industry coverage at REQ-017 implementation.
_SEED_SPECS: list[dict[str, Any]] = [
    {
        "source_key": "indeed",
        "display_name": "Indeed",
        "source_type": "html_scraper",
        "url_template": "https://www.indeed.com/jobs?q={role}&l={location}&sort=date",
        "headers": {"User-Agent": "Mozilla/5.0 (compatible; MeridianBot/1.0)"},
        "rate_limit_seconds": 3.0,
        "selectors": {
            "job_card": "div.job_seen_beacon",
            "title": "h2.jobTitle span[title]",
            "company": "span[data-testid='company-name']",
            "location": "div[data-testid='text-location']",
            "description": "div.job-snippet",
            "link": "a.jcs-JobTitle",
        },
        "industries": [],
        "sort_order": 10,
    },
    {
        "source_key": "linkedin",
        "display_name": "LinkedIn",
        "source_type": "html_scraper",
        "url_template": (
            "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/"
            "search?keywords={role}&location={location}&start=0"
        ),
        "headers": {"User-Agent": "Mozilla/5.0 (compatible; MeridianBot/1.0)"},
        "rate_limit_seconds": 5.0,
        "selectors": {
            "job_card": "li",
            "title": "h3.base-search-card__title",
            "company": "h4.base-search-card__subtitle",
            "location": "span.job-search-card__location",
            "description": "p.base-search-card__metadata",
            "link": "a.base-card__full-link",
        },
        "industries": [],
        "sort_order": 20,
    },
    {
        "source_key": "adzuna",
        "display_name": "Adzuna",
        "source_type": "api",
        "url_template": (
            "https://api.adzuna.com/v1/api/jobs/us/search/1"
            "?app_id=demo&app_key=demo&results_per_page=20"
            "&what={role}&where={location}"
        ),
        "headers": {"Accept": "application/json"},
        "rate_limit_seconds": 2.0,
        "selectors": {},
        "industries": [],
        "sort_order": 30,
    },
    {
        "source_key": "remoteok",
        "display_name": "RemoteOK",
        "source_type": "api",
        "url_template": "https://remoteok.com/api",
        "headers": {"User-Agent": "Mozilla/5.0 (compatible; MeridianBot/1.0)"},
        "rate_limit_seconds": 4.0,
        "selectors": {},
        "industries": ["IT Software", "IT Services & Consulting"],
        "sort_order": 40,
    },
    {
        "source_key": "stackoverflow",
        "display_name": "Stack Overflow Jobs",
        "source_type": "rss",
        "url_template": "https://stackoverflow.com/jobs/feed?q={role}&l={location}",
        "headers": {"Accept": "application/rss+xml"},
        "rate_limit_seconds": 3.0,
        "selectors": {},
        "industries": ["IT Software", "IT Services & Consulting"],
        "sort_order": 50,
    },
    {
        "source_key": "glassdoor",
        "display_name": "Glassdoor",
        "source_type": "html_scraper",
        "url_template": (
            "https://www.glassdoor.com/Job/jobs.htm?"
            "sc.keyword={role}&locT=C&locKeyword={location}"
        ),
        "headers": {"User-Agent": "Mozilla/5.0 (compatible; MeridianBot/1.0)"},
        "rate_limit_seconds": 4.0,
        "selectors": {
            "job_card": "li.react-job-listing",
            "title": "a.jobLink span",
            "company": "div.job-search-key-l2wjgv",
            "location": "span.job-search-key-1rdszsd",
            "description": "div.job-snippet",
            "link": "a.jobLink",
        },
        "industries": [
            "Finance & Banking",
            "Healthcare",
            "Manufacturing",
            "Marketing & Communications",
        ],
        "sort_order": 60,
    },
]


def _row_to_config(row: JobCrawlSource) -> SourceConfig:
    return SourceConfig(
        name=row.source_key,
        source_type=row.source_type,
        url_template=row.url_template,
        headers=row.headers if isinstance(row.headers, dict) else {},
        rate_limit_seconds=float(row.rate_limit_seconds or 2.0),
        selectors=row.selectors if isinstance(row.selectors, dict) else {},
    )


def _normalize_str_list(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw]
    return []


async def ensure_default_crawl_sources(session: AsyncSession) -> None:
    """One-time seed on empty table (startup)."""
    n = await session.scalar(select(func.count()).select_from(JobCrawlSource))
    if (n or 0) > 0:
        return
    for spec in _SEED_SPECS:
        session.add(
            JobCrawlSource(
                id=uuid.uuid4(),
                source_key=spec["source_key"],
                display_name=spec["display_name"],
                source_type=spec["source_type"],
                url_template=spec["url_template"],
                headers=spec["headers"],
                rate_limit_seconds=spec["rate_limit_seconds"],
                selectors=spec["selectors"],
                industries=spec["industries"],
                enabled=True,
                sort_order=spec["sort_order"],
            )
        )
    await session.commit()
    logger.info("Seeded %d default job_crawl_sources rows", len(_SEED_SPECS))


async def resolve_crawl_source_pairs(
    session: AsyncSession,
    industry: str,
    role_categories: list[str],
    locations: list[str],
    keywords: list[str],
) -> list[tuple[SourceConfig, str]]:
    """Return (SourceConfig, resolved_url) pairs using DB sources, else code registry."""

    total = await session.scalar(select(func.count()).select_from(JobCrawlSource))
    if (total or 0) == 0:
        return get_sources_for_preferences(
            industry or "", role_categories, locations, keywords
        )

    stmt = (
        select(JobCrawlSource)
        .where(JobCrawlSource.enabled.is_(True))
        .order_by(JobCrawlSource.sort_order, JobCrawlSource.source_key)
    )
    rows = list((await session.execute(stmt)).scalars().all())

    industry = (industry or "").strip()
    role_categories = _normalize_str_list(role_categories)
    locations = _normalize_str_list(locations)
    keywords = _normalize_str_list(keywords)

    if not rows:
        logger.warning("No enabled job_crawl_sources; using code registry fallback")
        return get_sources_for_preferences(
            industry, role_categories, locations, keywords
        )

    applicable: list[JobCrawlSource] = []
    for row in rows:
        inds = _normalize_str_list(row.industries)
        if not inds:
            applicable.append(row)
        elif industry and industry in inds:
            applicable.append(row)

    if industry and not applicable:
        for row in rows:
            if not row.enabled:
                continue
            if not _normalize_str_list(row.industries):
                applicable.append(row)

    if not applicable:
        logger.warning(
            "No DB crawl sources for industry %r; falling back to code registry",
            industry,
        )
        return get_sources_for_preferences(
            industry, role_categories, locations, keywords
        )

    from urllib.parse import quote_plus

    def _resolve_url(template: str, role: str, location: str, kw: str) -> str:
        return (
            template.replace("{role}", quote_plus(role))
            .replace("{location}", quote_plus(location))
            .replace("{keywords}", quote_plus(kw))
        )

    keywords_str = " ".join(keywords) if keywords else ""
    effective_locations = locations if locations else [""]
    results: list[tuple[SourceConfig, str]] = []
    for role, location in itertools.product(role_categories, effective_locations):
        for row in applicable:
            cfg = _row_to_config(row)
            results.append(
                (cfg, _resolve_url(cfg.url_template, role, location, keywords_str))
            )
    return results
