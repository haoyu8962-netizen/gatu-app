<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-link-device-alignment",
  "date": "2026-09-18",
  "title": "链接移动设备：官方机制实测、17 项差距图与体验对齐实施",
  "kind": "task",
  "status": "verified",
  "topics": [
    "pairing-release",
    "account-funding"
  ],
  "summary": "从官方产物实测「Link Mobile Device」：右上角图标一键 approveAgent（永久 Mobile QR）、4 秒按住显示、60 秒自动关闭、二维码为 /trade?link= 明文私钥、手机解析后以 API 钱包身份连接。我方实现更严格但生产不可达（Lambda 对票据路由固定 503、开关关闭）。41 代理工作流产出 17 项差距并逐项对抗核验；按 ADR 0015 实施 D1–D6（顶栏入口、单步审批、官方文案、圆环按住、倒计时、手机端 Agent-only 原因、扫描器相机选择、显式 local scope），D7 票据存储三备选待用户决定。",
  "thread": null,
  "baseCommit": "d6225648",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "path": "docs/mobile-sync-ticketless-transfer-plan.md" },
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-qr-scanner.tsx" },
    { "path": "apps/terminal/src/routes/mobile-agent-sync.tsx" },
    { "path": "apps/terminal/src/edge/lambda-handler.ts" }
  ],
  "supersedes": []
}
-->
# 链接移动设备：官方机制实测、17 项差距图与体验对齐实施

## 背景与范围

用户在内置浏览器选中官方终端的「链接移动设备」弹窗（520 px、「按住以显示」圆环按钮、警告「二维码支持移动交易，但不支持存款和提款…确保您没有共享您的屏幕」），要求调试官方实现与 UI，并对齐完善本项目两个方向的链接设备功能（电脑 → 手机、手机扫码 → 电脑）。分支 `claude/surface-tokens-touch-feedback`，基线 d6225648。本记录为同步记录。

约束：只分析官方公开产物（`index.html` 与 `assets/*.js`、语言包 `en-US-DsL8dgDE.js` / `zh-CN-BlshajVM.js`）与 DOM，不获取、不展示任何真实二维码或 Agent 密钥；不在已登录的浏览器会话执行真实交易。

## 结论与依据

### 官方机制（观察，来源 `assets/config-COoFw5do.js`）

- 桌面：右上角二维码图标按钮（组件 `kb`）→ 打开弹窗即生成随机私钥并 `approveAgent`（`name: "Mobile QR"`，`validUntil: null`，同名替换）；转圈 + `approve.qr.code.with.wallet`；成功后标题 `link.mobile.device`、提示 `qr.code.info.line1/line2`、底部警告 `qr.code.info.alert`、`hold.to.reveal` 按钮（`delayInSeconds: 4`，50 ms 计时、松手归零、按钮内 SVG 圆环 `strokeDashoffset = 2π·10·completionRate`）；揭示后 60 秒 `setTimeout` 递减到 0 关闭。
- 二维码值：`${origin}/trade?link=${btoa(JSON.stringify({address, key}))}`（函数 `Poe`），明文私钥在查询串。
- 手机：`J8()` 在移动 UA 且无 `window.ethereum` 时返回 `["QrLink","Email","WalletConnect"]`，Connect 弹窗首项 `link.desktop.wallet` → 扫描弹窗 `Db`（`BarcodeDetector` polyfill、`scanDelay 300`，iOS 用 `facingMode: environment`，其余枚举后置相机并排除超广/长焦）；`S5()` 解析 `link` 后 `setGlobalValue("hyperliquid.api_wallet", {address, key})`，提示 `qr.code.scan.complete`；`B8()` 会话优先级 `hloa` 覆盖 > api_wallet（`type: "api"`）> Privy > wagmi；主钱包动作提示 `cannot.sign.with.api.wallet.mobile`。

### 我方现状与差距（来源：41 代理理解工作流，17 项差距，每项「代码准确性」与「契约/安全」两路核验）

- 已具备且更严格：精确 owner 审批、30 天 `Mobile valid_until` Agent、审批前后 `extraAgents` 核验、AES-GCM 片段信封 + 60 秒一次性票据、4 秒按住显示与失焦/隐藏取消、票据到期自动关闭、失败关闭开关、桌面撤销、Agent-only 会话不能构造 USER_SIGNED 调用。
- P0：生产 `apps/terminal/src/edge/lambda-handler.ts` 对 `/mobile-agent-sync-ticket` 固定 503（单进程内存票据存储无法跑在 Lambda），构建开关 `VITE_MOBILE_PAIRING_*` 为空 → 功能在生产不可达；`docs/mobile-sync-production-readiness.md` 仍描述已退役的 EC2/Caddy 门控。
- P1（体验）：入口在用户菜单而非顶栏图标；审批需 Review → Approve 两步；无手机侧操作指引与屏幕共享警告；无可见倒计时；手机端 Agent-only 时资金动作整体隐藏；扫描器 `_constraints` 参数无效、不选后置主摄；真机矩阵 11 行从未执行。
- 核验纠正要点：官方无 `extraAgents` 检查；我方揭示前的复核不占用票据 60 秒（复核在签发票据之前）；`qr-scanner` 自身已用原生 `BarcodeDetector`，不必引入 `barcode-detector`；`listCameras` 必须在 `start()` 之后调用，否则会临时打开无约束视频流；资金分类只查默认 dex 的 `clearinghouseState`（builder dex 有资金而主 dex 为零会被误拦，留作后续）；手机导入依赖 `agent-storage.ts` 的隐式 `?? "local"` 默认。

### 决策

见 [ADR 0015](../../adr/0015-link-device-alignment.md)：D1 顶栏二维码入口（含紧凑菜单承接、全局 store 共享一个弹窗实例）；D2 打开即只读预检、单一审批按钮、签名中「Approve QR code with wallet...」；D3 官方文案与屏幕共享警告前置、能力范围按签名文档；D4 圆环按住显示；D5 `role="timer"` 倒计时；D6 手机端 `agent-only-session` 原因、扫描器相机选择与显式 `{ scope: "local" }`；D7 票据存储 A/B/C 三备选待定，建议 B。

## 验证与限制

- 官方实测：内置浏览器 tab 抓取 `https://app.hyperliquid.xyz` 壳与 47 个 JS 产物（5.5 MB）到会话 scratchpad；关键区段与机制摘要脱敏后存本地 `.worklog/2026-09-18/link-device-alignment/`。未截取二维码，未登录官方站点做真实链接。
- 差距图：`.worklog/2026-09-18/link-device-alignment/gap-map.json`（工作流 `wf_e49e046d-c42`，41 代理、约 7.2M 子代理 token）。核验标记 `accurate=false` 的条目已按纠正内容修正到本记录与 ADR。
- 实施（工作流 `wf_95aa2a42-ca5`，4 条并行轨道 + 构建检查；8 个对抗审查代理因会话额度用尽未运行，改由本会话人工审阅 diff）：修改 41 个文件，新增 `docs/adr/0015-link-device-alignment.md`。构建检查与最终复跑（2026-09-18，工作区基线 d6225648 之上）：`pnpm exec biome check`（25 个 TS/TSX 文件）通过；`pnpm --filter @gatu/terminal typecheck` 通过；分组 vitest：钱包/引导/连接 UI 195 通过、移动数据展示 65 通过、启动渲染 101 通过、翻译契约 134 通过、入口/导航/抽屉/充值可用性 139 通过；最终 12 个直接相关文件 222 用例通过。`pnpm i18n:extract` + 中文 15 条新译文 + `i18n:compile` 完成；`pnpm memory:index/check/test` 通过。
- 内置浏览器实测（本地 dev 3016，`.env.local` 临时开启两个配对开关，邮箱登录会话，1300 px）：顶栏语言与设置之间出现二维码图标「关联移动设备」；点击后弹窗自动完成只读预检并落到 ready，单一主按钮「授权移动交易密钥」可用，面板显示能力范围句与三条要点；未签名、未揭示二维码。375 px 账户页正常渲染存款/提款行。内置浏览器面板对 1300 px 仿真的坐标点击未命中，改用 DOM click 触发；非代码问题。
- 已知但非本次引入：`desktop-positions-panel-shell.test.tsx` 19 用例在基线即红（mock 缺 `useInfo`、`py-1` 断言）；dev 模式下 `PositionsPanel` 报 Hooks 顺序变化并被错误边界重建，临时把 `use-funds-action-availability.ts` 还原到 HEAD 后仍复现，判定与本次改动无关，未修。`user-menu-recovery` Playwright 夹具在基线即红（`use-email-wallet-export` 绕过 mock 别名）。未做真机验收；票据路由在生产仍为 503。

## 后续与替代关系

- 2026-09-18 用户决定采用 B；实施规划写入 `docs/mobile-sync-ticketless-transfer-plan.md`（仅文档，代码未改）。实施时另起记录：A 需 DynamoDB 表、IAM、Lambda 挂载与 `MobileSyncTicketStore` 异步化；B 需删除票据客户端/服务端/部署探针并缩短信封 TTL；决定前生产开关保持关闭。
- 资金分类改用 domain 的全 dex 分类器；`docs/mobile-sync-production-readiness.md` 加退役横幅并重指 `deploy/cloudfront/README.md`，`docs/README.md`、`INDEX.md`、`agent.md`、`trading-onboarding.md`、`email-trading-signing.md`、ADR 0002、终端 README 的现行引用一并重指；`docs/hyperliquid-signing.md` 补「Mobile Agent QR 传输与 Agent-only 会话」节。
- 真机矩阵（`docs/mobile-phone-access-device-validation.md`）仍为未执行。
- 不替代任何记录。
