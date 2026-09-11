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

Plik wybrany w interfejsie jest importowany przez plik tymczasowy i nie jest kopiowany do `data/`.
Przycisk „Aktualizuj dane z folderu” obsługuje osobno eksporty umieszczone bezpośrednio w `data/`.

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

Podgląd domyślnie ukrywa dane kontrahenta i numery rachunków oraz maskuje inne rozpoznane identyfikatory.
Jeśli świadomie potrzebujesz zobaczyć surowe wartości do diagnostyki, dodaj opcję `--raw`.

## Dashboard

### Interfejs React

Wszystkie cztery sekcje działają w React: podsumowanie, historia transakcji,
klasyfikacja AI i reguły sprzedawców. Uruchom z katalogu projektu:

```bash
./start.sh
```

Skrypt instaluje zależności według pliku blokady, buduje bieżący kod Reacta
oraz uruchamia API razem z interfejsem. Wymaga uv, Node.js i pnpm;
na tym komputerze potrafi też użyć Node.js i pnpm dołączonych do Codexa.
Otwórz [aplikację](http://127.0.0.1:8000/). Zatrzymanie: Ctrl+C.
Jeśli `start.sh` został uruchomiony w tle albo terminal został zamknięty, użyj `./stop.sh`.
Jeśli port 8000 jest zajęty, zatrzymaj wcześniejszy serwer przed uruchomieniem.
Nie otwieraj bezpośrednio `frontend/index.html` ani adresu Streamlita —
nowa aplikacja jest pod powyższym adresem. Układ dopasowuje się do szerokości okna.

„Odśwież dane” w górnym pasku importuje nowe CSV z `data/`.
„Odśwież widok” w podsumowaniu tylko ponownie pobiera obliczenia.
Historia obsługuje zmianę kategorii, ręczne wpisy, zaznaczanie transakcji do grupowania,
rozwijanie i rozwiązywanie grup oraz zatwierdzanie i odrzucanie powiązań AI.
Filtry i paginacja zachowują kompletne grupy (100 pozycji na stronę).
Klasyfikacja pozwala zapisać kategorię każdego wiersza i zapamiętać regułę;
przyciski AI zachowują limity 20 sprzedawców / 100 transakcji na analizę.
AI nie uruchamia się automatycznie. Reguły można wyszukiwać, zmieniać i usuwać.

Przepływ danych: **React → HTTP `/api/*` → serwisy Pythona → SQLite**.
Obliczenia finansowe i walidacja pozostają w Pythonie. API udostępnia odczyt i zapis,
a połączenia z bazą są zamykane po każdym żądaniu. Kwoty transakcji i podsumowania
są przesyłane jako ciągi znaków. Istniejące funkcje importu i AI są używane ponownie.
Dokumentacja endpointów: [lokalne API](http://127.0.0.1:8000/docs).

Podczas pracy nad frontendem można osobno uruchomić:

```bash
uv run uvicorn expense_tracker.api:app --host 127.0.0.1 --port 8000
pnpm --dir frontend dev
```

Vite na porcie 5173 przekazuje żądania `/api` do Pythona na porcie 8000.
Sprawdzenie: `uv run pytest`, `pnpm --dir frontend build`.
Dotychczasowy Streamlit pozostaje dostępny jako wersja porównawcza.

### Dotychczasowy interfejs Streamlit

```bash
uv run streamlit run src/expense_tracker/ui/app.py
```

Nasłuchuje wyłącznie na `127.0.0.1`. Cztery zakładki:

- **Podsumowanie** — miesiąc (z polską nazwą i nawigacją strzałkami), ostatnie 30 dni, 3 miesiące, rok albo
  własny zakres dat oraz osobny wybór waluty. Wykres kołowy/słupkowy pokazuje wydatki według kategorii;
  kliknięcie kategorii przechodzi do podkategorii i sprzedawców (np. Jedzenie → Zakupy spożywcze →
  Żabka/Biedronka). Na wykresie kołowym cała nawigacja działa w przeglądarce: kliknięcie wycinka wchodzi
  głębiej, a kliknięcie środka wraca, bez przeładowania dashboardu.
- **Historia transakcji** — pełny rejestr transakcji z filtrem kierunku (Wszystkie/Wydatki/Wpływy) i
  kategorii; „grupy” łączące kilka transakcji w jeden realny koszt są wyróżnione kolorem i pokazane jako
  nagłówek z wciętymi pozycjami pod spodem — grupa liczy się zawsze jako jedna pozycja, w jednej kategorii,
  albo wydatek, albo wpływ. Zaznacz jedną transakcję, żeby od razu (bez dodatkowego przycisku) zmienić jej
  kategorię; zaznacz kilka, żeby połączyć je w grupę. Dłuższa historia jest dzielona na strony po 100 pełnych
  grup, bez rozcinania grupy między stronami. Tu też: ręczne dodawanie wydatków (np. gotówkowych) i lista
  istniejących grup.
- **Do klasyfikacji** — klasyfikacja merchantów (wraz z tym, ile razy AI skorzystało z wyszukiwania
  internetowego) i wykrywanie powiązań przez AI (jedno zapytanie, do 100 najnowszych transakcji spoza
  istniejących grup — starsze nie są jeszcze sprawdzane), oraz jedna tabela do ręcznej korekty kategorii.
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

## Do rozważenia: przeliczanie walut na PLN

Podsumowanie celowo pokazuje obecnie każdą walutę osobno — nie dodaje np. EUR do PLN i nie udaje kursu,
którego nie zna. Docelowe przeliczenie na PLN wymaga rozróżnienia dwóch sytuacji:

- bezpośrednia płatność w obcej walucie: preferować rzeczywistą kwotę obciążenia w PLN lub kurs zapisany
  przez bank; jeśli eksport jej nie zawiera, użyć historycznego kursu NBP z jasno oznaczonym przybliżeniem;
- wcześniejsza wymiana PLN na walutę, a dopiero później płatność: połączyć obie strony wymiany jako transfer
  walutowy i zdecydować, czy koszt późniejszego zakupu liczyć po kursie nabycia środków, czy po kursie z dnia
  płatności. Pierwsza metoda jest wierniejsza rzeczywistemu kosztowi, ale wymaga śledzenia salda/partii waluty.

Do czasu wdrożenia tej logiki raport nie powinien automatycznie przeliczać ani sumować różnych walut.

## Aktualny interfejs i ochrona danych

React rozmawia z lokalnym API FastAPI. `./start.sh` buduje aktualne źródła i uruchamia aplikację pod `http://127.0.0.1:8000`.
W „Dane i ustawienia” można wczytać CSV przez wybór pliku lub przeciągnięcie, wskazać osobną nazwę rachunku oraz opcjonalnie zapisać własny klucz AI.

- Nest używa daty operacji, z datą księgowania jako rezerwową. Migracja aktualizuje istniejące wpisy i zachowuje ich klasyfikacje; oryginalne daty pozostają w surowych danych eksportu.
- Revolut uwzględnia PENDING/PROCESSING. Import aktualizuje rozpoznane operacje, zachowując identyfikatory i kategorie. Operacje anulowane przestają wpływać na wynik. Zmiana kwoty operacji w grupie wymaga najpierw rozwiązania grupy. Niejednoznaczne identyfikatory przerywają import całego pliku.
- Bez identyfikatora bankowego rozpoznanie Revolut opiera się na pełnym czasie rozpoczęcia, typie, produkcie i walucie w ramach rachunku. Zmiana również tych pól wymaga ręcznego sprawdzenia eksportu — CSV nie zapewnia pełnej synchronizacji z bankiem.
- Bilans dzienny jest sumą narastającą wyniku po uwzględnieniu grup i wyłączeniu przelewów własnych. Zaczyna od zera i kończy najpóźniej dzisiaj. Grupa jest przypisana do dnia najwcześniejszego składnika. Bilans miesięczny pokazuje ostatnie 12 miesięcy wybranej waluty, niezależnie od filtra okresu.
- Przed zapisami przez API powstaje spójna kopia SQLite. „Cofnij” przywraca stan bazy sprzed ostatniej zmiany, dopóki baza nie została zmieniona poza aplikacją. Klucz AI nie jest częścią bazy ani cofania.
- Kopie znajdują się w `<nazwa-bazy>-backups` obok bazy. Przechowywane są ostatnie 30 kopii uruchomieniowych i 30 kopii operacji oraz ewentualna starsza kopia potrzebna do bieżącego cofnięcia. Przed migracją istniejącej bazy również powstaje kopia.

Modele żądań API: `web_models.py`; operacje aplikacji: `web_service.py`; aktualizowanie importowanych operacji: `import_identity.py`; kopie i cofanie: `recovery.py`.
Typy podsumowania React generuje `uv run python scripts/generate_contracts.py`; sprawdzenie zgodności: ten sam skrypt z `--check`.

## Paczka dla Windows

Kod launchera i konfiguracja budowania są w repozytorium. **Paczka Windows wymaga zbudowania i sprawdzenia na Windows; nie jest generowana przez linuksowe `start.sh`.**

Na Windows ze środowiskiem deweloperskim (uv, Node.js, pnpm) uruchom `scripts/build_windows.ps1`. Wynik to `dist/Wydatki-Windows.zip`. Skrypt buduje Reacta, dołącza Pythona z backendem, wykonuje test uruchomienia gotowej paczki i dodaje instrukcję `START.txt`. Nie dołącza bazy, eksportów CSV ani kluczy.

Alternatywnie workflow `.github/workflows/windows.yml` buduje paczkę na runnerze Windows po ręcznym uruchomieniu lub tagu `v*`, gdy repozytorium jest na GitHubie.
Odbiorca tylko wypakowuje ZIP i uruchamia `Wydatki.exe`. Dane trafiają do `%LOCALAPPDATA%\Wydatki`, oddzielnie od programu, więc wymiana folderu programu ich nie usuwa. Instrukcja odbiorcy: `docs/WINDOWS.txt`.
