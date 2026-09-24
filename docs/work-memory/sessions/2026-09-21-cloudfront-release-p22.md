<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-cloudfront-release-p22",
  "date": "2026-09-21",
  "title": "CloudFront 生产发布 p22：main 246c57bc，主网赞助充值开、移动配对关",
  "kind": "task",
  "status": "verified",
  "topics": [
    "market-recovery",
    "docs-governance"
  ],
  "summary": "产品负责人要求把 dev 晋升到 main 并发布到线上。PR #38 以 merge commit 合入 main（246c57bc，九项检查含四种配对组合构建全部通过）。在干净的临时工作树从 main 构建 cloudfront-2026-09-21-p22：环境文件只软链不读取，命令行强制关闭移动配对、按产品负责人的选择打开主网赞助充值并在上传时带确认参数。按日常发布顺序执行函数、Lambda、同步、两条分发失效，主网 15 项与测试网 16 项 verify 全部 ok，浏览器 CSP 覆盖 32 步零违规。PR #37 的交易与资金弹层发布前没有做真实钱包验收。",
  "thread": null,
  "baseCommit": "23c106c2",
  "commits": [],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "path": "deploy/env.build.example" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "docs/work-memory/sessions/2026-09-17-cloudfront-release-p21.md" }
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p22：main 246c57bc，主网赞助充值开、移动配对关

## 背景与范围

同步记录。2026-09-21 产品负责人依次要求：合并 PR #37 到 `dev`、「请合并到 main」、「请发布到线上」。发布前线上为 `c59d13a8` / `cloudfront-2026-09-17-p21`（其 `build-meta.json` 是旧格式，没有 `cctpDeposits` 字段，看不出当时主网赞助充值是否开启）。

## 结论与依据

**晋升。** PR #38（`dev` `23c106c2` → `main`，103 个提交，无冲突）九项检查全部通过，含 `false/false`、`false/true`、`true/false`、`true/true` 四种移动配对组合的生产构建；以 merge commit 合入，`main` 为 `246c57bc`。

**发布前由产品负责人决定的两件事**（经提问确认）：主网赞助充值闸门「打开」；构建环境「沿用 `.env.local`，命令行强制关开关」。

**构建。** 临时工作树检出 `origin/main`，把主检出的 `apps/terminal/.env.local` 软链进去，未读取其内容；Node 22.15.0，`pnpm install --frozen-lockfile`。命令行环境变量（Vite 中进程环境优先于 `.env` 文件）：`GATU_BUILD_SHA`（完整提交）、`GATU_RELEASE_ID=cloudfront-2026-09-21-p22`、两个 `VITE_MOBILE_PAIRING_*` 为 `false`、`VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true`、`VITE_HYPERLIQUID_TESTNET` 置空、`VITE_HYPERLIQUID_AGENT_NAME=gatu`。`pnpm build` 与 `build:lambda` 退出码 0；411 个 chunk 无循环依赖，总 gzip 3,098,661 B（较基线 −56,046）。`build-meta.json`：`mobileSync` 两项 `false`；`cctpDeposits.mainnetSponsoredWallet` `true`，测试网两项 `true`（来自环境文件，脚本只记录、不要求确认）。不打印值的核对：产物里没有 `gatu-dev` 槽位名；产物中的 Privy 应用 ID 与线上现行包里的一致。

**执行**（`deploy/cloudfront/README.md`「日常发布」顺序，profile `gatu-edge`，`sts get-caller-identity` 为受限 IAM 用户而非 root）：先不带 `--execute` 演练（函数轮换 11 个当前 + 7 个上一版内联脚本哈希；`release gates: sponsored-mainnet-deposits=on mobile-pairing=off`，无警告，同步不含 `--delete`），随后 `functions --execute --origin https://app.gatu.ai`、`lambda --function-name gatu-terminal-api --execute`、`sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --execute`、`invalidate` 主网与测试网两条分发：退出码全部 0。

**验证。** 约 75 秒后 `verify --origin https://app.gatu.ai --network mainnet` 15 项全部 `ok`（build metadata parity `246c57bc / cloudfront-2026-09-21-p22 / sponsored-mainnet-deposits=on mobile-pairing=off`、geo 真实判定、签名 Lambda POST、7 页 28 段内联脚本 enforce、壳预加载 99 条、壳与图表包边缘命中）；`--origin https://testnet.gatu.ai --network testnet` 16 项全部 `ok`。`node apps/terminal/tests/browser/csp-coverage.mjs https://app.gatu.ai`：32 步，`scriptSrcViolations`、`otherViolations`、`consoleErrors` 均为空；两步因找不到目标控件而跳过（desktop walletconnect、mobile chart page）。

## 验证与限制

- 以上均为发布机本地执行与脚本输出，未连接钱包；无真机、多地区验收。
- **PR #37 的交易与资金弹层（划转、发送、提现、充值、金库、质押、推荐、下单确认等）发布前没有用真实钱包验收**，也没有人在真实页面上复拖过 `60ad757a` 之后的滑杆。验收清单见 `docs/funds-dialog-outcome-plan.md`「验证标准」。发布前已多次向产品负责人说明这一点。
- 未显式设置的非闸门开关（`VITE_LIFI_BRIDGE_CREATE_ENABLED`、`VITE_PORTFOLIO_MARGIN_ACTIVATION_ENABLED`、`VITE_COMPACT_ORDERBOOK_L2_ENABLED`、`VITE_ETHEREUM_RPC_URL`）沿用环境文件里的值，本次没有核对；`build-meta.json` 不记录它们。
- 浏览器 Service Worker 会让已打开过站点的用户在第一次导航时仍看到上一版壳（README 已说明），未做跨版本首次导航验证。
- 没有打 `cloudfront-*` 标签：仓库里此前没有这类标签，打标签还会触发一轮完整的生产构建。
- 回滚：同步不删除旧对象，桶开启版本控制；以 `c59d13a8` 重新构建后 `functions` → `sync` → `invalidate`，或用桶版本恢复 `_shell.html`、文档页与 `build-meta.json`。

## 后续与替代关系

- 不替代任何记录；接续 `2026-09-17-cloudfront-release-p21.md`。
- 待产品负责人：真实钱包测试网与主网小额验收；决定是否需要把发布用环境值整理成独立的环境文件，避免再依赖开发机的 `.env.local`。
- 下一次发布先查：`deploy/cloudfront/README.md`「发布闸门」、线上 `build-meta.json`。
