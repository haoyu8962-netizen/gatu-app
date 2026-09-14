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

## Translation catalog maintenance

Lingui 5.7.0 retains obsolete messages after ordinary extraction, and its catalog compiler includes those retained messages in the generated locale modules. Removing a rendered notice from source therefore does not necessarily remove its translations from the production bundle. This is catalog data maintenance; it must not change locale loading, mounted views, signing clients, or subscription ownership.

After removing or restoring translated source text, run a complete extraction from the current terminal source before cleaning catalogs:

```bash
pnpm --dir apps/terminal exec lingui extract --clean
pnpm --dir apps/terminal i18n:compile
```

The official [Lingui extraction documentation](https://lingui.dev/ref/cli#extract) defines `--clean` as removing obsolete messages while extraction merges existing translations. Do not delete `#~` entries manually before extraction: a message restored in source must first recover its existing translations. The pinned [Lingui 5.7.0 catalog implementation](https://github.com/lingui/js-lingui/blob/v5.7.0/packages/cli/src/api/catalog/getTranslationsForCatalog.ts) explains why retained obsolete entries affect compiled output.

Validate all six locales after cleaning: currently extracted IDs must be present, existing translations for retained and restored IDs must be unchanged, dynamic message descriptors must still be extracted, and compilation and locale-switch tests must pass. Only the complete production build determines budget acceptance; a standalone catalog gzip comparison is diagnostic and does not justify changing a baseline.

The 2026-09-09 diagnostic with Node 22.15.0 first compared the existing catalogs with an in-memory obsolete-only cleanup. The subsequent complete extraction preserved all 1,919 previously active source IDs and restored `Failed to load trades.` with its existing six translations, producing 1,920 active IDs per locale. Every retained translation was unchanged, including 81 descriptors from navigation, account-ledger, trade configuration, and order-confirmation helpers. No obsolete entries remained, and compilation succeeded. Minified standalone locale modules decreased by 58,436 gzip bytes in total (en 8,211; zh 9,697; hi 10,841; es 9,591; fr 9,612; ar 10,484). Catalog, reactive-presentation, locale-switch, and TWAP-label regression suites passed 79 tests across six files.

The subsequent complete `pnpm build`, with the fixed build identity and Node 22.15.0 used by this baseline, passed all budget and circular-import checks after the audit fixes. Client gzip total was 3,106,750 bytes: 47,957 below the existing 3,154,707-byte baseline and 57,957 below its 10,000-byte allowance. This is 59,174 bytes below the pre-fix 3,165,924-byte build. Trade static startup was 1,551,380 bytes; incremental mobile startup was 110,612 bytes; incremental desktop startup was 197,591 bytes. The complete build verified 378 client chunks. No baseline, allowance, startup threshold, or validation script was changed.

## Order queue rendering and deployment headroom

The September 12 deployment reported a `trade-terminal-page` chunk of 123,218
gzip bytes against the unchanged 123,207-byte ceiling. The preceding PR passed
its build matrix, so that result alone does not establish deployment headroom.

The bounded correction counts order queue statuses in one pass and shares the
header badge rendering. All six badges retain their count, order, translated
label and color. The outer ring keeps its priority: pending, then any warning
(confirming, unconfirmed, partial or canceled), then failed, then success.
Individual order items, removal timers, reconciliation and subscriptions retain
their existing ownership and behavior. This changes no system boundary.

Increasing the allowance or moving code into a different chunk solely to pass
the named budget would not establish a real reduction. A trial sharing margin
form JSX actually increased compressed size and was discarded; source line
count is not a substitute for measuring the complete production output.

Acceptance requires complete before/after production builds with fixed metadata
and both pairing flags enabled, budget-validator tests, typecheck, queue status
and dismissal tests, and translation reactivity tests. Exact outcomes belong in
the [deployment budget follow-up](work-memory/sessions/2026-09-12-deploy-bundle-margin.md);
local builds do not prove server deployment.

The fixed-input comparison reduced the trading page from 123,153 to 122,980
gzip bytes, leaving 227 bytes under the existing limit. The complete build passed
all budgets and checked 388 chunks for static cycles; the work record includes
both startup profiles and the verification scope.


## Startup path re-baseline of `trade-terminal-page` (2026-09-14)

The `claude/spa-mode` branch keeps the first real terminal render off React's
Suspense fallback throttle: the client runtime gate reads the loaded wallet
runtime through `useSyncExternalStore`, and the trade entry routes resolve every
lazy piece of the first render from `beforeLoad` (`lib/trade/trade-route-boot.ts`)
while the market catalog loads. The preload chain and its mobile-viewport check
live in the `trade-terminal-page` chunk, which reached 123,242 gzip bytes: 4,035
above the 119,207-byte baseline and 35 above the 4,000-byte allowance, of which
the realistic prerendered frame had already used 3,744 bytes. The baseline for
that named surface moved to 123,242 bytes; the allowance is unchanged, and no
other number or validation script changed.

Evidence: clean worktree build `GATU_RELEASE_ID=cloudfront-2026-09-14-p14 pnpm
build` with Node 22.13.0 and pnpm 10.21.0 (not the pinned CI Node 22.15.0;
compression variance stays inside the allowance), released as p14 with build
metadata commit `5b61a3c3` plus the then-uncommitted startup-path change. The
chunk-cycle check verified 390 client chunks with no circular static imports; no
separate route-only diagnostic was run. Client gzip total 3,065,681 bytes
(89,026 below baseline; largest chunk `index-Bs6QSD5q` 434,352). Static trade
startup: 74 assets from 6 route preloads, 1 runtime script and 3 semantic
entries, 1,558,084 bytes (12,137 below baseline). Mobile runtime increment: 11
assets / 111,624 bytes (+1,044), 85 startup assets / 1,669,708 bytes in total.
Desktop runtime increment: 25 assets / 196,958 bytes (+4,970), 99 startup assets
/ 1,755,042 bytes in total. Every other named surface stayed within its limit.
The measured boot effect is recorded in the task record (checkpoint 25) and
[ADR 0005](adr/0005-spa-static-shell.md) decision 14.
### Correction after the 2026-09-14 adversarial review

The paragraph above did not meet the re-baseline rules of this document: the
build ran on Node 22.13.0 instead of the pinned 22.15.0, the build identity was
not the final commit, and no route-only diagnostic was recorded. The baseline
value was kept, and the measurement was redone under the rules:

- Toolchain: Node 22.15.0 (nvm), pnpm 10.21.0. Command from the worktree root:
  `GATU_RELEASE_ID=cloudfront-2026-09-14-p18 pnpm build`, run on the working
  tree that became the review-fix commit recorded in the task record
  (checkpoint 28); the build metadata commit is that commit's parent
  `1c734761`. The same toolchain produced p17 one build earlier; p18 adds the
  snapshot-plus-delta accumulator for the compact market channels.
- Graph inventory: 391 client chunks, no circular static imports. Route-only
  diagnostic: the static trade startup closure is seeded by 6 route preloads,
  1 runtime script and 3 semantic entries (the budget script's startup line).
- `trade-terminal-page`: 123,761 gzip bytes against the 123,242-byte baseline
  (+519, allowance 4,000). The chunk grew because the runtime market-loading
  workspace now renders its frame labels through Lingui, while the preload
  chain moved out of the chunk into `preload-trade-terminal-surface.ts`.
- Client gzip total 3,070,454 bytes (84,253 below baseline). Static trade
  startup 74 assets / 1,561,249 bytes (8,972 below baseline). Mobile runtime
  increment 11 assets / 111,639 bytes (+1,059), 85 startup assets / 1,672,888
  bytes in total. Desktop runtime increment 25 assets / 196,984 bytes (+4,996),
  99 startup assets / 1,758,233 bytes in total. Every other named surface stayed
  within its limit.

### Second correction after the 2026-09-15 review

The 2026-09-14 correction still fell short of the rules: the build identity was
a parent commit plus uncommitted fixes, the build time was not fixed, and the
"route-only diagnostic" reported seed counts rather than bytes. The baseline
value stays at 123,242 bytes; this record is the compliant measurement.

- Commit `0f08462a` (`claude/spa-mode`, clean source tree; the only uncommitted
  file was this task's work record). Toolchain: Node 22.15.0 (nvm), pnpm
  10.21.0. Command from the worktree root:
  `GATU_RELEASE_ID=cloudfront-2026-09-15-p19 GATU_BUILD_TIME=2026-09-15T00:00:00.000Z pnpm build`,
  released as p19; `build-meta.json` names that commit, release and time.
- Graph inventory: 391 client chunks, no circular static imports, 392 graph
  assets (the content-hashed TradingView loader copy and `build-meta.json` are
  emitted outside `assets/` and are not chunks).
- Route-only diagnostic (`analyzeClientBundle().tradeRoutePreloadFiles` with
  `sizesByFile`): the 6 route preload files total 518,908 gzip bytes; the
  runtime entry script `index-Bv802odA.js` is 2,057 bytes; the 4 semantic
  entries (`client-root`, `trade-terminal-page`, `early-prefetch`,
  `preload-trade-terminal-surface`) total 135,051 bytes.
- `trade-terminal-page`: 123,804 gzip bytes against the 123,242-byte baseline
  (+562, allowance 4,000).
- Static trade startup: 75 assets / 1,562,860 bytes (7,361 below baseline; one
  asset more than p18 because the preload chain chunk is now a semantic root).
  Mobile runtime increment 11 assets / 111,640 bytes (+1,060), 86 startup assets
  / 1,674,500 bytes in total. Desktop runtime increment 25 assets / 196,992
  bytes (+5,004), 100 startup assets / 1,759,852 bytes in total.
- Client gzip total 3,070,775 bytes (83,932 below baseline; largest chunk
  `index-Bs6QSD5q-BqDTMEGU.js` 434,360). Every other named surface stayed
  within its limit; the budget script reported no violations.

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
