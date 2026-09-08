from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(alias="DATABASE_URL")
    session_secret: str | None = Field(default=None, alias="SESSION_SECRET")
    redis_url: str | None = Field(default=None, alias="REDIS_URL")
    internal_port: int = Field(default=8002, alias="ARGUS_INTERNAL_PORT")
    analysis_worker: bool = Field(default=True, alias="ARGUS_ANALYSIS_WORKER")
    max_upload_bytes: int = 5 * 1024 * 1024

    @property
    def sqlalchemy_url(self) -> str:
        return self.database_url.replace("postgres://", "postgresql+psycopg://", 1).replace(
            "postgresql://", "postgresql+psycopg://", 1
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
