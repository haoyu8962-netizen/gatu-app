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

## 第二十二检查点：加载顺序审查（2026-09-14，基于 `2312a496`，线上 p11）

用户问新架构的加载顺序与是否加载了无关代码。方法：新增 `apps/terminal/tests/browser/load-order-audit.mjs`（Playwright 全新上下文，记录资源时序、绘制里程碑、V8 脚本覆盖率与"下载了却从未执行"的脚本），对主网分发跑桌面 `/trade/BTC`、移动 `/trade/BTC`、桌面 `/portfolio`、桌面 `/docs` 各一次冷加载（单样本，本机直连，TTFB 抖动 195–1,279 ms）；再对 p11 产物做 chunk 归属与壳预加载清单分析。

顺序（桌面交易页样本）：TTFB 476 → 壳解析：主题内联脚本、`styles.css`、两款字体与 85 个静态 `modulepreload` 在 495–498 ms 内同一波发出（最大：`index-Bs6QSD5q` 407 KB gz、`vendor-tanstack-router` 318 KB、`trade-terminal-page` 108 KB、`vendor-base-ui` 87 KB、`client-hydrate` 53 KB），图表入口 `preload` 同波；FCP 732（等样式）、DCL 668、load 811 → 引导入口 `index-DND1kT7L`（4 KB）555 ms 到达，但它与 `early-prefetch`、`geo-prefetch` 在打包后都静态导入 `vendor-tanstack-router`（`config/layout`、`app-route-surface`、`api-paths`、`config/app`、mobile-sync 片段等纯配置模块被 Rollup 并进了 1.16 MB 的 vendor 兜底 chunk），所以要等 vendor 求值完才执行：`/api/geo` 906 ms 才发出，桌面面板 14 个 `modulepreload` 与图表 iframe 4 个 `prefetch` 也在 907 ms 才追加，比 chunk 到达晚约 270 ms → 水合 → `ClientRuntimeGate` 挂载钱包运行时（`providers/root.tsx` 在模块求值时就 `import("client-root")`，chunk 本就在壳预加载里）→ Privy 初始化（`auth.privy.io/api/v1/apps` 1,339 ms，随后 Privy 自身遥测 `analytics_events` 2,206 ms）→ 图表 iframe 1,740 ms 创建（`library.js` 命中 prefetch 缓存）。加载态链：预渲染骨架 → 水合保留终端骨架（`getHydrationRouteSurface`）→ `ClientRuntimeGate` fallback → `AppRuntime` 等 `useClientRuntimeReady` → `I18nReadyGate`，四道门用同一个骨架，无闪烁，但真实面板要等钱包运行时 chunk 求值与 Privy Provider 挂载，未登录用户也不例外。

无关代码：(1) 桌面交易页下载 102 个脚本 2.34 MB gz，几乎全部执行，但已执行 chunk 里大量代码启动时没用到——`index-Bs6QSD5q`（Privy/Coinbase/WalletConnect 等钱包 SDK，1,497 KB 原始）80% 未用、vendor 兜底 chunk 59%、`use-global-modal-store`（实为与钱包 UI 合并的共享 chunk，470 KB）67%、`account-mode-modal`（账户历史/余额/资金历史等面板的共享 chunk，287 KB）94%、`trade-terminal-page` 60%、`vendor-base-ui` 74%、`use-email-embedded-wallet`（邮箱钱包上手 + `bundler` 47 KB）73%，前 8 个 chunk 合计约 3.1 MB 原始未使用；原因是这些交互后才需要的模态、对话框、历史页签、CSV 导出（11 KB）、`testnet-banner`（48 KB，主网也加载）、`position-close-dialog-ui`（45 KB，92% 未用）、`token-selector-popup`（38 KB）都是静态导入，进了静态启动闭包并被壳预加载。(2) 仪表盘路由（`/portfolio`）下载了 971 KB gz 从未执行的代码：壳的静态清单是路由无关的（交易页闭包 108 KB + 面板），而引导块的表面预加载不看路由面，桌面面板 14 个块与图表 iframe 4 个文件（`library.js` 753 KB gz）在仪表盘上也被追加。(3) 文档页 14 个脚本 534 KB gz：vendor 兜底 chunk（69% 未用）、`vendor-base-ui`（84%）、`vendor-icons` 43 KB、`client-hydrate` 52 KB、`vendor-tanstack-query`（94%），法务页为了水合与主题切换加载了整套运行时。(4) 移动交易页 85 个脚本 1.49 MB gz，未下载桌面块，未用比例与桌面相同。(5) 预加载了但未执行的只有 0 KB 的 `trade.index` 路由块（`charting_library.js?v=` 的"未执行"是审计脚本按查询串匹配的假象）。

建议（未实施，等用户决定）：A. 用 `manualChunks` 把引导闭包（`client.ts` 的两条静态依赖、`early-prefetch`、`geo-prefetch`、`surface-preloads`、`config/layout|app-route-surface|api-paths|document-routes`）固定成独立小 chunk，让地区预取与表面预加载不再等 1.16 MB vendor 求值（预计提前约 250 ms），并给预算脚本加"引导 chunk 不得导入 vendor"的断言；B. `startEarlyPrefetches` 按 `getAppRouteSurface` 只在终端路由追加桌面面板与图表预取，仪表盘少下载约 970 KB；C. 把交互后才需要的模态/对话框/历史页签/邮箱上手/CSV 导出改为 `createLazyComponent` 或按需 `import()`，并把 `testnet-banner` 按网络条件懒加载，缩小静态闭包与壳预加载清单（预算脚本会给出新的基线）；D. 架构级：让终端在钱包运行时挂载前就渲染行情/图表/订单簿（Provider 边界下移），未登录首屏不再等 1.5 MB 的钱包 SDK 求值——改动大，需另立设计；E. 文档页考虑不水合或用更轻的入口。另记：Privy SDK 启动时向 `auth.privy.io/api/v1/analytics_events` 发遥测，属 SDK 行为，未处理。

## 第二十三检查点：首次打开的"空格子"状态与官方站对比（2026-09-14，线上 p11 vs app.hyperliquid.xyz）

用户贴出首次打开交易终端时的截图（只有顶栏 logo 与空的网格框）并要求调试官方站为何"瞬间全部加载"。工具：`tests/browser/first-paint-race.mjs`（导航开始后 250–5,500 ms 的定时截图与 DOM 标记：可见文本量、价格样式数字、按钮、canvas、iframe、`.react-grid-item`）与 `tests/browser/ws-race.mjs`（CDP 记录 WebSocket 建立、订阅与首帧时刻）。均为同机单样本冷加载。

我们的时间线（`/trade/HYPE`）：TTFB 505、FCP 784（壳 + 样式）；250–1,042 ms 画面就是截图里的样子——预渲染的 `AppShellSkeleton` 只有网格边框，正文 15 个字符；1,335 ms 真实面板出现（658 字符、30 个按钮、7 个网格项、"Connect Wallet"，顶栏显示"Connecting…"，行情列为"-"，订单簿空）；1,603 ms 市场头部有价格（20 个数字）但订单簿仍空；2,036 ms 全部数据（88 个数字），图表 iframe 1.6 s 创建、仍显示 logo 加载态。WebSocket：801 ms 就打开了第一条到 `api.hyperliquid.xyz/ws` 的连接，但第一批订阅 1,172 ms 才发（等 `ClientRuntimeGate` 挂完钱包运行时与 Provider），`l2Book` 首帧 1,353 ms、`allDexsAssetCtxs` 1,522 ms（229 KB）、`spotAssetCtxs` 1,610 ms（304 KB，两者 6 s 内各来 2 次）、`activeAssetCtx` 1,650 ms；6 s 内收到 584 K 字符。

官方站：HTML 2 KB，TTFB 333，FCP 1,084（比我们晚）；250–500 ms 整页空白（连顶栏都没有）；750 ms 只有顶栏与"Connect"按钮（111 字符）；1,300 ms 仍只有顶栏（公告弹层开始出现）；1,618 ms 整个终端一次出现且带数据：订单簿满、价格、持仓表"No open positions yet"，图表区仍是 logo 加载态，此后不再变化。单一 WebSocket 连到 `api-ui.hyperliquid.xyz/ws`，1,191 ms 打开，1,358 ms 一次发出 8 条订阅（`l2`、`activeAssetData`、`activeAssetCtx`、`webData3`、`pac`、`outcomeMetaUpdates`、`sac`、`fastAssetCtxs`），1,433–1,635 ms 首帧到齐，6 s 内只收 151 K 字符（`pac` 53 K、`sac` 40 K 代替我们的 533 K 全量资产快照）。它的 `index` 主块 397 KB gz 以同步 `<script type=module>` 加载，`charting_library.js` 是阻塞脚本，59 个 JS 共 2.0 MB。

结论：两站到"内容全部可用"的时刻相近（我们 1.3 s 出面板、1.6–2.0 s 数据齐；官方 1.6 s 一次到齐），差异在中间帧：官方从空白直接跳到带数据的完整页面，没有任何骨架，用户感知为"瞬间"；我们先画一个只有边框的空格子（0.78–1.3 s），再画空面板与"-"占位，再逐个订阅填数，三段可见的等待被感知为"加载状态"。造成三段的原因：(1) 壳里预渲染的是空骨架而不是终端的真实框架（顶栏导航、收藏栏、市场头部、面板标题/页签、下单表单控件）；(2) 真实面板和行情订阅都在 `ClientRuntimeGate` 之后，要等钱包运行时求值与 Privy/Wagmi Provider 挂载，连接已在 801 ms 就绪却到 1,172 ms 才订阅；(3) 启动就订阅 `allDexsAssetCtxs` 与 `spotAssetCtxs` 两个全量快照（533 KB JSON，每 3 s 重发）在主线程解析，且订单簿在 `l2Book` 到达（1,353 ms）后仍要等其它数据才渲染；(4) 顶栏在未登录时显示"Connecting…"而官方直接显示"Connect"。

可选处理（未实施，等用户决定）：P1 把预渲染壳换成终端真实框架（占位值为"-"），FCP 那一帧就像最终页面；P2 把 `TradeTerminalPage` 与行情订阅移到钱包运行时门之前，Provider 边界下移到依赖钱包的组件（即加载顺序审查的建议 D），预计订阅提前约 370 ms；P3 启动只订阅当前市场与轻量频道，全市场快照延后到首屏之后或改用更轻的频道（需核实公开 API 是否提供 `pac`/`sac`/`l2`）；P4 查订单簿为何在首帧到达后仍延迟渲染；P5 未登录时顶栏不显示"Connecting…"。

## 第二十四检查点：首屏框架（P1）与 Connect Wallet 即时显示（P5）（2026-09-14，基于 `31e644b6`）

用户选定 P1 与 P5。P1：`AppShellSkeleton` 从空网格改为终端的真实框架——`DesktopGridLoadingSurface` 新增 `renderPanel`，七个面板分别填入收藏栏（星标）、市场头部（币种占位、Mark/ORACLE/24h Change/24H VOL/OPEN INT/FUNDING 各 `-`）、图表（居中品牌标）、订单簿（Order Book/Trades 页签、Price/Size/Total 列头、Spread 行）、下单面板（Margin/Leverage/Account 选择器、Market/Limit/Advanced 页签、Long/Short、Available、Size、滑杆、Reduce Only/TP/SL、Connect Wallet、六行汇总）、账户表页签、账户概览（Deposit/Withdraw、Account Summary 三行）；壳外再画顶栏（导航八项、Connect Wallet、主题/语言/设置图标）与页脚（状态点、⌘K、五个链接、版本）；移动壳画市场栏、下单表单与订单簿分栏、账户页签、三项底部导航。全部是惰性标记（无 `button`/`nav`/链接/输入框/动画，整体 `aria-hidden`），启动占位契约测试不变；标签为英文源文（不经 Lingui），原因与取舍记入 ADR 0005 决策 13。新增 `app-shell-frame.test.tsx`（桌面标签齐全、无数字、七面板各有内容、无可聚焦元素、移动端 Connect Wallet 与三页签）。壳 `_shell.html` 19 KB → 41 KB 原始（gzip 后随资源一起在 8 KB 级），预算：静态启动闭包 -12.5 KB 于基线，总量 -89 KB。

P5：`lib/wallet/privy-session-hint.ts` 检查 Privy 本地存储的会话键（`privy:token`、`privy:refresh_token`、`privy:id_token`，键名以已安装 SDK 3.30.0 的 `CUSTOMER_ACCESS_TOKEN_STORAGE_KEY` 核实；SDK 对未登录访客也会写 `privy:caid`/`privy:connections`，所以不能按前缀判断）；`user-menu.tsx` 在 Privy 未就绪时只有存在会话键或初始化恢复到期才显示 Connecting...，否则直接显示 Connect Wallet，点击打开的 `WalletModal` 自己等 `ready` 再启动 Privy。`user-menu.test.tsx` 补两条用例并在 `beforeEach` 清空 localStorage；原有等待用例改为先写入会话键。相关契约测试（钱包/上手/布局 9 文件 144 用例、骨架与用户菜单 15 文件 192 用例）、typecheck、`pnpm check` 通过。

发布 p12（基于 `31e644b6`，首版框架）与 p13（同一提交，修正市场指标与下单选择器标签的大小写，与真实页面一致）：均按 functions → sync → 失效 → verify，主网 14/14、测试网 15/15；覆盖 32 步 0 违规、0 控制台错误。首屏逐帧（p12，同机单样本，TTFB 221）：首绘约 0.8 s 时页面已是完整框架（680 字符文本，含 Connect Wallet、Order Book、账户页签），1.6 s 真实面板（30 个按钮、7 面板；顶栏此时直接是 Connect Wallet 而不是 Connecting...），2.0 s 数据齐。p13 复测两次遇本机网络抖动（TTFB 3.3 s 与 9.2 s），框架仍在首绘时完整出现并在等待期间保持，属环境噪声，未再取样。截图对照：框架与真实页面的几何一致，剩余差异是框架里币种/数值为占位、真实页面收藏栏有市场药丸。

## 第二十五检查点：P2——启动路径去 Suspense 化（2026-09-14，基于 `5b61a3c3`）

用户选定 P2（第二十三检查点的"真实面板与行情订阅提前到钱包运行时门之前"）。定位：新增 `tests/browser/boot-milestones.mjs`（Playwright + CDP，同机冷缓存单样本：TTFB/FCP、路由与 React 水合、`app-shell-fallback` 消失、`data-terminal-loading-workspace`/`desktop-terminal-surface`/`.react-grid-item`/订单簿容器/图表 iframe 的出现时刻、关键 chunk 到达、目录与 `/api/geo` 请求、`__terminal_render_profile` 各面板首次提交、长任务），p13 线上健康样本：水合完成 509 ms → 表面/顶栏/网格 913 → 图表 941，而目录请求 467–729 早已回来，CPU 采样显示这段主线程几乎空闲。根因是 React 的 Suspense fallback 节流（`FALLBACK_THROTTLE_MS = 300`：重试车道上、树里仍有 fallback 的渲染要推迟到上一次 fallback 提交后 300 ms 才提交），而启动链每一级都是 `React.lazy`：`ClientRuntimeGate` 的钱包运行时、`TopNav` 的 `UserMenu`、工作区五个面板、`ChartPanel` 里的 TradingView、`PositionsPanel` 默认页签、页脚、根覆盖层，所以水合后先空等 300–400 ms，面板再各等 200–560 ms。顺带发现：CPU 采样把一段约 1.2–1.5 s 的长任务归到 Privy iframe 内 Cloudflare `jsd` 脚本（无头浏览器里同进程执行），TradingView 库求值约 100 ms，均与本项无关、未处理。

实现（决策记入 ADR 0005 决策 14）：(1) `providers/root.tsx` 的 `ClientRuntimeGate` 去掉 `React.lazy`/`Suspense`：模块求值时对非文档路由提前 `import("client-root")`，用 `useSyncExternalStore` 订阅加载结果（服务端快照为空；水合前或未加载时渲染 fallback；加载失败在渲染时抛给错误边界），加载完成即同步切换。(2) 新增 `lib/trade/trade-route-boot.ts`：`trade`、`perp`、`spot` 与三个 `builders-perp` 路由的 `beforeLoad` 调 `bootTradeRoute(queryClient)`，在启动市场目录请求的同时预解析根覆盖层与 `TradeTerminalPage.preloadTradeTerminalSurface()`（`GlobalModals`；桌面宽度再解析 `DesktopTerminalSurface` 的页脚、顶栏 `UserMenu`、五个工作区面板、`TradingViewChart`、`PositionsTab`，`MOBILE_MEDIA_QUERY` 命中时跳过桌面部分），TanStack `lazyRouteComponent` 与 `createLazyComponent` 解析后同步渲染。(3) 根覆盖层 `Toaster`、`FundsActionRecoveryHost` 移到 `components/app-runtime-overlays.tsx`（`DocumentOverlays`/`AppRuntimeOverlays`），随 `preloadAppRuntimeOverlays()` 预解析。(4) `terminal-loading-workspace.tsx` 的目录加载态改用 `renderDesktopPanelFrame`，与壳同帧。测试：新增 `trade-route-boot.test.ts`；`root-provider-split.test.ts` 改为断言 `useSyncExternalStore` 门与覆盖层模块；`responsive-panel-layout.test.ts` 跟进加载态面板类名。引用被改模块的 37 个套件：36 个通过（459 例），`desktop-positions-panel-shell.test.tsx` 18 例失败是 `@/lib/hyperliquid` mock 缺 `useInfo` 的基线红，与本次改动无关；`biome check` 21 个文件、typecheck 通过。预算：`trade-terminal-page` 面 gzip 123,242 B，比基线 119,207 多 4,035 B、超允许值 35 B（p13 已 +3,744，本次预解析链再 +291），按 `docs/terminal-performance-baseline.md` 的重新基线规则把 `check-client-bundle-budget.mjs` 该面基线改为 123,242（允许增量仍 4,000）。重新基线依据：worktree 干净构建 `GATU_RELEASE_ID=cloudfront-2026-09-14-p14 pnpm build`（本机 Node 22.13.0 / pnpm 10.21.0，不是 CI 钉住的 Node 22.15.0，压缩差异由允许增量覆盖），预算脚本输出：客户端总量 3,065,681 gz（-89,026 于基线，最大块 `index-Bs6QSD5q` 434,352 gz）；静态启动闭包 74 个资源（6 个路由预加载、1 个运行时脚本、3 个语义入口）1,558,084 gz（-12,137）；移动运行时增量 11 个资源 111,624 gz（+1,044，含静态共 85 个 1,669,708）；桌面运行时增量 25 个资源 196,958 gz（+4,970，含静态共 99 个 1,755,042）；其余具名面均在限额内。

发布 p14（`GATU_RELEASE_ID=cloudfront-2026-09-14-p14`；`build-meta` 的提交号仍是 `5b61a3c3`，因为构建时 P2 改动尚未提交）：`functions --execute`（本次 10 个内联脚本哈希，线上策略全部允许）→ `sync --execute` 第一次在 immutable 资源阶段因本机代理 `127.0.0.1:6152` 拒连、两个 TradingView 语言包上传失败而中止，重跑成功（11 个对象上传，`_shell.html`/`build-meta.json` 与本地一致）→ 两个分发 `/*` 失效并等待完成 → verify 主网 14/14、测试网 15/15（测试网这次 `/api/geo` 判为 US/blocked，是本机代理出口所致的环境差异）。CSP 覆盖走查（`csp-coverage.mjs`，主网）32 步 0 违规、0 控制台错误。

线上计时（`boot-milestones.mjs`，主网 `/trade/HYPE`，两次冷加载，网络较快的第二次为主）：TTFB 263、FCP 464；水合完成 598 → fallback 消失、顶栏、加载态工作区、表面**同为 598**（p13：509 → 913，间隔 404 ms → 0）；目录请求 541–840 → 真实网格、订单簿容器、图表 iframe 同在 905（目录到达后 65 ms，p13 为 184 ms）；面板首次提交：顶栏 585、工作区 847、图表 878、持仓表 931、订单簿 1,267；Privy iframe 1,351（p13 1,483）；`/api/geo` 445–840。第一次取样网络慢（启动 chunk 1,141 ms 才到齐）：水合 1,270 → 表面 1,362（+92，含一次 66 ms 长任务）→ 目录 1,628 回来后网格 1,688。两次取样各有一段 1.2–1.5 s 的长任务（2.1 s/3.0 s 起），即上面归到 Privy iframe 的那段。绝对值仍受本机网络抖动主导，只看间隔。

剩余：订单簿剖析轨道的首次提交仍比网格晚约 360 ms（P4 未做）；启动仍订阅 `allDexsAssetCtxs`/`spotAssetCtxs` 全量快照（P3 未做）；Privy iframe 的长任务未处理。

## 第二十六检查点：P4——订单簿与网格同帧（2026-09-14，基于 `e91ad6ea`）

用户选定 P4（第二十三检查点："查订单簿为何在首帧到达后仍延迟渲染"）。先更正第二十五检查点的一个数字：那里写的"订单簿剖析轨道首次提交 1,267"来自 `render-profile` 只保留最近 30 条样本的环形缓冲（订单簿 6 s 内提交 42 次，`recent[0]` 已不是首次），不是真实首次提交；本检查点起 `render-profile.tsx` 记录 `firstCommitTime`，`boot-milestones.mjs` 改用它并新增 `bookData`（首个 `[data-orderbook-price]`）标记。

定位工具：新增 `tests/browser/orderbook-race.mjs`（Playwright + CDP：`webSocketCreated`/`WillSendHandshakeRequest`/`HandshakeResponseReceived`/帧收发，用握手事件的 `wallTime` 把 CDP 单调时间对齐到页面 `performance.timeOrigin`；DOM 每 5 ms 轮询网格、订单簿容器、占位行、首个带价格的行；加载 8 s 后再从页面串行开 3 条探针 socket 计时；`NO_PROXY=1` 加 `--no-proxy-server`）。主网 `/trade/HYPE` 冷加载 10 次（7 次默认 + 3 次 no-proxy）：网络正常的 5 次里，网格到首个带价格的行 243–370 ms，拆分为面板挂载→池化 socket 开始连接 35–60 ms、TCP/TLS 连接 54–250 ms、订阅发出→首帧 73–164 ms、首帧→DOM 3–68 ms——根因是 `OrderbookPanel` 挂载后才第一次向 `l2Book` 传输池要连接（ADR 0003 的隔离设计让全簿走独立 socket），主 socket 早已打开却帮不上。另外 5 次里池化 socket 创建后 1.0 s / 2.3 s / 2.6 s 才发握手、或 8 s 内根本没发（主 socket 也偶发 1.75 s）；`--no-proxy-server` 无效，因为本机 DNS 把所有主机解析成 198.18.x（代理客户端 fake-ip/TUN），流量仍经代理；同一页加载后串行开的探针 socket 在正常时段 160–290 ms 打开、在坏时段 1.0–1.3 s，说明卡顿是本机代理的连接建立抖动而非 Chromium 节流或应用逻辑——真实用户付的是一次连接加一次往返，但同样在网格之后。

实现（ADR 0003 追加"Warm-up and freshest-frame replay"）：(1) `packages/hl-react/src/subscriptions/l2-book-transport-pool.ts` 按物理传输 + payload（币种/nSigFigs/mantissa/fast）记住最新一帧及其 `performance.now()` 接收时间；新订阅者在传输已确认订阅、且自己尚未收到实时帧时，收到 ≤5 s 内的最新帧一次（`L2_BOOK_REPLAY_MAX_AGE_MS`）；该 payload 的最后一个租约释放或传输关闭即丢弃，跨分组/网络/币种不可能命中（键里就没有）。(2) `clients.ts` 新增 `warmL2BookSubscription(isTestnet, params, ttlMs = 15 s)`：经同一个 `SubscriptionClient` 与传输池用空监听器订阅（payload 因此与面板完全一致，SDK 的订阅管理器按 payload 去重，面板的 `subscribe` 立刻确认），到期或提前释放时只摘掉自己的监听器。(3) `apps/terminal/src/lib/trade/orderbook-boot.ts`：`getBootOrderbookCoin(pathname)` 从 `/trade/*` 取 perp、builder-perp 与 `@index` 现货名（它们就是 API 币种；`PURR/USDC` 这类交易对名要等目录，跳过），`/perp`、`/builders-perp[/dex]` 取持久化的已选市场（`use-market-store.ts` 新增 `getStoredSelectedMarket`，builder 需与路由 dex 前缀一致）；`bootOrderbook` 单槽持有预热租约、新导航替换旧租约；`bootTradeRoute(queryClient, pathname)` 在六个交易入口路由的 `beforeLoad` 里调用（路由传 `location.pathname`）。副作用：`getSubscriptionClient` 在 `beforeLoad` 就创建了主 WebSocket 传输，主 socket 也随之提前。测试：传输池新增 4 例（回放最新帧、跨币种与超时不回放、等待期间已收实时帧则不重复、租约释放后遗忘）、`orderbook-boot.test.ts` 5 例（jsdom）、`trade-route-boot.test.ts` 与 `home-route.test.ts` 跟进签名；`biome check` 17 文件、`pnpm typecheck`（hl-react/ui/terminal）通过；全量 vitest 555 文件：13 个红文件中 9 个是基线红、`global-settings-slippage-effective` 单跑仍红 2 例（基线红，第二十五检查点那次通过属偶然）、`chart-build-assets`/`establish-connection-modal`/`chart-store` 单跑通过（并发伪影）。预算（p15）：静态启动闭包 1,558,523 gz（比 p14 多 439 B，仍低于基线 11,698）；`trade-terminal-page` 123,238；客户端总量 3,065,599（-89,108）。

发布 p15（`GATU_RELEASE_ID=cloudfront-2026-09-14-p15`，`build-meta` 提交号 `e91ad6ea`，P4 改动构建时未提交）：`functions --execute`（10 个哈希）→ `sync`（1,585 个对象，0 失败，`_shell.html`/`build-meta.json` 一致）→ 两条分发 `/*` 失效并等待完成 → verify 主网 14/14、测试网 15/15 → `csp-coverage.mjs` 32 步 0 违规、0 控制台错误。

线上计时（`orderbook-race.mjs` 4 次）：池化 socket 现在与主 socket 同时在引导阶段创建（469/470/515/1,169 ms，此前在网格之后），socket 一打开就发 `l2Book` 订阅（590–1,337 ms），首帧 674–1,413 ms，全部早于网格（811–1,596 ms）；网格→首个带价格的行 0 / 29 / 0 / 0 ms（p14 为 243–370）。29 ms 那次是代理握手花了 138 ms、首帧 832 ms 比网格 811 晚 21 ms，回放仍生效。主 socket 的 `allDexsAssetCtxs` 等订阅也提前到 636–685 ms（p14 样本 868–1,184）。`boot-milestones.mjs` 2 次：`bookData` 与 `grid` 同为 1,021 / 868 ms；水合 chunk 到达→顶栏首次提交 +160 / +114 ms，p14 样本 +113，无系统性变化；订单簿剖析轨道真实首次提交 992 / 849，比工作区晚约 40 ms，是网格内面板的提交顺序，数据当时已在。

剩余：移动端紧凑簿走 `l2` 增量流（`useOrderbookFeed`），未预热；`/trade/BASE/QUOTE` 现货交易对要等目录，沿用旧时序；本机代理造成的连接卡顿与应用无关；P3（启动只订阅轻量频道）未做。

## 第二十七检查点：P3——全市场行情改用紧凑频道 `pac`/`sac`（2026-09-14，基于 `b3ac3a76`）

用户选定 P3（第二十三检查点："启动只订阅当前市场与轻量频道，全市场快照延后到首屏之后或改用更轻的频道，需核实公开 API 是否提供 `pac`/`sac`/`l2`"）。核实：新增 `tests/browser/asset-ctx-channels-probe.mjs`（CDP 抓官方站冷加载发出的订阅原文与各频道首帧，再用 Node 的 `WebSocket` 把同样的订阅分别发给 `wss://api.hyperliquid.xyz/ws` 与 `wss://api-ui.hyperliquid.xyz/ws`）：官方站 8 条订阅一次发出（`l2`、`activeAssetData`、`activeAssetCtx`、`webData3`、`pac`、`outcomeMetaUpdates`、`sac`、`fastAssetCtxs`）；公开主机对 `pac`/`sac`/`fastAssetCtxs`/`webData3`/`outcomeMetaUpdates` 全部回 `subscriptionResponse` 并推送数据，`pac` 每帧约 15–17 KB、`sac` 约 20–30 KB、间隔约 3.75 s，`fastAssetCtxs` 约 4.9 KB、每秒一帧；`data` 是 base64 字符串，Node `zlib.inflateRawSync` 可解（与 SDK `fastAssetCtxs.js` 注释"base64 + raw DEFLATE"一致）。解压后：`pac` 是 `[[dex, ctx[]], ...]`（11 个 dex，主 dex 234 条；与同时订阅的 `allDexsAssetCtxs.ctxs` 比对，dex 顺序、每个 dex 的长度一致，234 条 `prevDayPx` 逐索引 0 处错位，`midPx` 为 null 的 56 个位置也一致），字段比原频道少 `premium`、`impactPxs`；`sac` 是按现货对名索引的对象（1,463 个键：`@` 556、`#` 906、`PURR/USDC` 1），覆盖 `spotAssetCtxs` 全部 819 个 coin 与 `spotMeta.universe` 全部 327 个名字，按 coin 比对 `prevDayPx` 0 处不一致，字段少 `coin`、`totalSupply`。代码里没有读 `premium`/`impactPxs`，`totalSupply` 来自 token 详情请求；应用现货的 `ctxIndex` 就是 `pair.index`（327/327 按 index 命中，按数组位置只有 71），所以改按名字查找不改变结果。线上原来每 3–4 s 收 115 KB + 152 KB 明文；`l2` 增量流早已在用（`subscriptions/l2.ts`）。

实现（ADR 0008）：(1) hl-react 新增 `subscriptions/compact-asset-ctxs.ts`：复用 `inflateL2CompressedPayload`（限额 512 KB base64 / 4 MB 解压）串行解码、校验形状，第一帧失败即退订并经 `onError` 上报（与传输失败同路径）；`subscriptions/compact-subscription-client.ts` 的 `CompactSubscriptionClient extends SubscriptionClient` 加 `pac`/`sac`，`getSubscriptionClient` 返回它，`types/clients.ts` 的 `SubMethod` 改从它推导，`provider-context`/`useClients`/`useSubscription` 跟进类型；`reliability.ts` 给两条频道 1 MB 载荷上限与 20 s 陈旧阈值；`index.ts` 导出。(2) `useMarketsInfo`：`canUseL2Decompression()` 为真时订阅 `pac`/`sac`，否则原频道；`pac` 直接替代 `allDexsAssetCtxs.ctxs`，现货统一为按市场名索引的对象（原数组按 `coin` 转换），`spotMarketsInfo` 用 `market.name` 查；任一紧凑流出错即本会话回退并 `reportClientError(kind: "market_ctxs_compact_fallback")` 一次（`report.ts` 加入该 kind）；会话统计缓存改存新形状，键 `hl-mkt-stats-v1` → `v2`。(3) 测试：新增 `compact-asset-ctxs.test.ts`（解码形状、拒收非字符串/非 JSON/错形状、顺序、失败退订）；`use-markets-info-subscriptions.test.tsx` 改为断言五条订阅的最新参数、按 dex 索引与市场名取值、回退并只报一次；`hyperliquid-types`/`hyperliquid-hooks` 覆盖新方法；`account-activity-feed-owner`/`fast-asset-ctxs-subscription`/`use-sub` 的客户端类型改为 `CompactSubscriptionClient`。`biome check` 19 文件、`pnpm typecheck` 通过；全量 vitest 556 文件 19 红：10 个基线红，其余 9 个（`mobile-agent-sync-route`、`orderbook-boot`、`order-submission-wiring`、`language-switcher`、`client-bootstrap-error`、`api-wallet-form`、`chart-build-assets`、`establish-connection-modal`、`tests/browser/mobile-trade-all-orders-cache`）单跑 78 例全绿，属并发伪影。预算（p16）：静态启动闭包 1,558,887 gz（比 p15 多 364 B）、`trade-terminal-page` 123,232、总量 3,066,475（-88,232）。

发布 p16（`build-meta` 提交号 `b3ac3a76`，P3 改动构建时未提交）：functions（10 哈希）→ sync（1,585 对象，0 失败）→ 两条分发失效并等待 → verify 主网 14/14、测试网 15/15 → `csp-coverage.mjs` 32 步 0 违规、0 控制台错误。

线上对比（`ws-race.mjs`，同机冷加载 6 s，单样本）：首批订阅 `pac`、`sac`、`fastAssetCtxs` 一次发出，随后 `activeAssetCtx`/`trades`/`bbo`、池化 socket 上的 `l2Book`、`candle`；6 s 收 125,552 字符（`pac` 2 帧 30 K、`sac` 2 帧 42 K、`fastAssetCtxs` 5 帧 36 K、`trades` 9 K、`bbo` 26 帧 4 K、`l2Book` 3 K），第二十三检查点是 584 K，同一次的官方站为 173 K（含 `pac` 4 帧 76 K）。新工具 `market-stats-probe.mjs` 确认 6 s 后页面由紧凑频道渲染出收藏栏三个涨跌幅、市场头部 Mark/ORACLE/24h Change/24H VOL/OPEN INT/FUNDING 与订单簿数字，0 控制台错误。`boot-milestones.mjs` 单样本：水合 564 → 表面 613 → 网格 989 → 订单簿数据 998，无回归。

剩余：`sac` 里约 900 个 `#` 前缀键不在 `spotMeta.universe`，暂不使用；解压后主线程解析量与原来同量级（90 KB + 203 KB），本项只降网络字节；紧凑流回退的实际频率靠 `market_ctxs_compact_fallback` 报告观察；第二十三检查点列出的 P1–P5 至此全部完成。

## 第二十八检查点：P1–P5 的对抗审查与修复（2026-09-14，基于 `1c734761`；修复提交 `b3437ef2`）

用户要求用 Codex（`gpt-6-astra`，`codex exec -s read-only`，`model_reasoning_effort=high`）对 `31e644b6..HEAD` 四个提交做对抗审查；提示词限定契约、已知限制与十项核查清单，要求给出级别、文件行号、场景与验证命令。审查结论：0 P0、2 P1、7 P2、1 P3（27 次只读命令，212,870 token；未运行测试或构建）。逐条复核与处置：

1. P1 `providers/root.tsx`——确认成立。加载失败只改了错误变量，`useSyncExternalStore` 的快照仍是 `null`，React 不重渲染，`throw` 到不了错误边界，页面会停在静态壳。修复：新增 `providers/client-root-loader.ts`，把加载结果发布为不可变快照对象（成功与失败都换对象），`ClientRuntimeGate` 读快照里的 `Provider`/`error`；新增 `client-root-loader.test.ts`（注入 importer 验证成功、失败、去重、失败时新快照），`root-provider-split.test.ts` 跟进。
2. P1 回放帧被当成新鲜的实时数据——部分成立。回放帧来自同一传输、同一 payload 的实时流，不是 ADR 0003 意义上的跨身份缓存；但 `useSub` 用交付时刻盖 `lastMessageAt`，会把陈旧截止推后最多 5 s。修复：池记录帧的墙钟接收时间，回放时经 `internal/websocket/frame-receipt.ts` 的 WeakMap 交给 `useSub`，`store.setSubscriptionData` 与陈旧看门狗（`staleness.markFresh(key, at)`）改用原始时间；新增用例断言回放帧带原始接收时间。
3. P2 跨币种污染回放缓存——确认成立（SDK 按频道向所有监听器广播，在方法包装层才按币种过滤）。修复：池在计入实时帧与记忆前按 `event.detail.coin` 过滤；新增两币种交错到帧的用例。
4. P2 确认前解码失败留下"active 但无数据"的订阅——确认成立。5. P2 退订不停止解码队列——确认成立。6. P2 浅层形状校验——确认成立。三项一并重写 `compact-asset-ctxs.ts`：字段级校验（十进制字符串，`midPx` 允许 null，只保留已知字段）、确认前失败让 `subscribe` 的 Promise 拒绝、退订后停止解码与回调、幂等的包装退订句柄、有界积压；复测线上时又发现原设计的一个事实错误（见下）。
7. P2 回退闩锁随 Provider 重建丢失而上报闩锁保留——确认成立。修复：`markets/market-ctxs-fallback.ts` 模块级状态（与页面会话同寿命），`useMarketsInfo` 初始化时读取；测试覆盖卸载重挂载后仍走原频道，新增 `market-ctxs-fallback.test.ts`。
8. P2 运行时加载态用英文占位——确认成立（`TerminalLoadingWorkspace` 在 `I18nReadyGate` 内）。修复：`renderDesktopPanelFrame(panelId, labels)`，加载态通过 `useLingui` 的 `t` 提供标签（复用真实面板的消息 ID，`lingui extract` 无新增 ID，六个目录只增加引用行），预渲染壳与路由 pending 骨架保持英文以维持水合一致（ADR 0005 决策 13、14 补充）。
9. P2 重新基线不合规——确认成立。处置：先把预解析链移出页面块（新 `components/trade/preload-trade-terminal-surface.ts`，页面只导出 `preloadGlobalModals`），但加载态标签翻译使页面块反而涨到 123,768 gz，仍高于旧上限 123,207，于是保留 123,242 的基线，用钉住的 Node 22.15.0（nvm）重新构建，按文档规则在 `docs/terminal-performance-baseline.md` 追加更正节（命令、提交、图谱清单 391 块、路由诊断、静态与两个运行时增量、总量）。
10. P3 文档把"发起预加载"写成"全部解析完成"——确认成立。修正 `trade-route-boot.ts` 注释与 ADR 0005 决策 14 措辞，行为不变。

发布 p17 后复测暴露的事实错误：`pac`/`sac` 只有订阅后的第一帧是全量快照，之后每帧是增量——`pac` 保持 dex 与索引结构但每个条目只含变化了的字段（约 9–10 KB base64），`sac` 只含变化了的市场与字段（约 1–1.5 KB，60–70 个键）。第二十七检查点的核实只解码了首帧。p16 把增量当全量覆盖整份状态（选中市场靠 `activeAssetCtx`，头部未受影响；收藏栏与市场选择器在增量到达并越过 5 s 节流后会缺字段），p17 的字段校验则把增量判为坏帧、触发回退并上报 `market_ctxs_compact_fallback`，线上接收器当时还不认识该 kind 而返回 400（`market-stats-probe` 与 `csp-coverage` 因此各看到控制台错误）。修复：`compact-asset-ctxs.ts` 改为累积器——首帧必须每个条目字段齐全，否则视为格式变化；后续按 dex 索引或市场名合并，回调收到合并后的视图，字段未齐的条目在视图里缺席；帧按到达顺序解码，积压超过 64 帧终止流而不跳过增量；会话缓存存视图并用视图解析器校验；Lambda 按发布顺序重新部署（`build:lambda` → `deploy.mjs lambda --function-name gatu-terminal-api`，版本 4，接收器认识新 kind）。用 vitest 把线上连续帧喂给真实解码器与累积器：4 帧 `pac` 后 519 个 perp 条目、4 帧 `sac` 后 1,497 个现货条目全部完整。ADR 0008、hl-react README、CHANGELOG 同步更正。

验证：`biome check`、`pnpm typecheck` 通过；相关套件 11 文件 134 例通过（紧凑频道 13 例、传输池新增 2 例、加载器 3 例、回退模块 1 例等）。

构建 p18（Node 22.15.0 / pnpm 10.21.0）：`trade-terminal-page` 123,761 gz（基线 123,242，+519）、静态启动闭包 1,561,249（-8,972 于基线）、客户端总量 3,070,454（-84,253）、391 块无循环静态导入；全量 vitest 558 文件在与构建并发时 16 个红文件，10 个基线红之外的 6 个（`global-modals-hip3-disclaimer`、`chart-build-assets`、`portfolio-overview`、`mobile-agent-sync-modal`、`establish-connection-modal`、`chart-store`）单跑通过（`establish-connection-modal` 在构建并发下超时，空闲时 15 例通过）。发布 p18：函数（10 哈希）→ sync（1,586 对象，0 失败）→ 两条分发失效并等待 → verify 主网 14/14、测试网 15/15。线上复测：`csp-coverage` 32 步 0 违规、0 控制台错误（p17 为 6 条 400）；`market-stats-probe` 头部六项指标、收藏栏三个涨跌幅与订单簿数字齐全，无 4xx 请求；`orderbook-race` 3 次网格→首个带价格行 0/0/0 ms；`boot-milestones` 两次：水合 672 → 表面 735 → 网格、订单簿数据、图表 iframe 同帧 1,225（网络较慢的一次 1,196 → 1,262 → 1,755）；`ws-race` 6 s 收 176 K 字符（`pac` 2 帧 31.7 K、`sac` 2 帧 42.6 K、`fastAssetCtxs` 6 帧 41.8 K、`trades` 12 帧 46 K——取样落在成交活跃时段），紧凑频道部分与 p16 一致。p17 到 p18 之间线上处于"字段校验拒绝增量 → 回退原频道 → 上报被 400 拒绝"的状态，行情显示靠原频道正常。

未改动：审查提出但保留原样的只有 P1 第 2 项里"回放帧不得可交互"的诉求——回放帧带原始接收时间后，其新鲜度与一直在线的订阅者完全相同，不属于契约里的缓存行，ADR 0003 已写明依据。

## 第二十九检查点：9 月 13–14 日提交的三路对抗审查与修复（2026-09-15，基于 `38bfe51a`；修复提交 `0b8f31d7`）

用户要求对 9 月 13、14 日的提交继续用 Codex 最新模型做对抗审查；分支没有 PR，因此按提交范围审查。三路并行只读审查（`gpt-6-astra`，`codex exec -s read-only`，`model_reasoning_effort=high`，提示词禁止修改与提交）：A 基础设施与 CSP（17 个提交 `2c44be20..2312a496`，177,048 token）、B 性能与工具并复核第二十八检查点的十项（12 个提交，231,938 token）、C 文档与 UI（17 个提交 `80c23619..2c44be20`，158,009 token）。结论：A 2 P1 / 4 P2，B 1 P1 / 6 P2 / 1 P3，C 1 P2 / 1 P3；三路都未运行测试或构建。B 对第二十八检查点的复核：十项里七项"已解决"，三项"部分"（回放时间、形状校验、重新基线），分别对应下面的 B1、B2/B3、B7。逐条复核与处置：

- A1 P1 哈希轮换可能删除线上仍在提供的页面的哈希——成立：函数发布后若上传失败或取消，再次构建并发布会把线上页面的哈希挤出 PREVIOUS。修复：`deploy.mjs functions --origin <线上源>` 抓取线上各预渲染页（`servedPageRoutes`）当前内联脚本的哈希，`rotateScriptHashes({ build, live, served })` 把它们并入 PREVIOUS；没有 `--origin` 时打印警告并退回只看上次发布的规则；测试覆盖"函数发布成功、上传失败、重新构建再发布"。
- A2 P1 `reupload` 绕过 CSP 守卫且能单独上传引用未上传资源的新壳——成立。修复：`reupload` 改为桶内 `s3 cp --metadata-directive REPLACE` 复制，只改线上对象的元数据、不上传本地正文；测试与手册同步。
- A3 P2 图表入口 `?v=<commit>` + immutable 与边缘缓存键不含查询串冲突——成立。修复：Vite 配置计算 `public/charting_library/charting_library.js` 的 SHA-256 前 16 位，经 `VITE_GATU_CHART_LIBRARY_HASH` 注入运行时，build-meta 插件把同一份字节发出为 `charting_library/charting_library.<hash>.js`；`createChartLibraryScriptUrl(version)` 对 16 位十六进制返回哈希路径，否则 `?v=`（开发服务器）；`objectCacheControl` 只对哈希入口 immutable，未哈希入口回到重新验证；`deploy.mjs verify` 要求壳预加载哈希入口、线上 immutable 且未哈希入口已重新验证；`verify-chart-build.mjs` 只接受与源字节相同且名字等于源哈希的副本；Nitro 路由规则删掉入口 immutable。ADR 0006 决策 3/6、两份部署手册、启动性能计划的 P9 条目已更正。
- A4 P2 排行榜沿用常驻进程的后台刷新——成立。修复：Lambda 里 `createLeaderboardApiHandler({ awaitStaleRefresh: true })` 等待刷新，失败时回退旧快照并标 stale，边缘的 `stale-while-revalidate` 承担后台重验证；两条测试。
- A5 P2 CSP 报告直接记录 URL——成立。修复：`sanitizeReportUrl` 只保留 origin 与路径（去查询串、凭据、片段，`/join/<code>` 折叠为 `/join/*`，`inline`/`eval` 这类非 URL 值原样），脚本样本截到 40 字符；测试含推荐码与查询参数。
- A6 P2 批量报告绕过每分钟限额——成立。修复：缺必需字段的空报告丢弃、每请求最多 10 条、按写出的条数扣减预算、预算不足回 429；测试覆盖批次计量。ADR 0007 决策 2/5 更新。实例外的限流仍取决于尚未设置的预留并发，未改。
- B1 P1 订阅确认再次覆盖回放时间——成立。修复：确认路径 `watchdog.arm(key, runtime.lastMessageAt)`，`setSubscriptionData` 在 `markFresh(key, receivedAt)` 之后读取看门狗的 `isStale`，`staleness.arm/markFresh` 接受时间参数；`use-sub.test.tsx` 新增回放→节流→store→看门狗的整链用例。ADR 0003 补第三条规则。
- B2 P2 丢弃损坏的 `sac` 条目会静默保留旧值——成立。修复：任一条目损坏即 `invalid_frame` 触发回退；测试改为断言整帧无效。
- B3 P2 SDK 自动重连绕过首帧校验——成立（核对 SDK 0.33.3 的重连行为）。修复：`CompactSubscriptionConfig.subscribeDisconnect`（`clients.ts` 接 `subscribeWsDisconnect`），断线时代次加一、清空待解码队列与累积器，重连后重新要求完整首帧；两条测试。ADR 0008 更新。
- B4 P2 预加载注入器重复执行不幂等——成立。修复：`stripShellPreloads` 先移除旧块再收集壳原生链接；测试连续两次注入逐字节一致。
- B5 P2 `preload-trade-terminal-surface` 块漏出预算与壳预加载——成立。修复：加入预算脚本的静态启动语义根前缀，p19 产物核对见下。
- B6 P2 仪表盘无条件预加载交易面板与图表——成立。修复：`early-prefetch.ts` 只在 `getAppRouteSurface(pathname) === "terminal"` 时调用 `startSurfacePreloads()`；新增 `early-prefetch.test.ts`。
- B7 P2 重新基线的更正记录仍不合规——成立。处置：修复提交之后用干净提交、Node 22.15.0、固定 `GATU_RELEASE_ID` 与 `GATU_BUILD_TIME` 重新构建并按规则记录（见下与基线文档的第二次更正）。
- B8 P3 加载审计工具误报——成立。修复：覆盖率与资源按完整 URL 对齐，静态 `modulepreload` 从原始 HTML 统计、动态追加的链接单列。
- C1 P2 未实现的最大回撤恒显 `0.00%`——成立。修复：恢复 `—` 占位，测试改回"成功加载也不得伪造回撤"。
- C2 P3 品牌清理改写了历史截图路径——成立。处置：在该记录追加说明（原路径与替换后的路径现都不存在，不据此断言截图从未存在），不改写历史正文。

验证（提交 `0b8f31d7`）：`biome check` 通过；`pnpm typecheck`（hl-react、ui、terminal）通过；`pnpm test:cloudfront` 33 例通过；`node --experimental-strip-types --test scripts/*.test.mjs deploy/*.test.mjs` 197 通过、0 失败；全量 `pnpm --filter @gatu/terminal test` 559 文件与 typecheck 并发时 29 个红文件：10 个基线红之外的 19 个单独重跑全部通过（`chart-asset-cache-policy` 是删除 Nitro 入口 immutable 规则后同步测试契约），其余都是 5 s 超时的争用产物。基线红仍是 `desktop-positions-panel-shell`、`global-settings-slippage-effective`、`referral-ui-contract`、`adaptive-modal-swipe-dismissal`、`mobile-input-zoom-contract`、`position-market-close-modal`、`orders-table-visual-contract`、`mobile-trade-tp-sl-contract`、`mobile-order-risk-summary-contract`、`market-asset-info`。

构建 p19（提交 `0f08462a`，Node 22.15.0 / pnpm 10.21.0，`GATU_RELEASE_ID=cloudfront-2026-09-15-p19 GATU_BUILD_TIME=2026-09-15T00:00:00.000Z pnpm build`；第一次构建在预算检查处失败——chunk 图把发出的哈希入口副本当成了无元数据的 JS 资源，`0f08462a` 让图只盘点 `assets/` 目录后重建）：391 块无循环静态导入；`trade-terminal-page` 123,804 gz（基线 123,242，+562）；静态启动闭包 75 资源 / 1,562,860（-7,361；4 个语义根，`preload-trade-terminal-surface` 已在壳的 `modulepreload` 里）；移动增量 11 / 111,640，桌面增量 25 / 196,992；客户端总量 3,070,775（-83,932）；路由预加载 6 文件 518,908 gz。壳预加载 86 个共有资源 + 14 个仅桌面 + 0 个仅移动；`build-meta.json` 的 `chartLibraryScript` 为 `/charting_library/charting_library.2925de328d845fd5.js`（与源文件 SHA-256 前 16 位一致，`verify-chart-build.mjs` 通过）；内联脚本哈希 10 个（8 页）。合规的重新基线记录写在 `docs/terminal-performance-baseline.md` 的第二次更正。

发布 p19：`functions --execute --origin https://d2i25dhfjwco8b.cloudfront.net`（本次 10 个内联脚本哈希为 CURRENT，线上页面仍在提供的 7 个并入 PREVIOUS）→ `lambda`（`gatu-terminal-api` 与 `gatu-terminal-api-csp-report` 都更新，两者的处理代码本次都有改动）→ `sync`（守卫"线上策略允许全部 10 个哈希"通过，两阶段上传，HTML 与 `build-meta.json` 最后）→ `reupload --only charting_library/charting_library.js`（桶内复制，未哈希入口回到 `public, max-age=0, must-revalidate`）→ 两条分发 `/*` 失效并等待完成 → `verify` 主网 14/14、测试网 15/15 全绿（含新的"哈希入口 immutable 且未哈希入口已重新验证"、`build-meta` 提交 `0f08462a` / `cloudfront-2026-09-15-p19`、壳 86 个 `modulepreload`、7 页 21 段内联脚本在 enforce 策略下允许）。

线上复测（主网 `d2i25dhfjwco8b.cloudfront.net`，同机冷缓存、单样本，工具与前几个检查点相同）：`csp-coverage.mjs` 全部步骤 0 条违规（`scriptSrcViolations`、`otherViolations` 均空）；`boot-milestones.mjs` 两次冷加载：TTFB 280 / 203，FCP 532 / 424，水合 570 / 514，fallback 消失、顶栏、表面 627 / 912，网格 829 / 912，订单簿数据 840 / 912（第二次全部落在同一帧），Privy iframe 1,196 / 1,241，长任务合计约 1.5 s（其中约 1.2 s 是钱包运行时）；`orderbook-race.mjs` 三次：网格、订单簿面板、数据、20 行同帧（980 / 1,000 / 933），首个 `l2Book` 快照 812 / 919 / 857 ms 均早于网格，`gridToBookData` 三次都是 0；`market-stats-probe.mjs`：头部 101 个数字、4 个占位，24h 涨跌、成交量、未平仓、资金费率均由 `pac`/`sac` 填充，无控制台错误。与 p18 相比处于同一量级（差异在单样本噪声内），本次目标是正确性修复而不是提速。

边界与未改动：接收器的限额仍是实例级，实例外限流取决于尚未设置的预留并发；过渡期 Nitro 宿主对哈希入口副本按 `/charting_library/**` 重新验证（rou3 路由规则不能表达文件名里的哈希），只有 CloudFront 目标享受 immutable；`deploy/README.md` 里 iPad WebKit 热缓存的图表初始化回归仍待做；全量 vitest 与 typecheck 并发时的超时红文件是本机争用现象，未改测试超时。

p19 之后用户在开发服务器（`localhost:3007`）上看到图表面板"Something went wrong / Retry"（`TradingViewChart` 的错误边界）。原因：A3 的 Vite `define` 在 dev 与 build 都注入了 `VITE_GATU_CHART_LIBRARY_HASH`，加载器于是请求 `/charting_library/charting_library.<hash>.js`，但哈希副本只由 build 阶段的 build-meta 插件发出，dev 服务器只有 `public/` 里的原文件，返回 404（浏览器网络面板两次 404，控制台"An unknown error occurred when fetching the script."）。CloudFront 上的 p19 不受影响（哈希副本 200、immutable，`verify` 已核对）。修复：`resolveChartLibraryHashForCommand(command)` 只在 `build` 时返回哈希，dev 回到 `charting_library.js?v=<commit>`；`build-meta.test.ts` 钉住"serve 为空、build 为 16 位十六进制"。

## 后续与替代关系

- 按 [deploy/cloudfront/README.md](../../../deploy/cloudfront/README.md) 执行资源创建前，先用 root 建受限 IAM 身份；创建后用 `deploy.mjs verify` 与 `--resolve` 在 DNS 切换前验证；切换稳定一个发布周期后退役 EC2，并把 `deploy/deploy.sh` 与 Caddy/systemd 文件转为历史资料。
- 配对票据在无服务器宿主上需要 DynamoDB 条件写实现后才能启用；`/api/leaderboard` 可考虑 CloudFront 缓存以减少 Lambda 调用。
- 旧路径 `POST /client-error-report` 别名保留一个发布周期后删除。
- 壳 head 目前带 `/trade` 的标题与 `canonical`，需要中性化或在 CDN 层禁止缓存壳。
- 配对票据在多实例前迁到共享 CAS+TTL 存储，按部署手册既有要求执行。
- 下一次接手先看 `docs/adr/0005-spa-static-shell.md`、`apps/terminal/vite.config.ts`、`scripts/serve-spa-static.mjs`。
