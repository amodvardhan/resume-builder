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
from sqlalchemy.ext.asyncio import AsyncSession

from src.backend.database import Base, async_session_factory, engine
from src.backend.models import Resume
from src.backend.routers import (
    admin_crawl_sources,
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
from src.backend.services.crawl_sources_service import ensure_default_crawl_sources
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
app.include_router(admin_crawl_sources.router)
app.include_router(dashboard.router)
app.include_router(files.router)


# ---------------------------------------------------------------------------
# Lifecycle events
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def _startup() -> None:
    lt = text(f"SET LOCAL lock_timeout = '{_PG_LOCK_TIMEOUT}'")
    async with engine.begin() as conn:
        await conn.execute(lt)
        await conn.run_sync(Base.metadata.create_all)

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

    async with AsyncSession(engine) as session:
        await ensure_default_crawl_sources(session)

    asyncio.create_task(_reparse_resumes_background())
    start_scheduler()


@app.on_event("shutdown")
async def _shutdown() -> None:
    shutdown_scheduler()
