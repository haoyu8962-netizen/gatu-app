<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-gutter-adversarial-review",
  "date": "2026-09-29",
  "title": "手机页面边距提交的 Codex 对抗审查与修复：规则测试、详情测试、推荐步骤标签",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "docs-governance"],
  "summary": "用 codex exec（gpt-6-astra，只读，medium）对 fad8f3d4（连同 77a70867）做对抗审查：无 P0/P1，报 2 项 P2（规则测试拦不住手机圆角与 px-0；详情测试测不到地址本身被截断）与 2 项 P3（列表未覆盖已连接权益；规范对阴影与测试能力表述不准），复核全部成立。它列为无法确认的推荐页连接状态，经应用字体实测确认 375 宽中文两个步骤标签被边距新截断。修复：步骤标签改为换行；规则测试按手机端实际生效的边距判断并检查整页白底的基础类；详情测试检查外框内所有被隐藏的内容；列表夹具改为已连接账户并含 $12,345,678.90；浏览器测试测量前等字体；新增推荐卡片浏览器测试并挂进 CI；修正规范文字。旧代码与变异下新测试均失败。单测 25 个文件 446 项、CI 同一步骤浏览器测试 47 项通过，锁定的 TypeScript 5.7.2 通过。中文换行会出现单字成行，未做真机与连接钱包的真实页面核对。",
  "thread": null,
  "baseCommit": "fad8f3d4",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/referrals/referral-code-card.tsx" },
    { "path": "apps/terminal/src/lib/tests/dashboard-frame-view.test.tsx" },
    { "path": "apps/terminal/tests/browser/vaults-list.pw.ts" },
    { "path": "apps/terminal/tests/browser/vaults-list.fixture.tsx" },
    { "path": "apps/terminal/tests/browser/referral-code-card.pw.ts" },
    { "path": "apps/terminal/tests/browser/referral-code-card.fixture.tsx" },
    { "path": ".github/workflows/slider-browser.yml" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": "docs/work-memory/sessions/2026-09-29-dashboard-mobile-gutters.md" },
    { "path": "CHANGELOG.md" }
  ],
  "supersedes": []
}
-->
# 手机页面边距提交的 Codex 对抗审查与修复：规则测试、详情测试、推荐步骤标签

## 背景与范围

同步记录，没有取得本任务的会话 ID。用户要求用 Codex 的 GPT-6 模型对 [手机页面边距修改](2026-09-29-dashboard-mobile-gutters.md) 做对抗审查，看过复核结论后要求按建议修复。工作在主检出的 `claude/from-dev-0928` 分支，基线 `fad8f3d4`；本记录与修复在同一个提交里。

审查命令：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"medium"' - < prompt`（codex-cli 0.154.0；ChatGPT 账号登录下裸 `gpt-6` 不可用）。Codex 会话 `01a0ebbc-5546-7130-b91e-c875af00df81`，16 条只读命令，约 10.3 万 token。提示词列出 9 条作者主张要求证伪，范围为 `fad8f3d4`，连带 `77a70867`，不含导航抽屉提交。完整报告只留在本机临时目录，未归档到仓库。

## 结论与依据

Codex 的结论与复核：

- **P2 规则测试拦不住手机圆角。** 原正则只要求源码里存在 `!isMobile && "… rounded-N"`。复核：在内存里给排行榜的基础类加 `rounded-24`，正则仍通过；`px-0` 被当成有边距，`max-[1000px]:px-4` 被当成没有。成立。
- **P2 详情测试测不到地址本身。** 原测试只看外框。复核：把地址改为 `truncate` 后真实运行详情测试，2 项仍通过。成立。
- **P3 列表未覆盖已连接权益。** 夹具固定未连接，权益格只有「—」。成立。
- **P3 规范表述不准。** `style-ui-guide.md` 写了「不允许带阴影的面板贴边」，但三个整页白底页面本身带 `shadow-raised` / `shadow-api-wallet-page`；也夸大了规则测试能力。成立。
- Codex 认为成立的：边距改法、`/join/$code` 复用推荐框架、三页整页白底是有意设计、共享模拟模块改动无副作用、从右到左与 `dl` 语义、编码规范；它还指出应用样式隐藏根滚动条（`styles.css`），精确的 16px 断言不会因滚动条误报。

它列为「无法确认」、经复核确认的回归：

- 推荐页连接钱包后，邀请码卡片的三列步骤标签可用宽度由源码推算为 `(W − 102) / 3 − 38`：375 宽由约 63.7px 降到 53px，320 宽由约 45.3px 降到 34.7px（与 Codex 的推算一致）。在开发页面里用应用字体（Inter，11px，500）量了 6 种语言的标签宽度：中文「创建推荐码」「邀请交易者」各 55px，改动前在 375 宽放得下，现在被截断；320 宽下西语「Operar」、阿拉伯语「إنشاء رمز」、印地语「कोड बनाएं」被新截断；英文「Create code」「Invite traders」与法语长标签在改动前就已被截断。
- 金库详情页在 320 宽、真实主网数据、未连接状态下没有被截断或隐藏的内容。

采用的修复：

- `referral-code-card.tsx` 的步骤标签由 `truncate` 改为 `break-words`，放不下时换行，过长的词允许在词内断开。未采用 `line-clamp-2`：320 宽印地语「ट्रेडरों को आमंत्रित करें」需要不止两行。未采用缩小内边距或图标：用户选择了换行方案。
- 规则测试：新增 `mobileSidePadding`，取手机端生效的横向内边距（`max-[…]:px-*` 优先于 `px-*`，`px-0` 为无），并单测五种写法；整页白底改为匹配 `cn("…bg-surface…", !isMobile && "…")`，要求基础类不含 `rounded-`、`!isMobile` 分支含圆角。仍是源码字符串检查，不是计算样式，规范里已如实写明。
- 金库浏览器测试：测量前等待 `document.fonts.ready`；列表夹具改为已连接账户，长名字金库权益 `12345678.90`（显示 `$12,345,678.90`）并标为「管理中」；详情测试检查地址所在段落不被隐藏、不越出外框，并要求外框里没有任何 `overflow` 隐藏或省略号截断的内容。
- 新增 `tests/browser/referral-code-card.{html,css,fixture.tsx,pw.ts}`：渲染真实的 `ReferralCodeCard`（就绪状态），外面套 `DASHBOARD_FRAMES["/referrals"]` 与推荐页相同的面板和网格类名（`ReferralDashboard` 依赖钱包与数据钩子，无法直接渲染，类名是复制的，页面改动时需要同步）；在 320 与 375 宽、六种语言下要求每个步骤标签无截断、不越出所在项。CI 的共享配置步骤加入这个文件。
- `style-ui-guide.md` 的 Dashboard page gutters 改为：整页白底可以保留阴影；规则测试的判定方式与只查源码字符串的限制；换行标签也属于完整显示的做法。CHANGELOG 在边距条目里补充步骤标签换行。

## 验证与限制

版本：基线 `fad8f3d4` 加上本任务未提交的改动；2026-09-29，本地 macOS，主检出。

- 变异验证：给排行榜基础类加 `rounded-24`、把金库框架改为 `px-0`，新规则测试都失败；详情地址改为 `truncate`，320 宽详情测试失败（`addressHidden` 为 true），375 宽地址本来一行放得下，照常通过；把 `referral-code-card.tsx` 换回 `HEAD`，推荐卡片 12 项全部失败。每次都用 `cmp` 确认已恢复。
- Playwright（共享配置，本机 Chrome 通道）：`vaults-list.pw.ts` 8 项、`referral-code-card.pw.ts` 12 项通过；与 CI 同一步骤的五个文件（加上 `mobile-orderbook-cls`、`drawer-interactions`、`orderbook-hover`）一起运行 47 项通过。
- Vitest 25 个文件 446 项通过：框架、推荐（界面契约、领域、活动、操作弹窗、两个钩子）、Earn / API 钱包 / 投资组合契约、金库视图与领域、从右到左排版、法律页、设计令牌棘轮、按压反馈、启动渲染组、多语言与数字格式契约。
- Biome 检查改动的 2 个 `src` 文件通过（规则测试先按 Biome 重新换行）；锁定的 TypeScript 5.7.2 `tsc -p apps/terminal/tsconfig.json --noEmit` 退出码 0；`node --test scripts/ci-workflows.test.mjs` 6 项通过；`pnpm i18n:extract` 没有 `.po` 变化。
- 截图：临时 Playwright 脚本（用完即删）在夹具里拍了中文 375 宽与法语 320 宽的邀请码卡片，标签完整换行；中文会出现「创建推荐 / 码」「邀请交易 / 者」这样单字成行。
- 未做：连接钱包的真实推荐页、真机、深色以外的截图核对、生产构建、全量单测、CI 实跑（未推送）。

## 后续与替代关系

- 中文步骤标签单字成行：若要一行放下，可把步骤项的横向内边距由 `px-2` 改为 `px-1.5`（375 宽可用 57px，≥ 55px），需要设计决定。
- 推荐码本身（最多 20 个字符，`text-lg` 粗体加宽字距）在手机上仍是单行截断，20 个字符在 320 与 375 宽都放不下，是改动前就有的问题，未处理。
- 推荐领取历史与被推荐交易者卡片的金额仍没有浏览器覆盖。
- 规则测试仍只检查源码字符串；要核对最终渲染，需要给三个整页白底页面做浏览器夹具。
- 部分更正 [手机页面边距记录](2026-09-29-dashboard-mobile-gutters.md) 的结论，不整体替代。下次先看 `tests/browser/referral-code-card.pw.ts`、`vaults-list.pw.ts` 与 `dashboard-frame-view.test.tsx`。

补记（2026-09-29）：推荐码单行截断与中文步骤标签单字成行已由[通知审查后续记录](2026-09-29-funds-ui-followups.md)修复；同时发现并修复了推荐页手机网格没有显式列、邀请链接把卡片撑宽后被外层 `overflow-hidden` 裁掉的问题，浏览器用例改为比较卡片与所在列。
