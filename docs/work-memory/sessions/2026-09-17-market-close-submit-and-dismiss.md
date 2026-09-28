<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-market-close-submit-and-dismiss",
  "date": "2026-09-17",
  "title": "市价平仓确认后立即关闭弹窗，结果只用通知",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "docs-governance"
  ],
  "summary": "按 ADR 0014 实施：submit 先 dismiss 会话再校验，弹窗组件在 dismissed 期间保持挂载但对话框关闭；删除会话 error 字段与 setError/resetError；失败与被锁走通知并关闭会话，对账在任何结局释放会话；7 个测试文件 112 pass，唯一红项为分支既有的 440px 摘要样式断言。",
  "thread": null,
  "baseCommit": "44a4d411b859c06827a8fd4c4675e487938e3231",
  "commits": ["82d81313"],
  "sources": [
    { "path": "docs/adr/0014-market-close-submit-and-dismiss.md" },
    { "path": "apps/terminal/src/stores/use-global-modal-store.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-position-market-close-submit.ts" },
    { "path": "apps/terminal/src/components/trade/positions/position-market-close-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/components/global-modals.tsx" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" }
  ],
  "supersedes": []
}
-->
# 市价平仓确认后立即关闭弹窗，结果只用通知

## 背景与范围

用户在移动端市价平仓弹窗上询问点击后的顺序，得知「弹窗等结果再关」后要求改为「点击即关弹窗、后台执行、成交后再通知」，并要求先写 ADR。决策见 [ADR 0014](../../adr/0014-market-close-submit-and-dismiss.md)。分支 `claude/surface-tokens-touch-feedback`，worktree `.claude/worktrees/main-dev`。范围仅市价平仓；Close All 与 Reverse 不改。

## 结论与依据

### 实施

- `use-global-modal-store.ts`：presentation 增加 `dismissed`；新增 `dismiss(sessionId)`（仅 idle 且 confirmation 时生效）；删除会话 `error`、`setError`、`usePositionMarketCloseError`、`PositionMarketCloseError`；`updatePhase` 不再把 presentation 改回 confirmation。
- `use-position-market-close-submit.ts`：通过空闲检查后先 `dismiss` 再 `validating`；`blocked` 与 catch 分支 toast 后置 idle 并关闭会话；`reconciling` 分支先弹一次警告通知（沿用 `reconciling-order` 文案）再进入对账，会话留在槽位以维持持仓行「平仓中」；钩子只返回 `submit`。
- `order-reconciliation.tsx`：市价平仓来源的对账在成交、取消、拒绝、超时任一结局都释放会话；结果通知由通用路径发出（成交成功、取消警告、拒绝错误、超时警告均已存在）。
- `global-modals.tsx`：`presentation !== "direct"` 即挂载弹窗组件，保证后台执行期间提交钩子实例与执行守卫的实时快照持续更新。
- `position-market-close-modal.tsx`：`open={presentation === "confirmation"}`；删除「Validating... / Submitting... / Confirming...」按钮态、对账提示块与会话错误展示；弹窗内只保留提交前本地校验与仓位状态提示。

### 与用户预期的对应

点击后弹窗带退出动画立即关闭；成功一条成交通知；失败一条错误通知且持仓行立即可重试；未确认成交先一条「已提交，正在确认」警告，对账结束再一条结果通知。

## 验证与限制

- `pnpm --filter @gatu/terminal typecheck` 通过；Biome 对 10 个改动文件通过。
- `vitest run` 七个文件（session / submit / modal / action / entry / hip3 host / order-reconciliation）：112 pass，1 fail。红项 `position-market-close-modal.test.tsx › uses the 440px desktop modal and scales the four-line summary PnL` 断言摘要区 className 含 `rounded-[12px]…border…bg-market-close-card`，实际为 `py-3 min-[1001px]:py-3.5`；在 HEAD（44a4d411）临时 worktree 上用改动前的测试与源码复跑同样失败，属分支既有基线红，与本任务无关，未修。
- 新增/改写的关键断言：`dismisses the confirmation dialog before validation starts and never reopens it`（gate 停在快照请求时会话已是 `dismissed` + `validating`，失败后会话为 null）；`keeps a reconciling session dismissed and ignores retry attempts`；17 处失败用例改为「会话为 null + `toast.error` 收到对应本地化文案」；对账三条结局改为会话释放；宿主测试改为「direct 不挂载、dismissed 挂载」。
- 未做真实下单的浏览器验收：开发服务器上的钱包会话会执行真实交易，不在本任务自主执行范围内。未实测官方终端确认弹窗是否点击即关。
- lingui 提取：删除了五条弹窗中间态文案，`.po` 由提交钩子同步。

## 后续与替代关系

- Close All 与 Reverse 仍为「等结果再关」，如需一致化另立任务。
- 不替代任何记录。
