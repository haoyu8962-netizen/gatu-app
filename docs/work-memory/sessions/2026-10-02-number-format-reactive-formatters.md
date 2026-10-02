<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-number-format-reactive-formatters",
  "date": "2026-10-02",
  "title": "数字格式切换后组件显示旧格式：渲染期格式化改经 useNumberFormat()，并修复日期缓存",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "只裸调用 useNumberFormatRevision() 的组件切换数字格式后仍显示旧格式：React Compiler 1.0.0 按参数缓存 formatNumber(x)，格式化函数读全局设置。用户在三个方案中选定方案 B（ADR 0036）：lib/format 新增 useNumberFormat()（useSyncExternalStore，每次变化换新的函数身份），89 个组件与 Hook 文件改为从它取格式化函数，渲染期 helper 显式接收 NumberFormatters，删除 useNumberFormatRevision 与交易行的 use no memo；number-format-reactivity-contract 改为跨模块源码级规则，基线报 356 处、修复后 0。另按编译产物修复 15 处不传 locale 的日期缓存（含编译器提升的闭包里漏统计的 4 处）。真实挂载界面上 9 个数字用例与 8 个语言用例在旧代码上失败、修复后通过；全量单测、类型检查、Biome、生产构建预算通过，余量收紧；开发服务器真实页面核对数字与日期切换。范围外：质押、金库精确金额、跨链到账金额手写格式不跟随设置。",
  "thread": null,
  "baseCommit": "5425b7c1",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0036-render-time-number-formatters.md" },
    { "path": "apps/terminal/src/lib/format.ts" },
    { "path": "apps/terminal/src/lib/number-format-reactivity.ts" },
    { "path": "apps/terminal/src/lib/tests/number-format-reactivity-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/referral-summary-cards.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/account-ledger-number-format.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/referral-history-locale.test.tsx" },
    { "path": "apps/terminal/src/domain/trade/order-confirmation.ts" },
    { "path": "apps/terminal/src/components/earn/earn-outcome-toast.tsx" },
    { "path": "apps/terminal/src/components/trade/orderbook/trade-row.tsx" },
    { "path": "docs/number-format-setting.md" },
    { "path": "docs/i18n-presentation.md" },
    { "path": "AGENTS.md" },
    { "path": "CHANGELOG.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-vault-fetched-time-locale.md" }
  ],
  "supersedes": []
}
-->
# 数字格式切换后组件显示旧格式：渲染期格式化改经 useNumberFormat()，并修复日期缓存

## 背景与范围

同步记录。Claude Code 桌面应用会话，工作树 `wonderful-goldberg-e47b19`，分支 `claude/wonderful-goldberg-e47b19`；未取得可核对的任务标识。

用户给出的任务如下。问题是在页头语言菜单里切换数字格式（如 `1,234.56` → `1.234,56`）后，多数组件仍显示旧格式。组件只写了裸调用 `useNumberFormatRevision();`，订阅让组件重渲染，但 React Compiler 把 `formatNumber(x)` 一类调用按参数缓存，格式化函数从全局状态读设置，重渲染拿到的仍是旧字符串。要求：

1. 先向用户提出修复方式，由用户选择；
2. 在真实挂载的界面上写先失败的测试；
3. 扩展 `number-format-reactivity-contract`，拒绝修订号到不了格式化的订阅；
4. 核实 12 处日期格式化候选，并对确认的传显式 `locale`；
5. 跑 AGENTS.md 对应检查，更新 `docs/number-format-setting.md`、`CHANGELOG.md` 与本记录；提交，不推送。

问题来源是[上一条记录](2026-10-02-vault-fetched-time-locale.md)的「范围外发现：数字格式订阅」。

**基线。** 工作树创建在 `main` 的 `3ced842e`，它与 `origin/dev` 的 `682430ba` 代码树相同，分支没有自有提交。按用户要求，改动前重置到本地分支 `claude/relaxed-roentgen-fd0316` 的 `5425b7c1`。该分支未推送，叠在同样未推送的 `claude/laughing-engelbart-b9dbe6`（`2b7973b4`）上。**如果那两条分支之后被改写，本分支需要重新叠放；按提交合并时它会带上那三个提交。** ADR 编号取 0036，因为 0033–0035 已被三条未推送分支占用（`claude/silent-email-wallet`、`claude/privy-fiat-funding`、`claude/infallible-goldstine-02a7e3`）。

## 结论与依据

### 取证方法

草稿目录里写了四个脚本，未入库：

- 编译：用 `@vitejs/plugin-react` 依赖的 `@babel/core`，按 `vitest.config.ts` 的顺序挂 Lingui 宏插件与 `babel-plugin-react-compiler` 1.0.0，工作目录设为 `apps/terminal`。
- 编译产物分析：对每处格式化函数（及经它们格式化的模块级 helper）的引用，向上找最内层的 `if ($[n] !== …)` 缓存守卫，列出依赖。第一版漏了一类：编译器会把不捕获响应式值的闭包提升为模块级 `_tempN` 函数，其中的调用被算到 `_temp` 头上。补上「按 `_temp` 的引用处找守卫」后重算。
- 源码级扫描原型：后来移进契约测试，见下文「契约」。
- 改造后核对：检查每个调用 `useNumberFormat()` 的已编译函数里，格式化调用所在守卫是否依赖格式化函数。

### 基线规模（`5425b7c1`）

- 76 个文件共 89 处裸调用 `useNumberFormatRevision();`。
- 编译产物里，组件与 Hook 中有 218 处数字格式化引用落在不含修订号的缓存槽里，涉及 66 个组件或 Hook。其中少数在 CSV 导出的 `getValue` 或 effect 里，执行时才读设置，无害；分类没有逐处剔除。另有 37 处在被提升的 `_temp` 闭包里，同样被不含修订号的守卫包着，第一版统计漏掉了它们。上一条记录的「200 处」是另一种计数，不可直接比较。
- 4 个组件或 Hook 经 helper 格式化数字，却根本没订阅：`AccountTransfersTab`、`MobileAccountTransfersTab`、`useTradingViewOverlayLines`、`useTwapFillHistoryCsv`。
- 23 个组件或 Hook 当时没被编译器编译，每次渲染重算，只是碰巧正确。这样的组件以后被编译器编译，就会悄悄变旧。
- 源码级契约在基线上报 356 处违规，分布在 84 个文件。

### 方案选择

用 AskUserQuestion 给出三个方案：A 修订号作参数，B Hook 返回格式化函数（推荐），C `"use no memo"`。附上规模、代价与代码形态，用户选 B。理由与未采用方案见 [ADR 0036](../../adr/0036-render-time-number-formatters.md)。

选择前用临时探针（跑完即删）在 vitest 的编译流水线里核对了两件事：

- 真实的 `ReferralSummaryCards` 切到 `de-DE` 后仍是 `1,234`；
- 用 Hook 提供的格式化函数的组件，直接调用和嵌套渲染函数里的调用都更新为 `1.234`、`98.765,40 USDC`。

另外编译了一个样例组件，确认守卫依赖包含解构出的格式化函数，具名嵌套函数（`formatPnl`、`renderRow`）的创建也依赖它。

### 实施

- 核心：`lib/format.ts` 新增 `NumberFormatters`、`getNumberFormatters()`、`useNumberFormat()`。对象里的函数是包装：身份随修订号更换，调用时仍读当前设置，所以被事件回调留下的旧引用也不会输出旧格式。`lib/number-format-reactivity.ts` 改为只导出通知、订阅与修订号读取，`useNumberFormatRevision` 删除。`lib/format` 导入该模块，该模块不导入 `lib/format`，没有循环。
- 组件：用 codemod（TypeScript AST，按组件识别引用并替换裸订阅或插入 Hook 调用、改写导入）处理了 74 个文件，再经 Biome 格式化。codemod 漏了一处：`price-input-with-percent.tsx` 在参数默认值里用 `formatUSD`，参数先于函数体求值，类型检查报错后改为在函数体里回退。
- helper：9 个非组件模块改为接收 `NumberFormatters`，组件文件里 7 个模块级 helper 也改为接收它（清单见 ADR 0036 决策 3）。依赖这些签名的单元测试与测试 harness 传 `getNumberFormatters()`。资金费率图标签原来的 `_locale` 也改为实际传给日期格式化。
- 契约看不到的一处：`EarnOutcomeToastContent` 渲染的是提交时在异步流程里创建的 `render` 闭包，它只裸订阅，缓存的输出不会重算。改为把自己的格式化函数传给回调。在其他资金类提示里，金额是弹出时生成的字符串，按既有约定不随设置变化（见后续）。
- `TradeRowComponent` 的 `"use no memo"` 是 `6e70351b`（2026-08-27）专为这个依赖加的，注释写明原因，一并删除，显式 `memo` 比较函数保留。`trade-row.test.tsx` 改为包装 `useNumberFormat` 计数渲染。
- 9 个测试文件曾把 `@/lib/number-format-reactivity` 整个替换为只含 `useNumberFormatRevision` 的桩。`lib/format` 现在在模块加载时读这个模块，这些桩会让它崩溃。8 处直接删掉（真实模块无副作用），`trade-row.test.tsx` 按上条改写。

### 契约

`number-format-reactivity-contract.test.ts` 重写为源码级规则，规则内容见 ADR 0036 决策 6。实现上：

- 跨模块求传递闭包：跟随 `@/` 与相对导入、具名与默认导入、命名空间导入、具名再导出、`export *` 与本地别名导出；
- 词法作用域判定：参数、块内声明、解构、catch、for 头；
- 组件识别：按名称，另加 `.tsx` 里匿名的默认导出函数与路由的 `component` 类选项；
- 24 个正反样例。应报出的 19 个覆盖：
  - 组件、Hook、参数默认值、事件回调、`memo` 包装；
  - 匿名默认导出组件、路由内联组件；
  - 命名空间导入、跨模块 helper、经 `export *` 的 helper、别名再导出、默认导出的 helper、同文件 render 回调；
  - `getNumberFormatters()`、修订号读取；
  - 裸 `useNumberFormat()`、别名后的裸调用、赋值后未使用；
  - 导入时格式化。

  应放行的 5 个：解构的 Hook 函数、接收格式化函数的 helper、从 props 接收、局部同名函数遮蔽、组件不引用的模块级代码。

另外保留并改写两条既有检查：两个 `memo` 行在函数体内取格式化函数；标签页标题的 effect 依赖 `formatPrice`。

变异核对：把契约复制进基线 worktree（`5425b7c1`）运行，复制的文件随后用 `git checkout` 还原，该 worktree 状态干净。共核对两次：
- 初版：真实源码树检查报 356 处违规（与原型一致），两个 `memo` 行和标题三项失败，15 个样例通过；
- 按审查扩展后的版本：仍报 356 处，同样 4 项失败、24 项通过。

已知限制：

- 组件按名字识别（加上述两类），不识别类组件与 `memo`/`forwardRef` 之外的包装函数。
- 只认名字绑定，经 props 或元素传入、在别处创建的闭包看不到（`EarnOutcomeToastContent` 属于这类）；按计算属性名访问（`format[name]`）也看不到。
- 只覆盖经 `lib/format.ts` 的格式化。

### 改造后的编译产物核对

在 79 个调用 `useNumberFormat()` 的已编译组件或 Hook 里有 290 处格式化调用，包括直接调用、经对象调用和把格式化函数传给 helper。其中 265 处所在守卫依赖该格式化函数或其对象，25 处不在守卫内（每次渲染重算），缺依赖的为 0。另有 19 个调用 `useNumberFormat()` 的函数未被编译，每次渲染重算，如 `MarketOverview`、`MobileMarketBar`、`MobileTradeView`、`PositionTpSlForm`、`OrderToast`、`SendModalBody`、`TransferModalBody`、`DepositModal`。初稿写成「8 个」，是用文件数 87 减去函数数 79 得出的，算法错误，审查指出后用同一脚本按函数重新统计更正。`TradeRowComponent` 去掉 `"use no memo"` 后已被编译。

### 日期候选

| 候选 | 编译后（基线） | 结论 |
|---|---|---|
| `funding-history-page` 范围（2 处） | `[history.rangeEndTime, history.rangeStartTime]` | 确认，已修；测试 |
| `funds-action-recovery-host` 开始时间 | `[activeMarker.startedAt]` | 确认，已修；测试 |
| `staking-action-modal` 操作参考 | `[reference.startedAt]` | 确认，已修；无测试 |
| `staking-view` 锁定时间、操作历史 | 不含语言 | 确认，已修；历史有测试 |
| `referred-traders`（2 处） | `[getTokenName]`、`[tokenMetadata]` | 确认，已修；无测试 |
| `orders-tab` 委托时间 | `[order.timestamp]` | 确认，已修；测试 |
| `bridge/success-screen`（2 处） | `[processDetails]` | 确认，已修；无测试 |
| `earn-view` `HistoryTable` | `[ready, rows, translate]` | `translate` 由 `t` 构造、随语言变化，**本来就正确**；测试通过，代码未改 |
| `_temp` 提升漏统计：`earn-view` `InterestTable`、`referral-claim-history`、`referral-legacy-history`、`staking-view` 奖励 | `[data.interest, ready]`、`[rows]`、`[rows]`、`[rewards]` | 确认，已修；均有测试 |

用户列出的 12 处中有 11 处确认，`HistoryTable` 不是缺陷；另确认 4 处被提升的，共 15 处。修法统一为在组件里无条件读出 `const locale = i18n.locale;` 再传 `{ locale }`。`funding-history-page` 同一组件里的两处行时间原本与 `_t` 同槽、正确，为一致也改为显式传入（不计入 15 处）。修复后重编译，这些调用的守卫都含 `locale`。

### 范围外发现

- 不经 `lib/format.ts` 的数字显示根本不跟随设置，都手写 `,` 分组与 `.` 小数点（或 `toFixed`）：
  - 质押页的 `formatStakingAmount`/`formatStakingRatio`、金库的 `groupDecimal`、跨链成功页的 `formatTokenAmount`（本会话发现）；
  - 手机行情条 24h 涨跌、手机下单页涨跌幅、下单费率（与换算金额同串，德式格式下为 `0.0450% ($1,23)`）、TP/SL 风险收益比（独立审查发现，已逐处读代码核实）。

  登记在 `docs/number-format-setting.md` 的「未完成」、ADR 0036 与 CHANGELOG 的 Known，并开了后续任务卡片。
- 资金类提示（划转、发送、提现、金库）在弹出时把金额格式化成字符串，已显示的不随设置变化，与这些提示的既有语言约定一致。

## 验证与限制

版本：基线 `5425b7c1` 加本次改动，2026-10-02。

**先失败的测试（修复前代码上运行）**

- 数字格式：在 8 个文件里共 9 个用例失败，日志在草稿目录 `red-before-fix.log`；同一运行里其余 43 项通过。各文件的失败点：
  - `referral-summary-cards`：仍为 `1,234`；
  - `account-panel`：初版只在保证金率失败（`73.54%`）。前三项在测试里刷新，是因为测试替身每次渲染返回新对象。审查指出后，测试替身在状态不变时返回同一个快照对象。改后用例在基线上五项全部停在旧格式（`$115.75`、`-$64.50`、`$85.13`、`73.54%`、`14.71x`），文件里其余 23 项在基线上照常通过；
  - `tp-sl-section`：风险收益行仍为 `-$1,000.00 +$2,000.00`；
  - `account-ledger-number-format`：桌面与手机两例；
  - `order-confirmation-modal`、`use-tradingview-overlay-lines`、`earn-view`、`orderbook-row-tooltip`。
- 语言：8 个用例失败——`referral-history-locale` 2、`funding-history-page` 1、`funds-action-recovery-host` 1、`staking-view` 2、`earn-view` 利息表 1、`desktop-orders-cancel-all` 1。`earn-view` 的操作历史例在旧代码上就通过（见上表）。
- 未为 `referred-traders`、质押弹窗参考、验证者锁定时间与跨链成功页写测试，只有编译产物证据。

**修复后**

- 上述用例全部通过：数字 8 个文件 52 项；日期与契约 9 个文件 281 项。
- AGENTS.md「Number and date formatting」与「Runtime translation contract」两组：16 个文件 508 项通过。
- 类型检查与 Biome 有过一次失误。初稿写「通过」，依据的是重写契约测试之前的那次类型检查。审查发现两处问题：
  - 契约测试读 `PropertySignature.initializer`，TypeScript 5.7.2 没有该属性（TS2339），类型检查失败；
  - `referral-history-locale.test.tsx` 有一处格式问题。

  修正后重跑（见文末「审查后」），`apps/terminal/tests/` 不在 Biome 的检查范围内。
- 全量 `pnpm --filter @sairn/terminal test`：
  - 第一次运行在日期修复之前（数字改造完成后），19:23–19:25，负载约 5：647 个文件中 646 通过、1 跳过；8,060 项中 8,059 通过、1 跳过。运行期间没有改源码。
  - 第二次运行在全部改动之后（数字、日期、文档；审查修改之前），19:38–19:40，负载约 5–9：648 个文件中 647 通过、1 跳过；8,069 项中 8,068 通过、1 跳过。

**审查后（最终版本）**

- 第三次全量运行在审查修改之后、契约测试提速之前，20:15–20:20，负载约 10–13：648 个文件中 644 通过、3 失败、1 跳过；8,078 项中 8,069 通过、2 失败、7 跳过。三处失败都是超时：
  - `positions-panel-preload` 的钩子超时（30 秒）；
  - `chart-store` 的钩子超时（10 秒）；
  - 本次的契约测试超时：全仓检查用了 5.5 秒，超过默认 5 秒。

  前两个文件本次没有改动，单独重跑 17 项全部通过，当时负载 19–32，来自其他会话。契约测试的处理：作用域声明按节点缓存，违规扫描跳过不可能触及格式化的模块，全仓检查从约 2.5 秒降到 0.93 秒，另设 30 秒超时。在基线上复核仍报 356 处、4 项失败。
- 之后没有再跑全量，因为负载过高，再跑只会多出无关超时。改为把本次改动或新增的全部 28 个测试文件，加数字/日期与翻译两组回归及相关面（共 42 个文件）一起运行，946 项全部通过。
- `pnpm --filter @sairn/terminal typecheck` 退出码 0。改动与新增的 125 个 TS/TSX 文件 `biome check` 无问题。`git diff --check` 通过。
- `pnpm i18n:extract`（提交钩子也会执行）只改了 6 个语言目录里同一行提取注释：`Locked until {0}` 的占位符表达式随质押页的日期改动更新，消息 ID 与译文不变，随本次提交。各语言的缺失译文数（ar/es/fr/hi 各 43、zh 3）是既有状态。
- `pnpm memory:index`、`memory:check`、`memory:test` 通过，改动文档里的相对链接全部可解析。

**生产构建**

两次构建均用 Node 22.15.0、`NODE_ENV=production`、`NITRO_PRESET=node-server`、配对关闭，工作树没有 `.env.local`。基线在独立 worktree 里构建。两次都通过预算检查。

| 项 | 基线 | 本次 | 变化 | 距上限 |
|---|---|---|---|---|
| 客户端总量 gzip | 3,191,022 | 3,195,280 | +4,258 | 641 |
| 交易页启动闭包 | 1,561,076 | 1,563,514 | +2,438 | 27,702 |
| 手机运行时启动 | 117,439 | 117,584 | +145 | 2,996 |
| 桌面运行时启动 | 201,343 | 201,832 | +489 | **156** |
| `trade-terminal-page` | 125,141 | 125,785 | +644 | 1,457 |

体积增加来自缓存守卫多出的依赖项。总量与桌面运行时的余量已很小，下一个改动可能需要按惯例重定基线。

**真实页面**

- 本工作树开发服务器：`preview_start` 的 `terminal-inspect`，`vite dev --port 3015`，用 `lsof` 核对过进程工作目录。`apps/terminal/.env.local` 从主检出复制，该文件被 Git 忽略，核对后已删除，未提交。3005 端口被另一个会话的开发服务器占用，未触碰。
- 内置浏览器面板处于隐藏状态，视口模拟 1440×900。数据来自真实 Hyperliquid。点击经页头「Language and number format」菜单，是工具注入的点击，不是物理输入。
- `/leaderboard`：选 `1.234,56` 后前三行当场变为 `$3.362.843.580,34 $713.708.002,33 +26,94%` 等；存储里 `numberFormatLocale` 为 `de-DE`。
- `/fundingHistory/<排行榜第一名地址>`：时间范围由 `09/02, 19:38 – 10/02, 19:38` 切中文后当场变为 `09/02 19:38 – 10/02 19:38`，`html lang` 为 `zh`。
- 没有在真实浏览器里复现旧代码的缺陷。旧代码的证据来自 jsdom 测试与编译产物。

**独立审查**

由只读的代码审查子代理审查提交前的改动（基线 `5425b7c1`）。它另写脚本复现了编译产物统计（79 / 290 / 265 / 25 / 0），并用 AST 扫描确认每处新插入的 `useNumberFormat()`、`useLingui()` 都在组件或 Hook 顶层、任何 return 之前。以下结论来自它的报告，标「已核实」的经本会话复核：

- 未发现行为回归：
  - 下单确认行仍格式化提交的数量与价格，没有格式化字符串进入提交路径；
  - `formatPnlValue` 默认值的改写行为相同；
  - 订单簿闪动比较原始值，切换格式不会误触发；
  - 新测试在 `git archive 5425b7c1` 副本上共 12 处失败、分布在 9 个文件，都是旧字符串；Earn 操作历史例在基线上通过，与本记录一致。
- 确认 1：契约测试类型检查失败。已核实，已修。
- 确认 2：记录里类型检查与 Biome「通过」不成立，「8 个未编译函数」应为 19。已核实，已更正。
- 确认 3：CHANGELOG 宣称的覆盖面大于实际。手机行情条涨跌、手机下单页涨跌幅、下单费率、风险收益比从不跟随设置。另有三处措辞问题：
  - 文档说「导出调用方传 `getNumberFormatters()`」，源码里并没有这样的调用方；
  - 代码风格规则只写「渲染期间」，实际禁止范围包括事件回调与 effect；
  - AGENTS.md 把「渲染期日期传 `locale`」写成既成规则，而组件与 Hook 中 64 处日期调用有 38 处没传，碰巧正确。

  已逐处读代码核实，改为在 CHANGELOG、ADR、归属文档中列为已知例外并改写措辞；修复转入后续任务卡片。
- 确认 4：契约漏检命名空间导入、`export *`、本地别名导出、默认导入、匿名默认导出组件、路由内联组件、别名后的裸调用、赋值后未使用（当前代码里都没有这些写法）。已补实现与 9 个样例；类组件、其他包装函数仍不识别，写入已知限制。
- 确认 5：账户面板用例证明的内容比用例名称说的少。已改为稳定快照，并在基线上复核，见上文。

**未覆盖**

- 未运行 Playwright 浏览器套件。
- 没有物理输入。
- 交易页、账户面板（需连接钱包）等面没有在真实浏览器里切换核对。

## 后续与替代关系

- 不经 `lib/format.ts` 的数字显示（质押、金库精确金额、跨链到账金额）需要决定精度规则后改造，见上文。
- 日期格式化目前只有约定、没有契约：组件里仍有不传 `locale` 的调用，它们与 `_t` 同槽而碰巧正确。可按数字的做法加源码级契约，要求渲染期日期调用都传 `locale`。
- 构建预算余量（总量 641、桌面运行时 156）已很小。
- 本记录取代上一条记录「后续」里的「数字格式订阅失效」与「12 处日期候选」两项；那条记录本身未改动。
- 没有被整体替代的记录。
