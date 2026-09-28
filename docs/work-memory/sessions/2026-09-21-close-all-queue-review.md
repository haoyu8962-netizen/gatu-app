<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-close-all-queue-review",
  "date": "2026-09-21",
  "title": "全部平仓提交后的队列与官方通知实践复审",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "全部平仓有内部阶段、持久订单跟踪与对账，但未接入可见 Order Queue，等待无即时反馈，3 秒通知短于 2 分钟核对窗口。官方公开实现使用 errorsOnly 加汇总通知，同样没有持续进度队列；本轮仅审查及建议，69 项定向测试通过，未真实交易。",
  "thread": { "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507", "title": "启动开发服务器" },
  "baseCommit": "8770d86de2fbf71d4a13318933369ca67c501619",
  "commits": ["639239c9", "efe8389e"],
  "sources": [
    { "path": "docs/mobile-close-all-plan.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "apps/terminal/src/components/trade/positions/position-close-all-modal.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-position-close-all-submit.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-tracked-order.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "apps/terminal/src/stores/use-order-queue-store.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/order-toast.tsx" },
    { "url": "https://app.hyperliquid.xyz/trade/HYPE" },
    { "url": "https://app.hyperliquid.xyz/assets/config-DWLPMyx3.js" },
    { "url": "https://app.hyperliquid.xyz/assets/index-58uVNh8f.js" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions" }
  ],
  "supersedes": []
}
-->
# 全部平仓提交后的队列与官方通知实践复审

## 背景与范围

用户要求继续核对当前项目点击全部平仓后的队列状态，并对照官方 Hyperliquid 终端。同步审查记录；起始分支 `codex/reviewceshi`，HEAD `8770d86d`，工作区和暂存区干净。本轮只核对并记录现状与改进建议，没有实施新的交易界面或提交逻辑。任务标识沿用已核对的本任务标识，不重建原始会话。

## 结论与依据

- 全部平仓确认控制器只在 `await submission.submit()` 返回后发 Sonner 通知；没有预先创建 loading 通知或队列项。内部阶段与 `useTrackedOrder` 的 pending 记录存在，但不传 `queueId`，不会出现普通下单使用的 `OrderToast`。
- 后台 `OrderReconciliation` 仍通过 cloid 关联 WebSocket 和 REST 状态。待确认通知默认 3 秒，对账窗口为 2 分钟；结束时另发通用通知。应补足立即反馈、持续可见性以及批次/子订单结果关联，不能误报为没有任何对账保护。
- 官方当前公开脚本 `config-DWLPMyx3.js` 的 `s2` 先关闭确认面，以 `errorsOnly` 调用 `i7`。普通下单 loading 只在 `all` 模式创建；批次按最多 50 单分块、顺序发送、遍历逐项结果，错误通知与外层汇总通知可并存。这不构成全部成交或仓位归零证明。
- 官方通知封装成功/错误为 6 秒；`index-58uVNh8f.js` 的 Toaster 按移动/平板左上、桌面右下放置。只静态核对代码，没有以真实提交观察这些通知。
- API 文档的逐项结果及 `orderUpdates` 支持应用自己维护任务状态，不等于交易所提供一个前端「全部平仓队列」字段。当前订单参数与 SDK 接口没有修改。
- [当前专题文档](../../mobile-close-all-plan.md)新增现状、官方证据、改进建议与验收条件。建议批次卡片加逐仓结果，保持静态按钮/立即退场，不自动重发；备选持久单条通知较简单，但无法完整呈现多市场部分结果。建议尚未实施。

## 验证与限制

- 本次在未改动交易代码的 `8770d86d` 上运行：`pnpm --dir apps/terminal exec vitest run src/lib/tests/position-close-all-submit.test.tsx src/lib/tests/position-close-all-modal.test.tsx src/lib/tests/tracked-order-hook.test.tsx src/lib/tests/order-reconciliation.test.tsx`。**4 文件、69 项通过**，用时 3.10 秒；分项为 10、14、23、22 项。它们验证既有提交/退场/跟踪/对账，不证明尚未接入的可见队列已经完成。
- 浏览器读取用户已打开的官方页面，通过「全部关闭」打开确认面，核对默认市价和中间价限价选项后关闭。Playwright role 定位未匹配，改用可访问节点成功；Escape 未关闭，点击右上角关闭后确认节点消失。没有最终确认、签名、下单、撤单或账户配置变更。
- 从当前页资源清单定位公开脚本后读取，文件只保存在 Git 忽略的 `.worklog/close-all-queue-review-2026-09-21/`。没有保存登录态、邮箱、地址、实际仓位数据或截图。公开脚本经压缩，结论仅绑定本次资源版本；未来部署需重新核对。
- 本轮未运行全量应用测试、构建、typecheck 或新的浏览器夹具；只修改文档。既有全部平仓浏览器夹具没有挂载 `OrderToast` 与 `OrderReconciliation`，它的既有通过记录不能用于证明完整通知队列行为。
- `pnpm memory:index`、`pnpm memory:check` 通过，`pnpm memory:test` **8 项通过**；两份修改文档的本地 Markdown 链接目标检查及 `git diff --check` 通过。验证范围为文档与既有交易逻辑的定向回归，不表示发布或真实成交验收。

## 后续与替代关系

本记录补充[移动入口实施](2026-09-21-mobile-close-all-implementation.md)和[确认后退场](2026-09-21-close-all-submit-and-dismiss.md)的反馈边界，不替代其已完成的入口或生命周期修复。队列接入属于后续任务；继续时先读专题文档的「提交后的状态反馈」及队列、pending 记录、全局对账实现。真实成交、测试网执行和真机验收均未进行。

同日后续补充：用户自行操作官方主网页面时，[反馈监听记录](2026-09-21-official-trade-feedback-observation.md)捕获了全部平仓汇总通知，补足上文初次复审时缺少实际通知过程的证据。上文「未真实交易」描述初次复审的范围；后续监听没有由代理执行交易，也没有验证逐笔成交或全部仓位归零。保留本记录的原始验证边界，不将后续观察追记为初次测试结果。
