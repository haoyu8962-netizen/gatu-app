# 对抗审查报告：3965ddff + 0bc72134（供独立核验）

- **审查对象**：
  - `3965ddff` fix(trading): harden order execution and validation（订单幂等跟踪、Scale 分配与逐档校验、TWAP 状态与撤单、触发/现货校验；56 文件，+3976/−236）
  - `0bc72134` fix(trading): harden deposit and bridge execution（LI.FI route 恢复、防重复转账、钱包延迟保护、报价过期刷新；20 文件，+1018/−184）
- **审查方法**：8 个维度并行审查 + 每条发现由独立怀疑者代理对抗验证（默认立场"该发现是错的"，逐步复现失败场景，任一步不成立即驳回）。原始 21 条发现，12 条确认、2 条驳回、7 条 P3 直通。
- **本文档目的**：每条发现附官方文档/SDK 依据与可复现验证步骤，供第三方（codex）独立判定成立与否。

## 0. 核验环境与权威依据源

| 依据 | 位置 |
|---|---|
| Hyperliquid SDK 类型（客户端契约权威） | `node_modules/.pnpm/@nktkas+hyperliquid@0.33.1_typescript@5.9.3/node_modules/@nktkas/hyperliquid/esm/`（下称 `$SDK`） |
| HL 官方文档 | https://hyperliquid.gitbook.io/hyperliquid-docs/ （关键页：for-developers/api/exchange-endpoint、error-responses、rate-limits-and-user-limits、tick-and-lot-size、trading/take-profit-and-stop-loss-orders-tp-sl、trading/order-types、trading/robust-price-indices） |
| LI.FI SDK | `node_modules` 中 `@lifi/sdk`（`src/core/execution.ts`、`EVMStepExecutor`、`convertQuoteToRoute.ts`、`resumeRoute`/`stopRouteExecution`），文档 https://docs.li.fi |
| 项目编码规范 | `.claude/rules/*.md`（code-style、hyperliquid、ssr、design-tokens、ui-library） |

验证基线（已实跑，可复现）：

```bash
cd apps/terminal && pnpm -s vitest run   # 768 passed / 1 failed / 1 skipped；唯一失败为预存问题（见附录 A1）
pnpm -s exec biome check <两提交全部非 locale 改动文件>   # 0 告警
```

---

## 1. 已确认发现（对抗验证存活）

### F1 [P1] 「模糊失败」分类 + 对账无放弃路径 → 单次 429/断网将该资产全部交易（含平仓）锁死 24 小时

**位置**：
- `apps/terminal/src/domain/trade/order-tracking.ts:102-107`（`isAmbiguousOrderRequestError`）
- `apps/terminal/src/components/trade/order-reconciliation.tsx:73`（`if (result.status !== "order") return;`）
- `apps/terminal/src/hooks/trade/use-tracked-order.ts:32`（`blocked` 门禁）、`:60`（进入对账）
- `apps/terminal/src/stores/use-pending-order-store.ts:175-187`（仅 24h 清理）、`:190-199`（localStorage 持久化）

**主张**（两个可分别核验的子命题）：

**F1a — HTTP 429 被误分类为"模糊"。** `isAmbiguousOrderRequestError` 对 `status < 400 || status === 408 || status === 429 || status >= 500` 全部返回 true。但 429 是 Hyperliquid 限流器在**执行前**的确定性拒绝——订单必然未进撮合，应视为确定失败并允许立即重试，而非进入对账。

官方依据：rate-limits-and-user-limits 页 —— REST 按 IP 聚合权重 1200/min，超限返回 429 且**动作未执行**。另 exchange-endpoint 的 nonce 章节说明 "Action already expired"（动作在 ~15 秒未被接受即永不执行）——即"是否落地"最迟一分钟内可确证，代码却等 24h。

**F1b — 对 `unknownOid` 无放弃路径。** 订单从未到达交易所时，`orderStatus({user, oid: cloid})` 永远返回 `unknownOid`（SDK `$SDK/api/info/_methods/orderStatus.d.ts:20`："If the order is not found, returns a status of 'unknownOid'"），且不会有任何 `orderUpdates` 事件。`order-reconciliation.tsx:73` 对此仅 `return`：无尝试次数上限（`getReconciliationDelayMs` 只封顶轮询间隔 30s，不封顶次数）、无用户可见的清除入口（grep 确认 `getPendingOrderActions().remove` 仅 use-tracked-order.ts:46/55/61 三处内部调用）。条目持久化于 `STORAGE_KEYS.PENDING_ORDERS`，刷新后 rehydrate。

**叠加后果**：pending 期间 `hasPendingOrderForAssets` 使该 assetId 上所有 `submitOrder` 返回 `{state:"blocked"}`（"Another order for this market is still being confirmed."）。本提交恰好把**市价平仓、反向、限价平仓、TP/SL** 全部迁移到 submitOrder（positions-tab.tsx:95、mobile-positions-tab.tsx:97、position-limit-close-modal.tsx:88、position-tpsl-modal.tsx:208、mobile-trade-view.tsx:313、spot-swap-modal.tsx:213）→ **用户 24 小时无法从本终端平掉该资产仓位**，页面刷新无效。

**失败场景**：波动期下单 BTC 撞上 IP 限流 429（或点击瞬间断网，SDK HttpTransport 将网络失败包成 `response: undefined` 的 HttpRequestError，见 `$SDK/transport/http/mod.js:182-185`）→ 进入 reconciling → orderStatus 永远 unknownOid → 24h 内 BTC 上开/平/反/限平/TP-SL 全部 blocked。

**验证步骤**：
1. 读 order-tracking.ts:102-107 确认 429 在 ambiguous 分支。
2. 读 `$SDK/api/info/_methods/orderStatus.d.ts` 确认 unknownOid 语义；对照 rate-limits 文档确认 429 即未执行。
3. 追 order-reconciliation.tsx 全文确认 unknownOid 分支无计数器、无终态转换。
4. 项目自测试已固化该行为：`src/lib/tests/order-reconciliation.test.tsx:130-155`（"keeps unknown orders pending"，mock orderStatus → unknownOid，断言 hasPendingOrderForAssets 保持 true）。
5. grep 全仓库 `getPendingOrderActions().remove` 与任何 dismiss UI，确认无逃生门。

**判定标准**：若能找到 (i) 429 不会进入 reconciling 的代码路径，或 (ii) unknownOid 有界放弃/用户清除入口，则本条不成立。

**建议修复**：429 移出 ambiguous；unknownOid 连续 N 次（或超过 nonce 过期窗口 + 余量，如 2 分钟）后转 `failed` 并解锁（cloid 幂等使重试安全）；给 confirming 吐司加 dismiss。

---

### F2 [P1] TWAP 链路同款：模糊失败只有"正向匹配"出口，429 后 24h 锁死该资产 TWAP，且撤单 429 被误报"已提交"

**位置**：
- `apps/terminal/src/hooks/trade/use-tracked-twap-order.ts:78`（进入对账）、`:46`（`blocked`）
- `apps/terminal/src/components/trade/twap-reconciliation.tsx:70-73`（仅 findMatchingCandidate 正向匹配，**无 orderStatus 类轮询回退、无否定/超时决议**）
- `apps/terminal/src/stores/use-pending-twap-store.ts:170-179`（`hasPendingTwapForAsset`）
- `apps/terminal/src/domain/trade/twap.ts:4`（`TWAP_RECONCILIATION_MAX_AGE_MS` = 24h）
- `apps/terminal/src/hooks/trade/use-twap-cancel.ts:36`（429 后提示撤单"was submitted"）

**主张**：TWAP 从未落地时，twapStates/userTwapHistory 永远不会出现匹配候选，pending 条目只能等 24h 清理；期间该资产新 TWAP 全部 `blocked`，queue item 卡"confirming"不可关闭（同 F7）。且 `twapCancel` 收到 429（撤单动作未执行）时向用户报告"已提交"。

**官方依据**：同 F1 的 429 语义。TWAP action 形状本身（`{a,b,s,r,m,t}`、twapCancel `{a,t}`）经 `$SDK/api/exchange/_methods/twapOrder.d.ts` / `twapCancel.d.ts` 核对**正确**，问题只在失败路径。

**验证步骤**：读 twap-reconciliation.tsx 全文，确认解决路径唯一是候选匹配；确认无负向决议；对照 use-order-submit.ts:142-149 的 blocked 文案；读 use-twap-cancel.ts catch 分支对 429 的处理。

**判定标准**：若 twap-reconciliation 存在任何针对"从未落地"的终态路径，或 429 撤单不提示成功，则不成立。

---

### F3 [P2] 取消族终态被归为"交易所未接受订单"，误导用户重复下单

**位置**：`apps/terminal/src/domain/trade/order-tracking.ts:7`（`ACCEPTED_ORDER_STATUSES` 仅 `open/filled/triggered`）、`:98-100`（`isAcceptedOrderStatus`）；消费点 order-reconciliation.tsx:112-115/120-122。

**主张**：SDK `OrderProcessingStatus`（`$SDK/api/info/_methods/_base/_schemas.d.ts`，文档注释逐条列出）区分两族：**接受后取消**（`canceled`"Order canceled by the user"、`marginCanceled`"canceled due to insufficient margin"、`selfTradeCanceled`、`siblingFilledCanceled`、`scheduledCancel`、`liquidatedCanceled`、`delistedCanceled`…）与**拒绝**（`rejected` 及 `*Rejected` 族）。取消族订单曾被接受、**可能已部分成交**（`sz` vs `origSz` 可证）。现代码把两族统一报 "The exchange did not accept the order." / status `failed`。

**失败场景**：GTC 限价单 HTTP 超时进入对账并持久化 → 用户离线 → 订单实际被接受、成交 30% 后 marginCanceled → 用户回来看到"未接受"→ 按原量重下 → 超仓 30%。

**验证步骤**：读 `$SDK` 内 `OrderProcessingStatus` 的 doc comment 逐条对照 `ACCEPTED_ORDER_STATUSES`；确认 canceled 族走 rejected 分支的文案。

**判定标准**：若取消族状态会走不同文案或触发部分成交对账，则不成立。

---

### F4 [P2] 双标签页 last-writer-wins 覆盖 pending journal，崩溃恢复机制在多 tab 下自我失效

**位置**：`apps/terminal/src/stores/use-pending-order-store.ts:190-199`（persist 配置）。

**主张**：zustand@5.0.9 persist middleware 每次 set 都把**本 tab 内存**序列化整写 `STORAGE_KEYS.PENDING_ORDERS`，不监听 storage 事件、写前不重读（可在 `node_modules/zustand/esm/middleware.mjs` 核实无 `addEventListener("storage")`）。`markChecked` 每个轮询周期都触发写入（order-reconciliation.tsx:70）。B tab 用自己的过期副本持续重写，抹掉 A tab 落盘的对账条目；A 崩溃/刷新后条目彻底丢失——无确认、无失败提示、无 blocked 门禁，而这份 journal 存在的唯一目的就是崩溃恢复。

**验证步骤**：读 zustand v5 persist 源码确认无跨 tab 同步；确认 partialize 全量写；构造两 tab 时序（B 先加载 → A 新增条目 → B 任意写 → A 刷新）。

**判定标准**：若 persist 有 merge-on-write 或 storage 事件回放，则不成立。

---

### F5 [P2] 入金 pending 弹窗在钱包 promise 永不 settle 时永久无法关闭

**位置**：`apps/terminal/src/lib/hyperliquid/use-deposit.ts:489-496`（`waitForWalletTransactionHash`）；`deposit-modal.tsx:291`（`closable={false}`）；`bridge/shared-ui.tsx:63-64`（`closable` → `onOpenChange: undefined` + `showClose={false}`）。

**主张**：0bc72134 把 60s 硬拒绝（旧代码 Promise.race + reject）改为仅触发 `onDelayed` 回调的无限等待：

```ts
const timeoutId = setTimeout(() => onDelayed?.(), timeoutMs);
return promise.finally(() => clearTimeout(timeoutId));   // 永不 reject
```

pending/confirming 屏 `closable={false}` 且无 action children → 无 X、无 Esc、无遮罩关闭。WalletConnect 中继掉线、MV3 扩展 service worker 重启等 `eth_sendTransaction` promise 永不 settle 的已知场景下，60s 后标题变 "Taking longer than expected" 并永远停留，整个终端只能刷新。

**注意**：去掉硬超时**本身是正确取舍**（旧行为：拒绝后用户重试 → 已签名请求稍后落地 → 双重入金）。缺陷是没有配套逃生门（如"我已在钱包中拒绝"按钮）。

**验证步骤**：`git show 0bc72134 -- apps/terminal/src/lib/hyperliquid/use-deposit.ts` 对比新旧 waitForWalletTransactionHash；追 deposit-modal.tsx pending 分支的 closable 传递到 Modal props。

**判定标准**：若 pending 态存在任何用户可达的关闭/取消路径，则不成立。

---

### F6 [P2] Bridge 中途关闭进入后台模式后，remount 不恢复前台交互 → 下一个签名静默 halt 成 error，全 app 无通知

**位置**：`apps/terminal/src/components/trade/tradebox/bridge/bridge-tab.tsx:26-31`（unmount cleanup 无条件 `continueBridgeInBackground()`）；`apps/terminal/src/lib/lifi/use-bridge.ts:269`（`executeInBackground` 只被置 true，无反向路径）、`:185-190`（halt → status "error"，文案 "Bridge execution paused before completion."）。

**主张与 LI.FI SDK 依据**：`@lifi/sdk` `src/core/execution.ts:164-170` —— `updateRouteExecution` 设 `allowInteraction: !executeInBackground`；`EVMStepExecutor`（:585/650/699）在 `!allowUserInteraction` 时于 ACTION_REQUIRED 停住；`executeSteps:128-138` 注释明言 "We may reach this point if user interaction isn't allowed. We want to stop execution until we resume it"。SDK 的恢复机制是 `resumeRoute`（内部 `executeInBackground: false`），但 app 中它只从 BridgeErrorScreen 的 Try Again 可达。

**失败场景**：两签名路由（approve + bridge tx）签完 approve 后按 Done（continueInBackground + 关弹窗）→ 第二个签名请求 halt → store 变 error → **没有 toast、没有 badge、没有任何全局提示**；USDC 停在半路，直到用户碰巧重开 Deposit → Bridge 看到错误屏点 Try Again。用户被告知的却是"会在后台继续"。

**验证步骤**：grep `executeInBackground`/`stopRouteExecution`/`resumeRoute` 全仓库用点；读 LI.FI SDK execution.ts 对应行；确认 error 态无全局通知消费者。

**判定标准**：若 remount 或任何非 error 屏路径会恢复 foreground，或 error 态有全局提示，则不成立。

---

### F7 [P2] "confirming" 吐司无 dismiss、无超时，prune 清 store 不终结 queue item → 永久旋转

**位置**：`apps/terminal/src/components/trade/tradebox/order-toast.tsx:119`（dismiss 仅 `partial`/`failed` 渲染）、`:16`（useAutoRemove 仅 `success`）；`use-pending-order-store.ts:175-187`（prune 静默过滤，不回调 queue）；order-reconciliation.tsx:32/48（无 address 时 effect 早退——钱包断连即停摆）。

**主张**：`confirming` 态唯一出口是 `completeReconciliation`（仅 resolve() 全部子单获得状态后触发）。F1 场景下永不触发；24h prune 只删 store 条目；order-queue store 不持久化 → 吐司带"Do not retry."字样永久旋转，仅刷新可清。TWAP 侧同款（twap-reconciliation.tsx:39/71）。

**验证步骤**：读 order-toast.tsx 全部状态分支；确认 prune 与 queue store 无联动。

---

### F8 [P3] bridge 卡 `executing` 无出路：全仓库零调用 `stopRouteExecution`

**位置**：`use-bridge.ts:261`（`if (current.status === "executing" …) return false` 是唯一 reset 路径）。executeRoute promise 永不 settle（WalletConnect 掉线等）时 status 永久 executing，`executeBridgeQuote` 在非 idle 时拒绝新桥。SDK 明确提供 `stopRouteExecution`（execution.ts: "Stops the execution of an active route"）用于此场景，未被 import。10 分钟超时屏只有 Close，且在 txHash 为 null（从未广播）时也宣称 "Funds are safe / still processing"——文案误导。验证：`grep -rn stopRouteExecution apps/ packages/`。

### F9 [P3] retry 中拒签把用户扔回资产选择屏（与首次执行路径不一致）

**位置**：`bridge-tab.tsx:65-67`（`handleRetry` 丢弃 outcome）对比 `:55-59`（首次执行 `rejected` → `setScreen("confirm")`）；`use-bridge.ts:197-200`（拒签 + canAbandon → 重置 INITIAL_STATE）。重置后 `screen === "executing"` 落穿所有分支渲染 AssetSelectionScreen，无任何提示。

### F10 [P3] `convertQuoteToRoute` 失败后 Try Again 是静默 no-op

**位置**：`use-bridge.ts:216-225`（catch 置 error 但 `latestRoute` 保持 null）、`:247`（`!current.latestRoute` 早退返回 "error"）；`bridge-tab.tsx:66` 丢弃返回值。SDK `convertQuoteToRoute.ts` 确会 throw（缺 `fromAmountUSD`/`toAmountUSD` 时 ValidationError）。用户反复点 Try Again 无任何反应。

### F11 [P3] 三处新用户可见字符串硬编码英文，绕过 lingui（与 i18n 100% 覆盖目标冲突）

| 位置 | 字符串 | 佐证 |
|---|---|---|
| `order-tracking.ts:182-189` | "${n} of ${m} orders were accepted…"、"The exchange did not accept the order." | zh/ar/es/fr/hi .po 中**存在同文案已翻译的 msgid**（组件里用 t`` 的孪生），此处 raw 英文经 toast.error / OrderToast 直出 |
| `orders.ts:240-253` | 5 条 Scale plan 错误（"Scale prices must resolve to distinct ticks" 等） | scale.ts 校验器同文案已本地化，六语种 .po 均有 |
| `use-bridge.ts:187` | "Bridge execution paused before completion." | BridgeErrorScreen 原样渲染 `{error}`；同屏 "Bridge failed"/"Try Again" 均在 `<Trans>` 内 |

### F12 [P3] 组件内注释违反项目显式规则

`twap-reconciliation.tsx:99`：`// History is authoritative once the exchange reports a final state for the same TWAP ID.`——code-style.md："No comments in components"。两提交全部 diff 中唯一一处（已 grep 证实）。

---

## 2. 核对通过项（勿重复挖掘）

以下均对照 `$SDK` 类型与官方文档核验**无误**：

1. **cloid**：hook 生成值匹配 `^0x[a-f0-9]{32}$`（SDK order.d.ts `c` 字段格式），且在网络调用**前**同步写入 pending store（tracked-order-hook.test.tsx:106-107 验证了顺序）。
2. **Scale 分配数学**：szDecimals 取整后逐档 size 之和精确等于总量、余数不丢、每档 $10 min notional 与 tick 去重校验齐全——该维度审查**零发现**。
3. **TWAP action 形状**：`twapOrder {a,b,s,r,m,t}`、`twapCancel {a,t}`（t=twapId 取自下单响应 `status.running.twapId`，非 oid）。
4. **触发单方向校验**：buy/sell × tp/sl 四组合对 mark 的方向关系与 order-types 文档一致。
5. **LI.FI resume**：`retryBridgeExecution` 依据 txHash 有无选择 `resumeRoute`（用 executeRoute 变异后的 route 对象）vs 重新 execute；重复执行防护按 route 键控；确认屏金额来自 execution actuals（`getRouteToAmount` 优先 `execution.toAmount`）。
6. **报价过期刷新**：刷新后新金额在确认屏重新展示并要求显式确认（无静默换价）。
7. **`packages/hl-react` exchange 注册**：`batchModify` 仅入 `CLIENT_KEY_METHODS`、不入 `BUILDER_INJECTED_METHODS`——正确（SDK BatchModifyActionSchema 无 `builder` 字段）。
8. **SSR/编码规范**：新增 zustand store 无模块级浏览器 API 访问；biome 0 告警；无 console.log、无嵌套三元、无硬编码色值/字号。
9. **测试质量**：5 个最大新测试文件均为行为测试（仅 mock 传输/SDK/toast 边界，跑真实 hook + 真实 store），无纯同义反复断言。

## 3. 被驳回的发现（误报，附驳回理由）

1. **"触发单校验阻断 stop-entry 开仓（回归）"** —— 驳回：`buildTriggerOrder`（orders.ts:296）在父提交即硬编码 `r: true` + tpsl，stop-entry 在本终端**从来不可用**，非本次回归。（产品缺口本身见附录 A2。）
2. **"智能钱包入金挂起永久持有跨 tab 锁"** —— 驳回：Privy smart wallet 的 bundler transport 是 viem `http()`，自带 10s 超时 + 有界重试，"promise 永不 settle"的前提在该路径不成立（普通钱包路径的同类问题即 F5，成立）。

## 4. 未决项（文档无法定论，上线前必须 testnet 实测）

**TP/SL 改价仍走 `batchModify`（现新增 `a: true` always_place 标志）** —— `position-tpsl-modal.tsx:203`：`modifyOrders({ a: true, modifies: updatePlan.modifies })`。

- 疑点：仓位型 TP/SL 的"整仓平掉"语义（`s:"0"`）来自下单时 `grouping:"positionTpsl"`，而 `BatchModifyActionSchema` **没有 grouping 字段**；文档对 modify 内部机制唯一提示是 "Modifies are categorized according to the new order they place"。modify 后 `isPositionTpsl` 与 `s:"0"` 语义是否保留，官方文档与 SDK 类型均无记载。
- 实测方法：testnet 建仓 → 官方式下 positionTpsl 单 → 本终端改价 → 查 `frontendOpenOrders` 确认 `isPositionTpsl === true && origSz === "0"` 仍成立；否则改价路径必须退回 cancel + place(grouping:"positionTpsl")。
- 附带核验 `a: true` 语义：文档要求 "a must be skipped if false"（false 时字段必须缺省，否则签名被拒）——当前恒传 true，合规；但需确认 always_place 在 modify 失败分支的下单行为符合预期。

## 附录

**A1 预存测试失败（非本两提交引入）**：`src/lib/tests/i18n-hot-switch.test.tsx` 因 10952c74 给 trades-panel.tsx:25 新增 `useIsTestnet()` 而 mock 未更新。修复：给该测试的 `@/stores/use-global-settings-store` mock 补 `useIsTestnet` 导出。

**A2 预存产品缺口（非缺陷、供知悉）**：`buildTriggerOrder` 硬编码 `r: true`，官方 FAQ 文档描述的 stop-entry（用触发单开仓）在本终端不可实现。如属有意的产品裁剪可忽略。

**A3 严重级定义**：P0 资金风险/订单静默错误；P1 核心功能长时间不可用或卡死；P2 边界场景缺陷或误导性信息（资金相邻）；P3 规范违反/低危 UX。
