<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-28-cloudfront-release-p34",
  "date": "2026-10-28",
  "title": "CloudFront 生产发布 p34（交易终端日语）",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "i18n-runtime"],
  "summary": "运营方同意整条流程后，晋升 PR #119（dev→main，含 #117 p33 记录与 #118 日语）八项 CI 全绿（含配对开启构建），以 merge commit 合入 main（2047ee8d）。在仓库外工作树 gatu-release-p34 用 Node 22.15.0 构建 cloudfront-2026-10-28-p34（三个闸门全开，总量 3,353,963，比新基线 +3,470），按 functions → lambda（版本 18）→ sync（首次因本机代理连接失败中断于资源阶段，重跑补传 11 个文件后发布标记一致）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规发布。线上终端自 p33 升到 p34，带上日语界面与订单类型标签的上下文修复。真实钱包、真机与母语审校未做。",
  "thread": null,
  "baseCommit": "2dcfd3e0",
  "commits": ["f18e144a", "2047ee8d"],
  "sources": [
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "docs/work-memory/sessions/2026-10-27-cloudfront-release-p33-and-website.md"},
    {"path": "docs/work-memory/sessions/2026-10-28-japanese-interface-language.md"},
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p34（交易终端日语）

## 背景与范围

同步记录，未取得任务标识。日语界面随 PR #118 合入 dev 后，运营方要求「部署到生产环境」，并在确认问题里选择「整条流程都执行」：开 dev→main 晋升 PR 并等 CI 全绿后以 merge commit 合入，从 main 构建并部署 p34（三个闸门按惯例全开），再用纯文档 PR 把本记录合入 dev。时间均为 UTC。

## 结论与依据

**晋升。** [PR #119](https://github.com/zora4523-bot/gatu-app/pull/119)（`dev` `f18e144a` → `main`）的内容是 [#117](https://github.com/zora4523-bot/gatu-app/pull/117)（p33 记录，纯文档）与 [#118](https://github.com/zora4523-bot/gatu-app/pull/118)（日语）。八项 CI 全部通过，含只在进 `main` 的 PR 上运行的配对开启构建；`chatgpt-codex-connector` 审查 `f18e144a` 无发现。浏览器回归分片 1 比其他检查晚开始，约 08:45 才完成。08:46 以 merge commit 合入（`--match-head-commit f18e144a…`），`main` = `2047ee8d`，父提交 `2dcfd3e0` 与 `f18e144a`，代码树与 `f18e144a` 完全相同。

**构建。** 仓库外工作树 `gatu-release-p34`：先检出 `f18e144a` 装依赖，合并后切到 `2047ee8d`（核对代码树相同）。`.env.local` 软链主检出、不读内容，Node 22.15.0、pnpm 10.21.0。命令行显式写出 `SAIRN_BUILD_SHA=2047ee8d… SAIRN_RELEASE_ID=cloudfront-2026-10-28-p34 VITE_HYPERLIQUID_TESTNET= VITE_MOBILE_PAIRING_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm build`，再 `build:lambda`。结果：
- 444 个 chunk，无循环导入。
- 总量 3,353,963 gzip，比 #118 抬高后的基线 3,350,493 多 3,470，在 10,000 的允许范围内。差额主要是配对开启，与 PR 上配对开启构建通过一致。
- 交易页静态启动 1,642,224，手机运行时 118,313，桌面运行时 202,666。
- Lambda `index.mjs` 229.44 kB。
- `build-meta.json` 的提交、release 与三个闸门正确；图表入口 `charting_library.6d17e2dafb1007c4.js` 与 p33 相同；`verify-chart-build.mjs`（传入 `deploy/manifests/tradingview-charting-library.json`）退出码 0。
- 产物不含 `gatu.ai`，含日语目录块 `assets/messages-Bq5f6jfB.js`。

**发布。**
- `functions --execute --origin https://app.sairn.ai`（08:55–08:56）：3 个当前加 1 个上一版内联脚本哈希，两个函数 LIVE。
- `lambda --function-name gatu-terminal-api --execute`（08:56）：版本 18，`get-function-configuration --qualifier 18` 为 Active / Successful。
- `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`：闸门行三项 on，线上策略已含本次 3 个内联脚本哈希。
  - 第一次运行（08:57–09:05）在资源阶段因 `upload failed … Failed to connect to proxy URL: "http://127.0.0.1:6152"` 退出码 1。这是本机 HTTP 代理的一次连接失败，此前已上传 1,634 个对象。`sync` 先传资源、最后才传 HTML 与 `build-meta.json`，所以这段时间线上仍是 p33 的壳；新资源都带内容哈希，不会和旧文件冲突。
  - 原命令重跑（09:05–09:13）补传 11 个文件，包括失败的那个资源、六个 `<route>/index.html`、壳与 `build-meta.json`；结尾 `Release markers match the local build: _shell.html, build-meta.json`，退出码 0。
- 失效：主网 `ET9CNVE6L1GWN` 的 `I1VLYRVCPJUD56EBW84JV2Q7YE`，测试网 `E3Q2SAX402CR9F` 的 `IGSSE9BVZ7J8CYJ5DGK1XS7BF`；`aws cloudfront wait invalidation-completed` 两次都成功（09:13:50）。

## 验证与限制

- `verify --origin https://app.sairn.ai --network mainnet`：15/15 ok；`--origin https://testnet.sairn.ai --network testnet`：16/16 ok。两网 `build metadata parity` 都是 `2047ee8d / cloudfront-2026-10-28-p34 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`；壳预加载 115 个链接；地区判定读到的是本机出口 IP 所在国家。
- `csp-coverage.mjs https://app.sairn.ai`（09:14–09:16）：33 步、0 违规、0 控制台错误；跳过 2 步（桌面 WalletConnect、手机图表页，与 p33 相同）；桌面 7 个面板、手机 3 个导航项。
- 发布后 `curl`：两网 `build-meta.json` 都是 p34；日语目录块 200、148,338 字节、`immutable`，内容含「成行」。
- 未做：真实浏览器里切换到日语后的线上目视检查（只在开发服务器上看过，见[日语任务记录](2026-10-28-japanese-interface-language.md)）；日语母语审校；真实钱包登录、存款与下单；Safari、Firefox、真机与读屏。官网 `apps/website` 的语言列表仍是六种语言，没有加日语，也没有重新发布官网。发布日志在会话暂存目录，未入库。CHANGELOG 仍在 Unreleased 下，与 p33 做法相同。
- 发布工作树 `gatu-release-p34` 保留到下次发布；`gatu-release-p33` 是终端回滚产物；`gatu-release-p32` 及更早的发布工作树可以删除（未删除）。

## 后续与替代关系

- 待做：上面列出的真实验收与日语母语审校；三处价格值仍显示无上下文的「市場」（见日语任务记录）；官网是否宣传日语需要另行决定。
- 上一次终端发布记录：[p33](2026-10-27-cloudfront-release-p33-and-website.md)。
