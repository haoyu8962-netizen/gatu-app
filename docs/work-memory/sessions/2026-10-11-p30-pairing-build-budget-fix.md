<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-11-p30-pairing-build-budget-fix",
  "date": "2026-10-11",
  "title": "p30 晋升前修复配对开启构建：api-wallet 双 chunk 与总量基线",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "pairing-release"],
  "summary": "dev→main 晋升 PR #96 的配对开启生产构建在 a310ade1 与 ee4aab99 两次失败：总量 +10,645 超 10,000 允许量，且 api-wallet-*.js 出现两个 chunk。根因是配对弹窗静态引入 api-wallet-state 的 isApiWalletExtraAgentSnapshot，Rollup 把该模块提成与 API 钱包路由共享的 chunk 并沿用模块名。把守卫和 ExtraAgent 类型移到 lib/hyperliquid/extra-agent-snapshot.ts；以固定身份 Node 22.15.0 的配对关构建 3,304,479 重定总量基线，配对开构建 3,307,606（+3,127）且单 chunk。同时按运营方决定记录三个发布闸门默认全开、不再逐次询问。未发布。",
  "thread": null,
  "baseCommit": "ee4aab99",
  "commits": [],
  "sources": [
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"path": "docs/terminal-performance-baseline.md"},
    {"path": "apps/terminal/src/lib/hyperliquid/extra-agent-snapshot.ts"},
    {"path": "apps/terminal/src/components/api-wallet/api-wallet-state.ts"},
    {"path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx"},
    {"path": "docs/agent-handbook.md"},
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/mobile-phone-access-device-validation.md"}
  ],
  "supersedes": []
}
-->
# p30 晋升前修复配对开启构建：api-wallet 双 chunk 与总量基线

## 背景与范围

用户要求「把 dev 晋升到 main 并发布」。`origin/dev` 为 `ee4aab99`（PR #97 合并提交），晋升 PR #96（`dev` → `main`）的 `Build terminal (pairing true)` 失败；同一检查在上一个 dev 头 `a310ade1` 也已失败，所以 p29 从未构建或发布（`gatu-release-p29` 工作树停在 `a310ade1`，没有 `.output`），线上仍是 p28 / `d74dd616`。本记录只覆盖让晋升构建通过的修复与闸门决定；发布本身另记。工作树 `.claude/worktrees/budget-fix`，分支 `claude/pairing-on-budget`，起点 `ee4aab99`。

## 结论与依据

- CI 失败行（run 38143745279）：`total client gzip increased by 10645 bytes from baseline 3297099; allowed increase is 10000 bytes` 与 `expected one client chunk api-wallet-*.js but found 2`。同一头的配对关构建（run 38141825735）读 3,304,745（+7,646），通过。
- 双 chunk 根因：`mobile-agent-sync-modal.tsx`（ADR 0039，仅配对构建包含）静态引入 `components/api-wallet/api-wallet-state.ts` 的 `isApiWalletExtraAgentSnapshot`；配对开时 Rollup 把该模块提成与 `/api-wallet` 路由共享的 chunk，按模块名命名为 `api-wallet-state-*.js`，被预算脚本的 `api-wallet-*.js` 表面匹配成第二个 chunk。配对关构建不含弹窗，所以从未触发。
- 修复：守卫与 `ExtraAgent` 类型移到 `lib/hyperliquid/extra-agent-snapshot.ts`，`api-wallet-state.ts` 重新导出以保留现有导入；弹窗改从新模块导入。配对开构建产物出现 `extra-agent-snapshot-*.js` 共享 chunk，`api-wallet-*.js` 只剩一个（18,255 gzip）。
- 总量基线按既有做法重定为固定身份、Node 22.15.0、无 `.env.local` 的配对关构建 3,304,479（+7,380，为 p26 以来 PR #91、#92、#94、#97 各自在配对关 CI 下通过的增长之和）；配对开构建 3,307,606，对新基线 +3,127。桌面运行时增量 +9,313 / 手机 +7,835 未重定（各距允许量 687 / 2,165），详见 `docs/terminal-performance-baseline.md` 的 p30 章节。
- 闸门：运营方对本次发布闸门询问答复「以后不要咨询了 … 全部开」，据此在手册第 8 节、`deploy/cloudfront/README.md` 闸门表、`agent.md`、`docs/runtime-guardrails.md` §8 与真机清单写明：自 p30 起主网赞助充值、移动配对、主网银行卡入金默认全开，发布前不再逐次确认；真机清单仍待在已发布构建上记录。

PR #98 的 Codex 机器人两条 P2 已采纳：发布 README「发布闸门」一节现在用一段现行规则统一三个闸门（默认全开、`--allow-…` 仍是机械复核、旧验收条件保留为上线后事项、不再阻断发布），表格各行与配对段落改为引用它；`agent.md`、`runtime-guardrails.md` §8 与真机清单把配对开关表述为「自 p30 起生产构建默认打开」而非已上线事实，实际线上状态以 `build-meta.json` 与发布记录为准。

## 验证与限制

环境：Node 22.15.0（构建）/ 24.15.0（测试与类型检查）、pnpm 10.21.0。

- `pnpm --filter @sairn/terminal typecheck` 通过；Biome 对改动的 3 个 TS/TSX 与预算脚本通过。
- `vitest run` `api-wallet-state`、`mobile-agent-sync-modal`、`use-api-wallet-controller`、`api-wallet-action-modal`：4 文件 120 项通过。
- 配对关固定身份构建在沙箱内于预渲染步骤失败（沙箱禁止预览服务器绑定端口），客户端资产已完整产出，直接对其运行 `check-client-chunk-cycles`（441 chunk 无环）与 `check-client-bundle-budget` 取得上表数字；配对开构建在沙箱外完整通过（442 chunk 无环、预渲染 1 页、预算通过）。两次构建日志在 Git 忽略的会话暂存目录，未入库。
- 未运行全量 Vitest 与 Playwright；CI 结果以 PR 为准。
- `node --test scripts/check-client-bundle-budget.test.mjs` 19/19 通过；`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）与 `git diff --check` 通过。

## 后续与替代关系

本记录补充 [p26 重定基线](../../terminal-performance-baseline.md) 的做法，不替代任何记录。合入 `dev` 后，PR #96 重新运行配对开构建；通过即晋升 `main` 并按手册第 8 节发布 p30（三个闸门全开）。
