# ADR 0013：桌面顶部导航的紧凑断点、收纳规则与单一配置来源

- 状态：已接受（产品负责人，2026-09-17）；实施与验证记录见[任务记录](../work-memory/sessions/2026-09-17-desktop-nav-collapse.md)。
- 关联：[ADR 0010](0010-blank-until-ready-startup.md)（chrome 首帧稳定，不做启动时测量）；`docs/runtime-guardrails.md` §11 为本决策的现行契约。

## 背景与约束

现状（`config/desktop-nav.ts`、`header/top-nav.tsx`、`header/top-nav-view.tsx`）：一级入口 Trade、Portfolio、Earn（Soon 占位）、Vaults、Staking、Referrals、Leaderboard；后四项在视口 ≤1181 px 时由 `max-[1181px]:hidden` 隐藏，并出现在一份单独手写的"紧凑 More"列表里；宽屏 More 只含 Statistics（外链）与 API Wallet。两份 More 下拉同时挂载、靠 CSS 互斥。同一断点还把已连接状态的 Logo、Deposit、地址与三枚工具图标压缩。

实测（2026-09-17，本地生产构建，headless Chromium）：

- 官方 `app.hyperliquid.xyz` 在 1001–1440 px 全程显示 8 个一级入口，右侧只有 Connect；≤1000 px 切移动端导航。
- 我们未连接钱包时，1181 px 若显示全部入口仍余 166 px；1001 px 各语言余量：en 28、zh 141、hi 147、ar 50，但 es、fr 已溢出（左栏被裁切）。把 Earn（Soon）移出一级后，1001 px 余量为 en 78、zh 189、hi 185、es 53、fr 2、ar 109，法语仍无安全余量。
- `1181` 在 4 个文件里重复 14 次，没有命名常量，也没有文档记录其依据（已连接状态的最宽内容）。

约束：不引入 ResizeObserver 式的动态"priority+"收纳（启动首帧会抖动，且与 ADR 0010 的稳定 chrome 目标冲突）；≤1000 px 的移动端切换与 1420 px 的网格断点不变；不改钱包、地区、签名守卫。

## 决策

1. **命名断点。** `config/layout.ts` 新增 `DESKTOP_NAV_COMPACT_MAX_PX = 1181`（已连接状态压缩工具区、Logo、Deposit、地址，并让 Soon 占位离开一级）与 `DESKTOP_NAV_NARROW_MAX_PX = 1100`（任何状态都收纳低优先级入口），以及对应的媒体查询字符串。`styles.css` 以 `@custom-variant nav-compact (@media (max-width: 1181px))` 提供同值的 Tailwind 变体，替换全部 `max-[1181px]:`；契约测试读取 `styles.css` 核对变体像素值等于常量。
2. **收纳规则。** 视口 ≤1181 px 时 Earn（Soon）离开一级并以禁用项出现在 More；Vaults、Staking、Referrals、Leaderboard 在"已连接且 ≤1181 px"或"任何状态且 ≤1100 px"时进入 More。1100 的依据是法语在 1001 px 去掉 Earn 后仅余 2 px，1100 为其留出约 100 px；未连接用户在 1101–1181 px 保留全部功能入口。低优先级入口的显隐由 `useMediaQuery` 与连接状态在 JS 中共同决定（chrome 在水合后才渲染，`matchMedia` 首帧即可用，不产生 SSR 不一致），保证隐藏的链接与 More 中的菜单项永远一致。
3. **单一配置来源。** `DESKTOP_NAV_ITEMS` 带 `placement`（`primary` / `lower` / `more`）、`path` 或外链 `href`、`soon` 与前缀匹配标记，Statistics 与 API Wallet 并入其中；`lib/navigation/desktop-nav.ts` 提供纯函数 `resolveDesktopNavLayout({ compact, narrow, connected })` 与 `isDesktopNavItemActive(item, pathname)`，`TopNav` 只渲染其结果。两份手写 More 列表与两个 Dropdown 合并为一个由布局结果驱动的 More；它在任一收纳项处于当前路由时高亮。

## 补充（2026-09-17，PR #26 对抗审查后）

"已连接"改为按账户芯片是否显示判定（`authenticated || isConnected`，与 `UserMenu` 渲染身份的条件一致），使 Agent-only 会话与钱包会话同样收纳，并与市场加载态解耦；`hasWalletAccess` 只用于资金与签名守卫。工具菜单触发器改名 `Display and language`，加载期只禁用其中的 Settings。依据见[审查记录](../work-memory/sessions/2026-09-17-grok-pr26-review.md)。

## 备选方案

- 未连接时一律显示全部入口直到 1001 px：法语溢出，否决。
- 测量剩余空间的动态收纳：首帧抖动、需要测量层、与 ADR 0010 冲突，否决。
- 只做常量命名不改规则：保留了官方对照中最明显的差距，否决。

## 后果

- 未连接用户在 1101–1181 px 多出四个一级入口；已连接用户行为不变；Earn（Soon）在 ≤1181 px 不再占一级位置。
- 新增入口只改 `DESKTOP_NAV_ITEMS` 一处；断点只改常量与 `styles.css` 变体两处，并由契约测试钉住。
- 语言余量以本次六种语言、1001 px、未连接为准；新增语言或加长标签需复核 `docs/runtime-guardrails.md` §11 的余量表。

## 验证

单测：新增 `desktop-nav-layout.test.ts`（各状态与宽度的收纳结果、active 规则、常量与 CSS 变体契约）；更新 `top-nav.test.tsx`（连接/未连接 × 紧凑/窄的链接显隐与 More 内容、Earn 禁用项、外链与路由项）；`user-menu`、翻译契约；typecheck、Biome。浏览器：本地生产构建在 1440 / 1181 / 1100 / 1001 px、六种语言、未连接状态下 header 无裁切与重叠。实际结果记录在任务记录中。

## 补充（2026-09-27，Earn 上线）

Earn 不再是 Soon 占位，改为链接 `/earn` 的常驻一级入口，决策 2 中关于 Earn（Soon）的收纳规则不再适用（`soon` 机制本身保留）。未连接用户在 1101–1181 px 因此多一个一级入口，法语在 1101 px 只余 6 px，窄屏阈值 `DESKTOP_NAV_NARROW_MAX_PX` 从 1100 调到 1150。实测数据与取舍见 [ADR 0020](0020-earn-borrow-lend-page.md) D8；本 ADR 其余决策不变。
