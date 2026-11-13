# ADR 0056：自动化不向第三方发请求，不设定时工作流

- 状态：已接受并实施（2026-11-13，运营方要求）。分支 `fix/third-wave`，未合入 `main`。GitHub 上的 `Website Market Snapshot` 工作流已在同日先行停用。
- 关联：[官网规划](../website-plan.md)第 8 节；[官网部署手册](../../deploy/website/README.md)；[ADR 0016](0016-dev-first-pull-requests-and-ci-tiers.md) 2026-10-26 补记（新增每日检查，本文取代）；[ADR 0054](0054-chart-library-outside-the-repository.md)、[ADR 0055](0055-single-main-branch-and-release-tags.md)；`scripts/ci-workflows.test.mjs`。

## 背景

`website-markets-check.yml` 每天定时在 GitHub Actions 上运行 `markets:snapshot --check`：从 GitHub 的运行器请求 Hyperliquid 的公开接口，把结果与仓库里提交的官网行情快照比对。原托管账号在 2026-11-13 被 GitHub 封停。运营方判断这个定时任务是原因：它的实质是定时请求一个第三方网站的接口；封停通知的原文不在仓库里，这个因果没有经过 GitHub 确认。运营方要求把它移除。

复查时还发现，在这之前 CI 里另有请求会离开运行器：两个单元测试各自连到了交易所的主网与测试网接口（`owner-trading-signer`、`transport-reconnect`，第三波已改为本地应答）；浏览器回归用的是本机夹具页面，但多数没有显式拦截外部请求。

## 决策

1. **删除 `website-markets-check.yml`，仓库里不再有任何定时工作流。** 任何工作流都不运行 `markets:snapshot` 或 `markets:icons`；这两个脚本只在开发者自己的机器上运行。
2. **官网行情快照的刷新是人工动作**：发布官网之前在本机运行 `pnpm --filter @sairn/website markets:snapshot`，审查 diff 后作为一次提交。`markets:snapshot --check` 保留为本机命令。
3. **单元测试不得连接本机以外的地址。** `apps/terminal/src/lib/tests/setup.ts` 拦截 `net.Socket.prototype.connect`，目标不是回环地址就抛错；需要网络行为的测试自己提供本地应答。
4. **浏览器测试只解析回环地址。** 每个 Playwright 配置的 Chromium 都带 `--host-resolver-rules` 与 `--no-proxy-server`（`tests/browser/local-hosts-only.ts`）：其他主机名一律解析失败，也不经系统代理（否则代理会替页面解析主机名）。
5. `scripts/ci-workflows.test.mjs` 钉住第 1 点：任何工作流出现 `schedule`、`cron` 或行情快照脚本都失败。

CI 仍然会访问的外部服务：GitHub（检出本仓库与私有的图表库仓库）、npm 源（安装依赖）、Playwright 的浏览器下载及其 `--with-deps` 触发的 Ubuntu 软件源。另有两个 Claude 工作流会调用 Anthropic 的接口：`claude.yml` 只在仓库所有者、成员或协作者的评论里出现 @claude 时运行；`claude-code-review.yml` 在每个 PR 上运行，目前在仓库设置里是手动停用状态（停用状态不随代码迁移，换仓库后要重新停用）。这份清单没有测试钉住。

## 备选方案

- **保留检查，改成手动触发。** 仍是从 GitHub 请求第三方接口，运营方不接受。
- **每周自动抓取快照并开 PR。** 同上，而且需要给工作流写权限。
- **把检查搬到别处定时运行（Lambda、本机计划任务）。** 可行，但要另建部署与通知；目前没有做，需要时另行决定。

## 后果与边界

- 没有任何东西会再提醒快照过期或精选市场被下架。官网构建里的日期规则还在：快照超过 7 天、部署方来源超过 90 天未复核或预定结算日已过时，`astro build` 失败，包括只是碰巧触发官网构建的 PR。要么每周在本机刷新一次，要么把日期规则从构建挪到官网发布前的检查；后者尚未决定。
- 第 3、4 点只在测试进程与测试浏览器里生效，不约束构建脚本或依赖的安装脚本。
- 两道闸都不是完整的沙箱：单元测试一侧不拦 DNS 查询、UDP 与子进程；浏览器一侧不拦对 IP 字面量的请求。它们防的是测试无意中连到真实服务，不防故意绕过。
- Playwright 的规则只对 Chromium 有效；`brand-surfaces` 配置里按需启用的 WebKit 与 Firefox 没有这条规则，它们不在 CI 运行。

## 验证

读数见[第三波记录](../work-memory/sessions/2026-11-13-third-wave-fixes.md)。给 `website-build.yml` 临时加一个 `schedule` 触发器，新测试失败；已还原。
