# CloudFront 全静态部署：S3 壳 + Lambda API

目标拓扑不再有 EC2 与 Caddy：客户端构建放在私有 S3，CloudFront 负责 TLS、缓存、安全头与导航回写，同源 `/api/*` 处理器跑在一个 Lambda 函数 URL 上。应用代码不变，运行形态与 [ADR 0005](../../docs/adr/0005-spa-static-shell.md) 的"静态壳 + API"完全一致，只是宿主从 Node 换成 CloudFront + Lambda。

本目录的脚本只生成配置、打印命令和做验证；没有 `--execute` 时不会碰 AWS。资源创建由持有授权的人在确认后执行。

## 官方终端的托管实践（2026-09-13 只读调试 `app.hyperliquid.xyz/trade/HYPE`）

| 观察 | 证据 | 对 gatu 的取舍 |
| --- | --- | --- |
| S3 源 + CloudFront，SPA 回写靠"自定义错误响应"：任何不存在的键（`/trade/HYPE`、`/portfolio`、`/no/such/page`、甚至缺失的 `/assets/*.js` 与 `/sw.js`）都返回 `index.html` 200，响应头 `X-Cache: Error from cloudfront` | `curl -D` 各路径，ETag 与 `/index.html` 相同 | 不照搬。gatu 用 viewer-request 函数把导航改写到 `_shell.html`/文档 `index.html`，文件形态的路径保持 404，避免缺失资源变成 HTML |
| HTML 与资源都没有 `Cache-Control`，靠 ETag/Last-Modified 与 CloudFront 默认 TTL；错误映射的 HTML 在边缘缓存超过一天（`Age: 92651`） | 响应头 | 不照搬。gatu 在上传时写对象级 `Cache-Control`：`/assets/*` immutable、壳与文档页 `no-cache`、`build-meta.json`/`sw.js` `no-store`、图表包 `must-revalidate`；发布后全量失效 |
| 没有任何安全头（无 CSP/HSTS/XFO） | 响应头 | 不照搬。gatu 用响应头策略把 `src/config/security-headers.ts` 原样搬到边缘 |
| API 域 `api-ui.hyperliquid.xyz`：nginx 在 CloudFront 后面，`X-Cache: Miss`，CORS `*`，无缓存 | `POST /info` 响应头 | gatu 的浏览器仍直连公共 `api.hyperliquid.xyz`（同样在 CloudFront 后面，CORS `*`），不经过自家 API |
| 前端不做地区判定，bundle 里没有 geo/ip 查询；限制由其 API 在服务端执行 | bundle 字符串检索 | gatu 的地区门控是产品契约，保留 `/api/geo`（IPdata，含代理判定）跑在 Lambda 上 |

## 只读核查（2026-09-13）

| 项目 | 结果 |
| --- | --- |
| AWS CLI | 本机 `aws-cli/2.36.2`，默认区域 `ap-northeast-1` |
| 凭证 | 默认 profile 是 **root 账号密钥**。创建资源前先用 root 建一个受限 IAM 用户或角色（CloudFront、ACM us-east-1、S3 指定桶、Lambda 指定函数、IAM PassRole 给 Lambda 执行角色），本机切换到该 profile |
| 现有分发 | `EP2DIBP3T7M3G`：营销站，S3 源 `gatu-dist-2026`，函数 `gatu-rewrite-index` |
| ACM（us-east-1） | 只有 `gatu.ai`/`www.gatu.ai`；`app.gatu.ai`、`testnet.gatu.ai` 需新申请，DNS 验证记录加在 Cloudflare |
| DNS | 无 Route53，切换与回滚靠 Cloudflare 的 DNS-only 记录 |

## 组件

| 文件 | 作用 |
| --- | --- |
| `apps/terminal/src/edge/lambda-handler.ts` | Lambda 函数 URL 适配器：把事件转成 `Request`，用 `x-gatu-forwarded-host` 还原公网 origin（同源校验依赖它），从 `CloudFront-Viewer-Address` 取客户端 IP，路由到 `/api/geo`、`/api/referral-geo`、`/api/client-error-report`（含旧路径别名）、`/api/leaderboard`、`/api/health`（204，保温与验证用）；其余 404（含已退役的配对票据路径） |
| `apps/terminal/src/lib/api/payload-hash.ts` | 浏览器端 POST 辅助：CloudFront 对 Lambda 源的 OAC 签名不读请求体，viewer 必须自带 `x-amz-content-sha256`（AWS 文档要求），否则 Lambda 以签名不匹配拒绝。`createJsonPostHeaders(body)` 同步计算 SHA-256 并附上 `content-type`，`/api/referral-geo`、`/api/client-error-report`（含 `keepalive` 上报）与配对票据请求都经它发出；GET/HEAD 不需要 |
| `scripts/inject-shell-preloads.mjs` | `pnpm build` 末尾把交易页启动闭包（静态闭包 + 移动/桌面运行时 profile，来自与预算检查相同的 chunk 图分析）写进 `_shell.html`：JS 用 `modulepreload`，CSS 用 `preload as="style"`；再按 `build-meta.json` 的 `chartLibraryScript` 预加载 TradingView 入口（带 `media="(min-width: 1001px)"`）；仅桌面或仅移动需要的启动块与图表 iframe 的 `runtime.*`、`library.*` bundle、`sameorigin.html`、暗色主题样式写进 `<meta name="gatu-preload-desktop|mobile|gatu-chart-prefetch">`，由引导块 `src/lib/preload/surface-preloads.ts` 按 `matchMedia` 追加（Chromium 忽略 `modulepreload`/`prefetch` 链接上的 `media`）；包在 `<!--gatu-shell-preloads-->` 标记里；缺文件或 bundle 不唯一即构建失败 |
| `pnpm --filter @gatu/terminal build:lambda` | 用 Vite SSR 构建把处理器打成单文件 `apps/terminal/dist-lambda/index.mjs`（约 220 KB，不含 `public/`，无浏览器全局访问），与客户端共用构建身份 |
| `functions/terminal-request.js` | viewer-request：所有应用路径（含 Docs、Support 与法律页，ADR 0020）改写到 `_shell.html`，服务端路径与文件路径原样放行，`/_serverFn/*` 直接 404，写入 `x-gatu-forwarded-host`，先丢弃访客自带的 `x-gatu-route`，再给 `/join*` 标记 `referral-join`、给 `/mobile-agent-sync`（不区分大小写、允许尾斜杠）标记 `mobile-agent-sync` |
| `functions/terminal-response.js` | viewer-response（由 `render-functions.mjs` 从 `terminal-response.template.js` 渲染，勿手改）：所有策略共用一份目录模板，只有 `frame-ancestors`、`img-src`、`script-src` 三个槽位不同——图表包路径用同源 iframe 版本，其余用终端版本，并在 `edge-config.json` 配置了 `cspReportUri` 时下发候选策略的 `Content-Security-Policy-Report-Only`；`x-gatu-route` 标记暴露为响应头；标记为 `mobile-agent-sync` 时写 `cache-control: no-store` 与 `referrer-policy: no-referrer`（配对页与其它应用路径共用同一个壳对象，无法靠对象元数据区分；响应头策略先于本函数应用，所以这里写入的值不会被策略的 `Override` 覆盖，见 [AWS 说明](https://aws.amazon.com/blogs/networking-and-content-delivery/amazon-cloudfront-introduces-response-headers-policies/)；`no-store` 只约束下游缓存，不改变边缘对壳的缓存）。提交的文件里 `SCRIPT_HASHES_CURRENT`/`SCRIPT_HASHES_PREVIOUS` 两行为空，发布时由 `deploy.mjs functions` 填入本次构建与线上现行的内联脚本哈希（见 4c）。CloudFront 响应头策略最多接受 1,783 字符的 CSP，而应用策略是 1,946 字符，所以 CSP 由函数下发；`pnpm test:cloudfront` 会在渲染结果与 `security-headers.ts`、`edge-config.json` 不一致时失败 |
| `function-code.mjs` | 提交的函数与发布之间的契约：读取并校验 `edge-config.json`（`cspReportUri`、`cspScriptHashes`），向函数代码写入与读回两组哈希，轮换规则（本次构建为 CURRENT，线上 CURRENT 变 PREVIOUS，同一构建重发保留 PREVIOUS），以及 10 KB 上限 |
| `scripts/collect-inline-script-hashes.mjs` | `pnpm build` 末尾扫描 `_shell.html`、各 `<route>/index.html` 与根目录其它 HTML（不含 `charting_library/`）的内联脚本，按浏览器解析后的文本算 CSP `sha256-…` 哈希（HTML 解析器把 CR/CRLF 归一为 LF、把脚本里的 U+0000 换成 U+FFFD，TanStack 流屏障序列化的路由匹配 id 正含 NUL，按文件字节算的哈希浏览器不认）并写到 `apps/terminal/.output/edge/inline-script-hashes.json`；发现内联事件处理器或 `javascript:` URL 即让构建失败。`deploy.mjs` 的 `functions`、`sync`、`verify` 直接复用同一实现，从产物现算 |
| `apps/terminal/tests/browser/csp-coverage.mjs` | 浏览器覆盖：`node apps/terminal/tests/browser/csp-coverage.mjs <origin>` 用 Playwright 全新上下文在页面脚本之前注册 `securitypolicyviolation` 监听，遍历桌面与移动交易页、连接与充值弹窗、`/portfolio`、`/leaderboard`、`/join`、Docs/Support 与法律页，输出每步违规、`script-src` 的内联/`eval` 报告与控制台错误。发布哈希策略后必须跑：`verify` 与收集器共用同一实现，只有浏览器能证明哈希算法与解析器一致 |
| `response-headers-policies.mjs` | 从 `security-headers.ts` 生成四个策略（不含 CSP）：base、trade（带该网络的 Hyperliquid API `preconnect`）、join（`no-store`/`no-referrer`/`noindex`）、chart（`X-Frame-Options: SAMEORIGIN`，缓存由对象元数据决定：未哈希入口重新验证、哈希 bundle 与内容哈希入口副本 immutable）；testnet 版本全部附加 `noindex` |
| `distribution-config.mjs` | 生成 DistributionConfig：S3 源（OAC）+ Lambda 源（OAC），`/api/leaderboard` 走 Lambda 但按源的 `s-maxage` 在边缘缓存（缓存策略 `gatu-terminal-api-cached`，按完整查询串区分），其余 `/api/*`、`/client-error-report` 走 Lambda 且不缓存，`/join*` 不缓存，所有静态行为挂 viewer-response 函数（CSP），导航行为再挂 viewer-request 函数，图表/资源路径 CachingOptimized，交易路径挂 trade 策略，404 映射到 `/404.html`。不传 `--alias`/`--certificate-arn` 时使用默认 `*.cloudfront.net` 证书，供证书签发前先行验证；`--api-origin-request-policy-config` 输出 Lambda 源请求策略（白名单 9 个头，CloudFront 上限 10，转发 viewer 地址但不转发 Host） |
| `deploy.mjs` | `functions`（把提交的 `terminal-response.js` 填入本次构建的内联脚本哈希与线上函数的现行集合后写到 `apps/terminal/.output/edge/terminal-response.js`，再从文件更新并发布两个 CloudFront Functions；没有构建产物或哈希为空时拒绝）、`sync`（按缓存策略分组 `aws s3 sync`，资源先、HTML 与 `build-meta.json` 后，从不 `--delete`，只在上传完成后用 `aws s3 rm` 删除 ADR 0020 之前构建遗留的六个 `<route>/index.html`（本次构建仍包含的不删，桶有版本控制可恢复）；先按下文「发布闸门」核对 `build-meta.json` 记录的开关与运营方的确认参数，`--execute` 时不一致即拒绝、演练时只打印警告；`--execute` 时再用 `get-function` 核对线上策略已含本次构建的全部内联脚本哈希，否则拒绝上传）、`reupload --only <前缀>`（缓存策略变化时用 `aws s3 cp` 强制重写已有对象的元数据，`sync` 会跳过内容未变的文件）；`sync` 结束时核对 S3 上 `_shell.html` 与 `build-meta.json` 的字节数与本地构建一致，中途停下的同步会直接报错、`invalidate`（`/*`）、`lambda`（zip + `update-function-code` + 等待）、`verify`（经公网检查交易页与法律页（`/terms`）返回的壳与本地构建逐字节一致、CSP 与网络专属 preconnect、`build-meta.json` 的提交、release 与发布闸门状态都与本地构建一致、`/api/geo` 真实判定、带 `x-amz-content-sha256` 的同源 `POST /api/referral-geo` 返回决策、`/join` 头与标记、`/mobile-agent-sync` 的 `no-store` / `no-referrer` 与标记、缺失文件 404、遗留文档页 `/terms/index.html` 404（本地构建仍包含 `terms/index.html` 时改为核对 `/terms` 与该页一致，供回滚使用）、壳内预加载的图表入口线上 immutable、壳内 ≥ 20 个 `modulepreload` 且都在本地构建中并在线上 `immutable`、`/api/health` 204、壳二次请求边缘命中、图表 bundle immutable 且边缘命中、本地构建里每个预渲染页（ADR 0020 起只有壳）的内联脚本哈希都在线上对应策略头里（`report-only` 看 report-only 头；`enforce` 看强制头且 `script-src` 不含 `'unsafe-inline'`）、`img-src` 按 `cspImageSources` 所指的头不再放行任意 `https:`、testnet `noindex`） |

缓存策略（`objectCacheControl`）：`assets/*`、`charting_library/bundles/*`（TradingView 文件名自带 20 位内容哈希）与构建发出的入口副本 `charting_library/charting_library.<16 位内容哈希>.js` `immutable` 一年；壳 `public, max-age=0, s-maxage=60, stale-while-revalidate=300`，网络导航与 SW 后台刷新使用条件请求，边缘缓存一分钟并在后台刷新，发布时的 `/*` 失效清除边缘旧版本（浏览器 SW 缓存见下文）；未哈希的 `charting_library.js`、`sameorigin.html`、主题样式重新验证；`build-meta.json` 与 `sw.js` `no-store`。2026-09-15 入口改为内容哈希命名后，旧的 immutable 对象要执行一次 `reupload --only charting_library/charting_library.js`（`aws s3 sync` 不会重写内容未变的元数据），`verify` 会检查它已回到重新验证。改动策略后对受影响前缀跑 `node deploy/cloudfront/deploy.mjs reupload --bucket gatu-terminal-2026 --only charting_library/bundles/ --only _shell.html --execute`，再失效。

2026-09-16 热访问补充（SW v9，代码实现不代表已发布）：同源 GET 导航由 Service Worker 使用 stale-while-revalidate。配对页 `/mobile-agent-sync`（不区分大小写）与 `/join` 一样不经过 SW：共享壳的缓存条目带着别的路由的响应头，而且可能落后一个版本，配对页需要边缘函数写的 `no-store` / `no-referrer` 与最新的壳（含头部擦除脚本）。应用路径共用 `shell-v9` 缓存中的唯一条目，六个文档路径各按完整 URL 存入 `documents-v9`；`/join`、`/join/*`、文件扩展名与边缘服务端路径始终放行。只存未重定向的 200 `text/html`，完整保留 CSP 和其它响应头；命中直接返回，`event.waitUntil` 在后台获取并替换；未命中走网络。不启用 navigation preload，字体/图标策略不变。

2026-09-27 更正（[ADR 0020](../../docs/adr/0020-legal-pages-in-app-shell.md)，代码实现不代表已发布）：六个文档路径不再单独预渲染，也不再单独缓存。SW 升到 v10，删除 `documents-*` 缓存，六个路径与其他应用路径共用 `shell-v10` 的唯一条目，激活时清理 `shell-v9` 与 `documents-v9`；viewer-request 函数把它们改写到 `_shell.html`。对齐官方（任何路径都回到 SPA 壳，不存在过期的独立页面）：`sync --execute` 上传完成后删除六个遗留的 `<route>/index.html`，`verify` 要求 `/terms/index.html` 返回 404，避免显式的文件路径继续读到内容和 CSP 哈希都已过期的旧页面。

发布时 `/*` 失效只影响 CloudFront，不清浏览器 CacheStorage，因此第一条导航可能仍显示上一版壳。已核对 `deploy.mjs` 的 `buildSyncCommands` 不包含 `--delete`：旧壳引用的哈希资源继续留在 S3；`prepareResponseFunction` 配合 `terminal-response.template.js` 合并 CURRENT/PREVIOUS 的内联脚本哈希，保留上一版一个发布周期。SW 保存的旧 Response 还自带当时的 CSP（不与新正文/新头混用）。保持现有“发布函数 → 上传资源和页面 → 失效 → 验证”顺序；不要在同步时清理旧哈希资源。`sw.js` 仍在 `NO_STORE_FILES` 中（`no-store`），`routes/__root.tsx` 注册仍用 `updateViaCache: "none"`；有问题的 SW 可在下次访问时更新替换，新版本激活会清理退休缓存，但发现更新的当次导航可能仍由旧 SW 回答。上线后需验证连续导航、离线后恢复、跨版本首次导航与 iOS Safari；本次 Node harness 不替代这些验收。

`pnpm test:cloudfront` 运行以上生成器、函数与部署脚本的 node 测试。

## 执行步骤

1. **IAM 身份**（已完成，2026-09-13 建用户、2026-09-17 收紧策略）：IAM 用户 `gatu-edge` 挂载客户管理策略 `gatu-edge-deploy`，策略正文即仓库中的 [iam/gatu-edge-release-policy.json](iam/gatu-edge-release-policy.json)（只含两个桶的对象读写、三个分发的失效与配置更新、两个 CloudFront 函数的更新发布、`gatu-terminal-api*` 的代码更新与日志读取、ACM 只读）；改策略时以该文件 `aws iam create-policy-version --set-as-default` 应用。本机 `aws configure --profile gatu-edge` 使用该用户的密钥。`deploy.mjs` 默认以 `gatu-edge` profile 执行每条 `aws` 命令（`--profile <name>` 或 `AWS_PROFILE` 可覆盖），带 `--execute` 时先 `sts get-caller-identity`，身份为账号 root 时拒绝发布。账号 root 的访问密钥已于 2026-09-17 停用。
2. **证书（us-east-1）**：
   ```bash
   aws acm request-certificate --region us-east-1 --validation-method DNS \
     --domain-name app.gatu.ai --subject-alternative-names testnet.gatu.ai
   aws acm describe-certificate --region us-east-1 --certificate-arn <arn> \
     --query 'Certificate.DomainValidationOptions[].ResourceRecord'
   ```
   把 CNAME 记录加到 Cloudflare（DNS-only），等待 `ISSUED`。
3. **S3 桶**（私有，禁用公共访问，开启版本控制便于回滚）：`aws s3api create-bucket --bucket gatu-terminal-2026 --region ap-northeast-1 --create-bucket-configuration LocationConstraint=ap-northeast-1`。桶策略给 CloudFront OAC 授予 `s3:GetObject` 与 `s3:ListBucket`（有 ListBucket 时缺失对象返回 404 而不是 403，Lambda 的 403 语义得以保留）。
4. **Lambda**：Node.js 22 运行时，处理程序 `index.handler`，环境变量 `IPDATA_API_KEY`、`GATU_PUBLIC_ORIGIN=https://app.gatu.ai`、`GATU_TRUST_VIEWER_ADDRESS=true`，内存 512 MB（arm64，冷启动更短），超时 10 s；创建函数 URL，`AuthType=AWS_IAM`，并建 Lambda 类型的 OAC 供 CloudFront 签名调用。保温：用 root 创建执行角色 `gatu-terminal-api-warm-role`（信任 `scheduler.amazonaws.com`，只允许 `lambda:InvokeFunction` 该函数）和 EventBridge Scheduler `gatu-terminal-api-warm`（`rate(5 minutes)`，`FlexibleTimeWindow OFF`，目标为函数本身，输入是一条 `rawPath=/api/health` 的合成函数 URL 事件），`gatu-edge` 策略不含 `scheduler`。分发建好后给每条分发加**两条**资源策略（AWS 文档如此要求，只加第一条时 CloudFront 得到 403 `AccessDeniedException`）：
   ```bash
   aws lambda add-permission --function-name gatu-terminal-api --statement-id cloudfront-mainnet \
     --action lambda:InvokeFunctionUrl --principal cloudfront.amazonaws.com \
     --source-arn arn:aws:cloudfront::<account>:distribution/<mainnet-id>
   aws lambda add-permission --function-name gatu-terminal-api --statement-id cloudfront-mainnet-invoke \
     --action lambda:InvokeFunction --principal cloudfront.amazonaws.com \
     --source-arn arn:aws:cloudfront::<account>:distribution/<mainnet-id>
   ```
   首次上传：`pnpm --filter @gatu/terminal build:lambda && node deploy/cloudfront/deploy.mjs lambda --function-name gatu-terminal-api --execute`。主网与测试网共用同一函数时，把 `GATU_PUBLIC_ORIGIN` 留空并依赖 `x-gatu-forwarded-host`。
4b. **CSP 报告接收器**（[ADR 0007](../../docs/adr/0007-csp-report-only-hardening.md)）：`build:lambda` 同时产出 `dist-lambda/csp-report.mjs`。创建 `gatu-terminal-api-csp-report`（nodejs22.x、arm64、128 MB、3 s、处理程序 `csp-report.handler`、复用执行角色），`put-function-concurrency 2`，函数 URL `AuthType=NONE`，资源策略给 `*` 加**两条**语句：`lambda:InvokeFunctionUrl`（`--function-url-auth-type NONE`）和 `lambda:InvokeFunction`（`--invoked-via-function-url`）。只加第一条时函数 URL 对任何请求都回 403 `AccessDeniedException` 而 `aws lambda invoke` 正常，与第 4 步 CloudFront 源的双权限是同一规则。核对：`curl -X POST -H 'content-type: application/csp-report' --data '{"csp-report":{"document-uri":"https://example.com/","effective-directive":"img-src","blocked-uri":"https://example.invalid/x.png"}}' <函数 URL>` 返回 204，`GET` 返回 405。把函数 URL 写进 `deploy/cloudfront/edge-config.json` 的 `cspReportUri`，运行 `node --experimental-strip-types deploy/cloudfront/render-functions.mjs`，再用 `node deploy/cloudfront/deploy.mjs functions --execute` 更新并发布两个函数。更新接收器代码：`node deploy/cloudfront/deploy.mjs lambda --function-name gatu-terminal-api-csp-report --lambda-entry csp-report.mjs --execute`。报告在 CloudWatch 日志组 `/aws/lambda/gatu-terminal-api-csp-report` 里以 `csp_violation` 事件出现。现状（2026-09-14）：接收器已上线，`cspReportUri` 已填入并发布到两条分发；`put-function-concurrency` 受账号并发下限限制，暂未设置预留并发。
4c. **内联脚本哈希**（ADR 0007 决策 5，[计划](../../docs/csp-inline-script-hashes-plan.md)）：预渲染页各有三段内联脚本（主题引导、TanStack 流屏障、收尾），流屏障含资源文件名与预渲染时间戳，每次构建哈希都变，所以哈希不进仓库：`deploy.mjs functions --execute` 在发布时从产物算哈希作为 CURRENT，用 `get-function` 读线上函数的 CURRENT 作为 PREVIOUS（失效完成前边缘最多还会服务上一版页面 60 s），并用 `--origin` 抓取线上正在服务的页面、把它们的哈希一并保留——若上次发布在 `functions` 之后中断，线上函数记的是一个从未上传的构建，只有页面本身能说明该保留什么；两组一起写进函数；`sync --execute` 上传前核对线上策略已含本次构建的哈希，顺序错了会被拒绝。`edge-config.json` 的 `cspScriptHashes`：`report-only`（强制策略保留 `'unsafe-inline'`，只有 report-only 头带哈希与 `'report-sample'`）或 `enforce`（现状，2026-09-14 起：强制策略也用哈希并附 `report-uri`；图表 iframe 策略不变）。`cspImageSources` 用同一对取值切换 `img-src` 收窄（`'self' data: blob:` 加 `app.hyperliquid.xyz`、`*.privy.io`、`explorer-api.walletconnect.com`、`*.walletconnect.com`、`*.coinbase.com`；现状 `enforce`，2026-09-14 起）。两项都为 `enforce` 时候选策略与强制策略相同，函数不再下发 report-only 头，否则每条违规会报两次。紧急撤回：改回 `report-only`，重新渲染并 `functions --execute`，秒级生效。回滚一版页面不用改函数（PREVIOUS 仍在）；回滚更早版本要先用那次构建的产物执行 `functions --execute`，再恢复 S3 对象版本。
5. **CloudFront 函数**：
   ```bash
   aws cloudfront create-function --name gatu-terminal-request --function-config Comment="gatu shell rewrite",Runtime=cloudfront-js-2.0 --function-code fileb://deploy/cloudfront/functions/terminal-request.js
   aws cloudfront create-function --name gatu-terminal-response --function-config Comment="gatu route marker",Runtime=cloudfront-js-2.0 --function-code fileb://deploy/cloudfront/functions/terminal-response.js
   aws cloudfront publish-function --name <name> --if-match <etag>
   ```
6. **策略**：
   ```bash
   node --experimental-strip-types deploy/cloudfront/response-headers-policies.mjs --network mainnet > /tmp/rhp-mainnet.json
   # 对数组中的每个策略：aws cloudfront create-response-headers-policy --response-headers-policy-config file://<单个策略 JSON>
   node deploy/cloudfront/distribution-config.mjs --api-origin-request-policy-config > /tmp/orp.json
   aws cloudfront create-origin-request-policy --origin-request-policy-config file:///tmp/orp.json
   node deploy/cloudfront/distribution-config.mjs --api-cache-policy-config > /tmp/api-cache.json
   aws cloudfront create-cache-policy --cache-policy-config file:///tmp/api-cache.json
   ```
7. **分发**（主网、测试网各一个，共用 S3 桶与 Lambda）：
   ```bash
   node deploy/cloudfront/distribution-config.mjs --network mainnet --alias app.gatu.ai \
     --certificate-arn <arn> --bucket-domain gatu-terminal-2026.s3.ap-northeast-1.amazonaws.com \
     --s3-oac <id> --lambda-url-domain <xxx>.lambda-url.ap-northeast-1.on.aws --lambda-oac <id> \
     --api-origin-request-policy <id> --api-cache-policy <id> --policy-base <id> --policy-trade <id> --policy-join <id> --policy-chart <id> \
     --function-request <arn> --function-response <arn> > /tmp/cf-mainnet.json
   aws cloudfront create-distribution --distribution-config file:///tmp/cf-mainnet.json
   ```
8. **首次发布**：
   ```bash
   pnpm build
   node deploy/cloudfront/deploy.mjs sync --bucket gatu-terminal-2026 --execute
   node deploy/cloudfront/deploy.mjs invalidate --distribution <id> --execute
   ```
8b. **挂别名与证书**（证书 `ISSUED` 之后、切 DNS 之前，顺序不能颠倒——2026-09-15 曾先切 DNS，用户在这段时间里看到的是证书不匹配错误）：`node deploy/cloudfront/deploy.mjs aliases --distribution <mainnet-id> --alias app.gatu.ai --certificate-arn <arn> --execute`，测试网同理；命令读取现行配置、只改 `Aliases` 与 `ViewerCertificate`（`sni-only`、`TLSv1.2_2021`），`update-distribution` 后等待 `Deployed`（约 3–5 分钟）。
9. **切换前验证**（分发 `Deployed` 后，DNS 未改）：用 `curl --resolve app.gatu.ai:443:<分发 IP>` 逐项检查，或临时把本机 hosts 指向分发后运行 `node deploy/cloudfront/deploy.mjs verify --origin https://app.gatu.ai --network mainnet`。特别确认畸形 `/join/%` 的响应状态，以及 `/api/geo` 在真实公网 IP 下返回 200。
10. **切换 DNS**（已完成，2026-09-15）：Cloudflare 把 `app.gatu.ai`、`testnet.gatu.ai` 改为 CNAME 到各自分发（DNS-only）。
11. **退役 EC2**（已完成，2026-09-17）：发布 p21 后由用户停机 `i-058ca09d0533fc11d`；`deploy/deploy.sh` 及其 Caddy/systemd 文件先转为历史资料，并于 2026-09-18 从仓库移除（提交 `5d393572` 仍保留原文）；CI 不再校验 Caddyfile。回滚不再有 EC2 路径：以上一提交重新 `pnpm build` 后 `sync` + `invalidate`，或用 S3 桶版本恢复壳与文档页。

## 日常发布

```bash
pnpm build && pnpm --filter @gatu/terminal build:lambda
node deploy/cloudfront/deploy.mjs functions --execute --origin https://app.gatu.ai
node deploy/cloudfront/deploy.mjs lambda --function-name gatu-terminal-api --execute
node deploy/cloudfront/deploy.mjs sync --bucket gatu-terminal-2026 --execute
node deploy/cloudfront/deploy.mjs invalidate --distribution <mainnet-id> --execute
node deploy/cloudfront/deploy.mjs invalidate --distribution <testnet-id> --execute
node deploy/cloudfront/deploy.mjs verify --origin https://app.gatu.ai --network mainnet
node deploy/cloudfront/deploy.mjs verify --origin https://testnet.gatu.ai --network testnet
```

### 发布闸门

会暴露资金或凭证路径的构建开关，上传时需要运营方再确认一次；只在 `apps/terminal/.env.local` 里打开不算确认。构建把实际生效的值写进 `build-meta.json`（`cctpDeposits`、`mobileSync`，与应用运行时用同一个解析函数），`sync` 读的是构建产物而不是环境文件，所以构建之后再改环境文件不会影响判断。

| 闸门 | `build-meta.json` 字段 | 确认参数 | 何时可以打开 |
| --- | --- | --- | --- |
| 主网赞助充值 | `cctpDeposits.mainnetSponsoredWallet` | `--allow-sponsored-mainnet-deposits` | 见 [CCTP 充值](../../docs/cctp-deposits.md) 的发布模式 |
| 移动配对 | `mobileSync.enabled`（2026-09-24 之前的构建为 `importFromQr` 或 `createAndReveal`，两种形状都能读） | `--allow-mobile-pairing` | 仅在 [真机清单](../../docs/mobile-phone-access-device-validation.md) 记录完成之后；此前开关必须保持关闭 |

规则是双向精确匹配：构建打开了闸门而没有带参数，拒绝；带了参数而构建没有打开，也拒绝（说明运营方以为在发的版本和实际产物不一致）；`build-meta.json` 没有这些字段（旧构建）同样拒绝，需用当前源码重新构建。`sync` 每次都会打印一行 `release gates: …`；不带 `--execute` 的演练只给出警告。`verify` 会比较线上与本地构建的闸门状态。测试网的两个充值开关只记录、不需要确认。

未从旧 EC2 校验器移植的部分：`VITE_PRIVY_APP_ID` 非空、`VITE_HYPERLIQUID_AGENT_NAME=gatu`、`VITE_HYPERLIQUID_TESTNET` 为空、禁止 `.env.production*` 这几条属于环境文件拼写检查而不是暴露确认；其中「哪个文件生效」已由读取构建产物覆盖，其余仍靠发布前人工核对 [`env.build.example`](../env.build.example)。

顺序说明：CloudFront 函数最先发布，因为新页面的内联脚本哈希必须先进入线上策略（`sync` 会核对，见 4c），失效完成前的旧页面由函数里保留的上一版集合覆盖；Lambda 先于静态文件更新，因为新壳可能依赖新的 API 行为；`sync` 从不删除旧对象，正在打开旧壳的浏览器仍能取到旧资源；`invalidate` 用 `/*` 是为了让 `no-cache` 的壳与文档页立即刷新，资源本身是内容哈希不受影响。

## 与已退役 EC2 部署的差异

- 移动配对已改为纯客户端片段信封传输（[ADR 0015](../../docs/adr/0015-link-device-alignment.md) D7 方案 B），不再有票据端点：viewer-request 函数对 `/mobile-agent-sync-ticket*` 直接返回 404，Lambda 不再接收该路径，`build-meta.json` 的 `mobileSync` 只保留一个 `enabled` 开关（ADR 0015 D8）。`VITE_MOBILE_PAIRING_ENABLED` 在真机清单记录完成前保持关闭。
- `verify_geo_provider` 的等价检查是 `deploy.mjs verify` 的 geo 项：它从执行机的公网 IP 发起，要求 200 与两位国家码。
- referral 深链的标记从 HTML meta 变为 `x-gatu-route` 响应头；客户端路由仍在水合后写入 meta。
- 错误上报进入 Lambda 的 CloudWatch 日志；`/api/leaderboard` 的缓存是每个执行实例内存级的。
