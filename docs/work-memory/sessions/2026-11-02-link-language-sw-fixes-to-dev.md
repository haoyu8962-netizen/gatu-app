<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-02-link-language-sw-fixes-to-dev",
  "date": "2026-11-02",
  "title": "语言链接 Service Worker 修复与 p35 发布记录带到 dev：合并、补审 452a2247 并修复两项 P2",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime", "static-hosting", "pr-review"],
  "summary": "运营方问所有修复是否都已合入 dev；核对后没进 dev 的只剩两条从未推送的本地分支：claude/link-language-review-fixes（p35 之后按 Codex 审查做的 Service Worker 修复，头 452a2247）与 p35 发布记录分支 claude/release-p35-record（b6da1036）。新分支 claude/link-language-sw-fixes 从前者切出，以合并（不变基，保留记录引用的提交号）并入 origin/dev（26c06d02，含 PR #132）与记录分支，无冲突，INDEX.md 重新生成无差异。452a2247（带 lang 的导航遇到 5xx 时回退缓存壳）此前未经审查：Codex gpt-6-astra 只读 low 8.3/10、两项 P2（文档称只有旧 SW 那一次导航会是旧壳，过度表述；测试钉不住 500 边界与 4xx、重定向透传），658f5ddd 补参数化与透传用例、3a50a097 改正文档并补 CHANGELOG，窄范围复审 9.2/10 无发现；六个变异全被抓到，修复前的测试漏掉其中两个。类型检查、定向 22 个文件 678 项、ci-workflows 与 CloudFront 部署测试通过；全量终端 Vitest 9,849 项中 9,847 项通过、1 项跳过，另 1 项在沙盒里因不能监听端口失败，沙盒外重跑通过。推送与开 PR 等运营方同意；真实浏览器、生产构建与线上未验证，改动未发布。",
  "thread": null,
  "baseCommit": "26c06d02",
  "commits": ["452a2247", "b6da1036", "479824c4", "fbed3feb", "658f5ddd", "3a50a097"],
  "sources": [
    {"path": "apps/terminal/public/sw.js"},
    {"path": "apps/terminal/src/lib/tests/sw-navigation-cache.test.ts"},
    {"path": "docs/i18n-presentation.md"},
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/work-memory/sessions/2026-10-28-cloudfront-release-p35-link-language.md"},
    {"path": "docs/agent-handbook.md"}
  ],
  "supersedes": []
}
-->
# 语言链接 Service Worker 修复与 p35 发布记录带到 dev：合并、补审 452a2247 并修复两项 P2

## 背景与范围

同步记录，未取得任务标识。2026-11-02 运营方问「所有修复都合并到 dev 了吗」。另一个会话核对后发现，除当时待合并的 PR #132 外，没进 `dev` 的产品代码修复只剩本地分支 `claude/link-language-review-fixes`：头 `452a2247`，基点 `d99c2bc9`，五个提交，从未推送也没开过 PR，检出在工作树 `sync-code-start-dev-08b8d0`。p35 发布记录分支 `claude/release-p35-record`（头 `b6da1036`，三个只改文档的提交）也没进 `dev`。那个会话把「带到当前 `origin/dev`，验证后在运营方同意时推送并开 PR」交给本会话。

范围：合并、补审、验证与记录。推送、开 PR 都要运营方逐次同意，本记录写成时都没做；不发布。时间为 UTC+8。

## 结论与依据

**合并。** 在本会话的工作树里用 `git switch --no-track -c claude/link-language-sw-fixes claude/link-language-review-fixes` 切出新分支；原分支仍检出在别的工作树，没有动它。按交代用合并而不用变基，p35 记录引用的提交号因此保持有效：`git merge --no-ff origin/dev` 得到 `479824c4`，`git merge --no-ff claude/release-p35-record` 得到 `fbed3feb`，都没有冲突。任务开始时 `origin/dev` 是 `ec067207`；合并前别的会话的 fetch 已把它推进到 `26c06d02`（PR #132 于 00:25 合入），所以合并进来的是 `26c06d02`。`d99c2bc9..26c06d02` 没有改依赖。`pnpm memory:index` 重新生成的 `INDEX.md` 与文本合并的结果相同。

核对：`452a2247`、`b6da1036`、`26c06d02` 都是 `fbed3feb` 的祖先。`git diff origin/dev fbed3feb` 共 9 个文件：`sw.js`、两个测试文件与 CloudFront README 的差异与原分支逐字相同（去掉 index 行后比较）；`AGENTS.md`、`terminal-tests.yml` 与 `i18n-presentation.md` 增删的行相同。

**提交钩子。** 在桌面应用的命令沙盒里，lefthook 的 commit-msg 钩子在 0.00 秒内报 `operation not permitted`；同一条合并信息在沙盒外跑这个钩子能通过。仓库没装 pre-merge-commit 钩子，普通的 `git merge` 本来只跑 commit-msg，所以两个合并提交用 `--no-verify` 完成。两个修复提交在沙盒外提交：biome、lingui-extract（`.po` 无变化）与 commitlint 都通过。这条经验已写进 [Agent 工作手册](../../agent-handbook.md)第 4 节。

**`452a2247` 此前没有审查。** p35 记录最后一次更新是 `b6da1036`（10-29 00:45）。`452a2247` 在 10-30 12:25 才提交，记录里没有提到它。本地工作树的 `.worklog/` 与会话临时目录里也找不到对应的审查报告。

按手册第 7 节跑了一轮 Codex CLI 只读审查：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"low"'`，提示词禁止修改与提交，审 `fbed3feb`，重点是 `452a2247`，同时核对合并后的 9 个文件。结果 8.3/10，无 P0/P1，有两项 P2，逐条对照代码都成立：

1. `docs/i18n-presentation.md` 说「只有旧 SW 回答的那一次导航会是旧壳」，说过了头。网络失败或 5xx 时回退的是同一个 `shell-v10` 条目；新 SW 下，如果缓存里还是不认识 `lang` 的旧壳，也会启动它。CloudFront README 的「没有缓存就照原样返回」对网络失败不准确，实际是照常失败。「与普通导航一致」只在网络失败与 5xx 的最终结果上成立。
2. 语言链接的测试只测了 503。删掉 `if (response.status < 500) return response;`，或把 `<` 改成 `<=`，修复前的测试仍全部通过（本地实测 37 项通过）。

修复分两个提交：

- `658f5ddd`：503 用例改为 500、503、599 参数化，有缓存时回退并保留缓存；新增两个用例，有缓存时 404 与 `opaqueredirect`（status 0）原样透传、缓存不变；harness 的导航请求改为 `redirect: "manual"`。
- `3a50a097`：改写 `docs/i18n-presentation.md` 与 CloudFront README 的表述，写明旧壳仍可能出现的两种情况，并在 `CHANGELOG.md` 的 Fixed 加一条。

窄范围复审用同样参数，只审 `fbed3feb..3a50a097`：9.2/10，无发现，两项 P2 都判为已解决。

普通导航与语言链接对各种应答的处理，依据 `sw.js` 与两轮审查的对照：

| 网络结果 | 普通导航（有缓存） | 语言链接（有缓存） | 两者都没有缓存 |
| --- | --- | --- | --- |
| 未重定向的 200 `text/html` | 立即给缓存壳，后台更新 | 给网络壳并更新缓存 | 给网络壳并缓存 |
| 4xx、重定向（`opaqueredirect`）、其他不可缓存应答 | 给缓存壳 | 原样交给浏览器 | 原样交给浏览器 |
| 5xx | 给缓存壳 | 回退缓存壳 | 原样返回 5xx |
| 网络失败 | 给缓存壳 | 回退缓存壳 | 导航失败 |

## 验证与限制

- **环境**：Node 22.15.0（与 CI 相同），pnpm 10.21.0。沙盒里 pnpm 用不了全局存储，`pnpm install --frozen-lockfile --prefer-offline` 把依赖下载到工作树内 Git 忽略的 `.pnpm-store`；`prepare` 里的 `lefthook install` 因写不了 `.git/hooks` 失败，钩子本来就在，不影响安装。
- **`fbed3feb`（合并后、修复前）**：
  - `pnpm --filter @sairn/terminal typecheck` 通过（TypeScript 5.7.2）。
  - `pnpm exec biome check` 两个测试文件通过。`public/sw.js` 与工作流文件不在 Biome 的 includes 内，另跑 `node --check apps/terminal/public/sw.js` 通过。
  - AGENTS.md 的 Startup rendering 组（12 个文件，含 `client-bootstrap-error`、`sw-navigation-cache`）与 Runtime translation 组（10 个文件，含 `link-locale`）一起跑：22 个文件 678 项通过。
  - `node --test scripts/ci-workflows.test.mjs` 17 项通过。`node --test scripts/*.test.mjs` 64 项中 63 项通过；没过的一项是 `serve-spa-static.test.mjs` 在沙盒里 `listen EPERM`，在沙盒外单独重跑该文件 10 项通过。
- **`658f5ddd` 的测试**：`sw-navigation-cache.test.ts` 41 项通过。变异的做法是逐个改 `sw.js`、跑该文件、再还原：

  | 变异 | 结果 |
  | --- | --- |
  | `has("lang")` 改成 `has("language")`（先确认流程会失败） | 3 项失败 |
  | 删掉 `if (response.status < 500) return response;` | 2 项失败；修复前的测试 37 项全部通过 |
  | `< 500` 改成 `<= 500` | 1 项失败；修复前的测试 37 项全部通过 |
  | 只让 503 回退 | 2 项失败 |
  | 5xx 直接返回网络应答 | 3 项失败 |
  | 5xx 也写缓存 | 4 项失败 |

- **`3a50a097`**：
  - 全量终端 Vitest（`pnpm --filter @sairn/terminal test --maxWorkers=4`，16:42–16:46 UTC，254 秒）：714 个文件、9,849 项，其中 9,847 项通过、1 项跳过、1 项失败。失败的是 `vite-development-cache.test.ts` 的「revalidates optimized dependencies and rejects a second server on the same port」，原因是沙盒里 `listen EPERM: operation not permitted 127.0.0.1:5173`；在沙盒外单独重跑这个文件，1 项通过。
  - 测试运行期间写入了本记录、p35 记录、`INDEX.md` 与手册，没有测试读取这些文件（检索过 `apps/terminal` 的测试，只有一个测试读 `AGENTS.md`，它在此期间没有改动）。
  - `pnpm test:cloudfront` 46 项通过。
- **`2d5e7a74`（记录提交）**：`pnpm --filter @sairn/terminal typecheck` 再跑一次通过，覆盖 `658f5ddd` 改过的测试文件（terminal 的 tsconfig 包含 `**/*.ts`、`**/*.tsx`）。之后的提交只改本记录。
- **记录提交**（本记录、p35 记录的更正、手册与 `INDEX.md`）：`pnpm memory:index`、`pnpm memory:check` 通过，`pnpm memory:test` 8 项通过，`git diff --check` 无输出。
- **未做**：
  - 真实浏览器（Chrome、Safari、Firefox）里的 Service Worker 行为。Node `vm` harness 只证明 `sw.js` 在模拟环境下走哪条分支。
  - 浏览器回归套件：没有覆盖 Service Worker 的用例，没有运行。
  - 生产构建：本分支没有改打包进产物的源码，`public/sw.js` 也不在 `scripts/check-client-bundle-budget.mjs` 统计的 `.output/public/assets` 里。
  - CI：分支没推送，没有运行。
  - 线上状态没有重新核对；p35（`cdb47637`）不含这些改动。

## 后续与替代关系

- 推送 `claude/link-language-sw-fixes`、开 PR（`gh pr create --base dev`）都等运营方同意，一次同意只对应一个动作；不开 auto-merge。
- 复审列出了几项可选的测试补强，本次没有做，它们都不是缺陷：有缓存时 499 透传（钉住 `< 500` 的紧邻边界）；有缓存时不可缓存的 200（如 JSON）透传；无缓存时 5xx 返回同一个响应对象；语言分支里 `caches.open`、`match`、`put` 失败时的容错。
- 发布后要在真实浏览器里验证：回访者第一次点语言链接（仍由旧 SW 回答）；之后的语言链接走网络；离线与 5xx 时回退缓存壳；以及 CloudFront README 已列的 iOS Safari。
- PR 合入 `dev` 后，两条源分支 `claude/link-language-review-fixes`、`claude/release-p35-record` 与工作树 `sync-code-start-dev-08b8d0` 可以清理。它们属于别的会话，按手册第 4 节要逐个经运营方同意后再删。
- p35 记录已追加更正：补上 `452a2247` 的存在、审查与修复，并写明 p35 的发布结论不覆盖这些改动。原文没有改写。
