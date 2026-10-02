<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-remove-dead-chart-format-module",
  "date": "2026-10-02",
  "title": "删除无人导入的图表日期格式模块 lib/chart/format.ts 与 SHORT_MONTHS",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "在 dev（682430ba）上复核：终端的 lib/chart/format.ts（formatShortDate、formatTime、formatTooltipDate，手写月日与时分，不跟随界面语言和数字格式设置）自 10952c74（2026-07-21）删除 KLineChart 后再没有导入方，静态与动态导入、vi.mock、lib/chart 桶文件、测试、脚本、官网和文档都没有；config/chart.ts 的 SHORT_MONTHS 只被它使用。两者一并删除，行为不变，现行文档不涉及。终端类型检查、Biome、「Number and date formatting」测试组与 17 个图表相关测试文件通过；在未推送的 claude/sleepy-archimedes-fbff3e 上叠加本次删除后，日期语言契约 40 项与类型检查通过；对领先 dev 的本地与远端分支预演合并，没有新增冲突。未跑完整测试、生产构建与浏览器检查。",
  "thread": null,
  "baseCommit": "682430ba",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/config/chart.ts" },
    { "path": "apps/terminal/src/lib/chart/index.ts" },
    { "path": "apps/terminal/src/lib/format.ts" },
    { "path": "docs/number-format-setting.md" }
  ],
  "supersedes": []
}
-->
# 删除无人导入的图表日期格式模块 lib/chart/format.ts 与 SHORT_MONTHS

## 背景与范围

同步记录。来源是另一会话的日期语言契约任务：它在分支 `claude/sleepy-archimedes-fbff3e`（未推送）的任务记录 `2026-10-02-date-locale-reactivity-contract.md` 里，把 `apps/terminal/src/lib/chart/format.ts` 列为范围外发现（没有导入方；它自己的 `formatTime` 与 `lib/format.ts` 跟随界面语言的同名函数容易混淆），并开了后续任务卡片。那份记录和它的契约测试 `date-locale-reactivity-contract.test.ts` 都不在 `dev` 上，这里只按名称引用。

用户在本会话的要求：复核这个模块确实没有导入方（包括动态导入、`apps/terminal/src/lib/tests` 与 `apps/terminal/tests` 下的测试、脚本和官网），检查 `config/chart.ts` 的 `SHORT_MONTHS` 有无其他使用方，删除死模块（`SHORT_MONTHS` 只在因此失去使用方时才删）；分支基于 `dev`，不推送。

本会话运行在应用创建的 worktree `wonderful-mccarthy-709acd`（分支 `claude/wonderful-mccarthy-709acd`）。开始时分支停在 `main` 的 `3ced842e`，工作区干净，树与 `origin/dev`（`682430ba`）相同；先把分支重置到 `origin/dev` 再开始。worktree 原本没有 `node_modules`，用 `pnpm install --frozen-lockfile` 安装，没有改动跟踪文件。未取得可核对的任务标识，`thread` 记为 null。

## 结论与依据

**模块没有导入方**（基线 `682430ba`）：

- `git grep` 全仓已跟踪文件：`chart/format` 0 处；`formatShortDate`、`formatTooltipDate`、`SHORT_MONTHS` 只出现在 `lib/chart/format.ts` 与 `config/chart.ts` 两个文件。范围包括 `apps/terminal`（含两个测试目录）、`apps/website`、`packages`、根目录与终端的脚本和 `docs`。
- 全仓的 `@/lib/chart/...` 模块说明符共 13 种，没有 `format`；`lib/chart/index.ts` 只转出 `candle`、`resolution`、`store`、`symbol`；`lib/chart` 没有子目录，也没有文件导入 `./format`。
- 导入 `formatTime` 的 5 个文件（`portfolio-performance-chart.tsx`、`footer-bar.tsx`、`vaults-list.tsx`、`lib/trade/trades.ts`、`lib/tests/format.test.ts`）都从 `@/lib/format` 导入，也就是跟随界面语言的那个。
- 没有 `import * as` 或 `export *` 指向 `config/chart` 或这个模块，`config` 也没有桶文件；唯一的 `import.meta.glob` 是 `lib/i18n.ts` 的语言目录；4 处以变量或模板字符串为参数的动态导入分别指向 SDK、品牌脚本和构建清单；`vi.mock` 对 `lib/chart` 只 mock 了 `candle-gate`、`load-tradingview`、`theme-colors`。
- 连同被 Git 忽略的文件一起做文件系统搜索（`rg`，排除 `node_modules`），只命中这两个文件本身。
- 终端 `tsconfig.json` 的程序包含 `apps/terminal` 下全部 1,572 个 TS 文件（`src/lib/tests` 626 个、`tests/` 81 个），删除后类型检查通过，可以排除静态导入和字面量动态导入。

**何时成为死代码**：`git log -S "chart/format"` 显示最后一个导入方是 `components/trade/chart/kline-chart.tsx`，它在 `10952c74`（2026-07-21，`fix(trading): correct order book and chart integrations`）随 KLineChart 图表源一起删除。同一提交删掉了 `config/chart.ts` 里其他 K 线常量，但留下了这个模块和 `SHORT_MONTHS`。模块本身最后一次修改是 `4f70707a`（2026-04-25）。

**改动**：删除 `apps/terminal/src/lib/chart/format.ts`；删除后 `SHORT_MONTHS` 再无使用方，从 `config/chart.ts` 一并删除。删除的代码不在任何导入链里，不进入包体，用户可见行为不变。现行文档（`docs/`、`AGENTS.md`、各 README、`.claude/rules`）都没有提到这个模块或 `SHORT_MONTHS`，不需要改；不是用户可见变化，`CHANGELOG.md` 不记。

**其他分支**：逐个检查全部本地和远端分支相对 `dev` 合并基的改动与引用。只有 `claude/infallible-goldstine-02a7e3` 改了 `config/chart.ts`（删 `CHART_DEFAULT_PRICESCALE`，在文件前部，与本次删除的文件末尾不相邻）；只有 `claude/sleepy-archimedes-fbff3e` 的任务记录正文提到这个模块；没有分支新增对它或 `SHORT_MONTHS` 的引用。

**未采用**：不把模块改造成跟随语言的实现。它没有调用方，而跟随界面语言的时间格式化已经由 `lib/format.ts` 的 `formatTime`、`formatDateTime` 提供（`docs/number-format-setting.md`）。

## 验证与限制

2026-10-02 在本 worktree（基线 `682430ba` 加本次改动）执行，Node 24.15.0、pnpm 10.21.0：

- `pnpm --filter @sairn/terminal typecheck`：通过（TypeScript 5.7.2）。
- `pnpm exec biome check apps/terminal/src/config/chart.ts`：通过；被删除的文件无需检查。
- AGENTS.md「Number and date formatting」组（`format`、`number-format-settings`、`number-format-reactivity-contract`、`locale-format-contract`、`decimal-input-normalization`、`tradingview-chart`）：6 个文件 139 项通过。
- 另跑导入 `@/config/chart` 或 `@/lib/chart/*` 的 17 个测试文件：16 个通过，`websocket-soak` 按默认跳过；245 项通过、1 项跳过。
- `pnpm i18n:extract`：语言目录没有变化（模块不含可翻译文本），提交钩子不会带入目录改动。
- 用一个不挂分支的临时提交，对 17 个领先 `dev` 的本地分支（含 `main`）和 `origin/main` 做 `git merge-tree` 预演：冲突文件与各分支直接合入 `dev` 的结果完全相同，没有新增冲突。`codex/01-builder-market-catalog` 与 `dev` 原本就在工作记录文件上冲突，与本次无关。这只覆盖本次的代码改动，本记录和 `INDEX.md` 与其他新增记录的分支合并时会照常出现索引冲突。
- 在 scratchpad 里临时开分离 worktree：`claude/sleepy-archimedes-fbff3e`（`6b18c20b`）叠加本次删除后，`date-locale-reactivity-contract.test.ts` 40 项通过；与 `locale-format-contract`、`number-format-reactivity-contract`、`format` 一起共 4 个文件 89 项通过；终端类型检查通过。临时 worktree 随后删除，那个分支没有改动。
- `pnpm memory:index` 为本记录写入两行索引；`pnpm memory:check` 通过；`pnpm memory:test` 8 项通过；`git diff --check` 无问题。

限制：

- 没有跑完整终端测试、生产构建和浏览器检查：删除的模块不在任何导入链里，没有可在页面上观察的变化。
- 只检查了本仓库；终端和官网的 `package.json` 都是 `private`，不作为包发布。

## 后续与替代关系

- 没有必须跟进的事项。
- 合并 `claude/sleepy-archimedes-fbff3e` 后，那份日期语言契约记录里「局部同名函数（例如 `lib/chart/format.ts` 自己的 `formatTime`）不算」一句会指向已删除的文件；它是历史记录，按惯例不改写，需要时在它的后续一节追加指向本记录。
- 没有被替代的记录。
