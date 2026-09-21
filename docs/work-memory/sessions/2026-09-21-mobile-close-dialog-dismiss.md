<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-mobile-close-dialog-dismiss",
  "date": "2026-09-21",
  "title": "移动端市价与限价平仓弹层没有任何明确的退出控件：恢复关闭按钮，移除标题栏里重复的标识",
  "kind": "task",
  "status": "verified",
  "topics": [
    "market-recovery",
    "docs-governance"
  ],
  "summary": "移动端的市价平仓与限价平仓弹层既没有关闭按钮也没有取消按钮，弹层里唯一的按钮是确认键；只能下滑、点遮罩或按 Esc 离开，把手是 aria-hidden 的装饰。来历是 2026-08-04 重设计把移动端关闭按钮换成把手，测试也钉住了这一点。逐个核对其余隐藏关闭按钮的弹层，正文里都有取消、返回或关闭按钮，缺口只有这两个。已恢复关闭按钮并按产品负责人指示移除标题栏里与标题重复的 Price: Market 与 Limit 标识，新增契约测试与样式规则防止再出现。",
  "thread": null,
  "baseCommit": "c0a9e8bd",
  "commits": [
    "5341c3df",
    "928cebf1",
    "2f6411b5",
    "ee080cff",
    "5595d281"
  ],
  "sources": [
    { "path": "apps/terminal/src/components/trade/positions/position-close-dialog-shell.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-market-close-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-limit-close-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-close-all-modal.tsx" },
    { "path": "apps/terminal/src/lib/tests/dialog-dismiss-control-contract.test.ts" },
    { "path": "packages/ui/src/modal.tsx" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": "docs/adr/0017-market-close-confirmed-size-ceiling.md" }
  ],
  "supersedes": []
}
-->
# 移动端市价与限价平仓弹层没有任何明确的退出控件：恢复关闭按钮，移除标题栏里重复的标识

## 背景与范围

同步记录。产品负责人在 2026-09-21 指出「移动端的限价、市价等弹窗似乎没有关闭按钮」，要求核实并说明为什么会遗漏；调查期间又在市价平仓弹层上选中标题栏右侧的 `Price: Market`，指示「这个标识重复了，可以移除掉，换成关闭的按钮」。工作在分支 `fix/market-close-confirmed-size`（工作树 worktree-05）上进行，未推送。

## 结论与依据

**情况属实，而且缺口只有这两个弹层。**

- `PositionCloseDialogShell` 在移动端把 `showClose` 算成 `dismissible && showMobileClose`，`showMobileClose` 默认为 false；市价平仓与限价平仓都不传它。`@gatu/ui` 的抽屉在 `showClose` 为 false 时不渲染任何关闭控件，把手是 `aria-hidden` 的装饰 `div`，不可点击。
- 登录态真实页面实测（375×667，中文界面）：市价平仓弹层高 397px，弹层内的按钮只有「市价平仓」；限价平仓弹层高 432px，按钮只有「中间价」与「提交限价平仓」。两者上方分别剩 270px 与 235px 的遮罩，键盘弹出后可点击的遮罩会更少。离开的途径只有下滑、点遮罩、Esc。
- 逐个核对 `components/` 下所有可能隐藏关闭按钮的弹层（`showClose` 依赖布局或为 `false`，共 8 个文件）：推荐、API 钱包、金库的操作弹层，保证金模式的移动端杠杆步骤，取消全部委托，收益分享，止盈止损与逐仓保证金（共用 `position-risk-dialog-ui.tsx`），法律条款弹层。前七类正文里都有 Cancel / Back / Close 按钮；法律条款弹层按设计不可关闭，出口是 Disconnect。全部平仓弹层自 2026-08-27 起传了 `showMobileClose`，有关闭按钮。

**来历（git 可证）。** 首版 `5341c3df`（2026-08-04 13:42）是 `showClose={canDismiss}`，移动端有关闭按钮。同日的重设计 `928cebf1`（18:31，也是把数量写进确认按钮的那次提交）改为 `showClose={!isMobile && canDismiss}`、`showHandle={isMobile && canDismiss}`，即移动端用把手替代关闭按钮；`2f6411b5`（22:43）抽出共享外壳，限价平仓沿用；`ee080cff`（2026-08-27）只给全部平仓加了 `showMobileClose`。测试断言移动端 `showClose: false, showHandle: true`，所以这是一次被测试钉住的设计取舍，不是手滑；遗漏在于当时没有意识到这两个弹层的正文里没有取消按钮，把手又不是控件，结果弹层里唯一的按钮成了破坏性的确认键。

**改动（`5595d281`）。**

- 外壳：`showClose={dismissible}`，移动端与桌面一致；`showMobileClose` 属性删除，全部平仓不再传它。不可关闭（提交中）时仍然隐藏。把手保留。移动端关闭按钮定位为 `top-6 right-3`，与标题行垂直居中、图标右缘与内容右缘对齐，颜色用 `text-market-close-muted`。
- 标题栏：移除市价平仓移动端的 `Price: Market` 与限价平仓移动端的 `Limit`（两者都与标题重复），标题行在移动端留出 `pe-10` 给关闭按钮。桌面端不变；桌面 `Close size` 行右侧的 `Price: Market` 不变。限价平仓的 `Limit` 是我按同一理由一并处理的，产品负责人选中的只有市价那一个。
- 防止再出现：`.claude/rules/style-ui-guide.md`「Dialog chrome」新增规则：可关闭的弹层在手机上必须有明确、可聚焦的退出控件，把手与手势不算；`showClose` 依赖布局或为 `false` 的文件必须在 `dialog-dismiss-control-contract.test.ts` 里登记它的退出控件。该测试扫描全部组件源码，未登记的新文件会失败，登记的退出控件文案消失也会失败。
- ADR 0017 追加补注（决策 1 曾提到移动端标题栏的 `Price: Market`）；`CHANGELOG.md` 增加条目；CI 的确认面步骤加入全部平仓弹层测试与新契约测试。

## 验证与限制

均为 2026-09-21 在本机对本分支执行。

- 先改测试后改实现：三个弹层测试按新约定改写后 5 项为红，实现后 46 项全过。变异检查：把外壳改回 `dismissible && !isMobile`，契约测试 2 项与弹层测试 3 项变红，还原后文件逐字节一致。
- 真实页面（开发服务器，登录态，移动布局 670px，中文界面；点击由脚本触发，非物理输入）：市价与限价平仓弹层都出现「关闭」按钮，按钮中心与标题中心同为距弹层顶部 40px，右侧内缩 12px；标题行文本为「市价平仓HYPE」「限价平仓HYPE」，不再含价格或类型标识；点击关闭按钮弹层关闭。全程未点击任何确认或提交按钮，持仓数 1、委托数 0 不变，事后把页面视图恢复为原来的「账户」。
- 语言目录只少了两条来源注释，没有文案或译文变化。
- 最终工作树：`pnpm --filter @gatu/terminal typecheck` 通过；`pnpm --filter @gatu/terminal test` 586 文件通过、1 跳过，6,639 项通过、1 跳过（161 秒）；Biome、`git diff --check`、`node --test scripts/ci-workflows.test.mjs`（6 项）通过。此前一次全量运行里 `positions-panel-preload` 与 `global-modals-hip3-disclaimer` 两个文件因超时失败（与 2026-09-20 机器有负载时是同一批），单独运行 23 项全过，随后这次全量也全过，与本次改动无关。没有跑生产构建与浏览器套件：改动是两个弹层的标题栏标记与一个外壳属性，平仓弹层没有浏览器套件。
- 限制：没有在真实手机与读屏（VoiceOver / TalkBack）上验证；桌面弹窗未改动也未复看；全部平仓弹层的移动端只由单测覆盖。

## 后续与替代关系

- 不替代任何记录；与 `2026-09-20-market-close-confirmed-size.md`、`2026-09-20-slider-review.md` 在同一分支。
- 同目录的 `position-risk-dialog-ui.tsx` 仍是一个文件多个组件，未动。
- 下一次先查：`.claude/rules/style-ui-guide.md`「Dialog chrome」、`dialog-dismiss-control-contract.test.ts`、`packages/ui/src/modal.tsx` 的 `AdaptiveModal`。
