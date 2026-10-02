<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-silent-email-wallet-creation",
  "date": "2026-10-02",
  "title": "邮箱注册后静默创建钱包，协议弹窗不再与 Privy 窗口重叠",
  "kind": "task",
  "status": "verified",
  "topics": ["wallet-onboarding"],
  "summary": "用户报告邮箱注册后出现「创建钱包」提示并与协议勾选同时显示。原因：createOnLogin 让 Privy 在登录窗口里创建钱包（0.9 秒后切到 Creating your wallet，创建完再显示 2.5 秒 Welcome），协议门控一拿到地址就打开。改为 createOnLogin off，根部 EmailEmbeddedWalletProvider 用 Privy 无界面 createWallet() 为没有钱包的邮箱会话创建一次、所有使用方共享、失败不自动重试；协议门控在创建中与 10 秒激活宽限内为 checking，创建失败为 wallet_setup_failed（Retry），Privy 窗口可见时不弹协议弹窗。ADR 0033。单测、四个变异检查、类型检查与终端全量单测通过；未做真实邮箱注册验收，未发布。",
  "thread": null,
  "baseCommit": "04a52301",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/config/privy.ts" },
    { "path": "apps/terminal/src/providers/email-embedded-wallet-provider.tsx" },
    { "path": "apps/terminal/src/hooks/wallet/use-email-embedded-wallet.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-legal-gate.ts" },
    { "path": "apps/terminal/src/components/trade/components/legal-acceptance-modal.tsx" },
    { "path": "apps/terminal/src/lib/tests/email-embedded-wallet-provider.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/legal-gate-hooks.test.tsx" },
    { "path": "docs/adr/0033-silent-email-wallet-creation.md" },
    { "path": "docs/trading-onboarding.md" },
    { "path": "docs/email-trading-signing.md" }
  ],
  "supersedes": []
}
-->
# 邮箱注册后静默创建钱包，协议弹窗不再与 Privy 窗口重叠

## 背景与范围

- 2026-10-02 sairn.ai 上线后，用户报告：「注册后 为什么会有个创建钱包提示 ，跟协议勾选同时展示？创建钱包应该是静默吧 ！」
- 本记录是同步记录。会话标识不可得，`thread` 记为 null。
- 主检出里另有一个会话在工作，所以本任务在独立 worktree `.claude/worktrees/silent-email-wallet` 的分支 `claude/silent-email-wallet` 上完成，基线是 `04a52301`。这个基线带着 sairn.ai 上线的三个本地文档提交。

## 结论与依据

原因取自 `@privy-io/react-auth` 3.32.2 的打包源码：
- `AwaitingPasswordlessCodeScreen` 在验证码通过后，`createOnLogin` 需要建钱包时，900 ms 后切到 `EmbeddedWalletOnAccountCreateScreen`（「Creating your wallet / Please wait...」）；不需要时，1,400 ms 后关闭窗口。
- `EmbeddedWalletCreatedScreen` 再显示 2,500 ms「Welcome / You've successfully created an account.」。
- 这段时间里 `authenticated` 已经为真，我们的协议门控一拿到地址就打开，所以两个窗口重叠。
- 客户端配置 `createOnLogin` 优先于控制台的开关：合并逻辑是 `t?.embeddedWallets?.ethereum?.createOnLogin ?? 服务端默认值`。
- `useCreateWallet().createWallet()` 的行为：
  - 先等钱包代理就绪，最多 30 s，再刷新用户、在代理里创建，不打开窗口。
  - 只有代理没就绪时，才退回打开 `EmbeddedWalletOnAccountCreateScreen`。
  - 用户已有钱包时，它会拒绝创建。
- Privy 智能钱包看的是内嵌钱包是否存在，不管它由谁创建：`SmartWalletsProvider` 发现内嵌钱包、但用户还没有智能钱包时，会静默签名并完成关联。所以赞助充值的链路不受影响。
- 应用里原本有两处补建（充值弹窗、`EmbeddedDepositAutoBridge`），各持一份状态。自动充值桥失败后会立即重试，形成循环。
- `@privy-io/wagmi` 在钱包目录出现内嵌钱包后才设为当前钱包，中间有一段地址为空、又不是 `connecting` 的空档。以前这段空档被 Privy 的欢迎窗口盖住。

采用的方案见 [ADR 0033](../../adr/0033-silent-email-wallet-creation.md)：
- `createOnLogin: "off"`。
- 根部 `EmailEmbeddedWalletProvider` 负责创建：只创建一次，所有使用方共享，失败不自动重试，外部钱包会话不创建。
- 协议门控按创建进度显示：
  - 创建中为 `checking`；
  - 钱包存在、尚未激活时，10 秒宽限内为 `checking`，过后才判 `wallet_required`；
  - 创建失败为 `wallet_setup_failed`，弹窗提供 Retry。
- Privy 窗口可见时不弹协议弹窗。
- 推荐页门控改用同一个 `useLegalGateSession`。自动充值桥删去了自己的创建逻辑。

新增两条文案（「Wallet setup failed」及其说明），5 种语言都已翻译。`docs/work-memory/topics.json` 新增议题 `wallet-onboarding`。

没有采用的方案和原因见 ADR 0033 的备选表。其中，在 `useLogin` 的 `onComplete` 里创建要等 Privy 窗口关闭才触发，反而更慢。

## 验证与限制

以下都在 worktree 的未提交工作区上运行，代码与最终提交相同。

- 针对性单测：
  - `legal-gate.test.ts`、`legal-gate-hooks.test.tsx`、`privy-config.test.ts`：3 个文件、30 个测试通过。
  - `email-embedded-wallet-provider.test.tsx`、`use-email-embedded-wallet.test.tsx`：9 个测试通过。
  - `legal-acceptance-modal.test.tsx`：8 个测试通过。
- 钱包、引导、全局弹窗、充值、i18n 共 37 个文件一组运行：
  - 首次 1 个失败：`client-root-theme-lifecycle.test.tsx` 缺新 provider 的 mock，`usePrivy` 未定义。
  - 补上直通 mock 后该文件通过。
  - 其余 36 个文件、692 个测试通过。
- 变异检查：分别去掉以下四处，测试依次出现 1、2、3、2 个失败；随后文件已用 `cmp` 核对恢复。
  - provider 的失败重试保护；
  - Privy 窗口期间的暂缓；
  - 创建中显示 `checking`（改成 `wallet_required`）；
  - 激活宽限。
- `pnpm --filter @sairn/terminal typecheck` 通过；改动的 17 个 TS/TSX 文件 Biome 通过；`pnpm i18n:extract` 后缺译数回到改动前的水平（ar/es/fr/hi 43，zh 3）。
- `pnpm --filter @sairn/terminal test` 全量单测：
  - 结果：645 个文件通过、1 个跳过；8,012 个测试通过、1 个跳过；用时 204 s。
  - 这轮在文档改动之前开始。文档改完后，又重跑了会读文档的 `legal-policy-contract`、`mobile-data-presentation-contract` 等 6 个文件、51 个测试，全部通过。
- `git diff --check` 通过。
- 未做：
  - 浏览器里的真实邮箱注册。这需要真实邮箱验证码；本地测试不能登录真实内嵌钱包。
  - 本地生产构建，留给 PR 的 CI 生产构建检查包体预算。
  - 发布。
- 这些测试都用桩替代 Privy，不能证明线上 Privy 窗口和 SDK 时序。最终以用户在 app.sairn.ai 重新注册一次的结果为准。

## 后续与替代关系

- 推送、开 PR 到 `dev`、晋升 `main` 和发布，都要等用户同意。发布后请用户用新邮箱注册一次，确认三点：
  - 不再出现 Privy 的创建界面和欢迎界面；
  - 协议弹窗在登录窗口关闭后才出现；
  - 首次充值引导照常。
- Privy 控制台的「登录时自动创建」开关可以保留：客户端配置优先，本次未改动。
- 另一个会话正在做 Privy SDK 升级和 Funding（`docs/privy-upgrade-and-funding-plan.md`），它原计划使用 ADR 0033，现在应改用下一个空号。升级时要保留 `createOnLogin: "off"`，并重跑 `email-embedded-wallet-provider`、`legal-gate-hooks`、`privy-config` 三个测试。
- 发布编号：上线方案里 p25 留给旧域名清理。本修复如果先发，要按当时的序号命名，并同步更新切换方案中的引用。
