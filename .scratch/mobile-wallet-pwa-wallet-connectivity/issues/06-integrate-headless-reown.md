# Integrate Headless Reown WalletConnect

Status: done

## Summary

Integrate headless/custom Reown WalletConnect into the existing wallet modal while preserving HypeTerminal's wallet UX and wagmi wallet-client consumers.

## Objective

Improve iOS/Android wallet discovery, QR, and deep-link behavior without replacing the app's wallet architecture.

## Dependencies

- `01-choose-wallet-connection-layer.md`

## Acceptance Criteria

- Existing injected, Coinbase, WalletConnect, and mock wallet behavior is preserved or intentionally replaced.
- Mobile wallet discovery works through Reown/WalletConnect.
- The existing wallet modal design remains the primary UI.
- wagmi account and wallet client hooks still feed Hyperliquid and LiFi integrations.
- Hardware-wallet-backed accounts remain supported through wallet software.
- Tests cover connector sorting/visibility and connection error states where practical.

## Allowed Scope

- Wallet config.
- Wallet modal connection behavior.
- Wallet display metadata.
- Tests for wallet utility/modal behavior.

Do not build mobile agent QR sync UI in this issue.

## Verification

- Run wallet-related tests.
- Run a build/typecheck if dependencies or config changed.

## Implementation Notes

- Added `@walletconnect/ethereum-provider@2.21.1` to the terminal app and configured wagmi WalletConnect with app metadata and `showQrModal: false` so the existing modal remains the primary UI.
- Added wallet utility helpers for connector grouping/sorting and WalletConnect `display_uri` subscription.
- Extended the wallet modal with a headless WalletConnect pairing state that shows the generated pairing URI, supports mobile open/copy actions, and keeps existing injected/Coinbase/mock behavior visible.
- Aligned local package peer dependency ranges after dependency install so the terminal build resolves the workspace packages against the app's React/wagmi/viem stack.
- Added focused connector utility tests covering WalletConnect ordering/grouping and `display_uri` subscription cleanup.

## Verification Notes

- `pnpm --filter @hypeterminal/terminal exec vitest run src/lib/tests/wallet-utils.test.ts`
- `pnpm exec biome check apps/terminal/src/config/wagmi.ts apps/terminal/src/lib/wallet-utils.ts apps/terminal/src/components/trade/components/wallet-modal.tsx apps/terminal/src/lib/tests/wallet-utils.test.ts`
- `pnpm --filter @hypeterminal/terminal build`

## Goal Prompt

```text
/goal Read .scratch/mobile-wallet-pwa-wallet-connectivity/PRD.md and .scratch/mobile-wallet-pwa-wallet-connectivity/issues/06-integrate-headless-reown.md. Integrate headless/custom Reown WalletConnect into the existing wallet modal while preserving wagmi consumers. Do not implement mobile agent sync UI. Update the issue status and notes when done.
```
