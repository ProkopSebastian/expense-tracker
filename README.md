# Expense tracker

Lokalna aplikacja do importowania wyciągów Nest Banku i Revoluta oraz analizowania wydatków. Dane są przechowywane w lokalnej bazie SQLite.

## Uruchomienie

Wymagane są: Python 3.14, [uv](https://docs.astral.sh/uv/), Node.js i pnpm.

```bash
./start.sh
```

Aplikacja będzie dostępna pod adresem [http://127.0.0.1:8000](http://127.0.0.1:8000). Zatrzymanie: `Ctrl+C` lub `./stop.sh`.

Pliki CSV można wczytać w karcie **Dane i ustawienia** albo umieścić w katalogu `data/` i wybrać **Aktualizuj teraz**.

## Konfiguracja

Opcjonalny klucz OpenAI można dodać w karcie **Dane i ustawienia**. Ustawienia można też podać w pliku `.env` na podstawie `.env.example`.

## Sprawdzenie

```bash
uv run pytest
pnpm --dir frontend build
```

## Windows

```powershell
scripts/build_windows.ps1
```

Gotowe pliki powstaną jako `dist/Wydatki.exe` i `dist/START.txt`. Artefakt
GitHub Actions jest pobierany jako pojedynczy `Wydatki-Windows.zip`.

## Aplikacja natywna na Linuksie

Zamiast otwierać `start.sh` w przeglądarce, można uruchomić aplikację we
własnym oknie (bez paska adresu):

```bash
uv run --group desktop python scripts/desktop_launcher.py
```

Skrót do menu aplikacji (GNOME/KDE): `scripts/install_linux_desktop.sh`.
Używa tego samego katalogu roboczego co `start.sh` — te same dane.
