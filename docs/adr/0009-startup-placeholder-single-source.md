# ADR 0009：启动占位与真实界面共享同一展示组件

- 状态：已接受（2026-09-16），表面 1–7 迁移已完成并通过 Playwright 盒子实测（2026-09-16）；修订 [ADR 0005](0005-spa-static-shell.md) 决策 13 中"惰性标记"的实现方式，不改变壳的存在、预渲染与水合方式
- 前置：[ADR 0005](0005-spa-static-shell.md)（预渲染 SPA 壳）、[ADR 0006](0006-startup-preloads-and-edge-caching.md)（启动预加载与边缘缓存）
- 规则：[启动占位一致性规则](../../.claude/rules/placeholder-parity.md)
- 证据：[移动占位壳与真实终端逐像素对齐](../work-memory/sessions/2026-09-15-mobile-shell-parity.md)、[热访问启动计划与实测](../work-memory/sessions/2026-09-16-warm-visit-startup-plan.md)、[本 ADR 的任务记录](../work-memory/sessions/2026-09-16-placeholder-single-source-adr.md)

## 背景与约束

壳必须在 JavaScript 到达前画出结构，因此只能是构建期生成、不依赖运行时（订阅、store、钱包 provider、Lingui 运行时）的静态 HTML；这一点由 ADR 0005 确立，本记录不改。问题出在壳的实现方式：`apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx` 里的 `DesktopHeaderFrame`、`FavoritesFrame`、`MarketHeaderFrame`、`ChartFrame`、`OrderBookFrame`、`TradePanelFrame`、`AccountTableFrame`、`AccountInfoFrame`、`DesktopFooterFrame` 与 `MobileShellSkeleton`，都是照着真实组件手写的平行标记，与 `top-nav.tsx`、`favorites-strip.tsx`、`market-overview.tsx`、`orderbook-panel.tsx`、`trade-panel.tsx`、`positions-panel.tsx`、`account-panel.tsx`、`footer-bar.tsx` 及六个移动组件不共享任何组件；运行时占位 `terminal-loading-workspace.tsx` 与 `mobile-loading-fallback.tsx` 再用翻译标签渲染同一批 frame，于是同一个界面存在三份实现。唯一共享的是网格几何：`desktop-grid-loading-surface.tsx` 与 `config/desktop-grid-layout.ts` 用同一份默认布局并有测试钉住，所以七个面板外框一致而面板内部全部不一致。

2026-09-15 的桌面实测（1440 宽，Playwright，见任务记录）：市场头六个指标标签的 x 坐标 109/160/229/320/392/470 在真实面板变为 266/380/494/688/848/1008，位移 157 到 549 px；名称 14 px Inter 变 16 px IBM Plex 并右移 8 px；顶栏 Earn 旁可见的 "Soon" 让后续五项左移 29 px；Connect Wallet 144 px 变 125 px；页脚缺时钟让链接左移 74 px；收藏星 `px-3` 对 `px-2`。移动端改动前：市场栏 48 变 67 px，交易区 294 变 448 px，账户标签下移 181 px。移动端随后用共享 class 常量（`mobile-chrome-classes.ts`）把几何对齐，但仍是第二份 JSX，新增元素仍要手抄。

官方终端实测（2026-09-16，4G 仿真）：chrome 先出现，市场头区域留空，市场头与数据在同一帧一次渲染；它的 `info-bar-grid` 是 `grid-template-columns: repeat(6, auto); gap: 32px`，每个指标是标签/数值两行、12 px、数值等宽字体、标签首字母大写，六项在 1440 宽下全部可见。官方没有占位实现，因此没有一致性问题，代价是内容区空白（热访问 1.4 秒、中档手机 3 秒以上）。

不变的约束：壳只预渲染一次并水合，标签用英文源串（翻译标签会与预渲染 HTML 不一致、迫使 React 丢弃壳）；壳模块在水合入口里，不能引入运行时依赖；预算与重新基线规则；`docs/mobile-data-presentation.md`（占位只是展示，所有守卫不变）与 `docs/i18n-presentation.md`（展示辅助必须显式接收翻译依赖）。

## 目标与决策

目标：壳、运行时占位与真实界面之间不存在第二份标记；任何几何、字体、间距的变化只在一个地方发生，一致性由构建与测试保证而不是人眼。

1. **展示组件是几何的唯一来源。** 每个启动可见表面拆出只接 props 的展示组件（文件名 `*-view.tsx`）：不使用 hook，不 import store、订阅、Lingui 运行时或 `window`，可在构建期渲染且给定 props 时输出确定。运行时容器负责取数、翻译与事件，算出 props 后渲染展示组件；壳和运行时占位用占位 props 渲染同一个展示组件。适用表面：桌面顶栏项与工具按钮、收藏条、市场头（名称触发器视图、指标行）、图表框、订单簿 chrome（页签、列头、价差行、分组底栏）、下单表单框架（控件行、多空切换、可用、尺寸输入、滑杆、选项、汇总行、CTA）、账户表页签行、账户概览行、页脚；移动端的头部、市场栏、嵌入表单、紧凑订单簿 chrome、账户页签行、底部导航；仪表盘壳。
2. **占位 props 只有一份。** 每个表面一个占位常量对象，标签取自同一批 Lingui `msg` 描述符的英文源串（壳）或经 `t` 翻译（运行时占位）；2026-09-16 修订：未知文本以典型值的隐形样本文字预留宽度而不显示短横线，可见 `-`/`—` 仅保留于真实组件自身数据到达前的输出，运行时占位可显示路由已知的交易对名称、市场类型及路由对应收藏激活态，并传入已持久化且同步可读的 UI 状态（当前页签、底部导航项），预渲染壳只传默认值且不激活收藏。
3. **三份占位合一。** `AppShellSkeleton`、`TerminalLoadingWorkspace`、`MobileLoadingFallback` 退化为只组装占位 props 的薄层；`renderDesktopPanelFrame` 与 `mobile-chrome-classes.ts` 在对应表面迁移完成后删除。桌面网格几何仍由 `desktop-grid-loading-surface.tsx` 镜像 `config/desktop-grid-layout.ts`，这部分不变。
4. **导入边界与契约测试取代人眼对齐。** 壳模块只允许 import 展示组件、`config/*`、`lib/cn`、`@phosphor-icons/react` 与品牌 logo，由源码契约测试钉住；每个展示组件配一条一致性测试：分别用占位 props 与一份样本真实 props 渲染，断言两次渲染的 DOM 结构与影响几何的 class 完全一致，只允许文本、`data-*` 与颜色类不同。每个表面迁移后用 Playwright 在桌面 1440/1280/1030 与移动 390/360/430 视口、深浅主题、英文与中文下实测壳与真实界面的元素矩形，位移必须为零（文本宽度差除外），结果写入任务记录。
5. **`inert` 取代"禁止 button、nav、a"。** 展示组件渲染真实元素（按钮、链接、表单控件），壳的装饰层在 `aria-hidden` 之外加 HTML `inert` 属性，使整棵树不可点击、不可聚焦、不进无障碍树；`aria-busy` 与 `<output>` 播报、无动画、无定时器的要求不变。`boot-placeholder-contract` 与 `app-shell-frame` 测试改为断言 `inert`，不再断言不含 `button`。
6. **市场头对齐官方做法。** 作为第一个迁移表面，指标行改为内容自适应列加固定间距，去掉每列固定 `min-w`，标签统一首字母大写（Mark、Oracle、24h Change、24h Volume、Open Interest、Funding / Countdown 的对应译文）；这同时解决真实面板在 1440 宽以下把后两列裁掉的问题。这是用户可见的 UI 变更，随该表面的提交进 `CHANGELOG.md`，其它表面的视觉不变。
7. **迁移顺序与提交粒度。** 每个表面一次提交，包含展示组件、容器改造、占位常量、一致性测试与实测证据；顺序：桌面市场头与收藏条 → 顶栏与页脚 → 订单簿 chrome → 下单表单框架 → 账户表页签行与账户概览 → 移动端六个表面 → 仪表盘壳。迁移期间未迁移的表面继续使用现有 frame，因此每一步都可独立发布。

## 备选方案与取舍

- **官方做法：内容区不画占位。** 零漂移、最简单，但放弃壳在 JS 前提供的结构，热访问空白 1.4 秒、中档手机 3 秒以上（2026-09-16 实测）。保留为兜底：某个表面若无法拆出确定性的展示组件，该面板留空表面而不是手写占位。
- **构建期让真实应用以占位数据渲染并抓取 DOM 作壳，运行时挂到另一个根节点后整体替换。** 一致性由构建保证、无需重构组件，但要放弃水合、改造挂载与替换逻辑，推翻 ADR 0005 决策 12 到 14 的整条启动链，风险不成比例；否决。
- **继续用共享 class 常量。** 即移动端当前做法。几何一致但标记仍是两份，新增元素、条件分支和结构变化都需要手抄；只作为迁移完成前的过渡。
- **直接在壳里渲染真实组件树。** 真实组件依赖 provider、订阅与客户端持久化状态，构建期不可渲染；即使 mock，水合闭包会变成整个终端，与预算和启动链目标冲突；否决。

## 后果与边界

- 表面 7：dashboard 页面、运行时 fallback 共用 `DashboardFrameView`；`config/dashboard-frames.ts` 原样保存各页 canvas/main 类。桌面 TopNav 与 FooterBar 都是 fixed，保留 header/testnet offset 和 `pb-8`；移动 header 为文档流中的 sticky，移动不显示 footer。壳复用现有 TopNav/MobileHeader/FooterBar 视图与占位 props，导航激活态从路由和 `DESKTOP_NAV_ITEMS` 得出，装饰树整体 inert。页面继续持有数据 hooks、geo/wallet 守卫和 lazy 模态框，fixture 仍不显示 chrome。
- Dashboard 内容依然是通用中性标题、四卡片和表格块，由 `DASHBOARD_CONTENT_PLACEHOLDER` 配置；共享范围是 frame 与 chrome，不承诺内容块与每页的数据 UI 等高。容器宽度和 padding 来自同一 preset，禁止为各页数据 UI 复制第二份占位树。未知应用路由采用三个历史页共有的 preset（`/funding-history`：`bg-grid-container`、1440px、移动 px-4/py-5、桌面 px-10/py-6）；Vault 详情共用 Vaults，`/join/*` 共用 Referrals，驼峰历史 URL 映射到对应 preset。首次水合仍按 ADR 0005 复现 terminal 壳，水合后才按已提交 pathname 选择 dashboard。配置来源、断言与待测表见[表面 7 任务记录](../work-memory/sessions/2026-09-16-dashboard-shell-view-migration.md)。

- 表面 6：六个移动表面与终端外框共享 props-only 视图，`mobile-chrome-classes.ts` 已删除，类常量归拥有标记的视图。移动下单复用现有输入框、滑杆、多空、选项与 CTA 视图的显式变体；盘口仅抽取 chrome，运行时仍持有行、测量、悬停、脉冲和订阅。静态移动账户页签沿用表面 5 的 indicator 例外并以 xxs primitive SSR 钉住。运行时占位订阅翻译、数字格式与已验证持久页签，显示路由已知资产；壳只用英文默认值。两套浏览器服务均受沙箱 `listen EPERM` 阻止，验收数字尚未取得，见[接口、断言与验证记录](../work-memory/sessions/2026-09-16-mobile-views-migration.md)。

- 表面 5：账户表 header、账户概览及外框共享纯视图，InfoRow/InfoRowGroup 是允许的纯 UI 组合；内容宽度页签的静态下划线放在激活按钮内，作为与 Base UI 测量 CSS 变量驱动的 sibling indicator 唯一结构例外，由去除双方 indicator 后的 SSR 对照与独立 class 断言固定；`renderDesktopPanel` 接收统一类型 props，运行时读取有效持久页签与数字格式版本，资金/签名/地区守卫不变；TradingView 在 iframe 内，ChartFrame 继续使用已约定的居中品牌占位，验证及待测范围见[迁移记录](../work-memory/sessions/2026-09-16-account-panels-view-migration.md)。

- 表面 4：桌面下单框架、默认字段、CTA 与汇总行共享纯视图；滑杆与百分比输入由真实容器渲染共享视图，原生输入共用纯 input-styles；静态切换与 checkbox 以真实 SSR 输出钉住几何，输入和交易守卫仍由原运行时组件持有，验证与待实测项见[迁移记录](../work-memory/sessions/2026-09-16-trade-panel-view-migration.md)。

- 表面 3：桌面订单簿列头、侧容器和价差共用纯视图，页签与分组按钮以 primitive SSR 对照钉住几何；静态页签视图自带与 Base UI 指示条同类的下划线（两等宽页签，left 0%/50%、width 50%），避免真实面板挂载后下划线突然出现；数据前分组与价差显示 `—`，行渲染、测量、悬停、脉冲和订阅仍由运行时管理，验证范围见[迁移记录](../work-memory/sessions/2026-09-16-orderbook-chrome-view-migration.md)。

- 表面 2：顶栏、页脚与桌面外框复用纯视图；Dropdown 增加可选 renderTrigger，将交互行为附到共享按钮，默认调用路径不变。占位只渲染匿名 Connect Wallet，真实匿名按钮与连接中/加载占位统一使用 min-w-[9rem]。预渲染壳无法知道 testnet 与地区状态，因此不显示 TestnetBanner/GeoRestrictionBanner，运行时仍保持原守卫与 banner offset。页脚 clock=null 使用不可见 00:00 AM 保留宽度，状态为不旋转的 Connecting。验收使用结构/class 一致性与 reviewer Playwright 盒子测量。
- 展示组件进入壳的水合闭包，必须保持轻量：只含标记与 class，不引入新的依赖；预算脚本继续约束静态启动闭包。
- 实际成本（2026-09-16，表面 1–6 全部迁移后）：trade 静态启动闭包较 `check-client-bundle-budget.mjs` 原基线 1,570,221 增加 10,995 gzip 字节（+0.7%），主要落在根路由/壳所在的 `vendor-tanstack-router` 块（占位 props 常量、壳组合、英文源串描述符），`trade-terminal-page` 块相应缩小约 1 KB；超出原 10,000 字节允许增量 995 字节，已把该项基线重设为 1,581,216 并保留 10,000 字节的后续允许增量。客户端总 gzip 3,086,273 仍低于总基线 68,434 字节。
- 预渲染壳仍是英文源串（ADR 0005 决策 13 的理由不变）；运行时占位与真实界面用翻译标签，两者的几何由同一展示组件保证，文本宽度差异属预期。
- 展示组件必须确定：不读时钟、随机数或 `window`；页脚时钟这类运行时值由容器传入，壳传固定宽度占位。
- 占位是展示，不是状态：签名、账户模式、资金、地区、新鲜度与动作可用性的守卫全部不变（`docs/mobile-data-presentation.md`）。
- 迁移完成前，桌面 frame 的既有偏差（上文测量值）继续存在；每迁移一个表面消灭该表面的偏差。
- 仪表盘 frame 与 chrome 已沿用同一规则完成代码迁移；内容泛化例外和 reviewer 实测范围如上。

## 验证证据

本记录只含决策，验证按决策 4 逐表面执行并写入对应任务记录；接受标准是一致性测试通过且 Playwright 实测位移为零。2026-09-16 的现状测量见前置的两份任务记录。

表面 1 的实现及实际验证范围见[市场头与收藏条迁移记录](../work-memory/sessions/2026-09-16-market-header-view-migration.md)；该记录中的待测项不视为验收完成。

表面 2 的接口、断言变更与验证范围见[顶栏、页脚与外框迁移记录](../work-memory/sessions/2026-09-16-top-nav-footer-view-migration.md)；代码完成不代表 Playwright 验收或发布完成。
