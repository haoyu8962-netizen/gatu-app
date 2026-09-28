<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-sdk-feature-batch-1",
  "date": "2026-09-28",
  "title": "SDK 第一批六项接入：多 worktree 并行实现、三轮 Codex 对抗审查与集成验证",
  "kind": "task",
  "status": "verified",
  "topics": ["hyperliquid-api"],
  "summary": "按覆盖审查的收益排序实施六项：资金费率历史页签（fundingHistory）、未平仓量上限拦截（webData3 perpsAtOpenInterestCap + perpDexLimits，ADR 0023）、资金费率对比页（predictedFundings）、TP/SL 滑点提示（maxMarketOrderNtls）、TWAP 成交 CSV 导出（userTwapSliceFillsByTime）、杠杆弹窗仓位上限（复用分档）。六个独立 worktree 并行实现并各经一轮代理审查，集成到 claude/sdk-api-review-51a3ea 后做三轮 Codex 只读对抗审查（共 6 个 P2、6 个 P3，全部修复或有理由处理；第三轮残留的时钟回拨属于共享订阅巡检，另列后续任务）。最终头类型检查、Biome、Node 22.15 构建与包体预算通过，完整终端测试 7,490 项通过、1 个已知负载敏感文件超时（单独 5/5 通过）。服务端账户通知未实施（需要传输隔离决策）。2026-09-28 经 PR #50 四次合并 dev（含 Earn 导致的 ADR 改号 0023）后，五项 CI 检查全部通过，以 merge commit 合入 dev（ac11f81b），未晋升 main、未发布；没有真实钱包与真机验收。",
  "thread": null,
  "baseCommit": "dbc6036e",
  "commits": ["1190bd41", "282a58ba", "5eb85082", "a36c67ad", "0c404f44", "bd6bb81b", "7db5cf0b", "19af214b", "746ef421", "db676ae4", "fcc5624e", "b8e880c3", "21a3c1e4", "8c1ec5da", "58e132ed", "1829fc8e", "88c7466c", "7084ea7b", "0a5b6a02", "95064568", "0297d677", "defb6021", "ac11f81b"],
  "sources": [
    { "path": "docs/sdk-feature-integration-plan.md" },
    { "path": "docs/hyperliquid-sdk-coverage-review.md" },
    { "path": "docs/market-funding-history.md" },
    { "path": "docs/open-interest-cap.md" },
    { "path": "docs/adr/0023-open-interest-cap-advisory-check.md" },
    { "path": "docs/funding-comparison.md" },
    { "path": "docs/position-tpsl-slippage-warning.md" },
    { "path": "docs/twap-regression-tests.md" },
    { "path": "docs/leverage-position-limit.md" },
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "url": "https://app.hyperliquid.xyz/trade/BTC" },
    { "url": "https://app.hyperliquid.xyz/fundingComparison" },
    { "url": "https://github.com/zora4523-bot/gatu-app/pull/50" }
  ],
  "supersedes": []
}
-->
# SDK 第一批六项接入：多 worktree 并行实现、三轮 Codex 对抗审查与集成验证

## 背景与范围

同步记录。用户在覆盖审查（[2026-09-27 记录](2026-09-27-sdk-api-coverage-review.md)）之后要求：规划并开发缺失功能，做 Codex 对抗审查（一轮一轮或多 agent 多 worktree 并行由我决定），符合编码规范与文档实践，不影响现有功能，不确定处先调试 `app.hyperliquid.xyz/trade` 再规划。会话在应用创建的 worktree `sdk-api-review-51a3ea`（分支 `claude/sdk-api-review-51a3ea`）进行；未取得可核对的任务标识，`thread` 记为 null。

范围取舍、各项设计要点与验收标准写在[接入规划](../../sdk-feature-integration-plan.md)（规划提交 `dbc6036e`）；实施、审查发现与验证的完整表格在该文件末尾的「实施记录」，本记录只摘要。

## 结论与依据

- 取证：在内置浏览器只读打开官方交易页，从生产包取得资金费率历史（区间、窗口、分页 20 页）、OI 上限拦截条件（只拦截带限价的订单类型）、对比页算法（按 `fundingIntervalHours` 折算、差值取绝对值、过滤下架币）、TP/SL 提示条件（按持仓当前杠杆选档）、杠杆上限算法（第一个 `maxLeverage < L` 的下界）、服务端通知的处理方式（原文 toast）。只读取公开数据，没有下单、签名或改设置。
- 规划：八个只读侦察代理分别给出集成点、模板、契约与测试清单；据此定下六项范围，服务端通知因帧无用户字段、共享 socket 存在跨账户风险而推迟（需要 ADR）。
- 实施：六个功能在各自 worktree 并行实现，每个分支再经独立代理审查→修复→复核。集成时只有文档回归列表与六个语言目录冲突；目录用重新提取加译文回填解决，40 条新文案六种语言均无空译文。
- 对抗审查：Codex 三轮（每轮按功能并行、只读、medium）。第 1 轮 6 个 P2/P3 功能级问题（隐藏页签不取消分页、过期空快照被当成空、时钟回拨、OI 新鲜度、TWAP 预算跨导出丢失等），第 2 轮两项残留 P2，第 3 轮只剩共享订阅巡检用墙钟这一既有问题。每项修复都先写能在旧代码上失败的测试并做变异检查。
- 自查纠正：集成方在 `7db5cf0b` 新增的测试带类型错误（当时没跑类型检查），由第 1 轮修复分支改正；另把两处在页面已返回后断言 `loading` 的测试改为挂起页面（本机未复现偶发失败，按构造去掉竞态）。

## 验证与限制

- 最终头：`pnpm typecheck` 通过；Biome（105 个文件）通过；`git diff --check` 通过；Node 22.15.0、移开 `.env.local` 的 `pnpm build` 通过分块环与包体预算，相对同条件基线总 gzip +30,452 字节，`trade-terminal-page` +1,725（允许 4,000），桌面与手机运行时略降；新块 `fundingComparison` 11,264、`funding-history-panel` 8,902 已登记预算。
- 完整终端测试：第 1 轮修复合入后 621 个文件、7,471 项全部通过；最终头 7,490 项通过，`mobile-agent-sync-modal.test.tsx` 1 项在全量并行时 `vi.waitFor` 超时，该文件与组件本批未改动，单独运行 5/5 通过。
- 浏览器：本分支开发服务器（端口 3025，核对后已停止）、内置浏览器、未连接钱包、脚本派发事件；核对范围见规划的实施记录。HIP-3 部署者免责声明没有代替用户接受。
- 未做：真实钱包与真机验收（TP/SL 提示、TWAP 导出、OI 拦截需要账户；OI 当前无可触发市场）、真人拖动（Playwright 套件属于注入事件，不能证明真实手势）。Codex 沙箱无法运行 Vitest，其结论来自代码阅读与内存探针；测试结果以集成方运行为准。
- 本地证据：Codex 各轮提示与报告在本会话 scratchpad（`codex/r1`–`r3`），未入库。
- 交付前自查（用户要求检查遗漏后补做）：目录无漂移；规范扫描无新增违规；补 `predictedFundings` 的已核对契约；Playwright 六个配置中五个全部通过（共 243 项），`user-menu-recovery` 的 2 项失败在基线 `dbc6036e` 同样出现，另列任务；补做了切市场、主题、中文、lg 宽度的浏览器核对。明细见规划的「交付前自查」。

## 后续与替代关系

- 2026-09-28 已推送并开 PR #50 → `dev`（按 `.claude/rules/git.md`），CI 通过后合入 `dev`（`ac11f81b`），见下方补记。
- 已另列后续任务：共享订阅巡检改为不受时钟回拨影响；杠杆弹窗高杠杆警告在拖动中挂载的既有问题。
  - 2026-09-28 更新：前者已完成，见 [订阅过期巡检改用单调时钟计龄](2026-09-28-subscription-staleness-monotonic-clock.md)（合入本分支 `bd0b80f1`）；后者见 [杠杆警告手势期间保持](2026-09-27-leverage-warning-gesture-hold.md)，经 #53 合入 `dev`，随本分支合并 `dev` 进入。
- 2026-09-28：PR #50 合入 `dev` 的 #48（Earn 借贷页）时，Earn 已占用 ADR 0021、PR #51 的订阅单调时钟占用 0022，未平仓量上限 ADR 改号为 0023，引用同步更新；导航冲突按「Earn 常驻一级、Funding Comparison 只在 More 且排在 Statistics 前」解决。
- 本批新增测试未加入 AGENTS.md 回归分组与 CI 精选列表，入口在各归属文档。
- 下一批可从规划的「范围取舍」表继续：服务端通知（先写传输隔离 ADR 并观察真实消息）、子账户与 HIP-4（需产品与合规决策）。
- 没有被替代的记录；[2026-09-27 覆盖审查](2026-09-27-sdk-api-coverage-review.md)仍有效，其追加的「后续」一节链接本批结果。

## 补记：PR #50 与合并

2026-09-28 推送分支 `claude/sdk-api-review-51a3ea` 并开 [PR #50](https://github.com/zora4523-bot/gatu-app/pull/50)（base `dev`，UTC 2026-09-27 18:53 创建）。开 PR 前在 `0a5b6a02` 合并过一次 `dev`（#46 共享仪表盘外壳、#47 法律页并入应用外壳）；之后应用的 Auto-fix 报告与 `dev` 冲突，又合并了三次：

- `95064568`：带入 #49，工作记录索引冲突按重新生成解决。
- `0297d677`：带入 #48 Earn。导航与三个导航测试按「Earn 常驻一级、Funding Comparison 只在 More 且排在 Statistics 前」合并；Earn 已占用 ADR 0021，#51 占用 0022，未平仓量上限 ADR 改号为 0023；路由树由开发服务器重新生成；六种语言目录用重新提取加两侧译文回填，新增条目均无空译文。本地类型检查、完整终端测试 627 个文件 7,639 项通过（1 项跳过）、Node 22.15 构建与包体预算通过。
- `defb6021`：带入 #51、#52、#53。杠杆编辑器保留最大仓位行，高杠杆警告改用 #53 的手势期间保持条件，测试去掉 #53 删除的 `riskValue` 属性；滑杆与杠杆上限文档里「警告会在拖动中移动滑杆」的说明改为已由 #53 修复。本地类型检查、杠杆/滑杆/水合/巡检相关 14 个文件 290 项、完整终端测试 628 个文件 7,649 项通过（1 项跳过）、Node 22.15 构建与包体预算通过（总 gzip 比脚本基线 +5,488 字节，`trade-terminal-page` 124,831，允许 127,242）。浏览器套件在这三次合并后没有在本地重跑。

用 `gh` 只读核对，head `defb6021` 上 Production Builds、Static Checks、Terminal Tests 与两片 Terminal Browser Tests 五项检查全部通过。仓库的 `allow_auto_merge` 为 false；按用户「CI 通过后合并 PR 到 dev」的要求，以 `gh pr merge --merge --match-head-commit defb6021…` 手动合并，合并提交 `ac11f81b`（UTC 2026-09-28 08:52:36，父提交 `236210c2` 与 `defb6021`）。远端分支没有删除；14 个辅助 worktree 与 28 个未推送的本地辅助分支已在确认均已并入后清理。
