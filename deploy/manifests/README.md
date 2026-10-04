# TradingView package manifests

`tradingview-charting-library.json` pins the reviewed TradingView source tree by package version, path, size, and SHA-256.

This digest is a deployment review gate, not proof of a TradingView license or authorization.
Update it only from an official package obtained through the project's authorized TradingView access.
Do not download the library from a public mirror or third-party package service.
Follow TradingView's [package content](https://www.tradingview.com/charting-library-docs/latest/getting_started/Package-Content/) and [update](https://www.tradingview.com/charting-library-docs/latest/releases/Update-Library/) requirements.

For an authorized upgrade, generate a new candidate without overwriting the reviewed manifest:

```bash
node deploy/verify-chart-build.mjs --generate-manifest apps/terminal/public /tmp/tradingview-charting-library.next.json
```

Review the package provenance, version, file-set diff, and digest diff independently before replacing the checked-in manifest.
Before replacing it, also run the chart probes that `docs/runtime-guardrails.md` §4 requires after every library upgrade against a local terminal dev server serving the candidate files, and record their output; both must exit 0:

```bash
node apps/terminal/tests/browser/chart-analytics-probe.mjs http://localhost:<port>
node apps/terminal/tests/browser/chart-price-format-probe.mjs http://localhost:<port>
```

The manifest contains metadata only and must never contain TradingView source code or credentials.
