"""
APScheduler integration — runs periodic job crawls for all users with preferences.

Lifecycle:
  - ``start_scheduler()`` is called on FastAPI startup.
  - ``shutdown_scheduler()`` is called on FastAPI shutdown.
  - The cron expression is read from ``settings.crawl_cron`` (default: ``0 6 * * *``).
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from src.backend.config import settings
from src.backend.database import async_session_factory
from src.backend.models import JobPreference
from src.backend.services.job_crawler import run_crawl_for_user

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_scheduled_crawls() -> None:
    """Iterate over all users who have job preferences and crawl for each."""
    logger.info("Scheduled crawl triggered")
    async with async_session_factory() as session:
        result = await session.execute(select(JobPreference.user_id))
        user_ids = [row[0] for row in result.all()]

    if not user_ids:
        logger.info("No users with job preferences — skipping crawl")
        return

    logger.info("Running scheduled crawl for %d users", len(user_ids))
    for uid in user_ids:
        try:
            await run_crawl_for_user(uid)
            logger.info("Scheduled crawl completed for user %s", uid)
        except Exception:
            logger.exception("Scheduled crawl failed for user %s", uid)


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
    trigger = _parse_cron(settings.crawl_cron)
    _scheduler.add_job(
        _run_scheduled_crawls,
        trigger=trigger,
        id="job_crawl",
        name="Periodic job crawl",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Scheduler started — cron: %s", settings.crawl_cron)


def shutdown_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler shut down")
