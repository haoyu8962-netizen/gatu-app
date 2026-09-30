<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-mobile-nav-drawer-group-headings",
  "date": "2026-09-29",
  "title": "手机导航抽屉去掉「导航」「更多」分组标题，改用分隔线",
  "kind": "task",
  "status": "recorded",
  "topics": ["docs-governance"],
  "summary": "用户在内置浏览器里选中手机导航抽屉的两个可见分组标题并要求审查。结论：「导航」是 7 月遗留、与弹层隐藏标题和主导航地标重复，直接删除；「更多」保留分组但标题换成与抽屉头尾边框同源的通栏分隔线，nav 的无障碍名称 More 不变，与官方手机抽屉一致（官方无分组标题，靠分隔线和字号分主次）。改动组件、新增 1 个用例（旧组件上失败）、runtime-guardrails §11、CHANGELOG，六个 .po 各少两行重复来源注释。16 个测试文件 330 项通过；项目类型检查脚本因主检出残留 TypeScript 5.9.3 报已知假错误，锁定的 5.7.2 通过；开发服务器 375×812 中文浅色与深色核对通过。未做真机、已连接状态、生产构建和全量单测。",
  "thread": null,
  "baseCommit": "5bac5ac7",
  "commits": ["fe2d8bc8"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx" },
    { "path": "apps/terminal/src/lib/tests/mobile-nav-drawer.test.tsx" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/adr/0020-legal-pages-in-app-shell.md" },
    { "path": "CHANGELOG.md" },
    { "url": "https://app.hyperliquid.xyz/trade" }
  ],
  "supersedes": []
}
-->
# 手机导航抽屉去掉「导航」「更多」分组标题，改用分隔线

## 背景与范围

同步记录，没有取得可核对的会话 ID。用户在内置浏览器面板里选中手机导航抽屉（`MobileNavDrawer`）的两个可见分组标题「导航」和「更多」，问是否多余并要求审查；看过审查结论后要求按建议修改。

工作在主检出的 `claude/from-dev-0928` 分支进行，基线 `5bac5ac7`（当时的 `origin/dev`）。本记录与改动在同一个提交里。改动范围：抽屉组件、它的单测、`docs/runtime-guardrails.md` §11、`CHANGELOG.md`，以及 `pnpm i18n:extract` 对六个 `.po` 的来源注释更新。抽屉的入口、顺序、选中态、按压反馈、充值与设置按钮都不变。

## 结论与依据

- **「导航」没有信息量。** 抽屉里全是导航入口；弹层的隐藏标题已经是 `Navigation`，第一个 `nav` 的无障碍名称是 `Primary navigation`，读屏会连续听到三次。它是 `<p>`，不能按标题跳转。
- **它是遗留。** `e825698b`（2026-07-19）把抽屉分成 `Navigation` 与 `Platform` 两组，后者放 Soon 占位，这个标题用来和它对照；`bb1c561c`（2026-08-13）为对齐桌面把 `Platform` 改成 `More`，`Navigation` 标题从此没有对照对象。
- **「更多」的分组有用，标题没用。** 主要功能和工具、帮助类入口分开是对的；但 More 是桌面下拉按钮的叫法，表示还有收起的内容，抽屉里全部展开，这个词描述不了下面的资金费率对比、统计、API 钱包、文档、支持。
- **规范没有要求标题。** `runtime-guardrails.md` §11 与 [ADR 0020](../../adr/0020-legal-pages-in-app-shell.md) 只约束抽屉 More 分组的条目和顺序；单测只依赖 `nav[aria-label="More"]` 与隐藏标题，不依赖可见标题文字。
- **官方做法。** 2026-09-29 用内置浏览器只读打开 `app.hyperliquid.xyz/trade`（375×812，只打开菜单）：手机抽屉没有任何分组标题；Trade、Portfolio、Earn、Vaults、Staking、Referrals、Leaderboard 七项用大号字，一条分隔线下面是 Testnet、Explorer、Sub-Accounts、API、Builder Codes、Multi-Sig、Points、Funding Comparison、Announcements、Stats、Docs、Support 十二项，字号更小；顶部只有标志。

采用的改法：

- 删除第一个 `nav` 里的「导航」标题。
- 第二个 `nav` 去掉「更多」标题，改为 `border-t border-stroke-weak/60 p-2`：通栏 1px 分隔线，与抽屉头部、底部边框同一个令牌；上下各 8px 间距。`aria-label="More"` 保留，读屏仍能区分两组，`runtime-guardrails.md` 所说的 More 分组仍然成立。
- 保留隐藏标题 `Navigation`（弹层需要无障碍名称）和右上角关闭按钮。官方没有关闭按钮，但 `style-ui-guide.md` 要求手机弹层有明确的退出控件。

未采用：

- 把「更多」改成描述性名称（如「工具与帮助」）：要在六种语言新增词条，官方也没有这样做。
- 单独插一个 `<hr>`：会在两个导航地标之间多读出一个分隔符。
- 照官方把次级入口改成小字号：属于另一个视觉决定，这次不做，列入后续。
- 合并成一个 `nav`：会改变测试与文档固定的地标结构，对用户没有收益。

## 验证与限制

版本：基线 `5bac5ac7` 加上本任务未提交的改动；2026-09-29，本地 macOS，主检出。

- `pnpm exec biome check` 两个改动的 TS/TSX 文件：通过。
- `pnpm --filter @gatu/terminal typecheck`：退出码 2，唯一错误是 `use-exchange-funds-action-lock.test.tsx(150,11)` 的 TS2322。原因是主检出 `apps/terminal/node_modules/.bin/tsc` 是残留的 TypeScript 5.9.3（见 [资金费率历史修复记录](2026-09-28-funding-history-clock-rollback-fix.md) 对审查记录的更正）；用根目录锁定的 5.7.2 执行 `tsc -p apps/terminal/tsconfig.json --noEmit --pretty false`，退出码 0。
- `mobile-nav-drawer.test.tsx`：14 项通过，其中新增 1 项断言两个 `nav` 依次叫 `Primary navigation`、`More`，子元素只有链接，且只有 More 组带 `border-t` 与 `border-stroke-weak/60`。把组件临时换回 `HEAD` 版本后，新用例失败（子元素不全是链接），换回后恢复。
- 同一次 Vitest 运行 16 个文件 330 项通过：`mobile-nav-drawer`、启动渲染组（`root-startup-fallback`、`root-route-transition`、`trade-terminal-page-boot`、`top-nav`、`desktop-nav-layout`、`dashboard-frame-view`）、`i18n-reactivity-contract`、`i18n-hot-switch`、`language-switcher-placement`、`mobile-header-layout`、`mobile-header-brand`、`touch-press-feedback-contract`、`modal-surface-contract`、`design-token-ratchet`、`dialog-dismiss-control-contract`。
- `pnpm i18n:extract` 退出码 0：六个 `.po` 各删除两行重复的 `#: src/components/trade/mobile/mobile-nav-drawer.tsx`（`More` 与 `Navigation` 各一行），词条和译文不变。提取后的缺译数为 ar/es/fr/hi 各 44、zh 3，本次没有单独与基线对比，但改动只删除来源注释。
- 浏览器：同一工作区的开发服务器（`.claude/launch.json` 的 `terminal`，端口 3005），内置浏览器，375×812，中文，未连接，点击经浏览器工具注入而非真人操作。第一个导航区 7 个链接、高 296px、无上边框；「更多」区 5 个链接、高 217px、1px 上边框与抽屉头部边框颜色相同（浅色为 `rgba(0,17,102,0.1)` 的 60%，深色为白色约 7.3% 透明度）；抽屉里没有 `<p>`；无横向滚动；中部滚动区高 693px，两组内容共 513px，在 812 高度下不需要滚动。深色经抽屉的主题按钮切换，看完切回浅色。按样式计算，本次省出约 55px（两个 32px 标题，减去 1px 边框和新增的 8px 上间距）。
- 未做：真机；已连接状态（会显示充值按钮）；其他语言的界面核对；生产构建；全量单测。

## 后续与替代关系

- 可选：照官方把次级入口改成小字号，需要设计决定。
- 没有被替代的记录。下次先看 `apps/terminal/src/components/trade/mobile/mobile-nav-drawer.tsx`、`docs/runtime-guardrails.md` §11 和 ADR 0020。
