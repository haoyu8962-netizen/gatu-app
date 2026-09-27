# apps/terminal

The gatu trading application composes `@gatu/hl-react` (Hyperliquid data, signing and transports) and `@gatu/ui` (shared primitives and tokens). This document describes the current checkout. Start with the [root README](../../README.md) for repository setup and the [documentation index](../../docs/README.md) for design contracts, tutorials and review records.

## Stack and build

Dependency versions are maintained in [package.json](package.json) and the workspace lockfile. The principal declared versions are:

| Layer | Dependency |
|---|---|
| Framework | TanStack Start `1.168.32`, Router `1.170.18`, Nitro `3.0.260311-beta` |
| Runtime and bundler | React `19.2.0`, React Compiler `1.0.0`, Vite `7.3.0` |
| Server/client state | TanStack Query `5.90.16`, Zustand `5.0.9` |
| UI | Tailwind `4.0.6`, Base UI `1.3.0`, `@gatu/ui`, react-grid-layout `2.2.3` |
| Wallets | Privy React Auth `^3.30.0`, Privy wagmi `^4.0.12`, wagmi `3.1.0`, viem `2.42.1` |
| Exchange and funding | Hyperliquid SDK `0.33.3`, LiFi SDK `3.16.3`, CCTP application flows |
| Charts | Vendored TradingView Charting Library and application datafeed |
| Numbers and validation | Big.js `7.0.1`, Zod `4.3.4` |
| Localization | Lingui `5.7.0`; `en`, `zh`, `hi`, `es`, `fr`, `ar` |
| Tests | Vitest `4.0.16`, Playwright `1.59.1` |

[vite.config.ts](vite.config.ts) composes `nitro()` from `nitro/vite`, `tanstackStart`, React Compiler, Lingui and Tailwind plugins. It also defines build identity, security/cache headers, compact non-English catalogs and client chunk metadata. Manual chunking groups selected UI/TanStack dependencies; web3 dependencies use Rollup's dependency-aware splitting. The build checks static chunk cycles and bundle budgets before succeeding. See [runtime guardrails](../../docs/runtime-guardrails.md) and [performance baseline](../../docs/terminal-performance-baseline.md) before altering these boundaries.

TanStack Start SPA mode is enabled (`createTanstackStartOptions()` in `vite.config.ts`). After the server build, the same `pnpm build` prerenders the client-rendered application shell to `.output/public/_shell.html` (masked at `/trade`, because `/` redirects on the server) and real HTML for the document routes listed in [config/document-routes.ts](src/config/document-routes.ts). Runtime server rendering is off. [src/start.ts](src/start.ts) registers the static-pages request middleware ([lib/static-pages/](src/lib/static-pages)): in production the Nitro process answers every navigation from the prerendered output (`_shell.html` for application routes, `<route>/index.html` for document routes, both with the Nitro route-rule headers), refuses HTML for file-like paths, answers `/_serverFn/*` with 404, answers `GET`/`HEAD` on POST-only server paths with 405 and unknown `/api/*` paths with 404, and only executes the `/api/*` handlers. Missing shell output fails closed with 503 unless `GATU_RUNTIME_SSR=true`; `GATU_PUBLIC_DIR` overrides the output lookup. The dev server and the build-time prerender still render on the server, which is why the document routes keep `ssr: true` while `/` and `/join/*` are client-rendered. The client no longer uses TanStack server functions: every server endpoint it calls lives under `/api/` ([config/api-paths.ts](src/config/api-paths.ts)) as a Web-standard `Request → Response` handler that Nitro mounts today and that [src/edge/lambda-handler.ts](src/edge/lambda-handler.ts) adapts to an AWS Lambda function URL (`pnpm --filter @gatu/terminal build:lambda` writes the single-file bundle to `dist-lambda/`). `/build-meta.json` is also written as a static file, and `public/404.html` is the static not-found page for missing files on a CDN. See [ADR 0005](../../docs/adr/0005-spa-static-shell.md) and the [CloudFront deployment](../../deploy/cloudfront/README.md). After the budget checks, `scripts/inject-shell-preloads.mjs` writes the trade startup closure (static closure plus both runtime profiles) into `_shell.html` as `modulepreload`/stylesheet preloads, so a cold navigation downloads every startup chunk in one wave; on desktop widths it also preloads the TradingView loader named by `build-meta.json`. Desktop-only and mobile-only startup chunks and the chart iframe's main bundles are written as `<meta name="gatu-preload-*">` lists that [lib/preload/surface-preloads.ts](src/lib/preload/surface-preloads.ts) turns into links for the current surface, because Chromium ignores `media` on `modulepreload` and `prefetch` links. The block sits between `<!--gatu-shell-preloads-->` markers and document pages are untouched.

## Commands

Run from the repository root; Node `>=22.15.0` and the pinned pnpm `10.21.0` are required.

```bash
pnpm install --frozen-lockfile
pnpm dev --port 3000
pnpm dev:browser --port 3006
pnpm --filter @gatu/terminal typecheck
pnpm --filter @gatu/terminal test
pnpm build
pnpm serve
```

The dev server uses a strict port. Its config does not set `3000`, so the examples explicitly choose a port. Reuse an existing server when possible. `dev:browser` opens the system browser for wallet testing; embedded previews can block the external-wallet iframe. See [wallet initialization debugging](../../docs/wallet-initialization-debugging.md).

`pnpm build` compiles catalogs and creates `.output/`; `pnpm serve` runs the Nitro server through `scripts/serve-nitro.mjs` for local preview only (production is CloudFront + S3 + Lambda, see `deploy/cloudfront/README.md`). `pnpm --filter @gatu/terminal serve:spa` serves `.output/public` on `127.0.0.1:3030` the way a CDN would: existing files first, application routes rewritten to `_shell.html`, and the server-only paths (`/api/*`, `/_serverFn/*`, `/client-error-report`, `/mobile-agent-sync-ticket`) answered with a JSON 404 so the client never parses the shell as data. `/build-meta.json` is the static file the build wrote, served with `no-store` as the CDN serves it and never proxied. Without an API origin the geo lookup fails closed, which disables trading and funds actions while browsing keeps working; pass `--api http://127.0.0.1:3000` (or `SPA_API_ORIGIN`) to proxy those paths to a running `pnpm serve` and exercise the complete application from the static files. For the visualizer-enabled build, run `ANALYZE=true pnpm --filter @gatu/terminal build`; `ANALYZE` must reach the Vite process. Root `pnpm test` additionally checks generated OG cards, the website and cross-app brand behavior; it is broader than the terminal Vitest command above.

## Directory layout

```text
apps/terminal/
├── src/
│   ├── routes/           TanStack file routes and server endpoints
│   ├── router.tsx        Router + QueryClient + SSR query integration
│   ├── routeTree.gen.ts  Generated route map; do not edit
│   ├── providers/        SSR shell, client wallet runtime and exchange scope
│   ├── components/       trade/, dashboard/, pages/, ui/, funds-action/, icons/
│   ├── hooks/            trade/, wallet/, ui/ and shared app hooks
│   ├── domain/           market/ and trade/ models, calculations and guards
│   ├── lib/              trade/, chart/, hyperliquid/, wallet/, storage/, tests/, ...
│   ├── stores/           Zustand draft, preference, pending-action and modal state
│   ├── config/           App/layout, wallets, networks, feature gates and tokens
│   ├── locales/          Lingui message catalogs
│   ├── bones/            Skeleton registry
│   ├── types/            Application type declarations
│   └── styles.css       Tailwind entry, tokens, fonts and grid styles
├── public/              TradingView assets, theme CSS, service worker and static assets
├── tests/browser/       Playwright fixtures and browser configurations
├── vite.config.ts
├── vitest.config.ts
├── lingui.config.ts
├── tsconfig.json         @/* → ./src/*
└── package.json
```

Shared Hyperliquid hook implementations and clients live in `packages/hl-react/src/`. The terminal's `src/lib/hyperliquid/` contains app-level market catalog/bootstrap, routing, deposits and package re-exports.

### Product entry points

| Surface | Source |
|---|---|
| Terminal composition | [trade-terminal-page.tsx](src/components/trade/trade-terminal-page.tsx) and [layout/](src/components/trade/layout) |
| Chart and selector | [chart/](src/components/trade/chart); shared chart helpers in [lib/chart/](src/lib/chart) |
| Order entry and deposits | [tradebox/](src/components/trade/tradebox); calculations/guards in [domain/trade/](src/domain/trade) and [lib/trade/](src/lib/trade) |
| Order book and recent trades | [orderbook/](src/components/trade/orderbook) |
| Positions, orders and balances | [positions/](src/components/trade/positions) |
| Header and account menu | [header/](src/components/trade/header) |
| Mobile terminal | [mobile/](src/components/trade/mobile) |
| Shared wallet connection | [wallet-modal.tsx](src/components/trade/components/wallet-modal.tsx) |

Desktop and mobile use the inclusive `1000px` breakpoint from [layout.ts](src/config/layout.ts) and [use-mobile.ts](src/hooks/use-mobile.ts), with matching shell skeletons. Desktop grid geometry changes at `1420px`; responsive desktop changes retain stable keyed panels. `MOBILE_QR_SURFACE_MEDIA_QUERY` additionally includes coarse pointers and standalone display mode for connection UX. These are separate from Tailwind's default `md:` breakpoint. See [desktop grid layout](../../docs/desktop-grid-layout.md).

## Routes

Routes live in [src/routes/](src/routes). URL parameters below use `:name`; filenames use TanStack's `$name` convention.

| URL | Behavior |
|---|---|
| `/` | Redirect to the selected/default trade market with `scope=all` |
| `/trade`, `/trade/:symbol`, `/trade/:base/:quote` | Shared terminal parent with canonical market routes |
| `/perp`, `/spot`, `/builders-perp`, `/builders-perp/:dex` | Category entry routes sharing the terminal page |
| `/portfolio`, `/leaderboard`, `/referrals`, `/api-wallet` | Account and discovery dashboards |
| `/vaults`, `/vaults/:vaultAddress`, `/staking` | Vault and staking pages |
| `/tradeHistory/:address`, `/fundingHistory/:address`, `/historicalOrders/:address` | Address-scoped history pages |
| `/docs`, `/support`, `/terms`, `/privacy`, `/risk`, `/cookies` | Document pages that do not load the wallet runtime on direct entry |
| `/join/:code`, `/join/*` | Referral-code entry and invalid-path handling |
| `/mobile-agent-sync` | Feature-gated mobile Agent import page; reads the plain payload from the URL fragment, scrubs it and imports on an explicit tap (the retired `/mobile-agent-sync-ticket` path answers 404) |
| `GET /api/geo` | Visitor jurisdiction verdict for trading and funds gates; portable handler in [lib/geo/geo-api.ts](src/lib/geo/geo-api.ts). The bootstrap entry prefetches it on application surfaces through [lib/geo/geo-prefetch.ts](src/lib/geo/geo-prefetch.ts) so the verdict is usually ready before the wallet runtime mounts |
| `GET /api/health` | Liveness probe (204, `no-store`) for the CloudFront keep-warm schedule and release verification; Lambda only |
| `POST /api/referral-geo` | Fresh same-origin geo decision before referral and staking actions |
| Browser `POST` helper | Every same-origin JSON `POST` goes through `createJsonPostHeaders()` in [lib/api/payload-hash.ts](src/lib/api/payload-hash.ts): the CloudFront target signs Lambda origin requests without their body, so the viewer sends `x-amz-content-sha256` itself |
| `GET /api/leaderboard` | Leaderboard API handler |
| `POST /api/client-error-report` | Client failure report handler; `POST /client-error-report` remains a temporary alias for bundles loaded before the move |
| `GET /build-meta.json` | Running build identity; the build also writes the same JSON into `.output/public` |
| Other paths | Not-found/splat handling |

[router.tsx](src/router.tsx) wires the generated route tree. [__root.tsx](src/routes/__root.tsx) owns the persistent document shell. Trading routes are client-rendered behind terminal skeletons; document routes can render without Privy. [market-route.ts](src/lib/hyperliquid/market-route.ts) owns market URL mapping; avoid reconstructing names or spot identities in page components.

## Provider and data flow

[providers/root.tsx](src/providers/root.tsx) keeps the HTML shell stable across the build-time prerender, hydration and runtime activation:

```text
RootProvider
  QueryClientProvider → I18nProvider → BaseUiDirectionProvider
    ClientRuntimeProvider(ready=false) → document shell
      Document routes: Outlet directly
      Application routes: ClientRuntimeGate → lazy ClientRootProvider
```

The browser-only [ClientRootProvider](src/providers/client-root.tsx) composes:

```text
PwaInstallProvider
  PrivyProvider
    PrivyLoginMethodObserver
    SmartWalletsProvider
      PersistQueryClientProvider (same QueryClient)
        @privy-io/wagmi WagmiProvider
          I18nProvider → BaseUiDirectionProvider
            HyperliquidExchangePolicyProvider → HyperliquidProvider
              HyperliquidOwnerSignerBridge → HyperliquidAgentApprovalProvider
                legal lifecycle + MarketsProvider
                  deposit/order/TWAP reconciliation + ClientRuntimeProvider
                    I18nReadyGate → ExchangeScopeProvider → MarketsInfoProvider → Outlet
```

The final locale/scope/market-info gate is composed by `AppRuntime` in `__root.tsx`. `MarketsProvider` provides the market catalog; `MarketsInfoProvider` is a distinct application layer. [config/wagmi.ts](src/config/wagmi.ts) configures bridge chains/transports and intentionally supplies no parallel connector list: Privy owns wallet selection.

The client runtime captures Privy appearance at startup so a terminal theme toggle does not reconnect the wallet. A later page load picks up the persisted theme. Dark/light Privy configurations retain identical authentication methods and wallet ordering. Preserve this provider lifetime when changing appearance.

### Signing and first-use onboarding

Privy supports wallet/email login, creates embedded Ethereum wallets only for users without wallets, and disables passkeys. Email sessions trade with the exact authenticated embedded owner; external-wallet and Agent-only sessions require a verified Agent/API wallet. Active-wallet identity must match the selected owner for user-signed clients. Never substitute the first connected wallet or a stored Agent for a missing email owner.

Legal acceptance, signer readiness, Agent approval/key storage, builder-fee approval and funding classification remain separate gates. The order is owner connection → legal acceptance → signer setup → complete account funding snapshot → deposit only if definitively empty. Agent registration does not approve builder fees. Status checks, login and refresh do not sign. `Stay Connected` defaults off (`sessionStorage`); opt-in uses `localStorage` for generated Agent keys.

Read [trading onboarding](../../docs/trading-onboarding.md) and [email trading signing](../../docs/email-trading-signing.md) before changing these flows. [`useTradingStatus`](../../packages/hl-react/src/signing/use-trading-status.ts) exposes trading readiness; explicit API-wallet management still verifies real Agent state. [`useExchange`](../../packages/hl-react/src/hooks/useExchange.ts) preserves legal checks, signing-session invalidation, execution guards and the request scheduler before invoking the SDK.

### State and calculations

| Store in `src/stores/` | Responsibility |
|---|---|
| `use-global-settings-store.ts` | Theme, numeric formatting, slippage, margin mode, tabs and order-book animation preferences |
| `use-market-store.ts` | Market selection and favorites |
| `use-order-entry-store.ts` | Shared order draft |
| `use-order-queue-store.ts` | Order queue state |
| `use-pending-order-store.ts`, `use-pending-twap-store.ts`, `use-pending-trading-action-store.ts` | Pending execution/reconciliation state |
| `use-orderbook-actions-store.ts` | Book interactions |
| `use-global-modal-store.ts` | Shared modal state |

[lib/storage/validated-storage.ts](src/lib/storage/validated-storage.ts) validates persisted state. See [order draft lifecycle](../../docs/order-draft-lifecycle.md) before changing reset, resume or responsive handoff behavior. Financial math belongs in `domain/` or `lib/`, using Big.js; preserve API prices/sizes as decimal strings until calculation or formatting.

## Styling and localization

[styles.css](src/styles.css) imports Tailwind, animation utilities, Inter, `@gatu/ui/globals.css` and react-grid-layout styles, and registers IBM Plex Sans. It scans `packages/ui/src` through `@source`. Use semantic tokens defined there and in the UI package; follow the [design token rules](../../.claude/rules/design-tokens.md).

The dark terminal canvas and modal surface resolve to `#0F1A1F`. Modals/drawers use `bg-modal`; raised lightweight UI retains `bg-overlay`. TradingView iframe backgrounds require their own theme variables, with raised interactive layers kept separate from the canvas. Order-book depth, price and animation tokens have their own contrast contract in [order-book animation](../../docs/orderbook-new-level-animation.md).

[config/i18n.ts](src/config/i18n.ts) declares locales and number-format metadata. [lib/i18n.ts](src/lib/i18n.ts) activates English synchronously for SSR, loads other catalogs lazily, restores the persisted locale and exposes `dynamicActivate`/`i18nReady`. Rendered text must subscribe to locale changes:

```tsx
import { Trans, useLingui } from "@lingui/react/macro";

function Example() {
  const { t } = useLingui();
  return <button type="button" aria-label={t`Connect wallet`}><Trans>Connect</Trans></button>;
}
```

Pass translated labels or reactive translation dependencies into presentation helpers. A core `t` lookup alone does not subscribe a component. Language switches must preserve mounted panels and drafts; see [i18n presentation](../../docs/i18n-presentation.md).

## Environment and release gates

Use [.env.example](.env.example) as the configuration inventory. Copy it to local ignored configuration and set the public Privy app ID for wallet flows. `VITE_*` values are bundled into the client; server secrets such as `IPDATA_API_KEY` have no `VITE_` prefix.

[lib/network.ts](src/lib/network.ts) first resolves canonical public hostnames, then local persisted network preference, then the `VITE_HYPERLIQUID_TESTNET` default. The testnet flag alone does not override a canonical mainnet hostname or a persisted local selection. [public-origins.ts](src/config/public-origins.ts) defines the canonical origins.

Mobile Agent pairing, portfolio-margin activation, LiFi bridge creation and gated CCTP paths have independent controls in `src/config/`; consult the example env file and each flow's document. Direct external-wallet mainnet CCTP deposits are enabled in code. A disabled feature does not imply missing credentials.

Mobile Agent pairing is a client-only plain-fragment transfer ([ADR 0015](../../docs/adr/0015-link-device-alignment.md) D7 and D8) that works on the static CloudFront + S3 host, but `VITE_MOBILE_PAIRING_ENABLED` stays off in production until the [physical-device checklist](../../docs/mobile-phone-access-device-validation.md) is recorded, so the application gate fails closed.

## Verification and maintenance

Most unit and integration suites live in [src/lib/tests/](src/lib/tests); browser fixtures live in [tests/browser/](tests/browser). Use [AGENTS.md](../../AGENTS.md#verification) for surface-specific checks and read [runtime guardrails](../../docs/runtime-guardrails.md) before changing fixtures: their Vite dependency cache must be separate from the application server's cache.

```bash
pnpm --dir apps/terminal exec vitest run src/lib/tests/privy-config.test.ts
pnpm --filter @gatu/terminal test:browser:user-menu-recovery
pnpm --filter @gatu/terminal perf:ws-soak:30m
pnpm --filter @gatu/terminal perf:budget
```

The soak suite is opt-in; its script sets `WS_SOAK_RUN`, `WS_SOAK_DURATION_MS`, `WS_SOAK_SAMPLE_MS` and `WS_SOAK_OP_MS`. Bundle checks inspect the existing production output, so build first. Run relevant checks for each change and record actual results; old verification counts do not establish the state of a new checkout or release.

Follow [agent.md](../../agent.md), [AGENTS.md](../../AGENTS.md) and the [coding conventions](../../.claude/rules/code-style.md). Keep design constraints, source references and runnable instructions synchronized when changing the corresponding code.
