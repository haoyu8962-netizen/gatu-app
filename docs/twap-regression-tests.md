# TWAP regression contracts

TWAP tests must preserve the current execution and presentation contracts rather than require a particular source-code spelling. Read [mobile data presentation](mobile-data-presentation.md) before changing loading, error or stale-state assertions.

## Execution boundary

- Production TWAP placement enters through `useTrackedTwapOrder`; cancellation enters through `useTwapCancel`. Architectural checks may inspect TypeScript call expressions, but must accept options objects, whitespace and formatting changes.
- Test the cancellation hook's actual execution guard. Before the SDK request, the active owner and network, asset ID, TWAP ID and pending cancellation record must still match the claimed action. Missing guards, changed identities, modified parameters and invalidated claims must prevent the request.
- A successful SDK response is not final cancellation confirmation. The action remains pending until fresh TWAP data confirms it; an ambiguous request outcome preserves the pending state and prevents duplicate cancellation.
- A definitive rejection from a user-requested cancellation must remain visible as action feedback. Feedback from an old account or network must not leak into the current account.

## Mobile presentation

- An active subscription without a first snapshot, reconnecting subscription, failed read or stale snapshot must not display passive warning/error copy or offer cancellation of cached TWAP rows.
- Exercise stale/error cases with an existing nonempty snapshot, not only an empty array. The absence of an error branch in JSX is not evidence that the execution guards disappeared.
- Recovery to a current successful snapshot restores the real rows and routes cancellation with the exact market and TWAP ID. Only a successful current empty snapshot may show the empty-list conclusion.
- User-requested cancellation feedback remains visible while passive data is pending. Keep tests for this distinction separate from tests for quiet fetching.

## Regression entry points

`order-submission-wiring.test.ts` owns the production entry-point inventory. `twap-cancel-hook.test.tsx` exercises the real cancellation guard, SDK-boundary behavior and action feedback. `mobile-twap-card.test.tsx` and `desktop-twap-tab.test.tsx` exercise the rendered views and exact cancellation arguments; desktop and mobile need not use identical passive-state copy. Tracking and reconciliation suites cover pending outcomes and confirmed completion.

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/order-submission-wiring.test.ts \
  src/lib/tests/twap-cancel-hook.test.tsx \
  src/lib/tests/mobile-twap-card.test.tsx \
  src/lib/tests/desktop-twap-tab.test.tsx \
  src/lib/tests/tracked-twap-hook.test.tsx \
  src/lib/tests/twap-reconciliation.test.tsx \
  src/lib/tests/mobile-data-presentation-contract.test.ts
```
