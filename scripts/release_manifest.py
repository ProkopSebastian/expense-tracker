from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import platform
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from expense_tracker.updates.protocol import REPOSITORY, select_asset, verify_manifest
from expense_tracker.version import VERSION

ROOT = Path(__file__).resolve().parents[1]


def generate_key(directory: Path) -> None:
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    private_path = directory / "update-signing-key.pem"
    if private_path.exists():
        raise SystemExit("Signing key already exists; refusing to replace it.")
    key = Ed25519PrivateKey.generate()
    descriptor = os.open(private_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(key.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption(),
        ))
    public = base64.b64encode(key.public_key().public_bytes_raw()).decode("ascii")
    (ROOT / "src/expense_tracker/updates/public_key.py").write_text(
        f'UPDATE_PUBLIC_KEY = "{public}"\n', encoding="utf-8",
    )
    print(f"Private key saved to {private_path}. Store it securely; never commit it.")


def describe_assets(directory: Path) -> None:
    machine = platform.machine().lower()
    arch = {"amd64": "x86_64", "aarch64": "arm64"}.get(machine, machine)
    names = {
        f"windows-{arch}": "Wydatki.exe",
        f"linux-{arch}-portable": "Wydatki",
        f"linux-{arch}-deb": f"wydatki_{VERSION}_amd64.deb",
        f"linux-{arch}-rpm": f"wydatki-{VERSION}-1.x86_64.rpm",
        f"macos-{arch}": "Wydatki-macOS.zip",
    }
    assets = {}
    for target, name in names.items():
        path = directory / name
        if path.is_file():
            with path.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            assets[target] = {"name": name, "size": path.stat().st_size, "sha256": digest}
    if not assets:
        raise SystemExit("No release assets found")
    (directory / f"assets-{platform.system().lower()}.json").write_text(json.dumps(assets), encoding="utf-8")


def sign_release(directory: Path) -> None:
    from expense_tracker.updates.public_key import UPDATE_PUBLIC_KEY

    if os.environ.get("GITHUB_REF") != f"refs/tags/v{VERSION}":
        raise SystemExit("Release tag must match the application version")
    assets = {}
    for description in directory.glob("assets-*.json"):
        for target, asset in json.loads(description.read_text(encoding="utf-8")).items():
            if target in assets:
                raise SystemExit(f"Duplicate target: {target}")
            assets[target] = asset
    required = {"windows-x86_64", "linux-x86_64-portable", "linux-x86_64-rpm", "linux-x86_64-deb"}
    if not required.issubset(assets) or not any(target.startswith("macos-") for target in assets):
        raise SystemExit("Release does not contain every supported platform")
    notes = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8").split("\n## ", 1)[0]
    if not notes.startswith(f"## v{VERSION} —"):
        raise SystemExit("Changelog must start with the application version")
    manifest = {"schema": 1, "version": VERSION, "repository": REPOSITORY, "notes": notes, "assets": assets}
    for target in assets:
        asset = select_asset(manifest, target)
        from expense_tracker.updates.protocol import verify_download

        verify_download(directory / asset.name, asset)
    document = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode("utf-8")
    private = serialization.load_pem_private_key(os.environ["UPDATE_SIGNING_KEY"].encode(), password=None)
    if not isinstance(private, Ed25519PrivateKey):
        raise SystemExit("Expected an Ed25519 signing key")
    signature = base64.b64encode(private.sign(document))
    verify_manifest(document, signature, UPDATE_PUBLIC_KEY)
    (directory / "update-manifest.json").write_bytes(document)
    (directory / "update-manifest.sig").write_bytes(signature)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["generate-key", "describe", "sign"])
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    {"generate-key": generate_key, "describe": describe_assets, "sign": sign_release}[args.action](args.directory)


if __name__ == "__main__":
    main()
