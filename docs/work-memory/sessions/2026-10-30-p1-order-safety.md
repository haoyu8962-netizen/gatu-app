<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-30-p1-order-safety",
  "date": "2026-10-30",
  "title": "第一批 P1 下单安全：L1 动作 15 秒过期、限价与触发价不再静默取整、Scale 按档位加权均价换算",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry", "hyperliquid-api"],
  "summary": "L1 交易延迟保护默认开启并可关闭，正常窗口为估计交易所时间加 15 秒。#129 改用单调经过时间并处理休眠后重采样。限价与触发价校验、Scale 按档位计价一并进入 p36。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": ["cd2f434c", "7b54a4b1", "2bab5b64", "ca327a50", "646fda33", "0c32af85"],
  "sources": [
    {"path": "packages/hl-react/src/internal/exchange/server-clock.ts"},
    {"path": "packages/hl-react/src/clients.ts"},
    {"path": "apps/terminal/src/lib/errors/definitions/price-tick.ts"},
    {"path": "apps/terminal/src/domain/trade/orders.ts"},
    {"path": "apps/terminal/src/domain/trade/order/entry-limit-price.ts"},
    {"path": "docs/adr/0045-l1-action-expiry.md"},
    {"path": "docs/order-entry-surface-parity.md"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/trade-outcome-looks-incorrect/what-does-action-already-expired-mean"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint"}
  ],
  "supersedes": []
}
-->
# 第一批 P1 下单安全：L1 动作过期、价格最小变动单位与 Scale 换算价

## 背景与范围

同步记录，未取得任务标识。2026-10-30 运营方在[全功能审查](2026-10-30-full-feature-audit.md)后选「先修第一批 P1」。本记录是第一组（下单安全）：M1、A8、A1。分支 `claude/p1-order-safety`，基于 `dev` `d99c2bc9`，带上审查记录的提交 `8fb9ee29`。

## 结论与依据

- **M1 L1 动作过期。** 官方前端包（2026-10-30 抓取）：`Hce` 发送 L1 动作时 `expiresAfter = disable_expires_after ? null : y8.expiresAfter()`，`y8.expiresAfter() = serverTime + Date.now() - localTimeSet + 15000`，`serverTime` 取自账户快照 `userState.serverTime`；交易所对过期动作返回 `Action already expired`，官方把它转成指向 FAQ 的说明。SDK 0.33.3 的 `executeL1Action` 读取 `defaultExpiresAfter`（可为异步函数），用户签名动作不读。本终端的 L1 动作只走交易客户端（Agent 或 `showWalletUIs: false` 的内嵌钱包），`expiresAfter` 在请求排队、法律与资金锁之后、签名之前才计算。实现与取舍见 [ADR 0045](../../adr/0045-l1-action-expiry.md)。`exchangeStatus` 在主网与测试网可用，实测服务器时间与本机相差约 0.1 秒。
- **A8 价格最小变动单位。** 官方 `preSubmitValidation` 对限价用 `F3(x, …, "floor")` 取整后与输入比较，不等就报 `Price must be divisible by tick size, with at most 5 significant figures. E.g., {roundedPx}` 并阻止提交。本终端改为表单校验器 `limit-price-tick` / `trigger-price-tick`（文案沿用仓库已有的 multiple of the tick size 措辞），限价示例买单向下、卖单向上，触发价向下；提交时 `formatLimitPriceForOrder` 只向用户边界一侧取整，确认弹窗与下单通知同口径。
- **A1 Scale 换算价。** 官方 `Gq` 以名义数量 1000 生成档位后取数量加权均价，作为表单的限价（`setLimitPx`）参与换算。本终端 `getScaleAveragePrice` 用同一套档位价格与精确偏斜权重计算加权均价，经 `getOrderEntryLimitPx` 作为 `useOrderEntryData` 的 `limitPx`。旧文档「Scale 区间中点不改变手机保证金」是 reduce-only 修复时「不顺带改」的范围限制；本次有意改为加权均价，已在 `order-entry-surface-parity.md` 与 `reduce-only-repair-plan.md` 补记。

## 验证与限制

- 单元与组件：`exchange-action-expiry.test.ts`（8 项）、`order-validation.test.ts`、`order-intent.test.ts`、`scale-conversion-price.test.ts`、`trade-form-fields-order-entry-data.test.tsx`、`tests/trade-panel-open-interest-cap.test.tsx`、`tests/mobile-trade-size-validation-a11y.test.tsx` 新增用例通过。
- 变异：删去两处 `defaultExpiresAfter`，交易客户端测试失败；去掉两个价格校验器并把提交取整改回四舍五入，6 项失败；手机端把 `limitPx` 改回旧表达式、去掉限价校验器，2 项失败；均已还原。
- 全量：`pnpm --filter @sairn/terminal test --maxWorkers=4`，689 个文件 9300 项中 9298 通过、1 跳过、1 失败；失败项 `vite-development-cache.test.ts` 为沙箱禁止监听 5173 端口（`listen EPERM`），沙箱外单独重跑通过。
- 浏览器：`playwright.config.ts` 下 `trade-panel-all-orders`、`trade-panel-layout` 12 项通过；`mobile-trade-all-orders.playwright.config.ts`（含 `desktop-order-entry-layout`、`reduce-only`）首轮 46 通过、1 失败（Scale 保证金预期 $10.00），改为 $8.00 后 `reduce-only.pw.ts` 16 项通过。浏览器测试需要监听端口，在沙箱外运行。
- `pnpm typecheck`、改动文件的 Biome 通过；`pnpm i18n:extract` 后新文案的六种语言译文已补，缺失数与改动前相同（zh 3、ja 0、ar/es/fr/hi 66，均为原有）。
- 未做：真实下单、过期拒绝的真实网络验证、真机；Codex 推送前审查待做（与其他组一起）。附带 TP/SL、TWAP 触发价与最高/最低价、持仓弹窗的价格取整方式没有改。

## Codex 推送前审查与修复

- 只读审查（`gpt-6-astra`，low，约 11 万 token）审 `cd2f434c`（并核对 `8fb9ee29`）：1 项 P1、1 项 P2，评分 7.0。逐条核对后都成立，已修：
  - **Scale 订单价值按理论均价计算，粗手数时与实际拆档不符**（审查方在内存里求值的反例：`szDecimals` 0、100→20、2 档、输入 $180，均价 60、数量 3，实际拆成 100×2 与 20×1，共 $220，而面板按 $180 显示与校验）。推导新增可选的 `orderValueForSize`，Scale 订单由 `getOrderEntryValueForSize` 按实际拆档（`getScaleOrderNotional`）给出订单价值，手续费、保证金、最小名义价值与现货余额校验都随之一致；桌面与手机面板都传入。没有改成「换算数量使总额不超过输入」：拆档总额随数量不单调，逐手回退的次数取决于价格区间，属于另一项设计，留作后续；摘要显示的就是要发送的金额，用户可据此调整。
  - **过期保护测试没有单独钉住主钱包路径与 15 秒。** 新增主钱包客户端的 L1 撤单请求带过期值、两个网络的服务器时钟互不串用、几个动作同时等首个时间请求只发一次三项，新断言直接写 15000。
- 审查的变异表另指出手机触发价位数校验的接线没有测试：手机测试的触发价桩改为可配置，新增止损市价单触发价 `100.1234` 被拦截并给出 `100.12`。
- 变异：主钱包客户端去掉过期值、期限改为 150 秒、时钟缓存键去掉网络、去掉首个同步的共享、推导忽略按档价值、桌面或手机不传按档价值、手机触发价传空串，各自让对应新测试失败，均已还原。
- 修复后浏览器（沙箱外）：`trade-panel-all-orders.pw.ts` 与 `trade-panel-layout.pw.ts` 12 项通过；`mobile-trade-all-orders.playwright.config.ts` 47 项通过（含 `reduce-only.pw.ts` 的 Scale 保证金 $8.00，夹具的拆档与均价恰好一致）。
- 第二轮只读窄审（范围 `cd2f434c → 7ba01e17`）：评分 8.0。上一轮的 P1、P2 与四个变异缺口已修，剩 1 项 P2 与 1 个变异缺口，都已处理：
  - **P2：保证金仍按旧价格计算。** 桌面按区间中点、手机按加权均价乘数量，没有用实际拆档价值（`szDecimals` 0、100→20、两档、输入 $180、10 倍时订单价值 $220，保证金却是 $18），与本记录和 `order-entry-surface-parity.md` 的说法不符。`getOrderMetrics` 新增可选的 `scaleOrderValue`，双端传入 `getOrderEntryValueForSize` 的结果，Scale 保证金按实际拆档价值除以杠杆；其他订单类型各端原口径不变，只减仓仍不适用。新增领域用例，以及桌面与手机组件用例：100000→20000、两档、数量 0.003 拆成 0.002 与 0.001，订单价值 $220，保证金 $22。
  - **两档偏斜没有覆盖。** 新增 100→20、偏斜 3、数量 4：拆成 1 与 3，订单价值 160。
  - 顺带把 `getOrderEntryLimitPx` 的注释移回它自己上方（上一轮插入新函数时放错了位置）。
- 第二轮变异：保证金忽略按档价值、桌面不传按档价值、手机不传按档价值、两档时忽略偏斜，各自让对应新测试失败，均已还原。
- 第二轮修复后浏览器（沙箱外）：`trade-panel-all-orders.pw.ts` 与 `trade-panel-layout.pw.ts` 12 项通过；`mobile-trade-all-orders.playwright.config.ts` 跑了两轮，各 46 通过、1 失败，两轮失败的不是同一项（`desktop-order-entry-layout.pw.ts:391` 缩短网格的滚动容器、`:296` 1421px 表单适配），当时系统负载平均值约 19；`:391` 单独重跑 3 次通过，整份 `desktop-order-entry-layout.pw.ts` 单独运行 9 项通过。含 Scale 保证金 $8.00 的 `reduce-only.pw.ts` 两轮都通过。
- 全量（测试工作树）：第一轮修复 `7ba01e17` 9303 通过；第二轮修复 `9babf39f` 9306 通过；各 1 失败为沙箱内已知的 `vite-development-cache`（EPERM）。第三轮只读窄审（范围 `7ba01e17 → 9babf39f`）：保证金与两档偏斜两项都已修，未发现新问题，评分 9.0；审查方注明组件用例证明的是接线，真实 Hook 的完整运行链不在其中。

## 按官方实践处理的待定事项

运营方授权按官方实践决定后（决定表见审查记录「2026-10-30 按官方实践处理的待定事项」），本分支处理三项：

- **交易延迟保护开关。** 设置「Trading」组新增「Transaction delay protection」开关，默认开启，存为全局设置 `transactionDelayProtection`。客户端运行时加载时把读取函数交给 `hl-react`（`setTransactionDelayProtectionReader`），每个 L1 动作签名前读取；关闭时不写 `expiresAfter`，也不请求服务器时间。ADR 0045 补第 6 条。新增两条文案，七种语言都有译文。
- **Scale 的 USD 输入不超过输入金额。** 实际拆档的总额超过输入金额时，按整手调低数量（`capSizeToQuoteAmount`，最多 200 手）：$180 的例子由 3（$220）调为 2（$120），与官方结果相同；对数量框里的 USD 金额生效，包括 USD 模式下百分比滑条写入的金额；按基础币输入、只减仓滑条选出的数量不调整。
- **其余价格字段。** TWAP 的触发价与最高/最低价（高级设置打开时）改为与主价格相同的校验：`twap-trigger-price-tick`、`twap-stop-price-tick`，永续与现货都检查，桌面标红输入框（出错边框样式移到共享的 `tradingInputFrameErrorClass`），手机在动作按钮上方显示。附带 TP/SL 与持仓弹窗的价格框在失焦时就改写为合法价格并显示，提交的就是显示的值，与官方效果相同，不改。
- 测试与变异：开关的五个变异（客户端忽略开关、运行时不注册、设置开关取反、不持久化、读回时忽略存值）与封顶的五个变异（不封顶、按基础币输入也封顶、滑条数量也封顶、等于输入金额时也往下调、算不出价值时用了中间数量）各自让对应测试失败，均已还原。按基础币输入的变异第一次没有被抓到：原例子恰好落在「算不出价值就保持原数量」的分支上，补了一个封顶会改变结果的例子后才抓到。
- TWAP 价格条件的七个变异（永续或现货验证栈漏掉、高级设置关闭时仍检查、最高/最低价示例不分方向、桌面不标红、桌面或手机不把输入交给验证）各自让对应测试失败，均已还原。写测试时一度把卖单最低价写成 `99.121`，它本身就是合法价格（5 位有效数字），改为 `99.1219` 才是有效的反例。
- 只读审查（`gpt-6-astra`，low）审 `2e23e289 → c4a7e044`：无 P0/P1，3 项 P2，评分 8.0。处理：
  - **USD 模式下的百分比滑条也会被封顶，与记录的说法不符。** 滑条在 USD 模式下写入的是一个 USD 金额（只减仓滑条才保存基础币选择），所以同样走封顶。决定保留这个行为、改正规范与本记录：数量框里的 USD 金额不会被超过，不论它怎么来的；官方在同一例子里同样只下 2 手；拖动时滑块不动，松手后回到实际数量对应的位置，不违反滑条契约。
  - **TWAP 最高/最低价在现货与双端接线上没有测试。** 补现货只有最高价非法、桌面与手机只有最高价非法时阻止提交的用例。
  - **关闭保护只测了 Agent 客户端。** 补主钱包客户端在同一个客户端上关闭、打开、再关闭的用例。另补封顶 200 手上限的边界用例（第 200 手才合适时调整，第 201 手才合适时保持原数量）。
  - 五个对应变异（现货栈漏掉最高/最低价检查、桌面或手机不把最高/最低价交给验证、主钱包客户端忽略开关、上限改为 20 手）都被新测试抓到，均已还原。全量（测试工作树，`c4a7e044`）：9317 通过，1 失败为沙箱内已知的 `vite-development-cache`（EPERM）。
- 第三轮只读窄审（范围 `c4a7e044 → 296fd9f0`）：三项都已修，未发现新问题，评分 9.0；审查方认为 USD 滑条的处理与滑条契约不冲突（拖动时滑块跟随指针，不被业务回传值拉回）。
- `296fd9f0` 的全量出现 4 项过期测试失败（另 1 项为已知的 `vite-development-cache`），偏差都是约 1.6 秒，超出 ±1 秒的窗口。原因在测试：假交易所时间是 `beforeEach` 时定下的固定值，而文件里第一个客户端测试要动态加载 `clients` 模块，负载高时加载约 1.6 秒，之后才取时间样本，后续测试估出的交易所时间因此整体慢了这段加载时间。改为假交易所时间随本机时钟前进（`sentAt + offset`），并按每个请求发出的时刻比较（`expiryDrift`）。人为让第一次取样前多等 1.6 秒，13 项仍全部通过；改用本机时钟、期限改为 16 秒、客户端忽略开关三个变异仍被抓到，均已还原。
- 第四轮只读窄审（`f1551789`）：诊断成立，偏差来源已消除；但按请求发出时刻比较、留 ±1 秒窗口，会把签名到发送之间的耗时算进偏差，也可能放过客户端层多加不到 1 秒的偏差（P2）。改为在客户端集成用例里冻结本机时钟与单调时钟（`vi.useFakeTimers({ toFake: ["Date", "performance"] })`），断言偏差恰好为 0。客户端多加 1 秒、多加 1 毫秒、改用本机时钟、期限改为 16 秒、忽略开关五个变异都被抓到，第一次取样前多等 1.6 秒的回放仍全部通过，均已还原。`f1551789` 的全量（测试工作树）：9320 通过，1 失败为已知的 `vite-development-cache`（EPERM）。

## 后续与替代关系

- 「关闭交易延迟保护」开关已按官方实践补上（见上文「按官方实践处理的待定事项」）。
- 第一批其余各组（资金安全、金库与仪表盘、历史与表格、图表、改单）在各自分支进行。

## 周整理补记（2026-11-02）

ADR 0045 的后续修订取代初版时钟公式及无开关的说法。样本不加半个往返时间，墙钟变化触发重采样，旧样本只按单调时间推进。真实网络过期拒绝仍待验。 [本周核对记录](2026-11-02-weekly-memory-review.md)
