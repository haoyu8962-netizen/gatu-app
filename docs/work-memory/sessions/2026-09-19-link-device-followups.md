<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-19-link-device-followups",
  "date": "2026-09-19",
  "title": "Link Device 续作：配对预检覆盖 builder dex，本地静态服务按 CDN 方式提供 build-meta.json",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "用户要求继续 Link Device 对齐、界面调整与弹窗过渡这批工作。逐份核对 15 份任务记录后，剩余项大多卡在真机、线上权限或产品决策；无需决策即可做的完成了两项：配对预检原先只读默认 dex，余额全在 builder dex 的账户被误报 No balance，现在默认 dex 与现货为空时逐个读取 perpDexs 列出的 dex，列表或任一 dex 读取失败时报错而不判空；scripts/serve-spa-static.mjs 不再把 /build-meta.json 当成仅服务端路径，改为静态文件并带 no-store，与 CloudFront 一致。随后按用户要求用 Codex 做只读对抗审查（1 项 P1、4 项 P2、3 项 P3），逐条核实后修复：成功但缺字段或金额畸形的响应不再被判成空账户，预检读取失败改为本地化提示而非原始错误，测试补强，静态服务按精确大小写匹配文件；审查还纠正了我「AWS 未说明响应头策略与 viewer-response 函数先后顺序」的错误结论，据此用边缘函数实现了 /mobile-agent-sync 的 no-store / no-referrer（未发布、线上未验证）。两套资金判据的业务含义差异为既有问题，未改。未推送。",
  "thread": null,
  "baseCommit": "0af67e47",
  "commits": ["1c860ba1", "11403177", "988cf773", "463d8a09", "1982ae97", "da8af38e"],
  "sources": [
    { "path": "apps/terminal/src/lib/mobile-sync/account-funding.ts" },
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx" },
    { "path": "scripts/serve-spa-static.mjs" },
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "path": "docs/mobile-sync-ticketless-transfer-plan.md" },
    { "path": "docs/work-memory/sessions/2026-09-18-link-device-alignment.md" },
    { "path": "deploy/cloudfront/functions/terminal-request.js" },
    { "path": "deploy/cloudfront/functions/terminal-response.template.js" },
    { "url": "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html" },
    { "url": "https://aws.amazon.com/blogs/networking-and-content-delivery/amazon-cloudfront-introduces-response-headers-policies/" }
  ],
  "supersedes": []
}
-->
# Link Device 续作

## 背景与范围

PR #27–#30 合入后，用户在 worktree `main-dev` 要求「继续 Link Device 对齐、移动端和桌面端界面调整、弹窗过渡修复等这个任务」。这批工作的 22 个提交在本会话之前已完成并进入 `main`，因此先核对剩余项：用只读子代理通读 15 份相关任务记录、ADR 0015、无票据方案与 `neutral-surface-audit.md`，并对照 `dev` 源码确认哪些后续已被后来的提交完成。分支 `fix/link-device-followups` 基于 `dev` 的 `0af67e47`。本记录为同步记录。

## 结论与依据

### 剩余项核对

- 需要真机、线上权限或产品决策、本次不做：真机矩阵 11 行与打开配对开关；线上重新发布；安全复核 F1（系统相机把含密钥的链接写进浏览器历史）；市价平仓执行搬到常驻宿主（ADR 0014 F3）；Close All / Reverse 是否改为点击即关；移动端头部 56 px 与底线、双色披露卡、md 断点账户信息是否首屏可见等设计取舍；各移动端改动的真机验收。
- 记录里列为后续、核对后已完成的：`mobile-sync-production-readiness.md` 的退役处理（文件已随 `87d6e51e` 移除）、`hyperliquid-signing.md` 的 Mobile Agent 一节、真机模板改写、预算超限与 8 个基线红测试、Grok 审查 F1/F2/F4–F7、账户标签行 40 px、桌面导航 36 px。`neutral-surface-audit.md` 的 10 项优先级表已由 `8a2283bf` 实施，但该文档状态行仍写「待实施」，未在本次修改。
- 无需决策、本次完成两项（见下）；同类里未做的：F5（片段擦除移入 head 内联脚本，牵涉 CSP 内联哈希与启动契约）、`trade-terminal-page` 仅剩约 1 kB 余量的拆分、桌面 `positions-tab.tsx` 的未连接占位、两套未跑的浏览器套件（订单簿几何、`boot-milestones.mjs`）。

### 本次改动

- **配对预检的资金判断覆盖所有 dex。** `2026-09-18-link-device-alignment.md` 已记「资金分类只查默认 dex 的 `clearinghouseState`…留作后续」。原实现写在组件里，用 `Number` 比较。现在移到 `lib/mobile-sync/account-funding.ts`：`hasPerpAccountFunding` / `hasSpotAccountFunding` 用 Big.js 比较十进制字符串，判据不变（此说法过宽，见下方 F7 更正；任一非零的 accountValue、totalRawUsd、totalNtlPos、withdrawable，或存在持仓；现货 total / hold 为正）；`hasBuilderDexAccountFunding` 读取 `perpDexs`，对每个具名 dex 取 `clearinghouseState`，任一请求失败即拒绝。弹窗只在默认 dex 与现货都为空时才发起这些请求，已有余额的账户不增加请求；请求带上预检的中止信号，中止后不再写状态。失败走既有的外部错误提示，不新增文案（审查后已改为本地化提示，见 F2）。
- 没有改用首次交易引导的 `getTradingAccountFundingState`：它吃的是订阅快照，而预检要的是点击时刻的一次性新鲜读取，且其判据只看 accountValue 为正，比预检现有判据窄；两处各自保留。
- **`scripts/serve-spa-static.mjs`。** `/build-meta.json` 从 `SERVER_ONLY_PATHS` 移除，按静态文件提供并带 `no-store`（与 `deploy.mjs` 的 `NO_STORE_FILES` 一致），不再被 `--api` 代理。此前它要么 404 要么转发给 Nitro，与线上 S3 行为不一致；配对的静态托管验收正是用这个脚本。`apps/terminal/README.md` 的对应描述同步。
- **未实施（结论有误，审查后已实现，见下方 F5）：`/mobile-agent-sync` 的 `no-store` / `no-referrer`。** 放进 viewer-response 函数可以免改分发配置，但基础响应头策略已用 `Override: true` 写 `Referrer-Policy`，两者谁后生效取决于 CloudFront 的执行顺序；查阅 AWS 文档 `understanding-response-headers-policies` 与 `modifying-response-headers` 两页均未说明，也没有线上权限实测。不上线一个无法确认是否生效的安全头改动；结论与所需验证已写入无票据方案的 P3 行。

### 对抗审查与更正（Codex `gpt-6-astra`，只读，2026-09-19）

用户要求用 Codex 对上面 4 个提交做对抗审查。审查用只读沙箱、约 16 万 token、20 条命令，报告 1 项 P1、4 项 P2、3 项 P3，无 P0；沙箱不允许它写 `.vite-temp` 与临时目录，所以它没跑 Vitest 与 HTTP 用例，只跑了 8 个纯逻辑用例并用真实 SDK + 合成响应直接调用了 helper。逐条核实后的处理：

- **F1（P1，成立，已修）。** SDK 不校验响应结构，`null`、`{}` 或金额为 `"bad"` 的 200 响应会让 helper 返回 `false`，弹窗显示「No balance」。上文「任一请求失败即拒绝」只覆盖了请求失败，没有覆盖成功但不可用的响应。现在 `hasPerpAccountFunding` / `hasSpotAccountFunding` 先校验结构（对象、`marginSummary` 三个金额、`withdrawable`、`assetPositions` 数组；现货 `balances` 数组及每项的 `total` / `hold`），金额必须是 Big.js 能解析的十进制**字符串**，否则抛 `AccountFundingSnapshotError`；builder dex 的所有快照先全部校验再下结论；`perpDexs` 的返回必须是数组、具名项必须有非空 `name`，重复名去重。默认 dex 与现货的快照走同一校验。
- **F2（P2，部分成立，已处理与本次相关的部分）。** 预检由弹窗打开自动触发，失败时原样显示传输错误文本，与 `docs/mobile-data-presentation.md` 对被动读取的约定不符。这条路径在 `0af67e47` 就存在，本次扩大了触发面并曾写测试断言原始错误。现在预检的全部读取失败统一显示新增的本地化提示「Could not check this account on Hyperliquid. Nothing was signed. Retry the check.」，按钮仍为既有的 `Retry check`；不再区分自动与手动重试的展示，这一点未改。
- **F3（P2，成立，已修）。** 「余额只在 builder dex」的用例原先只断言没有 alert，`checking` 状态也能通过。现在断言审批按钮可用且未签名；补了只有现货余额时的短路、六种「不可判空」输入的表格用例、默认 dex 快照缺字段、以及 builder 请求悬而未决时关闭弹窗（断言信号已中止、迟到的响应不写状态）。
- **F4（P2，成立，已修）。** macOS 大小写不敏感的磁盘上 `/Build-Meta.json` 会命中文件并拿到非 `no-store` 的缓存头，而 S3 键区分大小写。`hasExactPath` 逐段对照目录列表做精确匹配，测试用注入的目录列表，不依赖宿主文件系统。
- **F5（P2，成立，结论更正并已实现）。** 上文「AWS 文档未说明先后顺序」是错的：我只查了两页参考文档。AWS 官方博客写明策略的头「在响应离开缓存之后、触发函数的 viewer response 事件之前插入」，函数能读到它们，所以函数写入的值不会被策略的 `Override` 覆盖。据此实现：viewer-request 先删除访客自带的 `x-gatu-route`，再给 `/mobile-agent-sync`（不区分大小写、允许尾斜杠，与路由器一致）打标记；viewer-response 据标记写 `no-store` 与 `no-referrer`（与 `vite.config.ts` 里 Nitro 路由规则的两个头一致）；`deploy.mjs verify` 新增「pairing page headers」；本地静态服务同样处理。线上效果未验证，需下一次 `functions` 发布后由 `verify` 确认；`no-store` 只约束下游缓存。
- **F6（P3，成立，已修）。** HTTP 用例每次遗留一个临时目录；改用 `context.after` 删除目录并关闭服务器，监听失败会 reject。修复前那一次运行遗留的 1 个目录仍在系统临时目录里。
- **F7（P3，成立，已更正）。** 上文「判据不变」应限定为：保留字段选择与正负判断，解析改为精确十进制。与旧 `Number` 实现的差异：`" 1 "`、`"0x10"`、`"+1"`、空串、数字类型原先按数值处理，现在一律视为不可用快照并报错；`"1e-400"` / `"1e400"` 原先读成 0 / Infinity 而判无资金，现在按金额处理。原测试用 `1e-19` 声称证明精度改进并不成立（`Number` 同样读得出），已改用超出双精度范围的输入。「已有余额的账户不增加请求」应限定为「默认 dex 或现货已有余额的账户」；余额只在 builder dex 的账户会增加 `20 + 2N` 权重的请求（`perpDexs` 20，每个 `clearinghouseState` 2），弹窗反复开关没有缓存或节流，主网 dex 数量 N 未核实。
- **F8（P3，既有差异，未改）。** 引导只看各 dex 的 accountValue 与现货 total 为正，预检还把负 accountValue、非零 totalRawUsd / totalNtlPos、持仓与 `hold` 算作有资金，所以同一账户可能「引导判空、配对判有」。上文「各自保留」的理由只解释了获取层（订阅与一次性读取），没有解释业务分类的不同；两处各自想表达「正资产余额」还是「有资金或敞口」需要产品定义，本次不改。
- 审查确认无问题的点：SDK 类型与 `(params, signal)` 签名、生产 `useHyperliquid()` 确有 `info`、身份/关闭竞态（`sessionKey` 变化会卸载并中止）、`Promise.all` 无未处理 rejection（其余请求不会被取消，靠 SDK 10 秒超时结束）、静态路径无目录逃逸、`988cf773` 的预热有效（该文件没有 `vi.resetModules()`；它是把冷导入挪到 60 秒预算里，不证明没有性能回归）、签名边界未变。
- 审查指出但不在本次范围：staking、vault 权益与子账户不计入判断，文案「No balance on Hyperliquid」的范围因此偏宽；`InfoClient` 没有 `allDexsClearinghouseState`，要降请求数只能用一次性订阅。

## 验证与限制

2026-09-19 本地，工作区基于 `0af67e47`。前五条是审查前的结果；审查后的复验见本节末尾。

- `mobile-sync-account-funding`（7）与 `mobile-agent-sync-modal`（45，新增 4）通过。变异验证：把弹窗里的 builder dex 读取临时替换为 `false`，「无余额预检」「余额只在 builder dex」「某个 dex 读取失败」「dex 列表读取失败」4 个用例变红，还原后全绿。
- `node --test scripts/serve-spa-static.test.mjs` 9 通过（新增分类用例与一条真实 HTTP 用例，断言 200、`no-store` 与正文）。
- `pnpm --filter @gatu/terminal typecheck` 通过；改动文件 Biome 通过。
- 全量 `pnpm --filter @gatu/terminal test` 单独运行两次。第一次 577 个文件中 575 通过、1 跳过、1 失败：`establish-connection-modal` 的首个用例「uses the mobile drawer…」5 秒超时，单独重跑 15/15 通过。这是该用例第三次在全量并发下因首次动态导入过慢而超时（前两次见 `2026-09-18-retire-ec2-deploy-files`），与本次改动无关；按 `orderbook-boot`、`mobile-agent-sync-route` 已有的做法给它加了 `beforeAll` 预热导入（60 秒）。第二次：576 通过、1 跳过，6,378 用例通过、0 失败。
- 审查后的复验：`mobile-sync-account-funding`（35）与 `mobile-agent-sync-modal`（共 81 个用例，两个文件）通过；`pnpm test:cloudfront` 41 通过（新增配对页响应头与伪造标记两条函数用例，`verify` 用例由 14 项检查变为 15 项）；`node --test scripts/serve-spa-static.test.mjs` 10 通过，重跑不再新增临时目录；渲染后的 `terminal-response.js` 为 6,193 字节（上限 10,240，填入两版哈希后的大小由既有用例断言）；`typecheck`、Biome 通过；全量 Vitest 单独运行 576 通过、1 跳过，6,407 用例通过、0 失败。新增文案已 `pnpm i18n:extract`，补了中文翻译，其余四种语言缺失数各 +1（35）。没有请 Codex 对修复做第二轮审查。
- 限制：未对真实 Hyperliquid 账户验证 builder dex 读取；`perpDexs` 返回的 dex 数量决定请求数，仅在默认 dex 与现货为空时发生；未做浏览器验证（两个配对开关关闭时该弹窗不可达）。

## 后续与替代关系

- 本记录补充 `2026-09-18-link-device-alignment.md` 与 `2026-09-18-mobile-sync-ticketless-implementation.md` 的后续项，不替代它们。
- 仍待处理且无需决策的项见「剩余项核对」末条。
