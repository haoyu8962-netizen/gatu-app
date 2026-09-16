<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-warm-visit-startup-plan",
  "date": "2026-09-16",
  "title": "热访问启动：为什么第 2..n 次仍出现占位壳，以及经核实的改进计划",
  "kind": "task",
  "status": "recorded",
  "topics": ["static-hosting", "market-recovery"],
  "summary": "三次连续访问实测：热访问壳 0.16–0.28 s、真实终端 0.43–0.65 s（4× CPU 1.36–1.42 s，全是 JS 求值与 provider 挂载）；官方站热访问空白 1.4–1.7 s（4× 3.1–3.6 s）且资源每次重验证，照抄是回归。真正多余的等待是持久化目录丢失（尾沿节流无隐藏时写回）、24 h 播种上限、壳 HTML 每次 304。P1 三项已实现；Round 2 修复 SW 响应体克隆竞态并实现 Markets Activity 与弹窗 matchMedia 两项 P2。未发布，性能与真机复测待完成。",
  "thread": null,
  "baseCommit": "f5010ee7",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/lib/query-persistence.ts" },
    { "path": "apps/terminal/src/providers/client-root.tsx" },
    { "path": "apps/terminal/src/lib/hyperliquid/markets/market-catalog-bootstrap.ts" },
    { "path": "apps/terminal/src/lib/hyperliquid/trade-terminal-boot.ts" },
    { "path": "apps/terminal/src/config/time.ts" },
    { "path": "apps/terminal/public/sw.js" },
    { "path": "deploy/cloudfront/deploy.mjs" },
    { "path": "packages/ui/src/modal.tsx" },
    { "path": "docs/terminal-startup-performance-plan.md" }
  ],
  "supersedes": []
}
-->
# 热访问启动：为什么第 2..n 次仍出现占位壳，以及经核实的改进计划

## 背景与范围

用户问：占位壳一定要每次加载吗？首次可以理解，第 2、3、4 次不该再看到；要求对齐官方终端实践、符合编码规范、只做有明显收益的事，不确定处用 Codex 调试。本记录只做核对与规划，不改代码。方法：Playwright 无头 Chromium + iPhone 14 仿真 + 持久化浏览器 profile，对 `https://app.gatu.ai/trade/SOL` 与 `https://app.hyperliquid.xyz/trade/ETH`（经本地代理，绝对值偏悲观）各做三次连续访问，条件为不限速、4G 仿真（4 Mbps / 80 ms）、CPU 降速 4×；脚本在会话 scratchpad `mobile-frames/repeat.mjs`、`timeline.mjs`（不在仓库）。代码层结论由 Codex（`gpt-6-astra`，只读调查 + 临时 vitest 复现，已删除）与四路分析工作流交叉核实；工作流的对抗验证代理因用量限制未运行，由审查方人工核实关键事实（`config/time.ts:15`、`market-catalog-bootstrap.ts:39,86-98`、`client-root.tsx:47-51`、`deploy.mjs:17`、`packages/ui/src/modal.tsx:19-22`）。

## 结论与依据

### 实测时间线（真实终端出现时刻；壳 = 第一帧）

| 条件 | 我们 v1 | 我们 v2 / v3 | 官方 v1 | 官方 v2 / v3 |
| --- | --- | --- | --- | --- |
| 不限速 | 壳 1.06 s → 真实 2.15 s | 壳 0.24 / 0.16 s → 真实 0.52 / 0.43 s | 空白 1.45 s → chrome 3.34 s | 空白 0.49 / 0.39 s → chrome 1.72 / 1.41 s |
| 4G，v1 停留 9 s 让目录持久化 | 壳 1.01 s → 真实 5.75 s | 壳 0.19 / 0.25 s → 真实 0.46 / 0.65 s，无 `/info` | chrome 5.2 s | chrome 1.93 / 1.37 s |
| 4G，v1 渲染后约 1 s 关闭 | 同上 | 壳 0.28 / 0.22 s → 回退帧 0.79 / 0.47 s → 真实 1.25 / 1.60 s，重下 3 个 `/info` | — | — |
| CPU 4×，目录完整 | 壳 0.79 s → 真实 3.06 s | 壳 0.27 / 0.28 s → 真实 1.35 / 1.42 s，JS 0.2 s 已全部命中缓存 | chrome 4.14 s | chrome 3.60 / 3.07 s |

- 热访问 85 个 JS（1.56 MB gz）全部命中 immutable 缓存，只剩 2 个小请求；壳 HTML 因 `max-age=0` 每次 304 重验证，TTFB 120–230 ms 先于首绘。
- 中档手机上壳到真实的 1.1 s 是 CPU：4× profile 里 `vendor-tanstack-router` 求值 310 ms、React 水合与渲染约 320 ms，钱包 SDK 块合计仅 11%。
- 目录持久化：两站做法相同（react-query persist，`persisted/spotMeta`、`allPerpMetas`），我们 237 KB、官方 330 KB。Codex 复现：`trade-terminal-boot.ts:21` 在路由市场可解析时直接 ready，完整持久化目录不会等 `/info`；`market-catalog-bootstrap.ts:161` 在 `beforeLoad` 里同步播种。热访问出现"Loading markets"回退帧的唯一原因是持久化不完整：`createSyncStoragePersister({ throttleTime: 1000 })` 是尾沿节流、无 `pagehide`/`visibilitychange` 写回，渲染后约 1 s 内离开只落 1–2 份，下次 `bootstrap.ts:86-98` 整份丢弃并重拉三份（约 236 KB）。此外 `bootstrap.ts:39` 用 `RQ_CACHE_MAX_AGE_MS = 24 h` 判定，隔天回访必走冷目录路径。
- 官方实践：HTML 6.8 KB、`#root` 为空、一个同步阻塞脚本、资源无 `Cache-Control`（每次 68 个重验证请求）、无 Service Worker、无占位；chrome 与数据几乎同帧出现。热访问比我们慢 3 倍以上，唯一值得学的是"没有中间态"，这由消灭壳后的等待实现，而不是删壳。
- `hl-last-mark-v1` 只在元数据解析后作非展示回退，标题价格必须来自带接收时间的当前上下文（`docs/price-source-audit.md`、`docs/mobile-data-presentation.md`），不能用缓存价填占位。

### 计划（按收益排序；均未实施）

| 优先级 | 项 | 改动 | 预期收益（实测推导） | 风险 / 前提 |
| --- | --- | --- | --- | --- |
| P1 S | 隐藏/离开时同步写回持久化缓存 | `lib/query-persistence.ts` 新增用 `dehydrate` 直接 `localStorage.setItem` 的 flush；`client-root.tsx` 内 `useEffect` 订阅 `visibilitychange(hidden)` 与 `pagehide`，恢复成功后才允许写，幂等 | 命中时 4G 热访问真实终端 1.25–1.60 s → 约 0.5–0.6 s，回退帧消失，省 236 KB | 隐藏时同步序列化约 240 KB（4× 约 15–20 ms）；不改 buster/maxAge |
| P1 S | 目录播种年龄与 24 h 客户端上限解耦（建议 7 天） | `market-catalog-query.ts` 新增 `MARKET_CATALOG_SEED_MAX_AGE_MS`，`bootstrap.ts:39` 改用；`RQ_CACHE_MAX_AGE_MS` 保持给 provider | 隔天回访从冷目录路径（4G ≈1.25–1.6 s）变为暖路径（≈0.5 s） | 下架/改名市场用旧目录解析 <1 s 直到 staleTime 刷新；schema 变化仍靠 `RQ_CACHE_BUSTER`；需 ADR 记录 |
| P1 M | Service Worker 直出壳并后台刷新 | `public/sw.js` 增加 `navigate` 分支：应用路由用固定键缓存 200 HTML（含 CSP 头）并 `waitUntil` 后台刷新；`/join*`、带扩展名路径放行；文档路由各自 SWR；CACHE_VERSION v9 | 每次热访问首帧提前 110–230 ms，真实终端等比左移 | 发布后第一次导航看到上一版壳（旧资源仍在 S3）；需 iOS Safari 真机验证 SW 导航行为；ADR 0006 与 deploy README 同步 |
| P2 S | 首次提交少渲染四分之一子树、去掉启动强制布局 | Markets 页签包 `<Activity hidden>`；`packages/ui/src/modal.tsx` 的 `getIsMobile` 改 `matchMedia` | 4× CPU 热访问约 −110…−170 ms | Activity 下 effect 延后（与现 active=false 一致）；只改原语实现 |
| P2 M | bfcache 核查 | 真机读 `notRestoredReasons`；若被 WebSocket 阻断，在 hl-react `visibility.ts` 加 pagehide 关闭传输、沿现有 pageshow 恢复 | 返回/前进导航从热重载 0.43–1.6 s 变为即时 | 触及订阅所有权契约，需 hl-react 测试 |
| P2 M | 播种有效分片、只补拉缺失分片 | `seedPersistedMarketCatalog` 对"缺失"分片播种、损坏仍整份丢弃 | 覆盖首访在 spotMeta 前关闭的场景 | 收窄既有 fail-closed 决定，需用户确认 |
| P2 冷访问 / P3 热访问 | 启动闭包裁剪合集（第二十二检查点建议 C） | 账户页签与弹窗 `createLazyComponent`、`EmbeddedDepositAutoBridge` 仅邮箱会话挂载、`trade-terminal-page` 按面拆分、`mobile-agent-sync`/vault 路由拆出、spot 社交表按需加载 | 冷访问首波少 150–165 KB gz（4 Mbps 约 300–400 ms）；热访问 4× 仅 −55…−80 ms | 新增 Suspense 边界须预解析；弹窗闩锁保持挂载；预算与预加载清单重新基线 |
| P3 S | 把"缓存 mark 不得播种标题价格"钉进契约测试 | 文档 + 一条断言 | 无启动收益，防回归 | 无 |
| 记录项 L | 钱包 SDK 占移动启动字节 37%，只有 Provider 边界下移能移出首渲染 | 不做；需独立 ADR | 热访问 4× 仅 −0.1…−0.2 s | baseline no-go 第 3 条 |

已否决：照抄官方"空白直到全部就绪"（回归）；延长壳的浏览器 `max-age`（ADR 0006 有意选 0，SW 方案覆盖同一收益）；缓存价填标题（违反新鲜度规则）；关键 CSS 内联（只影响冷首帧）；SW 预缓存 85 个启动块（HTTP 缓存已 85/85 命中）；单独缩短 throttleTime（仍是尾沿）；P4.3 边缘地区初判（用户已否决）。

## 验证与限制

- 时间线为单样本无头仿真，只看量级；官方站经代理，绝对值偏悲观。
- P1 第 1、3 项的机制由 Codex 用真实 `MarketsProvider`/persister/bootstrap 的 vitest 复现（restoring/loading → ready 序列、快速离开只落 allPerpMetas、24 h 判定），并与"v1 停留 9 s 后 v2/v3 无 `/info`"的实测一致。
- 对抗验证代理未运行；P2 项的 CPU profile 数字（Activity、matchMedia）来自单次 4× profile，实施前应复测。
- 未做 iOS 真机测量；bfcache 在无头 Chromium 下 `notRestoredReasons` 不可用。

### 审查方复测（2026-09-16，生产构建 + `serve:spa` 静态服务器，无头 Chromium iPhone 14 仿真）

脚本 `mobile-frames/warm-verify.mjs`（scratchpad，不在仓库）依次五次访问 `http://localhost:3030/trade/SOL`，每次离开后用另一页面读取 `hl-rq-cache-v1`：

| 访问 | 条件 | 壳 | 回退帧 | 真实终端 | `/info` | 导航来源 | 离开后持久化 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 冷启动，渲染后 300 ms 导航离开 | 86 ms | 451 ms | 1,012 ms | 3 次 | 网络 | 三份目录 237 KB（写回生效） |
| 2 | 热访问（上次快速离开） | 19 ms | 无 | 242 ms | 0 | 网络（SW 首次接管前） | 同上 |
| 3 | 信封时间戳改为 2 天前 | 31 ms | 无 | 296 ms | 0（后台刷新在窗口外） | CacheStorage | 重新落盘 |
| 4 | 信封时间戳改为 8 天前 | 27 ms | 214 ms | 419 ms | 3 次 | CacheStorage | 重新落盘 |
| 5 | 热访问 | 22 ms | 无 | 248 ms | 0 | CacheStorage，TTFB 1 ms | 同上 |

改动前同一脚本在开发服务器上的对照：快速离开后的下一次访问会重新请求三份目录并出现回退帧。局域网静态服务器上壳 HTML 往返本就只有几毫秒，SW 直出的 110–230 ms 收益要在 CloudFront 上才能体现，本记录不作声明。回归：`sw-navigation-cache`（含消费响应体后仍写入缓存的用例）、`query-persistence-flush`、`market-catalog-bootstrap`（24 h–7 天播种、8 天丢弃、provider 删除过期信封后重新持久化）等 10 个文件通过；更广的移动/弹窗子集只有基线已红的 `adaptive-modal-swipe-dismissal` 失败；`pnpm typecheck`、`pnpm build`（预算 3,077,259 gz，比基线低 77,448）通过。未做：CloudFront 上的复测、iOS Safari 真机、bfcache 核查、分片播种（等用户确认）。

## 后续与替代关系

- 用户决定后按 P1 三项 → P2 顺序派 Codex 实施，本会话对抗审查并用同一脚本复测三次访问。
- 与 `docs/terminal-startup-performance-plan.md` 的关系：该计划聚焦冷访问，本记录补充热访问；若 P1 落地，应把结论并入该文档与 ADR 0005/0006。
- 相关记录：[移动占位壳与真实终端逐像素对齐](2026-09-15-mobile-shell-parity.md)。

## P1 实施检查点（2026-09-16，进行中）

- 本次用户授权仅实施 P1 三项；明确禁止安装依赖、暂存、提交、stash、移动 Git 文件与切换分支。基线 `70add4bdfe56e86588b99472ee8369dfc6dd4e56`，分支 `claude/warm-visit-startup`，初始存在未跟踪 `.build/`，保留不动。任务标识与原始会话导出未取得，不重建。
- 已核对安装源码：sync persister 的 `src/index.ts` 用 `timeoutManager.setTimeout` 做尾沿 throttle（默认 1000 ms）并以 `JSON.stringify` 保存；persist-client-core `src/persist.ts` 声明 `{ timestamp, buster, clientState }`，过期时仅 `removeClient`；React provider 恢复完成后调用 `onSuccess` 再订阅。边缘 `buildSyncCommands` 不删除资源；响应函数 CURRENT/PREVIOUS 共同生成 CSP。
- 设计先写入 ADR 0005/0006；验收计划为用户指定的 Vitest、Biome、typecheck、memory 三项与 diff check。尚未运行；不继承历史测试结果，不声称部署或真机通过。

### 实施完成与验证（同一未提交工作区）

- `query-persistence.ts` 增加与 persister 独立的同步 flush，按 QueryClient 的 WeakSet 成功恢复闩锁放行；`query-persistence-flush.tsx` 在持久化 provider 内监听 hidden/pagehide，卸载移除。重复事件只替换同一存储键，不追加、清空或变更查询；同步序列化和写入均在 try/catch 中，SSR 直接退出。
- Envelope 精确为 `JSON.stringify({ buster: RQ_CACHE_BUSTER, timestamp: Date.now(), clientState: dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery }) })`，存储键仍 `hl-rq-cache-v1`，buster 仍 `v3`；SDK 查询键、dehydrated state（含 `queries`、`mutations`、`dataUpdatedAt`）保持 TanStack 原状。测试以真实 `seedPersistedMarketCatalog` 和 `persistQueryClientRestore` 往返验证三份目录。
- `time.ts` 新增 7 天目录 seed age；bootstrap 只替换 envelope 的年龄检查并导出 seed 函数供真实互通测试，补 SSR guard。未改未来时间、buster、结构与跨目录完整性规则，未改 gcTime/staleTime/通用 24 小时 maxAge。测试证实旧目录先同步可用且 stale、正常重新拉取；provider 删除过期 envelope 后内存仍在，onSuccess 经真实节流 persister 重存。
- `sw.js` v9 用 `shell-v9` cache 中的同源 `/shell-v9` 键跨应用路径共享，`documents-v9` 按完整 URL 区分；排除 join、文件扩展名、异源与边缘服务端路径。仅存非 redirected 的 200 `text/html`，完整 Response.clone 保留安全头；命中时 waitUntil 刷新、缺失时网络回答。激活清理含 shell/documents 的旧版本缓存；未启用 navigation preload，字体/图标行为不变（仅附带 Biome 格式调整）。
- 同步更新 CHANGELOG、ADR 0005/0006、CloudFront README 与启动性能计划。当前状态为本地代码实现；未安装依赖、暂存、提交、部署或进行真实账户操作。原有 `.build/` 保留。

已运行命令（适用基线 `70add4bdfe56e86588b99472ee8369dfc6dd4e56` 上的本次未提交改动）：

```bash
pnpm --filter @gatu/terminal exec vitest run src/lib/tests/query-persistence.test.ts src/lib/tests/market-catalog-bootstrap.test.ts src/lib/tests/market-catalog-query-policy.test.tsx src/lib/tests/chart-asset-cache-policy.test.ts src/lib/tests/query-persistence-flush.test.tsx src/lib/tests/sw-navigation-cache.test.ts src/lib/tests/pwa-manifest.test.ts src/lib/tests/trade-route-boot.test.ts
pnpm exec biome check apps/terminal/src/lib/query-persistence.ts apps/terminal/src/providers/query-persistence-flush.tsx apps/terminal/src/providers/client-root.tsx apps/terminal/src/config/time.ts apps/terminal/src/lib/hyperliquid/markets/market-catalog-bootstrap.ts apps/terminal/public/sw.js apps/terminal/src/lib/tests/query-persistence-flush.test.tsx apps/terminal/src/lib/tests/market-catalog-bootstrap.test.ts apps/terminal/src/lib/tests/chart-asset-cache-policy.test.ts apps/terminal/src/lib/tests/sw-navigation-cache.test.ts
pnpm exec biome check --config-path=/tmp/gatu-warm-visit-biome apps/terminal/public/sw.js
node --check apps/terminal/public/sw.js
pnpm --filter @gatu/terminal typecheck
```

结果：Vitest 8 files / 64 tests passed；Biome 检查 9 个 TS/TSX 文件通过（默认 includes 排除 public），额外以相同配置仅放宽 includes 到 `**` 检查 SW：退出 0，保留原有 `MAX_ICON_AGE_MS` 未使用警告；SW Node 语法检查退出 0；typecheck 退出 0。

保留失败证据：初次新增测试误引用未安装的 `@testing-library/react`，Vitest 7 files / 59 tests passed、1 suite 加载失败，首轮 typecheck 同样 TS2307；已改为现有测试的 React `act`/`createRoot`，不新增依赖，复跑通过。SW 的 stdin 格式检查曾报内容未格式化；已格式化并用临时配置直接检查真实文件，上述警告为原有未使用常量。

限制：没有实施后的性能采样、iOS Safari/桌面浏览器跨发布导航验收、完整 build 或部署。历史预期提升不是本轮实测；旧目录“一秒内更新”仅正常网络预期，慢网/离线不承诺。没有偏离三项功能要求；服务端路径排除是保持边缘分类一致所需。memory 三项与最终 diff check 的结果随后追加。

最终记录校验：`pnpm memory:index && pnpm memory:check && pnpm memory:test` 依次退出 0（`Work-memory index updated.`、`Work-memory index verified.`、8 tests / 8 pass / 0 fail）；`git diff --check` 退出 0、无输出。追加本条后再次按同序运行，确保最终记录与 INDEX 一致。最终 Vitest 复跑仍为 8 files / 64 tests passed（SW 格式化后的版本）。全部改动留给 reviewer，未创建提交。

## Round 2 检查点（2026-09-16）

- 用户要求先修复 P1 SW 克隆时序，再实施两项 P2 渲染优化；禁止 install、git add/commit/stash/mv/分支切换。基线仍为 `70add4bdfe56e86588b99472ee8369dfc6dd4e56`、分支 `claude/warm-visit-startup`；起始 P1 未提交改动和 `.build/` 全部保留。当前任务标识及会话原始导出未取得。
- `navigationStaleWhileRevalidate` 只将合格 HTML 的 `response.clone()` 移到首个 await 之前，后续 put 使用 copy，其他 handler 行为不变。新增真实 Response 回归：等缓存 miss 判定后完成网络请求，页面在 refresh 完成前读取 text，确认 bodyUsed 且原响应 clone 抛错，最后断言壳仍入库。旧代码 24 pass / 1 fail（壳值 undefined），修复后 25/25 通过。
- Markets 外层新增与 Account 一致的 Activity visible/hidden 模式；保留原 wrapper classes、aria-hidden、子树 props、已有 key 和 disclosureStates，不改 Trade 同步渲染。现有 mobile-terminal、mobile-account-view、responsive-panel-layout、mobile-market-bar 测试已使用 act 或不依赖该树即时提交，本轮没有放宽断言或调整 act。
- UI 原语用延迟初始化的共享 MediaQueryList 同时提供 change 订阅和 matches 快照，仍为 max-width 767px，SSR 快照仍 false；不引入应用逻辑。
- 指定测试第一轮为 10 files：9 passed / 1 failed，97 tests passed / 3 failed。唯一红项是用户已标明的 `adaptive-modal-swipe-dismissal` 基线失败，3 项均在 DrawerContent 报 undefined element；其 Drawer mock 缺少当前 DrawerContent 使用的 Viewport，本轮不扩大修复范围。
- 初次 Biome 因 return 内的 `??=` 赋值表达式失败，已拆为赋值语句再 return；最终复检、类型检查与 memory 结果随后追加。未进行本轮 CPU 性能采样、浏览器视觉或真机验收；历史 4× CPU 收益不是本轮实测。


Round 2 实际验证命令（同一基线上的 P1 + Round 2 未提交工作区；不沿用 P1 验证结果）：

```bash
pnpm --dir apps/terminal exec vitest run src/lib/tests/sw-navigation-cache.test.ts src/lib/tests/mobile-terminal-disclosure-state.test.tsx src/lib/tests/mobile-terminal-market-bar-lifecycle.test.tsx src/lib/tests/mobile-account-view.test.tsx src/lib/tests/responsive-panel-layout.test.ts src/lib/tests/mobile-market-bar.test.tsx src/lib/tests/mobile-market-bar-provider.test.tsx src/lib/tests/adaptive-modal-dismissal.test.tsx src/lib/tests/adaptive-modal-swipe-dismissal.test.tsx src/lib/tests/modal-surface-contract.test.ts
pnpm exec biome check apps/terminal/public/sw.js apps/terminal/src/lib/tests/sw-navigation-cache.test.ts apps/terminal/src/components/trade/mobile/mobile-terminal.tsx packages/ui/src/modal.tsx CHANGELOG.md docs/terminal-startup-performance-plan.md docs/work-memory/sessions/2026-09-16-warm-visit-startup-plan.md docs/work-memory/INDEX.md
pnpm exec biome check --config-path=/tmp/gatu-warm-visit-biome apps/terminal/public/sw.js
node --check apps/terminal/public/sw.js
pnpm --filter @gatu/terminal typecheck
pnpm typecheck
pnpm memory:index && pnpm memory:check && pnpm memory:test
git diff --check
```

Biome 最终复检退出 0（3 个 TS/TSX 文件）；默认配置排除 public 和 Markdown，因此沿用 P1 的临时配置单独检查真实 SW 文件，退出 0，只有原有 MAX_ICON_AGE_MS 未使用警告。Node 语法检查与 diff check 均退出 0。Terminal typecheck 退出 0。完整 `pnpm typecheck` 退出 0（hl-react、ui、terminal 全部通过）。memory:index / memory:check / memory:test 依次退出 0，8 tests / 8 pass / 0 fail；更新最终结果后按同序再次校验。

本轮实际修改 8 个文件：`apps/terminal/public/sw.js`、`apps/terminal/src/lib/tests/sw-navigation-cache.test.ts`、`apps/terminal/src/components/trade/mobile/mobile-terminal.tsx`、`packages/ui/src/modal.tsx`、`CHANGELOG.md`、`docs/terminal-startup-performance-plan.md`、本记录和生成的 `docs/work-memory/INDEX.md`。仅 SW 测试新增消费响应体的回归用例；其他现有测试未修改。按用户要求不暂存、不提交。
