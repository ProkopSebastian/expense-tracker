"""Exercise the frozen backend and bundled frontend without opening a GUI."""

import json
import os
import socket
import sys
import threading
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen


def run() -> None:
    if sys.platform == "win32":
        import webview  # noqa: F401 -- import success proves the bundled GUI backend loads
    previous = Path.cwd()
    with TemporaryDirectory() as directory:
        try:
            os.chdir(directory)
            os.environ["DATABASE_PATH"] = str(Path(directory) / "smoke.sqlite3")
            os.environ["DATA_DIR"] = str(Path(directory) / "data")
            import uvicorn

            from expense_tracker.api import create_app

            listener = socket.socket()
            listener.bind(("127.0.0.1", 0))
            url = f"http://127.0.0.1:{listener.getsockname()[1]}"
            server = uvicorn.Server(uvicorn.Config(create_app(), log_config=None))
            worker = threading.Thread(target=lambda: server.run(sockets=[listener]), daemon=True)
            worker.start()
            try:
                for _ in range(200):
                    if server.started:
                        break
                    if not worker.is_alive():
                        raise RuntimeError("Backend stopped during startup")
                    time.sleep(0.1)
                if not server.started:
                    raise RuntimeError("Backend startup timed out")
                with urlopen(url + "/api/meta", timeout=5) as response:
                    assert json.load(response)["categories"]
                with urlopen(url, timeout=5) as response:
                    assert b'id="root"' in response.read()
            finally:
                server.should_exit = True
                worker.join(timeout=15)
                listener.close()
                if worker.is_alive():
                    raise RuntimeError("Backend did not stop")
        finally:
            os.chdir(previous)
