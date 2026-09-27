<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-27-leverage-warning-gesture-hold",
  "date": "2026-09-27",
  "title": "杠杆编辑器的高杠杆警告在滑杆手势期间冻结有无，拖过 10x 时不再移动滑杆",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry"],
  "summary": "共享 LeverageEditor 的高杠杆警告原先跟随拖动预览值挂载/卸载。桌面调整杠杆弹窗是垂直居中的，移动杠杆抽屉贴底，所以拖过 10x 时滑杆在指针下方移动：用桌面应用浏览器面板的协议注入鼠标事件实测，桌面 1440×900 下移 34.5px，375×812 抽屉下移 69px。改为手势开始时记下警告的有无，松手（提交或取消）后再按当前值更新；键入、方向键与原生 range 输入不是手势，仍即时更新。去掉两个调用方传入的与 value 相同的冗余 riskValue。确认与提交逻辑不变。未做物理输入验证。",
  "thread": null,
  "baseCommit": "24444b5b",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/tradebox/leverage-editor.tsx" },
    { "path": "apps/terminal/src/lib/tests/leverage-editor.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/leverage-dialog-risk-warning.test.tsx" },
    { "path": "docs/slider-interactions.md" }
  ],
  "supersedes": []
}
-->
# 杠杆编辑器的高杠杆警告在滑杆手势期间冻结有无，拖过 10x 时不再移动滑杆

## 背景与范围

这是本任务进行中写下的记录，不是事后整理。用户报告：`LeverageEditor` 在滑杆与输入框下方渲染 `riskValue > 10` 的高杠杆警告。两个调用方都把拖动预览值传给它（`leverage-modal.tsx` 传 `dragLeverage ?? canonicalLeverage`，`margin-mode-modal.tsx` 传 `leverageDraft ?? canonicalLeverage`），所以拖过 10x 时警告在手势中途挂载或卸载。这违反 AGENTS.md「Slider gesture contract」和 `docs/slider-interactions.md` 的规则：表面在手势期间不得移动指针下方的滑杆。

受影响的表面，按代码核对：

- 桌面 `LeverageModal`（`trade-panel.tsx`，`ModalPopup` 垂直居中）。
- 移动 `MarginModeModal` 的 `mobileView="leverage"` 抽屉（`mobile-trade-view.tsx`，贴底）。
- 桌面 `MarginModeModal` 传 `showLeverage={false}`，没有杠杆编辑器，所以不受影响。移动端保证金视图同样不显示杠杆控件。

任务在应用自动建的 worktree 里进行。起点是 `main`（`e3b5dd82`），开工前快进到 `origin/dev` `24444b5b`；分支没有自己的提交，这 12 个提交都不涉及本任务的文件。

## 结论与依据

- 复现，输入路径为协议注入：用 Claude 桌面应用浏览器面板的工具（DevTools 协议鼠标事件），在本 worktree 的开发服务器上打开 `/trade/BTC`，未连接钱包，初始 10x，上限 40x。页面里的记录器在每次指针事件和 DOM 变化时采样滑杆控件的 `getBoundingClientRect().top`、`data-dragging` 和警告是否存在。
  - 1440×900 桌面弹窗，从 10x 拖到 25x：`pointerup` 之前（`data-dragging=true`），警告已挂载，`top` 从 400 变为 365.5。
  - 375×812 移动抽屉（mobile 预设，Android UA），从 10x 拖到 25x：`pointerup` 之前警告已挂载，`top` 从 654 变为 585。警告在这个宽度下折成两行。
- 方案：保持状态放在共享的 `LeverageEditor` 里，不在调用方各自处理。`onInteractionStart` 记下此刻显示的警告有无，`onInteractionEnd` 清除；手势期间显示记下的状态。`TradeSlider` 的 `finish()` 在同一个事件处理器里先调 `onCommit`/`onCancel` 再调 `onInteractionEnd`，所以松手后的一次渲染里，已提交的值与释放的保持状态同时生效。这样两个调用方和不传 `onDraftChange` 的旧路径（每个预览直接改 value）都被覆盖，今后的调用方也不会漏掉。
- 高度：警告文字是固定的，手势期间控件宽度变化会取消手势（`control-resize`），所以保持有无就等于保持高度，不需要像下单面板的提示行那样另外量高。
- 去掉 `riskValue`：两个调用方传入的值与 `value` 完全相同（`displayLeverage` 就是 `draft ?? canonical`）。这是一次清理：Git 历史里它最初只跟随已提交的值（`6b9cc9c7`），后来改成跟随拖动值（`0994ba3e`），成功态移除后变得多余。
- 未采用：
  - 让调用方改传 `canonicalLeverage`。改动更小，但规则落在调用方，新调用方或不传 `onDraftChange` 的路径会再次出错。
  - 常驻预留警告的空间。杠杆不超过 10x 时，空闲布局会多出一块空白，这是设计变更。

## 验证与限制

版本：工作区基于 `24444b5b` 加上本任务的改动，日期 2026-09-27。

- 修复后在同一页面、同样的输入路径下：桌面从 10x 拖到 25x，手势期间预览值 25 已显示，`top` 保持 400，没有警告，松手后警告出现、`top` 变为 365.5。移动从 10x 拖到 25x，手势期间 `top` 保持 654，松手后变为 585；再从 25x 拖到 5x，手势期间预览值 5 已显示，警告保留、`top` 保持 585，松手后警告移除、`top` 变为 654。桌面向下拖的那次，工具在松手前只发布到 15x，没有在手势中途跨过 10x，所以向下的方向在桌面只有单测覆盖。
- 单测，输入路径为脚本派发：`leverage-editor.test.tsx` mock 了滑杆，覆盖向上、向下、取消，以及非手势的键入和方向键。`leverage-dialog-risk-warning.test.tsx` 渲染真实的 `LeverageModal` 与 `MarginModeModal` 移动杠杆抽屉，使用真实的编辑器与 `TradeSlider`，用 `MutationObserver` 断言手势期间警告节点没有增删；它还确认 Confirm 提交的是松手后的值。
- 变异检查（实际执行）：把 `showHighLeverageWarning` 改回 `value > 10`，两个文件里 10 个手势用例变红，非手势用例保持绿；还原后 `shasum` 与原文件一致。
- 命令与结果：对改动文件跑 `pnpm exec biome check`，通过。`pnpm --filter @gatu/terminal typecheck` 通过。AGENTS.md 的 Slider gestures 组（本次新增两个文件后共 11 个文件、149 例）通过。Confirmation surfaces 组（41 个文件、879 例）通过。`i18n-reactivity-contract`、`i18n-hot-switch`、`design-token-ratchet`、`modal-surface-contract`（158 例）通过。
- 未执行：物理输入（真人拖动）验证、Playwright 浏览器套件、全量 `pnpm --filter @gatu/terminal test`、生产构建。这次改动不涉及指针捕获、手势监听或取消清单，只是展示层按手势边界冻结；ADR 0018 决策 5 要求物理输入验证的是生命周期改动。尽管如此，真实鼠标下的效果仍未经人确认。

## 后续与替代关系

- 待真人在桌面弹窗与手机抽屉上拖过 10x 确认。
- 键入与方向键仍会即时显示或移除警告，居中弹窗里的输入框会随之移动。这不在滑杆手势契约范围内，需要时另议。
- 没有被替代的记录。
