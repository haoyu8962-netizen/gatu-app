# 数字格式设置与日期、排序的 locale 规则

本文是数字格式设置的归属文档：它拥有选项、存储、哪些面跟随它、哪些面跟随界面语言，以及对应的回归入口。背景与未完成项见[对齐规划](number-format-and-chart-translation-plan.md)。

## 规则

1. **数字跟随数字格式设置，不跟随语言。** 价格、数量、百分比、金额、紧凑单位（`K/M`）和文档标题里的价格都经 `lib/format.ts`：用 `en-US` 的 `Intl.NumberFormat.formatToParts` 分解，再按设置替换 `group` 与 `decimal` 两类 part（`numberSeparatorsByFormatLocale`）。数字永远是拉丁数字，只有分隔符变化。
2. **日期与时间跟随界面语言，数字系统固定拉丁。** `formatTime`、`formatDateTime`、`formatDateTimeShort` 用 `languageToIntlLocale[i18n.locale]` 选格式，并强制 `numberingSystem: "latn"`，所以阿拉伯语界面的 `٧:٠٥` 变为 `7:05`，与同一行的价格数字一致。显式传 `locale` 时接受界面语言代码（`zh`）或 Intl locale（`zh-CN`），前者按映射表解析。24 小时制等既有约定不变（`recent-trades.md`：`HH:mm:ss`、`hourCycle: "h23"`）。组件与 Hook 调用这三个函数和 `formatList` 时一律传 `locale`，effect、事件回调与 CSV 导出列也一样：渲染期用先无条件读出的 `const locale = i18n.locale;`，effect、内联事件回调与 CSV 行构建函数（`buildRows`）也可以在执行时读 `i18n.locale`。导出要等请求完成才生成行，这时读当前语言，才与同时用 `t` 翻译的列名一致。不传时函数读全局语言，React Compiler 按其余参数缓存结果，语言切换后可能保留旧语言。规则见[运行时多语言](i18n-presentation.md)，`date-locale-reactivity-contract` 检查。
3. **组件与业务代码不得直接调用 `toLocale*` 或构造任何 `Intl.*` 格式化器。** 一律经 `lib/format.ts`（数字、日期、列表 `formatList`）；`locale-format-contract.test.ts` 扫描 `apps/terminal/src`（测试目录除外）中的 `.toLocale*(` 与 `Intl.<Name>(` 调用并在出现时失败，同一测试也检查每个裸 `<input inputMode="decimal">` 都接了规则 6 的归一化。
4. **图表跟随数字格式。** `ChartPanel` 用 `useNumberFormatLocale()` 读设置传给 `TradingViewChart`，widget 创建时收到 `numeric_formatting: { decimal_sign, grouping_separator }`。该选项只能在构造时给，所以设置变化走与语言变化相同的「保存状态 → 重建 iframe」路径（`requestStatePreservingRebuild(widget, "numeric-format")`），`appliedNumberFormatRef` 与创建时的值比较，值未变不重建。库的 `widget.save` 在 v28.3 里同步回调，所以同一次 commit 里语言与数字格式先后变化时，第二个变化落在「widget 未就绪」分支并重新开始初始化，最终只创建一个带两个新值的 widget；若某个宿主让 `save` 异步回调，未回调期间的第二个变化并入同一次保存，变回原值则取消（两种路径都有测试）。
5. **用户可见名称的排序** 用 `localeCompare(other, undefined, { sensitivity: "base" })`（报价币种分类、Swap 代币列表、API 钱包名称）；id、hash、地址的排序仍是无参 `localeCompare`，它们只需要稳定顺序。
6. **输入框接受设置的小数点，值仍是协议串。** 当设置的小数点是 `,`（`de-DE`、`fr-FR`）时，输入框里打出的 `,` 在到达任何校验或状态之前被改写成 `.`；默认格式下 `,` 保持原样并被既有校验拒绝，避免把 `1,000` 读成一。输入框显示的仍是 `.` 形式的协议串（`1.5`），只有表格与标签按设置显示 `1,5`。两层接入：`NumberInput` 在 keydown 放行设置的小数键并在 `handleChange` 里用 `normalizeDecimalInputEvent` 改写 DOM 值（覆盖桌面下单表单尺寸/价格/触发价/TP/SL、移动端尺寸与价格、划转、发送、提现、充值、Swap、Scale、TWAP、逐仓保证金）；不经 `NumberInput` 的裸输入（`PriceInputWithPercent` 三个输入、Across 金额、移动端改单两个输入、内联改单、质押金额、金库金额）在 `onChange` 里同样调用 `normalizeDecimalInputEvent`，先改写 DOM 再读值，这样 React 的受控还原不会把光标推到末尾。新增裸 `<input inputMode="decimal">` 必须接同一个 helper，`locale-format-contract` 会扫描。
7. **资金费率历史图跟随数字格式，时间跟随语言。** 桌面图表区与手机行情区的 Funding 视图（[资金费率历史](market-funding-history.md)）：坐标轴刻度、提示框与读屏摘要里的百分比经 `formatPercent`，按设置替换分隔符（德式格式下 `+0,0100%`）；提示框与横轴的时间经 `formatDateTime` 跟随界面语言并固定拉丁数字，D 区间按 UTC 日期显示。标签 helper（`lib/chart/funding-history-chart-labels.ts`）从调用方接收 `i18n.locale` 与 `useNumberFormat()` 返回的格式化函数（规则 9），日期用传入的语言，百分比用传入的函数，React Compiler 因此在任一设置变化时重算。
8. **页脚时钟跟随界面语言，按整分钟走时。** 桌面页脚（`FooterBar`，交易页与各仪表盘页共用）用 `formatTime` 的默认 `timeStyle: "short"` 显示本地时间，跟随界面语言并固定拉丁数字（英语 `2:31 PM`、中文 `14:31`、阿拉伯语 `2:31 م`）。时间来自 `useMinuteClock()`（`hooks/ui/use-minute-clock.ts`，`useSyncExternalStore`）：快照是按墙钟取整的当前分钟，同一分钟内是同一个数；计时器排到墙钟的下一个整分钟，触发后按当时的墙钟重新排，所以计时器提前触发或系统时间回拨都不会让走时错位；页面隐藏（`visibilityState === "hidden"`）时不保留计时器，`visibilitychange` 时立即让订阅方重读当前分钟并重新排定；没有订阅方时不留计时器与监听。`FooterBar` 先无条件读出 `const locale = i18n.locale` 再传给 `formatTime`，语言切换才会让 React Compiler 重算（见[运行时多语言](i18n-presentation.md)）；`FooterBarView` 仍是纯 props 视图，预渲染回退仍是 `clock={null}`（[ADR 0010](adr/0010-blank-until-ready-startup.md)）。已知限制：页面一直可见时若系统休眠后唤醒或系统时间被调整，显示要等到下一次计时器得以执行才校正。计时器只请求延迟，正常调度下不超过一分钟，主线程阻塞或浏览器节流时会更晚；页面打开期间若电脑的时区改变，`lib/format.ts` 缓存的格式化器仍用创建时的时区，页脚要刷新页面才换到新时区（既有行为，所有经 `lib/format.ts` 的日期与时间都一样）。
9. **渲染期的数字格式化只用 `useNumberFormat()` 返回的函数**（[ADR 0036](adr/0036-render-time-number-formatters.md)）。
   - 组件与 Hook 写 `const { formatNumber, formatUSD } = useNumberFormat();`，调用处与模块级函数同名同参。不引用 `lib/format.ts` 的模块级数字格式化函数、`getNumberFormatters()` 或修订号读取函数，事件回调与 effect 也一样。
   - 每次设置变化，`useNumberFormat()` 返回一个新对象和新的函数身份，React Compiler 缓存的格式化结果因此重算。只裸调用订阅、让组件重渲染并不够：编译器按参数缓存 `formatNumber(x)`，重渲染仍返回旧字符串（2026-10-02 取证）。函数被调用时仍读当前设置。
   - 渲染期调用的展示 helper 接收 `NumberFormatters` 参数（如 `buildOrderConfirmationRows(draft, numberFormat, translate)`、`formatAccountLedgerAmount(row, numberFormat)`），不导入模块级函数。单元测试等渲染之外的调用方传 `getNumberFormatters()`。
   - 在别处创建、由组件渲染的回调，由渲染它的组件把格式化函数传进去（`EarnOutcomeToastContent` 的 `render(translate, numberFormat)`）。用到格式化函数的 effect 把它列入依赖（标签页标题）。
   - `number-format-reactivity-contract` 用源码级规则检查：组件与 Hook 里不引用模块级格式化函数、经它们格式化的模块级 helper（函数、类、变量与解构默认值）或读取函数（跟随具名、默认、命名空间导入与各种再导出，穿透括号与类型断言）；`useNumberFormat()` 的结果必须被用到（按绑定判断，只出现在 `void`、单独的表达式语句或逗号左侧不算）；模块顶层不在导入时调用格式化函数，也不把它交给一次调用（只保存函数引用不算，但引用它的组件仍会被拦下）。组件与 Hook 的识别与语言契约、日期契约共用 `src/lib/tests/harness/react-source.ts`，跨模块解析与日期契约共用 `src/lib/tests/harness/module-graph.ts`，覆盖 React Compiler 1.0.0 infer 模式的推断规则（名称、`memo`/`forwardRef` 回调、`"use memo"` 指令），另含匿名默认导出与路由组件选项。在别处创建、经 props 或元素传入的闭包，类组件、其他包装函数，TypeScript `namespace` 声明、组件内部的 `useNumberFormat` 别名，动态 `import()`、`require()`、整体传递或经 `export * as` 再导出的命名空间、按非字面量键访问、被重新赋值的变量，以及导入时由其他函数调用的回调，契约看不到（[ADR 0036](adr/0036-render-time-number-formatters.md)「后果与边界」）。
10. **精确小数串只经 `formatDecimalString` 换分隔符**（[ADR 0037](adr/0037-exact-decimal-display-separators.md)）。
   - 已经按调用方规则取整或截断好的纯小数串用 `useNumberFormat()` 返回的 `formatDecimalString(value, { trimTrailingZeros? })` 显示，包括 Big.js 的 `toFixed` 结果、协议价格与数量、viem `formatUnits` 的结果。它按设置插入分组符、替换小数点，数字一位不改，所以超过双精度的值与调用方的舍入方向（如按 `Big.roundDown` 截断的可用余额）都保留；整数部分多余的前导 0 会去掉，免得 `0005` 分组后读成 `0,005`；不是纯小数串时返回占位符。用户输入的金额（金库确认、充值进行中）先经 `toPlainDecimal` 规范成提交时的写法再显示。本来就是 JS 数字的（滑点及其范围、规模偏斜、耗时）用 `formatNumber`。
   - 不把 `toFixed`、`toPrecision` 的结果直接拼进文本，也不手写分组正则：它们固定输出 `.` 小数点，没有分组或只有 `,` 分组。展示 helper 接收 `NumberFormatters`（规则 9）；协议串在显示处格式化，原始值继续用于输入框、计算与提交，输入框的值仍是 `.` 协议串（规则 6）。Lingui 消息里的占位名保持原变量名、只换成格式化后的值，消息 ID 与译文不变。
   - 使用方：
     - 质押、金库、跨链（到账、发送、钱包余额）；
     - 手机行情条与手机下单页的涨跌、下单与规模摘要的费率、TP/SL 风险收益比；
     - 下单通知与子订单的数量、划转与发送的可用余额、下单面板持仓数量、提现最低额；
     - 订单簿分组标签、TWAP 触发价提示与 Mid 按钮读屏名、平仓滑杆读屏文字；
     - 资金恢复通知与质押操作参考的金额、充值表单的余额与手续费、充值进行中的金额、金库确认页的金额；
     - 设置弹窗的滑点范围。
   - 原子数量（wei）、原子小数位、金库操作参考串这类技术标识照原样显示，便于逐位核对与复制。
   - `decimal-display-contract` 用源码级规则检查：每个 `.toFixed(`、`.toPrecision(` 要么写在 `formatDecimalString(...)` 第一个参数的表达式里（外层写成 `n.formatDecimalString`、加括号或用字面量键都算），要么所在文件已登记用途与精确次数，新增、次数变化或登记过期都失败；`lib/format.ts` 以外不得手写千分位正则。它识别直接调用、加括号或断言的调用、字面量键（`v["toFixed"](2)`）以及经 `.call`、`.apply` 的调用；先保存起来或传给别处的方法（别名、`.bind` 出的副本）跟不到。已登记 helper 返回的协议串在别处显示时契约也跟不到，由登记的用途写明显示处如何格式化。

11. **从右到左的界面里，带符号数值的正负号留在数字前面。** 正负号没有自己的书写方向，阿拉伯语的一行以它开头时，双向算法会把它排到数字后面（2026-10-30 审查 F2 实测手机行情条为 `18.50%+ / 14.531+`）。CLDR 对阿拉伯语配拉丁数字的做法是在带符号数值前加从左到右标记 U+200E（`Intl.NumberFormat("ar-u-nu-latn", { signDisplay: "always" })` 输出 `\u200E+1.5`），本终端照做：界面语言从右到左（`isRtlLocale`，目前只有 `ar`）时，`useNumberFormat()` 返回另一套函数，结果以 `+`、`-` 或 `−` 开头且后面有数字时前面加 U+200E；没有数字的占位符 `-` 不加。这套函数有新的身份，语言切换时组件经 `useSyncExternalStore` 订阅 Lingui 的 `change` 事件重新渲染，所以调用处不传 `locale`（`date-locale-reactivity-contract` 把 `useNumberFormat` 登记为自行订阅的读取者）。从左到右的语言拿到的仍是原来那一套，输出与身份都不变。`getNumberFormatters()` 不分方向，导出与事件回调里的值不带标记。helper 自己拼出的带符号数值（如 `+` 加 `formatDecimalString` 的结果、`-$12.50`）交给同一套里的 `markLeadingSign`；手机行情条、手机下单页的涨跌、下单面板持仓数量与金库的金额、比例都这样做。

## 选项与存储

| 代码 | 显示 | 分组 | 小数点 |
|---|---|---|---|
| `en-US`（默认） | `1,234.56` | `,` | `.` |
| `de-DE` | `1.234,56` | `.` | `,` |
| `fr-FR` | `1 234,56` | 普通空格 | `,` |

- 存在全局设置 `global-settings-v2` 的 `numberFormatLocale` 字段（`use-global-settings-store.ts`），经 `createValidatedStorage` 校验；旧的"跟随语言"取值（`auto`、`zh-CN`、`es-ES` 等）由 `normalizeNumberFormatLocale` 迁移。
- 变化时 store 订阅调用 `notifyNumberFormatChange()`（`lib/number-format-reactivity.ts`），`useNumberFormat()` 的快照随之换成新对象（规则 9）。
- 入口是页头语言菜单（`language-switcher.tsx`）的「数字格式」列表；`Reset` 先恢复语言再恢复数字格式。
- 不跟随 `navigator.language`，不进 URL，不 reload（`runtime-guardrails.md` §7）。

## 与官方终端的差异

官方（2026-09-24 取证）把数字格式存为 `hyperliquid.locale`、模块顶层读一次、改动整页 `window.location.reload()`，图表只传 `decimal_sign`，时间戳、图表坐标轴和排序用浏览器默认 locale。Sairn 保留热切换，图表同时传小数点与分组符，日期跟随语言并固定拉丁数字。

官方页脚（2026-10-02 取证，1440×900）只有 `Online` 状态与 Docs / Support / Terms / Privacy Policy，没有时钟；本地时间显示在 TradingView 底部工具栏（如 `15:23:55 (UTC+8)`）。Sairn 的图表固定 UTC 并关闭了底部工具栏与时区菜单（`config/chart.ts`），页脚是唯一显示本地时间的地方，因此保留页脚时钟（规则 8）。

## 未完成

- 输入框显示不本地化（规划 A-2b 未采用）：`,` 被接受但显示为 `.`；德语/法语键盘的小数键可用，但输入框与表格的写法不同。
- 图表库内译文的定点修补机制（规划 B）等 zh/ar 审计结果。
- 已知仍不跟随设置的数字显示。这不是完整清单：ADR 0037 的逐处分类只覆盖 `toFixed`/`toPrecision`。
  - 图表仓位线里的仓位数量：`lib/chart/tradingview-overlays.ts` 用 `size.abs().toString()` 原样显示，没有分组，固定 `.` 小数点；同一行的盈亏与 ROE 已跟随设置。
  - Swap 弹窗在拿到报价之前，接收数量显示固定的 `"0.00"`（`spot-swap-modal.tsx`）。
  - Lingui `<Plural>` 里 `#` 显示的数量，例如委托与成交历史的条数、委托页签的条数和「全部平仓」弹窗里的仓位数。它们由 Lingui 按界面语言格式化，跟随语言而不是数字格式设置。

  ADR 0037 逐处核实并纳入修复范围的其余手写格式数字，已按规则 10 改经 `formatDecimalString`（[ADR 0037](adr/0037-exact-decimal-display-separators.md)）。
- 资金类提示（划转、发送、提现、金库）在弹出时把金额格式化成字符串，已显示的提示不随设置变化，与这些提示在弹出时按当前语言生成文案一致。

## 回归入口

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/format.test.ts \
  src/lib/tests/number-format-settings.test.ts \
  src/lib/tests/number-format-reactivity-contract.test.ts \
  src/lib/tests/date-locale-reactivity-contract.test.ts \
  src/lib/tests/number-format-direction.test.tsx \
  src/lib/tests/locale-format-contract.test.ts \
  src/lib/tests/decimal-input-normalization.test.tsx \
  src/lib/tests/tradingview-chart.test.tsx \
  src/lib/tests/funding-history-panel.test.tsx \
  src/lib/tests/trades.test.ts \
  src/lib/tests/global-settings-store.test.ts \
  src/lib/tests/footer-bar.test.tsx \
  src/lib/tests/portfolio-performance-chart.test.tsx \
  src/lib/tests/referral-summary-cards.test.tsx \
  src/lib/tests/account-panel.test.tsx \
  src/lib/tests/tp-sl-section.test.tsx \
  src/lib/tests/account-ledger-number-format.test.tsx \
  src/lib/tests/order-confirmation-modal.test.tsx \
  src/lib/tests/use-tradingview-overlay-lines.test.tsx \
  src/lib/tests/earn-view.test.tsx \
  src/lib/tests/orderbook-row-tooltip.test.tsx \
  src/lib/tests/trade-row.test.tsx \
  src/lib/tests/decimal-display-contract.test.ts \
  src/lib/tests/order-summary.test.tsx \
  src/lib/tests/mobile-market-bar.test.tsx \
  src/lib/tests/vaults-view.test.tsx \
  src/lib/tests/vault-action-modal.test.tsx \
  src/lib/tests/bridge-amount-number-format.test.tsx \
  src/lib/tests/order-toast-number-format.test.tsx \
  src/lib/tests/funds-action-balances.test.tsx \
  src/lib/tests/funds-action-recovery-host.test.tsx \
  src/lib/tests/deposit-amount-input.test.tsx \
  src/lib/tests/deposit-form-routing.test.tsx \
  src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx \
  src/lib/tests/orderbook-panel-safety.test.tsx \
  src/lib/tests/mobile-orderbook-mode.test.tsx \
  src/lib/tests/trade-form-twap.test.tsx \
  src/lib/tests/trade-form-scale-mid.test.tsx \
  src/lib/tests/mobile-trade-price-field.test.tsx \
  src/lib/tests/trade-form-fields-order-entry-data.test.tsx \
  src/lib/tests/order-confirmation-rows.test.ts \
  src/components/staking/__tests__/staking-view.test.tsx \
  src/components/staking/__tests__/staking-action-modal.test.tsx \
  tests/position-close-slider-effective-aria.test.tsx \
  tests/mobile-trade-size-validation-a11y.test.tsx
```

手动核对（真实浏览器）：把数字格式切到 `1.234,56` 与 `1 234,56`，图表价格轴、图例紧凑值、十字线标签与订单簿、标题分隔符一致；连续切语言与 Reset 后图表最终值正确且重建期间无闪白；阿拉伯语界面下最近成交时间与价格都是拉丁数字。
