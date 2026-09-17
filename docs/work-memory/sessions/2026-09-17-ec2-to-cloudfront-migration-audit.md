<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-ec2-to-cloudfront-migration-audit",
  "date": "2026-09-17",
  "title": "旧架构（EC2 + Caddy + Nitro）到新架构（CloudFront + S3 + Lambda）迁移完成度核对",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "流量层已完全切到 CloudFront/S3/Lambda（DNS、分发源、Lambda、verify 全部核实）；旧 EC2 仍在运行且其 Caddy 已被改为代理到 CloudFront、22/80/443 对全网开放，尚未按 runbook 第 11 步退役；deploy/README.md 与两份计划文档仍把 EC2 描述为现状。",
  "thread": null,
  "baseCommit": "74c80c1a9e61d2045848dca2389e1af627c23609",
  "commits": [],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "path": "deploy/README.md" },
    { "path": "docs/adr/0005-spa-static-shell.md" }
  ],
  "supersedes": []
}
-->
# 旧架构到新架构迁移完成度核对

## 背景与范围

用户在 `cloudfront-2026-09-17-p21` 发布后要求核对"旧架构是否完全迁移到新架构"。旧架构：单台 EC2 + Caddy 双域名反代常驻 Nitro Node 进程（`deploy/README.md`）；新架构：私有 S3 + 两个 CloudFront 分发 + Lambda 函数 URL（ADR 0005、`deploy/cloudfront/README.md`）。核对日期 2026-09-17，AWS 账号 018252911946。

## 结论与依据

**流量与运行时：已完全迁移。**

| 项目 | 核实结果 |
| --- | --- |
| 权威 DNS | `app.gatu.ai` → `d2i25dhfjwco8b.cloudfront.net`（ET9CNVE6L1GWN）；`testnet.gatu.ai` → `dg9o2gpw3mt8q.cloudfront.net`（E3Q2SAX402CR9F）；`gatu.ai`/`www` → 网站分发 EP2DIBP3T7M3G |
| 分发源 | 两个分发均为 S3 `gatu-terminal-2026` + Lambda URL `gatu-terminal-api`；`/api/*`、`/api/leaderboard`、`/client-error-report`、`/mobile-agent-sync-ticket*` 路由到 Lambda，`/join*`、`/charting_library/*` 到 S3 |
| Lambda | nodejs22.x arm64 512 MB 30 s，`GATU_TRUST_VIEWER_ADDRESS=true`，`IPDATA_API_KEY` 已设；未设 `GATU_PUBLIC_ORIGIN`，`resolveRequestOrigin`（`edge/lambda-handler.ts:67`）在缺省时按请求 Host 推导，主网/测试网共用函数正确 |
| 运行时 SSR | 关闭；壳与文档页为预渲染产物，`request-middleware.ts` 保留 `GATU_RUNTIME_SSR` 仅作显式回退开关 |
| 发布验证 | p21 的 `deploy.mjs verify` 两 origin 全部 `ok`（CSP 哈希 enforce、preconnect 按网络、geo 真实判定、签名 Lambda POST、referral 头、边缘命中、测试网 noindex） |
| 移动配对 | `build-meta.mobileSync.store = single-process`，`createAndReveal`/`importFromQr` 均为 false，与"多实例前保持 gate 关闭"的约束一致 |
| CI | `.github/workflows` 无 EC2/SSH 部署步骤；`production-build.yml` 只把 `deploy/` 挂进容器运行 Caddy 配置校验测试 |

**尚未完成的收尾（runbook 第 11 步"退役 EC2"未执行）：**

1. EC2 `i-058ca09d0533fc11d`（`qq1`，t3.xlarge，ap-northeast-1，2026-09-07 启动）仍在运行。用 `--resolve app.gatu.ai:443:18.182.219.124` 探测：TLS 证书仍是 Let's Encrypt 签发给 `app.gatu.ai`，但响应带 `via: …cloudfront.net`、`server: AmazonS3`、`x-cache: Hit from cloudfront`，说明机上 Caddy 的上游已被改为 CloudFront（仓库 `deploy/Caddyfile` 仍写 `127.0.0.1:3000`，与线上配置存在漂移）。DNS 已不指向它，它不再承载用户流量，但持续产生费用并保留一条到生产的旁路。
2. 该实例安全组 `sg-0f3dbc84910144753` 对 `0.0.0.0/0` 开放 22、80、443。
3. 文档漂移：`deploy/README.md` 标题与开头仍把"单台 EC2 + Caddy"描述为当前部署（第 34 行才说明目标形态）；`docs/csp-inline-script-hashes-plan.md`、`docs/terminal-startup-performance-plan.md` 仍保留"EC2 退役后再做"的待办；ADR 0005 状态行已正确写明 2026-09-15 切换。
4. 代码遗留（有意保留、待退役时清理）：`deploy/deploy.sh`、`Caddyfile`、`gatu.service`、`runtime-listener.mjs` 等 EC2 部署文件；`scripts/serve-nitro.mjs` 与 `pnpm serve` 仍用于本地预览；`vite.config.ts` 的 Nitro `routeRules` CSP（计划文档说退役时删除）；`nitro({ compressPublicAssets: true })` 每次构建生成约 900 个 CloudFront 用不到的压缩副本。

## 修订（2026-09-17，同日稍后）

第 1 条中"机上 Caddy 的上游已被改为 CloudFront"是误判：当时的 `curl --resolve` 探测经过了本机 HTTP 代理（curl 日志显示连到 `127.0.0.1:6152`），`--resolve` 未生效，响应实际来自 CloudFront。改用 `--noproxy '*'` 重测：实例停机前后对旧 IP 的直连均无法得出该结论；停机后直连超时。Caddyfile 漂移一说随之撤回。用户已于 2026-09-17 10:35Z 停机该实例，退役收尾见[退役记录](2026-09-17-ec2-retirement.md)。

## 验证与限制

以上基于 AWS CLI 只读查询、权威 DNS 查询、对旧 IP 的 HTTPS 探测和仓库检索；未登录 EC2，无法确认机上 Caddy 配置的具体内容与是否还有 Node 进程。未做任何变更。

## 后续与替代关系

退役清单（需用户决策后执行，均为不可逆或对外操作）：停止 `gatu.service` 与 Caddy → 观察一个周期后停机/终止实例或至少收紧安全组 → 删除 Cloudflare 上任何残留的 EC2 记录 → 把 `deploy/README.md` 改写为历史资料并在开头指向 `deploy/cloudfront/README.md` → 删除 `routeRules` CSP 与 `compressPublicAssets` → 更新两份计划文档的待办。发布凭据换成受限 IAM 用户仍是独立待办。
