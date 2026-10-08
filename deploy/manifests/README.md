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

The checked-in digest covers the official v28.3.0 tree plus one local patch to the loader entry and its esm/cjs/standalone copies (`_create` registers the `innerWindowLoad` listener before `document.write`; see `docs/runtime-guardrails.md` §4 and `chart-library-loader-handshake-contract` and `chart-library-loader-handshake`). After re-applying that patch to an upgraded package, regenerate the manifest with the command above so the four loader digests match the patched files.
The manifest contains metadata only and must never contain TradingView source code or credentials.
