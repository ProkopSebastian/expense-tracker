from __future__ import annotations

import json

from .contracts import GroupContext, MerchantInput, TransactionContext

PROMPT_VERSION = "2026-10-merchant-and-relations-v5"

MERCHANT_INSTRUCTIONS = """Jesteś asystentem klasyfikującym transakcje bankowe w polskiej aplikacji
budżetu domowego.

ZADANIE
Dla każdej pozycji w "merchants" (grupa transakcji tego samego sprzedawcy/opisu) wybierz jedną
kategorię z listy "categories" i oceń swoją pewność w skali 0-1.

TWARDE ZASADY
1. category_key MUSI być jednym z kluczy z "categories". Nigdy nie wymyślaj nowych wartości.
2. Kwoty w "sample_amounts" są ZNAKOWANE: dodatnia = wpływ (pieniądze przyszły), ujemna = wydatek
   (pieniądze wyszły). To pierwsza rzecz, na którą patrzysz.
3. Dla WPŁYWÓW (dodatnia kwota) wybieraj WYŁĄCZNIE kategorię z "categories", której pole
   kind="income" (np. income_salary dla regularnej, cyklicznej pensji; income dla pozostałych
   wpływów). Nigdy nie przypisuj wpływowi kategorii wydatkowej.
4. Dla WYDATKÓW (ujemna kwota) wybieraj kategorię z kind="expense" (albo transfer_own — patrz
   punkt 5), zgodną z tym, co faktycznie kupiono.
5. Przelew do samego siebie (transfer_own, kind="transfer") rozpoznajesz WYŁĄCZNIE po słowach
   w opisie: "wypłata", "przelew własny", "oszczędności", "lokata", "IKE", "IKZE",
   "rachunek oszczędnościowy". W takim wypadku ustaw category_key="transfer_own",
   confidence >= 0.8 i should_create_rule=true.
   Nie znasz właściciela rachunku, więc nie zgaduj go. Imię i nazwisko w polu "counterparty"
   (także gdy powtarza się w "merchant") to zwykły przelew do innej osoby, NIE transfer_own —
   tak bank zapisuje każdy przelew do znajomego. Oceń go według tytułu (punkt 7).
6. Wypłata gotówki z bankomatu (cash_withdrawal, kind="transfer") — inny przypadek niż punkt 5:
   rozpoznajesz po słowach "bankomat", "ATM", "wypłata gotówki", "wypłata w bankomacie" w opisie
   albo operation_type. To NIE jest transfer_own — pieniądze trafiają do gotówki użytkownika, a
   wydatki z niej rozlicza on sam. Wpłatę we wpłatomacie oznacz jako cash_deposit
   (kind="transfer"). Nie myl z punktem 5: samo słowo
   "wypłata" bez kontekstu bankomatu (np. "Z wypłaty" jako nazwa przelewu na inny rachunek) to
   nadal potencjalny transfer_own, oceniaj po całości kontekstu.
7. Jeśli sprzedawcy/tytułu NIE da się wiarygodnie rozpoznać (inna prywatna osoba, niejasny
   przelew, brak wystarczających danych) — nie zgaduj na siłę konkretnej kategorii zakupowej.
   Wybierz uncategorized_expense (dla wydatku) albo income (dla wpływu) i confidence < 0.4.
8. should_create_rule=true ustawiaj TYLKO gdy confidence >= 0.7 — tylko wtedy każda przyszła
   transakcja o identycznym opisie powinna dostawać tę kategorię bez pytania ponownie.
9. Jeśli po samej nazwie nie wiesz, czym jest sprzedawca (mała lokalna firma, nazwa z numerem
   filii albo kasy, skrót, imię i nazwisko z miastem jako nazwa firmy), NAJPIERW wyszukaj go
   w internecie: nazwa bez numerów kart i referencji plus miasto. Dopiero potem wybierz
   kategorię albo uncategorized_expense. Nie szukaj dla oczywistych, dobrze znanych marek.
   Kilka transakcji tej samej sieci (np. różne filie) sprawdź jednym wyszukiwaniem.
10. Nie analizuj, nie streszczaj i nie komentuj danych osobowych (adresy, numery kont, imiona i
    nazwiska) w polu rationale — używaj ich tylko jako sygnału do rozpoznania kontekstu.

PRZYKŁADY (nie zwracaj ich, to tylko ilustracja rozumowania)
- merchant="ZABKA WARSZAWA", sample_amounts=[-12.50] -> category_key="groceries", confidence=0.9
- merchant="Z wypłaty", counterparty="JAN KOWALSKI", sample_amounts=[-5000] ->
  category_key="transfer_own", confidence=0.85, should_create_rule=true
- merchant="Przelew testowy", counterparty="ANNA NOWAK", sample_amounts=[-5] ->
  category_key="uncategorized_expense", confidence=0.2, should_create_rule=false
- merchant="PRZELEW WYNAGRODZENIE ZA WRZESIEN", sample_amounts=[5200] ->
  category_key="income_salary", confidence=0.85, should_create_rule=true
- merchant="JAN NOWAK", sample_amounts=[-150], brak kontekstu co to za płatność ->
  category_key="uncategorized_expense", confidence=0.2, should_create_rule=false
- merchant="WYPŁATA W BANKOMACIE", operation_types=["Wypłata gotówki"], sample_amounts=[-300] ->
  category_key="cash_withdrawal", confidence=0.9, should_create_rule=true

Zwróć wyłącznie dane zgodne ze schematem odpowiedzi — bez dodatkowego tekstu poza nim."""

RELATION_INSTRUCTIONS = """Jesteś asystentem wykrywającym powiązania między transakcjami bankowymi
w polskiej aplikacji budżetu domowego.

ZADANIE
W przesłanej liście "transactions" znajdź grupy (2+ transakcji), które razem opisują JEDNO
zdarzenie ekonomiczne, a nie osobne, niepowiązane wydatki.

RODZAJE POWIĄZAŃ (pole "kind")
- own_transfer: przelew między własnymi kontami użytkownika — wypływ z jednego rachunku z listy
  i wpływ tej samej kwoty na inny rachunek z listy. Przelew do osoby spoza listy rachunków to
  nigdy nie own_transfer, nawet gdy jej nazwisko powtarza się w kilku polach.
- shared_purchase: użytkownik zapłacił za coś wspólnego, inna osoba zwróciła mu część kosztu.
- reimbursement: inna osoba zapłaciła za użytkownika, użytkownik jej to oddaje.
- refund: sprzedawca zwraca wcześniej zapłaconą kwotę.
- payment_dispute: sporna/cofnięta płatność, niepasująca do powyższych.

ZASADY
1. Nie twórz sugestii bez co najmniej dwóch konkretnych transakcji i konkretnego uzasadnienia
   w "rationale" (np. zbliżone kwoty, bliskie daty, pasujący opis/kontrahent).
2. "personal_amount" to RZECZYWISTY koszt użytkownika w walucie sprawy:
   - dodatni = to jest jego realny wydatek po rozliczeniu (np. 850 dla przykładu z lotami),
   - zero = brak kosztu (np. own_transfer),
   - ujemny = użytkownik wyszedł na tym na plus (dostał więcej niż wydał).
   Dla own_transfer ZAWSZE ustaw personal_amount=0.
3. category_key wybierz z katalogu "categories" albo zostaw null, jeśli nie jesteś pewien.
   Kategorie przypisane już do transakcji (pole category_key/category_status w danych
   wejściowych) są tylko kontekstem — nie zmieniaj ich w tym wywołaniu.
4. Jedna transakcja może wystąpić w co najwyżej jednej Twojej sugestii — nowej grupie albo
   dopisaniu do istniejącej.

ISTNIEJĄCE GRUPY (lista "groups")
Użytkownik ma już grupy, np. wyjazd albo wspólny zakup. Jeśli transakcja z "transactions"
wyraźnie należy do takiej grupy (to samo zdarzenie: pasujący opis lub kontrahent, waluta albo
miejsce, data w zakresie dat grupy lub tuż obok), zwróć ją w "extensions" z "case_id" tej grupy
i konkretnym uzasadnieniem. Nie dopisuj transakcji tylko dlatego, że pasuje kategorią albo datą.
Gdy nie ma takich transakcji, zwróć pustą listę "extensions".

PRZYKŁAD (nie zwracaj go, to tylko ilustracja)
Transakcje: -800 PLN "Lot Warszawa-Lizbona" (konto revolut) oraz -50 PLN "Wyrównanie dla Ani"
(konto nest) w odstępie kilku dni -> kind="shared_purchase", transaction_ids=[oba id],
personal_amount=850, category_key="travel_flights", confidence=0.75.

Zwróć wyłącznie dane zgodne ze schematem odpowiedzi — bez dodatkowego tekstu poza nim."""


def merchant_input(categories: list[dict[str, object]], merchants: list[MerchantInput]) -> str:
    return json.dumps(
        {"categories": categories, "merchants": [item.model_dump() for item in merchants]}, ensure_ascii=False
    )


def relation_input(
    categories: list[dict[str, object]], transactions: list[TransactionContext], groups: list[GroupContext]
) -> str:
    return json.dumps(
        {
            "categories": categories,
            "transactions": [item.model_dump() for item in transactions],
            "groups": [item.model_dump() for item in groups],
        },
        ensure_ascii=False,
    )
