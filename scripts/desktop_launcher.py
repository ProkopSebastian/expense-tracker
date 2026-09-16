"""Desktop entry point for the frozen Windows app and the Linux launcher."""

from __future__ import annotations

import faulthandler
import html
import importlib
import json
import logging
import re
import socket
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import urlopen

logger = logging.getLogger("expense_tracker.desktop")
_linux_app = None
# A fixed port keeps the frontend on the same origin across restarts, so the browser's
# localStorage (onboarding tour seen, changelog last seen) actually persists between launches.
_PREFERRED_PORT = 51837


def _bind_backend_listener() -> socket.socket:
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        listener.bind(("127.0.0.1", _PREFERRED_PORT))
    except OSError:
        logger.info("PORT %d unavailable; falling back to a random port", _PREFERRED_PORT)
        listener.close()
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
    return listener


def _asset_root() -> Path:
    return Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parent


def _icon_path() -> Path:
    """Return an icon format supported by the native GUI backend."""
    filename = "app.ico" if sys.platform == "win32" else "app.png"
    return _asset_root() / "assets" / filename


def _configure_linux_app_identity(icon_path: Path) -> None:
    global _linux_app

    if not sys.platform.startswith("linux"):
        return

    from qtpy.QtGui import QIcon
    from qtpy.QtWidgets import QApplication

    importlib.import_module("qtpy.QtWebEngineWidgets")
    _linux_app = QApplication.instance() or QApplication(sys.argv)
    _linux_app.setApplicationName("Wydatki")
    _linux_app.setApplicationDisplayName("Wydatki")
    _linux_app.setDesktopFileName("wydatki")
    if icon_path.exists():
        _linux_app.setWindowIcon(QIcon(str(icon_path)))


def _runtime_data_directory() -> Path:
    from expense_tracker.paths import application_paths

    return application_paths().data_dir


def _prepare_runtime():
    from expense_tracker.paths import application_paths

    paths = application_paths()
    paths.data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    (paths.data_dir / "data").mkdir(mode=0o700, exist_ok=True)
    paths.config_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    paths.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    log_path = paths.state_dir / "app.log"

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
    return paths, log_path, log


def _native_message(title: str, message: str) -> None:
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, message, title, 0x10)
    else:
        print(f"{title}: {message}", file=sys.stderr)


def _message_page(message: str) -> str:
    body = html.escape(message).replace("\n", "<br>")
    return f"""<body style="margin:0;height:100vh;display:flex;align-items:center;
    justify-content:center;background:#f4f8f5;font-family:'Segoe UI',sans-serif">
    <p style="max-width:320px;text-align:center;font-size:14px;line-height:1.6">{body}</p>
    </body>"""


def _loading_page() -> str:
    return """<body style="margin:0;height:100vh;display:flex;flex-direction:column;gap:16px;
    align-items:center;justify-content:center;background:#f4f8f5;font-family:'Segoe UI',sans-serif">
    <div style="width:32px;height:32px;border-radius:50%;border:3px solid #d5e3d8;
    border-top-color:#3f8452;animation:spin 0.8s linear infinite"></div>
    <p style="font-size:14px;color:#3c4a3f">Ładowanie…</p>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </body>"""


def _show_message(webview, title: str, message: str, icon_path: Path) -> None:
    webview.create_window(title, html=_message_page(message), width=400, height=240, resizable=False)
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


def _acquire_single_instance_mutex() -> bool:
    import ctypes

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
    kernel.CreateMutexW.restype = ctypes.c_void_p
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]

    # A previous instance can take up to the 10s join timeout below to fully exit,
    # during which the mutex is still held; retry briefly before reporting "already running".
    deadline = time.monotonic() + 4
    while True:
        mutex = kernel.CreateMutexW(None, False, "Local\\WydatkiDesktop")
        already_running = not mutex or ctypes.get_last_error() == 183
        if not already_running:
            return True
        if time.monotonic() >= deadline:
            return False
        kernel.CloseHandle(mutex)
        time.sleep(0.25)


def _run_desktop(webview, log_path: Path, paths) -> None:
    icon_path = _icon_path()
    _configure_linux_app_identity(icon_path)
    if sys.platform == "win32" and not _acquire_single_instance_mutex():
        logger.info("A second application instance was rejected")
        _show_message(webview, "Wydatki", "Aplikacja jest już uruchomiona.", icon_path)
        return

    closing = threading.Event()
    state: dict[str, object] = {}

    def close_server() -> None:
        closing.set()
        server = state.get("server")
        if server is not None:
            server.should_exit = True

    window = webview.create_window(
        "Wydatki", html=_loading_page(), width=1200, height=820, min_size=(380, 500), text_select=True
    )
    window.events.closed += close_server

    def start_backend() -> None:
        import uvicorn

        from expense_tracker.api import create_app
        from expense_tracker.config import settings

        # Route the app's storage to the OS-appropriate directory picked by
        # application_paths(); otherwise Settings() falls back to paths relative
        # to whatever the process's working directory happens to be at launch.
        settings.data_dir = paths.data_dir / "data"
        app = create_app(
            database_path=paths.data_dir / "expense-tracker.sqlite3",
            configuration_dir=paths.config_dir,
        )

        listener = _bind_backend_listener()
        port = listener.getsockname()[1]
        base_url = f"http://127.0.0.1:{port}"
        server = uvicorn.Server(uvicorn.Config(app, log_config=None))
        state["server"] = server
        if closing.is_set():
            listener.close()
            return

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
        state["worker"] = worker

        try:
            _wait_until_ready(server, worker, base_url)
        except Exception as error:
            logger.exception("STARTUP failed")
            closing.set()
            server.should_exit = True
            worker.join(timeout=10)
            listener.close()
            window.load_html(_message_page(f"Nie udało się uruchomić Wydatków.\n{error}"))
            return

        if closing.is_set():
            server.should_exit = True
            worker.join(timeout=10)
            listener.close()
            return

        window.load_url(base_url)

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
    webview.start(start_backend, icon=str(icon_path) if icon_path.exists() else None, gui=gui)
    logger.info("WINDOW closed")

    closing.set()
    server = state.get("server")
    worker = state.get("worker")
    if server is not None:
        server.should_exit = True
    if worker is not None:
        worker.join(timeout=10)
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
        paths, log_path, log = _prepare_runtime()
        logger.info("WEBVIEW importing")
        import webview

        logger.info("WEBVIEW imported")
        _run_desktop(webview, log_path, paths)
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
