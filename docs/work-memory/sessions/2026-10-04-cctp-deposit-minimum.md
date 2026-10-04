<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-04-cctp-deposit-minimum",
  "date": "2026-10-04",
  "title": "存款最低额改按 CCTP 规则：去掉旧桥的 5 USDC，窗口提醒改为只说网络与资产",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding"],
  "summary": "用户问邮箱存款是否还有 5 USDC 限制。核对 Circle 与 Hyperliquid 文档后确认 5 USDC 是已弃用 Bridge2 的规则，CCTP 存入 HyperCore 没有最低额。用户决定同步 CCTP 规则、窗口不再展示旧桥规则，并把提醒换成只说受支持的网络与资产。实现：最低额为当前最高手续费的两倍（与 CCTP 提款同一规则），由 calculateCctpDepositFee 在审核与执行时强制，测试网自动转入按同一规则等待；提醒文案改为未入账而非丢失。未做真实存款验证。",
  "thread": null,
  "baseCommit": "4191acf7",
  "commits": [],
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

## 后续与替代关系

- 待用户确认提醒措辞（是否需要更强的警示语）。
- 存款窗口仍有「Legacy Bridge2 deposits are no longer accepted」文案，只在运行时路由返回旧桥、存款暂停时出现，这次没有改。
- `lib/errors/definitions/deposit.ts` 的存取款校验器当前没有调用方，未清理。
- 无被替代的记录；`docs/cctp-deposits.md` 中「保守的 5 USDC 产品下限」一句已由本次改写取代。
