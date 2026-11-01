<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-01-audit-group2",
  "date": "2026-11-01",
  "title": "全功能审查确认问题第二组：按官方实践修完无价代币、C7 与八项待决（订单簿 M2、M9、C5，选择器 M4、C9，现货显示名 C3，被动数据 E5，手机成交筛选）",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "order-entry",
    "market-recovery",
    "account-funding",
    "hyperliquid-api"
  ],
  "summary": "运营方先说「继续修复剩下存在的问题」，修完无价代币计 0 与订单簿点击保留订单类型（C7），并调研了其余八项；随后说「需要决定的八项 请根据官方的实践来修复，确保符合规范」，按官方 2026-10-31 生产包的做法实施，与 AGENTS.md 契约冲突时以契约为准并在归属文档写明偏差。订单簿：控制行（分组左、单位右）、订单簿单位即下单数量单位并删除设置开关、盘口完整数字与计价取整、紧凑簿放不下才降位（ADR 0046）；选择器：删除本地行情统计快照（ADR 0047）、价格与涨跌改用 mid；现货显示名照搬官方按 index 的表并按官方解析地址（ADR 0048）；质押、推荐、金库页按静默数据规则改、手机成交筛选补拉最多 2,000 条。Codex 对抗审查四轮（8.0/8.2 → 8.0/8.5 → 8.5/8.5 → 9.0/9.0），逐轮修复第一轮七项、第二轮四项、第三轮三项与第四轮三项 P3，交易页与金库页两个命名面按成对实测重定基线。分支 claude/audit-group2，叠在 PR #131 分支 d8a2acf5 上；PR #131 于 2026-11-01 合入 dev（ec067207）后，dev 已并入本分支（1a027960）；运营方说「推送并开 PR」后，本分支随包含本句的提交一起推送，并开目标为 dev 的 PR #132；之后运营方开启 Auto-fix，按 Codex 机器人的一条 P2 修正了空补拉快照的衔接判断。运营方同意后，PR #132 于 2026-11-02 00:25（UTC+8）以合并提交 26c06d02 已合入 dev，树与 CI 测过的 01e1e5b5 相同；未晋升 main、未发布。",
  "thread": null,
  "baseCommit": "d8a2acf5",
  "commits": [],
  "sources": [
    {
      "path": "docs/work-memory/sessions/2026-10-30-full-feature-audit.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-11-01-audit-confirmed-fixes.md"
    },
    {
      "path": "docs/trading-toolbar-redesign.md"
    },
    {
      "path": "docs/order-entry-surface-parity.md"
    },
    {
      "path": "docs/orderbook-layout.md"
    },
    {
      "path": "docs/mobile-data-presentation.md"
    },
    {
      "path": "docs/adr/0008-compact-market-context-channels.md"
    },
    {
      "path": "docs/adr/0046-one-size-unit-for-order-entry-and-order-book.md"
    },
    {
      "path": "docs/adr/0047-no-local-market-stats-snapshot.md"
    },
    {
      "path": "docs/adr/0048-official-spot-display-names-and-addresses.md"
    },
    {
      "path": "docs/spot-market-names.md"
    },
    {
      "path": "docs/recent-trades.md"
    },
    {
      "path": "docs/price-source-audit.md"
    },
    {
      "path": "docs/terminal-performance-baseline.md"
    }
  ],
  "supersedes": []
}
-->
# 全功能审查确认问题：第二组

## 背景与范围

同步记录，未取得任务标识。PR #131（第一组）推送后，运营方答「继续修复剩下存在的问题」，要求仍按官方终端的做法修。

- 分支 `claude/audit-group2`，最初叠在 PR #131 分支的 `c29cb2c0` 上，随 PR #131 的审查修复变基到 `d8a2acf5`；本地、未推送。第一组合入 `dev` 后要按 `dev` 变基；变基会改提交号，引用本分支提交时请按标题。
- 第二阶段（同日）：运营方说「需要决定的八项 请根据官方的实践来修复，确保符合规范，晚上修复后，调用codex 模型对抗review」。决策规则：按官方终端做，官方与 `AGENTS.md` 契约或归属文档冲突时以契约为准，在归属文档写明偏差。订单簿三项由主会话实现；选择器（M4、C9）、现货显示名（C3）、被动数据与手机筛选（E5）由三个实现代理各在独立工作树里实现（基于 `52f9dc18`，不改 CHANGELOG、AGENTS、CI 清单、翻译目录与本记录）。主会话逐个审阅差异后按顺序 cherry-pick 进本分支，统一补翻译、清单与 CHANGELOG；被动数据代理的一个提交标题超过 72 字符，整合时改短后重新提交。
- 官方依据：2026-10-31 下载的官方生产前端包（`/tmp/claude-501/hl-official-1031/assets/`，未入库）。2026-11-01 的线上包已换名（`index-BWNbZckR.js`、`config-Carig3W2.js`），调研代理逐条复核过引用片段，内容一致。
- 三个只读调研代理分别负责订单簿（M2、M9、C5、C7）、选择器与显示名（M4、C9、C3）、被动数据与手机筛选（E5、手机成交筛选）。它们读了我方代码与官方包；订单簿与选择器两路还在一次性无头 Chromium 里只读打开官方终端与线上 sairn（未登录、未连钱包、未点 Connect 或下单），并订阅公开行情频道计时。下文的实测都出自这些代理的报告，本记录没有重做。

## 结论与依据

### 已修复

| 项 | 问题 | 官方依据 | 修改 | 提交（标题） |
| --- | --- | --- | --- | --- |
| 无价代币 | 没有价格的现货代币在余额表里按入账成本 `entryNtl` 估值 | 官方余额表无价代币的 USDC Value 为 0 | `getSpotUsdValue` 对零、负或读不出的价格一律计 0；可见影响只在余额表的 USDC Value 与 Hide small balances（HYPE 照常保留）；`getTradingToolbarBalanceSummary` 没有生产调用者，充值弹窗不读受影响的汇总 | fix(balances): value a spot balance without a price at zero；fix(balances): say where the unpriced zero shows and pin bad prices；docs(balances): keep HYPE visible in the unpriced balance note |
| C7 | 点击订单簿任一档位，桌面与手机表单都无条件切成限价单，条件单、Scale、TWAP 的设置丢失 | 官方订单簿行 onClick：市价切限价、止损市价切止损限价，然后写共享限价；实测 Stop Market 变 Stop Limit、触发价不动，Scale、TWAP、止盈市价类型不变 | `getOrderTypeForBookPrice`：市价→限价、止损市价→止损限价，限价类只更新价格，TWAP、Scale、止盈市价返回 `null` 不改任何字段；不像官方那样静默写入共享限价（预填只填空值，写入会在看不见的表单留价，并清掉只减仓的数量来源 `sizeSource`）；预填身份用切换后的类型 | fix(trade): keep the order type when a book price is clicked；test(trade): narrow the selected price stub before reading it；refactor(trade): share the book price click and test it on real stores（桌面与手机的选价 effect 合成 `useBookPriceSelection`，一次点击只应用一次） |

### 第二阶段：八项按官方实践修复（2026-11-01）

| 项 | 修法 | 与官方的差异 | 归属文档 | 提交（标题） |
| --- | --- | --- | --- | --- |
| M2 | 桌面订单簿列头上方加 24px 控制行，分组下拉靠左、单位下拉靠右，列头只有文字；删除容器 ≤319px 隐藏价格列头的规则；默认面板每侧仍 11 档 | 无 | `orderbook-layout.md`、ADR 0046 | fix(orderbook): one size unit, a control row and full numbers |
| M9 | 只保留下单草稿的 `sizeMode`，删除设置开关与全局 `showOrderbookInQuote`；订单簿单位下拉（计价币在前）写一次请求，表单按对象身份领取后调用自己的 `toggleSizeDenomination` 换算已填数量；最近成交恒用基础币 | 表单既有换算优先用标记价，官方有限价时用限价（原有行为，未改） | ADR 0046、`order-entry-surface-parity.md`、`recent-trades.md` | 同上；fix(orderbook): fit compact sizes and take unit picks once；test(orderbook): pin the unit request identity check |
| C5 | 数量与累计完整显示、不截断；计价取整到 0 位，绝对值小于 1 保留小数；数值单元格靠右并向起始侧溢出；价格单元格 `text-start`；手机紧凑簿按实测宽度逐级降位（少一位小数、再从 10,000 起缩写），价格始终完整 | 小于 1 的计价值保留小数；紧凑簿降位是本终端的布局约束（官方无紧凑簿） | `orderbook-layout.md`、ADR 0046 | 同 M2；fix(orderbook): align book prices to the start edge in rtl layouts；fix(orderbook): fit compact sizes and take unit picks once |
| M4 | 删除 `hl-mkt-stats-v2` 读写与只为恢复它存在的 hl-react 解析器；旧键在客户端运行时加载时删除一次；首帧前用既有占位 | 无 | ADR 0047（取代 ADR 0008 的会话缓存部分）、`mobile-data-presentation.md` | fix(markets): drop the local market statistics snapshot |
| C9 | 选择器（桌面与手机共用一行组件）的价格、24h 涨跌与排序用行情头同一规则（实时上下文的 mid，缺失才退回同一上下文的标记价），涨跌要求资产上下文来自实时帧；市值与 OI 仍用标记价；五位有效数字加尾零，零变化显示 `+` | mid 缺失时退回标记价（官方显示 −100%）；过期显示占位（官方不查新鲜度） | `mobile-data-presentation.md`、`price-source-audit.md` | fix(trade): price the market selector from the live mid |
| C3 | 照搬官方按网络、代币 index 的显示名表（主网 28 项，测试网收 13 项），表项只在该 index 的代币为记录名时生效；余额、手续费、充提、Send 用同一名字，CSV 仍写协议值；地址：`0x<代币 ID>`、未知计价币按 USDC、`@N` 换成显示名路径、解析不出的换到默认市场（replace，默认市场解析不出仍 404） | `@N` 保留可开（路由契约）；默认市场是 BTC；replace 代替 push；大小写不敏感；USDH 计价对照常可开；三段以上路径仍 404；测试网少 3 项并给冲突名加 `-index` | `spot-market-names.md`、ADR 0048 | feat(markets): name spot tokens by the official display table 等 7 个提交 |
| E5 | 质押、推荐、金库详情与金库列表按 `lib/passive-query-state.ts` 四态静默显示：首次失败只有中性 Retry，刷新失败静默保留本页收到的数据并暂停依赖它的操作，未知值 `--`，无「没有记录」误判；操作只由可用性布尔值禁用 | 官方弹通知、整页错误文字、未知显示 0；保留期间官方操作照常可用 | `mobile-data-presentation.md` | fix(dashboard): keep staking, referral and vault reads silent；docs(presentation): silent data rules for staking, referrals, vaults；docs(presentation): name the reviewed alerts on vault and referral pages |
| 手机成交筛选 | 任一筛选开启时补拉 `userFills`（最多 2,000 条）并按 `(time, coin, tid)` 与实时数据合并；只有补拉成功、当前且实时快照当前时才下「无匹配」结论，达到上限时写明范围 | 空结论比官方严（官方加载或失败时也会显示）；清除筛选后不再读快照 | `mobile-data-presentation.md`、`trading-toolbar-redesign.md` | fix(trade): search the fills snapshot while phone filters are on |

整批 Codex 第一轮（见下文「验证与限制」）提出的七项都核实成立，修复与补测如下：

| 发现 | 修复 | 提交（标题） |
| --- | --- | --- |
| 手机筛选只把最近 30 条实时成交并入补拉结果：补拉之后到达的匹配成交被更新的成交挤出 30 条后消失，并显示「无匹配」 | 筛选开启时合并订阅保留的全部实时成交（`useUserFills().bufferedFills`，hl-react 最多 200 条）；订阅保留的最早一条比快照最新一条还新时（中间可能漏成交），不下结论，只给中性 Retry | fix(trade): keep phone filter matches pushed out of the latest 30 |
| 只开 Type 筛选时的补拉没有测试 | 新增只开 Type 的补拉用例 | 同上 |
| 金库弹窗已在复核步骤时，详情或份额刷新失败不暂停 Confirm | `canConfirm` 与 `confirm()` 都要求该操作的可用性（`actionAvailability`），刷新成功后恢复 | fix(vaults): hold review confirms and empty filters on kept data |
| 金库公开列表保留、账户份额成功时仍下「No Vaults in this filter」 | 控制器输出 `listCurrent`，筛选空结论要求公开列表为 `ready` | 同上 |
| 金库「本页收到过」边界没有接线测试 | 详情、份额与公开列表各一条「进入页面前缓存、本页请求失败」用例 | 同上 |
| 显示名表的期望值取自待测表本身 | 契约测试另存一份官方 2026-10-31 生产包里的表（`OFFICIAL_TABLE`，主网 28 项、测试网 16 项），逐项比较；加 5 条固定外部地址（如 `/trade/NIL/USDC`） | test(markets): pin the display table to an official copy |
| 紧凑簿真实页面的宽度传递没有测试 | 挂载真实 `MobileBookView`，按窄、宽、窄三次测量断言数量文字与完整读屏名称 | test(orderbook): pin the width the phone book measures for its rows |

整合时还发现一个测试替身遗漏：`mobile-history-cards.test.tsx` 替换的 `useUserFills` 缺少新字段 `bufferedFills`，页面渲染时报错；已在第一个提交里补上。

Codex 第二轮复核上面四个提交，又提出四项，都核实成立：

| 发现 | 修复 | 提交（标题） |
| --- | --- | --- |
| 订阅的 200 条保留上限也算 TWAP 成交，缺口判断却用去掉 TWAP 之后的列表：TWAP 成交占满订阅后，普通成交被挤出也看不出缺口；订阅里一时没有普通成交时，页签还会退回「No fills found.」并收起已开启的筛选 | 缺口判断改用两边的原始时间（快照最新一条、订阅最旧一条，都算 TWAP）；已开启筛选时，不再因为订阅里没有普通成交而退回「No fills found.」 | fix(trade): count twap fills in the phone filter's gap check |
| 上一轮的 Confirm 暂停让确认前的预检读取失败后，弹窗里没有恢复入口：页面上的 Retry 被阻断式弹窗盖住，退回输入步骤也不能复核 | 弹窗在输入与复核步骤给出中性「Retry」（与页面同一个重新读取，只在需要重试时出现），金额与步骤保留 | fix(vaults): retry kept data inside the dialog and gate search results |
| 搜索与账户筛选或保留的公开列表组合时，仍先显示「No matching Vaults」 | 先检查是否已确认，再判断搜索无结果 | 同上 |
| 页面到弹窗按钮的 `canConfirm` 接线没有测试 | 弹窗测试钉住 Confirm 跟随 `canConfirm`、数据 Retry 只在传入时出现；页面结果测试钉住两者的传递 | 同上 |

Codex 第三轮复核又提出两项（另有一项 P3），都核实成立：

| 发现 | 修复 | 提交（标题） |
| --- | --- | --- |
| 详情刷新返回格式不符的数据时，详情是「失败」而不是「保留」，`needsRetry` 只认保留，已打开的弹窗没有数据 Retry | 详情失败或保留都算需要重试 | fix(vaults): offer the dialog retry when a detail refresh fails |
| 缺口判断两个时间端点的接线（快照最新一条要算 TWAP、订阅取最旧一条）没有反例测试 | 新增快照里最新一条是 TWAP、订阅窗口与快照重叠的用例，断言下结论且没有 Retry | 同上 |
| P3：新增的快照时间单测 `trade-history.test.ts` 不在 CI 与回归清单里 | 加入 `.github/workflows/terminal-tests.yml` 与 `AGENTS.md` | 同上 |

### 调研结论（第一阶段，保留为依据；其中的「待决」已由第二阶段按官方实践决定）

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

### 第一阶段（无价代币、C7）

- 两项都先写在旧代码上会失败的测试，再做变异：无价代币 2 个、C7 的类型映射与两端接线 5 个、C7 的点击消费与接线 5 个，全部被抓到。
- C7 的第一版测试把 `clearSelectedPrice` 与下单 store 的动作都换成替身，Codex 第三轮指出它钉不住「一次点击只应用一次」（P2，代码本身无误）。于是把桌面与手机相同的选价 effect 合成 `useBookPriceSelection`，新增 `book-price-selection.test.tsx` 用真实的两个 store 核对：八类订单的结果；点击后选价被清除，之后切换类型、改价、重新渲染都不重放；被忽略类型与别的市场的点击也被清除。第四轮只审这次修复：没有发现。
- 浏览器：本地开发服务器（3005，本分支），无头 Chromium，1440×900，未连接钱包、未提交订单。从 Market、Stop Market、Take Profit Limit、TWAP、Scale 各点一次 BTC 订单簿首档（77,677），结果依次为 Limit、Stop Limit（价格为 `77677.0`，触发价不变，见截图）、Take Profit Limit、TWAP、Scale。这些是脚本注入的点击，不能证明真实鼠标或触屏的事件时序。
- 全量终端单测：第一阶段结束时的分支头上 703 个文件、9,608 项通过（1 个跳过），这一次在沙箱外运行，`vite-development-cache` 能绑定本地端口。更早一次在沙箱内运行（第一组 `c29cb2c0` 加 C7 提交、测试替身修正之前），只有这个文件以 `listen EPERM 127.0.0.1:5173` 失败，单独放开端口后通过。`pnpm typecheck`（hl-react、ui、terminal）通过；C7 测试替身最初有 `selection` 可能为 null 的类型错误，已修。
- Codex 对抗审查（`gpt-6-astra`，medium，只读），四轮评分与发现见 PR #131 记录 `2026-11-01-audit-confirmed-fixes.md`。本分支相关的两项（CHANGELOG 漏写 HYPE 例外、C7 测试替身）都已处理。第四轮按修复后的状态给整批打 9.2 分。
- 调研结论来自代理报告与官方包，未在浏览器复测；没有真机与真实账户验收；浏览器回归套件未在本地运行。

### 第二阶段（八项）

主会话亲自运行的：

- 订单簿三项：新测试先在 `52f9dc18` 上运行全部失败，在本分支通过。变异 24 个先分批在实现当时的代码上运行，最后在 `d52d1cc9` 的干净检出上全部重跑，都被抓到（重跑前基线：10 个测试文件、245 项通过）；其中数量缩写与请求清除两个变异的原写法已对不上改过的代码，按现有代码重写后再跑。
- 宽度测量：本地开发服务器（3005，本分支）、无头 Chromium、未连接钱包，在 320、390、1100、1440 宽测 kPEPE 与 BTC 的基础币与计价币，价格、数量与累计的文字互不重叠，也不超出梯子。这是脚本测量，脚本没有入库，不是真机。
- 整合另外三路之前：订单簿四个 Playwright 套件 59 项通过；`AGENTS.md` 的订单簿、最近成交与下单分组共 35 个文件、761 项通过。
- 整合之后（`3440562e`）：`pnpm typecheck`（hl-react、ui、terminal）通过；Biome 检查 127 个改动文件无问题；选择器相关测试 159 项、显示名相关测试 310 项、目录完整性契约与 `scripts/ci-workflows.test.mjs` 的 17 项通过。
- 全量终端单测（`3440562e`，沙箱外，12:05 开始，用时 31 分钟）：713 个文件中 23 个失败、689 个通过、1 个跳过；9,790 项中 109 项失败、9,669 项通过、12 项跳过，另有 1 个工作进程应答超时。当时机器负载很高，13:47 测得负载均值约 157；109 项里 72 项是超时。失败的文件除下一条外用 `--maxWorkers=4` 重跑，22 个里 20 个通过；`mobile-agent-sync-modal` 与 `chart-build-assets` 再次超时，单独运行时两个文件共 44 项通过。唯一的真失败是 `mobile-fill-filter-backfill`：显示名改动让手机成交卡片的手续费调用 `getTokenDisplayName`，而补拉一路的测试替身里没有这个函数。两路在各自工作树里都通过，整合后才暴露。已用「test(history): add the token display name to the fills backfill mock」补上，该文件 7 项通过。
- `funds-modal-scroll-contract` 在本工作树失败：Claude Code 工具在 `packages/ui/src` 等多个目录下留下了空的未跟踪目录 `.claude/.cc-writes`（Git 不收录空目录），契约把它当成 UI 包的子目录。在同一提交 `d52d1cc9` 的干净检出里 122 项通过。
- 最终提交 `ef92ffc8` 的全量终端单测（`--maxWorkers=4`，负载均值约 47）：先在 `node_modules` 为符号链接的干净检出里跑，714 个文件中 705 个通过、1 个跳过、8 个失败（9,835 项中 9,787 项通过、47 项失败、1 项跳过）。8 个失败都是同一现象：`@sairn/hl-react` 经检出自己的源码与符号链接指向的主工作区各加载一份，报「找不到 Provider」「`instanceof` 不成立」与身份变化。在主工作区同一提交上重跑这 8 个文件，78 项全部通过。主工作区里有工具留下的空目录 `packages/ui/src/.claude/.cc-writes`，会让 `funds-modal-scroll-contract` 误报，所以没有在主工作区单次跑完整套。
- 生产构建与包体（不含 `.env.local` 的隔离工作树，Node 22.15.0、pnpm 10.21.0、`VITE_MOBILE_PAIRING_ENABLED=false`）：
  - CI 式元数据（40 位提交号、`SAIRN_RELEASE_ID=ci-99999999999-1`）构建 `d52d1cc9`：两个命名面超出允许值，`trade-terminal-page` 127,638（超 396 字节）、`vaults-page` 30,421（超 346）；其余预算通过。PR #131 自己的 CI 生产构建（`695080a6`，配对关）通过。
  - 按基线文档的复现规程，用固定构建身份依次构建 PR #131 的 `d8a2acf5`、第二阶段基点 `52f9dc18`、`d52d1cc9`、`78bbf476` 与 `a9973c83`，逐块比较模块归属：增长对应本批的功能代码和随之在块之间移动的模块（`d8a2acf5` 到 `a9973c83`：总量 +6,252，交易页 +762，金库页 +701），没有找到不改变行为就能去掉的部分。于是按规程把两个命名面按实测增量重定基线（124,004 与 27,776，允许值不变），写进 `docs/terminal-performance-baseline.md` 的「Second audit batch route-surface re-baseline (2026-11-01)」；用新基线检查 `a9973c83` 的固定身份构建，全部预算通过。手机运行时增量剩 800 字节，是余量最小的一项。
  - 重定基线后用 CI 式元数据构建 `1c5c2b1f`：全部预算通过，`trade-terminal-page` 127,628（余 376 字节）、`vaults-page` 30,549（余 227）、总量 +6,340（余 3,660）、静态启动 +7,495（余 2,505）、手机运行时 +9,177（余 823）、桌面运行时 +1,832（余 8,168），449 个块没有静态循环导入。本地 CI 式读数与真实 CI 可能相差几十字节（基线文档与操作手册记录的已知现象）。
  - 第三轮修复 `9839c340` 又改了金库控制器，之后在 `da80d4b2` 再做一次 CI 式构建：全部预算通过，`trade-terminal-page` 127,640（余 364）、`vaults-page` 30,521（余 255）、总量 +6,756（余 3,244）、静态启动 +7,604（余 2,396）、手机运行时 +9,206（余 794）。

实现代理报告、主会话没有重做的：

- 选择器：32 项新测试先在旧代码上失败，变异 21 个全部被抓到。
- 现货显示名：新测试 22 项与 14 项先在旧代码上失败，变异 33 个全部被抓到；代理在自己的工作树里跑了 76 个文件、1,339 项。
- 被动数据与手机筛选：40 项新测试先在旧代码上失败，变异 33 个全部被抓到。
- 主会话整合后重跑了这些测试（见上面的整合与全量单测），没有重跑这些变异。

Codex 对抗审查（`gpt-6-astra`，medium，只读）：

- 订单簿一路两轮：8.0 分（P2 两项、P3 一项）、8.5 分（P2 一项、P3 一项），都已修复，见 ADR 0046 的「验证」。
- 整批第一轮（`52f9dc18..d52d1cc9`，行为证伪与遗漏变异两路）：行为 8.0（P2 三项）、遗漏 8.2（P2 四项），没有 P1；七项都已修复或补测，见上文「整批 Codex 第一轮」一表。针对这些修复的变异 16 个，在 `78bbf476` 的干净检出上运行，全部被抓到（运行前基线：6 个测试文件、128 项通过）。修复后的相关回归（`AGENTS.md` 的手机数据呈现、订单簿、现货显示名、数字与日期格式、桌面布局与下单分组，外加金库控制器、金库弹窗与最近成交）共 101 个文件、1,972 项，分两次运行；其中 `mobile-history-cards` 第一次因测试替身缺 `bufferedFills` 失败 10 项，补上后单独重跑 21 项通过，其余一次通过；12 个扫描源码的契约 327 项通过，类型检查与 Biome 通过。
- 第二轮（`d52d1cc9..78bbf476`，复核第一轮修复）：行为 8.0（P2 三项）、遗漏 8.5（P2 一项），没有 P1；第一轮七项里五项确认已解决，成交与金库两项另有遗漏路径。四项都已修复，见上文第二张表。针对这些修复的变异 9 个，在 `a9973c83` 的干净检出上运行，全部被抓到（运行前基线：5 个测试文件、60 项通过）；其中「页面不给弹窗传数据 Retry」一个的原写法在文件里出现两次被跳过，加上下文只改弹窗那一处后重跑。修复后成交、金库与对话框相关的 21 个测试文件、520 项通过，类型检查通过。
- 第三轮（`78bbf476..1c5c2b1f`，复核第二轮修复）：行为 8.5（P2 一项）、遗漏 8.5（P2 一项、P3 一项），没有 P1；三项都已修复，见上文第三张表。针对这些修复的变异 4 个，在 `9839c340` 的干净检出上运行，全部被抓到（运行前基线：3 个测试文件、26 项通过）；其中「只有保留的详情才需要重试」一个的原写法因格式化换行对不上，按现有代码重写后再跑。修复后相关的 5 个测试文件、56 项与 `scripts/ci-workflows.test.mjs` 的 17 项通过。
- 第四轮（`da80d4b2`）：第三轮修复的复核 9.0，没有发现，前三轮 14 项都已闭合；规范与记录一路审查整批，9.0，只有 P3 三项：`use-vaults-controller.test.tsx` 不在 CI 与回归清单；重定基线一节写「之后只改文档」已不成立（`9839c340` 改了金库控制器），且缺规程要求的双端合计；CHANGELOG 写补拉加载期间列表空白，而已有匹配会继续显示。三项已在「ci(terminal): run the vault controller tests and list them」与「docs(perf): add combined totals and the builds after the re-baseline」里修正，没有再送审。四轮评分依次为 8.0/8.2、8.0/8.5、8.5/8.5、9.0/9.0。

限制：没有真机与真实账户验收；除订单簿四个 Playwright 套件外，浏览器回归套件没有在本地运行；调研结论来自代理报告与官方包，官方终端只读打开、未登录。

## 推送后的审查（PR #132）

- 运营方说「开启 Auto-fix」：PR #132 打开了 Auto-fix（含审查意见），auto-merge 仍关；当时 7 项检查通过、2 项跳过，无冲突。按应用对 Auto-fix 的说明与 #131 的先例（`667af2d2`），这一授权下的修复提交直接推送到本分支；合并 PR 仍要运营方同意。
- GitHub 上的 Codex 机器人在 PR 开出时审查了 `58af805f`，提出一条 P2（`apps/terminal/src/lib/trade/fill-filter-presentation.ts:28`）：首次补拉快照为空、筛选保持开启、之后的新成交超过订阅的 200 条保留上限时，`newestSnapshotFillTime` 为 `null`，旧规则始终判定衔接。它的例子是先一条 maker 成交、再 200 条 taker 成交：maker 被挤出订阅后，「Maker」筛选显示「No fills match these filters.」而不是 Retry；`useTradeHistory` 不定时刷新，错误结论会一直留着。对照代码成立：hl-react 的 `userFills` 累积器（`packages/hl-react/src/registries/subscription.ts`，`maxSize: 200`）按时间倒序截掉最旧的，重连时用新的 WebSocket 快照替换缓冲区；空快照不带时间，说明不了被订阅挤掉的成交在不在快照里。第四轮审查后这一点只记进了「留作后续」（见下文），而它违反 `AGENTS.md` 手机数据呈现契约（空结论需要完整、当前的快照），本次改掉。
- 修改（`34f5c0d8`）：订阅里没有实时成交时，空快照才算衔接；订阅里有实时成交时，空快照不衔接，无匹配只给中性「Retry」，重试取到包含这些成交的快照后照常下结论。非空快照仍按「订阅最旧一条不晚于快照最新一条」判断。没有采用「订阅未满 200 条就算衔接」：它要依赖 hl-react 未导出的上限常量，还要假设重连后的 WebSocket 快照不少于账户在补拉之后的成交数，两者都不在本终端控制内。代价：账户在补拉之后才第一次成交、筛选又没有匹配时，要先点一次 Retry。`docs/mobile-data-presentation.md` 的表格行、官方对照段与测试说明同步修订；CHANGELOG 原本就写「结论覆盖补拉之后的每一笔成交，否则给 Retry」，不用改。
- 测试与变异：`fill-filter-presentation.test.ts` 把「空快照也算衔接」改成不衔接，补上两边都空时衔接；`mobile-fill-filter-backfill.test.tsx` 新增机器人的场景（maker 成交可见 → 200 条 taker 把它挤出订阅 → 不下结论、只给 Retry → 重试后 maker 成交回到列表）。7 个变异在主工作树上原地运行、运行后还原，全部被抓到：恢复旧规则（单元与集成用例各一次）、空订阅分支返回 `false`、删掉空订阅分支、空快照算衔接（单元与集成各一次）、`<=` 改 `<`。
- 验证：三个改动的 TypeScript 文件 Biome 通过，`pnpm --filter @sairn/terminal typecheck` 通过；成交相关 8 个测试文件 128 项通过（`fill-filter-presentation`、`mobile-fill-filter-backfill`、`mobile-history-cards`、`trade-history`、`mobile-data-presentation-contract`、`user-fills`、`mobile-account-view`、`passive-query-state`）。全量终端 Vitest（主工作树，`--maxWorkers=4`）：714 个文件 711 个通过、1 个跳过、2 个失败，都与本次改动无关：`funds-modal-scroll-contract` 因工具在 `packages/ui/src` 下留的未跟踪 `.claude` 目录误报（干净检出里通过）；`vite-development-cache` 在命令沙箱里绑定 `127.0.0.1:5173` 被拒（`EPERM`），沙箱外单独重跑通过。改动在压缩后只差几个字节，没有重做生产构建量包体，交给 CI 的预算检查。工作记忆的索引、检查与 8 项测试通过。
- Codex 复审（`gpt-6-astra`，low，只读，审工作树里未提交的四个文件）：9.0/10，没有发现。五条作者意图都判为成立：空快照不再担保已有的实时成交；其余路径不变（补拉未返回时 `hasData` 与 `fetching` 先拦住，只剩 TWAP 成交时仍要 Retry，重连替换缓冲区不影响新规则，2,000 条上限前先判衔接）；重试后能恢复；新集成用例在旧规则下失败；文档与代码一致。它指出两点限定，记在这里：集成用例直接注入被挤出后的 200 条 taker，没有经过真实的 RingBuffer（状态与真实累积器一致）；作者意图里「唯一会一直 Retry 的是补拉持续为空」说得过窄，接口持续失败、非空快照持续落后这些既有情况也会一直 Retry，这些都是失败关闭。复审没有运行测试（只读沙箱拒绝写 `node_modules/.vite-temp`），也没有运行变异；测试与变异是上面主会话跑的。
- 限制：只有 jsdom 证据，没有用真实账户复现补拉之后的 200 条以上新成交。

## 后续与替代关系

- 第一阶段写的「运营方作出决定后按最小修法实施」已由第二阶段取代（见上表）。
- 推送本分支与开 PR 前先问运营方。本分支叠在 PR #131 的分支上（`d8a2acf5`）。运营方 2026-11-01 收到整批结果后选择「等 #131 合入再开」：PR #131 合入 `dev` 之前不推送本分支、不开 PR；合入后按 `dev` 变基或合并 `dev`（变基会让本记录与基线文档里引用的 `a9973c83` 等提交号失效，届时补注），重跑相关检查与生产构建，再推送并开目标为 `dev` 的 PR。
- 运营方 2026-11-01 说「合并 #131」：PR #131 以合并提交 `ec067207` 合入 `dev`（09:55 UTC，合并前核对头提交 `695080a6`、7 项检查通过、无冲突）。随后把 `dev` 并入本分支（`1a027960`），没有变基，所以本记录与基线文档引用的提交号仍然有效；应用的同步工具只允许并入 `main`，这次用 git 自己合并。`dev` 比本分支基点只多 #131 的记录提交，唯一的冲突在 `docs/work-memory/INDEX.md`，用 `pnpm memory:index` 重新生成解决。合并后 `apps`、`packages`、`scripts`、锁文件与 CI 配置和做全量单测的 `ef92ffc8`、做 CI 式构建的 `da80d4b2` 完全相同（`git diff` 为空），只有工作记忆文档不同，所以那两次结果对合并后的代码仍然成立，没有重跑。
- 运营方随后说「推送并开 PR」：推送前核对 `dev` 仍是 `ec067207` 且已在本分支里、远端还没有本分支也没有同名 PR；本记录的这一更新随同一次推送进入远端，PR 目标为 `dev`，说明草稿在会话临时目录（未入库），内容按本记录与 ADR 0046–0048 写成。合并、Auto-fix 与发布不在这次同意的范围内。
- 留作后续，ADR 与归属文档已写明：表单单位换算按限价（官方做法）；官方「点击数量填数量」；手机分栏簿的行仍可点击、价格单元格仍是物理左右对齐；收藏栏与命令菜单仍按标记价算涨跌；可访问名称 `Switch to {coin} market`、成交与委托历史页的市场筛选、TWAP 对账通知仍显示 API 币名；手机委托历史与资金费的筛选同样只在最近 30 条里找；显示名表靠人工同步，测试网少收 3 项；保留的被动数据没有时长上限；手机成交页签在最近的实时成交里没有普通成交时显示「No fills found.」且不显示筛选行，无法开启筛选去找更早的成交（官方始终显示筛选，2026-11-01 Codex 第二轮复核时发现，本批未改）；补拉快照为空、之后的新成交又超过订阅保留上限（200 条）时，缺口判断识别不出被挤掉的成交（推送后已按 Codex 机器人的 P2 修复，见「推送后的审查（PR #132）」）。
- 运营方说「开启 Auto-fix」：见「推送后的审查（PR #132）」。合并 PR #132 与发布仍要运营方同意。（2026-11-02 补注：PR #132 已合并，见下一条；发布仍要运营方同意。）
- 2026-11-02 补记：运营方同意后（据执行合并的会话转述），PR #132 于 2026-11-02 00:25（UTC+8；GitHub `mergedAt` 为 2026-11-01T16:25:40Z）以合并提交 `26c06d02` 合入 `dev`，父提交 `ec067207`、`01e1e5b5`。`01e1e5b5` 上的检查 7 项成功、2 项 `claude` 跳过（2026-11-01T13:59Z 开始）；从那时到合并，`dev` 一直是 `ec067207`，而它已是 `01e1e5b5` 的祖先，所以合并后 `dev` 的树与 CI 测过的 `01e1e5b5` 完全相同（`git diff` 为 0 行），合并后没有重跑测试。未晋升 `main`（`origin/main` 仍是 `cdb47637`），未发布（2026-11-02 读线上 `build-meta.json`，仍是 p35 的 `cdb47637`）；远端分支 `claude/audit-group2` 保留，仍指向 `01e1e5b5`。这条补记随文档分支 `claude/local-records-sync` 进入 `dev`，见[本地记录分支合入记录](2026-11-02-local-record-branches-sync.md)。
