import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Compass,
  Monitor,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { request, useAction } from "../hooks";
import {
  themeOptions,
  useResolvedTheme,
  useTheme,
  type ThemePreference,
} from "../theme";
import { changelog } from "../changelog";
import { Modal, Notice } from "./Forms";
import ChangelogList from "./ChangelogList";

const CONFIRMATION = "USUŃ DANE";

export default function SettingsDialog({
  aiEnabled,
  onClose,
  onChanged,
  onDataReset,
  onOpenTour,
}: {
  aiEnabled: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDataReset: (apiKeyPreserved: boolean) => void;
  onOpenTour: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [activeTab, setActiveTab] = useState<"appearance" | "data" | "help">(
    "appearance",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [theme, setTheme] = useTheme();
  const action = useAction(onChanged);
  const systemAppearance = useResolvedTheme("system");

  function selectTheme(next: ThemePreference) {
    setError("");
    void setTheme(next).catch(() =>
      setError("Nie udało się zapisać motywu. Spróbuj ponownie."),
    );
  }

  async function resetData() {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ api_key_preserved: boolean }>(
        "/settings/reset-data",
        "POST",
        { confirmation },
      );
      onDataReset(result.api_key_preserved);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Nie udało się usunąć danych.",
      );
      setBusy(false);
    }
  }

  return (
    <Modal title="Ustawienia aplikacji" onClose={onClose} busy={busy}>
      <div className="p-5 sm:p-6">
        <Notice error={error || action.error} />
        <div className="flex flex-col gap-6">
          <div
            role="group"
            aria-label="Sekcje ustawień"
            className="flex gap-6 border-b border-line"
          >
            <button
              type="button"
              aria-pressed={activeTab === "appearance"}
              onClick={() => setActiveTab("appearance")}
              className={`border-b-2 px-0.5 pb-3 text-sm font-medium transition-colors ${activeTab === "appearance" ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              Wygląd
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "data"}
              onClick={() => setActiveTab("data")}
              className={`border-b-2 px-0.5 pb-3 text-sm font-medium transition-colors ${activeTab === "data" ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              Dane i prywatność
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "help"}
              onClick={() => setActiveTab("help")}
              className={`border-b-2 px-0.5 pb-3 text-sm font-medium transition-colors ${activeTab === "help" ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              Pomoc
            </button>
          </div>
          {activeTab === "appearance" && (
            <section>
              <div
                role="group"
                aria-label="Motyw kolorystyczny"
                className="space-y-5"
              >
                <button
                  type="button"
                  aria-pressed={theme === "system"}
                  onClick={() => selectTheme("system")}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-accent ${theme === "system" ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-muted text-accent">
                    <Monitor size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      Automatycznie
                    </span>
                    <span className="block text-xs text-muted">
                      Zgodnie z urządzeniem · teraz{" "}
                      {systemAppearance === "dark" ? "ciemny" : "jasny"}
                    </span>
                  </span>
                  {theme === "system" && (
                    <Check size={18} className="shrink-0 text-accent" />
                  )}
                </button>
                <div>
                  <p className="mb-3 text-xs font-medium text-muted">
                    Pozostałe motywy
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {themeOptions
                      .filter((option) => option.id !== "system")
                      .map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={theme === option.id}
                          onClick={() => selectTheme(option.id)}
                          className={`min-w-0 rounded-lg border p-2.5 text-left transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${theme === option.id ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
                        >
                          <span
                            className="mb-2 flex h-9 items-center justify-between rounded-md border border-black/5 px-2"
                            style={{ backgroundColor: option.colors[1] }}
                            aria-hidden="true"
                          >
                            <span className="flex gap-1.5">
                              <span
                                className="size-4 rounded-full"
                                style={{ backgroundColor: option.colors[0] }}
                              />
                              <span
                                className="size-4 rounded-full"
                                style={{ backgroundColor: option.colors[2] }}
                              />
                            </span>
                            {theme === option.id && (
                              <Check
                                size={16}
                                style={{ color: option.colors[0] }}
                              />
                            )}
                          </span>
                          <span className="block text-sm font-medium text-ink">
                            {option.label}
                          </span>
                          <span className="sr-only">{option.description}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "data" && (
            <div className="space-y-6">
              <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                <ShieldCheck
                  className="mt-0.5 shrink-0 text-success"
                  size={17}
                />
                Baza i importowane pliki pozostają na tym komputerze.
              </p>

              <section aria-labelledby="ai-heading" className="space-y-3">
                <h2 id="ai-heading" className="text-base!">
                  Pomoc AI
                </h2>
                {aiEnabled ? (
                  <div className="flex flex-col justify-between gap-4 border-y border-line py-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <CheckCircle2
                        size={20}
                        className="shrink-0 text-success"
                      />
                      <div>
                        <h3 className="text-sm font-semibold">
                          Klucz API jest zapisany
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                          Analiza AI jest dostępna przy klasyfikacji.
                        </p>
                      </div>
                    </div>
                    <button
                      className="inline-flex items-center justify-center self-start rounded-lg border border-danger/25 px-3.5 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 sm:self-auto"
                      disabled={busy || action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          await request("/settings/ai", "PUT", {
                            clear_key: true,
                          });
                        })
                      }
                    >
                      Usuń klucz
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 border-y border-line py-4">
                    <p className="text-sm leading-relaxed text-muted">
                      Klucz API jest przechowywany lokalnie. Dane trafiają do
                      dostawcy modelu dopiero po ręcznym uruchomieniu analizy.
                    </p>
                    <label className="flex flex-col gap-2 text-sm font-medium">
                      Klucz API
                      <input
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder="Wklej klucz API"
                      />
                    </label>
                    <div className="flex justify-end">
                      <button
                        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-45"
                        disabled={busy || action.busy || !apiKey.trim()}
                        onClick={() =>
                          void action.run(async () => {
                            await request("/settings/ai", "PUT", {
                              api_key: apiKey,
                            });
                            setApiKey("");
                          })
                        }
                      >
                        Dodaj klucz
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section
                aria-labelledby="reset-heading"
                className="space-y-3 border-t border-line pt-5"
              >
                <h2 id="reset-heading" className="text-base!">
                  Reset danych
                </h2>
                <div>
                  <div className="flex items-start gap-3">
                    <Trash2 className="mt-0.5 shrink-0 text-danger" size={19} />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">
                        Usuń dane finansowe
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        Usunie transakcje, grupy, klasyfikacje, reguły, kopie
                        zapasowe i pliki z folderu danych. Klucz API oraz
                        wybrany motyw pozostaną zapisane.
                      </p>
                      {confirming ? (
                        <div className="mt-4 space-y-3 border-l-2 border-danger/40 bg-danger/5 p-3">
                          <label className="flex flex-col gap-2 text-sm font-medium">
                            Aby potwierdzić, wpisz {CONFIRMATION}
                            <input
                              autoFocus
                              value={confirmation}
                              onChange={(event) =>
                                setConfirmation(event.target.value)
                              }
                              autoComplete="off"
                              disabled={busy}
                            />
                          </label>
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium"
                              disabled={busy}
                              onClick={() => {
                                setConfirming(false);
                                setConfirmation("");
                              }}
                            >
                              Anuluj
                            </button>
                            <button
                              className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white"
                              disabled={busy || confirmation !== CONFIRMATION}
                              onClick={() => void resetData()}
                            >
                              {busy ? "Usuwanie…" : "Usuń bezpowrotnie"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="mt-4 rounded-lg border border-danger/30 px-3.5 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
                          onClick={() => setConfirming(true)}
                        >
                          Usuń dane…
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === "help" && (
            <div className="space-y-5">
              <p className="text-sm leading-relaxed text-muted">
                Aplikacja liczy podsumowania i wykresy z wyciągów bankowych,
                które sam wgrywasz — na stronie Import. Kategorie sprzedawców
                dopasowują się automatycznie na podstawie reguł, a resztę
                poprawiasz ręcznie w klasyfikacji. Wszystkie dane zostają na
                tym komputerze.
              </p>
              <p className="text-sm leading-relaxed text-muted">
                Przy trudniejszych miejscach szukaj małej okrągłej ikonki ze
                znakiem informacji — otwiera krótkie wyjaśnienie danego
                elementu.
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-accent-soft"
                onClick={onOpenTour}
              >
                <Compass size={17} className="text-accent" />
                Uruchom przewodnik
              </button>

              <section
                aria-labelledby="changelog-heading"
                className="space-y-3 border-t border-line pt-5"
              >
                <h2 id="changelog-heading" className="text-base!">
                  Co nowego
                </h2>
                <ChangelogList releases={changelog.slice(0, 5)} />
              </section>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
