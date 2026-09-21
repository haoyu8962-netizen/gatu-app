<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-remaining-funds-action-blocks",
  "date": "2026-09-21",
  "title": "交易面板之外的同类功能块：推荐、API 钱包、金库、质押的结果反馈；LiFi 跨链桥有意不改",
  "kind": "task",
  "status": "verified",
  "topics": [
    "market-recovery",
    "docs-governance"
  ],
  "summary": "产品负责人要求先处理清点出的同类功能块。推荐弹层改为点击即关闭、结果走通知；API 钱包只把按钮改为静态名称并把预检状态移到正文，分阶段弹层因一次性私钥而保留；金库与质押保留签名、提交、对账期间的进度面板，对账得出结论后由页面层上报通知并关闭或回到复核，状态未知仍留在弹层里。顺带修复质押错误说明一直渲染为空的既有缺陷，并给转账、兑换、充值、提现、金库、质押通知里的金额与哈希加上从左到右隔离。LiFi 跨链桥未改。未做真实钱包验收。",
  "thread": null,
  "baseCommit": "daa5ec7f",
  "commits": [
    "3098da44",
    "82431efe",
    "54a65716"
  ],
  "sources": [
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "apps/terminal/src/components/referrals/referral-action-modal.tsx" },
    { "path": "apps/terminal/src/components/api-wallet/api-wallet-action-modal.tsx" },
    { "path": "apps/terminal/src/components/vaults/vaults-page.tsx" },
    { "path": "apps/terminal/src/components/vaults/vault-action-modal.tsx" },
    { "path": "apps/terminal/src/components/staking/staking-view.tsx" },
    { "path": "apps/terminal/src/components/staking/staking-action-modal.tsx" },
    { "path": "apps/terminal/src/components/staking/domain/staking-action-feedback.ts" },
    { "path": "apps/terminal/src/lib/tests/referral-action-modal.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/api-wallet-action-modal.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/vault-detail-page-outcomes.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/vault-action-modal.test.tsx" },
    { "path": "apps/terminal/src/components/staking/__tests__/staking-view.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/rtl-financial-ui-contract.test.ts" }
  ],
  "supersedes": []
}
-->
# 交易面板之外的同类功能块：推荐、API 钱包、金库、质押的结果反馈；LiFi 跨链桥有意不改

## 背景与范围

同步记录，接续 `2026-09-21-funds-dialog-outcomes.md`。产品负责人问「还有哪些未处理、存在同样情况的功能块」，全仓清点后列出五块：推荐、API 钱包、金库、质押、LiFi 跨链桥；随后要求「请先处理同类问题」。分支 `fix/market-close-confirmed-size`（工作树 worktree-05），未推送。

## 结论与依据

各块现在的做法与理由写在 `docs/confirmation-surfaces.md` 的表里，这里记要点与过程中的发现。

- **推荐（`3098da44`）。** 输入推荐码、创建推荐码、领取奖励三个动作改为点击即关闭，结果走通知；`ReferralActionStatusUnknownError` 或结果不明为常驻警告。提交钩子在推荐看板里，弹层关闭后仍然存活。
- **API 钱包（`82431efe`）。** 只改按钮：预检期间保持 `Sign and authorize` / `Confirm removal`，预检状态改为正文里的一行 `<output>`，`Processing…` 占位按钮删除。分阶段弹层保留，因为授权成功后要在弹层里展示、下载并确认保存一次性私钥，结果未知时要显式丢弃本地密钥。
- **金库与质押（`54a65716`）。** 两者用同一套分阶段资金动作状态机（持久化标记、对账、`FundsActionRecoveryHost`）。控制器与状态机未动，只在视图边界转换：页面层的 effect 以「动作 id:结果」为键，每个结局只上报一次。核验成功 → 通知并关闭弹层（金库通知带最终金额、佣金、平仓成本与交易哈希）；拒签或交易所拒绝 → 错误通知并回到复核步骤；状态未知不上报，留在弹层里走 `Verify again`，因为它背后有会锁住后续资金动作的标记。请求期间弹层仍显示进度面板，按钮区为空；质押原先的禁用占位按钮 `Operation in progress` 删除。
- **LiFi 跨链桥。** 未改。`VITE_LIFI_BRIDGE_CREATE_ENABLED` 默认关闭；执行页是由当前页面驱动、可恢复的多笔交易执行跟踪器，不是确认按钮上的进度。

**过程中的发现。**

- 质押的错误说明此前一直渲染为空：`getSafeActionError(code, t)` 把 Lingui 宏写在参数名为 `t` 的普通函数里，宏不会转换它。改为 `msg` 描述符加显式 `translate` 的 `formatStakingActionError`，四条文案补齐五种语言。
- 全量测试里 `rtl-financial-ui-contract` 变红：金库哈希的渲染位置从弹层移到了页面层。除了把断言移到页面层，还给本轮各通知里的金额与哈希补上 `<bdi dir="ltr">`（转账、兑换、充值、提现原先是纯字符串）。说明改成元素后，`funds-action-balances` 与 `spot-swap-modal` 里两条按字符串断言说明的用例变红，改为渲染说明后断言文本与隔离标记。
- 金库页面测试里「第二个动作以同样结果结束也要上报」最初不触发：React Compiler 记忆了整棵树，替身控制器需要自己触发重渲染（`useReducer`）。

## 验证与限制

均为 2026-09-21 在本机对本分支执行。

- 对 `54a65716` 提交前的工作树（与该提交内容一致，另含未提交的文档改动）：`pnpm --filter @gatu/terminal typecheck` 通过；`pnpm --filter @gatu/terminal test` 591 文件通过、1 跳过，6,717 项通过、1 跳过。上一轮全量有 1 项失败（`rtl-financial-ui-contract`，原因见上），修复后重跑得到上述结果。
- `pnpm i18n:extract`：ar、es、fr、hi 各 36 条缺失，zh 5 条，与改动前的基线相同，本轮新增文案没有留下缺失。
- `node --test scripts/ci-workflows.test.mjs` 6 项通过（工作流测试清单新增四个套件）。
- 生产构建：临时工作树 `wt05-build` 检出 `54a65716`（Node 22.15.0，`pnpm install --frozen-lockfile`，两个移动配对开关关闭，无 `.env.local`，用后已删除），`pnpm --filter @gatu/terminal build` 退出码 0；411 个客户端 chunk 无循环静态依赖；包体预算通过；`trade-terminal-page` 126,025 B gzip；运行时启动增量相对基线为移动端 +3,845 B、桌面端 +5,530 B（上一轮 +3,833 B、+5,542 B）。
- 限制：没有在真实页面或真实钱包上验证任何一块；没有执行任何推荐、API 钱包、金库或质押操作。通知的观感、时序与钱包弹窗只能靠人工在测试网验收。

## 后续与替代关系

- 不替代任何记录。
- 待产品负责人决定的事项未变：持久化的待处理提现列表与账户面板入口、D1/D2 取值、交易头部账户模式标签的转圈、推送与开 PR。
- 下一次先查：`docs/confirmation-surfaces.md` 的例外表、`vault-detail-page-outcomes.test.tsx`、`staking-view.test.tsx`。
