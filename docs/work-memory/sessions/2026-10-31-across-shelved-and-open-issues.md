<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-31-across-shelved-and-open-issues",
  "date": "2026-10-31",
  "title": "搁置 Across 持久存款地址、核对仍未修复的问题并推送第一批 P1",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "pr-review"],
  "summary": "运营方 2026-10-31 决定「搁置 Across，继续保持目前这个方案」，并要求检查还有哪些问题没有修复。Across：自助申请表即时发放 Integrator ID 与 API Key，可勾选的存款地址接口只有已弃用的 /swap/counterfactual（地址 24 小时有效）；9 月用当时的 Key 调 POST /deposit-addresses 五次都是 403 FORBIDDEN_API_KEY，10-31 用假 Key 发同样请求结果相同；新 Key 未探测。ADR 0004、接入设计与阅读入口补记搁置。未修复清单以 2026-10-30 全功能审查为准：P2 41 项、P3 44 项、四项待运营方决定、2026-10-13 生产审计四项代码遗留与各发布记录的真实验收仍未完成。随后运营方选「推送并开 PR」：推送前补审两个只改测试的收尾提交（Codex 无发现，9/10），修正两份记录的跨分支链接，逐分支 typecheck、Biome、翻译抽取无改动；合并六个分支的预览按 CI 方式构建，预算全部通过，最紧的是总量余 687、vaults-page 余 225、trade-terminal-page 余 458 字节。六个分支已推送并向 dev 开 PR #123–#128，未合并、未上线。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": ["46bcc1fb", "c56dcf4a"],
  "sources": [
    {"path": "docs/adr/0004-across-deposit-addresses.md"},
    {"path": "docs/across-deposit-addresses.md"},
    {"path": "docs/across-reference.md"},
    {"path": "docs/cctp-deposits.md"},
    {"path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx"},
    {"path": "docs/work-memory/sessions/2026-10-13-production-readiness-audit.md"},
    {"url": "https://docs.across.to/tools/integrator-id"},
    {"url": "https://docs.across.to/introduction/api-keys"},
    {"url": "https://docs.across.to/introduction/persistent-deposit-addresses"}
  ],
  "supersedes": []
}
-->
# 搁置 Across 持久存款地址，核对仍未修复的问题，推送第一批 P1

## 背景与范围

同步记录，未取得任务标识。接续 2026-10-30 的全功能审查；那份记录（`docs/work-memory/sessions/2026-10-30-full-feature-audit.md`）随 `claude/p1-order-safety` 进 PR，第一批 P1 的六份任务记录在各自的 `claude/p1-*` 分支上，尚未进入 `dev`。运营方先问 Across 持久存款地址能否申请；10-31 按建议在申请页提交后反馈「表单 无法申请 久地址」，随后决定「搁置 Across，继续保持目前这个方案，目前还有哪些问题没有修复了。检查下」。看过未修复清单后，运营方在确认框里选「推送并开 PR」（问题是「推送第一批六个 P1 分支，并向 dev 开 PR 吗？」）。本记录写决定、证据、未修复清单与推送经过；除两份记录的链接写法外，没有改产品代码或其他分支的内容。

## 结论与依据

### Across 持久地址：搁置

- **自助申请表**（https://docs.across.to/tools/integrator-id，2026-10-31 读取页面脚本 `9278f3f99a659f9f.js`）：表单把 `email`、`projectName`、`discord`、`telegram`、`website`、`twitter`、`blurb`、`category`、`chains`、`apis` 发到同源 `/api/integrator`，答复里直接带 `integratorId` 与 `apiKey` 显示在页面上；已申请过的答复显示 `API Key & Integrator ID Already Generated` 并指向 Telegram（https://t.me/acrosstg）。可勾选的接口里与存款地址有关的只有 `/swap/counterfactual`（标签 `Deposit Addresses — Generate counterfactual deposit address`）；官方 FAQ 写明它已弃用、地址 24 小时有效，由 `POST /deposit-addresses`（`expiresAt` 为空的持久地址）取代。[API Keys & Integrator ID](https://docs.across.to/introduction/api-keys) 说 Integrator ID 经共享沟通渠道（Telegram、Slack）申请。表单没有条款勾选项。
- **9 月证据**（归档标签 `archive/across-deposit-addresses-20260920-weekly-revisions` 里 09-13、09-14、09-15 的任务记录）：用当时的 Key 调 `POST /deposit-addresses` 五次（三次普通请求，一次 SPOT 目的地、一次 PERPS 目的地），全部 403 `FORBIDDEN_API_KEY`「Invalid or missing API key」；`/swap/approval` 带不带 Key 都返回 200，说明不了权限。当时准备过一份支持请求（本机 `.worklog/2026-09-13/across-normal-request/`，未入库），记录里没有发送的记载。
- **10-31 对照**：用明显无效的 Key（`not-a-real-key`）和 9 月探测相同的故意无效请求体（目的链 1337、收款与退款地址都是非法值，不可能建出地址）发一次 `POST /deposit-addresses`，答复同样是 403 `FORBIDDEN_API_KEY`「Invalid or missing API key」（请求编号 `sfo1::iad1::h7j26-1793380759423-79bc891a1a52`）。所以在这个接口看来，9 月那把 Key 与假 Key 没有区别；同一请求体先被鉴权拒绝，说明鉴权在请求体校验之前。由此推断（未经 Across 确认）：持久地址权限需要 Across 团队另行开通，自助表单拿不到。
- **决定**：运营方不再测试新 Key，搁置 Across。[ADR 0004](../../adr/0004-across-deposit-addresses.md)、[接入设计](../../across-deposit-addresses.md)与[阅读入口](../../across-reference.md)已补记。现行方案不变：新存款只走 [CCTP](../../cctp-deposits.md)（外部钱包手动存款与 ADR 0040 的邮箱自动存款），另有 ADR 0034 的银行卡入金；提款由 `deposit-modal.tsx` 按 `usdcRouting` 走 CCTP（`sendToEvmWithData`）或 `withdraw3`。
- **来源链**：全功能审查决定表里「CCTP 流水显示具体来源链」要调 Across 的 `hyperliquid-transfers` 接口（把用户地址发给 Across、改 CSP），本记录把它随 Across 一并列为搁置，对应的待启动任务卡已撤下。运营方没有单独就这一项表态；如果只想搁置持久地址，这一项可以单独恢复。

### 2026-10-31 仍未修复的问题

编号与原文见全功能审查记录「二审结果」各表。远端 `dev` 仍是 `d99c2bc9`、`main` 仍是 `cdb47637`（`git ls-remote`），审查之后没有别的修复进入 `dev`，线上 p35 仍有下表所有问题。

| 类别 | 内容 | 现状 |
| --- | --- | --- |
| 已修、已开 PR、未合并 | 第一批 P1：#123 `claude/p1-order-safety`（M1、A8、A1，交易延迟保护开关、Scale USD 封顶、TWAP 价格校验）、#124 `claude/p1-funds-safety`（D1、D2、B4/D4）、#125 `claude/p1-vault-dashboard`（E1、E16、E6、E14、E2 的 Max、E3、E4）、#126 `claude/p1-history-tables`（B1、B2、B10、B16、D3、B5、B19、子账户与持仓量奖励流水）、#127 `claude/p1-chart`（C1、C14）、#128 `claude/p1-order-modify`（B3、只减仓触发单改单） | 10-31 推送并向 `dev` 开 PR（见下节）；#124 与 #126 后合进 `dev` 的那个要给 `position-market-close-entry.test.tsx` 的 HIP-3 保证金用例补 `reverseBlocked: false` |
| 已修、未推送（其他会话） | `claude/link-language-review-fixes`（5 个提交：带 `lang` 的导航改为网络优先，回访者点语言链接时不再启动上一版缓存的壳而丢掉语言参数）；文档分支 `claude/release-p35-record`、`codex/work-memory-2026-10-19`、`codex/work-memory-2026-10-26` | 都不在远端 |
| P2，41 项 | 下单 A2–A5、A11、A12；行情 M2、M4、C2–C4、C7、C9、C12、C15、C18；表格 B6–B9、B11、B13、B17、B21、B20/D9；资金 D5–D8；仪表盘 E2 其余（金库全额提取）、E5、E9、E12、E13、E15；多语言与全局 F1–F3、M3、M9；布局 F4 | 未开始；F4 需运营方先决定 |
| P3，44 项 | 审查记录「P3 与不成立」所列（B19 已随第一批修复），另含两条未送审的观察 | 未开始 |
| 待运营方决定 | 审查记录「需要运营方决定」第 2 项（市价滑点默认值与上限）、第 3 项（下单后是否保留 TIF、只减仓、TP/SL 勾选）、第 4 项（md 宽度的堆叠布局，F4）、第 6 项（Chase、Trailing Stop、现货 Strict 名单、子账户等；多资产存款随本记录搁置）；ADR 0041 记录里已有订单历史的 `default` 账户与 `dexAbstraction` 账户是否照官方做强制迁移弹窗 | 未决定 |
| 需运营方操作或取证 | 金库全额提取（`usd: "0"`）先在测试网提取一次再写 ADR；只减仓触发单改单的 `a: true` 与 `oid` 是否保留要在测试网签名核实；GitHub 分支保护；各发布记录列出的真实验收（真实下单与过期拒绝、发送与提现、金库、推荐、邮箱自动存款、外部钱包无名 Agent 与首单、配对清单 RD-1..RD-3、物理滑杆、银行卡 CF-11 与法律审阅、新账户自动设为统一账户、日语母语审校） | 未做 |
| 2026-10-13 生产审计的代码遗留 | 现货缺价时用入场成本冒充市值；图表 iframe 同源 `unsafe-inline`；Service Worker 缓存 opaque 图标；外部钱包存款 `directSubmissionStarted` 缺 Hook 级异常路径测试（OI 未知放行按 ADR 0023 维持，不算缺陷） | 未修 |
| 其他记录的遗留 | 日语三处价格值显示无上下文的「市場」；发送确认步骤的 320px 换行没有用浏览器布局套件核对；ADR 0041 取证时的三个旁观现象（Privy 登录窗口钱包图标晚出现、内置浏览器面板 Service Worker 注册失败、Privy `analytics_events` CORS 报错） | 未修 |

本轮在预览分支 `fccfa225` 上抽查，下列问题仍在：M3（`command-menu.tsx` 仍写死 `Search markets...`）；A4（`lib/errors/definitions/twap.ts` 在设了触发价时仍拿最高/最低价与标记价比较）；D8（`send-modal.tsx` 的 Max 仍对数字类型的 `availableBalance` 向下取整）；M2（`styles.css` 未改，订单簿价格列仍是 `minmax(0, 1fr)`）；F1（逐条解析各语言 `messages.po` 的非废弃条目：es、fr、hi、ar 各 31 条空译文，zh、ja 为 0）。其余条目没有逐条重读代码：它们所在的文件要么第一批没有改动，要么改动不在该问题的范围内。

### 推送第一批 P1（2026-10-31）

- **推送前补审。** 第一批里有两个修复提交只改测试，之前没有经过第二方审查：
  - `b22d2ff2`：冻结本机时钟与单调时钟，断言过期时间的偏差恰为 0；
  - `690069fa`：流水接收方的大小写用例。

  Codex（`gpt-6-astra`，只读，low）逐条推演了变异，结论是无发现，评分 9/10：
  - 新用例直接抓到：客户端多加 1 毫秒、改用本机时钟、期限改为 16 秒、两网共用时钟缓存、去掉接收方小写化。
  - 由同文件的单元用例抓到：采样年龄恒为 0、去掉往返补偿。
  - 由相邻的原有用例抓到：去掉发送方小写化。

  这些变异是审查方静态推演的，本轮没有实际注入。
- **记录链接。** `claude/p1-funds-safety` 与 `claude/p1-vault-dashboard` 的任务记录用相对链接指向审查记录，而审查记录只在 `claude/p1-order-safety` 上，这两个分支单独合并时链接会断。两份记录改为与其他三份相同的写法（写记录编号并注明所在分支），提交为 `46bcc1fb`、`c56dcf4a`，都只改文档。其余分支新增的文档链接逐条核对过，目标都在本分支内。
- **逐分支静态检查**（测试工作树，Node 22.15.0）：六个分支头各跑 `pnpm check`（Biome）、`pnpm i18n:extract`、`pnpm typecheck`，全部通过，抽取后没有改动。
- **包体。** 构建条件：隔离工作树 `/tmp/claude-501/wt-p1-build`，预览 `fccfa225`；Node 22.15.0、pnpm 10.21.0；配对关，没有 `.env.local`；`SAIRN_BUILD_SHA` 为 40 位提交号，`SAIRN_RELEASE_ID=ci-37000000000-1`，`NITRO_PRESET=node-server`。构建、循环导入检查与预算检查都通过，`perf:startup` 正常。

  | 项目 | 读数（gzip 字节） | 余量 |
  | --- | --- | --- |
  | 总量 | 3,359,806 | 余 687（基线 +9,313，允许 +10,000） |
  | `vaults-page` | 29,850 | 余 225 |
  | `trade-terminal-page` | 126,784 | 余 458 |
  | 手机运行时 | 118,342 | 余 2,238 |
  | 桌面运行时 | 201,805 | 余 10,878 |
  | 交易首屏 | 1,643,631 | 比基线少 298 |

  其余页面余量都在 800 字节以上。这是六个分支合在一起的读数；单个分支只带其中一部分增量，没有分别构建。总量会随提交哈希与发布标签浮动约 0.5 kB，所以最后合进 `dev` 的那个 PR，CI 读数可能贴线；六个都合入后，下一个代码 PR 大概率要先重定基线。
- **推送与 PR。**
  - 推送前再次核对，`origin/dev` 仍是 `d99c2bc9`。
  - 推送后远端分支头与本地一致：`b22d2ff2`、`46bcc1fb`、`c56dcf4a`、`690069fa`、`01a547f0`、`65f765e8`。
  - 六个 PR 都以 `dev` 为基：#123 下单安全、#124 资金安全、#125 金库与仪表盘、#126 历史与表格、#127 图表、#128 改单。
  - 正文写明各自的验证、上面的包体数字、合并须知与未做事项。之后只改过正文（补互相引用的编号），没有再推送。
  - 开 PR 时每个分支各触发一轮 CI。结果以 GitHub 为准，本记录不记。
- **合并须知。** 任意两个 PR 都在 `CHANGELOG.md`（Unreleased › Fixed）与 `docs/work-memory/INDEX.md` 冲突。先合一个之后，下一个要合并 `dev`、保留双方的 changelog 条目、用 `pnpm memory:index` 重建索引，再推送一次，又是一轮 CI。合并有两种做法，都需要运营方另行同意：
  - 逐个合并：还要再跑五轮 CI。
  - 集成 PR：等六个都通过、审查意见处理完，从最新的 `dev` 建集成分支，逐个 `--no-ff` 合并，一次解决冲突，开一个集成 PR，只多跑一轮。仓库里 #53、#71 用过这种做法；2026-09-28 #53 合并时，被取代的 PR 由 GitHub 自动标为已合并。

  另外，#124 与 #126 之间还有 `reverseBlocked` 的语义冲突，见上表。

## 验证与限制

- `git ls-remote origin`：`dev` 为 `d99c2bc9`，`main` 为 `cdb47637`。本地分支是否在远端：上表列出的分支在远端都不存在。
- 预览分支 `claude/p1-preview`（`fccfa225`，合并六个 P1 分支）：`pnpm typecheck` 通过；`pnpm --filter @sairn/terminal test --maxWorkers=4` 693 个文件中 690 通过、1 跳过、2 失败。`vite-development-cache` 是沙箱禁止监听端口（各分支记录里已知）；`client-bootstrap-error` 的「最小遥测模块加载失败仍显示安全回退页」一项用时 1006 毫秒失败，当时另一个工作树在并行安装依赖，单独重跑该文件 2 项通过，判断为负载下超时。
- 未做：
  - 用新 Key 探测（运营方选择不测），也没有联系 Across；
  - P2、P3 条目没有逐条重读代码，只抽查了上述五项；
  - 单个分支没有分别构建，只构建了六个分支合在一起的预览；
  - 推送前没有重跑浏览器套件，以各分支记录为准；
  - 真实交易、资金与真机验收都没做。
- `i18n:extract` 在第一批记录里打印的缺失数（ar、es、fr、hi 66，zh 3）与上面逐条解析的数字口径不同，原因未核对；界面上回落英文的是 31 条那一组。

## 后续与替代关系

- Across 持久地址重新启动的条件：先经 Across 的共享渠道取得 `POST /deposit-addresses` 权限并用无效请求体探测确认（预期 400 或 422，而不是 403），再按现行架构重做服务端设计（ADR 0004 补记）。
- 第一批 #123–#128：
  - 先等 CI 与审查意见。没开 Auto-fix 时，机器人评论不会有通知，合并前要用 `gh api repos/<owner>/<repo>/pulls/<N>/comments` 与 `.../reviews` 逐条看一遍。
  - 然后请运营方决定合并方式：逐个合并，还是开集成 PR。
  - 六个都合入后，下一个代码 PR 先按 `docs/terminal-performance-baseline.md` 重定基线。
- 第二批按审查记录的修复规划分 PR。
- 本记录所在的分支 `claude/across-shelved-record` 没有推送。按惯例，它随下一次 PR 更新（例如合并 `dev` 解决冲突时）一起带上，不单开文档 PR。
- 本记录不替代全功能审查记录与 2026-10-13 生产审计记录，只补充 10-31 的现状；ADR 0004 的历史方案保留不改。

## 合入补注（2026-11-02）

本记录的两个提交（`680c93e1`、`5d2e72c6`）一直只在本地分支 `claude/across-shelved-record`，没有像上一节设想的那样随下一次 PR 带上。2026-11-02 由集成分支 `claude/local-records-sync` 以 `--no-ff` 合并（合并提交 `cfd3e0fd`），随该分支的文档 PR 进入 `dev`；[ADR 目录](../../adr/README.md)的 0004 行与[文档地图](../../README.md)的 Across 行同时补记搁置。

「2026-10-31 仍未修复的问题」一表是当天中午的快照，原文保留。之后的变化以后续记录为准，本补注没有逐项重核：

- 第一批 #123–#128 由集成 PR #129 合入 `dev`（`90658436`，2026-10-31 20:26），六个分支头都是它的祖先；第二批五个 P2 分支在同一个 PR 里，见 [P2 集成记录](2026-10-31-p2-integration.md)。审查确认仍存在的问题又经 PR #131（`ec067207`）与 PR #132（`26c06d02`）处理，见[第一组](2026-11-01-audit-confirmed-fixes.md)与[第二组](2026-11-01-audit-group2.md)记录。
- 「已修、未推送」一行里的 `codex/work-memory-2026-10-19`、`codex/work-memory-2026-10-26` 由同一集成分支合并；`claude/link-language-review-fixes` 与 `claude/release-p35-record` 不在本次范围，2026-11-02 查询时仍不在远端。

2026-11-02 按[阅读入口](../../across-reference.md)只读复核了 ADR 0004 补记引用的官方页面（读 `llms.txt` 与各页 `.mdx` 正文）：

- [API Keys & Integrator ID](https://docs.across.to/introduction/api-keys) 仍写 Integrator ID 经共享渠道（Telegram、Slack）向 Across 团队申请；[Technical FAQ](https://docs.across.to/introduction/faq) 仍写 `GET /swap/counterfactual` 已弃用、地址 24 小时有效。
- [持久地址指南](https://docs.across.to/introduction/persistent-deposit-addresses)开头的警示框写明 `POST /deposit-addresses` 需要带 `deposit-address` 权限的 API Key，并把取得 Key 的链接指向自助申请页 [`/tools/integrator-id`](https://docs.across.to/tools/integrator-id)；该页的 `.mdx` 只有标题和一个表单组件，读不出表单发放的 Key 带哪些权限。
- 所以正文「持久地址权限需要 Across 另行开通，自助表单拿不到」仍是未经确认的推断：官方指南把自助表单当作取得 Key 的入口，表单里勾选存款地址接口得到的 Key 是否带 `deposit-address` 权限，没有探测，也没有向 Across 确认。搁置决定不变。重新启动时可以先用自助表单新发的 Key 按正文的无效请求体方法探测一次：仍是 403 说明没有权限，400 或 422 说明鉴权已通过。

核对方法与证据见[本地记录分支合入记录](2026-11-02-local-record-branches-sync.md)。
