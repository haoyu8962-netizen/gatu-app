<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-11-codex-deposit-branch-review",
  "date": "2026-10-11",
  "title": "对抗审查 codex/deposit-auto-investigation 的 10 个提交并补自动存款余额锁定",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding"],
  "summary": "自动入金审查补齐余额锁定、签名前法律核验和未知结果通知，已随 PR #97 合入、p30 发布。来源定向测试与变异结果保留，未做真实主网自动存款验收。",
  "thread": null,
  "baseCommit": "eeace5db",
  "commits": ["b0a37333", "525f38c0"],
  "sources": [
    {"path": "docs/adr/0040-automatic-email-wallet-deposits.md"},
    {"path": "docs/cctp-deposits.md"},
    {"path": "docs/runtime-guardrails.md"},
    {"path": "docs/trading-onboarding.md"},
    {"path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts"},
    {"path": "apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx"},
    {"path": "apps/terminal/src/lib/error-reporting/report.ts"},
    {"path": "apps/terminal/src/lib/tests/use-deposit-routing-guard.test.tsx"},
    {"path": "docs/work-memory/sessions/2026-10-10-automatic-email-deposits.md"},
    {"path": "docs/work-memory/sessions/2026-10-10-deposit-unknown-submission-diagnostics.md"},
    {"url": "https://app.hyperliquid.xyz/trade"}
  ],
  "supersedes": []
}
-->
# 对抗审查 codex/deposit-auto-investigation 的 10 个提交并补自动存款余额锁定

## 背景与范围

用户要求核对官方实践并对抗审查 `codex/deposit-auto-investigation` 相对 `origin/dev`（`a310ade1`）的 10 个提交（`51ee48a8`…`eeace5db`），评分并修正问题。审查在主检出只读进行，修改放在从该分支新建的工作树分支 `claude/deposit-auto-review`（起点 `eeace5db`，`pnpm install --frozen-lockfile --prefer-offline`）。未取得可核对的 Codex 任务标识；Codex 工作树 `~/.codex/worktrees/deposit-auto-investigation` 当时干净，只在其中复跑测试，没有改动它。

## 结论与依据

### 与官方终端的对照

- 2026-10-11 下载 `https://app.hyperliquid.xyz/trade` 的入口 HTML、主包 `index-BQnwZrhY.js` 与 107 个懒加载块（约 5.9 MB），用正则提取 react-intl 的 `id`/`defaultMessage`。
- `across.withdraw.withdrawingToPrivyAddress`：「Withdrawing to yourself is not supported because it would automatically trigger a deposit.」证明官方把 Arbitrum USDC 到达 Privy 嵌入钱包地址视为会自动触发存款，不需要用户再次点击。ADR 0040 恢复自动存款与官方一致；旧的主网二次 `Deposit … USDC` 点击是本项目自身的要求。
- 官方当前邮箱存款入口显示 Across 生成的独立存款地址（`across.transfer.depositAddressHelpPrivy`），与钱包地址不同；本项目直接使用嵌入钱包地址加 CCTP 赞助提交，这是既有架构差异，本次不改。
- 未登录官方邮箱账户，没有观察官方真实的自动存款时序；以上是打包文案证据。

### 逐项审查结果

| 提交 | 内容 | 结论 |
| --- | --- | --- |
| `51ee48a8` 排查记录 | 定位 `0c72fa85` 引入主网手动限制 | 事实可核实（`git log -S` 一致）；记录区分了署名与真人 |
| `068f7cb2` 恢复自动存款 | 自动宿主按各网开关启用、执行层放开 `automatic`、表单删按钮 | 守卫保留：精确 owner、路由、地区、法律、费用漂移、链/paymaster、资金锁、授权意向、恢复记录；失败后在页面会话内不自动重签。缺口：自动 scope 不在资金锁内重读余额（见下） |
| `5919efe8` Important 提醒说明 | 文档 | 无问题 |
| `82ac5c7b` 诊断记录 | 文档 | 无问题 |
| `86e40177` 无哈希提示与脱敏诊断 | 新通知文案、独立拦截文案、`deposit_submission` 上报 | 上报只序列化白名单阶段/类别，正因链最多 8 层且防环；服务端拒绝非该 kind 的字段；六语翻译齐全；上报失败不改变结局 |
| `54f9d6d9`、`73a4f24f`、`bcd504b8`、`875a628c`、`eeace5db` | ZeroDev 策略、路由、真实收据、预算记录 | 纯文档，证据与限制分离，无秘密入库 |

- 正确性检查：`hasSubmittedDeposit` 分支、`submissionOutcomeUnknown` 条件与新文案一致；`design-token-ratchet` 基线下调对应实际删除的 `text-[13px]` 与 `rounded-[12px]`；`cctp-deposit-catalogs` 登记新文案；真实 Hook 联动测试在 `use-deposit-routing-guard.test.tsx`，只模拟钱包、RPC、Circle 与 Privy 客户端，`EmbeddedDepositAutoBridge` 与 `useDeposit` 均为真实实现。
- 复跑分支声称的验证（Codex 工作树，Node 24.15.0，沙箱外运行因其 `node_modules/.vite-temp` 不可写）：14 个测试文件 836 项通过（含四个存款文件、错误上报两件、目录与棘轮、i18n/占位/移动呈现/资金弹窗滚动/进度标签/状态动效契约）；`pnpm --filter @sairn/terminal typecheck`、`pnpm exec biome check`（14 个改动 TS/TSX）、`pnpm memory:check` 通过。
- 评分（10 分制）：实现 8.5（守卫完整、测试真实、文案清晰；扣分见缺口）；文档 8（ADR、CCTP、guardrails、CHANGELOG 同步，但「登录从不签名」规则与自动签名的关系未写明）；记录 9（证据与限制分离、未夸大验收）。总体 8.5。

### 发现并修正的问题

1. **自动 scope 不在资金锁内重读余额（P2）。** 宿主在浏览器锁内刷新余额后调用 `deposit(余额)`，执行边界里 `assertReviewedBalanceUnchanged` 只对带 `review` 的手动调用生效。宿主刷新与签名之间到账的转账会让一次授权只覆盖旧的较小金额，剩余部分需要第二笔赞助交易；余额减少时则会在签名后才由合约拒绝并留下一小时的授权意向。修正：自动 smart scope 把提交金额当作锁定值，签名前、广播前各重读一次余额，不等即抛 `Available amount is not verified`；宿主随余额轮询更新键后重试。新增两项回归（签名前中止、签名后不广播）。
2. **文档一致性（P3）。** `AGENTS.md` 仍写「The one accepted exception is the SIWE message」，而 ADR 0040 新增了登录/恢复后无点击的 EIP-3009 签名；`docs/trading-onboarding.md` 两处「Page load and session restoration never sign」未限定为交易签名。已在 AGENTS 资金条目、onboarding 文档、ADR 0040、`docs/cctp-deposits.md`、`docs/runtime-guardrails.md` 与 CHANGELOG 写明余额锁定与例外关系。

### PR #97 Codex 机器人审查（2026-10-11，提交 `b0a37333`）的两条 P1 与修正

3. **自动宿主把无哈希提交显示为失败（P1）。** `useDeposit` 在授权意向已保存但 `sendTransaction` 未返回哈希时设置 `submissionOutcomeUnknown`，宿主没有读取，一律显示 `Automatic USDC deposit failed`。修正：宿主读取 `hash` 与 `submissionOutcomeUnknown`，按弹窗同样的规则（无哈希，或有哈希但不是确定的源链失败）显示常驻 `Deposit status unknown` 警告，描述复用弹窗的无哈希/已提交两条文案，不新增翻译。新增两项宿主回归。
4. **自动授权签名前未核验法律状态（P1）。** 共享执行路径在 `signTypedData` 之后才调用 `verifyFreshLegalAction`；手动路径有弹窗门控，自动路径没有，登录/恢复会先签授权再停止广播。修正：`executionScope === "automatic"` 时在签名前先核验精确 owner 的最新法律状态，广播前核验保留。新增一项回归（法律核验拒绝时不签名、不广播）。

两项均附变异检查：换回未修复的 `use-deposit.ts` 与宿主后对应新测试失败，恢复后通过。

### 未改动的观察

- 页面刷新会丢失「失败后不重签」的内存闩锁；若后端代付持续故障，每小时授权到期后刷新页面会再签一次。授权意向本身仍阻止一小时内重复签名，与 ADR 0040「不盲目重新授权」一致，未进一步限制。
- `classifyDepositFailure` 的正则只在 `sponsoredSubmissionStarted` 之后调用，不会把配置类 `LocalizedActionError` 误归为 `network`。
- CHANGELOG 把自动存款放在 Unreleased 的 Fixed 下；因用户把手动要求视为缺陷，保留。

## 验证与限制

版本：`eeace5db` 加本工作树改动，Node 24.15.0（仓库要求 >=22.15.0；本次未量包体，不涉及 22.15 口径）、pnpm 10.21.0。

- `pnpm --dir apps/terminal exec vitest run src/lib/tests/use-deposit-routing-guard.test.tsx src/lib/tests/embedded-deposit-auto-bridge.test.tsx src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx src/lib/tests/deposit-form-routing.test.tsx src/lib/tests/funds-action-balances.test.tsx`：5 文件 399 项通过（含两项新回归）。
- 变异检查：把 `use-deposit.ts` 临时换回 `eeace5db` 版本，`-t "automatic mainnet"` 下两项新回归失败、原有「allows an automatic mainnet sponsored deposit」通过；恢复修复后复测通过。
- `pnpm --filter @sairn/terminal typecheck` 通过；`pnpm exec biome check` 对两个改动的 TS/TSX 文件在 `biome format --write` 之后通过。
- `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（todo 0、skipped 0）与 `git diff --check` 通过。
- 第二轮（Codex 机器人 P1 修正后）：`vitest run` 路由守卫、自动宿主、`cctp-deposit-catalogs`、`i18n-reactivity-contract`、`status-motion-surface-contract` 5 文件 506 项通过；typecheck 与 Biome（4 个改动文件）通过。
- PR #97 首轮 CI：Validate / Test terminal / Browser regressions ×2 / Build (pairing false) 通过，配对开启构建按规则跳过。
- 未运行全量 Vitest、Playwright 与生产构建；未推送、未发布；没有真实钱包、真实签名或资金操作。官方对照只基于打包文案。

## 后续与替代关系

本记录补充 [恢复邮箱主网自动存款](2026-10-10-automatic-email-deposits.md) 与 [无哈希提交诊断](2026-10-10-deposit-unknown-submission-diagnostics.md)，不替代它们。`claude/deposit-auto-review` 叠在 Codex 分支之上，合并到 `dev` 时应一并进入；真实主网自动存款与最终 HyperCore 入账的验收仍待发布版本。

## 周整理补注（2026-10-12）

原“叠在 Codex 分支之上待合入、未发布”已由 PR #97/#96 和 p30 接续；包含 525f38c0 的两项 P1 修正。保留没有全量本地复跑或真实资金操作的边界，不把静态官方文案当真实流程调试。

后续来源：[2026-10-11-cloudfront-release-p30](2026-10-11-cloudfront-release-p30.md)。

本补注为事后核对，原正文、失败与验证版本保留。本轮只核对 Git、任务记录和相关当前规范；来源执行结果不视为本次重跑。查询时间与实际 head 见[本周整理](2026-10-12-weekly-memory-review.md)。
