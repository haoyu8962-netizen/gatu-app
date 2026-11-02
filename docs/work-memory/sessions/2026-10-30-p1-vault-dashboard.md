<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-30-p1-vault-dashboard",
  "date": "2026-10-30",
  "title": "第一批 P1 金库与仪表盘：统一账户金库可存额、领导者存入、最低存入与 Max、14 日成交量、推荐接口与推荐码",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "pr-review"],
  "summary": "按账户模式和有效快照确定金库可用额，修正最低存款、Max、组合成交量与推荐码校验。改动随 p36 发布。金库全额提取语义和真实存取仍待验。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": ["e9edd855", "91323d9c", "c56dcf4a"],
  "sources": [
    {"path": "apps/terminal/src/components/vaults/vault-action-domain.ts"},
    {"path": "apps/terminal/src/components/vaults/domain/vaults.ts"},
    {"path": "apps/terminal/src/components/vaults/use-vault-action-controller.ts"},
    {"path": "apps/terminal/src/domain/portfolio.ts"},
    {"path": "apps/terminal/src/lib/trade/referral.ts"},
    {"path": "docs/leaderboard-vaults-staking-redesign-notes.md"},
    {"path": "docs/portfolio-statistics.md"}
  ],
  "supersedes": []
}
-->
# 第一批 P1 金库与仪表盘

## 背景与范围

同步记录，未取得任务标识。全功能审查（`2026-10-30-full-feature-audit`，在 `claude/p1-order-safety` 分支上）第一批的第三组：E1、E16、E6、E14，并入 E2（只做 Max）、E3、E4。分支 `claude/p1-vault-dashboard`，基于 `dev` `d99c2bc9`，与其他组互不依赖。

## 结论与依据

- **官方依据（2026-10-30 抓取的前端包）。** `VaultWithdrawModal` 的存入组件：`J = k(abstraction) ? E(spotState) : clearinghouse.withdrawable`，`E` 为现货 USDC 的 `total − (spotHold ?? hold)`；`Z = (leader === address || allowDeposits) && name !== "Liquidator"`；`$ = TVL > 1e8 ? 10 : 5`，低于时禁用并提示 `minimum.deposit.x.usdc`；Max 填可用额（向下取到 6 位）。Portfolio 的 14 日成交量为 `dailyUserVlm.slice(0, -1)` 的合计。推荐码输入 `/^[A-Za-z0-9]*$/` 且不超过 20 位、转大写；`/join/:code` 同样 `toUpperCase()`；推荐页读取可选的 `referrerState.data.benefits`。
- **E1 统一账户金库可存额。** 此前存入只看主 dex 永续 `withdrawable`，统一账户为 0。现在 `getVaultDepositAvailable` 按账户模式取值，控制器补拉 `spotClearinghouseState` 与 `userAbstraction`（`staleTime: 0`），签名前与其他快照一起重读并传入预检；对账基线不变（存入后金库权益增加即通过）。`default` 等其他模式失败关闭，与「`default` 不支持资金动作」的仓库规则一致。没有采用官方的 `Liquidator` 名称排除。
- **E16 领导者存入。** 入口可用性与签名前预检都改为「领导者或允许存入」，已关闭的金库仍拒绝。
- **E3、E2。** 最低存入在表单（`belowMinimum`，复用已有译文 `Minimum deposit is {0} USDC`）与签名前预检（`belowMinimumDeposit`）都检查。存入与提取的 Max 填已核验金额向下取到 micro-USDC；提取不使用协议的 `usd: 0` 全额语义，金库权益在审核与执行之间变动时预检会拒绝，提取可能残留零头，留作后续。
- **E6。** 先按日期排序，去掉最后一条（当天），再合计最近 14 条。
- **E14。** 推荐答复的各层 schema 去掉 `.strict()`：已知字段仍按原形状校验，未知字段丢弃。
- **E4。** `normalizeReferralCode` 只接受字母数字且不超过 20 位并转大写，输入框忽略其他字符；提交前对深链带入的码同样规范化，回读对账因此一致。

## 验证与限制

- 新增与更新的测试：`vault-action-domain.test.ts`（账户模式取值、`spotHold`、未知模式失败关闭、领导者、5/10 USDC 最低额，原有存入用例的金额调到最低额以上）；`use-vault-action-controller.test.tsx`（统一账户的可存额、Max、最低额与签名金额，领导者入口；夹具补 `spotClearinghouseState` 与 `userAbstraction`，存入金额改为 5 USDC）；`vault-action-modal.test.tsx`（Max 与最低额提示）；`portfolio.test.ts`（不同日期不同成交量，去掉当天）；`referral.test.ts`、`referral-action-modal.test.tsx`（未知字段与 `benefits`、推荐码规范化、深链转大写；原先「未知字段整体为 null」「含空格的码有效」「深链小写原样提交」三条断言按新行为改写）。
- 变异：撤掉现货取值、最低额、领导者例外、当天排除后 6 项失败；撤掉推荐 schema 放宽与推荐码规范化后 4 项失败；均已还原。
- 全量：`pnpm --filter @sairn/terminal test --maxWorkers=4`，687 个文件 9289 项中 9287 通过、1 跳过、1 失败（`vite-development-cache` 沙箱端口，前两组已在沙箱外确认通过）。
- 浏览器（沙箱外）：`vaults-list.pw.ts` 与 `referral-code-card.pw.ts` 28 项通过。
- `pnpm typecheck`、改动文件的 Biome 通过；新文案 1 条补齐六种语言（沿用各语言已有的金库译名），缺失数与改动前相同。
- 未做：真实金库存取、真实推荐码创建与绑定、真机；Codex 推送前审查待做。

## Codex 推送前审查与修复

- 只读审查（`gpt-6-astra`，low，约 10.4 万 token）审 `e9edd855`：无 P0/P1，3 项 P2，评分 8.0。逐条核对后都成立，已修：
  - **Max 用失败后残留的缓存。** TanStack Query 刷新失败后仍保留旧 `data`。可存额与 Max 现在只取 `isSuccess` 的快照，失败时可存额为 null，Max 与审核入口关闭。
  - **标准账户存入被无关的现货查询拦下。** 签名前的检查改为：账户模式只在存入时必需，现货余额只在存入且模式为统一账户或组合保证金时必需（新增 `vaultDepositUsesSpotBalance`）；出错的现货快照不交给预检。永续快照照旧对所有动作必需。
  - **测试钉不住签名前用重读值。** 新增用例让缓存与重读不同：缓存放行、重读余额不足；重读失败但仍带旧数据；重读后模式变为 `default`；均断言不建 marker、不调用 SDK。
- 变异表另列的缺口也已补：`dexAbstraction` 与 `disabled` 在现货重读失败时仍按永续余额存入、Max 向下取到 6 位（`12.3456789` → `12.345678`）、领导者地址大小写不同、TVL 恰为 1 亿时最低额仍为 5 USDC。
- 变异：预检改用缓存现货或缓存模式、Max 不看 `isSuccess`、现货错误无条件拦截、去掉 `dexAbstraction` 分支、Max 不取整、领导者区分大小写、TVL 用 `gte`，各自让对应新测试失败，均已还原。
- 第二轮只读窄审（范围 `e9edd855 → 91323d9c`）：上一轮三项 P2 与四个变异缺口都已补，未发现修复引入的新问题，评分 9.0。修复后全量（测试工作树，`91323d9c`）：9293 通过，1 失败为沙箱内已知的 `vite-development-cache`（EPERM）。

## 按官方实践处理的待定事项

运营方授权按官方实践决定后（决定表见 `claude/p1-order-safety` 分支审查记录「2026-10-30 按官方实践处理的待定事项」）：

- **官方做法**（`VaultWithdrawModal-EThLm_Fy.js`，2026-10-30）：点 Max 时金额设为 `floor(maxWithdrawable × 100) / 100`，同时记下「全额」标记；之后改动金额会清除标记。提交时有标记就发送 `usd: "0"`（提取全部），否则发送输入值。成功提示不带金额。
- **决定：照做，但不在这一轮改。** 本终端的金库提取带资金动作标记，执行租约核对发出的 `usd` 等于租约金额，提交后再用流水与金库状态按金额对账（`reconcileSubmittedAction`）。改成 `usd: "0"` 后，实际提取金额要到执行时才确定，可能高于确认时显示的 Max，与确认面「执行值不超过显示值」的约定方向相反；流水里这类提取记成多少，也需要真实签名才能看到。所以另开任务：先在测试网由运营方提取一次全额，取证流水字段，再写 ADR，说明对账口径和确认面的例外，然后实现。

## 后续与替代关系

- 金库全额提取：按官方实践决定照做（见上文「按官方实践处理的待定事项」），但另开任务，先在测试网核实。
- E2 的其余部分、E5/E9/E13 被动数据展示等仍在第二批。
