import assert from "node:assert/strict";
import test from "node:test";
import { displayedBalance, snapshotAmounts, snapshotRate } from "../src/wealthFormState.ts";

const missing = {
  id: 1, name: "Konto", kind: "account", currency: "PLN", institution: null, is_active: true,
  latest: { day: "2026-01-01", amount: "100", pln: "100", rate: null },
};
const zero = {
  ...missing, id: 2,
  latest: { day: "2026-02-01", amount: "0", pln: "0", rate: null },
};
const added = { ...missing, id: 3, latest: null };
const archived = { ...missing, id: 4, is_active: false };
const snapshot = {
  id: 2, day: "2026-02-01", total: "0", change: null, by_kind: {},
  balances: [{ asset_id: 2, amount: "0", pln: "0" }], rates: { EUR: "4.20" },
};

test("new entry preserves missing amounts and zero from the last complete snapshot", () => {
  assert.deepEqual(snapshotAmounts([missing, zero, added, archived], snapshot), { 2: "0" });
  assert.equal(displayedBalance(missing, snapshot.day), null);
  assert.equal(displayedBalance(added, snapshot.day), null);
  assert.equal(displayedBalance(zero, snapshot.day)?.amount, "0");
});

test("editing historical data includes archived assets and their original amounts", () => {
  const historical = { ...snapshot, balances: [{ asset_id: 4, amount: "100", pln: "100" }] };
  assert.deepEqual(snapshotAmounts([archived], historical, true), { 4: "100" });
  assert.deepEqual(snapshotAmounts([archived], historical), {});
  assert.equal(displayedBalance(archived, snapshot.day)?.day, "2026-01-01");
});

test("rates are retained only when editing their original date", () => {
  assert.equal(snapshotRate("2026-02-01", "EUR", snapshot), "4,20");
  assert.equal(snapshotRate("2026-03-01", "EUR", snapshot), "");
  assert.equal(snapshotRate("2025-12-01", "EUR", snapshot), "");
  assert.equal(snapshotRate("2026-02-01", "EUR"), "");
  assert.equal(snapshotRate("2026-02-01", "USD", snapshot), "");
});
