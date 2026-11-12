<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-12-release-script-rollback-and-lambda-probe",
  "date": "2026-11-12",
  "title": "发布脚本：回滚时壳与标记必然写回、Lambda 不打印环境变量并在更新后探活（ADR 0051）",
  "kind": "task",
  "status": "recorded",
  "topics": ["static-hosting"],
  "summary": "修复 2026-11-12 全局审查的 P1-2、P2-7、P2-8：sync 只让内容哈希文件走 aws s3 sync，其余一律 aws s3 cp，build-meta.json 在壳之前、_shell.html 最后上传，结尾按内容核对两者，失败时说明线上状态；lambda 只打印白名单字段，打包前拒绝带相对导入的入口，更新后经站点探活 /api/health 与 /api/geo；新增 check-lambda 与 --functions-dir、--skip-probe；Production Builds 构建并检查 Lambda 包。只跑了不触网的测试：test:cloudfront 53/53、ci-workflows 20/20，18 个变异全部被抓到。没有用 --execute 运行、没有回滚演练；是否轮换 IPdata 密钥待运营方决定。",
  "thread": null,
  "baseCommit": "810a45db",
  "commits": [],
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

## 后续与替代关系

- 运营方决定是否轮换 IPdata 密钥（此前的发布日志与会话记录可能含有它）。
- 下一次发布第一次实际运行新脚本：核对 `sync` 的未哈希文件确实每次重传、结尾打印 `Release markers match the local build byte for byte`、`lambda` 只打印一行摘要并通过探活，把输出写进发布记录。
- 找一个低风险窗口做一次回滚演练（例如回到上一版再回到当前版），把每一步的输出写进记录；顺带核实桶是否开启了版本控制。
- 未做的可选项：排行榜处理器的上游超时 15 秒（`apps/terminal/src/lib/leaderboard/leaderboard-server.ts` 的 `upstreamTimeoutMs`）长于部署手册写的 Lambda 超时 10 秒，「刷新失败回旧快照」的分支走不到。改哪一边要决定：缩短上游超时可能让大响应正常刷新失败，加长 Lambda 超时是运营方的 AWS 设置；线上实际超时也未核实。
- `assertReleaseIdentity` 的错误信息会打印调用者 ARN（含账号号码），只在身份不符时出现；如需要可另行改为只打印类型。
- 本记录不替代此前的记录。
