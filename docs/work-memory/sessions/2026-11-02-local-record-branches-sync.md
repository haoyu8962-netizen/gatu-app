<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-02-local-record-branches-sync",
  "date": "2026-11-02",
  "title": "四条只在本地的文档分支合入 dev：p30/p32 周整理、10-26 周整理与 Across 搁置记录",
  "kind": "task",
  "status": "recorded",
  "topics": ["work-memory", "docs-governance", "account-funding"],
  "summary": "运营方问所有修复是否都已合入 dev，起头会话找出四条只改文档、从未推送的本地分支，交本任务审阅并合成一个进 dev 的文档 PR。逐条对照 dev 26c06d02：codex/work-memory-2026-10-12（95e12620）的内容 10-13 已由 c9169980 经 PR #111 移植进 dev，合并只为让 10-19 周整理补的 95e12620 引用可达，重建索引后树与 dev 相同；10-19（43b78f96）、10-26（ad408e8c）两份周整理与 claude/across-shelved-record（680c93e1、5d2e72c6）的 Across 搁置决定都没有被后来的记录取代，四次合并只冲突在 INDEX.md。在 claude/local-records-sync 依次 --no-ff 合并，给三份合入记录追加 11-02 补注，ADR 目录与文档地图补记搁置。复核 Across 官方页面：补记引用的两条事实成立，但持久地址指南把取得 Key 指向自助表单，自助表单拿不到权限仍是推断。另发现 10-05 周整理 42f2bd23 已无分支指向，按原名重建本地分支防止被回收。应起头会话的请求，在 audit-group2 记录补记 PR #132 以 26c06d02 合入 dev。memory 三项检查与 git diff --check 通过；经 PR #135 于 2026-11-02 合入 dev（1262bf5d）。补记里「#132 未晋升 main、未发布」的核对早于 PR #133 的晋升，已另行更正。",
  "thread": null,
  "baseCommit": "26c06d02",
  "commits": ["95e12620", "43b78f96", "ad408e8c", "680c93e1", "5d2e72c6", "e646ec56", "ebadc349", "9554cd20", "cfd3e0fd"],
  "sources": [
    {"path": "docs/work-memory/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "docs/across-reference.md"},
    {"path": "docs/adr/0004-across-deposit-addresses.md"},
    {"path": "docs/adr/README.md"},
    {"path": "docs/README.md"},
    {"path": "docs/work-memory/sessions/2026-10-12-weekly-memory-review.md"},
    {"path": "docs/work-memory/sessions/2026-10-19-weekly-memory-review.md"},
    {"path": "docs/work-memory/sessions/2026-10-26-weekly-memory-review.md"},
    {"path": "docs/work-memory/sessions/2026-10-31-across-shelved-and-open-issues.md"},
    {"path": "docs/work-memory/sessions/2026-11-01-audit-group2.md"},
    {"path": "scripts/work-memory.mjs"},
    {"path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx"},
    {"url": "https://docs.across.to/llms.txt"},
    {"url": "https://docs.across.to/introduction/persistent-deposit-addresses"},
    {"url": "https://docs.across.to/introduction/api-keys"},
    {"url": "https://docs.across.to/introduction/faq"},
    {"url": "https://docs.across.to/tools/integrator-id"},
    {"url": "https://github.com/zora4523-bot/gatu-app/pull/132"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# 四条只在本地的文档分支合入 dev：p30/p32 周整理、10-26 周整理与 Across 搁置记录

## 背景与范围

同步记录，未取得任务标识。2026-11-02 运营方问「所有修复都合并到 dev 了吗」，起头的会话核对后找出几条只改文档、从未推送的本地分支，把审阅与合入交给本任务。起头会话转述的运营方规则：推送、开 PR、合并各需单独同意；不用裸 `git stash`；提交信息用带 scope 的 Conventional Commit 并带 Co-Authored-By 行。任务要求：先读[工作记忆约定](../README.md)与 [Agent 工作手册](../../agent-handbook.md)，Across 部分按[阅读入口](../../across-reference.md)的流程处理；从 `origin/dev` 开分支，逐条对照当前 `dev` 判断是否被取代或冲突；用 `--no-ff` 合并保留原提交号，`INDEX.md` 冲突用 `pnpm memory:index` 重建；推送和开 PR 之前先问运营方。`claude/link-language-review-fixes` 与 `claude/release-p35-record` 属于另一个任务，不在范围内。

基线：工作树 `.claude/worktrees/inspiring-burnell-6aebc2`，开始时停在 `main` 的 `cdb47637`，工作区干净。第一次 `git fetch` 后 `origin/dev` 是 `ec067207`，随后再取到 `26c06d02`（PR #132 于 2026-11-01T16:25:40Z 合入，`git ls-remote` 确认）。集成分支用 `git switch --no-track -c claude/local-records-sync origin/dev` 从 `26c06d02` 建立。四条分支在远端都不存在，`git cherry -v origin/dev <分支>` 对五个提交全部给出 `+`。

## 结论与依据

| 分支 | 头 | 内容 | 与当前 `dev` 的关系 | 处理 |
| --- | --- | --- | --- | --- |
| `codex/work-memory-2026-10-12` | `95e12620` | p30 周整理：新增 10-12 周整理与版本入口事后记录，改 33 份旧记录 | 2026-10-13 已由 `c9169980`（PR #111，提交信息注明 cherry-pick 自 `95e12620`）移植进 `dev`。逐文件 `git patch-id --stable` 比较：35 份记录中 34 份相同；滑杆记录只差 `dev` 上多出的一条同日更正；`INDEX.md` 随各自的记录集合生成 | 合并（`e646ec56`），只为保留原提交号：10-19 周整理给 10-12 周整理的 `commits` 补了 `95e12620`，而 `memory:check` 用 `git cat-file -e` 校验引用，没有推送的提交在别的克隆里会校验失败。合并并重建索引后 `git diff --stat origin/dev` 为空，没有重复套用补丁 |
| `codex/work-memory-2026-10-19` | `43b78f96` | p31/p32 周整理：新增本周记录，给 12 份记录补 17 个提交引用、更新 7 条摘要、追加 10 条补注 | 与已经进入 `dev` 的 10-12 周整理是同一做法。13 个改动文件在 `dev` 上自其基线 `7ff72706` 以来没有再改，合并结果与分支版本逐文件相同 | 合并（`ebadc349`），追加补注 |
| `codex/work-memory-2026-10-26` | `ad408e8c` | 10-26 周整理：只新增本周记录与索引，记下日本地区与官网阶段 1 的 12 个本地提交和两份过期摘要 | 写的是 10-26 的状态。其中 12 个提交后来随 PR #115 进入 `dev`、随 p33 发布；「两份摘要落后」到今天仍成立 | 合并（`9554cd20`），追加补注 |
| `claude/across-shelved-record` | `5d2e72c6` | `680c93e1`：Across 持久地址搁置，ADR 0004、接入设计与阅读入口补记，新增任务记录；`5d2e72c6`：同一记录补第一批 P1 的推送与 PR #123–#128 | 三份规范文档在 `dev` 上自 `d99c2bc9` 以来没有再改。搁置决定没有被后来的记录取代，`dev` 里也没有别处记录它。记录里的「未修复」表是 10-31 中午的快照，之后 #129、#131、#132 已合入 | 合并（`cfd3e0fd`），追加补注，ADR 目录与文档地图补记搁置 |

四次合并都只在 `docs/work-memory/INDEX.md` 冲突，每次用 `pnpm memory:index` 重建、`pnpm memory:check` 通过后再提交。合并提交沿用 P1/P2 集成分支的写法 `chore(integration): merge <分支> into docs sync`。合并进来的记录与规范文档，逐文件和原分支版本相同（`git diff --quiet <原提交> -- <文件>`）。

**Across 部分的核对**，按阅读入口的顺序：

- 现行实现：`dev` 上 `deposit-modal.tsx` 的存款路由默认 `cctp`，提款按 `usdcRouting` 选 `sendToEvmWithData` 或 `withdraw3`，与 ADR 0004 补记一致。
- 官方页面（2026-11-02 只读下载 `llms.txt` 与各页 `.mdx`）：`llms.txt` 列有自助申请页 `/tools/integrator-id`，持久地址接口的条目写明需要带 `deposit-address` 权限的 Key；API Keys 页仍写 Integrator ID 经共享渠道（Telegram、Slack）申请；FAQ 仍写 `GET /swap/counterfactual` 已弃用、地址 24 小时有效。ADR 补记引用的这两条事实成立。
- 新的观察：持久地址指南把取得 Key 的链接指向自助申请页，而自助申请页的 `.mdx` 只有标题和一个表单组件，读不出它发放的 Key 带什么权限。所以 10-31 记录里「自助表单拿不到权限」仍是推断。这一条写进该记录的补注，ADR 正文没有改。

**本任务自己的提交**做三件事：

- 三份合入记录（[10-19](2026-10-19-weekly-memory-review.md)、[10-26](2026-10-26-weekly-memory-review.md)、[Across](2026-10-31-across-shelved-and-open-issues.md)）末尾各加「合入补注（2026-11-02）」，写合入经过、已被后续事件取代的阶段说法及出处，原文不改。
- [ADR 目录](../../adr/README.md)的 0004 行与[文档地图](../../README.md)的 Across 行补记 2026-10-31 搁置，与 ADR 0004 正文的补记一致。
- 起头会话随后请求在本 PR 里顺带补记 PR #132 的合并（手册：纯文档补记随下一个 PR 带上）。[第二组审查记录](2026-11-01-audit-group2.md)的摘要补上已合入 `dev`，后续清单里「合并 PR #132」一项标注已合并，并追加一条补记。合并时间、父提交、`01e1e5b5` 上的检查结果、与 `26c06d02` 的树差异、`main` 与线上版本、远端分支，都用 git、`gh` 与线上 `build-meta.json` 逐项核对；「运营方同意」一事无法独立核对，注明据执行合并的会话转述。

**范围外的发现**：

- `42f2bd23`（10-05 周整理，基线 `498ea17a`：新增 10-05 周整理，改 43 份记录与索引）不在 `dev`。它的分支 `codex/work-memory-2026-10-05` 已不存在，只剩主检出 HEAD 在 2026-10-05 09:18 的一条 reflog。git 默认 30 天后清理不可达的 reflog 条目（约 2026-11-04 起），之后 gc 可能删掉这个提交。本任务按原名重建了本地分支 `codex/work-memory-2026-10-05`，指向 `42f2bd23`，没有合并、没有推送。10-12 周整理当时明确没有重套它的旧修订，要不要同步需另行审阅。
- 开放中的 PR #130（`claude/lucid-boyd-efe166` → `dev`）也改 `INDEX.md` 与 `docs/adr/README.md`。它和本分支谁后合入，谁就要先合并 `dev` 并重建索引。

## 验证与限制

- 环境：Node 22.15.0、pnpm 10.21.0；工作树没有安装依赖。
- 合并前：`git merge-tree --write-tree --name-only origin/dev <分支>` 对四条分支都只报 `INDEX.md` 冲突；`git range-diff` 与逐文件 patch-id 比较了 `95e12620` 与 `c9169980`。
- 每次合并后：`pnpm memory:index`、`pnpm memory:check` 通过。
- 引用可达性：用 `scripts/work-memory.mjs` 的 `loadMemory` 读出全部记录的 `baseCommit` 与 `commits`，逐个检查是否是 HEAD 的祖先。四次合并之后，230 份记录共 764 个不同引用，756 个是 HEAD 的祖先；其余 8 个都在远端：6 个在 `archive/across-deposit-addresses-20260920` 标签里，2 个是只在 `main` 的晋升合并 `2dcfd3e0`、`2047ee8d`。加上本记录后是 231 份记录、773 个引用、765 个是 HEAD 的祖先，其余仍是这 8 个。
- 链接：本分支相对 `dev` 改动或新增的 22 份 Markdown（不含 `INDEX.md`）共 338 个相对链接，目标都存在；HTTPS 链接只核对了 Across 的五个页面。
- PR #132 补记的核对：`gh pr view 132` 给出头提交 `01e1e5b5`、`mergedAt` 2026-11-01T16:25:40Z、合并提交 `26c06d02`；`01e1e5b5` 的 check-runs 为 7 项成功、2 项 `claude` 跳过；`git diff 01e1e5b5 26c06d02` 为 0 行；`26c06d02` 不是 `origin/main` 的祖先；线上 `build-meta.json` 的 `commit` 为 `cdb47637`、`release` 为 `cloudfront-2026-10-28-p35`；`git ls-remote` 显示远端 `claude/audit-group2` 仍指向 `01e1e5b5`。
- 最终检查（分支头，Node 22.15.0）：`pnpm memory:index` 后 `pnpm memory:check` 通过，`pnpm memory:test` 8 项全部通过（0 失败、0 跳过），`git diff --check` 无输出。
- 提交钩子：工作树没有 `node_modules`，提交时设 `LEFTHOOK=0` 跳过钩子。本任务只改 Markdown，Biome 与 lingui 的 glob 本来就不匹配。每条提交信息先用主检出的 `node_modules/.bin/commitlint` 校验，两边的 `commitlint.config.js` 经 `cmp` 比较相同。
- `gh pr list` 在命令沙盒里证书校验失败，改在沙盒外只读运行。2026-11-01T16:39Z 查询时，开放 PR 只有 #130。
- 只改文档：没有运行应用测试、类型检查、构建或浏览器。官方页面只读，没有调用 Across 接口，也没有申请 Key。
- 没有推送，没有开 PR；四条原分支与它们的工作树都没有删除。

## 后续与替代关系

- 运营方同意后，推送 `claude/local-records-sync` 并向 `dev` 开纯文档 PR（不触发 CI）。合入后四条原分支的提交都在 `dev` 上；本地分支与对应工作树（`.claude/worktrees/work-memory-2026-10-12`、`-10-19`、`-10-26`，`/private/tmp/claude-501/wt-across-shelved`）是否删除，由运营方决定。
- `42f2bd23` 是否同步需单独审阅，见上文。
- 10-26 周整理指出的两份 10-24 记录（日本、官网）的过期摘要与空 `commits` 仍待补。ADR 0041 的状态行，以及 ADR 目录里 0041–0048 写「未合入 `dev`」「未发布」的几行，需按 `dev`、`main` 与发布记录逐条核对（例如 0042–0044 的提交已在 `main`）。
- Across 重新启动时，先用自助表单新发的 Key 探测一次（见 Across 记录的补注），再决定是否经共享渠道申请权限。
- 本记录不替代任何记录，只补充四条分支的合入经过。
- 2026-11-02 补记：运营方说「推送并开 PR」后，本分支以头 `3cecb6aa` 推送，并开 [PR #135](https://github.com/zora4523-bot/gatu-app/pull/135) → `dev`。推送前 `origin/dev` 仍是 `26c06d02`；开 PR 时发现 PR #130 已于 01:20（UTC+8）先合入 `dev`（`e9d20e48`），本分支随后合并 `dev`（`74f4f6e5`），只在 `INDEX.md` 冲突，用 `pnpm memory:index` 重建，`docs/adr/README.md` 自动合并。合并后相对 `dev` 仍只有 23 个 `docs/` 文件；232 份记录共 776 个引用，768 个是 HEAD 的祖先，其余仍是上述 8 个；`memory:check`、`memory:test`（8/8）、`git diff --check` 通过。这次合并与本补记在运营方另行同意后推送。
- 2026-11-02 补记：运营方说「推送」后，`74f4f6e5`、`8cdc427e` 推送到 PR #135，PR 变为可合并。运营方说「合并」后，合并前再读了一遍机器人评论（只有对 `3cecb6aa` 的无发现摘要），PR #135 于 01:26（UTC+8）以合并提交 `1262bf5d` 合入 `dev`，树与 `8cdc427e` 相同，远端分支保留。
- 2026-11-02 更正：「PR #132 补记的核对」一条里，`26c06d02` 不在 `origin/main`、线上为 p35 这两项读数，取于 PR #133 在 01:15 把 `dev` 晋升为 `main`（`047b4bb3`）之前；01:29 读线上已是 `cloudfront-2026-11-02-p36` / `047b4bb3`。[第二组审查记录](2026-11-01-audit-group2.md)的摘要与补记已追加同样的更正，随后续文档 PR 进入 `dev`。
