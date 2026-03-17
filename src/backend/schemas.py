"""
Pydantic request/response schemas for all API endpoints.
Maps 1:1 to the contract in .context/architecture-global.md §3.
"""

from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=8)
    core_skills: list[str] = []


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    core_skills: list[str]
    is_admin: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


class UserCreateRequest(BaseModel):
    full_name: str
    email: EmailStr
    core_skills: list[str] = []


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    core_skills: list[str] | None = None


# ---------------------------------------------------------------------------
# Resumes
# ---------------------------------------------------------------------------


class ResumeUploadResponse(BaseModel):
    resume_id: uuid.UUID
    original_filename: str
    file_type: str
    extracted_text_preview: str
    created_at: str


class ResumeListItem(BaseModel):
    resume_id: uuid.UUID
    original_filename: str
    file_type: str
    is_active: bool
    created_at: str


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


class TemplateResponse(BaseModel):
    template_id: uuid.UUID
    name: str
    file_path: str


# ---------------------------------------------------------------------------
# Applications / Tailoring
# ---------------------------------------------------------------------------


class ApplicationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    resume_id: uuid.UUID | None
    template_id: uuid.UUID | None
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None
    tailored_resume_url: str | None
    cover_letter_text: str | None
    reference_application_id: uuid.UUID | None
    created_at: str


class TailorRequest(BaseModel):
    user_id: uuid.UUID
    resume_id: uuid.UUID
    template_id: uuid.UUID | None = None
    template_style: str | None = None
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None = None


class TailorResponse(BaseModel):
    application_id: uuid.UUID
    tailored_resume_url: str
    cover_letter_text: str
    cover_letter_url: str = ""
    resume_pdf_url: str = ""
    cover_letter_pdf_url: str = ""


class TailorPreviewRequest(BaseModel):
    user_id: uuid.UUID
    resume_id: uuid.UUID
    template_id: uuid.UUID | None = None
    template_style: str | None = None
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None = None


class TailorPreviewResponse(BaseModel):
    summary: str
    experiences: list[str]
    skills: str
    education: str
    certifications: str = ""
    cover_letter: str
    original_resume_text: str = ""


class TailorConfirmRequest(BaseModel):
    user_id: uuid.UUID
    resume_id: uuid.UUID
    template_id: uuid.UUID | None = None
    template_style: str | None = None
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None = None
    summary: str
    experiences: list[str]
    skills: str
    education: str
    certifications: str = ""
    cover_letter: str


class TailorConfirmResponse(BaseModel):
    application_id: uuid.UUID
    tailored_resume_url: str
    cover_letter_text: str
    cover_letter_url: str = ""
    resume_pdf_url: str = ""
    cover_letter_pdf_url: str = ""


class RegenerateSectionRequest(BaseModel):
    user_id: uuid.UUID
    resume_id: uuid.UUID
    section_id: str
    current_content: str
    job_title: str
    organization: str
    job_description_html: str
    cover_letter_sentiment: str | None = None
    user_instruction: str | None = None


class RegenerateSectionResponse(BaseModel):
    section_id: str
    content: str


class CloneRequest(BaseModel):
    new_job_title: str
    new_organization: str
    new_job_description_html: str


class CloneResponse(BaseModel):
    new_application_id: uuid.UUID
    tailored_resume_url: str
    cover_letter_text: str


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------


class JobPreferenceRequest(BaseModel):
    industry: str | None = None
    role_categories: list[str] = []
    preferred_locations: list[str] = []
    experience_level: str | None = None
    keywords: list[str] = []


class JobPreferenceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    industry: str | None
    role_categories: list[str]
    preferred_locations: list[str]
    experience_level: str | None
    keywords: list[str]
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Jobs / Crawling
# ---------------------------------------------------------------------------


class CrawlTriggerResponse(BaseModel):
    message: str
    status: str = "accepted"


class CrawlStatusResponse(BaseModel):
    id: uuid.UUID
    status: str
    jobs_found: int
    jobs_new: int
    started_at: str
    finished_at: str | None
    error_message: str | None


class CrawledJobResponse(BaseModel):
    id: uuid.UUID
    source_name: str
    title: str
    organization: str | None
    location: str | None
    url: str | None
    salary_range: str | None
    posted_at: str | None
    industry: str | None
    role_category: str | None
    created_at: str


class CrawledJobListResponse(BaseModel):
    items: list[CrawledJobResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------


class DashboardStatsResponse(BaseModel):
    total_matches: int
    average_score: float
    new_today: int
    saved_count: int
    tier_90_plus: int
    tier_70_89: int
    tier_50_69: int
    tier_below_50: int


class JobSummaryResponse(BaseModel):
    id: uuid.UUID
    title: str
    organization: str | None
    location: str | None
    url: str | None
    source_name: str
    posted_at: str | None


class MatchListItemResponse(BaseModel):
    id: uuid.UUID
    job: JobSummaryResponse
    overall_score: float
    skill_match_score: float
    experience_match_score: float
    role_fit_score: float
    strengths: list[str]
    status: str
    created_at: str


class MatchDetailResponse(MatchListItemResponse):
    job: JobSummaryResponse
    match_details: dict[str, Any]


class MatchListResponse(BaseModel):
    items: list[MatchListItemResponse]
    total: int
    page: int
    per_page: int


class MatchResponse(BaseModel):
    id: uuid.UUID
    status: str


class MatchStatusUpdateRequest(BaseModel):
    status: str


class MatchApplyResponse(BaseModel):
    summary: str
    experiences: list[str]
    skills: str
    education: str
    certifications: str = ""
    cover_letter: str
    original_resume_text: str = ""
