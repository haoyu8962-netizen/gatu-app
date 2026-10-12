<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-12-ci-terminal-test-shards",
  "date": "2026-10-12",
  "title": "CI：Terminal Tests 拆两片并行，只改单测的 PR 不跑浏览器回归",
  "kind": "task",
  "status": "verified",
  "topics": ["docs-governance"],
  "summary": "运营方问小改动是否都要跑 CI、一轮多久，并同意缩短。实测一轮约 17 分钟等待、约 33 计费分钟，最长项是 Terminal Tests（十四组手选 Vitest 文件单 job 单 worker 串行，约 15.5 分钟）。改为两个分片并行（每步加 --shard 与 --passWithNoTests，三个非 Vitest 步骤只在第一片跑），浏览器回归的路径过滤排除 *.test.ts(x)。ci-workflows.test.mjs 新增两条结构断言并做了两次变异检查；本地确认一个步骤的两片互不重叠且合起来等于清单。手册写入「一个 PR 尽量只推一次」。GitHub 上的实际耗时待本 PR 的首轮运行观察。",
  "thread": null,
  "baseCommit": "2eeec75d",
  "commits": [],
  "sources": [
    {"path": ".github/workflows/terminal-tests.yml"},
    {"path": ".github/workflows/slider-browser.yml"},
    {"path": "scripts/ci-workflows.test.mjs"},
    {"path": "docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": ".claude/rules/git.md"}
  ],
  "supersedes": []
}
-->
# CI：Terminal Tests 拆两片并行，只改单测的 PR 不跑浏览器回归

## 背景与范围

同步记录，未取得任务标识。运营方问「修改一个小问题都要跑 CI 吗，跑一次要多久」，在听取建议后答复「同意，去做」。工作树 `.claude/worktrees/ci-shards`，分支 `claude/ci-terminal-test-shards`，起点 `origin/dev` `2eeec75d`。只改工作流、结构测试与文档，不改应用代码和测试清单。

## 结论与依据

- 2026-10-11/12 的 PR #97–#102 实测：Static Checks 约 2.7 分钟、配对关构建约 6.5 分钟、Terminal Tests 约 15.5 分钟、浏览器回归两片各约 15–17 分钟；一轮等待约 17 分钟、约 33 计费分钟。
- 更正此前口头说法：CI 跑的不是全量 Vitest，而是 `terminal-tests.yml` 里十四组手选文件，在一个 job 里 `--maxWorkers=1` 串行；浏览器回归原本就按路径过滤（`docs/`、`deploy/`、`scripts/` 的 PR 不启动它）。
- 改动一：`Terminal Tests` 加 `matrix.shard: [1, 2]`，十四个 Vitest 步骤都加 `--shard=${{ matrix.shard }}/2 --passWithNoTests`，每片仍单 worker；`node --test` 发布校验器、`pnpm test:cloudfront`、`pnpm brand:check` 三步加 `if: matrix.shard == 1`。
- 改动二：`slider-browser.yml` 的路径在 `apps/terminal/src/**` 之后排除 `**/*.test.ts` 与 `**/*.test.tsx`。不排除整个 `src/lib/tests`：五个浏览器夹具引用 `@/lib/tests/harness/react`；也不排除翻译目录：夹具断言中文文案。
- 不采用：按标签跳过浏览器回归、`[skip ci]`（理由见 ADR 0016 的 2026-10-12 补记）。
- 手册第 3 节新增「少跑一轮的做法」：一个代码 PR 尽量只推一次，审查评论与 CI 失败攒成一次推送，文档补记另开文档 PR。

## 验证与限制

- `node --test scripts/ci-workflows.test.mjs`：14/14 通过（新增两条）。变异检查：去掉一个步骤的分片参数 → 「unsharded Vitest step」失败；给一个 Vitest 步骤加 `if: matrix.shard == 1` → 「would skip half of its files」失败；恢复后通过。
- 本地 Vitest 4.0.16：两文件步骤的两片各跑一个文件；单文件步骤的空片在 `--passWithNoTests` 下以 0 退出；「slider gesture lifecycles」八个文件两片各四个，无重叠，并集为八个，均通过。
- `git diff --check`、`pnpm memory:index`、`pnpm memory:check` 通过。Biome 不处理 `scripts/*.mjs`（配置忽略）。
- 未验证：GitHub 上两片的实际耗时与计费、路径排除对真实 PR 的触发行为；本 PR 改了 `.github/workflows/**`，会启动 Terminal Tests 两片，不会启动浏览器回归（它只对自己的工作流文件敏感，本 PR 改了 `slider-browser.yml`，所以会启动）。以首轮运行为准。

## 后续与替代关系

补充 [ADR 0016](../../adr/0016-dev-first-pull-requests-and-ci-tiers.md)，不替代。若两片耗时明显不均，可再调清单分组；全量 Vitest 仍只在本地按需运行。
