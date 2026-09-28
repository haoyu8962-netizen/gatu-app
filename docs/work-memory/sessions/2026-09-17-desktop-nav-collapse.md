<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-17-desktop-nav-collapse",
  "date": "2026-09-17",
  "title": "桌面顶部导航：命名断点、收纳规则与单一配置（ADR 0013）",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "docs-governance"
  ],
  "summary": "1181 魔法数改为 DESKTOP_NAV_COMPACT/NARROW 常量与 nav-compact 变体；Earn（Soon）紧凑时进 More，低优先级入口仅在已连接且 ≤1181 或 ≤1100 时收纳；入口与 More 由 DESKTOP_NAV_ITEMS 单一派生；官方对照与六语言余量实测见正文。",
  "thread": null,
  "baseCommit": "8dd0f1a9b5ebf65c190067755b9403336e2ef27f",
  "commits": ["e4c0c412"],
  "sources": [
    { "path": "docs/adr/0013-desktop-navigation-collapse.md" },
    { "path": "apps/terminal/src/lib/navigation/desktop-nav.ts" },
    { "path": "apps/terminal/src/config/desktop-nav.ts" }
  ],
  "supersedes": []
}
-->
# 桌面顶部导航：命名断点、收纳规则与单一配置（ADR 0013）

## 背景与范围

同步记录。用户询问顶部导航 More 的收纳机制是否符合实践，评估后要求按三条建议实施并先写 ADR。分支 `claude/placeholder-parity`，worktree `.claude/worktrees/previous-task-review-b5a831`。

## 结论与依据

- 官方对照（headless Chromium，2026-09-17）：`app.hyperliquid.xyz` 在 1001–1440 px 全程显示 Trade、Portfolio、Earn、Vaults、Staking、Referrals、Leaderboard、More 八项，右侧只有 Connect；≤1000 px 切移动端。我们改动前在 ≤1181 px 无差别隐藏四项，而未连接时 1181 px 余 166 px、1001 px 英文余 28 px（es/fr 溢出）。
- 六语言 1001 px 未连接、去掉 Earn 后的余量：en 78、zh 189、hi 185、es 53、fr 2、ar 109 px，因此"任何状态都收纳"的窄断点定为 1100。
- 实现：`config/layout.ts` 新增 `DESKTOP_NAV_COMPACT_MAX_PX`/`NARROW` 与媒体查询；`styles.css` 新增 `@custom-variant nav-compact`，四个文件的 `max-[1181px]:` 全部替换；`hooks/use-mobile.ts` 新增 `useMediaQuery`（无 `matchMedia` 时返回 false）；`config/desktop-nav.ts` 改为带 `placement` 的单一配置并纳入 Statistics/API Wallet，`HYPERSCREENER_URL` 移到 `config/external-links.ts` 以免配置引入图标；`lib/navigation/desktop-nav.ts` 提供 `resolveDesktopNavLayout` 与 `isDesktopNavItemActive`；`TopNav` 只挂载一个 More。

## 验证与限制

工作区版本：基线 8dd0f1a9（ADR 0013 提交）+ 本任务未提交改动；2026-09-17，本地 macOS。

- Biome、`pnpm --filter @gatu/terminal typecheck` 通过。定向单测：desktop-nav-layout（17，含常量与 `nav-compact` 变体契约、各状态收纳、active 规则）、top-nav（29，含按宽度与钱包状态收纳、More 高亮）、user-menu（18）、mobile-nav-drawer（5）、i18n-reactivity-contract（119）、i18n-hot-switch（8）、root-startup-fallback（8）、trade-terminal-page-boot（17）全部通过。首轮 user-menu 18 项因 `config/desktop-nav.ts` 经 `config/nav.tsx` 引入 phosphor 图标而与该测试的图标 mock 冲突，改为从 `config/external-links.ts` 取外链后通过。
- `pnpm build` 通过：总 gzip 3,081,756 B（较基线 −72,951），`trade-terminal-page` 126,994 B。
- 生产构建 header 探测（Nitro 3017，headless Chromium，未连接，6 语言 × 1440/1182/1181/1101/1100/1001 px）：无一裁切；一级入口数 1440–1182 为 7，1181–1101 为 6（Earn 进 More），≤1100 为 2。最小余量：1182 px 法语 42 px、1101 px 法语 102 px。
- 全量 `pnpm --filter @gatu/terminal test`（构建与探测之后串行）：567 文件 = 556 通过 / 10 失败 / 1 跳过；6,317 用例 = 6,283 通过 / 33 失败 / 1 跳过。9 个文件为今早记录的既有基线红；新增的 `modal-surface-contract` 1 项是本次合并两个 More 下拉的预期结果（源码契约要求 `popupClassName` 含 `bg-overlay` 出现 2 次），断言改为 1 次后 7/7 通过。未放宽其它断言。
- 未做：已连接状态的逐语言余量（需真实钱包）；官方 More 菜单具体条目未抓到（实时行情刷新污染文本差分）。

## 后续与替代关系

- 已连接状态在 1001–1181 px 的余量未做逐语言实测（需真实钱包会话），沿用改动前的收纳行为。
- 下次先查 `lib/navigation/desktop-nav.ts`、`config/desktop-nav.ts`、`docs/runtime-guardrails.md` §11。
