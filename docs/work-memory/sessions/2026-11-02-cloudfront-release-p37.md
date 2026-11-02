<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-02-cloudfront-release-p37",
  "date": "2026-11-02",
  "title": "CloudFront 生产发布 p37（语言链接 Service Worker 修复，首次按覆盖判定的晋升）",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "pr-review"],
  "summary": "运营方选「发布 p37」。晋升 PR #139（dev ce18a5a5：#134 语言链接 Service Worker 修复、#130 晋升覆盖与文档）是判定作业第一次在晋升 PR 上运行：四个工作流都判为覆盖，约 16 计费分钟，合入 main 17766a53。随后的发布构建总量比基线多 10,101，超出允许值 101 字节；客户端代码与 p36 相同，只差构建身份的四次发布构建相差 469 字节，余量已小于这种差异，未部署。运营方选「重定基线后发布」：按复现规则测得 ce18a5a5 配对关闭 3,372,998，PR #140 把总量基线改为该值（测试第 2 片一次挂起超时，本地同参数通过，重跑通过），第二次晋升 #141 只触发两个已被覆盖的工作流，合入 main 2fcae4d5。用 Node 22.15.0 构建 cloudfront-2026-11-02-p37（三闸门全开，总量按新基线 +3,101），functions → lambda（版本 21）→ sync（1,652 次上传 0 失败、发布标记一致）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。真实浏览器里的语言链接验证、真实钱包与真机验收未做。",
  "thread": null,
  "baseCommit": "047b4bb3",
  "commits": ["ce18a5a5", "17766a53", "da921a8e", "64c61c44", "2fcae4d5"],
  "sources": [
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md"},
    {"path": "scripts/promotion-coverage.mjs"},
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"path": "docs/work-memory/sessions/2026-11-02-cloudfront-release-p36.md"},
    {"path": "docs/work-memory/sessions/2026-11-02-link-language-sw-fixes-to-dev.md"},
    {"path": "docs/work-memory/sessions/2026-10-31-promotion-ci-coverage.md"},
    {"url": "https://github.com/zora4523-bot/gatu-app/pull/139"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p37（语言链接 Service Worker 修复，首次按覆盖判定的晋升）

## 背景与范围

同步记录，未取得任务标识。PR #134 合入 `dev`（`ce18a5a5`）后，agent 问「要把 #134 发布到生产（p37）吗？」，运营方选了「发布 p37」。agent 按 p36 的做法理解为：开 `dev` → `main` 晋升 PR，CI 全绿后以 merge commit 合入，再从 `main` 构建并部署，三个闸门按惯例全开。线上此前是 p36（`047b4bb3`）。时间均为 UTC；发布号按本地日期（UTC+8）取 `2026-11-02`。

这也是 [PR #130](https://github.com/zora4523-bot/gatu-app/pull/130)（[ADR 0016](../../adr/0016-dev-first-pull-requests-and-ci-tiers.md) D8，晋升覆盖）合入后的第一次晋升：判定作业第一次在晋升 PR 上运行。

## 结论与依据

**晋升内容。** [PR #139](https://github.com/zora4523-bot/gatu-app/pull/139)（`dev` `ce18a5a5` → `main`）相对 `047b4bb3` 包括：
- [#134](https://github.com/zora4523-bot/gatu-app/pull/134)：语言链接（`?lang=`）的导航改为网络优先，只在网络失败或 5xx 时回退缓存壳；附 p35 发布记录。运行时只改了 `apps/terminal/public/sw.js`。
- [#130](https://github.com/zora4523-bot/gatu-app/pull/130)：CI 晋升覆盖（四个工作流的判定作业、`scripts/promotion-coverage.mjs` 及其测试）。
- [#135](https://github.com/zora4523-bot/gatu-app/pull/135)、[#136](https://github.com/zora4523-bot/gatu-app/pull/136)、[#137](https://github.com/zora4523-bot/gatu-app/pull/137)、[#138](https://github.com/zora4523-bot/gatu-app/pull/138)：文档与记录，含 p36 发布记录。

客户端源码、依赖与锁文件自 p36 起都没有变化。`sw.js` 是从 `public/` 原样复制的文件，不在 `scripts/check-client-bundle-budget.mjs` 统计的 `.output/public/assets` 里。`git merge-tree --write-tree origin/main origin/dev` 的结果等于 `dev` 的树（`36552811`）。

**晋升覆盖。** 开 PR 之前，按手册第 8 节在本机预演（`scripts/promotion-coverage.mjs <工作流文件名> --base origin/main --head origin/dev`；参数只接受文件名，带 `.github/workflows/` 前缀会报用法错误）。四个工作流都判为覆盖：
- `terminal-tests.yml`、`production-build.yml`：#134 的运行 41334013719、41334013826 在合到 `df119e05` 上的结果上通过，此后 `dev` 没有变化。
- `slider-browser.yml`、`website-build.yml`：#130 的运行 41327182491、41327182534 在合到 `26c06d02` 上的结果上通过，此后 5 次合并都没有改动它们的输入（#134 只改了 `public/sw.js`、单测与文档，不在浏览器回归和官网工作流的 `paths` 里）。

#139 于 05:15:10 开出，GitHub 上的结果与预演一致：
- 四个 `Promotion coverage` 作业都分到了运行器并成功，各用 7–11 秒。检出行是 `HEAD is now at e9733244 Merge ce18a5a5… into 047b4bb3…`。四份作业日志里的判定与本机预演逐字相同，没有出现 `the check failed` 警告。
- 被跳过的作业各显示为一条 skipped，名称里的矩阵变量没有展开（`Test terminal and release tooling (${{ matrix.shard }}/2)`、`Terminal browser regressions (${{ matrix.shard }}/2)`），`Build website` 同样跳过。
- `Production Builds` 只运行 `Build terminal (pairing true)`（05:15:27–05:23:52，8 分 25 秒），没有 `pairing false` 作业。它的预算读数（CI 元数据、无 `.env.local`）：总量 3,375,959，比基线多 9,758，余 242；交易启动 1,652,634（+8,705）；手机运行时 119,772（+9,192，余 808）；桌面运行时 204,540（+1,857）。
- `Static Checks` 照常全跑，2 分 37 秒通过。
- 按作业向上取整估算约 16 计费分钟：四个判定作业各 1，静态检查 3，配对开启构建 9。CHANGELOG 对覆盖时的预估是约 14，全跑约 70；p36 的晋升 #133 早于 #130，仍按旧工作流全跑。这只是估算：`actions/runs/{id}/timing` 的 `billable` 拿不到官方计费数（见 ADR 0016 的 2026-11-02 补记）。
- `chatgpt-codex-connector` 审查 `ce18a5a5` 后没有留下意见，PR 上没有审查线程。

**预检。** 发布工作树 `gatu-release-p37`（仓库外，`.env.local` 软链、不读内容）检出 `ce18a5a5`，Node 22.15.0、pnpm 10.21.0 按锁文件安装（27.7 秒）。用发布配置构建，所有开关在命令行写出，与下文相同：
- 总量 3,375,877，比基线多 9,676，允许 10,000，余 324。p36 的最终构建是 3,375,833（余 368），差的 44 字节来自构建身份（提交号、构建时间与发布号）。
- 交易启动 1,653,174（+9,245）；手机运行时 119,764（+9,184，余 816）；桌面运行时 204,482（+1,799）。
- `build:lambda`：`index.mjs` 229,440 字节，与 p36 相同。
- 打包进去的 `VITE_*` 与 p36 最终构建逐项一致，只差提交号、构建时间与发布号（非布尔值只比较 SHA-256 前缀）。`build-meta.json` 的三个闸门正确；图表入口仍是 `charting_library.6d17e2dafb1007c4.js`；产物里的 `sw.js` 与源文件相同；产物不含 `gatu.ai`。
- `functions`、`lambda`、`sync` 空跑（不带 `--execute`）正常：函数为 3 个当前加 1 个上一版内联脚本哈希；闸门行三项 on；`sw.js` 以 `no-store` 上传。
- `gatu-edge` 身份可用（`sts get-caller-identity` 只看了用户名）。

**合并。** 9 项检查里 6 项通过、3 项按判定跳过，状态为 CLEAN。05:44:10 以 merge commit 合入（`--match-head-commit ce18a5a5…`）。`main` = `17766a53`，父提交 `047b4bb3` 与 `ce18a5a5`，树与 `ce18a5a5` 完全相同（`git diff` 0 行）。

**最终构建没有通过预算。** 工作树切到 `17766a53`（`git status` 干净），按锁文件重装依赖后，用同一组开关构建（`SAIRN_BUILD_SHA=17766a53…`）。450 个 chunk、无循环静态导入，但总量 3,376,302，比基线多 10,101，超过允许的 10,000：`check-client-bundle-budget.mjs` 退出 1，构建脚本在它之后的 `inject-shell-preloads`、`collect-inline-script-hashes` 两步没有运行。产物不完整，没有部署任何东西，线上仍是 p36。其余三项在允许值内：交易启动 1,653,139（+9,210）、手机运行时 119,779（+9,199）、桌面运行时 204,565（+1,882）。

客户端代码与 p36 相同的四次发布配置构建，只差构建身份（提交号、构建时间与发布号），总量读数相差 469 字节：

| 构建 | 提交 | 总量 | 比基线 |
| --- | --- | ---: | ---: |
| p36 预检 | `26c06d02` | 3,376,114 | +9,913 |
| p36 最终 | `047b4bb3` | 3,375,833 | +9,632 |
| p37 预检 | `ce18a5a5` | 3,375,877 | +9,676 |
| p37 最终 | `17766a53` | 3,376,302 | +10,101 |

同一棵树的 CI 配对开启构建（CI 元数据、无 `.env.local`）读 3,375,959（+9,758）。这与[性能基线](../../terminal-performance-baseline.md)「Funds dialog total-client re-baseline」一节记下的构建身份噪声同类：那里七次只差身份的构建相差 544 字节。余量已经小于噪声，同一份代码的发布构建时而通过、时而不通过。没有用换构建时间重跑的办法凑一次通过：那等于为了让检查变绿而改数字，基线文档的重定规则不允许。

agent 在这里停下，请运营方决定：按 p32 的先例先重定总量基线（新 PR 进 `dev`，再晋升一次），或者暂停发布。运营方选了「重定基线后发布」。agent 事先说明，这个选择包括推送并开重定 PR、CI 全绿后合并、再开一次晋升 PR 并在 CI 全绿后合并，以及随后的构建与部署。

**重定总量基线。** 从 `origin/dev` `ce18a5a5` 切出 `claude/p37-total-rebaseline`，放在会话暂存目录里一个不含 `.env.local` 的工作树中。用 Node 22.15.0 运行 `CI=true pnpm install --frozen-lockfile --prefer-offline`，再按复现规则的固定身份构建：`SAIRN_BUILD_SHA=e4e09966…`、`SAIRN_RELEASE_ID=startup-guardrail-baseline`、`SAIRN_BUILD_TIME=2026-08-27T00:00:00.000Z`、`NODE_ENV=production`、`NITRO_PRESET=node-server`，执行 `pnpm --filter @sairn/terminal build`，先配对开启，后配对关闭。结果：
- 配对关闭：总量 3,372,998（比旧基线 +6,797，449 个 chunk）；路由预加载诊断 522,716；交易启动 1,651,557；手机运行时 119,786；桌面运行时 204,624；`trade-terminal-page` 127,645，`vaults-page` 30,522。
- 配对开启：总量 3,375,924（450 个 chunk），比配对关闭多 2,926。
- 两次构建都通过了当时的全部预算，`git status` 保持干净。

按 p32 的做法，总量基线改为配对关闭的读数 3,372,998：`scripts/check-client-bundle-budget.mjs` 改常数并附注释，[性能基线](../../terminal-performance-baseline.md) 新增「Total-client re-baseline before release p37 (2026-11-02)」一节，写明读数、归因和其余基线的余量。增长的归因：2026-10-31 已计入的 +363，#131 −53，#132 在 `a9973c83` 测得 +6,252，其余 +235 是 #132 后续提交与噪声之和，没有分开测。其余基线不变。

校验结果：
- 新基线下，测量产物 +0，失败的 p37 发布产物 +3,304，都通过。
- `node --test scripts/*.test.mjs` 96 项通过，其中预算脚本测试 19 项；`git diff --check` 通过。Biome 的配置不覆盖 `scripts/*.mjs`。
- Codex CLI（`gpt-6-astra`，只读，low）评 9/10，没有 P0–P2，核对了全部数字与归因的加减。另有两项 P3 措辞问题，已改：构建身份噪声写成推断（四次构建没有做逐资产对照）；余量提醒不再写成「必须重定」。改后没有再送审。
- 提交 `da921a8e`（`build(terminal): rebaseline the client total before release p37`），推送后开 [PR #140](https://github.com/zora4523-bot/gatu-app/pull/140) → `dev`。

**#140 的 CI。** 06:03 开始：
- 配对关闭构建（06:11:48）与 Terminal Tests 第 1 片（06:13:59）通过。
- 第 2 片在第 14 步「Test order draft and exchange session lifecycles」从 06:06:32 一直运行到作业 20 分钟的上限，06:28:16 被取消。注解是 `The job has exceeded the maximum execution time of 20m0s`。
- 被取消作业的日志在 GitHub 上不存在：`gh run view --log` 报 log not found，日志接口返回 `BlobNotFound`，所以看不到挂起的是哪个用例。
- 本机在测量工作树里用同样的参数跑这一片（`vitest run --maxWorkers=1 --shard=2/2`，加上该步骤列出的 52 个文件），26 个文件 68 秒全部通过。
- 该步骤只跑 Vitest 用例，与本 PR 改的预算常数和文档无关，判为偶发挂起。07:08:29 用 `gh run rerun --failed` 只重跑被取消的作业。
- 机器人审查 `da921a8` 后没有发现问题。

重跑的第 2 片于 07:08:33–07:19:24 通过（10 分 51 秒），#140 的检查全部通过。08:01:59 以 merge commit 合入 `dev`（`--match-head-commit da921a8e…`），`dev` = `64c61c44`，父提交 `ce18a5a5` 与 `da921a8e`，树与 PR 头相同。

**第二次晋升。** 合并前的预演：`main` `17766a53` 与 `dev` `64c61c44` 的合并树等于 `dev` 的树，差异只有预算脚本和基线文档两个文件。本机预演结果如下：
- `terminal-tests.yml`、`production-build.yml` 由 #140 的运行 41397546171、41397546163 覆盖。
- `slider-browser.yml`、`website-build.yml` 判为「not covered」，原因是上次晋升以来没有 PR 改动过它们的输入。不过晋升 PR 的差异不在这两个工作流的 `paths` 里，`Static Checks` 也一样，这三个工作流本来就不会触发，所以这个判定用不上。

08:03 开 [PR #141](https://github.com/zora4523-bot/gatu-app/pull/141)（`dev` `64c61c44` → `main`）。

#141 上只有四项检查：
- 两个 `Promotion coverage` 作业成功（10 秒、13 秒），检出行是 `Merge 64c61c44… into 17766a53…`。判定与本机预演逐字相同：`Terminal Tests` 与 `Production Builds` 都由 #140 的运行覆盖，没有警告。
- 测试作业显示为一条 skipped。
- `Build terminal (pairing true)` 于 08:03:54–08:13:09 通过，总量 3,376,124，按新基线 +3,126；交易启动 +8,739，手机运行时 +9,199，桌面运行时 +1,913。
- `Static Checks`、浏览器回归与 `Website and Brand` 没有触发。
- 机器人审查 `64c61c44` 后没有发现问题。

08:14:20 以 merge commit 合入（`--match-head-commit 64c61c44…`）。`main` = `2fcae4d5`，父提交 `17766a53` 与 `64c61c44`，树与 `dev` 相同。

**构建（第二次）。** 工作树切到 `2fcae4d5`，`git status` 干净，按锁文件重装依赖后，用同一组开关构建，`SAIRN_BUILD_SHA=2fcae4d5…`：
- 450 个 chunk，无循环静态导入。
- 总量 3,376,099，按新基线 +3,101，允许 10,000。
- 交易启动 1,653,051（+9,122，余 878）；手机运行时 119,781（+9,201，余 799）；桌面运行时 204,576（+1,893）。
- 壳里 118 个共有预加载，另有 15 个仅桌面；内联脚本哈希 3 个。
- `build:lambda`：`index.mjs` 229,440 字节，含本次提交号。
- `verify-chart-build.mjs`（传入 `deploy/manifests/tradingview-charting-library.json`）退出码 0。
- 打包进去的 `VITE_*` 与 p36 最终构建相比，只差提交号、构建时间与发布号。`build-meta.json` 的提交、release 与三个闸门正确；图表入口仍是 `charting_library.6d17e2dafb1007c4.js`；提交号在 5 个 chunk 里各出现一次；产物里的 `sw.js` 与源文件相同；产物不含 `gatu.ai`。

**发布。**
- `functions --execute --origin https://app.sairn.ai`（08:18:10–08:18:33）：3 个当前加 1 个上一版内联脚本哈希，两个函数都发布到 LIVE；随后查询时请求函数已是 DEPLOYED，响应函数仍在 IN_PROGRESS（正在生效）。
- `lambda --function-name gatu-terminal-api --execute`：版本 21（08:18:44），`$LATEST` 与版本 21 都是 Active / Successful。

- `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（08:19:14–08:26:40）一次成功：
  - 闸门行三项 on；1,652 次上传，0 失败。日志里 9 行含 `error` 的都是文件名。
  - 六个 `<route>/index.html` 已用本次的壳覆盖。
  - 结尾输出 `Release markers match the local build: _shell.html, build-meta.json`。
- 失效：主网 `ET9CNVE6L1GWN` 的 `I34RN9UJV0A38N8QBJL7HC0QGN`（08:27:05），测试网 `E3Q2SAX402CR9F` 的 `I2A894L7LGV9AZX7DU763Q9G8A`（08:27:08）。

两条失效在 08:28:49 与 08:28:51 查询时都已 Completed。

## 验证与限制

- `verify --origin https://app.sairn.ai --network mainnet`：15/15 ok；`--origin https://testnet.sairn.ai --network testnet`：16/16 ok。
  - 两网 `build metadata parity` 都是 `2fcae4d5 / cloudfront-2026-11-02-p37 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`。
  - 壳预加载 117 个链接；内联脚本 3 个，策略为 enforce；图表入口不可变且由壳预加载。
  - 地区判定读到的是本机出口 IP 所在国家。
- `csp-coverage.mjs https://app.sairn.ai`（08:29:06–08:31:15），完整读过输出：
  - 33 步、0 违规、0 控制台错误，`scriptSrcViolations` 与 `otherViolations` 都为空，没有 report-only 头。
  - 跳过 2 步（桌面 WalletConnect、手机图表页），与 p34–p36 相同。
  - 桌面 7 个面板，手机 3 个导航项。
- 运行时测试：没有在 `main` 上重跑全量终端 Vitest。两次晋升的树分别等于 #134 的头 `b726adb7` 与 #140 的头 `da921a8e`，它们的 CI 结果见上文；本机只按 CI 参数重跑了 #140 被取消那一片的步骤 14（26 个文件通过）。
- 未做：
  - #134 记录列出的真实浏览器验证：回访者第一次点语言链接（仍由旧 Service Worker 回答）、之后的语言链接走网络、离线与 5xx 时回退缓存壳，以及 iOS Safari。
  - 真实钱包登录、存款与下单；Safari、Firefox、真机与读屏。
- CHANGELOG 仍在 Unreleased 下，与 p33–p36 相同。发布日志在会话暂存目录，未入库。
- 发布工作树：`gatu-release-p37` 保留到下次发布；`gatu-release-p36` 是终端回滚产物；`gatu-release-p35` 及更早的可以删除（未删除）。测量工作树在会话暂存目录，不作为回滚产物。

## 后续与替代关系

- **包体余量**：总量按新基线还剩约 6,900 字节（发布构建 +3,101）。但发布构建的交易启动只剩 878 字节，手机运行时只剩 799 字节。下一个让这两处增长的 PR，要按发布配置测量；超出余量时，先削减增长，或者做有记录的重定（[性能基线](../../terminal-performance-baseline.md) 本次新增的一节）。
- **CI 偶发挂起**：#140 的 Terminal Tests 第 2 片在步骤 14 挂起，直到 20 分钟上限。日志没有保存，本地也复现不出。如果再出现，先设法拿到挂起时的日志再判断，不要只靠重跑。
- **晋升覆盖**：第一次晋升的五项核对已经完成，见上文与 ADR 0016 的 2026-11-02 补记。另外，第二次晋升 #141 表明：上次晋升以来没有 PR 改动过输入的工作流，本机预演会判为「not covered」，但这种工作流在晋升 PR 上本来就不会触发。
- **待做**：上面列出的线上验收。本记录，以及 ADR 0016、晋升覆盖记录、#134 记录与 p36 记录的补记，随下一个文档 PR 一起提交。
- **预检规则**：手册第 8 节新增「发布预检」一条：预检中总量余量不足 1,000 字节，或任何其它预算余量不足 200 字节，都按不通过处理，先削减增长或重定基线，再开晋升 PR。p37 的预检只剩 324 字节，当时按通过处理，这是多出第二次晋升的原因。
- **文档 PR**：本记录与上述补记一起进 `dev`。同一个 PR 还并入了 Codex 2026-11-02 的周整理 `e8582891`（基于 `df119e05`），冲突只在 p36 记录末尾和索引，两段补记按时间先后都保留。
- **10-05 周整理 `42f2bd23` 不并入**：运营方问它是否太旧、合并会不会覆盖较新的文档。核对结果：
  - 它基于 `498ea17a`（10-04），改了 45 个文件。其中 3 个（索引，以及两份品牌、域名计划记录）此后在 `dev` 上又被改过，试合并时正好这 3 个冲突；其余 42 个此后没人动过，所以合并不会覆盖较新的内容。
  - 问题在于它写的是 10-05 当时的状态：19 份记录末尾追加了「周整理补注（2026-10-05）」，还改写了 56 行原文。10-12 的周整理已决定不重新套用它，之后三次周整理也没有以它为基础。
  - 本地分支 `codex/work-memory-2026-10-05` 保留不动，以免提交被 Git 回收。是打归档标签还是删除，由运营方决定。
- **上一次终端发布记录**：p36，[2026-11-02-cloudfront-release-p36.md](2026-11-02-cloudfront-release-p36.md)。
