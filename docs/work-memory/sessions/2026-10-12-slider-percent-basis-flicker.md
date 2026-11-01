<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-12-slider-percent-basis-flicker",
  "date": "2026-10-12",
  "title": "拖动数量滑杆时个别交易对数量闪烁：手势期间冻结百分比计算基准",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry"],
  "summary": "手势期间冻结百分比计算基准已随 p31 发布；PR #104 撤回普通报价币订单固定基础币来源的改法，保留显示的报价金额，按实时价格换算基础币；Reduce Only 仍保持持仓约束的基础币来源。PR #106 已把对应测试补入 CI，真人原场景拖动验收仍缺。",
  "thread": null,
  "baseCommit": "2eeec75d",
  "commits": ["dadaa905", "c5096613", "2fb0e907"],
  "sources": [
    {"path": "apps/terminal/src/hooks/trade/use-order-entry-data.ts"},
    {"path": "apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx"},
    {"path": "apps/terminal/src/components/trade/tradebox/trade-panel.tsx"},
    {"path": "apps/terminal/src/domain/trade/order/size.ts"},
    {"path": "apps/terminal/src/lib/tests/order-entry-percent-basis.test.tsx"},
    {"path": "docs/slider-interactions.md"}
  ],
  "supersedes": []
}
-->
# 拖动数量滑杆时个别交易对数量闪烁：手势期间冻结百分比计算基准

## 背景与范围

用户在手机 Trade 页（HYPE，Available 2.69 USDC，Size 0.24 HYPE，滑杆 77%）报告「个别交易对在滑动滑杆时数字变化不够稳定、会闪烁」，要求审查相关代码。本记录为同步记录，未取得任务标识。工作树 `.claude/worktrees/slider-basis`，分支 `claude/slider-percent-basis`，起点 `origin/dev` `2eeec75d`。

## 结论与依据

- 滑杆本身（`TradeSizeSlider`、`docs/slider-interactions.md` 的调度规则）没有问题：拖动中拇指由手势草稿持有，每 15ms 节流发布一次业务预览。
- 缺陷在预览的业务计算：`useOrderEntryData.applySizePercent` → `getSizeForPercent` 每次都读取**当时**的 `derived.maxSize`（永续来自 `useAssetLeverage` 的 `maxTradeSzs`，即 `activeAssetData` 订阅，随标记价每个 tick 更新）和 `conversionPrice`（标记价或限价）。拇指不动时连续预览仍会因 maxSize 的微小变化得到不同的数量；`formatSizeValue` 按 `szDecimals` 向下取整后，在一手占可开数量比例大的交易对上（HYPE：手 0.01、最大约 0.31，一手≈3%）就在相邻两档之间翻，表现为闪烁。BTC 等一手占比极小的交易对几乎看不出来，所以是「个别交易对」。
- 修复（`use-order-entry-data.ts`）：新增 `beginSizePercentGesture` / `endSizePercentGesture`，在 `onInteractionStart` 捕获 `{maxSize, price, spotBalance, szDecimals, sizeMode, reduceOnlyMaxBase}` 到 ref，手势内 `getSizeForPercent` 与 Reduce Only 选择都用该基准，`onInteractionEnd` 释放。`mobile-trade-view.tsx` 与 `trade-panel.tsx` 的 `handleSizeInteractionChange` 接入。提交的数量等于最后预览的数量；校验与执行守卫仍读实时最大值，长时间拖动期间最大值下降会在松手后显示余额不足而不是悄悄缩单。
- PR #102 Codex 机器人 P2（成立）：报价币模式下只冻结了显示串，`deriveOrderEntry` 仍用实时价把它换回基础币，提交数量会随 tick 漂移。修正：普通订单的报价币百分比选择也像 Reduce Only 一样记录由冻结基准算出的基础币 `sizeSource`，`selectedBaseSize` 对普通订单生效；新增报价币用例（价格 86.88→90，手势内 20.73 / 0.23 不变，结束后 21.48 / 0.23）。CI 的 `order-submission-wiring` 源码契约要求 `handleSizeInteractionChange` 体只有 ref 赋值，已放宽为「ref 赋值必须是第一条语句」。
- 键入百分比、Max 按钮和下一次手势仍用实时数据；身份（市场/方向/模式/杠杆）变化会取消手势并释放基准。
- 文档：`docs/slider-interactions.md`「Quantity and execution boundaries」新增一段，`AGENTS.md` 滑杆契约补一句，CHANGELOG Unreleased/Fixed 记录。

## 验证与限制

版本：`2eeec75d` 加本工作树改动，Node 24.15.0，pnpm 10.21.0。

- 新增 `src/lib/tests/order-entry-percent-basis.test.tsx`：真实 `useOrderEntryData`（模拟钱包、余额、杠杆与下单 store），HYPE 永续 `szDecimals=2`、`maxTradeSzs` 0.31→0.33：手势内 77% 两次都得 `0.23`，结束后 `0.25`；手势外直接随实时值变化。变异检查：把捕获改成 `null` 后第一项失败，恢复后通过。
- `vitest run`：新测试、`trade-form-fields-order-entry-data`、`order-entry`、`open-interest-cap-hooks`、`mobile-trade-size-validation-a11y`、`trade-panel-open-interest-cap`、`use-size-slider-interaction`、`trade-size-slider`、`trade-size-slider-pointer-lifecycle`、`slider-effective-leverage-regression`、`i18n-reactivity-contract` 共 11 文件 454 项通过（两个模拟 `useOrderEntryData` 的测试补上了新函数桩）。
- `pnpm --filter @sairn/terminal typecheck`、Biome 通过；`memory:index` / `memory:check` / `git diff --check` 通过。
- 未做：真机或真实鼠标拖动验收（需要有余额的账户；按滑杆契约，脚本注入事件不能证明物理输入路径）；Playwright 滑杆浏览器套件未运行。

## 后续与替代关系

2026-10-12 更正：上文「报价币百分比选择也记录冻结基准算出的基础币 `sizeSource`」一项已在同日撤回，原因与取证见 [Codex CLI 补审记录](2026-10-12-codex-cli-review-followups.md)。

补充 [slider-interactions](../../slider-interactions.md) 与 2026-09-20 的滑杆复盘，不替代。合入 `dev` 后随下一次发布上线；请报告人在 HYPE 等小最大值交易对上实际拖动确认。

## 周整理补注（2026-10-12）

PR #102 已合入查询时 dev，head c5096613 包含报价币模式基础币冻结的后续修正；该 head 不在查询时 main ff11eee5，因此 p30 不包含本修复。真实手指/鼠标拖动及报告者原场景验收仍未完成。

本补注为事后核对，原正文、失败与验证版本保留。本轮只核对 Git、任务记录和相关当前规范；来源执行结果不视为本次重跑。查询时间与实际 head 见[本周整理](2026-10-12-weekly-memory-review.md)。

## 周整理补注（2026-10-19）

本记录 10-12 周补注写到的 c5096613 固定普通报价币基础币来源方案，已被同日 2fb0e907 局部撤回；该哈希仍可达不能说明该行为仍采用。现行 docs/slider-interactions.md 与 use-order-entry-data.ts 一致：普通报价币以显示金额为承诺，只有 Reduce Only 保留 selectedBaseSize。p31 来源已交付相关修复，p32 延续；不重做或声称完成物理拖动验收。

后续来源：[2026-10-12-codex-cli-review-followups](2026-10-12-codex-cli-review-followups.md)；[2026-10-12-cloudfront-release-p31](2026-10-12-cloudfront-release-p31.md)。

本补注为事后整理，只核对当前规范、代码、Git 和来源记录；来源测试及发布结果不作为本轮执行。查询时间和实际 head 见[本周整理](2026-10-19-weekly-memory-review.md)。
