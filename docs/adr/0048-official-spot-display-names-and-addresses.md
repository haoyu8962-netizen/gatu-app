# ADR 0048：现货显示名与地址照官方终端的显示名表

- 状态：已接受并实施（2026-11-01，运营方「按官方终端的做法修复剩余审查项」）；分支 `claude/audit-g2-spot-names`，叠在 `claude/audit-group2` 的 `52f9dc18` 上，未推送、未合入 `dev`、未发布。
- 关联：[现货显示名与地址](../spot-market-names.md)（完整规则、同步流程与地址对照，本 ADR 不重复）；[单交易路由](../architecture/trade-single-route-migration.md)；[工具栏设计 History values](../trading-toolbar-redesign.md#history-values)（CSV 导出写交易所原值）；[全功能审查](../work-memory/sessions/2026-10-30-full-feature-audit.md) C3；[第二组调研](../work-memory/sessions/2026-11-01-audit-group2.md)。

## 背景

- Hyperliquid 的 `spotMeta` 只给协议名（`UBTC`、`UPUMP`、`PAIR`），没有显示名。本终端原先的规则是：全名以 `Unit ` 开头、名字以 U 开头的代币去掉开头的 U，另把 `USDT0`、`XAUT0` 换成 `USDT`、`XAUT`。
- 这条规则在主网造成五对重名（PUMP、ANSEM、MON、MOG、SPYX 对 USDC），重名的地址 404；`/trade/PEAR/USDC` 打开的是 `@114`（代币 PEAR），官方打开的是 `@1118`（代币 PAIR）；另有十多个名字与官方不同（FART 对 FARTCOIN、HPENGU 对 PENGU、DZ 对 2Z 等）。
- 官方前端自带一张按网络、代币 index 的显示名表。2026-10-31 生产包 `config-BhZylSmU.js`：`function Rh(e,t,n){return{index:kn(e),l1Name:t,displayName:n}}var zh={Testnet:[…16 项],Mainnet:[…28 项],Local:[],Sandbox:[]}`，现货目录按 index 取名（`i=Hn(Cne(r)??n.name)`）。
- 官方的地址解析在 `index-CT3XnY0E.js` 的 `Fw` 与 `config-BhZylSmU.js` 的 `iO`、`sO`：路径先转大写（含 `-` 或 `:` 时不转），按显示名精确匹配；未知的计价币当作 USDC；`0x<代币 ID>` 按代币 ID 解析；`@N` 与解析不出的地址都转到默认市场 HYPE；解析成功后把地址换成显示名路径。2026-11-01 用无头 Chromium 只读打开官方站核对了 18 个地址（未连钱包、未点任何账户控件），结果与包内逻辑一致。

## 约束

- 协议标识不能变：签名动作与 info 请求里的 API 币名、`name:tokenId`、存储的选中市场、收藏、草稿与 CSV 导出都用协议值，显示名不得发给接口。
- 同一网络里显示名必须唯一，否则两对市场共用一个地址（运营方要求的契约测试）。
- 不在运行时抓取官方资源；表要能按官方包手工同步、并对照 `spotMeta` 校验。
- `docs/architecture/trade-single-route-migration.md` 的路由契约列出 `/trade/%40107`；首页 `/` 在目录加载前就把现货选择重定向到 `@N` 地址；CSV 导出按工具栏设计写交易所原值。

## 决策

1. 删除去 U 规则与 `ASSET_REPLACEMENTS`，改用官方表。`config/spot-token-display-names.ts` 是唯一来源：每个网络一组 `[index, 协议名, 显示名]`，顺序与官方相同，协议名即官方的 `l1Name`。主网照搬 28 项；测试网照搬 16 项中的 13 项，另 3 项（`100 PUMP→PUMP-26`、`1474 UENA→ENA`、`1397 UUENA→ENA`）在测试网的 index 上是别的代币，照搬会把 `AG` 标成 `PUMP-26`、让两个代币都叫 `ENA`，因此不收。
2. 表项只在该 index 上的代币确为记录的协议名时生效，否则该代币用协议名（失败关闭）。表外代币的协议名若与某个表项的显示名相同，显示为 `<名字>-<index>`，即官方表自己给 PUMP-26、ANSEM-19、PEAR-71 用的写法；主网 2026-11-01 不触发，测试网是 BTC-69、SPX-1020、MON-1127（官方在测试网显示两个同名）。
3. 所有显示代币或交易对名字的地方用同一个解析结果：目录驱动的选择器、页头、⌘K、图表、下单与通知照旧自动跟随；余额、成交手续费币种、充值提现记录、Send 弹窗与兑换弹窗里按协议名显示代币的地方改为查 `getTokenDisplayName` 或 `AssetDisplay isToken`。CSV 导出继续写协议值（工具栏设计的规则；官方 CSV 写显示名，此处有意不同）。
4. 地址照官方：`/trade/PEAR/USDC` 打开官方叫 PEAR/USDC 的 `@1118`；未知计价币按 USDC 打开；支持 `0x<代币 ID>` 与 `0x<base>/0x<quote>`；协议名和本终端旧名（`UBTC/USDC`、`FART/USDC`）解析不出；解析成功但地址不是显示名路径时换成显示名路径。
5. 解析不出的地址在目录可作结论后换到默认市场（本终端的 `DEFAULT_MARKET_NAME`，即 BTC），格式错误的一、二段地址立即换；默认市场本身解析不出时仍显示 404 页，避免循环。所有重定向都用 replace，并保留 `?scope=all`。
6. 与官方不同、保留的做法：`@N` 地址继续打开该市场并换成显示名路径（官方转到默认市场）；大小写不敏感的唯一匹配继续保留（官方只转大写，所以 `pump-26/usdc` 和测试网含小写字母的名字在官方打不开）；USDH 计价的交易对照常可打开（官方 `Ine=['USDH']` 把它们转到默认市场，与本项无关，留待单独决定）；三段以上的路径仍走应用的 404 路由（官方的兜底路由转到 `/trade`）。

## 备选方案

| 方案 | 取舍 |
| --- | --- |
| 保留去 U 规则，只给重名加后缀 | 改动最小；名字仍与官方不同，`PEAR/USDC` 仍指向另一个市场。未采用 |
| 运行时读取官方前端包里的表 | 自动跟上官方；依赖官方未公开的文件与结构，并把第三方脚本内容带进运行时。未采用 |
| 测试网整表照搬 | 与官方逐字一致；测试网会出现错标与重名，违反唯一性约束。未采用 |
| 重名时最后一个获胜（官方的实际效果） | 与官方完全一致；被覆盖的市场无法通过地址打开（测试网 `@50`）。未采用，改用决策第 2 条的 index 后缀 |
| `@N` 照官方转到默认市场 | 与官方一致；会让首页重定向、导航 Trade 链接与已经发出的 `@N` 链接落到 BTC。未采用（决策第 6 条） |
| 为本终端旧名保留别名（`FART/USDC` 等） | 旧书签不失效；官方没有这些名字，别名会让同一市场有两个地址并长期维护一张私有表。未采用 |
| 解析不出时保留 404 | 地址错误一目了然；与官方不同，运营方要求照官方。未采用 |

## 后果与边界

- 地址含义变化（主网 2026-11-01）：`/trade/PEAR/USDC` 从 `@114` 变为 `@1118`；`DZ`、`FART`、`HNIL`、`HPENGU`、`HSEI`、`MEGA`、`MMOVE`、`ONEAR`、`PAIR`、`VIRT`、`WLD`、`WMNT` 对 USDC 的旧地址从打开市场变为转到 BTC；PUMP、ANSEM、MON、MOG、SPYX 对 USDC 等此前 404 的地址现在能打开。完整清单见[专题文档](../spot-market-names.md#addresses)。
- 表靠手工同步：官方改表后，本终端在下次同步前显示旧名，新上市且与表中名字冲突的代币先按决策第 2 条加后缀。同步流程与校验命令见专题文档的 Re-sync。
- 余额、成交手续费、充值提现与 Send 弹窗原先显示协议名（`UBTC`），现在显示 `BTC`；余额行的图标改用显示名的 `_spot` 图标（官方 CDN 上 HYPE、PURR、PUMP、BTC 等都有，PUMP-26、PEAR-71 没有，与官方一样退回首字母）。
- 未改：现货成交、委托在可访问名称 `Switch to {coin} market` 和成交、委托历史页市场筛选里仍显示 API 币名（`@142`），改动需要新的翻译，列为后续。
- 网站只链接永续市场，分享卡只有永续仓位，不受影响。
- 包体：本次没有生产构建（运营方要求不在共享机器上跑）。用仓库的 esbuild 逐模块压缩后 gzip 估算（不含 React Compiler，与改动前 `52f9dc18` 比）：表 +467、`market-route.ts` +264、`domain/market/tokens.ts` +65、`use-markets.tsx` +58、`orderbook-boot.ts` +16、`config/tokens.ts` −27，都在交易页启动闭包（`MarketsProvider` 在 `client-root`）；`trade-terminal-page.tsx` +30（该 chunk 余量只有几百字节）；余额、成交、充值提现、Send 等组件各 +5 至 +44；合计约 +1.1 KB。把表压成一个字符串只省约 43 字节、还要加解析代码，因此保留与官方同序的元组。实际增量以 CI 的 `check-client-bundle-budget` 为准。

## 验证

- 实际运行（2026-11-01，本分支，聚焦测试）：`market-catalog`（官方名字、表项失败关闭、index 后缀、测试网表、`getTokenDisplayName`）、`spot-token-display-names-contract`（每个网络 index 与显示名唯一、表项与 2026-11-01 `spotMeta` 快照一致、测试网三项不收的理由、主网不加后缀、每个市场的地址都解析回它自己、官方实测的八个地址）、`market-route`、`market-route-canonical`、`orderbook-boot`、`trade-terminal-page-boot`，以及余额、成交、TWAP、成交历史页、充值提现、Send 与兑换弹窗、`AssetDisplay` 的显示测试；`pnpm --filter @sairn/terminal typecheck`；改动文件的 Biome。
- 先失败：新增的 22 项命名与地址测试在原代码上失败，14 项显示面测试在上一提交上失败。
- 变异：33 处关键行逐一改坏（表项守卫、后缀、网络、表内容、图标、显示名查找、`isToken`、各处手续费与记录、Send 的显示与发送、计价币回退、代币 ID 分支、默认市场与防循环、重定向、replace、404 条件、路径解析、启动预取）均被测试抓到，已全部还原。
- 未做：全量单测、生产构建与包体测量、浏览器回归套件、真机与真实账户验收；官方行为只在桌面无头 Chromium 下核对。
