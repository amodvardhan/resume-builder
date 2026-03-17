"""Shared ORM-to-schema converters used across routers."""

from __future__ import annotations

from src.backend.models import CrawledJob, CrawlRun, JobMatch, JobPreference, User
from src.backend.schemas import (
    CrawledJobResponse,
    CrawlStatusResponse,
    JobPreferenceResponse,
    JobSummaryResponse,
    MatchDetailResponse,
    MatchListItemResponse,
    MatchResponse,
    UserResponse,
)


def user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        core_skills=user.core_skills if isinstance(user.core_skills, list) else [],
        is_admin=bool(getattr(user, "is_admin", False)),
    )


def job_preference_response(pref: JobPreference) -> JobPreferenceResponse:
    return JobPreferenceResponse(
        id=pref.id,
        user_id=pref.user_id,
        industry=pref.industry,
        role_categories=pref.role_categories if isinstance(pref.role_categories, list) else [],
        preferred_locations=pref.preferred_locations if isinstance(pref.preferred_locations, list) else [],
        experience_level=pref.experience_level,
        keywords=pref.keywords if isinstance(pref.keywords, list) else [],
        created_at=pref.created_at.isoformat(),
        updated_at=pref.updated_at.isoformat(),
    )


def crawled_job_response(job: CrawledJob) -> CrawledJobResponse:
    return CrawledJobResponse(
        id=job.id,
        source_name=job.source_name,
        title=job.title,
        organization=job.organization,
        location=job.location,
        url=job.url,
        salary_range=job.salary_range,
        posted_at=job.posted_at.isoformat() if job.posted_at else None,
        industry=job.industry,
        role_category=job.role_category,
        created_at=job.created_at.isoformat(),
    )


def crawl_status_response(run: CrawlRun) -> CrawlStatusResponse:
    return CrawlStatusResponse(
        id=run.id,
        status=run.status,
        jobs_found=run.jobs_found,
        jobs_new=run.jobs_new,
        started_at=run.started_at.isoformat(),
        finished_at=run.finished_at.isoformat() if run.finished_at else None,
        error_message=run.error_message,
    )


def job_summary_response(job: CrawledJob) -> JobSummaryResponse:
    return JobSummaryResponse(
        id=job.id,
        title=job.title,
        organization=job.organization,
        location=job.location,
        url=job.url,
        source_name=job.source_name,
        posted_at=job.posted_at.isoformat() if job.posted_at else None,
    )


def match_response(match: JobMatch) -> MatchResponse:
    return MatchResponse(
        id=match.id,
        status=match.status,
    )


def match_list_item_response(match: JobMatch, job: CrawledJob) -> MatchListItemResponse:
    details = match.match_details if isinstance(match.match_details, dict) else {}
    return MatchListItemResponse(
        id=match.id,
        job=job_summary_response(job),
        overall_score=match.overall_score,
        skill_match_score=match.skill_match_score,
        experience_match_score=match.experience_match_score,
        role_fit_score=match.role_fit_score,
        strengths=details.get("strengths", []),
        status=match.status,
        created_at=match.created_at.isoformat(),
    )


def match_detail_response(match: JobMatch, job: CrawledJob) -> MatchDetailResponse:
    details = match.match_details if isinstance(match.match_details, dict) else {}
    return MatchDetailResponse(
        id=match.id,
        job=job_summary_response(job),
        overall_score=match.overall_score,
        skill_match_score=match.skill_match_score,
        experience_match_score=match.experience_match_score,
        role_fit_score=match.role_fit_score,
        strengths=details.get("strengths", []),
        match_details=details,
        status=match.status,
        created_at=match.created_at.isoformat(),
    )
