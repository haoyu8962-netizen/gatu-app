<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-integrate-locale-number-format",
  "date": "2026-10-02",
  "title": "集成 PR：页脚时钟、Vault 语言依赖与数字格式刷新三条分支合并进 dev，Codex 多轮对抗审查",
  "kind": "task",
  "status": "recorded",
  "topics": ["i18n-runtime", "pr-review"],
  "summary": "进行中：把 claude/laughing-engelbart-b9dbe6（页脚时钟）、claude/relaxed-roentgen-fd0316（Vault 与组合收益图语言依赖）、claude/wonderful-goldberg-e47b19（数字格式刷新，ADR 0036）三条叠放的未推送分支以 --no-ff 合进从 origin/dev 建的 claude/integrate-locale-number-format，新增 CI 步骤，并按用户要求用 Codex 做至少 3 轮只读对抗审查、评分大于 9。",
  "thread": null,
  "baseCommit": "682430ba",
  "commits": ["b99a1190", "2b7973b4", "5425b7c1", "04469b52", "41c585cb", "089747f5", "18cc35b1"],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-10-02-footer-clock-live-minute.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-vault-fetched-time-locale.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-number-format-reactive-formatters.md" },
    { "path": "docs/adr/0036-render-time-number-formatters.md" },
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": "apps/terminal/src/lib/tests/number-format-reactivity-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/i18n-reactivity-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/harness/react-source.ts" }
  ],
  "supersedes": []
}
-->
# 集成 PR：页脚时钟、Vault 语言依赖与数字格式刷新三条分支合并进 dev，Codex 多轮对抗审查

## 背景与范围

同步记录。Claude Code 桌面应用会话，工作树 `wonderful-goldberg-e47b19`；未取得可核对的任务标识。

用户要求：

- 把三条分支合成一个集成 PR 开到 `dev`；
- 调用 Codex 对抗审查这个 PR，至少 3 轮，评分大于 9。

三条分支都未推送，且依次叠放：

| 分支 | 提交 | 内容 | 记录 |
|---|---|---|---|
| `claude/laughing-engelbart-b9dbe6` | `b99a1190`、`2b7973b4` | 页脚时钟按整分钟走时 | [页脚时钟](2026-10-02-footer-clock-live-minute.md) |
| `claude/relaxed-roentgen-fd0316` | `5425b7c1` | Vault 获取时间与组合收益图跟随语言/数字格式，编译器依赖契约 | [Vault](2026-10-02-vault-fetched-time-locale.md) |
| `claude/wonderful-goldberg-e47b19` | `04469b52` | 数字格式刷新（ADR 0036）与 15 处日期 `locale` | [数字格式](2026-10-02-number-format-reactive-formatters.md) |

合并前的核对：

- `origin/dev` 仍为 `682430ba`，三个分支头与叠放关系一致，没有新提交。
- 另两个会话在 `list_sessions` 里为 `isRunning: false`（最后活动 08:24 与 09:37），工作树干净；它们的 `claude` 进程仍在，会话是打开的，只是空闲。

## 结论与依据

### 合并

- `git merge-tree --write-tree --name-only origin/dev <分支>` 对三条分支都没有冲突。
- `git cherry -v origin/dev <分支>` 显示 4 个提交都还未进入 `dev`。
- 从 `origin/dev` 建 `claude/integrate-locale-number-format`，按叠放顺序 `git merge --no-ff`，得到 `564b93de`、`e75a76aa`、`5d3ff8e7`。工作记录引用提交哈希，所以不 squash、不 rebase。
- `git diff 04469b52 5d3ff8e7` 为空：合并结果的代码树与最上层分支完全相同。

### CI

`terminal-tests.yml` 只跑显式列出的测试文件（少数用通配符）。合并时本 PR 改动了 32 个测试文件，其中 21 个不在显式清单里；`tradingview-overlays.test.ts` 由已有的 `tradingview-*.test.ts` 通配符覆盖，所以实际没被 CI 运行的是 20 个，包括 3 个新测试文件、AGENTS.md「Number and date formatting」与「Runtime translation contract」两组的大部分文件。

更正记录：这里最初写作「31 个测试文件中有 20 个不在清单里」，文件数少算了 1 个。第 2 轮 B 路据此改为 32 与 21，但 21 只比较了显式路径；第 3 轮 B 路按通配符复核，实际未覆盖的是 20 个。两次都用 `git diff --name-only 682430ba 5d3ff8e7` 对照 `5d3ff8e7` 的 workflow 复核。

新增步骤「Test number format and runtime locale contracts」（`41c585cb`）。第 1 轮审查后又补了 4 个被本 PR 改动的测试文件，共 30 个；第 2 轮审查后加入 `history-csv-twap.test.tsx`（直接测试本 PR 改动的 `useTwapFillHistoryCsv`），共 31 个；第 3 轮审查后加入新的 `bridge-success-screen-locale.test.tsx`，共 32 个。现在本 PR 改动或新增的 34 个测试文件都会被 CI 运行（按显式路径与通配符核对）。本机用单工作进程跑最初的 26 个文件，554 项通过、47 秒（负载 12–22）。`scripts/ci-workflows.test.mjs` 7 项通过，Ruby 解析 YAML 正常。

### Codex 对抗审查

调用方式：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"medium"' --output-last-message …`，在本工作树只读运行，审查期间不改工作树、不跑 vitest。

本机默认模型 `gpt-6.1-sol` 在 ChatGPT 账号下返回 400「not supported」，三路都在 10 秒内退出，改用 `gpt-6-astra`。

提示词由三部分组成：共享背景（被审范围、作者意图、硬性约束、输出格式与评分规则）、一份写明「需要你去证伪」的作者意图，以及各路的攻击面清单。

**第 1 轮（三路并行，20:36–20:42）**

| 路 | 重点 | 用量 | 评分 |
|---|---|---|---|
| A | 运行时行为 | 26 条命令、约 26 万 token | 9.2 |
| B | 规范、文档与评分表 | 24 条命令、约 10.7 万 token | 8.6 |
| C | 遗漏与测试强度、变异推演 | 23 条命令、约 11.2 万 token | 8.0 |

A 路无 P0–P3 发现。它抽查了 12 个文件的编译产物、98 处 Hook 位置、helper 接线、确认面提交值和时钟生命周期，扣分来自它的环境没有实际运行测试。

B、C 两路的发现，经本会话逐条核实全部成立：

- **B-P2**：数字格式与 Vault 两条记录的摘要把验证概括为「通过」，与正文记载的失败不符；「89 个组件改用 Hook」应为 85 个（另 4 个只改日期）。已改写摘要并在两条记录里加「更正记录」，正文未改。
- **C-P2**：契约检查器漏掉四种写法，C 路在内存里复现了它们：
  - 命名空间解构后经 helper 使用；
  - `memo(function render…)` 这种内部函数名小写的包装；
  - 带括号的匿名默认导出；
  - 字符串键的路由 `component`。

  已补齐，并加入审查给出的样例。
- **C-P2**：Earn 异步成功提示缺少「挂载中切换」测试。新用例走真实提交路径，挂载捕获的提示，先切数字格式、再切语言，断言同一节点更新。在基线 `5425b7c1` 上它停在 `5,029.4` 并失败。
- **B-P3**：「结果未用到」只按名字匹配，同名内层参数会掩盖。C 路另指出 `void fmt` 也会被放过。已改为按绑定判断，并排除 `void` 与单独的表达式语句。
- **C-P3**：模块顶层只保存函数引用（`const fmt = formatUSD`）被误报。已改为只报实际调用；别名仍会传播，引用它的组件照样会被拦下。
- **B-P3**：组合收益图的手写 `useMemo` 与代码风格规则冲突。已在 `.claude/rules/code-style.md` 登记这一条有编译证据的例外。
- **C-P3**：Known 清单漏了跨链各屏金额（`formatTokenBalance`、`formatSendAmount`）和订单簿价格分组标签（`formatTickSize`）。已补进归属文档、ADR 与 CHANGELOG。
- **C 路的覆盖缺口**：
  - `referred-traders` 的日期修复只有编译证据。已补运行时用例，基线上 3 个用例全部失败；
  - 4 个被改动的测试文件不在 CI 里。已加入新步骤。

修复后，扩展的契约有 36 项：26 个应报出样例、6 个应放行样例、4 项真实源码树检查。它在基线 worktree 上仍报 356 处违规、4 项失败。

**第 2 轮（两路并行，21:01–21:06）**

第 1 轮 A 路（运行时行为）给出 9.2 且没有发现，本轮不再单独跑。V 路逐条证伪第 1 轮的修复并继续找遗漏，B 路复评规范与记录。

| 路 | 重点 | 用量 | 评分 |
|---|---|---|---|
| V | 核实第 1 轮修复、继续找遗漏 | 24 条命令、约 13.1 万 token | 8.5 |
| B | 规范、文档与记录复评 | 16 条命令、约 10.5 万 token | 9.3 |

V 路确认第 1 轮的修复成立，三组新测试也没有宽松的替身。它的新发现经本会话逐条核实，全部成立：

- **V-P2：组件身份识别仍有漏洞，两套检查器也不一致。** 数字契约漏掉 `export default memo(function render…)`：小写的内部函数名让判断在识别默认导出之前就返回了。语言契约漏掉 `const Sample = memo(function render…)` 与匿名默认导出。
  - 已把组件与 Hook 识别、透明表达式与作用域解析抽到 `src/lib/tests/harness/react-source.ts`，两套契约共用。
  - 识别规则对照了 `babel-plugin-react-compiler` 1.0.0 的 `getComponentOrHookLike`：名称取函数本身、接收它的变量、赋值目标或对象键；`memo`/`forwardRef` 的回调不论名称都算组件。契约取它的超集，另含匿名默认导出与路由组件选项（含方法写法）。
- **V-P2：透明表达式能绕过「结果未用到」与模块顶层调用的检查。** 反例有 `useNumberFormat() as NumberFormatters`、`void (f)`、`(f);`、`(formatUSD)(0)`、`(formatUSD as typeof formatUSD)(0)`。
  - 已统一穿透括号、`as`、`satisfies`、尖括号断言与非空断言。逗号左侧也算丢弃。
  - 模块顶层把格式化函数交给一次调用（`[0, 1].map(formatUSD)`）也算违规。
  - 命名空间成员支持 `format["formatUSD"]` 与 `(format).formatUSD`。
  - 动态 `import()`、`require()`、整体传递的命名空间对象等没有支持，登记为检查边界（ADR 0036「后果与边界」、数字格式设置规则 9）。
- **V-P2：语言契约按名字收集回调里的读取。** `rows.map((locale) => locale.name)` 会掩盖外层 `locale` 依赖其实没被读取。已改为按绑定判断：根名字在回调内部声明的读取不算。
- **V-P3：已知例外清单还漏了四处。** 金库紧凑值、APR 与 Leader commission；图表仓位线的数量；成交通知的成交数量与部分成交进度；平仓滑块的读屏百分比。逐处读代码确认后，已补进归属文档、ADR 与 CHANGELOG。
- **V-P3：声明作用域按固定的父节点层数推导。** `switch` 分支与 `for` 初始化里的 Hook 结果因此被误报为未用到（这类写法本身会被 Biome 的 `useHookAtTopLevel` 拒绝）。已改为查找声明该名字的最近作用域。
- **V 路的 CI 建议**：加入 `history-csv-twap.test.tsx`，见上文 CI 一节。

B 路没有 P0–P2，两项 P3 都已处理：

- 本记录的测试文件计数少算 1 个，已在 CI 一节更正；
- ADR 0036 的样例数仍是补强前的 24 个，已随本轮改动更新。

修复后的验证：

- 数字契约 54 项：42 个应报出样例、8 个应放行样例、4 项源码树检查。
- 本轮新增 18 个数字契约样例。把它们接到改动前（`089747f5`）的检查器上运行，15 个失败：14 个应报出样例，以及 `switch`/`for` 那个放行样例。另 3 个（嵌套包装、空解构、模块级格式化函数表）旧检查器已能正确处理，作为防止规则放宽的守卫保留。
- 语言契约新增 11 项：6 个组件身份样例、3 个遮蔽依赖样例，以及 2 个守卫（嵌套回调读取外层绑定、既非组件名也无包装的小写 helper）。前 9 个接到改动前的检查器上全部失败。
- 把两份新契约与共用模块复制到基线 `5425b7c1` 的 worktree 上运行：数字契约仍报 356 处违规、4 项失败；语言契约 183 项全部通过（这两条依赖规则正是在 `5425b7c1` 引入的）。运行后已还原该 worktree。
- 当前代码上两份契约都通过：数字契约 54 项、语言契约 183 项，源码树检查都是 0 处违规。识别范围变宽后，真实源码里没有出现新的违规。

**第 3 轮（三路并行，21:27–21:33）**

V 路核实第 2 轮修复并证伪共用模块，B 路终评规范与记录，C 路以新视角找整个 PR 的遗漏并做变异推演。

| 路 | 重点 | 用量 | 评分 |
|---|---|---|---|
| V | 核实第 2 轮修复、证伪共用识别模块 | 21 条命令、约 11.9 万 token | 8.6 |
| B | 规范、文档与记录终评 | 16 条命令、约 10.7 万 token | 8.8 |
| C | 全 PR 遗漏与测试强度、变异推演 | 23 条命令、约 14.5 万 token | 9.1 |

三路都复现了第 2 轮记录的数字：样例数，新样例在旧检查器上的失败数，基线 356 处，源码树 0 处。新发现经本会话逐条核实，全部成立：

- **V-P2：数字契约漏掉模块级解构默认值与类。** `export const { usd: priceLabel = formatUSD } = overrides` 只记录了右侧的 `overrides`；模块级 `class PriceLabel` 的方法用 `formatUSD`，组件 `new PriceLabel(value).text()` 也没被拦下。已让模块级声明记录初始值加上解构路径上的默认值，并收录类声明。
- **V-P2：语言契约把回调里解构默认值、计算键对依赖的读取当成未读。** `const { text = locale } = labels` 与 `const { [locale]: text } = labels` 会被误报。已遍历绑定模式里的默认值与计算键，声明名本身仍不算读取。
- **V-P3：「编译器推断规则的超集」不成立。** 编译器的 `isMemoCallback`、`isForwardRefCallback` 不限参数位置，共用模块原先只认第一个参数。
  - 已改为任一参数位置。
  - 本会话又对照了 `getReactFunctionType` 与 `getFunctionName2`，补上三处：`"use memo"`、`"use forget"` 指令让任何函数进入编译；类属性与解构赋值的默认值也给函数命名。
  - 文档改为写明对照的是 1.0.0 默认 infer 模式。
- **V-P3：已知例外漏了市价单最大滑点。** 下单摘要（桌面与手机）直接显示 `slippagePercent`。本会话排查同类写法时又发现全局设置里的范围说明 `0.1% – 5%` 也是直接显示常量，两处一并补进归属文档、ADR 与 CHANGELOG。
  - 另查了整数类显示：快捷百分比 25/50/…、兑换滑点 1%、杠杆倍数。它们小于 1000 且没有小数，在各选项下写法相同，不列入。
- **B-P2：字符串键的路由方法写法没被识别。** `"component"() { … }` 两份契约都漏报。已统一按静态名取方法与属性名，支持标识符、字符串与字面量计算键。
- **B-P3：CI 历史覆盖数应为 20。** 已在 CI 一节第二次更正，并写明原值与复核方法。
- **C-P3：跨链成功页的两处日期修复没有直接测试。** 已新增 `bridge-success-screen-locale.test.tsx`：挂载真实 `SuccessScreen`，展开详情，再切换语言，断言提交与完成时间换成中文写法且节点不重挂载。把组件里两处 `{ locale }` 删掉后它失败（切换后仍是英文写法），还原后通过。

B 路列为「无法确认」的提交 trailer：每个提交正文都带 `Co-Authored-By`，这是本会话署名指令的要求；`dev` 最近 200 个非合并提交中有 192 个带同样的 trailer。

C 路还指出 CI 里有一个既有的失效路径：`src/lib/tests/geo-server-functions.test.ts` 不存在（`cdc4d3d2` 起就在 `682430ba` 里），与本 PR 无关，另开后续处理。

修复后的验证：

- 数字契约 61 项：49 个应报出样例、8 个应放行样例、4 项源码树检查。
- 语言契约 187 项。
- 本轮新增 11 个样例（数字 7 个、语言 4 个），接到上一版（`18cc35b1`）的检查器与共用模块上运行时全部失败。
- 把两份契约与共用模块复制到基线 `5425b7c1` 的 worktree 上运行：数字契约仍报 356 处违规、4 项失败，语言契约全部通过；运行后已还原。
- 当前代码上两份契约都通过，源码树 0 处违规。识别范围再次变宽（任一参数位置的包装、类属性、指令、类与解构默认值），真实源码里没有出现新的违规。

## 验证与限制

（进行中，后续轮次与最终验证完成后补全。）

## 后续与替代关系

（进行中。）
