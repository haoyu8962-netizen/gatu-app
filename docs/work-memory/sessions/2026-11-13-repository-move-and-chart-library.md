<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-13-repository-move-and-chart-library",
  "date": "2026-11-13",
  "title": "仓库迁到新账号并公开：图表库移出仓库、历史重写、取回脚本与 CI 步骤",
  "kind": "task",
  "status": "recorded",
  "topics": ["docs-governance", "static-hosting"],
  "summary": "原账号 zora4523-bot 被 GitHub 封停。按运营方决定把 dev 与 main 迁到 haoyu8962-netizen/gatu-app 并公开；TradingView 图表库与早期的 .env 从全部历史里移除（提交号全部改变），图表库改放私有仓库 gatu-chart-library，由 pnpm chart:fetch 按清单核对后安装，四个 CI 工作流加了检出私有仓库的步骤。本地类型检查、图表测试、生产构建与图表产物校验通过；新仓库上的 CI 没有跑过，Actions 关闭，CHART_LIBRARY_TOKEN 未配置。",
  "thread": null,
  "baseCommit": "5857c410",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0054-chart-library-outside-the-repository.md" },
    { "path": "docs/agent-handbook.md" },
    { "path": "scripts/fetch-chart-library.mjs" }
  ],
  "supersedes": []
}
-->
# 仓库迁到新账号并公开

## 背景与范围

同步记录，2026-11-13，未取得任务标识。原仓库 `zora4523-bot/gatu-app` 所在账号被 GitHub 封停（API 返回「Your account was suspended」，仓库网页 404，SSH 拉取与推送被拒绝）。运营方要求：「重新换个 GitHub 账号托管代码……设置公开仓库吧」，在被告知图表库许可不允许公开再分发之后仍选择公开，并同意接着做取回图表库的步骤。

封停之前，第一波与第二波修复已分别经原仓库的 PR #160、#161 合入 `dev`（原提交号 `ec0b20e4`、`61505614`）；两份任务记录里写的「没有推送」已过时。

## 结论与依据

决策与理由在 [ADR 0054](../../adr/0054-chart-library-outside-the-repository.md)。做了的事：

- 用 `git filter-repo` 生成只含 `dev` 与 `main` 的副本，去掉图表库的三处路径与根目录的 `.env`；2,502 个提交，复查两类路径剩余为 0。`dev` 从原 `61505614` 变为 `5857c410`，`main` 从原 `766a8566` 变为 `72bb28d1`。
- 新建公开仓库 `haoyu8962-netizen/gatu-app` 并推送这两个分支；推送前关闭了该仓库的 Actions，没有工作流运行过。
- 新建私有仓库 `haoyu8962-netizen/gatu-chart-library`，内容是原 `dev` 上的图表库（1,163 个文件）加一个说明文件。
- 新增 `scripts/fetch-chart-library.mjs` 及测试、`chart:fetch` / `chart:check` 两个命令、忽略规则，四个 CI 工作流在安装依赖前检出私有仓库并安装图表库。
- 更新工作手册第 3 节、README、`agent.md`、运行时护栏 §4 与 CHANGELOG。

## 验证与限制

读数在公开仓库的克隆上取得（Node 22.15.0），逐项见 ADR 0054「验证」：取回脚本测试 5 项、工作流结构测试 20 项、类型检查退出码 0、图表相关 Vitest 137 项、生产构建与图表产物校验退出码 0；从私有仓库克隆安装、篡改后检出并修复各实测一次。gitleaks 扫描公开副本的历史有 582 条命中，按文件与变量名判断是生成数据与测试夹具，没有逐条核对值。

没有验证的：新仓库上的 CI；全量单测与浏览器套件；发布流程。没有改动 AWS、线上部署与原仓库的本地克隆。

## 后续与替代关系

本记录不取代其他记录。

需要运营方做的：

- 给公开仓库配置密钥 `CHART_LIBRARY_TOKEN`（对私有仓库只读），然后在 Settings → Actions 里重新打开 Actions；其余 Actions 密钥与变量、分支保护按需要重新配置。
- 本机的旧克隆与工作树仍指向被封停的仓库，需要基于新仓库重新克隆；旧克隆里未合并的工作分支与四个 `archive/` 标签只存在于本机。

没有处理的：

- 仓库里其余文档与脚本对 `zora4523-bot` 的引用（十余个文档与 `scripts/promotion-coverage.test.mjs` 的夹具）；`.claude/rules/git.md` 与 ADR 0016 里按私有仓库计费分钟做的 CI 取舍。
- 公开仓库里的 `Claude Code`、`Claude Code Review` 工作流是否保留；`deploy/cloudfront/iam/` 下带云账号标识的策略文件是否改写。
- 两波修复的任务记录里「没有推送」的补记。
