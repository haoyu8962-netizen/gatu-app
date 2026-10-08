# 手续费展示：官方公式、本站实现与已知偏差

状态：现行参考。2026-10-08 从 agent 的私有记忆整理入库，并对照当时的代码核对过文件与函数。公式和官方终端的对照数值来自 2026-07-29 的实现（`7f559bd1`）以及 2026-07-30、2026-08-13 两次复核，这次没有重新到官方终端实测。下单面板展示的费率是估算，交易所按自己的规则收费；本文不改变任何提交路径。

## 官方公式

Hyperliquid 文档的 `trading/fees` 页给前端提供了参考实现 `feeRates()`：

- taker 费率 = `userCrossRate` × 稳定对系数 × HIP-3 系数 × growth mode 系数 × (1 − 推荐折扣)。
  - 稳定对（两边都是现货报价资产的现货对）：× 0.2。
  - HIP-3：部署者费率系数 `deployerFeeScale`（下称 dfs）小于 1 时乘 dfs + 1，否则乘 dfs × 2。
  - growth mode（该 dex `meta` universe 里 `growthMode: "enabled"`）：× 0.1。
- maker 返佣（负费率）不乘 HIP-3 系数与推荐折扣。
- `userFees` 的 `userCrossRate`、`userAddRate` 已经包含交易量分档和质押折扣，不含推荐折扣。
- 数据来源：`perpDexs[].deployerFeeScale`（字符串），各 dex `meta` universe 的 `growthMode`。

## 本站实现

| 部分 | 位置 |
| --- | --- |
| 市场系数（稳定对、growth mode、HIP-3） | `apps/terminal/src/domain/trade/fees.ts` 的 `applyMarketFeeScale`、`getHip3DeployerFeeScale`、`STABLE_PAIR_FEE_SCALE` |
| 用户费率与市场系数的组合 | `apps/terminal/src/hooks/trade/use-fee-rates.ts` 的 `useMarketFeeRates` |
| 稳定对判定 | `SpotMarket.isStablePair`，按 spotMeta universe 里的报价资产推导（`8f9f027d`；此前的硬编码清单漏了 USDE）；Swap 弹窗按实际交易对判断 |
| 下单费用与 builder fee | `apps/terminal/src/domain/trade/order-fee-quote.ts`：builder code 只在 `order` 动作里，永续两个方向都收，现货只收卖方；`twapOrder` 没有 builder 字段（`abff87ce` 修正了此前不分方向展示的问题） |

## 核对方法

改费率逻辑时，对照官方公式页，并用同一个账户在官方终端与本站比较几个市场的显示值。2026-07-29 用基础费率档账户实测的官方终端数值（taker / maker）：

| 市场 | 特点 | 官方终端显示 |
| --- | --- | --- |
| hyna | HIP-3，dfs = 0.1111 | 0.0500% / 0.0167% |
| xyz:NFLX | HIP-3，growth mode，dfs = 1 | 0.0090% / 0.0030% |
| USDE/USDC | 稳定对 | 0.0140% / 0.0080% |

这些数值依赖当时的账户费率档和协议参数，复用之前先用同一个账户重新测一次。

## 已知偏差（未修）

1. **缺少 `deployerFeeScale` 时 HIP-3 费率翻倍。** `apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx` 在字段缺失时取 `"1"`，`getHip3DeployerFeeScale` 把它算成 × 2；取 `"0"` 才是 × 1。只在 dex 没有返回这个字段时出现，影响的是展示估算。官方终端在字段缺失时的取值没有核实。
2. **没有实现 aligned quote asset 折扣。** `fees.ts` 不认识这类报价资产，用它计价的市场显示的手续费比官方终端高约 20%。

修复其中任何一项时，同步更新本节和对应测试。
