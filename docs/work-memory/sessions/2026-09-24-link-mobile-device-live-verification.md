<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-link-mobile-device-live-verification",
  "date": "2026-09-24",
  "title": "Link mobile device 在真实邮箱账户上走通：审批 → 按住显示 → 同源导入 → 撤销，及审计 P3 处置",
  "kind": "task",
  "status": "verified",
  "topics": ["pairing-release"],
  "summary": "旧双开关/v3 配对在开发构建真实邮箱账户上经工具注入完成审批、同源导入与撤销；不是手机真机验收。09-24 后续已按 ADR 0015 D8 改为 v4、单开关、头部唯一入口和 API 钱包移除；旧恢复/撤销面板待办不再适用，真机与缺译仍待处理。",
  "thread": null,
  "baseCommit": "90568b06",
  "commits": ["6be105da"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx" },
    { "path": "apps/terminal/src/routes/mobile-agent-sync.tsx" },
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-qr-scanner.tsx" },
    { "path": "apps/terminal/src/lib/wallet/privy-agent-signer.ts" },
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": "docs/mobile-sync-ticketless-transfer-plan.md" },
    { "path": "docs/pairing-page-hardening-plan.md" },
    { "path": "docs/mobile-phone-access-device-validation.md" },
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "path": "docs/work-memory/sessions/2026-09-24-email-mobile-approval-silent-signing.md" },
    { "path": "docs/work-memory/sessions/2026-09-21-cloudfront-release-p22.md" }
  ],
  "supersedes": []
}
-->
# Link mobile device 在真实邮箱账户上走通：审批 → 按住显示 → 同源导入 → 撤销，及审计 P3 处置

## 背景与范围

同步记录。用户在静默签名修复（`d76f789e`、`90568b06`）之后要求检查「关联移动设备」功能是否正常可用，并在被问及后选择「完整走完授权 → 长按显示二维码 → 手机页导入」，即接受在其主网邮箱登录账户上真实签名 `approveAgent`（会替换该账户当时已有的 Mobile Agent）。约定验完即撤销。基线 `90568b06`，工作区只有 `.claude/launch.json` 未提交。

环境：本机开发服务器按新增的 `terminal-pairing` 启动配置运行（`VITE_MOBILE_PAIRING_CREATE_ENABLED=true`、`VITE_MOBILE_PAIRING_IMPORT_ENABLED=true`，端口 3005）；桌面页在应用内浏览器里以邮箱用户登录（Privy 嵌入主钱包）、中文、浅色主题；「手机页」是同一来源的第二个标签（宽 1743 px，不是手机视口，与桌面共享 localStorage），不是真机。全部点击与按住手势由桌面浏览器工具注入（DOM 点击与工具指针），不是物理输入。

## 结论与依据

结论：在开发构建与真实邮箱账户上，审批、按住显示、同源导入与撤销四步全部按设计工作，签名静默；审计只剩 P3。依据如下。

### 观察到的证据

1. **审批静默。** 弹窗「授权移动交易密钥」点击后没有出现 Privy 确认（页面上没有可见的 Privy iframe），约 1.6–2.4 秒进入「交易密钥已授权」。
2. **按住显示与一次性揭示。** 4 秒按住后二维码显示，60 秒可见窗口结束时二维码自动关闭、弹窗随之关闭；再次打开弹窗回到审批前面板（揭示是一次性的，恢复记录在渲染后即清除）。第一次揭示因我解码二维码过慢而过期，第二次重新审批（第二次签名）后直接从 `VisibleQrPanel` 的 React props 读到链接并只在内存中交给第二个标签，链接与密钥没有写入任何文件或记录。
3. **手机页导入。** 第二个标签打开链接后显示「桌面二维码已加载」，地址栏片段已被擦除；点击导入后显示「手机访问已就绪」与到期时间（30 天后），所有者账户与桌面一致。localStorage 出现 Agent 密钥、活动 Agent 所有者、`gatu.mobile-sync.imported.v1` 去重记录与注册会话键。
4. **撤销静默。** 桌面「检查撤销操作」→ 确认后没有 Privy iframe，约 2.0 秒显示「移动访问权限已撤销。不可访问的替换密钥将于 17:06 过期」（约 20 分钟后）。随后 `POST https://api.hyperliquid.xyz/info {"type":"extraAgents"}` 显示 `Mobile` 记录已换成另一个地址、`validUntil` 与提示一致；该账户此前已有的另一个 Agent（名为 `gatu`，2026-11-01 到期）未受影响。撤销后再读同源 localStorage：Agent 密钥与活动所有者键已被移除（同源桌面标签的 Agent 状态核对把已不再获批的本地密钥清掉了），去重记录保留到信封到期后自清理，注册会话键状态为 `closed`。第二个标签仍停留在成功面板（该页不做实时复查，属既有设计）。
5. **桌面会话不受影响。** 撤销后关闭弹窗，页脚仍显示已连接，账户面板照常。

### 对抗审计（Workflow，31 个代理）

三个镜头（桌面流程、手机流程、验收对照）各自找问题，每条发现由两名反驳者投票。没有 P0/P1/P2 存活（一条 P2 被两票降为 P3）。存活的 P3 与处置：

| 发现 | 处置 |
| --- | --- |
| 撤销确认按钮「Confirm revoke in wallet」对邮箱用户仍暗示钱包弹窗 | **已修**：`MobileAgentSyncModal` 从 `useWalletSession().walletIntent` 推出 `signer`，嵌入钱包显示静态的「Confirm revoke」并说明「邮箱钱包会自动为已审核的请求签名」，外部钱包保留原文案；新增用例断言两种文案与 `applicationReview: "confirmed"`。approving 态的「Approve QR code with wallet...」与官方签名期间文案相同，按上一记录的决定保持不变 |
| 手机成功页 `formatDateTime(agentValidUntilMs)` 没有传语言（与 `afd66c40` 修过的 P2 同类） | **已修**：改为 `{ locale: i18n.locale }` |
| 应用内扫码器错误框仍用旧皮肤（`rounded-8`、`border-stroke-error-strong/25`） | **已修**：改为与配对页相同的 `rounded-16 border-stroke-error-weak` 语义提示框 |
| AGENTS.md 把三个入口都写成需要 `createAndReveal`，与 runtime-guardrails §8、ADR 0015 D1 与代码（用户菜单项只看 `hasWalletAccess`）矛盾 | **已修**：改写该行 |
| CI 从不跑钉住静默签名链的测试，步骤名仍叫 “ticket protocol” | **已修**：`terminal-tests.yml` 该步骤改名并加入 `qr-classification`、`mobile-agent-remote-verification`、`desktop-approval-recovery`、`mobile-agent-lifecycle`、`use-explicit-agent-approval`、`privy-agent-signer`、`lambda-handler`；`scripts/ci-workflows.test.mjs` 6 通过 |
| 两份规划仍写「已实现、未发布」，实际已随 p22 上线 | **已修**：两文各加一条带日期的更正（`d1f31576`、`8dae2522`、`a2e27468` 均是 `246c57bc` 与今日 p23 `121e8e76` 的祖先） |
| 真机模板没有邮箱（嵌入）主钱包桌面审批的检查项 | **已修（不改校验器）**：在 TC-3 段落补一句「Approve 与 Confirm revoke 各签名一次、无 Privy 弹窗、`extraAgents` 记录更替」的要求；`validate:mobile-device --allow-incomplete` 通过 |
| 签名前就失败的审批（legal 门控、身份不匹配等）也被当成「可能已提交」保留为待核验，锁住本标签的配对流程 | **未修**：需要 `useExplicitAgentApproval` 对签名前失败抛稳定标记、弹窗据此直接回到错误态；改动跨 hook 与弹窗，留作后续 |
| 静默签名的 approving/signing 阶段没有取消路径且弹窗拒绝关闭 | **未修**（一票反驳、一票降级）：结构成立，但 Privy 挂起的触发未证实；与上一条一起处理 |
| 导入成功后表单消失、成功框没有状态语义与焦点目标 | **未修**：可加 `role="status"` 与聚焦，留作后续 |
| es/fr/hi/ar 缺译（提取后各 39 条，含配对页面的 17 条） | **未修**：本次只补了 zh 的 5 条（含新加的「Confirm revoke」）；开关打开前配对面缺译应清零 |
| F1（系统相机扫码把带凭据的链接写入浏览器历史）仍待产品决策 | **未修**：产品决策，见规划「安全复核结论」 |

## 验证与限制

### 验证

- 单元：`mobile-agent-sync-modal`、`mobile-agent-sync-route`、`mobile-agent-qr-scanner`、`action-progress-label-contract`、`modal-surface-contract`、`design-token-ratchet`、`i18n-reactivity-contract`、`dialog-dismiss-control-contract` 共 8 文件 252 项通过；`pnpm --filter @gatu/terminal typecheck` 0 错误；改动文件 Biome 无问题；`node --test scripts/ci-workflows.test.mjs` 6 通过；`pnpm validate:mobile-device --allow-incomplete` 通过、`test:mobile-device-validator` 通过。
- 真实账户流程：见上文「观察到的证据」，属开发构建 + 应用内浏览器 + 同源第二标签，不是真机；输入由浏览器工具注入。
- 新文案在真实弹窗上复核：修改后重新打开「关联移动设备」→「检查撤销操作」，确认区显示「确认撤销」按钮与「邮箱钱包会自动为已审核的请求签名…」说明；未点击确认，直接关闭（未再签名）。

### 未做与限制

- 真机矩阵 RD-1…RD-8、TW-1…TW-3 全部仍为 Not run；线上两个 `VITE_MOBILE_PAIRING_*` 开关保持关闭，本记录不是打开开关的依据。
- 没有在真机相机、iOS PWA 或独立设备上导入；同源第二标签共享 localStorage，因此「撤销后手机本地密钥被清理」在这里由桌面标签完成，独立手机要等它自己下次核对 `extraAgents` 才会清理。
- 撤销留下的不可访问替换密钥在当天到期，不需要人工处理；账户上既有的 `gatu` Agent 未动。
- 2026-09-18 静态托管验收里那次未能复现的「到期后同标签打开 v2 样本仍停留在已过期」异常没有再查。

## 后续与替代关系

- 不替代任何记录；接续 [2026-09-24-email-mobile-approval-silent-signing](2026-09-24-email-mobile-approval-silent-signing.md) 与 [2026-09-21-cloudfront-release-p22](2026-09-21-cloudfront-release-p22.md)。
- 后续候选：签名前失败的稳定错误标记与待核验判定；成功面板状态语义；四种语言配对面缺译；F1 产品决策；真机矩阵。

## 周整理补注（2026-09-28）

失效范围仅限旧 v3 信封、双开关、待核验恢复、桌面撤销面板与旧矩阵。静默签名的历史观察保留，但同源第二标签和工具注入不能充当独立手机或物理输入证据。系统相机历史风险也不能因旧 F1 决策被新方案接续而当作已消除。

后续来源：[2026-09-24-link-mobile-device-simplification](2026-09-24-link-mobile-device-simplification.md)。

本条为事后整理；本轮仅核对 Git、现行文档和相关实现入口，原验证结果仍归属来源任务，未重跑业务测试。详见 [本周整理](2026-09-28-weekly-memory-review.md)。
