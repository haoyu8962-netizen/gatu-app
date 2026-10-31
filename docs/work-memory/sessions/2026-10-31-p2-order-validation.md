<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-31-p2-order-validation",
  "date": "2026-10-31",
  "title": "第二批 P2 下单校验：被动挂单的最大数量、条件单豁免、TWAP 参照价与子单数量、TP/SL 参照价、现货市价买入预算",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry", "hyperliquid-api"],
  "summary": "运营方要求继续修复 P2，修复方案先核对官方开发文档并与官方终端对比。本组为全功能审查的下单校验：A2、A3、A4、A5、A11、A12，依据 2026-10-31 下载的官方生产前端包 config-BhZylSmU.js（zle/d8、!xJ(P) 与 needToDeposit、UJ、MJ/BJ、g6）与官方文档 Order types。分支 claude/p2-order-validation，基于本地集成分支 claude/p1-integration（dev d99c2bc9 + 第一批六个 P1 分支）。改动：永续限价单的最大数量按挂单价占用的保证金折算，表单与执行守卫同口径，Scale 逐档；有资金账户上的止损/止盈单不受可用余额与最大数量限制；TWAP 有触发价时最高/最低价只比触发价；TWAP 摘要改为约每笔数量；市价单附带 TP/SL 的守卫参照价改为与表单相同的中间价；现货市价买单在表单里按发送价（滑点上限价按发送规则取整）核对报价余额。相关测试、33 个变异与三轮 Codex 审查（终评 9/10）通过；未推送。",
  "thread": null,
  "baseCommit": "0fd4b560",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/src/domain/trade/order/size.ts"},
    {"path": "apps/terminal/src/domain/trade/order/entry-execution-guard.ts"},
    {"path": "apps/terminal/src/domain/trade/order/entry-limit-price.ts"},
    {"path": "apps/terminal/src/domain/trade/order-action-stage.ts"},
    {"path": "apps/terminal/src/domain/trade/twap-details.ts"},
    {"path": "apps/terminal/src/lib/errors/definitions/twap.ts"},
    {"path": "apps/terminal/src/lib/errors/definitions/spot-balance.ts"},
    {"path": "docs/order-entry-surface-parity.md"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types"},
    {"url": "https://app.hyperliquid.xyz/trade"}
  ],
  "supersedes": []
}
-->
# 第二批 P2 下单校验：最大数量、条件单、TWAP、TP/SL 参照价与现货市价买入

## 背景与范围

同步记录，未取得任务标识。运营方 2026-10-31：「继续修复P2 问题 修复方案确保核对官方开发文档 以及调试交易终端 对比过」。全功能审查（`2026-10-30-full-feature-audit`，在 `claude/p1-order-safety` 分支上）把 P2 按功能块分组，本记录是「下单校验」组：A2、A3、A4、A5、A11、A12。

- 分支 `claude/p2-order-validation`，基于本地集成分支 `claude/p1-integration` 的 `0fd4b560`：从 `origin/dev` `d99c2bc9` 依次 `--no-ff` 合并第一批六个 P1 分支（CHANGELOG 取两边、`INDEX.md` 重建，合并历史表格分支时补上 `position-market-close-entry.test.tsx` 的 `reverseBlocked: false`）。该集成分支的代码与此前测过的预览 `fccfa225` 相同，只有 CHANGELOG（预览那份并集合并有错位）和两份记录的链接写法不同。
- 官方依据：2026-10-31 重新下载的官方生产前端包（`/tmp/claude-501/hl-official-1031/assets/`，`config-BhZylSmU.js`、`en-US-Bs1M_qdF.js`），与 10-30 那份相比 `index`、`config` 等包的哈希已经变化，英文文案目录相同；官方文档 [Order types](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types)（经 hyperliquid-docs 检索工具读取）。没有连接钱包、签名或点击官方终端的交易控件。

## 结论与依据

| 编号 | 官方做法（证据） | 本终端修改前 | 修改 |
| --- | --- | --- | --- |
| A2 | `function zle(e,t,n){return t&&t<e==(n===0)?e/t:1}`；`d8` 返回 `maxTradeSz:d*h`，`h=zle(markPx,userLimitPx,side)`；`userLimitPx` 只对带限价的类型（`bJ`：scale、limit、stopLimit、takeLimit）传入表单「限价」字段 | 永续最大数量恒为 `maxTradeSzs[side]`，与限价无关 | 永续委托按 `getRestingMarginPrice` 占用保证金（买单低于标记价、卖单高于标记价按自身价格，越过标记价按标记价），与「`maxTradeSzs` × 标记价」比较。限价单的最大数量与官方一致；Scale 逐档累加，最大数量按整手「先加倍、再二分」搜索，每个候选都按实际拆档核对预算；没有能拆档的数量时为 0。官方给 Scale 传表单「限价」字段（Scale 表单不显示），本终端按各档实际价格，属有意差异。表单 `exceedsPerpEntryMaxSize`、守卫 `assertOrderSizesWithinCurrentAvailability` 同口径 |
| A3 | 下单按钮 `if(!d&&u>h&&!xJ(P)&&!ce)` 才报 `order.placed.exceeds.max.position.error`（`xJ` 为止损/止盈四类，`ce` 为移动止损）；存款只在 `needToDeposit`：主账户价值、金库权益为 0，无子账户、无非零划转，现货为空 | 所有非只减仓订单都检查最大数量与该方向可用余额 > 0，余额为 0 时按钮变「存款」、数量输入被禁用 | 永续止损/止盈单不检查最大数量（表单与守卫）；`hasAccountFunds`（全部 DEX 永续流与现货流都成功且未过期，且任一 DEX 永续权益或任一现货余额 > 0）为真时也不要求可用余额（`entryOrderRequiresAvailableBalance` 经 `useOrderEntryData.requiresAvailableBalance` 进入校验器、按钮阶段、表单禁用与校验提示，组件里以 `=== false` 判定，缺省时仍要求余额） |
| A4 | `UJ`：`s=o?i.px:r`（有触发价取触发价，否则标记价），买单最高价须 > s、卖单最低价须 < s，文案 `twap.max.price.above.trigger` 等 | 表单与守卫的最高/最低价一律与标记价比较，有触发价时再与触发价比一次 | 有触发价时只与触发价比较（表单 `twap-stop-direction` 让位给 `twap-stop-beyond-trigger`，守卫 `assertTwapDetailsStillValid` 取触发价作参照） |
| A5 | 文档：「Intervals are a minimum of 30 seconds」，间隔由订单大小与运行时间决定；摘要 `BJ` 显示运行时间与 `szPerSubOrder: ~X COIN`，`MJ`：`r=Math.floor(n/30)+1`、`Math.min(e.sz,Math.max(e.sz/r,10/t))`（t 为中间价） | 摘要固定写「频率：每 30 秒」，没有子单数量 | 摘要去掉频率行，新增「Size per Suborder ~X」（`getTwapSuborderSize`，参照价取中间价、没有时用标记价，按 `szDecimals` 显示）。进行中 TWAP 表格的频率列不在本组（P3 B14），官方该表没有频率列 |
| A11 | 提交前 `g6(a,h,y,n??0,t??0,yJ(P)?Number(r):s,yJ(P)?'limit price':'mid')`：限价类按限价、其余按中间价核对附带 TP/SL；单独触发单 `tle(...)` 文案 `type.order.must.be.relation.to.mid`（文档同样写 mid） | 表单与构建按中间价（`executionReferencePx`），守卫对市价主单按标记价，中间价与标记价之间的 TP/SL 被守卫拒绝 | 守卫对市价主单改用 `state.executionReferencePx`（表单同源，新鲜度已在 `assertMarketCapStillSafe` 检查）。单独触发单仍按标记价核对方向，交易所按标记价触发，按标记价能避免一挂上就触发；记为有意差异 |
| A12 | 官方表单的现货买入最大数量 = 报价余额 ÷ (限价或标记价)，不在表单里检查滑点预算，交给交易所 | 表单按「数量 × 标记价」核对报价余额，守卫按「数量 × 参照价 × (1+滑点)」核对，手输数量能过表单、在守卫处被拒，文案含糊 | `deriveOrderEntry` 给出 `spotBuyQuoteCost`（市价买单按 `getFrontendMarketOrderPrice` 算出的发送价 × 数量，与下单构建同一函数；算不出时用订单价值），`spot-insufficient-quote` 用它；只因滑点不够时文案 `Insufficient {quoteToken} balance at max slippage`。本终端已有守卫，表单与之对齐 |

规范写在 `docs/order-entry-surface-parity.md`「最大数量、条件单、TWAP 与参照价（2026-10-31，P2 下单校验）」一节，AGENTS.md「Order entry contract」加一行不变量，CHANGELOG Unreleased › Fixed 加六条。新文案两条（`Size per Suborder`、`Insufficient {quoteToken} balance at max slippage`）补齐六种语言，`Frequency` 不再使用；各语言缺失数与改动前相同（ar/es/fr/hi 66、zh 3、ja 0）。

## 验证与限制

- 单元与组件：`order-entry.test.ts`、`order-size.test.ts`、`scale-conversion-price.test.ts`、`order-validation.test.ts`、`reduce-only.test.ts`、`entry-order-execution-guard.test.ts`、`twap-details.test.ts`、`twap-order-summary.test.tsx`、`tests/trade-panel-open-interest-cap.test.tsx`、`tests/mobile-trade-size-validation-a11y.test.tsx` 新增或改写的用例通过。原测试「开仓触发单仍受方向容量限制」按官方改为「超出当前方向容量也接受」；TWAP 摘要测试原断言「每 30 秒、不显示每笔数量」，改为官方算法。
- `decimal-display-contract` 的 `size.ts` 登记由 12 改为 13（整手搜索里把手数换回数量的一处 `toFixed`）。
- 全量 `pnpm --filter @sairn/terminal test -- --maxWorkers=4`（最终代码）：691 个文件、9478 项通过，2 项失败，都与本组无关、单独重跑通过：`chart-store.test.ts` 在全量并发下 `beforeEach` 超过 10 秒（单独 11 项通过）；`vite-development-cache.test.ts` 在沙箱里监听 `127.0.0.1:5173` 被拒（`EPERM`），沙箱外单独 1 项通过。
- 浏览器（Playwright，脚本注入的点击与输入，不代表真机手势）：`tests/browser/playwright.config.ts` 的 `trade-panel-all-orders`、`trade-panel-layout` 12 项通过；`tests/browser/mobile-trade-all-orders.playwright.config.ts`（`desktop-order-entry-layout`、`mobile-trade-all-orders`、`reduce-only`）47 项通过。TWAP 热切换用例原断言「Frequency / 频率」，随摘要改为 `Size per Suborder / 每笔子订单数量`。
- 变异（`m-p2-order.json`）：A4 表单/守卫各一、A2 守卫按数量比较、保证金价格不向标记价收敛、最大数量忽略保证金价、超限判定按数量、Scale 按档价值、桌面/手机不传保证金回调、A3 校验器限制触发单、要求可用余额、阶段变存款、豁免忽略资金、资金忽略现货、守卫限制触发单、A11 守卫用标记价、A12 校验用订单价值、推导按标记价、文案忽略滑点、A5 忽略最低额、子单数少一、不封顶，共 22 个，各自让对应测试失败，均已还原。
- `pnpm --filter @sairn/terminal typecheck`（最终代码）通过；改动文件的 Biome 与 `pnpm i18n:extract`（填译文后无新缺失）在提交前复核。
- CI：`.github/workflows/terminal-tests.yml` 的「Test order draft and exchange session lifecycles」原先没有列 `order-entry`、`order-intent`、`order-metrics`、`order-size`、`entry-order-execution-guard`、`reduce-only`、`scale-conversion-price`、`spot-market-max-order`、`twap-i18n` 这些下单测试（含第一批 P1 加的用例），本次补上；AGENTS.md 回归清单同步补 `order-size`、`entry-order-execution-guard`、`reduce-only`、`twap-details`。
- 未做：真实下单、真机；官方终端只读取了前端包与文档，没有在官方页面上操作订单表单。

## Codex 推送前审查与修复

- 第一轮（`gpt-6-astra`，只读，low，审未提交改动对 `0fd4b560`）：评分 7/10，6 项 P2，逐条核对后都成立，已修：
  - **最大数量求解可能超预算或偏小。** 原先用探测数量估平均保证金价再逐手下调（借用 `capSizeToQuoteAmount`，200 手内放不下就原样返回），审查给出 Scale `1→100`、标记价 10000 时返回 882（实际最大 595）、限价 20 时只给 0.5 手等反例。改为按整手「先加倍、再二分」搜索，每个候选都用实际拆档核对预算。
  - **触发单资金豁免用了未验证新鲜度的快照**、**只看默认 DEX。** `hasAccountFunds` 改为只在全部 DEX 永续流与现货流都是 `success`（已含过期判断）时才可能为真，并遍历全部 DEX；新增真实钩子测试 `order-entry-trigger-funds.test.tsx`。
  - **现货市价买单表单价与发送价取整方向不同。** 抽出 `getFrontendMarketOrderPrice`，下单构建与表单推导共用；预算改为「发送价 × 数量」，不再取与订单价值的较大者。
  - **守卫按标记价折算保证金却不验证新鲜度。** `readLiveMark` 先过 `isLiveMarkPriceReady`。
  - **容量为 0 或缺失时表单不失败关闭。** `exceedsPerpEntryMaxSize` 在数量为正、该方向容量缺失或为 0 时判为超出，对应官方 `size > maxTradeSz`；原测试「零容量返回 false」改写。
  - 审查指出的三处接线缺口（桌面与手机的现货预算、真实钩子的豁免）补了用例。
- 第二轮窄审：评分 8/10，四项已修好、两项部分。其一：Scale 数量太小分不成档时回调为 undefined，搜索在 0 处停下（`10→100` 两档、最大 0.5、标记价 10000 时应为 91）——改为「分不成档」继续往上找。其二：标记价不新鲜时守卫退回按数量比较，对高于标记价的卖单不保守。我先改成失败关闭，结果破坏了原有用例 `validates attached limit TP/SL against the parent price without requiring a live mark`（限价单按设计不要求实时标记价）；最后保留退回方式：买单更严，卖单与改动前相同，超出部分由交易所在下单时按保证金拒绝，不会造成意外成交，写进守卫注释与规范，并用例钉住。
- 第三轮窄审：评分 9/10。搜索问题已修好，标记价取舍成立；新增 1 项 P3：最小可分档数量本身就超预算时会返回一个分不成档的数量——改为返回前确认最终候选有保证金值，没有就返回 0（补用例：最大 0.005 时为 0）。
- 第二批变异（`m-p2-order-r2.json`）：资金判定忽略状态、只看第一个 DEX、钩子传入默认状态、守卫不查新鲜度、零容量放行、二分保留每个中点、只加倍两次、预算取较大值、预算按卖单取整、桌面/手机不传预算，共 11 个，各自让对应测试失败，均已还原。

## 后续与替代关系

- 单独止损/止盈触发单的方向参照价（本终端标记价、官方与文档中间价）保留差异，已写进规范。
- 进行中 TWAP 表格的固定「每 30 秒」频率列随 P3 B14 处理。
- 第一批 #124 的 CI 浏览器回归失败（`position-close-all` 夹具缺地区钩子替身）已在 `claude/p1-funds-safety` 修复（`21ca05c5`、记录 `8ee75309`），并合入本地集成分支（`329f241d`）；推送需运营方同意。
