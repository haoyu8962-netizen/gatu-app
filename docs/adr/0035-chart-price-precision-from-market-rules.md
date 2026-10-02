# ADR 0035：图表价格精度由市场元数据按 Hyperliquid 价格规则决定

状态：已接受并实施（2026-10-02）；未推送、未合入、未发布。0033、0034 已被本机其他未推送分支（邮箱静默建钱包、Privy 银行卡入金）使用，本记录使用 0035。

## 背景

2026-10-02 在 `origin/dev`（`682430ba`）确认：`getChartPriceScale(market)` 返回 `priceScaleFromMid(market.markPx)`，即当前标记价字符串去掉末尾 0 后的小数位数（夹在 2–8 之间），经数据源的 `resolveSymbol` 交给 TradingView。每次创建 widget（首次加载、语言或数字格式变化的保存状态重建、覆盖层或主题恢复、历史恢复）都取那一刻字符串的精度。同一小时内 HYPE（`szDecimals` 2）在不同图表实例里出现 `O90.00`（2 位）、`O90.001`（3 位）、`O90.0860` / `开=90.0010`（4 位）。`priceScaleFromSzDecimals` 只在缺标记价时使用，且把下限夹到 2 位；数据源在缺应用市场元数据时按 `allMids` 中间价字符串推断，同样依赖尾数。

Hyperliquid 的价格规则（[Tick and lot size](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size)）：最多 5 位有效数字，小数位不超过永续 `6 - szDecimals`、现货 `8 - szDecimals`，整数价格总是允许。HIP-3 市场是永续。[最近成交](../recent-trades.md)、市场头与订单簿已经按这两条约束推导精度。

## 目标与约束

- 图表价格精度是市场的稳定函数，与标记价字符串的尾数和 widget 的创建时机无关，与最近成交的推导一致。
- 价格跨过 10 的幂（五位有效数字对应的小数位随之变化）时不为此重建 widget（[运行约束 §4](../runtime-guardrails.md#4-tradingview-lifecycle)）。
- 协议价格保持字符串，数量级用 Big.js 指数计算。数字格式设置（`numeric_formatting`）与图表语言的现有行为不变。

## 决策

1. `apps/terminal/src/lib/chart/price-format.ts` 的 `getChartPriceFormat(szDecimals, marketType, referencePrice)` 生成 TradingView 的 `pricescale` 与 `variable_tick_size`。`getChartSymbolInfo` 用市场的 `szDecimals`、类型（现货为 `spot`，永续与 HIP-3 为 `perp`）和 `markPx` 调用它；数据源原样传给 `LibrarySymbolInfo`。
2. `variable_tick_size` 描述每个价格区间的最小变动价位，从 `10^-最大小数位` 逐档到 `1`。图表库的价格格式化器逐值查档，所以图例、价格轴、最新价与十字线的小数位只取决于这个值本身，价格跨档无需重建。图表库把等于区间上限的价格归入较细的一档，所以每档上限取“仍保留该档小数位的最大五位有效数字价格”。例如 `szDecimals` 为 2 的永续是 `0.0001 9.9999 0.001 99.999 0.01 999.99 0.1 9999.9 1`。以 10 的幂为上限会让恰好等于 10、100、10000 的价格多显示一位。
3. `pricescale` 取参考价格所在档的最小变动价位，只看数量级（Big.js 指数），不看尾数；参考价缺失或不为正数时取该市场最细的一档。它不改变任何数值的显示精度，只决定价格轴最细的刻度间距和部分画线工具的吸附步长。
4. `szDecimals` 缺失或不是非负整数时按协议最大小数位（永续 6、现货 8）处理，宁可多显示也不隐藏位数；只允许整数价格（最大小数位为 0）时不传 `variable_tick_size`。
5. 数据源在应用没有提供市场时只能核实主 dex 永续，这条回退路径改用 `meta` 的 `szDecimals` 与 `allMids` 中间价的数量级调用同一函数。删除按尾数推断的 `priceScaleFromMid`、`inferPriceScaleFromMids`、`CHART_DEFAULT_PRICESCALE` 和数据源的 `getPriceScale` 选项（应用里 `getSymbolInfo` 找不到市场时它也必然找不到，只会产出不带阶梯的精度）。

## 备选方案与代价

- 继续按标记价字符串推断：即本缺陷。
- `pricescale` 固定为 `10^最大小数位`、不用阶梯：BTC 会显示 `118234.0`、HYPE 显示 `90.0010`，与订单簿、最近成交不一致。
- `pricescale` 固定为 `10^最大小数位` 并加阶梯：数值显示正确，但价格轴可以细分到比当前档更细，窄区间与横盘时出现重复刻度。打包库的合成数据实验里，横盘 `90.001` 的价格轴把同一标签连续画了 8 次。
- 官方终端（2026-10-02 读取 `app.hyperliquid.xyz` 的公开前端包）：`pricescale` 为 `10^R3(价格 × 0.95)`，`R3` 按五位有效数字、永续 6 / 现货 8 位封顶（调用时 `szDecimals` 传 0），参考价以 `[coin, px]` 存在 `hyperliquid.tv_coin_and_px.v6`。币种或价格数量级（`floor(log10)`）变化时 `GX` 判定需要更新，调用方的具体处理未逐行核对；数据源只给 `minmov: 1` 和这个 `pricescale`，不用 `variable_tick_size`。不采用：单一精度要靠更新或重建图表跟上数量级变化，违反 §4，且不按 `szDecimals` 封顶。
- 自定义 `custom_formatters.priceFormatterFactory`：需要自行处理数字分组、小数点与 `numeric_formatting`；内置格式化器已经能逐值查档，不采用。

代价：同一页面会话里价格跨过 10 的幂后，`pricescale` 保持解析时那一档，直到下一次解析（切换市场、保存状态重建或刷新）。新档更粗时（例如 99.999 → 100.01），价格轴在极窄区间（约十个最小变动价位以内）可能出现重复刻度；新档更细时，轴刻度只是不能细分到新档。数值的显示精度不受影响。用户在图表设置里把“精度”改成非默认值时，图表库不再读 `variable_tick_size`，这是用户的显式选择。

## 证据

- 代码：`apps/terminal/src/lib/chart/price-format.ts`、`apps/terminal/src/lib/chart/market-symbol.ts`、`apps/terminal/src/components/trade/chart/datafeed.ts`、`apps/terminal/src/components/trade/chart/tradingview-chart.tsx`。
- 测试：`apps/terminal/src/lib/tests/chart-price-format.test.ts`（永续、现货、HIP-3 共八类市场在多种尾数下钉住 `pricescale` 与 `variable_tick_size`，并与 `getTradePriceDecimals` 对照；按图表库“等于上限归入较细一档”的规则逐个检查区间边界）、`chart-datafeed.test.ts`、`tradingview-chart.test.tsx`（标记价变化与跨档不重建 widget，语言重建后格式不变）。
- 打包的图表库 v28.3：系列格式化器在精度为默认时读取 `variable_tick_size`；区间查找对等于上限的价格返回该档；价格轴最细刻度为 `pricescale / minmov`。单测只能模拟这条查找规则，升级图表库后运行 `node apps/terminal/tests/browser/chart-price-format-probe.mjs <origin>`：它在真实图表里逐档格式化区间上限与下一个 10 的幂，小数位不符即失败退出。
- 参考：[运行约束 §4](../runtime-guardrails.md#4-tradingview-lifecycle)、[最近成交](../recent-trades.md)。

本次实际执行的命令、结果与限制见[任务记录](../work-memory/sessions/2026-10-02-chart-price-precision.md)。
