from __future__ import annotations

import base64
import hashlib
import json
import re
import ssl
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

REPOSITORY = "ProkopSebastian/expense-tracker"
RELEASES_URL = f"https://api.github.com/repos/{REPOSITORY}/releases/latest"
MAX_MANIFEST_SIZE = 128 * 1024
MAX_PACKAGE_SIZE = 1024 * 1024 * 1024
ALLOWED_HOSTS = {
    "api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com",
}


class UpdateError(Exception):
    pass


class DownloadCancelled(Exception):
    pass


def version_tuple(value: str) -> tuple[int, int, int]:
    if not isinstance(value, str) or not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", value):
        raise UpdateError("Nieprawidłowy numer wersji aktualizacji.")
    return tuple(int(part) for part in value.split("."))


def validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS or parsed.port not in {None, 443}:
        raise UpdateError("Nieprawidłowy adres serwera aktualizacji.")
    if parsed.username or parsed.password:
        raise UpdateError("Nieprawidłowy adres serwera aktualizacji.")
    return url


class SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(request, fp, code, message, headers, newurl)


def open_url(url: str):
    import certifi

    request = Request(
        validate_url(url), headers={"User-Agent": "Wydatki-Updater", "Accept": "application/octet-stream"},
    )
    context = ssl.create_default_context()
    context.load_verify_locations(certifi.where())
    return build_opener(SafeRedirectHandler(), HTTPSHandler(context=context)).open(request, timeout=5)


def fetch_bytes(url: str, limit: int = MAX_MANIFEST_SIZE) -> bytes:
    deadline = time.monotonic() + 15
    result = bytearray()
    with open_url(url) as response:
        while chunk := response.read1(min(65536, limit + 1 - len(result))):
            result.extend(chunk)
            if len(result) > limit or time.monotonic() > deadline:
                raise UpdateError("Odpowiedź serwera aktualizacji jest zbyt duża lub trwa zbyt długo.")
    return bytes(result)


@dataclass(frozen=True)
class ReleaseAsset:
    version: str
    target: str
    name: str
    url: str
    size: int
    sha256: str
    notes: str


def verify_manifest(document: bytes, signature: bytes, public_key: str) -> dict:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    try:
        key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key, validate=True))
        key.verify(base64.b64decode(signature.strip(), validate=True), document)
        manifest = json.loads(document)
        if manifest["schema"] != 1 or manifest.get("repository") != REPOSITORY:
            raise ValueError("Unsupported schema")
        version_tuple(manifest["version"])
        return manifest
    except (InvalidSignature, ValueError, KeyError, TypeError) as error:
        raise UpdateError("Nie można potwierdzić autentyczności aktualizacji.") from error


def select_asset(manifest: dict, target: str) -> ReleaseAsset:
    try:
        version = manifest["version"]
        version_tuple(version)
        entry = manifest["assets"][target]
        name, size, digest = entry["name"], entry["size"], entry["sha256"]
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
            raise ValueError("Invalid asset name")
        if type(size) is not int or not 0 < size <= MAX_PACKAGE_SIZE:
            raise ValueError("Invalid asset size")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("Invalid digest")
        notes = manifest.get("notes", "")
        if not isinstance(notes, str) or len(notes) > 12000:
            raise ValueError("Invalid notes")
        url = f"https://github.com/{REPOSITORY}/releases/download/v{version}/{name}"
        return ReleaseAsset(version, target, name, url, size, digest, notes)
    except (KeyError, ValueError, TypeError) as error:
        raise UpdateError("To wydanie nie zawiera poprawnej paczki dla tego komputera.") from error


def download_asset(asset: ReleaseAsset, destination: Path, cancelled: Event, progress: Callable[[int], None]) -> None:
    digest = hashlib.sha256()
    total = 0
    deadline = time.monotonic() + 1800
    try:
        with open_url(asset.url) as response, destination.open("xb") as output:
            while chunk := response.read1(256 * 1024):
                if cancelled.is_set():
                    raise DownloadCancelled
                if time.monotonic() > deadline:
                    raise UpdateError("Pobieranie trwało zbyt długo. Spróbuj ponownie.")
                total += len(chunk)
                if total > asset.size:
                    raise UpdateError("Rozmiar pobranej aktualizacji jest nieprawidłowy.")
                output.write(chunk)
                digest.update(chunk)
                progress(total)
        if cancelled.is_set():
            raise DownloadCancelled
        if total != asset.size or digest.hexdigest() != asset.sha256:
            raise UpdateError("Pobrana aktualizacja jest uszkodzona. Pobierz ją ponownie.")
    except BaseException:
        destination.unlink(missing_ok=True)
        raise


def verify_download(path: Path, asset: ReleaseAsset) -> None:
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if path.stat().st_size != asset.size or digest != asset.sha256:
        raise UpdateError("Pobrana aktualizacja jest uszkodzona. Pobierz ją ponownie.")
