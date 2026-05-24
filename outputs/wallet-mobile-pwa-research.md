# Mobile/PWA Wallet Connectivity Research

Date: 2026-05-21

## Recommendation

Use a two-layer wallet model:

1. Keep WalletConnect/Reown/wagmi for connecting the user's real wallet.
2. Add a Hyperliquid-style device sync flow for mobile trading, based on a named Hyperliquid agent wallet.

Do not try to make the phone/PWA talk directly to hardware wallets. Direct Ledger/Trezor transport from mobile web is not a reliable product surface, especially on iPhone. Hardware wallets should be used to approve a scoped Hyperliquid agent once, then the phone trades through that agent.

## Why This Fits The Current Stack

The app already uses wagmi v3, viem, WalletConnect v2, Coinbase Wallet, injected wallets, and a Hyperliquid agent wallet flow.

Relevant local files:

- `apps/terminal/src/config/wagmi.ts`: current connectors are injected, Coinbase Wallet, WalletConnect, mocks.
- `packages/hl-react/src/signing/use-agent-registration.ts`: generates a private key, calls `approveAgent`, then stores the agent key.
- `packages/hl-react/src/signing/agent-storage.ts`: stores agent private key/public key in browser storage keyed by env and user address.
- `packages/hl-react/src/hooks/useClients.ts`: uses the agent wallet for trading and user wallet for approvals/withdrawals.

This means the hard problem is not just "connect wallet on mobile." The hard problem is "get a mobile browser into an approved Hyperliquid trading state without asking a mobile wallet or hardware wallet to sign every order."

## What Hyperliquid Does

I inspected `app.hyperliquid.xyz` in browser and its current JS bundle. It has two QR concepts:

- Standard WalletConnect QR in the connect modal.
- A separate mobile device linking flow for API/agent wallets.

The device linking code generates a new key, derives its address, approves it as an agent named `Mobile QR`, then shows a QR containing a link with `{ address, key }` encoded into the URL. The phone scans the QR, parses the payload, stores the key as the API/session agent, and can trade without the main wallet being present.

That is the pattern to copy conceptually, but we should harden it.

## Proposed Product Flow

### Normal Wallet Connect

Use WalletConnect/Reown AppKit or the current wagmi WalletConnect connector for:

- Desktop extension wallets: Rabby, MetaMask, Coinbase, OKX.
- Mobile wallets: deep links and WalletConnect QR.
- Hardware wallets through wallet software: Ledger Wallet/Ledger Live, Trezor Suite, Rabby, MetaMask.
- Deposits, withdrawals, builder fee approval, agent approval.

Best option: use Reown AppKit with the wagmi adapter for the connect UI/discovery layer, while keeping wagmi as the underlying account and wallet-client source. Reown gives the app a maintained wallet registry, mobile deep links, QR handling, and WalletConnect support. If preserving the custom modal matters more, keep wagmi's connector but render a better custom WalletConnect QR/deep-link UI.

### Mobile Device Sync

Add "Link mobile device" from a desktop session that already has the master wallet connected.

Flow:

1. Desktop generates a fresh agent private key.
2. Desktop asks the master wallet/hardware wallet to approve that agent.
3. Use a named agent slot such as `HypeMobile valid_until <timestamp>`.
4. If the user links a new phone, replace/delete the older mobile agent.
5. Desktop shows a short-lived QR.
6. Phone PWA scans it, imports the agent, verifies the public key is approved for the connected master address, then removes the secret from the URL/history.
7. Phone can trade using the agent.
8. Withdrawals and sensitive account actions still require the master wallet.

Important: prefer a separate `HypeDesktop` and `HypeMobile` agent if desktop and phone should be active at the same time. If we only want one active app session, one named agent can be rotated and the old one deleted/replaced.

## Security Position

An agent key cannot withdraw funds, but it can place/cancel/modify trades. Treat it as a high-value trading key.

Minimum viable approach:

- One mobile agent slot only.
- Short expiration using Hyperliquid's `valid_until` naming pattern.
- QR visible only after press-and-hold or explicit reveal.
- QR expires quickly.
- Use a URL fragment, not query string, if the key is inside the QR. Query strings can hit server logs; fragments do not.
- Immediately call `history.replaceState` after import.
- Show the agent address and master address before import.
- Add a "Reset mobile access" action that clears local storage and rotates/deletes the named agent.
- Keep CSP tight and reduce third-party scripts on authenticated trading pages.

Better production approach:

- QR contains only a one-time transfer ID, not the agent private key.
- Phone opens the link, generates an ephemeral encryption key, and sends the public key through a short-lived pairing channel.
- Desktop encrypts the agent key to the phone's public key.
- Phone imports the encrypted payload.
- Pairing expires and is deleted.

This avoids putting the agent private key in browser history, server logs, screenshots, and QR scanner previews. It costs more because it needs a pairing relay or equivalent backend.

## Hardware Wallet Support

The practical support matrix:

- Desktop Ledger/Trezor through Rabby/MetaMask: support via injected wallet.
- Desktop Ledger Wallet/Ledger Live: support via WalletConnect.
- Desktop Trezor Suite: support via WalletConnect or Trezor-compatible wallets.
- Mobile Ledger Wallet: support via WalletConnect where the Ledger app supports the target chain/account.
- Mobile Trezor: support only where the Trezor app/software supports WalletConnect for that use case.
- Direct hardware device connection from mobile PWA: do not rely on this.

Reason: WebHID and WebUSB are limited/experimental web APIs and are not available across Safari/iOS. Even on Android, support is fragmented enough that it should not be the main path for trading.

## Main Risks

- Mobile WalletConnect deep links on iOS can be brittle. WalletConnect documents iOS 17+ limitations around automatic return to browser-based dapps.
- If WalletConnect is used for every trade, UX will be bad and hardware wallet users will suffer. Use it for approval/setup, not routine trading.
- Copying the same agent key to multiple active devices can create operational risk and makes revocation harder. Prefer one agent per active device slot, or one active device total.
- Current agent storage uses localStorage. For mobile sync, consider moving agent secrets to IndexedDB and encrypting at rest. This is still not XSS-proof, but it is better than plain localStorage.
- If the QR payload includes the key, never put it in a query parameter.

## Decision

Best path:

1. Upgrade the connect experience around WalletConnect/Reown while keeping wagmi and the current Hyperliquid client architecture.
2. Add a mobile sync feature modeled on Hyperliquid's QR agent flow.
3. Use named, replaceable mobile agents so older phone access can be deleted/rotated.
4. Keep hardware wallets in the approval path, not the mobile trading path.

This is the lowest-risk path because it aligns with Hyperliquid's own product model and with the app's existing `approveAgent` architecture.

