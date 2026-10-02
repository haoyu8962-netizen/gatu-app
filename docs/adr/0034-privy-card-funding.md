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
2. 收款地址由 `resolvePrivyFiatFundingDestination`（`domain/trade/privy-fiat-funding.ts`）决定：会话必须是 `wallet` 模式，会话钱包与 `clientKey` 大小写不敏感完全一致，且在 Privy 的已连接钱包列表中（Privy 的流程需要证明收款地址归属时，会在这个列表里找到该钱包并请它签一条消息；3.46.0 产物中的 `signWalletOwnershipMessage`）；邮箱会话还要求它就是嵌入式 owner，外部钱包会话就是该外部钱包。任一条件不满足时不显示入口。目的地固定为 Arbitrum One（`eip155:42161`）上的原生 USDC。
3. 外部钱包也开放：用它购买的 USDC 存入 HyperCore 时要自付 Arbitrum gas，入口与通知对外部钱包始终显示一条静态说明，不查询 ETH 余额、不据此禁用。
4. 开关 `VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED` / `VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED`，只有字符串 `true` 打开。生效值写入 `build-meta.json` 的 `privyFiatFunding`，`deploy.mjs sync --execute` 对主网打开的构建要求 `--allow-mainnet-card-funding`，与赞助充值、移动配对的闸门同一机制。测试网开关用服务商沙盒（`environment: "sandbox"`，目的链仍为主网，Stripe 沙盒不接受测试网），不会到账。
5. 入口在充值弹层的 USDC 表单里（邮箱用户在收款地址卡之后，外部钱包在金额输入之后），可用性复用 `useDepositAvailability()` 的 `available`（地区、会话模式、发布路径），充值或提款进行中、或已有一笔购买打开时禁用。
6. 点击时先关闭充值弹层，再把这次尝试写入 `use-privy-fiat-funding-store`；挂在 `AppToaster` 的 `PrivyFiatFundingHostGate` 在第一次请求时才懒加载页面级的 `PrivyFiatFundingHost`，由它调用 `fund` 并持有 Promise。懒加载让 `useFiatOnramp` 及其带出的 Privy 代码不进入运行时首屏；加载失败时结束这次尝试并显示固定的「无法打开」提示。这与「打开 Privy 前先关闭应用抽屉」一致，避免两层模态叠放；入口不排队任何我们自己的资金请求，所以不违背资金弹层「保持打开到请求结束」的规则（那条规则针对弹层自己提交的请求）。弹层关闭后组件会卸载，Promise 因此由页面级宿主持有。
7. 结果语义（`classifyPrivyFiatFundingResult/Error` 与 `getPrivyFiatFundingFeedback`）：`confirmed` 为服务商已确认的购买（成功通知，但只说 USDC 在路上、到账后打开存款）；`submitted` 及任何其他已解析的状态为不确定结果（警告色加未知状态符号）；用户退出（`User exited flow` 或 `BackNavigationError`）静默；已有流程进行中为警告；其余失败只显示固定文案，不显示原始错误。通知只报给发起时的 owner 与网络仍为当前身份的那次尝试。三段错误文本是 SDK 内部字面值，测试钉住它们仍出现在安装的产物里。
8. CSP 静态加入 Stripe 公布的 Stripe.js、Link 与嵌入式 crypto onramp 来源（`script-src` 加 `js.stripe.com`、`*.js.stripe.com`、`crypto-js.stripe.com`；`frame-src`/`child-src` 加 `js.stripe.com`、`*.js.stripe.com`、`hooks.stripe.com`、`link.com`、`*.link.com`；`connect-src` 加 `api.stripe.com`、`link.com`、`*.link.com`；严格图片清单加 `*.stripe.com`、`*.link.com`），不加整域 `*.stripe.com` 脚本或框架。其他服务商由 Privy 在新窗口打开，不需要页面 CSP。CloudFront 响应函数从同一来源重新生成。
9. `permissions-policy` 不变（`payment=()`、`camera=(self)`）：Stripe 嵌入流程里的 Apple Pay / Google Pay 与在页面内用摄像头拍证件不可用，银行卡支付不受影响。放开它们是单独的安全头决策，需沙盒实测后再定。

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

- 单测：收款地址矩阵（精确邮箱/外部 owner、`clientKey` 不一致、Agent-only、断开、不在 Privy 列表、嵌入式不是 owner、意图不明确）、请求形状（主网生产/测试网沙盒、目的链与代币地址）、结果与错误分类、SDK 错误字面值、通知语义；宿主：StrictMode 下只调用一次 `fund`、确认/提交/退出/失败/身份变化/测试网沙盒；闸门：未发起时不加载宿主、加载失败时结束尝试且不显示原始错误；入口：先关弹层再请求、外部钱包说明、各不显示条件、不可用与已有购买时禁用；`DepositForm` 两种布局都渲染且只渲染一次插槽；构建元数据与发布闸门；CSP 来源（不含整域通配）。
- 自动化不能证明：Privy 窗口与 Stripe 组件的真实渲染与 CSP 覆盖、移动端与 PWA 的弹窗行为、外部钱包所有权签名的交互、服务商的地区与 KYC 行为、到账与后续存款。以上都需要上线前提第 4 条的实测。

## 证据

- 代码：`apps/terminal/src/domain/trade/privy-fiat-funding.ts`、`apps/terminal/src/lib/trade/privy-fiat-funding-feedback.ts`、`apps/terminal/src/stores/use-privy-fiat-funding-store.ts`、`apps/terminal/src/components/trade/tradebox/privy-fiat-funding-host-gate.tsx`、`apps/terminal/src/components/trade/tradebox/privy-fiat-funding-host.tsx`、`apps/terminal/src/components/trade/tradebox/deposit/privy-fiat-funding-entry.tsx`、`apps/terminal/src/components/trade/tradebox/deposit/privy-fiat-funding-card.tsx`、`apps/terminal/src/config/privy-fiat-funding-flags.ts`、`apps/terminal/src/config/security-headers.ts`、`deploy/cloudfront/deploy.mjs`。
- 测试：`privy-fiat-funding.test.ts`、`privy-fiat-funding-host.test.tsx`、`privy-fiat-funding-host-gate.test.tsx`、`privy-fiat-funding-entry.test.tsx`、浏览器套件 `tests/browser/account-actions.pw.ts`（资金表单夹具的卡片）、`deposit-form-routing.test.tsx`、`build-meta.test.ts`、`security-policy-docs.test.ts`、`deploy/cloudfront/deploy.test.mjs`、`deploy/cloudfront/functions/functions.test.mjs`。
- 外部参考：[Privy useDepositFunds](https://docs.privy.io/wallets/funding/use-deposit-funds)、[Stripe CSP](https://docs.stripe.com/security/guide#content-security-policy)；SDK 行为来自 `@privy-io/react-auth` 3.46.0 发布产物（`use-headless-crypto-deposit-*.mjs`、`FiatOnrampScreen-*.mjs`）。
