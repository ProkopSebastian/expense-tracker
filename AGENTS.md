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

## Verification

- Run checks appropriate to the changed area before committing.
- Use `uv run pytest` for backend tests.
- Use `pnpm --dir frontend run build` for frontend type checking and production builds.
