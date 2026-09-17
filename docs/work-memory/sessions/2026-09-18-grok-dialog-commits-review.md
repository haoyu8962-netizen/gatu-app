<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-grok-dialog-commits-review",
  "date": "2026-09-18",
  "title": "Grok 4.6 对抗审查六个弹窗/平仓提交：2 P1 属实，待修",
  "kind": "task",
  "status": "recorded",
  "summary": "grok-4.6 只读审查 0ad17aea…08e2057d 冻结快照，报告 2 P1 / 2 P2 / 3 P3；逐条核实：反手与全部平仓退场窗口内确认按钮仍可点（P1）、市价平仓取消退场期间 canSubmit 未含 isClosing（P1）属实；后台执行绑在随路由卸载的弹窗实例（P2）与 PnL 分享退场仍直接卸载（P2）属实；ADR §6 引用、CHANGELOG「一条通知」措辞、idle 预热测试不覆盖 requestIdleCallback 三条 P3 属实。其「无过渡时 onOpenChangeComplete 同步触发会卡会话」的存疑项经 Base UI 源码核实不成立。未修改代码。",
  "topics": [
    "pr-review"
  ],
  "thread": null,
  "baseCommit": "08e2057d",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0014-market-close-submit-and-dismiss.md" },
    { "path": "apps/terminal/src/components/trade/positions/position-reverse-confirmation-controller.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-close-all-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-market-close-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-pnl-share-modal.tsx" }
  ],
  "supersedes": []
}
-->
# Grok 4.6 对抗审查六个弹窗/平仓提交：2 P1 属实，待修

## 背景与范围

用户要求用 Grok CLI 最新模型对抗审查本分支的提交。范围 `origin/main..HEAD`（0ad17aea、44a4d411、5425dbeb、82d81313、75cca116、08e2057d，77 文件）。方式与此前一致：`git archive HEAD` 导出 `apps/terminal/src`、`packages/ui/src`、ADR、guardrails、规则与三份任务记录到临时目录，附 `COMMITS.txt` 与排除 locale/INDEX 的 `RANGE.diff`；`grok --prompt-file … -m grok-4.6 --effort high --tools "read_file,grep,list_dir" --disallowed-tools Agent --max-turns 120 --output-format json --always-approve --disable-web-search --no-subagents`（实际模型 `grok-4.6-build`，27 轮，约 1.03 USD）。原始报告存本地 `.worklog/2026-09-18-grok-dialog-commits-review.md`（Git 忽略）。

## 结论与依据

| 编号 | Grok 定级 | 核实结果 | 依据 |
|---|---|---|---|
| F1 反手/全部平仓：lingering 退场窗口内确认按钮仍可点，成功后按钮重新可用可再提交 | P1 | 属实 | `position-reverse-confirmation-controller.tsx:87` `isConfirmDisabled={submission.isPending \|\| submission.isReconciling}`，`position-close-all-modal.tsx:55` `isActionDisabled` 同样不含 `!open`；反手 submit 钩子 `phaseRef !== "idle"` 才拒绝，成交后回到 idle。下单确认安全：`use-order-confirmation.ts` `confirm()` 在 `!pending` 时 return。 |
| F2 市价平仓：取消退场期间 `canSubmit` 未含 `isClosing`，再点会走 `submit()` | P1 | 属实 | `position-market-close-modal.tsx:117-121,195-197`。约 200 ms 窗口。 |
| F3 确认路径的后台执行绑在 `PositionMarketCloseModal` 实例；离开 `/trade` 时宿主卸载触发 `discardPositionMarketCloseModal`，校验阶段会报 `trading-data-changed` | P2 | 属实，与直提路径一致的既有限制，但 ADR 0014 把确认路径做成后台执行后更易触发 | `global-modals.tsx:166` 卸载 effect；`use-global-modal-store.ts` `discard` 无条件置 reconciling 再 close。 |
| F4 PnL 分享弹窗关闭仍直接卸载，只修了进场 | P2 | 属实 | `position-pnl-share-modal.tsx:39` `if (!position) return null`，08e2057d 未覆盖。 |
| F5 ADR 0014 引用 guardrails「§6 下单后的对账规则」有误 | P3 | 属实 | §6 实为「WebSocket And Account Data」。 |
| F6 CHANGELOG「结果只用一条通知」在对账场景为两条 | P3 | 属实 | submit 先 warning，对账结局再一条。 |
| F7 `global-modals-idle-preload` 测试只覆盖 setTimeout 回退，不覆盖 `requestIdleCallback` | P3 | 属实（jsdom 无 RIC） | 环境出现 RIC 时第一例会红。 |
| 存疑：无过渡时 `onOpenChangeComplete` 若与 `onOpenChange` 同步触发，取消会把会话卡在槽位 | — | 不成立 | Base UI 1.3 `useOpenChangeComplete` 在以 `open` 为依赖的 `useEffect` 里调用 `runOnceAnimationsFinish(onComplete)`，且 `onComplete` 为稳定回调；即无过渡也在 `isClosing=true` 提交之后触发。 |

Grok 认为成立的安全面（会话 idle 门、dismiss/close 相位限制、执行守卫不看 presentation、liveContextRef 持续更新、对账释放、`useLingeringValue` 的 A→null→B、`usePresentedOpen` 的 uncontrolled 透传、Activity/§4 §5、idle 预热不进 ADR 0012 等待集合）与本会话的理解一致。

## 验证与限制

- 复核过程中在内置浏览器观察到「取消后弹窗停留 >1 s、进场 starting 状态持续 >1 s」，追查为浏览器面板处于 `document.hidden`，定时器与 rAF 被节流（空闲 100 ms 定时器实际 1 s 触发一次），不是代码缺陷；面板可见时取消 300 ms 内卸载。
- 本记录只做核实与归档，未修改代码；修复计划：F1/F2 用 `open`/`isClosing` 关闭提交入口并补「退场期间点确认不提交」测试；F4 给 PnL 分享持有方加 `useLingeringValue`；F5/F6 改文档；F7 测试补 RIC 分支；F3 需把确认路径的执行搬到常驻宿主，另立决策。

## 后续与替代关系

- 不替代任何记录；补充 `2026-09-18-dialog-transitions-and-preload.md` 与 ADR 0014。
