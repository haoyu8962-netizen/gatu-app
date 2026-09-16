<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-remove-startup-placeholders",
  "date": "2026-09-16",
  "title": "移除启动占位体系",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting",
    "market-recovery",
    "docs-governance"
  ],
  "summary": "按 ADR 0010 移除启动占位；类型、格式、翻译与全部产物预算通过，全量测试保留已知基线失败，完整构建受沙箱 preview 监听限制。",
  "thread": null,
  "baseCommit": "0f7e97acb95a4211195b1ac4dd742def7f72bbc0",
  "commits": [],
  "sources": [
    {
      "path": "docs/adr/0010-blank-until-ready-startup.md"
    }
  ],
  "supersedes": []
}
-->
# 移除启动占位体系

## 背景与范围

同步记录；分支 claude/placeholder-parity，基线见元数据，初始仅未跟踪 .build/，保留不动。用户禁止 install、暂存、提交、stash、移动和切换分支。任务 ID 与原始会话导出未取得。

## 结论与依据

先写 ADR 0010 确定新边界；删除启动占位，不变更数据及交易守卫。历史 parity 测量只代表旧方案，本次用户明确取代其中占位决策。

### 新 fallback 标记

```html
<div aria-busy="true" data-testid="startup-fallback">
  <output class="sr-only">Loading GATU...</output>
</div>
```

桌面 pending workspace 为 `<main class="min-h-0 flex-1 bg-grid-container" aria-busy="true">`，内部只有同一 sr-only output。移动 pending workspace 使用真实 MobileWorkspaceView 的 main 与 busy 属性；header/nav 在同一个 MobileTerminalFrameView 中，不复制标记。原 paused/error/notFound 与重试守卫保持，正常 loading/redirecting 阶段使用空 workspace。

## 验证与限制

实现已完成；最终检查见下方结项记录，不继承旧任务的通过结论。

初轮定向检查：17 files 中 14 passed / 3 failed，295 tests passed / 3 failed（另有 i18n suite 因删除模块引用无法加载）。修正真实 SideToggle 使用的两个样式常量归属、responsive 源码断言和 NumberInput 的 w-full 期望。初轮类型检查及随后完整 typecheck 暴露迁移测试的未使用导入，已清理；早先进度消息在进程结束前误报通过，此处更正，最终结果待退出码确认。

`pnpm i18n:extract` 退出 0，六语言均 2016 条；逐个与 HEAD 比较 msgid/msgctxt/msgstr/续行完全相同，仅删除 19 行来源引用。无新 msgid，既有缺译数 ar/es/fr/hi 各 14、zh 5 未改变。

### 迁移保留的运行时断言

| 来源 | 新位置 | 保留的断言 |
| --- | --- | --- |
| top-nav-footer-view-parity | top-nav-controls | Dropdown renderTrigger 的按钮 ref、图标与钱包点击转发、ArrowDown 打开菜单、菜单选择一次、disabled 传递、无嵌套 button |
| market-header-view-parity | top-nav-controls | 收藏选择/删除分别收到 BTC，市场触发器原生 button ref/点击转发，无嵌套 button |
| trade-panel-view-parity | trade-form-views | TradeSlider 实际渲染 TradeSliderView；禁用零值 SSR 一致；input=0、thumb clamp/transform、五 ticks 及其 active 状态 |
| trade-panel-view-parity | trade-form-views | SizePercentInput 渲染 TradePercentFrameView、与真实 NumberInput 注入后的 frame 几何一致 |
| trade-panel-view-parity | trade-form-views | default/sm NumberInput 完整 class 与 getInputClassName 相同（包括自身 w-full）；TradeInputFrameView 使用原生输入和 NumberInput 时几何相同，原生 input ref 保留 |
| trade-panel-view-parity | trade-form-views | 控件和 CTA ref/点击；Advanced Dropdown ArrowDown/选择、禁用后阻止激活，无嵌套 button；四种 CTA variant/spinner/disabled 与 Button SSR 一致，Advanced 原 trigger/renderTrigger/直接 view 几何一致 |
| account-panels-view-parity | account-panel-views | focusableWhenDisabled 阻止点击及 Enter、允许 Tab；恢复 enabled 保持按钮 identity 并触发一次 |
| account-panels-view-parity | account-panel-views | AccountTableHeaderView scroll/actions ref 指向正确节点、仅有 actions 时增加 pl-3 |
| account-panels-view-parity | account-panel-views、grid-content-height | 真实 disconnected overview 五个格式化零、标签、标题、两个禁用动作、natural content part；真实 frame/content 用于自然高度观测 |
| account-panels-view-parity | account-panel-views | disabled action 的 aria-describedby 对应原因；赞助充值启用后同一按钮可点击、移除描述、Withdraw 仍禁用 |
| orderbook-panel-view-parity | orderbook-grouping-trigger | 原生 grouping ref/aria、Dropdown 键盘打开/选择一次、无嵌套 button；ladder ref、ask/bid style 和 row slots 原样传递 |
| mobile-views-parity | mobile-view-controls | 真实 TokenSelectorTriggerContent 的 Drawer focus/click 转发、单 button；mobile CTA md/lg 与 Button 的 enabled/disabled 和 spinner 几何一致；匿名钱包与 Drawer 图标按钮 class/结构、caret-free grouping；真实 size/slider/percent 的空值、0.00、五 ticks；RTL 下数字输入保持 LTR 而 slider RTL |
| dashboard-frame-view-parity | dashboard-frame-view | 所有 presets 的 desktop/mobile/testnet offset、headerless fixtures、optional footer、九页面 preset 与真实 chrome wiring、全部 preset class 常量及 frame 纯度。仅为旧 placeholder 路由映射服务的 getDashboardFrame 与对应测试删除 |
| 各 parity 的翻译检查 | i18n-hot-switch、top-nav、footer-bar、trade-terminal-page-boot | 旧 placeholder 热切检查删除；保留原有真实 nav、footer、orderbook/grouping、trade header/tabs/checkbox、account frame/buttons/rows identity 检查，并用真实 MobileTradeSizeControl 补充 en→zh input identity 与 1.25 草稿保留；增加持久 zh 的首帧和 busy→ready 检查 |

所有未删除的纯 view 仍有生产调用者；MobileTokenSelectorView 保留，MobilePositionsTabsView 保留而静态 strip 删除；SideToggle 的 sideBox/sideMobile 移回真实组件；dashboard presets 保留。`early-prefetch.ts` 的 terminal 表面预加载和 `geo-prefetch.ts` 的文档分类均仍有用途，无需修改。`LEGACY_SHELL_IMPORTS` 在本基线生产源码中已不存在。


## 浏览器测量（reviewer，2026-09-16，同一未提交工作区）

复核方式：通读全部 diff（28 删 / 72 改 / 11 增），核对 `StartupFallback`、`__root.tsx`、`trade-terminal-page.tsx`、`desktop-terminal-surface.tsx`、`mobile-terminal.tsx`、路由 `pendingComponent`、`vite.config.ts` 的 emitted chunk 插件、`boot-milestones.mjs` 与三份测量脚本的选择器；Biome 49 文件、`pnpm typecheck`、`pnpm i18n:extract`（六语目录 2016 条、仅删 114 行来源引用）通过。用 scratchpad 的 `refresh-timeline.mjs` 在开发服务器（:3005，冷上下文，CPU 1×）每 20 ms 记录：可见文本语言、是否存在旧壳标记、`html dir`、是否有非 sr-only 的 "Loading" 文案。

| 刷新场景 | 时间线（开发服务器，未打包模块，绝对时间偏慢） |
| --- | --- |
| `/trade/BTC`，持久化 zh，桌面 | 200 ms 空 → 590 ms 仅 sr-only 播报 → 5,032 ms 中文 chrome（导航/页脚，工作区空且 busy）→ 5,193 ms 中文内容；全程无英文导航、无旧壳标记 |
| `/portfolio`，持久化 zh | 108 ms 空 → 307 ms 仅播报 → 3,100 ms 中文 portfolio 页（含 TopNav）；**不再出现终端壳** |
| `/trade/BTC`，持久化 ar | 181 ms 播报 → 1,734 ms 仍为空但 `dir` 已切 rtl → 2,976 ms 阿拉伯语 chrome → 3,209 ms 内容；无 LTR 内容闪现 |
| `/trade/BTC`，en | 2,242 ms chrome → 2,362 ms 内容；2,362–2,992 ms 有一处可见 "Loading"，为挂载后 `chart-panel.tsx` 的 TradingView 加载态（既有行为，不属于启动占位） |
| `/trade/BTC`，持久化 zh，390×664 移动 | 105 ms 播报 → 2,331 ms 中文 chrome 与内容同帧 |

sr-only 的 `Loading GATU...` 会出现在 `innerText` 里但不可见（脚本另行核对 `output:not(.sr-only)`）。

### 生产构建计时（reviewer，`pnpm build` 产物经 `scripts/serve-spa-static.mjs` 于 :3030 静态托管，持久化 profile，visit 1 冷、visit 2–3 热）

| 场景 | chrome 出现 | 内容出现 | 备注 |
| --- | --- | --- | --- |
| `/trade/BTC` en | 640 / 514 / 518 ms | 719 / 567 / 572 ms | 无旧壳标记 |
| `/trade/BTC` zh | 485 / 565 / 496 ms | 654 / 630 / 556 ms | 全程无英文 |
| `/portfolio` zh | 221 / 257 / 221 ms | 同帧 | 无终端壳 |
| `/trade/BTC` ar | 537 / 537 ms | 953 / 636 ms | `dir` 在内容前切 rtl，无 LTR 内容 |
| `/trade/BTC` zh，CPU 4× | 900 / 1,277 ms | 1,318 / 1,277 ms | |
| `/trade/BTC` zh，390×664 移动 | 501 / 607 ms | 649 / 607 ms | |

对照同日官方终端 trace（chrome 1.4 s、内容 2.0 s），本方案在相同"空白到就绪"策略下仍快 2–3 倍。

## 全量套件与生产构建（reviewer，同一工作区）

- `pnpm --filter @gatu/terminal test`（564 文件 / 6272 用例）：11 文件失败——9 个基线红文件失败数不变，`chart-store`(1) 与 `mobile-agent-sync-route`(18) 为并发敏感（Codex 以 `--maxWorkers=2` 的全量中两者通过）。本任务未引入新失败。
- `pnpm build` 通过（含预渲染）：客户端总 gzip 3,080,649（较总基线 −74,058）；trade 静态启动闭包 1,568,176（较基线 −13,040）；移动运行时增量 111,709（+1,129）；桌面运行时增量 199,812（+7,824，占位删除后纯视图回到 trade chunk）；`_shell.html` 12,011 字节，body 仅 `startup-fallback` + sr-only 播报，无 `<header>`/`<nav>`/旧壳标记，预加载 90 个共享启动资源。构建不是发布。

## 后续与替代关系

ADR 0009 决策 2–5、7 被 ADR 0010 取代；历史迁移记录保留为证据。

## 第二检查点

完整 `pnpm typecheck` 已取得退出 0（hl-react、ui、terminal）；后续只增加迁移断言，结束前再次检查。首轮 `pnpm --filter @gatu/terminal test`：564 files，546 passed / 17 failed / 1 skipped；6266 tests，6204 passed / 61 failed / 1 skipped。本轮引入的 root gate mock 变化未通知 React Compiler 缓存子树，已改为按 gate 组合分别挂载测试并保留真实 i18n effect 解锁；trade label 的两个源码断言同步去掉 shell `.message` 写法，不修复 mobile risk 另一条既有失败。`global-modals-hip3-disclaimer` 低并发复跑 16/16 通过；`orderbook-boot` 首次动态导入仍触发 5 秒超时，等构建结束后隔离复跑。Vite development cache 测试的 listen EPERM 127.0.0.1:5173 为沙箱限制。

## 文件清单

以下为本次相对基线的变更（不含原有未跟踪 `.build/`）；未暂存或提交。

### 删除（28）

- `.claude/rules/placeholder-parity.md`
- `apps/terminal/src/components/dashboard/dashboard-content-placeholder-view.tsx`
- `apps/terminal/src/components/dashboard/dashboard-shell-skeleton.tsx`
- `apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx`
- `apps/terminal/src/components/trade/layout/desktop-grid-loading-surface.tsx`
- `apps/terminal/src/components/trade/layout/desktop-placeholders.ts`
- `apps/terminal/src/components/trade/layout/mobile-placeholders.ts`
- `apps/terminal/src/components/trade/layout/terminal-loading-workspace.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-loading-fallback.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-order-entry-placeholder-view.tsx`
- `apps/terminal/src/components/trade/orderbook/orderbook-tabs-view.tsx`
- `apps/terminal/src/components/trade/positions/account-tab-strip-view.tsx`
- `apps/terminal/src/components/trade/tradebox/side-toggle-view.tsx`
- `apps/terminal/src/components/trade/tradebox/trade-checkbox-view.tsx`
- `apps/terminal/src/lib/tests/account-panels-view-parity.test.tsx`
- `apps/terminal/src/lib/tests/app-shell-frame.test.tsx`
- `apps/terminal/src/lib/tests/app-shell-import-boundary.test.ts`
- `apps/terminal/src/lib/tests/boot-placeholder-contract.test.ts`
- `apps/terminal/src/lib/tests/dashboard-frame-view-parity.test.tsx`
- `apps/terminal/src/lib/tests/dashboard-shell-skeleton.test.tsx`
- `apps/terminal/src/lib/tests/market-header-view-parity.test.tsx`
- `apps/terminal/src/lib/tests/mobile-app-shell-skeleton.test.tsx`
- `apps/terminal/src/lib/tests/mobile-chrome-parity.test.tsx`
- `apps/terminal/src/lib/tests/mobile-views-parity.test.tsx`
- `apps/terminal/src/lib/tests/orderbook-panel-view-parity.test.tsx`
- `apps/terminal/src/lib/tests/skeleton-fallback.test.tsx`
- `apps/terminal/src/lib/tests/top-nav-footer-view-parity.test.tsx`
- `apps/terminal/src/lib/tests/trade-panel-view-parity.test.tsx`

### 新增（11）

- `.claude/rules/startup-rendering.md`
- `apps/terminal/src/components/startup-fallback.tsx`
- `apps/terminal/src/lib/tests/account-panel-views.test.tsx`
- `apps/terminal/src/lib/tests/dashboard-frame-view.test.tsx`
- `apps/terminal/src/lib/tests/mobile-view-controls.test.tsx`
- `apps/terminal/src/lib/tests/orderbook-grouping-trigger.test.tsx`
- `apps/terminal/src/lib/tests/root-startup-fallback.test.tsx`
- `apps/terminal/src/lib/tests/top-nav-controls.test.tsx`
- `apps/terminal/src/lib/tests/trade-form-views.test.tsx`
- `docs/adr/0010-blank-until-ready-startup.md`
- `docs/work-memory/sessions/2026-09-16-remove-startup-placeholders.md`

### 修改（72）

- `AGENTS.md`
- `CHANGELOG.md`
- `agent.md`
- `apps/terminal/src/components/trade/header/top-nav.tsx`
- `apps/terminal/src/components/trade/layout/desktop-terminal-surface.tsx`
- `apps/terminal/src/components/trade/layout/main-workspace.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-positions-tabs-view.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-terminal-frame-view.tsx`
- `apps/terminal/src/components/trade/mobile/mobile-terminal.tsx`
- `apps/terminal/src/components/trade/trade-terminal-page.tsx`
- `apps/terminal/src/components/trade/tradebox/side-toggle.tsx`
- `apps/terminal/src/config/account-labels.ts`
- `apps/terminal/src/config/app-route-surface.ts`
- `apps/terminal/src/config/dashboard-frames.ts`
- `apps/terminal/src/config/desktop-nav.ts`
- `apps/terminal/src/config/footer-links.ts`
- `apps/terminal/src/config/market-header.ts`
- `apps/terminal/src/config/nav.tsx`
- `apps/terminal/src/config/orderbook-labels.ts`
- `apps/terminal/src/config/trade-panel-labels.ts`
- `apps/terminal/src/config/trade.ts`
- `apps/terminal/src/lib/tests/app-route-surface.test.ts`
- `apps/terminal/src/lib/tests/desktop-grid-layout.test.ts`
- `apps/terminal/src/lib/tests/grid-content-height.test.tsx`
- `apps/terminal/src/lib/tests/home-route.test.ts`
- `apps/terminal/src/lib/tests/i18n-hot-switch.test.tsx`
- `apps/terminal/src/lib/tests/i18n-reactivity-contract.test.ts`
- `apps/terminal/src/lib/tests/mobile-order-risk-summary-contract.test.ts`
- `apps/terminal/src/lib/tests/mobile-order-safety-contract.test.ts`
- `apps/terminal/src/lib/tests/responsive-panel-layout.test.ts`
- `apps/terminal/src/lib/tests/root-provider-split.test.ts`
- `apps/terminal/src/lib/tests/root-route-transition.test.tsx`
- `apps/terminal/src/lib/tests/top-nav.test.tsx`
- `apps/terminal/src/lib/tests/trade-terminal-page-boot.test.tsx`
- `apps/terminal/src/lib/tests/vite-manual-chunks.test.ts`
- `apps/terminal/src/locales/ar/messages.po`
- `apps/terminal/src/locales/en/messages.po`
- `apps/terminal/src/locales/es/messages.po`
- `apps/terminal/src/locales/fr/messages.po`
- `apps/terminal/src/locales/hi/messages.po`
- `apps/terminal/src/locales/zh/messages.po`
- `apps/terminal/src/providers/client-runtime.tsx`
- `apps/terminal/src/router.tsx`
- `apps/terminal/src/routes/__root.tsx`
- `apps/terminal/src/routes/builders-perp.$dex.tsx`
- `apps/terminal/src/routes/builders-perp.index.tsx`
- `apps/terminal/src/routes/index.tsx`
- `apps/terminal/src/routes/perp.tsx`
- `apps/terminal/src/routes/spot.tsx`
- `apps/terminal/src/routes/trade.tsx`
- `apps/terminal/tests/browser/boot-milestones.mjs`
- `apps/terminal/vite.config.ts`
- `docs/README.md`
- `docs/adr/0005-spa-static-shell.md`
- `docs/adr/0006-startup-preloads-and-edge-caching.md`
- `docs/adr/0009-startup-placeholder-single-source.md`
- `docs/adr/README.md`
- `docs/desktop-grid-layout.md`
- `docs/mobile-data-presentation.md`
- `docs/order-entry-layout-audit.md`
- `docs/orderbook-layout.md`
- `docs/work-memory/INDEX.md`
- `docs/work-memory/sessions/2026-09-15-mobile-shell-parity.md`
- `docs/work-memory/sessions/2026-09-16-market-header-view-migration.md`
- `docs/work-memory/sessions/2026-09-16-orderbook-chrome-view-migration.md`
- `docs/work-memory/sessions/2026-09-16-placeholder-single-source-adr.md`
- `docs/work-memory/sessions/2026-09-16-top-nav-footer-view-migration.md`
- `docs/work-memory/sessions/2026-09-16-trade-panel-view-migration.md`
- `package.json`
- `scripts/measure/capture-client-root-waterfall.mjs`
- `scripts/measure/measure-boot-timing.mjs`
- `scripts/measure/profile-client-root-activation.mjs`


## 构建与预算检查点

首次 `pnpm build` 完成 client、SSR 和 Nitro 编译（394 个 client chunks），在 TanStack prerender 启动 preview server 时失败；沙箱已由 Vite fixture 的 `listen EPERM` 证实不允许监听端口。故没有本轮生产 `_shell.html` 或浏览器验收，不能声称完整构建通过。对同次生成的 `.output/public/assets` 独立运行 chunk-cycle 与 budget 脚本：无静态循环；总 gzip 3,078,961（基线 -75,746）、trade 静态闭包 1,566,652（基线 -14,564）均通过，但 trade-terminal-page 单块 128,862 超过既有允许值 1,620 字节。

按 ADR 0010 补充的边界设计，沿用原 summary 的 emitted chunk 策略把两个纯视图（mobile-book-chrome-view、market-overview-view）作为独立静态依赖输出，不引入动态等待、额外 client entry 或 root 对 terminal 的反向导入。没有改预算脚本的任何基线/阈值。`vite-manual-chunks` 15/15 通过，覆盖 summaries 与新增 view chunks 的依赖方向；第二轮 build/预算待结果。

验证过程还保留一次定向重跑：24 files 中 19 passed / 5 failed，344 tests passed / 17 failed；失败为构建并发下 orderbook-boot 首次 import 超时，以及 Biome 删除未使用首个 import 时连带移除了四个新测试的 jsdom 文件指令，导致 document 未定义。已恢复指令并改为只做普通格式化，最终全量复跑已确认这些新测试通过。没有通过放宽业务断言或超时阈值绕过失败。

## 最终产物检查

本节绑定本记录所列未提交工作树（基线见元数据），不代表发布或真实设备验收。第二轮 `pnpm build` 退出 1：client、SSR、Nitro 均编译完成，prerender 再次报 `Failed to start the Vite preview server for prerendering`。当前沙箱禁止监听端口（独立 Vite fixture 明确报 `listen EPERM 127.0.0.1:5173`）；未生成本轮 `_shell.html`，后续 preload injection/hash 收集与浏览器测量未执行，不能声称完整构建通过。

对本次 `.output/public/assets` 独立检查均退出 0：396 client chunks 无静态循环；总 gzip **3,080,771**（基线 **-73,936**），trade static closure **1,568,198**（基线 **-13,018**），mobile incremental **111,711**（+1,131），desktop incremental **199,779**（+7,791），trade-terminal-page **126,861**；全部预算通过，未修改任何基线或阈值。新增两个纯视图 chunk 保持静态加载与原依赖方向。

最后一次 `pnpm typecheck` 退出 0；`pnpm exec biome check <全部变更的现存 TS/TSX/MJS/JSON 文件>` 退出 0，按仓库 includes 实际检查 49 files（vite.config.ts 与 MJS 不在 Biome includes；Vite 配置由类型检查/15 条真实打包 fixture 测试验证，四个 measurement MJS 另经 `node --check` 通过）。真实 TopNav 最后一次 zh 首帧回归 28/28 通过。`git diff --check` 通过，index 为空；无 install/暂存/提交/切分支，原有 `.build/` 保留。

## 最终测试与交接

最终全量 `pnpm --filter @gatu/terminal test --maxWorkers=2`（完整测试集合，仅降低并发）退出 1，用时 589.39s：**564 files = 553 passed / 10 failed / 1 skipped；6,272 tests = 6,238 passed / 33 failed / 1 skipped**。本次新增/迁移以及 root、trade boot、i18n、grid 相关测试通过。第一次原始默认并发命令的失败结果保留在前述检查点。

| 最终失败 suite | 失败数 | 范围 |
| --- | ---: | --- |
| adaptive-modal-swipe-dismissal | 3 | 用户列出的既有基线 |
| desktop-positions-panel-shell | 18 | 用户列出的既有基线 |
| mobile-input-zoom-contract | 2 | 用户列出的既有基线 |
| mobile-order-risk-summary-contract | 1 | 用户列出的既有基线，未修复业务断言 |
| mobile-trade-tp-sl-contract | 1 | 用户列出的既有基线 |
| orders-table-visual-contract | 1 | 用户列出的既有基线 |
| position-market-close-modal | 1 | 用户列出的既有基线 |
| referral-ui-contract | 3 | 用户列出的既有基线 |
| tests/global-settings-slippage-effective | 2 | 用户列出的既有基线 |
| vite-development-cache | 1 | 沙箱 listen EPERM，非界面回归 |

并发敏感的 mobile-agent-sync-route、establish-connection-modal、chart-store、portfolio-overview，以及初轮失败的 orderbook-boot、global-modals-hip3-disclaimer 在最终全量中通过。未为已知失败放宽断言；无浏览器实测结论，reviewer 栏保留空缺。最终 `pnpm memory:index && pnpm memory:check && pnpm memory:test` 退出 0（8/8）；`git diff --check` 退出 0。

## 后续（2026-09-16）：市场头指标行抖动

用户报告刷新时市场头抖动。`header-jitter.mjs`（每 40 ms 记录市场头各盒子）在生产构建上定位：挂载时六个指标值是可见的 `-`/`—`（Mark 22 px、Oracle 29、24h Change 54、Volume 54、OI 63、Funding 86），76 ms 后首条 `activeAssetCtx` 快照到达，列宽变为 43/43/85/117/117/122，Oracle 右移 20 px、24h Change 34、Volume 66、Open Interest 129、Funding 183；此后 `tabular-nums` 使盒子稳定。根因：`market-overview.tsx` 在快照前把短横线当值传入内容自适应宽度的列。

官方终端核对（`hl-infobar.mjs`，`/trade/BTC` → 切换 ETH）：初始加载信息栏在 2,001 ms 出现时已完整带值，之前不存在；切换市场后旧值保留至约 1.6 s，信息栏消失约 0.4 s，再以 ETH 数据完整出现，过程中无短横线。

修复：`MarketOverviewView` 新增 `pending` prop（section `aria-busy`、`data-market-overview-state`，指标行 `invisible`）；`MarketOverview` 以 `liveCtx === undefined` 为 pending，切换市场时随订阅重置回到 pending（不显示上一市场的值，比官方严格）。新增两条测试：首帧 pending/不可见、快照后 ready 且节点身份不变；同实例切换市场回到 pending 再就绪。`market-overview`(30)、`mobile-market-bar`、`i18n-reactivity-contract`、`hidden-horizontal-scrollbar-contract` 通过，terminal typecheck 通过。开发服务器复测：挂载帧 pending/hidden → 77 ms 后 ready/visible，各列直接为最终位置，之后 7 s 内零盒子变化。

## 后续（2026-09-16）：字体换字导致的市场头横向收缩

用户报告指标行修复后 Oracle / 24h Change / 24h Volume 等刷新时仍"左右缩"。`header-jitter.mjs` 加 `FONT_DELAY=2500`（`page.route` 把 woff/ttf 请求延迟 2.5 s）在修复前的生产构建复现：3,929 ms 字体到达时六个标签宽度 23.4→22.4、30.3→29.3、56.4→53.7、55.2→54.1、62.9→62.5、91.6→85.6 px，市场触发器 195.8→186.6，市场名 84.5→75.4，徽章与指标行 x 274.8→265.6；`document.fonts.status` 在 3,939 ms 由 loading 变 loaded。根因：`@fontsource-variable/inter` 的 index.css 与本地 IBM Plex Sans Variable 声明均为 `font-display: swap`，首帧以系统回退字体排版并绘制，webfont 到达后换字重排。

官方核对：`app.hyperliquid.xyz` 的 `config-*.css` / `index-*.css` 中 OurFont/OurFontBold（Inter）、LogoFont、Teodor 的 `@font-face` 都不声明 `font-display`（浏览器默认 block 期），与此前冷加载 trace 中 chrome 无文字约 750 ms、文字随 Inter 在 1,427 ms 出现一致；未见回退字体绘制。

修复：(1) `styles.css` 移除 fontsource `@import`，显式声明 Inter Variable 七个子集与 IBM Plex Sans Variable，全部 `font-display: block`；构建产物 `styles-Bx6CbX6Q.css` 含 8 处 `font-display:block`、0 处 swap，`_shell.html` 对两份 latin 文件的预加载不变。(2) 新增 `lib/fonts/font-readiness.ts`（`areFontsReady` / `waitForFonts`，上限 `FONT_READY_TIMEOUT_MS` 3 s，缺少 API 或加载失败按就绪）与 `hooks/ui/use-fonts-ready.ts`。(3) `__root.tsx` 的 `I18nReadyGate` 改为 `StartupReadyGate`，同时等待持久语言目录与 Inter / IBM Plex 各一规格。(4) `MarketOverview` 的 pending 叠加 IBM Plex 两规格就绪。

测试：新增 `font-readiness`（6）、`startup-font-display-contract`（3）、`root-startup-fallback` 字体门控用例与 `market-overview` 字体 pending 用例；`root-provider-split` 改指向新门控名。定向运行 60/60 通过，terminal typecheck 与 Biome 通过。全量 `pnpm --filter @gatu/terminal test`（默认并发，163.7 s）：566 files = 555 passed / 10 failed / 1 skipped，6,285 tests = 6,234 passed / 50 failed / 1 skipped；失败的 9 个文件为前文列出的既有基线（desktop-positions-panel-shell、global-settings-slippage-effective、referral-ui-contract、adaptive-modal-swipe-dismissal、mobile-input-zoom-contract、position-market-close-modal、orders-table-visual-contract、mobile-trade-tp-sl-contract、mobile-order-risk-summary-contract），另一个 mobile-agent-sync-route 为并发敏感文件，单独重跑 20/20 通过；未放宽任何断言。`pnpm memory:index/check/test` 与 `pnpm i18n:extract` 均无变更。

生产实测（本地静态 3030，热访问，headless Chromium 1440×900）：`FONT_DELAY=2500` 下市场头在 2,630 ms 挂载时 `document.fonts.status` 已为 loaded，市场名 75.4、触发器 186.6、徽章 162.4 / 204.1、指标行 x 265.6 即为最终值；2,844 ms pending→ready 指标行整体显现，之后 8 s 内只有数值文本变化，盒子零位移。无延迟三次：en chrome 483–576 ms、指标就绪 678–921 ms；zh chrome 493–508 ms、就绪 639–752 ms，首帧即中文标签（标记价 / 预言机 / 24小时变化 / 24小时成交量 / 未平仓量 / 资金费率），与字体门控前的 0.51–0.64 s 同量级。构建通过：总 gzip 3,081,390（基线 −73,317），trade 静态闭包 1,568,753（−12,463），移动增量 111,717（+1,137），桌面增量 199,778（+7,790），未改基线。

限制：并发 `pnpm build` 写入 `.output/` 时 Vite 开发服务器会对每个产物触发整页 reload，本轮开发服务器测量因此无效，只采信生产构建；浏览器测量不代表真实设备验收。
