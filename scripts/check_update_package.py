from __future__ import annotations

import argparse
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from expense_tracker.updates.installer import extract_bundle, prepare_helper
from expense_tracker.updates.platforms import Installation


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("application", type=Path)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    application = args.application.resolve()
    kind = "bundle" if application.suffix == ".app" else "portable"
    with TemporaryDirectory(prefix="wydatki-update-smoke-") as temporary:
        state = Path(temporary)
        if args.archive is not None:
            application = extract_bundle(args.archive.resolve(), state / "unpacked")
        job = state / "updates" / "smoke"
        job.mkdir(parents=True)
        prepare_helper(Installation("smoke", application, kind), job, state)
        (job / "cancel").touch()
        deadline = time.monotonic() + 15
        while not (job / "helper-stopped").exists():
            if time.monotonic() >= deadline:
                raise RuntimeError("The updater did not acknowledge cancellation")
            time.sleep(0.1)
        # Windows may hold the worker image until the PyInstaller parent finishes cleanup.
        deadline = time.monotonic() + 15
        worker = job / "worker.exe"
        while worker.exists():
            try:
                worker.unlink()
            except PermissionError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.1)
    print("Packaged updater starts independently and cancels without changing the application.")


if __name__ == "__main__":
    main()
