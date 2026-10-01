<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-mobile-order-button-status",
  "date": "2026-10-01",
  "title": "移动端下单按钮的提交状态与桌面一致",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "brand-identity"],
  "summary": "移动端下单按钮提交订单时不再转圈、名称保持方向标签，只有启用交易的钱包签名阶段显示 ButtonLoading，与桌面一致；状态动效契约移除该转圈豁免，渲染真实 MobileTradeView 的用例钉住两种状态（旧代码上 4 例失败）；未做真机与真实钱包验收。",
  "thread": null,
  "baseCommit": "2baa44e2",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/trade-panel.tsx" },
    { "path": "apps/terminal/src/lib/tests/status-motion-surface-contract.test.ts" },
    { "path": "apps/terminal/tests/mobile-trade-size-validation-a11y.test.tsx" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/order-entry-surface-parity.md" },
    { "path": "docs/adr/0029-brand-status-motion.md" }
  ],
  "supersedes": []
}
-->
# 移动端下单按钮的提交状态与桌面一致

## 背景与范围

同步记录，未取得可核对的任务标识。基线 `2baa44e2`（本地分支 `claude/from-dev-1001` 当时的末端，含 Sairn 改名与 ADR 0029 的状态动效，尚未推送）；本任务在 worktree 分支 `claude/brave-mestorf-f0cab6` 上完成，该分支先快进到这个基线。

用户要求：移动端下单按钮（`mobile-trade-view.tsx`）提交订单时仍显示旋转图标，而桌面自 2026-09-21 起提交时不显示状态（订单状态在右下角的通知队列）。改为与桌面一致：提交时没有任何指示、按钮名称不变；启用交易（Agent 注册、builder fee 授权与核验）属于钱包握手，可以显示进度，用桌面 `trade-panel.tsx` 同样的 `ButtonLoading`。这一项是 [品牌迁移计划](../../brand-migration-plan.md) D12 (j) 与 [ADR 0029](../../adr/0029-brand-status-motion.md) 第 6 条留下的待决定项。

## 结论与依据

- 实现：`TradeCtaView` 的 `iconLeft` 由 `isSubmitting || isRegistering ? <SpinnerGapIcon …animate-spin /> : undefined` 改为 `isRegistering ? <ButtonLoading /> : undefined`，删除不再使用的 Phosphor 导入。提交期间按钮仍由 `getMobileOrderButtonContent` 的 `isSubmitting` 禁用，名称仍是方向标签，与桌面 `useButtonContent` 的提交分支一致；签名阶段的文案 `Signing...` 不变（已由 `action-progress-label-contract` 按钱包握手登记）。
- `ButtonLoading` 用默认 16 px，与桌面一致；原转圈是 20 px（`size-5`）。按钮居中排列，图标宽度变化不移动按钮本身。
- `status-motion-surface-contract.test.ts`：从 `ALLOWED_SPINNERS` 删除 `mobile-trade-view.tsx`，并在 `MOTION_SURFACES` 登记它必须含 `<ButtonLoading`，回退成转圈或删掉握手指示都会失败。
- 渲染测试放在已有的完整 `MobileTradeView` 夹具 `tests/mobile-trade-size-validation-a11y.test.tsx` 里（新的 describe「MobileTradeView order button status」），没有另建文件复制约 280 行的桩：夹具把 `useOrderSubmit().isSubmitting` 与 `useTradingAuthorization().status` 改为可控。用例一：提交中按钮仍是同一个节点、名称 `Buy`、禁用、按钮内没有 SVG 也没有 `LOADING_INDICATOR_SELECTOR` 命中、点击不提交。用例二（`approving_fee`、`approving_agent`、`verifying` 三种状态）：空闲时 `Enable Trading` 无指示；签名阶段 `Signing...` 禁用，内含 `data-brand-motion="button-loading"`、`data-appearance="mono"`、`aria-hidden="true"` 的指示且只有一个，没有 `.animate-spin`，点击不再次授权。

## 验证与限制

2026-10-01 在本 worktree、基线 `2baa44e2` 加本任务未提交改动上本地运行（依赖由 `pnpm install --frozen-lockfile --prefer-offline` 安装）：

- AGENTS.md「Confirmation surfaces」组：50 个文件、1,084 个用例通过。
- AGENTS.md「Desktop trading layout and order entry」组：7 个文件、107 个用例通过。
- 其余读取或导入 `mobile-trade-view.tsx` 的测试与 `status-motion-contract`：13 个文件、214 个用例通过。
- `pnpm --filter @sairn/terminal typecheck` 通过；改动的 TS/TSX 经 `pnpm exec biome check` 无问题。

- 变异检查：把 `mobile-trade-view.tsx` 临时恢复为基线版本，新增的 4 个用例全部失败，`status-motion-surface-contract` 的 2 个用例也失败；恢复改动后全部通过。
- 只有 jsdom 单元测试；没有在浏览器里看过这个按钮，没有真机、没有真实钱包签名或真实下单。`tests/browser/brand-surfaces.pw.ts` 未运行。

## 后续与替代关系

- 移动端与桌面签名阶段的文案仍不同（移动 `Signing...`，桌面 `Sign in wallet...` / `Verifying...`），本任务未改。
- 本分支提交后需要并入 `claude/from-dev-1001`（或随它一起开 PR 到 `dev`）。
