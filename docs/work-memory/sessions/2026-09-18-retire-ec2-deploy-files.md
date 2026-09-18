<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-retire-ec2-deploy-files",
  "date": "2026-09-18",
  "title": "从仓库移除已退役的 EC2 部署代码与票据时期文档",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting",
    "docs-governance"
  ],
  "summary": "EC2 宿主 2026-09-17 停机、服务端票据 2026-09-18 移除之后，仓库里仍留着 12 个 EC2 部署文件和 6 份票据时期文档。本次把它们从工作树移除（原文保留在提交 5d393572），四个读取这些文件的 Vitest 契约改为钉住 CloudFront 模块或去掉已无对象的断言，现行文档的链接改指 CloudFront 手册，四份旧工作记录的 sources 改为该提交的永久链接。核对中发现一处迁移遗留缺口：旧脚本对 CCTP 主网赞助开关的二次确认校验在 CloudFront 发布流程里没有等价物，已在 cctp-deposits.md 如实写明，未补实现。",
  "thread": null,
  "baseCommit": "5d393572",
  "commits": ["87d6e51e"],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "path": "deploy/cloudfront/response-headers-policies.mjs" },
    { "path": "deploy/cloudfront/distribution-config.mjs" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "notes/index.md" },
    { "path": "docs/work-memory/sessions/2026-09-17-ec2-retirement.md" }
  ],
  "supersedes": []
}
-->
# 从仓库移除已退役的 EC2 部署代码与票据时期文档

## 背景与范围

用户问主分支是否有可以移除的旧架构文档，随后明确要求「旧部署代码也一起清掉」。前置事实：EC2 `i-058ca09d0533fc11d` 已于 2026-09-17 停机（见 `2026-09-17-ec2-retirement`），服务端配对票据已由 ADR 0015 D7 方案 B 移除（见 `2026-09-18-mobile-sync-ticketless-implementation`）。分支 `chore/retire-ec2-deploy` 基于 `5d393572`，即 PR #27 的分支头。本记录为同步记录。Across 相关文档与主目录分支按用户要求搁置，未触碰。

## 结论与依据

- 移除的部署文件（12 个）：`deploy/deploy.sh`、`Caddyfile`、`gatu.service`、`runtime-listener.mjs`、`validate-caddy-forwarded-headers.mjs` 及测试、`validate-production-env.mjs` 及测试、`deploy-bootstrap.test.mjs`、`deploy-health-check.test.mjs`、`env.runtime.example`、`deploy/README.md`。移除前逐个核对引用：只被彼此、待删文档、历史记录与一份根目录旧审查引用；CI 工作流、`package.json`、lefthook 与应用源码都不引用它们。
- 保留的 `deploy/` 内容及原因：`referral-uri-guard.cjs`、`resolve-client-asset.mjs`（及测试）、`verify-chart-build.mjs`、`manifests/` 由 `.github/workflows/production-build.yml` 调用；`cloudfront/` 是现行发布工具；`fixtures/` 是真机证据校验器；`env.build.example` 改写为 CloudFront 发布用的构建环境模板。
- 移除的文档（6 份）：`docs/mobile-sync-production-readiness.md`、`mobile-sync-production-readiness-2026-09-11.md`、`mobile-sync-release-hardening-plan.md`、`mobile-sync-release-hardening-verification.md`、`mobile-sync-ticket-remediation-plan.md`、`mobile-sync-implementation-verification.md`。它们描述的票据 API、EC2 `prepare` / `promote` 流程都已不存在。`notes/index.md` 与 `docs/README.md` 的对应条目没有删除，而是追加了带日期的更正并写明原文所在提交，符合「追加更正、不改写历史」。
- 测试改写：
  - `hyperliquid-resource-hints.test.ts` 原先解析 Caddyfile，现在导入 `response-headers-policies.mjs` 与 `distribution-config.mjs`，断言各网络的 API 源等于 SDK 常量、只有 trade 策略带 `link` preconnect、`TRADE_PATH_PATTERNS` 与 `TRADE_ROUTE_PREFIXES` 一一对应。`.mjs` 没有类型声明，用带接口的动态导入通过类型检查。
  - `security-policy-docs.test.ts` 的 CSP 归属断言改为：Vite 路由规则使用 `securityHeaders`，CloudFront 策略模块从 `security-headers.ts` 导入，CloudFront 手册指向同一来源。原先「README 是否提到 `'unsafe-inline'` 与代码一致」的断言随 README 移除，保留主文档不可被嵌入、图表包仅同源可嵌入两条。
  - `chart-asset-cache-policy.test.ts` 去掉全部 Caddyfile、`deploy.sh`、systemd 断言；对象级缓存策略、`/join` 头与边缘 404 已由 `pnpm test:cloudfront`（`deploy.test.mjs`、`response-headers-policies.test.mjs`、`functions.test.mjs`）覆盖，未在 Vitest 重复。
  - `seo.test.ts` 去掉对 `deploy.sh` 里 `SOCIAL_IMAGE_PATH` 的断言。
- 工作记录：`2026-09-12-caddy-config-mismatch`、`2026-09-12-pairing-release`、`2026-09-17-ec2-to-cloudfront-migration-audit`、`2026-09-17-ec2-retirement` 的 `sources` 中指向已删文件的路径改为 `5d393572` 的 GitHub 永久链接（校验器只接受现存路径或 https 链接）；正文未改。`topics.json` 的 `static-hosting` 规范文档由 `deploy/README.md` 改为 `deploy/cloudfront/README.md`。
- 顺带更正的过时表述：ADR 0002 仍写「票据路由 503、替代传输待定」；`mobile-phone-access-scanner-prd.md` 仍把 ticket API v2 / envelope v2 称为现行实现（顶部追加更正，正文保留）；`apps/terminal/README.md` 仍写 Nitro 执行「pairing handlers」；`apps/website/README.md` 把终端部署称为 Node/systemd/Caddy；`geo-api-server.ts` 的注释把客户端 IP 来源写成 Caddy。

## 发现的遗留缺口（未修复）

`deploy/validate-production-env.mjs` 除了校验 EC2 主机文件，还强制一条发布期规则：构建环境里的 `VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED` 必须与运行时环境文件里的 `GATU_CCTP_MAINNET_RELEASE_MODE`（`external-only` / `both`）一致，否则拒绝构建；同时要求配对 CREATE 开启时 IMPORT 也开启、禁止 `.env.production*` 覆盖 `.env.local`。该脚本只由 `deploy.sh` 调用，EC2 退役后就已不再执行；CloudFront 发布流程（`deploy/cloudfront/deploy.mjs`）没有等价的构建环境检查。本次删除不改变线上行为，但 `docs/cctp-deposits.md` 原文仍声称「部署校验器要求模式与开关一致」，已改为现状并标注缺口。是否在 CloudFront 流程补一个构建环境校验需要另行决定。

## 验证与限制

2026-09-18 本地，工作区基于 `5d393572`：

- 四个改写的测试文件 26 个用例通过；改动的 TypeScript 文件 Biome 通过；`pnpm --filter @gatu/terminal typecheck` 通过。
- 全量 `pnpm --filter @gatu/terminal test`：576 个文件中 571 通过、1 跳过、4 失败（6,357 用例通过、4 失败）。4 个失败都是超时（`positions-panel-preload`、`chart-store`、`establish-connection-modal`、`global-modals-hip3-disclaimer` 两条，耗时 5–15 秒），当时同机并行在跑类型检查、CloudFront 测试与 dev 服务器；这四个文件单独重跑 49/49 通过，且都不读取本次移除的文件。按偶发的负载超时记录，未改这些测试。
- `pnpm test:cloudfront` 36 通过；`node --test deploy/resolve-client-asset.test.mjs` 20 通过。
- 用一次性脚本扫描全仓 330 个 Markdown 文件的相对链接：由本次改动造成的断链只剩 `notes/session-logs/2026-09-12-documentation-review.md` 里指向 `docs/mobile-sync-production-readiness.md` 的一条，该文件属于「原路径与正文保持不变」的历史会话笔记，未改。其余 8 条断链在改动前就存在（`neutral-surface-audit.md`、`legal/docs.md` 的站内路径等），不在本次范围。
- 未执行：生产构建、任何发布或线上核对。本次不改运行时代码（除一处注释），未做浏览器验证。
- 根目录 `launch-review-2026-07-21.md`、`review-a2e6c5b2.md` 与 `docs/across-deposit-addresses.md`、`docs/terminal-startup-performance-plan.md` 里对已删文件的纯文本提及保留：前两者是历史审查，后两者一份属搁置的 Across 工作、一份是带日期的计划条目。

## 后续与替代关系

- 本记录补充 `2026-09-17-ec2-retirement`：那次把 EC2 文件标为历史资料，这次从工作树移除。
- 待决定：是否为 CloudFront 发布补构建环境校验（见上）；根目录 26 份旧审查报告是否整理仍未决定。
