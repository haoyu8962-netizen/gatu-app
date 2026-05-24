# Mobile/PWA Wallet Connectivity And Agent Sync PRD

Status: ready-for-agent
Created: 2026-05-21

## Problem Statement

HypeTerminal needs a reliable way for users to connect wallets and trade from phone/PWA on iPhone and Android. The current wallet stack supports injected wallets, Coinbase Wallet, WalletConnect, and Hyperliquid agent wallets, but the mobile experience is not yet designed end to end.

Users need wallet connection to work across mobile wallet apps, desktop extension wallets, and hardware-wallet-backed accounts. Hardware wallets are especially important, but direct Ledger/Trezor access from a mobile PWA is not reliable enough to be the primary path. The app also needs mobile trading to feel fast: signing every order through WalletConnect or a hardware wallet would be too slow and fragile.

## Solution

Use a two-layer wallet architecture:

1. Use a headless/custom Reown WalletConnect flow on top of wagmi for connecting the user's real wallet.
2. Add a Hyperliquid-style mobile device sync flow that approves a named, replaceable Hyperliquid agent wallet for phone/PWA trading.

The main wallet remains the authority for deposits, withdrawals, builder fee approval, and agent rotation. The phone/PWA trades through a scoped Hyperliquid agent after the user approves it once. Hardware wallets participate in the approval path through Ledger Live, Trezor Suite, Rabby, MetaMask, or another WalletConnect/injected-wallet surface, rather than through direct mobile browser hardware APIs.

## User Stories

1. As an iPhone trader, I want to connect my mobile wallet from the PWA, so that I can start using HypeTerminal without a desktop extension.
2. As an Android trader, I want to connect my mobile wallet from the PWA, so that wallet setup works from my phone.
3. As a desktop trader, I want to scan a QR code with my phone, so that I can link mobile trading without redoing all account setup.
4. As a hardware wallet user, I want to approve mobile trading from my hardware-wallet-backed account, so that my funds remain controlled by the hardware wallet.
5. As a Ledger user, I want to approve the mobile agent through Ledger Live or a Ledger-supported wallet, so that I do not need direct Ledger support inside the phone browser.
6. As a Trezor user, I want to approve the mobile agent through Trezor Suite or a Trezor-supported wallet, so that I can use HypeTerminal without relying on direct mobile browser hardware APIs.
7. As a trader, I want the phone to trade without wallet popups on every order, so that order entry stays fast.
8. As a trader, I want withdrawals to still require my main wallet, so that an imported mobile agent cannot withdraw funds.
9. As a trader, I want old mobile access replaced when I link a new phone, so that stale devices cannot keep trading indefinitely.
10. As a trader, I want a clear device-linking confirmation screen, so that I understand which account and agent I am approving.
11. As a trader, I want mobile sync QR codes to expire, so that screenshots or old links are less useful.
12. As a security-conscious trader, I want the app to avoid putting secrets in browser history or server logs, so that the sync flow does not leak agent keys.
13. As a returning mobile trader, I want the PWA to remember my approved agent, so that I do not need to relink every session.
14. As a user switching phones, I want a reset/rotate action, so that I can revoke the previous phone's trading access.
15. As a user with multiple wallets installed, I want wallet discovery to show the right wallets, so that I do not pick the wrong connector.
16. As a mobile user, I want wallet deep links to return me to the PWA when possible, so that connection and approval flows do not strand me in the wallet app.
17. As a user whose mobile wallet cannot complete a flow, I want a fallback QR/copy-link option, so that I can still connect manually.
18. As a trader, I want the app to show whether I am connected with a main wallet or trading through an agent, so that I know what actions are available.
19. As a trader, I want agent state verified against Hyperliquid before trading, so that a stale or unapproved local key does not produce confusing failures.
20. As an operator, I want wallet connection and sync failures to be observable, so that we can diagnose mobile wallet issues.
21. As a developer, I want wallet connection logic separated from Hyperliquid agent sync logic, so that each surface can be tested independently.
22. As a developer, I want QR parsing and validation isolated in a deep module, so that security-sensitive behavior is not scattered across UI components.
23. As a developer, I want agent rotation behavior isolated in a deep module, so that replacing older agents is predictable and testable.
24. As a developer, I want the implementation to keep using wagmi wallet clients, so that existing Hyperliquid and LiFi integrations do not need a rewrite.

## Implementation Decisions

- Keep wagmi and viem as the account/wallet-client foundation.
- Add a headless/custom Reown WalletConnect experience for mobile wallet discovery, QR, and deep-link handling while preserving HypeTerminal's current wallet modal design.
- Keep the current Hyperliquid user-wallet vs agent-wallet split: user wallet signs approvals and sensitive actions; agent wallet signs routine trading actions.
- Add a mobile device sync flow modeled on Hyperliquid's own QR agent flow.
- Use a named mobile agent slot so older mobile access can be replaced/deleted.
- Treat direct mobile PWA hardware wallet transport as out of scope for the primary path.
- Hardware wallets are supported through injected wallet software and WalletConnect-compatible software.
- Keep withdrawals, deposits, builder fee approval, and agent rotation gated behind the main wallet.
- Isolate mobile sync payload creation/parsing/validation in a testable module.
- Isolate agent replacement/rotation rules in a testable module.
- Do not depend on a third-party relay for mobile sync.
- Use a no-third-party one-QR encrypted sync flow for v1: encrypt the mobile agent key into a URL fragment and require a one-time pairing code to decrypt on phone/PWA.
- Defer the stronger two-QR ECDH flow unless the one-QR encrypted flow fails security review.
- Keep Hyperliquid's direct key-in-QR approach as a reference pattern, not the preferred security posture.

## Testing Decisions

- Tests should assert external behavior and security-relevant invariants, not implementation details.
- Wallet connector UI tests should cover connector visibility, mobile fallback states, connection errors, and recent wallet behavior.
- QR payload tests should cover valid payloads, expired payloads, wrong-account payloads, malformed payloads, and history-safe import behavior.
- Agent rotation tests should cover first-time linking, relinking with old agent replacement, stale local agent cleanup, and verification against Hyperliquid agent state.
- Existing tests around provider address state, agent signing, and agent storage are useful prior art.
- Manual QA should cover iOS Safari PWA, iOS in-browser Safari, Android Chrome PWA, MetaMask mobile, Coinbase Wallet, OKX/Rabby where possible, Ledger-backed approval, and Trezor-backed approval.

## Out of Scope

- Building a native iOS or Android app.
- Direct WebHID/WebUSB/Bluetooth hardware-wallet integration from mobile PWA.
- Email/social embedded wallet onboarding unless separately chosen.
- Replacing the Hyperliquid agent wallet model.
- Making WalletConnect sign every routine order.
- Whitelabel/Enterprise Reown requirements unless product explicitly requires removing Reown branding.

## Further Notes

The best production design without a third-party dependency is an encrypted QR flow. The fastest shippable design is closer to Hyperliquid's current flow, but it should improve on it by avoiding query-string secrets, using expiration, explicit reveal, optional encryption, and immediate URL cleanup.

Decision recorded: use headless/custom Reown rather than the full AppKit modal.
Decision recorded: do not rely on a third-party relay for mobile sync.
Decision recorded: use one-QR encrypted payload plus one-time pairing code for v1.

## Goal Execution Plan

Run this work as ordered Codex goals. Do not start a later goal until the previous goal's verification passes.

1. `01-choose-wallet-connection-layer.md` - done: headless/custom Reown.
2. `02-design-mobile-agent-sync.md` - done: one-QR encrypted payload plus one-time pairing code.
3. `03-define-security-model.md` - document exact crypto/storage/revocation invariants before code.
4. `04-build-sync-core.md` - implement and test pure sync payload + crypto modules.
5. `05-build-agent-rotation.md` - implement and test named mobile agent rotation/import state.
6. `06-integrate-headless-reown.md` - integrate wallet connection changes into the existing wallet modal.
7. `07-build-mobile-sync-ui.md` - build desktop link-device UI and mobile import UI.
8. `08-end-to-end-qa.md` - run tests and manual iOS/Android/hardware-wallet QA checklist.

Goal prompt format:

```text
/goal Read .scratch/mobile-wallet-pwa-wallet-connectivity/PRD.md and .scratch/mobile-wallet-pwa-wallet-connectivity/issues/<issue-file>. Complete only that issue. Keep changes scoped to the issue, update the issue Status and Notes when done, and run the verification listed in the issue.
```
