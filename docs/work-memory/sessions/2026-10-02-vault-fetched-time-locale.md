<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-vault-fetched-time-locale",
  "date": "2026-10-02",
  "title": "Vault 获取时间与组合收益图跟随语言和数字格式切换",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "Vault 列表的获取时间在语言切换后一直保持旧语言格式：fetchedLabel 只在三元分支里读 i18n.locale，babel-plugin-react-compiler 1.0.0 把缓存槽依赖记成不变的 i18n 单例；先读出 const locale 后依赖变为 locale。按编译产物排查全部 i18n.locale 读取，另确认组合收益图手写 useMemo 依赖里的 i18n.locale 与 numberFormatRevision 被编译器丢弃（语言与数字格式切换后坐标轴和选中点不变），改为作为参数传入并保留 useMemo（去掉后缓存槽 118→43）。四处被掩盖或所在组件未被编译的分支读取一并改写；i18n-reactivity-contract 新增两条契约（分支或渲染期回调里的 i18n.locale、useMemo/useCallback 中回调不读的依赖），在修复前代码上分别报出 6 处与 2 项。全量单测除负载超时外通过；无头 Chromium 在本工作树开发服务器的 /vaults 上复现旧代码缺陷并确认修复。范围外发现：只裸调用 useNumberFormatRevision() 的组件切换数字格式后不刷新（探针实测，编译产物统计 200 处），已登记为后续。",
  "thread": null,
  "baseCommit": "2b7973b4",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/vaults/vaults-list.tsx" },
    { "path": "apps/terminal/src/lib/tests/vaults-view.test.tsx" },
    { "path": "apps/terminal/src/components/portfolio/portfolio-performance-chart.tsx" },
    { "path": "apps/terminal/src/lib/tests/portfolio-performance-chart.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/i18n-reactivity-contract.test.ts" },
    { "path": "apps/terminal/src/components/vaults/vault-detail-view.tsx" },
    { "path": "apps/terminal/src/components/trade/chart/funding-history-chart.tsx" },
    { "path": "apps/terminal/src/routes/mobile-agent-sync.tsx" },
    { "path": "apps/terminal/src/components/portfolio/portfolio-page.tsx" },
    { "path": "docs/i18n-presentation.md" },
    { "path": "docs/number-format-setting.md" },
    { "path": "CHANGELOG.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-footer-clock-live-minute.md" }
  ],
  "supersedes": []
}
-->
# Vault 获取时间与组合收益图跟随语言和数字格式切换

## 背景与范围

同步记录。Claude Code 桌面应用会话，工作树 `relaxed-roentgen-fd0316`；未取得可核对的任务标识。

用户给出的任务：`vaults-list.tsx` 的 `fetchedLabel` 只在三元分支里读 `i18n.locale`，编译后的依赖是 `i18n` 单例，语言切换后 Vault 列表的获取时间保持旧格式，直到 `fetchedAt` 变化。要求先写在旧代码上失败的测试，再按[页脚时钟记录](2026-10-02-footer-clock-live-minute.md)的做法修复；在 `apps/terminal/src` 搜索同类读取并核对编译后的依赖，修复确认的情况；可选地提出契约测试；跑检查、写记录并提交，不推送。

这一任务处理的是页脚时钟记录「后续」里的两项：Vault 列表的同类依赖放宽，以及尚未加的契约测试。

**基线。** 工作树创建在 `main` 的 `3ced842e`，它与 `origin/dev`（`682430ba`）的代码树相同，分支没有自有提交，先对齐到 `682430ba`。任务描述引用的页脚时钟记录和 `docs/i18n-presentation.md` 新条目当时只在工作树 `laughing-engelbart-b9dbe6` 里；那个会话（仍在运行）随后提交了 `b99a1190`、`2b7973b4`，也基于 `682430ba`。为了让引用成立，并避免两条分支在同一条规范、CHANGELOG 与索引上冲突，本分支在没有任何改动时重置到 `2b7973b4`，在其上工作。**如果 `claude/laughing-engelbart-b9dbe6` 之后被改写，本分支需要重新叠放；按提交合并时它会带上那两个提交。**

## 结论与依据

### 排查方法

草稿目录里写了两个脚本，未入库：

- 编译脚本：用 `@vitejs/plugin-react` 依赖的 `@babel/core`，按 `vitest.config.ts` 的顺序挂 `@lingui/babel-plugin-lingui-macro` 与 `babel-plugin-react-compiler` 1.0.0，工作目录设为 `apps/terminal`（宏插件从工作目录找 Lingui 配置）。
- 分析脚本：重新解析编译产物，对每处 `i18n.locale` 读取（或指定函数的调用）向上找最内层的 `if ($[n] !== …)` 缓存守卫，列出依赖；守卫外的读取每次渲染都会执行。

### Vault 列表（确认）

- 修复前：`if ($[32] !== fetchedAt || $[33] !== i18n)`，与任务描述一致。
- 修复：先写 `const locale = i18n.locale;`，再传 `{ locale, hour: "2-digit", minute: "2-digit" }`。编译后为 `$[32] !== fetchedAt || $[33] !== locale`，外层作用域的依赖也从 `i18n` 变成 `i18n.locale`。
- 测试 `vaults-view.test.tsx`「reformats the fetched time in the active language without remounting it」：`fetchedAt` 用本地时间 `new Date(2026, 9, 2, 14, 31)` 构造，与时区无关；英文 `Fetched 02:31 PM` → 中文 → 英文，断言标签节点不变。中文译文取生产目录的 `获取时间：{fetchedLabel}`，并断言 `zh/messages.po` 里确有这一条。修复前失败在 `'获取时间：02:31 PM'` 应为 `'获取时间：14:31'`：译文已切换，时间仍是英文格式。

### 全部 `i18n.locale` 读取的编译结果

| 位置 | 编译后 | 结论 |
|---|---|---|
| `vaults-list.tsx` 获取时间（三元分支） | `[fetchedAt, i18n]` | 确认，已修 |
| `vault-detail-view.tsx` 解锁时间（JSX 三元分支） | `[_t, i18n, owner.*]` | 被同一缓存槽里的 `_t` 掩盖；改为 `locale` |
| `funding-history-chart.tsx` 两处三元分支 | `[…, i18n.locale, …]` | 同组件第 48 行有无条件读取兜底；改为 `locale` |
| `mobile-agent-sync.tsx` `MobileAgentSyncRoute`（JSX 三元分支） | 组件未被编译 | 目前每次渲染重算；改为 `locale` |
| `portfolio-page.tsx`（条件 JSX 里的 `map` 回调） | 组件未被编译 | 同上；改为 `locale` |
| `portfolio-performance-chart.tsx` 手写 `useMemo` 依赖数组 | 编译后完全没有这次读取 | 确认，见下节 |
| `base-ui-direction`、`language-switcher`、`chart-panel`、`use-api-wallet-controller`、`SuccessPanel`、`market-asset-info` 的 `queryKey` | 无条件读取 | 无需改 |
| `__root.tsx` 的 `useState` 初始化与 effect、`cctp-deposit-tracking-notifier` 的 effect、`market-asset-info` 的 `queryFn` | 不属于缓存的渲染结果（初始化函数只在首次渲染执行，effect 与 `queryFn` 在渲染后执行） | 读到的是执行时的语言，无需改 |
| `trades-panel.tsx` 手写 `useMemo` | 组件未被编译，依赖数组原样保留 | 无需改 |

`use-document-title.ts` 的 effect 在回调里写了 `void numberFormatRevision;`，依赖可见，也无需改。

### 组合收益图：手写依赖数组被丢弃（确认）

`PortfolioPerformanceChart` 的 `useMemo(() => buildChart(history, period, chartSize), [chartSize, history, i18n.locale, numberFormatRevision, period])` 带着 `biome-ignore` 注释，意图是让语言和数字格式变化时重算。编译后的缓存槽只有 `[chartSize, history, period]`：编译器按回调实际读取的值推断依赖，回调不读的 `i18n.locale` 与 `numberFormatRevision` 被丢掉。全仓库扫描「`useMemo`/`useCallback` 依赖数组里有、回调里不读」的项，只有这两项。

两个新测试在旧代码上失败：

- 键盘选中一个点后切到中文，提示框仍是 `August 9, 2026 · -$7.00`；
- 切到 `de-DE` 并通知后，Y 轴刻度仍是 `$0.25`。

修复：读出 `locale`，`buildChart(history, period, chartSize, locale, numberFormatRevision)` 与 `formatPointLabel(activePoint, locale, numberFormatRevision)`。日期用显式的 `locale`；数字格式没有显式参数，修订号按资金费率图的做法作为 `_numberFormatRevision` 传入。依赖数组改成回调真正读取的值，删掉 `biome-ignore`。编译后两个缓存槽分别是 `[chartSize, history, locale, numberFormatRevision, period]` 与 `[activePoint, locale, numberFormatRevision]`。

**保留手写 `useMemo`。** 中途曾把它换成普通调用，编译产物里 `buildChart` 不再处于任何缓存槽，组件的缓存槽从 118 个降到 43 个，指针每次移动都会重建图表模型。测试不覆盖这一点，所以恢复了 `useMemo`，并把这一观察写进 `docs/i18n-presentation.md`。原因没有用编译器日志核实，只记录现象。

### 编译器行为样例

用最小组件编译对照（`babel-plugin-react-compiler` 1.0.0）：

| 写法 | 依赖 |
|---|---|
| 只在 `?:` 分支、`&&` 右侧、JSX 三元分支里读 | `i18n` |
| 只在渲染期的 `map` 回调里读 | `i18n` |
| 先 `const locale = i18n.locale` | `locale` |
| `useMemo` 回调里读（含回调内的三元） | `i18n.locale` |
| 提前返回之后读；`if` 语句内部的缓存范围 | `i18n.locale` |
| 分支读取在提前返回之前，无条件读取在提前返回之后 | 分支那个缓存槽仍是 `i18n` |
| 依赖数组里写 `i18n.locale`、回调不读 | 依赖里没有它 |

倒数第二行说明「组件里另有一次无条件读取就安全」不可靠，所以契约改为一律拒绝分支内读取。

### 契约测试

`i18n-reactivity-contract.test.ts` 新增 `dependencies React Compiler can see`，用 TypeScript AST 扫描 `apps/terminal/src`（测试、`locales`、`.gen.ts` 除外），与该文件现有的源码级契约同一写法：

1. 组件或 Hook（函数名大写开头，或 `use` 后接大写或数字；`memo`/`forwardRef` 包装和括号、`as`、`satisfies` 按变量名识别）里，写成 `i18n.locale` 的读取不能出现在下列位置：
   - `?:` 的分支、`&&`/`||`/`??` 的右侧、可选链调用或下标的参数；
   - `if`、`switch`、`catch`、循环体里（`for…of`/`for…in` 的可迭代表达式与 `for` 的初始化部分除外）；
   - 嵌套函数里。`useMemo` 回调按渲染期代码继续检查；effect 回调、`useState`/`useReducer` 的初始化函数、JSX 的 `on*` 与 `ref` 属性、传给其他 Hook 的选项对象里的函数（如 `queryFn`）在执行时读取当时的语言，停止检查。
   - 其余嵌套函数一律报，包括具名辅助函数、`useCallback` 回调和组件内具名声明的事件处理函数：检查器分不清它们是在渲染时调用还是之后调用，改用局部 `locale` 总是安全的。
2. `useMemo`/`useCallback` 依赖数组里的项必须在回调里读到（路径相等或互为前缀）。收集读取时跳过对象键、属性访问的属性名、变量与参数的绑定名和 JSX 属性名；凡是出现 `useMemo` 或 `useCallback` 的文件都检查，泛型写法 `useMemo<T>(` 也包括在内。这一条不限于语言。

两条都附了正反样例，共 172 项。规则比编译器实际行为更严：`if` 内部缓存范围这种安全情形也会被拒绝，因为安全与否取决于编译器把缓存范围放在哪里。

变异核对：把六个源文件换回 `2b7973b4` 的版本，第一条报出 `portfolio-page.tsx:223`、`funding-history-chart.tsx:50`、`:55`、`vault-detail-view.tsx:188`、`vaults-list.tsx:57`、`mobile-agent-sync.tsx:161`；第二条报出 `portfolio-performance-chart.tsx:124` 的 `i18n.locale` 与 `numberFormatRevision`。还原后用 sha256 核对一致。按下节审查收紧规则后重做一遍，报出的仍是这 6 处与 2 项。

已知限制：
- 只认写成 `i18n.locale` 的读取，重命名的 `i18n` 不覆盖。
- 组件按名字识别。
- 以具名函数传给 effect 的回调（`useEffect(sync, …)`）会被误报。如果那里需要读执行时的语言，不能简单改成局部 `locale`，`__root.tsx` 的启动门控就是这种情况（它目前写的是内联回调，不受影响）。

**未采用：**

- 在测试里真跑编译器、直接检查缓存守卫：最准确，但 `@babel/core` 不是终端的直接依赖，需要改依赖；每次运行还要编译文件。
- 去掉组合收益图的手写 `useMemo`：见上节。
- 把契约做成「组件里只有分支读取时才报」：被提前返回的样例否定。

### 独立审查

由只读的代码审查子代理审查提交前的改动（基线 `2b7973b4`）。它另写了编译脚本核对新旧代码的缓存守卫，用样例组件跑了两个检查器；以下结论来自它的报告。本会话重新编译了发现 1 的四种写法和 `for…of` 样例，依赖与报告一致；也确认了那 3 个文件只用 `useMemo<T>(`，旧正则匹配数为 0。其余结论未复核：

- 源码改动没有正确性问题：
  - 五个含 `<Trans>` 的文件消息 ID 不变，调用表达式仍是位置占位符；
  - `portfolio-page.tsx` 经 Biome 格式化后子节点仍是 `[span, " ", group.reason]`；
  - 两处修复与编译后的依赖一致；新测试在旧代码上失败，在 UTC+14 与 UTC−11 也通过；
  - `PortfolioPage` 与 `MobileAgentSyncRoute` 确实没有被编译，原因分别是依赖不匹配和不支持的 `try/finally`。
- 发现 1（重要）：第一条契约只跟踪内联的数组方法回调。下列写法的编译依赖都是 `i18n`，检查器却不报：
  - `groups.map(renderGroup)` 配组件内的具名函数；
  - 在 JSX 里调用的小写辅助函数；
  - `Array.from(groups, cb)`；
  - `formatter?.format(at, { locale: i18n.locale })`。

  当时的文档写「拒绝每一处」，言过其实。处理：嵌套函数改为默认报，只放行上面列出的四类；加入可选链参数；补 4 个反例样例；改写文档措辞。
- 发现 2（重要）：第二条契约的预筛选正则 `/\buse(?:Memo|Callback)\(/` 匹配不到 `useMemo<T>(`，3 个文件（`use-staking-actions.ts`、`use-prospective-cross-margin-account.ts`、`use-default-account-snapshot.ts`）从未被检查；收集读取时把对象键和属性名当成读取，`{ locale: options.locale }` 会掩盖未读的 `locale`。处理：预筛选改为字符串包含，收集时跳过这些名字，补对应样例。这 3 个文件没有违规。
- 次要：`for (const g of sortGroups(groups, i18n.locale))` 被误报，它编译后的依赖是 `i18n.locale`。处理：可迭代表达式不再算分支，补正例样例。
- 次要：文档说「需要时保留手写 `useMemo`」，与 agent.md「手写 memo 需要语义理由」有张力。处理：改写为针对该组件的事实陈述。

### 范围外发现：数字格式订阅

多数组件只写了裸调用 `useNumberFormatRevision();`，修订号不进入任何缓存槽的依赖。用临时探针测试（跑完即删，未入库）渲染 `ReferralSummaryCards`，mock `getResolvedFormatLocale` 为 `de-DE` 并调用 `notifyNumberFormatChange()`：组件重渲染了，文本仍是 `1,234`，同一时刻直接调用 `formatNumber(1234)` 返回 `1.234`。

按编译产物统计含裸调用的文件：70 个被编译的组件里，200 处数字格式化调用落在不含修订号的缓存槽里，112 处每次渲染重算或以修订号为依赖。依赖里有实时行情的调用会在下次行情变化时刷新，余额、历史、摘要类会一直保持旧格式。只看缓存守卫，没有逐处在界面上核实。已知正确的做法：`TradeRowComponent` 用 `"use no memo"`，`LeveragePositionLimitRow` 与两张图表把修订号传进计算。`docs/number-format-setting.md` 的「未完成」已登记。

日期格式化（`formatDateTime`、`formatDateTimeShort`、`formatTime`、`formatList` 不传 `locale`，在函数内部读全局语言）同样统计：12 处落在不含 `_t`、`locale`、`i18n.locale` 的缓存槽里，分布在：

- `funding-history-page`
- `staking-action-modal`
- `staking-view`
- `earn-view`（依赖里的 `translate` 可能随语言变化，未核实）
- `referred-traders`
- `funds-action-recovery-host`
- `bridge/success-screen`
- `orders-tab`

这是规范第 2 条（格式化函数要显式接收语言）的遗留，也没有逐处核实。

## 验证与限制

版本：基线 `2b7973b4` 加本次改动，2026-10-02。

**单元测试**

- 修复前：`vaults-view.test.tsx` 新用例失败（见上），其余 15 项通过；`portfolio-performance-chart.test.tsx` 两个新用例失败，其余 21 项通过。
- 修复后：两文件加 `tests/portfolio-performance-chart-apg.test.tsx` 共 44 项通过。
- `i18n-reactivity-contract.test.ts`：审查前 162 项通过，按审查收紧后 172 项通过；修复前代码上两条新契约失败，见上节。审查只改了这个测试文件和文档，没有改源码；收紧后改动的 4 个测试文件在 Node 24.15.0 与 22.15.0 下各 216 项通过。下面的 Node、时区和全量结果是审查前的运行。
- Node 22.15.0（ICU 76.1，CI 版本）下，上述三个文件加契约文件共 206 项通过；默认 Node 24.15.0 下同样通过。
- `TZ` 为 `Asia/Kathmandu`、`America/St_Johns`、`Pacific/Chatham`、`UTC` 时，Vault 与组合收益图两个测试文件各 39 项通过。
- 变异 MP2：把 `formatPointLabel` 的修订号参数换成常量 `0`，测试仍通过。原因是数字格式变化时 `buildChart` 重算，产生新的点对象，`activePoint` 随之变化，选中点标签也就重算了。这两个参数在当前结构下是冗余的保险，测试验证的是行为，不是这两个参数；保留它们，是为了不依赖点对象的身份。

**静态检查与回归组**

- `pnpm exec biome check`（9 个改动的 TS/TSX 文件）通过；`pnpm --filter @sairn/terminal typecheck` 通过，审查收紧后重跑仍通过（终端 `tsconfig` 包含测试文件）。
- AGENTS.md「Runtime translation contract」组：5 个文件 271 项通过，审查收紧后重跑 281 项通过。
- 触及面 21 个文件：vaults、portfolio、资金费率、配对路由、dashboard 与 RTL 契约、`number-format-reactivity-contract` 等。
  - 第一次运行 3 个文件 15 项失败，输出未保存，不知道是哪些文件；当时机器负载约 30，另有 5 个 vitest 进程在跑。
  - 第二次运行只有 `mobile-agent-sync-route.test.tsx` 的第一个用例失败：`beforeEach` 动态导入路由模块超过 10 秒。
  - 单独重跑该文件：失败、失败、通过（7.4 秒）。把 `mobile-agent-sync.tsx` 换回 `2b7973b4` 的版本对照：通过（7.9 秒）、失败（10.3 秒）。超时与本次改动无关。
- 全量 `pnpm --filter @sairn/terminal test`（改动完成后、提交前，16:56 起运行 616 秒，负载 30–53）：
  - 645 个文件中 638 个通过、1 个跳过、6 个有失败；8,026 项中 8,016 项通过、1 项跳过、9 项失败。
  - 9 项里 7 项是测试或钩子超时；另 2 项是断言失败：`global-modals-hip3-disclaimer` 的一项（同文件另 3 项超时）、`mobile-agent-sync-modal` 的计时用例。
  - 6 个文件逐个单独重跑全部通过（`global-modals-hip3-disclaimer` 29、`agent-storage-removal` 16、`chart-store` 11、`chart-build-assets` 17、`mobile-agent-sync-modal` 13、`dashboard-chrome` 16）。它们都不渲染本次改动的组件。
  - 本次新增和改动的测试文件在全量运行中都通过。
  - 下文浏览器核对用的 `.env.local` 在 17:01 复制，晚于全量测试启动，全量运行没有读到它；第一次单独重跑时它还在。核对后删除该文件，再跑一遍：6 个文件仍全部通过，本次改动的 4 个测试文件 206 项通过。

**浏览器核对**

- 本工作树的开发服务器：`preview_start` 的 `terminal-inspect`，`vite dev --port 3015`，用 `lsof` 核对过进程工作目录。`apps/terminal/.env.local` 从主检出复制，该文件被 Git 忽略，核对后已删除，未提交。
- 无头 Chromium（Playwright 脚本读取 DOM，不是人工查看），视口 1440×900，打开 `/vaults`，真实 Hyperliquid 数据，`data-vaults-state="normal"`。
  - 用页头「Language and number format」菜单切换语言。这是 Playwright 注入的点击，不是物理输入。
  - 最终代码：`Fetched 05:07 PM` → `获取时间：17:07` → `Fetched 05:07 PM`。标签始终是同一个已连接的节点，`html lang` 依次为 `en`、`zh`、`en`。
  - 临时换回 `2b7973b4` 的 `vaults-list.tsx`：切到中文后显示 `获取时间：05:08 PM`，真实应用里复现了缺陷。随后还原，sha256 一致，再跑一次得到 `获取时间：17:08`。
- 控制台只有 Privy 的 `frame-ancestors` CSP 和一个 403；Privy 只放行 3005 端口与正式域名，与本改动无关。

**未覆盖**

- 未运行 `pnpm build` 与 Playwright 浏览器套件。
- 组合收益图、Vault 详情、资金费率图、配对页、组合页没有在浏览器里核对，只有单元测试与编译产物。
- 没有在真实浏览器里切换数字格式。
- 没有物理输入。

## 后续与替代关系

- 数字格式订阅失效（200 处候选）需要先定修复方式，再逐面改并加会失败的测试；`number-format-reactivity-contract` 目前只检查订阅存在。可选方向（未评估）：
  - 修订号作为参数传入；
  - 由 Hook 返回随修订号变化的格式化函数；
  - 在热点组件上 `"use no memo"`。
- 上节列出的 8 个文件里，日期格式化不传 `locale` 的 12 处候选需要逐处核实。
- 页脚时钟记录「后续」里的 Vault 列表与契约测试两项由本记录处理；那条记录本身未改动。
- 没有被替代的记录。
