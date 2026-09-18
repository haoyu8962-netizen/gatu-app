# 移动配对方案 B：去服务端票据的纯客户端传输（实施规划）

状态：已选定（2026-09-18，用户决定）；实施顺序 1–4 已于 2026-09-18 完成（任务记录 [2026-09-18-mobile-sync-ticketless-implementation](work-memory/sessions/2026-09-18-mobile-sync-ticketless-implementation.md)），静态托管实测已执行（见下方「验收执行记录」）；对抗安全复核的结论待补入任务记录；真机矩阵、第 5 步（打开生产开关）与线上发布尚未执行。归属决策见 [ADR 0015](adr/0015-link-device-alignment.md) D7。实施偏差：退役路径 `/mobile-agent-sync-ticket*` 由 CloudFront viewer-request 函数与静态页分类器直接返回 404（而非落入 SPA 壳），Service Worker 与 `serve:spa` 继续把它当作非导航路径；真机矩阵模板与 `scripts/validate-mobile-phone-access-device-validation.js` 已于同日改写为无票据协议。

## 目标与不变量

- 桌面 → 手机的二维码不再依赖任何服务端状态；CloudFront + S3 + Lambda 静态托管即可完整工作，开关可在生产打开。
- 保留全部客户端加固：AES-GCM 片段信封（AAD 绑定 origin / env / 主地址 / 有效期）、精确 owner 审批与 `extraAgents` 核验、显式 Import、30 天 `Mobile valid_until` Agent、桌面撤销、4 秒按住显示、失焦/隐藏/Escape 取消、自动关闭、引导时片段擦除、开关失败关闭。
- 明确放弃的两个属性并写入文档：「第二部手机兑换同一码被拒」与「服务重启后旧码失效」。它们都不能阻止二维码被截取；由更短的可见窗口与信封 TTL 替代。

## 参数变更

| 项 | 现值 | 目标 | 说明 |
| --- | --- | --- | --- |
| `MOBILE_SYNC_PAYLOAD_TTL_MS`（信封 TTL） | 10 分钟 | 2 分钟 | 可见窗口 60 秒 + 扫码/打开/Import 余量 |
| `MOBILE_SYNC_CLOCK_SKEW_MS` | 60 秒 | 60 秒 | 不变 |
| 二维码可见窗口 | 票据剩余（≤60 秒） | 揭示后 60 秒（本地单调时钟） | 与官方一致；到期自动关闭并作废本地 URL |
| 草稿（手机 sessionStorage）过期 | 信封 `expiresAtMs` + skew | 同上 | 随 TTL 缩短自动收紧 |
| `syncId` | 服务端签发的 22 位票据 ID | 桌面本地 `crypto.getRandomValues` 生成的 16 字节 ID | 仍写入 AAD，用作手机端「同一码已导入」的本地去重键 |
| `MOBILE_SYNC_VERSION` | 2 | 3 | 手机拒绝 v2 信封（`qr-upgrade-required`），避免旧桌面产物与新手机混用 |

## 代码改动清单（按删除、改写、新增分组）

删除：
- `apps/terminal/src/lib/mobile-sync/one-time-ticket-client.ts`、`one-time-ticket-server.ts`、`one-time-ticket-policy.ts` 及对应测试 `mobile-sync-one-time-ticket-client.test.ts`、`mobile-sync-one-time-ticket-server.test.ts`。
- 路由 `apps/terminal/src/routes/mobile-agent-sync-ticket.ts`（`routeTree.gen.ts` 由插件重新生成）；`edge/lambda-handler.ts` 的 503 桩与 `MOBILE_SYNC_TICKET_PATH`；`lib/static-pages/static-pages.ts` 中的票据路径例外。
- `deploy/cloudfront/distribution-config.mjs` 与 `functions/terminal-request.js` 中 `/mobile-agent-sync-ticket*` 的 Lambda 转发；`deploy/mobile-sync-release.mjs`、`mobile-sync-candidate.mjs`、`mobile-sync-caddy.test.mjs`、`deploy/fixtures/mobile-sync-legacy-*.mjs` 及其测试（已随 EC2 退役失效）。
- `config/build-meta.ts` 的 `mobileSync.ticketApiVersion` / `store` 字段（保留 `createAndReveal` / `importFromQr`）。

改写：
- `sync-core.ts`：`createMobileAgentSyncUrl` 内部生成 `syncId`，输入不再要求票据 ID；版本升至 3；TTL 改为 2 分钟；`validateMobileSyncEnvelope` 对 v2 返回 `qr-upgrade-required`。
- `mobile-agent-sync-modal.tsx`：`handleRevealQr` 去掉 `issueMobileSyncTicket` 与 `qr-ticket-rejected` / `qr-service-unavailable` / `qr-upgrade-required` 三个桌面侧错误码；`QrDeadlines` 只保留信封到期与「揭示时刻 + 60 秒」的单调时钟；倒计时与到期逻辑沿用现有 `remainingQrLifetimeMs`。
- `routes/mobile-agent-sync.tsx`：删除 `consumeMobileSyncTicket` 与 `MobileAgentOneTimeTicketError`；Import 顺序改为 解密 → `extraAgents` 核验 → 注册 epoch 校验 → 本地去重（`syncId` 已导入则拒绝）→ 持久化 → 激活。
- `mobile-agent-qr-scanner.tsx` / `draft-storage.ts`：无协议改动，仅随 TTL 常量变化。
- `docs/hyperliquid-signing.md`、`docs/runtime-guardrails.md` §8、`docs/trading-onboarding.md`、`docs/email-trading-signing.md`、`deploy/cloudfront/README.md`、`apps/terminal/README.md` 路由表、`CHANGELOG.md`：删除票据描述，写明纯客户端传输与放弃的属性。
- `docs/adr/0005-spa-static-shell.md` 追加说明：票据端点已按 ADR 0015 D7 移除。

新增：
- 手机端「已导入的 syncId」本地记录（localStorage，按 env + 主地址，保留到信封到期 + skew 后清理），用于同一码在同一手机重复打开时给出「此二维码已导入」。
- 回归测试：v2 信封被拒；TTL 2 分钟边界；揭示后 60 秒自动关闭（含墙钟滞后用例）；重复 Import 拒绝；Lambda 处理器对 `/mobile-agent-sync-ticket` 返回 404 而非 503；CloudFront 函数不再把该路径转发到 Lambda。

## 实施顺序

1. 建任务记录；先改 `sync-core.ts` 与其测试（协议 v3、TTL、内部 `syncId`），保持桌面/手机双端同时切换，不做兼容期。
2. 桌面弹窗与手机路由去票据；更新两端测试。
3. 删除服务端、边缘与部署脚本残留；重新生成路由树；`pnpm build` 校验 chunk 与预算。
4. 文档与 CHANGELOG 同步；ADR 0015 D7 状态改为「已实施」。
5. 在 `deploy/env.build.example` 与生产构建环境将 `VITE_MOBILE_PAIRING_CREATE_ENABLED` / `VITE_MOBILE_PAIRING_IMPORT_ENABLED` 置为 `true` 前，先完成下方验收。

## 验收标准

- 单元：AGENTS.md「钱包签名、引导与连接 UI」组、`mobile-agent-sync-modal`、`mobile-agent-sync-route`、`mobile-agent-qr-scanner`、`qr-classification`、`mobile-sync-core`、`mobile-sync-draft-*`、`mobile-sync-bootstrap-fragment`、`lambda-handler`、`deploy/cloudfront/*.test.mjs` 全绿；typecheck、Biome 通过。
- 静态托管：`pnpm build` 后用 `serve:spa` 打开 `/mobile-agent-sync`，直接加载带片段的 URL 能擦除地址栏并进入 Import；`/mobile-agent-sync-ticket` 返回 404。
- 真机：按 `docs/mobile-phone-access-device-validation.md` 在 Testnet 用隔离 owner 跑 RD-1…RD-8（去掉票据相关行），记录不含二维码内容的证据；未跑真机不得声称可发布。
- 安全复核：一次对抗审查确认没有任何路径把信封或密钥写入查询串、日志、遥测或非片段 URL；信封 TTL 与可见窗口以本地单调时钟为准。

## 验收执行记录（2026-09-18，本地，提交 `a2e27468` 的干净工作区）

以下是实际执行的结果；没有执行的项目明确标为未执行，单元测试与本地静态托管不能替代真机验收或发布。

- 单元：通过。定向 32 文件 511 用例与全量 `pnpm --filter @gatu/terminal test` 572 文件 6,356 用例通过；`pnpm test:cloudfront` 36 通过；`pnpm --filter @gatu/terminal typecheck` 与改动文件的 Biome 通过（任务记录有逐项数字）。
- 新架构产物：`pnpm --filter @gatu/terminal build:lambda` 通过（`dist-lambda/index.mjs` 225.75 kB），产物内没有任何票据代码，路由常量只有 `/api/geo`、`/api/referral-geo`、`/api/client-error-report`、`/client-error-report`、`/api/leaderboard`、`/api/health`；`.github/workflows` 与 `deploy/cloudfront/` 的发布脚本不引用任何被删除的文件。
- 静态托管：通过。以两个配对开关开启的本地构建（`build-meta.json` 为 `{"createAndReveal":true,"importFromQr":true}`，只剩两个字段）经 `scripts/serve-spa-static.mjs` 托管，用 Playwright（390 px、文档可见）验证：
  - `GET`/`POST`/`HEAD /mobile-agent-sync-ticket` 与子路径 `/consume` 均返回 JSON 404。验收中发现模拟器对子路径仍回 SPA 壳、且配置 `--api` 时会把该路径转发到 API 源，与 CloudFront viewer-request 函数不一致；已改为与边缘函数相同的「退役路径一律 404、不转发」，并补了测试。
  - 直接加载带片段的 v3 链接：地址栏被擦除为 `/mobile-agent-sync`（hash、query 为空），页面显示已载入与到期时间，Import 可用；草稿只在 sessionStorage，DOM 与全部资源请求 URL 中均不含信封或密钥。浏览器的 Navigation Timing 条目仍保留原始片段（浏览器行为）；全仓没有代码读取该条目。
  - 点击 Import（测试密钥未经主钱包审批）：只向 `https://api.hyperliquid.xyz/info` 发请求、没有任何票据请求；第一次因一次 `extraAgents` 请求超过 1 秒得到「无法核验、可重试」并保留草稿，第二次得到「不是当前已审批的 Mobile Agent」；两次都没有写入 Agent 密钥或已导入记录。
  - 信封到期（2 分钟）：页面自动显示已过期、Import 置灰、草稿被清除。
  - 已挂载页面收到仅片段变化的新链接（`location.hash` 与同标签 `goto` 两种方式）：新鲜 v3 链接被擦除并载入；v1/v2 信封显示「两端刷新」。有一次「计时到期后同标签打开 v2 样本」页面仍停留在「已过期」提示，随后按相同步骤复现 1 次与其余 4 次同类操作均正常，未能再现，原因未查明。
- 真机：未执行。`docs/mobile-phone-access-device-validation.md`、`scripts/validate-mobile-phone-access-device-validation.js` 与夹具已改写为无票据协议（字段 `Envelope version = 3`、RD-2 与 TC-2 改为重复导入与第二部手机语义、构建身份取自已发布的 `build-meta.json`、删除 EC2 `prepare` / `promote` 流程）；校验器测试 22 通过，仓库模板结构校验通过，11 行全部 Not run。
- 安全复核：已启动一次只读对抗审查，结论补入任务记录之前不视为已完成。
- 第 5 步（打开生产开关）：未执行。真机矩阵未跑之前，两个 `VITE_MOBILE_PAIRING_*` 开关必须保持关闭。
- 部署：未执行。线上 CloudFront 分发与函数仍是旧配置（仍把 `/mobile-agent-sync-ticket*` 转发给返回 503 的旧 Lambda）；需要按 `deploy/cloudfront/README.md` 重新发布函数、分发配置与 Lambda 才会变为 404。客户端已不再调用该路径，因此发布前后对用户无差别。

## 风险与缓解

- 截图后 2 分钟内可在另一部手机导入：与官方同级；靠揭示前的屏幕共享警告、4 秒按住、60 秒窗口与桌面撤销缓解；成功导入后手机成功面板提示「若非本人导入请在桌面撤销」。
- 旧版桌面产物生成的 v2 码在新手机被拒：切换同一次发布同时上线两端，且开关此前一直关闭，无存量用户。
