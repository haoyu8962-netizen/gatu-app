# 市场资金费率历史（图表区 Funding 页签）

状态：已实现，2026-09-28 经 [PR #50](https://github.com/zora4523-bot/gatu-app/pull/50) 合入 `dev`（合并提交 `ac11f81b`），未晋升 `main`、未发布。集成头经三轮 Codex 只读对抗审查，并通过类型检查、完整终端测试与 Node 22.15 生产构建（含包体预算）；批次验证结果与遗留问题见[接入规划](sdk-feature-integration-plan.md)的实施记录。2026-09-27 在本分支开发服务器上用内置浏览器核对了桌面与手机 375px 宽度（脚本派发的点击与指针事件，不代表真实触摸），未做真机验收。日期：2026-09-27，2026-09-28 更新。范围：永续与 HIP-3 市场的历史资金费率图，桌面图表面板的 `Chart | Funding` 页签与手机行情区的第四个 Funding 页签。本文是该功能的归属文档；批次规划见[SDK 接入规划](sdk-feature-integration-plan.md)第 1 项。

行情头的资金费率、倒计时与 7 天 / 30 天 / 1 年推算提示保持不变；本功能不链接它们。

## 目标

- 让用户在不离开交易页的情况下看到当前市场过去一段时间的资金费率走势和累计值，口径与官方终端一致：区间 1h（7 天）、8h（30 天，默认）、D（90 天），每个区间把小时费率求和成一个点，另画一条累计曲线。
- 只读：不签名，不触发 Agent 注册或 builder 授权，不影响下单、确认面和资金流。
- 数据不完整时不画图，只有完整、当前、成功的快照才能得出「没有记录」。

## 官方对照

依据是规划阶段侦察在 2026-09-27 对 `app.hyperliquid.xyz` 的只读核对（见规划与侦察记录）；本次实现没有再次打开浏览器。

- 桌面图表面板顶部有约 40px 的 `Chart | Funding` 页签；TradingView 的 iframe 在切到 Funding 后保持同一节点，官方用祖先元素的 `display:none` 隐藏它。
- Funding 视图是按需加载的 recharts 折线图，双轴：左轴资金费率，右轴累计资金费率；区间 1h / 8h / D。
- 手机端是行情区 Chart / Order Book / Trades 之后的第四个 Funding 页签。
- 现货没有该页签；桌面现货市场上官方连整个页签条都不显示（图表因此上移约 39px）。

gatu 与官方的差异：页签条对所有市场保持固定高度（现货只有 Chart），不随市场类型增减；TradingView 用可见性分层隐藏，不用 `display:none`；图表手绘 SVG，不新增图表依赖。原因见「备选方案与代价」。

## 约束

- [TradingView 生命周期](runtime-guardrails.md#4-tradingview-lifecycle)：切换页签不得重建 widget；只切换 `active`，主题、语言、数字格式的重建路径不变。
- [移动端运行时布局](runtime-guardrails.md#5-mobile-runtime-layout)：隐藏但保持挂载的视图不得继续昂贵的订阅或请求。
- [被动数据展示](mobile-data-presentation.md)：加载与失败不显示文字，只允许中性「重试」；空态只来自完整成功的快照。桌面同样适用（受约束的入口一节）。
- [数字格式](number-format-setting.md)：百分比经 `formatPercent`（输入是比例，`0.0000125` 显示为 `0.0013%`），日期经 `formatDateTime`；组件订阅 `useNumberFormatRevision()`。
- [启动渲染](adr/0010-blank-until-ready-startup.md)：首屏不新增惰性块；视图与区间不持久化，否则 Funding 代码会变成首屏负担。
- 业务计算放在 `domain/` 与 `lib/`，费率用 Big.js 与协议字符串；只有像素坐标转成 `number`。
- 桌面网格几何、`DESKTOP_GRID_STORAGE_KEY` 与测量不变（[桌面网格](desktop-grid-layout.md)）。

## 数据

### 请求

`lib/trade/market-funding-history.ts` 的 `fetchMarketFundingHistory` 调用 SDK `info.fundingHistory({ coin, startTime, endTime })`：

- `coin` 是市场的 `name`（`getMarketApiCoin`），HIP-3 市场保留 dex 前缀，例如 `xyz:AAPL`；响应里的 `coin` 必须与请求完全相同。
- `startTime = max(0, now − 窗口)`，`endTime = now`，`now` 在每次查询开始时取 `Date.now()`。显式给出 `endTime`，这样客户端时钟落后时不会把服务端较新的记录当作越界。
- 复用 `fetchTimeRangeHistory`：包含式 `startTime` 游标、按 `String(time)` 去重、每页最多 500 条、要求升序、最多 20 页。满页时从本页最后一条的时间继续；不足 500 条即结束。走满 20 页仍未结束时 `requireCompleteHistorySnapshot` 抛出 `IncompleteHistorySnapshotError`，不画截断的累计线。
- 每条记录校验：`coin` 相同、`time` 为非负安全整数、`fundingRate` 符合协议小数格式 `^-?[0-9]+(\.[0-9]+)?$`；任一条不合格整页视为 `MalformedHistoryPageError`。`premium` 不使用。
- 单页请求经 `fetchHistoryPageWithRetry` 重试 408、429、5xx 与无响应的传输错误，最多 3 次，429 遵守 `Retry-After`。

2026-09-27 用 curl 对公开 `POST /info` 核对（不含任何用户地址）：BTC 30 天窗口第一页正好返回 500 条、按时间升序，时间戳比整点晚十几到几十毫秒（如 `1790344800040`）。

预期页数：1h / 7 天约 168 条（1 页），8h / 30 天约 720 条（2 页），D / 90 天约 2,160 条（5 页）。规划侦察引用官方《Rate limits and user limits》：每个请求权重 20，另加每 20 条 1；三档约为 28 / 76 / 208，占每分钟 1,200 的 IP 预算，与 `candleSnapshot` 共用。缓解措施见下一节。

### 查询

`hooks/trade/use-market-funding-history.ts` 的 `useMarketFundingHistory({ coin, range, enabled })`：

- 查询键 `["hl", "market-funding-history", env, coin, range]`，不带 `persisted` 前缀，所以不进本地持久化缓存。网络、市场、区间各自独立；切换时没有 `placeholderData`，不会显示上一个市场或区间的数据。
- 只在 Funding 视图可见（`active`）、市场是 `perp` 或 `builderPerp`、`coin` 非空时启用。
- `staleTime` 5 分钟，`retry: false`（页级重试已处理可重试错误），网络恢复时刷新。缓存保留时间为 TanStack 默认值（5 分钟）；视图隐藏期间查询停用、缓存保留，重新显示时若已过期则在后台刷新。
- 非空快照不轮询、不在窗口聚焦时刷新（官方终端也不轮询），与之前相同。只有缓存里是空快照（`[]`）时，查询才带 `refetchInterval` = 5 分钟（等于 `staleTime`）与 `refetchOnWindowFocus`：两者都是按 `query.state.data` 判断的函数，数据一旦非空就返回 `false`，轮询随之停止。`refetchIntervalInBackground: false`，页面在后台（`document.visibilityState === "hidden"`）时不发请求；回到前台时，TanStack 只对已过期的查询执行聚焦刷新，所以空快照过期后回来会立即刷新一次，新鲜的空快照不会。查询停用时 TanStack 既不启动定时器也不执行聚焦刷新，停用时的取消逻辑不变。空快照刷新失败后数据仍是 `[]`，视图可见期间每 5 分钟会再试一次；每次只有一页，请求权重约 20。
- 停用只会让 TanStack 不再发起新请求，不会中止已经在进行的请求。因此查询从启用变为停用时，hook 在 effect 里对当前键调用 `queryClient.cancelQueries({ queryKey, exact: true, type: "inactive" })`：请求的 `AbortSignal` 被中止，`fetchTimeRangeHistory` 不再请求下一页，`fetchHistoryPageWithRetry` 的等待与页级重试随之结束；取消默认 `revert`，缓存回到这次请求开始前的状态（已有快照保留，首次请求则回到无数据）。`type: "inactive"` 只匹配没有启用观察者的查询，同一键若还有别的活动视图在用，请求不会被取消。重新显示时按「无数据或已过期」重新请求。切换市场、区间或网络时旧键失去观察者，由 TanStack 自行中止（查询函数读取了 `signal`）。

状态先看是否有可显示的记录，再区分空快照：

| 条件 | `status` |
| --- | --- |
| 有非空记录（包括停用或后台刷新失败时） | `ready` |
| 空快照，且该键最近一次请求成功（`status === "success"`）、当前没有请求在进行或暂停（`fetchStatus === "idle"`）、未超过 `staleTime`（`isStale === false`）、在线 | `ready` |
| 上两行都不满足且查询停用 | `disabled` |
| 上两行都不满足且离线或查询被暂停 | `offline` |
| 上两行都不满足、上次请求失败且当前没有在请求 | `error` |
| 其余（首次请求、重试中、空快照正在刷新、空快照已过期但还没开始刷新） | `loading` |

非空记录在刷新失败时静默保留；空快照是「没有记录」的结论，只能来自最近一次成功、未过期，且此刻没有被刷新、暂停或离线推翻的请求。例如新市场第一次得到 `[]`，隐藏超过五分钟后重新打开：刷新期间是空白忙碌态，刷新失败显示中性「重试」，离线或暂停时保持空白，都不再显示「暂无资金费率历史」。Funding 视图一直可见时也一样：空快照满 5 分钟由 `refetchInterval` 刷新，刷新期间是空白忙碌态，成功后按新快照显示（仍为空则回到「暂无资金费率历史」，有记录则出图），失败则显示中性「重试」。

过期判断读 TanStack 的 `isStale`，不在渲染里读 `Date.now()`。`useQuery` 的结果按读取过的字段通知组件，hook 读了 `isStale`，它就在被追踪的字段里；观察者本身在 `dataUpdatedAt + staleTime + 1ms` 设了定时器，到点重算结果，`isStale` 从 `false` 变成 `true`，组件随之重渲染。页面在后台时轮询跳过，就靠这个定时器让已过期的空快照从「暂无资金费率历史」变成空白忙碌态。TanStack 对停用的查询一律报告 `isStale === false`，所以停用视图里的空快照仍映射为 `ready`。此时 Funding 层不可见；重新启用时第一次渲染就用上了「正在请求」的乐观结果，状态为 `loading`（离线时为 `offline`），既有用例覆盖了这两种情况。

已知缺口（2026-09-28 对抗审查，尚未修复）：以上五分钟过期与返回前台立即刷新的保证依赖墙钟未回拨。已安装 TanStack Query 用 `Date.now()` 计算 `isStale`；空快照到达后在后台回拨一小时、实际推进十分钟再聚焦，仍为 `ready` 且没有第二次请求。无回拨对照正常刷新；父版本对照表明这是 `58e132ed` 的修复遗漏。WebSocket 的双时钟巡检不覆盖该 HTTP 缓存。仍须遵守空结论来自新鲜快照的要求，后续需补单调接收时间或时钟异常后的保守失效/刷新，详见[本轮审查及复现边界](work-memory/sessions/2026-09-28-claude-commits-adversarial-review.md)。

### 分桶

`domain/market/funding-rate-history.ts`：

- `FUNDING_HISTORY_RANGES`：`1h` = 桶 1 小时 / 窗口 7 天；`8h` = 桶 8 小时 / 窗口 30 天；`1d` = 桶 1 天 / 窗口 90 天。默认 `8h`。
- `bucketFundingRates(rows, bucketMs)`：桶起点为 `floor(time / bucketMs) × bucketMs`，即按 UTC 纪元对齐（8 小时桶从 UTC 00:00、08:00、16:00 开始）；记录比整点晚的毫秒数不会把它推进下一个桶。桶内费率是小时费率之和，即整个桶期间持仓支付或收取的费率；`cumulativeRate` 是从第一个桶起的累计和。窗口从 `now − 窗口` 开始并不对齐，所以首桶和正在进行的末桶可能不完整，二者都保留，`samples` 记录桶内条数。同一时间戳的记录视为同一事件，后出现的覆盖先出现的。结果用 `Big.toFixed()` 输出，不出现科学计数法。
- `summarizeFundingRateBuckets` 给读屏摘要提供起止时间、最新、累计、最高与最低费率；`getFundingRateTone` 按正负返回市场色调。

`ChartPanel` 与手机 `MarketsDataView` 只需要判断市场类型，它们从不含 Big.js 的 `domain/market/funding-history-market.ts` 引入 `isFundingHistoryMarket`。如果改从 `funding-rate-history.ts` 引入，Rollup 会把分桶、摘要和区间表整个放进交易页启动块（集成审查实测 `trade-terminal-page` 多出约 1.8 KB gzip），惰性块就失去意义。

## 界面

### 桌面

- `ChartPanel` 新增 `showFundingTab`，默认 `false`；只有 `main-workspace.tsx` 打开它。手机 `MobileChartView` 等其他使用者输出不变（无页签条，结构与之前相同）。
- 打开后 `ChartPanel` 在顶部渲染 `@gatu/ui` 的下划线页签条（`size="sm"`，与订单簿页签同一视觉），对所有市场、包括现货和市场尚未解析时都存在：`Chart` 始终在，`Funding` 只在 `perp` / `builderPerp` 出现。页签条高度固定（约 33px），TradingView 的高度不随市场类型变化；在图表的最小网格高度（16 行，约 525px）下 TradingView 仍高于 `CHART_MIN_HEIGHT_PX`（300px）。
- 页签条下方是一个 `relative` 容器，两层绝对定位的 `role="tabpanel"`：
  - 图表层始终挂载原有的 `ClientOnly` / `Suspense` / `TradingViewChart`，`active={active && view === "chart"}`。切到 Funding 时加 `invisible opacity-0 pointer-events-none` 与 `aria-hidden`，不使用 `display:none`，也不放进 `TabsContent`（它的 `[&[hidden]]:!hidden` 会隐藏 TradingView）。
  - Funding 层在第一次选中 Funding 后才挂载，之后保留；隐藏时同样用可见性分层，面板收到 `active=false`，查询停用。
- 页签的 `id` 与 `aria-controls` 显式指向这两个面板。视图状态只存在组件里：`view = fundingAvailable ? 选中的视图 : "chart"`，由渲染推导，不用 effect。选中 Funding 后切到现货，视图回到 Chart；再切回永续时回到 Funding。
- 切到 Funding 期间发生的品种、主题、语言、数字格式变化，走 TradingView 既有的 `active=false` 路径：推迟 `setSymbol`，回到 Chart 时重新应用主题、品种与叠加线。

### 手机

- `MarketsDataView` 在永续与 HIP-3 市场上显示 Chart / Order Book / Trades / Funding 四个页签，现货仍是三个。页签文字放在 `min-w-0 truncate` 的内层 span 里，按钮本身不裁剪，44px 的扩展点击区不受影响。
- 选中 Funding 时 `MobileChartView` 与 `MobileBookView` 都保持挂载但 `active=false`：订单簿 / 成交面板从「只要不是 Chart 就显示」改为「只在 Order Book 或 Trades 显示」，因此 Funding 期间订单簿订阅不活跃。
- Funding 层同样在首次选中后挂载；键盘沿用既有的 Home / End / 方向键（含 RTL）处理，四个页签循环。选中 Funding 后切到现货，视图回到 Chart。
- 交易页（`TradeOrderView`）不变。

### Funding 面板

两端共用 `components/trade/chart/funding-history-panel.tsx`，经 `createRetryableLazyComponent` 放在独立的惰性块里（`lazy-funding-history-panel.ts`）：

- 块在 Funding 页签收到 `pointerenter` 或 `focus` 时预热，第一次选中时才渲染；导入失败不重载页面（同页有未提交的下单草稿），`FundingHistoryLoadBoundary` 只显示中性「重试」，点击后重新导入。加载期间是空白的 `aria-busy` 区域与读屏专用的 `Loading...`。
- 头部左侧是图例（资金费率：半绿半红短线；累计资金费率：灰色短线），右侧是 `1h / 8h / D` 三个 `aria-pressed` 按钮（`fieldset`，带读屏名称），选中项为 `bg-fill-weak`，手机有按压反馈；1000px 及以下每个按钮有一层 44px 高的透明扩展点击区（`after:h-11`），外观不变。区间状态只在面板内，切换页签、语言或市场都保留，刷新页面回到 8h。
- 图表（`funding-history-chart.tsx`）为手绘 SVG，`dir="ltr"`：
  - 左轴资金费率、右轴累计资金费率。两个轴都包含 0，共用一条虚线零线和同一组网格线：一共 4 个间隔，程序在「零线以上 / 以下各几格」之间挑选让两条曲线都尽量占满高度的分法（`lib/chart/funding-history-chart-model.ts`）。刻度步长取 1 / 2 / 2.5 / 5 / 10 × 10ⁿ，并留 8% 余量；百分比小数位 = 步长小数位 − 2。
  - 资金费率线用 `userSpaceOnUse` 线性渐变描边，在零线处硬切：零线以上 `text-market-up`，以下 `text-market-down`（`stop-color="currentColor"`，不写颜色字面量）。累计线为 `text-fg-muted`。只有一个桶时画两个点。
  - 指针悬停或触摸时显示竖向十字线、两条线上的点和提示框（`bg-overlay`、`border-stroke-weak`、`rounded-16`、`shadow-raised`）。触摸抬起后提示框保留，直到再次触摸或数据变化；鼠标离开或 `pointercancel` 时消失。绘图区为 `touch-pan-y`，手机页面仍可纵向滚动。
  - 没有键盘逐点浏览（官方也没有）；绘图区是 `role="img"`，名称为「资金费率历史」，`aria-describedby` 指向读屏摘要：起止时间、最新与累计费率、最高与最低费率。摘要元素带 `hidden` 属性，不在阅读流里重复朗读，只作为图的描述。

## 状态

| 情况 | 展示 | 禁止 |
| --- | --- | --- |
| 惰性块加载中、首次请求、重试中、空快照正在刷新（包括视图可见时满 5 分钟的自动刷新），或空快照已过期而页面在后台、尚未刷新 | 空白绘图区，`aria-busy="true"`，读屏专用 `Loading...`；区间按钮可用 | 可见的加载文字、骨架动画、旋转图标 |
| 首次请求失败（无数据），或空快照刷新失败 | 只有中性「重试」按钮，点击重新请求 | 错误文字、警告图标、`error.message`、`role="alert"`、沿用旧的「暂无资金费率历史」 |
| 已有非空数据后刷新失败 | 继续显示已加载的快照，不提示 | 清空图表、显示失败横条 |
| 离线或请求暂停，且无数据或只有空快照 | 空白，依靠全局离线提示 | 「无法加载」「暂无资金费率历史」等文字 |
| 最近一次请求成功、未超过 5 分钟、没有刷新在进行或暂停、在线的完整空快照（例如新上线的 HIP-3 市场） | 「暂无资金费率历史」 | 把截断、失败、未请求、已过期、正在刷新、暂停或离线时的空快照当作空 |
| 完整快照 | 图表 | — |
| 切换市场、区间或网络 | 新键首次请求时的空白忙碌态 | 显示其他市场或区间的数据 |
| 现货 | 没有 Funding 页签，视图为 Chart | 显示空的 Funding 视图 |
| 页签隐藏 | 查询停用，进行中的请求被中止（分页与页级重试停止），缓存保留，不轮询，不在聚焦时刷新 | 隐藏时继续请求、翻页、重试或轮询 |

## 格式化与语言

- 百分比全部经 `formatPercent`，跟随数字格式设置：坐标轴刻度 `signDisplay: "auto"`；提示框与读屏摘要为 4 位小数、`signDisplay: "exceptZero"`（如 `+0.0100%`，德式格式为 `+0,0100%`）。
- 时间经 `formatDateTime`，跟随界面语言并固定拉丁数字：1h 与 8h 的提示框为「月 日 时:分」（`hourCycle: "h23"`，本地时区）；D 区间的桶是 UTC 日，提示框与横轴日期按 UTC 显示「年 月 日」，避免西半球用户看到前一天。横轴刻度为「月/日」，相邻相同标签合并。
- 标签由 `lib/chart/funding-history-chart-labels.ts` 生成，调用方把 `i18n.locale` 与 `useNumberFormatRevision()` 的值作为参数传入；React Compiler 按参数决定是否重算，格式化函数读全局状态这一点它看不到。`number-format-reactivity-contract` 登记 `FundingHistoryChart` 为该 helper 的订阅方。
- 页签名复用 `MARKET_HEADER_LABELS.funding`（中文「资金费率」）与既有的 `Chart`、`Retry`、`Loading...`；新文案在六个语言目录都给出译文。

## 备选方案与代价

| 方案 | 不采用的原因 |
| --- | --- |
| 点击行情头资金费率打开弹窗 | 与官方的位置不一致；弹窗遮住图表与下单面板，且要另建弹窗会话与关闭路径 |
| 引入 recharts 或 lightweight-charts | 新依赖进入包体与安全审查；只需要两条折线和一个提示框，手绘 SVG 已有资产组合与金库图可参照 |
| 切到 Funding 时卸载 TradingView | 违反 TradingView 生命周期规则，回到 Chart 要重新初始化、重新拉取 K 线 |
| 像官方一样用 `display:none` 隐藏 TradingView | widget 会以 0×0 自适应，在 gatu 没有测试覆盖；可见性分层是手机端已经验证过的路径，代价是隐藏期间 iframe 仍会绘制实时 K 线 |
| 现货上去掉整个页签条（官方做法） | 每次现货与永续切换都会改变 TradingView 高度并触发重排；固定高度的条让几何稳定，代价是现货上多一个只有 Chart 的条 |
| 持久化视图与区间 | 刷新后直接进入 Funding 会让它成为首屏惰性块，违反启动渲染契约 |
| 键盘逐点浏览（资产组合图的 `role="slider"` 模式） | 实现与测试成本较高，官方也没有；以读屏摘要代替，保留为后续可选项 |

## 已知限制

- 客户端时钟比服务端快很多时，窗口会整体后移，最近几小时可能缺失；极端情况下会请求一个未来窗口并得到「暂无资金费率历史」。
- D 区间一次约 208 的请求权重，与 K 线共享每分钟 IP 预算；K 线的限流闸门看不到资金费率的 429。
- 隐藏期间 TradingView 仍在绘制（与手机端相同的取舍）。
- 手机 375px 宽度下四个页签各约 94px，法语、印地语等较长的「订单簿」「资金费率」会截断显示，完整名称仍在按钮里。
- 未做真实浏览器核对：桌面 lg / md / 紧凑宽度与手机 375px 的外观、TradingView iframe 在 Chart ↔ Funding 间保持同一节点、隐藏期间品种 / 主题 / 语言切换后回到 Chart 无闪白，都只有 jsdom 测试证据。

## 验证

2026-09-27 在本分支实际运行（jsdom，脚本派发的事件，不代表真实指针或触摸输入）：

- `pnpm --filter @gatu/terminal typecheck`：通过。
- `pnpm exec biome check`（本功能改动的全部 TS / TSX 文件）：通过。
- 新增测试：`market-funding-rate-history.test.ts`（区间表、UTC 纪元对齐、毫秒偏移、Big.js 精确求和与累计、负费率、乱序与重复、首尾不完整桶、空输入）、`market-funding-history-fetch.test.ts`（请求参数、包含式游标续页去重、短页结束、20 页上限、坐标与格式校验、HIP-3 前缀、429 重试、中止）、`use-market-funding-history.test.tsx`（停用不请求、状态映射、键隔离、刷新失败保留、离线、聚焦不刷新、重新激活后台刷新）、`funding-history-chart-model.test.ts`（零线与网格共享、点位落在各自轴上、正负单边、刻度小数位、单点、平坦数据、最近点查找、提示框位置）、`funding-history-panel.test.tsx`（请求参数、忙碌 / 错误 / 离线 / 空态、渐变色调与累计色、区间切换、提示框时间与 4 位小数、D 区间 UTC 日期、语言与数字格式切换不重挂载）、`mobile-trade-layout-funding-tab.test.tsx`（永续四个页签、现货三个、Funding 期间图表与订单簿不活跃、预热、四页签键盘与 RTL、切到现货回到 Chart、交易页不变）；扩展 `chart-panel.test.tsx`（无页签条时结构不变、Funding 期间 TradingView 同一节点且 `active=false`、现货与未知市场只有 Chart、切到现货回退、预热）。全部通过。
- `funding-history-load-boundary.test.tsx`（集成时补充）：真实的 `createRetryableLazyComponent`，第一次导入失败时只显示中性「重试」、上报一次错误、不写入 TanStack 的重载标记；点击后第二次导入并渲染面板；加载中为空白 `aria-busy`；普通渲染错误交给外层边界。删掉重试里的 `loadError.retry()` 后该测试失败（变异检查，已还原）。
- 契约与相关套件：`i18n-reactivity-contract`、`i18n-hot-switch`、`number-format-reactivity-contract`、`locale-format-contract`、`design-token-ratchet`、`modal-surface-contract`、`action-progress-label-contract`（登记两个被动 `Loading...`）、`trading-action-button-label-contract`、`mobile-data-presentation-contract`、`dialog-dismiss-control-contract`，以及 AGENTS.md 中视觉、格式、移动数据展示、桌面布局与下单、启动渲染、运行时翻译各组：全部通过。

未运行：完整终端测试、`pnpm build`（分块环与包体预算）、浏览器与真机核对。惰性块是否让 Rollup 拆出新的共享块、启动预算的变化，要以集成时的生产构建为准。

2026-09-27 对抗审查修复（分支 `claude/sdk-fix-r1-funding-history`，基于集成提交 `19af214b`；jsdom，脚本派发的事件）：

- 先写回归测试并在 `19af214b` 上确认失败，再修复：
  - `use-market-funding-history.test.tsx` 新增「第一页等待期间停用」：断言请求信号被中止、状态为 `disabled`、之后放行满页 500 条也不再请求第二页、重新启用后用新信号重新请求并出图；「另一个活动视图仍在用同一键时不取消」；「空快照过期后刷新失败」（刷新中 `loading`、失败后 `error`、点重试成功后回到空态）；「空快照过期后刷新因离线暂停」（`offline`，恢复网络后续请求并回到空态）；「应用离线时不确认空态」。在 `19af214b` 上，停用用例的中止断言失败；去掉该断言后，放行首页会发出第二页请求（2 次调用），与审查报告的内存复现一致；三个空快照用例都失败（旧映射对已有数据一律返回 `ready`）。
  - 新增 `funding-history-panel-snapshot.test.tsx`：面板接真实 hook 与 QueryClient，空快照过期后刷新失败时正文只剩「重试」（无 `role="alert"`），离线暂停时正文为空；在 `19af214b` 上两例都仍显示「暂无资金费率历史」。
  - `funding-history-panel.test.tsx` 补两条钉住用例（审查报告的变异表 P3，修复前后都通过）：`pointercancel` 让提示框与十字线消失；D 区间日期测试在用例内把 `process.env.TZ` 设为 `America/Los_Angeles`，并先断言本地时区格式与 UTC 格式不同，保证时区确实生效。
- 变异检查（临时改生产代码后运行，均已还原）：删掉停用时的 `cancelQueries` effect，停用用例失败；去掉 `type: "inactive"`，共享观察者用例失败；把状态恢复成「有数据即 `ready`」，三个 hook 用例与两个面板用例失败；分别去掉空态条件中的 `status === "success"`、`fetchStatus === "idle"`、`isOnline`、`length > 0`，各有至少一个用例失败；删掉 `onPointerCancel`，`pointercancel` 用例失败；去掉 D 区间提示框日期的 UTC 时区，西半球用例失败（得到 `Sep 19, 2026`）。
- `pnpm --filter @gatu/terminal typecheck`：`19af214b` 上已有 4 个错误，全部在 `funding-history-load-boundary.test.tsx`（`RealPanel` 无参数，`createRetryableLazyComponent` 推导出的 props 为 `never`）；给测试夹具加上 `_props: object` 后通过。该文件只改了夹具签名，3 个用例仍通过。
- `pnpm exec biome check`（改动的 5 个 TS / TSX 文件）：通过。
- 回归入口列出的 11 个文件，加上 `i18n-reactivity-contract`、`number-format-reactivity-contract`、`locale-format-contract`、`design-token-ratchet`、`action-progress-label-contract`、`mobile-data-presentation-contract`：17 个文件、373 个用例全部通过。

未运行：完整终端测试、`pnpm build`、浏览器与真机核对；隐藏页签后请求确实中止、空快照过期后的展示，只有 jsdom 证据。

2026-09-28 第二轮审查修复（分支 `claude/sdk-fix-r2-funding-history`，基于 `1411036c`；jsdom，Vitest 假计时器模拟 `setTimeout` / `setInterval` / `Date`，页面前后台由 `focusManager.setFocused` 脚本切换，不代表真实的标签页切换）。问题：Funding 视图一直可见并超过 5 分钟时，空快照没有任何刷新，「暂无资金费率历史」会一直显示下去。

- 先写回归测试，在 `1411036c` 上确认失败，再修复：
  - `use-market-funding-history.test.tsx` 新增 5 例：「视图可见时空快照过期即刷新」（满 5 分钟后第 2 次请求、刷新中为 `loading`、成功后回到空态）；「刷新得到记录后停止轮询」（再过 15 分钟仍是 2 次请求）；「非空快照在视图可见时不轮询」（15 分钟内只有 1 次请求、`isRefreshing` 为 `false`）；「停用时不刷新过期空快照」（15 分钟内只有 1 次请求）；「页面在后台时过期空快照不再确认为空，回到前台即刷新」（后台超过 5 分钟：不发请求，状态由 `ready` 变为 `loading`；回到前台后第 2 次请求，成功后为 `ready`）。
  - `funding-history-panel-snapshot.test.tsx` 新增 1 例：面板接真实 hook 与 QueryClient，视图可见 5 分钟后发出第 2 次请求，正文从「No funding history」变为读屏专用的 `Loading...`、`aria-busy="true"`；刷新失败后正文只剩「Retry」，没有 `role="alert"`。
  - 在 `1411036c` 上：「过期即刷新」「得到记录后停止」和面板用例都在「应有 2 次请求，实际 1 次」处失败，「后台过期」用例在「应为 `loading`，实际 `ready`」处失败；两个钉住用例（非空不轮询、停用不刷新）通过。
- 修复（`use-market-funding-history.ts`）：空态条件加上 `!query.isStale`；`refetchInterval` 与 `refetchOnWindowFocus` 只在缓存为空快照时生效；显式写出 `refetchIntervalInBackground: false`。两个查询选项的具体语义见上文「查询」。
- 测试工具的一处坑：假计时器会把 tick 期间创建的零延时定时器推后 1ms，TanStack 由轮询或过期定时器触发的通知（`setTimeout(0)`）会落在推进区间之外，组件看起来没有重渲染。新用例的 `advance` 因此每次多推进 5ms（`NOTIFY_SETTLE_MS`）。
- 变异检查（临时改 hook 后运行这两个测试文件，均已还原，还原后与修复版逐字相同）：
  - 去掉 `refetchInterval`：「过期即刷新」「得到记录后停止」和面板用例失败。
  - 去掉 `!query.isStale`：「后台过期」用例失败。
  - `refetchOnWindowFocus` 改回 `false`：「后台过期」用例失败。
  - 改成无条件轮询：「得到记录后停止」「非空不轮询」失败。
  - `refetchIntervalInBackground` 改为 `true`：「后台过期」用例失败。
  - 聚焦刷新改为对所有快照生效：既有的「聚焦不刷新过期快照」失败。
- `pnpm exec biome check`（改动的 3 个 TS / TSX 文件）：通过。
- `pnpm --filter @gatu/terminal typecheck`：通过。
- 回归入口列出的 11 个文件，加上 `mobile-data-presentation-contract`、`i18n-reactivity-contract`、`number-format-reactivity-contract`：14 个文件、371 个用例全部通过。
- 既有的偶发失败，与本次修复无关：`use-market-funding-history.test.tsx` 有几条旧用例在 mock 立即 resolve 的 `render` 之后马上断言 `loading`，结果取决于 TanStack 的真实 `setTimeout(0)` 通知是否赶在 React `act` 收尾之前。在未改动的 `1411036c` 文件上连续跑 20 次，失败 1 次（第 3 次，`maps a complete snapshot to ready range buckets`）。修复版在本次约 25 次运行里失败过 2 次，都在 `aborts an in-flight load when the view deactivates…` 的同一条断言上：一次是修复后第一次运行，另一次是去掉 `refetchInterval` 的变异运行。这两处都不经过新增的轮询与过期判断（数据为 `undefined`），本次没有改动。

未运行：完整终端测试、`pnpm build`、浏览器与真机核对。真实标签页切换（`visibilitychange`）下后台不发请求、回到前台立即刷新，只有脚本切换 `focusManager` 的 jsdom 证据。

## 回归入口

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/market-funding-rate-history.test.ts \
  src/lib/tests/market-funding-history-fetch.test.ts \
  src/lib/tests/use-market-funding-history.test.tsx \
  src/lib/tests/funding-history-chart-model.test.ts \
  src/lib/tests/funding-history-panel.test.tsx \
  src/lib/tests/funding-history-panel-snapshot.test.tsx \
  src/lib/tests/funding-history-load-boundary.test.tsx \
  src/lib/tests/chart-panel.test.tsx \
  src/lib/tests/mobile-trade-layout-funding-tab.test.tsx \
  src/lib/tests/mobile-trade-layout-market-reset.test.tsx \
  src/lib/tests/tradingview-chart.test.tsx
```

手动核对（真实浏览器，写明输入路径）：桌面 lg、md、紧凑宽度与手机 375px 下切换 Chart ↔ Funding，确认 TradingView iframe 节点不变、网格几何不变；Funding 期间切换品种、主题、语言后回到 Chart 无空白或浅色闪烁；`xyz:AAPL` 能出图，现货没有 Funding 页签；浏览器面板隐藏时注意 `document.visibilityState`。
