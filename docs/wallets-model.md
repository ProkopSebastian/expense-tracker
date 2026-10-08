# Jak działają portfele

Opis dla kogoś, kto nie siedział w dyskusji projektowej. Opisuje model taki, jaki jest, a nie
kolejność, w jakiej do niego doszliśmy.

## Słowniczek

**Kluczowany przez** — to, co identyfikuje jeden rekord i odróżnia go od pozostałych, tak jak
klucz pasuje do jednego zamka. „Portfel kluczowany walutą" znaczy, że może istnieć dokładnie
jeden portfel EUR i pytanie o „portfel MAD" zawsze trafia w ten sam. „Kluczowany kontem i
walutą" znaczy, że identyfikuje go para — więc dirhamy w kieszeni i dirhamy na Revolucie to
dwa osobne portfele, które przypadkiem mają tę samą walutę. Ten wybór decyduje o tym, które
transakcje należą do której kieszeni.

**Podstawa kosztowa** — ile naprawdę kosztowała Cię jednostka obcej waluty, liczone z Twojej
własnej wymiany, a nie z notowań z internetu. Kupno 497,70 MAD za 200 zł daje podstawę
0,4018 zł za dirhama.

## Czym jest portfel

Kieszenią z pieniędzmi, o której wyciąg nie mówi wszystkiego. Prowadzą do niej dwa osobne
problemy i łatwo je ze sobą pomylić:

| problem | dotyczy | czego potrzeba |
|---|---|---|
| nie wiem, ile to kosztowało w złotówkach | walut obcych | kursu z prawdziwej wymiany |
| wyciąg nie mówi, na co to poszło | gotówki, **też złotówkowej** | „ile zostało" |

Wypłata 50 zł z bankomatu ma tylko ten drugi problem. Dirhamy z kantoru mają oba. Saldo
dirhamów na Revolucie ma tylko pierwszy — eksport wymienia każdą płatność z osobna.

## Dlaczego konto + waluta, a nie sama waluta

Portfel kluczowany samą walutą nie potrafi opisać gotówki złotówkowej: portfel PLN pasowałby
do każdej złotówkowej transakcji na każdym koncie i pożarłby cały rejestr.

Przy kluczu z pary kieszenie zostają rozdzielone i istnieją tylko te, które wymagają pilnowania:

| konto | waluta | co trzyma | skąd wiadomo o wydatkach |
|---|---|---|---|
| Gotówka | PLN | gotówka z bankomatu | z tego, ile zostało |
| Gotówka | MAD | dirhamy z kantoru | z tego, ile zostało |
| revolut | MAD | saldo dirhamów na Revolucie | z eksportu, płatność po płatności |
| nest | PLN | *bez portfela* | bank raportuje wszystko |

Ta para sprawia też, że zaimportowany wiersz sam trafia do swojego portfela, bez oznaczania
czegokolwiek ręcznie: wiersz z kontem `revolut` i walutą `MAD` z definicji należy do dokładnie
jednego portfela.

## Wymiana to transfer, nie wydatek

Kupno waluty przesuwa wartość między dwiema kieszeniami. To nie jest wydawanie pieniędzy i nie
ma prawa trafić do sumy kategorii. Aplikacja stosuje tę samą zasadę do przelewu między Twoimi
własnymi kontami i egzekwuje ją tak samo: obie strony trafiają do jednej grupy o rzeczywistym
koszcie zero.

Wypłata z bankomatu to ta sama operacja po kursie 1,00:

```
bankomat:  −50,00 PLN (nest)  →  +50,00 PLN (Gotówka)    kurs 1,0000
kantor:   −200,00 PLN (nest)  →  +497,70 MAD (Gotówka)   kurs 0,4018
```

Dziś aplikacja księguje wypłatę z bankomatu jako wydatek w kategorii „Wypłata gotówki", więc
pieniądze liczą się jako wydane w chwili wyjęcia z maszyny i nic nie zapisuje, co za nie
kupiłeś. To zmienia się wraz z zasilaniem portfeli.

## Wymiana ma dwie transakcje, ale bank nie zawsze przysyła obie

Każda wymiana to dwie transakcje: jedna, z której pieniądze wychodzą, i druga, do której
wchodzą. Z czyjego wyciągu pochodzą, zależy od tego, gdzie wymiana się odbyła, i aplikacja
musi radzić sobie z obiema sytuacjami.

**Revolut przysyła obie.** Przewalutowanie widać dwa razy: jako ubytek w eksporcie salda
złotówkowego i jako przyrost w eksporcie salda docelowego. Obie transakcje są już w bazie po
imporcie, więc aplikacja ma je tylko **połączyć ze sobą**. Gdyby zamiast tego dopisała trzecią,
saldo portfela byłoby dwa razy za duże.

**Kantor i bankomat przysyłają jedną.** Na wyciągu widać tylko ubytek na koncie. Tego, że
dostałeś w zamian 497,70 dirhama, nie wie żaden bank — ta informacja istnieje wyłącznie na
paragonie z kantoru. Tutaj aplikacja musi **zapisać drugą transakcję sama**, z kwotą, którą
jej podasz.

Rozpoznanie, który to przypadek, nie jest zgadywaniem: albo druga transakcja jest w bazie, albo
jej nie ma.

## Średni koszt, gdy pieniądze przychodzą po różnych kursach

Portfel trzyma jedno saldo i jeden średni koszt. Dołożenie pieniędzy przelicza średnią
proporcjonalnie:

```
nowa średnia = (stare saldo × stara średnia + koszt nowych pieniędzy) ÷ (stare saldo + dołożona kwota)
```

Wydatek wycenia się po tej średniej, a nie po kursie z dnia wydania. To, co zostanie, zachowuje
swoją podstawę bezterminowo i czeka na następny wyjazd — nie ma żadnego zamykania ani
wygasania.

Zamiana jednego portfela na drugi (gotówkowe euro na dirhamy) **przenosi podstawę złotówkową**,
zamiast wymyślać nowy kurs, bo żadne złotówki nie przeszły z rąk do rąk.

## Gdy bank przysyła obie transakcje, aplikacja łączy je sama

Przewalutowanie w Revolucie widać dwa razy: jako ubytek w eksporcie salda złotówkowego i jako
przyrost w eksporcie waluty docelowej. Obie mają **ten sam czas rozpoczęcia co do sekundy**, co
wystarcza, żeby je dopasować bez zgadywania. Dzieje się to przy imporcie, a liczbę rozpoznanych
wymian widać w komunikacie po wczytaniu pliku.

Dopasowanie wymaga dokładnie dwóch transakcji w tej samej sekundzie, jednej w dół i jednej w
górę, w różnych walutach. Cokolwiek innego zostaje nietknięte — pojedyncza transakcja bez pary
nie jest błędem i nie zgłasza się jako ostrzeżenie. Portfel dla nowej waluty powstaje przy
okazji sam, z poprawnym kursem.

Sprzedaż waluty z powrotem na złotówki łączy się tak samo. Zysk albo stratę względem kosztu
sprzedanej waluty aplikacja wylicza przy każdym odczycie i pokazuje jako „Różnice kursowe”.
Obie strony muszą pochodzić z tego samego konta, a wymiany, którą bank zapisał po obu stronach,
nie da się rozłączyć.

## „Ile zostało" zamiast pamiętania każdego wydatku

Gotówka nie ma wyciągu. Dokładnie wiadomo, **ile zniknęło**, ale nie wiadomo na co. Dlatego
podaje się tylko kwotę, która została, a aplikacja wylicza resztę i prosi o rozdzielenie jej na
kategorie z grubsza. Suma jest dokładna co do grosza, podział przybliżony — i to jest uczciwy
opis tego, co naprawdę wiesz.

Wydatki dostają własną datę, domyślnie dzisiejszą, ale do cofnięcia. Bez tego gotówka wydana we
wrześniu wpadłaby do podsumowania października tylko dlatego, że wtedy się ją rozlicza.

Jeśli podasz **więcej**, niż portfel kiedykolwiek dostał, aplikacja odmawia zamiast dopisać
brakujące pieniądze. Taki dopisek miałby koszt zero i zaniżyłby średni kurs całego portfela.

## Saldo otwarcia, gdy wymiany nie ma w żadnym wyciągu

Dla pieniędzy, które już masz, a których pochodzenia nie da się odtworzyć: podajesz ile i ile Cię
kosztowały. Kurs wylicza się z tych dwóch liczb. To jedyna furtka na wszystkie luki i świadome
przybliżenie — lepsze niż brak kursu, bo bez niego taka waluta w ogóle nie wchodzi do sum
złotówkowych.

## Gdy wydatki wyprzedzają zapisane zasilenia

Import potrafi pokazać wydatek w walucie, dla której zasilenia nie ma w danych. Takiego wiersza
nie wolno odrzucić — bank ma rację, transakcja się wydarzyła. Portfel schodzi wtedy poniżej zera,
mówi o tym wprost, a **część niepokryta nie wchodzi do sum złotówkowych**, bo nie ma dla niej
żadnego prawdziwego kursu. Naprawia się to, dopisując brakującą wymianę albo saldo otwarcia.

## Odsprzedaż waluty i różnice kursowe

Sprzedaż reszty dirhamów rodzicom to ten sam transfer, tylko w drugą stronę — z jednym
wyjątkiem. Jeśli dostajesz więcej złotówek, niż wynosi podstawa sprzedawanej waluty, różnica
jest prawdziwym zyskiem i musi gdzieś wylądować:

```
zostało 300 MAD po 0,4031   =  121 zł Twojego majątku
tata przelewa po 0,42        =  126 zł
różnica                       =  +5 zł → „Różnice kursowe"
```

Bez tej osobnej pozycji zostają dwa błędy do wyboru: albo całe 126 zł wygląda jak przychód
(choć 121 zł to Twoje własne pieniądze wracające), albo wszystko jest transferem i 5 zł znika,
więc bilans się nie spina.

Jeden wyjątek: jeśli sprzedajesz walutę za złotówki trafiające do portfela gotówkowego PLN, ten
portfel przyjmuje je po wartości nominalnej, a nie po koszcie sprzedawanej waluty. Inaczej kurs
złotówki odpływałby od 1,00, mimo że prawdziwa różnica jest już zaksięgowana osobno.

## Czego świadomie nie modelujemy

- **Portfela GBP.** Revolut przelicza płatności kartą w Wielkiej Brytanii w momencie obciążenia,
  więc przychodzą już w złotówkach i są dokładne. Nie ma czego przeliczać.
- **Notowań kursów.** Każdy kurs w aplikacji pochodzi z transakcji, którą naprawdę wykonałeś.
  Gdy takiej transakcji nie ma, kwota zostaje wyłączona z sum złotówkowych i oznaczona jako
  brakująca, zamiast przeliczyć ją po zgadniętym kursie.
