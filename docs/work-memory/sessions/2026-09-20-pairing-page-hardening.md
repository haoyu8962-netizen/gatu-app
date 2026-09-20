<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-20-pairing-page-hardening",
  "date": "2026-09-20",
  "title": "配对页加固（A 批）：头部内联擦除、阻断说明页、路径规范、Service Worker 放行、StrictMode",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "用户要求推送 Link Device 续作分支并开 PR（#33），然后做 A 批；不确定的事项先调试官方终端再规划，规划交 Codex 对抗审查。官方 app.hyperliquid.xyz 对 ?link= 只在应用内扫码器里解析，直接打开时既不读取也不从地址栏移除，明文密钥在查询串里，所以这一项没有官方做法可对齐，按本仓库契约设计。规划第 1 版被 Codex 判为不能按原样实施（1 项条件性 P0、5 项 P1），逐条核实后出第 2 版并实施：片段擦除改由页面壳第一个脚本执行（单一 TS 实现生成并提交的内联脚本，带非秘密状态的交接对象，客户端入口为第二道防线）；擦除失败或交接异常时显示六种语言的说明页并跳转到干净的配对页；路径判断统一（ASCII 大小写、只解码一次）；Service Worker 放行配对导航；StrictMode 重放 effect 后密钥不再被提前清零；构建末尾新增产物级断言。浏览器因果验证 9 项通过。未推送、未发布。",
  "thread": null,
  "baseCommit": "ab2874e1",
  "commits": ["3d1d360e", "9a64fb69", "b7279527", "e666c1e9", "90ee27f5", "798f3a84"],
  "sources": [
    { "path": "docs/pairing-page-hardening-plan.md" },
    { "path": "apps/terminal/src/lib/mobile-sync/pairing-location.ts" },
    { "path": "apps/terminal/src/lib/mobile-sync/bootstrap-fragment.ts" },
    { "path": "apps/terminal/scripts/render-pairing-head-scrub.mjs" },
    { "path": "scripts/check-shell-head-scrub.mjs" },
    { "path": "apps/terminal/tests/browser/pairing-head-scrub.mjs" },
    { "path": "apps/terminal/public/sw.js" },
    { "path": "docs/work-memory/sessions/2026-09-19-link-device-followups.md" }
  ],
  "supersedes": []
}
-->
# 配对页加固（A 批）

## 背景与范围

2026-09-19 用户指示：「推送当前分支并开 PR 到 dev，然后开始做 A 批，不确定的任务去调试 hype 交易终端再规划，确保符合规范，接着可以让 codex 对抗 review 规划」。`fix/link-device-followups` 已推送并开 PR [#33](https://github.com/zora4523-bot/gatu-app/pull/33)（→ `dev`）。A 批在叠于其上的分支 `fix/pairing-page-hardening` 上进行，基于 `ab2874e1`。本记录为同步记录。两个 `VITE_MOBILE_PAIRING_*` 开关保持关闭；未推送、未发布。

## 结论与依据

- **官方终端没有可对齐的做法。** 抓取 `app.hyperliquid.xyz` 的页面壳与两个主包（`index-BFOYdjEK.js`、`config-p_qaZZV-.js`）：壳里唯一的内联脚本是 `window.process` 垫片；`link` 参数只在应用内扫码器回调里解析（全产物只出现一次），没有代码在直接打开 `/trade?link=…` 时读取或从地址栏移除它，且密钥是查询串里的明文。其余懒加载 chunk 未逐个检查。因此按 AGENTS.md 契约、ADR 0015 / 0007 / 0010 设计，而不是对齐官方。
- **现状核实纠正了清单里的三处说法。**「擦除失败没有兜底」不准确：失败时 `client.ts` 不会启动任何后续导入，缺的是说明与让片段离开地址栏；擦除代码不在入口（4.6 KB）里，而在它静态导入的 `vendor-tanstack-router`（1,194,046 字节）里；页面壳按内容哈希引用入口，不存在「新壳配旧包」。
- **规划与审查。** 规划写在 `docs/pairing-page-hardening-plan.md`。第 1 版交 Codex `gpt-6-astra`（只读、`medium`、约 10 万 token、14 条命令）审查，结论「不能按原样实施」：1 项条件性 P0、5 项 P1、4 项 P2、1 项 P3。逐条核实后的处理写在规划文末「审查与修订」，要点：交接改为带非秘密状态的不可改写对象；Service Worker 会用共享壳（连同别的路由的响应头）响应配对导航，已读 `sw.js` 确认并纳入本批；撤回「缓存 dex 列表」（用缓存列表得出无余额违反快照契约，且它能省请求的场景正是空账户）；擦除脚本不放在 `<meta charset>` 之前；说明页用现有的六语言轻量机制；验证改为暂停入口响应的因果测试；实现改为单一 TS 源生成并提交内联脚本。它同时纠正了我两处错误：CSP 脚本哈希线上已是 enforce；持久化查询保留原 `dataUpdatedAt`。
- **实施（五个提交）。** Service Worker 放行配对导航；`pairing-location.ts` 单一实现 + `render-pairing-head-scrub.mjs` 生成 `head-scrub-script.generated.ts` + `RootDocument` 里置于主题脚本之前 + `bootstrap-fragment.ts` 读取交接对象；阻断说明页（`bootstrap-error-copy.ts` 新增 `pairing-blocked` 文案）、`location.replace` 到 `?notice=unsafe-link`、路由读到标记后清草稿不恢复、`getSpaLocationScrubState` 与 `getMobileSyncCleanUrl` 改用同一分类函数；StrictMode 修复为可取消的延迟清零；`scripts/check-shell-head-scrub.mjs` 接入 `pnpm build` 与 CI。
- **实施中自己发现并处理的问题。** 交接对象损坏这类原因在跳转后的新页面上依然存在，会形成无限刷新：加了「已在提示页地址上则不再跳转」的防护。产物断言第一次真实构建时误报纯静态的 `404.html`（没有任何脚本）：改为只约束含脚本的文档。StrictMode 测试第一版在未修复的代码上也通过——React 只在 StrictMode 位于挂载时被放置的 fiber 之上时才重放 effect，测试工具外包的 `I18nProvider` 挡住了重放；改为 StrictMode 最外层后用例在未修复代码上为红。
- **与规划的出入**见规划文末「实施结果」：恰为规范路径（含尾斜杠）时保留原样不改写；清零用例只新增了两条而不是四条。

## 验证与限制

2026-09-20 本地：

- `pnpm --filter @gatu/terminal typecheck` 通过；改动文件 Biome 通过。
- 全量 Vitest 单独运行两次：第一次 `portfolio-overview` 有 2 个用例断言失败（`$0.00` 对 `$100.00`），该文件单独运行 20/20 通过，与配对无关，此前记录里它已是全量并发下的偶发文件；第二次 577 个文件通过、1 跳过，6,484 用例通过、0 失败。
- `pnpm test:cloudfront` 41 通过；`node --test` 四个脚本测试文件 23 通过。
- `pnpm build` 预算通过（`trade-terminal-page` 126,297 B，上限 127,242 B）；内联脚本哈希 10 → 11；两组各 11 个不重叠哈希下 viewer-response 函数 7,379 B（上限 10,240 B）；产物断言对 8 个预渲染页通过。构建用的是本机 `.env.local`（两个配对开关为开），这样才能在浏览器里走到导入界面；该产物不能用于发布，发布闸门也会拒绝它。
- 浏览器因果验证 `apps/terminal/tests/browser/pairing-head-scrub.mjs`（Chromium、生产构建、`serve-spa-static.mjs`、屏蔽 Service Worker、一次性测试链接、未记录 trace / HAR）9 项通过，逐项见规划「实施结果」。
- 未验证：线上 enforce 模式下新内联脚本是否被放行（需下一次 `functions` 发布后用 `verify` 与 `csp-coverage.mjs` 确认；`sync --execute` 会拒绝线上策略未含新哈希的构建）；真机系统相机路径；旧 Service Worker 迁移窗口；说明页的印地语、西班牙语、法语、阿拉伯语文案未经母语者校对；实施后的代码没有再做一轮 Codex 审查。

## 后续与替代关系

- 本记录补充 `2026-09-19-link-device-followups`，并关闭无票据方案安全复核表里的 F5 与 P3 行的三项；「Import 前显示 owner / Agent 地址」仍待交互设计决策。
- 仍需用户决定：是否推送本分支并开 PR（叠在 #33 之上）；F1（系统相机路径）的产品取舍。
