<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-official-link-mobile-device-ux-trace",
  "date": "2026-09-24",
  "title": "官方 Link Mobile Device 的 UI/UX 实时取证，与 Sairn 关联移动设备复杂度对照",
  "kind": "task",
  "status": "recorded",
  "topics": ["pairing-release"],
  "summary": "官方关联移动设备的 DOM/产物只读取证，未点击会授权永久 Agent 的图标；旧项目复杂度对照促成 ADR 0015 D8，后续已实施 v4 单开关简化。原 5165 行等规模数字属于裁剪前，保留显式动作和限期的差别，真机验收仍缺。",
  "thread": null,
  "baseCommit": "6be105da",
  "commits": ["eca604ff"],
  "sources": [
    { "url": "https://app.hyperliquid.xyz/assets/config-DWLPMyx3.js" },
    { "url": "https://app.hyperliquid.xyz/assets/index-58uVNh8f.js" },
    { "url": "https://app.hyperliquid.xyz/assets/zh-CN-CL54VvS6.js" },
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "path": "docs/mobile-sync-ticketless-transfer-plan.md" },
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx" },
    { "path": "apps/terminal/src/routes/mobile-agent-sync.tsx" },
    { "path": "apps/terminal/src/lib/mobile-sync/sync-core.ts" },
    { "path": "docs/work-memory/sessions/2026-09-24-link-mobile-device-live-verification.md" }
  ],
  "supersedes": []
}
-->
# 官方 Link Mobile Device 的 UI/UX 实时取证，与 Sairn 关联移动设备复杂度对照

## 背景与范围

同步记录。用户在真实账户走通 Sairn 关联移动设备之后，要求调试官方 `app.hyperliquid.xyz/trade` 的同名功能是如何设计的，并问「需要当前项目那么复杂吗」。取证方式：下载官方当日线上产物做静态分析，并在应用内浏览器里已登录的官方会话上读取真实 DOM 与 React props（只读，没有点击二维码图标，因为官方点击即在该账户上创建永久 Agent）。ADR 0015 在 2026-09-18 已有一次静态分析，本记录以当日产物复核并补上实时 DOM 证据与代码规模对照。

## 结论与依据

### 官方实现（2026-09-24 产物）

- **入口**：头部右侧、地址旁的 32px `div`（实时 DOM：无 `role`、无 `aria-label`、无 `title`，`onClick` 即 `async()=>{if(n(!0),!e){s(!1);try{await c(),s(!0)}catch{n(!1)}}}`）。渲染条件 `!isMobileOrTablet && walletButton.variant !== "none"`，即桌面且已连接。
- **点击即签名**：组件挂载时 `Kg()` 生成随机私钥；点击后打开弹窗并立即调用 `approveAgent({ name: "Mobile QR", address: pubkey, validUntil: null })`——同名替换、**永久有效**；签名被拒或失败则关闭弹窗，没有错误态；弹窗关闭时重新生成密钥。
- **弹窗两态**：签名中是转圈加「使用钱包扫描QR码...」；就绪是标题「链接移动设备」、两行说明「在手机上打开app.hyperliquid.xyz / 并点击“连接”链接此钱包。」、208px 空白框、底部提示「二维码支持移动交易，但不支持存款和提款。不要与他人分享这个二维码或其截图。确保您没有共享您的屏幕。」和「按住以显示」按钮（`delayInSeconds: 4`，按钮内 20px 圆环，`document` 上的 `mouseup`/`touchend` 归零；没有失焦或页面隐藏取消）。揭示后每秒递减的 60 秒计时到零调用 `onClose`，**计时不显示**。
- **二维码内容**：`${origin}/trade?link=` + `btoa(JSON.stringify({ address, key }))`，明文私钥放在查询串，无加密、无过期、无网络或来源绑定。
- **手机侧**：连接弹窗（移动 UA 且连接选项含 `QrLink`）第一项「链接桌面钱包」→ 扫码弹窗（「点击桌面右上角的{icon}图标生成二维码进行扫描。」，iOS 走固定约束、其它平台按标签正则挑后置非超广角摄像头）→ 解析 `link` → `setGlobalValue("hyperliquid.api_wallet", {address, key})` → 提示「二维码扫描完成。」；解析失败提示「通过二维码收到错误数据。」。用系统相机直接打开链接时，`/trade` 路由的 effect 看到 `link=` 就同样写入并 `navigate("/trade")`，**没有显式导入步骤**。
- **会话与清理**：`z8()` 里 `api_wallet` 优先于 Privy 和 wagmi（`type: "api"`）；解析签名器时若 `extraAgents` 已加载而其中没有该地址，或私钥无效，则打印警告并删除本地记录——远程核验是懒惰的、在使用时才做。手机「更换钱包」清除 `api_wallet`。桌面没有撤销面板：再次点击图标即替换，或到 API 钱包页面「移除API钱包」。
- **规模**：桌面入口、弹窗、按住按钮与圆环约 40 行压缩代码（`yre`、`Zy`、`qy`、`are`），手机解析与扫码弹窗约 60 行（`x5`、`vre`、路由 effect），文案 11 条。

### Sairn 实现（`6be105da`）

- 实现 5,165 行（弹窗 1,654、手机路由 852、`sync-core` 756、扫码器 343、`hl-react/signing/mobile-agent` 303、显式审批 hook 256、其余 8 个 `lib/mobile-sync` 文件），测试 4,574 行，配对面文案 140 条，`SyncState` 10 态加 `ResetState` 8 态，2 个失败关闭的构建开关，文档 5 份（ADR 0015、无票据规划、配对页加固规划、扫码器 PRD、真机矩阵）加矩阵校验器与头部擦除生成/检查脚本各 2 个，CloudFront 函数为配对页写响应头。
- 与官方逐层对照（「契约」指 AGENTS.md / ADR 0002 / ADR 0015 明确要求的属性）：

| 层 | 官方 | Sairn | 评估 |
| --- | --- | --- | --- |
| 触发签名 | 打开即签 | 只读预检后显式「Approve」 | 契约（签名跟随显式动作），成本低，保留 |
| 审批前预检 | 无 | 资金快照（含逐个 builder dex）、builder fee、预留槽位 | 为避免未入金账户签名后被交易所拒绝；可退化为直接显示交易所错误 |
| Agent 有效期 | 永久 | 30 天 `valid_until` | 成本低，保留 |
| 传输载体 | `?link=` 明文查询串 | `#` 片段里的 AES-GCM 信封（版本、创建/到期、syncId、origin/env/owner 绑定） | 片段本身就不出浏览器；加密对持有链接者无效，只剩字段绑定与 TTL 的价值，可用明文结构化字段替代（`sync-core` 756 行的主要来源） |
| 按住显示 / 自动关闭 | 4 秒 / 60 秒，无倒计时 | 同样 4 秒 / 60 秒，加失焦、隐藏、Escape 取消与可见倒计时 | 等价，保留 |
| 结果未知的恢复 | 无（失败即关，重点即重签） | 恢复记录、pending-verification、注册租约与 epoch、多标签互斥 | 同名 Agent 重签即替换，丢失结果无害；这是最大的一块可裁剪复杂度 |
| 审批后核验 | 桌面不核验，手机使用时懒核验 | 桌面 `waitForExpectedMobileAgent` 轮询，手机导入前核验 | 保留一次导入前核验即可，桌面轮询与重试 UI 可去 |
| 手机导入 | 扫码或打开链接即写入 | 显式 Import、草稿 sessionStorage、syncId 去重、到期、头部擦除脚本管线、SW 放行、说明页 | 显式 Import 与片段擦除是 ADR 0015 验收 1；生成/校验管线与交接对象可收敛为一段内联脚本 |
| 撤销 | 无面板；再授权替换或 API 页面移除 | 弹窗内 8 态撤销面板加远程核验 | Sairn 也有 API 钱包页面的移除，面板是重复入口，可换成链接 |
| 入口 | 一个图标 | 图标、紧凑菜单、用户菜单三处 | 次要 |
| 开关 | 无 | 两个互相依赖的构建开关 | 一个即可 |
| 真机矩阵 | 无 | 11 行 Not run 阻塞开关 | 流程成本，不是代码；是功能做完一周仍不可达的直接原因 |

### 结论

官方把整个功能压到约 100 行，是因为接受了五件事：打开即签、永久 Agent、明文私钥进查询串、自动导入、懒清理。Sairn 比官方多出的属性里真正有安全意义的只有三项：30 天有效期、片段传输、导入前核验；其余（信封加密、恢复/租约/epoch 机器、桌面撤销面板、桌面轮询核验、双开关、擦除管线、逐 dex 预检）不是契约要求，估计占实现的一半以上。在保留契约的前提下，收敛到约 1,500–2,000 行是现实的。F1（系统相机把带凭据链接留在浏览器历史）官方同样存在且更差（查询串会进服务器日志），官方不处理。

## 验证与限制

- 证据来源：`curl` 下载的三个产物（config 2,044,738 B、index 1,423,316 B、zh-CN 155,112 B）中的代码片段与文案；已登录官方会话的 `elementsFromPoint` 扫描与 React props `onClick.toString()`。未点击官方图标、未在官方账户上签名、未打开官方手机连接弹窗（登录态下不显示）。
- Sairn 规模用 `wc -l` 统计，文案数按 `en/messages.po` 中引用配对三个文件的条目计。
- 本记录不改代码；是否简化由用户决定。

## 后续与替代关系

- 不替代 ADR 0015 的 2026-09-18 分析；补充当日复核与规模对照。接续 [2026-09-24-link-mobile-device-live-verification](2026-09-24-link-mobile-device-live-verification.md)。
- 若用户决定简化：先改 ADR 0015 记录新决策，再按上表裁剪，协议版本号递增（线上开关关闭，无存量用户）。

## 周整理补注（2026-09-28）

“决定待用户”和旧项目规模属于取证阶段，后续已选定并实施简化。官方证据仍仅是该日期产物和已观察 DOM，未在本周重新调试官方交易终端。

后续来源：[2026-09-24-link-mobile-device-simplification](2026-09-24-link-mobile-device-simplification.md)。

本条为事后整理；本轮仅核对 Git、现行文档和相关实现入口，原验证结果仍归属来源任务，未重跑业务测试。详见 [本周整理](2026-09-28-weekly-memory-review.md)。
