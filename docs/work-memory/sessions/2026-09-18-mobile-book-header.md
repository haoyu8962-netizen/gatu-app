<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-mobile-book-header",
  "date": "2026-09-18",
  "title": "移动端订单簿头部：36 px 芯片行、单位下拉、价差并入列头、列头带单位",
  "kind": "task",
  "status": "recorded",
  "summary": "实测 390 px 下我们订单簿头部到首档占 111 px（60 px 头部行 + 27 px 价差行 + 24 px 列头），官方 46 px；单位切换是 44 px 描边按钮、档位是 30 px 强边下拉，两者与新统一的 27 px 筛选芯片是三套样式。按用户决定四条一起做：头部行改 36 px 芯片行（档位左、单位右）、单位改为下拉、价差并入列头行、列头显示当前单位。",
  "topics": [
    "docs-governance"
  ],
  "thread": null,
  "baseCommit": "6a96f9b7",
  "commits": ["62500870"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/mobile/mobile-book-view.tsx" },
    { "path": "docs/orderbook-layout.md" }
  ],
  "supersedes": []
}
-->
# 移动端订单簿头部：36 px 芯片行、单位下拉、价差并入列头、列头带单位

## 背景与范围

用户选中市场页 Order Book 标签的头部（`mobile-book-view.tsx` 的单位按钮与档位下拉）要求 review。无头 390 px 实测：

| 项目 | 我们（改前） | 官方 |
|---|---|---|
| 头部行高 | 60 px（`py-2` + 44 px 按钮） | 31 px |
| 单位控件 | 「HYPE ⇄」`Button outline` 75×44，弱边、投影 | 「HYPE ▾」下拉，右对齐 |
| 档位控件 | 「0.001 ▾」`Dropdown sm` 82×30，强边、`bg-background`、`font-mono` 包裹 | 「0.001 ▾」下拉，左对齐 |
| 价差行 | 独立 27 px 行 | 无 |
| 列头 | `TOTAL / PRICE / PRICE / TOTAL` 大写 11 px | `Total (HYPE) / Price / Price / Total (HYPE)` 12 px |
| 头部到首档 | 约 111 px | 46 px |

用户决定四条一起做：1）头部行改 36 px，两个控件用 `MOBILE_FILTER_CHIP_CLASS`，档位左、单位右；2）单位改为下拉（基础币 / 计价币）；3）价差并入列头行，删独立行；4）列头显示当前单位并随切换变化。梯子行高与深度条比例不动。分支 `claude/surface-tokens-touch-feedback`，基线 6a96f9b7。

## 结论与依据

- `mobile-book-view.tsx` 头部改为 `flex min-h-9 … justify-between` 一行：左侧（非标签布局时的 Order Book / Trades 分段按钮 +）档位 `Dropdown`（`triggerVariant="minimal"`、`size="xxs"`、`MOBILE_FILTER_CHIP_CLASS`、`aria-label` Price grouping、当前项 `active`），中间 `data-slot="mobile-orderbook-spread"` 的价差文本，右侧显示单位 `Dropdown`（基础币 / 计价币两项、`aria-label` Display units、写回 `setShowOrderbookInQuote`）。删掉 `Button outline` 的「⇄」切换按钮与 `ArrowsLeftRightIcon`。
- 价差没有并入列头行而是并入头部行：列头行是两列等分网格，价格列头贴中缝，居中插入价差会把价格列头推离梯子的价格列；头部行同样是被删掉独立价差行后的一行，效果相同且不破坏列对齐。
- `SplitOrderbook` 删除 `spreadText` prop 与独立价差行；列头改为 `Total (${sizeToken}) / Price / Price / Total (${sizeToken})`，去掉 `uppercase tracking-wider`，`py-1.5`；`sizeToken` 随 `showOrderbookInQuote` 切换。
- 新增 `mobile-book-header-contract.test.ts` 源码契约：一行芯片头、两个芯片下拉、无切换按钮、列头带单位且不大写、无独立价差行。`docs/orderbook-layout.md` 几何规则新增移动端头部条目；`CHANGELOG.md` Changed。

## 验证与限制

- 改后实测（390 px，Order Book 标签）：档位芯片 68×27 在 x=12，单位芯片 66×27 在 x=312，同一行；梯子首档 y=224（改前 271），头部到首档约 65 px。
- 9 个测试文件 220 用例通过（含订单簿几何、分组触发器、移动端模式、i18n 热切换）；typecheck、Biome 通过。未跑 Playwright 订单簿几何套件（梯子行高与深度条未改）；未做真机验收。

## 后续与替代关系

- 补充 `2026-09-18-mobile-toolbar-chip-unification.md`；不替代任何记录。
