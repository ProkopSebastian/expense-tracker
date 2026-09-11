"""Desktop entry point (Windows frozen build and Linux via `uv run`): private
application data + a native window embedding the local web app, no terminal
and no separate browser tab."""

from __future__ import annotations

import contextlib
import os
import socket
import sys
import threading
import time
from pathlib import Path


def _asset_root() -> Path:
    return Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parent


def _show_message(webview, title: str, message: str, icon_path: Path) -> None:
    html = f"""<body style="margin:0;height:100vh;display:flex;align-items:center;
    justify-content:center;background:#f4f8f5;font-family:'Segoe UI',sans-serif">
    <p style="max-width:300px;text-align:center;font-size:14px;line-height:1.6">{message}</p>
    </body>"""
    webview.create_window(title, html=html, width=380, height=220, resizable=False)
    with contextlib.suppress(Exception):
        webview.start(icon=str(icon_path) if icon_path.exists() else None)


def main() -> None:
    if "--smoke-test" in sys.argv:
        from desktop_smoke import run

        run()
        return

    import webview

    icon_path = _asset_root() / "assets" / "app.png"
    windows = sys.platform == "win32"

    if windows:
        # Distributed as a standalone package: isolate each user's data in
        # AppData so re-extracting a new version doesn't strand the database.
        directory = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local" / "share")) / "Wydatki"
        directory.mkdir(parents=True, exist_ok=True)
        os.chdir(directory)
        os.environ["DATABASE_PATH"] = str(directory / "expense-tracker.sqlite3")
        os.environ["DATA_DIR"] = str(directory / "data")
        (directory / "data").mkdir(exist_ok=True)
        log_path = directory / "app.log"
    else:
        # Run from a checked-out repo (same as start.sh): keep using whatever
        # database/data folder the working directory already points to,
        # rather than silently starting a second, empty one elsewhere.
        log_dir = Path.home() / ".local" / "state" / "Wydatki"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / "app.log"

    log = log_path.open("a", encoding="utf-8")
    sys.stdout = sys.stderr = log

    if windows:
        import ctypes

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        kernel.CreateMutexW.restype = ctypes.c_void_p
        mutex = kernel.CreateMutexW(None, False, "Local\\WydatkiDesktop")
        if not mutex or ctypes.get_last_error() == 183:
            _show_message(webview, "Wydatki", "Aplikacja jest już uruchomiona.", icon_path)
            return

    try:
        import uvicorn

        from expense_tracker.api import create_app

        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(create_app(), log_config=None))
        worker = threading.Thread(target=lambda: server.run(sockets=[listener]), daemon=True)
        worker.start()
        for _ in range(300):
            if server.started:
                break
            if not worker.is_alive():
                raise RuntimeError("Serwer zatrzymał się podczas startu.")
            time.sleep(0.1)
        else:
            raise RuntimeError("Przekroczono czas oczekiwania na start aplikacji.")
    except Exception as error:
        _show_message(webview, "Nie udało się uruchomić", f"{error}\nSzczegóły: {log_path}", icon_path)
        return

    url = f"http://127.0.0.1:{port}"
    window = webview.create_window("Wydatki", url, width=1200, height=820, min_size=(380, 500))
    window.events.closed += lambda: setattr(server, "should_exit", True)
    gui = "qt" if sys.platform.startswith("linux") else None
    webview.start(icon=str(icon_path) if icon_path.exists() else None, gui=gui)
    server.should_exit = True
    worker.join(timeout=10)
    log.close()


if __name__ == "__main__":
    main()
