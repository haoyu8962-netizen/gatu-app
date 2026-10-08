<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-08-deposit-on-demand-chain-switch",
  "date": "2026-10-08",
  "title": "手机外部钱包存款报「未连接到 Arbitrum One」：数字链 ID 与按需切链",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "手机外部钱包（WalletConnect）点击存款报「钱包未连接到 Arbitrum One」：根因是 use-deposit.ts 的 getProviderChainId 只接受字符串、WalletConnect provider 的 eth_chainId 返回数字，表单侧用 parseChainId 判定正常而提交侧永远不匹配；切链后又立即重读不等 chainChanged。对照官方终端打包代码（已登录 Privy 时不预拦截、发交易前 switchChainAsync）后：删除 WrongNetworkScreen 预拦截，提交路径按数字比较、只发一次切链请求、以 chainChanged 加有界轮询等待、状态屏显示「正在切换网络」，拒绝与超时走存款失败通知。单测钉住五种情形；未在真实手机钱包上验收。",
  "thread": null,
  "baseCommit": "6da4c15a",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/lib/tests/use-deposit-routing-guard.test.tsx" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "docs/funds-dialog-outcome-plan.md" }
  ],
  "supersedes": []
}
-->
# 手机外部钱包存款报「未连接到 Arbitrum One」：数字链 ID 与按需切链

## 背景与范围

用户在手机端用外部钱包连接终端，在存款弹层（从 Arbitrum 存入 USDC）点击「存款」后收到通知「钱包未连接到 Arbitrum One。请在钱包中切换网络后重试。」，并认为要求钱包切换网络不合理。用户随后要求按诊断修复、对齐官方终端按需切链的做法，并做多轮 Codex 对抗审查。本记录为同步记录；用户提供的截图未归档（含钱包地址），所用钱包类型未知。

## 结论与依据

- 根因（代码阅读）：`apps/terminal/src/lib/hyperliquid/use-deposit.ts` 原 `getProviderChainId` 对非字符串的 `eth_chainId` 返回空串，再与 `toChainHex(42161)` 比较。`@walletconnect/universal-provider` 的 eip155 provider 对 `eth_chainId` 返回 `parseInt(this.getDefaultChain())`（数字），Privy 的 proxyProvider 原样转发。于是提交路径永远判定不在 Arbitrum，而表单侧 `useDepositChain` 用 `parseChainId` 能解析数字，所以不显示切换网络屏、点击才报错，与截图一致。WalletConnect 对已批准链的 `wallet_switchEthereumChain` 只改本地默认链并返回 null、不报错，所以落到的是「未连接到」而不是「无法切换」这条文案。
- 次要缺陷：切链请求 resolve 后立即重读 `eth_chainId`，不等 `chainChanged`；wagmi 注入连接器与官方终端都等 change 事件。
- 官方实践（2026-10-08 从 app.hyperliquid.xyz 的生产打包代码读取；文件名随发布变化，不作为稳定引用）：判断是否显示「切换网络再存款」的函数在 Privy `ready && authenticated` 时恒返回 false；Arbitrum USDC 存款处理器在 `chainId !== 42161` 时先 `await switchChainAsync({ chainId: 42161 })`（按钮显示 Switching Network）再 `writeContractAsync({ chainId: 42161 })`，用户拒绝显示 Transaction declined，其他错误显示原文。Privy 文档说明外部钱包的 `switchChain` 会在钱包客户端提示切换、成功后 resolve、拒绝或未配置链时 reject。
- 采用的方案：删除存款弹层的 `WrongNetworkScreen` 预拦截（及其测试、进度标签与状态动效登记）；`useDepositChain` 收敛为只报告 provider 是否可用的 `useDepositWalletProvider`；提交路径 `getDepositProviderForChain` 按数字比较链 ID，不匹配时把执行状态标为 `networkSwitchPending`（状态屏标题「正在切换网络」），只发一次切链请求（Privy 记录与 Arbitrum 不一致时走 `wallet.switchChain`，Privy 已认为在 Arbitrum 时直接发 `wallet_switchEthereumChain`，因为 Privy 的 `switchChain` 在这种情况下不发任何请求就返回），再用 `chainChanged` 监听加 `eth_chainId` 轮询（按次数计，不读墙钟）有界等待；超时报「未连接到 Arbitrum One」、拒绝报「已拒绝切换」，都走存款失败通知。发交易前的链复核改为数字比较。
- 未采用：保留预拦截只修比较——与官方不一致，且预拦截在 Privy 记录与钱包实际链不一致时仍会误判；切链后发第二次请求——会让异步切换的钱包弹两次提示。

## 验证与限制

- 工作区基线 6da4c15a（main，分支 claude/arbitrum-network-connection-issue-8325cd）。
- `pnpm --filter @sairn/terminal typecheck` 通过；`pnpm exec biome check` 对改动文件通过。
- `vitest run`：`use-deposit-routing-guard`（新增「wallet network」五例：数字链 ID 不发切链请求；Privy 已认为在 Arbitrum 时直接向钱包发一次请求并等 chainChanged；Privy 切链后等钱包报告 Arbitrum；钱包始终不切换时超时报错且不发第二次请求；拒绝不广播）、`deposit-modal-withdrawal-routing-guard`（外部钱包不再出现网络门、挂起状态显示「正在切换网络」）、`deposit-execution-state`、`action-progress-label-contract`、`status-motion-surface-contract`、`i18n-reactivity-contract`、`errors` 通过。
- `pnpm --filter @sairn/terminal test -- --maxWorkers=4`：658 个文件中 655 通过、1 跳过；`design-token-ratchet` 因删除的 wrong-network-screen 带一处 `!rounded-t-[18px]` 而要求把任意圆角基线从 224 降到 223（已改并复跑通过）；`vite-development-cache` 在本会话沙箱里因禁止监听本地端口失败（EPERM），沙箱外单独复跑通过。
- 开发服务器（端口 3015）无头 Chromium 打开 /trade/BTC 手机视口：页面正常揭示、无运行时错误（仅有开发端口不在 CSP 列表的 Privy iframe 告警，与本次无关）；未连接钱包，存款弹层本身未在页面里打开。
- 未做：真实手机钱包（WalletConnect 与钱包内置浏览器）的存款验收；Codex 对抗审查在本记录建立时尚未进行，结果以后续提交为准。
- 翻译：「Switching network」已补 zh/es/fr/hi/ar；其余四种语言此前缺失的 43 条与本次无关。

## 后续与替代关系

- 待在真实手机钱包上走一遍：钱包已在 Arbitrum（不应出现任何切换提示）、钱包在其他链（一次切换提示后继续）、拒绝切换（通知「已拒绝切换」）。
- 订单按钮的「切换到 Arbitrum」阶段（`lib/trade/use-button-content.ts`、`mobile-trade-view.tsx`）仍是预拦截，不在本次范围内；若要对齐官方需单独决定。
- 下次先查：`docs/cctp-deposits.md` Wallet Network 一节、`use-deposit.ts` 的 `getDepositProviderForChain` 与 `waitForDepositChain`。
