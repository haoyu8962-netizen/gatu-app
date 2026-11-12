# ADR 0051：Service Worker 先存好新壳的启动资源再换壳

- 状态：已接受并实施（2026-11-12）。分支 `claude/fix-sw-asset-cache`，未合入 `dev`、未发布。真机未验收：发布后冷启动是否不再依赖网络，只能在 iPhone 主屏幕应用上对两个连续版本确认。
- 关联：[ADR 0005](0005-spa-static-shell.md)（静态 SPA 壳）；[ADR 0006](0006-startup-preloads-and-edge-caching.md) 第 10 条（热访问由 Service Worker 回答导航）；[ADR 0010](0010-blank-until-ready-startup.md)（空白到就绪的启动）；[ADR 0020](0020-legal-pages-in-app-shell.md)（Service Worker v10）；[运行时守则](../runtime-guardrails.md) §8；[CloudFront 部署](../../deploy/cloudfront/README.md)；[首屏加载调研](../architecture/hyperliquid-first-load-investigation.md)；审查记录 `docs/work-memory/sessions/2026-11-12-global-defect-review.md`（提交 `9395acca`，P1-6 与 P3 字体缓存）。

## 背景

运营方在 iPhone 上把终端添加到主屏幕，隔一段时间再打开，先白屏约 5 秒。按 ADR 0010，运行时、语言目录和字体就绪之前页面是空的，所以白屏多久就是冷启动用了多久。审查找到两处让冷启动依赖网络的问题：

1. **字体缓存从未写入。** `sw.js` v10 的 `cacheFirst` 在 `caches.open()` 的回调里才调用 `response.clone()`，那时响应已交给页面、响应体已被占用，克隆抛错并被吞掉。审查在线上 Chromium 与 WebKit 里看到 `fonts-v10` 为 0 条；本次用 `apps/terminal/tests/browser/sw-release-switch-probe.mjs` 对 v10 的代码（只把缓存名改成 v11）在本机 Chromium 与 WebKit 里复现了同样的结果：字体请求之后字体缓存仍为空。启动闸门等字体，最多 3 秒（`lib/fonts/font-readiness.ts`）。
2. **每次发布后，冷启动要在空白期重新下载几乎整个启动闭包。** v10 只处理导航、字体和币种图标，`/assets/*` 不经它，只靠浏览器的 HTTP 缓存；导航的后台刷新拿到新壳就覆盖缓存，不管新壳引用的资源在不在本机。构建的分块有哈希级联（名为 `vendor-tanstack-router` 的块装着应用入口与共享代码，第三方库的块静态导入它），审查统计任何改动都会让 117 个预加载块里约 111 个改名，约 1.5 MB gzip。于是发布后第一次启动用旧壳（快），第二次启动用新壳，在空白期从网络取回这些块。iOS 是否保留主屏幕应用的 HTTP 缓存也不确定。

官方终端用 Workbox 预缓存整站（约 468 项）规避了第二个问题。

## 目标与约束

- 发布后的冷启动不再在空白期等启动闭包的网络下载：新壳只在它引用的启动资源都已存进本机之后才被使用。
- 字体缓存真正生效。
- 不改变导航的既有行为：旁路清单（`/join`、`/api`、`/client-error-report`、`/mobile-agent-sync*`、`/_serverFn/`、带扩展名的路径）、`?lang=` 的网络优先、壳的可缓存判定（200、未重定向、`text/html`）、图标的 stale-while-revalidate、`skipWaiting` 与 `clients.claim`、退役缓存的清理。
- 写缓存失败（包括 iOS 存储配额不足）不能影响当前请求；后台工作被中途终止时，保持旧壳。
- 缓存不随发布无限增长。
- 不改分块策略、启动闸门、`client.ts`、`__root.tsx`、manifest，也不加任何启动期界面内容。

## 决策

1. **缓存版本升到 v11，新增 `assets-v11`。** 退役清理的识别规则加入 `assets-` 前缀，激活时删除 `shell-v10`、`fonts-v10`、`icons-v10` 和其他版本的 `assets-*`。
2. **字体在交出响应之前同步克隆。** `cacheFirst` 先 `clone()`，再把副本写入缓存（`event.waitUntil`），写入失败被吞掉。图标的 stale-while-revalidate 有同类时机问题（`await cache` 之后才克隆），一并改为在回调开头同步克隆。
3. **`/assets/` 走缓存优先。** 范围与 `deploy/cloudfront/deploy.mjs` 的 `objectCacheControl` 判为 immutable 的 `assets/` 一致：同源 GET、路径以 `/assets/` 开头、没有查询串、不是 `.br`/`.gz`/`.zst`，且不带 `Range`。命中（`ignoreVary`，文件名带内容哈希）就直接回答，不发网络请求；未命中就取网络，200、未重定向、不是 `text/html` 的响应写入 `assets-v11`。同一个 URL 同时只有一个网络请求，页面与后台预取共用：第一个响应从不被读取，页面和缓存各拿一个克隆，所以不会在已交出的响应体上克隆。
4. **TradingView 的哈希文件不纳入。** `charting_library/bundles/*` 与带哈希的加载器副本同样是 immutable，但它们体积大、只在 TradingView 升级时改名、由图表 iframe 在工作区显示之后才请求，不在空白期的关键路径上；`chart-asset-cache-policy.test.ts` 也要求 Service Worker 不拦截图表请求。它们继续靠 HTTP 缓存。
5. **换壳之前先存好新壳的启动资源。** 导航（包括 `?lang=` 的网络优先）拿到可缓存的新壳后，在后台：
   - 从壳里读出同源 `/assets/` 引用：`<link rel="modulepreload|preload|stylesheet">` 的 `href`、`<script src>`，以及 `scripts/inject-shell-preloads.mjs` 写入的 `sairn-preload-desktop` 与 `sairn-preload-mobile` 两个 `<meta>` 列表（引导入口按设备读取的启动块）。内联脚本的正文先剥掉，`sairn-chart-prefetch` 与图标、manifest 不读。
   - 并发 6 个，把缓存里没有的取回并写入 `assets-v11`；已经在缓存里的不发请求。
   - 全部成功后，在一个串行的提交队列里再核对一遍每个引用都在缓存里，才替换 `shell-v11` 的条目。任何一个失败（网络错误、非 200、HTML 回退、写入失败、核对时不在）、超过 60 秒总时限、或缓存打不开，就保留旧壳；已经存好的资源留着，下一次导航从缺的那几个继续。旧壳仍然可用，因为 `deploy.mjs` 从不删除 S3 上的旧资源。
   - 多个导航拿到同一份新壳时共用一个任务；每次刷新按开始顺序编号，一份较早开始的壳不会覆盖已经提交的较新的壳。
   - 缓存里没有壳（首次安装、v10 升级之后）时，页面直接用网络壳，资源经第 3 条写入缓存，后台任务照常预取后提交。
6. **容量：发布切换时淘汰。** 提交的新壳与原来的壳不同时，`assets-v11` 只保留新壳与上一个壳引用的资源，以及其他仍在预取的壳的资源；其余条目（上一版本懒加载过的块、更早版本的资源）删除。壳没有变化时不淘汰，懒加载过的块留着。所以缓存最多是两个壳的启动闭包，加上自上次切换以来懒加载过的块；后者不超过一次构建的资源总数。没有另设条目数或字节上限：Cache API 不提供访问时间，按插入顺序淘汰会误删当前壳的启动块。
7. **不做整站预缓存。** 只缓存壳实际引用的启动资源和用到过的不可变资源。
8. **CSP 与部署不需要改。** 预取是同源请求，`connect-src 'self'` 已允许；`sw.js` 仍以 `no-store` 上传（`deploy.mjs` 的 `NO_STORE_FILES`），注册时 `updateViaCache: "none"`，新版本在下一次导航时安装并立即接管。

## 备选方案

| 方案 | 取舍 |
| --- | --- |
| 官方的整站预缓存（Workbox，约 468 项） | 首次安装就下载全部路由、对话框和语言目录，大部分用户用不到；首屏调研把它列为「不能复制」，理由是首次安装成本高。本方案只取壳引用的启动闭包，范围更窄。未采用 |
| 只做 `/assets/` 缓存优先，不改换壳时机 | 新壳的资源仍要在第一次用新壳启动时从网络取回，正是白屏的来源。未采用 |
| 换壳后由页面预取下一版资源 | 页面不知道下一版是什么；Service Worker 拿到新壳时已经有完整清单。未采用 |
| 按条目数或字节上限、按最久未用淘汰 | Cache API 没有访问时间，要自己维护元数据；按插入顺序会淘汰当前壳的启动块。按「当前与上一个壳」淘汰与发布节奏一致，界限也清楚。未采用 |
| 把 TradingView 的哈希文件也纳入 | 体积大、不在空白期的关键路径上，且现有契约要求不拦截图表请求。未采用（见决策 4） |
| 修分块的哈希级联 | 能减少每次发布改名的块数，但属于构建策略，不在本次范围。列为后续 |

## 后果与边界

- 代价：每次发布后，已安装用户在后台多下载新壳的启动闭包（约 1.5 MB gzip；缓存存的是解码后的响应体，占用更大）。手机端也会预取 `sairn-preload-desktop` 里只有桌面用的块（数量见当次构建的壳），因为 Service Worker 不知道设备布局。
- 首次安装后的第一次启动仍走网络：第一次访问时 Service Worker 还没接管，资源只进 HTTP 缓存；v10 升级到 v11 时也一样，因为 v10 的缓存被清理、`assets-v11` 是空的，升级后的第一次冷启动要从网络取回启动闭包。
- 后台预取要在 Service Worker 存活期间完成。浏览器（尤其是 iOS）可能在页面离开后很快终止它；那样旧壳保留，下一次导航从缺的资源继续，不会出错，只是新版本晚一次生效。
- 发布后第一次启动仍然是旧版本（与 v10 相同）；新版本在后台存好之后的下一次启动生效。`?lang=` 的链接照旧直接用网络上的当前壳。
- 只读壳里的链接，不解析 JavaScript：入口在运行时动态加载、又不在壳的预加载与两个 `<meta>` 列表里的块，仍在第一次用到时从网络取回并写入缓存。
- 写缓存失败只让缓存不生效：页面照常拿到网络响应，壳保持旧的。

## 验证

- 单测（Vitest，在 `node:vm` 里加载真实的 `public/sw.js`，模拟 `fetch` 事件与 Cache Storage）：`apps/terminal/src/lib/tests/sw-asset-cache.test.ts` 覆盖字体与 `/assets/` 下字体的写入与离线命中、资源缓存优先、404 与 HTML 回退不写入、写缓存失败仍回答页面、不拦截的请求（根目录文件、TradingView、其他来源、查询串、预压缩文件、Range、POST）、与 `deploy.mjs` immutable 范围一致、新壳有一个资源取不回时旧壳不被替换、全部存好后才替换、写入失败或提交前资源不在时不替换、60 秒总时限、页面与预取共用请求、同一份新壳只预取一次、较早的壳不覆盖较新的、发布切换时的淘汰与进行中任务的保护、壳不变时不淘汰、`?lang=` 先回答网络壳后缓存、从真实壳结构读出的资源清单、`<meta>` 名称与构建脚本一致。`sw-navigation-cache.test.ts` 与 `chart-asset-cache-policy.test.ts` 改为 v11 名称，其余断言不变。新测试先在未修复的 `sw.js` 上运行，29 条里 18 条失败；只把 v10 代码的缓存名改成 v11 时 17 条失败，其中包括两条字体测试，说明它们抓的是克隆时机而不是缓存名。再做 16 个单项变异（字体克隆放回异步回调、去掉 `/assets/` 路由、预取忽略失败、去掉提交前核对、去掉编号检查、去掉淘汰、壳不变也淘汰、去掉下载去重、去掉任务去重、去掉总时限、预取前就写壳、淘汰不保护进行中的壳、写入 HTML 回退、不读 `<meta>`、不剥内联脚本、退役清理不识别 `assets-`），15 个都有测试变红；没变红的是「预取忽略失败」，因为提交前核对兜住了它，两者一起去掉时 3 条变红。
- 浏览器探针：`apps/terminal/tests/browser/sw-release-switch-probe.mjs` 在 Chromium 与 WebKit（Playwright）里运行真实的 `sw.js`，对一个本地服务轮换三个合成版本：版本 A 的资源进入缓存；部署 B 后导航仍由 A 回答，B 的资源存好后才换壳；随后让 `/assets/` 全部返回 503，新开页面仍启动 B，服务器没有收到资源请求；版本 C 有一个资源取不回时壳保持 B；`/assets/` 之外的字体写入字体缓存。2026-11-12 本机两种引擎全部通过；用 v10 的代码（缓存名改为 v11）运行时，两种引擎的字体缓存都是空的。合成版本只有两个文件，不是终端本身，读数不代表真实构建或 iOS 的启动时长。
- 需要运营方做的：在 iPhone 主屏幕应用上，连续发布两个版本后各冷启动一次，确认第二个版本生效那次启动的白屏不再随网络变长；也确认 v11 首次接管后的那一次冷启动只是一次性的网络启动。

## 后续

- 分块的哈希级联（`apps/terminal/vite.config.ts` 的 `manualChunks` 把入口与共享代码放进 `vendor-tanstack-router`）：拆开后每次发布改名的块会少很多，后台预取的量随之下降。
- 如果真机确认 iOS 在页面离开后很快终止 Service Worker、导致预取总是完成不了，再考虑在页面可见时由页面触发一次补齐（例如 `postMessage`），本次不做。
