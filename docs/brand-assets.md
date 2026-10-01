# 品牌标识与素材

本文规定品牌标识（名称、域名、邮箱、品牌色、Logo、图标、加载动效、分享卡）的唯一来源、读取方式和校验方法。迁移过程与决策见 [品牌迁移计划](brand-migration-plan.md)。

## 唯一来源

| 内容 | 来源 | 说明 |
|---|---|---|
| 名称、法律实体、域名、邮箱、界面品牌色、Logo 颜色、PWA 主题色 | [`brand/brand.json`](../brand/brand.json) | 应用、脚本和测试只读这里；不要在代码里再写品牌名、域名或邮箱字面量 |
| Logo 与图标 | `brand/svg`、`brand/png`、`brand/web`、`brand/social` | 设计方原件，规则见 [`brand/LOGO-KIT.md`](../brand/LOGO-KIT.md) |
| 加载与状态动效 | `brand/loader` | 由 `pnpm brand:export-motion` 从 `brand/tools` 的动效库导出，`PROVENANCE.json` 记录哈希 |
| 设计令牌 | `brand/tokens/sairn.tokens.json` | 由同一脚本从两个设计工具中提取 |

### `brand.json` 的域名分组

- `domains.primary` 是规范域名：SEO、站点地图、推荐链接、法律文本只用这一组。
- `domains.legacy` 列出仍需识别的旧域名组。识别意味着：在这些主机上，网络（主网、测试网）按主机名判定，推荐链接 `/join/<code>` 生效，切换网络时留在同一组域名内（`apps/terminal/src/config/public-origins.ts`）。旧域名组只在切换期间保留，退役后从列表删除。

## 读取方

| 读取方 | 读取内容 |
|---|---|
| `apps/terminal/src/config/brand.ts` | `BRAND_NAME`、`BRAND_FILE_STEM`、`BRAND_LEGAL_ENTITY`、域名分组、`SUPPORT_EMAIL`、`PWA_THEME_COLOR` |
| `apps/terminal/src/config/seo.ts` | 站点名、规范地址、标题、主题色 |
| `apps/terminal/src/config/public-origins.ts` | 主网、测试网的规范地址与主机识别 |
| 启动播报与首页链接 | `StartupFallback`、交易页工作区、移动端外壳里的 `Loading <品牌名>...`；页头、移动页头、导航抽屉的首页链接名称 |
| 持仓盈亏分享卡 | 卡面品牌字样、下载文件名前缀 |
| `apps/website/src/config/brand.ts`、`astro.config.mjs` | 官网站点地址、交易终端地址、品牌名、客服邮箱 |

静态文件不能导入 JSON，它们由 `pnpm brand:check` 校验与 `brand.json` 一致：

- `apps/terminal/public/manifest.json` 的名称与主题色；
- `apps/terminal/public/robots.txt`、`sitemap.xml` 与 `apps/website/public/robots.txt` 只指向主域名；
- `legal/*.md` 里的链接与邮箱只使用主域名组，条款写明的法律实体等于 `name.legalEntity`；
- `brand/loader` 的每个文件与导出记录一致。

## 校验

| 命令 | 覆盖 |
|---|---|
| `pnpm brand:check` | 上面的静态文件与动效导出；同时校验 `brand.json` 的结构（域名小写、子域名属于同一顶级域、邮箱使用主域名、主机不重复） |
| `node --test tests/brand-cross-app.test.mjs` | `packages/ui`、终端、官网三份样式表的品牌色等于 `brand.json` |
| `pnpm test:brand` | 以上两项、OG 卡、终端品牌契约测试与官网测试 |
| `pnpm brand:export-motion`、`node scripts/brand-export-motion.mjs --check` | 重新导出动效并确认导出可以复现（需要 Chromium，不在 CI 中运行） |

CI 中，`Terminal Tests` 在 `brand/**`、`legal/**` 变化时运行 `pnpm brand:check` 和终端品牌测试组；`Website and Brand` 运行 `pnpm test:brand`。路径与测试清单由 `scripts/ci-workflows.test.mjs` 固定。

## 改名时的约定

- 名称、域名、邮箱、颜色只改 `brand/brand.json`，再按 `pnpm brand:check` 与测试的提示更新静态文件。
- 测试里的品牌字面量（例如启动播报的渲染结果、manifest 名称）保留为独立断言，不改成「等于 `brand.json`」，这样改名时测试会明确列出所有受影响的输出。
- 不依赖品牌名定位元素：首页链接带 `data-brand-home-link`，测试与测量脚本用它定位，再单独断言可访问名称。
