<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-funds-dialog-official-practice",
  "date": "2026-09-21",
  "title": "资金类弹层：官方终端前端包取证与修复方案（未实施）",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "market-recovery",
    "docs-governance"
  ],
  "summary": "产品负责人要求对照官方终端的做法规划划转、发送、充值、提现四个弹层的修复。只读取证官方前端包：资金弹层不是点击即关闭，而是保持打开并禁用到请求结束、无论成败都关闭、结果走通知；等待期间只有钱包握手提示 Confirm in Wallet；充值失败留在原地重试；长时间状态放在可原位更新的通知与持久化、自动核销的待处理列表里，入口在账户面板。据此写成三步方案与三项待决策事项，未改动任何代码。",
  "thread": null,
  "baseCommit": "e15ee0de",
  "commits": [],
  "sources": [
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "apps/terminal/src/components/trade/positions/transfer-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/send-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/components/funds-action/funds-action-recovery-host.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-cctp-deposit-tracking.ts" }
  ],
  "supersedes": []
}
-->
# 资金类弹层：官方终端前端包取证与修复方案（未实施）

## 背景与范围

同步记录，接续 `2026-09-21-remaining-dialogs-submit-and-dismiss.md`。上一条记录里资金类（划转、发送、充值、提现）只把按钮名称改成静态、有意没有改成点击即关闭。产品负责人要求「调试 app.hyperliquid.xyz/trade/HYPE 交易终端的实践，再规划修复方案」。本次只做取证与方案，没有改动任何代码；分支 `fix/market-close-confirmed-size`（工作树 worktree-05），未推送。

## 结论与依据

取证方式：在内置浏览器里打开官方交易页，不连接钱包、不签名，用同源 `fetch('/assets/…')` 读取前端包并按消息键定位。读的是源码，不是真实账户的行为；没有执行任何资金操作。此前向官方页面注入只读假钱包的做法被权限系统拦下，这次没有尝试。涉及的文件（文件名带哈希，会变）：`config-C5R5bd2i.js`、`AcrossWithdrawModal-Cou1hIjO.js`、`index-BC9xGS0t.js`、`en-US-CxnwwUCp.js`（文案包是模板字符串格式，解析出 1,980 条消息）。

- 所有主钱包签名动作走同一个包装（包内名 `x8`）：签名 → 提交 → 成功通知或把交易所的错误文本作为错误通知；签名被拒安静返回，只有打开「详细错误」设置才通知；对交易所拒绝不抛异常，返回 `{success, err}`。通知成功与错误 6 秒、加载中 300 秒，带关闭按钮，可按 id 原位更新。
- 划转 Perp ⇄ Spot：按钮固定 `Confirm`，请求期间只禁用；`await` 之后无论成败都调用 `onClose()`。通知 `Transfer success.`。
- 发送：共用的动作按钮名称固定 `Send`，等待期间显示 `Confirm in Wallet` 加转圈；提交前检查目的地址，需要激活费或首次向该地址发送时弹出带勾选的二次确认；请求结束后无论成败都关闭；通知 `Sent {amount} {token}`（发送函数 `DP` 的成功消息，已复核）。目的地址输入框在聚焦且为空时列出最近发送过的地址。
- 提现（懒加载块）：按钮名称随校验变化但都是静态文案；等待期间外部钱包 `Confirm in Wallet`、Privy 内嵌钱包 `Withdrawal pending`；结束后无论成败都关闭；桥余额不足时自动改走 CCTP；成功写入 localStorage 的 `hyperliquid.pending_withdrawals`（按地址、以 nonce 为键），由账本推送核销。
- 充值：钱包拒绝或失败发错误通知，弹层留在原地并复位步骤；广播后出一条带区块浏览器链接的加载中通知 `Deposit pending`，1 个确认后同一条通知原位变为 `Deposit confirmed…`，并写入 `hyperliquid.pending_deposits`；确认后弹层关闭。
- 账户面板在存在待处理记录时显示 `Pending Deposit / Withdrawal` 链接，指向 `/portfolio/deposit`。

与 gatu 的差异：划转与发送成功后没有任何反馈、失败只显示在弹层里；提现与充值的长时间状态在弹层内的状态页。gatu 的状态未知指引、CCTP 充值跟踪记录与资金动作锁比官方更严格；`FundsActionRecoveryHost` 已经为金库与质押动作提供「持久化标记 + 对账本核销 + 恢复弹层」，可以扩展给提现与充值。

上一条记录里「资金类不点击即关闭」的判断与官方一致；需要补的是结果通知，以及把长时间状态移出弹层。方案见 `docs/funds-dialog-outcome-plan.md`：第一步划转与发送的结果走通知，第二步提现状态移到通知与页面级宿主，第三步充值同理；三项待决策（失败后弹层去留、是否显示 `Confirm in wallet`、是否做第二三步）附建议。

## 验证与限制

- 本次没有代码改动，未运行类型检查、单测或构建。文档改动做了路径与链接检查和 `git diff --check`。
- 官方做法来自对压缩后前端包的阅读，包内标识符是混淆名，会随发布变化；复查时按消息键定位。没有观察真实账户下的弹层行为、通知时序或钱包弹窗。
- 官方代码片段未入库。

## 后续与替代关系

- 不替代任何记录。
- 等产品负责人对三项决策给出答复后再实施；实施时更新 `docs/confirmation-surfaces.md` 例外表与本方案文档的状态。
- 下一次先查：`docs/funds-dialog-outcome-plan.md`、`funds-action-balances.test.tsx`（资金守卫用例）、`components/funds-action/`。
