# 对抗审查报告:`0e89a90a` fix(trading): prevent mobile order size overrides

- 审查对象:`0e89a90a`,9 文件 +322/-46
- 方式:7 维度并行对抗审查 → 每条 high/medium 反驳式核实 → 盲区批判 → 关键项人工实证(读 @base-ui/react@1.3.0 源码、核对官方文档与 SDK schema)
- 规模:34 个 agent、约 340 万 token
- 基线:测试 **1112 → 1123 全通过**,`pnpm typecheck` 通过
- confirmed 22 条:**0 blocker、0 high、2 medium、20 low**;refuted 4 条

## 一、结论:修复是对的,但它写下的理由是假的

**这个提交确实修好了它要修的 bug,而且没有引入资金风险。** 但最值得说的一点是:

> **提交声称的防护机制不存在,而真正起作用的那个改动没有任何测试保护。**

三处改动里,只有两处承重:

| 改动 | 是否承重 | 说明 |
|---|---|---|
| 删掉 `onValueCommitted` 两段式 | ✅ **真正的修复** | 但代码/注释/测试都没说是它 |
| `resetForm()` + `key={marketKey}` | ✅ 阻断跨市场残留 | 顺带清了不该清的字段 |
| `eventDetails.reason === "none"` 过滤 | ❌ **死代码** | 提交把功劳记在了它头上 |

---

## 二、核心发现:真实根因与提交自述完全不符

### 2.1 `reason === "none"` 在 Base UI 1.3.0 里不可达(已人工验证)

新组件的核心防护:

```tsx
if (typeof nextValue !== "number" || eventDetails.reason === "none") return;
```

我读了 `@base-ui/react@1.3.0` 的 slider 全部实现:

- `REASONS.none` 在整个 slider 目录**只出现一次**——`SliderRoot.js:182` 里 `setValue` 未传 `details` 时的 `??` 兜底默认值
- 而 `setValue` 的**全部 4 个调用点都显式传了 details**:`SliderControl.js:261`(drag)、`:306`/`:381`(trackPress)、`SliderRoot.js:213`(keyboard / input-change)
- 受控 `value` prop 变化走 `useControlled`,本身不触发 `onValueChange`
- `setValue` 开头还有 `areValuesEqual(newValue, valueUnwrapped)` 提前返回,无变化的写入早被上游拦掉

**结论:该分支永远走不到。** 它无害,但提交的标题、结构和测试都把它当成"防止 size 被覆盖"的机制,这是错误归因。

### 2.2 真正的根因:`lastChangedValueRef` 的陈旧值提交(已人工验证)

我在 Base UI 源码里定位到了真正被修掉的 bug:

- `SliderRoot.js:124` 声明 `const lastChangedValueRef = React.useRef(null)`
- 只在 `setValue` 内写入(`:202`),**整个组件生命周期内从不复位**
- `SliderControl.js:279` 提交时用的是 `onValueCommitted(lastChangedValueRef.current ?? finger.value, ...)` —— **优先用这个陈旧 ref,而不是本次手势的值**
- `SliderControl.js:379`:`const pressedOnAnyThumb = pressedThumbCenterOffsetRef.current != null; if (!pressedOnAnyThumb) { setValue(...) }` —— **按在拇指上不拖动时跳过 `setValue`**,ref 保持上一次手势的值

于是在**旧代码**下:用户拖滑块设了 60% → 改用键盘/输入框把数量改成别的 → 再轻点一下拇指(不拖动)→ `onValueCommitted` 提交**上一次的 60%** → `applySizeFromPercent(60)` 把用户手输的数量覆盖掉。

**这正是提交标题说的 "mobile order size override"。** 删掉 `onValueCommitted` 确实根除了它。

**风险在于**:代码、注释、测试全部指向那个不存在的机制,而唯一有效的护栏(不使用 `onValueCommitted`)没有任何测试锁定。审查中已有两个维度基于"拖拽抖动"建议把两段式加回来——**任何这样的"优化"都会静默把这个资金相关的覆盖 bug 原样带回,而所有测试保持全绿。**

### 2.3 配套测试对生产行为零判别力(已人工验证)

[trade-size-slider.test.tsx](apps/terminal/src/lib/tests/trade-size-slider.test.tsx) 把 `@gatu/ui` **整个 `vi.mock` 掉**,用只捕获 props 的桩替换 `Slider`(渲染 `null`),再**手工伪造** `onValueChange(80, { reason: "none" })`。

它只验证了 `TradeSizeSlider` 内那个 `if` 语句,从未触碰真实 Base UI——对"真实滑块会不会伪造回写"零判别力。

> 公允地说,核实者推翻了一条更激进的说法("两条断言都恒真"):`:51-53` 手工触发 `{reason:"drag"}` 并断言立即调用 `onPercentChange(40)`,这确实锁住了"改为即时应用"这一行为变化。所以测试不是全无价值,只是**恰好没覆盖它宣称在防的那件事**。

---

## 三、MEDIUM(2 条,均为旧问题,本提交未触及)

### 3.1 单位切换时数量被静默重新解释(USD → 币量)

**`mobile-trade-view.tsx:246-251`**(已人工验证)

```tsx
const convertedSize = convertSizeForModeToggle();
onSizeModeChange(newMode);
if (convertedSize) setSizeInput(convertedSize);   // 空串则不回写
```

而 `size.ts:161` 的 `getSizeValueForModeToggle` 在 `sizeValue <= 0 || price <= 0` 时返回 `""`。quote 模式下 `sizeValue = floorToDecimals(quoteInput / price, szDecimals)`,szDecimals 小的资产极易被 floor 成 0。

复现:szDecimals=0、单价约 200 的市场 → quote 模式输入 `100`(意为 100 USDC)→ `sizeValue = floor(0.5, 0) = 0` → 点单位按钮切到 base → 转换值为空串,**输入框仍是 `100`,含义变成 100 枚 ≈ 20000 USDC**。

缓解:单位按钮文案会变,且本提交新增的"实际下单量"显示行本可提示——但 `sizeValue > 0` 不成立时那行恰好不显示。桌面 `trade-panel.tsx:249-256` 是同一形状。

### 3.2 `plan.errors` 仍被静默吞掉

**`mobile-trade-view.tsx:307-308`**

本提交把 `if (plan.orders.length === 0) return;` 改成 `const entryOrder = plan.orders[0]; if (!entryOrder) return;` —— `ExchangeOrder[]` 元素恒为对象且无稀疏数组,**两种写法布尔语义完全等价**,是纯等价重写。

`plan.errors` 依旧一次都没被读取。桌面 `use-order-submit.ts:186-189` 的做法相反:先 `addOrder(status:"pending")`,再 `if (plan.errors.length > 0) updateOrder({status:"failed", error: ...})`,失败会以红色 toast 呈现。

可复现路径:移动端选 Stop Market(`hideAlgoOrders` 只滤 twap/scale)→ 不填触发价 → 切到现货市场(`orderType` 已持久化且 `resetForm` 不重置它)→ `spotOrderValidators` **没有** `enterTriggerPriceValidator` → 按钮可点 → 点击后 `buildEntryPlan` 返回 `{orders: [], errors: ["Enter trigger price"]}` → 静默 `return`,无 toast、无 loading,用户会反复点击。

---

## 四、值得注意的 LOW

**滑块改为即时应用的连带影响:**

- **拖拽回弹**:现在是"被量化的完全受控"滑块——每次 pointermove 写入 → 数量 floor 到 szDecimals → `getSliderValue` 反算 → 拇指被拉回量化点。粗 szDecimals 资产上拇指不跟手,且可能永远拖不到 100%
- **误触轨道即覆盖**:`packages/ui/src/slider.tsx` 的根节点带 `touch-none`,而滑块嵌在 `overflow-y-auto` 的下单表单里。`SliderControl.js:306/381` 在**手指刚落下、尚未移动**时就以 `trackPress` 调用 `setValue`。用户滚动表单时一次误触即可把手输数量替换掉——**这是 override 问题的另一半,本次没修**
- **每次 pointermove 同步写一次 localStorage**:store 是 `persist` 的,zustand 每次 `set` 都写存储

**`resetForm()` 清空范围超出目标:**

相比 `resetPrices`(只清 6 个价格字段),`resetForm` 额外重置 7 个:`size`(目标 ✓)、`tif`→`Gtc`、`reduceOnly`→`false`、`tpSlEnabled`→`false`、`scaleLevels`→`4`、`twapMinutes`→`30`、`twapRandomize`→`true`。

- 习惯用 **Alo(Post Only)** 的用户,切一次市场就被打回 `Gtc`——限价单从"只挂单"变成会吃单
- `orderType` **不**重置(在 persist 白名单里),于是出现"标签还是 TWAP/Scale,但时长/档位已被打回默认"的不一致

> 核实者证伪了一个更严重的说法:`orderType`/`side`/`sizeMode` 属于 `PersistedState`、不在 `DEFAULT_FORM` 里,所以**不会**出现"切币被打回市价单"。

**`key={marketKey}` 重挂载:**

- `marketKey = routeMarketName ?? selectedMarket?.name ?? "default"` 混用两套命名口径,现货市场同一市场可能产生两个 key
- 无路由市场的页面(`/trade`、`/perp`、`/spot`、`/builders-perp`)上 marketKey 会从 `"default"` 翻转为真实市场名,**在同一市场内触发一次意外的整表单重挂载**
- 重挂载会关闭 WalletModal(含摄像头 QR 扫码)、复位 agent 注册状态

**测试护栏缺口:**

- `resetPrices → resetForm` 的行为扩大**完全没有测试**,`useMarketNavigation` 在整个测试目录下无直接覆盖
- `order-entry.test.ts` / `order-intent.test.ts` 新增的 3 个用例测的是**本提交未改动的纯函数**,revert 全部源码后仍然全绿
- `mobile-trade-layout-market-reset.test.tsx` 断言的是 React key 语义本身,而非"用户输入被清空"

---

## 五、我推翻的一条 high(纠正批判者)

盲区批判报了一条 high:"移动端 `reduceOnly` 是本地 state,store 对触发单强制 reduce-only 的安全逻辑失效 → 止损单以非 reduce-only 提交 → 触发时若仓位已不存在会反向开新仓"。

**这条不成立。** 我查了构造器:

- `orders.ts:95-96` 明确分流:`else if (isTriggerOrder) { buildTriggerOrder(orders, {...}) }`
- `buildTriggerOrder` **硬编码 `r: true`**(与我第一轮审查的记录一致)
- 本地 `reduceOnly` 只流向普通单路径(`orders.ts:234` 的 `r: params.reduceOnly`)

触发单在移动端和桌面端都必然以 `r: true` 提交,不存在反向开仓风险。

残留的是一个小得多的显示问题:桌面复选框是 `checked: triggerOrder || reduceOnly`(触发单时显示勾选),移动端只有 `checked: reduceOnly` —— **移动端 Stop 单的 reduce-only 复选框显示未勾选,实际却以 `r: true` 提交**,属 UI 与提交载荷不一致(low)。

---

## 六、核对结论:官方文档与 SDK 字段均无不规范

按你的要求逐项核对,**未发现字段或协议层面的不规范**:

- **官方文档**:`tick-and-lot-size`("Sizes are rounded to the szDecimals of that asset"——代码用 `formatDecimalFloor` 向下取整,方向安全,不会因进位超出余额)、`exchange-endpoint`(最小名义额 $10 文案)、`take-profit-and-stop-loss-orders-tp-sl`、HIP-1 `frontend-checks`(现货 szDecimals ∈ [0,2])
- **SDK `@nktkas/hyperliquid@0.33.1`**:`order.d.ts` 的 `s` 字段为 `string|number` → `ToString` → `UnsignedDecimal` 正则 `/^[0-9]+(\.[0-9]+)?$/`;`formatDecimalFloor` 产出与 `normalizeDecimalString` 兼容,`s:"0"` 合法。`String(entryOrder.s)` 不会产出 `"undefined"`
- **`szDecimals` vs `orderSzDecimals`**:在 `mobile-trade-view.tsx` 里**同源同值**(都是 `market.szDecimals ?? 0`),现货取 baseToken、HIP-3 取该 dex meta,不存在口径混用。新增的显示行与实际下单量用的是同一函数同一参数,**显示与下单一致**
- **`getSizeInputMaxDecimals`**:核实者指出我给工作流的前提有误——该函数**改前就已在用**,本提交未触碰。quote 模式返回常量 2,szDecimals=0 市场在 USD 模式下可正常输入 `10.5`,百分比按钮写入的 `toFixed(2)` 也能逐字符编辑(我第一轮报的"USD 模式输入框卡死"在更早的提交里已修)

一个**反方向**的精度问题(批判者发现,我未独立验证):quote 模式的 `getSizeForPercent` 以 `Big.toFixed(2)` 收尾,big.js 默认 `ROUND_HALF_UP` 是四舍五入而非向下取整,最多多出 $0.005。在"每 lot 价值 < 半美分"的低价资产上,100% 档算出的数量可能**超过** maxSize,导致 100% 反而进入"超余额"错误态。

---

## 七、方法与置信度

**我亲自实证的**:读 `@base-ui/react@1.3.0` 的 `SliderRoot.js` / `SliderControl.js` 全部 `setValue` 调用点与 `REASONS.none` 出现处;定位 `lastChangedValueRef` 的声明/写入/读取与 `pressedOnAnyThumb` 跳过分支;读 `buildTriggerOrder` 确认 `r: true` 硬编码并推翻批判者的 high;读 `getSizeValueForModeToggle` 空串分支;`resetForm`/`resetPrices` 逐字段差异;读测试源码确认 mock 范围;跑 `pnpm --filter @gatu/terminal test`(1123 通过)。

**未做**:真机触摸手势实测(拖拽回弹、误触轨道、`lastChangedValueRef` 陈旧提交的复现均基于源码推导,推导链是确定性的但未在真机验证);低价资产 100% 溢出的数值复现未独立跑。
