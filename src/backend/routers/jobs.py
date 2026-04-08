"""Job listing and integration sync routes."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import settings
from src.backend.database import get_session
from src.backend.models import JobListing, JobMatch, JobPreference, JobSyncRun, User
from src.backend.routers._helpers import (
    job_listing_response,
    job_listing_with_score_response,
    job_sync_status_response,
)
from src.backend.schemas import (
    JobListingListResponse,
    JobListingWithScoreListResponse,
    JobListingWithScoreResponse,
    JobPostingEnrichment,
    JobSyncStatusResponse,
    JobSyncTriggerResponse,
)
from src.backend.services.auth_service import get_current_user
from src.backend.services.job_integrations import run_job_sync_for_user
from src.backend.services.job_listing_visibility import orm_listing_is_visible
from src.backend.services.job_posting_fetch import (
    PostingFetchError,
    fetch_posting_description,
    should_skip_url_fetch,
)

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


async def _job_listing_for_user_if_allowed(
    session: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
) -> tuple[JobListing, JobMatch | None] | None:
    """Return a listing only if the user may compose against it (match or latest batch)."""
    job = await session.get(JobListing, listing_id)
    if job is None:
        return None

    m_row = await session.execute(
        select(JobMatch).where(
            JobMatch.user_id == user.id,
            JobMatch.job_id == listing_id,
        )
    )
    match = m_row.scalar_one_or_none()
    if match is not None:
        return job, match

    run_row = await session.execute(
        select(JobSyncRun)
        .where(
            JobSyncRun.user_id == user.id,
            JobSyncRun.last_batch_listing_ids.isnot(None),
        )
        .order_by(JobSyncRun.started_at.desc())
        .limit(1)
    )
    run = run_row.scalar_one_or_none()
    if run and isinstance(run.last_batch_listing_ids, list):
        if str(listing_id) in {str(x) for x in run.last_batch_listing_ids}:
            if not orm_listing_is_visible(job):
                return None
            return job, None

    return None


@router.post("/sync", response_model=JobSyncTriggerResponse, status_code=202)
async def trigger_job_sync(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
) -> JobSyncTriggerResponse:
    background_tasks.add_task(run_job_sync_for_user, current_user.id)
    return JobSyncTriggerResponse(
        message="Job sync started in background",
        status="accepted",
    )


@router.get("/sync/status", response_model=JobSyncStatusResponse)
async def get_job_sync_status(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JobSyncStatusResponse:
    result = await session.execute(
        select(JobSyncRun)
        .where(JobSyncRun.user_id == current_user.id)
        .order_by(JobSyncRun.started_at.desc())
        .limit(1)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="No job sync runs found")
    return job_sync_status_response(run)


@router.get("/last-run", response_model=JobListingWithScoreListResponse)
async def list_last_run_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JobListingWithScoreListResponse:
    """Paginated jobs from the most recent successful search batch (same order as sync)."""
    result = await session.execute(
        select(JobSyncRun)
        .where(
            JobSyncRun.user_id == current_user.id,
            JobSyncRun.last_batch_listing_ids.isnot(None),
        )
        .order_by(JobSyncRun.started_at.desc())
        .limit(1)
    )
    run = result.scalar_one_or_none()
    if run is None or not run.last_batch_listing_ids:
        return JobListingWithScoreListResponse(
            items=[], total=0, page=page, page_size=page_size,
        )

    raw_ids = run.last_batch_listing_ids
    if not isinstance(raw_ids, list):
        return JobListingWithScoreListResponse(
            items=[], total=0, page=page, page_size=page_size,
        )

    try:
        ids: list[uuid.UUID] = [uuid.UUID(str(x)) for x in raw_ids]
    except (ValueError, TypeError):
        return JobListingWithScoreListResponse(
            items=[], total=0, page=page, page_size=page_size,
        )

    now = datetime.now(timezone.utc)
    jobs_all_result = await session.execute(
        select(JobListing).where(JobListing.id.in_(ids)),
    )
    jobs_map = {j.id: j for j in jobs_all_result.scalars().all()}

    active_ids: list[uuid.UUID] = []
    for jid in ids:
        row = jobs_map.get(jid)
        if row is None:
            continue
        if orm_listing_is_visible(row, now=now):
            active_ids.append(jid)

    total = len(active_ids)
    offset = (page - 1) * page_size
    page_ids = active_ids[offset : offset + page_size]

    if not page_ids:
        return JobListingWithScoreListResponse(
            items=[], total=total, page=page, page_size=page_size,
        )

    match_result = await session.execute(
        select(JobMatch).where(
            JobMatch.user_id == current_user.id,
            JobMatch.job_id.in_(page_ids),
        )
    )
    match_map = {m.job_id: m for m in match_result.scalars().all()}

    items = []
    for jid in page_ids:
        job = jobs_map.get(jid)
        if job is None:
            continue
        items.append(
            job_listing_with_score_response(job, match_map.get(jid)),
        )

    return JobListingWithScoreListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/listings/{listing_id}", response_model=JobListingWithScoreResponse)
async def get_job_listing_for_compose(
    listing_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JobListingWithScoreResponse:
    """Full listing row for tailoring (same payload as last-run grid, authorized)."""
    result = await _job_listing_for_user_if_allowed(
        session, current_user, listing_id,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Job listing not found")
    job, match = result
    return job_listing_with_score_response(job, match)


@router.post(
    "/listings/{listing_id}/fetch-posting",
    response_model=JobListingWithScoreResponse,
)
async def fetch_full_job_posting_for_compose(
    listing_id: uuid.UUID,
    force: bool = Query(
        False,
        description="Re-fetch from URL even if stored description is already long.",
    ),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JobListingWithScoreResponse:
    """Load the full job description from the employer posting URL and persist it.

    Adzuna/Jooble APIs only return short snippets; this follows the same URL users
    open in the browser and extracts the main page content (SSRF-safe fetch).
    """
    result = await _job_listing_for_user_if_allowed(
        session, current_user, listing_id,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Job listing not found")
    job, match = result

    raw_url = (job.url or "").strip()
    if not raw_url:
        raise HTTPException(
            status_code=400,
            detail="This listing has no external posting URL to load.",
        )

    if should_skip_url_fetch(job.description_text, force=force):
        return job_listing_with_score_response(
            job,
            match,
            posting_enrichment=JobPostingEnrichment(
                status="skipped_substantial",
                message=(
                    "Stored description is already long; pass force=true to reload from the URL."
                ),
            ),
        )

    try:
        fetched = await fetch_posting_description(raw_url, allow_http=False)
    except PostingFetchError as exc:
        return job_listing_with_score_response(
            job,
            match,
            posting_enrichment=JobPostingEnrichment(
                status="failed",
                message=str(exc),
            ),
        )

    job.description_html = fetched.description_html
    job.description_text = fetched.description_text
    if fetched.application_closes_at is not None:
        job.application_closes_at = fetched.application_closes_at
    if fetched.accepts_applications is not None:
        job.accepts_applications = fetched.accepts_applications
    await session.commit()
    await session.refresh(job)

    return job_listing_with_score_response(
        job,
        match,
        posting_enrichment=JobPostingEnrichment(
            status="fetched",
            message="Full job description loaded from the posting page.",
        ),
    )


@router.get("", response_model=JobListingListResponse)
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JobListingListResponse:
    pref_result = await session.execute(
        select(JobPreference).where(JobPreference.user_id == current_user.id)
    )
    pref = pref_result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    vis: list[Any] = [
        or_(JobListing.application_closes_at.is_(None), JobListing.application_closes_at > now),
        JobListing.accepts_applications.is_(True),
    ]
    if settings.job_listing_max_age_days > 0:
        cutoff = now - timedelta(days=settings.job_listing_max_age_days)
        vis.append(or_(JobListing.posted_at.is_(None), JobListing.posted_at >= cutoff))

    pref_filters: list[Any] = []
    if pref is not None:
        if pref.industry:
            pref_filters.append(JobListing.industry == pref.industry)
        role_cats: list[str] = (
            pref.role_categories if isinstance(pref.role_categories, list) else []
        )
        if role_cats:
            pref_filters.append(JobListing.role_category.in_(role_cats))

    all_clauses = [*vis, *pref_filters]
    where_expr = and_(*all_clauses)

    base_query = select(JobListing).where(where_expr)
    count_query = select(func.count(JobListing.id)).where(where_expr)

    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    jobs_result = await session.execute(
        base_query
        .order_by(JobListing.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    jobs = jobs_result.scalars().all()

    return JobListingListResponse(
        items=[job_listing_response(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
    )
