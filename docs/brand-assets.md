# 品牌标识与素材

本文规定品牌标识（名称、域名、邮箱、品牌色、Logo、图标、加载动效、分享卡）的唯一来源、读取方式和校验方法。迁移过程与决策见 [品牌迁移计划](brand-migration-plan.md)。

## 唯一来源

| 内容 | 来源 | 说明 |
|---|---|---|
| 名称、法律实体、域名、邮箱、界面品牌色、Logo 颜色、PWA 与浏览器主题色（深色 `pwa.themeColor`、浅色 `pwa.lightThemeColor`） | [`brand/brand.json`](../brand/brand.json) | 应用、脚本和测试只读这里；不要在代码里再写品牌名、域名或邮箱字面量 |
| Logo 与图标 | `brand/svg`、`brand/png`、`brand/web`、`brand/social` | 设计方原件，规则见 [`brand/LOGO-KIT.md`](../brand/LOGO-KIT.md) |
| 加载与状态动效 | `brand/loader` | 由 `pnpm brand:export-motion` 从 `brand/tools` 的动效库导出，`PROVENANCE.json` 记录哈希 |
| 补充状态符号（部分成交、提示、警告） | `brand/loader-supplement` | 动效库 v1.3 缺这三个符号；同一条导出命令用库自己的引擎渲染 `definitions.js`，待设计方确认，设计方交付后删除（`brand/loader-supplement/README.md`） |
| 设计令牌 | `brand/tokens/sairn.tokens.json` | 由同一脚本从两个设计工具中提取 |

### `brand.json` 的域名分组

- `domains.primary` 是规范域名：SEO、站点地图、推荐链接、法律文本只用这一组。
- `domains.legacy` 列出仍需识别的旧域名组。识别意味着：在这些主机上，网络（主网、测试网）按主机名判定，推荐链接 `/join/<code>` 生效，切换网络时留在同一组域名内（`apps/terminal/src/config/public-origins.ts`）。旧域名组只在切换期间保留，退役后从列表删除。

## 读取方

| 读取方 | 读取内容 |
|---|---|
| `apps/terminal/src/config/brand.ts` | `BRAND_NAME`、`BRAND_FILE_STEM`、`BRAND_LEGAL_ENTITY`、域名分组、`SUPPORT_EMAIL`、`PWA_THEME_COLOR`、`PWA_LIGHT_THEME_COLOR` |
| `apps/terminal/src/config/seo.ts` | 站点名、规范地址、标题、预渲染壳的主题色（深色） |
| `apps/terminal/src/lib/theme-color.ts` | 深浅两种主题的 `<meta name="theme-color">` 颜色，供启动引导脚本、根路由 `head()` 和主题切换共用（`docs/runtime-guardrails.md` §8） |
| `apps/terminal/src/config/public-origins.ts` | 主网、测试网的规范地址与主机识别 |
| 启动播报与首页链接 | `StartupFallback`、交易页工作区、移动端外壳里的 `Loading <品牌名>...`；页头、移动页头、导航抽屉的首页链接名称 |
| 持仓盈亏分享卡 | 卡面品牌字样、下载文件名前缀 |
| `apps/website/src/config/brand.ts`、`astro.config.mjs` | 官网站点地址、交易终端地址、品牌名、客服邮箱 |

静态文件不能导入 JSON，它们由 `pnpm brand:check` 校验与 `brand.json` 一致：

- `apps/terminal/public/manifest.json` 的名称与主题色；
- `apps/terminal/public/robots.txt`、`sitemap.xml` 与 `apps/website/public/robots.txt` 只指向主域名；
- `legal/*.md` 里的链接与邮箱只使用主域名组，条款写明的法律实体等于 `name.legalEntity`；
- `brand/loader` 与 `brand/loader-supplement` 的每个文件与导出记录一致，补充符号的定义文件与记录的哈希一致。

## Logo、图标与加载动效

| 用途 | 实现 | 尺寸与规则 |
|---|---|---|
| 终端页头、导航抽屉 | `BrandLogo`（`components/brand/brand-logo.tsx`），桌面与抽屉用横版组合 `lockup`，连接后的紧凑页头与移动页头用 `mark` | 高 24 px（`h-6`）；套件规定标志与横版组合高度不低于 24 px，更小的尺寸要用 `brand/svg/mark-small`。桌面横版组合宽 90.5 px，导航余量的实测见 `docs/runtime-guardrails.md` §11 |
| 几何 | `lib/brand/logo-geometry.gen.ts`，由 `pnpm brand:sync` 从 `brand/svg` 的 on-light 文件生成 | 只生成终端实际渲染的横版组合与标志（字标与 16 网格简化标志留在 `brand/`，需要时加入 `scripts/brand.mjs` 的 `LOGO_VARIANTS`）；按 `brand.json` 的浅色 Logo 颜色识别信号、选择、字标三部分，并断言五种配色的路径与顺序完全相同；不要手改 |
| 颜色 | `--logo-signal`、`--logo-choice`、`--logo-wordmark`，浅色与深色各一组 | 组件只输出 CSS 变量，不写十六进制颜色，也不输出 `<title>`；首页链接自己的 `aria-label` 是品牌名 |
| 图表首次加载 | `BrandPageLoader`（`components/brand/brand-page-loader.tsx`），动效库的 `page-loading` | 48 px（库规定的最小尺寸）；两块面板 2000 ms 交替呼吸，最暗一帧浅色 0.78、深色 0.55；系统开启减少动态效果时显示完整的静态标志 |
| 持仓盈亏分享卡 | `lib/trade/position-pnl-share.ts` 用 `Path2D` 在画布上绘制横版组合，弹窗预览用 `BrandLogo` | 卡面在两种主题下都是深色，所以 Logo 固定用深底配色（`--position-share-logo-signal`、`--position-share-logo-choice`，字标用卡面正文色）；高 24 px；导出文件名前缀取 `BRAND_FILE_STEM`；读屏器读到的品牌名来自 `BRAND_NAME` |
| Privy 登录窗口 | `config/privy.ts` 按主题传 `appearance.logo` | `/brand/lockup-on-dark.svg`、`/brand/lockup-on-light.svg` |
| 终端图标 | `apps/terminal/public` 下的 favicon、apple-touch、PWA 图标 | 由 `pnpm brand:sync` 从 `brand/web` 复制，不要手改 |
| 官网 Logo、SVG 图标、结构化数据 Logo | `Logo.astro`、`Base.astro`、`config/seo.ts` 直接导入 `brand/` 下的文件（`?url`） | 构建产物带哈希或内联，避免线上旧文件的长期缓存；`favicon.ico` 与 apple-touch 由同步脚本复制到 `apps/website/public` |

链接预览卡（OG）由 `designs/og-cards/cards.html` 生成：深色设计令牌配色、内嵌横版组合与标志的轮廓路径、仓库自带的开源授权字体；终端卡沿用原中文产品描述（字体子集只含这些字），官网卡用口号的英文版（看清市场用信号薄荷色、自主判断用选择琥珀色）。生成与校验见 `designs/og-cards/README.md`。

设计方没有交付、由脚本派生的文件有三个，都由 `pnpm brand:derive-icons` 生成：

- `brand/web/icon.svg`：按设计方 `icon-512.png` 量出的几何（472 px 圆角方、内缩 20 px、圆角 106 px、标志高 60.2%）绘制的矢量图标；与原图逐像素比较的平均通道差为 0.11。
- `brand/web/icon-maskable-192.png`：与 `icon-maskable-512.png` 相同构图（满版底色、标志高 60.2%）在 Chromium 中按 192 px 渲染；与 512 原图缩小后的平均通道差为 0.2。
- `brand/web/email-logo.png`：Privy 登录验证码邮件的 Logo。360×180 白底，浅底横版组合占宽 80% 居中，在 Chromium 中渲染；`pnpm brand:sync` 复制到终端的 `/brand/email-logo.png`。

## 状态动效

用户发起的动作（下单、资金操作、签名握手、复制）用动效库的状态符号和插图表示状态与结果；被动的数据加载、懒加载占位和图表重建仍用原来的中性转圈，不新增被动提示（`docs/mobile-data-presentation.md`）。决定与取舍见 [ADR 0029](adr/0029-brand-status-motion.md)。

| 组成 | 实现 | 规则 |
|---|---|---|
| 几何与关键帧 | `lib/brand/status-glyph.gen.ts`（类型与状态符号，随通知进启动闭包）、`button-loading.gen.ts`（按钮加载，随交易面板进启动闭包）、`brand-motion.gen.ts`（状态插图与复制反馈，只随弹层懒加载）和 `status-motion.gen.css`，由 `pnpm brand:sync`（`scripts/brand-status-motion.mjs`）从 `brand/loader` 与 `brand/loader-supplement` 的 on-light 文件生成 | 按加载层级拆成三个模块，每个符号与插图一个具名导出；关键帧和每个动效的规则逐字取自导出文件，共用规则只保留用到的部分；生成器核对深浅两套文件几何一致、插图里的标志与 Logo 套件完全相同；不要手改 |
| 状态符号 | `StatusGlyph`（`components/brand/status-glyph.tsx`） | 16 px 用 16 网格，大于 18 px 用 24 网格；通知 16 px，资金恢复提醒 20 px |
| 插图 | `BrandMotion`（`components/brand/brand-motion.tsx`） | 进行中 64 px（`wallet-awaiting`、`submitting`、`awaiting-result`），结果至少 48 px；复制反馈 `copy-feedback` 16 px |
| 按钮加载 | `ButtonLoading`（`components/brand/button-loading.tsx`） | 16 px、mono（`currentColor`），只用于钱包握手、安装、扫码等已点击的按钮；设计方配色放在实心按钮上对比度只有 1.28:1（深色）和 2.83:1（浅色） |
| 颜色 | `styles.css` 按 `data-tone` 映射 | success、error、attention、neutral、info 分别取 `--text-success`、`--text-error`、`--text-warning`、`--text-weak`、`--text-info`，与 Sonner 各类型通知的文字色一致；进行中的循环从不用成功色（成功色的循环读起来像「已完成」），所以设计方画成成功色的 `submitting` 在终端里是中性色；镂空记号取 `--on-action`；插图里的标志取 `--logo-*`；循环最暗帧 `--srm-floor` 跟随 `--logo-loader-floor`（浅色 0.78、深色 0.55），mono 固定 0.78 |
| 无障碍 | 组件默认 `aria-hidden`，单独出现时由调用方传 `label`（已翻译） | 不输出 `<title>`；循环中的组件带 `data-loading-indicator`，测试用 `harness/loading-indicator.ts` 的选择器判断「没有进度」 |
| 减少动态效果 | 生成的 `@media (prefers-reduced-motion:reduce){.srm .srm-anim{animation:none!important}}` 加全局规则 | 直接显示终态几何；动画结束不触发任何业务状态 |

状态对应关系：

| 场景 | 符号或插图 |
|---|---|
| 订单通知：提交中 / 确认中 / 未确认 / 部分成交 / 成功（含已受理）/ 已取消 / 失败 | `submitting` / `pending` / `unknown` / `partial`（只用于已核实的部分成交：有交易所回包的部分成交，或按成交计数且没有错误；只是部分受理、或带拒绝、撤销、未知子项的批次用 `warning`）/ `success` / `cancelled` / `error` |
| Sonner：success / info / warning / error / loading | `success` / `info` / `warning` / `error` / `pending` |
| 资金与 Earn「状态未知」通知、待核验的资金操作提醒 | `unknown`（调用方传 `icon`，从不显示成 error） |
| 充值状态页：等待钱包 / 链上确认与转发 / 已提交 / 钱包连接失败 | `wallet-awaiting` / `awaiting-result` / `success` / `error` |
| 金库弹层：授权并提交 / 已提交与对账 / 结果未知 | `submitting` / `awaiting-result` / `unknown`（此前误用红色） |
| API 钱包弹层：等待外部钱包 / 邮箱钱包签名与提交 / 核验；成功 / 用户拒签 / 交易所拒绝 / 未知 | `wallet-awaiting` / `submitting` / `awaiting-result`；`success` / `cancelled` / `error` / `unknown` |
| 跨链执行：等待钱包 / 已有交易哈希 | `wallet-awaiting` / `awaiting-result` |

`status-motion-surface-contract.test.ts` 列出仍保留转圈的文件、数量和理由，新增转圈或回退已接入的界面都会失败；`status-motion-contract.test.ts` 核对生成结果最新、没有字面颜色与 `<title>`、语调映射与减少动态效果规则；`tests/browser/brand-surfaces.pw.ts` 在真实浏览器里核对 Logo、加载器、符号、插图与通知图标的实际填色和动画（CI 跑 Chromium，本地可加 WebKit 与 Firefox）。

## 设计稿

`designs/mockups.pen` 是从上游导入的早期探索稿，不是视觉或令牌来源（颜色与尺寸以 `brand/brand.json`、`brand/tokens` 和代码为准）。产品名标签已经是 Sairn；以下内容保留原样，需要在 pen.dev 里手工处理：

- 三个导航栏里 32×28 的 `HT` 字母徽标方块（`o15AR`、`WMxsj`、`XJZWk`）和三张探索稿里的 `A` 方块，应换成 Sairn 横版组合：高 24 px、宽约 90.5 px，三条路径（信号、选择、字标）取自 `brand/svg/lockup/sairn-lockup-on-*.svg`，共用同一个 viewBox；颜色用按主题区分的三个变量（浅色 `#176B64` / `#99621F` / `#08262E`，深色 `#86E5D3` / `#E6B766` / `#FFFFFF`）。组件实例 `8GFpt` 按 id 覆盖了徽标位置，交给 pen.dev 处理。
- 当前 pen.dev 打开 2.10 格式会整份转换为新格式。先单独提交一次「打开即保存」的转换，再提交徽标改动，差异才可审阅。
- 色板仍是上游的蓝紫色（`#4c64d9` / `#b2bcf1`）。若要与产品对齐，按产品的拆分把 `text-brand`、`icon-brand`、焦点映射到 `--signal`，`fill-brand-strong`、`fill-selected` 等映射到中性的 `--action`，作为单独的设计任务处理。

## 界面品牌色

`--signal` 是 Sairn 的强调色：浅色主题青色 `#176b64`（悬停 `#0f524d`），深色主题薄荷色 `#86e5d3`（悬停 `#a8eee1`）；焦点环等于 `--signal`。主按钮的 `--action` 保持黑白中性，不用品牌色，以免和绿色的买入按钮混淆。等待中的转圈用中性色 `text-fg-muted`，因为薄荷色在设计令牌里同时是「成功」色。终端深色画布仍是 `#0F1A1F`，`#0A3038` 只用作图标底色。浏览器工具栏与状态栏取色的 `<meta name="theme-color">` 跟随应用里选的主题：深色 `#0F1A1F`（深色 `--bg-base`），浅色 `#FFFFFF`（浅色 `--bg-base`，也是页头底色）；manifest 只能有一个 `theme_color`，保持深色。

| 组合 | 对比度 |
|---|---|
| 深色 `#86e5d3` 在 `#0f1a1f` / `#212d33` 上 | 11.92 / 9.52 |
| 浅色 `#176b64` 在 `#ffffff` / `#f5f6fa` 上 | 6.32 / 5.85 |

## 校验

| 命令 | 覆盖 |
|---|---|
| `pnpm brand:check` | 上面的静态文件与动效导出、几何模块与同步的公共文件是否最新、图标 PNG 的尺寸与不透明度；同时校验 `brand.json` 的结构（域名小写、子域名属于同一顶级域、邮箱使用主域名、主机不重复） |
| `pnpm brand:sync` | 重新生成 Logo 几何、状态动效模块与样式，复制公共文件，然后执行同样的检查；不会重新导出 `brand/loader`、`brand/loader-supplement/glyphs`、`brand/tokens`（用 `pnpm brand:export-motion`）或重新派生图标与邮件 Logo（用 `pnpm brand:derive-icons`） |
| `node --test tests/brand-cross-app.test.mjs` | `packages/ui`、终端、官网三份样式表的品牌色等于 `brand.json` |
| `pnpm test:brand` | 以上两项、OG 卡、终端品牌契约测试与官网测试 |
| `pnpm brand:export-motion`、`node scripts/brand-export-motion.mjs --check` | 重新导出动效与补充符号，并确认导出可以复现（需要 Chromium，不在 CI 中运行） |
| `pnpm --dir apps/terminal test:browser:brand-surfaces` | 真实浏览器中的品牌表面填色与动画；`BRAND_SURFACES_ENGINES=webkit,firefox`（Firefox 另需 `BRAND_SURFACES_FIREFOX` 指向可执行文件）加测其他引擎 |

CI 中，`Terminal Tests` 在 `brand/**`、`legal/**` 变化时运行 `pnpm brand:check` 和终端品牌测试组；`Website and Brand` 运行 `pnpm test:brand`。路径与测试清单由 `scripts/ci-workflows.test.mjs` 固定。

## 域名切换到 sairn.ai

代码已经以 `sairn.ai` 为主域名：SEO、站点地图、`robots.txt`、法律文本、推荐链接和官网都指向 `app.sairn.ai`、`testnet.sairn.ai`、`sairn.ai`，客服邮箱是 `support@sairn.ai`。`gatu.ai` 在 `brand.json` 的 `domains.legacy` 里继续被识别，所以新代码先部署到旧域名上也不会把测试网当成主网，旧域名上的推荐链接照常可用，切换网络时留在旧域名组内。

> **2026-10-01 更新**：用户决定旧域名直接下线、不设并存期也不做 301。下面的上线顺序（尤其第 6 步长期并存、第 8 步 301）已被 [gatu.ai 下线、切换到 sairn.ai](sairn-domain-cutover-plan.md) 取代，执行以该方案为准（2026-10-02 已上线，决策见 [ADR 0032](adr/0032-gatu-offline-cutover-to-sairn.md)）；本节保留作为原方案记录。同日用户还决定 `gatu.ai` 不永久续费（已注册到 2028-05-06，到期前按该方案的「到期前清单」处理后再定），第 1 步「保持自动续费」不再适用；gatu.ai 的邮件与 SES 等品牌替换完成后再处理。

上线顺序（DNS 永远最后切，每一步用权威 DNS 和 AWS API 核对）：

1. 注册并续费 `sairn.ai`；旧域名 `gatu.ai` 保持自动续费（HSTS 一年，旧 origin 的浏览器存储里可能留有 Agent 私钥）。2026-10-01 复查：WHOIS 显示 `sairn.ai` 于 11:40:28 UTC 经 Cloudflare 注册，`.ai` 权威服务器已把它委派给 Cloudflare 名称服务器，还没有 A、MX 记录；归属账号以 Cloudflare 后台为准，仓库里没有记录。
2. Cloudflare 建 `sairn.ai` 区（DNS-only），配置邮件 MX、SPF、DKIM、DMARC，确认 `support@sairn.ai` 可以收信。
3. ACM（us-east-1）申请证书，状态为 `ISSUED` 后再继续。一个分发只能挂一张证书，而第 6 步要在同一个分发上并存新旧别名，所以每张证书都要同时覆盖新旧两组：主网终端分发 `app.sairn.ai` 与 `app.gatu.ai`，测试网分发 `testnet.sairn.ai` 与 `testnet.gatu.ai`，官网分发 `sairn.ai`、`www.sairn.ai`、`gatu.ai`、`www.gatu.ai`（`deploy/website/README.md`）。只申请新主机名的证书会让旧域名在换证书后出现证书不匹配。
4. Privy 后台的 Allowed origins **添加** `https://app.sairn.ai`、`https://testnet.sairn.ai`，旧的先保留；应用名改为 Sairn；UI components → Logo 填 `https://app.sairn.ai/brand/email-logo.png`。代码里的 `appearance.logo` 只覆盖登录窗口，登录验证码邮件用的是后台这张 Logo，Privy 要求 `.png`（不接受 SVG），建议 2:1、180×90（这张是 2 倍尺寸的 360×180，白底，深色邮件客户端里也看得清）。
5. 按 `deploy/cloudfront/README.md` 顶部的说明更新 API 源站请求策略的转发头（`X-Sairn-Forwarded-Host`）。
6. 发布终端与官网；用 `deploy.mjs aliases` 给分发**同时**挂新旧别名并换上新证书，等分发状态 `Deployed`。
7. 用 `curl --resolve` 预验证新主机名（`deploy.mjs verify --origin https://app.sairn.ai`、测试网同理、`csp-coverage`），再在 Cloudflare 给新主机名加 CNAME，最后用公网 DNS 复验。
8. 确认新域名稳定后，把 `gatu.ai` 跳转到 `sairn.ai`（保留路径和查询串），在 Search Console 提交地址更改，再从 `brand.json` 的 `domains.legacy` 删掉旧组，并从 Privy 移除旧 origin。

换域名等于换浏览器存储的 origin：旧域名上的设置、登录状态、Stay Connected 的 Agent 私钥和进行中操作的本地记录都不会带到新域名。目前没有用户，这一步不需要迁移这些数据；外部钱包在新域名上需要重新授权（Agent 槽位名也已改为 `sairn`）。

## 改名时的约定

- 名称、域名、邮箱、颜色只改 `brand/brand.json`，再按 `pnpm brand:check` 与测试的提示更新静态文件。
- 测试里的品牌字面量（例如启动播报的渲染结果、manifest 名称）保留为独立断言，不改成「等于 `brand.json`」，这样改名时测试会明确列出所有受影响的输出。
- 不依赖品牌名定位元素：首页链接带 `data-brand-home-link`，测试与测量脚本用它定位，再单独断言可访问名称。
