"""Rules for whether a job listing is shown (not expired / still open for applications)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from src.backend.config import settings


def listing_is_visible(
    *,
    posted_at: datetime | None,
    application_closes_at: datetime | None,
    accepts_applications: bool,
    now: datetime | None = None,
    max_age_days: int | None = None,
) -> bool:
    """Return False for expired listings or those marked as not accepting applications."""
    if now is None:
        now = datetime.now(timezone.utc)
    if max_age_days is None:
        max_age_days = settings.job_listing_max_age_days

    if not accepts_applications:
        return False
    if application_closes_at is not None and application_closes_at <= now:
        return False
    if max_age_days > 0 and posted_at is not None:
        cutoff = now - timedelta(days=max_age_days)
        if posted_at < cutoff:
            return False
    return True


def job_dict_is_visible(job: dict[str, Any], *, now: datetime | None = None) -> bool:
    return listing_is_visible(
        posted_at=job.get("posted_at"),
        application_closes_at=job.get("application_closes_at"),
        accepts_applications=bool(job.get("accepts_applications", True)),
        now=now,
        max_age_days=settings.job_listing_max_age_days,
    )


def orm_listing_is_visible(job: Any, *, now: datetime | None = None) -> bool:
    """Same rules as :func:`listing_is_visible` for a persisted ``JobListing`` row."""
    return listing_is_visible(
        posted_at=getattr(job, "posted_at", None),
        application_closes_at=getattr(job, "application_closes_at", None),
        accepts_applications=bool(getattr(job, "accepts_applications", True)),
        now=now,
        max_age_days=settings.job_listing_max_age_days,
    )
