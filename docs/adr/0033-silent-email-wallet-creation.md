# ADR 0033：邮箱钱包在登录后静默创建，协议弹窗不与 Privy 窗口同时出现

- 状态：已接受并实施（2026-10-02）。真实邮箱注册的端到端验收还没有做。
- 关联：[邮箱交易签名](../email-trading-signing.md)、[首次交易引导](../trading-onboarding.md)、[运行时约束](../runtime-guardrails.md) §1、[ADR 0002](0002-exact-owner-trading-signers.md)、[任务记录](../work-memory/sessions/2026-10-02-silent-email-wallet-creation.md)。

## 背景与约束

- 用户 2026-10-02 报告：邮箱注册后出现「创建钱包」的提示，和协议勾选弹窗同时显示。用户的预期是钱包静默创建。
- 原因来自 `@privy-io/react-auth` 3.32.2 的源码：
  - `createOnLogin: "users-without-wallets"` 让 Privy 在登录窗口里创建钱包。验证码通过 0.9 秒后，窗口切到「Creating your wallet / Please wait...」；创建完成后，再显示 2.5 秒「Welcome / You've successfully created an account.」。
  - 这段时间 Privy 已经是登录状态。我们的协议门控一拿到地址就打开，所以两个窗口重叠。
  - 钱包已经创建、但还没被设为当前钱包的那一小段时间里，门控会判成 `wallet_required`，显示「重新连接钱包」。
- `useCreateWallet().createWallet()` 在 Privy 钱包代理（iframe）就绪时不显示任何界面。只有代理 30 秒内没有就绪，它才退回登录窗口里的创建界面。
- 客户端配置的 `createOnLogin` 优先于控制台的「登录时自动创建」开关。
- 应用里原本已有两处补建：
  - 一处在充值弹窗打开时，一处在自动充值桥 `EmbeddedDepositAutoBridge` 挂载后。
  - 两处各自持有一份创建状态。
  - 自动充值桥创建失败后会立即重试，形成循环。

## 决策

1. **`createOnLogin: "off"`。** Privy 登录窗口不再创建钱包。验证码通过后，它只显示约 1.4 秒的成功提示就关闭。
2. **根部 `EmailEmbeddedWalletProvider` 负责创建。**
   - 位置在 `PrivyProvider` 之内、`SmartWalletsProvider` 之外，持有唯一的 `useEmailEmbeddedWalletSession` 实例。
   - 邮箱会话已登录但没有内嵌钱包时，它调用一次 `createWallet()`，不传参数，也不显示钱包界面。
   - 所有使用方通过 `useEmailEmbeddedWallet()` 共享同一次创建和它的结果。
   - 失败后不自动重试，外部钱包会话不创建。自动充值桥不再自己创建。
3. **协议门控按创建进度显示。**
   - 邮箱会话缺少钱包或正在创建时为 `checking`。
   - 钱包已经存在、但还没成为当前钱包时，给 10 秒宽限，之后才判 `wallet_required`。
   - 创建失败是新状态 `wallet_setup_failed`，弹窗提供 Retry。
4. **Privy 窗口可见时不弹协议弹窗。**
   - `usePrivy().isModalOpen` 为真时，凡是会弹出协议弹窗的状态都报 `checking`。
   - `accepted`、`inactive`、`submitting` 保持不变：已经接受条款的会话不受影响，提交中的签名也不会被隐藏。
   - 推荐页的协议门控共用同一套会话判断。

## 备选方案与代价

| 方案 | 不采用的原因 |
|---|---|
| 保留 `createOnLogin`，只让协议弹窗等 Privy 窗口关闭 | 仍然会显示 Privy 的创建和欢迎界面，不是静默 |
| 用 CSS 隐藏 Privy 的创建界面 | 依赖 Privy 生成的 DOM，升级后就会失效；创建失败的错误界面也会一起被藏 |
| 在 `useLogin` 的 `onComplete` 里创建 | 只覆盖本次登录：刷新后缺钱包、老用户缺钱包、失败后的重试都要另写；而且 `onComplete` 要等 Privy 窗口关闭才触发，反而更慢 |
| 只设为 `off`，依赖自动充值桥已有的补建 | 创建期间协议门控显示「重新连接钱包」；失败后会循环重试；创建逻辑也藏在充值功能里 |
| 激活宽限改为一直等 Privy 钱包目录和 wagmi 就绪，不设时限 | 钱包永远激活不了时，用户会停在没有任何提示的 `checking`；设时限才能回到可以操作的 `wallet_required` |

## 后果与边界

- 新邮箱用户的流程：
  1. 验证码通过后，Privy 显示约 1.4 秒成功提示后关闭。
  2. 后台静默创建钱包，通常 1–3 秒。
  3. 钱包成为当前钱包后，弹出协议弹窗。

  在此期间页面可以浏览，交易和资金弹窗被挂起，等条款状态确定后恢复。
- Privy 钱包代理 30 秒内没有就绪时，`createWallet()` 仍会退回 Privy 自己的创建界面。我们的 20 秒超时会先报失败，用户可以点 Retry 再试。这是 SDK 的行为，本次没有改。
- 同一账号在多个标签页同时首次登录时，每个标签页可能各调用一次创建：
  - Privy 每次创建前都会刷新用户；用户已有钱包时，它拒绝重复创建。
  - 创建失败的那个标签页，会在用户数据更新后自动恢复。
- 10 秒宽限也覆盖老用户登录后钱包还没激活的空档。钱包确实不可用时，「重新连接钱包」最多晚 10 秒出现。
- Privy 窗口打开期间，协议弹窗先隐藏，窗口关闭后再出现。例如点「重新连接钱包」会打开 Privy 的连接窗口。
- 升级 Privy SDK 时要确认三件事：`createOnLogin` 仍以客户端配置为准；钱包代理就绪时 `createWallet()` 仍不显示界面；`isModalOpen` 的含义没有变。

## 验证

已做（结果和版本见任务记录）：
- 单元测试覆盖：
  - 共享创建只调用一次，失败后不自动重试、手动 Retry 才再建，外部钱包不创建：`email-embedded-wallet-provider.test.tsx`。
  - 门控的创建中、失败、激活宽限，以及 Privy 窗口期间暂缓：`legal-gate.test.ts`、`legal-gate-hooks.test.tsx`。
  - 失败弹窗的 Retry：`legal-acceptance-modal.test.tsx`。
  - `createOnLogin: "off"`：`privy-config.test.ts`。
- 变异检查：分别去掉失败后的重试保护、Privy 窗口期间的暂缓、创建中显示 `checking`、激活宽限，四种改法都会让测试失败。

尚未做：
- 在 app.sairn.ai 用真实邮箱完整注册一次。这需要真实邮箱验证码，留给用户验收。
- Privy 控制台的「登录时自动创建」开关没有改动；客户端配置优先，开关开着也不影响。
