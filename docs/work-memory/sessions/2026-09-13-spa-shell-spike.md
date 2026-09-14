<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-13-spa-shell-spike",
  "date": "2026-09-13",
  "title": "SPA 壳：在分支上跑通静态托管构建",
  "kind": "task",
  "status": "recorded",
  "topics": ["static-hosting"],
  "summary": "TanStack Start SPA 模式在 claude/spa-mode 分支构建通过并本地静态托管验证；第二检查点把 geo/错误上报改为可移植的 /api/* 处理器并静态化 build-meta.json；第三检查点关闭运行时 SSR（静态壳中间件）、补 /join 标记、旧路径别名与发布 geo 探针；CDN 搬迁与边缘挂载仍未完成。",
  "thread": null,
  "baseCommit": "2c44be20",
  "commits": ["fe22fb61", "5944465d"],
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

## 第二检查点：可移植 `/api/*` 处理器（同日，基于 `fe22fb61`）

用户要求提交后继续下一步，并提醒 Codex 仍在共享工作区工作；本检查点继续只在独立 worktree 里改动，避开 Codex 正在编辑的 `deploy/`、`docs/runtime-guardrails.md`、`docs/trading-onboarding.md`、`pnpm-lock.yaml` 与账户/充值组件，也不新增任何依赖。

改动：`src/config/api-paths.ts` 统一声明 `/api/geo`、`/api/referral-geo`、`/api/client-error-report` 与 `/build-meta.json`；`src/lib/geo/geo-contracts.ts`（zod 契约、决策派生）、`geo-api.ts`（`createGeoApiHandlers(environment)` 纯 Web API 处理器）、`geo-api-server.ts`（Nitro 适配：`getRequestIP`、`process.env.IPDATA_API_KEY`、延迟创建）；`get-geo.ts`/`get-referral-action-geo.ts` 改为同源 `fetch` 包装并保持原名与签名（既有 mock 不变）；路由 `api.geo.ts`、`api.referral-geo.ts` 用 `ANY` 处理器让处理器自己返回 405，`client-error-report.ts` 改名为 `api.client-error-report.ts`；`src/config/build-meta.ts` 与 `mobile-pairing-flags.ts` 承载无环境访问的纯逻辑，`vite.config.ts` 的 `createBuildMetaPlugin(createBuildMetaForMode(mode))` 在客户端构建期写出 `build-meta.json`；`serve-spa-static.mjs` 增加 `--api`/`SPA_API_ORIGIN` 代理。`routeTree.gen.ts` 由 `vite dev` 短暂启动重新生成。

验证：生产构建通过（3 分 01 秒，客户端 gzip 总量 3,057,207 B，比基线少 97,500 B，仍预渲染 7 页，静态 `build-meta.json` 与路由响应相同）；typecheck 通过；geo-api 10、build-meta 3、client-error-report(-server) 15、use-geo-restriction 7、referral-action-geo 4、use-referral-actions 12、use-staking-actions 19、mobile-pairing 与 ticket 23、spa-shell-config 2、vite-manual-chunks 14 用例通过；静态服务器 node 测试 7 项通过。Nitro 生产模式加占位 IPdata 密钥：`GET /api/geo` 带 `X-Forwarded-For` 得到 503 `provider_error`（IP 解析成功，未落入 `missing_ip`），生产忽略 `override`，`POST /api/referral-geo` 同源 200 `unavailable`、跨站 403，`POST /api/client-error-report` 空体 400，`/_serverFn/*` 403。静态文件 + `--api` 代理：`/api/geo` 经代理 503，`/build-meta.json` 由静态文件回应，同源 POST 经代理通过校验；应用内浏览器从壳启动 `/trade/BTC` 渲染 7 个面板，网络中只有 `/api/geo`、无 `_serverFn`。客户端产物无 `api.ipdata.co`，源码无 `createServerFn`。

限制：占位密钥只能证明链路，不能证明真实判定；旧路径 `/client-error-report` 现在回页面而非 202，未刷新的旧客户端在下次加载前丢失上报；`ANY` 方法分发依赖框架 `handlers[method] ?? handlers.ANY` 的实现（start-server-core 1.169.17 已核对）；未在真实 CDN 上验证 `/api/*` 路由与 `Host`/`Origin` 转发。

## 第三检查点：关闭运行时 SSR（同日，基于 `5944465d`）

用户要求文档页也改成静态预渲染并把 SSR 彻底关掉，同时完成上一检查点列出的三项未完成事项。前提核查：Nitro 的公共资源清单在服务端构建期生成，预渲染阶段之后写入的 `_shell.html` 与文档页不在清单里（`GET /docs` 在 `TSS_SHELL=true` 下仍返回壳而非 27 KB 文档页），因此不能依赖 Nitro 静态处理器；`deploy.sh` 的 referral 深链检查要求 `/join/*` HTML 含 `<meta name="gatu-route" content="referral-join">`，而 `join.$code.tsx` 之前默认 SSR 且在 `head()` 里输出该标记。

改动：`src/start.ts` 用 `createStart` 注册 `staticPagesRequestMiddleware` 与 CSRF 中间件；`src/lib/static-pages/static-pages.ts`（纯分类与标记注入）、`static-pages-responder.ts`（注入 `readFile` 的响应器，缓存命中文件，找不到壳时 503 fail closed，`GATU_RUNTIME_SSR=true` 才回退）、`request-middleware.ts`（Node 适配，dev 与 `TSS_PRERENDERING` 绕过，产物目录按 `GATU_PUBLIC_DIR` → `./public` → `./.output/public` 查找）；`/` 与 `/join/*` 改为 `ssr: false`；`referralJoinHeaders` 移到 `config/security-headers.ts` 供 route rules 与中间件共用；新增 `routes/client-error-report.ts` 作为旧路径 `POST` 别名；`deploy.sh` 新增 `verify_geo_provider`（`X-Forwarded-For: 8.8.8.8` → `/api/geo` 200 且 `country === "US"`，仅在新版本链路执行）；`deploy/README.md`、终端 README、CHANGELOG、`.claude/rules/ssr.md`、ADR 0005 同步。避开 Codex 正在编辑的 `deploy/gatu.service` 与 `deploy/env.runtime.example`，新增环境变量只写入 README。

验证：生产构建通过（2 分 37 秒，客户端 gzip 总量 3,057,526 B，比基线少 97,181 B，预渲染 7 页）；中间件代码只出现在 `.output/server`，客户端资源中无 `Static shell missing`/`GATU_RUNTIME_SSR`；typecheck、Biome 通过；static-pages 5 + responder 4 用例、route-surface 28、root-provider-split 9、geo-api 10、client-error-report-server 6、security-policy-docs 5 通过；静态服务器 7 项与 deploy 健康检查 37 项 node 测试通过。Nitro 生产模式（127.0.0.1:3031，占位 IPdata 密钥，带 `referral-uri-guard.cjs`）：`/docs`、`/docs/` 与 `docs/index.html` 逐字节相同，`/trade/BTC` 与 `/` 与 `_shell.html` 逐字节相同，`/join/__gatu_healthcheck__` 为壳 + 49 字节标记并带 `no-store`/`no-referrer`/`noindex`，壳响应带一份 CSP 与 `cache-control: no-cache`，`HEAD` 只回头部，`Accept: application/json` 的页面请求仍得到壳；`/assets/missing.js` 404 文本，`/favicon.ico` 由 Nitro 静态清单返回，`/_serverFn/x` 404 JSON，`/api/geo` 503 `provider_error`，`POST /client-error-report` 与 `POST /api/client-error-report` 空体均 400，`/join/%` 经守卫 404 `no-store`。直接 source `deploy.sh` 运行 `verify_build_metadata`、`verify_referral_deep_link`、`verify_upstream_malformed_referral_deep_link` 与完整 `health_check 3031` 全部通过；`verify_geo_provider` 在占位密钥下按设计失败并打印原因。应用内浏览器经 Nitro 打开 `/trade/BTC` 渲染 7 个面板，网络只有 `/api/geo`；`/docs` 直接是预渲染页且未加载 Privy；`/join/abc123` 由客户端判定为无效码显示 404 页，`gatu-route` meta 存在。dev 服务器保持 SSR，`/api/geo`、`/client-error-report` 别名（400）正常。

限制：`verify_geo_provider` 的真实通过需要生产密钥，本地只验证了失败路径与报错信息；`grep -o` 对含二进制字节的 HTML 不输出匹配，标记存在以 `verify_referral_deep_link` 通过和响应体字节差为准。

## 第四检查点：收口服务端路径的错误方法（同日，基于 `38e92e0c`）

用户要求继续处理残留并执行修复。核对：配对票据路由只声明 `POST`，发布探针（`deploy/mobile-sync-release.mjs`）只用 `POST` 访问票据路径和 `GET /build-meta.json`，因此对该路径的 `GET`/`HEAD` 没有任何合法消费者。修复在静态壳分类器内完成，不改配对契约与票据路由：`GET`/`HEAD` 访问只接受 `POST` 的 `/api/referral-geo`、`/api/client-error-report`、`/client-error-report`、`/mobile-agent-sync-ticket*` 返回 405（`allow: POST`，`no-store`），未知 `/api/*` 返回 404，`GET /api/geo` 与 `GET /api/leaderboard` 仍交给处理器；`LEADERBOARD_API_PATH` 移入 `config/api-paths.ts` 供客户端 URL 构造与分类器共用。

验证：typecheck、Biome 通过；static-pages 6、responder 4、leaderboard-api 13、leaderboard-server 8、app-route-surface 28 用例通过。生产构建通过（客户端 gzip 总量 3,057,489 B，比基线少 97,218 B，预渲染 7 页）。Nitro 生产模式（127.0.0.1:3031，占位密钥，带守卫）：`GET`/`HEAD` 访问 `/mobile-agent-sync-ticket`、`/mobile-agent-sync-ticket/consume`、`/client-error-report`、`/api/client-error-report`、`/api/referral-geo` 均返回 405 JSON、`allow: POST`、`no-store`；`/api`、`/api/`、`/api/unknown`、`/api/geo/extra` 返回 404；`GET /api/geo`（503 `provider_error`）、`GET /api/leaderboard`（200 JSON）、`POST /mobile-agent-sync-ticket`（400）、`POST /client-error-report` 别名（400）不受影响；`/trade/BTC` 与 `/docs` 仍与预渲染文件逐字节相同；source `deploy.sh` 运行完整 `health_check` 通过。

同一轮用户确定 CDN 平台为 AWS CloudFront，并要求核对本机 AWS CLI。只读核查（未创建任何资源）：`aws-cli/2.36.2`，默认区域 `ap-northeast-1`，默认 profile 是 root 账号密钥；现有分发 `EP2DIBP3T7M3G` 为营销站（S3 源、`gatu-rewrite-index` 函数）；us-east-1 证书只覆盖 `gatu.ai`/`www.gatu.ai`；无 Route53 托管区（DNS 在 Cloudflare）；EC2 `18.182.219.124` 运行 Caddy + Node。据此新增 `deploy/cloudfront/`：分发配置生成器 `distribution-config.mjs`（默认行为 CachingDisabled + AllViewerAndCloudFrontHeaders 转发 Host 与 viewer 地址，`/assets/*` 等 7 类路径 CachingOptimized，源站 HTTPS + `X-Origin-Verify` 自定义头；4 项 node 测试）、Caddy 可信代理链片段（`X-Origin-Verify` 匹配时用 `CloudFront-Viewer-Address` 写 `X-Forwarded-For`）、操作手册（先建 IAM 身份、申请 `app.gatu.ai`+`testnet.gatu.ai` 证书、`origin.gatu.ai` 源站名、切换前用 `--resolve` 验证、Cloudflare CNAME 切换与回滚）。资源创建需持有授权的人确认后执行；root 密钥不应直接用于变更。

## 第五检查点：CloudFront + S3 + Lambda 全静态目标（同日，基于 `33d810c5`）

用户改变目标：用 CloudFront 就不再保留 Caddy/EC2（多一台服务器成本），并要求先调试官方终端 `/trade/HYPE` 的托管实践。官方站只读调试结论（`curl -D`、bundle 检索）：S3 源 + CloudFront，SPA 回写靠自定义错误响应把所有不存在的键（含缺失资源与 `/sw.js`）映射成 `index.html` 200（`X-Cache: Error from cloudfront`，错误响应在边缘缓存超过一天）；HTML 与资源均无 `Cache-Control`；没有任何安全头；API 域 `api-ui.hyperliquid.xyz` 是 CloudFront 后的 nginx，CORS `*`；前端不做地区判定。gatu 取其托管形态，不取其错误回写、无缓存策略与无安全头。

实现（不创建任何 AWS 资源）：`src/edge/lambda-handler.ts` Lambda 函数 URL 适配器（还原公网 origin、取 viewer 地址为客户端 IP、路由四个 `/api/*` 处理器与旧路径别名、票据 503、其余 404；5 用例）与 `vite.lambda.config.ts`（`build:lambda`，SSR 单文件约 220 KB，`publicDir: false`，本地以假事件冒烟：geo 无密钥 503 `missing_config`、未知 404、错误上报 202）；`report.ts` 改从 `@gatu/hl-react/legal` 深路径导入并在 hl-react `exports` 增加 `./legal`，避免把整个 hl-react 打进 Lambda；`deploy/cloudfront/functions/`（viewer-request 改写与 `x-gatu-forwarded-host`/`x-gatu-route`，viewer-response 暴露标记头；测试用 `node:vm` 执行并核对文档路由与应用常量一致）；`response-headers-policies.mjs`（用 `--experimental-strip-types` 直接读取 `security-headers.ts`，生成 base/trade/join/chart 四策略，testnet 全部 `noindex`）；`distribution-config.mjs` 改为 S3（OAC）+ Lambda（OAC）双源、路径行为、函数关联与 404 映射，并输出 Lambda 源请求策略（转发除 Host 外的头与 viewer 地址）；`deploy.mjs`（`sync` 按缓存策略分组且资源先 HTML 后、从不删除；`invalidate /*`；`lambda` zip + 更新；`verify` 经公网核对壳/文档页字节、CSP 与网络 preconnect、`build-meta.json`、`/api/geo` 真实判定、`/join` 头与 `x-gatu-route`、缺失文件 404、图表包重新验证、testnet `noindex`）；`public/404.html`；根 `test:cloudfront` 脚本；删除 Caddy 片段。手册重写为 S3 + Lambda 步骤（IAM → 证书 → 桶 → Lambda 与 OAC → 函数 → 策略 → 分发 → 首次发布 → `--resolve` 验证 → Cloudflare 切换 → 退役 EC2）。

验证：typecheck 通过；`pnpm test:cloudfront`（函数 4、策略 3、分发 5、部署脚本 5）与 vitest lambda-handler 5、client-error-report 15 用例通过；Lambda 产物无 `window` 引用。限制：所有 AWS 步骤仍为计划，未创建资源；`--resolve` 切换前验证与畸形 `/join/%` 在 CloudFront 上的表现需在真实分发上确认；本机 Node 24 与 CI Node 22 都支持 `--experimental-strip-types`，但 CI 未接入 `test:cloudfront`。

## 第六检查点：按手册创建 AWS 资源（同日，基于 `d4e94618`）

用户确认"先建受限 IAM 用户，然后按手册执行"。用 root 创建：IAM 策略 `gatu-edge-deploy`（CloudFront 全量、ACM 限 us-east-1、S3 限 `gatu-terminal-2026`、Lambda 限 `gatu-terminal-api*`、`iam:PassRole` 限 `gatu-terminal-api-role`、Lambda 日志只读）、用户 `gatu-edge`、Lambda 执行角色 `gatu-terminal-api-role`（`AWSLambdaBasicExecutionRole`）；访问密钥由脚本直接写入本机 `~/.aws/credentials` 的 `gatu-edge` profile，未在对话中出现。此后全部用 `gatu-edge` 执行：ACM 证书 `app.gatu.ai` + `testnet.gatu.ai`（us-east-1，`PENDING_VALIDATION`，两条验证 CNAME 已交给用户加到 Cloudflare）；S3 桶 `gatu-terminal-2026`（私有、版本控制、SSE-S3、BucketOwnerEnforced）；Lambda `gatu-terminal-api`（nodejs22.x、arm64、256 MB、10 s，环境变量含本机 `.env.local` 的 IPdata 密钥，函数 URL `AWS_IAM`，直接调用冒烟返回 404 JSON）；CloudFront Functions `gatu-terminal-request`/`gatu-terminal-response`（LIVE）；OAC `E3Q2M6YP3F2SUV`（S3）、`E36DJ1HFODURZB`（Lambda）；源请求策略 `b4401266-2fa0-4c6f-9e55-f232a32b94de`；八个响应头策略；分发 `ET9CNVE6L1GWN`（mainnet，`d2i25dhfjwco8b.cloudfront.net`）与 `E3Q2SAX402CR9F`（testnet，`dg9o2gpw3mt8q.cloudfront.net`），先用默认证书，桶策略与 Lambda URL 权限已限定到这两条分发的 ARN。

途中修正两处 CloudFront 限制：源请求策略白名单最多 10 个头（原 13 个，减到 9 个）；响应头策略的 CSP 最多 1,783 字符而应用 CSP 为 1,946 字符，改由 viewer-response 函数下发 CSP（模板 + `render-functions.mjs` 渲染，`test-function` 验证输出 CSP 长度 1,946、计算占用 7），响应头策略不再含 CSP，所有静态行为都挂该函数。

## 第七检查点：打通 CloudFront → Lambda 并完成首次发布（同日，基于 `463a334a`）

现象：两条分发 `Deployed` 后，经 CloudFront 访问 `GET /api/geo` 得到 403 `AccessDeniedException`（"Forbidden. For troubleshooting Function URL authorization issues"），带体的 `POST /api/referral-geo` 得到 403 "The request signature we calculated does not match"。直接调用函数 URL 与 `/_serverFn/*` 404 都正常，说明问题在 OAC 签名到 Lambda 授权这一段。

根因与修复（依据 AWS 文档 "Restricting access to an AWS Lambda function URL origin" 的 CLI 示例）：函数资源策略需要给 `cloudfront.amazonaws.com` **两条**授权——`lambda:InvokeFunctionUrl` 与 `lambda:InvokeFunction`，手册与第六检查点只加了前者；补上 `cloudfront-mainnet-invoke`/`cloudfront-testnet-invoke` 两条（同样限定到各自分发 ARN）后 GET 立即 200。签名不匹配则是文档明示的限制：CloudFront 对 Lambda 源的 OAC 签名不读请求体，viewer 必须自带 `x-amz-content-sha256`；带该头（值为请求体 SHA-256）的同源 `POST /api/referral-geo` 经 CloudFront 返回 200 决策，不带则仍 403。

曾尝试的替代方案（放弃）：把函数 URL 改成公开并用分发自定义头 `X-Origin-Verify` + Lambda 常量时间比较来验证来源。实现到一半后放弃，因为它让未签名调用也计费并占用并发，且要在分发配置与 Lambda 环境两处保存密钥；ADR 决策 12 记录了取舍。

代码：新增 `src/lib/api/payload-hash.ts`（同步纯 TS SHA-256 + `createJsonPostHeaders(body, extra)`；同步是为了 `keepalive` 错误上报在页面卸载时仍能立即发出），`get-referral-action-geo.ts`、`error-reporting/client.ts`、`mobile-sync/one-time-ticket-client.ts` 的 POST 都经它发出；`deploy.mjs verify` 新增"signed lambda post with a payload hash"检查（同源头 + 体哈希的真实 `POST /api/referral-geo`）。测试：`payload-hash.test.ts`（NIST 向量、块边界与 UTF-8 与 `node:crypto` 对拍、referral 请求头）、`client-error-report.test.ts` 断言上报头、`deploy.test.mjs` 通过/失败两条路径各加该项；vitest 6 文件 54 用例、`pnpm test:cloudfront` 20 用例、typecheck 通过。

发布：`build:lambda`（220,618 B）→ `deploy.mjs lambda --execute`（`update-function-code --publish`，代码 45,610 B zip，`LastUpdateStatus=Successful`）；客户端 `GATU_RELEASE_ID=cloudfront-2026-09-13 pnpm build`（预渲染 7 页，客户端 gzip 总量 3,058,779 B，比基线少 95,928 B；`x-amz-content-sha256` 出现在 1 个客户端资源文件中）→ `deploy.mjs sync --bucket gatu-terminal-2026 --execute`（桶内 1,585 个对象；`_shell.html` 12,677 B `no-cache`，`docs/index.html` 27,189 B，`build-meta.json` `no-store`，`404.html` 588 B；没有根 `index.html`，导航由 viewer-request 函数改写）→ 两条 `invalidate /*`（`I7W2G478KQ7XFSCGP18P1TK1ML`、`IOFBP2ZV49DCIQYN71WQ3CF4K`，均 `Completed`）。

验证结果：`deploy.mjs verify --origin https://d2i25dhfjwco8b.cloudfront.net --network mainnet` 8 项全部 ok（壳逐字节一致且带 CSP 与 `api.hyperliquid.xyz` preconnect、文档页一致、`build-meta` `463a334a / cloudfront-2026-09-13`、`/api/geo` 真实判定 `country US`、签名 POST `status blocked`、`/join` 头与 `x-gatu-route`、缺失文件 404、图表包重新验证）；testnet 域 9 项全部 ok（多出 `noindex`，preconnect 指向 `api.hyperliquid-testnet.xyz`）。应用内浏览器（1024 宽）打开 `https://d2i25dhfjwco8b.cloudfront.net/trade/HYPE`：标题变为实时价格，7 个网格面板，唯一服务端请求 `/api/geo` 返回 200，无 `_serverFn` 请求，无控制台错误；`/docs` 直接是预渲染 HTML（`h1` "gatu Documentation"，未加载 Privy）；`/join/abc123` 得到壳并由客户端判定为无效推荐码显示 404 页，`gatu-route=referral-join` meta 由客户端写入。

限制：两条分发仍用默认 `*.cloudfront.net` 证书；ACM 证书 `PENDING_VALIDATION`，等用户把两条验证 CNAME 加到 Cloudflare 后再给分发挂别名与证书，然后由用户切换 DNS；`verify` 与浏览器都从执行机的公网 IP 发起（IPdata 判定为 US），未做真实地区覆盖；未做 Privy 登录、签名、下单与移动布局；EC2 仍在服务 `app.gatu.ai`，尚未退役。

## 第八检查点：与官方站同环境对比与修复计划（同日，基于 `6721c375`）

用户要求复核修改后的架构、用浏览器实测官方站的技术栈与数据流、对比差异并规划修复。计划文档：[终端启动性能对齐官方站](../../terminal-startup-performance-plan.md)（状态：计划，未执行）。

产物复核：`.output/public` 5,056 个文件 65.6 MB，其中 `charting_library` 43.8 MB / 3,707 个文件全部 `max-age=0, must-revalidate`；`assets/` 1,312 个文件含 915 个 `.gz/.br/.zst` 预压缩副本（`deploy.mjs` 排除上传，S3 上为 0）。壳引用 9 个文件 gzip 639 KB（`vendor-tanstack-router` 356 KB，两套字体 94 KB）；打开 `/trade/HYPE` 实际下载 98 个 JS 文件。`vendor-tanstack-router` 块内含 hl-react 可靠性表（`l2Book`、`clearinghouseState` 字符串各十余次）、zustand、sonner，React 本体在 `vendor-base-ui`；`createManualChunks` 只按包名分配。仍描述 SSR 的文档：`agent.md` 第 44 行、`apps/terminal/README.md` 第 50、52、117 行、`deploy/README.md`（62 处 EC2/Caddy）。

官方站实测（应用内浏览器，冷缓存，单样本）：HTML 6.7 KB、`#root` 为空、45 个 `modulepreload`；TTFB 378 ms，DCL 2.5 s，load 3.9 s；10 秒内 94 个资源 2.37 MB；首批 48 个 JS/CSS gzip 1.66 MB（原始 5.7 MB），最大块 `config-*.js` 570 KB gzip 几乎全是钱包、lit 与 zod。指纹：React + styled-components + react-intl，React Query 离线缓存，Vite/rolldown；Privy + wagmi + ethers/viem + Reown AppKit + Coinbase SDK + WalletConnect；Across、MoonPay；TradingView `charting_library_v28.5`；mixpanel 与 gtag；无 CSP、无 `Cache-Control`，`SW.js` 返回 index.html，Service Worker 未生效。数据流：`webData3` 聚合流加 `bbo`、`l2Book`、`activeAssetCtx/Data`、`orderUpdates`、`notification`、`twapStates`、`userFills`；REST 做 `spotMeta`、`allPerpMetas`、`clearinghouseState`、`candleSnapshot`、`legalCheck`、`portfolio`、`userFees`、`leaderboard`；API 域为 `api-ui.hyperliquid.xyz`。

本项目同环境冷缓存（测试网分发首次命中该边缘）：TTFB 2,188 ms，DCL 3.6 s，load 6.2 s；114 个资源 1.77 MB；壳块 3.9 s 到达，`client-root` 7.3 s，主块 8.0 s，图表入口 11.6 s，`/api/geo` 11.7 s。热缓存下 DCL 569 ms、load 778 ms，7 个面板，无控制台错误。`curl`：壳 `Miss` 后 `RefreshHit`（每次回源），`/api/geo` 冷 1.69 s / 1.64 s、热 0.36 s，图表 bundle `Miss` 且 `must-revalidate`；IPdata 从本机首次 1.65 s、复用 0.44 s；Lambda 256 MB arm64。修正一处早前判断：gatu 已订阅 `orderUpdates` 与 `twapStates`（多行调用未被首次检索命中），推送流覆盖与官方站等价。

结论与计划要点：差距主要来自分块瀑布（壳只预加载 6 个块）、壳与图表包的缓存策略、地区判定发起过晚与 Lambda 冷启动；计划按 P1 壳内预加载静态闭包、P2 壳边缘缓存、P3 图表 bundle immutable、P4 地区预取与保温、P5 分块整理、P6 字体、P7 告警、P8 过渡与文档八项排期，四个阶段，每阶段发布后同环境复测。未执行任何修改。

## 第九检查点：执行修复计划阶段 1 与阶段 2（同日，基于 `65166713`）

用户决定：从阶段 1 开始执行，不做边缘初判（P4.3），保温用 EventBridge 定时调用。决策记录 [ADR 0006](../../adr/0006-startup-preloads-and-edge-caching.md)。

阶段 1（提交 `34d1c089`，只改部署材料）：`HTML_CACHE_CONTROL` 改为 `public, max-age=0, s-maxage=60, stale-while-revalidate=300`；`charting_library/bundles/` 下带 20 位内容哈希的文件（js、css、rtl.css、woff2、cur、svg、png）改 immutable，入口与 `sameorigin.html` 保持重新验证，Nitro 路由规则同步；chart 响应头策略去掉 `Cache-Control` 覆盖（发现时线上 bundle 仍回旧头，正是策略 `Override=True` 覆盖了对象元数据，`update-response-headers-policy` 后即生效）；新增 `deploy.mjs reupload --only <前缀>`（`aws s3 cp` 强制重写元数据，因为 `sync` 跳过内容未变的文件，每命令 ≤ 500 个键）；`verify` 新增"壳二次请求边缘命中"与"图表 bundle immutable 且边缘命中"。对 `_shell.html`、`404.html`、六个文档页与 3,707 个 bundle 执行 reupload，两条分发失效并等待完成，verify 主网 10/10、测试网 11/11。

阶段 2（本检查点提交，改应用与构建）：`scripts/inject-shell-preloads.mjs` 在 `pnpm build` 末尾把静态交易启动闭包与移动、桌面运行时 profile 的并集写进 `_shell.html`（`check-client-bundle-budget.mjs` 拆出无日志的 `analyzeClientBundle()` 供复用；标记 `<!--gatu-shell-preloads-->`，重复运行只替换；缺文件即失败；3 个 node 测试；CI 工作流加入该测试）；`config/app-route-surface.ts` 从 `providers/client-runtime.tsx` 抽出无 React 依赖的路由面判定；`lib/geo/geo-prefetch.ts` 在引导块 `client.ts` 对非文档路由预取 `/api/geo`，`getGeo` 一次性复用（4 个 vitest 用例）；Lambda 新增 `GET /api/health` 204 `no-store`；`verify` 新增"壳内 ≥ 20 个 modulepreload 且都在本地构建中并在线上 immutable"与"health 204"。AWS：Lambda 内存 256 → 512 MB；用 root 创建执行角色 `gatu-terminal-api-warm-role` 与 EventBridge Scheduler `gatu-terminal-api-warm`（`rate(5 minutes)`，合成函数 URL 事件调用 `/api/health`，重试 0 次）。构建 `GATU_RELEASE_ID=cloudfront-2026-09-13-p2`：预算通过（静态交易启动 1,553,403 B gzip，比基线少 16,818；桌面运行时 +4,940、移动 +1,020，均在容差内），壳注入 91 个链接，共 97 个 `modulepreload`，壳 19,282 B，文档页未注入。

发布事故与修复：首次 `deploy.mjs sync --execute` 后 verify 报壳、文档页与 `build-meta.json` 与本地不一致，S3 时间戳显示只有早期阶段（资源、重新验证组）上传，四条晚期命令没有生效；把同样的命令手动执行即成功，原因未定位（当时把 stderr 一并过滤，看不到错误）。修复：`runAws` 改为直接继承 stdout/stderr，不再缓冲；`sync` 结束时核对 S3 上 `_shell.html` 与 `build-meta.json` 字节数与本地一致，不一致即抛错（`assertReleaseMarkersUploaded`，含测试）。重新失效后 verify 主网 12/12、测试网 13/13；`/api/health` 三次 0.26–0.41 s，`/api/geo` 0.27–0.54 s（无冷启动）。

同环境测量（Playwright 全新 Chromium 上下文，本机直连东京边缘，单样本，毫秒）：

| 阶段 | TTFB | DCL | FCP | load | `client-root` 到达 | 主块到达 | 启动 JS 最后到达 | `/api/geo` 完成 | 图表入口到达 | 图表 iframe 资源完成 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 阶段 1 前 | 424 | 496 | 632 | 626 | 676 | 697 | — | 3,865 | 1,903 | — |
| 阶段 1 后 | 197 | 762 | 772 | 989 | 1,362 | 1,702 | — | 2,697 | 3,198 | 3,560（72 个文件） |
| 阶段 2 后 | 174 | 196 | 220 | 976 | 596 | 925 | 936（97 个文件） | 1,388（976 发起） | 1,763 | ≈ 2,470（72 个文件） |
| 官方站（同工具同时段） | 494 | 1,049 | 1,148 | 1,068 | — | — | 1,348（58 个文件） | 首个 API 1,137，最后 2,271 | 537 | 图表在主文档内加载，无独立 iframe |

解读：预加载让 97 个启动块在 0.94 s 内一次到齐，`client-root` 从 1.36 s 提前到 0.60 s；地区判定发起点仍在路由块执行之后（引导块静态依赖 `vendor-tanstack-router`，见 P5），但已从 2.7 s 降到 1.4 s；剩余差距是图表入口的加载时机（官方站在 HTML 头部同步加载 `charting_library.js`，本项目在交易页挂载后才加载）。阶段 1 与阶段 2 之间的差异含本机网络噪声，只看量级。

限制：所有测量来自同一台机器直连东京边缘，未覆盖慢网与远地边缘；移动端现在也会预加载桌面面板块；`analyzeClientBundle()` 与预算检查在构建里各跑一次；晚期上传静默停止的根因未定位，只加了失败关闭的核对。

## 第十检查点：阶段 5 图表入口提前（2026-09-14，基于 `cdf76c71`）

用户确认执行 P9。实现：`config/chart-library.ts` 承载 `CHART_LIBRARY_PATH` 与 `createChartLibraryScriptUrl(commit)`（无环境访问，Vite 配置与运行时共用），`config/chart.ts` 改为再导出，`load-tradingview.ts` 的 `TRADINGVIEW_SCRIPT_SRC` 与 `createBuildMeta()` 新字段 `chartLibraryScript` 同源；`inject-shell-preloads.mjs` 读取 `build-meta.json` 的该字段注入 `preload as="script"`，并对构建时 glob 得到的 `bundles/runtime.*`、`bundles/library.*`（各必须恰好一个）、`sameorigin.html`、`tradingview-theme-dark.css` 注入 `prefetch`，全部 `media="(min-width: 1001px)"`；`scripts/inject-shell-preloads.d.mts` 让 vitest 能以类型安全的方式导入脚本常量，`chart-library-preload.test.ts` 断言运行时 URL、构建元数据字段与桌面断点（`MOBILE_BREAKPOINT_PX + 1`）三者一致；`objectCacheControl` 与 Nitro 路由规则把入口 `charting_library.js` 改 immutable；`verify` 的"图表入口重新验证"改为"壳内预加载的图表入口线上 immutable"。`deploy/README.md` 里 Caddy 时代"WebKit 热缓存下 v28 可能初始化失败、必须每次重新验证"的警告没有证据记录，已改写为说明现行策略并把 iPad WebKit 热缓存回归列为 DNS 切换前的必做项。测试：node 5 + 22、vitest 8 文件 117 用例、typecheck、Biome 通过。

发布：构建 `cloudfront-2026-09-13-p5`（壳 97 个 `modulepreload` + 1 个 preload + 4 个 prefetch，预算通过）；`reupload --only charting_library/charting_library.js` 后首次 `sync` 在资源阶段失败，`aws s3 cp/sync` 报 "Failed to connect to proxy URL: http://127.0.0.1:6152"，本机 HTTPS 代理短暂不可用；`runAws` 已改为流式输出，所以这次错误直接可见并让脚本中止，这也是第九检查点"晚期上传静默停止"最可能的根因（当时 stderr 被过滤）。代理恢复后重跑 `sync`，"Release markers match the local build"，两条失效完成，verify 主网 12/12、测试网 13/13。

同环境测量（Playwright 全新 Chromium 上下文，本机直连东京边缘，毫秒；两个样本，第一个样本受本机网络抖动影响整体偏慢）：

| 指标 | 阶段 2 后（对照） | 阶段 5 样本 1 | 阶段 5 样本 2 |
| --- | --- | --- | --- |
| TTFB / DCL / FCP / load | 174 / 196 / 220 / 976 | 256 / 845 / 856 / 1,042 | 224 / 305 / 428 / 414 |
| 启动 JS 最后到达 | 936 | 1,016 | 449 |
| 图表入口到达（发起方） | 1,763（面板挂载后 `<script>`） | 362（壳 preload，仅 1 次请求） | 446（壳 preload） |
| `library.js` prefetch 完成 | 无 | 1,726（772 KB） | 458 |
| 图表 iframe 创建 | 1,769 | 1,731 | 940 |
| iframe 内 `library.js` | 从网络下载 | 缓存命中，frame 后 323 | 缓存命中，frame 后 306 |
| iframe 核心资源完成 | frame 后约 700 | — | frame 后 763，11 个 canvas 已绘制 |
| `/api/geo` 完成 | 1,388 | 1,422 | 818 |

解读：入口现在随首波到达（0.36–0.45 s），iframe 内最大的文件命中 HTTP 缓存；样本 2 里 iframe 在 0.94 s 创建、约 1.8 s 完成核心资源，比阶段 2 后的 1.77 s 创建、约 2.5 s 完成提前约 0.8 s；样本 1 的 iframe 仍在 1.73 s 创建，说明创建时机还受面板挂载与数据就绪影响，不只取决于入口。prefetch 在 DCL 之后才发起（Chrome 的最低优先级），没有推迟启动 JS。移动端未测（`media` 条件下不下载）。限制同前：单机直连、样本少、未做 iPad WebKit 热缓存回归。

## 第十一检查点：双端复核与组件树审查（2026-09-14，基于 `3c0127a9`）

用户问"双端的缺陷修复了吗，组件树的情况请审查"。方法：Playwright 全新上下文分别以 1440×900 与 iPhone 13 视口（390×664，桌面 UA）加载 CloudFront 主网分发；同一移动视口再加载 EC2 上的旧版（`43ce177c`）作对照；本地 dev 服务器在应用内浏览器里遍历 React fiber 树读取真实组件名（生产包名字已压缩，只能看结构数量）。

组件树（dev，桌面）：主干 `StartClient → RouterProvider → QueryClientProvider → InnerWrap → RootProvider → QueryClientProvider → I18nProvider → BaseUiDirectionProvider → ClientRuntimeProvider → … → ClientRuntimeGate → ClientRootProvider → PwaInstallProvider → PrivyProvider → SmartWalletsProvider → PersistQueryClientProvider → WagmiProvider → I18nProvider → BaseUiDirectionProvider → HyperliquidBridge → HyperliquidExchangePolicyProvider → HyperliquidProvider（Transport/Session）→ OwnerSignerBridge → AgentApprovalBridge → LegalLifecycle → MarketsProvider → 对账组件 → ClientRuntimeProvider → I18nReadyGate → ExchangeScopeProvider → MarketsInfoProvider → Outlet`，与终端 README 的 Provider 图一致。重复出现的 Provider：`QueryClientProvider` ×3（路由集成、`RootProvider`、`PersistQueryClientProvider`，同一个 client）、`I18nProvider` ×2、`BaseUiDirectionProvider` ×2、`ClientRuntimeProvider` ×2（外层 `ready=false`、内层 `ready=true`，设计如此）。1,191 个 fiber、410 个宿主元素、7 个网格面板、15 个 Suspense 边界、1 个应用错误边界；`Asset` ×35、`OrderbookPlaceholderRow` ×22（面板隐藏时订阅暂停，属环境伪影）。生产桌面：2,470 个 fiber、1,378 个 DOM 节点、`ArrowSquareOutIcon` ×82（`market-overview.tsx` 与资产信息里的外链图标，数量偏多但非缺陷）、错误上报 0。这些重复 Provider 是既有设计，不在本轮改动。

双端缺陷：桌面无新问题；移动端发现两处由本轮预加载引入或遗留的浪费——(1) 阶段 5 写在 HTML 里的 `prefetch` 链接带 `media="(min-width: 1001px)"`，但 Chromium 忽略 `prefetch` 上的 `media`，390 px 视口仍下载了 `library.js`（772 KB）等 4 个文件（`preload` 上的 `media` 被遵守，入口未下载）；(2) 阶段 2 起壳的 `modulepreload` 含桌面 profile 的面板块，手机下载了 6 个只在桌面挂载的块。移动端图表在"Trade"面（订单表单 + 订单簿）默认不挂载，`MarketsDataView` 的 Chart 页才创建 widget，EC2 旧版行为相同，不是缺陷。移动端布局：底部导航 Markets/Trade/Account，无横向溢出，无控制台错误，错误上报 0。Playwright 环境下 `wss://api.hyperliquid.xyz/ws` 偶发 `ERR_CONNECTION_CLOSED` 一次后重连成功，EC2 对照未出现，判定为本机代理环境伪影。

修复（本检查点提交）：`inject-shell-preloads.mjs` 把启动闭包拆成"静态闭包 + 两个 profile 共有的文件"（仍是 HTML `modulepreload`）与"仅桌面 / 仅移动"两份写进 `<meta name="gatu-preload-desktop|mobile">`，图表 iframe 文件写进 `<meta name="gatu-chart-prefetch">`，HTML 不再有 `prefetch` 链接；入口 `preload` 保留 `media`。新增 `src/lib/preload/surface-preloads.ts`，引导块 `client.ts` 在预取 geo 的同时按 `matchMedia(DESKTOP_MEDIA_QUERY)` 追加当前面的 `modulepreload` 与桌面的图表 `prefetch`（jsdom 4 用例：桌面/移动/去重/无元数据）；`config/layout.ts` 新增 `DESKTOP_MEDIA_QUERY`；`verify` 要求壳含三个 meta。本次构建：83 个共有块进壳，14 个仅桌面块与 4 个图表文件交给引导块，移动 profile 全部包含在桌面闭包里（0 个仅移动块）。发布 `cloudfront-2026-09-14-p6`，verify 主网 12/12、测试网 13/13。

复测（Playwright，同机）：iPhone 13 视口冷缓存：93 个资源 1.35 MB（修复前 110 个、约 1.77 MB），仅桌面块 0/14、图表预取 0/4、图表入口与 bundle 均未下载，FCP 192 ms，`/api/geo` 1.35 s，底部导航正常，无控制台错误、无错误上报。1440×900（同一上下文，缓存已热，本次 TTFB 2.1 s 属代理抖动，时序不作对比）：引导块追加 14 个 `modulepreload` 与 4 个 `prefetch`，14/14 与 4/4 均已下载，7 个面板，图表 iframe 内 `library.js` 缓存命中并绘制 11 个 canvas，无控制台错误。

## 第十二检查点：全面结构审查（2026-09-14，基于 `fc0fc240`）

用户要求排查其他缺陷。范围：全仓自动门禁、目录与文件结构、依赖、文档链接、无引用模块、CloudFront 上各路由的运行时行为。

自动门禁：`pnpm typecheck`（三个包）通过；`pnpm check` 失败——6 个 `src/locales/*/messages.js`（`lingui compile` 产物，已在 `.gitignore`，Biome 仍扫描到）格式告警与 `src/lib/lazy.ts:16` 的 `noExplicitAny`，CI 的 typecheck/production-build 工作流都不跑 `pnpm check`，因此从未拦截；`pnpm --filter @gatu/terminal test` 全量 550 文件 6,086 用例中 14 文件 39 用例失败；website 4 用例、OG 校验、CI 的 12 个 node 验证器（219 用例，5 个 Linux 专属跳过）、`pnpm test:cloudfront`、`i18n:extract` 无漂移均通过。

失败用例归类：本分支引入或需随契约更新的 4 个文件——`client-bootstrap-error`（引导块调用 `window.matchMedia`，jsdom 无此 API）、`mobile-sync-bootstrap-fragment`（引导块只能有两条静态导入，我加了 geo 预取与表面预加载）、`home-route`（`/` 已按 ADR 0005 改为 `ssr:false`，测试仍断言 `true`）、`chart-asset-cache-policy`（`referralJoinHeaders` 已移到 `security-headers.ts`；图表 bundle 与入口改为 immutable）——以及一处因修复而需更新的 `root-provider-split` 源码断言。其余 10 个文件 35 用例（`desktop-positions-panel-shell` 18、`global-settings-slippage-effective` 6、`referral-ui-contract` 3、`adaptive-modal-swipe-dismissal` 3、`mobile-input-zoom-contract` 2、`position-market-close-modal`、`orders-table-visual-contract`、`mobile-trade-tp-sl-contract`、`mobile-order-risk-summary-contract`、`market-asset-info` 各 1）在本分支未触碰任何相关文件，属基线 `2c44be20` 已有的红测（多为 UI 视觉契约的源码字符串断言与过期 mock），与另一会话正在进行的 UI 评审分支重叠，本轮不改。

运行时缺陷（CloudFront 主网分发，Playwright）：(1) 每次打开仪表盘路由（`/portfolio`、`/vaults`、`/leaderboard`…）都产生一条 `react_recoverable` 错误上报（CloudWatch 已核实 `route: portfolio`）：壳在 `/trade` 掩码预渲染的是终端骨架，客户端在水合时按路径选了仪表盘骨架，React 丢弃服务端 HTML 重渲染；(2) `/leaderboard` 空表：`/api/leaderboard` 在 Lambda 上刷新约 34 MB 的上游快照，处理器自身超时 15 s，函数超时却是 10 s，CloudWatch 有 `Duration: 10000 ms` 的调用；`/api/*` 行为 CachingDisabled，处理器输出的 `s-maxage=300` 从未被边缘使用。

修复（本检查点提交）：`config/app-route-surface.ts` 新增 `getHydrationRouteSurface(pathname, hydrated)`，`__root.tsx` 在 `useHydrated()` 为假时固定终端骨架；`client.ts` 恢复两条静态导入，地区预取与表面预加载合并为 `lib/bootstrap/early-prefetch.ts` 动态导入，并列入预算脚本的静态启动闭包前缀；`surface-preloads.ts` 缺 `matchMedia` 时视为非桌面；四个契约测试按现行契约更新；Lambda 超时 10 s → 30 s；`distribution-config.mjs` 新增 `/api/leaderboard` 行为与缓存策略 `gatu-terminal-api-cached`（TTL 0/0/1800、按查询串缓存），CLI `--api-cache-policy(-config)`，两条分发已更新（缓存策略 `9dc817a5-e3f8-4ece-ac7a-623ef6157243`，用生成器产出的行为项插到线上配置首位，其余字段保持线上值）。

复测：发布 `cloudfront-2026-09-14-p7`（静态启动闭包 74 个文件含 `early-prefetch` 块，壳 85 个共有 `modulepreload`），verify 主网 12/12、测试网 13/13；`/portfolio` 错误上报 0（修复前每次 1 条），`early-prefetch` 块与 `/api/geo` 均已加载；`/api/leaderboard` 有效查询：首次 `Miss` 13.0 s（Lambda 在 30 s 内完成刷新），随后 `Hit` 0.18 s、`age` 1，页面 10 行数据、API 1.17 s，错误上报 0；测试网首次 6.9 s。全量 vitest 复跑：10 文件 33 用例失败，全部是基线已有的红测，本分支引入的 4 文件与修复带来的 1 文件已全部转绿。遗留：Lambda 快照过期后（5 分钟）第一个未命中的访问仍要等约 13 s，可由定时调用经 CloudFront 预热；根目录评审文件、`.scratch/`、无引用模块、`features/README.md` 失效链接、`pnpm check` 的 6 个目录格式告警与 `lazy.ts` 的 `any` 未处理，留给后续清理。

结构与文档：13 条本地链接失效，其中真实失效 3 条（`features/README.md` → `tp-sl.md`、`advanced-order-types.md`；根目录 `review_market_symbol_numbering.md` → 已删除的 `kline-chart.tsx`），其余为 SDK 文档中的正则文本与法务页的站内绝对路径；无引用模块 11 个（`components/icons/{coinbase,metamask,rabby}-icon.tsx`、`components/trade/tradebox/leverage-control.tsx`（仅测试引用）、`domain/trade/order-entry-calcs.ts`（纯再导出，无人引用）、`hooks/ui/{use-intent-script-loader,use-lingering-text,use-lingering-validation,use-virtual-table}.ts`、`lib/trade/close-toast.ts`、`packages/hl-react/src/testing.tsx`）；根目录堆放 22 个历史评审文件（`review_*.md`、`launch-review-*.md`、`tv_stability_review_*.md`），`notes/index.md` 只登记了部分；`.scratch/mobile-wallet-pwa-wallet-connectivity/` 10 个文件被纳入版本库且无文档入口；根 `vercel.json` 仍指向 `NITRO_PRESET=vercel` 的旧部署方式；`apps/terminal` 42 个依赖中只有 `permissionless` 找不到直接引用（Privy 智能钱包的对等依赖，保留）；`patches/` 两个补丁均在 `pnpm-workspace`/锁文件中生效；CSP 的 `script-src` 与 `style-src` 含 `'unsafe-inline'`，`img-src` 允许任意 `https:`，官方站则完全没有 CSP。

## 第十三检查点：结构清理（2026-09-14，基于 `b2787e3b`）

用户同意按第十二检查点的建议处理。决定与动作：根目录 22 个评审文件按文档治理保留原路径（`notes/index.md` 已全部登记），只给 `review_market_symbol_numbering.md` 追加更正说明；`.scratch/mobile-wallet-pwa-wallet-connectivity/` 移到 `research/mobile-wallet-pwa/`，`docs/README.md` 研究行登记为历史草稿，`.gitignore` 加 `.scratch/`；删除根 `vercel.json`（终端 Vercel 时期遗留；`apps/website/vercel.json` 由网站 README 明确使用，保留）；删除 11 个无引用模块并从 `i18n-reactivity-contract.test.ts` 的文件清单去掉 `leverage-control.tsx`，`docs/file-naming.md` 的示例文件名换成现存文件；`features/README.md` 的 TP/SL 与高级订单两行改为指向现行文档并标为已实现；`biome.json` 忽略 `src/locales/**/messages.js`，`lib/lazy.ts` 的 `any` 改为 `unknown`，typecheck 工作流新增 `pnpm check`。`permissionless` 确认为 Privy 的可选对等依赖（智能钱包需要），保留。验证：`pnpm check` 1,358 文件通过，`pnpm typecheck` 通过，`i18n-reactivity-contract` 与 `spa-shell-config` 80 用例通过，删除文件无残留引用。CSP 收紧按建议分两步，第一步 report-only 另立提交。

## 第十四检查点：CSP 收紧第一步（2026-09-14，基于 `432239fe`）

实现：`security-headers.ts` 新增 `cspReportOnlyDirectives`/`contentSecurityPolicyReportOnly`（`img-src` 收窄为 `'self' data: blob:` 加 `app.hyperliquid.xyz`、`*.privy.io`、`explorer-api.walletconnect.com`、`*.walletconnect.com`、`*.coinbase.com`，`script-src` 去掉 `blob:`）；`terminal-response.template.js` 在非图表路径按 `TERMINAL_CSP_REPORT_ONLY` 常量下发 `Content-Security-Policy-Report-Only`，`render-functions.mjs` 从新增的 `deploy/cloudfront/edge-config.json`（`cspReportUri`）渲染，空值即关闭；`src/edge/csp-report-lambda.ts` 无依赖接收器（POST、三种内容类型、≤ 8 KB、每实例每分钟 120 条、解析旧格式与 Reporting API、`csp_violation` 日志、204），`vite.lambda.config.ts` 改为双入口产出 `index.mjs` 与 `csp-report.mjs`（无共享块），`deploy.mjs lambda --lambda-entry`、新增 `deploy.mjs functions`（`describe-function` → `update-function` → `publish-function`，测试覆盖命令）。测试：vitest 13 用例（含 `csp-report-lambda.test.ts` 3 用例）、`test:cloudfront` 25 用例、typecheck、`pnpm check` 通过。文档：ADR 0007、CloudFront 手册 4b、`deploy/README.md` CSP 段、CHANGELOG。

AWS：用 `gatu-edge` 创建 `gatu-terminal-api-csp-report`（nodejs22.x、arm64、128 MB、3 s、处理程序 `csp-report.handler`，复用 API 执行角色），函数 URL `AuthType=NONE`，资源策略 `public-url`（`Principal: *`，条件 `FunctionUrlAuthType: NONE`）。`aws lambda invoke` 直接调用返回 204，但函数 URL 对 POST/GET 一律 403 `AccessDeniedException`（"Forbidding. For troubleshooting Function URL authorization issues"），删除并重建 URL 后仍然 403；`put-function-concurrency 2` 用 root 也被 `InvalidParameterValueException` 拒绝（账号并发下限）。判断为账号级 Lambda 函数 URL 公开访问阻断，本机 aws-cli 2.36.2 没有 `get/put-public-access-block-config` 无法核实或解除。曾把接收器 URL 写进 `edge-config.json` 并发布函数，线上壳一度带 report-only 头（`report-uri` 指向接收器）；确认端点不可达后把 `cspReportUri` 置空、重新渲染并发布，线上壳已无 report-only 头，图表路径的 CSP 未受影响。后续：升级 AWS CLI 或在控制台解除阻断，`curl -X POST` 得到 204 后填回 URL 并发布函数即可启用；第二步内联脚本哈希待第一步报告稳定后再做。

## 第十五检查点：解除接收器阻断并开启 report-only（2026-09-14，基于 `df2751cc`）

用户要求"升级 AWS CLI 并解除阻断，然后启用"。`brew upgrade awscli` 2.36.2 → 2.36.44；新 CLI 的 Lambda 服务模型只有 `get/put/delete-resource-policy`，没有任何公开访问阻断操作（仅一个 `PublicPolicyException`），`organizations describe-organization` 显示账号不在组织内，说明第十四检查点"账号级阻断"的判断没有依据。复现：用 root 新建探针函数 `gatu-terminal-api-urlprobe`（固定返回 204），只加 `lambda:InvokeFunctionUrl` 语句时函数 URL 同样 403；按 AWS 文档补第二条 `lambda:InvokeFunction`（条件 `lambda:InvokedViaFunctionUrl: true`，`add-permission --invoked-via-function-url`；用 `--function-url-auth-type NONE` 加该动作会被 `InvalidParameterValueException` 拒绝）后立即 204。根因：AWS 自 2025 年 10 月起要求函数 URL（含 `AuthType=NONE`）同时具备两条权限，接收器的策略只有第一条，与第七检查点 CloudFront OAC 源的双权限是同一规则。修复：用 `gatu-edge` 给 `gatu-terminal-api-csp-report` 加语句 `public-invoke`；`GET` 返回 405，样本 `POST`（`application/csp-report`）返回 204，CloudWatch `/aws/lambda/gatu-terminal-api-csp-report` 出现 `csp_violation`（`directive: img-src`、`disposition: report`）。探针函数已删除。

启用：`edge-config.json` 的 `cspReportUri` 填入接收器 URL，`render-functions.mjs` 重新渲染，`test:cloudfront` 25 用例通过，`deploy.mjs functions --execute`（`gatu-edge`）更新并发布两个函数。核对：两条分发的 `/trade/BTC` 与 `/docs` 响应都带 `content-security-policy`（1,971 字符）与指向接收器的 `content-security-policy-report-only`（2,194 字符），`/charting_library/charting_library.js` 只有图表版 CSP、无 report-only；`deploy.mjs verify` 主网 12/12、测试网 13/13（构建仍为 `cloudfront-2026-09-14-p7`，本次只改函数与配置）。

端到端：Playwright 全新上下文加载主网 `/trade/BTC`（7 个面板正常渲染），注入一张 `https://example.com/` 图片后浏览器触发 `securitypolicyviolation`（`img-src`、`disposition: report`、策略含接收器 `report-uri`），随后 CloudWatch 出现同一 `documentUrl`/`blockedUrl` 的 `csp_violation`。同一会话还收到首条真实报告：`script-src` 拦截 `eval`，来源 `assets/vendor-tanstack-router-*.js:2`；现行强制策略同样没有 `'unsafe-eval'`，说明这条在生产早已被拦截且无可见影响（页面与路由正常）。report-only 策略会报告它自己会拦截的一切，而不只是与现行策略的差集，评估第二步时按差集看。其余无报告。Biome 配置忽略 `deploy/**`，本次改动没有可检查的 TS 文件；`pnpm memory:index/check/test` 通过。探针函数已删除，未改 IAM 策略、DNS 与分发配置。

## 第十六检查点：CSP 第二步计划（2026-09-14，基于 `0f1d91e0`）

用户要求先规划内联脚本哈希。只做了调查与计划，未改运行时代码：计划写在 [docs/csp-inline-script-hashes-plan.md](../../csp-inline-script-hashes-plan.md)（方案 A 哈希随发布轮换并保留上一版集合、备选 B′ 外置脚本、B 观察 / C 强制两次发布、需要决策的事项）。调查证据（构建 `fc0fc240` 产物）：7 页各 3 段内联脚本，去重 10 个哈希；主题脚本 7 页相同，流屏障脚本含资源文件名与预渲染时间戳 `u`，每次构建都变；无内联事件处理器与 `javascript:` URL；客户端包 7 处 `createElement("script")` 都设 `src`，无 `text`/`innerHTML` 注入；`vendor-tanstack-router` 的水合入口在 `window.$_TSR` 缺失时抛错；渲染后的函数 7,689 B / 10,240 B；`gatu-edge` 有 `cloudfront:*`（发布时可 `get-function` 读线上集合）。未定位 `eval` 调用点（`grep` 在本机是 ugrep，复杂模式会报错）。

## 第十七检查点：CSP 第二步 B 阶段（2026-09-14，基于 `0810fb58`）

用户选定方案 A 与推荐决策，先做 B 阶段。实现：`scripts/collect-inline-script-hashes.mjs`（构建末尾扫描 8 个预渲染页，按 HTML 解析器看到的文本算哈希，拒绝内联事件处理器与 `javascript:` URL，写 `.output/edge/inline-script-hashes.json`；4 用例）；`security-headers.ts` 新增 `createStrictCspDirectives(scriptHashes)`，report-only 目录由它派生（`script-src 'self' https://challenges.cloudflare.com 'report-sample'` + 哈希，无 `'unsafe-inline'`、无 `blob:`）；viewer-response 模板改为目录模板加 `{FA}`/`{IMG}`/`{SCRIPT}` 三槽位在边缘拼三份策略，提交文件 5,419 B（原 7,689 B），`SCRIPT_HASHES_CURRENT/PREVIOUS` 两行留空；`function-code.mjs`（edge-config 校验、哈希写入与读回、轮换、10 KB 上限；3 用例）；`deploy.mjs functions` 发布时填哈希（CURRENT = 产物，PREVIOUS = 线上 CURRENT，旧模板没有哈希行时按空集合）写到 `.output/edge/terminal-response.js` 再发布，`sync --execute` 前用 `get-function` 核对线上策略含全部哈希，`verify` 新增"线上 7 页内联脚本哈希都在对应策略头里"；接收器摘要加 `sample`；`edge-config.json` 新增 `cspScriptHashes: "report-only"`；构建链与 CI 加入新脚本与测试。测试：`test:cloudfront` 32、脚本测试 24、vitest（`chart-asset-cache-policy`、`security-policy-docs`、`csp-report-lambda`）18、typecheck、`pnpm check` 1,360 文件通过。

发布 `cloudfront-2026-09-14-p8`（基于 `0810fb58`）：顺序 build → `functions --execute`（10 current + 0 previous）→ `lambda`（API 版本 3、接收器）→ `sync`（守卫通过）→ 两条失效 → verify。首轮浏览器覆盖（Playwright，`addInitScript` 收集 `securitypolicyviolation`；桌面 1440×900：交易页、连接弹窗、充值、限价页签、下单按钮、`/portfolio`、`/leaderboard`、`/join`、6 个文档页；移动 390×664：交易页、Markets/Account/Trade 页签、连接弹窗、`/docs`）发现每页的流屏障脚本都被 report-only 判为不匹配（`script-src-elem`、`blocked: inline`、样本 `(self.$R=self.$R||{})["tsr"]…`），CloudWatch 收到 12 条 `inline` 报告（10 个文档）。根因：流屏障序列化的路由匹配 id 含 U+0000，HTML 解析器在脚本数据里把它换成 U+FFFD，浏览器按解析后的文本算哈希而收集器按文件字节算，7 个流屏障哈希全部不认（在浏览器里用 DOMParser + SubtleCrypto 复算证实：壳 `+ZZuCaf8…`、docs `SLkQ5s/1…`）。修正：`parserScriptText()` 先归一 CR/CRLF → LF、U+0000 → U+FFFD 再哈希（新增用例），`functions --execute` 重发（10 current + 7 previous，上一版的错误哈希随轮换保留一版），约 10 s 后生效。复跑覆盖：21 步、0 条内联脚本报告、0 条其它指令报告、0 条控制台错误，只剩已知的 `eval`（12 页 × enforce/report 两条，样本 `(function anonymous(\n) {\n\n})`，即 `vendor-tanstack-router` 的 `new Function("")` 探测）；"mobile chart page"一步因选择器未匹配跳过。verify 主网 13/13、测试网 14/14（新检查：7 页 21 段内联脚本，report-only）；report-only 头 17 个哈希、无 `'unsafe-inline'`、含 `'report-sample'`，强制策略不变。CloudWatch 修正后无新的 `inline` 报告。覆盖脚本入库为 `apps/terminal/tests/browser/csp-coverage.mjs`。遗留：`verify` 与收集器共用同一实现，浏览器覆盖是唯一独立信号；C 阶段（`enforce`）待一个发布周期的报告观察；`eval` 现行策略已拦、无可见影响。

## 第十八检查点：CSP 第二步 C 阶段（2026-09-14，基于 `804de248`）

用户要求当日进入强制。门槛偏差：正式域名未切换、没有真实流量，距 B 阶段发布不到一小时，依据只有脚本化覆盖与接收器日志（05:44 修正发布后到切换前接收器 0 条报告），未等满一个发布周期；撤回是把 `cspScriptHashes` 改回 `report-only` 再 `functions --execute`。改动：`edge-config.json` `cspScriptHashes: "enforce"`，重新渲染提交的函数（`SCRIPT_HASHES_MODE = "enforce"`），`functions.test.mjs` 的策略断言按模式推导期望；覆盖脚本增加功能信号（桌面面板数、移动底部导航项数）。`test:cloudfront` 32、`pnpm check` 通过。发布：只发布函数（`functions --execute`，10 current + 7 previous，仍是构建 p8，无需同步与失效，viewer-response 对缓存命中同样执行），约 10 s 后生效。核对：两条分发 `/trade/BTC` 与 `/docs` 的强制头 2,945 字符、17 个哈希、无 `'unsafe-inline'`、无 `blob:`、含 `report-uri`，report-only 头 3,075 字符同样 17 个哈希；图表路径仍是 1,946 字符的旧策略。verify 主网 13/13、测试网 14/14（内联脚本检查报告 `7 pages, 21 inline scripts, enforce`）。浏览器覆盖（同一 21 步）：桌面 7 个面板、移动 3 个底部导航项，0 条内联脚本报告、0 条其它指令报告、0 条控制台错误，只剩 `eval`（现在 enforce 与 report 各 12 条，因为强制策略也附了 `report-uri`）。CloudWatch 切换后 24 条报告全部是 `eval`，0 条 `inline`。遗留：`eval`（`vendor-tanstack-router` 的 `new Function("")` 探测）每页产生两条报告，若日志量成问题可在接收器按样本过滤或在上游消除；D 阶段 `img-src` 收窄等真实流量；退役 EC2 时 Nitro 的 `'unsafe-inline'` 随 `routeRules` 消失。

## 第十九检查点：CSP 第二步 D 阶段（2026-09-14，基于 `6e3528c0`）

用户要求当日执行 `img-src` 收窄。依据（无真实流量）：代码扫描——应用自身的外部图片来源只有 `app.hyperliquid.xyz/coins`（`TOKEN_ICON_BASE_URL`、`HL_ICON_URL`），其余是本地 `/coins/USDC.svg`、二维码 data URL 与分享图的 blob/data；覆盖脚本扩到 32 步（新增"更多钱包"列表、市场选择器、`/vaults`、`/staking`、`/referrals`、`/api-wallet`、`/perp`、`/spot`、`/builders-perp`、现货交易对；"desktop walletconnect"与"mobile chart page"两步因选择器未匹配跳过），在收窄 img-src 仍为 report-only 时跑一遍：0 条 `img-src` 报告；接收器三小时内除我的探针外 0 条 `img-src` 报告。登录后的界面未覆盖，靠强制策略附带的 `report-uri` 观察。

实现：`edge-config.json` 新增 `cspImageSources`（与 `cspScriptHashes` 同一对取值，`function-code.mjs` 校验），模板新增 `IMAGE_SOURCES_MODE`，强制策略按两个开关拼出，任一 `enforce` 即附 `report-uri`；候选策略与强制策略逐字相同时省略 report-only 头（否则每条违规报两次）；`verify` 新增"image sources follow the edge config"（按开关所指的头检查 `img-src` 不含裸 `https:`）；测试 32 用例、`pnpm check` 通过。发布：只发布函数（仍是构建 p8，10 current + 7 previous），约 5 s 生效。核对：两条分发 `/trade/BTC` 与 `/docs` 的强制头 3,075 字符，`img-src 'self' data: blob:` 加 5 个已知主机，17 个哈希，无 `'unsafe-inline'`，含 `report-uri`，report-only 头已不再下发；图表路径仍是 1,946 字符的旧策略。verify 主网 14/14、测试网 15/15。覆盖复跑（32 步）：桌面 7 个面板、移动 3 个导航项，0 条 `img-src`、0 条内联脚本、0 条其它指令报告、0 条控制台错误，`eval` 20 条且只有 `enforce` 一种（report-only 头省略后不再重复）。CloudWatch 切换后 20 条报告全部是 `eval`。至此 ADR 0007 的两步收紧全部上线；剩余观察点：登录后界面的图片来源、`eval` 日志量。

## 第二十检查点：消除 `eval` 报告（2026-09-14，基于 `d79ac6f8`）

用户要求在上游消除 `new Function` 探测。定位：`vendor-tanstack-router` 块里唯一的 `new Function("")` 来自 Zod 4.3.4 的 `util.allowsEval`（`v4/core/util.js:150`），`$ZodObject` 构建时算 `fastEnabled = !globalConfig.jitless && allowsEval.value`（`schemas.js:901-903`），即第一个 `z.object()` 构建时探测一次并缓存；`jitless: true` 时短路不探测，这个开关就是 Zod 为禁止 `eval` 的环境准备的。客户端包里只有一份 Zod。

第一次尝试（发布 p9，基于同一提交的未提交改动）：`src/config/zod-runtime.ts` 执行 `z.config({ jitless: true })`，作为 `client-hydrate.tsx` 的第一条导入。发布后覆盖仍每页一条 `eval`：配置被打进 `client-hydrate` chunk，而该 chunk 的静态导入（`vendor-base-ui`、`vendor-tanstack-router`、`index-*`）先于 chunk 体执行，其它 chunk 里的 schema 已先构建。结论：跨 chunk 的副作用顺序不能靠入口的导入顺序，只能靠模块依赖。

第二次（发布 p10）：新增 `apps/terminal/src/lib/zod.ts` 与 `packages/hl-react/src/zod.ts`，先 `config({ jitless: true })` 再 `export * from "zod"`；终端 9 个 schema 模块与 `hl-react` 的 `legal.ts`、`agent-storage.ts` 改为经包装导入（`validated-storage.ts` 只有 `import type`，不受影响）；删除 `zod-runtime.ts` 与入口导入。`zod-jitless.test.ts`：`z.config().jitless` 为真、构建并解析对象 schema 前后 `util.allowsEval` 仍是未求值的 getter（探测未发生）、扫描两处源码目录不得直接导入 `zod` 的值。打包后包装模块落在 `vendor-tanstack-router` chunk（与 Zod 同 chunk，先于所有消费方执行）。验证：`pnpm check` 1,363 文件、`pnpm typecheck` 三包、vitest 相关 4 文件 32 用例通过。

发布 p10：build → `functions --execute`（10 current + 7 previous）→ `sync`（守卫通过）→ 两条失效 → verify 主网 14/14、测试网 15/15（Lambda 代码未变，未重发）。覆盖 32 步：0 条 `script-src` 报告、0 条其它指令报告、0 条控制台错误，桌面 7 面板、移动 3 导航项。CloudWatch：失效完成后 0 条报告（此前 20 分钟内的 20 条全部在 p9 时段）。附带观察：p9 覆盖时 `/spot` 的图表 iframe 曾尝试加载 `https://www.google-analytics.com/analytics.js`，被图表策略拦下（`script-src` 无该主机），只见于控制台、p10 未复现，属 TradingView 库行为，本次未处理。`build-meta.json` 的 `commit` 仍是构建时的 HEAD `d79ac6f8`，改动在发布后才提交。

## 第二十一检查点：关闭 TradingView 的 Google Analytics 采样（2026-09-14，基于 `cee6c813`）

用户要求处理图表 iframe 加载 Google Analytics 的问题。定位：`public/charting_library/bundles/library.f5eaeb6901219f861981.js` 在图表加载完成后执行 `if (l.enabled("14851") && Math.random() <= .02)`，插入 `//www.google-analytics.com/analytics.js` 并向 `UA-112911840-1` 发送匿名化的 pageview（2% 采样）；`14851` 是库内部 feature 注册表（`bundles/7346.*.js` 模块 56570）里的合法名字，iframe 启动时把 `urlParams.disabledFeatures` 逐个 `setEnabled(name, false)`，所以 `disabled_features` 能关掉它。复现：Playwright `addInitScript` 把每个 frame 的 `Math.random` 固定为 0，p10 线上图表 iframe 每次都插入 GA 脚本（被图表策略拦下，仅控制台报错）。

修复：`config/chart.ts` 的 `CHART_DISABLED_FEATURES` 加入 `"14851"`（附注释）；`docs/runtime-guardrails.md` §4 新增规则（保留该 flag、任何策略不得放行 `www.google-analytics.com`、库升级后用探针复查）；探针入库为 `apps/terminal/tests/browser/chart-analytics-probe.mjs`（强制采样分支，检查 iframe 收到的 `disabledFeatures` 含 `14851`、无 GA 脚本与 `GoogleAnalyticsObject`、canvas 已绘制，不满足即非零退出）。中途一次误判：用 `preview_start` 起的开发服务器实际运行在主检出（cwd `gatu/apps/terminal`），探针看到的是未改的旧列表，已停掉并改为发布后在线上验证。`pnpm check`、终端 typecheck 通过；无测试钉住该列表。

发布 p11（基于 `cee6c813`）：build → `functions --execute`（10 current + 7 previous）→ `sync`（守卫通过）→ 两条失效 → verify 主网 14/14、测试网 15/15。探针（线上 p11）：图表 iframe `flagDisabled: true`、`analyticsScript: false`、`analyticsObject: false`、11 个 canvas、0 条控制台错误。覆盖 32 步：0 条违规、0 条控制台错误、桌面 7 面板、移动 3 导航项。Lambda 未变未重发。

## 后续与替代关系

- 按 [deploy/cloudfront/README.md](../../../deploy/cloudfront/README.md) 执行资源创建前，先用 root 建受限 IAM 身份；创建后用 `deploy.mjs verify` 与 `--resolve` 在 DNS 切换前验证；切换稳定一个发布周期后退役 EC2，并把 `deploy/deploy.sh` 与 Caddy/systemd 文件转为历史资料。
- 配对票据在无服务器宿主上需要 DynamoDB 条件写实现后才能启用；`/api/leaderboard` 可考虑 CloudFront 缓存以减少 Lambda 调用。
- 旧路径 `POST /client-error-report` 别名保留一个发布周期后删除。
- 壳 head 目前带 `/trade` 的标题与 `canonical`，需要中性化或在 CDN 层禁止缓存壳。
- 配对票据在多实例前迁到共享 CAS+TTL 存储，按部署手册既有要求执行。
- 下一次接手先看 `docs/adr/0005-spa-static-shell.md`、`apps/terminal/vite.config.ts`、`scripts/serve-spa-static.mjs`。
