# Working with this repo

Solo project, user speaks Polish, work happens directly on `main` (no PR
workflow). Keep responses in Polish, concise, no unnecessary headers for
simple answers.

## The two "memory" files (both gitignored — check `.gitignore`)

- **`HANDOFF.md`** — continuity notes for the *next AI session/agent*
  (this one or Codex). Update it at the natural end of a substantial batch
  of work, not after every tiny edit. Structure: what's true now, what
  changed and why, what's explicitly *not* verified (e.g. "no Node in this
  sandbox, frontend build unverified" — say that plainly, don't imply it
  was tested). Rewrite stale sections rather than appending forever —
  dates/branch names/"not yet built" claims rot fast; read the whole file
  before rewriting and cut what's no longer true instead of leaving it to
  contradict the new text.
- **`przewodnik-narzedzia.md`** — a from-scratch explainer of every tool/
  framework in this repo, written for the user to actually learn from,
  not a Q&A log. When you explain a new tool, a GitHub Actions concept, a
  build warning, a CI mechanism, etc. **and the user asks you to write it
  down** (they'll say things like "dopisz do przewodnika" or "czy to jest
  opisane"), add a new dated subsection in the relevant part of the file
  (`### 13c. ... (dopisane YYYY-MM-DD)`) rather than editing the answer
  into chat only. Keep the same register as the rest of the file: explain
  *what* + *why*, include runnable commands, correct any now-stale
  references you notice nearby while you're in there (e.g. a removed
  module still mentioned in the repo map). Don't invent new sections
  unprompted — this file is opt-in, the user reads it end to end.

## Git discipline

- Never push without the user explicitly asking for that push, even after
  committing freely. Commits are cheap/local; push is a separate decision.
- Split unrelated changes into separate, focused commits (one concern per
  commit — e.g. "split CI" and "remove CLI" and "add launcher icon" as
  three commits, not one). Write the *why* in the body, not just the what.
- When removing something described as dead/legacy, actually grep for
  real references (watch for substring false-positives, e.g. `cli` also
  matching `client`) before deleting, and re-run tests/lint after.
- Tags are for Windows releases (`windows.yml` triggers only on `v*` tags
  or manual `workflow_dispatch`, not on every push — see przewodnik
  section 13b for the reasoning). Don't reuse/force-move a tag after a
  failed release build; bump the patch number instead.

## Verifying claims instead of asserting them

- This sandbox has **no Node/npm/pnpm on PATH** as of 2026-09 (confirmed
  by checking, not assumed) — frontend TypeScript/build changes can only
  be reviewed by hand here, not compiled or built. Say so explicitly when
  reporting on frontend changes; don't imply `pnpm build` was run if it
  wasn't.
- For anything with an external version/state that drifts over time
  (GitHub Action major versions, library APIs, deprecation timelines),
  check the current source (GitHub API/raw `action.yml`, web search) —
  don't answer from training-data memory. This bit the Node 20→24 Actions
  deprecation question; the fix was verifying `runs.using` in each
  action's actual `action.yml` at its latest tag, not guessing version
  numbers.

## Project shape, briefly

React + TypeScript (Vite) frontend, FastAPI + SQLite backend, packaged
for Windows via PyInstaller (`scripts/build_windows.ps1` +
`desktop_launcher.py`, a small Tk launcher window). No CLI, no Streamlit —
both were removed as legacy/redundant; don't reintroduce either without a
concrete new reason. `uv` for Python, `pnpm` for JS.
