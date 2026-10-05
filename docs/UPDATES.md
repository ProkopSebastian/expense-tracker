# Desktop updates

The update service is available only when the launcher creates a frozen desktop
application. The development server cannot install updates. `pyproject.toml` is
the version source; PyInstaller includes the distribution metadata used by the
API and updater. The first changelog entry and release tag must match that version.

## Supported installations

| Installation | Update mechanism |
| --- | --- |
| Windows x86-64, writable user directory | Independently running helper, verified EXE, atomic file replacement |
| Linux x86-64, user directory | Same mechanism, verified standalone binary |
| Fedora/RPM | `pkexec dnf install -y <verified local RPM>` |
| Debian/Ubuntu/DEB | `pkexec apt-get install -y <verified local DEB>` |
| macOS, architecture published by the release runner | Verified ZIP, preserved framework symlinks, atomic `renamex_np(RENAME_SWAP)` bundle exchange |

Windows and macOS installations must be in a directory writable by the user.
For a standard macOS account, `~/Applications` is an alternative to `/Applications`.
The application never elevates itself. RPM and DEB installations require polkit,
a desktop authentication agent, and their native package manager. User rejection,
package-manager contention, missing dependencies, and insufficient disk space are
reported as failed updates; no manual replacement of package-owned files occurs.
No shell receives commands assembled from release data.

The macOS bundle must be installed outside a mounted disk image or App Translocation
path. Atomic exchange requires a filesystem that supports `RENAME_SWAP` (normally
APFS); unsupported volumes fail without removing the existing app. Intel macOS
and ARM Windows/Linux are not promised by the existing build matrix. Manifest
targets use the architecture of the actual build runner rather than guessing from
an archive name. Adding an architecture requires a separate build and uniquely
named artifact.

## Responsiveness and user control

- One daemon timer starts 30 seconds after the backend, frontend assets, and API
  pass the launcher's readiness check. No network request delays startup.
- Automatic checks run at most once per 24 hours across restarts, including failed
  requests. Disabling them persists in `update-settings.json` in the state directory.
- Manual checks have a ten-second cooldown. Checks and downloads run on daemon
  threads and cannot hold the database write lock.
- HTTPS requests use a five-second socket timeout. Metadata responses also have a
  15-second read budget and a 128 KiB limit. Downloads have an explicit size limit
  and a 30-minute budget. DNS and OS networking can impose their own delays; this
  happens off the UI thread and does not prevent application exit.
- There is no automatic download or installation. The user explicitly downloads,
  can cancel, and separately chooses installation/restart.
- The UI polls only the local updater state: once per minute when idle and once per
  second during work. Hidden windows do not send those requests. Only one poll can
  run at a time; requests time out after five seconds.

## Trust and publication

The app trusts the Ed25519 public key in `updates/public_key.py`. The release job
signs the exact bytes of `update-manifest.json`, including version, repository,
architecture, filenames, sizes, and SHA-256 digests. Both manifest and package are
verified again by the helper immediately before installation. Only HTTPS GitHub
release hosts are accepted, including redirects. System trust roots are augmented
with the bundled certifi roots for frozen runtimes.

The local update API requires a per-process random token for mutations and rejects
foreign origins and unexpected hosts. Its URLs cannot select a download URL,
installation destination, executable, or shell command. Update actions are excluded
from transaction undo history.

Before the first release, add the generated private key as the repository Actions
secret `UPDATE_SIGNING_KEY`:

```bash
gh secret set UPDATE_SIGNING_KEY --repo ProkopSebastian/expense-tracker \
  < .release-keys/update-signing-key.pem
```

This command changes repository configuration; it is intentionally not run by the
implementation. The generated private key is ignored by Git, stored with mode 0600,
and must be backed up separately. Never include it in a build or artifact. Do not
regenerate the public key after shipping: installed versions pin it. Key rotation
needs an explicit trust migration.

For a fresh project only, generate a key with:

```bash
uv run python scripts/release_manifest.py generate-key .release-keys
```

The release workflow builds all platforms, records the actual artifacts, merges
and verifies their hashes, signs the manifest, uploads a draft release, then makes
it public. Missing signing secrets, mismatched keys/tags/changelog, or missing
platform assets fail publication. Manual workflow dispatch only builds artifacts.
Keep published assets immutable; corrections should use a new version and tag.
The version introducing the updater still needs to be installed manually once.

Apple Developer ID signing and notarization are separate from update signatures.
`scripts/build_macos.sh` supports `MACOS_CODESIGN_IDENTITY` (an identity already
available in the build keychain) and `MACOS_NOTARY_PROFILE` (a configured notarytool
keychain profile). Without those credentials, builds retain the existing ad-hoc
signing and Apple may require explicit approval. The updater does not remove
quarantine attributes or disable Gatekeeper. Windows Authenticode signing is also
outside the Ed25519 update protocol; no certificate is bundled by this change.

## Installation and recovery

Installation waits for existing writes, makes a SQLite-consistent `update-*`
backup, and rejects subsequent writes. Only then does it prepare an independent
copy of the old application as the helper. The window remains open unless that
helper acknowledges startup. It may proceed only after the server has stopped
and the application releases the cross-platform instance lock. A second application
instance cannot race installation.

Portable EXEs/binaries and extracted macOS bundles must pass the packaged smoke
test with an isolated database and report the signed version before replacement.
The old application remains at its original path until an atomic replacement or
exchange succeeds. A `.previous` sibling is retained until the new app has passed
its normal startup checks; the helper waits for that acknowledgment. Successful
startup cleans up the previous application and its completed staging job after
30 seconds. System package transactions are delegated entirely to dnf/apt.

If startup fails after the new process has begun, do not automatically launch an
older executable against a possibly migrated database. Preserve the matching
`update-*` SQLite backup and `.previous` application for deliberate recovery. For
RPM/DEB, reinstall a known-good package through the system package manager. Before
restoring a database, close every app instance and preserve the current database
and its WAL/SHM files. Restore a consistent backup together with a compatible app
version; do not restore only arbitrary SQLite sidecar files.

The state directory contains `update.log` and `update-result.json`. Failed staging
jobs remain under `updates/` for diagnosis and can be removed while the application
and helper are stopped. A process/power interruption can leave a `.update` or
`.previous` sibling; the updater refuses to overwrite those unrecognized leftovers.
Inspect the result/log and retain a working copy before clearing them. Restart
failure messages are shown on the next successful application launch.

## Verification

`tests/test_updates.py` protects signature verification, platform selection,
redirect restrictions, corrupt/cancelled downloads, local API authorization,
backup/write ordering, persistent check throttling, helper verification, atomic
replacement failure, archive traversal, and symlink preservation. CI runs tests on
Windows, Linux, and macOS; the native macOS exchange test runs only on macOS.

Every platform's build script runs the packaged application smoke test and
`scripts/check_update_package.py`, which copies and starts the actual frozen helper,
waits for readiness, and cancels it without updating the installed application. On
macOS this also checks extraction of the real release archive. These are not a
substitute for an interactive release-to-release acceptance test: before shipping,
exercise polkit on Fedora and Debian/Ubuntu, Windows antivirus/file-lock behavior,
and macOS Gatekeeper/notarization with the actual release credentials.
