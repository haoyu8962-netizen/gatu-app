# 「加密之外的市场」律师审阅包（设计部分）

> **状态更新（2026-10-25）：** 运营方 2026-10-25 决定：律师已完全同意在日本展开（运营方陈述，书面意见原文不在仓库），解除律师闸门、不再询问；官网宣传 HIP-3 美股与未上市公司市场，做法跟随 Hyperliquid 官方。本目录不再是律师审阅材料，改作[官网规划](../../docs/website-plan.md)的参考草稿；页面与视频里的「Draft for legal review — not for publication」水印是当时的标记，原样保留。视频由运营方另行自制。

> **Draft for legal review — not for publication.**

状态：只供运营方的律师审阅。**不上线、不发布、不链到官网或终端，也不进官网构建。** 日期 2026-10-25（UTC）。问题清单、事实底稿与全部文案的出处在 [docs/marketing/beyond-crypto-review.md](../../docs/marketing/beyond-crypto-review.md)；本目录只放能看的东西。

## 运行

1. 在 Claude 桌面应用里用预览配置 `design-handoff`（端口 3020，根目录 `designs/`），或在仓库根目录运行 `python3 -m http.server 3020 --bind 127.0.0.1 --directory designs`。
2. 打开 `http://localhost:3020/beyond-crypto-review/`。

## 依赖

本目录不是自足的：`review.css` 与 `reel.html` 从并列的 `designs/website-hero-prototype/` 读取 IBM Plex Sans 字体 `fonts/ibm-plex-sans-latin-wght-normal.woff2`，`reel.html` 还读取 Sairn lockup `assets/sairn-lockup-on-dark.svg`。送审时要连同这两个文件一起发送，保持两个目录并列，并附上字体的 SIL Open Font License 文件 `designs/website-hero-prototype/fonts/OFL-IBM-Plex-Sans.txt`；否则律师只能看渲染好的视频，以及页面的 PDF 或打印件。缺字体时页面退回系统字体，缺 lockup 时视频合成页左上角不显示标识。

## 内容

| 文件 | 说明 |
| --- | --- |
| `index.html`、`review.css`、`review.js` | 区块草稿：按英文站的样子排版的「Markets beyond crypto」。虚线标签多数是律师问题编号（A1–L2）或主张编号（BC-1–BC-18）：眉标题（A3 · F4）、各段文字、表格说明、选取说明（A3 · D2 · BC-7）、来源说明、免责声明与风险句旁都有；表格每行的转述、文档链接与状态格也有，未上市公司两行的市场格另标 D6、价格格标 J3；表头、R1 两行的市场格与价格格、部署方格、成交额格、页面顶栏、视频说明文字与附录截图没有标签。有四个标签不是问题，而是文案选项或模板名：标题旁的 'T1 of 3' 是标题选项，核心说明句旁的 'S0' 是写法选项，表格转述格里的 'R1'、'R2' 是行模板。来源说明下方的虚线框审阅注（'Review note, not proposed copy: …'）与顶栏一样只供审阅，不是拟议文案。表格每行的英文文案只写在 `review.js` 里（`ROWS` 与它引用的 `listedTracks`、`UNLISTED_TRACKS` 和两组文档链接常量），这个文件也是审阅对象。标记价与 24h 名义成交额两列默认隐藏，顶栏开关才显示（问题 J1）：数值取自下面的快照，不实时请求；时间写到秒（UTC），成交额以 USDC 计、不加 `$`；未上市公司两行的价格一格显示「—」与「withheld pending J3」，不显示数字 |
| `data/markets-snapshot.json` | 2026-10-25T04:55:47Z 从 Hyperliquid 公共接口读的部署方注释与行情（`perpAnnotation`、`perpDexs` 全名、`metaAndAssetCtxs`），只含市场代码与部署方全名，不含地址 |
| `reel.html`、`tools/render-reel.cjs` | 视频合成页与逐帧渲染脚本（Playwright 截图 30 fps → ffmpeg） |
| `media/reel-generic.*` | 通用版，15 秒 5 屏，逐字取自审阅文档第 5.2 节：不出现公司名、市场代码与价格 |
| `media/reel-named.*` | 命名版，18 秒 6 屏，逐字取自审阅文档第 5.3 节：参考上市公司与参考未上市公司的市场分屏，列出市场代码、部署方给的公司名与部署方（纯文字），仍不出现第三方 Logo、价格与杠杆倍数 |
| `as-is/` | 终端现状截图（2026-10-25，未登录）：市场选择器的 Traditional Finance、HIP-3、Pre-launch 页签，以及停在部署方风险声明弹窗后的 `io:OAI`、`io:ANTH`、`xyz:SNDK` 页面。**产品原样，不是营销材料**：画面里有杠杆徽标与部署方标记。风险声明没有人代为勾选或确认 |
| `asset-sources.json` | 上述素材的来源与 SHA-256。两张选择器截图（`selector-hip-3.png`、`selector-traditional-finance.png`）是 1440×900 视口截取后裁成 1440×729，其余四张是 1440×900 |

## 怎样做的

- 表格每行按审阅文档第 4.4 节的模板 R1、R2，文字逐字相同：公司名取部署方的写法（XYZ 来自链上 `perpAnnotation` 描述，EntropyIO 的链上描述为空，取自其文档），「What the price tracks」是对部署方方法文档的转述（2026-10-25 读取），R1 结尾是权利否定句与部署方的处置权句；R2 在结算句后写 'EntropyIO can halt, settle or delist it, and can change these settlement terms.'，以含「IPO allocation」的权利否定句结尾。R2 不写 'its own published method'，写 'a method described in its documentation'；单位照 EntropyIO 的用词写 'company market capitalisation'；评分标准与「评分与聚合程序是内部的」单独成句；价格边界只约束参考价、成交可以在边界之外（审阅文档第 4.4 节）。两类行的内部定价都写成按本市场的盘口价格（'prices'），不写成交（'trading'）。「How the price is set」链到支撑该行转述的各个方法页（R1 四页，含 XYZ 的假日休市表；R2 五页，含 EntropyIO 的资产参数页），链接文字不用「pre-IPO」，并提示链接打开部署方的网站。
- 这是人工挑选的示例，不是按规则生成的完整清单：XYZ 的 SNDK、NBIS（R1），EntropyIO 的 ANTH、OAI（R2），与命名版视频的四个市场相同。页面在表格下方写明这是 Sairn 挑选的示例、不完整、不是审计、批准或推荐（问题 A3）。刻意没有收：`io:SNDK`、`io:NBIS`（同一代码的另一家部署方，写法与方法不同）与 xyz 其余未下架市场，待 A3、E1；DRAM、EWY 两个 ETF（基金，不是公司，没有获批的 ETF 行模板，见问题 E3）；PEARL（`io:PRL`）是加密资产，不是公司。在这些没收的市场里，快照文件只含 `io:SNDK`、`io:NBIS`、`xyz:DRAM`、`xyz:EWY` 四个的读数（页面不显示），xyz 其余市场与 `io:PRL` 不在快照里。
- 状态列写「Not delisted at snapshot」：快照只有 `isDelisted`，没有停牌状态，所以不写「Trading」；`isDelisted` 不是 `false` 的行不显示。
- 代码写 `OAI`（链上市场代码），与审阅文档第 5.3 节一致。终端市场选择器显示部署方设的 displayName，即 OPENAI-USDC；点进市场页后，标题、图表图例与订单簿显示 OAI-USDC、Size (OAI)（`as-is/selector-pre-launch.png`、`as-is/trade-io-oai-disclaimer.png`）。用哪个由问题 E1 决定。
- 视频只用文字与中性图形，品牌底色与 IBM Plex Sans：没有第三方 Logo，但每屏左上角有 Sairn 自己的 lockup（问题 E4、L1）；每一帧右上角是审阅水印，底部常驻「Not financial advice. Not available to persons in the United States or other restricted locations. Risk disclosure: sairn.ai/risk/」。
- 命名版第 2、3 屏的标题是 'Markets that reference listed companies'、'Markets that reference companies that are not publicly listed'，把对象写成市场而不是公司；第 3 屏小字以 'These are perpetual contracts, and the companies have no exchange price.' 开头（问题 D1、L2），下一句不用表示因果的 'so'，单位写 EntropyIO 的说法 'company market capitalisation'。
- 命名版第 6 屏按第 5.3 节写「Sairn is not affiliated with, sponsored by or endorsed by these companies」与名称归属，与页面免责声明一致，这句待问题 E4 确认；「not affiliated with … deployers」仓库无法证明（E5），没有写。
- 页面与两段视频都把部署方称为 'independent'。部署方与 Sairn 之间有没有关系，仓库无法证明，所以这个词待问题 E5、主张 BC-1；文案暂不改，相关段落加了 E5 标签，审阅文档给了中性写法供律师选择。

## 没有做的

- 没有任何内容上线或链到官网；区块不在官网构建里，视频没有上传到任何平台。
- 没有在终端里接受部署方风险声明，所以没有「进入市场后」的页面截图。
- 没有日语版本（审阅文档问题 B4：建议永远不出日语）。
- 部署方方法页是 2026-10-25 读的，文档会变（问题 G6），上线前要重核。
