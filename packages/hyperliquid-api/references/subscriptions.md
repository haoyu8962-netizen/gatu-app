# Subscriptions

Use this file for Hyperliquid real-time streaming behavior.

## Core rule

`Subscription` is for live events over WebSocket. Do not explain it as a snapshot API.

## Transport

- default transport: `WebSocketTransport`
- persistent connection
- automatic reconnection may exist at the SDK layer
- active subscriptions may be restored after reconnect depending on transport configuration

## Canonical example: `allMids`

Use for:

- streaming live mid-price updates for all assets

Return/event shape:

- event payload with a `mids` mapping
- may include `dex`

## Common stream categories

- all mids
- L2 book
- trades
- user fills
- open orders
- user events

## Advice

- distinguish subscription event payloads from `Info` snapshot payloads
- mention lifecycle concepts when relevant:
  - subscribe
  - unsubscribe
  - reconnect/resubscribe
- if the user only needs one snapshot, prefer `Info` instead of a subscription answer
