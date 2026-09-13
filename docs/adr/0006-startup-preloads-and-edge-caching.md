# ADR 0006：启动预加载、边缘缓存与地区判定预取

- 状态：已接受（2026-09-13），阶段 1 与阶段 2 已发布到 `*.cloudfront.net`，正式域名切换后同样生效
- 前置：[ADR 0005](0005-spa-static-shell.md)（静态壳与无服务器托管）
- 计划与度量：[终端启动性能对齐官方站](../terminal-startup-performance-plan.md)、[任务记录](../work-memory/sessions/2026-09-13-spa-shell-spike.md)

## 背景与约束

CloudFront 首发后与官方站同环境冷缓存对比：官方站把 45 个启动块写进 HTML 一次并发下载，本项目的壳只写 6 个 `modulepreload`，其余 92 个块靠嵌套 `import()` 逐层发现；壳是 `no-cache`，每次导航都回源 S3；TradingView 内部的 85 个 bundle 每次都重新验证；地区判定要等钱包运行时加载后才发起，再加上 Lambda 冷启动与 IPdata 首次调用。约束不变：文档页永不加载钱包运行时，地区与法务门控 fail closed，订阅粒度与订单簿传输隔离不改，不新增依赖，预算与重新基线规则照常。

## 决策

1. **壳内预加载交易页启动闭包。** `scripts/inject-shell-preloads.mjs` 在 `pnpm build` 末尾运行：它复用 `check-client-bundle-budget.mjs` 拆出的 `analyzeClientBundle()`，取"静态交易启动"闭包与移动、桌面两个运行时 profile 的并集，把不在壳里的 JS 写成 `modulepreload`、CSS 写成 `preload as="style"`，包在 `<!--gatu-shell-preloads-->` 标记里插到 `_shell.html` 的 `</head>` 前，重复运行只替换该块。文档页不注入。闭包来自同一份 chunk 图，缺文件即失败；`deploy.mjs verify` 要求线上壳至少 20 个 `modulepreload`、每个 URL 都在本地构建里且线上返回 `immutable`。移动端因此也会下载桌面面板块，这与官方站一致，且总字节仍受"静态交易启动"预算约束。
2. **壳与文档页由边缘缓存并后台刷新。** 对象 `Cache-Control` 从 `no-cache` 改为 `public, max-age=0, s-maxage=60, stale-while-revalidate=300`：浏览器每次条件请求，CloudFront 一分钟内直接命中并在后台刷新，发布流程已有的 `/*` 失效保证新版本立即可见；`/join*` 保持 `no-store`。缓存策略变更用 `deploy.mjs reupload --only <前缀>` 强制重写已有对象的元数据，因为 `aws s3 sync` 会跳过内容未变的文件。
3. **TradingView 哈希 bundle immutable。** `charting_library/bundles/` 下文件名带 20 位内容哈希的文件（js、css、rtl.css、woff2、cur、svg、png）一年 immutable；入口 `charting_library.js`（带 `?v=<commit>`）、`sameorigin.html` 与主题样式继续重新验证。chart 响应头策略不再覆盖 `Cache-Control`，由对象元数据决定；Nitro 路由规则同步。
4. **地区判定从引导入口预取。** `src/lib/geo/geo-prefetch.ts` 在 4 KB 的引导块 `client.ts` 里对非文档路由发出一次 `/api/geo` 请求并暂存响应，`getGeo` 在无 override 时通过 `takeGeoPrefetch()` 一次性复用，失败即回退为自己请求。路由面判定从 `providers/client-runtime.tsx` 抽到无 React 依赖的 `config/app-route-surface.ts`，引导块因此不引入 React。查询键、`staleTime` 与 fail-closed 语义不变。
5. **Lambda 保温与提速。** 内存 256 MB → 512 MB；新增 `GET /api/health`（204，`no-store`）；EventBridge Scheduler `gatu-terminal-api-warm` 每 5 分钟用合成函数 URL 事件调用 `/api/health`，执行角色 `gatu-terminal-api-warm-role` 只允许调用该函数。角色与调度由 root 一次性创建，`gatu-edge` 策略不含 `scheduler`。
6. **不做边缘初判。** 用 `CloudFront-Viewer-Country` 在边缘直接回答 `/api/geo` 能把判定压到毫秒，但代理检测会从"先于交易"变为"随后收紧"；用户明确不采用，地区判定仍以 Lambda + IPdata 的完整判定为准。

## 备选方案与取舍

- 在 `__root.tsx` 的 `head()` 里写预加载：块名带哈希，只能在构建后得知，否决。
- 用 `<link rel="preload" as="fetch">` 预取地区判定：与 `fetch` 的 credentials/mode 匹配规则脆弱，容易变成双请求；代码级预取可测试，采用后者。
- 预置并发替代定时调用：需要别名与函数 URL 迁移，成本也更高；定时调用每月约 8,600 次空调用，忽略不计。
- 只给桌面注入预加载、移动端靠运行时发现：`modulepreload` 不支持 `media` 条件，`preload as="script"` 又与模块脚本的凭据模式不匹配；先接受移动端多下载桌面面板块，后续可在边缘按 UA 拆分。

## 后果与边界

- 冷加载的下载瀑布从四层变为一层，交互可用时间取决于带宽而不是往返次数；壳的 HTML 多约 2.5 KB。
- 边缘缓存壳意味着发布后最多 60 秒内的旧壳可能被新失效清掉前命中；发布流程先失效再验证，不影响资源本身（内容哈希）。
- `analyzeClientBundle()` 若因 chunk 图与产物不一致而失败，注入会中止并让构建失败，与预算检查同一失败面。
- `/api/health` 在 Nitro 宿主上不存在（过渡期 EC2 返回 404），只用于 CloudFront 目标。
- 验证证据（同环境冷缓存、Playwright 全新浏览器上下文、单样本）记录在任务记录第九检查点；本文不复制数字。
