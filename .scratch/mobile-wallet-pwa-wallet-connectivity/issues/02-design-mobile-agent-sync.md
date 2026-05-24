# Design Mobile Agent Sync

Status: done

## Summary

Design the mobile device sync flow for approving, transferring, importing, verifying, and rotating the Hyperliquid mobile agent.

## Recommended Decision

Use one named `Mobile valid_until <timestamp>` agent slot and replace/delete the older mobile agent when a new phone is linked. Do not depend on a third-party relay. Use one-QR encrypted payload plus one-time pairing code for v1.

## Acceptance Criteria

- Desktop can generate and approve a mobile agent.
- Phone/PWA can import the agent from a short-lived sync flow.
- The imported agent is verified against Hyperliquid before trading.
- Relinking a phone replaces stale mobile access.
- Withdrawals and sensitive actions still require the main wallet.
- QR payload uses URL fragment, not query string.
- Pairing code is required to decrypt the payload.
- Imported payload is cleared from URL/history immediately.

## Notes

Decision recorded: no third-party relay dependency.
Decision recorded: use one-QR encrypted payload plus one-time pairing code for v1.

Two-QR ECDH remains a future hardening option, not v1.

## Codex Goal

Objective: This issue is complete. Use this decision as input to issues 03-08 unless implementation discovers a security blocker.

Dependencies: issue 01.

Allowed scope: documentation updates only.

Verification: PRD and downstream issue files reference one-QR encrypted payload plus one-time pairing code.

Goal prompt:

```text
/goal Read .scratch/mobile-wallet-pwa-wallet-connectivity/PRD.md and .scratch/mobile-wallet-pwa-wallet-connectivity/issues/02-design-mobile-agent-sync.md. Make sure the mobile sync decision is consistently recorded as one-QR encrypted payload plus one-time pairing code, with no third-party relay. Do not implement product code.
```
