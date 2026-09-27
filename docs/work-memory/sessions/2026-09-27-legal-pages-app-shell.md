<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-27-legal-pages-app-shell",
  "date": "2026-09-27",
  "title": "文档与法律页并入应用外壳，对齐官方条款页",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "docs-governance"],
  "summary": "按用户选择（改成应用页、6 页全改）删除文档路由表面与 DocumentChrome：/docs /support /terms /privacy /risk /cookies 改为仪表盘路由，桌面用 TopNav/FooterBar、移动用 MobileHeader；只预渲染 SPA 壳，Node 静态页、CloudFront 请求函数与 SW（v10）不再区分文档页，deploy verify 改查法律页返回壳；ADR 0020。Cookie Policy 未进全局底栏（1001px 下会压住 ⌘K 按钮约 80px），现只能从法律接受弹窗和 URL 进入。类型检查、Biome、CloudFront 测试 40 项、完整单测、生产构建及开发服务器浏览器检查的结果见正文；未发布，未做真机检查。",
  "thread": null,
  "baseCommit": "8b9950ce",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0020-legal-pages-in-app-shell.md" },
    { "path": "apps/terminal/src/components/legal/legal-doc-page.tsx" },
    { "path": "apps/terminal/src/config/app-route-surface.ts" },
    { "path": "apps/terminal/src/routes/__root.tsx" },
    { "path": "apps/terminal/src/providers/root.tsx" },
    { "path": "apps/terminal/public/sw.js" },
    { "path": "deploy/cloudfront/functions/terminal-request.js" },
    { "path": "deploy/cloudfront/deploy.mjs" },
    { "path": "apps/terminal/src/lib/tests/root-route-transition.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/legal-doc-page.test.tsx" },
    { "url": "https://app.hyperliquid.xyz/terms" }
  ],
  "supersedes": []
}
-->
# 文档与法律页并入应用外壳，对齐官方条款页

## 背景与范围

同步记录，worktree `worktree-06`（分支 `worktree-06`，基线 `origin/dev` 的 `8b9950ce`）。用户问电脑端打开 `localhost:3015/privacy` 和 `/terms` 为什么有单独的导航栏，要求对齐 `https://app.hyperliquid.xyz/terms` 的做法。

先查清了现状：6 个文档路由由 `DocumentChrome` 渲染自己的顶栏（5 个文档链接、主题、语言）和页脚（Cookie Policy、版本号），根路由跳过钱包运行时，构建单独预渲染，CloudFront 函数、SW、Node 静态页各有一份路由表。这是 ADR 0005/0006/0010 的有意设计。两个方向都要付出代价，所以向用户提问：用户选了“改成应用页”，范围选了“全部 6 个文档页”。

## 结论与依据

- **官方做法**（2026-09-27 用内置浏览器实测，1440×900 与 375×812）：条款页用与交易页相同的顶栏（Trade、Portfolio、Earn…、Deposit、账户）和底栏（在线状态，Docs / Support / Terms / Privacy Policy，其中 Terms 指向 `/terms`、Privacy 指向 `/privacyPolicy`），移动端用应用的移动顶栏，没有单独的文档导航。官方页面上显示的是用户自己的登录账户，这里不记录账户信息。
- **实现**：删除 `config/document-routes.ts`、`DocumentChrome`、`DocumentOverlays`、`isDocumentRoutePath`、`shouldPrefetchGeo`、`getPresentedRoutePathname`；`getAppRouteSurface` 只剩 terminal/dashboard。`LegalDocPage` 改用 `DashboardFrameView` + `DASHBOARD_FRAMES.legal` + TopNav/FooterBar/MobileHeader/TestnetBanner/GlobalModals；6 个路由改为 `ssr: false` + `bootDashboardRoute()`。`vite.config.ts` 去掉 `pages`；`static-pages.ts`、`terminal-request.js` 都改为只回答壳；SW 升 v10，删除 `documents-*`；`deploy.mjs verify` 的“预渲染文档路由”检查改为“`/terms` 返回与本地构建一致的壳”；`csp-coverage.mjs` 列表改名为 `LEGAL_ROUTES`。
- **Cookie Policy**：原来只在文档页脚有常驻入口。试过加进 `FOOTER_LINKS`，在 1001px 宽度下测得右侧链接组左缘与居中 ⌘K 按钮右缘的间距为 −80px（原 5 个链接约 −0.4px，已经贴边），所以撤回。它仍可从法律接受弹窗和 `/cookies` 进入，是否需要常驻入口留给用户决定。
- **文档**：新增 ADR 0020；ADR 0005/0006/0010 开头追加更正说明；更新 ADR 索引、AGENTS.md、agent.md、`.claude/rules/startup-rendering.md`、`.claude/rules/ssr.md`、`apps/terminal/README.md`、`docs/runtime-guardrails.md`（导航期间的 provider 生命周期）、`deploy/cloudfront/README.md`（现状描述并追加 2026-09-27 更正）、`docs/README.md`，以及启动性能计划和 CSP 计划中的更正说明；CHANGELOG 已同步。

## 验证与限制

以下都是本次在 `worktree-06` 的工作区（基线 `8b9950ce` 加上本次未提交的改动）上实际运行的结果：

- `pnpm --filter @gatu/terminal typecheck`：通过。
- `pnpm exec biome check <改动的 30 个代码文件>`：先报 2 个格式问题，`--write` 修正后通过（传入的两个已删除文件报 IO 诊断，属于传参问题）。
- `pnpm test:cloudfront`：40 项全部通过。
- 定向单测：`root-route-transition`（30 项）、`legal-doc-page`（10 项）、`sw-navigation-cache`（29 项）及其他改动的测试文件全部通过。
- `pnpm --filter @gatu/terminal test`（改完上面这些之后的第一轮）：602 个文件，4 个失败、597 个通过、1 个跳过；6869 项里 4 项失败。其中 3 项是本次遗漏的测试：`dashboard-frame-view`（遍历预设键时找不到 `legal` 对应的页面文件）、`legal-policy-contract`（断言 `/cookies` 为 `ssr: true`）、`root-provider-runtime`（文档路由绕过运行时门），已修正。第 4 项 `chart-build-assets` 在并行负载下 5 秒超时，单独运行 17 项通过，1.7 秒，与本次改动无关。修正后这 4 个文件单独重跑，43 项通过；修正后没有再跑整套。
- `pnpm i18n:extract`：只去掉已删除文件的引用，并把不再使用的 “Cookie Policy” 标为废弃；缺失翻译数没有变化（ar/es/fr/hi 各 56 条，zh 3 条，是原有的）。
- `pnpm build`（Node v24.15.0，默认配对开关关闭）：退出码 0。预渲染只生成 `/trade`（即 `_shell.html`），`.output/public` 下只有 `_shell.html` 与 `404.html`，没有 `<route>/index.html`；chunk 环检查、bundle 预算通过（总计 3,116,765 gzip 字节，比基线少 37,942；交易页启动 1,547,642 gzip 字节，少 33,574）；壳内预加载 112 项；内联脚本哈希为 2 页 3 个。项目记录要求用 Node 22.15 测量精确字节数，本次没有用 22.15 复测。
- 开发服务器浏览器检查（Vite 3015，内置浏览器，页面由脚本读取 DOM，面板隐藏时无法截图）：1440 宽的 `/terms` 只有应用的 Primary navigation 和底栏 “Documentation and legal” 两组导航，一个 `<main>`，没有错误边界；375 宽的 `/privacy` 使用 MobileHeader，没有页脚，`scrollWidth` 375，标题 “Privacy Policy | GATU”；从 `/trade/BTC` 点底栏 Terms 是客户端导航（没有新的 navigation entry），返回后回到交易页，订单簿正常。
- 未做：真机和 iOS Safari 检查、已安装 v9 Service Worker 的浏览器跨版本首次导航、CloudFront 线上发布与 `verify`、`csp-coverage.mjs` 浏览器套件、未连接钱包以外的登录状态检查。

## 后续与替代关系

- ADR 0020 部分取代 ADR 0005/0006/0010 中与文档路由相关的决策；这些 ADR 的其余部分不变。
- 待用户决定：Cookie Policy 是否需要常驻入口（全局底栏在 1001px 下放不下）；移动端法律页之间没有互相链接的导航；S3 上历史的 `<route>/index.html` 是否清理。
- 发布时按现有顺序先 `deploy.mjs functions`（新的请求函数会把 6 个路径改写到壳），再 `sync`、失效、`verify`；发布后再跑 `csp-coverage.mjs`。
