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

## 后续与替代关系

修复候选（待用户决策）：(1) `compactHiddenWhenConnected` 改为按账户芯片存在判定，kebab 内只禁用 Settings；(2) `UserMenu` 用惰性初始值同步读 session hint 去掉 `mounted` 门，仪表盘路由也预加载 `UserMenu`；(3) 紧凑标签保留 ENS；(4) 工具菜单改用独立无障碍名；(5) 收纳与 `connected` 改用账户芯片可见性；(6) 为 `preloadTradeTerminalSurface` 增加钉住等待集合的单测；(7) 补齐 i18n 契约名单。
