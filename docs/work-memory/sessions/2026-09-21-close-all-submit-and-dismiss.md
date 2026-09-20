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
  "summary": "产品负责人要求全部平仓的按钮不显示状态、与其他按钮一致、订单状态放到右下角通知。原实现把仓位数写进确认按钮，并在按钮上依次显示校验中、提交中、确认中与部分成功，弹窗等待结果。现改为静态的 Close All Positions，点击即关闭弹窗，组件保持挂载到提交结束，五种结局各发一条通知；持仓页在会话存在期间禁用入口。同日按「一并修复，还有下单弹窗按钮」的要求，限价平仓、反手确认与下单确认也改为同一做法，并写入确认面契约第 6 条；TP/SL、逐仓保证金、保证金模式、现货兑换与资金类弹窗仍在按钮上显示进度，未改。",
  "thread": null,
  "baseCommit": "cbdadae9",
  "commits": [
    "e96c10c3",
    "c2015363"
  ],
  "sources": [
    { "path": "apps/terminal/src/components/trade/positions/position-close-all-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/positions-tab.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-position-close-all-submit.ts" },
    { "path": "apps/terminal/src/lib/tests/position-close-all-modal.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/trading-action-button-label-contract.test.ts" },
    { "path": "docs/adr/0014-market-close-submit-and-dismiss.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "apps/terminal/src/components/trade/positions/position-limit-close-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-reverse-confirmation-controller.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-reverse-confirmation-modal.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-order-confirmation.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/order-confirmation-modal.tsx" },
    { "path": "apps/terminal/src/lib/tests/position-dialog-session-ownership.test.tsx" },
    { "path": "apps/terminal/src/stores/use-position-dialog-store.ts" },
    { "path": "apps/terminal/src/components/trade/positions/position-dialog-host.tsx" },
    { "path": "apps/terminal/src/components/trade/components/position-dialog-host-gate.tsx" }
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

### 同日后续：限价平仓、反手确认与下单确认（`c2015363`）

产品负责人看到上面「未改的同类表面」后批示：「请你一并修复，还有下单弹窗按钮。」

- **限价平仓**（`position-limit-close-modal.tsx`）：按钮固定为 `Place Limit Close`，去掉 `Validating... / Submitting... / Confirming...`、转圈、sr-only 的进度播报与正文里的「仍在确认中 / 关闭弹窗不会取消它」提示。提交处理函数用同步 ref 防重入，把外壳的 `open` 置为关闭，再执行提交；对账（提示）、被锁（警告，原来是静默返回）、已挂单（成功）、失败（错误）各一条通知，`finally` 里通知父级卸载。提交前的本地校验（价格、数量、仓位已平或换向）仍显示在正文，提交钩子的 `error` 不再进入正文。原先限价平仓的外壳传的是字面量 `open`，现在由本地状态驱动，关闭有退出动画。
- **反手确认**（`position-reverse-confirmation-controller.tsx`、`position-reverse-confirmation-modal.tsx`）：弹窗去掉 `isSubmitting` 与 `errorMessage` 两个属性，按钮固定为 `Buy / Long` 或 `Sell / Short`（原来的嵌套三元连同 `Reversing...` 一起消失）；控制器同样用本地 `submittedRef` / `isSubmitted`，被锁、对账、成交、失败各一条通知后结束会话。
- **下单确认**（`use-order-confirmation.ts`、`order-confirmation-modal.tsx`，桌面与移动两个下单面板）：提交器常驻在下单面板里，不需要保持弹窗挂载。`confirm()` 先清掉待确认项（弹窗关闭）再执行，用 `confirmingRef` 拒绝提交期间的第二次确认与新的 `requestSubmit()`；执行失败后复位，可以立即发起下一笔。弹窗去掉 `isSubmitting` 属性与 `Submitting...`，关闭中的弹窗（`!open`）禁用确认、取消与勾选框。订单状态本来就由下单提交器的通知给出。官方终端同样先关弹窗再发单（2026-09-20 对其前端包的静态阅读，未经账户实测）。
- **父级守卫**：最初做在两个持仓列表的打开处理函数里；评审后改由 store 统一处理，见下。
- **契约与规则**：`docs/confirmation-surfaces.md` 新增不变量 6 并更新例外表；ADR 0014 追加后续；`AGENTS.md`「Confirmation surface contract」新增一条并补全验证命令组；标签契约测试把限价平仓登记为静态，并把四个平仓/反手确认面一起单独钉住；新增 `order-confirmation-modal.test.tsx`（会话所有权测试见下文评审后的版本）；CI 步骤加入新测试。
- 我写测试时猜错了两个既有值，均按既有行为改了期望而不是改实现：下单确认在带杠杆的永续买入上显示 `Long`（不是 `Buy / Long`）；反手弹窗测试里的外壳替身在关闭时不渲染子节点。
- 语言目录：`Validating...`、`Confirming...`、`Reversing...`、`The order is still being confirmed.` 四条被标为废弃，译文保留；`Submitting...` 与「关闭弹窗不会取消它」仍被其他弹窗使用；没有新增文案。

**Codex 只读评审（未运行测试）与随后的结构性修复。** 评审结论是「需要先改」，两处是真实缺陷：

- P1：弹窗不再模态以后，用户可以在后台提交的一两秒内切到 Orders 等页签；`Tabs.Panel` 默认不保留非活动面板，持仓列表连同承载提交钩子的控制器一起卸载。全部平仓与反手的生命周期守卫会在交易所已经返回之后抛 `trading-data-changed`，把成交报告成失败；限价平仓的实时 ref 停止更新。上一个提交里的全部平仓有同样的问题。移动端切底部导航、跨过桌面与移动断点同理。
- P2：反手控制器以仓位内容为 key 并保留 250ms，失败或被锁后立即重开同一仓位会复用已经提交过的隐藏实例，弹窗不再出现，入口被永久占用。

修复：新增 `stores/use-position-dialog-store.ts` 保存三类会话，每次打开分配新的会话 ID，同一账户已有会话时忽略再次打开，结束动作带会话 ID（迟到的结束不会关掉后来的会话）；新增 `PositionDialogHost` 承载三个控制器，经 `GlobalModals` 里的 `PositionDialogHostGate` 挂在页面层（交易页与投资组合页），首次有会话时惰性加载，并加入空闲预热列表；桌面与移动两个持仓列表不再持有这些状态，也不再渲染这些控制器。三个控制器的属性改为 `session` / `onSessionEnd`，以会话 ID 为 key。全部平仓对「当前账户是否拥有该快照」的判断移到宿主。只读源码的所有权测试按评审意见换成真实的 store 与宿主测试（忽略同账户的第二次打开、重开得到新会话、迟到的结束不影响新会话、别的账户的全部平仓会话不展示），并保留两条结构断言（两个列表不再引用三个控制器模块、宿主由 `GlobalModals` 挂载）。评审的另外两条：普通下单的状态走右下角的订单队列 `OrderToast` 而不是 sonner，已在契约里写明这是同一位置的另一个出口；ADR 的实施链接原先指向只写了全部平仓的记录，本记录已补齐。评审同时确认：关闭但仍挂载期间各钩子读取的 ref 继续随渲染更新；下单确认的价格闭包取自点击那次渲染；`confirmingRef` 成功与失败都会复位；没有发现绕过父级守卫的入口。

仍在按钮上显示进度、未在这次范围内的表面（登记备查）：止盈止损（`Submitting...`）、逐仓保证金（`Updating...`）、取消全部委托与委托表里的撤单（`Canceling...`）、现货兑换（`Swapping...`）、账户模式（`Switching...`）、划转、发送、充值与提现（`Transferring...`、`Sending...`、`Processing...`）、TWAP 终止（`Terminating...`）。

## 验证与限制

均为 2026-09-21 在本机对本分支执行。

- 先改测试后改实现：`position-close-all-modal.test.tsx` 按新约定重写后 13 项为红，实现后 14 项通过，另加 2 项持仓页接线的源码断言，共 16 项。第一次提交被提交钩子的 Biome 拦下（测试里两处在表达式里赋值），改成辅助函数后通过。覆盖：静态名称且仓位数只在正文；四个提交阶段下按钮文案不变、无 `aria-busy`、正文不显示错误；点击后 `open` 立即为 false、提交未结束前不通知父级、组件仍挂载、再次点击不重复提交；同一帧内触发两次只提交一次；五种结局各自只发对应级别的一条通知并结束会话；确认前可以正常关闭，提交开始后外壳的关闭回调被忽略。
- 标签契约测试把全部平仓从「已知例外」改为静态（`dynamic: []`、`indirect: []`），并与市价平仓一起单独钉住。
- 语言目录：5 条不再使用的文案被标为废弃（`#~`），译文保留；`Close All Positions` 多了一处来源；没有新增文案。
- 最终工作树：`pnpm --filter @gatu/terminal typecheck` 通过；`pnpm --filter @gatu/terminal test` 第一次运行 585 文件通过、1 个失败：删掉弹窗正文里的错误提示块后任意圆角用法从 226 降到 225，设计令牌棘轮要求同步调低基线；调低后该文件通过，其余 6,650 项在同一次运行里已通过（101 秒），没有再跑第二次全量。Biome、`git diff --check`、记忆索引检查通过。
- 真实页面复看没有做成：准备在桌面布局打开确认弹窗时，账户的持仓数已经是 0（此前一直是 1；本会话从未点击过任何确认或提交按钮，平仓不是我做的），没有持仓时表头不渲染 `Close All Positions` 入口，弹窗打不开。我不会为了复看去开仓。
- 同日后续（限价平仓、反手、下单确认与页面层宿主）的最终工作树：`pnpm --filter @gatu/terminal typecheck` 通过；全量单测最后一次完整运行 586 文件通过、2 个失败、6,669 项通过，两个失败都是钉住旧结构的契约测试（空闲预热列表、持仓页源码里应引用 `PositionCloseAllController`），按新结构更新后与 `global-modals-hip3-disclaimer` 一起单独运行 34 项通过，随后在最终工作树上再跑一次全量：588 文件通过、1 跳过，6,671 项通过、1 跳过（99 秒）；更早一次全量里 `chart-store` 因负载超时失败，单独运行 11 项通过。Biome、`git diff --check`、`node --test scripts/ci-workflows.test.mjs`（6 项）、记忆索引检查通过。按 CI 条件在临时工作树里对未提交的工作树做了生产构建（Node 22.15.0、无本地环境文件、两个配对开关为 false）：构建通过，408 个客户端 chunk 无循环静态导入，包体积预算通过，`trade-terminal-page` 125,995 字节 gzip（此前 126,044），交易页静态启动闭包比上一次构建少约 13 KB（三个弹窗移出了持仓页签的 chunk），移动端运行时启动增加约 1.9 KB 但仍在预算内；临时工作树已删除。
- 没有做的：真实页面复看（账户当前没有持仓，三个持仓类弹窗打不开；下单确认弹窗需要走到提交前一步，我没有在真实账户上操作下单流程）；「提交期间切换页签」只由结构保证（宿主在页签之外）与 store / 宿主测试覆盖，没有用真实提交钩子做端到端测试，Codex 建议的「真实弹窗 + 真实提交钩子、只替换网络边缘」的跨边界测试仍未补。
- 限制：没有执行真实的全部平仓（不点击确认是本会话的硬性约束），提交、对账与部分成功路径只由测试替身覆盖；持仓页的禁用入口只有源码断言，没有渲染级测试。

## 后续与替代关系

- 不替代任何记录；使 ADR 0014「后果与边界」里「全部平仓仍等待结果后关闭」一句失效，已在该 ADR 的「后续」追加说明。
- 待产品负责人决定：反手与限价平仓是否同样改为静态按钮、点击即关、结果走通知。
- 下一次先查：`position-close-all-modal.tsx`、`positions-tab.tsx` 的 `closeAllSnapshot`、`docs/confirmation-surfaces.md` 的例外表。
