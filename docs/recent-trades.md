# 最近成交面板规范

桌面订单簿与最近成交共用一个全宽、互斥的标签面板。切换标签时只挂载当前标签的订阅；不得同时挂载订单簿与成交订阅来模拟上下堆叠布局。

## 几何

- 行显示 `Price / Size / Time`，表头与行共用同一 `trades-grid` 网格定义；正常桌面宽度下列比例为 `1fr / 2fr / 2fr`，行高 24px（`h-6`），与终端的数据密度一致。
- 响应式断点由 `orderbook-panel` 容器查询决定，不读取页面视口：宽度低于 240px 时隐藏可见的标签文字但保留可访问名称；低于 200px 时隐藏 `Time`，保留两列 `Price / Size`。中间档位收窄列的最小宽度，定义见 `apps/terminal/src/styles.css` 的 `.trades-grid` 规则。
- 紧凑（移动）视图使用两列网格与更小字号，遵循相同的字符串与精度规则。

## 数据

- WebSocket `px`、`sz` 保持字符串，直到格式化或 Big.js 计算；计价资产口径的成交额在 `lib/trade/trades.ts` 中用 Big.js 计算，不在行渲染器里做 JavaScript 数字乘法。
- 价格精度由所选市场推导，不写死小数位：同时满足 Hyperliquid 的两项约束——至多五位有效数字，且小数位不超过永续 `6 - szDecimals`、现货 `8 - szDecimals`（`szDecimalsToPriceDecimals`）。分组精度同样受这两项约束。
- TradingView 图表按同一规则逐个价格取小数位（`variable_tick_size`），`pricescale` 取标记价数量级所在档，与 `getTradePriceDecimals` 的结果一致；两者都不看价格字符串的尾数，见 [ADR 0035](adr/0035-chart-price-precision-from-market-rules.md)。
- 成交时间显示为本地 24 小时制 `HH:mm:ss`（`hourCycle: "h23"`）。
- 成交身份使用 `(time, coin, tid)` 三元组（`getTradeKey`），处理后的 UI 数据与订阅累积层使用同一键，避免重复或丢失。

## 验证

修改列定义、断点或精度时，在 1001px、1420px 附近及最窄容器宽度下核对表头与行对齐、`Time` 列隐藏、标签可访问名称保留。运行：

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/trades.test.ts \
  src/lib/tests/trades-panel.test.tsx \
  src/lib/tests/trade-row.test.tsx
```
