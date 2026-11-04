<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-04-mobile-order-summary-official",
  "date": "2026-11-04",
  "title": "手机下单摘要对齐官方：超额清算价、N/A 空值、结算币单位与独立滑点面板",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry", "hyperliquid-api"],
  "summary": "运营方在手机下单摘要上提出六项并要求移除预估费用行。对照官方 HYPE 页面与生产包 config-AY7r1vqO.js：全仓清算价改用官方的初始保证金补足规则（超额与空账户也能估算，桌面手机共用）；手机普通订单摘要的空值统一为同色 N/A，金额写成两位小数加报价币，清算价不带 $，数量为 0 时预估滑点为 0%，最大滑点改为强调色，去掉费用行；桌面与手机点滑点都打开新的 Adjust Max Slippage 面板（懒加载，范围仍为 0.1%–5%）。Scale/TWAP 摘要与桌面摘要的显示未改，待运营方决定；真实钱包与真机未验证。",
  "thread": null,
  "baseCommit": "2230c64e",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/domain/trade/order/liquidation.ts" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-trade-summary-view.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/max-slippage-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/lazy-trade-settings-modals.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/trade-panel.tsx" },
    { "path": "apps/terminal/src/lib/tests/prospective-liquidation.test.ts" },
    { "path": "apps/terminal/src/lib/tests/max-slippage-modal.test.tsx" },
    { "path": "docs/order-entry-surface-parity.md" },
    { "path": "docs/mobile-data-presentation.md" },
    { "url": "https://app.hyperliquid.xyz/trade/HYPE" }
  ],
  "supersedes": []
}
-->
# 手机下单摘要对齐官方：超额清算价、N/A 空值、结算币单位与独立滑点面板

## 背景与范围

同步记录，未取得任务标识。2026-11-04 运营方在本会话启动的开发服务器（`dev` `2230c64e`，3005 端口）上选中手机下单摘要（`MobileTradeSummaryView`），提出：

1. 超额时继续显示清算价。
2. 空值颜色统一，再决定是否改用 `N/A`。
3. 预估滑点在无值时的显示方式。
4. 统一清算价和金额的单位。
5. 去掉默认状态下 2.5% 的红色。
6. 滑点改用专用编辑面板。

此外要求移除预估费用行；拿不准的做法，调试官方 `https://app.hyperliquid.xyz/trade/HYPE` 的同一功能块。

同一时间，p39 的晋升与发布交给了另一个会话（PR #150），不在本记录范围内。

## 结论与依据

**官方取证。** 时间是 2026-11-04，在内置浏览器里以 375×812 打开官方页面，未连接钱包，在数量框输入 1 HYPE，但没有提交订单；打开过滑点面板，没有确认就关掉了。同时读了生产包 `config-AY7r1vqO.js`：
- 摘要组装处（`Est: ${L} / Max: ${z3(b*100,2)}%` 附近）：Order Value 与 Margin Required 用 `B3(F,2,w)`，页面上是 `84.20 USDC`，空值为 `N/A`。清算价为 `ee ?? ''`。滑点链接点击后打开 `setMaxSlippage`。费用行只在 `!e` 时出现，手机页面上没有这一行。
- `b6`/`c6`：全仓清算价先把实时价值 `P` 与初始保证金取大，即 `c = Math.max(n, r / Math.min(a, s.maxLeverage))`，再按档位求解，其中 `M6(e) = e * 2`。`P` 的算法是：标准账户为 `accountValue - crossMaintenanceMarginUsed` 加上本资产仓位的维持保证金；统一账户取结算币扣除维持保证金后的可用额，缺失按 0 计。
- `XQ`（Adjust Max Slippage）：输入框两位小数，范围夹在 0–100，小于 0.01 时 Confirm 不可用；说明文字称平仓固定用 8%、市价 TP/SL 用 10%。
- 页面实测样式：标签为灰色 12px；数值与 `N/A` 都是白色、400 字重；滑点链接为青色 `rgb(80, 210, 193)`。

**采用的方案。**
- **清算价（第 1 项）。** 在 `liquidation.ts` 新增 `withInitialMarginTopUp`：全仓时，若「权益减其他维持保证金」低于 `名义价值 / 杠杆`，就按补足到这一数额计算。改动配套如下：
  - `canEstimateProspectiveLiquidationDraft` 只要求数量为正；
  - `resolveCrossMarginAccount` 接受价值为 0 的账户，统一账户缺少该结算币余额时按 0 计，但负值、重复余额仍拒绝；
  - 全仓投影不再因权益不为正而拒绝新仓位。

  原注释说在能精确重建补足规则之前不得估算，现在有了官方源码，这一前提已解除。杠杆不超过档位，仍在补足之前检查。
- **空值（第 2 项）。** 手机普通订单摘要的空值统一为同色 `N/A`，与官方一致。数值保持原来的半粗字重。`N/A` 作为稳定占位，已写进 `docs/mobile-data-presentation.md`。
- **预估滑点（第 3 项）。** 数量为 0 时显示 `0%`，其余无法估算的情况显示 `N/A`。
- **单位（第 4 项）。** 采用官方写法：金额是两位小数加报价币（与可用余额行一致，HIP-3 市场显示其结算币），清算价不带 `$`（与持仓卡片一致）。另一种理解是两者都加 `$`；没有采用，因为它与官方和可用余额行都不一致，对非美元结算币也不对。
- **滑点颜色（第 5 项）。** 最大滑点改为 `text-signal`。
- **滑点面板（第 6 项）。** 新增 `max-slippage-modal.tsx`，经 `lazy-trade-settings-modals.ts` 用 `createRetryableLazyComponent` 懒加载，并在下单面板的操作意图时预热。手机放在第二个 `LazyDialogHost`（drawer）里，桌面用 `activeModal === "maxSlippage"`。范围仍为 0.1%–5%。说明文字按本终端的实际行为写：市价平仓、全部平仓与反向都使用这个设置，市价 TP/SL 为 10%。
- **费用行。** 移除，`TRADE_PANEL_LABELS.estimatedFee` 不再使用，一并删除。
- **翻译。** 新增三条文案，六种语言都已翻译，`pnpm i18n:extract` 显示各语言缺失数与改动前相同（ar/es/fr/hi 35，ja 0，zh 3）。

## 验证与限制

工作区基线为 `dev` `2230c64e`，改动在分支 `claude/order-summary-official-rows`。
- `pnpm --filter @sairn/terminal typecheck` 通过。
- Biome 检查改动文件，没有问题。
- 定向 Vitest 全部通过：`prospective-liquidation`、`max-slippage-modal`、`mobile-order-risk-summary-contract`、`mobile-order-safety-contract`、`lazy-trade-settings-modals`、`order-summary`，以及 `tests/mobile-trade-size-validation-a11y`。
  - 新增用例：超额补足、其他维持保证金、空账户、新面板的保存/范围/关闭/放弃。
  - 数值用官方 `c6` 公式手算核对：例如 5 倍、账户 100、名义 1000 时为 81.0126582278481。
- 开发服务器实测（内置浏览器，脚本点击，不是物理输入）：
  - 手机 375×812：四行为 `N/A`、`N/A`、`N/A`、`0% / Max 2.5%`，`N/A` 都是白色 600 字重，`2.5%` 为 `rgb(134, 229, 211)`，没有费用行；点滑点打开底部面板。
  - 桌面 1440×900：点滑点打开居中面板。
  - 编辑过程中热更新留下的旧报错带有更早的模块时间戳，刷新后页面正常渲染。
- 全量 Vitest（`pnpm --filter @sairn/terminal test`，沙箱外运行）：715 个文件，9,859 项通过、37 项失败、1 项跳过。失败分两类：
  - `tests/trade-panel-open-interest-cap.test.tsx` 的 36 项：它对懒加载注册表的 mock 缺少新的 `MaxSlippageModal` 导出。补上后单独重跑 36/36 通过。
  - `funds-modal-scroll-contract` 的 1 项：本机工作树多出一个 `packages/ui/src/.claude` 目录（会话工具产物，不在 Git 里）引起的已知误报，与本次改动无关。
- 包体预算：在仓库外的临时工作树里按复现规则构建 `f0ea4119`。条件为 Node 22.15.0、无 `.env.local`、固定构建身份、`NITRO_PRESET=node-server`、配对关闭；全部预算通过。余量如下：
  - `trade-terminal-page`：127,785，余 285；
  - 手机运行时：+9,188，余 812；
  - 交易启动：+8,190，余 1,810；
  - `vaults-page`：余 240；
  - 总量：+2,919。
  与此前 CI 读数（`trade-terminal-page` 余 286、手机运行时余 804、`vaults-page` 余 240）基本相同。这次的面板是懒加载块，不进启动包。发布配置（配对开启）的读数未测，下一次发布前仍须预检。
- Codex CLI 只读审查（`gpt-6-astra`，low）：`f0ea4119` 得 8.2/10，一项 P2，核实属实。
  - 问题：已有全仓仓位同向加仓时，如果扣除手续费后权益不为正，投影会在补足之前返回空值，清算价照样消失。例如账户 20、已有 1 单位多仓、加仓 1,000 单位、5 倍、手续费 45 时，应为 81.0127。
  - 修复：去掉这一步的拒绝，交给补足处理。补充同向加仓与空单的补足用例，并让面板测试记录输入框的小数位、范围与 `mobileSafe`。
  - 变异核对：恢复这一步的拒绝、只对买单补足、只对新仓位补足、删掉 `maxAllowedDecimals`，四个变异都被测试抓到。
  - 审查方未能确认的一点：本终端用执行参考价，官方用标记价（限价更差时取限价）。这是既有的近似，本次没有改。

未覆盖：
- 未连接钱包时数量框不可用，所以开发服务器上没有看到带数值的 `USDC` 金额与超额清算价，只由单元测试覆盖；
- 真实钱包与真机未验证；
- 浏览器套件 `reduce-only.pw.ts` 的期望已按新显示更新，但未在本地运行。

## 后续与替代关系

- 待运营方决定：Scale 与 TWAP 摘要（仍是 `$` 金额加费用行）、桌面摘要的空值与单位，是否一并对齐。
- 推送与开 PR 需运营方同意。下一次发布前，按发布预检规则测量 `trade-terminal-page` 与手机运行时余量。
- 本记录不替代此前的记录。原 `canEstimateProspectiveLiquidationDraft` 的「超额不估算」决定，由本记录的补足规则取代。
