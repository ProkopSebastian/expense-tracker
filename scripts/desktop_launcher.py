"""Desktop entry point for the frozen Windows app and the Linux launcher."""

from __future__ import annotations

import faulthandler
import html
import importlib
import json
import logging
import os
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
_WINDOW_SIZE = (1200, 820)
_MIN_WINDOW_SIZE = (380, 500)


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


def _screen_layout(screens) -> list[list[int]]:
    return sorted([screen.x, screen.y, screen.width, screen.height] for screen in screens)


def _current_screens(webview) -> list:
    try:
        return webview.screens
    except Exception:
        logger.exception("WINDOW screens unavailable")
        return []


def _read_window_state(path: Path) -> dict:
    try:
        saved = json.loads(path.read_text(encoding="utf-8"))
    except OSError, ValueError:
        return {}
    return saved if isinstance(saved, dict) else {}


def _window_options(saved: dict, screens) -> dict[str, object]:
    width, height = _WINDOW_SIZE
    if all(isinstance(saved.get(key), int) and saved[key] > 0 for key in ("width", "height")):
        width, height = saved["width"], saved["height"]
    options: dict[str, object] = {
        "maximized": saved.get("mode") == "maximized",
        "fullscreen": saved.get("mode") == "fullscreen",
    }
    layout = _screen_layout(screens)
    if saved.get("screens") == layout and all(isinstance(saved.get(key), int) for key in ("x", "y")):
        options["x"], options["y"] = saved["x"], saved["y"]
    elif layout:
        # The saved position belongs to another set of monitors and may now be off-screen, so the
        # system places the window, which must also fit on whichever screen it lands.
        width = min(width, min(screen[2] for screen in layout))
        height = min(height, min(screen[3] for screen in layout))
    options["width"] = max(width, _MIN_WINDOW_SIZE[0])
    options["height"] = max(height, _MIN_WINDOW_SIZE[1])
    return options


def _native_window_state(native) -> tuple[str | None, tuple[int | None, int | None, int, int] | None]:
    # pywebview reports neither full screen nor the size a maximized window restores to, and its
    # getters wait for the GUI thread that runs this, so the native window is asked directly.
    # The position is in the coordinates create_window expects on each platform; a maximized,
    # full-screen or minimized window keeps the last normal geometry and a minimized one its mode.
    if sys.platform == "darwin":
        import AppKit

        if native.isMiniaturized():
            return None, None
        if native.styleMask() & AppKit.NSWindowStyleMaskFullScreen:
            return "fullscreen", None
        if native.isZoomed():
            return "maximized", None
        frame = native.frame()
        content = native.contentRectForFrameRect_(frame).size
        top = AppKit.NSScreen.screens()[0].frame().size.height - frame.origin.y - frame.size.height
        return "normal", (int(frame.origin.x), int(top), int(content.width), int(content.height))
    if sys.platform == "win32":
        if native.is_fullscreen:
            return "fullscreen", None
        state = str(native.WindowState)
        if state == "Minimized":
            return None, None
        if state == "Maximized":
            return "maximized", None
        bounds, scale = native.Bounds, native._scale
        return "normal", tuple(int(value / scale) for value in (bounds.X, bounds.Y, bounds.Width, bounds.Height))
    from qtpy.QtCore import Qt
    from qtpy.QtWidgets import QApplication

    state = native.windowState()
    if state & Qt.WindowState.WindowFullScreen:
        return "fullscreen", None
    if state & Qt.WindowState.WindowMaximized:
        return "maximized", None
    if state & Qt.WindowState.WindowMinimized:
        return None, None
    if QApplication.platformName().startswith("wayland"):
        # Wayland neither tells a window where it is nor lets it choose; the compositor places it.
        return "normal", (None, None, native.width(), native.height())
    primary, position = QApplication.primaryScreen().geometry(), native.pos()
    return "normal", (position.x() - primary.x(), position.y() - primary.y(), native.width(), native.height())


def _remember_window_state(webview, window, path: Path) -> None:
    def save() -> None:
        try:
            mode, geometry = _native_window_state(window.native)
            saved = _read_window_state(path)
            if mode is not None:
                saved["mode"] = mode
            if geometry is not None:
                x, y, width, height = geometry
                saved = {key: value for key, value in saved.items() if key not in ("x", "y", "screens")}
                saved |= {"width": width, "height": height}
                if x is not None:
                    saved |= {"x": x, "y": y, "screens": _screen_layout(_current_screens(webview))}
            temporary = path.with_suffix(".tmp")
            temporary.write_text(json.dumps(saved), encoding="utf-8")
            temporary.replace(path)
        except Exception:
            logger.exception("WINDOW state not saved")

    window.events.closing += save


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


def _run_desktop(webview, log_path: Path, paths) -> None:
    from expense_tracker.updates.manager import UpdateManager

    icon_path = _icon_path()
    _configure_linux_app_identity(icon_path)
    if sys.platform.startswith("linux"):
        # Reading the screens before start() initialises pywebview, which would otherwise try GTK first.
        os.environ["PYWEBVIEW_GUI"] = "qt"

    closing = threading.Event()
    state: dict[str, object] = {}

    def close_server() -> None:
        closing.set()
        server = state.get("server")
        if server is not None:
            server.should_exit = True

    window_state = paths.state_dir / "window.json"
    window = webview.create_window(
        "Wydatki",
        html=_loading_page(),
        min_size=_MIN_WINDOW_SIZE,
        text_select=True,
        **_window_options(_read_window_state(window_state), _current_screens(webview)),
    )
    _remember_window_state(webview, window, window_state)
    updater = UpdateManager(paths.state_dir, window.destroy) if getattr(sys, "frozen", False) else None
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
        if updater is not None:
            app.state.updater = updater

        def choose_backup_path(name: str) -> Path | None:
            chosen = window.create_file_dialog(
                webview.FileDialog.SAVE, directory=str(Path.home()), save_filename=name,
                file_types=("Kopia Wydatków (*.zip)",),
            )
            if not chosen:
                return None
            return Path(chosen if isinstance(chosen, str) else chosen[0])

        # pywebview's Qt 6 backend cannot accept downloads, so the backup is saved through the
        # native save dialog on every platform.
        app.state.choose_backup_path = choose_backup_path

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
        if updater is not None:
            updater.start()

        def monitor_server() -> None:
            worker.join()
            if not closing.is_set():
                logger.error("BACKEND stopped while the desktop window was open")
                _native_message(
                    "Wydatki — błąd serwera",
                    f"Serwer aplikacji nieoczekiwanie się zatrzymał.\nSzczegóły: {log_path}",
                )

        threading.Thread(target=monitor_server, name="expense-tracker-monitor", daemon=True).start()

    logger.info("WINDOW starting with icon %s", icon_path)
    # pywebview defaults to private_mode=True, which discards localStorage (onboarding tour seen,
    # changelog last seen) on every launch; give it a real, persistent profile directory instead.
    webview.start(
        start_backend,
        icon=str(icon_path) if icon_path.exists() else None,
        private_mode=False,
        storage_path=str(paths.state_dir / "webview"),
    )
    logger.info("WINDOW closed")
    if updater is not None:
        updater.stop()

    closing.set()
    server = state.get("server")
    worker = state.get("worker")
    if server is not None:
        server.should_exit = True
    if worker is not None:
        worker.join(timeout=10)
        if worker.is_alive():
            logger.error("BACKEND did not stop within 10 seconds")
            return
    if updater is not None:
        updater.authorize_install()


def main() -> int:
    if "--version" in sys.argv:
        from expense_tracker.version import VERSION

        print(VERSION)
        return 0
    if len(sys.argv) == 3 and sys.argv[1] == "--apply-update":
        from contextlib import redirect_stderr, redirect_stdout

        from expense_tracker.updates.installer import apply_update

        plan = Path(sys.argv[2]).resolve()
        with (
            (plan.parent.parent.parent / "update.log").open("a", encoding="utf-8") as output,
            redirect_stdout(output), redirect_stderr(output),
        ):
            return apply_update(plan)
    if "--smoke-test" in sys.argv:
        from desktop_smoke import run

        run()
        if len(sys.argv) == 4 and sys.argv[2] == "--version-file":
            from expense_tracker.version import VERSION

            Path(sys.argv[3]).write_text(VERSION, encoding="utf-8")
        return 0

    log_path: Path | None = None
    log = None
    instance = None
    try:
        paths, log_path, log = _prepare_runtime()
        from expense_tracker.updates.installer import InstanceLock

        instance = InstanceLock(paths.state_dir / "instance.lock")
        if not instance.acquire():
            _native_message("Wydatki", "Aplikacja jest już uruchomiona lub trwa jej aktualizacja.")
            return 0
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
        if instance is not None:
            instance.release()
        if log is not None:
            logger.info("STOP Wydatki")
            faulthandler.disable()
            logging.shutdown()
            log.close()


if __name__ == "__main__":
    raise SystemExit(main())
