"""Job integrations: primary (Adzuna, Jooble) and secondary (LinkedIn, XING, Naukri Gulf)."""

from src.backend.services.job_integrations.sync import run_job_sync_for_user

__all__ = ["run_job_sync_for_user"]
