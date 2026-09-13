# CloudFront 接入：静态壳 + API 源站

本目录是把交易终端放到 AWS CloudFront 之后的操作材料。当前已实现的运行形态（[ADR 0005](../../docs/adr/0005-spa-static-shell.md)）是 Node 进程直接返回预渲染产物并只执行 `/api/*` 与配对处理器，因此 CloudFront 的第一步不搬 S3：**CloudFront 作为 TLS 终结与静态资源边缘缓存，源站仍是现有 EC2 上的 Caddy → Node**。这一步只改 DNS、证书、分发和 Caddy 的可信代理链，不改应用代码，也不改 `deploy.sh` 的发布流程。把 `public/` 迁到 S3 是可选的第二步，见文末。

本文件不执行任何 AWS 变更；每条命令都需要由持有授权的人在确认后运行。

## 2026-09-13 只读核查结果

| 项目 | 结果 |
| --- | --- |
| AWS CLI | 本机 `aws-cli/2.36.2`，默认区域 `ap-northeast-1` |
| 凭证 | `~/.aws/credentials` 默认 profile 是 **root 账号密钥**。CloudFront/ACM/EC2 变更前应先建 IAM 用户或角色并切换 profile，root 密钥只用于创建该 IAM 身份 |
| 现有分发 | `EP2DIBP3T7M3G`：营销站，S3 源 `gatu-dist-2026`，别名 `gatu.ai`/`www.gatu.ai`，viewer-request 函数 `gatu-rewrite-index`（目录索引改写） |
| ACM（us-east-1） | 只有 `gatu.ai` + `www.gatu.ai` 的证书；`app.gatu.ai`/`testnet.gatu.ai` 需要新申请 |
| DNS | 没有 Route53 托管区，DNS 在 Cloudflare（DNS-only）；证书验证与切换都通过 Cloudflare 记录完成 |
| 源站 | EC2 `18.182.219.124`（Tokyo）运行 Caddy + Node；Caddy 目前把 `X-Forwarded-For` 覆盖为 TCP 对端地址 |

## 目标拓扑

```
浏览器 → CloudFront（app.gatu.ai / testnet.gatu.ai，ACM 证书，HTTP/2+3）
          ├─ /assets/*、/charting_library/*、主题 CSS、图标：边缘缓存（CachingOptimized）
          └─ 其余（壳、文档页、/api/*、配对票据、/join/*）：不缓存，转发全部 viewer 头
             → 源站 origin.gatu.ai（EC2 Caddy，HTTPS，自定义头 X-Origin-Verify）
                → Node：静态壳/文档页 + /api/* + 配对处理器
```

关键约束：

- **Host 必须转发**。Caddy 依赖 Host 选择网络（`@mainnet_trade`/`@testnet_trade` 的 `preconnect`、`@testnet` 的 `noindex`）。默认行为使用托管源请求策略 `AllViewerAndCloudFrontHeaders-2022-06`，缓存行为使用 `AllViewer`，两者都转发 Host。
- **客户端 IP 的可信链**。`/api/geo` 的判定与配对票据的限流依赖 Caddy 写入的 `X-Forwarded-For`。CloudFront 后面 TCP 对端是边缘节点，必须改为在 `X-Origin-Verify` 匹配时取 `CloudFront-Viewer-Address`（去掉端口）。片段见 [Caddyfile.cloudfront.snippet](Caddyfile.cloudfront.snippet)。
- **不改缓存语义**。源站已对壳返回 `no-cache`、对 `/join/*`、`build-meta.json`、票据返回 `no-store`、对 `/assets/*` 返回 `immutable`，CloudFront 的 CachingDisabled/CachingOptimized 策略与之一致。
- **发布流程不变**。`deploy.sh` 的公网检查经 CloudFront 到达源站；`verify_geo_provider` 直接探针本机 Node。切换后需按下方清单复验 `edge_health_check` 涉及的畸形 `/join/%` 请求在 CloudFront 上的表现。

## 执行步骤

1. **IAM 身份**（一次性）：用 root 建一个仅授予 `cloudfront:*`、`acm:*`（us-east-1）、`ec2:DescribeManagedPrefixLists`、`ec2:AuthorizeSecurityGroupIngress`/`Revoke…` 的用户或角色，本机 `aws configure --profile gatu-edge`，后续命令加 `--profile gatu-edge`。
2. **证书**（us-east-1）：
   ```bash
   aws acm request-certificate --region us-east-1 --validation-method DNS \
     --domain-name app.gatu.ai --subject-alternative-names testnet.gatu.ai
   aws acm describe-certificate --region us-east-1 --certificate-arn <arn> \
     --query 'Certificate.DomainValidationOptions[].ResourceRecord'
   ```
   把返回的 CNAME 记录加到 Cloudflare（DNS-only），等待状态 `ISSUED`。
3. **源站主机名**：Cloudflare 添加 `origin.gatu.ai` A 记录指向 EC2（DNS-only）。按 [Caddyfile.cloudfront.snippet](Caddyfile.cloudfront.snippet) 修改 `/etc/caddy/Caddyfile`：站点块加入 `origin.gatu.ai`，加入 `X-Origin-Verify` 匹配的可信代理链；在服务器执行 `caddy validate` 与 `node deploy/validate-caddy-forwarded-headers.mjs`，通过后 reload。此时公网流量仍直连 EC2，行为不变。
4. **生成并创建分发**：
   ```bash
   export GATU_ORIGIN_VERIFY_SECRET="$(openssl rand -hex 32)"   # 同一值写入 /etc/caddy/env
   node deploy/cloudfront/distribution-config.mjs \
     --alias app.gatu.ai --alias testnet.gatu.ai \
     --origin origin.gatu.ai --certificate-arn <arn> > /tmp/gatu-cf.json
   aws cloudfront create-distribution --distribution-config file:///tmp/gatu-cf.json
   ```
   `node --test deploy/cloudfront/distribution-config.test.mjs` 钉住配置形状；托管策略 ID 可用 `aws cloudfront list-cache-policies --type managed` 与 `list-origin-request-policies --type managed` 复核。
5. **切换前验证**（分发状态 `Deployed` 后，DNS 未改）：
   ```bash
   CF_IP="$(dig +short <dxxxx.cloudfront.net> | head -1)"
   curl -sI --resolve app.gatu.ai:443:$CF_IP https://app.gatu.ai/trade/BTC        # 200, CSP, Link preconnect 主网
   curl -sI --resolve testnet.gatu.ai:443:$CF_IP https://testnet.gatu.ai/trade/BTC  # Link preconnect 测试网, X-Robots-Tag
   curl -s  --resolve app.gatu.ai:443:$CF_IP https://app.gatu.ai/api/geo             # 真实 verdict（来自本机公网 IP）
   curl -sI --resolve app.gatu.ai:443:$CF_IP https://app.gatu.ai/assets/<hash>.js   # x-cache: Hit 第二次
   curl -sI --resolve app.gatu.ai:443:$CF_IP https://app.gatu.ai/join/abc          # no-store, no-referrer, noindex
   curl -s --path-as-is -o /dev/null -w '%{http_code}\n' --resolve app.gatu.ai:443:$CF_IP 'https://app.gatu.ai/join/%'
   ```
   最后一条决定是否需要调整 `deploy.sh` 的 `verify_edge_rejects_malformed_referral_deep_link`：CloudFront 可能先于 Caddy 以自己的 400 拒绝畸形 URI。
6. **切换 DNS**：Cloudflare 把 `app.gatu.ai`、`testnet.gatu.ai` 改为 CNAME 到分发域名（DNS-only）。回滚只需把记录改回 EC2 的 A 记录。
7. **收紧源站**（可选）：安全组 443 只放行 CloudFront 托管前缀列表 `com.amazonaws.global.cloudfront.origin-facing`，80 保留给 ACME HTTP-01；Caddy 对缺少 `X-Origin-Verify` 的请求返回 403。

## 发布后清单

- `deploy.sh` 全流程通过（含新的 `verify_geo_provider`）。
- `/api/geo` 在浏览器里返回真实判定，不再是 `missing_ip`/`provider_error`（说明可信代理链正确）。
- 配对票据限流仍按真实客户端 IP 计数（`mobile-sync-release.mjs probe` 经公网）。
- 更新 [部署手册](../README.md) 的拓扑图与 `deploy/env.runtime.example`（新增 `CADDY_ORIGIN_VERIFY` 说明）。

## 第二步（可选）：public/ 迁到 S3

把 `.output/public` 同步到 S3、CloudFront 默认行为改为 S3 源、`/api/*` 与票据路径改为 EC2 源。需要额外做：`gatu-rewrite-index` 风格的函数把文档路由改写到 `index.html`、404 回写 `_shell.html`、把 `src/config/security-headers.ts` 生成为响应头策略、`/join/*` 的 `no-store` 行为，以及为 referral 深链标记改用 Lambda@Edge 或调整 `deploy.sh` 的标记检查。收益是 HTML 也不依赖 EC2；在第一步稳定运行前不建议进行。
