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
  "summary": "基于最新 main 迁移会话恢复、邮箱 UI 与发送/提款三份历史记录，复核已合并修复；保留旧 Across 历史及根目录未提交改动。",
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
