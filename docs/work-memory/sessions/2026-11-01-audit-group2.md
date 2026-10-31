<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-01-audit-group2",
  "date": "2026-11-01",
  "title": "全功能审查确认问题第二组：无价代币计 0、订单簿点击保留订单类型（C7），其余八项的官方做法与待决事项",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry", "market-recovery", "account-funding", "hyperliquid-api"],
  "summary": "运营方「继续修复剩下存在的问题」。分支 claude/audit-group2，叠在 PR #131 分支 claude/audit-confirmed-fixes 的 c29cb2c0 上（本地，未推送）。按官方终端修完两项：余额表无价代币的 USDC 价值计 0（不再回落到入账成本 entryNtl），以及点击订单簿档位时按官方映射订单类型（市价→限价、止损市价→止损限价，限价类只更新价格，TWAP、Scale、止盈市价不动）。三个只读调研代理核对了其余八项（M2、M9、C5、M4、C9、C3、E5、手机成交筛选）的我方现状与官方 2026-10-31 生产包，修法都牵涉布局、链接、设置或契约范围，按项列出待运营方决定的问题，未改代码。",
  "thread": null,
  "baseCommit": "c29cb2c0",
  "commits": [],
  "sources": [
    {"path": "docs/work-memory/sessions/2026-10-30-full-feature-audit.md"},
    {"path": "docs/work-memory/sessions/2026-11-01-audit-confirmed-fixes.md"},
    {"path": "docs/trading-toolbar-redesign.md"},
    {"path": "docs/order-entry-surface-parity.md"},
    {"path": "docs/orderbook-layout.md"},
    {"path": "docs/mobile-data-presentation.md"},
    {"path": "docs/adr/0008-compact-market-context-channels.md"}
  ],
  "supersedes": []
}
-->
# 全功能审查确认问题：第二组

## 背景与范围

同步记录，未取得任务标识。PR #131（第一组）推送后，运营方答「继续修复剩下存在的问题」，要求仍按官方终端的做法修。

- 分支 `claude/audit-group2`，叠在 PR #131 分支的 `c29cb2c0` 上，本地、未推送。第一组合入 `dev` 后要按 `dev` 变基；变基会改提交号，引用本分支提交时请按标题。
- 官方依据：2026-10-31 下载的官方生产前端包（`/tmp/claude-501/hl-official-1031/assets/`，未入库）。2026-11-01 的线上包已换名（`index-BWNbZckR.js`、`config-Carig3W2.js`），调研代理逐条复核过引用片段，内容一致。
- 三个只读调研代理分别负责订单簿（M2、M9、C5、C7）、选择器与显示名（M4、C9、C3）、被动数据与手机筛选（E5、手机成交筛选）。它们读了我方代码与官方包；订单簿与选择器两路还在一次性无头 Chromium 里只读打开官方终端与线上 sairn（未登录、未连钱包、未点 Connect 或下单），并订阅公开行情频道计时。下文的实测都出自这些代理的报告，本记录没有重做。

## 结论与依据

### 已修复

| 项 | 问题 | 官方依据 | 修改 | 提交（标题） |
| --- | --- | --- | --- | --- |
| 无价代币 | 没有价格的现货代币在余额表里按入账成本 `entryNtl` 估值 | 官方余额表无价代币的 USDC Value 为 0 | `getSpotUsdValue` 对零、负或读不出的价格一律计 0；可见影响只在余额表的 USDC Value 与 Hide small balances（HYPE 照常保留）；`getTradingToolbarBalanceSummary` 没有生产调用者，充值弹窗不读受影响的汇总 | fix(balances): value a spot balance without a price at zero；fix(balances): say where the unpriced zero shows and pin bad prices；docs(balances): keep HYPE visible in the unpriced balance note |
| C7 | 点击订单簿任一档位，桌面与手机表单都无条件切成限价单，条件单、Scale、TWAP 的设置丢失 | 官方订单簿行 onClick：市价切限价、止损市价切止损限价，然后写共享限价；实测 Stop Market 变 Stop Limit、触发价不动，Scale、TWAP、止盈市价类型不变 | `getOrderTypeForBookPrice`：市价→限价、止损市价→止损限价，限价类只更新价格，TWAP、Scale、止盈市价返回 `null` 不改任何字段；不像官方那样静默写入共享限价（预填只填空值，写入会在看不见的表单留价，并清掉只减仓的数量来源 `sizeSource`）；预填身份用切换后的类型 | fix(trade): keep the order type when a book price is clicked；test(trade): narrow the selected price stub before reading it；refactor(trade): share the book price click and test it on real stores（桌面与手机的选价 effect 合成 `useBookPriceSelection`，一次点击只应用一次） |

### 调研结论与待运营方决定

#### 订单簿

- **M2 表头分组值被截断。** 桌面价格列只占 1:2:2 的五分之一，分组下拉挤在里面：1920 宽 kPEPE 的 `0.000001` 可用 12px、需要 58px，显示成 `0.…`；容器 ≤319px 时「Price」列头还会被隐藏。官方把分组（左）和单位（右）放在列头上方单独的控制行，列头只有文字，1100–1920 宽都不截断。最小修法是同样加一行控制行。待决：多一行约 15px 的布局变化（默认 670px 面板每侧仍是 11 档，行高约降 0.8px）。
- **M9 数量单位两套来源。** 桌面订单簿与手机紧凑簿跟随下单数量单位 `sizeMode`，手机分栏簿与设置开关读全局 `showOrderbookInQuote`；桌面订单簿里没有单位控件。官方只有一个状态（`raw_is_ntl_for_sz_inputs`），订单簿里的单位下拉就是下单数量的单位下拉，切换时按价格换算已输入的数量；设置页没有单位开关；最近成交恒为基础币。待决：删除设置项、订单簿切单位同时换算下单数量、最近成交是否恒用基础币、紧凑簿是否显示单位（建议写 ADR，与 M2 一起做）。
- **C5 盘口数量被缩写。** 我方 ≥10,000 的数量与累计显示 `10M`、`205K`，单元格还会 `truncate`；官方从不缩写（kPEPE 实测 `11,780,616`），窄列允许溢出。去掉缩写后窄宽放不下：紧凑簿 390 宽约只放得下 `54,190,855`，320 宽的价格现在就被截成 `0.0049…`。待决窄宽方案：a 紧凑簿列宽随内容（`1fr auto`，最小 154px，影响 320 宽下单列）；b 去掉 `truncate` 让数字溢出到相邻空白；c 计价改 0 位小数。
- **C7 其余待决：** 官方「点击数量或累计格同时填数量」（设置默认开）是新功能；官方分栏簿的行不可点击，我方可点（`orderbook-layout.md`、`orderbook-hover.md` 写明会填价）。

#### 选择器与显示名

- **M4 本地统计快照。** `useMarketsInfo` 从 sessionStorage `hl-mkt-stats-v2` 读 5 分钟内的快照，只在 Provider 挂载时检查一次年龄；实时帧到达前整份回退到快照，`fastAssetCtxs` 的新价格又和快照里的旧前日价拼在一起。从推荐、加入、排行榜回到交易页时订阅关闭再打开，会落回挂载时读入、可能早已过期的快照。官方没有本地行情缓存，首帧前显示 `--`。实测首帧在连接后约 170–440ms，`prevDayPx` 每分钟滚动。待决：删除缓存（建议，需新 ADR 取代 ADR 0008 的这一部分）还是只留作排序提示。
- **C9 选择器价格用标记价。** 官方选择器的价格、24h 与排序都用 mid（现货、永续都合并快价的 mid），市值与 OI 用标记价；位数为 5 位有效数字加 6/8 − szDecimals 上限并保留尾零。主永续 179 个里 mid 与标记价相差超过 0.1% 的只有 9 个，现货有 mid 的 314 对里 158 对相差超过 1%（多为零成交）。待决：mid 缺失显示占位（建议）还是官方的 −100%；是否与 C2（Strict 名单）一起做；尾零与零变化的 `+` 号。
- **C3 现货显示名与 `/trade/PUMP/USDC` 404。** 我方去掉 `Unit ` 代币名开头的 U，造成 PUMP、ANSEM、MON、MOG、SPYX 五对重名（地址 404）、`PEAR/USDC` 指向与官方不同的市场、另有 12 个名字与官方不同。官方用一张按网络、代币 index 的显示名表（主网 28 项，如 UPUMP→PUMP、PUMP→PUMP-26、UFART→FARTCOIN、PAIR→PEAR、PEAR→PEAR-71），接口不提供这张表。待决：是否照搬官方改名、`PEAR/USDC` 含义变化、解析不出的地址 404 还是像官方重定向默认市场、`@N` 地址是否规范化、表由谁多久同步、是否支持 `0x<代币ID>` 地址。

#### 被动数据与手机筛选

- **E5 质押、推荐、金库详情的被动数据。** 三页都有被动刷新文字（「Refreshing … data…」，质押页每 30 秒与每次聚焦都会出现）、红色 `role="alert"` 失败框、刷新失败时把余额置 0；推荐的领取记录在刷新失败时也会下「没有记录」的结论；金库详情的按钮用提示文字是否存在决定禁用（`disabled={reason !== null}`），首次详情刷新失败会整页替换。`mobile-data-presentation-contract` 不扫描这三个目录，`status-motion-surface-contract` 与 `referral-ui-contract` 反而把现状钉住了。官方质押出错时弹通知、推荐页显示整页错误文字，与我方契约相反。待决：是否把三页纳入 `docs/mobile-data-presentation.md`（桌面是否同样静默）、刷新失败后账户数值的语义（建议同 E13）、质押余额未知显示 `0 HYPE` 还是「—」、金库按钮刷新期间是否保守禁用、金库列表是否同批。
- **手机成交历史筛选只在最近 30 条里找。** WebSocket 快照本身只有最近 30 条，筛选后为空就显示「No fills match these filters.」，而同页 CSV 用 `userFillsByTime` 会导出更早的匹配成交。官方在任一筛选开启时补拉 `userFills`（最多 2,000 条，与 WebSocket 数据按时间、币种、tid 去重合并）。最小修法是复用 `use-trade-history`（加 `enabled`）只在筛选开启时补拉，空结论要求补拉成功。待决：达到 2,000 条上限时是否注明、加载与失败时不下「无匹配」结论（比官方严，建议采纳）、手机委托历史与资金费的筛选是否同样补拉（建议另开）。

## 验证与限制

- 两项都先写在旧代码上会失败的测试，再做变异：无价代币 2 个、C7 的类型映射与两端接线 5 个、C7 的点击消费与接线 5 个，全部被抓到。
- C7 的第一版测试把 `clearSelectedPrice` 与下单 store 的动作都换成替身，Codex 第三轮指出它钉不住「一次点击只应用一次」（P2，代码本身无误）。于是把桌面与手机相同的选价 effect 合成 `useBookPriceSelection`，新增 `book-price-selection.test.tsx` 用真实的两个 store 核对：八类订单的结果；点击后选价被清除，之后切换类型、改价、重新渲染都不重放；被忽略类型与别的市场的点击也被清除。第四轮只审这次修复：没有发现。
- 浏览器：本地开发服务器（3005，本分支），无头 Chromium，1440×900，未连接钱包、未提交订单。从 Market、Stop Market、Take Profit Limit、TWAP、Scale 各点一次 BTC 订单簿首档（77,677），结果依次为 Limit、Stop Limit（价格为 `77677.0`，触发价不变，见截图）、Take Profit Limit、TWAP、Scale。这些是脚本注入的点击，不能证明真实鼠标或触屏的事件时序。
- 全量终端单测：本分支最终头上 703 个文件、9,608 项通过（1 个跳过），这一次在沙箱外运行，`vite-development-cache` 能绑定本地端口。更早一次在沙箱内运行（第一组 `c29cb2c0` 加 C7 提交、测试替身修正之前），只有这个文件以 `listen EPERM 127.0.0.1:5173` 失败，单独放开端口后通过。`pnpm typecheck`（hl-react、ui、terminal）通过；C7 测试替身最初有 `selection` 可能为 null 的类型错误，已修。
- Codex 对抗审查（`gpt-6-astra`，medium，只读），四轮评分与发现见 PR #131 记录 `2026-11-01-audit-confirmed-fixes.md`。本分支相关的两项（CHANGELOG 漏写 HYPE 例外、C7 测试替身）都已处理。第四轮按修复后的状态给整批打 9.2 分。
- 调研结论来自代理报告与官方包，未在浏览器复测；没有真机与真实账户验收；浏览器回归套件未在本地运行。

## 后续与替代关系

- 推送本分支与开 PR 前先问运营方。
- 运营方对上述待决项作出决定后，按「最小修法」实施；M2 与 M9 建议同一改动，C5 等窄宽方案。
