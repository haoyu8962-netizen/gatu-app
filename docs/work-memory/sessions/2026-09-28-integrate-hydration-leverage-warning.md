<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-integrate-hydration-leverage-warning",
  "date": "2026-09-28",
  "title": "集成 PR：持久化水合的 CI 覆盖与杠杆警告拖动保持",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "order-entry"],
  "summary": "按用户要求把 PR 43（claude/hungry-cartwright-aa350f）与没有 PR 的 claude/heuristic-goldberg-e91886 合成一个集成分支，基于 dev 5c7ccbd1 做两次 --no-ff 合并。PR 43 的修复提交已由 518d0039 以相同补丁进入 dev，实际新增的只有 CI 清单一行和记录补充；冲突只在工作记录（取分支版本，它包含 dev 上的副本）和生成的 INDEX.md（重新生成）。杠杆警告分支合并无冲突。集成分支上 typecheck、Biome、CI 结构测试、全量单测（608 个文件 / 6,985 项）与滑杆浏览器套件（22 项）通过；没有做真人拖动验证，GitHub CI 以 PR 为准。",
  "thread": null,
  "baseCommit": "5c7ccbd1",
  "commits": ["d8235e9f", "ecbd4243"],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-09-26-persist-merge-first-visit-guard.md" },
    { "path": "docs/work-memory/sessions/2026-09-27-leverage-warning-gesture-hold.md" },
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": "apps/terminal/src/lib/tests/persisted-store-hydration.test.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/leverage-editor.tsx" },
    { "path": "apps/terminal/src/lib/tests/leverage-dialog-risk-warning.test.tsx" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/43" }
  ],
  "supersedes": []
}
-->
# 集成 PR：持久化水合的 CI 覆盖与杠杆警告拖动保持

## 背景与范围

用户询问能否把多个工作树的分支合成一个 PR，随后要求把 `claude/heuristic-goldberg-e91886` 与 PR #43（`claude/hungry-cartwright-aa350f`）合成一个集成 PR。本记录与任务同步写成，没有可核对的会话标识（`thread: null`）；两个分支各自的内容、理由与验证见它们自己的记录，本记录只覆盖集成本身。

合并前的核对（2026-09-28，均为只读）：

- 两个工作树都没有未提交的改动。`hungry-cartwright` 的本地分支头 `d2a0d6c3` 就是 #43 的头提交；`heuristic-goldberg` 的分支头 `723de534` 没有推送过。
- `heuristic-goldberg` 的会话「Hold leverage risk warning until drag ends」不在运行，最后活动为 2026-09-27 14:47 UTC；工作目录在该工作树里的进程只有闲置约 13 小时的 Claude Code、它的 Playwright MCP 服务器和一个登录 shell，都处于休眠。`hungry-cartwright` 的会话不在桌面应用返回的会话列表里（列表最多 20 条），该工作树里没有进程。
- #43 的 5 项检查在 `d2a0d6c3` 上都通过，但它与当时的 `dev` 冲突（`CONFLICTING`）。

## 结论与依据

- `git cherry` 显示 #43 的修复提交 `06293549` 与 `dev` 上的 `518d0039` 补丁相同。`518d0039` 是同一补丁的另一个提交，经 PR #44 的合并 `8b9950ce` 进入 `dev`，测试文件也随之进入。记录提交 `0979f50b` 与 `dev` 上同标题的 `79ec5555` 内容不同；`26d0b13b`（把 `persisted-store-hydration.test.ts` 加进 `terminal-tests.yml`）和 `d2a0d6c3`（记录补记）都不在 `dev`。所以 #43 真正还没进 `dev` 的只有 CI 清单一行和记录的补充。
- 第一次合并（`d8235e9f`）的冲突：`2026-09-26-persist-merge-first-visit-guard.md` 两边各自新增（add/add），取分支版本，因为逐行比较后 `dev` 上的副本是它的子集，分支只多出 CI 覆盖说明、`26d0b13b`、`terminal-tests.yml` 来源和开 PR 前的核对一段；`INDEX.md` 以 `dev` 为底，用 `pnpm memory:index` 重新生成。`terminal-tests.yml` 与 `use-global-settings-store.ts` 自动合并，后者两边补丁相同。
- 第二次合并（`ecbd4243`）没有冲突；git 自动合并出的 `INDEX.md` 经 `memory:check` 确认与生成结果一致。
- 两次都用 `--no-ff`，最终以 merge commit 合入 `dev`，两条原记录引用的哈希（`06293549`、`26d0b13b`、`bbfee99d` 等）因此都会留在 `dev` 的历史里。集成分支相对 `dev` 共改 13 个文件。

## 验证与限制

版本：集成分支 `ecbd4243`（基于 `dev` `5c7ccbd1`），2026-09-28，本机 macOS、Node v24.15.0。

- `pnpm --filter @gatu/terminal typecheck` 通过；6 个改动的 `src` 下 TS/TSX 文件 `pnpm exec biome check` 通过；`node --test scripts/ci-workflows.test.mjs` 6/6 通过。
- 合并后 AGENTS.md「Slider gestures」组（11 个文件，含杠杆分支新增的两个）加上 `leverage-modal`、`margin-mode-modal`、`persisted-store-hydration`，共 14 个文件 206 项通过。
- `pnpm memory:check` 通过，`pnpm memory:test` 8/8 通过。
- 终端全量 `pnpm --filter @gatu/terminal test`：608 个文件通过、1 个跳过，6,985 项通过、1 项跳过，本机并行用时约 110 秒。
- 滑杆浏览器套件 `pnpm --dir apps/terminal run test:browser:slider`（本机品牌 Chrome）22 项通过；按 CI 方式 `CI=1 … --fully-parallel --shard=1/2` 与 `2/2` 各 11 项通过。其余浏览器套件（下单、账户、通知等）没有在本机运行，交给集成 PR 的 CI。
- 输入路径：单测是 jsdom 里的脚本派发；滑杆浏览器套件混用 Playwright 协议注入与页面内脚本派发。杠杆警告的真人拖动验证在原记录里标为未执行，这次也没有做；该改动只在手势边界冻结展示，不涉及指针捕获、手势监听或取消清单。
- 未执行：生产构建与 GitHub CI，交给集成 PR 的检查。

## 后续与替代关系

- 集成 PR 合并后，#43 的头提交 `d2a0d6c3` 会进入 `dev`，预期 GitHub 会把 #43 标为已合并；如果没有，经用户确认后关闭 #43 并链接集成 PR。
- `heuristic-goldberg` 分支没有自己的 PR，它的会话在集成 PR 合并后可以归档。
- 没有被替代的记录。
