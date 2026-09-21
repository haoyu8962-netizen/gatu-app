<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-trading-feedback-components-review",
  "date": "2026-09-21",
  "title": "交易反馈组件与确认弹窗完整链路复审",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "确认普通下单用持续订单队列，平仓用短暂 Sonner；复现晚到成功残留错误、离开交易页吞通知、跨账户迟到通知，以及双通知遮挡和移动断点错位，另确认部分成交计数文案错误及既有等待反馈缺口。134 项既有测试通过，3 项临时用例证明缺陷存在；只记录审查，未修业务代码。",
  "thread": { "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507", "title": "启动开发服务器" },
  "baseCommit": "efe8389ee8f2a19f99c2b45673dc5e78b409a1f7",
  "commits": [],
  "sources": [
    { "path": "docs/trading-feedback-review.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/mobile-close-all-plan.md" },
    { "path": "docs/work-memory/sessions/2026-09-21-official-trade-feedback-observation.md" },
    { "path": "apps/terminal/src/components/ui/sonner.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/order-toast.tsx" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "apps/terminal/src/stores/use-order-queue-store.ts" },
    { "path": "apps/terminal/src/components/trade/positions/position-close-all-modal.tsx" }
  ],
  "supersedes": []
}
-->
# 交易反馈组件与确认弹窗完整链路复审

## 背景与范围

用户在官方全部平仓反馈监听后，要求 review 当前项目使用的反馈组件及是否已有对应弹窗。基线 `efe8389e`，分支 `codex/reviewceshi`，起始工作区干净。本轮分工只读审查普通下单队列、平仓和全局对账，再用边缘替身测试与隔离浏览器复现；没有在用户账户中签名、交易或改变账户设置。

## 结论与依据

[审查报告](../../trading-feedback-review.md)列出职责表、反馈矩阵与 R1–R7：普通下单队列与平仓 Sonner 不同；已存在成功、错误、待确认等提示，但平仓没有即时 loading 或持续批次卡片。成功后的错误清理、通知归属、跨路由可见性及布局有确证问题，不能只以“已有 Toaster”判断整个反馈链路正常。

- R1、R2：真实队列组件、queue/pending stores 和全局对账器，分别复现超时后 filled 保留旧错误，以及队列未挂载时完成不发 Sonner、5 秒后重新挂载即消失。
- R3：真实 pending store 与对账器，deferred `orderStatus` 在 A 查询开始后切到 B，再释放 A 的 filled 回包，实际仍发一次通用成功通知。身份隔离只影响反馈的结论，不外推为签名身份缺陷。
- R4、R5：临时 Vite 夹具使用项目真实 Sonner 封装和 OrderToast，以及人工构造的 56px 底部导航区域；390×844 两套反馈底边均 y=776，重叠 73px；800×844 的 Sonner bottom 为 24px，与导航重叠 32px；1280×844 两套反馈重叠 41px。金额和市场都是虚构样本，Sonner 设为 Infinity 只是便于量测位置，不代表业务持久时长。
- R6 由已执行的部分成交回归与 UI 文案联合确认；R7 是之前已登记的等待反馈缺口。保留确认面点击即关闭、后台提交继续运行的既有契约，建议从通知层修复，而不是恢复按钮进度文案。

## 验证与限制

对 `efe8389e` 执行以下已有回归：

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/toaster-config.test.tsx \
  src/lib/tests/sonner-pointer-cancel.test.tsx \
  src/lib/tests/order-toast-placement.test.tsx \
  src/lib/tests/position-close-all-modal.test.tsx \
  src/lib/tests/position-close-all-submit.test.tsx \
  src/lib/tests/position-market-close-submit.test.tsx \
  src/lib/tests/tracked-order-hook.test.tsx \
  src/lib/tests/order-reconciliation.test.tsx \
  src/lib/tests/order-reconciliation-error-message.test.tsx
```

**9 文件、134 项通过**，6.30 秒。它们没有覆盖新复现的组合场景，不能作为上述缺陷不存在的证据。

两个协作代理分别报告临时复现结果，主审核对实现及结果：

- `pnpm --dir apps/terminal exec vitest run src/lib/tests/feedback-review-queue-temporary.test.tsx`：1 文件、2 项通过，5.03 秒；断言 R1/R2 的错误行为实际出现。临时测试已删除，可复跑的脱敏副本与结果保留在忽略目录 `.worklog/feedback-components-review/queue-reproduction.test.tsx.txt`、`queue-reproduction-result.txt`。
- `pnpm --dir apps/terminal exec vitest run src/lib/tests/feedback-identity-review.test.tsx`：1 文件、1 项通过，1.25 秒；断言 R3 的跨账户成功通知实际出现。临时测试已删除，本轮未保存该测试文件的持久副本。

以上临时用例的“通过”指成功证明缺陷存在，不是修复通过；没有将临时测试混入应用提交。

隔离夹具位于 `.worklog/feedback-components-review/`，端口 4189；Vite 缓存为 `apps/terminal/node_modules/.vite-feedback-review`，与应用及其他夹具缓存互为兄弟。首次量测因夹具缺少 Tailwind `@source` 而没有正确定位队列，该结果已弃用；补齐真实源样式后重新量测并取得上述数据。随后 HMR 清空通知导致一次空节点读取失败，重新通过夹具按钮建立状态后验证。浏览器使用 CUA；临时标签已关闭、视口覆盖已 reset、临时服务器已停止，3006 应用服务未改。

未做真实钱包、真实交易、真机验收或全量资金弹层复审；未运行全量应用测试、typecheck 或生产构建。TWAP 晚到错误残留只做代码核对，没有动态复现。`pnpm memory:index`、`pnpm memory:check` 通过，`pnpm memory:test` 8 项通过，`git diff --check` 通过。

## 后续与替代关系

补充[全部平仓队列复审](2026-09-21-close-all-queue-review.md)和[官方监听](2026-09-21-official-trade-feedback-observation.md)，不替代其历史范围。新增审查报告已从文档地图链接。建议先修结果一致性、身份与宿主，再协调通知布局、修正部分成交文案并接入持续反馈；全部建议尚未实施。本轮只提交审查文档。
