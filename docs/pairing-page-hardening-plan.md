# 配对页加固规划（A 批）

状态：已实施、未推送、未发布（2026-09-20，分支 `fix/pairing-page-hardening`，结果见文末「实施结果」）。更正（2026-09-24）：本批已经 PR #33（`d1f31576`）与 PR #34（`8dae2522`）合入 `dev`，并随 2026-09-21 的生产发布 p22（`main` `246c57bc`，[发布记录](work-memory/sessions/2026-09-21-cloudfront-release-p22.md)）上线，`verify` 含 “pairing page headers” 检查通过；两个 `VITE_MOBILE_PAIRING_*` 开关在线上仍关闭。规划第 2 版（2026-09-19）；第 1 版经 Codex `gpt-6-astra`（只读，`medium`，约 10 万 token）对抗审查后判为「不能按原样实施」；本版逐条核实后修订，变更见文末「审查与修订」。范围是 [无票据方案](mobile-sync-ticketless-transfer-plan.md) 安全复核里无需产品决策的遗留项。两个 `VITE_MOBILE_PAIRING_*` 开关保持关闭；本批不发布、不改协议（信封 v3、TTL、去重、导入顺序不动）。

## 现状（2026-09-19 读源码与本地生产产物确认）

- 片段擦除在 `apps/terminal/src/lib/mobile-sync/bootstrap-fragment.ts`，由客户端入口 `src/client.ts` 静态导入，模块求值时执行：精确路径 `/mobile-agent-sync`（可带尾斜杠）上有 `#…` 时先 `history.replaceState` 去掉片段，再把完整 URL 留在模块闭包变量里，路由模块用 `consumeBootstrappedMobileAgentSyncUrl()` 取走一次。擦除后地址栏仍带片段则状态为 `blocked`，`client.ts` 不再启动任何后续动态导入（错误上报、水合都不加载）。
- 所以「擦除失败没有兜底」不准确：失败时应用不会水合。真正的缺口是：ADR 0010 的壳本身视觉空白，用户得不到任何说明；片段仍留在地址栏里。
- 生产构建里入口 `index-*.js` 只有 4.6 KB，但擦除代码被打进了它静态导入的 `vendor-tanstack-router-*.js`（1,194,046 字节）。ES 模块要等静态依赖全部下载、解析后才求值，所以擦除发生在这 1.19 MB 及其依赖就绪之后。
- 页面壳用内容哈希文件名引用入口（`<script type="module" async src="/assets/index-<hash>.js">`），壳与入口包的版本因此绑定：Service Worker 缓存的旧壳加载的是旧入口包，正常部署下不会出现「新壳配旧包」。
- Service Worker（`public/sw.js`）对所有应用导航用同一个缓存键保存整份 `Response`（含响应头）并 stale-while-revalidate；`/join` 被排除，`/mobile-agent-sync` 没有。后果：配对页命中缓存时拿到的是别的路由缓存下来的响应头，PR #33 在边缘加的 `no-store` / `no-referrer` 对 SW 命中的导航不生效；发布新版后第一次暖导航仍是旧壳、旧的晚擦除逻辑。
- 线上 CSP 的脚本哈希是 **enforce**（`deploy/cloudfront/edge-config.json`）：不在哈希表里的内联脚本会被拦截。哈希由 `collect-inline-script-hashes.mjs` 在构建末尾收集（壳与六个文档页，去重），`deploy.mjs functions` 先于 `sync` 发布，`sync --execute` 会拒绝线上策略未含本次哈希的构建。
- 路由器匹配路径不区分大小写（`router-core` 1.171.15 `caseSensitive ?? false`，项目未设置），而 `bootstrap-fragment.ts`、路由模块的 `getSpaLocationScrubState` 与 `sync-core.ts` 的 `getMobileSyncCleanUrl` 三处都按精确大小写比较。`/Mobile-Agent-Sync#…` 会命中配对路由，但引导阶段判为 `not_applicable`：片段不被擦除，应用带着片段正常水合。
- `routes/mobile-agent-sync.tsx` 第 206–211 行的 effect 在清理时把 `loadedSync.keyBytes` 清零。开发模式 StrictMode 的 effect 重放（清理 → 再执行，state 保留）之后，state 里仍是同一个已清零的对象，导入必然 `decrypt_failed`。只影响开发环境。`initialHashCaptureRef.current = null` 不是成因。
- 配对预检在默认 dex 与现货都为空时调用 `info.perpDexs()`（权重 20）再逐个读 dex（每个 2），没有缓存。

## 官方终端的做法（2026-09-19 抓取 `app.hyperliquid.xyz` 公开产物，只读）

- 页面壳唯一的内联脚本是 `window.process` 垫片，没有处理配对参数的脚本。
- 入口包 `index-BFOYdjEK.js` 与 `config-p_qaZZV-.js` 里，`link` 查询参数只在应用内扫码器的回调里解析（`` .get(`link`) `` 在两个包里只出现这一次）；没有代码在直接打开 `/trade?link=…` 时读取 `window.location`，也没有代码把它从地址栏移除。其余懒加载 chunk 未逐个检查。
- 结论：官方不擦除，且明文密钥在查询串里。这一项没有官方做法可以对齐；ADR 0015 已决定不照搬官方的凭证设计。本批遵循的规范是 AGENTS.md 的签名、启动渲染与数据展示契约，ADR 0015、ADR 0007（CSP 内联哈希）与 ADR 0010（启动渲染）。

## 目标与不做的事

1. 含密钥的片段在页面壳解析到 `<head>` 里的内联脚本时就离开地址栏，不再等 1.19 MB 的 chunk。
2. 擦除失败、或交接异常时，用户看到明确的多语言说明；应用仍不水合。
3. 路由器会匹配的所有路径形式都被擦除；不该导入的路径形式被擦除并拒绝。
4. 配对导航不经过 Service Worker 的共享壳缓存。
5. 开发模式下配对导入可用。

**威胁模型的边界**：本批只缩短片段留在地址栏的时间，并让异常可见。它**不能**防御在页面主世界里先于我方代码执行的脚本（恶意扩展的主世界注入、被篡改的响应）：这类脚本今天可以直接读 `location.hash`，改动后可以抢先调用交接函数。JS 字符串置空也不等于物理擦除内存。F1（系统相机把完整链接写进浏览器历史）仍需产品决策，不在本批。

不纳入本批并说明理由：
- **Import 前显示 owner / Agent 地址**（安全复核 P3）：需要新增一个「本地解密后、远端核验前」的审阅阶段与文案，属于交互设计，另行决策。
- **预检的 dex 列表缓存**（第 1 版的设计 5，已撤回）：用缓存的列表得出「无余额」违反「空结论需要完整、当前、成功的快照」；而缓存真正能省请求的场景恰恰是空账户反复打开弹窗。按权重 20 + 2N、IP 限额 1200/分钟估算，要每分钟打开约 30 次才会触限，人手操作不可达，所以不处理，正确性优先。

## 设计

### 1. `<head>` 内联擦除脚本（单一实现，生成后提交）

- 擦除逻辑只写一份：`lib/mobile-sync/pairing-location.ts` 里的自包含函数（不引用模块作用域、不导入任何东西），输入 `location` / `history` 的最小接口，输出 `{ status, capturedUrl, invalid }`。`bootstrap-fragment.ts` 直接调用它。
- 内联脚本由生成器从同一个源文件得到：用 `vite` 导出的 `transformWithEsbuild`（`vite` 锁定 7.3.0，esbuild 版本由 lockfile 固定）去类型、压缩成 IIFE，写入提交的 `head-scrub-script.generated.ts`。一个测试断言提交的字符串等于重新生成的结果（与 `deploy/cloudfront/functions/terminal-response.js` 的「渲染后提交 + 相等性测试」同一做法），并断言产物不含 `</script`、不含未绑定标识符。esbuild 升级导致输出变化时测试变红、重新生成即可；CSP 哈希由构建自动收集，TanStack 流屏障的哈希本来就逐次构建变化，哈希变化不是问题。
- 位置：`RootDocument` 里保持 `<HeadContent />`（含 `<meta charset>`）在最前，擦除脚本紧随其后、位于主题引导脚本之前，是文档里**第一个可执行脚本**，也先于 `<Scripts />` 输出的模块入口标签。内联经典脚本在解析到时同步执行，`async` 模块入口只能在它自己的标签被解析之后执行，所以顺序有保证。
- 交接用一个带**非秘密状态**的对象，而不是会自删的裸函数：`window.__gatuPairingBootstrap = { v: 1, status, take }`，其中 `status` 为 `"none" | "captured" | "invalid" | "blocked"`，`take()` 第一次返回 URL 并把闭包置空，之后返回 `null`；对象用 `Object.defineProperty` 定义为不可写、不可配置。
- `bootstrap-fragment.ts` 求值时：
  - 对象不存在（脚本被 CSP 拦截、极旧的壳）→ 自己执行同一个擦除函数，行为与今天一致。
  - `status === "captured"` 但 `take()` 返回空、或对象形状 / 版本不符 → 视为 `blocked`：有人抢先消费或环境异常，不水合，显示第 2 节的说明。
  - `status === "blocked"` → `blocked`。
- 非配对路径上脚本第一步就返回 `status: "none"`；整体包在 `try/catch` 里，但**配对路径上的异常映射为 `blocked`，不吞掉**。

### 2. 擦除失败 / 交接异常的说明页

- `client.ts` 在 `blocked` 时调用 `renderPairingBlockedPage()`：沿用 `bootstrap-error-page.ts` / `bootstrap-error-copy.ts` 的轻量机制（读取持久化语言、六种语言、RTL），不加载 Lingui 运行时。这是终止性的安全错误反馈，不是 ADR 0010 禁止的启动占位。文案要点：此链接无法安全载入；关闭此标签页；不要分享该链接；回到桌面重新生成二维码。
- 同时尽力让片段离开地址栏：`window.location.replace("/mobile-agent-sync?notice=unsafe-link")`，整体 `try/catch`。不需要 `sessionStorage` 防循环标记——目标地址没有片段，重新加载后擦除判为不适用，不会再次 `blocked`；`replace` 无效或抛错时页面停留在说明页。
- 路由模块读到 `notice=unsafe-link`：先 `clearMobileSyncDraft()`，**不恢复任何草稿**（否则可能显示此前另一份二维码），显示「本次链接无法安全载入，请重新扫描」，随后用 `replaceState` 去掉该参数。再次扫描新的二维码不受影响。
- 四种状态：跳转前（说明页）→ 跳转失败（停在说明页，片段可能仍在地址栏，文案已要求关闭标签页）→ 跳转后（配对页的重新扫描提示）→ 新二维码（正常流程）。

### 3. 路径接受规范

三处判断（擦除函数、`getSpaLocationScrubState`、`getMobileSyncCleanUrl`）统一调用同一个分类函数，写回地址栏的永远是规范小写路径 `/mobile-agent-sync`：

| 路径（只解码一次） | 分类 |
| --- | --- |
| `/mobile-agent-sync`、带尾斜杠、任意 ASCII 大小写、百分号编码后解码得到上述形式（如 `%4Dobile-agent-sync`） | 配对路径：擦除并允许导入 |
| 解码后以 `/mobile-agent-sync/` 开头的更深路径（含 `%2F` 解码出的斜杠） | 擦除并拒绝导入 |
| 无法解码（畸形 `%`）且原始路径不区分大小写地以 `/mobile-agent-sync` 开头 | 擦除并拒绝导入 |
| 其它（含 `;` 路径参数、非 ASCII 的大小写变体如 `ſ`） | 不是配对路径，不处理；路由器也不会把它们匹配到配对路由 |

比较用不带 `u` 标志的 `i` 正则，只做 ASCII 大小写折叠；不递归解码；不剥离 `;`。

### 4. Service Worker 绕过配对导航

- `sw.js` 的导航分支把 `/mobile-agent-sync`（不区分大小写，去尾斜杠）加入直接放行的列表，和 `/join` 一样不拦截：配对页永远走网络，拿到边缘函数写的 `no-store` / `no-referrer` 与最新的壳（含内联擦除脚本）。离线时配对页打不开，配对本来就需要网络。
- 迁移限制：已安装的旧 SW 在下一次更新激活前仍会用共享壳响应配对导航；`sw.js` 为 `no-store` 且注册用 `updateViaCache: "none"`，通常下一次访问即更新。

### 5. dev StrictMode

- 根因是「effect 清理里清零」与「state 保留同一个对象」不相容。改法：把第 206–211 行的清理改为**可取消的延迟清零**——清理时登记一个微任务，effect 再次执行且对象相同时取消它；真实卸载与切换对象时照常清零。过期、拒绝、导入成功、丢弃等显式路径上的清零不变。
- 明确其有限保证：`keyBytes.fill(0)` 只清这一份字节，`encodedKey` 与 sessionStorage 草稿另有生命周期（由草稿的有界持有时间约束）；文档不把它描述成「全部密钥已释放」。配对路由不在 `Activity` 内；若以后放进去，需要在恢复可见时从草稿重新取字节。
- 测试不止一例 StrictMode 成功：真实卸载后字节为零、切换到另一份 sync 后旧字节为零、过期与丢弃后为零、StrictMode 重放后仍可导入。

## 备选方案（未采用）

- 手写字符串脚本 + 与 TS 实现的对等测试（第 1 版）：两份实现会一起错，对等测试发现不了共同缺陷。
- 对打包后的函数调用 `fn.toString()` 注入：产物可能引用模块作用域辅助符号。
- 只保留内联脚本、删除 `bootstrap-fragment.ts` 的擦除：脚本被 CSP 拦截时就没有任何擦除，违反失败关闭。
- 配对页使用独立的、不含主包的 HTML：需要新的预渲染目标、路由与边缘改写，代价大得多。
- 会自删的一次性全局函数（第 1 版）：自删后「从未携带凭证」与「已被别人消费」无法区分，会退化成静默失败。

## 验证标准

- 单元：路径分类表逐行；擦除函数对 `replaceState` 抛错、`replaceState` 无效、查询串错放凭证、嵌套路径、无片段；交接对象只可取一次、不可改写；`captured` 但取不到 → `blocked`；生成的脚本与提交一致，且在 `node:vm` 的伪造 `window` 里执行得到与 TS 调用相同的结果（这是对生成管线的检查，不替代上面的独立预期断言）。
- 路由：大小写与编码变体的直达加载能进入 Import；嵌套与畸形路径被擦除并显示无效；`notice=unsafe-link` 不恢复草稿并被移除；StrictMode 下导入成功，以及第 5 节列出的四种清零。
- 说明页：`blocked` 时不加载 `client-hydrate`，六种语言与 RTL 各渲染一次，`location.replace` 抛错时不再抛出。
- Service Worker：配对导航不调用 `respondWith`（含大小写与尾斜杠变体）；其它应用导航行为不变；`CACHE_VERSION` 与现有 SW 测试保持通过。
- 产物级断言：`pnpm build` 末尾新增检查——`_shell.html` 与六个文档页里，擦除脚本是文档中第一个 `<script>`，且位于模块入口标签之前；不满足则构建失败。
- CSP：`collect-inline-script-hashes` 的清单包含新脚本的哈希；用真实的 current / previous 哈希集合渲染 viewer-response 函数并断言 ≤ 10 KB（现有测试只用 2 + 1 个假哈希）。按 6,193 B 基础体积、每个带引号哈希 53 B 加分隔符估算，两版各 11 个不重叠哈希约 7.4 KB。
- 浏览器（因果验证，不比较时间戳）：生产构建经 `scripts/serve-spa-static.mjs`，无 SW 的新上下文，Playwright 拦截并**暂停**入口模块的响应；在入口尚未放行时断言地址栏已无片段；放行后断言原凭证被准确交接并进入 Import。另测：交接被页面脚本抢先消费 → 说明页；入口永不加载 → 片段仍已擦除。监听 `securitypolicyviolation` 与 hydration 可恢复错误。只用人工测试凭证，不把链接写进 trace / HAR。本地静态服务不下发 CSP，enforce 模式下内联脚本是否放行只能在下一次 `functions` 发布后由 `verify` 确认。
- 回归：`pnpm test:cloudfront`、启动渲染组、钱包与引导组、i18n 组、全量 Vitest、`pnpm build` 预算。
- 实施时同步：`docs/mobile-sync-ticketless-transfer-plan.md` 安全复核表、ADR 0015、`docs/runtime-guardrails.md`（SW 与启动引导）、`deploy/cloudfront/README.md`（SW 一节）、CHANGELOG、任务记录。

## 风险

- 内联脚本在所有路由执行：非配对路径第一步返回；用例表覆盖；产物级断言保证位置。
- 生成管线依赖 esbuild 输出稳定：由 lockfile 固定，变化时相等性测试变红。
- 旧 SW 的迁移窗口内配对页仍可能拿到旧壳：旧壳执行旧的（晚）擦除逻辑，行为不比今天差。

## 审查与修订（第 1 版 → 第 2 版）

Codex 报告 1 项条件性 P0、5 项 P1、4 项 P2、1 项 P3。逐条核实后的处理：

1. **交接函数不是访问控制、自删后无法区分状态（P0，成立）**：改为带非秘密状态的不可改写对象，`captured` 却取不到即失败关闭；新增「威胁模型的边界」一节。它指出的「新壳配旧入口」在正常部署下不会发生（壳按内容哈希引用入口，已用本地产物确认），Codex 自己也标注了未核实。
2. **SW 跨路径复用响应头（P1，成立，已读 `sw.js` 确认）**：新增设计 4。
3. **缓存的 dex 列表不能用于「无余额」结论，「重试即恢复」不成立（P1，成立）**：撤回该设计并写明理由。它同时纠正了我提示词里的猜测：持久化数据保留原 `dataUpdatedAt`，`staleTime` 对几小时前的数据仍然有效。
4. **微任务方案的保证有限（P1，部分采纳）**：保留可取消的延迟清零，但写明有限保证、补四类清零测试、记录 `Activity` 前提；未采纳「导入时从草稿取操作专属字节」的重构，它改变密钥生命周期的范围超出本批。
5. **清洁导航后可能恢复另一份旧草稿（P1，成立）**：改用查询标记、清草稿、不恢复；去掉不必要的 `sessionStorage` 防循环标记。
6. **时间戳比较不能证明因果（P1，成立）**：改为暂停入口响应的因果验证。
7. **CSP 已是 enforce、体积估算（P2，成立，已读 `edge-config.json` 确认）**：更正现状与估算，增加真实哈希集合的体积断言。
8. **路径规范不完整（P2，成立）**：新增设计 3 的分类表，并把 `sync-core.ts` 的第三处判断纳入。
9. **脚本不应先于 `<meta charset>`、说明页需多语言（P2，成立）**：已改。
10. **Import 前身份展示悬空（P2，成立）**：明确排除并说明理由。
11. **对等测试证明不了共同正确（P3，采纳）**：改为单一实现 + 生成后提交。

第 1 版里我自己写错、已更正的两处：把入口包说成约 1.5 MB（实际 4.6 KB，擦除代码在 1.19 MB 的 `vendor-tanstack-router` 里）；把 CSP 说成 report-only。

## 实施结果（2026-09-20）

按第 2 版实施，任务记录见 [2026-09-20-pairing-page-hardening](work-memory/sessions/2026-09-20-pairing-page-hardening.md)。与规划的出入：

- **路径规范化**：规划写「写回地址栏的永远是规范小写路径」。实现保留了原有行为——路径恰好是 `/mobile-agent-sync` 或带尾斜杠时原样保留，其它被接受的写法（大小写、百分号编码）才改写为规范路径。这样不改变已有直达链接的表现。
- **产物级断言放行无脚本文档**：第一次真实构建时断言报 `404.html has no script element`。该页是纯静态未找到页，没有任何脚本，不存在「别的脚本先执行」的问题，规则改为：文档里有脚本时，第一个脚本必须是擦除脚本。
- **跳转目标的循环防护**：规划认为清洁导航后不会再次 `blocked`。对「交接对象损坏」这类在新页面上依然存在的原因并不成立，所以加了一条无存储的防护：浏览器已经在提示页地址上时不再跳转。
- **清零测试少于规划**：规划列了四类清零用例。实际新增的是「StrictMode 重放后仍可导入」与「真实卸载后字节为零」两条；切换到另一份 sync、过期、丢弃这三条走的是原有的显式清零路径，本次没有改动它们，也没有为它们新增用例。
- **StrictMode 的复现条件**：React 只在 StrictMode 位于挂载时被放置的那个 fiber 之上（或就是它）时才重放 effect。测试工具把 `I18nProvider` 包在外层会让重放不发生，第一版测试因此在未修复的代码上也能通过；改为 StrictMode 在最外层后，两条用例在未修复的代码上为红、修复后为绿。

验证（本地，生产构建用的是本机 `.env.local`，两个配对开关为开）：

- 单元与组件：`mobile-sync-pairing-location`（45）、`mobile-sync-bootstrap-fragment`（25）、`mobile-agent-sync-route`（24）、`bootstrap-error-page`、`client-bootstrap-error`、`sw-navigation-cache` 等通过；`typecheck` 通过。全量 Vitest 单独运行两次：第一次 578 个文件里 `portfolio-overview` 有 2 个用例断言失败（`$0.00` 对 `$100.00`），该文件单独运行 20/20 通过、与配对无关，此前记录里它就是全量并发下的偶发文件；第二次 577 通过、1 跳过，6,484 用例通过、0 失败。
- `pnpm test:cloudfront` 41 通过；`scripts/` 下四个 node 测试文件 23 通过。
- `pnpm build`：预算全部通过（`trade-terminal-page` 126,297 B，上限 127,242 B）；内联脚本哈希由 10 个变为 11 个；用两组各 11 个不重叠哈希填充 viewer-response 函数为 7,379 B（上限 10,240 B）；`check-shell-head-scrub` 对 8 个预渲染页通过。
- 浏览器因果验证（`apps/terminal/tests/browser/pairing-head-scrub.mjs`，Chromium，生产构建经 `serve-spa-static.mjs`，无 Service Worker 的新上下文，一次性测试链接）9 项全过：入口模块的响应被暂停时地址栏已无片段、头部脚本状态为 `captured`；放行后进入「Desktop QR loaded」；无 CSP 违规事件；链接被页面脚本抢先 `take()` 时应用被阻断、给出说明且没有载入任何内容，随后到达干净的配对页；入口永不加载时地址栏保持干净。
- 未验证：线上 enforce 模式下新内联脚本是否被放行（本地静态服务不下发 CSP；需下一次 `functions` 发布后由 `verify` 与 `csp-coverage.mjs` 确认）；真机系统相机路径；旧 Service Worker 迁移窗口内的表现；说明页的印地语、西班牙语、法语、阿拉伯语文案未经母语者校对。
