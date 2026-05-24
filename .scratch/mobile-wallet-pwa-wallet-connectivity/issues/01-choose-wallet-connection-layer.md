# Choose Wallet Connection Layer

Status: done

## Summary

Decide whether HypeTerminal should adopt Reown AppKit directly, use Reown/WalletConnect headlessly inside the existing custom modal, or stay with plain wagmi connectors plus custom WalletConnect UI.

## Recommended Decision

Use headless/custom Reown WalletConnect integration while keeping wagmi as the underlying wallet-client source and preserving the HypeTerminal wallet modal.

## Decision

Use headless/custom Reown, not the full AppKit modal.

## Acceptance Criteria

- The decision supports iOS and Android mobile wallets.
- The decision preserves existing wagmi wallet-client consumers.
- The decision supports desktop injected wallets.
- The decision supports hardware-wallet-backed accounts through Ledger/Trezor wallet software.
- The decision identifies pricing/branding implications.

## Notes

This decision blocks detailed UI and implementation planning.
