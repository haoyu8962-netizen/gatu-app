<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-exchange-error-i18n-review",
  "date": "2026-09-28",
  "title": "错误提示多语言审查：中文界面出现英文交易所错误的成因与全站同类问题",
  "kind": "task",
  "status": "recorded",
  "topics": ["i18n-runtime", "pr-review"],
  "summary": "用户在中文界面的手机杠杆抽屉降杠杆失败，通知标题为「保证金模式 · 更新失败」、正文是交易所英文原文。该原文按现行文档（trading-notifications.md、ADR 0019 决策 3）属于有意原样展示，官方终端调杠杆失败也原样显示同一句；但同一通知有两处真实缺陷：手机杠杆抽屉的通知标题永远是「保证金模式」，以及同一条原文通道会把我们自己的英文、SDK/网络/钱包文本一并原样显示。全站审查另发现：金库、质押、API 钱包三处把 useLingui 的 t 传进辅助函数后当模板标签调用，运行时返回空串且未进目录，所有语言都看不到这些错误与标签；部分翻译在出错时冻结、渲染期辅助函数读全局 t；对账把订单状态代码原样当错误行；分页与搜索框等共享组件写死英文。仅审查，未修改代码。",
  "thread": null,
  "baseCommit": "8cc8a323",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/tradebox/margin-mode-modal.tsx" },
    { "path": "apps/terminal/src/lib/trade/order-notification-copy.ts" },
    { "path": "apps/terminal/src/lib/errors/format.ts" },
    { "path": "apps/terminal/src/components/vaults/use-vault-action-controller.ts" },
    { "path": "apps/terminal/src/components/staking/staking-action-modal.tsx" },
    { "path": "apps/terminal/src/components/api-wallet/use-api-wallet-controller.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "packages/ui/src/pagination.tsx" },
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/adr/0019-global-trading-notifications.md" },
    { "path": "docs/i18n-presentation.md" },
    { "url": "https://app.hyperliquid.xyz/trade" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses" }
  ],
  "supersedes": []
}
-->
# 错误提示多语言审查：中文界面出现英文交易所错误的成因与全站同类问题

## 背景与范围

同步记录。用户在本地开发服务器（`dev` `8cc8a323`，中文界面，手机布局）降低杠杆失败，通知标题为「保证金模式 · 更新失败」，正文是英文「Cross position does not have sufficient margin available to decrease leverage. To decrease leverage, deposit more collateral.」。用户问这是否缺陷、其他语言是否一样，要求审查相关代码并排查全站同类问题，允许新开 worktree。本次在新 worktree `exchange-error-i18n-review`（分支 `claude/exchange-error-i18n-review`，基线 `8cc8a323`）只读审查：本人核对根因、文档与官方做法，另派三个只读代理分别覆盖交易操作、资金与账户、共享层与被动数据，本人再抽查其关键结论。没有修改业务代码。

## 结论与依据

### 截图这一条

- 成因（本人核对）：`margin-mode-modal.tsx` 失败时把 `error.message` 原样存进通知任务（约第 441–446 行），`order-notification-copy.ts` 对字符串错误原样返回（第 125、127 行），`order-toast.tsx` 直接渲染。这句英文来自 Hyperliquid 交易所响应。
- 现行规则：`docs/trading-notifications.md:50`「交易所原始错误按原文展示」，ADR 0019 决策 3「原始交易所错误保持原文」；有 4 个测试在阿拉伯语下钉住原文展示（如 `deposit-modal-withdrawal-routing-guard.test.tsx` 的 "reports a raw exchange error unchanged in any locale"）。所以这句英文本身属于现行设计，不是回归。其他非英文语言（zh、es、fr、hi、ar）表现相同。
- 官方对照（本人核对，2026-09-28 生产包）：官方调杠杆失败时把交易所返回的原文作为提示显示（`$(e.response,"error")`），只有网络失败才显示翻译的通用文案；下单只特殊处理两条原文（`Insufficient margin to place order.`，按仓位与挂单给出翻译后的提示；`Action already expired`），其余原样显示。
- 同一通知的真实缺陷（本人核对）：手机杠杆抽屉复用 `MarginModeModal`（`mobileView="leverage"`，抽屉自身标题是「调整杠杆」），但 `handleConfirm` 固定用 `title: msg\`Margin mode\``，成功与失败通知都标成「保证金模式」。

### 全站同类问题（按严重程度）

1. 所有语言都显示空文本（本人用项目的 Vitest 编译流程写临时探针测试确认：辅助函数里 `` t`…` `` 输出空串；目录中也没有这些文案）：`use-vault-action-controller.ts` 的 `getVaultActionErrorMessage`（除一处 `t(msg…)` 外全部为空，金库错误 toast 为空、弹窗内提示不显示）、`staking-action-modal.tsx` 的 `getAmountError`、`use-api-wallet-controller.ts` 的名称校验与「今天到期」「剩余 N 天」等状态/有效期标签。原因是把 `useLingui()` 的 `t` 当参数传进辅助函数后用模板标签调用，宏不会转换，运行时等于把字符串数组交给 `i18n._`。
2. 不属于「交易所原文」的英文也走原文通道（代理报告，本人抽查部分）：保证金/杠杆/账户模式、下单、平仓、撤单改单、TWAP、推荐、划转/发送/充值、API 钱包、建立连接、启用交易等路径会原样显示我们自己的英文（如 `use-asset-leverage.ts` 的 "Margin mode data is unavailable"）、hl-react 的法务/签名/nonce/注册错误、SDK 包装文本（如钱包拒签时的 "Failed to sign the typed data using the wallet"）以及 HTTP 4xx 文本。这与 AGENTS.md「Use semantic messages for task feedback and translate at render time」不符；规则只豁免交易所原文。
3. 翻译在出错时冻结或渲染期读全局 `t`：`use-asset-leverage.ts:171`（本人核对）、推荐通知、`trade-panel` 兜底文案、`formatTransferError` 在 `TradingActionButton` 渲染时调用（代理从编译产物推断会按 `error` 缓存而不随语言更新）、平仓输入错误与表单校验辅助函数。违反 `docs/i18n-presentation.md` 第 6–7 行；`i18n-reactivity-contract` 只检查清单内文件自身的导入，发现不了。
4. 稳定代码原样显示：订单对账把 `perpMarginRejected` 等状态代码写进每笔订单的错误行（`order-reconciliation.tsx` 约第 500 行，本人核对）；hl-react 的 `LegalActionNotAllowedError.reason="terms_required"` 等已有代码没有被用来翻译。
5. 交易所原文被改写或截断：我们加的 "Order N: " 前缀、SDK 加的 "cancel 0: " 前缀、`formatTransferError` 只取首行并截到 100 字符（与 `trading-notifications.md:104`「原始错误不猜测、不截断」冲突）；市价平仓拒绝时主行与每市场行重复同一句。
6. 共享组件写死英文（本人核对）：`packages/ui` 分页的 "Previous"/"Next"/"Page N"（三个历史页可见）、搜索框 "Clear search"，以及 Sonner 默认的 "Notifications"/"Close toast" 无障碍名称未覆盖。
7. 被动数据（代理报告，可见性未核实）：图表数据源把原始传输错误传给 TradingView；充值弹窗的钱包提供方检查显示原文（是否算被动数据有争议）。

已有的交易所原文映射只有三处：`format.ts` 的 "must deposit before performing actions"、兑换的 "could not immediately match"、Earn 的 "Minimum amount supplied is $1"。Hyperliquid 文档「Error responses」列出 17 种下单/撤单错误及原文，可作为映射依据；资金与其他操作的错误没有文档列表。

## 验证与限制

- 本人核对：根因与标题（源码）；文档规则与 4 个钉住原文的测试；官方生产包（`config-B3kWIW3_.js` 与主语言包，只读下载公开资源）；空串问题（临时探针测试输出 `"[]"`，测试文件已删除；en 目录中无对应 msgid）；分页与搜索框写死英文；`use-asset-leverage.ts:171` 全局 `t`；对账状态代码。
- 代理报告（未逐条复核）：各路径的完整清单、SDK 包装文本、编译产物缓存推断、被动数据可见性、充值/跨链相关截断细节。三个代理共运行约 21 个测试文件、所有断言通过，未在浏览器中核对。
- 没有修改代码；没有在真实账户上复现空提示。

## 后续与替代关系

- 待用户决定修复范围。建议先修不涉及规则变更的缺陷（空串、标题、非交易所文本改为语义代码、冻结翻译、状态代码标签、共享组件文案），再单独决定是否像官方那样映射常见交易所错误——那需要修改 `trading-notifications.md`、ADR 0019，以及 `open-interest-cap.md` 中把映射列为非目标的说明。
- 没有被替代的记录。
