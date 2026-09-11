from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = Field(default="local", alias="APP_ENV")
    database_url: str = Field(default="sqlite:///./argus_dev.db", alias="DATABASE_URL")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value:
            raise ValueError("DATABASE_URL must not be empty")
        if "://" not in value:
            raise ValueError("DATABASE_URL must be a SQLAlchemy database URL")
        return value

    def require_safe_database_for_environment(self) -> None:
        if self.app_env.lower() in {"local", "test", "development"}:
            return
        if self.database_url.startswith("sqlite"):
            raise ValueError("SQLite is only allowed for local development and tests")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.require_safe_database_for_environment()
    return settings

