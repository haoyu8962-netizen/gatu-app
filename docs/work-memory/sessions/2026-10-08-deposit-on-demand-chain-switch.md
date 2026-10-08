<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-08-deposit-on-demand-chain-switch",
  "date": "2026-10-08",
  "title": "手机外部钱包存款报「未连接到 Arbitrum One」：数字链 ID 与按需切链",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "手机外部钱包点击存款报「钱包未连接到 Arbitrum One」：已确认的缺陷是 use-deposit.ts 的 getProviderChainId 只接受字符串、WalletConnect provider 的 eth_chainId 返回数字，表单侧用 parseChainId 判定正常而提交侧永远不匹配；切链后又立即重读不等 chainChanged；报告所用钱包的连接器类型未记录，所以这是最可能而非已证实的事故原因。对照官方终端打包代码（已登录 Privy 时不预拦截、发交易前 switchChainAsync）后：删除 WrongNetworkScreen 预拦截，提交路径按数字比较、接受后的切链请求不重复（未知链加链后再切一次除外）、以 chainChanged 加轮询并独立计时截止、状态屏显示「正在切换网络」、签名前与广播前各复核链，拒绝与超时走存款失败通知。Codex 三路对抗审查第一轮各 8.0 分的发现（CI 残留登记、等待上限不独立计时、文档「只发一次」过强、根因写成事实、状态传递缺真实测试）已修；未在真实手机钱包上验收。",
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

用户在手机端用外部钱包连接终端，在存款弹层（从 Arbitrum 存入 USDC）点击「存款」后收到通知「钱包未连接到 Arbitrum One。请在钱包中切换网络后重试。」，并认为要求钱包切换网络不合理。用户随后要求按诊断修复、对齐官方终端按需切链的做法，并做多轮 Codex 对抗审查。本记录为同步记录；用户提供的截图未归档（含钱包地址），所用钱包的连接器类型未知，没有任务标识（`thread: null`）。开始时工作区干净（`git status --short` 为空，基线 6da4c15a 即 main）。

## 结论与依据

- 已确认的缺陷（代码阅读）：`apps/terminal/src/lib/hyperliquid/use-deposit.ts` 原 `getProviderChainId` 对非字符串的 `eth_chainId` 返回空串，再与 `toChainHex(42161)` 比较。`@walletconnect/universal-provider` 的 eip155 provider 对 `eth_chainId` 返回 `parseInt(this.getDefaultChain())`（数字），Privy 的 proxyProvider 原样转发。于是经 WalletConnect 连接的钱包在提交路径永远被判定不在 Arbitrum，而表单侧 `useDepositChain` 用 `parseChainId` 能解析数字，所以不显示切换网络屏、点击才报错，与截图一致。这是推断出的最可能原因：报告的钱包若是内置浏览器注入 provider（返回十六进制串）则不会触发它，连接器类型未记录，无法证实。WalletConnect 对已批准链的 `wallet_switchEthereumChain` 只改本地默认链并返回 null、不报错，所以落到的是「未连接到」而不是「无法切换」这条文案。
- 次要缺陷：切链请求 resolve 后立即重读 `eth_chainId`，不等 `chainChanged`；wagmi 注入连接器与官方终端都等 change 事件。
- 官方实践（2026-10-08 从 app.hyperliquid.xyz 的生产打包代码读取；文件名随发布变化，不作为稳定引用）：判断是否显示「切换网络再存款」的函数在 Privy `ready && authenticated` 时恒返回 false；Arbitrum USDC 存款处理器在 `chainId !== 42161` 时先 `await switchChainAsync({ chainId: 42161 })`（按钮显示 Switching Network）再 `writeContractAsync({ chainId: 42161 })`，用户拒绝显示 Transaction declined，其他错误显示原文。Privy 文档说明外部钱包的 `switchChain` 会在钱包客户端提示切换、成功后 resolve、拒绝或未配置链时 reject。
- 采用的方案：删除存款弹层的 `WrongNetworkScreen` 预拦截（及其测试、进度标签与状态动效登记）；`useDepositChain` 收敛为只报告 provider 是否可用的 `useDepositWalletProvider`；提交路径 `getDepositProviderForChain` 按数字比较链 ID，不匹配时把执行状态标为 `networkSwitchPending`（状态屏标题「正在切换网络」），发出切链请求（Privy 记录与 Arbitrum 不一致时走 `wallet.switchChain`，Privy 已认为在 Arbitrum 时直接发 `wallet_switchEthereumChain`，因为 Privy 的 `switchChain` 在这种情况下不发任何请求就返回；未知链 4902 时 Privy 内部或直接路径都会加链后再切一次），请求被接受后不再因链尚未更新而重复请求，而是用 `chainChanged` 监听加 `eth_chainId` 轮询等待，并由独立的 10 秒截止定时器结束等待（查询一直不回也会结束，截止后的迟到结果忽略；页面后台时定时器可能被推迟）；超时报「未连接到 Arbitrum One」、拒绝报「已拒绝切换」，都走存款失败通知。签名 EIP-3009 授权前和发交易前各做一次数字比较的链复核。
- 第一轮 Codex 三路只读对抗审查（gpt-6-astra，medium；行为 / 规范与记录 / 遗漏与变异，各 8.0 分）的发现与处理：CI 工作流与 `scripts/ci-workflows.test.mjs` 仍登记已删除的 wrong-network-screen 测试（会让 Terminal Tests 作业提前失败）→ 已删并登记 `use-deposit-routing-guard`，`node --test scripts/ci-workflows.test.mjs` 10 项通过；等待上限按轮询次数计、查询挂起时不会超时 → 改为独立截止定时器；文档「不发第二次切链请求」与 4902 加链重试分支不符 → 改写并补请求序列测试；把可解释现象的缺陷写成用户事故的确定根因、并把手机连接全部归为 WalletConnect → 改写为已确认缺陷与最可能原因；`networkSwitchPending`、事件通道、监听清理、广播前复核没有测试钉住 → 补用例并用 9 个变异逐一验证（删事件注册、删 pending=true/false、删 removeListener、删签名前/广播前复核、改回字符串比较、缩短截止、Privy 多切一次，全部被抓到）；记录缺起始工作区状态与 memory 命令执行情况 → 已补。审查方还指出签名 EIP-3009 授权前没有链复核（viem 的 signTypedData 不检查当前链）→ 已补。
- 未采用：保留预拦截只修比较——与官方不一致，且预拦截在 Privy 记录与钱包实际链不一致时仍会误判；切链后发第二次请求——会让异步切换的钱包弹两次提示。

## 验证与限制

工作区基线 6da4c15a（main，分支 claude/arbitrum-network-connection-issue-8325cd）。下面按版本分段；每段只覆盖该版本实际跑过的检查。

### 原修复 422d8408

- `pnpm --filter @sairn/terminal typecheck` 通过；`pnpm exec biome check` 对改动文件通过。
- `vitest run`：`use-deposit-routing-guard`（当时新增「wallet network」五例：数字链 ID 不发切链请求；Privy 已认为在 Arbitrum 时直接向钱包发一次请求并等 chainChanged；Privy 切链后等钱包报告 Arbitrum；钱包始终不切换时超时报错且不发第二次请求；拒绝不广播）、`deposit-modal-withdrawal-routing-guard`（外部钱包不再出现网络门、挂起状态显示「正在切换网络」）、`deposit-execution-state`、`action-progress-label-contract`、`status-motion-surface-contract`、`i18n-reactivity-contract`、`errors` 通过。
- `pnpm --filter @sairn/terminal test -- --maxWorkers=4`：658 个文件中 655 通过、1 跳过；`design-token-ratchet` 因删除的 wrong-network-screen 带一处 `!rounded-t-[18px]` 而要求把任意圆角基线从 224 降到 223（已改并复跑通过）；`vite-development-cache` 在本会话沙箱里因禁止监听本地端口失败（EPERM），沙箱外单独复跑通过。
- 开发服务器（端口 3015）无头 Chromium 打开 /trade/BTC 手机视口：页面正常揭示、无运行时错误（仅有开发端口不在 CSP 列表的 Privy iframe 告警，与本次无关）；未连接钱包，存款弹层本身未在页面里打开。
- `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test` 在记录建立后各运行并通过（memory:test 10 项，skipped 0）。

### 第一轮修复 7445dd38

- `node --test scripts/ci-workflows.test.mjs` 10 项通过（修复前 1 项失败：工作流列出已删除文件）。
- `pnpm --filter @sairn/terminal typecheck` 通过；`pnpm exec biome check` 对改动文件通过。
- `vitest run`：`use-deposit-routing-guard`（「wallet network」扩到十例）、`deposit-modal-withdrawal-routing-guard`、`deposit-execution-state`、`deposit-broadcast`、`embedded-deposit-auto-bridge`（含 sonner）、`action-progress-label-contract`、`status-motion-surface-contract`、`i18n-reactivity-contract`、`design-token-ratchet` 共 10 个文件 511 项通过；九个变异逐一验证（见上文）。全量套件未重跑。

### 第二轮修复（本段之后的提交）

- 第二轮 Codex 三路审查（V 8.5 / B 8.3 / C 8.5）：V 与 C 指出截止后迟到的查询结果、观察期查询拒绝、成功后的定时器清理没有用例钉住；B 指出 hook 返回的 `networkSwitchPending` 没有经真实渲染断言（弹层测试 mock 了 hook）、记录未按版本分开验证范围。处理：新增四例（截止后迟到答案与事件被忽略且不再查询；观察期查询拒绝即结束、监听清空、之后不再查询；事件结束等待后轮询与截止两个定时器都被清除、不再查询；切链挂起时经 act 刷新后 hook 返回 true、完成后 false），并用五个变异验证（删查询后的 settled 检查、删查询失败的 cleanup、删 clearTimeout(pollTimer)、删 clearTimeout(deadline)、hook 固定返回 false，全部被抓到）；本节按版本拆分。
- 本段的 typecheck、Biome 与测试结果写在下一次提交前核对后的一行里：见「验证结果（第二轮修复）」。

### 第三轮修复（本段之后的提交）

- 第三轮 Codex 三路审查：V 10.0、B 10.0，C 8.5。C 指出两处用例缺口：`chainChanged` 报告非目标链时应继续等待（把监听改成无条件结束不会被现有用例抓到）；Privy 自身抛 4902 后回退到直接 provider 请求的分支没有用例（删掉回退不会被抓到）。处理：新增「keeps waiting when the wallet reports a chain other than Arbitrum」（先发 `0x1` 事件并推进 250 ms，断言仍在等待、hook 返回 true、未签名；再发目标链事件后完成）、「falls back to the wallet provider when Privy itself reports an unknown chain」（Privy 4902 → 直接路径 switch → add → switch，签名并广播）、「does not fall back to the wallet provider when Privy reports a rejected switch」（4001 不进入回退、零次直接请求）；两处变异（事件无条件结束、删 Privy 回退）均被抓到。

### 验证结果（第二轮修复）

- `pnpm --filter @sairn/terminal typecheck` 通过；`pnpm exec biome check` 对改动文件通过。
- `vitest run`：`use-deposit-routing-guard`（「wallet network」十四例）、`deposit-modal-withdrawal-routing-guard`、`deposit-execution-state` 共 3 个文件 202 项通过；十四个变异全部被抓到。全量套件未在此版本重跑。
- `pnpm memory:index` / `memory:check` / `memory:test` 在本段写入后重跑通过。

### 验证结果（第三轮修复）

- `pnpm --filter @sairn/terminal typecheck` 通过；`pnpm exec biome check` 对改动文件通过。
- `vitest run`：`use-deposit-routing-guard`（「wallet network」十七例）、`deposit-modal-withdrawal-routing-guard`、`deposit-execution-state` 通过；十六个变异全部被抓到。
- 窄范围第四轮 Codex 复核（只审 9519c7f6，C 路口径）：10.0，无发现。
- 9519c7f6 上的 `pnpm --filter @sairn/terminal test -- --maxWorkers=4`：8560 项中 8545 通过、7 跳过、8 失败。失败项：`vite-development-cache`（沙箱禁止监听本地端口，EPERM，与 422d8408 时相同）；`chart-store`（2）、`global-modals-hip3-disclaimer`（3）、`positions-panel-preload`（1）、`root-route-transition`（2）均为测试或钩子超时，与本次改动无关，四个文件单独重跑 76 项全部通过。

- 未做：真实手机钱包（WalletConnect 与钱包内置浏览器）的存款验收。
- 翻译：「Switching network」已补 zh/es/fr/hi/ar；其余四种语言此前缺失的 43 条与本次无关。

## 订单按钮对齐官方（同日后续）

用户要求把「未做」里收益大的一起做并对齐实践。订单按钮的「Switch to Arbitrum」阶段来自 wagmi `useWalletClient()` 的链不匹配错误（`ConnectorChainMismatchError`：钱包处于未配置链时持续出现，已配置链切换瞬间也可能出现）。交易签名本身不需要特定 EVM 网络：Agent / API 钱包的 L1 动作本地签固定域 1337；Privy 嵌入式 owner 的用户签名动作用环境配置的 Arbitrum 链 ID、不要求钱包切换；外部钱包的用户签名动作经 wagmi 客户端签名，SDK 0.33.3 的 `resolveSignatureChainId` 在未配置时回退到钱包自身 `getChainId()`，官方终端的 `approveAgent` 构造也取 `useAccount().chainId`（缺省才用 Arbitrum），且已登录 Privy 时链不匹配助手恒返回 false。因此删除该阶段：`order-action-stage.ts` 去掉 `switchChain`，桌面与手机面板不再读 wagmi 的 `useWalletClient` / `useSwitchChain`；`canApprove` 改为 `useWalletSession().hasWalletAccess && !!address`（Agent-only 会话仍不可点，与原先 wagmi 无客户端时一致）；`isWalletLoading`（「Loading wallet...」校验）改为 owner 模式下 `isSignerLoading`；删除 `BUTTON_SWITCHING` / `BUTTON_SWITCH_CHAIN` 文案与手机标签；进度标签契约去掉「Switching...」。`docs/trading-onboarding.md` 第 4 步新增「No EVM network switch」段，CHANGELOG 新增条目。
- 回归：`trade-panel-open-interest-cap` 与 `mobile-trade-size-validation-a11y` 各加一例，wagmi 报链不匹配时 Enable Trading 仍可点、点击调用 authorize、不调用 switchChain；`deposit-order-cta`、`trading-onboarding-domain`、`reduce-only`、`order-validation`、`action-progress-label-contract` 更新后通过（139 项）；两组件套件 73 项通过；typecheck、Biome 通过。
- 另在 `docs/cctp-deposits.md` 写明存款切链的真机验收三种情形与记录要求。
- 对 d5bbc7c0 的 Codex 三路审查：V 6.0、C 6.0、B 8.0。V 与 C 的 P1 成立：外部钱包的用户签名客户端（`packages/hl-react/src/hooks/useClients.ts`、`use-explicit-agent-approval.ts`、`use-terms-acceptance.ts`、`use-user-wallet.ts`）都来自 wagmi `useWalletClient()`，默认按 config 当前链取客户端，钱包在未配置链上时抛 `ConnectorChainMismatchError`、客户端为空，于是删掉切链入口后 Enable Trading 可点但审批报「钱包不匹配」。修复：新增 hl-react `useConnectionWalletClient`，用 `useConnection().chainId`（连接自身的链，配置内外都行）向 wagmi 取客户端（`getConnectorClient` 只比较请求链与连接器实际链），四处签名客户端全部改用它，精确 owner 地址校验不变；`use-explicit-agent-approval` 新增链 999999 的外部钱包审批用例，`use-connection-wallet-client` 钉住传入的链；两个面板补 Agent-only（`hasWalletAccess=false`）按钮不可点、owner signer 加载中不可点的用例；变异（`canApprove = !!address`、审批改回默认 `useWalletClient()`）均被抓到；CI 登记桌面面板测试、审批与新 hook 测试并写入契约清单。B 的三项文档问题（L1 固定域 1337 与用户签名回退混写；链不匹配不只在未配置链；Enable Trading 可用条件写宽）与验收「一次提示」未排除未知链恢复，已按发现改写 `docs/trading-onboarding.md`、CHANGELOG、`docs/cctp-deposits.md` 与本记录。审查方还指出 wagmi 的不匹配在已配置链切换瞬间也可能出现，所以上文「只在未配置链出现」是过强的推断，改为「未配置链会持续不匹配，已配置链切换期间可能瞬时不匹配」。
- 51364e20 验证：`pnpm typecheck`（hl-react、ui、terminal）通过；Biome 通过；`node --test scripts/ci-workflows.test.mjs` 10 项通过；`vitest run --maxWorkers=2` 跑 AGENTS「Wallet signing」组加审批、资金弹层、订单按钮共 24 个文件 661 项通过；memory 三项检查通过。
- 对 d5bbc7c0+51364e20 的第二轮 Codex 三路审查：V 8.5、B 8.5、C 8.5。V：外部会话在 wagmi 客户端仍在加载（例如刚切链）时 Enable Trading 提前可点、点击后 builder 审批因 user client 为空报错 → 两面板改为 `canApprove` 在 agent 模式还要求 `useConnectionWalletClient().data` 存在（曾把客户端加载中并入 `isApprovalLoading`，变异验证表明它不可观测、与 `canApprove` 重复，已删），并各加「客户端 pending 或缺失时不可点、就绪后可点并调用 authorize」用例；变异（去掉客户端条件）被抓到。B：`docs/hyperliquid-signing.md` 仍把用户签名链 ID 写成固定 0x66eee → 速查表、示意图、特性表与链 ID 汇总改为「签名者的链：外部钱包当前链 / 嵌入式 owner 环境链」；记录补 51364e20 验证。C：`useClients` 与 `use-terms-acceptance` 的迁移没有链敏感测试 → 两个测试桩改为只在传入连接链时返回客户端，各加链 999999 的用例，`use-connection-wallet-client` 加同一挂载跟随链变化的用例，两个文件登记 CI。
- 本轮修复验证：`pnpm --filter @sairn/terminal typecheck`、Biome、CI 契约测试通过；两面板、owner-trading-signer、use-terms-acceptance、use-connection-wallet-client、use-explicit-agent-approval 共 6 个文件 125 项通过。
- 对 d5bbc7c0..0fc0cc6b 的第三轮 Codex 三路审查：V 8.5、B 8.5、C 8.5，无新增运行时缺陷。V/C：`use-connection-wallet-client` 的链变化用例在第二次渲染才加 key、实际重挂载，钉不住「同一挂载跟随链变化」 → 四次渲染都不传 key，加挂载计数断言（恒为 1）并补 999999 → 42161 的回切；缓存首链的变异被抓到。C：owner 模式豁免（Privy 嵌入式 owner 不需要 wagmi 客户端）无正例 → 两面板各加「owner 就绪、builder 待批、wagmi 客户端缺失时仍可点并调用 authorize」用例；去掉豁免的变异被抓到。B：`docs/hyperliquid-signing.md` 仍有 7 处固定 0x66eee（示例注释、提现步骤表、小节标题、流程示意、审批注释、实现说明）→ 全部改为「签名者的链」措辞，并注明裸私钥示例未配置 `signatureChainId` 时取 SDK 默认值而非 0x66eee；B 同时指出记录对「同一挂载」的描述夸大，已随测试修正。
- 第三轮修复验证：typecheck、Biome 通过；`use-connection-wallet-client`、两面板共 3 个文件 84 项通过。
- b7b22cd3 窄范围单路 Codex 复核：10.0，无发现。
- b7b22cd3 上的 `pnpm --filter @sairn/terminal test -- --maxWorkers=4`：8576 项中 8561 通过、7 跳过、8 失败。失败项：`vite-development-cache`（沙箱禁止监听本地端口，EPERM）；`chart-build-assets`、`chart-store`、`dashboard-chrome`（4）、`global-modals-hip3-disclaimer`、`positions-panel-preload` 均为并行负载下的测试或钩子超时，与本次改动无关，五个文件单独重跑 79 项全部通过。

## 后续与替代关系

- 待在真实手机钱包上走一遍：钱包已在 Arbitrum（不应出现任何切换提示）、钱包在其他链（一次切换提示后继续）、拒绝切换（通知「已拒绝切换」）。
- 订单按钮的「切换到 Arbitrum」阶段已在同日后续中按官方做法删除（见上节）。
- 下次先查：`docs/cctp-deposits.md` Wallet Network 一节、`use-deposit.ts` 的 `getDepositProviderForChain` 与 `waitForDepositChain`。
