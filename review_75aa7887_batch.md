# 对抗审查报告:responsive workspace 六提交批次

- 审查对象(HEAD=757358bd):
  - `75aa7887 feat(trading): refine responsive terminal workspace`(33 文件,react-grid-layout 桌面网格 + 断点统一 + trades 重构 + balances 降噪)
  - `c0d45627 fix(trading): preserve market scope across navigation`(?scope=all search param 机制)
  - `308b7633 fix(trading): use market snapshots during stream warmup`
  - `8d6742f0 docs(sdk)` / `f4a7044d docs(ui)` / `757358bd chore(codex)`
- 审查方法:主审 + 3 个并行对抗 agent;@nktkas/hyperliquid@0.33.1 类型逐一对照;mainnet REST+wss 只读实测;SSR 生产构建 + 运行时 GET 双实证;13 组变异实验;隔离 worktree 全量测试(504 passed + 1 skip,较上批净增 31 全部对账吻合;tsc 仅既有 viem 双实例错误;biome 39 文件干净)
- 评分:9/10(历次批次最高)

---

## 一、官方 API/SDK 字段实践 —— 全部正确,无需改动

- **WsTrade.side**:`"B"→买(绿)/"A"→卖(红)` 与 SDK 权威注释(B=Bid/Buy, A=Ask/Sell)一致,wss 实测仅两值。
- **trades dedupe key** `hash:tid`→`time:coin:tid`(packages/hl-react/src/registries/subscription.ts):有实测依据 —— 10 条 recentTrades 含 1 条全零 hash(旧 key 无区分度);tid 实测全局唯一;新 key 包内外同构且有测试锁定(`"123:HYPE:456"`)。
- **keep-strings 落地**:price/size 由 Number() 改原样保串,修复旧版两个真实缺陷(`formatNumber(price, 2)` 硬编码 2 位致低价币显示 0.00;`price*size` 浮点乘法)。`getTradeQuoteSize` 用 Big 乘法;`getTradePriceDecimals` 取盘口最细分组、fallback perp 6−szd / spot 8−szd 与官方规则一致。
- **快照/流字段(308b7633)**:snapshot(allDexsAssetCtxs/spotAssetCtxs 5s 节流)与 activeAssetCtx 的 ctx 为同一 SDK 类型;spot 渲染分支不触碰 perp 独有字段(funding/oi);实测 perp ctxs 232/232、spot 按 pair.index 313/313 对齐;builder perp `xyz:` 订阅实测 ack+数据帧到达。
- **切市场竞态**:无污染路径 —— 订阅按含 coin 的 key 分区存储、refcount 归零即删 entry、`enabled:false` 直接返回 undefined;staleness watchdog 为 lazy-start(register 不启动计时),warmup 期不会误判 stale,快照 fallback 与闪烁修复体系正交。
- **docs 快照(8d6742f0)硬错误 0**:ExplorerClient 5 方法、InfoClient 24/24、ExchangeClient 26/26(validatorL1Stream 归属正确)、cancelByCloid 34 字符 hex、重连/keepAlive 默认值与 @nktkas/rews@4.1.0 源码逐项吻合。

---

## 二、需要修的问题

### 1.【中】死代码链(一次卫生提交清理)

rgl 网格替换旧 react-resizable-panels 工作区后,旧系统整链失去引用但未删:

- `apps/terminal/src/components/trade/layout/analysis-section.tsx`(0 导入方)
- `apps/terminal/src/components/trade/layout/trade-sidebar.tsx`(0 导入方)
- `apps/terminal/src/components/trade/layout/market-info.tsx`(仅被死文件 analysis-section 引用)
- `apps/terminal/src/components/ui/resizable.tsx`(仅被死文件 market-info 引用)
- `apps/terminal/package.json:53` 的 `react-resizable-panels: 4.6.0` 依赖
- `apps/terminal/src/config/layout.ts:3` 的 `PANEL_LAYOUT`(仅剩死文件引用)

同一提交顺带修两处文档:
- AGENTS.md 旧行 "Desktop resizable layouts keep their percentage-based drag behavior…"(描述的正是被替换的百分比面板系统,与 f4a7044d 新网格契约自相矛盾)→ 删除或改写为网格语义。
- design-tokens.md:新增 token `bg-grid-container` 未按 checklist 第 5 步入 Surfaces 清单 → 补一行。

### 2.【中】测试盲区 ×2(变异实证,当前全套件不设防)

- **M2**:短路 `exchange-scope.tsx:73-77` 的路由重置 effect(导航时 runtimeScope 重置回 route 派生值)后,全量 504 测试仍绿 —— `exchange-scope.test.ts` 只测 deriveScope 纯函数,本提交行为核心的另一半零覆盖。补 renderHook 测试:setScope 改 runtimeScope 后模拟 routeKey 变化,断言重置。
- **M7**:market-overview.test.tsx 的 mock 中订阅恒 undefined,只覆盖 warmup 侧 —— 将快照/流**优先级反转**(流恢复后仍显示静态快照)测试不红。补一个"流数据到达后覆盖快照"的用例(mock 订阅返回值,断言显示流值而非快照值)。

### 3.【低】docs 三处措辞级修正(8d6742f0)

- "Get explorer user details":`UserDetailsResponse` 实为用户**交易明细数组**,文案易误读;
- `userSetAbstraction` 枚举写 "unified/separate/portfolio",SDK 实际字面值为 `dexAbstraction/unifiedAccount/portfolioMargin/disabled`(无 "separate");
- reconnect 默认对象漏列 `maxEnqueuedMessages: Infinity`。

### 4.【低】杂项

- `trade-terminal-page.tsx:83` fallback 分支硬编码 `setScope("perp")` 而 URL 保留 `scope=all`,一帧不一致后被 routeKey 重置纠正 —— 可改为从 URL 派生消除瞬态。
- `marketKey` 在 market 加载前为 "default",加载后 OrderbookPanel/TradePanel 首屏额外 remount 一次。
- chart-store-benchmark 测试在高负载下 5s 超时(11 次运行 1 次抖动)—— 放宽阈值或标记 serial,与已立案的 QR 抖动同类,都在污染 CI 信号。
- 757358bd "obsolete" 措辞:实测 hyperliquid-docs MCP 端点返回 405(服务器存活,MCP streamable-HTTP 仅收 POST),弃用依据不成立。建议恢复该 server;若坚持移除,至少在 SDK 升级 checklist 中强制 docs/hyperliquid-sdk-*.md 同步(快照现为 codex 唯一官方参考,本次校验一致但升级即漂移)。
- .po 六语言各 +9 行中有 4 行是更早提交的 `#:` 引用注释搭车(lingui extract 滞后),后续提交前先跑 extract 保持目录与提交同步。

### 5.【中·包层,已单独立任务】useSubscription buffer 不随 params 重建

`packages/hl-react/src/hooks/useSubscription.ts:27-31` 只对比 method,params(coin/user)变化不重建累积 buffer,且 trades `isSnapshot` 恒 false 永不清空 —— 切市场/切钱包时旧数据会混入新订阅首帧。当前 orderbook-panel.tsx:202 与 mobile-book-view.tsx:370 靠 `key={market.name}` 强制 remount 兜底,契约隐式脆弱;任何未来不带 key 的用法即触雷。修法:hook 内按完整订阅 key(method+序列化 params,复用 query/keys.ts 的 createKey)重建 buffer + 回归测试。非本批引入(7767994d),已在任务面板立项。

---

## 三、验证通过、请勿"顺手修改"的面

- **SSR 四层实证**:rgl@2.2.3 模块顶层无裸 DOM 访问(无 window/document 下 import 成功);desktop-grid-layout.ts 读写均有 `typeof window` guard;`__root.tsx:41` ClientOnly + `measureBeforeMount` 双保险;生产构建成功且运行时 `/perp` `/spot` `/trade/BTC` 全 200(服务端输出骨架、日志零错误)。
- **断点统一是文档化契约**:1000px 含端=mobile(AGENTS.md 明文),JS `max-width:1000px` 与 CSS `min-[1001px]:` 精确对齐;骨架/order-toast/排版三处旧分裂(768 断点)本批全部修复,768–1000 区间"CSS 桌面样式 + JS 移动行为"的真实分裂点已不存在。order-toast 在该区间有 bottom nav,`+5rem` 让位正确。残留 `md:`(footer-bar,桌面 only 恒真)与 `lg:`(token-selector 列渐进)均无行为影响。
- **grid 持久化防御完备**:localStorage `trade-desktop-grid-layout-v3`;恢复前 `hasValidGeometry` + `hasCollisions` 校验,缺 key/越界/碰撞 → 整 breakpoint 回退 defaults(变异 M9/M10 被杀);v1/v2 legacy 主动清理;Reset 按钮(设置弹窗)= 清 key + reload 闭环;desktop-grid-layout.test.ts 7 用例判别力强(阈值/列数/存储 key/几何拒绝直接映射契约)。
- **f4a7044d 契约 ↔ 代码逐条互证 15/15 一致**(书/成交互斥 tab、<240px 藏标签保可及名、<200px 两列、23px 行高、1420/1421 边界实测、七个稳定 key、3px 缝隙、透明底色等)。
- **balances/positions 重构等价**:6 列/hide-small/格式化/action 绑定逐项对照一致,差异均为视觉降噪且被 3 条契约测试固化。
- **scope 机制五项全过**:刷新保持(scope 在 URL)、直链、后退同步(routeMarketName 驱动)、top-nav 乐观更新(useCallback deps 已补 scope)、SSR hydration 一致。首页默认 scope 由 perp 变 all 是**有意**行为变化(与 top-nav 默认高亮配套),备案非缺陷。
- i18n:真正新增 msgid 仅 "Desktop layout",六语言全部非空且准确。
- 顺手修复面:one-component-per-file(拆 trade-row)、三处 `scrollbar-none` 无效类全清(有契约测试锁定)、balances 的 `!important` hack 与 `text-3xs` 任意字号清除。

## 四、建议执行顺序

1. 死代码链清理 + AGENTS.md 矛盾行 + design-tokens.md 补条目(一次提交)
2. M2/M7 两个测试盲区补用例
3. docs 三处措辞修正
4. chart-store-benchmark 抖动治理
5. hyperliquid-docs MCP 恢复(或升级 checklist 补同步条款)
6. hl-react buffer 包层修复(已立任务,可独立排期)
