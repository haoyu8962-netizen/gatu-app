<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-09-link-mobile-device-review-fixes",
  "date": "2026-10-09",
  "title": "Link mobile device 审查与修复：只关联不授权、导入密钥优先、手机端统一「需到桌面」（ADR 0039）",
  "kind": "task",
  "status": "recorded",
  "topics": ["pairing-release", "wallet-onboarding"],
  "summary": "用户要求审查电脑端连接手机与手机扫码连接电脑两个方向，并对照 app.hyperliquid.xyz。代码审查（两路子代理 + 本会话核对）结论：无 P0；P1 是从未批准 builder fee 的 owner 链接的手机无法下单或平仓（下单按钮置灰无原因，平仓类按钮报误导性的钱包错误）；P2 有 Privy 登录会删除或隐藏导入的密钥、再次批准会让已连接手机失效且无提示、二维码绘制失败要重新签名、手机端多个资金与主钱包入口可点后重连或文案不一致、iOS 系统相机导入存在 Safari 而非 PWA；另有若干 P3。生产配对开关关闭，功能线上不可达。用户选择：手机导入的密钥优先于钱包会话（对齐官方）；builder fee 先按推荐在关联弹窗里单独批准，开发服务器实测后用户否决，改为关联只关联不授权：账号未激活交易时置灰并提示先在电脑端存款下单（邮箱静默授权）。官方终端自己的订单不带 builder，普通界面没有批准 builder fee 的流程。已实施并补测试与文档；真机清单未运行；未推送。",
  "thread": null,
  "baseCommit": "805ee5a1",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/components/trading-action-button.tsx" },
    { "path": "apps/terminal/src/hooks/wallet/use-wallet-session.ts" },
    { "path": "packages/hl-react/src/signing/agent-session.ts" },
    { "path": "packages/hl-react/src/hooks/useTradingGuard.ts" },
    { "path": "docs/adr/0039-link-mobile-device-builder-fee-and-session-priority.md" },
    { "path": "docs/trading-onboarding.md" }
  ],
  "supersedes": []
}
-->
# Link mobile device 审查与修复：只关联不授权、导入密钥优先、手机端统一「需到桌面」（ADR 0039）

## 背景与范围

2026-10-09，用户要求在最新代码上审查「连接移动设备」两个方向的缺陷：电脑端连接手机，以及手机扫码连接电脑。必要时调试 app.hyperliquid.xyz 的实践。看完审查报告后，用户要求「执行修复任务，确保符合规范、功能正常」。

- 本记录为同步记录。没有任务标识（`thread: null`）。
- 基线是 `origin/dev` `805ee5a1`，隔离工作树 `.claude/worktrees/pairing-review`，分支 `claude/link-mobile-fixes`。
- 主检出停在 `codex/work-memory-2026-10-05` 且干净，本任务没有动它。

## 结论与依据

审查方法：本会话读取核心代码，另有两路只读子代理分别覆盖电脑端（含传输）和手机端（含资金入口）。所有结论都来自代码阅读，没有在真实设备上复现。

**官方实践**（2026-10-09 下载 `app.hyperliquid.xyz/trade/HYPE` 的公开打包代码 `config-DgrJgRxr.js`，只分析公开产物）：

- 电脑端图标点击后立即 `approveAgent`，名字是 `Mobile QR`，没有 `valid_until`。
- 二维码内容是 `${origin}/trade?link=` 加 base64 JSON `{address, key}`。
- 只有应用内扫码器会解析 `?link=` 并写入 `hyperliquid.api_wallet`；页面加载时不处理这个参数，所以用系统相机打开链接不会导入。
- 会话解析顺序是 `override` > `api`（已导入的密钥）> Privy > wagmi。
- 需要主钱包签名的动作统一提示 `cannot.sign.with.api.wallet(.mobile)`。
- 官方没有 builder 代码。

**发现与处理**：

| 级别 | 发现 | 处理 |
| --- | --- | --- |
| P1 | 每个非 TWAP 订单都带 builder。从未批准 builder fee 的 owner 链接的手机：下单按钮置灰且无原因；平仓 / 止盈止损 / 反手等「Enable」可点，点后报 `MissingWalletError`（「钱包连接失败」）。不会签名，但无法交易或平仓 | 初版：电脑端单独一步「Approve builder fee」（已撤回，见下文修订）。现行：关联弹窗只读检查，账号未激活交易时置灰并提示先存款下单，签手机 Agent 前再查一次（查不到则不签）；`useTradingGuard.needsOwnerApproval`，手机端统一显示「请先在电脑端下第一笔订单完成交易授权」 |
| P2 | Privy 已登录时 `allowAgentOnlySession` 为 false：导入后再登录别的账户，owner 变化会删掉导入的密钥；导入时已有 Privy 会话则显示成功，但终端仍用 Privy 账户 | 用户选择对齐官方：同网络的 Agent-only owner 优先；Agent-only 期间屏蔽 Privy 身份；断开只移除导入的密钥 |
| P2 | 每次批准都替换同名 `Mobile` Agent，弹窗没有说明；在 ready 状态关闭或超时后，旧手机已失效、新密钥被丢弃 | 风险提示加一句「会替换已连接手机上的密钥」（仍是一条提示）；关闭后丢弃密钥的行为不变（见后续） |
| P2 | 二维码绘制失败（如发布后旧代码块缺失）要求重新签名，可能循环 | 保留已批准的密钥，可以再次按住显示，并提示刷新 |
| P2 | Agent-only 手机上，金库存取与推荐返佣可点后触发重连；账户模式显示「Connect」；质押与 API 钱包页文案不同；Portfolio 手机端无原因；余额行 Transfer 被隐藏；平板宽度余额表的 Send 可打开 | 交给子代理统一为禁用加同一原因（结果见「验证与限制」） |
| P2 | iOS 系统相机打开链接时用 Safari，密钥存在 Safari 里，主屏幕 PWA 仍未连接 | iOS 浏览器导入成功后提示改在应用内扫码 |
| P3 | 扫码器把「时间超前」报成「二维码无效」，把扫码组件加载失败报成「摄像头权限失败」 | 分别给出正确提示 |
| P3 | 网络不一致的提示让用户「切换网络」，但链接片段已经擦除，切换后也无法恢复 | 改为「两端用同一网络后重新扫码」 |
| P3 | 密钥过期或被替换后，手机静默回到未连接，不说明原因 | `subscribeMobileAgentEnded` 加常驻通知 |
| P3 | 命名 Agent 上限没有预检（文案已翻译）；读屏用户无法完成「按住显示」；提交途中关闭可能丢掉已生效的新密钥；QR 版本约 12 且没有按设备像素比放大；弹窗挂在 `UserMenu` 里，跨 1000px 时会重新挂载 | 未处理，见后续 |

**确认正确的部分**：

- 精确 owner 签名：邮箱用户静默签名；外部钱包按当前连接链签名。
- 手机 Agent 注册不批准 builder fee，也不碰电脑端的默认 Agent。
- ADR 0038 之后，手机 Agent 仍走 `extraAgents` 校验，没有回归。
- 链接片段不经过服务器；Service Worker 绕过这个路由；CSP 与 `camera=(self)` 允许扫码。

### 修订：撤回关联弹窗里的 builder fee 步骤（同日，开发服务器实测后）

- 在开发服务器（`terminal-pairing` 配置；预览工具从主检出启动，先跑的是主检出代码，改为临时启动配置指向本工作树，用完已还原 `.claude/launch.json`）上，用用户的 Chrome 以邮箱账户打开「关联移动设备」。弹窗出现「批准 Builder 费用」按钮和说明。
- 弹窗随后显示交易所拒绝文案「账户 … 在 Hyperliquid 上无余额，请先存款」：说明 builder fee 授权确实被提交过一次，被交易所拒绝，没有批准任何费用，也没有资金变动。测试期间截图坐标系（1512 宽）与页面视口（1133 宽）不一致，无法排除是测试时的坐标点击误触了这个按钮。之后对签名相关控件只用元素引用点击。
- 用户指出：关联手机不应出现批准 builder fee；邮箱账户本来是静默签名。核实 `privy-owner-signer.ts` 传 `showWalletUIs: false`，属实。
- 官方实践（同日下载 277 个打包块）：自己的下单、平仓、Swap 等调用都是 `builder: void 0`；`approveBuilderFee` 只在隐藏的 Admin 开发页（`Admin-*.js`）里由「Approve Builder Fee」按钮触发，并配合「Set Order Builder Fee」在本地写 `hyperliquid.order_builder_info`。普通用户没有这个流程。
- 用户结论：先完成授权，账号才算激活。现行实施：关联弹窗不再签 builder fee；账号未激活交易时「Approve mobile trading key」置灰，通过 `aria-describedby` 关联说明「此账户尚未激活交易。请先在这台电脑上存款并下第一笔订单，完成交易授权后再关联手机」。签名前的新鲜检查与查不到时不签名的行为保留；手机端文案改为「请先在电脑端下第一笔订单完成交易授权」。

### 实施

见 [ADR 0039](../adr/0039-link-mobile-device-builder-fee-and-session-priority.md)「决策」。文档同步了以下文件：

- `AGENTS.md`：签名契约新增导入密钥优先一条；首次交易契约写明关联手机从不批准 builder fee；移动连接契约；回归清单。
- `docs/trading-onboarding.md`、`docs/hyperliquid-signing.md`、`docs/mobile-data-presentation.md`（表格两行）、`docs/runtime-guardrails.md` §1、`docs/mobile-phone-access-device-validation.md`（Setup 第 3 步）。
- ADR 0015 的「后续修订」、`docs/adr/README.md`、`CHANGELOG.md`。

资金与主钱包入口的修改由同一工作树里的子代理完成，涉及的文件和测试列在下一节。

## 验证与限制

以下检查都在提交前的工作区上运行（2026-10-09，基线 `805ee5a1`，本机 Node 22.13.0，除非另有说明）。

- `pnpm typecheck`（hl-react、ui、terminal）通过。`pnpm exec biome check` 对 52 个改动或新增的 TS/TSX/JSON 文件通过。`git diff --check` 通过。
- 全量 `vitest run --maxWorkers=4`（terminal）：673 个文件、8,898 项，6 项失败。
  - 4 项是本次改动的连带影响，修复后这 4 个文件 31 项通过：
    - `provider-address` 用例按新的优先级重写：先钱包，再设置 Agent-only owner，最后清除；
    - `root-provider-split` 源码断言改为不再出现 `allowAgentOnlySession`，并挂载 `MobileAgentEndedNotifier`；
    - `client-root-theme-lifecycle` 的 mock 补上 `subscribeMobileAgentEnded`；
    - `balances-table-visual-contract` 的按钮正则跟随新的 `onClick` 写法。
  - 2 项是 `chart-build-assets`，需要 Node ≥ 22.15。用 Node 22.15.0 复跑这个文件，17 项通过。
- 改动直接相关的测试文件逐个单进程复跑全部通过：
  - `mobile-agent-sync-modal`（17）、`mobile-agent-qr-scanner`（14）、`mobile-agent-sync-route`（10）；
  - `agent-session`（16）、`wallet-session`（44）、`use-privy-owner-signer`（20）；
  - `trading-guard-session`（8）、`trading-action-button`（19）、`deposit-order-cta`（11）；
  - `use-agent-status-mobile-ended`（2）、`use-agent-status-verification`（26）、`hl-react-exports`（2）、`mobile-agent-lifecycle`（20）。
- 子代理新增或更新的资金入口测试共 14 个文件 185 项通过，其中 `portfolio-page-agent-only`、`referral-dashboard-agent-only`、`api-wallet-view-agent-only` 是新增的。
- 源码契约 15 个文件 551 项通过：i18n、日期与数字格式、按钮名称、状态动效、弹窗表面与提示圆角、关闭控件、设计令牌棘轮、移动数据展示、品牌目录。
- 本机负载很高。同一文件里的第一个用例冷启动要 20–26 秒，默认 5 秒超时下并发运行会大面积超时，所以复跑时用 `--testTimeout=60000 --hookTimeout=60000`。CI 繁忙时 `use-explicit-agent-approval` 的首个用例可能偶发超时。
- `pnpm i18n:extract`：
  - 新增 12 条消息，中文已全部补齐；
  - zh 仍显示 3 条缺失，与 `origin/dev` 基线相同（在临时工作树里实测基线也是 3，已删除临时工作树）；
  - ar / es / fr / hi 从 44 增加到 56 条缺失，按 ADR 0038 的先例回退英文。
- 未做：
  - 浏览器（Playwright）套件、生产构建与包体测量；
  - 真机清单 RD-1 到 RD-3；
  - 真实钱包的手机 Agent 签名与手机首单；
  - Codex 对抗审查（本轮用户未要求）。

## 后续与替代关系

- 真机清单 RD-1 到 RD-3 仍是 Not run。生产开关 `VITE_MOBILE_PAIRING_ENABLED` 继续关闭。准备步骤要求先在电脑端存款并下一笔单。
- 读屏用户无法完成「按住 2 秒」：键盘可以，VoiceOver / TalkBack 只发送点击。需要另一种显示方式的设计决定。
- 提交途中关闭弹窗：交易所可能已经替换旧手机的密钥，而界面丢掉了新密钥。重新打开后还可能出现两次钱包提示。
- 命名 Agent 上限：签名前不检查。可以考虑按 `extraAgents` 数量给出提示，但上限按成交量变化，不能硬性拦截。
- QR 密度：可以缩短载荷，并按设备像素比渲染。
- 弹窗跨 1000px 时会重新挂载，签名会被中断。
