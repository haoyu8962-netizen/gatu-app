# ADR 0047：不保留本地行情统计快照

- 状态：已接受并实施（2026-11-01）。运营方规则：按官方终端的做法修复审查遗留项，与 `AGENTS.md` 契约或归属文档冲突时以契约为准并记录偏差。分支 `claude/audit-g2-selector`（基于 `claude/audit-group2` 的 `52f9dc18`），未合入 `dev`、未发布。
- 取代：[ADR 0008](0008-compact-market-context-channels.md) 决策 2 末句的会话级统计缓存（`hl-mkt-stats-v2`），以及决策 3 中「会话缓存存的是合并后的视图，恢复时用视图解析器校验，损坏即丢弃」一句。ADR 0008 的其余决策（紧凑频道、累积器、失败回退与上报）不变。
- 关联：[移动端数据展示规范](../mobile-data-presentation.md)（被动数据与行情来源）；[资金费率对比页](../funding-comparison.md)（`perpContextsLive`）；[全功能审查第二组记录](../work-memory/sessions/2026-11-01-audit-group2.md) M4。

## 背景

- `useMarketsInfo` 把全市场资产上下文（`pac`/`sac`，或回退后的 `allDexsAssetCtxs`/`spotAssetCtxs`）合并后的视图写进 sessionStorage `hl-mkt-stats-v2`。`MarketsInfoProvider` 挂载时读一次，5 分钟内的快照在实时帧到达前整份替代资产上下文。
- 审查 M4 指出三个问题：
  1. 年龄只在挂载时检查。挂载后快照一直用到首个实时帧，不再判断年龄。
  2. 从推荐、加入、排行榜（`MARKET_STATS_IDLE_ROUTE_PREFIXES`，在这些页面订阅关闭）回到交易页时订阅重新打开，回退的仍是挂载时读入的快照，可能早已超过 5 分钟。
  3. `fastAssetCtxs` 的实时标记价、中间价叠加在快照的旧 `prevDayPx` 上：选择器、收藏栏和手机交易头的 24h 涨跌按「新价格 / 旧前日价」计算。`prevDayPx` 每分钟滚动，几分钟的旧值就让涨跌出错。
- 官方终端（2026-10-31 生产包 `config-BhZylSmU.js`）不在本地保存全市场上下文：现货与永续两个 Provider 都从空对象开始，只在订阅回调里写入（`eoe`：`[n,r]=(0,z.useState)({})` 后 ``e.subscribe({type:`sac`},…)``；`zoe`：`[r,i]=(0,z.useState)({})` 后订阅 ``{type:`pac`}``），首帧前选择器与收藏栏显示 `--`。官方在本地存的行情值只有图表选价格刻度用的 `[coin, px]`（sessionStorage 与 localStorage 键 `hyperliquid.tv_coin_and_px.v6`，`WX` 取 `10**L3((n||1e3)*.95,…)`），不是全市场统计。
- 首帧时间：2026-11-01 在本机经公开 WebSocket（`wss://api.hyperliquid.xyz/ws`，无账户数据）单次订阅，`fastAssetCtxs` 首帧在连接打开后约 450 ms、`pac` 与 `sac` 约 555 ms（经本机代理，单样本）。审查记录中调研代理测得官方页面首帧在连接后 170–440 ms。

## 约束

- [被动数据规范](../mobile-data-presentation.md)：首帧未到时用各处已有的稳定占位，不显示加载、过期或错误文字；不得把旧值当作当前值，也不得把实时价格与旧的 `prevDayPx` 拼在一起。
- [启动渲染](0010-blank-until-ready-startup.md)与 [ADR 0012](0012-trade-route-reveal-after-surface-preload.md)：`bootTradeRoute` 只等惰性片段，市场就绪看市场目录（`getTradeTerminalBootStatus` 读 `catalogState` 与路由市场），行情头用 `activeAssetCtx` / `activeSpotAssetCtx`，都不读这份快照；市场目录自己的持久缓存不在本 ADR 范围内。
- 订阅、累积器、紧凑频道失败后的回退与一次性上报（ADR 0008 决策 1、3）不变；默认市场是固定配置（`DEFAULT_MARKET_KEY`），选择器默认按成交量排序，没有逻辑依赖快照。

## 决策

1. 删除 `hl-mkt-stats-v2` 的读写：`useMarketsInfo` 只用当前订阅送达的帧，首帧前资产上下文字段（`prevDayPx`、成交量、资金费率、未平仓量、流通量）为空。同时删除 `MARKETS_STATS_TTL_MS`，以及只为恢复快照存在的 hl-react 视图解析器 `parseCompactPerpAssetCtxsView` / `parseCompactSpotAssetCtxsView`。
2. 按仓库处理旧存储键的既有做法，键改名为 `STORAGE_KEYS.LEGACY_MARKETS_STATS`，客户端运行时加载时（`providers/client-root.tsx`，与 `LEGACY_METADATA`、`LEGACY_RECENT_WALLETS` 同处）从 sessionStorage 删除一次，释放旧版本在当前标签页留下的数据。
3. 首帧前各处显示自己已有的占位，与改动前没有快照的冷启动（新标签页、快照超过 5 分钟）完全相同；不新增占位类别，也不新增文字。
4. `perpContextsLive` 的定义不变（当前来源有帧、`active`、未过期）；「只有会话缓存」这一情形不再存在。

## 备选方案

| 方案 | 取舍 |
| --- | --- |
| 保留快照，每次读取都检查年龄 | 解决挂载后不再判断年龄的问题，但快照的 `prevDayPx` 仍会与实时价格拼在一起，5 分钟内的涨跌照样可能错。未采用 |
| 只把快照用作排序提示，不显示数值 | 选择器默认按成交量排序，首帧通常在 1 秒内到达，提示价值小；仍要维护存储格式、校验与迁移。未采用 |
| 快照里的价格与 `prevDayPx` 一起用，不叠加实时价格 | 数值自洽但仍是旧值：首帧前显示几分钟前的价格与涨跌，违背被动数据规范。未采用 |

## 后果与边界

- 首帧前（实测通常不到 1 秒）选择器、收藏栏、命令菜单等处显示占位，与官方一致；首帧之后的行为与改动前相同。
- 从推荐、加入、排行榜回到交易页时，订阅重新建立前同样显示占位，不再显示旧快照。
- 选中市场的行情头不受影响（它用 `activeAssetCtx` / `activeSpotAssetCtx`）。`useSelectedMarketInfo` 的上次标记价缓存（`hl-last-mark-v2`，按网络与币种，1 小时）不在本 ADR 范围内：它只给选中市场补 `markPx`，作用与官方图表的 `tv_coin_and_px` 类似。
- 已打开的标签页升级后第一次加载客户端运行时就会删掉旧键；关闭的标签页本来就不保留 sessionStorage。
- 包体：删去缓存读写、校验与两个 hl-react 解析函数，预计略小；没有构建测量。

## 验证

- `use-markets-info-subscriptions.test.tsx`：实时帧不写入 sessionStorage；存储里有旧版本快照、两条上下文订阅尚无帧而 `fastAssetCtxs` 已实时时，永续与现货行只有实时价格，`prevDayPx`、`openInterest`、`dayNtlVlm` 为空、现货行没有 `circulatingSupply`，`perpContextsLive` 为假。
- `client-root-theme-lifecycle.test.tsx`：客户端运行时加载时删除 `hl-mkt-stats-v2`，不动其他 sessionStorage 键。
- `compact-asset-ctxs.test.ts`：删去视图解析器的用例，其余解码、累积与订阅用例照旧。
- 失败在先：三条新断言在改动前的实现上失败（实时帧写入了快照；首帧前读出快照的 `prevDayPx` `80000`；运行时不删旧键）。
- 变异：重新写入 sessionStorage、首帧前重新读取快照、删去旧键清理，各自让对应测试失败，均已还原。
- 未做：浏览器实测首帧前的占位与返回交易页的场景、真机验收、构建与包体测量。
