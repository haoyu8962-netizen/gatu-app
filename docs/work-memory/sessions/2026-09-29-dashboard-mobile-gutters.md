<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-dashboard-mobile-gutters",
  "date": "2026-09-29",
  "title": "手机仪表盘页面边距：金库与推荐页补上 16px 边距并写成规则",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "docs-governance"],
  "summary": "用户问为什么金库页在手机上没有边距。查明 8 月 14 日同一提交里质押页写了 px-4、金库页漏写，推荐页从 8 月 12 日起就没有，9 月 16 日统一页面框架时照搬；排行榜、资金费率对比、API 钱包是有意的直角整页白底。修复：/vaults 与 /referrals 框架加 px-4；金库卡片数值改为标签在上（否则 375 宽 20 个管理者地址全部截断）；详情页完整地址加 break-all（320 宽会被切 6px）；规则写进 style-ui-guide 并加契约测试与浏览器测试。旧配置下契约测试只报这两页，旧卡片与旧详情页各自让浏览器测试失败。单测 22 个文件 426 项、共享配置浏览器测试 42 项通过，锁定的 TypeScript 5.7.2 通过；开发服务器 320/375/1440 真实数据核对通过。未做连接钱包状态、深色、其他语言、真机与生产构建。",
  "thread": null,
  "baseCommit": "77a70867",
  "commits": ["fad8f3d4"],
  "sources": [
    { "path": "apps/terminal/src/config/dashboard-frames.ts" },
    { "path": "apps/terminal/src/components/vaults/vaults-list.tsx" },
    { "path": "apps/terminal/src/components/vaults/vault-detail-view.tsx" },
    { "path": "apps/terminal/src/lib/tests/dashboard-frame-view.test.tsx" },
    { "path": "apps/terminal/tests/browser/vaults-list.pw.ts" },
    { "path": "apps/terminal/tests/browser/vaults-list.fixture.tsx" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": "docs/leaderboard-vaults-staking-redesign-notes.md" },
    { "path": "docs/work-memory/sessions/2026-09-29-vaults-list-mobile-clipping.md" },
    { "path": "CHANGELOG.md" }
  ],
  "supersedes": []
}
-->
# 手机仪表盘页面边距：金库与推荐页补上 16px 边距并写成规则

## 背景与范围

同步记录，没有取得可核对的会话 ID。上一条 [金库列表修复](2026-09-29-vaults-list-mobile-clipping.md) 之后，用户在手机视口看质押页，问为什么其他页面有边距而金库页没有，要求自查 UI 规范；看过审查结论后要求按建议修改（加边距、改金库卡片排法、写规则并加测试）。

工作在主检出的 `claude/from-dev-0928` 分支，基线 `77a70867`。本记录与改动在同一个提交里。

## 结论与依据

在开发服务器上用内置浏览器（视口模拟，中文，浅色，未连接）逐页测量 13 个仪表盘页面在 375 宽下的内容区左右留白、外层白色面板离屏幕边缘的距离和圆角，并找被 `overflow` 裁掉或越出屏幕的元素：

| 页面 | 留白 | 外框 |
| --- | --- | --- |
| 投资组合、质押、资金费用、委托历史、成交历史 | 16px | 6px 圆角卡片 |
| Earn | 16px | 12px 圆角卡片 |
| 文档、条款 | 20px | 无面板 |
| 排行榜、资金费率对比、API 钱包 | 0 | 直角整页白底，内容自带内边距 |
| 金库列表、金库详情 | 0 | 6px 圆角 + 阴影，贴边 |
| 推荐（含 `/join/`） | 0 | 16px 圆角 + 阴影，贴边 |

- **来历。** 金库页与质押页都来自 `2223e724`（2026-08-14），当时质押页的 `<main>` 写了 `px-4`，金库页没写；推荐页自 `42e02633`（2026-08-12）起没有；`0f7e97ac`（2026-09-16）把各页 `<main>` 收进 `DASHBOARD_FRAMES` 时照原样搬运。交付验收截图 `vaults-normal.png` 已显示贴边。
- **排行榜三页是有意的。** `leaderboard-view.tsx`、`funding-comparison-view.tsx`、`api-wallet-view.tsx` 的整页白底只在 `!isMobile` 时加圆角，手机上是直角整页，看起来不像缺边距。
- **没有规则。** 文档里没有手机页面边距的规定；`dashboard-frame-view.test.tsx` 逐字固定现有字符串，只防改动不判对错。
- **只加边距不够。** 在页面上临时给金库页加 16px 边距模拟：卡片从 343px 缩到 311px，每格 135px，375 宽下 20 个管理者地址全部被截断。金库详情页与推荐页（未连接）在 375 宽加边距后没有新截断；320 宽下详情页的完整金库地址（等宽 42 字符约 278px）超出 256px 容器 6px，被外框切掉。

采用的改法：

- `DASHBOARD_FRAMES["/vaults"]`、`["/referrals"]` 加 `px-4`；桌面端 `min-[1001px]:px-10` 覆盖，不变。金库详情页与 `/join/` 共用这两个框架。
- 金库手机卡片的 `MobileMetric` 改为标签在上、数值在下（`flex-col gap-0.5`，行距 `gap-y-3`），数值保留 `truncate` 作兜底。
- 详情页完整地址加 `break-all`，与项目里其他完整地址（`vaults-page.tsx`、充值与资金弹窗）的写法一致。
- 规则写进 `.claude/rules/style-ui-guide.md` 的 Dashboard page gutters：手机只允许「留边距的圆角面板」或「贴边的直角整页白底」；框架单测新增契约，要求没有手机横向内边距的框架恰好是三个整页白底页面，且它们只在 `!isMobile` 时加圆角。
- 浏览器测试 `vaults-list.pw.ts` 增加外框 16px 边距、卡片数值无截断，以及 `?view=detail` 下详情外框无隐藏溢出的检查。详情示例复用应用里的 `VaultDetailFixture`；共享浏览器配置把 `@/lib/hyperliquid` 换成 `trade-panel-all-orders.browser.ts`，缺 `getExplorerAddressUrl` 时整个夹具页加载失败，于是照 `getExplorerTxUrl` 的写法在 `mobile-orderbook-cls.browser.ts` 加桩并转导出。
- 重构文档第 8 节追加更正，CHANGELOG 的 Unreleased / Fixed 加一条；上一条金库记录追加补记，并更正其中「排行榜等页贴边带圆角」的误述。

未采用：

- 给排行榜、资金费率对比、API 钱包也加边距：它们的直角整页白底加了边距会变成没有圆角的浮动卡片，需要设计决定。
- 统一卡片圆角（多数 6px，Earn 12px，推荐 16px）：`design-tokens.md` 允许页面卡片用更大的具名圆角，不算违规。
- 金库卡片四项改为每行一项（像排行榜卡片）：卡片更高，且上一轮已向用户提出标签在上的方案。

## 验证与限制

版本：基线 `77a70867` 加上本任务未提交的改动；2026-09-29，本地 macOS，主检出。

- 契约测试：把 `dashboard-frames.ts` 换回 `HEAD` 版本，新用例失败，多出的正是 `/referrals` 与 `/vaults`；换回后通过。
- Playwright（共享配置，本机 Chrome 通道）：`vaults-list.pw.ts` 8 项通过。只保留边距、把 `vaults-list.tsx` 换回 `HEAD` 时，4 个手机列表用例都因管理者地址被截断失败；把 `vault-detail-view.tsx` 换回 `HEAD` 时，320 宽详情用例失败（外框隐藏溢出 5px），375 宽通过。改了共享模拟模块后，`mobile-orderbook-cls`、`drawer-interactions`、`orderbook-hover`、`trade-panel-all-orders`、`vaults-list` 一起运行 42 项通过。
- Vitest 22 个文件 426 项通过：框架、推荐、Earn、API 钱包、投资组合的界面契约，金库视图与领域、从右到左排版、法律页、设计令牌棘轮、按压反馈，以及启动渲染组与两个多语言契约。
- Biome 检查 `src` 下改动的 4 个文件通过；根目录锁定的 TypeScript 5.7.2 `tsc -p apps/terminal/tsconfig.json --noEmit` 退出码 0；`pnpm i18n:extract` 没有 `.po` 变化。
- 开发服务器（真实主网数据）：375 与 320 宽下金库列表、详情、推荐页外框离两边各 16px，没有被裁切或越界的元素，20 张卡片数值无截断，320 宽详情地址折成两行；1440 宽三页内容区仍是 40px，无裁切。另一个标签页里干净加载这三页，控制台无报错；测试期间主标签页出现的 TanStack 路由预加载 `_nonReactive` 报错和 WebSocket 连接失败发生在热更新与快速切页时，干净加载不复现。
- 未做：连接钱包后的推荐页与金库权益、深色主题、en/zh 以外的语言、真机、生产构建、全量单测、CI 实跑（未推送）。

## 后续与替代关系

- 仍待用户决定：金库长名字最多显示两行；只有一组时隐藏重复的组名；详情页「账户价值」数值压在折线上；中文翻译 11 条「Vault」未译；各页卡片圆角是否统一；排行榜三页是否也改成留边距的卡片。
- 部分更正 [金库列表修复记录](2026-09-29-vaults-list-mobile-clipping.md) 第四条后续事项的描述，不整体替代。下次先看 `.claude/rules/style-ui-guide.md` 的 Dashboard page gutters 与 `dashboard-frame-view.test.tsx`。

补记（2026-09-29）：本记录的提交为 `fad8f3d4`。随后的 [对抗审查与修复记录](2026-09-29-gutter-adversarial-review.md) 更正了本记录的三处结论：规则测试当时只证明桌面分支有圆角，拦不住手机圆角与 `px-0`；详情浏览器测试只测外框，测不到地址本身被截断；推荐页只核对了未连接状态，连接钱包后邀请码卡片的步骤标签在 375 宽中文下被新截断。三处都已在那条记录里修复。
