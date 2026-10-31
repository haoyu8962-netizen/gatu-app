<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-31-promotion-ci-coverage",
  "date": "2026-10-31",
  "title": "晋升 PR 按覆盖跳过 dev 已测过的检查（ADR 0016 D8）",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "docs-governance"],
  "summary": "dev→main 的晋升 PR 每次 66–75 计费分钟，对同一棵树重跑 dev 已通过的检查。运营方在两种方案中选了乙：Terminal Tests、浏览器回归、Production Builds 与 Website and Brand 各加一个只在晋升 PR 上运行的 Promotion coverage 作业，scripts/promotion-coverage.mjs 逐个工作流核对三点：合并树等于 dev 的树；上次晋升以来最后一个改过该工作流输入的 PR，其最后一次运行成功（改过输入指差异匹配该工作流的 paths 过滤，或该工作流为它运行过）；该运行的检出日志写明的合并基点在 dev 主线上，且之后没有别的合入改过这些输入。三点都满足才跳过（Production Builds 只构建 pairing true），否则全跑；Static Checks 照常运行。两轮推送前 Codex 审查共指出 2 项 P0，都已修复：初版把没有运行记录当作没改输入，现在改为按 paths 过滤核对差异；`**` 漏掉含换行的文件名。回放 10 月 11 次晋升，10 次全部覆盖。68 项单测通过，51 处变异全部失败。未推送，未在 GitHub 上运行。",
  "thread": null,
  "baseCommit": "90658436",
  "commits": ["18cee104", "285d7c8d"],
  "sources": [
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": ".github/workflows/slider-browser.yml" },
    { "path": ".github/workflows/production-build.yml" },
    { "path": ".github/workflows/website-build.yml" },
    { "path": ".github/workflows/static-checks.yml" },
    { "path": "scripts/promotion-coverage.mjs" },
    { "path": "scripts/promotion-coverage.test.mjs" },
    { "path": "scripts/ci-workflows.test.mjs" },
    { "path": "docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md" },
    { "path": ".claude/rules/git.md" },
    { "path": "docs/agent-handbook.md" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/122" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/129" }
  ],
  "supersedes": []
}
-->
# 晋升 PR 按覆盖跳过 dev 已测过的检查（ADR 0016 D8）

## 背景与范围

同步记录，2026-10-31，未取得可核对的任务标识。Claude Code 桌面会话，由「项目功能测试与审查」会话派出。工作树 `lucid-boyd-efe166`，分支 `claude/lucid-boyd-efe166`。开始时分支停在 `main` 的 `cdb47637`，没有自己的提交；按派出会话的提醒，用 `git reset --keep` 对齐到 `origin/dev` 的 `90658436`（已含 #123–#129）。基线上 `scripts/ci-workflows.test.mjs` 17 项通过。

派出会话给的问题：所有工作流只由 `pull_request`、发布标签、`workflow_dispatch` 或定时触发，合并进 `dev` 或 `main` 本身不跑 CI，但 `dev → main` 的晋升 PR 会把进 `dev` 时已经跑过的检查对同一棵树再跑一遍。要求：晋升 PR 只保留新增覆盖（配对开启的生产构建）和便宜的静态检查；在组合没被完整测过的两种情况下仍要全跑。两种情况指：`dev` 先后合入了几个各自只对较旧 `dev` 测过的 PR；`main` 有 `dev` 没有的提交（紧急修复路径）。

本会话先比较了两种做法，交运营方选择。甲：晋升 PR 一律跳过，发布前人工核对，不满足时手动补跑。乙：判定作业用 GitHub API 自动核对。运营方在本会话中回复「选乙」，之后才改文件。推送与开 PR 不在本次范围内，需另行征得同意。

## 结论与依据

### 取证（只读，2026-10-31）

- 来源：`gh api .../actions/runs?event=pull_request&created>=2026-09-28`（448 次运行）、各运行的作业列表与检出日志、`gh pr list --base dev/main --state merged`，以及 `git log --first-parent origin/dev`。
- 最近 6 次晋升按作业向上取整为 66–75 计费分钟。保留的 `Build terminal (pairing true)` 约 7–8 分钟，静态检查约 3 分钟。最慢的是浏览器分片 1/2，12–18 分钟。
- 10 月 11 次晋升（#67–#122）共 85 次工作流运行：81 次成功；4 次失败全是 `Build terminal (pairing true)`（#82、#96 两次、#112），同一次运行的配对关闭构建都成功。
- 12 个进 `main` 的 PR 全部来自 `dev`；`git rev-list --no-merges origin/dev..origin/main` 为空；`dev` 主线上全是 GitHub 生成的 `Merge pull request` 提交。最近 60 个进 `dev` 的 PR，timeline 里都没有 `base_ref_changed`。
- 合入时 `dev` 已经变动、检查测的是旧 `dev` 的有四个：#70（在 #69 之后 30 秒合入）、#73（检查跑在前一天）、#94（其间只合入了纯文档的 #95）、#102（在 #101 之后 47 秒合入）。
  - 如果要求上次晋升以来每个合入都测过它产生的树，11 次里只有 7 次满足。
  - 如果逐个工作流判断，10 次可以全部跳过；#87 只有浏览器回归与网站构建要全跑。
- 原拟的人工判据「`dev` 最后一个合入 PR 的检查晚于 `dev` 前一次变动」在 #87 会误判：最后合入的 #79 检查是新鲜的，但只触发了 2 个工作流。
- 检出日志里有一行写明运行测的是哪个合并，例如 #129 的 Static Checks 作业：`HEAD is now at 868a6c1 Merge 44d95ef9… into d99c2bc9…`。#102 的日志写的基点是 `2eeec75d`，正是按时间推出的当时 `dev` 头。
- 完整取证表在派出会话的共享笔记里（仓库外）。本记录只保留结论。

### 采用的方案（乙）

- `Terminal Tests`、浏览器回归、`Production Builds` 与 `Website and Brand` 各加一个 `coverage` 作业（名为 `Promotion coverage`）。它只在 `pull_request`、目标 `main`、来源 `dev` 时运行，令牌只有 `actions: read` 与 `contents: read`。检出用无 blob 克隆加全部历史（`fetch-depth: 0`、`filter: blob:none`），只稀疏检出 `scripts` 与 `.github/workflows`；然后运行 `node scripts/promotion-coverage.mjs <本工作流文件>`。重作业 `needs: coverage`，条件为 `${{ !cancelled() && needs.coverage.outputs.covered != 'true' }}`。`Production Builds` 的作业照常运行，矩阵在 `covered == 'true'` 时只有 `pairing true`。`Static Checks` 不改，晋升时照常运行。
- 判定按工作流分别做，三条全满足才输出 `covered=true`：
  1. 合并提交的树等于 `dev` 头的树；
  2. 在 `dev` 主线上最新一个被 `main` 包含的提交之后，最后一个改过本工作流输入的 PR 合并，其最新一次运行成功。「改过输入」指这次合入在 `dev` 主线上的差异（`git diff --name-only --no-renames <第一父> <合并>`）匹配本工作流自己的 `paths` 过滤，或者本工作流为这个 PR 运行过；改过输入却没有运行记录，判为全跑；
  3. 该运行任一成功作业的检出日志在独立一行写着 `<时间> HEAD is now at … Merge <PR 头> into <基点>`，且整份日志只出现这一个合并，PR 头与合并提交的第二父提交一致，基点在 `dev` 主线上；基点之后 `dev` 的每次变动都是 GitHub 的 PR 合并，且除这个 PR 外，没有一个改过本工作流的输入。

  `paths` 过滤由脚本自己读取并匹配：只认现有写法（`pull_request` 下唯一的 `paths:` 与带引号的列表项，允许注释），按 GitHub 的规则处理 `*`、`**`、可以匹配零层目录的 `**/` 和开头的 `!`，并且由最后一个匹配的模式决定。遇到 `?`、`+`、`[]` 或其他写法就报错，判为全跑。

  任何一条不满足、查询失败或出错，都输出 `covered=false`，带警告注解，以 0 退出，下游照常全跑。
- 上次晋升点不用 `git merge-base`：#81、#115 的分支从 `main` 开出，把 `main` 的晋升合并提交 `6da4c15a`、`9ccb88c0` 带进了 `dev`，`merge-base` 于是落在这两个提交上，不在 `dev` 主线。第一遍回放因此把 #82、#116 误判为全跑。改用 `git rev-list --first-parent --count <dev> ^<main>` 数出未晋升的主线提交，取下一个。临时仓库测试复现了这种情形。
- 本机经代理读取时出过两次偶发问题。第二遍回放的 44 次判定中，有一次日志里没取到那一行，事后连读 4 次都正常；第三遍中有一次请求直接失败（`fetch failed`），脚本照设计给出警告并判为全跑。所以日志里没找到那一行时再读一次，连接中断时再试一次；两次都不行，才判为看不出或全跑。
- 未采用的做法与原因写在 ADR 0016「未采用的方案」：方案甲、`branches-ignore: [main]`、把没有运行记录当作没改输入、只比时间、`merge-base`、整次晋升统一判断。`.claude/rules/git.md` 写明不要用分支过滤来跳过晋升检查。
- 信任边界：判定把每个工作流的 `paths` 过滤当作它的完整输入清单，与进 `dev` 的 PR 相同。过滤没列出、却影响检查结果的文件（例如某个根目录配置）在覆盖运行开始之后合入时，晋升不再补测；改动前，只要晋升触发了该工作流，就会连同它一起重测。ADR 0016 补记写明了这一点。

### 推送前审查（Codex CLI gpt-6-astra，只读，low）

审查对象是第一个提交 `18cee104`：评分 4/10，1 项 P0、2 项 P2、1 项 P3，逐条核实后全部成立，修复进第二个提交。

- P0：初版把「这个 PR 没有该工作流的运行记录」当作「没改它的输入」。工作流被停用、运行记录被删，或差异超过 GitHub 路径过滤的文件数上限时，改了输入的合入也没有记录，晋升就会误跳过；改动前，这些情形会由晋升时的重跑补上。Codex 用内存构造的历史调用 `decideCoverage`，得到 `covered: true`。修复：改为用工作流自己的 `paths` 过滤核对每次合入的完整差异，与「运行过」取并集；改过输入却没有运行记录，判为全跑。判定作业的检出因此从无树克隆改为无 blob 克隆（本机实测约 4 MB，禁止按需拉取时 `git diff --name-only` 照常可用），稀疏检出加上 `.github/workflows`。
- P2：`ci-workflows.test.mjs` 的 `jobRuns` 把字符串里的 `cancelled()` 当成调用。改成写 `${{ needs.coverage.outputs.covered != 'true' && 'cancelled()' != '' }}`，19 项结构测试照样全部通过；实际上在 GitHub 上，这会让进 `dev` 的 PR 跟着跳过下游作业。修复：先去掉字符串字面量再找状态函数，并把「运行被取消」作为求值输入，事件里加上两种被取消的运行。
- P2：文档不准确。ADR 证据段沿用旧句「测试工作流不含矩阵」，补了更正；约 14 计费分钟改写为「预计」，因为判定作业的计费未实测；路径过滤上限在补记里写成 300，按 2026-10-31 查阅的官方文档改为 3,000（文档还写明生成差异超时则总会触发）。
- P3：成功摘要对 `Production Builds` 写的是「its jobs are skipped」，实际仍构建 pairing true。改为「the jobs that dev already ran are skipped」。
- 另两条建议：
  - 检出日志的匹配原本不限定所在行，现在要求独立成行，且整份日志只出现一个合并；出现两个不同的合并，就判为看不出。
  - `newestRun` 按创建时间挑选。重跑沿用同一个运行和同一个合并，所以只改了注释与 ADR 的措辞。
- 审查自己的验证：43 项中 41 项通过，2 项因只读沙盒拒绝 `mkdtemp` 而失败，与代码无关。

第二轮只审修复提交 `285d7c8d` 的差异：评分 5/10，前一轮四项都确认修好；新报 1 项 P0，核实成立，修复进第三个提交。

- P0：`**` 被转成 `.*`，而 JavaScript 的 `.` 不匹配换行，可 Git 文件名允许包含换行。含换行的文件名因此匹配不上过滤，如果再碰上没有运行记录，就会误跳过。Codex 用 production-build 的真实过滤，加上内存构造的历史，得到了 `covered: true`。修复：编译时加 `s` 标志，并补上换行、回车与 U+2028 的匹配测试，以及判定层面的回归测试。Codex 另说只加 `s` 还要处理 `$` 在末尾换行前也能匹配的问题：这在 JavaScript 里不成立，不带 `m` 标志时 `$` 只匹配输入末尾，测试里也钉住了。
- 措辞：文档原写「有且只有一行」，Codex 指出同一行重复出现会被去重，所以改为「独立成行，整份日志只出现这一个合并」。
- 审查自己的验证：49 项中 46 项通过，3 项是沙盒里的 `mkdtemp`。

### 同步改动的文档

ADR 0016 新增 D8，同时补了状态行、未采用方案、2026-10-31 补记和证据（原文保留）；`docs/adr/README.md` 索引行；`.claude/rules/git.md` 的 CI 分层；手册第 3 节「CI 成本」与第 8 节新增「晋升 PR 的检查」；`CHANGELOG.md` 的 Unreleased / Changed。

## 验证与限制

本机，工作树基于 `90658436` 加本任务的改动，2026-10-31：

- `node --test scripts/promotion-coverage.test.mjs scripts/ci-workflows.test.mjs scripts/check-client-bundle-budget.test.mjs`：68 项全部通过（Node 24.15.0）。
- 变异：对工作流、判定逻辑与 GitHub 接口代码共做 51 处变异，每次只改一处，51 处都让对应测试失败。变异脚本起初用字符串做替换，替换串里的 `` $` `` 被 `String.replace` 当作特殊记号，有一处变异因此把文件改出了语法错误，被误算为抓到。改为用函数替换，并把「测试文件无法加载」单独标为无效，之后重跑全部 51 处，没有无效项。改完的文件随即恢复，前后 `git diff` 的哈希一致。
  - 工作流变异：去掉 `needs`；忽略判定结果；去掉 `!cancelled()`（测试按 GitHub 的规则，对不调用状态函数的 `if` 隐式加 `success()`）；只在字符串里写 `cancelled()`；取消的运行里仍构建；判定作业扩大到任意进 `main` 的 PR；矩阵在覆盖时仍建两组；加 `branches-ignore`；给判定作业写权限；判定别的工作流；单测不进 CI；输出接线断开；检出变浅；`Static Checks` 加依赖；用 `always()`；多一个不受判定约束的作业。
  - 判定逻辑变异：改过输入却没有运行时跳过不判；只按运行记录或只按路径过滤认定改过输入；`**/` 必须有一层目录；`*` 跨过 `/`；忽略排除模式；容忍未知的触发器写法；接受两个不同的检出合并；日志匹配不限定行；只按新路径列出重命名。
- 用 `node_modules/.pnpm` 里的 `yaml@2.9.1` 严格解析全部 8 个工作流：0 个错误或警告，作业依赖、条件与折叠后的矩阵表达式都符合预期。`actionlint` 本机没有安装，未运行。
- 真实接口（只读令牌，本机经代理）：
  - `origin/main` ← `origin/dev`（`90658436`）：四个工作流都判为由 #129 覆盖，例如 run 41189444108 测的是合并到 `d99c2bc9`，之后 `dev` 没有变动。
  - 回放 10 月 11 次晋升，每次用当时的 `main` 与 `dev` 头运行本地模式，只判晋升 PR 上实际跑过的工作流：
    - 10 次所有工作流都判为已覆盖。例如 #82 的浏览器回归由 #81 覆盖，网站构建由 #77 覆盖，之后的合入都没跑过这两个工作流；#96 的网站构建由 #92 覆盖。
    - #87 的单测与构建由 #79 覆盖；浏览器回归与网站构建判为全跑：#73 的运行测的是合并到前一天的 `dev`，之后合入的 #80 也跑过这两个工作流。
    - 这与取证时按时间做的人工分析一致。
  - 回放共做了五遍：
    - 第一遍用 `merge-base` 取上次晋升点，暴露了 #82 与 #116 的误判，随后改正。
    - 第二、三遍各有一次本机网络偶发（见上文），都落在全跑一侧，不会误跳过。
    - 第四遍用审查前的代码：47 次判定（11 次晋升共 43 次，加上下次晋升的 4 次）中 45 次判为已覆盖，只有 #87 的两项判为全跑，没有警告。
    - 第五遍用审查后的最终代码（按 `paths` 过滤认定改过输入）：结论与第四遍逐条一致，45 次覆盖、2 次全跑、0 个警告。
- 模拟 CI 环境，两种克隆各做一次，都用 `commit-tree` 造出与 GitHub 相同形态的合并提交、稀疏检出后以 CI 模式运行，并设 `GIT_NO_LAZY_FETCH=1` 禁止按需拉取：
  - 第一版：无树克隆（`filter tree:0`，2254 个提交、0 个树）。判定正常，`GITHUB_OUTPUT` 得到 `covered=true`；事件里的 PR 头对不上时，输出警告并判为全跑，以 0 退出。
  - 修复后：无 blob 克隆（26969 个对象、3.96 MiB），稀疏检出 `scripts` 与 `.github/workflows`。`terminal-tests.yml` 与 `website-build.yml` 都由 #129 覆盖，判定正常。
- `pnpm install --frozen-lockfile --prefer-offline` 装上了依赖，但其中 `prepare` 的 `lefthook install` 在沙盒里没能改写共享的 `.git/hooks`；钩子原本已装好，本工作树有 `lefthook` 可执行文件。
- 未做：
  - 推送与开 PR。
  - 在 GitHub 上运行：判定作业的权限、无 blob 克隆与稀疏检出、日志重定向、`needs` 与 skipped 的实际表现、矩阵取值、每个判定作业的计费分钟，都要等本改动进 `dev` 之后的第一次晋升才能观察。
  - 运行器自带的 Node 版本没有核对，脚本只用内置模块。
  - 全量终端单测与浏览器回归（本次没有改终端代码）。

## 后续与替代关系

- 本改动进 `dev` 后，下一次晋升 PR 要核对：四个 `Promotion coverage` 的摘要；被跳过作业的显示；`Production Builds` 是否只建 `pairing true`；判定作业的实际耗时与计费；`the check failed` 警告是否出现。结果写进那次的发布记录，并在 ADR 0016 补记。
- 如果按 D5 给 `main` 设必选检查，skipped 会被算作通过，到时要把判定结论纳入考虑。
- 依赖的外部格式：检出日志的 `HEAD is now at … Merge <头> into <基>`、GitHub 合并提交的提交者与标题、日志保留期。任何一项变化都会让判定落到全跑；如果晋升总是全跑，先查这几项。
- 不替代任何记录。相关记录：[分支流向与首版分层](2026-09-19-ci-tiers-dev-first-flow.md)、[按四条方案的改造](2026-09-19-ci-restructure.md)。
