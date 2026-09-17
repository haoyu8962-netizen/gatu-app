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
  "summary": "用户 2026-09-17 10:35Z 停机 EC2 i-058ca09d0533fc11d；仓库随之关闭 Nitro 预压缩、CI 去掉 Caddyfile 校验与 EC2 发布脚本测试并改跑 CloudFront 工具测试、deploy/README.md 标为历史资料、ADR 0005 与计划文档补退役状态；routeRules CSP 因两个契约测试仍钉住而留待后续。",
  "thread": null,
  "baseCommit": "bde33928b43c1823ddd716d728accce71ef979e5",
  "commits": [],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "path": "deploy/README.md" },
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

## 后续与替代关系

- 已完成：终止实例、释放 EIP、删除安全组（见上节）。仍待办：发布凭据换成受限 IAM 用户。
- 后续代码清理：把 `routeRules` 的头部契约迁到 CloudFront 响应头策略测试后删除 Nitro 侧 CSP；确认无旧客户端后删除 `/client-error-report` 别名；可将 `deploy/` 下 EC2 文件移入 `deploy/legacy-ec2/`（需同步更新多份验证文档的路径）。
