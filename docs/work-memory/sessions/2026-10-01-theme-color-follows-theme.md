<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-theme-color-follows-theme",
  "date": "2026-10-01",
  "title": "浏览器主题色跟随应用主题（浅色 #FFFFFF）",
  "kind": "task",
  "status": "verified",
  "topics": ["brand-identity", "static-hosting"],
  "summary": "<meta name=\"theme-color\"> 此前（913dfacf 起）两种主题都固定 #0F1A1F，浅色主题下 Safari 15+ 与 Android Chrome 会把工具栏染成深青色。用户选定浅色用 #FFFFFF（浅色 --bg-base、页头底色）。新增 brand.json pwa.lightThemeColor 与 lib/theme-color.ts：启动引导脚本同一次读取写主题类和 meta，applyThemeClass 在早退前同步所有 theme-color 标签，根路由 head() 按 <html> 主题类取色——因为 TanStack 水合前在浏览器重跑 head()，React 19.2 只按 content 认领已有 <meta>，值不同会追加一个过期的重复标签。manifest 保持深色。单测、两组回归、类型检查与 CI 式生产构建通过；生产构建无头 Chromium 实测每一步只有一个标签且颜色正确；未做真机工具栏取色验收。",
  "thread": null,
  "baseCommit": "2baa44e2",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/lib/theme-color.ts" },
    { "path": "apps/terminal/src/routes/__root.tsx" },
    { "path": "apps/terminal/src/stores/use-global-settings-store.ts" },
    { "path": "apps/terminal/src/lib/tests/theme-bootstrap.test.ts" },
    { "path": "apps/terminal/src/lib/tests/theme-document-sync.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/pwa-manifest.test.ts" },
    { "path": "brand/brand.json" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/brand-assets.md" },
    { "path": ".claude/rules/startup-rendering.md" }
  ],
  "supersedes": []
}
-->
# 浏览器主题色跟随应用主题（浅色 #FFFFFF）

## 背景与范围

同步记录。用户指出 `<meta name="theme-color">` 自 `913dfacf` 起两种主题都固定为 `#0F1A1F`，浅色主题下 Safari 15+ 与 Android Chrome 会把工具栏或状态栏染成深青色；这是既有行为，不是回归。主题在应用设置里选择而不跟随系统，`media` 属性表达不了，需要在应用主题类时同步更新 meta，并让预渲染壳的主题引导脚本在首帧前写同一个颜色。

基线：本工作树原在 `main`（`0b30fdfb`），没有 `brand/brand.json`；该文件只在主检出所在的 `claude/from-dev-1001`（Sairn 改名工作，领先 `origin/dev` 30 个提交、未推送）上。本工作树分支没有自有提交且干净，所以先对齐到 `claude/from-dev-1001` 的 `2baa44e2` 再实施，主检出未改动。

文档（`docs/brand-assets.md`、`docs/runtime-guardrails.md` §8、`.claude/rules/startup-rendering.md`）只规定了深色 `#0F1A1F`，浅色颜色由用户在对话中选定：`#FFFFFF`（备选为 `#F1F3F6` 网格底色、`#F5F6FA` 凹陷底色）。

## 结论与依据

- 颜色来源：`brand/brand.json` 的 `pwa.themeColor`（深色，manifest 与深色 meta 共用）与新增的 `pwa.lightThemeColor`（`#FFFFFF`），经 `config/brand.ts` 进入 `lib/theme-color.ts` 的 `THEME_COLORS`。两值分别等于深色、浅色块的 `--bg-base`；页头与移动页头用 `bg-surface`，浅色下也是 `#ffffff`。manifest 只能有一个 `theme_color`，保持深色。
- 三处写入共用 `lib/theme-color.ts`：
  - 启动引导脚本（`THEME_BOOTSTRAP_SCRIPT`，从 `__root.tsx` 移来）在同一次读取 `global-settings-v2` 后写主题类和所有 theme-color 标签；
  - `applyThemeClass` 在每次主题切换和每次 `<html>` class 变动时调用 `applyThemeColor`，放在早退判断之前，因为重新渲染的 head 可能带回旧值而类名并未变化；
  - 根路由 `head()` 用 `getDocumentThemeColor()` 按 `<html>` 主题类取色。
- 第三点的依据（读源码核实）：`@tanstack/router-core` 1.171.15 的 `ssr-client.js` 在水合时对每个匹配重新执行 `route.options.head()`；`react-dom` 19.2.0 对可提升的 `<meta>` 用 `getHydratableHoistableCache("meta", "content", …)` 按 `content` 匹配已有节点，匹配不到就新建一个追加到 `<head>` 末尾。若 `head()` 仍固定返回深色，浅色用户在水合后会多出一个深色的重复标签。
- 未采用：只在引导脚本和 store 里改 meta 而 `head()` 不变（会产生上述重复标签，且水合提交晚于 store 的模块初始化同步）；让 React 不渲染 theme-color、由脚本自建标签（预渲染 HTML 不再有静态主题色，客户端整树重渲染时 `clearContainerSparingly` 会删掉非提升节点）；在壳里放两个标签（依赖文档顺序，难以维护）。
- CSP：脚本内容改变后哈希随之改变，`scripts/collect-inline-script-hashes.mjs` 在构建末尾从产物现算，仓库里没有需要手改的哈希。

## 验证与限制

工作区版本：基线 `2baa44e2` 加本次改动，2026-10-01。

- 变异验证：把 `applyThemeColor` 挪到早退之后，`theme-document-sync` 的「类名已正确时也同步过期标签」一项失败；去掉引导脚本里的 meta 写入，`theme-bootstrap` 6 项失败；共 7 项失败，还原后 20 项全部通过。
- `pnpm exec biome check`（改动的 10 个 TS/TSX 文件）通过；`pnpm --filter @sairn/terminal typecheck` 通过；`pnpm brand:check` 通过。
- 定向：`theme-bootstrap`、`theme-document-sync`、`seo`、`pwa-manifest`、`root-provider-split`、`global-settings-store` 6 文件 65 项通过。
- AGENTS.md Startup rendering 组（含新增的两个文件）10 文件 184 项通过；Trading terminal visual contract 组 6 文件 120 项通过；另跑根路由、主题与品牌配置相关的 10 个文件 66 项通过。未跑全量 `pnpm --filter @sairn/terminal test`。
- 生产构建（Node 22.15.0、`NODE_ENV=production`、无 `.env`，与 CI 一致）通过 chunk 环、包体预算、壳预加载与内联脚本哈希收集（`_shell.html` 3 个哈希）。
- 运行时实测（无头 Chromium，脚本读 DOM，不是真人查看；为让客户端运行时启动，临时只写入公开的 `VITE_PRIVY_APP_ID` 重建，验证后删除）：壳里只有一个 `<meta name="theme-color" content="#0F1A1F"/>` 且位于引导脚本之前，脚本文本未被转义；浅色与深色各一轮，在 DOMContentLoaded、水合揭示后、页头切换、客户端导航到 `/earn`、再次切换、刷新后，`<html>` 类与唯一一个 theme-color 标签的颜色都一致。控制台错误只有 `/api/geo` 的 503（未提供服务端 IPdata 密钥，按设计失败放行）。
- 未覆盖：真实 Safari / Android Chrome 的工具栏取色没有在真机上看过；客户端整树重渲染（水合失败回退）路径只有单测覆盖。

## 后续与替代关系

- 需要时在 iOS Safari 与 Android Chrome 上切换浅色主题，确认工具栏颜色。
- 本改动建在未推送的 `claude/from-dev-1001` 之上，进 `dev` 时要和该分支一起或在它之后合入。
- 没有被替代的记录。
