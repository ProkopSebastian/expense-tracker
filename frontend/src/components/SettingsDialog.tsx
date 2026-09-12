import { useState } from "react";
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { request } from "../hooks";
import { Modal, Notice } from "./Forms";

const CONFIRMATION = "USUŃ DANE";

export default function SettingsDialog({
  aiEnabled,
  onClose,
  onDataReset,
}: {
  aiEnabled: boolean;
  onClose: () => void;
  onDataReset: (apiKeyPreserved: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      <div className="flex flex-col gap-6 p-6">
        <Notice error={error} />
        <section className="flex gap-3 rounded-xl bg-surface-muted p-4">
          <ShieldCheck className="mt-0.5 shrink-0 text-success" size={20} />
          <div className="flex flex-col gap-1">
            <h2 className="text-base!">Dane pozostają na tym komputerze</h2>
            <p className="text-sm leading-relaxed text-muted">
              Baza, importowane pliki i ustawienia aplikacji są przechowywane
              lokalnie.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-line p-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 shrink-0 text-accent" size={20} />
            <div className="flex flex-col gap-1">
              <h2 className="text-base!">Klucz API</h2>
              <p className="text-sm leading-relaxed text-muted">
                {aiEnabled
                  ? "Klucz jest zapisany. Reset danych zachowa go automatycznie — nie trzeba go kopiować ani wklejać ponownie."
                  : "Klucz API nie jest obecnie zapisany."}
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 shrink-0 text-danger" size={20} />
            <div className="flex flex-col gap-1">
              <h2 className="text-base! text-danger">
                Usuń wszystkie dane finansowe
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                Usuwa bezpowrotnie wszystkie transakcje, grupy, klasyfikacje,
                reguły, kopie zapasowe oraz pliki z folderu danych. Klucz API
                zostanie zachowany.
              </p>
            </div>
          </div>

          {confirming ? (
            <>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Aby potwierdzić, wpisz {CONFIRMATION}
                <input
                  autoFocus
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  disabled={busy}
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2 border-t border-danger/20 pt-4">
                <button
                  className="inline-flex items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    setConfirmation("");
                  }}
                >
                  Anuluj
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-medium text-white"
                  disabled={busy || confirmation !== CONFIRMATION}
                  onClick={() => void resetData()}
                >
                  <Trash2 size={16} />
                  {busy ? "Usuwanie…" : "Usuń dane bezpowrotnie"}
                </button>
              </div>
            </>
          ) : (
            <button
              className="self-end inline-flex items-center justify-center gap-2 rounded-xl border border-danger/30 bg-surface px-4 py-2.5 text-sm font-medium text-danger transition hover:bg-danger/10"
              onClick={() => setConfirming(true)}
            >
              <Trash2 size={16} /> Usuń dane aplikacji…
            </button>
          )}
        </section>
      </div>
    </Modal>
  );
}
