<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-02-cloudfront-release-p36",
  "date": "2026-11-02",
  "title": "CloudFront 生产发布 p36（全功能审查 P1、P2 与两组确认修复）",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting"],
  "summary": "运营方要求「请部署最新的代码到生产环境」。合并前在仓库外工作树 gatu-release-p36 按发布配置预检 dev 26c06d02：总量比基线多 9,913，只剩 87 字节余量；打包开关与 p35 产物一致。晋升 PR #133（dev→main，含 #129 的 P1 第一批与 P2 批次、#131、#132）八项 CI 全绿（含配对开启构建），Codex 机器人无发现，运营方点「继续发布」后以 merge commit 合入 main（047b4bb3，代码树与 26c06d02 相同）。用 Node 22.15.0 构建 cloudfront-2026-11-02-p36（三个闸门全开，总量 3,375,833，比基线 +9,632），按 functions → lambda（版本 20）→ sync（1,652 次上传、0 失败、发布标记一致）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规发布。真实钱包、真机与本批修复的线上逐项验收未做。",
  "thread": null,
  "baseCommit": "cdb47637",
  "commits": ["26c06d02", "047b4bb3"],
  "sources": [
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"path": "docs/work-memory/sessions/2026-10-28-cloudfront-release-p34.md"},
    {"path": "docs/work-memory/sessions/2026-10-31-p2-integration.md"},
    {"path": "docs/work-memory/sessions/2026-11-01-audit-confirmed-fixes.md"},
    {"path": "docs/work-memory/sessions/2026-11-01-audit-group2.md"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p36（全功能审查 P1、P2 与两组确认修复）

## 背景与范围

同步记录，未取得任务标识。PR #132 合入 `dev` 后，运营方要求「请部署最新的代码到生产环境」。agent 理解为：开 `dev` → `main` 晋升 PR，CI 全绿后以 merge commit 合入，再从 `main` 构建并部署，三个闸门按惯例全开；并在回复里说明了这个理解。晋升 PR 开出后，运营方点了「继续发布」。线上此前是 p35（`cdb47637`）。时间均为 UTC；发布号按本地日期（UTC+8）取 `2026-11-02`。

## 结论与依据

**晋升内容。** [PR #133](https://github.com/zora4523-bot/gatu-app/pull/133)（`dev` `26c06d02` → `main`）相对 `cdb47637` 有 155 个提交、388 个文件，包括：
- [#129](https://github.com/zora4523-bot/gatu-app/pull/129)：全功能审查 P1 第一批（[#123](https://github.com/zora4523-bot/gatu-app/pull/123)–[#128](https://github.com/zora4523-bot/gatu-app/pull/128)）与 P2 批次的集成。
- [#131](https://github.com/zora4523-bot/gatu-app/pull/131)：确认问题的第一组修复。
- [#132](https://github.com/zora4523-bot/gatu-app/pull/132)：第二组修复。

本次不包含：
- [#130](https://github.com/zora4523-bot/gatu-app/pull/130)（CI 晋升覆盖）：晋升之后才合入 `dev`（`e9d20e48`）。
- 语言链接的 Service Worker 修复与 p35 记录：在 [#134](https://github.com/zora4523-bot/gatu-app/pull/134)，当时未合并。

**预检。** 包体余量很紧：#132 的 CI 构建（配对关闭）总量已比基线多 6,633，而配对开启约再多 2,200 到 2,500 字节，发布构建带 `.env.local` 又约多 530 字节。所以开晋升 PR 之前，先在仓库外工作树 `gatu-release-p36` 检出 `26c06d02`，用发布配置构建了一次：`.env.local` 软链、不读内容，开关全部在命令行写出，与下文相同。结果：
- 总量 3,376,114，比基线多 9,913，允许 10,000，只剩 87 字节。
- 交易启动 +9,216；手机运行时 119,777（+9,197）；桌面运行时 204,597（+1,914）。
- 打包进去的 `VITE_*` 与 p35 产物逐项一致，只差提交号、构建时间和发布号。非布尔值只比较 SHA-256 前缀，Privy 应用 ID 相同。
- 构建身份在 5 个 chunk 里各出现一次，换成 `main` 的提交号只会让总量变动十几字节。
- `functions`、`lambda`、`sync` 空跑（不带 `--execute`）正常，闸门行三项 on。
- `gatu-edge` 身份可用（`sts get-caller-identity` 只看了用户名）。

**晋升 CI 与合并。** #133 于 16:54 开出，八项 CI 全部通过，包括只在进 `main` 的 PR 上运行的配对开启构建；`chatgpt-codex-connector` 审查 `26c06d0` 后没有留下意见。17:15:42 以 merge commit 合入（`--match-head-commit 26c06d02…`）。`main` = `047b4bb3`，父提交 `cdb47637` 与 `26c06d02`，代码树与 `26c06d02` 完全相同（`git diff` 0 行）。

**构建。** 工作树切到 `047b4bb3`，先按锁文件重装一次依赖。用 Node 22.15.0、pnpm 10.21.0，命令行写出 `SAIRN_BUILD_SHA=047b4bb3… SAIRN_RELEASE_ID=cloudfront-2026-11-02-p36 VITE_HYPERLIQUID_TESTNET= VITE_MOBILE_PAIRING_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm build`，同一组变量下再跑 `build:lambda`。结果：
- 450 个 chunk，无循环静态导入。
- 总量 3,375,833 gzip，比基线 3,366,201 多 9,632，允许 10,000，余 368。
- 交易页静态启动 1,653,073（+9,144）；手机运行时 119,765（+9,185，余 815）；桌面运行时 204,505（+1,822）。
- 壳里 118 个共有预加载，另有 15 个仅桌面；内联脚本哈希 3 个。
- Lambda `index.mjs` 229.44 kB，含本次提交号。
- `build-meta.json` 的提交、release 与三个闸门正确；图表入口 `charting_library.6d17e2dafb1007c4.js` 与 p35 相同；`verify-chart-build.mjs`（传入 `deploy/manifests/tradingview-charting-library.json`）退出码 0。
- 打包开关与 p35 一致（同预检）；产物不含 `gatu.ai`。

**发布。**
- `functions --execute --origin https://app.sairn.ai`（17:18:54–17:19:17）：3 个当前加 1 个上一版内联脚本哈希，两个函数都发布到 LIVE。
- `lambda --function-name gatu-terminal-api --execute`：版本 20（17:19:32），`$LATEST` 为 Active / Successful。
- `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute` 一次成功：
  - 闸门行三项 on；1,652 次上传，0 失败。日志里 9 行含 `error` 的都是文件名。
  - 六个 `<route>/index.html` 已用本次的壳覆盖。
  - 结尾输出 `Release markers match the local build: _shell.html, build-meta.json`。
- 失效：主网 `ET9CNVE6L1GWN` 的 `I1DVRBUJAZPK51V4ZJ5JUDQ1VG`，测试网 `E3Q2SAX402CR9F` 的 `I5P8AU98S56R9LC33C70QMGH5G`。两条都在 17:24:4x 创建，17:26 查询时都已 Completed。

## 验证与限制

- `verify --origin https://app.sairn.ai --network mainnet`：15/15 ok；`--origin https://testnet.sairn.ai --network testnet`：16/16 ok。
  - 两网 `build metadata parity` 都是 `047b4bb3 / cloudfront-2026-11-02-p36 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`。
  - 壳预加载 117 个链接；内联脚本 3 个，策略为 enforce。
  - 地区判定读到的是本机出口 IP 所在国家。
- `csp-coverage.mjs https://app.sairn.ai`（17:26–17:29），完整读过输出：
  - 33 步、0 违规、0 控制台错误，`scriptSrcViolations` 与 `otherViolations` 都为空。
  - 跳过 2 步（桌面 WalletConnect、手机图表页），与 p34、p35 相同。
  - 桌面 7 个面板，手机 3 个导航项。
- 运行时测试：没有在 `main` 上重跑全量终端 Vitest。代码树与 #132 的头 `01e1e5b5` 相同；那次全量 714 个文件中 711 个通过、1 个跳过，2 个失败都是本机环境误报（见 [audit-group2 记录](2026-11-01-audit-group2.md)）。
- 未做：
  - 本批修复的线上逐项验收：下单、改单、历史表、金库、发送与兑换、订单簿、现货显示名等。
  - 真实钱包登录、存款与下单。
  - Safari、Firefox、真机与读屏。
- CHANGELOG 仍在 Unreleased 下，与 p33–p35 相同。发布日志在会话暂存目录，未入库。
- 发布工作树：`gatu-release-p36` 保留到下次发布；`gatu-release-p35` 是终端回滚产物；`gatu-release-p34` 及更早的可以删除（未删除）。

## 后续与替代关系

- **包体余量**：总量只剩 368 字节（发布构建口径，带 `.env.local`），手机运行时 815。下一个增加客户端包体的 PR 很可能要先按 [性能基线](../../terminal-performance-baseline.md) 的复现规则重定基线，否则晋升或发布构建会失败。
- **待做**：上面列出的线上验收。#134（语言链接修复与 p35 记录）与 #135（文档记录）合并后，随下一次晋升发布。#130 的晋升覆盖要在下一次真实晋升 PR 上确认。
- **上一次终端发布记录**：p35，`docs/work-memory/sessions/2026-10-28-cloudfront-release-p35-link-language.md`。本记录写成时它还在 #134 里，没进 `dev`。
