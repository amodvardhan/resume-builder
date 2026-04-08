"""
FastAPI application factory — lean entry point.
All route handlers are in src/backend/routers/.
Schemas are in src/backend/schemas.py.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from src.backend.database import Base, async_session_factory, engine
from src.backend.models import Resume
from src.backend.routers import (
    applications,
    auth,
    dashboard,
    files,
    jobs,
    preferences,
    resumes,
    templates,
    users,
)
from src.backend.services.resume_parser import extract_resume_text
from src.backend.services.scheduler import shutdown_scheduler, start_scheduler

logger = logging.getLogger(__name__)

# Per-attempt DDL wait; full suite is retried on lock timeout (migrations are idempotent).
_PG_LOCK_TIMEOUT = "60s"
_MIGRATION_RETRIES = 8
_MIGRATION_RETRY_DELAY_SEC = 10


def _is_pg_lock_timeout(err: BaseException) -> bool:
    cur: BaseException | None = err
    while cur is not None:
        if cur.__class__.__name__ == "LockNotAvailableError":
            return True
        if "lock timeout" in str(cur).lower():
            return True
        cur = cur.__cause__  # type: ignore[assignment]
    return False


async def _apply_schema_migrations() -> None:
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")

    async with engine.begin() as conn:
        await conn.execute(lt)
        old_col = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'applications' "
            "AND column_name = 'job_description'"
        ))
        if old_col.scalar() is not None:
            await conn.execute(text(
                "ALTER TABLE applications "
                "RENAME COLUMN job_description TO job_description_html"
            ))
            logger.info("Migrated: renamed job_description -> job_description_html")

    async with engine.begin() as conn:
        await conn.execute(lt)
        col_exists = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'applications' "
            "AND column_name = 'resume_id'"
        ))
        if col_exists.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE applications "
                "ADD COLUMN resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL"
            ))
            logger.info("Migrated: added resume_id column to applications table")

    async with engine.begin() as conn:
        await conn.execute(lt)
        ref_col = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'applications' "
            "AND column_name = 'reference_application_id'"
        ))
        if ref_col.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE applications "
                "ADD COLUMN reference_application_id UUID "
                "REFERENCES applications(id) ON DELETE SET NULL"
            ))
            logger.info("Migrated: added reference_application_id column to applications table")

    async with engine.begin() as conn:
        await conn.execute(lt)
        tn = await conn.execute(text(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'applications' "
            "AND column_name = 'template_id'"
        ))
        if tn.scalar() == "NO":
            await conn.execute(text(
                "ALTER TABLE applications ALTER COLUMN template_id DROP NOT NULL"
            ))
            logger.info("Migrated: made template_id nullable on applications table")

    async with engine.begin() as conn:
        await conn.execute(lt)
        pw_col = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'users' "
            "AND column_name = 'password_hash'"
        ))
        if pw_col.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"
            ))
            logger.info("Migrated: added password_hash column to users table")

    async with engine.begin() as conn:
        await conn.execute(lt)
        admin_col = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'users' "
            "AND column_name = 'is_admin'"
        ))
        if admin_col.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false"
            ))
            logger.info("Migrated: added is_admin to users (REQ-017)")

    async with engine.begin() as conn:
        await conn.execute(lt)
        for col_name, ddl in (
            ("cover_letter_url", "ALTER TABLE applications ADD COLUMN cover_letter_url VARCHAR(1024)"),
            ("resume_pdf_url", "ALTER TABLE applications ADD COLUMN resume_pdf_url VARCHAR(1024)"),
            ("cover_letter_pdf_url", "ALTER TABLE applications ADD COLUMN cover_letter_pdf_url VARCHAR(1024)"),
        ):
            ac = await conn.execute(text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'applications' "
                f"AND column_name = '{col_name}'"
            ))
            if ac.scalar() is None:
                await conn.execute(text(ddl))
                logger.info("Migrated: applications.%s", col_name)


async def _migrate_users_profile_photo_path() -> None:
    """Add profile_photo_path for resume headshots."""
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")
    async with engine.begin() as conn:
        await conn.execute(lt)
        col = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'users' "
            "AND column_name = 'profile_photo_path'"
        ))
        if col.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE users ADD COLUMN profile_photo_path VARCHAR(1024)"
            ))
            logger.info("Migrated: users.profile_photo_path")


async def _migrate_users_contact_fields() -> None:
    """Add phone, country, linkedin_url for resume header / exports."""
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")
    async with engine.begin() as conn:
        await conn.execute(lt)
        for col_name, ddl in (
            ("phone", "ALTER TABLE users ADD COLUMN phone VARCHAR(64)"),
            ("country", "ALTER TABLE users ADD COLUMN country VARCHAR(128)"),
            ("linkedin_url", "ALTER TABLE users ADD COLUMN linkedin_url VARCHAR(512)"),
        ):
            col = await conn.execute(text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'users' "
                f"AND column_name = '{col_name}'"
            ))
            if col.scalar() is None:
                await conn.execute(text(ddl))
                logger.info("Migrated: users.%s", col_name)


async def _migrate_applications_export_snapshot() -> None:
    """JSON snapshot of tailored content + template_style for on-demand PDF regeneration."""
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")
    async with engine.begin() as conn:
        await conn.execute(lt)
        col = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'applications' "
            "AND column_name = 'export_snapshot'"
        ))
        if col.scalar() is None:
            await conn.execute(text("ALTER TABLE applications ADD COLUMN export_snapshot JSONB"))
            logger.info("Migrated: applications.export_snapshot")


async def _migrate_job_tables() -> None:
    """Replace crawl-era tables with job_listings / job_sync_runs (integrations)."""
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")
    async with engine.begin() as conn:
        await conn.execute(lt)
        await conn.execute(text("DROP TABLE IF EXISTS job_crawl_sources CASCADE"))

        has_crawled = await conn.execute(text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'crawled_jobs'"
        ))
        has_listings = await conn.execute(text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'job_listings'"
        ))

        if has_crawled.scalar() is not None:
            if has_listings.scalar() is None:
                await conn.execute(text("ALTER TABLE crawled_jobs RENAME TO job_listings"))
                logger.info("Renamed crawled_jobs -> job_listings")
            else:
                n_list = await conn.execute(text("SELECT COUNT(*) FROM job_listings"))
                nl = n_list.scalar() or 0
                has_matches = await conn.execute(text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = 'public' AND table_name = 'job_matches'"
                ))
                if has_matches.scalar() is not None:
                    n_match = await conn.execute(text("SELECT COUNT(*) FROM job_matches"))
                    nm = n_match.scalar() or 0
                else:
                    nm = 0
                if nl == 0 and nm == 0:
                    await conn.execute(text("DROP TABLE job_listings CASCADE"))
                    await conn.execute(text("ALTER TABLE crawled_jobs RENAME TO job_listings"))
                    logger.info(
                        "Dropped empty job_listings; renamed crawled_jobs -> job_listings",
                    )
                else:
                    logger.warning(
                        "Both crawled_jobs and job_listings exist (listings=%d, matches=%d); "
                        "skipping rename — resolve manually if upgrading.",
                        nl,
                        nm,
                    )

        has_cr = await conn.execute(text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'crawl_runs'"
        ))
        has_sr = await conn.execute(text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'job_sync_runs'"
        ))
        if has_cr.scalar() is not None and has_sr.scalar() is None:
            await conn.execute(text("ALTER TABLE crawl_runs RENAME TO job_sync_runs"))
            logger.info("Renamed crawl_runs -> job_sync_runs")

        jl = await conn.execute(text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'job_listings'"
        ))
        if jl.scalar() is None:
            return

        await conn.execute(text(
            "ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS provider VARCHAR(32) "
            "NOT NULL DEFAULT 'legacy'"
        ))

        has_scraped = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'job_listings' "
            "AND column_name = 'scraped_at'"
        ))
        if has_scraped.scalar() is not None:
            await conn.execute(text(
                "ALTER TABLE job_listings RENAME COLUMN scraped_at TO ingested_at"
            ))
            logger.info("Renamed job_listings.scraped_at -> ingested_at")

        await conn.execute(text(
            "ALTER TABLE job_listings DROP CONSTRAINT IF EXISTS uq_crawled_jobs_source_external"
        ))
        await conn.execute(text(
            "UPDATE job_listings SET external_id = source_name || '::' || external_id "
            "WHERE provider = 'legacy' AND external_id NOT LIKE '%::%'"
        ))
        await conn.execute(text(
            "ALTER TABLE job_listings DROP CONSTRAINT IF EXISTS uq_job_listings_provider_external"
        ))
        await conn.execute(text(
            "ALTER TABLE job_listings ADD CONSTRAINT uq_job_listings_provider_external "
            "UNIQUE (provider, external_id)"
        ))


async def _migrate_job_sync_runs_sources_column() -> None:
    """Add sources_breakdown JSONB for per-provider listing counts per sync run."""
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")
    async with engine.begin() as conn:
        await conn.execute(lt)
        has_sr = await conn.execute(text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'job_sync_runs'"
        ))
        if has_sr.scalar() is None:
            return
        sb = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'job_sync_runs' "
            "AND column_name = 'sources_breakdown'"
        ))
        if sb.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE job_sync_runs ADD COLUMN sources_breakdown JSONB"
            ))
            logger.info("Migrated: job_sync_runs.sources_breakdown")

        mc = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'job_sync_runs' "
            "AND column_name = 'matches_created'"
        ))
        if mc.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE job_sync_runs ADD COLUMN matches_created INTEGER NOT NULL DEFAULT 0"
            ))
            logger.info("Migrated: job_sync_runs.matches_created")

        lb = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'job_sync_runs' "
            "AND column_name = 'last_batch_listing_ids'"
        ))
        if lb.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE job_sync_runs ADD COLUMN last_batch_listing_ids JSONB"
            ))
            logger.info("Migrated: job_sync_runs.last_batch_listing_ids")


async def _migrate_job_preferences_target_countries() -> None:
    """Add target_country_codes JSONB for per-user Adzuna/Jooble country scope."""
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")
    async with engine.begin() as conn:
        await conn.execute(lt)
        has_jp = await conn.execute(text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'job_preferences'"
        ))
        if has_jp.scalar() is None:
            return
        tc = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'job_preferences' "
            "AND column_name = 'target_country_codes'"
        ))
        if tc.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE job_preferences ADD COLUMN target_country_codes JSONB "
                "NOT NULL DEFAULT '[]'::jsonb"
            ))
            logger.info("Migrated: job_preferences.target_country_codes")


async def _migrate_job_listing_application_metadata() -> None:
    """Add application_closes_at and accepts_applications to job_listings."""
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")
    async with engine.begin() as conn:
        await conn.execute(lt)
        jl = await conn.execute(text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'job_listings'"
        ))
        if jl.scalar() is None:
            return
        ca = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'job_listings' "
            "AND column_name = 'application_closes_at'"
        ))
        if ca.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE job_listings ADD COLUMN application_closes_at TIMESTAMPTZ"
            ))
            logger.info("Migrated: job_listings.application_closes_at")
        aa = await conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'job_listings' "
            "AND column_name = 'accepts_applications'"
        ))
        if aa.scalar() is None:
            await conn.execute(text(
                "ALTER TABLE job_listings ADD COLUMN accepts_applications BOOLEAN "
                "NOT NULL DEFAULT true"
            ))
            logger.info("Migrated: job_listings.accepts_applications")


async def _reparse_resumes_background() -> None:
    """CPU-heavy file parsing must not block application startup."""
    try:
        async with async_session_factory() as session:
            result = await session.execute(select(Resume))
            all_resumes = result.scalars().all()
            refreshed = 0
            for resume in all_resumes:
                fp = Path(resume.file_path)
                if not fp.exists():
                    continue
                try:
                    fresh_text = await asyncio.to_thread(
                        extract_resume_text, fp, resume.file_type,
                    )
                except Exception:
                    logger.warning("Re-parse failed for %s, skipping", resume.id)
                    continue
                if fresh_text and len(fresh_text) > len(resume.extracted_text or ""):
                    resume.extracted_text = fresh_text
                    refreshed += 1
            if refreshed:
                await session.commit()
                logger.info("Re-parsed %d resume(s) in background", refreshed)
    except Exception:
        logger.exception("Background resume re-parse aborted")


app = FastAPI(title="Resume Builder", version="3.0.0")


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe for containers and load balancers (no database dependency)."""
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Register routers
# ---------------------------------------------------------------------------

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(templates.router)
app.include_router(resumes.router)
app.include_router(applications.router)
app.include_router(preferences.router)
app.include_router(jobs.router)
app.include_router(dashboard.router)
app.include_router(files.router)


# ---------------------------------------------------------------------------
# Lifecycle events
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def _startup() -> None:
    # Crawl/legacy job renames first (no-op on empty DB). Must run before create_all when
    # upgrading old installs that still have crawled_jobs / crawl_runs.
    await _migrate_job_tables()
    await _migrate_job_sync_runs_sources_column()
    await _migrate_job_listing_application_metadata()
    await _migrate_job_preferences_target_countries()

    # Create tables from ORM on fresh databases before ALTER-based migrations below.
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")
    async with engine.begin() as conn:
        await conn.execute(lt)
        await conn.run_sync(Base.metadata.create_all)

    await _migrate_users_profile_photo_path()
    await _migrate_users_contact_fields()
    await _migrate_applications_export_snapshot()

    for attempt in range(_MIGRATION_RETRIES):
        try:
            await _apply_schema_migrations()
            break
        except DBAPIError as e:
            if not _is_pg_lock_timeout(e) or attempt >= _MIGRATION_RETRIES - 1:
                logger.error(
                    "Schema migration failed. Close other connections to this database "
                    "(pgAdmin, TablePlus, duplicate uvicorn) and restart."
                )
                raise
            logger.warning(
                "Migration blocked by another session (attempt %d/%d); retrying in %ds",
                attempt + 1,
                _MIGRATION_RETRIES,
                _MIGRATION_RETRY_DELAY_SEC,
            )
            await asyncio.sleep(_MIGRATION_RETRY_DELAY_SEC)

    asyncio.create_task(_reparse_resumes_background())
    start_scheduler()


@app.on_event("shutdown")
async def _shutdown() -> None:
    shutdown_scheduler()
