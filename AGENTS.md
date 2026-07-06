# AGENTS.md

## Scope and Current State
- This repo is a **hybrid scaffold**: active Vite + React + TypeScript frontend, plus a small Go/Gin backend skeleton.
- Treat the frontend under `src/` as the current production-facing UI scaffold.
- Treat the Go backend under `cmd/server` and `internal/` as an active but minimal API server scaffold.
- `learn/` contains learning/demo Go code and should not be treated as product runtime code unless a task explicitly targets it.
- Keep documentation and implementation aligned with the current Vite setup; do not reintroduce Next.js assumptions.

## Architecture Map
- Frontend:
  - `index.html` is the Vite HTML entry.
  - `src/main.tsx` mounts React and wraps the app with `ThemeProvider`.
  - `src/App.tsx` is the current SPA shell and manual pathname-based route dispatcher.
  - Existing UI paths are `/`, `/nginx`, and `/nginx/index`.
  - `src/theme/*` contains theme context and Ant Design theme integration.
  - `src/styles.scss` contains global SCSS styles.
- Frontend tooling:
  - `vite.config.ts` configures React, `@/* -> src/*`, and dev server port `6500` with `strictPort: true`.
  - `tsconfig.json` enables strict TypeScript and includes `src` plus `vite.config.ts`.
  - `eslint.config.mjs` uses flat ESLint config with TypeScript, React Hooks, and React Refresh rules.
- Backend:
  - `cmd/server/main.go` is the main server entrypoint.
  - Root `main.go` currently starts the same server stack.
  - `internal/config/server.go` loads server config; `PORT` overrides the default `25000`.
  - `internal/server/run.go` creates the HTTP server.
  - `internal/api/router.go` creates the Gin router with `GET /healthz` and `GET /api/v1/ping`.
- Domain packages are expected to live under `internal/*`. Add new backend code there rather than coupling it to frontend files.

## Developer Workflows
- Frontend runtime target is modern Node (`package.json` engines: Node `^22.22.0 || >=24.0.0`).
- Use pnpm for frontend package scripts:
  - `pnpm dev` starts Vite on `http://localhost:6500`.
  - `pnpm build` builds production assets into `dist/`.
  - `pnpm start` or `pnpm preview` previews the built frontend.
  - `pnpm lint` runs ESLint.
  - `pnpm lint:fix` applies fixable ESLint changes.
- Backend commands:
  - `go run ./cmd/server` starts the Gin server on `PORT` or `25000`.
  - `go test ./...` runs Go tests when tests exist.
- Commit messages are enforced by Husky + Commitlint:
  - Hook: `.husky/commit-msg`
  - Ruleset: `commitlint.config.js` with `@commitlint/config-conventional`
  - Use conventional commit prefixes such as `feat:`, `fix:`, `docs:`, and `chore:`.

## Conventions to Follow
- Use TypeScript and functional React components for frontend work.
- Prefer existing React hooks and local context patterns over adding global state libraries.
- Use the configured alias `@/* -> src/*` when it improves clarity.
- Keep styling aligned with the current SCSS/global class pattern in `src/styles.scss`.
- Ant Design is already installed; prefer it for standard UI controls before adding new UI dependencies.
- Do not introduce a formal router unless the task needs more than the current small pathname dispatcher can reasonably support.
- For backend code, use idiomatic Go, explicit error handling, and the existing Gin response shape:
  - `success`
  - `data`
  - `error`
- Keep runnable backend startup logic under `cmd/server` and reusable service/domain logic under `internal/*`.
- Do not add new dependencies unless there is a clear need; explain the reason, alternatives, and impact if you do.

## Integration and Boundaries
- No full frontend-backend integration contract is established yet.
- When adding integration, avoid hardcoded environment-specific URLs; use configuration or environment variables.
- Keep frontend route/UI concerns in `src/**`.
- Keep backend API, configuration, server, storage, and domain concerns in Go packages under `internal/**`.
- Do not import or depend on backend internals directly from frontend code.
- For static deployment of the Vite SPA, configure the host to fall back unknown UI paths to `index.html` so `/nginx` and `/nginx/index` can load directly.

## Practical Examples for Agents
- New UI view in the current scaffold: add a route entry and render branch in `src/App.tsx`; consider extracting components only when the file becomes hard to maintain.
- New frontend helper: place it under an appropriate `src/<domain-or-purpose>/` directory and import via relative paths or `@/`.
- New backend endpoint: add route wiring in `internal/api/router.go`; move handlers/services into focused `internal/<domain>/` packages as complexity grows.
- New backend config: extend `internal/config/server.go` and document the environment variable in `README.md`.
- Docs-only change: update `README.md` and keep `AGENTS.md` accurate for future agents when architectural facts change.
