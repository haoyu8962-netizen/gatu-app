# 交易反馈组件审查

日期：2026-09-21。代码基线：`efe8389ee8f2a19f99c2b45673dc5e78b409a1f7`。状态：完成审查，以下修复建议未实施。范围是普通下单、单仓市价平仓、全部平仓及共用通知/对账；不代表所有资金、金库、质押弹层已重新验收。实际命令、复现及限制见[任务记录](work-memory/sessions/2026-09-21-trading-feedback-components-review.md)。

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
