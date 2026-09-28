<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-mobile-toolbar-chip-unification",
  "date": "2026-09-18",
  "title": "移动端账户标签筛选芯片统一：同一规格、占位式文案、TWAP 子视图行同高",
  "kind": "task",
  "status": "recorded",
  "summary": "逐标签实测发现持仓用 Dropdown 芯片（26 px、内边距 9、自适应宽）、历史类用 Select（27 px、内边距 6、固定 96/112 px 宽、「All …」文案）、TWAP 子视图行 44 px；按用户决定抽共享芯片类（27 px、7 px 圆角、9 px 内边距、自适应宽）套到六个标签，历史类改为「Type / Direction / Role / Status」占位式文案，TWAP 子视图行改 36 px 并用 before 伪元素保住 44 px 热区。Market 筛选与余额工具栏另立任务。",
  "topics": [
    "docs-governance"
  ],
  "thread": null,
  "baseCommit": "707657d5",
  "commits": ["6a96f9b7"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/mobile/mobile-filter-chip.ts" },
    { "path": "apps/terminal/src/components/trade/positions/position-filter-toolbar.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-orders-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-history-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-funding-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-orders-history-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/twap/twap-subview-tabs.tsx" }
  ],
  "supersedes": []
}
-->
# 移动端账户标签筛选芯片统一：同一规格、占位式文案、TWAP 子视图行同高

## 背景与范围

工具栏密度调整后，用户要求 review 各标签工具栏是否一致。无头 390 px 逐标签实测（未登录，控件形态与登录态相同）：

| 标签 | 行高 | 控件高 | 形态 | 文案 | 宽度 | 内边距 |
|---|---|---|---|---|---|---|
| 持仓 | 36 | 26 | `Dropdown` 芯片 | Direction / Margin | 自适应 | 9 px |
| 委托 | 36 | 27 | `Select` | Type / Direction | 自适应 | 9 px |
| 成交历史 | 36 | 27 | `Select` | All types / All Directions / All roles | 固定 96 px（截断成「All Directi…」） | 6 px |
| 资金费用 | 36 | 27 | `Select` | All Directions | 固定 112 px | 6 px |
| 委托历史 | 36 | 27 | `Select` | All types / All Directions / All statuses | 固定 96 px | 6 px |
| TWAP | 44 | 44 | 子视图标签 | Current / History / Fill History | — | — |
| 余额 | 无工具栏 | | | | | |

官方各标签均为短占位式文案（Side / Type / Market / Role），行高一致。用户决定先做三条纯样式收敛：共享芯片规格、占位式文案、TWAP 子视图行同高；Market 筛选与余额工具栏属功能补齐，另立任务。分支 `claude/surface-tokens-touch-feedback`，基线 707657d5。

## 结论与依据

- 新增 `mobile-filter-chip.ts` 导出 `MOBILE_FILTER_CHIP_CLASS`：27 px 高、7 px 圆角、1 px `market-close-stroke-card` 边、`bg-surface`、9 px 内边距、自适应宽、`after:h-11` 热区、`[&>*]:truncate`。持仓的两个 `Dropdown`、委托的两个 `Select`、成交历史 / 资金费用 / 委托历史的 `filterTriggerClassName` 全部改用它；历史类 `Select` 的固定 `w-24` / `w-28` 改为 `w-auto`。
- 历史类「All …」文案改为占位式：`All types` → `Type`、`All Directions` → `Direction`、`All roles` → `Role`、`All statuses` → `Status`；控件的 sr-only `label` 不变，选中非全部时仍显示选中值。
- `twap-subview-tabs.tsx` 移动端行 `h-11` → `h-9`，触发器 `min-h-11` 改为 `h-9 min-h-0` 加 `before:` 伪元素 44 px 热区（`after:` 已被下划线占用）。
- 测试同步：`mobile-history-cards`（文案与 `selectOption` 目标）、`mobile-twap-card`（`before:h-11`）、`mobile-position-filter-row`（芯片 `!h-[27px]`）。

## 验证与限制

- 改后逐标签实测：持仓、委托、成交历史、资金费用、委托历史、TWAP 行高均 36 px；筛选芯片均 27 px、圆角 7、边 1、内边距 9，文案 Type / Direction / Role / Status / Margin，宽度随文案自适应，不再截断。
- 9 个测试文件 216 用例通过；typecheck、Biome 通过。未做真机验收。Market 筛选、余额工具栏未做。

## 后续与替代关系

- 补充 `2026-09-18-mobile-account-toolbar-density.md`；不替代任何记录。
