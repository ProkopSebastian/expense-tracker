from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from .protocol import UpdateError


@dataclass(frozen=True)
class Installation:
    target: str
    path: Path
    kind: str


def child_environment() -> dict[str, str]:
    environment = dict(os.environ)
    for key in ("LD_LIBRARY_PATH", "LIBPATH"):
        original = environment.pop(f"{key}_ORIG", None)
        if original is None:
            environment.pop(key, None)
        else:
            environment[key] = original
    environment.pop("DYLD_LIBRARY_PATH", None)
    environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    return environment


def run_system(arguments: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(arguments, env=child_environment(), capture_output=True, timeout=10, **kwargs)


def detect_installation() -> Installation:
    if not getattr(sys, "frozen", False):
        raise UpdateError("Aktualizacje są dostępne w zainstalowanej aplikacji desktopowej.")
    machine = platform.machine().lower()
    architecture = {"amd64": "x86_64", "x86_64": "x86_64", "arm64": "arm64", "aarch64": "arm64"}.get(machine)
    executable = Path(sys.executable).resolve()
    if sys.platform == "win32" and architecture == "x86_64":
        return Installation("windows-x86_64", executable, "portable")
    if sys.platform == "darwin" and architecture in {"arm64", "x86_64"}:
        bundle = executable.parents[2]
        if bundle.suffix != ".app" or executable.parent.name != "MacOS":
            raise UpdateError("Uruchom aplikację z zainstalowanego pakietu Wydatki.app.")
        if str(bundle).startswith("/Volumes/") or "/AppTranslocation/" in str(bundle):
            raise UpdateError("Przenieś Wydatki do folderu Programy i uruchom ponownie przed aktualizacją.")
        return Installation(f"macos-{architecture}", bundle, "bundle")
    if sys.platform.startswith("linux") and architecture == "x86_64":
        for kind, command in (
            ("rpm", ["rpm", "-qf", "--qf", "%{NAME}", str(executable)]),
            ("deb", ["dpkg-query", "-S", str(executable)]),
        ):
            if shutil.which(command[0]):
                result = run_system(command, text=True)
                owner = result.stdout.strip().split(":", 1)[0]
                if result.returncode == 0 and owner == "wydatki":
                    return Installation(f"linux-x86_64-{kind}", executable, kind)
        if executable.parent == Path("/usr/bin"):
            raise UpdateError("Nie można rozpoznać pakietu systemowego aplikacji.")
        return Installation("linux-x86_64-portable", executable, "portable")
    raise UpdateError("Brak aktualizacji dla tego systemu lub procesora.")


def ensure_installable(installation: Installation) -> None:
    if installation.kind in {"deb", "rpm"}:
        manager = "apt-get" if installation.kind == "deb" else "dnf"
        if not shutil.which("pkexec") or not shutil.which(manager):
            raise UpdateError("Do instalacji aktualizacji potrzebny jest systemowy menedżer pakietów i polkit.")
    elif not os.access(installation.path.parent, os.W_OK):
        raise UpdateError("Brak uprawnień do folderu aplikacji. Przenieś ją do własnego folderu i spróbuj ponownie.")


def package_command(installation: Installation, package: Path) -> list[str]:
    manager = "apt-get" if installation.kind == "deb" else "dnf"
    executable = shutil.which(manager)
    authorization = shutil.which("pkexec")
    if not executable or not authorization:
        raise UpdateError("Nie znaleziono systemowego instalatora aktualizacji.")
    return [authorization, executable, "install", "-y", str(package)]
