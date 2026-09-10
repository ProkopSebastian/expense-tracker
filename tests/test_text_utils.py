from __future__ import annotations

from expense_tracker.text_utils import clean_description, is_card_operation


def test_clean_description_strips_card_suffix_and_trailing_amount() -> None:
    assert clean_description("MR.ROLLO WARSZAWA Nr karty ...4724 35,00PLN") == "MR.ROLLO WARSZAWA"


def test_clean_description_leaves_plain_descriptions_untouched() -> None:
    assert clean_description("EasyJet") == "EasyJet"
    assert clean_description("Apple Pay deposit by *8313") == "Apple Pay deposit by *8313"


def test_is_card_operation_recognizes_both_banks() -> None:
    assert is_card_operation("Płatności kartą") is True
    assert is_card_operation("Card Payment") is True
    assert is_card_operation("Przelewy wychodzące") is False
    assert is_card_operation(None) is False
