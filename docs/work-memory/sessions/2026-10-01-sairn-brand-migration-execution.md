<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-sairn-brand-migration-execution",
  "date": "2026-10-01",
  "title": "gatu → Sairn 品牌迁移：执行记录",
  "kind": "task",
  "status": "recorded",
  "topics": ["brand-identity", "i18n-runtime", "docs-governance"],
  "summary": "按 docs/brand-migration-plan.md 分步执行 gatu → Sairn 品牌迁移（进行中）。用户决定：所有品牌标识（含存储键、Agent 槽位名）改为 sairn，目前没有用户，需要重新签名就重新签名；域名 sairn.ai；法律实体 Sairn Corp.；历史记录全部替换（命令、域名、AWS 资源名等事实保留原值）；界面强调色换成青色与薄荷色、按钮保持中性；缺失素材由 Claude 按基础稿补做。已完成：brand/ 整理与单一来源 brand/brand.json、CI 品牌测试组与防静默失效、读取方接线（官网前后构建逐字节一致）、Logo/图标/manifest/图表加载动效/Privy logo、名称与六种语言目录（{BRAND_NAME} 占位）与法律文本、品牌强调色。详见正文的步骤表与验证。",
  "thread": null,
  "baseCommit": "8274cc3d",
  "commits": ["c2d47191", "721cf233", "42f002e1", "4bba29b1", "a19e7cd3", "0722f231", "cf9479d0"],
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

### 发现与处理

- CSS 注释里写了 `svg/*/page-loading.svg`，`*/` 提前结束注释导致整份样式表解析失败；单元测试按文本读 CSS，没能发现，是在开发服务器上看到的。已改正，并在之后用生产构建做验证。
- 应用内浏览器的视口模拟不会向已打开的页面派发媒体查询变化事件，导航折叠不随模拟宽度变化；测量时每个宽度都重新加载页面。这是工具限制，不是应用缺陷（`useMediaQuery` 订阅了 `change` 事件）。
- 包体：本次改动比 `dev` 的 CI 构建多 3,821 字节 gzip，主要是新 Logo 的曲线几何进入共享页头块；只生成终端实际使用的两个变体省了约 600 字节。基线只上调这部分，`dev` 已用的 +6,462 继续计入。

## 验证与限制

- 已运行：上表各项；`pnpm test:brand`；官网测试与构建；终端类型检查；Biome；`node --test scripts/ci-workflows.test.mjs`。
- 已连接钱包状态下的页头没有测量：法语在 1182 px 未连接时只剩 29 px 余量。
- 没有在 Safari、Firefox、真机或已安装的 PWA 上验证图标与加载动效；没有发布。
- 首次提交这份记录（`afd39a12`）时索引生成因缺少「结论与依据」小节失败，而命令链没有在失败后停止提交；随后的提交补齐了小节和索引。

## 后续与替代关系

没有被替代的记录。继续执行：OG 卡、PnL 分享卡、内部标识（存储键、锁名、Agent 槽位名、CSS 类名、请求头、环境变量、包名）、域名 `sairn.ai`、现行文档与历史记录的品牌词替换。
