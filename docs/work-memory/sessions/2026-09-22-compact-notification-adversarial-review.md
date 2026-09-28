<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-22-compact-notification-adversarial-review",
  "date": "2026-09-22",
  "title": "精简通知提交 4f7e046f 合规对抗审查",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "4f7e046f 历史审查发现 IOC 取消矛盾、Scale 受理语义及 P3；后续两轮修复已处理，并收窄原 Alo 示例、共享数字格式与回包证据的推断。原 341 项通过不等于缺陷已被覆盖或当前版本验证。",
  "thread": { "id": "9b4fc2e8-a227-4578-bfd1-5db0594a392e", "title": "对抗审查 4f7e046f" },
  "baseCommit": "4f7e046f",
  "commits": ["966dca1c", "75a7fb01"],
  "sources": [
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/adr/0019-global-trading-notifications.md" },
    { "path": "docs/work-memory/sessions/2026-09-22-compact-notification-implementation.md" },
    { "path": "apps/terminal/src/domain/trade/order-execution-summary.ts" },
    { "path": "apps/terminal/src/lib/trade/order-notification-copy.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-order-submit.ts" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/nodes/l1-data-schemas" }
  ],
  "supersedes": []
}
-->
# 精简通知提交 4f7e046f 合规对抗审查

状态：审查结论已验证；未修改生产代码，未实施任何修复。审查对象为分支 `codex/reviewceshi` 上的提交 `4f7e046f`（`fix(terminal): simplify order notification feedback`，41 文件，+1,787/−401），检出时工作区干净。

## 背景与范围

用户要求对该提交按项目开发文档做合规审查并出具对抗审查报告。审查依据为 `AGENTS.md` 的 Change discipline、Work memory、Documentation contract、Operation feedback contract、Mobile data presentation contract 与 Verification 章节，`agent.md` 编码约定，`.claude/rules/` 下 code-style、hyperliquid、design-tokens、style-ui-guide，以及 `docs/trading-notifications.md`、`docs/i18n-presentation.md` 和该提交自带的实施记录。

审查方法：通读全部非 `.po` 源码、测试与文档 diff；对照运行时代码（对账器 `completeReconciliation`、通知宿主时长、订单计划 `buildOrderPlan`、共享格式化器 `formatPrice` / `formatUSD`）推演边界场景；查询 Hyperliquid 官方文档确认 IOC 与订单状态语义；在本检出重跑静态检查、类型检查与聚焦回归。未运行浏览器 Playwright 套件，未执行真实交易或签名。

## 结论与依据

### 合规项（通过）

- 提交信息符合 Conventional Commit（`fix(terminal): …`，无正文）。CHANGELOG、`docs/trading-notifications.md`、工作记忆任务记录与 `INDEX.md` 在同一提交同步更新，规划记录追加「后续实施」而非改写历史，符合 Documentation contract。
- 金融运算在 `domain/trade/order-execution-summary.ts` 用 Big.js 完成，协议 `totalSz` / `avgPx` 保持十进制字符串，组件内无计算；翻译 helper 显式接收 `translate`，组件通过 `useLingui` 订阅，符合 i18n presentation 契约；旧 `OrderQueueErrorMessage` 从 reactivity 登记表移除且无生产调用残留。
- 成交摘要按 Operation feedback contract 区分「已受理」「有量价的真实成交」「仅状态的成交」与「仓位清空」；对失效证据 fail closed（回包长度不符、量大于请求、oid/cloid 不匹配、非正数均返回 `undefined`），持久化 `execution` 用 zod `refine` + `catch(undefined)` 独立忽略，不破坏 pending 锁（`pending-order-store.test.ts` 钉住）。
- 16 个新模板在 ar/en/es/fr/hi/zh 六份目录均有译文（抽查 zh、ar 的 `Bought {quantity}`、`Avg. {price}`、`Confirming — do not resubmit`）。
- 本检出验证：`pnpm exec biome check` 逐文件对提交内全部 TS/TSX 通过（`mobile-trade-view.tsx` 与两个浏览器夹具被 Biome 配置忽略，属既有配置）；`pnpm --filter @gatu/terminal typecheck` 通过；15 个测试文件 341 项通过（`order-notification-copy`、`order-execution-summary`、`order-submit-surface-reset`、`tracked-order-hook`、`pending-order-store`、`order-reconciliation`、`order-toast-placement`、`order-notification-lifecycle`、`order-notification-gate`、`i18n-hot-switch`、`i18n-reactivity-contract`、`modal-surface-contract`、`twap-reconciliation`、`order-reconciliation-error-message`、`design-token-ratchet`），耗时 12.3 秒。

### P2-1 IOC 市价单部分成交后，对账追加矛盾的「已取消」错误行

`use-order-submit.ts` 在回包 `filled.totalSz < s` 时把任务置为 `partial`，卡片显示「部分成交 0.4 / 1 HYPE」。市价单以 IOC 发送，官方 exchange endpoint 文档写明 IOC 未成交部分被取消；L1 数据 schema 示例显示带成交量的取消单最终 `status: "canceled"`。项目 `CANCELED_ORDER_STATUSES` 把 `canceled` 映射为子项 `canceled`，于是 `completeReconciliation` 走 `hasCanceled` 分支，错误置为 `accepted-orders-canceled`，渲染为「Canceled. Some orders were accepted. Review open orders before retrying.」，与正文「部分成交」并列。对单笔普通 IOC 部分成交，这是预期结果而非异常，「有部分订单被接受，请检查挂单」对用户是误导。提交前同一路径更糟（`allCanceled` → 整单显示「已取消」），本提交只修正了状态而没有处理错误行。新增的对账测试只覆盖后续状态为 `filled` 的情形，没有覆盖 `canceled`。

证据边界：本次未用真实账户下 IOC 单核对最终 `orderStatus` 字面值，结论来自官方文档与代码推演；应先以测试网真实回包确认，再决定是让对账器识别「execution 部分成交 + 全部子项 canceled/filled」为正常终态，还是在 `getErrorCopy` 里对该组合省略取消文案。

### P2-2 Scale 分层挂单的正常首笔成交被标为 `partial` 并按警告处理

`getOrderExecutionSummary` 在 Scale 下对 `mainOrderCount = orders.length` 汇总；`order-execution-summary.test.ts` 的 mixed-batch 用例明确断言「一层 `filled` + 一层 `resting`」得到 `completeness: "partial"`。Scale 订单全部为 GTC（`order-intent.ts` 固定 `tif: "Gtc"`），首层立即成交、其余层挂单是这种订单的正常形态，却被 `use-order-submit.ts` 置为 `status: "partial"`：卡片显示警告图标、文案「部分成交」、按 `TOAST_DEFAULT_DURATION_MS`（3 秒）隐藏；对账完成后 `allAccepted && partiallyFilled` 仍落入 partial 分支。语义上把「阶梯中已成交的比例」与 Operation feedback contract 里代表异常的「部分完成」混为一个状态。建议对 GTC 批次区分「部分立即成交、其余挂单」（成功态，正文可保留成交进度）与真正的部分完成；实施记录与 Reference 表格均未讨论此场景。

### P3

- **P3-1 自建价格格式化绕开共享格式化器。** `formatExecutionPrice` 手写 `$` 前缀、`prec(8)` 有效数字与 `USDC/USDT/USD` 白名单，未使用 `lib/format.ts` 的 `formatPrice`（按 `szDecimals` 推导小数位、Intl 本地化、千分位）。市场 `szDecimals` 已在提交输入中；`code-style.md`「Pass API values directly to formatters」与其余表面口径不一致，阿拉伯语等 locale 的数字呈现也与全站其它数值不同。Reference 文档已把「最多 8 位有效数字」写成规范，属于设计决定但缺乏取舍记录。
- **P3-2 `partial` 真实部分成交按 3 秒自动隐藏。** 真实成交量少于请求量的通知复用上一提交为「未确认/失败/取消」定义的 3 秒时长；用户可能在读完数量前失去这条唯一的成交证据。建议在 `docs/trading-notifications.md` 明确该时长是有意为之，或为含 `execution` 的 partial 单独定义。
- **P3-3 生命周期单测超时放宽到 30 秒。** `order-notification-lifecycle.test.tsx` 的冷加载用例上限由默认 5 秒改为 30 秒；实施记录已披露，但该文件其余用例仍依赖同一冷导入，CI 慢机上的连锁失败风险只是被推迟。
- **P3-4 任务记录 `commits` 为空。** 实施记录以 `18365269` 为基线、`commits: []`，实现提交 `4f7e046f` 未回填；`AGENTS.md` 要求在完成前更新任务记录。可在后续提交补记。
- **P3-5 正文 `role="status"` 加 `tabIndex={0}`。** 为可滚动正文提供键盘可达性合理，但把实时播报区域本身变成 Tab 停靠点会让屏幕阅读器用户在每条通知上多停一次；更常见的做法是给滚动容器单独 `region` + 可访问名称。Biome a11y 规则未报错，属体验建议。

### 未发现问题的对抗点

- 普通单附带 TP/SL：`mainOrderCount = 1`，反向触发单不并入主单；`statuses.length !== orders.length` 直接放弃摘要。
- 错误回包（`isApiOrderResponseError`）同样触发 `onResponse`，但 `status !== "ok"` 返回 `undefined`，不会写入伪成交。
- 展示 helper 对 `execution` 再次调用 `isValidOrderExecutionSummary`，持久化恢复后的损坏字段不会显示。
- `quoteToken` 缺失时省略均价，不猜测计价单位。
- `getErrorCopy` 去重仅针对与正文/计数完全重复的字符串，原始交易所错误全文保留。

## 验证与限制

- 本地验证基于 `4f7e046f` 的干净检出：Biome（逐文件）、`typecheck`、上述 15 套 341 项回归全部通过；未运行 `pnpm --filter @gatu/terminal test` 全量与 Playwright `notifications.playwright.config.ts`，实施记录中「6,946 项 / 浏览器 17 项」为原作者声明，本次未复核其 `.worklog` 日志内容。
- P2-1 依赖 Hyperliquid 对 IOC 部分成交最终状态的官方文档表述与代码映射推演，未用真实回包核对；P2-2 由现有单测断言与代码路径直接推出。
- 未执行真实交易、签名、生产构建、发布或推送。

## 后续与替代关系

2026-09-22 后续复核已启动，见[审查修复任务](2026-09-22-notification-review-remediation.md)。两项依据需收窄：本报告引用的 L1 取消示例实际为 `Alo`，不能充当 IOC 真实回包证据；普通单笔 IOC 有效部分成交 HTTP 回包会完成并删除 pending，对账问题限于仍需对账或恢复的记录。P3-1 的共享数字格式由用户数字预设控制，阿拉伯语并不自动切换数字系统；加权均价也不能机械套用委托价格 tick。原始审查推演保留，最终修复和验证以新任务记录为准。

本记录只报告问题，不替代 `docs/trading-notifications.md` 与 [实施记录](2026-09-22-compact-notification-implementation.md)。若修复 P2-1/P2-2，需同步更新 Reference 的证据表格、`order-reconciliation.test.tsx` 与 `order-execution-summary.test.ts`，并在 CHANGELOG 记录语义变更。

## 周整理补注（2026-09-28）

后续首先修复 75a7fb01，再纠正实际市价 FrontendMarket 路径；保留本报告被后续收窄的证据归因，不再将两项 P2 笼统标为待实施。

后续来源：[2026-09-22-notification-review-remediation](2026-09-22-notification-review-remediation.md)；[2026-09-22-notification-remediation-followup](2026-09-22-notification-remediation-followup.md)。

本条为事后整理；本轮仅核对 Git、现行文档和相关实现入口，原验证结果仍归属来源任务，未重跑业务测试。详见 [本周整理](2026-09-28-weekly-memory-review.md)。
