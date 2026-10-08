<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-08-agent-docs-handover",
  "date": "2026-10-08",
  "title": "更换 Claude 账号的交接：私有记忆整理进仓库，新增 Agent 工作手册，清理过时的架构说法与发布状态",
  "kind": "task",
  "status": "recorded",
  "topics": ["docs-governance", "work-memory", "brand-identity", "static-hosting"],
  "summary": "用户要求整理开发文档，尤其是 agent 读的文档，保证换 Claude 账号后记忆不丢，现行文档不再引用旧架构与旧品牌。逐份核对本机 76 份 Claude 私有记忆：持久经验写进新的 docs/agent-handbook.md（协作约定、工作树、CI、Codex 审查、发布要点、换账号清单），产品知识写进手续费展示、协议实测行为、图表 K 线闸门等归属文档，AGENTS.md 加「Operator collaboration」指针节；改正 README、codex-onboard、agent.md 与代码规范里不存在的 hook 名、运行时 SSR、Node 24 等旧说法，替换签名文档里的旧实施方案，刷新 ADR 目录、文档地图和 16 份 ADR、8 份专题文档的发布状态。本文还给出 2026-10-08 的状态快照、待办汇总与每份私有记忆的去向。只做文档与链接检查，未运行应用测试。",
  "thread": null,
  "baseCommit": "498ea17a",
  "commits": ["345a2143"],
  "sources": [
    { "path": "docs/agent-handbook.md" },
    { "path": "AGENTS.md" },
    { "path": "agent.md" },
    { "path": "docs/README.md" },
    { "path": "docs/adr/README.md" },
    { "path": "docs/fee-display.md" },
    { "path": "docs/hyperliquid-signing.md" },
    { "path": "docs/hyperliquid-sdk-reference.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "codex-onboard.md" },
    { "path": "deploy/cloudfront/README.md" },
    { "path": "docs/work-memory/sessions/2026-10-03-cloudfront-release-p24b.md" }
  ],
  "supersedes": []
}
-->
# 更换 Claude 账号的交接：私有记忆整理进仓库，新增 Agent 工作手册，清理过时的架构说法与发布状态

## 背景与范围

同步记录，未取得任务标识（`thread: null`）。2026-10-04 用户要求：「请整理下项目的开发文档 特别是agent 阅读的文档 确保更换Claude 账号后能够有记忆 最近做的commit 不用引用旧的架构 旧的品牌」。当天的工作在负责扫描旧说法的子代理撞上旧账号的每周用量上限后中断；2026-10-08 用户换了账号，说「Try again」，在同一个工作树里继续。

- 工作树：`.claude/worktrees/agent-docs-handover`，分支 `claude/agent-docs-handover`。2026-10-04 从 `dev` `498ea17a` 开始；2026-10-08 把未提交的改动作为补丁保存，快进到 `dev` `345a2143`（PR #77 已合入）后重新应用，没有冲突。
- 「最近做的 commit 不用引用旧的架构、旧的品牌」理解为：agent 会读的现行文档要描述现在的架构与品牌。提交历史和历史记录不改写（[文档体系](../../documentation-system.md)要求追加更正、保留原文）；[ADR 0027](../../adr/0027-brand-single-source-and-identifier-rename.md) 列出的 `gatu` 标识（AWS 资源名、仓库名、过渡期旧域名组与旧请求头）照旧保留。
- 输入：本机 Claude 用户级记忆目录（`~/.claude/projects/<项目>/memory/`），2026-10-04 有 73 份，2026-10-08 有 76 份（其他会话期间新增了 3 份），约 38.5 万字节。2026-10-04 用两个只读子代理把其中 46 份任务类记忆与仓库对照；扫描旧说法的第三个子代理因用量上限失败，2026-10-08 改由脚本扫描现行文档后逐条人工判断。
- 本机证据：没有生成 `.worklog/` 快照。

## 结论与依据

### 新增与修改

| 文件 | 改动 |
| --- | --- |
| `docs/agent-handbook.md`（新增） | 与运营方的协作约定、仓库与 CI、共享检出与工作树、本地运行与浏览器验证、构建测试与包体、Codex 对抗审查、发布要点、换账号或机器的清单；内容来自私有记忆，逐条核对过当前代码与配置能核对的部分 |
| `AGENTS.md` | 新增「Operator collaboration」节：首条指向手册，其余是语言、只能由运营方做的事、需要先问的动作、持久知识必须进仓库四条不变量 |
| `agent.md` | 开头与「Completing work」指向手册；hl-react 的 hook 改成实际存在的 `useInfo(method, params)`、`useSubscription(method, params)`、`useExchange(method, options)`（原文写的 `useInfo*`、`useSub*`、`useAction*` 在代码里不存在） |
| `.claude/rules/code-style.md`、`.claude/rules/hyperliquid.md` | 同上改 hook 名；新增 Big.js `toString()` 在 1e-7 以下变成指数写法的规则 |
| `.claude/skills/auto-commit`（新增软链）、`.claude/skills/commit.md` | 让 Claude Code 也能加载 AGENTS.md 要求的 auto-commit 技能；提交类型去掉 commitlint 不接受的 `i18n`，写明必须带 scope |
| `README.md`、`codex-onboard.md`、`apps/terminal/README.md` | 去掉运行时 SSR、Node 24、TanStack Start 1.132、`I18nReadyGate`、旧 hook 名等过时说法；`codex-onboard.md` 按现状重写，注明旧版提交号；README 的规则表补上 `startup-rendering.md`，说明 AGENTS.md、agent.md 与手册的分工 |
| `docs/hyperliquid-signing.md` | 删掉末尾早期的实施方案（`src/lib/hyperliquid/{signing,trading,admin}` 目录、`useExchangeOrder` 等 hook、未勾选的迁移清单），换成「签名方现在在哪」：`registries/exchange.ts` 按方法选签名方，邮箱会话用精确 owner，外部钱包与 Agent-only 会话用 Agent；旧方案仍在 `signing-architecture-proposal.md` |
| `docs/adr/README.md`、16 份 ADR 状态行、8 份专题文档状态行 | 按 `git merge-base --is-ancestor` 对照 p22 `246c57bc`、p23 `121e8e76`、p24 `3ced842e`、p24b `6da4c15a` 补记首次发布的版本；ADR 0027–0030 四行直接采用草稿 PR #73 的原文，避免它合并时冲突 |
| `docs/README.md` | 新增手册入口；刷新 SPA 托管、银行卡入金、资金弹层、SDK 第一批接入的状态；链接新的手续费文档 |
| `docs/fee-display.md`（新增） | 官方 `feeRates()` 公式、本站实现位置、核对方法与两项未修偏差 |
| `docs/hyperliquid-sdk-reference.md` | 新增「文档没写的实测行为」：分页上限在聚合之后、`userFunding` 每页 500 且升序、自成交不产生 fill、`fastAssetCtxs` 先快照后增量、触发单没有 TIF |
| `docs/runtime-guardrails.md` §4 | K 线请求闸门 `candle-gate.ts` 的三条不变量、事件驱动恢复与未做的 P1 |
| `deploy/cloudfront/README.md` | 银行卡入金闸门一行补记 p24b 跳过前两阶段；每次发布在 `verify` 后跑 `csp-coverage`，构建放在仓库外工作树并显式写开关 |
| `docs/across-deposit-addresses.md`、`notes/index.md` | 追加更正：Across 实现分支已归档且部署设计基于已退役的 EC2；「SSR 语言差异」在运行时 SSR 关闭、启动改为空白到就绪后已不存在 |
| `docs/documentation-system.md`、`docs/work-memory/README.md`、`topics.json` | 说明私有记忆不属于文档体系、交接时要写交接记录；Claude 会话文件也只在本机；元数据 JSON 的引号与四个必需标题；`docs-governance` 议题加入手册 |

没有改的：`deploy/website/README.md`、`docs/brand-assets.md` 与 ADR 0031、0032 的现状更新已在草稿 PR #73 里，这次不重复改，免得它合并时冲突。CHANGELOG 按它自己的约定（发布版本切出前都在 Unreleased）保留原样。迁移计划、切换方案与历史记录里的 `gatu` 都是带日期的事实，没有改。

### 状态快照（2026-10-08 03:56Z 查询）

- 线上：两个网络都是 `cloudfront-2026-10-03-p24b`，提交 `6da4c15a`（`build-meta.json`）。银行卡入金主网与测试网开，主网赞助存款开，测试网外部钱包存款开，测试网赞助存款关，移动配对关。
- `origin/main` = `6da4c15a`；`origin/dev` = `345a2143`。`dev` 比 `main` 多 PR #77（ADR 0033 邮箱静默建钱包、ADR 0035 图表价格精度），尚未发布。
- 打开的 PR：#78（存款弹层重排、CCTP 最低额与加载回退 → `dev`）；#73（草稿，退役旧域名组与过渡请求头，运营方定 2026-10-09 之后再合）。
- 只在本机、没有推送的提交：主检出现在签出在 Codex 周整理分支 `codex/work-memory-2026-10-05`（`42f2bd23`，基于 `498ea17a`，给 43 份记录补了提交引用与后续说明，重建 INDEX，新增 `2026-10-05-weekly-memory-review.md`）。它和本次改动不重叠（INDEX 除外，合并时重新生成即可）；是否推送由运营方决定。
- 工作树：`gatu-release-p24`（p24 产物）、`gatu-release-p25`（p24b 产物，p25 的回滚目标）、`infallible-goldstine-02a7e3`（分离头 `20d0e01f`）、`silent-email-wallet`（`1de833b8`，内容已随 #77 进入 `dev`）、`sync-code-start-dev-08b8d0`（分支 `claude/arbitrum-network-connection-issue-8325cd`）、`wonderful-goldberg-e47b19`（分支 `claude/tradingview-chart-loading-issue-230090`），以及 Codex 的 `codex/01-builder-market-catalog`。后两个工作树 2026-10-08 有会话在用，清理任何一个前都按手册第 4 节核对。
- GitHub：仓库没有 Actions 密钥，所以依赖 `CLAUDE_CODE_OAUTH_TOKEN` 的 @claude 工作流现在不能用；`Claude Code Review` 工作流已手动停用。

### 待办与待决（汇总）

各项的详细依据在所列文档；这里只汇总，方便换账号后从一处开始。

**发布与上线**

1. 银行卡入金上线后的缺口：线上真实购买（验收清单 CF-11）、法律文本审阅、沙盒阶段各行、Privy 应用的 development mode、开放地区（[验收清单](../../privy-card-funding-launch-checklist.md)、[ADR 0034](../../adr/0034-privy-card-funding.md)）。
2. p25：#73 在 2026-10-09 之后合并，然后按[切换方案](../../sairn-domain-cutover-plan.md)阶段 5 执行（发布 p25 并验证；从源站请求策略删除 `X-Gatu-Forwarded-Host`；Lambda 环境变量改为 `SAIRN_*`；30 天后删除 gatu 证书；移除临时 IAM 策略 `gatu-edge-domain-cutover`）。回滚目标是 p24b，产物在 `gatu-release-p25`，所以 p25 要在另一个工作树构建。#73 与本次改动在 `docs/README.md` 相邻两行都有修改，合并时会有一处小冲突，保留两边即可。
3. `dev` 上未发布的 #77：下一次发布带上。邮箱静默建钱包的真实注册验收只能在线上域名做（2026-10-02 读到的 Privy 应用公开配置没有 localhost 来源）。
4. #78 待审查与合并。
5. 另一个会话 2026-10-08 诊断出手机端外部钱包（Privy 经 WalletConnect）存款时报「Wallet is not connected to Arbitrum One」的根因：`use-deposit.ts` 的 `getProviderChainId` 不认数字形式的 `eth_chainId`。只诊断、未改代码，分支 `claude/arbitrum-network-connection-issue-8325cd`，由该会话记录。

**真实环境验收（各文档已记录，未做）**：资金与交易弹层的「点击即关、结果走通知」、ADR 0026 的 Privy 主题、Earn 的借入与偿还、未平仓量上限（当前没有可触发的市场）、移动配对真机清单（开关保持关闭）、盈亏分享卡真机分享、状态动效补充符号与悬停色的设计确认。

**已知未修的问题（这次从私有记忆写入仓库）**

1. 手续费展示的两项偏差：缺少 `deployerFeeScale` 时 HIP-3 费率翻倍；没有 aligned quote asset 折扣（[手续费展示](../../fee-display.md)）。
2. `apps/terminal/src/routes/referrals.tsx` 的 SEO 描述还写 "claimable rewards"，界面已统一成 unclaimed（2026-08-30 审查的 P4；2026-10-08 确认文字仍在）。
3. `account-mode-unresolved` 与 `account-mode-unsupported` 共用一条资金不可用提示（`use-funds-action-availability.ts`；2026-09-09 审查；2026-10-08 确认）。
4. `i18n:extract` 是不带 `--clean` 的 `lingui extract`，废弃条目以 `#~` 留在目录里（2026-09-09 审查提出；是否要改待决定）。
5. 发送弹层在精确字符串之外还留着一份 `Number` 余额；发送与划转的守卫抛英文的 `ExchangeRequestInvalidatedError`（2026-09 审查的 P3，当前状态只部分核实）。
6. 浅色主题买卖按钮对比度约 4.34:1，低于 AA 的 4.5:1，手机下单页重做时向运营方说明后接受。
7. TradingView K 线闸门的 P1 没做：跨标签页冷却、所有 info 请求的调度、后端代理（[运行时约束 §4](../../runtime-guardrails.md)）。
8. 与官方终端的两处差异待决定：下单确认缺少「限价比最优价激进 3% 以上」的警告；`TradingActionButton` 未就绪时把危险样式的按钮改成 Enable，而官方是换成另一个按钮组件（2026-09-20 方案清单 ④⑤）。
9. i18n 后续：RTL 视觉镜像、首次访问按 `navigator.language` 选语言、ar/hi 的 `msgid === msgstr` 检查（2026-08 的清单，没有重新核对是否已做）。
10. 地区限制没有统一的专题文档（现行行为分散在 [CCTP 充值](../../cctp-deposits.md)「Geo Enforcement」、[提款](../../withdrawals.md)与 `config/geo.ts`）。法律问题待定：JP 被限制但不在条款 §2.2 里；条款点名的克里米亚、顿涅茨克、卢甘斯克不在限制清单。
11. 主检出根目录有 `.env.across.local` 与 `.across.local/`（Across 相关凭证，没有读取），保留还是删除由运营方决定。
12. 运营方自行核对：2026-06 的会话里曾把一个 GitHub 令牌、旧 Privy 应用的 secret 和一个 IPdata 密钥贴进聊天，记录里没有写是否已吊销或轮换；AWS 账号 root 的访问密钥 2026-09-17 停用但没有删除。

**文档后续**

1. 写统一的地区限制专题文档，按当前代码描述。
2. 其他专题文档正文里可能还有过时的「未发布」，这次只改了状态行。
3. 根目录的 `review*.md`、`launch-review-*.md` 等原始审查文件按文档体系的决定留在原处，`notes/index.md` 负责编目；要搬进 `notes/` 需要同时改所有引用。
4. `.claude/skills/commit.md` 是平铺的文件，Claude Code 不会把它当技能加载（技能要求 `<名称>/SKILL.md`）。和 auto-commit 内容重叠，是否保留由运营方决定。

### 私有记忆的去向（逐份）

「已有」表示仓库里原来就有对应内容；「本次」表示这次写进仓库；「过时」表示内容已被后来的代码或决定取代，不再迁移。

| 私有记忆 | 仓库里的位置 | 说明 |
| --- | --- | --- |
| account-overview-refactor-review | 已有：`account-overview.md`、ADR 0001 | 展示差异列在下面的附录 |
| across-branch-archive | 已有：`2026-09-20-wallet-review-04.md`；本次：ADR 目录 0004 行、`across-deposit-addresses.md` 状态行 | 本地凭证文件列入待决 11 |
| agents-md-pointer-principle | 已有：`documentation-system.md`、AGENTS.md 前言、`2026-09-13-agents-brand-cleanup.md` | 记忆里的标题与 AUTO-COMMIT 块已过时 |
| brand-naming | 已有：`brand-assets.md`、ADR 0027–0032、切换方案与 10-01 的记录 | p25 列入待办 2 |
| chart-price-precision | 已有：ADR 0035、`2026-10-02-chart-price-precision.md`、运行时约束 §4 | 已随 #77 进入 `dev` |
| ci-gate-assessment | 已有：ADR 0016、`2026-10-02-ci-listed-test-paths.md`；本次：手册第 3 节 | |
| cloudfront-release-gates | 已有：`deploy/cloudfront/README.md`、各次发布记录；本次：手册第 8 节 | |
| cn-merge-theme-scales | 已有：样式指南「Menu popups」、设计令牌、`class-merge-theme-scales.test.ts` | |
| codex-cli-delegation | 本次：手册第 7 节 | 各轮细节在对应任务记录 |
| dashboard-chrome-preload | 已有：`2026-09-27-dashboard-route-chrome-preload.md`；本次：手册第 6 节（体积定位方法） | |
| date-locale-contract | 已有：`2026-10-02-date-locale-reactivity-contract.md`、AGENTS 格式化契约 | |
| debug-in-default-chrome | 本次：手册第 2、5 节 | |
| deposit-walletconnect-chainid-number | 进行中，待该会话记录 | 列入待办 5 |
| earn-funds-action-hardening | 本次：`.claude/rules/hyperliquid.md` 第 6 条 | 金库侧修复已在 `5b79e735` 进入 `dev`；effect 时序教训见附录 |
| earn-page | 已有：`earn.md`、ADR 0021、`2026-09-27-earn-page.md`；本次：手册第 5 节（官方终端取证） | |
| error-message-i18n-review | 已有：ADR 0024、`2026-09-28-exchange-error-i18n-review.md` | |
| exact-decimal-number-format | 已有：ADR 0037、`2026-10-02-exact-decimal-number-format.md`、`number-format-setting.md` | |
| fixture-dep-scan-lazy-registry | 本次：手册第 6 节 | 代码规则随 #78 |
| footer-clock-live-minute | 已有：`2026-10-02-footer-clock-live-minute.md`、`number-format-setting.md` 规则 8；本次：工作记忆 README（JSON 引号） | |
| funding-history-clock-rollback | 已有：`2026-09-28-funding-history-clock-rollback-fix.md` | |
| geo-trading-restriction | 过时：现行实现在地区未判定时也禁止资金动作，提款与划转同样受限；现行行为见待决 10 所列文档 | 统一文档列入文档后续 1 |
| git-remote-setup | 已有：`.claude/rules/git.md`、ADR 0016；本次：手册第 2、3 节 | 令牌相关的旧做法已被 SSH 推送取代 |
| github-actions-billing | 已有：ADR 0016、`2026-09-15-ci-minutes-concurrency.md`；本次：手册第 3 节 | |
| headless-page-audit | 本次：手册第 5 节 | |
| hidden-tab-market-data-artifact | 已有：ADR 0005 已知局限、入金验收清单的测量注意；本次：手册第 5 节 | |
| hl-fee-display | 本次：`fee-display.md` | 第一项偏差已由 `abff87ce` 修正 |
| hl-official-close-and-confirm-dialogs | 已有：ADR 0014、0017、`confirmation-surfaces.md`、`2026-09-20-market-close-confirmed-size.md`；本次：手册第 5 节（消息键） | 待决的两项列入「已知未修」8，官方行为见附录 |
| hl-official-frontend-stack | 已有：`2026-09-13-spa-shell-spike.md`、首次加载调查 | 缓存时长见附录 |
| hl-official-i18n-practice | 已有：`2026-09-24-official-terminal-language-switch-trace.md` | |
| hl-ui-spec-extraction | 记忆里说的 `docs/hl-ui-spec/` 与 `scripts/measure/scan-*` 从没进过仓库；断点已在 AGENTS 与桌面网格文档 | 设计差异见附录 |
| i18n-catalog-state | 已有：`i18n-presentation.md`；本次：手册第 6 节（两个坑） | 「切语言整页刷新」的设计已过时；后续列入「已知未修」9 |
| integration-pr-workflow | 本次：手册第 3 节 | |
| interaction-bug-diagnosis | 已有：`slider-interactions.md`、ADR 0018；本次：手册第 2 节 | |
| ios-simulator-fixture-verification | 本次：手册第 5 节 | |
| legal-pages-app-shell | 已有：ADR 0020、`2026-09-27-legal-pages-app-shell.md` | |
| long-review-loops-report-progress | 本次：手册第 2 节 | |
| main-checkout-stale-tsc-shim | 本次：手册第 6 节 | 问题本身 2026-10-01 已解决 |
| market-close-confirmed-size | 已有：ADR 0017、`confirmation-surfaces.md`、09-20 至 09-23 的记录 | |
| mobile-dialog-dismiss-control | 已有：样式指南「Dialog chrome」、`dialog-dismiss-control-contract.test.ts` | |
| mobile-sync-ticketless | 已有：去票据传输方案、ADR 0015、09-18 与 09-24 的记录 | |
| mobile-trade-redesign | 本次：手册第 6 节（flex 高度链）、SDK 核对文档（触发单无 TIF） | 对比度取舍列入「已知未修」6；记忆里的若干文件名已不存在 |
| number-format-alignment | 已有：`number-format-setting.md`、数字格式规划、09-24 的记录 | |
| number-format-reactive-formatters | 已有：ADR 0036、`2026-10-02-number-format-reactive-formatters.md` | |
| pairing-page-hardening | 已有：配对页加固规划、`2026-09-20-pairing-page-hardening.md` | |
| pr4-history-onboarding-review | 本次：SDK 核对文档的实测行为 | SEO 文案列入「已知未修」2 |
| pr63-merge-review | 已有：`2026-10-01-pr63-merge-and-adversarial-review.md`；本次：ADR 0026 状态 | |
| prevent-recurrence-in-repo | 已有：样式指南「Checking a visual rule」；本次：手册第 2 节 | |
| privy-346-card-funding | 已有：ADR 0034、验收清单、法律草案、`2026-10-02-privy-card-funding.md`、p24b 记录；本次：手册第 6 节（补丁做法、测试技巧） | |
| privy-theme-freeze-audit | 已有：ADR 0026、`2026-09-30-privy-theme-upgrade.md` | 方案已选定并上线 |
| privy-wallet-integration | 已有：运行时约束 §1、`cctp-deposits.md`、ADR 0002、签名文档 | 记忆里的 `.claude/rules/wallet.md` 已不存在，钱包创建方式已按 ADR 0033 改变 |
| react-compiler-conditional-deps | 已有：`i18n-presentation.md`、ADR 0036、契约测试；本次：手册第 6 节（编译取证法） | |
| react-compiler-test-rerender | 本次：手册第 6 节 | |
| release-readiness-2026-09-20 | 已有：`2026-09-20-release-readiness-checks.md`；本次：手册第 5 节 | |
| reply-in-chinese | 本次：AGENTS.md「Operator collaboration」、手册第 2 节 | |
| review-d9d94de3-funds-guard-findings | 本次：手册第 6 节（变异做法） | 余下 P3 列入「已知未修」5 |
| review-font-practice-findings | 已有：`2026-09-20-font-practice-review.md`、设计令牌 | |
| review-order-summary-tpsl-findings | 过时：按代码阅读，其中的 P1、P2 都已修复 | 一项未核实的 P3 见附录 |
| review-skeleton-parity-findings | 已有：ADR 0009、0010、启动渲染规则、09-15 与 09-16 的记录；本次：手册第 7 节 | |
| review-zhanghu-0908-batch | 本次：列入「已知未修」3、4 | 其余已修或已过时 |
| sairn-domain-cutover | 过时：被切换方案与 ADR 0032 取代 | |
| sdk-api-coverage-review | 已有：接口覆盖审查、第一批接入规划与记录；本次：手册第 5 节 | |
| shared-worktree-commit-hygiene | 本次：手册第 4 节 | |
| silent-email-wallet-creation | 已有：ADR 0033、对应记录、AGENTS 首次交易契约 | 两项待决已于 2026-10-04 结案 |
| slider-review-2026-09-20 | 已有：ADR 0018、`slider-interactions.md`、`2026-09-20-slider-review.md` | |
| spa-mode-branch | 已有：ADR 0005–0008、`deploy/cloudfront/README.md`、09-13 起的记录；本次：手册第 4 节（网络） | |
| staleness-monotonic-clock | 已有：ADR 0022、对应记录 | |
| submit-and-dismiss-dialogs | 已有：`confirmation-surfaces.md`、资金弹层方案、ADR 0014 | |
| tanstack-start-server-fn | 过时：代码里已没有 `createServerFn`，服务端点按 ADR 0005 改为 `/api/*`，TanStack Start 已升到 1.168 | |
| theme-color-meta | 已有：`2026-10-01-theme-color-follows-theme.md` | |
| toast-architecture | 过时：ADR 0019 起所有通知共用一个 Sonner 宿主，`order-toast.tsx` 只提供内容 | |
| tv-chart-stability | 本次：运行时约束 §4 | |
| vault-locale-compiler-deps | 已有：`2026-10-02-vault-fetched-time-locale.md` | |
| website-deployment | 已有：`deploy/website/README.md`（现状更新在 #73） | 记忆里的域名与 root 密钥做法已过时 |
| withdrawal-fee-review-bound | 已有：`withdrawals.md`、`2026-09-29-withdrawal-fee-review-bound.md` | |
| worktree-isolated-build | 已有：性能基线；本次：手册第 4、6 节 | |
| zh-funds-terminology | 已有：`i18n-presentation.md` | |

### 附录：只存在于私有记忆、没有逐条复核的观察

保留下来供以后对照，使用前先核实。

- **官方终端的布局实测（2026-08-07）**：断点与本站一致（≤1000 手机、1001–1420 为 14 列、≥1421 为 16 列，网格行高 30、间距 3）。保留的设计差异：页头 56 对 44，币种信息栏 63 对 43，圆角 8 对 4（`--radius-factor`），官方 12px 单一字重对本站 11px 多字重。官方从 lg 拖窄到 md 时网格是动态派生的，冷加载才是权威，所以测断点要冷加载复核。官方页面是 body 固定、`.main-page-scroller` 内滚，本站是文档滚动加固定外壳。
- **官方前端技术栈（2026-09-13）**：静态 SPA 放在 S3 + CloudFront；react-router v6、React Query、styled-components、react-intl；账户数据走一个聚合的 `webData3` 订阅；首批 48 个文件约 1.63 MB gzip；请求缓存时长 `l2Book` 5 秒、`spotMeta`/`perpDexs` 60 秒、`userFees`/vaults 5 分钟。
- **官方平仓与下单确认（2026-09-20 读打包代码）**：市价平仓打开时把 `{coin, szi}` 快照进弹窗，只有 Size 与「Price: Market」两行加数量输入，桌面有「Don't show this again」（写 `hyperliquid.skip_close_order_confirmations`）；按钮文字固定为「Market Close」（超量时「Reduce Only Too Large」），显示的数量就是提交的数量，永续单是 reduce-only，`tif: FrontendMarket`，请求结束后才关弹窗、结果走通知。限价平仓多一行「Estimated closed PNL (without fees)」。全部平仓可选市价或按中间价限价，可以设 3 秒长按确认。下单确认有 Action、Size、Price、Est. Liquidation Price 四行，限价比最优价激进 3% 以上时红字警告，点击后先关弹窗再发单。未连接、未启用交易、需要充值时，官方把按钮位置整个换成另一个按钮组件。
- **账户概要的展示差异（2026-08）**：两套账户模式标签、`formatPercent` 精度不一致、手机端没有读屏用的加载说明、`showSpotFundsNotice` 不在桌面显示、状态优先级是错误 > 过期 > 加载。可能已经过时。
- **React 时序教训（2026-08-14）**：同一次提交里，前一个 effect 清掉状态后，后一个 effect 拿到的仍是闭包里的旧渲染值。「用户已关闭」这类事实要在事件处理函数里记录，不要在 effect 里推断。
- **未核实的 P3（2026-08-20）**：数量输入先打「0」或「.」时，可能先闪一下「Invalid amount」。

## 验证与限制

2026-10-08 在本工作树（基线 `345a2143` 加本次未提交改动）执行：

- `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`，结果见提交前的检查；`git diff --check`。
- 用脚本检查本次改动的 Markdown 文件里的相对链接与锚点。
- 用脚本扫描现行文档里的旧品牌、EC2、运行时 SSR、bridge2、旧 hook 名等说法，逐条人工判断；历史记录、迁移计划和 ADR 正文按规则不改。
- 写进文档的代码事实逐条对照了当前代码：hl-react 导出的 hook、`registries/exchange.ts` 的签名方路由、`StartupReadyGate`、`candle-gate.ts`、`fees.ts` 与 `use-markets.tsx`、`order-fee-quote.ts`、地区限制的 `useGeoRestriction`、`referrals.tsx` 的 SEO 文案、`i18n:extract` 脚本、commitlint 规则、TanStack Start 与 Node 版本、仓库密钥与工作流状态。
- 发布归属用 `git merge-base --is-ancestor` 对照四次发布的 main 提交；线上状态读两个网络的 `build-meta.json`。

没有运行：应用单测、类型检查、Biome（没有改代码）、构建、浏览器验证。迁移进来的协议实测行为、官方终端对照值和附录内容没有重新测量，各处已标明日期与来源。草稿 PR #73 与本次改动在 `docs/README.md` 有一处相邻修改，合并顺序在后的一方需要手工合并。

## 后续与替代关系

- 换账号或换机器之后，从 [Agent 工作手册](../../agent-handbook.md)与本记录开始；下一次交接写一条新的交接记录，列出那时的状态与待办，并在 `supersedes` 里指向本记录。
- 上面的「待办与待决」是 2026-10-08 的汇总，各项以所列的归属文档为准；处理掉一项时更新归属文档，不需要回来改本记录。
- 本机私有记忆没有删除。手册第 9 节记录了同一台机器换账号后仍能读到它；仓库仍是唯一可靠的来源。
