<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-20-font-practice-review",
  "date": "2026-09-20",
  "title": "字体实践审查：对照官方终端，修复图表字体栈、共享字号刻度与错误页字体",
  "kind": "task",
  "status": "verified",
  "topics": [
    "docs-governance",
    "pr-review"
  ],
  "summary": "webfont 加载契约合规；图表 iframe 里的 IBM Plex 从未生效，改为系统字体栈（iframe 内新旧栈 measureText 80 组完全相同）；packages/ui 字号刻度对齐规范并加契约测试；bootstrap 错误页不再依赖 webfont；相对单位字号纳入棘轮。250 处任意 px 字号按现行规则不横扫，仍是受控债务。移动端图表与生产构建未验证。",
  "thread": null,
  "baseCommit": "3b0a84cb91dd322725c7c0b16a4403dae36fe29a",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/config/chart.ts" },
    { "path": "apps/terminal/public/tradingview-theme-dark.css" },
    { "path": "apps/terminal/public/tradingview-theme-light.css" },
    { "path": "apps/terminal/src/lib/tests/chart-font-family-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/typography-scale-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/design-token-ratchet.test.ts" },
    { "path": "apps/terminal/src/lib/bootstrap-error-page.ts" },
    { "path": "packages/ui/src/globals.css" },
    { "path": ".claude/rules/design-tokens.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/adr/0010-blank-until-ready-startup.md" }
  ],
  "supersedes": []
}
-->
# 字体实践审查：对照官方终端，修复图表字体栈、共享字号刻度与错误页字体

## 背景与范围

同步记录。用户先要求只读审查字体实践是否符合规范，随后要求用浏览器核对官方终端的做法、规划修复、由 Codex 审查方案后执行。任务标识未取得（`thread: null`）。

分支 `claude/font-scale-compliance` 叠在未合并的 PR #31 分支 `claude/overlay-surface-tint`（`3b0a84cb`）之上，工作树 `.claude/worktrees/worktree-03`。只读审查阶段的计数取自 `origin/dev` `d1f31576`，两者不可混用。选择叠在 PR #31 上的原因：它已含字号棘轮（精确基线）、`cn()` 刻度注册和"任意值随改随迁、不得横扫"的规则，且与任意字号所在文件有 13 个重叠；从 dev 起步会在它合并时产生基线不一致和文本冲突。2026-09-20 用 `gh pr view 31` 读到的状态是 open、`CONFLICTING`（`git merge-tree` 显示冲突文件为 `CHANGELOG.md` 与 `docs/work-memory/INDEX.md`）；此状态会变，集成时须重新核对。

## 结论与依据

### 官方终端实测（app.hyperliquid.xyz，2026-09-20，浏览器 1440 宽与 375 宽）

- 全站单一字族：`OurFont`（Inter 静态 woff），`@font-face` 不声明 `font-display`、`unicode-range`，无 `preload`。与 ADR 0010 补充里的记录一致。
- 桌面 112 个可见文本节点中 107 个为 12px，其余 10/13/14/20px；移动端 12/14/18/20/10px；字重只有 400/500。
- 图表 iframe 使用 TradingView 默认系统字体栈（`-apple-system, system-ui, "Trebuchet MS", Roboto, Ubuntu, sans-serif`），FontFaceSet 只有 `EuclidCircular:unloaded`，官方不给图表设自定义字体。

### 合规、未改动

`styles.css` 的 8 个显式 `@font-face` 全部 `font-display: block`，无 fontsource `@import`；head 预加载 Inter 与 IBM Plex 的 latin 子集；`StartupReadyGate` 与 `useFontsReady` 以 `FONT_READY_TIMEOUT_MS`（3000 ms）为上限。生产站 app.gatu.ai 实测父文档只加载这两个 latin 子集，其余六个 Inter 子集未被拉取。无 `md:text-*` 这类默认断点字号，无 `font-[…]` 任意字重；`packages/ui` 与官网的任意字号为零。

输入框防缩放有两层，不要混为一谈：`styles.css` 的 `font-size: max(1em, 16px)` 位于 `@supports (-webkit-touch-callout: none)`，不在 1000px 媒体查询内；`text-input-mobile-safe` 与 `mobile-input-zoom-contract` 检查的是组件上的 `max-[1000px]:text-base` 类。本次未修改二者，375 宽实测可见输入框均为 16px。

### 修复一：图表 iframe 字体栈

`CHART_CUSTOM_FONT_FAMILY` 与两份 `tradingview-theme-*.css` 原先以 `'IBM Plex Sans Variable'` 为首选族。字体按文档隔离，iframe 样式表内没有 `@font-face`，代码也不向 iframe 注入 FontFace；生产站与本地 dev 的 iframe FontFaceSet 都只有 `EuclidCircular`，因此该族名从未解析，实际渲染的是其后的回退栈。改为 `ui-sans-serif, system-ui, sans-serif`，即保持当前实际生效的回退栈；与官方一致的只是"图表用系统字体、不依赖父文档 webfont"这一原则，具体栈并不相同。

未采用：让 IBM Plex 在 iframe 内真正生效。静态主题样式表无法引用带哈希的字体产物，需要在 `public/` 另放稳定 URL 的 woff2（冷加载多一次下载）或在图表就绪后向 iframe 注入 FontFace（canvas 已绘制的文字不会自动重绘，且 `docs/runtime-guardrails.md` §4 要求少动图表生命周期）。

新增 `chart-font-family-contract`：主题样式表和 `CHART_CUSTOM_FONT_FAMILY` 里的族名必须是系统或通用族，或由该样式表自己用 `@font-face` 声明；样式表的字体栈须与传给 widget 的一致。`tradingview-chart.test.tsx` 增加对 `custom_font_family` 构造参数的断言。`docs/runtime-guardrails.md` §4 增加对应规则。

### 修复二：字号刻度双源

`packages/ui/src/globals.css` 的 `@theme` 刻度原为 2xs=12、xs=14、sm=16、base=20、lg=24、xl=32，且没有 `3xs`、`2sm`；终端在其后的 `@theme` 全量覆盖为规范刻度，`.claude/rules/design-tokens.md` 记载的也是后者。该文件头部声称的 `src/tokens/` Figma 导出目录已不存在。改动：ui 包刻度改为与终端相同的值并补 `3xs`、`2sm`；终端 `styles.css` 的过时 Figma 对照注释改为实际值；`packages/ui/README.md` 修正刻度、行高令牌名（`--text-<name>--line-height`）和"mobile overrides"的归属（只在终端 `styles.css` 的 Layer 4，缩小 xl/2xl/3xl）。官网自有一份刻度，没有 `2sm`，多一个 `4xl`，未改动。

新增 `typography-scale-contract`：只解析两份文件各自第一个顶层 `@theme` 块，断言字号与行高完全相等，且 3xs 到 base 等于规范记载的 10/11/12/13/14/16px。Codex 用已安装的 Tailwind 4.0.6 对两个 `@theme` 块按导入顺序做内存编译，确认终端后定义胜出；本地 dev 实测改动前后 `text-xs` 12/16、`text-2xs` 11/16、`text-2sm` 13/18、`text-sm` 14/20 不变。

未采用：删除终端的 `--text-*` 块让 ui 包成为单一来源（改动主题合并路径，收益小于风险）；只改文档保留 ui 包旧值（留下一套误导性的死刻度）。

### 修复三：bootstrap 错误页

内联样式原为 `font-family:Inter,system-ui,sans-serif`，`Inter` 不是应用声明的族名。没有改成 `"Inter Variable"`：错误页不经过字体门控，而该族是 `font-display: block`，在字体未到时会让恢复文字进入阻塞期（Codex 审查意见）。改为 `system-ui,sans-serif` 并加测试。本机装有 Inter 的设备上，错误页字体会从 Inter 变为系统字体。

### 任意字号：不横扫

`origin/dev` `d1f31576` 上 `text-[N(px|em)]` 共 250 处、60 个文件，全部在 `apps/terminal/src`：13px×114、10px×67、11px×40、17px×8、15px×5、18px×4、9px×3、14px×2、8px×2、7px×2、40px、32px、0.9em 各 1。PR #31 基线上棘轮计数为 240 处 px。

PR #31 在 `design-tokens.md` 写明任意值是棘轮债务，"随改随迁，不得一次性横扫"，理由是命名字号自带行高、横扫会与所有在途分支冲突。本次遵守该规则，不迁移。用单行引号字面量分类器在 dev 基线上得到的数据仅供后续随改随迁参考，不是当前分支的准确清单：224 处有等值命名刻度，其中 132 处同一字面量内带 `leading-*`，是等值迁移候选（Tailwind v4 的 `text-<size>` 行高为 `var(--tw-leading, …)`，显式 `leading-*` 会覆盖它），但分类器不能证明 `cn()` 合并、条件类与响应式覆盖后的最终结果相同；92 处不带 `leading-*`，迁移会把继承来的行高改为刻度行高并级联到子元素，需要带账户数据的视觉核对；26 处无刻度对应，需设计决策。tailwind-merge 3.4.0 实测能把 `text-2sm`、`text-3xs`、`text-2xs` 正确归入 font-size 组，"cn 不认字号刻度"不是使用任意字号的理由。

原棘轮只匹配 px，`apps/terminal/src/lib/markdown.tsx` 的 `text-[0.9em]` 不在计数内。在同一测试文件新增相对单位（em/rem）计数，基线 1；没有改动 PR #31 的 px 基线行。

### 方案审查

方案由 `codex exec -m gpt-6-astra -s read-only`（推理强度 medium，约 7.3 万 token）审查，结论 `APPROVE_WITH_CHANGES`，六条 P2 全部采纳：错误页改用系统字体而非 webfont；棘轮补相对单位且"可证明等值"改称"迁移候选"；图表改动描述为保持现有回退栈并补 canvas 验证；图表测试改为白名单加构造参数断言；刻度测试只比较顶层 `@theme` 并写明官网差异；更正输入框防缩放规则所在位置。

## 验证与限制

全部在 `3b0a84cb` 加本次工作区改动上执行，2026-09-20：

- `pnpm exec biome check` 七个改动的 ts/tsx 文件：通过。
- `pnpm typecheck`（hl-react、ui、terminal）：通过。
- vitest 12 个文件 165 个测试通过：`chart-font-family-contract`、`typography-scale-contract`、`design-token-ratchet`、`bootstrap-error-page`、`tradingview-chart`、`chart-theme-colors`、`chart-build-assets`、`modal-surface-contract`、`startup-font-display-contract`、`font-readiness`、`class-merge-theme-scales`、`positions-table-visual-contract`。
- 变异测试：把四处改动还原为旧值后，新增的 6 条断言全部失败；还原后复跑通过。
- 浏览器（worktree 内 vite dev，端口 3017，`lsof -d cwd` 确认进程目录为本 worktree）：改动前在图表 iframe 文档内对新旧字体栈做 canvas `measureText`，4 字重 × 5 字号 × 4 种文本（含中文、阿拉伯文、印地文）共 80 组宽度完全相同。改动后 1440 宽深色、运行时切换浅色、浅色冷加载（走 `tradingview-theme-light.css`）三种情况下，图例计算字体族均为新栈，`Indicators` 55.98×14、`BTC-USDC` 63.2×14，与改动前逐位相同。
- 未运行：终端全量单测、Playwright 套件、`pnpm build`、生产或真机验证。移动端默认视图不挂载图表，移动端图表未单独核对；测量在一台 macOS 设备上完成，其他系统的字体回退未测。本地 dev 的图表图例数值显示为 `∅`（K 线未加载），改动前已如此，与本次改动无关，未排查。
- 官方终端与 app.gatu.ai 的数据来自当日浏览器实测，没有归档 HAR 或截图。
- 未写 `CHANGELOG.md`：没有用户可见的行为变化（`docs/documentation-system.md`）。

## 后续与替代关系

- PR #31 合并进 dev 后，只把本次新增提交移到最终 dev，重新计算棘轮计数并复跑上述测试；不要沿用这里记录的基线数值和冲突判断。
- 任意 px 字号仍是债务：改到相关文件时按 `design-tokens.md` 的规则迁移并下调基线；17/15/18/9/8/7/32px 需要设计决策（扩充刻度或归并）。
- `--font-market-close` 令牌名与用途不符，暂不改名（53 个非测试文件，多个在途分支）。
- 未处理、仅记录：官网用 fontsource `@import`（默认 `swap`，不属终端启动契约），`@fontsource/instrument-serif` 用 `^` 版本范围；启动门控的 `fonts.check()` 只验证 latin 规格，现有六种语言不受影响，增加西里尔或越南语前需要扩展。
- 下一次先查：`.claude/rules/design-tokens.md` 的 Typography 小节、`docs/runtime-guardrails.md` §4、`.claude/rules/startup-rendering.md`。
