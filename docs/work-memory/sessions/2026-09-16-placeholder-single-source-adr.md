<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-placeholder-single-source-adr",
  "date": "2026-09-16",
  "title": "启动占位单一来源：ADR 0009 与展示组件规则",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting",
    "docs-governance"
  ],
  "summary": "ADR 0009 后续已有七个表面迁移；占位决策 2–5、7 被 ADR 0010 部分取代，props-only 真实展示组件与市场头布局规则保留。",
  "thread": null,
  "baseCommit": "ade94020",
  "commits": ["0c812745", "998515a5"],
  "sources": [
    {
      "path": "docs/adr/0009-startup-placeholder-single-source.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-16-remove-startup-placeholders.md"
    }
  ],
  "supersedes": []
}
-->
# 启动占位单一来源：ADR 0009 与展示组件规则

## 背景与范围

用户指出整个页面（桌面与移动）都存在占位壳与真实组件两套互不共享的实现，要求从架构上解决并先落 ADR 与规范。本记录只覆盖决策与规则的落地；表面迁移按 ADR 0009 决策 7 逐个另记。未取得任务标识，`thread` 记为 null。

## 结论与依据

- 清单核对：`app-shell-skeleton.tsx` 有 `DesktopHeaderFrame`、`DesktopFooterFrame`、`FavoritesFrame`、`MarketHeaderFrame`、`ChartFrame`、`OrderBookFrame`、`TradePanelFrame`、`AccountTableFrame`、`AccountInfoFrame`、`MobileShellSkeleton` 十个手写 frame，分别对应 `top-nav`/`user-menu`、`footer-bar`、`favorites-strip`、`market-asset-info`+`token-selector-trigger`+`market-overview`、`chart-panel`、`orderbook-panel`、`trade-panel`、`positions-panel`、`account-panel` 与六个 `mobile/*` 组件；`terminal-loading-workspace.tsx` 与 `mobile-loading-fallback.tsx` 用翻译标签再渲染一遍，共三份。共享的只有 `desktop-grid-loading-surface.tsx` 镜像的网格几何。
- 官方终端实测（2026-09-16，4G 仿真，1440 宽）：chrome 出现时市场头区域为空，市场头与数据同帧渲染；`info-bar-grid` 为 `repeat(6, auto)` 网格、32 px 间距、12 px、标签首字母大写、数值等宽字体。官方没有占位实现。
- 决策：见 [ADR 0009](../../adr/0009-startup-placeholder-single-source.md)；规则：[placeholder-parity](../../../.claude/rules/placeholder-parity.md)；`AGENTS.md` 新增指针段；`docs/adr/README.md` 与 `docs/README.md` 加入索引。
- 迁移顺序：桌面市场头与收藏条 → 顶栏与页脚 → 订单簿 chrome → 下单表单框架 → 账户表页签行与账户概览 → 移动端六个表面 → 仪表盘壳；每个表面一次提交，含展示组件、容器改造、占位常量、一致性测试与 Playwright 实测。

## 验证与限制

- 仅文档与规则变更：`git diff --check`、链接路径核对、`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`；未运行运行时测试，也不声称任何表面已迁移。
- 现有契约测试（`boot-placeholder-contract`、`app-shell-frame`、`mobile-app-shell-skeleton`、`mobile-chrome-parity`）仍断言旧契约（不含 `button`、共享 class 常量），将在各表面迁移时按决策 4、5 改写。

## 后续与替代关系

- 第一个迁移表面：桌面市场头与收藏条，同时采纳官方的列宽与标签大小写（决策 6），随提交更新 CHANGELOG。
- 本记录不替代 2026-09-15 的移动对齐记录；`mobile-chrome-classes.ts` 在移动表面迁移完成后删除。

## ADR 0010 后的来源路径修正（2026-09-16）

启动占位已由 [ADR 0010](../../adr/0010-blank-until-ready-startup.md) 取代；上文仍是旧方案当时的记录，不改写其验证结论。以下 source 在移除启动占位任务中删除，元数据改链到[后续任务记录](2026-09-16-remove-startup-placeholders.md)，避免索引将历史路径误作当前文件；原来源保留于此，可用 `git show 0f7e97acb95a4211195b1ac4dd742def7f72bbc0:<路径>` 检索：

- `.claude/rules/placeholder-parity.md`
- `apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx`
- `apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-loading-fallback.tsx`

## 周整理追加（2026-09-21）

“迁移未开始”只描述本记录建立时。后续迁移和 ADR 0010 已有独立记录；本次按 ADR 0010 的明确范围标记部分取代，不把整个 ADR 或真实展示组件设计判为废弃。 本次依据与版本边界见 [周整理记录](2026-09-21-weekly-memory-review.md)。
