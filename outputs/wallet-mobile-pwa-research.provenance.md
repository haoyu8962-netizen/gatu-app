# Provenance: Mobile/PWA Wallet Connectivity Research

Date: 2026-05-21

## Local Code Reviewed

- `apps/terminal/src/config/wagmi.ts`: current wagmi connectors.
- `apps/terminal/src/config/wallets.ts`: wallet display mapping.
- `apps/terminal/src/components/trade/components/wallet-modal.tsx`: current custom connect modal.
- `packages/hl-react/src/signing/use-agent-registration.ts`: builder fee + agent approval flow.
- `packages/hl-react/src/signing/use-agent-status.ts`: checks approved agent and builder fee state.
- `packages/hl-react/src/signing/agent-storage.ts`: local agent key persistence.
- `packages/hl-react/src/hooks/useClients.ts`: routing user wallet vs agent wallet clients.
- `packages/hl-react/src/wallet.ts`: wagmi WalletClient to Hyperliquid wallet adapter.
- `pnpm-lock.yaml`: WalletConnect and Coinbase Wallet SDK dependencies.

## Live Product Inspection

- `https://app.hyperliquid.xyz/trade`
  - Opened connect modal and observed standard WalletConnect QR.
  - Downloaded current bundle `https://app.hyperliquid.xyz/static/js/main.1b2b76fd.js`.
  - Located mobile QR flow around strings/functions:
    - `Mobile QR`
    - `link.mobile.device`
    - `qr.code.scan.explanation`
    - QR payload generated as `/trade?link=${btoa(JSON.stringify({ address, key }))}`.
    - Scanner parses the `link` payload and stores it as API/session agent state.

## External Sources

- Hyperliquid exchange endpoint docs:
  - https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
  - Used for `approveAgent`, named agent limits, user-signed actions, withdrawals, vault/subaccount signing model.

- Hyperliquid signing docs:
  - https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing
  - Used for the distinction between signing schemes and why SDK-compatible signing matters.

- nktkas Hyperliquid agent wallet guide:
  - https://nktkas.gitbook.io/hyperliquid/guides/agent-wallets-and-vaults
  - Used for agent-wallet model and `valid_until` pattern.

- Privy Hyperliquid agent wallet guide:
  - https://docs.privy.io/recipes/hyperliquid/agents-and-subaccounts
  - Used for agent-wallet security model, rotation, expiration, and listing agents.

- wagmi WalletConnect connector docs:
  - https://wagmi.sh/core/api/connectors/walletConnect
  - Used for current connector capabilities, metadata, QR modal options, `display_uri`, and project ID requirements.

- wagmi Coinbase Wallet connector docs:
  - https://wagmi.sh/core/api/connectors/coinbaseWallet
  - Used for Coinbase wallet configuration and production metadata guidance.

- EIP-6963:
  - https://eips.ethereum.org/EIPS/eip-6963
  - Used for multi-injected-wallet provider discovery rationale.

- Reown/AppKit docs:
  - https://docs.reown.com/
  - https://docs.reown.com/appkit/javascript/core/custom-connectors
  - https://docs.reown.com/appkit/react/early-access/headless
  - https://docs.reown.com/appkit/next/core/hooks
  - Used for WalletConnect wallet registry, wagmi adapter, headless QR, mobile support, and direct wallet buttons.

- WalletConnect mobile linking docs:
  - https://docs.walletconnect.network/wallet-sdk/ios/mobile-linking
  - Used for QR/deep-link flow, iOS return limitations, and signing-request timing caveats.

- MDN WebHID and WebUSB:
  - https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API
  - https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API
  - Used for limited availability / production risk of direct hardware access from web.

- Ledger WalletConnect / dapp docs:
  - https://www.ledger.com/blog/walletconnect-now-available-on-desktop-with-ledger-live
  - https://shop.ledger.com/pages/ledger-wallet-dapps
  - Used for Ledger Wallet/Ledger Live WalletConnect and hardware signing positioning.

- Trezor WalletConnect / Trezor Connect docs:
  - https://trezor.io/guides/trezor-suite/wallet-connect-in-trezor-suite
  - https://trezor.io/learn/a/trezor-connect
  - Used for Trezor Suite WalletConnect and Trezor Connect support.

