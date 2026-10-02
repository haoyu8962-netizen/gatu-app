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
   SAIRN_BUILD_SHA=e4e09966b175679ac7e13ea192246ce27fae15b5 \
   SAIRN_RELEASE_ID=startup-guardrail-baseline \
   SAIRN_BUILD_TIME=2026-08-27T00:00:00.000Z \
   NODE_ENV=production \
   pnpm --filter @sairn/terminal build
   ```

4. Run `pnpm --filter @sairn/terminal perf:startup` to write the exact `client-root` JavaScript closure report to `scripts/measure/out/client-root-deps.json`.
5. For browser measurements, serve the Nitro build on loopback and use a fresh anonymous session at `/trade/HYPE`. Keep Chrome, viewport, CPU, and network settings fixed, record five mobile and five desktop runs, and compare the median and worst result.

External Hyperliquid and TradingView traffic makes a single Lighthouse run unsuitable as a byte-exact CI gate. CI therefore blocks deterministic bundle regressions and relevant contract-test failures. Browser results remain required evidence for changes that claim a user-visible performance improvement.

## Startup models

The production build enforces three complementary models:

- Route preloads are the de-duplicated TanStack preload metadata for `__root__`, `/trade/$symbol`, and the optional `/trade` route. This direct-file list is retained as a diagnostic, but it is not a complete startup model.
- Static trade startup is one transitive Rollup closure seeded by those route preloads, the root runtime scripts, and the uniquely named `client-root` and `trade-terminal-page` chunks. JavaScript, Vite-imported CSS (including `?url` stylesheet assets), and their static edges are included; `import()` edges are deliberately excluded.
- Runtime startup adds the static closures reached by the root runtime entry and manually reviewed first-render or idle-preload source modules. Mobile and desktop are measured separately, and files already counted by static startup are removed from the runtime increment.

The client-only Vite hook records graph schema v3 at `apps/terminal/node_modules/.cache/sairn/client-chunk-graph.json`. It combines Rollup imports with Vite's imported CSS and asset metadata, and uses repository-relative module identifiers so runtime profiles follow source-module identity rather than unstable chunk hashes. It is diagnostic build metadata, not a deployable artifact.

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

## Trade route reveal waits for the first-render lazies (2026-09-17)

Measuring a warm third load of `app.gatu.ai/trade/HYPE` with a React commit hook showed the
`/trade` match suspended from 147 ms (fallback commit) until 447 ms although `router.load()` had
finished by about 221 ms: the retry render entered `TradeTerminalPage` while the panel, footer,
navigation and modal lazies were still resolving, so React applied its 300 ms fallback throttle.
[ADR 0012](adr/0012-trade-route-reveal-after-surface-preload.md) makes `bootTradeRoute` return a
promise that the route's `beforeLoad` awaits: the reveal now happens once every first-render lazy
has resolved (or after `TRADE_ROUTE_REVEAL_BUDGET_MS`), so the retry render commits without
suspending. Chunk boundaries, preload lists and budgets are unchanged; the measured before/after
timelines live in the [task record](work-memory/sessions/2026-09-17-trade-route-reveal.md).

Evidence: clean worktree build `SAIRN_RELEASE_ID=cloudfront-2026-09-14-p14 pnpm
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
  `SAIRN_RELEASE_ID=cloudfront-2026-09-14-p18 pnpm build`, run on the working
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
  `SAIRN_RELEASE_ID=cloudfront-2026-09-15-p19 SAIRN_BUILD_TIME=2026-09-15T00:00:00.000Z pnpm build`,
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

## Order-form dialogs leave `trade-terminal-page` (2026-09-18)

On `claude/surface-tokens-touch-feedback` the named surface reached 128,778 gzip bytes (pairing flags off; 128,807 with
them on), 5,536 above the 123,242-byte baseline and over the 4,000-byte allowance; `origin/main` (`3a80b360`) measured
127,085 in an isolated worktree. The growth was not a new feature: removing the early return from `MobileAccountView`
made it compilable by React Compiler (about 3.7 kB of memoization in the minified chunk), and the mobile order-book
header gained its chip row. The baseline is unchanged; the regression was removed instead.

- The margin-mode, leverage and account-mode dialogs of the order form load on first open
  (`components/trade/tradebox/lazy-trade-settings-modals.ts`, mounted through `components/ui/lazy-dialog-host.tsx`).
  They are warmed on intent, when the pointer enters the order form or a press or focus lands inside it, not at idle.
  A deterministic idle download would still be startup weight under the runtime-profile rule above, and counting the
  idle-warmed variant honestly put the desktop increment near 211.6 kB against its 201,988-byte limit with a larger
  combined total. No semantic root changed, because nothing new is fetched on a load without interaction.
- The Market Close submit host (`components/trade/components/position-market-close-submit-host-loader.ts`) follows the
  same rule: it is warmed when a pointer, press or focus reaches a positions surface, or when a Market Close session
  opens, never at mount or idle. Its first version loaded unconditionally after `GlobalModals` mounted, which was a
  deterministic download that the runtime profile did not count (about 4.3 kB gzip, reported by the 2026-09-24 review).
- These dialogs use `createRetryableLazyComponent`, never `createLazyComponent`: the latter answers a missing chunk with
  `window.location.reload()` on the next render, which would discard an unsent order draft. A failed import shows an
  error shell with Try again and an explicit Reload page; a failed warm-up is forgotten.
- Measurement (local, Node 22.15.0, pnpm 10.21.0, pairing flags off, working tree on top of `35146f69`, so this is a
  diagnostic record and not a re-baseline): `trade-terminal-page` 126,255 (-2,523); static trade startup 1,567,919
  (-4,108); mobile increment 112,456 and combined 1,680,375 (-4,115); desktop increment 199,118 (-1,624) and combined
  1,767,037 (-5,732); total client gzip 3,092,895 (+8,426, the cost of four more chunks; 61,812 below its baseline);
  401 chunks, no static cycles. Every budget passed.
- Browser evidence (production build through `scripts/serve-spa-static.mjs`, Playwright with a visible document): no
  dialog chunk is requested during 6 s (desktop) or 5 s (390 px) without interaction; the first pointer contact with the
  order form fetches them; the dialogs then open in 6-22 ms on desktop with their enter transition, and 123 ms after
  touch-down on the phone layout with the drawer slide and no loading shell. With the chunk removed from disk the click
  shows the loading shell, then the error shell, in the same document and with no repeated requests. Chromium does not
  refetch a module whose load failed in the same document, so Try again cannot recover a missing chunk there; Reload page
  is the recovery and stays the user's decision. Latency was local; a slow mobile network can show the loading shell on
  the first open.

## Privy React Auth 3.46.0 upgrade re-baseline (2026-10-02)

Upgrading `@privy-io/react-auth` from 3.32.2 to 3.46.0 (and `@privy-io/wagmi` to 4.0.17, whose code is unchanged) raised
the total client and the static trade startup beyond their 10,000-byte allowances. This is an intentional re-baseline
for a dependency upgrade the product owner requested; see [the upgrade plan](privy-upgrade-and-funding-plan.md) and the
correction section of [ADR 0026](adr/0026-privy-follows-theme-after-upgrade.md).

- Removed first: the `vendor-base-ui` manual chunk matched every `@base-ui` path, so Privy's own Base UI 1.8 copy, which
  only its lazily loaded fiat onramp screen uses, was pulled into trade startup next to the application's 1.3 copy. The
  manual chunk now takes only the application's copy (`isApplicationBaseUiModule` in `apps/terminal/vite.config.ts`), and
  Privy's copy stays in the lazy `FiatOnrampScreen` chunk. That removed about 40 kB of the startup increase.
- What remains is upstream: `@privy-io/js-sdk-core` 0.77.0 imports `libphonenumber-js/min` and its mobile example
  numbers statically (0.67.4 did not; before, the library only loaded with the lazy phone-login form), and the viem copy
  Privy bundles grew from 2.52.0 to 2.56.0. In raw rendered bytes of the startup closure: libphonenumber-js +351,428,
  viem +114,373, ox +33,846, `@privy-io/js-sdk-core` +29,229, `@privy-io/react-auth` +15,712. Privy's own main chunk
  shrank (435,007 → 409,991 gzip). Removing the remaining increase would mean patching Privy's import graph; it was not
  done.
- The application's viem 2.42.1 (about 1.39 MB raw in startup) and Privy's 2.56.0 (about 0.80 MB raw) are separate
  copies both before and after this change. Moving the application to Privy's viem version would remove one copy and
  more than offset this increase; it touches every signing path and was deliberately left out of this upgrade.
- Measurement: Node 22.15.0, pnpm 10.21.0, `pnpm install --frozen-lockfile`, pairing off, the same build identity for
  both sides (`SAIRN_BUILD_SHA=682430baffdc50cf62538795866ca5c70b9d16e0 SAIRN_RELEASE_ID=privy-346-rebaseline
  SAIRN_BUILD_TIME=2026-10-02T00:00:00.000Z NODE_ENV=production NITRO_PRESET=node-server VITE_MOBILE_PAIRING_ENABLED=false
  pnpm --filter @sairn/terminal build`), before = `origin/dev` at `682430ba` in an isolated worktree, after = the upgrade
  working tree.

| Metric | Before (`682430ba`) | After | Change |
| --- | ---: | ---: | ---: |
| Client assets (graph inventory) | 437 | 442 | +5 |
| All client JS + CSS | 3,191,737 | 3,275,424 | +83,687 |
| Route preloads only (diagnostic) | 515,950 | 515,884 | -66 |
| Static trade startup | 1,561,714 (102 assets) | 1,624,427 (101 assets) | +62,713 |
| Mobile runtime increment / combined | 117,460 / 1,679,174 | 117,413 / 1,741,840 | -47 / +62,666 |
| Desktop runtime increment / combined | 201,046 / 1,762,760 | 200,718 / 1,825,145 | -328 / +62,385 |
| `client-root` JS static closure | 1,203,943 (34 chunks) | 1,266,781 (33 chunks) | +62,838 |
| Largest JS chunk (Privy main) | 435,007 gzip / 1,538,745 raw | 409,991 gzip / 1,410,784 raw | -25,016 gzip |

The total-client baseline moved from 3,185,921 to 3,269,608 and the static trade startup baseline from 1,581,216 to
1,643,929 (each by the measured change); allowances, runtime profiles, named surfaces and the validation scripts are
unchanged. No static import cycle was reported. This is a byte measurement, not a browser timing; LCP and INP on the
heavier startup were not measured.

Correction (2026-10-02): both sides of this measurement read the developer `apps/terminal/.env.local` (the Privy app ID
and three CCTP flags, which every whole-object `import.meta.env` literal then carries). The change column compares like
with like, but CI builds without that file: a CI-equivalent build of the after side (`c0e550c7`) reads 3,274,893 total,
1,624,100 static startup, 117,422 mobile and 200,714 desktop (-531, -327, +9 and -4 against the table). Take future
re-baseline measurements in a checkout without `.env.local`.

## Card funding total-client re-baseline (2026-10-02)

Card funding ([ADR 0034](adr/0034-privy-card-funding.md)) first mounted its onramp host statically in `AppToaster`, which
put the desktop runtime increment at 202,247 bytes (over the 201,988-byte limit) and the total client 14,438 bytes over
its baseline. The host now loads lazily on the first purchase request (`PrivyFiatFundingHostGate`), which removed the
runtime overage. A later build of the method-chooser version left the desktop increment only 196 bytes under its limit;
the gate then stopped importing the notification copy for its single "could not open" message (the copy stays in the
lazy host chunk), which returned about 420 bytes to both runtime increments.

The remaining total growth was re-baselined, measured with the same fixed build identity, Node 22.15.0, pnpm 10.21.0 and
pairing off as the section above, but in isolated worktrees without `.env.local` so both sides match CI: before = the
upgrade commit `c0e550c7`, after = the card funding working tree with the method chooser and the review fixes.

| Metric | Before (`c0e550c7`) | After | Change |
| --- | ---: | ---: | ---: |
| All client JS + CSS | 3,274,893 | 3,286,669 | +11,776 |
| Static trade startup | 1,624,100 (101 assets) | 1,626,692 (102 assets) | +2,592 |
| Mobile runtime increment | 117,422 | 117,794 | +372 |
| Desktop runtime increment | 200,714 | 201,375 | +661 |

Per-asset gzip comparison: using `useFiatOnramp` makes Rollup split Privy's funding module out of its main chunk (76,156
new against 74,776 removed, +1,380 net; both chunks sit in the static trade startup closure); the six locale catalogs grow
by 2,024; the deposit dialog grows by 1,922 for the method chooser; the lazy host chunk is 1,346 and the domain module
chunk 676; the store joins the small shared chunk that held the deposit explorer link (601 against 492, which also renames
that chunk); the toaster gains the gate (+236); the router vendor chunk grows by 505 because Vite's preload dependency
lists name the new chunks; the shared icon chunk grows by 402; and 239 other chunks change by less than 60 bytes each
(+3,001 in total, mostly renamed imports). The desktop runtime +661 is the store chunk (+109), the gate (+236) and about
30 bytes in each of eleven desktop chunks that import the renamed shared chunk; the static startup +2,592 is the
funding-module split, the preload lists, the icon chunk and the stylesheet.

Only the total-client baseline moved: 3,269,608 + 11,776 = 3,281,384. This replaces the +9,725 raise of the first
version (an entry card inside the deposit form), which had been measured with `.env.local` on both sides. The desktop
runtime increment now sits 613 bytes under its 10,000-byte allowance (201,375 against 201,988), so the next first-render
addition on desktop needs its own reduction or review. Builds of the same source differ by a few hundred bytes
(renamed chunk imports), and a build that reads the developer `.env.local` is larger: 3,287,147 total and 1,627,062
static startup for the same after tree, while its runtime increments differ by 1 to 2 bytes.

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
