"""Application settings — all secrets and API keys come from environment only.

Every sensitive value is read via pydantic-settings from process environment and/or
``.env`` (``APP_`` prefix). Do not add default passwords, tokens, or keys in this file.
"""

import logging
from pathlib import Path

from pydantic import Field, HttpUrl, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _PROJECT_ROOT / ".env"
_SETTINGS_SOURCES: dict = {
    "env_prefix": "APP_",
    "env_file_encoding": "utf-8",
    "extra": "ignore",
}
if _ENV_FILE.is_file():
    _SETTINGS_SOURCES["env_file"] = str(_ENV_FILE)


class Settings(BaseSettings):
    """Loaded from ``.env`` (if present) and/or OS environment (``APP_*``)."""

    model_config = SettingsConfigDict(**_SETTINGS_SOURCES)

    # --- Required (no defaults — must be set in .env or deployment env) ---
    database_url: str = Field(
        ...,
        min_length=1,
        description="PostgreSQL async URL; set APP_DATABASE_URL",
    )
    jwt_secret: str = Field(
        ...,
        min_length=1,
        description="HS256 signing secret; set APP_JWT_SECRET",
    )

    # --- Optional toggles / non-secret defaults ---
    debug: bool = False
    # Comma-separated origins (e.g. https://app.example.com,http://localhost:5173).
    # Use "*" only for open dev; wildcard disables credential sharing per CORS spec.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    openai_model: str = "gpt-4o"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # APScheduler — periodic job sync (primary + secondary providers)
    job_sync_cron: str = "0 6 * * *"

    # Drop aggregator listings with no close date older than this (0 = disable age cutoff).
    job_listing_max_age_days: int = 90

    admin_emails: str = ""

    # --- API keys / tokens: empty means provider is skipped (never hardcode keys here) ---
    openai_api_key: str = ""

    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    adzuna_country: str = "gb"
    adzuna_results_per_page: int = 25
    adzuna_max_search_pairs: int = 6

    jooble_api_key: str = ""
    jooble_page: int = 1
    jooble_radius_km: int = 25

    linkedin_access_token: str = ""
    linkedin_organization_urn: str = ""
    linkedin_api_version: str = "202411"

    xing_access_token: str = ""
    xing_api_base: str = "https://api.xing.com"

    naukri_gulf_xml_feed_url: str = ""

    # IO careers module — comma-separated RSS URLs (authoritative feeds only; no JobListing sync).
    # Tier A defaults: UN Careers, UNDP, ReliefWeb (override or clear via env).
    io_job_rss_urls: str = Field(
        default=(
            "https://careers.un.org/jobfeed,"
            "https://jobs.undp.org/cj_rss_feed.cfm,"
            "https://reliefweb.int/jobs/rss.xml"
        ),
        description="Allowlisted RSS feed URLs for /api/v1/io-jobs ingestion (not mixed with job sync).",
    )
    # APScheduler — IO RSS poll (UTC cron). Default: hourly at :15.
    io_job_rss_cron: str = "15 * * * *"
    io_job_http_timeout_sec: float = 45.0
    # UNjobs ``/New/N`` hub pages: expand to ``/vacancies/<id>`` when HTML is fetchable (often blocked).
    io_job_unjobs_expand_hubs: bool = True
    io_job_unjobs_max_vacancies_per_hub: int = 200

    templates_dir: Path = _PROJECT_ROOT / "storage" / "templates"
    output_dir: Path = _PROJECT_ROOT / "storage" / "output"
    resumes_dir: Path = _PROJECT_ROOT / "storage" / "resumes"
    profile_photos_dir: Path = _PROJECT_ROOT / "storage" / "profile_photos"


settings = Settings()


def admin_email_set() -> set[str]:
    return {
        e.strip().lower()
        for e in settings.admin_emails.split(",")
        if e.strip()
    }


def email_is_admin(email: str) -> bool:
    return email.strip().lower() in admin_email_set()


logger = logging.getLogger(__name__)


def io_job_rss_allowlist() -> list[str]:
    """Return validated, deduplicated feed URLs from ``APP_IO_JOB_RSS_URLS`` (order preserved)."""
    raw = (settings.io_job_rss_urls or "").strip()
    if not raw:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        try:
            url = str(HttpUrl(p))
        except ValidationError:
            logger.warning("Skipping invalid APP_IO_JOB_RSS_URLS entry: %s", p[:120])
            continue
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def job_integrations_configured() -> dict[str, bool]:
    """Which job fetchers have credentials in env (empty means that source is skipped)."""
    s = settings
    return {
        "adzuna": bool(
            (s.adzuna_app_id or "").strip() and (s.adzuna_app_key or "").strip(),
        ),
        "jooble": bool((s.jooble_api_key or "").strip()),
        "linkedin": bool(
            (s.linkedin_access_token or "").strip()
            and (s.linkedin_organization_urn or "").strip(),
        ),
        "xing": bool((s.xing_access_token or "").strip()),
        "naukri_gulf": bool((s.naukri_gulf_xml_feed_url or "").strip()),
    }
