<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-trade-panel-view-migration",
  "date": "2026-09-16",
  "title": "桌面交易面板框架：单一来源展示组件迁移",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "下单框架共享视图迁移及后续 reviewer 验证已记录；启动占位部分已由 ADR 0010 取代，真实展示组件继续使用，历史失败和验证边界保留。",
  "thread": null,
  "baseCommit": "3ecb960e8df1e2360be9c62ac59881b9f56ec622",
  "commits": ["bfdae535", "998515a5"],
  "sources": [
    {
      "path": "docs/adr/0009-startup-placeholder-single-source.md"
    },
    {
      "path": "docs/order-entry-layout-audit.md"
    },
    {
      "path": "docs/order-entry-surface-parity.md"
    },
    {
      "path": "apps/terminal/src/components/trade/tradebox/trade-panel.tsx"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-16-remove-startup-placeholders.md"
    }
  ],
  "supersedes": []
}
-->
# 桌面交易面板框架：单一来源展示组件迁移

## 背景与范围

按用户表面 4 任务继续 ADR 0009。基线见元数据，分支 `claude/placeholder-parity`；初始仅未跟踪 `.build/`，未触碰。未取得会话 ID 或原始会话文件，thread 为 null；本记录是可核验的任务摘要，不是会话转录。用户明确禁止安装、暂存、提交、stash、git mv 和切换分支，均未执行。

## 结论与依据

采用 ADR 0009 已接受的 props-only 视图方案：真实容器持有状态、翻译、输入约束、订阅和动作；壳与运行时占位只传默认展示 props。避免把运行时依赖引入壳；静态 primitive 的解析 DOM 用 SSR 测试固定，不另建交易状态或校验模型。验收标准仍为共享结构/class、已有安全回归与 reviewer 盒子实测。代码完成不代表浏览器验收或发布。

桌面字段通过插槽保留原 NumberInput、TradeSizeSlider、SizePercentInput、Checkbox 的交互；TWAP、Scale、TP/SL、价格精度、错误段落和执行守卫未改。两处 hooks 仅将已有文案替换为共享描述符；mobile TradeHeader 的布局没有改，mobile shell JSX 原样保留。SummaryRow 仅改文件名以满足壳的 `-view` 导入边界；Scale/TWAP summary 的改动只有该导入路径。

## 文件与视图接口

全部视图无 hooks、stores、Lingui runtime、UI primitives、时钟或生成 ID。原生 props 包含 React 19 ref；ID 仅由调用者传入。

| 视图 | Props / 导出 |
| --- | --- |
| TradePanelBodyView | header、fields、footer、可选 overlays；根节点使用导出 TRADE_PANEL_CLASS，内部原 data-slot 与 class 字节不变 |
| TradeControlButtonView | labelFull、可选 labelCompact、value、可选 valueCompact/valueClassName/loading/spinnerClassName/spanAll/compact，加原生 button props/ref；runtime 传 animate-spin，壳 loading=false |
| TradeHeaderView | controls、tabs、sideToggle、orderTypeIndex、compact；compact 未提供的旧 runtime 调用仍显式传 false |
| OrderTypeTabView | active、label、可选 labelCompact，加原生 button props/ref；导出 orderTypeTabClass，dual label 分支包含旧 Dropdown minimal/sm 的全部解析 classes |
| SideToggleView | side、labels（buy/sell/buyAria/sellAria）；导出 sideBox，mobile-chrome-classes 原样重导出；静态 indicator left 0%/50%、width 50% |
| TradeAvailableRowView | label、可选 value/action/positionLabel/positionValue 插槽，Tooltip 和 max/swap actions 留给容器 |
| TradeInputFrameView | label、可选 trailing/input/frameClassName，加原生 input props/ref；runtime input 插槽仍为原 NumberInput（含 Trigger Price）；导出 TRADE_INPUT_CLASS、TRADE_INPUT_FRAME_CLASS，静态 input 使用 ui/input-styles 的 getInputClassName；重导出 tradingInputFrameClass 供移动壳原 JSX 使用（Round 2 更新） |
| TradeSizeUnitView | unit:string/null 加原生 button props/ref；null 用 invisible BTC，runtime 显示真实 sizeModeLabel |
| TradeSizeSliderRowView | slider、percent 插槽，只持有桌面两列外框 |
| TradeSliderView | dir、className、unavailable、inputId、ariaLabel、showTicks、ticks:readonly number[]、progress:0..1、rtl；controlRef/indicatorRef/ticksRef/thumbRef/inputRef 为 React 19 ref props；controlProps 为 div pointer handlers，inputProps 为 input 的 min/max/step/defaultValue/disabled/aria-valuetext/aria-describedby/aria-invalid/onKeyDown/onInput/onBlur；同时由 TradeSlider 与桌面壳/运行时占位渲染；导出 sliderFrame/sliderTrack（Round 2 替换并删除 TradeSizeSliderView） |
| TradePercentFrameView | frameClassName、input:ReactNode；唯一外框与尾部 %；SizePercentInput 传 NumberInput，桌面占位传共享 getInputClassName 生成 classes 的原生 input；导出 TRADE_PERCENT_INPUT_CLASS（Round 2 更新） |
| TradeOptionCheckboxesView | className、tradingPanel、reduceOnly/tpSl/children 插槽；导出 optionsGrid，由 mobile-chrome-classes 重导出；原 TradeOptionCheckboxes 继续翻译并使用真实 Checkbox |
| TradeCheckboxView | label、ariaLabel、可选 checked:false/spanAll/disabled；静态未选中，结构与真实 disabled Checkbox SSR 对照 |
| TradeCtaView | label、variant:buy/sell/cyan/restricted、可选 iconLeft，加原生 button props/ref；保留 Base UI Button filled/xs 解析类、spinner 的 pl-1.5、禁用数据属性 |
| TradeFormFieldsView | available、size、slider，以及可选 prices/sizeError/additional/options；共享字段区嵌套与 gap，不执行输入逻辑 |
| TradePanelFooterView | actions、summary；共享反馈/CTA 容器和 summary 的 border-t/pt-1 |
| SummaryRow | compact、label、children；原纯组件不改标记，仅从 summary-row.tsx 迁到 summary-row-view.tsx |

`TRADE_PANEL_PLACEHOLDER` 是默认标签/控件值/汇总行来源。`TerminalLoadingWorkspace` 以 reactive t 翻译，route base token 沿用订单簿的现货/合约路由解析，未知索引现货保持 null。PanelFrameLabels 删除九个仅旧 TradePanelFrame 使用的字段。删除 TradePanelFrame 和 CONTROL_BUTTON_CLASS；SUMMARY_ROW_CLASS、VALUE_PLACEHOLDER 仍被账户/移动未迁移表面使用，保留。壳不再直接导入 lib/ui/trading-input。

## 精确初始文案与源码依据

- `TradeHeader` 的 margin 分支：`Cross`；`leverage ?? 1`：`1x`。
- `useAccountAbstractionControl` → `useUserAbstraction`（无钱包禁用 query）与 `useAccountModeLabels`、TradeHeader 的 null fallback：完整/紧凑值均为 `Account`，未连接且无 query 请求时不显示 spinner。加载/更新 runtime 的 spinner 与禁用守卫保留。
- `TradeFormFields`：断开态 Available 只显示标签，value span 为空；Position 仅非现货且 positionSize≠0 出现。因此壳不伪造可用余额或仓位数值。
- Size draft 是空串，保留原输入的 `placeholder="0.00"`，没有伪造 `value="0.00"`；单位未知预留 invisible `BTC`，运行时占位用路由 token；百分比输入 `0`，尾部 `%`，滑杆 0，选项未选中且禁用。
- CTA 为 `Connect Wallet`，复用 DESKTOP_NAV_LABELS.wallet；useButtonContent 仍决定阶段和执行动作，只有翻译来源替换。
- `OrderSummary` + `FALLBACK_VALUE_PLACEHOLDER`：Liq. Price、Order Value、Margin Req.、Est. Slippage 均为 ASCII `-`，不是 `—` 或 `$0.00`。
- `DEFAULT_MARKET_ORDER_SLIPPAGE_PERCENT` = 2.5，所以默认 Slippage 是 `2.5%`，带 PencilIcon。没有把用户示例 `1.0%` 当实现事实。
- `useFeeRates` 的默认 perp rates 为 0.00045/0.00015，client-root 的 DEFAULT_BUILDER_CONFIG.f=10；buildOrderFeeQuote 加 builder rate，formatOrderFeeRatePercent 固定 toFixed(4)，所以默认 Fees 是 `0.0550% / 0.0250%`，title `Taker / Maker`。测试直接使用现有计算/格式函数与真实 OrderSummary 对比；最初隐藏费率样本以及后续三位小数假设均已被源码和测试纠正，最终以真实四位格式为准。

新增 config/trade-panel-labels.ts 的每个描述符均由运行时翻译；Size 复用 ORDERBOOK_LABELS.size。ui-text.ts 原来只有 SideLabels 类型、没有 side 消息描述符，且仍含 Lingui 全局 getter；因此在新的纯 config/trade-panel-labels.ts 中添加 SIDE_LABELS，由原 useOrderEntryData 翻译，壳不导入旧 getter 模块。六种语言的提取总数仍为 2016，无新增 msgid；原有缺译 ar/es/fr/hi 各 14、zh 5 不变。

## 测试断言变更

- 新 trade-panel-view-parity：递归结构/class 对比；真实断开 TradeHeader、TradeFormFields 和默认 OrderSummary 对照壳；placeholder/sample props 几何；side primitive 的两种 active 值和 static indicator；slider/percent/checkbox SSR；CTA 四种 variant × enabled/disabled × spinner/no spinner 精确属性/class；Advanced bare/renderTrigger/旧 trigger 三方对比；native refs、点击、禁用与 Dropdown ArrowDown/菜单选择；route BTC、builder TSLA、现货 PURR、索引现货、无 route；en→zh→en DOM 身份；纯度及调用者接线。
- side/CTA primitive 对照只忽略 `role`、`id`、`aria-*`、`data-*`、`tabindex`、`hidden`、`style`，不忽略任何 class；一般展示几何比较 tag/class/children，唯一忽略的 class 是 `invisible`，文字和其它属性不参与该几何比较，重要默认值/style 单独断言。不存在忽略 border/padding/radius/height/font 等几何 token 的例外。
- app-shell-import-boundary：删除 lib/ui/trading-input legacy exception，增加 trade views 导入断言，原无 runtime primitive 和无多余 exception 断言保持。
- boot-placeholder-contract：将所有新 view 和 summary-row-view 加入无动画源扫描；控制卡动画类由 runtime 传入，壳源码及渲染均无 animate-spin/pulse，计时器断言保持。
- app-shell-frame：新增 trade 根/区域 class、三个 cards/tabs、空 Size value、无动画、所有 input/button 位于 inert 内的断言。
- responsive-panel-layout：根 class 改从 trade-panel-body-view 读取，原容器查询约束保持，额外验证 TradePanel 接线。
- mobile-chrome-parity：optionsGrid 的源码断言指向新的所有者视图，并检查 mobile-chrome-classes 重导出 optionsGrid/sideBox；移动壳的实际 class/DOM/locale 检查保持。
- orderbook-panel-view-parity：只将 renderDesktopPanelFrame 的 source 接线预期增加第四参数 tradePanel；没有改任何订单簿数据/行为断言或实现。
- i18n-reactivity-contract：pure 列表增加全部新视图与改名的 SummaryRow；reactive 容器断言保持。
- i18n-hot-switch：原夹具增加真实桌面 TradeHeader 和 Market/Limit 中文消息；增加 controls、tabs 身份不变和市价/限价更新断言，原 checkbox 状态/路径/订单协议值检查保持。
- 两个浏览器 fixture 仅更新 TradePanelBodyView 的 import/fields API，将旧 root class 移交新 root，fixture-specific data-order-type 与外层 height 仍保留；浏览器断言不改。
- 用户指定的 trade-header-mobile-actions、order-submission-wiring、trade-form-fields-order-entry-data、order-toast-placement、trade-form-*、mobile-app-shell-skeleton 等无需修改断言即继续验证；没有放宽订单输入、校验、执行或安全断言。

## 验证与限制

验证对象：上述 HEAD 上未提交的本任务工作区。初轮完整指定组为 395 pass / 2 fail，失败是旧源码归属（optionsGrid、trade-panel-container），已按新所有者更新；补充默认 summary 测试抓出费率必须四位小数，中文夹具缺 Limit 译文已补。没有改 timeout 或移除用例。

最终命令及输出在下方补全；没有全量生产构建或发布。本地脱敏命令日志保存在 Git 忽略的 `.worklog/2026-09-16/trade-panel-view-migration/`，不是完整会话。

## Playwright / 盒子测量（留给 reviewer）

已实际尝试两条指定命令：

```bash
pnpm --filter @gatu/terminal exec playwright test --config tests/browser/playwright.config.ts
pnpm --filter @gatu/terminal exec playwright test --config tests/browser/mobile-trade-all-orders.playwright.config.ts
```

均退出 1：Vite webServer 无法监听，分别 `listen EPERM: operation not permitted 127.0.0.1:4179` 和 `127.0.0.1:4183`。未进入 Chromium 测试，没有 Playwright 通过数。配置保持其原有隔离缓存 `.vite-browser` / `.vite-mobile-trade-all-orders`，未使用应用 dev server，未请求提权或改端口绕过沙箱。

待 reviewer：两套 fixture 全部订单类型，以及 ADR 0009 的壳/真实盒子比较（桌面 1440/1280/1030、移动 390/360/430，深浅主题，en/zh）。没有填写未执行的测量数字，表面 4 待 reviewer 实测。

## 后续与替代关系

本记录只覆盖表面 4，不取代表面 1–3 的历史验收。代码审查和浏览器实测交 reviewer，尚未测量的结果不视为完成验收。按用户要求不创建提交、不推送。

## 最终验证命令

```bash
pnpm --filter @gatu/terminal exec vitest run --maxWorkers=2 src/lib/tests/trade-panel-view-parity.test.tsx src/lib/tests/orderbook-panel-view-parity.test.tsx src/lib/tests/top-nav-footer-view-parity.test.tsx src/lib/tests/market-header-view-parity.test.tsx src/lib/tests/app-shell-import-boundary.test.ts src/lib/tests/boot-placeholder-contract.test.ts src/lib/tests/app-shell-frame.test.tsx src/lib/tests/mobile-app-shell-skeleton.test.tsx src/lib/tests/mobile-chrome-parity.test.tsx src/lib/tests/responsive-panel-layout.test.ts src/lib/tests/desktop-grid-layout.test.ts src/lib/tests/grid-content-height.test.tsx src/lib/tests/order-entry.test.ts src/lib/tests/order-entry-store.test.tsx src/lib/tests/trade-form-twap-advanced.test.tsx src/lib/tests/trade-form-compact-fields.test.tsx src/lib/tests/trade-form-tp-sl.test.tsx src/lib/tests/trade-header-mobile-actions.test.tsx src/lib/tests/order-submission-wiring.test.ts src/lib/tests/trade-form-fields-order-entry-data.test.tsx src/lib/tests/order-toast-placement.test.tsx src/lib/tests/trade-panel-collateral-acquisition.test.ts src/lib/tests/mobile-order-safety-contract.test.ts src/lib/tests/i18n-reactivity-contract.test.ts src/lib/tests/i18n-hot-switch.test.tsx tests/mobile-trade-size-validation-a11y.test.tsx skeleton-fallback root-route-transition
pnpm exec biome check <本任务所有变更 TS/TSX 文件>
pnpm --filter @gatu/terminal typecheck
pnpm i18n:extract
pnpm memory:index && pnpm memory:check && pnpm memory:test
git diff --check
```

packages/ui 无修改，因此无需根 pnpm typecheck。另逐字核验：MobilePanelFrameLabels 到移动壳文件末尾、TradePanel 最终 JSX 前的业务函数体、TradeFormFields JSX 前的逻辑均与 HEAD 相同。该源码核验不代替浏览器验收。

## 完整文件清单

新增：

- `apps/terminal/src/components/trade/components/summary-row-view.tsx`
- `apps/terminal/src/components/trade/tradebox/order-type-tab-view.tsx`
- `apps/terminal/src/components/trade/tradebox/side-toggle-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-available-row-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-checkbox-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-control-button-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-cta-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-form-fields-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-header-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-input-frame-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-option-checkboxes-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-panel-body-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-panel-footer-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-percent-frame-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-size-slider-row-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-size-slider-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-size-unit-view.tsx`
- `apps/terminal/src/config/trade-panel-labels.ts`
- `apps/terminal/src/lib/tests/trade-panel-view-parity.test.tsx`
- `docs/work-memory/sessions/2026-09-16-trade-panel-view-migration.md`

修改：

- `CHANGELOG.md`
- `apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx`
- `apps/terminal/src/components/trade/layout/desktop-placeholders.ts`
- `apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-chrome-classes.ts`
- `apps/terminal/src/components/trade/tradebox/order-summary.tsx`
- `apps/terminal/src/components/trade/tradebox/scale-order-summary.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-form-fields.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-header.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-option-checkboxes.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-panel.tsx`
- `apps/terminal/src/components/trade/tradebox/twap-order-summary.tsx`
- `apps/terminal/src/hooks/trade/use-order-entry-data.ts`
- `apps/terminal/src/lib/tests/app-shell-frame.test.tsx`
- `apps/terminal/src/lib/tests/app-shell-import-boundary.test.ts`
- `apps/terminal/src/lib/tests/boot-placeholder-contract.test.ts`
- `apps/terminal/src/lib/tests/i18n-hot-switch.test.tsx`
- `apps/terminal/src/lib/tests/i18n-reactivity-contract.test.ts`
- `apps/terminal/src/lib/tests/mobile-chrome-parity.test.tsx`
- `apps/terminal/src/lib/tests/orderbook-panel-view-parity.test.tsx`
- `apps/terminal/src/lib/tests/responsive-panel-layout.test.ts`
- `apps/terminal/src/lib/trade/use-button-content.ts`
- `apps/terminal/src/locales/ar/messages.po`
- `apps/terminal/src/locales/en/messages.po`
- `apps/terminal/src/locales/es/messages.po`
- `apps/terminal/src/locales/fr/messages.po`
- `apps/terminal/src/locales/hi/messages.po`
- `apps/terminal/src/locales/zh/messages.po`
- `apps/terminal/tests/browser/trade-panel-all-orders.fixture.tsx`
- `apps/terminal/tests/browser/trade-panel-layout.fixture.tsx`
- `docs/adr/0009-startup-placeholder-single-source.md`
- `docs/order-entry-layout-audit.md`
- `docs/work-memory/INDEX.md`

删除：

- `apps/terminal/src/components/trade/components/summary-row.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-panel-body.tsx`

## 最终验证输出

2026-09-16，同一未提交工作区：

```text
指定完整 Vitest 命令（--maxWorkers=2）：
Test Files  28 passed (28)
Tests       419 passed (419)
Duration    55.09s

末次测试类型修正后的 trade-panel-view-parity 单独复跑：
Test Files  1 passed (1)
Tests       24 passed (24)
Duration    12.36s

Biome：Checked 40 files in 25ms. No fixes applied.
pnpm --filter @gatu/terminal typecheck：exit 0。
pnpm i18n:extract：exit 0，2016 messages，无新增 msgid。
pnpm memory:index：Work-memory index updated.
pnpm memory:check：Work-memory index verified.
pnpm memory:test：8 tests / 8 pass / 0 fail。
git diff --check：exit 0，无输出。
```

测试的 DEFAULT_BUILDER_CONFIG.f 访问改为 `?.f ?? 0`，与生产 hook 的可选配置类型一致；默认四位费率断言没有变，24 项单独复跑以及最后的完整 419 项均已覆盖修正。最后一轮还确认占位的 active、position 和未选中选项由同一配置对象传入。类型检查曾报告 TS18048（配置类型可 undefined），已修正。一次中间补跑将 i18n-reactivity 文件误写为 .tsx，只命中 27 文件/316 项；该次结果不作为完整回归证据，随后使用已核验的 .ts 路径执行了上面的 28 文件/419 项完整命令。

初期 fixture 机械迁移曾出现 JSX 闭合错误，静态 checkbox 曾有不适用的 ARIA 属性 lint；均在完整通过前修正。memory:index 首次提示缺少模板固定标题，已改为规范的四个标题并串行通过三项检查。上述失败不作为通过结果隐藏；生产订单逻辑没有为修复测试而更改。

最终文件统计：新增 20、修改 33、删除 2；删除项以新 -view 文件承接。暂存区为空，HEAD 未变，未执行提交；初始未跟踪 `.build/` 保留。

Biome 调用传入全部 42 个变更 TS/TSX 路径；仓库 biome.json 的 files.includes 不包含 tests/browser，因此实际检查 40 个 src 文件，两份 browser fixture 被原配置排除（没有调整配置绕过它）。terminal typecheck 包含这两份 fixture 并通过，浏览器执行仍受上述沙箱限制。


## Round 2 — 删除剩余应用组件复制树

2026-09-16 在 Round 1 未提交工作区继续；保留既有修改，未操作 `.build/`，用户继续明确禁止安装、暂存、提交、stash、git mv 与切换分支。此节更正 Round 1 对 slider/percent SSR 对照已足够的判断：TradeSlider 与 SizePercentInput 是应用组件，不能使用仅为不可渲染 UI primitive 保留的复制例外。

### 范围与接线

- 原 `tradebox/trade-size-slider-view.tsx` 复制了 `TradeSlider`。现在删除该文件，原完整 DOM 移入 `components/trade-slider-view.tsx`；TradeSlider 保留 hooks、drag session、keyboard、RAF、timer、cleanup 及原初始 progress/RTL refs，并向该 view 传 refs 与事件。桌面壳和 TerminalLoadingWorkspace 共同经 renderDesktopPanelFrame 渲染该 view（progress=0、禁用、无 handlers、五个 ticks）。sliderFrame/sliderTrack 只定义在新模块，mobile-chrome-classes 仅重导出；移动壳 JSX 不变，MobileTradeSizeControl 仍使用 TradeSlider。
- 原 `TradePercentFrameView` 复制 SizePercentInput 的外框。现在唯一 frame + `%` span 由该 view 渲染，SizePercentInput 传原 NumberInput 插槽，draft/identity、clamp、handlers 不变。桌面静态输入通过同一个 getInputClassName 和百分比输入附加 class 常量生成类。
- 原 `TRADE_INPUT_BASE_CLASS` 复制 Input 的 styles。现在删除它，inputBaseStyles/inputSizeStyles/mobileSafeInputStyles/getInputClassName 及 InputSize 移入纯 `ui/input-styles.ts`（仅依赖 cn）；input.tsx 导入并重导出，旧调用者路径继续有效。
- Trigger Price 使用 TradeInputFrameView，保留完整 label/quote span、NumberInput、错误和禁用 classes。
- TerminalLoadingWorkspace 使用同步 useMarketOrderSlippagePercent 读取全局持久化设置，以与 OrderSummary 相同的数值字符串加 `%` 显示；预渲染壳仍为默认 2.5%。

### 断言变更

- trade-panel-view-parity：原复制 slider/percent geometry 单测拆为共享 slider 完整 SSR 等值（只由调用者统一 input ID）与共享 percent frame geometry；增加 TradeSlider/SizePercentInput 源码调用 view 断言。保留 thumb style、五 tick、input value，并新增 tick active 值与真实壳 slider 完整 DOM 对照。
- 对实际 shell 的 default/sm 静态输入分别断言 class list 与对应 NumberInput SSR 完全一致；原输入 ref 与结构检查保留。
- 增加运行时持久化滑点 1.25%→3% 更新、面板身份保留和壳默认 2.5% 断言。
- app-shell-import-boundary：允许 shell/view 导入精确纯样式 specifier `@/components/ui/input-styles`，断言 slider view 与样式实际接线，并检查 input-styles 仅导入 cn，禁止混入 React/Base UI 运行时依赖。
- parity 纯度扫描、boot-placeholder-contract 无动画扫描及 i18n-reactivity-contract 纯视图清单替换删除的 slider 路径为新共享 view；其余 Round 1 断言保留。
- mobile-chrome-parity：sliderFrame/sliderTrack 源检查从 TradeSlider 移到 TradeSliderView，保留壳输出 class 检查，增加 view 使用唯一常量、mobile-chrome-classes 重导出和 TradeSlider 渲染 view 的接线断言。

### 验证与限制

用户在本轮开始提供 reviewer Round 1 测量：1440/1280/1030、light 和 zh，header 139.8 px、fields 333.3/340.3 px、footer 197 px、side toggle 34 px、CTA 40 px，所有 control/tab/frame/checkbox/summary row 一致。这是用户提供的前一版测量，非本轮重新执行的 Playwright 证据。本轮保留 DOM 与几何 classes，并完成以下 SSR、源码、交互和静态检查；本轮没有重新执行浏览器盒子测量，不把前版 reviewer 数值标记为本轮实测。


### 本轮检查过程与既有失败

逐字对比本轮开始时捕获的未提交源码：移动壳 MobilePanelFrameLabels 之后全部 JSX、mobile-trade-size-control.tsx、TradeSlider/SizePercentInput 最终 JSX 前的逻辑均保持；input-styles 的四项定义及 InputSize 与原 input.tsx 对应代码逐字一致。mobile-chrome-classes 相对 Round 1 的唯一修改是两个 slider 常量改为重导出。

初次定向测试 6 文件 / 76 项：75 通过，新增持久化滑点测试因引用未导出的 useGlobalSettingsStore 失败；改为通过公开 useGlobalSettingsActions/useMarketOrderSlippagePercent probe 设置和读取后通过。首次类型检查还发现 summaryRows 被 as const 推导为固定六项 tuple，无法接收运行时 map；改用 satisfies 声明合法 label key/value shape，默认数据不变，不做不安全的 tuple 类型强转。修正后类型检查 exit 0。

首次完整 31 文件 / 587 项：27 文件通过、4 文件失败；581 项通过、6 项失败。mobile-chrome-parity 仍找旧容器内的 mobileChrome.sliderFrame，已按上面的共享 view 接线修正。其余三个测试文件的五项失败在 Round 2 开始时的源码快照中重现：

- position-market-close-modal：期望 summary class 含 rounded-[12px]/border/bg-market-close-card，实际为 py-3 min-[1001px]:py-3.5（1 项）。
- global-settings-slippage-effective：A2 的 store mock 未被调用、draft 未归一到 5；A4 读取旧 getAriaValueText mock 得到 undefined（2 项）。
- mobile-input-zoom-contract：TP/SL mobileSafe 文本计数期望 15、实际 8；TWAP 的 mobileSafe 源码匹配要求距离组件开头不超过 300 字符，当前源码不满足（2 项）。

没有修改这些既有测试或它们的业务组件。基线复跑通过 Vite 的只读 load 插件从 `/private/tmp/surface4-round2/baseline/` 提供已捕获的旧源码，未回退当前文件；结果为 3 文件失败，5 项失败 / 19 项通过（24 项），与上述失败相同。临时配置首次以 .ts 加载遇到 ESM/CJS 插件互操作错误，换为 .mts 后正常执行。快照、临时配置、日志仅在本机临时目录，未加入仓库。

### 完整验证命令

检索同时覆盖静态/dynamic import、mock 与源码引用，故下列 31 文件是用户点名集合与相关导入测试的保守并集。

```bash
pnpm --filter @gatu/terminal exec vitest run --maxWorkers=2 \
  src/lib/tests/trade-panel-view-parity.test.tsx \
  src/lib/tests/app-shell-import-boundary.test.ts \
  src/lib/tests/boot-placeholder-contract.test.ts \
  src/lib/tests/app-shell-frame.test.tsx \
  src/lib/tests/mobile-app-shell-skeleton.test.tsx \
  src/lib/tests/mobile-chrome-parity.test.tsx \
  src/lib/tests/trade-form-compact-fields.test.tsx \
  src/lib/tests/trade-form-twap-advanced.test.tsx \
  src/lib/tests/trade-form-tp-sl.test.tsx \
  src/lib/tests/trade-form-fields-order-entry-data.test.tsx \
  src/lib/tests/order-entry-store.test.tsx \
  src/lib/tests/i18n-reactivity-contract.test.ts \
  src/lib/tests/i18n-hot-switch.test.tsx \
  tests/mobile-trade-size-validation-a11y.test.tsx \
  src/lib/tests/funds-action-balances.test.tsx \
  src/lib/tests/global-settings-modal.test.tsx \
  src/lib/tests/mobile-input-zoom-contract.test.ts \
  src/lib/tests/mobile-trade-size-control.test.tsx \
  src/lib/tests/number-input.test.tsx \
  src/lib/tests/position-isolated-margin-modal.test.tsx \
  src/lib/tests/position-limit-close-modal.test.tsx \
  src/lib/tests/position-market-close-modal.test.tsx \
  src/lib/tests/position-tpsl-modal.test.tsx \
  src/lib/tests/size-percent-input.test.tsx \
  src/lib/tests/trade-size-slider-a11y.test.tsx \
  src/lib/tests/trade-size-slider.test.tsx \
  src/lib/tests/use-size-slider-interaction.test.tsx \
  tests/global-settings-slippage-effective.test.tsx \
  tests/position-close-slider-effective-aria.test.tsx \
  tests/trade-size-slider-deferred-commit-race.test.tsx \
  tests/trade-size-slider-pointer-lifecycle.test.tsx
pnpm --filter @gatu/terminal typecheck
pnpm memory:index && pnpm memory:check && pnpm memory:test
git diff --check
```

Biome 精确文件集合（Round 2 的全部 17 个 TS/TSX 文件）：

```bash
pnpm exec biome check \
  apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx \
  apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx \
  apps/terminal/src/components/trade/tradebox/trade-input-frame-view.tsx \
  apps/terminal/src/components/trade/tradebox/trade-form-fields.tsx \
  apps/terminal/src/components/trade/tradebox/trade-percent-frame-view.tsx \
  apps/terminal/src/components/trade/components/trade-slider.tsx \
  apps/terminal/src/components/trade/components/size-percent-input.tsx \
  apps/terminal/src/components/trade/mobile/mobile-chrome-classes.ts \
  apps/terminal/src/components/ui/input.tsx \
  apps/terminal/src/lib/tests/trade-panel-view-parity.test.tsx \
  apps/terminal/src/lib/tests/i18n-reactivity-contract.test.ts \
  apps/terminal/src/lib/tests/boot-placeholder-contract.test.ts \
  apps/terminal/src/lib/tests/app-shell-import-boundary.test.ts \
  apps/terminal/src/components/trade/components/trade-slider-view.tsx \
  apps/terminal/src/components/ui/input-styles.ts \
  apps/terminal/src/components/trade/layout/desktop-placeholders.ts \
  apps/terminal/src/lib/tests/mobile-chrome-parity.test.tsx
```


### Round 2 最终验证输出

最终未提交代码（含 mobile-chrome-parity 接线断言修正）：

```text
31 文件完整 Vitest 命令（--maxWorkers=2），exit 1：
Test Files  3 failed | 28 passed (31)
Tests       5 failed | 582 passed (587)
Duration    54.22s

trade-panel-view-parity：28/28 passed。
用户逐一点名的 14 个测试文件均通过；五项失败全部来自额外检索集合，且已在本轮前源码快照重现。

Biome：Checked 17 files in 140ms. No fixes applied.（exit 0）
pnpm --filter @gatu/terminal typecheck：exit 0。
pnpm memory:index：Work-memory index updated.
pnpm memory:check：Work-memory index verified.
pnpm memory:test：8 tests / 8 pass / 0 fail。
git diff --check：exit 0，无输出。
```

Node 为 22.13.0，pnpm 10.21.0；命令提示仓库要求 Node >=22.15.0，本轮按用户要求未安装或升级依赖。最终完整回归仍存在上文列明的三文件五项既有失败，不能报告全绿；未改动这些测试来掩盖失败。运行时 slider/percent/input/mobile 与点名交易/i18n/placeholder 回归均在最终命令中通过。未发布、未提交，也没有新的实机/浏览器几何验收声明。

## Reviewer 复核与 Playwright 实测（2026-09-16，同一未提交工作区，含 Round 2）

复核方式：通读 Round 1/2 全部 diff，对照 HEAD 的 `trade-panel.tsx`/`trade-header.tsx`/`trade-form-fields.tsx`/`trade-slider.tsx`/`size-percent-input.tsx` 逐类名核对；用 scratchpad 的 `tradepanel-diff.mjs` 在开发服务器（:3005，`/trade/BTC`）记录壳与真实终端 tradingInterface 面板内的键控盒（header/fields/footer 三区、三个控件卡、三个页签与下划线、切换及其指示条、字段区各行、输入框/滑杆拇指/百分比框/复选框、CTA、六行汇总）。壳取字体就绪后卸载前的最后一帧，真实取 oracle 数值与 CTA 出现且字体就绪的帧。

Round 1 审查结论：表头控件、页签、切换、CTA、汇总、字段区容器均为真实组件与壳共享的视图；但 `TradeSizeSliderView` 与 `TradePercentFrameView` 是对 `TradeSlider`/`SizePercentInput` 标记的复制（第二棵树，仅靠 SSR 对照钉住），`TRADE_INPUT_BASE_CLASS` 抄自 `components/ui/input.tsx`，触发价框架未迁移，运行时占位滑点用默认值而非持久化值。Round 2 已由 Codex 修正：`TradeSlider` 渲染纯 `TradeSliderView`（refs 与 `controlProps`/`inputProps` 透传），`SizePercentInput` 渲染 `TradePercentFrameView`（`input` 插槽），输入类拆到纯模块 `components/ui/input-styles.ts` 由 `input.tsx` 重导出，触发价改用 `TradeInputFrameView`，`TerminalLoadingWorkspace` 同步读取持久化 `marketOrderSlippagePercent`。Round 2 后指定回归 31 文件 463 用例（`--maxWorkers=2`）、Biome 44 文件、workspace typecheck 通过。

| 视口 / 主题 / 语言 | 三区 | 表头 | 字段区 | 页脚 |
| --- | --- | --- | --- | --- |
| 1440 dark en | header 139.8、fields 333.3、footer 197 高全等；面板宽 266.4 vs 266（网格几何源亚像素差，见表面 3 记录） | 控件卡 76.8×42.8 r10 vs 76.7×42.8；页签 80.8×35，下划线 y=154.8 高 2；切换 242.4×34 r10，指示条 120.2×32 r9 vs 120×32 | Available 行/Size 框 36 r10/输入 32 高/滑杆拇指 18 r9999/百分比框 64×32 r8/两个复选框 17×17 r5 全等（y 全等） | CTA 242.4×40 r12 vs 242×40；六行汇总各 20 高、y 全等 |
| 1280 dark en | 139.8 / 340.3 / 197 全等 | 全等 | 全等 | 全等 |
| 1030 dark en | 139.8 / 340.3 / 197 全等 | 全等 | 全等 | 全等 |
| 1440 light en | 同 1440 dark | 同 | 同 | 同 |
| 1440 dark zh | 三区高度全等 | 文本宽度差 | Size 输入 142.5 vs 140.1（"数量" 标签更宽） | 全等 |
| Round 2 后 1440 dark en | 三区高度不变 | 不变 | 滑杆/百分比框/输入全等 | 不变 |

差异只剩面板亚像素宽度、真实里 Base UI 复选框的 1×1 隐藏 input（无几何）与文本宽度。

Playwright（Round 1 代码）：`playwright.config.ts` 107 例 106 通过，唯一失败 `drawer-interactions.pw.ts` 的"drawer closes from a native swipe"与 `adaptive-modal-swipe-dismissal` 基线红同源（fixture 仅用 `TradeSlider`，与本任务改动无关）；`mobile-trade-all-orders.playwright.config.ts`（含 `desktop-order-entry-layout.pw.ts`）29/29 通过。Round 2 后的浏览器复跑、全量套件与构建结果见下一节。

## Round 2 后的浏览器复跑、全量套件与生产构建（reviewer）

- Playwright：`playwright.config.ts` 下的 `trade-panel-layout`、`trade-panel-all-orders`、`trade-size-slider-performance`、`desktop-order-entry-layout` 四个规格 30/30 通过（1.6 min）；`mobile-trade-all-orders.playwright.config.ts` 29/29 通过（2.2 min）。
- `pnpm --filter @gatu/terminal test`（568 文件 / 6308 用例）：13 文件失败。9 个是表面 2/3 记录的基线红文件（失败数不变）；`mobile-agent-sync-route`(18) 与 `establish-connection-modal`(1) 为并发/计时敏感（前者单独运行 20/20 通过）；另外两个是 Round 2 引入的真实回归，reviewer 已修复：`trade-terminal-page-boot` 的全局设置 store mock 缺少 `TerminalLoadingWorkspace` 新读取的 `useMarketOrderSlippagePercent`（补 mock 返回 2.5，13/13 通过），`trading-panel-theme-contract` 读取 `components/ui/input.tsx` 检查选择文本类而这些类已移入 `input-styles.ts`（改读该模块，8/8 通过）。
- `pnpm build` 通过：客户端总预算 3,084,029 gzip 字节（较表面 3 提交后 +3,350，较基线 −70,678）；trade 静态启动闭包 1,577,230（+7,009，壳新增下单视图）；桌面运行时增量 195,055（+3,067）。预渲染壳核对（`grep -a`）：`trade-panel-container` 2、`data-slot="trade-panel-header"` 1、`trade-control-grid` 1、`data-trade-slider-thumb` 1、`data-slot="trade-order-options"` 1、`Fees` 1、`animate-spin` 0。构建不是发布。

## ADR 0010 后的来源路径修正（2026-09-16）

启动占位已由 [ADR 0010](../../adr/0010-blank-until-ready-startup.md) 取代；上文仍是旧方案当时的记录，不改写其验证结论。以下 source 在移除启动占位任务中删除，元数据改链到[后续任务记录](2026-09-16-remove-startup-placeholders.md)，避免索引将历史路径误作当前文件；原来源保留于此，可用 `git show 0f7e97acb95a4211195b1ac4dd742def7f72bbc0:<路径>` 检索：

- `.claude/rules/placeholder-parity.md`
- `apps/terminal/src/components/trade/layout/desktop-placeholders.ts`
- `apps/terminal/src/lib/tests/trade-panel-view-parity.test.tsx`

## 周整理追加（2026-09-21）

初轮待 reviewer 的状态不代表最终记录，正文已有后续复核与检查。当前 [ADR 0010](../../adr/0010-blank-until-ready-startup.md) 移除启动占位，但保留 props-only 真实视图；本次只更新检索摘要，不把旧占位几何测量当成新启动流程的验收。 本次依据与版本边界见 [周整理记录](2026-09-21-weekly-memory-review.md)。
