<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-dashboard-radius-and-fee-merge",
  "date": "2026-09-29",
  "title": "合并提款手续费分支、金库单组标题去重、仪表盘圆角统一与 Codex 对抗审查",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "pr-review", "docs-governance"],
  "summary": "处理上一轮留下的三项：先把另一会话的 claude/withdrawal-fee-review-bound 以 --no-ff 合并（代码与目录自动合并，三处文档冲突取两边内容），再去掉金库列表单个未分类组与页面标题重复的组标题，最后按用户选定的方案 A 统一仪表盘圆角：画布上的页面面板 12px（rounded-24）加 shadow-raised，面板内卡片、分区、提示与卡片形占位 8px（rounded-16），控件与共享原语不变。改前用无头浏览器实测各页：外层面板有 6/12/16px 三种，卡片 2–14px。随后按用户要求用 Codex gpt-6-astra 只读对抗审查，报 3 项 P2、2 项 P3，全部核实成立并修复：API 钱包列表卡片与骨架、Portfolio 手机端嵌入的交易页账户卡片（用 data-account-card 在 Portfolio 容器内局部改为 8px，交易页保持 14px）、转账卡片 2px、资金费率对比卡片头 rounded-t-12，以及契约测试能被绕过的问题（改为按显式控件例外清单检查，10 种回退场景全部被拦下）。",
  "thread": null,
  "baseCommit": "9aac238e",
  "commits": ["58acbf22", "bbcc3ea2", "a283698a", "a3d6c76d"],
  "sources": [
    { "path": "apps/terminal/src/lib/tests/dashboard-surface-radius-contract.test.ts" },
    { "path": "apps/terminal/src/components/vaults/vaults-list.tsx" },
    { "path": "apps/terminal/src/components/portfolio/portfolio-page.tsx" },
    { "path": "apps/terminal/src/components/api-wallet/api-wallet-list.tsx" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": ".claude/rules/design-tokens.md" },
    { "path": "docs/api-wallet-redesign-notes.md" },
    { "path": "docs/leaderboard-vaults-staking-redesign-notes.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "docs/work-memory/sessions/2026-09-29-withdrawal-fee-review-bound.md" },
    { "path": "CHANGELOG.md" }
  ],
  "supersedes": []
}
-->
# 合并提款手续费分支、金库单组标题去重、仪表盘圆角统一与 Codex 对抗审查

## 背景与范围

同步记录，没有取得可核对的会话 ID。[通知审查后续](2026-09-29-funds-ui-followups.md)结束时留下三项：各页卡片圆角是否统一、金库列表只有一组时组名重复、另一会话的提款手续费分支合入时的文档冲突。用户先要求规划，看过规划后「按建议执行」：圆角选方案 A，单组时隐藏组标题，现在合并手续费分支。实施完成后用户又要求「调用 codex 最新模型来对抗 review 一遍这个修改」。工作在 `.claude/worktrees/funds-ui-followups` 的新分支 `claude/dashboard-followups`（基线 `9aac238e`，即 `claude/from-dev-0928` 当时的末端），完成后快进合并回 `claude/from-dev-0928`，未推送。

## 结论与依据

### 合并提款手续费分支（`58acbf22`）

合并前核对：另一会话「Fail closed when the CCTP withdrawal fee changes at click」空闲，其工作区干净，分支停在 `e890a5a2`（4 个提交，基于 `b67229f2`）；本机另一个忙碌的会话工作在其他项目（print-shop-erp），不涉及本仓库。用 `--no-ff` 合并以保留对方提交哈希（它们被对方的任务记录引用）。`deposit-modal.tsx`、存款路由测试、`funds-action-feedback.ts` 与六个语言目录自动合并；三处文档冲突：

- `CHANGELOG.md`：保留本分支全部条目，把对方新增的「不再因 Circle 转发手续费变化而取消提款」一条放在「提款通知精简」之后；对方那条中文存款/提款条目仍是旧的「everywhere」说法，采用本分支更正后的版本。
- `docs/confirmation-surfaces.md`：两边改了同一表格行；以对方的行为底（含「提现手续费是第 3 条有意的例外」），插回本分支「划转与发送结果不明为常驻警告」一句。
- `docs/funds-dialog-outcome-plan.md`：两边都在「提现成功通知精简」之后追加；先放对方的「同日后续」段落，再放本分支的两节。

`docs/work-memory/INDEX.md` 用 `pnpm memory:index` 重新生成。合并提交的提交信息沿用 git 默认格式并带署名行，事先验证 commitlint 会把它当合并提交忽略。「提现成功通知精简」记录里「手续费变化时失败关闭」的待办已被对方按产品负责人决定改为不设门禁，追加补记指向对方记录。

### 金库单组标题（`bbcc3ea2`）

只有每一行都有官方/用户分类时才会分组；当前数据没有分类，列表永远是一个未分类组，组标题「Vaults / 金库」紧贴页面标题「Vaults / 金库」重复出现，「已存入」「管理中」筛选下也是这个组。改为未分类组不渲染可见标题，分类可用时仍显示「官方金库 / 用户金库」。区块不再用这个标题命名，没有留下悬空的 `aria-labelledby`。

### 仪表盘圆角统一（`a283698a`）

改前在 `9aac238e` 上用无头 Chromium（仓库自带 Playwright，访问 3005 开发服务器，未连接钱包，1440 与 375 宽）实测：本会话窗口未打开，内置浏览器面板处于隐藏状态，页面停在启动占位，所以改用无头浏览器；开发服务器此前被应用停掉，重新启动。

| 页面 | 外层面板（桌面 / 手机） | 阴影 | 面板内卡片 |
| --- | --- | --- | --- |
| 投资组合、质押 | 6px / 6px | 无 | 6px（质押内一张卡 4px） |
| Earn | 12px / 12px | 无 | 摘要 12px，其余 8px |
| 金库列表、金库详情 | 6px / 6px | 有 | 6px |
| 资金费用、委托、成交历史 | 6px / 6px | 有 | — |
| 排行榜、资金费率对比 | 12px / 手机直角整页 | 有 | 手机卡片 6px |
| 推荐 | 16px / 16px | 有 | 10px（桌面 12px） |
| API 钱包 | 16px / 手机直角整页 | 页面专用阴影（值同 `shadow-raised`） | 10–12px |

设计交付的 token 文件不在仓库，文档没有逐页规定，用户在规划中选了方案 A：画布上的页面面板 `rounded-24` 加 `shadow-raised`；面板内卡片、分区、提示与卡片形占位 `rounded-16`；卡片内嵌的框不比卡片圆；控件与共享 `@gatu/ui` 原语保持原样；三个手机直角整页只在桌面加 `rounded-24`；弹窗 16px、菜单 12px 不变。18 个组件 49 处替换，规则写入 `.claude/rules/style-ui-guide.md`，`design-tokens.md` 的圆角一节改为指向它；推荐与 API 钱包原先按设计交付是 16px，偏离交付稿在两份重设计说明里追加更正。

### Codex 对抗审查与修复（`a3d6c76d`）

命令：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"medium"'`（codex-cli 0.154.0，模型缓存当天刷新，`gpt-6-astra` 优先级最高），会话 `01a0ed86-0102-7da1-b0cc-db7718c48b05`，范围 `9aac238e..a283698a`。无 P0/P1，报 3 项 P2、2 项 P3，逐条核实均成立：

- **P2 Portfolio 手机端账户卡片 14px。** Portfolio 在 12px 面板里直接嵌入交易页的 `MobilePositionsView`，持仓、委托、成交、委托历史、资金费、三种 TWAP 卡片都是 `rounded-[14px]`（交易页设计交付值），内层比外层圆。交易页不在本次范围，所以给这 8 个卡片根元素加 `data-account-card`，由 Portfolio 的容器用 `[&_[data-account-card]]:rounded-16` 局部改为 8px，交易页保持 14px。同一视图里只在 Portfolio 使用的转账卡片原为 `rounded-xs`（2px），直接改为 `rounded-16`。
- **P2 API 钱包列表。** `api-wallet-list.tsx` 的已授权钱包卡片与手机加载骨架仍为 `rounded-24`（只在连接且有授权钱包时出现，改前实测没覆盖到），改为 `rounded-16`。复查时另发现资金费率对比手机卡片的头部按钮仍是 `rounded-t-12`，改为 `rounded-t-16`。
- **P2 契约测试能被绕过。** 原测试只收集含数字圆角的字符串、用最小数量守卫、把 ≤4px 一律当控件放行，且识别不了 `rounded-t-*`、`!rounded-*`、任意值和 `cn()` 拆开的字符串。改为：自动扫描这些页面目录下所有非弹窗组件；带 `bg-surface` 且无描边的字符串必须恰好是 `rounded-24` 且带阴影（包括没有圆角的，防止删除圆角）；其余所有圆角必须是 `rounded-16` 或 `rounded-t-16`，除非在逐条写明理由和出现次数的控件例外清单里（清单项不再存在也会失败）；三个手机直角整页单独核对基础类与桌面类；账户卡片核对标记与 Portfolio 覆盖；禁止用模板字符串或单引号写圆角类名。新测试立即查出 Portfolio 的 `AccountPanelSkeleton`（填满已裁切面板的占位，无圆角），登记为例外。
- **P3 CHANGELOG 旧卡片范围写错。** 原写 6–12px，实际 2–14px（质押链接卡 4px、转账卡 2px、账户卡 14px），已更正并说明交易页卡片不变。
- **P3 记录里的已取代待办。** 「提现成功通知精简」的手续费待办与通知审查记录的「圆角统一待决」追加补记。

## 验证与限制

均在该 worktree（锁定依赖，`tsc` 5.7.2），2026-09-29，本地 macOS。浏览器检查是无头 Chromium 以脚本读取计算样式，不是真人查看。

- 合并：typecheck 退出码 0；存款、CCTP、提款、资金锁、确认面、多语言与错误文案相关 35 个文件 961 项通过；缺译数仍为 ar/es/fr/hi 各 44、zh 3。
- 金库标题：`vaults-view.test.tsx` 15 项通过，把 `vaults-list.tsx` 换回改动前版本时「单组不重复标题」一条失败；`vaults-list.pw.ts` 8 项通过（新增断言列表内没有组标题）；typecheck 退出码 0。
- 圆角统一：契约测试 4 项在改动前的组件上全部失败；页面与契约相关 58 个文件 763 项通过；`vaults-list.pw.ts` 与 `referral-code-card.pw.ts` 共 26 项通过；typecheck 退出码 0。
- Codex 修复：新契约 6 项通过；逐一复现 10 种回退（删除三个面板圆角、面板改 `rounded-[20px]`、面板去掉阴影、排行榜骨架退回 12、金库卡片改 4px、卡片头退回 `rounded-t-12`、卡片加响应式 24、提示改 `!rounded-[10px]`、账户卡片去掉标记、模板字符串绕过），全部被拦下，文件恢复后逐一核对；相关 34 个文件 577 项通过；typecheck 退出码 0。
- 全量单测第一次（`a283698a`，与 Codex 审查同时运行，耗时 509 秒）：636 个文件中 6 个失败、7 项失败，均为超时或计时相关断言（图表订阅、TradingView 摘要、HIP-3 声明、手机配对弹窗与路由、持仓面板预加载），单独重跑这 6 个文件 85 项全部通过，与改动无关。第二次在 `a3d6c76d` 上、机器空闲时运行：635 个文件通过、1 个跳过，7,888 项通过、1 项跳过，133 秒，退出码 0。
- 合并后复测：`claude/from-dev-0928` 快进到 `a3d6c76d` 后，用同一无头脚本在 3005 开发服务器上测 12 个路由（1440 与 375 宽）：所有直接在画布上的面板都是 12px 加阴影，面板内卡片、分区与提示都是 8px；仍为 4px 的是搜索框、分段筛选等控件和质押页的共享 `Alert`，10px 的是 API 钱包的输入与选项。Portfolio 手机端的账户卡片在未连接状态下不出现，改用在账户区容器内插入带 `data-account-card` 与 `rounded-[14px]` 的元素测得 8px，同一元素放在容器外为 14px。
- 未做：真机与屏幕阅读器检查；有持仓、有授权钱包等已连接状态的真实页面（只有源码契约与夹具覆盖）；设计交付稿核对（token 文件不在仓库）。

## 后续与替代关系

- 未改：质押页画布上的共享 `Alert` 原语仍是 4px；推荐操作弹窗里的提示仍是 `rounded-20`（弹窗规则要求 `rounded-16`）；交易页手机账户卡片保持 14px；API 钱包的输入、选项和按钮保持 10px。是否一并统一需要单独决定。
- 部分更新[通知审查后续](2026-09-29-funds-ui-followups.md)、[通知文案审查](2026-09-29-notification-copy-review.md)与[提现成功通知精简](2026-09-29-withdraw-toast-copy.md)的待办（追加补记），不整体替代；合并了[提现手续费记录](2026-09-29-withdrawal-fee-review-bound.md)所在分支。
