# ADR 0027：品牌迁移总则：单一来源、显示名、内部标识与历史记录

- 状态：已接受并实施（2026-10-01，分支 `claude/from-dev-1001`，提交 `c2d47191` 至 `94175c1c`，记录提交 `f440fa1b`）。本 ADR 是实施后同日补写的回溯记录。分支没有推送，未合入 `dev`，也未发布。决定由用户在执行前给出，见[执行记录](../work-memory/sessions/2026-10-01-sairn-brand-migration-execution.md)的「背景与范围」。其中「内部标识全部改为 sairn」推翻了[迁移计划](../brand-migration-plan.md) D8、D9 的推荐默认值。 2026-10-08 补记：之后随 p24 发布（main `3ced842e`，2026-10-02）。
- 关联：[品牌标识与素材](../brand-assets.md)（现行 Reference）；[迁移计划](../brand-migration-plan.md)（D1–D24、阶段、风险）；[规划记录](../work-memory/sessions/2026-10-01-sairn-brand-migration-plan.md)；[ADR 0028](0028-brand-accent-colors.md)（品牌色）、[ADR 0029](0029-brand-status-motion.md)（品牌动效与状态符号）、[ADR 0030](0030-pnl-share-card-brand-rendering.md)（盈亏分享卡）、[ADR 0031](0031-domain-move-to-sairn-ai.md)（域名迁移）。

## 背景与约束

- 设计方交付了 Sairn Logo 与图标套件 v1.3、Motion Library、Share Studio 和原生图标集（计划 §1.1）。新名称是 Sairn，所以这是一次整体改名，不只是换图。
- 改名前，`git grep -niI gatu`（排除图表库）命中 769 个文件、2,991 处（计划 §1.5）。品牌值散落在代码、静态文件、法律文本、三份样式表和官网里。`APP_NAME = "gatu"` 同时充当显示名和 Hyperliquid Agent 槽位的回退值（计划 §1.4 第 4 条）。
- Lingui 的 msgid 就是英文原文，改英文等于换键。只要某个语言的 msgid 集合和英文对不上，整个语言会静默退回英文（计划 §1.4 第 6 条）。另有几类检查会在改名后静默恒真，例如 `aria-label="GATU"` 选择器、「GATU fee」和 `hi@gatu.ai` 的负向断言（计划 §1.4 第 7 条）。
- 用户说明目前没有用户，需要重新签名就重新签名。
- 约束：签名契约不变（AGENTS.md「Wallet signing contract」、[ADR 0002](0002-exact-owner-trading-signers.md)），改的只是槽位名称；启动占位不能出现可见品牌元素（[ADR 0010](0010-blank-until-ready-startup.md)）；现有 AWS 资源名是资源标识，改代码改不了它们。

## 目标

1. 品牌值只有一个来源。改名只改一个文件，再由检查列出所有受影响的输出。
2. 六种语言显示同一个名称，以后改名不再改动 msgid。
3. 内部标识与新名称一致，但与显示名解耦，改显示名不会顺带改掉存储键或 Agent 槽位。
4. 历史记录不能被改写成从未发生过的事实。

## 决策

1. **单一来源 `brand/brand.json`。** 包含名称（`display`、`lowercase`、`legalEntity`）、域名分组（`primary`、`legacy`）、客服邮箱、界面品牌色（深浅两套）、Logo 颜色与图标底色、PWA 主题色。读取方：
   - 终端 `apps/terminal/src/config/brand.ts`；
   - 官网 `apps/website/src/config/brand.ts` 与 `astro.config.mjs`；
   - `scripts/brand.mjs` 与 `tests/brand-cross-app.test.mjs`。

   不能导入 JSON 的静态文件由 `pnpm brand:check` 比对，包括 manifest、robots、sitemap、`legal/*.md` 和 `brand/loader` 的导出哈希。`brand.json` 的结构也由这个脚本手写校验（小写域名、子域名属于同组、邮箱在主域名、主机不重复），因为仓库根目录解析不到 zod（计划 §1.4 第 13 条）。
2. **生成与同步的文件不手改。** Logo 几何 `apps/terminal/src/lib/brand/logo-geometry.gen.ts` 由 `pnpm brand:sync` 从 `brand/svg` 生成，生成时断言五种配色的路径和顺序完全相同。终端与官网的图标、Privy 用的横版组合也由它从 `brand/` 复制。`brand:check` 发现任何一份过期就失败；`*.gen.ts` 不进 Biome 检查（`biome.json`）。设计方原件、动效导出和令牌放在 `brand/`，规则见 [brand/README.md](../../brand/README.md) 与 [LOGO-KIT.md](../../brand/LOGO-KIT.md)。
3. **显示名。** 所有语言都写 `Sairn`，不翻译。文件名前缀用 `name.lowercase`，即 `BRAND_FILE_STEM`，值为 `sairn`。法律实体是 `Sairn Corp.`，`brand:check` 校验 `legal/terms.md` 写的是这个实体名。翻译消息只通过 `BRAND_NAME` 引用产品名，目录里保留 `{BRAND_NAME}` 占位符（[运行时多语言](../i18n-presentation.md)）。首页链接带 `data-brand-home-link`，测试和测量脚本用这个属性定位元素，可访问名称另行断言。
4. **内部标识全部改为 `sairn`，并写成字面量，不从 `brand.json` 读取**（`7e228768`、`4d1286b8`）。改动范围：
   - 存储键和 Web Lock 名：`sairn.funds_action.pending.v1`、`sairn:cctp-deposit-tracking:v1`、`sairn-order-asset-v1`、`sairn:embedded-cctp-deposit:*` 等；
   - Agent 槽位：`config/build-meta.ts` 的 `APP_NAME = "sairn"`，开发环境 `sairn-dev`；
   - 请求头与标记：`x-sairn-forwarded-host`、`x-sairn-route`、`<meta name="sairn-route">`、`sairn-preload-*`；
   - 环境变量 `SAIRN_*`、`VITE_SAIRN_*`，包作用域 `@sairn/*`；
   - 配对片段键 `sairn-mobile-sync`（原为 `ht-mobile-sync`）；
   - LI.FI integrator `sairn`；
   - 调试全局变量、Vite 插件名和 `.deepsec` 项目。
5. **继续保留 `gatu` 的标识。**
   - AWS 资源名：S3 桶 `gatu-terminal-2026`、`gatu-dist-2026`；CloudFront 函数 `gatu-terminal-request`、`gatu-terminal-response`、`gatu-rewrite-index`；策略 `gatu-terminal-*`；Lambda `gatu-terminal-api*`；IAM 用户 `gatu-edge`（策略文件 `deploy/cloudfront/iam/gatu-edge-release-policy.json`）。
   - GitHub 仓库 `gatu-app`（是否改名由用户决定）和本地检出路径。2026-11-13 补记：仓库迁到新账号后，运营方决定改名为 `sairn`（[ADR 0054](0054-chart-library-outside-the-repository.md)）；私有的图表库仓库仍叫 `gatu-chart-library`，本地检出路径不受影响。
   - `brand.json` 的 `domains.legacy` 里的 `gatu.ai` 组，保留到退役为止（ADR 0031）。
   - 过渡期双写的旧请求头 `x-gatu-forwarded-host`（ADR 0031）。
   - 测试里用来拒绝旧名的断言，以及文档中带日期的历史事实。
6. **Logo 与令牌。**
   - `BrandLogo` 只输出 `--logo-signal`、`--logo-choice`、`--logo-wordmark` 三个变量，深浅主题各一组，取值等于 `brand.json` 的 `logo`。它不写十六进制颜色，不输出 `<title>`，自身设为 `aria-hidden`。
   - 页头、抽屉的 Logo 高 24 px（套件规定的下限），导航余量的变化见 [ADR 0013](0013-desktop-navigation-collapse.md) 2026-10-01 补充。
   - 图表首次加载用 `BrandPageLoader`，48 px，最暗一帧由 `--logo-loader-floor` 控制。
   - Privy 登录窗口的 Logo 按主题传 `appearance.logo`（计划 D24 选 B），不违反 [ADR 0026](0026-privy-follows-theme-after-upgrade.md) 的约束。
   - 品牌色见 [ADR 0028](0028-brand-accent-colors.md)。
7. **历史记录。**
   - 工作记录、ADR、调研只替换正文里的产品名。代码、命令、链接、路径、域名和 AWS 名称保留原样，例如 [ADR 0005](0005-spa-static-shell.md) 仍写 `pnpm --filter @gatu/terminal`。
   - 现行文档改用现行标识。
   - 带日期的历史事实保留原值（`94175c1c`）。
8. **发布批次。** 计划把发布分成三批：A（用户不可见，随常规晋升发布）、B（一次对外的品牌切换，终端、官网和 Privy 同步）、C（域名迁移）。实际情况是，各阶段都在同一个分支 `claude/from-dev-1001` 上累积，品牌切换和域名切换的代码已经合在一起。状态动效不在执行记录的范围内，是在 `f440fa1b` 之后的提交里补做的，见 ADR 0029。截至本记录，三批都没有发布。

### 读历史记录时的名称对照

| 历史记录里的写法 | 现行写法 |
| --- | --- |
| 显示名 `gatu` / `GATU` / `Gatu`；法律实体 `Gatu Corp.` | `Sairn`；`Sairn Corp.` |
| `@gatu/*`、`GATU_*`、`VITE_GATU_*` | `@sairn/*`、`SAIRN_*`、`VITE_SAIRN_*` |
| `x-gatu-forwarded-host`、`x-gatu-route`、`gatu-route`、`gatu-preload-*`、`gatu-chart-prefetch` | 前缀改为 `sairn`（旧转发头在过渡期仍会双写） |
| 存储键与锁名 `gatu.*`、`gatu:*`、`gatu_*`、`gatu-order-asset-*` | 前缀改为 `sairn` |
| Agent 槽位 `gatu` / `gatu-dev`；配对片段 `ht-mobile-sync`；LI.FI `gatu` | `sairn` / `sairn-dev`；`sairn-mobile-sync`；`sairn` |
| `app.gatu.ai`、`testnet.gatu.ai`、`support@gatu.ai` | `app.sairn.ai`、`testnet.sairn.ai`、`support@sairn.ai` |

## 备选方案与代价

- **内部标识保留 `gatu`**（计划 D8、D9 的推荐）：
  - 好处：外部钱包不用重新授权，不多占命名槽位，同一 origin 内的待处理记录和跨标签页互斥都不受影响。
  - 代价：内部名和产品名长期不一致，API 钱包页显示旧名。
  - 用户以「目前没有用户」为由否决。
- **历史记录保留原文，另加名称对照**（计划 D10 的 B、B′）：
  - 好处：完全不会编造历史。
  - 代价：读者会在历史记录里同时看到两个名字。
  - 用户选择只替换正文里的产品名。上面的对照表兼顾了两种做法。
- **YAML 加解析依赖**：要新增依赖，否决（D18）。
- **用 zod 做结构校验，放在终端 vitest 里**（计划阶段 1b 的 `brand-source.test.ts`）：没有实施，改为在根目录脚本里手写校验。代价是规则要手写，但根目录不依赖 zod，CI 的 `Check brand source consistency` 步骤就能直接运行。
- **全大写 `SAIRN` 或另起中文名**：否决（D1）。
- **不可见阶段逐个开 PR 进 `dev`**（D21 的推荐）：没有采用，全部在一个分支上累积。

## 后果与边界

- 外部钱包用户必须为 `sairn` 槽位重新授权 Agent。旧的 `gatu` 命名 Agent 不会因此失效，仍占用一个命名槽位；每个账户只有 3 个命名槽位，槽位已满时授权会失败（计划 D9；[首次交易](../trading-onboarding.md)）。2026-10-09 补记：这个失败在 2026-10-08 发生过一次；[ADR 0038](0038-unnamed-default-agent-for-trading-connection.md) 起普通交易连接改用无名默认 Agent，`sairn` 命名槽位退役，旧的 `gatu` 与 `sairn` 命名 Agent 仍占位到过期或在 API 钱包页移除。
- 在同一个 origin 内，旧键下的待处理记录不再被读取，包括资金动作标记、CCTP 跟踪与授权意图、下单资产占位、LI.FI 执行记录和登录意图。新旧版本同时打开时，两者的锁互相看不见。因为目前没有用户，这次没有做迁移。换域名造成的同类失效见 ADR 0031。
- Agent 槽位是 `build-meta.ts` 里的字面量，不读 `brand.json`。但计划阶段 1b 提议的源码扫描断言没有实现，所以没有测试能阻止以后改成从 `brand.json` 读取。生产槽位靠构建变量 `VITE_HYPERLIQUID_AGENT_NAME=sairn`（`deploy/env.build.example`），发布前仍靠人工核对。2026-10-09 补记：槽位、该变量与 `config/trading-agent.ts` 已随 ADR 0038 删除。
- 法律文本按用户决定改成了 Sairn Corp.。计划 D16 建议先做法律审阅，并确认是否需要用户重新接受条款，执行记录里两者都没有结论。
- 状态动效（计划阶段 3）不在执行记录的范围内，由 ADR 0029 记录。`designs/mockups.pen` 里的字母徽标仍是旧样式（见 [brand-assets.md](../brand-assets.md)「设计稿」）。
- 回访用户第一次打开时，Service Worker 先返回缓存的旧壳，第二次打开才是新品牌（计划 §1.4 第 12 条）。
- 【未验证】路由标记头在请求函数和响应函数里同时改了名（`x-gatu-route` → `x-sairn-route`）。两个函数在同一次 `deploy.mjs functions` 中发布，但它们先后生效之间的间隙没有评估。

## 证据

- 代码：`brand/brand.json`、`scripts/brand.mjs`、`scripts/brand-derive-icons.mjs`、`scripts/brand-export-motion.mjs`、`apps/terminal/src/config/brand.ts`、`apps/terminal/src/config/build-meta.ts`、`apps/terminal/src/config/trading-agent.ts`、`apps/terminal/src/components/brand/brand-logo.tsx`、`apps/terminal/src/components/brand/brand-page-loader.tsx`、`apps/website/src/config/brand.ts`、`biome.json`。
- 测试：
  - `apps/terminal/src/lib/tests/brand-catalog-contract.test.ts`：在用条目不得出现字面产品名，占位符个数必须与源消息一致；
  - `brand-logo.test.tsx`、`brand-semantics-contract.test.ts`、`trading-agent-config.test.ts`、`pwa-manifest.test.ts`、`legal-policy-contract.test.ts`、`mobile-header-brand.test.tsx`；
  - `tests/brand-cross-app.test.mjs`；
  - `scripts/ci-workflows.test.mjs`：固定 CI 品牌组和路径过滤。
- Reference：[品牌标识与素材](../brand-assets.md)、[运行时多语言](../i18n-presentation.md)、[运行约束](../runtime-guardrails.md) §1、§8、§11，以及 `.claude/rules/design-tokens.md`「Brand logo」。

## 验证

- **执行记录中的最终一轮**：在 `94175c1c` 之后的收尾提交上运行，全部通过：
  - `pnpm typecheck`；改动文件的 Biome 检查；
  - 终端完整 Vitest：640 个文件、7,938 项，1 项跳过；
  - 官网测试与构建；`node --test scripts/*.test.mjs`；`pnpm test:cloudfront`；`pnpm test:brand`；
  - Node 22.15、`NODE_ENV=production` 下的 `pnpm build` 与 `build:lambda`；
  - CI 的浏览器套件，共 216 项。

  这一轮不覆盖 `f440fa1b` 之后的提交。全仓 `pnpm check` 因另一会话工作区里嵌套的 `biome.json` 失败，与本任务无关。
- **撰写本 ADR 时的复查**（2026-10-01，HEAD `7a511af3`，工作区含另一会话未提交的改动，Node 24.15.0）：
  - `pnpm brand:check` 通过；
  - `node --test tests/brand-cross-app.test.mjs`：4 项通过；
  - `brand-catalog-contract`、`brand-semantics-contract`、`brand-logo`、`trading-agent-config`、`pwa-manifest`、`legal-policy-contract` 等 12 个 Vitest 文件，共 86 项通过。
- **没有做的**：任何发布或仓库外操作；外部钱包重新授权的真实流程；Safari、Firefox、真机和已安装的 PWA。

## 补充（2026-10-02，历史记录的更正）

Codex 对 PR #68 的只读审查发现，有 4 处替换违反了决策 7「带日期的历史事实保留原值」：工作记录的原始任务标题（`2026-09-12-pairing-release.md` 的 `thread.title`）、本机定时任务的名称（`2026-09-12-work-memory.md`），以及两条实测输出（`2026-09-13-spa-shell-spike.md` 的 `h1`、`2026-09-27-legal-pages-app-shell.md` 的页面标题）。这些都已恢复为原文，正文处另加「改名前的实测原文」说明。任务标题、实测输出与现存外部对象的名称都属于决策 7 所说的历史事实，与命令、域名、AWS 名称一样保留原样。

## 补充（2026-10-03，旧域名组与过渡请求头退役）

本 ADR 的内容已于 2026-10-02 经 PR #68 合入 `dev`（`682430ba`）、经 PR #67 晋升 `main`（`3ced842e`），并随 p24 发布；状态行里的「未推送、未合入、未发布」是撰写时的状态。

决策 5「继续保留 `gatu` 的标识」里，有两项随切换方案 PR-B（对应发布 p25）从代码中退役：

- `brand.json` 的 `domains.legacy`（`gatu.ai` 组）已删除，读取方只认 `domains.primary`。
- 过渡期双写的旧请求头 `x-gatu-forwarded-host`：请求函数不再写，Lambda 不再读。旧路由标记 `x-gatu-route` 同时删除。

退役之后，仍然保留 `gatu` 的只有：

- AWS 资源名、GitHub 仓库名与本地检出路径；
- 测试里用来拒绝旧名的断言；
- 文档中带日期的历史事实。

`scripts/brand.mjs` 新增退役名单：`gatu.ai` 回到 `brand.json` 或法律文本时，`brand:check` 失败。「读历史记录时的名称对照」表里「旧转发头在过渡期仍会双写」一句从此不再成立。

这部分代码在分支 `claude/retire-gatu-domain-group`（PR #73），未合入、未发布。合入时机、线上还没做的步骤与发布间隙的行为，见 [ADR 0032](0032-gatu-offline-cutover-to-sairn.md) 的补充。
