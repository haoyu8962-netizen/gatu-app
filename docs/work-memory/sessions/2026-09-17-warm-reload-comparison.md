<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-warm-reload-comparison",
  "date": "2026-09-17",
  "title": "二三次刷新对照：app.gatu.ai 与官方终端",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "热刷新时 app.gatu.ai 零网络字节（SW 回壳 + immutable 资源），官方每次刷新约 61 个 304 条件请求；两站网格就绪都约 0.45–0.7 s，时间花在 JS 编译执行与初始化；我们的导航栏要等钱包运行时块，是可见的优化点。",
  "thread": null,
  "baseCommit": "4fca2b34d91d75aa18c596017301bacf268f19f7",
  "commits": ["ee5dd28a"],
  "sources": [
    { "path": "docs/adr/0006-startup-preloads-and-edge-caching.md" },
    { "path": "apps/terminal/tests/browser/boot-milestones.mjs" },
    { "path": "apps/terminal/src/providers/root.tsx" }
  ],
  "supersedes": []
}
-->
# 二三次刷新对照：app.gatu.ai 与官方终端

## 背景与范围

用户反馈"第二、三次刷新页面都像重新加载"，要求对照 `app.hyperliquid.xyz/trade/HYPE` 的做法。同步记录，2026-09-17，本地 macOS，Playwright Chromium headless、持久化 profile（保留 HTTP 缓存与 Service Worker），每个源连续加载三次；测量脚本为临时文件，未入库。

## 结论与依据

响应头（curl，2026-09-17）：

| 对象 | app.hyperliquid.xyz | app.gatu.ai | 本地 Nitro 3017 |
| --- | --- | --- | --- |
| HTML | 无 Cache-Control，仅 ETag/Last-Modified；`X-Cache: Error from cloudfront`（S3 403 → 自定义错误页返回 index.html） | `public, max-age=0, s-maxage=60, stale-while-revalidate=300`；SW `shell-v9` 直接回壳 | `no-cache`；SW 同上 |
| 哈希 JS/CSS | 无 Cache-Control，仅 ETag/Last-Modified（浏览器启发式缓存，刷新时逐个条件请求） | `public, max-age=31536000, immutable` | 同线上 |
| sw.js | 无 SW | `no-store` | `no-store` |

三次加载（视口 1440×900，`/trade/BTC`，就绪 = 首个 `.react-grid-item`）：

| 源 | 第 1 次 | 第 2 次 | 第 3 次 |
| --- | --- | --- | --- |
| app.gatu.ai | 就绪 1970 ms，网络 2508 KB，TTFB 1203 ms | 就绪 754 ms，网络 0 KB（111 资源命中缓存，仅 `/api/geo`），文档由 SW 回答 | 就绪 686 ms，网络 0 KB |
| app.hyperliquid.xyz | 就绪 2471 ms，网络 2249 KB | 就绪 645 ms，网络 17 KB（61 个 304 条件请求） | 就绪 444 ms，网络 17 KB |
| 本地 3017 | 就绪 1055 ms | 就绪 853 ms，仅 `/api/geo`（本地 503） | 就绪 676 ms |

第 3 次加载的里程碑（`boot-milestones` 改为持久 profile）：app.gatu.ai TTFB 48、DCL 80、React 水合 159、Privy iframe 193，导航栏/工作区/网格同时出现在 512，盘口数据 590；官方 DCL 306、FCP 368、网格 489、Privy iframe 529（网格先于钱包运行时）。所有 JS 资源在 143 ms 前已从缓存取回，159→512 的间隔不是网络。

CDP Profiler（第 3 次加载，采样 500 µs）：两站都以 `(program)`（脚本编译、GC、原生 DOM）为主，app.gatu.ai 533 ms、官方 649 ms；脚本自耗时我们约 400 ms（router 115、client-hydrate 66、TradingView library 58、base-ui 29），官方约 350 ms（config 133、library 67、react-dom 60）；空闲各约 1 s（等 WebSocket/数据）。两站均把 React Query 缓存持久化在 localStorage（官方 334 KB、我们 238 KB）。

结论：线上热刷新不是"重新下载"，缓存策略优于官方；两站就绪时间同量级。感知差异来自：(1) Vite 开发服务器（`vite dev`）每次刷新按模块逐个请求约 1,900 个文件，属开发模式设计，不代表生产；(2) 我们的导航栏与工作区必须等 `ClientRuntimeGate`（client-root 块含 Privy/wagmi，原始 1.5 MB）加载执行并 `ClientRuntimeProvider` 就绪后才一起出现（159→512 ms 全空白），官方在钱包运行时之前就渲染网格。

## 验证与限制

以上均为本机 headless Chromium 单次采样，非真机与多网络条件；`/api/geo` 本地返回 503 属本地无地理后端。未修改仓库代码。官方站在内置浏览器面板中的表现未测。

## 后续与替代关系

候选优化（未实施，需单独决策）：把 TopNav/FooterBar 与市场数据提供者移出钱包运行时门控，钱包 SDK 仅门控需要签名/账户的 UI，预期导航栏在约 200 ms、工作区在约 350–400 ms 出现；`/api/geo` 结果按会话缓存以去掉热刷新唯一的网络请求；HTTP 缓存与 SW 策略不需改动。下次先查 `apps/terminal/src/providers/root.tsx`（`ClientRuntimeGate`）与 `src/routes/__root.tsx`（`AppRuntime`/`StartupReadyGate`）。
