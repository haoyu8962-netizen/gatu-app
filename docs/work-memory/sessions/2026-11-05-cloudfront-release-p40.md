<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-05-cloudfront-release-p40",
  "date": "2026-11-05",
  "title": "CloudFront 生产发布 p40（手机下单摘要对齐官方；预检触发重定基线）",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "pr-review", "order-entry"],
  "summary": "p40 发布 #151（手机下单摘要对齐官方：全仓清算价补足、N/A、结算币单位、独立滑点面板、去掉费用行）。运营方说「开晋升 PR」后，第一次发布预检（dev 8ca35543，发布配置）中 trade-terminal-page 只余 123、交易启动只余 195，都低于 200，按手册不开晋升 PR。运营方选「开重定基线 PR」：在 2230c64e 与 8ca35543 上按复现规则成对测量，#154 按配对关闭增量把两项基线提高 +96、+196，以 76983456 合入 dev。第二次预检（76983456）全部满足阈值。晋升 PR #155 只全跑静态检查与配对开启构建（三个工作流判为已覆盖），Codex 机器人无发现；运营方说「合并 #155」，合入 main af031ae4。运营方说「发布 p40」：用 Node 22.15.0 构建 cloudfront-2026-11-05-p40（三闸门全开），functions → lambda（版本 24）→ sync（一次成功，1,653 次上传）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。真机、真实钱包与浏览器里的人工观感未验收。",
  "thread": null,
  "baseCommit": "4608bc7c",
  "commits": ["8ca35543", "94609ed2", "76983456", "af031ae4"],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "path": "docs/agent-handbook.md" },
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "docs/work-memory/sessions/2026-11-04-mobile-order-summary-official.md" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/151" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/154" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/155" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/152" },
    { "url": "https://app.sairn.ai/build-meta.json" }
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p40（手机下单摘要对齐官方；预检触发重定基线）

## 背景与范围

同步记录，未取得任务标识。时间都是 UTC+8。

p39 上线后，`dev` 只多了 #151：手机下单摘要对齐官方，2026-11-05 以 `8ca35543` 合入 `dev`。运营方的决定依次是：
1. 「合并到主分支了吗」之后，说「开晋升 PR」；
2. 预检不通过，选「开重定基线 PR」，开出 #154；
3. #154 的 CI 通过后，说「合并 #154」；
4. 晋升 PR #155 的检查通过后，说「合并 #155」；
5. 「发布 p40」。

本记录覆盖从第一次预检到 p40 上线验证的全过程。p39 的发布记录在 PR #152，尚未合入 `dev`，所以这里用链接引用。

## 结论与依据

**第一次发布预检不通过。**
- 在仓库外新建发布工作树 `gatu-release-p40`，`.env.local` 只软链、不读内容。
- 检出 `dev` `8ca35543`，用 Node 22.15.0、pnpm 10.21.0 按锁文件安装，用时 29 秒。
- 用 p39 正式发布的开关构建：配对开启，三个闸门开，`VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false`，`VITE_HYPERLIQUID_TESTNET=` 为空，发布号 `cloudfront-2026-11-05-p40`。构建时间 12:58–13:01，451 个 chunk，无循环静态导入。
- 有两项低于手册第 8 节要求的 200 字节：
  - `trade-terminal-page` 127,947，余 123；
  - 交易启动 1,653,734，余 195。
- 其余各项满足：总量余 3,836，手机运行时余 814，`vaults-page` 余 242。
- 按规则，晋升 PR 没有开。

**重定基线（#154）。**
- 按复现规则成对测量：#151 前后的 `dev`（`2230c64e` 与 `8ca35543`）各在一个不含 `.env.local` 的工作树里，用固定构建身份先关配对、再开配对，各构建一次。
- 结果：`trade-terminal-page` +96 / +92，交易启动 +196 / +200。
- 两边的模块图显示，主要的正向增长来自 `trade-terminal-page`、`vendor-tanstack-router`（`liquidation.ts` 与英语目录）和 `styles.css`。
- 按配对关闭的增量提高基线：`trade-terminal-page` 124,070 → 124,166，交易启动 1,643,929 → 1,644,125。完整表格见 `docs/terminal-performance-baseline.md` 的同日一节。
- 审查：Codex CLI 8.5/10，三项措辞 P2 已改；窄范围复审 10/10。
- CI：配对关闭构建 8m19s，单测两片 11m18s、9m11s，都通过；Codex 机器人无发现。
- 14:38 以 `76983456` 合入 `dev`，树等于 `94609ed2`。

**第二次发布预检通过。**
- 同一工作树检出 `76983456`，按锁文件安装（3 秒），用同一组开关构建（14:39–14:42），451 个 chunk。`build-meta.json` 的提交、发布号与闸门都正确。
- 读数与余量：
  - 总量 3,379,430，余 3,568；
  - 交易启动 1,653,755，余 370；
  - 手机运行时 119,763，余 817；
  - `trade-terminal-page` 127,944，余 222；
  - `vaults-page` 30,530，余 246；
  - 其余各项余量都在 485 以上。
- 两次预检的客户端代码相同，只有提交号不同：总量多 268，交易启动多 21，`trade-terminal-page` 少 3。

**晋升与合并（#155）。**
- 开 PR 之前，在本机预演覆盖判定：
  - `terminal-tests` 与 `production-build` 由 #154 的运行 41974593797、41974593751 覆盖；
  - `slider-browser` 由 #151 的运行 41855436040 覆盖；
  - `website-build` 不触发。
- #155 上的实际结果：
  - 三个 `Promotion coverage` 作业的判定日志与预演一致，没有 `the check failed` 警告；
  - `Static Checks` 1m58s、配对开启的终端构建 7m10s，都通过；
  - 单测与浏览器回归按设计跳过；
  - Codex 机器人无发现，没有行内评论。
- 运营方说「合并 #155」。16:59 以合并提交合入，锁定头提交 `76983456`。`main` = `af031ae4`，父提交是 `4608bc7c` 与 `76983456`，树与 `dev` 完全相同。

**构建。**
- 工作树切到 `af031ae4`，`git status` 干净，按锁文件安装（2 秒）。
- 用同一组开关加 `SAIRN_BUILD_SHA=af031ae4…` 执行 `pnpm build`（17:01:36–17:05:43），再执行 `pnpm --filter @sairn/terminal build:lambda`，到 17:05:45。
- 451 个 chunk，无循环静态导入。全部预算通过：
  - 总量 3,379,607（+6,609，余 3,391）；
  - 交易启动 1,653,803（余 322）；
  - 手机运行时 119,779（余 801）；
  - 桌面运行时 204,591（余 8,092）；
  - `trade-terminal-page` 127,952（余 214）；
  - `vaults-page` 30,535（余 241）。
- 壳里 118 个共有预加载，另有 15 个仅桌面。Lambda 的 `index.mjs` 为 229.44 kB，含本次提交号一次。
- `build-meta.json` 为 `af031ae4 / cloudfront-2026-11-05-p40`：
  - 配对开；
  - CCTP 主网赞助开、测试网外部钱包开、测试网赞助关；
  - 两网银行卡入金开；
  - 图表入口仍是 `charting_library.6d17e2dafb1007c4.js`。
- 其它核对：
  - `deploy/verify-chart-build.mjs`（传入 `deploy/manifests/tradingview-charting-library.json`）退出码 0；
  - 产物里的 `sw.js` 与源文件相同；
  - 提交号出现在 5 个客户端 chunk 里；
  - 产物和 `_shell.html` 都不含 `gatu.ai`。

**发布。**
- 空跑：`functions`、`lambda`、`sync` 的计划都正常。闸门行三项 on，`sw.js` 以 `no-store` 上传。
- `functions --execute --origin https://app.sairn.ai`（17:06:41–17:07:01）：两个函数都发布到 LIVE，响应函数里是 3 个当前加 1 个上一版的内联脚本哈希。
- `lambda --function-name gatu-terminal-api --execute`（17:07:01–17:07:10）：发布为版本 24，代码 47,750 字节。版本 24 与 `$LATEST` 都是 Active / Successful。
- `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（17:07:19–17:11:13）：
  - 一次成功，1,653 次上传，0 次失败；比 p39 多 1 个，是新增的滑点面板块；
  - 结尾为 `Release markers match the local build: _shell.html, build-meta.json`。
- 失效：
  - 主网 `ET9CNVE6L1GWN` 的 `IEV1H0BQVZCKPGPP8M9U3HEBPT`（17:11:35）；
  - 测试网 `E3Q2SAX402CR9F` 的 `I3O71D0RD0T38AV3B4SZROVJJ9`（17:11:37）；
  - 约 17:13 查询时都已 Completed。

## 验证与限制

- `verify`（17:13 起）：
  - `--origin https://app.sairn.ai --network mainnet` 15/15 ok；
  - `--origin https://testnet.sairn.ai --network testnet` 16/16 ok；
  - 两网 `build metadata parity` 都是 `af031ae4 / cloudfront-2026-11-05-p40 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`；
  - 壳预加载 117 个链接；内联脚本 3 个，策略为 enforce；
  - 图表入口不可变，且由壳预加载；
  - 地区端点返回真实判定。
- 发布后重读两网的 `build-meta.json`，都是 `af031ae4 / cloudfront-2026-11-05-p40`。
- `csp-coverage.mjs https://app.sairn.ai`（17:13:34–17:15:45）的结果，是解析完整 JSON 报告得出的：
  - 33 步、0 违规、0 控制台错误，`scriptSrcViolations` 与 `otherViolations` 都为空，没有 report-only 头；
  - 跳过 2 步（桌面 WalletConnect、手机图表页），与 p34–p39 相同；
  - 桌面 7 个面板，手机 3 个导航项。
- 运行时测试：没有在 `main` 上重跑全量终端 Vitest。
  - `main` 的树等于 `dev` `76983456`；
  - #154 只改了预算脚本与记录，#151 的 CI 在合到 `2230c64e` 后的结果上全部通过。
- 未做：
  - 真实浏览器里的人工观感，尤其是带数值的 `USDC` 金额与超额清算价：未连接钱包时数量框不可用，只由单测覆盖；
  - 真实钱包登录与下单；
  - Safari、Firefox、真机与读屏。
- CHANGELOG 仍在 Unreleased 下，与 p33–p39 相同。发布日志在会话暂存目录，没有入库。
- 发布工作树：
  - `gatu-release-p40` 保留到下次发布；
  - `gatu-release-p39` 是终端回滚产物；
  - `gatu-release-p38` 及更早的可以删除，尚未删除。

## 后续与替代关系

- 删除 `gatu-release-p38` 及更早的发布工作树前，先问运营方。
- 发布构建的 `trade-terminal-page` 余 214、`vaults-page` 余 241、交易启动余 322。下一个会让这几块变大的改动，要先按手册第 8 节的发布预检规则测量。
- 待运营方决定：Scale/TWAP 摘要与桌面摘要的空值和单位，是否也按官方对齐，见 #151 的任务记录。
- 本记录不替代此前的记录。
