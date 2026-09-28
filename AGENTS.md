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
  - `src/main.tsx` mounts React and the shared `TooltipProvider`.
  - `src/routes/router.tsx` is the active React Router configuration and wraps routes with `ThemeProvider` so theme policy follows navigation.
  - Existing UI paths are public `/login` and authenticated `/`.
  - `src/auth/*` contains the API client, session storage, and global authentication guard.
  - `src/theme/*` contains theme preference, system-theme listeners, and the shared theme toggle.
  - `src/components/ui/*` contains official shadcn/ui source components (Base UI + Nova, neutral colors, Lucide icons).
  - `src/styles/theme.css` is the Tailwind v4 entry and the source of truth for semantic light/dark CSS tokens.
  - `src/styles.scss` and page SCSS files contain layout styles; do not process Tailwind through Sass.
- Frontend tooling:
  - `vite.config.ts` configures React, `@/* -> src/*`, and dev server port `7200` with `strictPort: true`.
  - `tsconfig.json` enables strict TypeScript and includes `src` plus `vite.config.ts`.
  - `eslint.config.mjs` uses flat ESLint config with TypeScript, React Hooks, and React Refresh rules.
- Backend:
  - `cmd/server/main.go` is the main server entrypoint.
  - Root `main.go` currently starts the same server stack.
  - `internal/config/server.go` loads optional root `.env` plus process environment; process environment wins, and `PORT` overrides the default `25000`.
  - `internal/server/run.go` creates the HTTP server.
  - `internal/api/router.go` creates the Gin router with health, ping, login, current-user, and logout endpoints.
  - `internal/auth/*` contains authentication service and middleware logic.
  - `internal/storage/postgres.go` owns PostgreSQL connectivity, schema migration, and user/session persistence.
- Domain packages are expected to live under `internal/*`. Add new backend code there rather than coupling it to frontend files.

## Developer Workflows
- Frontend runtime target is modern Node (`package.json` engines: Node `^22.22.0 || >=24.0.0`).
- Use pnpm for frontend package scripts:
  - `pnpm dev` starts Vite on `http://localhost:7200`.
  - `pnpm build` builds production assets into `dist/`.
  - `pnpm start` or `pnpm preview` previews the built frontend.
  - `pnpm lint` runs ESLint.
  - `pnpm exec tsc --noEmit` checks frontend types.
  - `pnpm test:login` runs Node built-in tests for login validation and safe return paths.
  - `pnpm test:theme` checks login theme policy, dark fallback, and theme transition cleanup.
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
- Place every project-defined frontend `type` and `interface` under `src/types`; ambient declarations such as `src/vite-env.d.ts` are exempt.
- Add Chinese JSDoc block comments (`/** ... */`) to frontend components, hooks, functions, classes, custom types/interfaces, and module-level constants. Comments must explain responsibility, boundaries, or usage instead of restating the identifier.
- Inside frontend functions and methods, use single-line `//` comments only for important state transitions, security checks, error handling, resource cleanup, or other non-obvious logic; avoid line-by-line narration.
- Prefer existing React hooks and local context patterns over adding global state libraries.
- Use the configured alias `@/* -> src/*` when it improves clarity.
- Keep styling aligned with the current SCSS/global class pattern in `src/styles.scss`.
- Use existing shadcn/ui controls before adding new UI dependencies. Add official components with `pnpm exec shadcn add @shadcn/<component>` and review generated files for type/comment conventions.
- Keep theme colors in `src/styles/theme.css` and the initial theme script in `index.html` aligned with runtime theme policy. Login always follows the system with dark fallback and no toggle; preserve `zx-panel-theme` preferences for authenticated pages. Theme transitions respect reduced motion.
- Build visual and interactive UI from shadcn components, including login branding, cards, feedback, navigation, and tooltips. Keep native elements for semantic structure and layout only; page SCSS must not override component colors, typography, or shadows.
- Use the official Sidebar composition for the main navigation, with `SidebarMenuButton render={<NavLink ... />}`. Use `Item render={<a ... />}` for other structured links so native link semantics remain intact.
- Keep the sidebar context and hook in `src/hooks/use-sidebar.ts`; TooltipProvider is mounted at the app entry.
- Extend the existing React Router configuration rather than adding another routing layer.
- For backend code, use idiomatic Go, explicit error handling, and the existing Gin response shape:
  - `success`
  - `data`
  - `error`
- Add or maintain Chinese Go doc comments for package-level types, interfaces, constants, variables, functions, and methods in product code and tests. Each definition comment must use at least two consecutive `//` lines, start with the symbol name when Go conventions require it, and explain responsibility or boundaries rather than merely restating the name.
- Inside Go functions and methods, use single-line `//` comments for important branches, security boundaries, state transitions, and resource lifecycle operations; avoid comments on obvious assignments or returns.
- Apply these comment rules to root `main.go`, `cmd/**`, `internal/**`, tests, and all frontend files under `src/**`; `learn/**` remains excluded unless a task explicitly targets it.
- Keep runnable backend startup logic under `cmd/server` and reusable service/domain logic under `internal/*`.
- Do not add new dependencies unless there is a clear need; explain the reason, alternatives, and impact if you do.

## Integration and Boundaries
- Authentication is integrated through `/api/v1/auth/*`; keep new API responses aligned with the existing response shape.
- Avoid hardcoded environment-specific URLs; use configuration or environment variables.
- Keep frontend route/UI concerns in `src/**`.
- Keep backend API, configuration, server, storage, and domain concerns in Go packages under `internal/**`.
- Do not import or depend on backend internals directly from frontend code.
- For static deployment of the Vite SPA, configure the host to fall back unknown UI paths to `index.html` so `/nginx` and `/nginx/index` can load directly.

## Practical Examples for Agents
- New UI view in the current scaffold: add a route entry under `src/routes/router.tsx`; place authenticated pages under `AuthGuard`.
- New frontend helper: place it under an appropriate `src/<domain-or-purpose>/` directory and import via relative paths or `@/`.
- New backend endpoint: add route wiring in `internal/api/router.go`; move handlers/services into focused `internal/<domain>/` packages as complexity grows.
- New backend config: extend `internal/config/server.go` and document the environment variable in `README.md`.
- Docs-only change: update `README.md` and keep `AGENTS.md` accurate for future agents when architectural facts change.
