from __future__ import annotations

import json

from .contracts import MerchantInput, TransactionContext

PROMPT_VERSION = "2026-09-merchant-and-relations-v2"

MERCHANT_INSTRUCTIONS = """Jesteś analitykiem osobistych finansów w Polsce.
Klasyfikujesz WYŁĄCZNIE przesłane, nierozstrzygnięte grupy płatności według merchanta.
Wybieraj category_key tylko z przekazanego katalogu. Nie twórz własnych kategorii.
Jeśli kontrahent nosi to samo nazwisko/nazwę co właściciel rachunku (przelew do samego
siebie), albo opis zawiera słowa takie jak "wypłata", "przelew własny", "oszczędności",
"lokata", "IKE", "IKZE" wskazujące na przesunięcie środków między własnymi rachunkami,
wybierz transfer_own z wysoką pewnością i ustaw should_create_rule na true.
Jeśli merchant jest inną prywatną osobą (nie właścicielem rachunku), przelewem, którego
nie da się wiarygodnie rozpoznać jako transfer własny, wybierz uncategorized_expense
i niską pewność. Możesz użyć wyszukiwania internetu tylko gdy rozpoznanie merchanta
wymaga aktualnej informacji. Nie analizuj ani nie komentuj danych osobowych. Zwróć
wyłącznie dane zgodne ze schematem odpowiedzi."""

RELATION_INSTRUCTIONS = """Jesteś analitykiem osobistych finansów w Polsce.
Szukasz WYŁĄCZNIE grup transakcji, które razem opisują jedno zdarzenie ekonomiczne:
transfer między własnymi kontami, wspólny zakup, rozliczenie, zwrot albo spór płatniczy.
Nie twórz sugestii bez co najmniej dwóch konkretnych transakcji i sensownych dowodów.
personal_amount to rzeczywisty koszt użytkownika w walucie sprawy: dodatni oznacza wydatek,
zero oznacza brak kosztu, ujemny oznacza nadwyżkę/zwrot. Dla przelewu własnego ustaw zero.
Wybieraj category_key tylko z katalogu albo null, jeśli kategoria jest niepewna.
Zatwierdzone kategorie są kontekstem, nie zmieniaj ich. Zwróć wyłącznie dane zgodne ze schematem odpowiedzi."""


def merchant_input(categories: list[dict[str, object]], merchants: list[MerchantInput]) -> str:
    return json.dumps(
        {"categories": categories, "merchants": [item.model_dump() for item in merchants]}, ensure_ascii=False
    )


def relation_input(categories: list[dict[str, object]], transactions: list[TransactionContext]) -> str:
    return json.dumps(
        {"categories": categories, "transactions": [item.model_dump() for item in transactions]}, ensure_ascii=False
    )
