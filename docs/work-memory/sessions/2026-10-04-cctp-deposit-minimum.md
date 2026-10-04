<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-04-cctp-deposit-minimum",
  "date": "2026-10-04",
  "title": "存款最低额改按 CCTP 规则：去掉旧桥的 5 USDC，窗口提醒改为只说网络与资产",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding"],
  "summary": "用户问邮箱存款是否还有 5 USDC 限制。核对 Circle 与 Hyperliquid 文档后确认 5 USDC 是已弃用 Bridge2 的规则，CCTP 存入 HyperCore 没有最低额。用户决定同步 CCTP 规则、窗口不再展示旧桥规则，并把提醒换成只说受支持的网络与资产。实现：最低额为当前最高手续费的两倍（与 CCTP 提款同一规则），由 calculateCctpDepositFee 在审核与执行时强制，测试网自动转入按同一规则等待；提醒文案改为未入账而非丢失。同日经 Codex 审查后补充：低于最低额是带类型的失败并显示在金额输入框，提示值是同一报价会接受的最小金额，Fast 费率超过 10% 的报价按不可用处理。未做真实存款验证。",
  "thread": null,
  "baseCommit": "4191acf7",
  "commits": ["783f50f0", "0f39c7aa", "03304a61", "c9162005", "6744499e", "cc91a87b"],
  "sources": [
    { "path": "docs/cctp-deposits.md" },
    { "path": "apps/terminal/src/lib/trade/cctp-deposit.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx" },
    { "path": "apps/terminal/src/lib/tests/cctp-deposit.test.ts" }
  ],
  "supersedes": []
}
-->
# 存款最低额改按 CCTP 规则：去掉旧桥的 5 USDC，窗口提醒改为只说网络与资产

## 背景与范围

同步记录，2026-10-04，与[加载占位审查](2026-10-04-loading-placeholder-review.md)同一会话、同一分支。用户先问邮箱用户如何存款、是否还有 5 USDC 限制，随后要求核对 Circle 和 Hyperliquid 的现行要求，最后决定：「现在应用是 CCTP 就同步下规则，不要在窗口展示旧桥已弃用的规则」，并要求把提醒换成重要内容，举例为「请仅通过受支持的网络发送 USDC。发送其他资产、使用其他网络（包括 HyperCore）」（原话到此为止）。未取得任务标识。

## 结论与依据

核对结果（2026-10-04 读取的官方页面）：

- Circle「CCTP-enabled HyperCore transfers」：没有最低存款额，任何金额包括不足 1 USDC 都会成功；1 USDC 激活费记在账户上，在第一次转出时收取，首次存款全额入账。
- Circle「Transfer USDC from Arbitrum to HyperCore」：Arbitrum 到 HyperCore 的转发费为 0.20 USDC，从金额中扣除；未写最低额。
- Hyperliquid 开发文档 USDC 页：「最低 5 USDC，低于此数永久丢失」写在 Legacy Bridge 小节，同页说明 CCTP 是首选、旧桥已弃用。
- Hyperliquid 官方前端（读取其公开脚本）：除 HyperEVM 外的存款路线仍按 5 USDC 拦截。这是它自己的界面规则。
- 项目里只有 `MIN_DEPOSIT_USDC` 一处沿用旧数字；转发费从 Circle 报价实时读取，路由为旧桥时暂停存款。

采用的方案：

- 删除 `MIN_DEPOSIT_USDC`。最低额为当前最高手续费的两倍，沿用 CCTP 提款已有的 `CCTP_MINIMUM_FEE_MULTIPLIER`；`calculateCctpDepositFee` 对低于该值的金额抛错，因此表单审核和执行时用新报价重算都会拦截。
- 表单只在手续费已知且与金额无关时显示「Minimum N USDC」，否则不显示数字；低于最低额时的校验错误沿用已有文案「Minimum deposit is {0} USDC」。
- 测试网自动转入改为等余额满足同一规则，锁内用刷新后的余额再判断一次。
- 地址下方的提醒不再重复最低额，改为：只向此地址发送 Arbitrum 上的原生 USDC；其他资产（包括 USDC.e）或其他网络的转账不会计入交易账户。
- 没有照用户示例写「包括 HyperCore」和「丢失」：这个地址就是用户自己的 Hyperliquid 账户地址和钱包地址，在 HyperCore 上向它转账会直接到账，发到其他网络的资产留在用户自己的钱包里、可导出钱包取回，写成丢失不属实。这是我的判断，已在回复里向用户说明，待用户确认措辞。

未采用：保留 5 USDC 并只改文案。用户明确要求同步 CCTP 规则。

## 验证与限制

- `pnpm --filter @sairn/terminal typecheck` 通过；`vitest run --maxWorkers=4` 664 个文件、8642 项通过（工作区，提交前）。
- 新增单测：最低额为手续费两倍、399,999 被拒而 400,000 通过、手续费随金额变化时没有可显示的最低额；自动转入在余额低于两倍手续费时不启动、1 USDC 余额会提交。
- Chrome、开发服务器、邮箱账户：存款窗口显示「Minimum 0.4 USDC」、手续费 $0.20、新提醒，窗口文字里不再出现 5 USDC。
- 五种语言的新提醒译文由我撰写，未经母语者审校。
- 未做：真实或测试网的小额存款；没有验证低于 1 USDC 的账户转出失败时界面的表现；「约 2 分钟」的处理时间文案没有找到官方依据，未改。

## 同日后续：审查后的修正（取代上文相应表述）

以下来自[存款弹窗重排](2026-10-04-funds-dialog-layout.md)那一任务的六轮 Codex 审查，提交 `0f39c7aa`、`03304a61`、`c9162005`、`6744499e`、`cc91a87b`。上文「采用的方案」里与之不同的说法以这里为准。

- 「表单只在手续费已知且与金额无关时显示 Minimum N USDC」已不成立：`getCctpDepositMinimumRaw(quote)` 给出该报价接受的最小金额，只要有可用报价就显示。
- 低于最低额是带类型的失败 `CctpDepositBelowMinimumError`，`reviewCctpDepositFee` 把它变成界面可用的结果：外部钱包的金额输入框显示「Minimum deposit is N USDC」并标记无效，邮箱表单的说明用同一个值。点击时手续费上调使金额不再达标，报「手续费已变化」，不再落入路由失败。
- 提示的 N 是「不低于被拒金额、且同一报价会接受的最小金额」。手续费向上取整且可能随金额增长，所以它是搜索出来的（把候选值反复抬到它所要求的值），不是由被拒金额直接推算；单测把结果与逐个金额扫描对比。
- 新增失败关闭规则：Fast 报价费率超过 `CCTP_DEPOSIT_MAX_FEE_BPS`（1,000 bps，即 10%）时，归一化与计算两处都拒绝，按报价不可用处理，不提供存款。加它是为了让搜索有界且可证明终止。这是我为实现加的边界，不是用户事先提出的要求，已在回复里单独向用户指出。审查方核对 Circle 当时公布的 Fast 费率最高为 13 bps。
- 手续费计算改为精确乘法（乘 `0.0001` 与 `1.2`），不再用会按 20 位小数舍入的除法。只有乘积的小数位超过 20 位时新旧结果才可能不同（包括极小正数不再被舍成 0，也包括略高于整数的值不再被舍回该整数）；常规短小数费率与现有全部期望值不变。JSON number 本身不能排除极小费率，所以不能据此声称所有可能的报价结果都不变。
- 验证：`cctp-deposit.test.ts` 59 项；变异（提示值改回按被拒金额推算、搜索比较改严、去掉两处费率上限、改回除法）均被抓到；最终代码的全量结果见存款弹窗重排记录。仍未做真实或测试网存款。

## 后续与替代关系

- 待用户确认提醒措辞（是否需要更强的警示语）。
- 存款窗口仍有「Legacy Bridge2 deposits are no longer accepted」文案，只在运行时路由返回旧桥、存款暂停时出现，这次没有改。
- `lib/errors/definitions/deposit.ts` 的存取款校验器当前没有调用方，未清理。
- 无被替代的记录；`docs/cctp-deposits.md` 中「保守的 5 USDC 产品下限」一句已由本次改写取代。
