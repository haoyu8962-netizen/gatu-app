<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-link-mobile-device-simplification",
  "date": "2026-09-24",
  "title": "关联移动设备按 ADR 0015 D8 收敛：一句说明、一个动作，明文片段载荷 v4，单开关",
  "kind": "task",
  "status": "verified",
  "topics": ["pairing-release"],
  "summary": "用户按简化规划的推荐决定实施。桌面弹窗改为一句说明、一条提示、一个动作（idle → signing → ready → revealed，失败一行错误可重按），签名仍是显式点击且静默；手机页首帧前擦除片段、显式导入、一次 extraAgents 核验、既有 epoch 回滚；载荷改为片段里的明文 JSON v4；删除信封加密、去重、草稿、恢复记录、待核验、桌面轮询、撤销面板、资金预检、擦除脚本管线、说明页、工具/用户菜单入口，两个开关合并为 VITE_MOBILE_PAIRING_ENABLED，真机矩阵与校验器换成三行清单。实现从 5,165 行降到 1,757 行（含共用审批 hook 256 行），测试从 4,574 降到 1,315 行，配对面文案约 45 条。typecheck、Biome、定向 32 文件 566 项、全量 600 文件、生产构建全部通过；开发构建上用真实邮箱账户走通授权 → 按住显示 → 导入 → API 钱包页移除，签名静默。es/fr/hi/ar 缺译、三行真机清单未跑，线上开关保持关闭。",
  "thread": null,
  "baseCommit": "046b0de2",
  "commits": [],
  "sources": [
    { "path": "docs/link-mobile-device-simplification-plan.md" },
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx" },
    { "path": "apps/terminal/src/routes/mobile-agent-sync.tsx" },
    { "path": "apps/terminal/src/lib/mobile-sync/sync-core.ts" },
    { "path": "apps/terminal/src/config/mobile-pairing-flags.ts" },
    { "path": "packages/hl-react/src/signing/mobile-agent.ts" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/trading-onboarding.md" },
    { "path": "docs/hyperliquid-signing.md" },
    { "path": "docs/mobile-phone-access-device-validation.md" },
    { "path": "docs/work-memory/sessions/2026-09-24-official-link-mobile-device-ux-trace.md" }
  ],
  "supersedes": []
}
-->
# 关联移动设备按 ADR 0015 D8 收敛：一句说明、一个动作，明文片段载荷 v4，单开关

## 背景与范围

同步记录。用户在看过官方取证与 [简化规划](../../link-mobile-device-simplification-plan.md) 后要求「根据推荐的方案执行修改任务，确保符合编码规范、功能正常」，即规划第 8 节五项待决策全部按推荐执行：手机保留一次点击「导入」、不保留去重；真机矩阵缩为三行手工清单并删除校验器；有效期保留 30 天；删除桌面撤销面板、以 API 钱包页面为移除入口；边缘函数与 Service Worker 的配对放行本次不动。基线 `046b0de2`，工作区干净。决策写入 [ADR 0015](../../adr/0015-link-device-alignment.md) D8。

## 结论与依据

### 实施内容

- **桌面弹窗**（`mobile-agent-sync-modal.tsx`，1,654 → 344 行）：状态 `idle → signing → ready → revealed`，失败为 `error`（一行错误，按钮恢复可用）。内容只有标题、一句操作说明、一条错误色提示和动作区（「授权移动交易密钥」→「按住以显示」→ 二维码 + 「{n} 秒后关闭」）。签名仍走 `useExplicitAgentApproval` 且带 `applicationReview: "confirmed"`；成功以交易所 `status: "ok"` 为准；揭示后 60 秒、失焦、`pagehide` 或页面隐藏即关闭；关闭时 abort 进行中的审批，迟到结果被忽略。会话组件以 `open:env:owner` 为 key，每次打开都是干净状态。
- **手机页**（`routes/mobile-agent-sync.tsx`，852 → 304 行）：`useLayoutEffect` 里读取 `location.hash`、`history.replaceState` 擦除，并监听 `hashchange`；开关关闭时擦除并提示不可用；解析失败按错误码显示一行提示；「导入」做一次 `extraAgents` 核验（`verifyExpectedMobileAgent`，精确名称与到期）→ `captureAgentRegistrationEpoch` → `persistAgentForRegistration({ scope: "local" })` → `activateAgentOwnerForRegistration` → `verifyAgentRegistrationOrRemove`，任一步不是 current 就 `cancelAgentRegistrationEpochAndRemove`；成功面板显示地址与到期日，「打开终端」。刷新后没有片段即提示重新扫码。
- **协议 v4**（`lib/mobile-sync/sync-core.ts`，756 → 200 行）：片段 `#ht-mobile-sync=<base64url(JSON)>`，字段 `v, env, owner, key, validUntil, createdAt, expiresAt`；地址与 Agent 名由密钥和到期推导；校验版本、网络、地址与密钥格式、到期不超过创建 + 2 分钟、Agent 有效期不超过创建 + 30 天、创建时间不超前本机 60 秒、过期含 60 秒偏差；带旧 `k=` 参数或旧版本号一律 `unsupported_version`。
- **hl-react**（`signing/mobile-agent.ts`，303 → 263 行）：删除撤销审批与 `MOBILE_AGENT_REVOKE_VALIDITY_MS`、`findApprovedMobileAgent`、存储记录里的 `syncId`（`types.ts`、`agent-storage.ts` schema 与校验同步）。
- **入口与开关**：头部图标是唯一入口，移出 `nav-compact:hidden` 簇；删除 `DesktopUtilitiesMenu` 与 `UserMenu` 的条目（懒加载宿主仍在 `UserMenu`）。`VITE_MOBILE_PAIRING_ENABLED` 单开关，`MOBILE_PAIRING_FEATURES = { enabled }`，`build-meta.json` 记 `mobileSync.enabled`，`deploy.mjs` 的闸门同时接受旧形状。
- **删除 23 个文件**：`draft-storage`、`imported-sync-ids`、`pairing-location`、`bootstrap-fragment`、`head-scrub-script.generated`、`desktop-approval-recovery`、`remote-verification`、`account-funding` 及其测试；`render-pairing-head-scrub.mjs`、`check-shell-head-scrub.mjs`（构建脚本去掉该步骤）；真机校验器脚本、测试与夹具；`tests/browser/pairing-head-scrub.mjs`。`client.ts` 不再有配对分支，`__root.tsx` 不再注入擦除脚本，引导错误页删除 `pairing-blocked` 变体及六语言文案。
- **CI 与发布**：`production-build.yml` 矩阵从四组变两组（`enabled` 开 / 关），`terminal-tests.yml` 去掉校验器与擦除脚本测试、配对步骤不再列已删除的测试；`scripts/ci-workflows.test.mjs`、`deploy.test.mjs` 同步。
- **文档**：ADR 0015 状态行与 D8；AGENTS.md 移动连接契约、`agent.md`、`.claude/rules/git.md`、ADR 0016 补注；`runtime-guardrails` §8、`trading-onboarding` 与 `email-trading-signing` 的「payload v4」节、`hyperliquid-signing` 的 Mobile Agent 节、扫码器 PRD 的更正与验收项、真机清单重写、CloudFront README、两个 env 示例、`deploy/fixtures/README`、终端 README、`docs/README`、两份旧规划的取代说明、CHANGELOG。zh 补齐 15 条新文案。

### 与规划的出入

- 规划表里写保留 `findApprovedMobileAgent`、删除 `verifyExpectedMobileAgent`；实际相反：`verifyMobileAgent`（`use-agent-status` 依赖）内部就用 `verifyExpectedMobileAgent`，手机导入前核验也用它（精确名称与到期），`findApprovedMobileAgent` 才是无人使用的。
- 手机页保留了 8 行 `hashchange` 监听，因为同一标签在已擦除的配对页上再收到一条链接时不会整页导航。
- 存储记录去掉 `syncId` 后，五个共享存储测试的夹具删掉该字段；`rtl-financial-ui-contract` 里主钱包行的条目一并删除（弹窗不再显示主钱包）。
- 规模：实现 1,757 行（弹窗 344、手机页 304、协议 200、分类 49、扫码器 324、hl-react 263、共用审批 hook 256、开关 17），略高于规划的 1,350，差在扫码器与 hl-react 保留得比估计多；测试 1,315 行。配对三个界面的可翻译文案 45 条（13 + 17 + 15）。

## 验证与限制

### 验证

- `pnpm --filter @gatu/terminal typecheck` 与 `pnpm --filter @gatu/hl-react typecheck` 0 错误；Biome 对全部 42 个改动的代码与测试文件无问题。
- 定向：`mobile-sync-core`、`mobile-agent-sync-modal`（10 例）、`mobile-agent-sync-route`（8 例）、`mobile-agent-qr-scanner`、`qr-classification`、`mobile-pairing-feature-gate`、`mobile-agent-lifecycle`、`top-nav`、`user-menu`、`wallet-modal`、`bootstrap-error-page`、`client-bootstrap-error`、`client-root-fatal`、`action-progress-label-contract`、`build-meta`、`chart-library-preload`、四个 agent 存储/注册测试、`privy-agent-signer`、`use-explicit-agent-approval`、`i18n-reactivity-contract`、`modal-surface-contract`、`dialog-dismiss-control-contract`、`design-token-ratchet`、`root-startup-fallback`、`app-route-surface`、`trading-onboarding-gate`、`wallet-session`、`mobile-data-presentation-contract`、`funds-action-availability` 共 32 文件 566 项通过。
- 全量 `pnpm --filter @gatu/terminal test`：600 文件 6,827 项，唯一失败是 `rtl-financial-ui-contract` 期待弹窗仍有主钱包 `<bdi>` 行；删掉该条目后单跑 32 项通过。
- `node --test scripts/ci-workflows.test.mjs` 6 通过；`pnpm test:cloudfront` 通过（含闸门读取旧 / 新两种 `mobileSync` 形状）。
- `pnpm --filter @gatu/terminal build` 退出码 0：预算、无循环、壳预加载通过，内联脚本哈希 10 个（8 页），比删除擦除脚本前少 1 个，符合预期。
- 真实流程（开发构建、`terminal-pairing` 配置即 `VITE_MOBILE_PAIRING_ENABLED=true`、应用内浏览器、用户的主网邮箱账户、输入由工具注入）：头部图标已移到账户旁并在紧凑簇外；弹窗只有一句说明、一条提示与「授权移动交易密钥」；点击后按钮禁用、无 Privy iframe，6 秒内出现「按住以显示」；注入 `pointerdown` 4 秒后显示二维码与「60 秒后关闭」，链接以 `#ht-mobile-sync=` 开头、无 `k=`；`window.open` 在应用内浏览器里退化为同标签导航，配对页载入时地址栏片段已擦除，显示「导入后…交易至 2026年10月24日 20:11，不能提现」，点「导入」约 6 秒内显示「手机访问已就绪」与到期日，localStorage 出现 Agent 密钥、活动所有者与注册会话键；随后在 `/api-wallet` 列表里看到 `Mobile` 行，「移除 → 确认移除」静默签名，核对 `extraAgents` 后列表只剩既有的 `gatu` Agent；回到交易页页脚仍「已连接」。链接与密钥没有写入任何记录。

### 未做与限制

- 邮箱主钱包的桌面会话不会自行清理同源里已被移除的 Mobile 密钥（`use-agent-status` 只在 Agent 会话里核对）；本次是同源单标签测试，手动删掉了这些本地键。手动删除时连 `hyperliquid_agent_registration_session_<env>_<owner>` 一起删掉了，而该记录只在会话建立（页面加载、登录）时由 `session-provider` 写成 `active`，所以在未刷新的同一页面上再点「授权移动交易密钥」时 `captureAgentRegistrationExecutionLease` 返回 null，弹窗显示 hook 的通用错误「The wallet session changed before mobile access approval.」；刷新后记录恢复为 `active`，这是清理造成的，不是代码缺陷。hook 的这条文案对六种守卫失败共用且未本地化（API 钱包页同样）。独立手机的 Agent-only 会话会在下次核对 `extraAgents` 时清理，与文档一致，但本次未在真机验证。
- 旧协议留下的 `gatu.mobile-sync.imported.v1` 记录不再被任何代码修剪（只有开发测试者有过），已在测试浏览器里手动清除。
- es/fr/hi/ar 各缺译 54 条（含本次 15 条新文案），开关打开前应补齐；三行真机清单 RD-1…RD-3 未跑；线上 `VITE_MOBILE_PAIRING_ENABLED` 保持关闭；边缘函数的配对响应头与 Service Worker 放行未动。
- 补记（同日稍后）：用户反馈按住 4 秒太久，`QR_REVEAL_HOLD_MS` 改为 2 秒，按住期间按钮显示「继续按住 {n} 秒」，`aria-label` 随常量取秒数；单测与文档同步。计时器就是 `setTimeout(4000)`，此前工具注入的按住在 5.04 秒时已画出二维码，「不止 4 秒」的体感来自 14px 小圆环没有可读进度。
- 补记（同日稍后）：用户点击图标看到「连接中…」占位——那是 `UserMenu` 懒加载宿主的 Suspense 回退（原为钱包连接弹窗所写）。改为：新模块 `header/mobile-agent-sync-modal-loader.ts` 持有懒组件，头部图标在 `pointerenter` / `focus` 时预加载，点击等 `preload()` 完成后再打开（失败仍打开以走既有错误边界与重试）；该宿主的回退改用「关联移动设备」标题与「Loading」文案。`top-nav` 与 `user-menu` 测试同步。
- 补记（同日稍后，用户反馈「圈的倒计时不准确」）：Workflow 五镜头审查（45 个代理，每条发现两名反驳者）确认的根因是圆环的 `transition-[stroke-dashoffset] duration-100`：rAF 每帧写入新偏移，而 100 ms 的缓动过渡每帧被重新定向，画出来的弧比计时落后约 180 ms（60 Hz）到 470 ms（120 Hz），且按钮在完成那一帧就被替换，圆环从未画到 100%。已删除该过渡；同时把 `usePressAndHold` 的首帧负进度钳到 0（rAF 时间戳可早于 `performance.now()` 起点，曾可能闪现「继续按住 3 秒」）、effect 清理改为完整 `cancel()`（热更新期间的按住不再冻结）；进入 `ready` 即预加载 `qrcode`，实测二维码在按住完成的同一采样点（≤40 ms）画出，此前在开发模式约晚 1 秒；圆环改为装饰（`aria-hidden`），按钮的可访问名称就是可见文案、提示走 `aria-describedby`；画布改为 `h-auto w-80 max-w-full` 以免窄抽屉压扁；弹窗 key 不再含 `open`，改用 `onOpenChangeComplete(false)` 复位，让 200 ms 退出过渡按样式规范运行；页面已隐藏时揭示会立即关闭。审查反驳掉的两条：「圆环永远画不到 100%」（无过渡时最后一帧 ≥ 99%，14 px 上不可辨）与「14 px 圆环显示不了细进度」。测量说明：应用内浏览器面板在不可见状态下 `requestAnimationFrame` 不触发（`document.visibilityState === "hidden"`），无法在这里量圆环；圆环落后的数字来自审查者对 Tailwind 4 产物与过渡重定向的推导与测量。测试用的 Mobile 密钥已从 API 钱包页移除。
- 补记（同日稍后，用户反馈「授权加载也很久」）：在应用内浏览器用 Resource Timing 量了两次真实签名（用户主网邮箱账户，随后已从 API 钱包页移除）。关联移动设备的审批：点击后 1,790 ms 进入「按住以显示」，其中 Privy 嵌入钱包签名约 0.8 s（`auth.privy.io` 的 analytics 事件在 24 ms，钱包 RPC 在 490–789 ms，中间约 0.47 s 是 Privy iframe 内部准备）、提交前的 `legalCheck` 70 ms、`api.hyperliquid.xyz/exchange` 918 ms。API 钱包页的移除：2,209 ms，结构相同（预检两次 info 303 ms、Privy 签名约 0.84 s、`legalCheck` 89 ms、exchange 861 ms、验证 info 91 ms）。结论：不是代码浪费——本项目自己的守卫只占约 70–90 ms（提交前强制刷新的 legalCheck，契约要求），其余是 Privy 签名与 Hyperliquid 交易所确认，与官方终端走同样两步；`info` 请求只要 70–90 ms，所以 exchange 的 0.9 s 是服务端处理而非本地网络。
- 倒计时文案在揭示后约 1 秒仍显示「60 秒后关闭」（单测在 1 秒后断言 59 秒通过），未深究，属展示细节。

## 后续与替代关系

- 接续 [2026-09-24-official-link-mobile-device-ux-trace](2026-09-24-official-link-mobile-device-ux-trace.md) 与 [2026-09-24-link-mobile-device-live-verification](2026-09-24-link-mobile-device-live-verification.md)；旧记录里描述的信封 v3、去重、恢复记录与撤销面板自本记录起为历史。
- 后续候选：四种语言的配对文案；真机三行清单；下次边缘发布时决定是否去掉配对页的专用响应头与 Service Worker 放行；是否让 API 钱包页把 `Mobile` Agent 显示得更友好。
