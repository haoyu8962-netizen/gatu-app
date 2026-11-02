<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-12-codex-cli-review-followups",
  "date": "2026-10-12",
  "title": "Codex CLI 补审 #97、#101、#102、#103 的未审提交并修复发现",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "account-funding", "order-entry"],
  "summary": "PR #104 的 owner 绑定、法律门控、未决授权恢复、滑杆报价币语义及 CI 断言修复已随 p31 发布；生产审查后又补充安全重试与存储读取失败处理，并随 p32 发布。原 CI 清单漏测、全量补跑和各轮审查范围保留，真实钱包与物理拖动仍未由本次整理验收。",
  "thread": null,
  "baseCommit": "4c0da2b8",
  "commits": ["2fb0e907", "88827567"],
  "sources": [
    {"path": "apps/terminal/src/hooks/trade/use-fresh-legal-action-guard.ts"},
    {"path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts"},
    {"path": "apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx"},
    {"path": "apps/terminal/src/hooks/trade/use-order-entry-data.ts"},
    {"path": "scripts/ci-workflows.test.mjs"},
    {"path": "docs/agent-handbook.md"},
    {"path": "docs/cctp-deposits.md"},
    {"path": "docs/slider-interactions.md"},
    {"path": "docs/work-memory/sessions/2026-10-11-codex-deposit-branch-review.md"},
    {"path": "docs/work-memory/sessions/2026-10-12-slider-percent-basis-flicker.md"},
    {"path": "docs/work-memory/sessions/2026-10-12-ci-terminal-test-shards.md"}
  ],
  "supersedes": []
}
-->
# Codex CLI 补审 #97、#101、#102、#103 的未审提交并修复发现

## 背景与范围

同步记录，未取得任务标识。运营方问「前面的修改 PR 有没有调用 codex 的模型 gpt-6-astra 轻度对抗 review」，答复是没有，随后要求「去做，以后代码 PR 推送前默认跑一轮」。工作树 `.claude/worktrees/review-followups`，分支 `claude/codex-review-followups`，起点 `origin/dev` `4c0da2b8`。

## 结论与依据

- 取证：各 PR 的 Codex 机器人摘要显示它只在「PR opened」时审了首个提交（#97 `b0a3733`、#98 `0c14a17`、#101 `69038bb`、#102 `dadaa90`、#103 `9aca57a`），合入的头提交分别是 `525f38c0`、`d499c77a`、`1539a009`、`c5096613`、`9b4e275c`。机器人使用的模型与强度不可见。
- 审查命令：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"low"'`（codex-cli 0.154.0），提示词写明只读、不修改、不提交。「轻度」对应为 `low` 是执行者的对应，手册原默认是 `medium`。
- A 路（#97 `525f38c0` 及父提交、#102 `c5096613` 及父提交）：评分 6.5，1 项 P1、3 项 P2，逐条核对成立。
  1. P1：`useFreshLegalActionGuard.verify` 核验的是当前选中的 owner，未绑定本次存款的 `ready.address`。修复：`verify` 接受 `owner`，不一致即在请求与签名前抛错；`use-deposit.ts` 三处调用都传入。LiFi 的调用不传 owner，行为不变。
  2. P2：未接受条款或法律状态未知时，自动宿主先尝试、被执行边界拒绝、报失败并锁死到余额变化。修复：宿主用 `useLegalStatus()`，仅在 `userAllowed && canPerformActions && acceptedTerms` 时具备资格。
  3. P2：无哈希的未知状态警告在余额变化后被「旧授权仍有效」的失败提示覆盖。修复：存在未解决的赞助授权意向时不发起新尝试。
  4. P2：`c5096613` 让普通订单的报价币百分比选择记录基础币来源，松手后输入框保留旧报价金额而订单按该基础币乘新价格成交。修复：撤回，`selectedBaseSize` 恢复为只对 Reduce Only 生效；手势期间冻结的计算基准保留。该提交当初是为回应 GitHub 机器人的 P2 而写，两条意见方向相反，取「显示的金额即承诺」。
- B 路（#101 `1539a009` 及父提交、#103 `dec3e539` 及父提交）：评分 8。版本号迁移未发现缺陷。CI 结构断言 1 项 P2、1 项 P3：路径存在但不是测试文件、追加 `--exclude`、矩阵加 `exclude`、排除项之后再加正向路径，四种写法此前都能通过。修复：断言矩阵块的确切形状、Vitest 步骤只允许三个参数、路径必须是 `*.test.ts(x)`，并按顺序对代表性文件求值路径过滤。
- 推送前对上述修复再审一轮（评分 8，无 P1）：2 项 P2、1 项 P3，均成立并修复。授权意向到期后同一余额不会恢复 → 宿主在 `validBefore` 后一秒重新检查；排队中的尝试不随法律状态失效而取消 → 调用 `deposit()` 前复核；被 shell 注释掉的 Vitest 命令仍被计为执行 → 断言改为基于 `executableCommand()`。
- 手册第 7 节写入默认做法：代码 PR 推送前先跑一轮只读 `low` 审查，修复提交也要进这一轮。

## 验证与限制

版本：`4c0da2b8` 加本工作树改动，Node 24.15.0，pnpm 10.21.0。

- `pnpm --filter @sairn/terminal typecheck`、改动文件的 Biome 通过。
- Vitest：存款、自动宿主、下单、法律守卫与 LiFi 桥相关 13 个文件 742 项通过（第二轮修复后宿主与路由守卫两个文件 175 项复跑通过）；`node --test scripts/ci-workflows.test.mjs` 14/14。
- 变异检查（去掉修复后对应测试失败、恢复后通过）：owner 绑定、法律门控、意向存在时跳过、到期后重新检查、提交前法律复核，以及 CI 断言的五种绕过。
- Codex 在只读沙箱里不能运行 Vitest，它给出的变异都由执行者实际运行验证。
- PR #104 首轮 CI 全绿后，GitHub 机器人指出 `embedded-deposit-auto-bridge-sonner.test.tsx` 直接渲染宿主、没有法律状态上下文（P2，成立）：本地复现 3 项失败；该文件不在 CI 手选清单里，定向测试也没跑到。已补桩并把它加进 `terminal-tests.yml`；随后跑全量终端 Vitest：677 个文件通过、1 个跳过，9,021 项通过，182 秒。手册据此把全量 Vitest 列为推送前的固定步骤。
- 未做：真实邮箱钱包的自动存款、真实拖动滑杆；本地未运行 Playwright，以 PR 的 CI 为准。全量 Vitest 在首次推送（`2fb0e907`）之前没有跑，上一条的全量结果对应其后的工作树（`2fb0e907` 加测试补桩与 CI 清单一行）。
- 线上 p30 含 #97 的原实现：P1 的触发条件是存款进行中切换邮箱账户；第 2 项影响「余额已在而条款未接受」的会话。修复合入后需随下一次发布上线。

## 后续与替代关系

补充 [Codex 分支审查](2026-10-11-codex-deposit-branch-review.md)、[滑杆闪烁](2026-10-12-slider-percent-basis-flicker.md) 与 [CI 分片](2026-10-12-ci-terminal-test-shards.md)；其中滑杆记录里「报价币百分比选择记录基础币来源」一条被本记录取代，其余不变。

## 周整理补注（2026-10-19）

原“修复合入后需随下一次发布上线”已由 p31 来源记录更新。p32 又接续自动存款的退避重试和授权意向读取失败处理。预推送审查规则属于手册现行约定；后续发布任务中“Codex 先不用管”的原话仅是该任务的历史授权，不成为本次或以后任务豁免。

后续来源：[2026-10-12-cloudfront-release-p31](2026-10-12-cloudfront-release-p31.md)；[2026-10-13-production-readiness-audit](2026-10-13-production-readiness-audit.md)；[2026-10-14-cloudfront-release-p32](2026-10-14-cloudfront-release-p32.md)。

本补注为事后整理，只核对当前规范、代码、Git 和来源记录；来源测试及发布结果不作为本轮执行。查询时间和实际 head 见[本周整理](2026-10-19-weekly-memory-review.md)。
