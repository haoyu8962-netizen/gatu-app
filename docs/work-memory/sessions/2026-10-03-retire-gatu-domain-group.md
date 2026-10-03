<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-03-retire-gatu-domain-group",
  "date": "2026-10-03",
  "title": "旧 gatu.ai 域名组与过渡请求头在代码中退役（p25 的代码部分），并把过时的现行文档改成现状",
  "kind": "task",
  "status": "verified",
  "topics": [
    "brand-identity",
    "static-hosting"
  ],
  "summary": "用户要求扫描并移除旧 gatu 的代码与文档记录。扫描 origin/dev（2846a6f8）后把命中分成四类，用户选择做前两类：按切换方案 4.2（PR-B）删除 brand.json 的 domains.legacy、公共 origin 的双组识别、Lambda 的旧转发头回退、CloudFront 请求与响应函数的旧头双写和旧路由标记、源站请求策略白名单里的 X-Gatu-Forwarded-Host，并给 scripts/brand.mjs 加退役名单；同时把 brand-assets、两份部署说明、AGENTS.md 等现行文档里过时的 gatu 内容改成现状。AWS 资源名、仓库名和历史记录按 ADR 0027 保留。分支 claude/retire-gatu-domain-group，PR #73，未合入、未发布；用户决定 2026-10-09 之后再合入。类型检查、全量单测、CloudFront 与品牌测试通过，九组变异都被检查拦下；线上只做了只读核对，没有改动任何 AWS、DNS 或 Privy 配置。",
  "thread": null,
  "baseCommit": "2846a6f8",
  "commits": ["560158ab", "5708107a", "f96c4dd9", "e481bffb"],
  "sources": [
    { "path": "docs/sairn-domain-cutover-plan.md" },
    { "path": "docs/adr/0032-gatu-offline-cutover-to-sairn.md" },
    { "path": "docs/adr/0027-brand-single-source-and-identifier-rename.md" },
    { "path": "docs/adr/0031-domain-move-to-sairn-ai.md" },
    { "path": "docs/brand-assets.md" },
    { "path": "brand/brand.json" },
    { "path": "scripts/brand.mjs" },
    { "path": "apps/terminal/src/config/public-origins.ts" },
    { "path": "apps/terminal/src/edge/lambda-handler.ts" },
    { "path": "deploy/cloudfront/functions/terminal-request.js" },
    { "path": "deploy/cloudfront/functions/terminal-response.template.js" },
    { "path": "deploy/cloudfront/distribution-config.mjs" },
    { "path": "deploy/cloudfront/README.md" },
    { "path": "deploy/website/README.md" }
  ],
  "supersedes": []
}
-->
# 旧 gatu.ai 域名组与过渡请求头在代码中退役（p25 的代码部分），并把过时的现行文档改成现状

## 背景与范围

2026-10-03，用户在清理已合并分支之后提出：「扫 旧 gatu 的相关代码文档 移除掉 旧 gatu的记录」。

这个要求与两条现行规则有冲突，所以先只读扫描、再向用户确认范围：

- [ADR 0027](../../adr/0027-brand-single-source-and-identifier-rename.md) 决策 5 规定一部分 `gatu` 名称必须保留（AWS 资源名、仓库名），决策 7 规定历史记录保留原文。
- `AGENTS.md` 当时要求 `gatu.ai` 域名组和过渡请求头保留到 [ADR 0032](../../adr/0032-gatu-offline-cutover-to-sairn.md) 的退役发布（p25）。按[切换方案](../../sairn-domain-cutover-plan.md)阶段 5，p25 在上线稳定 7 天以后做；上线是 2026-10-02。

扫描对象是 `origin/dev`（`2846a6f8`），`git grep -i gatu`（不含 `pnpm-lock.yaml`）。命中分四类：

| 类 | 内容 | 规模 | 处理 |
|---|---|---|---|
| ① 可退役的过渡代码 | `brand.json` 的 `domains.legacy`、双组识别、旧转发头与旧路由标记，及其测试 | 约 15 个文件 | 本次删除 |
| ② 过时的现行文档 | `docs/brand-assets.md` 的八步上线顺序、两份部署说明、`AGENTS.md` 品牌契约、ADR 目录的状态 | 约 10 个文件 | 本次改成现状 |
| ③ 必须保留的标识 | AWS 资源名（`gatu-terminal-*`、`gatu-dist-2026`、`gatu-edge` 等）、仓库名 `gatu-app` | `deploy/` 与文档多处 | 不动：它们是线上资源的真实名字 |
| ④ 历史记录 | `docs/work-memory/sessions`（112 个文件）、ADR、`research/`、根目录的旧审查报告 | 约 190 个文件 | 不动：ADR 0027 决策 7 |

用户的决定（同日，经选择题确认）：

- 范围：做 ① 和 ②，③ 和 ④ 保留。
- 时机：现在写好代码并开 PR，等 2026-10-09 之后再合入和发布，保留 p24 的回滚保险。

本次没有改动任何 AWS、DNS、Privy 配置，也没有发布。

## 结论与依据

### 代码（切换方案 4.2，PR-B）

| 文件 | 改动 |
|---|---|
| `brand/brand.json` | 删除 `domains.legacy` |
| `apps/terminal/src/config/brand.ts` | 删除 `BRAND_LEGACY_DOMAINS` |
| `apps/terminal/src/config/public-origins.ts` | 只认主组；恢复成引入域名分组之前的形状，只是主机名来自 `BRAND_PRIMARY_DOMAINS` |
| `apps/terminal/src/lib/network.ts` | `getPublicOrigin` 不再接收当前主机名 |
| `apps/terminal/src/edge/lambda-handler.ts` | 删除 `LEGACY_FORWARDED_HOST_HEADER` 与回退 |
| `deploy/cloudfront/functions/terminal-request.js` | 不再写 `x-gatu-forwarded-host`、`x-gatu-route`，也不再删除访客自带的 `x-gatu-route` |
| `deploy/cloudfront/functions/terminal-response.template.js` 与渲染出的 `terminal-response.js` | 不再读 `x-gatu-route` |
| `deploy/cloudfront/distribution-config.mjs` | 白名单删除 `X-Gatu-Forwarded-Host`，剩 9 个头 |
| `scripts/brand.mjs` | 只校验主组；新增退役名单 `RETIRED_APEXES = ["gatu.ai"]` |

`scripts/brand.mjs` 的新规则让 `pnpm brand:check` 在三种情况下失败：`brand.json` 出现 `domains.primary` 以外的域名组；主组用了退役域名；`legal/*.md` 链接到退役域名或写了它的邮箱。这个脚本在导入时就执行，没法被单元测试导入，所以它由 CI 里的 `brand:check` 步骤执行，并在本次用变异验证（见下）。

测试改为断言旧名被拒绝：

- `public-origins.test.ts`：改成单组；其他域名的 `app`、`testnet` 主机不被识别。
- `network-storage.test.ts`、`referral-join.test.ts`：`app.gatu.ai`、`testnet.gatu.ai` 与其他未知主机同样处理。
- `lambda-handler.test.ts`：只带 `x-gatu-forwarded-host` 的请求还原不出公网 origin，同源 POST 返回 403。
- `functions.test.mjs`：请求函数不写旧头与旧标记；只带旧标记的请求不影响响应。
- `distribution-config.test.mjs`：白名单里没有 `X-Gatu-Forwarded-Host`。

留在代码里的 `gatu` 都是有意的：拒绝旧名的测试断言、退役名单、AWS 资源名，以及预算脚本里一条带日期的注释。

### 与方案 4.2 的一处取舍

方案写明删除请求函数里「`tagRoute` 与删除语句」，本次照做。代价是发布间隙里的一个现象，按代码推演得出，没有在线上验证：

- p25 发布时请求函数先于响应函数生效。间隙里线上的 p24 响应函数仍会读 `x-gatu-route`，而 p25 请求函数不再删除访客自带的这个头。
- 所以访客可以让自己这一次响应带上配对页的 `no-store`、`no-referrer` 和 `x-sairn-route` 响应头。viewer-response 在缓存之后按请求执行，只影响请求者自己；响应函数发布后消失。
- 没有采用「再保留一个版本的删除语句」：那样还要再发一版才能删干净，而这个现象没有跨用户的影响。

配对页与推荐页的标记两个版本都用 `x-sairn-route`，发布与回滚的间隙里都有效。回滚到 p24 不依赖白名单里的旧头。

### 文档

- `AGENTS.md` 品牌契约：保留的 `gatu` 名称只剩 AWS 资源与仓库；最后一条从「保留旧域名组到退役发布」改为「只有 `domains.primary`，不要再读写旧头与旧标记」。
- `docs/brand-assets.md`：「域名分组」改为只有主组和退役名单；「域名切换到 sairn.ai」改名为「域名」并改写为现状。原来的八步上线顺序记录在 [ADR 0031](../../adr/0031-domain-move-to-sairn-ai.md) 决策 5，没有丢失；改写前的原文在 `2846a6f8:docs/brand-assets.md`。
- `deploy/cloudfront/README.md`：顶部的过渡说明改为现状，并写明线上白名单仍含旧头、要等 p25 验证后才更新。
- `deploy/website/README.md`：状态从「未执行」改为「2026-10-02 发布过一次」；分发别名与证书改为 sairn；「发布前提」里已完成的域名、证书、别名、DNS 四步换成常规发布的核对项；删掉「gatu.ai 去向未决」。
- ADR 0027、0031、0032 各追加一段补充，原文不动。ADR 目录里 0027–0031 的状态原写「未推送、未合入、未发布」，实际已随 PR #68、#67 合入并随 p24 发布，一并更正。
- `brand/README.md`、`docs/README.md`、`CHANGELOG.md`、切换方案的状态行与 4.2、5.1。

没有改的现行文档里的 `gatu`，都属于 ③ 或带日期的事实：PR 链接里的仓库名、AWS 资源名、`deploy/cloudfront/README.md` 里 2026-09-13 的只读核查与 2026-09-15 的 DNS 切换、`docs/across-deposit-addresses.md` 里已归档方案的 EC2 路径、设计交付物的原始目录名。

## 验证与限制

版本：分支 `claude/retire-gatu-domain-group`，基于 PR #72 的分支（`2b56bd4e`，其上游是 `dev` 的 `2846a6f8`）。提交是 `560158ab`（代码、测试与相关文档）和 `5708107a`（官网发布手册）。类型检查和各组测试是在提交前的工作区上跑的，内容与 `560158ab` 相同；构建是在提交之后对 `5708107a` 做的。本机 Node 22.15.0、pnpm 10.21.0。

- `pnpm --filter @sairn/terminal typecheck`：通过。
- 全量 `pnpm --filter @sairn/terminal test -- --maxWorkers=4`：659 个文件中 658 个通过、1 个跳过；8,546 项中 8,545 项通过、1 项跳过（`websocket-soak.test.ts`）。15:21:55 起，202 秒。运行时 `scripts/brand.mjs` 的一处写法还没有最后整理（校验逻辑相同），终端测试不读这个脚本。
- `pnpm test:cloudfront`：46 项通过。
- `pnpm brand:check` 通过；`pnpm test:brand` 通过（退出码 0）：终端品牌测试 8 个文件 46 项、官网测试 10 项、`tests/brand-cross-app.test.mjs` 5 项。
- `node --test scripts/ci-workflows.test.mjs`：10 项通过。
- Biome：改动的代码文件中，在 Biome 范围内的 8 个没有问题。
- `node deploy/cloudfront/distribution-config.mjs --api-origin-request-policy-config` 输出 9 个头，没有 `X-Gatu-Forwarded-Host`。
- 构建：在草稿目录的隔离 worktree 里切到 `5708107a`，执行 `pnpm install --frozen-lockfile --prefer-offline`，构建前工作树干净、只有 `.env.example`。用 CI 式元数据（`SAIRN_BUILD_SHA` 取提交本身，`SAIRN_RELEASE_ID=ci-18000000000-1`，`NODE_ENV=production`，`NITRO_PRESET=node-server`，配对关闭）依次执行 `pnpm --filter @sairn/terminal build` 与 `build:lambda`，都成功退出。
  - chunk 循环检查通过（441 个客户端 chunk）。
  - 包体预算通过：客户端总量 3,293,730（比基线多 6,079，容差 10,000）；桌面运行时增量 202,188（余 941 字节）；手机运行时增量 118,026；交易页静态启动 1,629,743。
  - Lambda 包 225,762 字节，其中没有 `gatu`，`x-sairn-forwarded-host` 出现 1 次。
  - 客户端产物里除图表库外没有文件含 `gatu`。

变异验证：每组都临时改回旧行为或写入错误数据，确认检查失败，再还原。A、B、C、I 四组在 `scripts/brand.mjs` 定稿后重跑过，退出码都是 1。

| 变异 | 被拦下的检查 |
|---|---|
| A：`brand.json` 加回 `domains.legacy` | `brand:check` 报「domains.legacy is not read by anything」 |
| B：主组的 `app` 改成 `app.gatu.ai` | `brand:check` 报两条：不等于 `app.sairn.ai`；用了退役域名 |
| C：`legal/support.md` 加入 `https://app.gatu.ai` 与 `support@gatu.ai` | `brand:check` 报链接和邮箱各一条 |
| I：`brand.json` 删掉 `domains.primary` | `brand:check` 报「domains.primary is missing」 |
| D：响应函数重新读 `x-gatu-route` | `functions.test.mjs` 2 项失败 |
| E：请求函数重新写 `x-gatu-forwarded-host` | `functions.test.mjs` 1 项失败 |
| F：白名单加回 `X-Gatu-Forwarded-Host` | `distribution-config.test.mjs` 1 项失败 |
| G：Lambda 重新回退到旧头 | `lambda-handler.test.ts` 3 项失败 |
| H：`public-origins.ts` 重新识别 `app.gatu.ai` | `network-storage`、`referral-join` 各 1 项失败 |

线上只读核对（2026-10-03，本机经代理，`curl`）：

- `https://app.sairn.ai/build-meta.json` 与 `https://testnet.sairn.ai/build-meta.json`：`commit` 为 `3ced842e…`，`release` 为 `cloudfront-2026-10-02-p24`。
- `https://sairn.ai/`、`https://www.sairn.ai/` 返回 200。
- `app.gatu.ai`、`testnet.gatu.ai`、`gatu.ai`、`www.gatu.ai` 连接失败（状态码 000）。请求经过本机代理，这只说明代理连不上这些主机，与上线记录一致。

上面各项的输出（全量单测、CloudFront 与品牌测试、类型检查、构建与产物检查、三份变异日志）已脱敏存进 `.worklog/2026-10-03/retire-gatu-domain-group/`。

限制：

- 没有发布，也没有在线上验证 p25。发布间隙的行为是按代码推演的。
- 线上源站请求策略的白名单没有读取；「仍含 `X-Gatu-Forwarded-Host`」来自 2026-10-02 的上线记录。
- 没有做浏览器或真机验收。本次不改界面；`gatu.ai` 主机上的行为变化只有单元测试覆盖，那些主机已不提供网页。
- 官网发布手册里关于 2026-10-02 那次发布的说法，来自[上线记录](2026-10-01-sairn-domain-cutover-plan.md)「上线执行」，本次没有重新核对桶里的对象。

### 合并 `dev` 与 p24b（2026-10-04，Auto-fix）

PR #73 开出后，`dev` 合入了 PR #74（银行卡入金 Meld 后续）和 PR #76（p24b 发布记录），GitHub 报告 #73 冲突。按 Auto-fix 的授权，`git fetch origin dev` 后合并 `498ea17a`，得到 `e481bffb`：

- 唯一的文本冲突是生成的 `docs/work-memory/INDEX.md`，用 `pnpm memory:index` 重新生成。
- ADR 0032 与切换方案自动合并。用排序后的 `git diff -U0` 增删行核对过：`dev` 的改动（#72 的 `bfff4ab3` 更正）和 #73 的改动都完整保留。

[p24b 发布记录](2026-10-03-cloudfront-release-p24b.md)改变了本记录写下时的两个事实：

- 2026-10-03 16:57Z 起，线上是 p24b（main `6da4c15a`，`cloudfront-2026-10-03-p24b`）。它的 CloudFront 函数与 Lambda 代码和 p24 相同，只多了两个银行卡入金开关。所以上文「线上是 p24」「p24 的回滚保险」的论证对 p24b 同样成立；「验证与限制」里的线上核对结果（p24、`3ced842e`）是 p24b 发布之前的读数。
- p25 的回滚目标变成 p24b：重新发布 p24 会同时关掉银行卡入金。p24b 的产物在仓库外的工作树 `gatu-release-p25` 里，构建 p25 要用另一个工作树，不能覆盖它。

已据此更正：ADR 0032 补充里的发布间隙与回滚两条、`deploy/cloudfront/README.md` 顶部说明，以及切换方案「按阶段回滚」里 5.1 那一行（追加更正，原文保留）。p24b 记录也写明旧域名清理发布仍叫 p25，与本记录一致。

## 后续与替代关系

- PR #73 在 2026-10-09 之后合入 `dev`，再随晋升发布 p25。发布按切换方案阶段 5：
  - 5.1：发布 p25 并 `verify`；
  - 5.2：线上白名单删除 `X-Gatu-Forwarded-Host`，之后摘除临时 IAM 策略；
  - 5.3：Lambda 环境变量改名；
  - 5.4：30 天后删除两张 gatu 证书。
- PR #73 叠在 PR #72 的分支上。#72 先合入时，#73 只剩本次的提交；如果 #73 先合入，会把 #72 的提交一起带进 `dev`。
- 没有处理的 `gatu`：
  - `README.md` 目录图的根目录写作 `gatu/`，仓库名与检出路径按 ADR 0027 保留；
  - `.deepsec/data/sairn/tech.json` 的 `rootPath` 是带本机用户名的绝对路径，属于另一个问题；
  - `docs/brand-migration-plan.md` 与切换方案的正文是计划与执行记录，只改了状态行。
- 本记录不替代任何记录。
