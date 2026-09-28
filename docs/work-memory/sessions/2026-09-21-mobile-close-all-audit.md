<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-mobile-close-all-audit",
  "date": "2026-09-21",
  "title": "移动持仓全部平仓入口缺失：官方对照与实施规划",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry", "pr-review"],
  "summary": "移动全部平仓入口缺失的审查与规划，后续已接入共享全账户市价链路；批量限价、筛选范围平仓与关联 TP/SL 清理仍是独立范围。未在本轮执行真实提交。",
  "thread": null,
  "baseCommit": "307cc26f1485861d1046d980692ed6a22073b3c5",
  "commits": ["f924c611"],
  "sources": [
    { "path": "docs/mobile-close-all-plan.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/work-memory/sessions/2026-09-21-close-all-submit-and-dismiss.md" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-positions-tab.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/positions-tab.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-position-close-all-submit.ts" },
    { "url": "https://app.hyperliquid.xyz/trade/HYPE" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods/order" }
  ],
  "supersedes": []
}
-->
# 移动持仓全部平仓入口缺失：官方对照与实施规划

## 背景与范围

用户在官方移动终端的「方向 / 市价 / 全部展开 / 全部关闭」工具栏标注项目缺少「全部关闭」，要求审查、核对官方开发文档并规划修复。最新请求是规划，本轮没有执行产品修改。同步记录，基线分支 `codex/reviewceshi`、HEAD `307cc26f`，起始工作区及暂存区干净。未取得任务标识，`thread` 留空。

用户截图在会话中可用，未复制进仓库；未获得原始完整会话导出。已登录页面涉及个人账户，文档只保留功能观察，不保存邮箱、钱包地址、仓位金额或未脱敏截图。

## 结论与依据

- 缺口在移动持仓入口。`MobilePositionsTab.renderFilterRow` 只有筛选和 `MobileBulkDisclosureActions`，没有 `openCloseAll`。桌面已经存在快照、确认、store 和页面层宿主。完整方案见 [mobile-close-all-plan.md](../../mobile-close-all-plan.md)。
- 官方真实页面观察：展开后按钮变为「全部折叠」，独立的「全部关闭」保持；查看其公开脚本确认只开弹窗后，点击看到批量平仓确认面，默认市价，另有中间价限价选项及关联 TP/SL 说明。未点击任何提交控件；Escape 未关闭弹窗，随后点击右上角关闭并确认弹窗消失；展开状态恢复为原来的折叠。
- 官方公开资源由当前页清单定位，主脚本为 `index-58uVNh8f.js`。移动入口把筛选器传给 `confirmCloseAll.overrideFilter`；未执行真实提交，不据此宣称完整执行行为已经验收。项目当前按全账户集合检查，因此推荐首步维持全账户市价范围并在确认面明示，不能仅接入筛选后的数组。
- 本地 3006 页面的移动持仓工具栏也仅有展开/收起；交易控件处于未连接状态，未要求重新登录、未修改账户连接。读取持仓页后恢复原来的成交历史页签。未对当前本地账户的有仓位确认面作真人操作验收。
- 官方 exchange/订单类型/错误/TP-SL 文档及 nktkas order schema 已读。本地版本为 `0.33.3`，订单字段 `r: true`、基础币字符串 `s`、`grouping: "na"` 与现有批量流程吻合。实际现有 tif 是 `FrontendMarket`，不是把 `Ioc` 字符串写入请求；在线 SDK 和锁定声明均说明两者语义相似。
- 现有全部平仓没有显式撤单动作；官方页面的 TP/SL 说明不能直接当作项目保证。按不同 TP/SL 绑定与部分平仓情形的清理验证列为后续，不把未经验证的协议行为当作已经确认的缺陷。

## 验证与限制

- 代码验证基于未改动的 `307cc26f`。2026-09-21 定向 Vitest **7 文件、66 项通过**（6.08 秒）：`position-close-all`、`position-close-all-submit`、`position-close-all-modal`、`position-dialog-session-ownership`、`mobile-position-filter-row`、`mobile-positions-tabs`、`mobile-data-presentation-contract`。使用 `pnpm --dir apps/terminal exec vitest run` 执行上述 `src/lib/tests/` 文件。日志位于 Git 忽略目录 `.worklog/mobile-close-all-audit-2026-09-21/focused-tests.log`。这些测试覆盖现有能力，不覆盖尚未实现的移动入口；`mobile-positions-tabs` 使用页签内容替身，不能作为入口接线测试。
- 浏览器观察使用用户已打开的官方/本地标签，未新建交易、未签名、未撤单。没有真机、真实成交、限价执行或官方筛选提交验证。
- API 资料通过官方站和维护者参考读取；本会话没有暴露对应的 Hyperliquid/nktkas 文档 MCP 工具，按项目约定使用 Web 查询。nktkas 页是单行 OpenAPI schema，已展开核对字段并与本地声明比较。
- 本轮只修改规划和记录，未运行应用构建、typecheck 或全量单测；不得将定向通过解释为新增入口已完成。同一代码基线的上一任务记录了完整测试中的一个既有 SSR 用例失败，详见[只减仓复审修复记录](2026-09-21-reduce-only-review-fixes.md)，本轮没有重跑或修复该项。
- `pnpm memory:index`、`pnpm memory:check` 通过，`pnpm memory:test` 8 项通过；规划、记录及文档导航中的本地 Markdown 链接目标检查通过，`git diff --check` 通过。仅提交规划、导航、任务记录和生成索引，没有产品代码或账户数据。

## 后续与替代关系

不替代既有提交/退场生命周期记录。后续按方案的共享入口、移动布局和范围说明、跨边界回归、浏览器验收、文档交付五步实施。批量限价、按筛选范围平仓、关联 TP/SL 清理验证为独立后续。此次规划完成不表示功能已上线。

## 周整理补注（2026-09-28）

移动入口已有实施记录；不能由本规划或入口完成推断所有批量平仓能力已交付。

后续来源：[2026-09-21-mobile-close-all-implementation](2026-09-21-mobile-close-all-implementation.md)。

本条为事后整理；本轮仅核对 Git、现行文档和相关实现入口，原验证结果仍归属来源任务，未重跑业务测试。详见 [本周整理](2026-09-28-weekly-memory-review.md)。
