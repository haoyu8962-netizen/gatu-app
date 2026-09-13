<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-13-spa-shell-spike",
  "date": "2026-09-13",
  "title": "SPA 壳：在分支上跑通静态托管构建",
  "kind": "task",
  "status": "recorded",
  "topics": ["static-hosting"],
  "summary": "TanStack Start SPA 模式在 claude/spa-mode 分支构建通过并本地静态托管验证；服务端点、CDN 头与部署脚本未迁移，静态托管下 geo fail closed。",
  "thread": null,
  "baseCommit": "2c44be20",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0005-spa-static-shell.md" },
    { "path": "apps/terminal/vite.config.ts" },
    { "path": "scripts/serve-spa-static.mjs" }
  ],
  "supersedes": []
}
-->
# SPA 壳：在分支上跑通静态托管构建

## 背景与范围

用户在架构对比后问"一定要 SSR 吗，能否像官方站那样"，随后要求"在分支上把 SPA 模式跑通"。本记录为同步记录。实现与本记录在同一提交内，提交哈希以分支 `claude/spa-mode` 的 Git 历史为准。

范围：启用 TanStack Start SPA 模式产出 `_shell.html` 与静态文档页，提供一个按 CDN 语义托管 `.output/public` 的本地脚本，并用生产构建与浏览器验证。不迁移服务端点、不改部署脚本、不改业务代码。

执行环境：共享工作区 `/Users/zhixing/我的项目/gatu` 在任务中途被另一会话切到 `codex/across-deposit-addresses` 并加入未提交的 Across 改动（缺失 `deposit/across-deposit-modal` 等模块），导致 typecheck 与 `pnpm build` 失败。因此把本任务改动撤出共享工作区，在 `.claude/worktrees/spa-mode` 独立 worktree（`claude/spa-mode`，基于 `2c44be20`）中执行；`node_modules` 按条目软链回主检出，`@gatu/*` 指回 worktree 自身的 `packages/`，`node_modules/.cache` 与 `.nitro` 为 worktree 独立目录。`packages/*/node_modules` 整目录软链会让 TypeScript 找不到 `wagmi`，改为逐条目软链后通过。

## 结论与依据

- `apps/terminal/vite.config.ts` 新增 `createTanstackStartOptions()`：`spa.enabled`、`maskPath = "/trade"`、`outputPath = "/_shell"`；`pages` 为 `DOCUMENT_ROUTE_PATHS`（新文件 `src/config/document-routes.ts`，`ClientRuntimeProvider` 改为引用同一常量）。`maskPath` 不能是 `/`：根路由 `ssr: true` 且 `beforeLoad` 抛重定向。
- 新增 `scripts/serve-spa-static.mjs` 与 `serve:spa` 脚本：文件优先、应用路由回壳、`/_serverFn/*`、`/api/*`、`/build-meta.json`、`/client-error-report`、`/mobile-agent-sync-ticket` 返回 JSON 404、`/assets/*` immutable。无 Accept 头或 `*/*` 的请求按导航处理（Privy 的 COOP 检查会对当前 URL 发 HEAD，首版按非导航返回 404 触发一条控制台错误，已修正）。
- 决策与备选方案记录在 [ADR 0005](../../adr/0005-spa-static-shell.md)；`docs/adr/README.md`、`docs/README.md`、`apps/terminal/README.md`、`CHANGELOG.md` 同步更新。
- 观察：静态托管下唯一的服务端请求是 `getGeo` 的 `/_serverFn/*`，404 后按契约 fail closed，浏览与行情不受影响。文档页直接使用预渲染 HTML 且不加载 Privy。

## 验证与限制

| 检查 | 结果 |
| --- | --- |
| `GATU_RELEASE_ID=spa-mode-spike pnpm build`（worktree） | 通过，11 分 15 秒；预渲染 `/trade`（写为 `_shell.html`，12,677 B）与 6 个文档路由；预算通过，客户端 gzip 总量 3,058,878 B（比基线少 95,829 B），桌面运行时启动 +4,783 B |
| `pnpm --filter @gatu/terminal typecheck`（worktree） | 通过 |
| `vitest run src/lib/tests/spa-shell-config.test.ts src/lib/tests/vite-manual-chunks.test.ts` | 16 用例通过 |
| `node --test scripts/serve-spa-static.test.mjs` | 6 用例通过 |
| `curl` 探针（`serve:spa`，127.0.0.1:3030） | `/trade/BTC`、`/portfolio`、`/` 返回与 `_shell.html` 逐字节相同的 HTML；`/docs`、`/docs/` 返回预渲染页；server-only 路径 JSON 404；`/assets/*` `immutable`；缺失资源 404 |
| 应用内浏览器 1024×768 | `/trade/BTC` 渲染 7 个桌面面板并显示实时价格；`/` 客户端跳转到 `/trade/BTC?scope=all`；`/docs` 显示预渲染文档且未加载 Privy |
| 对照 Nitro 产物（127.0.0.1:3031） | 表现一致 |

限制：应用内浏览器面板隐藏（`visibilityState === "hidden"`），订阅按契约暂停缓冲，两种托管方式下订单簿都停留在等待态，属验证环境伪影；应用内浏览器对 Nitro 与静态版本都无法注册 Service Worker（"An unknown error occurred when fetching the script"），同属环境限制，`sw.js` 在两种服务下均以 `text/javascript` 200 返回；`pnpm build` 在共享工作区的失败是另一会话改动所致，未在本记录中作为证据。未做真实 CDN 部署、Privy 登录、签名、下单、移动布局、非英文壳与 Lighthouse/INP 采样。全量 Vitest 在任务开始前的干净 HEAD 上已有 10 文件 32 用例失败（源码文本正则契约测试与过期 mock），与本任务无关，本任务未复跑全量。

## 后续与替代关系

- 服务端点迁移（边缘函数保留 IPdata 与代理判定、错误上报、leaderboard 缓存代理、`build-meta.json` 构建期静态化）与 CDN 安全头/`preconnect` 重建，是静态托管上线的前置条件。
- 壳 head 目前带 `/trade` 的标题与 `canonical`，需要中性化或在 CDN 层禁止缓存壳。
- 配对票据在多实例前迁到共享 CAS+TTL 存储，按部署手册既有要求执行。
- 下一次接手先看 `docs/adr/0005-spa-static-shell.md`、`apps/terminal/vite.config.ts`、`scripts/serve-spa-static.mjs`。
