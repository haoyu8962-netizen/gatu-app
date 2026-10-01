<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-sairn-brand-migration-execution",
  "date": "2026-10-01",
  "title": "gatu → Sairn 品牌迁移：执行记录",
  "kind": "task",
  "status": "verified",
  "topics": ["brand-identity", "i18n-runtime", "docs-governance"],
  "summary": "按 docs/brand-migration-plan.md 与用户决定完成 gatu → Sairn 品牌迁移（未发布）：brand/ 单一来源与设计交付物、Logo/图标/加载动效/Privy logo/OG 卡/盈亏分享卡、名称与六种语言目录（{BRAND_NAME} 占位）、法律实体 Sairn Corp.、青色与薄荷强调色、存储键与锁名/Agent 槽位名 sairn/请求头/环境变量/包作用域 @sairn、规范域名 sairn.ai（gatu.ai 过渡期继续识别）、现行文档与历史记录的产品名。最终验证：全仓类型检查、改动文件 Biome、终端 640 文件 7,938 项、官网测试与构建、脚本与 CloudFront 测试、test:brand、记录检查、Node 22.15 生产构建（预算 +7,166）与 Lambda 构建、7 组浏览器套件 216 项全部通过。未做：状态动效、已连接页头测量、真机与非 Chromium 浏览器、任何发布与仓库外操作（DNS、证书、CloudFront 别名与源站请求策略、Privy、邮件、LI.FI 登记）。",
  "thread": null,
  "baseCommit": "8274cc3d",
  "commits": ["c2d47191", "721cf233", "42f002e1", "4bba29b1", "a19e7cd3", "0722f231", "cf9479d0", "afd39a12", "64be35b2", "e79d026e", "3f502cb7", "7e228768", "4d1286b8", "5cd45ab8", "94175c1c"],
  "sources": [
    { "path": "docs/brand-migration-plan.md" },
    { "path": "docs/brand-assets.md" },
    { "path": "brand/brand.json" },
    { "path": "scripts/brand.mjs" },
    { "path": "scripts/brand-export-motion.mjs" },
    { "path": "scripts/brand-derive-icons.mjs" },
    { "path": "tests/brand-cross-app.test.mjs" },
    { "path": "apps/terminal/src/lib/tests/brand-catalog-contract.test.ts" },
    { "path": "docs/runtime-guardrails.md" }
  ],
  "supersedes": []
}
-->
# gatu → Sairn 品牌迁移：执行记录

## 背景与范围

同步记录，未取得可核对的任务标识。分支 `claude/from-dev-1001`，计划与核验见 [2026-10-01-sairn-brand-migration-plan](2026-10-01-sairn-brand-migration-plan.md) 和 [brand-migration-plan.md](../../brand-migration-plan.md)。

用户在执行前给出的决定（对应计划第 2 节）：

- 所有品牌标识替换为 Sairn，包括计划原本建议保留的存储键、Web Lock 名和 Hyperliquid Agent 槽位名；理由是目前没有用户，需要重新签名就重新签名。
- 新域名 `sairn.ai`；法律实体改为 Sairn Corp.。
- 历史记录（工作记录、ADR、调研）全部替换品牌词，命令、域名、AWS 资源名等事实性内容保留原值。
- 界面强调色换成 Sairn 青色与薄荷色，主按钮保持中性（计划 D4 的 b1）。
- 缺失的素材由 Claude 依据设计方基础稿补做，需要用户准备的另行告知。

## 结论与依据

### 已完成的步骤

| 提交 | 内容 | 验证 |
|---|---|---|
| `c2d47191`、`721cf233` | `brand/` 整理：设计方原件入库，`LOGO-KIT.md` 保留设计方说明，两个 HTML 工具移到 `brand/tools/`，动效库导出到 `brand/loader/`（`scripts/brand-export-motion.mjs`，163 个文件，`PROVENANCE.json` 记录哈希），设计令牌提取到 `brand/tokens/`，`brand/brand.json` 成为单一来源（初值为旧值），`.gitattributes` 豁免设计工具的行尾空格 | 导出写入后立即 `--check` 复现一致；与调查期导出的 SVG 清单一致 |
| `42f002e1` | 防静默失效与 CI：首页链接加 `data-brand-home-link`；启动占位禁止 `svg`、`img`；费用行和 `hi@` 断言与品牌无关；manifest 主题色绑定深色 `--bg-base`；CI 品牌测试组新增 9 个测试，`brand/**`、`legal/**` 进入各工作流路径过滤；Biome 排除 `brand/`（提交钩子曾改写鸿蒙 JSON 的工作区副本，已恢复原件） | 相关 18 个测试文件通过；`ci-workflows.test.mjs` 新断言做了删除路径的变异检查 |
| `4bba29b1` | 单一来源接线（取值不变）：`config/brand.ts`、SEO、启动播报、首页链接名称、PnL 卡品牌字样与文件名、`public-origins.ts` 改为主域名与旧域名两组；官网 `config/brand.ts` 与各组件；`scripts/brand.mjs --check` 校验静态文件；`docs/brand-assets.md` | 官网改动前后构建的 `dist` 逐字节一致；终端启动播报渲染结果仍是单个文本节点；`brand:check` 的三类变异都被抓住 |
| `a19e7cd3` | Logo、图标与加载动效：`BrandLogo`（几何由 `brand:sync` 从设计方 SVG 生成并校验五种配色路径一致）、页头与抽屉 24 px、`BrandPageLoader`（动效库 page-loading）、`--logo-*` 令牌、PWA 与 favicon、官网 Logo 与图标改为导入 `brand/`、Privy 按主题传 logo；派生 `icon.svg`（与设计方 512 图平均通道差 0.11）与 `icon-maskable-192.png`（0.2）；总包体基线按实测上调 +3,821 字节 | 阶段测试 22 个文件 324 项通过；Node 22.15 生产构建通过预算与后续步骤；导航余量实测见 `docs/runtime-guardrails.md` §11 |
| `0722f231` | 名称切换为 Sairn：`brand.json`、manifest、10 条翻译消息改用 `{BRAND_NAME}` 占位并迁移 5 种语言译文、删除带旧名的废弃条目、路由 head、官网标语与博客标题、法律文本名称与 Sairn Corp. | 完整终端测试 640 文件 7,936 项通过；6 种语言在用条目逐条核对除占位外无变化、缺译集合不变；提取幂等；新目录契约测试做了变异检查 |
| `cf9479d0` | 品牌强调色：`--signal` 浅色 `#176b64`、深色 `#86e5d3`，悬停与 soft 同步；三份样式表与 `brand.json` 一致；10 处等待转圈改中性色；启动出错页按钮；对比度契约 | 完整终端测试通过（颜色改动后仅 `bootstrap-error-page` 一项需要更新期望值）；对比度契约做了变异检查；无头 Chromium 截图核对深浅两种主题的桌面与手机交易页 |

| `e79d026e` | OG 卡：`designs/og-cards/cards.html` 按 Sairn 深色令牌重画，内嵌横版组合与标志路径，终端卡沿用原中文描述（字体子集只含这些字），官网卡用口号英文版两行；字体与模板改为中性名称 | `og:generate` 删除旧图后生成，`og:check` 复验；两张图人工查看 |
| `3f502cb7` | 盈亏分享卡：画布用 `Path2D` 绘制 24 px 横版组合，弹窗预览用 `BrandLogo`；卡面两种主题都是深色，所以 Logo 固定用深底配色；几何模块移到 `lib/brand/` | 相关 10 个测试文件 306 项通过；无头 Chromium 经开发服务器加载模块渲染深浅两种主题的分享卡并人工查看（首版浅色主题下 Logo 看不清，已改为固定深底配色） |
| `7e228768` | 内部标识：存储键与锁名、调试全局变量、`<meta>` 名称、Vite 插件名、环境变量 `SAIRN_*`、请求头 `x-sairn-*`、配对片段键 `sairn-mobile-sync`、LI.FI integrator 与 Agent 槽位名 `sairn`、测试数据、`.deepsec` 项目；AWS 资源名不变；转发主机名请求头双写新旧名、Lambda 先读新再读旧；发布手册写明过渡步骤 | 终端完整测试、CloudFront 44 项、脚本测试、全仓类型检查通过 |
| `4d1286b8` | 包作用域 `@gatu/*` → `@sairn/*`（351 个文件，锁文件两处），离线重装后工作区链接到 `@sairn` | 全仓类型检查、终端完整测试、生产与 Lambda 构建、官网测试与构建、CloudFront 测试通过 |
| `5cd45ab8` | 规范域名 `sairn.ai`：`brand.json` 主域名与旧域名组、静态文件、法律文本、测试数据；新增旧域名过渡测试；`docs/brand-assets.md` 写上线顺序 | 终端完整测试 7,938 项通过；`brand:check`、CloudFront、官网构建（canonical 为 `https://sairn.ai/`）通过 |
| `94175c1c` 及收尾提交 | 文档：现行文档按现行标识替换（命令、包名、环境变量、请求头），带日期的历史事实恢复原值；历史记录只替换正文里的产品名，代码、命令、链接、路径、域名与 AWS 名称保留；清理 HyperTerminal 残留；迁移计划追加实施状态 | 153 个改动的 Markdown 文件相对链接无断链；`git diff --check`；记录索引与检查 |

### 发现与处理

- CSS 注释里写了 `svg/*/page-loading.svg`，`*/` 提前结束注释导致整份样式表解析失败；单元测试按文本读 CSS，没能发现，是在开发服务器上看到的。已改正，并在之后用生产构建做验证。
- 应用内浏览器的视口模拟不会向已打开的页面派发媒体查询变化事件，导航折叠不随模拟宽度变化；测量时每个宽度都重新加载页面。这是工具限制，不是应用缺陷（`useMediaQuery` 订阅了 `change` 事件）。
- 包体：本次改动比 `dev` 的 CI 构建多 3,821 字节 gzip，主要是新 Logo 的曲线几何进入共享页头块；只生成终端实际使用的两个变体省了约 600 字节。基线只上调这部分，`dev` 已用的 +6,462 继续计入。

## 验证与限制

最终一轮（`94175c1c` 之后的收尾提交）实际运行并通过：`pnpm typecheck`；本次改动的 422 个源文件 Biome；终端完整 Vitest 640 文件 7,938 项（1 项跳过）；官网测试 5 项与构建；`node --test scripts/*.test.mjs`；`pnpm test:cloudfront` 44 项；`pnpm test:brand`；`node --test tests/*.test.mjs`；`pnpm memory:check`、`memory:test`；Node 22.15、`NODE_ENV=production` 的 `pnpm build`（总包体 +7,166，基线已按 Logo 成本上调 3,821）与 `build:lambda`；CI 的 6 组浏览器套件与用户菜单恢复套件共 216 项。

- 全仓 `pnpm check` 失败，原因是 `.claude/worktrees/` 里另一会话工作区的嵌套 `biome.json`，与本任务无关；改为检查本次改动的文件。
- 收尾时曾误执行 `git checkout 99ddc6b4 -- biome.json`，立即从 HEAD 恢复并确认内容一致，没有提交。
- 没有测量已连接钱包时的页头；没有在 Safari、Firefox、真机或已安装 PWA 上验证；没有发布，也没有执行任何仓库外操作。

## 后续与替代关系

没有被替代的记录。仓库外待办（顺序见 `docs/brand-assets.md` 的「域名切换到 sairn.ai」与 `deploy/cloudfront/README.md` 顶部说明）：

- 注册并配置 `sairn.ai`（DNS、证书、CloudFront 别名、邮件 `support@sairn.ai`），旧域名保持续费，稳定后再做 301 跳转并从 `brand.json` 删除旧域名组。
- 更新 API 源站请求策略的转发头为 `X-Sairn-Forwarded-Host`，发布验证后删除代码里的旧头双写；Lambda 环境变量改名为 `SAIRN_*`（当前值等于默认值，不改也不影响行为）。
- 发布构建设置 `VITE_HYPERLIQUID_AGENT_NAME=sairn`；外部钱包用户需重新授权 Agent。
- Privy 后台添加新 origin、改应用名；LI.FI 如需按 integrator 计费，登记 `sairn`；社交头像用 `brand/social`；GitHub 仓库名 `gatu-app` 是否改名由用户决定。
- 官网自 2026-07-19 起未发布，首次发布前审查累计差异。
- 设计方：确认悬停色 `#A8EEE1` / `#0F524D`；补 partial、info、warning 三个状态符号后再接入状态动效；`designs/mockups.pen` 仍是旧品牌设计稿。
- 2026-10-01 补记：上面「设计方」一条中的三个状态符号、状态动效接入、`designs/mockups.pen`，以及「官网未发布」「已连接页头未测」「非 Chromium 未验证」，后续处理与仍未完成的部分见 [2026-10-01-sairn-brand-followups](2026-10-01-sairn-brand-followups.md)。
