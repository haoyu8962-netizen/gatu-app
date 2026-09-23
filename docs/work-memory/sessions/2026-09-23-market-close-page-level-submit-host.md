<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-23-market-close-page-level-submit-host",
  "date": "2026-09-23",
  "title": "市价平仓提交移到页面级宿主",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "order-entry"],
  "summary": "复现并修复市价平仓后台提交的两条丢失路径（legal 状态短暂离开 accepted 时确认路径被丢弃；直提所有者随持仓页签卸载后守卫读冻结数据仍发单），提交改由按需加载的页面级 PositionMarketCloseSubmitHost 执行；全量单测与 CI 条件构建预算通过，未做真实钱包或真实成交验收。",
  "thread": null,
  "baseCommit": "79542991",
  "commits": ["683f7590"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/components/position-market-close-submit-host.tsx" },
    { "path": "apps/terminal/src/components/trade/components/position-market-close-submit-host-gate.tsx" },
    { "path": "apps/terminal/src/lib/trade/position-market-close-submitter.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-position-market-close-submit.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-position-market-close-action.ts" },
    { "path": "apps/terminal/src/components/trade/components/global-modals.tsx" },
    { "path": "apps/terminal/src/stores/use-global-modal-store.ts" },
    { "path": "apps/terminal/src/lib/tests/position-market-close-submit-host.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/global-modals-market-close-legal.test.tsx" },
    { "path": "docs/adr/0014-market-close-submit-and-dismiss.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/work-memory/sessions/2026-09-23-codex-legal-notification-review-fixes.md" }
  ],
  "supersedes": []
}
-->
# 市价平仓提交移到页面级宿主

## 背景与范围

上一轮审查（[codex 六提交审查与修复](2026-09-23-codex-legal-notification-review-fixes.md)）把「legal 状态离开 accepted 时进行中的市价平仓被丢弃」列为已有问题，并拆成了后续任务。用户随后要求在本会话一并修复，后续任务卡片已撤回。基线 `79542991`，开始时工作区干净。本会话同步记录，没有可核对的会话标识。按 ultracode 模式分两轮工作流执行：调查（两条复现、调用点地图、设计评审，每个复现场景再由对抗复核），实现后再做四维对抗审查。

## 结论与依据

复现（临时测试文件在运行后删除，jsdom，真实 store、真实 `usePositionMarketCloseSubmit`/`useTrackedOrder`，网络和锁用桩）：

- 确认路径：校验中 legal 状态变为 `checking` 或 `error` 后，`SharedGlobalModals` 所在分支卸载，卸载清理调用 `discardPositionMarketCloseModal()`，会话被清空，订单不发，通知报 `trading-data-changed`。请求已发出时再切换，成功仍会报告，但平仓中守卫在回包前就释放了，同一仓位可以再次打开市价平仓。
- 直提路径（关闭了确认提示）：提交钩子长在持仓页签里，页签、移动端底部导航或 1000px 断点变化会卸载它，且没有任何代码丢弃会话。之后每个实时检查都读冻结的 `liveContextRef`：校验中实时仓位从 2.5 缩到 1.0，或提交中仓位反向、消失，订单都照样发出。所有者保持挂载的对照组则会失败关闭。
- 11 个复现场景由独立复核者逐一尝试推翻，全部未被推翻。

实施（提交 `683f7590`）：

- `PositionMarketCloseSubmitHost` 是 `usePositionMarketCloseSubmit()` 的唯一调用者，通过 `lib/trade/position-market-close-submitter.ts` 注册提交函数。`GlobalModals` 在 legal gate 与各分支之外挂载 `PositionMarketCloseSubmitHostGate`，由它按需加载宿主。弹窗与直提入口只调用 `submitPositionMarketClose()`。
- 直提在宿主注册前回退为确认弹窗。确认最多等待 5 秒宿主注册，超时释放会话，并发 `failed-market-close` 通知。
- 分支切换只丢弃 `idle` 会话（`discardIdlePositionMarketCloseModal`）。宿主卸载时丢弃两类会话：它仍在执行的会话（失败关闭）和对账中的会话，对账本身由根级 `OrderReconciliation` 继续跟踪。`executionContextRef` 只清理本会话。
- 为什么按需加载：第一版把宿主直接打进 `global-modals` chunk。在 CI 条件（Node 22.15、两个配对开关关闭）下，运行时启动体积比 HEAD 多 3,808 B（移动端）和 3,418 B（桌面端），超出 10,000 B 的允许增量。改为门控组件在挂载后动态加载后，只比 HEAD 多 522 B 和 225 B。
- 四维对抗审查发现的问题：对账中会话离开页面后占住弹窗槽位（已修复）；确认路径缺少 legal 切换的端到端测试，SDK 边界守卫缺少测试（已补）；文档缺回归入口、ADR 被替代条目没有标注、缺本记录（已补）。另有一条「宿主注册前的竞态」由按需加载改造引入，已改为等待注册，并补了测试。

## 验证与限制

- 新测试：`position-market-close-submit-host.test.tsx`（9 项）、`global-modals-market-close-legal.test.tsx`（4 项）。变异检查：直提入口还原为旧实现时，校验中仓位缩小、请求前仓位反向、宿主卸载这 3 项失败；丢弃语义还原为强制丢弃时，只丢空闲会话那一项以及 legal 切换的 3 项失败。
- 桩的保真度：`useExchange` 的执行守卫按实例绑定，`useUserPositions` 用渲染时捕获的值。第一版全局守卫桩会让旧实现也通过，已经改掉。
- 实际运行（`683f7590` 的工作区）：AGENTS.md 确认面测试组加 3 个相关文件，共 43 个文件 883 项通过；全量 `pnpm --filter @gatu/terminal test` 603 个文件（1 个跳过）、7,000 项通过（1 项跳过）；类型检查 0 错误；Biome 通过；CI 条件的 `pnpm build` 通过，chunk 循环与包体积预算检查均通过。
- `position-close-all.playwright.config.ts` 38 通过、2 失败（`reports Partial/Ambiguous without success or automatic resend`）。同样的 2 项在 HEAD `79542991` 的临时 worktree 中也失败，是已有问题，本次没有处理。
- 未执行：真实钱包签名、真实成交、真机与屏幕阅读器验收、推送或发布。复现与回归都是合成桩上的 jsdom 测试，不能证明真实交易所回包下的时序。

## 后续与替代关系

- 替代 ADR 0014 决策 2 的所有权做法（ADR 内已标注）。本记录更正上一轮记录中「市价平仓问题本次未改」的说法。
- 待查：`position-close-all.pw.ts` 在 HEAD 上就失败的两项。（同日更正：原因是 `4f7e046f` 精简通知文案时没有同步这条浏览器测试，它还在断言旧文案 `1 of 2 close orders fully filled` 与 `Confirming order status. Do not retry.`；按 `docs/trading-notifications.md`「精简文案」的规定，现行文案是 `Fully filled 1/2 · Review positions` 与 `Confirming — do not resubmit`。已更新断言，套件 40/40 通过，其余断言不变。）
- 离开交易页或投资组合页、行情未就绪时，宿主卸载，进行中的市价平仓仍会失败关闭。这与之前的已知限制一致，本次没有改变。
- 同日补查其余浏览器套件（`e7808cde` 工作区，本机 Node 24）：共享配置 4 个 spec 共 49/49 通过；`account-actions.playwright.config.ts` 20 通过、4 失败（`preserves mode selection and quiet unavailable state` 在 375/393/1001/1363px 均报 `useHyperliquid must be used within a HyperliquidProvider`）；`user-menu-recovery.playwright.config.ts` 10 失败。在临时 worktree 核对：`account-actions` 在 `origin/dev` `9387a888` 上 24/24 通过，在 `b82dd443` 上失败，`git bisect` 定位到 codex 的 `a379d231`（它给 `AccountModeModal` 加了 `useHyperliquid()`，同步了 position-close-all 夹具却漏了 account-actions 夹具，属于夹具缺口，不是产品缺陷）；`user-menu-recovery` 在 `origin/dev` 上同样 10 项失败，不在 CI 里，是 dev 上的已有问题。两者本次都未修改。
- 同日另有会话提交了 `173585a4`（对本会话 8 个提交的对抗审查），确认 3 项 P2：F1 重复调用会清掉宿主的运行标记；F2 宿主懒加载等待期间确认未封存，后续编辑会改变执行量；F3 部分成交的 TP/SL 说明漏了官方的保证金不足取消例外。本次尚未处理，待用户决定。
