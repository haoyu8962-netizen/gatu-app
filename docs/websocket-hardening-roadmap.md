# WebSocket Reliability Hardening Roadmap

## Goal
- Keep long-running websocket sessions stable without unbounded memory growth.
- Apply fixes one item at a time, benchmark after each item, then move to the next.

## Execution Protocol (Context Reset Between Items)
1. Pick one checklist item only.
2. Implement minimal focused code changes for that item.
3. Run targeted benchmark/tests for that item.
4. Record before/after numbers in this file.
5. Mark item status and move to next item.

## Current Status
- [x] Hyperliquid subscription store reconnect + cleanup hardening
- [x] Chart store reconnect + cleanup hardening
- [x] Bounded chart cache (`lastBarCache` LRU cap)
- [x] Orderbook row render stability improvements
- [x] Baseline + recovery benchmark harness
- [x] Item 1: Centralized websocket reliability limits + reconnect circuit breaker
- [x] Item 2: Subscription payload size guardrails and drop strategy
- [x] Item 3: Long-running soak test (30-60 min) with memory trend output
- [x] Item 4: Runtime health alerts (heap slope, reconnect storms, listener growth)
- [x] Item 5: Production incident diagnostics bundle (one-command capture)

## Benchmarks Collected So Far
- `websocket-store-benchmark`
  - `recovery`: `successfulRecoveries 200`, `subscribeCalls 201`
  - `data-overwrite`: stable overwrite behavior (`+0.02 MB` in test run)
- `chart-store-benchmark`
  - `cache-cap`: cache bounded at `256`
  - `cache-reuse`: repeated updates retain only `1` cache key

## Item 1 Scope
- Introduce shared websocket reliability limits in one module.
- Add reconnect circuit breaker cooldown to avoid runaway reconnect loops.
- Keep behavior deterministic and bounded under repeated disconnects.

## Item 1 Result
- Added shared limits module: `src/lib/websocket/reliability.ts`.
- Applied reconnect cooldown/circuit-breaker to:
  - `src/lib/hyperliquid/store.ts`
  - `src/lib/chart/store.ts`
- Benchmarks remained stable after changes:
  - `recovery`: `successfulRecoveries 200` / `subscribeCalls 201`
  - `cache-cap`: chart cache remains capped at `256`
  - `data-overwrite`: stable bounded overwrite behavior

## Next Item
- Profile React render tracks for table, orderbook, chart, and token search interactions.

## Item 2 Result
- Added payload-size estimator + oversized detection in:
  - `src/lib/websocket/payload-guard.ts`
- Added centralized payload limits and per-method overrides in:
  - `src/lib/websocket/reliability.ts`
- Wired payload guardrails into subscription hook path:
  - `src/lib/hyperliquid/hooks/utils/useSub.ts`
- Added validation coverage:
  - `src/lib/tests/websocket-payload-guard.test.ts`
  - `src/lib/tests/websocket-store-benchmark.test.ts` (`payload-guard` scenario)
- Benchmark signal:
  - `payload-guard`: dropped oversized payloads while keeping low heap delta (`+0.03 MB` in test run)

## Item 3 Result
- Added long-running soak harness and JSON reporting:
  - `src/lib/tests/websocket-soak.test.ts`
- Added run commands:
  - `pnpm perf:ws-soak:30m`
  - `pnpm perf:ws-soak:60m`
- Report output:
  - `.output/websocket-soak-<timestamp>.json`
- Smoke soak validation run (20s) produced:
  - `heapDelta=-0.35MB`, `maxSubs=24`, `maxChartCache=256`, `droppedPayloads=151`
  - report path: `.output/websocket-soak-2026-02-07T13-38-28-414Z.json`
- Release-candidate 30-minute soak produced:
  - report path: `apps/terminal/.output/websocket-soak-2026-05-02T08-13-47-768Z.json`
  - `duration=1800000ms`, `iterations=77434`, `recoveryTransitions=1403`
  - `heapDelta=11.96MB`, `heapGrowthMbPerHour=23.836`, `maxHeap=92.67MB`
  - `maxSubs=59`, `maxChartCache=256`, `droppedPayloads=6932`, `unhandledRejections=0`

## Item 4 Result
- Added runtime websocket health reporting:
  - `packages/hl-react/src/internal/websocket/health.ts`
- Registered the Chrome console hook alongside the existing debug/chaos hooks:
  - `window.__hl_health()`
- In production, the debug and health hooks are opt-in via `?hl_diagnostics=1` or the persisted `hl-diagnostics-enabled` localStorage flag.
- The health report covers:
  - JS heap growth slope from Chrome `performance.memory` samples
  - high heap pressure against Chrome's heap limit
  - reconnect storms before cooldown
  - subscription/listener growth and runtime bookkeeping mismatches
  - stale websocket streams
- Added validation coverage:
  - `src/lib/tests/debug-snapshot.test.ts` health-alert cases

## Item 5 Result
- Added one-command browser diagnostics capture:
  - `pnpm diagnostics:browser -- --url <terminal-url>`
- The diagnostics runner writes:
  - `.output/diagnostics/browser-diagnostics-<timestamp>.json`
- The runner performs an initial load, warm reload, and browser gate checks for:
  - `window.__hl_health().status === "healthy"`
  - `window.__hl_debug()` availability
  - no browser page errors or console errors
  - no stale websocket streams or reconnect attempts during normal operation
  - populated `hl-rq-cache-v1`, `hl-last-mark-v1`, and `hl-mkt-stats-v1`
- Production builds expose `window.__hl_debug()` and `window.__hl_health()` only when diagnostics are explicitly enabled via `?hl_diagnostics=1` or the persisted `hl-diagnostics-enabled` localStorage flag.
- Latest passing browser report:
  - `.output/diagnostics/browser-diagnostics-2026-05-02T10-10-24-412Z.json`
  - Warm production-preview reload: `316ms`
  - Runtime health: `healthy`, `5` active streams, `0` reconnect attempts, `0` stale streams
  - Render tracks: chart `3` commits, orderbook `25` commits, positions table `1` commit on warm load; token search `btc` interaction committed `7` times and kept runtime health `healthy`

## Progress Log
- 2026-02-07: Roadmap created; Item 1 started.
- 2026-02-07: Item 1 completed and benchmark-validated.
- 2026-02-07: Item 2 completed and benchmark-validated.
- 2026-02-07: Item 3 completed (soak runner + smoke validation).
- 2026-05-02: Item 4 completed (runtime health reports exposed via `window.__hl_health()`).
- 2026-05-02: Item 5 completed (one-command browser diagnostics capture with opt-in production hooks).
- 2026-05-02: 30-minute release-candidate soak passed and report was attached.
- 2026-05-02: Render-track profiling added behind `?terminal_perf=1` and verified in production preview.
