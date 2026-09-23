<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-23-codex-legal-notification-review-fixes",
  "date": "2026-09-23",
  "title": "codex/reviewceshi 六提交审查与修复",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "order-entry"],
  "summary": "审查 e52739d2..b82dd443：b82dd443 把持仓弹窗宿主移入 legal gate 并永久清理弹窗（确认面契约测试失败），e52739d2 留下类型检查错误；已恢复页面层宿主、去掉清理与可见检查提示（对齐官方终端），按官方 TP/SL 文档给带 TP/SL 的部分成交加规则说明，并按实际 20px 行高和 8px 行距把选项点击区收成互不重叠的 28px（同时修复控件自带 44px 点击层抢点下一行的已有缺陷）；未做真实钱包或设备验收。",
  "thread": null,
  "baseCommit": "b82dd443",
  "commits": ["85525d49", "9fb13653", "ab060288"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/components/global-modals.tsx" },
    { "path": "apps/terminal/src/lib/tests/position-dialog-session-ownership.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/global-modals-hip3-disclaimer.test.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-legal-gate.ts" },
    { "path": "packages/hl-react/src/internal/exchange/legal-execution.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "apps/terminal/src/lib/trade/order-notification-copy.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/trade-option-checkboxes-view.tsx" },
    { "path": "apps/terminal/tests/browser/desktop-order-entry-layout.pw.ts" },
    { "path": "docs/trading-onboarding.md" },
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/order-entry-layout-audit.md" },
    { "path": "docs/mobile-data-presentation.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl" },
    { "url": "https://app.hyperliquid.xyz/trade" }
  ],
  "supersedes": []
}
-->
# codex/reviewceshi 六提交审查与修复

## 背景与范围

用户要求审查 codex 工作区（主检出，分支 `codex/reviewceshi`，未推送）最近的提交，然后规划并直接修复发现的问题。审查范围是 2026-09-22 的六个尚无审查记录的提交：`e52739d2`、`38ba950b`、`f000fa0a`、`086c9023`、`3c8a7432`、`b82dd443`。更早的提交已有各自的对抗审查记录，本次没有重审。基线 `b82dd443`，开始时工作区干净。本记录由 Claude Code 会话同步写成，未取得可核对的会话标识，`thread` 留空。

## 结论与依据

审查发现（按严重度）：

1. `b82dd443`（P1）：`PositionDialogHostGate` 只在 legal 状态为 `inactive`/`accepted` 时挂载。`useLegalGate` 在 wagmi 重连（`isReconnecting` → `checking`）或后台刷新失败（`isError` → `error`，`useLegalStatus` 开启了 `refetchOnWindowFocus`）时都会离开 `accepted`，承载进行中的全部平仓、反手、限价平仓、TP/SL、逐仓保证金提交的宿主就会被卸载。这违反 AGENTS.md 确认面契约，`position-dialog-session-ownership.test.tsx` 的 "mounts the owners from the global modal host, outside every tab panel" 在该提交上失败。新增的 effect 还会在上述短暂状态下用 `clearGlobalModal()` 永久清空资金/交易弹窗，与 `docs/mobile-data-presentation.md`「刷新或重连时保持已打开的操作弹窗」相冲突。
2. `b82dd443`（P2）：`LegalStatusNotice` 在下单区渲染可见的「正在验证交易权限」和转圈，属于被动数据获取的可见加载文案；而 `checking` 包含认证尚未就绪的阶段，会影响每个访客的首屏，还会推动表单布局。
3. `e52739d2`（P2，修复时发现）：`order-reconciliation.tsx` 把可能为 `undefined` 的 `child.status` 传给 `isCanceledOrderStatus`，`pnpm --filter @gatu/terminal typecheck` 在 HEAD 上失败。运行时因为 `Set.has(undefined)` 返回 false，所以无害。该提交的任务记录写着类型检查通过，与本次实测不符。
4. `e52739d2`（产品风险）：语义修正本身与官方 TP/SL 文档一致（部分成交后普通取消会连同附带 TP/SL 一并取消）。但用户在部分成交后从来没有被告知 TP/SL 可能不在，常见的同步 HTTP 路径在修改前也没有这类提示。
5. `086c9023` 等三项（P3）：移动端选项行从 32px 降到 20px，`max-[1000px]:gap-y-2` 与基础 `gap-y-2` 重复。

用户决定与实施：

- 弹窗清理：用户选择去掉清理、恢复原行为。`global-modals.tsx` 回到 `3c8a7432` 的内容（逐字节相同），宿主重新挂在页面层，删除 `clearGlobalModal`。所有 Exchange 写入仍由 `useExchange` 调用 `verifyLegalActionAllowed` 在执行时复核 legal 状态，因此宿主常驻不会绕过门控。
- 检查提示：用户问「最佳实践是什么？对齐 hype？」。2026-09-23 在内置浏览器只读取官方终端公开资源（未登录、未签名）：官方的 `legalCheck` 挂起时对应交易者状态 `acceptTermsLoading`，下单按钮包装器照常渲染原按钮，资金类入口（充值、发送、划转、兑换、还款）以静态文案禁用，没有横幅，也没有可见的验证提示（`Loading...` 只作为 IP 检查按钮的 tooltip）。据此删除 `LegalStatusNotice`，与官方一致，也符合移动端数据展示契约。
- TP/SL：用户选择「按官方文档走」。官方前端的英文文案里只有 `Partially Filled`，没有 TP/SL 说明。按官方文档规则，对携带 TP/SL（`tpPrice`/`slPrice`）且执行摘要为部分成交的市价或限价单，追加一句中性规则说明：附带 TP/SL 只在完全成交后下达，保护已成交部分需在持仓上设置。提示不推断某一笔附属单的状态，因为保证金不足取消的分支在提交时无法区分。时长沿用部分成交的 3 秒。
- 选项行：用户要求「按照实际高度情况来处理」。视觉保持实际的 20px 行高和 8px 行距；标签加 `isolate` 和位于内容下方的 `::after`，上下各扩 4px（正好是行距的一半），相邻两行在间隙中点相接。第一版把 `::after` 画在复选框控件上面，Playwright 报标签拦截了对控件的点击（7 项失败），改为 `after:-z-10` 后修复。
- 验证中发现的已有缺陷：`@gatu/ui` 复选框控件自带 44px 的 `::after` 点击层（`after:size-11`）。原来的 32px 行加 12px 行距正好是 44px 间距，所以不重叠；`086c9023`/`f000fa0a` 把间距改成 28px 后，下一行控件的 44px 层会盖住上一行复选框的下边缘和其下方间隙。Chromium `elementFromPoint` 实测，「control bottom」「control below」两个探测点命中了下一行的控件，也就是点 Reduce Only 下边缘会切换 TP/SL。按仓库已有做法（TWAP 移动端选项的 `after:size-6`），把选项控件的点击层高度收到行距 28px（`after:h-7`），宽度保留 44px。测试现在逐行探测控件中心、上下边缘和上下间隙，并断言标签扩展 8px、控件点击层 28px、行距 28px。

## 验证与限制

实际运行（本地，2026-09-23）：

- `85525d49`：6 个相关单测文件 230 项通过（global-modals、position-dialog-session-ownership、legal-gate、i18n-reactivity-contract、mobile-data-presentation-contract、trading-onboarding-gate）；Biome 通过。此时类型检查失败，原因是上面第 3 项已存在的错误，由下一提交修复。
- `9fb13653`：order-notification-copy、order-toast-placement、order-reconciliation、两份 reactivity contract 和 i18n-hot-switch 共 6 个文件 232 项通过；`pnpm --filter @gatu/terminal typecheck` 通过；`pnpm i18n:extract`/`compile` 通过，新文案补齐 zh、es、fr、hi、ar 五种语言。
- 选项点击区：trade-form-compact-fields、trade-form-tp-sl、trade-form-twap-advanced、design-token-ratchet、i18n-reactivity-contract、order-entry 共 197 项通过。`mobile-trade-all-orders.playwright.config.ts`（含 desktop-order-entry-layout、mobile-trade-all-orders、reduce-only）：只有标签扩展、未加控件上限的版本 46/46 通过；加严后的几何测试在未加控件上限时失败（上一行的 control bottom/control below 命中下一行），加 `after:h-7` 后该测试在 1400px 与 375px 通过，整个配置重跑 46/46 通过。
- 在 `ab060288` 上：`notifications.playwright.config.ts` 19/19 通过；`pnpm --filter @gatu/terminal test` 通过 601 个测试文件（1 个跳过），6,985 项通过（1 项跳过）。

未执行：真实钱包签名、真实成交（部分成交文案只用合成执行摘要验证）、真实设备触控与屏幕阅读器验收、生产构建、推送或发布。触控结论来自 Chromium 的 `elementFromPoint` 几何探测，不是物理输入。

## 后续与替代关系

- 本记录局部替代 `b82dd443` 在 `docs/trading-onboarding.md` 与 CHANGELOG 中的描述（宿主藏在 legal gate 后、清空弹窗、可见检查提示），`3c8a7432` 的偏好弹窗放行保留。
- 之前就存在、本次未改：legal 状态从 `accepted` 切到 `checking`/`error` 时，`SharedGlobalModals` 分支切换或卸载会调用 `discardPositionMarketCloseModal()`，对进行中的市价平仓会话强制置为 `reconciling` 并关闭。`3c8a7432` 之前的 `return null` 分支也有同样行为，需要单独评估市价平仓提交的承载者是否也应挪到页面层。
- codex 的 `2026-09-22-notification-remediation-followup` 记录中「类型检查通过」一句与本次实测不符，应以本记录为准。
- 同类点击区重叠可能也存在于桌面 TWAP 选项（Randomize timing / Reduce Only 行与 Advanced Settings 行同样是 28px 间距，而控件点击层只在移动端收窄），尚未验证。上一条的市价平仓问题和这一条都已拆成独立后续任务，本次没有修改。
