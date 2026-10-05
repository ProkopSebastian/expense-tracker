import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Asset, AssetKind, Snapshot } from "../domain";
import { request, useAction } from "../hooks";
import { dayLabel, money } from "../api";
import { CurrencyInput, Modal, Notice } from "./Forms";
import AppSelect from "./AppSelect";

export const ASSET_KINDS: Record<AssetKind, string> = {
  account: "Konto",
  savings: "Oszczędności",
  bonds: "Obligacje",
  investments: "Inwestycje",
  cash: "Gotówka",
  gold: "Złoto",
  debt: "Długi",
  other: "Inne",
};
export const KIND_ORDER = Object.keys(ASSET_KINDS) as AssetKind[];

export function byKindThenName(left: Asset, right: Asset) {
  return (
    KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind) ||
    left.name.localeCompare(right.name, "pl")
  );
}

const FORM_CLASS =
  "flex flex-col gap-5 p-5 sm:p-6 [&>p]:text-sm [&>p]:leading-relaxed [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-sm [&_label_small]:text-xs [&_label_small]:text-muted";
const ROW_CLASS = "flex-row! items-center justify-between gap-4! py-3";
const AMOUNT_CLASS = "w-40 shrink-0 text-right tabular-nums";

// Typed by hand in Polish, so "1 234,56" must read the same as "1234.56".
function normalize(text = "") {
  return text.replace(/[\s ]/g, "").replace(",", ".");
}

function isNumber(text = "") {
  return /^-?\d+(\.\d+)?$/.test(normalize(text));
}

function asInput(value: string) {
  return value.replace(".", ",");
}

export function AssetForm({
  asset,
  onClose,
  onSaved,
}: {
  asset?: Asset;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<string>(asset?.kind ?? "account");
  const action = useAction(onSaved);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const entry = {
      name: fields.get("name"),
      kind,
      institution: fields.get("institution") || null,
    };
    const ok = await action.run(() =>
      asset
        ? request(`/wealth/assets/${asset.id}`, "PUT", {
            ...entry,
            is_active: fields.get("is_active") === "on",
          })
        : request("/wealth/assets", "POST", {
            ...entry,
            currency: fields.get("currency"),
          }),
    );
    if (ok) onClose();
  }
  async function remove() {
    if (
      await action.run(() => request(`/wealth/assets/${asset!.id}`, "DELETE"))
    )
      onClose();
  }
  return (
    <Modal
      title={asset ? "Składnik majątku" : "Nowy składnik majątku"}
      onClose={onClose}
      busy={action.busy}
    >
      <form onSubmit={submit} className={FORM_CLASS}>
        <Notice error={action.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            Nazwa
            <input
              name="name"
              required
              maxLength={500}
              defaultValue={asset?.name}
            />
            <small>Na przykład Obligacje skarbowe albo Revolut EUR.</small>
          </label>
          <label>
            Rodzaj
            <AppSelect
              ariaLabel="Rodzaj składnika"
              value={kind}
              onValueChange={setKind}
              options={KIND_ORDER.map((key) => ({
                value: key,
                label: ASSET_KINDS[key],
              }))}
            />
          </label>
          <label>
            Waluta
            {asset ? (
              <input value={asset.currency} disabled />
            ) : (
              <CurrencyInput
                name="currency"
                ariaLabel="Waluta składnika"
                defaultValue="PLN"
              />
            )}
            <small>
              {asset
                ? "Waluty nie można zmienić."
                : "W tej walucie będziesz wpisywać kwotę."}
            </small>
          </label>
          <label className="sm:col-span-2">
            Gdzie (opcjonalnie)
            <input
              name="institution"
              maxLength={500}
              defaultValue={asset?.institution ?? ""}
              placeholder="Bank, broker, skarbonka…"
            />
          </label>
          {asset && (
            <label className="flex-row! items-center sm:col-span-2">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={asset.is_active}
              />
              Aktywny — pokazuj przy aktualizacji stanu
            </label>
          )}
        </div>
        {asset && (
          <p className="text-muted">
            Nieaktywny składnik zachowuje całą historię, tylko nie pojawia się
            przy kolejnych aktualizacjach.
          </p>
        )}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
          {asset && !asset.latest && (
            <button
              type="button"
              className="btn-danger mr-auto"
              disabled={action.busy}
              onClick={remove}
            >
              Usuń
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={action.busy}
            onClick={onClose}
          >
            Anuluj
          </button>
          <button className="btn-primary" disabled={action.busy}>
            {action.busy ? "Zapisuję…" : asset ? "Zapisz" : "Dodaj składnik"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function latestRate(assets: Asset[], currency: string) {
  return assets
    .filter((asset) => asset.currency === currency && asset.latest?.rate)
    .sort((left, right) => right.latest!.day.localeCompare(left.latest!.day))[0]
    ?.latest!.rate;
}

export function SnapshotForm({
  assets,
  snapshots,
  editing,
  onAddAsset,
  onClose,
  onSaved,
}: {
  assets: Asset[];
  snapshots: Snapshot[];
  editing?: Snapshot;
  onAddAsset: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [day, setDay] = useState(
    editing?.day ?? new Date().toLocaleDateString("en-CA"),
  );
  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      editing
        ? editing.balances.map((item) => [item.asset_id, asInput(item.amount)])
        : assets
            .filter((asset) => asset.is_active && asset.latest)
            .map((asset) => [asset.id, asInput(asset.latest!.amount)]),
    ),
  );
  const [rates, setRates] = useState<Record<string, string>>({});
  const action = useAction(onSaved);

  const shown = assets
    .filter(
      (asset) =>
        asset.is_active ||
        editing?.balances.some((item) => item.asset_id === asset.id),
    )
    .sort(byKindThenName);
  const filled = shown.filter((asset) => normalize(amounts[asset.id]));
  const currencies = [
    ...new Set(
      filled.map((asset) => asset.currency).filter((code) => code !== "PLN"),
    ),
  ].sort();
  const rateOf = (currency: string) =>
    rates[currency] ??
    asInput(
      (editing ? editing.rates[currency] : latestRate(assets, currency)) ?? "",
    );
  const valid =
    filled.every((asset) => isNumber(amounts[asset.id])) &&
    currencies.every((currency) => isNumber(rateOf(currency)));
  // Each line is rounded to grosze first, as the saved total is.
  const total = filled.reduce(
    (sum, asset) =>
      sum +
      Math.round(
        Number(normalize(amounts[asset.id])) *
          (asset.currency === "PLN"
            ? 1
            : Number(normalize(rateOf(asset.currency)))) *
          100,
      ) /
        100,
    0,
  );
  const replacesDay =
    !editing && snapshots.some((snapshot) => snapshot.day === day);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry = {
      day,
      balances: filled.map((asset) => ({
        asset_id: asset.id,
        amount: normalize(amounts[asset.id]),
      })),
      rates: Object.fromEntries(
        currencies.map((currency) => [currency, normalize(rateOf(currency))]),
      ),
    };
    const ok = await action.run(() =>
      editing
        ? request(`/wealth/snapshots/${editing.id}`, "PUT", entry)
        : request("/wealth/snapshots", "POST", entry),
    );
    if (ok) onClose();
  }

  return (
    <Modal
      title={
        editing ? `Stan na ${dayLabel(editing.day)}` : "Aktualizuj wartości"
      }
      onClose={onClose}
      busy={action.busy}
    >
      <form onSubmit={submit} className={FORM_CLASS}>
        <Notice error={action.error} />
        <p className="text-muted">
          {editing
            ? "Puste pole znaczy, że tego dnia składnik nie miał kwoty. Zero to prawdziwe zero."
            : "Wpisane są ostatnie kwoty — zmień te, które się zmieniły. Puste pole znaczy brak kwoty, zero to prawdziwe zero."}
        </p>
        <label className={ROW_CLASS}>
          <span>
            Stan na dzień
            {replacesDay && (
              <small className="block">
                Ten dzień jest już zapisany — zapis go zastąpi.
              </small>
            )}
          </span>
          <input
            type="date"
            required
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </label>
        <div className="flex flex-col divide-y divide-line/60">
          {shown.map((asset) => (
            <label key={asset.id} className={ROW_CLASS}>
              <span className="min-w-0">
                <span className="block truncate">{asset.name}</span>
                <small>
                  {asset.institution ? `${asset.institution} · ` : ""}
                  {asset.is_active ? "" : "nieaktywny · "}
                  {asset.currency}
                </small>
              </span>
              <input
                inputMode="decimal"
                className={AMOUNT_CLASS}
                aria-label={`Kwota: ${asset.name}`}
                placeholder={
                  asset.latest && !editing
                    ? `było ${money(asset.latest.amount, asset.currency)}`
                    : "brak"
                }
                value={amounts[asset.id] ?? ""}
                onChange={(event) =>
                  setAmounts({ ...amounts, [asset.id]: event.target.value })
                }
              />
            </label>
          ))}
          {currencies.map((currency) => (
            <label key={currency} className={ROW_CLASS}>
              <span>
                Kurs {currency} / PLN
                <small className="block">
                  Z tego dnia, zapisany razem z nim.
                </small>
              </span>
              <input
                inputMode="decimal"
                required
                className={AMOUNT_CLASS}
                value={rateOf(currency)}
                onChange={(event) =>
                  setRates({ ...rates, [currency]: event.target.value })
                }
              />
            </label>
          ))}
        </div>
        {!editing && (
          <button
            type="button"
            className="btn-quiet self-start"
            onClick={onAddAsset}
          >
            <Plus size={16} />
            Dodaj składnik
          </button>
        )}
        <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
          <div>
            <span className="text-sm text-muted">Łącznie w PLN</span>
            <strong className="block text-2xl font-semibold tracking-tight tabular-nums">
              {valid ? money(total, "PLN") : "—"}
            </strong>
            <small className="text-xs text-muted">
              Nie tworzy wydatków ani przychodów.
            </small>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn"
              disabled={action.busy}
              onClick={onClose}
            >
              Anuluj
            </button>
            <button
              className="btn-primary"
              disabled={action.busy || !filled.length || !valid}
            >
              {action.busy ? "Zapisuję…" : "Zapisz"}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
