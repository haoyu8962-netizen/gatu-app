# 全局操作通知规范

状态：2026-09-21 已实施，尚未发布；本次验证结果与限制由[交付任务记录](work-memory/sessions/2026-09-21-global-sonner-notifications.md)保存。本文是当前 Reference，取代[交易反馈审查](trading-feedback-review.md)中双宿主、平仓无即时反馈等旧实现描述；旧审查和官方观察保留为历史证据。决策与备选方案见 [ADR 0019](adr/0019-global-trading-notifications.md)。

2026-09-22 时长调整：按用户要求，未确认、部分成交、失败和取消结果改为前台显示 3 秒后自动隐藏；正在提交/确认中的进度继续常驻。范围与验证见[三秒结果通知任务](work-memory/sessions/2026-09-22-notification-result-timeout.md)。

2026-09-22 生命周期修复：对[残留通知审查](work-memory/sessions/2026-09-22-stale-submitting-notification-review.md)发现的重复展示与旧 pending 常驻，增加可取消发布、展示实例失效订阅和迟到节点清理；关闭提示与结果同批到达时也分别管理新旧展示。实现与实际验证范围见[修复任务](work-memory/sessions/2026-09-22-notification-lifecycle-fix.md)，尚未发布。

## 目标与非目标

用户发起的操作要有连续、准确、属于当前账户的反馈。一次请求从等待到最终结果使用同一任务，离开交易页不丢失已记录的反馈。未知不能显示为失败，接受不能显示为完整成交，成交不能自动推导为仓位归零。

通知只负责呈现。它不是交易所的执行队列、自动重试器或完整交易历史，也不替代订单列表、成交历史、资金账本和恢复面板。原有签名、数量上限、资产锁、资金守卫、持久化事实和对账保持各自职责。

## 唯一宿主与入口矩阵

[AppToaster](../apps/terminal/src/components/app-toaster.tsx) 在应用运行时浮层中稳定挂载，组合一个 [Toaster](../apps/terminal/src/components/ui/sonner.tsx)、订单通知 gate、`CctpDepositTrackingNotifier`、`PrivyFiatFundingHostGate` 与 `FundsActionRecoveryHost`。gate 只在当前 owner/env 存在未隐藏任务时按需加载 [OrderNotificationHost](../apps/terminal/src/components/trade/order-notification-host.tsx)。首次加载期间队列保留最新结果，宿主加载并发布通知后才开始成功展示计时。它不依赖交易页、选定市场就绪或桌面/移动交易布局。订单宿主及两个资金桥向同一个 Sonner 容器写内容，不各建固定定位容器。

| 入口 | 当前反馈 | 对账、刷新与保留边界 |
| --- | --- | --- |
| 普通市价、限价、触发单、Scale | `useOrderSubmit` 建立带 owner/env 的任务；校验后的提交、待确认、部分、失败及最终结果原位更新 | `useTrackedOrder` 关联 queueId、cloid 与 pending 记录；后台 WS/REST 更新同项。刷新可从仍保存的 pending order 恢复 |
| TWAP 创建 | 同一任务呈现提交、待确认、未确认及已核实结果；后台历史分别显示等待触发、已完成、已终止或已停止，不一律称运行中 | `useTrackedTwapOrder` / `TwapReconciliation` 从保存的 intent 恢复。这里报告创建请求的确认，不是每笔分片的持续执行进度或完整 TWAP 历史 |
| 单仓市价、全部平仓 | 点击后即创建 pending；弹窗立即退场。全部平仓一张任务卡包含可滚动的逐市场结果 | 新 pending 记录保存批次与子项 metadata；同步回包和后台对账关联同一任务。只有原提交路径取得完整成交和新仓位快照证据，才能称全部仓位已平 |
| 限价平仓、反手 | 同一带身份任务承接 pending、blocked、confirming、partial 与最终结果 | 跟踪器关联 pending order；挂单已接受和完整成交分别显示，不把限价委托当成已经平仓 |
| 持仓 TP/SL | 点击即 pending；更新、部分失败、未知及守卫拒绝更新同项 | 实际补单关联 pending order；取消后补单失败等工作流结果不能仅凭订单创建成功推导整段操作成功。资产占位保持；持久恢复依赖已有订单记录，不承诺重放完整工作流 |
| 逐仓保证金 | 点击即 pending；确认、明确失败或不确定结果更新同项 | 普通保证金请求的反馈仅内存保存，没有新增刷新恢复或后台确认来源；未知需按现有指引核对 |
| 撤单、改单、TWAP 终止 | claim 时创建同 ID 任务；提交、等待新快照、未知、明确失败和最终确认原位更新 | `pending-trading-action` 仍是真值；全局对账用新鲜订单/TWAP 快照确认。离开列表不丢结局；该 action store 未持久化，不承诺刷新恢复这些操作 |
| 现货兑换 | 点击即建立 scoped 任务，关联实际 spot 订单；部分成交与未知显示 3 秒 | 使用普通 pending order 恢复。表单卸载不阻止原任务接收结果；不把请求成功当作全部兑换成交 |
| 账户模式、杠杆、保证金模式 | 点击即 pending；语义成功/失败更新原任务，成功使用实际应用值 | 仅内存反馈；没有新增持久化动作或对账。无变化/已失效的操作沿用原执行约定，不生成虚假成功 |
| 推荐码录入、创建与奖励领取 | 同 ID pending、成功、未知或失败；成功保留既有较长时长 | 仅内存反馈；未知继续提示先刷新推荐数据再签名，不自动重试 |
| 划转、发送、提现、充值弹窗 | 沿用标准 Sonner 结果通知；资金弹窗保持打开到请求结束，外部钱包保留 `Confirm in wallet`；划转、发送、提现结果不明为常驻警告 | 保留尝试对象身份、草稿与资金守卫；未统一改成 OrderQueue。广播前失败的充值可回到表单；提现没有新增本地持久待处理列表 |
| CCTP 充值转发 | 标准 Sonner 同 ID loading → 转发已提交 / 明确失败；带区块浏览器链接 | ID 含 env、owner、source hash；从已有 CCTP 跟踪记录恢复。弹窗打开时让位给原转发页；转发提交不等于 HyperCore 已到账 |
| 银行卡购买 USDC（Privy 入金，默认关闭，[ADR 0034](adr/0034-privy-card-funding.md)） | 标准 Sonner：服务商确认为成功但不声称到账；已提交与状态未知为常驻警告并带未知状态符号；确定没成交为错误；已有流程在进行为警告；用户退出静默。每次展示使用新的展示 ID | `PrivyFiatFundingHost` 按尝试保存发起时的 owner/网络、结果和钱包类型，发布时翻译、切语言原位重译；别的身份为当前时撤下展示，回到该身份再显示，迟到结果记在原 owner 名下。只在内存里：刷新后不恢复，也没有服务商之后退款或拒付的监听 |
| 邮箱钱包自动充值 | 原控制器与标准 Sonner 进度/结局，稳定 ID 包含 env/owner | 原自动充值重试、恢复及路由守卫不变；并未迁入 OrderQueue |
| 金库、质押恢复 | `FundsActionRecoveryHost` 的待核验/损坏记录提醒使用 Sonner custom；`Review` 仍打开专用核验面板 | 资金 marker、账本/新状态核验、锁与两步清理确认保留；切身份只撤显示，不清 marker。合法 marker 按当前身份筛选；无法归属的损坏存储用通用锁定提醒，不猜 owner。提醒不能用普通关闭代替核验 |
| 金库、质押执行；API 钱包 | 保留核验步骤及原结果通知；API 钱包保留一次性密钥展示/保存面板 | 不将私钥、签名核验或需要用户决策的恢复步骤改成短 toast |
| 复制、CSV/图片导出、语言/设置、钱包连接等 | 保留标准 Sonner 短提示，共用位置与堆叠；提交前未建立任务的局部校验也可用短提示 | 不进入订单状态机。这些工具提示不是可回放的账户任务，不能将本次迁移理解为所有历史 toast 都有 owner/env |

## 任务身份、生命周期与恢复

[queue store](../apps/terminal/src/stores/use-order-queue-store.ts) 保存稳定任务 ID、必填 `owner` / `env`、状态以及可选展示 metadata。owner 规范化为小写，宿主只显示当前 owner/env；自定义内容在渲染时再次核对身份。A 的迟到回包可以完成 A 的记录，但不能给 B 显示通知；切回 A 时仍可显示尚未关闭的 A 任务。后台普通订单/TWAP 不再因 queue 是否可见而另发无身份 Sonner 通知。

- Sonner 的展示实例与逻辑任务 ID 分离。隐藏后重新显示使用新展示身份；退出动画及延迟关闭回调必须核对原展示身份，不能删除切回账户后重新展示的任务。
- Host 对 Sonner 的发布使用可取消 microtask，Effect 重放时被清理的 setup 不创建通知。展示实例拥有不可逆的 active 状态；内容用 `useSyncExternalStore` 订阅失效，并用 queue 单项订阅读取当前结果。失效、已隐藏、身份不符或任务消失时立即不呈现内容，同时关闭自己的 Sonner ID，覆盖库先关闭、后插入的异步竞态，并清理外层占位。
- 自定义按钮、Sonner 关闭与自动计时共用展示身份及任务引用守卫。获准关闭时先同步结束当前展示实例，再软隐藏/移除任务；若结果在同一 React 批次到达，会创建新展示，不复用仍在退出的 ID。关闭未获准的旧回调不能先调用无条件 `toast.dismiss`。
- `pending` / `confirming` / `unconfirmed` 的关闭是**软隐藏**：保留任务，不解除锁、不删除 pending 记录、不取消请求，也不重发。状态推进时同项重新显示；仅同步未变化的阶段不能把已关闭提示反复打开。
- `partial`、`failed`、`canceled` 可手动移除可见任务，也会在前台显示 3 秒后自动移除。`unconfirmed` 的自动关闭沿用软隐藏，避免未变化的对账反复弹出提示。交易事实仍在各自业务存储里；后续有已核实的新事实时，对账可以恢复同一逻辑任务通知。这里没有通知收件箱或「重新打开全部已关闭通知」入口。
- 带状态的更新清除旧 error、outcome、计数、message 与仓位归零标记，再写入新结局；纯 metadata 更新不改变状态或软隐藏。成功不能残留旧的超时错误。
- 可见任务列表仅在内存中。刷新只恢复仍存在且校验通过的 pending order/TWAP；不会重放已经完成、没有 pending 事实的通知。恢复 ID 使用原 queueId，否则使用 `reconcile-<submission id>`。
- pending order 的 `feedback` 是**可选展示 metadata**，不是真值。HTTP 已知的子项结果会随之保存；字段缺失或 schema 无效时忽略 metadata，保留合法的 pending 跟踪事实。旧记录只显示通用 Order、现有状态和可证明的计数/编号，不编造市场、方向、价格、请求量或成交量。
- 任务存语义消息或稳定反馈代码，由订阅 Lingui 的内容组件翻译；切语言不创建新任务或重发请求。错误按 [ADR 0024](adr/0024-translate-action-errors-at-render.md) 保存语义：已知的交易所拒绝文案翻译并保留交易所给出的数值，未知的逐字展示、不截断；我们自己的、SDK、网络与钱包错误不原样展示，按稳定代码或本地化描述符翻译，识别不了时显示通用或调用方兜底文案。标准 Sonner 短提示不等于全量可重译任务；CCTP 对仍显示的终态另有原位重译逻辑。邮箱自动充值的控制器回到 idle 后，残留短终态通知不会因语言切换再次重译；本次没有把这些短提示改成持久语义任务。

## 结果语义与批次明细

| 可用证据 | 允许显示 | 不能推导 |
| --- | --- | --- |
| 订单接受/挂单成功 | Accepted / Placed 等对应结果 | 已成交、已平仓 |
| HTTP 回包包含实际成交量且等于请求量 | 子项 Fully filled；`countMode: filled` 可计入「完全成交」数量 | 仓位一定归零、关联委托一定已撤销 |
| HTTP 实际成交量小于请求量 | Partially filled，保留实际量 | 将后续只有 filled 状态的推送补成请求全量 |
| Scale 全部 GTC 子项已接受，部分立即成交、其余挂单 | 提交成功；成交摘要仍显示已证明的进度和均价 | 整批已完全成交，或把正常挂单进度当作提交异常 |
| 有匹配 cloid 的单主单 `Ioc` / `FrontendMarket` 部分成交证据，后续普通 `canceled`（包括已绑定同批 TP/SL 的普通取消） | 保留部分成交；未成交余量和随父单取消的已绑定附属委托不追加整单取消错误 | 无证据或无附属绑定时忽略取消，或隐藏 `marginCanceled`、拒绝和未知等异常 |
| 带 TP/SL 的市价或限价单，已核实执行摘要为部分成交 | 在部分成交摘要下追加一句中性规则：附带 TP/SL 只在订单完全成交，或剩余部分因保证金不足被取消时才会下达，并提示检查持仓的 TP/SL | 只写「完全成交后才下达」而漏掉保证金不足的例外，声称 TP/SL 已生效、已取消或已按成交量缩小，或对未携带 TP/SL、完全成交、失败的结果显示该句 |
| WS / REST 只有 `filled`，缺少完整数量证据 | 顶层 Filled；子项 `filled-unverified`，显示 Filled (quantity unverified) | 子项 Fully filled 或虚构完全成交计数 |
| 拒绝、取消、未知混合 | 逐项区分 rejected / canceled / unknown；汇总 partial 或对应结局 | 顶层 `ok` 代表整批成功，或未知等于拒单 |
| 完整成交加原提交路径取得的新账户仓位快照确认 | All positions closed | 后台 orderStatus 单独提供同样结论 |

`acceptedCount` 是兼容既有提交器的字段名，渲染必须按 `countMode` 分辨「已接受」与「完全成交」。全部平仓使用 filled 模式；后台无法证明成交量时不输出虚构的 X/Y 完全成交计数。后台对账不设置 `positionsClosed: true`。通知不承诺清理 TP/SL，不扩大确认范围，也不对整批自动重发。部分成交的 TP/SL 提示依据 [官方 TP/SL 文档](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl)：父单完全成交，或部分成交后因保证金不足被取消，附带 TP/SL 才会下达；其余部分成交后取消会连同附带 TP/SL 一并取消。通知只陈述这条规则，不推断某一笔的附属单状态（保证金不足的分支在提交时无法区分），因此不写「已取消」，也不写成「只有完全成交才下达」这种省掉例外的绝对说法（2026-09-23 [对抗审查](work-memory/sessions/2026-09-23-claude-eight-commit-adversarial-review.md) F3 更正了最初的文案，修复见[任务记录](work-memory/sessions/2026-09-23-market-close-attempt-sealing-fix.md)）。2026-09-23 核对官方终端英文文案，官方部分成交通知只有 `Partially Filled`，没有这句规则；这是本终端在官方文档基础上补充的说明，沿用部分成交的 3 秒时长。

Scale 的成功只代表全部子项已受理，与 `execution.completeness` 的即时成交进度独立；拒绝、取消、未知子项仍按原异常/核对路径处理，`confirmationMode: filled` 不放宽。普通单笔 IOC 有效 HTTP 回包后会结束 pending 跟踪；取消与已知部分成交并存的规则适用于仍需对账或恢复的记录。只有摘要生成时根据实际 `tif: Ioc` 或 `FrontendMarket`、真实回包量价与 oid、提交 cloid 绑定的 `partialIoc` 证据可以识别余量取消；正常 TP/SL 分组会同时保存已校验的附属 cloid，后续必须先以 cloid 匹配主单的普通 `canceled`，同一可信部分成交批次中的已绑定附属普通 `canceled` 才按正常附属取消处理。`marginCanceled`、拒绝、未知、无附属绑定和缺失/损坏证据仍保持保守错误提示，不凭 `orderType: market` 猜测。

## 展示、时长与可访问性

所有浮动反馈共用 Sonner 的一个堆叠，沿用库默认 `visibleToasts = 3`，标准提示和 custom 任务共同占用这个数量。折叠时后方内容不透出；批次市场明细限制高度、允许滚动。堆叠不是一张独立可滚动的全部操作历史表。

| 内容 | 时长与关闭 |
| --- | --- |
| OrderQueue 成功 | 默认 5 秒，**只有成为 Sonner 最前台通知时才启用有限计时**；未到前台时为 Infinity，不按后台完成时间提前移除。业务可指定 `successDurationMs`，推荐动作沿用 10 秒 |
| OrderQueue 未确认、部分成交、失败、取消 | 默认 3 秒，同样只在 Sonner 最前台启用有限计时；自动关闭与手动关闭使用相同软隐藏/移除规则，不影响后台对账或业务锁 |
| OrderQueue 提交中、确认中 | Infinity；手动关闭遵循上述软隐藏规则，不影响业务锁 |
| 普通标准通知 | 默认 3 秒；保留各调用方既有覆盖值，不能把所有资金提示统一描述为 10 秒 |
| 提现/充值等已有资金结局 | 相关调用方显式配置的 10 秒保持；状态未知/已广播失败等原有常驻策略保持，划转与发送的状态未知自 2026-09-29 起同样常驻 |
| CCTP | forwarding 和明确失败常驻；转发已提交 10 秒；切账户/环境撤掉原身份的展示 |
| 资金恢复提醒 | 常驻且不允许划走关闭；通过 Review 与既有核验/清理路径处理 |

状态图标（2026-10-01，[ADR 0029](adr/0029-brand-status-motion.md)）：订单通知按状态显示品牌状态符号——提交中 `submitting`（中性色）、确认中 `pending`、未确认 `unknown`、`partial` 状态中只有已核实的部分成交（交易所回包的 `execution.completeness: partial`，或 `countMode: filled` 且没有错误）用半实心的 `partial`，只是部分受理、或带拒绝、撤销、未知子项的批次用 `warning`；成功与已受理 `success`（受理与成交靠文案区分）、取消 `cancelled`、失败 `error`；标准通知的 success、info、warning、error、loading 分别是 `success`、`info`、`warning`、`error`、`pending`。资金、Earn 的「状态未知」通知和待核验的资金操作提醒由调用方传 `unknown` 图标，未知结果从不显示成失败。符号用 `--text-*` 语义令牌着色，标准通知里与该类型的文字同色；进行中的循环从不用成功色。符号是装饰性的、不单独播报；状态切换时符号重新挂载，一次性动画只在状态变化时播放，切换语言不重播；系统开启减少动态效果时直接显示终态。

悬停、页面后台及退出动画由 Sonner 生命周期处理。Toaster 使用 `bg-overlay`、共享 `z-toast` 与主题色；项目移动断点是 `<=1000px`，两个 offset 分支均保留 56px 底部导航、安全区和 12px 间隙；桌面用安全区内右下角。没有另加高于所有弹层的硬编码层级。任务有可访问名称、状态/错误播报与关闭按钮。

真实部分成交沿用三秒是用户明确选择；不因附带 `execution` 单独延长。通知不是成交证据的唯一入口，成交历史及订单列表仍承担持续核对。正常受理的 Scale 成交进度使用成功状态和成功时长。

## 精简文案与实际成交摘要

2026-09-22 已实现，尚未发布；验证范围见[精简通知实施记录](work-memory/sessions/2026-09-22-compact-notification-implementation.md)。普通下单显示一条结果短句，实际成交时补一行均价，删除重复的订单类型、方向、Size、请求价格与 TP/SL 价格。非普通操作保留动作及市场上下文；主单成功但附属单失败仍保留错误与接受计数。

| 证据/阶段 | 中文示例（合成数值） |
| --- | --- |
| 本地准备、签名或发送 | `HYPE · 正在提交…` |
| 明确受理挂单或触发单 | `HYPE 委托已提交` |
| 有真实成交量与均价 | `已买入 1 HYPE`，下一行 `均价 $100`；卖出同理 |
| 只有 filled 状态 | `HYPE 委托已成交`；省略未知量价 |
| 真实成交量小于提交量 | `部分成交 0.4 / 1 HYPE`；已取得均价时另行显示 |
| 后台核对中 | `HYPE · 确认中，请勿重复提交` |
| 仍无法确认 | `HYPE · 结果待确认，重试前请先核对`；下方已有具体核对说明时摘要只写 `结果待确认` |
| 明确失败 | `HYPE 下单失败`，另行保留准确原因；只重复「失败」的泛化原因（如 `Order failed`、`Failed to close position`）不再单独成行 |
| TWAP 创建受理 | `TWAP · HYPE · 已创建`；不声称每个分片运行或成交 |

2026-09-29 补充（未发布）：中文按界面控件用词，订单结果与当前委托列表一致用「委托」，撤单用「取消」，TWAP 用「终止」。单一目标的市价平仓、反手与兑换部分成交时摘要写 `部分成交`，计数行只写 `请核对持仓`；多市场一键全平仍显示 `全部成交 x/y · 请核对持仓`。非普通操作成交写 `已成交`，修改/取消/逐仓保证金/止盈止损成功只写结果（`已修改`、`已取消`、`已更新`），保证金模式与账户类型成功写明实际切换到的值。审查与验证见[通知文案审查记录](work-memory/sessions/2026-09-29-notification-copy-review.md)。

[呈现 helper](../apps/terminal/src/lib/trade/order-notification-copy.ts) 显式接收响应 locale 的翻译依赖。状态更新仍是同一任务与展示生命周期，不延迟真实结果来强制播放「已提交」。结构化重复确认说明可合并；原始错误不猜测、不截断。批次继续保留所有逐市场结果及可滚动明细，完全成交计数与接受计数分别表述。

queue 与 pending feedback 的可选 `execution` 保存 `filledSize`、实际主单提交量 `requestedSize`、`averagePrice`、订单 ID、`exchange-response` 证据和 full/partial。domain helper 使用实际提交（含生成 cloid）的订单列表及回包对应位置校验；普通单仅取主单，Scale 只合并同资产同方向，TP/SL 不混入主单。加权运算用 Big.js。请求 `size` / `price` 的原义不变，成交卡不再把它们当成交证据。

`quoteToken` 随原始市场保存；USDC/USDT/USD 通过共享 `formatPrice` 显示美元符号，其他报价币通过 `formatToken` 明确显示币种，缺少报价单位时省略均价。均价先用 Big.js 限为最多 8 位有效数字，再交给共享格式化器显示完整数值（不启用 K/M 压缩），遵循用户的数字分隔符设置并订阅其热更新；数字预设与界面语言独立。均价是加权结果，可能不在委托价格 tick 上，因此不套 `szDecimals` 截断。数量保留真实十进制字符串；动态量价使用双向文本隔离，摘要保留未按展示有效位数缩减的十进制结果（加权除法沿用 Big.js 的小数精度）。损坏 execution 字段独立忽略；其中损坏的可选 `partialIoc` 也独立忽略，不破坏其余成交摘要、合法 pending 记录、其他 metadata 或业务锁。WS/REST 只有状态时不填补缺失量价，也不把已知部分成交升级成全量；后来挂单的完整成交均价仍需单独的逐单成交归集设计，近期成交列表不能替代完整证据。

桌面和手机共用相同短句与自然分行，普通成交为两行主体，不另建移动通知系统；长符号、翻译与错误允许增加行数。正文 `min-w-0` 和任意断词避免挤占关闭控件；正文与子项均可滚动，仅实际纵向溢出时提供有名称的键盘滚动区域。状态/错误播报与滚动焦点分开，短通知不增加正文 Tab 停靠点；尺寸或内容变化重新测量。各自高度不超过 `min(18rem,35dvh)`，也不超过视口扣除实际 Sonner 底部偏移、顶部安全区与 4rem 控件/间距后的可用高度的一半。20 层 Scale 长拒单与子项同时出现时，较矮视口也保留顶部与关闭控件。关闭目标至少 24px。保留主题 tokens、字号、单容器、底部导航安全距离及既定时长；不会通过缩小文字或省略号隐藏异常。

## 验证契约与证据边界

回归应覆盖真实 store、宿主、对账器与提交路径的组合：超时后晚到成功清错、未展示成功不提前消失、切路由/账户/网络、A 的迟到 REST、刷新恢复及损坏的可选 metadata、部分成交量不被覆盖、未知子项与完整成交计数、关闭不解锁、标准提示/任务/资金恢复同现、语言热切换。布局覆盖 390/600/601/800/1000/1001/1280px，验证底部导航、滚动和共享堆叠。

入口包括 `order-notification-copy.test.ts`、`order-execution-summary.test.ts`、`order-toast-placement.test.tsx`、`order-reconciliation.test.tsx`、`twap-reconciliation.test.tsx`、close-all / market-close 的 submit 与 modal 测试，以及撤改单、TP/SL、逐仓保证金、Swap、CCTP 和 funds recovery 各自套件。测试文件是验证入口，不表示每次更改都已经执行全部用例；本轮实际命令、失败、更正、源码版本和浏览器范围由[交付任务记录](work-memory/sessions/2026-09-21-global-sonner-notifications.md)列出。模拟网络和浏览器夹具不能证明真实资金交易、签名钱包或物理触屏时序；本次通知迁移不以新的主网下单作验收。

生命周期入口 `order-notification-lifecycle.test.tsx` 使用真实 Sonner、queue、根 StrictMode 和 Gate，覆盖冷/热挂载、关闭 RAF 早于插入 timer、真实卸载、身份切换及同批关闭/结果；必须同时验证任务与外层 Sonner DOM，不能只看队列为空。独立浏览器 suite 使用 `pnpm --dir apps/terminal exec playwright test --config tests/browser/notifications.playwright.config.ts`，覆盖原位更新、重复 Gate 挂载、软隐藏迟到结果和桌面/移动两主题堆叠，接入 CI 两分片。夹具缓存隔离规则见 [runtime guardrails §9](runtime-guardrails.md#9-development-and-browser-test-caches)。

生命周期单测在 collection 阶段转换真实宿主，不再仅放宽首条用例超时；Gate 套件用受控延迟 importer 验证加载就绪、身份变化和完整展示时间。2026-09-22 对抗审查的复核、更正与本轮实际验证见[修复记录](work-memory/sessions/2026-09-22-notification-review-remediation.md)。
