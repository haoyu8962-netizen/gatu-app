<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-desktop-md-stacked-right-column",
  "date": "2026-09-17",
  "title": "桌面 md 断点右列堆叠实施",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "order-entry",
    "docs-governance"
  ],
  "summary": "按 ADR 0011 把 1001–1420 px 桌面网格改为图表列 10/14 + 右列堆叠（下单面板、订单簿、账户信息），存储键升到 v12；验证结果与限制见正文。",
  "thread": null,
  "baseCommit": "a7fb284656651e6f8440cdfd584ed056ed158ff1",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0011-desktop-md-stacked-right-column.md" },
    { "path": "docs/desktop-grid-stacked-right-column-plan.md" },
    { "path": "apps/terminal/src/config/desktop-grid-layout.ts" }
  ],
  "supersedes": []
}
-->
# 桌面 md 断点右列堆叠实施

## 背景与范围

同步记录。分支 `claude/placeholder-parity`，工作树 `.claude/worktrees/previous-task-review-b5a831`，基线为计划文档修订提交（见元数据）。用户 2026-09-17 确认实施计划并选 55 行方案，要求先写 ADR 再派 Codex 持续执行。范围：md 默认几何、对齐/手柄/迁移规则、单测、浏览器套件、契约文档；lg、移动端、启动、订阅、签名与数据守卫不变。

## 结论与依据

- ADR 0011 先于代码提交，记录决策、备选（48.6 行方案、仅放宽右两列、窗口宽度断点）与后果。
- 配置与单测由 Codex（`codex exec -m gpt-6-astra -s workspace-write`）按提示词实施；提示词限定只可改两个文件并禁止提交，本会话复验后提交。
- 浏览器套件由本会话修改：`desktop-grid-layout.pw.ts` 的 `expectAligned` 按视口宽度分支并新增 md 堆叠/手柄用例；`account-actions.pw.ts` 在 ≤1420 px 时把账户信息顶边与订单簿底边配对；`trade-panel-layout.pw.ts`、`trade-panel-all-orders.pw.ts` 存储键改 v12；`orderbook-level-pulse.pw.ts` 的 md 夹具宽度改为 350 / 282。

## 验证与限制

工作区版本：基线 a7fb2846 + ADR 提交 56965a12 + 本任务未提交改动（提交号见 Git 历史）。日期 2026-09-17，本地 macOS，Chromium（channel chrome）。

- Codex 自述（来源：`codex exec` 报告，非本会话直接观察）：Biome 2 文件通过、typecheck 0 诊断、三文件 55/55 单测；首轮 1 个浮点严格相等断言失败后改为精度比较。
- 本会话复验：`pnpm exec biome check` 配置与单测两文件通过；`pnpm --filter @gatu/terminal typecheck` 通过；`vitest run` desktop-grid-layout（32）、grid-content-height（6）、trade-terminal-page-boot（17）、order-entry（27）、order-entry-store（11）、trade-form-twap-advanced（4）、trade-form-compact-fields（5）、trade-form-tp-sl（21）：8 文件 123/123 通过。
- Biome 的 `files.includes` 只覆盖 `src/**`，`apps/terminal/tests/browser/*.pw.ts` 被忽略，浏览器套件改动没有 Biome 校验（手动保持 tab 缩进与 120 列）。
- Playwright 共享配置（`tests/browser/playwright.config.ts`）筛选 desktop-grid-layout、trade-panel-layout、trade-panel-all-orders、orderbook-layout、orderbook-level-pulse：55/55 通过（2.6 min），含新增的 md 堆叠 + chart s / marketData s / chart e 拖拽 + reload 持久化用例。
- `mobile-trade-all-orders.playwright.config.ts` 筛选 desktop-order-entry-layout：7/7 通过（47.7 s），1001 / 1400 / 1420 / 1421 / 1545 px 八种订单类型无内部滚动。
- `account-actions.playwright.config.ts` 首轮 23/24：1363 px 的"routes enabled controls…"失败，原因是 `readGridGeometry` 用视口坐标，页面（1818 px 高）在点击右列底部按钮后滚动导致 y 变化，几何本身未变；改为加 `scrollX/scrollY` 的页面坐标后复跑 24/24 通过（1.2 min）。
- `pnpm build`：通过。396 client chunks 无静态循环；总 gzip 3,082,104 B（较基线 −72,603）；trade 静态闭包 1,569,114 B（−12,102）；desktop 运行时增量 199,830 B（+7,842）；shell 预加载与内联脚本哈希生成正常。包体只含配置常量变化。
- 全量 `pnpm --filter @gatu/terminal test`（默认并发）：566 文件 = 556 通过 / 9 失败 / 1 跳过；6,296 用例 = 6,263 通过 / 32 失败 / 1 跳过。失败文件均为 09-16 记录列出的既有基线红（desktop-positions-panel-shell、mobile-input-zoom-contract、mobile-order-risk-summary-contract、mobile-trade-tp-sl-contract、orders-table-visual-contract、position-market-close-modal、referral-ui-contract、adaptive-modal-swipe-dismissal 等），都不引用网格配置；第二次复跑（同样 566 文件 / 9 失败 / 32 项）按文件统计：desktop-positions-panel-shell 18、adaptive-modal-swipe-dismissal 3、referral-ui-contract 3、mobile-input-zoom-contract 2、mobile-order-risk-summary-contract 1、mobile-trade-tp-sl-contract 1、orders-table-visual-contract 1、position-market-close-modal 1；余下 1 个文件 2 项未被日志过滤捕获，文件名未识别（两轮全量的失败文件数与用例数完全相同，且本任务改动的模块无新失败）。未放宽任何断言。
- 生产构建冷加载实测（Nitro 本地服务 3016，Chromium headless，`/trade/BTC`，页面坐标，页眉 59 px）：

| 视口 | 图表列宽 | 右列宽 | 下单面板 | 订单簿 | 账户表 | 账户信息 y | 网格高 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1001 | 710 | 282 | 677 | 670（y 739） | 710×459（y 739） | 1412 | 1818 |
| 1316 | 935 | 372 | 677 | 670（y 739） | 935×459 | 1412 | 1818 |
| 1420 | 1009 | 402 | 677 | 670 | 1009×459 | 1412 | 1818 |
| 1421 | 883 | 263 + 263 | 670 | 670（y 59） | 1149×459（y 732） | 732 | 1138 |
| 1440 | 895 | 267 + 266 | 670 | 670 | 1165×459 | 732 | 1138 |

1316 px 与官方 fiber 读数（图表列 935、右列 372、下单面板 677、订单簿 670）一致；订单簿相对网格顶的 y 为 680（官方 683，差 3 px 来自官方 `margin` 计入方式），网格总高 1818 对官方 1686（51 行 vs 55 行，按用户选择）。1421 px 起为 lg 三列，与改动前一致。
- 未做：真实设备/多浏览器验收；`tests/browser/boot-milestones.mjs` 启动计时未复跑（本次不触碰启动路径，包体预算已由构建脚本核对）。

## 后续与替代关系

- AGENTS.md 桌面布局契约第三条、`docs/desktop-grid-layout.md`、`docs/order-entry-layout-audit.md`、`docs/orderbook-layout.md`、CHANGELOG 已随实现更新；计划文档状态改为已实施并链接 ADR 0011。
- 可选后续：md 下账户信息位于右列底部需要滚动才可见，与官方一致；若产品要求首屏可见，需另行决策（不在本 ADR 内）。
- 下次先查：`apps/terminal/src/config/desktop-grid-layout.ts`（`alignStackedDesktopGridLayout`、`hasConsistentStackedColumns`）、`tests/browser/desktop-grid-layout.pw.ts` 的 `stackedGaps`。
