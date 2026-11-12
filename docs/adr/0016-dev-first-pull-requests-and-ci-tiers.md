# ADR 0016：工作分支先进 `dev`，CI 按目标分支分层

- 状态：D1、D3、D4 已接受并实施（产品负责人，2026-09-19）；D2 在同日、推送之前由产品负责人改为 D2′，并新增 D6、D7；D5 已规划，未执行。实施与验证记录见[分支流向与首版分层](../work-memory/sessions/2026-09-19-ci-tiers-dev-first-flow.md)和[按四条方案的改造](../work-memory/sessions/2026-09-19-ci-restructure.md)。D8 由运营方于 2026-10-31 在两种方案中选定并实施，记录见[晋升 PR 按覆盖跳过重跑](../work-memory/sessions/2026-10-31-promotion-ci-coverage.md)。
- 关联：`.claude/rules/git.md`（分支与 PR 规则）、`AGENTS.md` 末段、`.github/workflows/`、[CI 分钟耗尽记录](../work-memory/sessions/2026-09-15-ci-minutes-concurrency.md)。

## 背景与约束

- 仓库是个人账户下的私有仓库，实际只有一位维护者合并，同时有多个 AI 会话在各自的 worktree 里并行改动。各自验证通过、合在一起才出问题（体积预算、翻译目录、锁文件、布局契约）是真实风险，需要一个汇合点。
- GitHub Actions 额度为每月 3,000 分钟。`main` 近 60 天的主线只有合并提交，没有直接提交；`main` 与 `dev` 均无保护规则，`gh pr create` 默认以 `main` 为目标。
- 发布是本地构建后手动上传，仓库没有部署工作流，进 `main` 不等于上线；真机验收属于发布闸门。
- 实测（PR #30，head `0af67e47`，2026-09-19）：`Production Builds` 的 4 路配对矩阵每路 10.8–12.5 分钟，其中 10 个测试步骤占 3.4–4.3 分钟、构建占约 6.2 分钟；矩阵变量只被构建步骤读取，所以 4 路跑的是同一批测试。浏览器回归 12.5 分钟，类型检查 2.4 分钟，翻译检查 1.5 分钟，网站构建 1.8 分钟。按任务向上取整约 68 计费分钟/次推送（不含 Claude 审查任务，未测），每次推送实际等待约 12.5 分钟。
- CI 列出的 76 个 vitest 参数展开为 88 个存在的测试文件，终端全量为 576 个文件。全量在 12 核本机并行运行 386 秒，5 个文件共 45 个用例失败；其中 4 个文件单独运行全部通过，`establish-connection-modal` 的 1 个用例单独运行仍然超时。

## 决策

- **D1 分支流向。** 工作分支只向 `dev` 开 PR；`main` 只接受来自 `dev` 的 PR，用 merge commit 合并（任务记录与 ADR 会引用分支上的提交哈希，squash 会让它们失效）。紧急修复从 `main` 切分支、向 `main` 开 PR，合并后立即把 `main` 合回 `dev`。规则写入 `.claude/rules/git.md`，`AGENTS.md` 保留一句指针。
- **D2（已被 D2′ 取代）重型工作流只对进 `main` 的 PR 触发。** 首版给 `production-build.yml` 与 `slider-browser.yml` 加了 `branches: [main]`。该版本只存在于本地提交 `cdc4d3d2`，没有推送或运行过。
- **D2′ 每个 PR 构建生产默认组合，其余三组只在晋升时构建。** `production-build.yml` 去掉 `branches: [main]`，矩阵改为按事件取值的表达式：`pull_request` 且目标分支不是 `main` 时只构建 `false/false`（两个配对开关都关闭，即生产默认）；进 `main` 的 PR（D1 下即 `dev → main` 的晋升）、`v[0-9]*` 或 `cloudfront-[0-9]*` 标签、`workflow_dispatch` 构建全部 4 组。job 级 `if` 读不到 `matrix`；拆成独立的发版工作流要么复制约 70 行构建与校验步骤，要么引入复合 action 并使现有对 `production-build.yml` 内容的断言失效，所以用单文件表达式，job 定义只有一份，检查名 `Build terminal (false/false)` 等不变。
- **D3 测试移出矩阵，只跑一次。** 10 个与矩阵无关的测试步骤原样移入新的 `terminal-tests.yml`，对所有 PR 触发。`test:brand` 里只在网站 job 中运行的 4 个终端品牌单测也并入这里（见 D7）。
- **D4 同一 PR 的新推送取消旧运行。** 六个由 `pull_request` 触发的工作流顶层加 `group: ${{ github.workflow }}-${{ github.ref }}`、`cancel-in-progress: true`；`pull_request` 事件的 `github.ref` 是 `refs/pull/N/merge`，即按 PR 分组，与 2026-09-15 提交 `d76b12f9` 里的 `pull_request.number || github.ref` 等价。`claude.yml` 不加：每条评论都会启动它（不含 @claude 的由 job 级 `if` 跳过），评论与 issue 事件的 `github.ref` 是默认分支，共用分组会让任何一条评论取消仍在运行的请求；`cancel-in-progress: false` 也只保留最新一个排队请求。原因写在该文件里。
- **D5（未执行）`main` 的保护规则。** 计划：必须经 PR、禁止 force push 与删除。必选状态检查推迟到全量单测稳定之后，否则每次晋升都会被不稳定的用例卡住。属于仓库设置变更，需维护者确认后执行。
- **D6 浏览器回归每个 PR 都跑，分两片并行。** `slider-browser.yml` 去掉 `branches: [main]`，用 `shard: [1, 2]` 的矩阵，每次 Playwright 调用带 `--fully-parallel --shard=N/2`。三份 Playwright 配置都是 `fullyParallel: false`，此时 Playwright 1.59.1 按文件分片，实测会把订单录入和账户两套测试全部分给 1/2、2/2 为 0 个测试；`--fully-parallel` 让它按测试分片（共享配置 23/23，订单录入 15/14，账户 12/12）。配置里的 `workers: 1` 不变，分片内仍逐个执行；相关 7 个 spec 只用 `{ page }` 夹具和 `beforeEach`，没有跨测试共享状态。滑杆 spec 单独作为第一步，保持“最先遇到夹具服务器冷启动的是它”的既有顺序；其余三个共享配置 spec 合成一次调用，避免只有 1 个测试的 CLS 调用产生空分片。
- **D7 合并小 job，网站工作流按输入过滤。** `typecheck.yml` 与 `i18n-check.yml` 合并为 `static-checks.yml`（类型检查、Biome、翻译目录），翻译目录两步加 `if: ${{ !cancelled() }}`，保留它原先独立于类型检查出结果的行为。`paths` 只能过滤整个工作流，所以网站 job 移到 `website-build.yml`；它运行的是 `pnpm test:brand`，路径过滤覆盖其全部非单测输入：`apps/website/**`、`designs/og-cards/**`、`scripts/generate-og-cards.mjs`、`tests/**`、终端 OG 图、`apps/terminal/src/styles.css`、`packages/ui/src/globals.css` 与锁文件。
- **D8 晋升 PR 只重跑 `dev` 没测过的部分（2026-10-31 新增，运营方在两种方案中选定）。** 晋升 PR 会对同一棵树重跑进 `dev` 时已经通过的检查。2026-10 的 11 次晋升，每次按作业取整为 66–75 计费分钟；85 次重跑里只有 4 次失败，都是 `Build terminal (pairing true)`。现在 `Terminal Tests`、浏览器回归、`Production Builds` 与 `Website and Brand` 各有一个 `Promotion coverage` 作业，只在 `pull_request`、目标为 `main`、来源为 `dev` 时运行 `scripts/promotion-coverage.mjs <本工作流文件>`，并按工作流分别判断。同时满足以下三条时，才输出 `covered=true`：
  1. 晋升 PR 的合并提交与 `dev` 头是同一棵树，即 `main` 没有 `dev` 缺的内容；
  2. 在上次晋升点（`dev` 主线上最新一个已被 `main` 包含的提交）之后，最后一个改过本工作流输入的 PR，其最新一次运行成功（重跑沿用原来的合并，看最后一次尝试的结论）。一次合入「改过输入」，指它在 `dev` 主线上的差异匹配本工作流自己的 `paths` 过滤，或者本工作流为这个 PR 运行过。没有运行记录不算没改：改过输入却没有运行记录，就全跑；
  3. 这次运行的检出日志里，格式为 `<时间> HEAD is now at … Merge <PR 头> into <dev 提交>` 的独立行，按（PR 头，基点）去重后恰好只有一种合并（同样的行重复出现也算一种；其他格式的文本不在检查范围内），这个 `dev` 提交在 `dev` 主线上；此后 `dev` 的每次变动都是 GitHub 的 PR 合并，且除这个 PR 外，没有一个改过本工作流的输入。

  判定作业用无 blob 克隆读取全部提交与树，差异由脚本从 git 算出。`covered=true` 时，三个工作流的作业被跳过，`Production Builds` 只构建发布实际使用的 `pairing true`。任何一条不满足，或查询失败、出错，都输出 `covered=false` 并照常全跑。`Static Checks` 没有判定作业，晋升时照常运行。判定作业的令牌只有 `actions: read` 与 `contents: read`。进 `dev` 的 PR、紧急修复 PR（从 `main` 开分支直接进 `main`）、发布标签与手动运行，判定作业都会跳过，下游照旧运行。本条修改 D2′ 中进 `main` 的 PR 构建两组的晋升部分，D2′ 原文保留。

## 未采用的方案

| 方案 | 未采用的原因 |
| --- | --- |
| 重型工作流只对进 `main` 的 PR 触发（原 D2） | 每次推送约 11 计费分钟，但体积预算、chunk 环与浏览器回归要到 `dev → main` 才由 CI 发现，届时批量更大、归因更难。产品负责人选择每次推送保留默认组合的构建与浏览器回归（约 33 计费分钟、等待约 8 分钟） |
| 其余三组构建拆成独立的发版工作流 | 见 D2′：复制步骤或引入复合 action，且让现有断言失效 |
| 只加 `--shard`、不加 `--fully-parallel` | 按文件分片，实测一片约 556 秒、另一片约 95 秒外加两次空调用，等待时间几乎不变 |
| 分片用 `--pass-with-no-tests` 容忍空分片 | 会掩盖路径写错导致的“零测试通过” |
| 测试 job 放进 `production-build.yml` | 标签与手动运行只为构建全矩阵，不应重跑测试；独立工作流有自己的路径过滤，且“构建工作流内没有测试步骤”可以被断言钉住 |
| 把类型检查、Biome、翻译目录并进测试 job | 产品负责人要求测试保持独立 job；合并后类型错误会挡住测试结果 |
| 新建聚合用的 `gate.yml` 顺序重跑全部检查 | 与现有工作流重复，计费分钟翻倍；它要解决的“路径过滤导致必选检查一直 pending”只在纯文档发版时出现，维护者放行即可 |
| 用必选 job 校验 PR 来源分支 | 成因是 `gh pr create` 的默认目标；一条规则即可，不值得多维护一个检查 |
| `dev` 也设必选检查 | 同一套闸门设两遍；`dev` 的作用是让工作分支尽快汇合 |
| 现在就把全量单测设为闸门 | 并行运行下尚有 45 个失败用例，需先修稳 |
| 测试留在矩阵内 | 同一批测试每次推送重复 4 遍，每次约多花 10 计费分钟，且没有额外覆盖 |
| 合并 9 次 vitest 调用或提高 `--maxWorkers` | 不在本次方案内；本机同时有其他会话在跑测试，计时不可靠，需在 CI 上实测 |
| 给 `pull_request` 加 `edited` 类型以便改目标分支后重跑 | 改标题和正文也会触发，并取消进行中的运行 |
| 把仓库默认分支改为 `dev` | 能从根上修正 PR 默认目标，但对桌面端新建 worktree 的基点、issue 自动关闭的影响未验证，留待单独评估 |
| 晋升 PR 一律跳过这几项，发布前人工核对，不满足时对 `dev` 手动补跑（D8 的方案甲） | 默认跳过：漏核或判断错时，没测过的组合会进 `main`，而 PR 页面仍是全绿。原拟判据「`dev` 最后一个合入 PR 的检查晚于 `dev` 前一次变动」在 #87 会误判：最后合入的 #79 检查是新鲜的，但只触发了 2 个工作流。改正后的判据要逐个核对上次晋升以来的 PR，靠人工做容易出错。运营方 2026-10-31 选择自动判定 |
| 用 `branches-ignore: [main]` 跳过进 `main` 的 PR | 紧急修复 PR 也会被跳过，而它从没经过 `dev` |
| 把没有运行记录的合入当作没改输入（D8 初版） | 工作流被停用、运行记录被删，或差异超过 GitHub 路径过滤的文件数上限时，改了输入的合入也没有运行记录，晋升会误跳过。2026-10-31 推送前的 Codex 审查指出了这一点，改为用工作流自己的 `paths` 过滤直接核对每次合入的差异，并与「运行过」取并集 |
| 只比时间：运行开始时间晚于 `dev` 前一次变动 | 如果 PR 先开到 `main` 再改到 `dev`，或同一提交另有一个开到 `main` 的 PR，它的运行测的是与 `main` 的合并，单看时间看不出来。检出日志写明了合并的两端，是精确依据 |
| 用 `git merge-base main dev` 作上次晋升点 | 从 `main` 开出的分支合入 `dev` 后，会把 `main` 的晋升合并提交带进 `dev`（10 月的 #81、#115），`merge-base` 于是落在 `main` 的合并提交上，不在 `dev` 主线。按这种取法回放 10 月，#82 与 #116 会被误判为要全跑 |
| 整次晋升统一判断：上次晋升以来每个合入都测过它产生的那棵树 | 10 月 11 次中只有 7 次满足；按工作流分别判断，10 次全部覆盖，#87 也只需重跑浏览器回归与网站构建 |

## 后果与边界

- 估算（由上面一次实测的步骤耗时推算，未经推送后的真实运行验证）：进 `dev` 的 PR 每次推送约 33 计费分钟（原约 68）——测试 6、单组构建 8、静态检查 3、浏览器两片各 8，网站工作流通常不触发——等待约 8 分钟（原约 12.5）；进 `main` 的 PR 另加三组构建约 24 分钟。
- 其余三种配对组合的构建、体积预算与懒加载图要到 `dev → main` 才由 CI 验证；配对开关打开时才出现的体积超限会晚一步暴露。缓解：改动涉及配对代码或其体积时，在该分支用 `workflow_dispatch` 手动运行 `Production Builds`，它构建全部 4 组。
- 标签模式为 `v[0-9]*` 与 `cloudfront-[0-9]*`（产品负责人确认，2026-09-19），例如 `v0.1.0`、`cloudfront-2026-09-17-p21`。仓库现有标签只有 `archive/2026-09-10/*`；`tags` 与 `tags-ignore` 不能同时使用，所以不靠排除，而是要求前缀后紧跟数字，`archive/**` 或其他只是以 `v` 开头的标签都不会触发 4 次生产构建。`scripts/ci-workflows.test.mjs` 用样例标签钉住这一点。
- 2026-09-24 更正：配对开关合并为一个 `VITE_MOBILE_PAIRING_ENABLED`（ADR 0015 D8），`Production Builds` 在 `dev → main`、发布标签与手动运行时只构建开 / 关两组；上文的「三种组合」「4 组」按此理解。
- 测试与构建并行、不设 `needs`：等待时间取两者较大值，代价是测试失败时构建不再被跳过。
- `production-build.yml` 的路径过滤仍包含已移走测试的脚本路径；这是无害的超集，且被既有断言钉住。随网站 job 移走的三项（`designs/og-cards/**`、`tests/**`、`scripts/generate-og-cards.mjs`）已从中删除。
- CI 的手选测试清单里 `src/lib/tests/geo-server-functions.test.ts` 已不存在（`5944465d` 删除），vitest 会静默忽略不匹配的参数。本次按原样搬移，未清理；全量单测成为闸门后这份清单应整体移除。
- 2026-10-02 补记：上一条的失效参数已换成 `5944465d` 中取代它的 `src/lib/tests/geo-api.test.ts`（地区 API 处理器与客户端测试，此前从未进入任何工作流）。`scripts/ci-workflows.test.mjs` 新增钉子：工作流传给 vitest、Playwright 与 `node --test` 的每个路径都必须匹配到文件，文件名里的 `*` 按 shell 方式展开。手选清单由全量单测取代的计划不变。见[任务记录](../work-memory/sessions/2026-10-02-ci-listed-test-paths.md)。
- 本地实跑两个分片时，99 个测试中有 1 个失败过一次（`drawer-interactions` 的 bottom drawer swipe，当轮分片 1 的第一个测试）；之后原始调用方式、分片方式和清空 Vite 缓存后的冷启动各重跑 2 次均全部通过，未能复现或归因。首次 CI 运行后需观察它。
- 2026-10-12 补记：`Terminal Tests` 拆成两个分片（`shard: [1, 2]`）。它跑的是手选的十四组 Vitest 文件，此前在一个 job 里以 `--maxWorkers=1` 串行，约 15.5 分钟，是每轮 CI 的最长项。每个 Vitest 步骤加 `--shard=${{ matrix.shard }}/2 --passWithNoTests`（Vitest 按文件分片；某一步的文件全落在另一片时本片选不到文件，所以需要 `--passWithNoTests`，路径是否存在仍由「never lists a test path that matches no file」静态检查），每片仍是单 worker；三个非 Vitest 步骤（发布校验器的 `node --test`、`pnpm test:cloudfront`、`pnpm brand:check`）只在第一片跑。不改测试清单，计费分钟数基本不变（多一次检出与安装），等待时间取决于较慢的一片。同时浏览器回归的路径过滤排除 `apps/terminal/src/**/*.test.ts(x)`：只改单测的 PR 不再启动它；`src/lib/tests/harness`（浏览器夹具引用）与翻译目录（夹具断言中文文案）不在排除范围。`ci-workflows.test.mjs` 新增两条断言钉住这两点（未分片的 Vitest 步骤、被限定到单片的 Vitest 步骤、多余的排除项都会失败）。不采用的做法：按标签跳过浏览器回归（靠人判断，`order-submission-wiring` 这类契约正是「看起来很小」的改动触发的）与 `[skip ci]`。
- 2026-10-26 补记（[官网规划](../website-plan.md)第 8、10 节阶段 1）：`website-build.yml` 在构建步骤之后加跑 `pnpm --filter @sairn/website test:dist`（读 `apps/website/dist` 的测试；只读源码的 `test` 仍经 `pnpm test:brand` 在构建前跑）。新增 `website-markets-check.yml`：每天一次定时加手动触发，不在 PR 上运行，权限只读，10 分钟超时，动作提交与 Node 版本同 `website-build.yml`，只跑 `markets:snapshot --check`，比对已提交的行情快照与 Hyperliquid 公开 API，从不写快照。定时工作流只在默认分支运行，因此它检查的是 `main` 上的快照。`ci-workflows.test.mjs` 新增两条断言钉住这两点。
- 2026-10-26 补记（官网平台升级）：`apps/website` 升到 Astro 7.4.2（Vite 8），其 npm `engines` 要求 Node ≥22.23.4，官网 `package.json` 同步写 `"engines": {"node": ">=22.23.4"}`。`website-build.yml` 与 `website-markets-check.yml` 的 `node-version` 由 `22.15.0` 改为 `22.23.4`（2026-10-20 发布的 22.x LTS，恰为最低要求）；其余工作流与根 `package.json` 的 `>=22.15.0` 不变，终端不受影响。在 Node 22.15 上全仓 `pnpm install --frozen-lockfile` 只对 `apps/website` 打印 `Unsupported engine` 警告，不失败（仓库没有 `engine-strict`）。`scripts/ci-workflows.test.mjs` 新增断言：两份官网工作流的版本必须满足官网 `engines`，且同为 22 大版本。
- 2026-10-31 补记（D8，[任务记录](../work-memory/sessions/2026-10-31-promotion-ci-coverage.md)）：判定覆盖时，晋升 PR 只跑配对开启构建（约 7–8 分钟）、静态检查（约 3 分钟）和四个判定作业（每个按 1 计费分钟估算，未在 GitHub 上实测），预计合计约 14–15 计费分钟，原来是 66–75；等待时间从约 17 分钟（最慢的浏览器分片）降到约 8 分钟。用同一脚本回放 10 月 11 次晋升：10 次四个工作流全部覆盖；#87 只有浏览器回归与网站构建要全跑，因为 #73 的检查跑在前一天的 `dev` 上，之后 #78、#80 又改了它们的输入。边界如下：
  - 被跳过的作业在 PR 上显示为 skipped。将来按 D5 给 `main` 设必选检查时，GitHub 会把 skipped 算作通过，到时要一并考虑。
  - 判定依赖三个外部格式：检出日志（保留期内可读，默认 90 天）、`actions/checkout` 在独立一行打印的 `HEAD is now at … Merge <头> into <基>`，以及 GitHub 合并提交的提交者 `noreply@github.com` 与标题 `Merge pull request #N from …`。其中任何一项变化，都只会让判定落到全跑，不会误跳过。脚本只读取本工作流 `pull_request` 下 `paths` 列表的现有写法，遇到其他写法会报错并全跑；过滤里的 `?`、`+`、`[]` 同样不认。
  - 判定把每个工作流的 `paths` 过滤当作它的完整输入清单，与进 `dev` 的 PR 依赖路径过滤的方式相同。差异由脚本从 git 算出，不受 GitHub 路径过滤文件数上限的影响（2026-10-31 查阅官方文档，现行上限是 3,000 个文件）。过滤没有列出、却会影响检查结果的文件（例如某个根目录配置），如果在覆盖运行开始之后才合入，晋升不再补测；改动前，只要晋升触发了该工作流，就会连同它一起重测。
  - 判定作业只在晋升 PR 上运行。权限、无 blob 克隆、日志重定向、跳过与矩阵取值，要等本改动进 `dev` 之后的第一次晋升才能观察；本地验证见任务记录。
- 2026-11-02 补记（D8 合入 `dev`，[任务记录](../work-memory/sessions/2026-10-31-promotion-ci-coverage.md)）：PR #130 于 2026-11-01T17:20Z 以 merge commit 合入 `dev`（`e9d20e48`）。合入前它在 GitHub 上跑了两轮：头 `f2e900ed`（合在 `90658436` 上），以及合并 `dev` 之后的 `15cc87d3`（合在 `26c06d02` 上）。两轮的 7 个作业都通过；四个判定作业显示为 skipped，没有分到运行器；下游作业照常运行，说明判定作业被跳过时 `!cancelled()` 按设计放行；`Production Builds` 只构建 `pairing false`。这只验证了进 `dev` 的 PR 一侧。
  - 判定作业还没在晋升 PR 上运行过。#133（p36 晋升）的头是 `26c06d02`，在 #130 合入前约 4 分钟合入 `main`，仍按旧工作流全跑。用本地模式对 `main` 的 `047b4bb3` 与 `dev` 的 `1262bf5d` 预判下一次晋升：四个工作流都由 #130 第二轮的运行覆盖；之后合入的 #135 只改文档，不算改过任何工作流的输入。
  - 判定只认 GitHub 生成的 PR 合并提交：两个父提交，提交者 `noreply@github.com`，标题 `Merge pull request #N from …`。所以进 `dev` 的 PR 也要用 merge commit 合并。用 squash 或 rebase 合并，或者直接推送 `dev`，都会让覆盖运行早于该提交的工作流在下一次晋升全跑。D1 原文只写了进 `main` 的 PR；它的理由（任务记录引用分支上的提交哈希）对进 `dev` 的 PR 同样成立，`.claude/rules/git.md` 已补上这一条。
  - 五个工作流都触发的一次进 `dev` 推送，按作业向上取整约 64–68 计费分钟（上面两轮实测）。「后果与边界」第一条估算的约 33 计费分钟已经过时：单测已拆成两片（2026-10-12 补记），单测与浏览器套件也都变长了。`actions/runs/{id}/timing` 的 `billable` 返回 0，拿不到官方计费数。
  - 本机读接口时出现过读响应体中途断线（`terminated`）。脚本只在请求本身失败时重试一次，读响应体失败不会重试，该工作流会带警告全跑：少省一次分钟，不会误跳过。
- 2026-11-02 补记（D8 第一次晋升，[p37 发布记录](../work-memory/sessions/2026-11-02-cloudfront-release-p37.md)）：PR #139（`dev` `ce18a5a5` → `main`）是判定作业第一次在晋升 PR 上运行。上文要等第一次晋升才能观察的几项，结果如下：
  - 四个判定作业都分到了运行器，各 7–11 秒成功。它们检出 GitHub 的合并提交（`Merge ce18a5a5… into 047b4bb3…`），读到了 #134、#130 的运行与检出日志，所以权限、无 blob 克隆和读日志都正常。判定与本机预演逐字相同，没有出现 `the check failed` 警告。
  - 四个工作流都判为覆盖：`Terminal Tests` 与 `Production Builds` 由 #134 的运行覆盖，浏览器回归与 `Website and Brand` 由 #130 的运行覆盖（#134 没有改动这两个工作流的输入）。
  - 被跳过的下游作业各显示为一条 skipped，名称里的矩阵变量不展开，例如 `Test terminal and release tooling (${{ matrix.shard }}/2)`。`Production Builds` 只运行 `pairing true`（8 分 25 秒）；`Static Checks` 照常全跑（2 分 37 秒）。
  - 按作业向上取整约 16 计费分钟，接近 2026-10-31 补记估算的 14–15；从开 PR 到最后一项检查结束约 9 分钟。
  - 同日第二次晋升 #141 只带一个改预算脚本的 PR（#140）。PR 的差异只有两个文件，所以只有 `Terminal Tests` 与 `Production Builds` 触发，两者都由 #140 的运行覆盖；`Static Checks`、浏览器回归与 `Website and Brand` 的 `paths` 不含这两个文件，没有触发。本机预演对后两个工作流判为「not covered」，原因是上次晋升以来没有 PR 改动过它们的输入。这次晋升用不到这个判定：没有新输入的工作流，不在晋升 PR 的差异里，所以不会触发。
- 2026-11-12 补记（[ADR 0051](0051-release-script-rollback-and-lambda-probe.md)）：`Production Builds` 的 `terminal` 作业在安装依赖之后、客户端构建之前加一步「Build the Lambda bundles and check each entry stands alone」：`pnpm --filter @sairn/terminal build:lambda`、`node deploy/cloudfront/deploy.mjs check-lambda`（入口没有相对导入，发布只把入口文件打进 zip）与两个入口的 `node --check`。此前没有任何工作流构建 Lambda 包。本机实测 `build:lambda` 约 9 秒，每个矩阵条目都跑（不加 `if`，晋升时只构建配对开启的那一条也照样检查），计费分钟基本不变。放在客户端构建之前，失败时省下约 8 分钟。触发条件不变：`apps/**` 与 `deploy/**` 已在路径过滤里。`ci-workflows.test.mjs` 新增一条断言钉住这一步的命令、顺序与不设条件（四个变异都会让它失败）。

## 证据

- 工作流：`.github/workflows/production-build.yml`、`terminal-tests.yml`、`static-checks.yml`、`website-build.yml`、`slider-browser.yml`、`claude-code-review.yml`、`claude.yml`；2026-10-26 起另有定时的 `website-markets-check.yml`。
- 回归：`scripts/ci-workflows.test.mjs` 钉住并发分组（含 `claude.yml` 不得有）、按事件取值的矩阵与无 `branches` 过滤、发版标签模式（用样例标签验证，`archive/**` 不匹配）、每次浏览器调用都带分片参数、静态检查合并为一个 job、`test:brand` 里的终端单测全部出现在 `terminal-tests.yml`；逐条变异确认会失败。`scripts/check-client-bundle-budget.test.mjs` 钉住“预算测试在 `terminal-tests.yml` 运行、构建工作流内不再有测试步骤、测试工作流不含矩阵”。两个文件都由 `terminal-tests.yml` 运行，工作流目录的任何改动都会触发它。D8 由 `scripts/promotion-coverage.test.mjs` 钉住判定逻辑，其中在临时仓库里复现了 `merge-base` 离开 `dev` 主线的情形；`scripts/ci-workflows.test.mjs` 按九种事件（含被取消的运行）对作业条件与构建矩阵求值（不调用状态函数的 `if` 按 GitHub 的规则隐式加 `success()`，字符串里的函数名不算调用），并钉住四个判定作业同形、只读、只在晋升时运行，`Static Checks` 不受影响。对工作流、判定逻辑与 GitHub 接口代码共做 51 处变异，全部能让测试失败。（2026-10-31 更正：自 2026-10-12 测试分片起，`check-client-bundle-budget.test.mjs` 钉住的是「校验器只在第一片运行」，上文「测试工作流不含矩阵」已过时。）
- 验证命令与结果见两份任务记录；CI 在 GitHub 上的实际触发、矩阵取值、标签触发与取消行为需在推送后的第一个 PR 上观察，本 ADR 不包含该证据。
