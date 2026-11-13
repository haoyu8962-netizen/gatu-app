<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-02-size-field-fixed-decimals",
  "date": "2026-11-02",
  "title": "数量框与市场价格：程序填入与显示的数值保留官方位数（0.80、85.810）",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry", "i18n-runtime", "account-funding"],
  "summary": "运营方反馈手机下单面板拖滑杆时数量在 0.8 与 0.84 之间跳动、右对齐数字随位数伸缩。根因是 domain/trade/order/size.ts 的 formatSizeValue 截断后删掉末尾的零。官方终端只读核对代码（数字输入 _p 经 gp→ele 以 toFixed(nDecimals) 显示外部写入的值）并用运营方已登录账户实测（69/60/43% 得 0.80/0.70/0.50，拖动同样两位），未下单。改为滑杆、百分比框、手机点可用金额、单位切换与只减仓选择写入时保留 szDecimals 位，零仍为 0；手动输入不变，下单字符串仍由 formatSizeForOrder 去零。运营方随后要求审查同类问题并一次修完：市场价格按官方 R3 显示（5 位有效数字、上限 6/8−szDecimals、保留末尾的零），Mid、点订单簿价格、限价平仓 Mid、修改订单起始值与 TP/SL 换算价补到同样位数（TP/SL 四舍五入，官方向下取整），兑换、Earn、金库、质押的 Max 至少两位小数；提交字符串不变。运营方同意后经 PR #143 于 2026-11-03 以合并提交 1cf68b39 合入 dev（CI 全部通过）。运营方随后要求晋升到 main：发布预检中 trade-terminal-page 只余 169 字节（规则要求 200），运营方选「重定基线后晋升」，按复现规则成对测得 #143 使它增长 +66（配对关闭）、+78（配对开启），按配对关闭的 +66 上调到 124,070（PR #145，2026-11-03 合入 dev 26f776ad）。晋升 PR #146 的 Codex 审查指出历史表格的均价被按行情规则取整（P1，与 AGENTS.md 历史表格规则冲突），已改回市场协议小数位（PR #147，合入 dev 90c2e436）。经晋升 PR #146 合入 main 493f3d56，2026-11-04 随 p38 发布（见 p38 发布记录）；真实设备观感未验收。",
  "thread": null,
  "baseCommit": "991796cd",
  "commits": ["32c75b68", "ee9b6cca", "5f7a321c", "1cf68b39", "6c533454", "26f776ad", "f67cbe04", "ec0b62d3", "90c2e436", "493f3d56"],
  "sources": [
    {"path": "apps/terminal/src/domain/trade/order/size.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-order-entry-data.ts"},
    {"path": "apps/terminal/src/domain/trade/orders.ts"},
    {"path": "apps/terminal/src/domain/trade/position-tpsl-size.ts"},
    {"path": "docs/order-entry-surface-parity.md"},
    {"path": "docs/number-format-setting.md"},
    {"path": "apps/terminal/src/lib/format.ts"},
    {"path": "apps/terminal/src/lib/trade/numbers.ts"},
    {"path": "apps/terminal/src/lib/trade/tpsl.ts"},
    {"path": "apps/terminal/src/domain/trade/open-order-modification.ts"},
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"path": "docs/terminal-performance-baseline.md"},
    {"url": "https://app.hyperliquid.xyz/trade/HYPE"}
  ],
  "supersedes": []
}
-->
# 数量框与市场价格：程序填入与显示的数值保留官方位数（0.80、85.810）

## 背景与范围

同步记录，未取得任务标识。运营方发来两张手机下单面板截图（西班牙语界面，HYPE 限价单）：68% 时数量 `0.8 HYPE`，72% 时 `0.84 HYPE`。拖动滑杆时数字在两位与三位之间切换，右对齐的数量随之伸缩，运营方认为「视觉上非常不稳定，很山寨」，并指出其他交易对也一样。运营方要求查明原因、对照官方终端的做法修复；对话中运营方说明可以在已登录账号的 Chrome 里调试官方终端。范围是下单面板（桌面与手机共用）的数量框。

## 结论与依据

**根因。** 桌面 `TradePanel` 与手机 `MobileTradeView` 都经 `useOrderEntryData.applySizePercent` → `getSizeForPercent` 生成数量字符串。`formatSizeValue` 先 `toFixed(szDecimals, roundDown)`，再用 `replace(/\.?0+$/, "")` 删掉末尾的零，所以 0.80 成了 0.8。计价单位切回基础币（`getSizeValueForModeToggle`）走同一个函数；只减仓选择的显示（`getSelectedSizeDisplay`）用 `toFixed()`，同样不补零。数量框本身已是 `tabular-nums`（桌面 `TRADE_INPUT_CLASS`、手机 `sizeValue`），宽度变化只来自位数。

**官方做法。** 2026-11-02 在官方终端核对，先只读页面自己加载的脚本（`/assets/config-BUOnMMpI.js`），再在运营方已登录的 Chrome 里实测；没有点下单、启用交易或任何账户设置，测试后把百分比清回 0，数量框为空。
- 数量框是通用数字输入 `_p({ value, nDecimals, trimTrailingZeros = false, … })`。外部写入的值（滑杆、百分比）经 `gp` 显示：没开 `trimTrailingZeros` 时调用 `ele(e, nDecimals)`，即 `e.toFixed(nDecimals)` 再换成当地的小数分隔符。用户手动输入时，显示的是所输入的原文。
- 下单表单的数量框传入 `nDecimals = 名义金额模式 ? 2 : szDecimals`。滑杆与百分比框都通过 `setPercentage` → `kY` 得到 `F3(百分比 × 最大数量 / 100, nDecimals, "floor")`，结果是数字。
- 实测 HYPE（`szDecimals` 2，市价，可用 10.10 USDC，10x）：输入百分比 68、72 得 0.79、0.84，69、60、43 得 0.80、0.70、0.50；三次拖动滑杆得 0.69、0.78、0.79，都是两位小数。另外，输入 69 后百分比框自己显示为 68，说明官方会按截断后的数量反算百分比；本次不涉及这一点。
- 本终端的 TP/SL 弹窗（`getPositionTpSlSizeForPercent`）本来就用 `toFixed(szDecimals, roundDown)`，与官方一致。

**修改。**
- `formatSizeValue` 不再删末尾的零；截断后为零时仍返回 `0`，原有零值行为不变。
- `getSelectedSizeDisplay` 增加 `szDecimals` 参数，基础币模式也走 `formatSizeValue`；`getReduceOnlySizeSelection` 与 `useOrderEntryData.toggleSizeDenomination` 传入 `szDecimals`。只减仓的 `baseSize`（执行来源）仍是去零形式。
- 计价币模式本来就是固定 2 位，没有改。
- 手动输入不受影响。下单字符串仍是规范的去零形式：普通单、触发单、TWAP 和下单确认经 `formatSizeForOrder`，Scale 各档经 `formatDecimalFloor`。对这些新补零的草稿，交易所收到的字符串不变。
- 宽度稳定只针对非零、整数位数相同的数量。截断后为零的 `0` 进入第一个最小数量单位时、计价币零值 `0.00`、整数部分进位时，宽度仍会变化。小数点设为逗号时，数量框仍显示点（现行数字格式规则），这一点与官方按当地分隔符显示不同。

**文档。** `docs/order-entry-surface-parity.md` 新增「程序填入的数量保留全部小数位（2026-11-02）」一节；`CHANGELOG.md` 的 Unreleased / Fixed 加一条。`decimal-display-contract` 对 `size.ts` 的登记数由 13 改为 12（删掉了 `base.toFixed()` 调用）。

**未采用。** 只给数量框加 `tabular-nums`：它已经有了，字符个数不变才能让宽度不变。把下单字符串也改成补零的形式：交易所签名使用规范数字，`formatSizeForOrder` 的去零行为必须保留。

## 验证与限制

工作区基线 `dev` `991796cd`，分支 `claude/size-field-fixed-decimals`。
- 针对性：`vitest run` `order-size`、`reduce-only`、`decimal-display-contract`、`reduce-only-submission`、`order-slider-sdk-contract`、`spot-market-max-order`、`trade-size-slider-a11y`，共 7 个文件、199 项通过。
- `pnpm --filter @sairn/terminal typecheck` 通过；5 个改动的 TypeScript 文件通过 Biome（测试文件先按格式化器换行）；`git diff --check` 通过。
- 全量终端 Vitest（`pnpm --filter @sairn/terminal test --maxWorkers=4`）：714 个文件中 712 个通过、1 个跳过。唯一的失败是 `funds-modal-scroll-contract`，原因是工具在 `packages/ui/src` 下留下了一个不入库的 `.claude/.cc-writes` 空目录，而这个契约要求 UI 包没有子目录。这是已知的本机误报，本次没有改动 `packages/ui`。
- 浏览器套件（Playwright，Chromium，脚本注入的输入）：
  - `trade-size-slider-performance.pw.ts` 22/22 通过。
  - `mobile-trade-all-orders.playwright.config.ts`（手机所有订单、桌面下单布局、只减仓）47/47 通过。
  - 更新了 4 处预期：夹具中 BTC 的 `szDecimals` 是 3，100% 只减仓显示 `7.150`；在只减仓状态下从 USDC 切回 BTC 显示 `1.000`，与官方 `ele(1, 3)` 一致。
- 夹具截图（375px，同一个夹具，临时脚本运行后已删除）：
  - 市价单 68%、72%、75% 分别显示 `6.800`、`7.200`、`7.500`。
  - 限价 86.098 时，60% 到 80% 的五个读数（如 `6.968`、`7.897`）文字宽度都是 45.8px。
- 未做：
  - 真实手机上拖动滑杆的观感（截图里的场景）。
  - 官方手机布局下的实测：只核对了桌面布局，不过两者用的是同一个 `_p` 组件。

- Codex CLI（`gpt-6-astra`，只读，low）评 9/10，没有 P0–P2。它核对了全部调用方，包括订单簿单位下拉经同一个切换函数的那条路径，也核对了各条下单路径的规范字符串和 `toFixed` 计数。唯一一项 P3 是文档说得太满：零值和计价币零值的宽度、Scale 用的规范化函数，以及逗号小数设置下的显示。这三点已按建议改准。它在只读沙盒里没能启动 Vitest，所以测试结果以上面本机的运行为准。

## 审查补充：价格显示、价格框填值与 Max（同日）

运营方随后要求「其他地方是否同样存在这类问题，请 review 一遍相关的功能块」，审查结论交付后要求「一次修完」。基线是上面的提交 `32c75b68`，同一分支。

**官方做法。** 只读核对官方页面加载的脚本（`config-BUOnMMpI.js`），未连接钱包、未点交易控件。
- 价格显示用 `R3(价格, szDecimals, 品种) = z3(价格, L3(价格, szDecimals, 品种))`。`L3 = max(0, min(5 − floor(log10|价格|) − 1, (现货 8，否则 6) − szDecimals))`；`z3` 以相同的最少与最多小数位调用 `toLocaleString`，所以保留末尾的零。仓位表的开仓价、标记价和预估强平价都经它显示。
- 修改订单弹窗的价格框传 `nDecimals = L3`；由百分比或盈亏金额换算的 TP/SL 价格用 `P3(..., "floor")`。
- 标签页标题由 `Pw` 生成，用 `R3(中间价, 0, 品种)`（`szDecimals` 按 0）。当时标题读数如 `86.168 | HYPE | Hyperliquid`，三位小数。

**发现（原有做法）。**
- `formatPrice` 带 `szDecimals` 时按 `6/8 − szDecimals` 位显示并去零：BTC 最多两位、HYPE 的 85.81 显示 85.81，价格跳动时宽度随之变化。
- Mid、点订单簿价格和限价平仓 Mid 写入 `formatPriceForOrder` 的去零形式；修改订单的起始值是交易所原样字符串（`2`、`170`）。
- TP/SL 换算价按 `6 − szDecimals` 位取整，比 5 位有效数字多一位，提交时才被改。持仓 TP/SL 弹窗因此按未取整的 28243.17 算盈亏（107.61），订单实际带上 28243。
- 兑换、Earn、金库、质押的 Max 填入去零的值（`12.5`、`100`）。金库的去零发生在控制器的 `maxAmount`，不在领域层的 `availableAmount`。

**修改。**
- `formatPrice` 的市场价格路径改用 `getPriceDisplayDecimals`（`lib/trade/numbers.ts`）并保留末尾的零；显式 `decimals` 与紧凑写法不变；`formatLiquidationPrice` 去掉 ≥100k 的 4 位上限分支（5 位有效数字已经覆盖）。
- 价格框填值：`formatPriceForInput`（`domain/trade/orders.ts`）、`getFormattedMidPrice`、`useBookPriceSelection`（新增 asset id 与 `szDecimals` 参数）、限价平仓 Mid、`formatOpenOrderEditValue`（桌面行内编辑与手机弹窗的起始值）。
- TP/SL 换算价与无 asset id 的 Mid 经 `formatPriceAtDisplayDecimals`：先四舍五入，再按取整后的值定位数，所以 99.9996 写成 100.00 而不是 100.000。
- Max：`formatDecimalFloor` 新增 `minDecimals`，`FILLED_AMOUNT_MIN_DECIMALS = 2`（`config/app.ts`），兑换、Earn、金库控制器与质押（`formatHypeMaxInput`）使用；`szDecimals` 为 0 的代币仍是整数。
- 提交字符串不变：下单与修改仍经 `formatPriceForOrder` / `formatSizeForOrder`，Earn 经 `toEarnProtocolAmount`，修改计划与对账按数值比较。
- 文档：数字格式规则 12 与「与官方终端的差异」、`order-entry-surface-parity.md` 新节（含回归测试清单）、`trading-toolbar-redesign.md` 的 Prices 一条、`CHANGELOG.md` 三条。

**有意的偏离。**
- TP/SL 换算价沿用四舍五入，不照搬官方的向下取整。先按官方向下取整实现时，`trade-form-tp-sl` 的一个用例得到空框：多头止盈价离开仓价不到一个最小价位，被取成开仓价；按盈亏金额换算的用例也从 27601 变成 27600。四舍五入把前一种情况缩小到半个价位，并与提交时 `formatPriceForOrder` 的取整一致。两者最多差一个最小价位。
- 标签页标题用市场自己的 `szDecimals`，只在 `6 − szDecimals` 的上限起作用时与官方不同。
- 官方 `L3` 用 `Math.log(x) / Math.log(10)`，整十次幂时会多一位小数；本终端用 `Math.log10`，不复刻。

**未改。** 成交通知的均价按有效数字显示（`order-notification-copy.ts` 不传 `szDecimals`）；CSV 导出交易所原样字符串；订单簿、成交列表与行情头部原本就按同一规则（`getTradePriceDecimals`）；表格数量列与美元金额原本就固定位数。

**验证。** 工作区为 `32c75b68` 加未提交改动。
- Biome：44 个改动的 TypeScript 文件通过（两处先按格式化器换行）；`pnpm --filter @sairn/terminal typecheck` 通过；`git diff --check` 通过。
- 全量终端 Vitest（`pnpm --filter @sairn/terminal test`）：714 个文件中 710 个通过、1 个跳过、3 个失败。
  - `mobile-agent-sync-modal` 27 项在全量并发下 5 秒超时（这次没有加 `--maxWorkers=4`），单独重跑 27/27 通过。
  - `vite-development-cache` 在沙盒里不能监听 5173 端口（`listen EPERM`），沙盒外重跑通过。
  - `funds-modal-scroll-contract` 是上面记录的本机误报。
- 第一轮全量运行有 26 个文件失败：一个是本机误报，一个是 `decimal-display-contract` 的登记数，其余逐个核对后是补零或 5 位有效数字带来的预期变化，已改断言。金库的用例另外暴露补零放错了位置（领域层的 `availableAmount` 而不是控制器的 `maxAmount`），已改到控制器。改了测试数据的三处：`historical-order-price` 的 95001.5 和 `collateral-amount` 的 29780.5 都超过 5 位有效数字，不是合法的价格，改为 9500.5 与 2978.5；`command-menu` 的现货价改为 0.0012345678，让现货与永续的上限差异仍然可见。
- 新增单元测试：`numbers.test.ts`（`getPriceDisplayDecimals`、`formatPriceAtDisplayDecimals`、`formatDecimalFloor` 的 `minDecimals`）、`orders.test.ts`（`formatPriceForInput`）、`open-order-modification.test.ts`（补零的起始值不算改动）、`staking-domain.test.ts`（`formatHypeMaxInput`）。
- 浏览器套件（Playwright，Chromium，脚本注入的输入，沙盒外运行以监听本地端口）：
  - `mobile-trade-all-orders.playwright.config.ts` 47/47 通过。夹具 BTC 的 `szDecimals` 为 3，切到限价时的预填、Mid 与 Scale 的 Mid 改为预期 `100.00`。
  - 共享配置下的 `trade-size-slider-performance`、`trade-panel-all-orders`、`trade-panel-layout` 34/34 通过。
- Codex CLI（`gpt-6-astra`，只读，low，约 11 万 token）评 8/10，没有 P0/P1。四项发现逐条核对后都成立，已处理：
  - P2：限价平仓失焦时写回 `formatPriceForOrder` 的去零形式，Mid 补的零一失焦就没了。改为只有取整改变数值时才写回，并按官方位数补零；合法输入保持原样。提交 hook 收到框里的值（如 `100.50`），`buildOrderPlan` 仍规范成 `100.5`。
  - P2：持仓 TP/SL 弹窗打开已有 TP/SL 时，四个价格框按 `6 − szDecimals` 位预填（HYPE 显示 85.8100），漏改。改用 `formatPriceForInput`，缺值仍为空；原有用例的 30000.000 随之变成 30000。
  - P3：换算价只取整一次会改变个别订单价，例如 80 × 1.0726811 原先下单 85.815，现在是 85.814。保留只取整一次，加了用例，并写进文档和 CHANGELOG。
  - P3：文档说得太满。宽度不变只在同一数量级内成立：显示按取整前的价格定位数，99.9996 显示 100.000，和官方一样。Max 在输入只允许 0 或 1 位、结果为零时不补零。已改准。
  - 按它的建议补了用例：订单簿点价只写一次、之后元数据变化不重放，元数据到达前的点击保持原文；`formatPrice` 的负数、NaN 和跨数量级；超过 5 位有效数字的委托价 95001.5 显示 `$95,002`。
  - 两项 P2 修复都做了变异：把预填改回 `toFixed`、把失焦改回去零写法后，新用例都失败，复原后通过。Codex 在只读沙盒里没有运行测试，测试结果以本机运行为准。
- 第二轮 Codex（同样只读、low，约 7.6 万 token，只审上面四项的修复）评 9.2/10，没有发现。按它建议的变异又补了用例：失焦时合法输入保持原文、取整后写回带尾零的值（100.499 → 100.50）、已有触发限价 TP 与 SL 的四个预填、`formatPriceForInput` 对 `undefined`/`null`/空串返回空、四个换算函数各自只取整一次。九个变异（失焦总是补零、失焦写回去零值、四个预填逐个改回 `toFixed`、删掉空值分支、ROE 与盈亏换算各恢复一次协议位数取整）全部被抓住，复原后通过。
- 包体（提交 `ee9b6cca` 之后在本工作树成对构建）：Node 22.15、`VITE_MOBILE_PAIRING_ENABLED=false`、CI 式元数据（40 位提交号、`ci-local-price-fix`、不固定构建时间）。两侧都读了 `apps/terminal/.env.local`，读数比 CI 高几百字节，只能用来比较两侧，不能当 CI 读数。全部预算通过。与改动前的 dev `991796cd` 相比：
  - `trade-terminal-page` +63（127,797，余量 207，改动前 270）；
  - `vaults-page` +17（30,538，余量 238，改动前 255）；
  - `staking` +58；
  - 手机运行时 −17（余量 810），桌面运行时 −85；
  - 交易启动 +417、总量 +606，两项都含构建身份的噪声，不能全算在这次改动上。
  - 最紧的 `trade-terminal-page` 与 `vaults-page` 改动前就已不足 300 字节。下次发布预检按「其它预算余量不足 200 字节算不通过」的规则，可能踩线。
- 未做：真实手机与桌面上的观感；官方终端里修改订单弹窗和追踪止损显示的实测（账户没有对应订单）；兑换、Earn、金库、质押的 Max 没有浏览器用例，只有单元测试。

**合入。**
- 运营方说「推送并开 PR」后，分支 `claude/size-field-fixed-decimals`（`32c75b68`、`ee9b6cca`、`5f7a321c`）推送，并开目标为 dev 的 PR #143。推送前 `origin/dev` 仍是基线 `991796cd`，无需合并。
- 运营方开启 Auto-fix。Codex 机器人对 `5f7a321c` 的审查完成，没有发现，也没有行内评论。
- CI 全部通过：类型检查与目录、终端测试两片、浏览器回归两片、配对关的终端构建、官网构建。四个晋升覆盖任务按设计跳过。
- CI 构建（配对关）的包体读数，没有 `.env.local`，比上面的本地读数低：
  - `trade-terminal-page` 127,718，余 286 字节；
  - `vaults-page` 30,536，余 240 字节；
  - 手机运行时增量余 804 字节，交易启动余 1,974 字节，总量余 9,648 字节。
- 运营方说「合并 PR」后，PR #143 于 2026-11-03 01:24（UTC+8）以合并提交 `1cf68b39` 合入 dev。合并时锁定头提交 `5f7a321c`，合并后的树与它相同。未晋升 main，未发布。

## 发布预检与重定基线（2026-11-03）

运营方在 PR #143、#144 合入 `dev` 后说「继续合并PR 到主分支」。两个 PR 已经在 `dev` 里，所以理解为 `dev → main` 晋升。按手册第 8 节，开晋升 PR 之前先做发布预检。

**预检。**
- 在仓库外新建发布工作树 `gatu-release-p38`，检出 `dev` `51e99321`。`.env.local` 只软链、不读内容。
- Node 22.15.0、pnpm 10.21.0 按锁文件安装，用时 28.8 秒。
- 用 p37 正式发布的开关构建：配对开启，三个闸门开，`VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false`，`VITE_HYPERLIQUID_TESTNET=` 为空，发布号 `cloudfront-2026-11-03-p38`。
- `build-meta.json` 的提交、发布号与闸门都正确，全部预算通过。
- 但 `trade-terminal-page` 为 127,835，只余 169 字节，低于规则要求的 200；其余各项都满足阈值：

| 预算 | 读数 | 余量 |
| --- | ---: | ---: |
| 总量 | 3,376,546 | 6,452 |
| 交易启动 | 1,653,489 | 440 |
| 手机运行时增量 | 119,778 | 802 |
| `trade-terminal-page` | 127,835 | 169 |
| `vaults-page` | 30,537 | 239 |

- 晋升覆盖的本机预演：`scripts/promotion-coverage.mjs`，`--base origin/main --head origin/dev`。四个工作流都判为已覆盖，由 #143 的运行 41483460419、41483460363、41483460487、41483460203 覆盖，之后的 #144 没有改动它们的输入。重定基线的 PR 改了 `scripts/`，这次预演在它合入后不再成立，开晋升 PR 前要重做。

**运营方选「重定基线后晋升」。**
- 按复现规则，在会话暂存目录建两个不含 `.env.local` 的工作树，用 Node 22.15.0、`CI=true pnpm install --frozen-lockfile --prefer-offline` 安装。
- 构建开关：固定身份、`NITRO_PRESET=node-server`，各自先配对关闭、后配对开启。两侧是 `991796cd`（#143 之前的 `dev`）与 `51e99321`。
- 基线一侧配对关闭时 `trade-terminal-page` 为 127,645，与 p37 记录里 `ce18a5a5` 的读数相同。
- `trade-terminal-page` 增长 +66（配对关闭）和 +78（配对开启）；总量增长 +226 和 +667；手机运行时 −22 和 −10。
- 同一份客户端代码前一天在 `ce18a5a5` 测过。两次相比，总量差 −102 和 −395，交易启动差 +96 和 −190，运行时增量与路由块在 12 字节以内，`trade-terminal-page` 差 0 和 −6。所以 +66 与 +78 之间的 12 字节在噪声范围内。
- 逐块比较（配对关闭）：
  - `vendor-tanstack-router` +126，是 `lib/trade/numbers.ts` 的新函数，只有分支一侧这个块里有 `Math.log10`；
  - 其余增长都在 #143 改过的界面所在的块；
  - 另有 236 个块各变不到 20 字节，合计 −217；
  - 依赖与锁文件没有变化。
- 先按配对开启的 +78 写了 124,082，再改为配对关闭的 +66，即 124,070，允许值不变。改动原因：独立审查子代理指出，上调幅度应与前两次重定基线一致，且两者之差在噪声内。Codex CLI 当时因登录失效（`401 Unauthorized`）没能运行，所以改由子代理审查。
- 上调后余量：发布预检构建 235，#143 的 CI 构建 352，两份复现构建 359 和 358。其他基线不变。
- 发布配置下余量最小的几项，从小到大：
  - `trade-terminal-page` 235；
  - `vaults-page` 239；
  - 交易启动 440；
  - `token-selector-popup` 482；
  - `funding-history-panel` 799；
  - 手机运行时 802。
- 子代理还指出文档把 `trade-terminal-page` 的增长归给了桌面订单表和价格框，而这两处其实在 `orders-tab`、`size-percent-input` 块里；缺少规则要求的块数、合计数与命令里的配对开关。均已改正；路由预加载诊断没读，写为 not read。
- 证据存在本机忽略目录 `.worklog/2026-11-03/p38-trade-page-rebaseline/`：四份构建的预算报告与逐块 gzip、两侧状态、预检产物重读的预算报告、测量脚本。预检原始构建日志随会话暂存目录被清掉，预算报告是对 `gatu-release-p38` 里同一份产物重新读取的。
- 细节写进 `docs/terminal-performance-baseline.md` 的「Price-decimals route-surface re-baseline before release p38 (2026-11-03)」。

## 晋升 PR #146 的审查意见与历史表格修复（2026-11-03）

**发现。**
- PR #145 合入 `dev`（`26f776ad`）后开了晋升 PR #146。Codex 机器人对 `26f776a` 提了一项 P1，位置在 `apps/terminal/src/lib/format.ts:261`。
- 它的意见：只传 `szDecimals` 的调用都被当成行情显示，历史表格里超过 5 位有效数字的均价会被取整。例如桌面 TWAP 历史的均价 88140.5 显示为 $88,141。这违反 AGENTS.md 要求历史表格按市场协议小数位显示价格的规则。
- 核实成立：
  - 成交历史、委托历史经 `getMarketPriceFormatOptions` 传 `szDecimals`；
  - TWAP 历史与 TWAP 成交（桌面、手机）在组件里直接传 `szDecimals`；
  - #143 之后它们都按 5 位有效数字显示。
- 这是 #143 的错。它在 `trading-toolbar-redesign.md` 的 History values 里把这条写成了 R3，等于在下级文档里改变了 AGENTS.md 契约的含义。

**修复。** 分支 `claude/history-price-protocol-decimals`，从 `dev` `26f776ad` 切出。
- `getMarketPriceFormatOptions` 改为给出显式的协议小数位 `decimals`：有市场元数据时是 6 或 8 减 `szDecimals`，没有时是 8。显示结果与 #143 之前逐位相同：最多协议小数位，去掉末尾的零。
- TWAP 历史与 TWAP 成交的四处改用它。
- 仓位、当前委托、进行中的 TWAP 等实时价格，仍按规则 12。
- 文档：
  - 规则 12 加上历史表格的例外；
  - History values 的 Prices 改回协议小数位，没有元数据时按实际代码写为最多 8 位，原文写的 6 位不对；
  - CHANGELOG 与 AGENTS.md 那条规则限定在历史表格之外。

**测试。**
- 恢复 `historical-order-price` 的 95001.5 → `$95,001.5`，以及 `collateral-amount` 的 29780.5 → `$29,780.5`。
- 新增桌面与手机 TWAP 历史各一条用例：
  - 均价 6130.123 / 6.13 显示 `$1,000.020065`；
  - 均价 6132.123 / 6.132 显示 `$1,000.02006`；
  - 成交价 374.5 不补零。
- 五个变异都被抓住：选项改回 `szDecimals`，以及四处 TWAP 改回组件内联的写法。
- 全量终端 Vitest（`--maxWorkers=4`）：714 个文件中 712 个通过、1 个跳过，唯一失败是已知的 `funds-modal-scroll-contract` 本机误报。Biome、typecheck 与 memory 三项检查通过。

**包体。**
- 测量方法：在隔离工作树里构建修复提交 `f67cbe04`，按复现规则用固定身份，不读 `.env.local`，与 `51e99321` 对比。

| 预算 | 配对关闭 | 配对开启 |
| --- | ---: | ---: |
| `trade-terminal-page` | +0 | +3 |
| 手机运行时 | +4 | +24 |
| 桌面运行时 | 0 | +84 |
| 交易启动 | +86 | +107 |
| 总量 | +257 | +375 |

- 总量和交易启动的变化都在同代码构建的噪声范围内。
- 把这些增量加到发布预检的读数上，估算的余量是：`trade-terminal-page` 约 232、交易启动约 333、手机运行时约 778、总量约 6,077，都不低于手册阈值。
- 证据在 `.worklog/2026-11-03/p38-trade-page-rebaseline/fix-*`。

## 合入与发布（2026-11-04）

- #147 的 CI 全部通过（6 项通过、3 项晋升覆盖按设计跳过），Codex 机器人没有发现。2026-11-04 00:55 以合并提交 `90c2e436` 合入 `dev`。
- 晋升 PR #146 在新的 `dev` 上只全跑静态检查和配对开启的构建，01:23 合入 `main` `493f3d56`。
- 同日发布 p38，过程与验证见 [p38 发布记录](2026-11-04-cloudfront-release-p38.md)。

## 后续与替代关系

- 平仓类弹窗（市价平仓、限价平仓）有各自的数量与百分比逻辑，本次没有改，也没有发现它们用去零写法。
- 去零写法现在只留在规范字符串（`formatSizeForOrder`、`formatPriceForOrder`、Scale 各档经 `formatDecimalFloor`）和不传 `minDecimals` 的显示（桌面当前仓位文字、金库金额）。价格框、数量框和 Max 的程序填值都已补零（见上一节）。
- 下一次改价格显示或填值，先读 `docs/number-format-setting.md` 规则 12 与「与官方终端的差异」，以及 `docs/order-entry-surface-parity.md` 的「价格框的程序填值与 TP/SL 换算价」。
- 2026-11-04 更正（[Codex 补审 PR #145 与 #147](2026-11-04-codex-review-pr145-pr147.md)）：运营方重新登录 Codex CLI 后，要求补审当时没经过 Codex 的 #145、#147。
  - 上文说 #145 的 +66 与 +78「之间的 12 字节在噪声范围内」，依据不足：12 字节的上限来自别的读数，`trade-terminal-page` 两天之间只变了 0 与 −6，没有分离配对开关本身的影响。
  - 上文写了路由预加载诊断没读（not read），但没有指出这不符合手册的复现规则：重定基线时要记录它本身的字节数。当时存档的预算报告只写了「来自 6 个路由预加载」，构建也没保留，现在补不了。
  - #147 漏了一处：四张 TWAP 表把 `getSzDecimals()` 的值单独传给 `getMarketPriceFormatOptions`，市场不在目录里时它默认 4，只显示 2 位小数，没有用上「最多 8 位」的兜底。
  - 这三处已在 `docs/terminal-performance-baseline.md`、`docs/trading-toolbar-redesign.md` 与代码里改正。本节的原文保留不改。

2026-11-09 引用补记：补齐正文已描述的 #145/#147 与 p38 实际提交引用。现行规则分别定义实时价格和程序写入值保留官方小数位，以及历史表格保留协议小数位、去尾零，不能互相套用。p38 后补审又修复 TWAP 历史中目录缺失市场的八位兜底，见[补审记录](2026-11-04-codex-review-pr145-pr147.md)，来源报告随 p39 交付。本次只核对文档、提交与当前四张 TWAP 表的调用，没有重做原交互和资金验证。
