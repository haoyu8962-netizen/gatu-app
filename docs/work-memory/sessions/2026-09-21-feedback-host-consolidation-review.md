<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-feedback-host-consolidation-review",
  "date": "2026-09-21",
  "title": "官方通知宿主数量核对与项目统一建议",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "官方当前交易页有一个 toaster；普通订单以同 ID 更新 loading/结果，全部平仓以 errorsOnly 后汇总调用同一通知入口。建议 gatu 保留交易状态与对账，用一个 Sonner 宿主管理普通及任务内容；多宿主不是天然错误，但当前两套同区浮层没有必要。仅文档建议，未实施。",
  "thread": { "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507", "title": "启动开发服务器" },
  "baseCommit": "eeec5c67b32fda7f98cb5fde02efd027f9ee598f",
  "commits": [],
  "sources": [
    { "path": "docs/trading-feedback-review.md" },
    { "path": "docs/work-memory/sessions/2026-09-21-trading-feedback-components-review.md" },
    { "path": "docs/work-memory/sessions/2026-09-21-official-trade-feedback-observation.md" },
    { "path": "apps/terminal/src/components/ui/sonner.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/order-toast.tsx" },
    { "url": "https://app.hyperliquid.xyz/trade/HYPE" },
    { "url": "https://app.hyperliquid.xyz/assets/index-58uVNh8f.js" },
    { "url": "https://app.hyperliquid.xyz/assets/config-DWLPMyx3.js" },
    { "url": "https://react-hot-toast.com/docs/toast" },
    { "url": "https://react-hot-toast.com/docs/multi-toaster" },
    { "url": "https://raw.githubusercontent.com/timolins/react-hot-toast/v2.4.1/src/components/toaster.tsx" },
    { "url": "https://raw.githubusercontent.com/emilkowalski/sonner/v2.0.7/src/state.ts" }
  ],
  "supersedes": []
}
-->
# 官方通知宿主数量核对与项目统一建议

## 背景与范围

用户询问两套反馈组件是否符合实践、是否必要，并要求调试官方页面确认使用几套。工作区从 `eeec5c67` 开始干净；本轮只读官方页面、核对现有代码和参考文档，更新架构建议，没有执行真实交易或修改业务实现。

## 结论与依据

- CUA 绑定用户原有官方交易标签。DOM 读取返回 1 个 `.toaster`，`position: fixed`、`z-index: 9999`，当前子节点数 0；`[data-sonner-toaster]` 为 0。没有把“当前无提示”当成“没有反馈组件”。
- 当前 pageAssets 仍列出 `index-58uVNh8f.js`、`config-DWLPMyx3.js`，复用之前保存的同 URL 公开脚本进一步检查。主脚本的 Toaster import 为 `Sd as an`，配置脚本导出 `$c as Sd`；唯一 `containerClassName: toaster` 挂载指向该组件。
- 通知工厂以同一 store 的 success/error/loading 渲染同一个自定义内容组件；`i7` 创建 loading 时保存 `v`，成功时调用 `$(content, success, v)`，错误也传 `v`。全部平仓仍是 errorsOnly，加外层同工厂汇总。ToastBar、store、Toaster 实现与 react-hot-toast 官方源码相符；库体系识别属于代码比对，未取得官方 package manifest，未推定精确版本。
- [参考文档](https://react-hot-toast.com/docs/toast)支持 stable ID 更新状态与自定义内容；[多宿主文档](https://react-hot-toast.com/docs/multi-toaster)说明多 Toaster 可以合理用于不同区域。因此建议基于 gatu 已复现的问题和责任边界，而不是宣称“任何两套组件都不合规范”。
- Sonner 2.0.7 的本地声明和上游同版本源码支持需要的 custom、ID 更新及生命周期能力。建议一个根级稳定宿主、普通提示和交易任务两种内容，保留业务状态/身份/对账和锁；不能直接用 toast.promise 将网络成功当交易终态。原有队列内容可以复用，独立定位/计时外壳可移除。

## 验证与限制

本次浏览器观察是空通知容器及当前公开资源，不是新的交易后行为回放；实际交易通知过程仍引用前一记录中用户自行操作的 DOM 采样。未安装新监听器、未改页面、未改变账户设置，也没有关闭用户标签。未遍历全站或 TradingView iframe 的反馈组件；结论限定订单/平仓浮动通知。

Sonner 文档站的 `/toast`、`/toaster` 本轮 web 查询不可访问；尝试的仓库 website 文档路径返回 404。随后使用上游 README、同版本源码和已安装类型声明核对，未把失败查询当成功证据。react-hot-toast 的 toast/Toaster/multi-toaster 文档可读取。

只更新文档，未重跑应用测试、类型检查或构建；之前 134 项回归与 3 项缺陷复现的结果不作为本次新执行。`pnpm memory:index`、`pnpm memory:check` 通过，`pnpm memory:test` 8 项通过，`git diff --check` 通过。

## 后续与替代关系

本记录补充[反馈组件复审](2026-09-21-trading-feedback-components-review.md)的架构建议，不覆盖其缺陷清单或[官方实际反馈监听](2026-09-21-official-trade-feedback-observation.md)的历史边界。[审查报告](../../trading-feedback-review.md)新增官方宿主数量、实践对照和统一方案；方案尚未实施。
