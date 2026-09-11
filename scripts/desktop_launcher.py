"""Frozen Windows entry point: private application data + local browser, no terminal."""

from __future__ import annotations

import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path


def main() -> None:
    if "--smoke-test" in sys.argv:
        from desktop_smoke import run

        run()
        return
    import tkinter as tk
    from tkinter import messagebox

    directory = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local" / "share")) / "Wydatki"
    directory.mkdir(parents=True, exist_ok=True)
    os.chdir(directory)
    os.environ["DATABASE_PATH"] = str(directory / "expense-tracker.sqlite3")
    os.environ["DATA_DIR"] = str(directory / "data")
    (directory / "data").mkdir(exist_ok=True)
    log = (directory / "app.log").open("a", encoding="utf-8")
    sys.stdout = sys.stderr = log
    root = tk.Tk()
    root.title("Wydatki")
    mutex = None
    if sys.platform == "win32":
        import ctypes

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        kernel.CreateMutexW.restype = ctypes.c_void_p
        mutex = kernel.CreateMutexW(None, False, "Local\\WydatkiDesktop")
        if not mutex or ctypes.get_last_error() == 183:
            messagebox.showinfo(
                "Wydatki", "Aplikacja jest już uruchomiona. Użyj przycisku Otwórz aplikację w jej oknie."
            )
            root.destroy()
            return

    root.geometry("400x190")
    root.configure(bg="#f4f8f5")
    label = tk.Label(root, text="Uruchamiam Twoje finanse…", bg="#f4f8f5", font=("Segoe UI", 13))
    label.pack(pady=22)
    try:
        import uvicorn

        from expense_tracker.api import create_app

        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(create_app(), log_config=None))
        worker = threading.Thread(target=lambda: server.run(sockets=[listener]), daemon=True)
        worker.start()
    except Exception as error:
        messagebox.showerror("Nie udało się uruchomić", f"{error}\nSzczegóły: {directory / 'app.log'}")
        root.destroy()
        return
    url = f"http://127.0.0.1:{port}"

    def stop():
        server.should_exit = True
        label.config(text="Zamykam aplikację…")

        def wait():
            if worker.is_alive():
                root.after(100, wait)
            else:
                root.destroy()

        wait()

    root.protocol("WM_DELETE_WINDOW", stop)
    tk.Button(root, text="Otwórz aplikację", command=lambda: webbrowser.open(url), font=("Segoe UI", 11)).pack()
    tk.Button(root, text="Zakończ", command=stop).pack(pady=10)
    attempts = 0

    def ready():
        nonlocal attempts
        attempts += 1
        if server.started:
            label.config(text="Wydatki działają w przeglądarce")
            webbrowser.open(url)
        elif not worker.is_alive() or attempts > 300:
            messagebox.showerror("Błąd uruchomienia", f"Sprawdź dziennik: {directory / 'app.log'}")
            stop()
        else:
            root.after(100, ready)

    root.after(100, ready)
    root.mainloop()
    log.close()


if __name__ == "__main__":
    main()
