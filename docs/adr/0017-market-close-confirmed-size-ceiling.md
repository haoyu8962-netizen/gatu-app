# ADR 0017：市价平仓以点击时展示的数量为执行上限，确认按钮改为静态动词

- 状态：已接受并实施（产品负责人，2026-09-20）；实施与验证记录见[任务记录](../work-memory/sessions/2026-09-20-market-close-confirmed-size.md)。
- 关联：[ADR 0014](0014-market-close-submit-and-dismiss.md)（提交即关闭、结果只用通知，本决策不改变它）；[确认面契约](../confirmation-surfaces.md)（本决策确立的通用不变量及其覆盖范围）；[移动端数据展示规范](../mobile-data-presentation.md)（新增「确认对象与开窗时不同」一类提示）；`agent.md`「Financial action execution must recheck … not merely trust displayed component values」。

## 背景与约束

现状（dev `5ea5d625`）：

- 确认弹窗（`components/trade/positions/position-market-close-modal.tsx`）每次渲染用「实时仓位 × 意图」重算平仓数量，默认意图为 Max。该数量同时出现在 `Close size` 输入框和确认按钮文案 `Market Close {数量} {币种}` 里，随实时仓位逐帧变化。
- 点击后 `usePositionMarketCloseSubmit().submit()` 只收到会话标识。它关闭弹窗、取同资产独占锁、拉取一份全新的 REST 仓位快照，再用「意图 × 最新仓位」重算执行量。点击时屏幕上的数量不参与执行。
- 既有守卫约束的都是执行时刻的一致性：百分比意图不得超过「同一百分比 × 规划时的实时仓位」；SDK 边界要求实时仓位自规划后未变且不小于平仓量。没有任何一条以点击时展示的数量为界。

复现（2026-09-20，dev `5ea5d625`，未改动的实现 + 新增测试）：点击时展示 `2.5`，在仓位快照请求返回之前把实时仓位与 REST 仓位都推进到 `2.6`，Max 意图发出 `s: "2.6"`；50% 意图展示 `1.25`，发出 `s: "1.3"`。所有既有守卫通过。只让 REST 变大而实时仓位不变的构造会被 SDK 边界的 `|当前仓位| ≥ 平仓量` 拦下，不构成漏洞；成立的时序是实时仓位在规划之前追上。订单是 reduce-only，不会反向开仓，影响限于「平掉的量多于点击时所见」。

来历（git 可证）：首版 `5341c3df`（2026-08-04）的确认按钮是静态的 `Market Close`，当时已经按全新快照重算；同日的重设计提交 `928cebf1` 把文案改成带数量的模板，并新增断言按钮文本包含 `Market Close 1.2500 BTC` 的测试。按全新 REST 仓位重算的测试出自 `5341c3df`。也就是说，UI 一侧的测试钉住了外观，提交一侧的测试钉住了重算，两者之间没有任何测试。此后该文件又有 16 次提交，上述关系未变。静态按钮本身并不能消除展示与执行的差异——首版同样没有上限——按钮里的数量只是让这个差异变成了一个写在确认控件上的承诺。

官方做法（本会话 2026-09-20 对 `app.hyperliquid.xyz` 前端包的静态阅读，未经账户实测）：平仓弹窗在打开时快照 `{coin, szi}`，数量是本地状态，不随实时仓位变；按钮是静态的 `Market Close`，提交的 `userSz` 与展示的数量是同一个变量；提交中只禁用按钮。

约束：

- 不放松任何既有执行守卫，不改变 ADR 0014 的提交即关闭、`dismissed` 期间组件保持挂载、结果只用通知。
- 直提路径（偏好为不再提示，`presentation: "direct"`）不出弹窗，没有展示量，行为不变。
- 移动端摘要是设计稿钉住的一行四项，不增加摘要项。
- 新增提示须先更新数据展示规范；不得把被动数据状态写进确认控件。

## 决策

1. **确认按钮改为静态动词 `Market Close`。** 承诺量的展示位是已有的 `Close size` 输入框（桌面端其上已有 `Close size` 与 `Price: Market`，移动端标题栏已有 `Price: Market`）。按钮通过 `aria-describedby` 关联一条 sr-only 的数量描述和原有的不可撤销说明，辅助技术仍能读到当前数量，但数量不再是按钮名称的一部分，也不做 assertive 播报。
2. **保留实时联动，不改成官方的快照式。** 弹窗继续随实时仓位更新可平数量与按意图推导的平仓数量；用户看到的始终是当前仓位下的结果。
3. **点击时展示的数量作为执行上限。** `submit()` 增加必填参数 `confirmedCloseSize: string | null`：确认会话必须传正数（弹窗传该次渲染的 `sizing.normalizedSize`，与输入框同源），直提会话必须传 `null`，`dismissed` 会话不是合法入口。校验放在既有 `try` 内、取锁与任何请求之前，失败时走统一的错误通知与会话释放。用最新仓位重算后的数量若大于上限，以新的反馈码 `close-size-exceeds-confirmed` 失败关闭（「确认后仓位增加，本次未平仓，请重新打开市价平仓核对新的数量」）；小于等于放行。固定数量意图在仓位不足时仍按原规则拒绝，不自动缩量。
4. **弹窗打开期间仓位数量与开窗时不同要明示。** 由开窗快照与当前仓位纯推导（`hasPositionMarketCloseSizeChanged`），无 effect、无历史状态；只在可见、可编辑的确认阶段显示，不参与能否提交的判断；已平仓与方向变化仍走原有错误。数量回到开窗值时提示消失——提示表达的是「当前与开窗时不同」，不是「期间曾经变化」。
5. **预估盈亏注明不含手续费。** 标签保持 `Estimated PnL`，在按钮下方说明区增加一行 `Estimated PnL excludes fees`，仅在展示预估盈亏时出现。
6. **把「展示值必须约束执行」写成契约并加回归。** 归属文档为[确认面契约](../confirmation-surfaces.md)，`AGENTS.md` 增加指针；新增跨「展示 → 承诺」边界的测试与 `TradingActionButton` 标签契约测试。

## 备选方案

- **改成官方的快照式**：打开时冻结数量，显示即提交，最简单。但我们的提交流程有意用最新仓位重算（仓位在点击后缩小时 Max 应该平掉剩余全部，而不是因数量过期被拒），且弹窗实时反映仓位是已有行为；产品负责人选择保留实时联动。否决。
- **只把按钮改成静态，不加上限**：消除了写在确认控件上的承诺，但点击后平掉多于所见的窗口仍在——首版就是这样。否决。
- **不等即拒绝（执行量必须等于展示量）**：对称，但会让「点击后仓位缩小」的正常情形全部失败，Max 意图的用户需要反复重开。上限只约束不超出授权的数量，缩小时按意图执行。否决。
- **沿用 `trading-data-changed` 文案**：「Close and reopen it」要求关闭一个已经关闭的弹窗（ADR 0014 之后点击即关），且没有说明本次未平仓。新增专用反馈码，不改动其他调用方共用的文案。
- **把上限写进 `ExecutionContext` 并在 SDK 边界再比一次**：规划值已经 ≤ 上限，`assertOrderMatchesExecution` 保证发出的 `s` 等于规划值，重复比较没有新增保证。未采用；若以后在边界之后引入重算或重试，必须沿用同一个上限而不是刷新它。
- **给摘要加一行 `Close size`**：与输入框重复，且移动端一行四项放不下。否决。
- **把「不含手续费」并入盈亏标签**：实测移动端 335px 与 320px 内容宽度下 en、hi、fr 截断（es 现状四个标签已全部截断，属既有问题，不在本次范围）。改为说明区一行。

## 后果与边界

- 契约的精确含义是「**触发提交事件的那一次已提交渲染所展示的数量**」。按下到松开之间实时仓位仍可能更新并重新渲染；若要冻结按下时或用户最后读到的数量，是另一个交互决策。
- 没有越界只说明没有超出用户授权的数量，不等于结果更有利：仓位缩小后按百分比执行会少平，留下更多敞口。
- 上限只在仓位增长恰好发生在点击与规划之间时触发，属于少见情形；触发时零下单，用户需要重开弹窗。
- 直提路径没有展示量，仍按最新仓位平掉全部，这是「不再提示」偏好的既有语义。
- 移动端抽屉在展示预估盈亏时增高一行说明（17px 行高加 2px 间距）。
- 全部平仓的按钮名称仍含实时仓位数，限价平仓、反手、下单确认等确认面未做「展示 → 承诺」核对；它们登记在确认面契约的「尚未核对或已知例外」里，另立任务处理。`TradingActionButton` 未就绪态的 `Enable` 文案、下单确认的激进限价警告不在本决策范围。
- 提交钩子经持仓面板的直提入口静态可达，属于交易页 chunk；本改动对体积预算的影响见任务记录里的构建结果。

## 证据

- 代码：`hooks/trade/use-position-market-close-submit.ts`、`hooks/trade/use-position-market-close-action.ts`、`components/trade/positions/position-market-close-modal.tsx`、`domain/trade/position-market-close.ts`、`lib/trade/position-submit-feedback.ts`。
- 测试：`position-market-close-display-commit.test.tsx`（新增，跨边界）、`position-market-close-submit.test.tsx`、`position-market-close-modal.test.tsx`、`position-market-close-action.test.tsx`、`position-market-close.test.ts`、`trading-action-button-label-contract.test.ts`（新增）、`i18n-reactivity-contract.test.ts`（补登记弹窗与共享尺寸控件）。
- 方案评审：2026-09-20 由 Codex（`gpt-6-astra`，只读）评审；它纠正了最初方案里的复现时序、入口校验的位置、提示的生命周期、失败文案，并要求收窄契约的覆盖声明，均已采纳。
- 验证命令、变异自检与本次执行结果见任务记录。
