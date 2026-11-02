<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-13-p32-rebaseline",
  "date": "2026-10-13",
  "title": "p32 晋升前重定总量与桌面运行时包体基线",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "pairing-release"],
  "summary": "dev→main 晋升 PR #112（head f50e21a8）的配对开启生产构建失败：总量 3,314,639，比基线 3,304,479 多 10,160，超 10,000 允许量；同一头的配对关构建 3,311,212（+6,733）通过。无 chunk 拆分等异常，增长是 p30 以来 PR #101、#102、#107、#108、#109 各自在配对关允许量内合入的总和加上配对弹窗本身。在 gatu-release-p32 工作树以固定身份、Node 22.15.0、无 .env.local 构建：配对关（显式 false）3,311,757、配对开 3,314,259；总量基线重定为 3,311,757，桌面运行时增量基线重定为 202,683（距允许量只剩 483），手机运行时不动。记录了一个测量坑：标志未设置不等于配对关，产物会多出 mobile-pairing chunk。",
  "thread": null,
  "baseCommit": "f50e21a8",
  "commits": ["bf0f8769"],
  "sources": [
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"path": "docs/terminal-performance-baseline.md"},
    {"path": "apps/terminal/src/config/mobile-pairing-flags.ts"},
    {"path": ".github/workflows/production-build.yml"},
    {"path": "docs/work-memory/sessions/2026-10-11-p30-pairing-build-budget-fix.md"}
  ],
  "supersedes": []
}
-->
# p32 晋升前重定总量与桌面运行时包体基线

## 背景与范围

同步记录，未取得任务标识。运营方要求「晋升到 main 并发布」。`origin/dev` 为 `f50e21a8`（PR #109 合并提交），晋升 PR #112（`dev` → `main`）的 `Build terminal (pairing true)` 失败，其余七项通过。线上仍是 p31 / `74e69f77`。本记录只覆盖让晋升构建通过的重定基线；发布本身另记。分支 `claude/p32-rebaseline`（工作树 `version-hint`），起点 `f50e21a8`；测量在仓库外的发布工作树 `gatu-release-p32`。

## 结论与依据

- CI 失败行（run 38397746190）：`total client gzip increased by 10160 bytes from baseline 3304479; allowed increase is 10000 bytes`；桌面运行时 +9,460、手机 +7,728、静态启动 −2,477，都在允许量内。同一头的配对关构建读 3,311,212（+6,733）、桌面 +9,517、442 chunk，通过。
- 不是 chunk 拆分之类的异常：配对开产物 443 chunk、`api-wallet-*.js` 单 chunk，与 p30 修复后一致。增长来自 p30 以来合入 `dev` 的 PR #101（版本号入口）、#102（滑杆基准冻结）、#107（ADR 0041 自动统一账户）、#108 与 #109（生产审计两批修复），每个都在配对关 CI 的允许量内；配对开再加约 2.5–3.4 KB。
- 测量（`gatu-release-p32`，无 `.env.local`，Node 22.15.0、pnpm 10.21.0，固定身份 `SAIRN_BUILD_SHA=f50e21a8… SAIRN_RELEASE_ID=p32-rebaseline SAIRN_BUILD_TIME=2026-10-13T00:00:00.000Z NODE_ENV=production NITRO_PRESET=node-server VITE_HYPERLIQUID_TESTNET=`）：配对关（`VITE_MOBILE_PAIRING_ENABLED=false`）总量 3,311,757、静态启动 1,640,513、手机 118,314、桌面 202,683、`api-wallet` 18,282，442 chunk；配对开 3,314,259 / 1,641,561 / 118,311 / 202,623 / 18,165，443 chunk。CI 对同一头的读数比本地固定身份低 545（关）与 380（开）。
- 重定：总量基线 3,304,479 → 3,311,757（+7,278）；桌面运行时增量基线 193,129 → 202,683（+9,554，CI 下距允许量只剩 483，p30 记录已要求下次桌面增长单独重定）；手机运行时 110,580 不动（余量 2,266）。配对开构建对新基线 +2,502。
- 测量坑：第一次「配对关」构建没有显式传 `VITE_MOBILE_PAIRING_ENABLED`，读到 3,315,616、444 chunk，比配对开还大。`mobile-pairing-flags.ts` 用 `=== "true"` 判断，变量未设置时 Vite 不把它折叠成常量 `false`，配对模块留在图里成为懒加载的 `mobile-pairing-*.js`。CI 矩阵传的是字符串 `false`；以后测量也要显式传。

## 验证与限制

- `node --test scripts/check-client-bundle-budget.test.mjs`、Biome（预算脚本）、`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`、`git diff --check` 通过。
- 三次构建日志在会话暂存目录，未入库。构建在沙箱外完整跑完（预渲染 1 页）。
- 未跑 Codex CLI 预推送审查：本次只改基线数值与文档，运营方当日已说「Codex 的先不用管」。
- 真实验收与发布本身不在本记录范围。

## 后续与替代关系

- 下一处桌面运行时启动代码增长仍需按本文方法重定，而不是放大允许量；手机运行时余量 2,266。
- 上一次重定：[p30](2026-10-11-p30-pairing-build-budget-fix.md)。本记录不替代任何早先记录。

## 周整理补注（2026-10-19）

重定值通过 PR #113 合入并被 p32 发布来源采用。旧 f50e21a8 的配对开启 CI 失败与未显式传 false 的本地测量保留，不用最终 head 成功覆盖这些失败。本轮只核对预算脚本、Git 与记录，没有重新构建，也不把这次重定当作以后自动放宽预算的授权。

后续来源：[2026-10-14-cloudfront-release-p32](2026-10-14-cloudfront-release-p32.md)。

本补注为事后整理，只核对当前规范、代码、Git 和来源记录；来源测试及发布结果不作为本轮执行。查询时间和实际 head 见[本周整理](2026-10-19-weekly-memory-review.md)。
