"""Application configuration settings."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the RetailIQ Analytics API."""

    app_name: str = "RetailIQ Analytics API"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./workspace_data/app.db"
    workspace_dir: Path = Path("./workspace_data")
    max_preview_rows: int = 12
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(env_prefix="VDT_", extra="ignore")


settings = Settings()
