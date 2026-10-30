<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-30-p1-order-modify",
  "date": "2026-10-30",
  "title": "第一批 P1 改单：本终端带 client order id 的订单可改，限价单可改价格",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "order-entry"],
  "summary": "全功能审查第一批的第六组（B3）。本终端下的每笔订单都由 trackOrderRequest 带 cloid，而改单规则对非空 cloid 一律拒绝，所以桌面没有编辑按钮、手机改单只报不能修改。现在合法的 cloid（0x 加 32 位十六进制）不再拦截，格式不对仍失败关闭；按官方做法以 oid 改单、替换订单不带 c。限价单新增改价：领域层 limitPrice 字段（新价必须已在最小变动单位上，否则 invalid-price；与原价相同为 no-change），桌面价格单元格行内编辑，手机改单弹窗增加价格输入，可与数量一起改成一笔替换；待确认记录与对账增加原价与期望价。触发单仍不开放（需要 SDK 的 always-place）。未推送。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/src/domain/trade/open-order-modification.ts"},
    {"path": "apps/terminal/src/domain/trade/open-order-modification-form.ts"},
    {"path": "apps/terminal/src/components/trade/order-reconciliation.tsx"},
    {"path": "docs/trading-toolbar-redesign.md"}
  ],
  "supersedes": []
}
-->
# 第一批 P1 改单

## 背景与范围

同步记录，未取得任务标识。全功能审查（`2026-10-30-full-feature-audit`，在 `claude/p1-order-safety` 分支上）第一批的第六组：B3。分支 `claude/p1-order-modify`，基于 `dev` `d99c2bc9`，与其他组互不依赖。

## 结论与依据

- **官方依据（2026-10-30 抓取的前端包）。** 官方改单发送单个 `modify`：`oid` 为原订单号，新订单由 `s5({asset, isBuy, limitPx, sz, reduceOnly, orderType})` 生成，未传 `cloid` 时不带 `c`，`a: true`；成功以交易所答复为准。官方订单表可改价格与数量。
- **根因。** `getOrderShapeBlockReason` 对非空 `cloid` 返回 `client-order-id`。本终端的订单都由 `trackOrderRequest` 补上 `cloid`，于是所有本终端订单都不能改。原设计在 `docs/trading-toolbar-redesign.md` 写明「对带 client order id 的订单不提供直接改单」，本次改为允许并同步文档。
- **cloid。** 合法 `cloid` 放行，格式不对或缺字段仍是 `invalid-order-shape`；`client-order-id` 原因与两处提示文案删除。替换订单沿用官方做法不带 `c`；改单对账本来就按 `oid` 与数量、触发价比较，不依赖 `cloid`。
- **限价改价。** `OpenOrderModifyField` 增加 `limitPrice`，只对普通限价单开放；新价经 `normalizePriceExactly` 必须恰好在最小变动单位上，否则 `invalid-price`，等于原价为 `no-change`，数量与 TIF 保持原值。`invalid-price` 的提示由「触发价」改为通用的「价格」措辞（三条新文案补齐六种语言）。
- **界面。** 桌面价格单元格增加编辑按钮与行内编辑（与数量相同的交互与焦点返回）；手机改单弹窗对限价单增加「价格」输入，价格与数量可在一笔替换里同时修改（`buildOpenOrderModifyFormPlan` 合并两个字段）。未传价格时视为未改。
- **对账。** 待确认记录增加 `originalLimitPx` 与 `expectedLimitPx`；确认要求快照里的价格等于期望价，价格被别处改动判为失败，仍是原价时继续等待。审查后改为只等用户改动过的字段（见下文「Codex 推送前审查与修复」）。
- **未改。** 触发单改单仍不开放（替换需要 SDK 的 `a: true`，可能在撤单失败时也下新单），与原设计一致。改单后交易所是否保留原 `oid` 未在真实环境验证，沿用现有对账的假设。

## 验证与限制

- 新增测试：`open-order-modification.test.ts`（带 cloid 订单可改且替换不带 `c`、改价的合法与非法与不变、非限价单无改价）、`open-order-modification-form.test.ts`（既有用例补 `normalizedLimitPrice`）、`order-reconciliation.test.tsx`（改价确认、别处改价判失败、原价继续等待）、`desktop-orders-cancel-all.test.tsx`（带 cloid 订单显示编辑按钮，改价提交的新订单价格正确、不带 `c`，待确认记录带原价与期望价）、`mobile-order-modification.test.tsx`（价格与数量一笔替换、非法价格标红并禁用提交）。原「client-id 订单被拦截」断言改为合法 cloid 放行、格式错误仍拦截；待确认记录相关测试夹具补 `originalLimitPx`。
- 变异：重新拦截 cloid、去掉改价分支、对账忽略价格、桌面隐藏改价按钮、手机不传价格、表单合并时丢掉数量，各自让对应测试失败，均已还原。
- 第一次全量（`7831e8cf`）另有两项契约失败，都由本组新增界面触发、已修：`mobile-input-zoom-contract` 按输入个数统计手机改单弹窗的 iOS 安全字号（新价格输入同样用 `text-base`，计数由 2 改为 3）；`design-token-ratchet` 发现新增的两处任意圆角（照抄相邻元素的 `rounded-[4px]`、`rounded-[10px]`），改用同像素的命名档位 `rounded-8`、`rounded-20`。
- 全量（测试工作树，`ae3a39da`）：9281 通过，1 失败为沙箱内已知的 `vite-development-cache`（EPERM）。未做：真实账户改单（需要签名，属运营方操作）、真机。

## Codex 推送前审查与修复

- 只读审查（`gpt-6-astra`，low）审 `ae3a39da`（范围 `d99c2bc9..ae3a39da`）：2 项 P2，评分 8.0。逐条核对后都成立，已修：
  - **手机只改价、之后部分成交，会被误报为改单失败。** 手机的待确认记录不论是否改了数量都带 `expectedSize`（当时的剩余数量），对账要求快照里的剩余数量与它相等。改价生效后成交一部分，剩余数量变小，结果判为「订单在确认前被改动」。表单计划新增 `expectation`，只含真正改动的字段的期望值，手机按它登记，与桌面行内编辑一致。数量与价格一起改、替换后又部分成交时，快照显示新价格、剩余数量低于新数量：替换后成交与别处改单都能解释，对账不再判失败，等超时转为未确认（`mayBeReplacementReducedByFills`）。剩余数量高于新数量（成交只会减少数量）仍判失败。
  - **改价的关键分支与执行边界缺少测试。** 新增：手机只改价的完整提交（载荷、只等新价格、点击即关闭、按钮名称不变）；SDK 边界只篡改载荷的 `p` 时拒绝且零广播；参数比较只改 `p` 时返回不等；表单只改价、两项都改、等于原价三种计划的期望值（精确比较）；对账的三种时序（只改价后部分成交确认成功、两项都改后部分成交保持未确认、只有价格生效判失败）。
- 变异：手机恢复登记全部字段、表单总带数量期望、去掉成交容忍、对账改为任一字段匹配即成功、参数比较去掉价格、只改价时要求有数量计划、改价提交期间弹窗保持打开，各自让对应新测试失败，均已还原。
- 修复后全量（测试工作树，`501a4208`）：9287 通过，1 失败为沙箱内已知的 `vite-development-cache`（EPERM）。第二轮只读窄审（范围 `ae3a39da → 501a4208`）：两项旧发现都已修，未发现新问题，评分 9.0。审查方另注明：新增的部分成交用例手动标记未确认，直接证明的是未确认后的释放路径，15 秒超时转换仍靠既有计时测试；恰好留下「新价格、低于新数量」的外部修改会归入未确认，与本文登记的保守判定一致。

## 按官方实践处理的待定事项

运营方授权按官方实践决定后（决定表见 `claude/p1-order-safety` 分支审查记录「2026-10-30 按官方实践处理的待定事项」），本分支放开只减仓触发单的改单：

- 官方前端包的改单动作一律带 `a: true`（`{type: "modify", oid, order, a: true}`），触发单可改。SDK 注释：`a: true` 撤原单失败也照样下新单；省略时新单必须是非触发的 `Alo` 或不会立即成交的 `Gtc`。
- 决定：只对不分组、不是仓位 TP/SL 的只减仓触发单照做（形状规则本来就只接受只减仓触发单，只是被一条总闸拦着）。原单若在改单途中已经触发，`a: true` 照样下的新单也是只减仓，开不出第二个仓位。能开仓的触发单改返回 `unsupported-order-type`，界面提示撤单重下；限价单的替换不带 `a`，保持交易所默认的保护。
- 实现：`buildExchangeOrder` 对触发单返回 `{ modifies, a: true }`，表单合并时保留 `a`，参数比较本来就比较 `a`。桌面行内编辑与手机改单弹窗的触发价输入原有，现在对这类订单开放。
- 测试与变异：去掉 `a`、表单合并时丢掉 `a`、放开能开仓的触发单、限价替换也带 `a`、参数比较忽略 `a`，五个变异各自让对应测试失败，均已还原。组件测试需要实时标记价才能校验触发方向：两个测试文件的行情桩加了 `markPriceLive` 开关，默认关，与原先一致。
- 只读审查（`gpt-6-astra`，low）审 `4dfc2662`：无 P0/P1，3 项 P2，评分 8.0；没能证伪「替换单开不出第二个仓位」（载荷保留 `r: true`）。已修：
  - **手机改单弹窗的触发价框写死了单位「USDC」。** 这段代码原本就有，放开触发单后才走得到；非 USDC 报价的 HIP-3 市场会显示错误单位。去掉这个单位，与同一弹窗里的价格框一致。
  - **触发单的完整替换载荷没有被钉住。** 补四种类型、买卖两侧的完整载荷：市价触发单的保护价随触发价重算（买入 112 → 123.2，卖出 95 → 85.5），限价触发单保留原价；只改数量时价格与触发价都不变。
  - **行情桩永远新鲜，没覆盖方向错误与行情失效。** 补错误方向、等于标记价、没有标记价时拦截的领域用例；补桌面在点击后、SDK 守卫前行情失效时零广播的用例；补对账的触发价三种结果，以及「数量低于期望但触发价不是请求值」不按成交容忍。
  - 六个对应变异（市价触发单不重算价格、方向校验恒真、桌面取用过期标记价、对账忽略触发价、成交容忍忽略触发价、弹窗重新写死单位）都被新测试抓到，均已还原。全量（测试工作树，`4dfc2662`）：9291 通过，1 失败为沙箱内已知的 `vite-development-cache`（EPERM）。

## 后续与替代关系

- 触发单改单已按官方实践部分放开（见上文「按官方实践处理的待定事项」）；`a: true` 替换在交易所的实际表现（含改单后 `oid` 是否保留）未在测试网验证，需要运营方签名。
