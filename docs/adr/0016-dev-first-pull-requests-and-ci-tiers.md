# ADR 0016：工作分支先进 `dev`，CI 按目标分支分层

- 状态：D1–D4 已接受并实施（产品负责人，2026-09-19）；D5 已规划，未执行。实施与验证记录见[任务记录](../work-memory/sessions/2026-09-19-ci-tiers-dev-first-flow.md)。
- 关联：`.claude/rules/git.md`（分支与 PR 规则）、`AGENTS.md` 末段、`.github/workflows/`、[CI 分钟耗尽记录](../work-memory/sessions/2026-09-15-ci-minutes-concurrency.md)。

## 背景与约束

- 仓库是个人账户下的私有仓库，实际只有一位维护者合并，同时有多个 AI 会话在各自的 worktree 里并行改动。各自验证通过、合在一起才出问题（体积预算、翻译目录、锁文件、布局契约）是真实风险，需要一个汇合点。
- GitHub Actions 额度为每月 3,000 分钟。`main` 近 60 天的主线只有合并提交，没有直接提交；`main` 与 `dev` 均无保护规则，`gh pr create` 默认以 `main` 为目标。
- 发布是本地构建后手动上传，仓库没有部署工作流，进 `main` 不等于上线；真机验收属于发布闸门。
- 实测（PR #30，head `0af67e47`，2026-09-19）：`Production Builds` 的 4 路配对矩阵每路 10.8–12.5 分钟，其中 10 个测试步骤占 3.4–4.3 分钟、构建占约 6.2 分钟；矩阵变量只被构建步骤读取，所以 4 路跑的是同一批测试。浏览器回归 12.5 分钟，类型检查 2.4 分钟，翻译检查 1.5 分钟，网站构建 1.8 分钟。按任务向上取整约 68 计费分钟/次推送（不含 Claude 审查任务，未测）。
- CI 列出的 76 个 vitest 参数展开为 88 个存在的测试文件，终端全量为 576 个文件。全量在 12 核本机并行运行 386 秒，5 个文件共 45 个用例失败；其中 4 个文件单独运行全部通过，`establish-connection-modal` 的 1 个用例单独运行仍然超时。

## 决策

- **D1 分支流向。** 工作分支只向 `dev` 开 PR；`main` 只接受来自 `dev` 的 PR，用 merge commit 合并（任务记录与 ADR 会引用分支上的提交哈希，squash 会让它们失效）。紧急修复从 `main` 切分支、向 `main` 开 PR，合并后立即把 `main` 合回 `dev`。规则写入 `.claude/rules/git.md`，`AGENTS.md` 保留一句指针。
- **D2 重型工作流只对进 `main` 的 PR 触发。** `production-build.yml`（4 路构建与网站）与 `slider-browser.yml`（浏览器回归）加 `branches: [main]`，并保留或新增 `workflow_dispatch`，需要时可在任意分支手动运行。工作分支这一层的构建验证由本地 `pnpm build` 承担。
- **D3 测试移出矩阵，只跑一次。** 10 个与矩阵无关的测试步骤原样移入新的 `terminal-tests.yml`，对所有 PR 触发。4 路构建保持不变：四种开关组合各自验证构建、体积预算与懒加载图。
- **D4 同一 PR 的新推送取消旧运行。** 采用 2026-09-15 已写好的 `concurrency` 改动（原提交 `d76b12f9`）；`claude.yml` 由评论与 issue 触发，取消会丢工作，不加。
- **D5（未执行）`main` 的保护规则。** 计划：必须经 PR、禁止 force push 与删除。必选状态检查推迟到全量单测稳定之后，否则每次晋升都会被不稳定的用例卡住。属于仓库设置变更，需维护者确认后执行。

## 未采用的方案

| 方案 | 未采用的原因 |
| --- | --- |
| 新建聚合用的 `gate.yml` 顺序重跑全部检查 | 与现有工作流重复，计费分钟翻倍；它要解决的“路径过滤导致必选检查一直 pending”只在纯文档发版时出现，维护者放行即可 |
| 用必选 job 校验 PR 来源分支 | 成因是 `gh pr create` 的默认目标；一条规则即可，不值得多维护一个检查 |
| `dev` 也设必选检查 | 同一套闸门设两遍；`dev` 的作用是让工作分支尽快汇合 |
| 现在就把全量单测设为闸门 | 并行运行下尚有 45 个失败用例，需先修稳 |
| 测试留在矩阵内 | 同一批测试每次推送重复 4 遍，每次约多花 10 计费分钟，且没有额外覆盖 |
| 把仓库默认分支改为 `dev` | 能从根上修正 PR 默认目标，但对桌面端新建 worktree 的基点、issue 自动关闭的影响未验证，留待单独评估 |

## 后果与边界

- 估算（由上面一次实测推算，未经推送后的真实运行验证）：进 `dev` 的 PR 每次推送约 11 计费分钟（原约 68）；进 `main` 的 PR 约 60 分钟。
- 体积预算、chunk 环与浏览器回归不再在每个工作分支 PR 上运行，回归要到 `dev → main` 才由 CI 发现，届时批量更大、归因更难。缓解：涉及体积或布局的改动在本地运行 `pnpm build` 与对应 Playwright 套件，或用 `workflow_dispatch` 在该分支手动触发。
- `production-build.yml` 的路径过滤保持原样，仍包含已移走测试的脚本路径；这是无害的超集。
- CI 的手选测试清单里 `src/lib/tests/geo-server-functions.test.ts` 已不存在（`5944465d` 删除），vitest 会静默忽略不匹配的参数。本次按原样搬移，未清理；全量单测成为闸门后这份清单应整体移除。

## 证据

- 工作流：`.github/workflows/terminal-tests.yml`、`production-build.yml`、`slider-browser.yml`。
- 回归：`scripts/check-client-bundle-budget.test.mjs` 钉住“预算测试在 `terminal-tests.yml` 运行、构建工作流内不再有测试步骤、测试工作流不含矩阵”。
- 本次执行的验证命令与结果见任务记录；CI 在 GitHub 上的实际触发与取消行为需在推送后的第一个 PR 上观察，本 ADR 不包含该证据。
