# ADR 0054：图表库移出仓库，仓库公开，历史重写

- 状态：已接受并实施（2026-11-13）。分支 `chore/chart-library-fetch`，未合入 `dev`、未发布。CI 没有在新仓库上跑过：Actions 目前关闭，`CHART_LIBRARY_TOKEN` 还没有配置。
- 关联：[运行时护栏](../runtime-guardrails.md) §4（TradingView 生命周期与本地补丁）；[Agent 工作手册](../agent-handbook.md)第 3 节；[ADR 0016](0016-dev-first-pull-requests-and-ci-tiers.md)（CI 分层）；[ADR 0027](0027-brand-single-source-and-sairn-rename.md)（仓库名保留 `gatu`）；`deploy/verify-chart-build.mjs` 与 `deploy/manifests/tradingview-charting-library.json`。

## 背景

2026-11-13，原托管账号 `zora4523-bot` 被 GitHub 封停：仓库网页返回 404，拉取与推送被拒绝，PR、评论、CI 记录与仓库设置无法取回。运营方决定换到账号 `haoyu8962-netizen`，并把仓库设为公开。

原仓库把 TradingView Advanced Charts 的文件（1,163 个，含一处本地补丁）放在 `apps/terminal/public/charting_library/` 里一起跟踪。它的许可不允许公开再分发，所以原样公开不可行。

## 决策

1. **公开仓库 `haoyu8962-netizen/sairn` 不含图表库，历史里也不含。** 用 `git filter-repo` 从 `dev` 与 `main` 的全部历史里去掉三处路径（`apps/terminal/public/charting_library/`、早期的 `public/charting_library/`、`src/types/charting_library.d.ts`）以及根目录早期提交过的 `.env`（只含 WalletConnect 项目标识，本来就会打进前端包）。**所有提交号因此改变**；2026-11-13 之前的任务记录、ADR 与发布记录里引用的提交号是原仓库的，在公开仓库里查不到，旧提交号与新提交号的对照在 `docs/work-memory/legacy-commits.txt`（2,502 行，其中 2,469 个在本仓库里）；`pnpm memory:check` 对解析不到的提交号改查这张表，表里没有的仍然失败。原仓库的 PR 编号（#1–#161）同样不再可查。
   同日第二次重写：公开约一小时后发现 148 个提交的作者或提交者邮箱是运营方的个人邮箱（第一次只扫了文件内容，没有查提交元数据）。用 `git filter-repo --mailmap` 把它换成原账号的 GitHub 匿名邮箱并强制推送，文件树不变，提交号再变一次；对照表按最终提交号重新生成，没有迁移的 33 个提交记为四十个零。上游作者的公开邮箱没有改动。强制推送之后，旧提交在 GitHub 上仍可凭提交号或经已有 PR 的时间线访问，所以把那个仓库改为私有并改名为 `gatu-app-old-history`（留给运营方删除），另建了现在这个公开仓库（当时名为 `gatu-app`，同日按运营方要求改名为 `sairn`），只推送重写后的 `main`、本分支与 p41 标签；PR 编号从 1 重新开始。
2. **只迁移 `dev` 与 `main`。** 四个 `archive/` 标签（其中两个是 Across 归档）与其他工作分支没有推到公开仓库。
3. **图表库放在同一账号下的私有仓库 `gatu-chart-library`**，文件位于仓库根目录，内容就是原仓库 `dev` 上的那一份（含本地补丁）。
4. **`pnpm chart:fetch`（`scripts/fetch-chart-library.mjs`）把它装进 `apps/terminal/public/charting_library/`。** 来源依次是 `--from <目录>`、环境变量 `CHART_LIBRARY_DIR`、克隆 `CHART_LIBRARY_REPOSITORY`（默认是上面的私有仓库）。只复制清单里列出的文件；复制前按清单核对来源的每个文件（大小与 SHA-256），复制到临时目录并再次按清单精确核对（不得多出文件）之后才替换目标目录，失败时已安装的那份保持不动。目标目录已与清单一致时什么都不做。`pnpm chart:check` 只核对。
5. **目标目录进 `.gitignore`**，清单文件仍在仓库里，是图表库内容的唯一依据。升级图表库的顺序：更新私有仓库 → 用 `deploy/verify-chart-build.mjs --generate-manifest` 重新生成清单 → 提交清单。
6. **CI 的四个工作流**（`Static Checks`、`Terminal Tests`、`Terminal Browser Tests`、`Production Builds`）在安装依赖之前用 `actions/checkout` 把私有仓库检出到 `.chart-library-src`（需要仓库密钥 `CHART_LIBRARY_TOKEN`，对私有仓库只读），再运行 `node scripts/fetch-chart-library.mjs --from .chart-library-src`。私有仓库名取 `${{ github.repository_owner }}/gatu-chart-library`，再换账号时不用改工作流。

## 备选方案

- **保持私有。** 不需要任何改动，是此前的做法（工作手册第 3 节）。运营方选择公开。
- **连同图表库一起公开。** 违反图表库许可，公开后收不回，也会让新账号面临下架投诉。不做。
- **只在最新提交里删除图表库，保留历史。** 历史里仍能取到全部文件，等于公开。
- **图表库放 S3 或作为构建机上的本地目录。** 可行，但 CI 需要另一套凭据；私有仓库与 `actions/checkout` 用同一种机制，本地也能用现有的 Git 凭据克隆。`--from` 与 `CHART_LIBRARY_DIR` 保留了改用其他来源的出口。
- **Git submodule。** 没有私有仓库权限的人克隆时会报错，且子模块目录里的 `.git` 文件会被当成图表库的多余文件。

## 后果与边界

- 没有私有仓库权限的人（包括来自 fork 的 PR，它们拿不到仓库密钥）无法类型检查、构建或跑依赖图表库的测试；这是许可决定的。
- 新克隆在 `pnpm install` 之后要跑一次 `pnpm chart:fetch`。本机已有的旧克隆与工作树指向被封停的仓库，提交号与公开仓库不一致，不能直接推送，需要重新克隆。
- 公开仓库里仍有 `Claude Code` 与 `Claude Code Review` 两个工作流，以及 `deploy/cloudfront/iam/` 下带云账号标识的策略文件；本次没有改动它们。
- Actions 的密钥与变量、分支保护需要在新仓库重新配置；公开仓库的 Actions 不计费，[ADR 0016](0016-dev-first-pull-requests-and-ci-tiers.md) 里按计费分钟做的取舍可以重新评估。
- 历史扫描：对公开副本运行过 gitleaks，582 条命中集中在两个生成的市场数据文件与测试夹具里，按文件与变量名判断不是真实密钥，没有逐条核对值。

## 验证

在公开仓库的克隆上（Node 22.15.0）：

- `node --test scripts/fetch-chart-library.test.mjs`：5 项通过。
- `node --test scripts/ci-workflows.test.mjs`：20 项通过（[ADR 0055](0055-single-main-branch-and-release-tags.md) 去掉晋升覆盖之后是 19 项）。
- `pnpm memory:test`：12 项通过；`pnpm memory:check`：加对照表之前因旧提交号失败，之后通过。
- `pnpm chart:check`：未安装时退出码 1；安装后报告 1,163 个文件与清单一致。
- `pnpm typecheck`：退出码 0。
- 删除目标目录后不带 `--from` 运行 `pnpm chart:fetch`（用本机的 GitHub 凭据克隆私有仓库）：安装 1,163 个文件，`chart:check` 通过；往 `charting_library.js` 末尾加两个字节后 `chart:check` 退出码 1，再次 `chart:fetch` 修复。
- 图表相关 Vitest 5 个文件 137 项通过（`chart-build-assets`、两个 `chart-library-loader-handshake`、`tradingview-chart`、`chart-asset-cache-policy`）。
- 生产构建（固定身份、配对关闭）退出码 0；`node deploy/verify-chart-build.mjs apps/terminal/public apps/terminal/.output/public deploy/manifests/tradingview-charting-library.json` 退出码 0。

没有验证的：新仓库上的 CI（含 `actions/checkout` 检出私有仓库那一步）；全量单测与浏览器套件；发布脚本对新仓库产物的运行。
