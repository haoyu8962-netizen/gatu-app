# Build Mobile Agent Rotation

Status: done

## Summary

Implement named mobile agent lifecycle behavior: create, approve, import, verify, replace older mobile access, and reset local mobile access.

## Objective

Make mobile access deterministic and revocable. A newly linked phone should replace the previous mobile agent slot unless the product later chooses multiple active devices.

## Dependencies

- `03-define-security-model.md`
- `04-build-sync-core.md`

## Recommended Implementation

Use a named `Mobile valid_until <timestamp>` agent. When relinking, approve the new mobile agent and delete/replace older mobile access according to Hyperliquid's supported agent model.

## Acceptance Criteria

- Desktop can prepare a mobile agent for approval.
- Imported mobile agent is verified against Hyperliquid `extraAgents` before trading.
- Relinking replaces older mobile access.
- Reset clears local mobile agent storage.
- Withdrawals and sensitive actions still require the user wallet.
- Unit tests cover first link, relink, stale local key, reset, and verification failure.

## Allowed Scope

- Agent lifecycle modules/hooks.
- Agent storage updates if needed.
- Tests.

Do not build wallet modal UI or QR UI in this issue.

## Verification

- Run focused agent lifecycle tests.
- Run existing agent storage, agent status, and L1 signing tests if touched.

## Notes

Implemented:

- `packages/hl-react/src/signing/mobile-agent.ts`
- mobile metadata extensions in `packages/hl-react/src/signing/types.ts`
- metadata-aware storage writes in `packages/hl-react/src/signing/agent-storage.ts`
- package exports for `@hypeterminal/hl-react/signing/mobile-agent`
- `apps/terminal/src/lib/tests/mobile-agent-lifecycle.test.ts`

The lifecycle module now provides:

- stable `Mobile` base slot naming with `valid_until` suffixes
- 30-day mobile approval payload generation
- short-lived throwaway approval payload generation for main-wallet revocation/reset
- metadata creation for imported mobile agents
- local mobile agent record creation with private-key/public-key consistency checks
- `extraAgents` verification for approved, stale, expired, wrong-name, missing-remote, and remote-loading states
- stale mobile-agent cleanup decision helper

Verification run:

- `pnpm --filter @hypeterminal/terminal exec vitest run src/lib/tests/mobile-sync-core.test.ts src/lib/tests/mobile-agent-lifecycle.test.ts`
- `pnpm --filter @hypeterminal/terminal exec vitest run src/lib/tests/agent-snapshot-cache.test.ts src/lib/tests/mobile-agent-lifecycle.test.ts`
- `pnpm exec biome check packages/hl-react/src/signing/types.ts packages/hl-react/src/signing/agent-storage.ts packages/hl-react/src/signing/mobile-agent.ts packages/hl-react/src/index.ts apps/terminal/src/lib/mobile-sync/sync-core.ts apps/terminal/src/lib/tests/mobile-agent-lifecycle.test.ts apps/terminal/src/lib/tests/mobile-sync-core.test.ts`
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --strict --skipLibCheck apps/terminal/src/lib/mobile-sync/sync-core.ts apps/terminal/src/lib/tests/mobile-sync-core.test.ts apps/terminal/src/lib/tests/mobile-agent-lifecycle.test.ts packages/hl-react/src/signing/mobile-agent.ts packages/hl-react/src/signing/agent-storage.ts packages/hl-react/src/signing/types.ts`

Existing agent status and L1 signing modules were not touched, so their focused tests were not required for this issue.

## Goal Prompt

```text
/goal Read .scratch/mobile-wallet-pwa-wallet-connectivity/PRD.md and .scratch/mobile-wallet-pwa-wallet-connectivity/issues/05-build-agent-rotation.md. Implement only mobile agent lifecycle and tests. Keep UI out of scope. Update the issue status and notes when done.
```
