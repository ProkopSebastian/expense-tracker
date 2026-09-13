from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-5.6-luna"
    openai_web_search: bool = True
    database_path: Path = Path("expense-tracker.sqlite3")
    data_dir: Path = Path("data")
    configuration_dir: Path = Path(".")


settings = Settings()
