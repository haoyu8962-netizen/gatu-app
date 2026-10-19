<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-12-automatic-unified-account",
  "date": "2026-10-12",
  "title": "新账号自动设为统一账户（ADR 0041）：实现、三轮 Codex 审查与修复",
  "kind": "task",
  "status": "verified",
  "topics": ["wallet-onboarding", "hyperliquid-api", "order-entry"],
  "summary": "ADR 0041 的新账号自动统一账户已经 PR #107 合入，并随 p32 来源记录发布；邮箱使用精确 embedded owner 的 userSetAbstraction，外部钱包使用已核验 Agent 的 agentSetAbstraction，default 本身仍不放行交易。原三轮审查及推送前第四轮、失败与测试边界保留，两条真实入金后自动设置路径均未验收。",
  "thread": null,
  "baseCommit": "c1a1e14e",
  "commits": ["b2ab32c71b1e6989775f0d50ed872aeffcd3f980", "c1a1e14e8055796194951a62e8d20e9ea9c875d1", "0b6b073ff4b189c7062c7ae8cfc643ece9f95dea", "6525fd04bbf7f0653512f1b749f2048e0d098a53", "0df68c13"],
  "sources": [
    {"path": "docs/adr/0041-automatic-unified-account-for-new-accounts.md"},
    {"path": "docs/work-memory/sessions/2026-10-12-new-account-default-mode-review.md"},
    {"path": "apps/terminal/src/components/trade/components/unified-account-auto-setup.tsx"},
    {"path": "apps/terminal/src/domain/trade/account-mode-setup.ts"},
    {"path": "apps/terminal/src/lib/trade/account-mode-setup-attempts.ts"},
    {"path": "apps/terminal/src/stores/use-account-mode-setup-store.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-account-mode-setup.ts"},
    {"path": "apps/terminal/src/domain/trade/order/availability.ts"},
    {"path": "apps/terminal/src/domain/trade/order-action-stage.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-order-entry-data.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-funds-action-availability.ts"},
    {"path": "apps/terminal/src/components/trade/tradebox/account-mode-modal.tsx"},
    {"path": "packages/hl-react/src/hooks/useExchange.ts"},
    {"path": "apps/terminal/src/lib/tests/unified-account-auto-setup.test.tsx"},
    {"path": "apps/terminal/src/lib/tests/account-mode-setup.test.ts"},
    {"path": "AGENTS.md"},
    {"path": "docs/trading-onboarding.md"},
    {"path": "docs/mobile-data-presentation.md"}
  ],
  "supersedes": []
}
-->
# 新账号自动设为统一账户（ADR 0041）：实现、三轮 Codex 审查与修复

## 背景与范围

同步记录，未取得任务标识。接续[取证记录](2026-10-12-new-account-default-mode-review.md)：新注册账号处于协议的 `default` 模式，本项目把它当作不支持的模式却没有任何一步让账号离开它。运营方看过取证结论后明确说「同意，按官方做法去做」。本次在工作树 `version-hint` 的分支 `claude/auto-unified-account`（叠在当时同样未推送的 `claude/settings-version-no-release-hint` `c1a1e14e` 上）实现，设计与取舍见 [ADR 0041](../../adr/0041-automatic-unified-account-for-new-accounts.md)。

## 结论与依据

### 实现

- 判定是纯函数 `getAccountModeSetupDecision`（`domain/trade/account-mode-setup.ts`），返回呈现状态 `not-applicable` / `awaiting-funds` / `pending` / `manual`、条件是否全部成立、是否可以发起尝试。资金结论由 `getAccountModeSetupFundingState` 给出：只认当前、完整、成功的全 DEX 与现货 WebSocket 快照，缓存摘要不能让账号变成已入金。
- 页面级宿主只观察一次账户模式，不自带轮询；终局拒绝文本由 `getExchangeRejectionText` 直接从 SDK 错误读取，宿主不引入错误文案模块。
- 尝试登记表 `lib/trade/account-mode-setup-attempts.ts` 按 `env:owner` 计数，保存到页面结束；失败后 5 秒回到可重试，第 3 次失败为用尽；已结算 45 秒后仍未离开则转为用尽。
- 宿主 `components/trade/components/unified-account-auto-setup.tsx` 挂在 `client-root.tsx`，对任何有地址的会话挂载（Agent-only 会话发布 `manual`）。邮箱会话签 `userSetAbstraction`，外部钱包签 `agentSetAbstraction`；`preExecutionGuard` 在资金锁内重读 `userAbstraction` 与 `historicalOrders`，同步的 `executionGuard` 在入队前与 SDK 边界读宿主当前判定。`hl-react` 的 `useExchange` 把 `agentSetAbstraction` 加入允许锁内守卫的交易签名方法。
- 呈现经 `use-account-mode-setup-store` 发布，由 `useAccountModeSetupKind` 读取：下单数据（`isAwaitingFirstDeposit` 让下单动作阶段返回 `deposit`，可用性状态本身不放行）、桌面与手机余额页签、资金动作原因、交易面板的账户模式标签、账户类型弹窗。
- 新增两句文案并补齐 zh、ar、es、fr、hi 翻译；提取后缺失数回到改动前的基线（ar/es/fr/hi 66，zh 3）。

### 审查与修复

推送前按约定用 Codex CLI（`gpt-6-astra`，`model_reasoning_effort="low"`，`-s read-only`，沙箱外运行）做只读对抗审查，共三轮，每轮只读未提交的工作区。

| 轮次 | 评分（正确性 / 安全性 / 覆盖） | 发现 | 处理 |
| --- | --- | --- | --- |
| 1 | 5 / 5 / 6 | 三项 P1：正余额来自不完整、失败或过期的快照仍算已入金；空订单历史没有在签名边界复核；`awaiting-funds` 把不支持的模式放行为下单可用 | 资金结论要求当前快照；锁内重读订单历史；可用性状态对不支持的模式永不为 `success`，Deposit 改由动作阶段决定 |
| 2 | 7 / 6 / 6 | 两项 P1：条件只在入队前检查；已入金可能来自缓存的 HTTP 摘要。两项 P2：初始订单历史答复不是列表时永久加载；空账号呈现排在终局失败与已知订单历史之前 | 增加 SDK 边界的同步守卫；已入金只取 WebSocket 快照；无效答复归为读取失败；调整判定顺序 |
| 3 | 8 / 9 / 8 | 前四项均确认已解决。一项 P2：缓存摘要与快照矛盾时永久加载。一项 P3：ADR 对 `manual` 的弹窗与手机余额页签描述不准确 | 矛盾归为 `unconfirmed` 并转手动选择；修正 ADR 与数据呈现文档 |

审查之外自查出一项：宿主原先只在 `hasWalletAccess` 为真时挂载，Agent-only 会话的 `default` 账号不会发布状态，使用方会一直读到 `pending`。已改为按地址挂载（第 1 轮进行中修复，Codex 在同一轮独立注意到并排除）。第 3 轮之后没有再跑第 4 轮：最后两处修复各有会失败的测试与变异核对。

## 验证与限制

版本：分支 `claude/auto-unified-account` 的工作区，基线 `c1a1e14e`，提交前。Node 24.15.0。

- `pnpm exec biome check <改动与新增的 32 个 TS/TSX 文件>`：通过。
- `pnpm typecheck`（hl-react、ui、terminal）：通过。
- `pnpm --filter @sairn/terminal test --maxWorkers=4`（最终状态）：682 个文件中 680 通过、1 跳过、1 失败；9161 条中 9159 通过、1 跳过、1 失败。失败的是 `vite-development-cache.test.ts` 的端口绑定用例（沙箱内 `listen EPERM`），在沙箱外单独运行通过。
- 第 2 轮修复后的那次全量运行里 `root-route-transition.test.tsx` 有一条失败（`useHyperliquid must be used within a HyperliquidProvider`）。当时 Codex 审查在并行运行；该测试桩掉了 `client-root`，不经过本次新增的宿主；单独运行 3 次与之后的全量运行均通过。记为负载下的偶发，未进一步查因。
- `node --test scripts/*.test.mjs`：61 条通过（沙箱外；沙箱内有 1 条因端口绑定失败）。
- 生产构建的包体预算（Node 22.15.0，`NODE_ENV=production`，固定构建标识，工作树里有 `.env.local`，按脚本提示比 CI 读数高几百字节；沙箱内预渲染步骤因不能绑定端口而失败，预算与环状依赖检查直接对已生成的客户端资源运行）：配对关闭时总量 3,310,432（基线 +5,953），交易首屏 −4,041，手机运行时启动 +7,741，桌面运行时启动 +9,543；配对开启时总量 +8,992，桌面运行时启动 +9,530。全部在各自 10,000 的允许增量内，没有重定基线。桌面运行时启动只剩约 460 字节余量；去掉宿主挂载的对照构建读到 +9,364，所以这个余量主要是此前已经用掉的，本次只占其中约 180。挂载宿主让余额钩子所在的块进入根部的静态闭包（交易首屏 +3.1 kB，总量 +3.9 kB），该块在交易页本来就会加载。
- 变异核对：对宿主、判定、可用性、动作阶段共 14 处改坏（去掉尝试登记、锁内模式判断、签名路径选择、订单历史查询条件、卸载清理、快照当前性、锁内订单历史判断、可用性放行、动作阶段分支、SDK 边界守卫、卸载时清零条件、缓存摘要计入快照、无效订单历史归类、判定顺序、`unconfirmed` 归类），对应测试均失败，恢复后通过。
- 页面读数（脚本读取，非人工目检）：本机开发服务器 `localhost:3005`，运营方登录的未入金新邮箱账号，1300×850 与 375×812。下单按钮为「Deposit」且可点；账户模式显示「Unified」；余额页签为「No balances found. Deposit funds to start trading.」；提款/划转的辅助说明为新文案；账户类型弹窗预选统一账户、三个选项与 Confirm 禁用、Confirm 的 `aria-describedby` 指向说明；页面与控制台没有「Select a supported account mode」或错误边界。

### 未验证

- 没有做真实验收：新邮箱账号入金后是否无点击变为统一账户；新外部钱包账号入金并建立 Agent 后是否同样如此且没有额外钱包弹窗。`pending` 与自动签名两条路径只有单元测试，没有在真实账号上出现过。
- 邮箱路径用的是用户签名的 `userSetAbstraction`（账户类型弹窗一直在用），外部钱包路径的 `agentSetAbstraction` 在本项目是第一次调用，交易所的实际答复未见过。

## 后续与替代关系

- 本记录接续[取证记录](2026-10-12-new-account-default-mode-review.md)，实现其中等待运营方决定的自动设置；该记录的取证内容仍然有效，不被替代。
- 待运营方操作：用新邮箱账号入金做真实验收；另用一个新的外部钱包账号验收 Agent 路径。
- 已有订单历史的 `default` 账号与 `dexAbstraction` 账号仍需手动选择；官方的强制迁移弹窗没有实现，是否实现需要运营方决定。
- 桌面运行时启动的包体预算余量约 460 字节（本地读数，CI 略低）。下一处增加根部或交易面板启动代码的改动很可能需要按 `docs/terminal-performance-baseline.md` 的方法重定基线，或先把代码移出启动路径。
- 取证记录里的三个旁观现象（Privy 登录窗口的钱包图标晚出现、内置浏览器面板里 Service Worker 注册失败、Privy `analytics_events` 的 CORS 报错）未处理。
- 2026-10-12 运营方要求「推送并创建 PR，CI 过了就合并到 dev」：三个提交（`b2ab32c7`、`c1a1e14e`、`0b6b073f`）作为 PR #107 推送，推送前第四轮 Codex 对整个差异无发现（9/9/8），CI 七项通过、机器人无发现后以合并提交 `6525fd04` 合入 `dev`；未晋升 `main`、未发布。本条为 2026-10-13 补记。

## 周整理补注（2026-10-19）

原“未晋升 main、未发布”已由 p32 发布来源接续。包体基线也已在 PR #113 重定，原约 460 字节余量只属于当时测量。取证阶段提出的邮箱 owner 签 agentSetAbstraction 方案没有采用，现行实现按 ADR 0041 使用 userSetAbstraction。原正文列出的模拟测试、预渲染端口失败、页面脚本读取与真实验收缺口保持各自范围。

后续来源：[2026-10-14-cloudfront-release-p32](2026-10-14-cloudfront-release-p32.md)；[2026-10-13-p32-rebaseline](2026-10-13-p32-rebaseline.md)。

本补注为事后整理，只核对当前规范、代码、Git 和来源记录；来源测试及发布结果不作为本轮执行。查询时间和实际 head 见[本周整理](2026-10-19-weekly-memory-review.md)。
