# CSP 第二步：内联脚本哈希（计划）

- 状态：B 阶段已执行（2026-09-14，决策见 [ADR 0007](adr/0007-csp-report-only-hardening.md) 决策 5），C 阶段待观察期后。执行偏差：发布不再读取哈希文件而是直接从产物计算（文件仍写到 `.output/edge/` 供查看）；每组 10 个的上限改为函数 10 KB 的字节上限；紧急开关是把 `cspScriptHashes` 改回 `report-only`，没有单独的 `unsafe-inline` 档；哈希必须按 HTML 解析器看到的文本计算（U+0000 → U+FFFD、CR → LF），首次发布按文件字节算的流屏障哈希浏览器不认，由浏览器覆盖脚本发现后修正。前置：ADR 0007 第一步（report-only 候选策略与报告接收器）已于同日上线。
- 目标：CloudFront 目标的主文档策略把 `script-src` 从 `'self' blob: 'unsafe-inline' https://challenges.cloudflare.com` 收紧为 `'self' https://challenges.cloudflare.com` 加预渲染页内联脚本的 SHA-256 哈希，先以 report-only 观察，再强制。图表 iframe 策略（`charting_library/`、主题样式）与 `style-src` 不在本步范围。
- 执行后：ADR 0007 记录最终决策，本文只保留计划与执行时的偏差。

## 现状（2026-09-14，构建 `fc0fc240` / `cloudfront-2026-09-14-p7` 的产物）

| 事实 | 数据 |
| --- | --- |
| 预渲染页 | 8 个：`404.html` 无脚本；`_shell.html` 与 6 个文档页各 3 段内联脚本、1 个外链模块脚本 |
| 内联事件处理器 / `javascript:` URL | 0 / 0（不需要 `'unsafe-hashes'`） |
| 主题引导脚本 | 264 B，来自 `routes/__root.tsx` 的 `THEME_BOOTSTRAP_SCRIPT`，位于 `<head>`，7 页相同 → 1 个哈希，只随源码变化 |
| TanStack Start 流屏障 `$tsr-stream-barrier` | 1.4–1.7 KB，位于 body 骨架之后、模块脚本之前；内含路由清单（资源文件名）与匹配记录的 `u`（预渲染时刻的时间戳）→ 每页不同，且**每次构建都变** → 7 个哈希 |
| 收尾脚本 | 80 B（`$R[13]` 壳版与 `$R[16]` 文档版）→ 2 个哈希，随流屏障结构变化 |
| 去重后的哈希数 | 10 |
| 运行时脚本注入 | 客户端包里 7 处 `createElement("script")` 都设置 `src`（React DOM 资源提升、Privy 的 Turnstile/hCaptcha 加载器、TradingView 入口、TanStack Router 脚本加载、一处按 origin 加载的 SDK），没有写 `text`/`innerHTML` 的内联注入，没有 `document.write`；外链脚本受主机白名单管辖，与哈希无关 |
| viewer-response 函数体积 | 7,689 B，上限 10,240 B；其中强制与 report-only 两份策略文本重复约 2 KB |
| 流屏障被拦截的后果 | `vendor-tanstack-router` 的水合入口在 `window.$_TSR` 缺失时直接抛错（`window.$_TSR\|\|iH()`），应用不启动、骨架停留；所以策略与 HTML 不匹配等于白屏，不是降级 |
| 报告接收器 | 已收到首条真实报告：`vendor-tanstack-router` 块的 `eval`，现行强制策略已拦截，与本步无关（压缩产物里未定位到调用点，另行处理） |

## 约束

1. 流屏障脚本的哈希每次构建都变，策略必须随每次发布更新；函数发布到失效完成之间（加上壳的 `s-maxage=60`）新旧 HTML 与新旧策略会交叉，策略必须同时含上一版与本版的哈希。
2. CloudFront Functions 上限 10 KB，不能改响应体；静态托管没有 nonce。
3. Nitro/EC2 过渡目标由 `vite.config.ts` 的 `routeRules` 在构建期静态下发策略，拿不到产物哈希，保持 `'unsafe-inline'`，退役时一并消失。
4. 正式域名尚未切换，report-only 阶段没有真实流量；但内联脚本集合可以从产物穷举，不像 `img-src` 依赖真实用户会话。
5. 本步只改 `script-src`；`img-src` 收窄继续留在 report-only，等 DNS 切换后有真实流量再决定。

## 方案 A（推荐）：哈希随发布轮换，策略保留上一版集合

| 编号 | 改动 | 说明 |
| --- | --- | --- |
| A1 | `scripts/collect-inline-script-hashes.mjs .output/public` | 构建末尾（`inject-shell-preloads` 之后）扫描 `_shell.html` 与 6 个文档页，对每个无 `src` 的 `<script>` 正文算 `sha256-<base64>`，写 `.output/public/inline-script-hashes.json`（每页哈希与去重集合，不提交）；发现内联事件处理器、`javascript:` URL 或非 JS 内联脚本即中止构建。附 `.test.mjs`，加入 `production-build` 工作流的 node 测试 |
| A2 | `security-headers.ts` | 新增 `createStrictCspDirectives({ scriptHashes })`：`script-src 'self' https://challenges.cloudflare.com 'report-sample' 'sha256-…'…`（无 `'unsafe-inline'`、无 `blob:`），`img-src` 沿用候选；`cspReportOnlyDirectives` 由它派生。`cspDirectives`（Nitro）不变 |
| A3 | 模板与 `render-functions.mjs` | 模板改为在代码里拼接：公共目录一份，`script-src` 由前缀 + `SCRIPT_HASHES_CURRENT` + `SCRIPT_HASHES_PREVIOUS` 组成，两份策略共用公共文本（预计含 20 个哈希时 ≤ 7 KB）。提交的 `terminal-response.js` 以空集合渲染，只供测试与漂移检查；`deploy.mjs functions --execute` 在发布时读本次构建的集合作为 CURRENT，用 `get-function` 读线上函数中的 CURRENT 作为 PREVIOUS，渲染后发布；缺产物或集合为空时拒绝发布（C 阶段起空集合等于全站内联脚本被拦） |
| A4 | `deploy.mjs sync` 守卫 | 上传 HTML 前用 `get-function` 解析线上策略，要求已含本次构建的全部哈希，否则拒绝上传，防止"先 sync 后 functions"的顺序错误 |
| A5 | `deploy.mjs verify` | 新检查：抓取线上 7 页，算内联脚本哈希，B 阶段要求全部出现在 `content-security-policy-report-only`，C 阶段要求出现在 `content-security-policy` 且 `script-src` 无 `'unsafe-inline'`、哈希数 ≤ 20 |
| A6 | 接收器 | 摘要加 `sample`（`script-sample`，最多 40 字符），补测试，重新发布 `gatu-terminal-api-csp-report` |
| A7 | 手册与回滚 | 日常发布顺序改为 `build` → `build:lambda` → `functions --execute` → `lambda` → `sync` → `invalidate` → `verify`。回滚一版：策略仍含上一版哈希，恢复 S3 中的 HTML 版本即可；回滚更早版本：从 S3 版本取回 HTML，用其哈希发布函数后再恢复对象。紧急开关：`edge-config.json` 新增 `cspScriptSrcMode: "hashes" \| "unsafe-inline"`，切回 `unsafe-inline` 后 `functions --execute` 秒级生效 |

### 阶段

- **B 观察（一次发布）**：report-only 候选的 `script-src` 换成严格版（哈希），强制策略不变。Playwright 覆盖桌面与移动、6 个文档页、`/join`、Privy 邮件登录与外部钱包连接、Turnstile、下单表单、充值弹窗、图表；期望零条 `blocked-uri: inline` 的 `script-src` 报告（`eval` 除外）。观察一个发布周期。
- **C 强制（一次发布）**：CloudFront 强制策略的 `script-src` 换成严格版，并给强制策略也附 `report-uri` 与 `'report-sample'`（浏览器对强制策略同样发报告，`disposition: enforce`，接收器成本只是日志量）；`img-src` 仍宽，留在 report-only。发布顺序按 A7；失效后等 60 s 再 `verify`，确认旧壳已过期。同一提交更新 ADR 0007 状态、CHANGELOG、CloudFront 手册与任务记录。
- **D 可选**：`img-src` 收窄，DNS 切换后按真实报告决定。

## 备选方案与取舍

- **B′ 外置流屏障与收尾脚本**：构建后把每页的两段脚本抽成 `/assets/tsr-<hash>.js` 并改成 `<script src>`，只剩主题脚本 1 个稳定哈希，不需要轮换与守卫。代价：屏障脚本位于骨架之后、模块脚本之前，外置后成为解析阻塞请求，冷加载水合起点晚约 1 RTT；与"启动接近官方站"的目标相悖，不推荐。
- **C′ `'unsafe-inline'` 与哈希并存**：现代浏览器出现哈希即忽略 `'unsafe-inline'`，效果等于纯哈希，但审计上模糊，不采用。
- **`'strict-dynamic'`**：应用脚本全部同源，不需要。
- **固定 `u` 时间戳**：即使固定，资源文件名仍随构建变化，轮换不可避免。
- **哈希集合提交进仓库**：每次构建都变，会迫使每次发布提交；改为发布时从产物读取、从线上函数读取上一版。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| 发布顺序错误导致新 HTML 遇旧策略（或反之） | A3 拒绝空集合发布，A4 守卫拒绝上传，策略保留上一版集合覆盖失效窗口 |
| 函数超过 10 KB | A3 模板拼接去重，哈希上限 20（两版各 10） |
| 未来 SDK 升级引入内联脚本注入 | C 阶段强制策略附 `report-uri`，接收器持续记录 `blocked-uri: inline` 与 `script-sample` |
| 浏览器差异 | `report-uri` 与 `'report-sample'` 在 Chromium、Firefox、Safari 均可用，不用 `report-to`；`'unsafe-hashes'` 不需要 |
| Nitro/EC2 过渡目标 | 不参与，两套 HTML 的哈希互不影响，退役时删除 `routeRules` 策略 |
| 回滚超过一版 | 手册写明从 S3 版本取回 HTML 并先发布对应哈希 |

## 执行时的验证

- `pnpm test:cloudfront`、新脚本测试、`pnpm --filter @gatu/terminal typecheck`、`pnpm check`，涉及 `security-headers.ts` 的 vitest 用例。
- B 阶段：发布后 Playwright 全新上下文跑覆盖清单，`securitypolicyviolation` 事件中 `disposition: report` 且 `effectiveDirective: script-src` 的只能是 `eval`；CloudWatch 同样只见 `eval`。
- C 阶段：`verify` 主网、测试网全绿；Playwright 复跑覆盖清单，页面功能正常，无 `disposition: enforce` 的 `script-src` 报告（`eval` 除外）；`get-function` 显示 CURRENT/PREVIOUS 两组哈希。

## 需要决策的事项

1. 采用方案 A（推荐）还是 B′（外置脚本，零轮换但每次冷加载多约 1 RTT）。
2. B 阶段观察期：建议一个发布周期加脚本化覆盖即可进入 C，因为没有真实流量且集合可穷举。
3. C 阶段强制策略是否附 `report-uri`（推荐附）。
4. `img-src` 收窄留到 DNS 切换后（推荐）。
