# Exchange Returns

Use this file for signed, state-changing Hyperliquid actions.

## Core rule

`Exchange` is for actions, not passive reads. These requests require signing and often return structured status envelopes rather than a single success boolean.

## Canonical example: `order`

Use for:

- placing one or more orders

Important response pattern:

- top-level success envelope
- nested response object
- per-order statuses

Common per-order statuses include:

- resting order details
- filled order details
- explicit error string
- `waitingForFill`
- `waitingForTrigger`

This means:

- a request can be accepted at the transport/API level while an individual status still represents an order-level error
- you must not flatten the result into "success: true" without inspecting the statuses

## Other action families

### Cancel and modify actions

- often behave like batched action results
- may return vectors aligned with the input batch

### Account and fund actions

- require correct signing mode
- may have different envelope shapes than trading actions

## Advice

- Always describe whether the result is:
  - top-level action acceptance
  - per-item status
  - final fill outcome
- If the user asks "what does this return?", answer at the envelope level first, then the item/status level.
- If the action is batched, mention that result arrays often align with request arrays.
