from pathlib import Path

from pydantic_settings import BaseSettings

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://amod:pgadmin1234!@localhost:5432/resume_builder"
    debug: bool = False

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

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
