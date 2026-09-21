# 全局操作通知规范

状态：2026-09-21 已实施，尚未发布；本次验证结果与限制由[交付任务记录](work-memory/sessions/2026-09-21-global-sonner-notifications.md)保存。本文是当前 Reference，取代[交易反馈审查](trading-feedback-review.md)中双宿主、平仓无即时反馈等旧实现描述；旧审查和官方观察保留为历史证据。决策与备选方案见 [ADR 0019](adr/0019-global-trading-notifications.md)。

## 目标与非目标

用户发起的操作要有连续、准确、属于当前账户的反馈。一次请求从等待到最终结果使用同一任务，离开交易页不丢失已记录的反馈。未知不能显示为失败，接受不能显示为完整成交，成交不能自动推导为仓位归零。

通知只负责呈现。它不是交易所的执行队列、自动重试器或完整交易历史，也不替代订单列表、成交历史、资金账本和恢复面板。原有签名、数量上限、资产锁、资金守卫、持久化事实和对账保持各自职责。

## 唯一宿主与入口矩阵

[AppToaster](../apps/terminal/src/components/app-toaster.tsx) 在应用运行时浮层中稳定挂载，组合一个 [Toaster](../apps/terminal/src/components/ui/sonner.tsx)、订单通知 gate、`CctpDepositTrackingNotifier` 与 `FundsActionRecoveryHost`。gate 只在当前 owner/env 存在未隐藏任务时按需加载 [OrderNotificationHost](../apps/terminal/src/components/trade/order-notification-host.tsx)。首次加载期间队列保留最新结果，宿主加载并发布通知后才开始成功展示计时。它不依赖交易页、选定市场就绪或桌面/移动交易布局。订单宿主及两个资金桥向同一个 Sonner 容器写内容，不各建固定定位容器。

| 入口 | 当前反馈 | 对账、刷新与保留边界 |
| --- | --- | --- |
| 普通市价、限价、触发单、Scale | `useOrderSubmit` 建立带 owner/env 的任务；校验后的提交、待确认、部分、失败及最终结果原位更新 | `useTrackedOrder` 关联 queueId、cloid 与 pending 记录；后台 WS/REST 更新同项。刷新可从仍保存的 pending order 恢复 |
| TWAP 创建 | 同一任务呈现提交、待确认、未确认及已核实结果；后台历史分别显示等待触发、已完成、已终止或已停止，不一律称运行中 | `useTrackedTwapOrder` / `TwapReconciliation` 从保存的 intent 恢复。这里报告创建请求的确认，不是每笔分片的持续执行进度或完整 TWAP 历史 |
| 单仓市价、全部平仓 | 点击后即创建 pending；弹窗立即退场。全部平仓一张任务卡包含可滚动的逐市场结果 | 新 pending 记录保存批次与子项 metadata；同步回包和后台对账关联同一任务。只有原提交路径取得完整成交和新仓位快照证据，才能称全部仓位已平 |
| 限价平仓、反手 | 同一带身份任务承接 pending、blocked、confirming、partial 与最终结果 | 跟踪器关联 pending order；挂单已接受和完整成交分别显示，不把限价委托当成已经平仓 |
| 持仓 TP/SL | 点击即 pending；更新、部分失败、未知及守卫拒绝更新同项 | 实际补单关联 pending order；取消后补单失败等工作流结果不能仅凭订单创建成功推导整段操作成功。资产占位保持；持久恢复依赖已有订单记录，不承诺重放完整工作流 |
| 逐仓保证金 | 点击即 pending；确认、明确失败或不确定结果更新同项 | 普通保证金请求的反馈仅内存保存，没有新增刷新恢复或后台确认来源；未知需按现有指引核对 |
| 撤单、改单、TWAP 终止 | claim 时创建同 ID 任务；提交、等待新快照、未知、明确失败和最终确认原位更新 | `pending-trading-action` 仍是真值；全局对账用新鲜订单/TWAP 快照确认。离开列表不丢结局；该 action store 未持久化，不承诺刷新恢复这些操作 |
| 现货兑换 | 点击即建立 scoped 任务，关联实际 spot 订单；部分成交与未知持续显示 | 使用普通 pending order 恢复。表单卸载不阻止原任务接收结果；不把请求成功当作全部兑换成交 |
| 账户模式、杠杆、保证金模式 | 点击即 pending；语义成功/失败更新原任务，成功使用实际应用值 | 仅内存反馈；没有新增持久化动作或对账。无变化/已失效的操作沿用原执行约定，不生成虚假成功 |
| 推荐码录入、创建与奖励领取 | 同 ID pending、成功、未知或失败；成功保留既有较长时长 | 仅内存反馈；未知继续提示先刷新推荐数据再签名，不自动重试 |
| 划转、发送、提现、充值弹窗 | 沿用标准 Sonner 结果通知；资金弹窗保持打开到请求结束，外部钱包保留 `Confirm in wallet` | 保留尝试对象身份、草稿与资金守卫；未统一改成 OrderQueue。广播前失败的充值可回到表单；提现没有新增本地持久待处理列表 |
| CCTP 充值转发 | 标准 Sonner 同 ID loading → 转发已提交 / 明确失败；带区块浏览器链接 | ID 含 env、owner、source hash；从已有 CCTP 跟踪记录恢复。弹窗打开时让位给原转发页；转发提交不等于 HyperCore 已到账 |
| 邮箱钱包自动充值 | 原控制器与标准 Sonner 进度/结局，稳定 ID 包含 env/owner | 原自动充值重试、恢复及路由守卫不变；并未迁入 OrderQueue |
| 金库、质押恢复 | `FundsActionRecoveryHost` 的待核验/损坏记录提醒使用 Sonner custom；`Review` 仍打开专用核验面板 | 资金 marker、账本/新状态核验、锁与两步清理确认保留；切身份只撤显示，不清 marker。合法 marker 按当前身份筛选；无法归属的损坏存储用通用锁定提醒，不猜 owner。提醒不能用普通关闭代替核验 |
| 金库、质押执行；API 钱包 | 保留核验步骤及原结果通知；API 钱包保留一次性密钥展示/保存面板 | 不将私钥、签名核验或需要用户决策的恢复步骤改成短 toast |
| 复制、CSV/图片导出、语言/设置、钱包连接等 | 保留标准 Sonner 短提示，共用位置与堆叠；提交前未建立任务的局部校验也可用短提示 | 不进入订单状态机。这些工具提示不是可回放的账户任务，不能将本次迁移理解为所有历史 toast 都有 owner/env |

## 任务身份、生命周期与恢复

[queue store](../apps/terminal/src/stores/use-order-queue-store.ts) 保存稳定任务 ID、必填 `owner` / `env`、状态以及可选展示 metadata。owner 规范化为小写，宿主只显示当前 owner/env；自定义内容在渲染时再次核对身份。A 的迟到回包可以完成 A 的记录，但不能给 B 显示通知；切回 A 时仍可显示尚未关闭的 A 任务。后台普通订单/TWAP 不再因 queue 是否可见而另发无身份 Sonner 通知。

- Sonner 的展示实例与逻辑任务 ID 分离。隐藏后重新显示使用新展示身份；退出动画及延迟关闭回调必须核对原展示身份，不能删除切回账户后重新展示的任务。
- `pending` / `confirming` / `unconfirmed` 的关闭是**软隐藏**：保留任务，不解除锁、不删除 pending 记录、不取消请求，也不重发。状态推进时同项重新显示；仅同步未变化的阶段不能把已关闭提示反复打开。
- `partial`、`failed`、`canceled` 可手动移除可见任务。交易事实仍在各自业务存储里；后续有已核实的新事实时，对账可以恢复同一逻辑任务通知。这里没有通知收件箱或「重新打开全部已关闭通知」入口。
- 带状态的更新清除旧 error、outcome、计数、message 与仓位归零标记，再写入新结局；纯 metadata 更新不改变状态或软隐藏。成功不能残留旧的超时错误。
- 可见任务列表仅在内存中。刷新只恢复仍存在且校验通过的 pending order/TWAP；不会重放已经完成、没有 pending 事实的通知。恢复 ID 使用原 queueId，否则使用 `reconcile-<submission id>`。
- pending order 的 `feedback` 是**可选展示 metadata**，不是真值。HTTP 已知的子项结果会随之保存；字段缺失或 schema 无效时忽略 metadata，保留合法的 pending 跟踪事实。旧记录只显示通用 Order、现有状态和可证明的计数/编号，不编造市场、方向、价格、请求量或成交量。
- 任务存语义消息或稳定反馈代码，由订阅 Lingui 的内容组件翻译；切语言不创建新任务或重发请求。交易所原始错误按原文展示。标准 Sonner 短提示不等于全量可重译任务；CCTP 对仍显示的终态另有原位重译逻辑。邮箱自动充值的控制器回到 idle 后，残留短终态通知不会因语言切换再次重译；本次没有把这些短提示改成持久语义任务。

## 结果语义与批次明细

| 可用证据 | 允许显示 | 不能推导 |
| --- | --- | --- |
| 订单接受/挂单成功 | Accepted / Placed 等对应结果 | 已成交、已平仓 |
| HTTP 回包包含实际成交量且等于请求量 | 子项 Fully filled；`countMode: filled` 可计入「完全成交」数量 | 仓位一定归零、关联委托一定已撤销 |
| HTTP 实际成交量小于请求量 | Partially filled，保留实际量 | 将后续只有 filled 状态的推送补成请求全量 |
| WS / REST 只有 `filled`，缺少完整数量证据 | 顶层 Filled；子项 `filled-unverified`，显示 Filled (quantity unverified) | 子项 Fully filled 或虚构完全成交计数 |
| 拒绝、取消、未知混合 | 逐项区分 rejected / canceled / unknown；汇总 partial 或对应结局 | 顶层 `ok` 代表整批成功，或未知等于拒单 |
| 完整成交加原提交路径取得的新账户仓位快照确认 | All positions closed | 后台 orderStatus 单独提供同样结论 |

`acceptedCount` 是兼容既有提交器的字段名，渲染必须按 `countMode` 分辨「已接受」与「完全成交」。全部平仓使用 filled 模式；后台无法证明成交量时不输出虚构的 X/Y 完全成交计数。后台对账不设置 `positionsClosed: true`。通知不承诺清理 TP/SL，不扩大确认范围，也不对整批自动重发。

## 展示、时长与可访问性

所有浮动反馈共用 Sonner 的一个堆叠，沿用库默认 `visibleToasts = 3`，标准提示和 custom 任务共同占用这个数量。折叠时后方内容不透出；批次市场明细限制高度、允许滚动。堆叠不是一张独立可滚动的全部操作历史表。

| 内容 | 时长与关闭 |
| --- | --- |
| OrderQueue 成功 | 默认 5 秒，**只有成为 Sonner 最前台通知时才启用有限计时**；未到前台时为 Infinity，不按后台完成时间提前移除。业务可指定 `successDurationMs`，推荐动作沿用 10 秒 |
| OrderQueue 其他状态 | Infinity；手动关闭遵循上述软隐藏/移除规则，不影响业务锁 |
| 普通标准通知 | 默认 3 秒；保留各调用方既有覆盖值，不能把所有资金提示统一描述为 10 秒 |
| 提现/充值等已有资金结局 | 相关调用方显式配置的 10 秒保持；状态未知/已广播失败等原有常驻策略保持 |
| CCTP | forwarding 和明确失败常驻；转发已提交 10 秒；切账户/环境撤掉原身份的展示 |
| 资金恢复提醒 | 常驻且不允许划走关闭；通过 Review 与既有核验/清理路径处理 |

悬停、页面后台及退出动画由 Sonner 生命周期处理。Toaster 使用 `bg-overlay`、共享 `z-toast` 与主题色；项目移动断点是 `<=1000px`，两个 offset 分支均保留 56px 底部导航、安全区和 12px 间隙；桌面用安全区内右下角。没有另加高于所有弹层的硬编码层级。任务有可访问名称、状态/错误播报与关闭按钮。

## 验证契约与证据边界

回归应覆盖真实 store、宿主、对账器与提交路径的组合：超时后晚到成功清错、未展示成功不提前消失、切路由/账户/网络、A 的迟到 REST、刷新恢复及损坏的可选 metadata、部分成交量不被覆盖、未知子项与完整成交计数、关闭不解锁、标准提示/任务/资金恢复同现、语言热切换。布局覆盖 390/600/601/800/1000/1001/1280px，验证底部导航、滚动和共享堆叠。

入口包括 `order-toast-placement.test.tsx`、`order-reconciliation.test.tsx`、`twap-reconciliation.test.tsx`、close-all / market-close 的 submit 与 modal 测试，以及撤改单、TP/SL、逐仓保证金、Swap、CCTP 和 funds recovery 各自套件。测试文件是验证入口，不表示每次更改都已经执行全部用例；本轮实际命令、失败、更正、源码版本和浏览器范围由[交付任务记录](work-memory/sessions/2026-09-21-global-sonner-notifications.md)列出。模拟网络和浏览器夹具不能证明真实资金交易、签名钱包或物理触屏时序；本次通知迁移不以新的主网下单作验收。
