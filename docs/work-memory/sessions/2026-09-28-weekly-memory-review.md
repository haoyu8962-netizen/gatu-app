<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-weekly-memory-review",
  "date": "2026-09-28",
  "title": "周整理：补齐阶段闭环、测试边界与跨分支检索",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "work-memory",
    "docs-governance",
    "pr-review",
    "pairing-release"
  ],
  "summary": "核对 09-21 后新增记录，为 46 份记录补 75 个提交引用、修正 17 条索引摘要并追加 20 条阶段说明；纠正简化配对全量通过的过度表述，保留真机与发布证据缺口，区分当前 checkout、main/dev 及未合并 PR。本轮仅整理与验证记忆。",
  "thread": {
    "id": "01a08f6b-26ae-7642-a9a5-a074d906c899",
    "title": "启动3006端口开发服务器"
  },
  "baseCommit": "0caba9bb198bf3b2ae72f5f5cb96e8eda5e3c37b",
  "commits": [],
  "sources": [
    {
      "path": "docs/work-memory/README.md"
    },
    {
      "path": "docs/documentation-system.md"
    },
    {
      "path": "docs/confirmation-surfaces.md"
    },
    {
      "path": "docs/trading-notifications.md"
    },
    {
      "path": "docs/adr/0015-link-device-alignment.md"
    },
    {
      "path": "docs/number-format-setting.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-27-hip3-alignment-review-fixes.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-24-link-mobile-device-simplification.md"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/37"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/38"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/39"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/40"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/41"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/42"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/43"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/44"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/45"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/46"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/47"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/48"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/49"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/50"
    }
  ],
  "supersedes": []
}
-->
# 周整理：补齐阶段闭环、测试边界与跨分支检索

## 背景与范围

2026-09-28 的 GATU 工作记忆 heartbeat。起始分支 `codex/reviewceshi`，HEAD `0caba9bb198bf3b2ae72f5f5cb96e8eda5e3c37b`，工作区和暂存区干净。读取当前 AGENTS.md、agent.md、记忆 README/INDEX 与文档体系约定；初始 `pnpm memory:check` 通过。本次不改变业务、签名、资金、部署或 CI 实现，不切分支、不推送、不合并、不部署。

上次周整理在 `codex/dorad` 的 `92ecaa78`，本次通过 `git show` 读取其任务记录。该提交不是当前 HEAD 的祖先，当前目录也没有那份周记录；这是分支边界，不能据此宣称整理丢失或回退，也不自动 cherry-pick 那批修改。上周记录可在本地 `git show 92ecaa78:docs/work-memory/sessions/2026-09-21-weekly-memory-review.md` 检索。本轮聚焦本目录 09-21 至 09-27 的 46 份新记录及关联后续，未重复修订上周那批旧文件。

来源记录缺少任务标识的仍保留 `thread: null`。它们的测试、真实账户调试和发布结果属于来源任务报告；没有批量导出其它任务，也没有根据提交作者补造 Thread/Session。

## 结论与依据

### 提交与阶段整理

- 给 46 份记录增加 75 个实际提交引用：逐份读取当前 HEAD 可达的非合并 Git 历史，并核对提交确实改动该记录；保留已有引用。引用包含实施和后续文档提交，不把每个记录提交都称为业务实现。
- 修正 17 条元数据摘要，追加 20 条本日阶段说明，保留原正文、失败、跳过及当时待办。没有把局部决策过期标成整个任务废弃，也未改动 AGENTS.md 的稳定规则。
- 只减仓、移动全部平仓、静态确认按钮和资金弹层规划已有后续实施；相关摘要不再只显示“未实施”。资金弹层有意等待请求结束，不能由交易弹层点击即关的规则推导资金弹层也该如此。只减仓原全量中的已知 SSR 失败、浏览器重跑及实盘缺口仍保留。
- 全局 Sonner、残留 pending 生命周期、精简文案以及 `FrontendMarket` 余量取消已有连续修复记录。早期 Ioc-only 修复未覆盖真实市价路径，09-22 后续才补齐；历史复审的通过数字不是“缺陷不存在”的证据。全局反馈能保留结果，不等于执行请求能跨页继续。
- 市价平仓的页面级宿主、点击即封存、等待期间尝试身份、按意图加载与离页废弃等待尝试分别由 09-23/09-24 任务接续。`account-actions` 和 `user-menu-recovery` 夹具失败已有修复记录；当前 checkout 的浏览器 CI 清单仍未包含后者。离开交易/投资组合页面时执行失败关闭的限制没有在本轮改变。
- HIP-3 09-25 记录正文已有 09-27 修复链接，摘要仍写“均未修复”，现已更正。当前代码中两个 store 的 `persisted ?? {}`、限价平仓关闭中拒绝提交、页面/平仓免责声明的不同 dismissible 条件与记录一致。`06293549` 是原补丁，`518d0039` 是本分支 cherry-pick；复现归属按 09-27 后续记录更正，不误称由用户亲自完成。四种平仓在真实 HIP-3 仓位上的验证仍未取得。

### 配对简化与证据纠正

当前 ADR 0015 D8 与 `sync-core.ts` 采用载荷 v4、两分钟到期、单个 `VITE_MOBILE_PAIRING_ENABLED`；弹窗 `QR_REVEAL_HOLD_MS` 为 2000。旧 v3 加密信封、双开关、待核验恢复、桌面撤销面板和旧设备矩阵的描述只适用于旧阶段，后续以头部唯一入口及 API 钱包页移除为准。此处只标明失效范围，没有重新评估安全设计或打开生产开关。

发现一项明确的记忆证据冲突：09-24 简化配对摘要声称“全量全部通过”，正文却记录全量有一项 RTL 契约失败，修正后仅该文件 32 项通过。现将摘要收窄为实际来源记录，保留失败，不虚构该阶段全量复跑。09-27 独立记录的 6862 项通过属于后续版本，不能回填到 09-24。配对真实邮箱流程是在开发构建、工具注入、同源标签中完成，不是独立手机或物理输入验收；来源中的延迟分解也不能当作稳定性能保证。

四语缺译、RD-1…RD-3 真机清单、揭示后一秒倒计时仍显示 60 的观察，以及是否清理配对专用边缘响应头仍为来源待办。本周未再次签名、扫码、查看密钥或执行真实资金动作。

### 其它本周检索入口

- [数字格式、图表与日期规则](2026-09-24-number-format-chart-and-date-rules.md)：`91ec4d11`、`949693a5`、`afd66c40`、`11f641ad` 可追溯；数字格式与界面语言分开，逗号输入归一化为协议小数点。未在本轮重跑语言或图表用例。
- [p22 发布来源记录](2026-09-21-cloudfront-release-p22.md)与 [p23 发布来源记录](2026-09-24-cloudfront-release-p23.md)：记录的是此前授权任务的实际发布报告。本次 GitHub 只确认对应 PR/提交，不核验当前生产环境。

## GitHub 状态与分支边界

明确查询仓库 `zora4523-bot/gatu-app`。查询区间为 `2026-09-28T01:05:13.846339+00:00` 至 `2026-09-28T01:05:38.487091+00:00`：

- main：`e3b5dd82854e779fae21cda32dd702892b476b42`。
- dev：`24444b5b50caedee2da61e539f03a3f5c245ad92`。
- `codex/reviewceshi`：`0caba9bb198bf3b2ae72f5f5cb96e8eda5e3c37b`，与本次基线相同。

下表是查询时各 PR 实际 head 的检查集合；不是本轮运行 CI，也不是之后提交或合并提交的结果。空集合不表示通过或失败。

| PR | 实际 head | 目标 / 状态 | 查询时检查集合 |
| --- | --- | --- | --- |
| [#37](https://github.com/zora4523-bot/gatu-app/pull/37) | `9e163d1fbcc42acea49b773c13a27c0a75bf4e18` | `dev` / 已合并 | 5 SUCCESS |
| [#38](https://github.com/zora4523-bot/gatu-app/pull/38) | `23c106c2a5730d323c06e1734953033afd75e154` | `main` / 已合并 | 9 SUCCESS |
| [#39](https://github.com/zora4523-bot/gatu-app/pull/39) | `eb74bf143f2d53112898d06767cf50bbe41f1ecf` | `dev` / 已合并 | 未返回检查项 |
| [#40](https://github.com/zora4523-bot/gatu-app/pull/40) | `1eea914e7bf85552e5e4292389654786124a033e` | `dev` / 已合并 | 5 SUCCESS |
| [#41](https://github.com/zora4523-bot/gatu-app/pull/41) | `42237b049d715c8c3b47214d64a9d3056ac8b45d` | `main` / 已合并 | 8 SUCCESS |
| [#42](https://github.com/zora4523-bot/gatu-app/pull/42) | `0deec7541251cbab7010aca90fd699180e97338b` | `dev` / 已合并 | 未返回检查项 |
| [#43](https://github.com/zora4523-bot/gatu-app/pull/43) | `d2a0d6c3abdb96eaa66480af1b4c80ff845c3082` | `dev` / 开放 | 5 SUCCESS |
| [#44](https://github.com/zora4523-bot/gatu-app/pull/44) | `0caba9bb198bf3b2ae72f5f5cb96e8eda5e3c37b` | `dev` / 已合并 | 6 SUCCESS |
| [#45](https://github.com/zora4523-bot/gatu-app/pull/45) | `8b9950ce6dcbf9f21ac12ac7609c9b363cc52950` | `main` / 已合并 | 7 SUCCESS |
| [#46](https://github.com/zora4523-bot/gatu-app/pull/46) | `dca421b9436e35494e40aac3bd924dbae07b015e` | `dev` / 已合并 | 5 SUCCESS |
| [#47](https://github.com/zora4523-bot/gatu-app/pull/47) | `eff85c8a7dd1ab96f96c99bc3f993f4f797a0fca` | `dev` / 已合并 | 5 SUCCESS |
| [#48](https://github.com/zora4523-bot/gatu-app/pull/48) | `81b1ba482995a3bdac68d0166adbcccfbd6a6be3` | `dev` / 开放 | 5 SUCCESS |
| [#49](https://github.com/zora4523-bot/gatu-app/pull/49) | `21c896a81a886f26aaddb379117c799059338970` | `dev` / 开放 | 5 SUCCESS |
| [#50](https://github.com/zora4523-bot/gatu-app/pull/50) | `0a5b6a022701d264dbf34503a0370a097c632f6b` | `dev` / 开放 | 5 SUCCESS |

PR #37 经 #38、#40 经 #41、#44 经 #45 进入 main；#39/#42 是后续发布记录 PR。PR #44 的 head 正是当前基线，但 main/dev 的后续合并提交不在当前 checkout 的祖先中。PR #46/#47 合入 dev、尚不在本次 checkout 或所查 main；其新规范不可直接套用为本次目录已实现行为。

PR #43、#48、#49、#50 查询时仍开放。#43 的首次访问保护已有原提交/cherry-pick 来源，不能据此推断整个 PR 可关闭；#48 借贷页、#49 滑杆测试、#50 SDK 接口集成只记录 PR 状态，本轮未审查其代码、完整测试日志或任务会话。检查通过不是自动合并授权。

当前 dev 多出两份记录，只提供固定版本链接，不复制其索引或把其验证归入本次 checkout：

- [仪表盘路由揭示前预加载页脚与全局弹窗宿主](https://github.com/zora4523-bot/gatu-app/blob/24444b5b50caedee2da61e539f03a3f5c245ad92/docs/work-memory/sessions/2026-09-27-dashboard-route-chrome-preload.md)。
- [文档与法律页并入应用外壳，对齐官方条款页](https://github.com/zora4523-bot/gatu-app/blob/24444b5b50caedee2da61e539f03a3f5c245ad92/docs/work-memory/sessions/2026-09-27-legal-pages-app-shell.md)。

## 本地证据与覆盖范围

只对已明确关联的当前会话归档。旧快照 `snapshot-jBSfPv` 的源边界为 182,921,904 字节，本次存在新的实质整理记录，因此补拍一次 `.worklog/2026-09-28/01a08f6b-26ae-7642-a9a5-a074d906c899/snapshot-EkVyuD/`：归档时间 `2026-09-28T01:06:44.763Z`，固定源边界 188,076,878 字节、14,703 行，2,280 个允许事件；最后事件时间 `2026-09-28T01:06:44.187Z`；events SHA-256 `34cb69a227ea0dd334a93ed37175a095c8e91e471a8d43a8f93b76e992585aab`，已重新计算一致。不会为本轮后续日志增长再补拍。

快照是筛选、模式脱敏的可见文本和工具名称，不是完整原始记录；内部推理、工具参数/输出和附件被排除，工具名称不能证明成功。同目录 `weekly-review/` 保存本轮经选择的 GitHub 状态、记录提交映射、改前指纹和 dev 独有记录元数据，均为本地证据，不提交。没有导出无关任务、读取凭据或把未经检查的工具输出纳入仓库。

## 验证与限制

本轮验证对象是基线 `0caba9bb` 上的记忆修订。只读代码入口支持文档阶段判断，不构成完整实现审计。未运行应用单测、类型检查、构建、浏览器或真机测试；没有重新验证官方终端、云资源或线上构建。原测试和发布事实均明确归属其来源版本。

`pnpm memory:index` 成功生成 115 份记录的索引，`pnpm memory:check` 通过，`pnpm memory:test` 8/8 通过，`git diff --check` 通过。另核对新增 75 个提交引用、索引与本记录的本地链接、快照 SHA-256 与 Git 忽略规则；均通过。索引生成前确认本次 agent 列表只有当前任务、HEAD 未变、暂存区为空、其它记忆文件指纹未变；逐份确认旧正文完整保留，来源标识、原 status 和 sources 未被改写。

本次未遇到必需验证失败。早期读取用了错误模板/源码候选路径，改查实际文件后继续；这些读取失败不计为业务或验证失败。按 `auto-commit` 与 `task-completion-commit` 只提交核验后的记忆文件；本次提交可由 Git 历史追踪，不为填写自身 SHA 循环 amend。

## 后续与替代关系

- 来源缺失的 Thread/Session 保持缺失；需要原会话才可补齐，不能从 Git 作者猜测。
- 继续保留真实 HIP-3 持仓下四种平仓、限价退出过渡真机操作、配对三行真机/四语及其它来源未覆盖场景。协议注入和合成夹具不能替代物理手势验收。
- `docs/trading-notifications.md` 与确认面文档的部分段落仍保留“尚未发布”等日期状态；当前发布来源记录已有后续。查历史交付应按 p22/p23 任务及固定提交，不把旧状态当当前线上结论。本轮仅记录冲突，未改写业务 Reference 或核实当前部署。
- dev 的文档路由应用壳方案改变了本 checkout 的旧文档路由边界；后续开发先读目标分支的当前 AGENTS/ADR，不将不同分支材料拼成同一版本。
- 已合并 PR #44 不会自动包含本轮新记忆提交。未来同步记忆应明确目标分支、保留那里已有修订并重新生成索引；本次不推送或创建/更新 PR。
- 所有合并、自动合并、主分支提交和部署均不在本次 heartbeat 授权内；历史用户命令和本轮 CI 查询不能充当授权。
