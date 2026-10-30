<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-30-p1-vault-dashboard",
  "date": "2026-10-30",
  "title": "第一批 P1 金库与仪表盘：统一账户金库可存额、领导者存入、最低存入与 Max、14 日成交量、推荐接口与推荐码",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "pr-review"],
  "summary": "全功能审查第一批的第三组（E1、E16、E6、E14，并入 E2 的存入 Max、E3、E4）。金库存入可存额按账户模式取值（统一账户与组合保证金用现货 USDC total − (spotHold ?? hold)，disabled 与 dexAbstraction 用永续 withdrawable，其余失败关闭），签名前同样重读；领导者在 allowDeposits=false 时仍可存入自有金库；官方最低存入 5 USDC（TVL 超过 1 亿为 10 USDC）在表单与签名前检查；存入与提取都有 Max（填已核验金额，提取不用协议的 usd=0 全额语义）。Portfolio 14 日成交量去掉当天未结束的一条。推荐接口答复不再因新增字段整体不可用；推荐码只收字母数字、最多 20 位并转大写，深链同样转大写。全量单测与金库、推荐浏览器套件通过（沙箱端口项除外）。未推送。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": [],
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

同步记录，未取得任务标识。[全功能审查](2026-10-30-full-feature-audit.md)第一批的第三组：E1、E16、E6、E14，并入 E2（只做 Max）、E3、E4。分支 `claude/p1-vault-dashboard`，基于 `dev` `d99c2bc9`，与其他组互不依赖。

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

## 后续与替代关系

- 金库提取的「全额」是否改用协议 `usd: 0` 语义（官方做法，可避免零头）需要单独设计对账，未做。
- E2 的其余部分、E5/E9/E13 被动数据展示等仍在第二批。
