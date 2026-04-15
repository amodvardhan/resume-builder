"""
International organization jobs — standalone module.

Vacancies are separate from ``JobListing`` / Adzuna / LinkedIn sync.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, func, nulls_last, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import io_job_rss_allowlist
from src.backend.database import get_session
from src.backend.models import IoJobListing, User
from src.backend.schemas import (
    IoJobFamily,
    JobSyncTriggerResponse,
    IoJobListingResponse,
    IoJobListResponse,
)
from src.backend.services.auth_service import get_current_admin, get_current_user
from src.backend.services.io_job_ingest import get_catalog_refreshed_at, run_io_job_rss_ingest


router = APIRouter(prefix="/api/v1/io-jobs", tags=["io-jobs"])


def _row_to_item(row: IoJobListing) -> IoJobListingResponse:
    fam: IoJobFamily = row.family if row.family in ("un", "mdb", "eu", "other") else "other"
    return IoJobListingResponse(
        id=row.id,
        family=fam,
        title=row.title,
        organization=row.organization,
        location=row.location,
        apply_url=row.apply_url,
        eligibility_hint=row.eligibility_hint,
        posted_at=row.posted_at.isoformat() if row.posted_at else None,
        application_closes_at=None,
        source_label=row.source_label,
    )


@router.get("", response_model=IoJobListResponse)
async def list_io_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    family: str | None = Query(
        None,
        description="Filter by family: un, mdb, eu, other",
    ),
    q: str | None = Query(None, description="Case-insensitive substring match on title"),
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> IoJobListResponse:
    feeds = io_job_rss_allowlist()
    if family is not None and family not in ("un", "mdb", "eu", "other"):
        raise HTTPException(status_code=400, detail="Invalid family filter")

    base = select(IoJobListing)
    count_base = select(func.count()).select_from(IoJobListing)
    if family:
        base = base.where(IoJobListing.family == family)
        count_base = count_base.where(IoJobListing.family == family)
    if q and q.strip():
        like = f"%{q.strip()}%"
        base = base.where(IoJobListing.title.ilike(like))
        count_base = count_base.where(IoJobListing.title.ilike(like))

    total = int(await session.scalar(count_base) or 0)
    catalog_total = int(
        await session.scalar(select(func.count()).select_from(IoJobListing)) or 0,
    )

    offset = (page - 1) * page_size
    list_stmt = (
        base.order_by(
            nulls_last(desc(IoJobListing.posted_at)),
            desc(IoJobListing.last_seen_at),
        )
        .offset(offset)
        .limit(page_size)
    )
    result = await session.execute(list_stmt)
    rows = result.scalars().all()

    refreshed = await get_catalog_refreshed_at(session)

    if not feeds:
        module_status = "no_feeds_configured"
    elif catalog_total == 0:
        module_status = "empty_catalog"
    else:
        module_status = "ready"

    return IoJobListResponse(
        items=[_row_to_item(r) for r in rows],
        total=total,
        catalog_total=catalog_total,
        page=page,
        page_size=page_size,
        allowlisted_feed_count=len(feeds),
        catalog_refreshed_at=refreshed,
        module_status=module_status,
    )


@router.post("/sync", response_model=JobSyncTriggerResponse, status_code=202)
async def trigger_io_job_sync(
    background_tasks: BackgroundTasks,
    _admin: User = Depends(get_current_admin),
) -> JobSyncTriggerResponse:
    """Poll allowlisted RSS feeds (admin only). Same contract as ``POST /api/v1/jobs/sync``."""
    background_tasks.add_task(run_io_job_rss_ingest)
    return JobSyncTriggerResponse(
        message="IO job RSS sync started in background",
        status="accepted",
    )
