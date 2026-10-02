# 交易反馈组件审查

日期：2026-09-21。代码基线：`efe8389ee8f2a19f99c2b45673dc5e78b409a1f7`。状态：完成审查，以下修复建议未实施。范围是普通下单、单仓市价平仓、全部平仓及共用通知/对账；不代表所有资金、金库、质押弹层已重新验收。实际命令、复现及限制见[任务记录](work-memory/sessions/2026-09-21-trading-feedback-components-review.md)。

后续状态：本文保留修复前基线与原始发现，「当前」「未实施」均指对应审查时点。2026-09-21 后续已实施统一通知，替代状态见文末；当前契约以[全局操作通知规范](trading-notifications.md)及 [ADR 0019](adr/0019-global-trading-notifications.md)为准。

## 当前如何工作

项目有确认弹窗，也有交易后的浮动反馈，但它们由不同组件负责。

| 组件 | 负责什么 | 当前生命周期 |
| --- | --- | --- |
| Modal / Drawer 确认面 | 让用户核对本次操作 | 订单类点击确认即收起；提交控制器保持到请求结束，同步 ref 阻止重复提交。详见[确认面契约](confirmation-surfaces.md) |
| [Sonner 封装](../apps/terminal/src/components/ui/sonner.tsx) | 成功、信息、警告、错误、加载通知 | 根运行时挂载；默认右下角、3 秒；有 loading 转圈图标，但调用方必须主动使用。平仓通知没有使用 loading、固定通知 ID 或持久时长 |
| [OrderToast](../apps/terminal/src/components/trade/tradebox/order-toast.tsx) 与 [queue store](../apps/terminal/src/stores/use-order-queue-store.ts) | 普通下单的提交状态卡片 | `pending / confirming` 转圈；`success` 显示 Filled / Placed / Set / Running，5 秒后移除；`unconfirmed / partial / canceled / failed` 保留到手动关闭。队列仅内存保存，不是交易所 FIFO 队列 |
| [OrderReconciliation](../apps/terminal/src/components/trade/order-reconciliation.tsx) 与 pending store | 在回包不明确时核对订单 | 根 provider 挂载，通过 cloid 关联 WebSocket `orderUpdates` 与 REST `orderStatus`；主动核对窗口最长 2 分钟，超时标为未确认。后台记录持久化，和可见队列是两套状态 |

普通下单先创建 queue item，再向跟踪器传 `queueId`。平仓操作没有创建 queue item，也没有传 `queueId`，所以不会进入“订单队列”。它们的内部校验、提交与对账阶段仍然存在，不能误报为没有订单跟踪。

| 用户看到的反馈 | 普通下单 | 单仓市价平仓 | 全部平仓 |
| --- | --- | --- | --- |
| 等待 / 正在处理 | 有，订单队列转圈 | 确认面收起后，无即时通知 | 确认面收起后，无即时通知 |
| 同步成功 | 队列显示真实 outcome；挂单不等同成交 | Sonner `Close order submitted`，描述使用返回成交量 | Sonner `All close orders filled` 和平仓数；经过逐单成交量及新持仓快照检查 |
| 失败 / 被锁 | 队列失败或提交守卫反馈 | Sonner 错误 / 警告 | Sonner 错误 / 警告 |
| 部分结果 | 队列 partial，可持续查看 | 没有独立 partial 卡片，按提交器返回结果发通知 | 短暂警告，仅有汇总计数，文案有下述 R6 问题 |
| 请求结果未知 | 队列 confirming，超时转 unconfirmed | 短暂“请勿重试”警告，随后后台对账 | 短暂“正在确认交易所状态，请勿重试”信息，随后后台对账 |
| 后台最终结果 | 有 queue item 则更新队列，否则 Sonner | 另发通用 Sonner | 另发通用 Sonner，没有逐市场批次明细 |

因此，官方观察到的结果提示在项目中有对应能力，但并非同一套组件、文案与持续时间；“全部平仓”的持续队列尚未接入。[官方监听记录](work-memory/sessions/2026-09-21-official-trade-feedback-observation.md)只用于对照，不是本地行为的验收证据。

## 审查发现

### R1 — P2：晚到成功没有清掉旧的未确认错误

普通订单超时后写入 `status: unconfirmed` 与 `error: status-unconfirmed`；晚到的 `filled` 进入 `order-reconciliation.tsx` 的成功分支，只更新 `status / outcome`。Store 浅合并保留旧错误，而 `OrderToast` 不论成功与否都渲染 `error`。真实组件临时测试复现了绿色 Filled 与红色“交易所未返回最终状态”同时出现。

定位：`order-reconciliation.tsx:395`、`use-order-queue-store.ts:58`、`order-toast.tsx:140`。`twap-reconciliation.tsx:363` 有相同更新形式，TWAP 只做源码核对，未动态复现。建议将终态更新定义为完整状态转换，明确清理不适用的错误与计数字段，覆盖超时后晚到成交。

### R2 — P2：离开交易页后，后台完成反馈可能完全不可见

`OrderToast` 只在 `trade-terminal-page.tsx` 的 `marketReady` 分支挂载；全局对账器却用 `hasOrderQueueItem` 推定队列可见。离开交易页后 store item 仍在，完成结果只更新 store，不发 Sonner。超过 5 秒再返回，`useAutoRemove` 根据旧 `completedAt` 立即删除成功项，用户可能从未看到结果。

定位：`order-reconciliation.tsx:388`、`trade-terminal-page.tsx:110`、`order-toast.tsx:33`。真实 store/对账器/队列组件临时测试已复现。建议把“存在记录”与“有可见宿主”分开：全局稳定挂载反馈宿主，或显式跟踪可见性并在不可见时提供替代通知；不要让从未展示的成功项按旧时间直接消失。

### R3 — P2：迟到反馈缺少账户与网络归属隔离

普通订单 REST 轮询在 `await orderStatus` 后未重新核对当前身份，A 的请求在用户切到 B 后返回，仍会发通用成功通知。超时处理也遍历所有身份的 pending submissions，没有类似撤改单已具备的 identity guard。可见 queue item 本身没有 owner/env，`OrderToast` 直接渲染全量旧记录。

定位：`order-reconciliation.tsx:280`、`:212` 和 `use-order-queue-store.ts:6`。临时 deferred promise 测试已复现“A 开始查询 → 切到 B → A filled 回包 → B 收到一次成功通知”。这是反馈归属错误，不是签名错账户的证据。建议后台仍完成 A 的状态核销，但通知必须绑定 owner/env 并在当前显示前重验；切换身份时仅展示匹配记录。

### R4 — P2：Sonner 和订单队列同现时相互遮挡

二者独立定位于右下或手机底部，没有共享堆叠布局。Sonner 层级 `999999999` 高于队列 token `1200`。真实组件隔离浏览器检查：390×844 下两者底边均为 y=776，Sonner 覆盖队列下方 73px；1280×844 下水平区间完全相同，重叠 41px。旧未确认队列未关闭时，平仓结果、复制或其他 Sonner 通知都可触发这种组合。

定位：`components/ui/sonner.tsx:18`、`tradebox/order-toast.tsx:230`。建议共用反馈宿主/堆叠区域，或根据实际可见高度协调位置；只调整 z-index 会改变谁盖住谁，不能消除重叠。

### R5 — P2：601–1000px 的移动通知没有避开底部导航

项目移动断点是 1000px，但安装的 Sonner 2.0.7 只在 `max-width: 600px` 使用 `mobileOffset`。封装只设置了 `mobileOffset`，在 800×844 夹具中实际 bottom 仍为默认 24px，73px 高的通知与 56px 底部导航区域重叠 32px。

定位：`components/ui/sonner.tsx:19`、`config/layout.ts:1`；库规则来自锁定依赖 `sonner/dist/styles.css:425`。建议使通知的响应式规则与项目 1000px 断点一致，测试 600、601、1000、1001px 及安全区；现有 Toaster 单测只断言 CSS 变量存在，没有验证媒体查询是否实际启用。

### R6 — P2：部分成交的计数被描述成“已接受”

全部平仓采用 filled 确认模式，`resolveFilledOrderBatchResponse` 只有在返回成交量等于提交量时增加 `acceptedCount`。两笔都成交、其中一笔只成交部分数量时，计数为 1/2；通知却说“1/2 笔平仓订单被接受”，丢失了“另一笔已部分成交”的事实及对应市场。

定位：`position-close-all-modal.tsx:109`、`domain/trade/order-tracking.ts:209`。既有 `position-close-all-submit.test.tsx` 的 incomplete filled quantity 用例覆盖该响应和计数，本轮重跑通过，UI 文案核对确认语义不符。建议改为“完全成交”计数，并区分部分成交、拒绝、未知及剩余仓位，不能把收到交易所接受等同于完整成交。

### R7 — 已登记的 P2 体验缺口：平仓没有即时等待反馈，未知状态提示过早消失

单仓与全部平仓都先关闭确认面，再等待提交结束才发 Sonner；期间没有 loading 或 queue item。进入后台对账后，“请勿重试”也是默认 3 秒的短通知，没有稳定 ID 供最终结果更新，而对账窗口最长 2 分钟。内部资产锁仍在，问题是用户看不到等待及关联结果。

定位：`position-close-all-modal.tsx:99`、`use-position-market-close-submit.ts:135`、`config/time.ts:12`。这是[已有方案](mobile-close-all-plan.md#提交后的状态反馈2026-09-21-复审)登记的待实施项，本轮扩展核对了单仓路径。建议保留静态确认按钮与立即退场，改由持续可见的同一任务记录承载校验、提交、未知和最终结果；全部平仓需要批次与子市场关联。

## 建议的修复顺序

1. 先修 R1–R3，确保结果正确、属于当前账户、不会因切页丢失。保留订单协调、资产锁和晚到结果核销，不因展示切换取消交易事实处理。
2. 一并设计 R4–R5 的共享通知区域和统一移动断点，覆盖两套反馈同时出现，而不只分别检查它们。
3. 修正 R6，再按既有方案补 R7 的即时状态与批次明细。验收包括慢响应、部分成交、超时后成功、切账户/网络/路由、刷新恢复和语言切换；不把通知成功当作真实成交验收。

本次没有修改业务实现；以上顺序是审查建议，不代表修复已完成。

## 官方组件数量与统一建议：同日后续核对

状态：架构建议，未实施。仓库基线 `eeec5c67`。本次在用户已打开的官方交易页检查 DOM 与当前资源清单，确认顶层有 **1 个 `.toaster` 容器**，当前无通知子节点，也没有 Sonner 的 `[data-sonner-toaster]`。这说明当前挂载情况；订单和平仓共用同一管道的结论还依赖以下代码证据，而非只数空 DOM：

- 当前仍加载 [index-58uVNh8f.js](https://app.hyperliquid.xyz/assets/index-58uVNh8f.js) 和 [config-DWLPMyx3.js](https://app.hyperliquid.xyz/assets/config-DWLPMyx3.js)。主脚本唯一的 `containerClassName: "toaster"` 挂载使用配置脚本导出的同一个 Toaster；移动/平板设 `top-left`，桌面设 `bottom-right`。
- 配置脚本的通知函数统一接收内容、类型和可选 ID，调用同一个 toast store 的 `success / error / loading`；都渲染同一个自定义通知内容组件，改变图标、内容与持续时间。其底层 API、store、ToastBar 和 Toaster 结构与 [react-hot-toast 源码](https://raw.githubusercontent.com/timolins/react-hot-toast/v2.4.1/src/components/toaster.tsx)相符，据此识别为该库体系；没有 package manifest，不能确定官方精确版本。
- 普通订单提交器 `i7` 在 `notifications === "all"` 时创建 loading，保存通知 ID；成功、失败都使用这个 ID 更新同一条通知。全部平仓调用 `errorsOnly`，跳过普通 loading，由外层在结果后调用相同入口显示汇总。不同调用策略不等于第二套通知系统。
- 同一自定义内容组件提供图标、关闭与触摸退出；成功/错误配置 6 秒，加载配置 300 秒。此前用户操作时的普通通知与全部平仓汇总也在同一个 `.toaster` 内被捕获，详见[已记录的实际监听](work-memory/sessions/2026-09-21-official-trade-feedback-observation.md)。本次没有为了观察而提交新交易。

结论限定为本次核对的交易页订单/平仓浮动反馈：**一套通知管道，多个状态和内容**。确认弹窗、表单错误、资金待处理列表和 TradingView iframe 属于不同交互表面，未纳入数量，也未遍历全站所有懒加载页面。

两套宿主本身不是反模式；[react-hot-toast 的多 Toaster 文档](https://react-hot-toast.com/docs/multi-toaster)明确支持不同区域独立通知。但 Sairn 的两套浮层处理的是相邻交易流程、占用同一显示区域，已发生遮挡与生命周期遗漏，因此没有必要继续保留两套独立定位、堆叠和计时系统。

建议保留现有 Sonner，统一为一个根级稳定宿主：

| 层次 | 建议边界 |
| --- | --- |
| 执行与对账 | 保留提交守卫、资产锁、pending store、cloid 与 WS/REST；通知关闭不能删除交易事实或解锁未知订单 |
| 反馈状态 | 操作使用稳定 ID、owner/env；批次关联各市场子项，区分 accepted、filled、partial、unknown 与仓位归零；完整状态转换清除过期错误 |
| 通知宿主 | 一个全局 Sonner Toaster 负责位置、堆叠和显示生命周期，跨交易路由保持 |
| 内容组件 | 普通提示用标准 toast；订单/全部平仓用自定义任务内容，可复用 OrderToast 的行、计数与明细，移除其独立 portal/固定定位/重复计时外壳 |
| 持续时间与语言 | 等待、未知和部分结果按业务规则持续可查；终态更新同一 ID；保存语义数据，内容组件订阅 Lingui，切语言不重建任务 |

锁定的 Sonner 2.0.7 声明及[同版本实现](https://raw.githubusercontent.com/emilkowalski/sonner/v2.0.7/src/state.ts)已支持 `custom`、稳定 ID 更新、duration 和 dismiss 回调，无需为了统一通知引入另一套库。`toast.promise` 不能替代交易状态机：HTTP Promise 成功不是成交或仓位归零。合并宿主也不会自动修复 R1–R3，必须同时修正状态转换、身份归属与可见性判断。

如果产品继续要求一个可滚动的汇总队列，可把队列内容保留在统一宿主中；不必把每个子单拆成一条短 toast。上述是推荐结构，具体并发数量、收起/重开及刷新恢复策略应在实施前补齐验收条件。[本次核对记录](work-memory/sessions/2026-09-21-feedback-host-consolidation-review.md)保留证据与查询限制。

## 后续修复状态（2026-09-21，取代上述未实施状态）

状态：本地实现已完成，未发布。保留前文行号、截图几何与测试结论对应的原基线，不把它们换成新代码的证据。完整当前入口矩阵、时长和恢复边界在[全局操作通知规范](trading-notifications.md)，实际最终检查由[交付任务记录](work-memory/sessions/2026-09-21-global-sonner-notifications.md)列出。

| 发现 | 已采用的实现 | 仍需遵守的边界 |
| --- | --- | --- |
| R1 晚到成功残留错误 | queue 状态转换清掉旧 error、outcome、计数与 message，成功内容不显示历史错误；普通订单/TWAP 同项更新 | 迟到事实必须来自原跟踪身份，不能仅因请求 Promise 成功断言成交 |
| R2 切页不可见与过早过期 | `AppToaster` 中全局稳定挂载 `OrderNotificationHost`；成功只有到 Sonner 最前台才启用有限计时 | 不是完整通知历史；没有 pending 的已完成通知不在刷新后重放 |
| R3 错账户反馈 | queue 必填 owner/env，宿主和内容只呈现当前身份；普通订单/TWAP 对账不再用无身份 Sonner fallback | 原账户迟到结果仍核销；过滤展示不能取消交易事实处理 |
| R4 两套浮层遮挡 | OrderToast 改为纯内容，任务、标准提示和资金恢复使用同一 Sonner 堆叠 | 默认三条展示上限包含 custom；不再维护另一张独立历史队列 |
| R5 601–1000px 遮住导航 | Toaster 普通 offset 与 mobileOffset 都按应用 <=1000px 规则避开导航、安全区及 12px 间隙 | 实际视口测试与物理设备验收范围须分别记录 |
| R6 部分成交计数不准确 | filled 模式明确标为完全成交数，并保留逐市场实际量与状态；只有 filled 状态时标记 filled-unverified | 不编造成交量，不把接受、成交和仓位归零合并；后台不设置 positionsClosed |
| R7 平仓无即时反馈 | 单仓与全部平仓点击即建立 scoped pending；跟踪器保存 queueId，后续更新原任务，部分/未知常驻 | dismiss 不解锁、不撤单、不重发；已关闭的未决项可随新状态再次出现 |

同轮补齐限价平仓、反手、TP/SL、逐仓保证金、撤改单、TWAP 取消、现货兑换、模式/杠杆与推荐动作的任务反馈。可持久 pending order/TWAP 在刷新后恢复；旧记录缺少展示 metadata 或可选 metadata 校验失败时，仅显示可证明的信息，不丢合法跟踪事实。pending trading action、普通保证金/模式调整等没有因此新增持久恢复。

资金恢复提醒进入同一堆叠，CCTP 保留自身持久记录与标准 Sonner，API 钱包密钥和金库/质押核验面保留。前文官方只有一个 toaster 的证据是对照，不是本地已通过验证的依据；本轮未以新的主网交易或真实钱包签名验证通知迁移。
