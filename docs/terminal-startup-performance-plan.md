# 终端启动性能对齐官方站：修复计划

状态：阶段 1（P2、P3）与阶段 2（P1、P4.1、P4.2）已发布到 `*.cloudfront.net`，决策记录在 [ADR 0006](adr/0006-startup-preloads-and-edge-caching.md)；P4.3 边缘初判按用户决定不做；阶段 3 评估后暂缓（见 P5、P6 的说明）；阶段 5（P9 图表入口提前）已实施；阶段 4 未开始。阶段 2 后的同环境测量见任务记录第九检查点：97 个启动块 0.94 s 到齐、FCP 220 ms、`/api/geo` 1.39 s，官方站同工具 FCP 1,148 ms、58 块 1.35 s 到齐。基线是 `claude/spa-mode` 分支提交 `6721c375` 的 CloudFront 首发；对比对象是 2026-09-13 在同一台机器、同一个应用内浏览器里冷缓存实测的 `app.hyperliquid.xyz/trade/HYPE`。度量方法、原始数字与官方站技术栈指纹记录在 [任务记录](work-memory/sessions/2026-09-13-spa-shell-spike.md) 第八检查点；托管形态见 [ADR 0005](adr/0005-spa-static-shell.md) 与 [CloudFront 手册](../deploy/cloudfront/README.md)。

## 目标

把冷加载"可交互"时间拉到与官方站同一量级，同时保住本项目已经领先的部分：预渲染骨架先于 JS 出现、完整安全头、资源 immutable 缓存、生效的 Service Worker、fail-closed 的地区与法务门控。

| 指标（同环境冷缓存单样本） | 官方站 | 当前 | 目标 |
| --- | --- | --- | --- |
| HTML 内预加载的启动 JS 占比 | 45 个 `modulepreload`，≈ 100% | 6 个，≈ 35% | ≥ 95%（交易页静态闭包全部进壳） |
| `client-root` / 主块到达 | 与首批并发 | 7.3 s / 8.0 s | 与首批同批，受带宽限制 |
| 图表首个 bundle 到达 | ≈ 2.4 s | 11.6 s | ≤ 5 s；二次访问 0 次回源 |
| `/api/geo` 完成 | 无此步骤 | 11.7 s（Lambda 冷 1.6 s，热 0.36 s） | ≤ 2 s |
| 壳 TTFB（重复访问） | 边缘命中 | 430 ms，`RefreshHit` 回源 | 边缘命中，< 100 ms |
| `/trade` 首屏 JS 文件数 | 59 | 98 | ≤ 60 |
| `load` 与官方站差距 | 3.9 s | 6.2 s（含 2.2 s 冷边缘 TTFB） | ≤ 20% |

不追求的目标：不改钱包运行时分层（文档页永不加载 Privy），不放弃地区门控，不改订阅粒度与订单簿传输隔离，不引入第三方分析 SDK。

## 约束

- 遵守 [AGENTS.md](../AGENTS.md) 的契约：钱包签名、入门顺序、Provider 层级、响应式布局与订阅所有权在优化启动时不得改变；`docs/terminal-performance-baseline.md` 的预算与重新基线规则照常执行，数字只在干净构建后按规则更新，不为让 CI 变绿而改。
- 编码规范按 `agent.md` 与 `.claude/rules/code-style.md`：函数声明、`interface Props`、无组件内注释、无 barrel、Biome 通过；测试放 `apps/terminal/src/lib/tests/` 或与脚本同目录的 `node --test`；部署脚本继续默认 dry-run，`--execute` 才动 AWS。
- 不改 `pnpm-lock.yaml`，不新增依赖（Codex 会话仍在共享工作区改锁文件与 Across 相关文件）。
- 文档随实现同一提交更新：受影响的手册、README、ADR 与 `CHANGELOG.md`；任务记录在每个检查点更新并跑 `pnpm memory:index`、`memory:check`、`memory:test`。
- 每一项都要有"改前 / 改后"的同环境测量，单样本只看量级，结论以 `deploy.mjs verify` 与预算脚本为准。

## 设计

### P1 · 壳内预加载交易页静态闭包（最大收益）— 已实施；第十一检查点起按表面拆分：共有闭包仍是 HTML `modulepreload`，仅桌面或仅移动需要的块写进 `<meta name="gatu-preload-desktop|mobile">` 由引导块追加，手机不再下载桌面面板块

问题：壳只写 6 个 `modulepreload`，其余 92 个块靠嵌套 `import()` 逐层发现，形成 `client-root` → 主块 → 页面块 → 面板块的四层瀑布；官方站把 45 个块一次写进 HTML。

做法：新增 `scripts/inject-shell-preloads.mjs`，在 `pnpm build` 的预算检查之后运行。它复用 `scripts/client-chunk-graph.mjs` 的 `collectChunkGraphStaticClosure` 与 `check-client-bundle-budget.mjs` 已定义的"静态交易启动"闭包（路由预加载 + `client-root` + `trade-terminal-page` 前缀块）和"运行时启动"模块（`commonModuleIds` 与桌面/移动 profile），算出需要提前下载的 JS 与 CSS 文件，按拓扑顺序把 `<link rel="modulepreload" href="/assets/…">`（CSS 用 `rel="preload" as="style"`）插到 `_shell.html` 的 `</head>` 前；已有的 6 个链接去重。只改 `_shell.html`，文档页不注入。

约束与验证：预加载的 URL 必须全部存在于 `.output/public/assets`（脚本失败关闭）；`deploy.mjs verify` 新增一项，核对线上壳的 `modulepreload` 数量与本地一致且每个 URL 返回 200 与 `immutable`；`scripts/inject-shell-preloads.test.mjs` 用假图覆盖去重、排序与缺文件失败。移动端会多下载桌面面板块，这与官方站一致，且总量受现有"静态交易启动 1,570,221 B gzip"预算约束，不新增字节。

备选：把预加载写进 `__root.tsx` 的 `head()`。否决，因为块名带哈希，只能在构建后得知。

### P2 · 壳与文档页改为边缘缓存 + 后台刷新 — 已实施

问题：`_shell.html` 是 `no-cache`，实测每次导航都 `RefreshHit` 回源 S3，首个边缘节点冷启动 TTFB 2.2 s；官方站 HTML 由边缘直出。

做法：`deploy/cloudfront/deploy.mjs` 的 `HTML_CACHE_CONTROL` 改为 `public, max-age=0, s-maxage=60, stale-while-revalidate=300`。浏览器仍每次条件请求，CloudFront 在 60 秒内直接命中并在后台刷新；发布流程已有的 `/*` 失效保证新版本秒级可见。`/join*` 行为保持 `CachingDisabled` 与 `no-store` 不变。可选项：给 S3 源开启 Origin Shield（`ap-northeast-1`），让全球边缘的首次未命中打到二级缓存而不是 S3；按请求计费，先测再定。

验证：`deploy.test.mjs` 断言新的头；`verify` 增加"二次请求 `x-cache` 为 Hit 或 RefreshHit 且 `age` 存在"的检查；`curl` 前后对比 TTFB。

### P3 · TradingView 内部 bundle 改为 immutable — 已实施

问题：`charting_library/` 全部 `max-age=0, must-revalidate`，每次打开图表 85 个文件逐个重新验证并在冷边缘 `Miss`；这些文件名本身带 20 位内容哈希。

做法：`objectCacheControl` 新增规则：`charting_library/bundles/` 下文件名匹配 `\.[0-9a-f]{20}(\.rtl)?\.(js|css)$` 的返回 `IMMUTABLE_CACHE_CONTROL`；入口 `charting_library.js`、`sameorigin.html`、`tradingview-theme-*.css` 与其他未哈希文件保持重新验证。入口继续带 `?v=<commit>`。Nitro 的 `routeRules`（过渡期 EC2）同步加同一条规则，两个宿主行为一致。

验证：`deploy.test.mjs` 覆盖哈希与非哈希两类；`verify` 增加对一个 bundle 文件的 `immutable` 与二次 `Hit` 检查。

### P4 · 地区判定提前并压低延迟 — 第 1、2 项已实施，第 3 项不做

问题：`/api/geo` 在钱包运行时加载后才发起，冷加载 11.7 s 才拿到结果；Lambda 冷启动加 IPdata 首次调用约 1.6 s。

做法，三层叠加：

1. 客户端提前发起：新增 `apps/terminal/src/lib/geo/geo-prefetch.ts`，在 `client.ts`（4 KB 入口块，早于路由块执行）对非文档路由调用 `startGeoPrefetch()`，用与 `getGeo` 相同的 `fetch` 参数发出一次请求并暂存 `Promise<Response>`；`getGeo` 在无 override 时通过 `takeGeoPrefetch()` 复用这个响应（一次性，失败即回退为自己请求）。文档路由不预取。`useGeoRestriction` 的查询键、`staleTime` 与 fail-closed 语义不变。
2. Lambda 保温与提速：内存 256 MB → 512 MB（arm64，冷启动更短，成本近似持平）；新增 `GET /api/health` 返回 204（`lambda-handler.ts` 路由，`verify` 也用它）；EventBridge Scheduler 每 5 分钟用合成事件调用函数。创建调度规则需要 `scheduler:*` 与 `iam:PassRole` 权限，`gatu-edge` 策略目前没有，由用户用 root 一次性补齐或改用预置并发。
3. 可选的边缘初判（需要用户决策）：viewer-request 函数用 `CloudFront-Viewer-Country` 与 `-Country-Region` 直接回答 `/api/geo` 的"国家级"判定（毫秒级），客户端随后再向 Lambda 确认代理判定。这会把代理检测从"先于交易"变为"随后收紧"，改变现有契约，未经确认不做。

验证：`payload-hash.test.ts` 旁新增 `geo-prefetch.test.ts`（复用、一次性、失败回退、文档路由不预取）；`lambda-handler.test.ts` 加 health 用例；线上测 `geoEnd` 时间与冷/热延迟。

### P5 · 分块整理与命名对齐 — 暂缓

阶段 2 之后重新评估：chunk 图显示 `vendor-tanstack-router` 实际是"入口共享块"（217 个仓库模块：hl-react signing/internal/hooks、`lib/hyperliquid`、`domain/market`、类别路由与错误页），`client-hydrate.tsx` 又静态引用 hl-react 的请求调度器，所以即使把 hl-react 与 SDK 拆成独立块，它们仍在水合前的静态闭包里；388 个 JS 块里 294 个小于 10 KB，但它们大多属于非启动路由，启动路径的 97 个文件在预加载后 0.94 s 内一次到齐。继续重排要改动预算脚本按块名识别的 surface（`client-root`、`trade-terminal-page`、`token-selector-popup` 等）并重新基线，收益已无法在测量里体现，因此暂缓；若日后要做，先把 `client-hydrate.tsx` 对请求调度器的引用改为错误时动态导入。

问题：`createManualChunks` 只按少数包名分配，Rollup 把 hl-react、zustand、sonner 等并进了名为 `vendor-tanstack-router` 的块，React 落在 `vendor-base-ui`，`vite-manual-chunks.test.ts` 只测函数不测产物；`/trade` 首屏 98 个 JS 文件。

做法：在 P1 落地并测量之后再做，避免两项改动互相掩盖。明确规则：`react`、`react-dom`、`scheduler` → `vendor-react`；`@nktkas/hyperliquid` → `vendor-hyperliquid`；`@privy-io`、`wagmi`、`@wagmi`、`viem`、`ox`、`permissionless` → `vendor-wallet`；`@lifi/sdk` → `vendor-lifi`；`@lingui` → `vendor-i18n`；`zod`、`zustand`、`big.js` → `vendor-core`。再尝试 `build.rollupOptions.output.experimentalMinChunkSize`（从 10 KB 起）折叠 `format-*`、`use-mobile`、`theme-toggle` 这类小块。每一步都跑 `check-client-chunk-cycles.mjs`、预算脚本与 `perf:startup`，任何一步引入循环块或超出"最大块 1,200,000 B gzip"上限就回退该步。

验证：新增产物级测试，读取 `client-chunk-graph.json` 断言 React 与 SDK 落在声明的块中；文件数目标 ≤ 60。

### P6 · 首屏字体与小项 — 字体保留，其余等 EC2 退役

复核后 IBM Plex Sans 并非只用于一处：`font-market-close` 用在交易页头部、市场概览、代币选择器与历史订单表，都在首屏可见，去掉预加载会造成首屏字体闪换，因此两套预加载保留。

- 首屏同时预加载 Inter 与 IBM Plex Sans 两套可变字体（94 KB gzip）。IBM Plex Sans 只用于 `--font-market-close`；改为不预加载、`font-display: swap` 按需加载，`FONT_PRELOAD_URLS` 只留 Inter。若设计上坚持两套，改为只预加载首屏可见的那一套。
- Radix 与 Base UI 并存来自 `cmdk` 与 `vaul` 的依赖，替换成本高于收益，本轮不动，记入观察项。
- `nitro({ compressPublicAssets: true })` 每次构建生成 915 个 `.gz/.br/.zst`，CloudFront 用不到；EC2 退役后关闭。

### P7 · 可观测性（最小集）

CloudWatch 告警：Lambda `Errors`、`Throttles`、`Duration p95`；CloudFront `5xxErrorRate` 与 `CacheHitRate`；SNS 邮件通知；Lambda 日志保留 30 天。需要 `cloudwatch:PutMetricAlarm`、`sns:*`、`logs:PutRetentionPolicy`，同样由用户一次性授权。不引入第三方分析。

### P8 · 过渡期与文档

- 证书签发后给两条分发挂别名与证书，用户切 DNS，稳定一个周期后退役 EC2，随后删除 `/client-error-report` 别名、关闭预压缩产物。
- 壳 head：`lib/seo.ts` 为所有路由输出 `canonical`，壳里因此固定指向 `/trade`；改为只有文档路由输出 `canonical`，应用壳不带。
- 文档：`agent.md` 第 44 行与 `apps/terminal/README.md` 第 50、52、117 行的 SSR 表述改为"预渲染壳"；`deploy/README.md` 开头改为指向 CloudFront 手册并把 EC2/Caddy 部分标为过渡期；`docs/README.md` 部署入口指向 CloudFront 手册；新增 ADR 0006 记录壳预加载、边缘缓存策略、图表 immutable 与地区预取的取舍；按规则重新基线 `terminal-performance-baseline.md`。

### P9 · 图表入口提前 — 已实施（第十检查点：入口 0.36–0.45 s 到达，iframe 内 `library.js` 缓存命中，样本 2 中 iframe 0.94 s 创建、约 1.8 s 完成核心资源）；第十一检查点修正：Chromium 忽略 `prefetch` 上的 `media`，iframe 文件改由引导块在桌面宽度下追加

问题：`charting_library.js` 由 `lib/chart/load-tradingview.ts` 在图表面板挂载后才以 `<script>` 注入，同机冷缓存 1.76 s 到达；随后 widget 在同源 iframe（`charting_library/sameorigin.html`）里再请求 72 个文件，其中 `bundles/library.<hash>.js` 原始 2.8 MB，iframe 阶段约 0.7 s。官方站在 HTML 头部同步 `<script>` 加载入口（0.54 s 到达），代价是阻塞解析，FCP 1.15 s。目标是让入口与 iframe 的大文件随首波并发下载、widget 创建时全部命中缓存，同时不阻塞解析、不提前创建 widget（[Runtime guardrails §4](runtime-guardrails.md#4-tradingview-lifecycle)）、移动端不多下载。

做法：

1. **同一来源的入口 URL。** `config/chart.ts` 增加纯函数 `createChartLibraryScriptUrl(commit)`（`/charting_library/charting_library.js?v=<commit>`），`load-tradingview.ts` 的 `TRADINGVIEW_SCRIPT_SRC` 改用它；`createBuildMeta()` 增加 `chartLibraryScript` 字段写进 `build-meta.json`，vitest 断言字段与运行时常量相同。注入脚本是 node，不能直接引用带别名的 TS，所以通过 `build-meta.json` 消费。
2. **壳内 preload 入口，prefetch iframe 大文件。** `inject-shell-preloads.mjs` 读取 `build-meta.json` 的 `chartLibraryScript`，注入 `<link rel="preload" as="script" href="…" media="(min-width: 1001px)">`；对 `public/charting_library/bundles/` 里的 `runtime.<hash>.js` 与 `library.<hash>.js`（构建时 glob，各必须恰好一个，否则构建失败）以及 `sameorigin.html`、`tradingview-theme-dark.css` 注入 `<link rel="prefetch" media="(min-width: 1001px)">`。用 prefetch 而不是 preload，是因为这些文件由 iframe 文档请求，父文档的 preload 缓存不跨文档，只有 HTTP 缓存能复用，且 prefetch 优先级最低，不与启动 JS 争抢。断点数字来自 `config/layout.ts` 的 `MOBILE_BREAKPOINT_PX`，vitest 校验脚本常量与配置一致。
3. **入口 immutable。** `objectCacheControl` 与 Nitro 路由规则把 `charting_library/charting_library.js` 改为 immutable：版本由 `?v=<commit>` 决定，浏览器按完整 URL 缓存；CloudFront 的 CachingOptimized 不把查询串纳入缓存键，但发布流程的 `/*` 失效已经刷新边缘。`sameorigin.html` 与主题样式保持重新验证，prefetch 之后 iframe 的条件请求得到 304，代价一个往返。
   > 2026-09-15 修正：对抗审查指出 CloudFront 缓存键不含查询串，`?v=<commit>` + immutable 可能把旧库以新 URL 固定一年。入口改为构建发出的内容哈希副本 `charting_library.<hash>.js`（immutable），未哈希文件回到重新验证；见 [ADR 0006](adr/0006-startup-preloads-and-edge-caching.md) 决策 6 的修正。
4. **移动端不参与。** `mobile-trade-layout.tsx` 只在 `topView === "chart"` 时激活图表，`media` 条件让 1000 px 及以下不下载这些文件。
5. **不做的事。** 官方站式头部同步脚本（阻塞解析、FCP 退化）；在面板挂载前创建 widget；预取 72 个文件全集（文件名随语言与主题变化，大部分是小 CSS，收益集中在 `library.js`）。

验证：注入脚本测试覆盖字段缺失与 glob 不唯一即失败、media 条件、去重；DNS 切换前在 iPad WebKit 上做热缓存图表初始化回归（`deploy/README.md` 记录过 v28 在 WebKit 热缓存下可能初始化失败，但没有可复现证据，immutable 入口与 bundle 是新的暴露面）；`deploy.test.mjs` 断言入口 immutable；`verify` 新增"壳含图表入口 preload 且线上返回 200 与 immutable"；Playwright 同机冷缓存前后对比 `chartEntryEnd`（目标 ≤ 1.0 s）、iframe `frameStart` 与资源完成（目标 ≤ `frameStart` + 0.2 s）、控制台无 "preloaded but not used" 警告；DevTools Slow 4G 对比 FCP 与启动 JS 到齐时间不退化。

预期收益：入口到达 1.76 s → 约 0.9 s；iframe 阶段 0.7 s → 约 0.15 s；图表可见约提前 1 s；FCP 与 load 不变。

风险与边界：`library.js` 约 700 KB gzip 的 prefetch 在慢网上仍占用带宽，靠最低优先级缓解，需要实测；TradingView 升级后文件名变化由构建时 glob 覆盖；入口 immutable 依赖发布失效，若绕过 `deploy.mjs` 手动替换 TradingView 文件而不失效，边缘会继续提供旧入口。

提交与发布：一个提交（`config/chart.ts`、`config/build-meta.ts`、`lib/chart/load-tradingview.ts`、`scripts/inject-shell-preloads.mjs` 与测试、`deploy/cloudfront/deploy.mjs` 与测试、`vite.config.ts` 路由规则、CloudFront 手册、`CHANGELOG.md`、ADR 0006 补一条决策）；构建 → `reupload --only charting_library/charting_library.js`（元数据变化）→ `sync` → 两条 `invalidate` → `verify` → Playwright 前后对比写入任务记录。

## 执行顺序与检查点

| 阶段 | 内容 | 是否改应用代码 | 完成标准 |
| --- | --- | --- | --- |
| 1 | P2、P3（只改 `deploy.mjs` 与 Nitro 路由规则）→ 发布 → 测量 | 否 | `verify` 新增项通过；壳二次请求边缘命中；图表 bundle 二次 0 回源 |
| 2 | P1、P4.1、P4.2 → 构建 → 发布 → 测量 | 是 | 壳 `modulepreload` 覆盖静态闭包；`client-root` 与首批同批到达；`geoEnd` ≤ 2 s（热） |
| 3 | P5、P6 → 干净构建 → 重新基线 → 发布 → 测量 | 是 | 文件数 ≤ 60；无循环块；预算按规则更新并记录 |
| 4 | P7、P8，以及需要用户决策的 P4.3 | 部分 | 告警可触发；文档与 ADR 合并；DNS 切换后退役 EC2 |
| 5 | P9 图表入口提前 → 构建 → 发布 → 测量 | 是 | 入口 ≤ 1.0 s 到达；iframe 资源在 `frameStart` + 0.2 s 内完成；FCP 不退化 |

每个阶段一个 Conventional Commit，只暂存本阶段路径；每次发布后把同环境冷缓存测量（`timing`、`resources`、`shellChunks`、`clientRootEnd`、`chartEnd`、`geoEnd`）追加到任务记录，不覆盖旧数据。

## 需要用户决定的事项

1. P4.3 边缘初判是否采用：换取毫秒级地区判定，代价是代理检测从"先于交易"变为"随后收紧"。
2. P4.2 保温方式：EventBridge 定时调用（需补 IAM 权限）还是预置并发（多一个别名与函数 URL 迁移）。
3. P2 是否开启 Origin Shield（按请求计费）。
4. P6 字体：是否接受 IBM Plex Sans 退出首屏预加载。
5. P7 告警通知的邮箱与授权。
