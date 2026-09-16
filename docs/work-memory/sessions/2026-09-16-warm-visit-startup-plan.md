<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-warm-visit-startup-plan",
  "date": "2026-09-16",
  "title": "热访问启动：为什么第 2..n 次仍出现占位壳，以及经核实的改进计划",
  "kind": "task",
  "status": "recorded",
  "topics": ["static-hosting", "market-recovery"],
  "summary": "三次连续访问实测：热访问壳 0.16–0.28 s、真实终端 0.43–0.65 s（4× CPU 1.36–1.42 s，全是 JS 求值与 provider 挂载）；官方站热访问空白 1.4–1.7 s（4× 3.1–3.6 s）且资源每次重验证，照抄是回归。真正多余的等待是持久化目录丢失（尾沿节流无隐藏时写回）、24 h 播种上限、壳 HTML 每次 304。计划 P1 三项已由代码复现核实，未实施。",
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

## 后续与替代关系

- 用户决定后按 P1 三项 → P2 顺序派 Codex 实施，本会话对抗审查并用同一脚本复测三次访问。
- 与 `docs/terminal-startup-performance-plan.md` 的关系：该计划聚焦冷访问，本记录补充热访问；若 P1 落地，应把结论并入该文档与 ADR 0005/0006。
- 相关记录：[移动占位壳与真实终端逐像素对齐](2026-09-15-mobile-shell-parity.md)。
