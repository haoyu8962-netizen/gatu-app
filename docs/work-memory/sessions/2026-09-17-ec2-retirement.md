<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-ec2-retirement",
  "date": "2026-09-17",
  "title": "退役 EC2 + Caddy + Nitro 常驻进程，仓库切换为 CloudFront 单一架构",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting",
    "docs-governance"
  ],
  "summary": "正文已报告 EC2、EIP、卷及安全组清理、受限 IAM 发布身份切换；后续旧部署文件已从工作树移除。云端结果为当时来源报告，本轮未复查。",
  "thread": null,
  "baseCommit": "bde33928b43c1823ddd716d728accce71ef979e5",
  "commits": ["e1965d13", "7ba2eb13", "075ab75f", "eec4d2d3", "812b163e", "87d6e51e"],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "url": "https://github.com/zora4523-bot/gatu-app/blob/5d3935721f070075c5d976d61a3c27d12b5dc607/deploy/README.md" },
    { "path": ".github/workflows/production-build.yml" },
    { "path": "docs/work-memory/sessions/2026-09-17-ec2-to-cloudfront-migration-audit.md" }
  ],
  "supersedes": []
}
-->
# 退役 EC2 + Caddy + Nitro 常驻进程

## 背景与范围

[迁移审计](2026-09-17-ec2-to-cloudfront-migration-audit.md)确认流量层已全部在 CloudFront + S3 + Lambda，剩余收尾是退役 EC2 与清理仓库中的旧架构描述。用户回复"直接切换吧，我已经停止了服务器"，并要求把代码切到新架构并记录。AWS 查询：`i-058ca09d0533fc11d` 状态 `stopped`，`StateTransitionReason: User initiated (2026-09-17 10:35:23 GMT)`；绕过本机代理直连旧 EIP `18.182.219.124` 超时（`curl --noproxy '*' --resolve …` 退出码 28）。

## 结论与依据

仓库改动（本记录同批提交）：

| 位置 | 改动 | 依据 |
| --- | --- | --- |
| `apps/terminal/vite.config.ts` | `nitro({ compressPublicAssets: false })` | CloudFront/S3 不使用 Nitro 预压缩副本；启动性能计划 P6/P8 待办 |
| `.github/workflows/production-build.yml` | 删除 Caddyfile 校验、EC2 发布脚本校验（deploy-bootstrap、deploy-health-check、validate-caddy-forwarded-headers、validate-production-env、mobile-sync-release/candidate、resolve-client-asset）与 Caddy 票据 HTTP 校验三个步骤；保留 `scripts/*` 构建校验并新增 `pnpm test:cloudfront`（34 项，本地通过） | 这些脚本只被 `deploy/deploy.sh` 使用；Actions 额度有限（见记忆）；CloudFront 工具此前不在 CI |
| `deploy/README.md` | 标题改为"历史资料"，开头加退役说明并指向 `cloudfront/README.md`；正文保留 | runbook 第 11 步"转为历史资料" |
| `deploy/cloudfront/README.md` | 第 10、11 步标记完成日期；回滚改为重建上一提交或 S3 桶版本；差异小节标题改为"已退役" | 事实更新 |
| `docs/adr/0005-spa-static-shell.md` | 状态行补 2026-09-17 停机退役与新回滚方式 | ADR 状态需反映现状 |
| `docs/csp-inline-script-hashes-plan.md`、`docs/terminal-startup-performance-plan.md` | 标注 EC2 已退役、预压缩已关闭、`/client-error-report` 别名与 `routeRules` 保留原因 | 计划待办闭环 |
| `agent.md`、`apps/terminal/README.md` | `pnpm serve` 注明仅本地预览，生产为 CloudFront | 命令语义 |

有意保留、未删除：`deploy/deploy.sh`、`Caddyfile`、`gatu.service`、`runtime-listener.mjs`、各 `mobile-sync-*`/`validate-*` 脚本及测试（历史资料，多份验证文档引用）；`scripts/serve-nitro.mjs` 与 `pnpm serve`（本地预览）；`vite.config.ts` 的 `routeRules`（本地预览的头部与缓存策略，`chart-asset-cache-policy.test.ts` 与 `security-policy-docs.test.ts` 钉住，删除需连同契约迁移）；Nitro `/client-error-report` POST 别名（待确认无旧客户端）。

未做的 AWS 变更（需用户决定）：终止实例并释放 EIP `eipalloc-029c6d39b3b71adeb`（停机实例的 EIP 会计费）；收紧或删除安全组 `sg-0f3dbc84910144753`（22/80/443 对全网开放）；Cloudflare 上若仍有指向 `18.182.219.124` 的记录需删除（权威 DNS 查询显示 `app`/`testnet`/`www` 均已指向 CloudFront）；发布凭据换成受限 IAM 用户。

## 验证与限制

- `pnpm build`（`compressPublicAssets: false`）通过：预算与 chunk 循环检查正常，`.output/public` 下 `.br/.gz/.zst` 预压缩副本为 0（此前每次构建约 915 个）。
- `node --test` 保留的四个构建校验：47/47；`pnpm test:cloudfront`：34/34；工作流 YAML 解析通过（步骤顺序：checkout → pnpm → node → install → 构建校验 → CloudFront 工具测试 → 既有 Vitest 组）。
- 未运行 EC2 脚本测试（已退出 CI，文件保留）；未验证 `pnpm serve` 在无预压缩副本时的本地预览（Nitro 在缺少副本时直接返回原文件，早前曾因旧进程引用被替换的 `.br` 报错，属旧进程问题）。
- 本记录全部为仓库改动与本地检查；AWS 侧只做了只读查询，实例停机由用户执行。

## AWS 资源清理（2026-09-17，用户指示后执行）

执行前核对：区域 ap-northeast-1 仅此一台实例，`disableApiTermination=false`，根卷 `vol-032c323296cf98ab8` 随终止删除，EIP `18.182.219.124` 仅关联它，安全组 `launch-wizard-4`（`sg-0f3dbc84910144753`）仅被其网卡引用。执行顺序与结果：

1. `disassociate-address eipassoc-09d8d17347ca34cf4` → `release-address eipalloc-029c6d39b3b71adeb`：账号内 EIP 数量 0。
2. `terminate-instances i-058ca09d0533fc11d`（stopped → terminated），`wait instance-terminated` 完成；根卷随之删除，区域内卷数量 0。
3. 撤销安全组 22/80/443 对 `0.0.0.0/0` 的入站规则（3 次 `Return: true`，规则数 0），随后 `delete-security-group` 成功。
4. 终态：实例 `terminated`，EIP 0，卷 0，剩余安全组仅 VPC 默认组。

不可恢复：机上 `/opt/gatu` 的历史发布目录与 Caddy 证书随根卷一并删除；仓库与 S3 桶版本是唯一的产物来源。

追加（同日，用户指示）：删除遗留的 EC2 Instance Connect Endpoint `eice-08b8c8b3812084477`（`create-complete` → `delete-in-progress` → `delete-complete`，约 30 s），随后删除 `launch-wizard-1`（`sg-0bf4583629084af39`，曾被该端点引用且全协议对全网开放）、`launch-wizard-2`（`sg-0ea49dcbdd294d561`，未引用，全协议开放）、`launch-wizard-3`（`sg-0d865661671af658d`，未引用，开放 22）。终态：ap-northeast-1 安全组仅剩 VPC `default`，网卡 0，Instance Connect Endpoint 0，实例 0（terminated 记录会在约一小时后消失），EIP 0，卷 0。

## CI 修正（2026-09-17，eec4d2d3 的 Production Builds 失败后）

首轮 CI 改动漏掉了后续三个 EC2 时代的步骤：`mobile-sync-release.mjs attest`（对 Nitro 产物做票据协议与进程重启验收）、`mobile-sync-caddy.test.mjs` + `mobile-sync-candidate.test.mjs`（需要已删除步骤提取的 `CADDY_BINARY`，四个矩阵作业在此失败）、`Record verified mobile artifact identity`（读取前者生成的 `.gatu-mobile-sync.json`）。三步一并移除：它们验收的是 EC2 上的 Nitro 常驻进程与 Caddy 代理别名，线上已由 Lambda 处理票据端点，`deploy.mjs verify` 的"signed lambda post"覆盖线上协议，`src/lib/tests/mobile-sync-*` 覆盖协议单元。保留"Verify production lazy client graph"（对构建产物起 Nitro 校验客户端图，与托管无关）与"Verify TradingView package and compressed build assets"（`verify-chart-build.mjs` 在无预压缩副本时本地通过，退出码 0）。

## 发布凭据切换到受限 IAM 用户（2026-09-17，用户指示后执行）

- 现状核对：IAM 用户 `gatu-edge` 与本机 `gatu-edge` profile 早在 2026-09-13 已建立，但策略 `gatu-edge-deploy` v1 含 `cloudfront:*`/S3 桶管理/Lambda 创建等建站期权限，且 `deploy.mjs` 未指定 profile，当天 p21 发布实际以 root 密钥执行。
- 策略收紧：以仓库文件 `deploy/cloudfront/iam/gatu-edge-release-policy.json` 创建 `gatu-edge-deploy` v2 并设为默认：`sts:GetCallerIdentity`；`gatu-terminal-2026` 与 `gatu-dist-2026` 的桶列举与对象读写删；三个分发（ET9CNVE6L1GWN、E3Q2SAX402CR9F、EP2DIBP3T7M3G）的配置读写与失效；两个 CloudFront 函数的 describe/get/update/publish；`gatu-terminal-api*` 的代码更新、版本发布与只读；Lambda 日志只读；ACM 只读（us-east-1）。去掉了 `cloudfront:*`、桶管理、Lambda 创建/配置/URL/权限、`iam:PassRole`、ACM 申请与删除。
- 工具：`deploy.mjs` 新增 `--profile`（默认 `AWS_PROFILE`，再默认 `gatu-edge`），每条 `aws` 命令附加 `--profile`；带 `--execute` 时先 `sts get-caller-identity`，ARN 为 `:root` 时拒绝发布（`assertReleaseIdentity`）。`deploy.test.mjs` 新增两组用例，`pnpm test:cloudfront` 36/36。
- 验证（`--profile gatu-edge`）：允许——三个分发 `get-distribution-config`、`describe-function`、`s3api head-object`、`s3 ls gatu-dist-2026`、`lambda get-function-configuration`、`list-invalidations`；拒绝——`ec2 describe-instances`（UnauthorizedOperation）、`iam list-users`、`s3 ls`（全桶）、`lambda update-function-configuration`（AccessDenied）。
- root 密钥：`aws iam update-access-key --status Inactive`（未删除；如需可在控制台以 root 身份重新启用或删除）。停用后 `--profile default` 返回 InvalidClientTokenId，`gatu-edge` 正常。此后本机需要账号级权限的操作（IAM、EC2 清理等）不再可用，需以 root 登录控制台或另建管理员用户。
- 网站发布（`gatu-dist-2026` + EP2DIBP3T7M3G）同样改用 `--profile gatu-edge`，已记入记忆。

## 后续与替代关系

- 已完成：终止实例、释放 EIP、删除安全组、发布凭据切换到受限 IAM 用户（见上文）。旧架构相关待办已清零。
- 后续代码清理：把 `routeRules` 的头部契约迁到 CloudFront 响应头策略测试后删除 Nitro 侧 CSP；确认无旧客户端后删除 `/client-error-report` 别名；可将 `deploy/` 下 EC2 文件移入 `deploy/legacy-ec2/`（需同步更新多份验证文档的路径）。

## 周整理追加（2026-09-21）

原“保留旧部署文件、后续可移目录”已由 [文件移除记录](2026-09-18-retire-ec2-deploy-files.md) 更新。资源清理、凭据切换及历史 CI 失败保留其原始日期和范围；本轮仅整理 Git 与文档证据。 本次依据与版本边界见 [周整理记录](2026-09-21-weekly-memory-review.md)。
