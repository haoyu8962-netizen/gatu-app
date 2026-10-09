# ADR 0039：Link mobile device 只关联不授权，手机导入的密钥优先于钱包会话

- 状态：已接受并实施（2026-10-09，分支 `claude/link-mobile-fixes`，基于 `dev` `805ee5a1`；同日按用户复核修订决策 1，见文末「修订记录」）；未推送、未合入、未发布；生产构建的 `VITE_MOBILE_PAIRING_ENABLED` 仍关闭，[真机清单](../mobile-phone-access-device-validation.md)三行仍未运行。
- 关联：[ADR 0015](0015-link-device-alignment.md)（D8 去掉了签名前的 builder fee 预检，本 ADR 改为「账号未激活交易时不关联」的只读检查）；[ADR 0002](0002-exact-owner-trading-signers.md)；[ADR 0033](0033-silent-email-wallet-creation.md)（「登出前关闭被隐藏的 Agent-only owner」在本 ADR 后只剩跨网络情形）；[ADR 0038](0038-unnamed-default-agent-for-trading-connection.md)；[首次交易](../trading-onboarding.md)；[签名机制](../hyperliquid-signing.md)；[移动数据展示](../mobile-data-presentation.md)；[任务记录](../work-memory/sessions/2026-10-09-link-mobile-device-review-fixes.md)。

## 背景与约束

2026-10-09 对 Link mobile device 两个方向做了代码审查，并读取了 app.hyperliquid.xyz 当天的生产打包代码（`config-DgrJgRxr.js`，文件名随发布变化，不作稳定引用）。

- **builder fee 阻断交易**：除 TWAP 外，每个订单都带 `DEFAULT_BUILDER_CONFIG`，需要 owner 签名的 `approveBuilderFee`。ADR 0015 D8 删掉了电脑端签名前的预检。电脑端 owner 若从未在 Sairn 下过单，手机拿到的密钥能签名，但 builder fee 一直没有批准：
  - 手机下单按钮停在置灰的「Enable Trading」，没有原因说明；
  - 平仓、止盈止损等按钮显示可点的「Enable」，点了以后报「钱包连接失败」，而手机上根本没有钱包。
  - 官方终端没有这个问题：它自己的订单一律 `builder: undefined`，普通界面里没有「批准 builder fee」的流程，只有隐藏的 Admin 开发页能签 `approveBuilderFee` 并在本地设置 `hyperliquid.order_builder_info`。Sairn 每笔非 TWAP 订单都带自己的 builder 代码，所以 owner 必须先签一次 `approveBuilderFee`；邮箱账户由 Privy 静默签名（`showWalletUIs: false`），通常在电脑端第一笔订单时自动完成，而交易所要求账户先有存款才接受这次授权。
- **会话优先级**：`resolveSession` 让已连接钱包优先，`client-root` 在 Privy 已登录时关掉 Agent-only。由此出现两个问题：
  - 手机已有 Privy 会话时导入，页面显示成功，但终端仍用 Privy 账户；
  - 导入后再用另一个账户登录 Privy，owner 变化会让 `session-provider` 删掉刚导入的手机密钥，界面没有任何提示。
  - 官方终端里已导入的 API 钱包（`hyperliquid.api_wallet`）优先于 Privy 和外部钱包。
- 约束：
  - 签名仍只由精确 owner 在电脑端显式点击后发出；登录、刷新、状态检查不签名。
  - Agent 注册本身不批准 builder fee。
  - Agent-only 会话不能构造任何 User-Signed 调用。

## 决策

用户在两组方案里各选了一项（2026-10-09）。

1. **关联只关联，不做授权；账号未激活交易时不关联。**
   - 关联弹窗不发起、也不展示任何 builder fee 签名，只保留「Approve mobile trading key」一个动作。
   - 弹窗读取 `useTradingStatus().needsBuilderFee`。确认 builder fee 未批准（账号尚未激活交易）时，这个按钮置灰，并通过 `aria-describedby` 关联一句说明：「此账户尚未激活交易。请先在这台电脑上存款并下第一笔订单，完成交易授权后再关联手机。」授权仍然属于第一笔需要 builder 的交易动作，邮箱账户静默完成。
   - 点击时先 `refetchBuilderFee()` 再核对一次：
     - 仍未批准：回到置灰状态，不签名；
     - 读不到答案：显示「无法在 Hyperliquid 上核对交易是否已激活，未签名，可重试」，不签名。
   - Agent 注册（包括手机 Agent）不批准 builder fee，契约不变。
2. **手机端遇到需要主钱包批准的状态，统一显示「需到桌面」原因。**
   - `useTradingGuard` 新增 `needsOwnerApproval`：Agent-only 会话缺签名时，`needsTrading` 为 false，`enableTrading` / `guardAction` 不会发起授权。
   - `TradingActionButton` 保留静态名称并置灰，下方显示这条原因。
   - 手机和桌面的下单按钮内容在 `agent` / `builder` 阶段带上同一条 `disabledReason`。
   - 文案集中在 `lib/trade/owner-approval-message.ts`。
3. **导入的密钥优先于钱包会话。**
   - `resolveSession` 改为先看同网络的 Agent-only owner，再看已连接钱包；`client-root` 不再按 Privy 登录状态关闭 Agent-only。
   - Agent-only 期间，`useWalletSession` 屏蔽 Privy 钱包身份：`walletIntent` 为 `unavailable`，`walletAddress`、`embeddedWalletAddress` 为空，`hasWalletAccess` 为 false。`usePrivyOwnerSigner` 不再提供 owner 签名器。
   - 在 Agent-only 里点「断开」，只移除导入的密钥和 owner，不退出 Privy；设备随后回到 Privy 钱包会话。
4. **其余修复。**
   - 风险提示里写明「批准会替换已连接手机上的密钥」（仍是一条提示）。
   - 二维码画不出来时，保留已批准的密钥，可以按住重新显示，不再要求重新签名。
   - 扫码器把「二维码时间超前」与「扫码组件加载失败」分别提示。
   - 导入页的网络不一致提示改为「两端用同一网络后重新扫码」（链接片段已经擦除）。
   - iOS 浏览器里导入成功后提示「只存在这个浏览器里，主屏幕应用请在应用内扫码」。
   - 状态检查确认手机密钥过期或被替换并删除后，`subscribeMobileAgentEnded` 通知应用弹出常驻通知「手机访问已结束，请重新扫码」。

5. **手机端需要主钱包的其他入口统一为禁用加一条原因**（AGENTS.md「Mobile connection and PWA contract」）：
   - 资金类入口沿用 `agent-only-session` 文案；
   - 非资金的主钱包动作共用 `hooks/trade/use-master-wallet-action-reason.ts` 的一句「此操作需要在桌面连接主钱包」。
   - 覆盖范围：金库存取、推荐返佣领取 / 填码 / 建码、账户模式、质押、API 钱包授权与移除、Portfolio 手机端原因列表、手机余额行 Transfer、桌面余额表的 Send / 划转 / 提款。
   - 不再隐藏这些入口，不再点了去重连，也不再提供 Connect / Reconnect / Switch 入口。

6. **手机 Agent 与官方共用 `Mobile QR` 名字，签名前只读检查命名名额**（2026-10-09 追加，用户确认后实施）。
   - 背景：一个外部钱包账户关联手机时收到交易所拒绝「Too many extra agents for cumulative volume traded. Current limit is 3」（中文已按 ADR 0038 翻译）。用公开的 `extraAgents` 查得该账户主网 3 个命名名额是 `gatu`（2026-11-02 到期）、`gatu-dev`（2026-11-16）与官方的 `Mobile QR`（2026-12-23），而我们的名字 `Mobile` 是第 4 个。
   - 官方文档：Exchange endpoint 写明一个账户 1 个无名、最多 3 个命名 API 钱包（子账户另加 2 个），名字后可加 `valid_until <时间戳>`（最长 180 天）；Nonces and API wallets 写明同名 `approveAgent` 会注销已有的同名命名钱包，钱包到期或账户无资金时也会被清理。nktkas SDK 文档写明名字 1–16 个字符、默认 90 天到期。
   - 官方实践（同日打包代码）：Link Mobile Device 用名字 `Mobile QR`、`validUntil: null`；API 钱包页用 `` `${名字} valid_until ${到期}` `` 拼接，名字可含空格。上表里官方 `Mobile QR` 的 12 月 23 日到期，与「默认 90 天」一致，ADR 0015 里「永久有效」的描述已更正。
   - 实施：`MOBILE_AGENT_NAME_BASE` 改为 `Mobile QR`（9 个字符），审批名为 `Mobile QR valid_until <ms>`，交易所解析出的名字与官方相同，因此在这里或官方关联手机会互相替换，只占一个名额。手机载荷版本升到 5：新旧版本混用时，手机提示「两端都刷新」，而不是误判为「未批准」。功能未上线，没有已关联的旧手机需要迁移；浏览器里旧名字 `Mobile` 的记录会被识别为无效并清理。
   - 名额检查：弹窗每次打开时直接调用一次 `info.extraAgents`（不经查询缓存，每次打开用自己的 AbortController，10 秒超时、不重试），只采用这次请求成功返回的结果；关闭即中止请求并丢弃结果，下次打开在新结果返回前不显示任何名额文字。第 2 轮审查指出，若沿用查询缓存的 `refetch()`，TanStack 在没有数据且已有在途请求时会复用上一次打开的请求，迟到的旧结果仍会被采用，所以改为直接请求。`getMobileAgentSlotState` 只统计未到期的命名 Agent：有 `Mobile QR` 即「替换」；否则达到文档基础上限 3 个即 `limitReached`。
   - `limitReached` 只表示用完了文档写明的基础名额：文档还写明每个子账户另加 2 个，交易所的拒绝文案也表明上限会随成交量放宽，所以提示用条件句——「此账户已有 N 个命名 API 钱包，其中没有移动密钥。Hyperliquid 允许 3 个（有子账户或成交量更高时更多），因此这次授权可能被拒绝；如果被拒绝，请先移除一个」——列出名字与到期日，附 API 钱包页入口，并通过 `aria-describedby` 关联到授权按钮。按钮不禁用。
   - 风险提示改为「授权会替换已关联手机上的移动密钥，包括在 Hyperliquid 应用中关联的手机」。
7. **审查补充（第 1 轮 Codex 对抗审查后）**：
   - Agent-only 期间账户菜单不再显示被屏蔽的 Privy 邮箱，改为显示导入 owner 的地址。
   - 桌面账户面板在 Agent-only 时保留存款 / 提款 / 划转按钮并置灰，显示同一条需到桌面的原因，不再显示「不允许存款和提款」。
   - 「手机访问已结束」通知写明账户（缩写地址），只在同网络时显示；重新扫码建立新的 Agent-only 会话或切换网络时自动撤下。
   - 本分支改动和新增的测试文件补进 CI 的显式清单，并由 `scripts/ci-workflows.test.mjs` 钉住。
8. **审查补充（第 2 轮）**：
   - 桌面与手机余额表在 Agent-only 时按 `sessionMode` 锁定资金按钮（可用性布尔值），不再取决于提示文案；地区原因优先时按钮仍禁用，原因行显示当前的地区原因。
   - 「手机访问已结束」通知忽略迟到的、属于已被新导入密钥取代的 owner 的事件。
   - 新增原因行改用 `trading-panel-*` 令牌。

## 备选方案

- **在关联弹窗里单独一步批准 builder fee**（本 ADR 初版，2026-10-09 当天实施后撤回）：把下单授权塞进关联流程，用户不理解为什么关联手机要批准费用；邮箱账户本来是静默签名，却被暴露成一个按钮；账户未存款时交易所直接拒绝，关联卡在一个无关步骤上。用户复核后否决。
- **手机端在 builder fee 未批准时不带 builder 下单**（与官方一致）：关联后立即可交易，但这些订单不收 builder 费用；用户的判断是账号应先完成授权再激活，未采用。
- **保留自己的 `Mobile` 名字，只加名额检查**：同时使用两边关联手机的用户会多占一个名额；未采用。
- **名额已满时禁用授权按钮**：上限会随成交量放宽（拒绝文案写的是「for cumulative volume traded. Current limit is N」），硬拦截会误伤高成交量账户；未采用。
- **保留钱包优先，只补保护**（登录别的账户时只隐藏、不删除；导入页检测到 Privy 会话时要求先退出）：改动小，但和官方行为相反，导入后仍要多一步。未采用。
- **把 builder fee 并进 Agent 注册的同一次点击**：违反「Agent 注册不批准 builder fee」的契约，也让一次点击背上两个签名。未采用。

## 后果与边界

- 有一条契约例外，已写进 `AGENTS.md`：
  - 「Treat the active wallet account as the signing identity」在 Agent-only 期间不适用，因为此时不创建任何 User-Signed 客户端，Privy 身份被屏蔽。
- 手机原先已连接外部钱包 B 时，导入 owner A 会让 owner 从 B 变成 A。`session-provider` 照常关闭 B 的注册会话，删掉 B 的本地 Agent 密钥，所以以后再用 B 需要重新建立连接。邮箱 owner 没有本地 Agent，不受影响。
- ADR 0033 的「登出前关闭被登录隐藏的 Agent-only owner」：同网络下已不会出现被隐藏的 owner，这条只在跨网络时仍可能触发，逻辑保留。
- 桌面弹窗仍是一句说明、一条提示、一个动作；账号未激活交易时多一句激活说明，动作置灰。
- 从未在电脑端下过单的账户不能关联手机，需要先存款并下一笔单。这是有意的顺序：授权（邮箱静默完成）在先，关联在后。
- 在 Sairn 关联手机会注销用户在官方终端关联的手机，反之亦然；风险提示已写明。
- 改名前在本应用开发或测试时批准过的 `Mobile` 命名 Agent 不会被新审批替换，到期（30 天）或在 API 钱包页移除前仍占一个名额；名额检查会把它列出来。
- 「手机访问已结束」通知是已确认的会话变化，不是被动数据状态，已登记到 [移动数据展示](../mobile-data-presentation.md)。
- 【未验证】真实设备上的手机 Agent 签名与手机首单：只有单元测试。真机清单的准备步骤已要求先在电脑端存款并下一笔单。
- 仍未处理：读屏用户无法完成「按住 2 秒」；签名提交途中关闭弹窗可能丢掉已生效的新密钥；命名 Agent 上限仍是签名后才报错；二维码画布没有按设备像素比放大。见任务记录「后续」。

## 证据

- 代码：
  - `apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx`、`trading-action-button.tsx`、`mobile-agent-qr-scanner.tsx`、`mobile-agent-ended-notifier.tsx`；
  - `apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx`、`tradebox/trade-panel.tsx`、`lib/trade/use-button-content.ts`、`lib/trade/owner-approval-message.ts`；
  - `apps/terminal/src/hooks/wallet/use-wallet-session.ts`、`use-privy-owner-signer.ts`、`providers/client-root.tsx`、`routes/mobile-agent-sync.tsx`；
  - `packages/hl-react/src/signing/agent-session.ts`、`use-agent-status.ts`、`mobile-agent-events.ts`、`hooks/useTradingGuard.ts`。
- 测试：
  - `mobile-agent-sync-modal`、`mobile-agent-qr-scanner`、`mobile-agent-sync-route`；
  - `agent-session`、`wallet-session`、`use-privy-owner-signer`；
  - `trading-guard-session`、`trading-action-button`、`deposit-order-cta`；
  - `use-agent-status-mobile-ended`、`hl-react-exports`、`mobile-agent-lifecycle`（`getMobileAgentSlotState`）、`mobile-sync-core`（版本 5）。

## 修订记录

- 2026-10-09 初版决策 1 是「电脑端单独一步批准 builder fee」。在开发服务器上实测时，弹窗出现「批准 Builder 费用」按钮；对一个零余额的邮箱账户，这一步被交易所以「账户无余额，请先存款」拒绝，没有批准任何费用，也没有资金变动。用户复核指出关联不应承担授权，且邮箱授权本来是静默的。改为现行决策 1：关联弹窗只读检查，账号未激活交易时置灰并说明先存款下单。备选方案已补记两种未采用的做法。
- 2026-10-09 追加决策 6：一个外部钱包账户关联手机时撞上命名 API 钱包上限。经官方文档与官方打包代码核对后，手机 Agent 改用官方同名 `Mobile QR`（载荷版本 5），并在签名前只读检查命名名额。
