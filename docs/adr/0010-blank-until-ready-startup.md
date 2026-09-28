# ADR 0010：空白直到运行时就绪，先 chrome 后数据内容

- 状态：已接受（产品负责人，2026-09-16）；本地实现与验证记录见任务记录。
- 前置：[ADR 0005](0005-spa-static-shell.md)、[ADR 0006](0006-startup-preloads-and-edge-caching.md)。
- 部分取代：[ADR 0009](0009-startup-placeholder-single-source.md) 决策 2–5、7；决策 1 的纯展示组件作为真实组件标记的唯一来源继续有效，决策 6 的市场头布局保持。

> 2026-09-27 更正：决策 2 中保留文档路由分类与文档预渲染的部分已被 [ADR 0020](0020-legal-pages-in-app-shell.md) 取代。六个文档页改为仪表盘页，同样先显示空播报，再渲染自己的 `DashboardFrameView`。

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

## 补充（2026-09-16）：市场头指标行随首批快照一次性出现

刷新时市场头（`MarketOverview`）曾在 `activeAssetCtx` 首条快照到达前把 `-`/`—` 当值渲染，列宽自适应，快照到达（挂载后约 80 ms）时六列被整体推开 20–183 px。官方终端实测：初始加载信息栏在数据到齐前不存在，出现时即完整；切换市场时旧值保留约 1.6 s，信息栏卸载约 0.4 s，再以新市场数据完整出现，从不显示短横线。本项目采用更严格的做法：`MarketOverviewView` 增加 `pending`（`aria-busy` + 指标行 `visibility: hidden`，高度保留），`MarketOverview` 在选中市场的新鲜资产快照（`liveCtx`）到达前保持 pending，切换市场时同样回到 pending，不显示上一市场的值。单个指标在快照后仍缺失时保留 `—` 作为真实的"不可用"值。实测修复后挂载帧 pending → 77 ms 后 ready，各列直接落在最终位置，之后零位移。

## 补充（2026-09-16）：网页字体不做回退字体绘制

指标行修复后，`header-jitter.mjs` 以 `FONT_DELAY=2500` 延迟字体文件仍能复现"Oracle / 24h Change / 24h Volume 左右缩"：字体到达瞬间，标签宽度从系统回退字体的度量收缩为 IBM Plex Sans 的度量（Funding 91.6→85.6 px、24h Volume 55.2→54.1、Open Interest 62.9→62.5），市场名 84.5→75.4，市场触发器 195.8→186.6，徽章与整个指标行的 x 从 274.8 移到 265.6。根因是 `@fontsource-variable/inter` 与本地 IBM Plex 声明均为 `font-display: swap`：首帧先以回退字体排版并绘制，webfont 到达后换字并重排（FOUT）。

官方核对：`app.hyperliquid.xyz` 的 `@font-face`（OurFont/OurFontBold = Inter、LogoFont、Teodor）都不声明 `font-display`，按浏览器默认在字体可用前文本不可见（block 期约 3 s）；冷加载 trace 中 chrome 无文字帧约 0.75 s，文字随 Inter 一起在 1.43 s 出现，从未出现回退字体的绘制。

决策：

1. `styles.css` 不再 `@import` fontsource 样式，改为显式声明 Inter Variable 的七个子集与 IBM Plex Sans Variable，全部 `font-display: block`；head 对 latin 子集的预加载不变。
2. 启动门控 `StartupReadyGate`（原 `I18nReadyGate`）除持久语言目录外，还通过 `document.fonts.load` 等待 Inter 与 IBM Plex 各一个规格，上限 `FONT_READY_TIMEOUT_MS`（3 s，与 block 期对齐）；字体已预加载时等待约为零。缺少 CSS Font Loading API 或加载失败时按就绪处理，不阻塞页面。
3. `MarketOverview` 的 pending 叠加 IBM Plex 两个规格的就绪（`useFontsReady`），覆盖门控超时与切换市场的情况。

后果：正常情况下首帧已按最终字体度量排版，不再因换字重排；字体极端缓慢时最多空白 3 s 后以回退字体显示，与 block 语义一致。实测记录在[任务记录](../work-memory/sessions/2026-09-16-remove-startup-placeholders.md)。
