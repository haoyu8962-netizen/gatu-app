<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-reduce-only-review",
  "date": "2026-09-21",
  "title": "只减仓审查：协议标记正确，数量基准与前端持仓校验缺失",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry"],
  "summary": "只减仓开关与 r 字段有效，但百分比沿用普通下单容量，市价/限价/TWAP 缺少持仓方向与存在性校验，零可用余额会阻断合成平仓场景，保证金摘要仍按开仓计算。官方终端公开代码以反方向持仓量为上限。仅审查，未修复或真实发单。",
  "thread": null,
  "baseCommit": "5d232c25",
  "commits": [],
  "sources": [
    { "path": "docs/order-entry-surface-parity.md" },
    { "path": "docs/hyperliquid-sdk-reference.md" },
    { "path": "apps/terminal/src/domain/trade/order/derive.ts" },
    { "path": "apps/terminal/src/domain/trade/order/entry-execution-guard.ts" },
    { "path": "apps/terminal/src/lib/errors/definitions/trigger.ts" },
    { "path": "apps/terminal/src/lib/errors/definitions/balance.ts" },
    { "path": "apps/terminal/src/domain/trade/order/metrics.ts" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses" },
    { "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods/order" },
    { "url": "https://app.hyperliquid.xyz/assets/config-DWLPMyx3.js" }
  ],
  "supersedes": []
}
-->
# 只减仓审查：协议标记正确，数量基准与前端持仓校验缺失

状态：审查完成，修复未实施。同步记录，未取得来源任务标识。用户要求检查只减仓疑似不可用的问题，并对照官方终端实践和 SDK/API 字段。

## 背景与范围

基线 5d232c25，工作区干净。检查 localhost:3006 的现有页面、桌面/移动共享数据模型、验证器、提交构造和最终执行守卫；没有修改签名与交易实现。浏览器观察仍显示旧服务启动时的版本标识，故页面现象与当前磁盘代码/单测分别记载。

## 结论与依据

### F1 / P2：百分比及最大数量没有切换为可减仓数量

`use-order-entry-data.ts` 与 `order/derive.ts:105–113` 只按普通 `maxTradeSzs` 推导上限，输入没有 reduceOnly 或持仓量。真实页面勾选成功，但百分比仍按普通交易容量计算；选到 100% 时数量超过已有反向可减仓量，提交按钮仍可用。原始账户数值不写入记录。此项是前端大小与提示错误，不等于交易所会执行超额反手。

官方终端未登录页面可以切换只减仓，无法据此验证有仓位行为。进一步读取当时页面引用的公开 `config-DWLPMyx3.js`：`d1` 中 Oe 为只减仓，Be 为 signed position，v 为买方向；开启后 Ve/He 都改为同方向 0、反方向绝对持仓量，普通订单超出 Ve 或 Ve 为 0 时阻断。此为公开产物静态取证，不冒充同账户真实交易测试。

### F2 / P2：非条件单的只减仓缺少持仓校验与执行前复核

`errors/definitions/trigger.ts:18–20` 把持仓存在、方向和数量检查限定为 `usesTriggerPrice && reduceOnly`。合成数据验证：市价、限价、TWAP 在有足够普通容量时允许同方向 reduce-only；限价允许空/未知持仓；反向数量超过持仓也通过。`entry-execution-guard.ts:271` 仅为独立条件单调用持仓复核，普通市价/限价及 TWAP 可通过相同错误场景。

因此前端会允许用户进入注定不符合减仓意图的请求。官方错误文档明确存在 ReduceOnly 拒绝类型，r 标记应仍防止交易所增加仓位；本次没有发单，也不推断超额订单会全拒、裁剪或部分成交。真实页面的同方向尝试被普通最大数量校验拦下，故同方向缺陷的确定证据来自合成充足容量案例，而非声称现场可提交。

### F3 / P2：零可用余额无条件锁定只减仓入口

`trade-form-fields.tsx:139`、`mobile-trade-view.tsx:790` 用 availableBalance <= 0 禁用表单，前者也禁用只减仓复选框；`noBalanceValidator` 对只减仓没有例外。合成“新鲜持仓、有效反向数量、足够数量容量、availableBalance=0”仅因 no-balance 被拒。这会阻断该边界下的平仓操作；本次未在真实账户制造零余额状态，也未证明服务端所有账户模式均会返回该组合。

修复应明确区分新增风险容量与可减仓数量，同时保留持仓、身份、市场和快照新鲜度守卫，不能简单把所有余额/可用性检查删除。

### F4 / P2：只减仓仍展示开仓保证金需求

`order/metrics.ts:14–18` 始终按订单价值 / 杠杆计算保证金，没有 reduceOnly 输入；桌面 `trade-panel.tsx:392` 与移动摘要沿用此值。官方同一产物 `h$` 在只减仓时把所需保证金显示为 N/A。本项为误导性摘要，不是实际扣款证据；后续宜使用既有数值占位呈现不适用状态，避免显示新增开仓保证金。

### 已核对正确的链路

- 页面复选框可勾选，共享草稿能保留该值；不是单纯点击无响应。
- 普通订单 `orders[].r` 与 TWAP `twap.r` 都承接 reduceOnly；`b` 为买卖方向，`s` 为基础币数量字符串。
- 官方 Exchange 文档、锁定 `@nktkas/hyperliquid@0.33.3` 的 `esm/api/exchange/_methods/order.js` / `twapOrder.js` 一致：r 为 boolean。合成市场单构造验证得到 r=true。
- SDK 文档目录可读取；具体方法页通过 Web 工具访问失败，随后通过 curl 读取不带 .md 的 order 方法页，确认其 schema 的 r 为 boolean、描述为 reduce-only。TWAP 字段以已读取的协议原文与锁定 SDK 实现为准，不声称读到了不可访问的 TWAP 方法页。

## 验证与限制

1. 本地页面只操作方向、数量、比例与只减仓草稿；未点击提交。结束恢复原来的卖方向、数量及关闭的只减仓状态。比例由当前行情重新推导，不能保证与先前每一时刻数值完全相同。
2. 临时官方页面未登录、未连接钱包，检查后关闭；官方公开产物逻辑独立于现场交互证据。
3. 临时合成审查文件 `src/lib/tests/reduce-only-review.audit.test.ts` 与既有 `order-entry.test.ts`、`order-validation.test.ts`、`entry-order-execution-guard.test.ts`、`orders.test.ts` 同跑：5 文件、176 项通过。其中 10 项断言当前缺陷确实存在或 r 传递正确，另外 166 项是既有回归。通过不表示已修复。
4. 临时检查移至 Git 忽略的 `.worklog/reduce-only-review-2026-09-21/reduce-only-review.audit.test.ts`，仅含合成账户状态，没有钱包标识或凭证；未把缺陷行为作为永久正确性断言提交。复跑时可临时复制回上述测试路径、执行同组 Vitest 后移回。
5. 首次 memory:index 因外部来源误用 path 字段失败；已改为 url 字段，`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）与 `git diff --check` 通过。
6. 没有真实资金操作、SDK 签名/传输测试、生产构建或移动浏览器复验；移动影响来自共享逻辑及源代码核对。业务代码不变，不运行无关全量应用测试。

## 后续与替代关系

建议统一实现只减仓的方向与数量域模型，覆盖市价、限价、条件单、TWAP、Scale 的表单与最终执行检查；百分比和 Max 使用可减仓量；区分无数据与确实无仓位；额外考虑附带 TP/SL 子单的依赖语义，不能把独立减仓检查直接套给尚未成交的父单子单。通过 Big.js 保留精度，金额单位切换使用同一上限，快照变化不得悄悄扩大确认过的数量。

修复验收应覆盖多/空/零/未知/陈旧持仓、正确/错误方向、超额数量、零可用余额、所有订单类型、两种数量单位、桌面/移动共享草稿、提交等待期间持仓变化，并使用模拟 transport 验证 r=true 与 per-order 错误处理。实际交易所超额处理仍需单独授权的测试网验收。本记录不替代现有订单布局或协议契约。
