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
  "summary": "用户要求继续 Link Device 对齐、界面调整与弹窗过渡这批工作。逐份核对 15 份任务记录后，剩余项大多卡在真机、线上权限或产品决策；无需决策即可做的完成了两项：配对预检原先只读默认 dex，余额全在 builder dex 的账户被误报 No balance，现在默认 dex 与现货为空时逐个读取 perpDexs 列出的 dex，列表或任一 dex 读取失败时报错而不判空；scripts/serve-spa-static.mjs 不再把 /build-meta.json 当成仅服务端路径，改为静态文件并带 no-store，与 CloudFront 一致。/mobile-agent-sync 的 no-store / no-referrer 响应头评估后未实施：AWS 文档未说明响应头策略与 viewer-response 函数的先后顺序，无法实测。未推送。",
  "thread": null,
  "baseCommit": "0af67e47",
  "commits": ["1c860ba1", "11403177", "988cf773"],
  "sources": [
    { "path": "apps/terminal/src/lib/mobile-sync/account-funding.ts" },
    { "path": "apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx" },
    { "path": "scripts/serve-spa-static.mjs" },
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "path": "docs/mobile-sync-ticketless-transfer-plan.md" },
    { "path": "docs/work-memory/sessions/2026-09-18-link-device-alignment.md" },
    { "url": "https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html" }
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

- **配对预检的资金判断覆盖所有 dex。** `2026-09-18-link-device-alignment.md` 已记「资金分类只查默认 dex 的 `clearinghouseState`…留作后续」。原实现写在组件里，用 `Number` 比较。现在移到 `lib/mobile-sync/account-funding.ts`：`hasPerpAccountFunding` / `hasSpotAccountFunding` 用 Big.js 比较十进制字符串，判据不变（任一非零的 accountValue、totalRawUsd、totalNtlPos、withdrawable，或存在持仓；现货 total / hold 为正）；`hasBuilderDexAccountFunding` 读取 `perpDexs`，对每个具名 dex 取 `clearinghouseState`，任一请求失败即拒绝。弹窗只在默认 dex 与现货都为空时才发起这些请求，已有余额的账户不增加请求；请求带上预检的中止信号，中止后不再写状态。失败走既有的外部错误提示，不新增文案。
- 没有改用首次交易引导的 `getTradingAccountFundingState`：它吃的是订阅快照，而预检要的是点击时刻的一次性新鲜读取，且其判据只看 accountValue 为正，比预检现有判据窄；两处各自保留。
- **`scripts/serve-spa-static.mjs`。** `/build-meta.json` 从 `SERVER_ONLY_PATHS` 移除，按静态文件提供并带 `no-store`（与 `deploy.mjs` 的 `NO_STORE_FILES` 一致），不再被 `--api` 代理。此前它要么 404 要么转发给 Nitro，与线上 S3 行为不一致；配对的静态托管验收正是用这个脚本。`apps/terminal/README.md` 的对应描述同步。
- **未实施：`/mobile-agent-sync` 的 `no-store` / `no-referrer`。** 放进 viewer-response 函数可以免改分发配置，但基础响应头策略已用 `Override: true` 写 `Referrer-Policy`，两者谁后生效取决于 CloudFront 的执行顺序；查阅 AWS 文档 `understanding-response-headers-policies` 与 `modifying-response-headers` 两页均未说明，也没有线上权限实测。不上线一个无法确认是否生效的安全头改动；结论与所需验证已写入无票据方案的 P3 行。

## 验证与限制

2026-09-19 本地，工作区基于 `0af67e47`：

- `mobile-sync-account-funding`（7）与 `mobile-agent-sync-modal`（45，新增 4）通过。变异验证：把弹窗里的 builder dex 读取临时替换为 `false`，「无余额预检」「余额只在 builder dex」「某个 dex 读取失败」「dex 列表读取失败」4 个用例变红，还原后全绿。
- `node --test scripts/serve-spa-static.test.mjs` 9 通过（新增分类用例与一条真实 HTTP 用例，断言 200、`no-store` 与正文）。
- `pnpm --filter @gatu/terminal typecheck` 通过；改动文件 Biome 通过。
- 全量 `pnpm --filter @gatu/terminal test` 单独运行两次。第一次 577 个文件中 575 通过、1 跳过、1 失败：`establish-connection-modal` 的首个用例「uses the mobile drawer…」5 秒超时，单独重跑 15/15 通过。这是该用例第三次在全量并发下因首次动态导入过慢而超时（前两次见 `2026-09-18-retire-ec2-deploy-files`），与本次改动无关；按 `orderbook-boot`、`mobile-agent-sync-route` 已有的做法给它加了 `beforeAll` 预热导入（60 秒）。第二次：576 通过、1 跳过，6,378 用例通过、0 失败。
- 限制：未对真实 Hyperliquid 账户验证 builder dex 读取；`perpDexs` 返回的 dex 数量决定请求数，仅在默认 dex 与现货为空时发生；未做浏览器验证（两个配对开关关闭时该弹窗不可达）。

## 后续与替代关系

- 本记录补充 `2026-09-18-link-device-alignment.md` 与 `2026-09-18-mobile-sync-ticketless-implementation.md` 的后续项，不替代它们。
- 仍待处理且无需决策的项见「剩余项核对」末条。
