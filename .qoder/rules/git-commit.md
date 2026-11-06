# Git Commit Message Rules

## Format

All commit messages MUST be a **single line** with no body or footer.

```
<type>(<scope>): <short description>
```

## Constraints

- Single line only — no blank lines, no body, no footer.
- Maximum **72 characters** total.
- No period at the end.
- Use **imperative mood**: "add", "fix", "update" (not "added", "fixed", "updated").
- Always write in **English**.

## Allowed Types (lowercase)

| Type | Usage |
|------|-------|
| `feat` | New feature / endpoint / page |
| `fix` | Bug fix / error handling |
| `refactor` | Restructure without behavior change |
| `perf` | Performance improvement |
| `style` | Formatting / linting / gofmt / prettier |
| `docs` | Documentation / comments / README |
| `test` | Add or improve tests |
| `build` | Build system / dependencies / go.mod / pnpm |
| `ci` | CI/CD workflow changes |
| `chore` | Miscellaneous (scripts, .gitignore, tooling) |
| `revert` | Revert a previous commit |

## Scope Guidelines

Use parentheses for the most specific module affected:

- `api` / `server` / `backend` — Go backend
- `auth` / `control` / `storage` — Go domain packages
- `frontend` / `ui` / `routes` — React/Vite changes
- `config` / `env` — Configuration
- `db` / `migration` — Database schema
- `dev` / `build` / `ci` — Tooling & scripts
- `docs` — Documentation files

Omit scope for very global or cross-cutting changes.

## Examples

```
feat(auth): add CSRF token rotation on session refresh
fix(storage): handle nil connection pool on migration retry
chore(ci): pin pnpm version to 10 in setup-node action
refactor(control): extract SSE reconnect logic into helper
docs: update AGENTS.md with helper peer-check details
```

## Anti-Patterns (DO NOT use)

```
feat(api): add endpoint
```

Multi-line bodies, bullet lists, and "Closes/Refs" footers are **not allowed**.
