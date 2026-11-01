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

Validate every locale after cleaning: currently extracted IDs must be present, existing translations for retained and restored IDs must be unchanged, dynamic message descriptors must still be extracted, and compilation and locale-switch tests must pass. Only the complete production build determines budget acceptance; a standalone catalog gzip comparison is diagnostic and does not justify changing a baseline.

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
and three CCTP flags, which every whole-object `import.meta.env` literal then carries). CI builds without that file, so
both sides were measured again in isolated worktrees without it, with the same build identity, Node and pnpm versions:

| Metric | Before (`682430ba`) | After (`c0e550c7`) | Change |
| --- | ---: | ---: | ---: |
| All client JS + CSS | 3,190,861 | 3,274,893 | +84,032 |
| Static trade startup | 1,561,189 (102 assets) | 1,624,100 (101 assets) | +62,911 |
| Mobile runtime increment | 117,427 | 117,422 | -5 |
| Desktop runtime increment | 201,008 | 200,714 | -294 |

The changes agree with the table above within the build-to-build variation of a few hundred bytes (345 more in total,
198 more in static startup), so the baselines keep the smaller raises measured there. Take re-baseline measurements in
a checkout without local env files; `scripts/check-client-bundle-budget.mjs` now prints a note when one sits next to the
build it measures.

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
runtime increment then sat 613 bytes under its 10,000-byte allowance (201,375 against 201,988). Builds of the same
source differ by a few hundred bytes (renamed chunk imports), and a build that reads the developer `.env.local` is
larger: 3,287,147 total and 1,627,062 static startup for the same after tree, while its runtime increments differ by
1 to 2 bytes.

The purchase-host warm-up added later the same day keeps the dynamic import in the gate and only adds a flag to the
shared store, because a separate loader module moved the import's chunk list into the small shared chunk and cost about
420 bytes in both runtime increments. A CI-equivalent build with the warm-up reads 3,287,254 total, 1,626,872 static
startup, 117,887 mobile and 201,548 desktop: +93 mobile and +173 desktop against the table, with no baseline change.
After the review fixes (the gate compares the attempt's owner and network with the current identity before it reports a
load failure) the same kind of build reads 3,286,913 total, 1,626,723 static startup, 117,968 mobile and 201,590
desktop. The desktop runtime increment then sat 398 bytes under its allowance.

The second and third review rounds (2026-10-02) changed where this code lives. The standard Sonner notices became an
identity-checked notice card; the host's dynamic import, with its "could not open" notice, moved from the gate to the
side that starts the purchase (the deposit dialog's chunk), so the gate only renders the loaded host and the shared
store no longer carries a warm-up flag; and the store now keeps the purchase results and the claim that an attempt was
started, so a host that mounts again neither repeats the purchase nor loses a result. The earlier objection to a loader
module does not apply to this arrangement: that module was shared by the gate, which pulled the import's chunk list
into runtime startup, while the import now has no importer in runtime startup. CI-equivalent builds from isolated
checkouts of the three commits:

| Metric | Round one (`eec28ce2`) | Round two (`9f41ae9d`) | Round three (`566713d3`) |
| --- | ---: | ---: | ---: |
| All client JS + CSS | 3,286,913 | 3,289,266 | 3,290,045 |
| Static trade startup | 1,626,723 | 1,626,847 | 1,626,771 |
| Mobile runtime increment | 117,968 | 117,667 | 117,769 |
| Desktop runtime increment | 201,590 | 201,301 | 201,405 |

Per-asset gzip comparison, round one to round two: the deposit dialog chunk grows by 2,332 (the notice card, its
publisher and presentation, the launch function and the card funding domain module); that domain module's own 669-byte
chunk disappears; the toaster chunk shrinks by 257 because the gate lost its import, identity check and message; the six
catalogs grow by 225 for the sandbox notice; the lazy host chunk grows by 165; and the router vendor chunk grows for the
preload lists. Round two to round three: the deposit dialog chunk grows by 541 (the destination hook, the front-toast
hook and the timing in the notice publisher), the store chunk by 105 (results and the started claim, in both runtime
increments), and 251 other chunks change by less than 60 bytes each (+133 in total).

Builds of the working tree just before each of the last two commits read 3,289,035 and 3,289,465, a few hundred bytes
under the builds of the commits themselves, although the sources are identical; the per-asset difference is spread over
the chunks that import a renamed chunk. Treat totals as reproducible to within about 600 bytes, and take re-baseline
measurements from checkouts of commits.

After round three the total-client baseline followed the feature's measured size against the upgrade commit:
3,290,045 - 3,274,893 = 15,152, so it was 3,269,608 + 15,152 = 3,284,760, replacing the 3,281,384 above, and the
desktop runtime increment sat 583 bytes under its allowance (201,405 against 201,988).

The fourth review round (commit `e257426d`) made the host read Privy's window state (`useModalStatus`) next to
`useFiatOnramp`, so that the purchase entry is released when the window closes. That changed the chunk graph: the lazy
host now imports Privy's main chunk directly, and Rollup no longer splits Privy's funding module into a chunk of its
own. CI-equivalent builds from isolated checkouts (the upgrade commit was built again and read the same as before):

| Metric | Upgrade (`c0e550c7`) | Round three (`566713d3`) | Round four (`e257426d`) |
| --- | ---: | ---: | ---: |
| All client JS + CSS | 3,274,893 | 3,290,045 | 3,286,456 |
| Static trade startup | 1,624,100 (101 assets) | 1,626,771 (102 assets) | 1,626,601 (101 assets) |
| Mobile runtime increment | 117,422 | 117,769 | 117,722 |
| Desktop runtime increment | 200,714 | 201,405 | 201,037 |

Round three to round four, per asset: Privy's main chunk grows by 76,285 and the 76,156-byte funding chunk disappears
(+129 net); the six catalogs grow by 160 and the lazy host chunk by 89 for the new notices and the window check; 254
other chunks shrink by 3,967 in total, of which the 104 that imported the separate funding chunk no longer do. The
whole feature against the upgrade, per asset (measured against `26a999aa`, the upgrade branch tip with the same client
source, which reads 3,275,004; its 111-byte difference from `c0e550c7` is spread over 229 chunks, none by 60 bytes): the
deposit dialog chunk +4,800, the six catalogs +2,409, the lazy host chunk 1,705, Privy's main chunk +1,522 (the funding
exports the host uses are no longer dropped), the store chunk 750 against the 491-byte shared chunk it replaces, the
router vendor chunk +468, the icon vendor chunk +402, and 232 other chunks -113 in total.

The total-client baseline therefore becomes 3,269,608 + (3,286,456 - 3,274,893 = 11,563) = 3,281,171, replacing
3,284,760. The other baselines are unchanged. The desktop runtime increment now sits 951 bytes under its allowance
(201,037 against 201,988), so the next first-render addition on desktop still needs its own reduction or review.

The fifth review round (commit `108dfe7f`) added one line to the Sonner patch, one statement to the Privy patch and a
small function to the card funding store. Its CI-equivalent build reads 3,286,622 in total (+166), 1,626,753 for the
static trade startup (+152), 117,766 for the mobile and 201,067 for the desktop runtime increment (+44 and +30); 261
chunks change, none by 60 bytes. The baselines stay where they are: the total sits 5,451 bytes above its baseline
against an allowance of 10,000, and the desktop runtime increment 921 bytes under its allowance.

The sixth round (commit `4af147fd`) changed one classification function in the deposit dialog chunk. Its build reads
3,286,638 in total (+16), 1,626,663 static trade startup, 117,769 mobile and 201,070 desktop, with the desktop runtime
increment 918 bytes under its allowance. Later commits on the branch change tests and documents only.

## Second audit batch route-surface re-baseline (2026-11-01)

The second batch of confirmed audit fixes (`claude/audit-group2`, stacked on the branch of
[PR #131](https://github.com/zora4523-bot/gatu-app/pull/131) at `d8a2acf5`) carries the unpriced-balance and
order-book click fixes and the eight decisions taken after the 2026-10-30 feature audit: one size unit and full
numbers in the order book ([ADR 0046](adr/0046-one-size-unit-for-order-entry-and-order-book.md)), no local market
statistics snapshot ([ADR 0047](adr/0047-no-local-market-stats-snapshot.md)), the market selector priced from the
live mid, the official spot display names and addresses
([ADR 0048](adr/0048-official-spot-display-names-and-addresses.md)), silent passive data on Staking, Referrals and
Vaults, and the phone fills filter backfill ([task record](work-memory/sessions/2026-11-01-audit-group2.md)). Its
production build failed only two named route surfaces, `trade-terminal-page` and `vaults-page`; PR #131 itself passed
its pairing-off CI build.

Both trees were built one after another in their own worktree without `.env.local`, with Node 22.15.0, pnpm 10.21.0,
`NITRO_PRESET=node-server`, `VITE_MOBILE_PAIRING_ENABLED=false` and the fixed identity of the reproduction protocol
(`SAIRN_BUILD_SHA=e4e09966b175679ac7e13ea192246ce27fae15b5 SAIRN_RELEASE_ID=startup-guardrail-baseline
SAIRN_BUILD_TIME=2026-08-27T00:00:00.000Z NODE_ENV=production pnpm --filter @sairn/terminal build`). The branch side is
`a9973c83` (fix(vaults): retry kept data inside the dialog and gate search results), the code measured when the
baselines were raised.

| Metric | PR #131 `d8a2acf5` | branch `a9973c83` | Change |
| --- | ---: | ---: | ---: |
| All client JS + CSS | 3,366,511 (449 assets) | 3,372,763 (451 assets) | +6,252 |
| Route preloads only (6 files, diagnostic) | 522,195 | 522,726 | +531 |
| Static trade startup (103 assets) | 1,648,090 | 1,651,527 | +3,437 |
| Mobile runtime increment (15 assets) | 118,352 | 119,780 | +1,428 |
| Desktop runtime increment (30 assets) | 202,775 | 204,609 | +1,834 |
| Mobile static + runtime (118 assets) | 1,766,442 | 1,771,307 | +4,865 |
| Desktop static + runtime (133 assets) | 1,850,865 | 1,856,136 | +5,271 |
| `trade-terminal-page` | 126,884 | 127,646 | +762 |
| `vaults-page` | 29,849 | 30,550 | +701 |

Per-asset comparison, grouped by chunk name without its content hash (270 assets change):

- `trade-terminal-page` +762: the order-book unit request and the shared book-price click
  (`use-book-size-mode-request`, `use-book-price-selection`), compact-book size fitting, the phone split book's unit
  menu and the spot address redirect.
- `vaults-page` +701, `referrals-page` +606 and `staking` −201, with two new shared chunks
  `use-data-received-since-mount` (+246) and `passive-query-state` (+186): the silent passive-data states and the Vault
  dialog's data Retry.
- `token-selector-popup` +1,428: the selector priced from the live mid (`selector-quote`) and its row changes.
- `fill-direction` +1,364 and `tradeHistory._address` −908: the phone fills tab now imports the `userFills` snapshot
  hook, so Rollup moves `use-trade-history` and `trade-history` out of the history page into a chunk both share (+456
  together); `use-account-abstraction-control` +766 gains the fills filter presentation and the changed phone tabs.
- `vendor-tanstack-router` +530: the official display-name table (`config/spot-token-display-names.ts`) and the
  English messages compiled beside the router; `orderbook-panel` +447: the desktop control row and its unit menu;
  `global-settings-modal` −107: the removed order-book unit setting.
- The other 257 assets change by less than 100 bytes each, +432 together, mostly the six lazy catalogs and renamed
  imports.
- No dependency changed: `pnpm-lock.yaml` and every `package.json` are identical to `d8a2acf5`.

The `trade-terminal-page` baseline is raised by the measured +762 to 124,004 and the `vaults-page` baseline by +701 to
27,776; their allowances are unchanged, so both keep the room PR #131 left them (358 and 226 bytes). The total-client,
static-startup and runtime baselines are unchanged; against them the branch reads +6,562 (3,438 left), +7,598 (2,402
left), mobile +9,200 (800 left) and desktop +1,926 (8,074 left). The mobile runtime increment is now the closest to its
allowance, and its next growth needs its own measured re-baseline.

A later commit on the branch, `9839c340` (fix(vaults): offer the dialog retry when a detail refresh fails), changes
production code in `vaults-page` again, so the table describes `a9973c83` only. The CI-metadata builds that followed
(`SAIRN_BUILD_SHA` set to the commit, `SAIRN_RELEASE_ID=ci-99999999999-1`, otherwise the same settings) passed every
budget: `1c5c2b1f` before that commit and `da80d4b2` after it, the latter with `trade-terminal-page` at 127,640 (364
left), `vaults-page` at 30,521 (255 left), the total at +6,756 (3,244 left), the static trade startup at +7,604 (2,396
left) and the mobile runtime increment at +9,206 (794 left).

## Audit fixes total-client re-baseline (2026-10-31)

The P1 and P2 fixes of the 2026-10-30 feature audit go to `dev` as one integration pull request
(`claude/p2-integration`): the six P1 branches of [PR #123](https://github.com/zora4523-bot/gatu-app/pull/123) to
[#128](https://github.com/zora4523-bot/gatu-app/pull/128), the close-all fixture fix that #124 does not carry yet, and
five P2 branches. Each P1 pull request passed its own pairing-off CI build, +874 to +3,096 gzip bytes over the
3,350,598 that `dev` `d99c2bc9` read with CI metadata (+10,225 together), so merged one by one the later ones would
have run out of the shared allowance. The CI-metadata build of the integration read 3,366,306 (+15,813 over the
baseline) and failed only the total-client budget.

The three trees were built one after another in their own worktree without `.env.local`, with Node 22.15.0, pnpm
10.21.0, the fixed identity of the reproduction protocol, `NITRO_PRESET=node-server` and
`VITE_MOBILE_PAIRING_ENABLED=false`. The middle column is the P1 integration `329f241d` (`dev`, the six P1 branches and
the fixture fix) that the P2 branches start from:

| Metric | dev `d99c2bc9` | P1 integration `329f241d` | integration `a5aa0d7f` | Change |
| --- | ---: | ---: | ---: | ---: |
| All client JS + CSS | 3,350,856 (443 chunks) | 3,359,216 (443 chunks) | 3,366,564 (447 chunks) | +15,708 |
| Static trade startup | 1,640,991 (101 assets) | 1,643,452 (101 assets) | 1,647,568 (103 assets) | +6,577 |
| Mobile runtime increment | 118,317 | 118,326 | 118,385 | +68 |
| Desktop runtime increment | 202,665 | 201,716 | 202,756 | +91 |

The P1 half adds +8,360 (static trade startup +2,461, mobile runtime +9, desktop runtime −949); its six CI builds
had added up to +10,225 against the CI build of `dev`. The P2 half adds +7,348 (static trade startup +4,116, mobile
runtime +59, desktop runtime +1,040).

Per-asset comparison of `dev` and the integration, grouped by chunk name without its content hash:

- The six lazy catalogs grow by 4,246 for the new and changed messages; a viewer loads one of them.
- The English catalog is compiled into `vendor-tanstack-router` together with the other modules Rollup groups beside
  the router (228 application and `hl-react` modules, the exchange client among them). That chunk grows by 1,541: the
  English messages, the changed exchange modules it holds and the one module it gains, the exchange server clock of
  the L1 action expiry ([ADR 0045](adr/0045-l1-action-expiry.md)).
- The other chunks add +9,921: 44 chunks that change by 100 bytes or more carry +8,627, and 230 smaller changes,
  mostly renamed imports, +1,294. Rollup regroups shared modules when their importers change, so some chunks
  disappear or shrink while a neighbour grows by a similar amount: `use-funds-action-availability` (−1,685) and
  `funds-execution-guard` (+1,488),
  `action-error` (−1,067) and the new `exchange-error-text` (+1,288), `trading-toolbar-metrics` (−914) and the new
  `open-orders` (+900), `funding-history` with `account-history` (−796) and the new `funding-position` (+811). The
  fixes themselves show in the chunks of the order submission feedback (+1,246), Send (+1,006), the history CSV export
  (+843), the trade page (+761), the account ledger (+746), the vault page (+646) and the order list (+466).
- No dependency changed: `pnpm-lock.yaml` and every `package.json` are identical to `dev`.

The total-client baseline is raised by the measured +15,708 to 3,366,201; the +363 that `dev` had already used stays
counted, so the integration reads +363 against the new baseline (its CI-metadata build +105). The startup baselines
are unchanged: the static trade startup is 3,639 over its baseline (6,361 left), the desktop runtime increment 73 over
(9,927 left) and the mobile one 7,805 over (2,195 left). Two route surfaces are now close to their allowances, and the
next growth there needs its own measured re-baseline: `trade-terminal-page` at 126,853 (389 bytes left, +761 here)
and `vaults-page` at 29,849 (226 left, +646 here, all from the vault fixes of #125).

## Japanese catalog total-client re-baseline (2026-10-28)

Adding Japanese as a seventh interface language (`claude/japanese-locale`, base `f7423d70`) adds one lazy catalog
chunk, and the production build failed only the total-client budget. Both sides were built in their own worktree
without `.env.local`, with Node 22.15.0, pnpm 10.21.0 and the fixed identity of the reproduction protocol plus
`VITE_MOBILE_PAIRING_ENABLED=false`:

| Metric | dev `f7423d70` | Japanese branch | Change |
| --- | ---: | ---: | ---: |
| All client JS + CSS | 3,311,897 (442 chunks) | 3,350,633 (443 chunks) | +38,736 |
| Static trade startup | 1,640,608 | 1,640,798 | +190 |
| Mobile runtime increment | 118,318 | 118,322 | +4 |
| Desktop runtime increment | 202,664 | 202,668 | +4 |

The new `messages-*.js` chunk for `ja` is 38,653 gzip bytes (148,235 raw), in the range of the other non-English
catalogs (33,249 to 45,941), and a viewer downloads only the catalog of the active language. The startup increase is
the language table entry and the Japanese bootstrap error copy. The total-client baseline is raised by the measured
+38,736 to 3,350,493; the +140 that dev had already used stays counted, so the branch reads +140 against the new
baseline. The startup baselines are unchanged.

## Total-client and desktop runtime re-baseline before release p32 (2026-10-13)

Promoting `dev` to `main` for release p32 ([PR #112](https://github.com/zora4523-bot/gatu-app/pull/112), head
`f50e21a8` after [PR #109](https://github.com/zora4523-bot/gatu-app/pull/109)) failed the pairing-on production build
that only pull requests into `main` run: CI read 3,314,639 gzip bytes with CI metadata, 10,160 over the 3,304,479
baseline against a 10,000-byte allowance, while the pairing-off build of the same head read 3,311,212 (+6,733) and
passed. No chunk split or other artefact was involved: the growth is the sum of what `dev` merged since p30 under
the pairing-off allowance ([PR #101](https://github.com/zora4523-bot/gatu-app/pull/101) version entry,
[#102](https://github.com/zora4523-bot/gatu-app/pull/102) slider basis freeze,
[#107](https://github.com/zora4523-bot/gatu-app/pull/107) ADR 0041 automatic unified account,
[#108](https://github.com/zora4523-bot/gatu-app/pull/108) and #109 production audit fixes), plus the ~2.5–3.4 KB the
pairing dialog adds with the flag on.

Measured in the release worktree `gatu-release-p32` (no `.env.local`, Node 22.15.0, pnpm 10.21.0) with the fixed
identity `SAIRN_BUILD_SHA=f50e21a83245a00a372dde8ca405d847089273d9 SAIRN_RELEASE_ID=p32-rebaseline
SAIRN_BUILD_TIME=2026-10-13T00:00:00.000Z NODE_ENV=production NITRO_PRESET=node-server VITE_HYPERLIQUID_TESTNET=`:

| Metric | pairing off (`VITE_MOBILE_PAIRING_ENABLED=false`) | pairing on (`=true`) |
| --- | ---: | ---: |
| All client JS + CSS | 3,311,757 (442 chunks) | 3,314,259 (443 chunks) |
| Static trade startup | 1,640,513 (101 assets) | 1,641,561 (101 assets) |
| Mobile runtime increment | 118,314 | 118,311 |
| Desktop runtime increment | 202,683 | 202,623 |
| `api-wallet` chunk | 18,282 | 18,165 |

The total-client baseline becomes the pairing-off build, 3,311,757 (+7,278 over the p30 baseline); the pairing-on
build sits +2,502 over it, so the promotion build fits again. CI's own readings of the same head were 545 (pairing
off) and 380 (pairing on) below the local fixed-identity figures.

The desktop runtime increment is re-baselined at the same time to 202,683 (+9,554 over the 193,129 of 2026-10-03,
483 bytes under the allowance in CI), as the p30 note required for the next desktop growth; it accumulated across
the card-funding host, ADR 0038–0041 and the audit fixes, each merged under the allowance. The mobile runtime
increment (118,314, +7,734 over 110,580) is not re-baselined; it has 2,266 bytes of headroom.

A measurement pitfall recorded for the next time: leaving `VITE_MOBILE_PAIRING_ENABLED` unset is not a pairing-off
build. `mobile-pairing-flags.ts` tests `=== "true"`, and with the variable unset Vite keeps the lookup as a runtime
expression instead of folding it to `false`, so the pairing modules stay in the graph as a lazy `mobile-pairing-*.js`
chunk: such a build read 3,315,616 with 444 chunks, larger than both real states. Pass `false` explicitly, as the CI
matrix does.

## Total-client re-baseline and pairing-chunk fix before release p30 (2026-10-11)

Promoting `dev` to `main` for release p30 failed the pairing-on production build that only pull requests into `main`
run, twice: at `a310ade1` (after [PR #94](https://github.com/zora4523-bot/gatu-app/pull/94), Link mobile device
fixes) and at `ee4aab99` (after [PR #97](https://github.com/zora4523-bot/gatu-app/pull/97), automatic email
deposits). The second run read 3,307,744 gzip bytes with CI metadata, 10,645 over the 3,297,099 baseline against a
10,000-byte allowance, and `expected one client chunk api-wallet-*.js but found 2`. The pairing-off builds of the same
heads stayed under the allowance (CI read 3,304,745, +7,646, for `525f38c0`).

The second chunk is a sharing artefact, not a regression: `mobile-agent-sync-modal.tsx` (ADR 0039, pairing builds
only) imports `isApiWalletExtraAgentSnapshot` from `components/api-wallet/api-wallet-state.ts`, so with pairing on
Rollup hoists that module into a chunk shared with the API wallet route and names it after the module, which the
`api-wallet-*.js` surface glob then counts twice. The guard and the `ExtraAgent` type now live in
`lib/hyperliquid/extra-agent-snapshot.ts` (re-exported by `api-wallet-state.ts` for its existing importers); the
shared chunk is `extra-agent-snapshot-*.js` and the API wallet route is one chunk again (18,255 gzip with pairing on).

Measured in one isolated worktree (`.claude/worktrees/budget-fix`, no `.env.local`, Node 22.15.0, pnpm 10.21.0)
with the fixed identity `SAIRN_BUILD_SHA=ee4aab996ad57712063405351005ce0bf620da65 SAIRN_RELEASE_ID=p30-rebaseline
SAIRN_BUILD_TIME=2026-10-11T00:00:00.000Z NODE_ENV=production NITRO_PRESET=node-server`, both with the chunk move:

| Metric | pairing off | pairing on |
| --- | ---: | ---: |
| All client JS + CSS | 3,304,479 | 3,307,606 |
| Static trade startup | 1,635,287 (100 assets) | 1,636,516 (100 assets) |
| Mobile runtime increment | 118,415 | 118,419 |
| Desktop runtime increment | 202,442 | 202,406 |
| `api-wallet` chunk | 18,365 | 18,255 |

The total-client baseline becomes the pairing-off build, 3,304,479: +7,380 over the previous baseline, which is what
`dev` had used since p26 across PR #91 (unnamed default Agent), #92 (single-shell deposit dialog and official
scrims), #94 and #97, each merged with a pairing-off CI build under the allowance. The pairing-on build sits +3,127
over the new baseline, so the promotion build fits again; the pairing-off build in the sandbox stopped at the
prerender step (the sandbox refuses to bind the preview port) and its figures come from running the budget script on
its finished client assets, which the prerender does not change; the pairing-on build ran to completion.

Not re-baselined: the desktop runtime increment is 9,313 over its 193,129 baseline (687 under the allowance; 9,277
with pairing on) and the mobile runtime increment 7,835 over 110,580. Both grew by under 100 bytes since p26; the
next desktop runtime growth still needs its own measured re-baseline rather than a larger allowance.

## Total-client re-baseline before release p26 (2026-10-08)

Promoting `dev` to `main` for release p26 failed the pairing-on production build that only pull requests into `main`
run: the total client measured 3,298,948 gzip bytes with CI metadata, 11,297 over the 3,287,651 baseline against a
10,000-byte allowance, while the pairing-off builds of the same head read 3,297,05x in CI and stayed 55 bytes under
the limit only when no developer `.env.local` was read. Nothing in the head is a regression to remove: the growth is
the shipped p24b tree plus [PR #77](https://github.com/zora4523-bot/gatu-app/pull/77) (chart price precision from
market rules, ADR 0035, and silent email wallet creation, ADR 0033), both merged with pairing-off CI builds under
the allowance; the loader patch of [PR #81](https://github.com/zora4523-bot/gatu-app/pull/81) touches only
`public/charting_library/`, which the budget does not count.

Measured in one isolated worktree (`gatu-release-p26`, no `.env.local`, Node 22.15.0, pnpm 10.21.0, pairing off) with
the fixed identity `SAIRN_BUILD_SHA=54235298e5db2dc32eadfa7f824b8660a54c06f0 SAIRN_RELEASE_ID=p26-rebaseline
SAIRN_BUILD_TIME=2026-10-08T00:00:00.000Z NODE_ENV=production NITRO_PRESET=node-server` for all three commits:

| Metric | p24b main `6da4c15a` | dev after #77 `345a2143` | dev after #81 `54235298` |
| --- | ---: | ---: | ---: |
| All client JS + CSS | 3,294,335 | 3,296,905 | 3,296,759 |
| Static trade startup | 1,630,085 (101 assets) | 1,631,938 (101 assets) | 1,631,834 (101 assets) |
| Mobile runtime increment | 118,027 | 118,315 | 118,319 |
| Desktop runtime increment | 202,265 | 202,745 | 202,722 |

The total-client baseline becomes the dev head itself, 3,296,759: +6,684 that p24b had already used against the
previous baseline and +2,570 for PR #77 (the price-format module and its callers, the email embedded wallet provider
and the registration sequence; the static startup +1,853, the desktop runtime +480, the mobile runtime +288 all stay
under their allowances). PR #81 reads -146, build noise of the kind the card funding section describes. With this
baseline the pairing-on CI build of the same head sits about 2,200 over (3,298,948 with CI metadata), a release build
that reads the developer `.env.local` about 950 over (3,297,706), and the pairing-off CI build about 300 over.

Not re-baselined: the desktop runtime increment is 9,593 over its 193,129 baseline (407 bytes under the allowance;
the pairing-on CI build read 9,596) and the mobile runtime increment 7,739 over 110,580. Both already stood at 9,136
and 7,447 at p24b, so the next desktop runtime growth needs its own measured re-baseline rather than a larger
allowance; nothing in this release changes those increments by more than the figures above.

## Locale and number-format desktop runtime re-baseline (2026-10-03)

PR #71 makes the desktop footer clock keep time and rendered numbers and dates follow the number-format setting and the
interface language: components take their number formatters from `useNumberFormat()`
([ADR 0036](adr/0036-render-time-number-formatters.md)), pass exact decimal strings through `formatDecimalString`
([ADR 0037](adr/0037-exact-decimal-display-separators.md)) and pass the active locale to every date and list formatter
([i18n presentation](i18n-presentation.md)). React Compiler adds those formatters and the locale to the cache guards of
each affected component, so the cost is spread over many compiled components, including the positions panels, history
tabs, order form and order book in the desktop runtime profile. Before merging the current `dev`, the PR had raised the
total-client baseline by its measured increments (+4,671, +417 and +1,392) and the desktop runtime baseline by +205; the
comments in `scripts/check-client-bundle-budget.mjs` and the
[integration record](work-memory/sessions/2026-10-02-integrate-locale-number-format.md) describe those raises.

After `dev` gained the Privy 3.46.0 upgrade and card funding (`a0c05740`), the CI build of the merged PR head
`fc5e10cd` (Production Builds run 37098384469, pairing off) read a desktop runtime increment of 202,249 bytes, 56 over
its 202,193-byte limit. A local build of the same code with CI-style metadata had read 202,193, exactly at the limit;
for the previous head the local reading had been 37 bytes above CI, so local readings within about 100 bytes of a limit
do not predict CI.

Per asset, the desktop runtime growth below is spread over 23 of its 29 assets and no asset was added or removed: the
footer bar, whose clock now ticks every minute and pauses while hidden (+348), the toaster (+134), the token selector
(+111), the positions, funding, history and order history tabs (+100, +80, +59, +47), the trade panel (+91), the order
book (+76), the account panel (+39), the chart (+29) and 12 assets by 5 bytes or less. That is the intended cost of
these changes rather than an accidental import, so it was re-baselined instead of removed.

Measurement: Node 22.15.0, pnpm 10.21.0, an isolated worktree per side with `pnpm install --frozen-lockfile
--prefer-offline` and no `.env.local`, pairing off and the fixed build identity of the reproduction protocol
(`SAIRN_BUILD_SHA=e4e09966b175679ac7e13ea192246ce27fae15b5 SAIRN_RELEASE_ID=startup-guardrail-baseline
SAIRN_BUILD_TIME=2026-08-27T00:00:00.000Z NODE_ENV=production NITRO_PRESET=node-server VITE_MOBILE_PAIRING_ENABLED=false
pnpm --filter @sairn/terminal build`, then `perf:startup`); before = `origin/dev` at `a0c05740`, after = `fc5e10cd`.

| Metric | Before (`a0c05740`) | After (`fc5e10cd`) | Change |
| --- | ---: | ---: | ---: |
| Client assets (graph inventory) | 443 | 443 | 0 |
| All client JS + CSS | 3,286,211 | 3,293,592 | +7,381 |
| Route preloads only (diagnostic) | 516,785 | 516,777 | -8 |
| Static trade startup | 1,626,618 (101 assets) | 1,629,887 (101 assets) | +3,269 |
| Mobile runtime increment / combined | 117,763 / 1,744,381 | 118,017 / 1,747,904 | +254 / +3,523 |
| Desktop runtime increment / combined | 201,032 / 1,827,650 | 202,173 / 1,832,060 | +1,141 / +4,410 |
| Largest JS chunk (Privy main) | 411,540 gzip / 1,414,905 raw | 411,532 gzip / 1,414,905 raw | -8 gzip |

The desktop runtime increment baseline becomes dev's 191,988 plus the measured change, 193,129, replacing 192,193 (which
already contained +205 of the same change). As for the total client, the allowance dev had already used stays counted, so
the PR head now sits where dev sat: 956 bytes under the allowance in the fixed-metadata build and 880 bytes under it for
the CI reading of 202,249. The other baselines are unchanged: CI read 3,294,239 in total (+6,588 against an allowance of
10,000), 1,629,984 for the static trade startup (below its baseline) and 118,021 for the mobile runtime increment
(+7,441). Both builds passed the circular-import check and `perf:startup`, and the graph inventory is unchanged at 443
assets (441 JavaScript, 2 CSS). This is a byte measurement, not a browser timing.

## Funds dialog total-client re-baseline (2026-10-05)

The funds dialog rework (shared `FundsModalShell` for the Deposit / Withdraw / Bridge dialog and its chunk fallback, the
CCTP minimum with its typed error, the address-and-network notice, the sticky form headings and the back button
renderer; [task records](work-memory/sessions/2026-10-05-funds-dialog-status-screens.md)) left the total client within
its allowance in every local build, but too close to predict CI. Seven CI-style builds of `dev` and of branch commits,
each with its own commit hash and release label and otherwise identical settings, read between 3,297,060 and 3,297,604
against the 3,297,651 limit, and two commits with nearly identical code differed by 522 bytes. Those builds cannot
attribute a change; the paired fixed-metadata builds below can.

Measurement: Node 22.15.0, pnpm 10.21.0, an isolated worktree per side with `pnpm install --frozen-lockfile
--prefer-offline` and no `.env.local`, pairing off and the fixed build identity of the reproduction protocol
(`SAIRN_BUILD_SHA=e4e09966b175679ac7e13ea192246ce27fae15b5 SAIRN_RELEASE_ID=startup-guardrail-baseline
SAIRN_BUILD_TIME=2026-08-27T00:00:00.000Z NODE_ENV=production NITRO_PRESET=node-server VITE_MOBILE_PAIRING_ENABLED=false
pnpm --filter @sairn/terminal build`, then `perf:startup`); before = `origin/dev` at `345a2143`, after = `f9bae822`.

| Metric | Before (`345a2143`) | After (`f9bae822`) | Change |
| --- | ---: | ---: | ---: |
| Client assets (graph inventory) | 443 | 443 | 0 |
| All client JS + CSS | 3,296,988 | 3,297,328 | +340 |
| Route preloads only (diagnostic) | 516,962 | 516,856 | -106 |
| Static trade startup | 1,632,044 (101 assets) | 1,632,656 (101 assets) | +612 |
| Mobile runtime increment / combined | 118,328 / 1,750,372 | 118,515 / 1,751,171 | +187 / +799 |
| Desktop runtime increment / combined | 202,740 / 1,834,784 | 202,445 / 1,835,101 | -295 / +317 |
| `client-root` static closure (`perf:startup`) | 1,270,395 (33 chunks) | 1,271,088 (33 chunks) | +693 |
| Largest JS chunk (Privy main) | 411,575 gzip / 1,415,014 raw | 411,600 gzip / 1,415,014 raw | +25 gzip |

Per asset, with content hashes stripped from the names: the shared deposit chunk is renamed from `use-deposit` to
`use-cctp-deposit-fee` and grows by 195 (the minimum search and the fee review); `funds-modal-shell` is a new 1,365-byte
chunk in both runtime profiles (the mobile one counts 15 assets instead of 14); `use-cctp-deposit-tracking` grows by
508; the six catalogs grow by 328 for the notice; `global-modals` shrinks by 1,187 because the six-block skeleton
fallback is gone; the 3,554-byte `skeleton` chunk disappears from the desktop runtime profile and `account-panel` grows
by 3,225;
`api-wallet`, the funding tab, the vaults page, the stylesheet and the referrals page shrink by 97 to 227 each; and 406
other assets change by 9 bytes or less (+184 in total), mostly for renamed imports. Two assets were added and two
removed. That is the cost of the rework rather than an accidental import, so it was re-baselined instead of removed.

The total-client baseline becomes 3,287,651 + 340 = 3,287,991. The allowance `dev` had already used stays counted: the
fixed-metadata build of the head reads +9,337 against the new baseline, where `dev` read +9,337 against the old one,
663 bytes under the allowance. The other baselines are unchanged: the static trade startup stays below its baseline,
the mobile runtime increment reads +7,935 of its 10,000 and the desktop runtime increment +9,316, which is 295 bytes
better than `dev`. Both builds passed the circular-import check and `perf:startup`. This is a byte measurement, not a
browser timing, and it does not make the remaining headroom larger than `dev`'s: a later change that grows the client
still needs its own measurement.

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
