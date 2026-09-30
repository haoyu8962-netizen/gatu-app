<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-30-mobile-navigation-close-before-route",
  "date": "2026-09-30",
  "title": "方案 A：移动菜单退出完成后再导航",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review"],
  "summary": "实施用户选择的方案 A：目标预加载与抽屉退出并行，关闭完成后导航；137 项回归和 946 × 891 浏览器动画验证通过，Earn 列表位移未改；未经人工真机确认原始体感。",
  "thread": null,
  "baseCommit": "89f1e578",
  "commits": ["c1267cde"],
  "sources": [
    { "path": "docs/runtime-guardrails.md" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx" },
    { "path": "apps/terminal/src/lib/tests/mobile-nav-drawer-navigation.test.tsx" },
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": "docs/work-memory/sessions/2026-09-30-mobile-navigation-jitter-review.md" }
  ],
  "supersedes": []
}
-->
# 方案 A：移动菜单退出完成后再导航

## 背景与范围

用户明确选择方案 A，要求执行此前菜单抖动复核的修复。基线 89f1e578，分支 `claude/privy-theme-css-vars`，工作树干净。本次仅修复菜单退出与路由导航时序，未修改 Earn 数据列表、路由布局所有权、主题、登录、钱包或交易逻辑。未取得可核对的会话标识，thread 留空。

## 结论与依据

- 保留真实 TanStack Link 和原导航参数，以同一份目标参数构造 href、预加载和延后提交；Trade/GATU 的 `scope=all` 保留。
- 普通当前页点击阻止 Link 的即时提交，立即开始目标预加载并关闭抽屉；只在 Base UI `onOpenChangeComplete(false)` 中消费一次目标并导航，不使用固定计时器，也不等待预加载完成。
- 修改键、非主键和其它 target 不进入延后队列；外部 Statistics 链接保持原行为。同页链接仍在关闭后交给路由处理。预加载失败不阻塞正式导航。
- 重开、主动关闭、原生 dismiss、其它导航及卸载取消未执行的目标；退出期间忽略第二个目标及 Settings/Deposit 请求，导航请求会取消旧的弹窗预加载。
- 导航提交的意外拒绝仅在原位置、原请求仍有效时重开菜单显示既有 Try again；其它导航、重开或卸载之后的旧失败无效。已提交路由的加载错误仍由路由处理。
- 采用 A 是用户明确选择，改动局限在菜单，不需要把 Drawer 迁移到公共路由外层（方案 B），也保留现有退出动画（不同于即时关闭方案 C）。提前更新 runtime guardrails，最终同步 CHANGELOG，并将新回归文件加入选择性 CI。

## 验证与限制

验证对象为基线 89f1e578 加本次工作区改动，2026-09-30，本地 Node 24.15.0、pnpm 10.21.0。

- 新增真实 TanStack Router/Link 集成测试 21 项，Drawer 用可控关闭完成回调；覆盖延后提交、一次性消费、搜索参数、同页、预加载挂起/失败、修改键、取消、弹窗互斥、失败重试和旧失败保护。此单测不声称证明 CSS 动画。
- 合并运行 `mobile-nav-drawer-navigation`、`mobile-nav-drawer`、`root-route-transition`、`mobile-header-layout`、`dashboard-frame-view`、`top-nav`、`desktop-nav-layout`：7 文件 137 测试通过。已有模拟链接测试的 jsdom 文档导航提示不属于真实浏览器结果。
- 对三个修改/新增 TSX 文件运行 Biome，通过；`node --test scripts/ci-workflows.test.mjs` 6 项通过。
- `pnpm --filter @gatu/terminal typecheck` 通过。
- 浏览器输入路径为 Codex 内置浏览器的自动化点击与键盘 Enter，使用实际开发服务器、实际 Drawer/CSS/Router，未登录、深色主题。实际 `innerWidth=946`、`innerHeight=891`。Portfolio → Earn 的退出逐帧 x 约为 0、-76、-124、-166、-196、-222、-242、-257、-269、-277、-284、-287、-288；退出完成后 URL 才变为 `/earn`。Earn → Trade 同样完整滑出后跳转且保留 `scope=all`。Trade → Portfolio 的 Enter 输入也先滑出到 -288，再切换路由。各次 header 保持 `[0,0,946,57]`。
- `prefers-reduced-motion: reduce` 模拟下 Trade → Portfolio 从 x=0 到 -288 后正常导航，没有额外固定 200ms 等待。最初一次普通 Trade → Portfolio 测试实际为 852 × 802（浏览器缩放已与上轮不同），单独视为补充样本；上述 946 × 891 结果来自重新校准后的采样。
- 临时 CDP rAF/PerformanceObserver 仅记录几何和路径，已清理；临时 viewport 和减少动画模拟已撤销，页面回到原 Trade URL，3037 开发服务器保持运行。数字为本轮工具结果的同步摘录，没有保存完整录像。不是人工真机或生产验收，仍需用户确认原始体感。
- 未运行全量终端测试或生产构建：此次只改局部导航事件时序及相关回归，没有依赖、CSS 或布局改动。文档按 memory:index / memory:check / memory:test 校验。
- 首次 memory:index 因任务记录将必需的“结论与依据”标题写成“实现与选择”失败；恢复规定标题后重跑，不涉及应用代码。

## 后续与替代关系

本次实现关闭了前次复核中的菜单退出动画截断问题。前次记录的 Earn 首次列表填充引起局部位移仍存在，本次浏览器中也观察到，属于独立待办；不把整份复核标记为 superseded。未部署或推送，用户可在保留的开发页面检查修复后的菜单体验。
