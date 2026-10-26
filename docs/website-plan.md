# 官网规划（sairn.ai）

状态：拟议，2026-10-25（同日按三路审查修订）。取代[官网重建规划](website-rebuild-plan.md)（下称「旧规划」）。旧规划保留为历史记录，不改写；本文与它冲突时以本文为准。范围：营销官网 `apps/website` 的内容、信息架构、视频位、视觉与动效、实时数据、技术、文案规则与分阶段实施。终端 `apps/terminal` 与其他文档的改动只在第 10 节列为并行任务。

- 依据：2026-10-25 的三路调研，即 Hyperliquid 官方站与官方终端、本仓库、同行站点；网页用 curl 读静态 HTML、JS 产物与公共接口，没有在浏览器里渲染。另参考[官网行业调研（2026-10）](website-industry-research-2026-10.md)、首屏原型 [`designs/website-hero-prototype/`](../designs/website-hero-prototype/README.md)，以及[「加密之外的市场」审阅包](marketing/beyond-crypto-review.md)第 2 节的事实表。审阅包第 3 节的问题清单，以及它正文里所有「待律师」「律师同意前」的默认值与状态，都已按决定 2 作废，本文只把那张事实表当证据引用。
- 本文没有改代码，也没有运行测试或构建。标「未核实」的条目在实施时核实。英文文案经第 9 节的规则核对后可以直接实施，不再另设审批环节。

## 0 一页结论

**网站是什么。** {BRAND_NAME} 的英文营销站。它要说清：{BRAND_NAME} 是 Hyperliquid 全部市场的独立网页终端，用邮箱或自己的钱包登录，就能在一个账户里 24/7 交易加密、美股、指数、商品、外汇和未上市公司（HIP-3 市场）的永续；然后把访客送进 app.sairn.ai 的具体市场页。站点保持 Astro 静态输出，不用客户端框架；JS 只用于行情数字和视频播放。

**首页区块顺序**（第 4 节）：

| 序号 | 区块 | 一句话 |
| --- | --- | --- |
| 01 | 首屏 | 「Hyperliquid 全部市场，一个账户，24/7」，邮箱或钱包登录，一个主 CTA，同组一行风险与产品事实，配一张打开市场选择器的真实终端截图 |
| 02 | 行情条 | `FEATURED_MARKETS` 按品类配额取 10 张卡，实时标记价，HIP-3 卡写部署方，每张卡深链到终端 |
| 03 | 全部市场 | 按官方终端的品类分组，收录全部有未下架市场的部署方，附第三方部署说明与 Pre-IPO 说明卡 |
| 04 | 功能 | 以收益为标题的 6 张卡，第一张是核实过的差异点 |
| 05 | 视频位 | 预留给运营方自制的有声视频；视频完成前不渲染（第 5 节） |
| 06 | 三步开始 | 登录 → 存入 Arbitrum 上的 USDC → 下第一单 |
| 07 | 费用 | 主 dex 合计费率，加一个带日期的 HIP-3 growth mode 示例 |
| 08 | 账户与安全 | 非托管流程图、按登录方式写签名方、独立声明、官方网址 |
| 09 | FAQ 与结尾 CTA | FAQ 同时生成 FAQPage 结构化数据 |
| 10 | 事实块与页脚 | 第三方部署、不是持股、杠杆与清算、受限地区、不隶属所参考的公司 |

**本版不做：** 日语页（以后的版本可以加，日本不再受阻）；带声音的自动播放；把 Agent 录屏当首屏内容；Open Book 实时画布（推迟到阶段 4，默认关闭）；官网组件里的公司 Logo 与外链币标；表单与邮件订阅；分析 SDK、Cookie 与浏览器存储；写死的杠杆倍数；投资人、用户数、审计徽标与媒体墙（{BRAND_NAME} 目前一样都没有）；成交额一类的证明数字（Sairn builder code 的公开聚合数据源没有实测，数字低时反而减分，以后的版本再议）。

**2026-10-26 实施修订：** 首页按本文实施时有以下偏离，各节在原文之后加了同日的修订说明，原文保留：首屏文案与预览页签（第 4 节 01）；新增 `#account` 区块（01 之后）；02 加了统计带并改为可暂停的连续滚动行情条；03 的市场表显示实时数字；04 改为带真实截图的页签；08 的 Fig. 1 改用 Phosphor 图标并加 Official links；Open Book 作为首屏预览的非默认页签上线（第 6 节、第 10 节阶段 4）；运行时请求覆盖 5 个 dex（第 7 节）；营销强调色改为琥珀（第 6 节、[ADR 0043](adr/0043-website-marketing-accent.md)）。

**需要运营方提供的：** 视频本身（第 5 节）；AWS 与 Cloudflare 上的操作；Hyperliquid `/apps` 收录申请；阶段 2 之前的一次真实卡购买与一次主网自动存款；第 11 节的几项确认与决定。

## 1 2026-10-25 运营方决定与旧规划的关系

| 决定 | 在本文中的落实 |
| --- | --- |
| 1 推广 HIP-3 市场，包括参考美股和 OpenAI、Anthropic 等未上市公司的永续，做法跟随 Hyperliquid | 首屏副标题点名 OpenAI 与 Anthropic 并深链；02 行情条与 03 全部市场收录全部有未下架市场的部署方。产品事实按官方终端的口径写进同一区块：第三方部署、不是持股、杠杆风险、受限地区（第 9 节） |
| 2 取消律师闸门 | 运营方陈述：律师已完全同意在日本扩张，并要求解除这一历史限制、不再询问（书面意见不在仓库，此处按运营方陈述记录）。本文不设任何律师步骤，也不提律师问题；法律页改动改由运营方书面确认。仓库里仍写着律师或法务确认的旧措辞，由第 10 节的文档任务 W1 改掉 |
| 3 本版不做日语页 | 删除旧规划第 12 节，以及各节中的 `/ja/`、日文字体、日语 SEO 与日本邮件依赖 |
| 4 视频由运营方自制（有声） | 预留 05 视频位，简报与规格见第 5 节；放在哪里等视频做好后再定。`designs/website-hero-prototype/media/` 里的 Agent 录屏只作技术占位 |
| 5 用简明规划取代旧规划 | 即本文 |

**旧规划的效力。** 旧规划除本文复述的内容外都是历史记录，不再约束实施；仍然有效的数字与规则已在第 6–9 节复述。阶段 4 的 Open Book 以旧规划第 7 节为设计输入，开工前按本文重写。本文明确推翻的旧规划内容：
- 「不放 HIP-3 股票、指数、金属与 JP225」（第 5 节第 04 区块、第 18 节禁用模式），第 10 节「不使用」里的「律师意见前的 HIP-3 `xyz:` 市场」与校验器「排除已下架与 HIP-3」，第 9 节截图守卫对 HIP-3 名称与杠杆控件的拦截；
- 第 10 节「每页一条 WebSocket，由 Worker 持有」与「Live 不超过 12 s」的新鲜度（本文用 REST 轮询，见第 7 节），第 13 节「实时数据前 10 s ≤60 KB」（本文的实时数据预算见第 7 节）；
- 第 11 节的 Plex Sans JP、budoux、subset-font，以及第 12 节全部日语内容；
- 阶段 0 删除 `Ticker`、`Markets`、`faq.ts` 股票问答与 `seo.ts` 的 `hip-3` 关键词（全部改为改写）；首屏 Preview 窗口与录屏默认视图；「不做营销视频」这一非目标；主张登记表的 `pending-legal`、`never-ja` 状态；
- 第 2 节与第 18 节英文站小节里「`legal/*.md` 改动需律师书面确认」「改动对照交给律师」等要求。

**D1–D25 的去向：**

| 去向 | 编号 |
| --- | --- |
| 沿用（运营方可以推翻） | D3 页面石墨 #12131a、产品窗口 #0F1A1F；D4 IBM Plex Sans 与 Plex Mono；D5 琥珀只用在 Logo 里；D6 页面加载时不播放 `brand-intro`；D8 不做 WebGL2；D9 Astro 6 单独一个 PR；D16 第一篇博客之前 `/blog` 设 noindex；D17 社交账号就绪之前不放社交链接；D25 截图守卫放行零值占位 |
| 由本文决定 | D2 本文即方向，不再等 V1–V3；D7 首屏文案见第 3 节；D10 日志见第 11 节第 3 项；D11、D12 只做英文，见第 11 节第 4 项；D13 不做地址级指标，只用聚合日志；D15 改为 `FEATURED_MARKETS` 逐页加全量列表（第 4 节）；D23 随阶段 4 定；D24 按决定 1 推广 |
| 推翻 | D20、D22（首屏改用静态截图，没有 Preview 窗口） |
| 作废 | D1（律师部分；其余由本文阶段 1 承接）、D14、D18、D19、D21（录屏部分；截图来源见第 6 节） |

验证包 V1（首屏理解测试）作废，不作为任何阶段的前置；V2、V3 只属于阶段 4 的 Open Book。

**本文新做的决定：** 首屏用打开市场选择器的静态截图，不用录屏；收录全部有未下架市场的部署方；市场与部署方只从数据或 `FEATURED_MARKETS` 配置生成；官网组件不放公司 Logo；品类名用 Pre-IPO，不用 Pre-launch；Pre-IPO 卡的主数字是隐含估值；视频只能点击播放，且不进 git；阶段 1 在现站上直接修改后上线；法律页改动由运营方书面确认。

## 2 目标与衡量

| 目标 | 衡量方式 | 何时 |
| --- | --- | --- |
| 文案准确、与终端一致 | copy-contract 与市场数据测试在每次构建时通过；每次发布记录当天 `https://app.sairn.ai/build-meta.json` 的 release 与 commit；组件里没有手写的市场或部署方清单（测试扫描） | 每次发布 |
| 市场数据不出错 | 快照里已下架的市场出现 0 次；快照之后才下架的，运行时一拿到数据就移除，每日检查在 24 h 内提醒（第 7 节）；故障矩阵（拒绝、畸形、过期、dex 不符、已下架）下实时区一个数字也不显示 | 阶段 1 起用 `node --test` 加录下的真实响应；阶段 2 起加浏览器故障矩阵 |
| 快 | `budget.test.mjs`：手机交互前 ≤250 KB、JS ≤30 KB；Lighthouse 移动实验室 LCP ≤1.8 s、TBT ≤50 ms、CLS ≤0.02；实时数据另计（第 7 节） | 阶段 2 起，每次发布 |
| 无障碍 | axe 在 390 与 1440 宽下没有 serious 或 critical；键盘走查与一次 VoiceOver 记录在任务记录里 | 阶段 2 起 |
| 能被找到 | Search Console 与 Bing 验证通过、站点地图已提交；记录首页、`/markets/` 与逐市场页的收录数；已提交 `/apps` 收录申请 | 阶段 2b 上线后 4 周 |
| 把访客送进终端 | 终端分发日志里带 `utm_source=website` 的落地请求数，按 `utm_content` 槽位分；视频播放数取官网日志里该 MP4 的 GET/Range 请求数（`preload="none"` 下只有点击播放才会请求），不按会话去重，报告里写明。首月只建立基线 | 日志开启后（第 11 节第 3 项） |

## 3 受众与核心信息

**受众：**
1. 已经在用或在考虑 Hyperliquid 的交易者：要一个快、非托管、费用清楚的网页终端。
2. 想在加密之外交易美股、指数、商品、外汇和未上市公司，但还没有自托管钱包的人：用邮箱登录，Privy 为该账户创建钱包（[ADR 0033](adr/0033-silent-email-wallet-creation.md)）。本版给他们的入金路径是 Arbitrum 上的原生 USDC，`/deposit/` 先讲怎样取得它；卡入金在第 11 节第 5 项通过后再写。

**参照：**
- hyperliquid.xyz（https://hyperliquid.xyz/ ，2026-10-25 用 curl 读取）：首屏讲一个账户、24/7、没有中介，只放一个 Trade 按钮；第二屏写 "markets that never close"；行情条是挑过的固定组合（含 S&P500、SILVER、WTIOIL、BRENTOIL），不按成交额排；整站不写杠杆倍数、风险句和地区限制。
- trade.xyz、Entropy、Based、Liquid 的首屏都是短口号加一个 CTA；Kraken 与 Liquid 在文字里点名 OpenAI 和 Anthropic，并在 FAQ 里回答不持股（未核实：2026-10-25 调研 Agent 的读取，原始记录不在仓库）。
- {BRAND_NAME} 是收 builder fee 的界面方，不是协议方。所以上位叙事学官方，但产品事实一句都不能省（第 9 节）。

**核心信息：** 用邮箱或自己的钱包登录，就能在一个账户里 24/7 交易 Hyperliquid 上的全部市场：加密、美股、指数、商品、外汇和未上市公司的永续，以及现货；资金留在你自己的 Hyperliquid 地址。品牌口号 'See the market clearly. Decide for yourself.' 保留在页脚，不作 H1。

**选择 {BRAND_NAME} 的理由。** 首屏按收益写（邮箱即可开始、全部市场、24/7），差异点放在 04 的第一张卡，只用核实过的、不点名官方的句式（R12）。目前核实到一项：界面语言含 हिन्दी 与 العربية（从右到左布局），而官方终端 2026-09-24 只有英、简中、韩、西、法五种（[取证记录](work-memory/sessions/2026-09-24-official-terminal-language-switch-trace.md)），实施时再核一次。邮箱钱包自动存款等候选要先过 R13，再对照官方终端核实，核实不了就不当作理由。运营方如有更强的理由，按第 11 节第 8 项提供。

**首屏文案（定稿草稿）：**
- Eyebrow: 'Independent trading terminal for Hyperliquid'
- H1: 'Every market on Hyperliquid. One account, 24/7.'
- Subhead: 'Sign in with email or your own wallet. Trade perpetuals on crypto, US stocks, indices, commodities, FX and pre-IPO companies such as OpenAI and Anthropic, plus spot.'（OpenAI、Anthropic 深链到各自的 `/trade/<coin>`）
- Primary CTA: 'Start trading' → `{APP_URL}/trade/BTC?utm_source=website&utm_medium=site&utm_campaign=en_home&utm_content=hero_cta`
- Secondary link: 'Browse markets ↓'（页内锚点 `#markets`，不带 UTM）
- Note（同一个 `[data-cta-group]`，正文小一号，不变淡）: 'Perpetuals use leverage; you can lose all of your margin. Stock and pre-IPO markets are perpetuals run by third-party deployers such as {DEPLOYERS}, not shares; outside exchange hours their prices come from the deployer. Risk disclosure →'
- Small print: 'Funds stay in your own Hyperliquid account · 0.01% builder fee · Not available in the US or other restricted locations'

首屏点名的市场来自 `FEATURED_MARKETS` 里带 `hero` 标记的两项（io:OAI、io:ANTH）。首屏与 02 的 `{DEPLOYERS}` 是该区块所列市场的部署方 fullName（2026-10-25：XYZ、EntropyIO）。

## 4 信息架构

### 页面（英文站）

| 路径 | 内容 | 阶段 |
| --- | --- | --- |
| `/` | 首页，见下文 | 1（改写）、2（新版） |
| `/markets/` | 全部未下架永续市场的列表，按品类与部署方分组，每行深链到 `/trade/<coin>`；Pre-IPO 行带单位与预定结算日。另为 `FEATURED_MARKETS` 每项生成 `/markets/<slug>/`，长尾市场只进列表。配置里的市场下架时构建失败（第 7 节），从配置删除后该页不再生成，发布按手册先 `--delete --dryrun` 并移出站点地图 | 2b |
| `/deposit/` | 先讲怎样在 Arbitrum 上取得原生 USDC（不点名交易所），再讲怎样存入；网络选错无法撤回；外部钱包需要少量 Arbitrum ETH 作 gas，用邮箱登录时以存款窗口里显示的步骤为准 | 2 |
| `/learn/` | 先上 HIP-3 市场是什么、Pre-IPO 永续怎样计价与结算两篇；builder fee、交易密钥（API 钱包）随后 | 2b |
| `/terms/` `/privacy/` `/risk/` `/support/` | 继续渲染 `legal/*.md`，只换样式 | 不变 |
| `/404/` | noindex，'Open the terminal' 与 'Back home' | 2 |
| `/blog/` | 第一篇文章出现之前移出导航，用 `@astrojs/sitemap` 的 `filter` 移出站点地图，设 noindex | 1 |
| `/llms.txt` | 静态摘要：是什么、官方网址、费用、HIP-3 说明链接 | 2b |

### 首页逐区块

页头：横版 Logo（≥24px）；锚点 Markets、Features、Fees、Security、FAQ；`bg-action` 按钮 'Open terminal'（`utm_content=header`）。页头不放风险文字，风险链接常驻页脚与事实块（R6）。

**01 首屏**
- 目的：5 秒内让人明白这是 Hyperliquid 全部市场的独立终端、用邮箱就能开始，并点一个 CTA。
- 内容：第 3 节的文案。
- 视觉：一张真实终端截图：未登录的 BTC 页上打开市场选择器，停在 Traditional Finance 的 Pre-IPO 页签，一张图同时看到品类页签与 OpenAI、Anthropic 两行；所选市场仍是 BTC，不会弹出 HIP-3 免责弹窗。`<picture>` 分手机与桌面两份，AVIF/WebP，写明宽高；说明行 'Screenshot of {APP_HOST}, signed out · <date> UTC'。H1 是 LCP 元素，不为动画隐藏。
- 阶段 1 由实施方用无头浏览器按现有 1600×900 JPEG 规格重拍这一张，不沿用 BTC-USDC 旧图，并去掉假浏览器框；阶段 2 改由采集脚本生成（第 6 节）。
- 2026-10-26 实施修订：
  - H1 仍以 'Every market on Hyperliquid. One account, 24/7.' 为可访问名称；可见部分的「Every market」是轮播词（Crypto、US stocks、Indices、Commodities、FX、Pre-IPO，最后停回 Every market），减少动态时直接显示终态。
  - 首段改为 'Trade crypto, stock and pre-IPO perpetuals on Hyperliquid. Sign in with email or your wallet. Your funds stay in your own Hyperliquid account.'，后接 'Pre-IPO perpetuals such as' 与 OpenAI、Anthropic 两个深链小按钮（`utm_content=hero_market`，读屏名称带部署方）。
  - CTA 组：'Start trading' 与 'Browse markets ↓'，下方是一行正文字号的执行事实 'Orders execute on Hyperliquid's on-chain order books. {BRAND_NAME} provides the interface.'，再下是风险句与第三方部署说明（R6）。
  - 预览区是 'Terminal'（默认，真实截图）与 'Live market'（Open Book 画布）两个页签；预览之下是三条理由：'Email or wallet'、'Six languages, including right-to-left'、'Desktop and mobile trading'。

**01b 账户与执行（`#account`，'Your account. Hyperliquid execution.'）**（2026-10-26 实施修订新增）
- 目的：在行情之前先回答「资金在谁手里、订单在哪里执行、{BRAND_NAME} 提供什么」。
- 内容：三张卡 'Funds in your own account'、'Signed for your account'（按登录方式写签名方，R9）、'One order book per market'（只限「同一市场」共享订单簿，附机制链接）；左栏一句 '{BRAND_NAME} is the interface; Hyperliquid matches and settles every trade.' 并链到 08。

**02 行情条（'Markets now'）**
- 目的：证明市场是真实的、范围很广，一点就能进到终端里的那个市场。
- 内容：10 张卡，来自 `FEATURED_MARKETS`，按品类配额：Pre-IPO 2（OpenAI、Anthropic，固定在前）、Stocks 2、Indices 1、Commodities 2、FX 1、Crypto 2，品类内按 24h 成交额排。纯按成交额会几乎全是加密币（2026-10-25 第一只单股 xyz:SNDK 排第 17），所以不用。
- 每张卡：名称（配置里按部署方写法的公司或资产名，例如 'Anthropic'；下面一行小字是 displayName）；HIP-3 卡写部署方 fullName（'by EntropyIO'）；标记价；24h 涨跌（带符号和 ▲▼）。Pre-IPO 卡的主数字是隐含估值，例如 'US$1.90T implied valuation'，用 Big.js 按 `deployers.ts` 的单位算，单位缺失时整张卡不显示数字；标记价放第二行。不显示杠杆。
- 标题行：'Hyperliquid public data · mark prices · as of hh:mm UTC'，旁边 'Pause updates'（`aria-pressed`）；下一行：'Stock and pre-IPO markets are perpetuals run by third-party deployers such as {DEPLOYERS}. They are not shares.'
- 视觉：横向滚动加吸附，不做自动滚动的跑马灯，数字用 Plex Mono。
- 2026-10-26 实施修订：
  - 行情条改为连续滚动：实时脚本在有数据、没有减少动态偏好时才把它切换为连续滚动，'Pause updates' 同时暂停数据与滚动（WCAG 2.2.2）；没有 JS 或减少动态时仍是横向滚动加吸附。原文「不做自动滚动的跑马灯」由此作废。
  - 行情条之上加一条统计带，分两组：'Market catalogue'（构建时快照的未下架永续市场数与 HIP-3 部署方数，写快照日期）与 'Live activity'（只统计页面展示市场所在的 venue 的 24h 成交额与未平仓量，写 as of 时间）；下面一个可展开的口径说明，写明两组的来源与计算方法，并说明活动量不等于深度。这些是公共接口的聚合数，不是 {BRAND_NAME} 的成交额，与第 0 节不放成交额证明数字的决定不冲突。
- 02 与 03 共用一个 `[data-cta-group]`，风险句放在 03 的事实句之后。没有 JS 或数据失败时，名称和链接照常显示，数字位留空。

**03 全部市场（`#markets`，'Every market, one account'）**
- 目的：按品类说明能交易什么，并把第三方部署的事实摆在最显眼的位置。做法参照官方终端选择器：Traditional Finance 下分 Stocks、Indices、Commodities、FX、Pre-IPO，HIP-3 按部署方分。
- 内容：6 张品类卡，依次为 Crypto（主 dex 永续，与终端的 crypto 范围一致；另写一行 'Spot in the same workspace'）、Stocks、Indices、Commodities、FX、Pre-IPO；Rates 有未下架市场时（2026-10-25 Paragon 有 3 个）再加一张。每张卡：
  - 构建时的未下架市场数；
  - 3–4 个示例：先取 `FEATURED_MARKETS`，不够再按快照里的 24h 成交额补；名称加部署方，深链到 `/trade/<coin>`，不显示实时数字；
  - （2026-10-26 实施修订：品类卡改为页签加市场表，表格列为 Market、Deployer、'Mark · 24h' 与终端链接，显示与 02 同一套校验与新鲜度规则下的实时标记价和 24h 涨跌；数据失败时数字位留空，规则同第 7 节。）
  - 'Run by …' 一行，部署方名取 `perpDexs` 的 fullName。
- 文案：H2 'Every market, one account'；Intro 'Trade 24/7 across crypto and traditional markets from one account.'
- Pre-IPO 说明卡：
  - 每个收录的 `preipo` 市场一行：名称、部署方、单位、'Isolated margin only'（该市场 `onlyIsolated` 时才写）、预定结算日（写 'scheduled'），以及 'How the price is set →'（部署方文档）。
  - 正文：'Pre-IPO perpetuals are cash-settled contracts that track a reference price set by the deployer. They are not shares and not an IPO allocation, and they give you no rights in the company.' 结算句按部署方从 `deployers.ts` 生成，EntropyIO 为 'If the company does not list by the scheduled date, or earlier if the deployer gives notice, the market is settled.'；没有核实结算规则的部署方不写结算句。
- 区块底部的 HIP-3 事实句（正文字号，不缩小、不变淡），之后是风险句：

  > Stocks, indices, commodities, FX and pre-IPO markets are HIP-3 perpetuals deployed on Hyperliquid by independent third parties: {DEPLOYERS}. Each deployer defines its markets, sets the reference price and can halt, settle or delist a market. Hyperliquid matches and settles trades; {BRAND_NAME} is the interface and does not review these markets. Outside a stock's exchange hours, prices come from the deployer's own mechanism. These contracts give you no ownership, dividend or voting rights, and {BRAND_NAME} is not affiliated with the companies they reference. How HIP-3 works →

  这里的 `{DEPLOYERS}` 是全部收录部署方的 fullName（2026-10-25：XYZ、Paragon、EntropyIO、Markets By Kinetiq）。'How HIP-3 works' 链到 Hyperliquid 的 HIP-3 文档。

**04 功能（`#features`，'Built for how you trade'）**
- 视觉：一张大截图（主 dex 市场页，不触发免责弹窗）配 6 张卡，图标用 Phosphor（构建时内联）。
- 6 张卡（标题写收益）：
  - 'Trade in your language': 'English, 简体中文, हिन्दी, Español, Français and العربية, with a right-to-left layout for Arabic.'
  - 'No wallet? Use your email.': 'Sign in with email and start without installing a wallet, or connect the wallet you already use.'
  - 'Set TP/SL as you enter': 'Market, limit, stop, take-profit, TWAP and scale orders on perpetuals.'（终端 `ORDER_TYPES` 有 8 种；现货只支持其中 4 种，不暗示现货全部支持）
  - 'Everything in one workspace': 'Perpetuals and spot side by side, with charts, order book and recent trades.'（不写图表库商标）
  - 'Trade from your phone': 'A dedicated mobile layout that you can install as an app.'
  - 'More in the terminal': 'Earn, vaults, staking, referrals and a leaderboard.'（不写收益率，不写盈亏）
- 卡片不点名 Privy 与钱包品牌；签名方的说明放 FAQ 与 08（R9）。
- 2026-10-26 实施修订：6 张卡改为页签（桌面竖排、手机横排），每个页签配一张未登录的真实终端截图（`scripts/capture-features.mjs` 采集、`scripts/optimize-images.mjs` 编码），标题与正文同上；选中页签的图标用营销强调色（第 6 节）。

**05 视频位** 见第 5 节。视频交付之前，页面上没有这个区块，也不放占位图。

**06 三步开始（`#start`）**
- 三步：1 'Sign in with email or your own wallet.'；2 'Deposit USDC on Arbitrum.'（链到 `/deposit/`；第 11 节第 5 项通过后加 'Or buy USDC with a card.'）；3 'Place your first order.'
- 第一步下的说明：'With email, a wallet created for your account signs your orders. With your own wallet, you approve a trading key for this browser session instead of signing every order; it is kept after a restart only if you choose to stay connected.'
- 一个 CTA（`utm_content=start_cta`）配风险句，自成一组。不写到账耗时，不写自动存款、刷卡或免 gas（R13）。

**07 费用（`#fees`）**
- 合计费率：永续 taker 0.055% / maker 0.025%，即 Hyperliquid 基础费率 0.045% / 0.015% 加 0.01% builder fee；另写 'builder fee on sells only'（现货）与 'TWAP orders carry no builder fee'。数字继续由 copy-contract 钉在 `apps/terminal/src/config/hyperliquid.ts`，并注明日期。
- HIP-3：'HIP-3 deployers can set different Hyperliquid fees for their markets.' 后接一个构建时从快照生成、带日期的示例，例如 'On OPENAI (EntropyIO, growth mode) on <date>: 0.009% Hyperliquid taker fee + 0.01% builder fee.' 协议费率按终端 `domain/trade/fees.ts` 的规则算（`deployerFeeScale` 与 growth mode ×0.1，基础档），由跨应用测试对照终端结果钉住；builder fee 按终端 `domain/trade/order-fee-quote.ts`，HIP-3 永续的普通订单同样计入。这类市场上 builder fee 占总成本一半以上，照实写，不回避。
- 原来外链 Hyperliquid 资金费率页的链接改为终端的 `/fundingComparison`；07 自成一组，配风险句。

**08 账户与安全（`#security`，'How your account works'）**
- 上半是流程图 Fig. 1，标注 'Illustration'：浏览器 → 签名（邮箱：Privy 为账户创建的钱包；外部钱包：你批准的交易密钥）→ Hyperliquid 订单簿 → 在你自己的 Hyperliquid 地址结算。{BRAND_NAME} 的方框只标「界面 + builder fee」。节点图标只用 `brand/loader/glyphs/mono/`。
- 下半是清单：非托管（条款 §1.3）；独立界面，不是 Hyperliquid Corp. 或 Hyper Foundation（条款 §1.1）；提款与划转总要由拥有账户的钱包签名，交易密钥不能转出资金（发布前按当时代码复核）；本站（sairn.ai）只连 `api.hyperliquid.xyz`，不加分析工具；'We will never ask for your private key, seed phrase, verification code or password.'；官方网址，纯文本，从 `brand.json` 的 `domains.primary` 读取。
- 不放审计、投资人、用户数、媒体、状态徽标或成交额数字。
- 2026-10-26 实施修订：Fig. 1 的节点图标改用 Phosphor（与全站图标一致，构建时内联），不再用 `brand/loader/glyphs/mono/`；清单旁加 'Official links' 卡片，列出 `brand.json` `domains.primary` 的每个主机及用途，提醒访客核对地址栏。

**09 FAQ（`#faq`）与结尾 CTA**
- FAQ 由 `config/faq.ts` 同时生成页面和 FAQPage：Who holds my funds? · What can I trade? · Am I buying shares when I trade a stock or pre-IPO market?（答：没有，R2）· Who runs HIP-3 markets? · How is a pre-IPO price quoted?（按部署方写单位与隐含估值）· Can I trade when the stock market is closed? · What does a trade cost? · What do I need to deposit? · How does email sign-in work?（这里写 Privy 与签名方）· Which order types are supported? · How does leverage work?（讲保证金、逐仓与清算，不写倍数）· Where am I not able to trade?（引条款 §2.2 与 §2.3 的禁止规避）· Where does the live data come from? · Is this investment advice?
- 现有 FAQ 里的 'There's no KYC'、钱包品牌名、'They are perps, not securities'、不分登录方式的签名说法删除或改写；'TWAP orders and spot buys carry none' 保留。
- 结尾 CTA：'Start trading'，配风险句。

**10 事实块与页脚**
- 事实块（页脚之上，正文字号）：

  > Perpetual futures use leverage and can be liquidated; you can lose all of your margin. HIP-3 markets are deployed by independent third parties and can be halted, settled or delisted, and their liquidity can be thin. Contracts that reference companies give you no ownership in them, and {BRAND_NAME} is not affiliated with or endorsed by those companies. {BRAND_NAME} is an independent interface, not Hyperliquid Corp. or the Hyper Foundation. It is not intended for, and may not be used by, persons who reside in, are located in or are incorporated in the United States or other restricted locations listed in the Terms of Use; deployers may apply their own restrictions. Not financial advice.

- 页脚：法律实体 Sairn Corp.（取自 `brand.json`）；`/terms`、`/privacy`、`/risk`、`/support`；官方网址；'Pause live data'；口号；构建日期。社交账号就绪之前不放社交链接。

## 5 视频位（运营方自制视频）

参照（2026-10-25 用 ffprobe 读取，原始记录不在仓库）：hyperliquid.xyz、trade.xyz、Entropy、Based、Aster 的首页视频都是无声的抽象循环，长度 4–16 s；有声产品片在同行那里都链到站外。所以运营方的视频单独占一个「点击播放」位，不当首屏背景。

**简报（开拍前先按第 9 节核对脚本）：**
- 唯一任务：让没用过 Hyperliquid 的人在约 75 s 内看完从邮箱登录到在一个股票或 Pre-IPO 市场下第一单的过程。观众是第 3 节的受众 2。
- 必讲 4 点：全部市场，含股票与 OpenAI、Anthropic；邮箱或钱包登录；资金留在你自己的 Hyperliquid 地址；费用与风险句。
- 片尾卡：官网网址、'Start trading'、风险句。
- 拍摄：用专门的演示账户，地址与余额在后期遮挡；存款一步按 R13，真实验收之前只拍存入 Arbitrum 上的 USDC；界面上出现杠杆数字可以，旁白与字幕不说倍数；出现 HIP-3 市场时说出部署方；不说「买股票」或「持有公司」；Pre-IPO 价格说明单位。界面多用放大镜头，保证 390px 宽播放时文字可读。

| 项目 | 规格 |
| --- | --- |
| 时长 | 主版 60–90 s（建议约 75 s，没有同行基准）；可选再剪一个 15–30 s 的社媒版 |
| 画幅 | 必需 16:9，1920×1080。推荐另做 9:16，1080×1920，用于手机和社媒；没有竖版时，手机上按 16:9 全宽显示 |
| 帧率 | 30 fps；界面有快速滚动时可用 60 fps |
| 交付 | 母版 ProRes 422 或 ≥20 Mbps 的 H.264，立体声 48 kHz；另交人声、音乐、音效分轨与无字幕的干净版（以后加配音时不必重做）；字幕稿、文字稿与片中终端的 `build-meta.json` release |
| 声音 | 综合响度约 -14 到 -16 LUFS，真峰值 ≤ -1 dBTP，人声优先；音乐要有网页与社媒的商用授权。只在访客点击播放后出声：Chrome 只无条件允许静音自动播放（Chrome 与 MDN 的自动播放文档，2026-10-25 读取）；使用原生 `controls`，含音量与静音 |
| 字幕 | 英文 WebVTT（`<track kind="captions" default>`，默认打开）；网站版画面不烧录字幕，社媒竖版烧录 |
| 静音时 | 不开声音也要看得懂：关键信息靠画面文字和字幕 |
| 文字稿 | 页面上用 `<details>` 放全文；旁白把画面上的关键信息说出来，不另做音频描述轨（WCAG 1.2.3、1.2.5 未逐条核对 W3C 原文） |
| 网站编码（实施方从母版生成） | H.264 High MP4（`+faststart`，AAC-LC 128 kbps）1080p 约 3.3 Mbps、720p 约 1.6 Mbps；AV1 WebM（Opus 音轨）作优先源；手机经 `<source media>` 取 720p（浏览器支持实施时核实）。以 720p 下界面文字清晰为准，实测后固定 |
| 体积上限 | 90 s 的 1080p MP4 ≤40 MB，720p ≤20 MB，竖版 1080×1920 ≤35 MB |
| 海报帧 | 运营方选一帧有意义的画面，不能只有文字。AVIF 加 JPG 回退；桌面 ≤80 KB、手机 ≤45 KB；写明宽高 |
| 托管 | 视频不进 git：发布时上传到 S3 的 `media/<sha256>.<ext>`，按不可变资源缓存；仓库只提交清单（哈希、字节数、时长、码率）与海报、字幕。同源托管，满足 CSP `media-src 'self'`；不嵌第三方播放器，不用 hls.js。`preload="none"`；视频本体不计入交互前预算，海报在首屏内时计入。发布手册加这一组，上线后用 `curl -r` 核对 Range 请求与 `content-type` |
| 品牌 | 按 Logo 套件：高度 ≥24px，留 25% 安全空间，不变形，琥珀只用在 Logo 里，`--action` 保持中性（[品牌素材](brand-assets.md)） |

**两种放法（视频完成后由运营方二选一）：**

| 放法 | 做法 | 好处 | 代价 |
| --- | --- | --- | --- |
| A 独立区块 | 放在 04 功能之后：标题 'See {BRAND_NAME} in action'，下面是内嵌播放器、海报与文字稿 | 实现最简单，不需要弹层；可以输出 VideoObject；不影响首屏 LCP | 在首屏以下，看到的人少 |
| B 首屏按钮加弹层 | 首屏 CTA 组旁加次级按钮 'Watch the video (1:20)'，点开后在 `@sairn/ui` 风格的对话框里播放 | 首屏就能看到入口 | 要处理焦点与关闭；手机上全屏播放；多约 1–2 KB JS；对话框关闭时必须暂停 |

推荐先上 A，按第 2 节的 MP4 请求数再考虑加 B。

## 6 视觉与动效

- 画布与表面：页面用石墨色 #12131a；产品窗口和截图框用终端的 #0F1A1F，浮层 #212d33。只做深色主题。`seo.ts` 的 themeColor 改为读取 `brand.json` 的 `pwa.themeColor`。
- 强调色：`--action` 保持中性，用于所有填充按钮；薄荷 `--signal` 只用于焦点、链接、Logo 与每节最多一个强调词；琥珀只用在 Logo 里（ADR 0028）；涨跌色复制终端令牌，由跨应用测试钉住。
  - 2026-10-26 实施修订（运营方决定，[ADR 0043](adr/0043-website-marketing-accent.md)）：营销强调改用官网专用角色 `--marketing-accent`（`text-marketing-accent`），取 Logo 的选择琥珀 `#e6b766`，来源 `brand.json` 的 `websiteColors.dark.marketingAccent`（必须等于 `logo.dark.choice`）。用于首屏轮播词、市场区「one account」、FAQ 结尾「One account.」、宣传图标（首屏理由、`#account` 卡、安全清单的勾、Official links 盾牌、Fig. 1 节点）、功能页签选中图标、Fig. 1 连线与箭头，以及氛围光（`--glow-accent` 10%、`--glow-accent-faint` 5%）。薄荷 `--signal` 在官网只留焦点环、`::selection`、正文链接、实时指示与 Logo，不再做强调词。琥珀不得用于警告、风险与状态，官网组件不使用警告色。上一条里「每节最多一个强调词用薄荷」「琥珀只用在 Logo 里」两句对官网作废；终端仍按 ADR 0028。
  - 2026-10-26 实施修订（运营方反馈「太古老、太暗」后选定方向，[ADR 0044](adr/0044-website-light-default-theme.md)，待看截图确认）：官网默认改为浅色。画布 `#fafaf5`（套件 `paper-50`），条带 `#f5f4ee`，卡片白色加 1px 墨色细线与柔和多层阴影；标题用 Logo 字标墨色 `#08262e`，正文用中性 `--action` 墨色（80% / 70% / 65%）；营销强调用浅色琥珀 `#99621f`；涨跌色在浅色表面用终端浅色值。首屏预览与功能截图仍是深色产品窗口（`.surface-dark`，`#0f1a1f`）。原深色令牌保留在 `:root[data-theme="dark"]`，`?theme=dark` 切换供对比。第一条「只做深色主题」与 themeColor 读 `pwa.themeColor` 两句对官网作废（浅色读 `pwa.lightThemeColor`）。
- 字体：IBM Plex Sans Variable 5.2.8（与终端同版本）用于标题与正文；IBM Plex Mono 用于数字、代码与标签；去掉 Inter 与 Instrument Serif；数字一律 `tabular-nums`。
- 仿冒防护：官网色与 Hyperliquid 的 #97fce3、#03211c、#23524C 的 ΔE76 ≥15（近黑中性色豁免），扩展 `brand-contract.test.mjs`；该测试现在直接读 `Hero.astro`、`Markets.astro` 与 `--bg-*` 变量，组件与令牌改名时同步改。（2026-10-26 补记：共享的 `--signal` 与 `--signal-hover` 仍是登记理由的待决例外（ΔE 8.5 / 11.7）；营销强调已改为琥珀，ΔE76 ≥ 63，测试另外钉住琥珀的色差与 AA 对比度。）
- 图像：只用真实界面截图（以及运营方的视频），不用素材库 3D、AI 渲染或币标球；官网自己的组件不放公司 Logo，市场只用文字，CSP 的 `img-src` 因此保持 `'self' data:`。终端界面自带的市场图标（可能是公司 Logo，未核实）属于真实界面，截图里保留。
- 截图采集：`capture-ui.mjs` 未登录实拍 {APP_HOST}，记录 URL、UTC 时间与 `build-meta.json`。只拍主 dex 市场页与市场选择器，不触发 HIP-3 免责弹窗；以后要拍单个 HIP-3 市场页时，由运营方在一次性浏览器配置里自己勾选免责声明后再采集。DOM 守卫拦钱包地址、非零余额（零值占位放行）、测试或开发标记，以及画面里打开的阻塞对话框；不拦 `xyz:` 前缀、部署方名与杠杆控件：截图是带日期的真实界面，杠杆规则只约束文字。
- 动效：从 `brand/loader/sairn-motion.tokens.json` 读令牌并加等值测试；优先用 CSS，只动 transform 与 opacity；元素的默认样式就是终态（修掉 `.reveal` 默认 opacity 0）；减少动态时停下全部动效；不做滚动劫持和视差；实时数字更新时不做滚动动画（不引入 NumberFlow）；不在页面加载时播放 `brand-intro`。
- Open Book：推迟到阶段 4，用构建开关控制，默认关闭。开启之前要完成 24 h 浸泡测试（V2）、真机 Safari/iOS 与中端 Android 检查，并且只放在 02 以下作为附加视图。止损线不变：开关一关，就退回静态站。
  - 2026-10-26 实施修订：Open Book 已作为首屏预览的非默认页签 'Live market' 上线到本次改版（不是 02 以下，也没有构建开关）：只有页签打开、画布在屏幕上且页面可见时才连接公共 WebSocket `wss://api.hyperliquid.xyz/ws`（一个币种的 `l2Book`、`bbo` 与 `trades`），减少动态或省流量模式下先显示海报、由访客点开始；以后上 meta CSP 时 `connect-src` 要同时放行这个 `wss://` 地址（第 8 节）。画布带价格轴与时间轴、当前价格线和图例（挂单亮度、买入/卖出成交、中间价），并写明档数与限制。上面列的 24 h 浸泡测试与真机检查，本文没有核实是否已完成，发布前须在任务记录中补齐或说明。

## 7 实时数据

接口：`POST https://api.hyperliquid.xyz/info`。2026-10-25 实测，带 Origin `https://sairn.ai` 的请求返回 `access-control-allow-origin: *`，所以不需要后端。

| 数据 | 接口 | 何时取 | 用途 |
| --- | --- | --- | --- |
| 部署方 | `perpDexs` | 构建时 | dex 名与 fullName。收录全部有未下架市场的 dex（2026-10-25：xyz 116 个、para 32 个、io 11 个、mkts 5 个；其余 6 家为 0）。文档链接只读终端的 `apps/terminal/src/config/hip3-deployers.ts`，收录的 dex 在那里没有链接时构建失败（T1 补上 io）。地址字段一律丢弃 |
| 分类与显示名 | `perpConciseAnnotations` | 构建时 | 归一化照搬终端的 `normalizePerpCategory`（trim、转小写、`stock` → `stocks`；单测覆盖数据里的 `FX`）。主 dex 永续按所属 dex 归入 Crypto，不读注解（注解只覆盖 HIP-3）。HIP-3 没有分类的市场（如 io:EWY）以及分类为 crypto 的市场不进品类卡，只出现在 `/markets/` 的部署方分组里，与终端的范围一致；不按名称猜分类 |
| 市场结构 | `metaAndAssetCtxs`（主 dex 与每个收录的 dex 各一次） | 构建时 | 未下架即 `isDelisted !== true`，与终端的 `isPerpDelisted` 一致：公共接口对未下架市场不返回这个字段（2026-10-25 没有一个资产显式写 false），快照脚本断言它只会缺省或为 true。另取 `onlyIsolated`、`growthMode`、`deployerFeeScale`（07 的示例）与 `dayNtlVlm`（示例排序） |
| 实时数值 | `metaAndAssetCtxs`（主 dex 与 `FEATURED_MARKETS` 涉及的 dex，2026-10-25 是主 dex、xyz、io；每次权重 20） | 运行时：`load` 之后的空闲回调里才开始；02 至少 10% 可见、文档可见、本标签页持有 Web Lock `sairn-site-live` | `markPx`、`prevDayPx`（算 24h 涨跌）、`isDelisted` |

- `FEATURED_MARKETS`（`src/config/featured-markets.ts`）：每项写 coin、品类、按部署方写法的名称、可选的 `hero` 标记。构建时校验每项仍未下架、分类不变，不满足就构建失败。
- 快照：`apps/website/src/data/market-structure.json` 由 `pnpm --filter @sairn/website markets:snapshot` 生成并提交，带 `fetchedAt`，不手改；`fetchedAt` 超过 7 天时构建失败。测试断言其中没有 `/0x[0-9a-fA-F]{40}/`。每次发布前刷新快照，并在任务记录里写明 diff。
- 每日检查：GitHub Actions 每天跑一次 `markets:snapshot --check`（约 1 分钟，每月约 30 分钟，在 3,000 分钟的额度内）。`FEATURED_MARKETS` 或已发布的 Pre-IPO 行下架、改分类时检查失败并通知运营方；下一次构建也会失败。新工作流同步写进 `scripts/ci-workflows.test.mjs`。
- 数据体积：接口不压缩（2026-10-25 带 `Accept-Encoding: gzip, br` 实测也没有 `content-encoding`）；主 dex 约 72 KB、xyz 约 61 KB、io 约 7 KB，一轮约 140 KB。实时数据不计入交互前预算，首轮在 `load` 之后才发，稳态约 70 KB/min；手机 ≤120 KB/min、桌面 ≤400 KB/min 的上限保留，超出时拉长间隔。备选：主 dex 改用 `allMids`（权重 2，约 25 KB，但没有 24h 涨跌）；阶段 3 实测只订阅展示币种的 WebSocket `activeAssetCtx`。
- 2026-10-26 实施修订：02 的行情卡与 03 的市场表共用一个请求计划，覆盖页面上所有市场所在的 dex：主 dex、xyz、io、para、mkts 共 5 个（上表「实时数值」一行原写 3 个）。每次 `metaAndAssetCtxs` 权重 20，60 s 滑动窗口内最多 3 次，所以请求间隔至少 20 s，每个 dex 的刷新周期按下一条的公式为 200 s；统计带的 Live activity 只读同一批响应，不另发请求。
- 刷新周期：首轮各 dex 同时请求，之后每个 dex 间隔 max(120 s, 请求总数 × 40 s)，请求总数含主 dex；退避重试计入同一个 60 s 滑动窗口，合计 ≤60 权重/分钟（Hyperliquid 单 IP 上限 1200 的 5%），由单测覆盖。（2026-10-26 实施时修订：原定 ≤30 权重/分钟只能每 60 s 发一次请求，行情条要约 2 分钟才出齐数字。）只有持锁的标签页发请求；页面隐藏或区块离屏 30 s 后停止。
- 校验（fail closed）：数值必须是十进制字符串，`markPx`、`prevDayPx` 大于 0；coin 必须在快照里，dex 与请求一致；运行时读到已下架的市场，在 02 与 03 当场移除；涨跌、隐含估值与求和用 Big.js（`big.js` 7.0.1，与终端同版本），精度按 Hyperliquid 的有效数字规则；不显示 `maxLeverage`。
- 新鲜度：以 `performance.now()` 计接收时间，不拿墙钟比较交易所时间。超过两个刷新周期再加 30 s 仍没有有效数据时，移除全部数字，数字位留出固定宽度的空白，并设 `aria-busy` 与读屏专用说明；不显示错误原文、'offline'、'—' 或 '$0'。
- Pre-IPO：`src/config/deployers.ts` 按 coin 写单位、预定结算日、结算规则、来源 URL 与读取日期；条目超过 90 天没有复核时快照脚本失败。EntropyIO（均 2026-10-25 读取）：每 1 美元价格对应公司 10 亿美元隐含估值（https://docs.entropy.io/market-types/pre-ipo-perpetuals ）；io:ANTH 的 No-IPO 结算日 2028-08-18、io:OAI 为 2028-09-02（2026-10-26 实施时按原页更正）（https://docs.entropy.io/asset-directory/pre-ipo-assets ）；运营方可以在预定日期前发出提前结算通知（https://docs.entropy.io/pre-ipo-perp-mechanics/no-ipo-resolution ）。没有配置单位的 `preipo` 市场（2026-10-25 的 xyz:JIO、xyz:OURA）不显示价格与结算日。
- 降级：没有 JS、请求被拒或网络错误时，显示构建时生成的名称、部署方与链接，不显示数字；错误时按全抖动指数退避重试，每次访问最多 5 次。
- 未核实：停牌状态从哪个接口读取（阶段 2 要么找到信号，要么文案只写 'not delisted'，不写 'trading'）；XYZ 的 Pre-IPO 规格（https://docs.trade.xyz/perpetuals/specifications-and-schedules/pre-ipo-specification-index ，旧地址 `/perpetuals/markets/pre-ipo` 2026-10-25 返回 404）；`perpConciseAnnotations` 的请求权重（只在构建时调用）。

## 8 技术栈、性能、无障碍与 SEO

- 技术栈：Astro 静态输出，不用客户端 UI 框架；行情客户端手写，约 2 KB，不导入 workspace 包，也不用 SDK。版本路径：先单独一个 PR 把 `tailwindcss` 对齐到 4.1.18；再单独一个 PR 升 Astro 6，启用 Fonts API 与 CSP API；Astro 7 等全仓 Node 版本决定后再升。
- 新依赖只有：`big.js` 7.0.1、`@fontsource-variable/ibm-plex-sans` 5.2.8、Plex Mono（实施时固定版本）、开发依赖 `@playwright/test` 1.59.1 与 `@axe-core/playwright`。
- 测试分两组：`test`（只读源码，构建前跑）与 `test:dist`（读构建产物，构建后跑）。`website-build.yml` 在 build 步骤之后加 `test:dist`，`scripts/ci-workflows.test.mjs` 同步。
- 性能：`tests/budget.test.mjs` 用 brotli 统计 `dist` 体积（线上 CloudFront 对 HTML 与 CSS 返回 br）。预算：HTML ≤25 KB、CSS ≤14 KB、全部 JS ≤30 KB、字体 ≤75 KB（Plex Sans 拉丁预加载，Plex Mono 不预加载）、首屏图像 AVIF 手机 ≤45 KB / 桌面 ≤80 KB；交互前总量手机 ≤250 KB、桌面 ≤350 KB；视频本体与实时数据不计入；首屏以下的区块用 `content-visibility: auto`；加载后没有超过 50 ms 的长任务。
- 无障碍：目标 WCAG 2.2 AA；页面只有一个 H1；跳转链接与地标区域齐全；FAQ 用原生 `<details>`；自动更新的行情有暂停（2.2.2）；视频满足字幕（1.2.2）与音频控制（1.4.2）；涨跌除颜色外同时用符号和 ▲▼；点击目标 ≥24×24，触控 ≥44px 并有按下反馈；宽 320px 时内容重排、没有横向滚动；Playwright 里跑 axe。
- SEO：全部文案写在静态 HTML 里；结构化数据输出 Organization、WebSite、SoftwareApplication、FAQPage，视频上线后加 VideoObject；`seo.ts` 保留 `hip-3` 关键词，并加 'stock perpetuals'、'pre-IPO perpetuals'；不用「How to buy X stock」一类的标题；Search Console 与 Bing 用 DNS TXT 验证、`/apps` 收录申请，都由运营方操作。
- 安全：随 Astro 6 输出 meta CSP：`connect-src 'self' https://api.hyperliquid.xyz`（以后用 WebSocket 时再加 `wss://`）、`media-src 'self'`、`img-src 'self' data:`、`font-src 'self'`；HSTS、`frame-ancestors`、nosniff 与 Referrer-Policy 靠 CloudFront 响应头策略，由运营方在 AWS 操作。
- 衡量：官网指向终端的每个链接（CTA、首屏点名市场、行情卡、品类示例、`/markets/`）都带 `utm_source=website&utm_medium=site&utm_campaign=en_home&utm_content=<槽位>`，R6 的测试也按这个参数找链接。官网不写 Cookie，不用浏览器存储，不做地址级指标。

**2026-10-26 实施修订（平台升级）。** 上面「版本路径」一条已被取代：官网一次性升到 Astro 7.4.2（Vite 8 / Rolldown、Rust 编译器）、`tailwindcss` 与 `@tailwindcss/vite` 4.3.3、`@astrojs/sitemap` 3.7.4，均固定版本；`pnpm-lock.yaml` 只改官网自己的 importer，终端与 packages 的解析不变。Astro 7.4.2 要求 Node ≥22.23.4（在 22.18 上直接拒绝启动），官网 `package.json` 写 `engines`，两份官网工作流改用 Node 22.23.4，其余工作流仍是 22.15.0（ADR 0016 同日补记）。按 v6/v7 升级指南保留 `compressHTML: true`（v7 默认的 `'jsx'` 会吞掉行内元素与换行文字之间的空格）、改用 `astro/zod` 与 `z.looseObject()`、关闭 Shiki（内联样式过不了 CSP）。实际采用的新特性：Fonts API 从本地 Fontsource 文件自托管两款字体并只预加载 Plex Sans，但关闭了自动生成的回退字体度量（Astro 7.4.2 生成的回退字体不带子集的 `unicode-range`，会接管链接箭头 → 与涨跌 ▲▼ 的字形，截图可见）；CSP API 在每页输出上面「安全」一条的 meta CSP，`connect-src` 已加 `wss://api.hyperliquid.xyz`（Open Book 用 WebSocket），`script-src` / `style-src` 只有 `'self'` 与哈希，`Base.astro` 的两个内联块经 `Astro.csp` 加哈希；meta 写在 `<head>` 末尾，对其后的样式表、脚本、请求与 WebSocket 生效，`frame-ancestors` 等仍只能靠 CloudFront 响应头。动效与排版：跨文档 View Transitions（200 ms 根淡入淡出、页头不动、不用 `<ClientRouter />`）、`sibling-index()` 错开显现（放在 `@supports` 之后）、`@starting-style` 页签与折叠内容进入、`::details-content` 加 `interpolate-size` 的平滑展开（第 6 节「只动 transform 与 opacity」的唯一登记例外，由运营方本次要求）、容器查询、`color-mix()` 派生光晕色、标题 `balance` 与正文 `pretty` 换行、Tailwind 4.3 的 `scrollbar-none`。凡是会动的都在 `prefers-reduced-motion: no-preference` 之内。brotli 体积（首页 HTML / 全部 CSS / 全部 JS / 字体）由 18.1 / 8.1 / 13.4 / 60.4 kB 变为 18.9 / 8.4 / 13.2 / 60.4 kB（1 kB = 1000 字节），仍在本节预算之内。细节见 `apps/website/README.md` 的 Platform 一节。

## 9 文案准确性规则

这些是产品事实规则，由测试执行，不是审批环节。`copy-contract.test.mjs` 扫描 `src` 下的文本，`test:dist` 在构建产物上断言。

| 编号 | 规则 | 写法与来源 |
| --- | --- | --- |
| R1 | 第三方部署：每个 HIP-3 市场、卡片、品类卡与说明都写出部署方 fullName，并说明 {BRAND_NAME} 不审核这些市场 | 终端 `hip3-deployer-disclaimer.tsx`；条款 §1.4 与 §3.6；Hyperliquid HIP-3 文档。不写「Sairn 精选」「经审阅」 |
| R2 | 不是持股：凡是参考公司的合约，同一区块里都写明不是股份、不给所有权（03 与事实块另写分红与投票权）；Pre-IPO 另写不是 IPO 配售、现金结算 | 部署方文档（EntropyIO 原文 'A Pre-IPO Perpetual is not equity'，2026-10-25）。不用 'not securities' 一类法律定性；不写 'invest in'、'own'、'buy … stock' |
| R3 | 单位与名称：Pre-IPO 价格旁写单位；推算值叫 'implied valuation'，不叫 'market cap'；指数用部署方的名称（XYZ100 不叫 Nasdaq-100） | `deployers.ts`；部署方文档 |
| R4 | 休市定价：凡写 24/7 或 'around the clock'，同一区块里都写明交易所休市时价格来自部署方 | XYZ、EntropyIO 文档 |
| R5 | 杠杆与保证金：不写倍数，不写 'full leverage'、'max leverage'、'leverage multiplier'（'funding multiplier' 等部署方术语不在此列）；把杠杆叫杠杆，并写清亏损可能。HIP-3 文案不写 'same margin'、'shared margin'、'cross-margin'：大多数 HIP-3 市场只能逐仓（2026-10-25：xyz 116 个里 95 个，io 11 个全部，para 32 个里 29 个） | 现有 copy-contract 的杠杆禁用模式保留；`legal/riskDisclosure.md`；`metaAndAssetCtxs` 的 `onlyIsolated` |
| R6 | 风险句相邻，以区块为粒度：01、02 与 03（共用）、06、07、09 结尾各一个 `[data-cta-group]`，每组一句风险句；`/markets/` 与逐市场页用页级组；页头不放风险文字 | 测试：营销页里每个含带 `utm_source=website` 的终端链接的区块都有风险句。法律页渲染的 `legal/*.md` 自带终端链接，列为带理由的例外 |
| R7 | 受限地区：事实块按条款措辞写长版（见第 4 节 10），加 'deployers may apply their own restrictions'；首屏小字与 FAQ 用短版 'Not available in the US or other restricted locations'。都链到条款 §2.2，不手抄国家清单 | `legal/terms.md` §2.2；测试在 dist 上断言 `/terms/` 里确实有所链的锚点。终端与条款的差异由第 10 节 T4 与 ADR 0042 的发布消除 |
| R8 | 费用：数字只来自 `config/hyperliquid.ts`（现有断言保留）与快照；HIP-3 写 'deployers can set different Hyperliquid fees'，示例按 07 生成 | builder fee 的适用范围（永续两边、现货只收卖出、TWAP 不收）引 `domain/trade/order-fee-quote.ts`；HIP-3 费率不同引 `domain/trade/fees.ts` 的 `deployerFeeScale` 与 growth mode |
| R9 | 签名：按登录方式写签名方（邮箱：Privy 为账户创建的钱包；外部钱包：批准过的交易密钥）；不写不加限定的 'your keys' 或 'signed locally' | [签名机制](hyperliquid-signing.md)、ADR 0033、ADR 0038 |
| R10 | 数据驱动：市场名、部署方名、市场数与 Pre-IPO 结算日不在组件文案里手写，只来自快照、`FEATURED_MARKETS` 或 `deployers.ts` | 测试扫描组件里的 dex 前缀字面量（配置文件除外） |
| R11 | 品牌：用 `BRAND_NAME`、`APP_URL`、`APP_HOST` 等常量；`src` 的文案里不出现品牌名与域名字面量（内部标识按品牌契约另列例外） | AGENTS.md 品牌契约；新测试 |
| R12 | 始终不写：No KYC（卡入金走第三方 KYC）；12ms 一类延迟；把 VPN 当卖点（FAQ 可以引条款 §2.3 的禁止规避）；与官方应用比较；交易所与钱包品牌；图表库商标；收益率或盈亏承诺；无依据的统计；'Live on mainnet' 状态点 | 旧规划第 3 节「不写的内容」中仍然成立的部分 |
| R13 | 待真实验收再写：卡入金、邮箱钱包自动存款、Link mobile device。在那之前只写「存入 Arbitrum 上的 USDC」 | 卡入金清单 CF-11 与 ADR 0040 的真实主网验收都未做；第 11 节第 5 项 |
| R14 | 每次发布按当天的 `build-meta.json` 核对功能主张，并在任务记录里写明 release 与 commit | 发布手册 |

copy-contract 的改动：删除旧规划第 18 节拟议过、但从未实施的股票、xyz、JP225 禁用模式；新增 R2、R3、R5、R9、R12 的禁用模式；新增 R1、R2、R4、R6、R7 的正向断言；首屏改版时同步改写截图断言。

## 10 分阶段实施

| 阶段 | 交付物 | 验收 |
| --- | --- | --- |
| 1 现站修正与 HIP-3 改写（3–5 个工作日） | 见下方清单 | 依次 `test` → `astro build` → `test:dist` 全部通过；校验器与新鲜度判定是纯函数，用录下的 2026-10-25 真实响应做夹具（拒绝、畸形值、过期、dex 不符、`isDelisted: true`）；`grep -rli gatu dist` 没有输出；1440 与 390 宽各看一遍；断网时行情区一个数字也不显示；首屏 10 s 内的传输字节分页面与实时数据记入任务记录；按发布手册发布后 `curl` 线上确认 |
| 2 新版首页（约 2 周） | 见下方清单 | 第 2 节的性能、无障碍与浏览器故障矩阵通过；1024、1280、1440、390、320 宽的布局检查；Lighthouse 结果记入任务记录；中端 Android 与 iPhone 由人实测并单独记录 |
| 2b 搜索内容（不依赖视频，可与阶段 2 并行） | `/markets/` 与逐市场页；`/learn/` 的 HIP-3 与 Pre-IPO 两篇；`/llms.txt` | `/markets/` 与逐市场页没有已下架市场；站点地图包含它们；axe 通过 |
| 3 视频（视频交付后） | 05 视频位，按运营方选的放法；VideoObject；S3 上传与清单；实测 WebSocket `activeAssetCtx` | 用 ffprobe 核对第 5 节规格（含音频编码与响度）；字幕与文字稿齐全；键盘可以播放和暂停；有声内容不自动播放 |
| 4 可选：Open Book | 按旧规划第 7 节重写设计后实现，放在构建开关之后，默认关闭 | 24 h 浸泡测试、真机 Safari/iOS 与中端 Android 检查通过，并且不突破第 8 节的预算，之后才默认开启 |

2026-10-26 实施修订：阶段 4 的 Open Book 已随首页改版提前实现，形式是首屏预览的非默认页签（第 6 节），没有构建开关；该行的验收项仍然适用，结果记入任务记录。

**阶段 1 交付物：**
- 首屏换成第 3 节的文案，重拍首屏截图（第 4 节 01）；
- 删除 'Live on mainnet' 状态点、假浏览器框与 'Connected · 12ms'、'each market's full leverage'、No KYC、钱包品牌名、'Perps, not securities'，以及 Manifesto 与 FeatureSpeed 计数动画；
- `Ticker` 与 `Markets` 改为由快照、`FEATURED_MARKETS` 与运行时 `metaAndAssetCtxs` 驱动：收录全部有未下架市场的部署方，写部署方，Pre-IPO 显示隐含估值，加事实句与风险句；不再用 `allMids`，也不再留「—」；
- 按 R9 改写 FAQ；`.reveal` 默认可见；themeColor 改为读 `brand.json`；`/blog` 设 noindex 并加 sitemap `filter`；
- copy-contract 与 brand-contract 按第 6、9 节修改；拆分 `test` 与 `test:dist` 并改工作流；每日检查工作流；
- 发布手册补：快照刷新、`build-meta.json` 记录、删除页面先 `--delete --dryrun`、视频的 S3 分组。

**阶段 2 交付物：** 第 4 节的完整首页（01–10，05 除外）、`/deposit/`（含先在 Arbitrum 上取得原生 USDC 一节；第 11 节第 5 项通过后加卡入金一句）与 `/404/`；Plex 字体与第 6 节的视觉；截图采集脚本；`budget.test.mjs`、axe 与浏览器故障矩阵；Tailwind 对齐 PR 与 Astro 6 PR（各自单独提）；meta CSP。

**并行的终端任务（各自单独提 PR、单独发布）：**
- T1（2026-10-26 已提交 `c39df181`，待随终端发布）：在 `apps/terminal/src/config/hip3-deployers.ts` 增加 `io → https://docs.entropy.io/`。官网构建读这份配置，所以它是阶段 1 的前置；不加的话，访客从官网点进 io:OAI、io:ANTH，终端的免责弹窗里也没有部署方文档链接。
- T2：终端的 Pre-launch 页签改名为 Pre-IPO，与官方终端一致（官方的 Pre-launch 指主 dex 的预上线币种）。与阶段 1 在同一周发布。
- T3：仿照官方终端，在每个 HIP-3 市场页加一条可关闭的部署方横幅。
- T4：`geo.ts` 补齐条款 §2.2 点名的地区：缅甸 `MM` 加进 `TRADE_RESTRICTED_COUNTRIES`；克里米亚 UA-43、塞瓦斯托波尔 UA-40、顿涅茨克 UA-14、卢甘斯克 UA-09 按现有 `CA: ["ON"]` 的写法加进 `TRADE_RESTRICTED_REGIONS`，并注明这些地区的 IP 区域定位误差较大。
- T5：ADR 0041 的头部仍写「未发布」，实际上 p32 已上线，需要修正。
- ADR 0042（日本）的合并与发布排在阶段 1 上线之前或同时：生产分支 `main` 的 `geo.ts` 仍拦截日本，而条款 §2.2 没有列日本，官网又只链到条款。

**并行的文档任务（本文之外的文件）：** W1、W2 已随本文同一批提交完成（2026-10-25）；以后再出现旧闸门措辞时按 W1 处理。
- W1 清理旧闸门措辞：`deploy/website/README.md` 第 4 条改为「法律页改动由运营方对当前版本书面确认（记录确认人、日期与提交）」；ADR 0042「取得日本律师的书面意见之前，不发布」一句与[日本营销邮件 README](marketing/jp-launch-email/README.md) 的律师闸门按决定 2 改写为运营方陈述；在旧规划与审阅包开头加「已被 website-plan.md 取代」的链接。
- W2 `docs/README.md` 的官网与审阅包入口改指本文；在 `docs/work-memory/sessions/` 新建或更新任务记录，然后跑 `pnpm memory:index`、`pnpm memory:check` 与 `pnpm memory:test`。

每次推送、开 PR、合并和发布，以及 AWS、GitHub 上的改动，都要运营方单独批准（AGENTS.md）。

## 11 仍需运营方提供或决定

| # | 事项 | 推荐 |
| --- | --- | --- |
| 1 | 提供视频母版、分轨、字幕稿与文字稿（第 5 节） | 先做约 75 s 的 16:9 主版，竖版以后补 |
| 2 | 视频放法 A 或 B，视频完成后再定 | A |
| 3 | AWS：两个分发都开 CloudFront 标准日志并去掉 `c-ip`；终端分发保留 `cs-uri-query`，统计时排除带地址的路径（`/tradeHistory/<address>`、`/fundingHistory/<address>`、`/historicalOrders/<address>` 等）；给 sairn.ai 分发挂响应头策略；把 `gatu-rewrite-index` 的源码导出进仓库 | 日志在阶段 1 上线前开，基线从那天算；响应头在阶段 2 上线前 |
| 4 | Cloudflare DNS 加 TXT 记录，用于 Search Console 与 Bing 验证；提交 Hyperliquid `/apps` 收录申请 | 阶段 1 上线后就做 |
| 5 | 做一次 CF-11 真实最低额卡购买，和一次 ADR 0040 的主网自动存款 | 阶段 2 上线前做；通过后 06 与 `/deposit/` 加 'Or buy USDC with a card'，R13 相应放开 |
| 6 | 隐私政策是否加一句用途「官网聚合到达统计」（改 `legal/*.md`，按 W1 由运营方书面确认） | 加 |
| 7 | 确认 {BRAND_NAME} 与收录的部署方（XYZ、Paragon、EntropyIO、Markets By Kinetiq）以及被参考的公司之间没有赞助、合作或付费关系 | 阶段 1 上线前确认；确认之前 'independent' 只按条款 §1.4 的含义使用 |
| 8 | 选择 {BRAND_NAME} 的理由：本文只核实到界面语言一项（第 3 节）；如有更强、可核实的理由，提供后放进首屏副标题与 04 的第一张卡 | 没有时按第 3 节上线 |

**2026-10-26 实施修订。** 平台升级后与第 3 项相关的两点：一是官网页面已自带 meta CSP（第 8 节），给 sairn.ai 分发挂响应头策略时，CSP 头应与 meta 一致（以构建产物里的 meta 为准），并另加 meta 表达不了的 `frame-ancestors 'none'`；两者同时存在时浏览器取交集，不一致会挡掉页面自己的脚本。二是发布用的构建机或 CI 必须是 Node ≥22.23.4。另有一项不需运营方决定、但要跟进的技术事项：Astro 修复回退字体缺 `unicode-range` 之后，再打开 Fonts API 的回退字体度量。
