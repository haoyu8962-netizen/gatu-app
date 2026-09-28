<!-- work-memory
{"schemaVersion":1,"id":"2026-09-21-reduce-only-review-fixes","date":"2026-09-21","title":"只减仓复审三项问题的验证与修复","kind":"task","status":"recorded","topics":["order-entry"],"summary":"三项已复现并修复：恢复普通手机保证金口径，健康余额不再被持仓不可用置零，Max 名称随只减仓和语言更新；45 项浏览器通过（1 项重跑），全量 6801 通过、1 跳过、1 个已知基线 SSR 失败。","thread":null,"baseCommit":"26b7bbf0","commits": ["307cc26f"],"sources":[{"path":"docs/reduce-only-repair-plan.md"},{"path":"docs/work-memory/sessions/2026-09-21-reduce-only-opus5-review.md"},{"path":"docs/order-entry-surface-parity.md"},{"path":"apps/terminal/tests/browser/reduce-only.pw.ts"},{"url":"https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining"},{"url":"https://www.w3.org/WAI/ARIA/apg/patterns/button/"}],"supersedes":[]}
-->
# 只减仓复审三项问题的验证与修复

## 背景与范围

用户要求重新审查三项问题、核对开发文档、规划并执行修复。基线 `26b7bbf0`，分支 `codex/reviewceshi`，起始工作区干净；未取得任务标识。范围为普通手机保证金、两端余额可用性展示和 Max 可访问语义，不修改签名或 SDK 订单字段。

## 结论与依据

当前代码复核三项仍存在：手机使用执行价格而不是原订单价值价格；共享门槛混入持仓状态后被余额展示使用；Max 动作与可访问名称不一致。实施前在[原修复计划](../../reduce-only-repair-plan.md)补充设计、备选、验收标准。

2026-09-21 读取 Hyperliquid 官方 Margining / Exchange API、WAI-ARIA Button Pattern 和 SDK order 页面，并检查锁定 `@nktkas/hyperliquid@0.33.3` 的 `exchange/_methods/order.d.ts`、`subscription/_methods/allDexsClearinghouseState.d.ts`。SDK 网页返回内容不完整，Markdown 重试失败，具体 TypeScript 形状以本地锁定声明为准：`r` 为布尔只减仓标志，`s` 为基础币数量，持仓订阅带 user 和 dex/state 元组。本次仅调整前端数据与展示，不升级 SDK。

方案：保留组合后的交易禁用门槛，单独暴露余额禁用状态用于展示和 Swap；复用已算好的 conversionPrice 与现有 Big.js 域函数恢复手机保证金；双端 Max 使用随只减仓和语言更新的准确名称与 title。TWAP 摘要继续没有保证金行。浏览器夹具补持仓 loading/error/stale，并按 coin/dex 匹配持仓。

## 验证与限制

先在未修改生产代码的基线上运行新增浏览器回归：Max 目标可访问名不存在；健康余额在持仓 loading 时从 1,000.00 变为 0.00。保证金用例首次误用了 `—`（实际占位为 `-`），随后发现输入名称遗漏 `(USDC)`，两次均属测试编写问题并已纠正；纠正后确实复现普通止损市价单保证金 8.00 而原口径应为 10.00。完整保留失败日志，不把测试编写错误当作产品缺陷。

修复后三处生产变更共用原有派生与 Big.js 域函数，没有新增 Effect、订阅、草稿状态或协议字段。新增 7 项浏览器回归和 1 项桌面 Swap/余额单元回归；六种语言补齐新名称。浏览器回归使用真实 Hook 与生产两端容器，行情、钱包、提交为可控替身。

本次已完成的验证（基线 `26b7bbf0` 上的修复工作区）：

- `pnpm --filter @gatu/terminal typecheck` 通过。
- `pnpm exec biome check` 对 5 个纳入仓库检查范围的变更 TS/TSX 通过；被仓库忽略的测试文件使用项目 Biome 配置格式化。纯夹具原有格式未顺带重排。
- `pnpm i18n:extract` / `pnpm i18n:compile` 通过；新名称六种语言均非空。已有其他条目缺译未归为本次改动。
- `pnpm --dir apps/terminal exec playwright test tests/browser/reduce-only.pw.ts --config tests/browser/mobile-trade-all-orders.playwright.config.ts`：16 通过（46.7s）。覆盖三种宽度、七种有保证金行的普通订单与只减仓占位、TWAP 无保证金行、健康余额与持仓 loading/error/stale、恢复保留草稿、真实余额 stale 仍阻断、中英文 Max 同一 DOM 实例及零余额应用持仓数量。
- 查看 1440/1108/375px 合成夹具截图，相关表单、摘要与网格无新增重叠。截图与日志在 Git 忽略目录 `.worklog/reduce-only-review-fixes-2026-09-21/`。

其余表单浏览器命令 `pnpm --dir apps/terminal exec playwright test tests/browser/mobile-trade-all-orders.pw.ts tests/browser/desktop-order-entry-layout.pw.ts --config tests/browser/mobile-trade-all-orders.playwright.config.ts`：28 通过、1 失败（2.5m）。失败为缩短桌面网格后的立即滚动高度判断，截图显示缩短未生效；未修改任何网格代码或测试，独立 `--last-failed` 重跑 1 项通过（8.3s）。因此共 45 项浏览器用例取得通过结果，其中 1 项需要重跑，不声称首轮全绿，也未证实偶发失败的根因。

首次全量 `pnpm --filter @gatu/terminal test`：6800 通过、2 失败、1 跳过（108.24s）。一项是已在父版本复现的 slider SSR 失败；另一项是 Swap 源码契约断言仍引用旧的 `isAvailabilityBlocked`。后者更新为余额专属标志，并定向运行该文件和真实组件回归，2 文件 / 6 项通过（9.25s）。最终全量复跑：**6801 通过、1 失败、1 跳过**（594 文件，99.30s）；唯一失败仍是 `trade-form-views.test.tsx` 的 disabled slider SSR 等同性，父版本证据见[前次实施记录](2026-09-21-reduce-only-implementation.md)，本次未修改滑杆实现。

本地开发页 `http://localhost:3006/trade/HYPE?scope=all` 返回 HTTP 200。夹具使用独立 Vite 缓存和合成账户，未提交真实交易或做真机验收。之前任务的通过结果不作为本次结果。

工作记录检查 `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8 项）通过，`git diff --check` 通过。提交内容包含三个生产文件、对应回归/夹具和六种语言、修复方案、双端/移动数据规范、CHANGELOG 与本记录/索引。

## 后续与替代关系

三项问题均已修改并通过对应回归。本记录补充对抗审查，不把其风险清单、既定金额重输取舍、旧 TP/SL 组合或小额平仓限制扩大为本次改动。已知 slider SSR 差异仍是独立后续事项；未将浏览器合成通过视为实盘验收。本任务仅本地提交，不推送。
