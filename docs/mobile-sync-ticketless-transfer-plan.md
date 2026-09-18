# 移动配对方案 B：去服务端票据的纯客户端传输（实施规划）

状态：已选定（2026-09-18，用户决定）；实施顺序 1–4 已于 2026-09-18 完成（任务记录 [2026-09-18-mobile-sync-ticketless-implementation](work-memory/sessions/2026-09-18-mobile-sync-ticketless-implementation.md)），静态托管实测与一次只读对抗安全复核已执行（见下方「验收执行记录」与「安全复核结论」）；真机矩阵、第 5 步（打开生产开关）与线上发布尚未执行。归属决策见 [ADR 0015](adr/0015-link-device-alignment.md) D7。实施偏差：退役路径 `/mobile-agent-sync-ticket*` 由 CloudFront viewer-request 函数与静态页分类器直接返回 404（而非落入 SPA 壳），Service Worker 与 `serve:spa` 继续把它当作非导航路径；真机矩阵模板与 `scripts/validate-mobile-phone-access-device-validation.js` 已于同日改写为无票据协议。

## 目标与不变量

- 桌面 → 手机的二维码不再依赖任何服务端状态；CloudFront + S3 + Lambda 静态托管即可完整工作，开关可在生产打开。
- 保留全部客户端加固：AES-GCM 片段信封（头部的版本、创建与到期时间、`syncId`、IV 作为 AAD；origin / env / 主地址在加密明文内、解密后校验）、精确 owner 审批与 `extraAgents` 核验、显式 Import、30 天 `Mobile valid_until` Agent、桌面撤销、4 秒按住显示、失焦/隐藏/Escape 取消、自动关闭、引导时片段擦除、开关失败关闭。
- 明确放弃的两个属性并写入文档：「第二部手机兑换同一码被拒」与「服务重启后旧码失效」。它们都不能阻止二维码被截取；由更短的可见窗口与信封 TTL 替代。

## 参数变更

| 项 | 现值 | 目标 | 说明 |
| --- | --- | --- | --- |
| `MOBILE_SYNC_PAYLOAD_TTL_MS`（信封 TTL） | 10 分钟 | 2 分钟 | 可见窗口 60 秒 + 扫码/打开/Import 余量 |
| `MOBILE_SYNC_CLOCK_SKEW_MS` | 60 秒 | 60 秒 | 不变 |
| 二维码可见窗口 | 票据剩余（≤60 秒） | 揭示后 60 秒（本地单调时钟） | 与官方一致；到期自动关闭并作废本地 URL |
| 草稿（手机 sessionStorage）过期 | 信封 `expiresAtMs` + skew | 同上 | 随 TTL 缩短自动收紧 |
| `syncId` | 服务端签发的 22 位票据 ID | 桌面本地 `crypto.getRandomValues` 生成的 16 字节 ID | 仍写入 AAD，用作手机端「同一码已导入」的本地去重键 |
| `MOBILE_SYNC_VERSION` | 2 | 3 | 手机拒绝 v2 信封（`decodeMobileSyncEnvelope` 抛 `unsupported_version`，界面提示两端刷新），避免旧桌面产物与新手机混用 |

## 代码改动清单（按删除、改写、新增分组）

删除：
- `apps/terminal/src/lib/mobile-sync/one-time-ticket-client.ts`、`one-time-ticket-server.ts`、`one-time-ticket-policy.ts` 及对应测试 `mobile-sync-one-time-ticket-client.test.ts`、`mobile-sync-one-time-ticket-server.test.ts`。
- 路由 `apps/terminal/src/routes/mobile-agent-sync-ticket.ts`（`routeTree.gen.ts` 由插件重新生成）；`edge/lambda-handler.ts` 的 503 桩与 `MOBILE_SYNC_TICKET_PATH`；`lib/static-pages/static-pages.ts` 中的票据路径例外。
- `deploy/cloudfront/distribution-config.mjs` 与 `functions/terminal-request.js` 中 `/mobile-agent-sync-ticket*` 的 Lambda 转发；`deploy/mobile-sync-release.mjs`、`mobile-sync-candidate.mjs`、`mobile-sync-caddy.test.mjs`、`deploy/fixtures/mobile-sync-legacy-*.mjs` 及其测试（已随 EC2 退役失效）。
- `config/build-meta.ts` 的 `mobileSync.ticketApiVersion` / `store` 字段（保留 `createAndReveal` / `importFromQr`）。

改写：
- `sync-core.ts`：`createMobileAgentSyncUrl` 内部生成 `syncId`，输入不再要求票据 ID；版本升至 3；TTL 改为 2 分钟；`decodeMobileSyncEnvelope` 对版本字节 1、2 抛 `unsupported_version`（历史上的 JSON v1 信封首字节不同，按 `invalid_envelope` 处理）。
- `mobile-agent-sync-modal.tsx`：`handleRevealQr` 去掉 `issueMobileSyncTicket` 与 `qr-ticket-rejected` / `qr-service-unavailable` / `qr-upgrade-required` 三个桌面侧错误码；`QrDeadlines` 只保留信封到期与「揭示时刻 + 60 秒」的单调时钟；倒计时与到期逻辑沿用现有 `remainingQrLifetimeMs`。
- `routes/mobile-agent-sync.tsx`：删除 `consumeMobileSyncTicket` 与 `MobileAgentOneTimeTicketError`；Import 顺序为 解密 → 本地去重（`syncId` 已导入则拒绝）→ `extraAgents` 核验 → 注册 epoch 校验 → 持久化 → 激活（最初实施把去重放在 epoch 之后，安全复核发现重复导入会因此触发 epoch 回滚并弄坏已导入的访问，已改为在捕获 epoch 之前去重）。
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
- 安全复核：已执行一次只读对抗审查（约 27 分钟、129 次工具调用，5 个指定测试文件 90 用例通过），结论与处置见下方「安全复核结论」。
- 第 5 步（打开生产开关）：未执行。真机矩阵未跑之前，两个 `VITE_MOBILE_PAIRING_*` 开关必须保持关闭。
- 部署：未执行。线上 CloudFront 分发与函数仍是旧配置（仍把 `/mobile-agent-sync-ticket*` 转发给返回 503 的旧 Lambda）；需要按 `deploy/cloudfront/README.md` 重新发布函数、分发配置与 Lambda 才会变为 404。客户端已不再调用该路径，因此发布前后对用户无差别。

## 安全复核结论（2026-09-18，只读对抗审查，基于 `a2e27468`）

没有已确认的 P0。按严重度列出结论与处置；「既有」指不是方案 B 引入的。

| 编号 | 结论 | 来源 | 处置 |
| --- | --- | --- | --- |
| F1（P0 候选，未在真机证实） | 系统相机扫码会导航到完整二维码链接，浏览器在 JS 擦除之前已把含片段的 URL 写入历史库，开启历史同步时还会离开设备；应用内扫码不受影响 | 既有设计 | **待产品决策**：改为不可导航的二维码内容并只支持应用内扫码，或保留系统相机并如实披露、把应用内扫码作为唯一推荐。TC-1 已加入「检查浏览器历史与已同步设备」 |
| F2（P1，已确认） | TTL、一次性与去重只约束诚实客户端；文档把 2 分钟写成了暴露上限 | 代码既有，错误表述是方案 B 文档新增 | 已改正 `trading-onboarding.md`、`email-trading-signing.md`、`hyperliquid-signing.md`、CHANGELOG 与本文「风险与缓解」 |
| F3（P1，已确认） | 同一手机重复导入同一码会触发 epoch 回滚，把已导入成功的访问置为 `closing`、密钥滞留且不可用；单测因 mock 了回滚函数未发现 | 方案 B 新引入 | 已修复：去重移到捕获 epoch 之前；路由测试断言重复路径不调用核验、epoch 捕获与回滚，变异测试确认该断言能抓住旧写法 |
| F4（P2，已确认） | 创建时间在未来的信封被接受，桌面时钟偏快会拉长诚实客户端的可用期与手机草稿保留期 | 代码既有，去掉票据后墙钟成为唯一边界 | 已修复：解密时拒绝 `createdAtMs` 超前本机超过 60 秒的信封（新错误码 `not_yet_valid`，提示核对两端日期时间）；手机持有已载入二维码与草稿的时间上限为 TTL + skew，与信封时间戳无关 |
| F5（P2，已确认） | 生产产物里片段擦除被打进约 1.19 MB 的路由 vendor chunk，要等约 1.75 MB JS 下载解析后才执行；当前擦除前没有任何代码读取 URL，但顺序只在源码层被测试钉住 | 既有 | **未处理**：建议改为 head 内联脚本并加产物级断言，涉及 CSP 内联哈希与启动契约，另行处理 |
| P3 | CloudFront 对 `/mobile-agent-sync` 没有 Nitro 路由规则里的 `no-store` / `no-referrer`（片段不进 Referer，仅影响凭据被错放进 query 的畸形链接）；引导阶段擦除失败时没有兜底；路由匹配不区分大小写而擦除按精确路径；Import 之前不显示 owner / Agent 地址；开发模式 StrictMode 可能让导入必定 `decrypt_failed` | 既有 | **未处理**，已记入任务记录 |
| P3 | 手机页到期计时不含 skew；弹窗用含密钥的 URL 作 React key；应用内扫码对 v2 信封只给通用提示；本文与 ADR 的几处表述错误 | 前两项既有、后两项方案 B 新增 | 已修复 |

## 风险与缓解

- 二维码被截取：信封 TTL、60 秒窗口与 `syncId` 去重**只约束诚实客户端**。片段里同时带着密文和它的 AES 密钥，拿到完整二维码或链接的人（截图、拍照、系统相机扫码后留在浏览器历史或历史同步里的 URL）随时可以离线解出 Agent 私钥，有效期到 Agent 过期（30 天）或桌面撤销为止；旧的票据方案同样如此，官方实现则是明文私钥加永久 Agent。缓解手段是揭示前的屏幕共享警告、4 秒按住、60 秒窗口、应用内扫码（从不导航到二维码链接）与桌面撤销；成功导入后手机成功面板提示「若非本人导入请在桌面撤销」。规划最初写的「截图后 2 分钟内可在另一部手机导入」低估了暴露期，以本条为准。
- 旧版桌面产物生成的 v2 码在新手机被拒：切换同一次发布同时上线两端，且开关此前一直关闭，无存量用户。
