# 跨交易所资金费率对比页

状态：已实现（2026-09-27，分支 `claude/sdk-feat-funding-comparison`），未合入、未发布；未做浏览器核对与真机验收。日期：2026-09-27。范围：`/fundingComparison` 路由、桌面「更多」菜单与手机抽屉入口、`predictedFundings` 数据、费率换算与差值计算、页面状态和回归入口。本文是该页的归属文档；批次范围与取舍见 [SDK 未接入接口的接入规划](sdk-feature-integration-plan.md) 第 3 项。

## 1. 目标与非目标

目标：让用户在一个页面里比较 Hyperliquid、Binance、Bybit 对同一永续市场的预测资金费率，按所选周期换算，并给出场所与 Hyperliquid 之间的差值及其方向。

非目标：

- 不比较 HIP-3 / builder 永续。`predictedFundings` 只覆盖第一个永续 dex（主 dex），页面只列主 dex 市场，并在页脚说明。
- 不显示下一次资金费时间或倒计时（数据里有 `nextFundingTime`，官方页也不显示）。
- 不做收藏置顶、颜色图例弹窗、周期持久化，也不在行情头显示预测费率或链接到本页。
- 不给交易建议。差值只说明哪一侧费率更高，不计入交易手续费、资金费结算时间差和资金占用。

## 2. 约束

- 只读公开 Info 接口，不签名、不需要连接钱包；页面在未连接时同样可用。
- 计算放在 `domain/market/funding-comparison.ts`，用 Big.js，协议费率保持十进制字符串，直到 `lib/format.ts` 格式化。
- 被动数据遵循 [数据展示契约](mobile-data-presentation.md)：加载、失败、离线不显示错误文字或警告图标；只有完整、当前、成功的快照才能得出「没有数据」。本页没有新增被动提示类别。
- 翻译用 `@lingui/react/macro` 的响应式 `t` / `Trans`；切换语言不重挂载页面、不清空搜索框、不改变所选周期（`i18n-presentation.md`）。
- 数字格式随数字格式设置；每个格式化数字的组件调用 `useNumberFormatRevision()`。
- 仪表盘启动遵循 [ADR 0010](adr/0010-blank-until-ready-startup.md)：路由 `beforeLoad` 等待 `bootDashboardRoute()`，`ssr: false`；页面在真实 `DashboardFrameView` 中显示数据骨架，不新增首屏惰性块。
- 桌面「更多」菜单只来自 `config/desktop-nav.ts`（[runtime-guardrails §11](runtime-guardrails.md)）；新入口是 `more` 类型，不占顶层位置，不影响 ADR 0013 的窄屏宽度证据。

## 3. 数据来源

| 项目 | 规则 |
| --- | --- |
| 接口 | SDK 0.33.3 `InfoClient.predictedFundings()`，经 `useInfo("predictedFundings", undefined, …)`；不改 `packages/hl-react` |
| 响应 | `[asset, [[venue, { fundingRate, nextFundingTime, fundingIntervalHours? } \| null], …]][]`；场所名目前为 `HlPerp`、`BinPerp`、`BybitPerp` |
| 请求节奏 | `requestTimeoutMs: 10_000`、`staleTime: 30_000`、`refetchInterval: 60_000`、`retry: 1`（`config/funding-comparison.ts` 的 `FUNDING_COMPARISON_QUERY_OPTIONS`）。TanStack 默认不在后台标签页轮询，回到页面且数据超过 30 秒时重新请求 |
| 网络隔离 | 查询键含网络（hl-react `infoKey`），主网与测试网互不复用 |
| 持久化 | 不持久化：查询键没有 `persisted` 前缀，`lib/query-persistence.ts` 不保存它 |
| 新鲜度上限 | 快照自本地接收时间（TanStack `dataUpdatedAt`）起最多使用 `FUNDING_COMPARISON_MAX_SNAPSHOT_AGE_MS` = 两个刷新周期（120 秒）；满 120 秒、接收时间晚于本地时钟、或查询因离线处于 `paused` 时，快照视为不可用（见第 6 节） |
| 市场目录 | `useMarketsInfo().perpMarkets`：主 dex、已剔除 `isDelisted` 的永续；其资产上下文（`openInterest`、`markPx`）来自现有 `pac` / `allDexsAssetCtxs` 订阅。`/fundingComparison` 不在 `MARKET_STATS_IDLE_ROUTE_PREFIXES` 中，订阅保持开启 |

`parsePredictedFundings` 对未知输入做严格校验，任一项不符即整份快照视为不可用（fail closed）：顶层须为数组；每项须为 `[非空字符串, 数组]`；场所项须为 `[非空字符串, 对象或 null]`；已知场所的 `fundingRate` 须匹配 `^-?\d+(\.\d+)?$`、`nextFundingTime` 须为安全整数、`fundingIntervalHours` 若存在须为正安全整数；资产或同一资产内的场所重复即失败。未知场所名只检查元组形状，数据被忽略，以便协议新增场所时页面不失效。

新鲜度由 `isFundingComparisonSnapshotFresh(receivedAt, now, maxAgeMs)` 判断：接收时间须为正的有限数，`0 ≤ now − receivedAt < maxAgeMs`。控制器用一个按截止时刻（`dataUpdatedAt + 120 秒`）建立的本地时钟提供 `now`：`setTimeout` 在截止时刻触发一次重新渲染，页面重新可见（`visibilitychange`）或窗口获得焦点时再核对一次，以免后台标签页的计时器节流让过期数据在回到页面时多停留；新快照到达会生成新的截止时刻。两边都是本地时间，不拿交易所的 `nextFundingTime` 与本地时钟比较。

## 4. 计算

| 值 | 规则 |
| --- | --- |
| 行过滤 | 资产名须在主 dex 未下架永续目录中，且 Binance 或 Bybit 至少一个场所的数据不为 null；不使用硬编码币种表 |
| 每小时费率 | Hyperliquid：`fundingRate ÷ (fundingIntervalHours ?? 1)`（协议资金费按小时结算）。Binance、Bybit：`fundingRate ÷ fundingIntervalHours`；缺少 `fundingIntervalHours` 时为空，显示 `--`，不按 8 小时猜测 |
| 周期费率 | 每小时费率 × 周期小时数：每小时 1、8 小时 8（默认）、每日 24、每周 168、每年 8760 |
| 差值 | `场所周期费率 − Hyperliquid 周期费率`；显示绝对值（4 位小数百分比，无正负号）和方向文字：大于 0 为「{场所} 费率更高」，小于 0 为「Hyperliquid 费率更高」，等于 0 为「费率相同」；任一侧为空时显示 `--`，不显示方向 |
| Hyperliquid OI | `openInterest × markPx`，与行情头 `getOiUsd` 同一口径；资产上下文未到达时显示 `--`。桌面为整数美元，手机为紧凑写法（如 `$1M`） |
| 费率色调 | 按每小时费率 × 8 的 8 小时等效值，与所选周期无关：小于 0 为负（`text-error`），0 到 0.0001（含）为中性（`text-fg-muted`），大于 0.0001 为正（`text-success`）；空值为中性。差值不着色（`text-fg`） |
| 零费率 | 零是一个值，显示 `0.0000%`，不当作缺失 |
| 格式 | 费率与差值经 `formatPercent`，固定 4 位小数；OI 经 `formatUSD`；数字包在 `<bdi dir="ltr">` 中 |

搜索、排序、分页在 `deriveFundingComparisonPage` 中完成：

- 搜索：去掉首尾空格后小写包含匹配资产名。
- 默认按 Hyperliquid OI 降序。数值列在两个方向上都把空值排在最后；值相同时按资产名（先不区分大小写，再区分）升序。差值列按绝对值排序，与显示值一致。
- `toggleFundingComparisonSort`：换到数值列时先降序，换到 Market 列时先升序，再次点击同一列反转方向。
- 每页 10 / 25 / 50 行，默认 25；页码夹在 `[1, totalPages]`。改变周期、排序、搜索或每页行数时回到第 1 页。周期、排序、搜索、页码只保存在组件状态中，离开页面即丢弃。

## 5. 页面与入口

- 路由：`apps/terminal/src/routes/fundingComparison.tsx`（`beforeLoad: () => bootDashboardRoute()`、`ssr: false`、`buildPageHead`）；页面框架预设为 `DASHBOARD_FRAMES["/funding-comparison"]`，与排行榜相同。`routeTree.gen.ts` 由 TanStack 路由生成器生成。
- 结构：`funding-comparison-page.tsx`（框架与真实页头、页脚、全局弹窗）→ `use-funding-comparison-controller.ts`（数据、状态与界面状态）→ `funding-comparison-view.tsx`（纯展示，只使用 `useLingui`、`useIsMobile`、`useNumberFormatRevision`）。
- 页头：标题「Funding Comparison」、副标题「Funding rate differences across exchanges.」；工具栏为搜索框（占位「Search by market」）与周期下拉（无障碍名称「Funding period」）。
- 桌面（1001px 及以上）：七列可排序表格（Market、Hyperliquid OI、Hyperliquid、Binance、Binance-HL Arb、Bybit、Bybit-HL Arb），表头按钮带 `aria-sort`，表格带 `scrollableRegionLabel` 与屏幕阅读器标题；Market 列的资产徽标调用 `useMarketNavigation()` 打开对应交易页。
- 手机（1000px 及以下）：排序下拉与方向按钮，每个资产一张卡片；卡片头是整行按钮（`TOUCH_PRESS_CLASS`、`cursor-pointer`），点击打开交易页；卡片列出 OI、三个费率和两个差值。
- 分页：每页行数下拉、`起–止 / 总数`、上一页 / 下一页按钮（到边界时禁用，箭头 `rtl:rotate-180`）。
- 页脚说明：预测的是下一次资金费、已换算到所选周期、只含 Hyperliquid 主永续市场、差值不含交易手续费和结算时间差。
- 入口：桌面「更多」菜单第一项（顺序为 Funding Comparison、Statistics、API Wallet；窄屏折叠时排在折叠的次级入口之后）；手机抽屉「More」区第一项，顺序相同。两处在 `/fundingComparison` 上都标记为当前页。

## 6. 状态

| 状态 | 条件 | 展示 | 对应数据展示规范 |
| --- | --- | --- | --- |
| `loading` | 没有可用快照且最近一次请求未失败（首次请求、自动重试中、离线暂停、快照已超过 120 秒而刷新仍在进行或尚未开始）；或有可用快照但目录处于 restoring / loading / paused；或目录 ready 但主 dex 永续为空且 `allPerpMetas` 仍在请求 | 数据骨架；section 与骨架 `aria-busy="true"`；屏幕阅读器文字「Loading funding rates」 | 列表首次加载、数据过期或重连：骨架与 `aria-busy` |
| `error` | 目录 `error`；目录 ready 但主 dex 永续为空且 `allPerpMetas` 已结束；没有可用快照且最近一次请求失败或响应格式不符（包括快照超过 120 秒时刷新仍在失败）；有可用快照、过滤后为 0 行且最近一次请求失败 | 空白区域中只有中性的「Retry」按钮（outline / neutral），重试进行中禁用但名称不变；没有图标、错误文字或 `role="alert"` | 后台刷新失败：空容器；允许中性重试 |
| `empty` | 快照解析成功且在新鲜度上限内、查询未暂停、目录就绪、最近一次请求成功、过滤后为 0 行 | 「No funding comparison data」 | 完整、当前、成功的空快照 |
| `noResults` | 有行，但搜索没有匹配 | 「No markets match your search」 | 用户主动搜索的结果，不是数据状态 |
| `normal` | 其余情况 | 表格或卡片 | — |

- 「可用快照」指解析成功、自本地接收起不到 120 秒、且查询不处于 `paused` 的快照。
- 已有可用的非空快照时刷新失败：在新鲜度上限内继续显示这份快照，不提示；满 120 秒仍没有成功的刷新时，数据区换成中性「Retry」（最近一次请求失败）或骨架（刷新进行中、未失败），不再显示旧数值。
- 浏览器离线使查询进入 `paused` 时，即使快照未满 120 秒也立即换成骨架（最近一次请求失败时为中性「Retry」）；恢复联网后 TanStack 继续请求，成功后恢复表格。
- 接收时间晚于本地时钟（例如系统时间被往回调）的快照同样不可用，直到下一次成功请求用新的本地时间记录接收。
- 「Retry」重新请求 `predictedFundings`；目录处于错误时同时调用 `retryMarketCatalog()`。
- 页面不参与任何签名、资金、下单或可用性守卫，展示状态不影响其他页面。

## 7. 与官方终端的对照

官方行为来自批次规划阶段 2026-09-27 对 `app.hyperliquid.xyz/fundingComparison` 的只读观察与该页生产包（约 7.3 KB 的 `FundingPage` 模块）阅读，只取行为、不复制代码；本任务没有重新打开官方页面。

| 项目 | 官方 | 本终端 |
| --- | --- | --- |
| 列、周期、默认周期 | 七列；每小时 / 8 小时（默认）/ 每日 / 每周 / 每年 | 相同 |
| 费率换算 | HL 按小时；CEX 除以 `fundingIntervalHours`，缺失时用硬编码币种表或按 8 小时 | 缺失时显示 `--`，不猜测 |
| 零费率 | 显示 `--`（解析后按真值判断），差值仍按 0 计算 | 显示 `0.0000%` |
| OI 价格 | `oraclePx` | `markPx`，与行情头一致 |
| 色调阈值 | CEX 用原始每期费率与阈值比较 | 统一用 8 小时等效值 |
| 差值排序 | 按带符号值 | 按绝对值，与显示一致 |
| 差值说明 | 悬浮提示写出「在 Hyperliquid 做多、在 CEX 做空」一类操作 | 可见的事实方向文字，不给操作建议 |
| 数据刷新 | 进入时请求一次；失败时表格静默为空 | 可见时每 60 秒刷新；首份失败显示中性重试；快照最多使用 120 秒，离线暂停时不显示 |
| 收藏、颜色图例 | 收藏置顶；信息按钮打开颜色图例 | 都不做；页脚一句说明 |
| 周期记忆 | 全局保存 | 仅当次访问 |
| 行点击 | 整行打开 `/trade/<coin>` | 资产徽标（桌面）或卡片头（手机）打开交易页 |
| 每页行数 | 默认 25（其他选项未核实） | 10 / 25 / 50，默认 25 |
| 菜单位置 | 更多菜单中排行榜之后 | 更多菜单第一项 |

## 8. 备选方案与代价

| 方案 | 结论 |
| --- | --- |
| 持久化快照（`persist: true`） | 不采用。资金费率每小时变化，重新进入时展示旧值比短暂骨架更容易误导 |
| 像排行榜一样显示「暂时不可用」提示 | 不采用。需要先修改数据展示规范并有产品依据；静默重试与官方的静默空表更接近 |
| 刷新失败时无限期保留上一份快照 | 不采用（初版曾如此实现，审查意见 FC-1 指出）。本页是面向下一次资金费的当前数据，不是只读历史记录，数据展示规范的「数据过期、重连、后台刷新失败」一行不允许无期限展示；现改为 120 秒上限 |
| 用 HL 条目的 `nextFundingTime` 早于本地时间作为过期条件 | 不采用。它是交易所时间，与用户本地时钟比较会受时钟偏差影响：本地时钟偏快会让刚到的快照立即失效，偏慢会让过期快照继续显示。按本地接收时间计龄只比较本地时间；120 秒上限意味着整点结算后最多再显示约两分钟的上一期预测 |
| 离线暂停时在 120 秒内继续显示快照 | 不采用。离线时无法确认数据仍是当前的；骨架与数据展示规范的「重连」一行一致。代价是短暂断网且恰好遇到刷新时表格会换成骨架，恢复联网后自动回来 |
| OI 用 `oraclePx` | 不采用。与官方一致，但与本终端行情头和代币选择器的 OI 不一致，同一市场会出现两个数 |
| 复制官方的缺失间隔币种表 | 不采用。无法核实、会随交易所调整过期；2026-09-27 的主网数据中缺字段的 20 个 Binance 条目都属于已下架币，页面过滤后不受影响（见第 10 节） |
| 差值按带符号值排序 | 不采用。显示的是绝对值，按符号排序会让最大的负差排在最后 |
| 在 hl-react 新增专用 hook | 不需要。通用 `useInfo` 已覆盖任意 `InfoClient` 方法；该接口没有 WebSocket 订阅 |
| 周期写入持久偏好 | 暂不做，减少一个存储键与迁移；需要时再加 |

## 9. 文件

| 路径 | 作用 |
| --- | --- |
| `apps/terminal/src/domain/market/funding-comparison.ts` | 解析、换算、差值、色调、行构建、搜索排序分页、排序切换 |
| `apps/terminal/src/config/funding-comparison.ts` | 默认值、查询选项、周期与列标签描述符、每页行数、缺失占位 `--` |
| `apps/terminal/src/components/funding-comparison/` | 页面、控制器、视图及其测试 |
| `apps/terminal/src/routes/fundingComparison.tsx`、`routeTree.gen.ts` | 路由（后者为生成文件） |
| `apps/terminal/src/config/dashboard-frames.ts` | `/funding-comparison` 框架预设 |
| `apps/terminal/src/config/desktop-nav.ts`、`components/trade/mobile/mobile-nav-drawer.tsx` | 入口 |

## 10. 验证

新增与更新的回归入口：

- `src/lib/tests/funding-comparison-domain.test.ts`：解析的 fail-closed 条件、HL 与 CEX 每小时换算、缺失间隔、零费率、五个周期倍数（精确 Big 字符串，例如 PONS：HL `0.0000284027` → 8 小时 `0.0002272216`，Binance 4 小时 `0.00012985` → 8 小时 `0.0002597`，差值 `0.0000324784`）、差值方向与空值、色调阈值、目录过滤与 OI、空值排最后、差值按绝对值、同值按名称、搜索与分页夹取、排序切换。
- `src/components/funding-comparison/__tests__/use-funding-comparison-controller.test.tsx`：查询参数与节奏、首份快照 / 目录 / 离线等待时保持 loading、首份失败与格式错误进入 error 并重试、目录失败时同时重试目录、只有成功的空快照才是 empty、搜索无结果、周期 / 排序 / 搜索 / 行数变化回到第 1 页、OI 在上下文到达前为空、选中市场调用导航。新鲜度（假计时器）：上限为两个刷新周期即 120 秒；刷新失败时差 1 毫秒满 120 秒仍显示、满 120 秒换成中性 Retry 且重试中禁用、新快照到达后恢复；未失败时满 120 秒为骨架；页面重新可见时立即核对；满 120 秒的空快照不再是 empty；`paused` 时立即不可用（有失败时为 error）；接收时间晚于本地时钟时不可用。桩数据经 `useSyncExternalStore` 驱动（React Compiler 下的测试约定）。
- `src/lib/tests/funding-comparison-domain.test.ts` 另含 `isFundingComparisonSnapshotFresh` 的边界：年龄 0 与上限减 1 毫秒可用，等于上限及以上不可用；接收时间为 0 / NaN、当前时间为 NaN、接收时间晚于当前时间均不可用。
- `src/components/funding-comparison/__tests__/funding-comparison-view.test.tsx`：桌面表头与 `aria-sort`、数字在 `<bdi dir="ltr">` 中、方向文字、色调、`--` 占位、徽标导航、分页边界、手机卡片与按压反馈、骨架与 `aria-busy`、错误态只有中性 Retry、空快照与无搜索结果的区分、en → zh 切换时 section 与输入框不重挂载且保留搜索值和周期。
- `src/lib/tests/funding-comparison-catalogs.test.ts`：新文案在 en 保留原文，在 zh / es / fr / hi / ar 都有译文。
- 更新：`dashboard-frame-view`（预设）、`boot-dashboard-route`（路由列表）、`desktop-nav-layout`、`top-nav`、`mobile-nav-drawer`（入口顺序、当前页与跳转）、`market-stats-subscription`（本路由保持订阅）、`app-route-surface`、`nav`、`history-table-scroll-accessibility`、`rtl-financial-ui-contract`、`i18n-reactivity-contract`（登记视图），以及浏览器 CSP 扫描 `tests/browser/csp-coverage.mjs` 的桌面路由列表（本任务未运行该浏览器脚本）。

本任务实际执行的检查（2026-09-27，分支 `claude/sdk-feat-funding-comparison`，基于 `dbc6036e`）：

```bash
pnpm exec biome check <本任务改动的 TS/TSX 文件>
pnpm --filter @gatu/terminal typecheck
pnpm --dir apps/terminal exec vitest run <上述新增与更新的测试> \
  src/lib/tests/number-format-reactivity-contract.test.ts src/lib/tests/locale-format-contract.test.ts \
  src/lib/tests/design-token-ratchet.test.ts src/lib/tests/modal-surface-contract.test.ts \
  src/lib/tests/action-progress-label-contract.test.ts src/lib/tests/trading-action-button-label-contract.test.ts \
  src/lib/tests/mobile-data-presentation-contract.test.ts src/lib/tests/dialog-dismiss-control-contract.test.ts \
  src/lib/tests/touch-press-feedback-contract.test.ts src/lib/tests/i18n-hot-switch.test.tsx
```

以上全部通过；另外运行了 AGENTS.md 的启动渲染、数字与日期格式、移动数据展示和运行时翻译四组回归，均通过。对控制器做过两处变异（去掉 empty 前的失败检查、目录失败时放行已有快照），对应测试失败后已还原。

审查修复（FC-1，2026-09-27，同一分支）后重新运行了 Biome、终端类型检查、本页控制器 / 视图 / 领域 / 目录测试、上面列出的扫描测试以及移动数据展示与运行时翻译两组回归，均通过。新鲜度逻辑做过四处变异并逐一还原：去掉新鲜度判断（5 个用例失败）、去掉 `paused` 判断（1 个失败）、去掉 `visibilitychange` 核对（1 个失败）、去掉截止时刻计时器（3 个失败）。计时行为只在 jsdom 假计时器下验证，没有在真实浏览器的后台标签页节流或真实断网下核对。

响应形状核对：2026-09-27 用 curl 对主网 `POST /info {"type":"predictedFundings"}` 与 `{"type":"meta"}` 各请求一次（不含任何用户地址），按第 3 节的解析规则逐项检查，没有会导致整份快照失效的条目。共 234 个资产，每个资产都有 `BinPerp`、`HlPerp`、`BybitPerp` 三项（数据可为 `null`）；HL 间隔全为 1 小时，Binance 为 4 或 8 小时，Bybit 为 1、4 或 8 小时；缺少 `fundingIntervalHours` 的 20 个条目全是 Binance（19 个零费率、1 个 `0.0001`），都属于已下架币。按本页规则过滤后为 176 行（主 dex 未下架 178 个，其中 2 个没有交易所数据），这些行没有缺失间隔。这是对当时一份快照的检查，不代表协议保证。

未执行、留给集成方或后续：

- 完整终端测试与 `pnpm build`（含分块环检查与包体预算）。本路由的包体预算条目需在真实构建中测量后加入 `scripts/check-client-bundle-budget.mjs`。
- 开发服务器上的桌面 lg / md / 紧凑与手机 375px、明暗主题、en / zh / ar 界面核对，以及与官方页同一周期下 BTC、PONS 行的数值对照。
- 真机验收。
