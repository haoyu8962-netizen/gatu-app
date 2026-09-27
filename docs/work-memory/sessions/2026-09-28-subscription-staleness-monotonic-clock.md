<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-subscription-staleness-monotonic-clock",
  "date": "2026-09-28",
  "title": "订阅过期巡检改用单调时钟计龄",
  "kind": "task",
  "status": "verified",
  "topics": ["market-recovery"],
  "summary": "修复 Codex 在资金费率对比审查中复现的缺口：系统时间回拨后停止更新的订阅一直不被判过期。每帧携带墙钟与单调两个接收时间，巡检、隐藏缓冲提交、前台恢复过期与诊断都取两者年龄中较大者；节流投递改用单调时钟（原版在回拨后会把订单簿投递推迟约一小时，开发服务器对照已复现）。lastMessageAt 保持墙钟，阈值、订阅键与恢复路径不变；新增 ADR 0022。typecheck、Biome、订单簿与移动数据展示回归组、订阅套件与完整单测 601 文件 6876 项通过，10 个变异全部被抓住。资金费率对比文档与 perpContextsLive 测试在分支 claude/sdk-api-review-51a3ea，快进被权限拒绝，未改动。",
  "thread": null,
  "baseCommit": "e3b5dd82",
  "commits": [],
  "sources": [
    { "path": "packages/hl-react/src/internal/websocket/staleness.ts" },
    { "path": "packages/hl-react/src/internal/websocket/frame-receipt.ts" },
    { "path": "packages/hl-react/src/internal/websocket/batch-updater.ts" },
    { "path": "packages/hl-react/src/store.ts" },
    { "path": "packages/hl-react/src/hooks/utils/useSub.ts" },
    { "path": "packages/hl-react/src/subscriptions/l2-book-transport-pool.ts" },
    { "path": "apps/terminal/src/lib/tests/staleness.test.ts" },
    { "path": "apps/terminal/src/lib/tests/store-staleness.test.ts" },
    { "path": "apps/terminal/src/lib/tests/use-sub.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/throttled-updater.test.ts" },
    { "path": "apps/terminal/src/lib/tests/l2-book-transport-pool.test.ts" },
    { "path": "docs/adr/0022-subscription-staleness-monotonic-clock.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/adr/0003-orderbook-transport-isolation.md" }
  ],
  "supersedes": []
}
-->
# 订阅过期巡检改用单调时钟计龄

## 背景与范围

同步记录。用户转述 2026-09-28 的只读 Codex 审查（分支 `claude/sdk-api-review-51a3ea`，该分支 `docs/funding-comparison.md` 第 4 节）：共享巡检 `createStalenessWatchdog` 用 `Date.now() - lastMessageAt > thresholdMs` 判断过期，回拨一小时再静默 10 分钟，`pac` 与 `allDexsAssetCtxs` 的 `isStale` 仍为 false，资金费率对比页继续按旧持仓量显示并排序。任务：梳理 `arm` / `markFresh` / `getLastMessageAt` / `lastMessageAt` 的调用方与接收时间来源，决定时钟方案，做不改阈值、订阅键和恢复行为的最小修复，补巡检与至少一个消费方的回拨测试，更新 `docs/runtime-guardrails.md` 与 `docs/funding-comparison.md`，提交不推送。

基线：worktree 分支 `claude/eloquent-swartz-534241`，`e3b5dd82`（PR #45 合入 `main` 的提交）。`docs/funding-comparison.md` 与 `useMarketsInfo().perpContextsLive` 只存在于 `claude/sdk-api-review-51a3ea`（以 `e3b5dd82` 为祖先）。尝试 `git merge --ff-only claude/sdk-api-review-51a3ea` 被自动模式的权限分类器拒绝（理由为修改共享资源），因此本次在 `e3b5dd82` 上完成，没有改动这两处，消费方测试改用真实 `useSubscription` 订阅同样两条频道并断言 `perpContextsLive` 使用的条件。

## 结论与依据

### 调用方与接收时间来源

| 位置 | 用法 | 时间来源（改前） |
| --- | --- | --- |
| `store.setSubscriptionData` → `watchdog.markFresh` | 每帧标记新鲜并读出判定 | `useSub` 的 `takeFrameReceivedAt(data) ?? Date.now()`（节流与直接两条路径） |
| `store` 订阅确认 → `watchdog.arm` | `l2`、`l2Book`、`fastAssetCtxs`、`activeAssetCtx`、`activeSpotAssetCtx` 的首帧期限 | `runtime.lastMessageAt`，没有帧时取当前时刻 |
| `store.recoverFreshSnapshots` → `watchdog.arm(key)` | 前台恢复前重置期限 | 当前时刻 |
| `markFrameReceivedAt` | 订单簿传输池回放帧 | `receivedAtWall`；池内已有 `performance.now()` 接收时间但未传出 |
| `watchdog.getLastMessageAt` | 无生产调用方，只有测试 | — |
| `runtime.lastMessageAt` | 隐藏缓冲提交、前台恢复过期检查、恢复事件 `staleForMs`、调试快照 | 同 `setSubscriptionData` |
| `SubscriptionResult.lastMessageAt`（墙钟） | `isLiveMarkPriceReady` / `getOrderEntryReferencePrice`、`funds-execution-guard`、`reduce-only`、`liquidation`、逐仓保证金、逆向提交、`use-asset-leverage`、`spot-swap-modal` 的年龄检查 | 与 `Date.now()` 比较，负年龄一律按不新鲜处理 |
| 同上 | `order-reconciliation`、`twap-reconciliation` 的 `lastMessageAt <= requestStartedAt` | 墙钟先后比较，回拨后等待新帧（不确认） |

`isLiveExecutionPriceReceiptFresh` 默认用 `performance.now()`，喂给它的是 REST 请求时记下的 `performance.now()`，与 `lastMessageAt` 无关。

### 采用的方案

保留墙钟 `lastMessageAt` 供显示与下游守卫，过期判断取单调年龄与墙钟年龄中较大者（`getReceiptAgeMs`），负的墙钟年龄单独不算过期；节流器改用单调时钟。完整取舍见 [ADR 0022](../../adr/0022-subscription-staleness-monotonic-clock.md)。

- 选「两者取大」而非只用单调时钟：变异检查中只用单调时钟会让 `store-resume.test.ts` 的两条前台恢复测试（它们用 `vi.setSystemTime` 前跳墙钟模拟后台时长）和新的前跳测试失败，说明墙钟条件承担了既有行为；`performance.now()` 在设备休眠期间是否计时因平台而异，本次未核对。
- 不采用「负年龄即过期」：变异检查中它让「回拨后持续推送仍新鲜」测试失败，`pac` 在回拨后第一次巡检（5 秒）就被判过期，意味着回拨会把所有周期流同时判过期并触发共享 socket 重连。
- 节流器：`createThrottledUpdater` 用墙钟计间隔，回拨时若没有挂起的定时器，下一帧的间隔为负，投递被排到约一小时后。只修巡检会让这些流在回拨后持续过期约一小时，所以一并改为 `performance.now()`，首条仍立即投递（`lastCallTime` 初值改为 `undefined`，否则页面启动 5 秒内的首帧会被推迟）。
- 订单簿回放帧经 `markFrameReceivedAt(frame, receivedAt, monotonicReceivedAt)` 交出两种接收时间，`takeFrameReceivedAt` 返回 `FrameReceipt`；更新了 ADR 0003 对应两条描述。

## 验证与限制

工作区基线 `e3b5dd82` 加本次改动，2026-09-28，依赖由 `pnpm install --frozen-lockfile --prefer-offline` 装在本 worktree：

- 新测试先在原版源码上运行（7 个源文件取 `HEAD` 版本）：13 项失败，即全部回拨用例与改了返回形状的回放接收时间用例；「回拨后持续推送仍新鲜」与「前跳仍过期」两项在原版上通过，它们用于排除两个备选方案。
- 变异检查（逐个改动后运行 7 个相关测试文件，再从备份还原并用 `cmp` 核对）：墙钟单独计龄 8 项失败；只用单调时钟 3 项失败；负年龄即过期 5 项失败；节流器改回墙钟 3 项失败；隐藏缓冲提交改回墙钟 1 项失败；前台恢复过期改回墙钟 2 项失败；订阅确认时不传单调接收时间 1 项失败；`useSub` 节流路径不传单调时间 1 项失败；传输池回放改用交付时的单调时间 2 项失败；`setSubscriptionData` 不把单调时间交给巡检 1 项失败。
- `pnpm typecheck`（hl-react、ui、terminal）通过；`pnpm exec biome check` 对 12 个改动的 TS/TSX 文件通过（先用 `--write` 修正了两个测试文件的格式）。
- AGENTS.md 订单簿回归组 11 个文件 181 项通过；移动端数据展示回归组 4 个文件 74 项通过；订阅与 WebSocket 相关 14 个文件（含 `use-markets-info-subscriptions`、`market-price`、`store-*`、`use-sub`、`websocket-*`）169 项通过、1 项跳过（`websocket-soak` 默认跳过）。
- 完整单测 `pnpm --filter @gatu/terminal test`：601 个文件通过、1 个跳过，6876 项通过、1 项跳过。
- 浏览器（应用内浏览器，`localhost:3005` 开发服务器，cwd 为本 worktree 的 `apps/terminal`，`apps/terminal/.env.local` 从主检出复制、未纳入版本控制）：打开 `/trade/BTC`，用 `javascript_tool` 把页面的 `Date.now` 覆盖为真实时间减一小时，经 `window.__hl_debug()` 读取订阅状态。本次代码：47 秒后 `pac`、`sac`、`l2Book`、`bbo`、`fastAssetCtxs`、`activeAssetCtx`、`allMids`、`trades`、`webData3` 都已用回拨后的时间更新，没有过期，恢复事件为 0。对照（只把 `batch-updater.ts` 换回原版，确认开发服务器下发的源码含 `Date.now()`）：46 秒后 `l2Book` 与 `bbo` 没有更新，`l2Book` 过期并记录一次 `stream-stale/resubscribe`（`staleForMs` 约 15193），`bbo` 无过期阈值、未标记；`pac`/`sac` 这次仍有更新。之后还原文件、重新加载确认 `Date.now` 为原生实现、没有过期流，停止服务器。输入路径是页面脚本覆盖 `Date.now`，不是修改系统时间；浏览器中已登录的账户没有进行任何操作。
- 未覆盖：真实修改系统时间、设备休眠与唤醒、页面静默流（断网）在浏览器中的过期转换，这些只在单元与集成测试中覆盖。没有运行 `pnpm build` 与浏览器回归套件。

## 后续与替代关系

- 不替代任何记录。
- 待合入 `claude/sdk-api-review-51a3ea` 后处理：删除 `docs/funding-comparison.md` 第 4 节「这条上界依赖共享巡检……已另列后续任务」的回拨说明，改为引用 ADR 0022；同步第 10 节剩余限制里「这个上界只在系统时钟不回拨时成立」一句；在 `use-markets-info-subscriptions.test.tsx` 按真实 store 补 `perpContextsLive` 的回拨用例（本次在 `use-sub.test.tsx` 对 `pac` / `allDexsAssetCtxs` 断言了同一条件）。
- 仍用墙钟、本次未改：`transport-monitor.ts` 的 socket 静默检测（回拨后失效到墙钟追上，巡检的多流重连仍可恢复）、`l2-subscription-gate.ts` 的截止时间、`order-reconciliation` / `twap-reconciliation` 的先后比较与期限定时器（回拨后撤单确认会等待）。
- 下一次先查：ADR 0022、`docs/runtime-guardrails.md` §6、`packages/hl-react/src/internal/websocket/staleness.ts`。
