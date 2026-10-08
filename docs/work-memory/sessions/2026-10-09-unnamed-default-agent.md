<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-09-unnamed-default-agent",
  "date": "2026-10-09",
  "title": "建立连接报「Too many extra agents」：普通交易连接改用无名默认 Agent（ADR 0038）",
  "kind": "task",
  "status": "recorded",
  "topics": ["wallet-onboarding", "hyperliquid-api"],
  "summary": "外部钱包在「建立连接」弹窗收到交易所原文 Too many extra agents for cumulative volume traded. Current limit is 3：根因是普通 Enable Trading 申请的是命名 Agent（sairn），而账户的命名 Agent 上限（3 个）已被改名前的 gatu、Mobile 或其他前端的命名钱包占满；官方终端的 Establish Connection 申请的是无名默认 Agent，并用 webData3 的 agentAddress 判定就绪。用户选对齐官方：approveAgent 不再带 agentName，存储的密钥改用 userRole 核对为精确 owner 的 Agent（Mobile Agent 仍查 extraAgents），删除 sairn 槽位与 VITE_HYPERLIQUID_AGENT_NAME，命名上限的拒绝文案翻译并保留上限值。类型检查、Biome、17 个相关测试文件与 7 个变异检查通过；真实外部钱包的授权与首单未验收；未推送。",
  "thread": null,
  "baseCommit": "4c5ff959",
  "commits": [],
  "sources": [
    { "path": "packages/hl-react/src/signing/use-agent-status.ts" },
    { "path": "packages/hl-react/src/signing/use-agent-registration.ts" },
    { "path": "apps/terminal/src/lib/errors/exchange-error-text.ts" },
    { "path": "apps/terminal/src/lib/tests/use-agent-status-verification.test.tsx" },
    { "path": "docs/adr/0038-unnamed-default-agent-for-trading-connection.md" },
    { "path": "docs/trading-onboarding.md" }
  ],
  "supersedes": []
}
-->
# 建立连接报「Too many extra agents」：普通交易连接改用无名默认 Agent（ADR 0038）

## 背景与范围

2026-10-08 用户提供一张「建立连接」弹窗的截图，错误原文是 `Too many extra agents for cumulative volume traded. Current limit is 3`，要求审查相关代码、找出原因、对照开发文档与 app.hyperliquid.xyz 的建立连接实践。诊断报告给出两个方案后，用户在 2026-10-09 选择方案 2：对齐官方终端，普通交易连接改用无名默认 Agent。本记录为同步记录；截图未归档（含钱包地址，用户未提供完整地址，没有查询其 `extraAgents`）；没有任务标识（`thread: null`）。开始时工作区干净，基线 `4c5ff959`（`origin/dev`），分支 `claude/unnamed-default-agent`。

## 结论与依据

- 根因（代码阅读 + 官方文档）：`packages/hl-react/src/signing/use-agent-registration.ts` 的 `approveAgent` 带 `agentName`，名字来自 `apps/terminal/src/config/trading-agent.ts`（生产构建 `VITE_HYPERLIQUID_AGENT_NAME=sairn`）。Hyperliquid Exchange endpoint 文档：一个账户 1 个无名 API 钱包、最多 3 个命名 API 钱包；命名 Agent 只被同名授权替换。账户已有 3 个其他名字时 `sairn` 进不去。可能的占位者：改名前的 `gatu`（ADR 0027 第 85 行当时预告了这个失败）、Link mobile device 的 `Mobile valid_until …`、API 钱包页或其他前端创建的命名钱包；具体占位者未核实（需要完整地址查 `extraAgents`）。预检只找同名条目不看数量，所以先签名再被拒；`exchange-error-text.ts` 没有这条规则，按 ADR 0024 原样显示。
- 官方实践（2026-10-08 读取 `app.hyperliquid.xyz` 生产打包代码 `config-DgrJgRxr.js`，文件名随发布变化）：Establish Connection 的 `approveAgent` 动作不带 `agentName`、EIP-712 消息里为空串（无名默认 Agent）；密钥存 `localStorage` 的 `hyperliquid_agent_<地址>`，签好的请求先存 sessionStorage 的 `hyperliquid.pending_agent`；就绪判定是本地密钥地址与 `webData3.userState.agentAddress` 比对；`extraAgents` 只用于 API Wallets 页，`userRole` 只用于地址覆盖功能；官方对这条拒绝文案没有特殊处理。
- SDK 证据：`@nktkas/hyperliquid` 0.33.3 的 `ApproveAgentRequest` schema 把 `agentName` 定义为 `nullish(..., "")`，缺省时签名与发送都用空串；nktkas 仓库的 `tests/api/exchange/approveAgent.test.ts` 覆盖 `agentName: null` 与缺省两种写法；Python SDK 用空串签名、发送时删掉该键。
- 采用的方案（ADR 0038）：`approveAgent` 只传 `agentAddress`；`useAgentStatus` 对 `local-registration` 密钥查询 `userRole({ user: 密钥地址 })`（`staleTime` 30 秒），只有 `{ role: "agent", data: { user: 精确 owner } }` 才算已授权，答案绑定密钥地址（`AgentKeyRole`）；授权后的核对用 `queryClient.fetchQuery(infoQueryOptions("userRole"), { staleTime: 0 })` 取新答案并写进同一缓存键；没有本地密钥时已连接的 owner 直接需要新连接、不发请求；Mobile Agent 仍按名字基底、地址、到期查 `extraAgents`，该查询只在本地记录是 Mobile Agent 时启用；去掉 `remote_named_agent_exists`；删除 `trading-agent.ts`、`TRADING_AGENT_NAME`、`VITE_HYPERLIQUID_AGENT_NAME`、Provider 的 `agentName`、`isAgentApproved`；`exchange-error-text.ts` 新增规则翻译 `Too many extra agents for cumulative volume traded. Current limit is N`（中文已补，其他四种语言回退英文）。
- 未采用：保留命名槽位并处理上限（用户未选；上限按账户成交量变化，预检不可靠）；`webData3` 订阅做被动校验（要在每个挂交易状态钩子的页面订阅重流）；`webData2` 信息请求（载荷过大）。
- 文档同步：`docs/trading-onboarding.md`（第 4、5 步、Stay Connected 一节、回归清单）、`docs/hyperliquid-signing.md`（新增「Default Agent versus named Agents」、示例不带名字）、`docs/runtime-guardrails.md` §1 状态表、`AGENTS.md`（首次交易契约新增一条、品牌契约去掉 Agent 槽位、回归清单）、`CHANGELOG.md`、`deploy/env.build.example`、`deploy/cloudfront/README.md`、`docs/agent-handbook.md` 第 8 节、`docs/brand-assets.md`、ADR 0027 两处补记、`docs/adr/README.md`、`docs/README.md`。

## 验证与限制

工作区基线 `4c5ff959`，以下检查都在提交前的工作区上运行（2026-10-09）。

- `pnpm typecheck`（hl-react、ui、terminal）通过；`pnpm exec biome check` 对 22 个改动的 TS/TSX/MJS 文件通过（3 个文件由 `--write` 格式化）。
- `vitest run` 17 个文件 346 项通过：`agent-verification-status`、`use-agent-status-verification`、`use-agent-status-mobile-cleanup`、`use-agent-registration-race`、`owner-trading-status`、`trading-authorization`、`mobile-agent-lifecycle`、`use-explicit-agent-approval`、`action-error`、`errors`、`use-sub`、`fast-asset-ctxs-subscription`、`account-activity-feed-owner`、`agent-registration-session`、`agent-storage-scope`、`trading-onboarding-gate`、`trading-onboarding-domain`。
- `node --test scripts/ci-workflows.test.mjs` 12 项通过（删除 `trading-agent-config` 条目，新增 5 个 Agent 校验测试的钉子）。
- 变异检查（逐个改源码、跑对应测试、确认变红后还原）：注册重新带 `agentName`；`isAgentKeyApprovedForOwner` 不比较 owner；另一把密钥的答案当作本密钥的答案；核对请求不转小写；没有本地密钥时不判定需要 Agent；Mobile Agent 也走 `userRole`；删除上限拒绝规则。7 个变异下对应的 vitest 运行都以退出码 1 失败，还原后再次通过。
- `lingui extract` 只新增一条消息（6 个目录各 4 行）；第一次误用 `--clean` 删掉了过时条目，已还原后重跑。
- 未做：真实外部钱包的无名授权与首单（需要运营方用钱包操作：Enable Trading → 钱包签名 → 下一单；核对点是签名请求的 `agentName` 为空、`userRole` 对新地址返回 `agent`、首单被接受）；Codex 对抗审查（用户本轮未要求）；生产构建与包体测量；全量 `pnpm --filter @sairn/terminal test`（见后续）。
- `userRole` 的速率权重是 60，`extraAgents` 是 20；查询只在有本地密钥时启用、30 秒内不重复。

## 后续与替代关系

- 真实钱包验收后在本记录追记结果；同时核对 app.hyperliquid.xyz 在 Sairn 建立连接后是否确实要求重新 Establish Connection（默认槽位互相替换）。
- 旧的 `gatu`、`sairn`、`sairn-dev` 命名 Agent 仍占账户的命名槽位；要腾出槽位得在 API 钱包页移除（每个一次主钱包签名）。可以考虑在 API 钱包页提示退役名字。
- 官方 API Wallets 页会显示默认 Agent 并提供 `delete_default`（零地址无名授权）；Sairn 的 API 钱包页仍只列命名钱包，默认 Agent 的显示与删除未实现。
- 本记录取代 `docs/trading-onboarding.md` 里「命名部署槽位」的说法与 ADR 0027 的 `sairn` 槽位结论（局部失效，ADR 0027 其余不变）。下次先查 ADR 0038、`use-agent-status.ts` 与 `use-agent-status-verification.test.tsx`。
