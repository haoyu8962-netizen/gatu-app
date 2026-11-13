<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-12-release-script-rollback-and-lambda-probe",
  "date": "2026-11-12",
  "title": "发布脚本：回滚时壳与标记必然写回、Lambda 不打印环境变量并在更新后探活（ADR 0051）",
  "kind": "task",
  "status": "recorded",
  "topics": ["static-hosting"],
  "summary": "修复 2026-11-12 全局审查的 P1-2、P2-7、P2-8：sync 只让内容哈希文件走 aws s3 sync，其余一律 aws s3 cp，build-meta.json 在壳之前、_shell.html 最后上传，结尾按内容核对两者，失败时说明线上状态；lambda 只打印白名单字段，打包前拒绝带相对导入的入口，更新后经站点探活 /api/health 与 /api/geo；新增 check-lambda 与 --functions-dir、--skip-probe；Production Builds 构建并检查 Lambda 包。只跑了不触网的测试：test:cloudfront 53/53、ci-workflows 20/20，18 个变异全部被抓到。第二轮按 Codex 审查（8.0，四项 P2、四个漏网变异）修复：相对导入检查放宽并加输出目录结构检查、拒绝含过滤通配符的文件名、每次探活请求 10 秒截止、失败说明只陈述本次运行的事实、sync 主体抽成 releaseStatic、捕获输出抽成 captureCommand、CI 契约禁止 continue-on-error、immutable 改称按路径分类；test:cloudfront 60/60、ci-workflows 20/20，第二轮记录的 26 个变异全部被抓到。第三轮按 Codex 复审（8.3，两项 P2、两项 P3）：Lambda 检查认行注释、拒绝入口互相导入、拒绝符号链接、扩展名不分大小写；verify 的每个请求带自管定时器的中止信号；失败说明补「对象不存在」；releaseStatic 的闸门拒绝有测试；test:cloudfront 64/64，8 个变异全部被抓到；CLI 的两处接线留作后续。两轮都没有用 --execute 运行、没有回滚演练；是否轮换 IPdata 密钥待运营方决定。",
  "thread": null,
  "baseCommit": "810a45db",
  "commits": ["436f6f89", "739f1ed1", "65b7aa5f"],
  "sources": [
    { "path": "deploy/cloudfront/deploy.mjs" },
    { "path": "deploy/cloudfront/deploy.test.mjs" },
    { "path": "deploy/cloudfront/README.md" },
    { "path": ".github/workflows/production-build.yml" },
    { "path": "scripts/ci-workflows.test.mjs" },
    { "path": "docs/adr/0051-release-script-rollback-and-lambda-probe.md" },
    { "path": "docs/agent-handbook.md" }
  ],
  "supersedes": []
}
-->
# 发布脚本：回滚时壳与标记必然写回、Lambda 不打印环境变量并在更新后探活（ADR 0051）

## 背景与范围

同步记录，未取得任务标识。主会话把 2026-11-12 全局审查（`9395acca` 的 `docs/work-memory/sessions/2026-11-12-global-defect-review.md`）里发布脚本相关的三项交给本任务，在独立工作树的分支 `claude/fix-release-script`（基于 `origin/dev` `810a45db`）完成：

- P1-2：按手册回滚时，壳与发布标记不会被上传，脚本却报成功；
- P2-7：`lambda --execute` 把函数配置连同环境变量输出到终端和日志；
- P2-8：Lambda 更新即生效但发布脚本不探活；CI 从不构建 Lambda 包。

约束：不执行任何 `aws`、`gh` 命令，不用 `--execute` 运行部署脚本，不读 `.env*`；不推送、不开 PR。

## 结论与依据

审查的三条结论在代码里都成立（读码核对 `deploy.mjs` 修改前的 `buildSyncCommands`、`assertReleaseMarkersUploaded`、`buildLambdaCommands` 与 `runAws`）。`_shell.html` 与 `build-meta.json` 大小相同这一事实来自审查记录的 `stat` 实测，本任务没有重新测量。

做法与取舍见 [ADR 0051](../../adr/0051-release-script-rollback-and-lambda-probe.md)，要点：

- 以 `objectCacheControl` 的分类判定：只有 `immutable`（内容哈希）文件用 `aws s3 sync`；其余（`sw.js`、`manifest.json`、图标、主题样式、未哈希的图表入口等、`sameorigin.html`、`404.html`、`build-meta.json`、`_shell.html`）用 `aws s3 cp`。按当前 `apps/terminal/public` 计，未哈希文件约 28 个，内容哈希文件约 1,155 个（主要是 TradingView bundle）。
- 顺序改为 哈希文件 → 其余非 HTML → 壳以外的 HTML → `build-meta.json` → 六个遗留法律页 → `_shell.html`；`runSyncPlan` 在失败时按阶段说明桶里的状态。
- 标记核对改为取回对象比较 SHA-256（`aws s3 cp s3://… -`，只需 `s3:GetObject`）。
- `update-function-code` 带 `--query` 只取五个字段，脚本再捕获应答、按白名单打印；其余直接打印应答的命令逐个核对过，不含密钥（CloudFront 函数更新与发布、`update-distribution`、`create-invalidation`、S3 上传）。
- `releaseLambda` 把检查、打包、更新、等待、探活串起来并全部注入依赖；探活复用 `verify` 的 `/api/health` 与 `/api/geo` 检查。
- 回滚必须用当前脚本读旧工作树的产物，因为旧工作树里的 `deploy.mjs` 仍有 P1-2 与 P2-7；为此新增 `--functions-dir`。

未采用：全部改 `cp`（每次重传约 1,150 个不变的图表 bundle）、`--exact-timestamps`（只对下载方向生效）、先 `touch` 旧文件（靠人记）、`head-object` 校验和（依赖上传参数与分段格式）、Lambda 别名切换（要改函数 URL 与 IAM，属运营方的 AWS 设置）。

审查结论里没有发现不成立的地方。补充一点：回滚还有一个审查没提到的障碍——保留的发布工作树里是旧版脚本，按「在旧工作树里跑发布命令」回滚，修复不会生效；手册现在写明用当前脚本加 `--public-dir`、`--lambda-dir`、`--functions-dir`。

## 验证与限制

工作区基线 `810a45db`，2026-11-12，本机 Node 22，全部不触网：

- 先写回滚用例（内存桶模拟 `aws s3 sync` 的跳过规则：本地文件更旧、大小相同），在修改前的代码上失败，报 `_shell.html kept the newer release`；修复后通过。
- `pnpm test:cloudfront`：`ℹ tests 53`、`ℹ pass 53`、`ℹ fail 0`。
- `node --test scripts/ci-workflows.test.mjs`：`ℹ pass 20`、`ℹ fail 0`。
- 变异（脚本在草稿目录，每次改源码、跑 `deploy.test.mjs`、还原）：部署脚本 14 个全部被抓到——未哈希文件走 sync、页面走 sync、壳先于标记、按大小核对标记、去掉 `--query`、摘要带原始应答、跳过探活、跳过入口检查、漏掉动态 `import()`、不要求 `--origin`、探活不重试、失败说明不分阶段（第一次没被抓到，收紧断言后抓到）、允许 source map、哈希文件不在最前。工作流 4 个全部被抓到——删 `check-lambda`、行内注释掉 `node --check`、把步骤移到客户端构建之后、给步骤加 `if`。
- `pnpm --filter @sairn/terminal build:lambda` 本机约 9 秒，产物 `index.mjs` 229.42 kB、`csp-report.mjs` 4.02 kB，两者都没有任何 `import`；`node deploy/cloudfront/deploy.mjs check-lambda` 通过，两个入口 `node --check` 通过。
- 演练输出（不带 `--execute`）：`lambda` 打印带 `--query` 的更新命令和探活计划；`sync` 对一个临时产物目录打印的命令顺序与上面一致。
- `pnpm exec biome check` 对三个改动的 `.mjs` 文件报「No files were processed」：这几个文件在 Biome 配置里被忽略，没有格式检查。
- 没有运行全量终端 Vitest 与 `pnpm build`（任务要求）；没有用 `--execute` 运行任何命令，没有做回滚演练。`aws s3 cp --recursive` 的 include 过滤、`--query` 的 JMESPath 写法、`aws s3 cp … -` 取回对象，都按 AWS CLI 文档与现有用法推断，没有对真实桶验证。函数 URL 指向未限定版本（`$LATEST`）是从部署手册的建立步骤推断的，未在控制台核对。

### 第二轮：Codex 审查 8.0 之后（同日，提交 `436f6f89` 之后的下一个提交）

主会话转来 Codex 对 `436f6f89` 的审查：评分 8.0，无 P0/P1，四项 P2，另有四个测试抓不到的变异；主会话逐条核对后判定都成立，并另外用 p41 的真实产物（1,647 个文件）空跑新计划，确认无遗漏、无重复、没有含通配字符的键、壳在最后。本轮处理：

| 项 | 问题 | 处理 |
| --- | --- | --- |
| P2 相对导入检查 | `\bimport\s+` 要求空白，`import"./x.mjs"`、`import/*c*/"./x.mjs"` 会放行 | 关键字与说明符之间允许零个或多个空白和块注释，注释写明有意宁可误报；新增不依赖语法的结构检查：`dist-lambda` 里（递归）除入口外不得有 `.mjs`/`.js`/`.cjs`，`check-lambda` 与 `lambda` 都执行 |
| P2 文件键当过滤模式 | `* ? [ ]` 在 AWS CLI 过滤器里是通配符 | `buildSyncPlan` 生成命令之前拒绝这类文件名并列出；假桶注释改为说明「过滤器即精确键」由这条拒绝规则保证 |
| P2 探活无截止时间 | 服务端不应答或响应体不结束时探活永远挂着 | 每次请求连同读取响应体共用一个截止时间（默认 10 秒，`AbortController` 加定时器竞争，finally 清掉定时器），`verify` 同样受益；探活上限约 66 秒 |
| P2 失败说明把未知说成确定 | 断言「壳仍是上一版」「标记已是本次构建」「壳部分写入」 | 只陈述本次运行的事实：已返回成功的阶段、失败命令的对象状态未知（S3 单键原子写入）、后面的阶段本次没写、运行前桶里是什么不知道；建议原样重跑再 `verify` |
| 漏网变异 a、b | 删 CLI `sync` 里的 source map 检查或标记核对，测试仍通过 | `sync` 主体抽成可注入的 `releaseStatic`，测试钉住「先拒 `.map`、再上传、最后核对标记」 |
| 漏网变异 c | `captureAws` 的标准输出改成继承，测试仍通过 | 抽出 `captureCommand`，测试用子进程调用它运行打印标记串的命令，断言子进程自己的输出里没有标记串 |
| 漏网变异 d | 工作流新步骤加 `continue-on-error: true`，测试仍通过 | `ci-workflows.test.mjs` 禁止 `production-build.yml` 出现 `continue-on-error` |
| 措辞 | 「只有带内容哈希的文件用 sync」比实际强 | 注释、README、ADR、手册改为「按路径分类」，并写明前提：构建不在 `assets/` 下用用过的名字产出不同内容 |

结果（2026-11-12，本机，不触网）：`pnpm test:cloudfront` `ℹ tests 60`、`ℹ pass 60`、`ℹ fail 0`；`node --test scripts/ci-workflows.test.mjs` `ℹ pass 20`、`ℹ fail 0`；`build:lambda` 后 `check-lambda` 通过。`pnpm exec biome check` 对这几个 `.mjs` 仍报被配置忽略。

变异（逐个打上、跑测试、还原）：四个漏网变异（a 删 `assertNoSourceMaps`、b 删标记核对、c 捕获改继承、d 加 `continue-on-error`）全部被抓到；第 1–4 项各挑的变异（导入正则恢复要求空白、跳过目录检查、目录检查忽略子目录、跳过通配符拒绝、放行方括号、截止只中止不拒绝、截止只覆盖 fetch 不覆盖响应体、`verify` 不传截止时间、不传 signal、定时器不清、失败说明写回「仍是上一版」、失败阶段算作成功、不提同阶段部分成功）全部被抓到；第一轮的五个变异在新代码上重跑也全部被抓到。过程中有三处第一次没抓到：「定时器竞争里多塞一个永不结束的 Promise」是等价变异（定时器照样胜出），换成「截止只中止不拒绝」后抓到；「失败阶段算作成功」原测试只在阶段第一条命令失败，补了阶段中途失败的用例后抓到；「定时器不清」只会让进程多等，补了「成功的请求不留下定时器」的断言后抓到。

仍未做：没有以 `--execute` 运行，没有回滚演练；AWS CLI 对拒绝之外的过滤行为、真实网络下截止时间的表现都没有在真实环境里验证。

### 第三轮：Codex 复审 8.3（`739f1ed1` 之后的下一个提交）

Codex 复审 `739f1ed1`：8.3，无 P0/P1，两项 P2、两项 P3。主会话先在工作树里写了一半（`GAP` 的行注释分支、`verify` 的 `request` 包装与措辞、两条导入用例和一个失败中的新测试），本轮接手核对并补完：

| 项 | 发现 | 处理 |
| --- | --- | --- |
| P2 Lambda 两层检查同时漏过 | `import // shared handler\n  "./csp-report.mjs";`：正则不认行注释，目录检查又允许另一个入口，而 zip 里只有 `index.mjs` | 核对并保留主会话加的行注释分支；补「两个入口互相导入也被拒绝」用例（目录检查通过、入口检查拒绝、什么都没打包）。便宜的同类缺口一并补上：新增 `listLambdaOutput`，符号链接单独列出并拒绝（原来的遍历会静默跳过它们），扩展名比较不分大小写。函数注释写明词法检查不是解析器、不再扩展，更新后的探活是最后一道网 |
| P2 `verify` 其余请求无截止 | 只有 health/geo 有截止，`/trade/HYPE`、`/api/referral-geo` 等会无限等待 | 主会话用的 `AbortSignal.timeout` 的定时器不保持事件循环，「等信号才拒绝」的假 fetch 让事件循环提前清空、后面的测试被取消。换成 `verify` 自己管理的普通定时器：每个请求一个 `AbortController` 加 `setTimeout`（以 `no answer from <路径> within <N> ms` 为原因中止），定时器收进集合，在 `check()` 的 finally 里清掉；health/geo 仍用 `fetchTextWithin`。新测试断言每个请求都带 `AbortSignal`、首项以 `no answer from /trade/HYPE within 20 ms` 失败、结束后没有残留定时器、几秒内结束；原测试标题改为只说 probe 和 verify 的 health/geo 两项 |
| P3 失败说明漏了「对象不存在」 | 说明只写「原内容或本次构建的」 | 核对代码、注释、README 三处都是 absent / unchanged / this build's；ADR 0051 的中文同步改；补「对象此前不存在且上传失败」的用例 |
| P3 抽取后 CLI 接线无测试 | 三个变异抓不到：`captureAws` 改回直通、`releaseStatic` 的调用换成空操作、执行时的闸门拒绝改恒假 | 只做便宜的第三个：`releaseStatic` 在 `execute: true` 且闸门不符时拒绝、什么都不上传，`execute: false` 时只警告并照常打印计划，带上确认参数后照常执行 |

结果（2026-11-12，本机，不触网）：`pnpm test:cloudfront` `ℹ tests 64`、`ℹ pass 64`、`ℹ fail 0`、`ℹ cancelled 0`；`node --test scripts/ci-workflows.test.mjs` `ℹ pass 20`、`ℹ fail 0`。

变异（逐个打上、跑测试、还原）全部被抓到：删 `GAP` 的行注释分支；`request` 不传 signal；`check()` 不清定时器；执行时闸门拒绝改恒假；接受符号链接；扩展名比较区分大小写；遍历重新跳过符号链接；失败说明去掉「不存在」。

留作后续（本轮不做）：
- `createRequire` 读相对 JSON 这类加载方式，不往词法检查里加：它不是解析器，更新后的探活是最后一道网。
- 两处 CLI 接线仍未被测试强制：`captureAws` 改回直通、`main()` 里 `releaseStatic(...)` 的调用被换成空操作，现有测试都抓不到。需要在 `PATH` 里放一个假的 `aws` 做端到端测试，成本较高，另开任务。

仍未以 `--execute` 运行，也没有做回滚演练。

## 后续与替代关系

- 运营方决定是否轮换 IPdata 密钥（此前的发布日志与会话记录可能含有它）。
- 下一次发布第一次实际运行新脚本：核对 `sync` 的未哈希文件确实每次重传、结尾打印 `Release markers match the local build byte for byte`、`lambda` 只打印一行摘要并通过探活，把输出写进发布记录。
- 找一个低风险窗口做一次回滚演练（例如回到上一版再回到当前版），把每一步的输出写进记录；顺带核实桶是否开启了版本控制。
- 未做的可选项：排行榜处理器的上游超时 15 秒（`apps/terminal/src/lib/leaderboard/leaderboard-server.ts` 的 `upstreamTimeoutMs`）长于部署手册写的 Lambda 超时 10 秒，「刷新失败回旧快照」的分支走不到。改哪一边要决定：缩短上游超时可能让大响应正常刷新失败，加长 Lambda 超时是运营方的 AWS 设置；线上实际超时也未核实。
- `assertReleaseIdentity` 的错误信息会打印调用者 ARN（含账号号码），只在身份不符时出现；如需要可另行改为只打印类型。
- 未被测试强制的 CLI 接线：`captureAws` 是否经 `captureCommand` 捕获、`sync` 分支是否真的调用 `releaseStatic`。补法是在 `PATH` 里放假的 `aws` 跑 `deploy.mjs` 的端到端测试（第三轮记录）。
- `createRequire` 读相对文件这类加载方式不在 Lambda 词法检查之内，依赖更新后的探活兜底。
- 本记录不替代此前的记录。
