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
| `apps/terminal/src/edge/lambda-handler.ts` | Lambda 函数 URL 适配器：把事件转成 `Request`，用 `x-gatu-forwarded-host` 还原公网 origin（同源校验依赖它），从 `CloudFront-Viewer-Address` 取客户端 IP，路由到 `/api/geo`、`/api/referral-geo`、`/api/client-error-report`（含旧路径别名）、`/api/leaderboard`；配对票据返回 503（无共享存储时不可用）；其余 404 |
| `pnpm --filter @gatu/terminal build:lambda` | 用 Vite SSR 构建把处理器打成单文件 `apps/terminal/dist-lambda/index.mjs`（约 220 KB，不含 `public/`，无浏览器全局访问），与客户端共用构建身份 |
| `functions/terminal-request.js` | viewer-request：文档路由改写到 `index.html`，其余应用路径改写到 `_shell.html`，服务端路径与文件路径原样放行，`/_serverFn/*` 直接 404，写入 `x-gatu-forwarded-host`，`/join*` 标记 `x-gatu-route` |
| `functions/terminal-response.js` | viewer-response（由 `render-functions.mjs` 从 `terminal-response.template.js` 渲染，勿手改）：设置 `Content-Security-Policy`（图表包路径用同源 iframe 版本，其余用终端版本）并把 `x-gatu-route: referral-join` 暴露为响应头。CloudFront 响应头策略最多接受 1,783 字符的 CSP，而应用策略是 1,946 字符，所以 CSP 由函数下发；`pnpm test:cloudfront` 会在渲染结果与 `security-headers.ts` 不一致时失败 |
| `response-headers-policies.mjs` | 从 `security-headers.ts` 生成四个策略（不含 CSP）：base、trade（带该网络的 Hyperliquid API `preconnect`）、join（`no-store`/`no-referrer`/`noindex`）、chart（`X-Frame-Options: SAMEORIGIN` + 重新验证）；testnet 版本全部附加 `noindex` |
| `distribution-config.mjs` | 生成 DistributionConfig：S3 源（OAC）+ Lambda 源（OAC），`/api/*`、`/client-error-report`、`/mobile-agent-sync-ticket*` 走 Lambda 且不缓存，`/join*` 不缓存，所有静态行为挂 viewer-response 函数（CSP），导航行为再挂 viewer-request 函数，图表/资源路径 CachingOptimized，交易路径挂 trade 策略，404 映射到 `/404.html`。不传 `--alias`/`--certificate-arn` 时使用默认 `*.cloudfront.net` 证书，供证书签发前先行验证；`--api-origin-request-policy-config` 输出 Lambda 源请求策略（白名单 9 个头，CloudFront 上限 10，转发 viewer 地址但不转发 Host） |
| `deploy.mjs` | `sync`（按缓存策略分组 `aws s3 sync`，资源先、HTML 与 `build-meta.json` 后，从不 `--delete`）、`invalidate`（`/*`）、`lambda`（zip + `update-function-code` + 等待）、`verify`（经公网检查壳与文档页与本地构建逐字节一致、CSP 与网络专属 preconnect、`build-meta.json` 一致、`/api/geo` 真实判定、`/join` 头与标记、缺失文件 404、图表包重新验证、testnet `noindex`） |

`pnpm test:cloudfront` 运行以上生成器、函数与部署脚本的 node 测试。

## 执行步骤

1. **IAM 身份**：用 root 创建受限用户或角色，`aws configure --profile gatu-edge`，以下命令均加 `--profile gatu-edge`。
2. **证书（us-east-1）**：
   ```bash
   aws acm request-certificate --region us-east-1 --validation-method DNS \
     --domain-name app.gatu.ai --subject-alternative-names testnet.gatu.ai
   aws acm describe-certificate --region us-east-1 --certificate-arn <arn> \
     --query 'Certificate.DomainValidationOptions[].ResourceRecord'
   ```
   把 CNAME 记录加到 Cloudflare（DNS-only），等待 `ISSUED`。
3. **S3 桶**（私有，禁用公共访问，开启版本控制便于回滚）：`aws s3api create-bucket --bucket gatu-terminal-2026 --region ap-northeast-1 --create-bucket-configuration LocationConstraint=ap-northeast-1`。桶策略给 CloudFront OAC 授予 `s3:GetObject` 与 `s3:ListBucket`（有 ListBucket 时缺失对象返回 404 而不是 403，Lambda 的 403 语义得以保留）。
4. **Lambda**：Node.js 22 运行时，处理程序 `index.handler`，环境变量 `IPDATA_API_KEY`、`GATU_PUBLIC_ORIGIN=https://app.gatu.ai`、`GATU_TRUST_VIEWER_ADDRESS=true`，内存 256 MB，超时 10 s；创建函数 URL，`AuthType=AWS_IAM`，并建 Lambda 类型的 OAC 供 CloudFront 签名调用。首次上传：`pnpm --filter @gatu/terminal build:lambda && node deploy/cloudfront/deploy.mjs lambda --function-name gatu-terminal-api --execute`。主网与测试网共用同一函数时，把 `GATU_PUBLIC_ORIGIN` 留空并依赖 `x-gatu-forwarded-host`。
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
   ```
7. **分发**（主网、测试网各一个，共用 S3 桶与 Lambda）：
   ```bash
   node deploy/cloudfront/distribution-config.mjs --network mainnet --alias app.gatu.ai \
     --certificate-arn <arn> --bucket-domain gatu-terminal-2026.s3.ap-northeast-1.amazonaws.com \
     --s3-oac <id> --lambda-url-domain <xxx>.lambda-url.ap-northeast-1.on.aws --lambda-oac <id> \
     --api-origin-request-policy <id> --policy-base <id> --policy-trade <id> --policy-join <id> --policy-chart <id> \
     --function-request <arn> --function-response <arn> > /tmp/cf-mainnet.json
   aws cloudfront create-distribution --distribution-config file:///tmp/cf-mainnet.json
   ```
8. **首次发布**：
   ```bash
   pnpm build
   node deploy/cloudfront/deploy.mjs sync --bucket gatu-terminal-2026 --execute
   node deploy/cloudfront/deploy.mjs invalidate --distribution <id> --execute
   ```
9. **切换前验证**（分发 `Deployed` 后，DNS 未改）：用 `curl --resolve app.gatu.ai:443:<分发 IP>` 逐项检查，或临时把本机 hosts 指向分发后运行 `node deploy/cloudfront/deploy.mjs verify --origin https://app.gatu.ai --network mainnet`。特别确认畸形 `/join/%` 的响应状态，以及 `/api/geo` 在真实公网 IP 下返回 200。
10. **切换 DNS**：Cloudflare 把 `app.gatu.ai`、`testnet.gatu.ai` 改为 CNAME 到各自分发（DNS-only）。回滚只需改回 EC2 的 A 记录，EC2 在确认稳定前保留。
11. **退役 EC2**：连续观察一个发布周期后停掉 `gatu.service` 与 Caddy，`deploy/deploy.sh` 及其 Caddy/systemd 文件转为历史资料。

## 日常发布

```bash
pnpm build && pnpm --filter @gatu/terminal build:lambda
node deploy/cloudfront/deploy.mjs lambda --function-name gatu-terminal-api --execute
node deploy/cloudfront/deploy.mjs sync --bucket gatu-terminal-2026 --execute
node deploy/cloudfront/deploy.mjs invalidate --distribution <mainnet-id> --execute
node deploy/cloudfront/deploy.mjs invalidate --distribution <testnet-id> --execute
node deploy/cloudfront/deploy.mjs verify --origin https://app.gatu.ai --network mainnet
node deploy/cloudfront/deploy.mjs verify --origin https://testnet.gatu.ai --network testnet
```

顺序说明：Lambda 先于静态文件更新，因为新壳可能依赖新的 API 行为；`sync` 从不删除旧对象，正在打开旧壳的浏览器仍能取到旧资源；`invalidate` 用 `/*` 是为了让 `no-cache` 的壳与文档页立即刷新，资源本身是内容哈希不受影响。

## 与 EC2 部署的差异

- 移动配对票据依赖单进程内存做原子消费，无服务器版本返回 503；启用该功能前需要 DynamoDB 条件写实现，`build-meta.json` 的 `mobileSync.store` 届时改为对应值。
- `verify_geo_provider` 的等价检查是 `deploy.mjs verify` 的 geo 项：它从执行机的公网 IP 发起，要求 200 与两位国家码。
- referral 深链的标记从 HTML meta 变为 `x-gatu-route` 响应头；客户端路由仍在水合后写入 meta。
- 错误上报进入 Lambda 的 CloudWatch 日志；`/api/leaderboard` 的缓存是每个执行实例内存级的。
