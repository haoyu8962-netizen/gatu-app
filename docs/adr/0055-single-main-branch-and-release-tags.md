# ADR 0055：只保留 `main`，线上版本用发布标签表示

- 状态：已接受并实施（2026-11-13，运营方同意方案后执行）。分支 `chore/chart-library-fetch`，未合入 `main`。新仓库上 CI 没有跑过：Actions 关闭，`CHART_LIBRARY_TOKEN` 未配置。
- 关联：取代 [ADR 0016](0016-dev-first-pull-requests-and-ci-tiers.md) 的 D1（分支流向）、D2′ 与 D8（晋升分层与晋升覆盖）；[ADR 0054](0054-chart-library-outside-the-repository.md)（仓库迁移并公开）；`.claude/rules/git.md`；[Agent 工作手册](../agent-handbook.md)第 3、8 节；`scripts/ci-workflows.test.mjs`。

## 背景

ADR 0016 让工作分支先进 `dev`，再由 `dev` 晋升到 `main`，有两个理由：私有仓库的 Actions 按分钟计费，所以进 `dev` 跑一遍、晋升时按覆盖跳过；`main` 代表线上。2026-11-13 仓库迁到新账号并公开（ADR 0054）之后：

- 公开仓库的 Actions 不计费，省分钟的理由不再成立。
- 「线上是什么」可以由发布标签表达：发布本来就是从一个固定提交构建的。
- 维护者只有运营方与受其指挥的代理，没有需要 `dev` 做缓冲的并行团队。

## 决策

1. **只保留 `main`。** 工作分支从 `origin/main` 开出，PR 直接进 `main`，用 merge commit 合并（任务记录与 ADR 引用分支上的提交号，不 squash、不 rebase）。没有 `dev`，没有晋升 PR。
2. **线上版本由标签表示。** 每次发布完成后，给构建所用的提交打 `cloudfront-<日期>-p<N>` 标签并推送。`main` 上可以有已合并未发布的改动。
3. **紧急修复从发布标签开分支**，从该分支发布并打标签，再开 PR 把分支合回 `main`。
4. **删除晋升覆盖。** 删掉 `scripts/promotion-coverage.mjs` 及其测试，以及 `Terminal Tests`、浏览器回归、`Production Builds`、`Website and Brand` 四个工作流里的 `Promotion coverage` 作业；这四个工作流各只剩一个作业，没有 `needs` 与 `if`。任何工作流都不读 PR 的分支名，也不用 `branches` 过滤。
5. **`Production Builds` 每次都构建配对开关的两种状态**（PR、发布标签与手动运行相同）。原来只有进 `main` 的 PR 才构建配对开启的状态，那是为了省分钟。

## 迁移（2026-11-13 已执行）

- 给原 `main` 的末端（线上 p41 的树，本仓库提交 `72bb28d1`）补打标签 `cloudfront-2026-11-12-p41`。
- 把 `dev` 用 merge commit 合进 `main`（`6a6d1066`，树与 `dev` 相同）并直接推送。这次合并没有 CI 把关（Actions 关闭）；被合入的两波修复在原仓库的 PR #160、#161 上通过了全部检查。合并之后 `main` 比线上多这两波修复。
- PR #1 的目标分支改为 `main`，删除远端 `dev`。

## 备选方案

- **保留 `dev`。** 多一次晋升 PR 与一套只为晋升服务的脚本和作业，换来「`main` 恒等于线上」。标签能表达同一件事。
- **保留晋升覆盖脚本备用。** 没有调用方的 344 行脚本和 601 行测试只会腐烂；需要时可以从历史里取回。
- **合并到 `main` 后再跑一次 `push` 触发的检查。** PR 上跑的已经是与 `main` 合并后的树；现在不加，分支保护要求「分支必须是最新」时也不需要。

## 后果与边界

- `main` 不再等于线上。读「线上是什么」要看最新的 `cloudfront-*` 标签与发布记录，不能看 `main` 的末端。
- 没有 `dev` 做缓冲，一次坏合并直接落在唯一的主干上。`main` 目前没有分支保护；建议开启「必须经 PR、检查通过才能合并」，这是仓库设置，由运营方决定。
- 2026-11-13 之前的任务记录、发布记录与 ADR 里的 `dev`、晋升 PR、`Promotion coverage` 描述的是原仓库的做法，保留为历史，不改写。
- 工作手册第 8 节的发布步骤只改了与分支有关的句子；按新流程完整走一次发布之后再整体校订。
- 推送发布标签会触发 `Production Builds`；补打的 p41 标签推送时 Actions 关闭，没有运行。

## 验证

在公开仓库的克隆上（Node 22.15.0）：

- `node --test scripts/ci-workflows.test.mjs`：19 项通过（原 20 项里三条晋升测试换成两条单分支测试）。给 `website-build.yml` 的作业临时加一个读 `github.base_ref` 的 `if`，新测试失败；已还原。
- 其余读数见任务记录。

没有验证的：新仓库上的 CI；按新流程的一次完整发布与打标签。
