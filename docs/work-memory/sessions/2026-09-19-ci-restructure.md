<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-19-ci-restructure",
  "date": "2026-09-19",
  "title": "按四条方案改造 PR 检查，并与同日的首版 CI 分层合并整理",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "pr-review"
  ],
  "summary": "同一天有两个会话各自改造 CI：首版（ADR 0016 原 D2）把构建与浏览器回归只留给进 main 的 PR，本任务按用户的四条方案改造。用户决定以四条为准：保留首版的分支流向、独立的 terminal-tests.yml 与测试钉子，把 D2 改为 D2′（每个 PR 构建默认配对组合并跑两片浏览器回归，其余三组只在进 main 的 PR、v[0-9]* 或 cloudfront-[0-9]* 标签和手动运行时构建），并合并静态检查、给网站工作流加路径过滤。预估每次推送计费约 33 分钟、等待约 8 分钟；工作流未在 GitHub 上运行，改动已提交、未推送。",
  "thread": null,
  "baseCommit": "9f875c65",
  "commits": [],
  "sources": [
    { "path": ".github/workflows/production-build.yml" },
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": ".github/workflows/static-checks.yml" },
    { "path": ".github/workflows/website-build.yml" },
    { "path": ".github/workflows/slider-browser.yml" },
    { "path": ".github/workflows/claude.yml" },
    { "path": "scripts/ci-workflows.test.mjs" },
    { "path": "scripts/check-client-bundle-budget.test.mjs" },
    { "path": "docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md" },
    { "path": "docs/work-memory/sessions/2026-09-19-ci-tiers-dev-first-flow.md" }
  ],
  "supersedes": []
}
-->
# 按四条方案改造 PR 检查，并与同日的首版 CI 分层合并整理

## 背景与范围

用户要求分析 GitHub Actions 并把单次运行从约 60 分钟压到 10 分钟以内，随后给出四条改造方案（并发控制；测试移出矩阵、合并小 job、网站 job 加路径过滤；PR 只跑一组构建；浏览器测试分两片），起初要求不提交、不推送；整理完成并确认三点后要求提交、仍不推送。本记录为同步记录；任务标识未取得。

改造完成后发现另一个会话（由本会话生成的“修复 portfolio 测试竞态”任务卡片开出，worktree `sweet-gates-1ca723`）在同一天提交了另一套 CI 改造和 ADR 0016，4 个提交均未推送：`9b43af62`（测试修复）、`99434d36`（并发取消）、`cdc4d3d2`（测试移出矩阵、重型工作流只对进 `main` 的 PR 触发）、`9f875c65`（分支流向规则与 ADR）。两边改的是同一批文件。用户决定以四条为准并要求整理。

整理方式：备份本任务的未提交改动后，把 `claude/ci-restructure`（worktree `.claude/worktrees/worktree-02`）从 `origin/dev` 快进到 `9f875c65`，没有产生新提交，也没有改动那个会话的分支和工作区；然后在其上重新落实四条，经用户确认后作为一个提交。`d6cc4f3e`（PR #30 的合并提交）相对 `0af67e47` 没有文件差异。

## 结论与依据

### 基线（`dev` 上 2026-09-19 的完整运行，GitHub API 步骤时间）

| Job | 耗时 | 计费分钟 |
| --- | --- | --- |
| Build terminal ×4 | 10:47 / 11:09 / 11:48 / 12:32 | 48 |
| Terminal browser regressions | 12:30 | 13 |
| Validate TypeScript | 2:21 | 3 |
| Validate translation catalogs | 1:32 | 2 |
| Build website | 1:45 | 2 |

“约 60 分钟”是 8 个 job 向上取整后的计费合计（68），每次推送实际等待约 12.5 分钟。仓库没有分支保护和 ruleset，检查改名不会卡合并。

### 保留首版的部分

- 分支流向 D1 与 `.claude/rules/git.md`、`AGENTS.md` 的指针：与四条无关，且第 3 条所说的“发版 PR”正是靠它定义为进 `main` 的 PR。
- 独立的 `terminal-tests.yml`：比本任务最初写在 `production-build.yml` 里的 `tests` job 更好——它有自己的路径过滤；标签和手动运行只为构建全矩阵，不会重跑测试；“构建工作流内没有测试步骤”已被断言钉住。用户第 2 条要求的“独立 job”由它满足。
- `check-client-bundle-budget.test.mjs` 的两条工作流断言、测试修复提交、2026-09-15 的 CI 分钟记录。

### 按四条改掉的部分

- **第 1 条**：并发分组表达式统一为 `${{ github.workflow }}-${{ github.ref }}`（与首版的 `pull_request.number || github.ref` 等价）。`claude.yml` 不加，原因写进该文件，与首版 D4 一致。
- **第 2 条**：`typecheck.yml` 与 `i18n-check.yml` 合并为 `static-checks.yml`；网站 job 移到带路径过滤的 `website-build.yml`，路径覆盖 `pnpm test:brand` 的全部非单测输入，`test:brand` 里只在这里运行的 4 个终端品牌单测并入 `terminal-tests.yml`。
- **第 3 条**：去掉 `production-build.yml` 的 `branches: [main]`，矩阵改为按事件取值的表达式；新增 `v[0-9]*`、`cloudfront-[0-9]*` 标签触发（用户确认保留这两个前缀，并要求保证 `archive/**` 不触发；`tags` 与 `tags-ignore` 不能同时写，所以收紧为前缀后必须跟数字）；`GATU_BUILD_SHA` 在非 PR 事件回退到 `github.sha`。
- **第 4 条**：去掉 `slider-browser.yml` 的 `branches: [main]`，分两片，每次调用带 `--fully-parallel --shard`。

细节与未采用的方案写在 [ADR 0016](../../adr/0016-dev-first-pull-requests-and-ci-tiers.md)（D2 标为被 D2′ 取代，新增 D6、D7）。`.claude/rules/git.md` 的 CI 分层说明、`docs/adr/README.md` 的索引行和 CHANGELOG 同步改写；首版任务记录末尾追加了一条指向本记录的补记，其正文未改。

新增 `scripts/ci-workflows.test.mjs`，由 `terminal-tests.yml` 运行（该工作流的路径过滤改为 `.github/workflows/**`，首版对具体文件名的断言相应更新），钉住：并发分组且 `claude.yml` 不得有；按事件取值的矩阵、无 `branches` 过滤；标签模式恰为两条收紧后的模式、不得出现 `tags-ignore`，并用样例标签验证（`v0.1.0`、`cloudfront-2026-09-17-p21` 匹配，`archive/2026-09-10/huagan`、`archive/v1`、`vault-backup`、`cloudfront-draft`、`v` 不匹配）；每次浏览器调用都带分片参数且不经包脚本；静态检查在一个 job 内且旧文件不存在；`test:brand` 里的终端单测全部出现在 `terminal-tests.yml`。

## 验证与限制

- 七个工作流用 Ruby YAML 解析通过，矩阵表达式折叠为单行。按 `terminal-tests.yml` 里“验证器”一步的原样命令执行 5 个 `node --test` 文件，全部通过（含 `ci-workflows.test.mjs` 的 6 条）。变异检查六项（去掉一次调用的分片参数、恢复 `branches: [main]`、从测试工作流删一个品牌单测、给 `claude.yml` 加并发组、把 `v[0-9]*` 放宽回 `v*`、加入 `archive/**` 模式）均使对应用例失败，随后还原并复跑通过。新增的品牌单测步骤按原样命令在 worktree-01 执行，4 个文件 16 个用例通过。`memory:index`、`memory:check`、`memory:test` 与 `git diff --check` 通过。本机没有 `actionlint`，未安装。
- `playwright test --list` 实测分片分布：不加 `--fully-parallel` 时订单录入与账户两套全部落在 1/2、2/2 为 0 个测试；加上后共享配置 23/23（最终布局为滑杆 10/9 加其余 14/13）、订单录入 15/14、账户 12/12。
- 本地实跑两个分片（本机 Chrome，非 CI 的 Chromium；代码为 worktree-01 即 PR #31 的分支，`apps/terminal/tests/browser` 与 `origin/dev` 无差异）：99 个测试全部被调度，首轮 98 通过、1 失败（`drawer-interactions` 的 bottom drawer swipe，`geometry.bottom` 为 1204 而非 844，是该轮分片 1 的第一个测试）。随后原始调用方式 2 次 26/26、分片方式 2 次 23/23；清空 `node_modules/.vite-browser` 的冷缓存对比中，合并调用布局 2 次 23/23，最终布局 2 次 10/10 加 14/14，分片 2/2 为 9/9 加 13/13。该次失败未能复现也未能归因，冷缓存假设未被证实。
- **未验证**：工作流没有在 GitHub 上运行过。`fromJSON` 矩阵表达式、标签触发、`workflow_dispatch`、并发取消效果、各 job 的真实耗时都需要首次 PR 运行确认。预估每次推送计费约 33 分钟（测试 6、单组构建 8、静态检查 3、浏览器两片各 8，网站通常不触发）、等待约 8 分钟，进 `main` 的 PR 另加三组构建约 24 分钟；均为按基线步骤耗时推算。
- 首版任务记录里的验证结果对应 `cdc4d3d2` 的工作流内容，不适用于改造后的内容；其中“按 `terminal-tests.yml` 原文顺序执行 10 个步骤”对未改动的那 10 步仍然成立，新增的品牌单测步骤和 `ci-workflows.test.mjs` 之外的部分本任务没有重跑。

## 后续与替代关系

- 局部替代：ADR 0016 原 D2 与首版任务记录中“构建与浏览器回归只对进 `main` 的 PR 触发”、并发分组表达式两点被本记录取代；首版记录的其余结论仍然有效，所以 `supersedes` 为空。
- 用户已确认（2026-09-19）：标签模式如上；接受分支携带首版的提交一并进 `dev`；接受其余三组构建反馈延后，保留 `workflow_dispatch` 作为提前验证手段。
- 分支 `claude/ci-restructure` 现含首版的 4 个提交与 `d6cc4f3e`，向 `dev` 开 PR 时会一并带入；`claude/sweet-gates-1ca723` 若之后再有新提交需要重新快进或合并。
- PR #25 与 `origin/claude/ci-concurrency` 已被覆盖，合并本分支后可关闭与删除。
- 首次运行后对照基线核对耗时，并观察 `drawer-interactions` 是否出现同类失败。
