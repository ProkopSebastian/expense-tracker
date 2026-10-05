from __future__ import annotations

import json
import logging
import math
import secrets
import shutil
import threading
import time
from contextlib import suppress
from pathlib import Path
from uuid import uuid4

from expense_tracker.version import VERSION

from .installer import prepare_helper, write_json
from .platforms import detect_installation, ensure_installable
from .protocol import (
    RELEASES_URL,
    REPOSITORY,
    DownloadCancelled,
    UpdateError,
    download_asset,
    fetch_bytes,
    select_asset,
    verify_manifest,
    version_tuple,
)
from .public_key import UPDATE_PUBLIC_KEY

logger = logging.getLogger(__name__)
CHECK_INTERVAL = 24 * 60 * 60


class UpdateManager:
    def __init__(self, state_dir: Path, close_window):
        self.state_dir = state_dir
        self.close_window = close_window
        self.token = secrets.token_urlsafe(32)
        self.lock = threading.RLock()
        self.cancelled = threading.Event()
        self.stopped = threading.Event()
        self.timer = None
        self.installation = None
        self.asset = None
        self.job = None
        self.proceed = None
        self.state = "idle"
        self.message = ""
        self.downloaded = 0
        self.automatic = True
        self.last_check = 0.0
        self.last_manual = 0.0
        self.result = None
        try:
            preferences = json.loads((state_dir / "update-settings.json").read_text(encoding="utf-8"))
            if not isinstance(preferences, dict):
                raise ValueError("Invalid update preferences")
            self.automatic = preferences.get("automatic", True) is True
            self.last_check = float(preferences.get("last_check", 0))
            if not math.isfinite(self.last_check):
                self.last_check = 0
        except (OSError, ValueError, TypeError):
            pass
        with suppress(OSError, ValueError):
            result = json.loads((state_dir / "update-result.json").read_text(encoding="utf-8"))
            if isinstance(result, dict) and isinstance(result.get("message"), str):
                self.result = result

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "enabled": True, "token": self.token, "current_version": VERSION,
                "state": self.state, "message": self.message, "automatic": self.automatic,
                "last_check": self.last_check or None,
                "version": self.asset.version if self.asset else None,
                "notes": self.asset.notes if self.asset else "",
                "downloaded": self.downloaded, "size": self.asset.size if self.asset else 0,
                "requires_authorization": self.installation is not None and self.installation.kind in {"rpm", "deb"},
                "result": self.result,
            }

    @property
    def installing(self) -> bool:
        with self.lock:
            return self.state == "installing"

    def start(self) -> None:
        if self.result and self.result.get("ok") and self.result.get("version") == VERSION:
            job_name = self.result.get("job", "")
            if self._valid_job_name(job_name):
                job = self.state_dir / "updates" / job_name
                if job.is_dir():
                    (job / "app-ready").touch()
        self.timer = threading.Timer(30, self._after_startup)
        self.timer.daemon = True
        self.timer.start()

    @staticmethod
    def _valid_job_name(value: object) -> bool:
        return isinstance(value, str) and len(value) == 32 and all(c in "0123456789abcdef" for c in value)

    def _after_startup(self) -> None:
        try:
            result = self.result
            if result and result.get("ok") and result.get("version") == VERSION:
                installation = detect_installation()
                previous = installation.path.with_name(f".{installation.path.name}.previous")
                if result.get("previous") == str(previous) and previous.exists():
                    if previous.is_dir():
                        shutil.rmtree(previous)
                    else:
                        previous.unlink()
                job_name = result.get("job", "")
                if self._valid_job_name(job_name):
                    job = self.state_dir / "updates" / job_name
                    if (job / "helper-stopped").exists():
                        shutil.rmtree(job, ignore_errors=True)
        except Exception:
            logger.exception("Could not clean up the previous update")
        self._automatic_check()

    def stop(self) -> None:
        self.stopped.set()
        self.cancelled.set()
        if self.timer:
            self.timer.cancel()

    def authorize_install(self) -> None:
        if self.proceed is not None:
            self.proceed.touch()

    def _save_settings(self) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        write_json(
            self.state_dir / "update-settings.json", {"automatic": self.automatic, "last_check": self.last_check},
        )

    def set_automatic(self, value: bool) -> None:
        with self.lock:
            self.automatic = value
            self._save_settings()

    def _automatic_check(self) -> None:
        with self.lock:
            if self.stopped.is_set() or not self.automatic:
                return
            if 0 <= time.time() - self.last_check < CHECK_INTERVAL:
                return
        self.check(automatic=True)

    def check(self, *, automatic: bool = False) -> None:
        with self.lock:
            if self.state in {"checking", "downloading", "ready", "installing"} or self.stopped.is_set():
                return
            if not automatic and time.monotonic() - self.last_manual < 10:
                return
            self.last_manual = time.monotonic()
            self.state = "checking"
            self.message = ""
        threading.Thread(target=self._check, args=(automatic,), daemon=True, name="update-check").start()

    def _check(self, automatic: bool) -> None:
        try:
            installation = detect_installation()
            with self.lock:
                self.last_check = time.time()
                self._save_settings()
            release = json.loads(fetch_bytes(RELEASES_URL))
            if release.get("draft") or release.get("prerelease"):
                raise UpdateError("Brak stabilnego wydania aktualizacji.")
            tag = release["tag_name"]
            if not isinstance(tag, str) or not tag.startswith("v"):
                raise UpdateError("Nieprawidłowy numer wydania.")
            if version_tuple(tag[1:]) <= version_tuple(VERSION):
                with self.lock:
                    self.state = "current"
                return
            base = f"https://github.com/{REPOSITORY}/releases/download/{tag}"
            document = fetch_bytes(f"{base}/update-manifest.json")
            signature = fetch_bytes(f"{base}/update-manifest.sig", 1024)
            manifest = verify_manifest(document, signature, UPDATE_PUBLIC_KEY)
            if manifest["version"] != tag[1:]:
                raise UpdateError("Numer podpisanego wydania jest niezgodny z aktualizacją.")
            asset = select_asset(manifest, installation.target)
            with self.lock:
                self.installation = installation
                self.asset = asset
                self.document = document
                self.signature = signature
                self.state = "available"
        except Exception as error:
            logger.info("Update check failed: %s", error)
            with self.lock:
                self.state = "idle" if automatic else "error"
                self.message = "" if automatic else (
                    str(error) if isinstance(error, UpdateError)
                    else "Nie udało się sprawdzić aktualizacji. Spróbuj później."
                )

    def download(self) -> None:
        with self.lock:
            if self.state not in {"available", "error"} or not self.asset:
                raise UpdateError("Najpierw sprawdź dostępność aktualizacji.")
            ensure_installable(self.installation)
            self.cancelled.clear()
            self.downloaded = 0
            self.message = ""
            self.state = "downloading"
        threading.Thread(target=self._download, daemon=True, name="update-download").start()

    def _download(self) -> None:
        job = self.state_dir / "updates" / uuid4().hex
        try:
            job.mkdir(parents=True, mode=0o700)
            if shutil.disk_usage(job).free < self.asset.size * 4 + 100 * 1024**2:
                raise UpdateError("Za mało miejsca na aktualizację i kopię poprzedniej wersji.")
            (job / "manifest.json").write_bytes(self.document)
            (job / "manifest.sig").write_bytes(self.signature)
            download_asset(self.asset, job / self.asset.name, self.cancelled, self._progress)
            with self.lock:
                self.job = job
                self.state = "ready"
        except Exception as error:
            shutil.rmtree(job, ignore_errors=True)
            with self.lock:
                self.state = "available" if isinstance(error, DownloadCancelled) else "error"
                self.message = "" if isinstance(error, DownloadCancelled) else (
                    str(error) if isinstance(error, UpdateError)
                    else "Nie udało się pobrać aktualizacji. Spróbuj ponownie."
                )

    def _progress(self, downloaded: int) -> None:
        with self.lock:
            self.downloaded = downloaded

    def cancel(self) -> None:
        with self.lock:
            if self.state == "downloading":
                self.cancelled.set()

    def prepare_install(self) -> None:
        with self.lock:
            if self.state != "ready" or self.job is None:
                raise UpdateError("Najpierw pobierz aktualizację.")
            self.state = "installing"
        try:
            self.proceed = prepare_helper(self.installation, self.job, self.state_dir)
        except Exception:
            with self.lock:
                self.state = "ready"
            raise

    def request_close(self) -> None:
        timer = threading.Timer(0.7, self.close_window)
        timer.daemon = True
        timer.start()
