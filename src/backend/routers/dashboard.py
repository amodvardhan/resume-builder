"""Dashboard stats, match listing, match detail, status update, and apply routes."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import job_integrations_configured
from src.backend.database import get_session
from src.backend.models import JobListing, JobMatch, Resume, User
from src.backend.routers._helpers import (
    match_detail_response,
    match_list_item_response,
    match_response,
)
from src.backend.schemas import (
    DashboardStatsResponse,
    MatchApplyResponse,
    MatchDetailResponse,
    MatchListItemResponse,
    MatchListResponse,
    MatchResponse,
    MatchStatusUpdateRequest,
)
from src.backend.services.auth_service import get_current_user
from src.backend.services.job_matcher import score_and_upsert_match_for_listing
from src.backend.services.tailor_engine import generate_draft

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
async def dashboard_stats(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> DashboardStatsResponse:
    base_filter = JobMatch.user_id == current_user.id

    count_result = await session.execute(
        select(func.count(JobMatch.id)).where(base_filter)
    )
    total_matches = count_result.scalar() or 0

    avg_result = await session.execute(
        select(func.coalesce(func.avg(JobMatch.overall_score), 0.0)).where(base_filter)
    )
    average_score = round(float(avg_result.scalar() or 0.0), 1)

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    new_today_result = await session.execute(
        select(func.count(JobMatch.id)).where(
            base_filter,
            JobMatch.created_at >= today_start,
        )
    )
    new_today = new_today_result.scalar() or 0

    saved_result = await session.execute(
        select(func.count(JobMatch.id)).where(
            base_filter,
            JobMatch.status == "saved",
        )
    )
    saved_count = saved_result.scalar() or 0

    tier_90_result = await session.execute(
        select(func.count(JobMatch.id)).where(base_filter, JobMatch.overall_score >= 90)
    )
    tier_90_plus = tier_90_result.scalar() or 0

    tier_70_result = await session.execute(
        select(func.count(JobMatch.id)).where(
            base_filter, JobMatch.overall_score >= 70, JobMatch.overall_score < 90
        )
    )
    tier_70_89 = tier_70_result.scalar() or 0

    tier_50_result = await session.execute(
        select(func.count(JobMatch.id)).where(
            base_filter, JobMatch.overall_score >= 50, JobMatch.overall_score < 70
        )
    )
    tier_50_69 = tier_50_result.scalar() or 0

    tier_below_result = await session.execute(
        select(func.count(JobMatch.id)).where(
            base_filter, JobMatch.overall_score < 50
        )
    )
    tier_below_50 = tier_below_result.scalar() or 0

    return DashboardStatsResponse(
        total_matches=total_matches,
        average_score=average_score,
        new_today=new_today,
        saved_count=saved_count,
        tier_90_plus=tier_90_plus,
        tier_70_89=tier_70_89,
        tier_50_69=tier_50_69,
        tier_below_50=tier_below_50,
        integrations_configured=job_integrations_configured(),
    )


@router.get("/matches", response_model=MatchListResponse)
async def list_matches(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    status: str | None = Query(None),
    min_score: float | None = Query(None, ge=0, le=100),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MatchListResponse:
    filters: list[Any] = [JobMatch.user_id == current_user.id]
    if status is not None:
        filters.append(JobMatch.status == status)
    if min_score is not None:
        filters.append(JobMatch.overall_score >= min_score)

    count_result = await session.execute(
        select(func.count(JobMatch.id)).where(*filters)
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * per_page
    matches_result = await session.execute(
        select(JobMatch)
        .where(*filters)
        .order_by(JobMatch.overall_score.desc())
        .offset(offset)
        .limit(per_page)
    )
    matches = matches_result.scalars().all()

    items: list[MatchListItemResponse] = []
    for m in matches:
        job = await session.get(JobListing, m.job_id)
        if job is None:
            continue
        items.append(match_list_item_response(m, job))

    return MatchListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/matches/{match_id}", response_model=MatchDetailResponse)
async def get_match(
    match_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MatchDetailResponse:
    match = await session.get(JobMatch, match_id)
    if match is None or match.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Match not found")

    job = await session.get(JobListing, match.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Associated job not found")

    return match_detail_response(match, job)


@router.post(
    "/listings/{listing_id}/compatibility",
    response_model=MatchDetailResponse,
)
async def score_listing_compatibility(
    listing_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MatchDetailResponse:
    """Score the current user's resume against this job listing (creates or updates a match card)."""
    try:
        match = await score_and_upsert_match_for_listing(
            current_user.id,
            listing_id,
        )
    except LookupError as exc:
        code = str(exc)
        if code == "listing_not_found":
            raise HTTPException(status_code=404, detail="Job listing not found")
        if code == "no_active_resume":
            raise HTTPException(
                status_code=400,
                detail="Upload your resume in Profile first.",
            )
        if code == "user_not_found":
            raise HTTPException(status_code=404, detail="User not found")
        raise HTTPException(status_code=400, detail="Unable to score this listing")

    job = await session.get(JobListing, listing_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job listing not found")

    return match_detail_response(match, job)


@router.patch("/matches/{match_id}", response_model=MatchResponse)
async def update_match_status(
    match_id: uuid.UUID,
    payload: MatchStatusUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MatchResponse:
    valid_statuses = {"new", "reviewing", "applied", "interviewing", "rejected", "saved", "dismissed"}
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=422, detail="No fields to update")

    match = await session.get(JobMatch, match_id)
    if match is None or match.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Match not found")

    if "status" in data:
        st = data["status"]
        if st not in valid_statuses:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}",
            )
        match.status = st
    if "notes" in data:
        n = data["notes"]
        match.notes = None if n is None else str(n)
    if "next_follow_up_at" in data:
        match.next_follow_up_at = data["next_follow_up_at"]

    await session.commit()
    await session.refresh(match)
    return match_response(match)


@router.post("/matches/{match_id}/apply", response_model=MatchApplyResponse)
async def match_apply(
    match_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MatchApplyResponse:
    match = await session.get(JobMatch, match_id)
    if match is None or match.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Match not found")

    job = await session.get(JobListing, match.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Associated job not found")

    resume_result = await session.execute(
        select(Resume)
        .where(Resume.user_id == current_user.id, Resume.is_active.is_(True))
        .order_by(Resume.created_at.desc())
        .limit(1)
    )
    resume = resume_result.scalar_one_or_none()
    if resume is None:
        raise HTTPException(status_code=404, detail="No active resume found")

    core_skills: list[str] = (
        current_user.core_skills
        if isinstance(current_user.core_skills, list)
        else []
    )

    try:
        draft = await generate_draft(
            core_skills=core_skills,
            resume_text=resume.extracted_text,
            job_title=job.title,
            organization=job.organization or "",
            job_description=job.description_text,
            cover_letter_sentiment=None,
        )
    except Exception:
        logger.exception("Match apply draft generation failed")
        raise HTTPException(status_code=500, detail="AI draft generation encountered an error")

    match.status = "applied"
    await session.commit()

    return MatchApplyResponse(**draft)
