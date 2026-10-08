<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-08-cloudfront-release-p26",
  "date": "2026-10-08",
  "title": "CloudFront 生产发布 p26：晋升 dev（#76、#77、#81）到 main，先重定总量包体基线",
  "kind": "task",
  "status": "recorded",
  "topics": ["static-hosting", "market-recovery"],
  "summary": "用户要求把 dev 合并到 main 并部署生产。dev 相对 p24b 的 main 含 #76（p24b 发布记录）、#77（图表精度 ADR 0035 + 静默建钱包 ADR 0033）、#81（TradingView 加载器握手补丁）。晋升 PR #82 的配对开启构建因总量包体超基线 1,297 字节失败；发布工作树的演练构建也超 55 字节。按 docs/terminal-performance-baseline.md 的规则用固定元数据、无 .env.local、Node 22.15 在同一隔离工作树测了 6da4c15a / 345a2143 / 54235298 三点（3,294,335 / 3,296,905 / 3,296,759），把总量基线重定为 dev 头 3,296,759 并归因（p24b 已用 +6,684、#77 +2,570、#81 -146 噪声），桌面运行时增量余 407 字节未重定。重定基线 PR 进 dev 后再晋升、构建、发布；发布步骤与验证见正文（进行中）。",
  "thread": null,
  "baseCommit": "54235298",
  "commits": [],
  "sources": [
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "deploy/cloudfront/README.md" },
    { "path": "docs/work-memory/sessions/2026-10-03-cloudfront-release-p24b.md" },
    { "path": "docs/work-memory/sessions/2026-10-08-webkit-chart-rebuild-handshake-race.md" }
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p26：晋升 dev（#76、#77、#81）到 main，先重定总量包体基线

## 背景与范围

同步记录，未取得任务标识（`thread: null`）。用户在 TradingView 握手补丁（PR #81，合入 dev `54235298`）之后要求「合并到 main 并且部署最新的代码到生产环境」。发布前线上是 p24b（`cloudfront-2026-10-03-p24b`，main `6da4c15a`）。`dev` 相对 `main` 多 24 个提交，来自 #76（文档）、#77（图表价格精度 + 静默建钱包）与 #81；用户已被告知 #77 会一起晋升。

发布号用 p26：p25 仍是旧域名清理发布（PR #73）的保留名。开关沿用 p24b：主网赞助存款开、银行卡入金主网与测试网开、测试网赞助关、测试网外部开、移动配对关。

## 结论与依据

**晋升 PR #82（dev → main）首轮 CI**：静态检查、终端测试、浏览器两个分片、配对关闭构建通过；「Build terminal (pairing true)」失败：总量 3,298,948 gzip，比基线 3,287,651 多 11,297，允许 10,000。配对关闭的 CI 构建读 3,297,05x（在允许内），发布工作树读了 `.env.local` 的演练构建读 3,297,706（+10,055，也失败）。

**重定基线**（分支 `claude/rebaseline-total-budget-p26`，基于 dev `54235298`）：在仓库外工作树 `gatu-release-p26`（`git worktree add --detach`，`pnpm install --frozen-lockfile`，Node 22.15.0，锁文件在三个提交间无变化）移除 `.env.local` 软链后，用固定元数据 `SAIRN_BUILD_SHA=54235298… SAIRN_RELEASE_ID=p26-rebaseline SAIRN_BUILD_TIME=2026-10-08T00:00:00.000Z NODE_ENV=production NITRO_PRESET=node-server VITE_MOBILE_PAIRING_ENABLED=false` 各构建一次：

| 提交 | 总量 | 静态启动 | 手机运行时增量 | 桌面运行时增量 |
| --- | ---: | ---: | ---: | ---: |
| `6da4c15a`（p24b main） | 3,294,335 | 1,630,085 | 118,027 | 202,265 |
| `345a2143`（dev，#77 后） | 3,296,905 | 1,631,938 | 118,315 | 202,745 |
| `54235298`（dev，#81 后） | 3,296,759 | 1,631,834 | 118,319 | 202,722 |

总量基线改为 3,296,759（`scripts/check-client-bundle-budget.mjs`，说明写在 `docs/terminal-performance-baseline.md` 新段落）：p24b 已用 +6,684、#77 +2,570、#81 -146（构建噪声；它只改 `public/charting_library/`，不计入预算）。配对开启的 CI 构建约多 2,200、读 `.env.local` 的发布构建约多 950，都在新允许值内。桌面运行时增量 202,722 对基线 193,129 余 407 字节，手机 118,319 对 110,580 余 2,261，未重定；下一次桌面增长需要单独的实测重定。`check-client-bundle-budget.test.mjs` 19 项通过。

## 验证与限制

- 重定基线只依据上面的三次固定元数据构建与 CI 日志；没有逐资产比对 #77 的增量来源。
- 发布步骤（构建、functions、lambda、sync、失效、verify、csp-coverage）在本记录后续补充；在此之前本记录状态为 recorded。

## 后续与替代关系

- 重定基线 PR 合入 dev 后 #82 会以新 dev 头重跑 CI；全绿后以 merge commit 合入 main，再从 main 的合并提交构建发布。
- 桌面运行时增量余量只剩 407 字节，下一个增加桌面首屏代码的 PR 很可能需要实测重定。
