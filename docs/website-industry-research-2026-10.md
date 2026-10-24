# 官网行业调研（2026-10）

状态：历史记录（一次性调研快照，供[官网重建规划](website-rebuild-plan.md)引用；不是产品要求，也不代表已实施）。调研日期：2026-10-24，由 Agent 执行；本文整理日期：2026-10-24。范围：约 40 个站点（永续 DEX、Hyperliquid 前端、钱包、交易所含日本、现代产品站标杆）、动效与视觉技术、官网技术栈选项，以及调研时 `apps/website` 的资产与约束盘点。

本文是摘要，不是全文。任务记录是[官网行业调研与重建规划](work-memory/sessions/2026-10-24-website-research-and-rebuild-plan.md)。原始证据（逐站字段 `research-web.json`、英文摘要 `research-digest.md`、Playwright 的 JSON 输出与采集脚本）脱敏后复制在本机 Git 忽略的 `.worklog/2026-10-24/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-website-research/`，附 SHA-256 清单，不进远端；截图没有逐张检查，按工作记忆规则没有复制，只在清单里列出文件名。本文的每条事实都来自那份证据，标出所属站点或来源，未逐条复核。后续引用前，凡是版本号、浏览器支持、价格和页面重量都要重新查当前资料。

## 1 方法与限制

### 做了什么

- 取证方式：
  - 用 curl 抓取各站线上 HTML、JS 与 CSS，按字符串特征判断框架与动效库；
  - 用无头 Chromium（Playwright）渲染部分站点，记录请求数、传输量、LCP、CLS 和运行中的动画；多为 1440×900、不限速的单次运行；
  - 被拦截或无法直取的站点改用 Wayback Machine 快照：Binance（2026-10-21）、Coinbase Advanced（2026-10-06）、bitFlyer ja（2026-10-03）、OKX global（2026-10-11）、Bybit（2026-10-23）；
  - 动效库体积：从 npm registry 取包，在本地用 esbuild 压缩、`brotli -q 11` 测量；
  - 浏览器支持：MDN browser-compat-data 8.1.7（数据日期 2026-10-22）、web-features 与 caniuse（2026-10-22）；
  - Hyperliquid 限频：读取官方文档《Rate limits and user limits》；CORS 与线上 sairn.ai 的响应头用 curl 实测。
- 仓库盘点：读取 `apps/website`、`brand/`、`legal/`、部署手册与相关 ADR，结论列在第 8 节。

### 限制

- 本次运行中 WebFetch 与 WebSearch 因模型错误失败（Hyperliquid 前端、交易所、现代产品站三个分段的取证说明都记录了这一点）。竞品因此从已知名单出发，没有用搜索补全；名单可能漏掉新站。
- 被拦截而未绕过：Binance（AWS WAF）、Coinbase（Cloudflare）、bitFlyer（连接被挂起）、Axiom（Cloudflare 挑战），Bybit 拒绝无头加载。请求来自美国 IP，OKX 因此跳到美国站。
- 重量口径不统一：有的是浏览器实测传输量，有的是 `content-length` 声明值（只能当下限），有的是未压缩体积；现代产品站一段只统计初始 HTML 引用的 JS/CSS 压缩体积，不含图片，也不是浏览器瀑布图，且该段的动效描述来自代码与标记，没有渲染或截图。第 3 节表格的「重量」列写明了口径。
- 「减少动态效果」的结论来自无头浏览器的一次模拟，不等于真机行为；单次不限速运行也不是现场数据（CrUX 或 RUM）。
- 标「先验知识」的内容来自 Agent 已有知识，本次没有核实；标「未核实」的是证据不足的推断。
- 第 4 节「24 个首页没有使用 `animation-timeline`」只检查了 HTML 和每站前 40 个脚本与样式表，看不到懒加载的 CSS。

## 2 分段摘要

| 分段 | 站点 | 主要发现 |
| --- | --- | --- |
| Hyperliquid 与永续 DEX | Hyperliquid、Hyper Foundation、dYdX、GMX、Aevo、Lighter、Paradex、Drift、Aster | 9 个营销站里 6 个是 Framer 或 Webflow 搭建。没有一个首页运行实时 WebGL 或 three.js 场景，「3D」都是预渲染视频（1.6–39.6 MB）或静态渲染图。实时协议数据（24h 成交量、OI、用户数、TPS、行情条）是主要的证明手段，但经常当众出错，没有一家失败时隐藏数据。领头者 Hyperliquid 改成了浅色编辑风（#f8f9f9、深绿 #03211c、薄荷 #97fce3、Teodor 衬线）。只有 Aster 有日语，且首屏中日混排。页面普遍很重。 |
| Hyperliquid 前端与终端 | Based、Liquid、Dexari、Insilico、pvp.trade、Lootbase、Axiom、Hyperdash | 消费类品牌的营销站多是 Next.js on Vercel 或 Framer；专业终端（Insilico、Hyperdash、Axiom）直接把应用当首页。动效克制、以产品为主：真实界面的短循环、CSS 关键帧、少量 GSAP 或 Lenis。只有 Insilico 在首屏嵌入实时图表与订单簿，WebGL 只作氛围背景。没有一家展示可在链上核对的数字（builder code 成交量或费用）。只有 Liquid 提供完整日语。 |
| 钱包与消费级 | Phantom、Rabby、Rainbow、Uniswap、Jupiter、Base、Privy | 7 个里 5 个以真实产品界面作首屏。DeFi 品牌把营销站并进应用（Uniswap、Jupiter），代价是首访性能。实时数据本身就是动效（滚动数字、带实时涨跌的币标）。动效库小而专，7 个都没用 GSAP、Lenis 或滚动劫持。普遍的问题是重量；只有 Rainbow 在减少动态时停止首屏动效。 |
| 交易所（含日本） | Binance、OKX、Bybit、Kraken、Kraken Pro、Coinbase Advanced、bitFlyer、Coincheck、bitbank | 9 个都没用 WebGL、Three.js、Spline、Rive、GSAP 或 Lenis。「现代感」来自实时数据、真实产品录像、清晰字体和快速注册。首屏通常是转化表单（内联邮箱输入、SSO、二维码）。日本站有固定惯例：每条主张加 ※ 脚注、3 步开户、【注意事项（よくお読みください）】、页脚登记号、正文 14–16px 与 1.75–1.8 行高；bitFlyer 与 bitbank 的标题是图片，没有文字 H1。 |
| 现代产品站标杆 | Linear、Vercel、Stripe、Raycast、Midday、Resend、Moto、EverSwap | 产品界面以真实组件重建作首屏。每站有一个可降级的标志性实时图形（Vercel 在 Worker 里渲染着色器并有静态回退）。6 个产品站都按时间或进入视口驱动动效，滚动拖拽加 Lenis 只出现在两个获奖代理商站上，而且后者几乎不处理减少动态。证明手段是可解释、带时间的数字。只有 Stripe 做了日语本地化。Midday 是现官网的参照，也是「传统感」的来源。 |

## 3 站点一览

列说明：「技术栈」后的置信度来自证据字段，未标注的为高置信。「重量」写明口径：「加载」指无头浏览器实测传输量；「声明」指 `content-length` 合计（下限）；「未压缩」指解压后的体积；「压缩 JS/CSS」指 curl 统计的初始 HTML 引用资源。

### Hyperliquid 与永续 DEX

| 站点 | 技术栈 | 动效与视觉手法 | 首屏信息 | 证明元素 | 本地化 | 重量 |
| --- | --- | --- | --- | --- | --- | --- |
| [Hyperliquid](https://hyperliquid.xyz/)（2026-08 改版） | Framer 导出后自托管，加手写 JS 与 CSS 补丁 | 时间驱动：Framer appear 入场；自动循环的薄荷粒子 MP4（9.1 MB）与第二段 MP4（3 MB）；粒子 GIF；实时价格跑马灯（悬停暂停）；巨型字标页脚。无可见 WebGL 场景 | 'Infrastructure to House All Finance'；单一 TRADE；浅色 #f8f9f9、深绿 #03211c、薄荷 #97fce3，Teodor Light 衬线配 ABC Diatype | 客户端拉取的网络统计：`globalStats`（未见文档）、`metaAndAssetCtxs`、explorer `blockList` 算 TPS；静态 HTML 先显示 'X.X M' 占位。机构 Logo 条 | 仅英文，无 hreflang，`/ja` 返回 403 | 加载约 12.6 MB，滚动后 15.6 MB，98 个请求 |
| [Hyper Foundation](https://hyperfoundation.org/) | Create React App 客户端 SPA + Chakra UI；首页打包 Privy、WalletConnect、wagmi | 全屏加载闸门，等 39.6 MB 视频整段下载完（或 5 s 超时）才显示；GIF；等距 SVG 图解 | 'The Blockchain To House All Finance'；Trade、Build | 实时统计（精确用户数 2,825,639）；外链前的第三方网站提示；版权年份停在 2025 | 仅英文 | 加载约 1.8 MB，视频完成后 41.1 MB |
| [dYdX](https://www.dydx.xyz/) | Webflow + GSAP 3.15（ScrollTrigger、SplitText 等）、Swiper、jQuery、Intellimize | Webflow IX3 文本拆分与滚动显现；静态 3D 风格渲染图（文件名疑似 AI 生成，未核实）；无视频、canvas 或 WebGL | 'DeFi's Pro Trading Platform'；Get Started（每处带活动 UTM）、View Rewards | 静态统计（$1.6T 累计成交等）；同页「99 Markets」与「200+ markets」矛盾；CEX/DEX/dYdX 对比表 | 营销站仅英文（`/ja`、`/zh` 404） | 加载约 1.5 MB，78 个请求，约 11 个是追踪像素 |
| [GMX](https://gmx.io/) | Vite + React 客户端 SPA（开源仓库的 landing 目录） | framer-motion 轮换标题（每 2.5 s，隐藏标签页时暂停）；预渲染的模糊渐变 PNG（避开 Safari 实时滤镜）；Logo 跑马灯；未见减少动态处理 | 'Trade 100+ crypto tokens from your wallet'（中间短语轮换） | 实时交易者数、OI、成交量、APR；APR 漏出 'Accumulating...'；推文截图 | 落地页仅英文（字符串已用 Lingui 包裹但未启用） | 加载约 2.1 MB，滚动后 4.4 MB；JS 1.09 MB |
| [Aevo](https://www.aevo.xyz/) | Framer + iframe：Vercel 与 AWS Lambda 托管的行情卡（内用 Lightweight Charts 4.0.1） | Framer 入场；7.6 MB 视频面板（无头下未自动播放）；实时行情条与迷你走势卡，每张卡深链到市场页 | 'Trade Options, Perps and Strategies. All in One Place.' | 成交量、OI、TPS、延迟；Ribbon 时期的金库数据；投资人与团队履历 | 仅英文（`/ja` 404） | 加载约 764 KB（视频未播放，播放另加 7.6 MB） |
| [Lighter](https://lighter.xyz/) | Framer + 自定义代码组件（canvas 2D ASCII 图案、文字乱码效果）+ WebM | 首屏文字 scramble 轮换资产类别；canvas 2D 程序化 ASCII 背景；动画 ZK 流水线图（订单经队列、撮合、风控、证明到以太坊）；首屏 WebM 3.7 MB、页脚 Logo WebM 2.1 MB | 'TRADE [STOCKS / COMMODITIES / ...] WITH ZERO FEES' | 投资人 Logo、白皮书与审计链接、带实时状态点的状态页、'OFFICIAL APP LINKS' 防钓鱼区块；页面上没有实时成交数据 | 仅英文（`/ja` 404） | 加载约 4.7 MB，滚动后 6.8 MB |
| [Paradex](https://paradex.trade/) | Webflow；GSAP 与 jQuery 各加载两次；浏览器内用 `@babel/standalone` 编译 JSX | 轮换词；点阵世界地图视频（726 KB）；产品演示 WebM（2.7 MB + 2.6 MB）；全市场跑马灯 | 'Zero-fee' + 轮换资产类别 | 实时 24h 成交量、OI、TVL；用户数卡在 '...'；Paradigm 孵化 | 仅英文（`/ja` 404） | 加载约 9.1 MB；680 KB 的全市场 JSON 渲染出约 52,000 行文本 |
| [Drift](https://www.drift.trade/) | Webflow + countUp.js、Lottie、Weglot、PostHog（两次）、PerimeterX | 进入视口时 countUp（仅桌面）；Lottie；Logo 跑马灯；静态光线图 | 'Built for Traders. Engineered for Execution.'；Start Trading 直达 BTC-PERP；二维码 | 带报告链接的审计 Logo、投资人 Logo、实时统计；实测显示 '0.00% APY' 与 '$826B' 存款；4 月事故后首页仍称「最可靠」 | en、ko、zh（Weglot 子域；ko 子域一次探测 TLS 握手失败） | 加载约 7.9 MB，114 个请求 |
| [Aster](https://www.asterdex.com/en) | TanStack Start 流式 SSR + React + Vite（rolldown） | 预渲染的 3D 金环视频（1.6 MB，带海报）；其余为 CSS 关键帧：玻璃卡光效、漂浮的真实界面碎片、模拟点击的手机 | 'The Frontier of On-chain Trading' | 请求时服务端渲染进 HTML 的大数字（$5.11T 成交、50.77M 用户等）；生态 Logo | 多语言前缀含 `/ja`，但首屏中日混排（'The Frontier の / オンチェーン取引'）、部分直译；html lang 为空、无 hreflang | 加载约 4.4 MB，76 个请求 |

### Hyperliquid 前端与终端

| 站点 | 技术栈 | 动效与视觉手法 | 首屏信息 | 证明元素 | 本地化 | 重量 |
| --- | --- | --- | --- | --- | --- | --- |
| [Based](https://based.one) | Next.js App Router on Vercel；framer-motion；Lenis 1.3.16；PostHog | 首屏视频（webm 213 KB、mp4 582 KB）；Lenis 上叠 `whileInView` 显现；SVG 画线与资金流动画；首页无实时数据 | 视觉标题 'Trade Everything Spend Everywhere'，页面 H1 是另一句 'Trade Equities, Crypto and Commodities. 24/7. Permissionlessly.' | '>$44B' 成交量、'100k+ users'、投资人 Logo；资产类别标签深链到市场 | en + zh-CN（hreflang、x-default） | HTML 24 KB（br）；初始 JS 约 1.03 MB（未压缩） |
| [Liquid](https://www.liquid.trade) | Next.js App Router（RSC、ISR）on Vercel + Cloudflare；Tailwind；Radix | 几乎全是 CSS 关键帧：分步显现、双向市场跑马灯、杠杆条、光线、闪光字；`startViewTransition` | 'Trade across markets, from anywhere.'；'Up to 50x multipliers' | '$5B+'、'85,000+ traders'、带文章链接的媒体 Logo；`/markets` 页用 ISR 预渲染价格快照；每个 CTA 带 `cta_slot` UTM | 10 种语言子路径含 `/ja`（全服务端渲染），hreflang 齐全 | HTML 38 KB；初始 JS 约 800 KB（未压缩） |
| [Dexari](https://dexari.com) | Next.js App Router + Cloudflare；GSAP ScrollTrigger；Turnkey；reCAPTCHA | 五段 .mov 手机录屏（合计约 4.1 MB）；Logo 跑马灯；无实时数据 | 'Trade perps onchain. Anytime. Anywhere.' | 'Powered by Hyperliquid / Secured by Turnkey'；合作方 Logo；依赖 KOL 的投资墙；路线图的 2025 年日期仍写 coming soon，版权停在 2025；页面写 No KYC 与 40x | 仅英文 | HTML 14 KB；JS 约 803 KB（未压缩）；视频约 4.1 MB |
| [Insilico Terminal](https://insilicoterminal.com) | Vue 3 SPA（hash 路由）+ PWA；手写 WebGL 着色器 | 指针涟漪点阵着色器（几 KB，有 no-gpu 回退、减少动态检查、卸载时释放上下文）；首屏嵌入实时迷你终端（图表 + 订单簿）；'hole open' 过渡进入终端 | 'The Original Crypto Trading Terminal' | 首屏实时产品是最强证据；meta 写 '$800B+'，页面写 '$170B+' 年成交，不一致 | 英文 | HTML 3.2 KB，但要等 3.1 MB（未压缩）的应用包；HTML 里 H1 为空 |
| [pvp.trade](https://pvp.trade) | Next.js 静态导出；three.js + Vanta FOG；GSAP | 全屏雾效着色器；没有产品图、视频或数据 | 'PVP. TRADE'（产品是 Telegram 机器人） | 只有 'Powered by Hyperliquid' | 仅英文 | HTML 3.5 KB；JS 约 1.3 MB（未压缩） |
| [Lootbase](https://lootbase.com) | Framer；Vimeo 托管视频 | Framer appear；1080p 手机演示视频 3.1 MB | 'Use [Hyperliquid] on your phone'；'Crypto and memes with up to 40x leverage.'；meta 'no VPN required' | 几乎没有 | 仅英文 | HTML 22 KB；视频 3.1 MB |
| [Axiom](https://axiom.trade)（中等置信） | React SPA（Vite + Rolldown）on Vercel，前置 Cloudflare 机器人挑战 | 未能核实（落地页是应用内懒加载路由） | 服务端 HTML 只有标题 'Axiom' 与 meta 'The Gateway to DeFi' | 不可观测；YC 背景属先验知识，未核实 | 有翻译代理 `translate.axiom.trade`，语言未核实 | 存档 HTML 163 KB；落地页之前约 850 KB 启动 JS |
| [Hyperdash](https://hyperdash.com) | TanStack Start SSR + React Query + Apollo + framer-motion on Vercel；GTM、Meta Pixel | 根路由就是终端（强平与止损热力图、顶级交易者、订单簿）；按资产或新闻做的增长落地页用 MP4 录屏 | 标题 'Hyperdash \| Trading terminal for Hyperliquid' | 数据密集的产品本身；FAQ 写明不是投资建议 | 观察到英文；有 locale cookie | HTML 6.8 KB；终端主包 4.4 MB（未压缩） |

### 钱包与消费级

| 站点 | 技术栈 | 动效与视觉手法 | 首屏信息 | 证明元素 | 本地化 | 重量 |
| --- | --- | --- | --- | --- | --- | --- |
| [Phantom](https://phantom.com/) | Remix / React Router SSR + Vite；dotLottie（WASM）、Rive；Sanity；OneTrust、Datadog | 首屏圆角卡里 7.2 MB 的循环 mp4（`preload=auto`）；每张卡片一段 mp4；标题词里嵌 Lottie；减少动态时首屏仍在播放 | 'Your home for trading crypto, predictions, perps, and more' | '20+ million users'；页脚系统状态徽标 | i18n 配置列出 30 种语言，营销文案仍是英文；按 Accept-Language 把 html lang 设为 ja，与内容不符 | 加载约 2.7 MB；LCP 约 2.8 s；滚动到底约 73 MB 媒体 |
| [Rabby](https://rabby.io/) | 客户端 React SPA（Vite）+ 遗留 jQuery；CSP meta | 视频卡跑马灯（悬停暂停、可拖动）；推文墙；无 canvas 或 WebGL | 'Your Go-to Wallet for Ethereum and EVM' | 具名审计（SlowMist、Least Authority）、开源、漏洞赏金、公开的链状态面板 | 首页仅英文 | 加载约 2.2 MB；LCP 约 3.6 s；滚动拉取约 10.4 MB mp4 |
| [Rainbow](https://rainbow.me/) | 手写原生 JS（一个约 24 KB 模块）+ Vite + SCSS；原生 WebGL 1 GLSL | 吸顶手机框随滚动换屏；按词错开的标题；`animation-timeline: view()` 放在 `@supports` 后并有 IntersectionObserver 回退；页脚极光着色器（仅桌面、低功耗）；桌面二维码。唯一在减少动态时停止首屏动效的钱包站 | 'The easiest way to trade [Nvidia] from your phone'（轮换市场词，另附无障碍静态句） | 很少；标着 'Live Data' 的屏幕是静态 PNG | 仅英文 | JS 约 197 KB（站点自身约 25 KB）；图片约 9 MB 全部提前加载；LCP 约 5.4 s |
| [Uniswap](https://uniswap.org/)（跳转 app.uniswap.org） | React 19.2 SPA + Vite 8（Rolldown）；Rive；Privy 3.17 | 首屏是能用的兑换组件，周围漂浮带 24h 涨跌的模糊币标；滚动数字统计配实时点；减少动态时仍在动 | 'Swap anytime, anywhere.' | 协议统计（TVL 加载时显示 '-'）、4.8 评分；'Create account' 走 Privy 内嵌钱包 | 14 种语言含 ja-JP，但没有语言 URL 与 hreflang | JS 约 5.2 MB；加载约 7.4 MB；LCP 约 14 s |
| [Jupiter](https://jup.ag/) | TanStack Start SSR + Vite（Rolldown）+ Lingui；TradingView | 没有营销首屏，主页就是应用；实时数据模块；约 60 组 CSS 关键帧 | 'The Home of Onchain Finance' | 实时金库供应量、APY、市值、预测市场成交 | en + zh-Hans（`/zh`） | 加载约 3.7 MB；LCP 约 5.6 s |
| [Base](https://www.base.org/) | Next.js App Router；three.js r183 / React Three Fiber 实例化；NumberFlow；OneTrust、Amplitude | 标题周围淡彩 WebGL 蜡烛粒子；NumberFlow 滚动数字；小 webm；减少动态时首屏仍在动（JS 里有 7 处检查） | 'The blockchain for global finance.' | Coinbase 背书、'1,000+ businesses' Logo、四个指标（是否实时未核实）、状态徽标 | 仅英文 | 加载约 5.3 MB，其中字体约 3.4 MB（27 个文件）；LCP 约 3.4 s |
| [Privy](https://www.privy.io/) | Framer；HubSpot、Apollo、DoubleClick、TrustArc | Framer appear；Logo 滚动条；静态产品拼贴 | 'Build products that hold, move, and grow digital assets' | Stripe 旗下；Logo 条以 Hyperliquid 打头，并有 Hyperliquid 案例；160M+ 账户等 | 仅英文（无 html lang） | HTML 80 KB；JS 约 1 MB；图片约 2.4 MB；LCP 约 4.1 s |

### 交易所（含日本）

| 站点 | 技术栈 | 动效与视觉手法 | 首屏信息 | 证明元素 | 本地化 | 重量 |
| --- | --- | --- | --- | --- | --- | --- |
| [Binance](https://www.binance.com/en) | 自研 React SSR；CountUp、Swiper、WebSocket 价格 SDK；AWS WAF | 克制：标题就是实时用户计数；WebSocket 价格卡；轮播 | '334,314,811 USERS TRUST US' / 'The World’s Leading Cryptocurrency Exchange' | No.1 标签、SAFU 储备并印出 BTC 地址、福布斯与财富徽标 | 约 100 个 hreflang，含 ja 与 en-JP（日本居民由 Binance Japan 服务属先验知识） | 存档 HTML 438 KB；WAF 阻止实测 |
| [OKX](https://www.okx.com/) | 自研 okfe 微前端 SSR；React 19.3 UMD | 极少：静态手机图；WebSocket 价格 | 全球版 'Faster, better, stronger than your average crypto exchange'；新加坡版首屏在客户端换成 'The Crypto Platform You Can Trust' | 70M traders、储备证明、地区牌照写在首屏或页脚 | 约 60 个 hreflang 加地区站，按 IP 强制跳转；无日语 | `/en-sg` 136 个请求，约 1.1 MB（声明） |
| [Bybit](https://www.bybit.com/en/) | Next.js App Router；Splide、lottie-web、HLS 播放器 | 少量：跑马灯、骨架屏、Lottie、轮播；WebSocket 行情卡与 K 线 | 'One place to grow, spend, and move your money.' | 70M+ 用户、1:1 储备、赞助与奖项 | `[locale]` 路由含 ja-JP；包里有日本合作方相关字符串（关系未核实） | HTML 97 KB（未压缩）；chunk 合计约 2.4 MB（未压缩）；无头加载被拒 |
| [Kraken](https://www.kraken.com/) | React SSR + loadable + Sanity；Kraken Design System | CSS 关键帧在进入视口时触发：逐行打字的 CLI 终端、资产跑马灯、数字滚轮；尊重减少动态（5 个媒体查询）；无视频 | 'Own the power of your money' | 首屏下方统计条（Since 2011、$2T+、Forbes）；风险披露 | 语言切换框，无 hreflang；未见日语（2023 年退出日本属先验知识） | 118 个请求，约 0.8 MB（声明）；HTML 1.39 MB（未压缩） |
| [Kraken Pro](https://pro.kraken.com/)（营销页 kraken.com/pro） | 同 Kraken 的栈；pro.kraken.com 本身是应用 | 首屏是设备框里真实终端的循环录屏；五段视频；吸顶分节导航；页签各配一段 | 'Powerful. Customizable. Beautiful.' | 主要靠展示真实产品；福布斯 | 同 Kraken | 186 个请求，约 8.9 MB（声明，其中视频约 7.0 MB） |
| [Coinbase Advanced](https://www.coinbase.com/advanced-trade)（中等置信） | React SSR（176 个 modulepreload）；CDS；Contentful | 几乎无代码动效；由 GIF 转成的动画 WebP（3.3 MB、0.8 MB） | 'Unlock the power of pro trading.' | 平台统计条、1:1 托管、监管披露 | 语言选择器；无日语（2023 年退出日本属先验知识） | 存档 HTML 433 KB；动画 WebP 3.3 MB + 0.8 MB |
| [bitFlyer](https://bitflyer.com/ja-jp/) | Next.js Pages Router SSG；styled-jsx；Noto Sans JP 配 Roboto、Poppins、Nunito | 很少：一个 140 s 跑马灯；有减少动态查询 | 没有 h1，标题是图片「ビットコイン取引量 10年連続 No.1 / 暗号資産はビットフライヤー」；「最短 9 分・口座開設無料」 | 每个 No.1 在下方用 ※ 写数据来源与口径；零被盗；诈骗警示条；页脚登记号 | ja-jp、en-jp、en-us、en-eu 分站；正文 16px/1.75，标题 `palt`，数字 `tnum` | HTML 71.5 KB；实测重量未取得 |
| [Coincheck](https://coincheck.com/ja/) | 较旧：Vue 3.0.1、Highstock、jQuery，Rails 式资源（Rails 为中等置信）；16 个第三方脚本主机 | 无（运行中动画为 0）；静态手机图 | 「はじめての暗号資産は / コインチェック」 | 独立一节写登记状态、No.1 下方 ※ 脚注、页脚登记号 | ja + en（hreflang）；正文 15px | HTML 36 KB；155 个请求，脚本约 2.5 MB（声明） |
| [bitbank](https://bitbank.cc/) | Angular 21 SSG + 旧 jQuery、Bootstrap、slick；Marketo、热图 | 首页 0 个动画；全局 CSS 带约 100 组活动页关键帧 | 标题是图片「500円から ビットコインを はじめられる。」；内联邮箱注册 | Oricon 满意度第 1 位徽标、※ 来源、正文里的登记声明、FSA 免责 | 日语与英语；正文 14px/1.8 | 208 个请求，约 5.9 MB（声明），46 个字体文件 |

### 现代产品站标杆

| 站点 | 技术栈 | 动效与视觉手法 | 首屏信息 | 证明元素 | 本地化 | 重量 |
| --- | --- | --- | --- | --- | --- | --- |
| [Linear](https://linear.app/) | Next.js App Router API 跑在 vinext（Cloudflare 基于 Vite 的实现）上；Motion；Sanity | 首屏是用 DOM 写成的 Linear 应用副本；H1 按行模糊进入；'Fig 0.x' 等距 SVG；按时间或进入视口驱动，不做滚动拖拽 | 'The product development system for teams and agents' | 客户 Logo、具名推荐、首页上带日期的更新日志、状态页链接、`/llms.txt` | 仅英文 | HTML 190 KB；压缩 JS 约 868 KB（若全部拉取） |
| [Vercel](https://vercel.com/) | Next.js App Router；Payload；Tailwind v4；Geist；Motion | 首屏着色器经 OffscreenCanvas 转到 Web Worker（WebGPU → WebGL2 → 静态噪声纹理）；减少动态时不渲染；105 处减少动态引用 | 'Agentic Infrastructure'（副标题轮换） | 每节一个具名客户指标；`/llms.txt`；'Paste to your agent' | 仅英文 | HTML 78 KB；压缩 JS 约 613 KB、CSS 157 KB |
| [Stripe](https://stripe.com/) | Next.js Pages Router；three.js 点状地球；CSS 滚动驱动动画 | 首屏持续跳动的 'Global GDP running on Stripe' 计数：按 IMF 的 GDP 与增长率在客户端推算，不是实时数据（摘要把推算数字列为应避免的做法），附方法说明与更新日期（2026-02-20）；WebGL 地球与弧线；101 处减少动态引用 | 'Financial infrastructure to grow your revenue.' | 统计条，正常运行时间链接到 status.stripe.com；案例数字 | 11 种语言、89 个 hreflang，含 ja-JP（`/jp`）与 en-JP | HTML 190 KB；压缩 JS 约 1.32 MB |
| [Raycast](https://www.raycast.com/) | Next.js App Router；React Three Fiber（懒加载，放在错误边界里） | 实时 WebGL 玻璃立方体，跟随指针，带性能监控与移动端降采样；服务器 HTML 里没有海报，chunk 到达前首屏空白 | 'Your shortcut to everything.' | '99.8% crash-free rate'、创作者头像墙 | 仅英文 | 压缩 JS 约 608 KB，另加懒加载 3D 约 282 KB |
| [Midday](https://midday.ai/)（现官网参照） | Next.js 16.2.1（开源）、React 19、Motion 12.38 | 进入视口显现；首屏 2.5 MB 视频（`preload=none`）；带逼真数据的页签面板；跑马灯；无 WebGL 与市场数据 | 'The business stack for modern founders' | '25,000+ banks'、GDPR 与 SOC 2 徽标、实时状态小组件；CTA 下方的风险逆转小字 | 仅英文 | HTML 169 KB；压缩 JS 约 430 KB |
| [Resend](https://resend.com/) | Next.js App Router；Tailwind v4；Spline 魔方（仅桌面预加载）；预渲染 3D mp4 | 交互 3D 魔方（2.76 MB 场景；手机改用 346 KB mp4 与海报）；滚动驱动 CSS 的横向边缘渐隐；可点击的发送演示；48 处减少动态引用 | 'Email for developers' | Logo 条、具名推荐、状态指示、`llms.txt` | 仅英文 | 压缩 JS 约 2.16 MB，桌面另加 2.76 MB 场景 |
| [Moto](https://www.moto-card.com/)（Awwwards SOTD 2026-09-24） | Webflow + jQuery；GSAP 3.15（ScrollTrigger、SplitText）；Lenis 1.3.18；three.js WebGPU 构建 | 滚动驱动：Lenis 与 ScrollTrigger 驱动 3D 卡片与地球；多时区时钟；只在 FAQ 手风琴里检查减少动态 | 'BUILT FOR MODERN WEALTH' | 坦率的 FAQ：自托管、不可逆转账、处理时间表 | 仅英文 | 压缩 JS/CSS 约 383 KB；首屏视频 4.5 MB；生产环境残留局域网开发脚本 |
| [EverSwap](https://everswap.com/)（Awwwards SOTD 2026-06-22） | Astro 静态站 + Lusion 定制的 three.js 引擎 | 全屏 3D 世界，相机随滚动飞行；百分比预加载；未见减少动态处理 | 'DeFi at Peak.' / 'EverSwap' / 'Scroll to start' | 无（'Trusted by' 区块被注释；'Launch App — Coming soon'） | 仅英文 | HTML 10.6 KB；压缩 JS 185 KB；3D 资产至少 1.28 MB |

## 4 跨分段规律

1. **框架不是「现代感」的来源。** 永续 DEX 里 6/9 是 Framer 或 Webflow；获奖的 EverSwap 跑在 Astro 上，只用一个 185 KB 的 JS 包；Rainbow 的滚动编排只用约 25 KB 无框架 JS。现代感来自内容、动效与视觉系统。
2. **首屏放真实产品。** Linear、Uniswap、Kraken Pro、Insilico、Midday、Resend 都展示真实界面或可用组件；Hyperdash、Jupiter、Uniswap 甚至把应用当首页，代价是首访性能（Uniswap LCP 约 14 s）。
3. **没有同行在首页跑实时 WebGL 业务数据。** 永续 DEX 的「3D」是视频；WebGL 只作氛围（pvp.trade 的 Vanta、Insilico 的涟漪、Base 的蜡烛粒子、Rainbow 的极光）或单一标志图形（Vercel、Raycast、Stripe）。只有 Insilico 在首屏放实时订单簿。
4. **实时数据是主要证明手段，但常当众出错。** Paradex 卡在 '...'、GMX 'Accumulating...'、Drift '0.00% APY' 与 '$826B'、Uniswap 的 TVL 显示 '-'、Hyperliquid 静态 HTML 先显示 'X.X M'。没有一家在数据不可信时隐藏它。
5. **一个标志性图形，配可靠回退。** Vercel（Worker + OffscreenCanvas，WebGPU → WebGL2 → 静态纹理，减少动态时不渲染）、Insilico（几 KB 着色器，no-gpu 与减少动态路径）；反例是 Raycast（无海报，首屏等 282 KB chunk）。
6. **动效按时间或进入视口驱动。** 6 个产品站与 7 个钱包站都没用 Lenis 或滚动劫持；GSAP 加 Lenis 的滚动拖拽只在 Webflow 系与获奖代理商站上出现，后者几乎不处理减少动态（EverSwap 0 处，Moto 只在手风琴里）。产品站处理得很充分（Vercel 105 处、Stripe 101 处）。
7. **CSS 滚动驱动动画几乎没人用。** 24 个加密与金融首页里没有检测到 `animation-timeline`（检查范围见第 1 节）；Rainbow、Resend、Stripe 只把它作 `@supports` 后的渐进增强。
8. **重量是共同的失败点。** Hyperliquid 12.6 MB、Kraken Pro 8.9 MB、Paradex 9.1 MB、Drift 7.9 MB、Uniswap 7.4 MB、Base 5.3 MB（字体 3.4 MB）、Rainbow 图片 9 MB；营销页带上整个交易应用包（GMX、Insilico、Hyperdash）或钱包 SDK（Hyper Foundation）。也有较轻的：Aevo 约 764 KB（视频未播放）、Kraken 约 0.8 MB（声明）、OKX `/en-sg` 约 1.1 MB（声明）、dYdX 约 1.5 MB、Hyper Foundation 约 1.8 MB（视频播完前）。这些都是桌面、不限速的单次首屏加载，口径不一（第 1 节），不是手机首屏交互前的数字。调研时 sairn.ai 是 13.8 KB HTML 加 7.2 KB CSS，没有外部 JS。
9. **2026 年的叙事是「什么都能交易」**（股票、商品、外汇、指数、预测市场，24/7）；隐私（Paradex、Aster）与零费用（Lighter、Paradex）是新卖点。消费类前端普遍在首屏写杠杆上限与 No KYC（Dexari 40x、Lootbase 40x、Liquid 'Up to 50x multipliers'）。
10. **信任手段随定位不同。** 有融资的放投资人 Logo（Aevo、Lighter、Paradex、Drift）；Hyperliquid 与 GMX 强调中立；另有带报告链接的审计（Drift、Lighter、Rabby）、状态页（Lighter、Paradex、Phantom、Base、Midday、Resend）、官方链接防钓鱼清单（Lighter）、外链提示（Hyper Foundation）、带方法说明的数字（Stripe）、坦率 FAQ（Moto）。Hyperliquid 前端里没人展示可在链上核对的数字。
11. **在永续 DEX、Hyperliquid 前端、钱包与产品站中，本地化很少，日语是空档。** 这四段里有日语营销页的只有 Aster（混排直译）、Liquid（10 种语言）、Stripe（89 个 hreflang），以及没有语言 URL 的 Uniswap；Phantom 设了 `lang="ja"` 却是英文内容。交易所一段不同：Binance（约 100 个 hreflang，含 ja 与 en-JP）、Bybit（含 ja-JP 的 `[locale]` 路由）与日本交易所本身（bitFlyer、Coincheck、bitbank）都有日语；这些全球交易所怎样服务日本居民（例如由 Binance Japan 这类日本实体）属先验知识，未核实。日本交易所的排版与披露惯例见第 2 节。另外，hreflang 并不少见：Based、Liquid、Binance、OKX、Coincheck、Drift 与 Stripe 都有；原始摘要里 Astro i18n 一项「24 个站只有 Drift 暴露 hreflang」的说法只来自动效技术检查时对 24 个首页 HTML 的一次扫描，与上面逐站核对的结果矛盾，不能当全体结论。
12. **智能体时代的标配**：`llms.txt`（Linear、Vercel、Stripe、Resend）、MCP 提及、'Paste to your agent'。
13. **视觉方向与撞色风险。** Sairn 的薄荷 #86e5d3 与青色接近 Hyperliquid 新的 #97fce3 与 #03211c；再配编辑衬线（Sairn 用 Instrument Serif，Hyperliquid 用 Teodor），容易被看成 Hyperliquid 官方页面。调研建议以 Sairn 自己的金色「choice」与独特母题领衔，并写明是独立前端（是否采用见重建规划）。
14. **信息架构与转化路径。** 各分段的分节顺序与 CTA 惯例相当固定（来自各分段摘要的归纳）：
    - 永续 DEX：首屏 → 实时统计 → 3–4 个产品支柱 → 产品界面演示 → 架构或安全说明 → 生态或 builder → 投资人、审计或合作方 → 手机应用 → FAQ → 带文档、状态与法律链接的页脚（Hyperliquid、GMX、Paradex、Lighter 等）。首屏公式是 4–8 个词的主张、一句副标题、一个进入应用的主 CTA（Trade / Start Trading / Launch App），可选一个次级 CTA；GMX、Lighter、Paradex 轮换一个词来表现品类广度。
    - 交易所：首屏（常是转化表单）→ 实时市场条 → 三支柱 → 分标签的特性（每个标签一段素材）→ 3 步开始 → 安全、储备或托管 → FAQ → 结尾 CTA → 风险与监管披露 → 塞满 SEO 链接的页脚。各环节都在交易所站上观察到（实时市场模块：Binance、OKX、Bybit、Kraken、Coincheck；分标签特性：Kraken；安全块是标配；页面底部的 FAQ、结尾 CTA、风险披露与 SEO 页脚；日本站另有 ※ 脚注、3 步开户与【注意事項】块），串成这个顺序是调研摘要给 Sairn 的建议，三支柱一环也来自摘要。Binance、Bybit、Kraken、OKX 与 bitbank 在首屏内联邮箱或手机号注册，配 SSO 图标与 App 二维码。
    - 产品站：公告条 → 带产品画面的首屏 → Logo 条 → 三个价值支柱 → 3–6 个带分标签子特性的深入介绍 → 量化证明或推荐 → 更新日志或新闻 → 一个结尾 CTA → 带状态与安全链接的密集页脚（Linear、Vercel、Stripe、Resend、Midday）。
    - Hyperliquid 前端：页头常驻 'Launch app'；每个 CTA 带槽位 UTM（Liquid 的 `cta_slot`）；资产标签与卡片深链到具体市场（Based、Liquid，Aevo 的行情卡也是）；桌面用二维码转手机（Dexari、Lootbase，永续 DEX 里还有 Drift）；程序化的 `/markets/<asset>` 与 `/learn/<topic>` 页各带 FAQ（Liquid、Dexari、Based、Hyperdash）。

## 5 动效与视觉技术

成本栏的体积是本地 esbuild 压缩后 `brotli -q 11` 的测量值。支持数据取自 MDN BCD 8.1.7、web-features 与 caniuse（2026-10-22）。

| 技术 | 2026-10 成熟度与支持 | 成本 | 与 Astro 静态站的契合 | 无障碍 |
| --- | --- | --- | --- | --- |
| CSS 滚动驱动动画（`animation-timeline: scroll()/view()`、`animation-range`、`timeline-scope`） | Chrome/Edge 115、Safari 26；Firefox 159 计划 2026-10-27 发布；web-features 仍标为非 Baseline，Firefox 发布后应变为「新近可用」，需复查。Safari 18 及更早没有。`animation-trigger` 只在 Chrome 146 | 0 KB JS；只动 transform 与 opacity 时 Chrome 在主线程外运行；动 filter 等会失去这一优势 | 极好：纯 CSS，放在 `@supports (animation-timeline: view())` 后，可替换 `.reveal` 显现脚本 | 滚动联动属于 WCAG 2.3.3 的前庭触发类，要放在 `prefers-reduced-motion: no-preference` 里；全局 0.01 ms 覆盖规则对滚动时间线的效果不明（未核实），应显式门控 |
| 同文档 View Transitions（`document.startViewTransition`） | 2025-10-14 起 Baseline（Firefox 144）；全球约 92.9% | 原生 0 KB；大面积快照占 GPU 内存；过渡期间覆盖层接管指针（中等置信），保持 ≤300 ms | 好：`.astro` 里的普通脚本 | 浏览器不会自动减弱，`::view-transition-*` 规则要包在减少动态查询里 |
| 跨文档 View Transitions（`@view-transition { navigation: auto }`）与 Astro `<ClientRouter />` | 非 Baseline：Chrome 126、Safari 18.2；Firefox 不支持，退化为普通导航；约 86.8% | 原生 0 KB；ClientRouter 改变脚本生命周期（导航时脚本不重跑，需在 `astro:page-load` 重新初始化），对带 WebSocket 或 WebGL 的页面是维护成本 | 静态站默认用原生方式；只有元素必须跨页保持连接时才考虑 ClientRouter | ClientRouter 自动尊重减少动态；原生方式要自己加媒体查询 |
| GSAP 3.15（ScrollTrigger、SplitText 等） | 成熟；2026-04-13 发布 3.15.0；现属 Webflow，全部插件免费，但许可证是 GSAP Standard 'no charge'，不是 OSI 许可证 | 核心 25.6 KB；加 ScrollTrigger 与 SplitText 44.1 KB；在主线程运行，拖拽与固定会与其他 JS 竞争 | 好：在 `<script>` 里懒加载 | 用 `gsap.matchMedia` 处理减少动态；SplitText 的 ARIA 行为未按版本核实 |
| Motion 14（原 Framer Motion）原生 API | 很活跃、主版本变化快：13.0（2026-08-05）、14.0（2026-10-02）、14.6.0（2026-10-22）；MIT | `motion/mini` 3.4 KB；animate + scroll + inView + stagger 27.1 KB；React 路线另需 react-dom 59.5 KB | 原生 API 适合 Astro 脚本，React API 只在已付 React 运行时的岛里合理 | 原生 API 需自行检查 `matchMedia` |
| Lenis 平滑滚动 | 成熟，1.3.27（2026-10-15）；默认 `respectReducedMotion` | 4.95 KB；滚动插值移到主线程，改变滚动手感；Safari 封顶 60 fps，低电量模式 30 fps | 容易接入，但对信息与转化页价值低 | 改变滚动物理会影响运动与前庭舒适；不要劫持键盘滚动 |
| Three.js（WebGLRenderer、WebGPURenderer）与 React Three Fiber | 成熟，r186（2026-09-24）；WebGPU 路径可自动回退 WebGL 2 | 最小全屏着色器平面：WebGL 110 KB、WebGPU 177 KB；R3F 另需 React；不限帧的渲染循环在 120 Hz 屏与 3 倍 DPR 手机上会发热降频 | 在 LCP 之后按可见性动态导入，下面放海报作 LCP | 画布对辅助技术不透明，需 `aria-hidden` 并用真实文字表达；减少动态时只渲染一帧；不做随滚动的相机移动 |
| 轻量着色器背景（OGL、Paper Shaders、手写 WebGL2 片元着色器） | 技术成熟；OGL 1.0.11 稳定但不活跃；Paper Shaders 0.0.82 仍在 1.0 之前 | OGL 11.1 KB；Paper ShaderMount 加网格渐变 5.5 KB；GPU 成本随像素数与着色器复杂度增长 | 理想：小脚本加 `matchMedia`、IntersectionObserver、`visibilitychange` 守卫，CSS 渐变作首帧 | 装饰性，`aria-hidden`；减少动态时冻结时间；要检查着色器整个输出范围上的文字对比度 |
| WebGPU | 非 Baseline；约 85.8% 完整加 3.7% 部分支持；各平台差异大 | 只有计算密集的视觉才值得；营销首屏几乎用不到 | 只能经带回退的库使用，不能作唯一渲染路径 | 同 WebGL |
| Rive | 很活跃（2.47.0，2026-10-24）；MIT 运行时 | canvas-lite JS 50.7 KB + WASM 262 KB；canvas 72 KB + WASM 715 KB；webgl2 WASM 762 KB；默认从 unpkg 取 WASM，自托管需 `wasm-unsafe-eval` | 适合懒加载；作首屏时不能是 LCP 元素 | 画布需文字替代；减少动态时暂停或显示静态画板 |
| Lottie / dotLottie | lottie-web 5.13.0 维护慢；dotlottie-web 0.81.0 活跃但在 1.0 之前 | lottie-web light 42.5 KB；dotlottie-web 12.4 KB + WASM 388 KB；复杂文件用 SVG 渲染会很重 | 适合懒加载的图标与插图；简单循环用 CSS 或 SVG 更好 | 循环需暂停控件，减少动态时显示终帧 |
| Spline | 活跃（运行时 2.0.111）；运行时专有，免费版导出带水印 | 运行时 863 KB，另有场景与按需 WASM（物理 429 KB 等）；可能拖累中端手机的 LCP 与 TBT | 技术上可作岛，但不建议放首屏；更好的是导出视频或海报 | 画布不透明，GPU 负载重，需静态回退 |
| 首屏视频（AV1 / HEVC / H.264 渐进 MP4；HLS） | 成熟；AV1 约 79% 完整加 17% 部分支持，Safari 只在硬件解码设备上，H.264 回退必需 | 渐进 MP4 0 KB JS；hls.js 151 KB 不值得用于短循环；主要成本是带宽 | 原生 `<video>`，AVIF 海报作 LCP | WCAG 2.2.2：自动播放超过 5 秒需暂停控件；减少动态或 Save-Data 时不自动播放 |
| 实时行情可视化（深度、成交流、迷你走势） | 技术成熟：OffscreenCanvas 自 2025-09-27 起 Baseline 广泛可用；uPlot 1.6.32；Lightweight Charts 5.2.1（Apache-2.0，NOTICE 要求显示 TradingView 归属与链接）；PixiJS 8.22.0 | uPlot 21.2 KB；Lightweight Charts 47.5 KB；PixiJS 125.8 KB；手写 Canvas 2D 深度图几 KB（估计）；Hyperliquid 限频见第 7 节 | 在 `.astro` `<script>` 里写原生 TS 模块并按可见性导入；复用终端的 hl-react 会被迫引入 React 岛 | WCAG 2.2.2 的例子就是股票行情条，需要暂停；快速跳动不进 `aria-live`；涨跌不能只靠颜色；数据失败时显示中性占位，不编造数字 |
| 滚动数字与实时计数（NumberFlow、CSS `@property`） | NumberFlow 0.6.2（2026-07，1.0 之前）；`@property` 自 2024-07-09 Baseline | NumberFlow 4.9 KB；CSS 方案 0 KB；用 ch 单位与等宽数字预留宽度，避免 CLS | Web 组件无需框架，可替换现有 `data-countup` 脚本 | 最终值保留为 DOM 文本；减少动态时不滚动；NumberFlow 的读屏输出未核实 |
| 文字效果（拆分显现、乱码解码、`sibling-index()` 错开、CJK 拆分） | `sibling-index()` 与 `sibling-count()` 自 2026-08-18 起 Baseline（Chrome 138、Firefox 154、Safari 26.2）；`word-break: auto-phrase` 只在 Chrome 119+；`text-autospace` 见 Firefox 145、Safari 27、Chrome 140 | GSAP 方案 44.1 KB；CSS 0 KB；在 `.astro` 模板里构建时拆分可免运行时 JS | 构建时拆分最合适 | 拆分文字要保留一个可访问名称，碎片 `aria-hidden`；日语要用 `Intl.Segmenter` 拆分，不能按空格 |
| Astro 6/7 平台特性 | Astro 6（2026-03-10）：稳定的 Fonts API（自托管、生成回退字体度量、preload）、稳定的 CSP API、Vite 7、Node 22.12+、Zod 4、移除 `<ViewTransitions />`、i18n `redirectToDefaultLocale` 默认改为 false。Astro 7（2026-06-22）：Vite 8 与 Rolldown、Rust 编译器。最新 7.4.2（2026-10-21）；Astro 公司 2026-01-16 加入 Cloudflare，仍为 MIT | 仓库是 5.14.6，升到 7.4 跨两个大版本；7.4.2 的 npm engines 要求 Node ≥22.23.4，仓库写的是 ≥22.15.0；`@tailwindcss/vite` 4.3.3 的 peer 是 Vite ^8 | 原生 | 静态 HTML 是最好的无障碍基础 |
| Astro i18n 路由与日语排版 | 自 Astro 4 稳定；Astro 6 改了 `redirectToDefaultLocale` 默认值 | 开发成本低；字体是主要成本：Noto Sans JP 可变字体（Fontsource 5.3.1）124 个 unicode-range 切片共 5.47 MB；Instrument Serif 没有日文字形 | 原生，可配合构建时拆分与 Fonts API | 正确的 `lang` 决定读屏语音与日语断行规则 |
| 动效无障碍与回退层（横切政策） | 稳定标准；`prefers-reduced-motion` 约 97% 支持；`prefers-reduced-transparency` 只有 Chrome | 一开始设计成本低，事后补成本高 | 在 Base.astro 与 global.css 里一次实现 | 现官网的缺口：`.marquee` 只在悬停时暂停；全局 0.01 ms 规则管不到 JS 与 rAF 动画；`.reveal` 从 opacity 0 开始，脚本失败时内容一直不可见 |

## 6 技术栈选项

| 选项 | 优点 | 代价 |
| --- | --- | --- |
| （1）保留 Astro，CSS 优先的动效，加按需加载的原生 TS 岛（调研推荐） | 保留零 JS 基线；与仓库契约一致（`brand.json` 经 `config/brand.ts`、Node 测试、静态 S3/CloudFront 托管）；Astro 6/7 带 Fonts API、CSP API、i18n 路由；原生跨文档过渡不需路由器；Motion、GSAP、OGL、Paper Shaders 都不需要 UI 框架；Preact 岛约 4.4 KB | 升到 7.4 跨两个大版本且要先提 Node；React 生态（R3F、Motion React、终端的 `@sairn/ui` 与 hl-react）需要 React 岛，每页多 59.5 KB；非开发者不能像 Webflow 或 Framer 那样可视化编辑 |
| （2）Next.js 16.4（App Router，可静态导出） | 最大的动效与 3D 生态；与终端同为 React 19；同行（monad.xyz、backpack.exchange、based.one、ethena.fi）常用 | 每页付 React 运行时；编程模型在变（Cache Components 将在 Next 17 成为默认）；静态导出丢掉服务端特性，App Router 的 i18n 要自建；要重写 13 个组件、布局、法律页、博客集合与测试；最佳体验绑定 Vercel |
| （3）无代码：Framer 或 Webflow | 设计迭代最快，动效内置，含托管与 CMS；Hyperliquid、Lighter 用 Framer，dYdX、Paradex、Drift 用 Webflow；Framer Basic $10/月、Pro $30/月，本地化每种语言 $20/月 | 打破 `brand.json` 单一来源、`pnpm brand:check` 与法律文本对齐，没有 PR 审查与 CI；供应商锁定与月费；实时 WebSocket 只能靠代码组件或嵌入；CSP 与响应头控制有限；运行时重（hyperliquid.xyz HTML 911 KB、lighter.xyz 2.03 MB 未压缩）；Framer 的日语翻译按 AI 额度计费；Webflow 本地化价格未核实 |
| （4）SvelteKit 3（Svelte 5.57，静态预渲染） | 运行时小，内置过渡与动效原语，适合交互数据组件；静态预渲染适合 S3/CloudFront；Svelte 也能作 Astro 的岛 | SvelteKit 3.0 于 2026-10-01 才发布，破坏性改动多，生态在追赶；不能与 React 终端共享代码；i18n 需第三方库；相对选项（1）收益小 |

## 7 性能与数据的参考值

- **调研时的官网基线**（2026-10-24 线上实测）：HTML 13.8 KB（br）、CSS 7.2 KB、拉丁页字体约 70 KB（Inter 48 KB + Instrument Serif 21 KB）、截图 190 KB（桌面）与 111 KB（手机）为普通 JPEG、无外部 JS。
- **调研给出的预算建议**：手机首屏交互前约 500 KB 以内；关键 JS ≤30 KB br；延迟加载的 JS（动效、WebGL、数据）≤150 KB br，LCP 之后、区块接近视口时才加载；Spline 与完整 Rive 放不进。LCP 元素必须是文字或带 `fetchpriority=high` 的 AVIF 海报，不能是 WebGL、Spline、Rive 画布或视频；不要让首屏标题从透明开始长时间错开显现。Core Web Vitals 第 75 百分位：LCP ≤2.5 s、INP ≤200 ms、CLS ≤0.1。
- **WebGL 与电池**：DPR 封顶 1.5（着色器按 0.5–1 倍渲染再放大）；离屏或页面隐藏时停循环；氛围效果按需或 ≤30 fps；每页一个画布与上下文；减少动态或 Save-Data 时只画一帧；Safari 低电量模式会把 rAF 封顶在 30 fps。
- **Hyperliquid 公开接口**（2026-10-24 读官方文档）：按访客 IP 计，REST 每分钟总权重 1200（`l2Book`、`allMids` 等为 2，多数 info 为 20，`recentTrades` 每 20 条加 1，`candleSnapshot` 每 60 条加 1）；WebSocket 最多 10 个连接、每分钟新建 30 个、1000 个订阅、每分钟发送 2000 条消息；60 s 无消息会断开，需发 `{method:'ping'}`。同一 NAT 下的访客与他们打开的终端标签页共享额度。`api.hyperliquid.xyz/info` 对 Origin `https://sairn.ai` 返回 `access-control-allow-origin: *`。可用的公开订阅：`allMids`、`l2Book`、`trades`、`candle`、`bbo`、`activeAssetCtx`、`allDexsAssetCtxs`、`spotAssetCtxs`。`stats-data.hyperliquid.xyz` 的排行榜与金库响应上限 64 MB 与 32 MB，不适合官网。
- **日语字体**：不要整套加载 Noto Sans JP 可变字体（124 个切片、5.47 MB）；用 unicode-range 切片或系统日文字体，只预加载拉丁字体。

## 8 调研时的仓库盘点

只列与改版直接相关的事实；完整约束以各归属文档为准。

- **现官网**（`apps/website`）：Astro 5.14.6，`output: "static"`；`tailwindcss` 4.0.6 与 `@tailwindcss/vite` 4.1.18 版本不一致；字体 Inter 与 Instrument Serif；只有深色主题，画布 `--bg-base` #12131a；客户端只有两个内联脚本（Base 的显现与计数、Ticker 的一次性 `allMids` 请求）；`node --test` 10 项在 2026-10-24 本地全部通过。首页顺序：Nav → Hero → Ticker → Markets → FeatureSpeed → Features → Fees → Trust → Manifesto → Faq → Footer。
- **线上与源码一致**（Last-Modified 2026-10-02），仍写着：No KYC（Hero、Manifesto、FAQ 及其结构化数据）、'Connected · 12ms'（装饰文字，无实测依据）、带 `animate-ping` 的 'Live on mainnet'、'each market's full leverage'、xyz: 股票与 JP225 行情；截图里有 40x、10x；Features 与 FAQ 点名交易所品牌钱包。这正是[日本营销邮件](marketing/jp-launch-email/README.md) §1 闸门 1 列出的矛盾。
- **价格格式**：Ticker 用 `Number()` 加 `toLocaleString`/`toFixed` 按价位格式化，失败时保持「—」；名为实时行情，实际是一次性快照。
- **可复用资产**：`brand/svg` 的 Logo 套件（≥24px、25% 安全空间、不变形）；`brand/loader` 的 16 种动效与静态终态 SVG、`sairn-motion.tokens.json`（时长 400/560/800/1400/2000/2800 ms、入场缓动 `cubic-bezier(.22,.7,.28,1)`、循环最暗帧深色 0.55）；状态符号；`brand/tokens/sairn.tokens.json`（品牌青 #0A3038、paper #F5F4EE、mint #86E5D3、amber #E6B766；生成文件不手改）；终端的 `--orderbook-*` 与涨跌色；`seo.ts` 的结构化数据骨架；OG 卡生成器；终端 Playwright 设施（仓库里没有截图脚本）。
- **约束**：品牌值只来自 `brand/brand.json`；生成文件不手改；法律页由 `legal/*.md` 渲染；`copy-contract.test.mjs` 的主张政策（禁止开源、写死杠杆上限等，费用旁必须写 0.01% builder fee）；隐私政策 §4 与 Cookie 政策 §3 写明不集成分析 SDK、不用广告 Cookie；静态托管，没有后端；手工发布、每次由运营方批准；2026-10-24 线上没有 CSP、HSTS 等安全响应头，`gatu-edge` 不能挂载响应头策略；`seo.ts` 的 themeColor 是字面量 #0a0a0a，与 `brand.json` 的 #0F1A1F 不一致；品牌迁移计划 D5（官网画布是否改品牌青）与该计划 D12 的动效子项 (h)（官网是否用 brand-intro）留到改版时决定；社交链接要等品牌迁移计划 D2 的账号。

## 9 借鉴与避免

| 借鉴 | 来源 | 注意 |
| --- | --- | --- |
| 首屏放只读的真实产品片段（价格条、订单簿、走势），深链到 `/trade/:symbol` | Linear、Uniswap、Insilico、Kraken Pro、Aevo | 不要把整个交易应用包发给落地页（Insilico 3.1 MB、Hyperdash 4.4 MB、Uniswap 5.2 MB JS） |
| 一个由真实数据驱动的标志图形，放 Worker 里渲染，有静态回退与减少动态路径 | Vercel、Insilico | 必须有海报（Raycast 反例）；不为氛围引入 three.js 或 Vanta（pvp.trade） |
| 带来源、带时间、说明算法的数字 | Stripe | Stripe 的计数是按 IMF 数据在客户端推算的，借鉴的是方法说明与更新日期，不是推算本身；不展示推算值或无法归属的数字；失败时隐藏，不显示 '...' 或不可能的值（Paradex、GMX、Drift、Uniswap） |
| 订单如何流转的数据流图 | Lighter | 正文不用全大写等宽字 |
| 官方链接防钓鱼区块、外链提示、状态指示 | Lighter、Hyper Foundation、Phantom、Midday | 状态徽标只在真有状态页时放 |
| 吸顶设备框随滚动换屏；CSS `view()` 加 `@supports` 与回退 | Rainbow | 屏幕图用 AVIF/WebP 并懒加载（Rainbow 9 MB PNG） |
| 市场标签与卡片深链到具体市场；每个 CTA 带槽位 UTM | Based、Liquid、Aevo | 不把杠杆叫「multipliers」（Liquid）；不写 'no VPN required'（Lootbase） |
| 程序化 `/markets/<asset>` 页与带 FAQ 的指南页 | Liquid、Hyperdash、Based | 不做无数据的薄页面或 SEO 链接农场（OKX 页脚） |
| 日本惯例：※ 脚注紧跟主张、3 步开始、【注意事项（よくお読みください）】、登记状态写清楚 | bitFlyer、Coincheck、bitbank | 不用图片标题（bitFlyer、bitbank）；不用 No.1 类主张；Sairn 没有登记，要写未登记声明（措辞由律师定） |
| 原生撰写的日语页，带 `lang` 与 hreflang | Stripe、Liquid | 不机翻、不混排（Aster）；不按 Accept-Language 设 `lang` 却给英文内容（Phantom）；不按 IP 强制跳转（OKX） |
| `llms.txt`、带日期的更新日志与公告条 | Linear、Vercel、Stripe、Resend | 版权年份与路线图日期不能过期（Dexari、Hyper Foundation） |
| CSS 优先的动效系统 | Liquid、Kraken | 不做滚动劫持与隐藏内容的滚动叙事（EverSwap）；不在营销页放分析像素与钱包 SDK（dYdX、Drift、Hyper Foundation） |
| 与 Hyperliquid 拉开视觉距离：不用薄荷粒子、编辑衬线和浅色薄荷配深绿 | Hyperliquid 的 2026-08 改版 | Sairn 的薄荷与青色本身已经接近，具体取舍见重建规划第 9 节 |

## 10 未核实与需复查的事项

- Firefox 159 是否在 2026-10-27 如期发布，以及 web-features 是否随之把滚动驱动动画标为 Baseline。
- Hyperliquid `globalStats` 与 explorer `blockList` 没有找到文档；`recentTrades`、`candleSnapshot` 与 `referral`（builder 收入）的返回形状未实测。
- Hyperliquid `/apps` 目录的收录标准未核实。
- Aevo 的成交量是否实时取数、Base 的四个指标是否实时、NumberFlow 的读屏输出、SplitText 的 ARIA 行为、Webflow 本地化价格：均未核实。
- Bybit 日本合作方关系、OKX 与 Binance 的日本实体、Kraken 与 Coinbase 退出日本：属先验知识，未核实。
- Drift ko 子域的 TLS 失败只探测过一次。
- 所有页面重量都是单次运行或声明值；没有现场数据。
