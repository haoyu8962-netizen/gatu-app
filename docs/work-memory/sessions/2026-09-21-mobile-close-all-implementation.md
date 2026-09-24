<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-mobile-close-all-implementation",
  "date": "2026-09-21",
  "title": "移动持仓全部平仓入口实施",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "移动全部平仓入口已接入共享全账户市价链路，确认面明示筛选隐藏仓位和逐仓目标；冷缓存 38 项浏览器通过，最终标签 18 项与 153 项定向回归通过，全量 6805 通过、1 跳过、1 项既有 SSR 失败。",
  "thread": { "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507", "title": "启动开发服务器" },
  "baseCommit": "f924c61185644bdf6776c516db83466953338f64",
  "commits": [],
  "sources": [
    { "path": "docs/mobile-close-all-plan.md" },
    { "path": "docs/work-memory/sessions/2026-09-21-mobile-close-all-audit.md" },
    { "path": "apps/terminal/src/hooks/trade/use-position-close-all-action.ts" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-positions-tab.tsx" }
  ],
  "supersedes": []
}
-->
# 移动持仓全部平仓入口实施

## 背景与范围

用户确认当前仅有规划，随后要求按方案执行。起始分支 `codex/reviewceshi`，HEAD `f924c611`，工作区与暂存区干净。本任务包含移动入口、共享 action hook、确认面目标与范围说明及回归；不包含真实交易、批量限价和 TP/SL 撤单扩展。任务标识与原任务标题「启动开发服务器」通过 Codex `read_thread` 返回核对。

## 结论与依据

- 实施前重新读取官方 exchange 和 nktkas order 参考，维持既有 reduce-only `FrontendMarket` 批量路径和全部执行守卫。
- 双端共用开窗可用性与全账户快照；移动持仓页的详情使用单一展开/收起切换，新增全部平仓入口。
- 确认面展示目标市场、方向、数量，按抵押币汇总，并说明包含被筛选隐藏的持仓。开窗不发单，签名只来自用户明确确认后的既有流程。

## 验证与限制

以下检查绑定于 `f924c611` 上本任务未提交改动，不代表已部署或真实账户成交。日志位于 Git 忽略的 `.worklog/mobile-close-all-implementation-2026-09-21/`。

阶段记录（保留失败及修正，最终检查另列）：

- 初轮定向 Vitest：7 文件 / 182 项通过；新增 action/snapshot/cache 检查：3 文件 / 10 项通过。
- 初次浏览器夹具缺少 RouterProvider，补齐后又发现桌面 AssetDisplay 的直接 market hook 没有替身，以及抽屉动画未结束就测量；补齐夹具依赖和轮询可见几何后，31 项通过。这些是夹具接线与断言问题，不是生产交易结果。
- 扩展至 37 项时，36 项通过，语言切换用例因模态层将外部夹具控制设为辅助技术隐藏而超时；定位器明确包含该测试控制后重验。该调用仅在夹具中触发语言切换。
- 首次完整 terminal 测试：591 文件通过 / 3 文件失败 / 1 文件跳过，6802 项通过 / 4 项失败 / 1 项跳过。新目标列表补上数字格式订阅；两条源码契约断言迁移到共享 action。修正后 5 文件 / 39 项定向回归通过。剩余 `trade-form-views.test.tsx` SSR 一致性失败属于前期已确认基线，见[前期修复记录](2026-09-21-reduce-only-review-fixes.md)。最终全量复验：593 文件通过 / 1 文件失败 / 1 文件跳过，6805 项通过 / 1 项失败 / 1 项跳过，119.62s；唯一失败仍为上述未改动的 SSR 基线。
- 人工检查 320px 中文确认面、320px 法语工具栏截图时发现筛选器挤压；左侧内容改为固有宽度滚动，并新增相邻筛选器不重叠断言，右侧动作区保持固定。320px 卡片内部既有 PnL 换行未在本任务扩展修改。
- 本地 3006 页面首次观察到「持仓」工具栏右侧的「全部平仓」时，交易钱包未连接，入口正确禁用。交付前连接已就绪，使用当前登录账户打开真实确认预览，确认范围说明、目标仓位与数量及摘要均可见，再通过关闭按钮返回持仓页；没有点击最终确认、重新登录或签名。账户信息与具体仓位数值不写入记录。实际提交守卫和成交结果仅在合成账户夹具验证，不将只读预览等同于真实交易验收。
- 补齐数字格式订阅和窄屏滚动后的浏览器 37 项通过；新增桌面入口、强化筛选/语言保留后，独立缓存冷启动全套 **38 项通过**（1.8m）。冷启动只移动专用夹具缓存，3006 应用缓存未触碰。
- 最终标签审查将移动入口的可访问名称改为其可见文字：中文「全部平仓」不再被既有完整译文「一键全平」覆盖。依据 [W3C Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)，保留确认面原有完整名称；更新规划中的命名选择，并追加可访问名称等于可见文字的断言。最终标签、布局、桌面入口和热切换复验：18 项浏览器通过（47.0s）；最终定向 Vitest 5 文件 / 153 项通过（4.38s）。本轮之后未改动执行逻辑。
- `pnpm --filter @gatu/terminal typecheck`、12 个修改后的 src TS/TSX 文件 `pnpm exec biome check`、5 个浏览器 TS/TSX 文件按相同配置 stdin 检查、`pnpm i18n:extract` 与 `pnpm --filter @gatu/terminal i18n:compile` 通过。提取仍报告历史未翻译条目（ar/es/fr/hi 各 36、zh 5），本次新增三条消息六语言已补齐，没有把历史缺口算作本次完成内容。

未执行真实下单、平仓、撤单或签名；没有发布、真机验收或远端 CI 结果。

首次 `memory:index` 因 thread 误写为字符串被 schema 拒绝；已按对象格式补齐经过工具核对的任务 ID 与原始标题，未修改校验器。修正后 `pnpm memory:index`、`pnpm memory:check` 通过，`pnpm memory:test` 8 项通过；补记本地只读预览后按同一流程复验。

## 后续与替代关系

实施说明与文档导航已更新为当前行为；官方批量限价、按筛选范围平仓及 TP/SL 清理仍为独立后续，不在此次新增入口中实现。
