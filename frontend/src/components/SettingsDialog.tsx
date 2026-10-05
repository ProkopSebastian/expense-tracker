import { useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Compass,
  Info,
  Monitor,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { request, useAction } from "../hooks";
import {
  DARK_THEMES,
  themeOptions,
  useResolvedTheme,
  useTheme,
  type ThemePreference,
} from "../theme";
import { changelog } from "../changelog";
import { Modal, Notice } from "./Forms";
import ChangelogList from "./ChangelogList";
import UpdatesPanel from "./UpdatesPanel";
import type { UpdateController } from "../updates";

const CONFIRMATION = "USUŃ DANE";

export default function SettingsDialog({
  aiEnabled,
  onClose,
  onChanged,
  onDataReset,
  onOpenTour,
  updates,
}: {
  aiEnabled: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDataReset: (apiKeyPreserved: boolean) => void;
  onOpenTour: () => void;
  updates: UpdateController;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [activeTab, setActiveTab] = useState<"appearance" | "data" | "help">(
    ["available", "ready"].includes(updates.status?.state ?? "") ? "help" : "appearance",
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
            className="segmented"
          >
            <button
              type="button"
              aria-pressed={activeTab === "appearance"}
              onClick={() => setActiveTab("appearance")}
            >
              Wygląd
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "data"}
              onClick={() => setActiveTab("data")}
            >
              Dane i prywatność
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "help"}
              onClick={() => setActiveTab("help")}
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
                {([["Jasne", false], ["Ciemne", true]] as const).map(
                  ([groupLabel, dark]) => (
                    <div key={groupLabel}>
                      <p className="mb-3 text-xs font-medium text-muted">
                        {groupLabel}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {themeOptions
                          .filter(
                            (option) =>
                              option.id !== "system" &&
                              DARK_THEMES.has(option.id) === dark,
                          )
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
                  ),
                )}
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
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
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
                      className="btn-danger self-start sm:self-auto"
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
                  <div className="space-y-4">
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
                        className="btn-primary"
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
                className="space-y-3"
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
                              className="btn"
                              disabled={busy}
                              onClick={() => {
                                setConfirming(false);
                                setConfirmation("");
                              }}
                            >
                              Anuluj
                            </button>
                            <button
                              className="btn-danger"
                              disabled={busy || confirmation !== CONFIRMATION}
                              onClick={() => void resetData()}
                            >
                              {busy ? "Usuwanie…" : "Usuń bezpowrotnie"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="btn-danger mt-4"
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
              <UpdatesPanel updates={updates} />
              <p className="text-sm leading-relaxed text-muted">
                <strong className="text-ink">Jak zacząć:</strong> wgraj wyciąg na
                stronie Import — podsumowanie i kategorie zrobią się same.
              </p>
              <div className="text-sm">
                <p className="mb-2 font-medium">Znaki w aplikacji</p>
                <dl className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-muted [&_dt]:flex [&_dt]:justify-center [&_dt]:text-accent">
                  <dt>
                    <Info size={15} />
                  </dt>
                  <dd>wyjaśnienie, jak coś działa</dd>
                  <dt>
                    <Sparkles size={15} />
                  </dt>
                  <dd>podpowiedź AI</dd>
                  <dt>
                    <ChevronDown size={15} />
                  </dt>
                  <dd>kliknij, żeby zobaczyć więcej</dd>
                </dl>
              </div>
              <button
                type="button"
                className="btn"
                onClick={onOpenTour}
              >
                <Compass size={17} className="text-accent" />
                Uruchom przewodnik
              </button>

              <section
                aria-labelledby="changelog-heading"
                className="space-y-3 pt-2"
              >
                <h2 id="changelog-heading" className="text-base!">
                  Co nowego
                </h2>
                <ChangelogList releases={changelog.slice(0, 1)} />
              </section>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
