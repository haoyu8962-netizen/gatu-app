<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-20-slider-review",
  "date": "2026-09-20",
  "title": "滑杆审查：移除平仓弹窗的快捷百分比按钮，修复弹窗打开动画期间拖动被取消，登记其余交互与规范问题",
  "kind": "task",
  "status": "verified",
  "topics": [
    "order-entry",
    "docs-governance"
  ],
  "summary": "平仓弹窗的 25/50/75/Max 快捷按钮是旧方案的遗留（下单表单早已改用带刻度的滑杆，config 里还留着两个无人使用的百分比常量），已移除。滑杆审查在真实页面上复现并修复了一个跳回起点的缺陷：桌面弹窗 200ms 的 scale 打开动画期间按住滑杆，ResizeObserver 把布局宽度与 getBoundingClientRect 的可视宽度相比，误判为尺寸变化而取消手势。另实测确认预览的 15ms 尾部防抖在约 7ms 间隔的指针事件下整段拖动不发布任何预览，数字冻住到松手才跳；该行为与松手吸附到实际百分比、数据状态翻转取消手势同属有测试钉住的既有设计，登记为待产品决定。性能在开发构建下实测无长任务。同日更正：官方滑杆同样使用重置式 15ms 防抖、同样把百分比重新推导为实际值，审查中「官方不从数量反推」的说法是错的；随后按产品负责人的决定把预览改为节流、为数据暂不可用新增暂停语义，松手吸附保持不变。",
  "thread": null,
  "baseCommit": "cd68260a",
  "commits": [
    "178661c3",
    "928cebf1",
    "2f6411b5",
    "057679b7",
    "4bb06d7a"
  ],
  "sources": [
    { "path": "docs/slider-interactions.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "apps/terminal/src/components/trade/components/trade-slider.tsx" },
    { "path": "apps/terminal/src/components/trade/components/trade-slider-view.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-close-dialog-ui.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-size-slider-interaction.ts" },
    { "path": "apps/terminal/tests/browser/trade-size-slider-performance.pw.ts" },
    { "path": "apps/terminal/tests/trade-size-slider-pointer-lifecycle.test.tsx" }
  ],
  "supersedes": []
}
-->
# 滑杆审查：移除平仓弹窗的快捷百分比按钮，修复弹窗打开动画期间拖动被取消，登记其余交互与规范问题

## 背景与范围

同步记录。用户指着平仓弹窗里的 `25% / 50% / 75% / Max` 一排按钮，认为是旧的 UI 方案、可以移除；同时要求审查所有滑杆的性能、交互与代码规范问题，特别点名「滑动滑杆会不会跳回到起点」。任务标识未取得（`thread: null`）。

范围：`TradeSlider` 及其全部使用方——桌面与移动下单的数量滑杆、市价与限价平仓、TP/SL 的数量滑杆、杠杆与保证金模式的杠杆滑杆。工作树 `.claude/worktrees/worktree-05`，分支 `fix/market-close-confirmed-size`，起点 `cd68260a`，开始时工作区干净。本次改了两处代码（移除按钮、修复一个缺陷），其余发现只登记。

## 结论与依据

### 快捷百分比按钮：是旧方案的遗留，已移除

- 这排按钮只存在于两个平仓弹窗共用的 `PositionCloseSizingControls`（`QUICK_PERCENTAGES`），由 2026-08-04 的重设计提交 `928cebf1`、`2f6411b5` 加入。
- 下单表单没有这排按钮，用的是带刻度的滑杆加百分比输入；滑杆自己在 0/25/50/75/100 有刻度（`TICKS`，2026-09-10 的 `178661c3` 加入）。`config/trade.ts` 里的 `ORDER_SIZE_PERCENT_STEPS` 与 `SIZE_PERCENT_OPTIONS` 在整个 `apps/terminal/src` 与 `packages` 里没有任何使用方，是更早的快捷百分比方案留下的死配置。
- 移除后仍能到达每一个取值：拖到或输入 100 即 Max（`handleSliderChange` 与 `handlePercentChange` 都把 100 映射为 `{ kind: "max" }`），百分比输入框接受任意整数。
- 顺带删除那两个死常量。按钮带的任意圆角与 `!bg-modal` 覆盖随之消失，设计令牌棘轮的基线按规则同步调低：任意圆角 227→226，important 表面覆盖 18→14。

### 会跳回起点吗：复现并修复了一个缺陷

`trade-slider.tsx` 在指针按下时记录 `getBoundingClientRect().width`（可视宽度，受祖先 transform 影响），随后用 ResizeObserver 的 `contentRect.width`（布局宽度，不受 transform 影响）与它比较，相差超过 0.5px 就取消手势并恢复到手势起点。桌面弹窗有 200ms 的 `scale-95 → 1` 打开动画（`packages/ui/src/modal.tsx`），动画期间两者不相等。

在登录态的真实页面上复现（1440×900 模拟视口，打开市价平仓弹窗后立刻在滑杆元素上派发 `pointerId=1` 的指针事件）：按下时可视宽度 370.5px、布局宽度 390px；按下后 `data-dragging=true`，80ms 后变为 `false`，拖到 50% 的操作被丢弃，百分比仍是 100。

修复：观察器只拿本次手势收到的第一个 `contentRect.width` 作基线，与之后的布局宽度比较，不再与可视宽度比较。修复后同样的操作：80ms 后仍在拖动，松手后百分比为 50。窗口 `resize` 监听保持不变。单元测试新增「祖先 transform 使可视宽度不等于布局宽度时手势不取消、布局宽度真的变化时仍取消」；把比较改回可视宽度，该用例变红。

### 其余会表现为「跳回」的行为：既有设计，待产品决定

1. **松手吸附到实际百分比**。滑杆位置由「数量 ÷ 最大数量」推导，松手后吸附到手数取整后的实际百分比。最大值相对一手很小时吸附幅度很大：浏览器套件钉住了「最大 0.003、一手 0.001 时按住 63% 或 66%，松手回到 33%」与「点击 20% 提交为 0，滑块回到起点」。官方终端把百分比单独存为状态（`setPercentage` / `percentage`），不从数量反推。当前账户规模下一手约占 0.1%–0.6%，看不出来；极小仓位或极小余额才明显。
2. **取消路径恢复到手势起点**（`docs/slider-interactions.md`）：Esc、滑杆失焦、窗口失焦、页面隐藏、窗口 resize、`disabled` 翻转、身份或取值范围变化。其中 `disabled` 来自数据状态：下单表单是 `!isConnected || isAvailabilityBlocked || availableBalance <= 0 || maxSize <= 0`，平仓弹窗是仓位数据 loading / stale / error。订阅重连或数据短暂失效时正在进行的拖动会被丢弃。
3. **滑块会随行情自己漂移**：下单表单的 `sliderValue = 数量 ÷ 最大数量`，最大数量随价格变化，数量不变时滑块位置缓慢移动。

### 性能

开发构建、实时行情下，在真实页面上用约 16ms 间隔的指针事件慢拖 2.5 秒并逐帧采样：

| 位置 | 帧间隔 p50 / p95 / 最大 | 超过 33ms 的帧 | 长任务 | 拖动中显示过的不同百分比 | 向起点方向的回跳 |
| --- | --- | --- | --- | --- | --- |
| 桌面下单 | 16.7 / 17.6 / 50.1 ms | 5 / 144 | 0 | 78 | 0 |
| 市价平仓弹窗 | 16.7 / 17.2 / 66.7 ms | 4 / 141 | 0 | 75 | 0 |

滑块与刻度由 `requestAnimationFrame` 直接写样式，不经过 React；业务预览单独发布。仓库的浏览器套件 `tests/browser/trade-size-slider-performance.pw.ts` 在本分支 19 项全过（含「每帧父级提交不超过 2 次」「预览次数不超过帧数 + 2」「相邻预览间隔不小于 14ms」）。

**高刷新率下数字会冻住**：预览是「每次移动都重置的 15ms 尾部防抖」（`schedule()` 先清掉未触发的定时器再重设）。实测指针事件中位间隔 6.9ms（120/144Hz 设备的节奏）、持续 1.5 秒从 60% 拖到 10%：拖动中百分比只显示过 1 个值（一直是 60），松手才变成 10；间隔 21.9ms 时显示过 53 个值。松手时会冲刷最终值，提交的数量是对的，问题只在拖动过程中数量、百分比、订单价值不跟手。浏览器套件的「paints a rapid burst without a business preview and flushes the last value on release」钉住了这一行为，属有意取舍（限制 React 提交次数）。改成节流（已有定时器时不重置，让它带着最新草稿值触发）即可在保持不小于 15ms 间隔的同时持续跟手，代价是高刷新率设备上每秒最多约 66 次表单渲染；需要产品与性能预算一起决定，并同步改那条测试。

### 代码规范

- `positions/position-close-dialog-ui.tsx` 一个文件导出 6 个组件和 1 个视图模型工厂，违反「一个文件一个组件」；移除按钮之后文件内仍有 12 处任意 px/rem 值与 13 处 `!` 覆盖（设计稿交接留下的债务，其中圆角、字号与表面覆盖已被棘轮计数）。
- `hooks/trade/use-size-slider-interaction.ts` 手写了 3 个 `useCallback`。项目启用了 React Compiler，规则要求只在语义需要时手写；`TradeSlider` 通过 `latestRef` 读取回调，不依赖回调引用稳定，而且其中一个的依赖含 `sizeInput`，每次输入都会变。
- `config/trade.ts` 的 `ORDER_LEVERAGE_STEPS` 同样没有任何使用方（本次未删，与百分比无关）。
- `trade-slider-view.tsx` 有 4 处任意像素值（`h-[33px]`、`size-[18px]` 等），同属棘轮债务。
- `trade-slider.tsx` 把 `clamp`、`progressFor` 两个纯函数放在组件文件里，按「计算移到 lib」可移出；手势逻辑以闭包形式写在约 300 行的组件体内（全文件 380 行），可读性一般，但 ref 的使用符合滑杆契约「手势几何放在 ref、业务草稿归 React」。
- 未发现：组件内注释、嵌套三元、`type Props`、箭头函数组件、用 effect 推导状态、对数量做浮点乘法（百分比换算在 `domain/trade/order/size.ts` 里用 Big.js，边界处才转成展示用的 number）。

### 交互细节

- 指针到取值的映射用控件全宽，滑块中心却被限制在距两端 9px 以内，所以靠近 0% 与 100% 时滑块最多偏离指针 9px；0 与 100 的刻度点内缩 4px。25/50/75 处对齐。
- 触控：控件上有 `touch-action: none`，隐藏的原生 range 输入提供 44px 的命中区，移动端抽屉通过 `data-base-ui-swipe-ignore` 不把滑杆拖动当作下滑关闭；键盘、RTL、`aria-valuetext` 均有覆盖。

### 更正与后续（2026-09-20，同一会话稍后）

产品负责人看完审查后批示「三项都做，对齐官方实践，先让 codex 审方案」。动手前我读了官方终端前端包里滑杆本身的实现（`config-C5R5bd2i.js`，静态阅读，未经账户实测，Codex 无网络未能复核），结论与上文两处说法不符，在此更正，上文保留原样：

- **上文「官方终端把百分比单独存为状态，不从数量反推」是错的。** 官方的 `xX` hook 在 `setPercentage(p)` 里先按精度向下取整算出数量，随后有一个 effect 在数量、最大可交易量、标记价或限价变化时执行 `setPercentage(prev => prev === null ? null : CX(sz, max, …))`，其中 `CX = sz / (max + 1e-7) * 100`。也就是官方同样吸附到取整后的实际百分比（而且每次发布都吸附，不只在松手时），同样随行情漂移。
- **官方滑杆 `bh` 用的就是每次移动都重置的 15ms 尾部防抖**（`clearTimeout` 后 `setTimeout(…, 15)`），松手时冲刷最终值；高刷新率下数字冻住在官方同样存在。
- **官方滑杆没有任何取消路径，也没有 `disabled`**：没有 `touchcancel`、失焦、resize、visibility、Esc 处理，手势一定以提交最后的值结束。
- 上文「未发现嵌套三元」也不准确：`trade-slider.tsx` 的 `handleKeyDown` 里有一个多行的嵌套三元，我的单行正则没有匹配到。

因此三项里只有「数据状态翻转取消拖动」是我们偏离官方；另外两项我们本来就与官方一致。Codex 对方案的只读评审结论：节流支持做（理由是连续输入下预览饥饿本身就是缺陷，不必借官方证明）；吸附不改成立，但不应说成与官方完全一致，也不应说保留请求值必然违反确认面契约；暂停不能把所有 `disabled` 一概改成暂停，必须区分数据暂不可用与编辑上下文结束，并处理被禁用的原生输入丢焦点、恢复后补发、待触发定时器这三件事。实施结果：

1. **预览改节流**（`057679b7`，有意偏离官方）：已有定时器时不再重置，触发时发布当下的草稿值，相邻预览间隔仍不小于 15ms。两条钉住重置式防抖的单测改写，浏览器套件新增「指针移动快于预览间隔时持续发布」。把写法改回重置式，两条单测变红。
2. **松手吸附**：不改代码。
3. **数据暂不可用时暂停手势**（`4bb06d7a`）：`TradeSlider` 新增可选属性 `paused`，`disabled` 保持「立即取消」的原语义。暂停期间手势存活、滑块跟手、不发布预览、清掉待触发的定时器；恢复后经同一节流定时器补发一次当前草稿（纯静止按压不补发）；仍暂停时松手走取消。手势存活期间隐藏的原生 range 输入用 `aria-disabled` 而不是原生 `disabled`，由组件在每次渲染后与手势结束时写回，否则输入丢焦点会触发失焦取消。桌面与移动下单把「可用性数据被阻塞」传给 `paused`，市价与限价平仓把仓位数据 loading / stale / error 传给 `paused`；关闭、提交阶段、断开、余额或仓位确实为零、已平仓、方向变化仍走 `disabled`。TP/SL 与杠杆弹窗不传 `paused`。
4. 顺带把 `handleKeyDown` 的嵌套三元抽成纯函数 `getKeyboardTarget()`，行为不变。

## 验证与限制

均为 2026-09-20 在本机（macOS）对本分支执行。

- 移除按钮与修复缺陷后的最终工作树：`pnpm --filter @gatu/terminal test` 584 文件通过、1 跳过，6,603 项通过、1 跳过（104 秒）；类型检查、Biome、`git diff --check` 通过；滑杆浏览器套件（`pnpm --dir apps/terminal run test:browser:slider`）19 项通过。移除按钮后的第一次全量运行里设计令牌棘轮因计数下降而变红，调低基线后通过。
- 缺陷的复现与修复验证、两张性能表、高刷新率实测都在登录态的真实页面上完成，事件由脚本派发到真实滑杆元素（内置浏览器的视口模拟会让真实拖动的坐标错位）；移动下单在面板原生宽度下用真实拖动验证过。没有点击任何提交或确认按钮，结束后表单与弹窗恢复原状，持仓数与挂单数不变。本记录不保存账户、余额或仓位明细。
- 性能数字来自开发构建（含 React 开发模式），不能当作生产基线；没有在真实的 120Hz 设备或低端手机上测量。
- 「数据状态翻转取消拖动」只从代码与既有测试得出，没有在真实页面上人为制造断连来复现。
- 官方终端的百分比状态来自对其前端包的静态阅读，未经账户实测。

节流与暂停这一轮（同日稍后，最终工作树）：

- `pnpm --filter @gatu/terminal typecheck` 通过；`pnpm --filter @gatu/terminal test` 584 文件通过、1 跳过，6,613 项通过、1 跳过（95 秒）；Biome 与 `git diff --check` 通过；滑杆浏览器套件 21 项通过（新增「指针移动快于预览间隔时持续发布」与「拖动中途暂停再恢复」两条）。
- 这之前的一次全量运行有 2 项失败：`size-percent-input.test.tsx` 的源码契约钉着旧的 `disabled={isFormDisabled || maxSize <= 0}`，属于本次改动的连带，已改为钉住 `disabled` / `paused` 两个新表达式；`client-bootstrap-error.test.ts` 的一条用例在并行负载下失败，单独运行 4 项全过，下一次全量运行也通过，与本次改动无关，未作处理。
- 暂停语义的单测先红后绿；变异检查：去掉 `finish()` 里的 `!paused`、去掉恢复时的补发、去掉暂停时清定时器、让原生输入在手势存活时仍写原生 `disabled`，对应用例各自变红，还原后逐字节一致。去掉 `armPreview()` 入口的 `paused` 判断是等价变异（定时器回调里有同一判断），没有用例能区分。
- Codex 对暂停实现的只读评审结论是可以提交，三项 P3 均已处理：`finish()` 里的可用性判断漏了 `max` 的有限性检查，改为与渲染期共用 `isRangeUnavailable()`；两条用例名称超过实际覆盖，改为逐个派发失焦、Esc 与 `disabled` 翻转，并补上键盘与原生输入；新增「恢复后不足 15ms 即松手只提交一次、没有迟到的预览」；`docs/slider-interactions.md` 写明取消时恢复什么由调用方决定。Codex 本轮没有运行测试，结论基于静态阅读。
- 限制：暂停只在 Chromium 的浏览器夹具与 jsdom 下验证；「手势存活时原生输入不写 `disabled` 以免丢焦点」在 Safari、Firefox 与真实 iOS / Android 上未验证。没有在真实页面上人为制造断连来观察暂停。
- 评审中登记、未处理的既有风险：手势开始时记录的 `left` / `width` 在祖先缩放动画期间不更新，动画内开始的拖动前 200ms 指针与滑块可能有几个像素的偏差；不可用时外层的 `cursor-not-allowed` 被内层的 `cursor-pointer` 盖住。

## 后续与替代关系

- 不替代任何记录；与同日的 `2026-09-20-market-close-confirmed-size.md` 在同一分支上。
- 待产品负责人决定：预览改节流；松手是否吸附到实际百分比；数据状态翻转时是否丢弃正在进行的拖动；是否拆分 `position-close-dialog-ui.tsx`、去掉多余的 `useCallback`、删除 `ORDER_LEVERAGE_STEPS`。
- 同日已决定并实施：预览改节流、数据暂不可用时暂停手势；松手吸附不改。节流是有意偏离官方的改进，单独成一个提交，可以单独回退。其余三项（拆分文件、`useCallback`、`ORDER_LEVERAGE_STEPS`）仍待决定。
- 下一次先查：`docs/slider-interactions.md`、`tests/browser/trade-size-slider-performance.pw.ts`、`trade-slider.tsx` 的 `schedule()` 与 `finish()`。
