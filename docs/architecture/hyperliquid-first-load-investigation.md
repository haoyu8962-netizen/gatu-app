# Hyperliquid 官方站首次加载调试记录与 Gatu 规划

调试日期：2026-08-21

调试对象：<https://app.hyperliquid.xyz/>

## 结论

Hyperliquid 官方站的首次加载不是“先画一套完整终端骨架，再淡入真实页面”。实际顺序是：

```text
纯色空画布
  → 真实 TopNav、Footer 与公告区域
    → 已确认默认市场后的真实交易工作区
      → TradingView 和各数据面板局部完成
```

它没有人为最短展示时间，也没有全局 spinner、pulse 或整页 skeleton。真实导航不等待 Privy、legal、完整市场元数据和用户请求全部结束；交易工作区只等待足够的市场身份信息，然后由盘口、账户、图表等区域各自继续加载。

这套“稳定真实外框 + 精确市场门控 + 面板局部就绪”的组织方式值得参考，但官方的纯空白首屏、首批资源体积、缓存策略和无障碍反馈不应复制。Slow 4G 加 4 倍 CPU 降速时，官方约 14.65 秒才出现导航，约 20.60 秒才出现市场工作区，期间只有深色空画布。

Gatu 的推荐方向因此不是删除所有占位，而是缩小占位的职责：

```text
SSR/runtime/i18n 未就绪
  → 诚实的品牌静态壳
ClientRuntime 与 i18n 已就绪
  → 同一个真实桌面 TopNav/Footer + busy workspace
精确市场身份已确认
  → 在原位挂载唯一 MainWorkspace
```

第一阶段不拆钱包 Provider，不改变 BTC/最近有效市场规则，也不在 `xyz:CXMT` 尚未确认时临时展示 BTC、HYPE 或上次市场。

## 调试范围与方法

本次只读取公开页面、公开网络请求和浏览器可下载的生产构建资源，没有登录、连接钱包、签名、修改远端状态或使用私有源码。

取证方法包括：

- 全新隔离浏览器上下文、未登录、桌面视口、禁用缓存的冷启动；
- Chrome Performance trace、Network 请求和响应头检查；
- 在文档脚本执行前安装 `MutationObserver`，记录 `#root`、真实导航、市场名称和盘口出现时间；
- 在文档脚本执行前记录 `fetch`、`WebSocket` 和 History API 事件，核对 UI 与数据请求的先后；
- 正常网络与 `Slow 4G + 4x CPU` 两组启动；
- accessibility tree 检查；
- 公开压缩 bundle 的路由、默认市场和挂载条件检查；
- 与当前 Gatu 启动边界逐项对照。

限制：

- 毫秒值来自少量冷启动样本，用于判断阶段和依赖关系，不是正式基准；
- 官方部署可能随时变化，资源文件名和体积只代表调试日期；
- 公告弹层在部分运行中成为 LCP 元素，会影响 LCP 对交易终端本体的代表性；
- bundle 结构可以证明静态关系，但凡无法由网络事件直接确认的运行时先后，本文会标记为“推断”。

## 首次加载过程

### 正常网络：DOM 阶段

不同冷启动样本有小幅波动，但阶段顺序稳定：

| 相对导航时间 | 可见状态 | 说明 |
| --- | --- | --- |
| `0 ms` | 深色空画布 | HTML 的 `#root` 完全为空，仅有 body 背景色 |
| 约 `1.05 s` | 仍为空画布 | `DOMContentLoaded` 和 `load` 已发生，React 真实页面仍未出现 |
| 约 `1.18 s` | 仍无主界面 | 隐藏的 Privy/Toaster 容器先写入 DOM |
| 约 `1.21–1.34 s` | 真实 TopNav、Footer、公告区域 | 导航项和 Connect 是真实组件，不是灰块 skeleton；中间工作区仍为空 |
| 约 `2.06–2.35 s` | HYPE 工作区整体出现 | 市场栏、盘口、交易表单、账户区域进入 DOM |
| 随后约 `0.1–0.7 s` | 图表和后续数据完成 | TradingView 有自己的局部加载阶段，蜡烛快照稍后请求 |

独立逐帧观察以应用深色背景出现为起点，也得到同样顺序：约 0.6–0.7 秒后真实页面外框，约 1.1 秒后工作区，约 1.2 秒后图表完成。两组时间的起点不同，因此不应混为同一性能样本。

加载期间未观察到整页 skeleton、`Loading` 文案或全局 spinner。它是直接从空中心区域切换为真实工作区。

### Slow 4G + 4x CPU

| 相对导航时间 | 可见状态 |
| --- | --- |
| 约 `2.57 s` | 浏览器只绘制深色背景 |
| 约 `12.89 s` | 文档 load 已完成，但 `#root` 仍无真实页面 |
| 约 `14.65 s` | 真实导航首次出现 |
| 约 `20.60 s` | 市场和盘口首次出现 |

这组结果说明官方的空 root 不是可复制的“高级过渡”：弱网和低性能设备会长时间没有内容或进度反馈。Gatu 保留轻量 SSR 静态壳更合理。

## HTML、资源与缓存

### HTML/SSR

- 解压后的首页 HTML 约 6,755 B；
- `#root` 是空的 `<div>`，没有 SSR 终端、序列化市场状态或 HTML skeleton；
- `/`、`/trade/BTC` 和 `/trade/xyz%3ACXMT` 返回内容哈希相同的 SPA HTML，深链市场解析全部发生在客户端；
- body 初始背景为 `#303030`，React 应用挂载后终端使用自己的更深色表面；
- head 内同步加载 TradingView classic script；
- Vite module 入口之外还有 45 个 `modulepreload` 和 2 个阻塞 CSS；
- Statuspage classic script 也位于文档关键链；
- 没有发现 `preconnect` 或 `dns-prefetch`。

### 首批体积

HTML 明示的首批 50 个 JS/CSS 资源：

- 原始体积约 5.74 MB；
- gzip 合计约 1.67 MB；
- 主入口原始约 1.43 MB、传输约 406 KB；
- 钱包、Privy、WalletConnect 和密码学依赖也进入首批 preload；
- 另有约 768 KB 传输体积的 TradingView 动态 bundle 在第二阶段加载。

一次独立的 15 秒禁缓存冷启动记录到约 185 个请求、约 3.85 MB encoded bytes；其中静态资源约 138 个、3.23 MB。该数字不含后续无限期 WebSocket 数据，不能视为页面最终总量。

### 缓存与 PWA

- 静态资源来自 S3 + CloudFront，有 ETag、Last-Modified、Age 和 304 验证；
- 实测没有明确的 `Cache-Control`、`Expires` 或内容哈希资源的 `immutable`；
- 普通浏览器模式不会使用应用 Service Worker，只有 standalone PWA 在 window load 后注册；
- standalone PWA 的 Workbox Service Worker 预缓存约 467 项，首次安装成本很高。

因此官方的缓存与 PWA 策略不是 Gatu 的优化目标模板。

## 数据启动与市场门控

### 实测请求时序

一次带文档前置埋点的正常网络冷启动得到以下顺序：

| 时间 | 事件 |
| --- | --- |
| 约 `1.160 s` | 静态 deployment registry 请求开始 |
| 约 `1.290 s` | `legalCheck` 开始 |
| 约 `1.292 s` | 创建 `wss://api-ui.hyperliquid.xyz/ws` |
| 约 `1.299 s` | Privy app config 开始 |
| 约 `1.336–1.339 s` | `spotMeta`、`allPerpMetas`、outcome、borrow/lend 等公开请求并行开始 |
| 约 `1.339 s` | 真实导航进入 DOM，此时上述请求尚未完成 |
| 约 `2.020 s` | WebSocket 打开并发送首批 HYPE/公共/账户订阅 |
| 约 `2.049 s` | Privy app config 完成 |
| 约 `2.076 s` | `spotMeta` 完成 |
| 约 `2.177 s` | `allPerpMetas` 完成 |
| 约 `2.349 s` | HYPE 市场工作区进入 DOM |
| 约 `2.403 s` | legal 和部分 borrow/lend 请求才完成 |
| 约 `2.58 s` 后 | 用户费用等请求完成 |
| 约 `2.83–3.01 s` | 蜡烛快照请求，随后订阅 candle stream |

可以直接确认：

- 导航不等待 Privy、legal 或完整 metadata；
- 钱包初始化、公开 metadata 和 WebSocket 是并行而非串行；
- legal 和部分辅助请求在真实市场工作区出现后才结束；
- 初始行情、盘口、账户等订阅复用一条 WebSocket，而不是每个面板各开一条连接；
- 市场工作区不会等待 TradingView 与所有辅助数据全部完成。

### 默认市场与路由

公开 bundle 显示官方的同步初始化规则等价于：

```text
简单的 /trade/<coin> 路由市场
  → 否则 localStorage.activeCoin
    → 否则 HYPE
```

当前市场随后写回 `localStorage.activeCoin`。根路径在客户端 replace 到 `/trade`，URL 默认不携带 HYPE；全新隔离会话因此显示 HYPE，已有会话可恢复上次市场。

这只是官方产品规则。Gatu 当前首页仍应使用有效的持久化 `selectedMarkets.all`，缺省为 BTC，并 replace 到带市场身份的 `/trade/<market>?scope=all`。

### 工作区挂载条件

公开 bundle 与画面共同支持以下高可信结论：

- TopNav/Footer 位于显式市场解析门槛之外；
- 显式路由市场尚在 pending、canonical redirect 或尚未提交为 active market 时，交易工作区返回空；
- `requestedCoin === activeCoin` 且必要 metadata 足以确认身份后才挂载工作区；
- 工作区挂载后，各真实面板原位接收后续数据；
- TradingView 使用独立的局部加载状态。

“只等待足够的市场身份与公开数据”是由 bundle 条件和网络/UI 顺序得出的推断，不代表官方存在一个名为 `marketReady` 的公开 API。

## 性能与无障碍观察

### Performance trace

| 指标 | 冷启动 lab | URL 级 CrUX p75 |
| --- | ---: | ---: |
| TTFB | 约 `222 ms` | 约 `313 ms` |
| LCP | 约 `1,710 ms` | 约 `2,986 ms` |
| CLS | `0.00` | `0.07` |
| INP | 本次无有效交互样本 | 约 `131 ms` |

本次 lab LCP 元素是公告文本，不是图表或盘口，因此 LCP 不能单独代表交易工作区 ready。该 trace 的 LCP 时间主要花在客户端 render delay，而非 LCP 资源下载。

另外观察到：

- TradingView、Statuspage 和两份 CSS 位于渲染关键链；
- content-hashed JS/CSS 缺少长期 immutable 缓存策略；
- Inter 字体使用 `font-display: auto`；
- WalletConnect 首载第三方传输约 167 KB；
- accessibility tree 中没有全局 loading `status` 或 `aria-busy`，空白阶段对读屏用户也是静默的。

## 值得借鉴与不能复制的部分

### 值得借鉴

- 真实导航外框不等待钱包、legal、账户和所有 metadata；
- 显式市场身份未确认前不临时挂载错误市场工作区；
- 市场 identity commit 后只挂载一个工作区实例；
- HTTP 目录/metadata 与单 WebSocket 多路复用并行启动；
- 工作区出现后让图表、盘口和用户数据局部完成；
- 没有人为最短 skeleton 展示时间。

### 不能复制

- 根 Suspense 无 fallback、Slow 4G 下十几秒纯色空白；
- 没有可访问的 loading 状态；
- 45 个 eager modulepreload，把钱包栈带入公共首屏关键链；
- 同步 TradingView/Statuspage 脚本；
- hashed 资源缺少明确 immutable；
- standalone PWA 一次预缓存约 467 项；
- 官方 HYPE/`activeCoin` 默认规则；
- 官方无效路由处理替代 Gatu 已有的 canonical、404、paused 和 fail-visible 规则；
- 为图表复制新的动画 loader。

## 当前 Gatu 为什么会显示截图中的样式

当前代码有三个不同的启动门槛，却复用了同一个 `AppShellSkeleton`：

1. `providers/root.tsx` 的懒加载 client runtime；
2. `routes/__root.tsx` 的 `ClientRuntime` 和持久化语言目录；
3. `components/trade/trade-terminal-page.tsx` 的精确路由市场解析。

`routes/trade.tsx` 和首页 route 的 `pendingMinMs` 都是 `0`，`trade-terminal-page.tsx` 也直接从 `bootStatus` 派生展示，因此没有人为延时或“必须播完”的过渡动画。条件满足后，下一次 React commit 就会替换占位。

这些门槛本身有真实职责：

- SSR 不能直接执行依赖 `window`、Privy、Wagmi 和钱包状态的客户端树；
- 持久化语言目录未激活前直接显示页面会产生错误语言或 LTR/RTL 跳变；
- `xyz:CXMT` 未通过目录精确确认前挂载工作区，可能订阅和展示 BTC/上次市场，甚至短暂暴露错误交易表单。

现有实现的问题不是“存在加载门槛”，而是门槛范围太大、视觉语义不够准确：

- runtime 已经存在、真实导航已经可以工作时，市场 gate 仍回退成整页假导航；
- 同一骨架用灰块模拟多个可点击控件，用户无法判断是真页面还是加载失败；
- 整个 skeleton 被 `aria-hidden`，没有可访问进度；
- 若简单在 loading/ready 两个分支各放一个 TopNav，市场 ready 时会卸载重挂，正在打开的钱包菜单和焦点会丢失。

## Gatu 修改计划

### 阶段 0：先建立当前项目基线

在开始 UI 修改前，用 production build 记录：

- HTML/首次绘制；
- hydration 完成；
- `client-root` 模块完成；
- `ClientRuntime` ready；
- 持久化 locale ready；
- market catalog 可解析 route；
- 真实 TopNav 首次 commit；
- `MainWorkspace` 首次 commit；
- WebSocket 数量和首次市场订阅。

分别测试冷/热缓存、正常网络和 Slow 4G，不能用 dev server 的时间判断是否需要 Provider 架构拆分。

#### 阶段 0 执行结果（2026-08-21）

阶段 0 已完成。正式矩阵共 `3 routes × 2 cache modes × 2 network modes × 3 samples = 36` 个 timed runs，36/36 的必需字段均采集完整，并通过首订阅市场身份校验；所有样本的 page errors 也均为空。所有样本复用同一份 `.output`，`/build-meta.json` 为：

```json
{
  "name": "gatu",
  "version": "0.1.0",
  "commit": "fee5e594d8b0d8df29bb601dc8a3fc4b42594181",
  "release": "local",
  "builtAt": "2026-08-21T03:46:33.151Z"
}
```

测量环境与定义：

- Chromium `139.0.7258.5`，视口 `1440 × 900`、DPR `2`，不做 CPU 降速；
- 生产 Nitro 服务运行在 `http://127.0.0.1:3016`，避免误用当时占用 3006 的 Vite dev server；
- Slow 4G 固定为 `150 ms` latency、`1.6 Mbps` download、`750 Kbps` upload；
- 每个样本使用独立 browser context；冷缓存显式清空并禁用 HTTP cache；热缓存先在同一 context 完整访问同一路由，等待 ready 后再等 2 秒，然后执行新的 document navigation，因此热缓存同时包含 HTTP cache 与 origin persisted catalog；
- 首次导航统一启用 `terminal_perf=1`，并在 init script 写入同一受支持的 profiling storage key。根路径的生产 307 会丢掉 query，因此该 storage fallback 是 `/` 可采集 commit 的必要条件；
- 为了让 locale ready 可从页面外部辨认，所有 context 预置非默认 `locale-v1=zh`，以首次观察到 `<html lang="zh">` 为准；
- HTML、FP/FCP、locale DOM、commit hook 和 WebSocket wire payload 是直接观测；hydration 是 Playwright-only React DevTools hook 观察到的首个主 root commit；`client-root` 完成是其模块顶层唯一 `removeItem("hl-markets-meta-v1")` 信号；`ClientRuntime ready` 是 runtime 边界后的 locale read 所对应的首个 root commit；
- market catalog 没有公开 mark；阶段 0 的 schema v1 表中，`route resolved-by` 是真实 TopNav 首次 commit 的可信上界，不应解释成 `getMarketByName` 的精确内部时刻。阶段 1 后 TopNav 会提前，因此测量脚本升为 schema v2，并改用 ready-only MainWorkspace commit；
- 每组只有 3 个样本，以下只报告 median。min/max 和逐次原始记录位于本地未提交产物 `scripts/measure/out/boot-timing-phase0-baseline-20260821.json`，可用同一脚本和 tag 重建；不把这些结果表述成稳定 p75。

浏览器、runtime 与语言里程碑如下，单位均为从本次 document navigation 起算的毫秒：

| 网络 | 缓存 | 路由 | HTML responseEnd | FCP | hydration | client-root | ClientRuntime | locale |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 正常 | 冷 | `/` | 4.5 | 32.0 | 162.3 | 146.2 | 468.5 | 74.9 |
| 正常 | 冷 | `/trade/BTC` | 3.0 | 32.0 | 153.3 | 144.0 | 464.1 | 76.7 |
| 正常 | 冷 | `/trade/xyz:CXMT` | 3.6 | 28.0 | 149.2 | 135.1 | 456.0 | 67.6 |
| 正常 | 热 | `/` | 12.6 | 64.0 | 146.5 | 189.5 | 451.0 | 131.8 |
| 正常 | 热 | `/trade/BTC` | 3.9 | 32.0 | 74.2 | 100.5 | 377.0 | 61.0 |
| 正常 | 热 | `/trade/xyz:CXMT` | 4.2 | 40.0 | 67.8 | 92.9 | 372.7 | 54.5 |
| Slow 4G | 冷 | `/` | 383.2 | 1324.0 | 4970.6 | 9524.3 | 9561.7 | 4809.6 |
| Slow 4G | 冷 | `/trade/BTC` | 226.0 | 1160.0 | 4824.5 | 9372.0 | 9407.7 | 4661.0 |
| Slow 4G | 冷 | `/trade/xyz:CXMT` | 225.5 | 1172.0 | 4818.6 | 9402.8 | 9449.0 | 4660.6 |
| Slow 4G | 热 | `/` | 1019.7 | 1000.0 | 1056.4 | 1083.8 | 1360.2 | 1038.3 |
| Slow 4G | 热 | `/trade/BTC` | 557.7 | 560.0 | 587.3 | 611.1 | 891.1 | 573.0 |
| Slow 4G | 热 | `/trade/xyz:CXMT` | 671.5 | 656.0 | 699.1 | 732.6 | 1003.3 | 686.2 |

市场与真实终端挂载里程碑：

| 网络 | 缓存 | 路由 | route resolved-by | TopNav | MainWorkspace | 首市场订阅 | HL WS |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 正常 | 冷 | `/` | 626.3 | 626.3 | 626.3 | 626.5 | 1 |
| 正常 | 冷 | `/trade/BTC` | 708.5 | 708.5 | 708.5 | 708.7 | 1 |
| 正常 | 冷 | `/trade/xyz:CXMT` | 672.2 | 672.2 | 672.2 | 672.4 | 1 |
| 正常 | 热 | `/` | 449.9 | 449.9 | 450.0 | 531.3 | 1 |
| 正常 | 热 | `/trade/BTC` | 376.1 | 376.1 | 376.1 | 428.2 | 1 |
| 正常 | 热 | `/trade/xyz:CXMT` | 371.7 | 371.7 | 371.7 | 426.8 | 1 |
| Slow 4G | 冷 | `/` | 9560.2 | 9560.2 | 9560.2 | 9907.4 | 1 |
| Slow 4G | 冷 | `/trade/BTC` | 9406.0 | 9406.0 | 9406.0 | 9738.4 | 1 |
| Slow 4G | 冷 | `/trade/xyz:CXMT` | 9447.1 | 9447.1 | 9447.2 | 9794.7 | 1 |
| Slow 4G | 热 | `/` | 1359.3 | 1359.3 | 1359.3 | 1449.1 | 1 |
| Slow 4G | 热 | `/trade/BTC` | 890.3 | 890.3 | 890.3 | 943.5 | 1 |
| Slow 4G | 热 | `/trade/xyz:CXMT` | 1002.1 | 1002.1 | 1002.1 | 1069.1 | 1 |

结果解释：

- 正常网络冷缓存中，逐样本计算后 `ClientRuntime → TopNav` 的 median 约为 `171–248 ms`。阶段 1 能缩短和改善这一小段市场 gate 的视觉语义，但不会改变此前的 runtime 关键链；
- Slow 4G 冷缓存中，FCP 已在约 `1.16–1.32 s` 出现，真实 TopNav/MainWorkspace 却要到约 `9.41–9.56 s`。用户会在已绘制骨架上再等待约 8.2 秒；
- 同一组 Slow 4G 冷缓存里，`client-root` 资产本身约在 `3.56–3.72 s` 下载完成，模块顶层代理信号却到 `9.37–9.52 s`，首个 Hyperliquid WebSocket 构造为 `9.38–9.53 s`。这将主要未解释区间定位到 client-root 静态模块图加载、排队、解析与执行的上界关键链，而不是 `xyz:CXMT` 字符串解析；具体 chunk 和因果仍需下一轮 dependency trace；
- TopNav 与 MainWorkspace 在所有场景都处于同一个 React commit。除 Slow 4G 冷缓存根路径的一个样本外，热缓存和 Slow 4G 冷缓存里的 ClientRuntime commit 与它们也基本是同一次 commit；layout effect 与 DevTools commit callback 可有约 1–2 ms 的记录顺序差，不代表 UI 早于 runtime；
- main frame 探针在 36 个样本中都只观察到 1 条 `wss://api.hyperliquid.xyz/ws`，峰值并发为 1。首个带市场身份的 wire payload 全部是 `activeAssetCtx`，`/` 与 `/trade/BTC` 均为 BTC，`/trade/xyz:CXMT` 始终为 `xyz:CXMT`，没有观察到默认市场回退或 main-frame 重复 socket；
- `/` 的最终 URL 在全部样本中都是 `/trade/BTC?scope=all`，`redirectCount=1`；两个显式 trade route 均无文档重定向。Slow 4G 热缓存下根路径比直达 BTC 多约 470 ms，符合额外 307 往返的成本；
- 这批数据出现了值得继续归因的强烈数值信号：Slow 4G 冷缓存的 `hydration → ClientRuntime` 约 4.5 秒，约占 `navigation → TopNav` 的一半。但它还不是阶段 1 后的 clean production p75，也没有 dependency trace，因此尚未正式满足阶段 2 的 Provider 拆分触发线。下一步应启动“依赖资源归因”调查，而不是直接拆 Provider。

构建 caveat：本次 `pnpm build` 完整生成了 client、SSR 和 Nitro `.output`，chunk-cycle 检查通过，但最后的 bundle-budget 检查失败：当前共享脏工作区相对预算基线增加 `13,945 gzip bytes`，允许值为 `10,000`。产物包含其他会话尚未提交的交易功能改动，且构建使用的 Node `v22.13.0` 低于项目声明的 `>=22.15.0`，因此这些数字是“2026-08-21 共享工作区快照基线”，不是 clean-HEAD 发布基线。其他改动合并或清理后，应以相同脚本再跑一次，才适合用于长期回归阈值。

### 阶段 1：缩小市场 gate，保持 Provider 不变

第一阶段只改变 `ClientRuntime + i18n` 已就绪之后的桌面市场加载表面。

推荐稳定组件树：

```text
TradeTerminalPage
├── MarketReadySynchronizers            ready 时才挂 RouteMarketSync/TabTitleSync
├── DesktopTerminalSurface              loading/redirecting/ready 共用同一实例
│   └── 原 offset/testnet/pb-8 包装
│       ├── TestnetBanner
│       ├── TopNav mode="market-loading | default"
│       ├── GeoRestrictionBanner
│       ├── TerminalLoadingWorkspace    market-loading 时
│       │   └── DesktopGridLoadingSurface
│       ├── MainWorkspace               ready 时
│       └── FooterBar mode="market-loading | default"
└── MarketReadyOverlays                 ready 时才挂 OrderToast/GlobalModals
```

实现要求：

- `loading → ready` 时 `DesktopTerminalSurface`、TopNav 和 Footer 保持相同组件类型、树位置且没有变化的 key；
- TopNav 只切换显式 `mode` prop，不能复制第二套 PublicTopNav；
- 品牌、主导航、More、主题、语言和 `UserMenu` 可用；`UserMenu` 自己拥有 WalletModal，并已处理 Privy 尚未 ready 的状态；
- `mode` 切换不能在 `UserMenu` 前插入或删除无 key 的兄弟节点；Deposit 等槽位应保持稳定或显式 keyed，确保已打开的 WalletModal 不被 React reconciliation 重建；
- Deposit、Settings、DesktopUtilities 和 Footer Command Menu 依赖尚未挂载的 global modal host，`market-loading` 时必须禁用或隐藏并保留所需布局，不进入键盘焦点，也不能调用 modal store；禁用的原因是避免动作延迟到 host 挂载后意外弹出，而不是防止 store 崩溃；
- Footer 的真实 API 状态继续挂载，因此市场加载期允许显示 `Connecting`；
- 不为 boot 提前挂载简化版 `GlobalModals`，避免绕过 legal/onboarding/HIP-3 等既定顺序；
- loading workspace 仅包含静态 `DesktopGridLoadingSurface`，不挂载任何市场业务组件；
- ready 后在原位替换为唯一 `MainWorkspace`；
- 移动端第一阶段继续使用现有 `MobileLoadingFallback`/静态壳，避免扩大 header、bottom nav 和交易视图的耦合改动；
- 保持 1000px 及以下为移动终端、1001px 起为桌面终端；
- 不增加 pulse、spinner、淡入、计时器或人为最短展示时间。

继续严格限制在 ready 后挂载：

- `RouteMarketSync`；
- `TabTitleSync`；
- `MainWorkspace` 与 Favorites、TokenSelector、MarketOverview、Chart、Orderbook、TradePanel、Positions、AccountPanel；
- `MobileTerminal`；
- `OrderToast`；
- `GlobalModals` 及 Legal、Onboarding、HIP-3、Position Close、Deposit hosts。

根级 `FundsActionRecoveryHost` 和 Toaster 保持原位置，不在本任务移动。

### 阶段 1 的静态壳与无障碍

`AppShellSkeleton` 仍服务于 SSR、hydration、client runtime 和 locale gate，但应变成“诚实的品牌静态壳”：

- 首页、trade、perp、spot 与 builders-perp 两条子路由的 `pendingComponent` 继续直接复用它，避免 lazy route chunk 期间闪回旧的假导航；
- 保留深浅主题、header 高度、桌面网格几何和移动端安全区，避免白屏与大幅布局跳动；
- 删除或弱化模拟真实导航/按钮的无意义灰块；
- 装饰结构单独 `aria-hidden`，不要隐藏整个 loading surface；
- 外层设置 `aria-busy="true"`，提供一个具有隐式 status 语义的稳定 `<output>` 启动文案；
- runtime/i18n 后的 `TerminalLoadingWorkspace` 只把 workspace 标记为 busy，真实 nav/footer 仍正常可访问；
- 使用 Lingui 翻译市场加载状态，并确保任何时刻只有一个 live status；
- ready 后移除 busy/status，不主动移动焦点。

SSR 前的状态文案要在实现时专门验证语言与 hydration 行为，不能为了翻译再次引入闪烁或 markup mismatch。

### `xyz:CXMT` 与路由安全契约

保持 `getTradeTerminalBootStatus` 的现有优先级：

1. malformed trade URL 立即 404；
2. `routeMarket = getMarketByName(name) ?? getMarketInfo(name)`；名称或 `byPairName` 能解析时直接 ready，裸 `/trade` 也直接 ready；
3. 只有尚未被上述查询解析、但存在唯一 canonical 匹配时才 replace redirect；
4. catalog 正在 restoring/loading/refreshing 时显示真实页面外框 + busy workspace；
5. 只有新鲜完整目录的 `canResolveNotFound` 才判定 404；
6. paused 与 error 继续 fail-visible。

尤其禁止：

- 在 CXMT 尚未确认时把 BTC、HYPE 或本地上次市场提交进 route scope；
- 提前运行 `RouteMarketSync`；
- 提前挂载会订阅默认市场的工作区；
- 将官方 `/trade + activeCoin/HYPE` 规则移植到 Gatu。

### React 状态与 Effect 约束

加载展示直接由 `bootStatus` 在 render 中派生，不新增 `useState + useEffect` 镜像状态，也不增加 transition timer。

现有 canonical navigate Effect 是对浏览器路由的外部同步，可以保留；`RouteMarketSync` 继续只在精确市场 ready 后同步 store/scope。用户点击产生的动作继续放在事件处理器中，而不是用 Effect 监听 UI 状态。

### 阶段 1 文件范围

建议新增：

- `apps/terminal/src/components/trade/layout/desktop-terminal-surface.tsx`；
- `apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx`。

建议修改：

- `apps/terminal/src/components/trade/trade-terminal-page.tsx`；
- `apps/terminal/src/components/trade/header/top-nav.tsx`；
- `apps/terminal/src/components/trade/header/desktop-utilities-menu.tsx`；
- `apps/terminal/src/components/trade/footer/footer-bar.tsx`；
- `apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx`；
- `apps/terminal/src/components/trade/layout/main-workspace.tsx`，仅增加测量用的稳定 DOM 标记；
- `apps/terminal/src/components/trade/mobile/mobile-loading-fallback.tsx`；
- `scripts/measure/measure-boot-timing.mjs`，将 route-resolvable 上界从提前出现的 TopNav 改为 ready-only MainWorkspace commit；
- 对应启动、导航、footer 与占位测试。

第一阶段不修改：

- `apps/terminal/src/providers/root.tsx`；
- `apps/terminal/src/providers/client-root.tsx`；
- `packages/hl-react/src/provider.tsx`；
- 钱包登录、签名、Agent、legal 和 onboarding 流程；
- 市场缓存、重试、目录权威性和 canonical 算法；
- 桌面网格 geometry、storage key 和 trade SSR 策略。

### 阶段 1 验收

自动测试重点：

- `trade-terminal-page-boot.test.tsx`
  - loading/redirecting 桌面显示真实 TopNav、Footer 和 busy workspace；
  - 不显示 MainWorkspace、RouteMarketSync、OrderToast 或 GlobalModals；
  - `xyz:CXMT` 不回退默认市场；
- 新增稳定性断言：loading → ready 时 TopNav 和 UserMenu mount 一次、unmount 为零，已打开的 WalletModal 保持打开；
- `top-nav.test.tsx` 与 Footer 测试
  - boot 中导航、主题、语言、钱包入口可用；
  - Deposit、Settings、Utilities、Command 不触发 modal store 且不能获得焦点；
  - ready mode 保持原行为；
- `trade-terminal-boot.test.ts`
  - exact、canonical、fresh not-found、paused、error 优先级不变；
- `boot-placeholder-contract.test.ts`
  - 静态壳无新增动画或最短展示时间；
- `mobile-app-shell-skeleton.test.tsx`
  - 移动端和 1000/1001px 边界未改变；
- `root-provider-split.test.ts`、`root-provider-runtime.test.tsx`
  - SSR/runtime/provider 边界未改变；
- `desktop-grid-layout.test.ts`
  - 1420/1421px 桌面几何未改变。

浏览器回归：

- `/`、`/trade/BTC`、`/trade/xyz%3ACXMT`；
- malformed、unknown、paused、offline；
- 冷缓存、热缓存、正常网络、Slow 4G；
- 1000、1001、1420、1421、1600px；
- 深色、浅色、中文、RTL、testnet、geo banner；
- 连接钱包弹层在 market loading → ready 后仍保持打开；
- 没有重复 WebSocket、错误市场订阅、控制台错误或明显 CLS。

按项目约束至少执行 Biome、terminal typecheck、相关 Vitest 和 production build；视觉检查需同时覆盖桌面、紧凑桌面和移动端。

### 阶段 1 实施结果（2026-08-21）

阶段 1 已按上述边界完成：桌面 `loading/redirecting/ready` 共用同一个 `DesktopTerminalSurface`，TopNav、Footer 和 UserMenu 跨市场 gate 保持身份；只有 workspace 与 ready-only synchronizers/overlays 切换。移动端 ready terminal、gate、断点和业务组件未改动，loading fallback 只更新静态与 ARIA 语义；Provider 层、市场解析/canonical 算法和桌面网格几何也保持不变。

实现验证已通过 Biome、terminal typecheck、14 个相关 Vitest 文件的 126 项测试及 production build 的 client/SSR/Nitro 生成和 356 个 client chunk 循环检查。`mobile-app-shell-skeleton.test.tsx` 中遗留的 `1554px` 旧期望已按现行 `34.6 × 30 + 33.6 × 3 + 6 = 1144.8px` 修正；当前 GitHub Actions 没有显式运行该文件，只有本地全量 Vitest 会自动覆盖它。

#### 阶段 1 后 clean production 基线

下表取自独立 clean worktree，HEAD `9d8f79c4ac779ab3bde685bd7a4fed0a95746b83`，Node `22.18.0`、pnpm `10.21.0`、Chromium `139.0.7258.5`。同一份 production `.output`（`builtAt=2026-08-21T07:29:36.014Z`）复用于 `3 routes × 2 cache modes × 2 networks × 3 samples = 36` 次 document navigation，所有样本 status 均为 `ok`。测量定义、视口和 Slow 4G 参数与阶段 0 一致；每组仅 3 个样本，以下报告 median，不冒充 p75。可重建的原始记录为已忽略的 `scripts/measure/out/boot-timing-post-phase1-clean-20260821.json`。

启动与 runtime 里程碑（ms）：

| 网络 | 缓存 | 路由 | HTML | FP/FCP | hydration | client-root | ClientRuntime | locale |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 正常 | 冷 | `/` | 4.1 | 44 | 155.5 | 141.3 | 462.4 | 73.6 |
| 正常 | 冷 | `/trade/BTC` | 2.5 | 40 | 150.5 | 137.9 | 456.7 | 70.4 |
| 正常 | 冷 | `/trade/xyz%3ACXMT` | 2.3 | 28 | 147.3 | 135.5 | 456.1 | 67.3 |
| 正常 | 热 | `/` | 4.1 | 32 | 63.0 | 86.2 | 366.9 | 48.8 |
| 正常 | 热 | `/trade/BTC` | 2.9 | 44 | 62.9 | 87.1 | 367.1 | 49.4 |
| 正常 | 热 | `/trade/xyz%3ACXMT` | 3.7 | 56 | 68.6 | 98.1 | 373.2 | 53.9 |
| Slow 4G | 冷 | `/` | 383.6 | 1320 | 4962.8 | 9429.2 | 9471.3 | 4802.0 |
| Slow 4G | 冷 | `/trade/BTC` | 225.7 | 1172 | 4829.5 | 9260.6 | 9304.3 | 4660.6 |
| Slow 4G | 冷 | `/trade/xyz%3ACXMT` | 225.6 | 1128 | 4839.6 | 9289.2 | 9330.5 | 4663.5 |
| Slow 4G | 热 | `/` | 1011.2 | 988 | 1039.6 | 1059.2 | 1343.1 | 1025.0 |
| Slow 4G | 热 | `/trade/BTC` | 668.8 | 644 | 694.5 | 714.1 | 997.8 | 681.6 |
| Slow 4G | 热 | `/trade/xyz%3ACXMT` | 686.0 | 656/672 | 712.4 | 731.1 | 1018.3 | 699.7 |

真实终端与订阅里程碑（ms）：

| 网络 | 缓存 | 路由 | TopNav | MainWorkspace / route ready 上界 | 首市场订阅 | HL WS |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 正常 | 冷 | `/` | 460.3 | 676.5 | 676.8 | 1 |
| 正常 | 冷 | `/trade/BTC` | 455.1 | 647.9 | 648.2 | 1 |
| 正常 | 冷 | `/trade/xyz%3ACXMT` | 454.3 | 609.3 | 609.6 | 1 |
| 正常 | 热 | `/` | 366.1 | 366.1 | 440.8 | 1 |
| 正常 | 热 | `/trade/BTC` | 366.0 | 366.0 | 415.3 | 1 |
| 正常 | 热 | `/trade/xyz%3ACXMT` | 372.3 | 372.4 | 421.6 | 1 |
| Slow 4G | 冷 | `/` | 9469.7 | 9469.7 | 9802.6 | 1 |
| Slow 4G | 冷 | `/trade/BTC` | 9302.6 | 9302.7 | 9630.1 | 1 |
| Slow 4G | 冷 | `/trade/xyz%3ACXMT` | 9328.7 | 9328.8 | 9652.4 | 1 |
| Slow 4G | 热 | `/` | 1342.1 | 1342.2 | 1391.3 | 1 |
| Slow 4G | 热 | `/trade/BTC` | 997.0 | 997.0 | 1045.0 | 1 |
| Slow 4G | 热 | `/trade/xyz%3ACXMT` | 1016.6 | 1016.6 | 1088.5 | 1 |

基线校验结果：

- 36/36 都只构造 1 条 `wss://api.hyperliquid.xyz/ws`，峰值并发也为 1；首个市场 payload 全部为 `activeAssetCtx`，`/` 和 `/trade/BTC` 为 BTC，`/trade/xyz%3ACXMT` 的 12/12 次均精确为 `xyz:CXMT`；
- 36/36 都出现真实 `MainWorkspace`。其中 10 次实际观察到 loading workspace，10/10 均在同一 MutationObserver 时刻先移除 loading 再出现 MainWorkspace，没有共存；其余 26 次因目录已可解析而 direct-ready。浏览器侧直接证明 workspace 与市场订阅没有越过 loading gate；`RouteMarketSync`/`TabTitleSync`/`OrderToast`/`GlobalModals` 本身无稳定 DOM，它们的 ready-only 挂载由阶段 1 组件契约测试覆盖，不把 DOM 探针说成对这些 null/portal 组件的直接观测；
- 36/36 无 page error。完整矩阵不是 console-clean：热缓存的 9 次 Slow 4G 样本共记录 18 条 `TypeError: Failed to fetch`，本次产物的 listener 覆盖预热到二次 document navigation，因此这是整个 hot context 的诊断而不是对 timed navigation 的单独归因；无 stack 也不能把来源归因给某个应用请求。另有 2 条 Google Analytics CSP 拒绝。它们没有使必需里程碑或订阅校验失败，但不应沿用早期单次 trace 的“控制台无错误”结论。测量脚本已在矩阵后将 warm-up 的 page/console diagnostics 单列为 `warmupDiagnostics` 并在 timed navigation 前清空数组，后续重跑不会再混合两次导航；

与阶段 0 schema v1 比较时只使用两个未改变语义的原始字段。normal-cold 三路由合并 median 中，TopNav 从 `673.1 ms` 提前到 `455.1 ms`（`-218.0 ms`，`-32.39%`），MainWorkspace 从 `673.2 ms` 到 `647.9 ms`（`-25.3 ms`，`-3.76%`）。单路由 normal-cold TopNav 分别改善 `166.0/253.4/217.9 ms`；MainWorkspace 的三次 median 为 `+50.2/-60.6/-62.9 ms`，每组样本少，不将它解读成稳定 workspace 性能改善。

normal-cold 的 9 个阶段 1 样本中，`hydration → ClientRuntime ready` 为 `305.4 / 306.5 / 351.0 ms`（min/median/max），约占 `navigation → TopNav` 的 `64.96% / 67.45% / 77.23%`。阶段 0 同口径的 pooled median 为 `306.4 ms` 和 `45.64%`（占比范围 `39.37–51.65%`）：绝对成本没有随 TopNav 提前而消失，其相对占比反而更明显。因此阶段 2 触发线 (a) 的 `>500 ms` 分支为假，但 `>25%` 分支在 9/9 样本中为真，触发线 (a) 正式命中。

干净构建的 production 产物和循环检查均生成成功，但并非两个总预算都通过：总 client gzip 为 `3,087,952 B`，相对 `3,073,703 B` 基线增长 `14,249 B`，允许值为 `10,000 B`，超出 `4,249 B`；startup gzip 为 `530,597 B`，增长 `4,688 B`，通过。trade terminal 等全部页面预算也通过。这是预算常量之后多个已存在变更的累积结果，而阶段 1 自身的 client delta 约 1 KB；本轮没有修改 `check-client-bundle-budget.mjs` 基线常量，也不把这次 total budget 红线错归因给市场 gate 改动。

### 阶段 2：仅在生产数据证明必要时拆运行时

当前 `client-root.tsx` 固定维护：

```text
Privy → SmartWallets → PersistQuery → Wagmi → Hyperliquid → Markets
```

`HyperliquidProvider` 同时拥有公开 transport/store 与签名 session/Agent 生命周期。直接把 `MarketsProvider` 提到钱包外，容易产生双 store、重复 WebSocket、钱包 ready 后 remount、Agent cleanup 竞态和 Query 恢复竞态。

#### client-root 静态依赖闭包

`analyze-client-root-deps.mjs` 从 production 输出的 `client-root-*.js` 出发，解析本地静态 ESM import（故意排除 `import()`）并对实际 chunk 做 `gzipSync`。正式 production 闭包为 15 个 chunk、44 条边、`1,197,652 B` gzip。为获得模块级归因，同源 analyze build 产物为 `1,198,272 B`，只因 source-map/build metadata 相差 `620 B`（`0.052%`）。

归因将每个 chunk 的实际 gzip 按 visualizer 的单模块 gzip 权重分配，并用 largest-remainder 在每个 chunk 内精确回收到实际字节数；15/15 chunk 均命中，最终 `1,198,272 / 1,198,272 B` 对账，无 unallocated 或 warning。`direct` 只计包自身模块，`inclusive` 还计其闭包内静态子依赖；子树共享 viem、router、UI 等模块，所以各行不能相加。

| 子树 | direct gzip | direct 占比 | inclusive gzip | inclusive 占比 |
| --- | ---: | ---: | ---: | ---: |
| `@privy-io/react-auth` | 90,606 B | 7.56% | 744,577 B | 62.14% |
| smart-wallets | 494 B | 0.04% | 337,483 B | 28.16% |
| `@privy-io/wagmi` | 946 B | 0.08% | 731,126 B | 61.02% |
| WalletConnect | 67,349 B | 5.62% | 138,347 B | 11.55% |
| 密码学库集合 | 34,382 B | 2.87% | 34,569 B | 2.88% |
| `@gatu/hl-react` | 24,062 B | 2.01% | 265,158 B | 22.13% |
| 钱包五组去重并集 | — | — | 768,615 B | 64.14% |

钱包五组 inclusive 朴素相加为 `1,986,102 B`，去重后只有 `768,615 B`；实际决策使用后者。闭包的两个大块是 `pwa-install-*.js` `583,168 B` gzip（48.67%）和 `vendor-tanstack-router-*.js` `360,056 B`（30.05%）。前者名称只是 Rollup 选的 chunk 名，不代表 583 KB 都属于 PWA 业务；模块归因显示其中 `577,931 B`（99.10%）属于上述去重钱包依赖并集。

分析工具还暴露了一个可复现的 tooling 问题：`package.json` 当前的 `ANALYZE=true lingui compile && ... vite build` 只把 `ANALYZE` 传给了 Lingui，Vite 看不到该变量；即使手动把变量传给 Vite，顶层 visualizer 报告也会被后续 Nitro/server build 覆写。本轮仅在干净 worktree 中临时将 visualizer 限定到 Vite `client` environment 获取证据，随后回退该临时配置；没有把分析开关或 source map 带进 production bundle。后续应单独修复 `build:analyze`，不应把这个 tooling 修复与 Provider 重构混合。

#### Slow 4G 冷缓存资源瀑布

CDP 对 `/trade/xyz%3ACXMT` 的一次 production slow4g-cold 采样捕获了 15/15 个闭包 chunk，按 `Network.loadingFinished` 排序如下。“传输字节”是 CDP `encodedDataLength`，与构建期 gzip 口径不同。

| 完成 ms | chunk | 传输字节 |
| ---: | --- | ---: |
| 682.10 | `vendor-tanstack-query-*` | 13,070 |
| 1,457.45 | `vendor-icons-*` | 40,757 |
| 2,218.53 | `vendor-base-ui-*` | 94,082 |
| 3,164.12 | `vendor-tanstack-router-*` | 281,264 |
| 3,487.39 | `deposit-execution-state-*` | 4,287 |
| 3,493.26 | `use-mobile-*` | 3,442 |
| 3,562.16 | `client-root-*` | 8,789 |
| 3,652.48 | `use-global-settings-store-*` | 12,894 |
| 3,808.53 | `use-pending-order-store-*` | 7,362 |
| 3,862.17 | `use-pending-twap-store-*` | 4,536 |
| 3,876.79 | `bundler-*` | 10,125 |
| 3,907.27 | `portfolio-margin-*` | 3,496 |
| 4,073.77 | `use-email-embedded-wallet-*` | 36,664 |
| 4,116.92 | `wagmi-*` | 8,038 |
| 9,193.64 | `pwa-install-*` | 418,534 |

15 个 chunk 合计传输 `947,340 B`，15/15 的 `isLinkPreload` 都是 false。`client-root` 文件在 `3,562.16 ms` 完成，其闭包最后的钱包主导 chunk 在 `9,193.64 ms` 才完成，之后 client-root 模块信号为 `9,261.60 ms`、ClientRuntime ready 为 `9,303.40 ms`。因此 phase-0 看到的约 5.7 秒窗口可分成：

- 必需静态依赖下载尾部 `5,631.48 ms`；
- 全部下载后到 client-root 模块信号仅 `67.96 ms`，其中 renderer-main busy `57.01 ms`（83.89%），主要 `EvaluateModule` 片段为 `52.37 ms`。

这是明确的下载受限，不是 5.7 秒的 JavaScript 连续解析/求值。`pwa-install-*` 自身占观察闭包传输字节的 44.18% 并决定下载尾部。为它增加 modulepreload 可能改变排队顺序，但在同一 1.6 Mbps 预算下不会删除这 418 KB，还可能抢占 hydration/router 带宽；只改 chunk 名或 manualChunks 而保留同一静态 import 边，也不会缩短必需字节关键链。

#### normal-cold 固定激活成本

一次带 source map 的 normal-cold CPU profile 使用同一 `/trade/xyz%3ACXMT` 启动路径。探针观察到的原始 `hydration → ClientRuntime ready` 为 `367.10 ms`，其中 React DevTools commit 探针自身占 `57.25 ms`；扣除后为 `309.79 ms`，与正式矩阵 `306.5 ms` median 一致。该 `309.79 ms` 中 `243.63 ms`（78.64%）是 V8 idle/scheduler/async wait，应用活跃 CPU 只有 `66.17 ms`，其中 78.78% 可映射回源码。

| 活跃 CPU 归属 | self time | 占应用活跃 CPU |
| --- | ---: | ---: |
| mapped other | 19.38 ms | 29.28% |
| React reconciliation | 17.84 ms | 26.95% |
| Hyperliquid + Markets | 8.25 ms | 12.47% |
| V8 program/root | 7.46 ms | 11.27% |
| TanStack 其他路径 | 4.46 ms | 6.74% |
| Privy react-auth | 1.46 ms | 2.20% |
| client-root orchestration | 0.75 ms | 1.13% |

`hl-rq-cache-v1` 在该次启动前后各读取一次，值均为空且观测 duration 均为 `0 ms`，没有 PersistQuery 恢复主导 300 ms 的证据。钱包归属中只有 Privy react-auth 获得 `1.46 ms`（2.20%）leaf sample，Wagmi 和 smart-wallets 在本次 500 µs 采样中没有 leaf sample；“没有样本”不等于严格的零成本，但足以否定它们主导这 300 ms 窗口的说法。它主要是整棵 provider + route 树的 React concurrent 激活与调度等待；profile 能将一部分活跃成本定位到 reconciliation，但不能把“provider 树深度”单独从其中分离为一个可加数字。

#### 修订后的触发线与判定

以下是 Gatu 内部规划预算，不是 Web 官方指标：

1. **(a) 固定激活占比**：阶段 1 后 normal-cold 的 `hydration → ClientRuntime ready` 超过 500 ms，或占 `navigation → TopNav commit` 25% 以上。判定：**命中**。绝对值约 306.5 ms 未命中，但 9/9 正常冷缓存样本的占比都为 64.96–77.23%；
2. **(b) 钱包字节关键链**：去重钱包依赖子树达到 client-root 必需静态闭包 gzip 的 40%，或钱包主导 chunk 达到 Slow 4G 观察闭包传输字节的 40%。判定：**命中**，两个值分别为 64.14% 和 44.18%。旧措辞“公开 bootstrap 已开始，但钱包 chunk 拖住外框”已删除：当前 `MarketsProvider` 就在 client-root 内，market bootstrap 与外框被同一静态链共同延迟，无法观测前者先于钱包链开始；
3. **(c) 预加载/chunk 不足**：Slow 4G 下 client-root 文件完成后的必需下载尾部超过 3 秒，且必需窗口中下载占比超过 80%，同时静态图证明钱包字节仍是必需 import。判定：**命中**，下载尾部为 5.63 秒，占 `client-root file finish → module complete` 的 98.81%，钱包去重并集占闭包 64.14%。

三条触发线现均正式命中。结论是启动阶段 2 的 Provider 兼容拆分设计，而不是先单独上 preload 或只改 manualChunks。preload 可以作为后续边界完成后的对照实验，chunk 切分也应用来确保钱包字节真正从 public shell 必需链上消失，而不是只更换输出文件名。

实施仍必须是独立任务，并按以下顺序：

1. 在 `@gatu/hl-react` 内拆兼容上下文：
   - `HyperliquidTransportContext`：env、info、subscription、唯一 store；
   - `HyperliquidSessionContext`：clientKey、sessionMode、签名身份、Agent cleanup；
   - 原 `HyperliquidProvider` 暂时组合二者，保持调用方兼容；
2. 让 Markets/MarketsInfo 只依赖 transport，并证明全应用始终只有一个 store 和一组公共订阅；
3. 最后才调整 root/client-root，让公共 transport 与钱包 bundle 并行；钱包子树继续严格保持 Privy → SmartWallets → PersistQuery → Wagmi → signing session。

禁止使用以下快捷方式：

- 两个 `HyperliquidProvider`；
- 钱包 ready 后重建 transport/store；
- 同时隐藏挂载两套终端；
- 用 descendant Effect 把钱包地址推给 parent Provider；
- 为提前显示公共 UI 放宽 signing fail-closed；
- 将 Provider 重构和第一阶段视觉调整混在同一个变更中。

## 最终决策

阶段 0 和阶段 1 已完成，阶段 1 后 clean production 的 schema v2 完整基线已取代早期 1/12 场景 smoke。阶段 1 将 normal-cold TopNav pooled median 提前了 218 ms，并保持单一 WebSocket、精确 `xyz:CXMT` 订阅与 loading/ready 互斥，但没有改变 client-root/runtime 依赖链。

静态闭包、Slow 4G 瀑布和 CPU profile 给出了相互一致的结论：正常网络的约 306 ms 固定成本主要是 React concurrent 激活/调度等待，而 Slow 4G 的约 5.7 秒窗口主要是包含钱包子树的静态闭包下载，不是市场符号解析或长时间 JavaScript 求值。因此正式决策从“继续观察”更新为“启动 Provider transport/session 兼容拆分的独立设计与实施任务”。本轮仅建立证据和触发决策，未修改任何运行时 Provider 结构。
