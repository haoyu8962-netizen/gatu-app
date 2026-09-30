<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-notice-radius-and-visual-rule-guard",
  "date": "2026-09-29",
  "title": "剩余圆角项的处理，以及视觉规则「写了却没人守」的防复发措施",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "docs-governance"],
  "summary": "上一轮圆角统一后剩下三项：质押页的共享 Alert 是 4px、推荐操作弹窗的提示是 10px、交易页手机卡片 14px 与 API 钱包控件 10px。盘点发现问题更普遍：41 个弹窗文件里 21 个提示框只有 4 个符合样式指南早已写明的「弹窗提示 rounded-16」，规则只有文字、没有测试，违例一直在累积。处理：Alert 原语（只有质押页和质押弹窗在用）改为 rounded-16；仪表盘页面自己的三个弹窗（推荐、API 钱包、金库）5 处提示改为 rounded-16；交易页弹窗 12 处提示不在本次范围，列为待决例外；交易页 14px 卡片与 API 钱包 10px 控件写明为有意例外。防复发：新增弹窗提示圆角契约（自动扫描全部弹窗文件，待决例外逐条列次数，Alert 原语一并检查），样式指南新增「Checking a visual rule」检查清单，把无头测量脚本收进仓库，AGENTS.md 加指针并把两个圆角契约加入回归清单。",
  "thread": null,
  "baseCommit": "75a88aec",
  "commits": ["3a05d9af"],
  "sources": [
    { "path": "apps/terminal/src/lib/tests/dialog-notice-radius-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/dashboard-surface-radius-contract.test.ts" },
    { "path": "apps/terminal/tests/browser/dashboard-surface-audit.mjs" },
    { "path": "packages/ui/src/alert.tsx" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": "AGENTS.md" },
    { "path": "CHANGELOG.md" },
    { "path": "docs/work-memory/sessions/2026-09-29-dashboard-radius-and-fee-merge.md" }
  ],
  "supersedes": []
}
-->
# 剩余圆角项的处理，以及视觉规则「写了却没人守」的防复发措施

## 背景与范围

同步记录，没有取得可核对的会话 ID。[合并与圆角统一记录](2026-09-29-dashboard-radius-and-fee-merge.md)结束时留下三项待决：质押页的共享 `Alert` 仍是 4px；推荐操作弹窗里的提示仍是 10px（样式指南要求弹窗提示 `rounded-16`）；交易页手机卡片保持 14px、API 钱包的输入与按钮保持 10px。用户要求「继续规划处理这些没处理的事情，并且记录到文档确保下次不会出现这种问题」。工作在 `.claude/worktrees/funds-ui-followups` 的 `claude/dashboard-followups`（基线 `75a88aec`），完成后快进合并回 `claude/from-dev-0928`，未推送。

## 结论与依据

### 盘点

- `@gatu/ui` 的 `Alert` 把 `rounded-8`（4px）写死在组件基础类里；整个应用只有质押页和质押弹窗使用它（12 处），没有自定义覆盖。
- 扫描 41 个弹窗、抽屉、面板文件里带语义底色（`bg-*-soft`）的提示：21 个，只有 4 个是样式指南「Dialog content blocks」要求的 `rounded-16`；其余 17 个是 2px、4px、5px 或 10px。仪表盘页面自己的弹窗 5 个（推荐 1、API 钱包 2、金库 2），交易页弹窗 12 个（连接、兑换 5、逐仓保证金、市价平仓、止盈止损、发送、划转 2）。

### 为什么会反复出现

- **规则只有文字，没有测试。** 弹窗提示 `rounded-16` 早已写在样式指南里，但没有任何测试守着，17 处违例一直累积，直到逐个人工审查时才被发现。
- **验证只覆盖默认状态。** 上一轮在未连接钱包的默认页面上测量，漏掉了只在有授权钱包时出现的 API 钱包列表，以及 Portfolio 从交易页嵌入的账户卡片，是 Codex 审查才找到的。
- **契约测试靠推断而不是清单。** 第一版圆角契约把 4px 以下一律当控件、只收集带数字圆角的字符串，改错也能通过。
- **待决事项只写在回复里。** 例外和待决项没有落到测试清单和任务记录，下一轮只能靠人再找一遍。

### 处理（`3a05d9af`）

- `Alert` 原语基础类改为 `rounded-16`：它在页面和弹窗里都承担提示的角色，统一后质押页与质押弹窗的提示一起变为 8px；关闭按钮等控件不变。
- 推荐、API 钱包、金库三个弹窗的 5 处提示改为 `rounded-16`。
- 交易页弹窗的 12 处提示不在用户列出的范围内（AGENTS.md「不改变请求范围之外的界面」），不改，作为待决例外写进契约，等设计决定。
- 交易页手机账户卡片 14px（手机交易页设计交付值，Portfolio 通过 `data-account-card` 局部改为 8px）、API 钱包自己的输入、选择和按钮 `rounded-20`（设计交付值）、Market Close / 资金类弹窗的交付卡片：写进样式指南「Dashboard page gutters」作为有意例外，并在圆角契约的例外清单里写明理由。

### 防复发措施

- `dialog-notice-radius-contract.test.ts`：自动扫描 `components` 下所有名字含 modal、dialog、drawer、sheet 的组件，带语义底色的提示必须恰好是 `rounded-16`；12 处待决例外逐条写明文件、特征字符串和次数，修掉一处而不更新清单也会失败；同时检查 `Alert` 原语的基础圆角。
- `.claude/rules/style-ui-guide.md` 新增「Checking a visual rule」：视觉规则写进指南的同一次改动里要有契约测试；例外逐条列理由和次数，并用变异验证测试确实会失败；覆盖未连接和已连接有数据、加载、空、出错、页面打开的弹窗、从其他界面嵌入的组件；除了查类名，还要测渲染后的计算样式，并说明哪些状态没测到；待决项进例外清单和任务记录，不能只写在回复里。
- `apps/terminal/tests/browser/dashboard-surface-audit.mjs`：把本轮临时写的无头测量脚本收进仓库，按嵌套深度列出各仪表盘页面的面板、卡片、提示圆角，浏览器面板隐藏时也能用。
- `AGENTS.md`「Trading terminal visual contract」加一条指针，并把两个圆角契约加入该组的回归命令。

## 验证与限制

均在该 worktree（锁定依赖），2026-09-29，本地 macOS。

- `pnpm typecheck`（hl-react、ui、terminal）退出码 0；Biome 检查改动的 5 个文件通过。
- 弹窗提示契约 3 项通过；逐一验证三种回退都会失败：推荐弹窗提示退回 `rounded-20`、修掉一处待决例外却不更新清单、`Alert` 退回 `rounded-8`；文件恢复后核对无误。
- 两个圆角契约、弹窗外观契约、推荐/API 钱包/金库弹窗、质押组件等 15 个文件 126 项通过。
- 全量 `pnpm --filter @gatu/terminal test`（`3a05d9af`）：636 个文件通过、1 个跳过，7,891 项通过、1 项跳过，215 秒，退出码 0。
- 测量脚本在开发服务器停止时按预期报「连接被拒」退出。快进合并到 `claude/from-dev-0928` 并重启开发服务器后，用仓库里的 `dashboard-surface-audit.mjs` 测 12 个路由（1440 与 375 宽）：质押页的信息提示变为 8px；仍为 4px 的只剩搜索框、分段筛选和表格行加载占位这些控件，均在例外清单内。弹窗里的提示需要打开弹窗、多数还要连接钱包，脚本不覆盖，只有源码契约。
- 未做：真机与屏幕阅读器检查；交易页弹窗 12 处提示的设计决定；`alert-global` 原语（应用中未使用）未改。

## 后续与替代关系

- 待决：交易页弹窗 12 处提示是否统一为 `rounded-16`（改动后需同时从契约的待决清单删除对应条目）。
- 部分延续[合并与圆角统一记录](2026-09-29-dashboard-radius-and-fee-merge.md)的「后续」，不替代它。
