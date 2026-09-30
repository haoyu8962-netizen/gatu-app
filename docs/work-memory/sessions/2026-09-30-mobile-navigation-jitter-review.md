<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-30-mobile-navigation-jitter-review",
  "date": "2026-09-30",
  "title": "946 × 891 菜单跳转抖动复核",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review"],
  "summary": "浏览器逐帧确认菜单路由跳转截断退出动画；Earn 首次列表填充有局部位移，未观察到顶部横移；仅复核，未修复。",
  "thread": null,
  "baseCommit": "819ee5adaf49c8205a2807c4de7be3cc07fc300a",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx" },
    { "path": "packages/ui/src/drawer.tsx" },
    { "path": "apps/terminal/src/components/earn/earn-view.tsx" },
    { "path": "apps/terminal/src/lib/tests/mobile-nav-drawer.test.tsx" }
  ],
  "supersedes": []
}
-->
# 946 × 891 菜单跳转抖动复核

## 背景与范围

用户在本地 Trade 页的 Navigation 菜单切换页面时感到轻微抖动，要求 review 原因。工作区为 `other-workspace-recent-commits-e0c7a2`，分支 `claude/privy-theme-css-vars`，开始时干净。当前记录同步整理本次可观察结果；未取得可核对的会话标识，thread 留空。只做诊断，没有修改运行时代码。

## 结论与依据

1. **P2：跨路由跳转截断抽屉退出动画。** `MobileNavDrawer` 的路由 Link 在同一点击里 `onClick={close}` 并导航；Drawer 随各页面的 MobileHeader 挂载，路由提交即卸载旧 Drawer。共享 Drawer 原本有 200 ms transform/opacity 退出过渡。浏览器逐帧结果：Trade → Portfolio、Portfolio → Earn、Earn → Trade 均从抽屉 x=0 直接变成不存在，没有采到向左滑出的中间位置。对照只点击 Close navigation，抽屉 x 依次约为 0、-71、-129、-165、-195、-223、-242、-256、-269、-278、-284、-287、-288，约 200 ms 后才移除。这个突兀切换已证实，可能对应用户感受到的闪跳；不能证明它解释了用户所有的“抖动”。建议让普通站内导航在退出完成后提交，保留修改键、新标签、同页链接及导航失败语义；或由稳定的页面外层持有抽屉生命周期。尚未实施或比较方案。
2. **P2：Earn 首次数据填充推动下方内容。** 移动端 `AssetTable` 直接 map rows，没有加载阶段的几何占位。首次进入 Earn 后约 350 ms，main 高度由 608.47 增至 2134.83 CSS px；PerformanceObserver 记录一次 layout-shift value=0.02112676，来源为下方 `space-y-2` 区块移出视口。该 entry 的 hadRecentInput=true，不能把它报告成 CLS=0.021。顶部和标题位置稳定。建议为初始移动端列表提供符合被动数据展示规范的稳定占位，仍需决定合适几何与回归验收；未修改。
3. **本次没有复现整页横向位移。** 三次路由采样的 header 始终约 `[0,0,946.67,56.55]`，brand 始终约 `[10,6,93.98,43.99]`；scrollY=0。body 在抽屉开关时仅切换 overflow:hidden，没有左右补偿导致的宽度变化。不能外推到页面已滚动、其它设备、其它路由或网络条件。
4. **现有测试缺口。** mobile-nav-drawer 测试把 Drawer 和 Router Link 替换为 mock，不会执行真实路由卸载和 CSS 退出动画；root-route-transition 保护 provider 生命周期，也没有断言抽屉过渡。测试通过不能否定上述浏览器证据。

## 验证与限制

- 2026-09-30，基线 819ee5ad，本地 Vite 开发服务器 `127.0.0.1:3037`，未登录，深色主题。输入路径是 Codex 内置浏览器自动化点击，非人工真机验收。
- 浏览器原有缩放使 viewport override 的单位与 CSS 像素不同。第一次直接设置 946 × 891 后实际 innerWidth=1051，属于无效的目标视口样本，未用于上述结论；校准后实际 innerWidth=946、innerHeight=891，DOM 布局因 90% 缩放出现小数。任务结束清理临时观察器/采样对象，撤销 viewport override，并返回原 Trade URL；开发服务器保持运行。
- 通过 CDP Runtime.evaluate 临时设置 requestAnimationFrame 采样器与 PerformanceObserver，记录 DOM 矩形、滚动和内联样式；仅诊断，不改变产品逻辑。结果在本次工具输出中可见，没有保存完整录像或原始逐帧文件；上述数字为同步摘录，不是新构造的原始证据。
- `pnpm --dir apps/terminal exec vitest run src/lib/tests/mobile-nav-drawer.test.tsx src/lib/tests/root-route-transition.test.tsx src/lib/tests/mobile-header-layout.test.tsx src/lib/tests/dashboard-frame-view.test.tsx`：4 文件、62 测试通过，Node 24.15.0 / pnpm 10.21.0。jsdom 输出两次 navigation to another Document 未实现提示，不是浏览器动画验证。
- 未跑全量应用测试、构建或类型检查：本次运行时代码未变。记录与索引使用 memory:index / memory:check / memory:test 验证。

## 后续与替代关系

两个表现问题待修复；此次完成的是原因复核，不是修复验收。后续应分别验证真实 Drawer + Router 的退出时序和 Earn 首次列表几何，覆盖当前 946 × 891，再由用户确认原始体验。不得将本记录或通过的单测视为移动真机、所有菜单目的地或生产版本验收。不替代此前 Privy 升级记录。

2026-09-30 后续：用户选择方案 A，菜单退出完成后再提交导航的实现和验证见[后续记录](2026-09-30-mobile-navigation-close-before-route.md)。上文保留为修复前证据；Earn 列表位移仍为独立待办。
