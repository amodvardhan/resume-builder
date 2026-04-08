"""User & profile management routes."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.database import get_session
from src.backend.models import User
from src.backend.routers._helpers import user_response
from src.backend.schemas import UserCreateRequest, UserResponse, UserUpdateRequest
from src.backend.services.auth_service import get_current_user
from src.backend.services.profile_photo import validate_process_and_save_profile_photo

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    payload: UserCreateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    user = User(
        id=uuid.uuid4(),
        full_name=payload.full_name,
        email=payload.email,
        core_skills=payload.core_skills,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user_response(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user_response(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.email is not None:
        user.email = payload.email
    if payload.core_skills is not None:
        user.core_skills = payload.core_skills
    if payload.phone is not None:
        user.phone = (payload.phone.strip() or None)
    if payload.country is not None:
        user.country = (payload.country.strip() or None)
    if payload.linkedin_url is not None:
        user.linkedin_url = (payload.linkedin_url.strip() or None)
    await session.commit()
    await session.refresh(user)
    return user_response(user)


@router.post(
    "/{user_id}/profile-photo",
    response_model=UserResponse,
)
async def upload_profile_photo(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
) -> UserResponse:
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    raw = await file.read()
    try:
        path_str = validate_process_and_save_profile_photo(raw, user_id=user_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    old = getattr(user, "profile_photo_path", None)
    if old and str(old).strip():
        Path(str(old)).unlink(missing_ok=True)

    user.profile_photo_path = path_str
    await session.commit()
    await session.refresh(user)
    return user_response(user)


@router.delete(
    "/{user_id}/profile-photo",
    response_model=UserResponse,
)
async def delete_profile_photo(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    raw = getattr(user, "profile_photo_path", None)
    if raw and str(raw).strip():
        Path(str(raw)).unlink(missing_ok=True)
    user.profile_photo_path = None
    await session.commit()
    await session.refresh(user)
    return user_response(user)


@router.get("/{user_id}/profile-photo")
async def get_profile_photo_file(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    raw = getattr(user, "profile_photo_path", None)
    if not raw or not str(raw).strip():
        raise HTTPException(status_code=404, detail="No profile photo")

    p = Path(str(raw))
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Profile photo not found")

    return FileResponse(
        path=str(p),
        media_type="image/jpeg",
        filename="profile-photo.jpg",
    )
