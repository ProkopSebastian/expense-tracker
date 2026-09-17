import * as Tabs from "@radix-ui/react-tabs";
import { ChevronDown } from "lucide-react";
import type { LedgerData } from "../domain";
import { request, useAction } from "../hooks";
import { money } from "../api";

export default function LedgerLinksPanel({
  relations,
  cases,
  linksTab,
  onLinksTabChange,
  action,
  onDissolve,
}: {
  relations: LedgerData["relations"];
  cases: LedgerData["cases"];
  linksTab: "relations" | "groups";
  onLinksTabChange: (tab: "relations" | "groups") => void;
  action: ReturnType<typeof useAction>;
  onDissolve: (caseId: number) => void;
}) {
  if (!relations.length && !cases.length) return null;
  return (
    <details className="mb-6">
      <summary className="group flex items-center justify-between gap-3 border-y border-line py-3 text-sm font-medium hover:text-accent">
        <span>
          Powiązania i grupy
          {relations.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted">
              {relations.length} sugestii
            </span>
          )}
        </span>
        <ChevronDown
          size={17}
          className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <Tabs.Root
        value={linksTab}
        onValueChange={(value) => onLinksTabChange(value as "relations" | "groups")}
        className="pt-4"
      >
        <Tabs.List
          className="mb-3 flex w-fit flex-wrap gap-1 rounded-xl bg-surface-muted p-1 [&_button]:flex [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-lg [&_button]:px-3 [&_button]:py-2 [&_button]:text-sm [&_button[data-state=active]]:bg-surface [&_button[data-state=active]]:text-accent [&_button[data-state=active]]:shadow-sm"
          aria-label="Powiązania"
        >
          <Tabs.Trigger value="relations">
            Sugerowane powiązania{" "}
            <span className="ml-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs tracking-normal text-accent">
              {relations.length}
            </span>
          </Tabs.Trigger>
          <Tabs.Trigger value="groups">
            Twoje grupy{" "}
            <span className="ml-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-xs tracking-normal text-accent">
              {cases.length}
            </span>
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value={linksTab}>
          {linksTab === "relations" ? (
            relations.length ? (
              relations.map((s) => (
                <article
                  className="flex flex-col justify-between gap-4 border-b border-line py-5 last:border-0 sm:flex-row sm:items-center [&_p]:my-2 [&_p]:max-w-3xl [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted [&_small]:text-xs [&_small]:text-muted"
                  key={s.id}
                >
                  <div>
                    <strong>{s.payload.title}</strong>
                    <p>{s.payload.rationale}</p>
                    <small>
                      {s.payload.transaction_ids.length} transakcje · Twój koszt:{" "}
                      {money(s.payload.personal_amount, s.payload.currency)}
                    </small>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(
                          () => request(`/suggestions/${s.id}/reject`, "POST"),
                          "Sugestia odrzucona.",
                        )
                      }
                    >
                      Odrzuć
                    </button>
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft border-accent! bg-accent! text-white! shadow-accent/15 hover:bg-accent-hover!"
                      disabled={action.busy}
                      onClick={() =>
                        action.run(
                          () => request(`/suggestions/${s.id}/approve`, "POST"),
                          "Grupa utworzona.",
                        )
                      }
                    >
                      Połącz
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm leading-relaxed text-muted">
                Brak sugerowanych powiązań.
              </p>
            )
          ) : cases.length ? (
            cases.map((c) => (
              <div
                className="flex flex-col justify-between gap-4 border-b border-line py-5 last:border-0 sm:flex-row sm:items-center [&_p]:my-2 [&_p]:max-w-3xl [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted [&_small]:text-xs [&_small]:text-muted"
                key={c.id}
              >
                <span>
                  {c.title} · {money(c.personal_amount, c.currency)}
                </span>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-accent/30 hover:bg-accent-soft"
                  onClick={() => onDissolve(c.id)}
                >
                  Rozwiąż grupę
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              Nie masz jeszcze żadnych grup.
            </p>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </details>
  );
}
