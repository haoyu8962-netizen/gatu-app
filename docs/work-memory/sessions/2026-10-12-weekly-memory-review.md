<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-12-weekly-memory-review",
  "date": "2026-10-12",
  "title": "周整理：p30 交付、存款证据接续与仍待验收的功能",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "work-memory",
    "docs-governance",
    "account-funding",
    "wallet-onboarding",
    "pairing-release",
    "static-hosting",
    "pr-review"
  ],
  "summary": "核对 33 份新增或有变化的记录，补 94 个提交引用、11 条摘要和 21 条阶段补注；补写 PR #101 版本入口的事后记录。区分 p28 手动存款成功、p30 自动流程待验收和最新 dev 的未发布改动。上周 42f2bd23 仍待同步；只在独立工作树整理并本地提交。",
  "thread": {
    "id": "01a08f6b-26ae-7642-a9a5-a074d906c899",
    "title": "启动3006端口开发服务器"
  },
  "baseCommit": "b98f2fe8a2d98afd95fff236a56b659d74db2588",
  "commits": ["95e12620", "c9169980"],
  "sources": [
    {
      "path": "docs/work-memory/README.md"
    },
    {
      "path": "docs/agent-handbook.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-08-agent-docs-handover.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-11-cloudfront-release-p30.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-11-codex-deposit-branch-review.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-11-zerodev-budget-and-billing-audit.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-11-zerodev-budget-adjustment.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-12-build-version-entry-retrospective.md"
    },
    {
      "path": "docs/adr/0033-silent-email-wallet-creation.md"
    },
    {
      "path": "docs/adr/0038-unnamed-default-agent-for-trading-connection.md"
    },
    {
      "path": "docs/adr/0039-link-mobile-device-builder-fee-and-session-priority.md"
    },
    {
      "path": "docs/adr/0040-automatic-email-wallet-deposits.md"
    },
    {
      "path": "docs/privy-card-funding-launch-checklist.md"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/96"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/101"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/102"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/103"
    }
  ],
  "supersedes": []
}
-->
# 周整理：p30 交付、存款证据接续与仍待验收的功能

## 背景与范围

2026-10-12 工作记忆 heartbeat。主检出 dev 起点 b98f2fe8a2d98afd95fff236a56b659d74db2588，工作区与暂存区干净；按当前手册仅 fetch origin dev，确认远端 dev 与起点相同。新增独立工作树 .claude/worktrees/work-memory-2026-10-12，分支 codex/work-memory-2026-10-12 从该 origin/dev 创建且不设跟踪；主检出未切分支，dev/main 指针未移动。只做记忆维护，不安装应用依赖、不读取 .env 或账户数据。

已读当前 AGENTS.md、agent.md、Agent 工作手册、README/INDEX、文档体系、最新交接与 p30 发布记录。初始 memory:check 通过。本轮沿上周已知基线 498ea17a 检查本项目新增 Git 内容：当前 197 份记录，31 份为该基线之后新增，另外 2 份旧记录有新修改，共核对 33 份；不通过提交署名推断真实任务身份。

上周提交 42f2bd23 仍在 codex/work-memory-2026-10-05，既不在当前 dev，也不在所查 main；10-08 交接记录已明确它尚未推送。本轮不 cherry-pick、合并或重复恢复其 43 份旧记录修订，只记录同步待办。上一周的记录可以用 git show 42f2bd23:docs/work-memory/sessions/2026-10-05-weekly-memory-review.md 本地检索；不生成指向当前不存在文件的 Markdown 链接。它的 GitHub/发布结论仍只属于当时查询。

## 结论与依据

### 记录补全

- 为 33 份记录补 94 个已核验的提交引用：按对应文件在 498ea17a..b98f2fe8 的非合并历史逐条核对，排除既有引用。提交确实改动该记录，但文档提交本身不是业务执行或验证证据。
- 更新 11 条摘要，给 21 份记录追加本日补注；保留旧正文、测试失败、局部重跑、来源身份、supersedes 与各自验证版本。
- 依据 PR #101 和两个实现提交补写[版本号入口记录](2026-10-12-build-version-entry-retrospective.md)。只确认共享设置面板显示/复制版本号、默认页脚不显示、market-loading 页脚保留简写；没有取得原对话和局部测试输出，明确标为 retrospective、thread: null。
- 不修改 AGENTS、Reference、ADR、应用代码、部署或供应商配置，不重建缺失的其他会话。

### 原方案与现行行为

- 静默邮箱建钱包的两项待决已于 10-04 通过 d65d78da / 8d9b9540 接续；ADR 0033 的 SIWE 关联签名例外已接受。PR #77 之后随 p26 来源发布，但没有真实邮箱注册验收。
- 旧域名过渡代码已由 PR #73 合入、p28 发布；后续清理记录报告源站旧头、Lambda 变量与旧证书的处理。不能沿最初的“等到 10-09 / p25 再清理”重新执行；Cloudflare 记录和临时 IAM 策略仍有未完成事项，本轮不查云账号。
- 共用外壳组件不等于同一个 DOM 节点。原加载回退会重新挂壳，后续 DepositModalHost 持有同一个壳；局部手机边框/遮罩补丁已由 UI 原语统一规则替代。资金表单滚动结构、提交生命周期等其他结论不整体作废。
- 普通交易连接无名 Agent（ADR 0038）、手机 Mobile QR 命名槽位及导入身份优先（ADR 0039）是不同机制。Link mobile device 只核验激活状态，不批准 builder fee；首版关联弹窗里的批准步骤已被用户撤回。
- p30 来源报告首次在生产打开配对。PR #96 的“切换网络删除旧密钥”P2 后续经源码核对不适用于当前应用的整页刷新路径，不能继续当已确认缺陷；库调用方原地切 env 的边界和其他配对限制仍保留。

### 存款证据的接续与边界

初次排查只知道未到期授权且无哈希，没有原失败响应。后续真实重试才捕获 pm_getPaymasterStubData / AA21，配置记录报告修复 ZeroDev 策略与 Privy 路由，并由用户报告成功。计费任务随后独立读取源收据和 UserOperation 成功，补足此前的源链证据缺口；Circle 转发收据未独立重读，最终账户状态沿来源用户报告及 UI 核对。本轮没有读取钱包、发请求到 RPC 或验证资金。

这笔成功发生在 p28 的手动路径；不能用它关闭 p30 的主网自动存款验收。自动流程在 PR #97 又修复了资金锁内余额重读、签名前法律核验和持久未知结果三项边界，随 p30 发布。原“未合入、未发布”已失效，但真实自动提交与最终 HyperCore 入账仍需在发布版本验收。

日代付上限后续单独调整至 0.003 ETH，月 Gas 上限与 Sandbox 套餐没有因此扩大；included credits 与硬性 Gas 上限不是同一维度。来源摘要中间显示为零后来有动画观察，不能当成永久配置错误。供应商价格、额度与设置只转述当时记录，本轮没有重新询价或访问后台；监控、配置漂移探针、容量扩展或直连 Pimlico 都未因一次成功而完成。

### 发布与尚未发布的改动

| 来源记录 | 发布提交 | 来源覆盖 | 本轮未补足的验收 |
| --- | --- | --- | --- |
| [p26](2026-10-08-cloudfront-release-p26.md) | 290935c7 | 图表精度、静默建钱包、WebKit 加载器握手补丁；含早期预算失败与重定基线 | 真人 iOS Safari、真实邮箱注册 |
| [p27](2026-10-08-cloudfront-release-p27.md) | 6ff8ee75 | 资金弹层、CCTP 最低额、邮箱标题与路由隐藏标签修复；上传失败后重跑 | 真实手机交互与扫码 |
| [p28](2026-10-08-cloudfront-release-p28.md) | d74dd616 | 按需切链、旧域名退役与文档交接 | 报告者真实外部钱包原场景 |
| [p30](2026-10-11-cloudfront-release-p30.md) | ff11eee5 | 无名 Agent、配对修复、自动存款与未知结果、配对构建修复 | 真实自动存款、外部钱包首单、RD-1..RD-3 |

以上是来源发布报告加 Git 归属核对，没有读取线上 build-meta、DNS、云资源或重新运行 verify。保留 p30 首次 sync 因代理中断而失败、之后重跑，以及 csp-coverage 的两项跳过，不把“0 违规”说成每个步骤执行。

PR #99 是发布记录、#100 是 P2 复核文档，#101 是版本入口、#102 是滑杆百分比冻结，它们在所查 dev 而不在 main ff11eee5。p30 不包含 #101/#102；滑杆后续修正 c5096613 也已合入 dev，必须区分脚本/模拟测试与真人原场景确认。

现行手册记录三个发布闸门默认开启；这只是发布配置规则，不是本次 heartbeat 的发布或合并授权。所有历史授权只作为历史证据。

## GitHub 查询与检查范围

显式指定 zora4523-bot/gatu-app，查询区间 2026-10-12T01:03:34.452178+00:00 至 2026-10-12T01:03:40.206404+00:00：dev 为 b98f2fe8a2d98afd95fff236a56b659d74db2588，main 为 ff11eee51ff18624e9a62d0fc9a4200086e773e5。下面绑定每个查询时实际 head，不代表合并提交、当前工作树或生产已验证。未返回检查项、SKIPPED、IN_PROGRESS 分开记录，不重跑 CI。

| PR | 实际 head | 目标 / 状态 | 检查集合 |
| --- | --- | --- | --- |
| [#73](https://github.com/zora4523-bot/gatu-app/pull/73) | 018daceadab1f5fc147a09e4f3bbeb5f25024b3e | dev / 已合并 | 6 SUCCESS |
| [#78](https://github.com/zora4523-bot/gatu-app/pull/78) | 57b29ed9a3c7066ad2d8906693bdd0eee2ab3874 | dev / 已合并 | 6 SUCCESS |
| [#79](https://github.com/zora4523-bot/gatu-app/pull/79) | 69cbb988aa973e182b2aed4eebcb6cda8413a77c | dev / 已合并 | 2 SUCCESS |
| [#80](https://github.com/zora4523-bot/gatu-app/pull/80) | dc7651847712714258bfe8d470cbd909674c0630 | dev / 已合并 | 6 SUCCESS |
| [#81](https://github.com/zora4523-bot/gatu-app/pull/81) | 1d56e3986199abce8089534bbe676b2b5da6e837 | dev / 已合并 | 5 SUCCESS |
| [#82](https://github.com/zora4523-bot/gatu-app/pull/82) | 508ff73defe0a1ea0a624b1b557a9edab9b55a86 | main / 已合并 | 7 SUCCESS |
| [#83](https://github.com/zora4523-bot/gatu-app/pull/83) | c46331a966452e558d33cd5d86495c615c4d051c | dev / 已合并 | 1 SKIPPED；2 SUCCESS |
| [#84](https://github.com/zora4523-bot/gatu-app/pull/84) | 8452b745543219ddfd69aeac25e6da72f3e540c9 | dev / 已合并 | 1 SKIPPED |
| [#85](https://github.com/zora4523-bot/gatu-app/pull/85) | 56bcd97373bb3370b283fe1f53a97ebb60cfc07d | main / 已合并 | 7 SUCCESS |
| [#86](https://github.com/zora4523-bot/gatu-app/pull/86) | 3b3040c27144307e379cbe8cbd38928913f831cb | dev / 已合并 | 未返回检查项 |
| [#87](https://github.com/zora4523-bot/gatu-app/pull/87) | 907621777383e0e136654cfb6786a17a783a6b82 | main / 已合并 | 7 SUCCESS |
| [#88](https://github.com/zora4523-bot/gatu-app/pull/88) | 602cc695da6a0e12eddd27ba3506559d8b292055 | dev / 已合并 | 未返回检查项 |
| [#89](https://github.com/zora4523-bot/gatu-app/pull/89) | 6b1255a063636648b51df9a0115f5bee03e1698c | dev / 已合并 | 未返回检查项 |
| [#90](https://github.com/zora4523-bot/gatu-app/pull/90) | 1437eb1ec5b513143545920efc0d98bd702522aa | dev / 已合并 | 未返回检查项 |
| [#91](https://github.com/zora4523-bot/gatu-app/pull/91) | e10186f1c97981b101e420c7b8244c65b9be68eb | dev / 已合并 | 6 SUCCESS |
| [#92](https://github.com/zora4523-bot/gatu-app/pull/92) | 8232d09a7436238dc15f4bf494bfbd939df9b700 | dev / 已合并 | 6 SUCCESS |
| [#93](https://github.com/zora4523-bot/gatu-app/pull/93) | 0345a13c257e25c8d1fa5a64de0c13a772d9cafd | dev / 已合并 | 5 SUCCESS |
| [#94](https://github.com/zora4523-bot/gatu-app/pull/94) | 9a55984b425c012f92d6760474b121abb1b4859b | dev / 已合并 | 5 SUCCESS |
| [#95](https://github.com/zora4523-bot/gatu-app/pull/95) | 9b18dea47a23c2ff3e222f2e15e04d19615ec785 | dev / 已合并 | 未返回检查项 |
| [#96](https://github.com/zora4523-bot/gatu-app/pull/96) | 0c8980e5c48aca2e7e663c602dd682a10583fd8e | main / 已合并 | 7 SUCCESS |
| [#97](https://github.com/zora4523-bot/gatu-app/pull/97) | 525f38c047591ce3ea0434855a369bcb2bb26706 | dev / 已合并 | 5 SUCCESS |
| [#98](https://github.com/zora4523-bot/gatu-app/pull/98) | d499c77a3708a6d4039198970acd29f8daeb597c | dev / 已合并 | 5 SUCCESS |
| [#99](https://github.com/zora4523-bot/gatu-app/pull/99) | 361f372f5ab35c5bf988c5afc9c8eb1f0f483716 | dev / 已合并 | 1 SKIPPED |
| [#100](https://github.com/zora4523-bot/gatu-app/pull/100) | 2a14a1a1d126ac0c027b3aff70196f203cd1cad4 | dev / 已合并 | 未返回检查项 |
| [#101](https://github.com/zora4523-bot/gatu-app/pull/101) | 1539a00970c9bcfa23c34b28c6edee69a8b44049 | dev / 已合并 | 6 SUCCESS |
| [#102](https://github.com/zora4523-bot/gatu-app/pull/102) | c509661360e0b07e00a7647f8353e02f576c99d9 | dev / 已合并 | 5 SUCCESS |
| [#103](https://github.com/zora4523-bot/gatu-app/pull/103) | 9b4e275c59ad5f8dc7f5023921fca209fbf76ed5 | dev / 开放 | 5 IN_PROGRESS |

PR #103 在查询时仍开放，五项检查进行中；其 head 不在本地基线与所查主分支。本轮只记录，不替其完成审查、合并或宣布成功。PR #83 含一项跳过，#84/#99 仅返回跳过；其它纯文档 PR 的空集合不写为通过。

## 本地证据与覆盖范围

仅使用已明确关联的当前 Codex rollout，不扫描其他项目或其他任务。上次快照 sourceBytes 190036790；本次有实质新增工作，补拍一次 .worklog/2026-10-12/01a08f6b-26ae-7642-a9a5-a074d906c899/snapshot-6xJlw7/，位于主检出下，未复制到 Git。

归档时间 2026-10-12T01:04:32.871Z，固定源边界 198608475 字节、15155 行；2351 个允许事件，最后事件 2026-10-12T01:04:32.104Z。events SHA-256 为 ec2e091fa48b1915bdc7a134570a6d1353e36e63c6f09678c54fcfc8dbd2d681，已重新计算一致。后续日志增长不重复补拍同一轮工作。

快照只有筛选并模式脱敏的可见文本和工具名，没有内部推理、工具参数/输出、附件或未知消息阶段；它不是完整原始会话，工具名也不证明调用成功。模式脱敏不能保证识别所有秘密，因此证据仅本地保留、不共享。weekly-review/ 保存经选择的提交映射、查询状态、指纹和验证摘要；没有账户标识、密钥、购买载荷或未经检查的工具输出。其他来源任务的 thread: null 保持不变。

## 验证与限制

本轮验证限定为 b98f2fe8 上的 36 个记忆文件，使用 Node 22.15.0。pnpm memory:index 成功生成 199 份记录的索引，pnpm memory:check 通过，pnpm memory:test 的 8/8 用例通过（0 失败、0 跳过），git diff --check 通过。另核对 123 个记录内本地链接目标、33 份原正文及来源/身份元数据完整保留、94 个新增提交确实改动对应记录且可达；其它原有记忆文件指纹未变，主检出仍干净且 dev/main 指针与开始一致。证据目录保持 Git 忽略。

没有运行应用单测、类型检查、生产构建、浏览器、物理输入或真实资金操作；来源的测试数字和发布结果不作为本轮结果。一次批量编辑脚本因输入编码失败在执行前中止，随后以 ASCII 编码的脚本成功完成；没有中途写坏文件。首次 git diff --cached --check 发现新增版本入口记录末尾多余空行，已移除；修正后的 git diff --cached --check 通过。

## 后续与替代关系

- 上周 42f2bd23 和本周记忆提交均需在另行授权的交互任务中处理同步，不能自动合并；合入时以两边记录的并集重建索引，不覆盖后续记录。
- 需要运营方验收：p30 自动存款、外部钱包无名授权与首单、配对 RD-1..RD-3，以及对应发布后的滑杆真实输入与版本复制行为。
- 卡入金的 CF-11、沙盒、法律审阅仍缺；CCTP 手动成功不是银行卡购买验收。代付容量监控与配置探针仍待独立任务。
- 部分规范开头和旧正文仍混有“尚未发布”与新发布记录，例如 ADR 0033、0032、0040；按明确日期和发布来源理解，不擅自改写业务规范。发现与当前约定真正冲突时交由运营方决定。
- PR #103 的运行结果、本周 dev 尚未进入 main 的修改和各来源剩余问题继续保留，不以整理完成作为关闭依据。
- 本条只局部更新阶段结论，不整体 supersede 交接、发布或事故记录。没有新增自动化，也没有推送、建 PR、开启自动合并、合并或部署。

## 周整理补注（2026-10-19）

本轮产生的 95e12620 已在后续交互任务中移植为 c9169980，通过 PR #111 合入 dev 并进入 p32 的 main。原哈希不是祖先不代表内容缺失：35 份任务记录中 34 份内容相同，滑杆记录保留了同日更正；索引随来源记录集合生成。原“本周提交待同步”局部失效；10-05 的 42f2bd23 仍不在所查 dev/main。原 PR #103 进行中、#101/#102 未发布的状态也已由 p31 接续。同期 p31/p32 的签名与滑杆修正见本周记录，不能沿用早期行为结论。

后续来源：[2026-10-12-cloudfront-release-p31](2026-10-12-cloudfront-release-p31.md)；[2026-10-14-cloudfront-release-p32](2026-10-14-cloudfront-release-p32.md)。

本补注为事后整理，只核对当前规范、代码、Git 和来源记录；来源测试及发布结果不作为本轮执行。查询时间和实际 head 见[本周整理](2026-10-19-weekly-memory-review.md)。
