<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-15-mobile-shell-parity",
  "date": "2026-09-15",
  "title": "移动占位壳与真实终端逐像素对齐",
  "kind": "task",
  "status": "verified",
  "topics": ["market-recovery"],
  "summary": "移动启动占位原与真实终端完全不同（头部缺三个控件、48px 市场栏、按比例分配的交易区、4 个标签）；改为复用真实组件的 class 常量绘制同一套 chrome，Playwright 在 360/390/430 三档视口、深浅主题、中英文下实测所有结构盒子一致；运行时回退改用翻译标签与持久化页签。",
  "thread": null,
  "baseCommit": "f5010ee7",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx" },
    { "path": "docs/work-memory/sessions/2026-09-16-mobile-views-migration.md" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-loading-fallback.tsx" },
    { "path": "apps/terminal/src/lib/tests/mobile-chrome-parity.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/mobile-app-shell-skeleton.test.tsx" },
    { "path": "docs/mobile-data-presentation.md" }
  ],
  "supersedes": []
}
-->
# 移动占位壳与真实终端逐像素对齐

## 背景与范围

用户在 iPhone 上录屏 `app.gatu.ai`：0.65 s 时的占位壳（英文、无汉堡菜单与主题/语言按钮、48px 市场栏、Long 高亮、Positions 高亮、4 个标签）与 1.10 s 时的真实页面（中文、完整头部、61px 市场栏带徽标与展开按钮、三个下拉控件、空/多切换、滑杆、复选框、汇总行、7 个标签）完全不同，整屏重排。任务：审查移动占位样式，参考官方站的做法，规划后交 Codex（`gpt-6-astra`）执行，本会话做对抗审查。未取得任务标识，`thread` 记为 null。

## 结论与依据

- 官方站移动端（Playwright iPhone 14 视口经代理逐帧抓取）：约 2.7 s 内空白，然后头部与底部导航按最终几何一次出现，内容区在数据到达前保持中性底色，不画任何假内容。据此定下原则：占位只画能确定的 chrome 与结构盒子，状态未知处保持中性。
- 实施（Codex 三轮）：新增纯常量模块 `mobile-chrome-classes.ts`（含从 `@gatu/ui` Button 解析出的 outline/filled/icon 类名），`mobile-header`、`mobile-market-bar`、`mobile-trade-order-split`、`mobile-trade-scroll-area`、`mobile-trade-size-control`、`mobile-trade-view`、`mobile-book-view`、`mobile-positions-view`、`mobile-bottom-nav`、`token-selector-trigger`、`trade-header`、`side-toggle`、`trade-option-checkboxes`、`trade-slider`、`trading-cta` 改为消费这些常量（Codex 用常量回代验证 16 个运行时文件编译产物与 HEAD 相同）；`MobileShellSkeleton` 用同一套常量重绘：汉堡/logo/带钱包图标的 Connect Wallet/主题（`dark:` 变体切换日月）/语言/设置，61px 市场栏（44px 图标槽、名称 `pl-1`、两枚徽标占位、18px 价格、36×30 展开按钮），`min-h-[clamp(370px,60svh,480px)]` 交易区，嵌入表单（三个下拉占位、中性多空、可用、尺寸输入、`h-[33px]` 滑杆框、复选框两行、汇总行、38px CTA），紧凑订单簿表头/中价/底栏，7 个标签（默认 Positions），底栏 `text-3xs`；`MobileLoadingFallback` 传入 Lingui 翻译标签与持久化 `positionsActiveTab`/`mobileActiveTab`（无效值回退）。`config/nav.tsx`、`config/trade.ts` 的 `msg` 描述符补 `message` 字段以便预渲染壳读取英文源串。
- 审查中发现并修正的三处：市场名称缺 `pl-1` 偏左 4 px；滑杆占位比真实 `TradeSlider` 的 33 px 框矮 2 px 导致下方整体上移 2 px；本会话方案误写默认标签为 Balances，实际 store 默认 `positionsActiveTab: "positions"`。

## 验证与限制

- 实测方法：Playwright `addInitScript` + MutationObserver 在壳出现瞬间与真实终端挂载后各记录结构盒子（头部四个动作槽、市场栏及内部、交易区、表单各段、CTA、订单簿表头/中价/底栏、标签行、底栏），脚本在会话 scratchpad `mobile-frames/measure2.mjs`（不在仓库）。改前：市场栏 48→67 px、交易区 294→448 px、Long 下移 40 px、标签下移 181 px、底栏文字 11→10 px。改后：390×664、360×640、430×932 深色，390 浅色 + 中文 + 持久化 Balances，所有结构盒子完全相同；剩余差异仅为无法预知的文本宽度（徽标 "Perp/20x"、市场名、价格）、中性多空与真实高亮的颜色、无头浏览器字体加载时机造成的亚像素文字宽度。
- 测试：`mobile-app-shell-skeleton`、`mobile-chrome-parity`（新增：共享常量、导入边界、语言切换、持久化页签）、`app-shell-frame`、`skeleton-fallback`、`boot-placeholder-contract`、滑杆、市场栏、标签、头部等 17 文件 146 用例通过；`biome check` 28 文件通过；`typecheck` 通过。
- 更广子集（80 文件）有 6 文件失败：`desktop-positions-panel-shell`（18）、`mobile-input-zoom-contract`（2）、`mobile-order-risk-summary-contract`（1）、`mobile-trade-tp-sl-contract`（1）在未改动的 HEAD 检出上同样失败，属基线问题；`mobile-agent-sync-modal`/`-route` 在并发下超时、单跑通过。
- 未做：真机验收、地区/离线横幅槽位、桌面壳的 4 项 P1（另一记录）。Codex 沙箱内无法起本地服务器做像素验证，所有浏览器实测由审查方完成。

## 后续与替代关系

- 桌面壳 P1–P4（Soon 徽标、stat min-width、Connect Wallet 宽度、页脚时钟）仍待修，见桌面审查记录。
- 徽标占位若想更接近，可按 `market.kind` 在运行时回退里填入 Perp/Spot；预渲染壳保持中性。
- 本记录取代本轮 Codex 生成的"默认及持久化页签高亮修正"记录（已合并）。

### 2026-09-16 来源路径更正

表面 6 迁移已删除本记录原 sources 中的 `apps/terminal/src/components/trade/mobile/mobile-chrome-classes.ts`。为使活跃来源导航可解析，该项改指向[移动视图迁移记录](2026-09-16-mobile-views-migration.md)；上文历史实施与测量结论不变。旧文件可用 `git show b77a87909046a20469f71449525d619680daa4f1:apps/terminal/src/components/trade/mobile/mobile-chrome-classes.ts` 查看。当前实现由六个移动纯视图接管，新的 reviewer 实测尚未完成，不能沿用本记录的盒子数字。
