# Error Handling

Use this file when the user asks what can fail, how to interpret action results, or how SDK errors differ from API errors.

## Core rule

Separate three failure layers:

1. validation failure before request send
2. transport failure during request execution
3. API-level rejection or per-item action error after the request is processed

## Typed SDK error categories worth preserving

From the typed TypeScript SDK model:

- `ValidationError`
- `TransportError`
  - `HttpRequestError`
  - `WebSocketRequestError`
- `ApiRequestError`
- wallet/signing error classes

## Protocol-level action errors

For order and cancel style actions, errors can appear inside batched status vectors.

Examples from official docs include:

- tick-size violation
- minimum notional violation
- insufficient margin
- reduce-only violation
- invalid trigger price
- no liquidity for market order

## Advice

- do not collapse transport success into business success
- for batched actions, inspect the per-item result
- if the user asks for retry behavior, decide retry policy based on failure layer:
  - validation errors: fix input, do not retry unchanged
  - transport errors: retry may be appropriate
  - API/order-status errors: inspect reason before retrying
