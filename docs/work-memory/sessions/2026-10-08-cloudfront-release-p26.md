<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-08-cloudfront-release-p26",
  "date": "2026-10-08",
  "title": "CloudFront 生产发布 p26：晋升 dev（#76、#77、#81）到 main，先重定总量包体基线",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "market-recovery"],
  "summary": "用户要求把 dev 合并到 main 并部署生产。dev 相对 p24b 的 main 含 #76（p24b 发布记录）、#77（图表精度 ADR 0035 + 静默建钱包 ADR 0033）、#81（TradingView 加载器握手补丁）。晋升 PR #82 的配对开启构建因总量包体超基线 1,297 字节失败；发布工作树的演练构建也超 55 字节。按 docs/terminal-performance-baseline.md 的规则用固定元数据、无 .env.local、Node 22.15 在同一隔离工作树测了 6da4c15a / 345a2143 / 54235298 三点（3,294,335 / 3,296,905 / 3,296,759），把总量基线重定为 dev 头 3,296,759 并归因（p24b 已用 +6,684、#77 +2,570、#81 -146 噪声），桌面运行时增量余 407 字节未重定。重定基线 PR #83 合入 dev（508ff73d）后 #82 七项 CI 全绿、以 merge commit 合入 main（290935c7）；从该提交构建 cloudfront-2026-10-08-p26（开关同 p24b），functions（08:52Z）、lambda（版本 11）、sync（带两个闸门参数）、两个分发失效依次执行；verify 主网 15/15、测试网 16/16，csp-coverage 33 步 0 违规 0 控制台错误，WebKit 探针对线上 route/locale 两场景全部就绪。真机 iOS Safari 验收仍未做。",
  "thread": null,
  "baseCommit": "54235298",
  "commits": ["c46331a9", "508ff73d", "290935c7", "8452b745"],
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

**合并。** 重定基线 PR #83（`c46331a9`）CI 两项（配对关闭构建、终端测试；其余工作流按路径过滤未触发）通过后以 merge commit 合入 dev（`508ff73d`）。晋升 PR #82 以新 dev 头重跑七项 CI 全部通过（含配对开启构建），以 merge commit 合入 main（`290935c7`，树与 dev `508ff73d` 相同）。

**构建。** 发布工作树 `gatu-release-p26` 检出 `290935c7`，恢复 `.env.local` 软链（只软链、不读内容），Node 22.15.0，清掉演练与测量产物后：`SAIRN_BUILD_SHA=290935c7… SAIRN_RELEASE_ID=cloudfront-2026-10-08-p26 VITE_HYPERLIQUID_AGENT_NAME=sairn VITE_HYPERLIQUID_TESTNET= VITE_MOBILE_PAIRING_ENABLED=false VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm build`，再 `build:lambda`。总量 3,297,265（新基线 +506）、静态启动 1,632,449、手机运行时 118,315、桌面运行时 202,716（余 413）；Lambda 包 225,916 字节。`build-meta.json`：commit `290935c7`、release `cloudfront-2026-10-08-p26`、`privyFiatFunding` 两网 true、`cctpDeposits` 同 p24b、`mobileSync` 关、入口 `charting_library.6d17e2dafb1007c4.js`；`verify-chart-build.mjs` 通过，四份加载器副本含握手补丁；Sairn 的 Privy 应用 ID 在 5 个文件、无 `sairn-dev` 槽位。演练阶段（dev 头）`functions`/`sync` 空跑打印 `release gates: sponsored-mainnet-deposits=on mobile-pairing=off mainnet-card-funding=on`。

**执行**（profile `gatu-edge`，2026-10-08）：
1. `functions --execute --origin https://app.sairn.ai`：请求与响应函数发布，LIVE 修改时间 08:52:29Z。
2. `lambda --function-name gatu-terminal-api --execute`：发布为版本 11（08:52:32Z），等待更新完成。
3. `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mainnet-card-funding --execute`：上传后「Release markers match the local build: _shell.html, build-meta.json」。
4. 两个分发失效（主网 `ET9CNVE6L1GWN`、测试网 `E3Q2SAX402CR9F`）08:55Z 创建。

## 验证与限制

- 线上 `app.sairn.ai` 与 `testnet.sairn.ai` 的 `/build-meta.json` 都是 p26 / `290935c7`，闸门值与本地一致。
- `verify`：主网 15/15、测试网 16/16（build metadata parity `290935c7 / cloudfront-2026-10-08-p26 / sponsored-mainnet-deposits=on mobile-pairing=off mainnet-card-funding=on`；geo SG；图表入口 immutable 且被壳预加载；边缘命中）。
- `csp-coverage.mjs https://app.sairn.ai`：33 步、2 步跳过（与 p24b 相同）、0 违规、0 控制台错误。
- `chart-rebuild-webkit-probe.mjs webkit https://app.sairn.ai route|locale`：route 第二个 widget 1.5 秒就绪，locale en→zh→en 全部就绪，握手顺序每次都是先注册后派发（日志本机 `.worklog/2026-10-08/webkit-chart-rebuild/live-p26-{route,locale}.log`）。发布前同一脚本对 p24b 线上是失败的（见握手记录）。
- 未做：真机 iOS Safari 验收；#77 静默建钱包的真实钱包验收；线上银行卡真实购买（CF-11，沿自 p24b）。重定基线只依据三次固定元数据构建与 CI 日志，没有逐资产比对 #77 的增量来源。

## 后续与替代关系

- 用户在真机 iOS Safari 上按原路径（抽屉 → Funding Comparison → Trade → Markets；中文界面切页回来）确认图表；结果补记到握手记录。
- 桌面运行时增量余量只剩 413 字节，下一个增加桌面首屏代码的 PR 很可能需要实测重定。
- 工作树 `gatu-release-p26` 保留到下次发布供 verify 比对与回滚；`gatu-release-p24`、`gatu-release-p25` 可删除。
- 上一次发布记录：[p24b](2026-10-03-cloudfront-release-p24b.md)。
