# 市场资金费率历史（图表区 Funding 页签）

状态：已实现（分支 `claude/sdk-feat-funding-history`，基于规划提交 `dbc6036e`），尚未合入、未构建、未做浏览器与真机核对。日期：2026-09-27。范围：永续与 HIP-3 市场的历史资金费率图，桌面图表面板的 `Chart | Funding` 页签与手机行情区的第四个 Funding 页签。本文是该功能的归属文档；批次规划见[SDK 接入规划](sdk-feature-integration-plan.md)第 1 项。

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
- `staleTime` 5 分钟，`retry: false`（页级重试已处理可重试错误），不在窗口聚焦时刷新，网络恢复时刷新。缓存保留时间为 TanStack 默认值（5 分钟）；视图隐藏期间查询停用、缓存保留，重新显示时若已过期则在后台刷新并继续显示旧快照。

状态由数据是否存在决定：

| 条件 | `status` |
| --- | --- |
| 已有该键的数据（包括停用或后台刷新失败时） | `ready` |
| 无数据且查询停用 | `disabled` |
| 无数据且离线或查询被暂停 | `offline` |
| 无数据、上次请求失败且当前没有在请求 | `error` |
| 其余（首次请求或重试中） | `loading` |

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
| 惰性块加载中、首次请求、重试中 | 空白绘图区，`aria-busy="true"`，读屏专用 `Loading...`；区间按钮可用 | 可见的加载文字、骨架动画、旋转图标 |
| 首次请求失败（无数据） | 只有中性「重试」按钮，点击重新请求 | 错误文字、警告图标、`error.message`、`role="alert"` |
| 已有数据后刷新失败 | 继续显示已加载的快照，不提示 | 清空图表、显示失败横条 |
| 离线且无数据 | 空白，依靠全局离线提示 | 「无法加载」等文字 |
| 完整成功的空快照（例如新上线的 HIP-3 市场） | 「暂无资金费率历史」 | 把截断、失败、未请求的快照当作空 |
| 完整快照 | 图表 | — |
| 切换市场、区间或网络 | 新键首次请求时的空白忙碌态 | 显示其他市场或区间的数据 |
| 现货 | 没有 Funding 页签，视图为 Chart | 显示空的 Funding 视图 |
| 页签隐藏 | 查询停用，缓存保留，不在聚焦时刷新 | 隐藏时继续请求 |

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

## 回归入口

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/market-funding-rate-history.test.ts \
  src/lib/tests/market-funding-history-fetch.test.ts \
  src/lib/tests/use-market-funding-history.test.tsx \
  src/lib/tests/funding-history-chart-model.test.ts \
  src/lib/tests/funding-history-panel.test.tsx \
  src/lib/tests/funding-history-load-boundary.test.tsx \
  src/lib/tests/chart-panel.test.tsx \
  src/lib/tests/mobile-trade-layout-funding-tab.test.tsx \
  src/lib/tests/mobile-trade-layout-market-reset.test.tsx \
  src/lib/tests/tradingview-chart.test.tsx
```

手动核对（真实浏览器，写明输入路径）：桌面 lg、md、紧凑宽度与手机 375px 下切换 Chart ↔ Funding，确认 TradingView iframe 节点不变、网格几何不变；Funding 期间切换品种、主题、语言后回到 Chart 无空白或浅色闪烁；`xyz:AAPL` 能出图，现货没有 Funding 页签；浏览器面板隐藏时注意 `document.visibilityState`。
