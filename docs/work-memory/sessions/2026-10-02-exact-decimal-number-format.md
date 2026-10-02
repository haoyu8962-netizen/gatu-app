<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-exact-decimal-number-format",
  "date": "2026-10-02",
  "title": "手写数字格式不跟随数字格式设置：精确小数串经 formatDecimalString 换分隔符，并逐处分类 toFixed",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "ADR 0036 之后仍有显示绕过 lib/format.ts，固定输出 , 分组与 . 小数点或不分组。把全仓 119 处 toFixed 加 bpsToPercentage 逐处追踪到使用处：33 处拼出绕过设置的文本（23 处默认生产可见），另有若干不经 toFixed 的同类显示。用户选定：lib/format 新增 formatDecimalString（进入 NumberFormatters，只换分隔符、位数与舍入方向不变，去掉多余前导 0），修复全部已核实的可见显示，契约用全仓登记制（ADR 0037，37 个文件 102 处登记）。各界面先失败的挂载用例修复后通过；契约在基线源码树上报 121 处未包裹调用与 2 处手写千分位，变异后同样失败；消息 ID 不变。独立审查后补了充值进行中与金库确认金额的规范写法、跨链发送数量进位边界与设置弹窗滑点范围。固定输入成对构建：总量 +1,216、桌面运行时 +170，按惯例重定基线；04469b52 本身超出总量上限 2,746（与上一条记录不符，未查明）。限制：已登记 helper 返回的协议串在别处显示时契约跟不到；技术整数保持原样；全量单测有一处负载超时，单独通过。",
  "thread": null,
  "baseCommit": "04469b52",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0037-exact-decimal-display-separators.md" },
    { "path": "docs/number-format-setting.md" },
    { "path": "apps/terminal/src/lib/format.ts" },
    { "path": "apps/terminal/src/lib/tests/decimal-display-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/format.test.ts" },
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "path": "apps/terminal/src/lib/trade/numbers.ts" },
    { "path": "apps/terminal/src/components/staking/domain/staking.ts" },
    { "path": "apps/terminal/src/components/vaults/domain/vaults.ts" },
    { "path": "apps/terminal/src/lib/bridge/format.ts" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-market-bar.tsx" },
    { "path": "apps/terminal/src/domain/trade/order-fee-quote.ts" },
    { "path": "apps/terminal/src/lib/trade/tpsl.ts" },
    { "path": "apps/terminal/src/lib/trade/order-notification-copy.ts" },
    { "path": "apps/terminal/src/lib/trade/withdrawal.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx" },
    { "path": "apps/terminal/src/lib/tests/bridge-amount-number-format.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/order-toast-number-format.test.tsx" },
    { "path": "docs/adr/0036-render-time-number-formatters.md" },
    { "path": "AGENTS.md" },
    { "path": "CHANGELOG.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-number-format-reactive-formatters.md" }
  ],
  "supersedes": []
}
-->
# 手写数字格式不跟随数字格式设置：精确小数串经 formatDecimalString 换分隔符，并逐处分类 toFixed

## 背景与范围

同步记录。Claude Code 桌面应用会话，工作树 `angry-northcutt-d85ed7`，分支 `claude/angry-northcutt-d85ed7`；未取得可核对的任务标识。

用户给出的任务来自[上一条记录](2026-10-02-number-format-reactive-formatters.md)与 [ADR 0036](../../adr/0036-render-time-number-formatters.md) 登记的后续：

- 数字格式设置要求每个数字都跟随它（规则 1），但以下显示绕过 `lib/format.ts`，固定输出 `,` 分组与 `.` 小数点：
  - 质押的 `formatStakingAmount`、`formatStakingRatio`；金库的 `groupDecimal`；跨链成功页的 `formatTokenAmount`；
  - 手机行情条的 `formatSignedFixed`、`formatSignedPercent`；手机下单页的 `change24h.toFixed(2)`；
  - 下单费率 `formatOrderFeeRatePercent`（与换算金额同串，德式格式下为 `0.0450% ($1,23)`）；TP/SL 风险收益比。
- 要求：
  1. 在真实挂载的界面上写先失败的测试；
  2. 对其余展示用途的 `toFixed` 分类；
  3. 向用户提出精确小数串如何分隔的方案并由用户选择；
  4. 实现时保留精度与截断方向，`number-format-reactivity-contract` 保持通过；
  5. 考虑一个拒绝由 `toFixed` 拼出展示串的契约；
  6. 更新 `docs/number-format-setting.md`（删除「未完成」里的已修项）、`CHANGELOG.md`（删除 Known 条目）与本记录；
  7. 跑 AGENTS.md 对应检查，按 auto-commit 技能提交，不推送。

**基线。** 工作树创建时在 `main` 的 `3ced842e`，分支没有自有提交。ADR 0036 所在的 `claude/wonderful-goldberg-e47b19`（`04469b52`）未合入 dev，按用户要求把本分支重置到 `04469b52`。该分支叠在同样未推送的 `claude/relaxed-roentgen-fd0316`（`5425b7c1`）与 `claude/laughing-engelbart-b9dbe6`（`2b7973b4`）上。**下面三条分支被改写时，本分支需要重新叠放；按提交合并时会带上那四个提交。**

**并行会话。** 开工时还有两条线：
- 另一会话在 20:32 建了 `claude/integrate-locale-number-format`（`5d3ff8e7`），代码树与 `04469b52` 相同；
- 工作树 `sleepy-archimedes-fbff3e` 同样叠在 `04469b52` 上，在做日期 `locale` 契约，未提交的改动涉及 AGENTS.md、ADR 0036、`docs/number-format-setting.md` 与 `.claude/rules/code-style.md`（只读查看过它的 diff）。

本次文档改动尽量避开它改的相邻行：规则 10 接在规则 9 之后；回归清单加在已有条目之后；ADR 0036 只改第 53 行；不改 `code-style.md`。ADR 编号取 0037，2026-10-02 核对所有本地与远端分支，没有 0037。

## 结论与依据

### 先失败的测试

在真实挂载的组件上为七类显示写了 12 个用例，在基线代码上全部失败、其余 126 项照常通过（草稿目录 `red-run.log`）。各失败点：

- TP/SL 区：德式格式下风险收益仍为 `1:1.5`；
- 下单摘要：费率仍为 `0.0190% / 0.0130%`；
- 手机行情条：英文格式下涨跌额就缺千分位（`+2345`，桌面行情头是 `+2,345`）；
- 手机下单页（非嵌入模式挂载；生产唯一挂载点是嵌入模式，该块被 CSS 隐藏）：仍为 `+12.50%`；
- 质押页两例（`12,345.6789 HYPE`、成功通知 `Moved 1,234.5 HYPE to staking`）、质押弹窗一例；
- 金库列表、详情各一例（`$1.23M`、`+12.35%`、`$12,345.68`），金库操作弹窗一例；
- 跨链成功页、确认页各一例（`1234.57 USDC`，旁边的 `$1,234.56` 有分组）。

范围扩大后新加的显示，每项都先写用例、确认在旧代码上失败，再改实现；已经先改了实现的几处，用临时回退那一行的变异证明失败：
- 质押操作参考 `1234.5 HYPE`、金库确认金额、下单面板持仓 `+1234.5678 BTC`、手机订单簿分组选项、充值金额输入的余额是变异证明；
- 其余在旧代码上直接失败：跨链发送数量 `1234.6 USDC`、资产余额、下单通知 `Bought 1234.5 HYPE` 与子订单 `Filled: 1234.5 / 2000.25`、可用余额 `4964.51 USDC`、提现最低额 `$1200.5`、订单簿分组 `1000`、TWAP 提示 `1234.5`、Mid 读屏名、恢复通知、平仓滑杆 `46.6%`、滑点 `1.4%`、规模偏斜、范围 `0.01–100`、充值手续费。

审查之后补的 8 个用例也都先在修复前失败：
- `formatDecimalString("0005")` 得到 `0,005`；
- 跨链发送数量的 4 个进位边界（`9.99996` 得到 `10.0000`）；
- 金库确认页 `0005` 显示为 `0.005 USDC`；
- 充值进行中显示 `0001234.5 USDC → Hyperliquid`；
- 设置弹窗滑点范围仍为 `0.1% – 5%`。

### toFixed 分类

由一个子代理逐处追踪到使用处，本会话抽查了其中新发现的生产可见项（`floorToString` 的三处显示、下单通知、提现最低额、订单簿标签、TWAP 提示、恢复通知、滑杆读屏文字、滑点、充值表单）并读代码确认。完整表格在草稿目录（`tofixed-classification.md`），未入库。

- 119 处 `toFixed` 加 `lib/format.ts` 的 `bpsToPercentage` 共 120 行，按每行至少到达一处计：
  - 拼出绕过设置的文本 33 处；
  - 只经 `lib/format.ts` 显示 37 处；
  - 从不显示（协议值、输入框、计算）39 处；
  - 仅开发环境的排行榜夹具 8 处；
  - 没有生产调用方 3 处（`funds-amount.ts` 两个 helper 与 `bpsToPercentage`）。
- 33 处里 23 处在默认生产构建中可见；其余 10 处：手机下单页 1 处被 CSS 隐藏，`lib/trade/numbers.ts` 的 `toFixed` 只在缺少市场元数据的回退路径上显示，LiFi 跨链 8 处在默认关闭的 `VITE_LIFI_BRIDGE_CREATE_ENABLED` 后面（成功页在恢复已有执行时也会出现）。
- 任务列出的七类都确认。新增的同类显示：
  - 下单通知与子订单的成交数量（`Bought 0.5 BTC`、`Filled: 0.2 / 0.5`）；
  - 划转与发送弹窗的「可用」余额、桌面下单面板的持仓数量（`floorToString`、`formatDecimalFloor`）；
  - 提现最低额提示（`Minimum withdrawal is $0.4`）；
  - 桌面与手机订单簿的价格分组标签；
  - TWAP 触发价提示、Scale 与手机限价两个 Mid 按钮的读屏名；
  - 资金恢复通知与质押操作参考里的金额；
  - Market Close / Limit Close 滑杆的 `aria-valuetext`（只给读屏）。
- 不经 `toFixed` 的同类显示（不是穷举）：
  - 滑点 `{slippagePercent}%`；
  - 规模偏斜、确认行的 `String(value)` 与范围 `0.01–100`；
  - 子订单的原始数量；
  - 金库确认页原样的输入金额；
  - 充值表单直接显示 viem `formatUnits` 的余额与手续费；
  - 订单簿整数分组标签；
  - LiFi 的 `toPrecision` 与 `<0.0001` 字面量、成功页耗时；
  - 手机行情条的 `0.00%` 字面量；
  - 原子数量与操作参考里的技术整数。
- 另记：旧的 `validateWithdraw` 校验栈（`lib/errors/stacks/withdraw.ts`）没有生产调用方；`PriceInput` 的 `labelValue` 只在传了 `label` 时显示，两个调用方都以 inline 方式使用、不传 `label`。

### 方案选择

用 AskUserQuestion 提了三个问题：

1. 分隔方式，选项为：
   - 分隔符替换 helper（推荐）；
   - lib/format 内置精确格式化；
   - 转成 JS 数字走现有函数（不推荐）。附了三条证据：
     - `9007199254740993.01` 会显示成 `$9,007,199,254,740,994.00`（Node 实测）；
     - `1.005` 按 `toFixed` 是 `1.00`、按 `Intl` 是 `1.01`；
     - `roundingMode: "trunc"` 与字符串精确小数需要 Firefox 116（MDN 兼容数据），而 Vite 7.3 默认构建目标含 Firefox 104（读 `node_modules/vite` 的 `ESBUILD_BASELINE_WIDELY_AVAILABLE_TARGET`）。
2. 修复范围：全部已核实的可见显示（推荐）、七类加其余 `toFixed` 展示、只修七类。
3. 契约：全仓登记制（推荐）、只管组件文件、暂不加。

用户选 1 的推荐项与 2 的推荐项。第 3 问用户回了一个问题「开发文档有实践指南吗？」。答复要点：
- 数字格式的写法规则在 `docs/number-format-setting.md`、`code-style.md`「Format Functions」与 AGENTS.md，但都没写不要用 `toFixed` 拼展示串；
- 契约测试的成文指南只有 `.claude/rules/style-ui-guide.md` 的「Checking a visual rule」，只针对视觉规则，非视觉契约实际沿用同样做法。

再问时用户选了全仓登记制（未选另写一份通用契约指南的选项）。理由与未采用方案见 [ADR 0037](../../adr/0037-exact-decimal-display-separators.md)。

### 实施

- `lib/format.ts`：
  - 新增 `formatDecimalString(value, { trimTrailingZeros? })` 并放进 `NumberFormatters`；
  - 只接受 `[+-]?数字[.数字]`，按设置插入分组符、替换小数点；其他输入返回模块统一的占位符 `-`（`FALLBACK_VALUE_PLACEHOLDER`，不是 `—`）；
  - 去掉整数部分多余的前导 0（审查后加入，见下文「独立审查」）；
  - `number-format-reactivity-contract` 的模块级格式化函数清单加入它；
  - `format.test.ts` 加三种格式、超双精度、去零与拒绝非纯小数串的用例。
- 质押：
  - `formatStakingAmount`、`formatStakingRatio` 增加 `numberFormat` 参数，共用 `formatTruncatedDecimal`（`Big.roundDown` 截断后交给 helper 并去零），删除手写分组；
  - 比例不再先经 `Big#toString`，所以 `1e-10` 这样的极小比例从 `—%` 变为 `0%`；
  - 页面四个组件、弹窗与操作参考取 `useNumberFormat()`。
- 金库：四个格式化函数增加 `numberFormat`，删除 `groupDecimal`；收益图描述 helper 增加参数；确认页金额经 `lib/trade/numbers.ts` 新增的 `toPlainDecimal`（Big.js 规范写法，与提交路径 `scaleFundsAmount` 的 `displayAmount` 相同）再格式化。
- 跨链：
  - `formatTokenBalance`、`formatTokenAmount`、`formatSendAmount` 增加 `numberFormat`，阈值写作 `<` 加格式化后的数；
  - `formatSendAmount` 原来用 `toPrecision(5)`，取整后达到 10 万（从 99,999.5 起）会写成 `1.0000e+5`、`1.2346e+5`。改为在 `toPrecision` 的同一位取整，再按取整后的数保留 5 位有效数字，并保留全部整数位。初版按取整前的指数定小数位，审查用 Node 查出进位边界多一位（`9.99996` 得到 `10.0000`，原来是 `10.000`）；修正后与原来逐位相同，并补了 10 个边界用例；
  - 确认页回退值改用 `formatUSD(0, 2)`，成功页耗时经 `formatNumber`。
- 手机行情条、手机下单页、费率、风险收益比：取整规则不变，结果交给 helper。风险收益比改为 Big 取整后 `toFixed(1)` 去零，与原来的整数判断等价，并补上千分位。
- 下单通知：文案构造与子订单行经 helper；子订单数量来自协议串或 `Big#toString`。
- 划转、发送、持仓数量、提现最低额、订单簿两种分组下拉、TWAP 提示、两个 Mid 按钮、恢复通知、平仓滑杆、充值表单：都在显示处格式化，原始值继续用于输入框、计算与提交。
  - 充值进行中的状态行（审查发现）显示原样存下的输入串，同样先经 `toPlainDecimal`；设置弹窗的滑点范围（审查发现）经 `formatNumber`。
  - 提现校验 `validateWithdrawal` 增加 `numberFormat` 参数，最低额文案放进同名变量 `minimum` 的 helper。
  - `MobileSlippageRowView` 是纯 props 视图，滑点改由容器传入格式化好的字符串。
- 规模偏斜在摘要与确认行按 `SCALE_SKEW_MAX_DECIMALS`（4）格式化，避免 `formatNumber` 默认 3 位把 `1.2345` 舍成 `1.235`。订单数与范围标签经 `formatNumber`。
- Lingui：带占位名的消息保持原变量名，只换成格式化后的值。`DepositForm` 为此在解构时把 `balance`、`cctpFee` 改名，原始值继续传给 `UnitDepositInfo` 与 `AmountInput`。`pnpm i18n:extract` 只改了 6 个目录里 3 条提取注释，msgid 数（zh 2121）与缺失数不变。
- 技术整数（原子数量、原子小数位、金库操作参考串、身份纪元）按决定保持原样。

### 契约

`decimal-display-contract.test.ts` 用 TypeScript AST 扫描 `apps/terminal/src`（测试、`locales`、`.gen.ts` 与 `lib/format.ts` 除外）：

- `.toFixed(`、`.toPrecision(` 只有写在 `formatDecimalString(...)` 第一个参数的表达式里才算包裹。向上找到函数边界即停，所以参数里的回调不算。
- 其余调用按文件登记用途与精确次数：37 个文件、102 处（`toPlainDecimal` 使 `numbers.ts` 由 2 处变为 3 处，契约当场拦下后才更新登记），用途写明协议值、输入框、计算、开发夹具、交给 lib/format 前的取整，或显示处怎样格式化。新文件、次数变化与过期登记都失败。
- `lib/format.ts` 以外不得出现手写千分位正则。审查指出初版只认字面的 `(\d{3})+`，现在匹配 `\d{3})+` 与 `[0-9]{3})+`，覆盖 `(?:\d{3})+`。
- 附 9 个检查器样例（6 个应报出、3 个应放行）与 1 个分组正则样例（两种写法）。

证明会失败：
- 用同一扫描逻辑跑 `git archive 04469b52` 的源码树（草稿目录 `scan-fixed.mjs`）。报出 121 处未包裹调用（119 处 `toFixed` 加 2 处 `toPrecision`）；按登记表会有 3 个未登记文件（手机行情条、手机下单页、费率），质押、金库、跨链、TP/SL 的次数不符，以及质押、金库两处手写千分位正则。
- 在当前代码上把费率改回旧写法后运行真实的契约测试，报出 `domain/trade/order-fee-quote.ts:85`，恢复后通过。

已知限制：契约只看语法位置。已登记 helper 返回的协议串在别处显示时跟不到，例如 `floorToString`、`toPlainDecimal`、`formatPriceForOrderWithRounding`、成交摘要、订单簿标签、提现金额，由登记的用途写明显示处如何格式化。审查复核：在基线源码树上契约只拦得住 11 项（直接在 `toFixed` 处拼文本的那些），其余约 20 处修复只由挂载用例守护。

## 验证与限制

版本：基线 `04469b52` 加本次改动，2026-10-02。

**测试与静态检查**

- 先失败的用例见上文，修复后全部通过。
- AGENTS.md「Number and date formatting」与「Runtime translation contract」两组（12 个文件）在审查修改前跑过，460 项通过。
- 全量 `pnpm --filter @sairn/terminal test` 跑了两次：
  - 审查修改前，系统负载约 39（来自其他会话）：651 个文件中 648 通过、2 失败、1 跳过；8,130 项中 8,127 通过、2 失败、1 跳过。两处失败都是超时：`chart-build-assets` 的 TradingView 摘要校验超过 5 秒，`client-bootstrap-error` 的 `vi.waitFor` 超过 1 秒。单独重跑都通过（656 ms、184 ms）。
  - 全部修改之后，负载约 30：651 个文件中 649 通过、1 失败、1 跳过；8,143 项中 8,141 通过、1 失败、1 跳过。失败的仍是 `client-bootstrap-error` 的同一个 1 秒等待，单独重跑通过（177 ms）。本次改动的文件中只有 `scripts/check-client-bundle-budget.mjs` 名字含 client，与启动代码无关。
- `pnpm --filter @sairn/terminal typecheck` 退出码 0。改动与新增的 73 个 `src` 下 TS/TSX 文件 `biome check` 无问题；`apps/terminal/tests/` 与 `scripts/` 不在 Biome 的检查范围内。`git diff --check` 通过。
- `pnpm i18n:extract`（提交钩子也会执行）只改了 6 个语言目录里各 3 条提取注释（质押 APR 与金库两条提示的占位表达式），msgid 数（zh 2121）与缺失数（ar/es/fr/hi 各 43、zh 3）不变，随本次提交。
- `node --test scripts/check-client-bundle-budget.test.mjs`：16 项通过。

**生产构建与预算**

两边都用 `docs/terminal-performance-baseline.md` 的固定输入构建：
- Node 22.15.0、`NODE_ENV=production`、`NITRO_PRESET=node-server`；
- `SAIRN_BUILD_SHA=04469b52fdd037bf0ef6325ca740942ee701eb5a`、`SAIRN_RELEASE_ID=exact-decimal-display-baseline`、`SAIRN_BUILD_TIME=2026-10-02T00:00:00.000Z`；
- 配对开关关闭，工作树里没有 `.env.local`；
- 基线 `04469b52` 在草稿目录的独立 worktree 里构建，用完已 `git worktree remove`。

两边的产物清单相同：交易页静态启动是 6 个路由预加载、1 个运行时脚本与 4 个语义入口，共 103 个资源；手机运行时增量 14 个资源，桌面 29 个。

| 项（gzip 字节） | 基线 `04469b52` | 本次 | 变化 |
|---|---|---|---|
| 客户端总量 | 3,198,667 | 3,199,883 | +1,216 |
| 交易页静态启动 | 1,564,928 | 1,565,399 | +471 |
| 手机运行时增量 | 117,617 | 117,700 | +83 |
| 桌面运行时增量 | 201,985 | 202,155 | +170 |
| 桌面静态加运行时 | 1,766,913 | 1,767,554 | +641 |
| `trade-terminal-page` | 125,831 | 126,040 | +209 |
| `staking` | 24,065 | 24,257 | +192 |
| `vaults-page` | 28,933 | 29,244 | +311 |

- 按惯例把 `totalGzipBaselineBytes` 提高 1,216（到 3,187,137），桌面运行时基线提高 170（到 192,158），理由写在预算脚本注释里。
- 提高后，本次构建的桌面运行时为 +9,997（上限 10,000），与基线版本相同；总量为 +12,746，也与基线版本相同，超出上限 2,746。
- **总量超限在 `04469b52` 上就存在，本次不掩盖，`pnpm build` 在两个版本上都因此失败。** 上一条记录在同一提交上量到 3,195,280（没有说明是否固定元数据），本次不固定元数据时量到 3,197,943、固定后 3,198,667，差异原因未查明，需要用 CI 构建确认。
- 第一组不固定元数据的成对构建（审查修改前）得到总量 +2,115、桌面 +303，这组数字已作废，因为不符合固定输入的规程。

**真实页面**

- 本工作树的开发服务器：`preview_start` 的 `terminal-inspect`（`vite dev --port 3015`），用 `lsof` 核对过进程工作目录。
  - 第一次因缺少 Privy 应用 ID 报错，于是从主检出复制 `apps/terminal/.env.local`（Git 忽略、未读内容、未提交），核对完删除并停掉服务器。
  - 3005 端口被另一会话的服务器占用，未触碰。
- 内置浏览器面板处于隐藏状态，页面停在启动占位，所以改用仓库的 Playwright 无头 Chromium（草稿目录 `verify-number-format-2.cjs`）。点击是脚本注入的，不是物理输入；数据来自真实 Hyperliquid。
  - `/staking`（1440×900）：验证者表前两行在 `1,234.56` 下为 `≈ 6,425,334 HYPE`、`2.15%`。经页头「Language」菜单选 `1.234,56` 后当场变为 `≈ 6.425.334 HYPE`、`2,15%`，表格仍是同一个 DOM 元素。
  - `/vaults`：德式格式下为 `+3,97%`、`$13,1M`、`+$605.757,53`，切到 `1 234,56` 后为 `+$605 757,53`。
  - `/trade/BTC`（390×844）：默认格式下手机行情条为 `+1,652 / +1.97%`（旧代码没有这个千分位），存储里设为 `de-DE` 后加载为 `+1.674 / +1,99%`。
- 没有在真实浏览器里复现旧代码的缺陷，旧代码的证据来自 jsdom 用例。LiFi 跨链页面在默认开关下不出现，未在浏览器里看。

**独立审查**

由只读的代码审查子代理审查提交前的改动。它的结论：
- 29 个改动的测试文件 586 项通过，`tsc --noEmit` 通过；引用改动模块的 126 个测试文件中 125 个通过，`global-modals-hip3-disclaimer` 在并行负载下 3 处超时，单独运行 29/29 通过；
- 在 `git archive 04469b52` 上复现了契约失败；
- 格式化后的值没有流回计算、输入或提交；消息 ID 不变；ADR 0036 的规则都满足。

以下各项经本会话复核后处理：
- P2 充值进行中的状态行仍显示原样输入（`1234.5 USDC → Hyperliquid`），输入串可能是 `0005`、`5.`。已改为经 `toPlainDecimal` 规范后格式化，加了先失败的挂载用例（旧代码显示 `0001234.5 USDC → Hyperliquid`）。嵌入式流程传给 `deposit()` 的是 viem 格式化的非空金额，不会出现空串。
- P3 `formatSendAmount` 在进位边界多一位，已修正并加边界用例，见「实施」。
- P3 金库确认页对 `0005` 显示 `0,005 USDC`（德式格式下 `0.005 USDC`），而提交的是 5 USDC。已改为显示提交时的规范写法；`formatDecimalString` 也去掉多余前导 0。两处都有先失败的用例。
- P3 AGENTS.md 那条规则写得比规则 10 宽，容易让人把订单簿、仓位里需要取整的价格换成不取整的 helper。已改为「已经为显示取整或截断好的」小数串。
- P3 设置弹窗的滑点范围 `0.1% – 5%` 不跟随设置。已改为经 `formatNumber`，并在测试的设置 store 桩里补上 `getResolvedFormatLocale`。
- P3 契约的分组正则只认字面写法；按 helper 的流向跟不到。前者已放宽，后者写入已知限制。
- P3 工作记录的验证部分当时还是占位、索引过期。本节即补全，提交前重新生成索引。

## 后续与替代关系

- **构建预算总量**：`04469b52` 在本地按固定输入构建就超出总量上限 2,746 字节，与上一条记录的数字对不上。合入前要用 CI 的 Production Builds 确认；如属实，需要单独查明增长来源或重定基线。桌面运行时只剩 3 字节余量，下一个碰到它的改动需要重定基线。
- `lib/format.ts` 的 `bpsToPercentage` 返回 `toFixed` 串、没有生产调用方。契约不扫描 `lib/format.ts`，以后若启用，应改经 `formatDecimalString` 或删除。旧的 `validateWithdraw` 校验栈同样没有生产调用方。
- 契约跟不到已登记 helper 返回值的显示处，见上文「已知限制」。若要加强，可把 `floorToString`、`formatDecimalFloor`、`toPlainDecimal` 与 `numbers.ts` 的 `toFixed` 也按调用处登记。
- `close-order-feedback.ts` 用 `Big#toString` 生成子订单数量，小于 1e-7 时会是指数写法，经 helper 显示为占位符（永续合约的最小数量远大于此，只是理论情况）。
- LiFi 跨链在默认开关下不出现，只有 jsdom 证据。
- 组合收益图手写的日期刻度属于日期规则，未处理。
- 本记录完成了上一条记录「后续」的第一项（不经 `lib/format.ts` 的数字显示）；那条记录本身未改动。没有被整体替代的记录。
- 2026-10-03 追记：本分支已并入集成分支 `claude/integrate-locale-number-format`（PR #71），经过见[集成记录](2026-10-02-integrate-locale-number-format.md)：
  - 上文「构建预算总量」一项：集成会话在没有 `.env.local` 的干净 worktree 里，用同样的固定元数据构建产品代码与 `04469b52` 相同的 `2d6f4676`，结果是 3,195,752，在预算内；与这里记的 3,198,667 相差 2,915，原因没有查。脚本里本分支的上调注释已按集成后的实测改写，原注释见本分支的提交 `f7ae69a2`。
  - 合并时 `format.test.ts` 的格式化函数清单补上了 `formatDecimalString`。本分支改动或新增、原先不在 CI 清单里的 15 个测试文件，已加入「Test number format and runtime locale contracts」步骤。
  - 图表仓位线的仓位数量（`lib/chart/tradingview-overlays.ts`）本分支没有覆盖，仍列在 `docs/number-format-setting.md`「未完成」。
