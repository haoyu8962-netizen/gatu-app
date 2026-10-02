<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-date-locale-reactivity-contract",
  "date": "2026-10-02",
  "title": "日期与列表格式化契约：组件与 Hook 调用 formatDateTime 等函数一律传 locale",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "formatDateTime、formatDateTimeShort、formatTime、formatList 不传 locale 时读全局 Lingui 语言，React Compiler 按其余参数缓存。新增跨模块源码级契约 date-locale-reactivity-contract：组件与 Hook 里对这四个函数（含别名）的每次引用都须是带 locale 选项的调用，effect、事件回调与 CSV 导出列也算；经模块级 helper 的传递闭包与导入时调用同样拦截，并自检 lib/format.ts 读语言的导出名单。它在 04469b52 上报 38 处、修复后为 0，没有例外清单。38 处（19 个文件）改为无条件读 const locale = i18n.locale 后传入。编译产物显示修复前这些调用都碰巧正确（守卫含 _t/translate、不缓存或导出时才执行），用户可见行为不变，不写 CHANGELOG。独立审查后移植集成分支 089747f5 对数字契约的修补并补别名处理，8 个变异都被样例拦下。类型检查、Biome、两组回归 484 项、触及面 456 项通过；全量单测除负载超时外通过，失败的 7 个文件重跑通过。生产构建客户端总量 +475、超出预算 23 字节，按惯例上调总量基线，桌面运行时启动只余 84 字节。新契约已加入 CI。",
  "thread": null,
  "baseCommit": "04469b52",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/lib/tests/date-locale-reactivity-contract.test.ts" },
    { "path": "apps/terminal/src/lib/format.ts" },
    { "path": "apps/terminal/src/lib/tests/number-format-reactivity-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/i18n-reactivity-contract.test.ts" },
    { "path": "apps/terminal/src/components/trade/positions/history-tab.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-twap-fill-history-csv.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-history-csv-export.ts" },
    { "path": "apps/terminal/src/lib/trade/trades.ts" },
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": "docs/i18n-presentation.md" },
    { "path": "docs/number-format-setting.md" },
    { "path": "docs/adr/0036-render-time-number-formatters.md" },
    { "path": "AGENTS.md" },
    { "path": ".claude/rules/code-style.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-number-format-reactive-formatters.md" }
  ],
  "supersedes": []
}
-->
# 日期与列表格式化契约：组件与 Hook 调用 formatDateTime 等函数一律传 locale

## 背景与范围

同步记录。Claude Code 桌面应用会话，工作树 `sleepy-archimedes-fbff3e`，分支 `claude/sleepy-archimedes-fbff3e`；未取得可核对的任务标识。

用户给出的任务如下。`lib/format.ts` 的 `formatDateTime`、`formatDateTimeShort`、`formatTime`、`formatList` 不传 `locale` 时读全局 Lingui 语言；React Compiler 按其余参数缓存渲染期调用，语言切换后保留旧语言，除非该调用碰巧与 `_t` 或由它构造的翻译函数同在一个缓存槽。2026-10-02 已按编译产物修复 15 处，组件与 Hook 里仍有约 38 处渲染期调用不传 `locale`，只是碰巧正确。要求：

1. 按 `number-format-reactivity-contract.test.ts` 的 TypeScript AST 写法加源码级契约，拒绝组件与 Hook 里不带 `locale` 的渲染期调用，附正反样例，只有确有例外时才列例外清单；
2. 证明它在当前代码上失败，再在每个报出的位置传 `locale`（按 `docs/i18n-presentation.md` 无条件读出 `const locale = i18n.locale;`）；
3. 跑 AGENTS.md 对应检查（至少「Runtime translation」与「Number and date formatting」两组、类型检查与 Biome），更新 `docs/i18n-presentation.md` 与本记录，提交，不推送。

这一任务处理[上一条记录](2026-10-02-number-format-reactive-formatters.md)「后续」里的「日期格式化目前只有约定、没有契约」一项。

**基线。** 工作树创建在 `main` 的 `3ced842e`，它与 `origin/dev` 的 `682430ba` 代码树相同，分支没有自有提交。按用户要求，改动前 `git reset --hard` 到本地分支 `claude/wonderful-goldberg-e47b19` 的 `04469b52`（ADR 0036）。该分支未推送，叠在同样未推送的 `claude/relaxed-roentgen-fd0316`（`5425b7c1`）与 `claude/laughing-engelbart-b9dbe6`（`2b7973b4`）上；另一会话在 `wonderful-goldberg-e47b19` 工作树里建了 `claude/integrate-locale-number-format`。本任务开始时它停在 `5d3ff8e7`，代码树与 `04469b52` 相同；本任务进行期间它又加了两个提交（截至 21:00）：

- `41c585cb`：新增 CI 步骤「Test number format and runtime locale contracts」；
- `089747f5`：按审查补数字契约的组件识别与模块图漏洞，并改了 `code-style.md`、ADR 0036、`number-format-setting.md` 等文档。

本分支仍按用户要求基于 `04469b52`，没有叠到集成分支上。核对过文档：那两个提交改的行与本次改的行之间都隔着未改动的行，按 diff 判断合并时不会冲突。**上面这些分支如果被改写，本分支需要重新叠放；按提交合并时会带上它们的提交。**

## 结论与依据

### 契约的范围：组件与 Hook 里的全部调用

任务写的是「渲染期调用」。`i18n-reactivity-contract` 对直接读 `i18n.locale` 放行四类回调（effect、`useState`/`useReducer` 初始化、JSX 的 `on*`/`ref`、传给其他 Hook 的选项对象里的函数）。日期契约没有沿用这份放行清单，而是要求组件与 Hook 里**每一处**引用都是带 `locale` 的调用，effect、事件回调与 CSV 导出列也不例外。理由：

- 与数字格式契约一致。ADR 0036 决策 2 同样覆盖事件回调与 effect。
- 不需要按名字判断哪些回调在渲染之外执行。Hook 选项里的函数也可能在渲染期间被调用，放行清单分辨不出来。
- 导出列读全局语言会与表头不一致。`useUserFillsCsvExport` 等 Hook 的 `exportCsv` 在 `await` 之后才调用渲染时捕获的 `buildRows`（`use-history-csv-export.ts`），表头用的是那次渲染的 `t`。导出期间切换语言时，日期却按切换后的全局语言格式化。传入同一次渲染的 `locale` 后两者一致。
- effect 不传 `locale` 时，语言切换不会让它重跑，它写出的日期会停在旧语言。传入渲染期的 `locale` 后，它进入依赖，effect 随切换重跑。
- 代价只是这些回调也要写 `locale`。值可以是渲染期的局部变量；effect 与内联事件回调里也可以在执行时读 `i18n.locale`，这适合活得比渲染久的回调。后一种写法是按审查意见补进文档的，见下文。

按这个范围，契约正好报出任务估计的 38 处，其中 13 处是 CSV 导出列。

### 契约规则

新文件 `date-locale-reactivity-contract.test.ts`，没有并入 `i18n-reactivity-contract.test.ts`：规则需要跨模块解析，数字契约那套模块图与作用域代码放进后者会让它翻倍。这里复制了那套代码，与现有契约测试各自独立的写法一致。初版复制自 `04469b52`；独立审查（见下文）指出集成分支的 `089747f5` 已经修补了其中的组件识别与模块图漏洞，于是把那些修补移植过来，并按日期规则的需要补了别名处理。规则：

- 组件与 Hook 里，对四个函数（或它们的别名）的每次引用都必须是调用，并且选项参数是含 `locale` 属性的对象字面量。识别会穿过括号、`as`/`satisfies` 与非空断言，也认 `["locale"]` 写法。下面几种都算缺少：
  - 不传选项，或选项里没有 `locale`；
  - 只有展开（`{ ...options }`）；
  - 选项是变量；
  - 把函数本身当作值传出去。
- 组件与 Hook 按名字识别：自己的名字，或 `memo`/`forwardRef` 包装后赋给的变量名（包装里的函数名小写也算）。另外两类匿名函数也算：`.tsx` 里匿名的默认导出函数（含加括号的写法），以及路由的 `component` 类选项（含字符串键）。
- 跨模块求传递闭包：模块级声明里有不合规引用的，或引用了这类声明的，组件与 Hook 都不得引用。跟随 `@/` 与相对导入、具名与默认导入、命名空间导入（含从命名空间解构出的名字）、具名再导出、`export *`、本地别名导出。
- 模块级别名（`const formatWhen = formatDateTime`、`= format.formatDateTime`）按被别名的函数处理：带 `locale` 调用就放行，不带就违规。
- 模块顶层在导入时调用而不带 `locale` 算违规。只是保存函数引用（别名）不算，用到别名的组件仍按上一条检查。
- 自检：`lib/format.ts` 里经本模块函数读到 Lingui `i18n` 的导出，必须正好是契约列出的四个。以后新增读界面语言的导出时，这一项会失败，提醒把它加进名单。
- 局部同名函数（例如 `lib/chart/format.ts` 自己的 `formatTime`）、经 props 传入的函数不算。
- 28 个应报出、9 个应放行的样例，加 3 项检查（全仓、`lib/format.ts` 自检、自检本身的合成样例），共 40 项。

没有例外清单：修复后 0 处违规，不需要例外。

已知限制：

- 只检查写了 `locale`，不检查值从哪里来，也不检查后面的展开会不会覆盖它（`{ locale, ...opts }`）。可选或带默认值的 `locale` 参数仍依赖调用方传入。例如 `processTrades(trades, locale?)`，目前唯一调用方 `TradesPanel` 传了 `i18n.locale`。
- 不跟随命名空间再导出（`export * as fmt from …`），也看不到导入时立即执行的函数（IIFE）里的调用。
- 与数字契约相同，不识别类组件、`memo`/`forwardRef` 之外的包装函数、按计算属性名访问（`format[name]`），也看不到在别处创建、经 props 传入的闭包。
- 下面几种写法会被误报，但都偏严、不会放过缺陷：`.call(…)` 调用；把 `memo` 包装的组件当作值引用时会重复报一次；路由的 `head` 不带 `locale` 格式化时，同文件里引用 `Route` 的组件也会被报。

### 修复前的契约结果

初版契约在 `04469b52` 上运行（工作树里还没有改源码），全仓检查报 38 处，26 个样例全部通过。修订版（见上）复制进独立的 `04469b52` worktree 运行，同样只有全仓检查失败，其余 39 项通过；报出的 38 处与初版逐行相同，复制的文件随后删除。日志在草稿目录 `contract-red-before-fix.log`、`contract-v2-red-base.log`，未入库。38 处分布在 18 个组件文件与 1 个 Hook 文件：

- 历史委托页 6；
- 交易历史页 4；
- 桌面委托历史 4，手机委托历史 4；
- 桌面成交历史 3，手机成交历史 2；
- 桌面资金费 2，手机资金费 2，资金费历史页的导出列 1；
- 桌面与手机出入金各 1；
- TWAP 历史与成交，桌面表、手机列表各 1，TWAP 成交导出 Hook 1；
- 手机委托卡 1；
- 仓位分享卡 1；
- Earn 操作历史 1。

### 编译产物核对

方法沿用上一条记录：用 `@vitejs/plugin-react` 依赖的 `@babel/core`，按 `vitest.config.ts` 的顺序挂 Lingui 宏插件与 `babel-plugin-react-compiler` 1.0.0，工作目录设为 `apps/terminal`。对每个格式化调用，向上列出它外面每一层 `if ($[n] !== …)` 缓存守卫的依赖；调用在编译器提升出的模块级 `_tempN` 里时，按 `_tempN` 的引用处找守卫。草稿脚本 `compile-guards.mjs`，未入库。

19 个文件编译后共有 43 处格式化调用（同一 JSX 表达式里的两处源码调用会合成一行编译产物，所以与源码行数不一一对应）。

| 状态 | 修复前（`04469b52`） | 修复后 |
|---|---|---|
| 传了 `locale` | 5 | 43 |
| 不在任何缓存守卫里（每次渲染重算） | 14 | 14 |
| 所在的每层守卫都含 `locale` | 3 | 29 |
| 所在守卫不含 `locale` | 26 | 0 |
| 其中在被提升的 `_temp` 闭包里 | 13 | 0 |

修复前那 26 处分两类：

- 13 处是 CSV 导出列，被提升为 `_temp`，点击导出时才执行，执行时读全局语言。
- 另外 13 处的守卫都含 `_t`、`_t2` 或由 `t` 构造的 `translate`。这些依赖随语言切换而变，缓存因此会重算，属于碰巧正确。

不在守卫里的 14 处每次渲染都重算，包括历史委托页、交易历史页、桌面成交与委托历史的行，以及仓位分享卡的时间。

结论（由编译产物推断，没有在运行中逐处切换语言核对）：修复前没有一处会在语言切换后停在旧语言，与任务描述的「碰巧正确」一致。用户可见行为不变，按 `docs/documentation-system.md`「从设计到交付」第 4 条，纯维护变更不写 `CHANGELOG.md` 产品条目。

修复后，有守卫的 29 处每一层都依赖 `locale`。导出列不再被提升，它们在依赖 `locale` 的守卫里创建。

### 变异核对

临时改动两处原本合规、不在本次改动范围内的代码，跑全仓检查，随后用 `git checkout` 还原，核对工作区里只剩本次改动：

- 去掉页脚时钟 `formatTime(minute, { locale })` 的 `locale`：报 `components/trade/footer/footer-bar.tsx:79 FooterBar formatTime`；
- 去掉 `lib/chart/funding-history-chart-labels.ts` 里坐标轴标签的 `locale`：经跨模块闭包报出调用方 `components/trade/chart/funding-history-chart.tsx:49 FundingHistoryChart formatFundingChartAxisLabels`。

修订版契约另做了 8 个变异，每次把契约复制成临时测试文件、改掉一处逻辑后运行，跑完删除。每个变异都只让对应的样例失败：

| 变异 | 失败的样例 |
|---|---|
| 包装里小写函数名不再取变量名 | 「a memoized component whose function has a lowercase name」 |
| 向上找所有者时不穿过括号 | 「a parenthesized anonymous default export」 |
| 路由选项不认字符串键 | 「a route component under a string key」 |
| 不处理模块级别名 | 「allows a module-level alias called with a locale」 |
| 模块顶层的任何引用都算违规（而不只是调用） | 别名相关的 3 个样例 |
| 调用处不穿过括号与类型断言 | 「allows a namespace call, a parenthesized callee and asserted options with a locale」 |
| 不认计算属性名 `["locale"]` | 同上 |
| 不处理从命名空间解构出的名字 | 「a helper that destructures a formatter from a namespace import」 |

### 修改

19 个文件。其中 18 个在 `useLingui()` 之后、任何提前返回之前，加上 `const { i18n, t } = useLingui(); const locale = i18n.locale;`；`FundingHistoryPage` 原来就有这两行，只改了导出列。然后在报出的调用里传 `{ locale }`：

- 已有选项的写成 `{ locale, dateStyle: "short", timeStyle: "short" }`；
- 仓位分享卡在多行选项里加 `locale`。

没有改任何依赖数组：用 AST 脚本核对过，19 个文件里这些调用都不在 `useMemo`、`useCallback` 或 effect 的回调里；Biome 的依赖检查也没有报。

文档：`docs/i18n-presentation.md` 的日期与列表规则、`docs/number-format-setting.md` 规则 2 与回归入口（删去「未完成」里的日期条目）、AGENTS.md 的规则与回归清单、`.claude/rules/code-style.md`；ADR 0036 在原「尚无契约」一句后追加了一句后续说明，原文保留。

包体预算：`scripts/check-client-bundle-budget.mjs` 的客户端总量基线上调 +475，理由与量法写在注释里，见下文「生产构建与包体预算」。

CI：`.github/workflows/terminal-tests.yml` 的「Test recent trade rendering contracts」步骤里，数字契约后面加上新契约。本分支里数字契约在这一步；集成分支的 `41c585cb` 另建了「Test number format and runtime locale contracts」步骤，合并后可以把新契约移过去。

## 验证与限制

版本：基线 `04469b52` 加本次改动，2026-10-02。测试用默认的 Node 24.15.0，生产构建用 Node 22.15.0（与 CI 相同）。

**契约**

- 修复前：初版与修订版都只有全仓检查失败，都报同样的 38 处（见上）。
- 修复后，初版：全仓检查通过；与 `i18n-reactivity-contract`、`number-format-reactivity-contract` 一起运行，3 个文件 227 项通过。
- 修复后，修订版：40 项全部通过。
- 全仓检查用时约 0.9–1.2 秒，设了 30 秒超时。
- 变异核对见上。

**静态检查**

- `pnpm --filter @sairn/terminal typecheck` 退出码 0，运行两次：源码改完后一次，契约修订后一次（终端 tsconfig 包含测试文件）。
- `pnpm exec biome check`：改动与新增的 20 个 TS/TSX 文件无问题，输出「Checked 20 files in 58ms. No fixes applied.」（契约修订后的那次）。Biome 不检查 `scripts/`。
- `node --test scripts/ci-workflows.test.mjs`：加入 CI 步骤后 7 项通过。
- `pnpm i18n:extract` 没有改动任何目录。缺失译文数（ar/es/fr/hi 各 43、zh 3）是既有状态。

**回归组**

- AGENTS.md「Runtime translation contract」与「Number and date formatting」两组（后者已加入新契约）：
  - 初版契约，21:01，负载约 23：12 个文件 471 项通过；
  - 修订版契约，21:31，负载约 12：12 个文件 484 项通过。
- 触及面，36 个文件 456 项通过（初版契约时运行；修订只改了契约文件本身）：
  - 导入本次改动模块的 17 个测试文件；
  - `number-format-setting.md` 回归入口里另外 12 个文件；
  - 「Mobile data presentation」组 4 个文件；
  - `referral-history-locale`、`staking-view`、`desktop-orders-cancel-all`。

**全量**

- `pnpm --filter @sairn/terminal test` 在全部代码改动完成后运行，20:49–21:00，共 649.8 秒，负载从 12 升到 68：
  - 649 个文件中 641 通过、7 失败、1 跳过；
  - 8,105 项中 8,092 通过、12 失败、1 跳过。
- 12 项里 10 项是超时（5 秒或 15 秒）。另 2 项是 `waitFor` 断言：`global-modals-hip3-disclaimer` 一项（同文件另 3 项超时），`global-modals-market-close-legal` 一项。
- 7 个文件用 2 个 worker 单独重跑，21:00–21:01，负载约 30：114 项全部通过。
- 按导入关系查，7 个文件里只有 `mobile-history-cards.test.tsx` 导入了本次改动的组件（`MobileHistoryTab`）。它在全量里的失败也是 5 秒超时。
- 全量运行用的是初版契约。修订只改了契约文件本身，之后没有再跑全量。

**生产构建与包体预算**

两路构建并行，21:03–21:18，负载 17–30：本工作树的改动后代码，以及独立 worktree 里的 `04469b52`。共同条件：

- Node 22.15.0（与 CI 相同的 zlib）；
- `NODE_ENV=production`、`NITRO_PRESET=node-server`、`VITE_MOBILE_PAIRING_ENABLED=false`；
- 相同的 `SAIRN_BUILD_SHA`（40 个 0）与 `SAIRN_RELEASE_ID`；
- 两个工作树都没有 `.env.local`。

结果：

- 基线构建通过预算。
- 改动后的构建在预算检查失败：客户端总量比基线多 10,023 字节，允许 10,000。
- 按 `scripts/check-client-bundle-budget.mjs` 的惯例，把总量基线上调 +475（实测差值），注释写明原因与量法。之后对同一份产物重跑预算检查通过，再补跑构建脚本剩下的两步（`inject-shell-preloads`、`collect-inline-script-hashes`）与 `perf:startup`，均成功。
- `node --test scripts/check-client-bundle-budget.test.mjs` 16 项通过。

| 项（gzip 字节） | `04469b52` | 本次 | 变化 | 距上限 |
|---|---|---|---|---|
| 客户端总量 | 3,195,469 | 3,195,944 | +475 | 452（上调基线后；上调前超 23） |
| 交易页启动闭包 | 1,563,515 | 1,563,742 | +227 | 27,474 |
| 手机运行时启动 | 117,585 | 117,592 | +7 | 2,988 |
| 桌面运行时启动 | 201,837 | 201,904 | +67 | **84** |
| `trade-terminal-page` | 125,798 | 125,804 | +6 | 1,438 |
| `tradeHistory._address` | 8,232 | 8,260 | +28 | 1,613 |
| `historicalOrders._address` | 8,020 | 8,048 | +28 | 1,615 |

按块逐个比较（用 Node 的 `gzipSync`，按去掉哈希的文件名配对），总差同为 +475：

- 增加最多的是 Rollup 命名为 `use-account-abstraction-control` 的共享块（+214）。手机账户各页签打包在这个块里：成交、资金费、委托历史、TWAP、出入金、委托卡。
- 其次是 `twap-tab` +61、`portfolio` +46、两个历史页各 +28。
- 桌面 `funding-tab` +25、`account-transfers-tab` +24、`history-tab` +22、`orders-history-tab` +13。
- 减少的有 `vendor-tanstack-router` −35 与 `earn` −25。
- 共 209 个块大小有变化，其余 198 个都在 ±10 以内，多是被引用块的哈希变化带来的抖动。

增加来自缓存守卫多出的 `locale` 依赖，以及不再被提升的导出列闭包。两处减少没有逐一解释原因，属于压缩结果的波动范围。

这些数与上一条记录的数（总量 3,195,280，桌面运行时 201,832）不能直接比较：构建时的 SHA 与发布标识不同，它们会写进包里。

**独立审查**

提交前，由只读的代码审查子代理审查本次改动（基线 `04469b52`）。它不运行测试与构建，只读文件，并用只解析源码的小脚本核对。以下结论来自它的报告，标「已核实」的经本会话复核：

- 没有 P0/P1。它核对过三项：
  - 38 处修改的作用域与位置；
  - 没有运行时变化：只会激活目录里的语言，传入 `i18n.locale` 与原来读全局语言的结果相同；
  - 其余调用点都已传 `locale`。
- P2：契约复制的是数字契约在 `04469b52` 的旧版本，集成分支 `089747f5` 已修补那里的漏洞。它用合成样例确认了几处漏报与误报：
  - 漏报：包装里小写函数名的 `memo` 组件、加括号的匿名默认导出、字符串键的路由选项、从命名空间解构出的名字；
  - 误报：模块级别名。

  已核实。已移植修补，补了别名处理，并为每一处加了样例与变异核对（见上）。
- P3，已处理：
  - 文档说「模块顶层的调用」，代码却拦截任何引用。改为只拦截调用。
  - 导出列样例的写法与真实代码不同。改为 Hook 选项里的 `buildRows`。
  - 补了默认导入、匿名默认导出与带 `locale` 的命名空间调用的样例。
  - `lib/format.ts` 本身不在检查范围内。加了自检，确认读界面语言的导出正好是这四个。
  - 文档把 effect 与事件回调也写成必须用渲染期的 `locale`，比契约与上一条规则严。改为两种都可以；执行时读 `i18n.locale` 更适合活得比渲染久的回调。
  - 记录里有三处不准：「每个组件都加了 `useLingui`」（`FundingHistoryPage` 原来就有）、集成分支的状态、Biome 结果没有引用输出。已更正。
  - CI 不跑新契约。已加入。
- P3，只记为限制：上文「已知限制」里的漏报与偏严的误报。

**未覆盖**

- 没有在浏览器里切换语言核对。按编译产物，修复前后可见行为相同，见上。
- 未运行 Playwright 浏览器套件。
- 没有物理输入。

## 后续与替代关系

- 契约只检查写了 `locale`。可选的 `locale` 参数（`processTrades(trades, locale?)`）若改为必填，类型检查就能兜住调用方漏传；本次没有改，它的唯一调用方已经传入。
- 范围外发现：`apps/terminal/src/lib/chart/format.ts`（`formatShortDate`、`formatTime`、`formatTooltipDate`）在 `apps`、`packages`、`scripts` 里都没有被导入，像是死代码。它自己的 `formatTime` 与 `lib/format.ts` 的同名函数容易混淆。本次没有动，已开后续任务卡片。
- 构建预算余量很小：桌面运行时启动只剩 84 字节，客户端总量 452 字节（本次已上调一次总量基线）。下一个碰到持仓页签或这些页面的改动，很可能要按惯例重定基线。
- 日期契约与数字契约各有一份相同的模块图代码。集成分支合并后，可以抽成共享的测试 helper，避免两份再次分叉。眼下抽取会与 `089747f5` 冲突，所以没有做。
- 合并进集成分支时：
  - 把新契约移到 `41c585cb` 新建的 CI 步骤里；
  - 若 `089747f5` 之后数字契约又有修补，同步到日期契约。
- 本记录完成[上一条记录](2026-10-02-number-format-reactive-formatters.md)「后续」里的「日期格式化目前只有约定、没有契约」一项；那条记录本身未改动。
- 没有被整体替代的记录。
