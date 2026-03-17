"""Admin CRUD for job crawl sources (REQ-017)."""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.database import get_session
from src.backend.models import JobCrawlSource, User
from src.backend.services.auth_service import get_current_admin

router = APIRouter(
    prefix="/api/v1/admin/crawl-sources",
    tags=["admin"],
)


class CrawlSourceCreateRequest(BaseModel):
    source_key: str = Field(min_length=1, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)
    source_type: str = Field(pattern=r"^(api|html_scraper|rss)$")
    url_template: str = Field(min_length=1)
    headers: dict[str, str] = Field(default_factory=dict)
    rate_limit_seconds: float = Field(default=2.0, ge=0.5, le=120.0)
    selectors: dict[str, str] = Field(default_factory=dict)
    industries: list[str] = Field(default_factory=list)
    enabled: bool = True
    sort_order: int = 0

    @field_validator("source_key")
    @classmethod
    def key_slug(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9][a-z0-9_-]*$", v):
            raise ValueError(
                "source_key must start with alphanumeric; use lowercase, digits, -, _"
            )
        return v


class CrawlSourceUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    source_type: str | None = None
    url_template: str | None = None
    headers: dict[str, str] | None = None
    rate_limit_seconds: float | None = Field(default=None, ge=0.5, le=120.0)
    selectors: dict[str, str] | None = None
    industries: list[str] | None = None
    enabled: bool | None = None
    sort_order: int | None = None

    @field_validator("source_type")
    @classmethod
    def type_ok(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if v not in ("api", "html_scraper", "rss"):
            raise ValueError("Invalid source_type")
        return v


class CrawlSourceResponse(BaseModel):
    id: uuid.UUID
    source_key: str
    display_name: str
    source_type: str
    url_template: str
    headers: dict[str, str]
    rate_limit_seconds: float
    selectors: dict[str, str]
    industries: list[str]
    enabled: bool
    sort_order: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": False}


def _to_resp(row: JobCrawlSource) -> CrawlSourceResponse:
    return CrawlSourceResponse(
        id=row.id,
        source_key=row.source_key,
        display_name=row.display_name,
        source_type=row.source_type,
        url_template=row.url_template,
        headers=row.headers if isinstance(row.headers, dict) else {},
        rate_limit_seconds=float(row.rate_limit_seconds),
        selectors=row.selectors if isinstance(row.selectors, dict) else {},
        industries=list(row.industries) if isinstance(row.industries, list) else [],
        enabled=bool(row.enabled),
        sort_order=int(row.sort_order or 0),
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("", response_model=list[CrawlSourceResponse])
async def list_crawl_sources(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(get_current_admin),
) -> list[CrawlSourceResponse]:
    stmt = (
        select(JobCrawlSource)
        .order_by(JobCrawlSource.sort_order, JobCrawlSource.display_name)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [_to_resp(r) for r in rows]


@router.post("", response_model=CrawlSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_crawl_source(
    payload: CrawlSourceCreateRequest,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(get_current_admin),
) -> CrawlSourceResponse:
    exists = await session.execute(
        select(JobCrawlSource).where(JobCrawlSource.source_key == payload.source_key)
    )
    if exists.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail=f"source_key '{payload.source_key}' already exists",
        )
    row = JobCrawlSource(
        id=uuid.uuid4(),
        source_key=payload.source_key,
        display_name=payload.display_name,
        source_type=payload.source_type,
        url_template=payload.url_template,
        headers=payload.headers,
        rate_limit_seconds=payload.rate_limit_seconds,
        selectors=payload.selectors,
        industries=payload.industries,
        enabled=payload.enabled,
        sort_order=payload.sort_order,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_resp(row)


@router.get("/{source_id}", response_model=CrawlSourceResponse)
async def get_crawl_source(
    source_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(get_current_admin),
) -> CrawlSourceResponse:
    row = await session.get(JobCrawlSource, source_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Crawl source not found")
    return _to_resp(row)


@router.patch("/{source_id}", response_model=CrawlSourceResponse)
async def update_crawl_source(
    source_id: uuid.UUID,
    payload: CrawlSourceUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(get_current_admin),
) -> CrawlSourceResponse:
    row = await session.get(JobCrawlSource, source_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Crawl source not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    await session.commit()
    await session.refresh(row)
    return _to_resp(row)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_crawl_source(
    source_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(get_current_admin),
) -> None:
    row = await session.get(JobCrawlSource, source_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Crawl source not found")
    await session.delete(row)
    await session.commit()
