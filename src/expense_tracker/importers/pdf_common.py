from __future__ import annotations

from pathlib import Path


def _extract_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - packaging failure
        raise ValueError("Brakuje biblioteki pypdf potrzebnej do odczytu wyciągów PDF.") from exc
    try:
        reader = PdfReader(path)
        if reader.is_encrypted and not reader.decrypt(""):
            raise ValueError("Wyciąg PDF jest zabezpieczony hasłem.")
        return "\f".join(page.extract_text() or "" for page in reader.pages)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Nie udało się odczytać tekstu z wyciągu PDF.") from exc


def _pdf_lines(text: str) -> list[str]:
    return [" ".join(line.replace("\u00a0", " ").split()) for line in text.splitlines() if line.strip()]
