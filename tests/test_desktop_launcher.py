import importlib.util
import tomllib
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


def test_windows_metadata_matches_project_version():
    root = Path(__file__).parents[1]
    with (root / "pyproject.toml").open("rb") as source:
        project_version = tomllib.load(source)["project"]["version"]
    windows_metadata = (root / "scripts" / "windows_version_info.txt").read_text(encoding="utf-8")

    assert project_version == desktop_launcher.APP_VERSION
    assert f"StringStruct('ProductVersion', '{project_version}.0')" in windows_metadata
