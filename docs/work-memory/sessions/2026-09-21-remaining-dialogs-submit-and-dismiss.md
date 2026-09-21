<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-remaining-dialogs-submit-and-dismiss",
  "date": "2026-09-21",
  "title": "其余交易弹层与按钮：不在按钮上显示提交进度，点击即关闭，结果走右下角通知；资金类只改按钮名称",
  "kind": "task",
  "status": "verified",
  "topics": [
    "market-recovery",
    "docs-governance"
  ],
  "summary": "产品负责人要求继续修复其余仍在按钮上显示进度的弹层。止盈止损、逐仓保证金、取消全部委托、移动端改单、现货兑换、账户模式、杠杆与保证金模式改为点击即关闭、结果走通知；委托列表的撤单按钮、桌面行内改单、TWAP 终止与桌面下单按钮去掉进度文案与转圈。止盈止损与逐仓保证金的会话并入页面级的持仓弹层宿主。杠杆通知报告的是实际生效的杠杆：回归测试抓到弹层想报 15x、实际提交 10x 的情形，应用函数因此改为返回生效值。资金类（划转、发送、充值、提现）只把按钮名称改为静态，有意不改成点击即关闭。新增进度文案契约测试。",
  "thread": null,
  "baseCommit": "2429368b",
  "commits": [
    "27f83f35",
    "58d510aa",
    "9102f9ca",
    "dbfb372b",
    "05f3fed7",
    "bb2e2917",
    "8318d893"
  ],
  "sources": [
    { "path": "apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-isolated-margin-modal.tsx" },
    { "path": "apps/terminal/src/stores/use-position-dialog-store.ts" },
    { "path": "apps/terminal/src/components/trade/positions/position-dialog-host.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/cancel-all-orders-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/orders-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-orders-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-order-modification-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/order-inline-edit.tsx" },
    { "path": "apps/terminal/src/components/trade/components/spot-swap-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/account-mode-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/leverage-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/margin-mode-modal.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-asset-leverage.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/transfer-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/send-modal.tsx" },
    { "path": "apps/terminal/src/lib/tests/action-progress-label-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/spot-swap-modal.test.tsx" },
    { "path": "apps/terminal/tests/slider-effective-leverage-regression.test.tsx" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/adr/0014-market-close-submit-and-dismiss.md" }
  ],
  "supersedes": []
}
-->
# 其余交易弹层与按钮：不在按钮上显示提交进度，点击即关闭，结果走右下角通知；资金类只改按钮名称

## 背景与范围

同步记录，接续 `2026-09-21-close-all-submit-and-dismiss.md`。产品负责人在 2026-09-21 看到上一轮只改了五个确认面后问「请继续修复，为什么不动？」。没有动的原因是上一轮的指令点名的是具体弹层，其余的面里有多笔订单的止盈止损流程和带恢复路径的资金流程，当时没有在未获同意的情况下扩大范围。这一轮按「按钮不显示状态、与其他按钮一致、订单状态放右下角通知」逐个处理。工作在分支 `fix/market-close-confirmed-size`（工作树 worktree-05）上进行，未推送。

清点方法：在 `components/` 下搜索所有以省略号结尾的 `t` / `<Trans>` 文案，逐个归类为交易动作、资金动作、钱包握手、被动加载。上一轮向产品负责人列的清单漏了移动端改单弹层、桌面行内改单、杠杆与保证金模式、桌面下单按钮的转圈，这次是从文案清点里补出来的。

## 结论与依据

**改成点击即关闭、结果走通知的面。**

- 止盈止损、逐仓保证金：会话进入 `use-position-dialog-store`（`tpSl`、`isolatedMargin`），由页面级 `PositionDialogHost` 承载，持仓列表（桌面与移动）不再持有这两个弹层的状态。点击后弹层立即隐藏，被锁、待对账、失败、成功各一条通知，结束后释放会话。待对账时写入的资产占位不变，重新打开后再次提交仍被「另一笔订单仍在确认」拦住；弹层内常驻的「关闭后重新打开」提示随 `requiresRefresh` 状态一起删除。两个弹层用 `useLingeringValue` 多挂载 250 ms 播放退出动画，`canSubmit` 含 `open`。改造前两个弹层的 key 含 `open ? "open" : "closed"`，关闭即重挂载，本来就没有退出动画。
- 取消全部委托：弹层不再接收 `isSubmitting` 与 `errorMessage`，点击先关闭再校验与提交。撤单的每条反馈在写入列表上方提示行的同时发一条通知（与改单流程原有的做法一致），交易所确认成功时发 `Order cancellation confirmed.`；通知与提示行共用原有的会话守卫（`mountedRef` 与 `isCancelExecutionCurrent`），账户切换后迟到的结果两边都不显示。成功通知放在撤单执行处而不是 `OrderReconciliation`：对账组件在委托从列表消失时确认撤单，而委托消失也可能是成交，且响应未确认时同样会进入 `awaiting`，无法区分。
- 改单：移动端弹层 `open={modifyPhase === "idle"}`，桌面行内编辑器在阶段离开 `idle` 时收起；失败时清空编辑会话，错误进入提示行与通知，不把弹层或编辑器重新弹出来。
- 现货兑换：点击后隐藏，组件保持挂载到提交结束再 `close("swap")`（按类型限定，不会误关后来打开的其他弹层）；弹层内的成功卡片、自动关闭与错误块删除，`SpotSwapErrorMessage` 组件及其测试删除，改为 6 项渲染级测试。
- 账户模式、杠杆、保证金模式：点击即关闭。三者都去掉了「请求期间不可关闭」的锁：账户模式需要主钱包签名，签名窗口可能停留很久，重新打开的弹层必须能关掉；重复提交由 `isUpdating` 禁用与同步 ref 拦截。

**只去掉进度文案的控件。** 委托列表的 `Cancel all` / `Cancel selected` / 行内 `Cancel`（移动端行内的转圈一并去掉）、TWAP `Terminate`（结果本来就由页面级 `TwapReconciliation` 通知）、桌面下单按钮提交期间的转圈（`Enable Trading` 的签名阶段保留，它是钱包握手）。

**杠杆通知报告实际生效值。** 第一版通知用的是弹层自己记住的 `canonicalLeverage`。`slider-effective-leverage-regression` 的 A1 用「输入 15 → 上限从 20 收紧到 10 → 确认」复现：通知会写 `15x`，而实际提交并生效的是 10x。`applyMarginAndLeverage()` 因此改为返回实际生效的杠杆（取整、按当前上限夹紧之后的值），没有变化、非永续或会话在请求期间切换时返回 `null`，弹层只在拿到数值且会话未切换时通知。改造前按钮上的 `Updated to {n}x` 用的是上层回传的 `committedLeverage`，所以这个问题是这次改动引入、并在同一次改动里由既有回归测试拦下的。

**资金类有意不改成点击即关闭。** 划转与发送的弹层承载提交身份（关闭即让排队中的请求失效，`funds-action-balances` 有专门的用例）、提交前后的余额与地区复核，以及按稳定代码存储、随语言切换重译的守卫错误；失败后用户在原地修改重试，发送不必重新输入目的地址。充值与提现是多步流程，状态页与恢复入口保存链上操作的恢复信息。这一轮只把四个按钮的名称改为静态（`Transfer`、`Send`、`Deposit`、`Withdraw` / `Withdraw to Arbitrum`），顺带消掉了提现按钮里的嵌套三元。是否进一步改需要单独的设计，已写入 `docs/confirmation-surfaces.md` 第 6 条与例外表。

**防回归。** `action-progress-label-contract.test.ts` 扫描 `components/trade` 下所有以省略号结尾的文案，逐个登记原因（被动加载、钱包握手、状态页）；`trading-action-button-label-contract` 把杠杆弹层从「带运行时值的已登记例外」改为静态。

## 验证与限制

均为 2026-09-21 在本机对本分支执行。

- 第一批（提交 `27f83f35`、`58d510aa`、`9102f9ca`、`dbfb372b`）提交前：`pnpm --filter @gatu/terminal typecheck` 通过；`pnpm --filter @gatu/terminal test` 588 文件通过、1 跳过，6,680 项通过、1 跳过。
- 第二批（提交 `05f3fed7`、`bb2e2917`、`8318d893`：杠杆、保证金模式、资金类按钮、下单按钮、契约测试）：同一命令先后两次各暴露一处被旧行为钉住的测试，都属于被移除的行为，已按新行为改写：`withdraw-form-ui` 断言按钮显示 `Processing`（改写后 13 项通过）；`position-close-effective-percent-catalogs` 钉住旧的 `Updated to {displayLeverage}x` 译文，改为钉住 `Leverage updated to {leverage}x` 的五种译文（9 项通过）。两次运行的类型检查都通过，除上述测试外无其他失败。改写之后对最终工作树再跑一次：`pnpm --filter @gatu/terminal typecheck` 通过；`pnpm --filter @gatu/terminal test` 589 文件通过、1 跳过，6,682 项通过、1 跳过。
- 生产构建（临时工作树 `wt05-build`，基于 `dbfb372b` 加未提交改动，Node 22.15.0，`pnpm install --frozen-lockfile`，两个移动配对开关关闭，用后已删除）：`pnpm --filter @gatu/terminal build` 退出码 0；411 个客户端 chunk 无循环静态依赖；包体预算检查通过；`trade-terminal-page` 126,013 B gzip；交易页运行时启动增量相对基线为移动端 +3,826 B、桌面端 +5,480 B，均在预算内。
- 变异检查：把 `Cancel All` 改回带 `Canceling...` 分支，进度文案契约变红，还原后文件逐字节一致（`cmp`）。
- 语言目录：新增 `Order cancellation confirmed.`、`Leverage updated to {leverage}x`、`Margin mode updated`，五种非英文语言已补译；`lingui extract` 报告的缺失数回到本轮开始前的基线（ar / es / fr / hi 各 36，zh 5），均为分支基线上已有的缺口，与本次改动无关。
- 限制：没有在真实页面上复看这些弹层（账户当前没有持仓与委托，且不在真实账户上执行下单、撤单、改单、调杠杆或资金操作）；没有跑浏览器套件；没有在真实手机与读屏上验证。取舍：取消成功但补单失败这类不确定结果原先常驻在止盈止损弹层里，现在只有一条会自动消失的通知，资产占位仍然拦住重复提交，但解释不再常驻。现货兑换隐藏期间如果用户打开了另一个全局弹层，兑换组件会被卸载，结果通知随之丢失（订单本身不受影响，执行守卫在未发出前失败关闭）。

## 后续与替代关系

- 不替代任何记录；接续 `2026-09-21-close-all-submit-and-dismiss.md`。
- 待产品负责人决定：资金类是否也改成点击即关闭（需要先设计提交身份与恢复路径如何脱离弹层）；API 钱包操作弹层（`components/api-wallet`）未核对。
- 下一次先查：`docs/confirmation-surfaces.md` 第 6 条与例外表、`action-progress-label-contract.test.ts`、`stores/use-position-dialog-store.ts`。
