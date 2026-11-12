# ADR 0051：Service Worker 缓存启动资源，壳的更新保持 v10 语义

- 状态：已接受并实施（2026-11-12）。分支 `claude/fix-sw-asset-cache`，未合入 `dev`、未发布。核心决定在同一天经过两次替换：最初的「先存后换」被否决，见「考虑过而未采用的方案」与「过程」。没有对真实构建的连续两个版本做端到端验证，也没有 iPhone 真机验证。
- 关联：[ADR 0005](0005-spa-static-shell.md)（静态 SPA 壳）；[ADR 0006](0006-startup-preloads-and-edge-caching.md) 第 10 条（热访问由 Service Worker 回答导航）；[ADR 0010](0010-blank-until-ready-startup.md)（空白到就绪的启动）；[ADR 0020](0020-legal-pages-in-app-shell.md)（Service Worker v10）；[运行时守则](../runtime-guardrails.md) §8；[CloudFront 部署](../../deploy/cloudfront/README.md)；[首屏加载调研](../architecture/hyperliquid-first-load-investigation.md)；审查记录 `docs/work-memory/sessions/2026-11-12-global-defect-review.md`（提交 `9395acca`，P1-6 与 P3 字体缓存）。

## 背景

运营方在 iPhone 上把终端添加到主屏幕，隔一段时间再打开，先白屏约 5 秒。按 ADR 0010，运行时、语言目录和字体就绪之前页面是空的，所以白屏多久就是冷启动用了多久。审查找到两处让冷启动依赖网络的问题：

1. **字体缓存从未写入。** `sw.js` v10 的 `cacheFirst` 在 `caches.open()` 的回调里才调用 `response.clone()`，那时响应已交给页面、响应体已被占用，克隆抛错并被吞掉。审查在线上 Chromium 与 WebKit 里看到 `fonts-v10` 为 0 条；`apps/terminal/tests/browser/sw-release-switch-probe.mjs` 对 v10 的代码（只把缓存名改成 v11）在本机 Chromium 与 WebKit 里复现了同样的结果。启动闸门等字体，最多 3 秒（`lib/fonts/font-readiness.ts`）。
2. **每次发布后，冷启动要在空白期重新下载几乎整个启动闭包。** v10 只处理导航、字体和币种图标，`/assets/*` 不经它，只靠浏览器的 HTTP 缓存。构建的分块有哈希级联（名为 `vendor-tanstack-router` 的块装着应用入口与共享代码，第三方库的块静态导入它），审查统计任何改动都会让 117 个预加载块里约 111 个改名，约 1.5 MB gzip。发布后第二次启动用新壳，在空白期从网络取回这些块。iOS 是否保留主屏幕应用的 HTTP 缓存也不确定。

官方终端用 Workbox 预缓存整站（约 468 项）规避了第二个问题。

## 目标与约束

- 发布后的冷启动尽量不在空白期等启动闭包的网络下载。
- 字体缓存真正生效。
- 壳的更新与线上 v10 完全一致：每次导航拿到可缓存的壳就写入，不新增任何让设备停在旧版本的路径。旁路清单、`?lang=` 的网络优先、壳的可缓存判定（200、未重定向、`text/html`）、图标的 stale-while-revalidate、`skipWaiting` 与 `clients.claim`、退役缓存的清理照旧。
- 资源缓存的任何失败（网络、存储、超时）只让缓存少一些条目，不影响当前请求，也不影响换壳。
- 缓存不随发布无限增长。
- 不改分块策略、启动闸门、`client.ts`、`__root.tsx`、manifest，也不加任何启动期界面内容。

## 决策

1. **缓存版本升到 v11，新增 `assets-v11`。** 退役清理的识别规则加入 `assets-` 前缀，激活时删除 `shell-v10`、`fonts-v10`、`icons-v10` 和其他版本的 `assets-*`。
2. **字体在交出响应之前同步克隆。** `cacheFirst` 先 `clone()`，再把副本写入缓存（`event.waitUntil`），写入失败被吞掉。图标的 stale-while-revalidate 有同类时机问题（`await cache` 之后才克隆），一并改为在回调开头同步克隆。
3. **`/assets/` 走缓存优先。** 范围与 `deploy/cloudfront/deploy.mjs` 的 `objectCacheControl` 判为 immutable 的 `assets/` 一致：同源 GET、路径以 `/assets/` 开头、没有查询串、不是 `.br`/`.gz`/`.zst`，且不带 `Range`。命中（`ignoreVary`，文件名带内容哈希）直接回答；未命中就 `fetch(request)`，响应合格就克隆一份在后台写入，原响应交给页面。合格指：200、未重定向、`Cache-Control` 不含 `no-store`，并且内容类型与扩展名相符——`.js`/`.mjs` 必须是 HTML 规范列出的 JavaScript MIME 类型之一（`application/ecmascript`、`application/javascript`、`application/x-ecmascript`、`application/x-javascript`、`text/ecmascript`、`text/javascript`、`text/javascript1.0` 到 `1.5`、`text/jscript`、`text/livescript`、`text/x-ecmascript`、`text/x-javascript`，不区分大小写，参数忽略），`.css` 必须是 `text/css`，其余扩展名只排除 `text/html`。用完整清单是因为上传机器的环境不同，`aws s3` 推断出的类型可能不是最常见的两种，浏览器照常执行而我们却拒绝缓存是不对的。构建产物的 `/assets/` 里只有 `.js`、`.css` 与 `.woff2`；协调方 2026-11-12 核对线上：`.js` 返回 `text/javascript`、`.css` 返回 `text/css`、`.woff2` 返回 `font/woff2`，都是 `immutable`、不带 `no-store`。
4. **TradingView 的哈希文件不纳入。** `charting_library/bundles/*` 与带哈希的加载器副本同样是 immutable，但它们体积大、只在 TradingView 升级时改名、由图表 iframe 在工作区显示之后才请求，不在空白期的关键路径上；`chart-asset-cache-policy.test.ts` 也要求 Service Worker 不拦截图表请求。它们继续靠 HTTP 缓存。
5. **壳的读写回到 v10，只多一个钩子。** `navigationStaleWhileRevalidate` 与 `navigationNetworkFirst` 每次拿到可缓存的壳都写入，没有编号、没有提交队列、没有「壳相同就跳过」。钩子：写入之前读出原来缓存壳的正文（读失败当作没有），写入之后，如果原来有缓存壳且正文不同，就排入一次资源刷新；读原壳、解析或刷新的任何失败都不影响写入。
6. **资源刷新是尽力而为的后台工作。**
   - 刷新串行执行（一条 Promise 链），同一时刻只有一个在跑。模块变量记住最近写入的壳正文；排到的刷新如果不是最新壳，直接跳过。
   - 一次刷新先淘汰：`assets-v11` 只保留新壳与原壳引用的资源，其余删除。再预取：新壳引用而缓存里还没有的资源，并发 6 个，用自己的 `fetch(href, { credentials: "same-origin", signal })`，合格（同第 3 条）才写入，任何失败都忽略。
   - 壳引用的资源：`<link rel="modulepreload|preload|stylesheet">` 的 `href`、`<script src>`，以及 `scripts/inject-shell-preloads.mjs` 写入的 `sairn-preload-desktop` 与 `sairn-preload-mobile` 两个 `<meta>` 列表，只取同源 `/assets/` 下的文件。解析用一个小型顺序扫描：遇到 `<!--` 跳到 `-->`；遇到 `<script`、`<link`、`<meta` 读完这个标签（属性值引号里的 `>` 不算结束）；`<script …>` 之后跳到对应的 `</script`（不分大小写）。注释里或内联脚本正文里的标签字样不算。
   - 整次刷新用一个 `AbortController` 与一个 60 秒定时器封顶，结束时清定时器并中止仍未完成的请求；每个 `await` 之后、发起下一个请求之前检查是否已中止。超时后 Promise 链照样往下走。
   - 首次接管（没有原壳）不刷新：页面自己的加载经第 3 条存进去。`?lang=` 的网络优先导航只淘汰、不预取：页面正拿着新壳自己加载同一批资源。
   - 壳没有变化的导航不碰资源缓存。
7. **不做整站预缓存。** 只缓存壳实际引用的启动资源和用到过的不可变资源。
8. **CSP 与部署不需要改。** 预取是同源请求，`connect-src 'self'` 已允许；`sw.js` 仍以 `no-store` 上传（`deploy.mjs` 的 `NO_STORE_FILES`），注册时 `updateViaCache: "none"`。

## 考虑过而未采用的方案

| 方案 | 取舍 |
| --- | --- |
| 先存后换：新壳引用的启动资源全部存好，才替换缓存壳（本 ADR 最初的决定） | 它保证新版本第一次冷启动时资源都在本机，但为此引入了候选任务、提交队列、编号、提交时限、三种失败分类和淘汰时机，以及线上 v10 没有的「设备停在旧版本」故障面。两轮对抗审查（7.0、7.5）找到的问题几乎都是这些状态的并发交错：存储写满时不换壳也不淘汰而永久停在旧壳；超时后恢复的旧写入覆盖新壳；「壳相同直接返回」绕过编号；任务停止后挂起的查询恢复并启动无人清理的下载；按正文去重吞掉 CSP 不同的响应；预取前的淘汰删掉旧页面仍要用的懒加载块；先剥注释吞掉 `<script>const s="<!--";</script>` 之后的真实标签。每修一轮就多一批新的交错，所以否决这个设计本身。未采用 |
| 官方的整站预缓存（Workbox，约 468 项） | 首次安装就下载全部路由、对话框和语言目录，大部分用户用不到；首屏调研把它列为「不能复制」，理由是首次安装成本高。本方案只取壳引用的启动闭包，范围更窄。未采用 |
| 只做 `/assets/` 缓存优先，不在后台预取 | 新壳的资源要在第一次用新壳启动时从网络取回，正是白屏的来源。未采用 |
| 换壳后由页面预取下一版资源 | 页面不知道下一版是什么；Service Worker 拿到新壳时已经有完整清单。未采用 |
| 按条目数或字节上限、按最久未用淘汰 | Cache API 没有访问时间，要自己维护元数据；按插入顺序会淘汰当前壳的启动块。按「新壳与原壳」淘汰与发布节奏一致。未采用 |
| 把 TradingView 的哈希文件也纳入 | 体积大、不在空白期的关键路径上，且现有契约要求不拦截图表请求。未采用（见决策 4） |
| 修分块的哈希级联 | 能减少每次发布改名的块数，但属于构建策略，不在本次范围。列为后续 |

## 后果与边界

- 换壳的时机与 v10 相同：发布后第一次启动仍是旧版本，那次导航把新壳存下；下一次启动就是新版本。资源能否取回、能否存入、是否超时都不影响这一点。
- 代价：预取没跑完应用就被关掉（浏览器，尤其是 iOS，可能很快终止后台的 Service Worker）、或某个资源取不回时，下一次冷启动要从网络补齐剩下的资源，那一次的白屏仍随网络变长。补齐的资源经缓存优先存进去。
- 每次发布后，已安装用户在后台多下载新壳的启动闭包（约 1.5 MB gzip；缓存存的是解码后的响应体，占用更大）。手机端也会预取 `sairn-preload-desktop` 里只有桌面用的块，因为 Service Worker 不知道设备布局。
- 首次安装后的第一次启动仍走网络；v10 升级到 v11 时也一样，因为 v10 的缓存被清理、`assets-v11` 是空的。
- 资源缓存的规模：一次刷新（成功或失败）之后，只剩新壳与原壳引用的资源，加上之后页面按需加载存入的分块；后者在下一次壳变化时回收。正在运行的旧版本页面这时再懒加载它的分块，会从网络取，不出错（`deploy.mjs` 从不删除 S3 上的旧资源）。
- 较晚导航的结果按到达顺序覆盖缓存壳，这是 v10 的既有语义，本次不新增保证。
- 只读壳里的链接，不解析 JavaScript：运行时动态加载、又不在壳的预加载与两个 `<meta>` 列表里的块，仍在第一次用到时从网络取回并写入缓存。
- 内容类型检查挡住了「200 但内容是错误文本」的 `.js`/`.css`，但一个类型正确、内容错误的文件仍会被存下并一直命中，因为文件名带哈希、不会再请求。启动失败时清掉资源缓存的自救通道本次不做（见后续）。

## 过程

1. 第一版（提交 `7b2554ac`）：先存后换。
2. 第二版（提交 `d8fde5d5`）：复核与 Codex 对抗审查（7.0）之后，给先存后换加了存储失败的逃生口、下载中止、提交时限、候选前淘汰、内容类型检查和解析修正。同一轮发现第一版的「与 deploy 范围一致」测试留下 4 个未处理拒绝，使 Vitest 以退出码 1 结束，第一版报告只引用了通过数。
3. 第三版（本决定）：复审（7.5）又找到 1 项 P1、5 项 P2、1 项 P3，几乎全是上面那些状态的并发交错。协调方裁定问题在设计本身，改为本决定：壳回到 v10 语义，资源刷新只是后台的尽力而为。

## 验证

- 单测（Vitest，在 `node:vm` 里加载真实的 `public/sw.js`，模拟 `fetch` 事件与 Cache Storage）：`apps/terminal/src/lib/tests/sw-asset-cache.test.ts`。`sw-navigation-cache.test.ts`（v10 的导航行为）与 `origin/dev` 相比只改了缓存名，原样通过。需要成立的不变式与钉住它的测试：
  - 新壳在取回它的那次导航里被存下：「stores the new shell on the navigation that fetched it when …」（资源取不回、资源缓存拒绝写入、原壳读不出三种情况）与「stores the new shell before the asset refresh, even when the refresh never finishes」。
  - 队列排空之后最新壳的资源都在缓存里，之后的淘汰不删它们：「leaves every asset of the latest shell in the cache, and no later refresh removes them」。
  - 失败的预取不留下挂起的东西：「stops after the time limit without leaving a timer, a request or a later request behind」与「clears its timer when it finishes in time」。
  - 资源缓存的规模：「keeps only the assets of the new and the previous shell, then what the page loads later」与「removes what a failed refresh left behind at the next shell change」。
  - 壳未变化的导航不碰资源缓存：「does not touch the asset cache when the shell is unchanged」。
  - 其余：刷新串行且跳过过期的（「skips a queued refresh whose shell has been replaced, and runs one refresh at a time」）、并发 6、首次接管不刷新、`?lang=` 只淘汰、合格判定的每一条、扫描器的七种写法与 `inject-shell-preloads.mjs` 的真实输出。
- 变异：26 个单项变异，逐个打上、跑测试、还原，全部有测试变红，包括壳只在资源齐了才写入、去掉淘汰、淘汰不保留原壳、首次接管也预取、`?lang=` 也预取、不跳过过期的刷新、刷新不串行、不清 60 秒定时器、中止后仍发起请求、`no-store`/JS 类型/CSS 类型/重定向各条、缓存优先时不克隆直接写入原响应、扫描器不跳过注释、不跳过脚本正文、读原壳失败时阻止写壳。
- 浏览器探针：`apps/terminal/tests/browser/sw-release-switch-probe.mjs` 在 Chromium 与 WebKit（Playwright）里运行真实的 `sw.js`，对一个本地服务轮换四个合成版本：部署新版本后那次导航仍由旧壳回答，同时新壳被存下、资源在后台存入；之后 `/assets/` 全部 503 时新开页面能启动新版本，服务器收不到资源请求；有一个资源取不回时新壳照样被存下，下一次新开页面启动新版本、只从网络取缺的那个；再下一次壳变化时，更早版本的资源被回收；`/assets/` 之外的字体写进字体缓存。2026-11-12 本机两种引擎全部通过；用 `origin/dev` 的 `sw.js`（缓存名改为 v11）运行时，两种引擎在第一步就失败（资源缓存与字体缓存都是空的）。合成版本只有两个文件，不是终端本身。
- 没有验证的：没有对真实构建的连续两个版本做端到端验证；没有 iPhone 真机验证。需要运营方在主屏幕应用上连续发布两个版本后各冷启动一次，确认第二个版本生效那次启动的白屏不再随网络变长。

## 后续

- 分块的哈希级联（`apps/terminal/vite.config.ts` 的 `manualChunks` 把入口与共享代码放进 `vendor-tanstack-router`）：拆开后每次发布改名的块会少很多，后台预取的量随之下降。
- 如果真机确认 iOS 在页面离开后很快终止 Service Worker、导致预取总是跑不完，再考虑在页面可见时由页面触发一次补齐（例如 `postMessage`），本次不做。
- 自救通道：启动失败（入口模块或启动块加载出错）时清掉 `assets-v11` 并从网络重试一次，处理「类型正确、内容错误」的缓存条目。它与「入口脚本加载失败的兜底页」那项后续工作相关，应一起设计，本次不做。
