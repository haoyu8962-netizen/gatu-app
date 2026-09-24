# 关联移动设备简化规划：一句说明、一个动作，代码降到官方量级

状态：规划草案（2026-09-24），待用户确认文末「待决策」后实施；本文不改代码。官方取证见 [2026-09-24-official-link-mobile-device-ux-trace](work-memory/sessions/2026-09-24-official-link-mobile-device-ux-trace.md)，现有设计见 [ADR 0015](adr/0015-link-device-alignment.md)、[方案 B 规划](mobile-sync-ticketless-transfer-plan.md)、[配对页加固规划](pairing-page-hardening-plan.md)。接受后先在 ADR 0015 追加 D8 记录决策，再按本文顺序实施。

## 1. 目标

- 桌面弹窗只剩一句操作说明、一句风险提示和一个动作；手机页只剩一句说明和一个动作。
- 实现代码从 5,165 行降到约 1,350 行（其中 256 行是与 API 钱包页共用的显式审批 hook），测试从 4,574 行降到约 1,200 行，配对面文案从 140 条降到约 25 条。
- 保留 AGENTS.md 与 ADR 0002 的边界：签名只跟随显式动作、精确 owner、登录/刷新/状态检查不签名、Agent 注册不批 builder fee、开关失败关闭、手机 Agent-only 会话的资金动作按可用性布尔值禁用。
- 与官方的差别收敛到四点：显式点击而不是打开即签、30 天有效期而不是永久、片段（`#`）而不是查询串、导入前一次链上核验。

## 2. 官方基线（2026-09-24 产物）

桌面：图标 → 点击即 `approveAgent`（`Mobile QR`，永久）→ 转圈 → 「链接移动设备」+ 两行说明 + 一条提示 + 「按住以显示」（4 秒）→ 二维码 → 60 秒后关闭，无倒计时、无错误态、无撤销。手机：「链接桌面钱包」扫码或直接打开链接 → 写入 `hyperliquid.api_wallet` → 「二维码扫描完成」；使用时若 `extraAgents` 里没有该地址才删除。核心约 100 行、11 条文案。

## 3. 目标设计

### 3.1 桌面弹窗（`mobile-agent-sync-modal.tsx`，1,654 → 约 300 行）

状态机五态：`idle`（按钮可用）→ `signing`（按钮禁用、图标转圈，名称不变）→ `ready`（按住以显示）→ `revealed`（二维码 + 倒计时）→ 自动关闭；任何失败进入 `error`（一行错误 + 按钮恢复可用，重点即重签，同名 Agent 替换即可）。

内容自上而下只有：

| 元素 | 文案（zh / en） |
| --- | --- |
| 标题 | 关联移动设备 / Link mobile device |
| 一句说明 | 在手机上打开 gatu，点「连接 → 链接桌面钱包」扫描此码。/ On your phone, open gatu, tap Connect → Link Desktop Wallet and scan this code. |
| 一条提示（错误色 callout） | 二维码只能交易、不能提现；不要分享、截图或在共享屏幕时显示。/ The QR can trade but not withdraw. Do not share it, screenshot it or show it while sharing your screen. |
| 动作区 | `idle`/`signing`：「授权移动交易密钥」；`ready`：「按住以显示」（4 秒圆环）；`revealed`：二维码 + 「{n} 秒后关闭」；`error`：一行错误 |

删除：主钱包行（头部已显示账户）、能力清单与三条要点、「将替换当前移动密钥」、「保持窗口打开」提示、待核验面板、暂不可用面板（开关关闭时图标不出现，不需要面板）、撤销面板、恢复记录。签名走现有 `useExplicitAgentApproval`（`applicationReview: "confirmed"`），成功以交易所 `status: "ok"` 为准，不再轮询 `extraAgents`。按住显示保留失焦/隐藏/Escape 取消（现有 effect，约 30 行）。

### 3.2 手机页（`routes/mobile-agent-sync.tsx`，852 → 约 200 行）

首次渲染前读取 `location.hash` 并 `history.replaceState` 擦除（方案 B 的原始形态），解析 v4 载荷，状态 `loaded` → `importing` → `success`，失败 `error`。刷新即失效（无草稿），提示重新扫码。

| 元素 | 文案（zh） |
| --- | --- |
| 标题 | 导入手机访问权限 |
| 一句说明 | 导入后，这部手机可用桌面授权的密钥交易 30 天，不能提现。 |
| 动作 | 「导入」；成功后「已就绪」+「打开终端」 |
| 错误（各一行） | 二维码已过期，请在桌面重新生成。/ 桌面尚未授权此密钥，请重新生成。/ 二维码属于 {env}，与本页不符。/ 此手机已导入过这个二维码。（可选，见待决策 1） |

导入顺序保持 hl-react 注册会话的既有四步（`captureAgentRegistrationEpoch` → `persistAgentForRegistration` → `activateAgentOwnerForRegistration` → `verifyAgentRegistrationOrRemove`），这是 `use-agent-status` 识别 Agent-only 会话的前提；失败只做一次 `cancelAgentRegistrationEpochAndRemove`，不再区分「清理未完成」的多种提示。导入前用 `findApprovedMobileAgent` 做一次 `extraAgents` 核验（失败关闭），不轮询。

### 3.3 载荷协议 v4（`lib/mobile-sync/sync-core.ts`，756 → 约 120 行）

片段 `#ht-mobile-sync=<base64url(JSON)>`，明文：`{ v: 4, env, owner, agent: { address, key, name, validUntil }, createdAt, expiresAt }`。校验：版本、`env` 等于本页网络、`owner` 与 `address` 为地址、`expiresAt`（创建 + 2 分钟）未过、`createdAt` 不超前本机 60 秒。去掉 AES-GCM、AAD、`syncId`。理由：片段不离开浏览器，密文与密钥同在片段里，加密对拿到链接的人没有作用；来源绑定由 URL 的主机承载，手机页只在自身 origin 下解析。线上开关一直关闭，没有存量 v3 用户，直接升版本，v1–v3 一律「请在桌面重新生成」。

### 3.4 入口与开关

- 桌面入口只保留头部二维码图标（已连接的精确 owner 会话且开关打开）；紧凑宽度下图标不再隐藏，删除工具菜单条目与用户菜单条目。
- 一个构建开关 `VITE_MOBILE_PAIRING_ENABLED` 同时控制桌面生成与手机导入；`MOBILE_PAIRING_FEATURES` 收敛为 `{ enabled }`；`build-meta.json` 只记一个字段；发布脚本的 `--allow-mobile-pairing` 语义不变。
- 手机连接弹窗的「链接桌面钱包」与应用内扫码器保留（官方同样有；应用内扫码不导航，是对系统相机把链接留在历史里的缓解）。

## 4. 逐文件处置

| 文件 | 现状 | 处置 |
| --- | --- | --- |
| `components/trade/components/mobile-agent-sync-modal.tsx` | 1,654 | 重写约 300 行（§3.1） |
| `routes/mobile-agent-sync.tsx` | 852 | 重写约 200 行（§3.2） |
| `lib/mobile-sync/sync-core.ts` | 756 | 重写约 120 行（§3.3） |
| `components/trade/components/mobile-agent-qr-scanner.tsx`、`lib/mobile-sync/qr-classification.ts` | 343、50 | 保留，只删多余文案 |
| `hooks/wallet/use-explicit-agent-approval.ts` | 256 | 保留不动（API 钱包页与建立连接弹窗共用） |
| `packages/hl-react/src/signing/mobile-agent.ts` | 303 | 保留命名、审批参数、存储记录、`verifyMobileAgent` / `shouldClearMobileAgent` / `isStoredMobileAgent` / `findApprovedMobileAgent`（`use-agent-status` 依赖）；删除撤销审批与轮询核验（`createMobileAgentRevocationApproval`、`MOBILE_AGENT_REVOKE_VALIDITY_MS`、`verifyExpectedMobileAgent`），约 150 行 |
| `lib/mobile-sync/desktop-approval-recovery.ts` | 117 | 删除 |
| `lib/mobile-sync/remote-verification.ts` | 176 | 删除 |
| `lib/mobile-sync/account-funding.ts` | 79 | 删除（未入金账户的交易所错误直接显示） |
| `lib/mobile-sync/draft-storage.ts`、`imported-sync-ids.ts` | 225、97 | 删除（待决策 1 若保留去重，`imported-sync-ids` 缩成 30 行） |
| `lib/mobile-sync/pairing-location.ts`、`bootstrap-fragment.ts`、`head-scrub-script.generated.ts`、`apps/terminal/scripts/render-pairing-head-scrub.mjs`、`scripts/check-shell-head-scrub.mjs`（及测试） | 110、117、3、脚本 | 删除；`__root.tsx` 去掉内联擦除脚本，`package.json` 的 `build` 去掉 `check-shell-head-scrub` 步骤，内联脚本哈希从 11 个回到 10 个（随下一次边缘发布更新 CSP） |
| 引导阻断说明页的配对分支（`?notice=unsafe-link`、六语言文案） | 若干 | 删除；通用引导错误页保留 |
| `config/mobile-pairing-flags.ts`、`config/mobile-pairing.ts` | 27 + | 改为单开关 |
| `components/trade/header/user-menu.tsx`、`desktop-utilities-menu`、`top-nav.tsx` | | 删除两个次要入口，图标不再随紧凑宽度隐藏 |
| `apps/terminal/public/sw.js` 配对放行、`deploy/cloudfront/functions/*` 的配对响应头与 `deploy.mjs` 的 “pairing page headers” 检查 | | 本次不动（无害；避免为此触碰边缘函数），下次边缘发布时再评估 |
| 文案 | 140 条 × 6 语言 | 约 25 条；zh 与 en 随实现补齐，其余四种语言在开关打开前补齐 |

预计结果：实现约 1,350 行（含共用 hook），测试约 1,200 行。

## 5. 文档与流程改动

- ADR 0015 追加 D8（本规划的决策与放弃项），`docs/mobile-sync-ticketless-transfer-plan.md` 与 `docs/pairing-page-hardening-plan.md` 顶部加「已被 D8 取代」说明，不改历史正文。
- AGENTS.md「Mobile connection and PWA contract」：入口改为单一图标、开关名改为单个；`agent.md` 与 `.claude/rules/git.md`、ADR 0016 里的「四种配对组合构建」改为两种（开 / 关），`production-build.yml` 与 `scripts/ci-workflows.test.mjs` 同步。
- `docs/runtime-guardrails.md` §8、`docs/trading-onboarding.md` 与 `docs/email-trading-signing.md` 的「envelope v3」节、`docs/hyperliquid-signing.md` 的 Mobile Agent 节改写为 v4 与新流程；`docs/mobile-phone-access-scanner-prd.md` 的验收项同步；`deploy/cloudfront/README.md`、`apps/terminal/.env.example`、`deploy/env.build.example` 改单开关；CHANGELOG 一条。
- 真机矩阵（待决策 2）：`docs/mobile-phone-access-device-validation.md` 从 11 行加校验器缩为 3 行手工清单（iOS Safari 系统相机、Android Chrome、应用内扫码），删除 `scripts/validate-mobile-phone-access-device-validation.js` 及其测试与 `package.json` 四个脚本。
- 测试：删除 `mobile-sync-core`、`mobile-sync-draft-*`、`mobile-sync-imported-ids`、`mobile-sync-bootstrap-fragment`、`mobile-sync-pairing-location`、`mobile-sync-account-funding`、`desktop-approval-recovery`、`mobile-agent-remote-verification`、`tests/browser/pairing-head-scrub.mjs`；重写 `mobile-agent-sync-modal`（52 → 约 12 例：显式点击才签名、`applicationReview: "confirmed"`、签名失败回到可用、按住 4 秒才显示、失焦取消、60 秒关闭、开关关闭无入口）与 `mobile-agent-sync-route`（24 → 约 8 例：擦除、过期、网络不符、未授权失败关闭、导入四步、刷新失效）；`action-progress-label-contract`、`dialog-dismiss-control-contract`、`top-nav`、`user-menu`、`wallet-modal`、CI 清单同步。

## 6. 验收标准

- 单元：上述测试与 AGENTS.md「钱包签名、引导与连接 UI」组通过；typecheck、Biome、`pnpm build`（预算、无循环、内联哈希 10 个）通过。
- 浏览器（开发构建、开关打开、应用内浏览器，输入由工具注入）：桌面点击授权一次签名 → 按住 4 秒显示 → 同源第二标签导入成功 → 手机页显示已就绪；二维码过期、网络不符、未授权各一条错误；无 Privy 弹窗（邮箱）。
- 真机（开关打开前）：待决策 2 的 3 行清单由人工完成并记录。

## 7. 实施顺序

1. 文档先行：ADR 0015 D8、本规划状态改为「已接受」、AGENTS.md / agent.md / git.md / ADR 0016 的开关与矩阵表述。
2. 协议与手机侧：`sync-core` v4、路由重写、删除手机侧库与擦除管线、构建脚本、CI 矩阵；此步单独验证。
3. 桌面侧：弹窗重写、入口收敛、单开关、hl-react 精简、文案与翻译、CHANGELOG；浏览器验证与真机清单。

## 8. 待决策（附推荐）

1. **手机是否保留一次点击「导入」**：推荐保留（一个按钮，防止误开链接替换手机上的密钥）；官方是扫到即写入。同题：是否保留「同一二维码不重复导入」的 30 行去重，推荐不保留。
2. **真机矩阵**：推荐缩为 3 行手工清单并删除校验器；这是功能做完一周仍不可达线上的直接原因。
3. **有效期**：推荐保留 30 天；官方永久。
4. **桌面撤销**：推荐删除面板；gatu 的 API 钱包页面已能移除任何 Agent（Mobile Agent 会以 `Mobile valid_until …` 的原始名称出现，是否美化另议）。
5. **边缘函数与 Service Worker 的配对放行**：推荐本次不动。
