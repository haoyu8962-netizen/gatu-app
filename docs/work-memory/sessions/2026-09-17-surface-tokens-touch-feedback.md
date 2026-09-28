<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-surface-tokens-touch-feedback",
  "date": "2026-09-17",
  "title": "非模态表面改用 bg-surface 并补齐移动端按压反馈",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "docs-governance"
  ],
  "summary": "盘点 bg-modal 语义误用（16 文件 36 处，终端两主题下视觉零变化）与 6 处无按压反馈的可点击表面；换为 bg-surface、加共享 active 类，契约测试与设计规则同步；双色卡结构保留并记录。",
  "thread": null,
  "baseCommit": "3a80b36081648b8bb3a8b5efa1087fd24c69fcec",
  "commits": ["0ad17aea"],
  "sources": [
    { "path": ".claude/rules/design-tokens.md" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": "apps/terminal/src/lib/tests/modal-surface-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/touch-press-feedback-contract.test.ts" }
  ],
  "supersedes": []
}
-->
# 非模态表面改用 bg-surface 并补齐移动端按压反馈

## 背景与范围

用户在移动端持仓卡上询问背景色是否合理，并要求对同类问题全仓盘点、一并规划修改。分支 `claude/surface-tokens-touch-feedback`（自 `origin/main` 3a80b360），worktree `.claude/worktrees/main-dev`。

盘点结果（`apps/terminal/src`，2026-09-17）：

- `bg-modal` 用在非模态表面：8 张移动端列表卡（持仓、订单、TWAP、TWAP 历史、TWAP 成交、交易历史、资金费、订单历史）、2 个桌面表头、约 26 个面板内筛选触发器/输入框/复选框，合计 16 文件 36 处。终端浅色 `--bg-modal` 与 `--bg-raised`（`bg-surface`）均为 `#ffffff`，深色均为 `#0f1a1f`，替换后外观不变；共享 `@gatu/ui` 默认值不同（模态 `#292b33`、表面 `#1d1e26`），但终端覆盖了两者。约 40 处模态、抽屉、对话框及其内部控件的用法合规，保留；`modal-surface-contract` 对 token-selector-popup 与 QR 扫描器的钉子未动。
- 可点击但无按压反馈：`MobileDisclosureHeader`（5 个页签卡共用的整卡按钮）、`mobile-trade-summary-view`、`trade-control-button-view`（只有 hover 边框）、`trade-size-unit-view`、`order-summary`（只有 hover 透明度）、`token-selector-row` 整行覆盖按钮。
- 双色卡：`MobileDisclosureHeader` 的 `bg-market-close-card`（浅色 `#f7f9fb`，深色 6% 白）叠在卡面上，展开后为"灰表头 + 白内容"。对比度核算：绿色盈亏 5.06:1、红色 4.86:1、次级标签约 4.8:1，均达标。

## 结论与依据

- 规则：`design-tokens.md` 的 `bg-modal` 条目补充"仅模态/抽屉及其内部控件；列表卡、表头、面板内触发器用 `bg-surface`"；`style-ui-guide.md` 新增"Touch feedback"节，并记录双色卡结构为有意保留。
- 代码：16 个非模态文件整体 `bg-modal` → `bg-surface`（36 处）；新增 `components/ui/touch-press.ts` 导出 `TOUCH_PRESS_CLASS`（`active:bg-fill-weak` + 120 ms）与 `TOUCH_PRESS_FADE_CLASS`（`active:opacity-60`）；六处可点击表面各自加上对应类。
- 契约：`modal-surface-contract.test.ts` 新增用例断言 16 个非模态文件不含 `bg-modal`；新增 `touch-press-feedback-contract.test.ts` 断言六处含 `cursor-pointer` 与对应 `active:` 标记。

## 验证与限制

- Biome（25 个改动文件）与 `pnpm --filter @gatu/terminal typecheck` 通过。
- 单测：modal-surface-contract（8，含新增非模态文件用例）、touch-press-feedback-contract（7）、i18n-reactivity-contract（126）、mobile-data-presentation-contract（12）、mobile-account-view（19）、trade-form-compact-fields（5）、orderbook-color-contrast（16）：193/193。
- Playwright：`mobile-trade-all-orders.playwright.config.ts` 29/29（2.0 min）；共享配置 trade-panel-layout、trade-panel-all-orders、orderbook-layout、desktop-grid-layout 19/19（1.1 min）；`account-actions` 24/24（1.1 min）。
- 内置浏览器（开发服务器 3016，用户钱包会话，390 px，浅色）：持仓卡外壳计算背景 `rgb(255,255,255)`（`bg-surface`，与改前一致），表头 `rgb(247,249,251)`，整卡按钮带 `active:bg-fill-weak duration-[120ms]`；页面无肉眼变化。深色主题与真机触屏按压未截图（`:active` 无法被截图捕获），仅由契约测试与 token 值保证。

## 后续与替代关系

- 双色卡若要改为"透明表头 + 展开时分隔线"，需设计决策后单独处理。
- 下次先查 `.claude/rules/style-ui-guide.md` Touch feedback 节与两份契约测试。
