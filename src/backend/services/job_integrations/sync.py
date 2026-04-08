"""Orchestrate job sync: primary (Adzuna, Jooble) then secondary (LinkedIn, XING, Naukri Gulf)."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.database import async_session_factory
from src.backend.models import JobListing, JobPreference, JobSyncRun
from src.backend.services.job_integrations._countries import (
    job_dict_matches_target_countries,
    normalize_adzuna_country_codes,
)
from src.backend.services.job_integrations._text import normalize_external_id
from src.backend.services.job_integrations.adzuna import fetch_adzuna_jobs
from src.backend.services.job_integrations.jooble import fetch_jooble_jobs
from src.backend.services.job_integrations.linkedin import fetch_linkedin_job_postings
from src.backend.services.job_integrations.naukri_gulf import fetch_naukri_gulf_feed_jobs
from src.backend.services.job_integrations.xing import fetch_xing_postings
from src.backend.services.job_listing_visibility import job_dict_is_visible

logger = logging.getLogger(__name__)

# Hard cap so a stuck HTTP client cannot leave JobSyncRun stuck in "running" forever.
_SYNC_TIMEOUT_SEC = 300.0


def _as_str_list(v: object) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v]
    return []


async def _resolve_listing_ids_ordered(
    session: AsyncSession,
    combined: list[dict[str, Any]],
) -> list[uuid.UUID]:
    """Map each combined row to ``job_listings.id`` after upsert, preserving order.

    Uses ``OR`` of ``(provider, external_id)`` predicates — more reliable than
    ``tuple_.in_`` across drivers, and uses :func:`normalize_external_id` so
    lookups match stored rows.
    """
    pairs_in_order: list[tuple[str, str]] = []
    for j in combined:
        p, e = j.get("provider"), j.get("external_id")
        if p is None or e is None:
            continue
        ext = normalize_external_id(e)
        if not ext:
            continue
        pairs_in_order.append((str(p), ext))

    if not pairs_in_order:
        return []

    unique_pairs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for pair in pairs_in_order:
        if pair in seen:
            continue
        seen.add(pair)
        unique_pairs.append(pair)

    conds = [
        and_(JobListing.provider == p, JobListing.external_id == e)
        for p, e in unique_pairs
    ]
    where_clause = conds[0] if len(conds) == 1 else or_(*conds)
    result = await session.execute(select(JobListing).where(where_clause))
    lookup: dict[tuple[str, str], uuid.UUID] = {}
    for job in result.scalars().unique():
        key = (str(job.provider), normalize_external_id(job.external_id))
        lookup[key] = job.id

    out: list[uuid.UUID] = []
    for pair in pairs_in_order:
        jid = lookup.get(pair)
        if jid is not None:
            out.append(jid)
    return out


def _count_by_provider(jobs: list[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for j in jobs:
        p = str(j.get("provider") or "unknown")
        out[p] = out.get(p, 0) + 1
    return out


def _keyword_match(job: dict[str, Any], keywords: list[str]) -> bool:
    if not keywords:
        return True
    blob = f"{job.get('title', '')} {job.get('description_text', '')}".lower()
    return any(k.strip().lower() in blob for k in keywords if k.strip())


async def _upsert_jobs(session: AsyncSession, jobs: list[dict[str, Any]]) -> int:
    if not jobs:
        return 0
    new_count = 0
    now = datetime.now(timezone.utc)
    for job in jobs:
        ext = normalize_external_id(job.get("external_id"))
        if not ext:
            continue
        stmt = (
            pg_insert(JobListing.__table__)
            .values(
                id=uuid.uuid4(),
                provider=job["provider"],
                source_name=job["source_name"],
                external_id=ext,
                title=job["title"],
                organization=job.get("organization"),
                location=job.get("location"),
                description_html=job.get("description_html"),
                description_text=job.get("description_text", job["title"]),
                url=job.get("url"),
                salary_range=job.get("salary_range"),
                posted_at=job.get("posted_at"),
                application_closes_at=job.get("application_closes_at"),
                accepts_applications=bool(job.get("accepts_applications", True)),
                ingested_at=job.get("ingested_at", now),
                industry=job.get("industry"),
                role_category=job.get("role_category"),
                raw_data=job.get("raw_data"),
                created_at=now,
            )
            .on_conflict_do_nothing(
                constraint="uq_job_listings_provider_external",
            )
        )
        result = await session.execute(stmt)
        if result.rowcount:
            new_count += int(result.rowcount)

    await session.commit()
    return new_count


async def run_job_sync_for_user(user_id: uuid.UUID) -> uuid.UUID:
    """Run primary aggregators first, then secondary integrations."""

    async with async_session_factory() as session:
        pref = (
            await session.execute(
                select(JobPreference).where(JobPreference.user_id == user_id)
            )
        ).scalar_one_or_none()

        if pref is None:
            run = JobSyncRun(
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

        industry = pref.industry or ""
        role_cats = _as_str_list(pref.role_categories)
        role_category = role_cats[0] if role_cats else None
        keywords = _as_str_list(pref.keywords)
        locations = _as_str_list(pref.preferred_locations)
        target_cc = normalize_adzuna_country_codes(
            _as_str_list(getattr(pref, "target_country_codes", None)),
        )
        country_kwarg = target_cc if target_cc else None

        run = JobSyncRun(
            user_id=user_id,
            status="running",
            jobs_found=0,
            jobs_new=0,
            started_at=datetime.now(timezone.utc),
        )
        session.add(run)
        await session.commit()
        run_id = run.id

        async def _fetch_store_and_score() -> None:
            # --- Primary: Adzuna + Jooble (official job-search APIs) ---
            ad_task = asyncio.create_task(
                fetch_adzuna_jobs(
                    role_categories=role_cats,
                    preferred_locations=locations,
                    keywords=keywords,
                    country_codes=country_kwarg,
                ),
            )
            jo_task = asyncio.create_task(
                fetch_jooble_jobs(
                    role_categories=role_cats,
                    preferred_locations=locations,
                    keywords=keywords,
                    country_codes=country_kwarg,
                ),
            )
            ad, jo = await asyncio.gather(ad_task, jo_task, return_exceptions=True)

            primary_chunks: list[list[dict[str, Any]]] = []
            for name, result in (("adzuna", ad), ("jooble", jo)):
                if isinstance(result, Exception):
                    logger.error("%s (primary) failed", name, exc_info=result)
                    continue
                primary_chunks.append(result)

            # --- Secondary: LinkedIn, XING, Naukri Gulf ---
            li_task = asyncio.create_task(fetch_linkedin_job_postings())
            xi_task = asyncio.create_task(fetch_xing_postings())
            ng_task = asyncio.create_task(fetch_naukri_gulf_feed_jobs())
            li, xi, ng = await asyncio.gather(
                li_task, xi_task, ng_task, return_exceptions=True,
            )

            secondary_chunks: list[list[dict[str, Any]]] = []
            for name, result in (
                ("linkedin", li),
                ("xing", xi),
                ("naukri_gulf", ng),
            ):
                if isinstance(result, Exception):
                    logger.error("%s (secondary) failed", name, exc_info=result)
                    continue
                secondary_chunks.append(result)

            chunks = primary_chunks + secondary_chunks

            combined: list[dict[str, Any]] = []
            for part in chunks:
                for j in part:
                    j.setdefault("industry", industry or None)
                    j.setdefault("role_category", role_category)
                    j.setdefault("accepts_applications", True)
                    j.setdefault("application_closes_at", None)
                    j["ingested_at"] = datetime.now(timezone.utc)
                    if (
                        _keyword_match(j, keywords)
                        and job_dict_is_visible(j)
                        and job_dict_matches_target_countries(j, target_cc)
                    ):
                        combined.append(j)

            jobs_found = len(combined)
            jobs_new = await _upsert_jobs(session, combined)
            by_provider = _count_by_provider(combined)

            run_row = await session.get(JobSyncRun, run_id)
            if run_row is not None:
                run_row.jobs_found = jobs_found
                run_row.jobs_new = jobs_new
                run_row.sources_breakdown = by_provider
                run_row.status = "completed"
                run_row.finished_at = datetime.now(timezone.utc)
            await session.commit()

            # Score listings from this run, then persist how many JobMatch rows were added
            # and which listing IDs belong to this search (for "last run" grid).
            batch_ids_for_run: list[uuid.UUID] = []
            matches_created = 0
            try:
                from src.backend.services.job_matcher import score_new_matches

                if combined:
                    batch_ids_for_run = await _resolve_listing_ids_ordered(
                        session, combined,
                    )
                    if batch_ids_for_run:
                        matches_created = await score_new_matches(
                            user_id, listing_ids=batch_ids_for_run,
                        )
                    else:
                        logger.warning(
                            "Sync combined %d rows but resolved 0 job_listing ids; "
                            "falling back to preference-based scoring",
                            len(combined),
                        )
                        matches_created = await score_new_matches(user_id)
                else:
                    matches_created = await score_new_matches(user_id)
            except Exception:
                logger.exception(
                    "Post-sync match scoring failed for user %s", user_id,
                )
            finally:
                async with async_session_factory() as session2:
                    r2 = await session2.get(JobSyncRun, run_id)
                    if r2 is not None:
                        r2.matches_created = matches_created
                        if batch_ids_for_run:
                            r2.last_batch_listing_ids = [
                                str(x) for x in batch_ids_for_run
                            ]
                        await session2.commit()

        try:
            await asyncio.wait_for(
                _fetch_store_and_score(),
                timeout=_SYNC_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError:
            logger.error(
                "Job sync timed out after %s s for user %s",
                _SYNC_TIMEOUT_SEC,
                user_id,
            )
            run = await session.get(JobSyncRun, run_id)
            if run is not None:
                run.status = "failed"
                run.error_message = (
                    f"Sync timed out after {int(_SYNC_TIMEOUT_SEC)} seconds"
                )
                run.finished_at = datetime.now(timezone.utc)
            await session.commit()
        except Exception as exc:
            logger.exception("Job sync failed for user %s", user_id)
            run = await session.get(JobSyncRun, run_id)
            if run is not None:
                run.status = "failed"
                run.error_message = str(exc)[:2000]
                run.finished_at = datetime.now(timezone.utc)
            await session.commit()

        return run_id
