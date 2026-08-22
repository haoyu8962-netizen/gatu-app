# 对抗式审查报告:最近三个 commit(0488cfec / 75c72bef / 2b428265)

> 审查方法:4 个独立深审 agent(逐 commit 正确性/规范/回归 + chart 并发专项)→ 每条发现由 2 个独立反驳 agent 对照仓库当前代码验证(多数决),17 条发现存活 16 条。
> CONFIRMED = 双反驳者均无法推翻;PLAUSIBLE = 一名反驳者存疑,请自行复核。

## 评分

| Commit | 评分 | 一句话结论 |
|---|---|---|
| `0488cfec` fix(i18n): sync position tabs | **6 / 10** | 12 行修复机制正确(React Compiler × lingui 单例缓存),但同屏 bottom-nav 漏修、全库 65 处同类隐患、零测试防护 |
| `75c72bef` fix(i18n): sync active language | **6.5 / 10** | 修复经真实 babel 管线取证成立;但 81 行新测试"两边绿"(修复前代码同样通过),不构成防护 |
| `2b428265` fix(chart): stabilize symbol switching | **5 / 10** | store 5s 延迟释放架构方向正确、测试有增强;但 symbol-switch watchdog 被整删(BLOCKER)+ 2 个已用 vitest 复现的生命周期竞态 |

## 立即行动项(按优先级)

1. **落库你工作区的 watchdog 回补**:审查确认 2b428265 删除了 symbol 切换看门狗(超时+重试+错误回退 UI),`setSymbol` 被吞时图表永久静默卡在旧市场——而你**工作区未提交的 +95/+146 行改动已逐项回补**(8s 超时、1 次重试、`getActiveChartSymbol` 实际校验、强化测试)。请尽快提交,它是本报告 BLOCKER 的现成修复。
2. **修 `subscribe-with-reconnect.ts` 两个竞态**(下方 F-8/F-13,均附复现思路):releaseStream 在 candle() pending 时删条目导致 WS 订阅永久泄漏+双份推送;零监听分支不清 releaseTimer,孤儿定时器会击穿你自己引入的 5s keep-alive。
3. **补齐 `mobile-bottom-nav.tsx`**:与 0488cfec 同屏同款 bug(`i18n._` + core-macro `t`),切语言后 tabs 已修、底部导航仍旧语言,混合语言比原 bug 更显眼。

## 基建级建议(治本)

- **vitest 管线加载 React Compiler**:两个 i18n 修复的测试都"修复前后均绿"——因为 vitest 不跑 `babel-plugin-react-compiler`,编译器缓存类 bug 在测试环境**结构性不可复现**。组件测试若不过真实编译管线,这一整类 bug 永远没有回归防护。
- **全库清扫 + lint 禁令**:热切换架构下仍有 ~65 个文件从 `@lingui/core/macro` 导入非响应式 `t` 在 render 里使用(逐文件打补丁必然遗漏)。建议一次性 sweep + 加 eslint/biome 规则禁止组件 render 路径使用 core-macro `t`。
- **测试断言解耦**:language-switcher.test 断言 `font-semibold`/svg 等 @gatu/ui 内部实现细节;msgId 用手搓 sha256 复刻(lingui 升级即静默失效,可改从 `@lingui/message-utils` 导入)。

## 全部发现(16 条,按严重度)

### F-1 [BLOCKER][CONFIRMED] `apps/terminal/src/components/trade/chart/tradingview-chart.tsx`:139(2b428265)

**symbol 切换 watchdog(超时+重试+错误 UI)被整体移除,setSymbol 被吞时图表永久静默卡在旧市场**

- 证据:本 commit 删除了 MAX_SYMBOL_SWITCH_ATTEMPTS/SYMBOL_SWITCH_TIMEOUT_MS 及全部超时/重试逻辑(diff -114 行),HEAD 版 applySymbol 只剩 `widget.setSymbol(nextSymbol, nextInterval, handleSymbolSwitchComplete)`(HEAD:139),无任何兜底。推演:TradingView 已知会在上一次 resolve 在途时丢弃 setSymbol(本仓库反复修过的 "symbol 切换僵死" 模式);回调与 onSymbolChanged 都不触发时 pendingSymbolRef 永久保持 nextSymbol,后续同一目标的 applySymbol 全部被 `if (pendingMatches) return;`(HEAD:108)短路——…
- 建议:恢复 watchdog:setSymbol 后启动超时定时器(≈8s),到期先用 widget.activeChart().symbol() 对照 getChartMarketKeys 判断是否已实际切换(避免旧版 4s 误报),未切换则重试 1 次,仍失败 setInitError 展示 Retry。工作区未提交版本已实现该方案,应将其提交而不是留在 working tree。

### F-2 [MAJOR][CONFIRMED] `apps/terminal/src/components/trade/mobile/mobile-bottom-nav.tsx`:51(0488cfec)

**同一移动端屏幕的底部导航仍保留本 commit 修复的同款 bug（i18n._ + 核心 t 宏），换语言后与刚修好的 tabs 呈混合语言**

- 证据:mobile-bottom-nav.tsx:19 `const { i18n } = useLingui()`，:51 `aria-label={i18n._(item.label)}`、:69 `{i18n._(item.label)}`、:28 `aria-label={t`Primary navigation`}`（t 来自 @lingui/core/macro）。React Compiler 已启用（vite.config.ts:73 'babel-plugin-react-compiler'）。@lingui/react 5.7.0 的 I18nProvider 在 locale 变化时 setContext(makeContext())，其中 `_: i18n.t.bind(i18n)` 每次换新引用，而 `i18n` 是同一可变单例（node_modules/@lingui/…
- 建议:与本 commit 同法：改为 `const { _ } = useLingui()` + `_(item.label)`；:28 的 `t`Primary navigation`` 改用 `useLingui`（@lingui/react/macro）返回的 t，或 `_(msg`Primary navigation`)`。commit 号称 fix 移动端 tabs 的 locale 同步，至少应把同屏的 bottom-nav 一并覆盖。

### F-3 [MAJOR][CONFIRMED] `apps/terminal/src/components/trade/positions/orders-tab.tsx`:2(0488cfec)

**治标不治本：热切换架构下全仓库仍有 65 个组件/hook/route 文件使用非响应式核心 t 宏，逐文件打补丁必然遗漏**

- 证据:祖先 commit 019cc18a 'fix(i18n): switch languages without reloading' 已废弃整页 reload 设计（当前 __root.tsx 无任何 reload，lib/i18n.ts 的 dynamicActivate 纯运行时 loadAndActivate）——这正是本 fix 存在的原因：热切换后所有渲染期翻译必须是响应式的。但 `grep -rln 'import {...t...} from "@lingui/core/macro"' src/{components,hooks,routes}` 命中 65 个文件。抽查：orders-tab.tsx 24 处 t`...`（含 :236 `{t`Time`}` 等表头/按钮文案）、mobile-market-bar.tsx 14 处、footer-bar.tsx 5 处，三…
- 建议:停止逐文件补丁，做一次性迁移：组件内渲染期文案统一改为 @lingui/react/macro 的 `useLingui()` 的 t / `<Trans>`，或 `_(msg`...`)`；config 层 `msg` 描述符保持不变。同时加 ESLint `no-restricted-imports`（src/components|hooks|routes 内禁止从 @lingui/core/macro 导入 t，允许 msg），让这个 bug 类别在 lint 层灭绝，而不是靠事后逐个 fix。

### F-4 [MAJOR][CONFIRMED] `apps/terminal/vitest.config.ts`:5(0488cfec)

**零回归保护：本 commit 未加测试，且现有测试管线结构性无法复现/防护该 bug 类别（vitest 不跑 React Compiler）**

- 证据:vitest.config.ts:4-9 plugins 仅有 vite-tsconfig-paths，不加载 @vitejs/plugin-react，因此 babel-plugin-react-compiler（vite.config.ts:73）在测试里不生效。而 `i18n._(tab.label)` 的失效恰恰依赖编译器 memo：无编译器时组件经 useLingui 订阅 context、locale 变化即重渲染并重新求值，旧代码在测试环境本来就是对的。即：给 positions tabs 写热切换断言，修复前后都会绿。对照前一 commit 75c72bef 为 language-switcher 补了测试，本 commit（修的是更隐蔽的编译器缓存 bug）反而一个测试都没加；i18n-hot-switch.test.tsx 也未覆盖 PositionsPanel/Mob…
- 建议:让 vitest 走与生产一致的 babel 管线：vitest.config.ts 引入 viteReact({ babel: { plugins: ['@lingui/babel-plugin-lingui-macro', 'babel-plugin-react-compiler'] } })（顺带可删除测试里手写 sha256 模拟 @lingui/react/macro 的 vi.mock），然后在 i18n-hot-switch.test.tsx 增加断言：激活 zh 后 positions tab 标签（如 'Positions'→'持仓'）与 bottom-nav 标签更新。

### F-5 [MAJOR][PLAUSIBLE] `apps/terminal/src/components/trade/chart/tradingview-chart.tsx`:135(2b428265)

**切换完成判定不校验实际 symbol:任意 onSymbolChanged 事件即标记完成,叠加 watchdog 移除后错市场状态不可恢复**

- 证据:HEAD:135 `symbolChanged.subscribe(null, handleSymbolSwitchComplete, true)`——handleSymbolSwitchComplete(HEAD:122)只校验 widgetRef/targetSymbolRef,不看事件携带的 symbolInfo。推演:快速 A→B→C 切换时,B 的迟到 onSymbolChanged 事件会触发 C 闭包的 complete 回调,targetSymbolRef===C 成立 → appliedSymbolRef=C 而图表实际显示 B;若 setSymbol(C) 恰被丢弃,则 applied===target 使 applySymbol 永远 no-op,图表永久停在错误市场。该弱点虽在父 commit 已存在(2b428265^ 同一行),但本 commit 主题就是 "s…
- 建议:onSymbolChanged 回调改为接收 LibrarySymbolInfo,用 isChartSymbolApplied(actualSymbol, nextSymbol)(对照 getChartMarketKeys(targetMarket))确认实际生效的 symbol 与目标一致后才 completeSymbolSwitch,不一致直接忽略事件(按工作区方案提交)。

### F-6 [MAJOR][CONFIRMED] `apps/terminal/src/lib/tests/tradingview-chart.test.tsx`:351(2b428265)

**回归防护测试被删弱:把"卡死无兜底"钉成期望行为,CI 无法再捕获 symbol 切换僵死**

- 证据:原测试 "keeps the existing widget when a symbol switch stalls" 断言 4s 后 setSymbol 重试(×2)、再 4s 后出现 "Something went wrong"+"Retry";本 commit 改为推进 30_000ms 后断言 `setSymbol` 仍只调用 1 次且 `not.toContain("Something went wrong")`/`not.toContain("Retry")`(HEAD:351 起),新增的 "does not show a fatal chart error when TradingView symbol switching is slow"(HEAD:153)同样只断言无错误 UI 而不断言任何恢复路径(无重试、无完成校验、无超时提示)。即测试从守护恢复能力改为固化 fin…
- 建议:随 watchdog 恢复一并提交强化后的测试:对 setSymbol 回调不触发的场景,断言超时后要么通过实际 symbol 校验完成、要么重试一次、耗尽后出现错误 UI 与 Retry 按钮;保留 "慢而未死不误报" 的新用例(超时前先查 activeChart().symbol())。

### F-7 [MAJOR][CONFIRMED] `apps/terminal/src/lib/chart/subscribe-with-reconnect.ts`:125(2b428265)

**releaseStream 在 candle() promise 仍 pending 时删除 runtime 条目，滞留的 .then 按 key（而非条目身份）认领新纪元条目，导致 WS 订阅永久泄漏 + 重复 candle 推送**

- 证据:startSubscription 的 .then/.catch 只用 `const entry = ctx.runtime.get(ctx.key)` 按 key 查找（subscribe-with-reconnect.ts:125、165），不校验条目身份。而 store.ts releaseStream（store.ts:109-113）会在 promise 仍 pending 时把 `runtimeEntry.promise = undefined` 并 `runtime.delete(key)`——它无法取消在途 promise。交错时序（已用可运行测试在当前 HEAD 复现，vitest 失败断言为证）：t=0 subscribe A → P1 pending（WS 断线重连场景下 candle() 挂起>5s 完全现实）；t=0 unsubscribe A → release…
- 建议:在 startSubscription 里捕获本纪元条目引用（const owner = entry），.then/.catch 开头改为 `const entry = ctx.runtime.get(ctx.key); if (entry !== owner) { runUnsubscribe(subscription); return subscription; }`（catch 同理直接 return）。这样滞留 promise 无论何时 resolve 都自我清理，不会认领新纪元条目，也顺带消除 E2.promise 被误清的问题。

### F-8 [MAJOR][CONFIRMED] `apps/terminal/src/lib/tests/language-switcher.test.tsx`:58(75c72bef)

**新测试无法复现/防回归它所守护的 bug（修复前代码同样通过）**

- 证据:该 bug 的根因是 React Compiler 记忆化：编译修复前组件（用 vite.config.ts:73 相同的 babel 管线）可见 items 被 `if ($[0] !== i18n)` 缓存，i18n 是恒定单例引用永不失效，t`Language` 被 memo_cache_sentinel 缓存只计算一次——高亮与 aria-label 双双冻结。但 vitest.config.ts:4-9 只挂 vite-tsconfig-paths，既无 @lingui/babel-plugin-lingui-macro 也无 babel-plugin-react-compiler。实测：将完全相同的测试场景跑在 75c72bef~1 的组件副本上（配等价的 core/macro 运行时 mock），测试通过（1 passed）。即该测试在修复前后都是绿的，对实际缺陷零回归保护，…
- 建议:让组件测试走真实编译管线：在 vitest 配置（或单独的 vitest project）中加入 @vitejs/plugin-react 并复用 app 的 babel plugins（lingui macro + react-compiler）。这样 macro 真实编译，可整体删除手写的 @lingui/react/macro mock，且测试能真正在『编译器记忆化』语义下验证高亮同步——回归时会真实变红。

### F-9 [MINOR][CONFIRMED] `apps/terminal/src/lib/chart/subscribe-with-reconnect.ts`:135(2b428265)

**startSubscription .then 的零监听分支 runtime.delete 时不清 releaseTimer，孤儿定时器会提前释放下一纪元的存活订阅，击穿 5 秒 keep-alive**

- 证据:.then 中 `if (!ctx.hasListeners()) { runUnsubscribe(subscription); ctx.runtime.delete(ctx.key); ... }`（subscribe-with-reconnect.ts:133-137）删除条目时，unsubscribe 已在该条目上排入的 releaseTimer（store.ts:281）未被 clearTimeout——clearReleaseTimer 只定义在 store.ts:70-75，subscribe-with-reconnect.ts 根本无法调用它。已用可运行测试在当前 HEAD 复现：t=0 sub A（P1 pending）→ unsub A（T1 定于 t=5s）→ P1 resolve（0 监听）→ runUnsubscribe#1 + runtime.delete，T1…
- 建议:把 clearReleaseTimer 移到 subscribe-with-reconnect.ts 与 clearReconnectTimer/clearCooldownTimer 并列。零监听分支二选一：(a) 推荐——不删条目：保留 entry 并照常挂载 subscription + failure listener，让已排定的 releaseTimer 在窗口结束时统一走 releaseStream 收尾，这样窗口内快速重订还能复用 socket，完整兑现 keep-alive 语义；(b) 若坚持立即拆除——必须 clearReleaseTimer(entry) 且同步从 zustand state 移除该 0 监听的 streams[key] 僵尸条目（目前恰是这个孤儿定时器在兜底清 state，只清定时器不清 state 会让僵尸流永久滞留）。

### F-10 [MINOR][PLAUSIBLE] `apps/terminal/src/components/trade/chart/tradingview-chart.tsx`:108(2b428265)

**该 commit 整体删除 symbol 切换看门狗（timeout+重试+错误面板），setSymbol 回调与 onSymbolChanged 双双失约时切换永久静默卡死——历史上反复修复的僵死模式回归**

- 证据:commit 版删除了 MAX_SYMBOL_SWITCH_ATTEMPTS/SYMBOL_SWITCH_TIMEOUT_MS 及全部重试/超时逻辑（diff 行 34-35、143-168），applySymbol 仅剩 `if (pendingMatches) return;` 守卫。当 widget.setSymbol 的回调被 TradingView 吞掉且 onSymbolChanged 不触发（如 resolveSymbol 因瞬时网络错误走 onError 后被库中止），pendingSymbolRef 永不清空：同一目标的后续 applySymbol 调用全部被 pendingMatches 早退，无重试、无 setInitError、无 Retry 按钮——orderbook/成交/下单面板已切到新市场而图表静默停留在旧市场，对交易终端属于误导性显示。此前的 8s 超时+…
- 建议:确保工作区已恢复的 8s 看门狗+1 次重试+错误面板尽快随后续 commit 落库；若担心旧 4s 超时的误报，用加长超时（8s+）替代整体删除，超时后先静默重试一次、再失败才升级为错误 UI，兼顾误报与僵死兜底。

### F-11 [MINOR][PLAUSIBLE] `apps/terminal/src/lib/tests/language-switcher.test.tsx`:1(75c72bef)

**与工作区未提交的 i18n-hot-switch.test.tsx 逐字重复同一测试**

- 证据:工作区存在未跟踪文件 apps/terminal/src/lib/tests/i18n-hot-switch.test.tsx，其 205-228 行的 "moves the language menu selected state to the active locale" 与本 commit 新增测试逐字相同，且两文件各自复制了同一份 @lingui/react/macro mock 和 sha256 message-id 重实现（language-switcher.test.tsx:11,22-26 vs i18n-hot-switch.test.tsx:29-31,41-56）。两文件并存时同一场景会跑两遍。
- 建议:落地 i18n-hot-switch.test.tsx 前二选一保留该用例；把 activateLocale、macro mock、getMessageId 抽到已存在的 src/lib/tests/harness/ 共享，避免 lingui 内部哈希算法（sha256+\x1f+base64 slice6）在多个测试文件中漂移。

### F-12 [MINOR][PLAUSIBLE] `apps/terminal/src/lib/tests/language-switcher.test.tsx`:76(75c72bef)

**断言耦合 @gatu/ui Dropdown 的样式实现细节，且 mock 过度**

- 证据:76-79 行用 classList.contains("font-semibold") 和 querySelector("svg") 判定 active 态，直接绑死 packages/ui/src/dropdown.tsx:149（active 类名）与 :166（CheckIcon svg）的实现——改一个样式 token 或换图标测试就假红。另外 mock 里导出的 Trans（第 17 行）组件根本没用到；22-25 行重实现 lingui 私有的 generateMessageId 算法，升级 lingui 若换算法会以『找不到 aria-label=语言』的间接方式报错，定位成本高。
- 建议:给 Dropdown 的 active 菜单项加语义属性（如 data-active 或 role=menuitemradio + aria-checked），测试改断言语义属性；删除 mock 中未用的 Trans；message-id 计算改为从 harness 统一导入并加注来源（@lingui/message-utils generateMessageId），或直接依赖该包计算。

### F-13 [MINOR][PLAUSIBLE] `apps/terminal/src/components/trade/components/global-settings-modal.tsx`:122(75c72bef)

**同 commit 修复的 GlobalSettingsModal 无任何测试；dynamicActivate 交互路径也未断言**

- 证据:commit 同时修了 global-settings-modal.tsx 的 Select value={i18n.locale}→activeLocale（第 122 行），但 81 行新测试只覆盖 LanguageSwitcher。且测试里 vi.mock 的 dynamicActivate（test 文件 32-34 行）从未被断言：没有验证『点击当前语言不触发 dynamicActivate』（language-switcher.tsx:16 的 guard）与『点击其他语言以正确 code 调用』这两条本 commit 改动过的分支。
- 建议:补两条断言：点击 active 项后 expect(dynamicActivate).not.toHaveBeenCalled()；点击 中文 项后 expect(dynamicActivate).toHaveBeenCalledWith("zh")。GlobalSettingsModal 的 Select value 同步可在同一 harness 下加一个用例（或至少在 i18n-hot-switch 测试面中挂载它）。

### F-14 [MINOR][CONFIRMED] `apps/terminal/src/components/ui/spinner.tsx`:9(75c72bef)

**同根因（React Compiler 冻结 core-macro t / 裸读 i18n.locale）在其他文件仍存在，修复不完整**

- 证据:编译产物证明渲染位置的 core-macro t 会被 sentinel 缓存、永不随语言切换更新（见 old-compiled 中 t`Language` 的 memo_cache_sentinel 块）。仍在渲染位置使用 @lingui/core/macro t 的至少有：spinner.tsx:9（aria-label={t`Loading`}）、price-input.tsx:29（{t`Mid`}）、chart-source-toggle.tsx:48,60（{t`Default`}/{t`TradingView`}）等；另有 stores/use-global-settings-store.ts:194 的 useResolvedFormatLocale 在 hook 中裸读 i18n.locale 且无任何订阅——调用方组件在语言切换时既不重渲染、compiler 还会按 i…
- 建议:做一次 sweep：渲染位置的 t 一律改为 useLingui()（@lingui/react/macro）的 t；useResolvedFormatLocale 增加对 locale 的响应式来源（如内部调用 useLingui 读取 i18n.locale）。事件回调/toast 内的 core-macro t（调用时求值）可保留。可开一个后续任务逐文件核对 grep "@lingui/core/macro" 的渲染位置用法。

### F-15 [NIT][PLAUSIBLE] `apps/terminal/src/components/trade/positions/positions-panel.tsx`:58(0488cfec)

**被审文件内遗留违反项目规则的手动 useMemo（先于本 commit 存在，未借机清理）**

- 证据:positions-panel.tsx:58-69 `const balancesCount = useMemo(() => {...}, [isConnected, perpSummary?.accountValue, spotBalances])` 是纯派生计算，仅为性能而 memo。项目规则（.claude/rules/code-style.md）明确：React 19 编译器已启用，禁止为性能加手动 useMemo。非本 commit 引入，但 commit 已在改动此文件。
- 建议:去掉 useMemo，改为普通函数/内联计算（编译器自动 memo）。同类：mobile-positions-view.tsx:52-55 用 useEffect 把派生规范化值写回 store（`if (storedActiveTab === activeTab) return; setPositionsActiveTab(activeTab)`），属'派生状态 useEffect'边缘用法，可在读取端或事件处收敛。

### F-16 [NIT][CONFIRMED] `apps/terminal/src/components/trade/chart/constants.ts`:36(2b428265)

**QUOTE_ASSET 别名再导出成为死代码**

- 证据:本 commit 把组件内 getLegacyChartDisplaySymbol 迁移到 lib/chart/market-symbol.ts 并改用 @/config/chart 的 CHART_QUOTE_ASSET 后,constants.ts:36 `CHART_QUOTE_ASSET as QUOTE_ASSET` 的最后一个消费方(tradingview-chart.tsx)已删除;全仓 grep "QUOTE_ASSET"(排除 CHART_QUOTE_ASSET)仅剩该再导出自身,无任何 import。
- 建议:删除 constants.ts 第 36 行的 `CHART_QUOTE_ASSET as QUOTE_ASSET` 再导出(第 14 行的 import 若无其他用途一并清理)。
