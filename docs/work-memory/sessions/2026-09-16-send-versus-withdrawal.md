<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-send-versus-withdrawal",
  "date": "2026-09-16",
  "title": "账户指定流水的发送与跨链提款区分",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "account-funding"
  ],
  "summary": "实际账户流水与官方交易详情一致为 sendAsset、spot→spot；signatureChainId 仅用于签名，不代表 Arbitrum 收款。未执行资金操作。",
  "thread": null,
  "baseCommit": "5912ee63",
  "commits": [],
  "sources": [
    {
      "path": "docs/withdrawals.md"
    },
    {
      "path": "apps/terminal/src/components/trade/positions/send-modal.tsx"
    },
    {
      "path": "apps/terminal/src/lib/trade/account-ledger.ts"
    },
    {
      "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint"
    }
  ],
  "supersedes": []
}
-->
# 发送与提款链路核查

## 背景与范围

用户指定当前邮箱账户的一条资金流水，询问它是发送还是提款、为何显示 Hyperliquid。读取当前 3005 投资组合的存款和提款列表，并跟随该条目已有链接打开官方交易详情。运行代码仍来自 previous-task-review-b5a831 工作树；根仓库仅记录审查，不修改运行代码。任务标识未取得；账户地址、具体金额及交易哈希不写入版本化记录。

## 结论与依据

本地流水标为发送、来源现货、目标现货。对应官方交易详情显示 `type=sendAsset`、`hyperliquidChain=Mainnet`、`sourceDex=spot`、`destinationDex=spot`，收款地址与付款地址不同，金额与用户指定记录一致。由此确认该动作是 HyperCore 用户间现货发送，不是本项目 Arbitrum 跨链提款，也不能称为 HyperEVM 转账。

该交易含 `signatureChainId=0xa4b1`；官方 Exchange Endpoint 的 Send Asset 文档明确该字段表示签名用链 ID，不能据此认定资金到 Arbitrum。钱包采用邮箱登录不会改变所选资金操作的执行网络。

运行代码 send-modal 的统一账户分支调用 `sendAsset`，sourceDex/destinationDex 都为 spot；弹窗描述明确为 Hyperliquid L1 账户间发送。提款则走上一记录核对的 `sendToEvmWithData` 或 `withdraw3`，两种入口不同。此条账本展示与链上动作一致，未发现把这笔 Arbitrum 提款误标成发送的证据。没有历史点击记录，不能断言当时从哪个前端或按钮提交；只有当前源码不能证明历史交易来源。此动作自身未跨链到 Arbitrum，后续是否由收款人划转或提款未追踪。

## 验证与限制

实际浏览器核验本地列表及官方交易详情，并实时读取官方 Send Asset 字段定义；只读查看当前 send-modal 和账本 explorer 路由代码。未签名、转账、导出私钥，未读取其他无关账户资料。业务代码未改，不新增测试、不重复执行上一轮 127 项回归，也不宣称收款余额或后续跨链到账已验收。

记录验证：`memory:index`、`memory:check`、`memory:test`（8/8）及 `git diff --check` 通过。

## 后续与替代关系

向用户明确说明 HyperCore 内部发送与 Arbitrum 提款的区别。若用户原本意图提现到 Arbitrum，应先核对该接收地址的控制权与支持网络；不能通过修改流水标签或重复发送修正已经发生的链上动作。后续恢复操作另需用户明确指示。本次保留历史审查，不修改其提现结论。

## 2026-09-20 迁移补记

本记录从原提交 `28692032e9f546f1dca46906cbb97334521fcac9` 迁入基于 `d6cc4f3e` 的 `codex/wallet-review-04`，保留原始日期、版本与历史验证结论。当前复核结果见 [worktree-04 迁移记录](2026-09-20-wallet-review-04.md)。
