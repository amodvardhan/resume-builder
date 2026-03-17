"""Authentication routes — register, login, refresh, me."""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.config import email_is_admin
from src.backend.database import get_session
from src.backend.models import User
from src.backend.routers._helpers import user_response
from src.backend.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from src.backend.services.auth_service import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    verify_password,
    verify_token,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
logger = logging.getLogger(__name__)


def _email_key(email: str) -> str:
    return str(email).strip().lower()


@router.post("/register", response_model=UserResponse, status_code=201)
async def auth_register(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> UserResponse:
    key = _email_key(str(payload.email))
    dup = await session.execute(select(User).where(func.lower(User.email) == key))
    if dup.scalars().first() is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    password_hash = await asyncio.to_thread(hash_password, payload.password)
    user = User(
        id=uuid.uuid4(),
        full_name=payload.full_name,
        email=key,
        password_hash=password_hash,
        core_skills=payload.core_skills,
        is_admin=email_is_admin(key),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user_response(user)


@router.post("/login", response_model=TokenResponse)
async def auth_login(
    payload: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    key = _email_key(str(payload.email))
    result = await session.execute(
        select(User).where(func.lower(User.email) == key).order_by(User.created_at)
    )
    candidates = result.scalars().all()
    user: User | None = None
    for u in candidates:
        if not u.password_hash:
            continue
        try:
            ok = await asyncio.to_thread(
                verify_password, payload.password, u.password_hash,
            )
        except (ValueError, TypeError):
            continue
        if ok:
            user = u
            break
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if email_is_admin(str(user.email)) and not user.is_admin:
        try:
            user.is_admin = True
            await session.commit()
            await session.refresh(user)
        except Exception:
            await session.rollback()
            logger.exception("Could not persist is_admin; continuing login")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user_response(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def auth_refresh(
    payload: RefreshRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    user_id = verify_token(payload.refresh_token, token_type="refresh")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    if email_is_admin(str(user.email)) and not user.is_admin:
        user.is_admin = True
        await session.commit()
        await session.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=user_response(user),
    )


@router.get("/me", response_model=UserResponse)
async def auth_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    return user_response(current_user)
