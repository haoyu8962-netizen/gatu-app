# 杠杆弹窗的仓位上限

状态：已实现（2026-09-27），未合入、未发布；分支 `claude/sdk-feat-leverage-limit`，基线 `dbc6036e`。范围：桌面杠杆弹窗 `LeverageModal` 与移动杠杆抽屉（`MarginModeModal` 的 `mobileView="leverage"`），主 dex 永续与 HIP-3 builder 永续；现货没有杠杆编辑器。本文是该行为的归属文档，批次取舍见 [SDK 接入规划](sdk-feature-integration-plan.md) 第 6 项。

## 1. 目标

用户调整杠杆时，在同一个编辑器里看到「按所选杠杆最多能开多大的仓位」。Hyperliquid 用保证金分档限制杠杆：仓位名义价值达到某一档的下界后，这部分仓位只能使用该档的最高杠杆。多档市场（例如 BTC：0 起 40x，1.5 亿起 20x）在高杠杆下有明确的仓位上限，此前终端没有展示它。

## 2. 约束

- 不新增请求。分档表已经随 `allPerpMetas` 的 `marginTables` 进入市场目录（`use-markets.tsx` 经 `resolveMarketMarginTiers` 挂到 `market.marginTiers`），不再调用 `info.marginTable`。
- 计算放在 `domain/`，用 Big.js 比较，下界保持协议十进制字符串，不转浮点。
- 确认面不变：`Confirm` 的名称、禁用条件、手势锁（`leverageDragActiveRef` / `leverageGestureActiveRef`）、`updateLeverage` 的负载与结果通知都不因这一行改变（[确认面契约](confirmation-surfaces.md)）。
- 滑杆手势期间不得移动滑杆（[滑杆交互契约](slider-interactions.md)）：这一行是否出现不能取决于预览中的杠杆，行高也不能随文字变化。
- 被动数据不显示加载、失效、不可用文字（[移动端数据展示规范](mobile-data-presentation.md)）；分档表缺失或无效时整行不出现，只有防御性情形使用稳定占位符。
- 数字经 `lib/format.ts` 并订阅数字格式设置；文案用 `@lingui/react/macro` 的响应式 `t`，切换语言与数字格式时原位更新，不卸载编辑器、不丢失拖动、文本草稿与待提交杠杆。

## 3. 协议语义与官方参照

[Margin tiers](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margin-tiers) 以 `notional_position_lower_bound` 定义每一档，ID 小于 50 的表是单档、最高杠杆等于 ID；[Margining](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining) 说明杠杆只在开仓时检查。所以对所选杠杆 L，第一个「最高杠杆 < L」的档位下界 B 就是 L 能开到的名义价值上限：名义价值 ≥ B 的部分必须用更低的杠杆。以上两段文档于 2026-09-27 经 Hyperliquid 文档检索核对。

官方终端的做法来自 2026-09-27 侦察报告的只读取证（线上前端包 `config-B3kWIW3_.js` 的 `uQ`，与 Git 忽略的本地证据 `.worklog/close-all-queue-review-2026-09-21/official-config.js` 中的 `ZQ` 相同），本次实施没有重新打开官方页面：

- 函数逐档查找第一个 `maxLeverage < L` 的档位并返回它的 `lowerBound`，没有则返回空；只在 `marginTiers.length > 1` 时显示。
- 文案是两句说明，第二句形如 `The max position size for {leverage}x leverage on {coin} is ${maxPosition}.`，放在滑杆上方。
- 侦察观察到 BTC 25x 时这段说明从一行变成两行，滑杆随之下移约 6px。gatu 不照搬这种布局。

2026-09-27 本次实施用公开 `POST /info {"type":"meta"}` 核对主 dex：多档表是 51–56 号（均为两档，下界都以 `.0` 结尾），共 34 个未下架资产，例如 BTC（56：0→40x，150,000,000→20x）、ETH（55：0→25x，100,000,000→15x）、SOL（54）、XRP（53），表 51/52 为 10x→5x（300 万 / 2,000 万）。侦察报告称当日 HIP-3 dex 全部为单档表，本次未复核 `allPerpMetas`；builder 永续走同一路径，用合成分档表测试。

## 4. 设计

### 4.1 领域函数（`domain/trade/order/liquidation.ts`，只增不改）

- `LeveragePositionLimit`：`{ status: "limited"; maxPositionNotional: string } | { status: "unlimited" } | { status: "unavailable" }`。
- `hasLeveragePositionLimits(tiers)`：复用现有的 `normalizeMarginTiers`，分档表有效且多于一档时为真。决定该市场是否显示这一行。
- `getLeveragePositionLimit(tiers, leverage)`：分档表缺失或无效、杠杆不是安全整数、小于 1 或大于第一档最高杠杆时返回 `unavailable`；否则取第一个 `maxLeverage.lt(leverage)` 的档位，返回 `limited` 与 `lowerBound.toFixed()`（`"150000000.0"` → `"150000000"`，大数不出现指数记法），找不到时返回 `unlimited`。
- 复用 `normalizeMarginTiers` 意味着与预估强平价使用同一套分档校验：首档下界为 0、下界严格递增、最高杠杆为正整数且不递增，否则整表视为无效。规范化保证最高杠杆不递增，所以「第一个满足条件的档位」与官方逐档循环结果相同，单测对当日主网全部多档表的每个整数杠杆做了对照。

### 4.2 展示（`tradebox/leverage-position-limit-row.tsx`）

- `LeveragePositionLimitRow({ marginTiers, quoteSymbol, leverage })`：`hasLeveragePositionLimits` 为假时返回 `null`；否则渲染一行 `InfoRow`：标签 `Max position size`，数值由 `lib/trade/leverage-position-limit-presentation.ts` 的 `formatLeveragePositionLimit` 给出。
- 数值规则（提前返回，不嵌套三元）：
  - `unlimited` → `No tier limit`（译文由组件传入）。
  - `unavailable`，或受限但缺少计价币符号 → `FALLBACK_VALUE_PLACEHOLDER`（`-`）。
  - 计价币为 USDC → `formatUSD(value, { compact: false, decimals: 0 })`，例如 `$150,000,000`；数字格式为 `de-DE` 时是 `$150.000.000`。
  - 其他计价币 → `formatQuoteAmount(value, symbol, { compact: false, decimals: 0 })`，例如 `150,000,000 USDH`。
- 计价币的取舍：下单面板的「订单价值」（`order-summary.tsx`）对所有市场都用 `formatUSD`，这是既有的简化；同一表单的止盈止损收益（`tp-sl-section.tsx`，经 `getTpSlCollateralSymbol(market)`）与持仓价值（`position-row.tsx`、`mobile-position-card.tsx`）按计价币区分。分档下界是该 dex 抵押币计的名义价值，所以这一行沿用后者：宿主传 `getTpSlCollateralSymbol(market)`（永续为 `USDC`，builder 永续为其 `quoteToken` 的显示名，缺失为 `null`）。缺少符号时不猜测为美元，显示占位符；「无档位上限」与单位无关，照常显示。
- 行固定为单行：容器 `min-h-4 gap-3 whitespace-nowrap p-0 text-xs`，标签 `min-w-0 truncate`，数值 `shrink-0 font-medium`，颜色沿用编辑器的 `text-trading-panel-muted` / `text-trading-panel-fg`。文字变长（如阿拉伯语、印地语标签）时截断标签，数值始终完整，行高不变。纯文本行，没有背景块，没有 `aria-live`，拖动预览不会被读屏播报。
- 组件体内先调用 `useNumberFormatRevision()`，并把版本号显式传给格式化函数，React Compiler 因此不会在数字格式切换后保留旧字符串；`number-format-reactivity-contract` 把该组件登记为格式化辅助函数的所有者，`i18n-reactivity-contract` 登记为响应式渲染文件。

### 4.3 挂载位置与宿主

- `LeverageEditor` 是桌面弹窗与移动抽屉唯一的共同渲染点。新行放在 `space-y-3` 堆叠里的杠杆输入框之后、既有的高杠杆警告之前，读序为「输入 → 结果」。放在输入框下方还让滑杆在有分档与无分档的市场上处于同一位置。
- `LeverageEditor`、`LeverageModal`、`MarginModeModal` 各增加两个可选属性 `marginTiers`、`quoteSymbol`，只做透传；`MarginModeModal` 的 `FormProps` 由 `Props` 派生，属性自动到达 `MarginModeForm`。
- 桌面宿主 `trade-panel.tsx` 与移动宿主 `mobile-trade-view.tsx` 把原来内联在预估强平价调用里的 `market?.kind === "perp" || market?.kind === "builderPerp" ? market.marginTiers : null` 提到一个 `marginTiers` 常量（行为不变），同时传给强平价估算与杠杆弹层。`market.marginTiers` 是目录 `createMarkets` 里生成的数组，选中市场对象按价格刷新时只做浅展开，引用保持稳定，所以 `memo` 的弹层不会因价格跳动多渲染；`quoteSymbol` 是字符串。桌面的 `MarginModeModal`（`showLeverage={false}`）不传，也不渲染编辑器。
- 移动抽屉只在 `mobileView="leverage"` 且市场可调杠杆时渲染编辑器；保证金模式视图与杠杆固定的市场没有这一行。
- 新代码都在已经按需加载的杠杆弹层块里（`lazy-trade-settings-modals.ts`），不新增首屏惰性块；领域函数、`lib/format` 与 `InfoRow` 已在主依赖图中。

## 5. 状态

| 情况 | 是否显示 | 数值 |
| --- | --- | --- |
| 有效多档表，所选杠杆高于某档最高杠杆 | 显示 | 第一个「最高杠杆 < 所选杠杆」的档位下界，按计价币格式化 |
| 有效多档表，没有这样的档位（如 BTC ≤ 20x） | 显示 | `No tier limit` |
| 单档表、隐式表（ID < 50）、分档表缺失或无效 | 整行不出现（按市场决定） | — |
| 杠杆不是 1 到第一档最高杠杆之间的整数（防御情形） | 显示 | `-` |
| 受限但计价币符号缺失 | 显示 | `-` |
| 未连接、已连接、Agent 会话 | 相同 | 与账户无关 |
| 拖动中 | 同一节点 | 随预览杠杆更新（`TradeSlider` 至多每 15 ms 发布一次） |
| 取消拖动、松手 | 同一节点 | 回到规范值 / 提交值 |
| 输入框中有效整数 | 同一节点 | 随输入更新 |
| 输入框中无效文本 | 同一节点 | 保持规范值 |
| 提交中、关闭动画期间 | 显示，只读 | 随编辑器显示值 |
| 切换语言、切换数字格式 | 原位更新 | 同一节点 |

加载态不可达：弹层只在市场解析后打开，没有分档表时这一行本来就不出现。目录新鲜度（`market.marginMetadataReady`）不参与判断，见 §7。

## 6. 滑杆手势与确认面

- 拖动中编辑器的 `value` 是预览杠杆，这一行跟着改文字（例如 BTC 20x `No tier limit` → 25x `$150,000,000`）；行节点、是否存在与单行高度都不变，所以居中的桌面弹窗和贴底的移动抽屉都不会因为它移动滑杆。
- 这一行只读，不是提交上限：`updateLeverage` 不带仓位数量，确认面契约第 3 条的「展示 → 承诺」界在这里不适用。它不参与 `Confirm` 的禁用、不参与手势锁，也不改变结果通知。
- 既有的高杠杆警告仍按预览杠杆（`riskValue`）在 10x 两侧挂载或卸载。侦察报告从源码几何推断它可能在拖动中移动滑杆，未经浏览器验证；它不属于本功能，本次没有改动，由单独任务处理。

## 7. 非目标、备选方案与代价

非目标：确认前的仓位越限警告或拦截、对已有超限仓位的提示、在这一行里写币种或杠杆、`aria-describedby` 关联到输入框、完整分档表。

| 备选 | 代价 | 结论 |
| --- | --- | --- |
| 照搬官方两句说明（含杠杆与币种） | 文字随杠杆换行，拖动中改变高度并推动滑杆（官方已出现）；句子更长、六种语言都要处理插值 | 不采用，改为单行键值 |
| 显示完整分档表 | 占用更多高度，弹层布局按市场变化；信息超出这次决策需要 | 不采用 |
| 松手后才更新数值 | 行高已固定，没有布局收益；拖动时看不到上限 | 不采用 |
| 请求 `info.marginTable` | 重复请求、新查询键与加载态；目录已覆盖全部资产 | 不采用 |
| 放在滑杆上方（官方位置） | 有分档与无分档市场的滑杆位置不同 | 不采用，放在输入框下方 |
| 按目录新鲜度（`marginMetadataReady`）门控 | 侦察推测 5 分钟 `staleTime` 后可能周期性变为占位，未经运行时验证；数值只是说明 | 不采用，只看分档表本身 |
| 分数下界向下取整 | 需要在领域层丢失精确值；当日主网没有分数下界 | 不采用：领域值保持精确，显示用 `decimals: 0`，分数下界按格式化器默认规则四舍五入 |

## 8. 验证

2026-09-27 在本分支（基线 `dbc6036e`）实际运行，全部通过：

- `pnpm exec biome check`：本次改动的 16 个 TypeScript/TSX 文件，无问题。
- `pnpm --filter @gatu/terminal typecheck`：通过（未改动 `packages/hl-react`）。
- 新增与扩展的测试：`leverage-position-limit.test.ts`（领域规则、官方循环对照、无效表与杠杆）、`leverage-position-limit-row.test.tsx`（数值、隐藏条件、计价币、数字格式与语言原位切换、五种语言的译文、单行类名）、`leverage-editor.test.tsx`（预览、取消、输入与位置）、`leverage-modal.test.tsx`（透传、`memo` 不多渲染、Confirm 不变）、`margin-mode-modal.test.tsx`（移动抽屉拖动在抽屉外壳之下、确认只提交一次；保证金视图与桌面保证金弹窗不显示）、`market-catalog.test.ts`（主 dex 与 builder dex 分档表的挂载、隐式表与不一致表）。
- 与改动相关的既有文件与扫描器：32 个文件 500 个测试（含两个宿主的渲染测试与源码契约、`i18n-reactivity-contract`、`i18n-hot-switch`、`number-format-reactivity-contract`、`locale-format-contract`、`design-token-ratchet`、`modal-surface-contract`、`action-progress-label-contract`、`trading-action-button-label-contract`、`mobile-data-presentation-contract`、`dialog-dismiss-control-contract`）。
- `AGENTS.md` 分组：确认面 41 个文件 882 个测试；滑杆手势与数字/日期格式 15 个文件 267 个测试；移动端数据展示 4 个文件 74 个测试。
- 变异核对：把组件传给格式化函数的数字格式版本号换成常量 0 后，`leverage-position-limit-row.test.tsx` 的数字格式切换用例失败，恢复后通过。

输入路径：以上交互测试都是 jsdom 中由脚本调用滑杆回调与分发输入事件，不代表操作系统的指针事件顺序。未运行：浏览器夹具与 Playwright 滑杆套件（`test:browser:slider`）、完整终端测试、`pnpm build`（包体预算），也没有在真实设备上拖动真实弹层或连接钱包。按[滑杆交互契约](slider-interactions.md)，手势相关的结论在真人拖动真实控件之前不算验证完成。

## 9. 回归入口

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/leverage-position-limit.test.ts \
  src/lib/tests/leverage-position-limit-row.test.tsx \
  src/lib/tests/leverage-editor.test.tsx \
  src/lib/tests/leverage-modal.test.tsx \
  src/lib/tests/margin-mode-modal.test.tsx \
  src/lib/tests/market-catalog.test.ts \
  src/lib/tests/prospective-liquidation.test.ts
```
