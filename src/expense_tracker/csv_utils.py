from __future__ import annotations

import csv
from pathlib import Path


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    content: str | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp1250"):
        try:
            content = path.read_text(encoding=encoding)
            break
        except UnicodeDecodeError:
            continue
    if content is None:
        raise ValueError(f"Nie udało się odczytać pliku {path} (kodowanie).")

    lines = content.splitlines()
    try:
        dialect = csv.Sniffer().sniff(content[:8192], delimiters=";,\t")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = ";"

    # Nest precedes the actual table with human-readable account metadata.
    # Find the first row that looks like a transaction header, retaining support
    # for exports that begin directly with the table.
    header_index = next(
        (index for index, line in enumerate(lines) if "data" in line.casefold() and "kwota" in line.casefold()),
        0,
    )
    reader = csv.DictReader(lines[header_index:], dialect=dialect)
    if not reader.fieldnames:
        raise ValueError("Plik CSV nie zawiera wiersza z nagłówkami.")
    headers = [header.strip() for header in reader.fieldnames]
    rows = [{str(key).strip(): (value or "").strip() for key, value in row.items() if key} for row in reader]
    return headers, rows
