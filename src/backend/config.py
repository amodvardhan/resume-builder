from pathlib import Path

from pydantic_settings import BaseSettings

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://amod:pgadmin1234!@localhost:5432/resume_builder"
    debug: bool = False

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    crawl_cron: str = "0 6 * * *"
    # Comma-separated emails → is_admin=True on register/login sync
    admin_emails: str = ""
    # Adzuna API (https://developer.adzuna.com) — required for adzuna crawl source
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""

    templates_dir: Path = _PROJECT_ROOT / "storage" / "templates"
    output_dir: Path = _PROJECT_ROOT / "storage" / "output"
    resumes_dir: Path = _PROJECT_ROOT / "storage" / "resumes"

    model_config = {
        "env_prefix": "APP_",
        "env_file": str(_PROJECT_ROOT / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()


def admin_email_set() -> set[str]:
    return {
        e.strip().lower()
        for e in settings.admin_emails.split(",")
        if e.strip()
    }


def email_is_admin(email: str) -> bool:
    return email.strip().lower() in admin_email_set()
