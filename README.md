# Expense tracker

Lokalny projekt do łączenia wyciągów bankowych i liczenia faktycznych wydatków. Dane transakcyjne trafiają
wyłącznie do lokalnej bazy SQLite (`expense-tracker.sqlite3`) i nie są wysyłane nigdzie automatycznie —
zapytania do AI wychodzą tylko po ręcznym kliknięciu w zakładce „Do klasyfikacji”.

## Import wyciągów

Obsługiwane są eksporty CSV z Nest Banku i Revoluta. Wrzuć plik do folderu `data/` i kliknij
„🔄 Odśwież dane” przy tytule dashboardu. Można też zrobić to z terminala:

```bash
uv run expense-tracker sync
```

Format pliku jest rozpoznawany automatycznie. Import jest idempotentny — ponowne wczytanie tego samego
pliku (rozpoznawane po skrócie SHA-256 zawartości) nic nie dodaje, a każdy wiersz ma też własny odcisk
(konto, data, kwota, waluta, opis), więc nawet ręczne ponowne uruchomienie importu nie tworzy duplikatów.
Rzadki, zaakceptowany wyjątek: dwie różne transakcje tego samego dnia, na tym samym koncie, z identyczną
kwotą i opisem zostaną potraktowane jak duplikat.

Pojedyncze pliki można też importować z podaniem własnej etykiety konta (przydatne przy kilku kontach
tego samego banku):

```bash
uv run expense-tracker import-nest wyciąg.csv --account nest-oszczędnościowe
uv run expense-tracker import-revolut revolut.csv --account revolut-eur
```

Podgląd rozpoznanych kolumn pliku:

```bash
uv run expense-tracker inspect data/plik.csv
```

## Dashboard

```bash
uv run streamlit run src/expense_tracker/ui/app.py
```

Nasłuchuje wyłącznie na `127.0.0.1`. Cztery zakładki:

- **Podsumowanie** — wykres kołowy/słupkowy wydatków wg kategorii z wyborem miesiąca; kliknięcie w kategorię
  (albo wybór z listy, jeśli klik nie zadziała w Twojej przeglądarce) pokazuje jej podkategorie, a potem
  podział na konkretnych sprzedawców (np. Jedzenie → Zakupy spożywcze → Żabka/Biedronka).
- **Historia transakcji** — pełny rejestr transakcji; „grupy” łączące kilka transakcji w jeden realny koszt
  są wyróżnione kolorem i pokazane jako nagłówek z wciętymi pozycjami pod spodem. Zaznacz jedną transakcję,
  żeby od razu (bez dodatkowego przycisku) zmienić jej kategorię; zaznacz kilka, żeby połączyć je w grupę.
  Tu też: ręczne dodawanie wydatków (np. gotówkowych) i lista istniejących grup.
- **Do klasyfikacji** — klasyfikacja merchantów i wykrywanie powiązań przez AI, oraz jedna tabela do
  ręcznej korekty przypisanych kategorii.
- **Reguły sprzedawców** — podgląd zapamiętanych reguł z możliwością zmiany kategorii (poprawka cofa się
  też na transakcje, które ta reguła już wcześniej automatycznie sklasyfikowała) albo usunięcia reguły.

## Kategorie

Kategorie są zamkniętą, predefiniowaną listą (plik `src/expense_tracker/database.py`, stała `CATEGORIES`) —
AI może wybierać tylko spośród nich, nigdy nie tworzy własnych. Raz zatwierdzona kategoria merchanta
(np. „MR.ROLLO” → Restauracje i dostawy) może zostać zapisana jako reguła — kolejne transakcje tego samego
merchanta klasyfikują się automatycznie, bez pytania AI ponownie.

Dopasowanie merchanta (`ledger.merchant_key`) to nadal dokładne dopasowanie znormalizowanego opisu, z jednym
wyjątkiem: jeśli opis zawiera domenę (np. `WWW.VIVACUBA.PL|PAYPRO S.A. ...NUMER TRANSAKCJI BLIK: 883...` —
typowy szum płatności BLIK/online, inny przy każdej transakcji), reguła traktuje samą domenę (`vivacuba.pl`)
jako tożsamość sprzedawcy, więc kolejne płatności do tego samego serwisu trafią pod tę samą regułę mimo
innego szumu wokół. To nie rozwiązuje odwrotnego przypadku — różnych oddziałów jednej sieci sklepów pod
lekko innymi nazwami (np. „Zabka Zb K. Warszawa” vs „Zabka Z K. Warszawa”) — dopasowywanie rozmyte tego typu
łatwo tworzy fałszywe dopasowania dla naprawdę różnych sprzedawców, więc świadomie tego nie zaimplementowano;
najprostszy sposób to sklasyfikować każdy wariant raz (dwa kliknięcia zamiast jednego), a reguła zajmie się
resztą.

## Asystent AI

W pliku `.env` ustaw `OPENAI_API_KEY=...` (plik jest ignorowany przez Git). W zakładce „Do klasyfikacji”
dwa przyciski uruchamiają: klasyfikację merchantów (jedna partia to maksymalnie 20 różnych sprzedawców —
jeśli zostanie więcej, aplikacja mówi wprost ile i trzeba kliknąć ponownie) oraz analizę powiązań między
transakcjami (wspólne zakupy, zwroty, rozliczenia, przelewy własne) — ta druga bierze pod uwagę wszystkie
transakcje spoza już istniejących spraw, niezależnie od tego, czy mają już przypisaną kategorię. AI dostaje
też wpływy (nie tylko wydatki) i wybiera dla nich odpowiednią kategorię przychodową. Opisy i kontrahenci
wysyłane do AI są wcześniej redagowane (`llm/redaction.py`) — numery kont, kart, telefonów i e-maile są
usuwane przed wysyłką; **imiona i nazwy firm nie są redagowane** (to wymagałoby rozpoznawania nazw własnych,
poza zakresem tego narzędzia) — jeśli to istotne, sprawdź dokładne pola w `HANDOFF.md`.

Każde wywołanie tworzy lokalne sugestie widoczne w zakładce „Do klasyfikacji” — nic nie zmienia się bez
zatwierdzenia. Zatwierdzona klasyfikacja może od razu utworzyć regułę merchanta.

Domyślnie używany jest model z `OPENAI_MODEL` (patrz `.env.example`) z opcjonalnym wyszukiwaniem
internetowym dla nierozpoznanych merchantów (`OPENAI_WEB_SEARCH=false`, żeby wyłączyć). Wywołania używają
`store=False`.
