import { Fragment, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { Asset, Snapshot, WealthData } from "../domain";
import { request, useAction, useResource, useSessionState } from "../hooks";
import { dayLabel, money, rateFormat } from "../api";
import { Modal, Notice } from "../components/Forms";
import HelpPopover from "../components/HelpPopover";
import WealthChart from "../components/WealthChart";
import { displayedBalance } from "../wealthFormState";
import {
  ASSET_KINDS,
  AssetForm,
  KIND_ORDER,
  SnapshotForm,
  byKindThenName,
} from "../components/WealthForms";

const MISSING = "—";

function AssetRow({
  asset,
  lastDay,
  onEdit,
}: {
  asset: Asset;
  lastDay: string | undefined;
  onEdit: (asset: Asset) => void;
}) {
  const latest = displayedBalance(asset, lastDay);
  const details = [
    latest?.rate &&
      `${money(latest.amount, asset.currency)} × ${rateFormat.format(Number(latest.rate))}`,
    latest && latest.day !== lastDay && `z ${dayLabel(latest.day)}`,
  ].filter(Boolean);
  return (
    <li>
      <button
        className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left transition hover:bg-accent-soft"
        onClick={() => onEdit(asset)}
      >
        <span className="min-w-0">
          <span className="block truncate">{asset.name}</span>
          <span className="block text-sm text-muted">
            {[asset.institution, ASSET_KINDS[asset.kind], asset.currency]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <strong className="block font-semibold tabular-nums">
            {latest ? money(latest.pln, "PLN") : MISSING}
          </strong>
          {details.length > 0 && (
            <span className="block text-sm text-muted tabular-nums">
              {details.join(" · ")}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function AssetGroup({
  title,
  assets,
  lastDay,
  onEdit,
}: {
  title: string;
  assets: Asset[];
  lastDay: string | undefined;
  onEdit: (asset: Asset) => void;
}) {
  if (!assets.length) return null;
  return (
    <details className="group mt-3 border-t border-line/60 pt-3">
      <summary className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="transition group-open:rotate-90" />
        {title} ({assets.length})
      </summary>
      <ul>
        {assets.map((asset) => (
          <AssetRow
            key={asset.id}
            asset={asset}
            lastDay={lastDay}
            onEdit={onEdit}
          />
        ))}
      </ul>
    </details>
  );
}

function Overview({
  data,
  onEdit,
}: {
  data: WealthData;
  onEdit: (asset: Asset) => void;
}) {
  const last = data.snapshots.at(-1);
  const change = Number(last?.change ?? 0);
  const active = data.assets.filter((asset) => asset.is_active);
  // Zero is a real amount, unlike a missing one, but an emptied account would only clutter the list.
  const zero = active.filter(
    (asset) => {
      const balance = displayedBalance(asset, last?.day);
      return balance !== null && Number(balance.amount) === 0;
    },
  );
  const current = active
    .filter((asset) => !zero.includes(asset))
    .sort(
      (left, right) =>
        Number(displayedBalance(right, last?.day)?.pln ?? 0) -
        Number(displayedBalance(left, last?.day)?.pln ?? 0),
    );
  const inactive = data.assets
    .filter((asset) => !asset.is_active)
    .sort(byKindThenName);
  return (
    <div className="flex flex-col gap-6">
      <section className="card p-6">
        {last ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-normal tracking-normal text-muted">
                  Łączna wartość
                </h2>
                <strong className="mt-1 block text-4xl font-semibold tracking-tight tabular-nums">
                  {money(last.total, "PLN")}
                </strong>
                {last.change !== null && (
                  <p
                    className={`mt-1 text-sm tabular-nums ${change > 0 ? "text-success" : change < 0 ? "text-danger" : "text-muted"}`}
                  >
                    {change > 0 ? "+" : ""}
                    {money(change, "PLN")} od poprzedniego zapisu
                  </p>
                )}
              </div>
              <span className="text-sm text-muted">
                Stan na {dayLabel(last.day)}
              </span>
            </div>
            <div className="mt-4">
              <WealthChart snapshots={data.snapshots} />
            </div>
          </>
        ) : (
          <p className="flex min-h-32 items-center justify-center text-center text-sm text-muted">
            Kliknij „Aktualizuj wartości” i wpisz, ile masz na każdym składniku.
          </p>
        )}
      </section>
      <section className="card p-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2>Składniki majątku</h2>
          <span className="rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            {active.length} aktywne
          </span>
        </div>
        <ul>
          {current.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              lastDay={last?.day}
              onEdit={onEdit}
            />
          ))}
        </ul>
        <AssetGroup
          title="Zerowe"
          assets={zero}
          lastDay={last?.day}
          onEdit={onEdit}
        />
        <AssetGroup
          title="Nieaktywne"
          assets={inactive}
          lastDay={last?.day}
          onEdit={onEdit}
        />
      </section>
    </div>
  );
}

function SnapshotDetails({
  snapshot,
  assets,
  onEdit,
  onRemove,
}: {
  snapshot: Snapshot;
  assets: Asset[];
  onEdit: (snapshot: Snapshot) => void;
  onRemove: (snapshot: Snapshot) => void;
}) {
  const rates = Object.entries(snapshot.rates)
    .map(([currency, rate]) => `${currency} ${rateFormat.format(Number(rate))}`)
    .join(" · ");
  return (
    <>
      <ul className="grid gap-x-8 gap-y-1.5 py-2 sm:grid-cols-2">
        {[...assets].sort(byKindThenName).map((asset) => {
          const balance = snapshot.balances.find(
            (item) => item.asset_id === asset.id,
          );
          return (
            <li key={asset.id} className="flex justify-between gap-4">
              <span className="truncate text-muted">{asset.name}</span>
              <span className="tabular-nums">
                {!balance
                  ? MISSING
                  : asset.currency === "PLN"
                    ? money(balance.pln, "PLN")
                    : `${money(balance.amount, asset.currency)} = ${money(balance.pln, "PLN")}`}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 py-3">
        <span className="text-muted">
          {rates ? `Kursy z tego dnia: ${rates}` : "Wszystko w złotówkach."}
        </span>
        <span className="flex gap-2">
          <button className="btn" onClick={() => onEdit(snapshot)}>
            <Pencil size={15} />
            Popraw
          </button>
          <button className="btn-danger" onClick={() => onRemove(snapshot)}>
            <Trash2 size={15} />
            Usuń
          </button>
        </span>
      </div>
    </>
  );
}

function History({
  data,
  onEdit,
  onRemove,
}: {
  data: WealthData;
  onEdit: (snapshot: Snapshot) => void;
  onRemove: (snapshot: Snapshot) => void;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const kinds = KIND_ORDER.filter((kind) =>
    data.assets.some((asset) => asset.kind === kind),
  );
  if (!data.snapshots.length) {
    return (
      <p className="card flex min-h-32 items-center justify-center p-6 text-center text-sm text-muted">
        Historia pojawi się po pierwszej aktualizacji wartości.
      </p>
    );
  }
  return (
    <section className="card overflow-x-auto p-6">
      <table className="w-full text-sm [&_td]:border-t [&_td]:border-line/40 [&_td]:py-2.5 [&_td]:pr-4 [&_td]:whitespace-nowrap [&_th]:pr-4 [&_th]:pb-2 [&_th]:text-xs [&_th]:font-normal [&_th]:whitespace-nowrap [&_th]:text-muted">
        <thead>
          <tr>
            <th className="text-left">Data</th>
            {kinds.map((kind) => (
              <th key={kind} className="text-right">
                {ASSET_KINDS[kind]}
              </th>
            ))}
            <th className="text-right">Razem</th>
          </tr>
        </thead>
        <tbody>
          {[...data.snapshots].reverse().map((snapshot) => {
            const open = openId === snapshot.id;
            return (
              <Fragment key={snapshot.id}>
                <tr
                  className="cursor-pointer transition hover:bg-accent-soft/50"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : snapshot.id)}
                >
                  <td className="tabular-nums">
                    <span className="flex items-center gap-2">
                      <ChevronRight
                        size={15}
                        className={`text-muted transition ${open ? "rotate-90" : ""}`}
                      />
                      {dayLabel(snapshot.day)}
                    </span>
                  </td>
                  {kinds.map((kind) => (
                    <td key={kind} className="text-right tabular-nums">
                      {snapshot.by_kind[kind]
                        ? money(snapshot.by_kind[kind], "PLN")
                        : MISSING}
                    </td>
                  ))}
                  <td className="text-right font-semibold tabular-nums">
                    {money(snapshot.total, "PLN")}
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td
                      colSpan={kinds.length + 2}
                      className="bg-surface-muted/40 px-4"
                    >
                      <SnapshotDetails
                        snapshot={snapshot}
                        assets={data.assets}
                        onEdit={onEdit}
                        onRemove={onRemove}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default function WealthPage({
  revision,
  onChanged,
}: {
  revision: number;
  onChanged: () => void;
}) {
  const { data, error, loading } = useResource<WealthData>("/wealth", revision);
  const [view, setView] = useSessionState("wealth.view", "overview");
  const [snapshotForm, setSnapshotForm] = useState<{
    editing?: Snapshot;
  } | null>(null);
  const [assetForm, setAssetForm] = useState<{ asset?: Asset } | null>(null);
  const [removing, setRemoving] = useState<Snapshot | null>(null);
  const action = useAction(() => {
    setRemoving(null);
    onChanged();
  });
  const hasActive = Boolean(data?.assets.some((asset) => asset.is_active));
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1>Majątek</h1>
          <HelpPopover label="Jak działa majątek">
            <div className="flex flex-col gap-3">
              <p>
                Co jakiś czas wpisujesz, ile masz na każdym koncie, lokacie czy
                w obligacjach. Z tych zapisów powstaje wykres całego majątku.
              </p>
              <p>
                Nie dotyka to wydatków ani portfeli. Gdy obligacje zostaną
                wykupione na konto, przy następnej aktualizacji wpisujesz po
                prostu nowe kwoty obu składników.
              </p>
            </div>
          </HelpPopover>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setAssetForm({})}>
            <Plus size={17} />
            Nowy składnik
          </button>
          <button
            className="btn-primary"
            disabled={!hasActive}
            onClick={() => setSnapshotForm({})}
          >
            <Plus size={17} />
            Aktualizuj wartości
          </button>
        </div>
      </div>
      <Notice
        error={error || action.error}
        notice={action.notice}
        undoLabel={action.undoLabel}
        onUndo={action.undo}
      />
      {!data ? (
        !error && (
          <div className="card flex min-h-48 items-center justify-center text-sm text-muted">
            {loading && "Wczytuję…"}
          </div>
        )
      ) : !data.assets.length ? (
        <div className="card flex min-h-48 flex-col items-center justify-center gap-4 px-6 py-10 text-center text-sm text-muted">
          <h2 className="text-ink">Wszystkie oszczędności w jednym miejscu</h2>
          <p className="max-w-md leading-relaxed">
            Dodaj konta, lokaty, obligacje, gotówkę czy długi. Potem co jakiś
            czas wpisuj, ile na nich masz — zobaczysz, jak zmienia się Twój
            majątek.
          </p>
          <button className="btn-primary" onClick={() => setAssetForm({})}>
            <Plus size={17} />
            Dodaj pierwszy składnik
          </button>
        </div>
      ) : (
        <Tabs.Root value={view} onValueChange={setView}>
          <Tabs.List aria-label="Widok majątku" className="segmented mb-5">
            <Tabs.Trigger value="overview">Przegląd</Tabs.Trigger>
            <Tabs.Trigger value="history">Historia</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="overview">
            <Overview data={data} onEdit={(asset) => setAssetForm({ asset })} />
          </Tabs.Content>
          <Tabs.Content value="history">
            <History
              data={data}
              onEdit={(editing) => setSnapshotForm({ editing })}
              onRemove={setRemoving}
            />
          </Tabs.Content>
        </Tabs.Root>
      )}
      {data && snapshotForm && (
        <SnapshotForm
          assets={data.assets}
          snapshots={data.snapshots}
          editing={snapshotForm.editing}
          onAddAsset={() => setAssetForm({})}
          onClose={() => setSnapshotForm(null)}
          onSaved={onChanged}
        />
      )}
      {assetForm && (
        <AssetForm
          asset={assetForm.asset}
          onClose={() => setAssetForm(null)}
          onSaved={onChanged}
        />
      )}
      {removing && (
        <Modal
          title="Usunąć ten zapis?"
          onClose={() => setRemoving(null)}
          busy={action.busy}
        >
          <div className="flex flex-col gap-5 p-5 text-sm sm:p-6">
            <p>
              Stan na {dayLabel(removing.day)}: {money(removing.total, "PLN")}.
            </p>
            <p className="text-muted">
              Składniki zostają. Znikają tylko kwoty i kursy z tego dnia.
            </p>
            <Notice error={action.error} />
            <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button
                className="btn"
                onClick={() => setRemoving(null)}
                disabled={action.busy}
              >
                Anuluj
              </button>
              <button
                className="btn-danger"
                disabled={action.busy}
                onClick={() =>
                  action.run(
                    () => request(`/wealth/snapshots/${removing.id}`, "DELETE"),
                    "Zapis usunięty.",
                  )
                }
              >
                Usuń
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
