**Findings**

- **Wrong symbol:** No blocker. Both the `onSymbolChanged` subscription (singleshot) and the `setSymbol` callback re-check `widgetRef===widget && targetSymbolRef===nextSymbol && targetIntervalRef===nextInterval`, and a mid-flight target change clears pending + *both* the switch and retry timeouts (sw.js:108–111 analog at tradingview-chart.tsx:103–112). Stale B-callbacks after a C-switch are dropped; double-firing `completeSymbolSwitch` is idempotent. Attempt counter resets on success/final-fail, so no permanent lock-out.
- **Stuck blank:** Covered end-to-end — pre-widget hang is bounded by `loadScript(timeoutMs)`→reject→"Something went wrong"+Retry; post-widget hang by the 45s soft prompt; `onChartReady`/exception paths guarded by `disposed`/`widgetRef` identity. No un-timed-out path.
- **Memory leak:** `removeWidget()` runs on unmount and every re-init, calling `widget.remove()` + clearing all timeouts/listeners; retry via `retryNonce` re-runs effect cleanly. `marketBySymbolRef` Map grows only per distinct market (bounded, per-instance) — not a leak.
- **Security:** None. charting bundles are content-hash `cacheFirst`; only same-origin `sameorigin.html`/`charting_library.js` are SWR; opaque icon caching is scoped to `app.hyperliquid.xyz/coins/` — no credentialed/cross-origin exposure.

**Verdict:** No remaining production blocker. Ship it.
