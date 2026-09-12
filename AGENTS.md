# Project instructions

## Code and product language

- Write code, identifiers, commit messages, and technical documentation in English.
- Write all user-facing application text in Polish.
- Do not add module, class, or function docstrings. Use clear names that make the code self-explanatory.
- Add comments only when they explain a non-obvious reason or constraint, not what the code already says.

## Git workflow

- Work directly on `main` unless the user requests another branch.
- Use Conventional Commits with a short English subject, for example `feat: add data reset`, `fix: guard reset path`, or `docs: update setup guide`.
- Prefer a single-line commit message. If more context is essential, add a short bullet list in the commit body.
- Never add `Co-authored-by` trailers or any other attribution to an AI, assistant, model, or tool.
- Do not push commits unless the user explicitly requests it.
- Preserve unrelated and user-authored working-tree changes.

## Testing policy

- Do not add tests merely to increase coverage or repeat the implementation.
- Add a test only when it protects meaningful behavior, a realistic regression, or a risky edge case.

## Session handoff

- If `HANDOFF.md` exists, read it as temporary context for unfinished work.
- Treat `AGENTS.md` as the source of durable rules. Treat `HANDOFF.md` only as a snapshot that may be stale, and verify it against the current Git state.
- Keep `HANDOFF.md` local and never commit it.
- Remove or replace stale handoff notes instead of accumulating project history in them.
