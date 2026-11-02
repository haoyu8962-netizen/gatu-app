<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-02-size-field-fixed-decimals",
  "date": "2026-11-02",
  "title": "下单数量框：程序填入的数量保留全部小数位（0.80 而非 0.8）",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry"],
  "summary": "运营方反馈手机下单面板拖滑杆时数量在 0.8 与 0.84 之间跳动、右对齐数字随位数伸缩。根因是 domain/trade/order/size.ts 的 formatSizeValue 截断后删掉末尾的零。官方终端只读核对代码（数字输入 _p 经 gp→ele 以 toFixed(nDecimals) 显示外部写入的值）并用运营方已登录账户实测（69/60/43% 得 0.80/0.70/0.50，拖动同样两位），未下单。改为滑杆、百分比框、手机点可用金额、单位切换与只减仓选择写入时保留 szDecimals 位，零仍为 0；手动输入不变，下单字符串仍由 formatSizeForOrder 去零。真实设备上的滑动观感未验收。",
  "thread": null,
  "baseCommit": "991796cd",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/src/domain/trade/order/size.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-order-entry-data.ts"},
    {"path": "apps/terminal/src/domain/trade/orders.ts"},
    {"path": "apps/terminal/src/domain/trade/position-tpsl-size.ts"},
    {"path": "docs/order-entry-surface-parity.md"},
    {"url": "https://app.hyperliquid.xyz/trade/HYPE"}
  ],
  "supersedes": []
}
-->
# 下单数量框：程序填入的数量保留全部小数位（0.80 而非 0.8）

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

## 后续与替代关系

- 平仓类弹窗（市价平仓、限价平仓）有各自的数量与百分比逻辑，本次没有改，也没有发现它们用去零写法。
- 全仓库剩下的去零写法是 `formatSizeForOrder`（下单规范字符串）和 `lib/trade/numbers.ts` 的 `formatDecimalFloor`（桌面当前仓位文字、金库金额、Scale 各档下单数量），都不是数量输入框。
