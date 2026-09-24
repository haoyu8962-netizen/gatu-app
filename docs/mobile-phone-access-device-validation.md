# Mobile Phone Access Device Checklist

Updated: 2026-09-24. Protocol: client-only transfer, payload v4 ([ADR 0015](adr/0015-link-device-alignment.md) D7 option B and D8; [simplification plan](link-mobile-device-simplification-plan.md)). There is no pairing server endpoint and no evidence validator script; this is a manual checklist.

> **History.** The 11-row matrix (RD-1 to RD-8, TW-1 to TW-3) and the `validate-mobile-phone-access-device-validation` script were retired on 2026-09-24 with ADR 0015 D8. No row of that matrix was ever run; the rows below replace it.

## Release Rule

The three rows below must be recorded as Pass on a published build before `VITE_MOBILE_PAIRING_ENABLED` is set to `true` for a production build (`deploy.mjs sync --execute` additionally requires `--allow-mobile-pairing`). A release with the flag off does not need this file and does not claim device acceptance. Automated tests and simulated cameras cannot mark a row Pass.

Never record QR screenshots, URL fragments, keys, complete signatures or credential-bearing HAR files. Keep the filled checklist outside Git; this file stays at Not run.

## Setup

1. Publish the build to an HTTPS origin through the [CloudFront release procedure](../deploy/cloudfront/README.md) with the flag on, and read the commit, release ID and `mobileSync.enabled` from the published `/build-meta.json`.
2. Use the same origin on desktop and phone and an isolated Hyperliquid **Testnet** owner. On desktop connect the exact owner through Privy; do not reuse a production Agent.
3. Desktop: click the header QR icon, approve once (one signature; an email owner sees no second Privy prompt), hold for 4 seconds, reveal. Phone: scan, tap Import, open the terminal. Place no trades and move no funds beyond what row RD-3 needs.

## Checklist

| ID | Device and browser | Required result | Status | Evidence |
| --- | --- | --- | --- | --- |
| RD-1 | iOS Safari, the system Camera app opens the link | The import page loads with the fragment already removed from the address bar, Import is an explicit tap, success shows the key's expiry, and a reload asks for a new scan. | Not run | |
| RD-2 | Android Chrome, in-app scanner (Connect → Link Desktop Wallet) | The rear camera starts only after tapping Start camera; a WalletConnect or foreign-origin QR is refused with feedback; the desktop QR opens the import page and Import succeeds. | Not run | |
| RD-3 | Either phone, after import | An order can be placed with the Agent-only session; Deposit, Withdraw and Transfer are disabled with the desktop-required reason; approving again on desktop replaces the phone's key at its next `extraAgents` check. | Not run | |

## Evidence Template

Copy this block once per row into the external checklist.

| Field | Value |
| --- | --- |
| Row | RD-N |
| Tester | <tester name> |
| Date and time | <YYYY-MM-DDTHH:mm:ssZ> |
| Git commit | <full build SHA from /build-meta.json> |
| Release ID | <release ID from /build-meta.json> |
| App origin | <https://origin> |
| Environment | Testnet |
| Device model, OS, browser | <values> |
| Result | Pass or Fail |
| Notes | <what was visible, what persisted, redacted screenshot reference> |
