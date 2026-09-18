<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-mobile-sync-ticketless-implementation",
  "date": "2026-09-18",
  "title": "移动配对方案 B 实施：去服务端票据的纯客户端传输（信封 v3）",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "pairing-release"
  ],
  "summary": "按 ADR 0015 D7 方案 B 完成代码与文档：信封 v3、TTL 2 分钟、揭示后 60 秒单调时钟窗口、桌面本地 syncId、手机端 syncId 本地去重、v1/v2 信封提示刷新；删除票据客户端/服务端/路由、Lambda 503 桩、CloudFront 转发与 EC2 时代 mobile-sync 发布脚本。定向测试与 typecheck 通过；pnpm build 因既有 trade-terminal-page 预算超限失败（改动不在该 chunk）；全量 vitest 余 8 个文件 32 项基线红（干净 HEAD 同样失败）。静态托管实测、真机矩阵、对抗安全复核未执行，生产开关保持关闭。",
  "thread": null,
  "baseCommit": "2242015f",
  "commits": [],
  "sources": [
    { "path": "docs/mobile-sync-ticketless-transfer-plan.md" },
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "path": "apps/terminal/src/lib/mobile-sync/sync-core.ts" },
    { "path": "apps/terminal/src/lib/mobile-sync/imported-sync-ids.ts" },
    { "path": "apps/terminal/src/routes/mobile-agent-sync.tsx" },
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx" },
    { "path": "deploy/cloudfront/functions/terminal-request.js" }
  ],
  "supersedes": []
}
-->
# 移动配对方案 B 实施：去服务端票据的纯客户端传输（信封 v3）

## 背景与范围

用户在 2026-09-18 选定 ADR 0015 D7 方案 B，并在本会话确认「按方案开始实施」。分支 `claude/surface-tokens-touch-feedback`（worktree `.claude/worktrees/main-dev`），基线 `2242015f`，领先 `origin/main`（`3a80b360`）22 个提交、落后 0。本记录为同步记录。范围是规划文档实施顺序的第 1–4 步；第 5 步（打开生产开关）不在本次范围。

## 结论与依据

- 协议（`sync-core.ts`）：`MOBILE_SYNC_VERSION` 2 → 3，`MOBILE_SYNC_PAYLOAD_TTL_MS` 10 → 2 分钟，新增 `MOBILE_SYNC_QR_VISIBLE_MS` = 60 秒；`createMobileAgentSyncUrl` 不再接收 `syncId`，改为内部 `crypto.getRandomValues` 生成 16 字节并写入 AAD；版本字节为 1 或 2 的信封抛新错误码 `unsupported_version`，其余不匹配仍为 `invalid_envelope`。
- 桌面弹窗：删除 `issueMobileSyncTicket` 与三个票据消息码；`QrDeadlines` 只保留信封到期（墙钟）与 `visibleUntilMonotonicMs`（`performance.now()` + 60 秒）。
- 手机路由：删除票据消费与消费者 ID；导入顺序为 解密 → `extraAgents` 核验 → 注册 epoch → `syncId` 本地去重 → 持久化 → 激活 → 验证，成功后才写入去重记录。新增 `imported-sync-ids.ts`（localStorage，按 env + 主地址 + syncId，只存去重身份，到期 + skew 后清理，上限 32 条）。成功面板新增「若非本人导入请在桌面撤销」。
- 实施中发现并修复的既有缺陷：路由模块在导入期执行 `captureBootstrappedLocationHash()`，而错误类声明在其后，直接加载的坏二维码会触发 TDZ `ReferenceError`（旧代码的 `MobileAgentOneTimeTicketError` 有同样顺序问题）；已把错误类移到模块级捕获之前，由「v2 信封提示刷新」用例覆盖。
- 删除：票据客户端/服务端/策略及两份测试、`routes/mobile-agent-sync-ticket.ts`、Lambda 503 桩、`build-meta` 的 `ticketApiVersion` / `legacyRegisterDisabled` / `store`、vite 路由头规则、CloudFront `API_PATH_PATTERNS` 中的票据模式、`deploy/mobile-sync-{release,candidate}.mjs` 及测试、`mobile-sync-caddy.test.mjs`、两份旧票据夹具。
- 与规划的偏差：退役路径 `/mobile-agent-sync-ticket*` 不落入 SPA 壳，而是由 CloudFront viewer-request 函数与 `static-pages.ts` 直接回 404，`sw.js` 与 `serve-spa-static.mjs` 继续把它当非导航路径，满足「返回 404、不再转发 Lambda」的验收。`deploy.sh`（已退役历史资料）中引用被删脚本的步骤不可再执行，已在 `deploy/README.md` 顶部注明；`chart-asset-cache-policy.test.ts` 中钉住被删脚本的三条断言随之移除。
- 「Refresh both devices…」提示由 `<Trans>` 改为与本路由其余错误一致的 `t` 字符串状态，不再随语言热切换重译；该状态下草稿已清空，属可接受取舍。

## 验证与限制

全部为 2026-09-18 本地、基线 `2242015f` 之上的未提交工作区：

- `pnpm --filter @gatu/terminal typecheck` 通过；`pnpm exec biome check`（改动的 TS/TSX/MJS/JS 文件）通过。
- 定向 vitest 32 文件 511 用例通过（mobile-sync-*、mobile-agent-*、qr-classification、lambda-handler、static-pages*、build-meta、chart-library-preload、chart-asset-cache-policy、sw-navigation-cache、i18n 契约两份、AGENTS.md 钱包/引导/连接 UI 组）。该分组首次运行时 `mobile-agent-sync-route` 18 项失败，未保留日志，随后单独运行与两次分组复跑均 20/20 通过，原因未查明。
- `pnpm test:cloudfront` 36 通过；`node --test scripts/serve-spa-static.test.mjs scripts/validate-mobile-phone-access-device-validation.test.js` 29 通过。
- 全量 `pnpm --filter @gatu/terminal test`（与构建并行运行）：14 文件 37 项失败。其中 `chart-asset-cache-policy`（读取被删脚本）由本任务引起并已修复；其余隔离复跑后仍失败的 8 个文件 32 项（adaptive-modal-swipe-dismissal、desktop-positions-panel-shell、mobile-input-zoom-contract、mobile-order-risk-summary-contract、mobile-trade-tp-sl-contract、position-market-close-modal、referral-ui-contract、global-settings-slippage-effective）在干净 `2242015f` 的临时 worktree 中同样 8 文件 32 项失败，属基线红，未处理。修复后未再跑全量。
- `pnpm build`：vite 构建与 chunk 循环检查通过，预算检查失败——`trade-terminal-page` gzip 128,804 B，超基线 123,242 B 达 5,562 B（上限 +4,000）。产物中本次改动的代码位于 `mobile-agent-sync-modal-*.js` 与 `vendor-tanstack-router-*.js`，不在该 chunk；未在干净 HEAD 上单独构建对照。`routeTree.gen.ts` 已由插件重新生成。
- `pnpm i18n:extract`：新增 2 条、废弃 4 条票据文案；zh 已补 2 条译文，zh 余 5 条、其余四语各 32 条缺失为既有状态。
- 未执行：`serve:spa` 静态托管实测、真机矩阵（全部 Not run）、对抗安全复核、浏览器预览。未推送、未部署。

## 后续与替代关系

- 打开 `VITE_MOBILE_PAIRING_*` 之前：改写 `scripts/validate-mobile-phone-access-device-validation.js`、`deploy/fixtures/mobile-device-evidence.mjs` 与 `docs/mobile-phone-access-device-validation.md`（仍含 Ticket API 字段，已加「协议已被替代」提示），再按规划完成静态托管实测、Testnet 真机矩阵与安全复核。
- `trade-terminal-page` 预算超限与 8 个基线红文件需另行处理。
- 本记录延续 [2026-09-18-link-device-alignment](2026-09-18-link-device-alignment.md) 的 D7；不替代其 D1–D6 结论。
