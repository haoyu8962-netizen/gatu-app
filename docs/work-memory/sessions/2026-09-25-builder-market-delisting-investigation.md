<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-25-builder-market-delisting-investigation",
  "date": "2026-09-25",
  "title": "非 USDC builder 市场缺失排查：API 全部标记下架",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "pr-review",
    "market-recovery"
  ],
  "summary": "在独立 worktree 01 排查 hyna/flx/vntl/km/cash：公开 allPerpMetas 和逐 dex meta 均显示所有市场 isDelisted=true，createMarkets 正常跳过；不是抵押品过滤或免责声明问题。更正先前 bug 推断，保留 404 与下架提示的体验改进建议，未改生产代码。",
  "thread": null,
  "baseCommit": "cd2176a1",
  "commits": [],
  "sources": [
    {
      "path": "apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx"
    },
    {
      "path": "apps/terminal/src/lib/hyperliquid/trade-terminal-boot.ts"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-24-hip3-disclaimer-parity-review.md"
    },
    {
      "url": "https://docs.hyena.trade/"
    },
    {
      "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals"
    },
    {
      "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/meta"
    }
  ],
  "supersedes": []
}
-->
# 非 USDC builder 市场缺失排查

## 背景与范围

用户要求新建 worktree `01`，单独排查 hyna、flx、vntl、km、cash 未进入市场目录及 `/trade/hyna:BTC` 返回客户端 404 的问题。已创建独立 worktree `01/gatu` 与分支 `codex/01-builder-market-catalog`，起点 `cd2176a1`，初始检出干净。主工作区未修改。任务标识未取得。

## 结论与依据

**当前没有证据支持“非 USDC 抵押品导致目录遗漏”的 bug 判断。真正的过滤条件是交易所明确返回的 `isDelisted: true`。**

2026-09-25 对主网公开 `/info` 发起只读请求 `allPerpMetas`、`perpDexs`、`spotMeta`，再用逐 dex 的 `meta` 请求交叉验证：

| dex | 抵押品（spotMeta 原始名称） | 市场总数 | 已下架 | 活跃 |
| --- | --- | --- | --- | --- |
| hyna | USDE，235 | 25 | 25 | 0 |
| flx | USDH，360 | 16 | 16 | 0 |
| vntl | USDH，360 | 15 | 15 | 0 |
| km | USDH，360 | 23 | 23 | 0 |
| cash | USDT0，268 | 17 | 17 | 0 |
| xyz（对照） | USDC，0 | 124 | 15 | 109 |
| abcd（聚合接口对照） | USDC，0 | 1 | 1 | 0 |

- `allPerpMetas` 与 `perpDexs` 均为 11 项，上述索引的市场名前缀与 dex 名称对应；相关抵押 token 均存在于 spotMeta。不是错位、缺抵押币元数据或 USDC 白名单。
- `apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx:148` 的 `if (asset.isDelisted) continue` 在加入目录前剔除所有这些条目。USDC 的 abcd 同样被剔除，进一步说明条件不是抵押品。
- 被过滤的市场不会进入 `marketByName` 或行情目录 lookup。`trade-terminal-boot.ts:24` 在目录可判定且市场未解析时返回 `notFound`，解释既有客户端 404 症状。路由解析允许 `dex:symbol`，不是冒号格式错误。
- [SDK meta 文档](https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/meta) 将 `isDelisted` 定义为下架标志；主工作区已安装的 0.33.3 `meta.d.ts` 也声明该可选 true 字段（新 worktree 尚未安装依赖，仅只读核对现有声明）。
- [HyENA 官方 Sunset Guide](https://docs.hyena.trade/) 明确公告 2026-08-28 开始关停，8 月 31 日至 9 月 2 日逐个下架，BTC 在 9 月 2 日最后一批。公告与当前 hyna:BTC 的 true 标记一致。其他 dex 的历史原因/日期未逐个考证，不用 HyENA 公告替它们作证；本轮对它们的结论仅来自实时 API。
- [Hyperliquid 下架说明](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/delisting) 说明结算后不接受新订单。不能为了让目录搜得到而绕过下架过滤。

## 验证与限制

本轮只读代码和公开 API，未下单、签名或查询私人账户。公开回包保留于本 worktree 的 Git 忽略目录 `.worklog/builder-catalog/`（allPerpMetas、perpDexs、spotMeta 和六份逐 dex meta JSON）。数字为本次请求快照，不保证未来不变。

未启动开发服务器、未重新操作浏览器复现 404；404 的现场证据来自 2026-09-24 的历史记录，本轮通过目录过滤与启动状态代码解释原因。未安装依赖或运行业务单测/构建；无生产代码变动。文档交付运行 `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test` 及 `git diff --check`，结果见任务完成回复。

## 后续与替代关系

更正 [HIP-3 免责声明审查](2026-09-24-hip3-disclaimer-parity-review.md) 中“顺路发现”的推断：观察到搜不到和 404 是事实，但不应仅凭 API 保留 dex/市场条目就推断目录 bug。该记录的免责声明结论不在本次范围内，也不整体替代。

当前无需移除过滤或恢复这些市场。可单独规划“已下架”路由展示：保留只读元数据并明确区分不存在与已下架，同时保持全部交易入口禁用；这属于体验改进，尚未实施。未来若有 `isDelisted` 未设置的非 USDC 市场仍搜不到，应携带当时回包继续排查，不能沿用本次全已下架的快照结论。

## 合入补记（2026-09-28）

本记录所在提交 `c3151404`（`codex/01-builder-market-catalog`）一直未推送，于 2026-09-28 以拣选方式带入分支 `docs/weekly-records-and-builder-delisting`，新提交为 `191e1f59`。其间 `dev` 上的 [HIP-3 免责声明审查](2026-09-24-hip3-disclaimer-parity-review.md)已由另一任务写入「更正（2026-09-25）」，结论相同；合并时保留那份更正，并在其后加一句指向本记录，不再重复本记录的更正段落。
