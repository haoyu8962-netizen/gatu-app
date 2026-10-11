<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-12-slider-percent-basis-flicker",
  "date": "2026-10-12",
  "title": "拖动数量滑杆时个别交易对数量闪烁：手势期间冻结百分比计算基准",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry"],
  "summary": "用户报告 HYPE 等个别交易对拖动数量滑杆时 Size 数字不稳定、闪烁。审查确认缺陷：每 15ms 预览都用当时的 maxSize（activeAssetData.maxTradeSzs 随标记价 tick）和换算价重算 getSizeForPercent，拇指不动也会在相邻两档间翻（0.23↔0.24）。修复：useOrderEntryData 在 onInteractionStart 捕获 maxSize/换算价/现货余额/szDecimals/sizeMode/Reduce Only 上限并用于手势内全部预览与提交，onInteractionEnd 释放；桌面与手机表单都接上。新增真实 Hook 回归（基准 0.31→0.33 时 77% 仍为 0.23，结束后 0.25），变异检查先红后绿。未做真机拖动验收。",
  "thread": null,
  "baseCommit": "2eeec75d",
  "commits": [],
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
- 键入百分比、Max 按钮和下一次手势仍用实时数据；身份（市场/方向/模式/杠杆）变化会取消手势并释放基准。
- 文档：`docs/slider-interactions.md`「Quantity and execution boundaries」新增一段，`AGENTS.md` 滑杆契约补一句，CHANGELOG Unreleased/Fixed 记录。

## 验证与限制

版本：`2eeec75d` 加本工作树改动，Node 24.15.0，pnpm 10.21.0。

- 新增 `src/lib/tests/order-entry-percent-basis.test.tsx`：真实 `useOrderEntryData`（模拟钱包、余额、杠杆与下单 store），HYPE 永续 `szDecimals=2`、`maxTradeSzs` 0.31→0.33：手势内 77% 两次都得 `0.23`，结束后 `0.25`；手势外直接随实时值变化。变异检查：把捕获改成 `null` 后第一项失败，恢复后通过。
- `vitest run`：新测试、`trade-form-fields-order-entry-data`、`order-entry`、`open-interest-cap-hooks`、`mobile-trade-size-validation-a11y`、`trade-panel-open-interest-cap`、`use-size-slider-interaction`、`trade-size-slider`、`trade-size-slider-pointer-lifecycle`、`slider-effective-leverage-regression`、`i18n-reactivity-contract` 共 11 文件 454 项通过（两个模拟 `useOrderEntryData` 的测试补上了新函数桩）。
- `pnpm --filter @sairn/terminal typecheck`、Biome 通过；`memory:index` / `memory:check` / `git diff --check` 通过。
- 未做：真机或真实鼠标拖动验收（需要有余额的账户；按滑杆契约，脚本注入事件不能证明物理输入路径）；Playwright 滑杆浏览器套件未运行。

## 后续与替代关系

补充 [slider-interactions](../../slider-interactions.md) 与 2026-09-20 的滑杆复盘，不替代。合入 `dev` 后随下一次发布上线；请报告人在 HYPE 等小最大值交易对上实际拖动确认。
