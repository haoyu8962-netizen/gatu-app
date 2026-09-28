# 未平仓量上限：限价类订单拦截与 HIP-3 每币上限

状态：已实现并集成到分支 `claude/sdk-api-review-51a3ea`（未推送、未合入 `dev`、未发布）。集成头经三轮 Codex 只读对抗审查，并通过类型检查、完整终端测试与 Node 22.15 生产构建（含包体预算）；批次验证结果与遗留问题见[接入规划](sdk-feature-integration-plan.md)的实施记录。当前没有处于上限的可交易市场，功能处于休眠，只有单元与界面测试证据，未做真实账户验收。日期：2026-09-27，2026-09-28 更新。范围：桌面与移动下单面板的永续订单校验、入口订单的 SDK 执行守卫、HIP-3 资产信息弹窗。取舍记录见 [ADR 0023](adr/0023-open-interest-cap-advisory-check.md)；数据展示规则见[数据展示规范](mobile-data-presentation.md)的「已确认的市场未平仓量上限」一行；双端对照见[下单面板对照](order-entry-surface-parity.md)。

**现状说明**：2026-09-27 主 dex 处于上限的 7 个币（CANTO、FTM、JELLY、LOOM、RLB、VINE、ZEREBRO）在 `meta` 中全部标记为已下架，终端的市场目录跳过已下架资产；10 个 HIP-3 dex 与测试网返回空列表。因此上线后拦截规则暂时处于休眠，任何真实市场都触发不了它，本功能只有单元与界面测试证据，没有真实账户或真机验收。

## 目标

- 交易所把某个永续市场列入 `perpsAtOpenInterestCap` 时，限价单挂出后会被撤销（`openInterestCapCanceled`）或在下单时被拒。终端在用户选中限价类订单时就说明原因并禁用提交，引导用户改用市价单，行为与官方终端一致。
- HIP-3 资产信息弹窗显示该币的未平仓量上限，与官方终端按 dex 查询 `perpDexLimits` 的做法一致。

## 非目标

以下各项需要单独决策，本次不做：

- 限价平仓弹窗的拦截（官方会拦截；涉及确认面契约与 `PositionDialogHost`）。
- 官方 HIP-3 市价买单按名义上限钳制限价（`isLimitedByAssetOI`），它会改变提交的价格。
- 把交易所返回的上限相关原始错误字符串映射为翻译文案。
- 行情区、市场选择器或按钮名称上的被动「已达上限」徽标。
- 未连接钱包时用 Info `perpsAtOpenInterestCap({dex})` 轮询补足（每次会话 11 个请求却没有可见用途，官方也没有未连接指示）。

## 约束

- 不新增 WebSocket 订阅：上限集合从 `useAllDexsAccountState` 已有的 `webData3` 订阅派生，参数与选项（`{ user }`、`{ enabled, refreshKey: ledgerRefreshKey }`）保持不变，订阅键不变。
- 未知状态放行：只有活跃、有数据、未过期、属于同一账户的快照明确列出该市场的精确名称时才拦截；订阅中、错误、过期、缺失、账户不匹配都当作未知，既不显示也不执行限制。理由见 ADR 0023。
- 业务判断全部在 `apps/terminal/src/domain/trade/open-interest-cap.ts`，组件只转发布尔值。协议字段保持字符串；`coinToOiCap` 的数值用 Big.js 判断是否为正。
- 提交按钮保留静态名称 `Place … Order`，由 `validation.canSubmit` 禁用，不依赖提示文字是否存在。
- 不签名、不影响登录、状态检查、Agent 注册与 builder 授权。

## 数据来源

| 来源 | 用途 | 形状与注意 |
| --- | --- | --- |
| `webData3.perpDexStates[].perpsAtOpenInterestCap` | 已连接账户的上限集合 | SDK 0.33.3 声明为可选的 `string[]`。数组按 dex 排列但元素里没有 dex 名称，因此取所有 dex 的并集；缺字段、非数组和非字符串元素不贡献任何币。HIP-3 币按官方前端的用法假定为带前缀的名称（如 `km:AAPL`），与 `BuilderPerpMarket.name` 相同；目前所有 HIP-3 列表为空，未能直接核对 |
| `perpDexLimits({ dex })` | HIP-3 弹窗里的每币上限 | 主 dex 返回 `null`。`coinToOiCap` 是 `[coin, oiCap]` 元组数组，币名带前缀（`["km:AAPL","160000.0"]`）。SDK 只校验请求，不校验响应，因此按 `unknown` 防御解析。`totalOiCap`、`oiSzCapPerPerp`、`maxTransferNtl` 语义未核实，不展示 |

## 设计

### 数据流

1. `useAllDexsAccountState` 从现有 `webData3` 订阅额外读取 `isStale`，调用 `getOpenInterestCappedCoins({ enabled, user, event, status, isStale })`，得到 `readonly string[] | null`（`null` 表示未知），加入 `AllDexsAccountState` 与 `AccountBalances` 的 `perpsAtOpenInterestCap`。未连接分支固定为 `null`。
2. `useOrderEntryData` 已经调用 `useDefaultDexBalances`，据此计算 `isOpenInterestCapped = getMarketOpenInterestCapStatus(perpsAtOpenInterestCap, market) === "capped"`。现货永远是 `clear`，市场未知或集合未知是 `unknown`，只有永续或 HIP-3 且名称精确匹配才是 `capped`。
3. 桌面 `TradePanel` 与移动 `MobileTradeView` 把该布尔值同时写入两处：`perpInput` 的必填字段 `openInterestCapped`（校验），以及 `EntryOrderExecutionState.openInterestCapped`（执行守卫的 ref，每次渲染更新）。两个字段都是必填，双端遗漏会在类型检查时失败。

这样做而不新建 hook 模块，是因为许多测试与移动浏览器夹具替换了 `@/lib/hyperliquid` 与 `use-account-balances`，新模块直接调用 `useSubscription` 会让这些替身崩溃；经已有对象传递时，替身里缺这个字段只会得到 `undefined`，按未上限处理。

### 状态

| 快照状态 | `perpsAtOpenInterestCap` | 市场判定 | 展示与行为 |
| --- | --- | --- | --- |
| 未连接、订阅中、错误、过期、缺失、账户不匹配、`perpDexStates` 不是数组 | `null` | `unknown` | 与改动前完全相同：不显示任何文字，不拦截 |
| 当前、成功、同账户，但未列出该市场 | 数组 | `clear` | 与改动前相同 |
| 当前、成功、同账户，列出该市场的精确名称 | 数组 | `capped` | 限价类订单显示限制说明并禁用提交；其余订单类型不受影响 |

切换市场按新市场名称重新判定，不重置草稿，也不改变用户选中的订单类型。

### 订单类型

| 订单类型 | 校验 | 执行守卫 |
| --- | --- | --- |
| 限价（任何 TIF：Gtc、Ioc、Alo；含只减仓；含附带 TP/SL 的父单） | 拦截 | 拦截 |
| 止损限价、止盈限价（含只减仓） | 拦截 | 拦截 |
| 市价（含附带 TP/SL） | 不拦截 | 不拦截 |
| 止损市价、止盈市价 | 不拦截 | 不拦截 |
| TWAP | 不拦截 | 不拦截（TWAP 守卫未改动） |
| 分段（Scale） | 不拦截 | 不拦截 |
| 现货 | 不适用（现货校验栈未改动） | 不拦截（现货市场判定恒为 `clear`） |

拦截集合就是 `usesLimitPrice` 的三种类型，与官方的 `limit | stopLimit | takeLimit` 相同；只减仓与 TIF 不豁免，也与官方一致。IOC 限价单不会挂单，文案里的「挂出后会被撤销」对它不准确，这是为了对齐官方保留的已知不精确之处。

执行守卫用 `isOpenInterestCapRestrictedOrderRequest(params)` 从 SDK 参数判断：`positionTpsl` 不适用；`normalTpsl` 只看父单；`na` 分组有两笔及以上主单时视为 Scale（`SCALE_LEVELS_MIN = 2`）不拦截；单笔 `limit` 且 TIF 不是 `FrontendMarket` 时拦截；单笔 `trigger` 且 `isMarket === false` 时拦截。测试用真实 `buildOrderPlan` 为七种非 TWAP 类型（买卖、只减仓各组合）生成参数，钉住这个分类与校验器所用的同一个 `usesLimitPrice(orderType)`（`lib/trade/order-types.ts`，桌面与移动表单传给校验器的就是它）一致；领域层不再保留第二份订单类型规则。

### 校验与提交复核

- 新校验项 `limitOrderOpenInterestCapValidator`（`apps/terminal/src/lib/errors/definitions/open-interest-cap.ts`）：id `limit-order-open-interest-cap`，code `OIC_001`，新类别 `restriction`，优先级 45，排在市场就绪校验之后、所有输入错误之前。只加入永续校验栈。
- `getOrderValidationPresentation` 只过滤 `connection`、`market` 类别和余额，因此账户就绪（`accountReady`）后它就显示，不依赖限价是否已填、标记价是否就绪；账户未就绪时与其他错误一样保持安静。
- `assertEntryOrderExecutionAllowed` 在市场身份检查之后、可用性检查之前复核：`state.openInterestCapped` 为真且请求属于受限类型时抛出 `EntryExecutionError("open-interest-capped")`。它映射为新的下单反馈码 `open-interest-capped`，由既有队列任务以失败结果经全局通知报告，渲染时翻译。复核放在可用性之前，是为了在快照同时过期时仍报告真正的原因。
- 下单确认弹窗不变：确认时 `canExecute` 重新读取 `validation.canSubmit`，SDK 守卫再复核，确认按钮名称与弹窗正文不显示提交状态。

### 文案与位置

- 英文采用官方原文：`The limit order would be canceled after resting because open interest is capped. Use market orders to close positions.`；中文：`未平仓量已达上限，限价单挂出后会被撤销。请使用市价单平仓。` 校验项的 `t` 与反馈码的 `msg` 共用同一个 msgid，六个语言目录都有译文。
- 桌面：显示在底部动作区的校验错误行（`div.text-xs.text-error`，位于 CTA 之上），与其他非数量错误以 ` • ` 连接。
- 移动：显示在动作按钮上方已有的 `role="alert"` 校验行。
- 提示只取决于订单类型与快照，不取决于拖动中的数量，因此不会在滑杆手势中改变滑杆所在布局。

### HIP-3 每币上限

- `MarketAssetInfo` 在弹窗打开且市场为 `builderPerp`（且 dex 非空）时查询 `useInfo("perpDexLimits", { dex }, { enabled, staleTime: 5 分钟, retry: 1 })`；原生永续与现货从不启用。首屏不发请求。
- `getPerpDexCoinOpenInterestCap(limits, market.name)` 只在响应是对象、`coinToOiCap` 是二元组数组、存在精确币名匹配、值符合协议小数格式且大于 0 时返回原始字符串。
- 满足条件时在「Maximum leverage」之后增加一行 `Open interest cap` / `未平仓量上限`，数值用 `formatUSD(cap, { compact: false })`，与行情头的 Open Interest 数值格式相同（行情头对 HIP-3 也显示 `$`）。加载中、失败（包括先成功后刷新失败）、`null`、缺币、零值和畸形响应都不显示这一行，也不显示加载或错误文字。
- 已知限制：`canOpenMarketAssetInfo` 只允许有 annotation 的 HIP-3 市场打开弹窗，没有 annotation 的市场看不到这一行；本次不改变打开条件。`coinToOiCap` 的计价单位（USD 还是该 dex 的抵押资产）未核实，沿用行情头的 `$` 口径。

## 与官方终端的差异

- 官方在点击下单时弹出 toast；本终端实时校验，选中限价类订单时就显示说明并禁用按钮。拦截集合相同，时机不同。
- 官方同时拦截限价平仓弹窗；本次未做（非目标）。
- 官方的 HIP-3 市价买单价格钳制与原始错误改写未实现（非目标）。

## 备选方案与代价

完整比较见 ADR 0023。简述：失败关闭会在每次账本更新导致的重订阅窗口里禁用所有永续市场的限价单，并把未知状态展示成已确认限制，违反数据展示规范；只做提交时提示（官方做法）会让用户填完整张表单后才知道；未连接轮询有请求成本而无可见用途。

## 已知限制

- 放行窗口：每次账本更新都会改变 `refreshKey`，`webData3` 重订阅期间数据为 `undefined`，这段时间里上限市场的限价单可以到达交易所，由交易所拒绝或撤销（终端已有 `positionIncreaseAtOpenInterestCapRejected`、`openInterestCapCanceled` 等状态的标签）。这个窗口由 `open-interest-cap-hooks.test.tsx` 的真实 hl-react store 用例钉住：新订阅确认后条目为 `active` 但没有数据，上一个订阅的迟到帧不计入，直到新订阅的快照列出该市场才恢复拦截。
- 休眠：见文首现状说明，当前没有可以触发的真实市场。
- HIP-3 币名在 `webData3` 中的形式是假定的（带前缀），未能在真实数据上核对。

## 证据

- 官方前端：另一会话于 2026-09-27 对 `app.hyperliquid.xyz` 生产包（`config-DWLPMyx3.js`）做静态阅读，结论经本批规划的侦察报告整理：提供者对 `perpDexStates[].perpsAtOpenInterestCap ?? []` 取并集；下单按钮在 `userLimitPx` 非空（`limit | stopLimit | takeLimit`）且当前币在集合中时提示 `limit.order.open.interest.cap.error`；`perpDexLimits` 按 dex 查询、`staleTime` 5 分钟。本任务没有重新打开官方页面（内置浏览器登录着真实账户，按要求不使用）。
- 公开 Info（本任务 2026-09-27 用 curl 实际查询，未带任何用户地址）：`perpsAtOpenInterestCap` 主 dex 返回上述 7 个币，`{ dex: "xyz" }` 返回 `[]`；`perpDexLimits({ dex: "km" })` 返回 `coinToOiCap` 带前缀的元组（如 `["km:AAPL","160000.0"]`）；`perpDexLimits({ dex: "" })` 返回 `null`。
- SDK：`@nktkas/hyperliquid` 0.33.3 的 `WebData3Event.perpDexStates[].perpsAtOpenInterestCap?: PerpsAtOpenInterestCapResponse` 与 `PerpDexLimitsResponse`（可为 `null`）。

## 代码与测试

- 领域：`apps/terminal/src/domain/trade/open-interest-cap.ts`。
- 数据：`hooks/trade/use-account-balances.ts`、`hooks/trade/use-order-entry-data.ts`。
- 校验与守卫：`lib/errors/definitions/open-interest-cap.ts`、`lib/errors/stacks/perp-order.ts`、`lib/errors/types.ts`、`lib/trade/use-order-validation.ts`、`domain/trade/order/entry-execution-guard.ts`、`lib/trade/order-submission-feedback.ts`。
- 界面：`components/trade/tradebox/trade-panel.tsx`、`components/trade/mobile/mobile-trade-view.tsx`、`components/trade/components/market-asset-info.tsx`。
- 测试：`src/lib/tests/open-interest-cap.test.ts`（领域规则、真实 `buildOrderPlan` 分类）、`src/lib/tests/open-interest-cap-hooks.test.tsx`（`webData3` 参数与选项不变且 `refreshKey` 取自账本流、快照到布尔值的完整链路、各未知状态；另用真实 hl-react store 在同一次挂载中推进两次账本更新，钉住 `refreshKey` 随账本键变化、参数保持 `{ user }`、新快照到达前回到未知、到达后恢复拦截）、`order-validation.test.ts`、`entry-order-execution-guard.test.ts`、`order-submission-feedback.test.ts`、`market-asset-info.test.tsx`、`tests/mobile-trade-size-validation-a11y.test.tsx`、`tests/trade-panel-open-interest-cap.test.tsx`（真实桌面 `TradePanel`）。

## 验证

2026-09-27 在本分支提交前实际运行（输入路径：jsdom 中的脚本渲染与模拟点击，不是物理输入；没有浏览器、真实钱包或真机验收）：

```bash
pnpm exec biome check <本次修改的 TS/TSX 文件>
pnpm --filter @gatu/terminal typecheck
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/open-interest-cap.test.ts \
  src/lib/tests/open-interest-cap-hooks.test.tsx \
  src/lib/tests/order-validation.test.ts \
  src/lib/tests/entry-order-execution-guard.test.ts \
  src/lib/tests/order-submission-feedback.test.ts \
  src/lib/tests/market-asset-info.test.tsx \
  tests/mobile-trade-size-validation-a11y.test.tsx \
  tests/trade-panel-open-interest-cap.test.tsx
```

结果：Biome 与类型检查通过；上述测试及 `AGENTS.md` 的下单、确认面、滑杆、数据展示、数字格式与运行时翻译回归组全部通过。语言热切换在两端的真实面板上都验证了限制说明在同一 DOM 节点上从英文切到中文。未运行完整终端测试、生产构建与 Playwright 布局套件：约 130 字符的说明在 1001px 紧凑桌面与 320px 手机上可能折成三行，仍需集成时用 `tests/browser/trade-panel-all-orders.pw.ts`、`desktop-order-entry-layout.pw.ts` 与 `mobile-trade-all-orders` 套件核对不撑开网格、不产生内部滚动。

2026-09-27 审查修复（分支 `claude/sdk-fix-r1-oi-cap`，基于集成头 `19af214b`）：Codex 只读审查未确认 P0–P2 缺陷，指出一项 P3 测试缺口——原用例把 `getAccountLedgerRefreshKey` 固定为 `"ledger-7"`，把生产调用改成固定 `refreshKey` 时仍会通过。本轮只改测试，没有生产代码改动：原用例改为从账本流夹具推导 `refreshKey`，并新增真实 hl-react store 用例（假订阅客户端、脚本触发的监听器回调，不是真实 WebSocket）。新用例在 `19af214b` 的生产代码上直接通过，符合审查“当前实现没有这个错误”的结论。实际运行：

```bash
pnpm exec biome check apps/terminal/src/lib/tests/open-interest-cap-hooks.test.tsx
pnpm --filter @gatu/terminal typecheck
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/open-interest-cap.test.ts \
  src/lib/tests/open-interest-cap-hooks.test.tsx \
  src/lib/tests/order-validation.test.ts \
  src/lib/tests/entry-order-execution-guard.test.ts \
  src/lib/tests/order-submission-feedback.test.ts \
  src/lib/tests/market-asset-info.test.tsx \
  tests/mobile-trade-size-validation-a11y.test.tsx \
  tests/trade-panel-open-interest-cap.test.tsx \
  src/lib/tests/i18n-reactivity-contract.test.ts \
  src/lib/tests/number-format-reactivity-contract.test.ts \
  src/lib/tests/locale-format-contract.test.ts \
  src/lib/tests/design-token-ratchet.test.ts \
  src/lib/tests/action-progress-label-contract.test.ts \
  src/lib/tests/mobile-data-presentation-contract.test.ts
```

结果：Biome 通过；Vitest 14 个文件 488 个用例全部通过。类型检查失败，4 个错误全部在本功能之外、本轮未改动的 `src/lib/tests/funding-history-load-boundary.test.tsx`（`createRetryableLazyComponent` 返回的 `Panel` 属性类型为 `never`，来自资金费历史功能的提交），本轮改动的文件没有类型错误。变异检查：把 `webData3` 的 `refreshKey` 临时改成固定的 `"ledger-7"`、或删除 `refreshKey`，原用例与新用例都失败；再临时去掉新用例里的选项、订阅键与订阅条目状态断言，只保留上限状态断言，删除 `refreshKey` 的变异仍让新用例在“新快照前回到未知”处失败；每次检查后都已还原生产代码。未运行完整终端测试、生产构建与 Playwright 套件。
