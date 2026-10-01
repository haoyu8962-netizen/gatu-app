<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-27-legal-pages-app-shell",
  "date": "2026-09-27",
  "title": "文档与法律页并入应用外壳，对齐官方条款页",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "docs-governance"],
  "summary": "按用户选择（改成应用页、6 页全改）删除文档路由表面与 DocumentChrome：/docs /support /terms /privacy /risk /cookies 改为仪表盘路由，桌面用 TopNav/FooterBar、移动用 MobileHeader；只预渲染 SPA 壳，Node 静态页、CloudFront 请求函数与 SW（v10）不再区分文档页，deploy verify 改查法律页返回壳；ADR 0020。Cookie Policy 未进全局底栏（官方也没有；1001px 下会压住 ⌘K 按钮约 80px）。补记：照官方做法把 Cookie 入口放进隐私政策第 4 节，手机抽屉加 Docs/Support，sync 删除遗留的 <route>/index.html，verify 要求 /terms/index.html 返回 404（PR #47 第二轮 Codex 审查后改为用壳覆盖六页、verify 逐页核对）。类型检查、Biome、CloudFront 测试 40 项、完整单测、生产构建及开发服务器浏览器检查的结果见正文；未发布，未做真机检查。",
  "thread": null,
  "baseCommit": "8b9950ce",
  "commits": ["2e6c5214", "5a136d71", "a141f856"],
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
- 开发服务器浏览器检查（Vite 3015，内置浏览器，页面由脚本读取 DOM，面板隐藏时无法截图）：1440 宽的 `/terms` 只有应用的 Primary navigation 和底栏 “Documentation and legal” 两组导航，一个 `<main>`，没有错误边界；375 宽的 `/privacy` 使用 MobileHeader，没有页脚，`scrollWidth` 375，标题 “Privacy Policy | Sairn”；从 `/trade/BTC` 点底栏 Terms 是客户端导航（没有新的 navigation entry），返回后回到交易页，订单簿正常。
- 未做：真机和 iOS Safari 检查、已安装 v9 Service Worker 的浏览器跨版本首次导航、CloudFront 线上发布与 `verify`、`csp-coverage.mjs` 浏览器套件、未连接钱包以外的登录状态检查。

## 补记：三项待决事项按官方做法落地

第一次提交 `2e6c5214` 后，用户要求“需要我决定的事情你可以调试下 app.hyperliquid.xyz/terms 看下它的实践，跟着规划推荐的实践方案”。2026-09-27 用内置浏览器只读检查官方站（只打开菜单和抽屉，没有改设置，也没有签名）：

- **Cookie**：官方条款页和底栏都没有任何 Cookie 链接，站内也没有单独的 Cookie 页；`/privacyPolicy` 正文里有一段 “Cookie Policy:”。→ 在隐私政策第 4 节末尾加一句，链到 `https://app.gatu.ai/cookies`，写法与已有的 Terms ↔ Privacy 绝对链接一致；隐私政策 Last Updated 改为 September 27, 2026（按 `legal/README.md` 的规则；这个日期不驱动重新同意，已用 `git grep` 核对）；`legal/README.md` 的文档表补上 cookies 行。底栏不变。
- **移动导航**：官方桌面 More 菜单只有 Docs 一个文档类入口；手机抽屉在更多类链接之后放 Docs、Support（都是外链），没有 Terms、Privacy。→ `MobileNavDrawer` 的 More 分组在 API Wallet 之后加 Docs（`/docs`）、Support（`/support`）；法律页照官方不进抽屉。原先断言抽屉里没有 Docs、Support 的测试是 `6678a949`（API 钱包功能）顺带加的，没有找到设计依据，已改为只断言没有 Terms / Privacy / Risk / Cookie Policy。
- **遗留文件**：用 curl 实测，官方 `/terms/index.html` 和不存在的 `/no-such-file.js` 都返回同一个 6,831 字节的 SPA 壳；Sairn 线上 `/terms/index.html` 目前返回 45,278 字节的预渲染条款页，`/no-such-page/index.html` 返回 404。→ `deploy.mjs` 新增 `RETIRED_PAGE_KEYS` 与 `buildRetiredPageCommands`：`sync` 上传完成后对六个 `<route>/index.html` 执行 `aws s3 rm`（本次构建仍包含的跳过，桶有版本控制）；`verify` 新增 “retired document pages answer 404”。IAM 策略已包含 `s3:DeleteObject`。

补记验证（同一 worktree，基线为 `2e6c5214` 加上本次未提交的改动）：`pnpm test:cloudfront` 41 项通过；`pnpm --filter @gatu/terminal typecheck` 通过；Biome 检查改动的 3 个代码文件通过；`mobile-nav-drawer`、`legal-policy-contract`、`terms-content`、`legal-doc-page`、`i18n-reactivity-contract`、`i18n-hot-switch`、`top-nav`、`footer-bar` 共 8 个文件、206 项通过；`pnpm --filter @gatu/website test` 4 项通过；`pnpm i18n:extract` 只给 Docs、Support 增加抽屉引用，缺失数不变。开发服务器上 375 宽的 `/privacy` 显示新链接（`target=_blank`，指向 `https://app.gatu.ai/cookies`）和新日期；抽屉 More 分组依次是 Statistics、API Wallet、Docs、Support，点 Support 后进入 `/support`，抽屉关闭，没有横向滚动。这次补记没有重跑完整单测和生产构建，删除命令也没有对真实的桶执行。

## 补记：Codex 对抗审查与修复

用户要求用 Codex 对 `8b9950ce..5a136d71` 再做一遍对抗审查（bug、不规范写法、UI）。命令：`codex exec -m gpt-6-astra -s read-only -c 'approval_policy="never"' -c 'model_reasoning_effort="medium"'`，只读，约 13.2 万 token，没有运行测试。报告 2 项 P2、2 项 P3，没有 P0/P1；逐条对照代码核实后全部成立：

- **P2 verify 与回滚矛盾**：`buildRetiredPageCommands` 会保留旧构建自带的 `terms/index.html`，而 `verify` 无条件要求它返回 404、`/terms` 返回壳，所以回滚到旧构建时校验必然失败。→ `verify` 改为按本地构建决定期望（检查名改为 “legal page navigation matches the build”），新增回滚场景测试。
- **P2 首帧缺懒加载片段**：法律页的 `FooterBar`、`GlobalModals` 是本页的懒加载实例，而 `bootDashboardRoute` 只等 TopNav；页面揭示时这两块可能还没加载，之后才补上，而且在此之前 ⌘K 监听不存在。原测试先等动态导入完成，恰好绕过了这个窗口。→ 新增 `preloadLegalDocPage()` 与 `lib/navigation/boot-legal-route.ts`（在 `TRADE_ROUTE_REVEAL_BUDGET_MS` 内等待；`settleWithinBudget` 从 `trade-route-boot.ts` 导出复用），6 个路由改用 `bootLegalRoute()`；新增首帧测试（做了变异检查：去掉预加载后该测试失败）和 `boot-legal-route.test.ts`（等待、超时揭示、失败不阻塞）。另外 9 个仪表盘页有同样的缺口，是原有写法，不在本次范围内，已另开后台任务建议（task_a8ccf726）。
- **P3 抽屉无按压反馈**：`getNavLinkClass` 只有 hover 样式，抽屉里所有条目都违反 `style-ui-guide.md` 的触摸反馈规则。→ 加上 `TOUCH_PRESS_CLASS`，测试断言每个条目都有。
- **P3 大小写路径下选中态失效**：路由不区分大小写，但抽屉用 `===` 比较路径。→ 先转小写、去掉尾斜杠再比较，测试覆盖 `/DOCS/`、`/Support`、`/Portfolio`。

修复后验证（基线 `5a136d71` 加上本次未提交的改动）：`pnpm --filter @gatu/terminal typecheck` 通过；Biome 检查改动的代码文件通过；`pnpm test:cloudfront` 42 项通过；`pnpm --filter @gatu/terminal test` 602 个文件通过、1 个跳过，6877 项通过、1 项跳过，零失败；`pnpm build`（Node v24.15.0）退出码 0，只预渲染 1 页，bundle 总计 3,116,284 gzip 字节（比基线少 38,423），交易页启动 1,547,574 gzip 字节，内联脚本哈希为 2 页 3 个。没有用 Node 22.15 复测精确字节数。

Codex 标为“无法确认”的：最终构建体积（它读到的 `.output` 是旧产物）、真实部署与 SW 跨版本、真机与阿拉伯语布局、历史验证结论是否属实。

## 补记：PR #47 与第二轮 Codex 审查

用户要求推送、向 `dev` 开 PR 并用 Codex 最新模型对抗审查。分支推送为 `claude/legal-pages-app-shell`，PR 为 https://github.com/zora4523-bot/gatu-app/pull/47。`~/.codex/models_cache.json` 中优先级最高的是 `gpt-6-astra`（codex-cli 0.154.0；npm 上最新为 0.157.1，没有升级）。审查范围 `8b9950ce..a141f856`，只读、medium，约 13.5 万 token。它无法通过代理读取 PR 描述。结论：2 项 P2、1 项 P3，上一轮 4 项修复中 2 项成立、2 项不完整。逐条核实后全部成立：

- **P2 跨版本回滚**：`functions` 先发布请求函数，再用 `--origin` 抓取线上页面计算 CSP 哈希。回滚到 ADR 0020 之前的构建时，旧请求函数把 `/terms` 改写到已经被 `aws s3 rm` 删除的 `/terms/index.html`，页面 404，哈希采集也会抛错中断。→ 废弃“删除”方案（上文补记与 `5a136d71`、`a141f856` 的描述保留为历史），改为 `sync` 用本次 `_shell.html` 覆盖六个遗留页（`aws s3 cp`，HTML 缓存策略）。
- **P2 verify 只看 Terms**：另外五页残留或回滚内容不对时检查不出来。→ 合并为一项检查 “legal pages match the build”，逐页请求 `/<route>` 和 `/<route>/index.html`，与本地的壳或本地页比对；测试覆盖部分回滚（Terms 和 Privacy 为旧页）、单页正文错误、单页 404。
- **P3 选中项没有按压反馈**：`--fill-hover` 与 `--fill-weak` 在两套主题里都是同一个值（styles.css 296/298、490/492 行）。→ 选中项改用 `TOUCH_PRESS_FADE_CLASS`，其余项仍用 `TOUCH_PRESS_CLASS`，测试同时断言两种情况。
- **覆盖缺口**（Codex 的变异推演）：一项预加载失败、另一项还在等待时，`Promise.all` 会提前揭示页面。→ 改为 `Promise.allSettled`，并补测试。
- 另外修正了 `deploy.mjs` 中 `FUNCTIONS_DIR =resolve` 缺空格的格式问题。这是第一轮修复时我的编辑引入的；Biome 不检查 `deploy/` 目录，所以当时没有发现。

修复后验证（基线 `a141f856` 加上本次未提交的改动）：`pnpm --filter @gatu/terminal typecheck` 退出码 0；Biome 检查改动的 4 个 TS 文件通过；`pnpm test:cloudfront` 42 项通过；`boot-legal-route`、`mobile-nav-drawer`、`legal-doc-page`、`touch-press-feedback-contract`、启动渲染组（`root-startup-fallback`、`root-route-transition`、`trade-terminal-page-boot`、`top-nav`、`dashboard-frame-view`）、i18n 两个契约测试、`sw-navigation-cache`，共 12 个文件、308 项通过。这轮没有重跑完整单测和生产构建（改动集中在 `deploy.mjs`、抽屉样式和 boot 的等待方式，都有直接测试覆盖），也没有对真实的桶执行覆盖命令。

## 补记：第三轮 Codex 复审

复审 `a141f856..ab8b7272`（gpt-6-astra，只读，medium，约 11.8 万 token）：上一轮 3 项和 `allSettled` 的修复都核验成立；新报 1 项 P2、1 项 P3，核实后成立：

- **P2 中断的 sync 之后再发布另一构建会丢哈希**：`collectServedScriptHashes` 只请求本地构建里有的页面。新构建没有独立页，所以只抓 `/trade/HYPE`。若上一次 `sync` 在覆盖副本途中中断，某个 `<route>/index.html` 仍是更早的构建，它的内联脚本哈希会在下一次轮换中被丢掉，而 CSP 是 enforce，直接访问这个文件时脚本会被拦截。Codex 在内存中调用 `prepareResponseFunction` 复现了这一点。→ 采集时额外读取六个遗留文件 URL（404 跳过，其他错误照旧报错），新增回归测试：旧副本的哈希进入轮换结果，503 仍会报错。
- **P3 ADR 当前描述过时**：仍写抽屉全部用 `TOUCH_PRESS_CLASS`，证据里还引用已删除的检查名。→ 已更正。

验证：`pnpm test:cloudfront` 43 项通过。

## 补记：合并 dev（PR #46）后改用共享仪表盘外壳

推送 `a8499cf4` 后 PR #47 显示与 `dev` 冲突。原因是本会话开出的后台任务 task_a8ccf726 已经作为 PR #46 合入 `dev`（`cdd0ee60`）。它新增了 `components/dashboard/dashboard-chrome.tsx`，提供共享的 `DashboardHeader`、`FooterBar`、`GlobalModals` 和 `preloadDashboardChrome()`，并让 `bootDashboardRoute()` 在预算内等待这些实例；它的任务记录 [2026-09-27-dashboard-route-chrome-preload](2026-09-27-dashboard-route-chrome-preload.md) 也写明法律页合入时要迁移过去。

合并 `origin/dev`：`CHANGELOG.md` 两条都保留；`dashboard-frame-view.test.tsx` 采用 dev 的共享页头断言，同时保留本分支对 `legal` 预设的文件映射；`INDEX.md` 取 dev 版本后重新生成。`LegalDocPage` 改用共享的 `DashboardHeader` / `FooterBar` / `GlobalModals`，6 个路由改回 `bootDashboardRoute()`；删除 `lib/navigation/boot-legal-route.ts`、`boot-legal-route.test.ts` 和 `preloadLegalDocPage()`（上文第一、二轮补记中对它们的描述保留为历史）。法律页首帧测试改为先调用 `preloadDashboardChrome()`，做过变异检查：去掉这一步后测试失败。

合并后验证（`a8499cf4` 合并 `cdd0ee60` 后的工作区）：`pnpm --filter @gatu/terminal typecheck` 退出码 0；Biome 检查改动的 9 个文件通过；`pnpm --filter @gatu/terminal test` 602 个文件通过、1 个跳过，6893 项通过、1 项跳过，零失败；`pnpm build`（Node v24.15.0）退出码 0，只预渲染 1 页，bundle 总计 3,106,960 gzip 字节（比基线少 47,747），交易页启动 1,544,154 gzip 字节，内联脚本哈希为 2 页 3 个。

## 补记：第四轮 Codex 复审（合并后版本）

用户要求对合并后的 `ee2ca281` 再复审一轮（gpt-6-astra，只读，medium，约 11 万 token）。结论：P0–P2 无发现；冲突解决核验通过（它在内存里按脚本逻辑重建 INDEX，116 条与文件逐字一致）；报了 2 项 P3 测试缺口，核实后成立并补上：

- `legal-doc-page.test.tsx`（法律页首帧、六个路由的 boot 断言）不在 CI 的 “Test route provider lifecycles” 步骤里。→ 加入 `.github/workflows/terminal-tests.yml`。`scripts/ci-workflows.test.mjs` 没有锁定这份清单，本地 6 项通过。
- `DASHBOARD_FRAMES.legal` 没有固定值断言，改宽正文或换背景测试都抓不到。→ `dashboard-frame-view.test.tsx` 的 “pins all preset classes” 补上 `legal`。

验证：按 CI 该步骤原样执行（`--maxWorkers=1`，10 个文件）140 项通过。

## 后续与替代关系

- ADR 0020 部分取代 ADR 0005/0006/0010 中与文档路由相关的决策；这些 ADR 的其余部分不变。
- 隐私政策多了一句交叉引用，法律实质内容没有变；按 `legal/README.md`，数据处理类措辞的变动需要法律审阅，这一句只是导航，发布前可以请法务确认。
- 发布时按现有顺序先 `deploy.mjs functions`（新的请求函数会把 6 个路径改写到壳），再 `sync`、失效、`verify`；发布后再跑 `csp-coverage.mjs`。
