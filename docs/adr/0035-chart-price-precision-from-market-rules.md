# ADR 0035：图表价格精度由市场元数据按 Hyperliquid 价格规则决定

状态：已接受并实施（2026-10-02）；同日经对抗审查修订，见文末修订记录；未推送、未合入、未发布。0033、0034 已被本机其他未推送分支（邮箱静默建钱包、Privy 银行卡入金）使用，本记录使用 0035。

## 背景

2026-10-02 在 `origin/dev`（`682430ba`）确认：`getChartPriceScale(market)` 返回 `priceScaleFromMid(market.markPx)`，即当前标记价字符串去掉末尾 0 后的小数位数（夹在 2–8 之间），经数据源的 `resolveSymbol` 交给 TradingView。每次创建 widget（首次加载、语言或数字格式变化的保存状态重建、覆盖层或主题恢复、历史恢复）都取那一刻字符串的精度。同一小时内 HYPE（`szDecimals` 2）在不同图表实例里出现 `O90.00`（2 位）、`O90.001`（3 位）、`O90.0860` / `开=90.0010`（4 位）。`priceScaleFromSzDecimals` 只在缺标记价时使用，且把下限夹到 2 位；数据源在缺应用市场元数据时按 `allMids` 中间价字符串推断，同样依赖尾数。

Hyperliquid 的价格规则（[Tick and lot size](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size)）：最多 5 位有效数字，小数位不超过永续 `6 - szDecimals`、现货 `8 - szDecimals`，整数价格总是允许。HIP-3 市场是永续。[最近成交](../recent-trades.md)与市场头按这两条约束、以标记价的数量级为整列取一个精度；订单簿另受用户选择的分组影响。

## 目标与约束

- 图表价格精度是市场的稳定函数，与标记价字符串的尾数和 widget 的创建时机无关，遵循与最近成交相同的规则。
- 价格跨过 10 的幂（五位有效数字对应的小数位随之变化）时不为此重建 widget（[运行约束 §4](../runtime-guardrails.md#4-tradingview-lifecycle)）。
- 协议价格保持字符串，数量级用 Big.js 计算。数字格式设置（`numeric_formatting`）与图表语言的现有行为不变。

## 决策

1. `apps/terminal/src/lib/chart/price-format.ts` 的 `getChartPriceFormat(szDecimals, marketType, referencePrice)` 生成 TradingView 的 `pricescale` 与 `variable_tick_size`。`getChartSymbolInfo` 用市场的 `szDecimals`、类型（现货为 `spot`，永续与 HIP-3 为 `perp`）和 `markPx` 调用它；数据源原样传给 `LibrarySymbolInfo`。
2. `variable_tick_size` 描述每个价格区间的最小变动价位，从 `10^-最大小数位` 逐档到 `1`。图表库的价格格式化器逐值查档，所以图例、价格轴标签、最新价与十字线的小数位只取决于这个值本身，价格跨档无需重建。每个值的小数位等于它四舍五入（半数进位）到五位有效数字后的数量级所对应的小数位，再受最大小数位封顶；整数部分超过五位的价格不舍入。图表库把等于档上限的价格归入较细的一档，所以每档上限取“该档进位阈值之前的最后一个双精度数”。例如 3 位小数一档的进位阈值是 99.9995，上限为 `99.99949999999998`：99.9991 → `99.999`，99.9995、99.9996 与 100 → `100.00`。`szDecimals` 为 2 的永续是 `0.0001 9.999949999999998 0.001 99.99949999999998 0.01 999.9949999999999 0.1 9999.949999999999 1`。
3. `pricescale` 取参考价格按同一规则所在的档：先把参考价（`markPx`）舍入到五位有效数字，再取 Big.js 指数，所以对双精度能区分的参考价，它与图表对该价格使用的档一致（只有与进位阈值相差不到一个双精度分辨率的高精度字符串可能分到相邻档），且不看尾数；参考价缺失或不为正数时取该市场最细的一档。默认价格格式下它不参与数值的格式化，只决定价格轴刻度的基数 `pricescale / minmov`（最小刻度间距为 `minmov / pricescale`）、系列的价格步长 `minmov / pricescale`（用方向键移动选中的画线时每步的价格变化），以及个别画线工具对价格点取整的步长。
4. `szDecimals` 缺失或不是非负安全整数时按协议最大小数位（永续 6、现货 8）处理，宁可多显示也不隐藏位数；只允许整数价格（最大小数位为 0）时不传 `variable_tick_size`。
5. 数据源在应用没有提供市场时只能核实主 dex 永续，这条回退路径改用 `meta` 的 `szDecimals` 与 `allMids` 中间价的数量级调用同一函数。删除按尾数推断的 `priceScaleFromMid`、`inferPriceScaleFromMids`、`CHART_DEFAULT_PRICESCALE` 和数据源的 `getPriceScale` 选项（应用里 `getSymbolInfo` 找不到市场时它也必然找不到，只会产出不带阶梯的精度）。

## 备选方案与代价

- 继续按标记价字符串推断：即本缺陷。
- `pricescale` 固定为 `10^最大小数位`、不用阶梯：BTC 会显示 `118234.0`、HYPE 显示 `90.0010`。
- `pricescale` 固定为 `10^最大小数位` 并加阶梯：数值显示正确，但价格轴可以细分到比当前档更细，窄区间与横盘时出现重复刻度。打包库的合成数据实验里，横盘 `90.001` 的价格轴把同一标签连续画了 8 次。
- 档上限取 10 的幂：恰好等于 10、100、10000 的价格多显示一位（10 → `10.0000`）。
- 档上限取该档最大的合法价格（9.9999、99.999，即本 ADR 初版）：两档之间的非报价值（持仓均价、强平价、指标值）被粗档舍入，99.9991 → `100.00`、9999.94 → `10,000`。
- 档上限取进位阈值本身（99.9995）：恰好等于阈值的值多显示一位，例如 99.999 与 100.00 两笔等量成交的均价 99.9995 显示为 `100.000`。
- 官方终端（2026-10-02 读取 `app.hyperliquid.xyz` 的公开前端包）：`pricescale` 为 `10^R3(价格 × 0.95)`，`R3` 按五位有效数字、永续 6 / 现货 8 位封顶（调用时 `szDecimals` 传 0），参考价以 `[coin, px]` 存在 `hyperliquid.tv_coin_and_px.v6`；数据源只给 `minmov: 1` 和这个 `pricescale`，不用 `variable_tick_size`。`GX` 在币种或价格数量级（`floor(log10)`）变化时返回 true，调用方如何处理未核实。不采用：单一 `pricescale` 不能让同一张图里不同数量级的价格各取各的精度；TradingView 在 widget 生命周期内缓存每个符号的解析结果，本仓库没有找到不重建 widget 就让它重新解析同一符号的接口；它也不按 `szDecimals` 封顶。
- 自定义 `custom_formatters.priceFormatterFactory`：需要自行处理数字分组、小数点与 `numeric_formatting`；内置格式化器已经能逐值查档，不采用。

代价：`pricescale` 在 widget 的整个生命周期里保持首次解析时那一档。图表库按符号缓存解析结果（`_symbolResolveMap`，widget 销毁时才清空），切走再切回同一市场也沿用它，直到 widget 重建（语言、数字格式、恢复）或页面刷新。价格跨过 10 的幂后，若新档更粗（99.999 → 100.01），价格轴在极窄区间（约十个最小变动价位以内）可能出现重复刻度，方向键移动画线仍按旧档步长；若更细，轴刻度与这些步长只是不能细分到新档。数值的显示精度不受影响。

其他边界：档决定小数位，数值本身由图表库用双精度舍入。十进制下恰好在半数上的非报价值（例如 16.0005）的双精度略小于它，可能向下舍入显示为 `16.000`，与 JavaScript 的 `toFixed` 相同；合法报价的小数位不超过所在档，按所在档显示时不需要舍入，不受影响。价格变动（例如图例里的涨跌额）由图表库按两端价格中较小者取档。用户在图表设置里把“精度”改成非默认值时，图表库不再读 `variable_tick_size`。`getTradePriceDecimals`（最近成交、市场头）按标记价的指数取档、不先舍入；两者对所有合法报价结果相同，只在进位区间内的非报价值（如 99.9996）与浮点转换的极端输入上不同。

## 证据

- 代码：`apps/terminal/src/lib/chart/price-format.ts`、`apps/terminal/src/lib/chart/market-symbol.ts`、`apps/terminal/src/components/trade/chart/datafeed.ts`、`apps/terminal/src/components/trade/chart/tradingview-chart.tsx`。
- 测试：`apps/terminal/src/lib/tests/chart-price-format.test.ts`（永续、现货、HIP-3 共八类市场在多种尾数下钉住 `pricescale` 与 `variable_tick_size`，并与 `getTradePriceDecimals` 对照；进位区间与恰好等于阈值的参考价；按图表库“等于上限归入较细一档”的查找规则，把档界两侧、进位区间与阈值上的价格与 Big.js 五位有效数字舍入逐一对照）、`chart-datafeed.test.ts`、`tradingview-chart.test.tsx`（标记价变化与跨档不重建 widget；语言与数字格式重建后格式不变；同一 widget 切到第二个市场后各用各的格式）。
- 打包的图表库 v28.3：系列格式化器在精度为默认时读取 `variable_tick_size`；区间查找对等于上限的价格返回该档；价格轴刻度基数为 `pricescale / minmov`；系列价格步长为 `minmov / pricescale`；`resolveSymbol` 结果按符号缓存到 widget 销毁。单测只能模拟这条查找规则，升级图表库后运行 `node apps/terminal/tests/browser/chart-price-format-probe.mjs <origin>`：它按各市场的 `szDecimals` 确定应有的档数，在真实图表里对每一档格式化该档最大合法价、进位阈值前后的值与下一个 10 的幂，再加最新一根 K 线的收盘价，逐字对照五位有效数字半数进位的结果；ticker、档数或任一文本不符即失败退出。
- 参考：[运行约束 §4](../runtime-guardrails.md#4-tradingview-lifecycle)、[最近成交](../recent-trades.md)。

本次实际执行的命令、结果与限制见[任务记录](../work-memory/sessions/2026-10-02-chart-price-precision.md)。

## 修订记录

- 2026-10-02：`gpt-6-astra` 三路只读对抗审查发现初版档上限（该档最大合法价格）会把两档之间的非报价值粗档舍入（99.9991 → `100.00`），改为进位阈值前的最后一个双精度数，`pricescale` 改按舍入到五位有效数字后的数量级取档；同时更正 `pricescale` 的作用范围（还包括价格步长）、“切换市场即重新解析”的说法与官方终端行为的表述。
- 2026-10-02：对修复提交的复审确认上述修复成立，另指出档内十进制半数由双精度舍入（16.0005 → `16.000`）、参考价取档在一个双精度分辨率内可能与图表不同、探针的期望档数取自被测阶梯；前两项收窄为本文“其他边界”与决策 3 的表述，探针改为按 `szDecimals` 确定档数并加入收盘价样本。
