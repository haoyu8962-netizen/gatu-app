<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-10-zerodev-deposit-sponsorship-policy",
  "date": "2026-10-10",
  "title": "线上存款 AA21：ZeroDev 缺失策略与 Paymaster 路由排查",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "捕获真实重试的 pm_getPaymasterStubData AA21；线上 ZeroDev 项目缺少代付策略，经用户确认保存 Arbitrum CctpExtensionV2 限额策略及 Privy 两项 PIMLICO 路由。标准准备请求返回 Paymaster 数据；用户随后报告存款成功，23:50 北京时间只读确认原 d74dd616 页面已有资产、完成记录且未知授权和待处理记录清除。成功提交的原始响应未保留，未独立复核源收据；自动存款代码未发布。配置基线、发布检查、健康探针与预算告警仍是后续预防措施。",
  "thread": null,
  "baseCommit": "86e40177",
  "commits": [],
  "sources": [
    {"path": "docs/cctp-deposits.md"},
    {"path": "docs/sairn-domain-cutover-plan.md"},
    {"path": "docs/work-memory/sessions/2026-10-10-deposit-unknown-submission-diagnostics.md"},
    {"path": "apps/terminal/src/config/cctp-deposit.ts"},
    {"url": "https://docs.zerodev.app/smart-accounts/sponsor-gas/evm"},
    {"url": "https://docs.zerodev.app/api-and-toolings/infrastructure/gas-policies"},
    {"url": "https://docs.zerodev.app/api-and-toolings/infrastructure/rpcs"},
    {"url": "https://docs.pimlico.io/references/bundler/entrypoint-errors/aa21"},
    {"url": "https://raw.githubusercontent.com/circlefin/sponsored-cctp-extension-contracts/master/src/CctpExtensionV2.sol"}
  ],
  "supersedes": []
}
-->
# 线上存款 AA21：ZeroDev 缺失策略与 Paymaster 路由排查

## 背景与范围

用户在旧授权自然到期后再次点击存款仍失败，要求检查当前内置浏览器、找到真实原因并修复。沿用 `codex/deposit-auto-investigation`，基线 `86e40177`，开始时工作树干净。本记录汇总本次可观察的请求、后台配置与操作结果；没有可核对的 thread 标识，不重建原始会话。真实签名、转账、付款、套餐升级由用户操作。

## 结论与依据

1. 页面临时执行状态订阅在 `2026-10-10T13:57:33.813Z` 捕获用户真实提交的 `RpcRequestError`：代码 `-32521`，方法 `pm_getPaymasterStubData`，`UserOperation reverted during simulation with reason: AA21 didn't pay prefund`；生产错误标注 `viem@2.56.0`，无源交易哈希。此证据补足此前只有本地 pending 守卫、缺少原始上游错误的缺口。
2. 主网 CCTP 开关已开；线上 Privy 的 Arbitrum Bundler 与 Paymaster 指向同一 ZeroDev 项目、同一 chain/42161 端点，均无 provider 参数。只读 RPC 确认链 ID 和 EntryPoint 支持正常。它们不证明实际代付成功。
3. 用户登录 ZeroDev 后，确认该项目 Sponsor all transactions 关闭，Chain/Contract/Wallet 策略为空，webhook 禁用，未登记合约。官方文档要求项目存在适用的代付策略；登记 ABI 本身不构成代付策略。
4. 保存策略后，以新派生、链上确认零 USDC 的合成地址做未签名准备请求：默认路由的标准 stub/final 方法和 `zd_sponsorUserOperation` 都只返回 Gas 字段，没有 Paymaster 数据。同项目加 `?provider=PIMLICO` 后，vendor 请求于 `14:24:40.873Z`、标准 stub/final 请求于 `14:25:18.561Z` 返回 Paymaster 与 Paymaster data。观察证明两条路由在该准备场景的结果不同；尚未取得供应商内部日志解释默认路由为何遗漏这些字段。
5. ZeroDev 套餐页面显示额度 0，但当前订阅接口返回 active Sandbox、monthly_gas_limit 10 与包含额度。界面与后台不一致，不把界面 0 当成必须升级的证据；没有修改账单、套餐或支付方式。
6. 块 `513533309`（`2026-10-10T14:02:43Z`）只读核对：源 native USDC 余额仍在，当前授权未消费，无源交易跟踪记录。这是该块的状态，不证明有效授权以后无法执行。继续保留未知提交授权直到恢复确认或自然到期。
7. 迁移文档此前已要求新项目设置合约策略；本次没有拿到后台操作审计记录，不能据此指认某个 Git 提交作者删除或遗漏了配置。主网自动触发限制及其本地修复是另一个已记录的问题，不能代替此次外部代付诊断。

## 已执行的配置修复

- 在 ZeroDev 登记公共 `CctpExtensionV2` ABI，地址 `0x3289e443a95B28Bcedacc4B33C689b0C9b84ffAB`，仅含 `batchSponsorDepositForBurn`（selector `0x300fb2a3`）。
- 向用户展示准备的策略和预算，用户明确回复「确认保存上述策略」后保存。刷新并读取后台确认：Arbitrum One / contract / pay_for_user，完整函数签名匹配；单笔上限 `0.0001 ETH`、每日合计 `0.001 ETH`，Sponsor all transactions 仍关闭。这是批准的初始验证预算，不是按生产流量测得的容量。
- 在用户登录的 Privy 当前线上应用，打开 Arbitrum 设置，把 Bundler 与 Paymaster 两个字段都追加 `?provider=PIMLICO`。先展示准备截图，用户明确回复「确认保存这两项修改」后执行 Save and close；刷新后台，两个字段保留新路由且保存按钮 disabled。保留同项目、同链、同合约范围与预算；没有编辑其他链。
- 保存后重新获取公开配置，确认两项 provider 都为 PIMLICO、项目路径相同；新客户端直接使用保存的地址（不在探针内覆盖 URL），`2026-10-10T14:35:20.277Z` 的标准 stub/final 准备成功，返回 Paymaster 与 Paymaster data，未签名、未广播。
- 刷新用户当前交易页以加载新配置；实际页面收到的 Privy 应用配置响应也确认两项 provider 为 PIMLICO。原未知提交授权仍在、源跟踪记录仍为空；恢复仅在内存中的脱敏错误订阅。刷新前新增的重复点击记录仍为本地 pending 守卫，不是另一次上游提交。

## 验证与限制

- 线上应用仍为 `cloudfront-2026-10-08-p28` / `d74dd616`。此次后台策略修改不等于发布本地 `068f7cb2` 自动存款修复或 `86e40177` 未知结果提示修复。
- 准备探针使用本地锁定 SDK（viem 2.42、permissionless 0.2.57）、Kernel 0.3.1 与 EntryPoint 0.7；使用 stub signature，所有真实签名回调均抛错，没有生成私钥、发送 UserOperation 或发送链上交易。标准方法与生产调用一致，但版本和输入不是用户那笔真实存款。
- 探针的 CCTP nonce 按合约要求绑定参数；合成 owner 零余额触发合约 skip 路径，所以不能验证真实 burn、实际 Gas 额度够用或最终 HyperCore 入账。
- 保留初期探针失败：未绑定 nonce 返回 AuthNonceMismatch；固定低位地址的下一次请求返回无效签名；空批次固定 Gas 试验返回合约错误。随后发现该低位地址并非零 USDC，改为新派生且实查零余额地址后才采用成功结果。未把这些输入错误归因于供应商。
- 策略保存截图、Privy 准备与保存后截图在 Git 忽略的 `.worklog/2026-10-10/zerodev-policy/`；Git 不保存个人钱包、金额、nonce、签名、项目完整 RPC URL、认证或账单标识。记录仅为脱敏结论，非完整原始请求导出。
- memory:index、memory:check、memory:test（8/8）与 git diff --check 通过；补记最终配置结果后再运行。没有应用源码修改，未运行应用测试。后台配置修复与未签名验证完成，真实资金验收仍待用户操作。

## 后续与替代关系

### 后续真实成功核对（2026-10-10，北京时间约 23:50）

用户报告「存款成功了」，并询问原因与防止复发的方法。以 `54f9d6d9`、干净工作树为本次补记基线，继续只读核对原内置浏览器：Portfolio 已显示非零资产、一个余额项目及一条 Completed 资金记录；页脚仍为 `V0.1.0+D74DD616`。当前 owner 的未知授权记录已不存在，CCTP 待处理记录为空。没有由 Agent 签名、转账或手动清除业务记录。

本次用户确认与 UI 余额变化支持报告场景已恢复；在未部署新前端代码的情况下，修复后台配置后真实存款成功。页面曾刷新，临时观察已不存在；从上次游标读取的网络缓冲标记 truncated，未保留这次成功提交的 ZeroDev/CCTP 原始响应。没有独立重取源链收据或 Circle 转发响应，也未把资金表中的 Send/Spot→Perps 分类当成源链 burn 的证明。Git 不记录该账户的金额、地址或交易哈希。

已证实的运行问题是缺少适用代付策略、默认路由无法在所测标准准备流程提供有效 Paymaster 数据；旧代码把无哈希未知授权显示成另一笔 CCTP pending，放大了困惑和重试等待。尚未取得默认服务内部故障原因或后台配置变更审计，不能进一步声称某次代码提交、供应商具体实现或某人操作是源头。单账户一次真实成功不等于预算容量、所有账户或未来供应商可用性验证。

防复发建议（尚未自动化实现）：

1. 将链、Privy 应用对应关系、Bundler/Paymaster provider、目标合约/方法和预算形成可审查的配置基线；迁移后对照实际在线配置，保留变更人、前后差异和回滚步骤，不把 URL 非空等同可用。
2. 发布及配置切换前，用与线上相同 SDK 版本、账户版本和标准方法做未签名准备检查，验证 Paymaster 字段及链/项目/provider 一致性；失败阻断切换。零余额 skip 探针只能发现一部分问题，首次接入或迁移仍需用户完成小额真实到账验收。
3. 为代付失败分类、探针失败、预算利用率和供应商额度建立告警；按真实 burn/deployment 成本与预期流量调整当前初始限额，不能因本次小额成功推定容量足够。本次没有创建监控任务或扩大预算。
4. 发布已有未知结果提示及脱敏诊断修复；尽量在签名前通过可用性检查暴露配置故障，签后仍保留授权恢复和防重复提交机制。主网自动触发修复是另一个待发布改动，不能替代代付检查。

本补记只更新文档，使用 memory:index、memory:check、memory:test 与 diff 检查验证；不重跑应用测试，也不声称已实现上述自动化预防措施。下段保留配置修复当时尚待真实验收的状态，其等待用户重试部分由本次成功核对更新。

Privy 两项路由已保存，公开配置、新客户端准备及刷新后页面响应已核验，临时观察已恢复。当前授权自然到期后由用户提交，继续核对源交易确认、Circle 转发和最终 HyperCore 余额，才能宣称报告的入账问题已解决。页面再次刷新会移除临时观察，需先恢复观察再重试。策略额度仍需实际 burn 和流量验证；若再次失败，以新请求为依据，不能预设只能扩额度或放宽策略。

本记录局部更新前一条诊断中「尚无原始上游错误」的状态，保留其代码修改、测试结果与未知授权保护结论。没有覆盖此前的验证版本，也未把读链或未签名探针称为真实资金验收。
