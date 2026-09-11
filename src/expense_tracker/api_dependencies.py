import sqlite3
from collections.abc import Iterator

from fastapi import Request


def get_connection(request: Request) -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(request.app.state.database_path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=5000")
    try:
        yield connection
    finally:
        connection.close()
