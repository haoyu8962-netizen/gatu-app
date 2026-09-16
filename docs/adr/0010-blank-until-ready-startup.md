# ADR 0010：空白直到运行时就绪，先 chrome 后数据内容

- 状态：已接受（产品负责人，2026-09-16）；本地实现与验证记录见任务记录。
- 前置：[ADR 0005](0005-spa-static-shell.md)、[ADR 0006](0006-startup-preloads-and-edge-caching.md)。
- 部分取代：[ADR 0009](0009-startup-placeholder-single-source.md) 决策 2–5、7；决策 1 的纯展示组件作为真实组件标记的唯一来源继续有效，决策 6 的市场头布局保持。

## 背景与约束

产品负责人提供的 2026-09-16 测量：刷新 `/portfolio` 首先显示按 trade 路径预渲染的终端占位，随后显示 portfolio；非英文刷新先显示英文占位 0.2–2 秒，阿拉伯语还会 LTR→RTL。`getHydrationRouteSurface` 为匹配单份 HTML 强制所有应用路由复现 terminal 壳，形成路由闪烁。

同日官方 `app.hyperliquid.xyz/trade/SOL/USDC` trace：root 为空，color-scheme 为 dark，约 0.5 秒暗色空白 → 1.4 秒真实 chrome → 2.0 秒带首批数据的内容。我们的暖访问真实 UI 为 0.43–0.65 秒，删除占位预计使可见 chrome 晚 0.2–0.4 秒，换取消除路由和语言闪烁。以上为用户提供的测量，不是本轮复测。

## 决策

1. 保留单份预渲染 `_shell.html`、head 字体/modulepreload、主题 bootstrap、Service Worker 注册和壳缓存。应用 body 只含 visually empty 的 `aria-busy` 容器及一个 `sr-only` output：`Loading GATU...`；所有应用路径的三个 runtime/i18n gate 使用同一个 fallback。
2. 删除 hydration route-surface 特例；保留文档路由分类、文档 prerender、geo 和表面预加载分类。dashboard chunk pending 同样只播报，页面加载后自行渲染 DashboardFrameView。
3. runtime 和持久 locale 目录就绪后立即显示真实 chrome。桌面保留 TopNav、geo banner、FooterBar，移动保留同一 MobileTerminalFrameView 内的 MobileHeader 与持久页签 MobileBottomNav。市场未就绪时 workspace 为空且 aria-busy；就绪后在同一 frame 内挂载内容，chrome 不重挂载。首帧语言与主题来自持久状态。
4. 删除启动 skeleton、静态页签副本、占位 props 和 shell 专用英文 message 保留。真实组件继续渲染现有纯 view；不改交易、签名、数据新鲜度或错误重试守卫。此决策针对启动占位，不把已挂载数据组件的数值缺省表示变成可用数据。
5. 总包与启动闭包预算保持原基线，不因缩小闭包调低基线。删除壳后原先由根块共享的纯视图回归 trade chunk；为继续满足现有单块限制，沿用项目 summary 的 emitted chunk 策略，将 `mobile-book-chrome-view` 与 `market-overview-view` 输出为独立的静态依赖。它们仍同步渲染，预加载清单按完整静态闭包收集，不新增 lazy/Suspense 等待或 client entry。验证无反向 route 依赖/静态循环与全部预算；不选择提高阈值或把视图重新导入空壳。

## 备选方案

- 六语言 inline catalog：增加启动载荷及另一套 locale/RTL 同步逻辑，仍需处理路由占位错误；否决。
- cookie 区分每语言预渲染壳：引入缓存变体与持久语言同步边界，复杂度超过收益；否决。

## 后果

暖访问可见结构预计晚 0.2–0.4 秒；不再存在需要与真实界面对齐的启动树。view 保留为真实组件结构，纯度与运行时行为测试继续保护它们，shell parity 测试删除。ADR 0005/0006 的静态托管、预加载、缓存决策不变。

## 验证

覆盖 trade/portfolio/vaults 同一空 fallback 与无 recoverable hydration error；持久中文首帧无英文导航；桌面/移动 chrome 在 busy→ready 保持 DOM identity；仅 sr-only 播报，不显示 Loading。保留原运行时交互、几何、热切语言断言，运行全量 Vitest、Biome、typecheck、i18n extract、build 和 memory 检查。实际结果与 reviewer 浏览器测量分开记录于[任务记录](../work-memory/sessions/2026-09-16-remove-startup-placeholders.md)。

实测（2026-09-16，生产构建本地静态托管，热访问）：`/trade/BTC` 英文/中文 chrome 约 0.5 s、内容约 0.56–0.65 s；`/portfolio` 中文 0.22 s；阿拉伯语 `dir` 先于内容切换；4× CPU 下 chrome 0.9–1.3 s；六语刷新均无英文或路由闪现。完整表格见[任务记录](../work-memory/sessions/2026-09-16-remove-startup-placeholders.md)。
