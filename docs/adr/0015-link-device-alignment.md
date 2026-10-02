# ADR 0015：链接移动设备体验对齐官方，保留更严格的凭证边界

状态：D1–D6 已接受并实施（2026-09-18）；D7 于 2026-09-18 由用户选定方案 B（去服务端票据的纯客户端传输）并于同日完成代码实施（信封 v3、TTL 2 分钟、揭示后 60 秒单调时钟窗口、手机端 `syncId` 本地去重、票据端点与 EC2 时代发布脚本删除），随 p22 上线、开关关闭；D8 于 2026-09-24 由用户按 [简化规划](../link-mobile-device-simplification-plan.md) 的推荐决定并实施，取代 D2 的预检与恢复记录、D5 的信封倒计时来源、D7 的加密信封与去重，真机清单缩为三行，生产开关仍关闭。作者：Claude Fable 5.1 会话（工作记录 `docs/work-memory/sessions/2026-09-18-link-device-alignment.md`）。

## 上下文

官方 app.hyperliquid.xyz（2026-09-18 抓取的 `assets/config-COoFw5do.js`，仅分析公开产物与 DOM，未获取任何真实二维码）的「Link Mobile Device / Link Desktop Wallet」机制：

- 桌面入口是右上角一个二维码图标按钮，不在菜单里。点击即打开弹窗并立即生成随机 Agent 私钥、调用 `approveAgent`（名称固定 `Mobile QR`，无 `valid_until`，永久有效，同名替换旧 Agent）；签名期间显示转圈与「Approve QR code with wallet...」；签名失败关闭弹窗。
- 审批成功后显示标题「Link Mobile Device」、提示「在手机上打开 app.hyperliquid.xyz 并点击 Connect」、底部警告「二维码支持移动交易，但不支持存款和提款。不要与他人分享这个二维码或其截图。确保您没有共享您的屏幕。」，以及「按住以显示」按钮（4 秒，按钮内 SVG 圆环进度，松手归零）。揭示后 60 秒自动关闭。
- 二维码内容是 `${origin}/trade?link=` + base64(JSON `{address, key}`)：明文 Agent 私钥放在查询串里，无加密、无服务端、无过期、无链上核验。
- 手机端 Connect 弹窗（移动 UA 且无注入钱包时）首项「Link Desktop Wallet」打开扫描弹窗；解析 `link` 后直接写入 `hyperliquid.api_wallet` 并提示「二维码扫描完成」；会话解析时 api_wallet 优先于 Privy/wagmi，手机以主地址「type: api」连接；需要主钱包的动作统一提示「无法使用 API 钱包签名。请切换到桌面以连接主钱包。」

我方实现（`mobile-agent-sync-modal.tsx`、`mobile-agent-qr-scanner.tsx`、`lib/mobile-sync/*`、`routes/mobile-agent-sync*.ts`、`hl-react/signing/mobile-agent.ts`）已经覆盖两个方向，且在凭证边界上更严格：精确 owner 签名、30 天 `Mobile valid_until` Agent、审批前后 `extraAgents` 核验、AES-GCM 片段信封（10 分钟）、服务端一次性票据（60 秒）、4 秒按住显示且失焦/隐藏/Escape 取消、票据到期自动关闭、失败关闭的构建开关、桌面远程核验的撤销、手机 Agent-only 会话无法构造任何 USER_SIGNED 调用。差距集中在体验与可达性：入口藏在用户菜单；审批需要「Review → Approve」两步；文案缺少手机侧操作指引与屏幕共享警告；无可见倒计时；手机端 Agent-only 时资金动作被整体隐藏而非给出「请到桌面」原因；扫描器传入的 constraints 参数无效、不选后置主摄；生产 CloudFront + Lambda 对 `/mobile-agent-sync-ticket` 固定返回 503 且两个开关关闭，功能不可达。

## 目标与约束

- 两个方向（电脑生成 → 手机扫码；手机扫码 → 以桌面授权的密钥交易）的体验与官方同等直接。
- 保持 AGENTS.md 钱包签名、首次交易引导、移动连接与移动数据展示契约：签名必须由显式动作触发，登录/刷新/状态检查不签名，Agent 注册不批 builder fee，开关失败关闭，动作可用性由布尔值决定。
- 保留所有比官方更严格且不依赖基础设施的客户端属性：片段传输、来源/网络/账户绑定、过期、远程核验、显式 Import、桌面撤销、30 天有效期。

## 决策

- D1 桌面入口：顶部导航在设置图标旁新增二维码图标按钮（`nav-compact:hidden` 簇内），仅当 `hasWalletAccess && MOBILE_PAIRING_FEATURES.createAndReveal` 时显示；紧凑宽度（≤1181 px 已连接）由 `DesktopUtilitiesMenu` 增加同名条目承接。弹窗开关状态迁入全局 modal store（`useMobileSyncModalOpen` / `useMobileSyncModalActions`），懒加载宿主、错误边界与重试仍留在 `UserMenu`。用户菜单条目保留（也是校验/撤销入口），移动端 drawer 呈现不变。
- D2 单步审批：弹窗打开且无恢复记录时自动执行只读预检（资金快照、builder fee、reserved slot），落到 `ready` 状态；资金快照先读默认 dex 与现货，两者都为空时再逐个读取 `perpDexs` 列出的 builder dex（`lib/mobile-sync/account-funding.ts`），dex 列表或任一 dex 读取失败、或成功响应里缺字段/金额不是十进制字符串时，显示「无法检查账户、未签名、可重试」的本地化提示而不判为无余额，也不显示原始传输错误（2026-09-19 补充，此前只读默认 dex，余额全在 builder dex 的账户会被误拦）；主按钮唯一「Approve mobile trading key」，签名中标签为官方同款「Approve QR code with wallet...」。保留签名前 builder-fee 复查、注册租约、恢复记录与审批后核验。不采用官方「打开即签名」：打开菜单不是替换现有 Mobile Agent 的明确意图（ADR 0002 要求签名跟随显式动作）。
- D3 文案：审批前面板合并「创建」与「审阅」要点；能力范围按 `docs/hyperliquid-signing.md`：可下单、撤单、调杠杆、vault 与子账户划转，不能提现或对外发送。隐藏面板与可见面板加入手机操作指引：在手机打开 Sairn，点 Connect → Link Desktop Wallet 扫描（或用系统相机）。官方警告语（含「确保您没有共享您的屏幕」）放在按住显示之前，因为揭示后已来不及处理。
- D4 按住显示：4 秒与取消语义不变；进度改为按钮内圆环（官方形态）并保留 `progressbar` 语义。
- D5 倒计时：可见面板显示「{n} 秒后关闭」，从现有 `remainingQrLifetimeMs()`（信封、票据单调时钟、票据墙钟三者取小；D7 实施后改为信封墙钟到期与揭示后 60 秒单调时钟两者取小）每秒重算，`role="timer"` + `tabular-nums`，不做每秒 `aria-live` 播报；揭示时一次性 sr-only 说明。
- D6 手机端：(a) 资金动作可用性新增 `agent-only-session` 原因（Deposit / Withdraw / Transfer 在 Agent-only 会话显示为禁用并给出「此手机使用桌面授权的交易密钥。存款、提款和划转需要在桌面连接主钱包。」），先在 `docs/mobile-data-presentation.md` 登记为已确认会话限制，不进入被动数据原因集合；(b) 扫描器删除无效的 constraints 参数，`start()` 后再 `listCameras` 选择非超广/长焦的后置相机，文案提示桌面右上角二维码图标；(c) 导入时显式传 `{ scope: "local" }`（原为隐式默认）并在成功面板披露「保留在此手机直到 {日期} 过期或从桌面撤销」。
- D8 收敛到官方量级（2026-09-24，用户按简化规划推荐决定）：桌面弹窗只剩一句操作说明、一条风险提示和一个动作（`idle → signing → ready → revealed`，失败一行错误并可重按），签名仍是显式点击且带 `applicationReview: "confirmed"`，成功以交易所 `status: "ok"` 为准，不再做资金/builder fee 预检、注册租约、恢复记录、待核验态与桌面 `extraAgents` 轮询；揭示要按住 2 秒（2026-09-24 按用户反馈从官方的 4 秒缩短，按住时按钮显示剩余秒数），二维码 60 秒后或失焦/隐藏时关闭。载荷改为片段里的明文 JSON（版本 4：网络、owner、密钥、Agent 到期、创建与 2 分钟到期），去掉 AES-GCM 信封、`syncId` 去重、草稿存储、头部擦除脚本管线、交接对象、说明页与 Service Worker 之外的引导分支；手机页首帧前读取并擦除片段、拒绝其它网络/过期/超前/旧版本、显式 Import 前做一次 `extraAgents` 核验、失败走既有 epoch 回滚，刷新后要求重新扫码。入口只保留头部图标（紧凑宽度不再隐藏），删除工具菜单与用户菜单条目和撤销面板：再次授权即替换，API 钱包页面可移除。两个构建开关合并为 `VITE_MOBILE_PAIRING_ENABLED`，`build-meta.json` 记 `mobileSync.enabled`（发布脚本兼容旧形状），CI 生产构建从四组变两组；真机矩阵与校验器换成三行手工清单。保留的四点差别：显式点击、30 天有效期、片段传输、导入前一次链上核验。放弃的属性：同一码重复导入被拒、结果未知时的恢复、桌面撤销面板、擦除脚本先于应用执行——理由与官方对照见 [取证记录](../work-memory/sessions/2026-09-24-official-link-mobile-device-ux-trace.md)；边缘函数的配对响应头与 Service Worker 放行暂不动。
- D7 凭证传输（已选定 B 并实施代码，真机验收未执行）：三个备选。A 保留票据并交付共享 CAS+TTL 存储（DynamoDB 条件写，两分支 consume：首次 `attribute_not_exists(consumerId) AND consumeExpiresAtMs > :now`，胜者重试 `consumerId = :c AND tombstoneExpiresAtMs > :now`；`MobileSyncTicketStore` 改为异步；Lambda 挂载处理器并移除 503 桩；限速改由 WAF）。B 去掉票据，改为与官方一致的纯客户端传输，信封 TTL 缩到 2 分钟，其余加固全部保留；失去「第二部手机兑换同一码被拒」和「重启失效」两个属性，但这两个属性都不阻止二维码被截取，且不再依赖任何服务端状态。C 手机生成密钥、只把公钥地址回传桌面（票据修复方案 §7），是唯一让截图无用的设计，但桌面需摄像头或人工输入，与官方体验相反。已选定 B 并实施；真机验收完成前 `createAndReveal` / `importFromQr` 在 CloudFront 构建中保持关闭。

## 备选方案

- 完全照搬官方（明文私钥进查询串、永久 Agent、打开即签名、无开关）：违反签名显式动作与失败关闭契约，且回退已经审查过的 bearer URL 修复，不采用。
- 只做入口与文案、不动审批步骤：仍需两次点击才到钱包提示，与官方体验差距最大的一项不解决，不采用。
- 把手机端 Agent-only 的资金动作继续隐藏：用户无法得知为何没有充值入口，官方给出明确原因，不采用。

## 后果与边界

- 桌面入口有三处（图标、紧凑菜单、用户菜单）共享一个弹窗实例；`user-menu` 测试的模块加载与挂载计数保持有效。
- 弹窗打开即发只读请求；这些查询原本就在 `open && hasWalletAccess` 时启用，不新增签名。
- `agent-only-session` 是已确认限制，允许展示原因；`PASSIVE_DATA_REASONS` 不变。
- D7 实施后 Lambda 503 桩与 CloudFront 票据转发已删除，退役路径返回 404；生产开关仍未改变，需真机验收后另行打开。
- 2026-09-24 补注：邮箱用户在弹窗里点「Approve」后仍会弹出 Privy 的「Approve mobile trading access」签名确认，原因是弹窗调用 `approveAgent.mutateAsync` 时没有声明 `applicationReview: "confirmed"`，`createPrivyAgentSigner` 按规则回退到显式 UI。官方（2026-09-24 产物 `index-58uVNh8f.js`）全局 `embeddedWallets.showWalletUIs: false`，`approveAgent` 经 Privy 钱包的 EIP-1193 provider 静默签名，应用代码没有任何按调用的 `uiOptions`；签名期间只显示转圈。现已让审批与撤销两处都传 `applicationReview: "confirmed"`（弹窗自身的审批面与「Review revoke」确认即应用层审查），行为与官方一致；同日按用户决定，API 钱包管理弹窗的授权/移除也声明 `applicationReview: "confirmed"`，进度文案对嵌入钱包改为「自动签名」而不是「在钱包里确认」。同日在开发构建（两个配对开关打开）上用真实邮箱账户走通审批 → 按住显示 → 同源第二标签导入 → 桌面撤销：审批与撤销都没有 Privy 弹窗、各约 2 秒，链上 `extraAgents` 先出现新 Mobile Agent、撤销后换成不可访问的替换密钥；撤销确认按钮对嵌入钱包改为静态的「Confirm revoke」并说明自动签名，外部钱包保留「Confirm revoke in wallet」；approving 态的「Approve QR code with wallet...」与官方签名期间文案相同、保持不变。见 [验证记录](../work-memory/sessions/2026-09-24-link-mobile-device-live-verification.md)。

## 证据

- 官方机制：本地 `.worklog/2026-09-18/link-device-alignment/official-mechanism.md`（含 bundle 名与函数名），不含二维码内容。
- 差距图：同目录 `gap-map.json`（17 项，每项两路对抗核验），摘要见工作记录。
- 实施与验证：见工作记录「验证与限制」。
