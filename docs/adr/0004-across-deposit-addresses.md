# ADR 0004：邮箱充值采用独立的 Across 持久地址路径

状态：拟议；仅设计交付，尚未实现或发布。日期：2026-09-13。

## 上下文与目标

当前邮箱充值依次需要转入 embedded owner、用户显式确认、Smart Wallet/Paymaster 提交及 CCTP 恢复；外部钱包直接 CCTP 已存在。用户要求规划 Across 持久地址接入，目标是减少邮箱用户的二次存款操作，同时保留原资金路径的可恢复性。

## 拟采用的决策

- 首期仅 mainnet 邮箱用户和经验证的 USDC 路线；通过 GATU 同源服务端调用 Across 地址 REST API，不新增钱包 Provider 或完整跨链 SDK。
- 地址绑定到 Privy 服务端验证过的准确 embedded owner，目的与退款参数由服务器决定。Across capability 与 CCTP route guard 分开。
- 单主机部署使用 shared 目录中的 SQLite 事务仓储及独立对账 worker。永久地址的持续服务责任与新入口发布开关分离；多机部署前更换共享数据库。
- 保留外部 CCTP、旧邮箱余额显式存款和全部在途恢复。首期目标采用已文档化的 USDC-SPOT，交易可用性按账户模式单独验证，不自动内部划转。

接口、状态、文件落点、发布和验收由 [接入设计](../across-deposit-addresses.md) 维护，不在 ADR 复制。

## 备选方案与代价

| 方案 | 权衡 |
| --- | --- |
| 只优化现有 sponsored CCTP | 增量代码少，可改善首开；保留两步用户流程、Gas 代付及授权恢复负担 |
| 全部钱包改用 Across / 同时引入 Swap SDK | 增加覆盖，但扩大 signer、额度、报价和失败恢复面；首期收益集中在邮箱路径，暂不采用 |
| 浏览器直连 Across | 无后端身份和持久映射保障，并暴露集成凭证；不采用 |
| 只依赖相同参数重取地址，不持久存储 | 组件简单，但配置变更、旧地址多次转入、跨设备及退款恢复难以完整追溯；不采用 |
| 新增 PostgreSQL | 多主机和扩展能力更强；当前单机没有现成数据库，先采用 SQLite 并明确拓扑限制 |
| 复制官方 LI.FI + Bridge2 | 增加兑换能力，同时重引入旧桥；本次不是币种扩展，不采用 |

## 后果与边界

收益是更少的邮箱充值操作，以及独立于 Smart Wallet 代付状态的地址入口。代价是增加服务端 Privy 验证、持久化、供应商配额、隐私披露、退款支持与永久地址维护责任。关闭发布开关无法撤销用户已保存的地址；必须先取得供应商退出约定并保留对账。生产权限和各账户模式的真实资金验证是发布前置条件。

本决策不改变 [exact-owner ADR](0002-exact-owner-trading-signers.md)，不允许登录/刷新自动签名，不删除 [当前 CCTP](../cctp-deposits.md) 的执行保护。现有规范在实现同步更新前继续有效。

## 证据与验证状态

- 外部依据：[Across 地址指南](https://docs.across.to/introduction/persistent-deposit-addresses)、[创建 schema](https://docs.across.to/api-reference/deposit-addresses/post)、[Privy 后端验证](https://docs.privy.io/authentication/user-authentication/access-tokens)。
- 当前代码基线 `9750ccff`：`apps/terminal/src/domain/trade/deposit-availability.ts`、`apps/terminal/src/lib/hyperliquid/use-deposit.ts`、`deploy/gatu.service`。
- 计划验证：服务端归属隔离、地址幂等、连续对账、迁移恢复、模式资金落点和真实资金灰度，详见设计。当前仅文档检查，结果见 [任务记录](../work-memory/sessions/2026-09-13-across-deposit-address-plan.md)。
