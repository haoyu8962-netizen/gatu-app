<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-09-weekly-memory-review",
  "date": "2026-11-09",
  "title": "周整理：p37–p40 的交付、官网快照超龄与本地索引规则",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "work-memory",
    "static-hosting",
    "pr-review",
    "docs-governance"
  ],
  "summary": "核对 p37–p40 的来源发布记录并补正六份任务摘要。#134、TWAP 历史兜底和手机普通订单摘要已进入 main；官网快照仍失败，修复 #153 开放。p39 记录 #152 有索引冲突，p40 记录只在本地。ADR 0049 已进入 dev，索引只生成、不提交。真实账户与真机验收仍缺。",
  "thread": {
    "id": "01a08f6b-26ae-7642-a9a5-a074d906c899",
    "title": "启动3006端口开发服务器"
  },
  "baseCommit": "19db63d1680074b3748993d2ec75fbe371f120d9",
  "commits": [
    "e8582891",
    "b726adb7",
    "2fcae4d5",
    "493f3d56",
    "12241e76",
    "edf5a5f5",
    "2230c64e",
    "4608bc7c",
    "265d7d33",
    "94609ed2",
    "76983456",
    "af031ae4",
    "0d75a146",
    "2e469718",
    "c5cc1617"
  ],
  "sources": [
    {
      "path": "docs/work-memory/sessions/2026-11-02-weekly-memory-review.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-11-02-cloudfront-release-p37.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-11-04-cloudfront-release-p38.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-11-04-codex-review-pr145-pr147.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-11-04-mobile-order-summary-official.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-11-05-local-work-memory-index.md"
    },
    {
      "path": "docs/work-memory/README.md"
    },
    {
      "path": "docs/adr/0049-local-work-memory-index.md"
    },
    {
      "path": "docs/agent-handbook.md"
    },
    {
      "path": "docs/order-entry-surface-parity.md"
    },
    {
      "path": "docs/trading-toolbar-redesign.md"
    },
    {
      "path": "apps/website/src/config/deployers.ts"
    },
    {
      "path": "apps/website/src/data/market-structure.json"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/actions/runs/42478194670"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/152"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/153"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/156"
    }
  ],
  "supersedes": []
}
-->
# 周整理：p37–p40 的交付、官网快照超龄与本地索引规则

## 背景与范围

本次接续 11 月 2 日的记忆提交 `e8582891`，核对其后本项目的 Git 变化、任务记录和明确关联的 PR。来源任务没有登记会话标识的，继续保留 `thread: null`，不根据分支名编造 ID。

共享检出为干净的 `dev@0ad17bd1`。fetch 后，`origin/dev` 为 `19db63d1`，`origin/main` 为 `af031ae4`。在独立工作树的 `codex/work-memory-2026-11-09` 上整理。没有修改业务实现、别人的分支或共享检出，没有推送、合并或部署。

## 结论与依据

### 交付与验证范围

下表的发布动作、应用测试和线上验证均是**来源任务报告**。本次核对了对应 Git 对象、祖先关系、PR 状态和当前相关代码，没有重新执行发布或应用验收。

| 版本 | 对应工作及来源报告 | 仍缺的验证 |
| --- | --- | --- |
| p37 · `2fcae4d5` | #134 的语言链接 Service Worker 修复已交付。#139 首次实际使用晋升覆盖，四个工作流判为覆盖；第一次发布构建超预算 101 字节，未部署，#140 重定总量基线后由 #141 再晋升。来源报告 verify 主网 15/15、测试网 16/16，CSP 33 步、2 跳过、0 违规。 | 已安装旧 Service Worker 的真实浏览器回访、离线和错误回退仍未验收。[p37 记录](2026-11-02-cloudfront-release-p37.md) |
| p38 · `493f3d56` | #143 的数量与实时价格小数位修复，#145 的预算调整，以及 #147 将历史价格改回协议小数位。来源报告上传首次有 3 个文件失败，重跑后标记一致，verify 15/15、16/16，CSP 33 步、2 跳过、0 违规。 | 真实滑杆观感、实际改单及 TP/SL、真机与读屏未验收。[p38 记录](2026-11-04-cloudfront-release-p38.md) |
| p39 · `4608bc7c` | #149 修正四张 TWAP 历史表对目录缺失市场的小数位兜底，经 #150 晋升。来源报告 verify 15/15、16/16，CSP 33 步、2 跳过、0 违规。 | 目录外市场的真实历史页面、钱包与真机未验收。发布记录仍在开放的 [#152](https://github.com/zora4523-bot/gatu-app/pull/152)。 |
| p40 · `af031ae4` | #151 对齐手机普通订单摘要并引入独立滑点面板，`265d7d33` 修正触控区引发的内部溢出；#154 调整两项预算后由 #155 晋升。来源报告 verify 15/15、16/16，CSP 33 步、2 跳过、0 违规。 | 有数值的 USDC 金额与超额清算价仅有单测覆盖，真实账户、真机和人工观感未验收。[摘要任务](2026-11-04-mobile-order-summary-official.md) |

p39 原文位于 `0d75a146:docs/work-memory/sessions/2026-11-04-cloudfront-release-p39.md`，p40 原文位于本地提交 `6c9e4d27:docs/work-memory/sessions/2026-11-05-cloudfront-release-p40.md`，可用 `git show <提交>:<路径>` 读取。两份记录的提交都不在所查 dev/main；p40 未见对应开放 PR。它们的代码提交已进入 main，不能把记录未合入理解为代码未发布，也不能把来源发布报告当成本次线上验证。

本次分别核对四个发布提交与其晋升 head 的树对象相同：`2fcae4d5 / 64c61c44`、`493f3d56 / 90c2e436`、`4608bc7c / 2230c64e`、`af031ae4 / 76983456`。

### 需要保留的失败与待决项

- p37 的第一次发布构建失败和 #140 的单测分片超时仍保留在原记录。重跑成功不说明第一次没失败。首次覆盖的运行证据已有 p37 补记，官方计费数字仍未取得，约 16 分钟是来源估算。
- 手机摘要任务的原全量 Vitest 有 37 项失败：36 项为替身缺导出，补齐后定向通过；另一项归因为本机未跟踪目录造成的契约误报。原 head `70b355fa` 的手机浏览器回归失败，由 `265d7d33` 修正。来源随后报告完整下单浏览器套件 47/47，包含 `reduce-only.pw.ts`；早期「尚未本地运行」只对应修复前。没有把这些结果重写成全量始终通过。
- 普通手机订单摘要的显示已变，Scale、TWAP 与桌面摘要的空值和单位仍保持原行为，等待运营方决定。当前 [surface parity](../../order-entry-surface-parity.md) 明确记录了这个范围。本次没有扩大修改。
- 实时价格和程序填值保留官方小数位；历史表格保留协议小数位，目录缺失最多八位。已静态核对四张 TWAP 表传入 market 对象，与当前 [History values](../../trading-toolbar-redesign.md#history-values) 一致。这不代替真实数据验收。

### 官网快照仍失败，修复分支尚未合入

查询仓库为 `zora4523-bot/gatu-app`，运行列表查询于 **2026-11-09 01:05:30 UTC**。11 月 2 日至 8 日七次定时检查全部 FAILURE：

| UTC 日期 | 运行 ID | 实际 head |
| --- | --- | --- |
| 11-02 | `41454869589` | `2fcae4d5` |
| 11-03 | `41639449878` | `2fcae4d5` |
| 11-04 | `41835047911` | `493f3d56` |
| 11-05 | `42034773866` | `af031ae4` |
| 11-06 | `42222354341` | `af031ae4` |
| 11-07 | `42369716325` | `af031ae4` |
| 11-08 | `42478194670` | `af031ae4` |

分别于 01:05:39、01:05:43 和 01:05:45 UTC 发起 11 月 2、4、8 日三次失败日志的查询，只保留审查后的诊断行。三次均确认 `xyz:JIO` 已改为 stocks，配置仍列作 Pre-IPO。4 日与 8 日还报告快照分别已 8.3、12.3 天，超过 7 天上限。其他四次只核对失败元数据，没有逐一推断其诊断内容。[最新运行](https://github.com/zora4523-bot/gatu-app/actions/runs/42478194670)

当前 dev/main 的快照仍为 `2026-10-27T05:46:52.566Z`。#153 的 head `2e469718` 已删除 JIO 的 Pre-IPO 配置、加入 `para:ANTH`，快照为 `2026-11-04T15:02:32.911Z`。来源任务报告在 `106c1190` 的内容上运行官网 97 项、产物 56 项、品牌检查及 `markets:snapshot --check` 均通过；初次旧断言、沙盒端口及 Chromium 限制造成的失败在原记录保留。本次未重新抓取市场数据或部署官网。

该 PR 查询时 OPEN / CLEAN，检查汇总 4 SUCCESS、3 SKIPPED。它尚不在 dev/main，分支检查通过不能改变默认分支定时检查的结果。来源快照的 7 天窗口止于 **2026-11-11 15:02:32 UTC**，处理时需重新核对新鲜度。来源记录可用 `git show 2e469718:docs/work-memory/sessions/2026-11-04-website-market-snapshot-refresh.md` 读取。[PR #153](https://github.com/zora4523-bot/gatu-app/pull/153)

### 工作记忆规则与记录状态

#156 的 `c5cc1617` 已合入 dev，尚未进入所查 main。ADR 0049 的索引规则在本次基线已生效：`INDEX.md` 是 Git 忽略的本地视图，`memory:check` 校验记录、生成能力和不跟踪索引，不比较本地文件。按本次 heartbeat 仍串行运行 `memory:index`，但不会提交索引。旧记录里曾提交索引是当时的事实，不改写。ADR 状态行仍写「未合入 dev」，属于状态文字滞后，已在对应任务补记实际合并证据。

#152 查询时 DIRTY，本地无提交的 `git merge-tree` 预演只返回 `INDEX.md` 修改/删除冲突。#153 已保留索引删除，当前 CLEAN。没有替其他任务解决冲突或更改它们的分支。Auto-fix 默认不再主动开启，晋升 PR 永远不开，遵循当前手册。

上周 `e8582891` 经 #142 已在 dev/main 可达。10 月 5 日的 `42f2bd23` 仍不在两条分支，本次没有移动或删除它。

### GitHub 查询边界

以下检查汇总显式查询同一仓库，时间为 **2026-11-09 01:05:24–01:05:30 UTC**，绑定表中实际 head。无检查项不等于 CI 通过，SKIPPED 不计为 SUCCESS。历史失败见各来源记录，表格只表示查询时的汇总。

| PR | 实际 head | 目标 / 状态 | 检查汇总 |
| --- | --- | --- | --- |
| #134 | `b726adb7` | dev / 已合并 | 4 SUCCESS、2 SKIPPED |
| #139 | `ce18a5a5` | main / 已合并 | 6 SUCCESS、3 SKIPPED |
| #140 | `da921a8e` | dev / 已合并 | 3 SUCCESS、2 SKIPPED |
| #141 | `64c61c44` | main / 已合并 | 3 SUCCESS、1 SKIPPED |
| #142 | `f35a7781` | dev / 已合并 | 无检查项 |
| #143 | `5f7a321c` | dev / 已合并 | 7 SUCCESS、4 SKIPPED |
| #144 | `369ecfc3` | dev / 已合并 | 无检查项 |
| #145 | `6c533454` | dev / 已合并 | 3 SUCCESS、2 SKIPPED |
| #146 | `90c2e436` | main / 已合并 | 6 SUCCESS、3 SKIPPED |
| #147 | `ec0b62d3` | dev / 已合并 | 6 SUCCESS、3 SKIPPED |
| #148 | `d8ea1f82` | dev / 已合并 | 无检查项 |
| #149 | `97f11aba` | dev / 已合并 | 6 SUCCESS、3 SKIPPED |
| #150 | `2230c64e` | main / 已合并 | 5 SUCCESS、2 SKIPPED |
| #151 | `265d7d33` | dev / 已合并 | 6 SUCCESS、3 SKIPPED |
| #152 | `0d75a146` | dev / 开放，有冲突 | 无检查项 |
| #153 | `2e469718` | dev / 开放 | 4 SUCCESS、3 SKIPPED |
| #154 | `94609ed2` | dev / 已合并 | 3 SUCCESS、2 SKIPPED |
| #155 | `76983456` | main / 已合并 | 5 SUCCESS、2 SKIPPED |
| #156 | `c5cc1617` | dev / 已合并 | 无检查项 |

## 验证与限制

本次修改六份既有任务记录的摘要、提交引用并追加补记，保留原正文与来源任务标识，新增本记录。未修改 AGENTS.md、业务代码、资金逻辑或发布配置。记录中的来源测试数与发布结果均标明出处，本次只执行记忆及静态证据检查。

在 `19db63d1` 的独立工作树中，`pnpm memory:index` 生成 243 份记录的本地索引，`pnpm memory:check` 通过，`pnpm memory:test` 为 11/11 通过、0 失败、0 跳过，`git diff --check` 通过。校验期间 HEAD 和全部任务文件的内容哈希稳定。另核对了六份旧正文与来源标识均保留、新增相对链接存在、19 个 PR head 与检查计数符合归档，以及 INDEX.md 未被 Git 跟踪。未运行应用测试、构建或真实设备检查。

首次本地提交被 commitlint 拒绝，原因是新工作树没有安装 `@commitlint/config-conventional`，仅把共享检出的可执行目录加入 PATH 不足以解析配置。未生成提交。随后只为提交钩子临时链接已有 node_modules，再次运行正常钩子；不安装或修改业务依赖，不跳过钩子。最终提交结果另存本地归档。

本地证据只归档已明确关联的 Codex 会话。主检出的 `.worklog/2026-11-09/01a08f6b-26ae-7642-a9a5-a074d906c899/snapshot-Hs3HUC/` 固定源边界为 224221248 字节、16183 行，导出 2503 个允许事件，末事件时间为 `2026-11-09T01:06:51.537Z`。已核对字段白名单和 events SHA-256 `274ec1ad0a00b3a34342db10d01e4a404230403c57d02e30a29367fbe3aa2607`。没有相同边界快照才生成本次副本，不重复导出其他项目或来源任务。工具参数、原始输出、内部推理和凭证均不在导出白名单内。同级 `weekly-review/` 仅保存筛选后的 PR、运行、诊断和验证摘要，目录受 Git 忽略。

## 后续与替代关系

1. 官网任务接续 #153。合入和发布须另行交互授权，实际处理时重新检查快照年龄和当前市场分类；通过后还要按真实 main head 核对定时检查。
2. #152 需要按 ADR 0049 保留索引删除以解决冲突。p40 的本地记录 `6c9e4d27` 尚待经授权纳入仓库。没有擅自复制或提交其他任务的原文件。
3. Scale/TWAP 与桌面摘要是否继续对齐由运营方决定；真实钱包、真机、已安装旧 Service Worker 的回访等验收不能由本次记忆检查替代。
4. 后续文档任务可同步 ADR 0049 状态行的「未合入」文字。本次只维护记忆文件，实际状态已在任务补记和本记录明确。
5. 所有补记只更正明确的状态和范围，不整体废弃来源记录，不恢复任何历史合并或发布授权。
