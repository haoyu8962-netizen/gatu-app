# 交易终端价格来源审查

审查范围为交易终端行情展示及相关取价链路，覆盖移动端、桌面、盘口、预填价格、提交参考价格、现货估值与图表价格精度。不是对整个仓库所有业务的完整审计。

## 已修复

| 位置 | 原实现 | 当前约定 |
| --- | --- | --- |
| 移动端顶部行情 | BBO → allMids → ctx.midPx | 同一有效上下文 midPx → 空值时 markPx；变化使用该上下文 prevDayPx |
| 桌面现货顶部行情 | 相同的混合来源选择器 | 复用相同的上下文选择器 |
| 桌面现货市值 | 标记缺失后可回退 BBO | 仅使用有效标记价与流通量，缺失保持占位 |
| 盘口累计提示“距中间价” | midPx 缺失时使用 markPx | 仅使用有效 midPx 和对应接收时间，缺失不显示距离结论 |
| 市场选择器（桌面弹层与手机列表，2026-11-01） | 价格、24h 涨跌与这两列的排序都用标记价，不看行情新鲜度；首帧前可用会话快照的旧 `prevDayPx` | 实时价格上下文的 midPx → 空值时同一上下文的 markPx；涨跌对同一行实时资产上下文的 prevDayPx；排序用同样的值；市值与未平仓量仍用标记价；失效或缺少接收时间的价格上下文显示占位（[数据展示规范](mobile-data-presentation.md#行情标题的数据来源)、[ADR 0047](adr/0047-no-local-market-stats-snapshot.md)） |

行情标题已删除 BBO/allMids 订阅、优先级与接收来源分支。未新增网络连接，继续使用共享订阅管理。标题回退是展示约定，不允许用显示内容决定交易是否可用。

## 核对后保留的不同用途

- 桌面合约标记价、预言机价：分别使用 markPx、oraclePx；不得改成中间价。
- 紧凑盘口中间价：已在前次修复中改为服务器 midPx，无 mark 回退。
- 桌面与普通分栏价差：盘口买卖差值，BBO 提供参考中间价；属于价差计算，不是标题取价。
- 下单面板限价与分批订单 Mid 控件：复用当前市场上下文，mid 优先，空值时回退同一上下文 mark；必须通过对应接收时间和状态检查。已移除该路径的 BBO 订阅与无条件 mark 回退。用户草稿及手动清空不随报价更新覆盖。提交仍由独立新鲜度、账户和价格规则保护。
- 普通下单执行参考：共享市场服务端 mid，必要时 mark；提交路径独立检查市场绑定和接收时间。
- 市价平仓、反向、全部平仓：显式操作时重新请求账户及 metaAndAssetCtxs，检查市场和仓位后使用 mid/mark 参考。
- 限价平仓：使用有效 mid 和独立接收时间，保留显式输入。
- 现货多资产估值：allMids 配合市场别名及流状态，服务于多资产换算，不是当前币种标题。
- 图表 allMids：用于推断价格刻度；实时 K 线不是由该标题优先级生成。

## 参考与验证

Hyperliquid 当次公开发布资源 index-BeURO1RT.js 的移动端行情栏读取 ctx.midPx ?? ctx.markPx，涨跌基准为同一 ctx.prevDayPx。本项目保留额外的市场、新鲜度、非正值校验，不复制无效数据展示。

市场选择器（2026-10-31 官方生产包）：`config-BhZylSmU.js` 先把快价 `t` 合并进全市场上下文 `e`（`uj`：``n=t.markPx??e.markPx,r=t.midPx===void 0?e.midPx:t.midPx``，分别成为 `markPx`、`midPx`）；`CoinSelector.provider-hKfAGsw-.js` 的行取永续 ``midPx:u?.midPx||0``、现货 ``midPx:(m?d?.markPx:d?.midPx)||0``，未平仓量 ``u.openInterest*u.markPx``、市值为流通量乘 `markPx`；`series-BBY5PmtX.js` 的价格列与涨跌列（``lastPrice:{value:w??0,…}``、``dayChange:{value:w?w/re-1:0,…}``）都由这个 mid 显示并排序。本项目的规则与偏差（mid 缺失时回退标记价而非 `-100.00%`、新鲜度占位）见[数据展示规范](mobile-data-presentation.md#行情标题的数据来源)。

回归覆盖上下文空值与异常、错误市场、过期接收时间、现货/合约切换、同源价格变化、同一数值的不同小数格式、重连、页签切换和挂载生命周期。另检查盘口累计提示缺少 mid 的表现，并验证下单执行守卫不受展示变更影响。市场选择器由 `market-selector-quote.test.ts`（取价、涨跌与位数规则）、`token-selector-row.test.tsx`（桌面与手机行的价格、涨跌、零变化符号、尾零与占位）、`token-selector-wiring.test.tsx`（按价格与涨跌排序）和 `use-markets-info-subscriptions.test.tsx`（行的 `assetContextLive`，以及真实 `useMarketsInfoInternal` 的行交给真实选择器行渲染）覆盖。
