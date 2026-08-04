# First-Time Trading Onboarding

This document is the canonical runtime contract for the first-time trading
flow. Keep it aligned with the terminal implementation and its regression
tests whenever wallet connection, legal status, Agent registration, balance
loading, or deposit behavior changes.

## Official References

- [How to start trading](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/how-to-start-trading)
- [Exchange endpoint (`approveAgent` and `approveBuilderFee`)](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [Builder codes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes)
- [Bridge2](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/bridge2)
- [Privy React setup](https://docs.privy.io/basics/react/setup)
- [Privy connected-wallet lifecycle](https://docs.privy.io/wallets/wallets/get-a-wallet/get-connected-wallet)

## Required Sequence

The terminal must preserve this ordering:

1. **Connect and authenticate the owner wallet.** Privy or the selected wallet
   provider owns the wallet connection and authentication prompts.
2. **Verify legal status.** Query Hyperliquid `legalCheck` for the selected
   owner. Unknown, failed, or restricted responses fail closed and must not
   fall through to trading setup.
3. **Accept required policies.** The blocking legal dialog requires both
   policy acknowledgements. Acceptance signs and submits Hyperliquid's
   `acceptTerms2` request, then re-queries `legalCheck` before continuing.
4. **Establish the trading connection.** Only a completed `extraAgents`
   response may establish that no locally available Agent is approved for
   this exact owner and environment. Loading, refreshing, absent, and failed
   responses remain non-definitive and must not trigger `approveAgent`. Agent
   registration is separate from builder-fee approval.
5. **Verify the new Agent.** Persist the generated Agent key only in the
   selected storage scope, refetch the server-side Agent status, and confirm
   the freshly generated public address before reporting success.
6. **Classify account funding.** Wait for both the complete all-DEX perpetual
   snapshot and the spot-state snapshot. Any positive perpetual account value
   or spot balance means funded. Missing or failed snapshots never mean empty.
7. **Guide an empty account to deposit.** Open the deposit dialog only after
   both snapshots definitively establish that the account is empty.
8. **Approve the builder fee when needed for an action.** Do not add this
   signature to first-time Agent setup. `useTradingAuthorization` requests it
   before the first action that needs the configured builder code.

The legal gate has priority over Agent setup and ordinary global dialogs. A
required HIP-3 deployer disclaimer retains priority over ordinary dialogs once
legal and Agent onboarding are complete.

## Stay Connected

`Stay Connected` controls only the storage lifetime of the generated Agent
private key. It does not change the owner wallet or Agent permissions.

| Choice | Agent key storage | Lifetime |
|---|---|---|
| Unchecked (default) | `sessionStorage` | Current browser tab/session |
| Checked | `localStorage` | Across browser restarts until reset/revocation |

The preference is stored under
`hyperliquid.persist_trading_connection`. Agent records remain keyed by
environment and lowercase owner address:
`hyperliquid_agent_{env}_{owner}`. A session record takes precedence over a
persistent record for that identity. Invalid higher-priority data fails closed
instead of falling back to stale data, and reads never cross owners or
environments.

Both the onboarding dialog and direct trading-action authorization must honor
the same preference. A future entry point must not call Agent registration
with an implicit persistent default.

## Mobile Wallet Lifecycle

External mobile wallets commonly background the browser while the wallet app
is open. Wallet-approval timeouts must pause while the document is hidden and
resume only when it becomes visible. A late wallet result may complete only
while the original owner, registration epoch, and generated Agent still match.
Wallet changes and stale registration epochs fail closed and remove the
unverified local key.

Wallet-backed sessions wait for both Privy's authentication readiness and
`useWallets().ready`. Linked wallet metadata proves ownership but does not make
an embedded or external wallet available for signing; the exact wallet must
also be present in Privy's connected-wallet directory and active in Wagmi.
While the exact signer is being restored, trading remains disconnected and
must not fall back to a different wallet or a persisted agent-only owner. This
transient state also must not delete the last confirmed owner's Agent. Agent
cleanup belongs to verified explicit logout, confirmed owner replacement, or
an explicit security reset.

## State Boundaries

- Wallet connection, legal acceptance, Agent approval, local Agent key,
  builder-fee approval, and account funding are separate states.
- Agent/API wallet keys can trade but cannot withdraw. Withdrawals and other
  user-signed actions continue to require the matching owner wallet.
- A legal-status error is not equivalent to unaccepted terms.
- A balance-loading or balance-error state is not equivalent to an empty
  account.
- A successful `approveAgent` response is not enough by itself; post-write
  storage and server verification of the newly generated public address are
  required. Verification failure must not report onboarding success. A key
  whose approval write succeeded but cannot yet be confirmed remains stored
  but inert; only a later successful exact-address check may make it usable.
- An `extraAgents` error, absent response, or cached miss being refreshed is
  not proof that an Agent is missing and must not open the automatic prompt.
- Keep that verification state separate from action-level loading UI. An
  initial Agent query may block the action, but background revalidation must
  not repeatedly disable the explicit Enable Trading entry; registration
  still refetches the definitive status before requesting a signature.
- Closing the automatic Agent prompt is remembered by environment and owner
  for the current SPA session. A verified ready state clears that dismissal;
  an explicit user request always remains available.
- Builder-fee approval must not be coupled back into `useAgentRegistration`.

## Implementation Map

| Responsibility | Primary implementation |
|---|---|
| Privy/Wagmi wallet readiness | `apps/terminal/src/hooks/wallet/use-wallet-session.ts` |
| Wallet/agent-only identity bridge | `apps/terminal/src/providers/root.tsx`, `packages/hl-react/src/provider.tsx` |
| Legal API contract | `packages/hl-react/src/legal.ts` |
| Legal query and acceptance hooks | `packages/hl-react/src/signing/use-legal-status.ts`, `use-terms-acceptance.ts` |
| Legal UI state | `apps/terminal/src/hooks/trade/use-legal-gate.ts` |
| Blocking policy dialog | `apps/terminal/src/components/trade/components/legal-acceptance-modal.tsx` |
| Agent storage and preference | `packages/hl-react/src/signing/agent-storage.ts` |
| Agent registration | `packages/hl-react/src/signing/use-agent-registration.ts` |
| Builder-fee approval | `packages/hl-react/src/signing/use-builder-fee-approval.ts` |
| Action authorization | `packages/hl-react/src/signing/use-trading-authorization.ts` |
| Funding-state derivation | `apps/terminal/src/domain/trade/onboarding.ts` |
| Runtime flow orchestration | `apps/terminal/src/components/trade/components/trading-onboarding-gate.tsx` |
| Session-scoped prompt dismissal | `apps/terminal/src/stores/use-trading-onboarding-store.ts` |
| Modal precedence | `apps/terminal/src/components/trade/components/global-modals.tsx` |

## Regression Checklist

At minimum, changes to this flow must cover:

- legal status: inactive, checking, required, submitting, blocked, error, and
  accepted;
- both policy checkboxes and the non-dismissible blocking dialog;
- an existing approved Agent without a redundant signature;
- new Agent verification using the newly generated address;
- Agent status errors, unknown results, and cached misses during refresh;
- session-only and persistent Agent storage;
- temporary signer loss and restoration, confirmed wallet changes, explicit
  logout, duplicate registration, timeout, and background/foreground transitions;
- funded, empty, loading, and failed account snapshots;
- builder-fee approval remaining separate from Agent registration;
- desktop and mobile modal presentation.
