# Method Index

Use this file when the user names a specific Hyperliquid method and you need fast routing before loading a more detailed reference.

## Info families

### Market snapshots

- `allMids`
- `l2Book`
- `candleSnapshot`
- `recentTrades`
- `meta`
- `metaAndAssetCtxs`
- `spotMeta`
- `spotMetaAndAssetCtxs`

Typical surface:

- `Info`

Typical return style:

- snapshot object, mapping, or array

### User and account reads

- `openOrders`
- `frontendOpenOrders`
- `clearinghouseState`
- `spotClearinghouseState`
- `userFills`
- `userFillsByTime`
- `userFunding`
- `userNonFundingLedgerUpdates`
- `userRateLimit`
- `userRole`
- `userFees`
- `portfolio`

Typical surface:

- `Info`

Typical return style:

- nested object or array for the requested user/account scope

### Explorer and chain reads

- `blockDetails`
- `txDetails`

Typical surface:

- `Info`

## Exchange families

### Orders and order management

- `order`
- `cancel`
- `cancelByCloid`
- `modify`
- `batchModify`
- `twapOrder`
- `twapCancel`
- `scheduleCancel`

Typical surface:

- `Exchange`

Typical return style:

- action envelope with status vectors or action-specific result objects

### Account configuration

- `updateLeverage`
- `updateIsolatedMargin`
- `topUpIsolatedOnlyMargin`
- `approveBuilderFee`
- `registerReferrer`
- `setReferrer`
- `setDisplayName`

Typical surface:

- `Exchange`

### Fund and account movement

- `withdraw3`
- `usdSend`
- `spotSend`
- `sendAsset`
- `vaultTransfer`
- `subAccountTransfer`
- `subAccountSpotTransfer`
- `borrowLend`

Typical surface:

- `Exchange`

Important note:

- verify signing mode before answering in detail

## Subscription families

- `allMids`
- `l2Book`
- `trades`
- `candle`
- `openOrders`
- `userFills`
- `userEvents`
- `orderUpdates`
- `activeAssetCtx`
- `activeAssetData`

Typical surface:

- `Subscription`

Typical return style:

- event payload delivered over WebSocket

## Decision rule

- If a method name appears in both `Info` and `Subscription`, ask whether the user wants a snapshot or a stream.
- If a method name is in `Exchange`, assume signing matters unless the official docs say otherwise.
- If exact field-level return shape matters and the method is not one of the canonical examples in this package, verify against official docs or the typed TypeScript SDK before claiming exactness.
