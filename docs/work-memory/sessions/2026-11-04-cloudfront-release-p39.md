<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-04-cloudfront-release-p39",
  "date": "2026-11-04",
  "title": "CloudFront 生产发布 p39（TWAP 历史目录外市场的价格位数）",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "pr-review"],
  "summary": "p38 上线后运营方说「请部署最新的代码到线上生成环境」。核对时线上两网就是 main 493f3d56，dev 只多 #148 的文档；唯一没上线的代码是 Codex 补审 #145/#147 后的修复（TWAP 历史与 TWAP 成交四张表对目录外市场只显示 2 位），只在本地分支。运营方说「推送并开 PR」：先把 dev 合入分支（97f11aba，生成的 INDEX 冲突重生），再开 #149，CI 通过、Codex 机器人无发现，在「合并并继续晋升」下以 2230c64e 合入 dev。发布预检（dev 2230c64e，发布配置）全部满足手册阈值，最紧的是 trade-terminal-page 余 234、vaults-page 余 242。晋升 PR #150 只全跑静态检查与配对开启构建（三个工作流判为已覆盖），Codex 机器人无发现；运营方说「通过就发布」，合入 main 4608bc7c。用 Node 22.15.0 构建 cloudfront-2026-11-04-p39（三闸门全开），functions → lambda（版本 23）→ sync（一次成功，1,652 次上传）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。真机、真实钱包与浏览器里的人工观感未验收。",
  "thread": null,
  "baseCommit": "493f3d56",
  "commits": ["12241e76", "edf5a5f5", "98e37af8", "97f11aba", "2230c64e", "4608bc7c"],
  "sources": [
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"path": "docs/work-memory/sessions/2026-11-04-cloudfront-release-p38.md"},
    {"path": "docs/work-memory/sessions/2026-11-04-codex-review-pr145-pr147.md"},
    {"url": "https://github.com/zora4523-bot/gatu-app/pull/149"},
    {"url": "https://github.com/zora4523-bot/gatu-app/pull/150"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p39（TWAP 历史目录外市场的价格位数）

## 背景与范围

同步记录，未取得任务标识。时间都是 UTC+8。

p38 上线后，运营方说「请部署最新的代码到线上生成环境」。当时的核对结果：

- 两网的 `build-meta.json` 都是 `493f3d56 / cloudfront-2026-11-04-p38`，等于 `main`；
- `dev` 只比 `main` 多 #148（p38 发布记录），没有代码差异；
- 唯一没上线的代码，是 [Codex 补审 #145 与 #147](2026-11-04-codex-review-pr145-pr147.md) 后的修复。它在 p35-dev 会话的本地分支 `claude/twap-history-price-fallback` 上，没有推送。

运营方随后的决定依次是：
1. 「推送并开 PR」，开出 #149；
2. 「开启 Auto-fix」；
3. CI 通过后「合并并继续晋升」；
4. 晋升 PR #150 开好后「开启 Auto-fix」，又说「通过就发布」。

晋升过程中，运营方要在原会话里改下单摘要界面，于是原会话把预检之后的工作交给了一个分出的会话。本记录覆盖从核对线上版本到 p39 上线验证的全过程。

## 结论与依据

**#149：TWAP 历史目录外市场的价格位数。**
- 修复本身见补审记录：
  - 四张 TWAP 表改为把市场对象交给 `getMarketPriceFormatOptions`，目录外的市场最多显示 8 位小数，不再只显示 2 位（`0.00001234` 显示为 `$0`）；
  - 同时更正了几处文档措辞。
- 分支基于 `90c2e436`，与 `dev` 只在生成的 `docs/work-memory/INDEX.md` 冲突。
  - 为了不动 p35-dev 会话的工作树，发布会话在自己的工作树里以 detached 状态把 `dev` `163597c6` 合入；
  - INDEX 用 `pnpm memory:index` 重生，提交为 `97f11aba`；
  - 再以本地分支名 `claude/twap-history-price-fallback-pr` 推送到远端的 `claude/twap-history-price-fallback`。p35-dev 工作树的本地分支仍停在 `98e37af8`。
- 合并后在本地做的检查：
  - `memory:check`、`memory:test`（8 项）与 `git diff --cached --check` 通过；
  - Biome 检查改动的 6 个代码文件无问题；
  - `desktop-twap-tab`、`mobile-twap-card`、`historical-order-price`、`collateral-amount` 共 4 个文件 51 项通过。
- #149 的 CI 6 项通过，3 项晋升覆盖按设计跳过：
  - 配对关闭构建 6m59s；
  - 浏览器回归两片 17m11s 和 11m20s；
  - 测试两片 11m25s 和 9m36s；
  - 静态检查 2m34s。
- Codex 机器人对 `97f11ab` 无发现。21:51 以合并提交 `2230c64e` 合入 `dev`。

**发布预检。**
- 在仓库外新建发布工作树 `gatu-release-p39`，`.env.local` 只软链、不读内容。
- 检出 `dev` `2230c64e`，用 Node 22.15.0、pnpm 10.21.0 按锁文件安装，用时 33 秒。
- 用 p38 正式发布的开关构建：配对开启，三个闸门开，`VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false`，`VITE_HYPERLIQUID_TESTNET=` 为空，发布号 `cloudfront-2026-11-04-p39`。构建时间 21:54–21:59。
- `build-meta.json` 正确，全部满足手册阈值：

| 预算 | 读数 | 余量 |
| --- | ---: | ---: |
| 总量 | 3,376,750 | 6,248 |
| 交易启动 | 1,653,547 | 382 |
| 手机运行时增量 | 119,778 | 802 |
| 桌面运行时增量 | 204,543 | 8,140 |
| `trade-terminal-page` | 127,836 | 234 |
| `vaults-page` | 30,534 | 242 |
| `token-selector-popup` | 15,368 | 487 |
| `funding-history-panel` | 9,354 | 807 |

与 p38 的第二次预检相比，总量少 44 字节，`trade-terminal-page` 少 3 字节。

**晋升覆盖与合并。**
- 开 #150 之前在本机预演（`scripts/promotion-coverage.mjs <工作流> --base origin/main --head origin/dev`）：
  - `terminal-tests`、`production-build`、`slider-browser` 由 #149 的运行 41802397751、41802397794、41802397763 覆盖；
  - `website-build` 判为不覆盖，但 `main..dev` 的文件都不在它的 `paths` 里，在晋升 PR 上不触发。
- #150 的结果：
  - 三个 `Promotion coverage` 作业的判定日志与预演一致，没有 `the check failed` 警告；
  - `Static Checks` 2m34s、配对开启的终端构建 8m18s，都通过；
  - 测试与浏览器回归按设计跳过；
  - Codex 机器人对 `2230c64` 无发现，并留了 👍。
- 运营方说「通过就发布」。22:21 以合并提交合入，锁定头提交 `2230c64e`。`main` = `4608bc7c`，父提交是 `493f3d56` 与 `2230c64e`，树与 `dev` 完全相同。

**构建。** 工作树切到 `4608bc7c`，`git status` 干净，按锁文件安装（1.6 秒）。用同一组开关加 `SAIRN_BUILD_SHA=4608bc7c…`，执行 `pnpm build` 和 `pnpm --filter @sairn/terminal build:lambda`（22:21:58–22:26:24）：
- 450 个 chunk，无循环静态导入。全部预算通过：
  - 总量 3,376,698（+3,700，余 6,300）；
  - 交易启动 1,653,564（余 365）；
  - 手机运行时 119,775（余 805）；
  - 桌面运行时 204,612（余 8,071）；
  - `trade-terminal-page` 127,853（余 217）；
  - `vaults-page` 30,536（余 240）。
- 壳里 118 个共有预加载，另有 15 个仅桌面。`build:lambda` 得到的 `index.mjs` 为 229,440 字节，含本次提交号一次。
- 打包进去的 `VITE_*` 与 p38 正式构建相比，只差提交号、构建时间与发布号（非布尔值只比较 SHA-256 前缀）。
- `build-meta.json` 为 `4608bc7c / cloudfront-2026-11-04-p39`，三个闸门开。
- `verify-chart-build.mjs`（传入 `deploy/manifests/tradingview-charting-library.json`）退出码 0，图表入口仍是 `charting_library.6d17e2dafb1007c4.js`。
- 其它核对：
  - 产物里的 `sw.js` 与源文件相同；
  - 提交号出现在 5 个 chunk 里；
  - 产物不含 `gatu.ai`。

**发布。**
- 空跑：`functions`、`lambda`、`sync` 的计划都正常，闸门行三项 on，`sw.js` 以 `no-store` 上传。
- `functions --execute --origin https://app.sairn.ai`（22:27:17–22:27:45）：两个函数都发布到 LIVE，内联脚本哈希为 3 个当前加 1 个上一版。发布后状态为 IN_PROGRESS，即正在生效。
- `lambda --function-name gatu-terminal-api --execute`：发布为版本 23（22:27:55）。版本 23 与 `$LATEST` 都是 Active / Successful。
- `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（22:28:11–22:32:13）：
  - 一次成功，1,652 次上传、0 次失败；
  - 结尾为 `Release markers match the local build: _shell.html, build-meta.json`；
  - 这次本机代理没有断开。
- 失效：
  - 主网 `ET9CNVE6L1GWN` 的 `I4TE3TJEYZEJIAHAWG08VU2707`（22:32:27）；
  - 测试网 `E3Q2SAX402CR9F` 的 `I4AAXHX8C5DKMWF5DSZJV81WZD`（22:32:32）；
  - 22:32:59 查询时都已 Completed。

## 验证与限制

- `verify --origin https://app.sairn.ai --network mainnet`：15/15 ok；`--origin https://testnet.sairn.ai --network testnet`：16/16 ok。
  - 两网 `build metadata parity` 都是 `4608bc7c / cloudfront-2026-11-04-p39 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`；
  - 壳预加载 117 个链接；内联脚本 3 个，策略为 enforce；
  - 图表入口不可变，且由壳预加载。
- `csp-coverage.mjs https://app.sairn.ai`（22:34:20–22:36:32）的结果是解析完整 JSON 报告得出的：
  - 33 步、0 违规、0 控制台错误，`scriptSrcViolations` 与 `otherViolations` 都为空，没有 report-only 头；
  - 跳过 2 步（桌面 WalletConnect、手机图表页），与 p34–p38 相同；
  - 桌面 7 个面板，手机 3 个导航项。
- 运行时测试：没有在 `main` 上重跑全量终端 Vitest。
  - `main` 的树等于 `dev` `2230c64e`，#149 的 CI 在合到 `163597c6` 后的结果上通过；
  - 修复提交 `edf5a5f5` 在本机跑过全量 Vitest：9,884 项，9,882 项通过、1 项跳过、1 项失败。失败的是 `vite-development-cache.test.ts`，因为沙盒不能监听端口；在沙盒外重跑通过（见补审记录）。
- 未做：
  - 真实浏览器里的人工观感，例如一个目录里已经没有的市场的 TWAP 历史；
  - 真实钱包登录与下单；
  - Safari、Firefox、真机与读屏。
- CHANGELOG 仍在 Unreleased 下，与 p33–p38 相同。发布日志在会话暂存目录，未入库。
- 发布工作树：
  - `gatu-release-p39` 保留到下次发布；
  - `gatu-release-p38` 是终端回滚产物；
  - `gatu-release-p37` 及更早的可以删除，尚未删除。

## 后续与替代关系

- 删除 `gatu-release-p37` 及更早的发布工作树前，先问运营方。
- p35-dev 工作树的本地分支 `claude/twap-history-price-fallback` 比远端少一个合并提交；在那边继续改之前先 `git pull`。PR 已合入，这个分支也可以删除。
- 发布构建的 `trade-terminal-page` 余 217、`vaults-page` 余 240，都接近 200。下一个会让这两块变大的改动，要先按手册第 8 节的发布预检规则测量。
