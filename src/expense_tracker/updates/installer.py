from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import sys
import time
import zipfile
from pathlib import Path, PurePosixPath

from .platforms import Installation, child_environment, ensure_installable, package_command
from .protocol import UpdateError, select_asset, verify_download, verify_manifest, version_tuple


class InstanceLock:
    def __init__(self, path: Path):
        self.path = path
        self.stream = None

    def acquire(self) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        stream = self.path.open("a+b")
        try:
            if sys.platform == "win32":
                import msvcrt

                stream.seek(0, 2)
                if stream.tell() == 0:
                    stream.write(b"0")
                    stream.flush()
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            stream.close()
            return False
        self.stream = stream
        return True

    def release(self) -> None:
        if self.stream is not None:
            self.stream.close()
            self.stream = None


def write_json(path: Path, value: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value), encoding="utf-8")
    temporary.replace(path)


def start_detached(arguments: list[str], log: Path) -> subprocess.Popen:
    options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS} if (
        sys.platform == "win32"
    ) else {"start_new_session": True}
    # Reset the Windows DLL directory before starting system programs elsewhere; the helper
    # itself is a frozen executable and deliberately establishes its own library directory.
    with log.open("ab") as output:
        return subprocess.Popen(
            arguments, stdin=subprocess.DEVNULL, stdout=output, stderr=output,
            env=child_environment(), cwd=str(log.parent), **options,
        )


def prepare_helper(installation: Installation, job: Path, state_dir: Path) -> Path:
    ensure_installable(installation)
    if installation.kind == "bundle":
        worker = job / "worker.app"
        shutil.copytree(installation.path, worker, symlinks=True)
        executable = worker / "Contents" / "MacOS" / "Wydatki"
    else:
        executable = job / ("worker.exe" if sys.platform == "win32" else "worker")
        shutil.copy2(installation.path, executable)
    plan = job / "plan.json"
    write_json(plan, {
        "target": installation.target, "path": str(installation.path), "kind": installation.kind,
        "state_dir": str(state_dir),
    })
    process = start_detached([str(executable), "--apply-update", str(plan)], state_dir / "update.log")
    deadline = time.monotonic() + 30
    while not (job / "helper-ready").exists():
        if process.poll() is not None or time.monotonic() >= deadline:
            process.terminate()
            raise UpdateError("Nie udało się uruchomić instalatora. Aplikacja pozostaje otwarta.")
        time.sleep(0.1)
    return job / "proceed"


def extract_bundle(archive: Path, destination: Path) -> Path:
    destination.mkdir(mode=0o700)
    prefix = "Wydatki-macOS/Wydatki.app/"
    with zipfile.ZipFile(archive) as zipped:
        entries = zipped.infolist()
        if len(entries) > 30000 or sum(entry.file_size for entry in entries) > 2 * 1024**3:
            raise UpdateError("Paczka aplikacji jest zbyt duża.")
        links: set[str] = set()
        names: set[str] = set()
        for entry in entries:
            path = PurePosixPath(entry.filename)
            if path.is_absolute() or ".." in path.parts or "\\" in entry.filename or entry.filename in names:
                raise UpdateError("Paczka aplikacji zawiera nieprawidłową ścieżkę.")
            names.add(entry.filename)
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode):
                if entry.file_size > 4096:
                    raise UpdateError("Nieprawidłowe dowiązanie w paczce aplikacji.")
                target = zipped.read(entry).decode("utf-8")
                resolved = (destination / entry.filename).parent / target
                root = (destination / "Wydatki-macOS" / "Wydatki.app").resolve()
                if (
                    Path(target).is_absolute() or "\\" in target or not entry.filename.startswith(prefix)
                    or not resolved.resolve().is_relative_to(root)
                ):
                    raise UpdateError("Paczka aplikacji zawiera niebezpieczne dowiązanie.")
                links.add(entry.filename.rstrip("/"))
        for entry in entries:
            if any(str(parent) in links for parent in PurePosixPath(entry.filename).parents):
                raise UpdateError("Paczka aplikacji zapisuje pliki przez dowiązanie.")
        # ditto preserves the signed bundle's executable modes and framework symlinks.
        subprocess.run(
            ["/usr/bin/ditto", "-x", "-k", str(archive), str(destination)],
            check=True, timeout=180, env=child_environment(), capture_output=True,
        )
    bundle = destination / "Wydatki-macOS" / "Wydatki.app"
    if not (bundle / "Contents" / "MacOS" / "Wydatki").is_file():
        raise UpdateError("W paczce brakuje aplikacji Wydatki.")
    return bundle


def swap_bundles(first: Path, second: Path) -> None:
    import ctypes

    library = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
    rename = library.renamex_np
    rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    # RENAME_SWAP keeps a complete application at the installed path even if power is lost.
    if rename(os.fsencode(first), os.fsencode(second), 2) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def replace_application(source: Path, target: Path) -> Path:
    staged = target.with_name(f".{target.name}.update")
    backup = target.with_name(f".{target.name}.previous")
    if staged.exists() or backup.exists():
        raise UpdateError("Pozostała kopia po poprzedniej instalacji. Szczegóły znajdziesz w dzienniku aktualizacji.")
    if source.is_dir():
        try:
            shutil.copytree(source, backup, symlinks=True)
            swap_bundles(backup, target)
        except BaseException:
            shutil.rmtree(backup, ignore_errors=True)
            raise
        return backup
    try:
        shutil.copy2(source, staged)
        staged.chmod(0o755)
        shutil.copy2(target, backup)
        deadline = time.monotonic() + 30
        while True:
            try:
                staged.replace(target)
                break
            except PermissionError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.25)
    except BaseException:
        staged.unlink(missing_ok=True)
        backup.unlink(missing_ok=True)
        raise
    return backup


def restart_application(installation: Installation, state_dir: Path) -> None:
    arguments = (
        ["/usr/bin/open", "-n", str(installation.path)] if installation.kind == "bundle" else [str(installation.path)]
    )
    start_detached(arguments, state_dir / "update.log")


def apply_update(plan_path: Path) -> int:
    from expense_tracker.version import VERSION

    from .public_key import UPDATE_PUBLIC_KEY

    if sys.platform == "win32":
        import ctypes

        ctypes.windll.kernel32.SetDllDirectoryW(None)

    job = plan_path.resolve().parent
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    state_dir = Path(plan["state_dir"]).resolve()
    if job.parent != state_dir / "updates" or plan_path.name != "plan.json":
        raise UpdateError("Nieprawidłowy plan instalacji aktualizacji.")
    installation = Installation(plan["target"], Path(plan["path"]), plan["kind"])
    lock = InstanceLock(state_dir / "instance.lock")
    result = state_dir / "update-result.json"
    acquired = False
    backup = None
    installed = False
    try:
        (job / "helper-ready").touch()
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if (job / "cancel").exists():
                (job / "helper-stopped").touch()
                return 0
            if (job / "proceed").exists() and lock.acquire():
                acquired = True
                break
            time.sleep(0.2)
        if not acquired:
            raise UpdateError("Aplikacja nie zakończyła pracy. Aktualizacja została przerwana.")
        manifest = verify_manifest(
            (job / "manifest.json").read_bytes(), (job / "manifest.sig").read_bytes(), UPDATE_PUBLIC_KEY,
        )
        asset = select_asset(manifest, installation.target)
        if version_tuple(asset.version) <= version_tuple(VERSION):
            raise UpdateError("Aktualizacja musi być nowsza od zainstalowanej wersji.")
        package = job / asset.name
        verify_download(package, asset)
        ensure_installable(installation)
        if installation.kind in {"rpm", "deb"}:
            completed = subprocess.run(
                package_command(installation, package), env=child_environment(),
                stdin=subprocess.DEVNULL,
            )
            if completed.returncode:
                raise UpdateError("Instalacja nie została ukończona lub odmówiono uprawnień. Spróbuj ponownie.")
        else:
            source = extract_bundle(package, job / "unpacked") if installation.kind == "bundle" else package
            executable = source / "Contents" / "MacOS" / "Wydatki" if source.is_dir() else source
            executable.chmod(0o755)
            receipt = job / "tested-version.txt"
            subprocess.run(
                [str(executable), "--smoke-test", "--version-file", str(receipt)], check=True, timeout=90,
                env=child_environment(), cwd=str(job),
            )
            if receipt.read_text(encoding="utf-8") != asset.version:
                raise UpdateError("Wersja pobranego programu nie zgadza się z podpisanym wydaniem.")
            backup = replace_application(source, installation.path)
        write_json(result, {
            "ok": True, "version": asset.version, "message": "Aktualizacja została zainstalowana.",
            "previous": str(backup) if backup else None, "job": job.name,
        })
        installed = True
    except Exception as error:
        print(f"Update failed: {error}", flush=True)
        write_json(result, {"ok": False, "message": str(error) if isinstance(error, UpdateError) else (
            "Nie udało się zainstalować aktualizacji. Szczegóły znajdziesz w dzienniku aktualizacji."
        )})
    finally:
        lock.release()
    if acquired:
        try:
            restart_application(installation, state_dir)
        except OSError as error:
            print(f"Restart failed: {error}", flush=True)
            if backup is not None:
                if backup.is_dir():
                    swap_bundles(backup, installation.path)
                else:
                    backup.replace(installation.path)
            write_json(result, {
                "ok": False, "message": "Uruchom aplikację ponownie. Automatyczny restart nie powiódł się.",
            })
            return 1
        if installed:
            deadline = time.monotonic() + 60
            while not (job / "app-ready").exists():
                if time.monotonic() >= deadline:
                    write_json(result, {
                        "ok": False,
                        "message": "Nowa wersja nie potwierdziła uruchomienia. Zachowano kopię poprzedniej aplikacji.",
                    })
                    return 1
                time.sleep(0.2)
    (job / "helper-stopped").touch()
    return 0 if installed else 1
