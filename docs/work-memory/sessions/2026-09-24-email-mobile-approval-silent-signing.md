<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-email-mobile-approval-silent-signing",
  "date": "2026-09-24",
  "title": "邮箱用户在 Link mobile device 弹窗里仍弹出 Privy 签名确认：原因与对齐官方的静默签名",
  "kind": "task",
  "status": "verified",
  "topics": ["pairing-release"],
  "summary": "用户截图：邮箱用户在 Link mobile device 弹窗点 Approve 后出现 Privy「Approve mobile trading access」确认。原因是弹窗调用 approveAgent.mutateAsync 时没有传 applicationReview: \"confirmed\"，createPrivyAgentSigner 按 trading-onboarding §4 的默认规则回退到显式 UI；官方产物全局 showWalletUIs:false 且无按调用 uiOptions，approveAgent 经 Privy provider 静默签名。已让审批与撤销两处声明应用层审查已完成，弹窗测试钉住该参数；API 钱包管理弹窗的 Privy 确认保留待决。",
  "thread": null,
  "baseCommit": "b14c3a12",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx" },
    { "path": "apps/terminal/src/hooks/wallet/use-explicit-agent-approval.ts" },
    { "path": "apps/terminal/src/lib/wallet/privy-agent-signer.ts" },
    { "path": "apps/terminal/src/config/privy.ts" },
    { "path": "docs/trading-onboarding.md" },
    { "path": "docs/email-trading-signing.md" },
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "url": "https://app.hyperliquid.xyz/assets/index-58uVNh8f.js" },
    { "url": "https://docs.privy.io/recipes/react/manage-wallet-UIs" }
  ],
  "supersedes": []
}
-->
# 邮箱用户在 Link mobile device 弹窗里仍弹出 Privy 签名确认：原因与对齐官方的静默签名

## 背景与范围

同步记录。用户在开发页（邮箱登录、`createAndReveal` 打开的构建）点 Link mobile device → Approve 后，出现 Privy 自带的 EIP-712 确认弹窗（标题「Approve mobile trading access」、正文列出 `HyperliquidSignTransaction` 域与 `approveAgent` 消息、按钮「Approve access」），并要求核对官方实践。基线 `b14c3a12`，开始时工作区干净。未登录官方站，未在真实账户上执行审批。

## 结论与依据

1. **弹窗内容是我们自己传给 Privy 的。** `privy-agent-signer.ts` 在 `applicationReview !== "confirmed"` 时以 `uiOptions: { showWalletUIs: true, title: "Approve mobile trading access", description: …, buttonText: "Approve access" }` 调用 Privy `signTypedData`；`use-explicit-agent-approval.ts:45` 只有在调用方显式传 `applicationReview: "confirmed"` 时才透传。`mobile-agent-sync-modal.tsx` 的审批（`handleApproveSync`）与撤销（`handleConfirmRevocation`）两处都只传了 `{ signal }`，于是每次都落到显式 UI。全局 `config/privy.ts` 的 `embeddedWallets.showWalletUIs: false`、owner/legal/deposit 三个签名器都按调用传 `showWalletUIs: false`，只有这条路径例外。
2. **这是既有规则的默认分支，不是 bug 型遗漏。** `docs/trading-onboarding.md` §4：嵌入钱包只在「该入口已完成自己的应用层权限审查」时才隐藏重复的 Privy 确认，其他 Agent 审批默认保留确认；`docs/email-trading-signing.md` 边界 4、ADR 0002 同义。但 Link mobile device 弹窗本身就有审查面（「Approve a mobile trading key」面板 + 页脚按钮；撤销要先「Review revoke」再确认），满足隐藏条件，只是没有把这个事实告诉签名器。
3. **官方实践：静默。** 2026-09-24 线上产物 `index-58uVNh8f.js`：`PrivyProvider` 配置 `embeddedWallets: { ethereum: { createOnLogin: "all-users" }, showWalletUIs: false }`；应用代码里 `showWalletUIs`/`uiOptions` 只出现在 Privy SDK chunk（`index-CUao1WyN…`、`useActiveWallet…`），主包与 `config-DWLPMyx3.js` 没有任何按调用的 `uiOptions`。`approveAgent`（`config-DWLPMyx3.js` 中构造 `HyperliquidTransaction:ApproveAgent` 的分支）经 `w8()` → `y8(wallet)`（`wallet.getEthereumProvider()` 包成 viem 钱包客户端）→ `signTypedData` 提交，即 Privy 嵌入钱包的 EIP-1193 provider 静默签名；ADR 0015 记录官方签名期间只显示转圈与「Approve QR code with wallet...」。静态证据已足以判定，不需要用真实账户复现（复现会在用户主网账户上真的批准一个 Agent）。
4. **修复。** 弹窗两处 `mutateAsync` 都传 `{ signal, applicationReview: "confirmed" }`；`createPrivyAgentSigner` 的显式 UI 分支保留为其它调用方的默认（`docs/trading-onboarding.md` 规则不变）。`useExplicitAgentApproval` 的另外两个调用方：`providers/client-root.tsx` 只是把 `mutateAsync` 注入 `HyperliquidAgentApprovalProvider`（外部钱包建立连接弹窗已传 `confirmed`）；`api-wallet/use-api-wallet-controller.ts:303` 的 API 钱包授权/移除仍只传 `{ signal }`，邮箱用户在那里仍会看到 Privy 确认——它有自己的确认弹窗，按同一规则也可以静默，但这是另一个入口的决定，本次未改。
5. **文档。** `docs/trading-onboarding.md` §4、`docs/email-trading-signing.md` 边界 4 写明 Link mobile device 弹窗属于已完成审查的入口；ADR 0015 加 2026-09-24 补注；CHANGELOG 一条。

## 验证与限制

- `mobile-agent-sync-modal.test.tsx` 的两处 `mutateAsync` 断言改为要求 `applicationReview: "confirmed"`（审批与撤销各一）；`privy-agent-signer.test.ts` 继续钉住「未确认 → 显式 UI，已确认 → 隐藏」两种行为；`use-explicit-agent-approval.test.tsx` 钉住透传。
- 实际运行：Biome 无问题；`pnpm --filter @gatu/terminal typecheck` 0 错误；`mobile-agent-sync-modal`、`use-explicit-agent-approval`、`privy-agent-signer`、`use-agent-registration-race`、`establish-connection-modal`、api-wallet 相关、`privy-config`、`mobile-agent-lifecycle` 共 14 文件 253 项通过。
- 未做：真实邮箱账户上的实际审批（本地构建 `createAndReveal` 关闭，弹窗显示「temporarily unavailable」，无法走到签名；用户环境可验证）；官方站真实登录复现（静态证据已足够，且会在真实账户上创建 Agent）。

## 后续与替代关系

- 不替代任何记录；接续 ADR 0015 与 `docs/trading-onboarding.md`。
- 待用户决定：API 钱包管理弹窗（授权/移除）是否同样声明 `applicationReview: "confirmed"` 以对齐官方的全局静默。
