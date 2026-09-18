<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-mobile-disconnected-alignment",
  "date": "2026-09-18",
  "title": "移动端未登录状态对齐官方：账户零值概览与持仓工具栏常驻",
  "kind": "task",
  "status": "recorded",
  "summary": "核对确认 7f2f66ac 只对齐了桌面未登录账户面板，移动端 Account 页与持仓区仍是引导文案加 Connect 按钮；无头对比官方 390 px 后按三条实施：Account 页改为零值概览加禁用 Deposit/Withdraw（保留邮箱赞助充值例外），持仓区未登录保留禁用的筛选工具栏与空列表，规则写入 AGENTS.md 与 desktop-grid-layout.md。",
  "topics": [
    "docs-governance"
  ],
  "thread": null,
  "baseCommit": "6df02047",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/mobile/mobile-account-view.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-positions-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-filter-toolbar.tsx" },
    { "path": "docs/desktop-grid-layout.md" },
    { "path": "AGENTS.md" }
  ],
  "supersedes": []
}
-->
# 移动端未登录状态对齐官方：账户零值概览与持仓工具栏常驻

## 背景与范围

用户询问未登录状态是否改过。`git log` 显示 2026-09-08 的 7f2f66ac「align disconnected account and order entry layout」只改了桌面账户面板（`disconnected-account-overview.tsx`，零值概览加禁用资金按钮，规则见 `docs/desktop-grid-layout.md`「Disconnected account and order-entry presentation」）；移动端 `mobile-account-view.tsx` 与 `mobile-positions-tab.tsx` 的 `!isConnected` 分支自 2026-03-30 monorepo 迁移起未变。

无头 Chromium（390×844、无会话）对比官方 `app.hyperliquid.xyz/trade/HYPE`（2026-09-18）：

| 页面 | 官方 | 我们（改前） |
|---|---|---|
| 持仓区（市场页 / 交易页） | 标签行与工具栏（排序、Side、Market、Expand All、Close All）照常显示，列表留空、无提示 | 工具栏隐藏，列表换成钱包图标、「Connect your wallet to view positions.」与 Connect Wallet 按钮 |
| Account 页 | 「Unified Account Summary」零值概览（0.00%、$0.00×3、0.00x）加 Deposit / Withdraw 按钮 | 整页居中钱包图标、Connect Wallet 标题与按钮 |
| 交易页下单表单 | 表单可见，主按钮 Connect | 表单可见，主按钮 Connect Wallet；基本一致 |

用户决定按三条实施：Account 页零值概览加禁用资金按钮并保留邮箱赞助充值例外；持仓区保留工具栏（禁用）与空列表、去掉引导文案；规则写入 AGENTS.md。分支 `claude/surface-tokens-touch-feedback`，基线 6df02047。

## 结论与依据

### 实施

- `mobile-account-view.tsx`：删除 `!isConnected` 的整页引导分支（钱包图标、Connect Wallet 标题、按钮与内嵌 `WalletModal`）。未登录时走同一份概览渲染（已有零值占位，进度条在比率未就绪时不画），资金操作区改为固定的两列 Deposit / Withdraw：普通钱包路径两者都禁用；邮箱赞助路径 Deposit 按 `depositAvailability.available` 启用并沿用通知文案（可用且无通知时显示「Open Deposit to prepare your email wallet.」）。未登录不显示 Perps / Spot 与 Bridge。按钮不用 `focusableWhenDisabled`，保持原生 `disabled`。
- `position-filter-toolbar.tsx` / `position-market-filter.tsx`：新增 `disabled` 透传到 `Dropdown` 与市场筛选按钮。
- `mobile-positions-tab.tsx`：筛选行抽成 `renderFilterRow(disabled)`；`!isConnected` 分支渲染禁用的筛选行（Expand all / Collapse all 传空键即禁用）与空列表，删掉「Connect your wallet to view positions.」。
- `mobile-positions-view.tsx`：共享容器在未登录且当前标签为 positions 时渲染真实标签内容，其他标签保持各自提示（范围外）。
- 规则：`AGENTS.md` 桌面布局契约补移动端句；`docs/desktop-grid-layout.md` 未登录小节新增移动端条目；`CHANGELOG.md` Changed。

### 改后对照（无头 390×844，无会话）

- 市场页 / 交易页持仓区：标签行 + 禁用的 Direction ▾、Margin ▾、Expand all、Collapse all，列表留空，无提示文案。
- Account 页：Account Summary 零值（0.00%、$0.00×3、0.00x）+ 底部禁用的 Deposit / Withdraw，无 Connect 文案；顶栏 Connect Wallet 保留。

## 验证与限制

- 新增测试：`mobile-account-view` 「未登录显示零值概览与惰性资金按钮、不出现 Connect 文案」；`mobile-position-filter-row` 「disabled 时全部控件惰性」加源码契约（`!isConnected` 分支调用 `renderFilterRow(true)`、源码不再含提示文案）；`mobile-positions-tabs` 未登录用例增加 positions 标签渲染真实内容的断言。
- 7 个相关文件 67 用例通过；typecheck、Biome 通过。既有邮箱赞助用例「does not invite an email deposit while its action is unavailable」在改动后仍通过（禁用态依赖原生 `disabled`，首轮用 `focusableWhenDisabled` 时该用例读到 `aria-disabled` 而失败，已改回）。
- 官方 Account 页在未登录时显示 Deposit / Withdraw 两个按钮，本次同样禁用；官方是否也禁用未能从截图判定（被公告卡遮挡）。桌面 `positions-tab.tsx` 的未登录占位、移动端其他标签的提示未改。未做真机验收。

## 后续与替代关系

- 补充 7f2f66ac 的桌面对齐；不替代任何记录。其他移动端标签（Balances、Orders、TWAP、历史）的未登录提示不在本次范围。
