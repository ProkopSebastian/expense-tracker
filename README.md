# Expense Tracker (Wydatki)

Aplikacja do śledzenia wydatków na podstawie wyciągów z banku. Została zaprojektowana tak, aby automatyzować kategoryzację i rozwiązywać codzienne problemy z analizą finansów – od rozliczeń ze znajomymi, po transfery między własnymi kontami.

## Główne funkcje

* **Automatyczna kategoryzacja:** Aplikacja sama proponuje i przypisuje kategorie do nowych transakcji.
* **Reguły sprzedawców:** Możesz zapamiętać własne przypisania. Przykładowo, możesz ustawić, że płatności w "KufleKapsle" będą zawsze automatycznie przypisywane do kategorii *Restauracje i dostawy*.
* **Grupowanie transakcji (rozliczenia ze znajomymi):** Koniec z fałszywym zawyżaniem wpływów i wydatków. Kiedy zapłacisz 100 zł za pizzę, a od znajomych dostaniesz dwa przelewy BLIK po 33 zł, możesz złączyć te operacje w jedną grupę. Aplikacja potraktuje to jako jeden, rzeczywisty wydatek na kwotę 34 zł.
* **Wsparcie AI:** Algorytmy potrafią automatycznie sugerować, które transakcje z wyciągu warto połączyć w takie grupy.
* **Inteligentne transfery własne:** Kategoria *Transfer między własnymi kontami* nie wlicza się ani do wydatków, ani do wpływów. Dzięki temu przelanie np. 5000 zł z banku A do banku B (z których oba mają wgrane wyciągi) nie zaburzy Twoich miesięcznych podsumowań.
* **Banki:** Nest, Revolut, Erste, PKO BP, ING i VeloBank (PDF).
* **Waluty i gotówka:** Wydatki w obcej walucie i z gotówki są liczone w złotówkach po kursie, po jakim waluta została kupiona.
* **Majątek:** Wyceny wszystkich kont i oszczędności w czasie, z kursami walut z NBP.

## Prywatność i dane

* **Lokalna baza danych:** Wszystko zostaje u Ciebie. Aplikacja przechowuje całą historię finansową, wyciągi i konfigurację lokalnie, w plikowej bazie danych w jednym folderze. Nigdzie nie wysyła Twoich wyciągów.
* **Funkcje AI:** Do korzystania z funkcji automatycznego sugerowania grup potrzebny jest własny klucz API (OpenAI). Jeśli go nie podasz, aplikacja nadal będzie działać, a transakcje możesz grupować ręcznie. Po kliknięciu funkcji AI opisy i kwoty transakcji trafiają do OpenAI.
* **Kursy NBP:** Przy wycenie majątku aplikacja pobiera kursy z NBP, wysyłając tylko datę i kody walut.

## Dla deweloperów

Desktop update architecture, release signing setup, and recovery: [docs/UPDATES.md](docs/UPDATES.md).

* **Ikony:** `uv run scripts/export_icons.py` generuje ikony aplikacji i favicony z plików SVG.
