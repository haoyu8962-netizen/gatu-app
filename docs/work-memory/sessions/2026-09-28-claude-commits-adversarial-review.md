<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-claude-commits-adversarial-review",
  "date": "2026-09-28",
  "title": "当日 Claude 署名提交对抗审查：官方协议、SDK 字段与 HYPE 页面核对",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "pr-review",
    "hyperliquid-api",
    "market-recovery"
  ],
  "summary": "对照官方协议、SDK 0.33.3 与官方 HYPE/Funding Comparison 页面，审查原列出的 40 个 Claude 署名提交。确认 1 项 P2 修复遗漏：空资金费率历史在后台时钟回拨后仍被当作新鲜且聚焦不刷新；父版本对照证明是 58e132ed 未修完的边界，非新增回归。未改生产代码，验证及限制见正文。同日复核更正：所报基线类型检查失败系主检出残留的 TypeScript 5.9.3 所致，锁定的 5.7.2 下通过；P2 另影响切回页签与重新挂载，已由 a1d93307 修复。",
  "thread": null,
  "baseCommit": "8cc8a3238082106b0c8199e9059570a4a4460348",
  "commits": [
    "ef3e88a9",
    "4c68929a",
    "8266ae0b",
    "149b2188",
    "cd509ff0",
    "9f17d1aa",
    "db96fe07",
    "f3ce177f",
    "cb0d842c",
    "a152b28b",
    "cb066de7",
    "f8ee170f",
    "1bea62c3",
    "34bee211",
    "0e884e17",
    "85fea263",
    "76ccc899",
    "d8235e9f",
    "77df1c7c",
    "93e7bb94",
    "5e8bfaac",
    "dfc6e055",
    "c5e4142c",
    "0a5b6a02",
    "21c896a8",
    "999ed3f4",
    "72a6d9ea",
    "dbeab0c8",
    "99fd8500",
    "c42f13b8",
    "6aa715d7",
    "70297bda",
    "602df7d6",
    "340af2fc",
    "1eea3e71",
    "a30d9fab",
    "7084ea7b",
    "88c7466c",
    "58e132ed",
    "1829fc8e"
  ],
  "sources": [
    {
      "path": "docs/hyperliquid-sdk-reference.md"
    },
    {
      "path": "docs/adr/0022-subscription-staleness-monotonic-clock.md"
    },
    {
      "path": "docs/market-funding-history.md"
    },
    {
      "path": "docs/funding-comparison.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-28-branch-audit-and-docs-page-fixes.md"
    },
    {
      "path": "apps/terminal/src/hooks/trade/use-market-funding-history.ts"
    },
    {
      "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals"
    },
    {
      "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/predictedfundings"
    },
    {
      "url": "https://app.hyperliquid.xyz/trade/HYPE"
    },
    {
      "url": "https://app.hyperliquid.xyz/fundingComparison"
    }
  ],
  "supersedes": []
}
-->
# 当日 Claude 署名提交对抗审查

## 背景与范围

用户要求对上一轮列出的 40 个提交进行对抗 review，并对照官方开发文档、已安装 SDK 的实际字段；有疑点时调试官方 HYPE 页面。同步记录，没有取得可核对的会话 ID。初始分支 `claude/from-dev-0928`，HEAD `8cc8a323`，工作区干净。按北京时间 2026-09-28 committer date 和 Anthropic 联合署名筛选，36 个普通提交、4 个合并提交；其中 3 个普通提交的 author date 是 9 月 20 日。审查针对最终代码，已被同批后续提交修正的问题不重复报告，合并带入的既有实现单独区分。

## 结论与依据

使用 Info/Subscription 只读接口与隔离未登录浏览器，不发起签名、交易或账户变更。发现一项 P2 修复遗漏，没有确认本批引入的 P0/P1 回归。它是既有缺陷在本次修复中的残留，不应记作本批新引入的错误。

### P2：空历史的新鲜度仍依赖墙钟，后台回拨后不能按五分钟边界失效

- 关联提交：`58e132ed`；最终代码 `apps/terminal/src/hooks/trade/use-market-funding-history.ts:52-57,69-71`。
- 可重现条件：新市场获取完整空快照 `[]`，标签转后台，墙钟回拨一小时，定时器实际推进十分钟，再转前台。`refetchIntervalInBackground: false` 在后台跳过请求；`refetchOnWindowFocus: hasEmptySnapshot` 返回的是 `true`，不是无条件刷新。已安装的 `@tanstack/query-core 5.90.16` 用 `Date.now()` 计算 `isStale`；负年龄仍被当作新鲜，聚焦不请求，hook 继续返回 `ready`。真实 `FundingHistoryBody` 会据此显示 `No funding history`。下一次前台轮询可以恢复，但回到前台时没有按契约立即撤回旧空结论。
- 观察：真实 hook、真实 QueryClient，只有 Info 传输与在线状态被桩；无回拨对照为 `status=loading, requests=2`，回拨分支为 `status=ready, requests=1`，后者行为断言失败。输入为 jsdom fake timers / `vi.setSystemTime`，没有真实修改操作系统时钟。
- 父版本对照：把 `58e132ed^` 的 hook 作为独立临时模块装进同一测试，两种分支均为 `ready, requests=1`，均失败；当前版本普通分支通过，回拨分支仍失败。因此归类为修复遗漏，而非新回归。
- 影响范围：空市场资金费率历史的误导性空态；没有证据表明它绕过交易或资金守卫。WebSocket 的双时钟巡检修复不覆盖这个 HTTP Query 缓存。
- 建议后续：为空快照保存进程内单调接收时间，或在发现墙钟倒退时保守撤回空结论并强制刷新；恢复可见性时同时重新核对。保留非空历史的静默缓存策略；加入实际 hook 的后台/回拨/重新激活用例。不要仅把 `refetchOnWindowFocus` 改成 `true`，当前代码已经是这一语义。

### 官方协议、SDK 与实际页面核对

- [官方 Info 分页规则](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)和[永续接口](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)：时间游标包含边界，市场历史费率用 `fundingHistory`，跨交易所预测费率用 `predictedFundings`，后者只覆盖主 perp dex。
- 已安装 SDK `@nktkas/hyperliquid 0.33.3` 的 `esm/api/info/_methods/fundingHistory.d.ts`：`coin`、毫秒 `startTime/endTime`，返回 `coin/fundingRate/premium/time`；费率和 premium 为字符串。实际 HYPE 三十天查询得到 500 条升序记录，下一页用最后时间继续，返回 221 条且首项与前页末项重合。gatu 显式固定 `endTime` 并以时间去重，符合协议。官方 HYPE 的 Funding 入口实际发出 `fundingHistory` 请求，并提供 1h/8h/D、单期与累计费率展示。
- [SDK predictedFundings 文档](https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/predictedfundings)及锁定声明：`[asset, [venue, data|null][]][]`，`fundingIntervalHours` 可选。公开响应 234 个资产，已观察间隔 1/4/8 小时，20 个 Binance 条目缺间隔（19 个零值、MATIC 为 `0.0001`）。这只是本轮快照，不能反向证明历史记录在另一采样时刻错误。
- 官方 Funding Comparison 默认为 8 Hours。BTC 原始 HL `0.0000125 / 1h`、Binance `0.00006235 / 8h`，页面分别显示 `0.0100%`、`0.0062%`；按各自周期转小时后比较符合当前领域实现。该快照中 HYPE 的两个 CEX 条目均为 `null`；不应把无 CEX 数据的资产过滤解释为遗漏 HYPE。UI 是比较基准，协议语义仍以官方文档与响应为准。
- 已核对 `openOrders` 的 `user/dex/orders` 与 `twapStates` 的 `user/dex/states: [id,state][]` 声明；本批新增的 `monotonicLastMessageAt` 是客户端接收元数据，并非 SDK/交易所原生字段。写入与隐藏缓冲提交保留原始接收时间对，没有把交易所 `time` 当作本机单调时钟。
- `602df7d6`、`6aa715d7`、`c5e4142c` 的双时钟年龄、节流、socket 静默、L2 门控、撤改订单/TWAP 对账未发现另一项确定性错误。保留系统休眠、后台定时器延迟等验证边界，不以单元测试代替真机结论。

### 其余提交的审查边界

- 原清单包含 21 个文档提交、8 个 fix（其中一个只补翻译）、7 个 test 和 4 个 merge。逐项查看文件范围，并追踪同批后续修正；合并提交关注合并解析和接口相容，不把 dev 带入的全部历史实现重新算作新增功能。
- `1bea62c3` 的 Markdown 标题、斜体与嵌套列表、`34bee211` 的三处文件路径分类、`0e884e17` 的翻译占位符与比较符号，没有确认新的可操作缺陷。四种语言没有做母语人工审校。
- `f8ee170f` / `cb0d842c` 的用户菜单夹具与配对开关、`1eea3e71` / `c42f13b8` / `999ed3f4` 的暂停测试、`4c68929a` 的字体测试工具按各自实际用途核对。字体脚本是人工读数工具，没有把退出码 0 单独当作等值证明；另读结果中的差异及缺失 CSS 计数。
- 历史文档里的 CI、登录账户、发布预检与分支清理只核对版本和范围表达；本轮没有重放那些行为，也不重新声称历史外部证据已验证。SDK 六项功能在前一日的原始实现不是本轮全部重新审计的范围，读到它们是为了验证本批修复的上下游。
- 审查过程中其他分支新增 `ee94163c`，未纳入用户先前指定的 40 个提交；当前检出 HEAD 始终保持审查基线。

## 验证与限制

- 2026-09-28，基线 `8cc8a323`：定向 Vitest 19 个文件、384 项通过；覆盖订阅巡检、节流、socket、L2、撤改订单/TWAP、资金费率历史与对比、Markdown、法律页、静态路径、Service Worker、滑杆指针生命周期。
- 官方浏览器：Chrome DevTools 隔离上下文，HYPE 页面点击 Funding，观察到 1h/8h/D 与资金费率、累计费率两条展示；抓到实际请求 `fundingHistory`，响应包含字符串 `fundingRate`、字符串 `premium`、毫秒 `time` 和 `coin`。这是协议注入点击，不是物理输入验收。
- 浏览器 CLI 不在 PATH；改用已连接的 Chrome DevTools。两次尝试用 DevTools 写公开响应到 `/tmp` 和当前工作区均被该工具的工作区边界拒绝，均未写入；随后通过页面脚本返回精简的公开响应字段。命令日志、提交清单、字体结果与复现源码保存在 Git 忽略的 `.worklog/2026-09-28/claude-commit-review/`；该目录不是完整会话转录。
- CloudFront 函数与 CI workflow 约束：`node --test deploy/cloudfront/functions/functions.test.mjs scripts/ci-workflows.test.mjs`，17 项通过。
- 用户菜单浏览器：`pnpm --dir apps/terminal run test:browser:user-menu-recovery`，10 项通过。输入为 Playwright 协议注入，测试夹具未连接真实钱包。
- 滑杆浏览器：`pnpm --dir apps/terminal run test:browser:slider`，22 项通过（1.1 分钟）。输入为 Playwright 协议注入，不证明操作系统指针事件顺序或真实拖动验收。夹具 Vite 缓存独立于应用，字体与滑杆共用的夹具缓存没有并行运行。
- 字体工具：`node tests/browser/font-migration.run.mjs <本地结果路径>`，明/暗两种主题、五种宽度、86 对类串，总 6,880 次对比；所有 `differences=0`、`sizeRuleMissing=0`。未重新跑历史真实账户组件原地对比；不是全产品视觉验收。
- 空历史反例：本轮临时测试当前版本 1 通过 / 1 失败，父 hook 对照 2 失败；每次有 19 个原套件用例因名称筛选被跳过。失败是本次发现的证据，不被计入通过数。临时测试和父 hook 已删除，仅保留 Git 忽略副本，没有给默认测试套件留下故意失败用例。
- **当前基线类型检查失败**：`pnpm --filter @gatu/terminal typecheck` 退出 2，`src/lib/tests/use-exchange-funds-action-lock.test.tsx:150` TS2322，`Promise<Promise<void>>` 不能赋给 `Promise<void>`。`git blame` 和路径历史指向 2026-09-27 的 `798829fb`，不在原 40 个提交中，文件本轮未改。环境为 Node `v24.15.0`、pnpm `10.21.0`、已安装依赖；不能借历史 Node 22.15 的通过记录宣称本轮类型检查通过。审查没有扩展到修复这一独立缺陷。
- 不沿用历史记录的通过结果作为本轮验证，不验证真实钱包、真实设备休眠或实际系统时间修改。

## 后续与替代关系

本任务只审查并记录，不修改生产逻辑。后续修复空历史在回拨后的过期与聚焦刷新；先读 `docs/market-funding-history.md` 和本文的反例，新增回归再实施。另需独立处理资金锁测试的类型错误。本文补充 `58e132ed` 的验证边界，不整体替代既有记录。未运行全量终端测试或生产构建，没有发布、交易或真机验收。

## 更正（2026-09-28 复核）

同日在独立 worktree 复核了本记录的两项结论：分支 `claude/codex-issue-review-07ec3b`，同一基线 `8cc8a323`，按锁文件新装依赖，Node 24.15.0、pnpm 10.21.0。上文原文不改，修订由本节说明，原措辞保留在 `4c7ee2e1`。

- **「当前基线类型检查失败」不成立。**
  - 原因：审查所用的主检出里，`pnpm --filter @gatu/terminal exec tsc --version` 输出 5.9.3。`apps/terminal/node_modules/.bin/tsc` 是 2026-08-28 生成的链接，指向 `typescript@5.9.3`；pnpm 运行脚本时，包内 `.bin` 优先于根目录。
  - 锁定版本：根 `package.json` 锁定 5.7.2。`git log --all -S'"typescript":' -- apps/terminal/package.json` 没有结果，即任何分支的终端包都没有声明过 typescript，新装依赖也不会生成这个链接。
  - 实测：新装依赖的 worktree 里，同一基线 `typecheck` 退出 0。手动用 5.9.3 的 `tsc` 运行，退出 2，只有 `use-exchange-funds-action-lock.test.tsx:150` 一个 TS2322。原因是 5.9 的 `lib.dom.d.ts` 把 `LockManager.request` 声明为返回 `Promise<T>` 的泛型（5.7.2 为 `Promise<any>`），而测试里的回调返回 `Promise<void>`。
  - CI：PR #57 的 head `ef3e88a9` 已包含 `798829fb`，其 CI「Validate TypeScript, lint and translation catalogs」通过。
  - 结论：「另需独立处理资金锁测试的类型错误」只在将来升级到 TypeScript 5.9 及以上时才需要。本记录没有借历史结果宣称类型检查通过，这一点仍然成立；错在把本地依赖残留当成了基线失败。
- **P2 成立，影响面比上文更大。**
  - 另外两条路径：页面可见时切走再切回 Funding 页签，以及已缓存的空快照随面板重新挂载。回拨后两者都不刷新，仍显示空结论，直到下一次前台轮询。
  - TanStack 的过期定时器只触发一次，到点时若因回拨尚未过期就不再重排。所以哪怕只回拨两分钟，后台那次转为空白也会丢失；回来时墙钟年龄已满 5 分钟，仍会刷新。
  - 父版本对照：`58e132ed^` 在页签切回路径上回拨后不刷新，也没有轮询兜底（6 分钟观察窗口内一直只有 1 次请求）；`58e132ed` 靠轮询把它限制在一个周期内。归类为修复遗漏仍然正确。
- **已修复**：`a1d93307`，见 [2026-09-28-funding-history-clock-rollback-fix](2026-09-28-funding-history-clock-rollback-fix.md)。「后续与替代关系」的第一项因此完成；[资金费率历史](../../market-funding-history.md)里的「已知缺口」段落已改写为现行行为。
