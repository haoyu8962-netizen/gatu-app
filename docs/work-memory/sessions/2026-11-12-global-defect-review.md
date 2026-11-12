<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-12-global-defect-review",
  "date": "2026-11-12",
  "title": "全局缺陷审查：健壮性、安全、启动、发布、状态一致性与工程健康（六路只读审查加主会话核实）",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "market-recovery", "static-hosting", "docs-governance"],
  "summary": "运营方要求从全局视角再审一遍。与 2026-10-30 的功能对齐审查互补，这次看六个面：实时数据层、签名与前端安全、启动与 PWA、服务端边缘与发布、交易与资金状态一致性、工程健康。六个只读代理各审一面，主会话逐条对照代码核实重点项。没有发现 P0，签名核心与契约一致。核实成立的 P1 六项：下单前的法律状态复核可被无限期暂停后再发单；按手册回滚时壳与发布标记不会被上传而脚本报成功；/api/geo 没有限流，配额耗尽会让全站 fail-closed 且无日志；CI 手选清单漏掉 46% 的测试文件，含资金与签名测试；生产问题无法事后还原；每次发布都会改掉全部启动块的文件名，发布后的冷启动要在空白期重下约 1.5 MB。另有 P2 十四项、P3 若干。只审查与记录，没有改产品代码；多数结论来自读码，未在浏览器或真机复现。",
  "thread": null,
  "baseCommit": "810a45dba7c8435dcc016b7c1a83e33a7d7362a8",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-10-30-full-feature-audit.md" },
    { "path": "docs/work-memory/sessions/2026-11-12-ios-resume-websocket-recovery.md" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/159" },
    { "path": "docs/adr/0050-websocket-recovery-on-resume.md" },
    { "path": "deploy/cloudfront/deploy.mjs" },
    { "path": "apps/terminal/public/sw.js" },
    { "path": "packages/hl-react/src/internal/exchange/legal-execution.ts" },
    { "path": ".github/workflows/terminal-tests.yml" }
  ],
  "supersedes": []
}
-->
# 全局缺陷审查：健壮性、安全、启动、发布、状态一致性与工程健康

## 背景与范围

同步记录，2026-11-12，未取得任务标识。p41 发布之后，运营方说：「请你继续检查这个项目 有哪些缺陷 全局视角审查一遍」。

2026-10-30 的[全功能审查](2026-10-30-full-feature-audit.md)以「功能与官方终端对齐」为主，它的清单这次不重复。这次换成六个互补的面：

| 面 | 范围 |
| --- | --- |
| 实时数据层 | `packages/hl-react` 的订阅状态机、新鲜度、连接恢复，以及应用层的消费方式 |
| 签名与前端安全 | 精确 owner 签名、Agent 密钥生命周期、手机配对、CSP 与注入面 |
| 启动与 PWA | 冷启动的串行等待、缓存、Service Worker、失败模式 |
| 服务端、边缘与发布 | 地区判定、代理端点、CloudFront 函数、`deploy.mjs`、CI |
| 交易与资金状态一致性 | 精度、执行守卫、待确认动作、跨标签页、自动动作 |
| 工程健康 | 复杂度、契约测试、死代码、依赖、文档漂移、可观测性 |

方法：六个只读代理各审一面（不改文件、不跑测试与构建、不读 `.env*`），都先读已有的审查记录与 ADR。代理的结论不直接当事实：主会话对下文标「已核实」的条目逐条读了对应代码或做了只读实测；标「代理报告」的只有代理的读码结论。基线是 `origin/dev` `810a45db`（与 `main` `766a8566`、线上 p41 的树相同）。只审查与记录，没有改产品代码。

## 结论与依据

没有发现 P0。签名核心（邮箱、外部钱包、Agent-only 三条路径的精确 owner 校验，ADR 0040 与 0041 两个自动签名宿主的触发条件，密钥存放位置，`expiresAfter`）在读到的范围内与契约一致。直接提交路径（下单、平仓、反手、TP/SL、划转、发送）的精度、显示值约束和重复点击守卫没有发现漏网。

### P1（六项，均已核实）

1. **下单前的法律状态复核可被无限期暂停，之后订单才发出。**
   - 位置：`packages/hl-react/src/internal/exchange/legal-execution.ts:58-66`（`fetchQuery`，`networkMode: "online"` 加重试）；`packages/hl-react/src/hooks/useExchange.ts:181-203`；`@tanstack/query-core` 5.90.16 的 `retryer.js:41,96`。
   - 机制：页面停留超过 30 秒后，下一笔 L1 动作先发一次 `legalCheck`。请求失败进入重试等待；等待结束时如果页面不在前台，TanStack 的重试器暂停到重新聚焦，没有上限。暂停期间调度器被占用，该资产的 Web Lock 也被持有。
   - 场景：点了买入，第一次 `legalCheck` 因网络抖动失败，用户在 1–10 秒的退避内切到别的应用；几分钟或几小时后回来，重试成功，限价单直接发出。`expiresAfter` 在签名时才计算，管不到签名前的等待。
   - 核实：读了三处代码与依赖源码。没有在浏览器复现，触发条件偏窄，手机上更容易出现。
   - 建议：执行路径上的复核不走可暂停的重试并加总超时；调度器对入队超过一定时长的动作失败关闭（撤单可放宽）。
2. **按手册回滚时，壳与发布标记不会被上传，脚本却报成功。**
   - 位置：`deploy/cloudfront/deploy.mjs:84-108`（全部文件走 `aws s3 sync`）、`:655-666`（`assertReleaseMarkersUploaded` 只比字节数）。
   - 机制：`aws s3 sync` 只在大小不同或本地更新时上传。回滚用的是保留的旧工作树，文件比桶里的旧。`_shell.html` 与 `build-meta.json` 在 p38–p41 四个版本里字节数相同（14,264 与 428，`stat` 实测），所以两者都被跳过，标记核对因大小相等而通过。Lambda 与 CloudFront 函数却真的回滚了。
   - 核实：读码加文件大小实测。没有做过回滚演练。官网的部署文档已写明同一个坑，终端脚本没有处理。
   - 建议：非内容哈希的文件改用无条件的 `aws s3 cp`；标记核对比内容校验和；加一条「旧 mtime、同大小」的测试。
3. **`/api/geo` 没有限流，配额耗尽会让全站 fail-closed，且没有日志。**
   - 位置：`apps/terminal/src/lib/geo/geo-api.ts:108-153`。
   - 机制：处理器只有按完整 IP、每个 Lambda 实例各自的缓存。换着地址请求（例如一个 IPv6 /64）每次都是一次 IPdata 查询。配额耗尽后接口回 503，客户端对交易、存款和提款 fail-closed；失败不写日志。
   - 核实：读了处理器，确认 `geo()` 路径上没有限流。IPdata 的套餐额度与线上分发的实配没有核对。
   - 建议：缓存与限流键对 IPv6 归一到 /64；对未命中缓存的外呼加每实例总预算；失败写结构化日志并设告警；`/api/*` 加 WAF 速率规则。
4. **CI 的手选清单漏掉近一半测试文件。**
   - 数字：两个代理各自统计，结果一致。716（或 717）个 Vitest 文件里，`terminal-tests.yml` 的清单展开后覆盖 384 个，332（或 333）个从不在 CI 运行。`AGENTS.md` 回归清单列出的 295 个里有 33 个不在 CI。
   - 不在 CI 的包括资金与签名测试：`funds-execution-guard`、`l1-agent-signing`、`cross-tab-nonce-manager`、`external-agent-signer`、`privy-owner-signer`、`builder-fee-approval`、`exchange-request-scheduler`、`fresh-legal-action-guard`、`trading-onboarding-domain`、`position-market-close-submit-host`；还有 20 个契约测试和全部服务端处理器测试（geo、leaderboard、错误上报、静态页）。
   - 连带影响：晋升覆盖判定的「已通过」指的也只是这份清单。`packages/hl-react` 与 `packages/ui` 自身没有测试文件。
   - 核实：主会话没有重新统计；两路结果一致，且手册第 3 节已承认「CI 只跑手选清单」并记录过两次漏测。本机全量跑一遍约 5–8 分钟。
   - 建议：CI 改跑全量并分两片，清单只保留作命名分组。先把 `transport-reconnect.test.ts` 里会连真实测试网的用例隔离掉。
5. **生产问题无法事后还原。**
   - 现状：只有错误上报（10 个类别，不含消息原文）。源码里 `performance.mark`、`PerformanceObserver`、`sendBeacon` 都是 0 处（已 grep 核实）。启动耗时、WebSocket 恢复耗时没有任何上报；ADR 0050 的 `recoveryEvents` 只在内存里，要开发者工具才能读，手机上用不了。
   - 今天的事例：运营方在手机上看到白屏和长时间无数据，仓库里没有手段还原当时发生了什么，所以修复只能针对读码确认的等待。
   - 建议：每次启动往 localStorage 的小环形缓冲记一条时间线（导航计时、从网络取回的资源数与字节、各闸门就绪时刻）；恢复事件在恢复完成或 `pagehide` 时摘要上报；设置里加「复制诊断信息」。
6. **每次发布都会改掉全部启动块的文件名，发布后的冷启动要在空白期重新下载约 1.5 MB。**
   - 机制：名为 `vendor-tanstack-router` 的块实际装着应用入口与 hl-react 等共享代码，Privy 块（约 410 KB gzip）静态导入它。它一变，依赖它的块文件名都变。Service Worker 只缓存壳、字体和图标，`/assets/*` 不经它；它在后台拿到新壳就覆盖缓存，不预取新壳引用的资源。
   - 核实：今天五次构建的预算输出里，Privy 块原始大小都是 1,415,001 字节，文件名后缀却是五个（`nqfHoz20`、`DQbdTfVa`、`eMhibOs1`、`DlF4tmbn`、`DtF24KxI`），其中两次只差一行赋值；逐块对比里 440 个块名有 226 个变化。`sw.js` 的三条分支已读。
   - 与白屏的关系：发布后第二次冷启动要在空白期把这些块从网络取回，4G 下是 5 秒量级。这是推断，没有真机证据；运营方报告当天距上一次发布已有七天，这条解释不了那一次，除非系统清掉了 HTTP 缓存。
   - 建议：新壳内容变化时先取回并存好它引用的 `/assets/` 文件，成功后再替换壳缓存；给 `/assets/` 加 cache-first 分支；把第三方库分到只依赖第三方的块并加产物级断言。

### P2（十四项）

| # | 问题 | 位置 | 核实 |
| --- | --- | --- | --- |
| 7 | `deploy.mjs lambda --execute` 把函数配置原样输出，其中有环境变量（IPdata 密钥） | `deploy/cloudfront/deploy.mjs:256-261,559-564` | 已核实。p41 的发布日志里确有 `Environment` 段（只做了计数，没有打印值），当场已把该段从日志里删掉。此前各次发布的日志与会话记录里可能也有 |
| 8 | Lambda 更新即生效，发布脚本在更新后不探活；CI 从不构建 Lambda 包 | `deploy.mjs:256-261`；`.github/workflows/production-build.yml` | 命令序列已核实；坏包的触发条件是假设 |
| 9 | 撤单结果不明时，订单只要从委托列表消失就报「已取消」，不区分被撤还是已成交 | `apps/terminal/src/components/trade/order-reconciliation.tsx:96-146` | 已核实（读码） |
| 10 | 全局设置跨标签页互相覆盖：一个标签页切换页签就把整份旧设置写回，另一个标签页收紧的下单确认、滑点、延迟保护被还原 | `apps/terminal/src/stores/use-global-settings-store.ts` | 已核实没有 `storage` 监听；覆盖过程为代理读码 |
| 11 | 同账户两个标签页时，另一个标签页会留下永不结束的「确认中」通知 | `order-reconciliation.tsx:212-216,465-489`；`use-pending-order-store.ts` | 代理报告 |
| 12 | `fastAssetCtxs` 的解压队列一次失败就永久失效，且订阅没有解压能力门控 | SDK `api/subscription/_methods/fastAssetCtxs.js:48-55`；`apps/terminal/src/lib/hyperliquid/hooks/useMarketsInfo.ts:175-183` | 已核实（读码）。不支持 `deflate-raw` 的浏览器上所有行的标记价永远是加载中 |
| 13 | 外部钱包签名返回后不恢复签名地址，只在签名前比对账户 | `packages/hl-react/src/wallet.ts:47-65`；`apps/terminal/src/lib/wallet/external-agent-signer.ts:23-34` | 已核实全仓没有地址恢复调用；「钱包不按请求的账户签」是假设 |
| 14 | 扫码导入页不显示要导入的账户地址，也不提示会替换当前会话 | `apps/terminal/src/routes/mobile-agent-sync.tsx` | 已核实：`userAddress` 只用于查询与注册，没有展示 |
| 15 | 语言目录多一次串行往返，且等待没有上限（字体和路由揭示都有） | `apps/terminal/src/routes/__root.tsx:100-105`；`src/lib/i18n.ts:96-101` | 已核实闸门里没有超时；往返耗时为估计 |
| 16 | 入口脚本或它的静态依赖加载失败时永久空白，主屏幕应用没有刷新按钮 | `_shell.html`；`apps/terminal/src/client.ts` | 代理报告 |
| 17 | 契约测试有「通过但规则没被保证」的漏洞 | 例：`status-motion-surface-contract` 只数 `animate-spin` 字面量 | 已核实一例：组件里有 20 处 `<Spinner>` 用法不计数。其余五例为代理报告 |
| 18 | 文档状态漂移 | `docs/adr/README.md`；`CHANGELOG.md` | 已核实：ADR 0042 的索引行仍写「未合入 dev、未发布；日本法律意见未取得，建议取得前不发布」，实际已在 `main`；`CHANGELOG.md` 1,483 行只有一个 Unreleased |
| 19 | 巨型组件与双端重复：四个函数圈复杂度超过 100；桌面与手机订单页签有 239 行相同的撤单改单代码 | `orders-tab.tsx`、`mobile-orders-tab.tsx`、`tradingview-chart.tsx`、`deposit-modal.tsx` | 代理统计 |
| 20 | ADR 0050 的存活判断可能被积压帧骗过 | `transport-monitor.ts`（任何一帧都取消探测）；`l2-book-transport-pool.ts`（静默按最后一个 `l2Book` 帧算） | 机制已核实；真机上积压帧与可见事件的先后顺序未知。若连接已死而积压帧先到或后到，各有一条恢复路径失效 |

### P3（摘要）

- **Service Worker 的字体缓存从未生效**（已在真实 Chromium 与 WebKit 里对线上站点核实，`fonts-v10` 为 0 条）：`sw.js:133-145` 在响应体交给页面之后才克隆。字体只能靠 HTTP 缓存，被清掉时启动闸门最多等 3 秒。
- 手机每次进交易页都预热一条用不上的全深度订单簿连接（`orderbook-boot.ts`）。
- 紧凑订单簿的增量 `l2` 一次慢重连后在本次会话里固定降级到 5 档。
- 页脚在 WebSocket 断开时仍显示已连接（`wsStatus` 由订阅条目推导）；`bbo` 断线期间不标过期。
- `refreshKey` 只换 store 键，服务器不会重发快照，登录后余额可能回到加载中直到下一次推送。
- `visibility.ts` 的 `resume` 处理不看 `document.hidden`（Chromium 在隐藏时解冻页面会误设可见）。
- Agent 记录的 schema 是严格模式，将来加字段时旧版本标签页会删掉新版本写入的密钥。
- nonce 记录损坏或本机时钟曾大幅超前后没有自愈路径。
- TWAP 终止抢不到资产锁就直接失败，不排队。
- 排行榜处理器的上游超时（15 秒）比 Lambda 的超时长，「回旧快照」的分支走不到。
- 从不 `--delete`：每次发布重传全部约 1,650 个文件，桶里的旧文件只增不减。
- 官网每日行情检查从 10 月 28 日起连续失败，没有任何通知。
- 入库的 `deploy/cloudfront/iam/*.json` 含 7 处 AWS 账号标识（只做了计数）。
- 死代码与遗留：`boneyard-js` 实际空转、`UI_TEXT` 约 130 行零引用、根目录 25 个评审文件、`docs/redesign.md` 与现行品牌冲突而没有过期提示。
- 依赖：Privy 补丁 1.66 MB 打在带哈希的产物文件名上；viem 四个版本；`tailwindcss` 与 `@tailwindcss/vite` 版本不一致。
- 规则体量：每次会话自动注入约 132 KB，单条规则最长 7,689 字符；圆角与字号的「禁止」与测试钉住的例外互相矛盾。
- 没有 iOS 启动图，manifest 的背景色与浅色主题不一致。

### 待证实（代理提出，未核实）

- CloudFront 对 5xx 的默认 10 秒错误缓存可能让 `/api/geo` 的失败跨用户共享。
- 附带 TP/SL 的父单被拒时，批量回包可能被判成「部分受理」。
- Privy 会话令牌在 `localStorage`：全局 `showWalletUIs: false` 下 CSP 是内嵌钱包静默签名的唯一防线。是否已启用 HttpOnly cookie 要看 Privy 控制台。
- 路由名带点的市场会被边缘函数当成文件，目前没有实例。

### 补充核实与官方对照（同日，运营方追问后）

运营方问：审查的问题是否核对过、是否成立，有没有对照官方开发文档和官方终端 `https://app.hyperliquid.xyz/trade/HYPE` 的做法，然后再规划子代理执行修复。

**补核实。** 此前只有代理结论的两条已读码：

- P2-11：`activeSubmissionIds` 只在内存里（`use-pending-order-store.ts:161,344`），待确认记录经 `storage` 事件同步到其他标签页（同文件 524 行），其他标签页会把它当成需要对账的记录。前提成立；「通知永不结束」这一步没有逐行追到底。
- P2-16：`client.ts` 只兜住它自己的两个动态导入；`_shell.html` 里没有 `onerror` 或任何脚本加载失败的处理。成立。

**官方开发文档**（2026-11-12 读取）：

| 规则 | 出处 | 对本仓库的含义 |
| --- | --- | --- |
| 服务器 60 秒没向某连接发过消息就关闭它；客户端发 `{"method":"ping"}`，服务器回 `{"channel":"pong"}` | WebSocket「Timeouts and heartbeats」 | `pong` 是文档规定的存活信号。P2-20 的修法（探测只认 `pong`）有依据 |
| 每个 IP 最多 10 条 WebSocket 连接、每分钟最多新建 30 条、最多 1000 个订阅、用户相关订阅最多 10 个不同用户、每分钟最多发 2000 条消息 | 「Rate limits and user limits」 | **新发现（P2-21）**：本终端每个标签页最多 5 条连接（1 条共享加订单簿连接池 4 条），两个标签页就到上限；连接池自己的预算是每分钟 24 条新连接，与每 IP 30 条只差 6 条。仓库文档（ADR 0003、运行时守则）没有提到这两个上限。SDK 里的用户上限写的是 15，文档是 10 |
| `orderStatus` 按 oid 或 cloid 查询，返回 `open`、`filled`、`canceled`、`marginCanceled` 等状态，权重 2 | 「Info endpoint」 | P2-9 可以在下结论前查一次，区分被撤销与已成交 |
| `expiresAfter` 之后动作被拒绝；因过期被取消的动作消耗 5 倍地址限额。FAQ：动作 15 秒内没被接受就过期 | 「Exchange endpoint」与 FAQ「Action already expired」 | 签名前已经等了很久的动作应在本地失败关闭，不要签出去再让链拒绝 |

**官方终端的做法**（读它 2026-11-12 的前端包 `config-HoX0zIlo.js` 与 `service-worker.js`，只读，没有连接钱包）：

| 方面 | 官方 | 本终端 | 结论 |
| --- | --- | --- | --- |
| 连接数 | 一条多路复用连接承载全部订阅 | 1 条共享加最多 4 条订单簿 | 见 P2-21 |
| 静默检测 | 每秒检查，15 秒没有任何消息就重连 | 5 秒检查一次，45 秒；回到前台时另有 ADR 0050 的处理 | 我们的阈值是官方的三倍 |
| 重连是否等旧连接关闭 | 不等：直接调用自己的 `onclose` 处理并安排重连 | 打补丁后不等（ADR 0050 决策 4） | 一致，补丁的做法有官方先例 |
| 重连退避 | 1 秒起翻倍到 30 秒，收到任何消息就复位 | 0.5 秒起翻倍到 30 秒 | 相近 |
| 被服务器以连接数超限拒绝 | 关闭原因以 `Cannot open more than` 开头时提示用户关闭其他标签页 | 没有识别，只按退避重试 | 应识别并说明 |
| 页面隐藏时 | 行情类频道每 10 条只处理 1 条 | 每个订阅只保留最后一帧 | 做法不同，效果相近 |
| `expiresAfter` | 签名时取「估计的服务器时间 + 15 秒」；HTTP 请求 15 秒中止 | 同样在签名时计算 | 一致。官方在点击与签名之间没有可暂停的等待，P1-1 是我们独有的 |
| 撤单结果 | 请求出错报错误；交易所回「Order was already canceled or filled」时单独处理；不查 `orderStatus` | 结果不明时订单消失即报「已取消」 | P2-9 成立，我们比官方多报了一个结论 |
| 外部钱包授权签名 | 签完后恢复签名地址并与预期地址比对，不一致则放弃 | 只在签名前比对账户 | P2-13 的修法与官方一致 |
| `fastAssetCtxs` 等压缩频道 | 自己解码，单帧失败只丢这一帧 | 走 SDK 的 Promise 队列，一次失败后永久失效 | P2-12 成立 |
| 资源缓存 | Service Worker 预缓存 468 项 | 只缓存壳、字体、图标，且字体缓存实际为空 | P1-6 与字体缓存问题有官方对照 |

## 验证与限制

- 主会话的核实手段：读代码与依赖源码、`stat` 文件大小、只读 grep 计数、今天的构建产物与日志，以及一次对线上站点的只读浏览器检查（Playwright Chromium 与 WebKit，读 `caches` 的条目数）。
- 没有运行测试、没有改产品代码、没有在浏览器或真机复现任何一条缺陷。P1 的 1、2、3 都是「读码确认的机制」，不是观察到的故障。
- 代理的统计（圈复杂度、死导出、CI 覆盖数）是脚本近似，适合排序，不宜当精确值。
- 没有覆盖：线上 AWS、Privy、IPdata 的实际配置；`apps/website`；图表蜡烛流的重连；CCTP、LI.FI、银行卡入金的内部状态机；金库、质押、Earn 的控制器；真机与真实钱包。
- 审查中做的唯一一处写操作在仓库之外：把 p41 发布日志里的函数配置段删掉（第 7 项）。
- 各代理的完整报告只在本机会话记录里，没有入库。

## 后续与替代关系

本记录不替代 2026-10-30 的全功能审查，两者范围互补。没有改任何代码，修复待运营方确认批次。建议的顺序：

| 批次 | 内容 | 说明 |
| --- | --- | --- |
| 一 | P1-1 下单延迟、P2-9 撤单结果、P2-11 跨标签页通知 | 交易正确性，各自单独 PR |
| 二 | P1-2 回滚、P2-7 日志泄密、P2-8 Lambda 探活 | 发布脚本；第 7 项另需运营方决定是否轮换 IPdata 密钥 |
| 三 | P1-4 CI 跑全量 | 一次改动，之后每个 PR 都受益 |
| 四 | P1-5 诊断、P1-6 发布后重下、P3 字体缓存、P2-15、P2-16 | 启动与可观测性；诊断先做，才能在真机上确认白屏原因 |
| 五 | P2-20 存活判断只认 `pong`、P2-12 `fastAssetCtxs` | 实时数据层 |
| 六 | P1-3 地区接口限流与告警 | 需要线上配置配合 |
| 七 | 文档状态、契约测试漏洞、死代码与依赖清理 | 低风险，可合批 |

需要运营方决定或操作的：是否轮换 IPdata 密钥；`/api/*` 是否加 WAF；ADR 0042 的索引状态如何更正；启动时是否允许显示内容（与 ADR 0010 相关）；官网行情快照的刷新；CI 改跑全量会增加多少计费分钟、是否接受。

### 第一波修复的分工（2026-11-12）

运营方要求由 Opus 5.5 子代理执行修复。第一波选的是已核实、不需要运营方先做决定、文件互不重叠的五项，各在自己的工作树和分支上做，只提交不推送：

| 分支 | 内容 | 主要文件 |
| --- | --- | --- |
| `claude/fix-order-submit-deadline` | P1-1：执行路径上的法律状态复核不再可暂停，签名前等待有上限 | `packages/hl-react/src/internal/exchange/`、`hooks/useExchange.ts` |
| `claude/fix-cancel-outcome` | P2-9、P2-11：结果不明的撤单用 `orderStatus` 区分；其他标签页的镜像通知能收尾 | `apps/terminal/src/components/trade/*reconciliation.tsx`、`stores/use-pending-*.ts` |
| `claude/fix-release-script` | P1-2、P2-7、P2-8：回滚能真正上传、Lambda 输出不含环境变量、更新后探活、CI 构建 Lambda 包 | `deploy/cloudfront/`、`.github/workflows/production-build.yml` |
| `claude/fix-realtime-liveness` | P2-20、P2-12、P2-21 的一部分：探测只认 `pong`、静默 15 秒即探测、订单簿连接也用心跳判活、`fastAssetCtxs` 自己解码、识别连接数超限、手机不预热用不上的连接 | `packages/hl-react/src/internal/websocket/`、`subscriptions/`、`clients.ts` |
| `claude/fix-sw-asset-cache` | P1-6、字体缓存：新壳引用的资源先存好再换壳、`/assets/` 走缓存优先、字体缓存的克隆时机 | `apps/terminal/public/sw.js` |

约定：子代理只跑定向测试、类型检查和 Biome，不跑全量单测和生产构建（多个同时跑会互相拖慢并造成偶发超时）；全量单测、生产构建与包体、Codex 审查由主会话在每个分支上依次做。推送和开 PR 仍要运营方同意。

第二波（等运营方决定或第一波合入后）：启动诊断与入口失败兜底（P1-5、P2-15、P2-16）、CI 跑全量（P1-4）、地区接口限流（P1-3）、文档与契约测试清理。
