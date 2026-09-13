from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ApplicationPaths:
    data_dir: Path
    config_dir: Path
    state_dir: Path


def application_paths() -> ApplicationPaths:
    name = "Wydatki" if getattr(sys, "frozen", False) else "Wydatki-dev"
    if sys.platform == "win32":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / name
        return ApplicationPaths(data_dir=root, config_dir=root, state_dir=root)

    data_dir = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / name
    config_dir = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / name
    state_dir = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state")) / name
    return ApplicationPaths(data_dir=data_dir, config_dir=config_dir, state_dir=state_dir)
