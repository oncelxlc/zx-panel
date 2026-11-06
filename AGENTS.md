# AGENTS.md

## Agent Workflow
- Communicate in Chinese by default; keep code, identifiers and documentation consistent with the repository's existing language and comment rules.
- Before editing, inspect the related implementation, callers, tests, configuration and relevant README/docs. Use current source and package scripts to verify project facts.
- Make the smallest complete change, reuse existing components and dependencies, and preserve unrelated uncommitted changes. Do not create/switch branches, commit, push, rebase, reset or rewrite Git history unless explicitly requested.
- Resolve minor ambiguity from existing conventions and state important assumptions in the result. Ask when ambiguity would materially change architecture, public APIs, data structures or irreversible operations.
- Run the smallest relevant validation set without weakening checks. Report changed files, key decisions, validation results and anything not verified; documentation-only updates normally need reference checks and `git diff --check`, not a full runtime rebuild.

## Scope and Current State
- External-runtime management and revised service templates added after the earlier M0–M5 reports require new runtime acceptance. Source/unit tests and harmless transient identity jobs are not package-uninstall acceptance; historical hashes remain the boundary for release claims.
- This repo implements a single-server Linux panel with a Vite + React + TypeScript frontend, Go/Gin API, PostgreSQL persistence, and a separate Unix Socket helper.
- The six authenticated pages live under `frontend/src/pages/`; deterministic MSW data is restricted to explicit Mock mode.
- Ubuntu 24.04 WSL2 x86_64 and a dedicated QEMU ARM64 guest have exercised official installations, systemd apps, helper peer checks and SSE recovery. Linux race, PostgreSQL restore, 30-minute browser load and real export-size limits ran on x86_64. User-authorized temporary CAP_SYS_PTRACE enabled successful reference/uninstall checks on both architectures and was revoked. The user subsequently approved the production helper template with CAP_SYS_PTRACE and syscall filtering; both architectures passed deployment-template acceptance and the lab units were restored. M0–M5 are complete within the documented local/WSL/QEMU scope. Emulation does not establish native ARM performance. Consult `docs/verification.md` before making release claims.
- `learn/` contains learning/demo Go code and should not be treated as product runtime code unless a task explicitly targets it.
- Keep documentation and implementation aligned with the current Vite setup; do not reintroduce Next.js assumptions.

## Architecture Map
- Frontend:
  - `frontend/index.html` is the Vite HTML entry.
  - `frontend/src/main.tsx` mounts React, TanStack Query, TooltipProvider and Toaster; `frontend/src/features/panel` owns shared SSE, tasks, plans and bounded logs.
  - `frontend/src/routes/router.tsx` lazy-loads the authentication guard, main layout and pages so public routes do not load the authenticated shell. It wraps routes with `ThemeProvider` so theme policy follows navigation. `main.tsx` mounts this router directly; the former `App.tsx` demo and `pages/index/` page have been removed.
  - Public `/login` and `/setup`; `/` redirects to `/overview`, with `/runtimes`, `/apps`, `/monitoring`, `/logs`, `/settings` and details.
  - `frontend/src/layouts/main/MainLayout.tsx` owns the authenticated shell, sidebar state, shared realtime stream and task sheet. `MainSider.tsx` and `MainHeader.tsx` share navigation from `frontend/src/features/panel/navigation.ts`; its types live in `frontend/src/types/panel-ui.type.ts`.
  - `frontend/src/auth/*` contains HttpOnly Cookie session handling, memory-only CSRF state, and the authentication guard; no Bearer/sessionStorage auth.
  - `frontend/src/theme/*` contains theme preference, system-theme listeners, and the shared appearance popover in the sidebar footer. Color mode (`zx-panel-theme`) and shell style (`zx-panel-theme-style`, default or Islands) persist independently and sync across tabs. Both styles share identical layout geometry; Islands uses non-layout decorative surfaces. Collapsed desktop footer popovers open to the right with bottom alignment, clear of the sidebar.
  - `frontend/src/components/ui/*` contains official shadcn/ui source components (Base UI + Nova, neutral colors, Lucide icons).
  - `frontend/src/styles/theme.styles.ts` is the source of truth for semantic light/dark tokens and motion timing; `main.tsx` applies its compiled classes before asynchronous startup.
  - Component and page styles live in adjacent `*.styles.ts` files, compiled by the official StyleX Vite plugin. `styles/reset.css` only normalizes browser defaults and reduced-motion behavior; there are no Tailwind or Sass dependencies.
- Frontend tooling:
  - Root `package.json` and `pnpm-workspace.yaml` keep shared scripts/tooling; `frontend/package.json` owns frontend dependencies. Frontend commands delegate through `pnpm --dir frontend`; combined development, contract, API-test and release orchestration remain at the root.
  - `frontend/vite.config.ts` configures React, `@/* -> src/*`, and dev server port `7200` with `strictPort: true`.
  - `frontend/tsconfig.json` enables strict TypeScript and includes frontend-local `src` plus `vite.config.ts`.
  - Root `eslint.config.mjs` provides shared flat ESLint config with TypeScript, React Hooks, and React Refresh rules.
- Backend:
  - `backend/` is the Go project root and owns `.env`, `configs/`, `compose.yaml`, `docker/` and local ignored data. Run direct Go/Compose commands there; root Go commands use `go -C backend`.
  - `backend/cmd/server/main.go` is the main server entrypoint.
  - `backend/main.go` starts the same server stack. The Go module remains `zx-panel`.
  - Development configuration retains optional cwd `.env` plus process environment; process environment wins, and `PORT` overrides `25000`. Production `LoadFile` reads only the explicit configuration and process environment, without probing cwd `.env`; helper also skips dotenv/database loading.
  - `backend/internal/server/run.go` creates the HTTP server.
  - `backend/internal/api/panel.go` and `resources.go` are the active Cookie API. `router.go` is the retained legacy scaffold used by existing regression tests.
  - `backend/internal/auth/*` retains credential types and the legacy service. `backend/internal/control/*` implements collection, SSE, plans, durable tasks, runtime adapters, apps and encrypted logs. `backend/internal/host/*` implements the restricted helper; `backend/cmd/helper` is its executable.
  - Runtime discovery rechecks Linux service PATH, system locations and accessible current-account toolchains (including Homebrew opt/keg-only paths and `~/sdk/go*/bin`) at startup and every minute in development and production. Active frontend runtime, reference and capability/bootstrap queries also poll every 30 seconds and refetch on focus. Never cache discovered paths at build/configuration time or load shell profiles in the service.
  - External installations keep their ownership but support source-verified management through helper protocol v2: apt/dpkg runtime packages, standard Homebrew prefixes with one installed keg per formula, and standalone Go at `/usr/local/go` or `/opt/go`. Unknown sources remain blocked with a reason. Node.js/Go can be panel defaults; verified external Node.js can bind applications. `runtime.set-system-default` separately confirms a `/usr/local/bin` symlink switch. Package uninstall preserves dependency checks and never autoremove/force/purge. The helper verifies executable/package/entry fingerprints again before mutation.
  - `backend/internal/storage` owns PostgreSQL, versioned migrations, Cookie sessions and password changes. Production startup checks schema only.
- Domain packages are expected to live under `backend/internal/*`. Add new backend code there rather than coupling it to frontend files.

## Developer Workflows
- Use Node `^22.22.0 || >=24.0.0` and pnpm `>=10.0.0` as declared in the package engines; the Go module requires Go `1.25.0` or newer. Install workspace dependencies from the root with `pnpm install --frozen-lockfile`.
- Use pnpm for frontend package scripts:
  - `pnpm dev` starts Vite on `http://localhost:7200`.
  - `pnpm dev:all` runs Windows Vite and the Go API in the default WSL distribution/user. Combined and independent WSL launchers load interactive login Bash, then discover installed tools from common system/current-account directories on every invocation, preserving existing PATH priority without rewriting shell configuration. They check WSL, Go/setsid, a non-root user and the shared repository before starting the backend. When present, ignored `backend/configs/dev.json` is passed to the Go API; use the same explicit `--config` for CLI preparation, and keep Linux keys/data in the WSL filesystem. PostgreSQL preparation and explicit migration remain manual. Ctrl+C or either service exiting stops both.
  - `pnpm dev:frontend:wsl` and `pnpm dev:backend:wsl` independently run the selected service in WSL, from Windows or directly inside WSL. Checks reject other platforms, root, missing tools, outdated Node/Go, non-Linux toolchains and incompatible frontend native dependencies. Use Linux pnpm to install separate WSL `node_modules`; no automatic installation or database preparation. Arguments are passed verbatim and Ctrl+C cleans only the selected service's process group.
  - `pnpm build` builds production assets into `frontend/dist/`.
  - `pnpm start` or `pnpm preview` previews the built frontend.
  - `pnpm lint` runs ESLint.
  - `pnpm typecheck` (or `pnpm --dir frontend exec tsc --noEmit`) checks frontend types.
  - `pnpm test` runs Vitest tests under `frontend/tests/unit/`; it does not include the separate Node or Playwright suites.
  - `pnpm test:login` runs Node built-in tests for login validation and safe return paths.
  - `pnpm test:theme` checks initial color/style policy, public-page and storage fallbacks, and theme transition cleanup.
  - `pnpm test:dev` checks combined and independent WSL startup guards, argument forwarding and process cleanup.
  - `pnpm test:e2e` runs Chromium against its own Mock Vite server on `127.0.0.1:7201`; install Chromium with `pnpm exec playwright install chromium` when needed. For appearance/sidebar changes, target `pnpm --dir frontend exec playwright test tests/e2e/appearance.spec.ts tests/e2e/motion.spec.ts` to cover style persistence, stable geometry, footer popovers and motion.
  - `pnpm lint:fix` applies fixable ESLint changes.
- Backend commands:
  - `go -C backend run -tags devassets ./cmd/server` starts the development API on loopback `PORT` or `25000` after explicit migration.
  - On Linux/WSL, every `devassets` service startup in development mode first builds `backend/build/wsl/zx-panel-helper` from current source and stops on build failure. This shared startup hook covers direct Go runs, pnpm launchers and GoLand debugging; cwd must remain `backend/` with a Linux Go SDK available. It only builds the helper, without sudo, installation or service restart; maintenance commands, release builds and non-Linux previews skip it.
  - The startup hook lives in `backend/internal/server/dev_helper_linux.go`, with `dev_helper_disabled.go` for other builds. On Linux/WSL, `go -C backend test -tags devassets ./internal/server -run TestDevelopment` covers rebuilds, toolchain fallback, failed/canceled builds and stopping startup before database/data initialization. Windows tests exclude this Linux-only coverage. See `docs/wsl-go-debug.md` for manual builds and debugging.
  - `go -C backend test -tags devassets ./...` and `go -C backend vet -tags devassets ./...` validate Go. `ZX_PANEL_INTEGRATION=1` creates random isolated test databases; it must verify current_database() before any test writes.
  - `scripts/acceptance/wsl-lab.sh` and `scripts/acceptance/wsl-lab.py` reproduce the explicitly authorized isolated WSL experiment; they use dedicated paths, users, service units and PostgreSQL on 25433. Never repoint these tests at the existing development database.
  - `scripts/acceptance/wsl-release-checks.py export` tests actual 50 MiB export limits; its `uninstall` mode requires explicit authorization for temporary process-inspection capability and experimental runtime removal. Its `deployment` mode exercises the explicitly approved production template, binds template/binary SHA256 values to the report, then restores the original lab units. All modes wait for executable/capability/seccomp/socket readiness, restore capabilities and stop dedicated services. `uninstall --resume-installation` only reuses the installation recorded by its own failed check. `scripts/acceptance/wsl-resource-budget.mjs` measures cold browser transfers with JS/CSS compression and confirms API/SSE remain uncompressed.
- Scripts are grouped by purpose: `scripts/dev`, `build`, `contract`, `test`, `security`, and `acceptance`. Update package scripts, CI, documentation and lab/guest copy paths together when relocating them.
- Commit messages are enforced by Husky + Commitlint:
  - Hook: `.husky/commit-msg`
  - Ruleset: `commitlint.config.js` with `@commitlint/config-conventional`
  - Use conventional commit prefixes such as `feat:`, `fix:`, `docs:`, and `chore:`.

## Conventions to Follow
- Use TypeScript and functional React components for frontend work.
- Place every project-defined frontend `type` and `interface` under `frontend/src/types`; ambient declarations such as `frontend/src/vite-env.d.ts` are exempt.
- Add Chinese JSDoc block comments (`/** ... */`) to frontend components, hooks, functions, classes, custom types/interfaces, and module-level constants. Comments must explain responsibility, boundaries, or usage instead of restating the identifier.
- Inside frontend functions and methods, use single-line `//` comments only for important state transitions, security checks, error handling, resource cleanup, or other non-obvious logic; avoid line-by-line narration.
- Prefer existing React hooks and local context patterns over adding global state libraries.
- Use the configured alias `@/* -> src/*` when it improves clarity.
- Keep styles in adjacent `*.styles.ts` modules using `stylex.create`. Compose library controls through `xstyle`; use `styleProps` for native elements and Base UI state callbacks. Do not concatenate atomic class names to override component styles. Dynamic positions and measurements use StyleX parameters; Base UI positioning and Recharts series-color variables remain library data at the boundary.
- Use existing shadcn/ui controls before adding new UI dependencies. These Base UI/Nova source components retain their standard behaviors with StyleX styling. The Tailwind generator configuration and CLI have been removed; when adding an official component, review the upstream source and adapt its styles and project types/comments instead of reintroducing Tailwind.
- Keep theme colors in `frontend/src/styles/theme.styles.ts` and the external CSP-compatible `frontend/public/theme-init.js` referenced by `frontend/index.html` aligned with runtime theme policy. Login is always dark with one static line-art background and no toggle; setup follows the system with dark fallback. Both public pages use the default shell style without overwriting saved preferences. Preserve independent `zx-panel-theme` and `zx-panel-theme-style` preferences for authenticated pages. Theme transitions respect reduced motion.
- Build visual and interactive UI from shadcn components, including login branding, cards, feedback, navigation, and tooltips. Keep native elements for semantic structure and layout only; page styles should compose component layout without redefining their colors, typography, or shadows. Keep `FieldError` mounted to reserve two lines before validation; longer errors scroll without changing form height.
- Use the shared shadcn Toast for ordinary error, warning, success and information feedback: top-right, collapsed by default, with at most eight visible when expanded. Keep explicitly required field validation, operation review/confirmation, local query retry details, task error records, observation/read-only scope and log gap/drop indicators in context. State-driven notices use `ToastNotice` to avoid duplicate notifications on re-render.
- Use the official Sidebar composition for the main navigation, with `SidebarMenuButton render={<NavLink ... />}`. Use `Item render={<a ... />}` for other structured links so native link semantics remain intact.
- Keep the sidebar context and hook in `frontend/src/hooks/use-sidebar.ts`; TooltipProvider is mounted at the app entry.
- Extend the existing React Router configuration rather than adding another routing layer.
- For backend code, use idiomatic Go, explicit error handling, and the existing Gin response shape:
  - `success`
  - `data`
  - `error`
- Add or maintain Chinese Go doc comments for package-level types, interfaces, constants, variables, functions, and methods in product code and tests. Each definition comment must use at least two consecutive `//` lines, start with the symbol name when Go conventions require it, and explain responsibility or boundaries rather than merely restating the name.
- Inside Go functions and methods, use single-line `//` comments for important branches, security boundaries, state transitions, and resource lifecycle operations; avoid comments on obvious assignments or returns.
- Apply these comment rules to `backend/main.go`, `backend/cmd/**`, `backend/internal/**`, tests, and all frontend files under `frontend/src/**`; `learn/**` remains excluded unless a task explicitly targets it.
- Keep runnable backend startup logic under `backend/cmd/server` and reusable service/domain logic under `backend/internal/*`.
- Do not add new dependencies unless there is a clear need; explain the reason, alternatives, and impact if you do.

## Integration and Boundaries
- Authentication is integrated through `/api/v1/auth/*`; keep new API responses aligned with the existing response shape.
- Avoid hardcoded environment-specific URLs; use configuration or environment variables.
- Keep frontend route/UI concerns in `frontend/src/**`.
- Keep backend API, configuration, server, storage, and domain concerns in Go packages under `backend/internal/**`.
- Do not import or depend on backend internals directly from frontend code.
- For static deployment of the Vite SPA, configure the host to fall back unknown UI paths to `frontend/index.html` so page and detail routes load directly; never fall back `/api/*`, SSE or downloads to HTML.

## Practical Examples for Agents
- New UI view: add a lazy route under `frontend/src/routes/router.tsx`; place authenticated pages under `AuthGuard` and `MainLayout`. For a main navigation entry, update `frontend/src/features/panel/navigation.ts` and the relevant navigation/page tests.
- New frontend helper: place it under an appropriate `frontend/src/<domain-or-purpose>/` directory and import via relative paths or `@/`.
- New backend endpoint: add route wiring in `backend/internal/api/resources.go`; move handlers/services into focused `backend/internal/<domain>/` packages as complexity grows.
- New backend config: extend `backend/internal/config/panel.go` and document the environment variable in `README.md`.
- Docs-only change: update `README.md` and keep `AGENTS.md` accurate for future agents when architectural facts change.

## v1.1 Delivery and Safety
- `pnpm dev:mock` uses fixed MSW data; `pnpm dev` uses the real same-origin API. Do not silently fall back between modes.
- `pnpm test:api` builds embedded production assets and runs `frontend/tests/api-e2e/` against the isolated Go browser fixture on `127.0.0.1:7202`, without MSW or Vite. It requires PostgreSQL access with permission to create isolated databases. Preserve the separate Node login/theme tests alongside Vitest and Mock E2E coverage; CI wiring is in `.github/workflows/verify.yml`.
- Generate API fixtures with `ZX_PANEL_CONTRACT_FIXTURES=1` during the isolated integration test, then run `pnpm contract --check-go` to validate Go responses against frontend schemas. Fixtures contain public responses only; `pnpm scan:secrets` provides the repository secret-pattern check.
- `pnpm build:release` validates API-only assets into `backend/internal/web/ui/dist`; `pnpm release` builds Linux amd64/arm64 binaries. Formal Go builds require these ignored generated assets; `devassets` is explicitly development only. Rebuilding resets build-time acceptance to pending; completed acceptance applies only to the artifact hashes in `docs/acceptance-deployment.json`.
- Responses retain `success/data/error` and add `meta.requestId/serverTime`; synchronize OpenAPI via `pnpm contract`.
- Never edit an applied SQL migration. Append a new version and preserve LF bytes for stable checksums.
- Web runs non-root. The root helper never reads database credentials and never listens on TCP. Only configured peer UID, owned units and controlled directories are allowed.
- External runtime management requires deploying the matching helper v2 and updated service templates. Home directories become read-only in the service sandbox; the helper additionally writes `/usr/local/bin`. Package removal uses fixed, bounded transient systemd jobs; Homebrew executes as its installation owner and permits writes by that installation group. Homebrew Node app units use `ProtectHome=tmpfs` with only the verified brew prefix bound read-only. Entry UI prompts for helper setup/restart when disabled, unavailable or outdated. No browser sudo password flow and no root Web process. New package-removal/template acceptance remains pending; old deployment hashes do not cover these changes.
- Existing users require a new pg_dump backup before CLI migration. Initialization requires a local one-time token; no automatic default admin.
- Keep actual Linux/systemd tests, backup restoration and prolonged resource measurement explicitly pending until observed; cross-compilation is not runtime acceptance.
