<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-mobile-account-toolbar-density",
  "date": "2026-09-18",
  "title": "移动端账户标签工具栏纵向密度：去掉面板顶距并压缩工具栏行高",
  "kind": "task",
  "status": "recorded",
  "summary": "实测 390 px 下我们标签行 47 + 面板顶距 8 + 工具栏 48 = 103 px，官方 36 + 0 + 31 = 67 px；用户决定先做两项：移动端账户面板去掉共享 TabsPanel 的 pt-2，五个标签的工具栏行从 48 px 压到 36 px（触控热区仍由 after:h-11 伪元素保证 44 px）；标签行高度另行决策。",
  "topics": [
    "docs-governance"
  ],
  "thread": null,
  "baseCommit": "ba5a580b",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/mobile/mobile-positions-view.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-positions-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-orders-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-history-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-funding-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-orders-history-tab.tsx" },
    { "path": "apps/terminal/src/lib/tests/mobile-position-filter-row.test.tsx" }
  ],
  "supersedes": []
}
-->
# 移动端账户标签工具栏纵向密度：去掉面板顶距并压缩工具栏行高

## 背景与范围

用户在未登录持仓标签上质疑纵向是否过宽。无头 Chromium 390×844 实测（Positions 标签）：

| 区域 | 我们（改前） | 官方 |
|---|---|---|
| 标签行 | 47 px | 36 px |
| 标签行到工具栏 | 8 px（`packages/ui/src/tabs.tsx` `TabsPanel` 默认 `pt-2`，移动端未覆盖） | 0 |
| 工具栏行 | 48 px（`py-2.5` × 2 + 26 px 芯片 + 1 px 底线） | 31 px |

用户决定按两条实施：1）面板去掉 `pt-2`；2）工具栏行压到约 36 px，芯片尺寸与 `after:h-11` 触控热区不变。标签行 47 px 的规格变更另行决策。分支 `claude/surface-tokens-touch-feedback`，基线 ba5a580b。

## 结论与依据

- `mobile-positions-view.tsx`：`tabContentClass` 加 `pt-0`，覆盖共享 `TabsPanel` 的 `pt-2`。
- 工具栏行：持仓 `py-2.5` → `py-[5px]`；委托 `h-12 py-2.5` → `h-9`；成交历史、资金费用、委托历史 `h-12` → `h-9`。芯片 26 px、`after:h-11` 热区、横向 `px-3.5` 不变。
- 契约测试同步：`mobile-position-filter-row`（2b 行 className）、`orders-table-visual-contract`（移动端行 `h-9`）、`mobile-history-cards`（三处 `h-9`）。

## 验证与限制

- 改后实测（同一脚本）：标签行 47、面板顶距 0、工具栏行 38（持仓：5 + 26 + 5 + 1 px 底线）、芯片 26；合计 85 px，较改前 103 px 少 18 px，与官方 67 px 的余差全部来自标签行 47 vs 36。
- 7 个测试文件通过；typecheck、Biome 通过。未做真机验收；委托等 `h-9` 行内 Select 触发器 27 px 加 `after:h-11` 伪元素，热区仍为 44 px。

## 后续与替代关系

- 补充 `2026-09-18-mobile-disconnected-alignment.md`；不替代任何记录。标签行 47 px 未改。
