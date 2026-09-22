<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-22-notification-remediation-adversarial-review",
  "date": "2026-09-22",
  "title": "通知修复提交 75a7fb01 合规对抗审查",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "对 75a7fb01 复审：Scale 受理语义、均价共享格式、按需焦点停靠点与测试冷导入修复成立并通过本检出 430 项聚焦回归；1 项 P1：IOC 余量取消识别只匹配 tif Ioc，而市价单实际发送 FrontendMarket，主场景修复未生效且文档声明不符；另 4 项 P3。仅审查与记录，未修改生产代码。",
  "thread": { "id": "9b4fc2e8-a227-4578-bfd1-5db0594a392e", "title": "对抗审查 4f7e046f" },
  "baseCommit": "75a7fb01",
  "commits": [],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-09-22-notification-review-remediation.md" },
    { "path": "docs/work-memory/sessions/2026-09-22-compact-notification-adversarial-review.md" },
    { "path": "docs/trading-notifications.md" },
    { "path": "apps/terminal/src/domain/trade/order-execution-summary.ts" },
    { "path": "apps/terminal/src/domain/trade/orders.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/order-toast.tsx" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl" }
  ],
  "supersedes": []
}
-->
# 通知修复提交 75a7fb01 合规对抗审查

状态：审查结论已验证；未修改生产代码。审查对象为分支 `codex/reviewceshi` 上的提交 `75a7fb01`（`fix(terminal): correct order notification result semantics`，22 文件，+726/−69），它回应了[上一轮审查](2026-09-22-compact-notification-adversarial-review.md)的 2 项 P2 与 5 项 P3。检出时工作区干净。

## 背景与范围

用户要求继续对抗审查，判断该修复提交是否存在不规范行为。审查依据与上一轮相同（`AGENTS.md` 各契约、`agent.md`、`.claude/rules/`、`docs/trading-notifications.md`），另加[修复任务记录](2026-09-22-notification-review-remediation.md)中的声明逐条对照实现。方法：通读源码、测试、文档 diff；追踪市价单实际发送的 `tif`；查官方 info endpoint 文档中市价单的 `tif` 字段；在本检出重跑静态检查、类型检查、聚焦回归及数字格式 reactivity 契约。未运行 Playwright 套件，未执行真实交易或签名。

## 结论与依据

### 合规项（通过）

- 提交信息合规；CHANGELOG、Reference、两份历史记录以追加更正方式更新，新增修复记录并回填 `4f7e046f`，符合 Documentation contract 的「追加更正、不改写历史」。
- **P2-2（Scale）修复成立。** `use-order-submit.ts` 对 Scale 不再以 `execution.completeness` 决定 `partial`；对账器以 `acceptedScale` 区分受理与成交进度，`confirmationMode: filled` 与拒绝/取消/未知子项不放宽；`order-reconciliation.test.tsx` 五组场景与 `order-submit-surface-reset.test.tsx` 覆盖。
- **P3-1（均价格式）修复成立。** 改用共享 `formatPrice` / `formatToken`，禁用压缩，保留 8 位有效数字；`OrderToast` 调用 `useNumberFormatRevision` 订阅热更新；单测覆盖 en-US/de-DE/fr-FR 分隔符和语言与数字预设独立。
- **P3-3 / P3-4 / P3-5 处置合理。** 冷导入在 collection 阶段完成、移除 30 秒特例；补记实现 SHA；正文与子项仅在实际溢出时获得 `tabIndex` 与名称，`role="status"` 不再无条件可聚焦，jsdom 与 Playwright 均有断言。
- **P3-2 保留 3 秒**属用户决定并已写入 Reference，不再计为缺陷。
- 本检出验证：`pnpm --filter @gatu/terminal typecheck` 通过；Biome 逐文件通过（`notifications.fixture.tsx`、`notifications.pw.ts` 被配置排除，与修复记录说明一致）；17 个测试文件 430 项通过（上一轮 15 套加 `position-market-close-submit`、`position-close-all-modal`）；`number-format-reactivity-contract` 4 项通过。

### P1 IOC 余量取消识别只匹配 `tif: "Ioc"`，市价单实际发送 `FrontendMarket`

`getOrderExecutionSummary` 仅在 `order.t.limit.tif === "Ioc"` 时记录 `partialIoc`。但项目市价单由 `domain/trade/orders.ts` 的 `buildFrontendMarketOrder` 生成，`t: { limit: { tif: "FrontendMarket" } }`；官方 info endpoint 文档的 `orderStatus` 示例也显示 `orderType: "Market"` 对应 `tif: "FrontendMarket"`。因此上一轮 P2-1 的主场景（市价单部分成交、余量取消）在本提交中从未产生 `partialIoc`，恢复对账仍走 `hasCanceled` → `accepted-orders-canceled`，误导性错误行原样保留。只有用户在限价单手动选 IOC 才会受益。

测试没有暴露这一点：`order-reconciliation.test.tsx` 的 IOC 用例以 `feedback.orderType: "market"` 命名，却手工构造 `partialIoc`；`order-execution-summary.test.ts` 与 `tracked-order-hook.test.tsx` 都用手写 `tif: "Ioc"` 的订单；`order-submit-surface-reset.test.tsx` 的「partial market execution」用例经过真实 `buildOrderPlan`，但只断言 `completeness: "partial"`，未断言 `partialIoc`。补一条 `expect(execution.partialIoc).toBeDefined()` 即可复现失败。

同时，修复记录与 `docs/trading-notifications.md` 均声明「有匹配 cloid 的单主单 IOC 部分成交证据…保留部分成交，不追加整单取消错误」，与实现对市价单的实际行为不符，违反 Documentation contract「区分已实现行为与提案」。建议：把 `FrontendMarket` 视为 IOC 语义（官方定义市价单即立即成交余量取消），并让市价路径的 submit 测试断言 `partialIoc`。

### P3

- **P3-6 IOC 附带 TP/SL 的正常结局被归为异常。** 官方 TP/SL 文档写明父单未完全成交而取消时子单一并取消。市价单部分成交 + 附带 TP/SL 的正常结局是「主单 canceled、子单 canceled」，而 `keeps abnormal IOC batch outcomes` 用例把它钉为 `accepted-orders-canceled` 错误。Reference 把「隐藏附属委托取消」列为禁止项，这是有意的保守选择，但应说明该组合在 IOC 下是常态，或对 `partialIoc` 主单的同批 TP/SL 普通 `canceled` 单独给出中性文案。
- **P3-7 数字格式 reactivity 契约存在盲区。** 该契约只扫描直接导入格式化器的组件；`order-toast.tsx` 通过 `order-notification-copy.ts` 间接格式化，契约无法强制它订阅，本次是作者手工加入 `useNumberFormatRevision`。建议在契约中登记间接调用 helper 的所有者（现有 `RENDER_HELPER_OWNERS` 机制）。
- **P3-8 嵌套重名 region。** 正文溢出时 `<section aria-label={copy.label}>` 与外层 `data-order-feedback` 的 `section aria-label` 同名（普通单均为「Order」），屏幕阅读器会听到同名嵌套区域。可改用「Details」类区分名称。
- **P3-9 `acceptedScale` 的 `partial` 子项分支缺少生产来源。** `getSubmissionQueueChildren` 只在 `mainOrderCount === 1` 的 IOC 路径产出 `partial` 子项，Scale 子项不会出现 `partial`；`allAccepted` 中为 Scale 放行 `partial` 的分支目前只有测试构造能到达，属防御性冗余，需在注释或文档说明来源，否则后续维护者难以判断其必要性。

### 未发现问题的对抗点

- `marginCanceled` 等异常取消不走 `partialIoc` 分支（只匹配字面 `canceled`），损坏的 `partialIoc` 由 zod `catch` + `transform` 独立剥离且不影响其余成交摘要。
- `useScrollableRegion` 用 `ResizeObserver` 同时观察容器与首个子元素，`ResizeObserver` 缺失时降级为单次测量；`enabled` 切换时正确重绑与断开。
- 数字预设切换不重建任务与 DOM 节点（`order-toast-placement.test.tsx` 与浏览器用例均断言同一元素与同一任务）。

## 验证与限制

- 本地验证基于 `75a7fb01` 干净检出：typecheck、Biome、17 套 430 项、数字格式契约 4 项全部通过。未运行全量单测与 Playwright；修复记录中「6,972 项 / 19 项浏览器」为原作者声明，未复核 `.worklog`。
- P1 依据是 `orders.ts` 源码与官方 info endpoint 文档，未用真实市价单回包复核最终 `orderStatus` 字面值；P3-6 依据官方 TP/SL 文档表述。
- 未执行真实交易、签名、生产构建、发布或推送。

## 后续与替代关系

本记录不替代修复记录与 Reference；已在[修复任务记录](2026-09-22-notification-review-remediation.md)末尾追加指向本记录的更正。若修复 P1，需同步 `order-execution-summary.ts`、市价路径 submit 测试、`docs/trading-notifications.md` 的证据表格与 CHANGELOG。
