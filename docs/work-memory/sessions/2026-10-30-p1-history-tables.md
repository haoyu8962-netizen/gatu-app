<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-30-p1-history-tables",
  "date": "2026-10-30",
  "title": "第一批 P1 历史与表格数据：强平文案、历史价格精度、资金费方向与币种、HIP-3 抵押单位、CCTP 流水分类、CSV 原值",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "pr-review"],
  "summary": "全功能审查第一批的第四组（B1、B2、B10、B16、D3，顺带 B5、B19）。成交只在 liquidatedUser 为空或等于本人时标为本人强平（Market Order Liquidation），对手方被强平的成交显示 (Price Improved) 并保持方向颜色，后备、借款与自动减仓沿用官方名称；现货 Buy/Sell 与多空翻转方向可翻译。成交与委托历史价格按市场 szDecimals 的协议精度显示，不再缩写或截到两位。资金费历史显示多空方向，HIP-3 市场的付款与持仓盈亏、保证金、资金费按抵押币显示。资金费与委托历史 CSV 导出交易所原值。存款和提款把发往 USDC 系统地址的 send 记为提款、来自 CoreDepositWallet 的 send 记为存款、其他经系统地址的转移记为划转，来源或去向显示 HyperEVM（官方另从 Across 接口取具体链，未接入）。未推送。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/src/lib/trade/fill-direction.ts"},
    {"path": "apps/terminal/src/lib/trade/market-price-format.ts"},
    {"path": "apps/terminal/src/lib/trade/funding-position.ts"},
    {"path": "apps/terminal/src/lib/trade/collateral-amount.ts"},
    {"path": "apps/terminal/src/lib/trade/account-ledger.ts"},
    {"path": "docs/trading-toolbar-redesign.md"},
    {"path": "docs/withdrawals.md"},
    {"path": "docs/cctp-deposits.md"}
  ],
  "supersedes": []
}
-->
# 第一批 P1 历史与表格数据

## 背景与范围

同步记录，未取得任务标识。全功能审查（`2026-10-30-full-feature-audit`，在 `claude/p1-order-safety` 分支上）第一批的第四组：B1、B2、B10、B16、D3，顺带 B5（CSV 原值）与 B19（方向翻译）。分支 `claude/p1-history-tables`，基于 `dev` `d99c2bc9`，与其他组互不依赖。

## 结论与依据

- **官方依据（2026-10-30 抓取的前端包）。** 成交方向 `c4`：`liquidation` 存在且 `liquidatedUser` 为空或等于本人时为「Market Order Liquidation: {rawDir}」，否则为「{rawDir} (Price Improved)」；`dir` 以 `Liquidated ` 开头为「Backstop Liquidation: …」，`Backstop Borrow Liquidation` 显示为「Full Borrow Liquidation」，`Partial Borrow Liquidation`、`Auto-Deleveraging` 原样。资金费历史有方向列，付款带 DEX 抵押币名；CSV 列为时间、币种、`abs(szi)`、方向、`usdc`、`fundingRate` 原值。流水 `send` 分类：子账户之外，`destinationDex === "spot"` 且目的地为 USDC 系统地址（`q8(USDC 索引)`，即 `0x2000…0000`）为提款；本人到本人或任一方为系统地址（`0x2222…` 或前缀 `0x200000000000000000000000`）为划转；目的地为本人时，Across `hyperliquid-transfers` 接口有记录则为存款（来源为该链），否则发送方等于 USDC 的 `evmContract.address` 为存款（来源 hyperevm）。系统地址在现货 DEX 上的位置显示为 HyperEVM。
- **公开接口核对（2026-10-30）。** 主网与测试网 `spotMeta` 中 USDC 的 `index` 都是 0，`evmContract.address` 分别等于 `config/cctp.ts` 的两个 CoreDepositWallet 地址。分类因此用网络配置加常量系统地址，不新增元数据请求；运营方 10-08 的两笔 CCTP 入账与一笔 −10.49 USDC 提款按此规则分别归为存款与提款（按审查记录的字段推断，未重新读取该账户流水）。
- **B1。** `getFillDirectionPresentation` / `getFillDirectionTone` 统一桌面面板、手机卡片、成交历史页与 TWAP 成交 CSV；手机「强平」类型筛选同样按本人判定。
- **B2。** `getMarketPriceFormatOptions` 把市场的 `szDecimals` 与类型交给 `formatPrice`；委托历史的限价、触发价、保护价与成交价同样处理，目录里没有的市场最多保留 6 位。
- **B10。** 资金费的持仓列在数量前加多空方向（颜色同仓位方向，数字仍在 `bdi` 中）；付款币种用 `getMarketCollateralSymbol`。
- **B16。** `formatCollateralAmount`：USDC 市场保持美元格式，HIP-3 市场的未实现盈亏、保证金、资金费按抵押币数量显示，与仓位价值一致。
- **B5。** 三处资金费 CSV 改为方向、数量、费率、付款、付款币种五列原值；三处委托历史 CSV 的价格、触发价、数量改为原值。与成交历史 CSV 已有做法一致。
- **D3。** `account-ledger.ts` 的 `send` 与 `spotTransfer` 按上述规则归为提款、存款、划转或发送；新增位置 `hyperevm`（显示 HyperEVM，不翻译，同 Arbitrum）。`buildAccountLedgerRows` 需要显式传入 `getAccountLedgerUsdcBridge(isTestnet)`，避免调用方漏传时静默退化。

## 验证与限制

- 新增测试：`fill-direction.test.ts`（本人、对手方、协议强平、大小写、翻译）、`collateral-amount.test.ts`（抵押币、资金费方向、价格精度）；`account-ledger.test.ts` 新增 4 项（CCTP 提款、主网与测试网存款、系统地址划转与本人跨 DEX、普通发送）。原夹具 `OTHER` 为 `0x2222…`，恰是 HYPE 系统地址，改为 `0x3333…`。
- 更新的测试：`trade-history-page`、`history-csv-twap`（本人强平文案）、`historical-order-price`（`$7.4` 去尾零、新增协议精度用例）、`funding-history-page`（方向与抵押币）、`desktop-history-exports`、`mobile-history-cards`、`desktop-orders-history-direction`（新增对手方强平与 CSV 原值断言）、`rtl-financial-ui-contract`、`positions-table-visual-contract`（源码形状随 helper 调整，`bdi` 隔离与非紧凑格式的要求不变）。
- 回退校验：把 13 个组件与钩子恢复为 `HEAD` 后 11 项失败；单独恢复手机与桌面成交面板各 1 项失败；恢复 6 个 CSV 组件后 4 项失败；`getSendAction` 与 `isSystemAddress` 变异后流水 3 项失败。均已还原。
- 新文案 9 条补齐六种语言，缺失数与改动前相同（zh 3、ja 0、其余 66）。
- 全量：`pnpm --filter @sairn/terminal test --maxWorkers=4`，689 个文件 9292 项中 9290 通过、1 跳过、1 失败（`vite-development-cache` 沙箱端口，与前几组相同）。
- 浏览器（沙箱外）：`position-close-all.playwright.config.ts` 46 项通过（渲染持仓行；夹具是 USDC 市场，HIP-3 抵押币显示只由单测覆盖）。
- `pnpm --filter @sairn/terminal typecheck`、改动文件的 Biome、`pnpm memory:check` 与 `memory:test` 通过。Codex 推送前审查待做。
- 未做：真实账户流水的逐行核对、真机。

## Codex 推送前审查与修复

- 只读审查（`gpt-6-astra`，low，约 13.3 万 token）审 `55c0b62e`：无 P0/P1，3 项 P2，评分 8.0。逐条核对后都成立，已修：
  - **抵押币回落。** 资金费历史在市场已下架或报价币未加载时把 HIP-3 付款标成 USDC。新增 `getFundingCollateralSymbol(coin, market)`：`builderPerp` 只用已知的报价币，目录里没有且币名带 DEX 前缀时返回 null，界面只显示数额、CSV 写 `-`；主 DEX 永续仍为 USDC。持仓表的 `getMarketCollateralSymbol` 保留原有回落（持仓只来自在列市场，仓位价值早已如此）。
  - **手机「强平」筛选缺测试。** 新增用例同时放本人强平、对手方强平与无 `liquidation` 对象的 `Auto-Deleveraging`，按「强平」与「交易」筛选并核对导出行。
  - **流水 spot 条件缺测试。** 新增 `destinationDex` 为 `""` 与 `"xyz"` 时发往 USDC 系统地址记为划转、位置为永续的参数化用例。
- 审查的变异表另指出持仓行保证金改回美元格式时没有测试能发现：新增真实 `PositionRow` 用例，USDE 抵押的 HIP-3 仓位的盈亏、保证金、资金费都带 USDE。
- 变异：抵押币回落改回 USDC、手机类型改回按对象判断、去掉 spot 条件、保证金改回 `formatUSD`，各自让对应新测试失败（2、1、2、1 项），均已还原。
- 第二轮只读窄审（范围 `55c0b62e → 562c8687`）：上一轮发现都已修，未发现修复引入的新问题，评分 9.0。修复后全量（测试工作树，`562c8687`）：9296 通过，1 失败为沙箱内已知的 `vite-development-cache`（EPERM）。

## 按官方实践处理的待定事项

运营方授权按官方实践决定后，本分支补上流水分类（官方前端包：`internalTransfer` 的发送方是两个固定地址时记为 `open.interest.reward`，转账一方是自己的子账户时记为 `sub.account.transfer`；`spotTransfer`、`send` 同样先看子账户）：

- `account-ledger.ts` 新增 `openInterestReward` 动作；`buildAccountLedgerRows` 多一个可选的子账户集合，`internalTransfer`、`spotTransfer`、`send` 都先判断子账户。`useAccountLedger` 另查 `info.subAccounts`（失败或缺失时为空集合，这些行保持原标签），CSV 导出同样查一次。新增文案「Open Interest Reward」，七种语言都有译文。
- 测试与变异：奖励地址清空、三种转账各自不判断子账户、hook 不把子账户交给分类、奖励地址按大小写比较，六个变异各自让对应测试失败，均已还原。

## 后续与替代关系

- CCTP 流水显示具体链：按官方实践决定照做，但它把地址发给 Across、要改 CSP，另开任务、先写 ADR（审查记录「2026-10-30 按官方实践处理的待定事项」）。
- 子账户转账与持仓量奖励的分类已按官方补上（见上文「按官方实践处理的待定事项」）。
