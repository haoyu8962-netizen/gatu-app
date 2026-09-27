<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-number-format-chart-and-date-rules",
  "date": "2026-09-24",
  "title": "图表跟随数字格式设置、日期固定拉丁数字、原生 Intl 调用收口、输入框接受设置的小数点（规划 A-1/A-2a/A-3/A-4）",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "按用户决策实施对齐规划的 A-1、A-3、A-4：TradingView 创建时收到 numeric_formatting，数字格式变化走与语言相同的保存状态重建（新 reason numeric-format，值未变不重建）；format.ts 的日期函数强制 numberingSystem latn 并接受界面语言代码；6 处绕过 format.ts 的 toLocale*/Intl.DateTimeFormat 调用改走 formatTime/formatDateTime，3 处用户可见名称排序加 sensitivity base；新增 locale-format-contract 扫描测试与归属文档 docs/number-format-setting.md、AGENTS.md 契约。内置浏览器实测 1.234,56 下图表轴、图例、订单簿、标题分隔符一致。第二个提交实施 A-2a（输入框接受设置的小数点），随后两轮对抗审查（GPT-6 astra、三路 Claude 工作流）的确认项已在第三、四个提交修复。",
  "thread": null,
  "baseCommit": "ce9fb539",
  "commits": [],
  "sources": [
    { "path": "docs/number-format-and-chart-translation-plan.md" },
    { "path": "docs/number-format-setting.md" },
    { "path": "apps/terminal/src/lib/format.ts" },
    { "path": "apps/terminal/src/config/i18n.ts" },
    { "path": "apps/terminal/src/components/trade/chart/chart-panel.tsx" },
    { "path": "apps/terminal/src/components/trade/chart/tradingview-chart.tsx" },
    { "path": "apps/terminal/src/lib/tests/locale-format-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/tradingview-chart.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/format.test.ts" },
    { "path": "apps/terminal/src/lib/tests/chart-panel.test.tsx" }
  ],
  "supersedes": []
}
-->
# 图表跟随数字格式设置、日期固定拉丁数字、原生 Intl 调用收口、输入框接受设置的小数点（规划 A-1/A-2a/A-3/A-4）

## 背景与范围

同步记录。用户对[对齐规划](../../number-format-and-chart-translation-plan.md)的决策：全部采纳建议（输入框 A-2a、阿拉伯语日期改拉丁数字、图表翻译审计先 zh + ar），并要求先做 A-1 与 A-3。A-4（拉丁数字）是 A-3 把最近成交时间改走 `formatTime` 的前提——否则阿拉伯语界面的成交时间会从浏览器默认 locale 的拉丁数字变成阿拉伯-印度数字——所以一并实施。基线 `ce9fb539`，开始时工作区干净。A-2a 于第二个提交实施；方案 B 未做。

## 结论与依据

1. **图表跟随数字格式（A-1）。** `numberSeparatorsByFormatLocale` 从 `lib/format.ts` 上移到 `config/i18n.ts`；`ChartPanel` 读数字格式设置（第四个提交起用专用选择器 `useNumberFormatLocale()`，避免其它设置变化重渲染图表）传给 `TradingViewChart`；widget 创建时传 `numeric_formatting: { decimal_sign, grouping_separator }`（v28.3 类型两个字段都必填）。变化走 `requestStatePreservingRebuild(widget, "numeric-format")`：新增 `numericFormatRebuild` 标记、`appliedNumberFormatRef`（创建时记录、`removeWidget` 清空），`finishStatePreservingRebuild` 只在目标值与已应用值不同时重建。语言与数字格式的切换请求收敛到同一个 `requestCreationOptionRebuild(reason, alreadyApplied)`，已应用时清掉自己的标记并在没有其他待重建原因时取消状态保存。
2. **日期固定拉丁数字并接受语言代码（A-4 / A-3）。** `getFormatter("date")` 强制 `numberingSystem: "latn"`（Node 22 实测 `ar-SA` 由 `٧:٠٥ ص` 变为 `7:05 ص`）；新增 `resolveLanguageIntlLocale`（第四个提交前叫 `resolveDateLocale`），显式 `locale` 为界面语言代码（`zh`、`fr`）时按 `languageToIntlLocale` 映射，否则原样交给 Intl。
3. **收口绕过（A-3）。** 改走 `lib/format.ts` 的 6 处：`lib/trade/trades.ts`（最近成交时间，原 `toLocaleTimeString([])` 浏览器默认 locale）、`mobile-agent-sync-modal.tsx` 与 `routes/mobile-agent-sync.tsx`（配对到期时间，同上；后者是写扫描测试后才发现的第 6 处）、`vaults-list.tsx`、`vault-detail-view.tsx`、`use-api-wallet-controller.ts`（原直接 `new Intl.DateTimeFormat(locale, …)`，`locale` 是 Lingui 语言代码）。三处用户可见名称排序（报价币种分类、Swap 代币 `displayName`、API 钱包 `name`）改为 `localeCompare(other, undefined, { sensitivity: "base" })`。
4. **契约与文档。** 新增 `locale-format-contract.test.ts`：扫描 `apps/terminal/src`（测试目录与 `.d.ts` 除外）中 `lib/format.ts` 之外的 `.toLocale*(`、`new Intl.NumberFormat(`、`new Intl.DateTimeFormat(`，要求为空。归属文档 `docs/number-format-setting.md`（规则、选项、存储、与官方差异、未完成、回归入口），AGENTS.md 新增「Number and date formatting contract」与验证分组，`docs/runtime-guardrails.md` §4/§7 各加一条，`docs/README.md` 导航，CHANGELOG 两条，规划文档状态改为 A-1/A-3/A-4 已实施。
5. **输入框接受设置的小数点（A-2a，第二个提交）。** `lib/format.ts` 新增 `normalizeDecimalInput`：设置的小数点是 `,` 时把输入串里的 `,` 全部改成 `.`，默认格式下原样返回交给既有校验拒绝；`components/ui/decimal-input-event.ts` 的 `normalizeDecimalInputEvent` 在 DOM 层改写 `event.target.value` 并保留光标，供读取事件的消费者使用。接入点经第四个提交修正为两层：`NumberInput`（桌面下单表单的尺寸/价格/触发价/TP/SL 通过 `TradeInputFrameView` 的 `input` 插槽也是它，移动端尺寸与价格、划转、发送、提现、充值、Swap 等亦然）；不经 `NumberInput` 的裸输入 8 处（`PriceInputWithPercent` 三个、Across 金额、移动端改单两个、内联改单、质押金额、金库金额）。规划里的 `number-input.tsx` 单点方案不够：仓库有 13 个文件各自写 `<input inputMode="decimal">` 的 `onChange`，不逐个接入就会出现同一格式下有的输入框认 `,` 有的不认。输入框显示仍是协议串 `.`（A-2b 未采用）。
6. **未变的行为。** 数字格式选项仍是设计钉住的三种；`Reset` 先切语言再切数字格式：库的 `widget.save` 同步回调，所以第二个变化落在「widget 未就绪」分支重新开始初始化，最终只创建一个带两个新值的 widget（测试钉住同一 commit 内两者同时变化只构造两次 widget 且最后一次同时带 `locale: "fr"` 与法式分隔符；另有异步回调下的合并与回退取消测试）。

## 验证与限制

- `pnpm exec biome check`（16 个改动的 TS/TSX 文件）无问题；`pnpm --filter @gatu/terminal typecheck` 0 错误；`git diff --check` 通过。
- 定向组：`tradingview-chart`、`format`、`locale-format-contract`、`number-format-settings`、`number-format-reactivity-contract`、`trades`、`trades-panel`、`trade-row`、`i18n-hot-switch`、`i18n-reactivity-contract`、`global-settings-store`、`language-switcher`：12 文件 332 项通过；vault / api-wallet / mobile-agent-sync / spot-swap / token-selector / chart-theme-colors / trade-terminal-page-boot 相关 25 文件 346 项通过。全量 `pnpm --filter @gatu/terminal test`：607 文件中 605 通过、1 跳过、1 失败——`chart-panel.test.tsx` 的设置 store 桩缺少新用到的 `useGlobalSettings`（夹具缺口，非产品缺陷），补桩后该文件 2/2 通过；其余 7,016 项通过。
- 内置浏览器（脚本注入点击，非物理输入）在 `localhost:3005/trade/HYPE`：把数字格式切到 `1.234,56` 后约 7 秒，图表价格轴 `92,342`、图例 `62,839 K`、订单簿 `92,789`、标题 `92,789 HYPE/USDC` 分隔符一致，遮罩透明度已回到 0；切回 `1,234.56` 后图表轴恢复 `.`。
- 新增测试中阿拉伯语日期只断言含 `14:35` 且不含阿拉伯-印度数字：`ar-SA` 的短日期含 RTL 标记与阿拉伯逗号（`12‏/08، 14:35`），不宜按固定字符串断言。
- A-2a 验证：新增 `decimal-input-normalization.test.tsx` 4 项（`NumberInput` 在 `de-DE` 下 `1,5` → 事件值 `1.5`、默认格式下仍拒绝；`TradeInputFrameView` 在 `fr-FR` 下 `0,25` → `0.25`、默认格式下原样透传），`format.test.ts` 新增 4 组 `normalizeDecimalInput` 用例；受影响的表单、改单、金库、质押、TP/SL 测试组 12 文件 204 项通过；测试里要在 `onChange` 调用时读 `event.target.value`——事件结束后 React 会把受控输入还原成 `value=""`，事后读到的是空串。内置浏览器实测（数字格式 `1.234,56`，界面西班牙语，浏览器工具按键输入，非物理键盘）：在桌面下单表单的数量框键入 `1,5`，输入框值为 `1.5`、光标停在末尾，订单价值行随即显示 `$139,24`；默认格式下未实测（单测覆盖拒绝路径）。
- A-2a 后的全量 `pnpm --filter @gatu/terminal test`（Node 22.15，单独运行）：608 文件中 605 通过、1 跳过、2 失败——`chart-build-assets.test.ts`（TradingView 源树摘要清单）与 `chart-store.test.ts`（共享蜡烛订阅），两者单跑各自通过（4 文件 62 项），与本次改动无关，属全量并行下的负载敏感用例；此前一次与后台运行重叠的全量跑出 4 个不同文件失败，同样单跑全过，已作废不计。
- 未做：真实浏览器/真机验收（含德语/法语键盘的小数键）；`Reset` 连续操作的真实页面观察；阿拉伯语界面整体检查；方案 B 审计。

## 对抗审查补记（GPT-6 astra，第三个提交）

用户要求用 `codex exec -m gpt-6-astra -s read-only`（`model_reasoning_effort` medium，约 117k token）按项目规范审查 `1eea914e..949693a5`。报告确认 2 项 P2、2 项 P3，无 P0/P1；我逐条核对后全部成立并修复：

1. **P2 `NumberInput` 的 keydown 仍拦截 `,`**：`handleKeyDown` 只放行 `.`，逗号在到达 `input` 事件之前就被 `preventDefault()`，A-2a 的归一化对 `NumberInput`（划转、发送、提现、移动端数量）根本不会执行；我的单测直接派发 `input` 事件绕过了 keydown，内置浏览器实测又只覆盖了没有 keydown 过滤的 `TradeInputFrameView`。修复：`isDecimal` 同时接受 `normalizeDecimalInput(e.key) === "."` 的键；新增 keydown 路径测试（`de-DE` 下 `,`/`.` 放行、`x` 拦截；`en-US` 下 `,` 拦截）。
2. **P2 配对到期时间不随语言热切换**：`LoadedQrPanel` 与 `ResetMobileAccessPanel` 里 `formatTime(...)` 没有响应式语言依赖，React Compiler 按到期时间缓存结果，语言切换后标签保持旧格式，违反 `docs/i18n-presentation.md`「helper 显式接收翻译依赖」。修复：两处改为 `useLingui()` 并传 `locale: i18n.locale`。未加专门测试：两个组件未导出，现有模态/路由测试没有到达成功态；该差距记入未做。
3. **P3 API 钱包有效期多出了时间**：`formatDateTime(x, { dateStyle: "medium" })` 会补默认 `timeStyle: "short"`，原 `Intl.DateTimeFormat(locale, { dateStyle: "medium" })` 只显示日期。修复：`formatDateTime` 遇到显式 `dateStyle`/`timeStyle` 时不再补默认值（`hasStyleOptions`），`format.test.ts` 钉住日期限定、时间限定与默认三种输出。
4. **P3 文档状态陈旧**：`docs/README.md` 规划行仍写「未实施」，本记录「待做」仍列 A-2a；已更正。另修复 `git diff --check 1eea914e..HEAD` 报的规划文档代码块「space before tab」。

GPT 未确认缺陷但指出的限制：最近成交时间的 `useMemo` 缺语言依赖（当前六种语言输出相同的 `HH:mm:ss`，不可见）；`numberingSystem` 可被调用方参数覆盖（现无此类调用）；扫描测试遗漏不带 `new` 的 `Intl.*Format(`（现无绕过）；它的沙箱不能写 `.vite-temp`，Vitest 未执行，typecheck 通过。修复后：Biome 无问题、typecheck 0 错误、`decimal-input-normalization` / `format` / `number-input` / `mobile-agent-sync-modal` / `mobile-agent-sync-route` / api-wallet / `locale-format-contract` / `i18n-reactivity-contract` 共 14 文件 340 项通过。

## 交叉核对补记（三路 Claude 工作流，第四个提交）

与 GPT-6 并行起了 Workflow：三个审查视角（输入与 DOM 语义、图表生命周期、Intl/日期/排序/文档）各出发现，每条再由两个反驳者独立核对，共 33 个代理、753 次工具调用。15 条发现中 12 条存活、3 条被驳回（de-DE 下 `1.000` 被当作一是范围外的既有行为；`ChartPanel` 订阅四个设置字段不构成缺陷；其余为重复）。与 GPT-6 重叠的 4 条已在第三个提交修复；新增修复：

1. **P2→P3 `TradeInputFrameView` 的裸 `<input>` 包装是死代码**：四个产品调用点都传 `input=`（桌面尺寸/价格/触发价与移动端尺寸都是 `NumberInput`），包装永远不渲染，却让 props-only 视图引入 `lib/format` → Lingui/store。修复：从视图删掉包装与导入，裸路径只保留给 `trade-form-views.test.tsx` 的占位几何对照；扫描测试把该文件列为占位例外。
2. **P3 七处字符串写法的接入点不保留光标**：`onChange(normalizeDecimalInput(e.target.value))` 只改 state，React 的受控还原随后把 DOM 从 `1,5` 改成 `1.5` 并把光标推到末尾。修复：八处裸输入统一改为 `normalizeDecimalInputEvent(event).target.value`（质押为 `currentTarget`），先改写 DOM 再读值；新增测试在 `15` 中间插入 `,` 后值为 `1.5` 且光标停在 2。
3. **P3 移动端触发价/限价重复归一化**：`MobileTradePriceField → PriceInput → NumberInput` 已经处理，删掉 `mobile-trade-view.tsx` 的两处包装；记录里的「接入 11 处」改为两层描述。
4. **P3 AGENTS 规则没有扫描器**：`locale-format-contract` 新增第二条检查——每个裸 `inputMode="decimal"`（所属标签不是 `NumberInput`/`PriceInput`/`MobileTradePriceField`）所在文件必须引用归一化 helper。
5. **P3 扫描模式窄于契约文字**：`portfolio-page.tsx` 的 `new Intl.ListFormat(i18n.locale, …)` 未被抓到。修复：模式放宽为 `Intl.<Name>(`（含无 `new`），新增 `formatList` 并让投资组合页走它。
6. **P3 图表合并/回退分支没有测试、文档描述了库不会打开的「保存窗口」**：库的 `save` 同步回调，同一 commit 的第二个变化实际落在「未就绪」分支。修复：归属文档规则 4、guardrails §4、本记录第 6 条改为实际机制；新增两条延迟回调测试（未回调期间的数字格式变化并入同一次保存并带 `saved_data`；变回原值则不重建、不 `remove`）。
7. **P3 最近成交时间在语言切换后可能陈旧**：`processTrades` 加 `locale` 参数，`TradesPanel` 传 `i18n.locale` 并加入 memo 依赖；`trades.test.ts` 钉住 `ar` 下仍是拉丁数字 `HH:mm:ss`。
8. **P3 CHANGELOG 夸大迁移范围**（金库与 API 钱包原本就不用浏览器 locale）与本记录自相矛盾（标题/摘要/第 33 行未含 A-2a）：已改写。

反驳者对 `ChartPanel` 订阅面的意见是"机制属实但非缺陷"；仍改为专用 `useNumberFormatLocale()` 选择器，因为改动一行且减少图表面板的无关重渲染。

第四个提交后的验证：Biome 19 个改动文件无问题；typecheck 0 错误；定向组 21 文件 413 项通过；全量 `pnpm --filter @gatu/terminal test`（单独运行）608 文件中 607 通过、1 跳过，7,031 项通过，本次无负载失败。仍未做：真实键盘、真机、`Reset` 连续操作的真实页面观察。

## 后续与替代关系

- 接续 [官方切换语言取证](2026-09-24-official-terminal-language-switch-trace.md) 与规划文档；不替代任何记录。
- 待做：方案 B 的 zh + ar 图表面审计；真实键盘验收。A-2a 已在第二个提交完成（见上文第 5 条）。
