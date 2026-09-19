<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-dialog-transitions-and-preload",
  "date": "2026-09-18",
  "title": "弹窗首开转圈与关闭闪现：预热惰性弹窗并恢复进出场过渡",
  "kind": "task",
  "status": "recorded",
  "summary": "实测确认首开转圈是全局弹窗惰性块的 Suspense 回退（被 React 至少保留 300 ms），关闭闪现是七个对话框壳强制 !transition-none 加上 Base UI 对「挂载即打开 / 关闭即卸载」不跑过渡；修复为空闲预热弹窗块、去掉壳的过渡覆盖、@gatu/ui Modal/Drawer 首帧门控、宿主为关闭中的弹窗保留 250 ms、市价平仓取消先动画再释放会话；开发服务器逐帧采样确认抽屉与模态均有 200 ms 进出场。",
  "topics": [
    "docs-governance"
  ],
  "thread": null,
  "baseCommit": "82d81313",
  "commits": [],
  "sources": [
    { "path": "packages/ui/src/use-presented-open.ts" },
    { "path": "packages/ui/src/modal.tsx" },
    { "path": "packages/ui/src/drawer.tsx" },
    { "path": "apps/terminal/src/components/trade/components/lazy-global-modals.ts" },
    { "path": "apps/terminal/src/components/trade/components/global-modals.tsx" },
    { "path": "apps/terminal/src/hooks/use-lingering-value.ts" },
    { "path": "apps/terminal/src/components/trade/positions/position-market-close-modal.tsx" },
    { "path": ".claude/rules/style-ui-guide.md" }
  ],
  "supersedes": []
}
-->
# 弹窗首开转圈与关闭闪现：预热惰性弹窗并恢复进出场过渡

## 背景与范围

用户在 ADR 0014 落地后反馈：打开市价平仓弹窗会转圈，关闭时会闪一下，并要求其他弹窗一并修。分支 `claude/surface-tokens-touch-feedback`，基线 82d81313，开发服务器 `127.0.0.1:3016`（内置浏览器标签 `seed`，948 px 移动端布局，钱包会话持有 GOOGL 仓位；全程未提交任何订单）。

## 结论与依据

### 转圈

页面注入 MutationObserver 后首次点击「市价平仓」：`global-modal-loading-fallback` 在 3 ms 出现、304 ms 移除，抽屉 327 ms 出现。原因：`PositionMarketCloseModal` 是 `lazy-global-modals.ts` 里的惰性块，宿主只预热了 `GlobalModals` 自身，首次打开触发 Suspense 回退，React 对已显示的回退至少保留 300 ms。同一批惰性块（设置、兑换、划转、发送、命令面板）首开同样转圈；充值有专用回退不在此列。

### 闪现

- 七个对话框壳（`position-close-dialog-ui`、`position-risk-dialog-ui`、反手确认、PnL 分享、取消全部订单、下单确认）在 2026-08-04 的视觉对齐提交里给 `AdaptiveModal` 的 `className` / `overlayClassName` 加了 `!transition-none` 与 `data-starting-style / data-ending-style` 覆盖，把共享抽屉/模态的 200 ms 进出场全部压成瞬变；仓库与记录里没有该决定的依据。
- 即使去掉覆盖，Base UI 1.3 的 `useTransitionStatus` 以 `useState(open)` 初始化 `mounted`，因此「由 store 变化挂载且一开始就 open」的弹窗没有 `starting` 状态，不跑进场；关闭时宿主立即卸载（`modal: null`），也没有 `ending` 过渡。逐帧采样：打开时 dialog 在 18 ms 出现且无 `data-starting-style`，关闭时无任何属性变化直接移除。

### 修复

1. `lazy-global-modals.ts` 新增 `useIdleGlobalModalPreload`，宿主挂载后在空闲回调（2 s 上限，无 `requestIdleCallback` 时 1 s）预热五个惰性块，市价平仓块只在启用该流程的表面预热。
2. 去掉七个壳的过渡覆盖（保留按钮上的 `!transition-none`，破坏性颜色不动画的契约不变）。
3. `@gatu/ui` 新增 `usePresentedOpen`：`Modal` 与 `Drawer` 首次提交以关闭状态渲染、布局效果里再打开，让 Base UI 进入 `starting`；`AdaptiveModal` 透传 `onOpenChangeComplete`。模态弹层过渡改为 `transition-[opacity,scale]`，因为 Tailwind 4 的 `scale-95` 写的是 `scale` 属性而非 `transform`。
4. 宿主 `SharedGlobalModals` 用 `useLingeringValue(activeModal, 250)` 为关闭中的弹窗保留挂载；划转、发送改为 `open={activeModal === …}`，兑换弹窗从 `useGlobalModalType` 派生 `open`。
5. 市价平仓取消：`onOpenChange(false)` 只置本地关闭态，`onOpenChangeComplete(false)` 再 `actions.close`；提交路径本就在挂载中把 `open` 置假，自然有退场。

## 验证与限制

- 开发服务器逐帧采样（rAF）：预热后重载首开，抽屉 26 ms 出现且无回退；市价平仓抽屉进场 `translate` 100% → 0 与遮罩 0 → 1 约 200 ms，遮罩点击退场反向 200 ms 后卸载；设置模态进场 opacity 0 → 1、scale 0.95 → 1，Esc 退场 200 ms 后卸载（宿主保留生效）。
- `pnpm typecheck` 通过；Biome 通过；新增 `global-modals-idle-preload`、`use-lingering-value` 测试，宿主测试新增「关闭中的弹窗保留到退场结束」（该文件的 `useGlobalModalType` mock 改为 `useSyncExternalStore` 订阅，否则 React Compiler 记忆化下改 mock 变量不会触发重渲染），市价平仓弹窗测试新增「取消先动画后释放会话」。
- 既有基线红（HEAD 临时 worktree 复跑同样失败，未修）：`position-market-close-modal.test.tsx › uses the 440px desktop modal…`（摘要区样式断言）与 `adaptive-modal-swipe-dismissal.test.tsx` 三例（Drawer mock 缺 Viewport）。
- 本轮顺手修正：`positions-table-visual-contract` 对移动持仓卡的 `bg-modal` 断言改为 `bg-surface`（0ad17aea 换令牌时漏改，之前即红）。
- 用户随后要求把下单确认、反手、全部平仓的退场一并修掉：三处持有方改用 `useLingeringValue`（250 ms）保留最后一个 `pending` / `target` / `snapshot`，内容组件接收 `open={value !== null}`，值清空后先跑退场再卸载。反手与全部平仓控制器各加一条「值清空后保持挂载且 `open=false`，250 ms 后卸载」测试；8 个相关文件 59 用例通过。开发服务器逐帧采样：反手抽屉进场 100% → 0、遮罩取消退场约 200 ms 后卸载。全部平仓与下单确认未做实机采样：桌面 1300 px 视口下未找到全部平仓入口，下单确认若偏好已关闭会直接下真单，不在自主执行范围；两者与反手共用同一保留机制与单测。未实测官方终端弹窗动画。全量 Vitest（改动后第二轮，574 文件）：11 文件 / 34 用例失败，逐一在 `origin/main`（3a80b360）临时 worktree 复跑归类——`desktop-positions-panel-shell`（18，mock 缺 `useInfo`）、`global-settings-slippage-effective`（2）、`mobile-order-risk-summary-contract`、`mobile-trade-tp-sl-contract`、`referral-ui-contract`（3）、`mobile-input-zoom-contract`（2）、`adaptive-modal-swipe-dismissal`（3）、市价平仓 440px 断言均为 main 或分支既有红；`client-bootstrap-error` 单跑与 main 均通过，全量中偶发；`balances-table-visual-contract` 与 `orders-table-visual-contract` 各 1 例是 0ad17aea 换 `bg-surface` 时漏改的断言，本轮已改为期望 `bg-surface`，单跑通过。本轮改动没有引入新的失败。

## 后续与替代关系

- 补充 ADR 0014 的实施记录 `2026-09-17-market-close-submit-and-dismiss.md`，不替代。
- 后续可选：`adaptive-modal-swipe-dismissal` 基线红修复；全部平仓与下单确认的实机退场采样。
