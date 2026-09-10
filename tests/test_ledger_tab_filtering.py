from __future__ import annotations

import pandas as pd

from expense_tracker.ui.ledger_tab import _block_direction


def test_block_direction_broadcasts_the_groups_real_amount_to_member_rows() -> None:
    df = pd.DataFrame(
        [
            {"_group_id": "c1", "Kwota rzeczywista": -850.0},  # case summary row (expense)
            {"_group_id": "c1", "Kwota rzeczywista": None},  # member row
            {"_group_id": "c1", "Kwota rzeczywista": None},  # member row
            {"_group_id": "t5", "Kwota rzeczywista": 500.0},  # standalone income
            {"_group_id": "t6", "Kwota rzeczywista": 0.0},  # transfer_own
        ]
    )

    result = _block_direction(df)

    assert list(result) == [-850.0, -850.0, -850.0, 500.0, 0.0]
