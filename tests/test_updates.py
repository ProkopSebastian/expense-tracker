from __future__ import annotations

import base64
import hashlib
import io
import json
import stat
import threading
import time
import zipfile
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from expense_tracker.api import create_app
from expense_tracker.updates import manager, platforms, protocol
from expense_tracker.updates.installer import InstanceLock, extract_bundle, replace_application
from expense_tracker.updates.manager import UpdateManager
from expense_tracker.updates.platforms import Installation
from expense_tracker.updates.protocol import (
    DownloadCancelled,
    UpdateError,
    download_asset,
    select_asset,
    verify_manifest,
    version_tuple,
)


@pytest.fixture
def signed_release():
    private = Ed25519PrivateKey.generate()
    public = base64.b64encode(private.public_key().public_bytes_raw()).decode()
    payload = b"new application"
    manifest = {
        "schema": 1, "repository": protocol.REPOSITORY, "version": "9.0.0", "notes": "Zmiany",
        "assets": {
            target: {"name": name, "size": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
            for target, name in {
                "windows-x86_64": "Wydatki.exe", "linux-x86_64-portable": "Wydatki",
                "linux-x86_64-rpm": "wydatki-9.0.0-1.x86_64.rpm", "linux-x86_64-deb": "wydatki_9.0.0_amd64.deb",
                "macos-arm64": "Wydatki-macOS.zip",
            }.items()
        },
    }
    document = json.dumps(manifest).encode()
    signature = base64.b64encode(private.sign(document))
    return manifest, document, signature, public, payload


def test_signature_rejects_tampering_and_other_keys(signed_release):
    manifest, document, signature, public, _ = signed_release
    assert verify_manifest(document, signature, public) == manifest
    for modified in (document.replace(b"9.0.0", b"9.0.1"), b"{}"):
        with pytest.raises(UpdateError, match="autentyczności"):
            verify_manifest(modified, signature, public)
    other = base64.b64encode(Ed25519PrivateKey.generate().public_key().public_bytes_raw()).decode()
    with pytest.raises(UpdateError):
        verify_manifest(document, signature, other)


@pytest.mark.parametrize("target", [
    "windows-x86_64", "linux-x86_64-rpm", "linux-x86_64-deb", "linux-x86_64-portable", "macos-arm64",
])
def test_manifest_selects_matching_platform(signed_release, target):
    manifest, *_ = signed_release
    asset = select_asset(manifest, target)
    assert asset.target == target
    assert asset.url.startswith("https://github.com/ProkopSebastian/expense-tracker/releases/download/v9.0.0/")


def test_manifest_rejects_unknown_architecture_and_traversal(signed_release):
    manifest, *_ = signed_release
    with pytest.raises(UpdateError):
        select_asset(manifest, "windows-arm64")
    manifest["assets"]["windows-x86_64"]["name"] = "../Wydatki.exe"
    with pytest.raises(UpdateError):
        select_asset(manifest, "windows-x86_64")


@pytest.mark.parametrize("url", [
    "http://github.com/a", "https://evil.example/a", "https://github.com.evil.example/a",
    "https://user@github.com/a", "https://github.com:444/a", "file:///tmp/update",
])
def test_download_rejects_untrusted_urls(url):
    with pytest.raises(UpdateError):
        protocol.validate_url(url)


def test_github_api_uses_json_media_type(monkeypatch):
    requests = []

    class Response:
        def read1(self, size):
            return b""

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    class Opener:
        def open(self, request, timeout):
            requests.append(request)
            return Response()

    monkeypatch.setattr(protocol, "build_opener", lambda *handlers: Opener())
    assert protocol.fetch_bytes(protocol.RELEASES_URL) == b""
    assert requests[0].get_header("Accept") == "application/vnd.github+json"


def test_versions_are_compared_numerically_and_only_stable():
    assert version_tuple("0.10.0") > version_tuple("0.9.9")
    for value in ("0.5.0-beta", "v0.5.0", "../0.5.0", "01.2.3", "0.5", None):
        with pytest.raises(UpdateError):
            version_tuple(value)


def test_failed_download_never_leaves_installable_file(monkeypatch, tmp_path, signed_release):
    manifest, _, _, _, payload = signed_release
    asset = select_asset(manifest, "windows-x86_64")
    for body in (b"truncated", b"x" * len(payload), payload + b"extra"):
        monkeypatch.setattr(protocol, "open_url", lambda url, body=body: io.BytesIO(body))
        destination = tmp_path / "download.exe"
        with pytest.raises(UpdateError):
            download_asset(asset, destination, threading.Event(), lambda count: None)
        assert not destination.exists()


def test_cancelled_download_is_removed(monkeypatch, tmp_path, signed_release):
    manifest, _, _, _, payload = signed_release
    monkeypatch.setattr(protocol, "open_url", lambda url: io.BytesIO(payload))
    cancelled = threading.Event()
    cancelled.set()
    destination = tmp_path / "download.exe"
    with pytest.raises(DownloadCancelled):
        download_asset(select_asset(manifest, "windows-x86_64"), destination, cancelled, lambda count: None)
    assert not destination.exists()


def test_successful_download_verifies_size_and_digest(monkeypatch, tmp_path, signed_release):
    manifest, _, _, _, payload = signed_release
    monkeypatch.setattr(protocol, "open_url", lambda url: io.BytesIO(payload))
    progress = []
    destination = tmp_path / "download.exe"
    download_asset(select_asset(manifest, "windows-x86_64"), destination, threading.Event(), progress.append)
    assert destination.read_bytes() == payload
    assert progress[-1] == len(payload)


def test_failed_atomic_replacement_leaves_original_intact(monkeypatch, tmp_path):
    source, target = tmp_path / "new", tmp_path / "Wydatki"
    source.write_bytes(b"new")
    target.write_bytes(b"old")
    replace = Path.replace

    def fail_staged(self, other):
        if self.name == ".Wydatki.update":
            raise OSError("disk failure")
        return replace(self, other)

    monkeypatch.setattr(Path, "replace", fail_staged)
    with pytest.raises(OSError):
        replace_application(source, target)
    assert target.read_bytes() == b"old"


def test_replacement_keeps_previous_application(tmp_path):
    source, target = tmp_path / "new", tmp_path / "Wydatki"
    source.write_bytes(b"new")
    target.write_bytes(b"old")
    backup = replace_application(source, target)
    assert target.read_bytes() == b"new"
    assert backup.read_bytes() == b"old"


def test_instance_lock_prevents_installation_while_app_is_running(tmp_path):
    first = InstanceLock(tmp_path / "instance.lock")
    second = InstanceLock(tmp_path / "instance.lock")
    assert first.acquire()
    try:
        assert not second.acquire()
    finally:
        first.release()
    assert second.acquire()
    second.release()


@pytest.mark.parametrize("entry", ["../outside", "/absolute", "Wydatki-macOS/../../outside"])
def test_macos_archive_rejects_path_traversal(tmp_path, entry):
    archive = tmp_path / "app.zip"
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr(entry, b"bad")
    with pytest.raises(UpdateError):
        extract_bundle(archive, tmp_path / "extracted")


def test_macos_archive_rejects_external_symlinks(tmp_path):
    archive = tmp_path / "app.zip"
    with zipfile.ZipFile(archive, "w") as zipped:
        info = zipfile.ZipInfo("Wydatki-macOS/Wydatki.app/Contents/link")
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        zipped.writestr(info, "../../../../outside")
    with pytest.raises(UpdateError):
        extract_bundle(archive, tmp_path / "extracted")


def test_system_children_do_not_inherit_bundled_libraries(monkeypatch):
    monkeypatch.setenv("LD_LIBRARY_PATH", "/bundle")
    monkeypatch.setenv("LD_LIBRARY_PATH_ORIG", "/system")
    environment = platforms.child_environment()
    assert environment["LD_LIBRARY_PATH"] == "/system"
    assert environment["PYINSTALLER_RESET_ENVIRONMENT"] == "1"
    monkeypatch.delenv("LD_LIBRARY_PATH_ORIG")
    assert "LD_LIBRARY_PATH" not in platforms.child_environment()


def test_automatic_check_is_delayed_and_can_be_disabled(monkeypatch, tmp_path):
    timers = []

    class Timer:
        def __init__(self, delay, action):
            self.delay, self.action = delay, action
            timers.append(self)

        def start(self):
            pass

        def cancel(self):
            pass

    monkeypatch.setattr(manager.threading, "Timer", Timer)
    updater = UpdateManager(tmp_path, lambda: None)
    checks = []
    monkeypatch.setattr(updater, "check", lambda **kwargs: checks.append(kwargs))
    updater.start()
    assert checks == []
    assert timers[0].delay == 30
    updater.set_automatic(False)
    timers[0].action()
    assert checks == []
    updater.set_automatic(True)
    updater.last_check = time.time()
    updater._automatic_check()
    assert checks == []
    updater.last_check = 0
    updater._automatic_check()
    assert checks == [{"automatic": True}]


def test_failed_automatic_check_is_silent_and_persistently_throttled(monkeypatch, tmp_path):
    monkeypatch.setattr(
        manager, "detect_installation", lambda: Installation("windows-x86_64", tmp_path / "app", "portable"),
    )
    monkeypatch.setattr(manager, "fetch_bytes", lambda url: (_ for _ in ()).throw(OSError("offline")))
    updater = UpdateManager(tmp_path, lambda: None)
    updater._check(True)
    assert updater.state == "idle"
    assert updater.message == ""
    reloaded = UpdateManager(tmp_path, lambda: None)
    assert time.time() - reloaded.last_check < 5
    updater._check(False)
    assert updater.state == "error"
    assert "sprawdzić" in updater.message


def test_available_update_requires_signed_manifest(monkeypatch, tmp_path, signed_release):
    _, document, signature, public, _ = signed_release
    monkeypatch.setattr(
        manager, "detect_installation", lambda: Installation("windows-x86_64", tmp_path / "app", "portable"),
    )
    monkeypatch.setattr(manager, "UPDATE_PUBLIC_KEY", public)

    def fetch(url, *args):
        if url.endswith("latest"):
            return json.dumps({"tag_name": "v9.0.0", "draft": False, "prerelease": False}).encode()
        return signature if url.endswith(".sig") else document

    monkeypatch.setattr(manager, "fetch_bytes", fetch)
    updater = UpdateManager(tmp_path, lambda: None)
    updater._check(False)
    assert updater.state == "available"
    assert updater.asset.version == "9.0.0"
    monkeypatch.setattr(manager, "UPDATE_PUBLIC_KEY", base64.b64encode(b"a" * 32).decode())
    updater._check(False)
    assert updater.state == "error"


def test_update_endpoints_require_desktop_token_and_local_origin(tmp_path):
    app = create_app(tmp_path / "expenses.sqlite3")
    updater = UpdateManager(tmp_path, lambda: None)
    app.state.updater = updater
    with TestClient(app, base_url="http://127.0.0.1:51837") as client:
        assert client.post("/api/updates/cancel").status_code == 403
        headers = {"X-Update-Token": updater.token, "Origin": "https://evil.example"}
        assert client.post("/api/updates/cancel", headers=headers).status_code == 403
        headers["Origin"] = "http://127.0.0.1:51837"
        assert client.post("/api/updates/cancel", headers=headers).status_code == 200
        assert not list(tmp_path.glob("*-backups/action-*"))
        assert client.get("/api/updates", headers={"Host": "evil.example"}).status_code == 403
        assert client.put("/api/updates/preferences", headers=headers, json={"automatic": False}).status_code == 200
        assert not UpdateManager(tmp_path, lambda: None).automatic


def test_development_server_does_not_expose_installer(tmp_path):
    with TestClient(create_app(tmp_path / "expenses.sqlite3"), base_url="http://127.0.0.1") as client:
        assert client.get("/api/updates").json()["enabled"] is False
        assert client.post("/api/updates/install").status_code == 409


def test_install_blocks_mutations_and_creates_backup_before_closing(monkeypatch, tmp_path):
    app = create_app(tmp_path / "expenses.sqlite3")
    updater = UpdateManager(tmp_path, lambda: None)
    updater.state = "ready"
    updater.job = tmp_path / "job"
    updater.installation = Installation("windows-x86_64", tmp_path / "Wydatki.exe", "portable")
    events = []

    def prepare(*args):
        assert list(tmp_path.glob("*-backups/update-*"))
        events.append("prepared")
        return tmp_path / "proceed"

    monkeypatch.setattr(manager, "prepare_helper", prepare)
    monkeypatch.setattr(updater, "request_close", lambda: events.append("close"))
    app.state.updater = updater
    with TestClient(app, base_url="http://127.0.0.1:51837") as client:
        response = client.post("/api/updates/install", headers={"X-Update-Token": updater.token})
        assert response.status_code == 200
        assert events == ["prepared", "close"]
        assert client.put("/api/settings/appearance", json={"theme": "system"}).status_code == 409
        assert client.post("/api/updates/install", headers={"X-Update-Token": updater.token}).status_code == 409


@pytest.mark.parametrize("kind,manager_name", [("deb", "apt-get"), ("rpm", "dnf")])
def test_package_updates_use_system_manager_without_shell(monkeypatch, tmp_path, kind, manager_name):
    monkeypatch.setattr(platforms.shutil, "which", lambda name: f"/usr/bin/{name}")
    package = tmp_path / f"an update;not-a-command.{kind}"
    command = platforms.package_command(Installation(f"linux-x86_64-{kind}", Path("/usr/bin/wydatki"), kind), package)
    assert command == ["/usr/bin/pkexec", f"/usr/bin/{manager_name}", "install", "-y", str(package)]


@pytest.mark.parametrize("contents", ["[]", "null", '{"last_check": "broken"}', '{"last_check": NaN}'])
def test_invalid_update_preferences_do_not_prevent_startup(tmp_path, contents):
    (tmp_path / "update-settings.json").write_text(contents)
    assert UpdateManager(tmp_path, lambda: None).last_check == 0


def test_installer_rechecks_signature_after_download(monkeypatch, tmp_path, signed_release):
    from expense_tracker.updates import public_key
    from expense_tracker.updates.installer import apply_update, write_json

    _, document, signature, public, payload = signed_release
    job = tmp_path / "updates" / ("a" * 32)
    job.mkdir(parents=True)
    target = tmp_path / "Wydatki"
    target.write_bytes(b"original")
    (job / "manifest.json").write_bytes(document.replace(b"9.0.0", b"9.0.1"))
    (job / "manifest.sig").write_bytes(signature)
    (job / "Wydatki").write_bytes(payload)
    (job / "proceed").touch()
    write_json(job / "plan.json", {
        "target": "linux-x86_64-portable", "path": str(target), "kind": "portable", "state_dir": str(tmp_path),
    })
    monkeypatch.setattr(public_key, "UPDATE_PUBLIC_KEY", public)
    restarted = []
    monkeypatch.setattr("expense_tracker.updates.installer.restart_application", lambda *args: restarted.append(True))
    assert apply_update(job / "plan.json") == 1
    assert target.read_bytes() == b"original"
    assert restarted == [True]
    assert json.loads((tmp_path / "update-result.json").read_text())["ok"] is False


def test_installer_checks_new_program_before_atomic_swap(monkeypatch, tmp_path, signed_release):
    from expense_tracker.updates import installer, public_key

    _, document, signature, public, payload = signed_release
    job = tmp_path / "updates" / ("b" * 32)
    job.mkdir(parents=True)
    target = tmp_path / "Wydatki"
    target.write_bytes(b"original")
    (job / "manifest.json").write_bytes(document)
    (job / "manifest.sig").write_bytes(signature)
    (job / "Wydatki").write_bytes(payload)
    (job / "proceed").touch()
    installer.write_json(job / "plan.json", {
        "target": "linux-x86_64-portable", "path": str(target), "kind": "portable", "state_dir": str(tmp_path),
    })
    monkeypatch.setattr(public_key, "UPDATE_PUBLIC_KEY", public)

    def smoke(arguments, **kwargs):
        assert target.read_bytes() == b"original"
        assert arguments[1:3] == ["--smoke-test", "--version-file"]
        Path(arguments[3]).write_text("9.0.0")

    def restart(*args):
        assert target.read_bytes() == payload
        (job / "app-ready").touch()

    monkeypatch.setattr(installer.subprocess, "run", smoke)
    monkeypatch.setattr(installer, "restart_application", restart)
    assert installer.apply_update(job / "plan.json") == 0
    assert target.read_bytes() == payload
    assert (tmp_path / ".Wydatki.previous").read_bytes() == b"original"
    assert json.loads((tmp_path / "update-result.json").read_text())["ok"] is True


def test_failed_bundle_swap_preserves_installed_application(monkeypatch, tmp_path):
    from expense_tracker.updates import installer

    source = tmp_path / "new.app"
    target = tmp_path / "Wydatki.app"
    source.mkdir()
    target.mkdir()
    (source / "version").write_text("new")
    (target / "version").write_text("old")

    def fail(*args):
        raise OSError("The volume does not support atomic exchange")

    monkeypatch.setattr(installer, "swap_bundles", fail)
    with pytest.raises(OSError):
        replace_application(source, target)
    assert (target / "version").read_text() == "old"
    assert not (tmp_path / ".Wydatki.app.previous").exists()


def test_native_macos_bundle_swap_preserves_symlinks(tmp_path):
    import sys

    if sys.platform != "darwin":
        pytest.skip("Requires the macOS renamex_np system call")
    source = tmp_path / "new.app"
    target = tmp_path / "Wydatki.app"
    source.mkdir()
    target.mkdir()
    (source / "version").write_text("new")
    (source / "link").symlink_to("version")
    (target / "version").write_text("old")
    backup = replace_application(source, target)
    assert (target / "version").read_text() == "new"
    assert (backup / "version").read_text() == "old"
    assert (target / "link").is_symlink()
    assert (target / "link").read_text() == "new"


def test_release_signer_verifies_all_assets_and_pins_public_key(monkeypatch, tmp_path, signed_release):
    import importlib.util

    from cryptography.hazmat.primitives import serialization

    from expense_tracker.updates import public_key

    specification = importlib.util.spec_from_file_location(
        "release_manifest", Path(__file__).parents[1] / "scripts/release_manifest.py",
    )
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    manifest, _, _, _, payload = signed_release
    private = Ed25519PrivateKey.generate()
    public = base64.b64encode(private.public_key().public_bytes_raw()).decode()
    monkeypatch.setattr(public_key, "UPDATE_PUBLIC_KEY", public)
    monkeypatch.setattr(module, "VERSION", "9.0.0")
    monkeypatch.setattr(module, "ROOT", tmp_path)
    monkeypatch.setenv("GITHUB_REF", "refs/tags/v9.0.0")
    monkeypatch.setenv("UPDATE_SIGNING_KEY", private.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption(),
    ).decode())
    (tmp_path / "CHANGELOG.md").write_text("## v9.0.0 — 05.10.2026\n\n- feat: aktualizacja\n", encoding="utf-8")
    (tmp_path / "assets-test.json").write_text(json.dumps(manifest["assets"]))
    for asset in manifest["assets"].values():
        (tmp_path / asset["name"]).write_bytes(payload)
    module.sign_release(tmp_path)
    verified = verify_manifest(
        (tmp_path / "update-manifest.json").read_bytes(), (tmp_path / "update-manifest.sig").read_bytes(), public,
    )
    assert verified["version"] == "9.0.0"
    assert set(verified["assets"]) == set(manifest["assets"])
    (tmp_path / "Wydatki.exe").write_bytes(b"corrupted")
    with pytest.raises(UpdateError):
        module.sign_release(tmp_path)


def test_backup_failure_keeps_application_open_and_writable(monkeypatch, tmp_path):
    from expense_tracker.updates import routes

    app = create_app(tmp_path / "expenses.sqlite3")
    updater = UpdateManager(tmp_path, lambda: pytest.fail("Application must stay open"))
    updater.state = "ready"
    app.state.updater = updater

    def fail(*args):
        raise OSError("No space left")

    monkeypatch.setattr(routes, "backup_database", fail)
    with TestClient(app, base_url="http://127.0.0.1:51837") as client:
        response = client.post("/api/updates/install", headers={"X-Update-Token": updater.token})
        assert response.status_code == 409
        assert not updater.installing
        assert client.put("/api/settings/appearance", json={"theme": "system"}).status_code == 200


def test_helper_accepts_state_directory_through_symlink(tmp_path):
    from expense_tracker.updates.installer import apply_update, write_json

    actual = tmp_path / "actual"
    actual.mkdir()
    linked = tmp_path / "linked"
    try:
        linked.symlink_to(actual, target_is_directory=True)
    except OSError:
        pytest.skip("Directory symlinks are unavailable for this account")
    job = linked / "updates" / "cancelled"
    job.mkdir(parents=True)
    write_json(job / "plan.json", {
        "target": "smoke", "path": str(tmp_path / "Wydatki"),
        "kind": "portable", "state_dir": str(linked),
    })
    (job / "cancel").touch()

    assert apply_update(job / "plan.json") == 0
    assert (job / "helper-stopped").exists()
