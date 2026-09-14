# ADR 0008：全市场行情改用公开 WebSocket 的紧凑频道 `pac`/`sac`

- 状态：已采用（2026-09-14），随 p16 发布到 `*.cloudfront.net`；对抗审查与线上复测后改为快照 + 增量累积，随 p18 发布
- 前置：[ADR 0003](0003-orderbook-transport-isolation.md)（订单簿传输隔离）、[ADR 0005](0005-spa-static-shell.md)（静态壳）
- 证据：[任务记录](../work-memory/sessions/2026-09-13-spa-shell-spike.md)第二十三、二十七检查点

## 背景与约束

终端启动就订阅两个全市场快照：`allDexsAssetCtxs`（每帧约 115 KB 明文 JSON，含全部 perp dex）与 `spotAssetCtxs`（约 152 KB，819 个现货对），每 3–4 s 重发一次；同机对比里我们 6 s 内收 584 K 字符，官方站只收 151 K。官方站订阅的是 `pac`/`sac`：每帧一个 base64 + raw DEFLATE 压缩串，订阅后的第一帧是全量快照（线上约 17 KB / 30 KB，解压后是同一份数据的子集），之后每帧只含变化了的条目与字段（约 1–10 KB；对抗审查后复测发现，最初的核实只看了首帧）。2026-09-14 用 Node 直接对 `wss://api.hyperliquid.xyz/ws` 核实：公开主机接受 `{"type":"pac"}`/`{"type":"sac"}`，`pac` 解压后是 `[[dex, ctx[]], ...]`，dex 顺序与每个 dex 的数组长度、索引与 `allDexsAssetCtxs.ctxs` 完全一致（234 个主 dex 条目 0 处错位，`midPx` 为 null 的位置也一致），字段少了 `premium`、`impactPxs`；`sac` 解压后是按现货对名（`@index`、`PURR/USDC`）索引的对象，覆盖 `spotMeta.universe` 全部 327 个名字与 `spotAssetCtxs` 全部 819 个 coin，字段少了 `coin`、`totalSupply`。应用没有读 `premium`/`impactPxs`；`totalSupply` 来自 token 详情请求，不来自这条流。约束：市场目录、订阅所有权与 Provider 层级不变；解压能力缺失或流损坏时必须仍能拿到行情；SDK 版本钉住 0.33.3，它没有这两个频道。

## 决策

1. **hl-react 自带这两个频道。** `subscriptions/compact-asset-ctxs.ts` 复用 `l2` 增量流的 `inflateL2CompressedPayload`（限额 512 KB base64 / 4 MB 解压）解码，把每帧解析成类型化的增量：出现的字段必须是十进制字符串（`midPx` 允许 null），只保留已知字段；`pac` 按索引寻址，任一条目损坏即整帧无效，`sac` 按名字寻址，损坏条目被丢弃、全部无效才算格式变化。每个订阅持有累积器：第一帧必须每个条目字段齐全，否则视为格式变化；之后逐帧按 dex 索引或市场名合并，回调收到的是合并后的视图，字段未齐的条目在视图里保持缺席。帧按到达顺序解码与合并，积压超过 64 帧就终止流而不是跳过增量；退订后停止解码与回调；解码失败在服务器确认前让 `subscribe` 的 Promise 拒绝，确认后退订并经 `onError` 上报一次，与传输失败同一路径；`CompactSubscriptionClient extends SubscriptionClient` 增加 `pac`/`sac` 方法，`useSubscription` 的方法联合类型改为从它推导，因此 store、节流、陈旧看门狗（20 s）与载荷上限（1 MB）对新频道一视同仁。
2. **应用按名字取现货行情，按索引取 perp 行情。** `useMarketsInfo` 在浏览器支持 `DecompressionStream("deflate-raw")` 时订阅 `pac`/`sac`，否则订阅原频道；`pac` 直接替代 `allDexsAssetCtxs.ctxs`（同索引），现货行情统一成按市场名索引的对象（原数组按 `coin` 转换），`spotMarketsInfo` 用 `market.name` 查找而不再用 `ctxIndex`（两者在线上等价：`ctxIndex` 就是 `pair.index`）。会话级统计缓存改存这两个形状，键升到 `hl-mkt-stats-v2`。
3. **失败即回退，只报一次。** 任一紧凑流进入错误态（解码失败、订阅被拒、重连冷却）就切回 `allDexsAssetCtxs`/`spotAssetCtxs`，回退决定记在模块级的 `markets/market-ctxs-fallback.ts`，与页面会话同寿命（`MarketsInfoProvider` 在文档路由往返时会重建，不能靠组件状态），并以 `market_ctxs_compact_fallback` 上报一次，便于在接收器里观察频率；会话缓存存的是合并后的视图，恢复时用视图解析器校验，损坏即丢弃；`fastAssetCtxs`（1 s 一帧、同样压缩）与选中市场的 `activeAssetCtx` 不变。

## 备选方案与取舍

- 保留全量快照、只把它们推迟到首屏之后：首屏之后仍每 3 s 解析 267 KB 明文，移动端流量不降；官方站已证明紧凑频道足够，否决。
- 只订阅当前市场与收藏：市场选择器与收藏栏首次打开要再等一轮快照，且 `activeAssetCtx` 逐个订阅的数量随收藏增长；紧凑频道每帧 47 KB 已经足够便宜，否决。
- 通过 SDK 补丁加方法：补丁维护成本高于在 hl-react 里扩展客户端类，且 `l2` 增量流已是同样的做法，否决。

## 后果与边界

- 线上全市场行情从每 3.75 s 约 267 KB 明文降到首帧约 47 KB（base64）加每帧 1–10 KB 的增量；首帧解压后 90 KB + 203 KB 与原来同量级，其后主线程只解析增量并做一次浅合并；解压走 `DecompressionStream`。
- `sac` 还包含约 900 个 `#` 前缀的键（不在 `spotMeta.universe` 里），应用按市场名查找，多余的键不影响。
- 陈旧与载荷守卫按合并后的视图计量；若上游改变字段类型、首帧不再完整或删除应用读取的字段，校验失败会触发回退与上报，不会静默显示错数；新增字段被忽略。
- 断线后 SDK 重新订阅，服务器再发一次全量快照，累积器把它合并进现有状态（下架市场的旧条目会留到页面刷新，与原频道每帧全量覆盖不同，但消费者按目录取值，不受影响）。
- 验证：单元测试覆盖解码形状、顺序、失败退订与回退；线上用 `tests/browser/ws-race.mjs` 对比 6 s 内收到的字符数。
