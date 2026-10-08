# Onboarding task — understand the "Sairn" repo, then run it on http://localhost:3005

Rewritten 2026-10-08 to match the current repository. The first version (2026-06-25, commit `f4d8de46`)
described runtime SSR, Node 24 and hook names that no longer exist; Git keeps it for reference.

## Your role
You are a senior engineer onboarding onto an unfamiliar PRODUCTION codebase.
Two goals, in order: (1) build an accurate mental model of this project;
(2) get it running locally on http://localhost:3005 and verify it serves.
Read before you run. Work from the actual files — never assume contents.

## What this project is
"Sairn" is a production web trading terminal for the Hyperliquid DEX (perps, spot and
builder-deployed perp DEXes): real-time order book and chart, wallet connection, order entry,
funds and dashboards. It is a pnpm monorepo. Stack (versions are authoritative in the
`package.json` files): TanStack Start with a prerendered SPA shell (no runtime server rendering)
· React 19 with React Compiler · Vite 7 · TypeScript · Tailwind v4 · Lingui · Privy · the
`@nktkas/hyperliquid` SDK · big.js · Zustand · TanStack Query/Router · Biome.
Node `>=22.15.0`, pnpm `10.21.0`. Production runs on CloudFront + S3 + Lambda.

## Repo map — read in this order
1. `AGENTS.md` (durable contracts), `agent.md` (implementation map, commands),
   `docs/agent-handbook.md` (working with the operator, worktrees, reviews, releases).
2. `.claude/rules/*.md` — BINDING conventions that override your defaults; read every file.
3. `docs/README.md` — the documentation map; `docs/work-memory/INDEX.md` — task records.
4. `apps/terminal/`:
   - `vite.config.ts` — Nitro, TanStack Start (SPA shell prerender), React Compiler, Lingui, Tailwind.
   - `src/routes/` — file routes: `/trade/:symbol` and `/trade/:base/:quote` (`/` redirects to a
     market), `/perp`, `/spot`, `/builders-perp`, dashboard routes (portfolio, earn, vaults,
     staking, leaderboard, referrals, history pages), Docs/Support/legal pages, and the
     Web-standard `/api/*` handlers (`api.*.ts`).
   - `src/providers/`, `src/router.tsx` — Privy, Query, Lingui and Hyperliquid composition.
   - `src/domain/` — pure business logic; `src/lib/` — utilities by domain; `src/hooks/`,
     `src/stores/`, `src/components/`, `src/config/`, `src/locales/`.
5. `packages/`:
   - `hl-react` — the data layer: `useInfo(method, params)` (requests),
     `useSubscription(method, params)` (WebSocket), `useExchange(method, options)` (signed actions).
   - `ui` — the `@sairn/ui` design system (primitives only).
   - `hyperliquid-api` — an Agent Skill reference, not a runtime dependency.

## Facts you MUST respect
- Module top-level code still runs on the server during the build-time prerender and in the dev
  server. Never touch `window`/`document`/`localStorage` at module scope without a guard
  (see `.claude/rules/ssr.md`). `React.lazy` does NOT stop server evaluation.
- Env: client values are `VITE_*` (bundled and public, e.g. `VITE_PRIVY_APP_ID`); the server-only
  secret `IPDATA_API_KEY` has no `VITE_` prefix. Dev auto-loads `apps/terminal/.env.local`.
  Do NOT print, copy or exfiltrate any value from `.env*` files.
- Data principle: keep API strings as-is; use big.js only when math is needed, then back to string.
- React Compiler handles memoization — no manual `useMemo`/`useCallback` for performance.

## Phase 1 — Understand (read-only, do not modify code)

## Phase 2 — Run on :3005 (from the repository root)
1. Deps: if `node_modules` is missing → `pnpm install --frozen-lockfile` (needs network); otherwise skip.
2. Env: ensure `apps/terminal/.env.local` exists; if missing,
   `cp apps/terminal/.env.example apps/terminal/.env.local`
   (pages render without `VITE_PRIVY_APP_ID`; only wallet login is disabled).
3. Start the dev server: `pnpm --filter @sairn/terminal exec vite dev --port 3005 --strictPort`
   (the same command as the `terminal` entry in `.claude/launch.json`).
4. Verify: `curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3005/trade/HYPE` → expect `200`.
   The HTML is the application shell; visible content appears only after hydration, by design
   (`.claude/rules/startup-rendering.md`). This is the HMR dev server, not a production build;
   run it in the background if you need the shell.

## Guardrails
- Do not modify source, do not commit or push. Do not run the production `build` unless asked
  (it needs an 8 GB heap; the dev server is enough for :3005). Obey every `.claude/rules/` file.
  Never expose `.env*` secrets.

## Deliverable — output a STRUCTURED summary
1. One-paragraph project overview (what it is, who it's for).
2. Architecture and data flow: route → providers → components → `domain`/`lib` →
   `packages/hl-react` → Hyperliquid (WebSocket subscriptions, info requests, signed actions).
3. Key modules (5–10 bullets: path → responsibility).
4. Cross-cutting concerns: prerendered shell and startup gate, i18n, Privy wallet and signer
   model, geo restriction, chart engine, big.js money.
5. Risks / things to be careful with.
6. Run result: the :3005 HTTP status, page title, any console or server warnings.

## Acceptance criteria
- http://localhost:3005/trade/HYPE returns 200 and serves the Sairn application shell.
- A structured understanding summary covering all six deliverable points.
