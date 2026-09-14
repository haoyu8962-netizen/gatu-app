# ADR 0008：全市场行情改用公开 WebSocket 的紧凑频道 `pac`/`sac`

- 状态：已采用（2026-09-14），随 p16 发布到 `*.cloudfront.net`
- 前置：[ADR 0003](0003-orderbook-transport-isolation.md)（订单簿传输隔离）、[ADR 0005](0005-spa-static-shell.md)（静态壳）
- 证据：[任务记录](../work-memory/sessions/2026-09-13-spa-shell-spike.md)第二十三、二十七检查点

## 背景与约束

终端启动就订阅两个全市场快照：`allDexsAssetCtxs`（每帧约 115 KB 明文 JSON，含全部 perp dex）与 `spotAssetCtxs`（约 152 KB，819 个现货对），每 3–4 s 重发一次；同机对比里我们 6 s 内收 584 K 字符，官方站只收 151 K。官方站订阅的是 `pac`/`sac`：每帧一个 base64 + raw DEFLATE 压缩串，线上 17 KB / 30 KB，解压后是同一份数据的子集。2026-09-14 用 Node 直接对 `wss://api.hyperliquid.xyz/ws` 核实：公开主机接受 `{"type":"pac"}`/`{"type":"sac"}`，`pac` 解压后是 `[[dex, ctx[]], ...]`，dex 顺序与每个 dex 的数组长度、索引与 `allDexsAssetCtxs.ctxs` 完全一致（234 个主 dex 条目 0 处错位，`midPx` 为 null 的位置也一致），字段少了 `premium`、`impactPxs`；`sac` 解压后是按现货对名（`@index`、`PURR/USDC`）索引的对象，覆盖 `spotMeta.universe` 全部 327 个名字与 `spotAssetCtxs` 全部 819 个 coin，字段少了 `coin`、`totalSupply`。应用没有读 `premium`/`impactPxs`；`totalSupply` 来自 token 详情请求，不来自这条流。约束：市场目录、订阅所有权与 Provider 层级不变；解压能力缺失或流损坏时必须仍能拿到行情；SDK 版本钉住 0.33.3，它没有这两个频道。

## 决策

1. **hl-react 自带这两个频道。** `subscriptions/compact-asset-ctxs.ts` 复用 `l2` 增量流的 `inflateL2CompressedPayload`（限额 512 KB base64 / 4 MB 解压）按到达顺序串行解码，校验形状（`pac` 为 `[string, object[]][]`，`sac` 为 `Record<string, object>`），第一帧解码失败即退订并通过 `onError` 上报，与传输失败同一路径；`CompactSubscriptionClient extends SubscriptionClient` 增加 `pac`/`sac` 方法，`useSubscription` 的方法联合类型改为从它推导，因此 store、节流、陈旧看门狗（20 s）与载荷上限（1 MB）对新频道一视同仁。
2. **应用按名字取现货行情，按索引取 perp 行情。** `useMarketsInfo` 在浏览器支持 `DecompressionStream("deflate-raw")` 时订阅 `pac`/`sac`，否则订阅原频道；`pac` 直接替代 `allDexsAssetCtxs.ctxs`（同索引），现货行情统一成按市场名索引的对象（原数组按 `coin` 转换），`spotMarketsInfo` 用 `market.name` 查找而不再用 `ctxIndex`（两者在线上等价：`ctxIndex` 就是 `pair.index`）。会话级统计缓存改存这两个形状，键升到 `hl-mkt-stats-v2`。
3. **失败即回退，只报一次。** 任一紧凑流进入错误态（解码失败、订阅被拒、重连冷却）就在本次会话内切回 `allDexsAssetCtxs`/`spotAssetCtxs`，并以 `market_ctxs_compact_fallback` 上报一次，便于在接收器里观察频率；`fastAssetCtxs`（1 s 一帧、同样压缩）与选中市场的 `activeAssetCtx` 不变。

## 备选方案与取舍

- 保留全量快照、只把它们推迟到首屏之后：首屏之后仍每 3 s 解析 267 KB 明文，移动端流量不降；官方站已证明紧凑频道足够，否决。
- 只订阅当前市场与收藏：市场选择器与收藏栏首次打开要再等一轮快照，且 `activeAssetCtx` 逐个订阅的数量随收藏增长；紧凑频道每帧 47 KB 已经足够便宜，否决。
- 通过 SDK 补丁加方法：补丁维护成本高于在 hl-react 里扩展客户端类，且 `l2` 增量流已是同样的做法，否决。

## 后果与边界

- 线上每 3.75 s 周期的全市场行情从约 267 KB 降到约 47 KB（base64），主线程解析量与原来同量级（解压后 90 KB + 203 KB）；解压走 `DecompressionStream`。
- `sac` 还包含约 900 个 `#` 前缀的键（不在 `spotMeta.universe` 里），应用按市场名查找，多余的键不影响。
- 陈旧与载荷守卫按解码后的对象计量；若上游改变格式，形状校验失败会触发回退与上报，不会静默显示错数。
- 验证：单元测试覆盖解码形状、顺序、失败退订与回退；线上用 `tests/browser/ws-race.mjs` 对比 6 s 内收到的字符数。
