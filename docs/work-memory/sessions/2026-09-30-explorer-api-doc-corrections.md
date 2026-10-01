<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-30-explorer-api-doc-corrections",
  "date": "2026-09-30",
  "title": "Explorer 接口核查与参考文档更正",
  "kind": "task",
  "status": "verified",
  "topics": ["hyperliquid-api"],
  "summary": "SDK 0.33.3 的 ExplorerClient 有 blockDetails、txDetails、userDetails、explorerBlock、explorerTxs 五个方法，生产代码未调用，判断接入收益小、不接入。请求走 https://rpc.hyperliquid.xyz/explorer，订阅只在 wss://rpc.hyperliquid.xyz/ws 推送；默认 WebSocket 地址（API 主机）接受订阅但不推数据也不报错。据此更正方法目录、hyperliquid-api 技能参考，并给覆盖审查、研究记录和两份归档快照追加更正说明；快照正文未改。实测均为 2026-09-30 单点采样，线上 CSP 响应头未取，未改应用代码。",
  "thread": null,
  "baseCommit": "86191b56",
  "commits": [],
  "sources": [
    { "path": "docs/hyperliquid-sdk-directory.md" },
    { "path": "docs/hyperliquid-sdk-coverage-review.md" },
    { "path": "docs/hyperliquid-sdk-1.md" },
    { "path": "docs/hyperliquid-sdk-2.md" },
    { "path": "packages/hyperliquid-api/SKILL.md" },
    { "path": "packages/hyperliquid-api/README.md" },
    { "path": "packages/hyperliquid-api/research.md" },
    { "path": "packages/hyperliquid-api/references/api-selection.md" },
    { "path": "packages/hyperliquid-api/references/method-index.md" },
    { "path": "packages/hl-react/src/explorer.ts" },
    { "path": "apps/terminal/src/config/security-headers.ts" },
    { "url": "https://nktkas.gitbook.io/hyperliquid/clients" },
    { "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/explorer-methods/blockdetails" }
  ],
  "supersedes": []
}
-->
# Explorer 接口核查与参考文档更正

## 背景与范围

同步记录。用户先问 SDK 开发文档里有没有官方浏览器页（`app.hyperliquid.xyz/explorer`）对应的接口、接入收益大不大；随后追问「文档错误」是否有依据、是否交叉验证；最后同意按建议修正：只改现行参考，归档快照只在横幅补说明。

本会话运行在应用创建的 worktree `sdk-hyperliquid-api-review-9bc704`（分支 `claude/sdk-hyperliquid-api-review-9bc704`，基线 `86191b56`，即 `main`；开始时工作区干净）。`origin/dev` 当时领先两个只改工作记录的提交（头 `5bac5ac7`），本分支没有合入它们。未取得可核对的任务标识，`thread` 记为 null。

只改了文档和 Agent 参考资料，没有改应用代码。

## 结论与依据

**接口是否存在、是否接入**

- 锁定的 `@nktkas/hyperliquid` 0.33.3 有独立的 `ExplorerClient`，共五个方法：请求 `blockDetails({height})`、`txDetails({hash})`、`userDetails({user})`，订阅 `explorerBlock`、`explorerTxs`。交易对象的字段是 `time`、`user`、`action`、`block`、`hash`、`error`。
- 生产代码没有调用其中任何一个；`packages/hl-react/src/explorer.ts` 只拼官方浏览器页的外链。
- 判断为收益小、不接入，与 2026-09-27 覆盖审查把它归为「不适用」一致。依据：`userDetails` 的请求只有 `type` 和 `user` 两个字段，没有分页参数，实测三次都返回 300 条，HLP 金库地址的 300 条只覆盖约 53 分钟；`txDetails` 需要先有哈希，而有哈希的成交和流水本来就已确认；区块流实测 5 秒 69 帧，单个区块 1,069 笔交易、约 35 万字节，站内浏览器页与交易终端的定位不符。这是基于上述证据的判断，不是测量。

**端点事实**

- 请求：`HttpTransport` 把 `explorer` 请求发到 `rpcUrl`，默认 `https://rpc.hyperliquid.xyz/explorer`（测试网 `https://rpc.hyperliquid-testnet.xyz/explorer`）。同样的请求发到 `api.hyperliquid.xyz/info` 返回 422（该端点对未知 `type` 的通用响应），发到 `api.hyperliquid.xyz/explorer` 返回 404。
- 订阅：只有 `wss://rpc.hyperliquid.xyz/ws`（测试网 `wss://rpc.hyperliquid-testnet.xyz/ws`）推送数据。`WebSocketTransport` 默认连 API 主机，在那里订阅会得到确认和一帧空数组，之后没有事件；SDK 只分发非空数组，所以回调不会触发，也没有错误。
- 归属变化：0.33.0 起这五个方法归 `ExplorerClient`；0.29.1 到 0.32.2 的三个请求挂在 `InfoClient`、两个订阅挂在 `SubscriptionClient`，但请求当时也已发往 RPC 主机。
- SDK 对三个请求的 `@see` 是 `null`，没有链接到 Hyperliquid 官方文档页面。

**做了哪些更正**

| 文件 | 性质 | 处理 |
| --- | --- | --- |
| `docs/hyperliquid-sdk-directory.md` | 现行参考 | 直接改：定义 X 类型的端点与传输要求；说明快照的归类早于 0.33.0、GitBook 方法页的 `servers` 同样写错；重算快照定位表的行号并加 Explorer 行 |
| `packages/hyperliquid-api/SKILL.md`、`README.md`、`references/api-selection.md`、`references/method-index.md` | 现行参考 | 直接改：把 `Explorer` 作为第四个面，给出路由规则、返回来源和传输要求；方法索引里的 Explorer 一节从 Info 移出并补全五个方法 |
| `packages/hyperliquid-api/research.md` | 研究记录 | 原文保留，追加两条注明日期的更正 |
| `docs/hyperliquid-sdk-coverage-review.md` | 审查记录 | 原句保留，行内加指向，文末追加更正一节 |
| `docs/hyperliquid-sdk-1.md`、`docs/hyperliquid-sdk-2.md` | 归档快照 | 只在横幅追加已知不准确之处，方法页正文不动 |

快照横幅增加了行数，所以方法目录的定位表按当前标题位置重算；重算前各区间边界已经与实际位置相差 2 到 16 行。

**对第一轮回答的修正**

第一轮把四处都称为「文档错误」，交叉验证后收窄为：

- 快照里的 `POST /info` 与 API 主机不是本仓库抄错，而是自 2026-01-02（`e38057d3`）起原样存档的上游自动生成内容；同一文件对 `rpcUrl` 的说明是对的。
- API 主机对 explorer 订阅不是拒绝，而是静默无数据。
- 方法索引是过时而不是写错：写于 2026-04-09，当时锁定的 0.31.0 里这些方法确实在 `InfoClient`；索引本来就不穷举，「漏了三个方法」说重了。
- 覆盖审查的「补 CSP」是不精确：对订阅成立，对它所举的按哈希核验场景不成立。
- 「方法目录是对的」只对五行方法成立，它另有三处不精确，本次已改。

**未采用**

- 不改写快照的方法页：它们是归档，改写会让它不再是存档；现行事实放在方法目录。
- 不动历史材料：`review_75aa7887_batch.md`、`research/` 下两处表述只在本记录里点名。
- 不改 `docs/README.md` 对快照的一句描述（「已归档的 0.33.1 schema」）和技能的 `references/subscriptions.md`，它们不在用户同意的范围内。

## 验证与限制

全部线上实测在 2026-09-30 08:17–09:26 UTC 进行，单台机器，请求体只用公开地址（HLP 金库）和它返回的公开区块、交易。

本会话直接执行：

- `curl` 对 `rpc.hyperliquid.xyz/explorer` 发三种请求均 200；`txDetails` 发到 `api.hyperliquid.xyz/info` 得 422，发到 `api.hyperliquid.xyz/explorer` 得 404。
- 用锁定的 SDK 0.33.3（Node 24.15.0）运行 `ExplorerClient`：默认 `HttpTransport` 三个请求都成功；默认 `WebSocketTransport` 上两个 explorer 订阅 12.5 秒内回调 0 次，同一连接上的 `allMids` 对照收到 3 次事件，没有错误和断连；指向 `wss://rpc.hyperliquid.xyz/ws` 的传输 8 秒内区块回调 120 次、交易回调 119 次。
- 失败也记录在案：同一脚本里三个 HTTP 请求的首次尝试各有一次 `ECONNRESET`，重试后成功；另一次运行中 RPC WebSocket 在 4.3 秒时以 1006 关闭、未能订阅。原因未查，可能与本机网络有关。
- 方法数用文件清单核对：Info 77、Exchange 59、Subscription 28、Explorer 5。`git log -S` 确认 `https://rpc.hyperliquid.xyz` 于 2026-08-05（`a10b0edd`）进入 `security-headers.ts`。

由本会话的 9 个只读子代理执行并报告（每条结论两个角度，另加一轮全仓检索）：

- 三个请求在主网、测试网对 `/info` 全部 422，对 RPC 主机的 `/explorer` 全部 200，另试 11 种请求体变体仍为 422。
- 原生 WebSocket 在 API 主机（主网、测试网）订阅只得到确认和一帧空数组，最长观察 30 秒；RPC 主机 6 秒 82 到 103 帧。
- 读取已发布的 0.29.1、0.30.2、0.31.0、0.32.0、0.32.2、0.33.0、0.33.1 包内容，确定归属变化发生在 0.33.0，且各版本都走 `explorer` 端点。
- 用已提交的边缘函数产出的策略在无头 Chromium 147 中实测：POST `https://rpc.hyperliquid.xyz/explorer` 放行，`wss://rpc.hyperliquid.xyz/ws` 被 `connect-src` 拦截。
- 用仓库的 TypeScript 5.7.2 对照锁定声明做类型检查：五个方法在 `ExplorerClient` 上通过，在 `InfoClient`、`SubscriptionClient` 上报 TS2339。

限制：

- 所有线上结果是单日、单出口的采样，每种组合 1 到 3 次；端点行为以后可能变化。
- 线上站点实际下发的 CSP 响应头没有取，CSP 结论基于已提交的源文件和边缘函数。
- 上游 GitBook 没有历史版本可比，「快照是原样存档的上游内容」由仓库 Git 历史加当前上游页面的写法推断。
- 「官方浏览器页使用这组接口」沿用 2026-09-27 覆盖审查的说法，本次没有抓官方页面的网络请求。
- 没有运行应用、单元测试或浏览器套件；本次没有改应用代码。

## 后续与替代关系

- 没有必须跟进的事项。若将来要用 explorer 订阅，先在 `security-headers.ts` 补两个 `wss://rpc…` 来源并重新渲染、发布边缘函数；三个请求不需要改 CSP。
- 升级 SDK 或重新导出快照时，重算方法目录定位表的行号。
- 没有被替代的记录。2026-09-27 的覆盖审查结论不变，只有 Explorer 一行的接入前提被更正。
- 2026-10-01 补记：本会话结束时这些改动没有提交。另一会话在用户要求下把它们原样移到基于 `dev`（`bd1a6959`）的分支 `docs/explorer-api-doc-corrections` 提交，并开 PR 进 `dev`；文档与本记录正文未改，基线 `86191b56` 到 `bd1a6959` 之间这些文件在 `dev` 上没有变化。
