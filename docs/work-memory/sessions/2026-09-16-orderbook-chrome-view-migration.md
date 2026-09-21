<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-orderbook-chrome-view-migration",
  "date": "2026-09-16",
  "title": "桌面订单簿 chrome 单一来源迁移",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "订单簿 chrome 共享视图迁移及后续 reviewer 验证已记录；启动占位部分已由 ADR 0010 取代，真实展示组件继续使用，历史失败和验证边界保留。",
  "thread": null,
  "baseCommit": "7d80e46bbbf221a6f4256bf4008b9632c289627a",
  "commits": ["3ecb960e", "998515a5"],
  "sources": [
    {
      "path": "docs/adr/0009-startup-placeholder-single-source.md"
    },
    {
      "path": "apps/terminal/src/components/trade/orderbook/orderbook-panel-view.tsx"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-16-remove-startup-placeholders.md"
    }
  ],
  "supersedes": []
}
-->
# 桌面订单簿 chrome 单一来源迁移

## 背景与范围

2026-09-16 当前任务同步摘要，非原始对话转录；未取得会话 ID，thread=null。基线 `7d80e46bbbf221a6f4256bf4008b9632c289627a`，工作区仅未跟踪 `.build/`，保持不动。用户要求迁移表面 3；禁止安装、暂存、提交、stash、移动文件及切换分支。移动壳、梯形盘口几何、行占位、悬停、脉冲和订阅均不在改动范围。

## 结论与依据

按 ADR 0009 采用三个 props-only 视图，运行时保留真实 Tabs/TabsContent 与 Dropdown 行为。相比壳直接导入运行时面板，纯视图不会引入订阅、store 或 UI primitives；相比手抄 frame，列头、侧容器和价差仅保留一份标记。共享根与内容 class 常量；TabsContent 自带的两个 hidden-state class 保持 primitive 所有权，测试显式列为非激活态差异。

- `OrderbookPanelView`：labels（price/size/total/spread）、grouping、assetLabel、spreadText、可选 asks/bids/sideStyle/ladderRef；导出 ORDERBOOK_PANEL_CLASS / ORDERBOOK_TAB_CONTENT_CLASS。null 资产以 invisible `(BTC)` 保留宽度，价差沿用 `—`。
- `OrderbookTabsView`：labels（orderBook/trades）、active（book/trades）；保留两个真实 button 和 primitive 已解析布局类，并自带与 Base UI `Tabs.Indicator` 同类的静态下划线（reviewer 补充：两个 `flex-1` 页签等宽，`left` 取 0%/50%、`width` 50%，与运行时测量出的指示条位置一致）。真实运行时仍使用 TabsList/TabsTrigger；parity 测试只忽略显式列出的语义属性与 `style`，指示条 class 与占位/运行时两侧逐一对照。
- `OrderbookGroupingTriggerView`：label（string/null）、原生 button props/ref；null 预留 invisible `0.01`。实际占位传可见 `—`：`getPriceGroupingOptions(undefined, 2)` 返回 []，与 max decimals 无关，原组件的 fallback 为 `—`。renderTrigger 绕过 primitive 的 triggerClassName/size，故完整 minimal xxs 类和 caret 由视图提供，并与旧 Dropdown 路径对照。
- ORDERBOOK_PLACEHOLDER 是静态英文 props 来源；运行时以 reactive t 翻译并从已有 pairName/原始现货路由推导 base token。现货路由用 `/`，市场头显示名称已转换为 `-`，因此现货拆分使用原路由。
- 删除 OrderBookFrame 与仅订单簿用的五个 PanelFrameLabels 字段；size 仍供 TradePanelFrame 使用，UNDERLINE_TAB_CLASS 仍供 AccountTableFrame 使用，保留。
- ORDERBOOK_LABELS 全部十个描述符都有运行时 t 调用；没有为仅静态文本新增死消息。

## 文件与测试断言变更

实现新增三个 orderbook/*-view.tsx 和 config/orderbook-labels.ts；修改 orderbook-panel.tsx、layout/app-shell-skeleton.tsx、desktop-placeholders.ts、terminal-loading-workspace.tsx。共享 packages/ui 无改动。

- 新 orderbook-panel-view-parity：占位与真实样本递归 DOM/geometry 对照；asset invisible 样本、价差 —、空侧容器；book/trades 两个 active 值对照真实 Tabs SSR；分组 bare/renderTrigger/旧默认 trigger 三方精确几何对照和无行情 [] 证明；shell 与 Tabs 根/内容常量；ladder ref、style、slots；视图纯度、运行时及两类占位接线与翻译。
- boot-placeholder-contract：将三个视图加入无动画扫描；既有无计时器断言不变。
- app-shell-import-boundary：新增纯视图直接导入及无 @gatu/ui 断言；原允许列表规则及 legacy exception 使用检查保留。
- app-shell-frame：新增共享 root/content 常量、两页签、invisible asset、— 价差、空侧、无 waiting/trades 内容；既有 inert、单播报及移动断言保留。
- orderbook-panel-safety：原守卫断言原样保留，新增共享 root/content 类、占位行无控件、移除 sr-only 后无可见等待文字。
- responsive-panel-layout：容器类断言改为导出常量并检查运行时接线，orderbook-grid 改从视图读取；原容器断点、订阅、互斥页签断言保留。
- trades-panel：原订阅计数保留，增加 book 激活时 keepMounted trades panel 的 hidden 断言。
- global-settings-modal、hidden-horizontal-scrollbar-contract 当前断言无需迁移，保持原样。
- i18n-reactivity-contract：纯视图列表由 PURE_HEADER_VIEWS 改名为 PURE_PRESENTATION_VIEWS，加入三个新视图；原容器检查不变。
- i18n-hot-switch：新增 Trades/Recent Trades/Spread/Price grouping 中文夹具；原 en→zh 流程新增订单簿根与 grouping 按钮 DOM 身份不变、trades aria/标签及 spread 标签更新断言。
- parity 补充：五类运行时路由（BTC、builder TSLA、PURR/USDC、索引现货、无路由）验证 baseToken/null、inert、可见分组 —；en→zh→en 占位热切换保留面板；分组触发器 ref、ArrowDown 打开、菜单选中及无嵌套按钮。

## 验证与限制

验证对象是上述基线上的未提交工作区。首轮 targeted Vitest：3 文件通过、1 文件失败；50 用例通过，responsive-panel-layout 一项仍读取旧容器 class。已改为读取视图并验证常量接线；未削弱任何安全检查。后续完整指定组初次为 436 pass / 2 timeout，均是 orderbook-boot 动态 import 超过默认 5s；未改该文件，单独复跑 5/5 通过（2.75s）。新增 i18n/路由/键盘测试后的三文件 107/107 通过。再次完整指定组为 447 pass / 1 timeout，仍是同一动态 import；以下记录以 2 workers 重跑同一组的结果，保留原 5s timeout，不修改任何断言。

## Reviewer 复核与 Playwright 实测（2026-09-16，同一未提交工作区）

复核方式：通读全部 diff，对照 HEAD 的 `orderbook-panel.tsx` 逐类名核对视图；用 scratchpad 的 `orderbook-diff.mjs` 在开发服务器（:3005，`/trade/BTC`）记录壳与真实终端 marketData 面板内的键控盒（面板、页签行、页签列表、指示条、两个页签及其图标/文字、表头三格、分组触发器、资产标签、卖盘容器、价差行及其两个文本、买盘容器）。壳取字体就绪后卸载前的最后一帧，真实取价差值出现且字体就绪的帧。

reviewer 修改一项：Codex 的静态页签视图没有下划线指示条，实测真实面板挂载后在页签底部出现 2 px `bg-action` 指示条（1440：901,90 133.5×2），壳里没有；已在 `OrderbookTabsView` 内加同类静态指示条并让 parity 测试同时对照两侧的指示条 class，测试列表 31 文件 461 用例（`--maxWorkers=2`）、Biome 17 文件、terminal typecheck 通过。

| 视口 / 主题 / 语言 | 面板 | 页签行 / 指示条 | 表头 | 卖盘 / 价差 / 买盘 |
| --- | --- | --- | --- | --- |
| 1440 dark en | 壳 901.1,59 266.4×670 vs 真实 901,59 267×670（宽度差 0.6 px，见下） | 行高 33 全等；指示条 y=90 高 2，宽 133.2 vs 133.5（面板宽度的一半）；页签 133.2×32 vs 133.5×32；图标/文字 y 全等 | 33 高全等；三格 80.8 vs 81 宽；Price/Size/Total 文本全等；分组触发器 34×20（`—`）vs 29.8×20（真实 `1`）为文本宽度 | 卖盘 y=125 高 287、价差 y=412 高 30、买盘 y=442 高 287 全等；价差值 `—` 12 px vs `1 (0.001%)` 66.6 px 为文本宽度 |
| 1280 dark en | 270.6 vs 270 宽 | 33 / 指示条 135.3 vs 135 | 82.2 vs 82 | 290.5 / 30 / 290.5 全等 |
| 1030 dark en（容器查询紧凑态） | 217.1 vs 217 宽 | 页签行 31、页签 108.5×30 全等；指示条 108.5 全等 | 三格 64.3 全等；资产标签在紧凑容器里两侧都隐藏（0×0） | 291.5 / 30 / 291.5 全等 |
| 1440 light en | 同 1440 dark | 同 | 同 | 同 |
| 1440 dark zh | 同 1440 dark | 结构相同；订单簿 36 vs Order Book 64.6、成交 24 vs Trades 39 为文本宽度 | 价格/数量/合计文本宽度差 | 价差标签 24 vs 40.6 为文本宽度，容器全等 |

说明：

- 面板本身 ≤0.6 px 的宽度/横坐标差来自网格几何源：`desktop-grid-loading-surface.tsx` 用 `calc(百分比 ± px)` 得到小数宽度，而 react-grid-layout 把 left/width 取整。这是所有面板共有的既有亚像素差，不属于本表面；CSS `round()` 在不支持的浏览器里会让变量值整体失效，不能作为壳的修法，保留观察。
- 运行时占位（`TerminalLoadingWorkspace`）在这些冷访问里没有被浏览器脚本捕获到（catalog 到达前后壳直接切到真实面板），其与视图的接线由 parity 测试的五类路由用例覆盖。
- 移动端不涉及：marketData 面板只在桌面网格出现，移动壳未改动（`mobile-app-shell-skeleton`、`mobile-chrome-parity` 通过）。

## 全量套件与生产构建（reviewer，同一工作区，含静态指示条）

`pnpm --filter @gatu/terminal test`（567 文件 / 6260 用例）：11 文件失败。其中 9 个是表面 2 记录里已列出的基线红文件（`mobile-trade-tp-sl-contract`、`mobile-input-zoom-contract`、`mobile-order-risk-summary-contract`、`adaptive-modal-swipe-dismissal`、`desktop-positions-panel-shell`、`tests/global-settings-slippage-effective`、`referral-ui-contract`、`orders-table-visual-contract`、`position-market-close-modal`，失败数与上次相同，均与本任务文件无关）；`chart-build-assets`(1) 单独重跑 17/17 通过；`establish-connection-modal` 的"uses the mobile drawer and completes only after Agent confirmation"用例单独重跑仍 5 s 超时（表面 2 复核时单独运行曾通过），属计时敏感的钱包流程用例，与订单簿改动无关，未处理。

`pnpm build` 通过：客户端总预算 3,080,679 gzip 字节（较表面 2 提交后 +942，较基线 −74,028）；trade 静态启动闭包 1,573,128（+2,907）；桌面运行时增量 195,610（+3,622）。预渲染壳核对（`grep -a`）：`orderbook-panel-container` 2（壳根与容器查询 class 名）、`orderbook-tab-label` 2、`orderbook-grid` 1、`data-slot="orderbook-asks"`/`orderbook-spread` 各 1、静态指示条 `bg-action` 1、不可见资产标签 2、`aria-busy` 1（壳根）。构建不是发布。

## 后续与替代关系

表面 1、2 的既有记录保持历史证据；本记录只涉及表面 3。代码及自动验证完成后交 reviewer 实测与审查；用户明确要求不提交。

## 完整文件清单

新增：

- `apps/terminal/src/components/trade/orderbook/orderbook-panel-view.tsx`
- `apps/terminal/src/components/trade/orderbook/orderbook-tabs-view.tsx`
- `apps/terminal/src/components/trade/orderbook/orderbook-grouping-trigger-view.tsx`
- `apps/terminal/src/config/orderbook-labels.ts`
- `apps/terminal/src/lib/tests/orderbook-panel-view-parity.test.tsx`
- `docs/work-memory/sessions/2026-09-16-orderbook-chrome-view-migration.md`

修改：

- `CHANGELOG.md`
- `apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx`
- `apps/terminal/src/components/trade/layout/desktop-placeholders.ts`
- `apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx`
- `apps/terminal/src/components/trade/orderbook/orderbook-panel.tsx`
- `apps/terminal/src/lib/tests/app-shell-frame.test.tsx`
- `apps/terminal/src/lib/tests/app-shell-import-boundary.test.ts`
- `apps/terminal/src/lib/tests/boot-placeholder-contract.test.ts`
- `apps/terminal/src/lib/tests/i18n-hot-switch.test.tsx`
- `apps/terminal/src/lib/tests/i18n-reactivity-contract.test.ts`
- `apps/terminal/src/lib/tests/orderbook-panel-safety.test.tsx`
- `apps/terminal/src/lib/tests/responsive-panel-layout.test.ts`
- `apps/terminal/src/lib/tests/trades-panel.test.tsx`
- `apps/terminal/src/locales/ar/messages.po`
- `apps/terminal/src/locales/en/messages.po`
- `apps/terminal/src/locales/es/messages.po`
- `apps/terminal/src/locales/fr/messages.po`
- `apps/terminal/src/locales/hi/messages.po`
- `apps/terminal/src/locales/zh/messages.po`
- `docs/adr/0009-startup-placeholder-single-source.md`
- `docs/orderbook-layout.md`
- `docs/work-memory/INDEX.md`

## 最终验证命令

```bash
pnpm --filter @gatu/terminal exec vitest run src/lib/tests/orderbook-panel-view-parity.test.tsx src/lib/tests/top-nav-footer-view-parity.test.tsx src/lib/tests/market-header-view-parity.test.tsx src/lib/tests/app-shell-import-boundary.test.ts src/lib/tests/boot-placeholder-contract.test.ts src/lib/tests/app-shell-frame.test.tsx src/lib/tests/orderbook-panel-safety.test.tsx src/lib/tests/responsive-panel-layout.test.ts src/lib/tests/global-settings-modal.test.tsx src/lib/tests/trades-panel.test.tsx src/lib/tests/trade-row.test.tsx src/lib/tests/trades.test.ts src/lib/tests/orderbook.test.ts src/lib/tests/orderbook-rows.test.ts src/lib/tests/orderbook-hover.test.ts src/lib/tests/orderbook-new-levels.test.ts src/lib/tests/orderbook-level-pulses.test.ts src/lib/tests/orderbook-color-contrast.test.ts src/lib/tests/orderbook-size-cell.test.tsx src/lib/tests/orderbook-boot.test.ts src/lib/tests/use-l2-book-subscription.test.tsx src/lib/tests/mobile-orderbook-subscription.test.tsx src/lib/tests/hidden-horizontal-scrollbar-contract.test.ts src/lib/tests/desktop-grid-layout.test.ts src/lib/tests/grid-content-height.test.tsx src/lib/tests/i18n-reactivity-contract.test.ts src/lib/tests/i18n-hot-switch.test.tsx skeleton-fallback root-route-transition terminal-loading
# 相同列表，加 --maxWorkers=2 复跑，保留默认 5s timeout
pnpm exec biome check <本任务全部 17 个变更 TS/TSX 文件>
pnpm --filter @gatu/terminal typecheck
pnpm i18n:extract
pnpm memory:index && pnpm memory:check && pnpm memory:test
git diff --check
```

packages/ui 无修改，未运行根 pnpm typecheck。移动壳从 MobilePanelFrameLabels 前的 Props 到文件结尾与 HEAD 逐字相等；mobile-chrome-classes 的 diff 为空。所有行情行 slots 的业务表达式保持原样；无订阅或 hooks 源文件改动。

## 最终验证输出

2026-09-16，上述基线的最终未提交工作区；下列结果不代表发布或 Playwright 验收：

```text
指定完整列表，默认并发（最后一次）：
Test Files  1 failed | 28 passed (29)
Tests       1 failed | 447 passed (448)
失败：orderbook-boot 动态 import 超过默认 5000ms

相同完整列表，加 --maxWorkers=2：
Test Files  29 passed (29)
Tests       448 passed (448)
Duration    21.32s

Biome:
Checked 17 files in 103ms. No fixes applied.

pnpm --filter @gatu/terminal typecheck: exit 0
pnpm i18n:extract: exit 0; 2016 messages，无新增 msgid
pnpm memory:index: Work-memory index updated.
pnpm memory:check: Work-memory index verified.
pnpm memory:test: 8 tests, 8 pass, 0 fail

git diff --check: exit 0，无输出
```

Lingui 六份目录仅来源位置变动；既有缺译 ar/es/fr/hi 各 14、zh 5 不变。`terminal-loading` 名称筛选当前未另命中测试文件；新增 parity 测试实际覆盖 TerminalLoadingWorkspace 的路由资产及 locale 更新。源码归属与几何检查未放宽加载状态、不可交互档位、aria-busy 或无可见等待文本断言。

本地输出保留在 Git 忽略的 `.worklog/2026-09-16/orderbook-chrome-view-migration/`，包含两轮完整列表超时、单文件复跑、最终 2 workers 完整组、补充 parity/i18n、Biome、typecheck 和 extract 日志；工作区绝对路径已脱敏。这些是工具输出，不是完整会话转录。最终记录写入后再次串行运行 memory 三命令及 diff 检查。

未运行 pnpm install、git add/commit/stash/mv 或 branch switch；原 `.build/` 保留未跟踪。

## ADR 0010 后的来源路径修正（2026-09-16）

启动占位已由 [ADR 0010](../../adr/0010-blank-until-ready-startup.md) 取代；上文仍是旧方案当时的记录，不改写其验证结论。以下 source 在移除启动占位任务中删除，元数据改链到[后续任务记录](2026-09-16-remove-startup-placeholders.md)，避免索引将历史路径误作当前文件；原来源保留于此，可用 `git show 0f7e97acb95a4211195b1ac4dd742def7f72bbc0:<路径>` 检索：

- `apps/terminal/src/lib/tests/orderbook-panel-view-parity.test.tsx`

## 周整理追加（2026-09-21）

初轮待 reviewer 的状态不代表最终记录，正文已有后续复核与检查。当前 [ADR 0010](../../adr/0010-blank-until-ready-startup.md) 移除启动占位，但保留 props-only 真实视图；本次只更新检索摘要，不把旧占位几何测量当成新启动流程的验收。 本次依据与版本边界见 [周整理记录](2026-09-21-weekly-memory-review.md)。
