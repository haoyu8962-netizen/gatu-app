<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-chart-price-precision",
  "date": "2026-10-02",
  "title": "TradingView 图表价格精度改由市场元数据按 Hyperliquid 规则决定（ADR 0035）",
  "kind": "task",
  "status": "verified",
  "topics": ["hyperliquid-api", "i18n-runtime"],
  "summary": "图表 pricescale 此前取当前标记价字符串去掉末尾 0 后的小数位，每次创建 widget 都可能不同（HYPE 同一小时出现 2、3、4 位）。新增 lib/chart/price-format.ts：variable_tick_size 按五位有效数字与 6/8 - szDecimals 逐值取最小变动价位，档上限取该档最大的五位有效数字价格（图表库把等于上限的价格归入较细一档）；pricescale 取标记价数量级所在档，只影响价格轴最细刻度；价格跨 10 的幂不重建 widget。数据源回退改用 meta 的 szDecimals 与中间价数量级，删除按尾数推断的函数与多余的 getPriceScale。打包库合成实验确认 pricescale 比档位细时横盘价格轴重复标签，据此选档位而非最大小数位；对照官方终端（数量级变化时更新单一精度、不用阶梯）。单测、变异、全量单测、无头 Chromium 实测（桌面五个市场、语言重建、手机三个市场）与新增库升级探针通过；未做生产构建与真人目测。",
  "thread": null,
  "baseCommit": "682430ba",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/lib/chart/price-format.ts" },
    { "path": "apps/terminal/src/lib/chart/market-symbol.ts" },
    { "path": "apps/terminal/src/components/trade/chart/datafeed.ts" },
    { "path": "apps/terminal/src/components/trade/chart/tradingview-chart.tsx" },
    { "path": "apps/terminal/src/lib/tests/chart-price-format.test.ts" },
    { "path": "apps/terminal/src/lib/tests/chart-datafeed.test.ts" },
    { "path": "apps/terminal/src/lib/tests/tradingview-chart.test.tsx" },
    { "path": "apps/terminal/tests/browser/chart-price-format-probe.mjs" },
    { "path": "docs/adr/0035-chart-price-precision-from-market-rules.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/recent-trades.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size" },
    { "url": "https://www.tradingview.com/charting-library-docs/latest/connecting_data/Symbology" }
  ],
  "supersedes": []
}
-->
# TradingView 图表价格精度改由市场元数据按 Hyperliquid 规则决定（ADR 0035）

## 背景与范围

同步记录，Claude Code 桌面会话；未取得可核对的任务标识，没有导出本地会话证据到 `.worklog/`（`pnpm memory:capture` 只适配 Codex 会话文件）。

用户在 2026-10-02 指出根因：`getChartPriceScale(market)` 返回 `priceScaleFromMid(market.markPx)`，即标记价字符串去掉末尾 0 后的小数位（夹在 2–8），每次创建 widget（首次加载、语言或数字格式的保存状态重建、覆盖层或主题恢复、历史恢复）都按那一刻的字符串取精度；HYPE（`szDecimals` 2）一小时内在不同实例出现 `O90.00`、`O90.001`、`O90.0860` / `开=90.0010`。要求：精度成为市场的稳定函数，遵循五位有效数字与 `6 - szDecimals`（永续）/ `8 - szDecimals`（现货）上限，与[最近成交](../../recent-trades.md)一致；自行决定价格跨数量级时在不重建 widget 的前提下如何表现；加回归测试，更新归属文档与 CHANGELOG。

基线：本工作树原在 `main` 的 `3ced842e`，树与 `origin/dev` 的 `682430ba` 完全相同，分支没有自有提交且干净，按分支流程对齐到 `682430ba`。工作树缺包级依赖，先运行 `pnpm install --frozen-lockfile --prefer-offline`。

## 结论与依据

- 方案见 [ADR 0035](../../adr/0035-chart-price-precision-from-market-rules.md)：`getChartPriceFormat(szDecimals, marketType, referencePrice)` 生成 `variable_tick_size`（逐值按档）与 `pricescale`（标记价数量级所在档，无参考价时取最细一档）；`getChartSymbolInfo` 与数据源回退共用；删除 `priceScaleFromMid`、`inferPriceScaleFromMids`、`CHART_DEFAULT_PRICESCALE` 与 `getPriceScale` 选项。
- 图表库行为（读打包的 v28.3 源码核实）：`createSeriesFormatter` 在系列精度为默认时把 `variable_tick_size` 交给价格格式化器；格式化时按价格查档，等于上限的价格用该档（`shouldCheckForEquality: true`），TradingView 文档也写“小于或等于”；价格轴刻度生成器的最细步长是 `pricescale / minmov`，与 `variable_tick_size` 无关。
- 合成数据实验（无头 Chromium 加载打包的图表库，静态服务器与合成数据源都在脚本内，脚本读取图例 DOM 与内部价格轴标签，不是人工目测）：
  - 只给 `pricescale` 10000：图例 `O 89.2700`（复现 4 位）。
  - 加 `variable_tick_size` 后，`pricescale` 为 1000 或 10000 时图例同为 `O 89.270`，各探测值的格式化结果完全相同。
  - `pricescale` 10000（比当前档细）：放大到 90.000–90.006 时价格轴为 `90.006, 90.006, 90.005, 90.005 …`；横盘 90.001 时 `90.001` 连续 8 个。`pricescale` 1000 时标签各不相同。
  - 跨 100（97–103，`pricescale` 1000）：轴为 `103.00 … 100.00, 99.000 …`，无重复。
  - 以 10 的幂为上限时 10 → `10.0000`、100 → `100.000`、10000 → `10,000.0`；以 9.9999、99.999 … 为上限时 → `10.000`、`100.00`、`10,000`，与 Hyperliquid 规则及订单簿悬浮的 `getOrderbookHoverPriceDecimals` 一致。
- 官方终端（2026-10-02 只读下载 `app.hyperliquid.xyz` 的 `index-VjaZKeGd.js` 与 `config-DWzED1yW.js` 并检索）：数据源 `resolveSymbol` 只给 `minmov: 1, pricescale: this.priceScale`；精度来自 `10 ** R3((px || 1e3) * .95, 0, Cn(coin))`，`R3` 按五位有效数字、永续 6 / 现货 8 封顶（`szDecimals` 传 0）；`[coin, px]` 存于 `hyperliquid.tv_coin_and_px.v6`；`GX` 在币种或 `floor(log10(px))` 变化时返回 true，调用方的具体处理未逐行核对。未采用的理由见 ADR。
- 选择档位而非最大小数位作为 `pricescale`，是因为上面的重复刻度；代价是会话内跨档后轴刻度保持解析时那一档，直到下一次解析，数值精度不受影响（ADR 代价一节）。

## 验证与限制

工作区版本：基线 `682430ba` 加本次改动，2026-10-02。

- `pnpm exec biome check`（改动与新增的 11 个 TS/TSX 文件）通过；`pnpm --filter @sairn/terminal typecheck` 通过。
- 新增 `chart-price-format.test.ts` 21 项通过。变异：把 `market-symbol.ts`、`symbol.ts` 换回 `682430ba` 版本，八类市场用例与跨档用例共 9 项失败，还原后通过。
- 旧断言更正：`tradingview-chart.test.tsx` 中 ETH/USDH（现货、`szDecimals` 5、标记价 `68.7000`）原钉住 `pricescale: 100`（去 0 后 1 位、夹到 2 位），按规则应为 3 位，改为 1000 并加 `variable_tick_size`。
- AGENTS.md Trading terminal visual contract、Number and date formatting、Recent trades 三组加全部 chart 相关测试：26 文件 346 项通过。
- 全量 `pnpm --filter @sairn/terminal test`：645 文件通过、1 跳过，8024 项通过、1 跳过，228.55 秒（代码在此后未再改动，只改文档与测试注释）。
- 真实应用（本工作树开发服务器，端口 3027，进程 cwd 已核对；无头 Chromium，脚本读内部模型与图例 DOM）：
  - 桌面 1600×1000：HYPE `pricescale` 1000、图例 `O 90.086 H 90.339 L 89.500`；BTC 1、`O 85,963`；PURR/USDC 100000、`O 0.17143`；HYPE/USDC（`@107`）1000、`O 90.125`；xyz:XYZ100 1、`O 30,615`。
  - 通过界面切换到中文触发保存状态重建：iframe 换新，新实例同样 1000 与同一 `variable_tick_size`，图例 `开= 90.086 高= 90.339 低= 89.500`。截图中价格轴 `95.000 … 84.000`、最新价 `89.762`、订单簿与页头均为 3 位。
  - 手机 390×844（经 Markets 视图）：HYPE、PURR/USDC、BTC 与桌面一致。
  - 新增 `node apps/terminal/tests/browser/chart-price-format-probe.mjs http://localhost:3027` 退出码 0：HYPE 9.9999 → `9.9999`、10 → `10.000`、100 → `100.00`、1000 → `1,000.0`、10000 → `10,000`；PURR/USDC 0.001 → `0.0010000` 等全部符合。
- 为在 3015、3005 被其他会话占用时启动服务器，临时在 `.claude/launch.json` 加 3027 配置，启动后立即还原，未提交。
- 未覆盖：生产构建与 Playwright 浏览器套件未运行；没有人工目测或真机；真实行情跨 10 的幂只有单测与合成实验覆盖；用户在图表设置里改“精度”时库不读 `variable_tick_size`（设计如此，未测）。

## 后续与替代关系

- 升级图表库后运行 `chart-price-format-probe.mjs`（运行约束 §4 已写明）。
- ADR 编号 0035：0033、0034 在本机未推送分支上，合入时 ADR 索引表可能出现相邻行冲突，按编号顺序合并即可。
- 若以后要求跨档后价格轴刻度也立即跟上，需要在不重建 widget 的前提下重新解析符号，目前没有这样的 API，未排期。
- 没有被替代的记录。
