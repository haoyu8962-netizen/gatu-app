<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-email-wallet-ui-review",
  "date": "2026-09-16",
  "title": "邮箱钱包标识、提现链与密钥导出入口审查",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "account-funding"
  ],
  "summary": "2026-09-16 审查发现紧凑邮箱标识与导出入口缺口，实测提现为 Arbitrum CCTP；UI 已由 df4ed89f 修复并进入 main，见迁移补记。",
  "thread": null,
  "baseCommit": "f8911794",
  "commits": [],
  "sources": [
    {
      "path": "apps/terminal/src/components/trade/header/user-menu.tsx"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/blob/5912ee638069ea816c33922f6005af1bac0640bf/apps/terminal/src/components/trade/tradebox/deposit/across-wallet-recovery.tsx"
    },
    {
      "path": "docs/withdrawals.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-16-wallet-session-recovery.md"
    },
    {
      "url": "https://docs.privy.io/wallets/wallets/export"
    },
    {
      "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/export-your-email-wallet"
    }
  ],
  "supersedes": []
}
-->
# 邮箱钱包 UI 与提现代码审查

## 背景与范围

用户要求核查邮箱登录为何显示地址、提现走哪条链、设置为何无导出密钥入口。检查对象为已有 `localhost:3005/trade/BTC`，来源工作树 `.claude/worktrees/previous-task-review-b5a831`（前次查询 HEAD f5010ee7，本轮开始已有大量移动 UI 与文档未提交修改）。不能用 Across 分支功能代表该运行版本。当前根仓库仅追加审查记录，不修改任一工作树的业务代码，也不纳入既有改动。独立任务标识未取得。

## 结论与依据

1. **邮箱身份显示不一致，UI 缺陷。** 运行版本 `user-menu.tsx` 的 `displayLabel` 优先邮箱，但 `compactDisplayLabel` 只要有地址就优先短地址；`max-[1181px]` 隐藏前者并显示后者。本次浏览器只读观察确认同一账户按钮内邮箱标签不可见、地址标签可见。不能把这个表现解读为切换到外部钱包；应保留邮箱登录标识并在空间不足时截断，地址另行展示/复制。
2. **当前运行版本缺少邮箱钱包导出入口。** 运行工作树全量 src 搜索无 `useExportWallet` 或 `exportWallet`，用户菜单仅有复制地址、关联移动设备、断开连接；设置组件没有密钥导出操作。属于钱包恢复能力缺口。Across 分支根目录已有 `Deposit history and wallet recovery` 菜单，经 AcrossRecoveryModal 调用 AcrossWalletRecovery 和 `exportWallet({address: exactOwner})`，因此不是整个项目完全没做，而是当前运行版本未包含；入口名称也不如直接“导出邮箱钱包”易发现。不能把 Privy 导出能力等同于应用 UI 自动具备入口。
3. **本次未发现提现目标链错误。** 打开提现弹窗（未填金额/地址、未点击提交），实测标题为提取 USDC 至 Arbitrum，网络 Arbitrum（CCTP），当前指示费 0.20 USDC、最低 0.40 USDC；这些为当时值，不是永久费率。邮箱目标地址为空且可编辑，说明 UI 仍按邮箱钱包处理。

运行代码按新鲜 `usdcRouting.withdrawalRoute` 选择：cctp → `sendToEvmWithData`，bridge → `withdraw3`，两者目前目标均为 Arbitrum；协议不是用户选项，未知路由禁止提交。CCTP 参数 `destinationChainId=3` 为 CCTP 域号，不是 EVM chain ID；目标地址使用邮箱用户显式输入，签名前再核对路由、费用、余额、身份与激活条件，不在失败后自动换协议。此提现流程未调用 Across。未提交资金，因此不宣称真实到账或签名正确性已验收。

官方文档当日实时核对：Privy React 提供 `useExportWallet().exportWallet({address})`；用户明确操作后由 Privy 界面展示密钥，应用应传入当前精确 embedded owner。HL 官方帮助明确把 Export Email Wallet 放在导航设置菜单。下一步 UI 修复应提供独立、可发现的邮箱钱包恢复入口，遵循用户验证/取消/MFA和精确 owner 规则，不依赖 Across 建址权限，也不要求用户先充值。此次没有打开密钥导出或读取密钥。

## 验证与限制

在实际运行工作树通过 Node 22.15.0 / Corepack 执行四个定向 Vitest 文件：`user-menu.test.tsx` 16、`withdrawal.test.ts` 10、`withdraw-form-ui.test.tsx` 13、`deposit-modal-withdrawal-routing-guard.test.tsx` 88，合计 **127/127**。版本范围为当时工作树代码及其既有修改，并非干净 f5010ee7 或 Across 根目录。现有测试通过不覆盖/否定上述紧凑邮箱显示和导出入口缺口。

浏览器实际核验账户标签可见性、钱包菜单、提现网络与目标地址可编辑；结束关闭弹窗。不签名、不转账、不导出密钥、不修改安全或登录配置。纯审查记录，未运行全量构建或全部测试。

工作记忆检查：`memory:index`、`memory:check`、`memory:test`（8/8）及 `git diff --check` 均通过。

## 后续与替代关系

建议修复紧凑布局邮箱标识，并把已有精确 owner 导出能力以独立明确入口接入实际运行版本；避免整批搬入尚未验收的 Across 功能。保留当前提现路由及签名前验证。此次是核查结论，两个 UI 问题尚未修复，不宣称当前运行页面已有导出功能。

## 2026-09-20 迁移补记

本记录从原提交 `5912ee638069ea816c33922f6005af1bac0640bf` 迁入基于 `d6cc4f3e` 的 `codex/wallet-review-04`，保留原始日期、版本与历史验证结论。当前复核结果见 [worktree-04 迁移记录](2026-09-20-wallet-review-04.md)。

上述两个 UI 缺口已由 `df4ed89f` 修复并进入 main；本记录“尚未修复”仅描述 2026-09-16 审查时的运行版本。最新移动端还按 2026-09-18 设计显示邮箱本地名，桌面仍保留邮箱身份。Across 恢复文件不在当前 main 中，元数据来源改为原提交的固定链接，保留历史依据；该链接未做远端可用性验收，可本地用 `git show 5912ee638069ea816c33922f6005af1bac0640bf:apps/terminal/src/components/trade/tradebox/deposit/across-wallet-recovery.tsx` 复核。
