import importlib.util
from pathlib import Path

LAUNCHER_PATH = Path(__file__).parents[1] / "scripts" / "desktop_launcher.py"
SPEC = importlib.util.spec_from_file_location("desktop_launcher", LAUNCHER_PATH)
assert SPEC is not None and SPEC.loader is not None
desktop_launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(desktop_launcher)


def test_windows_uses_native_ico_icon(monkeypatch):
    monkeypatch.setattr(desktop_launcher.sys, "platform", "win32")
    monkeypatch.setattr(desktop_launcher, "_asset_root", lambda: Path("bundle"))

    assert desktop_launcher._icon_path() == Path("bundle/assets/app.ico")


def test_non_windows_uses_png_icon(monkeypatch):
    monkeypatch.setattr(desktop_launcher.sys, "platform", "linux")
    monkeypatch.setattr(desktop_launcher, "_asset_root", lambda: Path("bundle"))

    assert desktop_launcher._icon_path() == Path("bundle/assets/app.png")


def test_linux_runtime_data_is_kept_outside_the_checkout(monkeypatch, tmp_path):
    monkeypatch.setattr(desktop_launcher.sys, "platform", "linux")
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "data"))

    assert desktop_launcher._runtime_data_directory() == tmp_path / "data" / "Wydatki-dev"


def test_windows_runtime_data_uses_local_app_data(monkeypatch, tmp_path):
    monkeypatch.setattr(desktop_launcher.sys, "platform", "win32")
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "AppData"))

    assert desktop_launcher._runtime_data_directory() == tmp_path / "AppData" / "Wydatki-dev"


def test_frozen_application_uses_the_production_data_directory(monkeypatch, tmp_path):
    monkeypatch.setattr(desktop_launcher.sys, "platform", "linux")
    monkeypatch.setattr(desktop_launcher.sys, "frozen", True, raising=False)
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "data"))

    assert desktop_launcher._runtime_data_directory() == tmp_path / "data" / "Wydatki"
