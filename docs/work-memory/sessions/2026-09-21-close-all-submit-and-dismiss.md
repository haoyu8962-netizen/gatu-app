<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-close-all-submit-and-dismiss",
  "date": "2026-09-21",
  "title": "全部平仓：确认按钮改为静态动词，点击即关闭弹窗，结果只走右下角通知",
  "kind": "task",
  "status": "verified",
  "topics": [
    "market-recovery",
    "docs-governance"
  ],
  "summary": "产品负责人要求全部平仓的按钮不显示状态、与其他按钮一致、订单状态放到右下角通知。原实现把仓位数写进确认按钮，并在按钮上依次显示校验中、提交中、确认中与部分成功，弹窗等待结果。现改为静态的 Close All Positions，点击即关闭弹窗，组件保持挂载到提交结束，五种结局各发一条通知；持仓页在会话存在期间禁用入口。反手与限价平仓仍在按钮上显示提交状态，未改。",
  "thread": null,
  "baseCommit": "cbdadae9",
  "commits": [
    "e96c10c3"
  ],
  "sources": [
    { "path": "apps/terminal/src/components/trade/positions/position-close-all-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/positions-tab.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-position-close-all-submit.ts" },
    { "path": "apps/terminal/src/lib/tests/position-close-all-modal.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/trading-action-button-label-contract.test.ts" },
    { "path": "docs/adr/0014-market-close-submit-and-dismiss.md" },
    { "path": "docs/confirmation-surfaces.md" }
  ],
  "supersedes": []
}
-->
# 全部平仓：确认按钮改为静态动词，点击即关闭弹窗，结果只走右下角通知

## 背景与范围

同步记录。产品负责人 2026-09-21 指出：「"全部平仓"不应该显示状态，应该和其他按钮一样，订单状态应该放在右下角的通知事务中。」工作在分支 `fix/market-close-confirmed-size`（工作树 worktree-05）上进行，未推送。全部平仓只存在于桌面持仓表，移动端没有这个入口。

## 结论与依据

**原实现（`position-close-all-modal.tsx`）。** 确认按钮的就绪态是 `Close # position(s)`，带实时仓位数；提交期间按钮依次变成 `Validating positions...`、`Submitting close orders...`、`Confirming exchange status...`、`Partial result — reopen to retry` 并带转圈图标；弹窗在校验与提交阶段不可关闭，错误与对账提示显示在弹窗正文里，成功或对账时才关闭。这与[确认面契约](../../confirmation-surfaces.md)第 1 条（就绪态名称是静态动词）不符，已在契约文档里登记为已知例外；[ADR 0014](../../adr/0014-market-close-submit-and-dismiss.md) 也写明全部平仓仍等待结果、如需一致化另立任务。右下角的通知是 sonner（`components/ui/sonner.tsx`，`position="bottom-right"`），原实现的五种结局本来就各有一条通知。

**改动（`e96c10c3`）。**

- 确认按钮固定为 `Close All Positions`（目录里已有的文案，与弹窗标题、持仓表入口一致，不需要新译文）。仓位数留在摘要的 `Positions` 行与说明文字里。按钮不再有进度文案、转圈、`aria-busy`；原来四层嵌套三元的 `progressLabel` 一并消失。
- 点击即关闭：确认处理函数先用同步 ref 防止同一帧内重复触发，再把弹窗的 `open` 置为关闭，然后执行提交。`PositionCloseAllContent` 保持挂载直到提交结束——提交钩子的 `assertLifecycleActive` 要求组件存活，卸载会让校验与执行边界以 `trading-data-changed` 失败关闭——结束后才通知父级清掉快照。做法与 ADR 0014 决策 1、2 相同，只是会话状态放在组件本地而不是全局弹窗槽位。
- 结果只走通知：被其他订单锁住（警告）、已提交待对账（提示）、部分成功（警告）、全部成交（成功）、失败（错误）各一条，之后结束会话；弹窗正文不再展示提交错误。对账结局仍由共享的 `order-reconciliation` 通知。
- 持仓页（`positions-tab.tsx`）：快照在会话结束前一直保留，期间禁用表头的 `Close All Positions` 入口，打开处理函数也直接返回。否则再次点击会生成新快照、更换组件的 key，把正在后台提交的实例卸载掉。
- 提交钩子 `use-position-close-all-submit.ts` 未改；它对外的 `phase`、`error`、`resetError` 等现在只被它自己的测试使用。

**未改的同类表面。** 反手确认（`Reversing...`）与限价平仓（`Validating... / Submitting... / Confirming...`）仍在按钮上显示提交状态并等待结果。产品负责人这次只点名了全部平仓。

## 验证与限制

均为 2026-09-21 在本机对本分支执行。

- 先改测试后改实现：`position-close-all-modal.test.tsx` 按新约定重写后 13 项为红，实现后 14 项通过，另加 2 项持仓页接线的源码断言，共 16 项。第一次提交被提交钩子的 Biome 拦下（测试里两处在表达式里赋值），改成辅助函数后通过。覆盖：静态名称且仓位数只在正文；四个提交阶段下按钮文案不变、无 `aria-busy`、正文不显示错误；点击后 `open` 立即为 false、提交未结束前不通知父级、组件仍挂载、再次点击不重复提交；同一帧内触发两次只提交一次；五种结局各自只发对应级别的一条通知并结束会话；确认前可以正常关闭，提交开始后外壳的关闭回调被忽略。
- 标签契约测试把全部平仓从「已知例外」改为静态（`dynamic: []`、`indirect: []`），并与市价平仓一起单独钉住。
- 语言目录：5 条不再使用的文案被标为废弃（`#~`），译文保留；`Close All Positions` 多了一处来源；没有新增文案。
- 最终工作树：`pnpm --filter @gatu/terminal typecheck` 通过；`pnpm --filter @gatu/terminal test` 第一次运行 585 文件通过、1 个失败：删掉弹窗正文里的错误提示块后任意圆角用法从 226 降到 225，设计令牌棘轮要求同步调低基线；调低后该文件通过，其余 6,650 项在同一次运行里已通过（101 秒），没有再跑第二次全量。Biome、`git diff --check`、记忆索引检查通过。
- 真实页面复看没有做成：准备在桌面布局打开确认弹窗时，账户的持仓数已经是 0（此前一直是 1；本会话从未点击过任何确认或提交按钮，平仓不是我做的），没有持仓时表头不渲染 `Close All Positions` 入口，弹窗打不开。我不会为了复看去开仓。
- 限制：没有执行真实的全部平仓（不点击确认是本会话的硬性约束），提交、对账与部分成功路径只由测试替身覆盖；持仓页的禁用入口只有源码断言，没有渲染级测试。

## 后续与替代关系

- 不替代任何记录；使 ADR 0014「后果与边界」里「全部平仓仍等待结果后关闭」一句失效，已在该 ADR 的「后续」追加说明。
- 待产品负责人决定：反手与限价平仓是否同样改为静态按钮、点击即关、结果走通知。
- 下一次先查：`position-close-all-modal.tsx`、`positions-tab.tsx` 的 `closeAllSnapshot`、`docs/confirmation-surfaces.md` 的例外表。
