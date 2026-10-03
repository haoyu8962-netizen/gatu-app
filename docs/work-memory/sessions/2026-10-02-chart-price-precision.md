<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-chart-price-precision",
  "date": "2026-10-02",
  "title": "TradingView 图表价格精度改由市场元数据按 Hyperliquid 规则决定（ADR 0035）",
  "kind": "task",
  "status": "verified",
  "topics": ["hyperliquid-api", "i18n-runtime"],
  "summary": "图表 pricescale 此前取当前标记价字符串去掉末尾 0 后的小数位，每次创建 widget 都可能不同（HYPE 同一小时出现 2、3、4 位）。399dbbd9 新增 lib/chart/price-format.ts：variable_tick_size 逐值取档，价格跨 10 的幂不重建 widget；数据源回退改用 meta 的 szDecimals 与中间价数量级，删除按尾数推断的函数。gpt-6-astra 三路只读对抗审查发现初版档上限（该档最大合法价）把两档之间的非报价值粗档舍入（99.9991 → 100.00）、CHANGELOG 跨面板一致性说法过强、pricescale 作用范围与“切换市场即重新解析”表述不准、探针可空检查假通过且未接入库升级入口；复核全部成立并修复（3d6a8000）：档上限改为五位有效数字进位阈值前的最后一个双精度数，pricescale 按舍入后的数量级取档，探针逐字对照，库升级说明加探针。对修复的复审确认修复成立，另指出档内十进制半数按双精度舍入（16.0005 → 16.000）与参考价一个双精度分辨率内的取档差异，已收窄文档；探针改按 szDecimals 定档数。首阶段全量单测通过；修复阶段全量在高负载下有 3 个与改动无关的超时，单独重跑通过，未在空闲时重跑全量。单测、变异、无头 Chromium 实测与探针通过；未做生产构建与真人目测。",
  "thread": null,
  "baseCommit": "682430ba",
  "commits": ["399dbbd9"],
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
    { "path": "deploy/manifests/README.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size" },
    { "url": "https://www.tradingview.com/charting-library-docs/latest/connecting_data/Symbology" }
  ],
  "supersedes": []
}
-->
# TradingView 图表价格精度改由市场元数据按 Hyperliquid 规则决定（ADR 0035）

## 背景与范围

同步记录，Claude Code 桌面会话；未取得可核对的任务标识，没有导出本地会话证据到 `.worklog/`（`pnpm memory:capture` 只适配 Codex 会话文件），命令输出保存在会话草稿目录，未入库。

用户在 2026-10-02 指出根因：`getChartPriceScale(market)` 返回 `priceScaleFromMid(market.markPx)`，即标记价字符串去掉末尾 0 后的小数位（夹在 2–8），每次创建 widget（首次加载、语言或数字格式的保存状态重建、覆盖层或主题恢复、历史恢复）都按那一刻的字符串取精度；HYPE（`szDecimals` 2）一小时内在不同实例出现 `O90.00`、`O90.001`、`O90.0860` / `开=90.0010`。要求：精度成为市场的稳定函数，遵循五位有效数字与 `6 - szDecimals`（永续）/ `8 - szDecimals`（现货）上限，与[最近成交](../../recent-trades.md)一致；自行决定价格跨数量级时在不重建 widget 的前提下如何表现；加回归测试，更新归属文档与 CHANGELOG。

基线：本工作树原在 `main` 的 `3ced842e`，树与 `origin/dev` 的 `682430ba` 完全相同，分支没有自有提交且干净，按分支流程对齐到 `682430ba`。工作树缺包级依赖，先运行 `pnpm install --frozen-lockfile --prefer-offline`。第一阶段提交 `399dbbd9`；随后用户要求用 `gpt-6-astra` 对抗审查该提交，审查结论复核后在其上另起修复提交（本记录随修复提交更新）。

## 结论与依据

- 现行方案见 [ADR 0035](../../adr/0035-chart-price-precision-from-market-rules.md)：`getChartPriceFormat(szDecimals, marketType, referencePrice)` 生成 `variable_tick_size` 与 `pricescale`，`getChartSymbolInfo` 与数据源回退共用；删除 `priceScaleFromMid`、`inferPriceScaleFromMids`、`CHART_DEFAULT_PRICESCALE` 与 `getPriceScale` 选项。
  - 每个值的小数位等于它半数进位舍入到五位有效数字后的数量级所对应的小数位，受最大小数位封顶，整数部分超过五位不舍入。
  - 档上限是该档进位阈值（如 99.9995）前的最后一个双精度数（`99.99949999999998`）。
  - `pricescale` 取参考价（`markPx`）舍入到五位有效数字后所在的档；无有效参考价时取最细一档。
- 图表库行为（读打包的 v28.3 源码核实）：
  - `createSeriesFormatter` 在系列精度为默认时把 `variable_tick_size` 交给价格格式化器。
  - 查档时等于上限的价格用该档（`shouldCheckForEquality: true`），TradingView 文档也写“小于或等于”。
  - 价格轴刻度生成器的基数是 `pricescale / minmov`。
  - 系列价格步长 `_recreatePriceStep` 为 `minmov / pricescale`，唯一调用方是用方向键移动选中画线的每步价格变化；个别画线工具按 `1 / base` 取整价格点。
  - `resolveSymbol` 结果按符号缓存在 `_symbolResolveMap`，widget 销毁时才清空。
  - 默认 `inherit` 格式的指标不自建格式化器，回落到主系列。
  - 价格变动按两端价格中较小者取档。
- 合成数据实验（无头 Chromium 加载打包的图表库，静态服务器与合成数据源都在脚本内，脚本读取图例 DOM 与内部价格轴标签，不是人工目测）：
  - 只给 `pricescale` 10000：图例 `O 89.2700`（复现 4 位）。
  - 加 `variable_tick_size` 后，`pricescale` 为 1000 或 10000 时各探测值的格式化结果完全相同。
  - `pricescale` 比当前档细时，价格轴在窄区间与横盘时重复标签（横盘 90.001 时 `90.001` ×8）；等于当前档时不重复。
  - 三种档上限的对比：
    - 以 10 的幂为上限：10 → `10.0000`。
    - 以该档最大合法价为上限：99.9991 → `100.00`、9.99991 → `10.000`、999.991 → `1,000.0`、9999.94 → `10,000`。
    - 以进位阈值本身为上限：99.9995 → `100.000`、9999.95 → `10,000.0`、现货 0.999995 → `1.00000`。
    - 以阈值前一个双精度数为上限：上述各值与 Big.js `prec(5)` 半数进位的结果一致（99.9991 → `99.999`、99.9995 → `100.00`、9999.95 → `10,000`、0.999995 → `1.0000`），近阈值 ±1e-6 两侧也正确。
- 官方终端（2026-10-02 只读下载 `app.hyperliquid.xyz` 的 `index-VjaZKeGd.js` 与 `config-DWzED1yW.js` 并检索）：
  - 数据源 `resolveSymbol` 只给 `minmov: 1, pricescale: this.priceScale`。
  - 精度来自 `10 ** R3((px || 1e3) * .95, 0, Cn(coin))`，`R3` 按五位有效数字、永续 6 / 现货 8 封顶（`szDecimals` 传 0）。
  - `[coin, px]` 存于 `hyperliquid.tv_coin_and_px.v6`。
  - `GX` 在币种或 `floor(log10(px))` 变化时返回 true，调用方如何处理未核实。
- 选择档位而非最大小数位作为 `pricescale`，是因为上面的重复刻度。代价是 `pricescale` 在 widget 生命周期内保持首次解析的档，直到重建或刷新（切走再切回同一市场也沿用缓存）；数值精度不受影响（ADR 代价一节）。

## 对抗审查（gpt-6-astra，三路只读）与处理

- 调用：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"medium"' --output-last-message <报告>`，三路并行约 4 分钟。
  - A 行为正确性：24 条命令，约 12.8 万 token。
  - B 规范与文档：13 条，约 7.8 万。
  - C 遗漏与测试缺口：12 条，约 7.8 万。
- 审查期间未改动工作树。
- 成立并修复：
  - A·P2：两档之间的非报价值被粗档舍入（持仓均价 99.9991 → `100.00`），且 `pricescale` 与阶梯对同一值取档不同。用打包库复现后，按上文改为“进位阈值前最后一个双精度数”加“舍入后取 `pricescale`”。
  - B·P2：CHANGELOG 写“与订单簿、最近成交精度相同”过强（最近成交整列按标记价取一个精度、订单簿受分组影响），“最多五位有效数字”漏了整数例外。已改写 CHANGELOG 与 recent-trades.md。
  - B·P3：ADR 把刻度基数 `pricescale / minmov` 写成“最细刻度”，本记录初版写成“最细步长”；运行约束 §4 说 `pricescale` 只影响轴刻度。按库代码改为“刻度基数与价格步长”。
  - B·P3：初版摘要把官方终端写成“数量级变化时更新单一精度”，超出“只确认判定返回 true”的证据；ADR 把“更新或重建”一并说成违反 §4。均已改写。
  - C·P3：探针在 `variable_tick_size` 为 `"1"` 或单档时检查为空也会通过，只比较小数位数，不核对 ticker。已改为按市场断言 ticker、至少 4 项检查，并对每档四个点逐字对照独立算出的五位有效数字结果。
  - C·P3：库升级入口 `deploy/manifests/README.md` 没有提到探针。已加入两个图表探针。
  - A“无法确认”：库按符号缓存解析结果，“切换市场即更新 `pricescale`”不成立。已核实 `_symbolResolveMap` 并更正 ADR、运行约束与本记录。
- 测试缺口已补：
  - 进位区间与阈值上的参考价（99.9991 → 1000；99.9995、99.9996 → 100）。
  - 参考价只取 `markPx`（`oraclePx`、`midPx` 不同也不受影响）。
  - `szDecimals` 为 `2 ** 53`、`Infinity`。
  - 边界对照加入档界两侧、进位区间与阈值上的价格，预言改为 Big.js `prec(5)`。
  - 同一 widget 切到 BTC 后各用各的格式。
  - 数字格式重建后格式不变。
- 不改：
  - `ChartPriceMarketType` 可不导出（审查明确不算发现）。
  - 提交信息带 `Co-Authored-By` 尾注，来自会话的署名要求。
  - `getTradePriceDecimals` 对 `99.99999999999999999`、`1e1000` 等极端输入与新函数不同，属既有浮点行为，非合法报价，未改。
  - 最近成交在标记价跨档时整列取一个精度，属既有行为，不在本次范围。
- 对修复提交 `3d6a8000` 的窄范围复审（同样参数，单路，9 条命令，约 6.4 万 token，约 3 分钟）：
  - 确认成立：前一个双精度数的写法对 d = 1..8 安全（正常正数、不跨数量级、无科学计数法、`Number()` 可还原），八档阈值及其前一个 Number 显示正确，新常量由实现产生且两种阈值变异会被常量断言抓住，探针不再因空检查或错误 ticker 假通过。
  - P2（收窄表述）：档内十进制半数（16.0005、16.0035）被图表库按双精度舍入为 `16.000`、`16.003`，Big.js 半数进位应为 `16.001`、`16.004`。我用合成实验复现，结果与 `toFixed` 相同；合法报价（16.001、16.004）原样显示。属内置格式化器的既有行为，已在 ADR“其他边界”写明，CHANGELOG 改为“最多五位有效数字”。
  - P3（收窄表述）：参考价字符串 `99.999499999999999` 按 Big.js 落在 3 位档，转成双精度后是 99.9995、图表取 2 位档。ADR 决策 3 改为“对双精度能区分的参考价一致”。
  - P3（修复）：探针的期望档数取自被测阶梯，HYPE 拿到 BTC 的阶梯也会通过。改为按各市场 `szDecimals` 写死最大小数位，校验档数，并加入最新收盘价样本。
  - P3（修复）：本记录摘要把修复阶段的全量单测写成通过，已改。
- 仍是局限：`tradingview-chart.test.tsx` 用模拟 datafeed，只证明组件交给 datafeed 的解析函数在重建与切换后给出同样格式，不能证明真实图表重新解析；真实重建靠下文的无头实测与探针。

## 更正（相对本记录与 ADR 初版）

- 初版档上限“该档最大合法价（9.9999、99.999）”被替换，理由见上；ADR 新增修订记录。
- “`pricescale` 只影响价格轴最细刻度/步长”改为“刻度基数与价格步长”；“直到下一次解析（切换市场、保存状态重建或刷新）”改为“widget 生命周期内保持，直到重建或刷新”。
- “与 `getTradePriceDecimals` 的结果一致”限定为“对合法报价相同”。
- 初版摘要中的官方终端表述改为只陈述已核实的判定。

## 验证与限制

第一阶段，`682430ba` 加改动，即提交 `399dbbd9`，2026-10-02：

- Biome（11 个 TS/TSX 文件）、`pnpm --filter @sairn/terminal typecheck` 通过。
- 新测试 21 项通过；把 `market-symbol.ts`、`symbol.ts` 换回 `682430ba` 版本时 9 项失败。
- AGENTS.md Trading terminal visual contract、Number and date formatting、Recent trades 三组加全部 chart 测试：26 文件 346 项通过。
- 全量 `pnpm --filter @sairn/terminal test`：645 文件通过、1 跳过；8024 项通过、1 跳过；228.55 秒。
- 真实应用：本工作树开发服务器，端口 3027，进程 cwd 已核对；无头 Chromium，脚本读内部模型与图例 DOM。
  - 桌面 1600×1000：HYPE `pricescale` 1000、图例 `O 90.086`；BTC 1；PURR/USDC 100000；HYPE/USDC 1000；xyz:XYZ100 1。
  - 界面切中文触发保存状态重建，新 iframe 同样 1000、图例 `开= 90.086`。
  - 手机 390×844（Markets 视图）一致。
- `pnpm memory:index` 更新索引，`pnpm memory:check` 输出 `Work-memory index verified.`，`pnpm memory:test` 8 项通过。

第二阶段，修复，`399dbbd9` 加改动，2026-10-02：

- `price-format.ts` 与三个测试文件 Biome 通过；typecheck 通过。
- `chart-price-format.test.ts` 29 项通过；`chart-datafeed`、`tradingview-chart` 与它合计 174 项通过。
- 变异：
  - 上限改回该档最大合法价：25 项失败。
  - 改为阈值本身：25 项失败。
  - 去掉 `prec(5)`：2 项失败。
  - `isSafeInteger` 改为 `isInteger`：1 项失败。
  - 每次还原后通过。
- 三组加全部 chart 测试：26 文件 354 项通过。
- 全量 `pnpm --filter @sairn/terminal test`：642 文件通过、3 文件失败、1 跳过，318.60 秒。失败均为超时：`positions-panel-preload` 的 `beforeAll` 30 秒、`chart-store` 一项 10 秒、`global-modals-hip3-disclaimer` 一项 15 秒。当时负载约 35，另有两个会话在跑 vitest。这三个文件都不引用本次改动的模块，单独重跑 46 项通过（`positions-panel-preload` 用时 27 秒）。未在空闲时重跑全量。
- 无头实测：
  - 新探针 `chart-price-format-probe.mjs http://localhost:3027` 退出码 0：HYPE 16 项、BTC 4 项、PURR/USDC 32 项逐字一致。首次运行时 HYPE 因开发服务器冷启动 45 秒内未出图而失败，服务器热起来后重跑通过。
  - 把上限临时改回初版写法时，探针报 13 处不符（如 `99.99949 → 100.00`，应为 `99.999`），退出码 1，已还原。
  - `chart-analytics-probe.mjs http://localhost:3027` 退出码 0。
- 复审后的探针 `chart-price-format-probe.mjs http://localhost:3027` 退出码 0：HYPE 17 项（含收盘价 90.283）、BTC 5 项（86304）、PURR/USDC 33 项（0.1771）。把 `getChartSymbolInfo` 临时改成所有市场都用 `szDecimals` 5 时，HYPE 与 PURR/USDC 因档数不符失败、退出码 1，已还原。这一轮只改探针与文档，未重跑单测。
- 修复后重新运行 `pnpm memory:index`（索引更新）、`pnpm memory:check`（`Work-memory index verified.`）、`pnpm memory:test`（8 项通过）。
- 两次启动开发服务器都因 3005、3015 被其他会话占用，临时在 `.claude/launch.json` 加 3027 配置，启动后立即还原，未提交。
- 未覆盖：
  - 生产构建与 Playwright 浏览器套件未运行；没有人工目测或真机。
  - 真实行情跨 10 的幂只有单测、合成实验与探针覆盖。
  - 覆盖层线条（均价、强平价）在真实页面上的标签未单独实测，只有格式化器层面的证据。
  - 用户把图表“精度”改成非默认值的路径未测。

## 后续与替代关系

- 升级图表库时按 `deploy/manifests/README.md` 运行两个图表探针并保存输出。
- ADR 编号 0035：0033、0034 在本机未推送分支上，合入时 ADR 索引表可能出现相邻行冲突，按编号顺序合并即可。
- 若以后要求跨档后价格轴刻度也立即跟上，需要不重建 widget 就让 TradingView 重新解析同一符号的办法，目前没有，未排期。
- 已对修复提交 `3d6a8000` 做窄范围复审（见上）；之后只改了探针与文档，未再复审。
- 没有被替代的记录。
