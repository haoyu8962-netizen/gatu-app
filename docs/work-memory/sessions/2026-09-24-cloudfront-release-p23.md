<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-cloudfront-release-p23",
  "date": "2026-09-24",
  "title": "CloudFront 生产发布 p23：main 121e8e76，主网赞助充值开、移动配对关",
  "kind": "task",
  "status": "verified",
  "topics": [
    "pr-review",
    "docs-governance"
  ],
  "summary": "用户要求推送 codex/reviewceshi、向 dev 开 PR、晋升 main 并发布。PR #40 五项检查通过后以 merge commit 合入 dev（42237b04）；PR #41 八项检查（含四种配对组合构建）通过后合入 main（121e8e76）。临时工作树从 main 构建 cloudfront-2026-09-24-p23，环境文件只软链不读取，命令行强制关闭移动配对、按用户选择保持主网赞助充值开启并带确认参数上传。函数、Lambda、同步、两条分发失效退出码全 0；主网 15 项、测试网 16 项 verify 全部 ok；CSP 覆盖三个汇总数组为空。市价平仓相关改动发布前没有真实钱包验收。",
  "thread": null,
  "baseCommit": "42237b04",
  "commits": [],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/work-memory/sessions/2026-09-21-cloudfront-release-p22.md" },
    { "path": "docs/work-memory/sessions/2026-09-24-gpt6-review-market-close-host-fixes.md" }
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p23：main 121e8e76，主网赞助充值开、移动配对关

## 背景与范围

同步记录。2026-09-24 用户要求「推送并向 dev 开 PR，并且合并到主分支 部署到生产环境」。分支 `codex/reviewceshi` 含本轮审查修复（见 [GPT-6 astra 对抗审查记录](2026-09-24-gpt6-review-market-close-host-fixes.md) 及其前序记录）。发布前线上为 `246c57bc` / `cloudfront-2026-09-21-p22`，闸门 `sponsored-mainnet-deposits=on mobile-pairing=off`。

## 结论与依据

**合并。** 分支先合入 `origin/dev`（冲突只在 `docs/work-memory/INDEX.md`，用 `pnpm memory:index` 重新生成；`memory:check`、`memory:test` 8/8 通过），推送后开 PR #40 → `dev`：Static Checks、Terminal Tests、浏览器回归两分片、生产构建 `false/false` 全部通过，以 merge commit 合入（`dev` `42237b04`）。随后 PR #41 `dev` → `main`：八项检查（含 `false/true`、`true/false`、`true/true` 三种额外配对组合构建）全部通过，以 merge commit 合入（`main` `121e8e76`）。`dev` 相对 p22 只多了 #39（p22 记录）与 #40。

**发布闸门由用户确认**：主网赞助充值「保持开启（与线上 p22 一致）」；移动配对保持关闭。

**构建。** 临时工作树先检出 `origin/dev` 安装依赖，再切到 `origin/main` 的 `121e8e76`；主检出的 `apps/terminal/.env.local` 只软链、未读取内容；Node 22.15.0，`pnpm install --frozen-lockfile`。命令行环境变量同 p22：`GATU_BUILD_SHA=121e8e76…`、`GATU_RELEASE_ID=cloudfront-2026-09-24-p23`、两个 `VITE_MOBILE_PAIRING_*=false`、`VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true`、`VITE_HYPERLIQUID_TESTNET` 置空、`VITE_HYPERLIQUID_AGENT_NAME=gatu`。`pnpm build` 与 `build:lambda`（225.77 kB）通过。`build-meta.json`：`mobileSync` 两项 `false`；`cctpDeposits.mainnetSponsoredWallet` `true`，测试网两项 `true`（来自环境文件，脚本只记录）。不打印值的核对：产物 assets 中没有 `gatu-dev`；产物中的 Privy 应用 ID 在四个同名前缀的线上 chunk（`client-root`、`portfolio-margin`、`trade-terminal-page`、`wagmi`）里都能找到。

**执行**（profile `gatu-edge`，`sts get-caller-identity` 为受限 IAM 用户 `gatu-edge`）：演练 `functions`（11 个当前 + 7 个上一版内联脚本哈希）与 `sync --allow-sponsored-mainnet-deposits`（`release gates: sponsored-mainnet-deposits=on mobile-pairing=off`，无警告，无 `--delete`）；随后 `functions --execute --origin https://app.gatu.ai`、`lambda --function-name gatu-terminal-api --execute`、`sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --execute`（上传前核对「The live edge policy allows all 11 inline script hashes of this build」）、`invalidate` `ET9CNVE6L1GWN`（主网）与 `E3Q2SAX402CR9F`（测试网）：退出码全部 0。

**验证。** 约 80 秒后 `verify --origin https://app.gatu.ai --network mainnet` 15 项全部 `ok`（build metadata parity `121e8e76 / cloudfront-2026-09-24-p23 / sponsored-mainnet-deposits=on mobile-pairing=off`、geo 真实判定 SG、签名 Lambda POST、7 页 28 段内联脚本 enforce、壳预加载 112 条、壳与图表包边缘命中）；`--origin https://testnet.gatu.ai --network testnet` 16 项全部 `ok`。`node apps/terminal/tests/browser/csp-coverage.mjs https://app.gatu.ai` 退出码 0，`scriptSrcViolations`、`otherViolations`、`consoleErrors` 均为空；本会话只保留了输出末尾 30 行，可见的跳过步骤是 mobile chart page（找不到 Chart 页签），总步数与其他跳过项未留存。

## 验证与限制

- 以上均为发布机本地执行与脚本输出，未连接钱包；无真机、多地区验收。
- **PR #40 的市价平仓页面级提交宿主、点击即封存、离开页面失败关闭，以及选项点击区与 TP/SL 部分成交提示，发布前没有用真实钱包验收**（真实签名、真实成交、真机触控、浏览器实测离开页面场景均未执行）。
- 未显式设置的非闸门开关沿用环境文件里的值，本次没有核对；`build-meta.json` 不记录它们。
- 没有打 `cloudfront-*` 标签，与 p21/p22 相同。
- 回滚：同步不删除旧对象，桶开启版本控制；以 `246c57bc` 重新构建后 `functions` → `sync` → `invalidate`，或用桶版本恢复 `_shell.html`、文档页与 `build-meta.json`。

## 后续与替代关系

- 不替代任何记录；接续 [p22](2026-09-21-cloudfront-release-p22.md)。
- 待用户：市价平仓与订单表单改动的测试网 / 主网小额真实钱包验收；`user-menu-recovery` 是否入 CI。
