<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-19-ci-tiers-dev-first-flow",
  "date": "2026-09-19",
  "title": "工作分支先进 dev、CI 按目标分支分层与测试移出矩阵",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "docs-governance"],
  "summary": "修复 portfolio-overview 的时钟竞态后评估 Worker→dev→main 闸门：4 路矩阵重复跑同一批测试、全量单测并行下 45 红、main/dev 无保护。落地 ADR 0016：PR 目标写明 dev，4 路构建与浏览器回归只对进 main 的 PR 运行，测试移入 terminal-tests.yml 只跑一次，合入 concurrency；main 保护规则未执行，GitHub 侧触发行为待首个 PR 验证。",
  "thread": null,
  "baseCommit": "d6cc4f3e",
  "commits": ["9b43af62", "99434d36"],
  "sources": [
    { "path": "docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md" },
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": ".github/workflows/production-build.yml" },
    { "path": ".github/workflows/slider-browser.yml" },
    { "path": "scripts/check-client-bundle-budget.test.mjs" },
    { "path": ".claude/rules/git.md" },
    { "path": "AGENTS.md" },
    { "path": "apps/terminal/src/lib/tests/portfolio-overview.test.tsx" },
    { "path": "apps/terminal/src/hooks/portfolio/use-portfolio-data.ts" },
    { "path": "docs/work-memory/sessions/2026-09-15-ci-minutes-concurrency.md" }
  ],
  "supersedes": []
}
-->
# 工作分支先进 dev、CI 按目标分支分层与测试移出矩阵

## 背景与范围

同步记录，2026-09-19，worktree 分支 `claude/sweet-gates-1ca723`，基线 `main` `d6cc4f3e`。任务标识未取得（会话不在 Codex 归档路径内），`thread` 记为 null。任务分三段：

1. 修复 `portfolio-overview.test.tsx` 的偶发失败（负载下约 8 次出现 1 次）。
2. 用户询问如何实行 Worker → Integration → Main 的闸门流程，随后要求指出其中对本项目过度设计的部分。
3. 用户确认后执行四步计划中的前三步；第四步（`main` 保护规则）按计划顺序尚未到期，也未执行。

## 结论与依据

### 偶发失败的根因与修复（`9b43af62`）

- `use-portfolio-data.ts` 先取 `now = Date.now()`，随后各 mock hook 再各自调用 `Date.now()` 生成 `dataUpdatedAt`。两次调用之间跨毫秒时 age 为 -1，`getPortfolioQueryStatus` 按设计把未来时间戳判为 stale，权益渲染为 `$0.00`。
- 复现：基线测试的临时副本里让 `Date.now()` 每次调用前进 1 ms，20 个用例失败 9 个，报错与偶发失败一致；过期用例（`queryAge = 120_000`）反向受影响，age 变为 119,999 被判为 ready。副本未提交。
- 修复只改测试：夹具时间戳改为 `mocks.frozenNow - mocks.queryAge`，不再读时钟；`beforeEach` 用 fake timers 把系统时间冻结在同一时刻；删除只有一个用例使用的 `fixedUpdatedAt`。生产的 `age < 0` 守卫未动。

### 流程评估（观察）

- `gh api` 查询：`main`、`dev` 无 branch protection，仓库 rulesets 为空；仓库属个人账户，默认分支 `main`。
- `main` 的 first-parent 历史近 60 天为 24 个合并提交、0 个直接提交；`main..dev` 为 0，`dev..main` 为 1（PR #30 的合并提交）。
- PR #30（head `0af67e47`）各任务耗时：矩阵四路 11.8 / 12.5 / 11.2 / 10.8 分钟，其中测试步骤 4.1 / 4.3 / 3.4 / 3.4 分钟，构建步骤约 372 秒；网站 1.8、浏览器回归 12.5、类型检查 2.4、翻译检查 1.5 分钟。矩阵变量只出现在构建步骤的 `env`。
- CI 的 76 个 vitest 参数展开为 88 个存在的文件；`src/lib/tests/geo-server-functions.test.ts` 已被 `5944465d` 删除，参数匹配为空，vitest 静默忽略。
- 全量 `pnpm --filter @gatu/terminal test`（本分支 `9b43af62`，12 核 macOS，无 `apps/terminal/.env.local`）：576 文件 / 6,368 用例，386 秒；5 个文件共 45 个用例失败。五个文件单独一起运行时 4 个文件全部通过，`establish-connection-modal.test.tsx` 的 “uses the mobile drawer and completes only after Agent confirmation” 仍以 5000 ms 超时失败。

### 采用的方案

见 [ADR 0016](../../adr/0016-dev-first-pull-requests-and-ci-tiers.md)。要点：分支规则写入 `.claude/rules/git.md` 并在 `AGENTS.md` 留指针；`production-build.yml` 与 `slider-browser.yml` 加 `branches: [main]`，前者新增 `workflow_dispatch`（`vite.config.ts` 在 `GATU_BUILD_SHA` 为空时回退 `GITHUB_SHA`）；10 个测试步骤原样移入 `terminal-tests.yml`；`concurrency` 取自 `d76b12f9`，以 `99434d36` 摘入（INDEX.md 冲突通过重新生成解决，提交信息补了 commitlint 要求的 scope）。

评估中判为过度设计而未做的：每次晋升前把 `main` 合回 `dev`、独立的 Migration 检查（无数据库）、独立的 Integration 阶段、字面意义的 E2E、第二次全量 Review、聚合 `gate.yml`、来源分支检查 job、`dev` 的必选检查、正式的 hotfix 通道。理由见 ADR 的“未采用的方案”。

## 验证与限制

版本：工作区基于 `99434d36`，2026-09-19 本机执行。

| 检查 | 结果 |
| --- | --- |
| `vitest run src/lib/tests/portfolio-overview.test.tsx` 循环 40 次，12 核同时压满 | 40 通过 / 0 失败，每次 20 个用例 |
| 该测试文件的 `biome check`、`pnpm --filter @gatu/terminal typecheck` | 通过 |
| 搬移的 10 个步骤与 `origin/main` 的原文逐字节比较 | 相同；80 个测试参数顺序与内容一致 |
| `production-build.yml` 内残留 `vitest` / `node --test` / `test:cloudfront` | 无；矩阵任务只剩构建与 3 个构建后校验 |
| Ruby YAML 解析全部 7 个工作流并读取触发条件 | 通过；`production-build`、`slider-browser` 的 base 为 `main`，其余为任意；6 个 PR 工作流均有 `concurrency` |
| `node --test`（4 个校验脚本测试，含新增的工作流钉子） | 48 通过 / 0 失败 |
| 变异检查：向 `production-build.yml` 追加一行 `vitest run` | 新钉子失败（15 通过 / 1 失败），随后还原 |
| `pnpm test:cloudfront` | 39 通过 / 0 失败 |
| 按 `terminal-tests.yml` 的原文在本机顺序执行全部 10 个步骤 | 10 个步骤全部退出码 0；vitest 共 88 个文件 / 1,525 个用例通过，总耗时 168 秒 |
| `pnpm memory:index`、`memory:check`、`memory:test` | 索引已生成并校验通过；`memory:test` 8 通过 / 0 失败 |

限制：

- 没有推送，GitHub 上的实际行为（`branches` 过滤、`workflow_dispatch`、`concurrency` 取消、新工作流的计费分钟）均未观察；ADR 中的分钟数是由 PR #30 一次运行推算的估计值。
- `actionlint` 未安装，未运行。Biome 配置忽略 `scripts/`，对改动的测试脚本不适用（“No files were processed”）。
- 全量单测只跑了一次，失败用例的根因未调查。

## 后续与替代关系

- 让全量单测在并行运行下稳定（已另起任务）；稳定后用它替换 CI 的手选清单，并删除失效的 `geo-server-functions` 参数。
- ADR 0016 的 D5：`main` 保护规则待维护者确认后执行；必选检查在全量单测稳定后再加。
- 推送后在第一个进 `dev` 和第一个进 `main` 的 PR 上核对实际触发的工作流与计费分钟，回填本记录或新增记录。
- `origin/claude/ci-concurrency` 的 `d76b12f9` 已由 `99434d36` 覆盖，该远端分支可以删除。
- 本记录不替代任何既有记录；分钟额度背景见 [CI 分钟耗尽记录](2026-09-15-ci-minutes-concurrency.md)。
- 2026-09-19 同日补记：本记录中“`production-build`、`slider-browser` 只对进 `main` 的 PR 触发”（ADR 0016 原 D2）在推送之前已由产品负责人改为 D2′（每个 PR 构建默认组合并跑两片浏览器回归，其余三组只在晋升、发版标签和手动运行时构建），并发分组表达式改为 `${{ github.workflow }}-${{ github.ref }}`，见[按四条方案的改造](2026-09-19-ci-restructure.md)。本记录的其余结论（分支流向、测试移出矩阵、`claude.yml` 不加并发）仍然有效；上面的验证结果对应的是 `cdc4d3d2` 的工作流内容，不是改造后的内容。
- 2026-10-02 补记：第一条后续里的失效 `geo-server-functions` 参数已换成取代它的 `geo-api.test.ts`（不是删除），并新增“工作流列出的测试路径必须匹配到文件”的钉子，见 [CI 测试清单路径记录](2026-10-02-ci-listed-test-paths.md)。用全量单测替换手选清单的事项仍未完成。
