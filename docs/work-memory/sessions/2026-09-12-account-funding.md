<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-12-account-funding",
  "date": "2026-09-12",
  "title": "账户与资金：模式语义、共享概览与精确转账",
  "kind": "retrospective",
  "status": "recorded",
  "topics": [
    "account-funding"
  ],
  "summary": "模式标签依赖已解析服务器状态；桌面与移动共享账户语义，金额及签名身份严格校验。",
  "thread": {
    "id": "01a08f6b-26ae-7642-a9a5-a074d906c899",
    "title": "启动3006端口开发服务器"
  },
  "baseCommit": "422ea8a6",
  "commits": [
    "93c146c7",
    "6140b378",
    "bcd3b253"
  ],
  "sources": [
    {
      "path": "docs/account-overview.md"
    },
    {
      "path": "docs/adr/0001-account-overview-cross-shell-model.md"
    },
    {
      "path": "docs/withdrawals.md"
    },
    {
      "path": "docs/cctp-deposits.md"
    }
  ],
  "supersedes": []
}
-->
# 账户与资金：模式语义、共享概览与精确转账

## 背景与范围

用户要求资金入口移到账户区顶部、核对 SDK 调用，随后质疑固定“统一账户 · 概览”标题，并要求移动端同步生效。相关提交包括 `6140b378` 的资金表单及 `bcd3b253` 的账户摘要。

## 结论与依据

- 账户模式来自已解析的服务端状态，区分 unifiedAccount、portfolioMargin、disabled/manual 以及未解析的中性状态。不能根据本地选择草稿先宣称已切换。
- 桌面与移动共享账户模型、模式标签和资金语义；账户资金入口位于概览前。模式不支持的操作不能只改文字而仍调用原流程。
- 可用余额、可提现金额及账户价值并非同一个字段。精确金额在业务层使用 Big.js，UI 不应以 JavaScript 浮点数拼装协议金额。
- 组合保证金的合格抵押价值依赖服务端 oraclePx 与 ltv，不能从市场标记价猜测抵押额度。
- 模式修改只有在明确确认时调用 userSetAbstraction，仍要求选中用户与实际签名 owner 精确一致；刷新与模式查询不能签名。
- 保留存款桥接和提现的既有金额、网络、身份及不确定结果处理；UI 对齐不意味着统一所有 SDK 字段。

## 验证与限制

本次核对既有文档与提交，不执行真实存款、提现、模式变更或钱包签名。共享代码只说明复用路径，不能代替双端入口、账户未解析/已解析状态及不同模式的回归测试。已有测试仅对其记录版本负责。

## 后续与替代关系

后续先读取 account-overview 与 ADR，再对照调用点和固定 SDK 文档。固定“统一账户”标题及用未完成快照建议存款的旧实现不得从历史恢复。
