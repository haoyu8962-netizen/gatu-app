你是严格的对抗式代码审查者。请只审查本次 TradingView 稳定性修复，不要修改代码，不要提出大范围重构。

上下文：
- 项目是 Sairn，一个 Hyperliquid 交易终端。
- 用户在移动端/生产环境盯盘时，TradingView 偶发出现“出错了 / 重试”。本轮修复重点是移除前端自定义的 12 秒 onChartReady 超时销毁逻辑，避免 widget 因移动端加载慢、Safari 暂停、Service Worker 缓存或网络慢而被误判失败并销毁。
- 官方依据：
  1. Hyperliquid WebSocket 文档规定 candle 实时订阅格式为 `{ "method": "subscribe", "subscription": { "type": "candle", "coin": "<coin_symbol>", "interval": "<candle_interval>" } }`，退订用 `{ "method": "unsubscribe", "subscription": { ... } }` 且 subscription 必须匹配原订阅。
  2. Hyperliquid WebSocket 心跳文档说明服务端 60 秒无消息会关闭连接，客户端可发送 `{ "method": "ping" }`，服务端返回 `{ "channel": "pong" }`。
  3. TradingView Charting Library Datafeed 文档说明 `getBars` 用于历史数据，`subscribeBars` 用于实时更新，`unsubscribeBars` 使用订阅 ID 终止订阅。
  4. TradingView Datafeed subscriptions 文档说明切换 symbol/resolution 时不会立刻 unsubscribe，通常延迟约 5 秒，以便快速切回时数据流仍在运行，避免 loading flicker。
  5. TradingView widget methods 文档说明 `onChartReady` 是所有数据加载完成且 widget ready 后调用；其他 widget 方法应在此回调后调用。官方文档没有要求业务方用固定 12 秒 timeout 销毁并重建 widget。

请逐项审查以下风险，并按严重级别 Blocker/Major/Minor 输出：
- 生产稳定性：移除 12 秒超时后，是否会让真实失败永久白屏？是否仍有可见失败态覆盖 script 加载失败/constructor 异常？
- TradingView 生命周期：是否保留长生命周期 widget、仅在真实卸载时 remove？是否误改 getBars/subscribeBars/unsubscribeBars 或行情数据逻辑？
- Symbol 切换：ChartPanel 对 selectedMarket 短暂为空时保留上一市场，是否可能造成真实路由切换后显示错误市场或阻止新 symbol 同步？
- Service Worker：对 `/charting_library/sameorigin.html` 和 `/charting_library/charting_library.js` 改成 stale-while-revalidate 是否安全、是否可能返回跨版本不兼容资源、是否会缓存敏感数据、是否影响离线/首载？
- 内存泄漏：是否会重复创建 widget、重复 iframe、泄漏事件监听或订阅？
- 移动端/Safari：是否改善而不是加重移动端偶发 reload/flicker？
- 测试：新增测试是否真正覆盖“onChartReady 延迟不应销毁 widget”，是否还有缺口？
- 安全：是否放宽 CSP、跨源、缓存范围，或引入 XSS/点击劫持风险？

输出格式：
1. Findings：按严重级别排序；每条包含文件/大致行号、触发条件、影响、建议。
2. Checks passed：没有发现问题的维度，也说明你检查了什么。
3. Verdict：是否可进入生产；如果不可，列出必须先修的问题。

本轮 diff 在 tv_stability_fix.diff。
