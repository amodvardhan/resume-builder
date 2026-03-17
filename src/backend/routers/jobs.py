"""Job crawling routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.database import get_session
from src.backend.models import CrawledJob, CrawlRun, JobPreference, User
from src.backend.routers._helpers import crawl_status_response, crawled_job_response
from src.backend.schemas import (
    CrawledJobListResponse,
    CrawlStatusResponse,
    CrawlTriggerResponse,
)
from src.backend.services.auth_service import get_current_user
from src.backend.services.job_crawler import run_crawl_for_user

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.post("/crawl", response_model=CrawlTriggerResponse, status_code=202)
async def trigger_crawl(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
) -> CrawlTriggerResponse:
    background_tasks.add_task(run_crawl_for_user, current_user.id)
    return CrawlTriggerResponse(
        message="Crawl started in background",
        status="accepted",
    )


@router.get("/crawl/status", response_model=CrawlStatusResponse)
async def get_crawl_status(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CrawlStatusResponse:
    result = await session.execute(
        select(CrawlRun)
        .where(CrawlRun.user_id == current_user.id)
        .order_by(CrawlRun.started_at.desc())
        .limit(1)
    )
    run = result.scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="No crawl runs found")
    return crawl_status_response(run)


@router.get("", response_model=CrawledJobListResponse)
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> CrawledJobListResponse:
    pref_result = await session.execute(
        select(JobPreference).where(JobPreference.user_id == current_user.id)
    )
    pref = pref_result.scalar_one_or_none()

    base_query = select(CrawledJob)
    count_query = select(func.count(CrawledJob.id))

    if pref is not None:
        filters: list[Any] = []
        if pref.industry:
            filters.append(CrawledJob.industry == pref.industry)
        role_cats: list[str] = (
            pref.role_categories if isinstance(pref.role_categories, list) else []
        )
        if role_cats:
            filters.append(CrawledJob.role_category.in_(role_cats))
        if filters:
            base_query = base_query.where(*filters)
            count_query = count_query.where(*filters)

    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    jobs_result = await session.execute(
        base_query
        .order_by(CrawledJob.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    jobs = jobs_result.scalars().all()

    return CrawledJobListResponse(
        items=[crawled_job_response(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
    )
