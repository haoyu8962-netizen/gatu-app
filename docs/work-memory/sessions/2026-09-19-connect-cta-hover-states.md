<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-19-connect-cta-hover-states",
  "date": "2026-09-19",
  "title": "Connect Wallet 按钮悬停态：去掉整体淡出，补上暗色面板按钮的悬停反馈",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "docs-governance"
  ],
  "summary": "头部 Connect Wallet 同时用 hover:bg-action-hover 和 hover:opacity-90，暗色下两者抵消（#edeef2 → 合成约 #e7e8e9，反而略暗）且 opacity 不在过渡列表里会跳变；订单面板同名按钮暗色下静止与悬停填充同为 6% 白。改为只走 action 令牌、过渡含 scale，面板暗色悬停用 fill-press（12% 白）。暗色下两个同名按钮一实心一幽灵的层级差异未动，待设计决定。",
  "thread": null,
  "baseCommit": "e837e8ce",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/header/wallet-cta-view.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-trade-cta-frame-view.tsx" },
    { "path": "apps/terminal/src/lib/tests/connect-cta-state-contract.test.tsx" },
    { "path": "docs/work-memory/sessions/2026-09-19-popup-skin-and-dialog-chrome.md" }
  ],
  "supersedes": []
}
-->
# Connect Wallet 按钮悬停态：去掉整体淡出，补上暗色面板按钮的悬停反馈

## 背景与范围

用户在浅色主题下选中头部 Connect Wallet 按钮，问颜色有没有问题。先只读检查并报告 5 项，用户随后要求在 worktree `.claude/worktrees/worktree-01`（分支 `claude/overlay-surface-tint`）修掉其中第 1、2、3 项和重复类。本记录为同步记录；任务标识未取得。

## 结论与依据

检查实测（开发服务器 3026，浏览器真实悬停后读计算样式）：

- 静止态没有问题：浅色 `#15171e` 底白字 17.9:1，暗色 `#edeef2` 底 `#08090d` 字约 17:1，均为 `bg-action` / `text-on-action` 令牌；浅色下头部与订单面板两个按钮同色。
- 头部按钮悬停实测 `background-color` 变为 `--action-hover` 的同时 `opacity: 0.9`。暗色 `--action-hover` 是 `#ffffff`（意图变亮），乘 90% 叠在 `#0f1a1f` 上约为 `rgb(231,232,233)`，比静止态 `rgb(237,238,242)` 略暗，反馈几乎不可见且方向与令牌相反；`opacity` 还连文字一起变淡。过渡属性为 `color, background-color, border-color`，不含 `opacity` 和 `scale`，所以淡出与按压缩放都是跳变。
- 订单面板按钮暗色静止 `bg-fill-weak`、悬停 `bg-fill-hover`，两个令牌暗色都是 `#ffffff0f`，实测悬停前后同为 `rgba(255,255,255,0.06)`。
- 同一类串里并存 `rounded-8` 与 `rounded-[10px]`、`shadow-raised` 与 `shadow-none`，属于 `cn()` 修复前靠样式表顺序取胜的遗留。

采用的方案：

- `wallet-cta-view.tsx`：删除 `hover:opacity-90`、`active:opacity-80` 和被覆盖的 `rounded-8`、`shadow-raised`；悬停与按压只用 `bg-action-hover` / `bg-action-active`，并加 `not-data-disabled` 守卫，避免禁用态与悬停态同特异度时靠顺序决定；过渡列表加入 `scale`；`rounded-[10px]` 改 `rounded-20`、`text-[13px] leading-[18px]` 改 `text-2sm`，计算值不变，棘轮基线相应降为 240 / 227。
- `ctaConnectDark`：暗色悬停改 `bg-fill-press`（`#ffffff1f`，12% 白），与共享菜单皮肤的悬停色同值。
- 新增 `connect-cta-state-contract.test.tsx`：断言头部按钮无任何 `opacity` 类、过渡含 `scale`、只有一个圆角类且无阴影类，以及面板按钮暗色静止与悬停令牌解析出的值不同。

未处理：暗色下头部按钮是实心近白、面板按钮是 6% 白幽灵按钮（来自 `8c4d8e8e` 的品牌改版，判断为有意设计），同一操作层级相反；三处 Connect 按钮三种写法、圆角 10px / 12px 不一。均需设计决定。

## 验证与限制

- 浏览器实测（3026，修复后）：浅色头部 `rgb(21,23,30)` → 悬停 `rgb(50,54,61)`，`opacity` 保持 1；暗色头部 `rgb(237,238,242)` → `rgb(255,255,255)`，`opacity` 1；暗色面板 `rgba(255,255,255,0.06)` → `rgba(255,255,255,0.12)`；浅色面板悬停仍为 action 色 90% 透明度，未改。静止态圆角 10px、字号 13/18、无阴影，与修复前一致。暗色静止值是把指针移开后重读的，首次读数时指针仍停在按钮上。
- 自动检查：Biome、`pnpm typecheck`、`memory:index` / `memory:check` / `memory:test` 通过；聚焦 5 个套件 64/64。`pnpm --filter @gatu/terminal test` 全量 577 文件通过、1 文件失败：`portfolio-overview.test.tsx` 的一个权益断言得到 `$0.00`。该文件单独重跑时间歇失败（本 worktree 约 12 次中 2 次，每次失败的用例不同），在未改动的 `origin/main` worktree 连跑 20 次未复现。定位为夹具竞态而非本次改动：`getPortfolioQueryStatus` 把 `age < 0` 判为 stale，而测试 mock 的 `dataUpdatedAt` 在组件取 `now` 之后才调用 `Date.now()`，跨毫秒时 age 为 −1。本次改动不涉及 portfolio 代码，未在此修复，已另行标记。
- 按压态（`:active`）无法用悬停工具触发，只由类串与测试保证。移动端头部按钮（`MobileWalletCtaView`，走 `buttonVariants`）未改也未测。

## 后续与替代关系

- 待设计决定：暗色下面板 Connect Wallet 是否改实心；三处 Connect 按钮是否收敛为一个变体并统一圆角。
- 下次先查 `connect-cta-state-contract.test.tsx` 与 `.claude/rules/style-ui-guide.md`。
