<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-30-official-terminal-announcements-trace",
  "date": "2026-09-30",
  "title": "官方终端公告实践取证：独立 CDN 静态 JSON、根级 5 分钟轮询、Draft.js 正文直接注入",
  "kind": "task",
  "status": "verified",
  "topics": ["hyperliquid-api"],
  "summary": "只读取证 app.hyperliquid.xyz/announcements（未登录、未连接钱包）：公告不走 api-ui 的 info 接口、WebSocket 或第三方平台，而是独立 CloudFront/S3 上的静态 JSON（列表 entries.json 110 条，详情 entry-<uuid>.json，正文为 Draft.js 原始内容且图片以 base64 内嵌，单条可达 1.6 MB）；应用根部 Provider 用裸 fetch 加 setInterval 每 5 分钟轮询列表，任何页面都会请求；未读条目在所有非公告页面右下角弹出最多 3 条的浮层，已读状态存 localStorage 的 hyperliquid.viewed_announcements（元素为 hash ?? uuid）；详情把 Draft.js 转成 HTML 后用 dangerouslySetInnerHTML 注入，产物里查不到净化步骤；正文、分类徽章不随界面语言变化，日期跟浏览器语言；失败与空态没有任何文案。Sairn 当前没有公告功能。受限地区表现、后台标签页轮询和发布管线未确认。",
  "thread": null,
  "baseCommit": "86191b56",
  "commits": [],
  "sources": [
    { "url": "https://app.hyperliquid.xyz/announcements" },
    { "url": "https://app.hyperliquid.xyz/assets/index-DMtAfrK3.js" },
    { "url": "https://app.hyperliquid.xyz/assets/config-B3kWIW3_.js" },
    { "url": "https://app.hyperliquid.xyz/assets/AnnouncementsPage-bf3Q9d9L.js" },
    { "url": "https://dzjnlsk4rxci0.cloudfront.net/mainnet/entries.json" },
    { "path": "docs/work-memory/sessions/2026-09-24-official-terminal-language-switch-trace.md" },
    { "path": "docs/announcements-plan.md" }
  ],
  "supersedes": []
}
-->
# 官方终端公告实践取证：独立 CDN 静态 JSON、根级 5 分钟轮询、Draft.js 正文直接注入

## 背景与范围

同步记录。用户要求安排 agent 核查官方交易终端的公告页 `https://app.hyperliquid.xyz/announcements` 是如何实现的。本次只做取证，不改动 Sairn 的实现。

取证时间 2026-09-30 08:19–08:37 UTC。当日官方 `index.html` 的 `Last-Modified` 为 2026-09-26 08:31:40 GMT，产物为入口 `index-DMtAfrK3.js`（1,328,441 B）、主代码 `config-B3kWIW3_.js`（2,146,017 B）、公告页懒加载块 `AnnouncementsPage-bf3Q9d9L.js`（4,545 B）。官方包是压缩产物，下文的标识符是压缩后的名字，仅用于定位。

方法：由一个子 agent 先静态分析产物，再用无头 Chromium 147（Playwright 1.59.1，页面脚本执行前注入探针包装 `fetch`、`WebSocket`、`Storage.prototype.setItem`，并用 `page.on("request")` 独立记录）观察运行时，视口为桌面 1440×900 与手机 390×844；数据接口另用 `curl` 复核。全程未登录、未连接钱包、未签名，未出现条款或 Cookie 弹窗。所有点击都是 Playwright 注入，不是物理输入。主会话随后独立重跑了列表接口请求与产物检索（见「验证与限制」）。

Sairn 仓库在基线 `86191b56` 没有公告功能：检索 `announcement` 只命中无障碍播报等无关代码。

## 结论与依据

下文「运行时」指无头 Chromium 或 `curl` 的实际观察，「静态」指从产物代码推断。

### 1. 路由与入口

- 静态（`index-DMtAfrK3.js`）：`/announcements` 与 `/announcement/:uuid` 两条路由共用同一个 `lazy(() => import("./AnnouncementsPage-bf3Q9d9L.js"))` 组件，外包 `Suspense`，fallback 是不带内容的页面底框。
- 数据 Provider（`$K`，hook `tq`）和浮层（`iq`）在入口包里并挂在应用根部，不在懒加载块里，所以任何页面启动都会请求公告列表。
- 运行时：桌面入口在顶部 `More` 下拉（Funding Comparison 与 Stats 之间）；手机入口在左上汉堡抽屉的同一位置。页脚只有 Docs / Support / Terms / Privacy Policy。没有铃铛、红点或未读计数。
- 交易页顶部横幅只处理离线、地区限制、下架币等，与公告无关。

### 2. 数据来源

| 用途 | 请求 | 响应 |
|---|---|---|
| 列表 | `GET https://dzjnlsk4rxci0.cloudfront.net/mainnet/entries.json?noCache=<Math.random()>` | 200，22,631 B，`{ entries: [...] }`，110 条 |
| 详情 | `GET https://dzjnlsk4rxci0.cloudfront.net/mainnet/entry-<uuid>.json`（无防缓存参数） | 200，单个对象，3 KB 到 1.6 MB |

- 运行时：响应头 `server: AmazonS3`、`content-type: application/octet-stream`，有 `etag` 与 `last-modified`，没有 `cache-control`；带 `Origin` 时返回 `access-control-allow-origin: *`；不存在的 uuid 返回 403 XML。
- 静态：路径前缀来自链名，`` JK=`https://dzjnlsk4rxci0.cloudfront.net/${Pr.chain.toLowerCase()}` ``。
- 运行时排除项：公告页加载期间发往 `api-ui.hyperliquid.xyz/info` 的 type 与 WS 订阅（`l2`、`activeAssetData`、`activeAssetCtx`、`webData3`、`pac`、`outcomeMetaUpdates`、`sac`、`fastAssetCtxs`）都与公告无关，也没有 Telegram / Discord / Medium 请求。
- 静态例外：入口包硬编码了一条公告的正文覆盖表 `YK`（uuid `uk5j463fq3m`）；`hash` 匹配时用包内 HTML 替换 JSON 的文字块，只保留图片块。

### 3. 内容模型与渲染

列表条目（运行时，110 条全量统计）：

| 字段 | 说明 |
|---|---|
| `title` | 11–82 字符 |
| `preview` | 0–126 字符，56 条为空 |
| `createdAt` | ISO 8601 UTC；数组已按它倒序，前端不再排序；跨度 2025-02-12 至 2026-09-21 |
| `uuid` | 9–12 位随机串，110 条唯一 |
| `hash` | 79 条为 `<uuid>-<ISO 时间>`，31 条旧数据等于 `uuid` |
| `category` | 只有 `Listings` 65 / `Updates` 27 / `Delistings` 18 |

- 详情（运行时，3 个样本）：同上字段外加字符串 `content`，内容是 Draft.js 原始内容 JSON `{ blocks, entityMap }`；样本的 block 类型只有 `unstyled` 与 `atomic`，entity 有 `IMAGE`（`src` 为 base64 data URI，内嵌在 JSON 里）和 `LINK`（`url`、`targetOption`，样本里 `_self` 与 `_blank` 都有）。旧条目的详情没有 `hash` 字段。
- 渲染（静态）：`ZK` 把原始内容转成 HTML 字符串，页面用 `dangerouslySetInnerHTML:{__html:F.data?.content??""}` 注入。三个产物里检索不到 `DOMPurify` 或 `sanitize`。转换器形态与 `draftjs-to-html` 一致（入口包有 `wysiwyg-hashtag`、`wysiwyg-mention` 标记），没有包名佐证。
- 列表（运行时加静态）：每行是标题、分类徽章、预览、日期；固定每页 10 条，前端切片分页（`slice(D*k,(D+1)*k)`），只有上一页/下一页和 `1-10 of 110`。桌面左栏按分类做纯前端过滤；手机没有分类筛选（左栏隐藏，替代下拉的渲染条件恒为假）。
- 详情是独立路由，不是展开；面包屑返回用 `replace`。
- 日期是不带参数的 `toLocaleDateString()`，跟浏览器语言和本地时区，不跟界面语言。

### 4. 状态与提醒

- 唯一的存储键是 `localStorage["hyperliquid.viewed_announcements"]`（键名常量在 `config-B3kWIW3_.js`），值是 JSON 字符串数组，元素为 `hash ?? uuid`。
- 运行时写入时机：打开列表页不写；打开某条详情追加该条；点浮层的 X 把全部 110 条写入，刷新后浮层不再出现。
- 浮层（运行时，桌面和手机都出现）：右下角固定定位（`bottom:16px; right:16px; z-index:30; max-width:320px`），列出最新 3 条未读的标题与预览。静态条件是 ``t.length===0||r.includes(`/announcement`)?null:…``，即未读非空且当前路径不含 `/announcement`。全新访客 110 条都算未读，所以首次打开任何页面都会弹。没有单条关闭。
- 静态推断：已读按 `hash` 记，公告被编辑后 `hash` 里的时间戳变化，会重新变成未读。

### 5. 刷新策略

- 列表不走 React Query：Provider 的 `useEffect` 里裸 `fetch` 加 `setInterval(t,3e5)`，没有可见性判断。运行时：停在 `/announcements` 640 秒，请求出现在 +1.6s、+301.6s、+601.6s；停在 `/trade` 335 秒，出现在 +2.4s、+302.4s。
- 该 effect 依赖已读数组，所以每次已读状态变化都会立即重拉列表并重置计时器（运行时：打开详情约 0.5 秒后出现第二次列表请求）。
- 详情走 React Query，`queryKey:["announcementQuery",{uuid}]`，没有单独配置；静态读到的全局默认是 `staleTime` 5 分钟、`gcTime` 12 小时。
- 不进 `REACT_QUERY_OFFLINE_CACHE`：持久化谓词只放行 `queryKey[0]==="persisted"`，运行时该缓存里也不含 `announcementQuery`。
- 没有 WebSocket 推送。

### 6. 多语言

- 运行时：预置 `hyperliquid.locale-setting` 为 `"zh-CN"` 后请求 URL 完全相同，标题、预览、正文、每行的分类徽章仍是英文。
- 只有外壳走 react-intl：`page.announcements`、`announcements`、`all.announcements`、`announcement.details`、`listings` / `delistings` / `updates`。分页文字是硬编码英文。

### 7. 空、错误与加载态

- 列表请求失败（静态加运行时，运行时用 Playwright `route.abort` 在本地拦截）：`catch` 里只 `console.log` 并把列表置空；页面显示标题和筛选栏，列表区空白，分页为 `1-0 of 0`；没有错误文案、重试按钮或空态文案，浮层不出现，等下一次轮询自然重试。
- 详情失败或 uuid 不存在（运行时）：返回 `null`，页面显示完整列表，URL 不变，不写已读。
- 加载态（静态）：懒加载块期间是空白底框；详情请求期间是圆形加载图标；列表首次返回前短暂是空列表，没有骨架。

### 与 Sairn 的关系

Sairn 没有对应功能，本次未形成是否实现的决定。若将来消费同一数据源，从本次事实可以直接得出三点约束：正文必须自行净化后再渲染，且外链 `target` 不可原样采用；全局浮层与根级轮询属于被动数据展示，需先对照 `docs/mobile-data-presentation.md`；详情 JSON 可达 1.6 MB，不宜预取。

## 验证与限制

主会话在 2026-09-30 独立复核（工作区基线 `86191b56`，无仓库改动）：

- `curl -s -D - "https://dzjnlsk4rxci0.cloudfront.net/mainnet/entries.json?noCache=0.123"`：200，`server: AmazonS3`，`content-type: application/octet-stream`，`last-modified: Mon, 21 Sep 2026 05:39:09 GMT`，无 `cache-control`。用 Python 统计：110 条、六个字段一致、分类计数 65 / 27 / 18、按 `createdAt` 倒序、`hash == uuid` 31 条、`preview` 为空 56 条、`uuid` 唯一，与子 agent 报告一致。
- 在下载的产物里检索并读取上下文，确认：两条路由的注册、`JK` 前缀、列表 `fetch` 与 `setInterval(t,3e5)`、详情读取时追加已读、`dismissAll`、浮层的渲染条件与定位样式、`YK` 覆盖表、`dangerouslySetInnerHTML`、`announcementQuery`、切片分页、`toLocaleDateString()`、持久化谓词，以及三个产物里 `DOMPurify` / `sanitize` 均为 0 处。
- 读取三个详情样本，确认字段、block 类型、entity 类型与链接 `targetOption`。
- 查看了桌面列表、桌面交易页浮层、手机交易页浮层三张截图，与文字描述一致。

未由主会话重跑、仅来源于子 agent 报告的：轮询时间点、已读写入时机、语言与浏览器 locale 对比、失败态、手机抽屉入口、`testnet/entries.json` 与 mainnet 逐字节相同（单次 `curl`）。

未确认：

- 受限地区下的表现（本次未触发地区提示；静态看 Provider 与浮层没有地区条件）。
- 详情结构只基于 110 条里的 3 个样本，其它条目是否含列表块、标题块等类型未逐条下载。
- 「无净化」只有检索不到关键字这一项依据。
- 详情的 `staleTime` / `gcTime` 只有静态依据，未实测重访是否重新请求。
- 后台标签页下轮询是否被浏览器节流。
- 连接钱包后的条款弹窗是否遮挡浮层。
- 官方的发布管线。

本地证据（产物副本、响应样本、取证脚本、日志与截图）在本次会话的 scratchpad，未入库，会话结束后不保证保留。官方部署随时可变，以上数值只代表取证当日。

## 后续与替代关系

没有被替代的记录。决定前不需要再次抓包，先读本记录。

2026-09-30 同一会话后续：用户要求参照官方做法给出 Sairn 的实现方案，已写成 [公告功能实现方案](../../announcements-plan.md)（状态为拟议，未实施）。方案推荐 Sairn 自有公告源而不是运行时读取官方源，数据来源、内容发布方式、提示形式、内容语言四项待用户决定。写方案时只读了仓库代码与文档，没有运行应用测试或构建。与官方前端整体栈和语言切换相关的既有事实见 `2026-09-24-official-terminal-language-switch-trace.md`。
