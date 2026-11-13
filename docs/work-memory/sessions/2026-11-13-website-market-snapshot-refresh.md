<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-13-website-market-snapshot-refresh",
  "date": "2026-11-13",
  "title": "官网行情快照刷新：移植 2026-11-04 未合并的改动并重新抓取",
  "kind": "task",
  "status": "recorded",
  "topics": ["jurisdiction-marketing", "hyperliquid-api"],
  "summary": "新仓库上第一次 CI 里 Build website 因快照已 17 天（上限 7 天）失败。原仓库的分支 claude/website-market-snapshot 在 2026-11-04 修过同一问题但没有合入；把它的源码改动移植进来，重新运行 markets:snapshot，并把钉住的深色图标清单从 ETH、NEAR、io:ANTH 改为 ETH、io:ANTH。官网源码测试、构建与构建后测试在本机通过；新增图标没有人工看图。",
  "thread": null,
  "baseCommit": "3c31c852",
  "commits": [],
  "sources": [
    { "path": "apps/website/src/config/deployers.ts" },
    { "path": "apps/website/src/data/market-structure.json" },
    { "path": "apps/website/src/data/market-icons.json" },
    { "path": "apps/website/tests/market-icons.test.mjs" },
    { "path": "docs/website-plan.md" },
    { "path": "docs/work-memory/sessions/2026-11-04-website-market-snapshot-refresh.md" }
  ],
  "supersedes": []
}
-->
# 官网行情快照刷新（2026-11-13）

## 背景与范围

同步记录，2026-11-13，未取得任务标识。`haoyu8962-netizen/sairn` 的 PR #1 上，`Build website` 失败：「snapshot fetchedAt 2026-10-27T05:46:52.566Z is 17.0 days old (limit 7); run markets:snapshot」。运营方同意刷新并单独开 PR。

## 结论与依据

- 直接运行 `markets:snapshot` 报「deployers.ts xyz:JIO is no longer preipo」。原仓库的本地分支 `claude/website-market-snapshot`（2026-11-04，[记录](2026-11-04-website-market-snapshot-refresh.md)）已按部署方文档处理过：从 Pre-IPO 文档表里去掉 xyz:JIO、加入 para:ANTH，并改了两份测试与文档。该分支没有合入原 `dev`，迁移时没有带过来。本次把它在生成文件之外的改动原样移植（`git apply`，无冲突），部署方文档的阅读日期仍是 2026-11-04，没有重新阅读。
- 重新运行 `markets:snapshot` 成功，`fetchedAt` 2026-11-13T07:25:16.480Z。相对 2026-10-27：上市市场数 main 179、xyz 122、para 33、mkts 1、io 15；mkts 下架四个市场；若干市场 `onlyIsolated` 由 true 变 false。
- NEAR 不再属于页面渲染的市场，图标被脚本移除；`market-icons.test.mjs` 钉住的需要底板的图标清单改为 ETH、io:ANTH。

## 验证与限制

本机读数：

- `markets:snapshot --check`：通过。
- 官网源码测试（Node 22.15.0）：97 项通过。
- 官网构建与构建后测试（Node 24.15.0；本机没有工作流用的 22.23.4，22.15.0 被 Astro 拒绝）：构建退出码 0，构建后测试 56 项通过。
- `pnpm memory:check`：通过。

没有验证的：新增图标（XMR、xyz:AMD、xyz:ANT、xyz:NIFTY、xyz:NVDA 等）没有人工看图；没有部署官网；CI 上的结果以 PR 为准。

## 后续与替代关系

本记录不取代其他记录。快照超过 7 天构建就会失败；每日的 `Website Market Snapshot` 检查在新仓库上是否运行、失败时由谁处理，尚未确认。
