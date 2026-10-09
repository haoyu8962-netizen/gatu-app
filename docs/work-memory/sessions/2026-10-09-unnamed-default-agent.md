<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-09-unnamed-default-agent",
  "date": "2026-10-09",
  "title": "建立连接报「Too many extra agents」：普通交易连接改用无名默认 Agent（ADR 0038）",
  "kind": "task",
  "status": "recorded",
  "topics": ["wallet-onboarding", "hyperliquid-api"],
  "summary": "外部钱包在「建立连接」弹窗收到交易所原文 Too many extra agents for cumulative volume traded. Current limit is 3：根因是普通 Enable Trading 申请的是命名 Agent（sairn），命名授权触及交易所返回的上限 3；具体占位者未核实（候选：改名前的 gatu、Mobile、其他前端的命名钱包）；官方终端的 Establish Connection 申请的是无名默认 Agent，并用 webData3 的 agentAddress 判定就绪。用户选对齐官方：approveAgent 不再带 agentName，存储的密钥改用 userRole 核对为精确 owner 的 Agent（Mobile Agent 仍查 extraAgents），删除 sairn 槽位与 VITE_HYPERLIQUID_AGENT_NAME，命名上限的拒绝文案翻译并保留上限值。类型检查、Biome、17 个相关测试文件与 7 个变异检查通过；真实外部钱包的授权与首单未验收；未推送。",
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

- 根因（代码阅读 + 官方文档）：`packages/hl-react/src/signing/use-agent-registration.ts` 的 `approveAgent` 带 `agentName`，名字来自 `apps/terminal/src/config/trading-agent.ts`（生产构建 `VITE_HYPERLIQUID_AGENT_NAME=sairn`）。Hyperliquid Exchange endpoint 文档：一个账户 1 个无名 API 钱包、最多 3 个命名 API 钱包；命名 Agent 只被同名授权替换。交易所的回文说明这个账户的命名上限是 3，而 `sairn` 不在已有名字之中。具体占位者未核实（需要完整地址查 `extraAgents`）；推测的候选是改名前的 `gatu`（ADR 0027 第 85 行当时预告了这个失败）、Link mobile device 的 `Mobile valid_until …`、API 钱包页或其他前端创建的命名钱包。预检只找同名条目不看数量，所以先签名再被拒；`exchange-error-text.ts` 没有这条规则，按 ADR 0024 原样显示。
- 官方实践（2026-10-08 读取 `app.hyperliquid.xyz` 生产打包代码 `config-DgrJgRxr.js`，文件名随发布变化）：Establish Connection 的 `approveAgent` 动作不带 `agentName`、EIP-712 消息里为空串（无名默认 Agent）；密钥存在 `hyperliquid_agent_<地址>` 键下、存储由 `hyperliquid.persist_trading_connection` 决定（`localStorage` 或 `sessionStorage`），签好的请求先存 sessionStorage 的 `hyperliquid.pending_agent`；就绪判定是本地密钥地址与 `webData3.userState.agentAddress` 比对；`extraAgents` 用于 `api` 类型会话（API Wallets 页的命名钱包与手机扫码导入的密钥），`userRole` 只用于地址覆盖功能；手机链接授权的是命名 `Mobile QR` Agent；官方对这条拒绝文案没有特殊处理。
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
- `userRole` 的速率权重是 60，`extraAgents` 是 20；被动查询只在有本地密钥时启用，`staleTime` 30 秒只影响挂载、焦点与重连时的缓存复用，没有轮询，也没有失效上界；每次确定性核对都发请求。

### 第 1 轮 Codex 对抗审查（gpt-6-astra，medium，只读三路并行，对 dba03dee）

评分：行为证伪 7.5、规范与记录 8.5、遗漏与变异 9.0（过线标准三路 ≥ 9.5 且无 P0/P1/P2）。发现与处理：

- P1（A）`loadAgentEvidence` 在请求前读取本地记录、请求后直接沿用：另一标签页在请求期间替换或删除记录时，旧答案仍可让旧记录就绪（Mobile 的 `extraAgents` 查询键只含 owner，不会因换密钥而换键）。已改为每次请求结束后重新读取本地记录（`readLatestLocalAgent`），记录变了就按新记录判定（默认密钥：答案不属于新密钥 → 不就绪；记录被删除 → 需要新连接）；`refetchBuilderFee` 同样在请求后读取。新增「请求期间记录被替换/删除」的默认与 Mobile 用例。
- P2（A）TanStack 的 `fetchQuery` 会复用同键在途请求：钩子在密钥存盘后就可能发出授权前的 `userRole` 查询，授权后的核对若撞上它会得到旧的 `missing`。已改为先 `queryClient.cancelQueries`（默认 `revert: true`，不把钩子的查询置为错误）再 `fetchQuery({ staleTime: 0 })`。新增 `use-agent-status-cache.test.tsx`（真实 `useInfo` 与 QueryClient）：新鲜 miss 不被复用、在途旧答案不被复用且缓存与钩子最终为 ready、继承宿主 retry、失败包装为 `AgentStatusError`。
- P2（A/B）ADR「之前授权过的命名 Agent 不再被使用」不实：`userRole` 不区分命名与无名，浏览器里仍有效的旧 `sairn` 密钥（以及无 `source` 的更早记录）会继续使用，直到下一次需要新授权。ADR、首次交易文档、CHANGELOG 已改写；新增 legacy 记录经 `userRole` 就绪的单元用例。
- P2（A/B）「30 秒内不重复」「最多 30 秒」不实：`staleTime` 只影响挂载、焦点、重连时的缓存复用，没有轮询，没有失效上界，显式核对总是发请求。ADR 与本记录已改写。
- P2（B）本记录摘要把槽位占位者写成事实：已改为「交易所回文的上限 3；具体占位者未核实（候选 …）」，索引重建。
- P2（C）`refetchAgent` 的「fresh request」用例没钉住 `staleTime: 0` 与缓存键一致：由新的 cache 测试覆盖（变异 M11 把 `staleTime` 改 30 秒、M12 改缓存键，均失败）。
- P2（C）`refetch()` 合并路径与 `refetchBuilderFee` 用最新密钥缺直接回归：已补两个用例（双 deferred 并行、渲染后换密钥）。
- P2（C）/P3（B）`trading-authorization.test.tsx` 与 `establish-connection-modal.test.tsx` 不在 CI：已加入 `terminal-tests.yml`、`ci-workflows.test.mjs` 钉子与 AGENTS 清单（连同 `use-explicit-agent-approval` 与新的 cache 测试）。
- P3（B）CHANGELOG「three for most accounts」无据：改为「交易所按成交量放宽、本账户回文为 3」。
- P3（C）`establish-connection-modal.test.tsx` 仍模拟已删除的 `remote_named_agent_exists`：改用真实 `AgentMissingReason` 并参数化三个有效原因；注册竞态测试里提到 `extraAgents` 的用例名改为 `userRole`。
- 另按变异表补：观察查询 `staleTime` 30 秒的断言、Mobile 记录的 loading/error 只取自 `extraAgents`、Mobile 记录带 override 走 `userRole`、清理 effect 在 `enableAgent: false` 时不运行、上限文案带未知后缀时保持原文。
- 保留为推测并写进 ADR：`userRole` 对过期或被剪枝的 Agent 在过渡期的返回值没有官方文档说明。
- 未采纳：审查方建议的「等待已有查询结束再强制发起」——取消在途请求更简单，且钩子的查询状态会回退而不是报错。

本轮修复后的验证（提交前工作区）：`pnpm typecheck` 通过；Biome 通过；10 个相关测试文件 205 项通过（其中 `use-agent-status-verification` 与新 cache 测试 25 项）；`node --test scripts/ci-workflows.test.mjs` 12 项；变异 M8（去掉 `cancelQueries`）、M9/M10（请求前读记录）、M11（`staleTime` 30 秒）、M12（换缓存键）各自让对应测试失败，还原后通过。

### 第 2 轮 Codex 对抗审查（对 87b465a1）

评分：行为证伪 7.0、规范与记录 9.0、遗漏与变异 7.0。发现与处理：

- P1（A/C）第 1 轮的 `cancelQueries` 方案在两个显式核对并发时会让先启动的那个拿到回退的旧缓存：TanStack `query.fetch` 在 `revert` 取消且已有 `data` 时直接返回旧 `data`。已改为每个核对用私有查询键 `[...键, { definitiveCheck: 序号 }]` 自己请求（继承宿主重试），只有本键最后启动的核对把答案写回钩子的缓存键（先取消并回退在途的观察查询，再 `setQueryData`）。新增 cache 用例：两个并发核对各得自己的答案、缓存与钩子保留后启动者的答案、较慢的旧答案不覆盖、私有查询不残留。
- P1（A/C）`refetch()` 在角色答案返回之后、builder fee 返回之前记录被替换或删除时仍会用旧记录推导：已在 `Promise.all` 结束后再读一次记录。新增默认与 Mobile 两个用例（角色先回、换记录、fee 后回）。
- P2（C）`refetchBuilderFee` 的用例只证明「渲染后重读」：改为 fee 请求 deferred 期间换记录，并补无 builder 配置分支。
- P2（A）ADR 的核对次数「2 到 3 次」低估：按直接 `register()`、`authorize()` 无密钥、`authorize()` 已有失效密钥分别写明 1 / 3 / 5 次显式请求。
- P2（B）ADR 对官方实践的两处描述与打包代码不符：`extraAgents` 用于 `api` 类型会话（含手机扫码导入），命名 Agent 还有手机链接的 `Mobile QR`；密钥存储由 `hyperliquid.persist_trading_connection` 决定而非固定 `localStorage`。ADR 与本记录已改写。
- 另补：`owner-trading-status` 新增外部 owner 无本地密钥时需要 1 次 Agent 签名（含 builder fee 为 2）且不查询 `userRole` 的用例；`action-error` 新增中文目录按上限 5 插值的渲染断言。
- 第 1 轮第 13 条（取消在途请求不会让观察者报错）的判断本身成立，但审查方指出它不覆盖等待同键请求的其他调用方，故改用私有键。

本轮修复后的验证（提交前工作区）：`pnpm typecheck` 通过；Biome 通过；8 个相关测试文件 176 项通过（`owner-trading-status` 先因 `vi.hoisted` 内引用模块常量报 ReferenceError，改为字面量后通过）；变异 M13（每个核对都写回缓存）、M14（合并刷新沿用 fee 前的记录）、M15（写回前不取消观察查询）、M16（核对共用钩子的查询键）、M17（fee 刷新在请求前读记录）各自让对应测试失败，还原后通过。

### 第 3 轮 Codex 对抗审查（对 b178faa0）

评分：行为证伪 7.0、规范与记录 9.0、遗漏与变异 7.5。发现与处理：

- P1（A/C）被后来的核对赶超的核对仍返回自己的（可能已被否定的）答案，注册的授权后核对与最终确认会接受它：已改为赶超者等待并返回最新核对的答案或失败（`awaitLatestDefinitiveCheck`）；cache 用例的两个并发场景改为断言赶超者得到最新答案，并新增「自己的请求失败但有更新的核对」用例。
- P1（A）最新核对失败时钩子仍按缓存的旧 `agent` 就绪：失败时先 `resetQueries` 清掉共享缓存并让观察查询重新获取，再抛 `AgentStatusError`；新增用例断言缓存被清、钩子不再就绪并在观察查询失败后进入 `error`。
- P2（A/B/C）核对序号是模块级 Map，不同 QueryClient 互相压制写回：改为 `WeakMap<QueryClient, Map>`，并在取消在途观察查询后再确认仍是最新才写回；新增两个 QueryClient 同时核对同一键、各自缓存都更新的用例。
- 另补：合并刷新在 builder fee 答案带 error 时拒绝（C10）、上限文案大小写不敏感（C16）、`useAgentWallet` 的就绪矩阵（新文件 `use-agent-wallet.test.tsx`，已进 CI、钉子与 AGENTS 清单）。
- 审查方「值得补」但未做：Mobile 清理 effect 的钩子级组合用例；真实 cache 套件里「禁用查询保留旧数据」的切换用例。

本轮修复后的验证（提交前工作区）：`pnpm typecheck` 通过；Biome 通过；11 个相关测试文件 224 项通过；`node --test scripts/ci-workflows.test.mjs` 12 项；变异 M18（赶超者返回自己的答案）、M19（最新核对失败不清缓存）、M20（核对登记跨 QueryClient 共享）各自让对应测试失败，还原后通过。

### 第 4 轮 Codex 窄范围复审（对 a8350c8f）

评分：三路均 7.5。发现与处理：

- P1（三路一致）`await cancelQueries` 期间被赶超的核对仍返回自己的答案（第二次 `isNewest()` 只保护缓存写回）：改为取消完成后仍是最新才写缓存并返回自己的答案，否则进入等待最新核对的共同路径。新增用例：用 `cancelQueries` 的 spy 在取消窗口内启动第二个核对，分别覆盖第二个核对返回 `missing` 与失败。
- P2（三路一致）连续赶超时，中间核对的失败会越过「是否仍最新」的判断直接抛出：`awaitLatestDefinitiveCheck` 改为成功与失败都先捕获，登记已被替换就继续循环，仍是最新才返回或抛错。新增 A 等 B、C 替换 B、B 失败而 C 成功的三核对用例，以及最新核对失败时所有等待者都得到它的失败的用例。
- 变异 M21（取消期间被赶超仍返回自己的答案）、M22（中间失败先于最新判断抛出）各自让对应测试失败，还原后通过。

## 后续与替代关系

- 真实钱包验收后在本记录追记结果；同时核对 app.hyperliquid.xyz 在 Sairn 建立连接后是否确实要求重新 Establish Connection（默认槽位互相替换）。
- 旧的 `gatu`、`sairn`、`sairn-dev` 命名 Agent 仍占账户的命名槽位；要腾出槽位得在 API 钱包页移除（每个一次主钱包签名）。可以考虑在 API 钱包页提示退役名字。
- 官方 API Wallets 页会显示默认 Agent 并提供 `delete_default`（零地址无名授权）；Sairn 的 API 钱包页仍只列命名钱包，默认 Agent 的显示与删除未实现。
- 本记录取代 `docs/trading-onboarding.md` 里「命名部署槽位」的说法与 ADR 0027 的 `sairn` 槽位结论（局部失效，ADR 0027 其余不变）。下次先查 ADR 0038、`use-agent-status.ts` 与 `use-agent-status-verification.test.tsx`。
