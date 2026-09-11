"""Local AI preferences. Secrets never appear in API responses or distribution bundles."""

import json
from pathlib import Path

from pydantic import BaseModel, SecretStr

from .config import settings


class AIPreferences(BaseModel):
    api_key: SecretStr | None = None
    clear_key: bool = False


def load_preferences(database_path: Path) -> None:
    path = database_path.parent / "ai-settings.json"
    if path.exists():
        try:
            data = json.loads(path.read_text())
        except OSError, ValueError:
            return  # A damaged optional setting must not block access to finances.
        settings.openai_api_key = SecretStr(data["api_key"]) if data.get("api_key") else None


def save_preferences(database_path: Path, entry: AIPreferences) -> None:
    key = settings.openai_api_key.get_secret_value() if settings.openai_api_key else ""
    if entry.clear_key:
        key = ""
    elif entry.api_key is not None:
        key = entry.api_key.get_secret_value().strip()
        if not key or len(key) > 500:
            raise ValueError("Podaj poprawny klucz albo wybierz jego usunięcie.")
    path = database_path.parent / "ai-settings.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"api_key": key}))
    temporary.chmod(0o600)
    temporary.replace(path)
    settings.openai_api_key = SecretStr(key) if key else None
