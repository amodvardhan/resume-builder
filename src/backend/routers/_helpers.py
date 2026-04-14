"""Shared ORM-to-schema converters used across routers."""

from __future__ import annotations

from pathlib import Path

from src.backend.config import job_integrations_configured
from src.backend.models import JobListing, JobMatch, JobPreference, JobSyncRun, User
from src.backend.schemas import (
    JobListingResponse,
    JobPostingEnrichment,
    JobListingWithScoreResponse,
    JobPreferenceResponse,
    JobSyncStatusResponse,
    JobSummaryResponse,
    MatchDetailResponse,
    MatchListItemResponse,
    MatchResponse,
    UserResponse,
)


def user_response(user: User) -> UserResponse:
    raw = getattr(user, "profile_photo_path", None)
    has_photo = bool(raw and Path(str(raw)).is_file())
    return UserResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        core_skills=user.core_skills if isinstance(user.core_skills, list) else [],
        is_admin=bool(getattr(user, "is_admin", False)),
        has_profile_photo=has_photo,
        phone=(str(getattr(user, "phone", None) or "").strip() or None),
        country=(str(getattr(user, "country", None) or "").strip() or None),
        linkedin_url=(str(getattr(user, "linkedin_url", None) or "").strip() or None),
    )


def job_preference_response(pref: JobPreference) -> JobPreferenceResponse:
    tc = pref.target_country_codes if isinstance(pref.target_country_codes, list) else []
    return JobPreferenceResponse(
        id=pref.id,
        user_id=pref.user_id,
        industry=pref.industry,
        role_categories=pref.role_categories if isinstance(pref.role_categories, list) else [],
        preferred_locations=pref.preferred_locations if isinstance(pref.preferred_locations, list) else [],
        experience_level=pref.experience_level,
        keywords=pref.keywords if isinstance(pref.keywords, list) else [],
        target_country_codes=[str(x) for x in tc],
        created_at=pref.created_at.isoformat(),
        updated_at=pref.updated_at.isoformat(),
    )


def job_listing_response(job: JobListing) -> JobListingResponse:
    return JobListingResponse(
        id=job.id,
        provider=job.provider,
        source_name=job.source_name,
        title=job.title,
        organization=job.organization,
        location=job.location,
        url=job.url,
        salary_range=job.salary_range,
        posted_at=job.posted_at.isoformat() if job.posted_at else None,
        application_closes_at=(
            job.application_closes_at.isoformat()
            if getattr(job, "application_closes_at", None)
            else None
        ),
        industry=job.industry,
        role_category=job.role_category,
        created_at=job.created_at.isoformat(),
    )


def job_listing_with_score_response(
    job: JobListing,
    match: JobMatch | None,
    *,
    posting_enrichment: JobPostingEnrichment | None = None,
) -> JobListingWithScoreResponse:
    base = job_listing_response(job)
    return JobListingWithScoreResponse(
        **base.model_dump(),
        match_id=match.id if match else None,
        overall_score=float(match.overall_score) if match else None,
        description_html=job.description_html,
        description_text=job.description_text or "",
        posting_enrichment=posting_enrichment,
    )


def job_sync_status_response(run: JobSyncRun) -> JobSyncStatusResponse:
    breakdown = run.sources_breakdown
    if breakdown is not None and not isinstance(breakdown, dict):
        breakdown = None
    flat: dict[str, int] | None = None
    if isinstance(breakdown, dict):
        flat = {
            str(k): int(v)
            for k, v in breakdown.items()
            if isinstance(v, (int, float)) and not isinstance(v, bool)
        }
        if not flat:
            flat = None

    return JobSyncStatusResponse(
        id=run.id,
        status=run.status,
        jobs_found=run.jobs_found,
        jobs_new=run.jobs_new,
        sources_breakdown=flat,
        integrations_configured=job_integrations_configured(),
        matches_created=int(getattr(run, "matches_created", 0) or 0),
        started_at=run.started_at.isoformat(),
        finished_at=run.finished_at.isoformat() if run.finished_at else None,
        error_message=run.error_message,
    )


def job_summary_response(
    job: JobListing,
    *,
    include_description: bool = False,
) -> JobSummaryResponse:
    return JobSummaryResponse(
        id=job.id,
        title=job.title,
        organization=job.organization,
        location=job.location,
        url=job.url,
        source_name=job.source_name,
        provider=job.provider,
        posted_at=job.posted_at.isoformat() if job.posted_at else None,
        description_text=job.description_text if include_description else "",
    )


def match_response(match: JobMatch) -> MatchResponse:
    nfu = getattr(match, "next_follow_up_at", None)
    raw_notes = getattr(match, "notes", None)
    notes_out = (str(raw_notes).strip() if raw_notes is not None else "") or None
    return MatchResponse(
        id=match.id,
        status=match.status,
        notes=notes_out,
        next_follow_up_at=nfu.isoformat() if nfu is not None else None,
    )


def match_list_item_response(match: JobMatch, job: JobListing) -> MatchListItemResponse:
    details = match.match_details if isinstance(match.match_details, dict) else {}
    raw_notes = getattr(match, "notes", None)
    notes_out = (str(raw_notes).strip() if raw_notes is not None else "") or None
    nfu = getattr(match, "next_follow_up_at", None)
    return MatchListItemResponse(
        id=match.id,
        job=job_summary_response(job, include_description=False),
        overall_score=match.overall_score,
        skill_match_score=match.skill_match_score,
        experience_match_score=match.experience_match_score,
        role_fit_score=match.role_fit_score,
        strengths=details.get("strengths", []),
        status=match.status,
        notes=notes_out,
        next_follow_up_at=nfu.isoformat() if nfu is not None else None,
        created_at=match.created_at.isoformat(),
    )


def match_detail_response(match: JobMatch, job: JobListing) -> MatchDetailResponse:
    details = match.match_details if isinstance(match.match_details, dict) else {}
    raw_notes = getattr(match, "notes", None)
    notes_out = (str(raw_notes).strip() if raw_notes is not None else "") or None
    nfu = getattr(match, "next_follow_up_at", None)
    return MatchDetailResponse(
        id=match.id,
        job=job_summary_response(job, include_description=True),
        overall_score=match.overall_score,
        skill_match_score=match.skill_match_score,
        experience_match_score=match.experience_match_score,
        role_fit_score=match.role_fit_score,
        strengths=details.get("strengths", []),
        match_details=details,
        status=match.status,
        notes=notes_out,
        next_follow_up_at=nfu.isoformat() if nfu is not None else None,
        created_at=match.created_at.isoformat(),
    )
