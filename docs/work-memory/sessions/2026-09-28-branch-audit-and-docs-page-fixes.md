<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-branch-audit-and-docs-page-fixes",
  "date": "2026-09-28",
  "title": "未提 PR 的 worktree 与分支盘点：补回文档页、404 与翻译修复，清理已合入的本地分支",
  "kind": "task",
  "status": "verified",
  "topics": ["docs-governance", "static-hosting", "i18n-runtime"],
  "summary": "盘点 14 个 worktree、23 个本地分支与全部远端分支：远端没有遗漏（都已合入 dev 或有开着的 PR）；本地有 6 处未提 PR 的内容。按用户决定先处理两项并清理：worktree-05 在 2026-09-21 留下的未提交修复移植到 dev（文档页标题锚点与占位目录、Markdown 斜体与嵌套编号列表、点文件与长扩展名返回 404、四种语言 12 条缺译），三个提交；同一 worktree 的 p22 滑杆提交已被 dev 的 a379d231 以相反做法取代，套用会让 dev 的 2 项视图测试失败，未采用。清理了 2 个无进程的 worktree 与 8 个已并入 dev 或已被取代的本地分支；有运行中 Claude Code 会话的 worktree 未动。完整终端测试与 Node 22.15 构建通过，浏览器检查为脚本注入的点击。",
  "thread": null,
  "baseCommit": "ac11f81b",
  "commits": ["0e884e17", "34bee211", "1bea62c3"],
  "sources": [
    { "path": "apps/terminal/src/lib/markdown.tsx" },
    { "path": "apps/terminal/src/components/legal/legal-doc-page.tsx" },
    { "path": "apps/terminal/src/lib/static-pages/static-pages.ts" },
    { "path": "apps/terminal/public/sw.js" },
    { "path": "deploy/cloudfront/functions/terminal-request.js" },
    { "path": "apps/terminal/src/lib/tests/trade-form-views.test.tsx" },
    { "path": "legal/docs.md" },
    { "path": "legal/support.md" },
    { "path": "docs/trading-toolbar-redesign.md" }
  ],
  "supersedes": []
}
-->
# 未提 PR 的 worktree 与分支盘点：补回文档页、404 与翻译修复，清理已合入的本地分支

## 背景与范围

同步记录。用户在 PR #50 合入后要求检查「还有几个 worktree 或者分支没有提交 PR，是不是有遗漏或者重复」，看过盘点后决定「先做第 1、2 项和清理」。会话在 worktree `sdk-api-review-51a3ea` 进行，没有可核对的任务标识（`thread: null`）。第 3–6 项（Codex 的两批周记录整理、builder 市场下架记录、晋升前检查记录与字体对照脚本）本次没有处理。

## 结论与依据

### 盘点

- 按提交内容与文件内容比对 `origin/dev`，不只看分支名。远端分支要么已合入 `dev`，要么有开着的 PR（当时只有 #54）。
- 本地未提 PR 的实质内容共 6 处：worktree-05 的 19 个未提交文件与 `fix/p22-followup` 的 1 个提交（第 1、2 项）；`codex/reviewceshi` 与 `codex/dorad` 两批周记录整理（覆盖不同周，只在索引重叠，不重复）；`codex/01-builder-market-catalog` 的 1 份新记录；`docs/release-readiness-checks` 的 3 个提交与 5 个未跟踪的字体对照脚本。
- 真正重复的只有 `claude/sdk-review-staleness-merge`：它是第一次合并尝试，其记录已写明被 `-2` 分支取代，`-2` 的同名提交在 `dev`。

### 第 1 项：worktree-05 的未提交修复

这些改动写于 2026-09-21，基线是 `28c39643`。之后 #47（ADR 0020）把文档与法律页并入应用外壳，所以按当前 `dev` 重做，而不是整体套用：

- 文档页与 Markdown（`1bea62c3`）：删除 `legal/docs.md` 的占位目录（22 个 `](#)` 链接与给作者的替换说明），更新日期。标题生成 GitHub 风格的 id；`_x_` / `*x*` 渲染为斜体，标识符与乘号不受影响；编号列表可带嵌套项目符号而不重新从 1 编号（唯一受影响的列表就是被删的占位目录，现有文档没有这种列表）。原改动的滚动偏移针对旧文档外壳（701px 断点），改为由 `LegalDocPage` 按实际页头设置 CSS 变量：桌面 3.5rem、桌面测试网 5.5rem（多一条横幅）、手机 3.5rem 加顶部安全区，标题再留 1rem。
- 404 分类（`34bee211`）：最后一段含点、点后 1–16 位字母或数字即视为文件，包括以点开头的文件；静态页运行时、Service Worker 与 CloudFront 函数三处同一界限，并有测试钉住三处一致。冲突按 ADR 0020 的「不保留路由清单」解决。Service Worker 只改放行规则、不改缓存结构，未升版本。
- 翻译（`0e884e17`）：原改动为 es/fr/hi/ar 各填 26 条、zh 2 条。当前目录里 zh 两条已有译文；四种语言各有 12 条仍为空，已填；其余 14 条的原文已在 ADR 0015 D8 的配对改造中删除。英文源目录 2 条空值一并补上（该目录其余条目都有值）。`docs/trading-toolbar-redesign.md` 追加更正：英文回退不是这些语言的常态政策；当日每种语言仍有 18 条未译，多为配对流程文案。

### 第 2 项：p22 滑杆提交被取代

`28c39643`（2026-09-21）让 React 与布局副作用用同一表达式计算 `disabled`，以保持预渲染标记与纯视图一致。`dev` 的 `a379d231`（2026-09-22）选了相反做法：纯视图不再带 `disabled`，由控制器的布局副作用写入，并新增水合测试证明交互前已写入。把 `28c39643` 拣选到当前 `dev` 后，`trade-form-views.test.tsx` 的 2 项失败，因此未采用，拣选已撤回。worktree-05 本身（分支与未提交文件）没有改动。

### 清理

- 删除 worktree：`main-dev`（分支已随 #34 合入；唯一本地改动是 `.claude/launch.json` 的格式化与多一个 3016 端口条目，删除前备份到本会话 scratchpad）、Codex 的 `pr22-ci-remediation`（已并入 `dev`）。两者删除前都确认没有进程以其为工作目录。
- 删除本地分支（删除前确认未被检出、且是 `origin/dev` 的祖先或已被取代）：`claude/sdk-review-staleness-merge`（原头 `6e7a4958`，已被取代）、`claude/sdk-review-staleness-merge-2`、`claude/start-dev-server-eef652`、`codex/pr22-ci-remediation`、`fix/pairing-page-hardening`、`claude/integrate-hydration-leverage-warning`、`docs/slider-pause-record-pr49`、`claude/sdk-api-review-51a3ea`。远端分支未删。
- 未清理：`determined-bell`、`eloquent-swartz`、`frosty-satoshi`、`hungry-cartwright`、`start-dev-server-eef652`、`vigilant-brahmagupta` 各有运行中的 Claude Code 进程，`goofy-poincare` 有一个打开的终端；`hungry-cartwright` 在盘点后被一个新会话切到了 `claude/nifty-hofstadter-afde70`。删掉目录会破坏这些会话。

## 验证与限制

- 本分支头 `1bea62c3`：`pnpm --filter @gatu/terminal typecheck` 通过；Biome 通过；`node --test deploy/cloudfront/functions/functions.test.mjs` 11 项通过；Markdown、法律页、静态页、Service Worker、目录与启动相关 21 个测试文件 608 项通过；完整终端测试 628 个文件、7,660 项通过（1 项跳过）；Node 22.15、移开 `.env.local` 的 `pnpm build` 通过分块环与包体预算（总 gzip 比脚本基线 +5,453 字节，`trade-terminal-page` 124,837）。
- 变异核对：逐个把 `markdown.tsx`、`legal-doc-page.tsx`、`static-pages.ts`、`sw.js`、`legal/docs.md`、`terminal-request.js` 换回 `dev` 版本，相关测试分别有 4、3、2、3、1、1 项失败，换回后全部通过。
- 浏览器（本分支开发服务器 3005、内置浏览器、未连接钱包、脚本注入的点击）：1440 宽点击 Support 的 Troubleshooting 链接，标题停在距顶 72px（页头底边 56px），路由没有把滚动重置；从别的页面整页打开 `/support#response-times` 滚到该节（最后一节，停在最大滚动位置）；375 宽点击 Reporting Bugs & Feedback，标题在粘性页头（57px）下方；`/docs` 斜体正常、没有占位目录与 `](#)` 链接。桌面测试网的 5.5rem 只有单元测试证据；没有在真机或 iOS 安全区上核对。
- 部署侧的 `verifyDeployment` 新增的 `/missing.webmanifest` 与 `/.env` 检查只会在下次真实部署时运行，本次没有部署。

## 后续与替代关系

- 本分支待推送并向 `dev` 开 PR。合入后 worktree-05 的未提交改动即被本次提交取代，是否删除该 worktree 由用户决定。
- 第 3–6 项仍待处理；有运行中会话的 worktree 需先在应用里归档或结束对应会话再清理。
- 没有被整体替代的记录。
