<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-22-notification-result-timeout",
  "date": "2026-09-22",
  "title": "结果通知三秒自动隐藏",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "未确认、部分成交、失败和取消通知已改为前台显示三秒，保留后台对账及重复提交保护；77项聚焦回归、类型与规范检查通过。",
  "thread": {
    "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507",
    "title": "启动开发服务器"
  },
  "baseCommit": "a379d231f2a5bddf2bc602d0545aed8e14630581",
  "commits": [],
  "sources": [
    { "path": "docs/trading-notifications.md" },
    { "path": "apps/terminal/src/components/trade/order-notification-host.tsx" },
    { "path": "apps/terminal/src/lib/tests/order-toast-placement.test.tsx" }
  ],
  "supersedes": []
}
-->
# 结果通知三秒自动隐藏

## 背景与范围

用户在讨论未确认、部分成交等通知时长后要求「也请修改到3秒」。同步记录本任务；开始时分支 `codex/reviewceshi`，工作区干净。仅调整 OrderQueue 的 unconfirmed、partial、failed、canceled 展示时长；pending/confirming 继续常驻，成功默认五秒与推荐成功十秒不变，资金专用通知沿用原时长。

## 结论与依据

- 复用全局默认三秒常量。结果只在 Sonner 最前台计时，未展示的任务不能提前消失；不新建 React 定时器或第二个通知容器。
- 自动关闭和手动关闭共用 guarded dismiss。未确认结果软隐藏并保留任务、pending 事实及业务锁，防止原状态同步让提示反复出现；新状态可以重新显示并清除过时错误。
- 不采用定时直接删除未确认任务的方案，因为这会丢失 dismissed 标记并可能在下一次对账时恢复相同提示。保留展示实例身份检查，旧账户或旧状态的回调不能关闭新展示。
- 验证三秒边界、进度常驻、堆叠前台计时、未确认自动隐藏后迟到成功、身份切换与既有对账回归。

## 验证与限制

验证版本：上述基线加本任务修改，最终提交由 Git 历史关联。2026-09-22（Asia/Shanghai）实际执行：

- `pnpm --dir apps/terminal exec vitest run src/lib/tests/order-toast-placement.test.tsx src/lib/tests/order-notification-gate.test.tsx src/lib/tests/order-reconciliation.test.tsx src/lib/tests/twap-reconciliation.test.tsx src/lib/tests/toaster-config.test.tsx`：5 文件、77 项通过（5.90 秒）。真实 Sonner + store 验证 2999/3000ms 边界、进度常驻、前台计时、未知软隐藏与迟到成功；对账与延迟挂载回归保持通过。
- 初轮 73 通过、4 失败：测试从初始任务发布而非 Sonner 前台有限时长生效时开始计时，遗漏嵌套零延迟定时器在 fake timers 中的下一毫秒。再做零时间 flush 未解决；全局推进一毫秒又使已有任务的状态更新边界提早一毫秒（75 通过、2 失败）。最终只在初始结果挂载测试等待这一个发布时隙，保留准确 2999/3000ms 断言，未修改生产时长或放宽断言。
- `pnpm --filter @gatu/terminal typecheck`：通过。
- `pnpm exec biome check apps/terminal/src/components/trade/order-notification-host.tsx apps/terminal/src/lib/tests/order-toast-placement.test.tsx`：2 文件通过。
- `git diff --check`：通过。本次修改文档的 69 个本地链接目标有效。
- `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`：通过，8 项测试通过。首次 `memory:index` 因章节名不符合模板而失败，恢复要求的「结论与依据」标题后通过。

最终测试日志在本机 `/tmp/gatu-notification-timeout-tests-verified.log`，类型检查日志为 `/tmp/gatu-notification-timeout-typecheck.log`，不承诺临时文件永久存在。未运行全量终端测试、生产构建或新的浏览器/真实设备检查；本次仅改变计时与关闭回调，布局不变，不以历史全量/构建结果冒充当前版本验证。未执行真实交易、签名、推送或发布。

## 后续与替代关系

仅替代 2026-09-21 全局通知任务及 ADR 0019 中「未确认/部分/失败/取消常驻」的时长决定，其余架构与历史验证保留。当前规范由 `docs/trading-notifications.md` 维护。
