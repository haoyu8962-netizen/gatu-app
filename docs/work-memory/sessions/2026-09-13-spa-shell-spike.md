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

## 后续与替代关系

- 按 [deploy/cloudfront/README.md](../../../deploy/cloudfront/README.md) 执行资源创建前，先用 root 建受限 IAM 身份；创建后用 `deploy.mjs verify` 与 `--resolve` 在 DNS 切换前验证；切换稳定一个发布周期后退役 EC2，并把 `deploy/deploy.sh` 与 Caddy/systemd 文件转为历史资料。
- 配对票据在无服务器宿主上需要 DynamoDB 条件写实现后才能启用；`/api/leaderboard` 可考虑 CloudFront 缓存以减少 Lambda 调用。
- 旧路径 `POST /client-error-report` 别名保留一个发布周期后删除。
- 壳 head 目前带 `/trade` 的标题与 `canonical`，需要中性化或在 CDN 层禁止缓存壳。
- 配对票据在多实例前迁到共享 CAS+TTL 存储，按部署手册既有要求执行。
- 下一次接手先看 `docs/adr/0005-spa-static-shell.md`、`apps/terminal/vite.config.ts`、`scripts/serve-spa-static.mjs`。
