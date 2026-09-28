<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-top-nav-footer-view-migration",
  "date": "2026-09-16",
  "title": "桌面顶栏、页脚与外框单一来源迁移",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "顶栏、页脚与外框共享视图迁移及后续 reviewer 验证已记录；启动占位部分已由 ADR 0010 取代，真实展示组件继续使用，历史失败和验证边界保留。",
  "thread": null,
  "baseCommit": "d43d50683a2641aa79d4a851d629e68568e3c4af",
  "commits": ["dc68631a", "998515a5"],
  "sources": [
    {
      "path": "docs/adr/0009-startup-placeholder-single-source.md"
    },
    {
      "path": "packages/ui/src/dropdown.tsx"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-16-remove-startup-placeholders.md"
    }
  ],
  "supersedes": []
}
-->
# 桌面顶栏、页脚与外框单一来源迁移

## 背景与范围

用户要求 surface 2，基线 `d43d50683a2641aa79d4a851d629e68568e3c4af`（表面 1）。初始未跟踪 `.build/` 保留；未取得会话 ID，thread=null。本记录是当前任务同步摘要，不是原始对话转录。按用户要求未安装、未暂存、未提交、未 stash、未移动文件或切换分支。

## 结论与依据

按 ADR 0009 决策 1–5、7 抽取六个 props-only 视图。共享配置保留 Lingui 描述符的英文 `.message`；运行时用 reactive `t` 翻译，壳以静态英文组装。仅匿名桌面钱包 CTA 的最小宽度按任务决定统一为 144px；连接账户的菜单、签名/资金/地区守卫保持运行时控制。

- 删除手写 `DesktopHeaderFrame`、`DesktopFooterFrame`、`NAV_LABELS`、旧 shell `FOOTER_LINKS`、`ICON_BUTTON_CLASS`。`CONTROL_BUTTON_CLASS` 仍被未迁移的 TradePanelFrame 使用，因此保留，符合任务的“if unused”。
- `DesktopTerminalFrameView` 供真实 desktop surface 和 shell 共用。两边都是 min-h-dvh、pb-8、pt-14 / banner offset；shell workspace 为 `main.min-h-0.flex-1.bg-grid-container`，去掉旧 h-screen/overflow-hidden，保留切换 data 属性和内联媒体样式。
- TestnetBanner、GeoRestrictionBanner 仍由运行时提供。预渲染壳不知道 network/geo，故不传 banner/notice；壳仅显示匿名钱包，不预测已连接账户。
- Soon 是 disabled button 内的 sr-only 文本；1181px compact 条件、logo 间距、语言标签和 utilities 包装层由视图/视图常量持有。更多菜单内容、router Link、存款可用性及用户菜单仍由容器提供。
- FooterBar 仍读取实时 API 状态，market-loading 只禁用 command。shell 使用无动画 SpinnerGapIcon + Connecting/text-warning。两个分隔规则复制 Divider 的已解析 classes，作为 aria-hidden 装饰 div；clock=null 在原 span 内显示不可见 `00:00 AM`，ClientOnly fallback 也保留该位置，无新增计时器。
- Dropdown 选择新增 `renderTrigger?: ReactElement`，传到 Base UI Menu.Trigger.render。默认 trigger/class/caret/size 路径不变；自定义视图转发 ref、原生事件和状态属性并拥有全部触发器几何。无 trigger DOM 差异豁免；链接 a/span 是设计允许差异，交互/aria/data 属性不作为几何，动画和 clock invisible 仅在明确类别豁免。
- HeaderIconButtonView 保留 ButtonIcon 的已解析 ghost/neutral/sm classes（含 before hit area），主题按钮保留旧覆盖；disabled 时省略传入 tabIndex，防止 disabled native button 在 jsdom 中因为 primitive 的显式 tabindex 仍被 focus() 聚焦。DesktopUtilitiesMenu 同时向 PopoverTrigger 传 disabled，保留关闭/拒绝打开逻辑。
- `MobileShellSkeleton` 及其 props/label 区段与 HEAD 逐字比较一致，`mobile-chrome-classes.ts` 未修改。共享 ThemeToggle/LanguageSwitcher 的内部按钮接入纯视图，默认类和菜单行为保留，由额外回归覆盖。

## 文件与接口

新增文件（路径省略统一前缀 `apps/terminal/src/`）：

| 文件 | Props / 职责 |
| --- | --- |
| `components/trade/layout/desktop-terminal-frame-view.tsx` | `bannerOffset?: boolean`, `banner?`, `header`, `notice?`, `workspace`, `footer`: ReactNode；透传 div props/ref/className。拥有外框和 banner offset。 |
| `components/trade/header/top-nav-view.tsx` | `items: readonly {id,label,active,soon?,soonLabel?,compactHidden?}[]`；`renderItem?(item,className)`；`moreLabel`, `navigationLabel`；`compactMoreTrigger?`, `moreTrigger?`, `logo`, `logoClassName?`, `pairing?`, `wallet`, `theme`, `language`, `settings`, `compactUtilities?`；`compactHiddenWhenConnected`, `connected?`, `bannerOffset?`。拥有导航及各插槽响应式布局。 |
| `components/trade/footer/footer-bar-view.tsx` | `icon`, `text`, `tone`；`commandDisabled`, `commandLabel`, `commandKey`, `onCommand?`；`links: readonly {id,label}[]`, `linksLabel`, `renderLink?(link,className)`；`clock: string|null`, `version`。 |
| `components/trade/header/nav-menu-trigger-view.tsx` | `variant?: "more"|"language"`, `label?`, `icon?`, `active?`, `compactLabel?`, `labelClassName?`；透传 button props/ref/className。More 的 caret 和 Language 的可隐藏 label 在同一按钮视图。 |
| `components/trade/header/header-icon-button-view.tsx` | 必需 `aria-label`，children 和所有原生 button props/ref/className。 |
| `components/trade/header/wallet-cta-view.tsx` | `label: string` 和原生 button props/ref/className；导出 `USER_MENU_BUTTON_MIN_WIDTH`。 |
| `config/desktop-nav.ts` | 主导航描述符、路径、soon/compactHidden 标记及导航/钱包/语言/设置/主题 aria 文案。 |
| `config/footer-links.ts` | footer links 路径与描述符，四种状态、导航/command aria 文案和 ⌘K。 |
| `lib/tests/top-nav-footer-view-parity.test.tsx` | 新视图结构、几何、primitive 兼容性、菜单交互及纯度测试。 |

变更的实现文件：`top-nav.tsx`、`footer-bar.tsx`、`desktop-terminal-surface.tsx`、`app-shell-skeleton.tsx`、`desktop-placeholders.ts`、`user-menu.tsx`、`theme-toggle.tsx`、`language-switcher.tsx`、`desktop-utilities-menu.tsx`，以及 `packages/ui/src/dropdown.tsx`。

`desktop-placeholders.ts` 新增 TOP_NAV_PLACEHOLDER / FOOTER_PLACEHOLDER。仍为 `.ts`，使用 React.createElement 组装静态 icon/view slots，theme 同时含 SunIcon/dark:block 和 MoonIcon/dark:hidden；不引入 hooks/stores/runtime UI。import-boundary 例外列表三个项目都仍实际使用，不能删去；placeholder 模块白名单扩展为 config、pure views、React createElement、图标与品牌 logo。

六个 `locales/*/messages.po` 更新来源位置。Codex 曾新增 msgid `English`（含六语译文），reviewer 复核时改为直接使用 `config/i18n` 的 `locales[defaultLocale]`（见下文），该条目已从目录移除；已有缺译数量 ar/es/fr/hi 各 14、zh 5 与本轮无关。

文档变更：CHANGELOG 的匿名 CTA、共享 chrome 和时钟槽；ADR 0009 表面 2 状态和 banner/匿名边界；desktop-grid-layout 外框参考；packages/ui README 的 renderTrigger API；本记录与生成 INDEX。

## 测试断言变更（完整清单）

- 新 parity 测试：placeholder nav 对 sample real links/实际 Dropdown 的逐元素 tag 与几何 class 对比；仅 nav anchor→span、text/tone/invisible/runtime spinner 动画允许差异。验证 disabled + sr-only Soon、四项 compactHidden、wide/compact More、语言标签、匿名 logo margin、双 theme icons；footer 的 links/clock/dividers/command disabled；钱包 min-w 两边一致；两种 frame offset；shell inert/fixed chrome/main scrolling wrapper；native events/ref、Dropdown ArrowDown 打开和 item selection、disabled；语言 trigger 原生/primitive 两边 class/innerHTML 相同；与旧 ButtonIcon/Button/Dropdown 已解析 classes 对照；六视图无 hook/Lingui/UI package/browser/clock/comment 及 runtime 接线。
- `boot-placeholder-contract`：AppShell “禁止 TopNav/nav”改成要求 TopNavView/FooterBarView 并保留 inert；dashboard 原约束不变。无动画扫描新增 placeholder 数据和六视图；原计时器约束保留。
- `app-shell-import-boundary`：shell 直接导入约束及无用例外检查不变；placeholder 数据的 config-only imports 扩为上文纯依赖白名单，禁止 hooks/Lingui runtime/window/clock 的检查保留。
- `app-shell-frame`：只更新 inert 测试标题；增加 min-h-dvh/overflow-x-hidden/pb-8/pt-14、无 h-screen、main wrapper、fixed header/footer、invisible clock 断言。已有面板数、可见占位、inert、播报和移动区段断言保留。
- `top-nav`：Dropdown mock 接受 renderTrigger 并传 aria-label；wide/compact 菜单定位改为 view 的两个包装节点，utilities 的 class 定位改为父包装节点。原路由、链接、外链 rel/target、菜单内容、存款守卫、disabled 不可聚焦、连接状态变化不 remount 用户菜单等断言保留。新增 en→zh→en 的 Trade/aria-label/Soon 更新及相同 nav/link/wallet DOM 节点断言。
- `footer-bar`：现有实时状态、spinner、legal links、market-loading disabled、command click 和 Arabic landmark 翻译断言原样保留；新增两个分隔规则、可见非空 runtime clock 检查。
- `user-menu`：新增真实匿名 desktop-nav CTA 的 min-w-[9rem] 和可点击检查；其余连接、恢复、移动、导出和菜单断言不变。
- 无需改断言的指定组：`market-header-view-parity`、`mobile-app-shell-skeleton`、`mobile-chrome-parity`、`rtl-financial-ui-contract`、`language-switcher-placement`、`desktop-grid-layout`、`grid-content-height`、`root-route-transition`、`skeleton-fallback`。这些测试已针对新接线运行，不为迁移修改无关源码断言。

## 验证与限制

验证对象：2026-09-16，基线 d43d5068 上本任务未提交工作区。初轮检测到仍使用的 CONTROL_BUTTON_CLASS 被误删、旧 import/nav 禁止断言，以及 Link union/undefined 类型错误，均已修复。第二轮只有 compact utilities disabled focus 失败；在 primitive 和 native button 边界修复，未放松断言。额外 primitive 精确 class 对照发现 CTA 漏带旧 rounded-8/shadow-raised，补回已解析 classes 后通过。

实际最终输出在下面追加；此前中间检查不代替最终版本检查。

Playwright 实测由 reviewer 在下文「Reviewer 复核与实测」补齐；Codex 执行阶段未启动浏览器测量，也未运行 terminal 全量套件或构建。

## 最终验证命令

```bash
pnpm --filter @gatu/terminal exec vitest run src/lib/tests/top-nav-footer-view-parity.test.tsx src/lib/tests/market-header-view-parity.test.tsx src/lib/tests/app-shell-import-boundary.test.ts src/lib/tests/boot-placeholder-contract.test.ts src/lib/tests/app-shell-frame.test.tsx src/lib/tests/mobile-app-shell-skeleton.test.tsx src/lib/tests/mobile-chrome-parity.test.tsx src/lib/tests/rtl-financial-ui-contract.test.ts src/lib/tests/language-switcher-placement.test.ts src/lib/tests/user-menu.test.tsx src/lib/tests/desktop-grid-layout.test.ts src/lib/tests/grid-content-height.test.tsx top-nav footer skeleton-fallback root-route-transition
pnpm --filter @gatu/terminal exec vitest run language-switcher.test i18n-hot-switch i18n-reactivity-contract
pnpm exec biome check <本任务全部变更 TS/TSX 文件>
pnpm --filter @gatu/terminal typecheck
pnpm typecheck
pnpm i18n:extract
pnpm memory:index && pnpm memory:check && pnpm memory:test
git diff --check
```

## 最终验证输出

最后代码版本（本任务未提交工作区，2026-09-16）：

```text
指定 Vitest:
Test Files  16 passed (16)
Tests       194 passed (194)
Duration    15.35s

额外 LanguageSwitcher / i18n-hot-switch / i18n-reactivity-contract:
Test Files  3 passed (3)
Tests       99 passed (99)
Duration    20.07s

Biome:
Checked 25 files in 80ms. No fixes applied.

pnpm --filter @gatu/terminal typecheck: exit 0
pnpm typecheck (hl-react + ui + terminal): exit 0
pnpm i18n:extract: exit 0; 2017 messages
pnpm memory:index: Work-memory index updated.
pnpm memory:check: Work-memory index verified.
pnpm memory:test: 8 tests, 8 pass, 0 fail

git diff --check: exit 0, no output
```

Biome 的 25 个文件为上文全部 18 个变更实现/配置文件与 7 个测试文件（6 个旧文件 + 1 个新 parity）；六份 po 文件由 Lingui 提取，不作为 Biome TypeScript 输入。最终提取总数 2017，新 English msgid 已翻译；missing ar/es/fr/hi 各 14，zh 5，和本轮新增消息前的已有数量一致。

移动区段逐字验证覆盖 `app-shell-skeleton.tsx` 从 MobilePanelFrameLabels 前的 Props 到文件末尾，完全等于 HEAD；`mobile-chrome-classes.ts` 的 git diff 为空。未提交或暂存任何文件，`.build/` 保持未跟踪。本结果写入后再次串行运行 memory 三命令和 diff 检查。

## 后续与替代关系

代码迁移完成后由 reviewer 补齐 Playwright 盒子测量并审查提交。本记录不覆盖表面 1 的历史证据。首次 memory:index 因标题不符合模板拒绝生成，补齐必需标题后重新验证；没有跳过校验。

## Reviewer 复核与实测（2026-09-16，同一未提交工作区）

复核方式：通读全部 diff；对照 HEAD 的 `top-nav.tsx`/`footer-bar.tsx` 逐类名核对视图；用 scratchpad 的 `chrome-diff.mjs` 在开发服务器（:3005，`/trade/BTC`）记录壳与真实终端的键控盒（header/logo/nav/右侧簇/每个导航项/每个右侧按钮及其图标/页脚每个叶子元素）。壳取字体就绪（`document.fonts.status === "loaded"`）后、卸载前的最后一帧；真实取 oracle 数值与时钟出现后的帧。

修正一项：`DESKTOP_NAV_LABELS.english` 原为 `msg` 描述符，但运行时语言触发器显示的是 `localeList` 的原生语言名而非翻译，该 msgid 在六份目录里只会是死条目；改为 `config/desktop-nav.ts` 导出 `DEFAULT_LOCALE_NAME = locales[defaultLocale]`，占位使用该值，重新提取后只删除该条过期条目（HEAD 原有的 69 条 `#~` 过期条目未动），目录总数 2017→2016。

| 视口 / 主题 / 语言 | 顶栏容器 | 导航项 | 右侧按钮 | 页脚 |
| --- | --- | --- | --- | --- |
| 1440 dark en | header 1440×56、logo 81.4×18、nav 547.4×34、右簇 322.1×34 全等 | Trade/Portfolio/Earn(Soon sr-only 1×1)/Vaults/Staking/Referrals/Leaderboard/More 8 项位置与尺寸全等 | Connect Wallet 144×34、主题 34×34(图标 18)、English 86.1×34、设置 34×34 全等 | Connecting、⌘K 32×32、版本全等；五个链接与时钟整体差 0.7 px（隐形样本 `00:00 AM` 49.5 px vs 真实 `12:42 PM` 48.8 px） |
| 1280 dark en | 全等 | 全等 | 全等 | 同上 0.7 px |
| 1030 dark en（≤1181 紧凑态） | header 357.6/nav 244.2/右簇 272 全等 | Vaults…Leaderboard 与宽 More 同样折叠，Trade/Portfolio/Earn 全等 | English 标签同样隐藏，触发器 36×34 全等 | 同上 0.7 px |
| 1440 light en | 全等 | 全等 | 全等 | 同上 0.7 px |
| 1440 dark zh | 结构相同；nav 547.4 vs 435、右簇 322.1 vs 330（壳为英文源串） | 仅中文标签宽度差（交易 46 vs Trade 54.3 等） | 简体中文 94 vs English 86.1，右簇整体左移 8 px | 连接中 30.8 vs Connecting 70.3；时钟 `12:49` 29.9 vs 样本 49.5；版本全等 |
| 390×664 iPhone 14 | `[data-shell-desktop]` display none，桌面 header/footer 不参与布局；移动壳未改动 | — | — | — |

字体加载：壳首帧（≈115 ms）在 webfont 就绪前测得导航项宽 +1.2 px、页脚版本 +2.9 px；字体就绪后逐像素一致，属测量时机而非布局差异，脚本已改为取最后一帧。

观察（本轮未改）：页脚两条竖分隔线在壳与真实里高度都是 0（行高 10 px 减 `my-1.5` 上下 12 px），迁移前的 `Divider` 同样如此，属既有视觉问题，留给页脚单独处理。

## 全量套件与生产构建（reviewer，同一工作区）

`pnpm --filter @gatu/terminal test`（566 文件 / 6241 用例，437 s，与浏览器测量并行运行）：17 文件失败。把这 17 个文件单独重跑后：

- 因并发争用而失败、单独运行通过：`portfolio-overview`、`chart-store`、`global-modals-hip3-disclaimer`、`establish-connection-modal`、`orderbook-boot`、`mobile-agent-sync-route`（20/20）。`top-nav-footer-view-parity` 在全量运行中失败 2 例：一例是全量运行恰好读到 reviewer 正在改写 `desktop-nav.ts`/`desktop-placeholders.ts` 的中间状态（语言标签为 undefined），一例是 5 s 超时；单独运行 11/11 通过（两次）。
- 单独运行仍失败、与本任务改动文件无关（测试输入未被本任务修改，按构造与 HEAD 相同）：`mobile-trade-tp-sl-contract`(1)、`mobile-input-zoom-contract`(2)、`mobile-order-risk-summary-contract`(1)、`adaptive-modal-swipe-dismissal`(3)、`desktop-positions-panel-shell`(18)、`tests/global-settings-slippage-effective`(2)、`referral-ui-contract`(3)、`orders-table-visual-contract`(1)、`position-market-close-modal`(1)。本任务不处理，留待各自表面的负责人核对。
- `client-root-theme-lifecycle`(1) 单独运行也失败，根因是 `ade94020` 引入的 `QueryPersistenceFlush` 通过 `useQueryClient()` 取客户端，而该测试把 `PersistQueryClientProvider` 模拟为直通并只部分模拟 `@/lib/query-persistence`。修复：`QueryPersistenceFlush` 改为显式接收 `client` prop（`client-root.tsx` 传入 `queryClient`），`query-persistence-flush.test.tsx` 与该测试的模拟同步；三个相关测试文件 6/6 通过，terminal typecheck 通过。作为独立提交记录在[热访问启动记录](2026-09-16-warm-visit-startup-plan.md)。

`pnpm build`（含 flush 修复后的代码）通过：客户端总预算 3,079,737 gzip 字节（较表面 1 提交后的 3,079,236 增加 501，较基线文件 −74,970）；trade 静态启动闭包 1,571,649（+1,428）；桌面运行时增量 196,279（+4,291）；chunk 循环检查通过；`_shell.html` 86 个共享启动资源预加载。预渲染壳核对（`grep -a`）：`<header>`/`<footer>` 各 1、`aria-label="Primary navigation"` 1、`Connect Wallet` 含 `min-w-[9rem]`、`max-[1181px]:hidden` 6 处、不可见时钟样本 `00:00 AM` 1、`inert=""` 1、Soon 仅出现在 `Earn<span class="sr-only"> — <!-- -->Soon</span>`（React SSR 的文本节点分隔注释）、`animate-spin` 0、`TestnetBanner` 0。构建不是发布，CloudFront 分发未更新。

## ADR 0010 后的来源路径修正（2026-09-16）

启动占位已由 [ADR 0010](../../adr/0010-blank-until-ready-startup.md) 取代；上文仍是旧方案当时的记录，不改写其验证结论。以下 source 在移除启动占位任务中删除，元数据改链到[后续任务记录](2026-09-16-remove-startup-placeholders.md)，避免索引将历史路径误作当前文件；原来源保留于此，可用 `git show 0f7e97acb95a4211195b1ac4dd742def7f72bbc0:<路径>` 检索：

- `apps/terminal/src/components/trade/layout/app-shell-skeleton.tsx`
- `apps/terminal/src/lib/tests/top-nav-footer-view-parity.test.tsx`

## 周整理追加（2026-09-21）

初轮待 reviewer 的状态不代表最终记录，正文已有后续复核与检查。当前 [ADR 0010](../../adr/0010-blank-until-ready-startup.md) 移除启动占位，但保留 props-only 真实视图；本次只更新检索摘要，不把旧占位几何测量当成新启动流程的验收。 本次依据与版本边界见 [周整理记录](2026-09-21-weekly-memory-review.md)。
