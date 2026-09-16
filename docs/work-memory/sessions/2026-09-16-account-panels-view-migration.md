<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-account-panels-view-migration",
  "date": "2026-09-16",
  "title": "桌面账户面板：单一来源展示组件迁移",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "表面 5 共享账户页签、概览与按钮纯视图；394 项通过，18 项既有 mock 失败前后不变；类型、Biome 与 memory 检查通过，浏览器因沙箱 EPERM 待 reviewer。",
  "thread": null,
  "baseCommit": "bfdae535adcb567dd8a763d71c31eb9b94b284bd",
  "commits": [],
  "sources": [
    {
      "path": "docs/adr/0009-startup-placeholder-single-source.md"
    },
    {
      "path": "docs/desktop-grid-layout.md"
    }
  ],
  "supersedes": []
}
-->
# 桌面账户面板：单一来源展示组件迁移

## 背景与范围

当前任务未取得会话 ID。基线工作区只有未跟踪 `.build/`，保持不动；用户明确禁止安装、暂存、提交、stash、git mv 和切换分支。表面 1–4 已提交。

## 结论与依据

目标：三个调用入口共享 props-only 账户 header、静态页签、overview、action button 和 panel frame。运行时保留 Tabs、预加载、计数、toolbar target、资金与签名及地区守卫。纯 InfoRow 作为允许的 UI composition，不复制其 class。内容宽度页签无法在构建期取得 Base UI indicator CSS 变量，因此静态下划线放在激活按钮内；SSR 对照去掉双方 indicator 并单独断言静态下划线。保留 iframe 图表居中品牌占位。

备选的手写账户 frame 会继续造成几何漂移，不采用；在 shell 导入运行时 primitive 会违反轻量纯视图边界，不采用。验收为结构/classes 与 primitive SSR 一致、禁用属性和行为保持、运行时持久页签和数字区域设置及热切换正确，指定回归检查通过或明确记录基线失败。


### 视图接口与接线

| 视图 | Props | 保留的结构 |
| --- | --- | --- |
| AccountTableHeaderView | `tabs: ReactNode`、`actions?: ReactNode`、`scrollRef?`、`actionsRef?`、`hasActions?`（默认按 slot 是否存在，runtime 显式传原 hasHeaderActions） | 45px row、横向 scroller、toolbar portal target、按原状态附加 pl-3 |
| AccountTabStripView | `tabs: readonly { value; label: ReactNode; count?: ReactNode }[]`、`active: string` | resolved TabsList/Trigger class、data-active、可选 count slot、按钮内静态 underline |
| AccountOverviewView | `deposit`、`withdraw`、`description?` slots，`title`、`titleId?`，`rows: readonly { key; label; value }[]` | data-grid-content-part、原双按钮网格、sr-only reason、section、原 InfoRow/InfoRowGroup；不生成 ID |
| AccountActionButtonView | `variant: filled | outline`、`label`、`focusableWhenDisabled?` 和原生 button props/ref | Base UI 的默认 size + neutral classes、tabindex、disabled / aria-disabled / data-disabled；禁用时阻止激活 |
| AccountPanelFrameView | `title: string`、`children: ReactNode` | 原 min-h-[459px] root 与 sr-only h2 |

PositionsPanel 的外层 div 和内部 Tabs 层级原样保留；root、autoHeight、Tabs/list/trigger/count/indicator class 常量只移出而不改值。共享 header 不拥有运行时 Tabs 状态。AccountPanel 仅改 root 为 frame；连接/未连接分支和 return 前的逻辑逐字核对保持不变。PositionsPanel return 前的状态与业务逻辑逐字核对保持不变。

`renderDesktopPanel(panelId, props: DesktopPanelPlaceholderProps)` 统一接收 favorites、marketHeader、orderbook、tradePanel、accountTable、accountOverview。壳传 DESKTOP_PANEL_PLACEHOLDER，runtime 传翻译、路由和持久状态。删除两个旧账户 frame、PanelFrameLabels、DEFAULT_PANEL_FRAME_LABELS、useTranslatedPanelFrameLabels、UNDERLINE_TAB_CLASS、SUMMARY_ROW_CLASS、VALUE_PLACEHOLDER、NAME_PLACEHOLDER；顺带内联只有一层转发的 FavoritesFrame/MarketHeaderFrame。ChartFrame 原样保留。LEGACY_SHELL_IMPORTS 的两个条目仍被真实引用，未减少或放宽为通配符。

移动 shell 没有改元素、classes 或值：为删除用户点名的 VALUE_PLACEHOLDER/NAME_PLACEHOLDER，把其原有 `-`/`—` 引用就地替换为同值字符串；Biome 仅将其中三处 JSX 换行压成一行。对 HEAD 的 mobile section 做同样常量替换及空白归一后完全相等。两个 mobile parity 测试文件未编辑，mobile account、ladder、order-book 实现和 trade form 文件未编辑。

### 标签与零值的可核对来源

读取迁移前 `tradebox/disconnected-account-overview.tsx` 的 rows 与 `useAccountModeLabels().unavailable.summary`：

| 英文标签 | 英文渲染值 | 原 formatter 调用 |
| --- | --- | --- |
| Account Margin Ratio | `0.00%` | `formatPercent(0, 2)` |
| Portfolio Value | `$0.00` | `formatUSD(0, { compact: false })` |
| Unrealized PNL | `$0.00` | 同上 |
| Cross Maintenance Margin | `$0.00` | 同上 |
| Cross Account Leverage | `0.00x` | `${formatNumber(0, 2)}x` |

按钮为 `Deposit` / `Withdraw`，外框隐藏标题为 `Account`，概览标题为 `Account Summary`。`POSITIONS_TABS` 的七个 descriptors 原样复用；有效持久页签来自同步 usePositionsActiveTab，非法值（含仅 portfolio 有的 transfers）回退 positions。Deposit 复用 account-ledger 的现有 descriptor 并显式保留英文 source；Account 复用 TRADE_PANEL_LABELS.account；新增 account-labels 只定义其余原先没有配置 descriptor 的标签，每项均有 runtime 翻译调用。Account Summary 唯一 descriptor 由 useAccountModeLabels 和 placeholder 共同引用，真实容器仍取 modes.unavailable.summary。

两个运行时入口共用 `getDisconnectedAccountOverviewRows(t, numberFormatRevision)`；formatter 调用与迁移前相同。初轮新测试发现只调用但不消费 useNumberFormatRevision 时，React Compiler 会缓存固定 0 的格式化结果；显式传入 revision 使 helper 调用成为可失效的依赖。`de-DE` → `en-US` 和 en → zh 均测试更新且不更换现有 DOM。壳中的五个英文零值是真实断开账户输出，保持可见。

### 测试断言变更清单

- 新 account-panels-view-parity（16 项）：占位与 sample props 的 frame/header/strip/overview 结构和 classes；root 与 autoHeight 常量；有/无 count 的 Tabs SSR 对照；唯一 indicator 例外（删除双方 indicator，仅删除静态按钮额外 relative 后比较），单独固定 underline classes、父按钮与 CSS 变量；两种 action variant × disabled × focusableWhenDisabled 的全部 SSR attributes/classes；refs、禁用 click/Enter 与可 Tab、启用 click；scroller/actions ref 与 padding；真实 disconnected 对照及五行标签/值/可见性/两个禁用按钮；sr-only 描述关联和 sponsored deposit 点击；持久 funding/非法 transfers fallback、数字格式更新及热切换身份；五个纯视图源码边界；所有 runtime/placeholder 接线与 preload/ref 保留。
- app-shell-frame：只新增一项账户真实 header（45px、七页签、positions active、无 counts/actions）、五行零值和 data-grid-content-part 断言；原 inert、单播报、无动画、七面板断言不变。
- app-shell-import-boundary：新增精确允许的 `@/components/ui/info-row` specifier；新增账户视图接线、InfoRow 只有 react type/cn imports 且无 runtime 依赖检查；已有迁移例外仍一一检查实际引用。
- boot-placeholder-contract：把五个新视图加入原无动画扫描；其余断言不变。
- grid-content-height：新增真实共享 disconnected view 作为 harness，断言 ResizeObserver 只观察其 data-grid-content-part，而不是伸展外框；原高度/收缩/边界测试不变。
- balances-table-visual-contract：45px 源码断言改读新 header view，并加 PositionsPanel 使用该 view 断言；仍保留 xs Tabs 和 pt-0 断言。
- hidden-horizontal-scrollbar-contract：原 positions-panel 源码位置改为 header view，五个 overflow/scrollbar class 与禁用 scrollbar-none 断言原样保留。
- i18n-reactivity-contract：五个新视图加入原纯视图清单，扫描条件不变。
- i18n-hot-switch：新增 disconnected AccountPanel 热切换的 frame/overview/button/row identity、充值/概览/保证金比率译文断言；原所有语言与状态检查不变。
- orderbook-panel-view-parity：只改 renderDesktopPanel 的新名称/统一参数调用和源码接线断言；SSR/classes 和安全断言不变。
- trade-panel-view-parity：只迁移 renderer 调用参数；sample tradePanel 用对象覆盖，所有原断言不变。
- trade-terminal-page-boot：全局设置 mock 新增 usePositionsActiveTab 和 getResolvedFormatLocale；原断言不变。
- funds-action-availability、user-positions-readiness、account-panel、positions-table-visual-contract、mobile-data-presentation、两个 mobile shell/parity 测试和 desktop-positions-panel-shell 未改断言或源码，加入完整命令验证。没有放宽任何 funds、readiness 或安全断言。

## 验证与限制

迁移前 desktop-positions-panel-shell：18 failed / 1 passed（19），Hyperliquid mock 缺少 `useInfo` 导出；初次进度说明误称缺 QueryClient provider，已依据原日志更正。未修复此既有 mock。日志在本机临时目录。

### 盒子测量（reviewer 待完成）

桌面 1440/1280/1030、移动 390/360/430，双主题、中英文的盒子测量待 reviewer；本任务不填入未经执行的数值。

## 后续与替代关系

表面 5 待 reviewer 在允许监听本地端口的环境运行 account-actions 浏览器套件并补齐盒子测量。本次不提交、不发布，不把自动检查当作实机或发布验收。

## 文件清单

新增 9 个文件：

- `apps/terminal/src/components/trade/positions/account-tab-strip-view.tsx`
- `apps/terminal/src/components/trade/positions/account-table-header-view.tsx`
- `apps/terminal/src/components/trade/tradebox/account-action-button-view.tsx`
- `apps/terminal/src/components/trade/tradebox/account-overview-view.tsx`
- `apps/terminal/src/components/trade/tradebox/account-panel-frame-view.tsx`
- `apps/terminal/src/config/account-labels.ts`
- `apps/terminal/src/lib/tests/account-panels-view-parity.test.tsx`
- `apps/terminal/src/lib/trade/account-overview-presentation.ts`
- `docs/work-memory/sessions/2026-09-16-account-panels-view-migration.md`

修改 28 个文件（含生成的工作记忆索引）：

- `CHANGELOG.md`
- `apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx`
- `apps/terminal/src/components/trade/layout/desktop-placeholders.ts`
- `apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx`
- `apps/terminal/src/components/trade/positions/positions-panel.tsx`
- `apps/terminal/src/components/trade/tradebox/account-panel.tsx`
- `apps/terminal/src/components/trade/tradebox/disconnected-account-overview.tsx`
- `apps/terminal/src/hooks/trade/use-account-mode-labels.ts`
- `apps/terminal/src/lib/tests/app-shell-frame.test.tsx`
- `apps/terminal/src/lib/tests/app-shell-import-boundary.test.ts`
- `apps/terminal/src/lib/tests/balances-table-visual-contract.test.ts`
- `apps/terminal/src/lib/tests/boot-placeholder-contract.test.ts`
- `apps/terminal/src/lib/tests/grid-content-height.test.tsx`
- `apps/terminal/src/lib/tests/hidden-horizontal-scrollbar-contract.test.ts`
- `apps/terminal/src/lib/tests/i18n-hot-switch.test.tsx`
- `apps/terminal/src/lib/tests/i18n-reactivity-contract.test.ts`
- `apps/terminal/src/lib/tests/orderbook-panel-view-parity.test.tsx`
- `apps/terminal/src/lib/tests/trade-panel-view-parity.test.tsx`
- `apps/terminal/src/lib/tests/trade-terminal-page-boot.test.tsx`
- `apps/terminal/src/locales/ar/messages.po`
- `apps/terminal/src/locales/en/messages.po`
- `apps/terminal/src/locales/es/messages.po`
- `apps/terminal/src/locales/fr/messages.po`
- `apps/terminal/src/locales/hi/messages.po`
- `apps/terminal/src/locales/zh/messages.po`
- `docs/adr/0009-startup-placeholder-single-source.md`
- `docs/desktop-grid-layout.md`
- `docs/work-memory/INDEX.md`

删除文件：无。旧 frame/label/helper 符号从原文件中删除。

## 最终验证命令与输出

以下结果绑定基线 `bfdae535adcb567dd8a763d71c31eb9b94b284bd` 上本任务未提交工作区，2026-09-16 执行；不是发布或浏览器几何验收。

```bash
pnpm --filter @gatu/terminal exec vitest run --maxWorkers=2 \
  src/lib/tests/account-panels-view-parity.test.tsx \
  src/lib/tests/trade-panel-view-parity.test.tsx \
  src/lib/tests/orderbook-panel-view-parity.test.tsx \
  src/lib/tests/top-nav-footer-view-parity.test.tsx \
  src/lib/tests/market-header-view-parity.test.tsx \
  src/lib/tests/app-shell-import-boundary.test.ts \
  src/lib/tests/boot-placeholder-contract.test.ts \
  src/lib/tests/app-shell-frame.test.tsx \
  src/lib/tests/mobile-app-shell-skeleton.test.tsx \
  src/lib/tests/mobile-chrome-parity.test.tsx \
  src/lib/tests/desktop-grid-layout.test.ts \
  src/lib/tests/grid-content-height.test.tsx \
  src/lib/tests/funds-action-availability.test.ts \
  src/lib/tests/user-positions-readiness.test.tsx \
  src/lib/tests/mobile-data-presentation-contract.test.ts \
  src/lib/tests/i18n-reactivity-contract.test.ts \
  src/lib/tests/i18n-hot-switch.test.tsx \
  src/lib/tests/desktop-positions-panel-shell.test.tsx \
  src/lib/tests/account-panel.test.tsx \
  src/lib/tests/positions-table-visual-contract.test.ts \
  src/lib/tests/balances-table-visual-contract.test.ts \
  src/lib/tests/hidden-horizontal-scrollbar-contract.test.ts \
  src/lib/tests/trade-terminal-page-boot.test.tsx \
  src/lib/tests/number-format-reactivity-contract.test.ts \
  skeleton-fallback root-route-transition
```

```text
Test Files  1 failed | 25 passed (26)
Tests       18 failed | 394 passed (412)
Duration    40.93s
exit 1
```

唯一失败文件 desktop-positions-panel-shell 在基线和迁移后均为 18 failed / 1 passed（19）。同一个报错：`No "useInfo" export is defined on the "@/lib/hyperliquid" mock`。该文件未编辑，没有 skip 或放宽断言；新增 account-panels-view-parity 16/16、account-panel 23/23、用户点名的所有其他测试文件均通过。root-route-transition 和 skeleton-fallback 各自被命令命中（见本机日志），未运行整个 terminal 的全部测试套件。

```bash
pnpm --filter @gatu/terminal typecheck
pnpm i18n:extract
pnpm --filter @gatu/terminal exec playwright test --config tests/browser/account-actions.playwright.config.ts
pnpm memory:index && pnpm memory:check && pnpm memory:test
git diff --check
```

Typecheck：exit 0。i18n extract：exit 0，2016 messages；所有六个 catalogs 只有 source-reference comments 变化，逐一对 HEAD 去掉注释后比较 message 内容完全不变，无新 msgid，无需新增译文。工具仍报告原有缺译 ar/es/fr/hi 各 14、zh 5；没有将其声称为零。

Playwright：exit 1，在测试开始前因 `listen EPERM: operation not permitted 127.0.0.1:4187` 无法启动专用 Vite server；未执行浏览器用例。已核对该 config 使用独立 `.vite-account-actions` cache，不改 server/cache 配置、不绕过沙箱限制，交由 reviewer。

过程中的非基线失败：初轮 parity 1/16 失败（数字格式刷新仍显示 0,00%），已通过显式 revision dependency 修正；首次 helper 类型使用重载 I18n["_"] 与 macro t 不兼容，改为只接收 MessageDescriptor 的回调，Typecheck 通过；Biome 首轮发现一个新测试未使用 import，已删除；memory:index 首次发现记录标题不符合模板，已按模板修正。进度说明曾误报基线原因，已按迁移前原日志更正，不影响前后失败数量。

Biome 实际精确文件集合（26 个 TS/TSX）：

```bash
pnpm exec biome check \
  apps/terminal/src/components/trade/positions/account-tab-strip-view.tsx \
  apps/terminal/src/components/trade/positions/account-table-header-view.tsx \
  apps/terminal/src/components/trade/tradebox/account-action-button-view.tsx \
  apps/terminal/src/components/trade/tradebox/account-overview-view.tsx \
  apps/terminal/src/components/trade/tradebox/account-panel-frame-view.tsx \
  apps/terminal/src/config/account-labels.ts \
  apps/terminal/src/lib/tests/account-panels-view-parity.test.tsx \
  apps/terminal/src/lib/trade/account-overview-presentation.ts \
  apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx \
  apps/terminal/src/components/trade/layout/desktop-placeholders.ts \
  apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx \
  apps/terminal/src/components/trade/positions/positions-panel.tsx \
  apps/terminal/src/components/trade/tradebox/account-panel.tsx \
  apps/terminal/src/components/trade/tradebox/disconnected-account-overview.tsx \
  apps/terminal/src/hooks/trade/use-account-mode-labels.ts \
  apps/terminal/src/lib/tests/app-shell-frame.test.tsx \
  apps/terminal/src/lib/tests/app-shell-import-boundary.test.ts \
  apps/terminal/src/lib/tests/balances-table-visual-contract.test.ts \
  apps/terminal/src/lib/tests/boot-placeholder-contract.test.ts \
  apps/terminal/src/lib/tests/grid-content-height.test.tsx \
  apps/terminal/src/lib/tests/hidden-horizontal-scrollbar-contract.test.ts \
  apps/terminal/src/lib/tests/i18n-hot-switch.test.tsx \
  apps/terminal/src/lib/tests/i18n-reactivity-contract.test.ts \
  apps/terminal/src/lib/tests/orderbook-panel-view-parity.test.tsx \
  apps/terminal/src/lib/tests/trade-panel-view-parity.test.tsx \
  apps/terminal/src/lib/tests/trade-terminal-page-boot.test.tsx
```

```text
Checked 26 files in 59ms. No fixes applied.
```

最终工作记忆与差异检查：

```text
pnpm memory:index: Work-memory index updated.
pnpm memory:check: Work-memory index verified.
pnpm memory:test: tests 8 / pass 8 / fail 0
git diff --check: exit 0，无输出
```

最终文件统计：新增 9、修改 28、删除 0。暂存区为空；分支仍为 `claude/placeholder-parity`，HEAD 仍为上述基线，未安装依赖、未提交或切换分支，原未跟踪 `.build/` 保留。没有通过调整既有失败测试来取得全绿。

## Reviewer 复核与 Playwright 实测（2026-09-16，同一未提交工作区）

复核方式：通读全部 diff，对照 HEAD 的 `positions-panel.tsx`/`account-panel.tsx`/`disconnected-account-overview.tsx` 逐类名核对；用 scratchpad 的 `accountpanels-diff.mjs` 在开发服务器（:3005，`/trade/BTC`）记录壳与真实终端 accountTable/accountInfo 两个面板内的键控盒（45 px 页签行、滚动区、页签列表、七个页签及其标签、静态/真实下划线、动作插槽；账户概览容器、两个按钮、章节、标题、五行及其数值）。壳取字体就绪后卸载前的最后一帧，真实取 oracle 数值出现且字体就绪的帧。

审查结论：`AccountTableHeaderView`/`AccountTabStripView`/`AccountOverviewView`/`AccountPanelFrameView` 为真实容器与壳共享；`AccountActionButtonView` 复制的是 `@gatu/ui` Button 的解析类并按 Base UI `useButton` 复现 `disabled`/`focusableWhenDisabled` 的属性与阻止激活语义，属允许的 primitive 例外且由 SSR 对照与事件测试钉住；`InfoRow`/`InfoRowGroup` 为纯组合，导入边界测试已显式允许并检查其无 hooks/primitive 依赖。指定回归 24 文件 379 用例（`--maxWorkers=2`）、Biome 26 文件、terminal typecheck 通过。

| 视口 / 主题 / 语言 | 账户表页签行 | 账户概览 |
| --- | --- | --- |
| 1440 dark en | 页签行 45 高、滚动区 44 高全等；七个页签 78.3/78.5/99.2/60.2/103.7/134/103.9×44 与标签 y=745 高 18 全等；下划线 103.3,775 78.5×2 全等；动作插槽 0×44 | 概览 243 高、按钮 121.2×32 vs 121×32、章节 175 高、标题 18 高、五行各 28 高、数值 `0.00%`/`$0.00`×3/`0.00x` 位置与宽度全等 |
| 1280 dark en | 全等 | 全等 |
| 1030 dark en | 全等 | 概览 259 高（真实同高）全等 |
| 1440 light en，持久化 `positionsActiveTab: "orders"` | 页签与行高全等；真实下划线在 Open Orders（183.8, 99.2×2），预渲染壳固定在 Positions（运行时占位读取持久化值，见 parity 测试）；真实动作插槽 12 px（`pl-3`，orders 页签有工具栏 portal 目标）使滚动区少 12 px，不影响页签位置 | 全等 |
| 1440 dark zh | 结构相同，仅中文标签宽度差（余额 26 vs Balances 54.3 等） | 全等 |

差异只剩面板亚像素宽度（网格几何源）与文本宽度。

## 浏览器套件、全量套件与生产构建（reviewer，同一工作区）

- Playwright `account-actions.playwright.config.ts`：24/24 通过（1.4 min）。
- `pnpm --filter @gatu/terminal test`（569 文件 / 6333 用例）：12 文件失败，全部为已记录项——9 个基线红文件失败数不变；`chart-store`(1)、`establish-connection-modal`(1)、`mobile-agent-sync-route`(18) 为并发/计时敏感（此前单独运行分别 11/11、15/15 或 1 例超时、20/20）。本表面未引入新失败。
- `pnpm build` 通过：客户端总预算 3,083,842 gzip 字节（较表面 4 提交后 −187，较基线 −70,865）；trade 静态启动闭包 1,578,798（+8,577）；桌面运行时增量 194,038（+2,050）。预渲染壳核对（`grep -a`）：`positions-toolbar-header` 1、`data-positions-tab=` 7、`disconnected-account-overview` 1、`Account Summary` 1、`0.00x` 1、`Withdraw` 1。构建不是发布。
