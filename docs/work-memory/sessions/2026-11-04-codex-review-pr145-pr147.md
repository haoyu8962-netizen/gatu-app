<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-04-codex-review-pr145-pr147",
  "date": "2026-11-04",
  "title": "Codex 补审 PR #145 与 #147：TWAP 历史的小数位兜底与重定基线记录的措辞",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "order-entry", "i18n-runtime"],
  "summary": "补审 #145/#147 发现并修复 TWAP 四张历史表对目录外市场误用默认 szDecimals 的问题，同时更正预算归因措辞。修复复审 9.2/10。11 月 9 日核对代码经 #149 进入 dev/main，来源报告随 p39 发布；真实页面与真机仍未验收。",
  "thread": null,
  "baseCommit": "90c2e436",
  "commits": ["6c533454", "f67cbe04", "ec0b62d3", "12241e76", "edf5a5f5", "98e37af8", "97f11aba", "2230c64e", "4608bc7c", "0d75a146"],
  "sources": [
    {"path": "apps/terminal/src/lib/trade/market-price-format.ts"},
    {"path": "apps/terminal/src/components/trade/positions/twap-history-table.tsx"},
    {"path": "apps/terminal/src/components/trade/positions/twap-fill-history-table.tsx"},
    {"path": "apps/terminal/src/components/trade/mobile/mobile-twap-history-list.tsx"},
    {"path": "apps/terminal/src/components/trade/mobile/mobile-twap-fill-history-list.tsx"},
    {"path": "apps/terminal/src/lib/tests/desktop-twap-tab.test.tsx"},
    {"path": "apps/terminal/src/lib/tests/mobile-twap-card.test.tsx"},
    {"path": "docs/terminal-performance-baseline.md"},
    {"path": "docs/trading-toolbar-redesign.md"},
    {"path": "docs/work-memory/sessions/2026-11-02-size-field-fixed-decimals.md"},
    {"url": "https://github.com/zora4523-bot/gatu-app/pull/145"},
    {"url": "https://github.com/zora4523-bot/gatu-app/pull/147"}
  ],
  "supersedes": []
}
-->
# Codex 补审 PR #145 与 #147：TWAP 历史的小数位兜底与重定基线记录的措辞

## 背景与范围

同步记录，未取得任务标识。2026-11-04 运营方在本会话说「前面提交的PR没有审查的 请调用codex 对抗review一遍」。此前 p38 记录写明本机 Codex CLI 登录失效（`401 Unauthorized`），要等运营方重新登录；本次 `codex login status` 显示「Logged in using ChatGPT」，审查能正常运行。

范围的确定：

- 逐个核对 PR #129 之后的代码 PR（`gh pr list` 与 `dev` 上的任务记录）。#129–#132、#134、#140、#143 都有 Codex CLI 审查记录；晋升 PR（#133、#139、#141、#146）不带自己的代码；纯文档 PR（#135–#138、#142、#144，以及仍开着的 #148）按手册第 7 节不需要。
- 缺审查的是两个：#145（`6c533454`，p38 发布前把 `trade-terminal-page` 基线上调 +66 到 124,070，当时 Codex 401，改由一个只读子代理审查）和 #147（`f67cbe04` 代码与 `ec0b62d3` 记录，历史表格的价格改回协议小数位，只有 GitHub 上的 Codex 机器人看过首个提交）。两者都已合入 `dev`，并随 p38（main `493f3d56`）发布。

本任务在新分支 `claude/twap-history-price-fallback` 上做（`--no-track`，从 `dev` `90c2e436` 切出）。推送与开 PR 都等运营方同意，不发布。

## 结论与依据

**审查方法。** 两路 `codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"low"'` 并行，提示词写明只读、禁止修改与提交，并列出作者意图与攻击面，要求逐条证伪。报告在本会话的临时目录，不进仓库。

**#147：8.3/10，一项 P2，属实。**

- 桌面与手机的 TWAP 历史、TWAP 成交四张表这样取价格选项：`getMarketPriceFormatOptions({ kind: market?.kind, szDecimals })`，其中 `szDecimals` 来自 `markets.getSzDecimals(coin)`。
- `getSzDecimals` 对目录里没有的市场返回默认值 4（`lib/hyperliquid/markets/use-markets.tsx`），于是 helper 不会走 `szDecimals === undefined` 的 8 位兜底，而是按永续算 6 − 4 = 2 位。
- 后果：价格 `0.00001234` 显示为 `$0`。用变异把修复撤回后，测试实际渲染出的正是 `$0`。普通成交历史、委托历史把市场对象本身传进去，兜底正确。
- 这个缺口在 #147 之前就有（当时同样传默认的 4），不是 #147 引入的数值回归，但它与 #147 写进 `docs/trading-toolbar-redesign.md` 的「TWAP 表也包括在内」「目录里没有的市场最多 8 位」相矛盾。
- 测试没有发现它：两份 TWAP 测试的市场替身总是返回现货市场，而且对象里没有 `szDecimals`，只靠单独的 `getSzDecimals()`。
- 另有一项措辞问题也属实：History values 写「均价位数多于价位时历史全部保留」，实际仍受协议小数位上限约束；CHANGELOG 的「never rounded」同样说得太满。

**#145：8.0/10，三项 P2，都属实。数字全部正确。**

- Codex 逐个核对了读数相减、余量、逐块合计与以前几次重定基线的口径，没有发现算错；我也独立算过一遍。+66 的取法与 2026-11-01 那次一致，没有把别的增长抬进基线。
- P2 一：手册第 6 节要求重定基线时记录路由预加载本身的字节数，`docs/terminal-performance-baseline.md` 的表里四份构建都写 `not read`。当时存档的预算报告（另一会话工作树的 `.worklog/2026-11-03/p38-trade-page-rebaseline/*-budget.txt`）只写了「103 个静态闭包资源来自 6 个路由预加载」，没有字节数；构建没有保留，现在补不了，所以只能写明证据缺失。
- P2 二：文档说「no source map or module manifest was produced」。构建其实每次都会写 `client-chunk-graph.json`，带每块的 `modules`（`apps/terminal/vite.config.ts` 的 `sairn-client-chunk-graph` 插件、`scripts/client-chunk-graph.mjs`），只是这次没有读取也没有保留。
- P2 三：文档说配对开关两侧 +66 与 +78 之间的 12 字节「在噪声范围内」。12 字节的上限来自别的读数，`trade-terminal-page` 本身两天之间只变了 0 与 −6，这些测量没有分离配对开关本身的影响。

**修复。**

- 四张 TWAP 表改为 `getMarketPriceFormatOptions(market)`，把 `getMarket()` 返回的市场对象本身交进去（`UnifiedMarket` 带 `kind` 与 `szDecimals`）；市场缺失时就是 `undefined`，走 8 位兜底。数量显示仍用 `getSzDecimals()`。
- 测试：两份 TWAP 测试的市场替身补上真实的 `szDecimals`（桌面 2、手机 3，与原来的 `getSzDecimals()` 一致，#147 的用例结果不变），并加一个开关：打开时 `getMarket` 返回 `undefined`、`getSzDecimals` 返回真实默认值 4。新用例要求均价、触发价与成交价 `0.00001234`、`0.00001235` 原样显示。
- 文档：
  - `docs/terminal-performance-baseline.md` 改正三处，每处注明 2026-11-04 更正及原因；
  - `docs/trading-toolbar-redesign.md` 的 History values 把均价的说法收紧为「保留全部协议小数位、不多于此」，以 BTC 的 88140.56 显示 88,140.6 为例，并写明 TWAP 表的兜底已修；
  - CHANGELOG：Fixed 加一条，并把「never rounded」改为「不再被取整到五位有效数字」；
  - `2026-11-02-size-field-fixed-decimals.md` 末尾追加更正，原文不改。

## 验证与限制

- 环境：Node 22.15.0，pnpm 10.21.0，工作树依赖与 `dev` 的锁文件一致。
- 两份 TWAP 测试 42 项通过，Biome 检查改动的 6 个代码文件无问题。
- 变异（逐个改源码、跑对应测试、还原）：

  | 变异 | 结果 |
  | --- | --- |
  | 桌面 TWAP 历史改回传 `{ kind, szDecimals }` | 新用例失败 |
  | 桌面 TWAP 成交改回 | 新用例失败（渲染出 `$0`） |
  | 手机 TWAP 历史改回 | 新用例失败 |
  | 手机 TWAP 成交改回 | 新用例失败 |
  | helper 缺元数据时的兜底从 8 位改成 6 位 | 桌面、手机两个新用例都失败 |

- AGENTS.md 的「Number and date formatting」与「Spot market names and addresses」两组（去重后 43 个文件）807 项通过；`pnpm --filter @sairn/terminal typecheck` 通过。
- 修复提交的 Codex 复审（同样只读、low，只审 `90c2e436..edf5a5f5` 的 `12241e76` 与 `edf5a5f5`）：9.2/10，无新发现。它判定 #147 的 P2、#145 的两项措辞问题已解决；路由预加载字节数一项，文档已如实写明不满足复现规则，但证据缺口本身仍在。它在只读沙盒里没有运行测试，变异结果以本机运行为准。
- 全量终端 Vitest（`edf5a5f5`，`pnpm --filter @sairn/terminal test --maxWorkers=4`，06:35–06:40 UTC，292 秒）：714 个文件、9,884 项，其中 9,882 项通过、1 项跳过、1 项失败。失败的是 `vite-development-cache.test.ts`，原因是沙盒里 `listen EPERM: operation not permitted 127.0.0.1:5173`；在沙盒外单独重跑这个文件，1 项通过。
- 没做：真实页面上的 TWAP 历史（需要一个目录里已经没有的市场的 TWAP 记录）；生产构建与包体（只是把同一个市场对象直接传进去，预计不变，未测）。

## 后续与替代关系

- 推送分支与开 PR 等运营方同意，一次同意只对应一个动作；不开 auto-merge。
- 2026-11-04 补记（合入与发布）：
  - 运营方说「推送并开 PR」后，发布会话在自己的工作树把 `dev` `163597c6`（#148）合入这个分支，得到 `97f11aba`；生成的 INDEX 冲突用 `pnpm memory:index` 重生。随后推送并开 [#149](https://github.com/zora4523-bot/gatu-app/pull/149)。
  - CI 6 项通过、3 项晋升覆盖按设计跳过，Codex 机器人对 `97f11ab` 无发现。以合并提交 `2230c64e` 合入 `dev`。
  - 同日经晋升 PR #150（`main` `4608bc7c`）发布为 p39，见 [p39 发布记录](2026-11-04-cloudfront-release-p39.md)。
  - 上文「生产构建与包体未测」的部分，后来在发布预检里测了：`trade-terminal-page` 比 p38 的第二次预检少 3 字节。
- 审查里的 P3 与只读推断（例如极大数值受 JavaScript `number` 精度限制、委托历史没有独立的成交均价字段）没有改，记在这里。
- 以后重定基线时，表里的路由预加载一行要真的读出字节数；模块归属需要时读同一次构建写出的 `client-chunk-graph.json`，不要写「没有生成」。

2026-11-09 状态补记：代码修复 `12241e76`、措辞修正 `edf5a5f5` 和记录 `98e37af8` 已经 #149 的 head `97f11abab5514a71ca0a61c22019c1ac6f06e696` 合入 dev（`2230c64e`），再经 #150 进入 p39 的 `4608bc7c`。01:05:27 UTC 的 GitHub 查询返回 #149 已合并，同一 head 汇总 6 SUCCESS、3 SKIPPED。本次静态核对当前四张表都把 market 本身传入 `getMarketPriceFormatOptions`，目录缺失上限八位的规则见现行 History values。发布的 verify 与 CSP 结果来自[p39 记录所在的 #152](https://github.com/zora4523-bot/gatu-app/pull/152)，原文可用 `git show 0d75a146:docs/work-memory/sessions/2026-11-04-cloudfront-release-p39.md` 读取。代码已交付与发布记录 PR 尚未合并是不同状态。没有重跑应用测试、执行发布或验收真实页面。
