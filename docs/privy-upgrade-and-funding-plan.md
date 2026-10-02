# Privy SDK 升级与 Funding 接入规划

状态：用户已于 2026-10-02 决定（见「决定」）；阶段一已提交（分支 `claude/privy-sdk-upgrade-funding-feac6f`），阶段二已实施在其上的分支 `claude/privy-fiat-funding`，默认关闭；均未推送。日期：2026-10-02。分支 `claude/privy-sdk-upgrade-funding-feac6f`（基于 `origin/dev` 682430ba），完成后按 `.claude/rules/git.md` 开 PR 到 `dev`。取证与规划阶段没有改代码、没有登录真实账户；各阶段的实际验证见对应任务记录。任何阶段都没有改 Privy 控制台。

## 目标

1. 把 `@privy-io/react-auth` 从精确锁定的 3.32.2 升到 3.46.0（2026-09-28 发布的最新版），`@privy-io/wagmi` 从 4.0.13 升到 4.0.17，不改变身份、签名、登录方式和 Provider 层级。
2. 在现有充值弹层里为邮箱用户增加 Privy 托管的法币入金（Funding），资金落到该用户精确的嵌入式 owner 在 Arbitrum 上的 USDC，再由现行 CCTP 赞助充值进入 HyperCore。

两件事拆成两个可独立回滚的阶段：升级先合入并通过钱包回归，Funding 叠在升级之上，并由默认关闭的开关保护。

## 取证（2026-10-02）

| 事实 | 来源 |
| --- | --- |
| 3.33.0–3.46.0 的发布说明没有破坏性 API 变更；与本项目相关的是 3.36.0 起 `@stripe/crypto` 成为必需依赖、3.39.0 起内置 viem 2.56.0、3.37.1 修复嵌入式钱包 EIP-1193 在错误链上签名、3.39.0 修复旧版 EVM 注入钱包连接崩溃、3.45.0 增加随主题的阴影变量 | [react-auth changelog](https://docs.privy.io/changelogs/react-auth) |
| 3.46.0 的 `ethereumEmbedded` 空列表分支仍是 `if(h.length<1)return void xt.setState({ethereumEmbedded:[]})`，即每次 Provider 重渲染都写新数组；非空分支保留字段比较（地址、链、连接器类型、`connectedAt`）。ADR 0026 的补丁仍然需要，必须按 3.46.0 的产物重做 | `npm pack @privy-io/react-auth@3.46.0`，`dist/esm/index-*.mjs` |
| `@stripe/crypto`（1.1.3，约 72 KB 未压缩）与 `@base-ui/react/combobox`（Privy 要求 `^1.6.0`，本仓库为 1.3.0）只在 `FiatOnrampScreen` 中通过动态 `import()` 引用 | 同上，`dist/esm/FiatOnrampScreen-*.mjs` |
| `@privy-io/wagmi` 4.0.17 的 peer 要求 `viem` 精确为 2.56.0（4.0.13 为 2.52.0）；终端是 2.42.1，锁文件已同时存在 2.23.2 / 2.36.0 / 2.42.1 / 2.52.0 | `npm view`、`pnpm-lock.yaml` |
| 官方 React 入金入口已是 `useDepositFunds`：`fiat`（卡与银行，Stripe / MoonPay，完成 Meld KYB 后 50+ 币种）与 `crypto`（Privy 存款地址，需要控制台开启 swaps 与 App pays 赞助 gas）两种方式；`destination.wallet` 省略时取「该链上第一个嵌入式钱包」 | [use-deposit-funds](https://docs.privy.io/wallets/funding/use-deposit-funds)、[crypto deposits setup](https://docs.privy.io/wallets/funding/crypto-deposits/setup) |
| 返回值只说明弹窗流程状态：`fiat` 为 `submitted` / `confirmed`，`crypto` 为 `address_shown` / `completed`；取消、并发流程、未登录、配置缺失都会 reject | 同上 |
| Stripe 嵌入式入金支持 Arbitrum USDC，仅限美国（不含纽约州）与欧盟；sandbox 不支持测试网链，只能用主网链 ID 配合 `fiat.environment: 'sandbox'` | 同上，Stripe Embedded Components 一节 |
| 本项目邮箱用户的主网充值是手动的：弹层里由嵌入式 EOA 签 EIP-3009、智能钱包提交赞助的 CCTP；`EmbeddedDepositAutoBridge` 的自动充值只在测试网开启 | `apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx`、[CCTP 充值](cctp-deposits.md) |
| CSP 目前只放行 Privy、WalletConnect、ZeroDev、Circle 与 LI.FI 相关来源，没有 Stripe、MoonPay、Coinbase Onramp、Meld | `apps/terminal/src/config/security-headers.ts` |

## 决定（2026-10-02，用户答复）

1. 入金方式：只做法币。
2. 开放对象：邮箱用户与外部钱包用户都开放（不同于规划时的推荐）。外部钱包的 Arbitrum gas 问题按阶段二「外部钱包」一条处理。
3. 交付：两个 PR，升级先合。
4. 开关：主网与测试网分开。
5. viem：本次不动。
6. 控制台与商务事项由用户操作，实施不依赖它们，但真实验收依赖。

## 阶段一：只升级 SDK（单独 PR）

1. 依赖：`@privy-io/react-auth` 3.46.0、`@privy-io/wagmi` 4.0.17，继续精确锁定；新增 `@stripe/crypto` 精确版本。`viem` 暂不跟随到 2.56.0（见决策 5），接受 Privy 自带一份 viem。
2. 补丁：删除 `patches/@privy-io__react-auth@3.32.2.patch`，对 3.46.0 的 ESM 与 CJS 两个产物各重做一处「已为空则保留数组引用」，`pnpm-workspace.yaml` 的 `patchedDependencies` 键改为 `@privy-io/react-auth@3.46.0`。先在不带补丁的 3.46.0 上跑 `privy-theme-switch-wallet-stability`，确认对照失败，再加补丁确认通过。
3. 复核 `@privy-io/wagmi` 4.0.17 的 `setActiveWalletForWagmi` / `reconnect` 分支与 4.0.13 的差异；若行为变化，先更新 ADR 0026 的验证标准再继续。
4. 回归：AGENTS.md「Wallet signing, onboarding and connection UI」整组、`privy-*` 全部单测、类型检查、Biome、终端全量测试；`pnpm build`（Node 22.15，`NODE_ENV=production`）比较总包体与桌面运行时预算，记录差值。
5. 文档：ADR 0026 追加升级与新补丁的更正段（不改写原文），`docs/runtime-guardrails.md` §1 的版本号，`CHANGELOG.md` Unreleased。
6. 真实钱包验收（需要用户操作，自动化不能替代）：邮箱登录后切换深浅主题不重连、外部钱包登录与 Agent 注册、普通下单签名、邮箱用户的赞助 CCTP 小额充值。

### 阶段一实施结果（2026-10-02）

- 依赖、补丁与对照实验按上文完成；`@privy-io/wagmi` 4.0.13 与 4.0.17 的发布文件除 `package.json` 外逐字节相同。
- 包体：首次构建超出预算（总量 +91 kB、交易首屏 +84 kB，相对仓库基线）。其中约 40 kB 是本仓库的手动分块把 Privy 自带的 Base UI 1.8 拉进了首屏，已改为只把应用自己的 Base UI 放入 `vendor-base-ui`；其余来自 Privy 核心库静态引入 `libphonenumber-js` 与其自带 viem 变大，按 `docs/terminal-performance-baseline.md` 的规则用固定元数据的前后构建重设基线（总量 +83,687、交易首屏 +62,713），读数记录在该文档。
- 应用与 Privy 各带一份 viem（2.42.1 与 2.56.0），把应用升到 2.56.0 去重能抵消本次增量，但按决定 5 本次不做，列为后续。
- 另一工作区（邮箱钱包静默创建，ADR 0033）请求核对的三项 SDK 行为在 3.46.0 与 3.32.2 中语义一致：客户端 `createOnLogin` 优先于控制台值；钱包代理就绪时 `createWallet()` 不打开界面；`isModalOpen` 仍是「Privy 窗口打开或 MFA 进行中」。均为读发布产物的静态结论。

## 阶段二：Funding 接入（叠在阶段一之上）

### 推荐范围

- 只做 `fiat`，目的地固定为 Arbitrum USDC，收款地址永远是精确的 Hyperliquid owner：邮箱会话为其嵌入式 owner，外部钱包会话为该外部钱包。到账后沿用现有手动 CCTP 赞助充值，不新增自动划转。
- 不做 Privy `crypto` 存款地址：它需要 Privy 自己的 swaps 与 App pays 赞助 gas，和现有 LI.FI 跨链、ZeroDev 赞助重复，还会生成不同于 owner 的存款地址。
- 不做 Coinbase 交易所入金：需要 Coinbase Developer Platform 账户与 Onramp 密钥。
- 外部钱包用户也开放（用户决定）：法币只买到 USDC，外部钱包走 CCTP 需要自付 Arbitrum gas。入口对外部钱包始终显示一条静态说明「存入 Hyperliquid 还需要钱包在 Arbitrum 上有少量 ETH 支付网络费」，不查询 ETH 余额、不据此禁用入口；目的地是该外部钱包本身（必须是当前 Privy 用户已关联、且与所选 Hyperliquid owner 完全一致的地址）。

### 设计

1. 开关：新增 `VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED` 与 `VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED`，缺失或非 `true` 一律关闭；发布闸门的精确匹配同步加入。
2. 入口：充值弹层第一屏的独立选项「用银行卡购买 USDC」，与「转入 USDC」并列（2026-10-02 按用户要求由「表单内卡片」改为此设计）。不新增页头或首次交易引导入口，首次交易仍只在资金快照确定为空时打开充值弹层。
3. 调用：`depositFunds({ destination: { wallet: <精确 owner 地址>, chain: 'eip155:42161', asset: 'usdc' }, fiat: {...} })`。永远显式传入与所选 Hyperliquid owner 大小写不敏感完全一致的地址，地址缺失或不一致时不渲染入口；绝不依赖 Privy「第一个嵌入式钱包」的缺省行为（钱包签名契约）。
4. 门控：入口可用性复用 `useFundsActionAvailability`，地区受限或地区状态未知时禁用（理由文案沿用资金入口的单一原因）；同时尊重现有的充值关闭、网络与 owner 守卫。按钮可用性来自布尔值，不来自说明文案是否显示。
5. 结果：`confirmed` / `submitted` 只表示服务商流程结束，不等于 USDC 到账，更不等于 HyperCore 入账。通过 `AppToaster` 报告「购买已提交，到账后可存入」一类的不确定结果；取消不报错；其他 reject 存分类错误、显示时翻译（ADR 0024），不显示 Privy 原文。到账仍以 Arbitrum USDC 余额刷新为准，空账户结论仍需完整快照。
6. 弹层叠放：Privy 入金窗口是 Privy 自己的模态。打开前不关闭充值弹层（关闭会使排队的资金请求失效），需实测两层焦点与滚动锁；手机上确认 Stripe 嵌入式组件在 PWA 独立窗口内可用。
7. CSP：按实际网络请求补齐 Stripe（`js.stripe.com`、`crypto-js.stripe.com`、`api.stripe.com`、Link 等）、MoonPay，以及 Meld（若启用）的 `connect-src` / `frame-src` / `script-src`；先在 Report-Only 观察，`csp-coverage` 浏览器套件与 `security-policy-docs` 测试同步更新。具体域名以 sandbox 实测为准，本文不预先列死。
8. 法律与品牌：服务条款、隐私政策、风险披露加入第三方入金服务商（KYC 与付款数据由服务商处理、费用与到账时间由服务商决定）；改 `legal/` 后跑 `pnpm brand:check` 与 `pnpm test:brand`。
9. 翻译：新增文案走 Lingui 六种语言，中文用「存款」名词规则；Privy 窗口本身的语言不受本项目控制，记录为已知差异。
10. 新 ADR 0034（0033 已由另一工作区的邮箱钱包静默创建占用）记录范围取舍、owner 精确地址、结果语义与 CSP 扩展。

### 验证

- 单测：入口只对精确 owner 渲染；地址不一致、地区受限、开关关闭时不可用；`depositFunds` 收到的 `destination.wallet` 等于 owner；各返回值与 reject 的通知语义；取消静默。
- 浏览器：充值弹层截图（桌面、手机、深浅主题），CSP 无新增违规报告。
- 沙盒：测试网环境下 `fiat.environment: 'sandbox'` + Arbitrum 主网链 ID，用 Stripe 测试卡走完流程（不会产生真实资金，也不会到账）。
- 真实验收（需要用户）：控制台开启入金方式后，用最低金额真实购买一次，确认 USDC 到 owner 地址，再完成一次赞助 CCTP 存款进入 HyperCore。代码评审和自动化测试都不是这一步的证据。

### 阶段二实施结果（2026-10-02）

实施记录在 [ADR 0034](adr/0034-privy-card-funding.md)。与上文设计的差异：

- 入口位置：用户 2026-10-02 看过官方终端的存款弹窗后，要求法币购买做成独立入口、不要集成在充值表单里。现在充值弹层第一屏是「转入 USDC」与「用银行卡购买 USDC」两个并列入口，选「转入」才进入原有表单（有返回按钮）；开关关闭时不显示选择页。官方对照写在 ADR 0034。

- 购买窗口默认美元 100：用户实测看到 Privy 按浏览器语言选了 CNY 且金额为 0（一打开就提示金额过低）后，决定像官方一样预填约 100 美元，并因此把默认币种固定为美元。
- 审查（2026-10-02，独立代理只读审查，无 P0/P1）后的修复：可能已扣款的拒绝（Privy 的「支付状态未确认」「无法查询支付状态」及未识别错误）改报常驻的「状态未知」，只有确定没成交的拒绝显示失败；宿主调用 Privy 前复核身份；首屏每次打开只决定一次；切网页可返回选择页；「转入 USDC」说明按钱包区分；通知说明分行（不拼接译文）；新代码改用 `trading-panel-*` 令牌、去掉嵌套三元。
- 调用 `useFiatOnramp` 而不是 `useDepositFunds`：前者要求显式收款地址与代币地址，后者省略收款钱包时会取第一个嵌入式钱包。
- 收款地址还必须在 Privy 的已连接钱包列表中：Privy 的流程需要证明收款地址归属时，会在该列表里找钱包请它签一条消息（外部钱包这时会弹出签名请求；哪一步触发未实测）。
- 页面级 `PrivyFiatFundingHost` 持有购买请求，首次请求时才由 `PrivyFiatFundingHostGate` 懒加载（静态挂载时桌面运行时超出预算）；入口点击后先关闭充值弹层；可用性复用 `useDepositAvailability()`。
- 包体：最终版客户端总量比阶段一多 11,776（与 CI 同口径、不读 `.env.local` 的构建；Privy 入金模块被拆成独立块、六种语言目录、选择页、懒加载宿主），按性能基线文档的规则把总量基线上调到 3,281,384，替代首版的 +9,725；闸门不再为一条提示引用整套通知文案后，桌面运行时增量余量约 613 字节（两次相同源码构建之间有几百字节抖动）。
- 没有修改 `legal/`：法律目录要求数据处理与风险措辞先经合格法律审阅，拟议措辞写在 ADR 0034 的上线前提里，主网开关在发布前保持关闭。
- `permissions-policy` 未改，Stripe 嵌入流程里的 Apple Pay / Google Pay 与页面内摄像头拍证件不可用，作为单独决策留待沙盒实测。
- 发布闸门新增 `--allow-mainnet-card-funding`，CloudFront 响应函数随 CSP 重新生成。

## 规划时的待决事项（已于 2026-10-02 答复，见「决定」）

1. 入金方式：只做法币（推荐）／再加 Privy 加密存款地址／再加 Coinbase 交易所。
2. 开放对象：只给邮箱用户（推荐）／外部钱包也给（需要先解决 Arbitrum gas）。
3. 交付方式：两个 PR，升级先合（推荐）／一个 PR。
4. 开关：主网与测试网分开（推荐，便于先在测试网暴露沙盒）／单一开关。
5. viem：本次不动，接受 Privy 自带一份（推荐）／顺带把终端与 `hl-react` 升到 2.56.0 去重（触及签名路径，需要额外回归）。
6. 控制台与商务（只能由用户操作）：在新的 Sairn Privy 应用里开启 Account Funding 的卡与银行方式；是否完成 Meld KYB 以扩展币种；确认 Stripe / MoonPay 的服务地区与本项目地区限制叠加后的实际覆盖（受限地区包含美国，Stripe 实际只剩欧盟）。

## 风险

- 补丁维护：3.46.0 产物仍需补丁，下次升级同样要先做对照实验。
- 包体：法币页及其依赖是懒加载块，不应进入首屏；仍需以构建预算核实。
- 合规：法币入金把 KYC 与付款交给第三方，但应用仍是入口，地区限制与法律文本必须先于开关打开。
- 外部依赖可用性：Privy 入金流程出错时只能提示稍后再试，不能回退到其他服务商。
