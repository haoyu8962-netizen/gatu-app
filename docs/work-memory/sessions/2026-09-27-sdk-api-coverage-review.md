<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-27-sdk-api-coverage-review",
  "date": "2026-09-27",
  "title": "Hyperliquid SDK 0.33.3 接口覆盖审查与接入收益排序",
  "kind": "task",
  "status": "verified",
  "topics": ["hyperliquid-api"],
  "summary": "在独立 worktree 审查 SDK 四个客户端 169 个方法：生产代码调用 88 个（Info 42/77、Exchange 23/59、Subscription 23/28、Explorer 0/5）；未调用的 81 个分为建议接入 6、可选 15、战略级 12（子账户、HIP-4、金库管理）、分支中或被策略关闭 2、冗余 18、与终端无关 28。建议优先 fundingHistory、OI 上限（数据已随 webData3 到达）+ perpDexLimits、predictedFundings。官方前端证据来自 2026-09-27 未登录抓取的 395 个 JS 文件，公开数据为当日快照；只写审查文档，未改代码、未运行应用测试、未连接真实账户。",
  "thread": null,
  "baseCommit": "e3b5dd82",
  "commits": [],
  "sources": [
    { "path": "docs/hyperliquid-sdk-coverage-review.md" },
    { "path": "packages/hl-react/src/registries/exchange.ts" },
    { "path": "packages/hl-react/src/internal/exchange/funds-action-lock.ts" },
    { "path": "packages/hl-react/src/exchange-policy.tsx" },
    { "path": "apps/terminal/src/domain/trade/order/liquidation.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-account-balances.ts" },
    { "url": "https://app.hyperliquid.xyz/fundingComparison" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions" }
  ],
  "supersedes": []
}
-->
# Hyperliquid SDK 0.33.3 接口覆盖审查与接入收益排序

## 背景与范围

同步记录。用户要求新建 worktree，审查项目使用的 SDK 还有哪些 API 未接入、哪些值得接入，说明用途并汇总收益排行。本会话运行在应用创建的专用 worktree `sdk-api-review-51a3ea`（分支 `claude/sdk-api-review-51a3ea`，基线 `e3b5dd82`，树与 `origin/dev` 相同，开始时工作区干净），没有另建第二个 worktree。未取得可核对的任务标识，`thread` 记为 null。

范围是 `apps/terminal/src`、`packages/hl-react/src` 的生产代码对 `@nktkas/hyperliquid` 0.33.3（npm 当前 `latest`）Info、Exchange、Subscription、Explorer 四个客户端的调用。完整结论、分类表与排序在 [接口覆盖审查](../../hyperliquid-sdk-coverage-review.md)。

## 结论与依据

- 覆盖：169 个方法中生产代码调用 88 个。只在 `USER_SIGNED_METHODS`、资金操作锁、组合保证金策略或调度优先级中出现的方法算未接入，但降低了接入成本。
- 建议优先：`fundingHistory`（官方有资金费率历史图，Sairn 只有当前费率和倒计时）、OI 上限（`webData3` 已带 `perpDexStates[].perpsAtOpenInterestCap` 但未读取，另加 `perpDexLimits`）、`predictedFundings`（官方 Funding Comparison 页只调用它）。随后是 `notification` 订阅和 `maxMarketOrderNtls`。
- 战略级：子账户、HIP-4 预测市场、金库管理各需设计与 ADR；组合保证金路由已存在但被策略默认拦截。
- 判为冗余的两项有实测依据：`allPerpMetas` 的分档对 11 个 dex、528 个资产全部可解析，`marginTable` 不需要；`perpCategories` 与已接入的 `perpConciseAnnotations` 分类 206/206 一致。
- 未合入分支中只有 `claude/earn-page` 新增了候选之一（`borrowLend`）。

## 验证与限制

- 方法全集取自锁定包 `esm/api/*/_methods/*.d.ts`；调用点用 scratchpad 中的 Node 脚本跨行匹配 hook 首参与直接客户端调用，再逐条人工确认同名项（账本 delta 类型、通知操作名、Info/Subscription 同名方法）。脚本与中间结果未入库。
- 官方前端：内置浏览器未登录打开 `app.hyperliquid.xyz/fundingComparison`，在页面内从入口包的 Vite 依赖表递归读取 395 个同源 JS 文件（约 14 MB），检索 `type:"<方法>"` 并读取模块上下文；未提交任何表单或签名。用户签名动作可能经辅助函数拼装而漏检，“未发现”不作为官方不支持的证据。另参考 2026-09-21 的本地副本 `.worklog/close-all-queue-review-2026-09-21/official-*.js`（Git 忽略）。
- 公开数据：2026-09-27 对主网 `/info` 发不带用户地址的只读请求（`perpsAtOpenInterestCap`、`perpDexLimits`、`maxMarketOrderNtls`、`exchangeStatus`、`perpCategories`、`perpConciseAnnotations`、`predictedFundings`、`allPerpMetas`、`perpDexs`、`outcomeMeta`、`fundingHistory`），结果为当日快照。
- 文档检查（2026-09-27，本 worktree，Node 24.15.0）：`pnpm memory:index` 更新索引，`pnpm memory:check` 输出 “Work-memory index verified.”，`pnpm memory:test` 8 项全部通过，`git diff --check` 无输出。`docs/` 不在 Biome 的包含范围内，lefthook 也只对 ts/tsx/js/jsx 运行 Biome，因此没有 Biome 检查。
- 没有修改应用代码，没有运行应用、单元测试或浏览器套件，没有连接真实账户；`notification` 消息内容与 `userRateLimit` 真实额度未取得。

## 后续与替代关系

- 若实施，先查 [接口覆盖审查](../../hyperliquid-sdk-coverage-review.md)的排序与前置条件：OI 上限和交易所状态横幅属于新的被动数据提示，须先更新数据展示契约；`notification` 需先定翻译与通知分类；Agent 代签资金操作需先更新签名 ADR 与 Runtime guardrails §8。
- SDK 升级时重跑覆盖审查。
- 没有被替代的记录。
