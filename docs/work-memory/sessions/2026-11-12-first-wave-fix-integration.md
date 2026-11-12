<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-12-first-wave-fix-integration",
  "date": "2026-11-12",
  "title": "全局缺陷审查第一波修复的集成：五条分支合一、点击时限、三轮复审与重定包体基线",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "order-entry", "market-recovery", "static-hosting"],
  "summary": "把 2026-11-12 全局审查第一波的五条修复分支（动作截止时间、撤单结果与跨标签页归属、发布脚本、实时存活、Service Worker 资源缓存）合成集成分支 claude/integration-2026-11-12。集成后补上应用层工作流的点击时限（ADR 0053 决策 10），再做三轮复审：五路子代理加逐条对抗质疑、Codex 两轮（7.8 与 8.8）。确认的问题都已修复并各有变异验证；两处属于取舍的由主会话裁定（TP/SL 撤单后仍下替换单；一次授权需要两个签名时第二步从第一步完成起算）。三个 ADR 编号冲突改为 0051、0052、0053。交易启动静态包超出预算，按固定身份构建重定基线。没有推送，没有真实钱包、真机或线上验证。",
  "thread": null,
  "baseCommit": "810a45dba7c8435dcc016b7c1a83e33a7d7362a8",
  "commits": ["65b7aa5f", "eaa1e5a8", "0cdf202d", "eca9c704", "56bed659", "282b5f7b", "248337f0", "baf28664", "070859e3", "0860a0f5", "301a9630", "b8a9477a", "d24454ec", "800e6956", "3a009e53", "32e29922", "9e64c62a", "e6accb8d"],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-11-12-global-defect-review.md" },
    { "path": "docs/work-memory/sessions/2026-11-12-release-script-rollback-and-lambda-probe.md" },
    { "path": "docs/adr/0053-exchange-action-start-deadline.md" },
    { "path": "docs/adr/0052-service-worker-startup-asset-cache.md" },
    { "path": "docs/adr/0051-release-script-rollback-and-lambda-probe.md" },
    { "path": "docs/adr/0050-websocket-recovery-on-resume.md" },
    { "path": "docs/adr/0019-global-trading-notifications.md" },
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "scripts/check-client-bundle-budget.mjs" }
  ],
  "supersedes": []
}
-->
# 全局缺陷审查第一波修复的集成

## 背景与范围

同步记录，2026-11-12，未取得任务标识。[全局缺陷审查](2026-11-12-global-defect-review.md)的第一波修复由 Opus 5.5 子代理在五个工作树里各自完成。运营方随后要求：「子代理修完后继续做全量测试和审查，另外是否安排 codex 对抗 review？」以及「继续，全部完成后汇总给我，多轮无法解决的请你介入」。本记录是集成这一步：把五条分支合到一起，补上合并后才看得见的缺口，做全量测试、构建与复审。

范围之外：推送、开 PR、发布（都需要运营方同意）；真实钱包、真机与线上验证；审查记录里的第二波。

## 结论与依据

五条分支都已合入集成分支；集成后确认的问题都已修复并各有测试与变异验证，没有遗留的 P0–P2。依据分五部分：各分支的审查轮次、集成、集成之后的工作、主会话的裁定。

### 五条分支

每条分支在合入前都经过 Codex 对抗审查（`gpt-6-astra`，只读），发现交回原子代理修，直到没有 P0/P1；多轮不收敛的由主会话改方案或直接接手。

| 分支 | 末端提交 | 决策文档 | Codex 轮次与最后一次评分 | 备注 |
| --- | --- | --- | --- | --- |
| `claude/fix-release-script` | `65b7aa5f` | [ADR 0051](../../adr/0051-release-script-rollback-and-lambda-probe.md) | 2 轮，8.3，其后再修一轮 | [单独的任务记录](2026-11-12-release-script-rollback-and-lambda-probe.md) |
| `claude/fix-realtime-liveness` | `eaa1e5a8` | [ADR 0050](../../adr/0050-websocket-recovery-on-resume.md) 补记 | 3 轮，8.8 | 主会话发现回退条件过宽（任何 `fastAssetCtxs` 错误都永久回退），收窄为只认 `FastAssetCtxsLockedError` |
| `claude/fix-sw-asset-cache` | `0cdf202d` | [ADR 0052](../../adr/0052-service-worker-startup-asset-cache.md) | 4 轮，8.0，其后第五版修订（未再送 Codex，主会话读过） | 「先存后换」两轮不收敛，主会话裁定改为写壳与 v10 相同、资源在写壳之后尽力对账 |
| `claude/fix-cancel-outcome` | `eca9c704` | [ADR 0019](../../adr/0019-global-trading-notifications.md) 补记 | 3 轮，8.4，其后一处小修 | |
| `claude/fix-order-submit-deadline` | `56bed659` | [ADR 0053](../../adr/0053-exchange-action-start-deadline.md) | 3 轮，7.5，其后第五个提交 | 主会话曾误判「授权之后不会自动下单」，子代理指出六个弹窗会在 `Enable` 之后自动执行，于是有了决策 9 |

子代理报告里出现过一次「80 项通过」而 Vitest 实际以退出码 1 结束（4 个未处理拒绝）。此后所有简报都要求报告退出码与 `Errors` 行。

### 集成

集成分支 `claude/integration-2026-11-12` 从 `origin/dev` `810a45db` 开出，依次合入（合并提交）：`282b5f7b`（发布脚本）、`248337f0`（实时存活）、`baf28664`（全局审查记录）、`0860a0f5`（Service Worker）、`301a9630`（撤单结果）、`b8a9477a`（动作截止时间），另有 `070859e3` 一处文档措辞。冲突只在 `CHANGELOG.md` 与 `docs/adr/README.md`，两边都保留。

三条分支各自把新 ADR 编为 0051。集成时发布脚本保留 0051，Service Worker 改为 0052，动作截止时间改为 0053，并改正仓库里对这三个编号的全部引用。

`b8a9477a` 上的基线：`pnpm typecheck` 退出码 0；终端全量 Vitest 722 个文件通过、1 个跳过，10,193 项通过、1 项跳过，退出码 0；`pnpm test:cloudfront` 64 项；`node --test scripts/ci-workflows.test.mjs` 20 项。

### 集成之后的工作

#### 一、应用层工作流的点击时限（ADR 0053 决策 10）

五条分支各自成立，合起来才看得见一个缺口：调度器的 15 秒从入队算起，而很多工作流在调用 `useExchange` 之前自己还有等待（TanStack `refetch` 离线或失焦时无限期暂停、HTTP 快照、Web Lock、宿主晚挂载）。做法是每个这样的工作流在确认处理函数里、任何 `await` 之前记下时刻，在每次提交之前复核，超过就不提交，沿用已有的「未发出」反馈，不新增文案。

- 先做了一次全量入口审计（全部 `useExchange` 调用、唯一不经 `useExchange` 的 `approveAgent`、链上存款与全部 `useMutation`，34 处），再按入口分给八个实现代理，各配覆盖与契约两个独立验证代理。
- 主会话接手的四处：市价平仓的时刻原先在提交宿主的 `execute()` 里创建，宿主晚挂载的最多 5 秒不计入，修复代理在自己的文件范围内改不了，主会话把时刻移到 `beginPositionMarketCloseAttempt()`；API 钱包页、Link mobile device、金库触发的 Agent 注册、嵌入式钱包的手动充值（审计发现的另外四处）由主会话补上时刻的传递。
- 各入口的变异读数（去掉复核、把时刻改到等待之后创建，对应的 16 秒用例变红，14 秒用例保持通过）：Send 3 个、全部平仓与反手 1 组、推荐 3 个、金库 4 个、质押 3 组、TP/SL 5 个（其中 1 个等价变异）、存取款 2 组、市价与限价平仓 3 个，全部还原。市价平仓另有「时刻移回 `execute()`」的变异，被真实弹窗加真实提交路径的用例抓住。

#### 二、五路复审加对抗质疑

集成结果按五个面（签名时限、撤单结果、实时数据、Service Worker、发布脚本）各派一个只读复审代理，另加一个文档与 CI 一致性复审；每条 P0–P2 发现再交给一个独立代理尝试证伪。第一次运行时五个复审代理因额度用尽失败，运营方说「请再试一次」，续跑成功。结果：没有 P0/P1；确认的 P2 八项（质疑者把其中五项降为 P3），另有十余项 P3。

#### 三、Codex 两轮

- 第一轮（点击时限的未提交改动）：7.8，1 项 P1、1 项 P2。P1：API 钱包页与 Link mobile device 的时限只在创建签名器之前查一次，SDK 自己在签名器之前的等待（信号量、跨标签页 nonce 锁、取链 ID）不计入。P2：限价平仓在资产锁回调之前检查，回调本身是异步的。
- 第二轮（第一轮之后的全部改动）：8.8，1 项 P2、1 项 P3，没有 P0/P1。P2：Agent 已授权成功后，builder fee 步骤再超时，界面仍显示「没有签名也没有发出」。

#### 四、确认后做的修改

| 来源 | 问题 | 修改 |
| --- | --- | --- |
| Codex 一轮 P1 | 直接授权的 client 在签名器之前的等待不计入时限 | `createExchangeClient` 第五个参数把调用方的时刻用作该 client 的槽位，钱包包装层在 `signTypedData` 前检查；带 `cacheKey` 的 client 不接受 |
| Codex 一轮 P2 | 限价平仓在资产锁回调之前检查 | `useTrackedOrder` 与 `useTrackedTwapOrder` 在锁回调第一条语句复核（调用方的时刻，或自己起的）；逐仓保证金同样 |
| 复审 P2 | 外部钱包一次授权需要 Agent 与 builder fee 时，第一步弹窗的时间算进第二步 | Agent 注册返回后给 builder fee 换新时刻 |
| Codex 二轮 P2 | 上一条之后第二步仍超时时，提示说什么都没签 | 抛 `TradingAuthorizationIncompleteError`，显示已有的「Failed to enable trading」 |
| 复审 P2 | 质押把签名器处的时限错误归为结果未知 | 按名称归为未提交 |
| 复审 P2 | TP/SL 撤单成功后仍按点击时刻拒绝替换单，仓位失去止盈止损 | 见下「裁定」 |
| 复审 P2（回归） | 记录被挡回后，本页市价平仓会话永远停在对账，挡住全部全局弹窗 | 放锁挡回时按 `origin.sessionId` 释放会话 |
| 复审 P2 | 被接管页标成未确认后，本页通知停在「确认中」 | 本页同步为未确认；接管页结算删除时本页连未确认的也撤掉 |
| 复审 P3 | 改单的中性释放重开已关闭的未确认通知 | 改用 `settleUnconfirmedTradingActionFeedback` |
| 复审 P2 | 非英语用户的语言目录每次发布被对账删掉且不预取 | 壳里新增 `sairn-locale-catalogs` 列表，Worker 读进对账范围；源码里有的语言在 chunk 图里找不到时构建失败 |
| 复审 P3 | 图表字体被字体路由拦截并存进没有淘汰的缓存 | 字体路由排除 `/charting_library/` |
| 复审 P2 | 产物目录路径含方括号时过滤器失效，壳带着一年缓存上传 | 生成任何命令前拒绝这样的目录 |
| 复审 P3 | 失败说明漏掉同阶段未执行的命令；`Cause` 一行约 10 万字符；usage 缺两个参数 | 逐项修正 |
| 文档复审 P3 十一项 | ADR、索引、签名与守则文档、CHANGELOG、CI 清单与 AGENTS 清单与代码不符 | 逐项改正；三个测试文件加入 CI 清单 |

上表第 5 项之后的三块（撤单归属、Service Worker、发布脚本）由三个实现代理并行修，各配一个独立验证代理做变异；验证没有发现 P0–P2，剩下的 P3（测试缺口与两处行为取舍）由主会话收尾。

### 裁定

复审把这几项标为「需要编排或运营方裁定」。主会话做了下面的选择，运营方可以推翻：

1. **TP/SL 撤单完成后不按点击时刻拒绝替换单。** 撤单豁免时限，点击 15 秒之后才返回并不罕见，网络越慢越容易发生；这时放弃替换，仓位就失去原有保护。替换单的触发价是用户输入的绝对价格，执行守卫会在 SDK 边界重新校验。撤单之前的检查保留。代价：替换单离点击多久取决于撤单用了多久。
2. **别的标签页把记录标成未确认时，本页已关闭的「确认中」通知重新显示一次。** 这是状态推进，与本页自己超时的路径和文档里「状态推进时同项重新显示」一致；实现代理原先按简报的字面意思保持隐藏。
3. **语言目录六个全部预取。** Worker 读不到页面的语言设置。每次发布每台设备多取约 0.2 MB（brotli 估计值），其中五个用不到。只取当前语言需要页面把语言告诉 Worker，没有做。
4. **发布脚本不加 `--size-only`。** 文档原先说内容哈希文件「已有即跳过」，实际只在重跑和回滚时跳过，全新构建仍全部重传。改文档而不改行为：新行为没有对真实桶验证过。
5. **回滚到 v11 之前的版本会留下 `assets-v11`。** 只写进文档，不加机制：残留不被读取、不影响功能。

## 验证与限制

以下读数除注明外都在集成分支的工作区上取得（Node 22.15.0），取得之后这份工作区按主题提交为 `d24454ec`（点击时限）、`800e6956`（撤单归属）、`3a009e53`（Service Worker）、`32e29922`（发布脚本）、`9e64c62a`（包体基线）、`e6accb8d`（CI 清单）与随后的文档提交；提交之间没有再改代码。

- `pnpm typecheck`：退出码 0。
- 终端全量 Vitest（`--maxWorkers=4`）：最后一次代码改动之后，722 个文件通过、1 个跳过，10,300 项通过、1 项跳过，退出码 0，没有 `Errors` 行（基线为 10,193 项，净增 107 项）。第二轮 Codex 的修改之前也跑过一次：10,298 项通过，退出码 0。
- `pnpm test:cloudfront`：69 项通过。`node --test scripts/ci-workflows.test.mjs`：20 项。`node --test scripts/inject-shell-preloads.test.mjs`：10 项。
- Biome 对改动的 TypeScript 文件无待修项；`deploy/` 与 `scripts/` 下的 `.mjs` 被 Biome 配置忽略，按原有风格手写。
- 主会话收尾阶段的变异（逐个打上、跑对应测试、还原）共 28 个，全部被抓住：订单与 TWAP 包装器的锁内复核、限价平仓不传时刻、逐仓保证金、直接授权 client 忽略时刻或给缓存的 client 绑定时刻、授权实现不传时刻或不解开 SDK 包装的错误、builder fee 沿用旧时刻或新时刻创建得太晚、质押分类、TP/SL 恢复第二处检查、撤单归属四处、Service Worker 保留集不保留上一代目录、注入脚本不把目录写进壳或缺失语言不失败、`verify` 不查空列表或不查文件存在、目录检查只查父目录、`Cause` 不取首行、授权不换错误类型或不区分有无 Agent 步骤、签名之后才检查时限。
- 三个并行修复代理与三个验证代理另做的变异：撤单归属 4 个（2 个存活，其后补了用例）、Service Worker 5 个（2 个存活，其后补了用例）、发布脚本 5 个（2 个存活，其后补了用例）。
- 生产构建（固定身份、配对关闭、没有 `.env.local`）：449 个分块、无循环静态导入。交易启动静态包 1,656,513，比原基线多 12,033，超出允许的 10,000；与同样方式构建的 `dev` `810a45db` 相比，总量 +4,745、交易启动 +3,987、金库页 +104，其余预算项持平或下降。按实测增量重定这三项基线（`scripts/check-client-bundle-budget.mjs`），读数、逐分块对比与余量见[性能基线文档](../../terminal-performance-baseline.md)，原始输出在 Git 忽略的 `.worklog/2026-11-12/first-wave-fix-integration/`。重定之后在同一份产物上跑完构建链余下的步骤（分块循环、预算、`inject-shell-preloads`、`collect-inline-script-hashes`），全部通过，壳里列出 6 个语言目录；没有再做一次从头到尾的 `pnpm build`。
- `pnpm i18n:extract`：七个目录各多两行来源引用，没有新增或缺失的文案。`pnpm memory:check` 与 `pnpm memory:test` 通过。

仍抓不到的变异（Codex 的覆盖分析，没有实际运行）：把 `use-deposit.ts` 的时限检查挪到最后一组余额与路由请求之前；把金库的检查挪到写入资金占位之前。

### 没有验证的

- 没有真实钱包、真实网络、真机、多标签页真实浏览器的验证；跨标签页的结论来自 jsdom 加锁管理器替身。
- Service Worker：没有对真实构建的连续两个版本做端到端验证，没有 iPhone 验证，没有在 WebKit 上验证 Worker 被终止后的续做。语言目录的改动在一份真实产物的副本上跑过注入脚本，Worker 行为只有 `node:vm` 里的单测。
- 发布脚本没有带 `--execute` 运行过，没有对真实 AWS CLI 验证过滤器行为与新的拒绝路径；回滚没有演练。
- 六个在 `Enable` 之后自动执行的弹窗只读代码核对，没有逐个渲染。
- 浏览器套件（Playwright）与配对开启的生产构建没有运行。

### 剩余边界

- 签名之后的等待不在时限内：owner 签名的身份复核与嵌入式钱包的签名往返、充值签名之后的链上交易、Agent 授权签名之后的 `beforeSubmit`。L1 动作有 `expiresAfter` 兜底，用户签名动作没有。
- 点击时限是逐个工作流显式加的，新工作流容易漏；没有契约测试能自动发现。
- 没有 Web Locks（或锁请求失败）时，另一个标签页先结算并删除记录，本页的市价平仓会话与「确认中」通知没有人收尾，是原有行为。
- 实时数据：同一条连接上有多个快价订阅时锁存可以被绕过；回退路径 10 秒阈值的后果（两条上下文流一起过期会重连共享连接）没有在真机上观察。
- 包体余量很小，见性能基线文档。

## 后续与替代关系

本记录不取代其他记录；它是[全局缺陷审查](2026-11-12-global-defect-review.md)第一波的结果，发布脚本一块另见[它自己的记录](2026-11-12-release-script-rollback-and-lambda-probe.md)。

- 需要运营方决定：是否轮换 IPdata 密钥；`/api/*` 是否加 WAF 或限流；ADR 0042 的索引状态；启动时是否允许显示内容（ADR 0010）；官网行情快照的刷新；是否提示「请关闭其他标签页」；「撤单前已成交」的通知语气；用户签名动作是否在传输层再加一道发送前检查。
- 第二波：启动诊断与入口失败兜底、CI 改跑全量、地区接口限流。
- p41 的真机确认仍未做；PR #159（文档）仍未合并。
- 可选：发布脚本 immutable 阶段加 `--size-only`（先在演练里对真实桶验证）；Service Worker 只取当前语言的目录。
