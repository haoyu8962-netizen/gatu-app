<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-08-cloudfront-release-p28",
  "date": "2026-10-08",
  "title": "CloudFront 生产发布 p28：存款按需切链、订单按钮不再要求切到 Arbitrum、gatu.ai 域名组退役（阶段 5.1）",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding", "static-hosting", "brand-identity"],
  "summary": "用户要求把最新代码部署到生产。先把 #80（存款按数字比较链 ID、点击存款时按需切链；订单按钮去掉 Switch to Arbitrum 预拦截，外部钱包签名客户端按连接自身的链取用）、#73（gatu.ai 域名组与过渡头退役，p25 清理代码）、#79（agent 文档迁入仓库）合入 dev，晋升 PR #87 七项 CI 全绿合入 main（d74dd616）。发布前核对切换方案阶段 5.1 前提：三条分发都没有 gatu.ai 别名，API 源站请求策略含 X-Sairn-Forwarded-Host（ETag ETVPDKIKX0DER 未变）。在仓库外工作树 gatu-release-p28 用 Node 22.15.0 从 d74dd616 构建 cloudfront-2026-10-08-p28（开关同 p27），按 functions → lambda（版本 13）→ sync（闸门 sponsored-mainnet-deposits=on mobile-pairing=off mainnet-card-funding=on，1,643 个文件，发布标记一致）→ 两次失效 → verify 主网 15/15、测试网 16/16（签名 POST allowed）→ csp-coverage 33 步 0 违规。线上不再识别 gatu 主机；阶段 5.2–5.4 的线上步骤未做；真机验收未做。",
  "thread": null,
  "baseCommit": "90762177",
  "commits": ["4c3041bd", "d6033daf", "90762177", "d74dd616"],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "path": "docs/sairn-domain-cutover-plan.md" },
    { "path": "docs/adr/0032-gatu-offline-cutover-to-sairn.md" },
    { "path": "docs/work-memory/sessions/2026-10-08-deposit-on-demand-chain-switch.md" },
    { "path": "docs/work-memory/sessions/2026-10-03-retire-gatu-domain-group.md" },
    { "path": "docs/work-memory/sessions/2026-10-08-cloudfront-release-p27.md" }
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p28：存款按需切链、订单按钮不再要求切到 Arbitrum、gatu.ai 域名组退役（阶段 5.1）

## 背景与范围

同步记录，未取得任务标识（`thread: null`）。用户先要求把「未合并的 PR 一起合并」，再要求「把 dev 合并到 main」，最后要求「部署最新的代码到生产环境」。线上此前是 p27（`6ff8ee75`，2026-10-08 11:11Z 构建）。

## 结论与依据

**合并。**
- [PR #80](https://github.com/zora4523-bot/gatu-app/pull/80)（`claude/arbitrum-network-connection-issue-8325cd`）：合并前 `dev` 连动四次（#78、#81、#83、#84、#86），每次重新并入；#78 把本分支删除的 `wrong-network-screen.tsx` 又引用进资金弹层滚动契约、浏览器夹具与 Playwright 用例，合并时一并清掉，并给 2026-10-05 的记录来源列表加了更正；棘轮基线按两边变化合并（圆角 200、字号 112、重要表面 12）。CI 偶发一次 `notifications.pw.ts:88` 30 秒超时（前两次运行与 `dev` 最近四次都过），重跑前 `dev` 已再动，直接再并一次。六项 CI 全绿后 merge commit `4c3041bd`（12:49Z）。
- [PR #73](https://github.com/zora4523-bot/gatu-app/pull/73)：用户原定 2026-10-09 之后再合，本次按用户指示「一起合并了」提前合入：标记 ready，CI 六项全绿、可合并，merge commit `d6033daf`。
- [PR #79](https://github.com/zora4523-bot/gatu-app/pull/79)：落后 `dev` 75 个提交，在其工作树（无活动进程）并入 `dev`：`docs/README.md`、`docs/adr/README.md` 取分支侧刷新后的状态文字并把 0032 行补上 #73 合入 dev；`docs/funds-dialog-outcome-plan.md` 保留分支的补记行并接上 `dev` 新增的「存款前按需切链」一节；索引重新生成。两项 CI 通过，merge commit `90762177`（13:14Z）。
- 晋升 [PR #87](https://github.com/zora4523-bot/gatu-app/pull/87)（`dev` → `main`）：七项 CI 全绿（含配对开关打开的生产构建），merge commit `d74dd616`（14:01Z）。

**发布前提（切换方案阶段 5.1）。** 用 `gatu-edge` 身份只读核对：`ET9CNVE6L1GWN` 别名只有 `app.sairn.ai`，`E3Q2SAX402CR9F` 只有 `testnet.sairn.ai`，`EP2DIBP3T7M3G` 只有 `sairn.ai`、`www.sairn.ai`；API 源站请求策略 `b4401266-…` 的头白名单含 `X-Sairn-Forwarded-Host`（也仍含 `X-Gatu-Forwarded-Host`），ETag `ETVPDKIKX0DER` 与 0.6 的记录一致。`gatu-edge` 没有 `ListOriginRequestPolicies` 权限，策略 ID 从分发配置的缓存行为里读出。

**构建。** 仓库外新工作树 `gatu-release-p28`（`git worktree add --detach … d74dd616`，`.env.local` 只软链到主检出、不读内容，Node 22.15.0，`pnpm install --frozen-lockfile` 1 分 6 秒）。命令行显式写出：`SAIRN_BUILD_SHA=d74dd616… SAIRN_RELEASE_ID=cloudfront-2026-10-08-p28 VITE_HYPERLIQUID_AGENT_NAME=sairn VITE_HYPERLIQUID_TESTNET= VITE_MOBILE_PAIRING_ENABLED=false VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm build`，再 `build:lambda`。总量 3,297,313 gzip（基线 +214）、静态启动 1,633,042、手机运行时 118,512、桌面运行时 202,746；Lambda 225,771 字节。`build-meta.json`：commit `d74dd616`、release `cloudfront-2026-10-08-p28`、`cctpDeposits` 与 `privyFiatFunding` 同 p27、`mobileSync` 关、图表入口 `charting_library.6d17e2dafb1007c4.js`（同 p27）。`verify-chart-build.mjs` 通过；产物中无 `sairn-dev` 槽位，`assets/` 与 `_shell.html` 中无 `gatu.ai`。

**发布（UTC）。**
1. `functions --execute --origin https://app.sairn.ai`：请求函数、响应函数各发布一次，LIVE 14:16:31Z。
2. `lambda --function-name gatu-terminal-api --execute`：版本 13。
3. `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mainnet-card-funding --execute`：闸门行 `sponsored-mainnet-deposits=on mobile-pairing=off mainnet-card-funding=on`，1,643 个文件上传，`Release markers match the local build: _shell.html, build-meta.json`。输出整段写入日志文件后再读，没有接 `grep | tail` 链。
4. 失效：主网 `IBB9UGXUVMYJ21KIDSMGQFWOD2`（14:20:44Z 建，14:21:01Z 完成），测试网 `IAIOIA1X77BWD149NCMF7DN5FO`（14:20:47Z 建，14:21:14Z 完成）。

## 验证与限制

- `verify --network mainnet`：15/15 ok；`--network testnet`：16/16 ok。两网 `build metadata parity` 为 `d74dd616 / cloudfront-2026-10-08-p28 / sponsored-mainnet-deposits=on mobile-pairing=off mainnet-card-funding=on`；签名 `POST /api/referral-geo` 为 allowed（阶段 5.1 的验证条件）；geo 真实国家 SG；壳与图表 bundle 边缘命中。
- `csp-coverage.mjs https://app.sairn.ai`：33 步、2 步跳过（手机图表页按钮不可见、同前几次）、0 违规、0 控制台错误。
- 发布工作树 `gatu-release-p28` 保留到下次发布供 verify 比对与回滚；`gatu-release-p26` 是 p27 的回滚产物（见 p27 记录），`gatu-release-p24`、`gatu-release-p25` 可删除。回滚注意：线上自 p28 起不再识别 gatu 主机，回滚到 p27 产物按 functions → lambda → sync → invalidate 重发即可，源站请求策略仍含 `X-Gatu-Forwarded-Host`。
- 未做：真机验收（存款切链的三种情形、外部钱包在未配置链上 Enable Trading、邮箱与外部钱包各开一次存款弹窗）；阶段 5.2（白名单删除 `X-Gatu-Forwarded-Host`、摘除临时策略）、5.3（Lambda 环境变量改名）、5.4（删除 gatu 证书）都没有做，需要用户确认后分别执行；CHANGELOG 仍在 Unreleased 下，没有为本次发布切版本号。
- 本机另一会话同时在跑全量测试时，`pnpm` 命令被阻塞、`tsc` 极慢，验证改为直接调用 `node_modules/.bin` 下的 `tsc` / `vitest`；这不影响发布命令（`deploy.mjs` 直接用 node 调用）。

## 后续与替代关系

- 阶段 5.2–5.4 待用户确认后执行；5.1 已完成，切换方案与 ADR 0032 的状态已随本记录更新。
- 上一次发布记录：[p27](2026-10-08-cloudfront-release-p27.md)。
