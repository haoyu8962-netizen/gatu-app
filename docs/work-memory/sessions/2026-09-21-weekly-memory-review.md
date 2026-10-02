<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-weekly-memory-review",
  "date": "2026-09-21",
  "title": "周整理：补齐提交、阶段状态与 main/dev 证据边界",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "work-memory",
    "docs-governance",
    "pr-review"
  ],
  "summary": "为 36 份记录补 67 个实际提交引用，修正 17 条阶段摘要；区分当前 main 基线、dev 新记录和已归档 Across 历史，保留失败与真机/发布缺口。本轮只验证记忆与远端历史状态。",
  "thread": {
    "id": "01a08f6b-26ae-7642-a9a5-a074d906c899",
    "title": "启动3006端口开发服务器"
  },
  "baseCommit": "d6cc4f3e9ffed0a7ba0092493fa161846be8c52f",
  "commits": [],
  "sources": [
    {
      "path": "docs/work-memory/README.md"
    },
    {
      "path": "docs/adr/0010-blank-until-ready-startup.md"
    },
    {
      "path": "docs/mobile-sync-ticketless-transfer-plan.md"
    },
    {
      "path": "deploy/cloudfront/README.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-19-cloudfront-release-gates.md"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-20-wallet-review-04.md"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/22"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/23"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/24"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/25"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/26"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/27"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/28"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/29"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/30"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/31"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/32"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/33"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/34"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/35"
    },
    {
      "url": "https://github.com/zora4523-bot/gatu-app/pull/36"
    }
  ],
  "supersedes": []
}
-->
# 周整理：补齐提交、阶段状态与 main/dev 证据边界

## 背景与范围

2026-09-21 的 Sairn 工作记忆 heartbeat。起始分支 `codex/dorad`，HEAD 为 `d6cc4f3e9ffed0a7ba0092493fa161846be8c52f`，工作区与暂存区干净；该提交恰好与本次查询的远端 main 相同，但当前检出的是独立开发分支。本次不切分支、不推送、不合并、不部署，也不修改业务、签名、资金或 CI 实现。历史会话里的合并请求不构成自动运行授权。

读取当前 AGENTS.md、agent.md、记忆 README/INDEX 与文档维护规则；初始 `pnpm memory:check` 已通过。初始当前目录有 53 份任务记录；工作索引可生成并不代表摘要都反映最终阶段。未取得来源任务标识的历史记录仍保留 `thread: null`，不从提交作者或日期推断会话。

## 结论与依据

- 为 2026-09-15 至 09-19 的 36 份记录补齐 67 个提交引用。使用当前 HEAD 可达的非合并 Git 历史，逐个核对该提交确实改动了对应记录，保留原有引用。这些引用包括实现与后续文档提交，只证明可追溯性，不代表测试、上线或整项功能验收。
- 修正 17 条索引摘要，追加本日说明而保留原始正文、失败、跳过与当时待办。启动占位的历史方案由 ADR 0010 部分取代，props-only 真实展示组件仍有效；旧“待 reviewer”阶段不能覆盖正文后续测量。
- PR #26 和弹窗复审记录已有实施与后续核对，不能继续笼统写“未修改代码”。弹窗 F3 的执行与路由卸载限制仍保留，未在本次修复。
- 无票据配对的正文已有静态托管与安全复核，以及修复后全量 6,360 项通过的来源报告；早期 32 项失败不能充当当前结果，也不能删除。包预算后有独立修复，真机矩阵、系统相机历史风险与生产启用仍不能据自动检查关闭。
- EC2 初次审计的“尚未退役”和文件移除时的“发布校验缺口”已被后续记录接续。资源退役为来源任务报告；本轮只读 Git、文档和 GitHub，没有云资源查询或生产发布。

当前实现入口核对仅包括 `components/startup-fallback.tsx` / `routes/__root.tsx` 的空白播报与启动门控、`lib/mobile-sync/sync-core.ts` 的 v3/两分钟协议常量、`deploy/cloudfront/deploy.mjs` 的构建发布闸门。它们支持文档阶段判断，不构成完整实现审计或运行验收。

## GitHub 状态的版本边界

显式指定仓库 `zora4523-bot/gatu-app`，查询汇总完成于 `2026-09-21T01:02:51.124062+00:00`。远端 main 为 `d6cc4f3e9ffed0a7ba0092493fa161846be8c52f`，dev 为 `5ea5d625f9e91705aa53d1511419b26d674112d4`。以下检查是各 PR 实际 head 的 `statusCheckRollup`，不沿用旧 head，也不代表合并后生产环境。空检查集合不等于通过或失败。

| PR | head | 目标与结果 | 当前查询的检查集合 |
| --- | --- | --- | --- |
| [#22](https://github.com/zora4523-bot/gatu-app/pull/22) | `42349cb11b53668a5120d2d5f21095061754e415` | `main`，已合并 | 8 SUCCESS |
| [#23](https://github.com/zora4523-bot/gatu-app/pull/23) | `ed663f0518d44b287fb0adcafd89ff40bfe8d827` | `main`，已合并 | 8 SUCCESS |
| [#24](https://github.com/zora4523-bot/gatu-app/pull/24) | `7ff8c48d25a53a69b5062ff955245ab5279e2d0f` | `main`，已合并 | 8 SUCCESS |
| [#25](https://github.com/zora4523-bot/gatu-app/pull/25) | `d76b12f99b4ccd1a837a3717a1844f87e445ea5e` | `main`，关闭，未合并 | 7 SUCCESS |
| [#26](https://github.com/zora4523-bot/gatu-app/pull/26) | `812b163e6ddc6cb0a3e5278c2a68e87babbe6280` | `main`，已合并 | 8 SUCCESS |
| [#27](https://github.com/zora4523-bot/gatu-app/pull/27) | `5d3935721f070075c5d976d61a3c27d12b5dc607` | `dev`，已合并 | 8 SUCCESS |
| [#28](https://github.com/zora4523-bot/gatu-app/pull/28) | `a5cfaa1b6f8f585499248a56ac91b04290003391` | `dev`，已合并 | 8 SUCCESS |
| [#29](https://github.com/zora4523-bot/gatu-app/pull/29) | `9264b04d19eea29ce8ef7944b76495095922f814` | `dev`，已合并 | 8 SUCCESS |
| [#30](https://github.com/zora4523-bot/gatu-app/pull/30) | `0af67e47722409bb350f61500d58ab0f0bac30c1` | `main`，已合并 | 8 SUCCESS |
| [#31](https://github.com/zora4523-bot/gatu-app/pull/31) | `cf3d8e16beab25424888d7528b53f6c7881e57a4` | `dev`，已合并 | 8 SUCCESS |
| [#32](https://github.com/zora4523-bot/gatu-app/pull/32) | `97627bd77d9ab71a04a06242d8b3765a2145c4a1` | `dev`，已合并 | 6 SUCCESS |
| [#33](https://github.com/zora4523-bot/gatu-app/pull/33) | `ab2874e1990ec14da5194c829fac29ed5566966c` | `dev`，已合并 | 8 SUCCESS |
| [#34](https://github.com/zora4523-bot/gatu-app/pull/34) | `1bfa35cea930323ddc1e27d14416aa16408046c2` | `dev`，已合并 | 8 SUCCESS |
| [#35](https://github.com/zora4523-bot/gatu-app/pull/35) | `4223703600e1a0a961d70b34c506593355f9c42e` | `dev`，已合并 | 8 SUCCESS |
| [#36](https://github.com/zora4523-bot/gatu-app/pull/36) | `9333e918b228079a0ff81e3340cf1e10b4de6f96` | `dev`，已合并 | 未返回检查项 |

PR #27–#29 经 PR #30 进入 main；#31–#36 是此后合入 dev 的工作，不在本次基线中。PR #29 的“未推送”属于记录建立时，现已由远端状态更新；是否实际部署仍未在本轮核验。PR #25 是关闭而非合并，不根据检查通过猜测交付。PR #22/#23 的完成证据已由 dev 上的历史迁移修订接续，本轮不从旧 main 重做那批修订。

## 后续与替代关系

### 跨分支检索与归档

当前目录之外，已核对 dev `5ea5d625f9e91705aa53d1511419b26d674112d4` 中另有 13 份记录。只提供固定提交的检索入口，不复制整个 dev 索引，不将其实现或验证宣称属于本次 checkout：

- [CI 分钟耗尽：账单锁定诊断与同 PR 并发取消](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-15-ci-minutes-concurrency.md)。
- [邮箱钱包标识、提现链与密钥导出入口审查](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-16-email-wallet-ui-review.md)。
- [账户指定流水的发送与跨链提款区分](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-16-send-versus-withdrawal.md)。
- [本地 3005 钱包会话失败与手动刷新恢复](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-16-wallet-session-recovery.md)。
- [按四条方案改造 PR 检查，并与同日的首版 CI 分层合并整理](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-19-ci-restructure.md)。
- [工作分支先进 dev、CI 按目标分支分层与测试移出矩阵](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-19-ci-tiers-dev-first-flow.md)。
- [Connect Wallet 按钮悬停态：去掉整体淡出，补上暗色面板按钮的悬停反馈](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-19-connect-cta-hover-states.md)。
- [暗色浮层与遮罩改为终端色相，并修复语言菜单禁用文字](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-19-dark-overlay-hue-family.md)。
- [Link Device 续作：配对预检覆盖 builder dex，本地静态服务按 CDN 方式提供 build-meta.json](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-19-link-device-followups.md)。
- [菜单共享皮肤、弹窗统一圆角与边框，并让 cn() 认识项目刻度](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-19-popup-skin-and-dialog-chrome.md)。
- [字体实践审查：对照官方终端，修复图表字体栈、共享字号刻度、错误页字体并迁移等值任意字号](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-20-font-practice-review.md)。
- [配对页加固（A 批）：头部内联擦除、阻断说明页、路径规范、Service Worker 放行、StrictMode](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-20-pairing-page-hardening.md)。
- [worktree-04 承接三项钱包审查并归档旧分支](https://github.com/zora4523-bot/gatu-app/blob/5ea5d625f9e91705aa53d1511419b26d674112d4/docs/work-memory/sessions/2026-09-20-wallet-review-04.md)。

上述迁移记录说明：上一周未提交的记忆修订已由另一任务保存在归档标签，并将 11 份现存记录的修订带入 dev；仅存在于 Across 归档中的记录没有搬入当前代码线。本轮从该记录与 Git 状态确认需要按分支检索，不重新读取凭据、导出钱包记录、重建缺失会话或恢复 Across 实现。归档的上传和资源操作均为来源报告，不是本次执行。

需要后续工作注意的范围：

- 启动 ADR 0009 和部分旧迁移正文仍保留当时待测描述，检索时先看 ADR 0010 与后续验证段落；不照旧记录重新引入启动占位。
- 当前基线的配对后续待办应结合 dev 的 PR #33/#34 阅读；它们已有 builder-dex 预检、静态 build-meta、配对页头部擦除等代码与来源测试记录，但本轮没有验证当前线上状态、真实钱包或设备矩阵。
- dev 的 CI 记录中首版 D2 与后续 D2′ 是不同方案；读取该分支现行 ADR 0016 和工作流后再判断，不能沿用“只有进 main 才跑构建/浏览器”的早期摘要。PR #32 已合并且返回六项成功检查，但不证明所有触发条件或保护规则已经验收。
- 本轮只在开发分支产生记忆提交。后续如需将记忆带入 dev，应保留那里的已有修订并重新生成索引；本自动任务不执行该合并。

## 本地证据与覆盖范围

旧快照 `.worklog/2026-09-14/01a08f6b-26ae-7642-a9a5-a074d906c899/snapshot-ztkI5y` 的边界为 174,249,567 字节，尚不包含之后明确禁止自动合并的交互。本次只对已关联的同一会话补拍 `.worklog/2026-09-21/01a08f6b-26ae-7642-a9a5-a074d906c899/snapshot-jBSfPv`：归档时间 `2026-09-21T01:04:10.954Z`，源边界 182,921,904 字节 / 14,492 行，2,245 个允许事件，末事件 `2026-09-21T01:04:10.338Z`；events SHA-256 为 `2b0a2c9e90df1b59cdb347cfa1b72ca0786a8f4934b6d5ba4d718dd50b87d9df`，本地重新计算一致。未批量扫描或导出其他会话；不因本轮后续日志增长而重复补拍。

快照仅含经过筛选和模式脱敏的可见文本、工具名称，排除内部推理、工具参数/输出和附件；工具名称不证明成功。GitHub 查询结果与逐文件提交核对分别为同目录 `weekly-review/github-evidence.json`、`commit-record-audit.json`，只保存经过选取的非秘密字段，全部留在 Git 忽略的 `.worklog/`。

## 验证与限制

本轮未运行应用测试、类型检查、构建或浏览器测试，没有调用资金/签名接口；各旧测试数字与发布结论仍绑定来源版本。当前只验证记忆文件、索引、Git 引用及远端历史状态。

首次 `pnpm memory:index` 退出 1：本记录使用了自定义标题，缺少模板要求的“结论与依据”等固定章节；已按现有模板更正标题，没有修改校验器或绕过检查。

修正后 `pnpm memory:index` 成功生成 54 份记录的索引，`pnpm memory:check` 通过，`pnpm memory:test` 8/8 通过，`git diff --check` 通过。`.worklog/` 的本次证据路径经 `git check-ignore` 确认保持忽略；PR 合并提交的祖先关系核对与本文 main/dev 边界一致。索引生成前检查记录指纹、Git 状态及写入者，本次 agent 列表仅返回当前任务，未修改记录的指纹与基线一致；不覆盖其他任务文件。

## 合入补记（2026-09-28）

本记录所在提交 `92ecaa78`（`codex/dorad`）一直未推送。2026-09-28 盘点未提 PR 的分支后，按用户决定以拣选方式带入分支 `docs/weekly-records-and-builder-delisting`，新提交为 `978a96ee`；拣选时只有生成的索引冲突，按当时的 `dev` 重新生成。正文内容未改。盘点过程见 [分支盘点记录](2026-09-28-branch-audit-and-docs-page-fixes.md)。
