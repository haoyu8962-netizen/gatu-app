<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-11-cloudfront-release-p30",
  "date": "2026-10-11",
  "title": "CloudFront 生产发布 p30：邮箱主网自动存款、无名默认 Agent、Link mobile device 修复，三个闸门全开",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding", "static-hosting", "pairing-release"],
  "summary": "用户要求把 dev 晋升到 main 并发布。先修复晋升 PR #96 两次失败的配对开启构建（PR #98：api-wallet 双 chunk、总量基线 3,304,479），再以 merge commit 晋升 main（ff11eee5）。运营方决定三个发布闸门默认全开且不再逐次询问。在仓库外工作树 gatu-release-p30 用 Node 22.15.0 构建 cloudfront-2026-10-11-p30（总量 3,307,832，配对开），按 functions → lambda（版本 14）→ sync（首次因本机代理瞬断两文件失败而中止、壳未上传，重跑后 Release markers 一致）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。线上自 p28 升到 p30，首次在生产打开移动配对；真实主网自动存款、真实外部钱包连接与真机配对清单均未做。",
  "thread": null,
  "baseCommit": "0c8980e5",
  "commits": ["ee4aab99", "0c8980e5", "ff11eee5"],
  "sources": [
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "docs/adr/0040-automatic-email-wallet-deposits.md"},
    {"path": "docs/work-memory/sessions/2026-10-11-codex-deposit-branch-review.md"},
    {"path": "docs/work-memory/sessions/2026-10-11-p30-pairing-build-budget-fix.md"},
    {"path": "docs/work-memory/sessions/2026-10-08-cloudfront-release-p28.md"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p30：邮箱主网自动存款、无名默认 Agent、Link mobile device 修复，三个闸门全开

## 背景与范围

同步记录，未取得任务标识（`thread: null`）。用户在合入 PR #97 后要求「把 dev 晋升到 main 并发布」。线上此前是 p28（`d74dd616`，2026-10-08）；p29 的晋升 PR #96 自 2026-10-10 起因配对开启构建失败一直未合，`gatu-release-p29` 工作树从未构建（本次删除）。时间均为 UTC。

## 结论与依据

**晋升前修复。** PR #96 在 `a310ade1` 与 `ee4aab99` 两次失败于 `Build terminal (pairing true)`：总量 +10,645 超 10,000 允许量、`api-wallet-*.js` 出现两个 chunk。根因与修复见[配对构建修复记录](2026-10-11-p30-pairing-build-budget-fix.md)（PR #98，`dev` `0c8980e5`）；在该分支手动触发的 `Production Builds` 配对开/关两项均通过。

**晋升。** [PR #96](https://github.com/zora4523-bot/gatu-app/pull/96)（`dev` → `main`，标题仍写 p29）在 `0c8980e5` 上七项 CI 全绿后以 merge commit 合入：`main` `ff11eee5`（15:08Z 前后）。PR 上有一条 2026-10-10 的 Codex 机器人 P2（手机已导入 Agent 且浏览器仍有 Privy 会话时切换网络会删除旧网络的 Mobile Agent，需重新扫码；`packages/hl-react/src/signing/agent-session.ts:54`，ADR 0039 代码），不涉及资金安全，未阻断发布。发布后核对：不成立。`session-provider.tsx` 的跨身份清理只在 `env` prop 原地变化时触发，而 `apps/terminal/src/providers/client-root.tsx:42-43` 把 `env` 算成模块级常量，切换网络一律 `window.location.reload()`（`use-global-settings-store.ts:122`、跨标签页同步 `:247`），新页面的 `previousRegistrationIdentityRef` 从 null 开始，不清理任何旧 owner；生产的主网与测试网还是不同主机名、localStorage 隔离。库层面若未来有调用方原地改 `env` 才会出现，已在 ADR 0039 注明。

**闸门。** 按手册第 8 节询问三个闸门，运营方答复「以后不要咨询了 … 全部开」。据此本次与今后默认：主网赞助充值=开、移动配对=开、主网银行卡入金=开，发布前不再逐次询问；手册、发布 README、`agent.md`、runtime-guardrails §8 与真机清单已随 PR #98 更新。移动配对首次在生产打开，真机清单仍未运行。

**构建。** 仓库外工作树 `gatu-release-p30`（`git worktree add --detach … origin/main`，`.env.local` 软链主检出、不读内容，Node 22.15.0、pnpm 10.21.0，`pnpm install --frozen-lockfile --prefer-offline`）。命令行显式写出：`SAIRN_BUILD_SHA=ff11eee51ff18624e9a62d0fc9a4200086e773e5 SAIRN_RELEASE_ID=cloudfront-2026-10-11-p30 VITE_HYPERLIQUID_TESTNET= VITE_MOBILE_PAIRING_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm build`，再 `pnpm --filter @sairn/terminal build:lambda`。442 个客户端 chunk 无环；总量 3,307,832 gzip（新基线 +3,353）、静态启动 1,636,892、手机运行时 118,411、桌面运行时 202,406、`api-wallet` 18,254（单 chunk）；Lambda 226,622 字节。`build-meta.json`：commit `ff11eee5`、release `cloudfront-2026-10-11-p30`、`mobileSync.enabled=true`、`cctpDeposits` 主网赞助 true / 测试网外部 true / 测试网赞助 false、`privyFiatFunding` 两网 true、图表入口 `charting_library.6d17e2dafb1007c4.js`（同 p28）。`verify-chart-build.mjs`（CI 参数）通过；产物 `assets/` 与 `_shell.html` 中无 `gatu.ai`、无 `sairn-dev`。

**发布。**
1. `functions --execute --origin https://app.sairn.ai`（15:16:43Z）：响应函数渲染 3 个当前 + 1 个上一版内联脚本哈希，请求/响应函数各发布一次，LIVE。
2. `lambda --function-name gatu-terminal-api --execute`（15:17:26Z）：版本 14。
3. `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（15:17:35Z）：闸门行 `sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`，边缘策略允许本构建全部 3 个内联哈希；上传 assets 时 `brand-motion.gen-BPcbLbvb.js` 与 `command-menu-OSFx0IPQ.js` 报 `Failed to connect to proxy URL: "http://127.0.0.1:6152"`（本机代理瞬断），命令退出 1，壳、`build-meta.json`、`sw.js` 尚未上传。此时对两条分发各做了一次失效（`I2Z14LMPZS5VJAQQXWKMQO8TD8`、`I2F6FDH2WMRD4T5BN0M1HH70EP`，只刷新旧内容，无害）。15:21:14Z 重跑同一命令：退出 0，补传 11 个对象（含壳、元数据、SW 与六个法律页壳副本），`Release markers match the local build: _shell.html, build-meta.json`；`head-object` 核对两个曾失败的资产大小与本地一致（3,846 / 2,593 字节）。
4. 失效：主网 `IHRZK8IEOAKMS2FR0CPT2GQWJ`（15:24:34Z）、测试网 `IDFEPV515W4K3U9ESHV1BCBN5Z`（15:24:36Z），15:24:59Z 均 Completed。

## 验证与限制

- `verify --network mainnet`：15/15 ok；`--network testnet`：16/16 ok。两网 `build metadata parity` 为 `ff11eee5 / cloudfront-2026-10-11-p30 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`；签名 `POST` allowed；geo 真实国家 SG；壳预加载 114 个链接；壳与图表 bundle 边缘命中。
- `csp-coverage.mjs https://app.sairn.ai`：33 步、2 步跳过（桌面 WalletConnect 文本与手机图表页按钮不可见，同前几次）、0 违规、0 控制台错误。
- 发布日志在会话暂存目录，未入库；本记录不含账户、密钥或完整 RPC 地址。
- 未做：真实邮箱钱包的主网自动存款（源链确认与 HyperCore 入账）；真实外部钱包的无名默认 Agent 建立连接；真机配对清单三行（RD-1..RD-3）。CHANGELOG 仍在 Unreleased 下，未切版本号。
- 发布工作树 `gatu-release-p30` 保留到下次发布供 verify 比对与回滚；`gatu-release-p28` 是回滚产物；`gatu-release-p29`（从未构建）已删除；`gatu-release-p26` 可删除。回滚到 p28 按 functions → lambda → sync → invalidate 重发其产物即可（p28 的闸门为配对关，需去掉 `--allow-mobile-pairing`）。

## 后续与替代关系

- 待做：真实主网自动存款验收（ADR 0040）、真实外部钱包建立连接验收（ADR 0038）、真机配对清单（ADR 0039，开关已在生产打开）。Codex 指出的切网删除导入密钥 P2 经核对不成立（见上）。
- 上一次发布记录：[p28](2026-10-08-cloudfront-release-p28.md)。
