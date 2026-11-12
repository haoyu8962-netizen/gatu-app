# ADR 0051：Service Worker 缓存启动资源，写壳路径保持 v10

- 状态：已接受并实施（2026-11-12）。分支 `claude/fix-sw-asset-cache`，未合入 `dev`、未发布。核心决定在同一天经过多次替换：最初的「先存后换」被否决，见「考虑过而未采用的方案」与「过程」。没有对真实构建的连续两个版本做端到端验证，也没有 iPhone 真机验证。
- 关联：[ADR 0005](0005-spa-static-shell.md)（静态 SPA 壳）；[ADR 0006](0006-startup-preloads-and-edge-caching.md) 第 10 条（热访问由 Service Worker 回答导航）；[ADR 0010](0010-blank-until-ready-startup.md)（空白到就绪的启动）；[ADR 0020](0020-legal-pages-in-app-shell.md)（Service Worker v10）；[运行时守则](../runtime-guardrails.md) §8；[CloudFront 部署](../../deploy/cloudfront/README.md)；[首屏加载调研](../architecture/hyperliquid-first-load-investigation.md)；审查记录 `docs/work-memory/sessions/2026-11-12-global-defect-review.md`（提交 `9395acca`，P1-6 与 P3 字体缓存）。

## 背景

运营方在 iPhone 上把终端添加到主屏幕，隔一段时间再打开，先白屏约 5 秒。按 ADR 0010，运行时、语言目录和字体就绪之前页面是空的，所以白屏多久就是冷启动用了多久。审查找到两处让冷启动依赖网络的问题：

1. **字体缓存从未写入。** `sw.js` v10 的 `cacheFirst` 在 `caches.open()` 的回调里才调用 `response.clone()`，那时响应已交给页面、响应体已被占用，克隆抛错并被吞掉。审查在线上 Chromium 与 WebKit 里看到 `fonts-v10` 为 0 条；`apps/terminal/tests/browser/sw-release-switch-probe.mjs` 对 v10 的代码（只把缓存名改成 v11）在本机 Chromium 与 WebKit 里复现了同样的结果。启动闸门等字体，最多 3 秒（`lib/fonts/font-readiness.ts`）。
2. **每次发布后，冷启动要在空白期重新下载几乎整个启动闭包。** v10 只处理导航、字体和币种图标，`/assets/*` 不经它，只靠浏览器的 HTTP 缓存。构建的分块有哈希级联（名为 `vendor-tanstack-router` 的块装着应用入口与共享代码，第三方库的块静态导入它），审查统计任何改动都会让 117 个预加载块里约 111 个改名，约 1.5 MB gzip。发布后第二次启动用新壳，在空白期从网络取回这些块。iOS 是否保留主屏幕应用的 HTTP 缓存也不确定。

官方终端用 Workbox 预缓存整站（约 468 项）规避了第二个问题。

## 目标与约束

- 发布后的冷启动尽量不在空白期等启动闭包的网络下载。
- 字体缓存真正生效。
- 写壳路径与 v10 相同：每次导航拿到可缓存的壳就写入，写入之前没有任何额外的等待，不新增让设备停在旧版本的路径；唯一的差别是写入因配额失败时多一次清理后重试。旁路清单、`?lang=` 的网络优先、壳的可缓存判定（200、未重定向、`text/html`）、图标的 stale-while-revalidate、`skipWaiting` 与 `clients.claim`、退役缓存的清理照旧。
- 资源缓存的任何失败（网络、存储、超时）只让缓存少一些条目，不影响当前请求，也不影响写壳。
- 只缓存源站声明不可变的资源；缓存不随发布无限增长。
- 不改分块策略、启动闸门、`client.ts`、`__root.tsx`、manifest，也不加任何启动期界面内容。

## 决策

1. **缓存版本升到 v11，新增 `assets-v11`。** 退役清理的识别规则加入 `assets-` 前缀，激活时删除 `shell-v10`、`fonts-v10`、`icons-v10` 和其他版本的 `assets-*`。
2. **字体在交出响应之前同步克隆。** `cacheFirst` 先 `clone()`，再把副本写入缓存（`event.waitUntil`），写入失败被吞掉。图标的 stale-while-revalidate 有同类时机问题（`await cache` 之后才克隆），一并改为在回调开头同步克隆。
3. **`/assets/` 走缓存优先。** 范围与 `deploy/cloudfront/deploy.mjs` 的 `objectCacheControl` 判为 immutable 的 `assets/` 一致：同源 GET、路径以 `/assets/` 开头、没有查询串、不是 `.br`/`.gz`/`.zst`，且不带 `Range`。命中（`ignoreVary`，文件名带内容哈希）直接回答。缓存查询（打开加匹配）整体限时 1.5 秒（`ASSET_LOOKUP_TIMEOUT_MS`），超时当作未命中、直接走网络，这一次不写缓存：v10 不拦截这些请求，存储挂住不能让入口脚本等下去。请求的 `cache` 为 `reload`、`no-cache` 或 `no-store` 时先发起网络请求、不等缓存，拿到合格响应后再尽力写入（覆盖原条目）。未命中时把页面自己的 `Request` 交给 `fetch`，响应合格就克隆一份在后台写入，原响应交给页面。合格指：
   - 200、未重定向；
   - `Cache-Control` 含 `immutable`，且不含 `no-store` 与 `no-cache`（指令按逗号拆开比较，不分大小写、不依赖顺序）：只存源站自己声明不可变的响应，错误页或缺少该头的响应都不存。部署若去掉 `/assets/` 的 `immutable`，只阻止新的写入，已经存下的条目照旧命中；要让已有条目失效，得升 `CACHE_VERSION`；
   - 内容类型与扩展名相符：`.js`/`.mjs` 必须是 HTML 规范列出的 JavaScript MIME 类型之一（`application/ecmascript`、`application/javascript`、`application/x-ecmascript`、`application/x-javascript`、`text/ecmascript`、`text/javascript`、`text/javascript1.0` 到 `1.5`、`text/jscript`、`text/livescript`、`text/x-ecmascript`、`text/x-javascript`，不区分大小写，参数忽略），`.css` 必须是 `text/css`，其余扩展名只排除 `text/html`。用完整清单是因为上传机器的环境不同，`aws s3` 推断出的类型可能不是最常见的两种。

   协调方 2026-11-12 核对线上：`.js`、`.css`、`.woff2` 分别返回 `text/javascript`、`text/css`、`font/woff2`，都是 `public, max-age=31536000, immutable`、不带 `no-store`。
4. **TradingView 的哈希文件不纳入。** `charting_library/bundles/*` 与带哈希的加载器副本同样是 immutable，但它们体积大、只在 TradingView 升级时改名、由图表 iframe 在工作区显示之后才请求，不在空白期的关键路径上；`chart-asset-cache-policy.test.ts` 也要求 Service Worker 不拦截图表请求。它们继续靠 HTTP 缓存。
5. **写壳路径与 v10 逐行一致，只在 `put` 之后接两件事。** `navigationStaleWhileRevalidate` 与 `navigationNetworkFirst` 对壳的克隆与 `put` 与 v10 相同，写入之前不读任何东西。在发起第一次 `put` 之前同步多克隆一份备用。`put` 成功后计数并排入一次资源对账。`put` 因配额失败（`QuotaExceededError`）时：记下当时的成功写壳计数，把资源缓存整个删掉（下面的清单随之消失），如果计数在这期间没有变化（没有别的壳成功写入），再用备用副本重试一次 `put`，成功后同样计数并排入对账；资源缓存可以重建，而且与壳共用站点的存储配额，它不能成为更新壳的障碍。其它失败（例如正文中途断流）完全按 v10 处理：吞掉，不清理、不重试、不对账，因为重试用的备用副本来自同一条出错的流。
6. **资源对账：以缓存里实际的壳为唯一依据，幂等、可续做。** 串行执行（一条 Promise 链），所有失败都忽略。60 秒时限只中止对账自己的网络请求（`AbortController`，定时器在结束时清掉），不提前放行队列：对账里的 Cache API 操作一律等它们自己结束，所以较早对账迟到的 `delete` 不会落在后一次对账之后。代价：某个 Cache API 操作永远不返回时，这个 Worker 生命周期内之后的对账都不会运行（写壳不受影响）。
   1. 读出此刻缓存里的壳；没有就结束。`wanted` 为它引用的资源。
   2. 读资源清单：存在资源缓存**自己**里、键为 `asset-manifest-v11` 的 JSON 条目（在 `/assets/` 之外，缓存优先的路由不会匹配它，淘汰时显式保留）。它记录「这份资源缓存上一次对账到的壳的启动资源」。清单与资源同生同灭：资源缓存被删（启动失败页的重新加载、写壳的配额重试），清单跟着没有；对账进行中资源缓存被删时，在途对账写进的是已脱离名字映射的旧缓存对象，清单也随之消失，不会出现「清单在、资源缓存不在」。清单与 `wanted` 相同就结束，不列出、不删除、不请求。
   3. 没有清单（首次接管，或资源缓存刚被删过）：把 `wanted` 写成清单，结束，不预取。这时清单只是「第一次看到的列表」，那一次的资源由页面自己的加载经缓存优先存入；另一个布局（`sairn-preload-desktop` 与 `-mobile`）的列表不保证在缓存里。
   4. 否则取 `keys()`，**拿到之后**重新读一次缓存里的壳与清单，用这时的 `wanted ∪ 清单` 作为保留集，删掉其余条目；再预取 `wanted` 里缓存没有的资源（并发 6；每个 `await` 之后、发起请求之前检查是否已中止）。
   5. 只有第 4 步完整做完、`wanted` 的每一项都确实在缓存里，才把清单更新为 `wanted`。中途超时、被终止或有资源取不回，清单保持旧值，下一次导航的对账从头再做一遍（已存的跳过）。

   `?lang=` 的导航也照常对账并预取：对账逐个先查缓存，与页面自己的加载至多重复少量在途请求。因为依据是运行时读到的缓存壳，较早的对账即使删掉了较新壳的资源，较新的壳写入后排入的那次对账也会补回。
7. **壳的资源清单用小型顺序扫描读出。** 读 `<link rel="modulepreload|preload|stylesheet">` 的 `href`、`<script src>`，以及 `scripts/inject-shell-preloads.mjs` 写入的 `sairn-preload-desktop` 与 `sairn-preload-mobile` 两个 `<meta>` 列表，只取同源 `/assets/` 下的文件。任何标签（`<` 后跟字母或 `/`）都先按引号感知的方式读完整个标签再判断标签名，所以别的标签属性值里的 `<script …>` 不算；`<!--` 跳到 `-->` 或 `--!>`，`<!-->` 与 `<!--->` 按 HTML 规范当作空注释立即结束；`<script …>` 之后跳到下一个 `</script`，且其后必须是空白、`/` 或 `>`；同一标签重复的属性取第一个。扫描器只保证读全 `scripts/inject-shell-preloads.mjs` 生成的形式；`<noscript>`、CDATA、属性值里的字符引用（如 `&#46;`）不做处理，例如 `<noscript><script src="/assets/fake.js"></noscript><script src="/assets/real.js"></script>` 会只读到 fake、漏掉 real。读错的后果是预取不全或多取，不影响写壳。
8. **启动失败页的重新加载先清资源缓存。** `lib/bootstrap-error-page.ts` 的重新加载按钮在 `location.reload()` 之前尽力删除名字以 `assets-` 开头的 Cache Storage（最多等 1 秒，失败照样重新加载）。这个页面由入口 `client.ts` 静态导入，不依赖可能加载失败的那批分块。
9. **不做整站预缓存。** 只缓存壳实际引用的启动资源和用到过的不可变资源。
10. **CSP 与部署不需要改。** 预取是同源请求，`connect-src 'self'` 已允许；`sw.js` 仍以 `no-store` 上传（`deploy.mjs` 的 `NO_STORE_FILES`），注册时 `updateViaCache: "none"`。

## 考虑过而未采用的方案

| 方案 | 取舍 |
| --- | --- |
| 先存后换：新壳引用的启动资源全部存好，才替换缓存壳（本 ADR 最初的决定） | 它保证新版本第一次冷启动时资源都在本机，但为此引入了候选任务、提交队列、编号、提交时限、三种失败分类和淘汰时机，以及线上 v10 没有的「设备停在旧版本」故障面。两轮对抗审查（7.0、7.5）找到的问题几乎都是这些状态的并发交错：存储写满时不换壳也不淘汰而永久停在旧壳；超时后恢复的旧写入覆盖新壳；「壳相同直接返回」绕过编号；任务停止后挂起的查询恢复并启动无人清理的下载；按正文去重吞掉 CSP 不同的响应；预取前的淘汰删掉旧页面仍要用的懒加载块；先剥注释吞掉 `<script>const s="<!--";</script>` 之后的真实标签。每修一轮就多一批新的交错，所以否决这个设计本身。未采用 |
| 写壳前读旧壳、按读到的新旧正文排入刷新（第三版） | 写壳之前多了一次等待：读不结束则新壳永远不写，读得慢则两次导航的写入顺序可能颠倒；写壳失败时淘汰根本不启动，资源缓存写满配额后设备停在旧壳；刷新依据的是各次读取的完成顺序，可能删掉最新壳的资源且不补回。改为写壳后以缓存里的壳为依据对账。未采用 |
| 官方的整站预缓存（Workbox，约 468 项） | 首次安装就下载全部路由、对话框和语言目录，大部分用户用不到；首屏调研把它列为「不能复制」，理由是首次安装成本高。本方案只取壳引用的启动闭包，范围更窄。未采用 |
| 只做 `/assets/` 缓存优先，不在后台预取 | 新壳的资源要在第一次用新壳启动时从网络取回，正是白屏的来源。未采用 |
| 按条目数或字节上限、按最久未用淘汰 | Cache API 没有访问时间，要自己维护元数据；按插入顺序会淘汰当前壳的启动块。按「新壳与上一次完整对账的壳」淘汰与发布节奏一致。未采用 |
| 把 TradingView 的哈希文件也纳入 | 体积大、不在空白期的关键路径上，且现有契约要求不拦截图表请求。未采用（见决策 4） |
| 修分块的哈希级联 | 能减少每次发布改名的块数，但属于构建策略，不在本次范围。列为后续 |

## 后果与边界

- 写壳路径与 v10 相同，写入因配额失败时多一次清理资源缓存后的重试（期间有别的壳成功写入就不重试）：发布后第一次启动仍是旧版本，那次导航把新壳存下，下一次启动就是新版本。资源能否取回、能否存入、是否超时都不影响这一点。较晚导航的结果按写入完成的顺序覆盖缓存壳，这是 v10 的既有语义，本次不新增保证。
- 网络正常、没有超时、Service Worker 没被终止、存储可写时，一次对账结束后最新壳引用的资源都在缓存里，之后的对账不会删它们。代价：预取没跑完应用就被关掉（浏览器，尤其是 iOS，可能很快终止后台的 Service Worker）、或某个资源取不回时，下一次冷启动要从网络补齐剩下的资源，那一次的白屏仍随网络变长；之后的导航会续做对账。
- 资源缓存的规模：一次对账完整结束时，只剩新壳与上一次完整对账的壳引用的资源，加上之后页面按需加载存入的分块；后者在下一次壳变化时回收。对账没做完时，清单不动，下一次对账继续按「新壳 ∪ 清单」保留。正在运行的旧版本页面这时再懒加载它的分块，会从网络取，不出错（`deploy.mjs` 从不删除 S3 上的旧资源）。
- 60 秒时限只中止对账自己发起的网络请求；对账里的 Cache API 操作（`put`、`delete`、`keys`）不能被取消，对账会等它们结束再放行下一次。某个 Cache API 操作永远不返回时，这个 Worker 生命周期内之后的对账都停住（写壳不受影响，Worker 重启后恢复）。
- 资源请求的缓存查询最多等 1.5 秒；存储一直挂住时，资源照常从网络取，但这期间不会写入缓存。
- 每次发布后，已安装用户在后台多下载新壳的启动闭包（约 1.5 MB gzip；缓存存的是解码后的响应体，占用更大）。手机端也会预取 `sairn-preload-desktop` 里只有桌面用的块，因为 Service Worker 不知道设备布局。
- v10 升级到 v11：新的 Service Worker 激活时删除 `shell-v10`，在 v11 存下第一份壳之前没有离线回退；首次接管只记清单、不预取，第一次冷启动的资源走网络或 HTTP 缓存。首次安装后的第一次启动同样走网络。
- 只读壳里的链接，不解析 JavaScript：运行时动态加载、又不在壳的预加载与两个 `<meta>` 列表里的块，仍在第一次用到时从网络取回并写入缓存。
- 部署去掉 `/assets/` 的 `immutable` 只阻止新的写入，已存条目照旧命中，直到升 `CACHE_VERSION`。
- 内容类型与 `immutable` 检查挡住了「200 但内容是错误文本」的常见情况，但一个类型正确、声明不可变、内容却错误的文件仍会被存下并一直命中。分块加载失败、入口还能运行时，启动失败页的重新加载会先清资源缓存（决策 8）；入口脚本本身被污染时页面是一片空白，没有自救路径（见后续）。

## 过程

1. 第一版（提交 `7b2554ac`）：先存后换。
2. 第二版（提交 `d8fde5d5`）：复核与 Codex 对抗审查（7.0）之后，给先存后换加了存储失败的逃生口、下载中止、提交时限、候选前淘汰、内容类型检查和解析修正。同一轮发现第一版的「与 deploy 范围一致」测试留下 4 个未处理拒绝，使 Vitest 以退出码 1 结束，第一版报告只引用了通过数。
3. 第三版（提交 `c9d37713`）：复审（7.5）又找到 1 项 P1、5 项 P2、1 项 P3，几乎全是并发交错。协调方裁定问题在设计本身，改为写壳回到 v10、资源刷新只是后台的尽力而为。
4. 第四版：审查（7.5）指出第三版相对 v10 的两项回归——写壳前多读一次旧壳，以及写壳失败时淘汰不启动造成的配额闭环——和对账依据读取完成顺序、`no-cache` 错误内容被固定缓存、扫描器多读漏读。改为写壳路径与 v10 逐行一致，资源整理完全放到写壳之后，以缓存里实际的壳和资源清单做幂等对账（提交 `e7f32c07`）。
5. 第五版（本决定）：审查（8.0）第一次没有 P0/P1，剩下的是边界收紧：配额重试可能覆盖期间写入的更新的壳、任何写壳失败都清空资源缓存、资源请求多了没有时限的存储等待、清单与资源缓存分开存放会谎报「已完成」、时限提前放行队列让迟到的 `delete` 落在后一次对账之后、`immutable, no-cache` 被判为可存、扫描器的 `--!>` 与重复属性。逐项按上文决策收紧。

## 验证

- 单测（Vitest，在 `node:vm` 里加载真实的 `public/sw.js`，模拟 `fetch` 事件与 Cache Storage；缓存替身真的读取响应正文，并有「共享字节配额」与「`keys()` 可控延迟」两种模式）：`apps/terminal/src/lib/tests/sw-asset-cache.test.ts`。`sw-navigation-cache.test.ts`（v10 的导航行为）与 `origin/dev` 相比只有两处差别：缓存名，以及替身的 `put` 改为真的读取响应正文。它的替身不提供 `AbortController`，对账在其中抛错并被吞掉，导航断言照常通过，这也说明对账失败不影响写壳。不变式与钉住它的测试：
  - 写壳路径与 v10 相同：「stores the new shell on the navigation that fetched it when …」（资源取不回、资源缓存拒绝写入）、「writes the shell fetched for … without waiting for any read of the shell cache」（普通导航与 `?lang=` 各一条）、「stores the new shell before the asset sync, even when the sync never finishes」。
  - 写壳因配额失败时清理后重试：「empties the asset cache and stores the shell when the origin's quota is full」（共享配额）、「stores the shell on the retry with its full body after a failed write」；期间有别的壳写入时不重试：「does not retry a failed write when another shell was stored while the asset cache was being emptied」；其它失败按 v10：「handles a write that fails for any other reason exactly as v10: no cleanup and no retry」。
  - 对账完整结束后最新壳的资源都在缓存里，之后的对账不删它们：「leaves every asset of the latest shell in the cache after a complete sync, and no later sync removes them」。
  - 续做与回收：「continues an incomplete sync on the next navigation」、「removes what incomplete syncs left behind at the next shell change」、「keeps only the assets of the new and the previous shell, then what the page loads later」。
  - 依据是缓存里的壳：「reconciles with the shell in the cache when a newer shell arrives while a sync waits for the cache keys」。
  - 失败的预取不留下挂起的东西：「stops after the time limit without leaving a timer, a request or a later request behind」、「clears its timer when it finishes in time」。
  - 壳未变化时不列出、不删除、不请求：「does not list, delete or fetch anything when the recorded assets match the shell」；首次接管只记清单：「records the assets on first takeover without fetching them」。
  - 清单与资源缓存同生同灭：「starts again after the asset cache was deleted on its own, since the manifest went with it」、「leaves no manifest behind when the asset cache is deleted while a sync runs」。
  - 时限不提前放行队列：「lets no delete of an earlier sync land after the next sync has started」。
  - 资源请求不被存储卡住：「answers from the network when the cache lookup does not settle in time, and writes nothing」、「sends a reload request to the network without waiting for the cache」；`no-cors` 请求照常命中：「answers a no-cors request for a stored asset from the cache」。
  - 其余：串行、并发 6、`?lang=` 也预取、合格判定的每一条（包括 `immutable`、`no-cache` 与混合指令、大小写与顺序变化的 `no-store`、201、重定向、16 种 JavaScript 类型）、`reload`/`no-cache`/`no-store` 请求不读缓存、传给 `fetch` 的是页面自己的 `Request`、扫描器的十四种写法（含 `--!>` 与重复属性）与 `inject-shell-preloads.mjs` 的真实输出。
  - `bootstrap-error-page.test.ts`：重新加载前只删 `assets-*` 缓存；Cache Storage 抛错、不存在或不回答时照样重新加载。
- 变异：第五版共 51 个单项变异，逐个打上、跑测试、还原，全部有测试变红。本版新增的有：重试前不查写壳计数、非配额失败也清理重试、首次写成功不计数、缓存查询不设时限、`reload` 先等缓存、查询超时仍写缓存、清单放回壳缓存、淘汰不保留清单、时限到就放行队列、`no-cache` 可存、`no-store` 只认精确字符串、路由排除 `no-cors`、`no-cors` 当作 `reload`、不认 `--!>`、重复属性取最后一个。「时限到就放行队列」第一次没被抓到：测试里拦住删除的闸门同时拦住了后一次对账的删除，改成只拦一次后变红。第四版的 38 个也都保留，包括写失败不清资源缓存、清了但不重试、重试用已被消费的响应、对账在写壳之前排入、写壳前先读旧壳、保留集在 `keys()` 之前计算、清单在预取完成之前更新、首次接管也预取、清单相同仍打开资源缓存、不核对就更新清单、对账不串行、不清定时器、中止后仍发请求、不要求 `immutable`、`reload` 仍读缓存、`fetch(request.url)`、接受 201、扫描器不跳过其它标签的属性、`<!-->`/`<!--->` 不结束注释、`</scriptx` 当作结束、`<scriptx>` 当作 script。
- 浏览器探针：`apps/terminal/tests/browser/sw-release-switch-probe.mjs` 在 Chromium 与 WebKit（Playwright）里运行真实的 `sw.js`，对一个本地服务轮换六个合成版本：部署新版本后那次导航仍由旧壳回答，同时新壳被存下、资源在后台存入；之后 `/assets/` 全部 503 时新开页面能启动新版本，服务器收不到资源请求；有一个资源取不回时新壳照样被存下，下一次新开页面启动新版本、只从网络取缺的那个；再下一次壳变化时更早版本的资源被回收；带 `Cache-Control: no-cache` 的资源不被存下；在页面里删掉 `assets-*` 缓存（与启动失败页的重新加载做的一样）后清单随之消失，下一次在新页面里导航时重新记下当前壳、页面自己的加载把资源存回去（用同一页面 `reload()` 时两种引擎都没有把资源存回，原因没有查）；`/assets/` 之外的字体写进字体缓存。只在 Chromium 上：对账进行到一半用 DevTools 协议的 `ServiceWorker.stopAllWorkers` 终止 Service Worker，清单停在旧值，下一次导航由新的 Worker 实例续做、不重取已存的文件；Playwright 没有终止 WebKit Service Worker 的办法，这一步在 WebKit 上跳过。2026-11-12 本机两种引擎全部通过；用 `origin/dev` 的 `sw.js`（缓存名改为 v11）运行时，两种引擎在第一步就失败。合成版本只有两个文件，不是终端本身。
- 没有验证的：没有对真实构建的连续两个版本做端到端验证；没有 iPhone 真机验证；没有在 WebKit 上验证 Worker 被终止后的续做；启动失败页的按钮本身只有单测（探针在页面里做的是同样的删除，不是点按钮）；配额重试只在内存替身里验证，没有在真实浏览器里把配额写满。需要运营方在主屏幕应用上连续发布两个版本后各冷启动一次，确认第二个版本生效那次启动的白屏不再随网络变长。

## 后续

- 分块的哈希级联（`apps/terminal/vite.config.ts` 的 `manualChunks` 把入口与共享代码放进 `vendor-tanstack-router`）：拆开后每次发布改名的块会少很多，后台预取的量随之下降。
- 如果真机确认 iOS 在页面离开后很快终止 Service Worker、导致预取总是跑不完，再考虑在页面可见时由页面触发一次补齐（例如 `postMessage`），本次不做。
- 入口脚本本身被污染（缓存里的入口内容错误）时页面一片空白，启动失败页也出不来。它与「入口脚本加载失败的兜底页」那项后续工作一起设计，本次不做。
