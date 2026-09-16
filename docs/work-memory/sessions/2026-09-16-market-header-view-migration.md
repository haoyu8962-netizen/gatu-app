<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-market-header-view-migration",
  "date": "2026-09-16",
  "title": "桌面市场头与收藏条：单一来源展示组件迁移",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "表面 1 抽取五个纯视图，真实界面与静态及运行时占位共用标记；指标改为内容宽度和 32px 间距，标签统一首字母大写。初轮指定回归 207 项通过；round 2 改用隐形典型文本预留宽度及路由已知名称/类型，指定回归 81 项、补充回归 102 项通过，浏览器复测留给 reviewer。",
  "thread": null,
  "baseCommit": "0c8127456044390c95f7e5b4301fbbdd43a658e1",
  "commits": [],
  "sources": [
    {
      "path": "docs/adr/0009-startup-placeholder-single-source.md"
    },
    {
      "path": "apps/terminal/src/components/trade/layout/main-workspace.tsx"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-16-remove-startup-placeholders.md"
    }
  ],
  "supersedes": []
}
-->
# 桌面市场头与收藏条：单一来源展示组件迁移

## 背景与范围

按用户提供的表面 1 任务实施 ADR 0009 决策 1–7。当前分支 `claude/placeholder-parity`，基线见元数据；初始已有未跟踪 `.build/`，保留。未取得会话 ID 或原始导出，thread 为 null。用户明确禁止安装、暂存和提交，由 reviewer 提交。

## 结论与依据

- 五个 props-only 视图负责收藏条、桌面触发器、图标槽、指标行和市场头布局。真实网格与两类占位调用相同视图，占位数据唯一来源为 desktop-placeholders.ts。
- 内容列宽替代固定最小宽度，固定 32px 间距；保留隐藏滚动条、键盘滚动、数据新鲜度与价格闪动。
- 共享描述符保留生产英文源串；移动详情只改标签，未迁移移动布局。
- 壳装饰层使用 aria-hidden + inert，保留 aria-busy、单一 output、无动画和无定时器契约。
- 设计依据、备选方案与验收标准由 ADR 0009 持有；不复制平行 JSX。

## 文件与接口

新增：

- `apps/terminal/src/config/market-header.ts`：11 个指标/倒计时消息描述符及收藏空状态文案，保留 `.message` 英文源串。
- `apps/terminal/src/components/trade/header/favorites-strip-view.tsx`：`items: readonly { name; label; changeText?; changeTone?: "up" | "down" | "flat"; active }[]`、`emptyLabel`，可选 `onSelect(name)`、`onRemove(name)`、`selectLabel(name)`、`removeLabel(name)`。原 Button link 的几何与状态 classes 由原生按钮保留，无 runtime UI 包依赖；无回调时仍渲染按钮与涨跌文字槽，便于 inert 占位。
- `apps/terminal/src/components/trade/chart/token-selector-trigger-view.tsx`：`pairName`、可选 `kindBadge`/`leverageBadge`、`isSpot`、`open`、`showAssetIcon`、可选 `icon: ReactNode`；透传 button props、className 与 React 19 ref。桌面含完整 button，mobile 分支保持原标记。
- `apps/terminal/src/components/trade/components/asset-icon-slot-view.tsx`：`icon: ReactNode`、`interactive: boolean`，透传 button/aria props 与 className，交互态透传 ref；非交互态为 span。保持移动 32px，桌面 36px 与内部 26px 图标覆盖。
- `apps/terminal/src/components/trade/market-overview-view.tsx`：`stats: readonly { id; label: ReactNode; value: ReactNode; labelClass?; valueClass? }[]`、`ariaLabel`、`dataset?: boolean`（默认 true，控制 data-market-stat）。保留 StatBlock、键盘滚动和隐藏滚动条；列宽随内容、gap-8。
- `apps/terminal/src/components/trade/layout/market-header-view.tsx`：`head: ReactNode`、`socials?: ReactNode`、`overview: ReactNode`；统一根节点、head/socials/overview 插槽布局。
- `apps/terminal/src/components/trade/layout/desktop-placeholders.ts`：默认 BTC-USDC、ETH-USDC、HYPE-USDC，无涨跌值、无激活；市场头 trigger 使用 —/—/-，六项指标值为 FALLBACK_VALUE_PLACEHOLDER。
- 两项测试：`market-header-view-parity.test.tsx`、`app-shell-import-boundary.test.ts`。

容器改造：`favorites-strip.tsx`（导出 props hook，保留组件入口）、`token-selector-trigger.tsx`、`token-selector.tsx`、`market-asset-info.tsx`、`market-overview.tsx`、`main-workspace.tsx`、`app-shell-skeleton.tsx`、`terminal-loading-workspace.tsx`。`mobile-market-bar.tsx` 只接入共享标签；未使用但保留兼容性的 `config/ui-text.ts` 市场指标 getter 也转向同一描述符，不再提取旧 ORACLE/VOL/OI 标签。六个 `locales/*/messages.po` 保存提取结果，其中 ar/es/fr/hi/zh 补三个新增消息 Oracle、24h Volume、Funding；Open Interest 已有译文。

文档：CHANGELOG、ADR 状态、本记录与生成 INDEX。检查 desktop-grid-layout、order-entry-layout-audit、mobile-data-presentation，未发现需要更新的 coinInfo/favorites 内部 class 说明。

## 测试断言变更

- `boot-placeholder-contract`：仅 AppShell 的禁止 `<button` 改为要求 aria-hidden 包装层具有 inert；dashboard 禁止按钮、aria-busy、单一 output 与无动画/定时器检查保留。
- `app-shell-frame`：24H VOL 改为 24h Volume；“无交互元素”改为有真实按钮且所有交互元素均位于同一个 aria-hidden + inert 祖先内，保留 output/动画/面板数检查。
- `mobile-app-shell-skeleton`：AppShell 全局“无按钮/控件”改为所有控件必须位于装饰层 inert 下；移动壳标记未改。
- `market-overview`：main-workspace 内联 overview wrapper 检查改为使用 MarketHeaderView；row 的 w-max/min-w-full 从必须存在改为必须不存在，gap-6 改为 gap-8；每个 stat 固定 min-w 映射改为 `shrink-0` 内容宽度。所有 ORACLE、24H VOL、OPEN INT、FUNDING 的输出预期改为 Oracle、24h Volume、Open Interest、Funding，保留相同数据和缺失/过期状态检查。
- `mobile-market-bar`：24H VOL 输出改为 24h Volume；Mark/ORACLE tooltip 选择条件改为 Mark/Oracle；FUNDING/Resets in 的缺值检查和“不伪造倒计时”正则改为 Funding/Resets in。
- `token-selector-trigger-visual-contract`：高度、hover/active/expanded/focus 样式和 rotate-180 断言读取新 desktop view 源文件；移动分支检查仍读取旧容器。
- `hidden-horizontal-scrollbar-contract`：overview/favorites 源文件路径指向新 view；六项滚动条断言原样保留。
- `market-asset-info`：基线复跑确认已有详情卡片断言过期；将要求 rounded-[12px]/bg-trading-panel-card 改为不含这些旧样式，增加当前 flex flex-col gap-2 py-3 结构检查。本轮未修改卡片标记。
- `i18n-reactivity-contract`：新增五视图必须有 Props 且无 Lingui/hooks/stores/browser globals/clock/random 的纯展示检查；原 reactive 容器断言保留。
- 新 parity 测试：逐元素 tag 与非颜色/tone class 对比（收藏列表和空态、触发器、交互/非交互图标、指标、含/不含 socials 的头布局）；壳和真实网格共用 views 的 source contract；真实点击与移除回调、ref、无嵌套按钮；运行时 en→zh→en 标签与 aria-label 更新且指标 DOM 节点保持。
- 新 import-boundary 测试：解析 TypeScript imports，校验视图/config/指定纯依赖与显式例外、拒绝无用例外，额外钉住 desktop-placeholders 只 import config。迁移例外是 mobile-chrome-classes、trading-input、以及按任务要求放在 layout 目录的纯 placeholder 数据模块；config/nav 和 config/trade 已由 config 白名单涵盖。
- `mobile-chrome-parity` 的禁止 button/nav/a 正则本来就作用于单独渲染的 MobileShellSkeleton，因此保持原断言，无文件变化；desktop-grid-layout、grid-content-height 同样无断言变更。

## 验证与限制

验证对象：基线 `0c8127456044390c95f7e5b4301fbbdd43a658e1` 上的本任务未提交工作区，2026-09-16。

- 初轮 Biome 的 rest 尾逗号、span aria role 与未使用 import 已修正。
- 初轮指定回归 202/205 通过：两条旧壳无按钮断言失败，按 inert 契约更新；资产卡片旧断言失败，用 HEAD 版本组件单独复跑得到同样的 16/17 结果，之后只修正过期测试。
- 新增语言切换测试捕获稳定 i18n 对象导致编译器缓存指标数组，改用 reactive `t(descriptor)` 后相关 51/51 通过。占位 trigger props 改为独立子对象，避免把 stats/ariaLabel 透传到 DOM。
- 最终用户指定 Vitest 命令：**13 files / 207 tests 全通过**，最后代码版本复跑为 11.40s，包含 ui-text getter 描述符接入和最终格式整理。
- 补充隐藏横向滚动条、i18n-hot-switch、rtl-financial-ui-contract：**3 files / 41 tests 全通过**。
- `pnpm exec biome check <全部 28 个变更 TS/TSX 文件>`：通过，No fixes applied。初次 final-check 发现 overview return 格式可简化，已格式化后复验。
- `pnpm --filter @gatu/terminal typecheck`：退出 0。
- `pnpm i18n:extract` 连续执行两遍，六个 messages.po 的 SHA-256 完全一致；`git status --short apps/terminal/src/locales` 仅显示本任务的六个目录编辑。Missing：en 为 —；ar/es/fr/hi 各 14，zh 为 5（提取最初为 17/17/17/17/8，补齐三个新增 msgid 后回落；保留其它既存缺译/模糊项）。Total count 2016。
- `pnpm memory:index && pnpm memory:check && pnpm memory:test`：通过，工具测试 8/8；任务记录最终更新后再次运行。
- `git diff --check`：通过。
- 补充 `pnpm --filter @gatu/terminal test`：**550 files passed / 14 failed / 1 skipped；6163 tests passed / 54 failed / 1 skipped**，320.59s。这是较早启动、与后续修正交叠的批次，包含一个随后已由最终 207 项定向回归修复并验证的热切换失败，不能视为最终工作区的完整绿灯。
- 其余全量失败出现在未修改的 13 个测试文件：global-settings-slippage-effective（2）、adaptive-modal-swipe-dismissal（3）、client-root-theme-lifecycle（1）、desktop-positions-panel-shell（18）、establish-connection-modal（1）、mobile-agent-sync-route（18）、mobile-input-zoom-contract（2）、mobile-order-risk-summary-contract（1）、mobile-trade-tp-sl-contract（1）、orders-table-visual-contract（1）、position-market-close-modal（1）、referral-ui-contract（3）、vite-development-cache（1）。错误包括缺失的 useInfo mock、未提供 QueryClient、无效组件 mock、旧样式/源码断言、5000ms 超时，以及 `listen EPERM 127.0.0.1:5173` 沙箱端口限制。除本任务资产卡片的单独基线复验外，未逐项基线复验这些失败，不将它们一概声称为已证明的基线缺陷；未扩展本任务修复范围。
- Playwright 实测（审查方，2026-09-16，开发服务器 `/trade/BTC`，无头 Chromium，按元素配对比较壳与真实面板的矩形）：1440×900、1280×800、1030×800 深色英文三档下，收藏星、三枚收藏芯片、图标槽（19,105 36×36）、名称触发器（55,105 186.6×36）、名称文本（59,115 75.4×16）、箭头、两枚徽标、指标行外框全部逐像素相同；六个指标块的标签与数值字体相同（10px/14px、13px/18px 600），块宽只差占位样本与真实数字的文本宽度：调整样本（价格 `0,000.0`、涨跌 `-0,000 / -0.00%`）后首列差 3.9 px、末列累计 7.8 px（调整前 35 px）。1440 浅色中文：结构与位置相同，壳内文本因字体加载时机出现 ±9 px 的宽度差（回退字体度量），与布局无关。第一轮实测发现的三处文本宽度跳动（芯片 45–90 px、指标行整体 83 px、列累计约 100 px）由第二轮的隐形宽度预留消除。生产构建与 bundle budget 见提交前核对。

## 后续与替代关系

Reviewer 补齐 Playwright 实测后审查提交；后续迁移顶栏与页脚。此前 ADR 任务记录保留其历史状态，本记录说明表面 1 的实现。遵守用户要求，未安装依赖、未暂存、未提交、未切换分支。

## 最终定向命令

```bash
pnpm --filter @gatu/terminal exec vitest run src/lib/tests/market-header-view-parity.test.tsx src/lib/tests/app-shell-import-boundary.test.ts src/lib/tests/boot-placeholder-contract.test.ts src/lib/tests/app-shell-frame.test.tsx src/lib/tests/mobile-app-shell-skeleton.test.tsx src/lib/tests/mobile-chrome-parity.test.tsx src/lib/tests/market-overview.test.tsx src/lib/tests/mobile-market-bar.test.tsx src/lib/tests/token-selector-trigger-visual-contract.test.ts src/lib/tests/desktop-grid-layout.test.ts src/lib/tests/grid-content-height.test.tsx src/lib/tests/i18n-reactivity-contract.test.ts favorites market-asset-info
```

```text
Test Files  13 passed (13)
Tests       207 passed (207)
```


## 2026-09-16 checkpoint：表面 1 round 2 隐形宽度预留

验证对象仍为基线 `0c8127456044390c95f7e5b4301fbbdd43a658e1` 上 `claude/placeholder-parity` 的未提交工作区；保留全部既有 surface-1 迁移与 `.build/`，本轮未安装、暂存、提交、stash、移动文件或切换分支。用户提供 reviewer 的 1440×900 逐元素盒子对比：收藏涨跌槽 0×0 对实际 46px，后续 chip 偏移 45–90px；市场概览起点 x=182.7 对 x=265.6；指标列累计偏移约 100px。这些是本轮输入证据，未取得 reviewer 原始测量文件，未宣称为本轮独立实测。

本 checkpoint 修订上文「名称 —、数值 -」的占位方案：ADR 0009 决策 2 与规则改为隐形样本预留典型文本宽度。真实 MarketOverview 的数据缺失输出保持原有格式化 `-` 与字面 `—`；收藏真实组件首个价格未到达时也预留涨跌宽度。

| 位置 | 最终隐形样本 |
| --- | --- |
| Favorites change | `-0.00%` |
| Trigger pairName | `BTC-USDC` |
| Trigger kindBadge | `Perp` |
| Trigger leverageBadge | `20x` |
| price / oracle | `00,000.0` |
| change24h | `-0,000.0 / -0.00%` |
| volume24h / openInterest | `$0,000,000,000.00` |
| funding | `+0.0000% 00:00:00` |

`null` 表示 trigger 或 StatBlock 值槽的隐形预留，badge 的 `undefined` 继续表示不渲染；样本放在原 span 上，不增加元素结构。parity 比较允许 `invisible` 的可见性差异，其余几何 class 检查保持。运行时按 routeMarketName 激活匹配收藏，预渲染壳始终不激活；普通永续名称使用 USDC 后缀，现货 base/quote 显示 base-quote，builder 永续使用现有名称 helper 和路由 dex 徽章，杠杆未知继续预留；仅有 @编号的现货名称未知继续预留，Spot 类型已知可显示。类型标签由 reactive `t` 翻译。

本轮修改：favorites-strip-view、token-selector-trigger-view、stat-block、market-overview-view、desktop-placeholders、terminal-loading-workspace、market-header-view-parity 测试、app-shell-frame 测试、ADR、规则、CHANGELOG、本记录与生成索引。

验证进度：首轮指定回归 **5 files passed / 1 failed；80 tests passed / 1 failed**。唯一失败是 app-shell-frame 原先将隐形样本计入「不可伪造行情」文本正则；改为从 DOM 副本移除 invisible 内容后继续检查可见文本，原 inert 和结构断言不变。最终检查结果待下方追加。此次未重跑浏览器盒子测量，典型宽度预留不等于任意真实行情文本宽度完全相等，后续仍需 reviewer 实测。


### Round 2 最终验证输出

最终未提交代码工作区，2026-09-16：

```bash
pnpm --filter @gatu/terminal exec vitest run src/lib/tests/market-header-view-parity.test.tsx src/lib/tests/app-shell-frame.test.tsx src/lib/tests/boot-placeholder-contract.test.ts src/lib/tests/market-overview.test.tsx src/lib/tests/mobile-app-shell-skeleton.test.tsx favorites market-asset-info
```

```text
Test Files  6 passed (6)
Tests       81 passed (81)
Duration    5.51s
```

`favorites` 参数未匹配独立测试文件；FavoritesStripView 由 market-header-view-parity 覆盖，未声称存在额外 favorites 套件。

```bash
pnpm exec biome check apps/terminal/src/components/trade/header/favorites-strip-view.tsx apps/terminal/src/components/trade/chart/token-selector-trigger-view.tsx apps/terminal/src/components/trade/chart/stat-block.tsx apps/terminal/src/components/trade/market-overview-view.tsx apps/terminal/src/components/trade/layout/desktop-placeholders.ts apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx apps/terminal/src/lib/tests/market-header-view-parity.test.tsx apps/terminal/src/lib/tests/app-shell-frame.test.tsx
```

```text
Checked 8 files in 84ms. No fixes applied.
```

- `pnpm --filter @gatu/terminal typecheck`：退出 0，无类型诊断。
- `git diff --check`：退出 0，无输出。
- 补充 `app-shell-import-boundary`、`i18n-reactivity-contract`、`token-selector-trigger-visual-contract`、`mobile-market-bar`：**4 files / 102 tests passed**（5.66s）。
- `pnpm memory:test`：**8/8 passed**。
- `pnpm memory:index && pnpm memory:check`：退出 0，输出 `Work-memory index updated.` 与 `Work-memory index verified.`；本条结果写入后再次串行复验。没有重跑全量 terminal 套件，前一 checkpoint 记载的全量失败仍保留，不将此次定向绿灯扩大为全量绿灯。

## ADR 0010 后的来源路径修正（2026-09-16）

启动占位已由 [ADR 0010](../../adr/0010-blank-until-ready-startup.md) 取代；上文仍是旧方案当时的记录，不改写其验证结论。以下 source 在移除启动占位任务中删除，元数据改链到[后续任务记录](2026-09-16-remove-startup-placeholders.md)，避免索引将历史路径误作当前文件；原来源保留于此，可用 `git show 0f7e97acb95a4211195b1ac4dd742def7f72bbc0:<路径>` 检索：

- `.claude/rules/placeholder-parity.md`
- `apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx`
- `apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx`
- `apps/terminal/src/lib/tests/market-header-view-parity.test.tsx`
- `apps/terminal/src/lib/tests/app-shell-import-boundary.test.ts`
