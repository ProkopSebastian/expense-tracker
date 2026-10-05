# PyInstaller spec for the Linux build; run through scripts/build_linux.sh.
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules, copy_metadata

repo_root = Path(SPECPATH).parent
icon_png = repo_root / "scripts" / "assets" / "app.png"

# Newer distributions' GPU drivers (Mesa, Intel media) need a newer C++ runtime than the
# Ubuntu 22.04 build machine has; bundling the old one makes Qt WebEngine abort at startup.
system_runtime = ("libstdc++.so.6", "libgcc_s.so.1")

a = Analysis(
    [str(repo_root / "scripts" / "desktop_launcher.py")],
    pathex=[str(repo_root / "src")],
    datas=[
        (str(repo_root / "frontend" / "dist"), "frontend/dist"),
        (str(icon_png), "assets"),
    ] + copy_metadata("expense-tracker"),
    hiddenimports=collect_submodules("uvicorn"),
)
a.binaries = [binary for binary in a.binaries if Path(binary[0]).name not in system_runtime]

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    name="Wydatki",
    console=False,
    icon=[str(icon_png)],
)
