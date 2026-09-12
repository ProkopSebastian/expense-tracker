"""Desktop entry point for the frozen Windows app and the Linux launcher."""

from __future__ import annotations

import faulthandler
import html
import json
import logging
import os
import re
import socket
import sys
import threading
import time
from pathlib import Path
from typing import TextIO
from urllib.parse import urljoin
from urllib.request import urlopen

logger = logging.getLogger("expense_tracker.desktop")


def _asset_root() -> Path:
    return Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parent


def _icon_path() -> Path:
    """Return an icon format supported by the native GUI backend."""
    filename = "app.ico" if sys.platform == "win32" else "app.png"
    return _asset_root() / "assets" / filename


def _prepare_runtime() -> tuple[Path, TextIO]:
    if sys.platform == "win32":
        directory = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local" / "share")) / "Wydatki"
        directory.mkdir(parents=True, exist_ok=True)
        os.chdir(directory)
        os.environ["DATABASE_PATH"] = str(directory / "expense-tracker.sqlite3")
        os.environ["DATA_DIR"] = str(directory / "data")
        (directory / "data").mkdir(exist_ok=True)
        log_path = directory / "app.log"
    else:
        log_dir = Path.home() / ".local" / "state" / "Wydatki"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / "app.log"

    log = log_path.open("a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = log
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s [%(threadName)s] %(message)s",
        handlers=[logging.StreamHandler(log)],
        force=True,
    )
    faulthandler.enable(file=log, all_threads=True)
    logger.info("START Wydatki; frozen=%s; platform=%s", getattr(sys, "frozen", False), sys.platform)
    return log_path, log


def _native_message(title: str, message: str) -> None:
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, message, title, 0x10)
    else:
        print(f"{title}: {message}", file=sys.stderr)


def _show_message(webview, title: str, message: str, icon_path: Path) -> None:
    body = html.escape(message).replace("\n", "<br>")
    page = f"""<body style="margin:0;height:100vh;display:flex;align-items:center;
    justify-content:center;background:#f4f8f5;font-family:'Segoe UI',sans-serif">
    <p style="max-width:320px;text-align:center;font-size:14px;line-height:1.6">{body}</p>
    </body>"""
    webview.create_window(title, html=page, width=400, height=240, resizable=False)
    webview.start(icon=str(icon_path) if icon_path.exists() else None)


def _verify_frontend(base_url: str) -> None:
    with urlopen(base_url, timeout=2) as response:
        document = response.read()
    if b'id="root"' not in document:
        raise RuntimeError("Strona startowa nie zawiera elementu aplikacji.")

    match = re.search(rb'<script[^>]+src="([^"]+\.js)"', document)
    if match is None:
        raise RuntimeError("Strona startowa nie wskazuje pliku JavaScript.")
    script_url = urljoin(base_url, match.group(1).decode("utf-8"))
    with urlopen(script_url, timeout=2) as response:
        if not response.read(1):
            raise RuntimeError("Główny plik JavaScript jest pusty.")

    with urlopen(f"{base_url}/api/meta", timeout=2) as response:
        meta = json.load(response)
    if not isinstance(meta.get("categories"), list):
        raise RuntimeError("API aplikacji zwróciło nieprawidłową odpowiedź.")


def _wait_until_ready(server, worker: threading.Thread, base_url: str) -> None:
    deadline = time.monotonic() + 30
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if not worker.is_alive():
            raise RuntimeError("Serwer zatrzymał się podczas startu.")
        if server.started:
            try:
                _verify_frontend(base_url)
                logger.info("READY backend, HTML, JavaScript and API verified at %s", base_url)
                return
            except Exception as error:
                last_error = error
        time.sleep(0.1)
    detail = f" Ostatni błąd: {last_error}" if last_error else ""
    raise RuntimeError(f"Przekroczono czas oczekiwania na gotowość aplikacji.{detail}")


def _run_desktop(webview, log_path: Path) -> None:
    icon_path = _icon_path()
    if sys.platform == "win32":
        import ctypes

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        kernel.CreateMutexW.restype = ctypes.c_void_p
        mutex = kernel.CreateMutexW(None, False, "Local\\WydatkiDesktop")
        if not mutex or ctypes.get_last_error() == 183:
            logger.info("A second application instance was rejected")
            _show_message(webview, "Wydatki", "Aplikacja jest już uruchomiona.", icon_path)
            return

    import uvicorn

    from expense_tracker.api import create_app

    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    base_url = f"http://127.0.0.1:{port}"
    server = uvicorn.Server(uvicorn.Config(create_app(), log_config=None))

    def serve() -> None:
        logger.info("BACKEND starting on %s", base_url)
        try:
            server.run(sockets=[listener])
        except BaseException:
            logger.exception("BACKEND crashed")
            raise
        finally:
            logger.info("BACKEND stopped; requested=%s", server.should_exit)

    worker = threading.Thread(target=serve, name="expense-tracker-backend", daemon=True)
    worker.start()
    closing = threading.Event()
    try:
        _wait_until_ready(server, worker, base_url)
        window = webview.create_window("Wydatki", base_url, width=1200, height=820, min_size=(380, 500))

        def close_server() -> None:
            closing.set()
            server.should_exit = True

        window.events.closed += close_server

        def monitor_server() -> None:
            worker.join()
            if not closing.is_set():
                logger.error("BACKEND stopped while the desktop window was open")
                _native_message(
                    "Wydatki — błąd serwera",
                    f"Serwer aplikacji nieoczekiwanie się zatrzymał.\nSzczegóły: {log_path}",
                )

        threading.Thread(target=monitor_server, name="expense-tracker-monitor", daemon=True).start()
        gui = "qt" if sys.platform.startswith("linux") else None
        logger.info("WINDOW starting with icon %s", icon_path)
        webview.start(icon=str(icon_path) if icon_path.exists() else None, gui=gui)
        logger.info("WINDOW closed")
    finally:
        closing.set()
        server.should_exit = True
        worker.join(timeout=10)
        listener.close()
        if worker.is_alive():
            logger.error("BACKEND did not stop within 10 seconds")


def main() -> int:
    if "--smoke-test" in sys.argv:
        from desktop_smoke import run

        run()
        return 0

    log_path: Path | None = None
    log = None
    try:
        log_path, log = _prepare_runtime()
        logger.info("WEBVIEW importing")
        import webview

        logger.info("WEBVIEW imported")
        _run_desktop(webview, log_path)
        return 0
    except BaseException as error:
        if log is not None:
            logger.exception("FATAL desktop launcher error")
        _native_message(
            "Nie udało się uruchomić Wydatków",
            f"{error}\n\nSzczegóły: {log_path or 'dziennik systemu Windows'}",
        )
        return 1
    finally:
        if log is not None:
            logger.info("STOP Wydatki")
            faulthandler.disable()
            logging.shutdown()
            log.close()


if __name__ == "__main__":
    raise SystemExit(main())
