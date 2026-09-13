import { useState } from "react";
import {
  Check,
  CheckCircle2,
  KeyRound,
  Monitor,
  Palette,
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
import { Modal, Notice } from "./Forms";

const CONFIRMATION = "USUŃ DANE";

export default function SettingsDialog({
  aiEnabled,
  onClose,
  onChanged,
  onDataReset,
}: {
  aiEnabled: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDataReset: (apiKeyPreserved: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [activeTab, setActiveTab] = useState<"appearance" | "data">(
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
      <div className="max-w-4xl p-5 sm:p-6">
        <Notice error={error || action.error} />
        <div className="mt-6 flex flex-col gap-6">
          <div
            role="tablist"
            aria-label="Sekcje ustawień"
            className="grid grid-cols-2 rounded-xl bg-surface-muted p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "appearance"}
              onClick={() => setActiveTab("appearance")}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${activeTab === "appearance" ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              <Palette size={16} /> Wygląd
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "data"}
              onClick={() => setActiveTab("data")}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${activeTab === "data" ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              <ShieldCheck size={16} /> Dane i prywatność
            </button>
          </div>
          {activeTab === "appearance" && (
            <section aria-labelledby="appearance-heading" className="space-y-4">
              <div>
                <h2 id="appearance-heading" className="text-base!">
                  Wygląd aplikacji
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  Wybierz paletę. Zmiana jest widoczna od razu i zostanie
                  zapamiętana.
                </p>
              </div>
              <div
                role="group"
                aria-label="Motyw kolorystyczny"
                className="space-y-4"
              >
                <button
                  type="button"
                  aria-pressed={theme === "system"}
                  onClick={() => selectTheme("system")}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-accent ${theme === "system" ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-muted text-accent">
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
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    Wybierz konkretny styl
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {themeOptions
                      .filter((option) => option.id !== "system")
                      .map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={theme === option.id}
                          onClick={() => selectTheme(option.id)}
                          className={`group min-w-0 rounded-xl border p-2.5 text-left transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${theme === option.id ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
                        >
                          <span
                            className="mb-2 flex h-11 items-center justify-between rounded-lg border border-black/5 px-2"
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
                          <span className="block text-sm font-semibold text-ink">
                            {option.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted">
                            {option.description}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "data" && (
            <div className="space-y-6">
              <section aria-labelledby="data-heading" className="space-y-3">
                <h2 id="data-heading" className="text-base!">
                  Dane i prywatność
                </h2>
                <div className="divide-y divide-line rounded-xl border border-line">
                  <div className="flex gap-3 p-4">
                    <ShieldCheck
                      className="mt-0.5 shrink-0 text-success"
                      size={19}
                    />
                    <div>
                      <h3 className="text-sm font-semibold">
                        Przechowywanie lokalne
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        Baza i importowane pliki pozostają na tym komputerze.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-4">
                    <KeyRound
                      className="mt-0.5 shrink-0 text-accent"
                      size={19}
                    />
                    <div>
                      <h3 className="text-sm font-semibold">Klucz API</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        {aiEnabled
                          ? "Klucz jest zapisany i pozostanie dostępny nawet po usunięciu danych finansowych."
                          : "Klucz API nie jest obecnie zapisany."}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section aria-labelledby="ai-heading" className="space-y-3">
                <h2 id="ai-heading" className="text-base!">
                  Pomoc AI
                </h2>
                {aiEnabled ? (
                  <div className="flex flex-col justify-between gap-4 rounded-xl border border-success/25 bg-success/10 p-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3 text-success">
                      <CheckCircle2 size={20} className="shrink-0" />
                      <div>
                        <h3 className="text-sm font-semibold">
                          Klucz API jest zapisany
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                          Analiza AI jest dostępna w widoku klasyfikacji.
                        </p>
                      </div>
                    </div>
                    <button
                      className="inline-flex items-center justify-center rounded-xl border border-danger/25 bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/15"
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
                  <div className="space-y-4 rounded-xl border border-line p-4">
                    <div className="flex gap-3">
                      <KeyRound
                        className="mt-0.5 shrink-0 text-accent"
                        size={19}
                      />
                      <div>
                        <h3 className="text-sm font-semibold">
                          Dodaj klucz API
                        </h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted">
                          Jest przechowywany lokalnie. Dane trafiają do dostawcy
                          modelu dopiero po ręcznym uruchomieniu analizy.
                        </p>
                      </div>
                    </div>
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
                    <div className="flex justify-end border-t border-line pt-4">
                      <button
                        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent-hover disabled:opacity-45"
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
                <div className="rounded-xl border border-line p-4">
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
                        <div className="mt-4 space-y-3 rounded-lg bg-danger/5 p-3">
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
                              className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium"
                              disabled={busy}
                              onClick={() => {
                                setConfirming(false);
                                setConfirmation("");
                              }}
                            >
                              Anuluj
                            </button>
                            <button
                              className="rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white"
                              disabled={busy || confirmation !== CONFIRMATION}
                              onClick={() => void resetData()}
                            >
                              {busy ? "Usuwanie…" : "Usuń bezpowrotnie"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="mt-4 rounded-xl border border-danger/30 px-3.5 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
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
        </div>
      </div>
    </Modal>
  );
}
