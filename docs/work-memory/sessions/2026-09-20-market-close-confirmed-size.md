<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-20-market-close-confirmed-size",
  "date": "2026-09-20",
  "title": "市价平仓：点击时展示的数量作为执行上限，确认按钮改为静态动词",
  "kind": "task",
  "status": "verified",
  "topics": [
    "market-recovery",
    "docs-governance"
  ],
  "summary": "在 dev 5ea5d625 上用测试复现：确认弹窗展示 2.5，点击后实时仓位在规划前增长到 2.6，Max 意图发出 2.6（50% 展示 1.25 发出 1.3），既有守卫全部通过。按 ADR 0017 修复：按钮改为静态 Market Close，弹窗把该次渲染展示的数量作为必填上限传入提交，重算结果超出即以 close-size-exceeds-confirmed 失败关闭；弹窗期间仓位数量与开窗时不同给出提示；预估盈亏注明不含手续费。新增跨展示与承诺边界的测试和 TradingActionButton 标签契约测试，九个变异体全部被杀死；全量单测、类型检查、两个生产构建通过。确立确认面契约，目前只有市价平仓完整满足。跟进：市价平仓在滑杆手势期间不再把按钮置灰，锁改由 ref 与按钮内的 isActivationLocked 承担；随后按产品负责人的决定，全站六个带滑杆的交易面都去掉了手势期间的可见禁用，只保留提交路径里的锁。",
  "thread": null,
  "baseCommit": "5ea5d625f9e91705aa53d1511419b26d674112d4",
  "commits": [
    "5341c3df",
    "928cebf1"
  ],
  "sources": [
    { "path": "docs/adr/0017-market-close-confirmed-size-ceiling.md" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "docs/adr/0014-market-close-submit-and-dismiss.md" },
    { "path": "docs/mobile-data-presentation.md" },
    { "path": "apps/terminal/src/hooks/trade/use-position-market-close-submit.ts" },
    { "path": "apps/terminal/src/components/trade/positions/position-market-close-modal.tsx" },
    { "path": "apps/terminal/src/lib/tests/position-market-close-display-commit.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/trading-action-button-label-contract.test.ts" }
  ],
  "supersedes": []
}
-->
# 市价平仓：点击时展示的数量作为执行上限，确认按钮改为静态动词

## 背景与范围

同步记录。用户在登录态测试时选中市价平仓弹窗的确认按钮（当时文案为 `Market Close {数量} {币种}`），指出仓位变化和下单状态都绑在这个按钮上，不符合确认控件的做法，要求审查成因；随后要求先看官方终端的做法再规划修复，并批准第一阶段三项（静态按钮、展示量作为执行上限、仓位变化提示），选择保留实时联动而不是改成官方的快照式，要求方案先交 Codex 评审，并说明成因与防范办法。任务标识未取得（`thread: null`）。

范围：市价平仓确认弹窗与其提交流程、相关文档与回归。限价平仓、全部平仓、反手、下单确认的按钮统一，`TradingActionButton` 未就绪态的 `Enable` 文案，下单确认的激进限价警告属于未批准的第二阶段，没有改动。

工作树 `.claude/worktrees/worktree-05`，分支 `fix/market-close-confirmed-size`，起点 dev `5ea5d625`，开始时工作区干净。

## 结论与依据

### 缺陷与复现

弹窗每次渲染用「实时仓位 × 意图」重算数量并显示在输入框和按钮里；点击后提交流程只拿到会话标识，用全新 REST 仓位按意图重算执行量，点击时展示的数量不参与执行。既有守卫只约束执行时刻的一致性。

最初的方案把复现条件写成「实时仓位保持 2.5、REST 返回 2.6」。Codex 评审指出这个构造会被 SDK 边界的 `assertLivePositionMatches`（`|当前仓位| ≥ 平仓量`）拦下，不构成漏洞；成立的时序是实时仓位在规划之前追上。按修正后的时序先写测试、在未改动的实现上运行：

- Max：点击时展示 `2.5`，仓位请求挂起期间把实时仓位与 REST 仓位推进到 `2.600` 后放行，发出 `s: "2.6"`。
- 50%：展示 `1.25`，发出 `s: "1.3"`。

两个用例在未改动的实现上失败（期望零下单，实际下单一次），实现上限后通过。订单是 reduce-only，不会反向开仓。

### 来历

`git show` 可证：首版 `5341c3df`（2026-08-04）的确认按钮是静态的 `Market Close`，当时已按全新快照重算，对应测试「re-resolves Max from the fresh REST position instead of the UI snapshot」出自该提交；同日重设计提交 `928cebf1`（提交信息无正文）把按钮改成带数量的模板，并新增断言按钮文本包含 `Market Close 1.2500 BTC`。此后 `git log 928cebf1..5ea5d625` 对该文件还有 16 次提交，这一关系未变。

可以确定的结构性原因：UI 侧测试钉的是外观字符串，提交侧测试钉的是重算，两者之间没有任何测试跨过「展示 → 承诺」边界；规则里有「执行不得只信任展示值」，没有对偶的「展示值必须约束执行」；这两条测试也不在 CI 的测试清单里。2026-09-17（ADR 0014）与 2026-09-18（弹窗提交审查）两份记录的范围是生命周期、守卫与过渡动画，没有涉及展示与执行的关系；这是从记录范围得出的，不是对当时审查者想法的断言。静态按钮本身不能消除差异——首版同样没有上限。

### 官方做法

本会话对 `app.hyperliquid.xyz` 前端包的静态阅读（未经账户实测，Codex 未独立复核）：平仓弹窗打开时快照 `{coin, szi}`，数量是本地状态；按钮静态 `Market Close`；提交的 `userSz` 与展示的数量是同一变量；提交中只禁用按钮。向官方页面注入只读假钱包以观察界面的尝试被权限系统拒绝，没有绕过。

### 决策与实现

见 [ADR 0017](../../adr/0017-market-close-confirmed-size-ceiling.md) 与[确认面契约](../../confirmation-surfaces.md)。要点：

- 按钮静态 `Market Close`；数量在 `Close size` 输入框，并通过 `aria-describedby` 的 sr-only 描述提供给辅助技术。
- `submit()` 必填 `confirmedCloseSize: string | null`：确认会话必须为正数，直提会话必须为 `null`，`dismissed` 不是合法入口；校验在 `try` 内、取锁之前。重算结果大于上限以 `close-size-exceeds-confirmed` 失败关闭，小于等于放行；固定数量意图不自动缩量。新断言放在既有百分比守卫之后，既有用例的失败文案不变。
- `hasPositionMarketCloseSizeChanged` 纯推导提示，只在可见、可编辑的确认阶段渲染，不参与能否提交。
- 说明区增加 `Estimated PnL excludes fees`。用与摘要相同的类在页面里测量：335px 与 320px 内容宽度下把该说明并入盈亏标签会让 en、hi、fr 截断（es 现状四个标签已全部截断，既有问题，未处理），所以标签不变。
- 四条新文案已补齐 zh、es、fr、hi、ar；用段落解析对比 HEAD 与工作区，未翻译条目数不变（其余未翻译条目在 HEAD 上已存在）。
- `i18n-reactivity-contract` 补登记弹窗与共享尺寸控件。
- `.github/workflows/terminal-tests.yml` 新增一步运行六个相关测试文件；按 CI 的 `--maxWorkers=1` 本地计时约 14 秒。

### Codex 方案评审（`gpt-6-astra`，只读，medium）

结论「需要先改这几处再实施」，全部采纳：纠正复现时序；A5 矩阵比较的是重算后的订单量与展示量，而不是 REST 仓位与展示量；入口校验必须在既有 `try` 内，否则绕过通知与会话释放；提示限定在 `confirmation` + `idle` + 未关闭；失败文案不能沿用「Close and reopen it」（点击即关之后弹窗已经关闭）；补无障碍描述；不含手续费放说明区而不是标签；契约测试命名为 TradingActionButton 标签契约，不声称覆盖所有确认面（发送、划转等使用普通 `Button`）；补 i18n 登记；提交钩子经 `positions-tab.tsx` 静态可达，需要生产构建验证预算；根因记录区分证据与推断。

### Codex 实现审查（同一模型，只读，对未提交的工作树）

结论「核心执行上限实现未发现 P0/P1 缺陷，修完这几处再提交」。它确认：只有 `direct + null` 无上限；双击、对账、偏好保存、会话替换、语言切换重渲染都不能放宽或刷新上限；`"Infinity"`、全角数字在取锁前被拒，`"1e-7"` 与带空白的数字按精确正数接受，不会退化为无上限；上一轮意见均已落实。它指出并已修复的问题：

- P2：标签契约的 AST 扫描只登记裸变量，`{position.size}`、`{formatSize(size)}` 这类表达式会漏过。已改为属性访问、元素访问、非翻译函数调用和其他未知表达式一律按源码文本登记，并为扫描器本身增加 19 个用例。
- P2：ADR 引用的任务记录不存在——审查开始时本记录尚未写完，现已入库并建索引。
- P3：确认面文档把跨边界测试写成「只在网络与 SDK 边缘打桩」，实际还替换了 `@gatu/ui` 外壳、`NumberInput`、滑杆、`TradingActionButton` 与数据 hook；已改为如实列出替身和它不能证明的范围。「新增或移除一个按钮必定失败」改为按文件聚合的准确说法。
- P3：Changelog 把「仓位增长就不平仓」说得过宽（固定数量在仓位增长时照常执行），已改为以重算结果是否超过展示量为准。
- P3：`AGENTS.md` 里「目前只有市价平仓满足」属于会过期的状态，已移回归属文档，规则只要求先查覆盖清单。

它没有重跑测试、构建或浏览器验证，下表的结果是本次执行的，不是独立复核。

### 跟进：用户看到按钮里仍有数量，并指出拖动滑杆时按钮变灰

用户在浏览器面板里选中确认按钮（文案 `Market Close 0.87 HYPE`，`aria-describedby` 只有一个 id，说明区只有一行）询问为什么仍有数量、滑动时按钮变灰并更新数量。

- **仍有数量的原因**：上一轮目检后我把 3005 端口的开发服务器还原成了主检出（`dev` `5ea5d625`），修复只在本分支，用户看到的是修复前的代码。`lsof` 确认监听进程目录为主检出；选中元素的属性与旧代码一致。本轮把服务器改为指向本工作树（同源，沿用登录会话）并保持运行，页脚版本为 `30F248D0`。
- **变灰**：这是全站既有做法。「手势期间锁定提交」来自[滑杆交互契约](../../slider-interactions.md)；桌面下单 `trade-panel.tsx:888`、移动下单 `mobile-trade-view.tsx:768`、限价平仓 `:186` 与市价平仓都让按钮在手势期间禁用。**我最初向用户和文档里写的「主下单表单只用 ref、按钮外观不变」是错的**，原因是检索模式漏掉了 `isSizeInteracting`；Codex 审查指出桌面下单的反例，我复核时发现移动下单同样置灰，已更正三处文档。
- **改动**（应用户对本弹窗的要求）：删除 `isSizingInteractionActive` 状态，`canSubmit` 不再含手势项；锁保留为 ref，`handleSubmit()` 里拦截，并经 `TradingActionButton` 新增的可选属性 `isActivationLocked` 在按钮内部最先检查。后者来自 Codex 的 P2：未就绪时按钮走 `enableTrading()` 分支、不经过 `handleSubmit()`，旧的可见禁用原本顺带挡住了它。其余九个调用方不传该属性。
- **没有卡锁风险**：`trade-slider.tsx` 的所有结束路径（pointerup、pointercancel、lostpointercapture、窗口失焦、页面隐藏、resize、disabled/identity/方向变化、卸载）都进入 `finish()` 并调用一次 `onInteractionEnd`，既有生命周期测试覆盖；会话以 `key={sessionId}` 重挂载，ref 不跨会话。
- **边界**：焦点离开滑杆会取消手势并恢复起始值，此后的确认针对当时屏幕上已恢复的值，仍受上限约束。另外三个交易面未改，四个面暂时不一致，登记在确认面契约里等产品决定。

验证（本轮，对未提交的工作树）：`pnpm --filter @gatu/terminal test` 584 文件通过、1 跳过，6,596 项通过、1 跳过（144 秒）；类型检查与 Biome 通过；相关测试 4 文件 91 项通过；变异自检两条——删 `handleSubmit()` 的 ref 守卫 4 项变红，删按钮内的锁检查 2 项变红；真实指针拖动目检：安装逐帧采样器后用真实拖动把滑杆从 100% 拖到 41%，839 帧里按钮 `disabled` 与 `data-disabled` 均为 0 次、背景色唯一、文案恒为 `Market Close`，未点确认，Esc 关闭后仓位数、通知数不变。第一次用合成 PointerEvent 的尝试没有触达滑杆控件（拖动标记未出现、百分比未变），结果无效，已弃用。

本轮没有重跑生产构建：改动落在 `trading-action-button-*` 与 `position-market-close-modal-*` 两个独立 chunk（用上一轮 true/true 产物核对），都不属于按面预算的条目，总预算当时余量约 50 KB；且此刻工作树里有供开发服务器使用的 `.env.local` 软链，重建产物会与 CI 的无 env 条件不同。

### 跟进：用户追问「拖动期间禁用提交按钮是不是过度设计」

取证：可见禁用与 ref 守卫同出自 `178661c3`（2026-09-10，滑杆交互重构，提交信息无正文），书面理由只有滑杆交互契约里的一句话，没有记录对应过真实事故。它防的是「提交一个可能被回滚、也可能落后于滑块位置的预览值」（预览 15 ms 防抖发布，松手才提交，Esc/失焦/取消会回滚）。同一指针、键盘在实际操作中都到不了提交按钮，第二根手指通常也不会产生 `click`（未在真机验证）。结论写入[确认面契约](../../confirmation-surfaces.md)的待决事项：ref 守卫保留，可见禁用是过度设计，建议另外三个交易面一并去掉；因涉及主下单表单，等用户确认后另行实施。本次只改文档，未改这三个交易面的代码。

### 跟进：全站去掉滑杆手势期间的可见禁用

用户确认「三处都去掉可见置灰，对齐 app.hyperliquid.xyz/trade/HYPE 的做法」。

- **官方取证**（本会话对官方前端包 `config-C5R5bd2i.js` 的静态阅读，未经账户实测）：主下单表单的禁用标志 `pt = b===0 || at || nt===0 || Number(f)===0 || MJ(De)&&f===void 0 || rt&&(We===void 0||We===0) || De==="scale"&&L.length===0 || De==="twap"&&!AY(he) || De==="trailingStop"&&(…)`，其中 `b` 是滑杆百分比、`at` 是超量或余额不足、`nt` 是币本位数量、`f` 是限价；它原样作为 `tradeDisabled` 传给按钮组件 `JQ`，`JQ` 内没有任何 drag 相关代码。平仓按钮与杠杆确认（`disabled:(u??0)===0`）同样没有手势项。
- **清点方法的教训**：我前两次按变量名检索，先漏了 `isSizeInteracting`，又漏了 `isAmountInteracting` 与杠杆的拖动草稿。这次改为从 `TradeSizeSlider` / `TradeSlider` / `LeverageSlider` 的使用方和 `on*Interaction*`、`onDraftChange` 的接线逐个排查，得到完整的六个面；改完后再按「`disabled` / `canSubmit` 表达式里出现 interact、drag、draft」的模式扫描，没有剩余。
- **改动**：桌面下单、移动下单删除 `isSizeInteracting`；限价平仓删除 `isSizingInteractionActive` 并传 `isActivationLocked`；TP/SL 删除 `isAmountInteracting`，沿用 `handleSubmit()` 里已有的 `amountInteractionSnapshotRef` 守卫；杠杆弹窗的 `disabled` 去掉 `dragLeverage !== null`；保证金模式弹窗的 `disabled` 把 `hasLeverageDraft` 换成 `submittedLeverage !== null`（拖动草稿在那里同时充当「已提交杠杆」标记，要保持提交期间外观不变）。六个面的提交路径守卫都没有动。
- **测试**：订单表单此前对手势锁没有任何测试，补了 `order-submission-wiring.test.ts` 的源码契约和 `tests/mobile-trade-size-validation-a11y.test.tsx` 里真实移动下单表单 + 真实滑杆指针事件的用例；限价平仓、TP/SL、杠杆、保证金模式的用例从「手势期间按钮禁用」改为「按钮不禁用、点击被忽略、结束后可提交」。桌面下单表单没有渲染级单元测试（仓库一直如此，只有源码契约与浏览器夹具）。
- **Codex 只读审查**（对未提交的工作树，未发现 P0/P1）：P2，桌面下单按钮原先的可见禁用顺带挡住了按钮的全部动作，去掉后「启用交易」的授权分支在手势期间不再受锁——两个下单表单都加了读取同一 ref 的 `handleCtaClick()`，并补了真实移动下单表单上「手势中点 Enable Trading 不触发授权、结束后触发一次」的用例；P2，杠杆与保证金模式的锁读的是渲染闭包里的 state，同一调用栈里「开始手势 → 立刻激活」读到旧值（改动前就存在的缺口）——改为手势回调里同步维护的专用 ref，并补了同一个 `act` 内的用例；P3，文档把同步性与「只由提交内容决定禁用」写得过满，已改准确。它还确认没有遗漏的第七类交易面，保证金模式换用 `submittedLeverage !== null` 后各状态外观不变。
- **变异自检**（改完即逐字节还原）：删除移动下单、桌面下单、限价平仓、TP/SL、杠杆、保证金模式各自的守卫；把置灰接回桌面下单和杠杆弹窗；让移动下单的 `handleCtaClick()` 不读 ref、让桌面按钮绕过它；去掉两个杠杆弹窗的同步 ref。共十二个变异体，全部被至少一个测试杀死。
- **验证**（对未提交的最终工作树）：`pnpm --filter @gatu/terminal test` 584 文件通过、1 跳过，6,602 项通过、1 跳过（92 秒）；类型检查、Biome、`git diff --check` 通过。没有重跑生产构建：改动落在订单表单与各弹窗自身的 chunk 里，删掉的是 state，净增量是两个三行函数与几个 ref。
- **浏览器目检**（预览服务器指向本工作树，登录态，未点击任何提交、确认或启用按钮，检查后表单与弹窗均恢复原状，持仓数与挂单数不变）：
  - 桌面下单（1440×900 模拟视口）：数量为零时按钮禁用（内容原因）；按住滑杆拖到 40% 时按钮已可用，第二次从 41% 拖到 68% 全程 `disabled=false`、颜色不变。视口模拟会让工具的真实拖动坐标错位（指针事件落到视口外，未触达任何控件），所以这一项改用在真实滑杆元素上派发 `pointerId=1` 的 PointerEvent 驱动，走的是组件真实的处理函数。
  - 限价平仓（同上方式）：填入 Mid 价格后按住并拖到 50%，确认按钮全程 `disabled=false`、背景色不变；Esc 关闭。
  - 移动下单（面板原生宽度 658，工具的真实拖动）：逐帧采样 33 帧，拖动中的帧里按钮禁用次数为 0、背景色唯一。
  - 市价平仓已在上一轮用真实拖动验证。TP/SL、杠杆、保证金模式三个弹窗**没有**做浏览器目检（它们的确认会真实下单或改杠杆，只由单元测试与变异自检覆盖）。

## 验证与限制

均为 2026-09-20 在本机（macOS）对工作树未提交改动执行。

| 检查 | 结果 |
| --- | --- |
| 新用例在未改动实现上 | 9 项失败（2 项为上限缺失的复现，7 项为入口规则），其余通过 |
| 相关六个测试文件（`--maxWorkers=1`） | 6 文件 189 项通过（实现审查后扫描器用例从 22 增至 41）；跟进改动后见下方全量结果 |
| `pnpm --filter @gatu/terminal test` | 584 文件通过、1 跳过；6,574 项通过、1 跳过；153 秒。在实现审查的修订之前执行；之后只改了标签契约测试与文档，单独重跑了该文件 |
| `pnpm --filter @gatu/terminal typecheck` | 通过 |
| Biome（全部改动的 ts/tsx） | 通过 |
| `node --test scripts/ci-workflows.test.mjs` | 6/6 |
| i18n 两组回归 | 2 文件 136 项通过 |
| 生产构建，Node 22.15.0，无 env 文件，false/false 与 true/true | 均 exit 0（含 chunk 环、体积预算、预加载注入、内联脚本哈希、head 擦除）；true/true 的 `trade-terminal-page` 126,044 字节 gzip，上限 127,242，余量 1,198；改动前同口径为 126,050 |

变异自检（改完即还原，逐字节核对，未入库）：删除上限断言；`gt`→`gte`；`gt`→`lt`；弹窗漏传上限；弹窗传整仓而非展示量；入口规则忽略会话 presentation；把数量放回按钮；提示不限可见确认阶段；入口校验移出 `try`。九个变异体都被至少一个测试杀死；「把数量放回按钮」同时被标签契约测试杀死。

浏览器目检：把开发服务器临时指向工作树并保持同源（3005 端口）以沿用已有登录会话，检查后还原为主检出的服务器并移除临时的 env 软链。桌面（1426 宽）与移动（375×812）下用真实仓位打开弹窗：按钮为静态 `Market Close`，无障碍描述为「Close size: … / Click to submit …」，移动端四项摘要无截断，两行说明无溢出，按钮完整可见，页面无横向滚动。点击前确认浏览器里没有 `gatu:position-market-close-confirmation` 键；没有点击任何确认、提交或签名按钮，弹窗均用 Esc 关闭，前后仓位数、通知数、打开的弹窗数不变。本记录不保存账户、余额或仓位明细。

限制：

- 「仓位数量与开窗时不同」的提示和越界拒绝没有在真实账户上触发过（需要真实成交），只有自动化测试覆盖。
- 目检只在深色主题、英文、一台 macOS 上的内置浏览器进行；其余五种语言的弹窗没有目检，说明区是居中可换行的文本，没有测量它在各语言下的行数。
- 契约的精确含义是触发提交事件的那一次已提交渲染所展示的数量；按下到松开之间的更新不在保证范围内。
- 标签契约测试只覆盖渲染 `TradingActionButton` 的十个文件，经由变量给出的名称靠登记与人工审查。
- 没有运行 Playwright 浏览器套件；改动不涉及它们覆盖的布局契约。
- CI 上新增的步骤尚未实际运行过。

## 后续与替代关系

- 不替代任何记录；补充 ADR 0014 及其任务记录。
- 待产品负责人决定的第二阶段：其余确认面的「展示 → 承诺」核对与按钮统一（全部平仓的按钮名称仍含实时仓位数）、`TradingActionButton` 未就绪态、下单确认的激进限价警告。清单在[确认面契约](../../confirmation-surfaces.md)的「尚未核对或已知例外」。
- es 语言下移动端摘要四个标签全部截断，是既有问题，未处理。
- 下一次先查：`docs/confirmation-surfaces.md` 的审查清单、ADR 0017、`position-market-close-display-commit.test.tsx` 的时序构造。
