import pytest

from expense_tracker.importers.pko import _parse_pko_pdf_text


def test_negative_pko_balances_preserve_all_operations():
    rows = _parse_pko_pdf_text(
        "Saldo początkowe 10,00\n"
        "01.01.2026 TEST-1 PRZELEW -20,00 -10,00\n"
        "01.01.2026 Zakupy testowe\n"
        "02.01.2026 TEST-2 PRZELEW 30,00 20,00\n"
        "02.01.2026 Zwrot testowy\n"
        "03.01.2026 TEST-3 PRZELEW -50,00 -30,00\n"
        "03.01.2026 Opłata testowa\n"
        "Saldo końcowe -30,00\n"
    )
    assert [row.external_id for row in rows] == ["TEST-1", "TEST-2", "TEST-3"]
    assert [row.balance for row in rows] == [-10, 20, -30]


@pytest.mark.parametrize("balance", ["brak", "10.00"])
def test_pko_rejects_unreadable_operation_instead_of_partial_import(balance):
    with pytest.raises(ValueError, match="kwoty lub salda"):
        _parse_pko_pdf_text(
            f"01.01.2026 TEST-1 PRZELEW -20,00 {balance}\n"
            "01.01.2026 Zakupy testowe\n"
            "02.01.2026 TEST-2 PRZELEW 30,00 20,00\n"
            "02.01.2026 Zwrot testowy\n"
            "Saldo końcowe 20,00\n"
        )


def test_reimport_repairs_a_pko_batch_from_the_previous_parser(database, tmp_path, monkeypatch):
    import hashlib

    from expense_tracker import data_sync
    from expense_tracker.importers import pko

    path = tmp_path / "synthetic.pdf"
    path.write_bytes(b"Synthetic fixture; extraction is mocked")
    old_text = "02.01.2026 TEST-2 PRZELEW 30,00 20,00\n02.01.2026 Zwrot testowy\nSaldo końcowe 20,00\n"
    full_text = "01.01.2026 TEST-1 PRZELEW -20,00 -10,00\n01.01.2026 Zakupy testowe\n" + old_text
    old_id = database.insert_transaction(_parse_pko_pdf_text(old_text)[0])
    database.connection.execute(
        """INSERT INTO import_batches
        (file_name, file_hash, importer, rows_found, rows_inserted, rows_skipped_duplicate, parser_version)
        VALUES (?, ?, 'pko_pdf', 1, 1, 0, 3)""",
        (path.name, hashlib.sha256(path.read_bytes()).hexdigest()),
    )
    database.connection.commit()
    monkeypatch.setattr(data_sync, "detect_file_format", lambda path: "pko_pdf")
    monkeypatch.setattr(pko, "_extract_pdf_text", lambda path: full_text)
    assert data_sync.import_file(database, path).inserted == 1
    rows = database.connection.execute("SELECT id, external_id FROM transactions ORDER BY external_id").fetchall()
    assert [row["external_id"] for row in rows] == ["TEST-1", "TEST-2"]
    assert rows[1]["id"] == old_id
    assert data_sync.import_file(database, path) is None
