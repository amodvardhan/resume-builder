"""
APScheduler integration — runs periodic job syncs for all users with preferences.

Lifecycle:
  - ``start_scheduler()`` is called on FastAPI startup.
  - ``shutdown_scheduler()`` is called on FastAPI shutdown.
  - The cron expression is read from ``settings.job_sync_cron`` (default: ``0 6 * * *``).
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from src.backend.config import settings
from src.backend.database import async_session_factory
from src.backend.models import JobPreference
from src.backend.services.io_job_ingest import run_io_job_rss_ingest
from src.backend.services.job_integrations import run_job_sync_for_user

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_scheduled_io_job_rss_ingest() -> None:
    """Poll allowlisted IO RSS feeds (standalone from job-board sync)."""
    logger.info("Scheduled IO job RSS ingest triggered")
    try:
        await run_io_job_rss_ingest()
    except Exception:
        logger.exception("Scheduled IO job RSS ingest failed")


async def _run_scheduled_job_syncs() -> None:
    """Iterate over all users who have job preferences and sync jobs for each."""
    logger.info("Scheduled job sync triggered")
    async with async_session_factory() as session:
        result = await session.execute(select(JobPreference.user_id))
        user_ids = [row[0] for row in result.all()]

    if not user_ids:
        logger.info("No users with job preferences — skipping job sync")
        return

    logger.info("Running scheduled job sync for %d users", len(user_ids))
    for uid in user_ids:
        try:
            await run_job_sync_for_user(uid)
            logger.info("Scheduled job sync completed for user %s", uid)
        except Exception:
            logger.exception("Scheduled job sync failed for user %s", uid)


def _parse_cron(expression: str) -> CronTrigger:
    """Parse a 5-field cron expression into an APScheduler CronTrigger."""
    parts = expression.strip().split()
    if len(parts) != 5:
        logger.warning(
            "Invalid cron expression %r, falling back to daily 06:00 UTC",
            expression,
        )
        parts = ["0", "6", "*", "*", "*"]

    return CronTrigger(
        minute=parts[0],
        hour=parts[1],
        day=parts[2],
        month=parts[3],
        day_of_week=parts[4],
        timezone="UTC",
    )


def start_scheduler() -> None:
    """Create and start the AsyncIOScheduler with the configured cron job."""
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = AsyncIOScheduler(timezone="UTC")
    trigger = _parse_cron(settings.job_sync_cron)
    _scheduler.add_job(
        _run_scheduled_job_syncs,
        trigger=trigger,
        id="job_sync",
        name="Periodic job sync (integrations)",
        replace_existing=True,
    )
    io_cron = (settings.io_job_rss_cron or "").strip()
    if io_cron:
        io_trigger = _parse_cron(io_cron)
        _scheduler.add_job(
            _run_scheduled_io_job_rss_ingest,
            trigger=io_trigger,
            id="io_job_rss_ingest",
            name="IO careers RSS ingest",
            replace_existing=True,
        )
        logger.info("IO RSS ingest scheduled — cron: %s", io_cron)
    else:
        logger.info("IO RSS ingest cron empty — periodic IO poll disabled")
    _scheduler.start()
    logger.info("Scheduler started — cron: %s", settings.job_sync_cron)


def shutdown_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler shut down")
