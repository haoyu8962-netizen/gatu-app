<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-12-cloudfront-release-p41",
  "date": "2026-11-12",
  "title": "CloudFront 生产发布 p41（回到前台立即恢复 WebSocket 数据，ADR 0050）",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "market-recovery", "pr-review"],
  "summary": "运营方先说「推送并开 PR」，再说「部署到生产环境」，确认范围时选「是，一路做完」。PR #157（ADR 0050）第一轮 CI 有三项失败，原因是 ubuntu-latest 变成 26.04、Playwright 1.59.1 装不了 Chromium；把两个装浏览器的作业固定到 ubuntu-24.04 后浏览器回归通过，官网构建仍因行情快照 16 天未更新失败，与终端无关。#157 合入 dev 810a45db，发布预检通过，晋升 #158 三个工作流按覆盖跳过，合入 main 766a8566。构建 cloudfront-2026-11-12-p41（三闸门全开），functions → lambda（版本 25）→ sync（第一次因本机代理断开失败一个文件，重跑成功）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。ADR 0050 针对的现象没有复现，真机未验证；官网构建在 dev 与 main 上仍是红的。",
  "thread": null,
  "baseCommit": "af031ae4a0c1a27b48490c2fcf167208dfa3a79f",
  "commits": ["be6db234", "3f6a1b0e", "810a45db", "766a8566"],
  "sources": [
    { "path": "docs/adr/0050-websocket-recovery-on-resume.md" },
    { "path": "docs/work-memory/sessions/2026-11-12-ios-resume-websocket-recovery.md" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "deploy/cloudfront/README.md" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/157" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/158" },
    { "url": "https://app.sairn.ai/build-meta.json" }
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p41（回到前台立即恢复 WebSocket 数据，ADR 0050）

## 背景与范围

同步记录，未取得任务标识。时间都是 UTC+8，2026-11-12。

p40 上线后，`dev` 多了 #156（工作记忆索引改为本地生成，只涉及文档与脚本）和本次的 #157（[ADR 0050](../../adr/0050-websocket-recovery-on-resume.md)）。运营方的决定依次是：

1. 修复提交后，说「推送并开 PR」，开出 #157；
2. 说「部署到生产环境」；
3. 我列出合并 #157、发布预检、晋升并合并、发布 p41 四步并确认范围，运营方选「是，一路做完」。

本记录覆盖从 #157 的 CI 到 p41 上线验证。改动本身的调查、实测与审查见[任务记录](2026-11-12-ios-resume-websocket-recovery.md)。

## 结论与依据

**#157 的 CI。**

- 第一轮（`be6db234`）：两片终端单测、配对关闭的生产构建、静态检查通过；「官网构建」与两片「浏览器回归」在一分钟内失败，都停在安装 Chromium：`Playwright does not support chromium on ubuntu26.04-x64`。`ubuntu-latest` 变成了 26.04，仓库锁定的 Playwright 1.59.1 不支持，与 PR 内容无关。
- `3f6a1b0e` 把安装 Playwright 浏览器的两个作业（`slider-browser.yml` 的 `terminal-browser`、`website-build.yml` 的 `website`）固定到 `ubuntu-24.04`，并在工作手册第 3 节记了一条。
- 第二轮（`3f6a1b0e`）：浏览器回归两片通过（14m11s、12m34s），单测两片、配对关闭构建、静态检查通过。「官网构建」仍失败，但原因变了：官网的行情快照 `fetchedAt` 是 2026-10-27，已 16 天，超过 7 天上限（`run markets:snapshot`）。这是 `dev` 上的既有问题，终端发布不依赖它，没有在这次处理。
- Codex 机器人审查了 `be6db234`，没有发现，没有行内评论。
- 以合并提交合入 `dev`：`810a45db`。

**发布预检通过。** 在仓库外新建发布工作树 `gatu-release-p41`，`.env.local` 只软链、不读内容，检出 `dev` `810a45db`，Node 22.15.0、pnpm 10.21.0 按锁文件安装。用 p40 的开关构建：配对开启，三个闸门开，`VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false`，`VITE_HYPERLIQUID_TESTNET=` 为空，发布号 `cloudfront-2026-11-12-p41`。451 个 chunk，无循环静态导入，全部预算通过：

- 总量 3,379,433，余 3,565；
- 静态交易启动 1,654,017，余 463；
- 手机运行时 119,761，余 819；
- `trade-terminal-page` 127,947，余 219；
- `vaults-page` 30,536，余 240。

各项都满足手册第 8 节的要求（总量 1,000，其余 200）。

**晋升与合并（#158）。**

- 三个 `Promotion coverage` 作业判定 `terminal-tests`、`slider-browser`、`production-build` 都被 #157 的运行覆盖（43161501247、43161501250、43161501293，合并到 `19db63d1` 上通过，之后 `dev` 没有变化），没有 `the check failed` 警告。
- 静态检查 2m59s、配对开启的终端构建 8m54s 通过；单测与浏览器回归按设计跳过。
- 「官网构建」失败，原因同上。
- Codex 机器人无发现，没有行内评论。
- 以合并提交合入，锁定头提交 `810a45db`。`main` = `766a8566`，父提交是 `af031ae4` 与 `810a45db`，树与 `dev` 相同。

**构建。** 工作树切到 `766a8566`，`git status` 干净，按锁文件安装。同一组开关加 `SAIRN_BUILD_SHA=766a8566…` 执行 `pnpm build`，再执行 `build:lambda`（13:58:44–14:05:22）。

- 451 个 chunk，无循环静态导入，全部预算通过：
  - 总量 3,379,863（+6,865，余 3,135）；
  - 静态交易启动 1,654,054（余 426）；
  - 手机运行时 119,764（余 816）；
  - 桌面运行时 204,576（余 8,107）；
  - `trade-terminal-page` 127,945（余 221）；
  - `vaults-page` 30,534（余 242）。
- 壳里 118 个共有预加载，另有 15 个仅桌面。Lambda 的 `index.mjs` 为 229,440 字节。
- `build-meta.json` 为 `766a8566 / cloudfront-2026-11-12-p41`：配对开；CCTP 主网赞助开、测试网外部钱包开、测试网赞助关；两网银行卡入金开；图表入口仍是 `charting_library.6d17e2dafb1007c4.js`。
- `deploy/verify-chart-build.mjs apps/terminal/public apps/terminal/.output/public deploy/manifests/tradingview-charting-library.json` 退出码 0。第一次只传了清单一个参数，脚本报用法错误；它需要三个参数。
- 产物里的 `sw.js` 与源文件相同；`_shell.html` 与 `assets/` 不含 `gatu.ai`。

**发布。**

- 空跑：`functions`、`lambda`、`sync` 的计划都正常。
- `functions --execute --origin https://app.sairn.ai`（14:06:15–14:06:34）：两个函数都发布到 LIVE，响应函数里是 3 个当前加 1 个上一版的内联脚本哈希。
- `lambda --function-name gatu-terminal-api --execute`（14:06:34–14:06:43）：发布为版本 25，代码 47,750 字节。
- `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`：
  - 第一次（14:06:50–14:10:53）退出码 1：1,641 次上传成功，1 个文件（`assets/historicalOrders._address-Dw7jPxv9.js`）报 `Failed to connect to proxy URL: "http://127.0.0.1:6152"`，是本机代理瞬时断开。发布标记最后才上传，所以这时线上仍是 p40，`build-meta.json` 核对过。
  - 第二次（14:11:10–14:17:52）退出码 0：补传 11 个文件，0 次失败，结尾为 `Release markers match the local build: _shell.html, build-meta.json`。
- 失效：主网 `ET9CNVE6L1GWN` 的 `I5OVH672KOETRWIRL6466PB6PC`，测试网 `E3Q2SAX402CR9F` 的 `I1SFX9584UXBO48Q6TD5O80VF7`（约 14:18）。

## 验证与限制

- `verify`（失效约 90 秒后）：
  - `--origin https://app.sairn.ai --network mainnet` 15/15 ok；
  - `--origin https://testnet.sairn.ai --network testnet` 16/16 ok；
  - 两网 `build metadata parity` 都是 `766a8566 / cloudfront-2026-11-12-p41 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`。
- 发布后重读测试网的 `build-meta.json`，是 `766a8566 / cloudfront-2026-11-12-p41`。
- `csp-coverage.mjs https://app.sairn.ai`（14:20:08–14:22:19），结果来自解析完整 JSON 报告：33 步、0 违规、0 控制台错误，`scriptSrcViolations` 与 `otherViolations` 都为空，没有 report-only 头；跳过 2 步，与 p34–p40 相同；桌面 7 个面板，手机 3 个导航项。
- 运行时测试：没有在 `main` 上重跑全量终端 Vitest。`main` 的树等于 `dev` `810a45db`，#157 的 CI 在它上面通过；本机在 `be6db234` 的工作区跑过全量（9,930 项通过、1 项跳过），之后的 `3f6a1b0e` 只改了两个工作流和手册。
- 未做：
  - 真机验证。ADR 0050 针对的现象（iPhone 主屏幕应用隔一段时间再打开后长时间无数据）没有在可控环境里复现，线上是否改善要由运营方在手机上按原场景确认；
  - 白屏约 5 秒的原因确认，它不在这次改动范围内；
  - 真实钱包登录与下单、Safari、Firefox 与读屏；
  - Lambda 版本 25 的状态没有在发布后单独查询，发布命令返回时是 Pending；`verify` 的地区端点项通过说明它在提供服务。
- CHANGELOG 仍在 Unreleased 下，与 p33–p40 相同。发布日志在发布工作树旁边的 `p41-*.log`，没有入库。
- 发布工作树：`gatu-release-p41` 保留到下次发布；`gatu-release-p40` 是回滚产物；更早的可以删除，尚未删除。

## 后续与替代关系

- 运营方在手机上确认：主屏幕应用，蜂窝网络，放到后台几分钟后再打开，看数据多久回来；顺带在数量框里输入一个数再切后台，回来后数量还在就是恢复，被清空就是重载。
- 官网构建在 `dev` 与 `main` 上都失败：行情快照超过 7 天。需要运行 `markets:snapshot` 并处理此前周整理记录里提到的市场分类变化，另开任务。
- 发布构建里 `trade-terminal-page` 余 221、`vaults-page` 余 242、静态交易启动余 426。下一个会让这几块变大的改动，要先按手册第 8 节的发布预检规则测量。
- 删除 `gatu-release-p39` 及更早的发布工作树前，先问运营方。
- p40 的发布记录还在本地分支 `claude/release-p40-record`（`6c9e4d27`），没有推送。
- 本记录不替代此前的记录。
