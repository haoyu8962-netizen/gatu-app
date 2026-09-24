<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-22-notification-remediation-followup",
  "date": "2026-09-22",
  "title": "市价通知 FrontendMarket 余量取消后续修复",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "核对官方协议及锁定 SDK，补齐 FrontendMarket 部分成交证据与限定关联 TP/SL 的普通取消语义，并处理数字格式契约、区域命名和 Scale 冗余分支；全量终端与 19 项通知浏览器回归通过，未执行真实交易或发布。",
  "thread": null,
  "baseCommit": "46f50c64",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-09-22-notification-remediation-adversarial-review.md" },
    { "path": "docs/trading-notifications.md" },
    { "path": "apps/terminal/src/domain/trade/order-execution-summary.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-order-submit.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "apps/terminal/package.json" },
    { "path": "docs/hyperliquid-sdk-reference.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl" },
    { "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods/order" }
  ],
  "supersedes": []
}
-->
# 市价通知 FrontendMarket 余量取消后续修复

## 背景与范围

用户要求先规划、核对官方开发文档与 SDK，再修复对 `75a7fb01` 的二次审查发现。基线 `46f50c64`，开始时工作区干净。本记录属于新授权的侧对话任务；未取得可核对的侧对话标识，`thread` 留空，不沿用父任务 ID。范围为 P1 与四项 P3 的通知语义、可访问性和回归契约，不改交易参数或执行守卫。

## 结论与依据

核对：官方 exchange 文档规定 IOC 未成交余量取消；info 文档的市价订单示例使用 `FrontendMarket`；维护中的 nktkas order 文档及本仓库锁定 `@nktkas/hyperliquid@0.33.3` 的 order 声明均将它定义为带市价标识的 IOC。项目实际 `buildFrontendMarketOrder` 生成该值，因此 P1 成立。官方 TP/SL 文档区分父单普通取消与保证金不足取消，前者可使附属单一起取消，后者的保护单处置不同。此证据支持限定普通取消的语义修正，不证明任何真实账户回包。

实施方案与验收标准：

1. `partialIoc` 识别实际 `Ioc` / `FrontendMarket`，仍要求校验后的部分成交量价、oid、cloid。通过真实市价 builder 和提交计划测试断言证据，避免仅手写 TIF 的假覆盖。
2. 为真实 `normalTpsl` 分组中同资产、反方向、reduce-only 的 TP/SL 保存附属 cloid。仅当有证据的主单普通 canceled 时，豁免该主单及已绑定子单的普通取消错误，逐项取消结果继续显示。拒绝、其他取消、未知、缺证据和无关订单不豁免。新增可选字段损坏只能丢弃自身，不得丢失执行事实或 pending 锁。
3. 让数字格式契约实际检查无直接 formatter import 的 helper owner；正文溢出区域使用独立的本地化名称；删除无生产来源的 Scale partial 子项放行分支，正常 Scale 的成交进度仍与受理结果分开。
4. 更新 Reference、CHANGELOG 和历史更正；验证覆盖摘要、真实提交计划、持久化、恢复对账、UI、数字偏好、类型与静态检查。保持用户已决定的三秒时长。

未采用仅按 `orderType: market`、任意同批取消或所有 `*Canceled` 推断正常结果的方案，原因是这些信息不能证明即时成交语义和父子关系。保留现有恢复兼容性，旧记录无附属绑定时按原保守结果呈现。

## 验证与限制

基线为 `46f50c64`，工作区初始干净；本记录和实现随当前任务提交。实际验证如下：

- `pnpm --dir apps/terminal exec vitest run src/lib/tests/order-execution-summary.test.ts src/lib/tests/order-submit-surface-reset.test.tsx src/lib/tests/order-reconciliation.test.tsx src/lib/tests/pending-order-store.test.ts src/lib/tests/tracked-order-hook.test.tsx src/lib/tests/order-toast-placement.test.tsx src/lib/tests/number-format-reactivity-contract.test.ts`：7 个文件、156 项通过。
- `pnpm --filter @gatu/terminal typecheck`：通过；`pnpm exec biome check` 覆盖 9 个变更 TypeScript/TSX 文件：通过。
- `pnpm i18n:extract`、`pnpm i18n:compile`：通过；新增 `Notification details` 已补齐 en、zh、es、fr、hi、ar 文案。
- `pnpm --filter @gatu/terminal test`：601 个测试文件通过、1 个显式 WebSocket soak 跳过；6,973 项通过、1 项跳过。
- `pnpm --dir apps/terminal exec playwright test --config tests/browser/notifications.playwright.config.ts`：19/19 通过，覆盖桌面/移动、双主题、Sonner 生命周期、数字格式热切换和滚动区域。
- `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test` 与 `git diff --check`：通过。

官方 exchange 文档确认 IOC 余量取消；info endpoint 的 `orderStatus` 示例确认市价订单使用 `FrontendMarket`；nktkas order API 文档及锁定 `@nktkas/hyperliquid@0.33.3` 声明确认该 TIF 与 IOC 相似并标记为市价。TP/SL 文档确认部分成交父单被普通取消时子单会一起取消，而保证金不足取消是不同分支。文档和 SDK 均为协议依据，不是本地真实回包。

本任务未执行真实主网交易、签名、生产构建、设备屏幕阅读器验收、部署或推送；合成回包测试不能证明真实资金结果。新增 `partialIoc` 附属 cloid 只来自已跟踪的 `normalTpsl` 计划，旧持久记录无此字段时继续保守报告取消。

## 后续与替代关系

保留两轮审查和前次修复记录；本任务仅局部替代市价余量取消、已绑定附属取消及 P3 处置结论。`commits` 留空以避免任务记录自引用循环，实际实现提交由 Git 历史解析；新增记录不代表发布。
