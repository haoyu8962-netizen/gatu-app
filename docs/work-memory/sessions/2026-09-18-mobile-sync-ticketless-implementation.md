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
  "commits": ["750a5113", "e8ac17d7", "9b589891"],
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

## 验收补充（2026-09-18，同日第二阶段，提交 `a2e27468` 的干净工作区）

用户要求先完成方案 B，并确认改动落在新架构（CloudFront + S3 + Lambda、SPA 静态壳）的文件上。

- 新架构核对：`750a5113` 的运行时改动在 `src/edge/lambda-handler.ts`（Lambda）、`deploy/cloudfront/distribution-config.mjs` 与 `functions/terminal-request.js`（CloudFront）、客户端协议/弹窗/导入路由与 `build-meta`（静态 `build-meta.json` 由 vite 插件发出）。被删除的是旧运行时的 Nitro 服务端路由 `routes/mobile-agent-sync-ticket.ts`、`one-time-ticket-server.ts` 与 EC2 时代的 `deploy/mobile-sync-*` 脚本；`vite.config.ts` 的 Nitro route rules、`static-pages.ts` 与 `routes/build-meta[.]json.ts` 只服务本地 `pnpm serve` 预览，已保持一致。`deploy/README.md`、`deploy/deploy.sh`、`Caddyfile` 属已退役的 EC2 资料，只在 README 顶部加了退役说明，没有在其上继续开发。`.github/workflows` 与 CloudFront 发布脚本不引用任何被删文件。`pnpm --filter @gatu/terminal build:lambda` 通过（225.75 kB），产物内票据相关字符串为 0。
- 静态托管验收、真机模板改写与各项结果见 [方案 B 规划](../../mobile-sync-ticketless-transfer-plan.md) 的「验收执行记录」。本阶段新增改动：`scripts/serve-spa-static.mjs`（退役路径及子路径 404、不转发 API 源）及其测试；`scripts/validate-mobile-phone-access-device-validation.js`、`deploy/fixtures/mobile-device-evidence.mjs`、`docs/mobile-phone-access-device-validation.md`（`Envelope version = 3`、RD-2/TC-2 新语义、构建身份取自 `build-meta.json`、去掉 EC2 `prepare`/`promote`）。`node --test` 两个脚本 29 通过，`pnpm test:cloudfront` 36 通过，`git diff --check` 通过。
- 顺带发现但未处理：`serve-spa-static.mjs` 仍把 `/build-meta.json` 归为 server-only（404 或转发），而新架构里它是随客户端产物发出的静态文件（CloudFront 函数按文件扩展名放行到 S3）；该模拟器条目早于静态 `build-meta.json`（`fe22fb61` 对 `5944465d`），与方案 B 无关，留待单独处理。
- 预算修复半成品已从工作区移出，保存在 Git 忽略的 `.worklog/2026-09-18/budget-lazy-modals/wip.patch`（`git apply` 可恢复，当前不能通过类型检查），不属于本任务。

## 安全复核与修复（2026-09-18，第三阶段，基线 `e8ac17d7`）

一次只读对抗审查（子代理，约 27 分钟、129 次工具调用；在 `a2e27468` 上跑了 5 个指定测试文件 90 用例通过，并用真实 `hl-react` / `sync-core` 代码写了两个一次性复现脚本）。完整结论表在 [方案 B 规划](../../mobile-sync-ticketless-transfer-plan.md) 的「安全复核结论」。要点：

- F3 是本任务引入的真实缺陷：`750a5113` 把 `syncId` 去重放在 `captureAgentRegistrationEpoch` 之后，重复导入命中去重后走回滚，`cancelAgentRegistrationEpochAndRemove(epoch, undefined)` 先把会话写成 `closing`，再因槽位里是有效 Agent 返回 `unsafe_cleanup_target`，结果原本可用的手机访问失效、私钥滞留在 localStorage。实施时我注意到了回滚会被触发，但错误地判断为与旧票据拒绝路径等价，没有核对 `cancel` 在「槽位已有有效 Agent」时的行为；路由单测把该函数 mock 成 `cancelled`，所以全绿。修复：去重移到解密之后、`extraAgents` 核验与 epoch 捕获之前。新增断言：重复路径不调用 `waitForExpectedMobileAgent`、`captureAgentRegistrationEpoch`、`cancelAgentRegistrationEpochAndRemove`；把去重挪回旧位置该用例即失败（变异测试），恢复后 20/20。
- F2 是本任务写错的文档：把 2 分钟 TTL 写成持有者凭据的暴露上限。片段同时含密文与 AES 密钥，TTL、60 秒窗口与去重只约束诚实客户端；真实暴露期到 Agent 过期（30 天）或桌面撤销。已改正四份文档与 CHANGELOG；用户当初选定方案 B 时看到的「截图后 2 分钟内」风险描述不准确，已在规划文档注明。
- F4：解密时拒绝 `createdAtMs` 超前本机超过 skew 的信封（`not_yet_valid`）；`draft-storage.ts` 新增 `getMobileSyncRemainingLifetimeMs`，手机持有已载入二维码与 sessionStorage 草稿的上限为 TTL + skew，路由到期计时改用同一规则（此前不含 skew）。
- 小项：应用内扫码对 `unsupported_version` 显示「两端刷新」；桌面弹窗 `VisibleQrPanel` 的 React key 由含密钥的 URL 改为 `syncId`。
- 未处理并需要决策或另行立项：F1（系统相机路径会把完整链接留在浏览器历史 / 历史同步，既有设计，未在真机证实）、F5（片段擦除在产物里并非零依赖最先执行）、CloudFront 对 `/mobile-agent-sync` 缺 `no-store` / `no-referrer`、擦除失败无兜底、路径大小写、Import 前不显示 owner、dev StrictMode。
- 提交说明：`9b589891` 引入的新文案的本地化目录（含中文译文）被 lefthook 的 `lingui-extract` 钩子自动暂存进了前一个提交 `909999d0`（`orderbook-boot` 测试预热），HEAD 上内容一致，仅提交分组偏了一格；未推送，未改写历史。
- 验证（2026-09-18，本地，修复后的工作区）：`pnpm --filter @gatu/terminal typecheck` 通过；改动的 9 个 TS/TSX 文件 Biome 通过；全量 `pnpm --filter @gatu/terminal test` 572 文件 6,360 用例通过、1 跳过（首次运行只有 `orderbook-boot` 的冷导入在全并发下超过 5 秒，单跑通过，与本任务无关；已另行提交文件级 `beforeAll` 预热后全绿）；`scripts` 两个 node 测试 29 通过，校验器对仓库模板的结构检查通过；`pnpm i18n:extract` 新增 1 条文案并补了中文译文，zh 余 5 条缺失为既有状态。修复后的产物未重新构建，也没有在浏览器里复测重复导入与未来时间戳两条路径，依据是单测与变异测试。

## 后续与替代关系

- 打开 `VITE_MOBILE_PAIRING_*` 之前：改写 `scripts/validate-mobile-phone-access-device-validation.js`、`deploy/fixtures/mobile-device-evidence.mjs` 与 `docs/mobile-phone-access-device-validation.md`（仍含 Ticket API 字段，已加「协议已被替代」提示），再按规划完成静态托管实测、Testnet 真机矩阵与安全复核。
- `trade-terminal-page` 预算超限与 8 个基线红文件需另行处理。
- 本记录延续 [2026-09-18-link-device-alignment](2026-09-18-link-device-alignment.md) 的 D7；不替代其 D1–D6 结论。
