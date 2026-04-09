# Info Returns

Use this file for read-only Hyperliquid calls.

## Core rule

`Info` is for read-only queries. No signing is required. Responses are usually plain JSON objects or arrays.

## Canonical examples

### `allMids`

Use for:

- snapshot of current mids across actively traded coins

Return shape:

- object mapping coin symbol to decimal-string price

Example shape:

```json
{
  "BTC": "95000.1",
  "ETH": "3200.5"
}
```

### `openOrders`

Use for:

- current open orders for a user

Return shape:

- array of order objects
- typical fields include coin, price, size, side, order id, and timestamp

### `clearinghouseState` or user state

Use for:

- positions
- margin state
- withdrawable balance

Return shape:

- object containing position arrays and margin summary objects

## Advice

- Describe numeric values as strings unless the specific SDK already parses them.
- Do not claim `Info` responses are normalized across methods. Some methods return maps, some arrays, some nested objects.
- If the user asks about a specific read method not covered here, inspect the typed SDK or official docs for that method instead of generalizing.
