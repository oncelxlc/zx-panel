# AGENTS.md

## Scope and Current State
- This repo implements a single-server Linux panel with a Vite + React + TypeScript frontend, Go/Gin API, PostgreSQL persistence, and a separate Unix Socket helper.
- The six authenticated pages live under `src/pages/`; deterministic MSW data is restricted to explicit Mock mode.
- Ubuntu 24.04 WSL2 x86_64 and a dedicated QEMU ARM64 guest have exercised official installations, systemd apps, helper peer checks and SSE recovery. Linux race, PostgreSQL restore, 30-minute browser load and real export-size limits ran on x86_64. User-authorized temporary CAP_SYS_PTRACE enabled successful reference/uninstall checks on both architectures and was revoked. The user subsequently approved the production helper template with CAP_SYS_PTRACE and syscall filtering; both architectures passed deployment-template acceptance and the lab units were restored. M0–M5 are complete within the documented local/WSL/QEMU scope. Emulation does not establish native ARM performance. Consult `docs/verification.md` before making release claims.
- `learn/` contains learning/demo Go code and should not be treated as product runtime code unless a task explicitly targets it.
- Keep documentation and implementation aligned with the current Vite setup; do not reintroduce Next.js assumptions.

## Architecture Map
- Frontend:
  - `index.html` is the Vite HTML entry.
  - `src/main.tsx` mounts React, TanStack Query, TooltipProvider and Toaster; `src/features/panel` owns shared SSE, tasks, plans and bounded logs.
  - `src/routes/router.tsx` is the active React Router configuration and wraps routes with `ThemeProvider` so theme policy follows navigation.
  - Public `/login` and `/setup`; `/` redirects to `/overview`, with `/runtimes`, `/apps`, `/monitoring`, `/logs`, `/settings` and details.
  - `src/auth/*` contains HttpOnly Cookie session handling, memory-only CSRF state, and the authentication guard; no Bearer/sessionStorage auth.
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
  - Development configuration retains optional cwd `.env` plus process environment; process environment wins, and `PORT` overrides `25000`. Production `LoadFile` reads only the explicit configuration and process environment, without probing cwd `.env`; helper also skips dotenv/database loading.
  - `internal/server/run.go` creates the HTTP server.
  - `internal/api/panel.go` and `resources.go` are the active Cookie API. `router.go` is the retained legacy scaffold used by existing regression tests.
  - `internal/auth/*` retains credential types and the legacy service. `internal/control/*` implements collection, SSE, plans, durable tasks, runtime adapters, apps and encrypted logs. `internal/host/*` implements the restricted helper; `cmd/helper` is its executable.
  - Runtime discovery reads the Linux service PATH, common system locations and accessible current-account toolchain directories at startup and every minute. Node.js/Go retain panel management; Rust, Python, Java, PHP, Ruby, .NET, Bun and Deno are external read-only installations. Migration 003 extends installation kinds without widening helper/default capabilities.
  - `internal/storage` owns PostgreSQL, versioned migrations, Cookie sessions and password changes. Production startup checks schema only.
- Domain packages are expected to live under `internal/*`. Add new backend code there rather than coupling it to frontend files.

## Developer Workflows
- Frontend runtime target is modern Node (`package.json` engines: Node `^22.22.0 || >=24.0.0`).
- Use pnpm for frontend package scripts:
  - `pnpm dev` starts Vite on `http://localhost:7200`.
  - `pnpm dev:all` runs Windows Vite and the Go API in the default WSL distribution/user. It uses interactive login Bash to load tool PATH (including Homebrew in `.bashrc`) and checks WSL, Go/setsid, a non-root user and the shared repository before starting either service. When present, ignored `configs/dev.json` is passed to the Go API; use the same explicit `--config` for CLI preparation, and keep Linux keys/data in the WSL filesystem. PostgreSQL preparation and explicit migration remain manual. Ctrl+C or either service exiting stops both.
  - `pnpm dev:frontend:wsl` and `pnpm dev:backend:wsl` independently run the selected service in WSL, from Windows or directly inside WSL. Checks reject other platforms, root, missing tools, outdated Node/Go, non-Linux toolchains and incompatible frontend native dependencies. Use Linux pnpm to install separate WSL `node_modules`; no automatic installation or database preparation. Arguments are passed verbatim and Ctrl+C cleans only the selected service's process group.
  - `pnpm build` builds production assets into `dist/`.
  - `pnpm start` or `pnpm preview` previews the built frontend.
  - `pnpm lint` runs ESLint.
  - `pnpm exec tsc --noEmit` checks frontend types.
  - `pnpm test:login` runs Node built-in tests for login validation and safe return paths.
  - `pnpm test:theme` checks login theme policy, dark fallback, and theme transition cleanup.
  - `pnpm test:dev` checks combined and independent WSL startup guards, argument forwarding and process cleanup.
  - `pnpm lint:fix` applies fixable ESLint changes.
- Backend commands:
  - `go run -tags devassets ./cmd/server` starts the development API on loopback `PORT` or `25000` after explicit migration.
  - `go test -tags devassets ./...` and `go vet -tags devassets ./...` validate Go. `ZX_PANEL_INTEGRATION=1` creates random isolated test databases; it must verify current_database() before any test writes.
  - `scripts/acceptance/wsl-lab.sh` and `scripts/acceptance/wsl-lab.py` reproduce the explicitly authorized isolated WSL experiment; they use dedicated paths, users, service units and PostgreSQL on 25433. Never repoint these tests at the existing development database.
  - `scripts/acceptance/wsl-release-checks.py export` tests actual 50 MiB export limits; its `uninstall` mode requires explicit authorization for temporary process-inspection capability and experimental runtime removal. Its `deployment` mode exercises the explicitly approved production template, binds template/binary SHA256 values to the report, then restores the original lab units. All modes wait for executable/capability/seccomp/socket readiness, restore capabilities and stop dedicated services. `uninstall --resume-installation` only reuses the installation recorded by its own failed check. `scripts/acceptance/wsl-resource-budget.mjs` measures cold browser transfers with JS/CSS compression and confirms API/SSE remain uncompressed.
- Scripts are grouped by purpose: `scripts/dev`, `build`, `contract`, `test`, `security`, and `acceptance`. Update package scripts, CI, documentation and lab/guest copy paths together when relocating them.
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
- Keep theme colors in `src/styles/theme.css` and the external CSP-compatible `public/theme-init.js` referenced by `index.html` aligned with runtime theme policy. Login always follows the system with dark fallback and no toggle; preserve `zx-panel-theme` preferences for authenticated pages. Theme transitions respect reduced motion.
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
- For static deployment of the Vite SPA, configure the host to fall back unknown UI paths to `index.html` so page and detail routes load directly; never fall back `/api/*`, SSE or downloads to HTML.

## Practical Examples for Agents
- New UI view in the current scaffold: add a route entry under `src/routes/router.tsx`; place authenticated pages under `AuthGuard`.
- New frontend helper: place it under an appropriate `src/<domain-or-purpose>/` directory and import via relative paths or `@/`.
- New backend endpoint: add route wiring in `internal/api/resources.go`; move handlers/services into focused `internal/<domain>/` packages as complexity grows.
- New backend config: extend `internal/config/panel.go` and document the environment variable in `README.md`.
- Docs-only change: update `README.md` and keep `AGENTS.md` accurate for future agents when architectural facts change.

## v1.1 Delivery and Safety
- `pnpm dev:mock` uses fixed MSW data; `pnpm dev` uses the real same-origin API. Do not silently fall back between modes.
- `pnpm test`, `pnpm test:e2e`, `pnpm test:api`, `pnpm contract --check-go`, and `pnpm scan:secrets` cover added validation. The API browser fixture uses an isolated database and embedded production assets. Preserve the original Node login/theme tests.
- Generate API fixtures with `ZX_PANEL_CONTRACT_FIXTURES=1` during the isolated integration test. They contain public responses only.
- `pnpm build:release` validates API-only assets into `internal/web/ui/dist`; `pnpm release` builds Linux amd64/arm64 binaries. Formal Go builds require these ignored generated assets; `devassets` is explicitly development only. Rebuilding resets build-time acceptance to pending; completed acceptance applies only to the artifact hashes in `docs/acceptance-deployment.json`.
- Responses retain `success/data/error` and add `meta.requestId/serverTime`; synchronize OpenAPI via `pnpm contract`.
- Never edit an applied SQL migration. Append a new version and preserve LF bytes for stable checksums.
- Web runs non-root. The root helper never reads database credentials and never listens on TCP. Only configured peer UID, owned units and controlled directories are allowed.
- Existing users require a new pg_dump backup before CLI migration. Initialization requires a local one-time token; no automatic default admin.
- Keep actual Linux/systemd tests, backup restoration and prolonged resource measurement explicitly pending until observed; cross-compilation is not runtime acceptance.
