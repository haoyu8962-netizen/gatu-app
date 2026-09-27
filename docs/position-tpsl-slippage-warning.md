# 持仓 TP/SL 大额滑点提示

状态：已实现（2026-09-27，分支 `claude/sdk-feat-tpsl-slippage`，基于 `dbc6036e`），未合入、未发布，未做真实钱包与真机验收。范围：持仓「管理 TP/SL」弹窗（`apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx`），桌面弹层与移动抽屉共用同一份实现。本文是该提示的归属文档；批次规划见 [SDK 未接入接口的接入规划](sdk-feature-integration-plan.md) 第 4 项，被动提示的展示规则见 [数据展示契约](mobile-data-presentation.md)，确认面规则见 [确认面契约](confirmation-surfaces.md)。

## 1. 目标

仓位足够大时，市价 TP/SL 触发后可能在订单簿上吃出较大滑点。官方终端在持仓 TP/SL 弹窗里读取 `maxMarketOrderNtls`，仓位价值超过分档上限时在确认按钮上方显示一条滑点警告。gatu 对齐这一提示：让用户在确认前知道风险，并指向两种现有的缓解方式（限价执行、配置更小的数量）。

提示只是建议。它不预测交易所会拒单，也不改变能否提交、提交什么。

## 2. 约束

- 计算在领域层用 Big.js 完成，协议字段保持字符串；组件只读一个布尔值。
- 被动数据：分档表加载中、失败、格式异常时不显示任何文字、图标或占位（[数据展示契约](mobile-data-presentation.md)的新增行）。
- 确认面：确认按钮名称保持静态的 `Confirm`；提示不进入 `canSubmit`、执行守卫、`guardMessage` 或提交负载（[确认面契约](confirmation-surfaces.md) 不变量 1）。
- 滑杆手势：提示位于数量滑杆下方，不依赖数量草稿，但会随实时仓位价值或后到、刷新失败的分档表出现或消失。桌面弹层垂直居中（`packages/ui/src/modal.tsx` 的 `items-center`），移动抽屉按内容高度贴底（`packages/ui/src/drawer.tsx` 的 `bottom-0`），提示出现或消失会让滑杆所在行上下移动：居中弹层移动提示高度的一半，抽屉移动整个高度。因此数量滑杆手势期间保持手势开始时提示的有无，手势结束（松开或取消）后再按实时结果显示，不把滑杆顶离指针（[滑杆手势](slider-interactions.md)）。保持只影响展示，提交判断本来就不读提示。
- 文案经响应式 Lingui `t` 渲染，随语言热切换；不显示数字，因此不经过数字格式化。
- 不新增首屏惰性块：领域函数与 hook 由 TP/SL 弹窗静态引用，随按需加载的 `PositionDialogHost` 块（`lazy-global-modals.ts`）一起加载。

## 3. 依据

| 来源 | 内容 |
| --- | --- |
| Hyperliquid [Contract specifications](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications)（2026-09-27 查询） | 最大市价单价值按资产最大杠杆分档：`>= 25` 为 $30,000,000，`[20, 25)` 为 $5,000,000，`[10, 20)` 为 $2,000,000，其余 $500,000；最大限价单价值为其 10 倍 |
| Hyperliquid [TP/SL](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl)（同日） | 市价 TP/SL 的滑点容忍度为 10%；设置限价可以控制触发后的滑点 |
| 锁定的 SDK `@nktkas/hyperliquid` 0.33.3 声明 | `maxMarketOrderNtls(signal?)` 无参数；响应为 `[maxLeverage: number, maxMarketOrderNtl: string][]`，名义值匹配 `^[0-9]+(\.[0-9]+)?$`；只校验请求，不校验响应 |
| 公开接口（2026-09-27 用 curl 只读 `POST /info`，不带用户地址） | 主网与测试网都返回 `[[25,"30000000.0"],[20,"5000000.0"],[10,"2000000.0"],[1,"500000.0"]]`，按杠杆降序 |
| 官方前端生产包（本地 Git 忽略的副本 `.worklog/close-all-queue-review-2026-09-21/official-config.js`，仅作检索提示） | 弹窗挂载时请求一次 `maxMarketOrderNtls`，失败忽略、初值为空数组；`le = I.leverage.value`，`Se = A.filter(([e]) => le >= e)?.[0]?.[1] ?? Infinity`；`alerts: I.positionValue > Se ? ["tp.sl.slippage.warning"] : void 0` 传给确认按钮上方的说明块；不读取限价执行与配置数量的状态 |

归档的 `docs/hyperliquid-sdk-1.md`（0.33.1 快照）把响应描述为「名义值与资产代码」的 `[string, string]` 元组，与锁定声明和实时数据都不符，以锁定声明为准（已记入 [SDK 核对流程](hyperliquid-sdk-reference.md)的 Audited contracts）。

## 4. 显示条件

`shouldWarnPositionTpSlSlippage({ tiers, positionLeverage, positionValue })`（`apps/terminal/src/domain/trade/position-tpsl-slippage.ts`）：

1. 分档表必须是数组，且每一项都是 `[杠杆, 名义值]`：杠杆为有限正数，名义值为符合 SDK 模式的正十进制字符串。任何一项不合格，整张表视为不可用，不提示；不猜测哪部分还能用。
2. 选档：在杠杆门槛不高于仓位**当前杠杆**（`position.leverage.value`）的各项中取门槛最高的一项。响应为降序时，与官方「第一个满足 `当前杠杆 >= 门槛`」的写法结果相同；顺序变化时结果不变。没有满足的档位（例如杠杆小于 1）时不提示。
3. 比较：`positionValue`（整个仓位的价值，协议字符串）用 Big.js 与所选名义值比较，**严格大于**才提示；等于上限不提示。仓位价值缺失、非法或不为正时不提示。

以当前 20 倍杠杆为例，仓位价值 `5000000` 不提示，`5000000.000001` 提示；10 倍杠杆下 `3000000` 提示，20 倍下不提示。

条件只看整个仓位，不看「限价执行」是否勾选、是否配置数量、TP/SL 价格草稿、`liveDataReady` 或 `guardMessage`，与官方一致。

## 5. 数据与新鲜度

`useMaxMarketOrderNotionals(open)`（`apps/terminal/src/hooks/trade/use-max-market-order-notionals.ts`）调用 `useInfo("maxMarketOrderNtls", undefined, { enabled: open, staleTime: 30 分钟, gcTime: 30 分钟 })`：

- 查询键由 `useInfo` 按网络区分，主网与测试网互不混用；请求不带用户、不签名、不持久化，重试沿用应用的默认查询策略。
- 只在 `isSuccess` 时返回数据。首次加载、失败、以及后台刷新失败但仍保留旧数据的状态都返回 `undefined`，提示因此消失而不是显示过期结论。
- 弹窗关闭进入 250 ms 退出动画时 `open` 变为 `false`，查询停止但已缓存的成功数据仍然返回，提示不会在淡出中途塌陷。
- 未连接、身份不符、仓位或订单快照未就绪、没有仓位时，弹窗显示状态页（`PositionTpSlStatus`），不挂载表单，也就不发请求。

## 6. 界面与状态

提示放在「数量与执行方式」区块的末尾：说明段落（「By default, TP/SL applies to the whole position…」）之后、`guardMessage` 与底部按钮之前，也就在数量滑杆和「限价执行」复选框下方，与官方「说明在前、警告在后、紧贴确认按钮」的顺序一致。桌面弹层与移动抽屉是同一段标记、同一个滚动容器，没有断点分支。

样式按 [对话框内容块](../.claude/rules/style-ui-guide.md) 的 notice 层级：`rounded-16 border border-stroke-warning-weak bg-warning-soft p-3 text-xs text-warning`，图标为 `WarningIcon`（`text-icon-warning`，`aria-hidden`）。不设 `aria-live` 或 `role`：仓位价值在门槛附近随标记价变化时提示可能出现又消失，反复播报只会打扰。不显示金额或杠杆数字。

手势期间的保持：`TradeSizeSlider` 在指针按下时调用 `onPercentInteractionStart`，此时弹窗记下提示当前是否显示（`slippageWarningHeld`），渲染用 `slippageWarningHeld ?? 实时结果`；`onPercentInteractionEnd` 清除记录。`TradeSlider` 在松开、`pointercancel`、Esc、编辑上下文变化、卸载以及 [滑杆手势](slider-interactions.md) 列出的其余取消路径上都会调用它，所以保持不会遗留到手势之后。键盘调整与百分比输入框不开始手势，不保持。保持与数量编辑是否可用无关：即使 `canEditConfiguredAmount` 拒绝这次拖动的数量回调，滑杆仍在指针下，版面照样固定。只保持有无，不像下单面板那样再固定测得的高度：提示高度只随文案（切换语言除外，手势期间不变）和容器宽度变化，而容器宽度变化会让滑杆宽度变化并取消手势。

英文文案：「A market TP/SL may fill with large slippage because of this position's size. To reduce slippage, use limit execution with a limit price, or configure a smaller amount.」五个非英语目录已补齐翻译。

| 情况 | 显示 |
| --- | --- |
| 分档表加载中、失败、后台刷新失败、格式异常、没有适用档位 | 什么都不显示，不预留高度 |
| 成功且仓位价值严格大于所选上限 | 提示可见 |
| 成功但仓位价值不超过上限 | 什么都不显示 |
| 勾选限价执行、切换整仓/部分数量、输入数量或百分比、拖动数量滑杆 | 与之无关，保持原状 |
| 拖动数量滑杆期间，仓位价值跨过上限，或分档表后到、刷新失败 | 保持手势开始时的有无；手势结束（松开或取消）后按实时结果显示 |
| 弹窗关闭中（250 ms） | 保持关闭前的状态 |
| 点击确认 | 弹窗照常立即关闭，提交与通知不变 |

## 7. 与协议规格的差异

协议规格和 SDK 的字段名都按**资产最大杠杆**（`position.maxLeverage`）分档；官方前端和 gatu 按**仓位当前杠杆**分档。仓位的当前杠杆通常不高于资产最大杠杆，所以 gatu 选出的上限通常不高于协议口径的上限，提示只会更早出现：例如资产最大杠杆为 40 倍的市场，仓位以 10 倍杠杆持有、价值 $3,000,000 时会提示，而协议口径的上限是 $30,000,000。

选择官方口径的理由：这是对齐官方终端的建议提示，不是拒单预测；较大仓位在较低杠杆下出现提示的代价是偶尔多一条建议，不会阻止任何操作。若以后要改用协议口径，只需把调用处的 `positionLeverage` 改为 `position.maxLeverage`，`position-tpsl-modal.test.tsx` 里「按当前杠杆而不是资产最大杠杆选档」的用例会随之失败，提醒同步修改本文。

## 8. 非目标

- 不作为提交门槛，不改变 `canSubmit`、守卫、确认按钮名称、`updatePlan` 或提交负载。
- 不在下单面板、市价平仓、全部平仓或限价平仓里显示同类提示。
- 不预测交易所拒单，不显示所选上限或仓位价值。
- 不给确认按钮加 `aria-describedby`：契约允许无障碍描述，但本次保持最小改动。
- 不顺带修改旁边 `guardMessage` 的旧样式（`rounded-8`）。

## 9. 备选方案与代价

| 方案 | 不采用的原因 |
| --- | --- |
| 按资产最大杠杆分档（协议口径） | 与官方终端不一致；见第 7 节 |
| 勾选限价执行时隐藏提示 | 官方不隐藏；限价是建议的缓解方式之一，勾选后仍保留提示的代价是提示与已采取的措施并存 |
| 用配置数量（而不是整个仓位）计算价值 | 官方只看整个仓位；按数量计算会让提示在拖动滑杆时变化，违反滑杆手势契约 |
| 只在 `liveDataReady` 时显示 | 提示来自弹窗表单正在使用的同一份实时仓位，且从不放行任何操作；额外门槛只会让提示在重连时闪烁 |
| 照搬官方第二条建议「配置数量，在不同触发价分多笔部分 TP/SL」 | gatu 每个市场的持仓 TP 与持仓 SL 各只识别一笔，出现第二笔时 `buildTpSlOrdersByCoin` 把它标记为重复配置，弹窗随即阻止编辑并提示先逐笔取消；照搬会把用户引向死路，因此改为「配置更小的数量」 |
| 分档表失败时提示「无法判断滑点」 | 违反数据展示契约：被动读取失败保持静默 |
| 数量滑杆手势期间直接跟随实时结果 | 居中弹层与贴底抽屉里，提示出现或消失会把滑杆行顶离指针，违反滑杆手势契约；代价是手势期间提示最多滞后到松开 |
| 始终为提示预留高度 | 违反数据展示契约：加载、失败与不适用时不预留占位；也会让普通仓位的弹窗多出一块空白 |

## 10. 验证

2026-09-27 在本分支实际运行（jsdom 单元与组件测试，不是浏览器或真机验证）：

- `position-tpsl-slippage.test.ts`（新增，36 项）：各档边界（40/25→$30M、24/20→$5M、19/10→$2M、9/1→$500k）、严格大于、超出浮点精度的十进制字符串、乱序表、无适用档位、非法杠杆与仓位价值、单项格式错误导致整表不可用、非数组响应。
- `use-max-market-order-notionals.test.tsx`（新增，6 项）：方法名与参数、`enabled` 透传、30 分钟 `staleTime`/`gcTime`、不持久化、不开订阅、只在成功时返回、关闭后仍返回缓存数据。
- `position-tpsl-modal.test.tsx`（扩展，新增 14 项）：桌面与抽屉都显示提示且无数字、无 live region；有无提示时 `placeOrder` 负载相同、确认按钮名称与可用状态不变；按 `leverage.value` 而不是 `maxLeverage` 选档；加载中、失败、刷新失败、格式异常、非数组时正文与无提示基线逐字相同；勾选限价执行、切换整仓/部分数量、调整百分比不影响提示；DOM 顺序在滑杆、限价执行复选框、说明段落之后，在 `guardMessage` 与底部之前；状态页不发请求；分档表后到、刷新失败与仓位价值变化时提示随之变化而 TP 草稿不变。原有 73 项在增加方法感知的 `useInfo` 桩后保持通过。
- 变异核对：把选档改为 `position.maxLeverage`、让 hook 在失败时也返回旧数据、在限价执行时隐藏提示，三处改动分别使上述测试失败，恢复后通过。
- 契约扫描（`i18n-reactivity-contract`、`i18n-hot-switch`、`number-format-reactivity-contract`、`locale-format-contract`、`design-token-ratchet`、`modal-surface-contract`、`action-progress-label-contract`、`trading-action-button-label-contract`、`mobile-data-presentation-contract`、`dialog-dismiss-control-contract`）连同上述三个文件：13 个文件 364 项通过。
- `AGENTS.md` 确认面回归组：41 个文件 893 项通过；数据展示、滑杆手势、运行时翻译回归组加 `position-tpsl-size`、`use-market-slippage-estimate`：17 个文件 355 项通过；引用该弹窗的 `global-modals-*` 与 `position-dialog-session-ownership`：4 个文件 45 项通过。
- `pnpm exec biome check`（6 个改动的 TS/TSX 文件）无问题；`pnpm --filter @gatu/terminal typecheck` 通过。

审查修复（同日，同一分支的后续提交）：审查指出提示会随实时仓位价值或后到的分档表在拖动中出现或消失，而居中弹层与贴底抽屉会因此移动滑杆行，本文原先「拖动中不会出现或消失」的说法不准确。改为手势期间保持有无（第 2、6 节），并实际运行：

- `position-tpsl-modal.test.tsx` 新增 2 项（桌面与抽屉）：手势开始时无提示，拖动中分档表到达、数量预览变化、提交回调之后仍无提示，`onPercentInteractionEnd` 后出现且数量保持 `0.150`；再次开始手势时有提示，仓位价值降到上限以下并重渲染、取消回调之后仍显示，手势结束后消失；全程不发单、不撤单。测试直接调用被包裹的 `TradeSizeSlider` 的回调（jsdom，脚本调用，不是物理指针输入）。
- 变异核对：渲染改回只用实时结果、或在 `onPercentInteractionEnd` 中不清除保持，两处改动分别使这 2 项失败，恢复后通过。
- 上述三个测试文件连同十个契约扫描：13 个文件 366 项通过；`AGENTS.md` 确认面回归组：41 个文件 895 项通过；数据展示、滑杆手势、运行时翻译回归组加 `position-tpsl-size`、`use-market-slippage-estimate`：17 个文件 355 项通过；`global-modals-*` 与 `position-dialog-session-ownership`：4 个文件 45 项通过。
- `pnpm exec biome check`（改动的 2 个 TSX 文件）无问题；`pnpm --filter @gatu/terminal typecheck` 通过；`git diff --check` 无问题。

未做：浏览器目测、真实钱包、真机，以及真人拖动真实控件（按[滑杆手势](slider-interactions.md)的规则，手势相关改动在此之前不算完成验证）；完整终端测试与生产构建（包体预算）由集成方运行。

## 11. 未验证事项

- 官方英文原句只在 2026-09-27 的批次取证中见过，本地 2026-09-21 包只含消息 ID `tp.sl.slippage.warning`；gatu 文案是改写，不是逐字对齐。
- HIP-3 builder 永续（含非 USDC 计价）是否适用同一上限未验证。官方前端直接比较仓位价值与美元上限，gatu 同样处理；非 USDC 计价时仓位价值以该计价币表示。
