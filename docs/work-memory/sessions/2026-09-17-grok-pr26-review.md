<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-grok-pr26-review",
  "date": "2026-09-17",
  "title": "Grok 对抗审查 PR #26（启动、md 堆叠、路由揭示、导航收纳）",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "pr-review"
  ],
  "summary": "grok-4.6-build 只读审查 PR #26 冻结快照，报告 2 P1 / 4 P2 / 1 P3；本会话逐条核实全部成立，其中 5 条为 PR 之前既有、被首帧真实 chrome 放大；未修改代码，修复待决策。",
  "thread": null,
  "baseCommit": "e4c0c4129f1c48cda50d365f347bacc5b6a9893c",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0013-desktop-navigation-collapse.md" },
    { "path": "docs/adr/0012-trade-route-reveal-after-surface-preload.md" },
    { "path": "apps/terminal/src/components/trade/header/user-menu.tsx" }
  ],
  "supersedes": []
}
-->
# Grok 对抗审查 PR #26

## 背景与范围

用户要求用 Grok CLI 最新模型对抗审查 [PR #26](https://github.com/zora4523-bot/gatu-app/pull/26)（`claude/placeholder-parity` → `main`，26 个提交，head e4c0c412）。调用方式与 2026-09-13 的 Across 审查一致：`git archive HEAD` 导出冻结快照到临时目录（排除图表库与二进制资源，2,022 文件），附 `pr.diff`（22,449 行，不含翻译目录与 lockfile）、`pr-stat.txt`、`commits.txt`；`grok --prompt-file … -m grok-4.6 --effort high --tools read_file,grep,list_dir --disallowed-tools Agent --disable-web-search --no-subagents --max-turns 120 --output-format json`。未提供 Git 历史、凭据、`node_modules` 或 `.worklog`。CLI `modelUsage` 确认实际模型 `grok-4.6-build`，17 个代理回合，输入 345k + 缓存读 1.73M、输出 44k（含推理 39k）token，费用 0.67 USD，`stopReason: end_turn`。原始报告、提示词与用量存于本地 `.worklog/2026-09-17/grok-pr26-review/`（Git 忽略）。

## 结论与依据

Grok 报告 7 条，本会话按其给出的文件与行号逐条读代码核实：

| # | Grok 严重度 | 核实 | 本会话判断 |
| --- | --- | --- | --- |
| 1 | P1 | 成立：`top-nav.tsx:115` 在 `market-loading` 时 `compactHiddenWhenConnected` 为 false，而 `:170` 仍挂 `DesktopUtilitiesMenu`（禁用），已连接 + ≤1181 px + 加载期会同时显示三枚工具图标与禁用 kebab | 降为 P2：仅加载期出现；`top-nav.test.tsx:516` 显示这是有意让主题/语言在加载期可用，但未考虑紧凑宽度。来自 4925bd0d，非本 PR 引入 |
| 2 | P1 | 成立：`user-menu.tsx:72,79,129,152` 用 `useState(false)` + `useEffect` 的 `mounted` 门，首个客户端帧对无 session 用户渲染禁用的 `Connecting...`；仪表盘路由的 `TopNav` 静态引入且 `UserMenu` 为 `Suspense fallback={null}`，未走 `bootTradeRoute` 的预加载 | P2：一帧级闪动但发生在 ADR 0010 的首帧位置；来自 7767994d，非本 PR 引入 |
| 3 | P2 | 成立：`user-menu.tsx:201-202` 紧凑标签跳过 `ensName`，与 `docs/runtime-guardrails.md:98`"无邮箱保留 ENS/地址标签"冲突 | P2，来自 4925bd0d |
| 4 | P2 | 成立：`desktop-utilities-menu.tsx:38` 与导航 More 同用 `DESKTOP_NAV_LABELS.more` 作 `aria-label` | P2（可访问性），既有 |
| 5 | P2 | 成立：收纳用 `hasWalletAccess`（`use-wallet-session.ts:117`，仅 wallet 模式），而账户芯片按 `isConnected`（`user-menu.tsx:158`）显示；Agent-only 在 1101–1181 px 是"已连接右侧 + 未连接导航"，宽度未测 | P2，本 PR 的 ADR 0013 引入的组合 |
| 6 | P2 | 成立：`trade-route-boot.test.ts` mock 掉两个预加载函数，只证明合流与预算，不钉住等待集合成员 | P3（测试强度） |
| 7 | P3 | 成立：`i18n-reactivity-contract.test.ts` 的纯视图/热切换名单未含 `top-nav-view`、`footer-bar-view`、`nav-menu-trigger-view`、`header-icon-button-view`、`wallet-cta-view`、`desktop-terminal-frame-view`、`desktop-utilities-menu` | P3 |

Grok 明确排查且未发现问题的类别：启动死锁、水合、v11→v12 迁移、钱包导出失败闭合、字体 `block`、`max-[1181px]` 残留、断点切换重挂、More 键盘可达。无 P0。

## 验证与限制

本记录只包含代码阅读核实，未修改业务代码、未运行新的测试。Agent-only 的紧凑宽度（第 5 条）与已连接加载期溢出（第 1 条）都未做像素实测，需真实钱包/Agent 会话。

## 修复方案核对（对照官方文档与现有守卫，2026-09-17）

依据：React `useState` 参考（初始化函数只在首次渲染运行，Strict Mode 会调用两次以检查纯度）与《You Might Not Need an Effect》（从存储读初始状态应放在初始化函数，订阅外部数据用 `useSyncExternalStore`）；Privy《Waiting for Privy to be ready》（消费 Privy 状态与接口前必须等 `ready`）；W3C APG《Providing Accessible Names》（同角色元素除非完全相同否则名称必须唯一；`aria-label` 用于无可见文字的控件）；本仓库 `docs/runtime-guardrails.md` §1（Privy 未 ready 且无本地 session 时显示 `Connect Wallet`，按钮可先开 `WalletModal`，弹窗自身等 `ready`；无邮箱账户保留 ENS/地址标签）。

| # | 方案 | 文档/守卫依据 | 功能影响核对 |
| --- | --- | --- | --- |
| 1 | `compactHiddenWhenConnected` 改为按账户芯片是否显示判定，与 `market-loading` 解耦；`DesktopUtilitiesMenu` 新增 `settingsDisabled`，加载期只禁用 Settings 项，弹层可打开 | ADR 0013 的 1181 依据是已连接头的最宽内容；现有 `top-nav.test.tsx:516` 的意图是加载期主题/语言可用、Settings 与 Deposit 不可用 | Settings 对话框仍由 `openSettingsDialog` 守卫与 `disabled` 双重阻断；Deposit 逻辑不动。需改测试：kebab 触发器加载期不再 disabled，Settings 项 disabled |
| 2 | 删除 `mounted`/`sessionHint` 的 effect，改为 `useState(() => hasPersistedPrivySession())`；`awaitsStoredSession` 逻辑不变 | React：初始化函数读取存储；`hasPersistedPrivySession` 已带 `typeof window` 与 try/catch，纯且可重复调用，Strict Mode 二次调用无副作用。Privy：首帧 `Connect Wallet` 不消费 Privy 接口，点击只打开 `WalletModal`，其 effect（`wallet-modal.tsx:73`）在 `ready` 前不调用 `login()` | `UserMenu` 只在 `ClientRuntimeGate` 之后于客户端渲染，无 SSR 路径，不会产生水合不一致。仪表盘 9 个页面静态挂 `TopNav` 但没有预加载 `UserMenu`：按 ADR 0012 同一模式，为仪表盘路由增加 `beforeLoad` 等待 `preloadTopNav()`（或共享的 `bootDashboardRoute`），避免 `Suspense fallback={null}` 先空一块。需在 `user-menu.test.tsx` 增加"首帧即 Connect Wallet"的同步断言（不包 effect） |
| 3 | `compactDisplayLabel = emailAddress ?? ensName ?? shortenAddress(...)`，沿用 `max-w-[8rem] truncate` | 守卫 §1 第 98 行 | 仅展示；`useEnsName` 已在无邮箱时查询。增加 ENS 场景断言 |
| 4 | 工具 kebab 改用独立名称（如 `Display and language`，新 `DESKTOP_NAV_LABELS.utilities` 消息），导航 More 保持 `More` | APG：同角色名称唯一；`aria-label` 用于图标按钮 | 新消息需 `i18n:extract`，5 种语言在补译前回退英文（现有目录机制）；`findDesktopUtilitiesButton` 改按新名称定位 |
| 5 | 收纳与 `connected` 改用"账户芯片可见"（`authenticated || isConnected`，与 `user-menu.tsx:158` 的分支一致），`hasWalletAccess` 只继续用于 Deposit 入口与资金守卫 | AGENTS.md：展示只用可用性布尔，不改签名/资金守卫；ADR 0013 的"已连接"指头部内容最宽的状态 | 仅影响 1101–1181 px 的入口收纳与 Logo 间距；Agent-only 的交易/资金守卫路径不变。`desktop-nav-layout.test.ts` 的 `connected` 语义改为"芯片可见"并加 Agent-only 用例 |
| 6 | 新增 `preload-trade-terminal-surface.test.ts`：mock `@/lib/lazy` 记录各 `createLazyComponent` 的 `preload` 调用与受控 Promise，断言 `preloadTradeTerminalSurface()`/`preloadAppRuntimeOverlays()` 在 FooterBar、UserMenu、五个面板、TradingViewChart、PositionsTab、GlobalModals、Toaster、FundsActionRecoveryHost 全部落定前不 settle | ADR 0012 决策 2 | 纯测试 |
| 7 | 逐个核对后把 `top-nav-view`、`footer-bar-view`、`nav-menu-trigger-view`、`header-icon-button-view`、`wallet-cta-view`、`desktop-terminal-frame-view` 加入 `PURE_PRESENTATION_VIEWS`（断言：有 `interface Props`，无 `@lingui`/hook/`window`/`document`），`desktop-utilities-menu` 加入 `REACTIVE_COMPONENTS` | `docs/i18n-presentation.md` | 纯测试；若某视图含 hook 则不入名单并记录原因 |

不采用的做法：用 `useSyncExternalStore` 订阅 Privy 本地存储键——Privy 不提供 storage 事件语义，且 session hint 只需读一次；在 `ready` 前直接调用 `login()`——违反 Privy 文档。

实施顺序：1 与 5（同一处判定）→ 3、4 → 2（含仪表盘预加载）→ 6、7；每步跑 top-nav / user-menu / desktop-nav-layout / i18n 契约 / trade-route-boot 单测，最后 typecheck、Biome、`i18n:extract`、构建与 header 探测，再让 Grok 复审第二轮。

## 后续与替代关系

修复候选（待用户决策）：(1) `compactHiddenWhenConnected` 改为按账户芯片存在判定，kebab 内只禁用 Settings；(2) `UserMenu` 用惰性初始值同步读 session hint 去掉 `mounted` 门，仪表盘路由也预加载 `UserMenu`；(3) 紧凑标签保留 ENS；(4) 工具菜单改用独立无障碍名；(5) 收纳与 `connected` 改用账户芯片可见性；(6) 为 `preloadTradeTerminalSurface` 增加钉住等待集合的单测；(7) 补齐 i18n 契约名单。
