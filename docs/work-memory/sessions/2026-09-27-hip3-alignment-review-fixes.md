<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-27-hip3-alignment-review-fixes",
  "date": "2026-09-27",
  "title": "HIP-3 免责声明对齐：修复 Codex 审查发现",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "处理 2026-09-25 Codex 对 7c9b3f21 的审查发现：把后台任务的 store 空值保护 06293549 与其记录 cherry-pick 进 codex/reviewceshi（518d0039、79ec5555，索引冲突后重新生成）；全部平仓浏览器夹具可要求免责声明，新增真实弹窗加真实提交路径的用例（声明期间改变持仓并拨过 31 秒，核对展示数量等于发单数量）；限价平仓保留会话 250 ms 播放退出动画，关闭中禁用确认；补交易页副本与平仓副本的 Esc 测试；改正确认面契约里市价平仓提交宿主的描述与 30 秒起算点。两处变异检查均被测试抓住。Biome、类型检查、回归组 48 文件 948 项、完整单测 601 文件 6862 项、全部平仓浏览器套件 41 项通过；应用内浏览器会话已登出，限价平仓未实测。补记：Codex 只读对抗审查 27ee060f..3d0e7667，无 P0 到 P3 发现，两条限定事项经核实不构成缺陷。",
  "thread": null,
  "baseCommit": "27ee060f",
  "commits": ["518d0039", "79ec5555"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/positions/position-limit-close-modal.tsx" },
    { "path": "apps/terminal/src/lib/tests/position-limit-close-modal.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/hip3-deployer-disclaimer.test.tsx" },
    { "path": "apps/terminal/tests/browser/position-close-all.browser.tsx" },
    { "path": "apps/terminal/tests/browser/position-close-all.fixture.tsx" },
    { "path": "apps/terminal/tests/browser/position-close-all.pw.ts" },
    { "path": "apps/terminal/src/lib/tests/persisted-store-hydration.test.ts" },
    { "path": "docs/hip3-deployer-disclaimer.md" },
    { "path": "docs/confirmation-surfaces.md" }
  ],
  "supersedes": []
}
-->
# HIP-3 免责声明对齐：修复 Codex 审查发现

## 背景与范围

同步记录。用户问「这些修复了吗？」。核对后答复：当前分支 `codex/reviewceshi` 仍停在 `27ee060f`，Codex 报的 3 项 P2 与测试缺口都没修；store 补水的空值保护已由用户启动的后台任务在分支 `claude/hungry-cartwright-aa350f` 提交为 `06293549`，没有合入。用户随后说「请你规划执行修复任务」。本次在主检出上执行，后台任务的 worktree 只读取、未改动。审查发现的原文见 [2026-09-25-hip3-disclaimer-alignment](2026-09-25-hip3-disclaimer-alignment.md) 的补记。

## 结论与依据

- **合入后台任务**：cherry-pick `06293549` 为 `518d0039`（两个 store 的 `persisted ?? {}` 与新测试，无冲突）；cherry-pick `0979f50b` 为 `79ec5555`（工作记录，`INDEX.md` 冲突，取本分支版本后用 `pnpm memory:index` 重新生成）。那份记录写「用户在 2026-09-25 用 zustand 5.0.9 复现」，实际复现由本会话完成并写进任务描述，这里更正归属，不改原记录。
- **全部平仓的真实链路测试**：浏览器夹具的 `useHip3DisclaimerRequirement`、`useHip3DisclaimerActions`、`hasAcceptedHip3Disclaimer` 桩改为读写夹具状态 `hip3Accepted`，默认已接受，原有 40 个用例不变；新增夹具按钮「Require HIP-3 disclaimer」。新用例要求免责声明后打开全部平仓；声明打开期间用 `dispatchEvent` 触发「Change size」，因为阻塞弹层盖住了夹具按钮；再把 `page.clock` 拨过 31 秒，勾选并确认。断言确认面展示的数量是 3 和 3、会话 ID 不变、发单前没有订单，确认后发出的订单数量等于展示数量。免责声明、控制器、store、快照解析与提交钩子都是真实模块，只替换账户数据与交易所边缘。
- **限价平仓的退出过渡**：`PositionLimitCloseModal` 改用 `useLingeringValue` 保留会话 250 ms，并把 `open` 传下去；免责声明取 `open && hip3Disclaimer.open`，确认面外壳取 `open && !isSubmitted`。「Place Limit Close」在 `!open` 时禁用，`handleSubmit` 对 `!open` 提前返回。输入框与滑杆不随关闭禁用，避免淡出时变灰；关闭中无法提交由按钮与处理函数两层保证。
- **Esc 测试**：`hip3-deployer-disclaimer.test.tsx` 用真实的 `AdaptiveModal`，在桌面弹窗与手机抽屉下按 Esc：交易页副本不关闭，平仓副本调用 `onExit`。
- **文档**：确认面契约的 HIP-3 行改为只有限价平仓、反手、全部平仓的提交钩子随确认面挂载，市价平仓的提交宿主在页面层；「30 秒从确认面出现时起算」改为从接受时重新起算；限价平仓行补退出过渡。归属文档第 4 节补市价平仓提交宿主，第 5 节分开写「接受或离开」与「取消结束会话」两种退出过渡，第 6 节补首次访问的空值保护，第 9 节补 Esc 用例与浏览器用例。CHANGELOG 同步。

## 验证与限制

在基线 `27ee060f` 加两个 cherry-pick 提交与本次工作区改动上执行，2026-09-27：

- 变异检查：把交易页副本改成 `dismissible` 后，两条「交易页副本按 Esc 不关闭」用例失败；去掉 `refreshCloseAll` 调用后，新浏览器用例因展示数量仍是旧快照而失败。两处都用 `git checkout --` 还原并确认无差异。
- `pnpm exec biome check`（3 个受检文件，`tests/browser` 不在 Biome 范围内）与 `pnpm --filter @gatu/terminal typecheck` 通过。
- 免责声明、补水与 AGENTS.md「Confirmation surfaces」回归组共 48 个文件、948 项通过。
- 完整单测 `pnpm --filter @gatu/terminal test`：601 个文件通过、1 个跳过（`websocket-soak`），6862 项通过。
- `pnpm exec playwright test --config tests/browser/position-close-all.playwright.config.ts`：41 项通过。
- 未实测：应用内浏览器的 `localhost:3005` 会话已登出（显示 Connect Wallet），重新登录要邮箱验证码，只能由用户操作，所以限价平仓的退出过渡没有在真实账户上看过。它与全部平仓、反手共用同一个确认面外壳和保留会话的做法，逻辑由单元测试覆盖。四个平仓流程的免责声明仍未在持有 HIP-3 仓位的真实账户上操作过。

## 后续与替代关系

- 不替代任何记录。2026-09-25 记录的 Codex 审查发现至此全部处理，那份记录末尾已加指向本记录的更新。
- 后台任务的分支 `claude/hungry-cartwright-aa350f` 从 main 拉出，它的两个提交已按内容 cherry-pick 进本分支；两条分支日后都合入 `dev` 时内容相同，预计不会冲突，但 `INDEX.md` 需要重新生成。
- 仍待办：持有 HIP-3 仓位时四个平仓流程的实测，以及限价平仓退出过渡的真机观察。

## 补记：Codex 对抗审查（2026-09-27）

- 调用与上一轮相同：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"medium"'`，codex-cli 0.154.0，范围 `27ee060f..3d0e7667`。共 16 条只读命令、约 14 万 token。Codex 没有运行测试，也没有重做变异检查，它对这些数字的复述不是独立验证。
- 结论：没有 P0 到 P3 发现。它核对了 cherry-pick 的补丁一致性，用仓库的 `parseRecord`、`renderIndex` 在内存中重建 `79ec5555` 与 `3d0e7667` 的索引并逐字一致，核对了 zustand 5.0.9 的调用顺序、补水测试能区分目标路径、限价平仓提交生命周期与会话替换、新浏览器用例的断言与时钟、Esc 用例确实走到 Base UI 的关闭逻辑，以及文档更正与代码一致。本会话另用 `git patch-id --stable` 复核：`06293549` 与 `518d0039` 的补丁标识相同；`0979f50b` 与 `79ec5555` 只差重新生成的索引，记录文件本身相同。
- 限定事项一，本会话核实后不认定为缺陷：限价平仓的 `canEdit` 不含 `open`，淡出的 250 ms 内输入框与滑杆仍可操作。确认按钮在 `!open` 时禁用、`handleSubmit` 提前返回，所以不可能提交；组件在 250 ms 后卸载，期间的拖动结果随之丢弃。「拖动中按 Esc 关闭、在淡出期间松手」的真实输入顺序没有测试，也没有真人拖动验证，不能据此宣称滑杆契约在这条路径上已验证。
- 限定事项二，本会话核实后不认定为缺陷：`getNetwork()` 依次读取固定域名映射（`app.gatu.ai`、`testnet.gatu.ai`）、独立网络键 `STORAGE_KEYS.NETWORK`，最后是旧版设置 JSON 里未经校验的 `state.network`。在非固定域名上、没有独立网络键、旧版设置数据损坏却仍含合法 `network` 时，以前补水抛错被吞，网络碰巧保留了损坏数据里的值；现在数据被 `createValidatedStorage` 清除后 `merge` 重新调用 `getNetwork()`，回到默认网络。线上两个固定域名不受影响；新行为与「校验失败的数据整体丢弃」一致。`persisted-store-hydration.test.ts` 的 `{state:null}` 用例没有覆盖这条路径。
- 状态：无需修复的发现；两条限定事项记在这里，等待用户决定是否补测试。
