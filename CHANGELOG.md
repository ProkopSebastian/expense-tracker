## v0.6.0 — 05.10.2026

- feat: nowa zakładka „Majątek” — co jakiś czas wpisujesz, ile masz na kontach, lokatach, w obligacjach czy złocie, a aplikacja rysuje wykres całego majątku
- feat: kwoty w walutach obcych liczą się po kursie z dnia zapisu i późniejszy kurs ich nie zmienia
- feat: historia zapisów z podziałem na rodzaje składników — każdy zapis można poprawić albo usunąć
- feat: nieaktywne i wyzerowane składniki są zwinięte na dole listy, a ich historia zostaje

## v0.5.0 — 05.10.2026

- feat: aktualizacje z poziomu aplikacji — sprawdzanie dostępności, pobieranie i instalacja po zamknięciu okna
- feat: opcjonalne sprawdzanie aktualizacji w tle, najwyżej raz dziennie i bez blokowania startu

## v0.4.1 — 02.10.2026

- fix: aplikacja na Linuksie uruchamia się na nowszych dystrybucjach (np. Fedora 44), zamiast zamykać się zaraz po starcie

## v0.4.0 — 02.10.2026

- feat: portfele na gotówkę i waluty obce — wydatki w euro czy dirhamach liczą się w złotówkach po kursie Twojej wymiany
- feat: wymiany walut z wyciągów Revoluta same zakładają i zasilają portfel
- feat: „Rozlicz” w portfelu — wpisujesz, ile zostało, a różnica trafia do wydatków
- feat: podsumowanie domyślnie liczy wszystkie waluty łącznie w złotówkach
- feat: grupy mogą łączyć transakcje w różnych walutach
- feat: filtr waluty w historii transakcji
- feat: nowy, spokojniejszy wygląd wszystkich stron
- feat: sugestie powiązań AI są teraz w „Do klasyfikacji”, razem z transakcjami, których dotyczą
- feat: „Zatwierdź pewne” zatwierdza jednym kliknięciem sugestie AI z pewnością od 90%
- feat: „Cofnij” w komunikacie po każdej zmianie
- feat: na stronie Import widać, do którego dnia masz dane z każdego rachunku
- feat: nowy przewodnik z przykładami (Ustawienia → Pomoc)
- feat: nowe logo aplikacji
- fix: przelewy bez nazwy sprzedawcy pokazują swój tytuł zamiast powtórzonego nazwiska
- fix: AI nie uznaje już przelewu do innej osoby za przelew własny
- fix: listy rozwijane w okienkach nie są już przycinane
- fix: w jasnym motywie przy ciemnym motywie systemu pola wyboru nie są już wypełnione

## v0.3.2 — 16.09.2026

- feat: dodano obsługę wyciągów PDF z PKO BP
- fix: import wyciągów Nest nie gubi już cicho transakcji o tej samej kwocie i opisie tego samego dnia
- fix: ekran „Co nowego” i samouczek nie pokazują się już przy każdym uruchomieniu aplikacji desktopowej

## v0.3.1 — 16.09.2026

- fix: ten sam kontrahent w wyciągu Erste nie rozjeżdża się już na kilka wpisów w kolejce klasyfikacji
- fix: ekran „Co nowego” pokazuje teraz wszystkie wersje od ostatnio widzianej, nie tylko najnowszą

## v0.3.0 — 16.09.2026

- feat: dodano wyszukiwanie w wyborze kategorii
- feat: listy klasyfikacji i automatycznych przypisań ładują teraz kolejne pozycje automatycznie po doscrollowaniu do końca
- feat: suma kwot przy grupowych sugestiach AI pokazuje rozwijaną listę pojedynczych transakcji, a podsumowanie analizy AI jest czytelniejsze
- fix: ekran ładowania pojawia się od razu przy starcie aplikacji na Windows, zamiast pustego okna
- fix: szybki restart aplikacji na Windows nie pokazuje już fałszywego komunikatu "aplikacja jest już uruchomiona"
- fix: usunięto osierocone pliki WAL kopii zapasowych, które nie były czyszczone przy rotacji

## v0.2.1 — 14.09.2026

- feat: dodano obsługę wyciągów z Erste (CSV) oraz ING i Velo (PDF), obok Nest i Revolut
- feat: dodano ikonki pomocy na stronie importu, wyjaśniające rozpoznawanie banku, dwa sposoby wgrywania wyciągów i zakres cofania zmian
- feat: dodano przewodnik po aplikacji (4 kroki) oraz kartę „Pomoc” w ustawieniach
- feat: dodano listę „Co nowego” w ustawieniach i jednorazowy komunikat po aktualizacji
- fix: okna dialogowe (ustawienia, reguły, rejestr) nie przeskakują już na ekranie przy zmianie zawartości zakładek
- fix: usunięto biały błysk ekranu ładowania przy odświeżeniu strony w ciemnych motywach
- fix: zainstalowana aplikacja desktopowa zapisuje dane we właściwym katalogu systemowym zamiast w katalogu roboczym procesu
