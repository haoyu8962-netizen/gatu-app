# ADR 0006：启动预加载、边缘缓存与地区判定预取

- 状态：已接受（2026-09-13），阶段 1 与阶段 2 已发布；2026-09-15 正式域名已切到 CloudFront
- 前置：[ADR 0005](0005-spa-static-shell.md)（静态壳与无服务器托管）
- 计划与度量：[终端启动性能对齐官方站](../terminal-startup-performance-plan.md)、[任务记录](../work-memory/sessions/2026-09-13-spa-shell-spike.md)

## 背景与约束

CloudFront 首发后与官方站同环境冷缓存对比：官方站把 45 个启动块写进 HTML 一次并发下载，本项目的壳只写 6 个 `modulepreload`，其余 92 个块靠嵌套 `import()` 逐层发现；壳是 `no-cache`，每次导航都回源 S3；TradingView 内部的 85 个 bundle 每次都重新验证；地区判定要等钱包运行时加载后才发起，再加上 Lambda 冷启动与 IPdata 首次调用。约束不变：文档页永不加载钱包运行时，地区与法务门控 fail closed，订阅粒度与订单簿传输隔离不改，不新增依赖，预算与重新基线规则照常。

## 决策

1. **壳内预加载交易页启动闭包。** `scripts/inject-shell-preloads.mjs` 在 `pnpm build` 末尾运行：它复用 `check-client-bundle-budget.mjs` 拆出的 `analyzeClientBundle()`，取"静态交易启动"闭包与移动、桌面两个运行时 profile 的并集，把不在壳里的 JS 写成 `modulepreload`、CSS 写成 `preload as="style"`，包在 `<!--gatu-shell-preloads-->` 标记里插到 `_shell.html` 的 `</head>` 前，重复运行只替换该块。文档页不注入。闭包来自同一份 chunk 图，缺文件即失败；`deploy.mjs verify` 要求线上壳至少 20 个 `modulepreload`、每个 URL 都在本地构建里且线上返回 `immutable`。移动端因此也会下载桌面面板块，这与官方站一致，且总字节仍受"静态交易启动"预算约束。
2. **壳与文档页由边缘缓存并后台刷新。** 对象 `Cache-Control` 从 `no-cache` 改为 `public, max-age=0, s-maxage=60, stale-while-revalidate=300`：浏览器每次条件请求，CloudFront 一分钟内直接命中并在后台刷新，发布流程已有的 `/*` 失效保证新版本立即可见；`/join*` 保持 `no-store`。缓存策略变更用 `deploy.mjs reupload --only <前缀>` 强制重写已有对象的元数据，因为 `aws s3 sync` 会跳过内容未变的文件；2026-09-15 起它是桶内 `s3 cp --metadata-directive REPLACE` 复制，只改线上对象的元数据、不上传本地正文，所以不会绕过 `sync` 的 CSP 守卫，也不会单独发布一个引用尚未上传资源的壳。
3. **TradingView 哈希 bundle immutable。** `charting_library/bundles/` 下文件名带 20 位内容哈希的文件（js、css、rtl.css、woff2、cur、svg、png）一年 immutable；构建发出的入口副本 `charting_library.<内容哈希 16 位>.js` 同样 immutable（决策 6）；未哈希的 `charting_library.js`、`sameorigin.html` 与主题样式继续重新验证。chart 响应头策略不再覆盖 `Cache-Control`，由对象元数据决定；Nitro 路由规则同步。
4. **地区判定从引导入口预取。** `src/lib/geo/geo-prefetch.ts` 在 4 KB 的引导块 `client.ts` 里对非文档路由发出一次 `/api/geo` 请求并暂存响应，`getGeo` 在无 override 时通过 `takeGeoPrefetch()` 一次性复用，失败即回退为自己请求。路由面判定从 `providers/client-runtime.tsx` 抽到无 React 依赖的 `config/app-route-surface.ts`，引导块因此不引入 React。查询键、`staleTime` 与 fail-closed 语义不变。
5. **Lambda 保温与提速。** 内存 256 MB → 512 MB；新增 `GET /api/health`（204，`no-store`）；EventBridge Scheduler `gatu-terminal-api-warm` 每 5 分钟用合成函数 URL 事件调用 `/api/health`，执行角色 `gatu-terminal-api-warm-role` 只允许调用该函数。角色与调度由 root 一次性创建，`gatu-edge` 策略不含 `scheduler`。
6. **图表入口随首波下载。** `config/chart-library.ts` 的 `createChartLibraryScriptUrl(version)` 是运行时加载器与 `build-meta.json` 新字段 `chartLibraryScript` 的唯一来源；注入脚本据此在壳里 `preload` TradingView 入口（`preload` 上的 `media="(min-width: 1001px)"` 被浏览器遵守）；iframe 的 `runtime.*`、`library.*` bundle、`sameorigin.html` 与暗色主题样式则写进 `<meta name="gatu-chart-prefetch">`，由引导块的 `startSurfacePreloads()` 在桌面宽度下追加为 `prefetch` 链接（iframe 是另一个文档，只有 HTTP 缓存能复用；实测 Chromium 忽略 `prefetch` 链接上的 `media`，390 px 视口仍会下载 772 KB 的 `library.js`，所以不能写成 HTML 链接）。同一机制把启动闭包拆成三份：静态闭包与两个 profile 共有的文件仍是 HTML `modulepreload`，仅桌面或仅移动需要的文件写进 `<meta name="gatu-preload-desktop|mobile">`，引导块按 `matchMedia` 只追加当前面的那份，手机不再下载桌面面板块。移动布局只在切到图表页时才挂载图表。入口对象以内容哈希命名（2026-09-15 修正，取代首版的 `?v=<commit>` + immutable）：Vite 配置计算 `public/charting_library/charting_library.js` 的 SHA-256 前 16 位，经 `VITE_GATU_CHART_LIBRARY_HASH` 注入运行时，并由 build-meta 插件把同一份字节发出为 `charting_library/charting_library.<hash>.js`，该对象 immutable 一年；未哈希的原文件回到重新验证，只供开发服务器（无哈希时回退为 `?v=<commit>`）与失效前的旧壳使用。首版的缺陷是 CloudFront 缓存键不含查询串：失效完成前或某个 POP 若以旧正文回答新 `?v=`，浏览器会把旧库固定一年。`deploy/verify-chart-build.mjs` 只接受与源文件字节相同且名字等于源哈希的副本，`deploy.mjs verify` 要求壳预加载的是哈希入口、线上 immutable，且未哈希入口已回到重新验证。不采用官方站的头部同步脚本（阻塞解析），也不在面板挂载前创建 widget。
7. **引导块保持无依赖。** `client.ts` 的静态导入必须只有引导错误页与移动凭证清洗两项（`mobile-sync-bootstrap-fragment.test.ts` 钉住），地区预取与表面预加载合并为 `lib/bootstrap/early-prefetch.ts`，在清洗通过后与遥测、水合两个动态导入并行加载；该块列入预算脚本的静态启动闭包前缀（`early-prefetch`），因此仍由壳的 `modulepreload` 提前下载。
8. **排行榜 API 交给边缘缓存。** `/api/leaderboard` 的处理器本就输出 `public, max-age=60, s-maxage=300, stale-while-revalidate=60, stale-if-error=1800`，但 `/api/*` 行为用 CachingDisabled，每个请求都打到 Lambda；上游排行榜约 34 MB，刷新超过 10 s 的函数超时，页面得到空表。改为单独的 `/api/leaderboard` 行为（GET/HEAD，缓存策略 `gatu-terminal-api-cached`：TTL 0/0/1800、按完整查询串缓存、不含头与 Cookie、启用 gzip/brotli），由源的 `s-maxage` 决定新鲜期；函数超时同时提高到 30 s（CloudFront 源读取超时 30 s）。
9. **不做边缘初判。** 用 `CloudFront-Viewer-Country` 在边缘直接回答 `/api/geo` 能把判定压到毫秒，但代理检测会从"先于交易"变为"随后收紧"；用户明确不采用，地区判定仍以 Lambda + IPdata 的完整判定为准。

10. **热访问由 Service Worker 直接回答导航并后台刷新（2026-09-16）。** `sw.js` v9 对同源 GET navigate 分类：`/join`、`/join/*`、文件扩展名与边缘服务端路径不拦截；六个文档路由各按完整 URL 使用 `documents-v9` SWR；其它应用路由共用 `shell-v9` 中唯一的 `shell-v9` entry。命中立即返回完整 Response（包含 CSP 等头），由 `event.waitUntil` 延长后台刷新；未命中走网络并保存。仅保存未重定向的 200 `text/html`，失败不覆盖旧缓存。版本更新清理旧 shell/document cache，字体和图标策略不变，不启用 navigation preload。此方案替代延长浏览器 HTML max-age，HTTP/边缘缓存策略保持原值；网络与 CacheStorage 失败由测试覆盖，iOS Safari 导航行为仍需真机验证。

发布后的第一次导航可能得到上一版壳，CloudFront 失效不会清掉浏览器 CacheStorage。源码已核对：`deploy.mjs` 的 `buildSyncCommands` 不带 `--delete`，旧哈希资源仍在 S3；`prepareResponseFunction` 轮换 CURRENT/PREVIOUS，`terminal-response.template.js` 合并两套内联脚本哈希，保留上一版一个周期。SW 同时保存旧 Response 自带的 CSP，不把新策略套在旧正文上。`sw.js` 仍由 `NO_STORE_FILES` 下发 `no-store`，注册保留 `updateViaCache: "none"`，故坏 SW 可在下次访问时检查并替换；新 SW 激活会清理退休缓存，不能承诺发现更新的那次导航已经切换。验收以 Node SW harness 的路由隔离、缓存命中/刷新、响应过滤、头保留及路由列表源码契约为准，发布/真机结果另记。

## 备选方案与取舍

- 在 `__root.tsx` 的 `head()` 里写预加载：块名带哈希，只能在构建后得知，否决。
- 用 `<link rel="preload" as="fetch">` 预取地区判定：与 `fetch` 的 credentials/mode 匹配规则脆弱，容易变成双请求；代码级预取可测试，采用后者。
- 预置并发替代定时调用：需要别名与函数 URL 迁移，成本也更高；定时调用每月约 8,600 次空调用，忽略不计。
- 只给桌面注入预加载、移动端靠运行时发现：`modulepreload` 与 `prefetch` 都不支持 `media` 条件，`preload as="script"` 又与模块脚本的凭据模式不匹配；最终采用"共有部分写 HTML、面向单一表面的部分写 `<meta>` 由引导块追加"的折中，代价是这部分链接晚于 HTML 解析、早于路由块执行。

## 后果与边界

- 冷加载的下载瀑布从四层变为一层，交互可用时间取决于带宽而不是往返次数；壳的 HTML 多约 2.5 KB。
- 边缘缓存壳意味着发布后最多 60 秒内的旧壳可能被新失效清掉前命中；发布流程先失效再验证，不影响资源本身（内容哈希）。
- `analyzeClientBundle()` 若因 chunk 图与产物不一致而失败，注入会中止并让构建失败，与预算检查同一失败面。
- `/api/health` 在 Nitro 宿主上不存在（过渡期 EC2 返回 404），只用于 CloudFront 目标。
- 验证证据（同环境冷缓存、Playwright 全新浏览器上下文、单样本）记录在任务记录第九检查点；本文不复制数字。
