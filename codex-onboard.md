# Onboarding task — understand the "Sairn" repo, then run it on http://localhost:3005

## Your role
You are a senior engineer onboarding onto an unfamiliar PRODUCTION codebase.
Two goals, in order: (1) build an accurate mental model of this project;
(2) get it running locally on http://localhost:3005 and verify it serves.
Read before you run. Work from the actual files — never assume contents.

## What this project is
"Sairn" is a production web trading terminal for the Hyperliquid DEX (perps + spot):
real-time orderbook/charts, wallet connect, order entry. It is a pnpm monorepo.
Stack: TanStack Start 1.132 (SSR) + Nitro · React 19 (compiler ON) · Vite 7 · TypeScript ·
Tailwind v4 · Lingui i18n · Privy (wallet auth) · @nktkas/hyperliquid SDK · big.js (money math) ·
Zustand · TanStack Query/Router/Table/Virtual · Biome (lint/format). Node 24, pnpm 10.

## Repo map — read in this order
1. `README.md`.
2. `.claude/rules/*.md` — BINDING conventions, they override your defaults. Read all:
   `agent.md`, `code-style.md`, `ssr.md`, `hyperliquid.md`, `design-tokens.md`,
   `ui-library.md`, `style-ui-guide.md`, `git.md`.
3. `apps/terminal/`:
   - `vite.config.ts` — SSR/Nitro + Lingui + React-compiler plugins.
   - `src/routes/` — file-based routes: `index.tsx`(/), `perp.tsx`, `spot.tsx`,
     `builders-perp.*`, `docs|terms|privacy|support.tsx`, `__root.tsx`(root doc+providers),
     `$.tsx`(catch-all).
   - `src/providers/`, `src/router.tsx` — Privy/Query/i18n/SSR wiring.
   - `src/domain/` — pure business logic (`domain/trade/` order building, `domain/market/` price math).
   - `src/lib/` — utils by domain (`lib/trade/`, `lib/chart/`, …).
   - `src/hooks/`, `src/stores/`, `src/components/`, `src/config/`, `src/locales/`.
4. `packages/`:
   - `hl-react` — the data layer: `useSubL2Book`/`useSubTrades` (real-time WS),
     `useInfo*` (one-shot), `useAction*` (signed mutations).
   - `hyperliquid-api` — API/types surface. `ui` — `@sairn/ui` design system (primitives only).

## Facts you MUST respect
- SSR: all module top-level code runs on the server. Never touch `window`/`document`/
  `localStorage` at module scope without a guard (see `.claude/rules/ssr.md`).
  `React.lazy` does NOT stop SSR evaluation.
- Env: client = `VITE_*` (bundled, public, e.g. `VITE_PRIVY_APP_ID`); server-only secret =
  `IPDATA_API_KEY` (no VITE_ prefix). Dev auto-loads `apps/terminal/.env.local`.
  Do NOT print, copy, or exfiltrate any value from `.env.local`.
- Data principle: keep API strings as-is; use big.js only when math is needed, then back to string.
- React 19 compiler handles memoization — no manual `useMemo`/`useCallback` for perf.

## Phase 1 — Understand (read-only, do not modify code)

## Phase 2 — Run on :3005 (from repo root)
1. Deps: if `node_modules` is missing → `pnpm install` (needs network); if present → skip.
2. Env: ensure `apps/terminal/.env.local` exists; if missing,
   `cp apps/terminal/.env.example apps/terminal/.env.local`
   (page renders without `VITE_PRIVY_APP_ID`; only wallet login is disabled).
3. Start dev server on 3005:
   `cd apps/terminal && pnpm dev --port 3005`
   (if the flag isn't honored: `pnpm --filter @sairn/terminal exec vite --port 3005`)
4. Verify: `curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3005/` → expect `200`;
   SSR HTML `<title>` should be `Trade | Sairn`.
   This is the HMR dev server (not a prod build); run it backgrounded if you need the shell.

## Guardrails
- Do not modify source, do not commit/push. Do not run the prod `build` unless asked
  (it needs an 8 GB heap; dev server is enough for :3005). Obey every `.claude/rules/` file.
  Never expose `.env.local` secrets.

## Deliverable — output a STRUCTURED summary
1. One-paragraph project overview (what it is, who it's for).
2. Architecture & data flow: route → providers → components → `domain`/`lib` →
   `packages/hl-react` → Hyperliquid (real-time WS vs one-shot info vs signed order actions).
3. Key modules (5–10 bullets: path → responsibility).
4. Cross-cutting concerns: SSR model, i18n, Privy wallet, geo restriction, chart engine, big.js money.
5. Risks / things to be careful with.
6. Run result: the :3005 HTTP status, page title, any console/server warnings.

## Acceptance criteria
- http://localhost:3005/ returns 200 and serves the Sairn SSR page (`<title>Trade | Sairn</title>`).
- A structured understanding summary covering all six deliverable points.
