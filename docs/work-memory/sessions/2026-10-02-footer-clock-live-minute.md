<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-footer-clock-live-minute",
  "date": "2026-10-02",
  "title": "桌面页脚时钟按整分钟走时",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "桌面页脚时钟一直停在页脚出现的那一分钟：9353743a（2026-01-05）删掉了计时器，渲染期间的 formatTime(new Date()) 被 React Compiler 放进只在首次渲染时计算的缓存槽，语言切换重渲染也不重算。用户对照官方页脚（没有时钟，本地时间在图表底栏）后决定保留。新增按整分钟对齐的 useMinuteClock（useSyncExternalStore，快照按墙钟取整，隐藏时不留计时器，visibilitychange 时校准）；FooterBar 先无条件读出 i18n.locale 再传给 formatTime，因为值来自条件表达式时编译器把依赖放宽成不变的 i18n 对象。5 个新用例在旧代码上失败，另有 1 个快照稳定性用例，8 项变异都被抓到；启动渲染与运行时翻译两组回归、类型检查与全量单测（除一个负载超时）通过，独立审查未发现缺陷并纠正了文档对 if 的过宽表述。无头 Chromium 实测整分钟后 3 ms 走时与语言热切换，隐藏态只在内置浏览器真实 hidden 页面配合脚本模拟的可见切换下核对。",
  "thread": null,
  "baseCommit": "682430ba",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/hooks/ui/use-minute-clock.ts" },
    { "path": "apps/terminal/src/components/trade/footer/footer-bar.tsx" },
    { "path": "apps/terminal/src/components/trade/footer/footer-bar-view.tsx" },
    { "path": "apps/terminal/src/lib/tests/footer-bar.test.tsx" },
    { "path": "apps/terminal/src/config/chart.ts" },
    { "path": "docs/number-format-setting.md" },
    { "path": "docs/i18n-presentation.md" },
    { "path": "CHANGELOG.md" },
    { "url": "https://app.hyperliquid.xyz/trade" }
  ],
  "supersedes": []
}
-->
# 桌面页脚时钟按整分钟走时

## 背景与范围

同步记录。Claude Code 桌面应用会话，工作树 `laughing-engelbart-b9dbe6`；未取得可核对的任务标识。

任务描述给出的现象（由用户提供，本记录没有重新取得那些截图）：2026-10-02 在 Chrome 里，页脚 14:36 仍显示 `2:31 PM`，而一次语言切换已经让页脚的标签变成中文；14:49 显示 `2:37 PM`；一次无头运行一直显示 `2:50 PM`，直到 14:51 刷新。任务要求先问用户保留还是移除页脚时钟，并参考官方 Hyperliquid 终端是否显示时钟。

范围：只改页脚时钟。基线说明：本工作树分支创建在 `main` 的 `3ced842e` 上，它与 `origin/dev`（`682430ba`）的代码树完全相同，分支也没有自有提交，所以开工前对齐到 `682430ba`（仓库的 PR 进 `dev`）。

任务描述里的时间线需要更正：描述说时钟从单仓迁移 `7767994d` 起就是这样。Git 历史显示，计时器（`useState` 加 `setInterval(…, FOOTER_TIME_TICK_MS)`）是在 `9353743a`（2026-01-05，"fix: minor chnages"）里删掉的；`7767994d` 只是把文件原样搬进了 `apps/terminal`。

## 结论与依据

**保留还是移除。** 用户选择"保留，修成实时时钟"。提问前取得的依据如下。

- 官方终端：2026-10-02 约 15:23（UTC+8）取证。用桌面应用的内置浏览器打开 `/trade`，面板处于隐藏状态，视口模拟为 1440×900，用脚本读取 DOM，不是人工目视检查。
  - 页脚高 30px，左边是指向 statuspage 的 `Online`，右边是 Docs / Support / Terms / Privacy Policy，没有时钟，也没有版本号。
  - 本地时间显示在 TradingView 图表的底部工具栏里，格式为 `15:23:55 (UTC+8)`。
- Sairn：图表时区固定为 UTC，并且在 `config/chart.ts` 里关掉了 `timeframes_toolbar` 和 `timezone_menu`。所以页脚是终端里唯一显示本地时间的地方。

**根因。** 用 `babel-plugin-react-compiler` 1.0.0 编译当时的 `footer-bar.tsx`（草稿目录里的脚本，未入库）：

- `formatTime(new Date())` 落在一个以 `Symbol.for("react.memo_cache_sentinel")` 为条件的缓存槽里，只在首次渲染时计算。
- `props` 变化时（比如语言切换），`<FooterBarView … clock={…} />` 元素会重新创建，但 `clock` 仍取自那个缓存槽。

排查同类问题时的发现：

- 编译器不缓存 `Date.now()`，在 `use-portfolio-data.ts` 的编译产物里核对过；被缓存的是 `new Date()` 这种分配对象的表达式。
- `apps/terminal/src` 的渲染路径里没有别的 `new Date()`。

**实现。** `hooks/ui/use-minute-clock.ts` 提供 `useMinuteClock()`，基于 `useSyncExternalStore`。

- 快照每次都按墙钟取整到当前分钟（`startOfMinute(Date.now())`），同一分钟内返回同一个数字。
- 计时器只负责通知订阅方重新读取快照。它排到墙钟的下一个整分钟，触发后按当时的墙钟重新排定，所以计时器提前触发或系统时间回拨都不会让走时错位。
- 页面为 `hidden` 时不保留计时器；`visibilitychange` 时立即通知订阅方，然后重新排定。
- 最后一个订阅方退订时，移除监听并清掉计时器。
- 服务端快照为 `null`，与 `ClientOnly` 的预渲染回退 `clock={null}` 一致；回退本身和纯视图 `FooterBarView` 都没有改动。

快照不放在模块级缓存里，理由有两条：

- 订阅方全部退订后再挂载，不会先闪一帧旧的分钟。
- 如果整分钟恰好落在渲染与订阅之间，React 在订阅后会自己再核对一次快照，自然能发现。

提交前的初稿用了模块级的分钟变量，外加"空闲时刷新"和"订阅时校准"两个分支；这些都已在提交前替换。

**React Compiler 的依赖放宽。** 第一版写的是 `formatTime(minute, { locale: i18n.locale })`，放在三元表达式的分支里。编译器把这个缓存槽的依赖记成了 `[i18n, minute]`。`i18n` 是 Lingui 单例，语言切换后引用不变，于是中文用例失败，仍显示 `2:31 PM`。对照变体的编译结果：

| 变体 | 编译器记录的依赖 |
|---|---|
| 无条件地在对象字面量里写 `i18n.locale` | `i18n.locale` |
| 三元分支里读取，但别处另有一次无条件读取 | `i18n.locale` |
| 只在三元分支里读取 | `i18n` |
| 只在 `&&` 右侧读取 | `i18n` |
| 普通 `if` 语句，缓存范围在分支内部 | `i18n.locale` |
| 循环里的 `if` 往循环前创建的数组里 `push` | `i18n` |

后三行由独立审查指出，本会话重新编译核实过。初稿文档写的是"三元、`&&` 或 `if` 分支里的读取都会被放宽"，对 `if` 的表述过宽，已改为"值来自条件表达式，或缓存范围跨过分支"。改成 `const locale = i18n.locale;` 后，依赖为 `[locale, minute]`，这种写法在各种情况下都安全；规则写进了 `docs/i18n-presentation.md`。

**未采用的方案：**

- `setInterval(60_000)`：会和整分钟错位，页面隐藏时也照样运行。变异 M4、M6 证明测试能抓到这种写法。
- 在 `ClientOnly` 里另包一层组件来调用 hook：服务端快照为 `null` 已经覆盖了服务端渲染的情况，不需要。
- 像官方图表底栏那样精确到秒：用户选择的方案保持分钟精度，显示格式不变。
- 另加 `focus` 监听：任务指定用 `visibilitychange`；而且窗口保持焦点时，系统休眠唤醒也不会触发 `focus`。

## 验证与限制

版本：基线 `682430ba` 加本次改动，日期 2026-10-02。

**单元测试与变异检查**

- 修复前：`pnpm --dir apps/terminal exec vitest run src/lib/tests/footer-bar.test.tsx` 结果为 5 失败、4 通过，失败的正是 5 个新用例。断言分别为：
  - `'2:31 PM'` 应为 `'2:32 PM'`，两例；
  - `'2:31 PM'` 应为 `'14:31'`；
  - 计时器数量 `0` 应为 `1`，两例。
- 修复后：9 项全部通过。
- 独立审查后补了第 10 个用例"同一分钟内只有一个快照"：先推进 20 秒（不跨整分钟），再派发 `visibilitychange`，断言 `formatTime` 没有被再次调用。`formatTime` 通过对 `@/lib/format` 的透传 mock 计数。审查发现的缺口是：快照如果直接返回 `Date.now()`，原来的 9 个用例仍会全部通过。这个用例不是用来证明旧代码有缺陷的，它在旧代码上也会通过。
- 最终 10 项全部通过。本机默认的 Node 24.15.0（ICU 78.2）与 CI 使用的 Node 22.15.0（ICU 76.1）各跑一次，都是 10 项通过；两者的 `en-US`、`zh-CN`、`ar-SA` 短时间格式相同。
- 变异检查：临时改生产代码后跑最终的测试文件，每次检查后从内存原文还原，前后 sha256 一致。8 项变异都至少有 1 个用例失败：

| 变异 | 失败用例数（共 10 个） |
|---|---|
| M1 隐藏时仍排计时器 | 2 |
| M2 不监听 `visibilitychange` | 2 |
| M3 在三元分支里写 `{ locale: i18n.locale }` | 1 |
| M4 固定 60 秒延迟 | 3 |
| M5 退订时不清计时器 | 1 |
| M6 触发后固定一分钟再排 | 1 |
| M7 快照缓存到下一次计时器触发 | 4 |
| M8 快照直接返回 `Date.now()` | 1 |

**静态检查与回归组**

- `pnpm exec biome check`（改动的 3 个 TS/TSX 文件）通过；`pnpm --filter @sairn/terminal typecheck` 通过。
- AGENTS.md「Startup rendering」组：10 个文件 184 项通过。
- AGENTS.md「Runtime translation」组：5 个文件 254 项通过。
- `docs/number-format-setting.md` 回归入口原有的 9 个文件，加上 `footer-bar`、`dashboard-chrome`、`legal-doc-page`、`preload-trade-terminal-surface`、`status-motion-surface-contract`：14 个文件 223 项通过。
- 全量 `pnpm --filter @sairn/terminal test`：在补第 10 个用例之前跑的，645 个文件中 643 个通过、1 个跳过、1 个失败；8,003 项中 8,001 项通过。失败的是 `chart-build-assets.test.ts` 里对 TradingView 源码树计算摘要的用例，原因是并行负载下（CPU 约 460%）超过 5 秒超时；单独重跑该文件 17 项全部通过，耗时 2.2 秒，与本次改动无关。之后只改了 `footer-bar.test.tsx` 和文档，该测试文件已单独重跑。
- 未运行：`pnpm build`、Playwright 浏览器套件。

**独立审查**

由一个只读的代码审查子代理完成，审查对象是未提交的改动，未发现缺陷。审查报告的自查结论如下，本会话没有逐项复现，除非另有说明：

- StrictMode 下"订阅、退订、再订阅"之后，只剩一个计时器和一个监听。
- 两个根共用一个计时器；全部卸载后，计时器和监听都归零。
- 页脚测试在 8 个偏移不寻常的时区（含加德满都、查塔姆、圣约翰斯、豪勋爵岛）下都通过。
- 没有其他测试文件同时使用假计时器并挂载真实页脚。本会话对页面级测试也做了同样的检索，结论一致。

审查提出的三点及处理：

- 文档对 `if` 的表述过宽：已核实并修正，见上文表格。
- 时区缓存：页面打开期间电脑时区改变时，`lib/format.ts` 缓存的格式化器仍用旧时区。这是既有行为，已写进规则 8 的已知限制。
- 测试缺口：已补第 10 个用例，并用变异 M8 验证。

另外，退订时移除 `visibilitychange` 监听这一步没有测试覆盖。监听即使泄漏也无害：没有订阅方时，处理函数什么都不做。

**浏览器核对**

本工作树的开发服务器 `vite dev --port 3015`，用 `lsof` 核对过进程的工作目录。`apps/terminal/.env.local` 从主检出复制过来；该文件被 Git 忽略，没有提交。

- 无头 Chromium 147（Playwright 脚本读取 DOM，不是人工查看），视口 1440×900，打开 `/trade`：
  - `3:44 PM` 在整分钟后 3 ms 变为 `3:45 PM`，期间只有一次文本变更。
  - 用页头语言菜单热切换（Playwright 注入的点击，不是物理输入）：中文 `15:45`，阿拉伯语 `3:45 م`（没有阿拉伯-印度数字），切回英文 `3:45 PM`。
  - 无头模式造不出 hidden 状态：把另一个标签页切到前台、用 CDP 最小化窗口，页面都仍是 `visible`。
- 内置浏览器：桌面应用面板隐藏，`visibilityState` 是真实的 `hidden`，视口模拟为 1440×900。
  - 15:45:53 读取为 `3:45 PM`；15:46:10 仍为 `3:45 PM`，跨过整分钟没有走时。
  - 15:46:20 用脚本模拟恢复可见（覆盖 `visibilityState` 的取值并派发 `visibilitychange`，不是物理切换），时钟立即变为 `3:46 PM`。
  - 15:47:00 后 3 ms 走到 `3:47 PM`。
  - 15:47:09 撤掉覆盖，回到真实的 `hidden`；15:48:02 仍为 `3:47 PM`。
- 3015 端口运行时控制台有两类错误：Privy 的 `frame-ancestors` CSP，以及一个 403。Privy 只放行 `localhost:3005`，这是预期内的，与页脚无关。

**未覆盖**

- 真实浏览器里的物理切换标签页或最小化窗口。
- 页面一直可见时系统休眠唤醒或调整系统时间。文档写明了这种情况最多晚一分钟才校正。
- 各仪表盘页面的页脚。它们用的是同一个组件，但没有在浏览器里逐页打开。
- 手机布局：手机上没有这个页脚。

## 后续与替代关系

- `apps/terminal/src/components/vaults/vaults-list.tsx` 的 `fetchedLabel` 有同样的依赖放宽：它在三元分支里写了 `{ locale: i18n.locale }`，编译产物的依赖是 `[fetchedAt, i18n]`。语言切换后，Vault 列表的获取时间会一直显示旧语言，直到下次拉取数据。本次没有修复，已作为单独的任务建议提出。
- 尚未加契约测试来拦截"只在分支里读取 `i18n.locale`"这种写法。
- `lib/format.ts` 的格式化器缓存只以 locale 和选项为键，页面打开期间电脑时区改变后仍用旧时区，影响所有日期与时间。这是独立审查指出的既有问题，审查者用 Node 改 `TZ` 复现过，本会话没有在浏览器里复现，也没有修。
- 没有被替代的记录。
