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
- **对账。** 待确认记录增加 `originalLimitPx` 与 `expectedLimitPx`；确认要求快照里的价格等于期望价，价格被别处改动判为失败，仍是原价时继续等待。
- **未改。** 触发单改单仍不开放（替换需要 SDK 的 `a: true`，可能在撤单失败时也下新单），与原设计一致。改单后交易所是否保留原 `oid` 未在真实环境验证，沿用现有对账的假设。

## 验证与限制

- 新增测试：`open-order-modification.test.ts`（带 cloid 订单可改且替换不带 `c`、改价的合法与非法与不变、非限价单无改价）、`open-order-modification-form.test.ts`（既有用例补 `normalizedLimitPrice`）、`order-reconciliation.test.tsx`（改价确认、别处改价判失败、原价继续等待）、`desktop-orders-cancel-all.test.tsx`（带 cloid 订单显示编辑按钮，改价提交的新订单价格正确、不带 `c`，待确认记录带原价与期望价）、`mobile-order-modification.test.tsx`（价格与数量一笔替换、非法价格标红并禁用提交）。原「client-id 订单被拦截」断言改为合法 cloid 放行、格式错误仍拦截；待确认记录相关测试夹具补 `originalLimitPx`。
- 变异：重新拦截 cloid、去掉改价分支、对账忽略价格、桌面隐藏改价按钮、手机不传价格、表单合并时丢掉数量，各自让对应测试失败，均已还原。
- 第一次全量（`7831e8cf`）另有两项契约失败，都由本组新增界面触发、已修：`mobile-input-zoom-contract` 按输入个数统计手机改单弹窗的 iOS 安全字号（新价格输入同样用 `text-base`，计数由 2 改为 3）；`design-token-ratchet` 发现新增的两处任意圆角（照抄相邻元素的 `rounded-[4px]`、`rounded-[10px]`），改用同像素的命名档位 `rounded-8`、`rounded-20`。
- 测试与检查结果见下方补记。未做：真实账户改单（需要签名，属运营方操作）、真机。

## 后续与替代关系

- 触发单改单需要「先撤再下」或接受 `a: true` 的风险，留给运营方决定。
