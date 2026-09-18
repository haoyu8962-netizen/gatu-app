# ADR 0002: Bind trading signers to the exact owner and live session

- Status: Accepted; retrospective record of the implemented decision
- Recorded and checked against repository code: 2026-09-12
- Implementation history: `a94de13f` (`fix(wallet): align email trading with embedded owner signing`)

The recording date is not the original decision date. The alternatives below
explain the current tradeoffs; they do not reconstruct an earlier meeting.

## Context and constraints

Privy authentication, its connected-wallet directory, the active wallet account,
and the selected Hyperliquid owner are separate identities. A restored login or
a locally stored Agent key alone cannot prove that an action has the correct
signer. Delayed wallet initialization and identity changes during an asynchronous
signature make choosing the first available wallet particularly unsafe.

Email sessions have an authenticated embedded owner; external-wallet trading and
Agent-only sessions use approved API wallets. The application must support both
without treating an email login as Agent approval. Legal acceptance, signer
readiness, builder-fee approval and current funding snapshots remain independent
gates. Signing must follow an explicit application action.

## Decision

| Session / action | Signing rule |
| --- | --- |
| Ordinary email trading and user-signed actions | Use the exact active Privy embedded owner belonging to the authenticated user. No generated local Agent and no fallback to an old Agent or another connected wallet. |
| External-wallet trading | Use the locally available, remotely verified Agent for the selected owner and environment. Its approval requires the matching active master wallet. |
| Agent-only trading | Use the verified imported Agent. An Agent-only session does not acquire an unrelated browser owner wallet for user-signed actions. |
| Explicit API-wallet management and desktop linking | Keep their separate owner approval and real Agent verification, including for email users. |

An authenticated identity whose wallet intent or exact embedded wallet is still
unresolved retains an unavailable owner strategy. It must not silently select
the default Agent strategy. Before constructing an external user client, compare
the active account and selected owner case-insensitively; missing or mismatched
accounts fail closed.

Bind the embedded strategy to the authenticated user, owner, exact directory
wallet, active account, environment and provider lifetime. Revalidate before and
after asynchronous signing and immediately before the SDK transport submits.
Cache owner clients by their live session binding and network, not only by an
address that may recur after logout. Preserve SDK signing, nonce management,
request scheduling and the shared legal/execution guards.

Hide the duplicate Privy confirmation only for explicit embedded-wallet
application actions. Required policy acknowledgements still precede acceptance;
builder approval remains attached to the first action requiring the configured
builder code. Login, restoration, readiness changes and status refetches never
sign, and readiness alone never resumes a retained action. Agent persistence
continues to follow the shared, default-off **Stay Connected** preference.

## Alternatives and tradeoffs

| Alternative | Benefit | Reason not selected |
| --- | --- | --- |
| Generate an Agent for every email user | One trading-client path for all sessions | Adds key persistence, approval and recovery requirements to ordinary email trading, despite the exact embedded owner already supporting the required signing path. |
| Select any connected wallet or fall back to an existing Agent | May appear to recover faster when wallet readiness is delayed | Availability does not establish identity or authorization; it can sign for another owner or conceal an unresolved email signer. |
| Mark email authentication as Agent readiness | Reuses existing CTA/status fields | Conflates independent permissions and makes explicit API-wallet management report an approval that does not exist. |
| Cache by owner address only | Simpler cache and greater reuse | An old client can outlive logout, a user change or provider replacement at the same address. |
| Sign during initialization to prewarm readiness | Potentially fewer prompts at the first action | Passive lifecycle events are not permission to sign. An explicit action plus live-session checks provides the required boundary. |

## Consequences and boundaries

Trading consumers use signer readiness; Agent management continues to inspect
actual approval. The extra session checks deliberately invalidate late work and
may require the user to retry after a wallet or environment change. Suppressing
a wallet popup does not suppress a signature, so future callers must preserve
the explicit-action boundary.

This decision changes signer selection, not funds eligibility, legal policy,
account modes, confirmation requirements or deployment gates. Complete funding
snapshots are still necessary before an empty-account deposit suggestion.
Detailed runtime behavior belongs in [trading onboarding](../trading-onboarding.md)
and [email signing](../email-trading-signing.md). Pairing is not reachable in
production: the CloudFront Lambda answers the ticket route with 503 and both
pairing flags stay off (see the [CloudFront deployment](../../deploy/cloudfront/README.md));
the replacement transport is [ADR 0015](0015-link-device-alignment.md) D7
(pending), and the former EC2 [release procedure](../mobile-sync-production-readiness.md)
is retired history.

## Evidence and verification limits

- [Privy session selection](../../apps/terminal/src/hooks/wallet/use-privy-owner-signer.ts)
  and [signing adapter](../../apps/terminal/src/lib/wallet/privy-owner-signer.ts)
  enforce the exact owner and per-call UI behavior.
- [Client selection](../../packages/hl-react/src/hooks/useClients.ts),
  [owner binding](../../packages/hl-react/src/signing/owner-signer-provider.tsx)
  and [guarded owner client](../../packages/hl-react/src/signing/owner-signer-client.ts)
  enforce unavailable-owner handling and session invalidation.
- [Trading status](../../packages/hl-react/src/signing/use-trading-status.ts),
  [authorization](../../packages/hl-react/src/signing/use-trading-authorization.ts)
  and [action guard](../../packages/hl-react/src/hooks/useTradingGuard.ts) separate
  readiness, approval and explicit action execution.
- Regression entry points: [owner clients](../../apps/terminal/src/lib/tests/owner-trading-signer.test.tsx),
  [Privy adapter](../../apps/terminal/src/lib/tests/privy-owner-signer.test.ts),
  [session lifetime](../../apps/terminal/src/lib/tests/use-privy-owner-signer.test.tsx),
  [status](../../apps/terminal/src/lib/tests/owner-trading-status.test.tsx),
  [action resumption](../../apps/terminal/src/lib/tests/trading-guard-session.test.tsx)
  and [onboarding](../../apps/terminal/src/lib/tests/trading-onboarding-gate.test.tsx).

The SDK signing tests use real SDK code with stub transports and invented
identities; they do not prove a production wallet prompt or a live transaction.
The dated provider/protocol evidence and earlier verification results remain in
[email signing](../email-trading-signing.md). This retrospective code review does
not refresh those external observations or claim physical-device acceptance.
SDK upgrades must recheck the version-bound legal adapter and signing contracts.
