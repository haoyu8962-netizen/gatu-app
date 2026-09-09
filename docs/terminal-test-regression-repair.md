# Terminal test regression repair

The terminal regression check at `3bd11b32` reproduced seven failed tests in six files. Six failures were introduced by the reviewed change set: four incomplete settings-module mocks, one TWAP source-string assertion, and one compact order-book test without a browser motion-preference API. The remaining mobile-order touch-target assertion was already inconsistent with the implementation at `969c4c4a`.

## Repair rules

- Use Vitest's typed module-promise `vi.mock` with `importOriginal` for partial settings mocks. Preserve unmodified exports and hook result fields, and override only the behavior owned by each test. A new production export must not disappear because a test replaces the entire module with an outdated object.
- Install motion preferences explicitly with `vi.stubGlobal` in tests that exercise animation. Cover normal motion, reduced motion, and an absent `matchMedia` API. Unmount React roots before restoring globals with `vi.unstubAllGlobals` so media listeners are removed from the correct object.
- Keep the production motion hook's conservative fallback. Missing browser capability must not be changed to animation permission merely to make jsdom tests pass.
- Assert TWAP and scale compact input classes, mobile-safe typography, values, editing, and disabled behavior on rendered inputs. Verify exactly one usable mid-price control for each scale boundary. Keep the mobile call-site contract, but do not require exact source lines whose desktop-only arguments or component extraction can change independently. Repairing the first TWAP assertion exposed the same test's outdated scale assertions, so migrate both surfaces together.
- Assert mobile touch-target height and minimum width on each rendered action. The intended minimum is 44 pixels; the contract permits a full-width target above that minimum and does not require the square-only `after:size-11` spelling.
- Do not skip tests, remove behavior coverage, or change production account, subscription, or motion logic as part of this repair. Run the affected suites before the full terminal unit suite.

## Official references

- [Vitest module mocks and typed importOriginal](https://vitest.dev/api/vi.html#vi-mock): factories can preserve the original module and selectively replace exports; a module-promise argument supplies types.
- [Vitest global stubs](https://vitest.dev/api/vi.html#vi-stubglobal) and [restoration](https://vitest.dev/api/vi.html#vi-unstuballglobals): stubbed values are available on jsdom's window and must be restored explicitly when automatic restoration is not configured.

## Validation

Final verification on 2026-09-09 passed after the production build and concurrent repairs completed:

```bash
pnpm --dir apps/terminal exec vitest run --maxWorkers=2 --reporter=dot
```

- Files: **499 passed, zero failed, one skipped** (500 total).
- Tests: **4,957 passed, zero failed, one skipped** (4,958 total).
- Duration: 412.35 seconds. No timeouts were increased or additional tests skipped to obtain this result.
- The only skip is `websocket soak > runs long-running websocket soak and writes JSON report` in `apps/terminal/src/lib/tests/websocket-soak.test.ts`. Its existing `WS_SOAK_RUN !== "true"` gate was already present at `969c4c4a` and was not changed by this repair. The default soak lasts 30 minutes; dedicated `perf:ws-soak:30m` and `perf:ws-soak:60m` scripts opt into it.

This command covers the complete terminal Vitest suite. Repository-root `pnpm test` also runs `og:check`, the website's Node test suite, and `tests/brand-cross-app.test.mjs`; those are separate verification stages and are not included in the counts above.

### Earlier runs

The targeted run includes the original six failing files plus the TWAP, scale and mobile-order rendered contracts used to replace brittle source assertions. With `--maxWorkers=2`, all nine files and 81 tests passed. An earlier unrestricted run passed 80 tests but hit the existing 5-second timeout in an i18n test under concurrent build load; the same test passed in 763ms with bounded worker concurrency. Timeout settings and assertions were not relaxed.

The first full run with `--maxWorkers=2` exercised 500 files and 4,956 tests: 4,952 passed, three failed, and one previously skipped test remained skipped. All seven original failures were resolved. The remaining failures were a TradingView digest-verifier timeout under concurrent load and two tests affected by concurrent transport/message and radius-token repairs. The digest suite passed all 15 tests on its isolated recheck, with the timed-out case completing in 719ms. The final full run above includes the completed repairs and additional regression cases.
