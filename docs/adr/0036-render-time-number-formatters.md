# ADR 0036：渲染期数字格式化使用 `useNumberFormat()` 返回的格式化函数

- 状态：已接受并实施（2026-10-02，分支 `claude/wonderful-goldberg-e47b19`，叠在未推送的 `claude/relaxed-roentgen-fd0316` 上）；未推送、未合入、未发布。取代[数字格式设置](../number-format-setting.md)中「组件订阅 `useNumberFormatRevision()`」的做法；资金费率图、组合收益图、杠杆仓位上限行与断开账户概览把修订号作为参数传入的做法也改为传格式化函数。
- 关联：[任务记录](../work-memory/sessions/2026-10-02-number-format-reactive-formatters.md)（取证、计数方法与验证）；问题来源是[上一条记录](../work-memory/sessions/2026-10-02-vault-fetched-time-locale.md)的「范围外发现：数字格式订阅」；[运行时多语言](../i18n-presentation.md)。

## 背景与约束

- 数字跟随页头语言菜单里的数字格式设置（`1,234.56`、`1.234,56`、`1 234,56`）。`lib/format.ts` 的数字格式化函数在调用时从全局状态读取设置。设置变化时 store 调用 `notifyNumberFormatChange()`，组件用裸调用 `useNumberFormatRevision();` 订阅。
- `babel-plugin-react-compiler` 1.0.0 把 `formatNumber(x)` 这类调用按参数缓存。模块级函数不是响应式值，不会进入缓存依赖。订阅让组件重渲染，缓存却按原参数返回旧字符串。2026-10-02 在基线 `5425b7c1` 上取证：
  - 临时探针：`ReferralSummaryCards` 切到 `de-DE` 并通知后重渲染了，仍显示 `1,234`，直接调用 `formatNumber(1234)` 返回 `1.234`。
  - 编译产物扫描：组件与 Hook 里有 218 处数字格式化引用落在不含修订号的缓存槽里，涉及 66 个组件或 Hook。另有 37 处在编译器提升到模块级的 `_temp` 闭包里，同样被不含修订号的缓存槽包着。
  - 76 个文件共 89 处裸订阅。另有 4 个组件或 Hook 经 helper 格式化数字却根本没订阅（两个账户流水表、图表叠加线、TWAP 成交导出）。还有 23 个当时没被编译器编译，每次渲染重算，只是碰巧正确。
- 约束：
  - 切换不 reload、不重挂载面板，不丢草稿（`runtime-guardrails.md` §7、AGENTS.md「Change discipline」）；
  - 保留 React Compiler 的自动缓存，交易页高频组件不能整体退出编译；
  - 非 React 代码（导出、通知、effect）继续可用；
  - 规则要能用源码级测试检查，不依赖编译器当前是否编译了某个组件。

## 决策

1. **`useNumberFormat()` 返回随设置更换身份的格式化函数。** `lib/format.ts` 导出 `NumberFormatters`：`formatLiquidationPrice`、`formatNumber`、`formatPercent`、`formatPrice`、`formatQuoteAmount`、`formatSlippageBps`、`formatToken`、`formatUSD`。`useNumberFormat()` 用 `useSyncExternalStore` 订阅数字格式变化，快照就是这个对象。每次 `notifyNumberFormatChange()` 之后快照换成新对象，里面是新的函数身份。编译器把调用这些函数的缓存槽记成依赖它们，设置变化就重算。函数被调用时仍读当前设置，所以事件回调里留下的旧引用也不会输出旧格式。渲染之外的代码用 `getNumberFormatters()` 取当前对象。
2. **组件与 Hook 只用 `useNumberFormat()` 的函数。** 写法是 `const { formatNumber, formatUSD } = useNumberFormat();`，调用处不变。组件与 Hook 里不引用模块级数字格式化函数、`getNumberFormatters()`，也不引用修订号读取函数（`getNumberFormatRevision`、`subscribeNumberFormatChange`），事件回调与 effect 也一样。
3. **渲染期 helper 显式接收 `NumberFormatters`。** 在渲染期间格式化数字的展示 helper 接收这个对象作为参数，不导入模块级函数。这与翻译 helper 接收 `Translate` 相同。本次改造的 helper：
   - 下单确认行、账户流水金额与手续费、TradingView 叠加线标签；
   - 订单通知文案、断开账户概览、杠杆仓位上限、资金费率图标签；
   - 组合收益图模型，以及 Earn、行情头、手机行情条、手机下单页、委托表内的模块级 helper。

   单元测试传入 `getNumberFormatters()`；渲染之外的其他调用方也可以这样做，目前源码里没有这样的调用方。资金费率图标签原来把修订号与语言都作为不使用的参数传入，这次语言也改为实际传给日期格式化。
4. **外部创建、在别处渲染的回调由渲染方传入格式化函数。** `EarnOutcomeToastContent` 渲染的 `render` 回调是提交时在异步流程里创建的。它原先只裸订阅，缓存的输出不会重算。现在由它把自己的 `NumberFormatters` 和 `translate` 一起传给回调。
5. **删除 `useNumberFormatRevision`。** `lib/number-format-reactivity.ts` 只保留通知、订阅与修订号读取。`TradeRowComponent` 的 `"use no memo"` 当初只是为了这个依赖加的（`6e70351b`），一并删除，显式的 `memo` 比较函数保留。标签页标题的 effect 把 `formatPrice` 列入依赖，替代原来的 `void numberFormatRevision`。
6. **契约。** `number-format-reactivity-contract.test.ts` 用 TypeScript AST 扫描 `apps/terminal/src`（测试、`locales`、`.gen.ts` 除外）：
   - 先跨模块求出「经模块级数字格式化函数格式化」的模块级声明。这是传递闭包，跟随 `@/` 与相对导入、具名与默认导入、命名空间导入（`format.formatNumber`）、具名再导出、`export *` 与本地别名导出；
   - 组件与 Hook 里引用这些声明、模块级格式化函数或上述读取函数，且没有被局部绑定遮蔽的，都算违规；
   - `useNumberFormat()` 的结果没有被用到算违规：裸调用（包括以别名导入后裸调用），或赋给的变量与解构出的名字在其作用域里没有被引用。引用按绑定判断，同名的内层参数不算；只出现在 `void` 或单独的表达式语句里也不算。这检查的是引用，不是格式化数据流；
   - 模块顶层在导入时调用格式化函数算违规；只保存函数引用不算，但引用这个别名的组件仍会被拦下。

   组件按名称识别（大写开头或 `use` 后接大写或数字，`memo`/`forwardRef` 包装按变量名）。另外两类也算组件：`.tsx` 里匿名的默认导出函数，以及传给路由 `component`、`pendingComponent`、`errorComponent`、`notFoundComponent` 选项的函数。附 24 个正反样例（19 个应报出、5 个应放行）。它在基线代码上报出 356 处违规，在本次代码上为 0。

## 备选方案与代价

用户在三个方案中选择了本方案。

- **修订号作为参数传入每次计算（方案 A）。** 沿用资金费率图与杠杆上限行的做法，机制单一。但数字格式化函数要加一个只给编译器看的参数，约 250 处直接调用和约 15 处 helper 调用都要改，嵌套函数里的每次调用也要传；新代码容易漏传，契约要逐个调用检查参数。未采用。
- **对格式化数字的组件加 `"use no memo"`（方案 C）。** 改动最小，组件内的 helper 与闭包立即正确。但约 66 个组件（算上当时未编译的约 89 个）整体退出 React Compiler，包括仓位行、委托行、订单簿面板、账户面板、币种选择行等高频组件，性能影响未测量。React 文档把它定位为临时逃生口，新组件也仍需记得加。未采用。
- **用 `key` 在切换时重挂载。** 会丢失下单草稿与输入，违反语言与数字格式切换保留挂载状态的规则。未采用。
- **在契约测试里实际编译并检查缓存槽。** 最准确，但 `@babel/core` 不是终端的直接依赖，每次运行还要编译全部文件。改用源码级规则，编译产物核对只作为一次性取证（见任务记录）。

## 后果与边界

- 数字格式化有两个入口。渲染期的 React 代码用 `useNumberFormat()`，其余代码可以用模块级函数或 `getNumberFormatters()`。规则写在 [数字格式设置](../number-format-setting.md) 与 AGENTS.md。
- 契约只看源码中的名字绑定。经 props 传给子组件、在子组件渲染时调用的闭包，只要创建它的组件正常重渲染，闭包会随格式化函数身份更新。在渲染之外创建的元素（提示内容）契约看不到，靠决策 4 的约定。它也不识别类组件、`memo`/`forwardRef` 之外的包装函数，以及按计算属性名访问的格式化函数（`format[name]`）。
- 资金类提示（划转、发送、提现、金库）在弹出时把金额格式化成字符串，已显示的提示不随设置变化。这与这些提示在弹出时按当前语言生成文案的既有约定一致。
- 没有经 `lib/format.ts` 的数字显示不受本决策约束，也不跟随设置，固定输出 `,` 分组与 `.` 小数点（或 `toFixed` 的 `.`）。2026-10-02 的审查与排查确认了这些：
  - 质押金额与比例（`formatStakingAmount`、`formatStakingRatio`）；
  - 金库精确金额（`groupDecimal`）；
  - 跨链各屏金额（`lib/bridge/format.ts` 的 `formatTokenBalance`、`formatSendAmount`、`formatTokenAmount`）；
  - 手机行情条的 24h 涨跌额与涨跌幅（`formatSignedFixed`、`formatSignedPercent`）；
  - 手机下单页的涨跌幅；
  - 下单费率（`formatOrderFeeRatePercent`，与换算后的金额同在一串里，德式格式下显示为 `0.0450% ($1,23)`）；
  - TP/SL 风险收益比（`lib/trade/tpsl.ts`）；
  - 订单簿价格分组标签（`formatTickSize`）。

  全仓库还有约 119 处 `toFixed`，多数用于协议值或计算，没有逐处分类。登记为后续。
- 日期是同一类问题：`formatDateTime` 等函数不传 `locale` 时读全局语言。本次修复了编译产物确认的 15 处，规则写入[运行时多语言](../i18n-presentation.md)，尚无契约，登记为后续。
- 构建体积：编译产物的缓存槽多了依赖项，体积变化见任务记录「验证与限制」。

## 证据

- 代码：`apps/terminal/src/lib/format.ts`（`NumberFormatters`、`getNumberFormatters`、`useNumberFormat`）、`lib/number-format-reactivity.ts`、决策 3 列出的 helper 及其调用方，以及 89 个组件与 Hook 文件（其中 4 个只改日期）。
- 测试：
  - `number-format-reactivity-contract.test.ts`；
  - 在真实挂载界面上先失败的用例：推荐汇总卡、桌面账户面板、TP/SL 区、桌面与手机账户流水、下单确认弹窗、图表叠加线 Hook、Earn 页、订单簿行；
  - 改为包装 `useNumberFormat` 计数渲染的 `trade-row.test.tsx`。
- 验证命令与本次结果：见任务记录。
