<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-11-zerodev-budget-adjustment",
  "date": "2026-10-11",
  "title": "ZeroDev 额度调整：保留 Sandbox，日限额提高到 0.003 ETH",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "用户要求调整 Gas 代付上限，并明确暂不升级套餐；说明 $0 套餐费不代表 Gas 免费后，用户确认只调整每日上限。已保存 Arbitrum CCTP 合约策略 0.003 ETH/天，单笔仍为 0.0001 ETH；UI 返回成功并显示新值。Sandbox $0/月、月 Gas 上限 $10 保留，无套餐升级、交易或代码发布。",
  "thread": null,
  "baseCommit": "bcd504b8",
  "commits": ["875a628c", "eeace5db"],
  "sources": [
    {"path": "docs/cctp-deposits.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "docs/work-memory/sessions/2026-10-11-zerodev-budget-and-billing-audit.md"},
    {"url": "https://dashboard.zerodev.app/account/plans"},
    {"url": "https://dashboard.zerodev.app/projects/gas-policies?chainId=42161"},
    {"url": "https://dashboard.zerodev.app/account/gas-credits"},
    {"url": "https://docs.zerodev.app/smart-accounts/sponsor-gas/evm"},
    {"url": "https://docs.zerodev.app/api-and-toolings/infrastructure/intro"},
    {"url": "https://www.pimlico.io/pricing"}
  ],
  "supersedes": []
}
-->
# ZeroDev 额度调整：保留 Sandbox，日限额提高到 0.003 ETH

## 背景与范围

用户在获知月 Gas 上限 $10 偏低后要求「在哪里设置上限，请你去调整下」。沿用 `codex/deposit-auto-investigation`，起点 `bcd504b8`，工作树干净。只操作用户明确指定的内置浏览器；没有取得可核对的任务标识。

开始时 fetch 后 `origin/dev` 为 `a310ade1`，`origin/main` 为 `d74dd616`，开放发布 PR 为 #96。本次不合并、不推送、不发布代码。

## 结论与依据

- 月额度入口为 ZeroDev `Billing → Plans`。现有 Sandbox 套餐月 Gas 上限为 $10；页面没有独立编辑月上限的输入框。Launch 卡片显示 $69/月、100,000 credits/月、$250 月 Gas 上限及 8% gas sponsorship premium。
- `Up to $250/month in gas credits` 是套餐卡片的另一条说明，本次未把它当成订阅赠送的免费 Gas，也没有确认升级结算金额、抵扣规则或税费。
- 日限额入口为项目 `Gas Policies → Arbitrum One → Contract Policies` 的编辑按钮。调整前策略是 CctpExtensionV2 的 `batchSponsorDepositForBurn`；Sponsor all transactions 关闭，日限额 0.001 ETH、单笔 0.0001 ETH。
- 按前轮每天约 100 笔的容量方案，先在现有策略编辑表单填入 0.003 ETH/Day，单笔与合约/方法范围保持原值，并展示截图，发出具体金额的保存确认。
- 使用 Big.js 与前轮真实 UserOperation 的 Gas 成本计算：100 笔的样本消耗为 0.0010568715189200 ETH；拟议每日 0.003 ETH 为其 2.84 倍，按相同单样本可折算 283 笔。这不是吞吐保证；估算上界、首次钱包部署、Gas 波动、月套餐和其他共享消耗仍可先限制请求。
- 用户询问调整每日限额是否改变 $0/月，并明确「暂不升级」。说明 Sandbox 套餐费仍为 $0、Gas 按实际用量加 8% 收费、月 Gas 上限仍为 $10 后，用户明确确认「只调整每日上限」。没有点击 Subscribe、接受条款或付款。
- 随后在同一现有策略执行 Update Policy。页面返回 `Policy updated successfully`，Contract Policies 显示 `Sponsor up to 0.003 ETH per day` 与 `Sponsor up to 0.0001 ETH per transaction`，Sponsor all transactions 仍关闭，Arbitrum One 和 CCTP 方法范围未变。调整不需要前端部署。

### 前轮观察补充

本次套餐摘要初始仍显示 0，随后可见 included credits 和 premium 逐步变化；截图最终显示 $10、10,000 credits、8%。这证明读取中间显示值不能代表最终额度，不能凭前轮的 0 直接判定为持久的配置或接口错误。

页面明确说明 included credits 耗尽后进入 overage 计费；10,000 credits 是包含额度，不应单独描述成必然阻断第 501 笔的硬上限。Gas sponsorship base limit 与 credits 是不同维度。

## 验证与限制

- UI 读取确认当前项目、Arbitrum One、合约/方法、原始限制、获批准的表单值，以及提交成功后的策略列表新值。未另发真实交易验证，不把配置保存成功当成容量或端到端验收。
- 本地截图保存在 Git 忽略的 `.worklog/2026-10-11/zerodev-budget/`；套餐截图仅保留卡片，排除账户与支付信息。截图已展示给运营方，未纳入 Git。
- 没有签名、发送资金交易、升级套餐、调整路由或设置监控。未改应用源码，未运行应用测试。
- 准备阶段及保存后的最终记录均运行 memory:index、memory:check、memory:test（8/8）与 git diff --check，全部通过；随后只补记本条验证结果并澄清调整前的限额文字。

## 后续与替代关系

本次日限额调整完成；用户选择保留 Sandbox，每月 Gas 上限仍为 $10。日限额提高不解决月额度耗尽，也不保证按每天 100 笔持续运行。更高套餐、告警和其他访问规则均未实施，需后续按实际流量决定。

本记录补充[长期运行核对](2026-10-11-zerodev-budget-and-billing-audit.md)，不替代其真实收据证据。自动存款及未知提交提示代码的发布仍为独立事项。

### 同日后续：不升级套餐的容量选择（只读）

用户继续询问月 $10 用完是否会阻断存款，以及不升级套餐能否提高额度。重新读取当前账号的 Prepaid Gas Credits 页面：余额 $0，显示 `Credit Purchases Disabled` 和 `Please upgrade your plan to purchase additional gas credit`，Amount、Purchase 和快捷金额控件均禁用；页面另一条说明仍写每账期可购买 $10。因此不能把说明文字当成当前可用的充值入口，也不能绕过禁用控件直接请求购买。

ZeroDev 官方文档确认策略或账户额度耗尽会使 UserOperation 提交失败；提高日限额不能解决月额度耗尽。尚无证据证明当前 Sandbox 账号可以自行提高月上限或直接购买预付额度。请求供应商单独开通充值/调整额度是待其确认的可能路径，本次未发送任何对外联系。

另一项待评估方案是直接使用 Pimlico 的 Bundler/Paymaster：其当前官方价格页列出 Pay-as-you-go $0/月、需绑定卡、每月含 10,000,000 API credits，超额 $1/100,000 credits，主网代付 Gas 加价 10%；不是免费 Gas 或无限使用。当前配置的 `provider=PIMLICO` 仍通过 ZeroDev 项目端点转发，不等于直连 Pimlico，也不移除 ZeroDev 的账户上限。真正迁移需要运营方建立相应账号/计费，重新配置和验证 CCTP 代付策略、Privy 端点及标准 UserOperation 准备与真实入账；不能声称改一个 query 参数即完成。

这里只核对官网计费和现有账号 UI，没有创建账号、绑定支付方式、切换服务或修改应用代码。Privy 配置文档的一次直接 URL 读取失败，未将其作为本项目可直接替换端点的验证证据；也未验证 Pimlico 账号可用额度或本项目迁移兼容性。

补记完成后运行 memory:index、memory:check、memory:test（8/8）与 git diff --check，全部通过；随后只追加本条验证结果。
