# ADR 0005：交易终端以预渲染 SPA 壳交付，Nitro 服务端退为可选

状态：拟议；分支 `claude/spa-mode` 已完成生产构建与本地静态托管验证，尚未部署，服务端点尚未迁移。建立日期：2026-09-13。验证证据见文末，工作记录见 [SPA 壳验证记录](../work-memory/sessions/2026-09-13-spa-shell-spike.md)。

## 背景与约束

终端的 22 个应用路由已全部声明 `ssr: false`，服务端对它们只渲染 `AppShellSkeleton`、head 与主题脚本；只有 6 个文档路由（`/docs`、`/support`、`/terms`、`/privacy`、`/risk`、`/cookies`）真正服务端渲染。为此仍需一台常驻 Node 进程（Nitro `node-server` 产物、EC2 + Caddy + systemd，见 [部署手册](../../deploy/README.md)），以及围绕 hydration 的 [SSR 规则](../../.claude/rules/ssr.md)、`ClientRuntimeGate` 和 [Provider 生命周期规则](../runtime-guardrails.md#provider-lifetime-during-navigation)。

Nitro 目前承担的服务端职责：

| 职责 | 现状 |
| --- | --- |
| `getGeo` / `getReferralActionGeo` | Server Function，服务端持有 `IPDATA_API_KEY`，按客户端 IP 查询并缓存 10 分钟 |
| `POST /client-error-report` | 限流后写日志 |
| `GET /api/leaderboard` | 对 stats-data 的缓存代理（5 分钟新鲜、stale-if-error、体积上限） |
| `GET /build-meta.json` | 运行时拼装构建身份 |
| `POST /mobile-agent-sync-ticket` | 默认 fail-closed 关闭；启用时依赖单进程内存做一次性票据原子判定 |
| 安全头、`no-store`、按 host 的 API `preconnect` | Nitro `routeRules` 与 Caddy |

[官方站首次加载调研](../architecture/hyperliquid-first-load-investigation.md)显示 Hyperliquid 官方终端是空 `#root` 的纯静态 SPA（S3 + CloudFront），代价是弱网下长时间空白。本决策要保留 gatu 的静态骨架壳，同时去掉对常驻服务端的依赖。

## 目标与决策

目标：客户端产物可由对象存储 + CDN 直接托管；首屏仍是同一份骨架壳（含 head、主题引导脚本、样式与 modulepreload）；文档路由输出真实 HTML；签名、订阅、下单等业务代码零改动。

决策：

1. 启用 TanStack Start SPA 模式（`apps/terminal/vite.config.ts` 的 `createTanstackStartOptions()`）：`spa.enabled = true`，壳在 `maskPath = "/trade"` 处预渲染为 `/_shell.html`；`pages` 只列出 `DOCUMENT_ROUTE_PATHS`（`src/config/document-routes.ts`，与 `ClientRuntimeProvider` 共用同一来源）并逐页预渲染；`autoStaticPathsDiscovery`、`crawlLinks` 关闭，`failOnError` 开启。
2. `maskPath` 不能用默认的 `/`：根路由 `ssr: true` 且在 `beforeLoad` 抛服务端重定向，壳预渲染会跟随跳转。`/trade` 的匹配路由全部 `ssr: false`，壳渲染时只保留根路由，`ClientRuntimeGate` 在服务端固定输出终端骨架。
3. 新增 `scripts/serve-spa-static.mjs`（`pnpm --filter @gatu/terminal serve:spa`）按 CDN 语义托管 `.output/public`：已存在文件优先，应用路由回写 `_shell.html`，`/_serverFn/*`、`/api/*`、`/build-meta.json`、`/client-error-report`、`/mobile-agent-sync-ticket` 返回 JSON 404 而不是壳，`/assets/*` 使用 immutable 缓存。`scripts/serve-spa-static.test.mjs` 钉住这些规则。
4. 首期保留 Nitro 产物与 `pnpm serve`：同一次 `pnpm build` 同时产出可 SSR 的服务端与可静态托管的 `public/`。服务端点迁移、CDN 头与部署脚本是后续 ADR/任务，不在本决策内宣称完成。

## 备选方案与取舍

| 方案 | 判断 |
| --- | --- |
| 维持 SSR + Nitro | 现状；为骨架壳支付常驻进程、hydration 规则和单进程状态的代价，无法水平扩展 |
| 复制官方站的空 `#root` | 弱网十几秒空白、无可访问加载状态；预渲染壳以同样的托管形态保留骨架 |
| 用 Nitro `static` preset 自行 prerender | 与 TanStack Start 的壳/manifest 机制重复，且仍要处理 `ssr:false` 路由；SPA 模式是框架内置能力 |
| 预渲染每个市场路由 | 市场数以千计且内容实时，静态 HTML 没有价值；交易路由本就 `noIndex` |
| `maskPath` 用 `/` | 根路由重定向导致壳预渲染依赖跳转跟随，且壳会带上跳转目标的 head |

## 后果与边界

收益：托管形态可以与 `apps/website` 一样是 S3 + CloudFront；没有进程可挂、天然多实例；`ClientRuntimeGate` 的服务端分支、以 presented matches 判定 Provider 边界的规则、服务端语言与浏览器持久化语言的差异都不再是必须维护的边界。首屏 HTML 与现有 SSR 壳是同一份骨架，不引入官方站式空白。

尚未完成、不得视为可发布：

- 四类服务端点仍在 Nitro 上。静态托管下 `getGeo` 请求 `/_serverFn/*` 得到 404，`useGeoRestriction` 按契约 fail closed：浏览与行情正常，交易与资金动作被禁用。迁移方案（边缘函数保留 IPdata 与代理判定、错误上报、leaderboard 缓存代理、`build-meta.json` 构建期静态化）另立任务。
- 安全头、`no-store`、按 host 的 `preconnect` 需要在 CDN 层重建；`serve-spa-static.mjs` 只模拟回写与缓存，不下发 CSP。
- 壳的 head 来自 `/trade` 掩码路由（标题、描述、`canonical=/trade`），客户端 hydration 后由路由 head 覆盖。所有应用路径共用这份静态 head，若需要更中性的壳 head，应新增专用掩码路由或在 CDN 层禁止缓存壳。
- 配对票据在多实例前必须迁到共享 CAS+TTL 存储，与 [部署手册](../../deploy/README.md) 的既有要求一致；本决策不改变该门槛。
- `deploy/` 脚本、健康检查与 CI 仍按 Nitro 部署，不包含静态托管流程。
- 壳只有默认英文与 LTR；持久化非英文语言仍由客户端热切换处理，与现状一致。

## 验证证据（2026-09-13）

基线：`claude/spa-mode` 分支，基于 `2c44be20`，在独立 worktree 中执行（共享工作区当时含另一会话未提交的 Across 改动，会导致 typecheck 与构建失败，因此不能作为本决策的证据环境）。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 生产构建 | `GATU_RELEASE_ID=spa-mode-spike pnpm build` | 通过，11 分 15 秒；预渲染 7 页（`/_shell` + 6 个文档路由）；`_shell.html` 12,677 B；文档页 15,765–43,864 B |
| 包预算 | 构建内 `check-client-bundle-budget.mjs` | 通过；客户端 gzip 总量 3,058,878 B（比基线少 95,829 B）；桌面运行时启动 +4,783 B，在 10,000 B 容差内 |
| 类型检查 | `pnpm --filter @gatu/terminal typecheck` | 通过 |
| 配置契约 | `vitest run src/lib/tests/spa-shell-config.test.ts src/lib/tests/vite-manual-chunks.test.ts` | 2 文件 16 用例通过 |
| 静态服务规则 | `node --test scripts/serve-spa-static.test.mjs` | 6 用例通过 |
| 静态托管探针 | `serve:spa` 于 `127.0.0.1:3030`，`curl` | `/trade/BTC`、`/portfolio`、`/` 均返回 `_shell.html`（逐字节相同）；`/docs` 返回预渲染 HTML；`/_serverFn/abc`、`/api/leaderboard`、`/build-meta.json`、`/client-error-report` 返回 JSON 404；`/assets/*` 带 `immutable`；缺失资源 404 |
| 浏览器（应用内浏览器，1024×768） | 打开 `/trade/BTC` | 从壳启动后渲染 7 个桌面网格面板，标题变为实时价格，行情来自 `api.hyperliquid.xyz`；唯一的服务端请求是 `getGeo` 的 `/_serverFn/*`，返回 404 |
| 浏览器 | 打开 `/` | 客户端跳转到 `/trade/BTC?scope=all` 并挂载工作区 |
| 浏览器 | 打开 `/docs` | 直接使用预渲染 HTML，`h1` 为 "gatu Documentation"，未加载 Privy |
| 对照 | 同一 worktree 的 Nitro 产物于 `127.0.0.1:3031` | 与静态版本表现一致 |

已知的验证局限：应用内浏览器面板处于隐藏状态（`document.visibilityState === "hidden"`），订阅按契约暂停缓冲，订单簿在两种托管方式下都停留在等待态，这是验证环境伪影而不是 SPA 模式差异；同一浏览器对 Nitro 与静态版本都无法注册 Service Worker，也属环境限制；未做真实 CDN 部署、Privy 登录、签名、下单、移动布局、非英文语言壳与 Lighthouse/INP 采样。
