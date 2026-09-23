# ADR 0014：市价平仓确认后立即关闭弹窗，结果只用通知

- 状态：已接受（产品负责人，2026-09-17）；实施与验证记录见[任务记录](../work-memory/sessions/2026-09-17-market-close-submit-and-dismiss.md)。
- 关联：`AGENTS.md`「Mobile data presentation contract」（用户主动请求的动作必须保留反馈，包括不确定结果）；`apps/terminal/src/components/trade/order-reconciliation.tsx`（共享对账及其结局通知）；`docs/trading-toolbar-redesign.md`（市价平仓的订单参数）。

## 背景与约束

现状（`stores/use-global-modal-store.ts`、`hooks/trade/use-position-market-close-submit.ts`、`components/trade/positions/position-market-close-modal.tsx`、`components/trade/components/global-modals.tsx`）：

- 市价平仓会话占用全局弹窗槽位，字段含 `presentation`（`confirmation` / `direct`）、`phase`（`idle` / `validating` / `submitting` / `reconciling`）与 `error`。
- 点击「市价平仓」后弹窗保持打开，按钮依次显示「Validating... / Submitting...」，两阶段不可关闭；订单以 `confirmationMode: "filled"` 提交，交易所在同一响应里返回成交，成功后先弹 sonner 成功通知再关闭弹窗。
- 失败时错误写入会话并在弹窗内展示；未拿到成交回报时进入 `reconciling`，弹窗保留并显示「确认中」。
- 勾选「以后不再提示」后的直提路径不开弹窗（`presentation: "direct"`），但 `updatePhase("reconciling")` 与 `setError` 会把 presentation 改回 `confirmation`，即失败或对账时弹窗会被重新弹出。
- 持仓行已通过 `usePendingPositionMarketCloseAssetId` 在 `phase !== "idle"` 期间禁用该资产的全部持仓操作。

用户反馈：等待弹窗状态「很焦灼」，中间阶段没有信息价值，希望「点击即关弹窗、后台执行、成交后再通知」。等待的实际内容是提交前一次仓位快照刷新、签名与一次交易所往返，通常一到两秒。

约束：

- 不放松任何执行守卫：会话在 `validating` / `submitting` 期间必须仍存在于槽位，`assertExecutionContext` 继续在 SDK 执行边界复核会话、账户、网络与实时仓位。
- 同资产独占锁与 `blocked-market` 拒绝保持不变，作为重复提交的兜底。
- 不确定结果（对账）不能静默，依据 `AGENTS.md` 的动作反馈规则。
- 官方终端的确认弹窗是否也是点击即关，本决策没有可用持仓账号实测，不以其为依据。

## 决策

1. **提交即关闭。** `submit()` 在通过会话空闲检查后立即调用新的 `dismiss(sessionId)`，会话 presentation 从 `confirmation` 变为 `dismissed`；弹窗组件按 `presentation === "confirmation"` 控制 `open`，因此点击后立刻带退出动画关闭。`direct` 会话不受影响。
2. **组件保持挂载直到会话结束。** 全局弹窗宿主在 `presentation !== "direct"` 时渲染弹窗组件（此前条件为 `confirmation` 或有错误或对账中）。`dismissed` 时组件挂载但对话框关闭，这样提交钩子实例（含 `liveContextRef` 与执行守卫）在后台执行期间持续拿到最新实时数据；卸载会冻结实时快照，削弱执行边界复核。（2026-09-23 起被「后续」中的页面级提交宿主替代，见下文。）
3. **结果只用通知，会话不再携带错误。** 删除会话 `error` 字段、`setError`、`resetError`、`usePositionMarketCloseError` 与 `PositionMarketCloseError` 类型。成功：成交通知后关闭会话（不变）。失败与被锁（`blocked-market`）：错误通知后把 phase 置回 `idle` 并关闭会话，让用户可以立即重试。弹窗内仍显示提交前的本地校验错误与仓位状态（已平、方向变化等），这些不是会话状态。
4. **对账走通用通知。** 未拿到成交回报时立即弹一条警告通知（沿用已有文案「Order submitted. Confirming exchange status; do not retry.」），会话进入 `reconciling` 并留在槽位，持仓行继续显示平仓中；`order-reconciliation` 组件已对所有待确认提交发出成交、取消、拒绝或超时（2 分钟窗口）通知，市价平仓来源的对账在任何结局都关闭会话，不再改写 presentation 或重开弹窗。
5. **presentation 只由显式动作改变。** `updatePhase` 与其他动作不再隐式切换 presentation；`dismiss` 只在 `idle` 阶段生效。

## 备选方案

- **保留弹窗但缩短中间态文案**：仍要等一到两秒，用户反馈的核心是等待本身，否决。
- **关闭弹窗但保留会话错误并在下次打开时显示**：错误会占用槽位阻止重试与其他全局弹窗，且用户下次打开时上下文已过期，否决。
- **对账期间用不自动消失的加载通知代替警告通知**：需要在对账结束时按 id 撤销，与 `order-reconciliation` 的通用通知重复；对账结局本就有通知，一条一次性警告足够，否决。
- **把提交钩子搬到常驻宿主组件**：更大的重构，且直提路径已在持仓面板拥有常驻实例；`dismissed` 状态下保持弹窗组件挂载即可达到同样效果，否决。（2026-09-23 改为采纳，见「后续」。）

## 后果与边界

- 外部钱包用户会在弹窗关闭后看到钱包签名请求；拒绝签名走失败通知。
- 对账期间（最长 2 分钟）市价平仓会话仍占用全局弹窗槽位，与此前直提路径行为一致；该资产的持仓操作被禁用，其他资产不受影响。
- 弹窗不再有「校验中 / 提交中 / 确认中」状态，相关测试改为断言「提交即关闭且不重复提交」。
- 关闭全仓（Close All）与反手（Reverse）流程仍等待结果后关闭，本决策不改它们；如需一致化另立任务。
- 已知限制（2026-09-18 Grok 审查 F3）：确认路径的后台执行仍由 `PositionMarketCloseModal` 实例驱动，用户在校验或提交阶段离开 `/trade` 会触发宿主卸载的 `discardPositionMarketCloseModal`，执行守卫以 `trading-data-changed` 失败关闭；这与直提路径依赖持仓面板实例的既有行为一致。把执行搬到常驻宿主需要另立决策。（2026-09-23 已实施，见「后续」；离开页面时失败关闭的限制仍在，执行者改为 `PositionMarketCloseSubmitHost`。）

## 证据

- 代码：`stores/use-global-modal-store.ts`、`hooks/trade/use-position-market-close-submit.ts`、`components/trade/positions/position-market-close-modal.tsx`、`components/trade/components/global-modals.tsx`、`components/trade/order-reconciliation.tsx`。
- 测试：`position-market-close-session.test.tsx`、`position-market-close-submit.test.tsx`、`position-market-close-modal.test.tsx`、`position-market-close-action.test.tsx`、`order-reconciliation.test.tsx`、`global-modals-hip3-disclaimer.test.tsx`。
- 验证命令与本次执行结果见任务记录。

## 后续

- 2026-09-20：[ADR 0017](0017-market-close-confirmed-size-ceiling.md) 在不改变本决策的前提下，把确认按钮改为静态动词，并以点击时展示的数量作为执行上限；提交入口因此多了一个必填的 `confirmedCloseSize`。
- 2026-09-21：全部平仓按产品负责人的要求采用同一做法（「不应该显示状态，应该和其他按钮一样，订单状态放在右下角的通知里」）。确认按钮改为静态的 `Close All Positions`，不再显示仓位数与「校验中 / 提交中 / 确认中 / 部分成功」；点击后弹窗立即关闭，`PositionCloseAllContent` 保持挂载到提交结束（提交钩子的生命周期守卫要求组件存活），被锁、对账中、部分成功、全部成交与失败各发一条通知后结束会话，弹窗内不再展示提交错误。持仓页在会话存在期间禁用「Close All Positions」入口并忽略重复打开，否则新的快照会替换组件、中断后台提交。「后果与边界」里关于全部平仓仍等待结果的说法自此失效；反手与限价平仓仍在按钮上显示提交状态并等待结果，未改。实施与验证见[任务记录](../work-memory/sessions/2026-09-21-close-all-submit-and-dismiss.md)。
- 2026-09-21（同日稍后）：产品负责人要求「一并修复，还有下单弹窗按钮」。限价平仓、反手确认与下单确认采用同一做法：按钮固定为静态动词（`Place Limit Close`、`Buy / Long` 或 `Sell / Short`、下单方向），不再显示 `Validating... / Submitting... / Confirming...` 与 `Reversing...`；点击即关闭，结果只走通知，弹窗正文不再展示提交错误与对账提示。限价平仓与反手的会话状态放在组件本地，组件保持挂载到提交结束，持仓页与移动持仓页在会话存在期间忽略重复打开。下单确认的提交器在下单面板里常驻，`useOrderConfirmation.confirm()` 改为先清掉待确认项（关闭弹窗）再执行，并用同步 ref 拒绝提交期间的第二次确认或新请求；官方终端同样先关弹窗再发单（2026-09-20 对其前端包的静态阅读，未经账户实测）。这条做法已写入[确认面契约](../confirmation-surfaces.md)第 6 条。TP/SL、逐仓保证金、保证金模式、现货兑换以及划转、发送、提现、撤单等仍在按钮上显示进度，未改。实施与验证见[任务记录](../work-memory/sessions/2026-09-21-close-all-submit-and-dismiss.md)。
- 2026-09-21（Codex 只读评审之后）：评审指出上一条做法的漏洞——弹窗不再模态以后，用户可以在后台提交的一两秒内切换到 Orders 等页签，而 `Tabs.Panel` 默认不保留非活动面板，持仓列表连同承载提交钩子的控制器一起卸载。全部平仓与反手的生命周期守卫会在交易所已经返回之后抛出 `trading-data-changed`，把成交报告成失败；限价平仓的实时 ref 停止更新。以前弹窗是模态的，这条路径不存在。修复：三个会话移入 `stores/use-position-dialog-store.ts`，由页面层的 `PositionDialogHost` 承载（经 `GlobalModals` 挂载，与本 ADR 决策 2 的市价平仓同层，首次有会话时惰性加载并在空闲时预热），桌面与移动两个持仓列表只调用 store 的打开动作。评审的另一处发现也一并处理：反手控制器以仓位内容为 key，失败或被锁后 250ms 内重开同一仓位会复用已经提交过的隐藏实例，弹窗不再出现且入口被永久占用；现在每次打开分配新的会话 ID 作为 key，结束动作带会话 ID，迟到的结束不会关掉后来的会话。离开交易页或投资组合页仍会卸载宿主，与决策里市价平仓的已知限制相同。
- 2026-09-21（第二批）：产品负责人要求继续修复其余仍在按钮上显示进度的弹层。止盈止损、逐仓保证金、取消全部委托、移动端改单、现货兑换与账户模式改为点击即关闭、结果走通知；委托列表的工具栏与行内撤单、桌面行内改单、TWAP 终止只去掉按钮上的进度文案与转圈。止盈止损与逐仓保证金的会话并入 `use-position-dialog-store`，由页面级的 `PositionDialogHost` 承载；撤单、改单与 TWAP 终止不需要新的宿主，因为它们的提交结果原本就由页面级的 `OrderReconciliation` / `TwapReconciliation` 与全局的待确认动作 store 跟踪。每个面的细节、取舍与尚未覆盖的面见 [确认面契约](../confirmation-surfaces.md) 第 6 条与例外表。同一批随后覆盖了杠杆与保证金模式（通知报告的是交易所调用实际生效的杠杆，而不是弹层记住的数），资金类只把按钮名称改为静态、有意不改成点击即关闭。
- 2026-09-23：决策 2 的所有权做法被替代。复现测试（[任务记录](../work-memory/sessions/2026-09-23-market-close-page-level-submit-host.md)）证明两条路径都会丢失后台提交：确认路径里，legal 状态短暂离开 `accepted`（wagmi 重连时的 `checking`，或后台刷新失败时的 `error`）会卸载 `SharedGlobalModals` 所在分支，卸载清理调用 `discardPositionMarketCloseModal()`，还在校验中的平仓以 `trading-data-changed` 失败，已经发出的请求则提前释放了平仓中守卫；直提路径里，提交钩子长在持仓页签里，切换页签、移动端底部导航或跨越 1000px 断点会卸载它，之后所有实时检查（包括 SDK 边界的 `assertExecutionContext`）都读冻结的 `liveContextRef`，仓位缩小、反向或消失后订单仍会发出。本 ADR 否决过的「把提交钩子搬到常驻宿主组件」因此采纳：`PositionMarketCloseSubmitHost` 由 `GlobalModals` 在页面层、legal gate 与各分支之外常驻挂载，是 `usePositionMarketCloseSubmit()` 的唯一调用者，并通过 `lib/trade/position-market-close-submitter.ts` 注册提交函数；弹窗与直提入口只调用 `submitPositionMarketClose()`。宿主代码按需加载：`PositionMarketCloseSubmitHostGate` 挂载后立即动态加载宿主，不进入交易页启动预加载集合（直接打进 `global-modals` 会让运行时启动体积比 HEAD 多约 3.5 KB gzip，超出预算）。宿主注册前，直提回退为确认弹窗；确认最多等待 5 秒宿主注册，超时则释放会话并发失败通知。分支切换只丢弃 `idle` 会话（`discardIdlePositionMarketCloseModal`），进行中的会话留给宿主；宿主自身卸载（离开交易页或投资组合页、行情未就绪）时强制丢弃它仍在执行的会话，执行守卫照旧失败关闭；对账中的会话也一并释放，对账本身由根级 `OrderReconciliation` 继续跟踪。`dismissed` 弹窗仍保持挂载，只为退出动画，不再承担提交。
- 2026-09-23（同日稍后，[对抗审查](../work-memory/sessions/2026-09-23-claude-eight-commit-adversarial-review.md) F1、F2）：上一条的按需加载留下两个缺口。宿主注册前点击确认时，会话仍是可编辑的 `idle`，后续编辑会改变本次执行量；同一会话的重复调用还会在结束时删掉首次调用的运行标记，使宿主卸载时不再丢弃这次仍在执行的提交。修复后，`submitPositionMarketClose()` 在点击的同步阶段封存一次「提交尝试」：建立唯一的待处理通知、关闭弹窗、让会话离开 `idle`，并把数量意图、显示上限与「不再提示」一起冻结在尝试对象里，然后才等待宿主。同一会话的后续调用复用这次尝试，不再重复派发；宿主按尝试对象（而不是会话 ID 字符串）记录执行中的提交；执行只读冻结的意图。等待超时则按同一条通知报告失败并释放会话。
