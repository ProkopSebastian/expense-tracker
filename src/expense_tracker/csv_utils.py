from __future__ import annotations

import csv
from pathlib import Path


def read_text_with_fallback_encoding(path: Path, encodings: tuple[str, ...] = ("utf-8-sig", "utf-8", "cp1250")) -> str:
    for encoding in encodings:
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Nie udało się odczytać pliku {path} (kodowanie).")


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    content = read_text_with_fallback_encoding(path)
    lines = content.splitlines()
    try:
        dialect = csv.Sniffer().sniff(content[:8192], delimiters=";,\t")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";"

    # Nest precedes the actual table with human-readable account metadata.
    # Find the first row that looks like a transaction header, retaining support
    # for exports that begin directly with the table. Header columns are matched
    # per delimited field (not anywhere in the line) so a summary sentence that
    # merely mentions "data"/"kwota" isn't mistaken for the header row.
    def _looks_like_header(line: str) -> bool:
        fields = [field.strip().casefold() for field in line.split(dialect.delimiter)]
        return any(field.startswith("data") for field in fields) and any(
            field.startswith("kwota") for field in fields
        )

    header_index = next(
        (index for index, line in enumerate(lines) if _looks_like_header(line)),
        0,
    )
    reader = csv.DictReader(lines[header_index:], dialect=dialect)
    if not reader.fieldnames:
        raise ValueError("Plik CSV nie zawiera wiersza z nagłówkami.")
    headers = [header.strip() for header in reader.fieldnames]
    rows = [{str(key).strip(): (value or "").strip() for key, value in row.items() if key} for row in reader]
    return headers, rows
