# Terminal performance baseline

This document defines the reproducible startup-byte gates for the trading terminal. The gates complement browser traces and functional tests; they do not treat compressed bytes as a substitute for LCP, INP, CLS, or correctness.

## Metric ownership

- Evaluate field Core Web Vitals at the 75th percentile, split by mobile and desktop: LCP <= 2.5 s, INP <= 200 ms, and CLS <= 0.1.
- Lighthouse navigation supplies repeatable lab LCP, CLS, and TBT. TBT is a diagnostic proxy, not INP.
- Measure INP with a Chrome DevTools interaction trace or a repeatable user flow that records Event Timing for the actual control.
- Accept a performance change only when the production build improves the target metric without regressing the relevant functional contracts.

## Reproduction protocol

1. Start from a clean checkout with the CI toolchain: Node 22.15.0 and pnpm 10.21.0.
2. Install with `pnpm install --frozen-lockfile`.
3. Hold the build metadata constant when comparing byte measurements:

   ```bash
   GATU_BUILD_SHA=e4e09966b175679ac7e13ea192246ce27fae15b5 \
   GATU_RELEASE_ID=startup-guardrail-baseline \
   GATU_BUILD_TIME=2026-08-27T00:00:00.000Z \
   NODE_ENV=production \
   pnpm --filter @gatu/terminal build
   ```

4. Run `pnpm --filter @gatu/terminal perf:startup` to write the exact `client-root` JavaScript closure report to `scripts/measure/out/client-root-deps.json`.
5. For browser measurements, serve the Nitro build on loopback and use a fresh anonymous session at `/trade/HYPE`. Keep Chrome, viewport, CPU, and network settings fixed, record five mobile and five desktop runs, and compare the median and worst result.

External Hyperliquid and TradingView traffic makes a single Lighthouse run unsuitable as a byte-exact CI gate. CI therefore blocks deterministic bundle regressions and relevant contract-test failures. Browser results remain required evidence for changes that claim a user-visible performance improvement.

## Startup models

The production build enforces three complementary models:

- Route preloads are the de-duplicated TanStack preload metadata for `__root__`, `/trade/$symbol`, and the optional `/trade` route. This direct-file list is retained as a diagnostic, but it is not a complete startup model.
- Static trade startup is one transitive Rollup closure seeded by those route preloads, the root runtime scripts, and the uniquely named `client-root` and `trade-terminal-page` chunks. JavaScript, Vite-imported CSS (including `?url` stylesheet assets), and their static edges are included; `import()` edges are deliberately excluded.
- Runtime startup adds the static closures reached by the root runtime entry and manually reviewed first-render or idle-preload source modules. Mobile and desktop are measured separately, and files already counted by static startup are removed from the runtime increment.

The client-only Vite hook records graph schema v3 at `apps/terminal/node_modules/.cache/gatu/client-chunk-graph.json`. It combines Rollup imports with Vite's imported CSS and asset metadata, and uses repository-relative module identifiers so runtime profiles follow source-module identity rather than unstable chunk hashes. It is diagnostic build metadata, not a deployable artifact.

The checker fails closed when:

- the graph is missing or has an unsupported schema;
- its exact JS/CSS inventory differs from the emitted client assets;
- a graph edge, semantic module root, chunk prefix, route manifest, or runtime entry is missing or ambiguous; or
- the graph, including gzip, Brotli, or zstd variants, appears anywhere under Nitro's public output.

Run the production build before `perf:budget` or `perf:startup`; neither command accepts an unrelated or partial graph as a valid measurement.

## Calibrated clean-build measurements

The following values were measured on 2026-08-27 from base commit `e4e09966b175679ac7e13ea192246ce27fae15b5` with the fixed inputs above. The graph contained 369 JavaScript chunks and one CSS asset.

| Metric | Clean-build gzip bytes | Enforced baseline or ceiling | Allowed increase |
| --- | ---: | ---: | ---: |
| Largest JS chunk (`pwa-install`) | 585,456 gzip / 2,030,019 raw | 1,200,000 gzip / 4,050,000 raw ceiling | none |
| All client JS + CSS | 3,153,748 | 3,154,707 | 10,000 |
| Route preloads only (diagnostic) | 541,351 | not independently gated | n/a |
| Static trade startup | 1,570,221 | 1,570,221 | 10,000 |
| Mobile runtime increment | 110,580 | 110,580 | 10,000 |
| Mobile static + runtime | 1,680,801 | derived | n/a |
| Desktop runtime increment | 191,988 | 191,988 | 10,000 |
| Desktop static + runtime | 1,762,209 | derived | n/a |
| `client-root` JS static closure | 1,213,294 (17 chunks) | diagnostic report | n/a |

The previous route-preload-only model saw about 541 KB while the actual static trade closure is about 1.57 MB. The larger number is intentional: every route preload and runtime script is a graph entry rather than a direct-file union, so a transitive JavaScript or CSS dependency cannot bypass the startup gate.

Existing total-client, largest-chunk, and named-surface limits remain in force. This change adds startup coverage without loosening those limits.

## Runtime profiles

Both profiles include source roots that are expected on a fresh anonymous trade load: market catalog bootstrap, funds-action recovery, toasts, global modals, and token-selector idle preload. The desktop profile additionally includes the chart, order book, trade/account panels, positions panels/default tab, TradingView integration, footer, and the Funding/History/Order History chunks that `PositionsPanel` deterministically idle-preloads.

These profiles cover the default mobile Trade surface and desktop Positions surface. Counting a deterministically prefetched history chunk does not claim that its tab was rendered. The profiles do not claim coverage for a persisted non-default locale, a persisted non-default desktop tab, or a mobile Markets view. When first-render mounts or idle-preload behavior changes, update the reviewed semantic roots, targeted tests, baseline, and browser evidence in the same pull request.

## Review and re-baseline rules

- A decrease does not require lowering a baseline immediately; preserve headroom for small build-metadata and compression variance.
- An increase beyond the configured tolerance requires either removing the regression or documenting and reviewing an intentional re-baseline. Do not update a number only to make CI green.
- Re-baseline only from a clean build using the pinned CI Node and pnpm versions and fixed build metadata. Record the commit, exact command, graph inventory, route-only diagnostic, static startup, both runtime increments, and combined totals.
- Keep runtime source roots semantic and narrow. Do not replace them with generated chunk names.
- Preserve wallet signing, onboarding, provider ordering, responsive layout, and subscription ownership contracts while optimizing startup.

## Functional acceptance gates

Every terminal optimization must preserve all of the following:

- Privy remains the sole managed authentication and wallet directory, with the established Privy -> Query -> Wagmi provider order and ready-state semantics.
- A user-signed client is created only for the exact active owner wallet. Booting, missing, or mismatched wallet state fails closed and is never treated as disconnected or empty.
- Markets, Trade, and Account switching does not recreate the TradingView widget, duplicate WebSocket subscriptions, or discard order-form, chart, disclosure, and scroll state.
- Hidden retained views are not keyboard-focusable or exposed as active content to assistive technology.
- Recent Trades retains one subscription, the complete in-memory buffer, stable `(time, coin, tid)` identity, decimal strings, local time formatting, and external explorer links.
- Mobile and desktop continue to switch at the inclusive 1000 px breakpoint, including 320, 360, 412, 1000, and 1001 px checks.

Run the targeted performance-validator tests, terminal typecheck, and a clean production build for every performance pull request. Wallet/runtime changes additionally require the relevant signing, onboarding, and provider suites.

## Field measurement activation gate

The terminal does not currently send field Web Vitals telemetry. Enabling it is a separate product, privacy, and operational change, not part of a rendering or bundle-budget pull request. It requires qualified legal/privacy review and must preserve the repository's prohibition on product-analytics SDKs.

Any future proposal must be first-party and aggregate-only: start only after sensitive mobile approval fragments have been scrubbed and hydration succeeds; avoid persistent identifiers; send only the metric name, value/rating, release, coarse device/layout class, and an allowlisted route family to a same-origin endpoint. Never send raw URLs, queries or fragments, market symbols, DOM text/selectors, wallet/account data, referrers, user agents, or client identifiers. Independently review schema validation, request-size limits, sampling, retention, and rate limiting before activation.

## Current no-go changes

Do not combine these architectural changes with a local byte-budget fix:

- switching the client-only trade route to data-only or full SSR without a shared server loader, caching, and Hyperliquid rate-limit design;
- deferring hydration while the route has no server-rendered terminal and primary navigation/account controls must remain immediately interactive;
- conditionally mounting or delaying Privy/Wagmi providers in a way that changes identity or wallet-ready lifecycle;
- destroying retained inactive mobile trees and their widget/subscription ownership; or
- treating TradingView visibility before ready as an official readiness API without explicit ready, error, timeout, and recovery evidence.
