<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-14-cloudfront-release-p32",
  "date": "2026-10-14",
  "title": "CloudFront 生产发布 p32：生产审计两批修复、自动统一账户",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding", "wallet-onboarding", "static-hosting", "pairing-release"],
  "summary": "运营方要求把 dev 晋升到 main 并发布。晋升 PR #112 的配对开启构建因总量 +10,160 超允许量失败，经 PR #113 重定总量与桌面运行时基线后八项 CI 全绿，以 merge commit 合入 main（9ccb88c0）。在仓库外工作树 gatu-release-p32 用 Node 22.15.0 构建 cloudfront-2026-10-14-p32（三个闸门全开，总量 3,314,565），按 functions → lambda（版本 16）→ sync（1,645 个文件，发布标记一致）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。线上自 p31 升到 p32。新账号自动统一账户、外部钱包存款未知结果、现货兑换 Max 等真实验收与真机配对清单均未做。",
  "thread": null,
  "baseCommit": "ab8896ef",
  "commits": ["f63def71", "f50e21a8", "43f3e5fa", "8c3e5eae", "ab8896ef", "9ccb88c0"],
  "sources": [
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "docs/work-memory/sessions/2026-10-13-production-readiness-audit.md"},
    {"path": "docs/work-memory/sessions/2026-10-13-p32-rebaseline.md"},
    {"path": "docs/work-memory/sessions/2026-10-12-automatic-unified-account.md"},
    {"path": "docs/work-memory/sessions/2026-10-12-cloudfront-release-p31.md"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p32：生产审计两批修复、自动统一账户

## 背景与范围

同步记录，未取得任务标识。运营方先后要求「还有哪些没合并到 dev 的一起合并了」「晋升到 main 并发布」「合并到 main」。线上此前是 p31（`74e69f77`，2026-10-12）。时间均为 UTC；发布编号按本地日期 2026-10-14，构建与发布实际发生在 2026-10-13 18:02–18:15Z。

## 结论与依据

**合并。** p31 之后进入 `dev` 的 PR：[#106](https://github.com/zora4523-bot/gatu-app/pull/106)（p31 发布记录与 CI 清单）、[#107](https://github.com/zora4523-bot/gatu-app/pull/107)（ADR 0041 新账号自动统一账户，`6525fd04`）、[#108](https://github.com/zora4523-bot/gatu-app/pull/108)（生产审计第一批修复，`f63def71`）、[#109](https://github.com/zora4523-bot/gatu-app/pull/109)（第二批修复，`f50e21a8`），纯文档 [#110](https://github.com/zora4523-bot/gatu-app/pull/110)（ADR 0041 补记，`43f3e5fa`）、[#111](https://github.com/zora4523-bot/gatu-app/pull/111)（Codex 周整理记录的 cherry-pick，`8c3e5eae`），以及 [#113](https://github.com/zora4523-bot/gatu-app/pull/113)（重定基线，`ab8896ef`）。清点时远端没有其它未合并分支或开着的 PR。

**晋升。** [PR #112](https://github.com/zora4523-bot/gatu-app/pull/112)（`dev` → `main`）首轮 `Build terminal (pairing true)` 失败：总量 3,314,639，比基线多 10,160（允许 10,000），其余七项通过。按[重定基线记录](2026-10-13-p32-rebaseline.md)把总量基线定为固定身份配对关构建的 3,311,757、桌面运行时 202,683（PR #113 合入 `dev` 后 #112 自动重跑），八项 CI 全绿，以 merge commit 合入：`main` `9ccb88c0`。运营方当日说「Codex 的先不用管」，机器人评论不再作为合并前置。

**闸门。** 按运营方 2026-10-11 的决定，三个闸门默认全开，未再询问。

**构建。** 仓库外工作树 `gatu-release-p32`（从 `origin/main` 检出 `9ccb88c0`，`.env.local` 软链主检出、不读内容，Node 22.15.0、pnpm 10.21.0，依赖按锁文件安装、与 `main` 无依赖差异）。命令行显式写出：`SAIRN_BUILD_SHA=9ccb88c0066d8083fc43371b5286d8a81d91183b SAIRN_RELEASE_ID=cloudfront-2026-10-14-p32 VITE_HYPERLIQUID_TESTNET= VITE_MOBILE_PAIRING_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm build`，再 `build:lambda`。443 个客户端 chunk 无环、预渲染 1 页；总量 3,314,565 gzip（新基线 +2,808）、静态启动 1,641,984、手机运行时 118,305、桌面运行时 202,539（−144）、`api-wallet` 18,166（单 chunk）；Lambda `index.mjs` 229,446 字节。`build-meta.json`：commit `9ccb88c0`、release `cloudfront-2026-10-14-p32`、`mobileSync.enabled=true`、`cctpDeposits` 主网赞助 true / 测试网外部 true / 测试网赞助 false、`privyFiatFunding` 两网 true、图表入口 `charting_library.6d17e2dafb1007c4.js` 同 p31。`node deploy/verify-chart-build.mjs apps/terminal/public apps/terminal/.output/public deploy/manifests/tradingview-charting-library.json` 退出码 0（前两次因传错清单路径报错，不是产物问题）；产物中无 `gatu.ai`。

**发布。**
1. `functions --execute --origin https://app.sairn.ai`（18:04:37Z）：3 个当前 + 1 个上一版内联脚本哈希，`gatu-terminal-request` 与 `gatu-terminal-response` 两个函数 LIVE。
2. `lambda --function-name gatu-terminal-api --execute`（18:05:29Z）：版本 16。
3. `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（18:05:51Z–18:09:08Z）：闸门行 `sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`，1,645 个文件上传、0 个失败，`Release markers match the local build: _shell.html, build-meta.json`。
4. 失效：主网 `IAQ4F45ZPV5ZGBI63UW9XVG7OD`（18:09:30Z）、测试网 `I3W2W42UE6RXN465WCWPJQ0OA1`（18:09:33Z），18:12Z 前均 Completed。

## 验证与限制

- `verify --network mainnet`（18:11:10Z）：15/15 ok；`--network testnet`（18:12:46Z）：16/16 ok。两网 `build metadata parity` 为 `9ccb88c0 / cloudfront-2026-10-14-p32 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`；签名 `POST` allowed；壳预加载 115 个链接；壳与图表 bundle 边缘命中。
- `csp-coverage.mjs https://app.sairn.ai`（18:13:03Z–18:15:14Z）：33 步、2 步跳过（桌面 WalletConnect 与手机图表页，同前几次）、0 违规、0 控制台错误；桌面 7 个面板、手机 3 个导航项可用。
- 发布日志在会话暂存目录，未入库。
- 未做：新邮箱账号入金后自动变为统一账户、新外部钱包账号建立 Agent 后同样（ADR 0041）；外部钱包存款在钱包报错时的「状态未知」提示；现货兑换 Max 的真实点击；真实邮箱钱包的主网自动存款；真机配对清单 RD-1..RD-3。CHANGELOG 仍在 Unreleased 下。
- 发布工作树 `gatu-release-p32` 保留到下次发布；`gatu-release-p31` 是回滚产物；`gatu-release-p30`、`gatu-release-p28`、`gatu-release-p26` 可删除。

## 后续与替代关系

- 待做：上面的真实验收。
- 上一次发布记录：[p31](2026-10-12-cloudfront-release-p31.md)。
