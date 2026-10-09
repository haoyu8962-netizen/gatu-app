# ADR 0038：普通交易连接改用无名默认 Agent，按 `userRole` 校验

- 状态：已接受并实施（2026-10-09，分支 `claude/unnamed-default-agent`，基于 `dev` `4c5ff959`）；未推送、未合入、未发布；真实外部钱包的授权与首单验收未做。
- 关联：[首次交易](../trading-onboarding.md)「Establish an external-wallet trading connection」与「Stay Connected」；[签名机制](../hyperliquid-signing.md)「Agent Wallet Pattern」；[ADR 0027](0027-brand-single-source-and-identifier-rename.md)「后果与边界」里的 `sairn` 命名槽位（本 ADR 取代）；[ADR 0015](0015-link-device-alignment.md)（Link mobile device 的命名 `Mobile` Agent 不变）；[ADR 0024](0024-translate-action-errors-at-render.md)（交易所原文翻译规则）；[任务记录](../work-memory/sessions/2026-10-09-unnamed-default-agent.md)。

## 背景与约束

- 2026-10-08 用户用外部钱包在「建立连接」弹窗收到交易所原文拒绝 `Too many extra agents for cumulative volume traded. Current limit is 3`。
- 原因：普通外部钱包的 Enable Trading 用 `approveAgent` 申请的是**命名** Agent，名字来自 `VITE_HYPERLIQUID_AGENT_NAME`（生产 `sairn`、开发 `sairn-dev`）。Hyperliquid 的 Exchange endpoint 文档写明一个账户可以有 1 个无名 API 钱包和最多 3 个命名 API 钱包（子账户另加 2 个），命名 Agent 只会被**同名**的新授权替换；拒绝文案说明这个上限按累计成交量放宽。账户已经有 3 个别的名字（改名前留下的 `gatu`、Link mobile device 的 `Mobile valid_until …`、API 钱包页或其他前端创建的命名钱包）时，`sairn` 进不去。ADR 0027 当时预告了这个失败。SDK 指南说没有 `valid_until` 的命名 Agent 默认 90 天后过期，所以旧名字会占位很久。
- 预检（`deriveAgentMissingReason`）只在 `extraAgents` 里找同名条目，不看数量，所以会先请求钱包签名，再被交易所打回；`exchange-error-text.ts` 没有这条文案的规则，按 ADR 0024 原样显示英文，也没有「如何腾出槽位」的引导。
- 官方终端实践（2026-10-08 读取 `app.hyperliquid.xyz` 的生产打包代码 `config-DgrJgRxr.js`；文件名随发布变化，不作稳定引用；无需登录）：
  - Establish Connection 生成本地密钥后发 `approveAgent`，动作里不带 `agentName`，EIP-712 消息里 `agentName` 为空串，即无名默认 Agent；签名链取钱包当前链。
  - 密钥存在 `hyperliquid_agent_<地址>` 键下，存储由 `hyperliquid.persist_trading_connection` 偏好决定（`l6()` 返回 `localStorage` 或 `sessionStorage`）；签好的授权请求先存 sessionStorage 的 `hyperliquid.pending_agent`，本地做一次签名恢复校验。
  - 是否已授权的判定（`readyToTrade` / `noRegisteredAgent`）是本地密钥地址与 `webData3.userState.agentAddress` 比对；`extraAgents` 用于 `api` 类型会话（API Wallets 页管理的命名钱包，以及手机扫码后存在 `hyperliquid.api_wallet` 的导入密钥）的校验，`userRole` 只用于地址覆盖功能。
  - 命名 Agent 用于 API Wallets 页（`名字 valid_until 时间戳`）和手机链接（`Mobile QR`，不带 `valid_until`，见 ADR 0015）；官方代码对上限拒绝文案没有任何特殊处理，因为普通连接的默认槽位永远不会撞上限。
- 约束：
  - 签名契约不变（AGENTS.md「Wallet signing contract」、[ADR 0002](0002-exact-owner-trading-signers.md)）：授权仍只由精确 owner 签；登录、刷新与状态检查不签名；Agent 注册不批准 builder fee。
  - Link mobile device（ADR 0015）与 API 钱包页仍用命名 Agent，流程不变。
  - 校验必须 fail-closed：加载中、刷新中、没有答案、请求失败都不得触发授权；授权后要对刚生成的地址做确定性核对。
  - 不新增全局 `webData3` 订阅：仪表盘页也挂着交易状态钩子，而 `webData3` 是含全部市场上下文的重流。

## 决策

用户在两个方案（保留命名槽位并处理上限；对齐官方改用无名默认 Agent）里选了第二个。

1. **普通外部钱包的建立连接申请无名默认 Agent。** `packages/hl-react/src/signing/use-agent-registration.ts` 的 `approveAgent` 只传 `agentAddress`。钉住的 SDK（`@nktkas/hyperliquid` 0.33.3）把缺省的 `agentName` 按 schema 默认值规范化为空串并签名、发送；nktkas 的集成测试覆盖 `agentName` 缺省与 `null` 两种写法，Python SDK 也用空串签名（发送时删掉该键），交易所都接受。删除 `apps/terminal/src/config/trading-agent.ts`、`TRADING_AGENT_NAME`、构建变量 `VITE_HYPERLIQUID_AGENT_NAME` 与 Provider 的 `agentName` 属性。
2. **默认 Agent 按 `userRole` 校验，不再查 `extraAgents`。** 无名 Agent 不出现在 `extraAgents` 里。`useAgentStatus` 对本地 `local-registration` 密钥查询 `userRole({ user: 密钥地址 })`（速率权重 60，`staleTime` 30 秒），只有 `{ role: "agent", data: { user } }` 且 `user` 等于精确 owner（大小写不敏感）才算已授权（`isAgentKeyApprovedForOwner`）。答案与它回答的密钥地址绑定（`AgentKeyRole`），换密钥就换查询键，不会把旧答案套到新密钥上。授权后的确定性核对（`refetchAgent(地址)`）用私有查询键 `[...钩子的键, { definitiveCheck: 序号 }]` 通过 `fetchQuery` 发自己的请求：TanStack 的 `fetchQuery` 会复用同键在途请求（钩子在密钥存盘后就可能已经发出授权前的查询），而取消同键请求又会让另一个等待中的核对拿到回退的旧缓存（`query.fetch` 在 `revert` 时直接返回已有 `data`），私有键避开这两点，并仍继承宿主 QueryClient 的重试策略。核对按 QueryClient 与缓存键登记（`WeakMap<QueryClient, Map<键, 核对>>`）：最后启动的核对持有交易所的最新视图，只有它把答案写回钩子的缓存键（先 `cancelQueries` 取消并回退仍在途的观察查询，再核对自己仍是最新后 `setQueryData`）；被后来的核对赶超的核对不返回自己的答案，而是等待并返回最新核对的答案或失败，所以没有调用方能拿到已被更新核对否定的结论（注册的授权后核对与 `useTradingAuthorization` 的最终确认都依赖这一点）；最新核对失败时，先 `resetQueries` 清掉钩子缓存里的旧授权并让观察查询重新获取，再向调用方抛 `AgentStatusError`，钩子不会继续按旧的 `agent` 答案就绪。私有查询 `gcTime: 0`，用完即回收。每次核对（含 `refetch()` 等 builder fee 与角色都返回之后）都重新读取本地记录再推导：另一个标签页在请求期间替换或删除记录时，旧答案不能让新记录就绪。
   - 没有本地密钥：已连接的 owner 直接判定需要新连接（无可向交易所询问之事，不发请求）；没有 owner 一律 `unknown`。
   - 请求出错、刷新中、还没有答案：沿用原来的 `error` / `loading` / `unknown` 语义，都不触发授权；另一把密钥的答案不算本密钥的答案。
   - Mobile Agent（`source: "mobile-sync"`）仍按名字基底、地址与到期在 `extraAgents` 里校验；`extraAgents` 查询只在本地记录是 Mobile Agent 时启用。
   - 不用官方的 `webData3.userState.agentAddress`：见约束；不用 `webData2` 信息请求：它带全部市场元数据与资产上下文，一次核对要拉几百 KB；`userRole` 直接回答「这把钥匙现在是不是这个 owner 的 Agent」。
3. **缺失原因收敛。** 去掉只对命名槽位有意义的 `remote_named_agent_exists`；`remote_key_replaced` 与 `agent_name_mismatch` 只对 Mobile Agent 产生；默认密钥被别处替换时报 `local_key_not_approved`，弹窗文案「Trading is not connected in this browser. Reconnect to create or replace its trading key.」不变。
4. **翻译命名上限的拒绝文案。** `exchange-error-text.ts` 新增规则，把 `Too many extra agents for cumulative volume traded. Current limit is N` 译为已知文案并保留 N，供仍使用命名 Agent 的 API 钱包页与 Link mobile device 使用；中文已补，其余四种语言回退英文。

## 备选方案

- **保留 `sairn` 命名槽位，补上限处理**：改动小，且与官方终端的默认槽位互不覆盖；但命名上限按账户成交量变化，预检只能提示不能拦截，用户仍要先去 API 钱包页移除旧 Agent 才能连接。用户选择对齐官方。
- **用 `webData3` 订阅做被动校验**（官方做法）：要在每个挂载交易状态钩子的页面订阅重流，或在钩子外维护「已核验」记忆来桥接推送延迟；放弃。
- **用 `webData2` 信息请求核对**：载荷过大；放弃。

## 后果与边界

- 一个账户只有一个默认 Agent：在 Sairn 建立连接会使 app.hyperliquid.xyz 或其他使用默认槽位的前端上的连接失效，反过来也一样；每次切换前端都要重新建立连接。官方终端跨浏览器本来就是这样。
- 不再新建命名 Agent，但浏览器里已有、交易所仍认作该 owner 的 Agent 的本地密钥（包括旧的 `sairn` 命名密钥与没有 `source` 字段的更早记录）继续使用，`userRole` 不区分命名与无名；只有下一次需要新授权时才申请无名 Agent，没有强制迁移。旧的 `gatu`、`sairn`、`sairn-dev` 命名 Agent 仍占命名槽位直到过期或在 API 钱包页移除；本改动不自动移除它们。
- 本地开发、预览构建与生产共用账户的同一个默认槽位，不再有「部署槽位」的隔离。
- `userRole` 的速率权重是 `extraAgents` 的 3 倍。被动查询只在有本地密钥时启用，`staleTime` 30 秒只决定挂载、焦点与重连时是否复用缓存，没有定时轮询；每次确定性核对（`refetchAgent` / `refetch`）都发一次请求。不计被动查询与重试，显式请求次数是：弹窗直接 `register()` 且没有本地密钥时 1 次（授权后核对；预检不发请求）；订单按钮的 `authorize()` 没有本地密钥时 3 次（授权后核对、注册返回后的核对、最终确认）；已有但失效的本地密钥经 `authorize()` 重新授权时 5 次（外层预检、注册预检、授权后核对、注册返回后的核对、最终确认）。新密钥存盘会再触发一次被动查询。
- 校验窗口没有上界：别处替换默认 Agent 后，持续挂载且没有焦点、重连或显式核对的页面会一直认为已授权，直到下一次重取；交易所会拒绝那笔操作并按 ADR 0024 显示原文。原 `extraAgents` 方案的复用行为相同。
- 【推测】`userRole` 对已过期或因账户无资金被剪枝的 Agent 的过渡期返回值没有官方文档说明；代码对默认密钥没有独立的到期检查，若交易所在过渡期仍返回 `agent`，本地会继续认为已授权，由交易所拒绝那笔操作。
- 【未验证】真实外部钱包的无名授权与首单：本 ADR 只有单元测试、SDK 源码与官方打包代码证据；验收步骤见任务记录。
- `trading-agent-config` 测试随配置删除；`ci-workflows.test.mjs` 与 `terminal-tests.yml` 同步更新。

## 证据

- 代码：`packages/hl-react/src/signing/use-agent-status.ts`（`AgentKeyRole`、`AgentApprovalEvidence`、`isAgentKeyApprovedForOwner`、`userRole` 查询与 `fetchQuery` 核对）、`packages/hl-react/src/signing/use-agent-registration.ts`（无名 `approveAgent`）、`packages/hl-react/src/signing/agent-utils.ts`（删除 `isAgentApproved`）、`packages/hl-react/src/provider.tsx`、`session-provider.tsx`、`provider-context.ts`（删除 `agentName`）、`apps/terminal/src/providers/client-root.tsx`、`apps/terminal/src/lib/errors/exchange-error-text.ts`。
- 测试：`agent-verification-status.test.ts`、`use-agent-status-verification.test.tsx`、`use-agent-status-mobile-cleanup.test.tsx`、`use-agent-registration-race.test.tsx`（授权参数不含 `agentName`）、`owner-trading-status.test.tsx`、`trading-authorization.test.tsx`、`mobile-agent-lifecycle.test.ts`、`use-explicit-agent-approval.test.tsx`（无名参数原样透传）、`action-error.test.ts`（上限文案与中文）。
- 文档：本 ADR；[首次交易](../trading-onboarding.md)；[签名机制](../hyperliquid-signing.md)；[运行时守则](../runtime-guardrails.md)§1 状态表；`AGENTS.md`「First-use trading onboarding contract」与「Brand identity contract」；`CHANGELOG.md`；`deploy/env.build.example` 与 [CloudFront 发布](../../deploy/cloudfront/README.md)；[Agent 工作手册](../agent-handbook.md)第 8 节。
