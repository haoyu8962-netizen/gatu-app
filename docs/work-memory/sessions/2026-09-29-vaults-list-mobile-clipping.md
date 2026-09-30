<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-vaults-list-mobile-clipping",
  "date": "2026-09-29",
  "title": "金库列表：手机卡片被长名字撑宽裁切、桌面表头居中与头像取字的审查和修复",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review"],
  "summary": "审查 /vaults 发现手机卡片列表的隐式网格列被一个长金库名撑到 416px，外框 overflow-hidden 把每张卡片静默切掉 57px（375 宽）或 112px（320 宽），APR、权益、运行时间看不全；交付验收只查页面横向溢出且用短名字示例数据，所以没发现。修复：列表加 grid-cols-1，两个原生 th 加 text-start，头像改由领域函数 getVaultMark 取前两个字母或数字。新增 vaults-list.pw.ts 浏览器测试并挂进 CI 的共享配置步骤；旧组件上 6 个用例全失败、只回退头像也失败。单测 86 项、浏览器 6 项、CI 结构测试 6 项通过，锁定的 TypeScript 5.7.2 通过；开发服务器真实数据 375 与 1440 宽核对通过。320 宽地址二次截断、长名字换行、单组标题、手机外框、详情页折线压字和 11 条中文「Vault」未译待用户决定。",
  "thread": null,
  "baseCommit": "fe2d8bc8",
  "commits": ["77a70867"],
  "sources": [
    { "path": "apps/terminal/src/components/vaults/vaults-list.tsx" },
    { "path": "apps/terminal/src/components/vaults/domain/vaults.ts" },
    { "path": "apps/terminal/src/lib/tests/vaults-domain.test.ts" },
    { "path": "apps/terminal/tests/browser/vaults-list.fixture.tsx" },
    { "path": "apps/terminal/tests/browser/vaults-list.pw.ts" },
    { "path": ".github/workflows/slider-browser.yml" },
    { "path": "apps/terminal/src/config/dashboard-frames.ts" },
    { "path": "docs/leaderboard-vaults-staking-redesign-notes.md" },
    { "path": "CHANGELOG.md" }
  ],
  "supersedes": []
}
-->
# 金库列表：手机卡片被长名字撑宽裁切、桌面表头居中与头像取字的审查和修复

## 背景与范围

同步记录，没有取得可核对的会话 ID。用户在内置浏览器里看 `localhost:3005/vaults`（面板选的是手机 375×812），觉得有裁切、显示不全，要求审查；看过审查结论后要求按建议修复并符合编码规范。

工作在主检出的 `claude/from-dev-0928` 分支进行，基线 `fe2d8bc8`（上一个抽屉提交，其下是当时的 `origin/dev` `5bac5ac7`）。本记录与修复在同一个提交里。修复范围按审查建议只含三项：手机卡片裁切、桌面两个表头对齐、头像取字；另加浏览器回归测试并挂进 CI。其余发现未改，见文末。

## 结论与依据

审查用内置浏览器在 1440、1001、375、320 宽检查，中文，浅色，未连接；用脚本在页面里找被 `overflow` 裁掉、被截断和越出视口的元素（跳过 `.sr-only` 内的读屏文字）。

- **手机卡片被裁切。** `vaults-list.tsx` 的手机列表是 `grid gap-2 px-4`，没写列定义，隐式 `auto` 列按内容最小宽度撑开。`[ Systemic Strategies ] ♾️ HyperGrowth ♾️` 的名字用 `truncate`（不换行），它的完整宽度计入列宽，整列被撑到 416.2px，20 张卡片共用这一列。外框 `section.overflow-hidden` 把多出的部分切掉：375 宽切掉 57px、320 宽切掉 112px，APR、「您的权益」「运行时间」的数值和走势图右端看不到。页面本身没有横向溢出，所以没有滚动条。
- **为什么交付时没发现。** `leaderboard-vaults-staking-redesign-notes.md` 的验收标准是页面横向不溢出（`clientWidth === scrollWidth`），看不到外框内部被切掉的内容；验收截图 `vaults-normal.png` 用的是「示例核心金库」等短名字示例数据。
- **桌面表头。** 「金库」「管理者」两个表头是原生 `<th>` 且没写对齐，浏览器默认居中；表格上的 `text-start` 管不到 `th`。1001 宽下「金库」表头文字在 201–223px，名字从 60px 开始。整个应用只有这两个 `th` 没写对齐，其他表格用 `@gatu/ui` 的 `TableHead`（自带 `text-start`）或显式写了对齐。
- **头像。** `VaultMark` 取 `name.trim().slice(0, 2)`，名字以「[ 」开头时显示「[」，也可能把一个字符的代理对切开。

采用的修法：

- 手机列表加 `grid-cols-1`（Tailwind v4 为 `repeat(1, minmax(0, 1fr))`），列宽等于容器宽度；卡片内部已有 `min-w-0` 与 `truncate`，长名字按原设计显示省略号。先在页面上临时设置 `grid-template-columns: minmax(0, 1fr)` 模拟：375 宽卡片落在 16–359px，没有元素越界，只有 4 个长名字出现省略号。
- 两个 `th` 加 `text-start`。没有改用 `TableHead`：它会带上 `whitespace-nowrap`、颜色和尺寸变体，超出这次范围，重构文档也要求不改共享组件行为。
- 头像取字移到领域层 `getVaultMark`：NFC 规范化、转大写后按码点取前两个字母或数字（`\p{L}`、`\p{N}`），没有就用原来的兜底「V」。普通名字的结果不变（HY、DR、示例）；只在组件里渲染，不含业务计算。
- 新增 `apps/terminal/tests/browser/vaults-list.{html,css,fixture.tsx,pw.ts}`：夹具用真实的 `DashboardFrameView` 与 `DASHBOARD_FRAMES["/vaults"]`，内存路由，四行数据含上面的长名字；测试在 320、375 宽的英文和中文下检查外框没有隐藏溢出、每张卡片在外框内、卡片内容不越过卡片内边距、头像只含字母或数字且长名字卡片为 `SY`，并在 1001、1440 宽检查七个表头的起止对齐。CI 的 `slider-browser.yml` 在共享配置那一步加上这个文件，不新开任务；`ci-workflows.test.mjs` 的结构约束不变。
- 在重构文档的验收段落后追加更正，`CHANGELOG.md` 的 Unreleased / Fixed 加一条。

## 验证与限制

版本：基线 `fe2d8bc8` 加上本任务未提交的改动；2026-09-29，本地 macOS，主检出。

- Vitest：`vaults-domain`（含新增头像用例）、`vaults-view`、`rtl-financial-ui-contract`、`history-table-scroll-accessibility`、`vaults-fixture`、`use-vaults-controller`、`vault-detail-page-outcomes` 共 7 个文件 86 项通过。
- Playwright：`pnpm --dir apps/terminal exec playwright test tests/browser/vaults-list.pw.ts --config tests/browser/playwright.config.ts`，6 项通过（本机 Chrome 通道，夹具服务器 4179 端口，依赖缓存 `node_modules/.vite-browser`）。把组件换回 `HEAD` 版本后 6 项全部失败：外框隐藏溢出 112px（320 宽）与 57px（375 宽），「Vault」表头起点偏差 133.6px（1001 宽）与 224.4px（1440 宽）；只把头像改回旧写法时，375 宽英文用例失败，收到的头像是 `"[ "`。每次改动后都用 `cmp` 确认恢复为修复版本。
- `node --test scripts/ci-workflows.test.mjs`：6 项通过。
- Biome 检查 `src` 下改动的 3 个文件通过；`tests/browser` 不在 Biome 的 `includes` 里，和其他夹具一样按邻近文件风格手写。
- 类型检查：根目录锁定的 TypeScript 5.7.2 执行 `tsc -p apps/terminal/tsconfig.json --noEmit --pretty false` 退出码 0（包含新夹具与测试）；`pnpm --filter @gatu/terminal typecheck` 退出码 2，唯一错误是主检出残留 TypeScript 5.9.3 造成的 `use-exchange-funds-action-lock.test.tsx(150,11)` TS2322，与本任务无关。
- `pnpm i18n:extract`：没有 `.po` 变化，本任务没有增删文案。
- 开发服务器（`.claude/launch.json` 的 `terminal`，端口 3005，真实主网数据，内置浏览器视口模拟，中文，未连接）：375 宽 20 张卡片右边缘都在 359px，卡片内容越界 0，外框与页面溢出 0，两个 Systemic Strategies 金库头像为 `SY`，长名字卡片 APR `-10.09%` 完整显示；1440 宽「金库」「管理者」表头 `text-align: start`、起点偏差 0，其余五个右对齐、终点偏差 0；控制台无错误。
- 未做：真机；已连接状态（「您的权益」数值更长）；en、zh 以外的语言与 RTL；深色主题；生产构建；全量单测；CI 实跑（未推送）。

## 后续与替代关系

以下是审查发现但未修的问题，等用户决定：

- 修复后 320 宽每列只有 123px，管理者地址 `0x677d...84e7` 会显示成 `0x677d...8…`；可改为标签在上、数值在下。375 宽不受影响。
- 长名字在手机卡片上只显示一行省略号（如「HyperGrowth」看不到）；详情页是折成两行，列表可改为最多两行。
- 没有配置官方和用户金库的地址清单时只有一组，组名「金库」与页面标题重复；只有一组时可以不显示可见组名，保留无障碍名称。
- `DASHBOARD_FRAMES` 里金库、推荐、排行榜、资金费率对比、API 钱包在手机上没有 `px-4`，外框贴满屏幕却带圆角；Earn、质押、投资组合和几个历史页有 16px 边距。需要统一做法。
- 详情页「账户价值」数值压在折线上；中文翻译有 11 条 `msgstr` 直接写「Vault」，其他 68 处译作「金库」。

没有被替代的记录。下次先看 `apps/terminal/src/components/vaults/vaults-list.tsx`、`tests/browser/vaults-list.pw.ts` 和重构文档第 8 节的更正。

补记（2026-09-29）：本记录的修复提交为 `77a70867`。上面第一条（320 宽地址截断）和第四条（手机页面边距）已由 [手机仪表盘页面边距记录](2026-09-29-dashboard-mobile-gutters.md) 处理。第四条的描述有误，更正如下：排行榜、资金费率对比、API 钱包在手机上是有意的直角整页白底（圆角只在桌面端加），不是贴边却带圆角；真正贴边又带圆角和阴影的只有金库（列表与详情）和推荐页。
