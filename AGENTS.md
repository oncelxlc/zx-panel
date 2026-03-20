# AGENTS.md

## Scope and Current State
- This repo is a **hybrid scaffold**: active Next.js frontend + mostly placeholder Go backend.
- Treat the frontend (`src/app`) as production-facing code; treat most Go code as bootstrap/work-in-progress unless a task says otherwise.
- `README.md` is still the default create-next-app text, so rely on code/config for truth.

## Architecture Map (What Exists Today)
- Frontend uses **Next.js App Router** under `src/app` (e.g., `src/app/page.tsx`, `src/app/nginx/page.tsx`, `src/app/nginx/index/page.tsx`).
- Shared app chrome is in `src/app/layout.tsx`; route-segment layout exists at `src/app/nginx/layout.tsx`.
- Backend entrypoints exist but are minimal:
  - `main.go` runs `learn.MapSliceMain()` from `learn/golang/main.go` (learning/demo code).
  - `cmd/server/main.go` exists as a server entrypoint placeholder.
- Domain directories under `internal/` (`api`, `auth`, `audit`, `nginx`, `store`) currently contain `.gitkeep` only.

## Developer Workflows (Verified From Repo)
- Node runtime target is modern (`package.json` engines: Node `^22.22.0 || >=24`).
- Primary frontend scripts:
  - `pnpm dev` (Next dev server)
  - `pnpm build` (production build)
  - `pnpm start` (serve built app)
  - `pnpm lint` / `pnpm lint:fix`
- Commit messages are enforced by Husky + Commitlint:
  - Hook: `.husky/commit-msg`
  - Ruleset: `commitlint.config.js` with `@commitlint/config-conventional`

## Conventions to Follow in This Codebase
- Use TypeScript + functional React components (existing pages/layouts follow this).
- Use the configured path alias `@/* -> src/*` from `tsconfig.json`.
- Keep lint compatibility with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` (`eslint.config.mjs`).
- Keep styling aligned with existing CSS/CSS Modules patterns (`src/app/globals.css`, `src/app/page.module.css`); do not introduce a new styling system.
- If adding backend code, place runnable server logic under `cmd/server` and package code under `internal/*`.

## Integration and Boundaries
- No real frontend-backend wiring is implemented yet (no established API client/server contract in code).
- When adding integration, avoid hardcoded URLs; use env-driven config (consistent with `.github/copilot-instructions.md`).
- Keep frontend route concerns in `src/app/**` and backend service concerns in Go packages; avoid coupling UI files directly to backend internals.

## Practical Examples for Agents
- New UI route: add `src/app/<segment>/page.tsx` (and optional `layout.tsx` per segment).
- New backend feature skeleton: `internal/<domain>/...` + startup wiring in `cmd/server/main.go`.
- Imports in frontend should prefer alias style, e.g. `import X from "@/app/..."` when appropriate.
- Use conventional commit prefixes (`feat:`, `fix:`, `chore:`) so local commit hooks pass.

