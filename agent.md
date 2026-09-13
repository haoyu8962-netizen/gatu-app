# gatu — AI Agent Guide

This is the implementation map for this checkout. Read [AGENTS.md](AGENTS.md) first for durable product and safety contracts, and use the [documentation index](docs/README.md) to find design decisions, working records and delivery documentation. Update the relevant documentation alongside behavior changes.

## Repository boundaries

gatu is a pnpm monorepo for a Hyperliquid trading terminal, its public website and shared packages. Paths below are relative to the repository root; the terminal's `@/` alias resolves to `apps/terminal/src/`.

| Location | Responsibility |
|---|---|
| [apps/terminal](apps/terminal/README.md) | Trading routes, wallet UX, dashboards, order drafts and application business rules |
| [apps/website](apps/website/README.md) | Public website |
| [packages/hl-react](packages/hl-react/README.md) | Hyperliquid clients, query/subscription hooks, signing and transport lifecycle |
| [packages/ui](packages/ui/README.md) | Shared accessible primitives, variants and design tokens |
| [packages/hyperliquid-api](packages/hyperliquid-api/SKILL.md) | Agent reference skill; not an application runtime dependency |
| [docs](docs/README.md) | Designs, operational contracts, references, review evidence and delivery guides |

Dependency versions and runnable commands are authoritative in [package.json](package.json), [apps/terminal/package.json](apps/terminal/package.json) and the lockfile. The terminal uses React 19 with React Compiler, TanStack Start/Router/Query, TypeScript, Vite/Nitro, Zustand, Tailwind 4, Base UI, Privy, wagmi/viem, the Hyperliquid SDK, Big.js, Zod and Lingui. Tests use Vitest and targeted Playwright fixtures; Biome handles code linting and formatting.

## Implementation map

| Path | Purpose |
|---|---|
| [apps/terminal/src/router.tsx](apps/terminal/src/router.tsx) | Router creation, per-router QueryClient and SSR query integration |
| [apps/terminal/src/routes/__root.tsx](apps/terminal/src/routes/__root.tsx) | Stable HTML shell, route-specific skeletons and application runtime gate |
| [apps/terminal/src/providers/root.tsx](apps/terminal/src/providers/root.tsx) | SSR-safe providers and deferred client runtime import |
| [apps/terminal/src/providers/client-root.tsx](apps/terminal/src/providers/client-root.tsx) | Privy, Smart Wallets, persisted Query, wagmi and Hyperliquid composition |
| [apps/terminal/src/providers/hyperliquid-owner-signer-bridge.tsx](apps/terminal/src/providers/hyperliquid-owner-signer-bridge.tsx) | Exact Privy owner signer supplied to `hl-react` |
| [apps/terminal/src/config](apps/terminal/src/config) | Domain-specific configuration: app, layout, Privy, Hyperliquid and feature gates |
| [apps/terminal/src/components/trade](apps/terminal/src/components/trade) | Chart, order book, trade form, account panels and mobile surfaces |
| [apps/terminal/src/domain](apps/terminal/src/domain) | Market/account/order models, derivations and execution guards |
| [apps/terminal/src/lib/trade/numbers.ts](apps/terminal/src/lib/trade/numbers.ts) | Shared precise-number utilities |
| [apps/terminal/src/lib/hyperliquid](apps/terminal/src/lib/hyperliquid) | App market catalog, market routes, deposit composition and package re-exports |
| [apps/terminal/src/hooks](apps/terminal/src/hooks) | Application orchestration, trading, wallet and UI hooks |
| [apps/terminal/src/stores](apps/terminal/src/stores) | Zustand drafts, preferences, market selection, pending actions and modal state |
| [packages/hl-react/src/clients.ts](packages/hl-react/src/clients.ts) | SDK clients and transport factories |
| [packages/hl-react/src/signing](packages/hl-react/src/signing) | Owner signer, Agent registration, legal and builder-fee gates, key storage |
| [packages/hl-react/src/subscriptions](packages/hl-react/src/subscriptions) | Incremental `l2` feed and isolated public order-book transport pool |

Public trading links use `/trade/:symbol` or `/trade/:base/:quote`; `/` redirects to a selected/default market. `/perp`, `/spot` and `/builders-perp` remain category entry routes. The [terminal README](apps/terminal/README.md#routes) lists dashboard, document and server routes. Do not edit `routeTree.gen.ts`; the router plugin generates it.

## Runtime and signing boundaries

The prerendered document shell (built once by the server renderer; no rendering at runtime) owns Query, Lingui and direction context. Wallet dependencies load through `ClientRuntimeGate` after hydration. Document routes (`/docs`, `/support`, `/terms`, `/privacy`, `/risk`, `/cookies`) render without the wallet runtime. Browser globals belong behind a verified client-only import boundary; a component's client-only rendering alone does not make its imports SSR-safe. See [SSR rules](.claude/rules/ssr.md) and [runtime guardrails](docs/runtime-guardrails.md).

Privy owns authentication and the external-wallet catalog; `@privy-io/wagmi` supplies connector state. The active account must match the selected Hyperliquid owner before any user-signed client is created. Ordinary email trading uses that user's exact active embedded owner. External-wallet trading and Agent-only sessions use verified Agent/API wallets. Authentication, owner signer readiness, Agent approval, local key availability, legal acceptance and builder-fee approval are separate facts.

Follow [trading onboarding](docs/trading-onboarding.md) and [email trading signing](docs/email-trading-signing.md): connect the exact owner, resolve legal acceptance, establish the signer, then classify complete funding snapshots. Missing or failed data must not produce an empty-account conclusion. Login, refresh and status checks never sign; Agent registration never approves builder fees. `Stay Connected` defaults off, storing generated Agent keys in session storage; opting in uses local storage. Feature-gated desktop linking has separate release requirements in [mobile sync production readiness](docs/mobile-sync-production-readiness.md).

## Coding conventions

Detailed conventions live in [code-style.md](.claude/rules/code-style.md), [hyperliquid.md](.claude/rules/hyperliquid.md), [ui-library.md](.claude/rules/ui-library.md) and [design-tokens.md](.claude/rules/design-tokens.md).

- Prefer one public component per file, `interface Props`, function declarations and direct imports. Small internal helpers are allowed; do not introduce new barrel files for app code.
- Use `cn()` from `@/lib/cn` for classes and shared semantic tokens for colors. Put app compositions in `apps/terminal/src/components/ui/`; keep `packages/ui` independent of application business logic.
- Keep financial and account calculations in `domain/` or `lib/`. Preserve protocol decimal strings and use Big.js for arithmetic and comparisons, never JavaScript floating-point multiplication in renderers.
- Use effects for subscriptions, DOM and other external synchronization, not derived state. React Compiler handles performance memoization; manual `useMemo`/`useCallback` require a semantic reason.
- Do not add comments in components; keep the logic self-explanatory. Remove unnecessary comments elsewhere and never leave production `console.log` calls, following the comment policy in `code-style.md`.
- Render translations with a reactive Lingui dependency. Follow [i18n presentation](docs/i18n-presentation.md); helpers receive translated labels or the translator explicitly, and locale changes preserve panel identity, drafts and protocol values.

### Adding data, actions and state

Prefer existing typed exports from `@gatu/hl-react`: `useInfo*` for requests, `useSub*` for subscriptions and `useAction*` for mutations. Shared implementations live in [packages/hl-react/src/hooks](packages/hl-react/src/hooks), with behavior declared in [registries](packages/hl-react/src/registries). Add app-specific composition under `apps/terminal/src/hooks/` or `lib/`; do not recreate the former app-local info/subscription/exchange directories or bypass shared execution guards.

Draft and preference stores live in `apps/terminal/src/stores/`. Add persistence only where the lifecycle requires it; validate persisted data with [validated storage](apps/terminal/src/lib/storage/validated-storage.ts). Financial action execution must recheck current identity, market, legal status and required snapshot availability, not merely trust displayed component values.

### Layout and passive data

The terminal switches at `1000px` inclusive, using [config/layout.ts](apps/terminal/src/config/layout.ts) and [hooks/use-mobile.ts](apps/terminal/src/hooks/use-mobile.ts). Desktop grid changes at `1420px`; mobile connection surfaces additionally match coarse pointers and standalone display mode. Do not substitute Tailwind's `md:` breakpoint for these contracts.

Read [desktop grid layout](docs/desktop-grid-layout.md), [order-book layout](docs/orderbook-layout.md) and [order-entry surface parity](docs/order-entry-surface-parity.md) before changing geometry. Passive unavailable data uses stable placeholders, blank lists or skeletons while preserving action guards; requested-action feedback remains visible. Follow [mobile data presentation](docs/mobile-data-presentation.md).

## Commands and verification

Run these from the repository root. The package manager is pinned to pnpm `10.21.0`; Node must satisfy `>=22.15.0`.

```bash
pnpm install --frozen-lockfile
pnpm dev --port 3000                   # Explicit local terminal port
pnpm dev:browser --port 3006           # System browser; requested port must be free
pnpm build                            # Terminal build + chunk-cycle and bundle-budget checks
pnpm serve                            # Serve the built Nitro application
pnpm --filter @gatu/terminal typecheck
pnpm typecheck                        # hl-react, ui and terminal
pnpm --filter @gatu/terminal test      # Terminal Vitest run
pnpm test                             # OG check, terminal + website suites, cross-app brand test
pnpm exec biome check <changed-files>
pnpm i18n:extract
pnpm i18n:compile
```

`pnpm lint`, `pnpm format` and `pnpm check` inspect code; `pnpm fix` writes Biome fixes. `pnpm check` is not a substitute for typechecking or tests. Vite config does not set port `3000`, so supply an explicit port when a workflow needs a fixed URL. Wallet testing requires a normal supported browser; see [wallet initialization debugging](docs/wallet-initialization-debugging.md).

Choose checks for the touched surface using [AGENTS.md](AGENTS.md#verification) and the relevant design document. Browser-fixture dependency caches must be separate from the app's Vite cache. Documentation-only changes need source/path/link checks and `git diff --check`; do not claim runtime tests were run if only prose changed.

## Completing work

Update the relevant design/reference/tutorial when implementation changes its contract, and record evidence and remaining limits in working documentation rather than adding temporary findings to `AGENTS.md`. Historical verification is not proof that this checkout or a production release passed the same checks.

Follow [git.md](.claude/rules/git.md) and the [auto-commit skill](.agents/skills/auto-commit/SKILL.md). Preserve unrelated changes, stage only current-task paths and create a validated Conventional Commit before the final response unless an explicit exception applies. Never push without the user's request. [Lefthook](lefthook.yml) runs Biome on staged code, extracts Lingui catalogs when terminal source changes, and validates the commit message; inspect any hook-generated changes before including them.
