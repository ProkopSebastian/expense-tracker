from __future__ import annotations

from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from .paths import application_paths


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-5.6-luna"
    openai_web_search: bool = True
    database_path: Path = Field(default_factory=lambda: application_paths().data_dir / "expense-tracker.sqlite3")
    data_dir: Path = Field(default_factory=lambda: application_paths().data_dir / "data")
    configuration_dir: Path = Field(default_factory=lambda: application_paths().config_dir)


settings = Settings()
