<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-04-cloudfront-release-p38",
  "date": "2026-11-04",
  "title": "CloudFront 生产发布 p38（数量与价格保留官方位数；预检触发重定基线，晋升审查修正历史表格）",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "pr-review", "order-entry"],
  "summary": "运营方说「继续合并PR 到主分支」后又说「请发布」。晋升前的发布预检（dev 51e99321，发布配置）里 trade-terminal-page 只余 169 字节，低于手册的 200；运营方选「重定基线后晋升」，PR #145 按复现规则实测的 +66 把基线上调到 124,070。晋升 PR #146 上 Codex 机器人指出 #143 把历史表格的均价也按行情规则取整（P1，违反 AGENTS.md 历史表格规则），PR #147 改回市场协议小数位；在新 dev 90c2e436 上重做预检全部通过。#146 只全跑静态检查与配对开启构建（四个工作流判为已覆盖），合入 main 493f3d56。用 Node 22.15.0 构建 cloudfront-2026-11-04-p38（三闸门全开），functions → lambda（版本 22）→ sync（第一次因本机代理 127.0.0.1:6152 短暂断开有 3 个文件报失败、壳未替换，重跑成功、发布标记一致，3 个文件内容核对一致）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。真机、真实钱包与浏览器里的人工观感未验收。",
  "thread": null,
  "baseCommit": "2fcae4d5",
  "commits": ["1cf68b39", "51e99321", "6c533454", "26f776ad", "f67cbe04", "90c2e436", "493f3d56"],
  "sources": [
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"path": "docs/terminal-performance-baseline.md"},
    {"path": "docs/number-format-setting.md"},
    {"path": "docs/trading-toolbar-redesign.md"},
    {"path": "docs/work-memory/sessions/2026-11-02-cloudfront-release-p37.md"},
    {"path": "docs/work-memory/sessions/2026-11-02-size-field-fixed-decimals.md"},
    {"url": "https://github.com/zora4523-bot/gatu-app/pull/146"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p38（数量与价格保留官方位数；预检触发重定基线，晋升审查修正历史表格）

## 背景与范围

同步记录，未取得任务标识。时间都是 UTC+8。

PR #143（数量框与市场价格保留官方位数）与 #144（其合入补记）进入 `dev` 之后，运营方说「继续合并PR 到主分支」。两个 PR 已经在 `dev` 里，所以理解为 `dev → main` 晋升。晋升过程中运营方说「请发布」。本记录覆盖从晋升前的预检到 p38 上线验证的全过程。这次修复本身的内容见[数量框与市场价格的任务记录](2026-11-02-size-field-fixed-decimals.md)。

## 结论与依据

**晋升内容。** [PR #146](https://github.com/zora4523-bot/gatu-app/pull/146)（`dev` `90c2e436` → `main`）相对 p37 的 `2fcae4d5` 包括：
- [#142](https://github.com/zora4523-bot/gatu-app/pull/142)：p37 发布记录与手册的「发布预检」规则。
- [#143](https://github.com/zora4523-bot/gatu-app/pull/143)：以下几类数值保留官方位数，提交给交易所的字符串不变：
  - 程序填入的数量；
  - 市场价格的显示；
  - 价格框的程序填值；
  - TP/SL 换算价；
  - Max 填值。
- [#144](https://github.com/zora4523-bot/gatu-app/pull/144)：#143 的合入补记。
- [#145](https://github.com/zora4523-bot/gatu-app/pull/145)：`trade-terminal-page` 的预算基线 +66，变为 124,070。
- [#147](https://github.com/zora4523-bot/gatu-app/pull/147)：历史表格改回市场协议小数位。

客户端代码的变化只有 #143 与 #147，依赖与锁文件没有变化。

**第一次预检没通过。**
- 在仓库外新建发布工作树 `gatu-release-p38`，`.env.local` 软链、不读内容。检出 `dev` `51e99321`，Node 22.15.0、pnpm 10.21.0 按锁文件安装，用时 28.8 秒。
- 用 p37 正式发布的开关构建：配对开启，三个闸门开，`VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false`，`VITE_HYPERLIQUID_TESTNET=` 为空，发布号 `cloudfront-2026-11-03-p38`。
- 全部预算通过，但 `trade-terminal-page` 为 127,835，只余 169 字节，低于手册要求的 200。其余各项都满足阈值，例如总量余 6,452、交易启动余 440。

**重定基线（运营方选「重定基线后晋升」）。**
- 按复现规则，两个不含 `.env.local` 的工作树、固定身份、`NITRO_PRESET=node-server`，各自先后构建配对关闭和开启。两侧是 `991796cd`（#143 之前）与 `51e99321`。
- `trade-terminal-page` 增长 +66（配对关闭）和 +78（配对开启）。同一份代码前一天在 `ce18a5a5` 测得的读数与基线一侧相差 0 和 −6。
- 起初按 +78 上调。本机 Codex CLI 当时登录失效（`401 Unauthorized`），改派一个只读审查子代理。它评 7/10，指出上调幅度应与前两次一致（+66），以及逐块归属、块数、合计数和噪声说明的问题，都已改正。
- 最终按 +66 上调到 124,070，写进 `docs/terminal-performance-baseline.md`。
- #145 的 CI：配对关闭的构建 9m11s、测试两片 11m20s 和 7m16s，全部通过；Codex 机器人无发现。23:00 以合并提交 `26f776ad` 合入 `dev`。

**晋升 PR 的审查意见与 #147。**
- 开 #146 之后，Codex 机器人对 `26f776a` 提了一项 P1：#143 让只传 `szDecimals` 的历史表格也按行情规则取整，均价超过 5 位有效数字时丢位。例如 TWAP 历史的 BTC 均价 88140.5 显示成 $88,141。这违反 AGENTS.md 的历史表格规则。
- 核实成立。#147 让 `getMarketPriceFormatOptions` 给出显式协议小数位，TWAP 历史与 TWAP 成交的四处改用它。历史表格的显示与 #143 之前逐位相同。
- #147 的测试与验证：
  - 新增桌面与手机 TWAP 历史的回归用例；
  - 五个变异都被抓住；
  - 全量 Vitest 712 个文件通过，唯一失败是已知本机误报；
  - 包体：`trade-terminal-page` +0 和 +3。
- #147 的 CI：6 项通过、3 项晋升覆盖按设计跳过；Codex 机器人无发现。
- 在 #146 的评论下回复了修复内容，并把讨论标为已解决。
- 2026-11-04 00:55 以合并提交 `90c2e436` 合入 `dev`。

**第二次预检。** #147 改了客户端代码，于是在 `gatu-release-p38` 切到 `90c2e436` 重做，发布号 `cloudfront-2026-11-04-p38`。`build-meta.json` 正确，全部满足阈值：

| 预算 | 读数 | 余量 |
| --- | ---: | ---: |
| 总量 | 3,376,794 | 6,204 |
| 交易启动 | 1,653,552 | 377 |
| 手机运行时增量 | 119,766 | 814 |
| `trade-terminal-page` | 127,839 | 231 |
| `vaults-page` | 30,533 | 243 |

**晋升覆盖与合并。**
- 本机预演四个工作流都判为已覆盖：
  - `terminal-tests`、`production-build`、`slider-browser` 由 #147 的运行 41669746627、41669746648、41669746589 覆盖；
  - `website-build` 由 #143 的运行 41483460203 覆盖。
- #146 的结果：
  - 四个 `Promotion coverage` 作业的判定日志与预演一致，没有 `the check failed` 警告；
  - `Static Checks` 2m52s，配对开启的终端构建 7m57s，都通过；
  - 测试、浏览器回归与官网构建按设计跳过。
- 01:23 以合并提交合入，锁定头提交 `90c2e436`。`main` = `493f3d56`，父提交是 `2fcae4d5` 与 `90c2e436`，树与 `dev` 完全相同。

**构建。** 工作树切到 `493f3d56`，`git status` 干净，按锁文件重装依赖。同一组开关、`SAIRN_BUILD_SHA=493f3d56…`，执行 `pnpm build` 和 `pnpm --filter @sairn/terminal build:lambda`：
- 450 个 chunk，无循环静态导入。全部预算通过：
  - 总量 3,376,927（+3,929，余 6,071）；
  - 交易启动 1,653,608（余 321）；
  - 手机运行时 119,773（余 807）；
  - 桌面运行时 204,566；
  - `trade-terminal-page` 127,850（余 220）；
  - `vaults-page` 30,533（余 243）。
- 壳里 118 个共有预加载，另有 15 个仅桌面。`build:lambda` 得到 `index.mjs` 229,440 字节，含本次提交号。
- 打包进去的 `VITE_*` 与 p37 最终构建相比，只差提交号、构建时间与发布号（非布尔值只比较 SHA-256 前缀）。
- `build-meta.json` 为 `493f3d56 / cloudfront-2026-11-04-p38`，三个闸门开。
- `verify-chart-build.mjs`（传入 `deploy/manifests/tradingview-charting-library.json`）退出码 0，图表入口仍是 `charting_library.6d17e2dafb1007c4.js`。
- 其它核对：产物里的 `sw.js` 与源文件相同；提交号在 5 个 chunk 里各出现一次；产物不含 `gatu.ai`。

**发布。**
- 空跑：`functions`、`lambda`、`sync` 的计划都正常，闸门行三项 on，`sw.js` 以 `no-store` 上传。
- `functions --execute --origin https://app.sairn.ai`（01:28:31–01:28:59）：两个函数都发布到 LIVE，内联脚本哈希为 3 个当前加 1 个上一版。随后请求函数为 DEPLOYED，响应函数为 IN_PROGRESS（正在生效）。
- `lambda --function-name gatu-terminal-api --execute`：版本 22（01:29:10）。版本 22 与 `$LATEST` 都是 Active / Successful。
- 第一次 `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（01:29:32–01:32:45）退出 1：
  - 带哈希资源的那一批里，`createLucideIcon`、`extract-order-status`、`fundingHistory._address` 三个文件报 `Failed to connect to proxy URL: "http://127.0.0.1:6152"`，是本机网络代理短暂断开；
  - 脚本在这一批停下，壳、各路由的 `index.html`、`sw.js` 与发布标记都没有上传；
  - 当时两网的 `build-meta.json` 仍是 `2fcae4d5 / cloudfront-2026-11-02-p37`。
- 原样重跑 `sync`（01:33:21–01:36:44）退出 0，上传 11 个文件，结尾为 `Release markers match the local build: _shell.html, build-meta.json`。
  - 那三个文件在 S3 中都存在，ETag 与本地 MD5 一致。它们不在重跑的上传列表里，推断是第一次那批命令里 AWS CLI 自己重试成功了。
- 失效：主网 `ET9CNVE6L1GWN` 的 `I9CM7PQZLE64J8RLF3HGA6AC8O`（01:37:22），测试网 `E3Q2SAX402CR9F` 的 `IBAKZAVYMSM0YPMQDQ9M2Z4CLL`（01:37:25），01:37:53 查询时都已 Completed。

## 验证与限制

- `verify --origin https://app.sairn.ai --network mainnet`：15/15 ok；`--origin https://testnet.sairn.ai --network testnet`：16/16 ok。
  - 两网 `build metadata parity` 都是 `493f3d56 / cloudfront-2026-11-04-p38 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`。
  - 壳预加载 117 个链接；内联脚本 3 个，策略为 enforce；图表入口不可变且由壳预加载。
  - 地区判定读到的是本机出口 IP 所在国家。
- `csp-coverage.mjs https://app.sairn.ai`（01:38:51–01:41:03），完整读过输出：
  - 33 步、0 违规、0 控制台错误，`scriptSrcViolations` 与 `otherViolations` 都为空，没有 report-only 头；
  - 跳过 2 步（桌面 WalletConnect、手机图表页），与 p34–p37 相同；
  - 桌面 7 个面板，手机 3 个导航项。
- 运行时测试：没有在 `main` 上重跑全量终端 Vitest。`main` 的树等于 `dev` `90c2e436`；#147 的 CI 在合到 `26f776ad` 后的结果上通过。#147 分支在本机跑过全量 Vitest：712 个文件通过、1 个跳过，失败的 `funds-modal-scroll-contract` 是已知本机误报。
- 未做：
  - 真实浏览器里的人工观感：拖动滑杆时数量宽度是否稳定，价格补零后的视觉效果；
  - 真实钱包登录、下单、改单与 TP/SL；
  - Safari、Firefox、真机与读屏。
- CHANGELOG 仍在 Unreleased 下，与 p33–p37 相同。发布日志在会话暂存目录，未入库。
- 发布工作树：`gatu-release-p38` 保留到下次发布；`gatu-release-p37` 是终端回滚产物；`gatu-release-p36` 及更早的可以删除（未删除）。测量用的工作树在会话暂存目录，不作为回滚产物。

## 后续与替代关系

- 包体余量：发布配置下 `trade-terminal-page` 余 220、`vaults-page` 余 243、交易启动余 321。下一次影响这些块的改动，要先按发布预检规则测量。
- 本机 Codex CLI 需要运营方重新登录（`codex login`），手册的推送前审查才能恢复用 Codex。
- 上一次终端发布记录：p37，[2026-11-02-cloudfront-release-p37.md](2026-11-02-cloudfront-release-p37.md)。
