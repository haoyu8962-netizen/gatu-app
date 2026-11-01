# 最近成交面板规范

桌面订单簿与最近成交共用一个全宽、互斥显示的标签面板。面板为当前市场各保持一个 `l2Book` 与一个 `trades` 订阅：成交在订单簿标签下预热（`trades-panel.test.tsx` 的 prewarm 用例），与官方终端相同（官方两个面板常驻、只用 CSS 隐藏，书本订阅在应用级 Provider，切到成交标签不会退订）；不得为模拟上下堆叠布局重复挂载订单簿或成交订阅。（2026-10-31，P2 C12：原句「切换标签时只挂载当前标签的订阅」与 2026-07-22 有意加入的预热及其测试矛盾，按代码与官方行为更正。）

## 几何

- 行显示 `Price / Size / Time`，表头与行共用同一 `trades-grid` 网格定义；正常桌面宽度下列比例为 `1fr / 2fr / 2fr`，行高 24px（`h-6`），与终端的数据密度一致。
- 响应式断点由 `orderbook-panel` 容器查询决定，不读取页面视口：宽度低于 240px 时隐藏可见的标签文字但保留可访问名称；低于 200px 时隐藏 `Time`，保留两列 `Price / Size`。中间档位收窄列的最小宽度，定义见 `apps/terminal/src/styles.css` 的 `.trades-grid` 规则。
- 紧凑（移动）视图使用两列网格与更小字号，遵循相同的字符串与精度规则。

## 数据

- WebSocket `px`、`sz` 保持字符串，直到格式化或 Big.js 计算。
- 数量恒为基础资产：表头 `Size (基础资产)`，按 `szDecimals` 显示，不随下单数量或订单簿的单位切换，与官方终端相同（2026-11-01，审查 M9，[ADR 0046](adr/0046-one-size-unit-for-order-entry-and-order-book.md)）。此前跟随订单簿单位显示计价成交额，`getTradeQuoteSize` 已删除。
- 价格精度由所选市场推导，不写死小数位：同时满足 Hyperliquid 的两项约束——至多五位有效数字，且小数位不超过永续 `6 - szDecimals`、现货 `8 - szDecimals`（`szDecimalsToPriceDecimals`）。分组精度同样受这两项约束。
- TradingView 图表遵循同样的两项约束，但逐个价格取档（`variable_tick_size`，按舍入到五位有效数字后的数量级），而本面板以标记价的数量级为整列取一个精度；两者都不看价格字符串的尾数，对合法报价的小数位相同，见 [ADR 0035](adr/0035-chart-price-precision-from-market-rules.md)。
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
