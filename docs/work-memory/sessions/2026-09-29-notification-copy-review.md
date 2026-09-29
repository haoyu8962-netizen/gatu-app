<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-notification-copy-review",
  "date": "2026-09-29",
  "title": "全站通知文案审查：准确、不重复、用词跟随界面按钮",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "i18n-runtime"],
  "summary": "提现成功通知精简之后，用户要求审查其他通知是否有同类问题（冗长、重复、语义与实际状态不符、用词与界面不一致）并一并修复，中文用词统一跟随界面按钮：存款、提款。三个只读子代理分别审查资金、交易与其他通知，逐条对照代码核实后分四批修改：A 中文目录 48 条充值/提现/入金改为存款/提款；B 资金通知（提现状态未知、自动测试网存款、CCTP 转发、金库、质押、Earn、推荐、转账/发送数字格式）；C 交易通知（TP/SL 无法确认不再声称已提交、泛化失败原因不再重复、单一目标部分成交、兑换显示交易对、保证金模式与账户类型写明实际结果、中文用委托/取消/终止）；D 其他（断开连接失败、盈亏分享图片只在下载时提示已保存、TWAP 成交记录中文）。一项代理结论经核实不成立未改；其余延后项记录在后续。在 claude/withdraw-toast-copy 完成，快进合并回 claude/from-dev-0928。",
  "thread": null,
  "baseCommit": "e09630cb",
  "commits": ["b67229f2", "da077f4a", "d025441f"],
  "sources": [
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/withdrawals.md" },
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "apps/terminal/src/lib/trade/order-notification-copy.ts" },
    { "path": "apps/terminal/src/components/staking/domain/staking-action-feedback.ts" },
    { "path": "apps/terminal/src/hooks/wallet/use-wallet-session.ts" },
    { "path": "apps/terminal/src/components/trade/positions/position-pnl-share-modal.tsx" },
    { "path": "apps/terminal/src/locales/zh/messages.po" },
    { "path": "CHANGELOG.md" },
    { "path": "docs/work-memory/sessions/2026-09-29-withdraw-toast-copy.md" }
  ],
  "supersedes": []
}
-->
# 全站通知文案审查：准确、不重复、用词跟随界面按钮

## 背景与范围

同步记录，没有取得可核对的会话 ID。上一步（[提现成功通知精简](2026-09-29-withdraw-toast-copy.md)，`e09630cb`）完成后，用户要求继续审查其他通知是否存在同类问题，审查后把存在的问题规划成修复任务一并修改；并决定中文「用词统一跟随界面按钮，提款和存款」。工作仍在 `.claude/worktrees/withdraw-toast-copy`（分支 `claude/withdraw-toast-copy`），完成后快进合并回 `claude/from-dev-0928`，未推送。

范围是通知（Sonner 通知与订单队列通知）的文案、结构和与之共用的状态屏文字，以及对应测试、文档与五种语言译文。执行路径、校验、守卫和通知的时序不变；例外是下面写明的几处「何时显示」调整（盈亏分享图片、TP/SL 确认中状态、推荐请求的失败状态），它们只影响展示。

## 结论与依据

### 审查方法

三个只读子代理（general-purpose，明确禁止改文件与提交）分别审查资金通知、交易通知、其他通知，给出每条问题的位置、原文、问题类型和建议。每条结论在改动前都对照当前代码和 `docs/trading-notifications.md`、`docs/confirmation-surfaces.md` 核实：

- 交易第 14 项（订单修改的中文用词）核实后发现原译文与控件一致，不成立，未改。
- 其余成立的问题按领域分批修改，每批单独提交。

### 问题类型与代表例子


- **与实际状态不符**：TP/SL 无法确认时写「已提交订单，请勿重试」，但旧 TP/SL 可能已被取消，改为「TP/SL may have changed. Review this position's TP/SL before retrying.」；自动测试网存款在 Arbitrum 确认时就说已提交到 Hyperliquid，改为「USDC deposit confirmed on Arbitrum」；推荐请求明确失败也标为「Request not confirmed」，改为失败状态。
- **重复**：失败原因只是「Failed」的同义复述（如「Order failed」）时不再显示；已有核对说明的未确认结果摘要只写「Unconfirmed」；成功的取消/修改/逐仓保证金/TP/SL 只写结果（`Canceled`、`Modified`、`Updated`）；提现状态未知不再复述「无法确认」。
- **信息缺失或不对**：单一目标的部分成交写「Partially filled」与「Review positions」，不再是「Fully filled 0/1」；兑换显示交易对（HYPE/USDC）而不是内部 id（@107）；保证金模式与账户类型写明实际切换到的值；质押、Earn 写明动作和数量；金库提款只在佣金、平仓成本大于零时列出，交易哈希改为短的浏览器链接。
- **用词不一致**：中文 48 条充值/提现/入金改为存款/提款（`借入金额`、`存入金库` 等非充值含义保留）；订单结果用「委托」、撤单用「取消」、TWAP 用「终止」，与对应控件一致；断开连接失败不再叫「Secure disconnect」（界面没有这个按钮），而是「Disconnect failed:」；TWAP「Fill History」中文由「填充历史」改为「成交记录」。

### 分批改动

| 批次 | 提交 | 内容 |
| --- | --- | --- |
| A | `b67229f2` | 中文目录存款/提款统一（48 条），相关中文断言同步 |
| B | `da077f4a` | 资金通知：提现状态未知、自动测试网存款、CCTP 转发与已提交、金库、质押（`getStakingActionSuccessMessage` / `getStakingActionFailureNotice`）、Earn、推荐、转账与发送金额跟随数字格式设置（补 `useNumberFormatRevision()`） |
| C | `d025441f` | 交易通知：`order-notification-copy.ts` 的泛化失败过滤、未确认摘要、单一目标部分成交与已成交；TP/SL、订单对账、TWAP 终止、保证金模式、账户类型、兑换；中文委托/取消/终止等覆盖 |
| D | 本记录所在提交 | 断开连接失败与邮箱钱包不可用的英文措辞；盈亏分享图片只在实际下载时提示「Image saved」，手机调起系统分享时不提示，失败为「Failed to save image」；中文 TWAP 成交记录、导出进度省略号统一为目录多数写法 `...`、存款和提款记录导出失败、断开重试措辞 |

每批都运行 `pnpm i18n:extract` 并补齐 zh/fr/es/hi/ar 新词条；缺译数保持改动前基线（ar/es/fr/hi 各 44、zh 3）。重命名产生的废弃词条（`#~`）按目录既有做法保留。`docs/trading-notifications.md` 追加 2026-09-29 补充，`docs/confirmation-surfaces.md`、`docs/withdrawals.md`、`docs/funds-dialog-outcome-plan.md` 与 `CHANGELOG.md` 同步更新。

## 验证与限制

均在 worktree 内（依赖在该 worktree 新装，`tsc` 为锁定的 5.7.2），2026-09-29，本地 macOS。

- 批次 A：受影响的 3 个中文断言测试文件 22 项通过；`pnpm i18n:extract` 后缺译数不变。
- 批次 B：资金相关 54 个测试文件 1,103 项通过（存款、CCTP、自动存款、资金锁、金库、Earn、推荐、提款、发送、转账、账本、质押视图、金库控制器、多语言与数字格式契约）。过程中的失败均已修复后重跑：金库结果用例按新文案更新；数字格式契约指出 `SendModalBody`、`TransferModalBody`、`VaultDetailLive` 缺少 `useNumberFormatRevision()`，已补。typecheck 退出码 0。
- 批次 C：确认面与交易通知相关 108 个测试文件 2,005 项通过。Playwright：`notifications` 19、`position-close-all` 41、`account-actions` 24、`mobile-trade-all-orders` 47 项通过。过程中 `position-market-close-submit` 两个用例原先断言渲染出的泛化错误文字，改为断言存储的分类码并断言渲染为空。typecheck 退出码 0，Biome 检查改动的 21 个文件通过。
- 批次 D：`position-pnl-share-modal`（新增手机无法分享时下载并提示的用例；手机调起分享时断言不提示）与 `wallet-session` 共 40 项通过；加上多语言、数字格式、错误文案、CSV 与 TWAP 导出契约共 11 个文件 319 项通过；typecheck 退出码 0；Biome 检查改动的 4 个文件通过。
- 全量 `pnpm --filter @gatu/terminal test`（批次 A–C 已提交加批次 D 未提交改动，即批次 D 提交的内容）：635 个文件中 633 通过、1 跳过、1 失败；7,881 项中 7,879 通过、1 跳过。唯一失败是 `chart-build-assets.test.ts` 的 TradingView 源树摘要校验在全量并行负载下超过 5 秒超时，与本次改动无关；单独重跑该文件 17 项通过，该用例 488ms。
- 未做：真实钱包下的存款、提款、金库、质押、Earn、推荐和交易，通知在真实界面的截图，真机。单测与 Playwright 夹具不能证明交易所或钱包的真实返回。

## 后续与替代关系

本记录不替代其他记录；它延续[提现成功通知精简](2026-09-29-withdraw-toast-copy.md)。未在本次修改，留待单独决定：

- CCTP 提款手续费在表单显示后、点击时重新读取之前变化不会中止（上一条记录已另开任务）。
- 旧桥（Bridge2）存款成功分支已不可达，文案未改。
- 转账与发送的「结果不明」目前以短错误通知呈现，没有像提款那样的未确认状态。
- 推荐码过长时的截断、推荐步骤标签中文单字换行、金库长名称两行、详情图表重叠、11 条中文「Vault」未译、圆角统一。

补记（2026-09-29）：「后续」里的转账与发送结果不明、Bridge2 存款成功分支、推荐码截断、推荐步骤中文单字换行、金库长名称、详情图表重叠、11 条中文「Vault」已由[通知审查后续记录](2026-09-29-funds-ui-followups.md)处理，其中金库长名称改为完整换行而不是两行。CCTP 提款手续费由另一会话在分支 `claude/withdrawal-fee-review-bound` 处理（本记录写成时尚未合入）；各页卡片圆角是否统一仍待决。
