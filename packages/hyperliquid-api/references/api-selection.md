# API Selection

Use this file when deciding which Hyperliquid API surface fits a task.

## Primary routing

### Use `Info` when

- the user wants market data
- the user wants account state or open orders
- the task is read-only
- the task needs a snapshot, not a stream

Typical examples:

- retrieve all mids
- retrieve order book snapshot
- inspect user state
- inspect fills or funding history

Return pattern:

- JSON object or array from `/info`
- no signing required

### Use `Exchange` when

- the user wants to place, cancel, or modify orders
- the user wants to transfer, withdraw, or configure account behavior
- the task changes Hyperliquid state

Typical examples:

- place order
- cancel order
- update leverage
- approve agent
- withdraw

Return pattern:

- action result envelope from `/exchange`
- signing required
- may contain per-item statuses rather than one simple result

### Use `Subscription` when

- the user wants real-time updates
- the user wants continuous order book, trade, or account event streams
- the answer must describe event payloads rather than snapshots

Typical examples:

- subscribe to all mids
- subscribe to L2 book updates
- subscribe to user fills or open orders

Return pattern:

- WebSocket event payloads
- subscription lifecycle object in SDKs

## Transport defaults

### Prefer `HttpTransport` when

- the task is snapshot-oriented
- the environment is serverless or stateless
- the user only needs one-off reads or actions

### Prefer `WebSocketTransport` when

- the task is subscription-based
- low latency matters
- the user needs persistent connection behavior or stream restoration

## Quick classification examples

- "What does `allMids` return?" -> `Info`
- "How do I place an order?" -> `Exchange`
- "How do I listen to live mids?" -> `Subscription`
- "Which client should I use for open orders?" -> usually `Info`, unless the user explicitly wants a live stream, then `Subscription`
