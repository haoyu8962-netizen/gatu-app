<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-11-zerodev-budget-and-billing-audit",
  "date": "2026-10-11",
  "title": "ZeroDev 长期运行核对：真实 Gas、套餐容量与访问控制",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "只读核对修复后的首次真实主网存款：源收据及对应 UserOperation 成功并包含账户部署，Paymaster 实付约 0.00001057 ETH；ZeroDev Gas 约 $0.02651、含 8% premium 约 $0.02864。Sandbox active，月 Gas 上限 $10、10,000 credits，已用 20；现有单笔/日策略保留，来源规则为空。按该单样本每天 10 笔估算月 Gas $7.95，尚未建立监控或调整预算/套餐。",
  "thread": null,
  "baseCommit": "73a4f24f",
  "commits": [],
  "sources": [
    {"path": "docs/cctp-deposits.md"},
    {"path": "docs/work-memory/sessions/2026-10-10-zerodev-deposit-sponsorship-policy.md"},
    {"url": "https://dashboard.zerodev.app/account/plans"},
    {"url": "https://dashboard.zerodev.app/projects/userops"},
    {"url": "https://docs.zerodev.app/smart-accounts/sponsor-gas/evm"},
    {"url": "https://docs.zerodev.app/api-and-toolings/infrastructure/gas-policies"}
  ],
  "supersedes": []
}
-->
# ZeroDev 长期运行核对：真实 Gas、套餐容量与访问控制

## 背景与范围

用户在真实存款成功后询问长期设置，并要求检查实际 Gas 成本、额度和计费状态。沿用 `codex/deposit-auto-investigation`，起点 `73a4f24f`、工作树干净。在内置浏览器重新打开已登录的 ZeroDev 后台，只读检查当前线上项目；没有保存设置、扩权、签名、发送资金交易、购买额度、升级订阅或部署代码。未取得可核对的 thread 标识。

## 结论与依据

### 单笔真实成本

ZeroDev 当前项目 UserOps 列表有一笔与用户成功重试时间一致的 Arbitrum One 记录：Sponsored、Processed，provider 为 Pimlico。页面提供源交易链接；随后通过 Arbitrum 公共 RPC 读取真实收据，用锁定 viem 的 EntryPoint 0.7 ABI 解码，确认：

- receipt status success，块 `513556595`；对应 UserOperation success，sender 与后台记录的 Smart Wallet 一致，Paymaster 非零。
- 包含 AccountDeployed，说明样本包含首次智能钱包部署；不能把此成本直接当成所有重复存款的固定费率。
- UserOperationEvent 的 actualGasCost 为 `10568715189200 wei`，即 `0.0000105687151892 ETH`；actualGasUsed 为 `523775`。
- 外层 Bundler 交易 gasUsed 为 `488019`、effectiveGasPrice 为 `38163400 wei`，相乘为 `0.0000186244643046 ETH`。这是外层交易费用，不能与该 UserOperation 对 Paymaster 的扣费混用。
- ZeroDev 单项目聚合与唯一成功行一致：Gas USD `0.026514686979513067`；USD charged `0.028635861999999998`，与 8% premium 一致，prepaid 使用额为 0。后台 Processed/charged 字段是计费记录，不证明银行卡已经结算。

这补足前一记录中「未独立重取源链收据」的证据缺口。此次仍未独立读取 Circle 转发收据；最终账户资产的验收沿用用户报告与前轮 UI 核对。Git 不记录源交易哈希、UserOp 哈希、owner/Smart Wallet、存款金额、邮箱、卡号、项目端点或认证数据。

### 当前持久配置与计费

- Arbitrum One 的 CctpExtensionV2 / batchSponsorDepositForBurn 合约策略仍为单笔 `0.0001 ETH`、每日合计 `0.001 ETH`，Sponsor all transactions 关闭；无其他 Chain/Wallet 策略，webhook 未开启。
- 订阅接口返回 Sandbox / active，plan_cost 0、monthly_gas_limit 10、gas premium 0.08；每月包含 10,000 credits，本账期已消耗 20，赞助主网 UserOp 每笔 20 credits。支付方式已设置且界面显示未过期，自动收款、未设置到期取消；没有验证未来扣款一定成功。
- 套餐摘要 UI 仍把月额度、included credits 和 premium 显示成 0，与接口及 Sandbox 套餐卡不一致；不能据此判断真实额度为零。
- 预付 Gas 余额为 $0；购买入口禁用，提示升级。接口 prepaid_gas_credit_limit 为 10、页面说明也出现 $10，但购买控制不可用，因此没有把扩充预付额度视为当前可直接执行的方案。需要扩容时核对供应商实际套餐权限，不仅看说明文字。
- 项目 Access Control 为 All/Origin/IP/Mobile 全部 0，No rules configured。合约策略限制代付目标，来源白名单可减少其他网页直接使用项目的机会，但不能把可伪造的 Origin 当成强身份验证；配置前需验证实际前端和服务端调用路径。

### 容量判断与建议（未实施）

用 Big.js 计算，保留单样本/不变 Gas 成本假设：

| 情景 | 30 天笔数 | Gas USD | 含 8% premium USD | Credits |
| --- | ---: | ---: | ---: | ---: |
| 每天 10 笔 | 300 | 7.9544 | 8.5908 | 6,000 |
| 每天 100 笔 | 3,000 | 79.5441 | 85.9076 | 60,000 |

月 Gas 上限 $10 按该样本约对应 377 笔；10,000 credits 按 20/笔对应 500 笔。日策略除以该 UserOperation 实付约为 94 笔，单笔限额约为其 9.46 倍。这些只是算术折算，不代表供应商承诺容量；实际策略可能在估算阶段检查上界，Gas/ETH 美元价格、钱包部署和其他团队项目的共享消耗也会改变余量。不要用外层 Bundler 费用与 UserOp 扣费交叉计算配额。

现有单笔限额覆盖本次真实样本，没有立即扩大授权范围的依据；低流量可先保留。建议月 Gas $5 提醒、$8 触发容量处理，并同时监测日限额、credits、代付错误和配置变化；这是建议阈值，尚未创建监控。若预计每天约 100 笔，需要在上线前同时评估更高套餐和日预算。当前没有足够流量分布来给出最终长期预算，已询问用户预期日存款笔数。

## 验证与限制

- UI、订阅/用量只读响应、源链收据三处交叉核对；只输出白名单计费数据，未读取私钥或完整签名。
- Node 22.15.0、锁定 viem 与 Big.js 执行读取和精确计算；无广播。未改应用源码，未运行应用测试。
- 文档使用 memory:index、memory:check、memory:test 和 git diff --check 验证。历史准备探针在 UserOps 列表有 Failed、无交易哈希行，不纳入成功交易成本或真实存款笔数。

## 后续与替代关系

本次完成检查，不自动更改预算、订阅或访问规则；按用户预计流量制定具体方案后，再对产生费用或访问变化的设置取得相应批准。恢复自动存款及未知提交提示的本地代码仍未发布。

本记录补充前轮真实源收据与成本证据，保留前轮失败诊断、修复步骤和各自验证边界；不把一次成功扩大为持续可用性或容量验收。
