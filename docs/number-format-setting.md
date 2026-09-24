# 数字格式设置与日期、排序的 locale 规则

本文是数字格式设置的归属文档：它拥有选项、存储、哪些面跟随它、哪些面跟随界面语言，以及对应的回归入口。背景与未完成项见[对齐规划](number-format-and-chart-translation-plan.md)。

## 规则

1. **数字跟随数字格式设置，不跟随语言。** 价格、数量、百分比、金额、紧凑单位（`K/M`）和文档标题里的价格都经 `lib/format.ts`：用 `en-US` 的 `Intl.NumberFormat.formatToParts` 分解，再按设置替换 `group` 与 `decimal` 两类 part（`numberSeparatorsByFormatLocale`）。数字永远是拉丁数字，只有分隔符变化。
2. **日期与时间跟随界面语言，数字系统固定拉丁。** `formatTime`、`formatDateTime`、`formatDateTimeShort` 用 `languageToIntlLocale[i18n.locale]` 选格式，并强制 `numberingSystem: "latn"`，所以阿拉伯语界面的 `٧:٠٥` 变为 `7:05`，与同一行的价格数字一致。显式传 `locale` 时接受界面语言代码（`zh`）或 Intl locale（`zh-CN`），前者按映射表解析。24 小时制等既有约定不变（`recent-trades.md`：`HH:mm:ss`、`hourCycle: "h23"`）。
3. **组件与业务代码不得直接调用 `toLocale*` 或 `new Intl.*Format`。** 一律经 `lib/format.ts`；`locale-format-contract.test.ts` 扫描 `apps/terminal/src`（测试目录除外）并在出现新的直接调用时失败。
4. **图表跟随数字格式。** `ChartPanel` 把 `numberFormatLocale` 传给 `TradingViewChart`，widget 创建时收到 `numeric_formatting: { decimal_sign, grouping_separator }`。该选项只能在构造时给，所以设置变化走与语言变化相同的「保存状态 → 重建 iframe」路径（`requestStatePreservingRebuild(widget, "numeric-format")`），`appliedNumberFormatRef` 与创建时的值比较，值未变不重建；语言与数字格式在同一次状态保存窗口内变化只重建一次。
5. **用户可见名称的排序** 用 `localeCompare(other, undefined, { sensitivity: "base" })`（报价币种分类、Swap 代币列表、API 钱包名称）；id、hash、地址的排序仍是无参 `localeCompare`，它们只需要稳定顺序。

## 选项与存储

| 代码 | 显示 | 分组 | 小数点 |
|---|---|---|---|
| `en-US`（默认） | `1,234.56` | `,` | `.` |
| `de-DE` | `1.234,56` | `.` | `,` |
| `fr-FR` | `1 234,56` | 普通空格 | `,` |

- 存在全局设置 `global-settings-v2` 的 `numberFormatLocale` 字段（`use-global-settings-store.ts`），经 `createValidatedStorage` 校验；旧的"跟随语言"取值（`auto`、`zh-CN`、`es-ES` 等）由 `normalizeNumberFormatLocale` 迁移。
- 变化时 store 订阅调用 `notifyNumberFormatChange()`；渲染期格式化数字的组件订阅 `useNumberFormatRevision()`，`number-format-reactivity-contract.test.ts` 保证没有遗漏。
- 入口是页头语言菜单（`language-switcher.tsx`）的「数字格式」列表；`Reset` 先恢复语言再恢复数字格式。
- 不跟随 `navigator.language`，不进 URL，不 reload（`runtime-guardrails.md` §7）。

## 与官方终端的差异

官方（2026-09-24 取证）把数字格式存为 `hyperliquid.locale`、模块顶层读一次、改动整页 `window.location.reload()`，图表只传 `decimal_sign`，时间戳、图表坐标轴和排序用浏览器默认 locale。gatu 保留热切换，图表同时传小数点与分组符，日期跟随语言并固定拉丁数字。

## 未完成

- 输入框仍只接受 `.` 作为小数点（规划 A-2a：当设置的小数点是 `,` 时把 `,` 归一为 `.`，显示不变）。
- 图表库内译文的定点修补机制（规划 B）等 zh/ar 审计结果。

## 回归入口

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/format.test.ts \
  src/lib/tests/number-format-settings.test.ts \
  src/lib/tests/number-format-reactivity-contract.test.ts \
  src/lib/tests/locale-format-contract.test.ts \
  src/lib/tests/tradingview-chart.test.tsx \
  src/lib/tests/trades.test.ts \
  src/lib/tests/global-settings-store.test.ts
```

手动核对（真实浏览器）：把数字格式切到 `1.234,56` 与 `1 234,56`，图表价格轴、图例紧凑值、十字线标签与订单簿、标题分隔符一致；连续切语言与 Reset 后图表最终值正确且重建期间无闪白；阿拉伯语界面下最近成交时间与价格都是拉丁数字。
