<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-cloudfront-release-p21",
  "date": "2026-09-17",
  "title": "生产发布 cloudfront-2026-09-17-p21（PR #26 分支 c59d13a8）",
  "kind": "task",
  "status": "verified",
  "topics": [
    "static-hosting"
  ],
  "summary": "按 CloudFront 日常发布 runbook 把 claude/placeholder-parity@c59d13a8 发布到 app.gatu.ai 与 testnet.gatu.ai：函数、Lambda、S3 同步、两个失效、两个 verify 全部通过；发布前后线上加载与几何对比见正文。",
  "thread": null,
  "baseCommit": "c59d13a8188093e1de0c5f247a9bc625f4a18a34",
  "commits": ["74c80c1a"],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "path": "docs/adr/0011-desktop-md-stacked-right-column.md" },
    { "path": "docs/adr/0012-trade-route-reveal-after-surface-preload.md" }
  ],
  "supersedes": []
}
-->
# 生产发布 cloudfront-2026-09-17-p21

## 背景与范围

用户要求"做一次生产发布体验"。发布对象是 [PR #26](https://github.com/zora4523-bot/gatu-app/pull/26) 的分支 `claude/placeholder-parity` head c59d13a8（含 main 全部提交；PR 未合并，CI 检查在发布时仍为 pending）。发布前核对：分支相对 `origin/main` 无落后提交；PR 未触及服务端/Lambda/部署脚本（仅两份测量脚本）；本地 typecheck、Biome、定向单测、构建预算与浏览器探测均通过（见前几份任务记录）。发布前线上为 c71aefac / `cloudfront-2026-09-15-p20`。

## 结论与依据

执行（`deploy/cloudfront/README.md`"日常发布"顺序，AWS 账号 018252911946，2026-09-17 09:12Z 构建）：

1. `GATU_RELEASE_ID=cloudfront-2026-09-17-p21 pnpm build`：预算通过，总 gzip 3,085,927 B（较基线 −68,780），trade 静态闭包 1,572,148 B（−9,068）；`build-meta.json` commit c59d13a8。`build:lambda` 产出 `index.mjs` 226 KB、`csp-report.mjs` 4 KB。
2. 干跑核对：函数轮换 10 个当前 + 7 个上一版内联脚本哈希；S3 同步按缓存策略分组、不带 `--delete`。
3. `functions --execute --origin https://app.gatu.ai`、`lambda --function-name gatu-terminal-api --execute`、`sync --bucket gatu-terminal-2026 --execute`、`invalidate` ET9CNVE6L1GWN（主网）与 E3Q2SAX402CR9F（测试网）：退出码全部 0。
4. 60 秒后 `verify --origin https://app.gatu.ai --network mainnet` 与 `--origin https://testnet.gatu.ai --network testnet`：全部 `ok`，含 build metadata parity `c59d13a8 / cloudfront-2026-09-17-p21`、geo 真实判定（SG）、签名 Lambda POST、内联脚本哈希 7 页 21 段 enforce、壳与图表包边缘命中、测试网 noindex。

线上体验对比（headless Chromium，持久化 profile，`/trade/HYPE`，就绪 = 首个 `.react-grid-item`；单次采样）：

| 指标 | 发布前 c71aefac | 发布后 c59d13a8 |
| --- | --- | --- |
| 第 1 次（冷）就绪 | 1514 ms | 1924 ms（失效刚完成、边缘缓存冷，单样本） |
| 第 2 次（热）就绪 / FCP | 669 / 184 ms | 231 / 232 ms |
| 第 3 次（热）就绪 / FCP | 614 / 180 ms | 150 / 148 ms |
| 热刷新网络字节 | 0 KB（SW 回壳） | 0 KB |
| 1316 px 几何 | 图表 747 / 订单簿 279 / 下单 278，网格 1145 px | 图表列 935 / 右列 372，下单 677、订单簿 670，网格 1818 px |
| 1440 px 几何 | lg 三列 | 不变 |

导航（未连接）：1150 px 一级入口 Trade、Portfolio、Vaults、Staking、Referrals、Leaderboard + More；1001 px 为 Trade、Portfolio + More；`/portfolio` 冷访问首个 header 快照即含 `Connect Wallet`（1337 ms，无 `Connecting...`）。页脚版本徽标 `V0.1.0+C59D13A8`。

## 验证与限制

- 以上为发布机本地执行与 `verify` 的输出；无真机与多地区验收。发布使用的是账号 root 凭据（既有遗留，见记忆中的待换 IAM 事项）。
- 内置浏览器面板对线上站点的打开被本会话的自动模式策略拦截，线上体验数据来自 headless Chromium。
- 回滚：S3 桶开启版本控制且同步不删除旧对象；回滚需以 c71aefac 重新 `pnpm build` 后再 `sync` + `invalidate`，或用桶版本恢复 `_shell.html`/文档页/`build-meta.json`。

## 后续与替代关系

- PR #26 仍待 CI 与合并；线上已先于 main 运行该分支，合并后无需再发。
- 建议后续：把发布凭据换成受限 IAM 用户（runbook 第 1 步）；在 `deploy.mjs verify` 之外补一条线上 md 断点几何与导航收纳的自动核对。
