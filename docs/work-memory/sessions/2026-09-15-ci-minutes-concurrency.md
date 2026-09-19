<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-15-ci-minutes-concurrency",
  "date": "2026-09-15",
  "title": "CI 分钟耗尽：账单锁定诊断与同 PR 并发取消",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review"],
  "summary": "PR #24 八项检查 3 秒内失败且无步骤，根因是 GitHub Pro 月度 3,000 分钟用尽而 Actions 预算为 0；每次推送约 90 计费分钟；设预算后重跑全绿并合并；五个 PR 工作流加 concurrency 取消被取代的运行，构建矩阵保留。",
  "thread": null,
  "baseCommit": "f5010ee7",
  "commits": [],
  "sources": [
    { "path": ".github/workflows/production-build.yml" },
    { "path": ".github/workflows/slider-browser.yml" },
    { "url": "https://github.com/zora4523-bot/gatu-app/blob/d76b12f99b4ccd1a837a3717a1844f87e445ea5e/.github/workflows/typecheck.yml" },
    { "url": "https://github.com/zora4523-bot/gatu-app/blob/d76b12f99b4ccd1a837a3717a1844f87e445ea5e/.github/workflows/i18n-check.yml" },
    { "path": ".github/workflows/claude-code-review.yml" },
    { "path": "docs/work-memory/sessions/2026-09-13-spa-shell-spike.md" }
  ],
  "supersedes": []
}
-->
# CI 分钟耗尽：账单锁定诊断与同 PR 并发取消

## 背景与范围

2026-09-15 PR #24（`claude/spa-mode`，head `7ff8c48d`）的八项检查全部在 3 到 5 秒内失败，任务没有任何步骤。本次任务负责定位原因、恢复 CI、合并 PR，并减少后续的分钟消耗。任务标识未取得（会话不在 Codex 归档路径内），`thread` 记为 null。

## 结论与依据

### 诊断

- 每个失败任务的 check-run 注解相同："The job was not started because recent account payments have failed or your spending limit needs to be increased"。这是 GitHub 在任务调度前的拒绝，与代码和工作流内容无关。
- 用户确认账号已升级 GitHub Pro，当月 3,000 分钟免费额度已用尽；私有仓库超出额度后需要 Actions 预算大于 0 才会继续调度。
- 用量结构（按 PR #24 的成功运行，计费按任务累加）：

| 工作流 | 任务数 | 单任务耗时 | 计费分钟 |
| --- | --- | --- | --- |
| Production Builds | 5（4 组配对矩阵 + 网站） | 14 到 17 分钟 | 约 75 |
| Terminal Browser Tests | 1 | 约 12 分钟 | 12 |
| Type Check + Check Translations | 2 | 1 到 2.5 分钟 | 3 |

  每次向 PR 推送约 90 分钟，3,000 分钟约等于 33 次推送。六个工作流原先都没有 `concurrency` 设置，同一 PR 连续推送时旧运行不会取消。

### 处置与决策

1. 用户在 Billing → Budgets 为 Actions 设置预算。之后三次 `gh run rerun` 仍被同样注解拒绝（状态先 queued 再失败），约 20 分钟后第四次重跑才真正调度。生效延迟的原因未能确认，可能是预算生效延迟，也可能是用户同时补了付款。
2. 重跑后八项检查全部通过（同一 head `7ff8c48d`）；PR #24 以 merge commit 合入 main（`f5010ee7`）。选择 merge commit 而非 squash，因为 ADR 和工作记录引用了分支上的提交哈希。
3. 五个由 `pull_request` 触发的工作流加入顶层 `concurrency`，分组为 `${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}`，`cancel-in-progress: true`。`claude.yml` 由评论、issue 和评审事件触发，每个事件是独立请求，取消会丢失工作，因此不加。
4. 构建矩阵保留。四组 create/import 组合验证构建期开关，砍掉会丢覆盖；按 Linux 每分钟 $0.008 计算，每次推送约 $0.72。
5. 不通过公开仓库换取免费分钟：仓库包含 TradingView Advanced Charts（`apps/terminal/public/charting_library/`），许可禁止公开再分发。

## 验证与限制

- PR #24 重跑结果：Build terminal 四组 14 到 17 分钟通过，Build website 1.5 分钟通过，Terminal browser regressions 12 分钟通过，Validate TypeScript 2.5 分钟通过，Validate translation catalogs 1 分钟通过。
- 本次 concurrency 改动的验证以其自身 PR 的检查结果为准；取消效果需要在同一 PR 连续推送两次才能观察到，本记录不包含该证据。
- 账单 API `GET /users/{user}/settings/billing/actions` 需要 `user` 授权范围，当前 token 没有，账单细节只能由用户在网页核对。

## 后续与替代关系

- 若账单仍在意，可把三组额外矩阵组合改为按标签触发。
- 退役 EC2 的 PR 仍按 ADR 0005 待办执行。
- 本记录不替代任何既有记录；PR #24 的发布与切换过程见 [SPA 壳验证记录](2026-09-13-spa-shell-spike.md)。
