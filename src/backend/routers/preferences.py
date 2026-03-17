"""Job preferences routes."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.database import get_session
from src.backend.job_sources import INDUSTRY_ROLE_CATALOG
from src.backend.models import JobPreference, User
from src.backend.routers._helpers import job_preference_response
from src.backend.schemas import JobPreferenceRequest, JobPreferenceResponse
from src.backend.services.auth_service import get_current_user

router = APIRouter(prefix="/api/v1/preferences", tags=["preferences"])


@router.get("", response_model=JobPreferenceResponse)
async def get_preferences(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JobPreferenceResponse:
    result = await session.execute(
        select(JobPreference).where(JobPreference.user_id == current_user.id)
    )
    pref = result.scalar_one_or_none()
    if pref is None:
        raise HTTPException(status_code=404, detail="No preferences found")
    return job_preference_response(pref)


@router.put("", response_model=JobPreferenceResponse)
async def upsert_preferences(
    payload: JobPreferenceRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> JobPreferenceResponse:
    result = await session.execute(
        select(JobPreference).where(JobPreference.user_id == current_user.id)
    )
    pref = result.scalar_one_or_none()

    if pref is not None:
        pref.industry = payload.industry
        pref.role_categories = payload.role_categories
        pref.preferred_locations = payload.preferred_locations
        pref.experience_level = payload.experience_level
        pref.keywords = payload.keywords
        pref.updated_at = datetime.now(timezone.utc)
    else:
        pref = JobPreference(
            id=uuid.uuid4(),
            user_id=current_user.id,
            industry=payload.industry,
            role_categories=payload.role_categories,
            preferred_locations=payload.preferred_locations,
            experience_level=payload.experience_level,
            keywords=payload.keywords,
        )
        session.add(pref)

    await session.commit()
    await session.refresh(pref)
    return job_preference_response(pref)


@router.get("/catalog")
async def get_catalog() -> dict[str, list[str]]:
    return INDUSTRY_ROLE_CATALOG
