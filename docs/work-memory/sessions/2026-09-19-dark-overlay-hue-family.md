<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-19-dark-overlay-hue-family",
  "date": "2026-09-19",
  "title": "暗色浮层与遮罩改为终端色相，并修复语言菜单禁用文字",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "docs-governance"
  ],
  "summary": "实测暗色下菜单 bg-overlay 仍是共享库紫灰 #292b33（色相 228°）、遮罩仍是藏蓝 #000626，而终端基色是青黑 #0f1a1f（199°）；改为等亮度的 #212d33 与 #03090ca8，语言菜单禁用文字由 12% 白改为 60% 白（1.46:1 → 6.09:1）。圆角、字体、菜单皮肤重复等其余审查项未处理。",
  "thread": null,
  "baseCommit": "0af67e47722409bb350f61500d58ab0f0bac30c1",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/styles.css" },
    { "path": "apps/terminal/src/lib/tests/modal-surface-contract.test.ts" },
    { "path": ".claude/rules/design-tokens.md" },
    { "path": "docs/work-memory/sessions/2026-09-17-surface-tokens-touch-feedback.md" }
  ],
  "supersedes": []
}
-->
# 暗色浮层与遮罩改为终端色相，并修复语言菜单禁用文字

## 背景与范围

用户在 `origin/main`（`d6cc4f3e`）的开发服务器上对比语言菜单和设置弹窗，问为什么暗色模式下两者背景色不一样、有哪些不规范设计。先做只读审查，再按用户决定从 `origin/dev`（`0af67e47`）开分支 `claude/overlay-surface-tint`，在 worktree `.claude/worktrees/worktree-01` 修复审查清单的第 1、2 项。本记录为同步记录；任务标识未取得。

## 结论与依据

审查实测（暗色、1440×900，浏览器计算样式）：

- 语言、More、价格分组、高级订单菜单和桌面市场选择器用 `bg-overlay`，实测 `rgb(41,43,51)`，色相 228°；设置、杠杆、保证金、账户模式、资产信息弹窗用 `bg-modal`，实测 `rgb(15,26,31)`，色相 199°。令牌不同是 `modal-surface-contract` 钉住的既有契约；色相不同是因为终端只把 base、raised、modal、alternate 覆盖成青黑，`--bg-overlay` 与 `--fill-overlay` 仍是共享库为藏蓝基色 `#12131a` 调的默认值。
- 遮罩 `rgba(0,6,38,.66)` 叠在页面上得到 `rgb(5,13,36)`，弹窗打开时页面发蓝。
- 语言菜单禁用项 `Reset` 用 `--text-disabled`（12% 白），对比度 1.46:1；`design-tokens.md` 规定该值只用于禁用填充与描边，文字应走 60% 白的 `text-fg-disabled`。

采用的方案：

- `--bg-overlay` 暗色改为 `#212d33`（hsl 199° 22% 16%）。相对亮度 0.02439，与旧值 0.02438 一致，因此对页面的抬升对比度（1.25）、白字对比度（14.1:1）和所有依赖旧亮度的结论不变，只换色相。
- `--fill-overlay` 暗色改为 `#03090ca8`，alpha 不变；遮罩下页面亮度 0.00426（旧 0.00441），压暗强度不变。
- `--language-settings-disabled` 暗色改为 `var(--icon-neutral)`，与 `text-fg-disabled` 的桥接一致。
- 只改终端 `styles.css` 的 `.dark` 块；共享库默认值与浅色主题未动。`modal-surface-contract` 新增用例同时钉住共享默认值与终端覆盖值。

未采用：把模态框也改亮以恢复“层级越高越亮”。这会改变 AGENTS.md 钉住的“终端、图表、阻塞弹窗同一连续背景”，需要单独的设计决策。

## 验证与限制

基线 `0af67e47`，2026-09-19，worktree-01 独立安装依赖。

- `pnpm exec biome check`（契约测试与 `styles.css`）通过；`pnpm --filter @gatu/terminal typecheck` 通过。
- 聚焦 8 个套件 142/142；`pnpm --filter @gatu/terminal test` 全量 575 文件 6368 通过、1 跳过。
- 浏览器实测（worktree-01 开发服务器 3026，页脚 `v0.1.0+0af67e47`，暗色）：五个浮层均为 `rgb(33,45,51)`，设置弹窗 `rgb(15,26,31)`，遮罩 `rgba(3,9,12,.66)`，`Reset` 禁用态 `rgba(255,255,255,.6)`、对比度 6.09:1；截图确认页面不再发蓝。
- 未覆盖：浅色主题未改也未复测；提示气泡、toast、选中指示器只由令牌值保证，未逐个截图；移动端与 Playwright 套件未运行；TradingView iframe 的 `#1D1E26` 抬升色不受本次影响，也未调整。
- 浅色 `--language-settings-disabled: #c6cfd9` 在白底上同样偏淡，但它是契约钉住的设计稿精确值，本次未动。

## 后续与替代关系

审查清单未处理的项：弹层圆角四种取值且用 `rounded-[Npx]` 绕过 `--radius-factor`（全仓 242 处、81 文件）；弹层字体 Inter 与 IBM Plex Sans 混用；模态框边框有无不一；`--language-settings-shadow` 一次性令牌；`text-[Npx]` 任意字号 249 处、59 文件；语言菜单 10 行 `!important` 后代选择器及另外 4 份近似菜单皮肤拷贝；`market-close-*` 令牌被 66 个文件当通用设计语言；`global-settings-modal.tsx` 嵌套三元；桌面市场选择器是 960px 的 dialog 却用“轻量浮层”表面，移动端同组件用 `bg-modal`。下次先查 `.claude/rules/design-tokens.md` 的 Terminal dark hue family 注记与 `modal-surface-contract.test.ts`。
