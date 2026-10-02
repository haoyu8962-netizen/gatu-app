# ADR 0033：邮箱钱包在登录后静默创建，协议弹窗等 Privy 窗口关闭后再出现

- 状态：已接受并实施（2026-10-02）；同日经 Codex 两轮只读对抗审查后修订。真实邮箱注册的端到端验收还没有做；「待用户决定」一节有一项没有定。
- 关联：[邮箱交易签名](../email-trading-signing.md)、[首次交易引导](../trading-onboarding.md)、[运行时约束](../runtime-guardrails.md) §1、[移动端数据提示](../mobile-data-presentation.md)、[ADR 0002](0002-exact-owner-trading-signers.md)、[任务记录](../work-memory/sessions/2026-10-02-silent-email-wallet-creation.md)。

## 背景与约束

- 用户 2026-10-02 报告：邮箱注册后出现「创建钱包」的提示，和协议勾选弹窗同时显示。用户的预期是钱包静默创建。
- 原因来自 `@privy-io/react-auth` 3.32.2 的源码：
  - `createOnLogin: "users-without-wallets"` 让 Privy 在登录窗口里创建钱包。验证码通过 900 ms 后，窗口切到「Creating your wallet / Please wait...」；创建完成后，成功页再停留 2,500 ms（新用户显示「Welcome」，其他情况显示「All set!」）。
  - 这段时间 Privy 已经是登录状态。我们的协议门控一拿到地址就打开，所以两个窗口重叠。
  - 钱包已经创建、但还没被设为当前钱包的那一小段时间里，门控会判成 `wallet_required`，显示「重新连接钱包」。
- `useCreateWallet().createWallet()` 的行为：
  - 先刷新用户，再等钱包代理（iframe）就绪，最多 30 秒；代理就绪后直接创建，不打开窗口。
  - 它在两种情况下会打开 Privy 的创建界面：代理 30 秒内没有就绪；或者设备端执行模式的应用在控制台要求「创建时由用户设置恢复方式」（`require_user_owned_recovery_on_create`）。TEE 执行模式下打开这个配置，它会直接报错。
  - Privy 只唤醒最后一个等待代理的调用。两次调用重叠时，先发出的那次会等满 30 秒，然后打开创建界面。
  - 用户已有以太坊内嵌钱包时，它拒绝重复创建。
- 客户端配置的 `createOnLogin` 优先于控制台的「登录时自动创建」开关。`require_user_owned_recovery_on_create` 和「强制同意条款」只能在控制台设置，客户端覆盖不了。
- 应用里原本已有两处补建：
  - 一处在充值弹窗打开时，一处在自动充值桥 `EmbeddedDepositAutoBridge` 挂载后。
  - 两处各自持有一份创建状态。
  - 两处在创建失败后都会立即重试，形成循环：`createWallet` 每次渲染都是新引用，effect 会反复触发。
- 邮箱会话没有内嵌钱包时，原来的「断开连接」会失败：它要先按 owner 地址清理本地交易密钥，而这时没有 owner。旧流程里这个状态几乎不出现，因为 Privy 在登录窗口里创建失败时会直接登出。

## 决策

1. **`createOnLogin: "off"`。** Privy 登录窗口不再创建钱包。
2. **根部 `EmailEmbeddedWalletProvider` 是唯一的自动创建方。**
   - 位置在 `PrivyProvider` 之内、`SmartWalletsProvider` 之外，持有唯一的 `useEmailEmbeddedWalletSession` 实例。
   - 邮箱会话已登录、且用户没有任何以太坊内嵌钱包时，它调用一次 `createWallet()`，不传参数。
   - 失败或超时后不自动重试。外部钱包会话不创建。充值弹窗和自动充值桥不再自己创建。
   - 所有使用方通过 `useEmailEmbeddedWallet()` 共享同一次创建和它的结果。
3. **任何时候只有一个在途的 SDK 请求。**
   - 应用的等待上限是 20 秒，超时只结束等待，不取消 SDK 请求。
   - SDK 请求还没结束时，重试会接回同一个请求，不会再调用一次 `createWallet()`。
   - 登出后重新登录是新的会话。新会话的请求要等上一个会话的请求结束后才发出。
   - 请求在超时之后才成功的，钱包照常被采用；结果只写回发起它的那个会话。
   - 用户已有内嵌钱包、只是无法确定用哪一个时，不调用 SDK，直接报错。
4. **用户主动重试的入口有三个**，都走同一个共享创建：
   - 协议弹窗「钱包尚未就绪」状态里的 Retry；
   - 各处的「重新连接钱包 / 连接钱包」。邮箱会话还没有钱包时，它重试创建，不再只提示「邮箱钱包不可用」；
   - 充值弹窗里资金地址的 Retry 按钮。
5. **协议门控按创建进度显示。**
   - 邮箱会话缺少钱包或正在创建时为 `checking`。
   - 钱包已经存在、但还没成为当前钱包时，给 10 秒宽限，之后才判 `wallet_required`。这 10 秒从用户资料里出现钱包、而它还不是当前钱包时开始计。钱包目录未就绪或签名器连接中造成的等待另算，不占用也不延长这 10 秒。
   - 创建失败或超时是新状态 `wallet_setup_failed`。文案是「钱包尚未就绪」，不断言创建一定失败；弹窗提供 Retry 和「断开连接」。
6. **没有钱包的邮箱会话可以登出。**
   - 它自己没有交易 owner，登出不需要按 owner 清理密钥。
   - 浏览器里可能还存着一个被这次登录隐藏的 Agent-only owner（例如手机上导入的桌面授权）。登出前先按原有流程关闭它；关闭失败就不登出。不这样做的话，登出后设备会回到那个 Agent 会话。
   - 其他情况仍按原规则：owner 不能确认时拒绝断开。
   - 重连和断开都要等 Privy 钱包目录就绪。目录没就绪时沿用原有规则：两者禁用，30 秒后出现「重新加载页面」。
7. **协议弹窗等 Privy 窗口关闭后再出现。**
   - `usePrivy().isModalOpen` 为真时，`required`、`blocked`、`wallet_required`、`wallet_setup_failed`、`error` 一律报 `checking`。
   - `accepted`、`inactive` 不变。`submitting` 也不变：用户已经点了确认，条款签名正在提交，这时不能把弹窗卸掉。
   - 推荐页的协议门控共用同一套会话判断。
8. **协议弹窗的三个状态页都提供「断开连接」**：`wallet_required`、`wallet_setup_failed`、`error`。这个弹窗不可关闭，登记的出口本来就是「断开连接」。

## 静默依赖的配置

以下是 2026-10-02 从线上 Privy 应用的公开配置读到的值，静默创建依赖它们保持不变：

| 配置 | 当前值 | 改动后的影响 |
|---|---|---|
| 钱包执行模式 | TEE（`user-controlled-server-wallets-only`） | 决定下一行配置打开后的表现 |
| `require_user_owned_recovery_on_create` | 关 | 打开后：TEE 模式下 `createWallet()` 直接报错；设备端模式下会弹出创建界面 |
| 强制同意条款（`require_users_accept_terms`） | 未设置 | 打开后登录窗口多一步 Privy 自己的同意界面 |
| MFA | 没有启用任何方式 | 启用后 MFA 流程期间协议弹窗会一直等待 |
| 控制台「登录时自动创建」 | `users-without-wallets` | 被客户端的 `"off"` 覆盖；删掉客户端配置后旧行为会回来 |

## 备选方案与代价

| 方案 | 不采用的原因 |
|---|---|
| 保留 `createOnLogin`，只让协议弹窗等 Privy 窗口关闭 | 仍然会显示 Privy 的创建和欢迎界面，不是静默 |
| 用 CSS 隐藏 Privy 的创建界面 | 依赖 Privy 生成的 DOM，升级后就会失效；创建失败的错误界面也会一起被藏 |
| 在 `useLogin` 的 `onComplete` 里创建 | 只覆盖本次登录：刷新后缺钱包、老用户缺钱包、失败后的重试都要另写；而且 `onComplete` 要等 Privy 窗口关闭才触发，反而更慢 |
| 只设为 `off`，依赖自动充值桥已有的补建 | 创建期间协议门控显示「重新连接钱包」；失败后会循环重试；创建逻辑也藏在充值功能里 |
| 激活宽限改为一直等，不设时限 | 钱包永远激活不了时，用户会停在没有任何提示的 `checking` |
| 超时后释放请求，重试时重新调用 SDK | 两次调用会重叠：先发的那次等满 30 秒后弹出 Privy 的创建界面 |
| 去掉应用自己的 20 秒超时 | SDK 请求挂起时，用户会一直停在没有提示的 `checking`，看不到重试和退出 |
| 创建失败时自动登出（模仿 Privy 旧行为） | 一次临时网络错误就把刚注册的用户踢出去；改为让用户自己选择重试或断开 |
| 没有钱包的会话登出时不管被隐藏的 Agent-only owner | 登出后设备回到那个 Agent 会话，「断开连接」没有真正断开 |
| 新会话不等旧请求、直接发新的 SDK 请求 | 两个请求同时等钱包代理时，先发的会等满 30 秒再弹出 Privy 的创建界面 |
| 钱包目录未就绪时也允许登出 | 会改动「目录未就绪时禁用安全退出」这条既有规则，需要单独设计，本次不做 |

## 后果与边界

- 新邮箱用户的流程：
  1. 验证码通过后，Privy 显示成功提示，约 1.4 秒后关闭。这期间用户资料每更新一次，关闭计时会重新开始，所以实际可能略长。
  2. 后台静默创建钱包。耗时没有实测。
  3. 钱包成为当前钱包后，弹出协议弹窗。

  在此期间页面可以浏览，交易和资金弹窗被挂起，等条款状态确定后恢复。
- **仍可能看到 Privy 创建界面的情况**：钱包代理 30 秒内没有就绪（例如 iframe 被拦截），或者上表的恢复方式配置在设备端模式下被打开。这是 SDK 的行为，本次没有改。
  - 代理不就绪时，Privy 的钱包目录可能也没有就绪，协议门控会保持 `checking`、不弹窗；30 秒后账户菜单出现原有的「重新加载页面」入口。
  - 目录已就绪而创建超时的，20 秒时出现「钱包尚未就绪」弹窗；Privy 窗口一旦打开，弹窗让位。
  - 这两种情况都没有实测。
- 同一账号在多个标签页同时首次登录时，每个标签页可能各调用一次创建。跨标签页没有加锁；后创建的那个会被 Privy 拒绝，等用户资料里出现钱包后恢复。这一点没有实测。
- 已有钱包的老用户，登录后钱包还没激活的空档现在也有 10 秒宽限。钱包确实不可用时，「重新连接钱包」会晚出现。
- 没有协议门控的页面（推荐、质押、Earn、排行榜、资金费率对比、API 钱包、文档与法律页）不弹任何提示。恢复入口是账户菜单里的「重新连接钱包」和「断开连接」，推荐页还有页面上的「连接钱包」。
- Privy 窗口打开期间，协议弹窗先卸载，窗口关闭后重新挂载。如果用户已经勾选了两项确认、还没点提交，这时勾选会丢失。现在的流程里，勾选之后没有会打开 Privy 窗口的操作。
- SDK 请求一直不结束时，每次重试都会接回它、等 20 秒后再次超时。这时的出路是断开连接或刷新页面。
- 升级 Privy SDK 时要确认四件事：
  - `createOnLogin` 仍以客户端配置为准；
  - 代理就绪、恢复方式配置关闭时，`createWallet()` 仍不显示界面；
  - `isModalOpen` 仍只在 Privy 窗口可见或 MFA 进行中为真；
  - 代理等待仍只唤醒最后一个调用（决定了决策 3 是否还必要）。

## 待用户决定

**登录后的智能钱包关联签名。**

- 事实：`SmartWalletsProvider` 发现内嵌钱包、而用户还没有智能钱包时，会在后台签一条 SIWE 消息并关联智能钱包，不显示界面。这是 Privy SDK 的行为，本次改动之前就存在；它不是条款、Agent、builder 或交易签名。本次改动后它跟在静默创建之后触发。
- 冲突：`AGENTS.md` 写的是「登录、刷新和状态检查绝不签名」，字面上不允许这次签名。本次没有改这条规则，引导文档里只把它记为「已知偏差，尚未决定」。
- 影响：赞助充值依赖这次关联。把关联推迟到第一次充值之前，需要调整 `SmartWalletsProvider` 的挂载方式，并重新做带资金的验收。
- 可选：接受为有界例外并写进 `AGENTS.md`；或者把关联推迟到用户第一次充值时。

## 验证

命令在仓库根目录运行。结果、提交和运行日期记在任务记录里。

```bash
pnpm --filter @sairn/terminal typecheck
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/privy-config.test.ts \
  src/lib/tests/use-email-embedded-wallet.test.tsx \
  src/lib/tests/email-embedded-wallet-provider.test.tsx \
  src/lib/tests/email-wallet-creation-owner-contract.test.ts \
  src/lib/tests/legal-gate.test.ts \
  src/lib/tests/legal-gate-hooks.test.tsx \
  src/lib/tests/legal-acceptance-modal.test.tsx \
  src/lib/tests/email-registration-sequence.test.tsx \
  src/lib/tests/wallet-session.test.tsx \
  src/lib/tests/global-modals-hip3-disclaimer.test.tsx \
  src/lib/tests/root-provider-split.test.ts
pnpm --filter @sairn/terminal test
```

各测试覆盖的行为：

| 测试 | 覆盖 |
|---|---|
| `privy-config` | `createOnLogin: "off"` |
| `use-email-embedded-wallet` | 单个在途请求、20 秒超时后重试接回原请求、超时后迟到的钱包被采用、新会话等旧请求结束、已有内嵌钱包时不调用 SDK、会话切换 |
| `email-embedded-wallet-provider` | 只自动创建一次、失败后不自动重试（SDK 函数每次渲染换引用）、外部钱包不创建 |
| `email-wallet-creation-owner-contract` | 登记所有引用共享创建的位置和次数，自动创建方只有 provider，只有共享 hook 能调用 Privy 的 `createWallet` |
| `legal-gate`、`legal-gate-hooks` | 创建中、失败、激活宽限及其计时起点、Privy 窗口期间暂缓 |
| `legal-acceptance-modal` | 三个状态页的「断开连接」、失败状态的 Retry |
| `email-registration-sequence` | 用真实的 provider、会话和门控 hook 走完整顺序：验证码通过 → 后台创建 → Privy 窗口关闭 → owner 激活 → 协议弹窗；以及创建失败后的重试与登出 |
| `wallet-session` | 没有钱包的邮箱会话可以登出；被隐藏的 Agent-only owner 先关闭、关闭失败不登出；重新连接会重试创建；`isModalOpen` 透传 |
| `global-modals-hip3-disclaimer` | 全局弹窗把 Retry 接到门控 |
| `root-provider-split` | provider 层级 |

这些测试都用桩替代 Privy。SDK 的真实时序、是否真的不出现界面，只能靠下面的真实验收确认。

**真实验收清单**（尚未做，需要真实邮箱验证码）：

| 场景 | 通过标准 |
|---|---|
| 全新邮箱注册（桌面、手机各一次） | 不出现 Privy 的创建界面和成功页；协议弹窗在 Privy 窗口关闭后才出现；随后首次充值引导照常 |
| 已有钱包的邮箱重新登录 | 不重复创建；不闪出「重新连接钱包」 |
| 注册后立刻刷新 | 会话恢复后钱包存在或被补建，不出现创建界面 |
| 在推荐页和一个没有协议门控的页面注册 | 头部显示邮箱；钱包建好后页面正常加载 |
| 断网后注册（模拟创建失败） | 约 20 秒后出现「钱包尚未就绪」；Retry 可恢复；「断开连接」可登出 |
| 外部钱包首次登录 | Privy 的成功界面关闭后才出现协议弹窗 |
| 主网赞助充值（至少 5 USDC） | 智能钱包关联成功，充值到账 |

记录提交、发布号、浏览器和每一项的实际结果。
