# Order-entry draft lifecycle

Desktop and mobile ordinary order entry use one confirmation and submission path
for market, limit, trigger, scale and TWAP orders. A pending confirmation owns its
original user input. Live execution prices are read again at confirmation, and all
existing availability, region, signer and exchange execution guards remain active.

## Confirmation ownership

`HyperliquidSessionProvider` exposes a committed exchange-session lease. A change
of network, normalized owner address or session mode creates a new lease and
revokes the old lease during the layout lifecycle. Disconnect, reconnect and an
owner A → B → A round trip do not reactivate an earlier lease. Unmount also revokes
it. A case-only address change preserves the lease. This is session identity,
not proof that legal terms, trading authorization or a matching signing wallet
are ready; those gates still belong to their existing hooks.

Each submit request captures that lease together with the shared draft's market
identity and revision. The confirmation gate validates the captured input both
when opening the review and when confirming it. The saved skip-confirmation
preference skips only the modal. An expired request uses the existing localized
order-conditions-changed feedback and must be reviewed again.

## Edits and completion

The transient order-entry store advances its revision on changed input or
preferences, an explicit form reset, and a market change. Mobile retains its
local quantity, size mode and reduce-only fields, including its existing quote
default. Editing those local fields explicitly advances the same revision.
Transient edits and revisions never write localStorage; only the existing side,
order-type and desktop size-mode preferences are persisted.

The submission hook validates the token before starting an order. After an order
has started, success, partial failure and reconciling outcomes still update the
original order's queue entry and market feedback. The token limits only whether
completion can reset the form: the session lease, market and draft revision must
still match. A successful reset advances the revision, so it can occur only once.
The mobile `onReset` callback runs only after that conditional shared reset and
clears the corresponding local fields. A late result can never erase a newer
draft or a draft edited while the old order was awaiting its result.

The route-derived market identity resets transient fields before the next market's
order form mounts. Only order entry is temporarily gated while the shared reset
is committed; the surrounding desktop workspace and mobile book/account panels
keep their existing instances. Theme, locale and ordinary quote updates do not
reset the draft. Network selection currently reloads the application; the lease
also protects provider consumers that change network within one mounted tree.

## Limit-price prefill

Both surfaces share the limit price and its prefill consumption in the transient
store. The first available mid price may fill an empty field once per market and
order-type entry. Manual typing, clearing, Mid clicks and order-book selection
mark that opportunity as consumed. A later quote, visibility change, form remount
or completed-order reset cannot resurrect an intentionally empty price. A nonempty
typed price is never overwritten by automatic prefill.

An explicit order-type change rearms prefill, preserving the existing behavior of
Limit → Market → Limit. A market change starts a fresh draft and prefill
opportunity. Rendering another surface does neither.

## Regression coverage

- `provider-address.test.tsx`: committed leases, account A → B → A, disconnect,
  unmount, mode/network changes and address normalization.
- `order-confirmation-gate.test.tsx`: original input validation, confirmation
  rejection and the skip-confirmation path.
- `order-entry-store.test.tsx` and `limit-price-prefill-contract.test.ts`:
  revision resets, market A → B → A, transient persistence, manual clearing,
  remount/visibility and explicit order-type reentry.
- `order-submit-surface-lifecycle-integration.test.tsx` uses the real store with
  deferred transport results to cover edits, expired sessions and late success,
  partial and reconciling outcomes without suppressing original-order feedback.
- `order-submit-surface-reset.test.tsx`, `order-submit-twap-details.test.tsx` and
  `order-slider-sdk-contract.test.tsx` retain outcome, SDK payload, precision and
  all ordinary order-type coverage.
- `trade-terminal-page-boot.test.tsx` and
  `mobile-trade-layout-market-reset.test.tsx` cover market reset ordering and
  stable surrounding panels.

Slider gesture ownership and resize cancellation remain specified separately in
[`slider-interactions.md`](./slider-interactions.md).

## 只减仓百分比数量来源（2026-09-21）

百分比先用 Big.js 对原始可减仓基础币量计算并量化，再生成当前单位的显示字符串。短期 `sizeSource` 保存同一基础币字符串，绑定账户/网络/市场、方向、订单类型、只减仓状态及单位；不写本地持久化。报价变化不会重新反算这笔选择的基础币量。手动修改数量、切方向/类型/只减仓、用户修改限价或重置草稿会使来源失效；单位转换显式转移同一个基础币量。原 draftRevision、marketIdentity 和提交 reset token 仍生效。

`sizeForOrder` 从共享推导进入确认草稿与提交意图；确认行及普通单、TWAP、Scale 分配器均使用它，不能将舍入后的金额或 Number 展示值反算回协议数量。手动金额输入仍按当前选价向下量化；确认后数量冻结，实时持仓缩小/消失/翻向/变旧拒绝旧意图，增长也不增加确认数量。
