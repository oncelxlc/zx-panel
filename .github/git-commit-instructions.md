# GitHub Copilot Commit Message Instructions

## Project Context

- Full-stack application: **Go** (backend/API) + **Next.js** (frontend/React/App Router or Pages
  Router)
- Use **Conventional Commits** specification with **gitmoji**
- Always write messages in **English**
- Be concise yet descriptive — explain **why** when useful

```git
<type>(<scope>): <short description>
```

## Required Commit Message Format

- First line ≤ **72 characters** (ideal for git log / GitHub UI)
- No period at the end of the subject line
- Use **imperative mood** ("add", "fix", "update" — not "added", "fixed")

## Allowed Types (use lowercase)

- `feat`     – new feature / endpoint / page / functionality
- `fix`      – bug fix / error handling improvement
- `refactor` – code cleanup, rename, restructure (no behavior change)
- `perf`     – performance improvement (speed, memory, query optimization)
- `style`    – formatting, linting, missing semicolons, gofmt, prettier
- `docs`     – documentation, comments, README, API docs, godoc
- `test`     – adding / improving tests (unit, integration, e2e)
- `build`    – build system, dependencies, go.mod, npm packages
- `ci`       – CI/CD (GitHub Actions, Docker, lint workflows)
- `chore`    – miscellaneous (scripts, .gitignore, tooling, no prod code)
- `revert`   – revert previous commit

## Scope Guidelines (use parentheses)

Put the most specific part in scope:

Common scopes for this project:

- `api` / `backend` / `server`       → Go backend changes
- `auth` / `users` / `payments`      → domain/feature modules in Go
- `db` / `postgres` / `migrations`   → database schema / queries
- `frontend` / `ui` / `app`          → Next.js general changes
- `components` / `pages` / `app`     → specific Next.js folders
- `admin` / `dashboard`              → admin panel / protected routes
- `mobile`                           → responsive / PWA changes (if any)
- `shared`                           → shared types / utils / DTOs
- `config` / `env`                   → configuration / environment

Omit scope only for very global changes (rare).