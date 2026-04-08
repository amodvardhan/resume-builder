"""Application settings — all secrets and API keys come from environment only.

Every sensitive value is read via pydantic-settings from process environment and/or
``.env`` (``APP_`` prefix). Do not add default passwords, tokens, or keys in this file.
"""

from pathlib import Path

from pydantic import Field
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
