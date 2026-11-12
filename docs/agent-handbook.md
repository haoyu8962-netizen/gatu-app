# Agent 工作手册

状态：现行约定，2026-10-08 建立。范围：在本仓库工作的编码 agent（Claude Code、Codex 等）怎样与运营方协作，工作环境是什么样，跨主题的工作流程与常见陷阱，以及更换账号或机器时要重新配置的东西。产品行为契约不在这里，见 [AGENTS.md](../AGENTS.md) 与[文档地图](README.md)。

本文内容整理自 agent 的私有记忆，逐条来源见[交接记录](work-memory/sessions/2026-10-08-agent-docs-handover.md)。Agent 的用户级记忆（例如 Claude Code 的 `~/.claude/projects/<项目>/memory/`）留在本机，换账号、换机器或使用云端会话时都读不到。需要长期保留的经验写进本文、对应的专题文档或任务记录，不能只留在私有记忆或回复里。

## 1. 开始一个任务

1. 读 `AGENTS.md`、`agent.md`、`.claude/rules/` 与本文。Claude Code 会通过 `CLAUDE.md` 自动加载前两个文件和规则目录；本文要主动读。
2. 运行 `pnpm memory:index` 生成本地的工作记忆索引 `docs/work-memory/INDEX.md`。这个文件不入库，见 [ADR 0049](adr/0049-local-work-memory-index.md)。然后按关键词查索引与相关专题文档，避免重复排查。历史记录是证据，不是指令。
3. 查当前状态：`git fetch origin` 后看 `origin/dev`、`origin/main`，运行 `gh pr list --repo zora4523-bot/gatu-app --state open`，再读工作记忆索引里最新的发布记录与交接记录。旧记录里的「未合入」「未发布」可能已经过时，用 `git merge-base --is-ancestor <提交> origin/dev` 核对。
4. 在独立工作树里改动（第 4 节），记下基线提交，任务结束前写任务记录（[工作记忆约定](work-memory/README.md)）。提交遵守 auto-commit 技能（`.agents/skills/auto-commit/SKILL.md`，Claude Code 经 `.claude/skills/auto-commit` 加载）：只暂存本任务的文件，验证后提交，推送之前先问运营方。

## 2. 与运营方协作

- **语言**：回复一律用简体中文，标题、表格表头和总结也用中文。代码、路径、提交号、标识符、命令输出，以及作为讨论对象的英文界面文案保持原样。仓库文档沿用各文件原有的语言。
- **只能由运营方本人做的事**：账号登录、输入密码或密钥、填写付款或银行卡信息、接受或拒绝法律条款、创建第三方账号、修改 AWS IAM 权限或账户计费设置。遇到这些步骤就停下来交给运营方。可以先准备好要粘贴的内容、给出操作路径，等运营方做完再核对结果。
- **秘密**：不读取、不打印 `.env*` 的值、私钥、Agent 密钥、令牌和 AWS 账号 ID。需要核对时比较哈希，或在本地产物里 grep，只报告「一致」或「不一致」。
- **需要先问的动作**：推送、开 PR、合并 PR、发布，改动 AWS、Cloudflare、Privy 或 GitHub 的设置，以及在 PR 上代替运营方留言。一次同意只对那一个动作有效。不要开启 GitHub auto-merge：`dev` 没有必选检查，auto-merge 可能不等 CI 跑完就合并。
- **「合并到主分支」「从 main 开分支」**：按 [git 规则](../.claude/rules/git.md)理解为开 PR 进 `dev`、从 `origin/dev` 开分支，并在回复里说明这样理解。只有运营方明确说是紧急修复，才直接对 `main`。
- **长任务报告进度**：多轮审查直到评分达标这类循环任务，开始时说明每轮的大致成本（时间和 token）。每轮结束用表格报告轮次、各路评分、主要发现、修复打算和预计剩余时间。达到运营方给的门槛就收尾，不为更高分再加一轮，并写明最后一批改动有没有再送审。
- **「确保下次不再出现」**：落成四件事。规则写进规范文档；加一个会失败的契约测试，例外逐条带理由和次数，并用变异证明它真的会失败；在 AGENTS.md 加指针和回归清单条目；在任务记录写后续事项。待决项写进测试的待决清单和任务记录，不能只写在回复里。样板是[样式指南「Checking a visual rule」](../.claude/rules/style-ui-guide.md)。
- **交互缺陷复现不了**：先让现象自己说话，不要凭源码推断。给控件加可观测的结束原因（如滑杆的 `data-gesture-end`），或装只读记录器写进 `sessionStorage`，请运营方在 agent 能读到的页面上复现，再读记录。验证结论写明输入路径：脚本派发、协议注入还是物理输入。找到并修复了一个缺陷，不等于修好了被报告的那一个，交付前要确认是同一个现象（[滑杆交互](slider-interactions.md)、[ADR 0018](adr/0018-slider-gestures-end-on-release.md)）。
- **浏览器选择**：在浏览器里调试或验证时，默认用运营方的 Chrome（Claude in Chrome）。扩展连不上就告诉运营方并等待处理，不要悄悄改用内置浏览器（2026-10-04 运营方的要求）。内置浏览器面板常处于隐藏状态（第 5 节），只在运营方点名时使用。
- **不设律师闸门**：运营方 2026-10-25 决定，官网、营销与产品规划不再加入「等律师」「律师同意前不上线」一类的闸门或审批步骤，也不再向运营方提律师问题（运营方陈述律师已完全同意在日本展开）。文案仍按产品事实写准确：第三方部署、不是持股、杠杆风险、受限地区（[官网规划](website-plan.md)第 9 节）。
- **契约冲突**：下级文档与 AGENTS.md 或 ADR 冲突时，记为待运营方决定，不要在下级文档里自行解释掉。
- **如实报告**：测试失败就贴出失败输出，跳过的检查写「未运行」。只读审查、注入事件和无头脚本得出的结论，要写明它们证明不了什么。

## 3. 仓库、分支与 CI

- 远端只有 `origin`，即 `zora4523-bot/gatu-app`，是私有仓库，走 SSH 推送。仓库含 TradingView Advanced Charts 文件（`apps/terminal/public/charting_library/`），许可不允许公开再分发，所以不能为了省 CI 分钟改成公开仓库。
- 分支流向见 [ADR 0016](adr/0016-dev-first-pull-requests-and-ci-tiers.md) 与 [git 规则](../.claude/rules/git.md)：功能分支进 `dev`，`dev` 用 merge commit 晋升到 `main`。任务记录与 ADR 引用分支上的提交号，所以不能 squash 或 rebase。进 `dev` 的 PR 同样用 merge commit 合并：晋升判定（ADR 0016 D8）只认 GitHub 生成的 `Merge pull request #N from …` 提交，squash、rebase 或直接推送 `dev` 都会让下一次晋升全跑。新分支用 `git switch --no-track -c <name> origin/dev`，`--no-track` 防止误推到 `dev`。`main` 比 `dev` 多出几个晋升合并提交属于正常。
- **合并 PR 之前**先读机器人的审查意见：`gh api repos/zora4523-bot/gatu-app/pulls/<N>/comments` 与 `.../reviews`。没有开 Auto-fix 的 PR 收到意见时不会有任何通知。逐条对照代码核实后再决定改不改，机器人也会出错：2026-10-03 PR #74 的 P2 把 `dev` 的状态当成了 `main` 的，用 `git merge-base` 核对后确认不成立。
- **CI 成本**：GitHub Actions 额度是每月 3,000 分钟。代码 PR 每推送一次，五个工作流都触发时约 64–68 计费分钟（2026-11-01 PR #130 两轮实测，按作业向上取整）。2026-09-20 PR #32 合入后实测约 33，之后单测拆成两片，单测与浏览器套件也都变长了。工作流都按路径过滤，只改 `docs/`、`notes/`、`.claude/`、`.agents/` 或根目录 Markdown 的 PR 不触发任何检查，`gh pr checks` 显示 no checks reported，可以直接合并。改 `apps/**`（包括其中的 README）、`deploy/**`、`brand/**`、`legal/**` 会触发构建和测试。纯文档补记随下一个 PR 带上。进 `main` 的 PR 另外跑配对开关打开的构建。`dev → main` 的晋升 PR 先由各工作流的 `Promotion coverage` 作业核对 `dev` 是否已经测过同一棵树：测过就只跑静态检查和配对开启构建（预计约 14 计费分钟），否则全跑（约 70 计费分钟），见 [ADR 0016](adr/0016-dev-first-pull-requests-and-ci-tiers.md) D8 与第 8 节。
- **少跑一轮的做法**（2026-10-12 与运营方商定）：一个代码 PR 尽量只推一次。开 PR 前在工作树跑完改动文件的 Biome、`typecheck`、`node --test scripts/*.test.mjs`（改了工作流或脚本时）和**全量终端 Vitest**（`pnpm --filter @sairn/terminal test --maxWorkers=4`，2026-10-12 实测 678 个文件约 3 分钟；CI 只跑手选清单，定向测试两次漏掉了清单外或自己没想到的文件：#103 的预算测试、#104 的 `embedded-deposit-auto-bridge-sonner`），涉及滑杆、资金、下单的再跑对应浏览器套件；推送后先等一两分钟看 Codex 机器人的评论，成立的和 CI 失败一起改，攒成第二次推送，不要一条评论推一次。代码 PR 的 CI 跑完后如果只剩文档补记，另开一个不触发工作流的文档 PR，不要为它再推一次代码分支。`Terminal Tests` 与浏览器回归各两片并行，一轮等待约等于较慢的那一片；只改 `*.test.ts(x)` 的 PR 不跑浏览器回归（[ADR 0016](adr/0016-dev-first-pull-requests-and-ci-tiers.md) 2026-10-12 补记）。
- **不默认开 Auto-fix**（运营方 2026-11-05）：开 PR 后不主动提议开启 Auto-fix，运营方明确要求时才开。原因：
  - Auto-fix 会为每个 CI 失败、冲突或评论推一次修复，每推送一次就全跑一轮，形成「修复 → 推送 → 跑 CI」的循环，与上一条「尽量只推一次」冲突。
  - 晋升 PR 的 head 就是 `dev`，修复只能另开 PR 进 `dev`，所以晋升 PR 永远不开。

  运营方问到 CI 时，用 `gh pr checks` 查一次，并读机器人的评论；失败和意见攒成一次推送。
- **CI 秒失败**：所有 job 十几秒内失败且 steps=0 时，先看 `gh api repos/zora4523-bot/gatu-app/check-runs/<job id>/annotations`。注解如果是额度或预算拒绝（spending limit、Actions budget），就不是代码问题。预算只能由运营方在 GitHub 账户设置里调整，调整后约 3 分钟才生效，先 rerun 最便宜的工作流来探测。
- **运行器镜像**：安装 Playwright 浏览器的作业（浏览器回归、官网构建）固定在 `ubuntu-24.04`。2026-11-12 `ubuntu-latest` 变成 26.04 后，Playwright 1.59.1 报「does not support chromium on ubuntu26.04-x64」，这两类作业一分钟内失败，与 PR 内容无关。升级 Playwright 时再评估改回 `ubuntu-latest`。
- **Claude Code 工作流**：`claude.yml` 在评论里出现 @claude 时运行，需要仓库密钥 `CLAUDE_CODE_OAUTH_TOKEN`；`Claude Code Review` 工作流已手动停用。2026-10-08 查询时仓库没有任何 Actions 密钥，所以 @claude 目前不能用；要启用，由运营方用自己的 Claude 账号生成令牌后写入。
- **集成 PR**（把多个完成的分支合成一个 PR）：
  - 先确认对应会话已结束、工作树干净、本地分支头等于远端。从最新的 `origin/dev` 建分支，按依赖顺序逐个 `git merge --no-ff`。
  - 用 `git merge-tree --write-tree --name-only origin/dev <branch>` 预演冲突；用 `git cherry -v origin/dev <branch>` 查哪些补丁已经以别的提交进了 `dev`。
  - 冲突多在工作记录、CHANGELOG 与 ADR 目录。同名记录取两边的超集。`INDEX.md` 不入库（ADR 0049），不会冲突；早于 ADR 0049 的分支如果改过它，合并时保留删除（`git rm docs/work-memory/INDEX.md`）。`dev` 后来新增的源码契约测试会在合并后才报错，所以每次合并后先跑契约测试，再提交合并。两边都往 CI 清单加了同一个测试文件时要去重。
  - 合并后跑全量单测与相关的浏览器套件；开 PR 前按 CI 环境做一次生产构建量包体（第 6 节）；另写一条集成任务记录。被集成的 PR 会在集成 PR 合并后被 GitHub 自动标为已合并。
  - 签名、下单、资金相关的改动和独立功能单独开 PR；小而无关的低风险改动可以合批。
- **同步 `dev`**：桌面应用的 `sync_with_base_branch` 只接受 `main` 或默认分支，同步 `dev` 要手动 `git fetch origin dev` 再 `git merge --no-ff origin/dev`，推送前再 fetch 一次。合并跨过依赖升级时先跑 `pnpm install --frozen-lockfile`（比较 `node_modules/.pnpm/lock.yaml` 与 `pnpm-lock.yaml` 可知是否需要），否则测试和构建用的还是旧依赖。

## 4. 共享检出与工作树

- 主检出 `gatu/` 可能同时被其他 Claude 会话、Codex 或运营方使用。改动放在独立工作树（`.claude/worktrees/<名称>`），不要在主检出上切分支，也不要替别人提交。
- 桌面应用自动建的工作树可能停在 `main` 或主检出当时的 HEAD，而不是 `origin/dev`。动手前先 `git fetch` 并核对基线，没有独有提交的分支直接 `git merge --ff-only origin/dev`。
- 新工作树装依赖用 `pnpm install --frozen-lockfile --prefer-offline`，几秒到半分钟。只有需要钱包登录的开发服务器才复制主检出的 `apps/terminal/.env.local`（复制即可，不读内容）；量包体的工作树不要放这个文件（第 6 节）。
- **提交前**：`git log -1` 确认 HEAD 没被别的会话推进，`git diff --cached` 只含本任务的文件，出现不认识的改动就停手调查。只用显式路径 `git add`。下面几个机制会把别人的改动带进你的提交：
  - lefthook 的 pre-commit 会跑 `pnpm i18n:extract` 并把 `.po` 加进暂存区。它扫描整个工作区的源码，可能把别的会话还没提交的文案一起带进来。本任务没有新文案时，把这些 `.po` 撤出暂存区。
  - `git apply --3way` 会把干净应用的文件直接暂存。之后先 `git restore --staged .`，再逐个 add。
  - `git add -- <已暂存删除的路径> <其他文件>` 会整体中止，一个文件都不暂存。暂存后一律用 `git status --short` 检查。
  - git stash 栈被所有工作树共享，不要用裸 `git stash` 或 `git stash pop`。
  - 工作树没装依赖时，提交钩子找不到 lefthook，会打印「Can't find lefthook in PATH」后放行，commitlint 与 Biome 都没跑，钩子的后备探测还会留下 Swift 的 `.build/` 目录。这时用主检出的 `node_modules/.bin/commitlint`（在主检出目录运行）手动校验提交信息，提交后删掉 `.build/`；改了代码的提交先装依赖再提交。
  - Claude 桌面应用的命令沙盒里，lefthook 找得到却启动不了钩子命令：commit-msg 在 0.00 秒内报 `operation not permitted` 并拒绝提交（2026-11-02 实测，同一条信息在沙盒外通过），所以提交在沙盒外执行。同一个沙盒里 `gh` 校验不了 TLS 证书（`x509: OSStatus -26276`），也要在沙盒外运行；`pnpm install` 用不了全局存储，会把依赖下载到工作树里 Git 忽略的 `.pnpm-store/`（约 1.4 GB），`prepare` 里的 `lefthook install` 因写不了 `.git/hooks` 而失败，钩子本来就在，不影响安装。
- **清理工作树前**逐项核对：`git status --porcelain` 为空；分支提交都已在 `origin/dev`（只在 `main` 上的分支先核对 `origin/main` 的祖先关系）；没有 `.worklog/`；`.env.local` 与主检出 `cmp` 相同（不打印内容）；`lsof -d cwd -Fpcn` 显示没有进程以它为工作目录（`lsof +D` 会递归扫描 `node_modules`，非常慢）；没有打开的 PR。其他会话名下的工作树，要运营方逐个同意后才清理。发布工作树放在仓库外（`gatu-release-*`），保留到下一次发布，作为回滚产物。
- **shell 陷阱**：`| tail` 之类的管道会吞掉前一个命令的退出码，判断成败时单独取 `$?`；`pnpm build … | head` 会让构建收到 SIGPIPE 提前终止，应先写日志文件再 grep；zsh 不按空格拆分 `$var`，传文件列表要写 `${=var}`；不要用 `path`、`status` 作变量名；macOS 没有 `timeout` 命令；BSD `sed` 不认 `\|`，要用 `sed -E` 加 `|`。
- **本机网络**：本机有 HTTP 代理（`127.0.0.1:6152`）和 fake-ip DNS（解析到 `198.18.x.x`）。核对 DNS 要问权威服务器（`dig @<权威 NS>`，看 `aa` 标志）；`curl --resolve` 要加 `--noproxy '*'`；经过代理时 `curl -I` 的第一行是 CONNECT 的 200，状态码要用 `-w '%{http_code}'` 取。经代理访问 GitHub HTTPS 偶有 TLS 重置，重试或改用 `gh api`。Claude 桌面应用的命令沙盒会拦下经 SOCKS 代理的 SSH（报 `nc: connection failed, SOCKS error 2`），`git fetch` 与 `git push` 要在沙盒外执行；运营方可以用 `/sandbox` 调整放行规则。

## 5. 本地运行与浏览器验证

- `.claude/launch.json` 定义了开发服务器：`terminal`（3005）、`terminal-card-funding` 与 `terminal-pairing`（同为 3005，分别打开对应开关）、`terminal-inspect`（3015）、`terminal-3006`、`funds-forms-fixture`（4187，不需要钱包的资金表单夹具）、`terminal-spa`（3030，构建产物的静态服务）、`website`（3010）。本地钱包登录用 3005：2026-10-03 运营方在 Chrome 里用它登录成功；3015 曾因 Privy 的 `frame-ancestors` 拒绝而登录失败；2026-10-02 读线上 Privy 应用的公开配置时还没有 localhost 来源。登录失败时先核对 Privy 控制台里的允许来源。默认的 `terminal` 不带银行卡入金开关，要看到「Buy USDC with a card」入口用 `terminal-card-funding`。
- 会话开在主检出时，`preview_start {name}` 读主检出的 `launch.json`，跑的也是主检出的代码。要预览工作树里的改动，先在后台运行 `pnpm --dir <工作树>/apps/terminal exec vite dev --port <空闲端口> --strictPort`，再用 `preview_start {url}` 打开，并用设置弹窗「About」里的版本（`<发布号> · <sha>`，本地为 `dev`；行情尚未就绪、Settings 不可用时页脚会临时显示同一标识）和 `lsof -a -p <pid> -d cwd` 核对跑的是哪份代码。找监听进程用 `lsof -nP -iTCP:<端口> -sTCP:LISTEN -t`；`lsof -ti :<端口>` 会把浏览器的连接也列出来，按它杀进程会误杀。
- **页面隐藏伪影**：内置浏览器面板没有显示，或 Chrome 窗口被遮挡时，`document.visibilityState` 是 `hidden`。表现为订单簿一直等待，图表图例显示 ∅ 而页头价格在动，启动闸门停在加载播报，`setTimeout` 被对齐到 1 秒，过渡动画停在半透明。原因是 hl-react 在隐藏时缓冲非用户数据流，TradingView 隐藏时不绘制。看到这些先读 `visibilityState`，不要当缺陷排查（[ADR 0005 已知局限](adr/0005-spa-static-shell.md)）。面板隐藏时 `resize_window` 也改变不了布局视口。
- **无头取证**：面板隐藏又需要页面证据时，用仓库里的 Playwright 无头打开页面读计算样式，加载方式是 `require(require.resolve("@playwright/test", { paths: ["<仓库>/apps/terminal"] }))`。报告里写明是脚本读取，不是真人查看。仪表盘的真实路由是驼峰写法并带地址，例如 `/fundingComparison`、`/tradeHistory/<地址>`。`apps/terminal/tests/browser/` 下有现成脚本，例如 `csp-coverage.mjs`、`boot-milestones.mjs`、`dashboard-surface-audit.mjs`。
- **弹出窗口**：Claude 桌面应用的内置浏览器不允许页面打开新窗口，所以 Privy 非 Stripe 服务商的购买窗口在面板里会报「Unable to open payment window」。钱包连接与购买流程在 Chrome 里验证（Claude in Chrome 或运营方本人操作）。
- **Claude in Chrome 的坑**：对开发服务器页面调用扩展的 `read_network_requests` 或 `read_console_messages` 之后，Vite 的模块请求会在 Chrome 里长期挂起，页面停在启动占位；换一个新标签页、不再调用这两个工具即可恢复，要看请求就在页面里装 `PerformanceObserver`。`browser_batch` 里的点击坐标以上一次截图为准，窗口尺寸变了先单独截一次图。新的 Chrome 配置第一次登录会弹协议确认（需要钱包签名），只能由运营方点。脚本对 Base UI 菜单触发器调用 `.click()` 打不开菜单，要用浏览器工具点击或派发指针事件。本站页面的 CSP 会拦下对本地文件服务器的 `fetch`，注入测试脚本用浏览器工具或 Playwright 的 `addInitScript`。
- **iOS 模拟器**：`funds-forms-fixture`（4187）可以在模拟器的 Safari 里打开 `http://127.0.0.1:4187/account-actions.html?surface=funds`，不用登录就能操作真实的资金弹层与表单，验证触摸与软键盘（运营方要先在模拟器面板里允许访问）。坐标用点（iPhone SE 是 375×667），点击后的第一张截图常常还是过渡前的画面，再截一次再下结论；拖动用 `touch_path` 并在末尾停顿，`swipe` 会甩到底。做完要 `preview_stop`：仓库的 Playwright 配置是 `reuseExistingServer: false`，4187 被占会直接失败。2026-10-05 这条路径发现了 Playwright 与多轮审查都没发现的遮挡（固定的关闭按钮压在滚上来的文字上）。输入是注入的触摸，不是手指，相机扫码也做不了。
- **模拟器不会挂起后台页面**（2026-11-12）：在模拟器里把 Safari 切到后台 170 秒，页面的定时器和 WebSocket 一直在跑，真机上的「后台挂起」不会出现。要模拟挂起，从宿主机对模拟器的 Safari 进程发 `SIGSTOP`，过一段时间再 `SIGCONT`：用 `ps -axo pid,command | grep CoreSimulator` 找出 `MobileSafari`、`WebContent`、`Networking`、`GPU` 四类进程。先按 HOME 再挂起，恢复后点 Dock 上的 Safari 图标回到前台；`open_url` 会重新导航，换成新文档。这只能模拟进程冻结，网络还是 Mac 的：蜂窝网络下 NAT 映射过期造成的「连接不报错但已死」复现不了，系统回收进程后的冷启动也复现不了。`xcrun simctl` 与监听本地端口都要在沙盒外运行。
- **半开连接的取证**：浏览器对一条对端不再应答的连接调用 `close()`，要等关闭握手超时才触发 `close` 事件。`apps/terminal/tests/browser/websocket-half-open-probe.mjs` 用一个停止应答的本地服务在真实引擎里量这个等待和重连耗时（2026-11-12：Chromium 60 秒，WebKit 约 0.1 秒）。规则与补丁见 [ADR 0050](adr/0050-websocket-recovery-on-resume.md)。
- **对照官方终端**：只读，不连钱包、不点交易控件。官方前端是用 react-intl 的静态 SPA：用 `performance.getEntriesByType('resource')` 列出已加载的 `/assets/*.js`，同源 `fetch` 取下打包文件（页面 CSP 不拦），再按消息键定位组件，例如 `close.position.attempt`、`confirm.order`、`confirm.market.close`；文件名带哈希，每次复查都要重新找。2026-09-27 核对 Earn 页时，网络面板和改写 `fetch` 都看不到它的数据请求，只能读打包代码。行为探针的做法见[官方终端切语言的记录](work-memory/sessions/2026-09-24-official-terminal-language-switch-trace.md)。
- **注入事件不等于物理输入**：jsdom、Playwright、DevTools 与桌面浏览器工具派发的事件，证明不了系统级的事件顺序、指针捕获和焦点行为。手势类改动要由真人拖动验证（[滑杆交互](slider-interactions.md)）。运营方也在操作同一个页面时，不要抢着操作。
- **本地生产预览**：`pnpm serve` 下 `/api/geo` 对回环地址返回 503，资金入口按设计保持关闭。要在生产构建里走资金流程，就在前面放一个小代理，只回答 `GET /api/geo`（返回 `{"country":"GB","tradeRestricted":false,"proxy":false}`），其余请求转发给 Nitro。在同一个来源上切换开发服务器和生产服务器后，先删掉 Service Worker 的 `shell-v10` 缓存再刷新。
- **开发服务器的假故障**：别的会话保存文件时会向你的开发服务器推送 HMR；组件与 hook 混合导出的模块会因此产生第二个 context 实例，报「must be used within Provider」并循环白屏。这只在开发态出现，生产构建里不会发生。

## 6. 构建、测试与包体

- 工具链是 Node 22.15.0 与 pnpm 10.21.0（见 `package.json` 的 `engines` 与 `packageManager`）。生产构建脚本已带 8 GB 堆（`--max-old-space-size=8192`），因为 Privy 的依赖树在默认堆大小下会内存不足。
- **选择检查**：按 [AGENTS.md 的 Verification](../AGENTS.md#verification) 跑改动触及的契约分组；跨多个契约时跑全量 `pnpm --filter @sairn/terminal test`。纯文档改动只需核对链接和路径并运行 `git diff --check`，不要声称跑过运行时测试。
- **全量单测的偶发超时**：机器负载高时（其他会话在构建或运行 Codex），`vi.waitFor` 的 1 秒等待会偶发超时，常见于 `mobile-agent-sync-modal`、`chart-build-assets`、`positions-panel-preload`、`global-modals-hip3-disclaimer`。单独重跑这些文件，或用 `--maxWorkers=4` 再跑一次全量作为干净证据。不要和 Codex 审查或生产构建同时跑全量。`client-bootstrap-error` 原来也在这份名单里，它的失败另有原因，见下一条。
- **`afterEach` 里的 `vi.doUnmock` 会和下一个用例的 `vi.doMock` 竞态**（2026-11-02，PR #134 的 CI 与本地同样偶发）：Vitest 4.0.16 只把 `doMock`、`doUnmock` 排进队列，到下一次导入时用 `Promise.all` 一起解析，每条在自己的路径解析完成时生效，不按排队顺序；`vi.resetModules()` 和 `vi.restoreAllMocks()` 都不处理这个队列。如果 `afterEach` 撤销了某个路径，下一个用例在任何导入之前又替换同一路径，两条操作就会进同一批，撤销可能后生效，结果加载了真模块。这时用例要么约 50 ms 通过，要么一直等不到；放宽 `vi.waitFor` 没有用。写法：每个用例在导入前自己 `vi.doMock` 需要的路径，`afterEach` 里不要 `doUnmock` 同一路径。`client-bootstrap-error` 与 `link-locale` 已经改了。`client-root-fatal` 还有同样的窗口。`privy-fiat-funding-host-gate` 不受影响：它的 `beforeEach` 先 `await` 一次导入，遗留的撤销在用例 `doMock` 之前就处理完了。
- **包体测量**（规则见[性能基线](terminal-performance-baseline.md#reproduction-protocol)）：
  - 在不含 `apps/terminal/.env.local` 的隔离工作树里构建。这个文件会让 Privy 应用 ID 与各个开关进入每个 `import.meta.env` 字面量，总量约多 530 字节，而 CI 没有它。两侧各自 `pnpm install --frozen-lockfile --prefer-offline`，可以并行构建。
  - 固定构建元数据（`SAIRN_BUILD_SHA`、`SAIRN_RELEASE_ID`、`SAIRN_BUILD_TIME`）。CI 式元数据（40 位提交号、`ci-…` 发布号、不固定构建时间）比文档里的固定元数据约多 323 字节。本地余量不到约 1 kB 时，按 CI 元数据再量一次；离上限 100 字节以内时，本地读数预测不了 CI 的结果。
  - 逐块对比用 Node 的 `gzipSync`，Python gzip 算出的数值和预算脚本对不上。重定基线时要记录路由预加载本身的字节数；构建前的工作树、环境文件与安装状态要在构建当时存档，事后补查证明不了当时的状态。
  - 两份生产构建同时进入预渲染时可能抢同一个预览端口，报「Failed to start the Vite preview server」，单独重跑即可。
- **React Compiler**：组件和测试都经过编译器处理。渲染期按语言或数字格式做格式化，或怀疑「重渲染了但值没变」时，先编译看缓存依赖，不要凭源码推断（[i18n presentation](i18n-presentation.md)、[ADR 0036](adr/0036-render-time-number-formatters.md)）。取证方法：在草稿脚本里用 `createRequire` 从 `@vitejs/plugin-react` 解析 `@babel/core`，插件顺序与 `vitest.config.ts` 相同（Lingui 宏在前、编译器在后），工作目录设为 `apps/terminal`，然后找最内层 `if ($[n] !== …)` 的依赖；产物里没有 `_c(` 说明这个组件没被编译。测试里用同样的 props 重渲染时，编译器会缓存子元素，被 `vi.mock` 替换的 hook 不会再被调用；要在测试中途改桩的返回值，让桩用 `useSyncExternalStore` 订阅一个监听集合。
- **体积对比与归因**：总量会随写进产物的提交号与发布标签浮动，几乎相同的两个提交可以相差约 520 字节（2026-10-05 实测），所以不能用两次构建的差值给某个改动归因：要么在两个工作树里用同一组固定构建身份成对测量，要么只说「CI 可能因几十字节失败」。定位增量时，在基线与改动的工作树各构建一次，比较去掉内容哈希后的 `.output/public/assets` 文件清单和逐块 gzip 大小。构建过程中往产物目录里加文件会让测量失真。
- **浏览器回归的第一条用例超时**：先在失败日志里搜 `Failed to run dependency scan` 和 `No matching export`，再拿一次基于 `dev` 的通过运行的同一分片日志对比（`gh run view <run> --job <job> --log`），不要先当偶发。Vite 的依赖扫描会跟进动态 `import()`：懒加载注册表（如 `lazy-global-modals.ts`）只由渲染它的宿主导入，入口控件需要预热时走一个不导入任何东西的小模块，否则夹具的替身模块缺导出、扫描失败、冷启动变慢，本机快能过、CI 慢就超时。改了会被夹具渲染的组件的导入，推送前清掉 `apps/terminal/node_modules/.vite-<夹具名>`，用 `CI=1` 跑对应的 Playwright 配置，确认上面两种报错为 0。
- **依赖补丁**：`patches/` 里的补丁用 `pnpm patch <包> --edit-dir <目录>` 修改，再 `pnpm patch-commit <目录>`，锁文件里的 `patch_hash` 会一起更新。一个补丁文件里可能有几段不相关的修改，去掉其中一段时按段删，不要删整个文件。`patch-commit` 会重新解析整份锁文件：2026-11-12 给 `@nktkas/rews` 新增补丁时，它顺带改了两百多行无关的依赖版本。提交前看 `git diff --stat pnpm-lock.yaml`，出现无关改动就 `git checkout -- pnpm-lock.yaml`，只手工写入与补丁有关的几处（`patchedDependencies` 条目、引用处与 `snapshots` 键上的 `(patch_hash=…)`），再用 `pnpm install --frozen-lockfile --prefer-offline` 证明锁文件自洽。补丁键带版本号（`'@nktkas/rews@4.1.0'`），包升级后补丁不再适用，安装会直接失败。验证补丁确实起作用时，不要原地改 `node_modules/.pnpm` 里的文件（它可能与全局存储共用同一份数据）：先 `mv` 走原文件，放一份副本做变异，测完再 `mv` 回来。
- **i18n 的两个坑**：`lingui extract` 输出的 Missing 列把废弃的 `#~` 条目也算在内，不要追这个数字；开发服务器里反复编辑含 `t` 宏的文件后，可能报 `t is not a function` 并连带 `removeChild` 错误，重启开发服务器即可，生产构建不受影响。
- **布局**：`flex-1`、`min-h-0`、`overflow-*` 的子元素，只有在一直到定高容器的每一层祖先都是 `flex flex-col`（或有明确高度）时才会被约束；中间断一层，内容就会把容器撑高，而不是在里面滚动。
- **测试技巧**：`vi.doMock` 的工厂返回未决的 Promise 时，并发的 `import()` 会加载真模块；`vi.resetModules()` 之后，文件顶部静态导入的 harness 与 mock 工厂里的不是同一个实例，要用 `vi.hoisted` 共享。Sonner 的程序化 `toast.dismiss(id)` 也会触发 `onDismiss`；不带 id 的 `toast.dismiss()` 不会把通知移出 `getToasts()`。判断测试是否真能拦住缺陷用变异：逐个改源码、跑对应测试、确认变红后还原，先做一个必然失败的变异来确认流程本身有效。
- **类型检查结果可疑时**，先运行 `pnpm --filter @sairn/terminal exec tsc --version`，确认是锁定的 TypeScript 版本。旧检出里残留的 `.bin/tsc` 曾指向另一个版本，报出不存在的错误。

## 7. 对抗审查（Codex CLI）

运营方常要求「用 Codex 对抗审查至少 N 轮、评分大于 X」。做法如下。

- **默认做法（运营方 2026-10-12 决定）**：每个代码 PR 在推送之前先跑一轮下面的只读审查，强度用 `low`（运营方原话是「轻度」），成立的发现先改再推；针对审查意见写的修复提交也要进这一轮。纯文档 PR 不需要。原因：GitHub 上的 `chatgpt-codex-connector` 机器人只在 PR 开启时审首个提交，之后推送的提交没有人复审（2026-10-11 的 #97、#101、#102、#103 都是这样合入的，事后才补审）。运营方点名轮数或评分线时，按点名的来。

- 命令（只读、非交互）：

  ```bash
  codex exec -m gpt-6-astra -s read-only \
    -c approval_policy='"never"' -c model_reasoning_effort='"medium"' \
    --output-last-message <报告文件> - < prompt.md
  ```

  本机 `~/.codex/config.toml` 的默认值会变，曾经是 `gpt-6.1-sol`、`xhigh` 或 `ultra`、`danger-full-access`、`on-failure`，所以模型、沙箱、审批方式和推理强度每次都在命令行显式写出。`gpt-6.1-sol` 和裸 `gpt-6` 在 ChatGPT 账号下返回 400；`gpt-6-astra` 需要 codex-cli 0.154 或更新。推理强度默认 medium（运营方要求节省额度），只有运营方点名或结果明显不够时才升到 high；中途改强度要整轮重跑。
- **提示词**：AGENTS.md 的自动提交规则会让 Codex 提交，所以要写明「只读审查，不修改文件，不提交」。结构是：通用说明（约束、要审的提交清单、相关开发文档、SDK 打包产物的具体位置、已记录的限制、严重度与评分口径，例如「有 major 不得高于 8.5」）、本轮上下文（上一轮的每条发现及处理，要求逐条证伪）、分路说明。写出「作者意图（需要你去证伪）」再附攻击面清单，效果较好。
- **分路**：三路并行比单路全面，分别负责行为证伪、规范与记录（按规则出处评分）、遗漏与变异（给出测试钉不住的变异表）。每路约 5–25 分钟、8–15 万 token。修复提交本身也要复审；窄范围复审（只审上一轮之后的差异）能省下近一半用量。
- **核实结果**：逐条对照代码，拿它给出的变异去打测试。`-s read-only` 下它跑不了 vitest（写 `node_modules/.vite-temp` 被拒绝），测试和变异要自己跑。审查期间不要修改被审的工作树，也不要同时跑全量 vitest。它对记录原文的引用也要核对。
- **审不收敛时**：词法源码契约可能每轮都被构造出新写法。这时在文档里写明契约覆盖哪些写法、兜底边界在哪里，或者改成偏严的规则，再送审。写新的源码契约（AST 或词法）从一开始就按三条来：只接受一种写法，其余一律拒绝；模块先解析到文件再比较，不比说明符文本；读不懂的形式直接让测试失败。也不要用夹具或源码形状去担保真实组件：渲染真实组件，按节点身份和完整 DOM 比较，并在规范里写明夹具不经过哪些文件。
- **评分口径的副作用**：写了「有 P2 不得高于 8.5」，只剩一项 P2 也过不了线。写进注释或文档的数学保证会被逐句验算，宁可让实现精确（用乘法代替除法、给搜索加上限），也不要给近似的实现配一段证明。Codex 的只读沙盒不能监听端口，需要开发服务器的检查只能你自己跑。
- 多路并行时，每路用一个后台任务各自写 `--output-last-message` 文件，用后台命令等待（例如 `until [ -s <报告文件> ]` 循环），不要在前台 sleep。

## 8. 发布与线上资源

完整手册见 [CloudFront 发布](../deploy/cloudfront/README.md)，官网见 [deploy/website](../deploy/website/README.md)。下面是 agent 视角的要点。

- 三个闸门（主网赞助充值、移动配对、主网银行卡入金）自 2026-10-11 起按运营方决定默认全开，发布前不再逐次询问（运营方原话「以后不要咨询了…全部开」，见 p30 发布记录）；只有运营方明确要求关闭某个闸门时才改。在仓库外新建工作树检出 `origin/main` 来构建，`apps/terminal/.env.local` 只软链、不读内容。所有开关在命令行显式覆盖：`SAIRN_BUILD_SHA`、`SAIRN_RELEASE_ID`、`VITE_MOBILE_PAIRING_ENABLED`、`VITE_CCTP_*`、`VITE_PRIVY_FIAT_FUNDING_*`、`VITE_HYPERLIQUID_TESTNET=`（`VITE_HYPERLIQUID_AGENT_NAME` 自 [ADR 0038](adr/0038-unnamed-default-agent-for-trading-connection.md) 起不再存在）。用 Node 22.15.0。
- **发布预检**：开晋升 PR 之前，在发布工作树检出 `origin/dev`，用与正式构建相同的命令和开关构建一次。代码相同、只有构建身份（提交号、构建时间、发布号）不同的发布构建，总量读数可相差约 470–550 字节，交易启动约 150 字节，运行时增量只有几十字节（[p37 发布记录](work-memory/sessions/2026-11-02-cloudfront-release-p37.md)、[性能基线](terminal-performance-baseline.md)）。因此，预检中总量余量不足 1,000 字节，或任何其它预算余量不足 200 字节，都按不通过处理：先用一个进 `dev` 的 PR 削减增长，或按复现规则重定基线，合入后再开晋升 PR。p37 的预检总量只剩 324 字节，当时按通过处理，结果正式构建超出 101 字节，只好补一个重定 PR，又晋升了一次。
- **晋升 PR 的检查**：`dev → main` 的 PR 上，`Terminal Tests`、浏览器回归、`Production Builds` 与 `Website and Brand` 各有一个 `Promotion coverage` 作业（[ADR 0016](adr/0016-dev-first-pull-requests-and-ci-tiers.md) D8）。合并前打开这些作业的运行摘要，每个摘要写明本工作流被哪个 PR 的哪次运行覆盖、因而跳过，或者为什么要全跑。两种结果都正常，把结论写进发布记录。摘要里出现 `the check failed` 警告，说明判定本身出了错：检查照常全跑，但要查明原因。想在开晋升 PR 之前先看判定结果，先 `git fetch`，再在本机运行 `GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=zora4523-bot/gatu-app node scripts/promotion-coverage.mjs <工作流文件> --base origin/main --head origin/dev`；参数只写文件名（如 `terminal-tests.yml`），带 `.github/workflows/` 前缀会报用法错误。紧急修复（从 `main` 开分支直接进 `main`）的 PR 照常全跑；如果合回 `dev` 时没有经过 PR，下一次晋升也会全跑一次。
- 顺序：`functions --execute --origin https://app.sairn.ai`，然后 `lambda --function-name gatu-terminal-api --origin https://app.sairn.ai --execute`，然后 `sync` 加上对应的 `--allow-…`，再对两条分发各 `invalidate` 一次；约 80 秒后对两个网络各跑一次 `verify`，最后运行 `node apps/terminal/tests/browser/csp-coverage.mjs https://app.sairn.ai`，完整阅读输出，不要只看最后几行。上一版的发布工作树保留到下一次发布，作为回滚产物。
- `lambda`（[ADR 0051](adr/0051-release-script-rollback-and-lambda-probe.md)）：打包前拒绝拆了块的输出（输出目录里的符号链接、入口以外的模块文件、入口里的相对导入，包括两个入口互相导入）；更新应答只打印 `Version`、`CodeSize`、`CodeSha256`、`State`、`LastUpdateStatus` 一行，不再输出环境变量；`wait function-updated` 之后立即经 `--origin` 探活 `/api/health` 与 `/api/geo`，没有 `--origin` 时拒绝执行；每次请求有 10 秒截止时间，`verify` 的每个请求也带同样的截止时间。探活失败说明两个网络已经在用这个包：停下，不要继续 `sync`，先用上一版发布工作树的包重传（`lambda --function-name gatu-terminal-api --origin https://app.sairn.ai --lambda-dir <上一版工作树>/apps/terminal/dist-lambda --execute`），再看失败明细（`/api/geo` 也可能是 IPdata 自身故障）。2026-11-12 之前的发布日志与会话记录可能含有 IPdata 密钥，是否轮换由运营方决定（[发布手册「Lambda 输出与 IPdata 密钥」](../deploy/cloudfront/README.md#lambda-输出与-ipdata-密钥)）。
- `sync`：按路径判为 `immutable` 的文件（`assets/` 下全部文件与带哈希的图表文件）用 `aws s3 sync`，其余文件一律 `aws s3 cp`；文件名含 `*`、`?`、`[`、`]` 时拒绝上传；`build-meta.json` 在壳之前、`_shell.html` 是最后一条上传。中途失败时脚本只说明本次运行里哪些阶段已返回成功、失败那条命令的对象状态未知、后面的阶段没有写；它不知道运行前桶里是什么。处理方式都是原样重跑同一条 `sync`，再 `verify`。结尾按内容核对壳与 `build-meta.json`，打印 `Release markers match the local build byte for byte`。
- **回滚**（没有演练过，步骤见[发布手册「回滚」](../deploy/cloudfront/README.md#回滚)）：用**当前检出里的脚本**，经 `--public-dir`、`--lambda-dir`、`--functions-dir` 指向上一版发布工作树里已经构建好的产物，按 `functions` → `lambda` → `sync`（`--allow-…` 按旧产物的 `build-meta.json`）→ 两次 `invalidate` → 两网 `verify`（同样带 `--public-dir`）的顺序执行。不要在旧工作树里重新构建，也不要运行旧工作树里的 `deploy.mjs`：2026-11-12 之前的版本对大小相同的壳与 `build-meta.json` 会跳过上传却报成功，`lambda` 还会打印环境变量。`reupload` 只重写桶内元数据，不能用来回滚。第一次真实回滚把每一步的输出写进发布记录。
- 资源名沿用 `gatu-*`（[ADR 0027](adr/0027-brand-single-source-and-identifier-rename.md)）：桶 `gatu-terminal-2026`，Lambda `gatu-terminal-api`，主网分发 `ET9CNVE6L1GWN`，测试网分发 `E3Q2SAX402CR9F`，官网分发 `EP2DIBP3T7M3G`。发布身份是 IAM 用户 `gatu-edge`，本机 AWS profile 同名，`deploy.mjs` 默认使用它并拒绝 root。账号级操作（IAM、计费）只能由运营方在控制台完成。
- 线上状态以 `https://app.sairn.ai/build-meta.json` 为准；各次发布的开关与验证结果见工作记忆里的发布记录。
- Privy 控制台的同一个账号下有多个应用，线上用的是名为 Sairn 的那个，控制台默认打开的可能是别的应用（[银行卡入金验收清单「已核对的事实」](privy-card-funding-launch-checklist.md)）。

## 9. 更换账号或机器

下面这些东西在仓库之外，不会随 clone 迁移。新环境里由运营方重新配置；agent 不要尝试读取或重建其中的秘密。

| 项目 | 位置 | 说明 |
| --- | --- | --- |
| Claude 用户级记忆、设置、插件与 MCP | `~/.claude/` | 记忆里的持久知识已整理进仓库（见交接记录）。2026-10-08 在同一台机器换账号后，新会话仍能读到原来的记忆目录；换机器或用云端会话时读不到，所以仍以仓库为准。项目级 MCP 在 `.mcp.json` |
| Claude 桌面应用与 Claude in Chrome 的登录 | 应用与浏览器扩展 | 用新账号重新登录 |
| `CLAUDE_CODE_OAUTH_TOKEN` | GitHub 仓库密钥 | 只有要用 @claude 工作流时才需要（第 3 节） |
| Codex 配置与会话 | `~/.codex/` | 审查命令在命令行显式指定参数（第 7 节） |
| 开发与构建环境变量 | `apps/terminal/.env.local` | Git 忽略；模板是 `deploy/env.build.example` |
| AWS 发布凭据 | 本机 profile `gatu-edge` | 密钥由运营方配置 |
| GitHub CLI 登录与 SSH 密钥 | `gh auth`、`~/.ssh` | 推送走 SSH |
| 本地证据 | `.worklog/` | Git 忽略，只在本机 |
| 发布工作树 | 仓库外的 `gatu-release-*` | 回滚产物，按发布记录保留或删除 |

更换之后第一件事：读本文与最新的交接记录，`git fetch` 后核对 `dev`、`main` 和打开的 PR 是否与记录一致。
