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

### Use `Explorer` when

- the user wants a HyperCore block by height, a transaction by hash, or an address's recent transactions
- the user wants a live stream of new blocks or transactions

Typical examples:

- `blockDetails`, `txDetails`, `userDetails`
- `explorerBlock`, `explorerTxs`

Return pattern:

- requests: JSON object from `/explorer` on the RPC host (`https://rpc.hyperliquid.xyz`), not from `/info`
- streams: arrays of blocks or transactions from the RPC WebSocket (`wss://rpc.hyperliquid.xyz/ws`)
- no signing required

Version note:

- in `@nktkas/hyperliquid` this surface is `ExplorerClient` from `0.33.0`; earlier releases exposed the same methods on `InfoClient` and `SubscriptionClient`, and already sent the requests to the RPC host

## Transport defaults

### Prefer `HttpTransport` when

- the task is snapshot-oriented
- the environment is serverless or stateless
- the user only needs one-off reads or actions

### Prefer `WebSocketTransport` when

- the task is subscription-based
- low latency matters
- the user needs persistent connection behavior or stream restoration

### `Explorer` transport

- requests need `HttpTransport`; a default instance already routes them to the RPC host through its `rpcUrl`
- streams need a separate `WebSocketTransport` created with the RPC WebSocket URL (`wss://rpc.hyperliquid.xyz/ws`, Testnet `wss://rpc.hyperliquid-testnet.xyz/ws`)
- the default WebSocket URL is the API host; when checked on 2026-09-30 it accepted explorer subscriptions but delivered no events, so the mistake does not raise an error

## Quick classification examples

- "What does `allMids` return?" -> `Info`
- "How do I place an order?" -> `Exchange`
- "How do I listen to live mids?" -> `Subscription`
- "How do I look up a transaction by its hash?" -> `Explorer`
- "Which client should I use for open orders?" -> usually `Info`, unless the user explicitly wants a live stream, then `Subscription`
