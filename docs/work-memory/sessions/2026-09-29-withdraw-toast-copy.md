<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-withdraw-toast-copy",
  "date": "2026-09-29",
  "title": "提现成功通知精简：一句到账说明，手续费不再单列",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "用户截图反馈提现成功通知冗长。原通知在标题下有「实际到账」「提款手续费」两行加一句长说明；中文把尚未到账的金额叫「实际到账」、与「确认后到账」矛盾，并混用提现/提款。改为标题不变、描述一句「Arbitrum 确认后，您将收到 $X。」（金额隔离在 bdi 内、用 Trans 随语言切换），一次性激活费只在实际收取时单独一行；补齐五种语言译文。测试从只断言「有描述」改为断言完整文案、激活费行与阿拉伯语下的金额隔离，旧代码下相关用例失败。核实中发现既有缺口：表单显示后到点击时重新读取之间 CCTP 手续费变化不会中止（单测模拟确认），已另开任务，未在本次修复。在独立 worktree 完成，合并回 claude/from-dev-0928。",
  "thread": null,
  "baseCommit": "7d5fd486",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx" },
    { "path": "docs/withdrawals.md" },
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "CHANGELOG.md" }
  ],
  "supersedes": []
}
-->
# 提现成功通知精简：一句到账说明，手续费不再单列

## 背景与范围

同步记录，没有取得可核对的会话 ID。用户发来提现成功通知的截图，认为文案冗长，要求开 worktree 审查应该怎么优化，完成后合并到 `claude/from-dev-0928`。工作在 `.claude/worktrees/withdraw-toast-copy`（分支 `claude/withdraw-toast-copy`，基线 `7d5fd486`），依赖用 `pnpm install --frozen-lockfile --prefer-offline` 在 worktree 内补装。范围只含成功通知的文案与结构、对应测试与文档；提现的执行、校验和其他资金通知不变。

## 结论与依据

原通知（中文）：标题「提现已提交」，下面「实际到账: $239.80」「提款手续费: $0.20」和「提款在 Arbitrum 上确认后到账，请在目标账户查看收款。」，有激活费时再多一行。问题：

- **语义矛盾。** 「Net received / 实际到账」表示已到账，而通知本身说要等 Arbitrum 确认；`docs/withdrawals.md` 也明确 SDK 只返回受理，不证明到账。
- **重复。** 手续费确认前在表单里已显示，到账金额已经扣除了它；最后一句「到账」「查看收款」重复。
- **用词不一致。** 同一条通知里标题用「提现」，其余用「提款」。
- **官方做法。** `docs/funds-dialog-outcome-plan.md` 的官方前端取证：同一场景只通知 `Withdrawal initiated`。

采用：标题 `Withdrawal submitted` 不变（`docs/withdrawals.md` 要求说已提交而不是已完成）；描述一句 `You'll receive <bdi>$X</bdi> on Arbitrum after confirmation.`，金额为提现额减去提交所用的路径手续费（`getWithdrawalNetReceived`），用 `<Trans>` 渲染以便显示期间切换语言也能跟随（通知容器在根部 `I18nProvider` 内）；一次性账户激活费仍在实际收取时作为第二行。译文：zh「Arbitrum 确认后，您将收到 $X。」，fr「Vous recevrez $X sur Arbitrum après confirmation.」，es「Recibirás $X en Arbitrum tras la confirmación.」（与目录里的 tú 语气一致），hi、ar 同义；缺译数与改动前相同（ar/es/fr/hi 各 44、zh 3）。旧说明句成为废弃词条（`#~`），与目录现有做法一致；`Net received`、`Withdrawal fee` 仍被提现表单使用。

未采用：只保留标题（官方做法）——到账金额是用户最关心的结果，且手续费可能与表单不同（见下），保留一句金额更稳妥；保留手续费行——与表单重复。

核实中发现的既有缺口（未在本次修改）：表单用 `cctpFeeQuery.data` 显示手续费和预计到账，点击后预检重新读取手续费并直接使用，没有与表单显示的值比较；只有预检到签名边界之间的变化会被 `assertFreshCctpWithdrawalFee` 拒绝。临时单测（提现 10、表单手续费 1、重新读取为 2）显示请求照常发出，通知为「You'll receive $8.00」，而表单显示应为 9。这与确认面契约「执行不能超出用户点击时所见」不符，已另开任务修复；在它修好前，通知里的金额按实际使用的手续费计算，仍是准确的。

## 验证与限制

版本：基线 `7d5fd486` 加上本任务改动；2026-09-29，本地 macOS，worktree 内新装依赖。

- `deposit-modal-withdrawal-routing-guard.test.tsx` 99 项通过：成功用例断言完整文案 `Withdrawal submitted You'll receive $1.00 on Arbitrum after confirmation.`；激活费用例在请求成功时断言 CCTP 路径多出 `One-time account activation fee: $1.00`、旧桥路径没有；新增阿拉伯语用例断言译文与 `bdi dir="ltr"` 内的 `$1.00`。把 `deposit-modal.tsx` 换回 `HEAD` 后，成功与激活费相关的 5 个用例失败。
- 同一 worktree 内：提现与资金弹窗、确认面契约（动作进度标签、弹层退出控件）、多语言与错误文案契约、数字格式契约、手机数据呈现契约、`withdraw-form-ui`、`withdrawal` 共 16 个文件 515 项通过；充值相关的 `deposit-*` 与资金恢复宿主、执行守卫共 10 个文件 123 项通过。
- Biome 检查改动的 2 个文件通过：测试里的 Lingui 消息原文含字面 `${netReceived}`，最初触发 `noTemplateCurlyInString` 警告，改为转义的模板字符串后无警告。`pnpm --filter @gatu/terminal typecheck`（worktree 新装依赖，`tsc` 为锁定的 5.7.2）退出码 0。`pnpm i18n:extract` 后缺译数与改动前相同。
- 本提交以快进方式合并回 `claude/from-dev-0928`，合并后的代码与这里验证的版本相同。
- 未做：真实钱包提现、通知的实际显示截图（无法在开发服务器触发成功提现）、真机。

## 后续与替代关系

- 待办：CCTP 手续费在表单与点击之间变化时失败关闭（另开任务）。修好后，`docs/withdrawals.md` 里「目前按原样使用」的说明要随之更正。
- 部分更新 `docs/funds-dialog-outcome-plan.md` 第二步实施记录中对通知内容的描述（以追加小节的方式），不整体替代。
