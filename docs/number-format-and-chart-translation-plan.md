# 数字格式与图表翻译：对齐官方终端两项实践的规划

状态：A-1、A-2a、A-3、A-4 已于 2026-09-24 实施（归属文档 [number-format-setting.md](number-format-setting.md)）；B 待 zh + ar 审计。2026-09-24 依据 [官方切换语言取证](work-memory/sessions/2026-09-24-official-terminal-language-switch-trace.md) 写成；取证结论里不建议对齐的部分（Suspense 整页隐藏、`html lang` 不更新、图表不重建、数字格式改动 reload）不在本计划范围内。

## 1. 目标

1. **数字格式与语言彻底分离并贯穿全部数字面**：Sairn 已有独立的数字格式设置，但图表不知道它，输入框不接受它，日期数字系统也没有明确规则。目标是设置改动后，应用文本、图表价格轴/图例/十字线标签、输入框和标题使用同一套分隔符，且不 reload、不丢页面状态。
2. **图表库内翻译的定点修补机制**：官方用 `custom_translate_function` 修 TradingView 自带译文的错误（`分钟→月`、`분→월`）。Sairn 目前没有这个入口；目标是建立「只收录已确认错译、每条绑定库条目、库升级时测试提醒复核」的机制，而不是先接一个空函数。

## 2. 现状（2026-09-24，`f03dcbc0` 工作区实测）

### 2.1 数字格式设置已经存在且是热切换

- 选项 `numberFormatLocales`（[config/i18n.ts](../apps/terminal/src/config/i18n.ts)）：`en-US` `1,234.56`、`de-DE` `1.234,56`、`fr-FR` `1 234,56`，默认 `en-US`；`number-format-settings.test.ts` 钉住"设计给的正好三种"。
- 持久化在全局设置 `global-settings-v2` 的 `numberFormatLocale` 字段，经 `createValidatedStorage` 校验，`normalizeNumberFormatLocale` 迁移旧的"跟随语言"值（`auto`、`zh-CN` 等）。
- 格式化在 [lib/format.ts](../apps/terminal/src/lib/format.ts)：所有数字走 `formatNumberParts` —— 用 `en-US` 的 `formatToParts` 再按设置替换 `group`/`decimal` 两类 part，因此数字永远是拉丁数字、只有分隔符变化。
- 响应式：store 订阅里 `numberFormatLocale` 变化 → `notifyNumberFormatChange()`；渲染期格式化数字的组件调用 `useNumberFormatRevision()`，`number-format-reactivity-contract.test.ts` 用扫描保证每个这样的组件都订阅了。（2026-10-02 更正：只订阅不够，React Compiler 按参数缓存格式化结果；现行做法是组件从 `useNumberFormat()` 取格式化函数，见 [ADR 0036](adr/0036-render-time-number-formatters.md)。）
- UI：[language-switcher.tsx](../apps/terminal/src/components/trade/header/language-switcher.tsx) 的下拉里「数字格式」三项 + 语言列表 + Reset（先 `dynamicActivate(defaultLocale)` 再 `setNumberFormatLocale(default)`）。

所以对齐点 1 的"分离"本身已经做完；剩下的是没有覆盖到的面。

### 2.2 差距（每条都已在页面或代码里核实）

| 编号 | 差距 | 证据 |
|---|---|---|
| A1 | **图表不跟随数字格式**：widget 创建时没有传 `numeric_formatting`，图表的价格轴、图例、十字线标签固定用 `.` 和 `,` | 内置浏览器把设置切到 `1.234,56`：订单簿/标题显示 `92,010`、`410,05`，图表轴仍是 `91.892`、图例 `148.735 K`。官方传 `numeric_formatting.decimal_sign`（从数字格式 locale 算出） |
| A2 | **输入框只认 `.`**：`number-input.tsx` 的正则 `\d*\.?\d*`，`limitDecimalInput` 按 `.` 截位；设置为 `,` 小数点时，用户看到表格里是 `1,5`，但输入必须打 `1.5`，德语/法语键盘 `inputMode="decimal"` 弹出的 `,` 被拒绝 | 代码；官方用数字格式 locale 推导输入分隔符（`12345.6.toLocaleString(Wf)`） |
| A3 | **日期/时间的规则没有写下来，且有绕过**：`format.ts` 的 `formatTime/formatDateTime/formatDateTimeShort` 跟随**语言**（`languageToIntlLocale`），但 `lib/trade/trades.ts` 与 `mobile-agent-sync-modal.tsx` 直接 `toLocaleTimeString([])`（浏览器默认），`vaults-list.tsx`、`vault-detail-view.tsx`、`use-api-wallet-controller.ts` 直接 `new Intl.DateTimeFormat(locale, …)` | `grep` 46 处 `Intl.*Format|toLocale*|localeCompare`，非测试代码里 5 处绕过 `format.ts` |
| A4 | **阿拉伯语日期是阿拉伯-印度数字**：`ar → ar-SA`，`Intl.DateTimeFormat("ar-SA",{timeStyle:"short"})` 输出 `٧:٠٥ ص`，而数字（价格、数量）经 `formatNumberParts` 永远是拉丁数字；同一行里两套数字系统 | Node 22 实测；加 `numberingSystem:"latn"` 后为 `7:05 ص` |
| A5 | **没有归属文档**：`docs/` 里没有描述数字格式设置的文档，AGENTS.md 没有契约；唯一的契约是 `number-format-reactivity-contract` 测试 | `grep -ril "number format" docs` 只命中工作记忆和审计记录 |
| A6 | 排序 `localeCompare()` 不传 locale（与官方相同）：id/hash/地址排序无关；`token-selector-categories.ts`、`domain/trade/swap.ts`（`displayName`）、`api-wallet-list.tsx`（`name`）三处是用户可见名称排序，按浏览器 locale | 代码 |

### 2.3 图表翻译修补的现状

- Sairn 的 TradingView 是 v28.3.0（`public/charting_library/package.json`），`custom_translate_function` 签名是 `(originalText, singularOriginalText, translatedText?) => string | null`，**没有官方 v28.5 用到的 `{context}` 参数**，同一个英文键在不同语境下无法区分。
- 图表语言映射 `chartLocaleByAppLocale`：en/zh/es/fr/ar 直传，**hi → en**（库没有印地语包；`bundles/` 里有 `ar`、无 `hi`）。
- 官方修的两条错译来自库的 `{en:["m"],zh:["分钟"]}` / `{en:["m"],ko:["분"]}`（把月份缩写 `m` 译成分钟）。这两条在 Sairn **没有暴露面**：`timeframes_toolbar` 在 `CHART_DISABLED_FEATURES` 里（`CHART_TIME_FRAMES` 因此是死配置），间隔按钮在中文下显示 `1分 / 5分 / 1小时 / 4小时 / 天`，iframe 全文没有 `分钟`。Sairn 不支持韩语。
- 结论：**目前没有一条已确认的错译可以收录**。对齐官方的价值在机制，不在那两条数据。

## 3. 方案 A：数字格式贯穿图表、输入与日期

### A-1 图表跟随数字格式（建议本轮做）

- `config/i18n.ts` 导出 `numberSeparatorsByFormatLocale`（把 `format.ts` 里的 `NUMBER_SEPARATORS_BY_FORMAT_LOCALE` 上移，避免 chart 反向依赖 `lib/format`），`fr-FR` 的分组符保持现在的普通空格（`Intl` 给的是 U+202F 窄不换行空格，`format.ts` 已经选择用普通空格，图表与之一致）。
- `chart-panel.tsx` 读 `useGlobalSettings().numberFormatLocale`，作为新 prop `numberFormatLocale` 传给 `TradingViewChart`；创建 widget 时传 `numeric_formatting: { decimal_sign, grouping_separator }`（v28.3 类型要求两个字段都给）。
- `numeric_formatting` 只能在构造时给，没有运行时 API，所以设置变化走现有的 `requestStatePreservingRebuild(widget, reason)`，新增 reason `"numeric-format"`，与 `"locale"` 同一条保存状态 → 重建的路径（`f03dcbc0` 之后遮罩在重建期间已经不透明，不会再闪）。加 `appliedNumericFormatRef`，与 `appliedLocaleRef` 同样在创建时记录、在 `finishStatePreservingRebuild` 里比较，值未变时不重建。
- Reset 会先切语言再切数字格式，两次变化可能各触发一次重建：`requestStatePreservingRebuild` 已经把落在同一次状态保存窗口内的请求合并成一次；落在窗口外的第二次会重新开始初始化。可接受，但要在测试里钉住"两次变化 ≤ 两次重建、最终 widget 的 `locale` 与 `numeric_formatting` 都是最新值"。
- 测试：`tradingview-chart.test.tsx` 新增「创建时传入 numeric_formatting」「数字格式变化时保存状态后重建且 numeric_formatting 更新」「未变化时不重建」；`number-format-reactivity-contract.test.ts` 把 `chart-panel.tsx` 纳入订阅面。
- 文档：`docs/runtime-guardrails.md` §4 加一条「`numeric_formatting` 只能在创建时给，数字格式变化与语言变化走同一条状态保存重建路径」；本计划 §6 的 owner 文档记录图表跟随。

### A-2 输入框接受数字格式的小数点（需要决策，见 §7）

内部值与协议值保持 `.`（`rules/hyperliquid.md`：字符串原样流转），只改输入层：

- 方案 A-2a（建议）：`number-input.tsx` 在 `onChange` 里把 `,` 归一为 `.`，**仅当**当前数字格式的小数点是 `,`；`en-US` 下 `,` 继续被拒绝（避免把 `1,000` 当成 `1.000`）。显示层不变：输入框里仍是 `1.5`，表格里是 `1,5`。改动小、不碰协议值，但视觉上仍有两种写法。
- 方案 A-2b：输入框显示也本地化（失焦时格式化、聚焦时还原、`onChange` 解析），与官方一致。要碰 `price-input-with-percent.tsx`、`trade-input-frame-view.tsx`、`number-input.tsx` 和所有依赖 `value` 是协议串的校验；风险在草稿存储与 `limitDecimalInput`/`sanitize` 全链路。不建议本轮做。
- 测试：`number-input` 单测覆盖三种格式下的 `,`/`.` 输入；`tests/mobile-trade-size-validation-a11y` 保持通过。

### A-3 写下日期/时间/排序规则并收口绕过（建议本轮做）

规则（写进 owner 文档与 AGENTS.md）：
- 数字（价格、数量、百分比、金额、紧凑单位）跟随**数字格式设置**，永远拉丁数字，分组/小数点只来自设置。
- 日期与时间跟随**界面语言**（`languageToIntlLocale`），24 小时制的既有约定不变（`recent-trades.md`：`HH:mm:ss`、`hourCycle:"h23"`）。
- 组件不得直接调用 `toLocale*` / `new Intl.*Format`；一律经 `lib/format.ts`。加一条扫描式契约测试（比照 `number-format-reactivity-contract`）把 5 处绕过收口并防止回流：`trades.ts:41`、`mobile-agent-sync-modal.tsx:1547` 改 `formatTime`；`vaults-list.tsx:58`、`vault-detail-view.tsx:529`、`use-api-wallet-controller.ts:588` 改 `formatDateTime`/`formatDateTimeShort`。
- 用户可见名称的排序统一 `localeCompare(b, undefined, { sensitivity: "base" })` 或传语言 locale（三处，见 A6）；id/hash 排序不动。

### A-4 阿拉伯语日期的数字系统（需要决策，见 §7）

`format.ts` 的三个日期函数加 `numberingSystem: "latn"`（或在 `languageToIntlLocale.ar` 上写 `ar-SA-u-nu-latn`），使日期数字与价格数字一致；`format.test.ts` 加 `ar` 用例。若设计希望阿拉伯语界面用阿拉伯-印度数字，则反过来在数字格式化里也提供该数字系统——那是另一项设置，不在本计划内。

### A-5 不做的事

- 不加官方的第四种格式 `1234,56`（`es-ES`，无分组）：`number-format-settings.test.ts` 钉住的是设计给的三种，加选项是设计决定。
- 不把数字格式做进 URL 或跟随浏览器 `navigator.language`：与语言一致，默认 `en-US`，用户显式选择。
- 不用 `window.location.reload()`。

## 4. 方案 B：图表翻译修补机制

### B-1 先审计，后收录

- 用 Playwright 在 zh、es、fr、ar 四种图表语言下打开 Sairn 交易页，遍历 Sairn **启用**的图表面：顶栏（间隔按钮与下拉、指标按钮）、指标对话框（搜索框、分类、常用指标名）、图表设置对话框各页、右键菜单、左侧绘图工具栏与其展开菜单、图例（`成交量(Volume)` 这类混合文本）、价格轴右键菜单、时区/对数/自动按钮所在的底栏（如启用）。导出 iframe 内每个面的文本清单到 `.worklog/`（Git 忽略），由懂该语言的人逐条标记「错译 / 未译 / 可接受」。
- 只有被标记为错译、且英文原键在库里唯一或所有出现面都核对过的条目，才进入修补表；未译（英文残留）不修——那是库缺译，`custom_translate_function` 拿到的 `translatedText` 就是英文，可以修但要另行翻译并承担维护，先不做。
- 审计结果为空时：不接线、不新增文件，只在 owner 文档里记录「已审计（日期、库版本、语言、面）无错译」，避免空函数成为死代码。

### B-2 机制设计（审计有产出时实施）

- 新文件 `apps/terminal/src/config/chart-translations.ts`：

  ```ts
  interface ChartTranslationPatch {
      originalText: string;
      expectedTranslatedText: string; // 库当前的错译，用于契约测试
      value: string;                  // 修正后的译文
      note: string;                   // 出现面与核对日期
  }
  export const CHART_TRANSLATION_PATCHES: Partial<Record<LanguageCode, readonly ChartTranslationPatch[]>>;
  export function createChartTranslateFunction(locale: LanguageCode): CustomTranslateFunction | undefined;
  ```

  函数按 `originalText` 查表，且只在 `translatedText === expectedTranslatedText` 时返回修正值，否则返回 `null` 交回库默认——库升级后译文已修的条目自动失效，不会把正确译文改坏。没有条目的语言返回 `undefined`，widget 就不传这个选项。
- `tradingview-chart.tsx` 创建 widget 时传 `custom_translate_function: createChartTranslateFunction(initialLocale)`；语言变化已经会重建 widget，函数随之更新，不需要新的重建原因。
- 因 v28.3 没有 `context` 参数：修补表里同一 `originalText` 只允许一条，并在 `note` 写明已核对的全部出现面；升级到带 `context` 的库版本时再引入按语境匹配。
- 契约测试 `chart-translation-patches.test.ts`：读取 `public/charting_library/bundles/<locale>.*.js`，对每条修补断言存在 `{en:["<originalText>"],<locale>:["<expectedTranslatedText>"]}` 条目——库升级或译文变化时测试失败，提示复核；再断言 `createChartTranslateFunction` 对未收录的键返回 `null`。
- 文档：`docs/runtime-guardrails.md` §4 加一条「库内译文错误用 `custom_translate_function` 定点修补，不改库文件；修补表在 `config/chart-translations.ts`，每条绑定库条目与契约测试」。

### B-3 不做的事

- 不用它翻译 Sairn 自己的字符串，也不用它给库缺译的英文补翻译（维护面太大，且 `hi → en` 本来就是整包英文）。
- 不改 `public/charting_library/` 里的任何文件。

## 5. 实施顺序与规模

| 步骤 | 内容 | 规模 |
|---|---|---|
| 1 | A-1 图表 `numeric_formatting` + 重建原因 + 测试 + §4 文档 | 1 天 |
| 2 | A-3 规则落文档 + 5 处绕过收口 + 扫描契约测试 + 排序三处 | 0.5 天 |
| 3 | A-4 阿拉伯语数字系统（待决策） | 0.5 小时 |
| 4 | A-2a 输入框接受 `,`（待决策） | 0.5 天 |
| 5 | B-1 四语言图表面审计（Playwright 脚本 + 人工标记） | 1 天 + 审核 |
| 6 | B-2 机制与契约测试（仅当审计有产出） | 0.5 天 |
| 7 | owner 文档 `docs/number-format-setting.md`、AGENTS.md 指针条目、CHANGELOG、`docs/README.md` 导航 | 随各步 |

步骤 1、2、7 不依赖决策，可以先做；3、4 等 §7 的答复；5 独立于 A，可并行。

## 6. 验证标准

- 单元/契约：`tradingview-chart`、`number-format-settings`、`number-format-reactivity-contract`、`format`、新的日期/排序扫描契约、`number-input`、`chart-translation-patches`（如有）；`pnpm --filter @sairn/terminal typecheck`；Biome。
- 浏览器（真实浏览器，非仅注入事件）：切数字格式为 `1.234,56` 与 `1 234,56` 后，图表价格轴、图例（含 `K/M` 紧凑值）、十字线标签、订单簿、标题分隔符一致；语言 + Reset 连续操作后图表最终值正确且遮罩无闪白；`,` 输入在三种格式下的行为符合决策；阿拉伯语界面下日期与价格数字系统一致。
- 记录：按 `docs/work-memory/README.md` 建任务记录，实测截图放 `.worklog/`。

## 7. 需要决策的事项

1. **输入框**：采用 A-2a（只归一 `,`→`.`、显示不变）还是 A-2b（输入显示也本地化），或本轮不动。建议 A-2a。
2. **阿拉伯语日期数字**：改为拉丁数字（与价格一致）还是保持阿拉伯-印度数字。建议改为拉丁数字。
3. **图表翻译审计的语言范围**：zh/es/fr/ar 全做，还是先 zh。建议先 zh + ar（阿拉伯语的 RTL 图表最可能出问题），es/fr 由母语审核者决定。
4. **是否加第四种数字格式 `1234,56`**：建议不加，除非设计更新。
5. 以上是否进入下一次发布（p24）还是单独 PR 逐项合入 `dev`。

## 8. 替代方案与未采用原因

- 照搬官方「数字格式改动 reload」：丢页面状态，与 `docs/runtime-guardrails.md` §7「不 reload」冲突。
- 让图表自带 `custom_formatters.priceFormatterFactory` 走应用的 `formatPrice`（官方做法）：能统一精度规则，但价格轴刻度由库决定小数位，应用格式器介入会把精度规则耦合进图表；`numeric_formatting` 已经覆盖分隔符，精度对齐另行评估。
- 直接改 `charting_library` 的语言包修错译：库升级即丢失，且违反「不改库文件」。
