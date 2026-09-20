<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-20-wallet-review-04",
  "date": "2026-09-20",
  "title": "worktree-04 承接三项钱包审查并归档旧分支",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "account-funding",
    "work-memory"
  ],
  "summary": "迁移会话恢复、邮箱 UI 与发送/提款三份历史记录并复核已合并修复；分支先基于 main、复核后改为基于 dev，旧 Across 历史与根目录 17 个未提交修订均已用归档标签推送保存。",
  "thread": null,
  "baseCommit": "d6cc4f3e9ffed0a7ba0092493fa161846be8c52f",
  "commits": [
    "f89117943cde34b1d05d0de32a2bd5013889a248",
    "5912ee638069ea816c33922f6005af1bac0640bf",
    "28692032e9f546f1dca46906cbb97334521fcac9",
    "df4ed89f"
  ],
  "sources": [
    {
      "path": "docs/runtime-guardrails.md"
    },
    {
      "path": "docs/withdrawals.md"
    },
    {
      "path": "docs/wallet-initialization-debugging.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-16-wallet-session-recovery.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-16-email-wallet-ui-review.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-16-send-versus-withdrawal.md"
    }
  ],
  "supersedes": []
}
-->
# worktree-04 钱包审查迁移

## 背景与范围

用户要求从最新代码检出新分支并创建 04 worktree，处理三项钱包审查记录后移除当前分支。2026-09-20 已 fetch origin/main，基线为 d6cc4f3e；新工作树为 `.claude/worktrees/worktree-04`，分支 `codex/wallet-review-04`。旧根目录为 `codex/across-deposit-addresses` / 28692032，有 18 个未提交工作记忆文件，全部保留；任务标识未取得。

## 结论与依据

- 三个指定提交仅新增工作记忆记录和索引，没有业务代码。按来源提交提取记录、保留历史正文、追加迁移说明并重新生成索引，避免搬入旧版完整索引或其余 Across 实现。
- `df4ed89f` 已包含在最新 main：紧凑桌面邮箱标签优先；账户菜单和设置使用独立 `useEmailWalletExport`，显式指定匹配的 embedded owner；发送弹窗标明 Hyperliquid (HyperCore)，并提示 Arbitrum USDC 使用 Withdraw。保留较新的移动端邮箱本地名设计，不重复 cherry-pick 旧 UI。
- 当前统一账户发送使用 `sendAsset` spot→spot；提现仍按新鲜路由调用 `sendToEvmWithData` 或 `withdraw3`。旧流水说明为历史链上证据，本次未查询用户账户或执行资金动作。
- 钱包会话仍把认证就绪和钱包目录/精确所有者可用分开，保留 30 秒后的显式恢复入口。旧会话故障没有可重复的新故障证据，不据此改为自动刷新、放宽 ready 或删除认证状态。
- 旧分支的其他 Across 提交不并入新分支。已以本地归档标签 `archive/across-deposit-addresses-20260920` 保存旧 HEAD 28692032；根工作树在同一提交上转为 detached HEAD，以便完整保留未提交修改，再删除本地旧分支引用。远端分支不操作。

## 验证与限制

- `pnpm install --frozen-lockfile --prefer-offline` 通过，使用本工作树锁定依赖；未复制凭证或环境文件。
- 新工作树 `pnpm --dir apps/terminal exec vitest run --maxWorkers=2` 的 9 文件全部通过，共 228 项：`user-menu` 21、`global-settings-modal` 25、`email-wallet-export` 15、`wallet-session` 33、`wallet-initialization-recovery` 10、`withdrawal` 10、`withdraw-form-ui` 13、`deposit-modal-withdrawal-routing-guard` 88、`account-ledger` 13。
- `memory:index`、`memory:check`、`memory:test`（8/8）和 `git diff --check` 通过；提交前按最终文档内容再次校验。
- 此任务没有业务改动，不重复整套构建，不沿用 2026-09-16 的全量失败结论代表当前 main；不声称实时登录、密钥导出、CCTP 到账或 Across 权限已验收。
- 本迁移提交成功后删除本地旧分支引用；根目录同提交 detach 前后比较完整二进制 diff 与 porcelain 状态，确保原有 18 个修改不变。归档标签与根目录未提交修改不推送。

## 后续与替代关系

历史记录不整体失效，未设置 supersedes。以本次记录和已合并修复记录说明旧 UI 缺口的处理状态。后续开发使用 worktree-04；根目录旧改动继续保留给原任务处理。

## 复核与后续处理（2026-09-20，另一会话）

对本记录的逐项复核与随后的处理，由用户要求另一会话完成；上文保留原样，不一致处在此更正。

- 复核属实：分支与工作树状态、三份记录只追加迁移补记、`df4ed89f` 在 main 与 dev 上、归档标签指向 `28692032` 且 19 个提交可达、根目录未提交改动前后一致。在本工作树复跑上述 9 个测试文件得到 228 项通过，`memory:check`、`memory:test`（8/8）通过。
- 更正：根目录未提交改动是 17 个文件（+51/−39），上文“18 个”为笔误。
- 死链：`2026-09-16-email-wallet-ui-review.md` 的来源链接指向提交 `5912ee63`，该提交当时只存在于本机，GitHub 返回 422；`memory:check` 只校验链接协议，没有拦住。复核归档历史（新增内容的模式扫描、三份标题含 secret 或 credential 的记录的人工阅读、19 个提交里新增文件的清单）未发现凭证、env、数据库或个人账户数据后，已推送 `archive/across-deposit-addresses-20260920`，链接现可解析到提交与文件。
- 基线：项目约定功能分支合入 dev，而 main 既落后 dev 36 个提交，也不是 dev 的祖先。分支尚未推送，已用 `git rebase --onto origin/dev origin/main` 把迁移提交改为基于 dev `0a564480`，原提交 `403620fc` 变为 `cee009fe`；唯一冲突是生成文件 `INDEX.md`，已重新生成。三份记录的迁移补记里“基于 `d6cc4f3e`”描述的是迁移当时的基线。在 dev 基线上复跑同样 9 个测试文件仍为 228 项通过；没有运行全量单测、构建或浏览器测试。
- 根目录的 17 个未提交文件是 2026-09-14 周整理对旧记录的修订，与 Across 实现无关。其中 11 份记录在 dev 上存在，已用三方套用并入本分支（`d74b73cb`）：9 份与根目录内容逐字节相同，`2026-09-12-caddy-config-mismatch.md` 与 `2026-09-12-neutral-surface-audit.md` 同时保留了 dev 上的后续修改；`INDEX.md` 重新生成。另外 5 份只存在于归档分支的 Across 记录，其修订各是一行 `commits` 元数据，无法并入 dev。
- 为完整保存这 17 个文件，用 git 底层命令在 `28692032` 之上生成提交 `1c92bbf6`（未建工作树、未改动根目录任何文件），与根目录工作区逐字节核对一致后打标签 `archive/across-deposit-addresses-20260920-weekly-revisions` 并推送。第一次生成时文件清单取空、得到一个空提交 `e8bfb252`，被核对步骤发现；它未被引用也未推送。
- 根目录仍停在 `28692032` 的 detached HEAD 且保留这 17 个未提交修改，本次没有清理；其内容已由上述标签保存，是否还原由用户决定。
