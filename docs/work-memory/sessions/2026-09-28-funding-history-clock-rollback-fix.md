<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-funding-history-clock-rollback-fix",
  "date": "2026-09-28",
  "title": "资金费率历史空快照的系统时间回拨修复与审查记录更正",
  "kind": "task",
  "status": "recorded",
  "topics": ["market-recovery", "pr-review"],
  "summary": "修复 Codex 审查确认的 P2：空资金费率历史改按墙钟与单调时钟中较大的年龄计算 5 分钟有效期，墙钟退到接收时间之前即过期；到期后渲染不再给出空结论，并让查询失效（页面可见时立即刷新），覆盖后台回来、切回页签与重新挂载三条路径。新增 12 个用例，其中 9 个 hook 与面板用例在修复前有 8 个失败；9 个变异全部被抓到。同时更正审查记录：基线类型检查失败系主检出残留的 TypeScript 5.9.3 所致。只有 jsdom 证据，未真实修改系统时间，未做浏览器、休眠或生产构建核对。经 PR #58 五项检查全部通过后以 merge commit 合入 dev（504e9ca0），未晋升 main、未发布。",
  "thread": null,
  "baseCommit": "4c7ee2e1",
  "commits": ["a1d93307", "47d79056", "504e9ca0"],
  "sources": [
    { "path": "apps/terminal/src/hooks/trade/use-market-funding-history.ts" },
    { "path": "apps/terminal/src/domain/market/funding-rate-history.ts" },
    { "path": "apps/terminal/src/lib/tests/use-market-funding-history.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/funding-history-panel-snapshot.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/market-funding-rate-history.test.ts" },
    { "path": "apps/terminal/src/components/funding-comparison/use-funding-comparison-controller.ts" },
    { "path": "docs/market-funding-history.md" },
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "docs/adr/0022-subscription-staleness-monotonic-clock.md" },
    { "path": "docs/work-memory/sessions/2026-09-28-claude-commits-adversarial-review.md" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/58" }
  ],
  "supersedes": []
}
-->
# 资金费率历史空快照的系统时间回拨修复与审查记录更正

## 背景与范围

用户先要求复核 Codex 对 40 个提交的[对抗审查](2026-09-28-claude-commits-adversarial-review.md)（记录在 `4c7ee2e1`）所报的两项问题，随后要求修复其中的 P2，并在审查记录里追加更正。本记录为同步记录，没有取得可核对的会话 ID。

工作在 worktree `claude/codex-issue-review-07ec3b` 进行。复核阶段在基线 `8cc8a323` 上按锁文件新装依赖；实施前快进到 `4c7ee2e1`，它的父提交就是 `8cc8a323`，只多了审查记录。修复提交为 `a1d93307`，本记录和审查记录的更正在 `47d79056`；两者经 PR #58 合入 `dev`，见文末补记。

改动范围：`use-market-funding-history.ts` 里空快照的新鲜度与刷新触发、领域计龄函数、对应测试，以及 `market-funding-history.md` 与 `mobile-data-presentation.md`。查询选项、非空历史的缓存策略和面板展示都不变。

## 结论与依据

### 复核结论

- **P2 成立。** 依据已安装的 `@tanstack/query-core` 5.90.16 源码：`timeUntilStale` 用 `Date.now()` 计算，负年龄算新鲜；`refetchOnWindowFocus` 返回 `true` 时只刷新已过期的查询；观察者的过期定时器只触发一次，到点时未过期就不再重排。临时测试（真实 hook 与 QueryClient，只替换请求与在线状态）：空快照到达后回拨一小时，后台十分钟再回前台，不刷新且为 `ready`，直到下一个前台轮询点才补请求（该次运行在回前台后第 5 分钟，最多等一个 5 分钟周期）；页面可见时切走 Funding 页签、期间回拨再切回，结果相同。只回拨两分钟时，后台那次转为空白也会丢失，但回来时墙钟年龄已满 5 分钟，仍会刷新。
- **父版本对照**：同样的用例跑在 `58e132ed^` 的 hook 上，后台路径无论是否回拨都不刷新；页签切回路径回拨后不刷新，父版本也没有轮询兜底（6 分钟观察窗口内一直只有 1 次请求）。所以这是修复遗漏，不是回归；`58e132ed` 反而把页签路径限制在了一个轮询周期内。
- **类型检查失败不成立**，详见审查记录末尾的更正：主检出解析到的是残留的 TypeScript 5.9.3，锁定的 5.7.2 下同一基线通过。

### 修复方案

- **快照带接收时间。** 查询函数返回 `{ buckets, receipt }`，`receipt` 同时记下 `Date.now()` 与 `performance.now()`。查询键不带 `persisted` 前缀、不进本地持久化，单调时间只在当前页面里比较，符合 [ADR 0022](../../adr/0022-subscription-staleness-monotonic-clock.md) 决策 8 的约束。
- **计龄。** `getFundingHistorySnapshotRemainingMs` 取两个时钟中较大的年龄；墙钟退到接收时间之前时直接按过期处理，与资金费率对比页（`db676ae4`）一致，没有沿用 ADR 0022 决策 3。理由：这里是单个 HTTP 快照，失败关闭只多一次约 20 权重的请求；而设备休眠期间单调时钟可能不计时，墙钟又被回拨时，真实年龄无从判断。
- **到期时钟。** 与对比页的 `createSnapshotFreshnessClock` 同一做法：每个接收时间一个时钟对象，经 `useSyncExternalStore` 读取，创建时在渲染中算出是否新鲜；订阅后按剩余时间设定时器，并在 `focus` 与 `visibilitychange` 时重新核对。只为空快照建时钟。
- **失效。** 到期后 effect 调用 `invalidateQueries`（`exact`、`cancelRefetch: false`），页面可见时 `refetchType: "active"`，后台时 `"none"`。TanStack 的聚焦、重新启用与挂载判断都只读它自己的 `isStale`；在公开 API 里，失效标记是唯一能让这些判断在墙钟回拨后也生效的办法。后台不发请求的既有策略由 `refetchType` 保持。

未采用的做法：

- 让 `refetchOnWindowFocus` 对过期空快照返回 `"always"`：只覆盖聚焦，页签切回与重新挂载仍不刷新。审查记录也指出只改这个选项不够。
- 把 `staleTime` 改成按双时钟计算的函数：回拨后 `dataUpdatedAt` 晚于 `Date.now()`，返回 0 也不算过期，必须返回负数，依赖 `timeUntilStale` 的实现细节。
- 检测到墙钟回拨时让所有查询失效：能一次覆盖全部 TanStack 查询，但会改变全局行为，超出本次范围。
- 在 effect 里直接 `refetch()` 而不失效：页面在后台时无法把聚焦刷新交还给 TanStack，与轮询、失败重试交织时容易形成循环。
- 实现过程中曾有两个守卫：失效前要求 `!isStale`，以及要求 `fetchStatus === "idle"`。两者同时存在时去掉前者，刷新失败后会立即重试形成循环（「刷新失败只请求一次」用例抓到）；两者都去掉则没有用例失败。核实它们只省掉一次多余的失效标记：进行中的请求不会被打断，成功后失效标记自动清除。最终两者都删除，失效标志只在快照到期时由 false 变为 true 一次。

## 验证与限制

2026-09-28，在 `a1d93307` 对应的工作树上实际运行：

- **修复前**：把 hook 换回 `4c7ee2e1` 的版本，运行最终版的 hook 与面板测试文件：8 个失败、23 个通过。两个后台用例停在 `ready`（应为 `loading`），其余 6 个停在 1 次请求（应为 2 次）。新增的非空历史用例在修复前后都通过，用来钉住既有行为。
- **新增用例**：`use-market-funding-history.test.tsx` 8 个、`funding-history-panel-snapshot.test.tsx` 1 个、`market-funding-rate-history.test.ts` 3 个。具体场景见[资金费率历史](../../market-funding-history.md)的验证记录。
- `pnpm exec biome check`（改动的 5 个 TS / TSX 文件）：通过。
- `pnpm --filter @gatu/terminal typecheck`：通过；`pnpm --filter @gatu/terminal exec tsc --version` 为 5.7.2。
- 定向 Vitest：资金费率历史回归入口的 11 个文件、移动端数据展示组 4 个文件，以及 `i18n-reactivity-contract`、`locale-format-contract`、`action-progress-label-contract`，共 18 个文件、444 个用例全部通过。
- **变异检查**：每项临时修改后运行 hook、面板、领域 3 个测试文件，之后还原并逐字比对。结果：
  - 空态条件不看到期时钟：1 个失败（重新挂载的第一帧）。
  - 去掉失效：7 个失败。
  - 只用墙钟计龄：4 个失败。
  - 去掉「墙钟早于接收时间即过期」：1 个失败（领域测试）。
  - 失效时总是刷新：3 个失败。
  - 失效时从不刷新：3 个失败。
  - 非空快照也建到期时钟：3 个失败。
  - 没有空快照也失效：1 个失败。
  - 去掉 `focus` / `visibilitychange` 重新核对：2 个失败。
- **输入路径**：jsdom；Vitest 假计时器同时伪造 `setTimeout`、`setInterval`、`Date` 与 `performance`，`vi.setSystemTime` 只改墙钟；前后台由 `focusManager.setFocused` 与脚本派发的事件切换。
- **没有做的**：真实修改系统时间、真实标签页切换、核对设备休眠期间 `performance.now()` 是否计时、浏览器或真机核对、`pnpm build`、完整终端测试。临时复现测试与变异脚本放在会话临时目录，没有进仓库。

## 补记：PR #58 与合并

2026-09-28 推送分支 `claude/codex-issue-review-07ec3b`，并开 [PR #58](https://github.com/zora4523-bot/gatu-app/pull/58)（base `dev`，创建于 15:30 UTC）。`4c7ee2e1` 此前只在本地分支 `claude/from-dev-0928` 上，随这次推送一并进入远端。推送前 `dev` 仍为基线 `8cc8a323`，不需要合并 `dev`。

合并前用 `gh` 只读核对：head 为 `47d79056`；Build terminal (pairing false)、Validate TypeScript, lint and translation catalogs、Test terminal and release tooling，以及 Terminal browser regressions 的两个分片，五项检查全部通过；`mergeStateStatus` 为 `CLEAN`，`dev` 仍为 `8cc8a323`。只核对了检查结论，没有逐项读取 CI 日志里的用例数。

没有使用自动合并：仓库的 `allow_auto_merge` 为 false；`dev` 也没有分支保护、规则集或必需检查，即使开启，GitHub 也不会等 CI。按用户「CI 通过后合并到 dev」的要求，在用户确认 CI 通过、上述核对无误后，执行 `gh pr merge 58 --merge --match-head-commit 47d79056dc4f1c38f6f4fc1cd4c04ecf87ef211e`。合并提交为 `504e9ca0`（2026-09-28 17:37 UTC，即北京时间 09-29 01:37），父提交为 `8cc8a323` 与 `47d79056`。本记录引用的三个分支提交都在 `dev` 的历史里，远端分支没有删除；未晋升 `main`、未发布。

## 后续与替代关系

- 本记录补充审查记录的 P2 项（已修复），并提供其类型检查结论的更正依据；不整体替代审查记录。
- 非空历史在回拨后重新启用时的后台刷新，仍按 TanStack 的墙钟判断，会推迟；它显示的是真实记录，不产生「没有记录」的结论，本次未改。
- 资金费率对比页与本 hook 各有一份几乎相同的到期时钟。若出现第三处需要，可考虑抽成共享工具。
- 主检出 `apps/terminal/node_modules/.bin/tsc` 的残留链接没有处理，因为该检出由其他会话使用。在那里得到的类型检查结果不代表锁定版本；将来升级到 TypeScript 5.9 及以上时，`use-exchange-funds-action-lock.test.tsx:150` 需要调整类型。
