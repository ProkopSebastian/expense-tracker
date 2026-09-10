from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from expense_tracker.database import Database


@pytest.fixture
def database(tmp_path: Path) -> Iterator[Database]:
    db = Database(tmp_path / "expenses.sqlite3")
    try:
        yield db
    finally:
        db.close()
