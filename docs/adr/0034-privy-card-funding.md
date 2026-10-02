# ADR 0034：通过 Privy 法币入金购买 USDC

状态：已接受并实施（2026-10-02），默认关闭；未推送、未合入、未发布。Privy 控制台入金方式未开启，沙盒与真实购买均未执行，法律文本未修改（见「上线前提」）。0033 已由另一工作区的邮箱钱包静默创建占用，本决策使用 0034。规划与用户决定见 [Privy 升级与法币入金规划](../privy-upgrade-and-funding-plan.md)。

## 背景、目标与约束

终端唯一的入金方式是把 Arbitrum 上的 USDC 经 Circle CCTP 存入 HyperCore：外部钱包自付 gas，邮箱用户由智能钱包赞助（[CCTP 充值](../cctp-deposits.md)）。没有 USDC 的新用户无从开始。Privy 3.46.0 提供托管的法币入金界面（卡与银行转账，Stripe 嵌入、MoonPay 等服务商），可以把 USDC 买到用户钱包。

目标：在充值弹层里让用户用银行卡购买 Arbitrum USDC，到账后沿用现有 CCTP 存款。用户决定（2026-10-02）：只做法币；邮箱与外部钱包用户都开放；主网与测试网各一个开关。

约束：

- 钱包签名契约：资金只能进入与所选 Hyperliquid owner 完全一致的地址，不得退回第一个嵌入式钱包或其他已连接钱包。
- 首次交易契约：充值弹层仍只在资金快照确定为空时由引导打开；入金入口不改变资金分类、法律、签名或 builder fee 任一闸门。
- 结果反馈契约：服务商流程的结束不是到账证据，结果走全局通知，不显示服务商或 SDK 原始错误（ADR 0024）。
- 法律目录规则：涉及数据处理与风险措辞的改动必须先经合格法律审阅才能上生产。

## 决策

1. 调用 `useFiatOnramp().fund`，不调用 `useDepositFunds`。后者省略收款钱包时取「该链上第一个嵌入式钱包」，与签名契约冲突，且会带出本次不做的加密存款地址；`useFiatOnramp` 要求显式的收款地址与代币地址。两者在 3.46.0 都标为实验接口，升级时须重新核对。
2. 购买窗口打开时默认币种为美元、金额 100（`source.defaultAsset: "usd"`、`defaultAmount: "100"`），与官方终端打开时约 100 USDC 一致；用户仍可在 Privy 窗口里改币种和金额。不传时 Privy 按浏览器语言选币种且金额为 0，一打开就提示金额过低（2026-10-02 用户在实测后决定）。
3. 收款地址由 `resolvePrivyFiatFundingDestination`（`domain/trade/privy-fiat-funding.ts`）决定：会话必须是 `wallet` 模式，会话钱包与 `clientKey` 大小写不敏感完全一致，且在 Privy 的已连接钱包列表中（Privy 的流程需要证明收款地址归属时，会在这个列表里找到该钱包并请它签一条消息；3.46.0 产物中的 `signWalletOwnershipMessage`）；邮箱会话还要求它就是嵌入式 owner，外部钱包会话就是该外部钱包。任一条件不满足时不显示入口。目的地固定为 Arbitrum One（`eip155:42161`）上的原生 USDC。
4. 外部钱包也开放：用它购买的 USDC 存入 HyperCore 时要自付 Arbitrum gas，入口与通知对外部钱包始终显示一条静态说明，不查询 ETH 余额、不据此禁用。
5. 开关 `VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED` / `VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED`，只有字符串 `true` 打开。生效值写入 `build-meta.json` 的 `privyFiatFunding`，`deploy.mjs sync --execute` 对主网打开的构建要求 `--allow-mainnet-card-funding`，与赞助充值、移动配对的闸门同一机制。测试网开关用服务商沙盒（`environment: "sandbox"`，目的链仍为主网，Stripe 沙盒不接受测试网），不会到账。
6. 入口是充值弹层第一屏的独立选项，对齐官方终端（见下节）：开关打开且会话有精确 owner 时，弹层先显示「转入 USDC」与「用银行卡购买 USDC」两个并列入口（`DepositMethodChooser`）；选「转入」进入原有的充值表单，左上角有返回选择页的按钮；外部钱包不在 Arbitrum 时，切换网络的提示在选「转入」之后才出现，也有返回选择页的按钮。首屏在每次打开弹层时决定一次（打开时有购买入口才显示选择页），之后会话状态变化（钱包重连、邮箱钱包刚创建）不会让弹层在表单与选择页之间来回切换；停在选择页时购买入口暂时不可用，会以禁用状态保留。「转入 USDC」的说明按钱包区分：邮箱用户是「从交易所或钱包转入」，外部钱包是「从已连接的钱包存入」，因为外部钱包的转入路径由它自己签名，没有可从交易所发送的地址。开关关闭或没有精确 owner 时不显示选择页，直接进入充值表单，与之前完全相同。购买入口的可用性由 `usePrivyFiatFundingOffer` 根据 `useDepositAvailability()` 的 `available`（地区、会话模式、发布路径）计算，充值或提款进行中、或已有一笔购买打开时禁用；不可用时选择页下方显示与充值表单同一条可用性说明。2026-10-02 首版把购买卡片放在充值表单里，用户看过官方设计后要求改为独立入口。
7. 点击时先关闭充值弹层，再把这次尝试写入 `use-privy-fiat-funding-store`；挂在 `AppToaster` 的 `PrivyFiatFundingHostGate` 在第一次请求时才懒加载页面级的 `PrivyFiatFundingHost`，由它调用 `fund` 并持有 Promise；调用前先复核发起时的 owner 与网络，懒加载期间身份已变化时结束这次尝试、不打开 Privy。懒加载让 `useFiatOnramp` 及其带出的 Privy 代码不进入运行时首屏；加载失败时结束这次尝试并显示固定的「无法打开」提示。这与「打开 Privy 前先关闭应用抽屉」一致，避免两层模态叠放；入口不排队任何我们自己的资金请求，所以不违背资金弹层「保持打开到请求结束」的规则（那条规则针对弹层自己提交的请求）。弹层关闭后组件会卸载，Promise 因此由页面级宿主持有。
8. 结果语义（`classifyPrivyFiatFundingResult/Error` 与 `getPrivyFiatFundingFeedback`）：`confirmed` 为服务商已确认的购买（成功通知，但只说 USDC 在路上、到账后打开存款）；`submitted` 及任何其他已解析的状态为不确定结果；用户退出（`User exited flow` 或 `BackNavigationError`）静默；已有流程进行中为警告。拒绝时只有确定没成交的情况显示为失败（结账准备阶段的 `Something went wrong setting up checkout. Please try again.`、`Unable to open payment window`、`Unable to start payment session`，以及服务商报告的 `Transaction failed`）；Privy 的 `Could not confirm payment status yet.`、`Unable to check payment status. Please try again.` 和任何未识别的错误都可能发生在扣款之后，报告为「状态未知」（品牌契约：未知结果从不画成失败）。不确定结果（submitted 与状态未知）用警告色加未知状态符号并常驻到用户关闭，与其他资金操作的状态未知一致；说明按行给出，外部钱包的 ETH 网络费说明单独一行，不拼接两段译文。任何情况都不显示原始错误。通知只报给发起时的 owner 与网络仍为当前身份的那次尝试。上述错误文本是 SDK 内部字面值，测试钉住它们仍出现在安装的产物里（`Transaction failed` 由模板生成，按模板形状钉住）。
9. CSP 静态加入 Stripe 公布的 Stripe.js、Link 与嵌入式 crypto onramp 来源（`script-src` 加 `js.stripe.com`、`*.js.stripe.com`、`crypto-js.stripe.com`；`frame-src`/`child-src` 加 `js.stripe.com`、`*.js.stripe.com`、`hooks.stripe.com`、`link.com`、`*.link.com`；`connect-src` 加 `api.stripe.com`、`link.com`、`*.link.com`；严格图片清单加 `*.stripe.com`、`*.link.com`），不加整域 `*.stripe.com` 脚本或框架。其他服务商由 Privy 在新窗口打开，不需要页面 CSP。CloudFront 响应函数从同一来源重新生成。
10. `permissions-policy` 不变（`payment=()`、`camera=(self)`）：Stripe 嵌入流程里的 Apple Pay / Google Pay 与在页面内用摄像头拍证件不可用，银行卡支付不受影响。放开它们是单独的安全头决策，需沙盒实测后再定。

## 官方终端对照（2026-10-02）

用户 Chrome 中已登录的 `app.hyperliquid.xyz/trade/HYPE`（只查看，未提交任何操作）：页头与账户面板的「存款」打开同一个弹窗，第一屏标题「充值」，两个并列入口：「转入加密货币」（从中心化交易所或加密钱包转入，右侧一排资产图标）与「使用法币购买 USDC」（银行卡 • Apple Pay • Google Pay • 银行转账）。选「转入」进入「从 Arbitrum 充值 USDC」：资产与网络选择、二维码与充值地址、到账/费用/处理时间、风险提示，底部注明由独立第三方 Across 提供；左上角返回箭头回到第一屏。选「法币购买」在同一弹窗里进入第二屏，嵌入第三方 swapped.com 的购买组件（输入法币金额、预设金额、选择支付方式、`Buy USDC via Card`），iframe 授权了 `payment` 与 `camera`。

本项目的差异：第二屏「转入」只支持 Arbitrum 上的原生 USDC，所以入口叫「转入 USDC」而不是「转入加密货币」；购买由 Privy 的 `useFiatOnramp` 在 Privy 自己的窗口里完成，不能嵌入我们的弹窗，所以选择后先关闭充值弹层；`permissions-policy` 未放开，因此不宣称 Apple Pay / Google Pay。

## 备选方案与代价

- `useDepositFunds`：官方首推，支持法币与加密存款的方式选择，但收款钱包可省略、加密存款需要 Privy 的 swap 与 App pays gas 赞助并生成另一个存款地址，和现有 LI.FI、ZeroDev 赞助重复。不采用。
- 只给邮箱用户：规划时的推荐，可避免外部钱包缺 gas 卡在半路；用户选择都开放，用静态说明代替。
- 弹层内调用并保持打开：两层模态叠放，且与连接界面「先关闭应用抽屉」的做法不一致；弹层关闭即卸载，结果无人报告。不采用。
- CSP 随开关生成：与边缘响应函数「一份静态策略、单独发布」的架构冲突，开关关闭时多放行几个 Stripe 来源是可接受的代价。

## 上线前提（打开主网开关前）

1. 新的 Sairn Privy 应用在控制台 Account Funding 页开启卡与银行方式；是否完成 Meld KYB 由业务决定。
2. 以下法律文本经合格法律审阅后发布到 `legal/` 与两个路由面，并更新 Last Updated：服务条款与风险披露说明入金由第三方服务商提供、费用与到账时间由其决定、KYC 与付款数据由其处理；隐私政策列出入金服务商为独立处理方。拟议措辞（英文，待审阅）：*"Card and bank purchases of USDC are provided by independent third-party payment providers through our wallet provider. They collect and verify your identity and payment details under their own terms and privacy policies, set their own fees, limits and processing times, and deliver USDC to your wallet on Arbitrum. Sairn does not receive your card details, cannot reverse a purchase and is not responsible for a provider's decision to decline, delay or refund it."*
3. `deploy.mjs functions --execute` 发布新的响应函数（CSP），再发布带开关的构建（`--allow-mainnet-card-funding`）。
4. 用测试网开关在沙盒走完 Stripe 流程，并用 CSP 覆盖脚本确认无违规；再用最低金额真实购买一次，确认 USDC 到 owner 地址后完成一次 CCTP 存款。地区限制与服务商覆盖叠加后的实际可用地区（Stripe 只有美国（不含纽约州）与欧盟，而美国在本终端的地区限制里）需业务确认。

## 验证标准与边界

- 单测：收款地址矩阵（精确邮箱/外部 owner、`clientKey` 不一致、Agent-only、断开、不在 Privy 列表、嵌入式不是 owner、意图不明确）、请求形状（主网生产/测试网沙盒、目的链与代币地址、默认美元 100）、结果与错误分类（确定失败与状态未知分开）、SDK 错误字面值、通知语义（不确定结果常驻、说明分行）；宿主：StrictMode 下只调用一次 `fund`、确认/提交/退出/确定失败/状态未知/开始前与开始后的身份变化/测试网沙盒；闸门：未发起时不加载宿主、加载失败时结束尝试且不显示原始错误；入口：先关弹层再请求、外部钱包说明、各不显示条件、不可用与已有购买时禁用；选择页：无入金时直达表单、选择页→表单→返回、每次打开回到选择页、首屏每次打开只决定一次、外部钱包先选择再提示切网络且可从切网页返回、准备提交期间返回按钮禁用、发起购买前关闭弹层、可用性传递；构建元数据与发布闸门；CSP 来源（不含整域通配）。
- 浏览器（夹具）：375/1363 px、深浅主题、邮箱与外部钱包的选择页完整可见、无横向溢出，选「转入」进入表单，选「购买」关闭弹层。
- 自动化不能证明：Privy 窗口与 Stripe 组件的真实渲染与 CSP 覆盖、移动端与 PWA 的弹窗行为、外部钱包所有权签名的交互、服务商的地区与 KYC 行为、到账与后续存款。以上都需要上线前提第 4 条的实测。

## 证据

- 代码：`apps/terminal/src/domain/trade/privy-fiat-funding.ts`、`apps/terminal/src/lib/trade/privy-fiat-funding-feedback.ts`、`apps/terminal/src/stores/use-privy-fiat-funding-store.ts`、`apps/terminal/src/hooks/trade/use-privy-fiat-funding-offer.ts`、`apps/terminal/src/components/trade/tradebox/privy-fiat-funding-host-gate.tsx`、`apps/terminal/src/components/trade/tradebox/privy-fiat-funding-host.tsx`、`apps/terminal/src/components/trade/tradebox/deposit/deposit-method-chooser.tsx`、`apps/terminal/src/components/trade/tradebox/deposit-modal.tsx`、`apps/terminal/src/config/privy-fiat-funding-flags.ts`、`apps/terminal/src/config/security-headers.ts`、`deploy/cloudfront/deploy.mjs`。
- 测试：`privy-fiat-funding.test.ts`、`privy-fiat-funding-host.test.tsx`、`privy-fiat-funding-host-gate.test.tsx`、`use-privy-fiat-funding-offer.test.tsx`、`deposit-method-chooser.test.tsx`、`deposit-modal-withdrawal-routing-guard.test.tsx`（选择页、返回、每次打开回到选择页、先选择再提示切网络）、浏览器套件 `tests/browser/account-actions.pw.ts`（资金表单夹具的选择页）、`build-meta.test.ts`、`security-policy-docs.test.ts`、`deploy/cloudfront/deploy.test.mjs`、`deploy/cloudfront/functions/functions.test.mjs`。
- 外部参考：[Privy useDepositFunds](https://docs.privy.io/wallets/funding/use-deposit-funds)、[Stripe CSP](https://docs.stripe.com/security/guide#content-security-policy)；SDK 行为来自 `@privy-io/react-auth` 3.46.0 发布产物（`use-headless-crypto-deposit-*.mjs`、`FiatOnrampScreen-*.mjs`）。
