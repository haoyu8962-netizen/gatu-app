<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-ci-listed-test-paths",
  "date": "2026-10-02",
  "title": "CI 测试清单的失效 geo 参数换成继任测试，并钉住列出的路径必须存在",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review"],
  "summary": "terminal-tests.yml 的 geo 步骤一直列着 2026-09-13 被 5944465d 删除的 geo-server-functions.test.ts，vitest 把不匹配的参数当作空过滤器，该步骤实际少跑一个文件仍然通过；继任测试 geo-api.test.ts 从未进入 CI。参数已换成 geo-api.test.ts，ci-workflows.test.mjs 新增钉子：工作流传给 vitest、Playwright 与 node --test 的每个路径（文件名通配符展开后）都必须匹配到文件。本机验证通过，未推送，GitHub 上未运行。",
  "thread": null,
  "baseCommit": "682430ba",
  "commits": [],
  "sources": [
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": ".github/workflows/slider-browser.yml" },
    { "path": "scripts/ci-workflows.test.mjs" },
    { "path": "apps/terminal/src/lib/tests/geo-api.test.ts" },
    { "path": "apps/terminal/vitest.config.ts" },
    { "path": "docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md" },
    { "path": "docs/work-memory/sessions/2026-09-19-ci-tiers-dev-first-flow.md" }
  ],
  "supersedes": []
}
-->
# CI 测试清单的失效 geo 参数换成继任测试，并钉住列出的路径必须存在

## 背景与范围

同步记录，2026-10-02，未取得可核对的任务标识。Claude Code 桌面会话，worktree `jolly-stonebraker-c3d1de`，从 `origin/dev` `682430ba`（工作区干净）新建分支 `claude/ci-listed-test-paths`。

用户请求：查明 `.github/workflows/terminal-tests.yml` 的 “Test Deposit, CCTP, routing, and geo guards” 步骤里 `src/lib/tests/geo-server-functions.test.ts` 的去向（`dev` 上不存在），换成正确的现存测试或删除，不改其他步骤；核对 `scripts/ci-workflows.test.mjs` 是否钉住这份清单，运行它和受影响的 vitest 文件；考虑新增“列出的测试路径不存在就失败”的守卫。用户未要求推送或开 PR。

## 结论与依据

### 测试的去向

- `f1929fcd`（2026-08-17）新增 `geo-server-functions.test.ts` 并把它写进工作流清单。
- `5944465d`（2026-09-13，“move geo and error reports to portable api routes”）把 `getGeo` / `getReferralActionGeo` 从 TanStack server function 改为同源的 `/api/geo`、`/api/referral-geo` 路由，删除该测试，同一提交新增 `geo-api.test.ts`；工作流清单没有同步。`git log --all --diff-filter=DR -- '*geo-server-functions*'` 只有这一次删除，不是改名。
- 旧文件的 5 个用例在 `geo-api.test.ts` 里都有对应：开发环境的默认放行与受限覆盖（“geo API handlers in development” 两个用例）；畸形覆盖失败关闭（处理器返回 400 `invalid_override`，推荐判定为 `unavailable` / `invalid_response`，客户端抛出 `Invalid development geo override`）；生产环境忽略覆盖并查询 IPdata；生产环境缺少配置时失败关闭（503 `missing_config`，推荐判定在响应体里为 `unavailable`）。新文件另有缓存、代理、同源 POST 与客户端校验用例。
- `cdc4d3d2`（2026-09-19）把测试步骤原样移入 `terminal-tests.yml`，ADR 0016 当时记下了这个失效参数，未清理。`git log -S"geo-api.test.ts" -- .github/` 为空：继任测试从未出现在任何工作流里，所以 2026-09-13 起地区 API 的处理器与客户端测试没有在 CI 中运行过。
- vitest 4.0.16 的 CLI 参数是子串过滤器（`filterFiles`：测试文件的相对路径包含参数即选中），不匹配的参数不报错。只有全部参数都不匹配时才失败：本机只传被删的路径时输出 “No test files found, exiting with code 1”，并打印默认的 `include: **/*.{test,spec}.?(c|m)[jt]s?(x)`。终端的 `vitest.config.ts` 未设置 `include`，现存的 `.test.ts(x)` 文件都会被收集。

### 修改

- 把该参数换成 `src/lib/tests/geo-api.test.ts`，按字母序位置不变，其他步骤未动。`geo-prefetch.test.ts`（`3db8ed49` 新增）同样不在 CI 中，但它不是被删测试的继任者，本次没有加入，列为后续。
- `scripts/ci-workflows.test.mjs` 原先只钉住部分品牌与法律测试出现在 `terminal-tests.yml`，不检查文件是否存在。新增 “never lists a test path that matches no file”：按缩进逐行拆出每个工作流的列表项，读取步骤的 `working-directory` 与 `run`（折叠 `>-`、字面 `|` 含反斜杠续行、单行三种写法），找出 `vitest run`、`playwright test`、`node --test` 调用，用同一条命令里的 `pnpm --dir` / `-C` 修正目录，把调用之后不以 `-` 开头的参数（包括 `--config` 的值）当作路径。文件名中的 `*` 按 shell 方式展开，必须至少匹配一个文件；目录部分含通配符时直接失败。为防止解析遗漏让守卫空转，还要求解析出的调用数等于工作流非注释行里出现的调用次数。
- 未采用：YAML 解析库（根目录没有可直接解析的依赖，不值得为一个测试新增依赖）；`fs.globSync`（CI 使用的 Node 22.15.0 中仍是实验特性，会打印警告）；在守卫里检查 `package.json` 测试脚本列出的路径（超出本次范围，本次人工核对它们全部存在）；检查 `paths:` 触发过滤（过滤项可以合法地使用 `**` 或指向尚不存在的路径）。
- 同步更新：`CHANGELOG.md` 的 Fixed，ADR 0016 “后果与边界” 追加 2026-10-02 补记，[2026-09-19 分支流向与 CI 分层](2026-09-19-ci-tiers-dev-first-flow.md)的后续追加补记。

## 验证与限制

版本：`682430ba` 加本任务的工作区改动，2026-10-02 本机（macOS）执行，没有 `apps/terminal/.env.local`。

| 检查 | 结果 |
| --- | --- |
| 改动前，按工作流原文在 `apps/terminal` 用 `bash -eo pipefail` 运行 geo 步骤 | 23 个参数，22 个文件 / 557 个用例通过，退出码 0，复现了静默少跑一个文件 |
| 改动后，同样方式运行该步骤 | 23 个文件 / 567 个用例通过（`geo-api.test.ts` 10 个），退出码 0，约 49 秒 |
| `pnpm --dir apps/terminal exec vitest run --maxWorkers=1` 运行 `geo-api`、`development-geo`、`referral-action-geo`、`use-geo-restriction` | 4 个文件 / 25 个用例通过 |
| “Test build and release validators” 的 5 个 `node --test` 文件，Node 22.15.0 与 24.15.0 | 均为 44 通过 / 0 失败 |
| 守卫逻辑的探针版本扫描全部 7 个工作流（改动前） | 21 次测试运行器调用、186 个路径（含 5 个通配符），只有 `geo-server-functions.test.ts` 不匹配 |
| 变异检查：scratchpad 镜像（复制工作流、`scripts/` 与 `package.json`，软链 `apps`），每次只注入一处改动 | 12 种错误写法全部失败并报出确切路径或原因：恢复被删的 geo 路径、通配符不匹配、Playwright 配置缺失、Playwright spec 缺失、`node --test` 文件缺失、`tests/` 下的 vitest 文件缺失、geo 步骤去掉 `working-directory`、Playwright 调用去掉 `--dir`、流式写法的步骤（调用数不符）、目录部分含通配符、字面块里的缺失路径、`--dir` 属于 `&&` 之前的另一条命令；对照组和 2 种合法写法（字面块加续行、`&&` 之后的调用）通过 |
| Biome（复制到 `apps/terminal/src` 下的临时文件后检查，`scripts/` 不在 Biome 范围内） | 新增代码无格式差异；lint 告警与改动前相同（5 条，都在原有代码） |
| Ruby `YAML.load_file` 解析 7 个工作流 | 通过 |
| 根 `package.json` 的 `test:brand`、`test:cloudfront` 与终端浏览器脚本列出的路径 | 全部存在（人工核对） |

第一次注入 “`node --test` 文件缺失” 时替换命中了 `paths:` 触发过滤里同名的第一处，守卫按设计不检查过滤项，测试通过；改为只替换 `run` 参数那一处后失败。这说明变异必须核对命中位置。

限制：

- 未推送，GitHub 上未运行；`actionlint` 未安装。
- 守卫是逐行解析，只认识本仓库工作流实际使用的写法。`defaults.run.working-directory`、`cd` 或 `pnpm --filter` 改变目录时会按错误目录解析并失败；用空格分隔、又不是路径的选项值（如 `--project chromium`）会被当作路径而失败，需写成 `--project=chromium`。这些都是失败方向。
- 守卫只检查路径匹配到文件，不检查文件会不会被 vitest 的 `include` 收集；目前终端使用默认 `include`。
- 手选清单仍会漏掉新测试，这一点没有改变。

## 后续与替代关系

- 本记录不替代任何记录；它完成了 [2026-09-19 记录](2026-09-19-ci-tiers-dev-first-flow.md)后续里关于失效 `geo-server-functions` 参数的一项（换成继任测试，不是删除）。
- `geo-prefetch.test.ts` 不在 CI 清单中，是否加入由维护者决定；ADR 0016 中用全量单测取代手选清单的计划不变。
- 推送后在 PR 上核对 `Terminal Tests` 的 geo 步骤报告 23 个测试文件、“Test build and release validators” 通过。
