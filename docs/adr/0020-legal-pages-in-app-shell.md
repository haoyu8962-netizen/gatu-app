# ADR 0020：文档与法律页并入应用外壳

- 状态：已接受并实施，2026-09-27；尚未发布。本记录不代表已部署，也不代表已在真机上验收。
- 取代：[ADR 0005](0005-spa-static-shell.md) 中“文档路由单独预渲染真实 HTML、边缘函数把它们改写到 `index.html`”的部分；[ADR 0006](0006-startup-preloads-and-edge-caching.md) 中文档页按 URL 缓存（`documents-v9`）和“文档路由不预取地区”的部分；[ADR 0010](0010-blank-until-ready-startup.md) 决策 2 中保留文档路由分类与文档预渲染的部分。这些 ADR 的其余决策不变。
- 关联：[运行时约束](../runtime-guardrails.md)、[启动渲染规则](../../.claude/rules/startup-rendering.md)、[CloudFront 部署](../../deploy/cloudfront/README.md)。

## 背景

`/docs`、`/support`、`/terms`、`/privacy`、`/risk`、`/cookies` 原本是“文档路由”：构建时预渲染成独立 HTML，根路由对它们跳过钱包运行时、启动门和市场上下文，由专用的 `DocumentChrome` 渲染一套只含 5 个文档链接、主题和语言切换的顶栏，以及只有 Cookie Policy 和版本号的页脚。桌面端打开这些页面，看到的是一套与交易终端不同的导航。

2026-09-27 用内置浏览器实测 `app.hyperliquid.xyz/terms`（1440×900 与 375×812）：条款页就是普通应用页。桌面端使用与交易页相同的顶栏（Trade、Portfolio、Earn…、Deposit、账户菜单）和底栏（在线状态，Docs / Support / Terms / Privacy Policy）；移动端使用应用自己的移动顶栏；页面上没有单独的文档导航。

## 目标与约束

- 6 个页面在桌面端使用与其他应用页相同的 `TopNav` 和 `FooterBar`，移动端使用 `MobileHeader`，不再有独立的文档导航。
- 与 Portfolio、Referrals 等仪表盘页同样的启动方式：`StartupFallback` 空播报 → 运行时与字体就绪 → 真实外壳。不为这些页面另造骨架或专用外壳。
- 钱包签名、法律接受、地区门控等守卫不变。页面只展示内容，不触发签名。
- 边缘函数、Service Worker、Node 静态页回答与构建配置保持同一套路由分类，不留死代码。

## 决策

1. **去掉“文档”这一类路由表面。** 删除 `config/document-routes.ts`、`isDocumentRoutePath` 和根路由的文档分支；`getAppRouteSurface` 只剩 `terminal` 与 `dashboard`。6 个页面归入 `dashboard`：`ssr: false`，`beforeLoad` 使用 `bootDashboardRoute()`：它在交易页的揭示预算（1,500 ms）内等待共享的 `dashboard-chrome.tsx` 实例（账户菜单、`GlobalModals`、桌面 `FooterBar`）加载完成，首帧就带着页脚和弹层宿主（ADR 0012 的做法，PR #46 为全部仪表盘页实现）。本 PR 曾为法律页单独写过 `bootLegalRoute` / `preloadLegalDocPage`，合并 `dev` 后删除，改用共享实现。
2. **`LegalDocPage` 使用仪表盘外壳。** 用 `DashboardFrameView` 和新增的 `DASHBOARD_FRAMES.legal` 预设（`bg-background`，正文 `max-w-3xl`），页头用共享的 `DashboardHeader`（桌面 `TestnetBanner` + `TopNav`，移动 `MobileHeader`），桌面挂共享的惰性 `FooterBar`、移动无页脚，并挂载共享的 `GlobalModals`，让顶栏的 Deposit、连接和账户操作可用。正文仍是 `<article lang="en" dir="ltr">`。删除 `DocumentChrome` 与 `DocumentOverlays`。
3. **只预渲染 SPA 壳。** `createTanstackStartOptions()` 不再列 `pages`；Node 静态页、CloudFront viewer-request 函数都把这 6 个路径交给 `_shell.html`。`deploy.mjs verify` 的“预渲染文档路由”检查改为“法律页导航返回与本地构建一致的壳”。
4. **Service Worker 升到 v10。** 删除 `documents-*` 缓存与路由表，6 个路径与其他应用路径共用唯一的壳缓存条目；激活时清理 `shell-v9`、`documents-v9`。
5. **地区判定对所有入口预取。** 已没有不加载运行时的入口，`shouldPrefetchGeo` 删除，引导入口总是预取 `/api/geo`。
6. **Cookie 说明从隐私政策进入。** 官方没有单独的 Cookie 页，也没有底栏链接；它的隐私政策里有一段 “Cookie Policy:”。gatu 保留更详细的 `/cookies` 页，但入口照官方放在隐私政策里：第 4 节（Cookies, Local Storage, and Analytics）末尾加一句链到 `https://app.gatu.ai/cookies`，写法与法律文档之间现有的绝对链接一致，终端和营销站都能打开；隐私政策的 Last Updated 改为 2026-09-27。全局底栏保持 Docs / Support / Terms / Privacy Policy / Risk Disclosure。
7. **移动抽屉放 Docs 与 Support，不放法律页。** 官方手机抽屉在更多类链接之后放 Docs 和 Support，Terms、Privacy 在手机上没有导航入口。gatu 的 `MobileNavDrawer` 在 More 分组的 Statistics、API Wallet 之后加 Docs（`/docs`）和 Support（`/support`）；抽屉条目都有按压反馈：未选中项用 `TOUCH_PRESS_CLASS`，选中项用 `TOUCH_PRESS_FADE_CLASS`（选中底色 `--fill-hover` 与 `--fill-weak` 同值，背景型反馈看不出变化），选中态按不区分大小写、去掉尾斜杠的路径判断，与路由匹配一致；Terms、Privacy Policy、Risk Disclosure、Cookie Policy 仍不进抽屉，照样可以从法律接受弹窗、正文里的互相链接和 URL 进入。
8. **发布时用壳覆盖遗留的文档页。** 官方任何路径都返回同一个 SPA 壳（实测 `/terms/index.html` 和不存在的 `.js` 都返回壳，6,831 字节），不存在过期的独立页面。gatu 的 `sync --execute` 上传完成后，用本次构建的 `_shell.html` 覆盖 ADR 0020 之前构建留下的六个 `<route>/index.html`（`aws s3 cp`，HTML 缓存策略，`text/html`）；本次构建仍包含的保持原样，以便回滚。最初的实现是删除这六个文件（`5a136d71`），第二轮审查指出回滚时旧请求函数会先把 `/terms` 指到已删除的文件，页面 404，`functions --origin` 抓取线上页面计算 CSP 哈希时也会中断，所以改为覆盖。`verify` 逐页检查六个路径：本地构建不含该页时，`/<route>` 与 `/<route>/index.html` 都必须等于本地壳；含该页时（回滚），两者都必须等于本地的那一页。`functions --origin` 采集线上 CSP 哈希时，除本地构建的页面外还读取六个 `<route>/index.html` 文件 URL（404 跳过），这样即使上一次 `sync` 在覆盖副本途中中断，某个副本仍停在更早的构建，它的内联脚本哈希也不会在下一次轮换中被丢掉（第三轮审查发现）。

## 备选方案

| 方案 | 结论 |
| --- | --- |
| 保留预渲染文档页，只用纯视图 `TopNavView`/`FooterBarView` 画出同样的导航 | 未采用。文档页不加载钱包运行时，右上角只能永远显示未连接的 Connect，已登录用户看到的状态是错的，与官方做法也不一致 |
| 只改 `/terms` 与 `/privacy` | 未采用。从条款页底栏点进 `/risk` 等页面又会切回独立导航，前后不一致 |
| 把 Cookie Policy 加进全局底栏 | 未采用。官方底栏没有这一项；实测 1001px 宽度下底栏原有 5 个链接已与居中的 ⌘K 按钮贴边（间距约 −0.4px），第 6 个链接会压住按钮约 80px |
| 把 Cookie 政策并入隐私政策正文，删除 `/cookies` | 未采用。这会实质改写法律文本，需要法律审阅；交叉引用已经能达到与官方相同的入口位置 |
| 移动抽屉也放 Terms / Privacy | 未采用。官方手机抽屉没有这两项 |
| 保留桶里的遗留文档页 | 未采用。导航虽然不会指向它们，但显式请求 `/terms/index.html` 仍会读到内容冻结的旧条款；两次发布后旧页的内联脚本哈希不再在 CSP 里，页面还会被拦截 |
| 删除遗留文档页 | 最初采用，后被替代。跨 ADR 0020 回滚时旧请求函数先于旧页面上线，`/terms` 会 404，CSP 哈希采集也会中断；用壳覆盖没有这个窗口 |

## 后果与边界

- **首屏**：直接打开这些页面时先是空白播报，等运行时、语言目录和字体就绪后才出现外壳和正文，与 Portfolio 相同；页面会加载 Privy，并请求 `/api/geo`。
- **SEO 与无脚本访问**：HTML 中不再有预渲染的法律正文和逐页 `<title>`/描述，爬虫和禁用脚本的访问只拿到壳。页面标题和描述在客户端由 `buildPageHead` 更新。
- **移动端**：移动页和其他仪表盘页一样没有页脚。抽屉里有 Docs 和 Support，法律页照官方不进抽屉（`mobile-nav-drawer.test.tsx` 断言如此）；原文档外壳在窄屏上的横向文档导航随之移除，法律页之间靠正文里的互相链接切换。
- **部署**：`sync` 仍不带 `--delete`，也不删除对象，只额外用壳覆盖六个指名的遗留文档页；发布顺序不变（先发布函数，再同步，再失效与 `verify`）。CSP 内联脚本哈希只需覆盖壳。
- **浏览器缓存**：已安装 v9 Service Worker 的浏览器，在新 SW 激活前的一次导航可能仍从 `documents-v9` 返回旧文档页；v10 激活时会删除它。

## 证据

- 代码：`apps/terminal/src/config/app-route-surface.ts`、`routes/__root.tsx`、`providers/root.tsx`、`components/legal/legal-doc-page.tsx`、`config/dashboard-frames.ts`、`routes/{docs,support,terms,privacy,risk,cookies}.tsx`、`vite.config.ts`、`lib/static-pages/static-pages.ts`、`lib/geo/geo-prefetch.ts`、`public/sw.js`、`components/trade/mobile/mobile-nav-drawer.tsx`、`legal/privacyPolicy.md`、`deploy/cloudfront/functions/terminal-request.js`、`deploy/cloudfront/deploy.mjs`（`RETIRED_PAGE_KEYS`、`buildRetiredPageCommands`、`collectServedScriptHashes` 读取六个遗留文件 URL、verify 检查 “legal pages match the build”）。
- 官方实测（2026-09-27，内置浏览器只读检查）：桌面 More 菜单只有 Docs 一个文档类入口；手机抽屉在更多类链接之后放 Docs 和 Support；官方站点上找不到任何 Cookie 链接，隐私政策里有一段 “Cookie Policy:”。
- 测试：`root-route-transition.test.tsx`（法律页直接进入挂载钱包与市场运行时，与交易页往返不重挂）、`legal-doc-page.test.tsx`、`app-route-surface.test.ts`、`spa-shell-config.test.ts`、`static-pages*.test.ts`、`sw-navigation-cache.test.ts`、`chart-asset-cache-policy.test.ts`、`root-provider-split.test.ts`、`geo-prefetch.test.ts`、`early-prefetch.test.ts`、`deploy/cloudfront/*.test.mjs`。
- 本次执行的验证与结果记录在[任务记录](../work-memory/sessions/2026-09-27-legal-pages-app-shell.md)。
