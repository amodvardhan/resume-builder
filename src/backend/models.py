import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint, Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.backend.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    core_skills: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    is_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    profile_photo_path: Mapped[str | None] = mapped_column(
        String(1024),
        nullable=True,
    )


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    is_master: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    original_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    file_type: Mapped[str] = mapped_column(String(10), nullable=False)
    extracted_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("idx_resumes_user_id", "user_id"),
    )


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    resume_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("resumes.id", ondelete="SET NULL"),
        nullable=True,
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    job_title: Mapped[str] = mapped_column(String(255), nullable=False)
    organization: Mapped[str] = mapped_column(String(255), nullable=False)
    job_description_html: Mapped[str] = mapped_column(Text, nullable=False)
    cover_letter_sentiment: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    tailored_resume_url: Mapped[str | None] = mapped_column(
        String(1024), nullable=True
    )
    cover_letter_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_application_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("applications.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("idx_applications_user_id", "user_id"),
        Index("idx_applications_resume_id", "resume_id"),
        Index("idx_applications_template_id", "template_id"),
        Index("idx_applications_reference_id", "reference_application_id"),
    )


class JobPreference(Base):
    __tablename__ = "job_preferences"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_categories: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    preferred_locations: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    experience_level: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    keywords: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="[]"
    )
    target_country_codes: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default="[]",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("idx_job_preferences_user_id", "user_id"),
    )


class JobListing(Base):
    """Job rows ingested from LinkedIn, XING, or Naukri Gulf integrations."""

    __tablename__ = "job_listings"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    provider: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # linkedin | xing | naukri_gulf | legacy
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    external_id: Mapped[str] = mapped_column(String(1024), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    organization: Mapped[str | None] = mapped_column(String(512), nullable=True)
    location: Mapped[str | None] = mapped_column(String(512), nullable=True)
    description_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    description_text: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    salary_range: Mapped[str | None] = mapped_column(String(255), nullable=True)
    posted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    application_closes_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    accepts_applications: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true",
    )
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role_category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint(
            "provider", "external_id",
            name="uq_job_listings_provider_external",
        ),
        Index("idx_job_listings_industry_role", "industry", "role_category"),
        Index("idx_job_listings_ingested_at", "ingested_at"),
    )


class JobSyncRun(Base):
    """Audit trail for user-triggered or scheduled job sync runs."""

    __tablename__ = "job_sync_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="running"
    )
    jobs_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    jobs_new: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # JobMatch rows inserted as a result of AI scoring after this run (same user).
    matches_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Per-provider counts of listings that passed keyword filter this run (provider id -> count).
    sources_breakdown: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # job_listings.id values from this run's keyword batch (for "see all jobs from last search").
    last_batch_listing_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("idx_job_sync_runs_user_id", "user_id"),
        Index("idx_job_sync_runs_started_at", "user_id", "started_at"),
    )


class JobMatch(Base):
    __tablename__ = "job_matches"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    job_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("job_listings.id", ondelete="CASCADE"),
        nullable=False,
    )
    overall_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    skill_match_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    experience_match_score: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    role_fit_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    match_details: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, server_default="new"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_job_matches_user_job"),
        Index("idx_job_matches_user_id", "user_id"),
        Index("idx_job_matches_score", "user_id", "overall_score"),
        Index("idx_job_matches_status", "user_id", "status"),
    )
