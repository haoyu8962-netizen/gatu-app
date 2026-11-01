<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-19-weekly-memory-review",
  "date": "2026-10-19",
  "title": "周整理：p31/p32 交付、签名与滑杆修正，以及上周记忆同步",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "work-memory",
    "docs-governance",
    "pr-review",
    "account-funding",
    "wallet-onboarding",
    "order-entry",
    "static-hosting",
    "pairing-release"
  ],
  "summary": "核对上次整理以来 8 份新记录与滑杆记录后续，给 12 份记录补 17 个提交引用、7 条摘要和 10 条阶段补注。确认上周 95e12620 经 c9169980 / PR #111 同步，p31/p32 来源已交付新修正；10-05 本地整理仍待同步，真实自动入金、模式切换与物理交互验收保留。仅本地记忆维护。",
  "thread": {
    "id": "01a08f6b-26ae-7642-a9a5-a074d906c899",
    "title": "启动3006端口开发服务器"
  },
  "baseCommit": "7ff72706f32364b89f33706d8fba500a0abb0676",
  "commits": [],
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
      "path": "docs/work-memory/sessions/2026-10-12-weekly-memory-review.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-12-codex-cli-review-followups.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-12-ci-terminal-test-shards.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-12-automatic-unified-account.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-12-cloudfront-release-p31.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-13-production-readiness-audit.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-13-p32-rebaseline.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-14-cloudfront-release-p32.md"
    },
    {
      "path": "docs/adr/0040-automatic-email-wallet-deposits.md"
    },
    {
      "path": "docs/adr/0041-automatic-unified-account-for-new-accounts.md"
    },
    {
      "path": "docs/adr/0023-open-interest-cap-advisory-check.md"
    },
    {
      "path": "docs/slider-interactions.md"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/104"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/107"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/108"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/109"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/111"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/112"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/113"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/114"
    }
  ],
  "supersedes": []
}
-->
# 周整理：p31/p32 交付、签名与滑杆修正，以及上周记忆同步

## 背景与范围

2026-10-19 的 gatu heartbeat，只维护本项目工作记忆。主检出开始为 dev / 0ad17bd188f9b554a6439e169e815d78d8553889，工作区、暂存区干净；本地 main 为 ff11eee51ff18624e9a62d0fc9a4200086e773e5。读取主检出的 AGENTS.md、agent.md、手册、README/INDEX、最新交接和发布记录后，fetch origin dev main。远端 dev 为 7ff72706f32364b89f33706d8fba500a0abb0676，main 为 9ccb88c0066d8083fc43371b5286d8a81d91183b。

主检出落后于远端，保留不动。从最新 origin/dev 建独立工作树 .claude/worktrees/work-memory-2026-10-19、无跟踪分支 codex/work-memory-2026-10-19，再读取新记录及规范差异。没有安装应用依赖、读取 .env 或账户数据，也没有切换或快进主检出。活动代理核对仅本任务，索引由本任务串行生成。

上次整理以 b98f2fe8 为业务基线，本地成果为 95e12620。与本次工作树比较，除其已同步内容外有 8 份新记录和 1 份滑杆记录后续；起始共 207 份记录。只核对这些工作及直接关联的旧结论，不重新导出无关任务，也不把来源中的合并、发布或签名要求当成此次授权。

## 结论与依据

### 记忆同步与本次改动

- 95e12620 在后续交互任务中移植为 c9169980，由 PR #111 合入 dev，并进入 p32 的 main。本轮只确认此历史事实，未执行移植或合并。原 SHA 不在远端祖先链，但迁移 SHA 在两条远端分支均可达，不能据原 SHA 判漏合。
- 对比两个提交时的 35 份任务记录，34 份逐字相同；滑杆记录多保留了同日撤回基础币冻结方案的更正。INDEX 根据各自记录集合生成，整体 patch-id 不同，因此不宣称两个提交的整个补丁完全相等。
- 10-05 的 42f2bd23 仍不在所查 dev/main。可用 git show 42f2bd23:docs/work-memory/sessions/2026-10-05-weekly-memory-review.md 查阅；本轮不重复恢复它的旧修订。
- 为 9 份新增或变化记录补 14 个实际提交引用，逐项核对对应文件的非合并 Git 历史，排除上周同步提交和已有引用；另为版本提示删改补 b2ab32c7，为上周记录补原提交和迁移提交，共 17 个引用。文档提交是来源定位，不是业务执行证据。
- 12 份旧记录中更新 7 条摘要、追加 10 条阶段补注，保留全部原正文、失败、来源标识与验证范围。新增本周记录并重新生成索引；不改 AGENTS、ADR、Reference、业务实现或部署配置。

### 本周行为与旧结论的局部替代

| 议题 | 已核对的接续关系 | 不可扩大解释的边界 |
| --- | --- | --- |
| 自动存款法律与恢复 | PR #104 将法律核验绑定 ready.address，宿主在法律状态明确允许前不尝试，未决授权阻止新尝试，到期后重新检查；随 p31 来源交付 | p30 当时测试通过不证明这些后续缺陷不存在；真实自动入金仍待验收 |
| 自动存款重试 | PR #108/#109 接续：授权尚未交给 bundler，且无哈希、无未决意向、非未知结果时才退避；意向读取抛错按可能未决处理 | “签名前失败”是过窄的旧概括；可能已提交的结果不能自动重发 |
| 滑杆报价币 | PR #104 撤回 c5096613 的普通报价币固定基础币来源，手势中仍冻结百分比基准，普通报价币提交保持显示金额并用实时价格换算；Reduce Only 保留基础币来源 | 原提交可达不代表其所有行为仍采用；真实鼠标/手指原场景未验证 |
| 新账号账户模式 | 取证阶段等待决定的方案已由 ADR 0041 / PR #107 实施，随 p32 来源交付；邮箱用 userSetAbstraction，外部钱包用已验证 Agent 的 agentSetAbstraction | 取证时邮箱 owner 也签 agentSetAbstraction 的提议未采用；default 仍不授予下单能力，有历史订单的强制迁移未实现 |
| 生产审查 | PR #108/#109 两批处理 CSV、TP/SL、签名方队列、外部存款未知结果、精确 Max、限流和协议白名单，记录覆盖第二批 | 不是全项目无缺陷或真实资金验收；directSubmissionStarted 接线仍缺 Hook 级异常路径测试 |
| OI 未知状态 | ADR 0023 已明确未知状态放行，交易所保持权威 | 生产审查初版把它列作未修，不代表现行产品决定要求改为阻断 |
| 版本入口 | PR #101 随 p31 来源交付；b2ab32c7 随 PR #107/p32 去掉设置中的 Release 提示，复制完整版本保留 | 共享组件只说明代码入口共用，不证明双端剪贴板验收 |
| CI 与预算 | PR #103 分片，#104 加固断言，#106 补滑杆测试；#113 重定总量与桌面运行时预算 | 不把旧 head 的失败覆盖成成功，不推断真实计费改善，也不授权未来自动扩大预算 |

本轮静态核对当前 use-fresh-legal-action-guard.ts、use-order-entry-data.ts、自动存款宿主及 use-deposit.ts 的相关实现、版本入口差异，并对照 ADR 0040/0041、滑杆规范和 ADR 0023。其余业务效果沿用来源报告，没有重跑官方终端调试、完整代码审计或资金操作。

当前远端规范比主检出多了 ADR 0041 的新账号自动模式设置例外；本次收到的主检出规则文本尚未包含该条。本轮只记录版本差异与来源中的实施决定，不从历史材料获得新的签名授权。ADR 0041 的状态行仍写“未晋升 main、未发布”，与后续 p32 来源阶段不一致，留作规范维护事项，不在本次记忆任务中改写签名契约。

### 发布来源与未完成验收

| 来源 | 发布版本与提交 | 来源报告结果 | 仍缺的证据 |
| --- | --- | --- | --- |
| [p31](2026-10-12-cloudfront-release-p31.md) | cloudfront-2026-10-12-p31 / 74e69f77 | 两网 verify 15/15、16/16；CSP 33 步、2 跳过、0 违规；自动存款审查修复、滑杆与版本入口 | 真实自动存款、物理拖动、外部钱包连接、配对 RD-1..RD-3 |
| [p32](2026-10-14-cloudfront-release-p32.md) | cloudfront-2026-10-14-p32 / 9ccb88c0 | 两网 verify 15/15、16/16；CSP 33 步、2 跳过、0 违规；自动统一账户、生产审查两批与重定预算 | 新邮箱/外部钱包自动统一账户、外部存款未知结果、兑换 Max、自动存款及真机配对 |

p32 编号按本地 10-14，来源记录实际执行为 10-13 18:02–18:15Z，不是日期错误。保留 PR #112 在 f50e21a8 的配对开启构建超预算 160 字节、未显式传 false 的测量误差、以及发布时两次清单路径错误；最终正确 head 的通过不能覆盖这些阶段。未读取线上 build-meta 或云后台，不能凭上述来源报告保证本轮查询时线上没有再变化；也未删除任何发布工作树。

### GitHub 查询

显式指定 zora4523-bot/gatu-app，PR 与分支查询区间 2026-10-19T00:57:02.446000+00:00 至 2026-10-19T00:57:11.095982+00:00。下表是每个 PR 查询时的实际 head，CI 成功、跳过和空集合分开记录；没有逐条读取测试日志或重跑 CI。

| PR | 实际 head | 目标 / 状态 | 检查集合 |
| --- | --- | --- | --- |
| [#101](https://github.com/zora4523-bot/gatu-app/pull/101) | 1539a00970c9bcfa23c34b28c6edee69a8b44049 | dev / 已合并 | 6 SUCCESS |
| [#102](https://github.com/zora4523-bot/gatu-app/pull/102) | c509661360e0b07e00a7647f8353e02f576c99d9 | dev / 已合并 | 5 SUCCESS |
| [#103](https://github.com/zora4523-bot/gatu-app/pull/103) | 9b4e275c59ad5f8dc7f5023921fca209fbf76ed5 | dev / 已合并 | 5 SUCCESS |
| [#104](https://github.com/zora4523-bot/gatu-app/pull/104) | 88827567712deeb8e3c06200186a23e407ac7699 | dev / 已合并 | 6 SUCCESS |
| [#105](https://github.com/zora4523-bot/gatu-app/pull/105) | 2b3a85eaee26cddae4876803bdc8acd2eacd24b7 | main / 已合并 | 1 SKIPPED；8 SUCCESS |
| [#106](https://github.com/zora4523-bot/gatu-app/pull/106) | a2c9e20994c09fbec9f87530f739eb69a0a236b3 | dev / 已合并 | 1 SKIPPED；2 SUCCESS |
| [#107](https://github.com/zora4523-bot/gatu-app/pull/107) | 0b6b073ff4b189c7062c7ae8cfc643ece9f95dea | dev / 已合并 | 7 SUCCESS |
| [#108](https://github.com/zora4523-bot/gatu-app/pull/108) | bd5e3fe003c2d414a2aa319fe94370b4da559970 | dev / 已合并 | 1 SKIPPED；6 SUCCESS |
| [#109](https://github.com/zora4523-bot/gatu-app/pull/109) | 6559c08fa54ecf0f6358aa25b761df345dc37c3e | dev / 已合并 | 7 SUCCESS |
| [#110](https://github.com/zora4523-bot/gatu-app/pull/110) | 0df68c132e12a298554e26be7fd5baf228eefe46 | dev / 已合并 | 1 SKIPPED |
| [#111](https://github.com/zora4523-bot/gatu-app/pull/111) | c91699808e6991b8a6105420b0e630a2263613c9 | dev / 已合并 | 未返回检查项 |
| [#112](https://github.com/zora4523-bot/gatu-app/pull/112) | ab8896eff37bb12a625884b519c84c8d586e43d3 | main / 已合并 | 8 SUCCESS |
| [#113](https://github.com/zora4523-bot/gatu-app/pull/113) | bf0f8769da1d8fe928605cca413dbc6a6c82e478 | dev / 已合并 | 1 SKIPPED；3 SUCCESS |
| [#114](https://github.com/zora4523-bot/gatu-app/pull/114) | c08865d805c25ad3d990bf52f1e97856b81ae98e | dev / 已合并 | 未返回检查项 |

随后本轮只读查询开放 PR 列表，返回空。#101–#113 的 head 均在所查 dev 与 main 可达；#114 的发布补记 head 仅在 dev，不在 main，但它描述的 p32 发布提交 9ccb88c0 就是所查 main。发布记录未进 main 不等于业务未发布。#111/#114 没返回检查项，不称为 CI 通过；#105/#106/#108/#110/#113 的跳过明确保留。

### 本地证据

仅使用既有明确关联的 Codex rollout；未扫描 Claude 私有记忆或其他项目会话。上周源边界为 198608475 字节，本次已有实质工作且边界增长，按 README 新建一次 .worklog/2026-10-19/01a08f6b-26ae-7642-a9a5-a074d906c899/snapshot-OAfAk7/，保存在主检出下。

归档时间 2026-10-19T00:57:51.620Z，源边界 207234440 字节、15476 行，共 2398 个允许事件，末事件 2026-10-19T00:57:51.216Z。events SHA-256 为 32b24da2c069ecc2caee6559258b5fdeef3dcf23e491ee204e6a51723548d769，本轮重新计算一致。后续日志增长不重复补拍。本地快照只有筛选并模式脱敏的可见文本及工具名；没有内部推理、工具参数/输出、图片或未知阶段消息，不是完整原始会话。工具名不证明成功；模式脱敏也不保证识别任意秘密，文件保持 Git 忽略，不上传。

weekly-review/ 保存筛选后的 GitHub 检查字段、迁移核对、提交映射、原文件指纹和本轮验证摘要。其它任务的 thread: null 保留，未从提交作者推测身份、重建对话或伪造来源输出。

## 验证与限制

本轮范围为 7ff72706 上的 14 个记忆文件；Node 22.15.0。起始及最终 pnpm memory:check 通过，pnpm memory:index 生成 208 份记录的索引，pnpm memory:test 为 8/8 通过（0 失败、0 跳过），git diff --check 通过。另核对 60 个本地链接目标、12 份旧正文与来源/身份元数据完整保留、14 个按文件映射的新增提交引用，以及版本提示和记忆迁移的 3 个额外引用。无关文件指纹未变；主检出保持干净，本地 dev/main 指针没有移动。

未运行应用单测、类型检查、生产构建、浏览器、物理输入或真实资金操作；来源的测试数字、审查评分和发布结果都不属于本次验证。

## 后续与替代关系

- 本次整理仅本地提交，后续同步需要用户另行授权；10-05 的 42f2bd23 仍待处理，10-12 已经迁移，不能再重复合入原补丁。
- 上表真实环境验收继续保留；本轮没有证据将自动入金、两种新账号模式设置、物理滑杆与配对清单标为完成。
- 生产审查仍有现货缺价时以入场成本估值、图表 iframe 同源 unsafe-inline、SW opaque 图标缓存、分支保护，以及外部存款 Hook 级异常路径测试缺口。OI 未知放行是现行决定；包体基线待定项已由 #113 局部完成。
- ADR 0041 等现行文档的旧发布状态需与对应版本核对后更新；本次只追加记忆来源，不以改文档消除真实执行边界冲突。
- 本记录局部接续旧阶段，不整体替代原记录；没有新增自动化、推送、建 PR、自动合并、合并或部署，历史授权与 CI 成功均不作为这些动作的授权。
