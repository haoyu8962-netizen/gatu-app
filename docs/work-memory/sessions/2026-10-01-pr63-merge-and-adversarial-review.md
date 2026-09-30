<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-pr63-merge-and-adversarial-review",
  "date": "2026-10-01",
  "title": "PR 63 并入公告与 Privy 分支、五路对抗审查与修复",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "docs-governance"],
  "summary": "按用户要求把 claude/agent-verify-official-announcements-eb8c45 与 claude/privy-theme-css-vars 以 --no-ff 并入 claude/from-dev-0928（PR 63），冲突只在生成的 INDEX.md 与 CHANGELOG.md（取两边条目）。随后五路只读对抗审查全 PR（32 个提交、156 个文件）：无 P0/P1，3 项 P2 全部核实成立并修复——金库提款成功通知在账本缺净额时把请求金额写成已收到；hyperliquid-signing.md 仍称 Bridge2 旧记录可用于恢复；Privy 非空嵌入式钱包路径没有测试保护（改为钉住 SDK 两个产物里的字段比较并在 ADR 0026 与 runtime-guardrails 写明限制）。同时修复文档类 P3；推送后按用户要求处理代码类 P3（弹窗提示圆角契约改为按弹窗元素识别并合并 cn() 参数、金库徽标保留组合符号、抽屉路由目标恢复类型检查、提现状态未知说明指向存款和提款页签），其中金库卡片截断经浏览器测试证实不成立，提现通知措辞改为写明有意不加估算词。未做真机与真实钱包验收。2026-10-01 CI 六项全部通过后，PR 63 以 merge commit 合入 dev（b4b0ae1b），未晋升 main、未发布。",
  "thread": null,
  "baseCommit": "a613e212",
  "commits": ["60715765", "fc6ef195", "e4e5a5ee", "cd32df0d", "c65cf6ee", "4881a36b", "f3db8117", "b637e30e", "f3ad86f6", "4cac8683", "b4b0ae1b"],
  "sources": [
    { "path": "apps/terminal/src/components/vaults/vaults-page.tsx" },
    { "path": "apps/terminal/src/lib/tests/vault-detail-page-outcomes.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/privy-theme-switch-wallet-stability.test.tsx" },
    { "path": "docs/adr/0026-privy-follows-theme-after-upgrade.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/hyperliquid-signing.md" },
    { "path": "docs/withdrawals.md" }
  ],
  "supersedes": []
}
-->
# PR 63 并入公告与 Privy 分支、五路对抗审查与修复

## 背景与范围

同步记录，未取得可核对的任务标识。用户先询问各工作区与 Codex 工作区的提交，再要求把 `claude/agent-verify-official-announcements-eb8c45`（2 个文档提交）与 `claude/privy-theme-css-vars`（4 个提交）合入 `claude/from-dev-0928`，然后对 PR 63 做对抗审查，最后要求修复 P2 与文档类 P3。

`claude/from-dev-0928` 签出在主检出，另有会话使用该目录；合并与修复都在本会话的工作区完成，验证后用 `git merge --ff-only` 快进主检出。

## 结论与依据

合并：两次 `--no-ff` 合并（`60715765`、`fc6ef195`）。`INDEX.md` 冲突取分支版本后用 `pnpm memory:index` 重新生成；`CHANGELOG.md` 两边 Fixed 条目全部保留。Privy 分支升级了依赖，工作区用 Node 22.15 单独 `pnpm install --frozen-lockfile`。

审查：五路只读子代理分别审查 Privy 升级、移动抽屉先关闭再导航、通知与提现手续费、仪表盘界面、文档合规。三项 P2 经本会话复核代码后确认：

1. `vaults-page.tsx` 用 `receipt?.finalAmount ?? activeAction.amount` 渲染「You received」，而 `funds-action-reconciliation.ts` 在账本缺 `netWithdrawnUsd` 时 `finalAmount` 为空，请求金额会被写成实际到账。改为提款只有账本净额存在时才写到账金额（`e4e5a5ee`）；存入仍用请求金额兜底。
2. `hyperliquid-signing.md` 的「legacy records remain available only for recovery」与本 PR 其他文档「从未保存恢复数据」矛盾，改为同一表述。
3. Privy 非空嵌入式钱包（普通邮箱交易）不重连靠 SDK 3.32.2 自带的字段比较，现有测试不覆盖。要在测试里登录真实嵌入式 owner 需伪造 SDK 内部认证状态，比被测代码更脆弱，未采用；改为在回归文件里检查 ESM 与 CJS 产物中该比较各出现一次，并在 ADR 0026（新增验证标准第 5 条与证据小节）与 runtime-guardrails §1 写明这条路径没有行为测试、`connectedAt` 退回 `Date.now()` 时仍会重连（`cd32df0d`）。

文档类 P3：CHANGELOG 两条之间补空行；ADR 索引登记 0025 预留；`withdrawals.md` 的中止条件写明是激活费变化；`funds-dialog-outcome-plan.md` 表格行加指向撤销说明的注记；AGENTS.md 回归清单补 `mobile-nav-drawer-navigation.test.tsx`；三份记录补 `commits`，移动导航记录摘要注明未经人工真机确认，提现手续费记录追加分支去向。

## 验证与限制

- 修复前完整终端单测（Node 22.15，合并后 `fc6ef195`）：639 个文件中 637 通过、1 跳过、1 失败；失败的 `chart-build-assets.test.ts` 单独重跑 17 项通过，两条合并分支都未改图表资源，判断为并行负载下的偶发失败，未进一步证实。
- 金库通知：`vault-detail-page-outcomes.test.tsx` 11 项通过；新用例在还原组件修改时失败，恢复后通过。
- Privy：`privy-theme-switch-wallet-stability.test.tsx` 4 项通过；新检查的正则在已安装 3.32.2 的 ESM `index-D-3aiQ0j.mjs` 与 CJS `index-Bd6QG4NV.js` 中各匹配 1 次。没有反向修改依赖产物做变异检查（产物来自共享的 pnpm 存储）。
- 修复后（Node 22.15）：终端类型检查（TypeScript 5.7.2）通过；金库通知、Privy 两项、移动抽屉导航与金库操作弹窗 5 个文件 42 项通过；`memory:check` 通过，`memory:test` 8 项通过，`git diff --check` 无报告；提交钩子的 Biome 与 lingui 提取通过且未改动目录。修复后没有重跑完整单测。审查子代理自行运行的定向测试结果为其报告，未在本记录中逐项复现。
- 未做：浏览器与 Playwright 套件、生产构建、真机、真实邮箱或外部钱包的主题切换与金库提款。

## 后续与替代关系

- 代码类 P3 未处理，待用户决定：弹窗提示圆角契约按文件名识别弹窗（漏 `funds-action-recovery-host.tsx` 4 处 `rounded-10`）；`getVaultMark` 丢弃组合符号；移动抽屉路由路径类型放宽为 `string` 与多余的 `useCallback`；金库手机卡片数值仍 `truncate`；提现成功通知用确定语气写估算到账；提现「状态未知」说明指向不存在的「withdrawal history」。
- 推送 PR 63 时在描述里说明：锁文件顺带把网站的 TypeScript peer 从 5.7.2 改为 5.9.3（Privy 分支已接受）。
- 主检出快进后需重新 `pnpm install --frozen-lockfile`，否则仍是旧 Privy 依赖。

## 追加：代码类 P3（推送 21dc95b0 之后）

用户在推送后要求修复代码类 P3。逐项结论：

- 提现「状态未知」说明（`c65cf6ee`）：改用划转、发送已在用的「Deposits & Withdrawals history」句子，六种语言都有现成译文；旧句子按目录惯例保留为 `#~` 过时条目。
- 金库徽标（`4881a36b`）：`getVaultMark` 改为按「字母或数字加其后的组合符号」取前两个，`हिंदी वॉल्ट` 得 `हिंदी`。没有用 `Intl.Segmenter`，因为 `locale-format-contract` 禁止在 `lib/format.ts` 之外调用 `Intl.*(`。新用例在旧代码上失败。浏览器测试的徽标正则同步放宽。
- 金库手机卡片数值截断：`vaults-list.pw.ts` 已在 320 与 375 宽、中英文下断言 `$12,345,678.90` 不被截断，本机运行 8 项全部通过，审查的疑点不成立，未改代码。
- 移动抽屉（`f3db8117`）：`navigationLinkProps` 改为 TanStack 的 `ValidateLinkOptions` 泛型，运行时拼出的 `tradeHomePath` 仍可传入，拼错的字面量路径重新被类型检查拦下（临时改为 `/portfoliox` 时类型检查报错，已还原）。排队的导航改存为调用 `router.navigate(target)` 的函数，避免类型断言；去掉 `useCallback`。
- 弹窗提示圆角契约（`b637e30e`）：除文件名外，渲染 `AdaptiveModal`/`Modal`/`ModalPopup`/`Drawer`/`DrawerContent` 的组件也纳入扫描；同一 `cn()` 调用的全部字符串参数合并为一个类名列表；单引号与模板字符串也读取。新发现：`funds-action-recovery-host.tsx` 4 处 `rounded-10`（金库、质押共用的恢复弹窗，改为 `rounded-16`），限价平仓与市价平仓各 1 处拆在 `cn()` 两个参数里的 `rounded-8` 错误提示（交易弹窗，与原 12 处同类，加入待决例外并列次数）。变异检查：恢复弹窗改回 `rounded-10` 时新契约失败、旧契约通过。仍检测不到没有任何圆角类的提示框，已写进样式指南。
- 提现成功通知措辞（`f3ad86f6`）：不改文案。金额就是提交所用手续费算出的净额，只有签名期间手续费至少翻倍才会偏高；为这种情况在六种语言里给每条通知加「约」不划算，改为在 `withdrawals.md` 的已接受风险段写明有意不加估算词。
- 未处理：审查未证实的「单目标部分成交摘要只看 `totalCount === 1`」没有找到成交后还会抛错的实际路径，未改。

验证（Node 22.15，`f3ad86f6` 之前的工作区）：终端类型检查通过；Biome 通过；14 个相关文件 430 项通过（提现路由守卫、资金余额、金库领域与视图、移动抽屉两份、两份圆角契约、弹窗表面、设计令牌棘轮、i18n 响应式、locale 格式契约、金库操作弹窗、质押视图），`funds-action-recovery-host.test.tsx` 13 项通过；`vaults-list.pw.ts` 8 项通过（共享浏览器配置，端口 4179）。完整终端单测（`f3ad86f6`）：639 个文件中 638 通过、1 跳过，7,917 项通过、1 项跳过，无失败；本轮 `chart-build-assets.test.ts` 也通过。未做真机与真实钱包验收。

## 追加：合入 dev

2026-10-01 推送 `4cac8683` 后，PR 63 的六项检查（TypeScript/lint/目录校验、网站构建、终端生产构建（配对关）、两组终端浏览器回归、终端与发布工具测试）全部通过；`dev` 没有新提交，用 `gh pr merge --merge --match-head-commit` 以 merge commit 合入 `dev`，合并提交 `b4b0ae1b`。未晋升 `main`，未发布；真实钱包与真机验收仍未执行。
