> **Draft for legal review — not for publication.**
>
> - 日期：2026-10-25。分支：`claude/japan-user-email-template-d3e2b5`（起始提交 `371674ba`）。
> - 状态：拟议，只供运营方的律师审阅。本文与 `designs/beyond-crypto-review/` 里的任何内容都没有获得批准，没有发布、上线、链接或发送，也不是产品决定。
> - 本文不是法律意见。中文部分是给律师的事实底稿与问题；英文部分（区块文案、表头、免责声明、风险句、视频字幕）每一行都是草稿，等待律师审阅。
> - 英文草稿里的产品名写作 `{BRAND_NAME}`、网址写作 `{SITE_URL}`，渲染时取 `brand/brand.json` 的值。
> - 出处写法：仓库写「路径:行号」，按本工作树 2026-10-25 的读数；`docs/website-rebuild-plan.md` 正由同一会话的另一项任务修改，本文一律按提交 `371674ba` 中的版本给行号。网页写 URL，访问日期都是 2026-10-25：由调研 Agent 用 curl 取得，作者读的是保存的副本。原始接口响应与网页副本没有入库，其中的链上记录含完整地址，不外发。
> - 查不到或没有独立核对的写「未核实」。美国、英国、欧盟、新加坡、日本等地的法规内容，凡来自 Agent 自己的知识或 Agent 网页调研，都标「Agent 先验知识，未核实」。
> - 对第三方文档只做转述；直接引用只用于部署方写在链上的市场描述或极短的原句。

# 「加密之外的市场」：律师审阅包

范围：英文官网上一个设想中的区块与两段短视频。它们介绍 Hyperliquid 上由第三方部署方运营的 HIP-3 永续市场，这些市场的参考价跟随美国上市的股票与 ETF，或跟随尚未上市的公司（例如 OpenAI、Anthropic）。本文列出与仓库现有决定的冲突、审阅包内容、事实底稿、律师问题、英文文案草稿与两版视频字幕。问题编号沿用初稿（A1–L2），新增的问题接在各组末尾。引用 `docs/website-rebuild-plan.md` 自己的决定或问题时一律加「规划」前缀（例如「规划 D1」「规划 A9」），以免与本文的问题编号混淆。

## 0 先读：与仓库现有决定的冲突

这个区块与视频和仓库里已写下的规划方向相反。律师即使同意，也还需要运营方另作决定，并改动契约测试。

| 现有决定或规则 | 出处 | 与本审阅包的关系 |
| --- | --- | --- |
| 首页市场区「不放 HIP-3 股票、指数、金属或 JP225」 | `docs/website-rebuild-plan.md:231` | 本区块正是这类内容 |
| 律师意见前，实时数据路径不使用 HIP-3 `xyz:` 市场 | `docs/website-rebuild-plan.md:595` | 区块若显示价格或成交额就需要它（问题 J1） |
| `/markets/` 的 HIP-3 页面等律师意见 | `docs/website-rebuild-plan.md:285` | 同一问题 |
| 阶段 0 删除现站的股票永续内容（Hero、Ticker、Markets、FAQ、SEO 关键词 'hip-3'） | `docs/website-rebuild-plan.md:985`、`:990`、`:993`、`:1004`、`:1006`、`:1010`；规划 D1（推荐决定）`:1177` | 本区块会把阶段 0 删掉的品类换一种写法放回来 |
| 计划中的 copy-contract 禁用模式 `/stocks?\|equit(y\|ies)\|indices\|metal perps\|TSLA\|NVDA\|AAPL/i` 与 `xyz:`，以及发布前对 `dist` 的同类 grep | `docs/website-rebuild-plan.md:923`、`:1020`（尚未实施；现行 `apps/website/tests/copy-contract.test.mjs:18-50` 只禁 open source、MIT、fork、自托管、杠杆倍数、builder fee 措辞、19+ 链、LI.FI、no accounts、no backend、nowhere on our side） | 「不是股票」一类否定句本身也会命中 `/stocks?/i`；若批准，只能加带理由与数量的例外（`docs/website-rebuild-plan.md:760` 起的「测试与审阅」），并做变异检查（`:925`） |
| 风险表已接受「不写 HIP-3 股票与商品」，并注明主张登记表可以按语言恢复 | `docs/website-rebuild-plan.md:1161` | 恢复路径：主张登记表 `apps/website/src/config/claims.ts`（规划，尚未建）按条目与语言审批，状态有 `pending-legal`、`never-ja`（`docs/website-rebuild-plan.md:56`） |
| 日本邮件「刻意不写的卖点」：股票、指数、金属永续与日经 225/JP225 | `docs/marketing/jp-launch-email/README.md:409` | 英文站对日本访客可见，见问题 B 组 |
| 非目标：不做营销视频；不自动播放视频 | `docs/website-rebuild-plan.md:38`、`:200`（规划 A9）、`:475` | 两段视频与这条非目标冲突。同一会话的另一项任务所做的第三轮修订（与本审阅包同一次提交，规划第 26 节与规划 D24）把非目标收窄为不做 AI 生成、氛围或 3D 营销视频，只为真实终端的短录屏开了例外，并把本审阅包列为规划 D24、推荐律师书面意见之前不做不上线。本包的两段视频是纯文字字幕片，不是终端录屏，按该措辞仍需运营方另作决定 |
| 产品演示录屏只拍现货市场 | 截图与录屏的 DOM 守卫拒绝杠杆文字与 `xyz:`：`docs/website-rebuild-plan.md:518`；部署方免责弹窗：`apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx:40-49`、`:96-110` | 产品演示录屏只拍现货市场，因为永续页面会显示杠杆数字；HIP-3 市场页面打开时先出现部署方风险免责弹窗，录制程序不得代任何人勾选接受。因此两段视频都不用终端画面，`as-is/` 的截图停在弹窗打开、尚未接受的状态 |

## 1 审阅包内容

律师收到下面这些文件。除本文外，都由主会话在 2026-10-25 制作；作者写作时只读了制作中的源文件与两张截图。两段视频由 `tools/render-reel.cjs` 从本版的 `reel.html` 渲染，SHA-256 记在 `designs/beyond-crypto-review/asset-sources.json`。每次渲染之后，主会话从两个 MP4 在每屏完全显示阶段的中点（第 i 屏取 t = 3i + 1.8 秒，i 从 0 起）各抽一帧，与第 5.2、5.3 节核对；WebM 只用 PSNR 与 MP4 比较过；逐帧核对没有做。这些文件都在本地分支 `claude/japan-user-email-template-d3e2b5` 上（与规划第三轮修订同一次提交），没有推送，没有发布，也没有从任何页面链接。

| 路径 | 内容 | 说明 |
| --- | --- | --- |
| `docs/marketing/beyond-crypto-review.md` | 本文 | 冲突、事实底稿、问题清单、英文文案草稿与主张对照、两版视频字幕 |
| `designs/beyond-crypto-review/index.html` | 这个区块放在英文站上大致的样子 | 整页标为草稿。眉标题、各段文字、表格说明、选取说明、来源说明、免责声明与风险句旁标出问题编号，部分还标出主张编号（BC-n，第 4.8 节）；眉标题旁的 'A3 · F4' 指选取（A3）与官网是否需要自己的条款或免责声明（F4）。另有三种标签不是问题编号，而是文案选项或模板名：标题旁的 'T1 of 3' 是第 4.2 节的标题选项，核心说明句旁的 'S0' 是第 4.3 节的写法选项，表格转述格里的 'R1'、'R2' 是第 4.4 节的行模板。表格每行的转述、文档链接与状态格也有标签，未上市公司两行的市场格另标 D6、价格格标 J3；表头、R1 两行的市场格与价格格、部署方格与成交额格没有标签。来源说明下方有一段虚线框的审阅注（'Review note, not proposed copy: …'），与顶栏一样是审阅用的说明，不是拟议文案。表格只有四行，是人工挑选的示例（第 4.4 节）。标记价与 24h 名义成交额两列是可选列，默认隐藏，只有打开审阅开关（'Show optional data columns (question J1)'）才显示；数值取自下面带日期的快照，不是实时数据，未上市公司两行不显示价格（第 4.5 节） |
| `designs/beyond-crypto-review/data/markets-snapshot.json` | 2026-10-25T04:55:47Z 从 `POST https://api.hyperliquid.xyz/info`（`perpAnnotation`、`perpDexs`、`metaAndAssetCtxs`）读的 8 个市场 | `xyz:SNDK`、`xyz:NBIS`、`xyz:DRAM`、`xyz:EWY`、`io:SNDK`、`io:NBIS`、`io:ANTH`、`io:OAI` 的部署方注释与行情；`io` 的描述在链上为空。页面只用其中 `xyz:SNDK`、`xyz:NBIS`、`io:ANTH`、`io:OAI` 四个，其余四个的读数只作事实底稿（第 2.1 节） |
| `designs/beyond-crypto-review/media/reel-generic.mp4` | 通用版视频，约 15 秒，5 屏字幕 | 不出现公司名、市场代码与价格；没有第三方 Logo，每屏左上角有 Sairn 自己的 lockup（第 5.1、5.2 节） |
| `designs/beyond-crypto-review/media/reel-named.mp4` | 具名版视频，约 18 秒，6 屏字幕 | 增加纯文本的市场代码、部署方给出的公司名、部署方名称与参考价跟随什么；仍然没有第三方 Logo、价格与杠杆倍数；每屏左上角有 Sairn 自己的 lockup（第 5.3、5.4 节） |
| `designs/beyond-crypto-review/as-is/` | 终端现状截图，标注 "product as-is, not marketing material" | 写作时有六张：市场选择器的 Traditional Finance、HIP-3、Pre-launch 三个标签页（`selector-traditional-finance.png`、`selector-hip-3.png`、`selector-pre-launch.png`），显示杠杆徽标、价格、24h 涨跌、成交额与市场图标；以及 `io:ANTH`、`io:OAI`、`xyz:SNDK` 三个市场页打开部署方免责弹窗、尚未接受的状态（`trade-io-anth-disclaimer.png`、`trade-io-oai-disclaimer.png`、`trade-xyz-sndk-disclaimer.png`）。两张选择器截图（`selector-traditional-finance.png`、`selector-hip-3.png`）是 1440×900 视口截取后裁成 1440×729，其余四张是 1440×900（`sips` 读数，2026-10-25） |

另有同名的 `.webm` 与 `.jpg` 海报，以及下列文件：

| 路径 | 内容 | 是否审阅对象 |
| --- | --- | --- |
| `designs/beyond-crypto-review/review.js` | 填充区块表格的脚本；表格每行的英文文案只写在这个文件里（`ROWS` 与它引用的 `listedTracks`、`UNLISTED_TRACKS` 和两组文档链接常量） | 是：每行文字应与第 4.4 节的 R1、R2 示例逐字一致 |
| `designs/beyond-crypto-review/reel.html` | 视频合成页；两版字幕与常显页脚的源文字 | 是：应与第 5.1–5.3 节逐字一致 |
| `designs/beyond-crypto-review/review.css` | 区块草稿的样式 | 否，只用于制作 |
| `designs/beyond-crypto-review/tools/render-reel.cjs` | 逐帧渲染脚本（Playwright 截图 30 fps → ffmpeg） | 否，只用于制作 |
| `designs/beyond-crypto-review/README.md` | 审阅包目录的说明：运行方法、取舍与没有做的事 | 否；其中关于选取、命名与画面的说明应与本文一致 |
| `designs/beyond-crypto-review/asset-sources.json` | 截图、快照、两段视频与海报的来源与 SHA-256 | 否；视频与海报由 `tools/render-reel.cjs` 从本版的 `reel.html` 渲染，每次重渲染后由主会话刷新这里的哈希 |

依赖：页面与视频合成页从并列的 `designs/website-hero-prototype/` 目录读取两个文件。`index.html` 经 `review.css` 加载 IBM Plex Sans 字体 `designs/website-hero-prototype/fonts/ibm-plex-sans-latin-wght-normal.woff2`；`reel.html` 加载同一字体与 Sairn lockup `designs/website-hero-prototype/assets/sairn-lockup-on-dark.svg`。所以审阅包要与这两个文件一起发送，并保持两个目录并列的相对位置，字体附上它的 SIL Open Font License 文件 `designs/website-hero-prototype/fonts/OFL-IBM-Plex-Sans.txt`；否则律师只能看渲染好的两段视频，以及页面的 PDF 或打印件。缺字体时页面退回系统字体，缺 lockup 时 `reel.html` 左上角不显示标识。

截图是产品今天的样子，不是营销材料，也不受第 4 节文案规则约束：例如 `as-is/selector-pre-launch.png` 里 ANTH、OPENAI 两行的图标看起来像这两家公司的标识（作者目视的印象；是不是注册商标、由谁提供，未核实），每行都有部署方设定的杠杆徽标。

## 2 事实底稿

### 2.1 Hyperliquid 公共接口读数

两次读数：初稿在 2026-10-25 04:07–04:16 UTC 读了全部 HIP-3 dex（`perpDexs`、各 dex 的 `metaAndAssetCtxs`、`perpConciseAnnotations`、逐个 `perpAnnotation`、`spotMeta`）；审阅包的快照在 04:55:47Z 读了 8 个市场。市场随时会增删，任何定稿都要按当时数据重查。

| 事实 | 读数 |
| --- | --- |
| HIP-3 dex（`perpDexs` 的名称与 fullName） | xyz / XYZ；flx / Felix Exchange；vntl / Ventuals；hyna / HyENA；km / Markets by Kinetiq；abcd / ABCDEx；cash / dreamcash；para / Paragon；mkts / Markets By Kinetiq；io / EntropyIO |
| 未下架市场数（`isDelisted` 不为真） | xyz 116/138；para 32/39；io 11/16；mkts 5/24；flx、vntl、hyna、km、abcd、cash 都是 0（全部下架） |
| 未下架 HIP-3 市场的部署方分类（`perpConciseAnnotations` 的 `category`） | stocks 128（另有 1 个写作 'stock'）、commodities 9、crypto 7、indices 7、preipo 4、rates 3、fx 3、无分类 2，合计 164 |
| 未下架的 preipo 市场 | `io:OAI`、`io:ANTH`、`xyz:JIO`、`xyz:OURA` |
| 已下架的 preipo 市场 | `vntl:OPENAI`、`vntl:ANTHROPIC`、`vntl:SPACEX`、`para:ANTH`（下架原因未核实） |
| `io:OAI` 的链上注释 | category preipo，description 为空，displayName 'OPENAI'，keywords openai、oai。参考对象、计价单位与方法不在链上，但 EntropyIO 在自己的文档里公布了（第 2.3 节） |
| `io:ANTH` 的链上注释 | category preipo，description 为空，displayName 'ANTH'，keyword anthropic。同上，方法见第 2.3 节 |
| `vntl:OPENAI` 等（已下架）的注释 | 转述：跟踪公司总估值，以十亿美元计 |
| `para:ANTH`（已下架）的注释 | 转述：跟踪 Anthropic 一股的价值 |
| `xyz:JIO`、`xyz:OURA` 的注释与规格 | 转述：上市前市场，反映预期股价，预计 IPO 后转为普通 XYZ 永续。XYZ 的上市前规格表列 JIO 参考 Jio Platforms Limited，预计上市日 2026-10-28，宽限期到 2026-12-27；OURA 参考 Oura Inc.（Nasdaq: OURA），预计上市日 2026-10-02，宽限期到 2026-12-01；两者状态都是 Live（https://docs.trade.xyz/perpetuals/specifications-and-schedules/pre-ipo-specification-index ，2026-10-25） |
| `xyz:SNDK` 的注释原文 | "SNDK references 1 share of Sandisk Corporation common stock (Nasdaq: SNDK), quoted in USD."（`designs/beyond-crypto-review/data/markets-snapshot.json`） |
| `xyz:NBIS`、`xyz:DRAM`、`xyz:EWY` 的注释 | 分别参考 Nebius Group N.V. 的一股 A 类普通股（Nasdaq: NBIS）、Roundhill Memory ETF 的一份（Cboe BZX: DRAM）、iShares MSCI South Korea ETF 的一份（NYSE Arca: EWY），都以美元报价（同一快照） |
| 同一代码由两家部署方运营 | 快照里 SNDK、NBIS 同时存在于 `xyz` 与 `io`，参考方法不同；EntropyIO 的文档把 SNDK 的发行人写作 'SanDisk Corp.'，XYZ 写作 'Sandisk Corporation'（第 2.3、2.4 节） |
| `xyz:TSLA`、`xyz:NVDA` 的注释 | 转述：以美元报价，参考对应公司在 Nasdaq 的一股普通股 |
| `xyz:SPCX` 的注释 | category stocks；转述：参考 Space Exploration Technologies Corp. 在 Nasdaq 的 A 类普通股。XYZ 的上市前规格表把 SpaceX (SPCX) 列为 Converted，预计上市日 2026-06-12（同一页面）。SpaceX 是否已经上市，作者没有独立核对，未核实 |
| `xyz:SP500` 的注释 | 写明标普 500 指数由 S&P Dow Jones Indices LLC 授权给 trade[XYZ] 使用，并链到 https://docs.trade.xyz/legal-and-disclaimers/s-and-p-500-disclaimers （2026-10-25） |
| io dex 的权限（`perpDexs.subDeployers`） | 按动作授权给指定地址，含 `setOracle`、`haltTrading`、`setDeployerFees`、`setPerpAnnotation` 等（地址不写进本文） |
| 示例行情（只供律师了解事实，不进入任何文案） | 04:55:47Z：`io:OAI` `markPx` 1425.1，`dayNtlVlm` 约 95.8 万；`io:ANTH` `markPx` 1907.7，`dayNtlVlm` 约 980.8 万（接口单位为 USDC 名义值）。按 EntropyIO 公布的单位，价格 1 代表 10 亿美元的公司市值（EntropyIO 的说法，第 2.3 节），这两个价格分别对应约 1.43 万亿与 1.91 万亿美元的公司市值 |
| 杠杆上限（只供律师了解事实，不进入任何文案） | 每个市场由部署方设定。`io:ANTH`、`io:OAI` 在 EntropyIO 文档与终端徽标上都是 6 倍；`xyz:JIO`、`xyz:OURA` 在终端徽标上是 5 倍（`as-is/selector-pre-launch.png`；https://docs.entropy.io/asset-directory/pre-ipo-assets ，2026-10-25） |
| 现货里的代币化股票 | `spotMeta` 有 SPCXD（fullName 'Space Exploration Technologies Corp.'）、SPCXX（'Wrapped SpaceX xStock'）、EQSPCX（'EQX Tokenized SPCX'）、SPCX，各有 USDC 交易对。它们不是 HIP-3 永续，见问题 F5 |

### 2.2 HIP-3 协议规则

来源：A = https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals ；B = https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-3-deployer-actions ；C = https://hyperliquid.gitbook.io/hyperliquid-docs/trading/delisting ；D = https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees ；E = https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals 。均为 2026-10-25 读取。

| 事实（转述） | 来源 |
| --- | --- |
| 满足质押要求的任何人都可以部署 perp dex；主网要求 500k HYPE，部署后至少维持 183 天，dex 全部资产结算后才能解押，解押经 7 天队列 | A |
| 部署方负责市场定义（预言机定义与合约规格）与市场运营（设定预言机价格与杠杆上限，必要时结算）；文档提醒多数价格指数不适合作预言机来源，部署方要为自己 dex 上的全部市场承担罚没风险 | A |
| 部署方用 `setOracle` 提交价格，文档要求约每 3 秒一次；10 秒没有更新就回落到本地标记价；价格不得超过当日开盘价的 10 倍，markPx 每次最多变动 1% | B |
| 标记价由链上取中位数（预言机价加溢价的均线、外部永续价、本地标记价） | B |
| `haltTrading` 撤销该资产全部挂单，按当时的标记价结算全部持仓；同一动作也能恢复交易 | A（Settlement 一节） |
| 部署方用 `setPerpAnnotation` 自己写注释：类别不超过 15 个字符，描述不超过 400 个，`displayName` 不超过 9 个，关键词最多 2 个。注释是部署方自述，协议不审核 | B、E |
| 罚没由验证者按质押加权投票决定，不区分恶意、能力不足或私钥泄露；被罚没的 HYPE 销毁，不分给受影响的用户；协议层不介入主观争议，交给应用层与社会层 | A |
| 验证者投票下架只适用于验证者运营的主场所永续，结算到下架投票前 1 小时的时间加权预言机价；不适用于 HIP-3 | C |
| 后备清算器只接收开启了交叉保证金的资产，其余靠 ADL 保证偿付；io 的全部市场都只允许逐仓，因此推断 io 市场不在后备清算器的覆盖范围内（推断，未核实） | A；第 2.3 节 |
| growth mode 与部署方费率系数 `deployerFeeScale` 改变 HIP-3 市场的费率 | D；`docs/fee-display.md:9-15` |

### 2.3 EntropyIO（dex `io`）

所有网页访问日期都是 2026-10-25。文档首页为 https://docs.entropy.io 。

| 事实（转述） | 来源 |
| --- | --- |
| 确认 EntropyIO 就是 `io` 的三条证据：`https://entropy.io/api/markets` 返回 `"dex":"io"` 与 `"dexLabel":"EntropyIO"`；文档首页自称 "Entropy (ticker: io)"，是 HIP-3 部署方；文档写的预言机更新地址与链上 `oracleUpdater` 一致 | https://entropy.io/api/markets ；https://docs.entropy.io/about-entropy/readme |
| 文档与链上不一致：文档的部署方信息写 Full Name 'io' 与一个部署地址；链上 `perpDexs` 的 fullName 是 'EntropyIO'，部署方是另一个地址，文档写的那个地址在链上只是子部署方（负责 `registerAsset`、`haltTrading`、收费地址、保证金模式与部署方费率） | 同上；`perpDexs`；调研 Agent 读取的链上交易记录（未入库） |
| 预言机由 RedStone 实施与维护；上市前永续页另写，所述私募市场数据的稳健聚合由 RedStone 送上链 | https://docs.entropy.io/about-entropy/readme ；https://docs.entropy.io/market-types/pre-ipo-perpetuals |
| 界面运营方：Bursa Global Inc.（巴拿马公司）；条款适用巴拿马法，争议交新加坡国际仲裁中心（SIAC）仲裁，仲裁地新加坡；条款 Last Updated August 11, 2026；条款称界面只是接入 "permissionless Entropy Protocol" 的一种方式。Bursa Global Inc. 是否就是链上的 `io` 部署方，未核实 | https://entropy.io/terms ；https://entropy.io/privacy |
| 条款点名的受限地区：美国、加拿大、巴拿马、英国，另加制裁对象；禁止用 VPN、代理、Tor 规避 | https://entropy.io/terms（§2.2） |
| 文档的受限地区页列得更长：美国及其属地、加拿大、古巴、委内瑞拉；欧盟与欧洲经济区的奥地利、比利时、保加利亚、克罗地亚、塞浦路斯、捷克、丹麦、爱沙尼亚、芬兰、希腊、匈牙利、冰岛、意大利、拉脱维亚、列支敦士登、立陶宛、卢森堡、马耳他、挪威、波兰、葡萄牙、罗马尼亚、斯洛伐克、斯洛文尼亚、西班牙、瑞典、奥兰群岛；英国、俄罗斯、乌克兰；澳大利亚、伊朗、缅甸、朝鲜、新加坡、叙利亚。不含日本，也不含法国、德国、爱尔兰、荷兰（原因未核实）。这些限制是否约束用户经由第三方界面（例如 Sairn）交易 io 的市场，未核实 | https://docs.entropy.io/legal-and-disclaimers/restricted-jurisdictions |
| 上市股票与 ETF（SNDK、NBIS、IONQ、GPRO、EWY、DRAM）与港股（XIAOMI、TCNT）：主上市场所常规交易时段内，预言机价等于该场所的价格；其他时间（隔夜、周末、假日、盘中停牌、数据过期）用本市场盘口的 5 分钟 EMA 与外部价按深度加权混合，内部权重最高 0.95，外部价固定在收盘价，或改用该股「approved after-hours venue」的中间价；交易时段外标记价被限制在最后价上下 1/最大杠杆以内 | https://docs.entropy.io/market-types/equity-perpetuals ；https://docs.entropy.io/equity-perp-mechanics/oracle-price ；https://docs.entropy.io/equity-perp-mechanics/limit-up-limit-down-luld |
| 股票类公司行动：并购或退市，按主场所最后交易日前一天的价格用 `haltTrading` 结算；拆股，按除权日前一天的价格结算，之后可能另开新市场；现金分红不做调整 | https://docs.entropy.io/market-types/equity-perpetuals |
| 文档称股票永续「不是股权」，不代表所有权、投票权、分红或对发行人的任何请求权，持有人与该公司没有任何关系 | 同上 |
| 上市前市场的参考发行人：ANTH 为 Anthropic PBC，OAI 为 OpenAI Group PBC；以 USDC 计价，只允许逐仓 | https://docs.entropy.io/asset-directory/pre-ipo-assets |
| 上市前市场按公司市值（EntropyIO 的说法）计价：价格 1 代表参考公司 10 亿美元的市值；EntropyIO 对未上市公司也用 'market cap'，理由是私募融资轮的股数不确定；IPO 之后仍按市值计价，因为 HIP-3 尚不支持按常数缩放。用词：本文照 EntropyIO 写作「公司市值」，英文草稿写 'company market capitalisation'；它是市值，不是企业价值（enterprise value） | https://docs.entropy.io/market-types/pre-ipo-perpetuals |
| 上市前市场的预言机：本市场盘口中间价的 5 分钟 EMA，与外部私募市场数据的稳健聚合按可成交深度加权混合；外部来源可能包括其他衍生品、私募估值来源、融资轮与二级交易；每个来源有一个内部稳健性评分，评分反映时效、深度与历史可靠性，评分高的来源权重更大；文档称 'The scoring and aggregation procedure is internal'，没有公布具体程序；外部价一律换算为市值；外部数据可用时至少保留 5% 权重 | https://docs.entropy.io/pre-ipo-perp-mechanics/oracle-price |
| 灾难性边界：上市前，公布的标记价与预言机价被夹在每个资产的上下界之内（ANTH 300–4,200，OAI 200–3,000）；资产参数页写上下界与参数 x 按与持仓量上限相同的周期复核，可由市场运营方自行决定更新（文档写 'market operator'，本文把它读作 EntropyIO）；盘口本身不受限，成交价可以落在边界之外 | https://docs.entropy.io/pre-ipo-perp-mechanics/extreme-mark-bounds ；https://docs.entropy.io/asset-directory/pre-ipo-assets |
| 上市路径：宣布上市前 3 天，预言机改为标记价的 1 小时 EMA；公开股价可观察后改用上市股票的预言机制度；上市推迟或撤回则回到上市前制度 | https://docs.entropy.io/market-types/pre-ipo-perpetuals |
| 未上市结算：合约在宣布后 2 年到期（ANTH 2028-08-18，OAI 2028-09-02），到期仍未上市则按标记价 6 个月 TWAP 现金结算；运营方提前发结算通知时按 30 天 TWAP；发生并购按并购对应的市值结算，无法确认时按 30 天 TWAP；运营方保留修改结算标准的权利 | https://docs.entropy.io/pre-ipo-perp-mechanics/no-ipo-resolution ；https://docs.entropy.io/asset-directory/pre-ipo-assets |
| 文档自相矛盾：Legal & Disclaimers 页写到期未上市按 30 天 TWAP 结算，与上一行的 6 个月不一致 | https://docs.entropy.io/legal-and-disclaimers/legal-and-disclaimers |
| 文档称上市前永续不是股权，不给所有权、投票、分红、信息权、IPO 配售或对发行人的请求权，持有人与参考公司没有关系 | https://docs.entropy.io/market-types/pre-ipo-perpetuals |
| No Affiliation：交易所与任何被参考的发行人、指数提供方或商品机构没有关联、背书或合同关系，名称与代码只用于识别标的。这是 EntropyIO 对自己的声明，不覆盖 Sairn | https://docs.entropy.io/legal-and-disclaimers/legal-and-disclaimers |
| 上市时的初始预言机价：ANTH 1000（2026-08-19），OAI 1250（2026-08-17）；怎样定的，文档没有写，未核实 | 调研 Agent 读取的链上交易记录（未入库） |
| PRL：链上 category 是 crypto，displayName 'PEARL'；文档把它归为 Pre-Listing 资产，参考发行方写 'Pearl'，外部价源权重 Safetrade 0.9、OTC 0.1，在流动性足够的场所上市后改用 Hyperliquid 的标准加密资产预言机。它是加密资产的上市前市场，不是公司，本文不把它当公司举例；Pearl 究竟是什么，未核实 | https://docs.entropy.io/asset-directory/pre-listing-assets ；`perpConciseAnnotations` |
| 变更通知：Legal 页称重大变更至少提前两周在 changelog 发布；2026-10-25 文档站的 sitemap 里没有 changelog 页，`/changelog.md` 返回 Page Not Found | https://docs.entropy.io/legal-and-disclaimers/legal-and-disclaimers ；https://docs.entropy.io/changelog.md |
| 名称：io 的 displayName 由子部署方用 `setPerpAnnotation` 设置（ANTH 2026-08-26，OPENAI 2026-09-02）；io 的描述字段在链上全部为空；EntropyIO 自己的界面用 'OpenAI'、'Anthropic'、'Sandisk'、'Nebius' 等名称，每个市场配有 logo 地址（图片内容未查看） | 链上交易记录（未入库）；`designs/beyond-crypto-review/data/markets-snapshot.json`；https://entropy.io/api/markets |
| Sairn 终端：部署方文档链接表里没有 `io`，因此 io 市场的免责弹窗走「无文档链接」的版本；io 的链上描述为空，市场信息弹窗对 io 市场不显示描述（按源码推断）。也就是说，终端用户在终端里看不到 EntropyIO 已公布的方法 | `apps/terminal/src/config/hip3-deployers.ts:3-9`；`apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx:85-93`；`apps/terminal/src/components/trade/components/market-asset-info.tsx:81-93`、`:164-171`；`as-is/trade-io-oai-disclaimer.png` |

### 2.4 XYZ（dex `xyz`，trade[XYZ]）

所有网页访问日期都是 2026-10-25。

| 事实（转述） | 来源 |
| --- | --- |
| 文档列出的部署地址与链上 `perpDexs.deployer` 一致；链上 fullName 'XYZ'；价格中继由 trade[XYZ] 团队维护，约每 3 秒更新 | https://docs.trade.xyz/architecture |
| trade[XYZ] 以 `xyz` 这个 HIP-3 部署发行永续，定义上市、预言机输入、杠杆上限等参数；trade.xyz 网站是一个非托管界面，不是这些市场的唯一入口 | https://docs.trade.xyz/overview/relationship-to-hyperliquid |
| 界面运营方 XYZ Ltd，适用英属维尔京群岛法；条款 Last Updated September 6, 2026；条款明确 XYZ Ltd 是 Events（HIP-4）的部署方。XYZ Ltd 是否就是 `xyz` 的 HIP-3 部署方，未核实 | https://trade.xyz/terms |
| 受限人员：美国、加拿大、英国，XYZ 另行指定的地区，制裁地区（克里米亚、古巴、伊朗、朝鲜、叙利亚、缅甸、顿涅茨克、卢甘斯克），以及使用需要未取得许可的地区 | https://trade.xyz/terms（§2.2） |
| 通用声明：禁止美国人与美国境内访问；信息不构成建议、推荐或招揽 | https://docs.trade.xyz/legal-and-disclaimers/general-disclaimer |
| 美股：每份合约对应 1 股（见第 2.1 节注释）；文档称外部定价是 24/5，从周日 20:05 到周五 20:00（美东时间），由盘前、盘中、盘后与隔夜四个时段合成，隔夜由 Blue Ocean ATS 提供。周末在这个窗口之外 | https://docs.trade.xyz/perpetuals/markets/stocks/us |
| 假日休市：XYZ 公布影响其永续市场的外部市场假日休市表，按品类分列；其中 Equities 一类在新年、感恩节、圣诞节等日全日休市，个别日子提前收市 | https://docs.trade.xyz/perpetuals/specifications-and-schedules/holiday-closures |
| 外部价：外部市场开市时等于预言机价；外部市场休市时，外部价固定在外部收盘价，预言机改用内部定价机制推进 | https://docs.trade.xyz/perpetuals/mechanics/external-price |
| 内部定价：外部输入不可用时，预言机按本市场盘口的冲击买卖价与预言机价之差，以 30 分钟时间常数的连续时间 EMA 推进，起点是最后的外部价；外部输入恢复后，下一个 tick 回到外部价 | https://docs.trade.xyz/perpetuals/mechanics/oracle-price |
| 推断，不是部署方原话：周末与假日外部市场休市，这时预言机按本市场的盘口价格推进。这四页没有一句同时写到周末或假日与内部定价；这个结论是把上面四行合起来得出的 | 本表上面四行；第 4.4 节、BC-18 |
| 公司行动：现金分红不直接付给持仓人；拆股与反向拆股会结算现有持仓、按新基准重开；并购等事件逐个评估，可能结算、改条件重开或永久关闭 | https://docs.trade.xyz/perpetuals/corporate-actions |
| 永续风险：只提供合成价格敞口，不给标的资产或发行人的所有权、投票、分红等权利；外部市场休市时用内部信息定价；公司行动可能导致调整、结算或停牌；以 USDC 结算，USDC 不等于美元 | https://docs.trade.xyz/legal-and-disclaimers/perpetuals-risks-and-disclaimers |
| 上市前（IPOP）市场：不是股份、IPO 配售、代币化股权或证券权益；初始参考价由 XYZ 自行设定，文档称它不是预测，也不是上市价的指示；上市前用内部定价；上市后预计转为普通股票永续 | https://docs.trade.xyz/perpetuals/markets/pre-ipo-perpetuals |
| 上市前风险：与所参考的发行人、承销商、交易所无关联（除非另有说明）；上市前可能没有可靠的公开价格；上市推迟、取消或改变结构时，市场可能被停牌并结算 | https://docs.trade.xyz/legal-and-disclaimers/perpetuals-risks-and-disclaimers/pre-ipo-perpetual-markets-risks-and-disclaimers |
| 指数名称：标普 500 写明已授权给 trade[XYZ] 并附商标声明；单只股票没有找到类似的授权或商标说明 | 第 2.1 节 `xyz:SP500` 一行；调研 Agent 对 XYZ 文档的检索 |

### 2.5 io 的五个「已下架」市场

2026-10-25 的读数里，io 有 5 个市场的 `isDelisted` 为真：`io:SBE`、`io:H100`、`io:MOONSHOT`、`io:NVDA`、`io:SKHX`。

| 市场 | 注册时间（UTC，子部署方的 `registerAsset`） |
| --- | --- |
| `io:SBE` | 2026-09-05 |
| `io:H100` | 2026-10-12（2026-10-05 曾因拍卖价下 gas 不足注册失败） |
| `io:MOONSHOT` | 2026-10-19 |
| `io:NVDA` | 2026-10-23 |
| `io:SKHX` | 2026-10-24 |

证据显示的情况：这五个市场都已注册，但看起来从未开盘。在线的 io 市场都是先注册、再由部署方发一笔 `haltTrading`（`isHalted:false`）开盘；这五个市场没有这笔开盘交易，EntropyIO 自己的 `/api/markets` 也不列出它们；`io:NVDA` 与 `io:SKHX` 是读数前一两天才注册的，可能只是还在等开盘。

没有核实的部分：

- 它们为什么处于「已下架」状态，EntropyIO 没有说明。「新注册资产在开盘前显示为 `isDelisted:true`」只是推断，Hyperliquid 文档没有写。
- 它们各自参考什么，未核实。
- 接口对任何已下架的 HIP-3 市场都不返回 K 线与资金费，所以「没有 K 线」本身证明不了什么，上面的判断靠的是交易记录。
- 链上浏览器接口每个地址最多返回约 300 笔交易；负责注册的子部署方只有 65 笔，推断是完整历史。

来源：调研 Agent 2026-10-25 读取的链上交易记录与 `metaAndAssetCtxs`（未入库）；https://entropy.io/api/markets（2026-10-25）。

### 2.6 Sairn 自己的条款、地区与终端行为

| 事实 | 出处 |
| --- | --- |
| 条款的适用对象是 app.sairn.ai 上的交易界面（the Interface），没有点名官网 | `legal/terms.md:5-9`；规划同样指出隐私与 Cookie 政策说的是 the Interface（`docs/website-rebuild-plan.md:67`） |
| Sairn 是独立界面提供方，不是 Hyperliquid Corp.、Hyper Foundation、验证者或第三方市场部署方 | `legal/terms.md:18-24`（§1.1） |
| Sairn 不控制撮合、结算、市场参数与预言机价格 | `legal/terms.md:28-33`（§1.2） |
| 不是经纪商、交易所、投资顾问或托管人，也不是交易对手 | `legal/terms.md:35-40`（§1.3） |
| 界面可以显示 HIP-3 等无许可部署的市场；由独立部署方运营；收录可能基于公开元数据、链上活动等中性标准；Sairn 没有审计、批准、背书或核实任何市场、部署方、预言机或文档 | `legal/terms.md:42-49`（§1.4） |
| 显示一个市场不代表界面、协议或该市场取得任何许可 | `legal/terms.md:75-80`（§1.7） |
| 受限人员：美国、中国、加拿大安大略省；全面制裁地区，点名克里米亚、古巴、伊朗、朝鲜、叙利亚、缅甸、顿涅茨克、卢甘斯克；以及 Sairn 认定的其他地区 | `legal/terms.md:90-99`（§2.2） |
| 禁止用 VPN、代理等规避 | `legal/terms.md:101-107`（§2.3） |
| 用户自行判断当地是否允许，包括证券与衍生品法律 | `legal/terms.md:109-115`（§2.4） |
| 杠杆放大亏损；可能损失投入交易的全部金额，在法律与协议允许时可能更多 | `legal/terms.md:133-139`（§3.2） |
| 第三方部署市场的风险；免责声明、分类标签、部署方链接不构成 Sairn 的尽调或背书 | `legal/terms.md:166-171`（§3.6） |
| 内容不是投资建议，也不是建仓、持仓或平仓的推荐 | `legal/terms.md:202-207`（§5.1） |
| 可能收取 builder fee，在交易流程中披露 | `legal/terms.md:224-229`（§6.1） |
| Sairn 可以限制某个市场的显示或某地的访问 | `legal/terms.md:255-260`（§7.2） |
| 部署方文档等第三方链接只为方便，Sairn 不控制其内容 | `legal/terms.md:262-267`（§7.3） |
| Hyperliquid、钱包、部署方、代币与第三方的名称与标识属于各自所有人 | `legal/terms.md:297-299`（§10） |
| 英格兰与威尔士法，伦敦 LCIA 仲裁，集团诉讼放弃 | `legal/terms.md:359-374`（§13.2–§13.3） |
| 风险披露 §5：HIP-3 市场由第三方独立部署与运营，部署方定义合约规格、预言机方法、杠杆上限与结算行为；可能流动性低、交易时间特殊、下架风险更高；显示不代表 Sairn 审核或背书 | `legal/riskDisclosure.md:50-57` |
| 风险披露 §4：标记价与预言机价可能与订单簿、外部场所或预期不同；市场休市、预言机延迟或错误会造成意外的资金费、触发或清算 | `legal/riskDisclosure.md:42-48` |
| 风险披露 §3：逐仓的保证金也可能全部损失；全仓、统一账户与组合保证金跨持仓共享保证金，包括 HIP-3 市场 | `legal/riskDisclosure.md:25-36` |
| 条款与风险披露都没有明文写「永续合约不赋予所参考公司的所有权、分红或投票权」，也没有上市前市场、转换或公司行动的专门说明 | 读 `legal/terms.md` 与 `legal/riskDisclosure.md` 全文（2026-10-25）后的结论 |
| 生产分支 `main` 的交易受限国家：US、CN、CU、IR、KP、SY、JP | `git show main:apps/terminal/src/config/geo.ts` 第 9 行 |
| 本分支删除了 JP（ADR 0042，未合入 `dev`、未发布，未取得日本法律意见）；地区规则只有国家级与 CA-ON | `apps/terminal/src/config/geo.ts:9`、`:13-15`；`docs/adr/0042-japan-allowed-trading-region.md:3`、`:36` |
| `geo.ts` 的清单没有缅甸，也没有克里米亚、顿涅茨克、卢甘斯克，但注释要求与条款 §2.2 同步 | `apps/terminal/src/config/geo.ts:1-9`、`:13-15`；对照 `legal/terms.md:96` |
| 代理、VPN、Tor、匿名与 iCloud 专用代理一律按受限处理；地区判断失败时交易与资金操作关闭 | `apps/terminal/src/lib/geo/ipdata-geo.ts:38-48`；`apps/terminal/src/lib/geo/get-geo.ts:32-37` |
| 受限访客仍可浏览只读界面，只拦截下单、Agent 授权与资金操作；限制按国家一刀切，不按部署方或市场品类 | `docs/adr/0042-japan-allowed-trading-region.md:9`；`apps/terminal/src/config/geo.ts:26-33` |
| 终端读取全部 dex，没有部署方或市场白名单 | `docs/marketing/jp-launch-email/README.md:393` |
| 终端的 HIP-3 免责弹窗：说明市场由第三方无许可部署、未经审核、风险较高；有部署方文档链接时链过去，没有时只说「查看可得的部署方信息」；需勾选确认后才能继续 | `apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx:52`、`:58-61`、`:65-69`、`:73-93`、`:103-106` |
| 确认只记一次：存在本浏览器的 localStorage，版本号为 1，对所有部署方与所有品类通用，不与钱包地址绑定 | `apps/terminal/src/stores/use-hip3-disclaimer-store.ts:23-35`、`:50-52`；`apps/terminal/src/config/app.ts:40`；`apps/terminal/src/lib/storage/validated-storage.ts:4-36`；`apps/terminal/src/hooks/trade/use-hip3-disclaimer.ts:14-24` |
| 终端只为 xyz、hyna、cash、mkts、para 配了部署方文档链接，没有 io | `apps/terminal/src/config/hip3-deployers.ts:3-9` |
| 市场选择器有 'Traditional Finance'、'HIP-3'、'Pre-launch' 三个范围；子分类写 'Stocks'、'Pre-IPO'；'Traditional Finance' 收 stocks、indices、commodities、fx、preipo 五类，'Pre-launch' 只收 preipo | `apps/terminal/src/components/trade/chart/token-selector-content.tsx:87`、`:88`、`:90`、`:119`、`:127`；`apps/terminal/src/components/trade/chart/token-selector-categories.ts:30-36`、`:113-118` |
| 选择器每行显示部署方设定的杠杆上限徽标 | `apps/terminal/src/components/trade/chart/token-selector-row.tsx:203-205`、`:275`；`as-is/selector-*.png` |
| 终端的市场选择器用部署方的 displayName 显示市场名（`io:OAI` 显示为 OPENAI-USDC）；点进市场页后，标题、图表图例与订单簿显示的是 OAI-USDC 与 Size (OAI)（截图在免责弹窗后面是模糊的，放大后可辨认）。终端还在市场信息弹窗里原样显示部署方写的描述，不标来源 | `apps/terminal/src/components/trade/chart/token-selector-categories.ts:166-173`；`as-is/selector-pre-launch.png`；`as-is/trade-io-oai-disclaimer.png`；`apps/terminal/src/components/trade/components/market-asset-info.tsx:119-127`、`:164-171` |
| 终端从 `https://app.hyperliquid.xyz/coins/<name>.svg` 加载市场图标，HIP-3 市场也一样；`as-is/selector-pre-launch.png` 里 ANTH、OPENAI 两行的图标看起来像这两家公司的标识（目视印象；商标归属与提供方未核实） | `apps/terminal/src/config/app.ts:50`；`apps/terminal/src/domain/market/tokens.ts:26-38` |
| 终端源码里有 Sairn 自己写的一段 SPCXD 说明：称它是通过 Dinari dShares 发行的 SpaceX 代币化表示、是 HyperCore 上第一个可现货交易的代币化美国股票，部分权利冻结。「第一个」的依据未核实 | `apps/terminal/src/components/trade/components/market-asset-info.tsx:65-75`（`main` 也有） |
| builder fee 0.01%：配置 `f: 10`；除 TWAP 外的永续订单都要求 builder fee，仓库里没有按市场类型排除 HIP-3；协议层对 HIP-3 是否同样收取，文档没有明写，未核实 | `apps/terminal/src/config/hyperliquid.ts:5`；`apps/terminal/src/components/trade/tradebox/trade-panel.tsx:316`；`packages/hl-react/src/registries/exchange.ts:33` |
| HIP-3 市场费率由部署方的费率系数与 growth mode 决定，可能改变 | `docs/fee-display.md:9-15`；`docs/marketing/jp-launch-email/README.md:366` |

### 2.7 官网现状与同行

| 事实 | 出处 |
| --- | --- |
| 现站市场区列 TSLA、NVDA、AAPL、JP225、SILVER（`xyz:`），用公司全名（Tesla、NVIDIA、Apple、Nikkei 225），标签 'Equity perp'；三点说明里有 'Around the clock' 与 'Perps, not securities' | `apps/website/src/components/Markets.astro:2-11`、`:13-26`、`:33-38` |
| 现站 FAQ 'Can I really trade stocks here?' 回答 'They are perps, not securities'；另一条写 'New markets appear automatically' | `apps/website/src/config/faq.ts:19-20`、`:32` |
| 现站首屏写 'Crypto, stocks, and indices' 与 "each market's full leverage" | `apps/website/src/components/Hero.astro:32` |
| 同行：Lighter 首屏轮换资产类别；Based 的 H1 写股票、加密、商品与 24/7；调研把「什么都能交易」列为 2026 年的叙事 | `docs/website-industry-research-2026-10.md:52`、`:61`、`:119`。同行这样做不代表合法；调研没有记录同行怎样披露股票永续的风险与地区限制（调研时 WebFetch 失败，`:22`） |

## 3 律师问题清单

每题写明为什么问与依据。编号供回复时引用。

### A 英文站向非受限地区宣传证券挂钩衍生品

- **A1** Sairn Corp.（法人名称见 `brand/brand.json:5`；注册地、是否持有任何金融牌照或登记，仓库无记录，待运营方确认）在英文官网上向条款没有限制的地区（例如欧盟、英国、新加坡、韩国、香港）展示「参考上市公司价格的永续合约」，是否构成当地意义上的证券衍生品、差价合约或金融推广，需要牌照或推广审批？
  - 为什么：条款只说显示市场不代表取得许可（`legal/terms.md:75-80`），没有说明 Sairn 在哪里有资格推广。英国的金融推广制度、欧盟对零售差价合约的产品干预属于 Agent 先验知识，未核实。ADR 0042 记录的 Agent 调研称新加坡金管局于 2026-06-26 把 Hyperliquid 列入投资者警示名单（`docs/adr/0042-japan-allowed-trading-region.md:35`；Agent 先验知识，未核实）。
  - 两家部署方自己就不向其中几个地区提供服务：EntropyIO 限制英国、新加坡与多数欧盟、欧洲经济区国家，XYZ 限制英国（第 2.3、2.4 节）。
  - 依据：`legal/terms.md:75-80`、`:109-115`；同行写法 `docs/website-industry-research-2026-10.md:52`、`:61`。
- **A2** Sairn 对这些市场的订单收取 builder fee（仓库没有按市场类型排除），区块又专门展示这类市场。这是否使 Sairn 从「界面提供方」变成推广方或居间方？
  - 为什么：报酬随所展示市场的成交而来；日本邮件闸门已就 builder fee 的路由提出「媒介・取次ぎ」问题，金融厅也曾因介绍场外衍生品而警告 vermilion（Agent 调研摘要，未核实）。
  - 依据：`apps/terminal/src/config/hyperliquid.ts:5`；`apps/terminal/src/components/trade/tradebox/trade-panel.tsx:316`；`packages/hl-react/src/registries/exchange.ts:33`；`docs/marketing/jp-launch-email/README.md:20`、`:37`。
- **A3** 区块若由运营方挑选几个市场作示例，是否与条款 §1.4「按中性标准收录、未背书」相矛盾？挑选标准写成什么较安全（例如「某分类下全部未下架市场」「只收公布了参考方法的部署方」），还是不应挑选？
  - 审阅页现在就是挑选的：表格只列四个市场（`xyz:SNDK`、`xyz:NBIS`、`io:ANTH`、`io:OAI`），表格下方的选取说明写明这是 Sairn 挑选的示例、不完整、不是审计、批准或推荐（第 4.2 节）。同代码的 `io:SNDK`、`io:NBIS`（EntropyIO 公布了股票方法，第 2.3 节）与 xyz 的其余未下架市场（2026-10-25 读数 xyz 共 116 个未下架市场，页面只列 2 个，第 2.1 节）都刻意没有列。
  - 与「不审阅」的张力：页面写明 Sairn 读过部署方文档、按是否公布方法挑选市场，并在每行转述方法，这本身就是一种审阅；条款 §1.4 的 'Unless expressly stated otherwise'（`legal/terms.md:47`）可能被这段选取说明触发。所以副标题删去了 'review'，只写 'does not create, price or operate them'，选取说明写 'not an audit, an approval or a recommendation'（主张 BC-3、BC-7）。这样写是否足够，还是选取说明本身就构成 §1.4 所说的「另有明示」？
  - 与终端免责弹窗的冲突：访客点进这些市场时，终端的 HIP-3 免责弹窗写 'These markets are surfaced based on onchain activity and are not reviewed, verified, or approved'（`apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx:59-60`；`as-is/trade-io-oai-disclaimer.png`、`as-is/trade-xyz-sndk-disclaimer.png` 里可见）。官网却说这些市场是 Sairn 按部署方是否公布方法挑选的，并逐行转述方法。对同一批市场，两处对「怎样选出来」与「有没有审阅」的说法不一致。两者能否并存，还是必须改其中一处？改终端弹窗是终端改动，需要另行批准。
  - 依据：`legal/terms.md:42-49`、`:166-171`；`apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx:59-60`。
- **A4** 现站写 'Perps, not securities'（`apps/website/src/components/Markets.astro:23-24`、`apps/website/src/config/faq.ts:20`），这是 Sairn 自己作出的法律定性。是否应删除，只写事实（无所有权、分红、投票权）？第 4 节按「只写事实」起草。
- **A5** 除条款 §2.2 已点名的地区外，是否还有地区应对这类品类单独排除？部署方自己的限制是否要在 Sairn 的页面上同样声明：EntropyIO 的条款点名美国、加拿大、巴拿马、英国，文档另列多数欧盟与欧洲经济区国家、澳大利亚、新加坡等；XYZ 点名美国、加拿大、英国？
  - 为什么：部署方不向某地提供服务，Sairn 却在该地展示并对成交收费，可能被看作替部署方绕开它自己的限制。部署方的限制是否约束经第三方界面的交易，未核实。
  - 依据：`legal/terms.md:90-99`；https://entropy.io/terms 、https://docs.entropy.io/legal-and-disclaimers/restricted-jurisdictions 、https://trade.xyz/terms（2026-10-25）。
- **A6** 英文站是否需要「本站不面向下列地区居民」的声明（担保文言），放在区块内还是页脚？规划只在律师否定日语页时才加日本一条。
  - 依据：`docs/website-rebuild-plan.md:944-948`。

### B 日本居民（不做任何日语材料，但英文站对日本访客可见）

- **B1** 线上生产版本仍限制日本交易（`main` 的 `geo.ts` 第 9 行含 JP），本分支的 ADR 0042 删除了 JP 但未发布。两种状态下，英文区块对日本访客分别意味着什么？
  - 为什么：金融厅 2000-12-11 的境外网站指引看担保文言与取引防止措置（Agent 调研，Agent 先验知识，未核实）；日本邮件把股票、指数、金属永续列为不写的卖点，理由是涉及有价证券关联衍生品。两家部署方的受限清单都不含日本（第 2.3、2.4 节）。
  - 依据：`docs/marketing/jp-launch-email/README.md:35`、`:409`；`docs/adr/0042-japan-allowed-trading-region.md:3`、`:31-36`。
- **B2** 日本邮件把 `https://sairn.ai` 列为「正規のURL」。英文站有这个区块时，是否等于把它放进了邮件的推广语境？是否应规定：区块存在期间不发日本邮件，或区块上线以 ADR 0042 不发布为前提？
  - 依据：`docs/marketing/jp-launch-email/README.md:33`；`docs/website-rebuild-plan.md:1194`（规划 D18）。
- **B3** ADR 0042 若发布，是否应在终端里继续对日本限制 stocks、indices、preipo 等品类（只开放加密），而不是整体开放？
  - 为什么：现行限制只有国家级的整体开关，没有按品类的限制（见 I2）。
  - 依据：`apps/terminal/src/config/geo.ts:26-33`；`docs/adr/0042-japan-allowed-trading-region.md:9`。
- **B4** 请确认：这一区块与视频永远不出日语版（登记表状态 `never-ja`），日语页不链到它，`/ja/` 的禁用清单（「株」「指数」「`xyz:`」）继续有效。
  - 依据：`docs/website-rebuild-plan.md:56`、`:765`。

### C 美国（已受限）与其他受限地区

- **C1** 条款限制美国人（`legal/terms.md:95`），终端按 IP 拦截美国的交易（`apps/terminal/src/config/geo.ts:9`），但官网是静态站，美国访客照样能看到区块。一个美国可见、展示「参考美国上市公司价格的永续」的页面，即使不能交易，是否仍有美国证券法下「证券类掉期」的要约或招揽问题？
  - 为什么：美国对向非合格合约参与者提供证券类掉期有交易所与注册要求（Agent 先验知识，未核实）。两家部署方都禁止美国人访问。
  - 依据：`legal/terms.md:90-99`；`apps/terminal/src/config/geo.ts:9`；https://docs.trade.xyz/legal-and-disclaimers/general-disclaimer （2026-10-25）。
- **C2** IP 地区判断加代理、VPN、Tor、iCloud 专用代理的拦截，是否足以作为「合理措施」？区块里的地区句（第 4.6 节 'Trading through {BRAND_NAME} is not available to persons in the United States or other restricted locations listed in the Terms of Use'，主张 BC-12）需要多显著？
  - 这句与视频的地区句都比条款窄，见 BC-12 的缺口 (2)、(4)：条款禁止受限人员使用整个界面，页面只说交易不可用，视频连「交易」都没写；条款覆盖在美国居住、注册或主要经营的人，两处都只写 'persons in the United States'。
  - 依据：`apps/terminal/src/lib/geo/ipdata-geo.ts:38-48`；`legal/terms.md:101-107`。
- **C3** 条款 §2.2 点名缅甸、克里米亚、顿涅茨克、卢甘斯克，`geo.ts` 没有这些代码，而注释要求两者同步。区块里的地区句应链到条款，还是逐一列出？技术清单是否要先补齐？
  - 依据：`legal/terms.md:96`；`apps/terminal/src/config/geo.ts:1-9`、`:13-15`。
- **C4** 部署方的描述里写着 Nasdaq 与美国公司的股票类别（例如 `xyz:SNDK`、`xyz:SPCX`）。终端原样显示这些描述，具名版视频也写出 '(Nasdaq: SNDK)'。这是否增加与美国的连接点？
  - 依据：第 2.1 节注释读数；`apps/terminal/src/components/trade/components/market-asset-info.tsx:164-171`。

### D 未上市公司（OpenAI、Anthropic 等）作为参考标的

- **D1** 在页面或视频上写出未上市公司的名称，是否会被理解为能取得上市前股份、配售或间接持股？是否构成对公司的虚假关联或商标问题？是否触及某些地区对「上市前投资」宣传的专门规制（Agent 先验知识，未核实）？
  - 依据：第 2.1 节（`vntl:OPENAI`、`vntl:ANTHROPIC`、`vntl:SPACEX`、`para:ANTH` 已下架，`io:OAI`、`io:ANTH`、`xyz:JIO`、`xyz:OURA` 未下架）；两家部署方的上市前说明（第 2.3、2.4 节）。
- **D2** 这些公司没有交易所价格，各部署方的参考方法也不同：
  - EntropyIO（`io:ANTH`、`io:OAI`）公布了方法：按公司市值（EntropyIO 的说法）计价（价格 1 代表 10 亿美元），用本市场盘口价格与外部私募市场数据按深度加权混合，并夹在运营方可调的灾难性边界内；外部数据的评分标准（时效、深度与历史可靠性）写了，但评分与聚合程序是内部的，各来源实际得到多少权重看不到；初始价怎样定没有写，链上描述为空，终端也没有它的文档链接。
  - XYZ（`xyz:JIO`、`xyz:OURA`）按预期每股价格计价，上市前完全用内部定价，初始参考价由 XYZ 自行设定。
  - 已下架的 vntl 市场按公司总估值（十亿美元），para 按一股价值。
  - 问：页面能否在公司名旁显示一个数字？「公布了参考方法」应以什么为准：只要有公开文档，还是要求外部来源与权重也公开？或者完全不收录上市前市场？
  - 依据：第 2.1、2.3、2.4 节；https://docs.entropy.io/pre-ipo-perp-mechanics/oracle-price 、https://docs.trade.xyz/perpetuals/markets/pre-ipo-perpetuals （2026-10-25）；`apps/terminal/src/config/hip3-deployers.ts:3-9`。
- **D3** 是否必须披露上市事件带来的转换、结算与截止日风险？放在区块里，还是只放在风险披露？
  - 为什么：EntropyIO 的市场在宣布后 2 年到期结算（ANTH 2028-08-18，OAI 2028-09-02），结算价是标记价的 TWAP；文档一处写 6 个月、另一处写 30 天，自相矛盾；运营方还保留修改结算标准的权利，并承诺在 changelog 提前两周公告，但 changelog 页找不到。XYZ 的 `xyz:JIO` 预计上市日是 2026-10-28，上市推迟、取消或改变结构时可能停牌并结算。
  - 依据：https://docs.entropy.io/pre-ipo-perp-mechanics/no-ipo-resolution 、https://docs.entropy.io/legal-and-disclaimers/legal-and-disclaimers 、https://docs.trade.xyz/perpetuals/specifications-and-schedules/pre-ipo-specification-index 、https://docs.trade.xyz/legal-and-disclaimers/perpetuals-risks-and-disclaimers/pre-ipo-perpetual-markets-risks-and-disclaimers （2026-10-25）。
- **D4** 公司提出异议或部署方下架时，Sairn 是否有及时撤下页面、视频与终端显示的义务？条款 §7.2 允许限制市场显示，但没有时限。
  - 依据：`legal/terms.md:255-260`。
- **D5** 'Pre-IPO' 这个标签本身是否暗示 IPO 一定会发生？终端已经用 'Pre-IPO' 与 'Pre-launch'；草稿改用 'not publicly listed'。
  - 依据：`apps/terminal/src/components/trade/chart/token-selector-content.tsx:90`、`:127`。
- **D6**（新增）「not publicly listed」本身是事实主张。Anthropic PBC 与 OpenAI Group PBC 在 2026-10-25 是否仍未上市，作者没有独立核对，只有部署方的 preipo 分类与文档（未核实）。可以依赖部署方的分类写这句话吗，还是要写成 'described by EntropyIO as pre-IPO'？
  - 反例：部署方的上市前分类可能滞后于实际上市。XYZ 的上市前规格表给 `xyz:OURA` 写了 'Nasdaq: OURA'、预计上市日 2026-10-02，读数日已过，规格表状态仍是 Live，链上分类仍是 preipo（第 2.1 节）。OURA 是否已经上市，未核实。
  - 依据：第 2.1 节未下架 preipo 市场一行与 `xyz:JIO`、`xyz:OURA` 一行；https://docs.trade.xyz/perpetuals/specifications-and-schedules/pre-ipo-specification-index （2026-10-25）。

### E 公司名、商标与「暗示合作」

- **E1** 英文区块与具名版视频能否以指称性使用的方式写出公司名或代码？可选：只写部署方的市场代码；代码加部署方给出的公司全称（例如 'Anthropic PBC'、'Sandisk Corporation (Nasdaq: SNDK)'）并附商标声明；只写品类、不写任何公司。任何形式都不用 Logo。
  - 还要决定两件事：同一代码有两家部署方时（SNDK、NBIS 同时在 xyz 与 io），名称以哪家的写法为准（XYZ 写 'Sandisk Corporation'，EntropyIO 写 'SanDisk Corp.'）；代码用部署方文档与链上的 `OAI`（终端市场页也显示 OAI-USDC），还是终端市场选择器显示的 displayName 'OPENAI'（OPENAI-USDC）（第 2.6 节）。
  - 依据：`legal/terms.md:297-299`；`docs/website-rebuild-plan.md:515`（官网不外链币标）；第 2.1、2.3 节。
- **E2** 终端从 `app.hyperliquid.xyz/coins` 加载 HIP-3 市场图标，`as-is/` 截图里 ANTH、OPENAI 两行的图标看起来像这两家公司的标识（目视，未核实）。终端继续显示它们是否可以？
  - 依据：`apps/terminal/src/config/app.ts:50`；`apps/terminal/src/domain/market/tokens.ts:32-34`；`as-is/selector-pre-launch.png`。
- **E3** 指数名称（例如标普 500）由部署方取得授权（`xyz:SP500` 注释），交易场所名称（Nasdaq、NYSE Arca、Cboe BZX）出现在部署方描述里。Sairn 在终端或官网显示这些名称，是否需要自己的授权？（规划本来就不在官网放指数。）
  - 依据：第 2.1 节；`docs/website-rebuild-plan.md:231`。
  - ETF（新增，未决）：快照里有两个参考 ETF 的 xyz 市场（`xyz:DRAM` 参考 Roundhill Memory ETF，`xyz:EWY` 参考 iShares MSCI South Korea ETF，第 2.1 节）。ETF 是基金，不是公司：副标题的 'linked to companies'、表格说明与免责声明里的 'the companies these prices reference' 都覆盖不到基金发行方与指数提供方（例如基金名称里的 iShares、MSCI；它们各属于谁，Agent 先验知识，未核实）。本稿没有 ETF 的行模板，审阅页与视频都不收 ETF。是否另写一个 R1-ETF 模板（写明基金、发行方与指数提供方无关联），还是整类不收？
- **E4** 草稿声明 Sairn 与所参考的公司「没有关联、赞助或背书」。这需要运营方确认事实（待核实）。部署方各自有 No Affiliation 声明，但只覆盖部署方自己。两段视频每屏左上角都有 Sairn 自己的 lockup，具名版里它与第三方公司名同屏（第 5.4 节）。声明是否足够，还需要什么？
- **E5** 写出部署方名称（XYZ、EntropyIO）是否暗示合作？Sairn 与任何部署方之间是否有费用分成、推荐或其他关系，仓库无法证明（未核实）；若有，是否必须披露？
  - 'independent' 一词：副标题（'Independent deployers run …'）、核心说明句（'set by an independent deployer'）、表头（'Run by (independent deployer)'）、免责声明（'run by independent deployers'）与两段视频（通用版第 2 屏 'Reference prices set by independent deployers'、具名版第 1 屏 'run by independent deployers'）都写部署方是「独立」的。读者会把它理解为部署方与 Sairn 没有关系，但能证明的只是部署方独立于 Hyperliquid 协议、可以无许可部署（第 2.2 节），以及 Sairn 自己的条款这样称呼它们（`legal/terms.md:46`）；部署方与 Sairn 之间有没有关系，正是上面仓库无法证明的事。运营方确认之前，这个词不能定稿（BC-1、BC-4）。供律师选择的中性写法：'third-party deployers'，表头 'Run by (deployer)'。审阅页先保留 'independent'，不改文案，只在相关段落加 E5 标签。

### F Sairn（界面提供方）与第三方部署方的责任划分与披露

- **F1** 终端在市场信息弹窗里原样显示部署方写的描述，没有标注来源。Sairn 是否因此对这些描述承担责任？是否应标注 'Description provided by the deployer'？
  - 依据：`apps/terminal/src/components/trade/components/market-asset-info.tsx:164-171`。
- **F2** 终端的 HIP-3 免责确认只记一次：存在本浏览器，对所有部署方与品类通用，不与地址绑定。对股票类与上市前市场是否足够？是否需要按部署方或按品类分别确认，或保存可证明的确认记录？
  - 依据：`apps/terminal/src/stores/use-hip3-disclaimer-store.ts:23-35`、`:50-52`；`apps/terminal/src/hooks/trade/use-hip3-disclaimer.ts:14-24`；`apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx:103-106`。
- **F3** EntropyIO 在 docs.entropy.io 公布了方法，但链上描述为空，终端也没有 `io` 的文档链接，所以终端用户在终端里既看不到描述也拿不到方法链接，免责弹窗只说「查看可得的部署方信息」。应当给 `io` 补上文档链接（终端改动，另行批准），还是对没有可在终端内获取的方法说明的市场隐藏或禁止下单？
  - 依据：`apps/terminal/src/config/hip3-deployers.ts:3-9`；`apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx:85-93`；`as-is/trade-io-oai-disclaimer.png`；https://docs.entropy.io （2026-10-25）。
- **F4** 条款只覆盖 app.sairn.ai 的交易界面。官网上的区块与视频是否需要自己的使用条款或免责声明，还是在条款里把官网写进适用范围？
  - 依据：`legal/terms.md:5-9`；`docs/website-rebuild-plan.md:67`。
- **F5**（相邻问题）终端源码里有 Sairn 自己写的 SPCXD 说明（代币化美国股票、权利冻结、「第一个」），现货列表里还有 SPCXX、EQSPCX 等代币化股票。它们不是永续，比永续更接近证券本身。是否应删除 Sairn 自写的说明（尤其是「第一个」这种无依据的说法），并限制或隐藏这类现货代币？
  - 依据：`apps/terminal/src/components/trade/components/market-asset-info.tsx:65-75`；`legal/riskDisclosure.md:59-64`；第 2.1 节 `spotMeta` 读数。
- **F6**（新增）不论营销区块做不做，终端现状本身（`as-is/`：'Stocks'、'Pre-IPO' 标签，杠杆徽标，像公司标识的图标，价格与成交额）对所有访客可见，包括只能只读浏览的受限地区访客。现状是否需要先调整？
  - 依据：第 2.6 节；`docs/adr/0042-japan-allowed-trading-region.md:9`。

### G 参考价来源与下架风险的披露

- **G1** 'a reference price set by an independent deployer' 是否准确？协议文档写的是部署方负责预言机定义与设定预言机价格，标记价格再由链上按中位数算出；EntropyIO 的上市前价格又主要来自本市场盘口。写 'set' 还是 'set or supplied'，要不要提标记价？
  - 依据：第 2.2、2.3 节。
  - 补充（2026-10-25 对抗式审查，同日对照原页副本更新）：EntropyIO 文档首页写预言机由 RedStone 实施与维护；上市前永续页写，所述私募市场数据的稳健聚合由 RedStone 送上链（https://docs.entropy.io/market-types/pre-ipo-perpetuals ，2026-10-25；第 2.3 节）。oracle-price 页列出外部来源的评分标准（时效、深度与历史可靠性），并说评分与聚合程序是内部的（第 2.3 节）；R2 行据此写 'EntropyIO lists the criteria that data is scored on (recency, depth and historical reliability), but says the scoring and aggregation procedure is internal.'。仍待律师判断两点：外部输入由第三方（RedStone）送上链时，'EntropyIO sets the reference price' 是否准确；文档只用被动说法（每个来源得到一个内部评分），没有写评分由 EntropyIO 还是 RedStone 做；R2 这一句因此也用被动语态，不说由谁评分。
  - R2 的结算转述（'the market settles at an average of its recent prices'）省略了发生并购时按并购对应的市值结算（无法确认时按 30 天 TWAP，第 2.3 节）。是否必须写进区块，由律师决定（另见 D3）。运营方保留修改结算标准的权利，第一轮修复时只记在这里；第二轮审查指出 R2 行因此比 R1 行少写了部署方的处置权，现在 R2 行在结算句后加了 'EntropyIO can halt, settle or delist it, and can change these settlement terms.'（第 2.2 节 `haltTrading`；第 2.3 节）。
- **G2** 外部市场休市时用内部信息定价、公司行动调整、USDC 与美元的差异，是否必须写进区块，还是链到部署方文档与风险披露即可？两家部署方都在休市时用自己的盘口定价，EntropyIO 的「approved after-hours venue」具体是哪些场所，未核实。
  - 依据：https://docs.trade.xyz/legal-and-disclaimers/perpetuals-risks-and-disclaimers 、https://docs.entropy.io/market-types/equity-perpetuals （2026-10-25）；`legal/riskDisclosure.md:42-48`。
- **G3** 部署方可以用 `haltTrading` 按当时标记价结算全部持仓；2026-10-25 的读数里 flx、vntl、hyna、km、abcd、cash 六个 dex 的市场全部下架；协议的罚没不补偿受影响的用户。「可能按你没有选择的价格被结算或下架」应写得多显著？
  - 依据：第 2.1、2.2 节；`legal/riskDisclosure.md:50-57`。
- **G4** 页面显示的市场下架或停牌后，官网与视频必须在多长时间内撤下？规划要求下架市场停止生成、数据不可信时不显示（fail closed）。io 的五个「已下架」市场说明，`isDelisted` 也可能是「已注册、尚未开盘」，不一定意味着下架事件（第 2.5 节）。
  - 依据：`docs/website-rebuild-plan.md:285`、`:632`、`:638`。
- **G5** 风险披露 §5 已覆盖 HIP-3 的一般风险，但没有写「无所有权、分红、投票权」与上市前转换。区块里的这些句子在 Sairn 的条款或风险披露里没有依据，只在部署方文档里有，是否要先改法律文本？（见 K1）
- **G6**（新增）部署方文档会变：EntropyIO 承诺的 changelog 找不到，文档与链上的部署方信息不一致。区块或视频转述部署方的方法时，Sairn 需要多久重新核对一次，过时转述的责任由谁承担？
  - 依据：第 2.3 节。

### H 杠杆与风险句

- **H1** 官网规则不写杠杆倍数（`docs/website-rebuild-plan.md:74`；`apps/website/tests/copy-contract.test.mjs:27-30` 已禁部分写法），而部署方逐个市场设定上限。只写 'use leverage' 是否足够？'You can lose all of your margin' 对只允许逐仓的市场（io 全部如此），以及全仓、统一账户下的共享保证金，是否准确？条款还写了「在允许时可能更多」。
  - 依据：`legal/riskDisclosure.md:25-36`；`legal/terms.md:133-139`。
- **H2** 规划把凡是指向 app.sairn.ai 的链接都算 CTA，必须在同组带风险句。区块每行若有 'View in terminal' 深链，就是多个 CTA。是否应不放深链？
  - 依据：`docs/website-rebuild-plan.md:926`。
- **H3** 除通用风险句外，是否需要一句第三方市场专用的风险句（流动性、休市定价、结算）？
- **H4** 视频里的风险句：每屏都要出现，还是单独一屏、停留多久、字号多大？两版视频目前每屏 3 秒，另有常显的页脚（第 5 节）。

### I 是否按地区隐藏区块，或在终端里限制这类市场

- **I1** 官网是纯静态站，没有后端；按地区隐藏区块需要 CloudFront 的地区头或客户端地区判断。规划刻意不做按 IP 跳转，认为地理定向会加重「以日本居民为对象」的认定。按地区隐藏是更安全，还是反而更像定向？若要隐藏，隐藏哪些地区？
  - 依据：`docs/website-rebuild-plan.md:731`、`:592`（终端 `/api/*` 只供同源，官网不能用）。
- **I2** 终端现在只有国家级的整体限制，没有按品类的限制。可选做法：某些地区只读、某些地区禁止 stocks/preipo 品类下单、全球隐藏上市前市场、只允许有文档的部署方。律师建议哪一种？这是终端行为改动，需要另行批准。
  - 依据：`apps/terminal/src/config/geo.ts:26-33`；`docs/adr/0042-japan-allowed-trading-region.md:9`。
- **I3** 终端标签写 'Stocks'，区块写「不是所有权」。是否要求终端改名（例如 'Equity-referenced'）以保持一致？
  - 依据：`apps/terminal/src/components/trade/chart/token-selector-content.tsx:87`、`:119`、`:127`。
- **I4** 终端没有部署方白名单。是否应改为白名单制？
  - 依据：`docs/marketing/jp-launch-email/README.md:393`。
- **I5**（新增）是否应让终端按部署方套用该部署方自己的受限清单（例如英国访客不能交易 io 与 xyz 的市场，新加坡、澳大利亚与多数欧盟国家的访客不能交易 io 的市场）？这同样是终端改动，需要另行批准。
  - 依据：第 2.3、2.4 节；`apps/terminal/src/config/geo.ts:9`、`:13-15`。

### J 数据展示（实时价格、成交额）是否构成劝诱

- **J1** 在营销页上为这类市场显示实时价格、24h 涨跌、24h 名义成交额或持仓量，是否会被认定为劝诱或招揽？规划已把易变数值排除出 HTML，日语页只准 BTC、ETH 的美元价格。审阅页把价格与成交额两列放在默认关闭的开关后面，数值取自带日期的快照。
  - 依据：`docs/website-rebuild-plan.md:638`、`:737`；第 2.1 节示例行情。
- **J2** 24h 涨跌这种动量信息是否特别有问题？是否只允许静态的「市场存在」信息？
- **J3** EntropyIO 的上市前价格以公司市值（EntropyIO 的说法）计（价格 1 代表 10 亿美元）。在 'Anthropic PBC' 旁边显示 '1,907.7' 容易被读成每股价格，或被读成 Sairn 认可的估值。能否显示？若显示，是否必须写出单位与方法链接（https://docs.entropy.io/market-types/pre-ipo-perpetuals ，2026-10-25），来源标注（第 4.5 节的表头 'Mark price · Hyperliquid public data · hh:mm:ss UTC'）是否足够？审阅页的可选价格列对这两行只显示 '—' 与 'withheld pending J3'，不显示数字。
  - 依据：`docs/website-rebuild-plan.md:633`；第 2.1、2.3 节。
- **J4** 视频里能否出现任何价格数字、单位说明或走势？两版草稿都不出现。

### K 是否需要修改现有条款（`legal/terms.md`、`legal/riskDisclosure.md`）

- **K1** 是否需要在条款或风险披露里加入：永续合约不赋予所参考公司的所有权、分红、投票或其他权利；上市前市场的计价、转换与到期结算风险；外部市场休市时的定价；公司行动；公司名与商标只用于识别、无关联；页面选取不构成背书；适用范围扩到官网。规划规定法律文本的任何改动都要律师对当时版本的书面确认。
  - 依据：`docs/website-rebuild-plan.md:39`、`:927`；第 2.6 节「没有明文写」一行。
- **K2** 条款 §2.2 与 `geo.ts` 的差异（C3）是否需要先修正其中之一？
- **K3** 条款 §13 的英格兰法、伦敦仲裁与集团诉讼放弃，对区块面向的各地零售用户是否有效？
  - 依据：`legal/terms.md:350-374`。
- **K4** 条款 §6.1 写 builder fee 在交易流程中披露。营销页是否还要明确写出 Sairn 在这些市场的每笔成交中收费？草稿按「写出」起草。
  - 依据：`legal/terms.md:224-229`。

### L 视频

- **L1** 规划的非目标是不做营销视频、不自动播放（同一会话的另一项任务所做的第三轮修订只为真实终端录屏开了例外，与本审阅包同一次提交）。一段 15–18 秒、只有字幕的视频，能否发布、放在哪里（官网、社交账号）、是否允许自动播放？
  - 依据：`docs/website-rebuild-plan.md:38`、`:200`；社交账号尚未提供（`:1193`，规划 D17）。
- **L2** 视频离开官网传播后，没有地区控制，也看不到旁边的条款链接。是否意味着视频必须自带全部限定（地区、风险、无所有权），或根本不宜做？具名版写出了公司名，离开官网后这一风险更大。

## 4 英文区块文案草稿

> **Draft for legal review — not for publication.**

### 4.1 起草规则

- 不写杠杆倍数（`docs/website-rebuild-plan.md:74`）；把杠杆叫杠杆。
- 不用公司 Logo、币标或部署方 Logo（`docs/website-rebuild-plan.md:515`）。
- 不写 'invest'、'own shares'、'stocks'、'equity'，不写「什么都能交易」、24/7、'around the clock' 一类卖点；不写 'not securities' 一类法律定性（问题 A4）。
- 公司名只按部署方的写法转述，并写明是哪家部署方运营；部署方名称用链上 `perpDexs` 的 fullName（XYZ、EntropyIO）。
- 价格与成交额默认不出现（问题 J1）；表格里列为可选列，律师同意后才加。
- 区块默认不放进入终端的链接；若律师同意放，每个链接都在 `[data-cta-group]` 里带风险句（`docs/website-rebuild-plan.md:926`）。
- builder fee 的说法与官网现有费用断言一致（`apps/website/tests/copy-contract.test.mjs:79-101`）。
- 每条主张进主张登记表，状态 `pending-legal`，语言只 en，日语 `never-ja`（`docs/website-rebuild-plan.md:56`）。

### 4.2 标题与副标题

- 眉标题（eyebrow）：'Third-party markets on Hyperliquid'
- 标题，三选一：
  - T1：'Markets beyond crypto'
  - T2：'Perpetual contracts that reference companies'
  - T3：'Beyond crypto: third-party perpetual markets'
- 副标题：

  > Independent deployers run perpetual markets on Hyperliquid that track reference prices linked to companies, including some that are not publicly listed. {BRAND_NAME} shows these markets as an independent interface. It does not create, price or operate them.

- 副标题不写 'review'：页面自己写明按部署方是否公布方法挑选市场并转述方法，这本身是一种审阅（A3、BC-3）。

- 选取说明（放在表格下方，审阅页已显示；律师若不允许挑选示例，这段与挑选一起去掉，问题 A3）：

  > The markets listed here are examples chosen by {BRAND_NAME} because their deployers publish how the reference price is set. This is not a complete list, and being listed here is not an audit, an approval or a recommendation.

  - 'publish how the reference price is set' 本身是事实主张：EntropyIO 公布了方法的框架与外部数据的评分标准，但评分与聚合程序是内部的（第 2.3 节），这是否算「公布」由律师判断（D2）；终端免责弹窗对同一批市场写的是 'surfaced based on onchain activity and are not reviewed, verified, or approved'（A3）。审阅页在这段旁标 A3、D2、BC-7。

### 4.3 核心说明句（必须出现）

> These are perpetual contracts that track a reference price set by an independent deployer. They do not make you an owner of any company: you get no ownership, no dividends and no voting rights. A market can be halted, settled or delisted.

上句是默认写法 S0，不出现 'stock'。律师若要求明确写出「不是股票」，在下表 S1、S2 里任选其一，替换第二句：

| 写法 | 文字 | 说明 |
| --- | --- | --- |
| S0（默认） | 'They do not make you an owner of any company: you get no ownership, no dividends and no voting rights.' | 不触发计划中的 `/stocks?/i` 禁用模式 |
| S1（只作否定） | 'They are not stock in any company and give you no ownership, dividend or voting rights.' | 'stock' 只出现在否定句里；需要 copy-contract 的带数量例外 |
| S2（说明参考来源） | 'A deployer may base the reference price on a company's publicly traded stock. Holding the contract is not holding that stock: you get no ownership, dividend or voting rights.' | 解释价格从哪里来，同时否定持有；同样需要例外；只适用于部署方明确写了参考上市股票的市场 |

### 4.4 每个市场一行的说明模板

占位符：`{SYMBOL}` 部署方的市场代码（不带 dex 前缀，按 E1 的决定）；`{ISSUER}` 部署方给出的公司名；`{DEPLOYER}` 部署方的链上 fullName；`{REFERENCE_SUMMARY}`、`{METHOD_SUMMARY}`、`{SETTLEMENT_SUMMARY}` 从部署方文档转述、经律师确认的完整句子（一句或几句，各以句号结尾）；`{DOC_URLS}` 支撑该行转述的部署方方法页，一个或多个。

- 模板 R1（参考已上市公司）：ETF 没有行模板，是否另写 R1-ETF 见 E3。

  > **{SYMBOL}** · {ISSUER} · Perpetual contract on {DEPLOYER}'s market. {REFERENCE_SUMMARY} No ownership, dividends or voting rights. {DEPLOYER} can halt, settle or delist it. How the price is set: {DOC_URLS}

- R1 示例（`xyz:SNDK`）：

  > **SNDK** · Sandisk Corporation (Nasdaq: SNDK) · Perpetual contract on XYZ's market. Its reference price follows US market prices for Nasdaq: SNDK in US dollars, including pre-market, after-hours and overnight sessions; at weekends and on holidays XYZ sets it from prices in its own market. No ownership, dividends or voting rights. XYZ can halt, settle or delist it. How the price is set: https://docs.trade.xyz/perpetuals/markets/stocks/us ; https://docs.trade.xyz/perpetuals/specifications-and-schedules/holiday-closures ; https://docs.trade.xyz/perpetuals/mechanics/external-price ; https://docs.trade.xyz/perpetuals/mechanics/oracle-price

- R1 示例（`xyz:NBIS`）：与 `xyz:SNDK` 逐字相同，只把代码、公司与场所换为 'NBIS'、'Nebius Group N.V. (Nasdaq: NBIS)' 与 'Nasdaq: NBIS'。

- R1 四个链接各自支撑的部分（第 2.4 节）：stocks/us 页写 24/5 的外部定价窗口（周日 20:05 到周五 20:00，美东时间）与盘前、盘中、盘后、隔夜四个时段，周末在窗口之外；holiday-closures 页是影响 XYZ 永续市场的外部市场假日休市表，其中有 Equities 一类；external-price 页写外部市场休市时外部价固定在收盘价、预言机改用内部定价机制推进；oracle-price 页写内部机制按本市场盘口的冲击买卖价推进，外部输入恢复后下一个 tick 回到外部价。'in US dollars' 转述链上注释的 'quoted in USD'（第 2.1 节）。
  - 'at weekends and on holidays XYZ sets it from prices in its own market' 没有一页原话这样写，是几页合起来推出的（BC-18）：「假日」靠休市表加 external-price 页，「周末」靠 stocks/us 页的 24/5 窗口加 external-price 页，'from prices in its own market' 靠 oracle-price 页。旧版写 'from trading in its own market'；内部机制的输入是盘口报价（冲击买卖价），不是成交，所以改为 'prices'。
  - 任何一页都不能单独支撑这一行：例如 oracle-price 页本身没有写盘前、盘后、隔夜、周末、假日与美元报价。审阅页的链接文字是 'XYZ documentation: US stock sessions'、'XYZ documentation: holiday closures'、'XYZ documentation: external price'、'XYZ documentation: oracle price'，都带 'opens the deployer's site' 提示。

- R1 示例（`io:SNDK`，同一代码的另一家部署方；没有进入审阅页，见本节末尾的选取说明）：

  > **SNDK** · SanDisk Corp. · Perpetual contract on EntropyIO's market. During the regular session of the company's primary listing venue, its reference price follows that venue's price; at other times EntropyIO blends prices from its own market's order book with the last session price. No ownership, dividends or voting rights. EntropyIO can halt, settle or delist it. How the price is set: https://docs.entropy.io/market-types/equity-perpetuals

- 模板 R2（部署方标为上市前，问题 D1–D3、D6；律师可能要求整类不收）：

  > **{SYMBOL}** · {ISSUER} · not publicly listed · Perpetual contract on {DEPLOYER}'s market. With no exchange price for the company, {DEPLOYER} sets the reference price under a method described in its documentation: {METHOD_SUMMARY} {SETTLEMENT_SUMMARY} {DEPLOYER} can halt, settle or delist it, and can change these settlement terms. No ownership, dividends, voting or IPO allocation rights. How the price is set: {DOC_URLS}

  - ', and can change these settlement terms' 只在部署方文档保留了修改结算标准的权利时才写（EntropyIO 保留了，第 2.3 节）；否则这句只写 '{DEPLOYER} can halt, settle or delist it.'，与 R1 相同。
  - 旧版模板的固定句 'If the expected listing does not happen, {DEPLOYER} can settle the market at a price you did not choose.' 已由 `{SETTLEMENT_SUMMARY}` 与上一句代替，使模板与示例一致；'at a price you did not choose' 现在只出现在第 4.7 节的第三方市场风险句与第 5.3 节第 4 屏（BC-15）。

- R2 示例（`io:ANTH`；`io:OAI` 相同，公司名换为 OpenAI Group PBC）：

  > **ANTH** · Anthropic PBC · not publicly listed · Perpetual contract on EntropyIO's market. With no exchange price for the company, EntropyIO sets the reference price under a method described in its documentation: the price stands for company market capitalisation, blending prices from this market's order book with private-market data. EntropyIO lists the criteria that data is scored on (recency, depth and historical reliability), but says the scoring and aggregation procedure is internal. The reference price is kept within bounds that EntropyIO can change, but trades can still happen outside them. If the company has not listed by the date EntropyIO has set, or EntropyIO announces an early settlement, the market settles at an average of its recent prices. EntropyIO can halt, settle or delist it, and can change these settlement terms. No ownership, dividends, voting or IPO allocation rights. How the price is set: https://docs.entropy.io/market-types/pre-ipo-perpetuals ; https://docs.entropy.io/pre-ipo-perp-mechanics/oracle-price ; https://docs.entropy.io/pre-ipo-perp-mechanics/extreme-mark-bounds ; https://docs.entropy.io/asset-directory/pre-ipo-assets ; https://docs.entropy.io/pre-ipo-perp-mechanics/no-ipo-resolution

  - 在这个示例里，`{METHOD_SUMMARY}` 是从 'the price stands for' 到 'outside them.' 的三句，`{SETTLEMENT_SUMMARY}` 是 'If the company has not listed …' 一句。
  - 'company market capitalisation' 是 EntropyIO 自己的单位用词（'market cap'），不是企业价值（第 2.3 节）。'blending prices from this market's order book'：内部输入是本市场盘口中间价的 EMA，不是成交（第 2.3 节）。
  - 'under a method described in its documentation'：更早的版本写 'its own published method'，而那一版同一行又说评分与加权不公开，自相矛盾；EntropyIO 公布的是方法框架与外部数据的评分标准，评分与聚合程序是内部的（第 2.3 节），是否算「公布了方法」由律师判断（D2）。
  - 'EntropyIO lists the criteria that data is scored on (recency, depth and historical reliability), but says the scoring and aggregation procedure is internal'：oracle-price 页写每个外部来源有一个内部稳健性评分，反映时效、深度与历史可靠性，评分高的来源权重更大，并称评分与聚合程序是内部的（第 2.3 节）。旧版写 'How that data is scored and weighted is not published'，没有交代文档列出了评分标准。这一句用被动语态，不把评分归于 EntropyIO：文档只用被动说法，聚合结果又由 RedStone 送上链，评分由谁做仍待 G1。
  - 'kept within bounds that EntropyIO can change … trades can still happen outside them'：旧版写 'within limits EntropyIO can change'，读起来像价格被封顶；extreme-mark-bounds 页写只有公布的标记价与预言机价被夹在边界内，盘口不受限，成交价可以落在边界之外。'that EntropyIO can change' 出自资产参数页（pre-ipo-assets）：边界与参数 x 按与持仓量上限相同的周期复核，可由市场运营方自行决定更新（第 2.3 节）。
  - 预言机由 RedStone 实施与维护、聚合结果由 RedStone 送上链、发生并购时按并购市值结算，都没有写进这一行（G1、BC-18）。
  - 五个链接分别支撑（第 2.3 节）：pre-ipo-perpetuals 页，公司市值计价；oracle-price 页，与盘口价格混合、评分标准与内部的评分聚合程序；extreme-mark-bounds 页，边界只夹参考价、盘口不受限；pre-ipo-assets 页，边界数值与运营方可自行更新边界，以及参考发行人名称 'Anthropic PBC'、'OpenAI Group PBC' 与到期日；no-ipo-resolution 页，到期与提前结算以及修改结算标准的权利。'can halt, settle or delist it' 出自 HIP-3 的 `haltTrading`（第 2.2 节）。审阅页的链接文字是 'EntropyIO documentation: price unit'、'… oracle price'、'… price bounds'、'… asset parameters'、'… settlement without a listing'，不用 'pre-IPO'（D5），都带 'opens the deployer's site' 提示。
  - 可选插入（待 J3、J4）：在 'company market capitalisation' 后加 '(a price of 1 means US$1 billion)'。
  - XYZ 的上市前市场（`xyz:JIO`、`xyz:OURA`）按 XYZ 的文档另写，本稿未起草。
- 收录门槛（建议写进实现规则，不是文案）：部署方公开了参考方法文档、文档可以访问、市场在链上未下架（`isDelisted` 明确为 false），才可能生成这一行。这是必要条件，不是选取规则：满足门槛的市场远多于审阅页列出的四个。2026-10-25 时 EntropyIO 与 XYZ 都公开了方法文档；但 EntropyIO 上市前方法里，外部来源的评分与聚合程序是内部的，只列了评分标准，文档对到期结算的 TWAP 期限自相矛盾，承诺的 changelog 找不到。这是否算「公开了方法」，由律师判断（D2）。
- 审阅页的选取：四行（`xyz:SNDK`、`xyz:NBIS`、`io:ANTH`、`io:OAI`）是人工挑选的示例，与具名版视频相同，页面在表格下方用第 4.2 节的选取说明写明这一点。刻意没有收：`io:SNDK`、`io:NBIS`（同一代码由另一家部署方运营，写法与方法不同）与 xyz 其余未下架市场，待 A3、E1；参考 ETF 的市场（例如 `xyz:DRAM`、`xyz:EWY`），因为没有获批的 ETF 模板（E3）。

### 4.5 表头

| 列 | 英文表头 | 备注 |
| --- | --- | --- |
| 1 | 'Market' | 部署方代码，按 E1 的决定；同一代码可能出现两行 |
| 2 | 'Run by (independent deployer)' | 部署方 fullName，来自 `perpDexs` |
| 3 | 'What the price tracks (per the deployer)' | 模板 R1、R2 的转述句、处置权句（R1 '{DEPLOYER} can halt, settle or delist it'，R2 另加 ', and can change these settlement terms'）与权利否定句。审阅页把示例拆进各列：代码与公司名在第 1 列，'Perpetual contract on {DEPLOYER}'s market' 由第 2 列与表格说明代替，链接在第 4 列；其余文字逐字相同 |
| 4 | 'How the price is set' | 部署方文档链接，一个或多个，都是支撑该行转述的页面；链接文字形如 'XYZ documentation: oracle price'，不用 'pre-IPO'（D5）。外链提示 'opens the deployer's site'：审阅页给每个链接加读屏文字，并在格内显示一行 'Links open the deployer's site.' |
| 5 | 'Status' | 值写 'Not delisted at snapshot'，不写 'Trading'：快照只有 `isDelisted`，没有停牌状态，被 `haltTrading` 停牌的市场在快照里仍是未下架。已下架或下架状态未知的行直接移除，不显示 'Delisted'。生产实现必须对停牌或状态未知的市场 fail closed（不显示该行，也不显示为可交易）；停牌状态从哪个接口读取，未核实 |
| 可选 6（待 J1） | 'Mark price · Hyperliquid public data · hh:mm:ss UTC' | 律师同意前不加。用标记价，因为快照（`metaAndAssetCtxs`）存的就是 `markPx`；最新成交价要另取数据源。时间是快照的读取时间，写到秒（审阅页另附日期）。部署方分类为 preipo 的市场这一格显示 '—' 与 'withheld pending J3'，不显示数字（J3） |
| 可选 7（待 J1） | '24h notional volume' | 律师同意前不加。数值写作 '<数字> USDC'，不加 '$'：接口单位是 USDC 名义值（第 2.1 节），XYZ 文档明说 USDC 不等于美元（第 2.4 节） |

表格说明行（caption）：默认 S0 'Third-party perpetual markets on Hyperliquid. No ownership rights in any company.'；采用 S1 时为 'Third-party perpetual markets on Hyperliquid. Not stock in any company.'

来源说明（表格下方，选取说明之后，主张 BC-18，问题 E1）：

> Company names as each deployer writes them (XYZ's on-chain description, EntropyIO's documentation). What the price tracks: paraphrased from each deployer's documentation and, for XYZ, its on-chain description (read 25 Oct 2026).

- 'for XYZ, its on-chain description'：R1 行的 'in US dollars' 转述的是 XYZ 链上注释的 'quoted in USD'（第 4.4 节）；EntropyIO 的链上描述为空，R2 行只转述其文档。
- 审阅页在来源说明下方另有一段虚线框的审阅注（'Review note, not proposed copy: each table row follows the R1 or R2 sample in §4.4 of the review document, word for word.'），只供审阅，不是拟议文案，定稿时去掉。

### 4.6 免责声明（区块底部，正文字号与颜色）

> These markets are run by independent deployers on Hyperliquid. Each deployer defines its market, sets its reference price, contract terms and limits, and can halt, settle or delist it. {BRAND_NAME} is an independent interface. It is not Hyperliquid Corp., the Hyper Foundation or any market deployer, and it is not affiliated with, sponsored by or endorsed by the companies these prices reference. Company names are used only to identify what a reference price follows, and they belong to their owners. Trading these contracts gives you no ownership, dividend, voting or other rights in any company. {BRAND_NAME} charges a 0.01% builder fee on perpetual orders other than TWAP orders, and deployers can set their own fees. Trading through {BRAND_NAME} is not available to persons in the United States or other restricted locations listed in the Terms of Use. Not financial advice.

### 4.7 风险句

- 通用（与首屏同句，紧贴任何进入终端的链接）：

  > Perpetual futures use leverage. You can lose all of your margin. Risk disclosure →

- 第三方市场专用（问题 H3，放在表格之上或之下）：

  > Third-party markets can have thin liquidity, and their prices can move while the referenced market is closed. A deployer can settle or delist a market at a price you did not choose.

- 进入终端的链接（若律师允许，问题 H2）：'View markets in the terminal'，链到终端的市场选择器而不是某个市场的下单页；同组带上面两句。

### 4.8 主张与证据对照

主张编号用 BC-n（beyond crypto），与律师问题 H3 区分；本文旧版与审阅页旧版写作 H3-n。

| 编号 | 主张（英文原句或其要点） | 证据位置 | 状态 |
| --- | --- | --- | --- |
| BC-1 | 'Independent deployers run perpetual markets on Hyperliquid' | `legal/terms.md:42-49`；`legal/riskDisclosure.md:50-57`；HIP-3 文档（第 2.2 节） | **部分有证据，待 E5**：部署方运营这些市场、可以无许可部署，有证据；'independent' 会被读成与 Sairn 没有关系，这一点只有 Sairn 自己的条款这样称呼（`legal/terms.md:46`），仓库无法证明（E5）。同一个词也在核心说明句、表头、免责声明与两段视频里 |
| BC-2 | '…track reference prices linked to companies, including some that are not publicly listed' | 部署方注释的 stocks、preipo 分类（第 2.1 节）；部署方文档（第 2.3、2.4 节） | 有证据，但会过时；「not publicly listed」依赖部署方分类，独立核对未做（D6） |
| BC-3 | '{BRAND_NAME} … does not create, price or operate them' | 'create'、'operate'：`legal/terms.md:22-24`；'price'：`legal/terms.md:30-32` | 有证据。旧版还写 'review'（依据 `legal/terms.md:47-49`），已删：页面自己写明读过部署方文档、按是否公布方法挑选并转述方法，这本身是一种审阅，条款 §1.4 的 'Unless expressly stated otherwise' 可能被选取说明触发（A3）。终端免责弹窗对同一批市场写 'surfaced based on onchain activity and are not reviewed, verified, or approved'（`apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx:59-60`），与官网的挑选说法不一致（A3） |
| BC-4 | 'a reference price set by an independent deployer' | HIP-3 文档（部署方设定预言机价格）；`perpDexs` 的 `setOracle` 权限 | 部署方设定价格有证据；措辞待 G1；'independent' 待 E5（同 BC-1） |
| BC-5 | 'no ownership, no dividends and no voting rights'；R2 行与视频另写 'IPO allocation' | 部署方：XYZ 永续风险页与上市前页、EntropyIO 的股票永续页、上市前永续页与 Legal 页都写明（2026-10-25）；'IPO allocation'：EntropyIO 上市前永续页、XYZ 上市前（IPOP）页（第 2.3、2.4 节）；Sairn 的条款与风险披露没有（第 2.6 节）；协议层未核实 | **待核实**：建议先写进风险披露（K1）；其他部署方的市场未核实 |
| BC-6 | 'can be halted, settled or delisted' | HIP-3 文档 Settlement（`haltTrading`）；`legal/riskDisclosure.md:55`；`legal/terms.md:170`；API 读数（多个 dex 全部下架） | 有证据 |
| BC-7 | 'The markets listed here are examples chosen by {BRAND_NAME} because their deployers publish how the reference price is set. This is not a complete list, and being listed here is not an audit, an approval or a recommendation.' | 运营方的挑选规则（尚不存在）；EntropyIO 与 XYZ 的方法文档（第 2.3、2.4 节）；审阅页按此列了四个市场（第 4.4 节） | **待核实**：运营方定规则，律师定能否挑选（A3）与门槛（D2）。EntropyIO 只列出外部数据的评分标准，评分与聚合程序是内部的，'publish how the reference price is set' 是否成立待 D2；终端免责弹窗说这些市场 'surfaced based on onchain activity and are not reviewed, verified, or approved'（`apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx:59-60`），与这句的挑选理由不一致（A3） |
| BC-8 | 'not affiliated with, sponsored by or endorsed by the companies' | 仓库无法证明 | **待核实**：运营方确认（E4） |
| BC-9 | 'Company names … belong to their owners' | `legal/terms.md:297-299` | 有证据（条款只说 the Interface，F4） |
| BC-10 | '0.01% builder fee on perpetual orders other than TWAP orders' | `apps/terminal/src/config/hyperliquid.ts:5`；`apps/terminal/src/components/trade/tradebox/trade-panel.tsx:316`；`apps/website/tests/copy-contract.test.mjs:79-101` | 仓库侧有证据；协议是否对 HIP-3 收取 **待核实** |
| BC-11 | 'deployers can set their own fees' | `docs/fee-display.md:9-15`；Hyperliquid 费用文档 | 有证据 |
| BC-12 | 区块：'Trading through {BRAND_NAME} is not available to persons in the United States or other restricted locations listed in the Terms of Use'（第 4.6 节）；视频：'Not available to persons in the United States or other restricted locations'（第 5 节） | `legal/terms.md:90-99`；`apps/terminal/src/config/geo.ts:1-15`；`docs/adr/0042-japan-allowed-trading-region.md:9`；`git show main:apps/terminal/src/config/geo.ts` 第 9 行 | **部分有证据，待 C2、C3、B1**。四处缺口：(1) `geo.ts` 没有条款 §2.2 点名的缅甸、克里米亚、顿涅茨克、卢甘斯克（`legal/terms.md:96`）；(2) 地区限制只拦下单、Agent 授权与资金操作，受限访客（包括美国访客）仍能浏览只读界面（`geo.ts:1-3`；ADR 0042 `:9`），所以技术上只能说「交易」不可用；条款 §2.2 却说界面根本不供受限人员使用（'is not intended for, and may not be used by'，`legal/terms.md:92`），页面句只描述了技术上的交易拦截，比条款窄；视频（通用版第 5 屏、具名版第 6 屏的标题与常显页脚）没有写 'Trading'，也没有说什么不可用：它比技术拦截宽（只读浏览仍可用），更接近条款的「不供使用」；(3) 生产分支 `main` 拦截日本，条款却没有点名日本，本分支又删了日本（ADR 0042，未发布）；(4) 条款限制的是在美国居住、所在、注册或主要经营的人（`legal/terms.md:95`），不只是身在美国的人；页面句与视频都写 'persons in the United States'，同样比条款窄（页面句的 'listed in the Terms of Use' 在语法上只修饰 'other restricted locations'）。部署方的清单更宽（A5）。最终措辞由律师定 |
| BC-13 | 'Not financial advice' | `legal/terms.md:202-207`；页脚规划 `docs/website-rebuild-plan.md:222` | 有证据 |
| BC-14 | R2：'With no exchange price for the company' | EntropyIO Legal 页（私募估值来自稀疏、不规则的数据点）；XYZ 上市前页（上市前没有公开股价可作外部预言机）（2026-10-25） | 有证据（两家部署方）；公司是否仍未上市见 D6 |
| BC-15 | 第 4.7 节第三方市场风险句：'A deployer can settle or delist a market at a price you did not choose'；第 5.3 节第 4 屏：'A deployer can halt, settle or delist a market at a price you did not choose' | HIP-3 文档 Settlement（`haltTrading` 按当时标记价结算）；EntropyIO no-IPO resolution 页；XYZ 上市前风险页 | 有证据；EntropyIO 的 TWAP 期限自相矛盾（D3）。旧版指向 R2 模板的固定句，那句已由 `{SETTLEMENT_SUMMARY}` 代替（第 4.4 节） |
| BC-16 | 'their prices can move while the referenced market is closed' | XYZ 永续风险页与 oracle-price 页；EntropyIO 股票永续页与 Legal 页（closed-session risk）；`legal/riskDisclosure.md:46-47` | XYZ、EntropyIO 有证据；其他部署方未核实 |
| BC-17 | 'Perpetual futures use leverage. You can lose all of your margin.' | `docs/website-rebuild-plan.md:310`；`legal/riskDisclosure.md:25-29` | 有证据；准确性待 H1 |
| BC-18 | R1、R2 示例里对两家部署方方法的转述 | XYZ（R1）：24/5 外部定价窗口（周日 20:05 到周五 20:00，美东时间）与盘前、盘后、隔夜时段出自 https://docs.trade.xyz/perpetuals/markets/stocks/us ；假日休市出自 https://docs.trade.xyz/perpetuals/specifications-and-schedules/holiday-closures ；外部市场休市时外部价固定在收盘价、预言机改用内部定价机制出自 https://docs.trade.xyz/perpetuals/mechanics/external-price ；内部机制按本市场盘口的冲击买卖价推进、外部输入恢复后下一个 tick 回到外部价出自 https://docs.trade.xyz/perpetuals/mechanics/oracle-price ；'in US dollars' 转述链上注释的 'quoted in USD'。'at weekends and on holidays XYZ sets it from prices in its own market' 没有一页原话这样写：「假日时 XYZ 按本市场定价」是由假日休市表加 external-price 页推出的，「周末时」同样是由 stocks/us 页的 24/5 窗口加 external-price 页推出的，'from prices in its own market' 出自 oracle-price 页。EntropyIO（R2）：公司市值（EntropyIO 的说法）计价出自 https://docs.entropy.io/market-types/pre-ipo-perpetuals ；与本市场盘口价格混合、外部数据的评分标准（时效、深度与历史可靠性）与内部的评分聚合程序出自 https://docs.entropy.io/pre-ipo-perp-mechanics/oracle-price ；边界只夹参考价、盘口不受限出自 https://docs.entropy.io/pre-ipo-perp-mechanics/extreme-mark-bounds ；'bounds that EntropyIO can change'（边界由运营方自行决定更新）与参考发行人名称 'Anthropic PBC'、'OpenAI Group PBC' 出自 https://docs.entropy.io/asset-directory/pre-ipo-assets ；到期与提前结算及修改结算标准的权利出自 https://docs.entropy.io/pre-ipo-perp-mechanics/no-ipo-resolution ，到期日出自 pre-ipo-assets 页；'can halt, settle or delist it' 出自 HIP-3 文档（第 2.2、2.3、2.4 节，2026-10-25） | 有证据，其中 R1 的周末与假日一句是上述推断，不是部署方原话；部署方文档会变，需定期重核（G6）。R2 没有写：预言机由 RedStone 实施与维护、聚合结果由 RedStone 送上链、发生并购时按并购市值结算（G1）；文档没有写评分由谁做，R2 用被动语态（G1）。修改结算标准的权利写进了 R2 行（'and can change these settlement terms'） |

## 5 视频字幕草稿

> **Draft for legal review — not for publication.**

### 5.1 制作约束

- 不用终端录屏。产品演示录屏只拍现货市场，因为永续页面显示杠杆数字；HIP-3 市场页面打开时先出现部署方风险免责弹窗，录制程序不得代任何人勾选接受（第 0 节最后一行）。
- 画面只用文字与中性图形：没有任何公司、部署方或代币的 Logo，没有价格、走势、杠杆倍数，没有「上涨」意象，不配暗示交易所开市的音效。画面上唯一的标识是每屏左上角 {BRAND_NAME} 自己的 lockup（`designs/beyond-crypto-review/reel.html:126`；是否保留见第 5.4 节，E4、L1）。
- 每一屏的角上都常显水印 'Draft for legal review — not for publication'。定稿是否去掉，由律师决定。
- 两版都有一行常显的页脚：'Not financial advice. Not available to persons in the United States or other restricted locations. Risk disclosure: {SITE_URL}/risk/'。常显页脚能否代替单独的风险屏，见 H4。
- 旁白（可选）与字幕逐字一致；没有旁白时同样成立。每屏 3 秒，长句是否够读由律师与运营方判断（H4）。
- `{BRAND_NAME}`、`{SITE_URL}` 在画面上渲染为 `brand/brand.json` 的值。
- 视频本身没有链接。若放在官网，播放器旁要有与第 4.7 节相同的风险句与 `/risk/` 链接；若放在社交平台，见 L2。

### 5.2 通用版（`media/reel-generic.mp4`，约 15 秒，5 屏）

不出现公司名、市场代码、部署方名称与价格。

| 屏 | 时间 | 主字幕 | 小字 |
| --- | --- | --- | --- |
| 1 | 0:00–0:03 | 'Markets beyond crypto' | 'Third-party perpetual markets on Hyperliquid.' |
| 2 | 0:03–0:06 | 'Reference prices set by independent deployers' | 'Some of these markets reference companies that are not publicly listed. {BRAND_NAME} is an interface. It does not create, price or operate these markets.' |
| 3 | 0:06–0:09 | 'A contract, not ownership of a company' | 'No ownership, dividends, voting or IPO allocation rights. A market can be halted, settled or delisted.' |
| 4 | 0:09–0:12 | 'Perpetual futures use leverage.' | 'You can lose all of your margin.' |
| 5 | 0:12–0:15 | 'Not available to persons in the United States or other restricted locations.' | 'Not financial advice. Risk disclosure: {SITE_URL}/risk/' |

说明：

- 第 3 屏按 S0 写，不出现 'stock' 或 'share'。律师若要求明确写出「不是股票」，主字幕改为第 4.3 节 S1 的 'Not stock in any company'。
- 第 2 屏的「未上市」一句取决于 D1、D2、D6；律师若要求不收上市前市场，删去这一句。
- 4 屏的压缩版：把第 4 屏与第 5 屏合并为 'Perpetual futures use leverage. You can lose all of your margin. Not available to persons in the United States or other restricted locations.'，每屏约 3.5 秒。是否允许把风险句与地区句压在一屏，由 H4 决定。

### 5.3 具名版（`media/reel-named.mp4`，约 18 秒，6 屏）

在通用版之上增加纯文本的市场代码、部署方给出的公司名、部署方名称（链上 fullName）与参考价跟随什么。仍然没有第三方 Logo、价格、单位数字与杠杆倍数（{BRAND_NAME} 自己的 lockup 见第 5.1、5.4 节）。每行的公司名按该部署方自己的写法：XYZ 的链上注释，EntropyIO 文档的「Reference issuer」。

| 屏 | 时间 | 主字幕 | 列表与小字（逐字） | 依据 |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:03 | 'Markets beyond crypto' | 小字：'Perpetual markets on Hyperliquid, run by independent deployers. {BRAND_NAME} is an interface and does not run them.' | 第 2.2 节；`legal/terms.md:18-24`、`:42-49` |
| 2 | 0:03–0:06 | 'Markets that reference listed companies' | 列表：'SNDK · Sandisk Corporation (Nasdaq: SNDK) · run by XYZ'；'NBIS · Nebius Group N.V. (Nasdaq: NBIS) · run by XYZ'。小字：'XYZ's reference price follows US market prices. When no outside price is available, such as at weekends, XYZ sets it from its own market.' | `designs/beyond-crypto-review/data/markets-snapshot.json`（`xyz:SNDK`、`xyz:NBIS` 注释，`deployerFullName`）；https://docs.trade.xyz/perpetuals/markets/stocks/us 、https://docs.trade.xyz/perpetuals/mechanics/external-price 、https://docs.trade.xyz/perpetuals/mechanics/oracle-price （2026-10-25） |
| 3 | 0:06–0:09 | 'Markets that reference companies that are not publicly listed' | 列表：'ANTH · Anthropic PBC · not publicly listed · run by EntropyIO'；'OAI · OpenAI Group PBC · not publicly listed · run by EntropyIO'。小字：'These are perpetual contracts, and the companies have no exchange price. EntropyIO quotes each market as company market capitalisation, under a method described in its documentation, and can settle the market if no listing happens.' | https://docs.entropy.io/asset-directory/pre-ipo-assets 、https://docs.entropy.io/market-types/pre-ipo-perpetuals 、https://docs.entropy.io/pre-ipo-perp-mechanics/no-ipo-resolution （2026-10-25）；链上 category preipo；「not publicly listed」待 D6；'company market capitalisation' 是 EntropyIO 的说法（第 2.3 节）；'a method described in its documentation' 是否算公布了方法待 D2 |
| 4 | 0:09–0:12 | 'A contract, not ownership of a company' | 小字：'No ownership, dividends, voting or IPO allocation rights in any company. A deployer can halt, settle or delist a market at a price you did not choose.' | BC-5、BC-6、BC-15 |
| 5 | 0:12–0:15 | 'Perpetual futures use leverage.' | 小字：'You can lose all of your margin.' | BC-17 |
| 6 | 0:15–0:18 | 'Not available to persons in the United States or other restricted locations.' | 小字：'Not financial advice. {BRAND_NAME} is not affiliated with, sponsored by or endorsed by these companies. Their names only identify what a reference price follows and belong to their owners. Risk disclosure: {SITE_URL}/risk/' | BC-12、BC-13、BC-8、BC-9；'not affiliated, sponsored or endorsed' 待运营方确认（E4）；措辞按第 4.6 节免责声明压缩 |

说明：

- 第 2 屏只写 XYZ 的 SNDK 与 NBIS。EntropyIO 也有同代码的市场，写法与方法不同（第 2.1 节）；若律师要求列全同代码市场，第 2 屏要加两行，3 秒读不完。
- 第 3 屏的代码用部署方文档与链上的 `OAI`，不用终端市场选择器显示的 displayName 'OPENAI'（选择器显示 OPENAI-USDC，市场页显示 OAI-USDC，第 2.6 节）；公司名用 EntropyIO 文档的 'Anthropic PBC'、'OpenAI Group PBC'，EntropyIO 自己的界面用的是短名 'Anthropic'、'OpenAI'。两处都待 E1。
- 第 3 屏不写单位数字（价格 1 代表 10 亿美元）。律师若认为必须写单位（J3），小字改为 '…quotes each market as company market capitalisation (a price of 1 means US$1 billion), under a method described in its documentation…'；这是否算视频里的价格数字，由 J4 决定。
- 第 3 屏若律师要求不依赖部署方分类（D6），把 'not publicly listed' 改为 'described by EntropyIO as pre-IPO'，主字幕改为 'Markets a deployer describes as pre-IPO'。
- PRL（链上显示 PEARL）是加密资产的上市前市场，不是公司，不进入本屏。
- 第 2、3 屏的主字幕写 'Markets that reference …'，不写 'Listed companies'、'Companies that are not publicly listed'：后者放在公司名与 Nasdaq 代码上方、与 {BRAND_NAME} lockup 同屏，单看一帧或一张截图，像是在提供这些公司本身（尤其是上市前的 OpenAI、Anthropic）的敞口，而所有权否定句要到第 4 屏才出现（D1；视频离开官网后单独传播，L2）。第 3 屏的小字因此以 'These are perpetual contracts, …' 开头。
- 第 3 屏的小字不用 'so' 把「没有交易所价格」与「按公司市值报价」连成因果：EntropyIO 给的按市值计价的理由是私募融资轮的股数不确定（第 2.3 节），文档没有把它写成没有交易所价格的结果。单位照 EntropyIO 的说法写 'company market capitalisation'，不写 'total company value'，后者可能被读成企业价值。
- 第 6 屏的小字按第 4.6 节免责声明写出 'not affiliated with, sponsored by or endorsed by' 与名称只用于识别、归各自所有人；旧版只有 'not affiliated with these companies'，比页面弱，而具名版是唯一让 {BRAND_NAME} lockup 与第三方公司名同屏的材料（E1、E4）。这一屏的小字因此变长，3 秒是否够读见 H4。
- 送审前逐屏核对 `reel-named.mp4` 与本表一致；不一致时，以运营方核对后选定的文字为准，并在本节记下差异。

### 5.4 两版视频的区别与待律师决定的点

| 待定点 | 通用版 `reel-generic.mp4` | 具名版 `reel-named.mp4` | 问题 |
| --- | --- | --- | --- |
| 是否写公司名、市场代码与部署方名称 | 都不写 | 写代码、部署方给出的公司全称与部署方链上名；同代码的另一家部署方没有列出 | E1、E3、E5、D1 |
| 价格、单位与走势 | 没有 | 没有价格与走势；不写「价格 1 代表 10 亿美元」 | J4、J3 |
| 风险句与地区句的时机 | 第 4 屏风险、第 5 屏地区，另有常显页脚 | 第 5 屏风险、第 6 屏地区，另有常显页脚 | H4 |
| 未上市公司的说法 | 一句 'Some of these markets reference companies that are not publicly listed' | 点名两家，说明按公司市值（EntropyIO 的说法）报价、未上市时可能结算 | D1、D2、D3、D5、D6 |
| 时长与阅读时间 | 15 秒，5 屏，每屏 3 秒 | 18 秒，6 屏，每屏 3 秒；第 2、3 屏有列表加说明，第 6 屏的小字也长，3 秒可能读不完 | H4 |
| 放置、自动播放与站外传播 | 待定 | 待定；离开官网后，公司名与地区限制、风险披露分离的风险更大 | L1、L2 |
| 画面上的 {BRAND_NAME} lockup 与审阅水印 | 每屏左上角有 lockup；水印每屏常显 | 同左；lockup 与第三方公司名同屏，是否暗示关联 | E4、L1 |
| 列表屏的主字幕 | 没有列表屏 | 第 2、3 屏写 'Markets that reference listed companies'、'Markets that reference companies that are not publicly listed'，把对象写成市场，不写成公司；第 3 屏小字以 'These are perpetual contracts, …' 开头 | D1、L2 |
| 与公司无关联的声明 | 没有公司名，不写 | 第 6 屏写 'not affiliated with, sponsored by or endorsed by these companies' 与名称归属，按第 4.6 节压缩；是否还需要完整的商标声明 | E1、E4 |

## 6 相对初稿的更正

初稿是调研 Agent 2026-10-25 写在会话临时目录的版本（未入库）。本文合并时作了下列更正；初稿的其余结论按 2026-10-25 的仓库与网页重新核对过行号与出处。第 10 项是同日对抗式审查之后的更正，第 11 项是第一轮修复之后两路只读核查的更正，第 12 项是同日对照部署方原页副本之后的更正。

1. 初稿称 `io:OAI`、`io:ANTH` 没有公布参考方法，这不对。EntropyIO 在 docs.entropy.io 公布了计价单位、预言机方法、灾难性边界与到期结算；只是链上描述为空，终端的 `hip3-deployers.ts` 也没有 `io` 的文档链接。第 2.1、2.3 节，问题 D2、F3、J3 与模板 R2 已据此重写，收录门槛改为由律师判断「公开了方法」的标准。
2. PRL（链上显示 PEARL）是加密资产的上市前市场，不是公司，已排除在公司示例之外。
3. io 的五个「已下架」市场：证据显示它们已注册、看起来从未开盘；下架原因与 `isDelisted` 的含义未核实（第 2.5 节）。
4. 初稿以同一会话的另一项任务未跟踪的守卫脚本为依据，说演示录制管线因此不能拍这些市场；已改为：产品演示录屏只拍现货市场，因为永续页面显示杠杆数字；HIP-3 市场页面打开时先出现部署方风险免责弹窗，录制程序不得代任何人接受。
5. 补入两家部署方的身份、法人、准据法与受限地区（初稿只有 trade[XYZ] 禁止美国人一条），并据此新增 A5 的补充、I5。
6. 补入 XYZ 上市前规格表（JIO 预计 2026-10-28 上市，SPCX 已标 Converted），以及同一代码由两家部署方运营的事实。
7. 终端图标：初稿写「未目视检查」；现在 `as-is/` 截图里 ANTH、OPENAI 的图标看起来像公司标识（仍是目视印象）。
8. 行号更正：`market-asset-info.tsx` 的注释查询与描述在 `:119-127`、`:164-171`；免责弹窗的无链接版本在 `:85-93`、勾选框在 `:103-106`；`Markets.astro` 的标题与说明在 `:33-38`。
9. 新增问题 D6、F6、G6、I5，以及第 5.3 节具名版的逐屏字幕与依据。
10. 2026-10-25 对抗式审查之后：
    - 收录：审阅页旧版写「下架或部署方没有公布方法的市场不列」，等于说其余市场全部列出，实际只列了挑选的市场。现在页面只列四个市场，并在表格下方显示第 4.2 节的选取说明；第 4.4 节写明门槛只是必要条件，以及哪些市场刻意没有收（A3）。
    - DRAM、EWY 两个 ETF 行删除：本稿没有 ETF 模板，'linked to companies' 与免责声明覆盖不到基金发行方与指数提供方（E3 新增一条）。
    - R2 行补上 'IPO allocation'；第 5.2 节第 3 屏、第 5.3 节第 4 屏同步补上。
    - R2 转述不再写 EntropyIO 评分外部数据；R1 行加链 stocks/us 与 external-price 页；链接文字不用 'pre-IPO'，加 'opens the deployer's site' 提示；并购结算与修改结算标准的权利记入 G1、BC-18。
    - 副标题删去 'review'（BC-3、A3）。
    - 地区句改为 'Trading through {BRAND_NAME} is not available to persons in …'，视频改为 'Not available to persons in …'；BC-12 改为部分有证据（C2、C3、B1）。
    - 主张编号由 H3-n 改为 BC-n，避免与问题 H3 混淆；审阅页徽标同步。
    - A1 删去没有出处的「未在任何地区登记」。
    - D6 加入 OURA 反例；第 2.6 节与 E1 更正 OAI 的显示名：选择器显示 OPENAI-USDC，市场页显示 OAI-USDC。
    - 「没有 Logo」改为「没有第三方 Logo」，并写明画面上有 Sairn 自己的 lockup。
    - 可选数据列：表头按快照写标记价并写到秒，成交额以 USDC 计、不加 '$'，上市前市场不显示价格（J3）；状态列改为 'Not delisted at snapshot'，生产实现对停牌与未知状态 fail closed。
    - 第 1 节文件清单补上 `README.md`、`asset-sources.json`、`tools/render-reel.cjs`，并把 `review.js`、`reel.html` 改为审阅对象；两张选择器截图的尺寸更正为 1440×729（裁切）；徽标说明改为与页面一致。
11. 2026-10-25 第一轮修复之后两路只读核查：
    - 模板 R1 的标题删去「或 ETF」，并注明 ETF 没有行模板（E3）。
    - 模板 R2 的固定结算句换成 `{SETTLEMENT_SUMMARY}`，与示例一致；R2 行在结算句后加 'EntropyIO can halt, settle or delist it, and can change these settlement terms.'，不再比 R1 少写部署方的处置权；BC-15 改指第 4.7 节的第三方市场风险句与第 5.3 节第 4 屏。
    - R2 行与具名版第 3 屏不再写 'its own published method'（同一行又说评分程序不公开），改为 'a method described in its documentation'；评分与加权单独成句；'within limits EntropyIO can change' 改为边界只约束参考价、成交可以在边界之外。选取说明加 D2 标签。
    - BC-12 的缺口 (2)、(4) 改为同时覆盖页面句与视频句，并写明条款 §2.2 禁止受限人员使用整个界面；C2 加指向。
    - 来源说明在第 4.5 节有了拟议文字，并写明 XYZ 的链上注释；'Rows follow the R1 and R2 samples …' 移到虚线框的审阅注，不是拟议文案。
    - 具名版第 2、3 屏的主字幕改为 'Markets that reference …'，第 3 屏小字以 'These are perpetual contracts.' 开头（D1、L2）；第 6 屏的无关联声明按第 4.6 节写全（E4）；第 5.4 节加两行。
    - BC-1 改为部分有证据、待 E5；E5 写明 'independent' 一词隐含与 Sairn 无关系，并给出中性写法供律师选择；审阅页文案不改，只加 E5、BC-1 标签。
    - A3、BC-3、BC-7 补上终端免责弹窗 'surfaced based on onchain activity and are not reviewed, verified, or approved' 与官网挑选说法的冲突。
    - 第 1 节的徽标说明补上 R1 两行的价格格没有标签，并说明标题旁的 'T1 of 3' 是标题选项。
12. 2026-10-25 对照部署方原页副本（同日取得）之后：
    - R1 保留 'at weekends and on holidays'，并补上依据：加链 XYZ 的假日休市表（holiday-closures）；第 2.4 节把 stocks/us、休市表、external-price、oracle-price 四页各写了什么分行列出；BC-18 写明周末与假日一句是推断。旧版第 2.4 节把「周末、假日」写在 external-price 与 oracle-price 两页名下，两页其实都没有写这两个词。
    - R1 行 'sets it from trading in its own market' 改为 'sets it from prices in its own market'，R2 行 'blending trading in this market with private-market data' 改为 'blending prices from this market's order book with private-market data'，`io:SNDK` 示例同样改为 'prices from its own market's order book'：两家的内部输入都是盘口报价，不是成交。
    - EntropyIO 的计价单位不再写「公司总值」'total company value'，照 EntropyIO 的用词写作「公司市值」'company market capitalisation'，第 2.3 节写明它不是企业价值；R2 行、第 4.4 节、第 5.3 节第 3 屏与相关问题、主张同步。
    - R2 的评分句改为 'EntropyIO lists the criteria that data is scored on (recency, depth and historical reliability), but says the scoring and aggregation procedure is internal.'：旧句 'How that data is scored and weighted is not published.' 没有交代文档列出了评分标准。第 2.3 节、D2、BC-7、第 4.2、4.4 节与第 7 节里「不公开」的说法一并改为「程序是内部的」；主会话起初选定的文字里的 'it scores' 会把评分归于 EntropyIO，而文档用的是被动语态、聚合结果由 RedStone 上链，所以定稿改为被动的 'the criteria that data is scored on'，与第 10 项「R2 转述不再写 EntropyIO 评分外部数据」一致；评分由谁做仍待 G1。
    - R2 行加链 EntropyIO 的资产参数页（pre-ipo-assets），作为 'bounds that EntropyIO can change' 与两家公司名称的出处。
    - G1：RedStone 送上链一句改引上市前永续页，删去「没有重读原页」。
    - 具名版第 3 屏小字改为 'These are perpetual contracts, and the companies have no exchange price. EntropyIO quotes each market as company market capitalisation, under a method described in its documentation, and can settle the market if no listing happens.'：去掉表示因果的 'so'，单位改用 EntropyIO 的说法。
    - 第 1、7 节关于视频的说明改为现行做法，不写渲染时间；文件位置改为本地分支；「另一会话」改为同一会话的另一项任务；引用规划自己的决定时加「规划」前缀；眉标题的标签 'A3 · F' 改为 'A3 · F4'；第 1 节写明 S0、R1、R2 是文案选项或模板名，不是问题，并补上审阅包对 `designs/website-hero-prototype/` 里字体与 lockup 的依赖。

## 7 未核实事项与本稿的限制

- Anthropic PBC 与 OpenAI Group PBC 在 2026-10-25 是否仍未上市，只有部署方的分类与文档，没有独立核对；SpaceX 是否已经上市（`xyz:SPCX` 的注释与 XYZ 规格表的 Converted 这样表示），同样未核实；SPCXD 说明里「第一个」的依据未核实。
- EntropyIO 上市前市场的外部数据来源与各自的权重（文档只列评分标准，并称评分与聚合程序是内部的）、评分由 EntropyIO 还是 RedStone 做、初始价怎样定、到期结算用 6 个月还是 30 天 TWAP、承诺的 changelog 在哪里，都未核实。
- Bursa Global Inc. 是否就是链上的 `io` 部署方，XYZ Ltd 是否就是 `xyz` 的 HIP-3 部署方，两家背后的团队与实际控制人，未核实。
- 部署方的受限清单是否约束经第三方界面（例如 Sairn）的交易，未核实；EntropyIO 文档清单为什么不含法国、德国、爱尔兰、荷兰，未核实。
- EntropyIO 哪些股票有「approved after-hours venue」、是哪个场所，未核实。
- io 五个「已下架」市场的原因与参考对象，`isDelisted` 是否等于「未开盘或已停牌」，未核实。
- Hyperliquid 对 HIP-3 使用公司名或商标有没有政策：文档里没有找到，Hyperliquid 的条款页是单页应用，内容没有取到，未核实。`disableDex` 对用户持仓的影响，文档没有写。
- 终端与 EntropyIO 界面使用的市场图标是不是公司商标，只有目视印象或只看了地址，未核实。
- 协议层是否对 HIP-3 订单同样收取 builder fee，文档没有明写，未核实；仓库侧没有按市场排除。
- Sairn 与任何部署方或所参考的公司之间有没有关系，仓库无法证明，需要运营方确认。
- 其他部署方（Paragon、Markets by Kinetiq、Ventuals、HyENA、Felix Exchange、dreamcash、ABCDEx）的文档没有读。
- 文中美国、英国、欧盟、新加坡的法规框架是 Agent 先验知识，未核实；日本部分来自 `docs/marketing/jp-launch-email/README.md` 与 ADR 0042 的 Agent 调研摘要，同样不是法律意见。
- 接口读数是 2026-10-25 04:07–04:16 UTC 与 04:55:47Z 两次快照；部署方文档是同日的副本。市场、分类、注释与文档随时会变，任何定稿都要按当时数据重查。
- 本稿没有运行仓库的测试或构建。视频：两段视频由 `tools/render-reel.cjs` 从本版的 `reel.html` 渲染，SHA-256 记在 `designs/beyond-crypto-review/asset-sources.json`；每次渲染之后，主会话从两个 MP4 在每屏完全显示阶段的中点（第 i 屏 t = 3i + 1.8 秒，i 从 0 起）各抽一帧，与第 5.2、5.3 节核对；WebM 只用 PSNR 与 MP4 比较过；逐帧核对没有做。页面：三轮修复代理都用无头 Chromium 打开过 `index.html` 与 `reel.html`（经 Playwright 路由读本地文件，不起服务器，不运行渲染脚本）。第 12 项之后的读数：页面填出四行，转述格与链接和 `review.js` 一致（R1 四个链接、R2 五个），没有脚本错误，可选列开关生效，375 与 1440 像素宽都没有横向滚动；`reel.html` 在 1280×720 下、每屏完全显示阶段的中点时两版各屏都不压页脚（具名版第 3 屏底边 602 px，页脚顶边 624 px，余量最小），字体与 lockup 已加载。另用脚本比对了 `review.js`、`index.html`、`reel.html` 与本文第 4、5 节的英文文案，逐字一致，审阅页标签里的问题与主张编号在本文都有定义。这些是脚本读数，不是视觉审阅，也不是视频文件的核对。截图：作者只看了 `as-is/` 里的两张（`selector-pre-launch.png`、`trade-io-oai-disclaimer.png`）；第 11 项的修复代理看了这两张与 `trade-xyz-sndk-disclaimer.png`，六张的尺寸用 `sips` 读过。第 0 节所说的契约冲突是读源码与规划得出的。
