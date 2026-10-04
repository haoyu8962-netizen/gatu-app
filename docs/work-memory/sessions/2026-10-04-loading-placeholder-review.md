<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-04-loading-placeholder-review",
  "date": "2026-10-04",
  "title": "加载占位审查：存款弹窗回退不再手绘表单，四处陈旧骨架改为空白占位",
  "kind": "task",
  "status": "verified",
  "topics": ["market-recovery", "account-funding"],
  "summary": "用户截图指出存款弹窗的加载骨架与真实表单不符。核对后确认骨架定稿于 2026-08-18，真实表单此后改过两次而骨架未跟随（固定 600px 对实际约 690px）。处理：真实弹窗与代码块回退共用 FundsModalShell，回退只显示转圈；所有打开存款弹窗的控件在指针、按下、焦点到达且可用时预热，预热失败不触及懒加载组件；审计出的资金费页签、充值费用占位、推荐页、金库详情、API 钱包列表改为空白或共用类；新增 loading-placeholder-contract 与 deposit-modal-warm 测试并写入规则。Codex 三轮只读审查评分 6.5/6.5 → 8.0 → 8.5，发现全部核实并修复，最后一批修复未再送审。未做真实指针、真机与生产构建验证。",
  "thread": null,
  "baseCommit": "498ea17a",
  "commits": ["29c550c6", "8a00e50a", "50697085"],
  "sources": [
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": "apps/terminal/src/components/trade/components/funds-modal-shell.tsx" },
    { "path": "apps/terminal/src/components/trade/components/lazy-global-modals.ts" },
    { "path": "apps/terminal/src/lib/tests/loading-placeholder-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/deposit-modal-warm.test.ts" },
    { "path": "docs/neutral-surface-audit.md" }
  ],
  "supersedes": []
}
-->
# 加载占位审查：存款弹窗回退不再手绘表单，四处陈旧骨架改为空白占位

## 背景与范围

同步记录，2026-10-04。用户在开发服务器上看到存款窗口的加载骨架，要求审查它用的方案、定稿时间、出现条件和是否仍在使用旧方案；随后要求按建议修复、用 Codex 做对抗审查并评分，并排查其他同类问题一并修复。未取得任务标识，`thread` 为 null。基线为 `origin/dev` 的 `498ea17a`。

## 结论与依据

审查结论（来自源码与 `git log`）：

- 截图里的骨架是 `deposit-modal-loading-fallback.tsx`，即存款弹窗懒加载代码块的 Suspense 回退，由 `4bf11790`（2026-08-18）加入，之后只有机械改动。真实表单在 `6140b378`（2026-09-12）和银行卡入金（2026-10-02）改过两次。
- 骨架桌面内容区固定 `37.5rem`（600px）。用户选中元素的 `ModalContent` 高 728.5px、上下内边距合计 38px，即真实内容区约 690.5px。骨架缺标题和步骤说明，选择器为三列 44px 而真实为两列 54px。原测试只断言 `37.5rem` 和六个槽位存在，不与真实表单比对。
- 回退原先只在赞助入金路径且 Deposit 页签显示骨架；提款页签的回退标题可见，而真实弹窗的标题只给读屏。

采用的方案：

- 新增 `FundsModalShell`，真实弹窗和回退都渲染它；回退内容只有读屏文案和中性转圈，所有存款路径统一使用。
- `warmDepositModal` 与 `depositModalIntentProps`（指针移入、按下、焦点）接到每个打开存款弹窗的控件上，只在该控件当前能打开弹窗时生效；下单按钮只在存款状态接入。预热先自行导入模块，成功后才交给懒加载组件，失败时复位且不触及懒加载组件。自动打开弹窗的引导门无控件可接，登记为例外。
- 只读审计（子代理，按类名与 `git log` 判断）找出的其他陈旧占位：桌面资金费页签改为 `PassiveDataPlaceholder busy`，充值表单费用占位与 `UnitDepositInfo` 共用 `UNIT_DEPOSIT_INFO_LIST_CLASS`，推荐页与金库详情加载态改为空白 busy 区域；Codex 第一轮另指出 API 钱包列表骨架的列宽和手机卡片与真实不符，也改为空白。
- 有意保留并在契约里登记理由的通用脉冲条：三个历史页、金库列表、排行榜、资金费比较、质押。
- 规则写入 `.claude/rules/style-ui-guide.md` 的 Loading placeholders 一节和 AGENTS.md；`loading-placeholder-contract.test.ts` 登记所有 `animate-pulse` 文件、钉住共用外壳、逐文件登记打开调用数与预热接入数；`deposit-modal-warm.test.ts` 用真实 `createLazyComponent` 验证失败的预热不污染后续加载；两者加入 CI 清单。

未采用：保留骨架并重新对齐到当前表单。理由是每次表单改版都要同步维护，且没有办法让测试证明两份布局一致。

Codex 只读对抗审查（`gpt-6-astra`，medium，报告均为静态推演）：

| 轮次 | 评分 | 发现 | 处理 |
| --- | --- | --- | --- |
| 第一轮，两路 | 6.5、6.5 | 1 项 P1（预热失败被 TanStack 懒加载记住，之后点击不重试）、8 项 P2（容器级预热、移动抽屉未预热、契约为文件级检查、回退可再加灰块、外部钱包路径不共壳、API 钱包骨架、规则过宽、改写了有固定基线的审计附录） | 逐条对照源码核实成立，`8a00e50a` 修复 |
| 第二轮 | 8.0 | 3 项 P2（抽屉在其他弹窗预加载期间仍预热、入口计数只读首个绑定、回退白名单可被属性展开或子组件绕过），并指出预热测试替换了整个懒加载 | 核实成立，`50697085` 修复 |
| 第三轮 | 8.5 | 1 项 P2（`createElement` 可绕过元素白名单）、1 项 P3（元素名正则会误认泛型） | 改为渲染回退后断言其子节点只有标签和图标，删除元素名正则；这一批未再送审 |

四次运行合计约 38 万 token。

## 验证与限制

均在本 worktree、上述提交及其后的工作区上执行，日期 2026-10-04：

- `pnpm --filter @sairn/terminal typecheck` 通过。
- `pnpm --dir apps/terminal exec vitest run --maxWorkers=4`：`50697085` 上 660 个文件通过、1 个跳过，8556 项通过。`8a00e50a` 提交前的一次全量运行有 2 项失败：移动抽屉用例的测试桩缺新导出，已修；`client-bootstrap-error` 一项在并行下超时，单独重跑和之后的全量运行均通过。
- `node --test scripts/ci-workflows.test.mjs` 10 项通过。
- 变异验证（改源码后跑对应测试，确认失败再还原）：去掉一个入口的预热、新增脉冲块、回退加固定高度、真实弹窗离开共用外壳、去掉两个预热之一但保留导入、回退加静态灰块、外壳丢失 pending、改名绑定且不预热、回退只在一条路径使用、预热改回直接调用懒加载的 `preload`、失败后不复位、抽屉条件只看可用性、第二个绑定、属性展开灰块、子组件灰块、`createElement` 灰块，共 16 个，全部被抓到。
- 内置浏览器、开发服务器：用脚本派发 `pointerover` 后等待再 `click()`，约 52 ms 后出现真实表单且未观察到回退；不预热时点击会经过回退。这是脚本注入事件，不是物理指针；当时页面一度处于 hidden 状态。弹窗计算样式为圆角 16px、最大宽 448px、不透明，截图显示正常。
- 未做：用户要求在 Chrome 里调试，但 Claude in Chrome 扩展未连接，真实鼠标悬停与点击没有验证；真机触屏、读屏、生产构建与包体预算、网络失败后的浏览器实际行为都没有验证。包体预算未测量，`FundsModalShell` 从懒加载块移到了主包可达的模块。

## 后续与替代关系

- 待用户连上 Chrome 扩展后做真实指针验证；推送前按 CI 口径量一次包体预算。
- `design-token-ratchet.test.ts` 不在 CI 显式清单里，本次下调了它的基线（字号 113→112、圆角 224→211、表面覆盖 14→12），未把它加入 CI。
- `docs/neutral-surface-audit.md` 附录仍引用早已不存在的 `dashboard-shell-skeleton.tsx`，已在该文档的更正节注明，未处理。
- 三个历史页的骨架缺筛选栏、手机行高与真实卡片不符，金库列表骨架为通用条块；这次判断为从一开始就是粗略条块而保留，可在下次改这些页面时改为空白占位。
- 回退与真实弹窗是两个弹窗实例，切换时各有一次进场动画，这是改动前就有的结构，未处理。
- 无被替代的记录。
