# Project handoff

## Purpose

This is a local-first personal-finance application for importing bank exports, understanding actual personal expenses, and reviewing uncertain cases in a Polish dashboard. The application must retain every imported record locally and keep an audit trail for every derived decision.

The source has Nest Bank and Revolut CSV importers, a normalized transaction model, SQLite database, a Polish Streamlit dashboard (four tabs: Podsumowanie, Historia transakcji, Do klasyfikacji, Reguły sprzedawców; no sidebar), local decisions, merchant rules, approved expense cases, and a live OpenAI Responses API integration for merchant classification and relation detection. `data/` is scanned and imported when the user clicks "🔄 Odśwież dane" next to the title (`ui/app.py`'s `_handle_refresh`, backed by `data_sync.sync_data_directory`) — deliberately not automatic, so the user sees the spinner and an explicit result rather than data silently appearing. A success/info message immediately followed by `st.rerun()` always uses `st.toast()`, never `st.success()`/`st.info()` — the latter get wiped by the rerun before they're visible, which reads as "nothing happened."

## Product principles

- Preserve all original transactions and CSV data locally. Never delete or silently omit a transaction.
- Treat bank movements and personal expenses as different things. A transfer is not automatically an expense or automatically excluded.
- Every automatic and AI-assisted decision must be explainable, reversible, and visible for review.
- Use English for code, table names, symbols, and internal category keys. Use Polish for dashboard labels, help text, and user-facing categories.
- The dashboard always uses `expense-tracker.sqlite3` in the project root (configurable via `DATABASE_PATH` in `.env`, see `config.py`). Do not expose a database-path selector in the UI.
- The dashboard must bind only to `127.0.0.1`.
- The user never sees implementation details (SQLite, CLI command names, raw API payload shapes) in dashboard copy — those belong in this document and the README, not in `st.caption`/`st.info` strings.

## Coding conventions

- Use Python 3.14, `uv`, `pytest`, and Ruff.
- Run `uv run ruff format .`, `uv run ruff check .`, and `uv run pytest -q` before handing work back.
- Ruff configuration lives in `pyproject.toml`: 120-character lines, rules `E`, `F`, `I`, `UP`, `B`, and `SIM`.
- Do not add module-level docstrings. Prefer focused function and type names over comments or docstrings. Add a comment only when a non-obvious decision needs preserving.
- Keep UI code thin. Put persistence, matching, reporting, rules, and LLM preparation in dedicated modules.
- Do not log, print, commit, or expose `OPENAI_API_KEY`. `.env`, CSV files, and SQLite databases are ignored by Git.

## Current project layout

```text
src/expense_tracker/
  cli.py                 CLI commands (inspect, import-nest, import-revolut, sync, transfer-candidates)
  config.py              single Settings source (OpenAI config, database_path, data_dir)
  csv_utils.py           CSV decoding and preamble handling
  importers.py           Nest- and Revolut-specific normalization, detect_format()
  data_sync.py           scans data/, dispatches by detected format, records import_batches
  models.py              normalized transaction dataclasses
  database.py            SQLite schema, PRAGMA user_version migrations, fingerprint(), insert_transaction()
  ledger.py               categories, decisions, rules, cases, manual entry, case dissolve
  ledger_view.py           pure functions shaping the grouped ledger table (no Streamlit/DB import)
  reporting.py            actual expense/balance calculations, category_breakdown()
  matching.py             basic own-transfer candidates (CLI-only, not wired into suggestions)
  dashboard_data.py       snapshot(connection) assembling everything the UI needs
  ui/
    app.py                 Streamlit entry point (st.set_page_config, "Odśwież dane" button, tabs) — no sidebar
    state.py                cached Database connection (st.cache_resource)
    formatting.py            pln(), category_options(), fixed categorical color map + top-N-and-Inne folding
    summary_tab.py            Podsumowanie: pie/bar toggle with click-to-drill-down (Plotly) + a reliable
                               selectbox fallback (click-to-select on a Plotly point could not be verified
                               in a real browser in this environment), 3 levels deep: category -> subcategory
                               -> merchant (grouped by merchant_key())
    ledger_tab.py              Historia transakcji: grouped ledger (case header row highlighted, styled
                               background, members indented below it, user-facing label "Grupa" — internal
                               table/column names stay "cases"/"case_members"), select one row to recategorize
                               it instantly (plain st.selectbox + on_change, no save button — data_editor
                               doesn't support row selection so this couldn't reuse the same widget as the
                               merge flow), select 2+ to merge-into-case, manual entry, cases list
    classification_tab.py       Do klasyfikacji: AI triggers + unified review data_editor (Data/Opis/
                                 Kontrahent/Kwota as separate columns, not one crammed string)
    classified_tab.py            Reguły sprzedawców tab: merchant-rule manager only (edit category —
                                  retroactively fixes transactions that rule itself auto-classified, via
                                  ledger.update_merchant_rule — or delete). The "already-decided transactions,
                                  editable" list that used to live here was removed: it duplicated the same
                                  capability now on every standalone row in Historia transakcji.
  llm/
    contracts.py          strict Pydantic contracts; build_merchant_analysis_model()/build_relation_analysis_model()
                           dynamically constrain category_key to a Literal built from the live category list
    prompts.py             all Polish prompt text and prompt version
    service.py              Responses API workflows; redacts description/counterparty before sending
    redaction.py             PII redaction utility (account numbers, card fragments, phones, emails —
                              does NOT redact personal names, that would need NER and is out of scope)
```

## Implemented domain model

Keep `transactions` immutable after import. Build derived objects around them instead of mutating or removing raw records.

1. `categories` seeds a fixed, hand-maintained list (`database.py`, `CATEGORIES`) with a one-level hierarchy (`parent_key`); labels are Polish. AI may only choose from this list — enforced structurally via a dynamically built `Literal[...]` JSON-schema enum (`llm/contracts.py`), not just checked after the fact.
2. `transaction_decisions.source` records who actually decided: `manual` (typed by the user, including the ledger's single-row quick-recategorize and manual cash entries), `rule` (auto-applied by `apply_rules()`), or `llm` (approved from an AI suggestion, even if the user edited the category before approving — the origin was still an AI suggestion). `save_decision()` takes an explicit `source` parameter (defaults to `"manual"`); `approve_suggestion()`/`approve_merchant_suggestion_with_category()` both pass `source="llm"`. Getting this right matters because `update_merchant_rule()`'s retroactive fix (below) only ever touches `source='rule'` rows.
3. `merchant_rules` stores an active normalized-merchant-to-category mapping (exact match on `merchant_key()`, not fuzzy — see the domain-extraction note below for the one exception). A dashboard approval may immediately save a reusable rule and apply it to unclassified matches — this is the mechanism that avoids re-asking the LLM about a merchant it has already classified once. Rules are editable (`ledger.update_merchant_rule`): changing a rule's category retroactively fixes every transaction that rule itself previously auto-classified (`source='rule'`), but never touches a transaction a human or the AI confirmed explicitly for that merchant — an explicit decision always outranks a blanket rule change.
4. `cases` and `case_members` model approved economic events: own transfers, shared purchases, reimbursements, refunds, and payment disputes. `cases.personal_amount` is the explicit personal cost in the case currency — this is what "merge these transactions into one real cost" means concretely, and it is what `reporting.actuals()` substitutes in place of the raw member transactions. User-facing UI calls this concept "Grupa" (group), not "Sprawa" (case) — the earlier wording read as legalistic/confusing; only the display strings changed, table/column names (`cases`, `case_members`, `case_id`) are untouched.
5. `suggestions` holds both LLM merchant-classification and relation proposals, deduplicated by a fingerprint of `(prompt_version, kind, payload)`.
6. `import_batches` records one row per successfully processed file (name, SHA-256 of its bytes, importer used, row counts) — purely a fast-skip/reporting aid for `sync_data_directory()`, not the source of truth for duplicate transactions (that is still the per-row `transactions.fingerprint`).

The earlier `links` and `classifications` tables from a first prototype are dropped by migration on first open of an old database (both were confirmed empty before removal).

## Duplicate-import handling

Each transaction gets a SHA-256 fingerprint over `account | external_id | booking_date | amount | currency |
description`, stored `UNIQUE`; `INSERT OR IGNORE` silently drops a row whose fingerprint already exists. This
was evaluated for hardening and deliberately left unchanged:

- Adding `balance` to the hash would break Revolut, where the same transaction is exported once as `PENDING`
  (no balance) and later as `COMPLETED` (with balance) — the hash would differ and it would double-import.
- Adding time-of-day would change the fingerprint of all pre-existing Nest rows (date-only), causing a false
  "39 new duplicates" on the next re-import.

**Accepted risk**: two genuinely different transactions on the same account, same day, same amount, and
identical description text will collide and the second is silently dropped. Acceptable at personal scale.

Manual entries (cash, etc.) get a fresh `uuid4` as `external_id` specifically to guarantee they never collide
with each other even when date/amount/description are identical (e.g. two same-price coffees on one day).

## How actual expenses work

The reporting query calculates a personal economic result, not merely a sum of negative bank movements.

| Situation | Bank movement | Personal expense result |
| --- | --- | --- |
| Nest to own Revolut | -500 PLN and +500 PLN | 0 PLN |
| You buy pizza for 3 for 90 PLN; others send you 60 PLN | -90 PLN and +60 PLN | 30 PLN, `Jedzenie` |
| A friend pays for your 150 PLN flight; you transfer them 150 PLN | -150 PLN | 150 PLN, `Podróże → Loty` |
| Merchant refunds a 100 PLN purchase | -100 PLN and +100 PLN | 0 PLN, or reduce the original expense |
| Salary arrives | +5,000 PLN | income, not expense |

The dashboard's Historia transakcji tab shows every raw movement (audit trail, never hidden) with approved-case
members grouped adjacently under a synthetic summary row; only the summary row's real amount feeds category
totals and the Podsumowanie charts (`ledger_view.build_rows()`, `reporting.actuals()`).

## Local-first decision pipeline

1. Import and retain the complete raw export locally (Nest and Revolut CSV; format auto-detected).
2. Normalize description and merchant names locally; redact account numbers, card fragments, phone numbers,
   and emails before any AI-bound payload (`llm/service.py` calls `redact_text()` on `merchant`/`counterparty`/
   `description` fields — this does not cover personal names, which would require NER).
3. Apply approved manual decisions and merchant rules locally (`ledger.apply_rules()`), including right after
   every `sync_data_directory()` import.
4. Deterministic own-transfer matching exists (`matching.py`) but remains CLI-only and unwired into
   suggestions — a known, deliberately deferred gap.
5. Create suggestions only for unresolved transactions or clusters of related transactions, in bounded batches.
6. Deduplicate by normalized merchant key and a request fingerprint. A known merchant is classified by a local
   rule, not by repeated LLM calls. `analyze_merchants()` also excludes transactions already covered by a
   *pending* suggestion (`ledger.pending_merchant_suggestion_transaction_ids`) — without this, clicking
   "Klasyfikuj merchantów przez AI" a second time before reviewing the first batch would re-send the same
   unresolved transactions, and a slightly different LLM answer (different wording/confidence) would pass
   the fingerprint check and appear as a visible duplicate row in the review table. `merchant_key()` prefers
   a domain name (`vivacuba.pl`) over the surrounding text when one is present, since online/BLIK payment
   descriptions are often mostly payment-processor and per-transaction reference noise that would otherwise
   never regroup across repeat visits to the same merchant. It deliberately does *not* attempt fuzzy/prefix
   matching for near-duplicate merchant names from branch-level naming differences (e.g. "Zabka Zb K.
   Warszawa" vs "Zabka Z K. Warszawa") — that risks merging genuinely different merchants (e.g. a payment
   gateway prefix like "PAYU *" shared by many unrelated stores); classify each variant once instead.
7. Display a Polish review queue (Do klasyfikacji tab: one `st.data_editor` with a category dropdown per row).
   The user can approve with an edited category, reject, or turn an approved classification into a reusable
   merchant rule, all before anything is written.
8. Reports use approved decisions and cases by default. Suggestions remain visible but do not change totals
   until approved.

## LLM policy and implemented workflow

- The user has explicitly authorized bounded transaction context for OpenAI analysis, after local redaction.
- **Exactly what leaves the machine, per call** (see `llm/service.py` for the literal field lists):
  - Merchant classification (`analyze_merchants`, `MerchantInput`): per unresolved merchant group (max 20
    groups per click, grouped by normalized description+currency) — the redacted description, redacted
    counterparty (or null), the set of operation types seen, up to 5 signed sample amounts, currency, and
    the transaction ids (used only to write the decision back locally, never meaningful to OpenAI). Plus the
    full category catalog (key/label/parent_key/kind) so the model can only choose from it.
  - Relation analysis (`analyze_relations`): up to 100 transactions not yet in a case (regardless of whether
    they already have a category) — for each: booking date, **signed exact amount**, currency, the internal
    account label ("nest"/"revolut", not an account number), operation type, redacted description, redacted
    counterparty, and current category/decision status. Plus the same category catalog.
  - `redact_text()` strips account numbers, card fragments, phone numbers, and emails from description/
    counterparty before either call — it does **not** strip personal names (that needs NER, out of scope),
    so a counterparty like "Magda Laskowska" or an employer's registered name reaches OpenAI as-is. This is
    a known, accepted limitation, not an oversight — surfaced explicitly here and to the user on request.
  - Nothing else leaves the machine: no raw CSV file, no bank account numbers/IBANs, no balances.
- Merchant classification sends at most 20 unique unresolved merchant groups per button click, with the
  redacted description/counterparty, operation type, currency, and up to five sample amounts. The model may
  use at most four web searches, only where needed to identify a merchant.
- Relation analysis is a separate, no-web, single request over up to 100 local, redacted transaction rows —
  it considers any transaction not yet grouped into a case, whether or not it already has a category, so it
  is not limited to "before you've classified anything."
- The LLM returns strict structured data; `category_key` is constrained to the live category list at the JSON
  Schema level (`Literal[...]` built per request from `categories(connection)`), not just checked afterward.
- `store=False` is set explicitly (the Responses API defaults to storing otherwise).
- Web search is enabled by default for merchant classification (`OPENAI_WEB_SEARCH=false` to disable). Not
  used in relation analysis.
- `MERCHANT_INSTRUCTIONS` (prompt v3) is structured as numbered hard rules plus worked examples: it tells
  the model sample amounts are signed (positive = income, negative = expense) and to pick an income-kind
  category for positive amounts instead of skipping them; it explicitly asks the model to recognize transfers
  to the account owner's own other accounts (counterparty name matching the owner, or wording like
  "wypłata"/"oszczędności"/"lokata"/"IKE"/"IKZE") and classify those as `transfer_own`. This is inherently a
  one-sided judgment call —
  a transfer to an account that isn't itself imported into this app has no matching opposite-signed leg for
  `matching.py`'s deterministic pairing to find — so it can miss cases the prompt wording doesn't anticipate.
  The `merchant_rules` cache (see above) is the fallback: one manual correction with "zapamiętaj regułę"
  fixes it permanently for that description.

## Implementation order (original roadmap, mostly complete)

1. ~~Improve suggestion review: Polish presentation, edit-before-approve, confidence display.~~ Done via the
   Do klasyfikacji tab's unified data editor.
2. ~~Add category_key enum hardening and PII redaction wiring.~~ Done.
3. Add deterministic own-transfer/refund/reimbursement candidates as an additional local suggestion source
   (currently `matching.py` exists but is unwired) — still pending.
4. ~~Add the Revolut importer.~~ Done. Account ownership configuration beyond `--account` labels is still
   manual/CLI-only.
5. Improve LLM prompts and schemas against accepted/rejected local examples over time — ongoing.

## Verified state

- `uv run ruff format .` / `uv run ruff check .` — clean.
- `uv run pytest -q` — passing (39 tests: CSV import for both banks, redaction incl. an LLM-payload
  integration check, reporting/case math incl. the 3-level category/subcategory/merchant breakdown,
  ledger_view grouping and counterparty visibility rules, manual entry, data_sync, database migrations,
  dynamic category-enum schema validation, merchant-rule listing/deletion/retroactive-update,
  edit-before-approve on a suggestion with correct `source='llm'`, description cleaning, income
  transactions reaching `analyze_merchants`, no duplicate suggestion on a repeat classify click,
  `merchant_key()` domain-extraction).
- Single-row quick recategorize (Historia transakcji, `st.selectbox(..., on_change=...)`, no save button)
  verified via `streamlit.testing.v1.AppTest` with a programmatic dataframe-selection state assignment
  (`at.session_state["ledger_table"] = {"selection": {"rows": [...]}}`) followed by `.select(...).run()` on
  the resulting selectbox — confirmed it writes to `transaction_decisions` immediately, no exception.
- Migration verified against a copy of the pre-existing production database: 39 transactions, 1 case, 40
  suggestions all preserved; `links`/`classifications` dropped; idempotent on repeated opens.
- End-to-end refresh flow verified via `streamlit.testing.v1.AppTest` against a fresh database pointed at
  both sample files in `data/`: clicking "🔄 Odśwież dane" imports both Nest (39 rows) and Revolut (4 rows,
  including a `PENDING` one), across all four tabs, with no exceptions; a fresh app load with no click yet
  correctly shows the empty-state prompt instead of silently importing anything.
- The production `expense-tracker.sqlite3` was deliberately deleted once (2026-09-10) at the user's request,
  since it only ever held data reconstructible from the two files in `data/` — clicking "Odśwież dane"
  recreates it and re-imports both files.
