# 确认面契约：展示的数量必须约束执行的数量

状态：已采用，2026-09-20 建立。范围：终端里让用户确认一笔会移动资金或改变仓位的动作的弹窗与面板。本文是该契约的归属文档；[ADR 0017](adr/0017-market-close-confirmed-size-ceiling.md) 记录它在市价平仓上的首次落实与取舍。

**目前只有市价平仓完整满足本契约。** 其余确认面的核对状态见「尚未核对或已知例外」，不要因为它们出现在本文里就当作已经满足。

## 为什么需要它

项目一直有「执行不得信任展示值」的规则（`agent.md`：Financial action execution must recheck current identity, market, legal status and required snapshot availability, not merely trust displayed component values）。它的对偶规则此前没有写下来：**执行可以用更新的数据重算，但不能超出用户点击时看到的承诺。**

缺了这一条，市价平仓出现过这样的窗口（2026-09-20 在 dev `5ea5d625` 上用测试复现）：确认弹窗展示 `2.5`，用户点击后、提交流程等待锁和仓位快照期间，实时仓位增长到 `2.6`；提交流程按「Max × 最新仓位」重算，所有既有守卫通过，发出 `2.6` 的 reduce-only 市价单。50% 意图同理（展示 `1.25`，发出 `1.3`）。reduce-only 保证不会反向开仓，但「看到 2.5、平掉 2.6」不是用户确认的内容。

## 不变量

1. **确认控件的就绪态名称是静态动词。** 「Market Close」「Confirm」「Buy / Long」这类名称不插入运行时的数量、价格或计数。未就绪（`Enable`）、执行进度和成功反馈不在此列；[移动端数据展示规范](mobile-data-presentation.md)允许明确的用户动作显示进度。
2. **承诺量有唯一的权威来源，且与提交同源。** 弹窗里展示承诺量的位置（输入框、摘要行、无障碍描述）可以不止一处，但必须出自同一次渲染的同一个值，提交时传下去的也是这个值。
3. **执行若用更新的数据重算，必须以点击时展示的值为界，越界失败关闭。** 界的方向由动作语义决定，不能照搬：平仓数量是「执行量 ≤ 展示量」；兑换的最低到账量、改单的价格方向需要各自定义。没有越界只说明没有超出用户授权的数量，不等于结果对用户更有利——少平仓会留下更多敞口。
4. **确认对象与开窗时不同要明示。** 什么算「不同」由各确认面定义（市价平仓：当前有效、同方向仓位的数量不等于开窗快照）。随行情逐笔变化的价格不属于此类，不能每次刷新都触发提示。提示只在可见、可编辑的确认阶段出现，不参与「能否提交」的判断。
5. **每个确认面应当有一条跨「展示 → 承诺」边界的测试。** 弹窗组件、提交流程和会话 store 用真实实现，数据在网络与 SDK 边缘给定；读取屏幕上的承诺量 `D`，点击，再断言发出的量满足第 3 条的关系，拒绝路径零下单、放行路径恰好一次。展示用的外壳（对话框容器、输入框、滑杆、按钮）可以用透传属性的替身，但替身不得参与数量的计算或传递，执行守卫必须真实执行。只测 UI 或只测提交流程都不能发现这类缺陷。
6. **订单类确认面点击即关闭，状态只走通知。** 自 2026-09-21 起（产品负责人：「不应该显示状态，应该和其他按钮一样，订单状态放在右下角的通知里」），市价平仓、全部平仓、限价平仓、反手与下单确认的确认控件不显示「校验中 / 提交中 / 确认中」，弹窗正文也不展示提交错误或对账提示。点击确认后弹窗立即关闭，提交在后台执行，被锁、待对账、部分成功、成功与失败各发一条右下角通知。三点必须同时成立：同一次点击内用同步 ref 防止重复触发；承载提交钩子的组件保持挂载到提交结束，因为执行守卫读取它的实时数据，卸载会冻结快照或直接失败关闭，甚至把已经成交的结果报告成失败；会话存在期间入口不能再次打开，否则新的会话会替换掉正在后台提交的实例。弹窗一旦不再是模态的，用户就能在提交期间切换页签、切换移动端底部导航或跨过桌面与移动的断点，所以会话的所有者不能放在页签面板里：全部平仓、反手与限价平仓的会话存放在 `stores/use-position-dialog-store.ts`，由 `PositionDialogHost` 承载，它与市价平仓一样经 `GlobalModals` 挂在页面层；每次打开分配新的会话 ID，结束时只结束自己的那个会话。普通下单的提交器常驻在下单面板里，状态由右下角的订单队列（`OrderToast`）给出；持仓类动作走 sonner 通知，两者位置相同。第 1 条里「执行进度不在此列」的豁免不再适用于这五个确认面。

   同日第二批把同一做法扩展到其余会提交交易动作的弹层与按钮，判断标准只有一条：**确认控件的名称不随提交进度变化，状态不写在按钮上，也不写在弹层正文里**。
   - 止盈止损与逐仓保证金：会话同样进入 `use-position-dialog-store`（`tpSl`、`isolatedMargin`），由 `PositionDialogHost` 承载；点击 `Confirm` / `Add Margin` 等静态动词后弹层立即隐藏，被锁、待对账、失败与成功各发一条通知，结束后才释放会话。待对账时为该资产写入的占位（reservation）不变，所以重新打开后再次提交仍会被「另一笔订单仍在确认」拦住；弹层内原先常驻的「关闭后重新打开」提示随之删除。两个弹层用 `useLingeringValue` 多挂载 250 ms 以播放退出动画，关闭中的实例按已取消处理（`canSubmit` 含 `open`）。
   - 撤单：`CancelAllOrdersModal` 不再接收 `isSubmitting` 与 `errorMessage`，点击 `Cancel All` 先关闭再校验与提交；工具栏的 `Cancel all` / `Cancel selected` 与行内 `Cancel` 都是静态文案，提交期间只是禁用。撤单的每一条反馈（提交前被拦、响应未确认、失败）在写入列表上方提示行的同时发一条通知，交易所确认成功时发 `Order cancellation confirmed.`；通知与提示行使用同一个会话守卫，账户切换后迟到的结果两边都不显示。响应丢失之后的最终结论仍由页面级的 `OrderReconciliation` 给出。
   - 改单：移动端改单弹层在点击后隐藏（`open={modifyPhase === "idle"}`），桌面行内编辑器在点击后收起；按钮不再显示 `Modifying...`、`Waiting for confirmation...` 或转圈。失败时清空编辑会话，错误进入提示行与通知，不再把弹层或编辑器重新弹出来。
   - TWAP 终止：按钮文案固定为 `Terminate`，结果本来就由页面级的 `TwapReconciliation` 通知。
   - 现货兑换：点击 `Swap` 后弹层隐藏，组件保持挂载到提交结束再关闭全局弹层（`close("swap")` 只关闭自己这一类，不会误关后来打开的其他弹层）；成功、被锁、待对账与失败各发一条通知，弹层内的成功卡片与错误块删除。
   - 账户模式：点击 `Confirm` 即关闭，成功通知仍由调用方发出，失败改为通知。提交期间不再锁住弹层的关闭：账户模式需要主钱包签名，外部钱包的签名窗口可能停留很久，重新打开的弹层必须能关掉；重复提交由 `isUpdating` 禁用与同步 ref 拦截。
   - 杠杆与保证金模式：点击 `Confirm` 即关闭，按钮不再转圈，也不再变成 `Updated to {n}x` 后延时自动关闭；成功通知 `Leverage updated to {n}x` / `Margin mode updated`（两者同时变化时合成一条），失败通知沿用交易所或守卫给出的原因。通知里的杠杆**不是弹层自己记住的数**：`applyMarginAndLeverage()` 现在返回实际生效的杠杆（按当前上限取整、夹紧之后的值），没有发生变化或会话已经切换时返回 `null`，此时不发通知。回归 `slider-effective-leverage-regression` 的 A1 用「上限从 20 收紧到 10」复现过弹层想报 15x、实际提交 10x 的情形。两个弹层在请求期间同样不再锁住关闭，弹层级的 `updateError` 属性与错误块删除。账户或网络在请求期间切换时不发通知（弹层外壳用 ref 记住发起时的会话标识）。
   - 桌面下单按钮：提交订单期间不再显示转圈（订单状态由右下角的订单队列给出）；`Enable Trading` 的签名阶段仍然转圈，它是钱包握手，不是订单状态。

   资金类（划转、发送、充值、提现）按钮保持 `Transfer`、`Send`、`Deposit`、`Withdraw` 的名称，不再变成 `Transferring...`、`Sending...`、`Processing...`，也不再转圈；同日稍后按 [资金类弹层的结果反馈](funds-dialog-outcome-plan.md) 把结果改为通知、请求结束后关闭弹层。它们**没有**改成点击即关闭，这是有意的，也与官方终端一致：划转与发送的弹层承载着提交身份（关闭即让排队中的请求失效）、提交前后的余额与地区复核，以及按稳定代码存储、可随语言切换重译的守卫错误，失败后用户在原地修改重试而不必重新输入目的地址；充值与提现是多步流程，状态页与恢复入口保存着链上操作的恢复信息，换成会自动消失的通知会丢掉恢复路径。要改它们需要单独的设计。

   `action-progress-label-contract.test.ts` 扫描 `components/trade` 下所有以省略号结尾的文案并逐个登记原因（被动加载、钱包握手、状态页）；交易或资金控件重新出现进度文案会让它失败。
7. **改动确认控件内容的重设计按行为变更处理。** 视觉或文案调整如果改变了确认控件展示什么、承诺什么，需要写明设计说明或 ADR，并同步第 5 条的测试。纯字体、间距、颜色调整不需要。

## 市价平仓的落实

| 不变量 | 实现 | 回归 |
| --- | --- | --- |
| 1 | 确认按钮文案为静态 `Market Close`；数量通过 `aria-describedby` 指向的 sr-only 描述提供给辅助技术，不进入按钮名称，也不使用 assertive 播报。滑杆手势期间的提交锁用 ref 实现：`handleSubmit()` 里拦截，同一个 ref 作为 `isActivationLocked` 交给 `TradingActionButton`，连未就绪时的 `Enable` 分支一并拦住；手势锁本身不改变按钮的 `disabled` 与样式（数量为零、仓位不可读时仍照常禁用）。全站六个带滑杆的交易面做法一致，见下文「滑杆手势期间不把提交按钮置灰」（`components/trade/positions/position-market-close-modal.tsx`） | `trading-action-button-label-contract.test.ts`、`position-market-close-modal.test.tsx`、`position-market-close-display-commit.test.tsx`（手势期间的点击不关闭弹窗、不发平仓请求）、`trading-action-button.test.tsx`（真实按钮在锁定时既不启用交易也不执行动作） |
| 2 | `Close size` 输入框、sr-only 描述与 `handleSubmit()` 传出的 `confirmedCloseSize` 都来自同一次渲染的 `sizing.normalizedSize` | `position-market-close-modal.test.tsx`（实时仓位移动后，三种意图下传出的值等于输入框所示） |
| 3 | `usePositionMarketCloseSubmit().submit()` 的必填参数 `confirmedCloseSize: string \| null`：确认会话必须是正数，直提会话（不出弹窗）必须是 `null`，`dismissed` 会话不是合法入口；校验在 `try` 内、取锁与任何请求之前，失败走统一的通知与会话释放。用最新仓位重算后若大于上限，以 `close-size-exceeds-confirmed` 失败关闭；小于等于放行。固定数量意图在仓位不足时仍按原规则拒绝，不自动缩量 | `position-market-close-submit.test.tsx`、`position-market-close-display-commit.test.tsx` |
| 4 | `hasPositionMarketCloseSizeChanged`（`domain/trade/position-market-close.ts`）用开窗快照与当前仓位纯推导，无 effect、无历史状态；数量回到开窗值时提示消失。只在 `presentation === "confirmation"`、`phase === "idle"`、未开始关闭且仓位状态正常时渲染 `<output aria-live="polite">` | `position-market-close.test.ts`、`position-market-close-modal.test.tsx` |
| 5 | `position-market-close-display-commit.test.tsx`：真实弹窗 + 真实提交钩子 + 真实会话 store，保留两次真实执行守卫；用「点击后暂停仓位请求 → 推进实时仓位与 REST 仓位 → 放行」复现时序。`@gatu/ui` 外壳、`NumberInput`、滑杆、`TradingActionButton` 与 `@/lib/hyperliquid` 的数据 hook 是替身，因此它不证明按钮的交易就绪流程、真实输入事件、关闭动画或辅助技术的实际播报 | 同左 |

复现时序的注意事项：只让 REST 仓位变大、实时仓位保持不变，会被 SDK 边界既有的 `assertLivePositionMatches`（`|当前仓位| ≥ 平仓量`）拦下，这样的用例在没有上限时也会通过，不能证明上限有效。必须让实时仓位在规划之前追上。

预估盈亏不含手续费，弹窗在按钮下方的说明区注明（`Estimated PnL excludes fees`，仅在展示预估盈亏时）。移动端摘要是一行四项，2026-09-20 实测在 335px 与 320px 内容宽度下，把该说明并入盈亏标签会让 en、hi、fr 截断，因此标签不变。

## 尚未核对或已知例外

| 确认面 | 状态 |
| --- | --- |
| 全部平仓 `position-close-all-modal.tsx` | 2026-09-21 起确认按钮是静态的 `Close All Positions`，不再带仓位数，也不再显示校验、提交、确认中或部分成功等状态；仓位数留在摘要与说明里。点击即关闭弹窗，组件保持挂载到提交结束，结果只走右下角通知（与 [ADR 0014](adr/0014-market-close-submit-and-dismiss.md) 的市价平仓一致），标签契约测试已把它登记为静态。展示 → 承诺的核对未做：弹窗展示的是打开时冻结的快照，提交钩子按快照键与实时仓位逐项复核并失败关闭，但没有像市价平仓那样的跨边界测试 |
| 限价平仓 `position-limit-close-modal.tsx` | 2026-09-21 起满足第 1、6 条：按钮固定为 `Place Limit Close`，点击即关闭，结果走通知。展示 → 承诺的核对未做 |
| 反手、下单确认 | 2026-09-21 起满足第 1、6 条：反手按钮固定为方向动词，不再变成 `Reversing...`；下单确认先关闭弹窗再发单，按钮不再变成 `Submitting...`。展示 → 承诺的核对未做；下单确认的 `useOrderConfirmation` 同时快照输入与草稿并在确认时复核，属于另一种满足第 3 条的做法。2026-09-21 起下单确认的正文对齐官方终端的字段：操作、数量、价格、预估强平价格（现货无强平行），操作与数量按方向着色；市场、滑点、杠杆、订单价值、保证金、费用不再重复（仍在下单面板的摘要里）。会改变提交内容的参数只在适用时出现：类型（高级订单，以及非 GTC 的限价单）、触发价、Scale 与 TWAP 参数、止盈止损、只减仓。桌面弹层与移动抽屉共用 `buildOrderConfirmationRows`，`order-confirmation-rows.test.ts` 钉住 |
| TP/SL、逐仓保证金、现货兑换 | 2026-09-21 第二批起满足第 1、6 条：按钮为静态动词（逐仓保证金经由已登记的 `submitLabel`），点击即关闭，结果走通知。展示 → 承诺的核对未做。取舍：取消成功但补单失败这类不确定结果原先常驻在弹层里，现在只有一条会自动消失的通知；资产占位仍然拦住重复提交，但解释不再常驻 |
| 撤单、改单、TWAP 终止、账户模式 | 2026-09-21 第二批起满足第 6 条，见上文。它们使用普通 `button` / `Button`，**不在**标签契约测试的发现范围内，由各自的渲染测试钉住（`cancel-all-orders-modal`、`desktop-orders-cancel-all`、`mobile-orders-card`、`mobile-order-modification`、`desktop-twap-tab`、`account-mode-modal`） |
| 保证金模式、杠杆 `tradebox/margin-mode-modal.tsx`、`tradebox/leverage-modal.tsx` | 2026-09-21 第二批起满足第 1、6 条，见上文；杠杆弹层在标签契约里登记为静态 |
| 发送、划转、充值、提现 | 2026-09-21 起按钮名称静态（外部钱包等待签名时显示钱包握手提示 `Confirm in wallet`）；**有意不**点击即关闭，而是保持打开到请求结束、随后关闭、结果走通知，与官方终端一致；充值在广播前失败时留在表单内重试。CCTP 充值的转发进度由页面级的 `CctpDepositTrackingNotifier` 用一条可原位更新的通知呈现。做法、与官方的对照和偏差见 [资金类弹层的结果反馈](funds-dialog-outcome-plan.md)。展示 → 承诺的核对未做 |
| 推荐码与领取奖励 `referrals/referral-action-modal.tsx` | 2026-09-21 起点击 `Confirm` / `Claim all` 即关闭，结果走通知；状态未确认（`ReferralActionStatusUnknownError` 或请求结果不明）为常驻警告，并提示「再次提交签名请求前先刷新推荐数据」。提交钩子在推荐看板里，弹层关闭后仍然存活；看板的 `actionBusy` 在请求期间禁用入口 |
| 金库充值 / 提现 `vaults/vault-action-modal.tsx`、质押 `staking/staking-action-modal.tsx` | 2026-09-21 起：请求期间弹层保持打开并显示进度面板（等待签名、已提交、对账），按钮区为空，质押原先的占位按钮 `Operation in progress` 已删除。对账得出结论后由页面层上报：核验成功 → 通知（金库带最终金额、佣金、平仓成本与交易哈希；质押带浏览器链接）并关闭；签名被拒或请求被拒 → 错误通知并回到复核步骤，可原地重试。**结果未知保留在弹层内**：它是资金动作标记的核验入口（`Verify again`），页面级的 `FundsActionRecoveryHost` 也会把用户带回这个弹层，改成通知会和恢复流程打架。控制器的状态机与它的测试没有改动，转换发生在 `vaults-page.tsx` 与 `staking-view.tsx` |
| API 钱包授权 / 撤销 `api-wallet/api-wallet-action-modal.tsx` | **有意保留分阶段弹层**：授权成功后要在弹层里展示、下载并确认保存一次性私钥，结果未知时要显式丢弃本地密钥，这些都不能变成会消失的通知。2026-09-21 只改了按钮：确认按钮在预检期间保持 `Sign and authorize` / `Confirm removal`（原先按钮内容会换成「正在核对最新数据…」加转圈，现在是按钮上方的一行状态），进行中不再有 `Processing…` 占位按钮 |
| LiFi 跨链桥 `tradebox/bridge/*` | 未改。功能开关 `VITE_LIFI_BRIDGE_CREATE_ENABLED` 默认关闭；执行页是一个多笔交易、由当前页面驱动的执行跟踪器（可恢复），不是确认按钮上的进度 |

`trading-action-button-label-contract.test.ts` 只覆盖渲染 `TradingActionButton` 的文件，名称如此，覆盖范围也如此。它用 TypeScript AST 检查该按钮子节点里的插值模板、`<Plural>`、带值的 `<Trans>` 与字符串拼接，并登记经由变量给出的名称；变量、属性、函数调用等它无法判断的表达式按源码文本登记，内容要靠人审查。发现按文件聚合：一个文件开始或停止渲染该按钮、或者登记的表达式集合变化时测试失败，借此要求对照本文审查一次；在已登记文件里再加一个只用静态动词的按钮不会触发。

## 滑杆手势期间不把提交按钮置灰（2026-09-20 产品负责人决定）

「滑杆手势期间锁定提交」是[滑杆交互契约](slider-interactions.md)与 [Runtime guardrails](runtime-guardrails.md) §10 的要求。此前六类带滑杆的交易面（七个组件入口：杠杆与保证金模式共用一种滑杆）除了拦截提交，还让提交按钮在手势期间禁用，于是每次触碰滑杆（包括只点一下轨道）主按钮都闪成禁用态。产品负责人判断这是过度设计，要求对齐官方终端；现在手势状态本身不再参与任何按钮的禁用，原有的有效性、可用性与提交中条件保持不变。

| 交易面 | 锁的位置 | 改动前的可见禁用 |
| --- | --- | --- |
| 桌面下单 `tradebox/trade-panel.tsx` | `handleCtaClick()`（包住按钮的全部动作：连接、启用交易、充值、提交）与 `canExecuteOrder()` 里的 `sizeInteractionRef` | `disabled={… \|\| isSizeInteracting}`，覆盖按钮的全部动作 |
| 移动下单 `mobile/mobile-trade-view.tsx` | 同上 | `canSubmit: … && !isSizeInteracting`，只覆盖提交；启用交易等分支此前不受锁，现在与桌面一致 |
| 市价平仓 `positions/position-market-close-modal.tsx` | `handleSubmit()` 里的 ref + `isActivationLocked` | `isSizingInteractionActive` 进入 `canSubmit` |
| 限价平仓 `positions/position-limit-close-modal.tsx` | 同上 | 同上 |
| TP/SL `positions/position-tpsl-modal.tsx` | `handleSubmit()` 里的 `amountInteractionSnapshotRef` + `isActivationLocked` | `isAmountInteracting` 进入 `canSubmit` |
| 杠杆 `tradebox/leverage-modal.tsx`、保证金模式 `tradebox/margin-mode-modal.tsx` | `handleConfirm()` 里专用的手势 ref（外加原有的拖动草稿判断）+ `isActivationLocked` | 拖动草稿进入 `disabled`；锁读的是渲染闭包里的 state，手势开始后要等一次渲染才生效 |

保证金模式弹窗里，拖动草稿同时被用作「已提交的杠杆」标记；它的 `disabled` 改用 `submittedLeverage !== null`，所以提交期间的外观不变，只有手势不再置灰。

依据：

- **官方做法**（2026-09-20 对 `app.hyperliquid.xyz` 前端包的静态阅读，未经账户实测）：主下单按钮的禁用条件是 `b===0 || at || nt===0 || Number(f)===0 || …`——滑杆百分比为零、超量或余额不足、数量为零、缺价格，以及各订单类型自身的有效性；平仓按钮是数量为零或超量；杠杆确认是杠杆为零。三处都没有拖动或手势项，按钮组件里也没有任何 drag 相关代码。
- **来历**：可见禁用与 ref 守卫都出自同一次提交 `178661c3`（2026-09-10，滑杆交互重构，提交信息无正文）。仓库里对它的书面理由只有滑杆交互契约里的一句话；没有任务记录或 ADR 记载它对应过某次真实事故。
- **它防的是什么**：拖动期间表单里的数量是预览值——滑块位置按帧绘制，数量按至多每 15 ms 一次的节奏发布预览，松手才提交；Esc、失焦、`pointercancel`、窗口失焦、resize 都会回滚到起始值。锁的含义是「不提交一个可能被回滚、也可能落后于滑块位置的预览值」。杠杆弹窗同理：拖动中显示的是草稿杠杆，确认应用的却是已提交的那个值。
- **真实用户能否触发**：同一指针不能（指针被滑杆捕获到松手）；键盘不能（拖动时焦点在滑杆的原生 range 输入上，Tab 移走焦点会先取消手势并恢复起始值）；第二根手指通常也不能（浏览器只为单指点按序列合成 `click`，未在真机上验证）。剩下的是程序化点击、辅助技术和混合输入这类边缘路径。
- **两层保护的成本不同**：ref 在指针按下的同一刻生效，没有界面代价；可见禁用要等一次渲染才生效，不增加任何保护，却让整个表单在每次触碰滑杆时多渲染两次。杠杆与保证金模式此前连提交路径里的判断也读的是 state，本次改为同步的 ref，锁比改动前更早生效。

手势锁属于输入协调，不是可用性：资金、行情、签名、地区等可用性仍然必须用显式布尔值禁用按钮（[移动端数据展示规范](mobile-data-presentation.md)），不能改成这种静默的 ref。锁随手势结束而解除；焦点离开滑杆会取消手势并恢复起始值，此后的确认针对的是当时屏幕上已恢复的值。

回归：`order-submission-wiring.test.ts`（两个下单表单的锁在提交路径里、`disabled` 与 `canSubmit` 不含手势项）、`tests/mobile-trade-size-validation-a11y.test.tsx`（真实移动下单表单 + 真实滑杆指针事件）、`position-market-close-modal.test.tsx`、`position-market-close-display-commit.test.tsx`、`position-limit-close-modal.test.tsx`、`position-tpsl-modal.test.tsx`、`leverage-modal.test.tsx`、`margin-mode-modal.test.tsx`、`trading-action-button.test.tsx`。桌面下单表单没有渲染级的单元测试（仓库里只有源码契约与浏览器夹具覆盖它），它与移动端共用同一段 `canExecuteOrder()` 结构。

## 审查清单

审查或新增一个确认面时逐条回答：

1. 用户点击的那一刻，屏幕上承诺的是什么（数量、价格、方向、对象）？
2. 提交流程最终发出的值从哪里来？是同一个值，还是用更新的数据重算的？
3. 如果重算，点击时展示的值有没有作为界传下去？越界时是否失败关闭、走完通知与清理？
4. 从点击到发出之间有哪些等待（锁、快照、签名）？等待期间数据变化时哪条守卫会触发？有没有一条测试按真实时序构造了这个变化？
5. 弹窗打开期间确认对象变了，用户能不能看出来？
6. 这次改动如果只是「视觉对齐」，确认控件展示或承诺的内容有没有跟着变？

## 回归入口

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/position-market-close-display-commit.test.tsx \
  src/lib/tests/position-market-close-submit.test.tsx \
  src/lib/tests/position-market-close-modal.test.tsx \
  src/lib/tests/position-market-close-action.test.tsx \
  src/lib/tests/position-market-close.test.ts \
  src/lib/tests/trading-action-button-label-contract.test.ts
```
