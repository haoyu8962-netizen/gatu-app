# ADR 0005：交易终端以预渲染 SPA 壳交付，Nitro 服务端退为可选

状态：已在分支 `claude/spa-mode` 实现并本地验证，尚未部署。运行时服务端渲染已关闭（决策 9），服务端点已改为可移植的 `/api/*` 处理器（决策 5–7）；把 `public/` 搬到 CDN 与边缘运行时挂载仍是后续任务。建立日期：2026-09-13。验证证据见文末，工作记录见 [SPA 壳验证记录](../work-memory/sessions/2026-09-13-spa-shell-spike.md)。

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
4. 首期保留 Nitro 产物与 `pnpm serve`：同一次 `pnpm build` 同时产出可 SSR 的服务端与可静态托管的 `public/`。边缘运行时挂载、CDN 头与部署脚本是后续任务，不在本决策内宣称完成。
5. 客户端不再依赖 TanStack Server Function 传输：所有服务端点统一到 `src/config/api-paths.ts` 声明的同源 `/api/*` 路径。`getGeo` 改为 `GET /api/geo`，`getReferralActionGeo` 改为 `POST /api/referral-geo`（同源校验复用错误上报的 `isSameOriginRequest`），错误上报改为 `POST /api/client-error-report`；客户端包装函数保持原名与签名，响应经 zod 校验，非 2xx 或格式错误照旧抛错、fail closed。
6. 处理器本身与宿主分离：`src/lib/geo/geo-api.ts` 的 `createGeoApiHandlers(environment)` 只用 Web 标准 `Request`/`Response`/`fetch`，宿主注入 `development`、`ipdataApiKey()` 与 `resolveClientIp(request)`；`src/lib/geo/geo-api-server.ts` 是 Nitro 适配器（`getRequestIP({ xForwardedFor: true })`、`process.env.IPDATA_API_KEY`），Worker/Lambda 适配器只需换这三项。交易 geo 按 IP 缓存 10 分钟并设上限；推荐/质押 geo 每次新鲜查询、租约 60 秒，与原语义一致。
7. `/build-meta.json` 由 `src/config/build-meta.ts` 的 `createBuildMeta()` 统一生成：Nitro 路由在运行时返回，`vite.config.ts` 的 `createBuildMetaPlugin` 在客户端构建期把同一份 JSON 写成静态文件，配对标志来自同一 `VITE_*` 环境（`loadEnv`）。`src/config/mobile-pairing-flags.ts` 承载无环境访问的纯解析器，供配置与运行时共用。
8. `serve-spa-static.mjs` 支持 `--api <origin>`（或 `SPA_API_ORIGIN`）：server-only 路径原样代理（保留 `Host`/`Origin`），用于在静态文件上端到端验证；不传则仍返回 JSON 404。
9. 运行时彻底不做服务端渲染：`src/start.ts` 注册 `staticPagesRequestMiddleware`（`src/lib/static-pages/`），生产环境下 Node 进程在路由器之前用预渲染产物回答导航：文档路由返回各自的 `index.html`，其余应用路径返回 `_shell.html`，`HEAD` 只回头部；文件形态的路径不返回 HTML（404），`/_serverFn/*` 返回 404。服务端路径不再落到页面渲染：`GET /api/geo`、`GET /api/leaderboard` 交给处理器，只接受 `POST` 的 `/api/referral-geo`、`/api/client-error-report`、`/client-error-report`、`/mobile-agent-sync-ticket*` 在 `GET`/`HEAD` 下由中间件返回 405（`allow: POST`），未知的 `/api/*` 返回 404；`POST` 等非导航方法一律交给服务端处理器。Nitro route rules 的安全头照常附加。产物目录按 `GATU_PUBLIC_DIR` → `./public` → `./.output/public` 查找；找不到壳时导航 503（fail closed），只有 `GATU_RUNTIME_SSR=true` 才回退 SSR。dev 服务器与构建期预渲染（`TSS_PRERENDERING`）绕过该中间件，因此文档路由保留 `ssr: true` 供预渲染使用，`/` 与 `/join/*` 改为 `ssr: false`。
10. 部署契约随之调整：`/join/*` 返回的壳由中间件盖上 `<meta name="gatu-route" content="referral-join">` 标记，`deploy.sh` 的 referral 深链检查不变；第 8 步新增 `verify_geo_provider`，用生产 IPdata 密钥对 `/api/geo` 做真实探针（`X-Forwarded-For: 8.8.8.8` → 200 且 `country === "US"`），失败即回滚。
11. 目标宿主是 CloudFront + S3 + Lambda，不再需要 EC2 与 Caddy（[部署材料](../../deploy/cloudfront/README.md)）。同一份客户端构建上传到私有 S3；viewer-request 函数承担静态壳中间件的分类逻辑（文档路由 → `index.html`，应用路径 → `_shell.html`，文件路径与服务端路径放行，`/_serverFn/*` 404），viewer-response 函数把 referral 标记暴露为 `x-gatu-route` 响应头；响应头策略由 `security-headers.ts` 生成；`src/edge/lambda-handler.ts` 把同一组 `/api/*` 处理器适配到 Lambda 函数 URL（`x-gatu-forwarded-host` 还原公网 origin，`CloudFront-Viewer-Address` 提供客户端 IP，OAC 保证只有 CloudFront 能调用），`build:lambda` 产出约 220 KB 的单文件。配对票据在无共享存储的宿主上返回 503，启用前需 DynamoDB 条件写。EC2 路径在切换稳定前保留为回滚手段。

## 备选方案与取舍

| 方案 | 判断 |
| --- | --- |
| 维持 SSR + Nitro | 现状；为骨架壳支付常驻进程、hydration 规则和单进程状态的代价，无法水平扩展 |
| 复制官方站的空 `#root` | 弱网十几秒空白、无可访问加载状态；预渲染壳以同样的托管形态保留骨架 |
| 用 Nitro `static` preset 自行 prerender | 与 TanStack Start 的壳/manifest 机制重复，且仍要处理 `ssr:false` 路由；SPA 模式是框架内置能力 |
| 保留 Server Function，只在 CDN 放行 `/_serverFn/*` | 传输格式与函数 ID 由框架编译器生成，无法在 Worker 等非 TanStack 宿主上挂载；显式 `/api/*` 处理器可被任意宿主复用 |
| 把处理器迁入独立 `packages/edge-api` | 隔离更彻底，但要搬动 leaderboard 域模型等大量依赖并新增部署面；首期保持在 `apps/terminal/src/lib` 并以纯 Web API 约束可移植性 |
| 预渲染每个市场路由 | 市场数以千计且内容实时，静态 HTML 没有价值；交易路由本就 `noIndex` |
| `maskPath` 用 `/` | 根路由重定向导致壳预渲染依赖跳转跟随，且壳会带上跳转目标的 head |

## 后果与边界

收益：托管形态可以与 `apps/website` 一样是 S3 + CloudFront；没有进程可挂、天然多实例；`ClientRuntimeGate` 的服务端分支、以 presented matches 判定 Provider 边界的规则、服务端语言与浏览器持久化语言的差异都不再是必须维护的边界。首屏 HTML 与现有 SSR 壳是同一份骨架，不引入官方站式空白。

尚未完成、不得视为可发布：

- 服务端点已可移植但仍只由 Nitro 挂载。把 `public/` 搬到对象存储 + CDN 时，必须把 `/api/*`（含 `/api/leaderboard`）与 `/mobile-agent-sync-ticket` 路由到挂载这些处理器的服务；没有该路由时 `/api/geo` 得到 404，`useGeoRestriction` 按契约 fail closed：浏览与行情正常，交易与资金动作被禁用。Worker/Lambda 适配器与其部署（密钥、可信代理链、`CF-Connecting-IP` 或等价头）另立任务；本仓库暂不加入 `wrangler` 等新依赖。
- 旧路径 `POST /client-error-report` 以别名保留一个发布周期，避免仍打开旧包的浏览器丢失错误上报；确认无旧客户端后删除。
- 现有部署（Caddy → Node）已经是"静态壳 + API"形态：安全头由 Nitro route rules 附加，`preconnect` 由 Caddy 附加，无需改动。只有把 `public/` 搬到对象存储 + CDN 时才需要在 CDN 层重建这些头；`serve-spa-static.mjs` 只模拟回写与缓存，不下发 CSP。
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

第二检查点（同日，可移植 `/api/*` 处理器与静态 `build-meta.json`，基于 `fe22fb61`）：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 生产构建 | `GATU_RELEASE_ID=spa-mode-spike-2 pnpm build` | 通过，3 分 01 秒（缓存已热）；仍预渲染 7 页；客户端 gzip 总量 3,057,207 B（比基线少 97,500 B）；`.output/public/build-meta.json` 与 `GET /build-meta.json` 路由响应逐字段相同 |
| 类型检查、契约测试 | `typecheck`；`vitest run` geo-api、build-meta、client-error-report(-server)、use-geo-restriction、referral-action-geo、use-referral-actions、use-staking-actions、mobile-pairing-feature-gate、mobile-sync-one-time-ticket-server | 通过；geo-api 10 用例覆盖开发覆盖值、生产缓存、区域保留、代理判定、同源校验与客户端包装 |
| 客户端产物 | `grep` `.output/public/assets` | 无 `api.ipdata.co`（服务端处理器未进客户端）；应用源码已无 `createServerFn` |
| Nitro 生产模式 + 占位 IPdata 密钥（127.0.0.1:3031） | `curl` | `GET /api/geo` 带 `X-Forwarded-For` 返回 503 `provider_error`（证明 IP 解析与处理器挂载正常，未落到 `missing_ip`）；生产模式忽略 `override`；`POST /api/referral-geo` 同源返回 200 `unavailable/provider_error`，跨站 403；`POST /api/client-error-report` 空体 400；`/_serverFn/*` 403 |
| 静态文件 + `--api` 代理（127.0.0.1:3030 → 3031） | `curl` 与应用内浏览器 | `/api/geo` 经代理返回 503；`/build-meta.json` 由静态文件直接回应；同源 POST 经代理通过校验；`/trade/BTC` 从壳启动并渲染 7 个面板，网络中只有 `/api/geo`，无 `_serverFn` 请求 |

第三检查点（同日，运行时 SSR 关闭，基于 `5944465d`）：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 生产构建 | `GATU_RELEASE_ID=spa-mode-spike-3 pnpm build` | 通过，2 分 37 秒；预渲染 7 页；客户端 gzip 总量 3,057,526 B；中间件只出现在服务端产物 |
| 单元与契约测试 | static-pages、static-pages-responder、app-route-surface、root-provider-split、geo-api、client-error-report-server、security-policy-docs；`node --test` 静态服务器与 deploy 健康检查 | 通过 |
| Nitro 生产模式（占位密钥 + `referral-uri-guard.cjs`） | `curl` | `/docs` 与 `docs/index.html`、`/trade/BTC` 与 `/` 与 `_shell.html` 逐字节相同；`/join/*` 为壳 + 标记且带 `no-store`/`no-referrer`/`noindex`；壳响应带一份 CSP；`HEAD` 只回头部；`/_serverFn/*` 404；`/assets/missing.js` 404；`/api/geo` 503 `provider_error`；旧路径与新路径的错误上报空体均 400 |
| 发布健康检查函数 | source `deploy.sh` 后运行 `verify_build_metadata`、`verify_referral_deep_link`、`verify_upstream_malformed_referral_deep_link`、`health_check` | 全部通过；`verify_geo_provider` 在占位密钥下按设计失败并打印原因 |
| 应用内浏览器（经 Nitro） | `/trade/BTC`、`/docs`、`/join/abc123` | 终端渲染 7 个面板且只请求 `/api/geo`；文档页直接是预渲染内容且不加载 Privy；无效推荐码由客户端判定并显示 404 页 |
| 服务端路径错误方法（第四检查点，重建后复验） | `curl` Nitro 生产模式 | `GET`/`HEAD` 访问 POST-only 路径返回 405 JSON 且 `allow: POST`；未知 `/api/*` 返回 404；`GET /api/geo`、`GET /api/leaderboard` 与各 `POST` 端点不受影响；`health_check` 仍通过 |

已知的验证局限：应用内浏览器面板处于隐藏状态（`document.visibilityState === "hidden"`），订阅按契约暂停缓冲，订单簿在两种托管方式下都停留在等待态，这是验证环境伪影而不是 SPA 模式差异；同一浏览器对 Nitro 与静态版本都无法注册 Service Worker，也属环境限制；占位密钥只能证明 IP 解析与提供方调用链路，真实判定由发布流程的 `verify_geo_provider` 用生产密钥确认；未做真实 CDN 部署、Privy 登录、签名、下单、移动布局、非英文语言壳与 Lighthouse/INP 采样。
