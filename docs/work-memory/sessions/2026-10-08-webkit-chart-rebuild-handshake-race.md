<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-08-webkit-chart-rebuild-handshake-race",
  "date": "2026-10-08",
  "title": "iOS Safari 线上版本第二次创建 TradingView 图表永远不就绪：加载器 innerWindowLoad 监听晚于派发",
  "kind": "task",
  "status": "verified",
  "topics": ["market-recovery", "static-hosting"],
  "summary": "用户在 iPhone Safari 上从交易页去任意仪表盘页再回到 Markets 视图，图表停在品牌加载动画，约 30 秒后变成「出错了 / 重试」，重试无效。根因不在应用代码：vendored 的 TradingView 加载器 charting_library.js（v28.3，`_create`）在 iframe 里 `document.write` 完图表文档之后才注册 `innerWindowLoad` 监听；线上 `charting_library/bundles/` 是 immutable，WebKit 对同一页面里第二次创建的 iframe 直接从内存缓存同步执行全部脚本，内层在 `document.write` 期间就派发了 `innerWindowLoad`，监听晚 1 ms 注册，`onChartReady` 永不触发，15 秒就绪看门狗重试一次后报错；重试、语言切回已缓存语言包的语言、数字格式变化走的是同一条重建路径。Playwright WebKit（iPhone 13）对 app.sairn.ai 复现并记录事件顺序，Chromium 同路径正常；本地开发服务器（无 immutable 缓存）与 iOS 模拟器不复现；官方站用同一份 v28.5 加载器，切页面同样销毁重建 iframe，但其 bundle 每次重新验证，不触发。用户选定方案 1：补丁四份加载器副本（`_create` 里把监听挪到 `document.open()` 之后、`document.write` 之前，blob 分支保持在写入之后），新增 `charting-library-loader-handshake-contract` 钉住顺序，重新生成 TradingView 摘要清单，更新 guardrails §4、清单 README、CHANGELOG 与 AGENTS 回归清单；验证见正文。",
  "thread": null,
  "baseCommit": "6da4c15a",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/tests/browser/chart-rebuild-webkit-probe.mjs" },
    { "path": "apps/terminal/src/lib/tests/charting-library-loader-handshake-contract.test.ts" },
    { "path": "deploy/manifests/tradingview-charting-library.json" },
    { "path": "deploy/manifests/README.md" },
    { "path": "apps/terminal/public/charting_library/charting_library.js" },
    { "path": "apps/terminal/src/components/trade/chart/tradingview-chart.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-terminal.tsx" },
    { "path": "apps/terminal/src/config/chart.ts" },
    { "path": "docs/adr/0006-startup-preloads-and-edge-caching.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/work-memory/sessions/2026-09-17-mobile-chart-retention.md" },
    { "path": "docs/work-memory/sessions/2026-09-24-official-terminal-language-switch-trace.md" }
  ],
  "supersedes": []
}
-->
# iOS Safari 线上版本第二次创建 TradingView 图表永远不就绪：加载器 innerWindowLoad 监听晚于派发

## 背景与范围

同步记录。用户在 iPhone 自带 Safari 上使用线上终端（截图：中文界面、已连接钱包、SUI-USDC；另一组英文未连接、BTC-USDC），报告：打开抽屉导航去 Funding Comparison（或任意页面）再回到交易页的市场（Markets）视图，图表位置只剩品牌加载动画，一直不出图；另一张截图是同一位置显示「出错了 / 重试」。用户要求审查相关代码找原因，一并检查语言切换是否也会导致图表无法加载，并对照 `app.hyperliquid.xyz/trade/HYPE` 在移动端切页面时的做法。

本会话运行在应用创建的 worktree `wonderful-goldberg-e47b19`（分支 `claude/tradingview-chart-loading-issue-230090`，基线 `main` 的 `6da4c15a`，与线上 p24b 相同）。只做取证与记录，没有改应用代码。未取得可核对的任务标识，`thread` 记为 null。

## 结论与依据

### 现象链（应用侧，按代码核对）

- 手机布局下图表只挂在 Markets 视图：`mobile-terminal.tsx` 的 Markets `Activity` 首次展示后常驻，底部标签与 Chart/Order Book 切换只隐藏不卸载（`2026-09-17-mobile-chart-retention`）。但 `/trade` 与 `/fundingComparison` 等是根 `<Outlet/>` 下的兄弟路由，去仪表盘页会卸载整个交易页；`tradingview-chart.tsx` 的初始化 effect 清理里 `widget.remove()` + `datafeed.destroy()`。回到交易页落在 Trade 标签（标签存在 history state 里，抽屉链接不带 state），再点 Markets 时重新 `new TradingView.widget(...)`，这是同一页面生命周期里的第二个 widget。
- 第二个 widget 的 `onChartReady` 不触发：`isInitializing` 保持 true，`hasCompletedInitialWidgetLoadRef` 为 false，所以显示 `BrandPageLoader`（截图 3）；`CHART_READY_TIMEOUT_MS` 15 秒看门狗到期后 `retryOrFail` 自动重建一次（`CHART_READY_MAX_AUTO_RETRIES = 1`），再失败后 `setInitError("ready-timeout")`，显示 `t\`Something went wrong\`` 与 `Retry`（截图 2）。Retry 按钮走 `beginWidgetRebuild`，仍是同一条创建路径，所以无效。
- 语言切换：`ChartPanel` 把 `resolveChartLocale(i18n.locale)` 传给图表，`requestLocaleSwitchRef` → `requestStatePreservingRebuild(widget, "locale")` → `widget.save` → `beginWidgetRebuild`，同样是销毁 iframe 再创建（`docs/runtime-guardrails.md` §4、`docs/number-format-setting.md` 规则 4）。数字格式变化、主题切换失败后的兜底重建、历史恢复重建、覆盖线恢复重建也都经过 `beginWidgetRebuild`。

### 根因（库加载器 + 线上缓存策略 + WebKit 执行时序）

`apps/terminal/public/charting_library/charting_library.js`（CL v28.3.0，`deploy/manifests/tradingview-charting-library.json`）的 `_create()`：

1. `container.innerHTML = <iframe src="…/charting_library/sameorigin.html">`（`iframe_loading_same_origin`，`config/chart.ts`）。
2. `await this._innerWindowEvent("sameOriginLoad")`。
3. `contentWindow.document.open(); document.write(<图表文档，含 runtime/library 等 bundle 的 <script>>); document.close()`。
4. **之后**才 `this._innerWindow().addEventListener("innerWindowLoad", resolver, { once: true })`；`_innerWindowLoaded` 兑现后再 `widgetReady(...)` → `_ready = true` → 调用 `onChartReady` 回调。

内层文档在所有 bundle 执行完后 `window.dispatchEvent(new Event("innerWindowLoad"))`。线上 `charting_library/bundles/*` 是 immutable 一年（ADR 0006 决策 3）。WebKit 对同一页面里已经执行过的脚本走内存缓存，第二个 iframe 的 `document.write` 在解析到 `<script src>` 时同步执行，`innerWindowLoad` 在第 3 步里就派发完了，第 4 步的监听晚到，promise 永不兑现。Chromium 即使命中缓存也异步执行外部脚本，监听先于派发。

Playwright WebKit（`devices["iPhone 13"]`）对 `https://app.sairn.ai` 的事件顺序（`.worklog/2026-10-08/webkit-chart-rebuild/webkit4.log`，时间为页面毫秒）：

| widget | `addEventListener(innerWindowLoad)` | `dispatch(innerWindowLoad)` | 结果 |
| --- | --- | --- | --- |
| 第 1 个（首次打开 Markets） | 3176（docReady=loading） | 3424 | 2.6 秒就绪 |
| 第 2 个（回到 Markets） | 12760 | **12759** | 15 秒后看门狗重建 |
| 第 3 个（看门狗自动重试） | 27963 | **27963**（早于监听） | 「Something went wrong」 |

同一脚本在 Chromium 上：第 2 个 widget 监听 12611、派发 12632，3 秒内就绪。第 2、3 个 widget 的内层其实完全正常：`chartWidget.model().mainSeries().bars().size()` = 300、`tradingViewApi` 存在、datafeed 的 `onReady/resolveSymbol/getBars/subscribeBars` 都被调用且回调送达、`candleSnapshot` 200、实时 K 线持续到达；只是外层拿不到就绪信号。`contentWindow` 对象在 `sameOriginLoad` 与 `document.open` 前后保持同一个（探针逐个窗口追踪），所以不是 Window 被替换。

### 语言切换

线上 WebKit 复现（`webkit` + `locale` 场景）：en → 中文 时图表 3 秒内就绪，因为 `zh.*.js` 语言 bundle 第一次请求、走网络、异步执行；中文 → English 时所有 bundle 都已在内存缓存，第二次创建失败，最终同样「Something went wrong」。也就是说语言切换会触发，条件是目标语言的 bundle 已经在本页加载过（切回、或语言对应同一组 bundle）；用户中文界面下切页面回来的场景，zh bundle 已缓存，必然失败。

### 为什么本地与模拟器没复现

- 开发服务器（`pnpm dev` 3005）+ iOS 模拟器 Safari：切页回来图表正常。Vite 对 `public/` 文件不发 immutable，WebKit 重新验证后异步执行。
- iOS 模拟器 Safari 打开线上 `app.sairn.ai`：完整复现（加载动画约 30 秒后变「Something went wrong」，Retry 后又停在加载动画）。
- 同源 iframe 握手本身没有问题：用 `webkit-probe` 夹具在模拟器里连续插入三次同源 iframe，`sameOriginLoad` 三次都落在原 Window 上（已删除的临时夹具，结论记录于此）。
- 用户环境与线上一致（真机 Safari、CloudFront immutable bundle）。记忆里「v28 在 WebKit 热缓存下可能初始化失败」（`docs/terminal-startup-performance-plan.md` P9 验证条目、ADR 0006）与本次是同一现象，这次有了可复现证据。

### 官方终端对照（`app.hyperliquid.xyz/trade/HYPE`，Playwright WebKit iPhone 13）

- 加载器 `charting_library_v28.5/charting_library/charting_library.js?bust=v8`，`_create` 与我们 v28.3 的顺序完全相同（监听仍在 `document.write` 之后），iframe `src="about:blank"`（注入模式，没开 `iframe_loading_same_origin`）。
- 用 `history.pushState` + `popstate` 切到 `/portfolio` 时图表 iframe 被 detached；切回 `/trade/HYPE` 新建 iframe（新 id），内层 300 根 K 线。也就是说官方同样「离开路由即销毁、回来重建」，与我们一致；Chart/Order Book 顶部标签不重建（`2026-09-17` 记录）。
- 官方第二次创建没有触发竞争，因为其 bundle 没有 immutable：第二次加载大量 `200`/`304` 回包（重新验证），脚本异步执行。本次没有验证官方外层 `onChartReady` 是否真的触发（官方没有可读的就绪标记），只验证了 iframe 重建与内层数据正常。
- 官方切语言不重建图表（图表语言到刷新才变），数字格式变化整页 reload（`2026-09-24-official-terminal-language-switch-trace`），所以这两条路径官方不会遇到。

### 修复（方案 1，用户选定后实施）

- `apps/terminal/public/charting_library/charting_library.js` 及 esm / cjs / standalone 三份副本的 `_create`：新增 `_listenInnerWindowLoad=()=>this._innerWindow().addEventListener("innerWindowLoad", …, {once:true})`，注入分支改为 `document.open(), _listenInnerWindowLoad(), document.write(s), document.close()`，blob iframe 分支（不写入文档）在原位置调用；其余字节不变。第一版补丁把 `const` 声明插进了逗号表达式中间导致语法错误，`node --check` 发现后改为与 `const c=this._iFrame` 合并声明。
- `src/lib/tests/charting-library-loader-handshake-contract.test.ts`：对四份副本的 `_create` 片段断言 helper 定义在 `sameOriginLoad` 等待之前、`document.open(),_listenInnerWindowLoad(),` 紧接着 `document.write(`、blob 分支的调用在 `document.close()` 之后、helper 之外没有第二处原始注册。对未补丁的入口文件（git stash 回退单个文件）4 项全红，补丁后 4 项通过。
- `deploy/manifests/tradingview-charting-library.json` 用 `node deploy/verify-chart-build.mjs --generate-manifest apps/terminal/public <候选>` 重新生成：与旧清单比较只有四个加载器条目的 size/sha256 变化（各 +74 字节），其余 1159 个文件与元数据相同；`chart-build-assets.test.ts` 17 项通过。清单 README 补充了「官方树 + 本地补丁」的说明。
- `docs/runtime-guardrails.md` §4 新增规则条目；`CHANGELOG.md` Fixed 条目；`AGENTS.md` 把新契约与 `chart-build-assets.test.ts` 加进「Trading terminal visual contract」回归组。

### 历史上的可选修复（记录当时的比较，方案 1 已采用）

1. **修补 vendored 加载器**：把 `_create` 里的 `addEventListener("innerWindowLoad", …)` 移到 `document.open()` 之后、`document.write(s)` 之前（`document.open` 会清掉 Window 上的监听，所以不能放在 open 之前）。改动一处、机制精确；需要契约测试钉住补丁顺序，并在 `deploy/manifests/tradingview-charting-library.json`、`docs/runtime-guardrails.md` §4 记录；构建发出的哈希副本会随内容变化自动换名。库升级时要重新打补丁（官方 v28.5 同样未修）。
2. **应用侧补发信号**：创建 widget 后轮询 `iframe.contentWindow.widgetReady`/`tradingViewApi`，若内层已就绪而外层 `widget._ready` 仍为 false，对内层窗口再 `dispatchEvent(new Event("innerWindowLoad"))`。不改 vendored 文件，但依赖同样的私有事件名与 `_ready` 字段，并多一个看门狗。
3. **让第二次加载不走内存缓存**：例如重建时给 `library_path` 加版本查询串让 bundle URL 变化。会抵消 immutable 缓存收益、每次重建重新下载约 3 MB，且 `library_path` 在同源模式下还决定 `sameorigin.html` 路径，不推荐。
4. 减少重建次数（语言/数字格式不重建图表，像官方那样到刷新才换）只能缩小暴露面，路由切换回来的重建仍会触发，不是修复。

## 验证与限制

- 代码阅读：`tradingview-chart.tsx`、`chart-panel.tsx`、`datafeed.ts`、`lib/chart/store.ts`、`subscribe-with-reconnect.ts`、`candle-gate.ts`、`load-script.ts`、`sw.js`、`charting_library.js` 的 `_create/_render/_innerWindowEvent/remove`；手机挂载链由只读子代理整理（`routes/trade.tsx` → `trade-terminal-page.tsx` → `mobile-terminal.tsx` → `mobile-trade-layout.tsx` → `mobile-chart-view.tsx` → `chart-panel.tsx`）。
- 复现与取证（2026-10-08，基线 6da4c15a，线上 p24b）：
  - iOS 模拟器 iPhone SE (3rd gen) Safari：本地开发服务器不复现；线上 `app.sairn.ai` 复现（加载动画 → 「Something went wrong」→ Retry 后再停在加载动画）。模拟器 Safari 的 `simctl` 在沙箱里不可用，用桌面应用的模拟器面板操作。
  - `node apps/terminal/tests/browser/chart-rebuild-webkit-probe.mjs webkit https://app.sairn.ai route`：第二个 widget `chart NOT ready within 20000ms`，最终 `Something went wrongRetry`；`chromium` 引擎同脚本第二个 widget 3 秒内就绪。`locale` 场景：en→zh 就绪、zh→en 失败。Playwright WebKit/Chromium 都无法在 Claude 沙箱里启动（XPC/Mach 端口被拒），需在沙箱外运行。
  - 原始日志（含每个 widget 的 datafeed 调用、内层状态、握手顺序）在本机 `.worklog/2026-10-08/webkit-chart-rebuild/`，Git 忽略。
  - 探针记录的是脚本注入的 DOM 事件顺序与 Playwright 的帧事件，不是真机触控；用户报告的真机现象与线上模拟器复现一致，但没有在真机上再次确认。
- 未做：没有改代码，没有验证任何修复方案；没有核对官方外层就绪回调；没有在 Android Chrome 或桌面 Safari 上测试（按机制推断桌面 Safari 同样受影响，未验证）。

## 后续与替代关系

- 修复已随本记录提交，未推送、未发布；发布后应在真机 iOS Safari 上按用户路径（抽屉 → Funding Comparison → Trade → Markets，以及中文界面切页回来）确认，并在发布记录里引用本记录。
- 库升级流程：重新打补丁 → `charting-library-loader-handshake-contract` 变绿 → 重新生成摘要清单（`deploy/manifests/README.md`）。
- 顺带发现（未处理）：线上手机页头标记价格在本次探针与模拟器里一直显示「-」而图表与订单簿正常，开发服务器正常；未排查。
- 不替代任何记录；补充 `2026-09-17-mobile-chart-retention`（标签切换保留图表）与 `docs/terminal-startup-performance-plan.md` P9 的「WebKit 热缓存回归」待办：那条待办描述的就是本缺陷。
