# 官网重建规划

> **已被取代（2026-10-25）：** 本文已被[官网规划](website-plan.md)取代，保留为历史记录，不再约束实施；两者冲突时以新规划为准。运营方 2026-10-25 决定：律师已完全同意在日本展开（运营方陈述，书面意见原文不在仓库），解除律师闸门、不再询问；官网宣传 HIP-3 美股与未上市公司市场，做法跟随 Hyperliquid 官方。本文里所有「律师」「日本律师书面意见」相关的闸门与步骤随之作废，D1–D25 的去向见新规划第 1 节。

状态：拟议（未批准）。日期：2026-10-24；第三轮修订 2026-10-25（第 26 节）。范围：营销官网 `apps/website`（https://sairn.ai）的内容、信息架构、视觉与动效、实时数据、技术栈、本地化、衡量、安全响应头、合规闸门与分阶段实施；不改终端 `apps/terminal` 的行为。

- 依据：[官网行业调研（2026-10）](website-industry-research-2026-10.md)（下称「调研」）；同日由工作流生成的三个设计方向与三份评审（转化与品牌、工程、合规与无障碍），由 Agent 完成，本文第 4 节记录其结论与取舍。
- 任务记录：[官网行业调研与重建规划](work-memory/sessions/2026-10-24-website-research-and-rebuild-plan.md)，写明原始需求、方法、证据位置、评分与取舍和未决项。调研的原始证据（`research-web.json`、`research-digest.md`、Playwright 的 JSON 输出与采集脚本）脱敏后复制在本机 Git 忽略的 `.worklog/2026-10-24/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-website-research/`，不进远端。三个方向与三份评审的原文**未取得**：写记录时会话的临时目录与任务输出目录里都没有它们，第 4 节的评分（7.5、6、8 等）只能追溯到本文与任务记录，不能追溯到原文。
- 本文不是实施记录，也不是法律意见。文中所有英文与日文文案都是草稿，需要运营方确认；面向日本的一切内容还需要日本律师的书面意见。
- 本文没有改动产品代码，也没有运行仓库的测试或构建（第 10、23–26 节的测量只针对设计原型与公共接口）；第 9 节的色差与对比度是 Agent 按 sRGB（D65）计算的 CIE76 ΔE 与 WCAG 对比度，未经设计方复核。
- 首屏原型：[`designs/website-hero-prototype/`](../designs/website-hero-prototype/README.md)（2026-10-24，A 克制版与 B 大胆版两套布局与配色，可在本机运行对比；不是生产代码）。第二轮修订（第 24 节）要求原型加入 Terminal / Live market 两个视图与录制海报冷启动，由主会话实现并记录实测；第三轮修订（第 26 节）把 Terminal 视图从静态截图改为未登录终端的演示录屏。
- 关联：[日本用户营销邮件](marketing/jp-launch-email/README.md) §1 闸门 1（官网与邮件的矛盾）、§5「刻意不写的卖点」、§6 转化率方案；[ADR 0042](adr/0042-japan-allowed-trading-region.md)（未发布）；[ADR 0028](adr/0028-brand-accent-colors.md)；[品牌迁移计划](brand-migration-plan.md) D2、D5 与 D12 的动效子项 (h)；[品牌标识与素材](brand-assets.md)；[官网 README](../apps/website/README.md)；[官网发布手册](../deploy/website/README.md)。

## 1 背景

- 运营方认为现官网「太传统」，希望用现代前端与加密原生的技术重做。
- 现官网（调研第 8 节）：Astro 5.14.6 静态站，参照 midday.ai 的单列布局，Instrument Serif 大标题配静态截图；没有标志性动效，也没有市场原生的内容。调研把这种形式认定为「传统感」的来源。现站很轻：HTML 13.8 KB、CSS 7.2 KB、没有外部 JS。
- 现站仍写着 No KYC、'Connected · 12ms'、'each market's full leverage'、xyz: 股票与 JP225 行情，截图里有 40x、10x，还点名交易所品牌钱包。日本营销邮件把 `https://sairn.ai` 列为「正規のURL」，这些内容因此进入了闸门 1 的律师问题。
- 日本交易（ADR 0042）未发布，等待日本法律意见。

## 2 目标与非目标

### 目标

1. 第一屏展示真实的产品与真实的 Hyperliquid 市场，而不是描述它们：产品窗口默认是 app.sairn.ai 未登录状态的真实录屏（Terminal 视图；第二轮是静态截图，第三轮改为录屏，第 26 节），另一个视图是 Hyperliquid 公共行情的实时画布（Live market 视图，第 6 节）。五秒内让访客答得出三件事：Sairn 是什么、资金由谁持有、怎样登录；存款要准备什么由首次点击任务与一道不限时的追问检验。上线前用理解测试验证（第 16 节、第 19 节 V1）。
2. 每个数字都有来源与时间，数据不可信时不显示（fail closed），绝不出现 '...'、'—'、'NaN'、'$0'、'Loading' 这类占位当作事实。
3. 视觉上与 Hyperliquid 官方站明确区分，并在首屏写明 Sairn 是独立界面。
4. 每条主张都能用仓库或条款证明，并由测试钉住；风险句紧贴每一个进入应用的按钮。
5. 页面轻：手机首屏交互前 ≤250 KB。调研中同行首页的单次加载为 0.76–12.6 MB（桌面 1440 宽、不限速、只算首屏加载，不含滚动与视频播完，口径不一，见调研第 3 节与第 4 节第 8 条）；那不是手机首屏交互前的数字，所以本规划不写「轻一个数量级」之类的比较。
6. 服务存款这一步，而不只是点击：首个英文版本就带 Arbitrum USDC 存款指南。
7. 在现行隐私政策下可衡量：上线前测首屏是否被看懂，上线后看到达趋势（第 16 节）；需要改政策的手段明确列出，不默认采用。
8. 日语页按日本惯例原生撰写、预先建好，闸门满足前不上线。

### 非目标

- 不改终端的界面、签名、资金或地区规则；终端没有日语界面这件事不在本规划内。
- 不加分析 SDK、像素、热图、A/B 工具、广告 Cookie、第三方嵌入，也不由官网自己实现表单或新闻订阅。日本邮件依赖 sairn.ai 的订阅同意入口、退订路径与追踪子域，处理见第 18 节「日本邮件依赖的 sairn.ai 能力」与决定 D19。
- 不加后端、SSR 或 API 路由；数据只来自浏览器直连 Hyperliquid 公共接口，或构建时的结构快照。若 D19 决定在 sairn.ai 主机名下放 ESP 托管的同意或退订页面，那是运营方在 CloudFront 上把指定子路径路由到 ESP 源站，官网构建本身仍不含后端。
- 不展示 Sairn 自己的用户数、成交量、审计、投资人或状态徽标（这些都不存在）。
- 不做 AI 生成、氛围或 3D 营销视频，不做滚动劫持或粒子背景。真实终端的短录屏不在此列：运营方 2026-10-25 要求做产品演示视频，规则见第 6、8、9、13 节（第三轮修订，第 26 节）。
- 不在本规划里改法律文本；`legal/*.md` 的任何改动另需律师书面确认。

## 3 受众与核心信息

### 受众（按优先级）

1. 已在用或正在考虑 Hyperliquid 的交易者：要一个快速、非托管、费用清楚的网页终端。
2. 没有自托管钱包的加密用户：可以用邮箱开始，Privy 为该账户创建钱包，由它签名（调研：Uniswap 用 Privy 做 'Create account'，Privy 把 Hyperliquid 列为客户，说明这种入口已经主流）。这是相对「先连钱包」的同行最清楚的差异。
3. 日语用户：只在律师对闸门 1、2 的书面批准之后（[邮件 README](marketing/jp-launch-email/README.md) §1）。

### 核心信息

- 一句话：Sairn 是 Hyperliquid 永续与现货的独立网页终端，可以用邮箱或自己的钱包登录，资金留在自己的 Hyperliquid 地址。
- 品牌口号 'See the market clearly. Decide for yourself.' 保留，但不作 H1，第二轮修订后也不再作首屏眉标题（眉标题改为独立身份，第 6 节）：Live market 视图让「看清」成立，可证明的签名与托管事实让「自己决定」成立。口号放在首屏以下的哪一处（例如第 07 区块结尾 CTA 的标题）随 D7 定。

### 主张登记表

所有面向访客的主张都登记在 `apps/website/src/config/claims.ts`：编号、英文与日文文本、证据路径、允许的语言、状态（`approved`、`pending-legal`、`never-ja`）、负责人。组件只按编号渲染主张。下表是首批主张与证据：

| 主张（草稿） | 证据 | 语言 |
| --- | --- | --- |
| 独立界面：'An independent interface. {BRAND_NAME} is not Hyperliquid Corp. or the Hyper Foundation.' 条款 §1.1 只写到「独立界面提供方，不是 Hyperliquid Corp.、Hyper Foundation」，没有 endorse 的表述；'not endorsed' 要等找到可引证据再加。ja 的「Hyperliquidが運営または推奨するものではありません」（与邮件页脚同句）里「推奨」一半同样缺少证据，交律师时一并指出 | [条款](../legal/terms.md) §1.1 | en；ja 待律师 |
| Sairn 不持有资金，资金在用户自己的 Hyperliquid 地址 | 条款 §1.3；[签名机制](hyperliquid-signing.md) | en、ja（「資産を運営会社に預けることなく」） |
| 可以用邮箱登录，Privy 为账户创建的钱包签名下单 | [邮箱签名](email-trading-signing.md)、[ADR 0033](adr/0033-silent-email-wallet-creation.md) | en、ja（「メールアドレスで登録できます」，不写「だけ」） |
| 外部钱包为本浏览器会话批准一个交易密钥，之后不必逐单签名；只有连接时选择保持连接，它才在浏览器重启后保留（en 草稿：'approve a trading key for this browser session; it is kept across browser restarts only if you choose to stay connected'）。首页信任清单用这句短的；带 'Stay Connected' 界面名的完整说明只放 `/how-it-works/`（C9） | [首次交易](trading-onboarding.md)的 Stay Connected 存储表（默认 `sessionStorage`，只在当前标签页或会话内有效；勾选后才用 `localStorage`）、[ADR 0038](adr/0038-unnamed-default-agent-for-trading-connection.md) | en |
| 提款与划转总要由拥有账户的钱包签名，交易密钥不能转出资金 | [签名机制](hyperliquid-signing.md)「Withdrawal Flow」与 Agent 权限一节（发布前按当时代码复核） | en |
| 永续合计费率 taker 0.055% / maker 0.025%，含 0.01% builder fee；现货 builder fee 只收卖出；TWAP 不收 builder fee | `apps/terminal/src/config/hyperliquid.ts` 的 `f: 10`；`copy-contract.test.mjs` 已钉住 | en；ja 带 ※ 与日期 |
| Hyperliquid 主场所有 100 个以上未下架的永续 | 发布时的结构快照与检查（第 10 节）；2026-10-24 为 178 个 | en、ja（「100以上の無期限先物」，只数主 dex） |
| 浏览器直连 `api.hyperliquid.xyz`，官网不加分析工具 | 主机白名单测试与 `dist` 扫描（第 17、19 节：`dist` 里没有外部 `<script src>`，`connect-src` 只有 `api.hyperliquid.xyz`，Worker 包也在扫描范围内）。[隐私政策](../legal/privacyPolicy.md) §4 与 [Cookie 政策](../legal/cookies.md) §3 只作辅证：两处说的都是 the Interface，也就是 app.sairn.ai，不是官网 | en、ja |
| 我们不会索要私钥、助记词、验证码或密码（en 草稿：'{BRAND_NAME} will never ask for your private key, seed phrase, verification code or password.'；ja 用邮件原句「Sairnから、メールで秘密鍵・シードフレーズ・確認コード・パスワードをお尋ねすることはありません。」，产品名经 `BRAND_NAME` 插值） | 邮件防钓鱼段（`docs/marketing/jp-launch-email/email.ja.txt` 第 101–102 行）；这是运营方的承诺，登记表负责人写运营方 | en；ja 待律师 |
| 用邮箱登录时，存款步骤在存款窗口里显示（en 'If you use email sign-in, the Deposit window shows the steps for your account.'；ja 用邮件第 4 版原句「メールアドレスで登録した場合の入金方法は、入金画面に表示されます。」）。只用于存款指南里「外部钱包需要 gas」一句之后，中和「邮箱存款免 gas」的反衬（邮件闸门 9） | 邮箱会话的存款窗口显示存款地址：[`funding-address-card.tsx`](../apps/terminal/src/components/trade/tradebox/deposit/funding-address-card.tsx)；邮件 README 闸门 9 | en；ja 状态 `pending-legal` |

不写的内容：

- 日语页沿用邮件 README §5「刻意不写的卖点」的全部条目。
- 英文页同样不写 No KYC、杠杆倍数、'12ms' 之类的延迟、交易所品牌钱包、与官方应用的比较，以及「最轻」之类的比较主张。
- 不写 'signed by your own wallet'、「ご自身のウォレットの署名で」：外部钱包的订单由批准过的交易密钥签名。
- 不写不加限定的 'Your keys'：邮箱钱包经 Privy 签名，用户看不到密钥。同理不写不分登录方式的 'Orders are signed with your keys'、'signed locally'、'access from your own wallet'、'Your keys sign'；按登录方式分别写签名方：邮箱是 Privy 为账户创建的钱包，外部钱包是批准过的交易密钥。
- 不写 'gas-sponsored deposits' 等暗示邮箱存款免 gas 的说法（日本读者会访问英文站，这与邮件 §5「邮箱钱包自动、免 gas 存款」相邻）；需要提到时写中性的 'deposit transactions'，并列进交给律师的改动对照。
- 存款指南与 FAQ 不写「存款期间保持页面开着」：邮件 §5 把它归入客服 FAQ，写在页面上等于宣传 ADR 0040 的自动存款。
- 把杠杆叫杠杆，不叫 'multipliers'。

## 4 选定方向与备选

### 三个方向与评审

| 方向 | 要点 | 转化与品牌 | 工程 | 合规与无障碍 |
| --- | --- | --- | --- | --- |
| Open Book（实时市场画布） | 首屏是 BTC 等市场的实时「时间 × 价格」流动性画布，在 Worker 里绘制；fail-closed 数据层；主张登记表；首屏写明独立 | 7.5（胜出） | 6 | 8（胜出） |
| Live Window（产品即首屏） | 首屏是只读的终端片段（价格条、图表、订单簿），点 CTA 时「展开」进终端；构建时快照；全屏点阵着色器 | 7 | 7.5（胜出） | 6.5 |
| Plain Sight（编辑式信任，日本优先） | 双主题编辑排版，每条主张带 ※ 脚注，DOM 行情表，原生日语版 | 5.5 | 6.5 | 7.5 |

上表是第一轮的原始分数，保留作历史记录（原文未取得，见开头）。

### 加权重评（第二轮修订，2026-10-24）

GPT 审查 S2 指出上表不公平：Live Window 因可以单独删掉的实现缺陷（点阵着色器、所有格 H1、6 小时清空的快照）被整体否决，A/B 也只是同一方向的两个变体。按 S2 建议、本轮采用的权重重评：产品理解 30%、差异记忆 25%、现代感 20%、手机 15%、维护 10%。规则：

- 每个方向按它去掉可删缺陷之后的最佳实现打分：Live Window 是未登录终端的真实截图加只读行情片段，不带着色器；Open Book 是带录制海报冷启动与灰阶热度的画布；Plain Sight 是双语编辑排版加 DOM 行情表。
- A/B 是 Open Book 的两个变体，不作为方向比较；它们的选择放在方向确定之后。
- 分数是 Agent 的判断（1–10），不是用户测试结果。V1（第 19 节）校正产品理解；现代感与差异记忆只有方向性证据；维护分仍是估计。

| 方向（最佳实现） | 产品理解 ×0.30 | 差异记忆 ×0.25 | 现代感 ×0.20 | 手机 ×0.15 | 维护 ×0.10 | 加权合计 |
| --- | --- | --- | --- | --- | --- | --- |
| Live Window | 8 → 2.40 | 5 → 1.25 | 6 → 1.20 | 7 → 1.05 | 7 → 0.70 | **6.60** |
| Open Book | 5 → 1.50 | 7 → 1.75 | 8 → 1.60 | 5 → 0.75 | 4 → 0.40 | **6.00** |
| Plain Sight | 6 → 1.80 | 4 → 1.00 | 3 → 0.60 | 7 → 1.05 | 8 → 0.80 | **5.25** |

打分理由：

- 产品理解：真实终端截图直接展示访客将要用的图表、盘口与下单区；Open Book 展示的是 Hyperliquid 的市场，窗口说明还写着 'not a terminal feature'（L1、S1）；Plain Sight 靠文字与表格说明，没有产品画面。
- 差异记忆：交易终端截图彼此相似，Hyperliquid 自己的前端也是这种样子；Open Book 的时间 × 价格画面更容易被记住，但仍是通用金融语言（V7）；浅色编辑排版正是 Hyperliquid 2026-08 改版的样子。
- 现代感：实时画布最高；静态截图中等；编辑排版是运营方要离开的风格。
- 手机：手机终端截图本身就是窄屏产品证明；Open Book 的画布需要高度，第一轮原型在 390×844 下首屏露出的画布为 0（第 23 节）；Plain Sight 的文字与表格重排良好。
- 维护：Open Book 要维护 Worker、渲染器、数据客户端与海报管线；Live Window 只要截图管线与每次发布重拍；Plain Sight 最省。

结论：没有一个方向在全部维度占优。产品理解的权重最高，Live Window 的最佳实现在加权合计上领先；Open Book 在差异记忆与现代感上领先，正是运营方「不要传统」的诉求。所以本轮把两者合成一个首屏：默认视图是 Live Window 方向的最佳实现（Terminal 视图；第二轮是截图，第三轮改为录屏，见本节「组合」之后的说明），第二视图是 Open Book（Live market）。默认视图由决定 D20 确认。V2、V3 的结果对应哪一种首版产物，见第 19 节「验证结果与首版产物」表；任何一种产物里 Terminal 视图都不受影响。

组合（Terminal 默认 + Live market 第二视图，第二轮审查 S2、S-N1 后补）：上表只给三个单独方向打分，组合本身没有分数。它的维护分 ≤4，因为截图管线与 Worker、渲染器、数据客户端、海报管线两套都要维护；差异记忆与现代感取决于访客能否发现第二视图，默认访客只看到静态截图。示意计算（Agent 判断）：没有人发现第二视图时，差异记忆与现代感按截图的 5、6 计，维护按 4 计，加权约 6.30，低于 Live Window 单独的 6.60。所以组合是否保留，取决于 V1 的第二视图发现率与现代感比较（第 16 节，只记录、不设门槛）；推荐两项不都指向正面时退为单视图，由 D20 定。

第三轮修订（2026-10-25，第 26 节）：Terminal 视图从静态截图改为未登录终端的演示录屏（第 6 节）。上面的重评表、打分理由与「组合」一段都是按第二轮的静态截图打的分，没有重评：录屏让默认视图本身带动效，「默认访客只看到静态截图」这一前提不再成立，可能影响现代感一项；录制管线与逐帧守卫（第 9 节）又加了一份维护量。是否重评、怎样计分，随 V1 的结果（第二视图发现率与现代感比较，第 16 节）在 D20 一并定。

### 选定：真实终端预览为默认视图，Open Book 为第二视图，嫁接 Plain Sight 的部件

第一轮两份评审选 Open Book，工程评审选 Live Window，本规划原以 Open Book 为底。第二轮修订按上面的重评改为：首屏产品窗口默认展示未登录终端的真实画面（来自 Live Window 方向；第二轮是截图，第三轮改为录屏），Open Book 作为同一窗口里的 'Live market' 视图保留。其余按三份评审的嫁接清单与必改项调整：

- **来自 Live Window**：
  - 首屏默认视图是 app.sairn.ai 未登录状态的真实录屏（第三轮修订，第二轮是截图；第 6 节；来源待决定 D21）；
  - Live market 视图放可辨认的终端元素：价格条、24h 迷你走势、前五档盘口，用终端的表面色与订单簿令牌；
  - 主按钮的名称与链接跟随所选市场；
  - 结构快照让构建保持离线、可复现；
  - 截图与录屏采集管线带 DOM 内容守卫；
  - 主机白名单测试；
  - 站点与终端订单簿令牌的跨应用一致性测试；
  - 只用公开的聚合 builder 数据衡量结果。
- **来自 Plain Sight**：
  - 英日两种语言的存款指南，与「三步开始」一节；
  - 首屏上方的官方网址一行；
  - 带 ※ 脚注、链到证据的「记录在案」信任清单；
  - 实测过的日语字体子集方案与字形覆盖测试；
  - 原生的日语信息架构；
  - 主张登记表的 `never-ja` 状态；
  - WebSocket 被拒时的 REST 回退；
  - 风险句相邻测试覆盖英文首屏与结尾；
  - 动效默认关闭、只在 `no-preference` 时启用。

### 没有采用的部分与原因

| 被拒的设计 | 原因 |
| --- | --- |
| Live Window 的具体实现（第二轮修订前写作「Live Window 整体」） | 品牌没有辨识度（石墨底、薄荷只用于焦点）；全屏点阵着色器是 Hyperliquid 自己的插画语言（粒子、点阵），放在文字背后还违反前庭安全；H1 'Hyperliquid's order book, in your own account.' 用所有格，暗示归属；构建快照超过 6 小时就被 JS 清空，几乎每个访客都会看到数字先出现再变空。第二轮修订：这些都是可以单独删掉的实现缺陷（S2），「产品即首屏」本身以 Terminal 视图被采用（上面的重评；第二轮是截图，第三轮改为录屏） |
| Plain Sight 整体 | 不满足运营方「不要传统」的要求：编号小节、细线与脚注边栏正是要离开的编辑风；paper #F5F4EE（C*ab 3.1）与 Hyperliquid 的 #f8f9f9（C*ab 0.4）同为近白中性色，按第 9 节规则第 3 条它们之间的 ΔE 没有意义，问题在于浅色编辑页本身正是 Hyperliquid 2026-08 改版的样子；把琥珀色当界面强调色与 ADR 0028 决策 6 冲突；浅色营销站进入深色终端会断开；`?ref=` 参数读起来像推荐计划 |
| Open Book 原稿里的琥珀「决策线」 | ADR 0028 测得琥珀与警告色 ΔE 只有 3.9，且 Logo 颜色不是界面强调色；动效令牌里琥珀还是 `pending` 色。默认改用中性墨色线，用琥珀需要先修订 ADR 0028（决定 D5） |
| Open Book 原稿的青色热度梯度（#0F1A1F → #2B5055 → #A5BFBC → #F4F8F4） | #2B5055 与 Hyper Foundation 的 #23524C ΔE76 只有 8.3；青色光场叠在青黑底上，呼应 Hyperliquid 的「深绿底上的薄荷粒子」。改为中性灰梯度（第 7 节） |
| WebGL2 主渲染器与两个渲染器之间的像素比对测试 | 工程评审：首屏核心用 Canvas 2D 按数据事件重绘即可；双渲染器加倍维护，无头 SwiftShader 下的像素比对容易不稳。WebGL2 只在实测证明需要时再加（第 7 节） |
| 点击 CTA 时把窗口「展开」到全屏再进入终端 | 合规评审：点击触发的全视口缩放属于前庭触发；工程评审：要处理修饰键、中键、bfcache 恢复，换来的只是装饰。连续性改由颜色承担：首屏窗口与终端启动画面同为 #0F1A1F |
| 把带日期的价格快照烘焙进 HTML | 发布靠手工，HTML 里的价格可能是几周前的；工程与合规评审都要求只提交结构快照。爬虫与无 JS 访客看到的是静态主张与海报（Live market 视图的海报标明 'Recorded'；第二轮修订后，无 JS 时首屏是带来源与 UTC 日期说明的 Terminal 截图；第三轮修订后是 Terminal 录屏的首帧海报与录屏的身份说明，第 7 节回退阶梯） |
| 页面级暂停偏好写进 localStorage | Cookie 政策只覆盖 app.sairn.ai；在它覆盖 sairn.ai 之前，官网不写任何浏览器存储 |
| 以「每周首次出现的交易地址」为北极星指标 | 需要保存地址历史，隐私政策 §3 没有这种用途；改用聚合总量，地址级指标等政策更新与法律审阅 |
| 首屏全宽画布放在文字背后、Pause 偏好跨页记忆、`deviceMemory` 门控 | 前庭安全与可读性；存储同上；Safari 没有 `deviceMemory` |

### 评审必改项的处理

编号 C 为转化与品牌评审，E 为工程评审，A 为合规与无障碍评审。

| 编号 | 必改项 | 处理 | 位置 |
| --- | --- | --- | --- |
| C1 | H1 改成具体的价值主张，口号移走，做五秒测试 | 采用；第一轮口号改作眉标题，第二轮修订后眉标题改为独立身份、口号移出首屏（D7）；五秒测试扩展为上线前的理解测试 | 第 6、16 节；第 19 节 V1 |
| C2 | 热度梯度去青色；仿冒检查改为最小色差 | 采用中性灰梯度；有色相的颜色要求 ΔE76 ≥15，近黑近白的中性色豁免（理由见第 9 节） | 第 7、9 节 |
| C3 | 修冷启动的空画布 | 第二轮修订：默认市场 BTC 先显示录制海报，连续 15 s 有效实时数据后以一次场景替换切到实时（数据区淡出、在不可见时整体替换、淡入，不交叉，第 7 节）；其他市场没有海报，用一次盘口快照与 `recentTrades` 播种，时间轴随数据增长；录制数据和实时数据绝不拼进同一视图 | 第 7 节 |
| C4 | 画布加一行图例与说明，注明是官网视图而非终端功能 | 采用；第二轮修订后这句说明只用于 Live market 视图，Terminal 视图的说明是来源与日期（第三轮起写录屏，静态截图只作回退，第 6、9 节） | 第 6、7 节 |
| C5 | 服务存款这一步 | 首个英文版本带存款指南、按钮组里的「需要 Arbitrum 上的 USDC」一行与三步开始 | 第 5 节；阶段 2 |
| C6 | 日本邮件发送前先修正英文站主张 | 阶段 0，含 Hero 与 Footer 两处 CTA 的风险句；邮件闸门 1 已列官网矛盾问题，是否把「阶段 0 已上线」设为硬性发送条件由运营方定 | 第 19 节；决定 D1、D18 |
| C7 | 用琥珀前先修订 ADR 0028，并记录品牌迁移计划 D5 与 D12 (h) | 默认不用琥珀；三项都列为待决 | 第 9、21 节 |
| C8 | 明确复杂度的止损线 | 先发静态版加海报；实时层在开关后，未过真机检查或预算就保持关闭 | 第 19 节阶段 3 |
| C9 | 首屏附近不用终端术语 | 'Agent'、'Stay Connected' 只出现在 `/how-it-works/` | 第 5、6 节 |
| C10 | 衡量的前提列为运营方操作 | CloudFront 日志、统一 UTM、上线前先取基线 | 第 16 节；阶段 1 |
| C11 | 日本全程受闸门约束 | 默认关闭的构建开关等 | 第 12、18 节 |
| C12 | 申请 Hyperliquid `/apps` 收录 | 与开发并行，由运营方提交 | 第 15 节；决定 D12 |
| E1 | 不把易变数值烘焙进 HTML；只提交结构快照 | 采用；刷新快照与主张检查是发布手册步骤，不在 CI 里联网 | 第 10 节 |
| E2 | 先测量再定预算；不订阅 `allMids` 流；手机走轻量路径 | 阶段 1 测量；市场表用逐币 `activeAssetCtx`；最优买卖价用 WebSocket `bbo`，不轮询 REST；REST 权重按路径设上限，由调速器执行。第二轮修订：桌面与手机共用同一条连接、同一组订阅（第 10 节的数据路径表），手机的轻量体现在一行最优买卖价、60 s 窗口与更低的帧率和 DPR | 第 10 节 |
| E3 | 遵守按 IP 共享的限额，跨标签页只开一个连接 | 每页一个 Worker 持有的连接，用 Web Locks 在 sairn.ai 各标签页之间选出一个 | 第 10 节 |
| E4 | 不在主线程做 WebGL；核心是 DOM 加按事件重绘的 Canvas 2D | 采用 | 第 7 节 |
| E5 | 版本路径：先对齐 Tailwind；Astro 6 单独一个 PR；Astro 7 等全仓 Node 决定 | 采用 | 第 11 节 |
| E6 | 用 Astro CSP API 输出 meta CSP；其余响应头由运营方在 CloudFront 配置；把 `gatu-rewrite-index` 源码收进仓库；核对 NumberFlow 的样式注入 | 采用；NumberFlow 在选定 `style-src` 下的渲染列为阶段 3 验收项；meta CSP 管不到 Worker，见第 17 节 | 第 17、19 节 |
| E7 | 有意重写品牌与文案契约并做变异检查；动效令牌从 JSON 读取并做等值测试；`seo.ts` 主题色；法律页不动 | 采用 | 第 8、9、18 节 |
| E8 | 琥珀只留在 Logo，除非先修订 ADR | 采用 | 第 9 节 |
| E9 | 主张修正作为阶段 0 单独的小 PR | 采用 | 第 19 节 |
| E10 | 精度与运算：保留协议字符串，按 szDecimals 与 5 位有效数字定精度，用 Big.js | 采用；协议直接给出的值原样显示、只换分隔符，精度规则只用于计算出的值 | 第 10 节 |
| E11 | 日语：默认关闭的开关、闸门记录、测试、不跳转、只用美元 | 采用 | 第 12 节 |
| E12 | 无障碍：暂停、统一的减少动态模块、不报跳动、DOM 表格、H1 为 LCP、44px 触控 | 采用 | 第 14 节 |
| E13 | 若保留点击进终端的过渡，必须不延迟导航、处理修饰键与 bfcache，否则去掉 | 去掉（与 A9 一致） | 第 8 节 |
| E14 | 体积预算测试；控制 CI 分钟数；改工作流要更新 `ci-workflows.test.mjs` | 采用；Lighthouse 每次发布在本地跑 | 第 13 节 |
| E15 | 与邮件共用一套 UTM，不用 `?ref=`；日志由运营方开启；聚合不存地址 | 采用，改为与邮件统一命名规则（同一分隔符与取值表），进入页面时带的 `utm_*` 透传；日志去掉 `c-ip` 并交律师 | 第 16 节 |
| E16 | 更新发布手册：快照与主张检查、重拍截图与海报、删除下架市场页、真机记录 | 采用；第三轮修订后另加重录演示录屏（第 9 节） | 第 19 节各阶段交付物 |
| A1 | 英文站风险主张现在就删，删除不必等律师 | 阶段 0；发布由运营方批准，律师收到改动对照 | 第 19 节；决定 D1 |
| A2 | 日语禁用词表禁的是登记类主张，不是「登録」这个词 | 采用；禁用清单放在 `tests/`，因为 copy-contract 会扫描 `src` 下所有文本 | 第 12 节 |
| A3 | 凡链到 app.sairn.ai 的都算 CTA；日语页每个都要配风险句，否则去掉；英文首屏、结尾与市场卡组配 14px 以上正文色风险句 | 采用（第二轮修订后的位置：首屏、三步开始、市场表与结尾）；英文只有页头页脚导航列入豁免清单；现站 Hero、Footer 与 404 的 CTA 风险句提前到阶段 0 | 第 6、18、19 节 |
| A4 | 写明律师意见必须覆盖的范围，并规划「律师不同意」的分支 | 采用 | 第 18 节 |
| A5 | 第一版日语只上 `/ja/` 与 `/ja/deposit/`，实时数据只有 BTC、ETH 的美元价格 | 采用；「100以上の無期限先物」是由结构快照检查保证的静态主张，不是实时数字（第 12 节同一口径） | 第 12 节 |
| A6 | 每条主张精确可证 | 见第 3 节「不写的内容」 | 第 3 节 |
| A7 | 截图只用夹具数据并标注；海报永远写 'Recorded' | 第一轮采用。第二轮修订提议改为：未登录状态下实拍 app.sairn.ai 的现货市场（现货没有杠杆控件），DOM 守卫拒绝杠杆、`xyz:`、钱包品牌、测试网、盈亏与账户摘要，并要求画面里有可见的 Connect 按钮，截图注明来源与 UTC 日期；夹具数据保留为备选，待决定 D21。Live market 的海报永远写 'Recorded' 不变。第三轮修订：首屏默认视图改为录屏，录屏与截图用同一来源规则、共用 DOM 守卫，说明写 'Screen recording of …'（第 9 节）；录屏的首帧海报用录屏的说明行，不写 'Recorded' | 第 6、7、9 节；D21 |
| A8 | 画布上的文字要有不透明底板，并测对比度 | 文字一律放在不透明底板上，不叠在光场上 | 第 6、7 节 |
| A9 | 不在文字背后放全宽动效，不做点击触发的全视口缩放，不自动播放视频；页面级暂停 | 采用；第三轮修订：只允许静音循环的真实终端录屏自动播放，带暂停按钮，减少动态与省流量时不播放（第 8 节） | 第 8、14 节 |
| A10 | sairn.ai 不写 Cookie 与 localStorage；只用 `utm_*`；日志短期保存；只用聚合数据；主机白名单测试 | 采用；暂停状态只存在内存 | 第 8、16 节 |
| A11 | 日语排版细节：※ 紧跟主张、OFL 保留名核对、签字记录 | 采用；保留名的结论取决于子集的源文件出自哪里 | 第 12 节 |

## 5 信息架构

本站顺序参照调研第 4 节第 14 条「信息架构与转化路径」里交易所一段的惯例（首屏 → 实时市场条 → 三支柱 → 分项特性 → 3 步 → 安全 → FAQ → 结尾 CTA → 风险），首屏用永续 DEX 的公式（4–8 个词的主张、一句副标题、一个主 CTA），并借用 Hyperliquid 前端的深链与槽位 UTM、桌面二维码转手机。第二轮修订（L4）把页头与页脚之间的内容收敛为七段：产品证明提前到首屏与第 02 区块，行情只在首屏与市场区出现，两种进入方式并入三步开始。偏离之处与原因：

- 没有 Logo 条、投资人、用户数或审计徽标：这些都不存在（第 2 节非目标）；
- 首屏没有交易所式的内联邮箱注册：官网没有后端，注册在终端的连接窗口里完成，CTA 直接深链到 `/trade/BTC`；
- 「三支柱」与「分项特性」合并为第 02 区块的一张终端截图加三张能力卡；
- Hyperliquid 的网络数字降为市场区的一行，标明来源，不放 Sairn 自己的数字；
- 没有产品站的更新日志与公告条在首版首页上，二者随 `/changelog/` 在阶段 5 加入。

### 首页 `/`（英文）

页面外框（不计入七段）：

| 部分 | 作用与内容 |
| --- | --- |
| 跳转链接与官方网址一行 | 纯文本，不是链接（链到 app.sairn.ai 就成了 A3 意义上的 CTA，会让风险相邻测试失败）：'Official addresses: <apex> · <www> · <app>'，从 `brand.json` 的 `domains.primary` 读取（`www.sairn.ai` 也直接返回 200，见[官网发布手册](../deploy/website/README.md)），是否列 `testnet` 由运营方定；不写「只」。只放在首页与 `/ja/` 顶部，其他页在页脚列出，避免每页重复朗读。测试断言该行不含 `<a>` |
| 页头 | 横版 Logo（≥24px）；锚点 Terminal、Get started、Markets、Fees、Security、FAQ，分别指向第 02–07 区块（Get started 即 `#start`）；`/ja/` 上线后才出现的 EN \| 日本語 链接（不自动跳转）；`bg-action` 的 'Open terminal'，链到 `/trade/BTC` 并带 `utm_content=header` |
| 页脚 | `brand.json` 的法律实体 Sairn Corp.；`/terms`、`/privacy`、`/risk`、`/support`；官方网址；页面级 'Pause live data'；语言链接（`/ja/` 上线后）；'Not financial advice'；构建时计算的版权年份与构建日期。品牌迁移计划 D2 提供账号前不放社交链接 |

七段内容：

| 序号 | 区块 | 作用与内容 |
| --- | --- | --- |
| 01 | 首屏 | 终端预览（默认 Terminal 视图）加 Live market 视图，见第 6 节 |
| 02 | 终端与三项能力（`#terminal`） | 一张经 DOM 守卫的静态大截图（与首屏 Terminal 视图的录屏同一来源规则、共用 DOM 守卫，可以是另一个市场或面板，第 9 节）加三张能力卡，草稿：订单类型（市价、限价、TP/SL、TWAP、Scale，不写 TWAP 参数）；永续与现货在同一界面；手机与 PWA。截图 AVIF/WebP，经 Astro `<Picture>`。取消原「终端内部」的四屏吸顶叙事：桌面是截图配三张卡，手机按截图、卡片的普通纵向顺序排列，没有吸顶或滚动换屏 |
| 03 | 三步开始（`#start`） | 合并原「三步开始」与「两种进入方式」：用邮箱或自己的钱包登录 → 存入 Arbitrum 上的 USDC（链到存款指南） → 下第一单；每步一句话，可配一张截图裁切，不写耗时承诺。第一步内含 'How email sign-in works' 的短说明（邮箱：Privy 为账户创建钱包；外部钱包：连接后批准一个交易密钥，第 3 节登记表的措辞），详细签名解释在 `/how-it-works/` 上线（阶段 5）后链过去，之前不加链接（链到 app.sairn.ai 的文档页会成为 A3 意义上的 CTA）。首屏次级链接 'No wallet? How email sign-in works →' 跳到这里。本节一个 CTA（`utm_content=start_cta`），配风险句 |
| 04 | 市场（`#markets`） | 白名单市场的实时表：行来自运营方审阅的白名单（首版 BTC、ETH、SOL、HYPE 主场所永续，写在 `src/config/markets.ts` 的首页子集里，阶段 2 建文件；D15 扩大 `/markets/` 白名单不改变首页表的行数，订阅上限仍为 7），列为实时标记价、24h 涨跌（带符号与 ▲▼）、手绘 24h SVG 走势与 'Trade' 深链（`/trade/:symbol`，各自的 `utm_content`）；表格配风险句；一行说明现货在同一界面交易。不放 HIP-3 股票、指数、金属或 JP225。表下一行网络统计（原「实时证明条」降级）：主场所未下架永续数量、24h 永续名义成交额（Σ `Big(dayNtlVlm)`，`dayNtlVlm` 已是美元名义值）与持仓量（Σ `Big(openInterest).times(markPx)`：`openInterest` 是基础币数量，不是美元，同终端的 `getOiUsd`；只对未下架项求和，任一项 `markPx` 缺失或为 0 时该项 fail closed），都用 Big.js 求和、向下取整，写来源与更新时间，附「How we compute this」说明；验证不通过的项直接移除，行高不变 |
| 05 | 费用（`#fees`） | 永续合计 taker 0.055% / maker 0.025%，配分解条：Hyperliquid 基础 0.045 / 0.015 加 0.01% builder fee；现货 'builder fee on sells only'；'TWAP orders carry no builder fee'；HIP-3 场所可能另定费率；注明日期。数字由现有 copy-contract 钉在 `config/hyperliquid.ts`（原证明条的两张静态费用卡并入这里） |
| 06 | 机制与信任（`#security`） | 合并原「订单怎样流转」与「记录在案」。上半是 Fig. 1，说明非托管怎样成立：浏览器 → 你的签名（邮箱：Privy 为账户创建的钱包；外部钱包：你批准的交易密钥） → Hyperliquid 订单簿 → 在你自己的 Hyperliquid 地址结算。Sairn 的方框只标「界面 + builder fee」。标明「Illustration」，不显示他人订单；节点只用 `brand/loader/glyphs/mono/` 的状态符号（`currentColor`，颜色由官网令牌决定），不用 `on-dark/`：其中 `pending.svg`、`unknown.svg`、`wallet.svg` 含琥珀 #E6B766，动效令牌 on-dark 的 surface 是品牌青 #0A3038（C*ab 13.3，与 #03211c 的 ΔE76 只有 12.0），会把琥珀与青色带进标志图形（违反本规划 D5 的默认、ADR 0028 决策 6 与仿冒防护第 2 条）。下半是编号清单，每条带 ※ 链到证据：托管（条款 §1.3）；签名（第 3 节的三条签名主张）；费用（builder fee 与核对方式，核对路径实施时按 Hyperliquid 文档写）；数据去向（浏览器直连 `api.hyperliquid.xyz`，不加分析工具）；独立声明（条款 §1.1）；安全（'We will never ask for your private key, seed phrase, verification code or password'，第 3 节登记表）；官方网址（纯文本）；支持与风险披露链接（`/support/`、`/risk/`，都在 sairn.ai；终端文档在 app.sairn.ai，链过去就是 A3 意义上的 CTA，`/how-it-works/` 上线前不链）。没有审计、投资人、用户数或状态徽标 |
| 07 | FAQ 与结尾 CTA（`#faq`） | FAQ 继续由 `config/faq.ts` 同时生成页面与 FAQPage 结构化数据。删掉 'There's no KYC'，改为条款 §2 的资格说明；删掉股票问答 'Can I really trade stocks here?'；删掉市场问答里的 HIP-3 品类（'equity, index, and metal perps'）与 'New markets appear automatically'；把杠杆问答 'What's the max leverage?' 改为风险与保证金说明（FAQ 里本来没有杠杆数字，有的是这两条问答）；删掉交易所钱包名；'Orders are signed with your keys' 按登录方式改写，'gas-sponsored deposits' 改为 'deposit transactions'；保留 'TWAP orders and spot buys carry none'。新增：Who holds my funds?、What does a trade cost?、What do I need to deposit?、Where does the live data come from?、Why might a number not show?、Is this investment advice?。区域与代理拦截的问答措辞交律师。之后是结尾 CTA 'Start trading'，配同一风险句，下接风险摘要，链到 `/risk`（由 `legal/riskDisclosure.md` 渲染） |

手机按同一顺序纵向排列，没有吸顶叙事。

旧编号（第一轮的 14 个区块）到新位置的对照：

| 旧编号 | 旧区块 | 新位置 |
| --- | --- | --- |
| 01 | 跳转链接与官方网址一行 | 页面外框，不变；官方网址另在 06 的清单里 |
| 02 | 页头 | 页面外框；锚点改为指向 02–07 |
| 03 | 首屏 | 01 |
| 04 | 实时证明条 | 实时卡降为 04 的一行网络统计；两张静态费用卡并入 05 |
| 05 | 市场（四张卡） | 04，改为白名单实时表 |
| 06 | 三步开始 | 03 |
| 07 | 订单怎样流转（Fig. 1） | 06 的上半 |
| 08 | 终端内部（吸顶四屏） | 02，改为一张截图加三张能力卡；吸顶叙事删除 |
| 09 | 两种进入方式 | 并入 03；两个同链接、只差 UTM 的 CTA 删除（L9、S6）；桌面二维码只留在首屏的 'Open on your phone' 弹层 |
| 10 | 费用 | 05 |
| 11 | 记录在案（信任清单） | 06 的下半 |
| 12 | FAQ | 07 |
| 13 | 结尾 CTA 与风险摘要 | 07 |
| 14 | 页脚 | 页面外框，不变 |

删除的区块与元素：Manifesto（'No KYC. No custody. No middlemen.' 逐词出现）、FeatureSpeed（'8 order types'、'100+ perp markets' 计数动画）、Ticker 跑马灯、`animate-ping` 状态点、假浏览器框与 'Connected · 12ms'。

### 日语首页 `/ja/`（受闸门约束，第一版最小范围）

| 序号 | 区块 | 内容 |
| --- | --- | --- |
| 01 | 【ご注意】官方网址一行 | 与邮件防钓鱼段一致：「Sairnから、メールで秘密鍵・シードフレーズ・確認コード・パスワードをお尋ねすることはありません。」（产品名经 `BRAND_NAME` 插值）与「正規のURL」，纯文本、不是链接。邮件只列取引画面与ウェブサイト两项；英文行若加 `www`，是否同步加进邮件与 ja 由运营方一并决定 |
| 02 | 页头 | Logo、锚点、EN 链接；不放 app.sairn.ai 链接（因为页头放不下风险句，A3） |
| 03 | 首屏 | 见第 6 节「`/ja/` 首屏」 |
| 04 | 3つの特長 | 資産を運営会社に預けない；メールアドレスで登録できます；手数料の明示（合计 テイカー0.055%・メイカー0.025%，※ 写范围与日期）。「スマートフォンのブラウザでも使えます」要先在主张登记表补证据行并经律师同意；不写「プロ仕様」 |
| 05 | 取引までの3ステップ | 登録 → Arbitrum上のUSDCを入金（链到 `/ja/deposit/`） → 注文；不写时间承诺 |
| 06 | 仕組み | Fig. 1 的日语版（静态 SVG） |
| 07 | 手数料 | 拆分与合计，带日期与 ※ |
| 08 | よくある質問 | 只用登记表里 `approved` 且允许 ja 的主张 |
| 09 | 【注意事項（よくお読みください）】 | 完整风险块，放在页脚之前 |
| 10 | 页脚 | 律师措辞的未登记声明、「Hyperliquidが運営または推奨するものではありません」、Sairn Corp.（来自 `brand.json`）、标「英語」的条款链接 |

### 其他页面

| 路径 | 说明 | 阶段 |
| --- | --- | --- |
| `/deposit/`（英文） | 怎样取得 Arbitrum 上的原生 USDC，并从终端的 Deposit 窗口存入；网络选错无法撤回；外部钱包需少量 Arbitrum ETH 作 gas，紧接着写中和句 'If you use email sign-in, the Deposit window shows the steps for your account.'（第 3 节登记表；只写 gas 一句会反衬出邮箱存款免 gas，也就是 ADR 0040 的赞助自动存款，见邮件闸门 9）；首次提款的激活费写成「以窗口显示为准」，不写金额（[提现路由](withdrawals.md)）。不写自动、免 gas、刷卡或日元存款，也不写「存款期间保持页面开着」（邮件 §5 归入客服 FAQ；[ADR 0040](adr/0040-automatic-email-wallet-deposits.md)、[卡存款清单](privy-card-funding-launch-checklist.md) CF-11）。截图来自采集管线 | 2 |
| `/ja/deposit/` | 日语存款指南，结构同上，逐句写明：外部钱包一句「※外部ウォレットから入金する場合は、ガス代としてArbitrum上のETHが少額必要です。」之后紧接邮件第 4 版的原句「メールアドレスで登録した場合の入金方法は、入金画面に表示されます。」（登记表状态 `pending-legal`；邮件 README 闸门 9 引用的「メールアドレスでご利用の場合の入金手順は…」是第 2 轮写法，已被第 4 版取代）；不写「画面を開いたまま」；不点名国内交易所；「国内の取引所が…対応しているとは限りません」一句等律师意见 | 4 |
| `/terms/`、`/privacy/`、`/risk/`、`/support/` | 继续由内容集合渲染 `legal/*.md`，只经 `LegalArticle` 换样式；日语页链到英文原文并注明 | 2 |
| `/404/` | 保留 noindex，'Open the terminal' 与 'Back home' | 2 |
| `/blog/` | 第一篇文章出现前移出导航与站点地图并设 noindex；现在的「No posts yet」读起来像荒废 | 0 |
| `/how-it-works/`（英文） | 签名模型的白话长文：精确的所有者签名、Privy 邮箱钱包、交易密钥的批准与范围、'Stay Connected' 默认关闭、builder fee 在第一笔需要它的交易时才批准；主张取自[首次交易](trading-onboarding.md)与[签名机制](hyperliquid-signing.md)。不链到私有仓库或 ADR（copy-contract 禁止 'open source' 与 'code is public'） | 5 |
| `/fees/`（英文） | 费用说明与构建时用 Big.js 计算的示例，测试与终端配置对齐 | 5 |
| `/markets/`、`/markets/[symbol]/`（英文） | 只为运营方审阅过的稳定白名单生成（写在 `src/config/markets.ts`，只含主场所、未下架的币种，数量与名单由决定 D15 定），不在构建时按易变的 24h 成交额排名，否则违反 E1，页面还会随每次发布增删，造成 404 与站点地图抖动。结构快照检查确认白名单里每个币种仍存在且未下架，否则发布停止。若以后改用排名，排名要写进带 `fetchedAt` 的快照，并设滞后规则（连续两次发布低于阈值才移除）；页面放 `meta` 的结构信息（szDecimals、价格精度规则、资金费每小时结算）、实时价格岛、24h 走势、简短说明、FAQ 与 `/trade/:symbol` 深链；不写杠杆上限；HIP-3 页面等律师意见；不建 `/ja/markets/`。下架的市场停止生成，并按发布手册先 `--dryrun` 再删除对应 HTML | 5 |
| `/learn/`（英文） | 3–5 篇指南：从 Arbitrum 向 Hyperliquid 存 USDC、builder fee 是什么、Hyperliquid 上的永续与现货、交易密钥（API 钱包）是什么，各带 FAQ | 5 |
| `/changelog/` | 构建时从 `CHANGELOG.md` 选出面向用户的条目，带日期；同时供可选的公告条使用 | 5 |
| `/llms.txt`（以后加 `/llms-full.txt`） | 静态摘要：Sairn 是什么、官方网址、费用、文档链接 | 5 |

## 6 首屏

### 英文首屏（文案均为草稿，D7）

第二轮修订（L1、L3、L6、L9、S1、S6、V4、V6）：产品窗口默认展示真实终端；文案与按钮组压缩，手机首屏必须露出窗口内容。原型的两个变体共用下面的内容与顺序，只在构图上不同：A 在视口 ≥1200px 时左 5 列文字、右 7 列窗口，更窄时单列；B 是标题居中、窗口在下方全宽（字号见下文；绘图区比例只随窗口宽度，不随变体，见第 7 节）。下文按 A 的分栏写。

桌面（12 列网格，最大宽度 1280）：

- A 的两栏只在视口 ≥1200px 时使用；1024–1199px 与平板（641–1023px）一样单列，窗口在文案下方。原因（第二轮审查 L-N3，源码推算，未在浏览器实测）：1024 宽时两栏的右栏画布只有约 471px，达不到第 7 节桌面绘图区 ≥560px 的要求。
- B 在短桌面视口（`min-width: 1024px` 且 `max-height: 820px`）收紧页头与首屏间距，让窗口上移；目标取 L2：1366×768 的 CSS 视口下窗口顶边 ≤380px（第 25 节实测 374px，达标；Live 视图画布首屏露出 235px，L2 建议的 ≥260px 本规划未采纳为目标）。不靠删减官方网址一行、风险句或存款一行换高度，也不拉开风险句与按钮之间的 8px。
- 布局检查宽度：1024、1100、1200、1280、1366、1440 与手机 390（阶段 2 另加 320）。每个宽度下两个视图、各个状态的窗口高度不变，身份说明完整显示（`scrollWidth ≤ clientWidth`）。

- **左 5 列（≥1200px；更窄时在窗口之上）**：
  - 可选的公告条（仅英文，带日期，来自 `config/announcement.ts`，链到 `/changelog/`）。
  - 眉标题（IBM Plex Mono 12/16，`text-fg-muted`）：'Independent web terminal for Hyperliquid'。
  - H1（IBM Plex Sans 500，字距 -0.02em，统一近白 `text-fg`，不做灰白两色分句）：'Trade Hyperliquid perps and spot.'。字号上限：A 48/52，B 60/64，手机 32/35。H1 在静态 HTML 里，是 LCP 元素，从不为入场动画隐藏。
  - 副标题（18/28，`text-fg-muted`；在 390px 宽的手机上不超过两行）：'Sign in with email or your own wallet. Your funds stay at your own Hyperliquid address.'
  - CTA 组（`data-cta-group`），自上而下：
    - 主按钮 `bg-action` / `text-on-action`（`--action` 保持中性，ADR 0028）'Trade BTC' → `{APP_URL}/trade/BTC?utm_source=website&utm_medium=site&utm_campaign=en_home&utm_content=hero_cta_btc`（`APP_URL` 来自 `config/brand.ts`，不写域名字面量；命名与透传规则见第 16 节）。在 Live market 视图里切换市场时，名称与链接跟随所选市场（例如 'Trade ETH'、`hero_cta_eth`）；切换 Preview 视图不改变它；
    - 与主按钮同组的次级文字链接 'No wallet? How email sign-in works →'，跳到本页第 03 区块 `#start`。它是页内锚点，不链 app.sairn.ai，所以不是 A3 意义上的 CTA，也不带 UTM；不再是「同一终端链接换一个 UTM」（L9、S6）；
    - 间隔 8px，风险句（`data-risk-note`，14px，正文色，不用淡色）：'Perpetual futures use leverage. You can lose all of your margin. Risk disclosure →'；
    - 再间隔 8px，「需要什么」一行：'To deposit, you need USDC on Arbitrum. Deposit guide →'；
    - 仅桌面：'Open on your phone' 弹层（Popover API），构建时用 qrcode 1.5.3 生成内联 SVG 二维码，指向主按钮的链接。
  - 小字（Plex Mono 12px）：'Non-custodial · 0.01% builder fee · Independent interface: not Hyperliquid Corp. or the Hyper Foundation'（'endorsed' 等证据，第 3 节）。
- **右 7 列（≥1200px；更窄时在文案下方）：Preview 窗口**。一个用终端表面色（#0F1A1F、浮层 #212d33、`--orderbook-*`、涨跌色）绘制的产品窗口，内部分区，文字一律放在不透明底板上。顶栏是名为 'Preview' 的 tablist（`role=tablist`，方向键切换），两个视图。每个视图的第一行是常显的身份说明（第二轮审查 L-N1、V-N3）：位于顶栏之下、内容之上，静态 HTML，不依赖 JS；允许换行，不用省略号或行数截断；两个视图按最窄宽度预留同样的行高，切换视图不改变窗口高度。
  - **Terminal（默认，D20）**：app.sairn.ai 的真实录屏（第三轮修订；第二轮是静态截图），未登录状态，HYPE/USDC 现货市场（现货没有杠杆控件），裁切到账户表格之上。桌面约 17.5 s：图表周期 1h → 5m、最近成交、盘口、限价、点盘口填价、卖出、TWAP、Scale，再回到初始状态：循环点上界面状态（图表周期、标签、下单类型与方向）与开头相同，但价格、盘口与图表会在循环点跳一下，不是无缝循环；手机约 7.4 s（视频 7.43 s）：下单类型、限价、点盘口、卖出、只看卖盘、恢复。静音、循环、`playsinline`，只在视图可见且页面可见时播放；右下角 Pause / Play 按钮（WCAG 2.2.2；只换文字，不用 `aria-pressed`，状态跟随视频的 play / pause 事件，`play()` 被拒绝时显示 Play）；减少动态与 Save-Data 时只显示海报（首帧），按 Play 才加载，浏览中途开启任一项即暂停；跨过 640px 断点时换源并重新加载；海报（录屏首帧）是视频下方的静态 `<picture>`，由解析器直接发现，按断点取图，不另写预加载，没有 JS 时也显示；页面级 Pause 同时暂停录屏，恢复时回到录屏自己的播放状态。
    - 录屏的身份说明：'Screen recording of app.sairn.ai, signed out · <date> UTC'（原型为 '25 Oct 2026 UTC'），录制日期写在这一行可见说明里；视频的 `aria-label` 写市场、未登录状态与录屏里发生的操作（原型：'Screen recording of the Sairn terminal, signed out, on the HYPE/USDC spot market: …'，不含日期；第 14 节）。
    - 录制像素（2026-10-25 原型录制，`media/demo-capture.json`）：桌面视口 1440×900、1 倍像素，录制区域 1440×732（Chrome 屏幕广播）；手机 390×844、2 倍像素，录制区域 390×605 CSS 像素（780×1210）。桌面录屏比第二轮 1.5 倍的截图（2160×1098）像素少，A 版缩小显示与 B 版近全宽显示时的清晰度都要按录屏重新检查（D22）。
    - 演示指针（第二轮审查 L-N1 的延伸）：录屏里点击处的小圆环是录制时叠加的演示指针，不是产品界面（第 9 节）。它可能让访客以为有人正在操作、画面是别人的账户，或者把录制时的价格当成现在的行情；L-N1 担心的「以为能在窗口里直接下单」也可能更强。身份说明里的 'signed out' 与录制日期是现有的缓解，V1 的录屏误解题（第 16 节）检查这几点；D20、D22 的推荐不因此改变。
    - 没有 JS：显示录屏首帧的海报（静态 `<picture>`，按 640px 断点分手机与桌面两个来源，`alt` 写市场与未登录状态）与同一行录屏的身份说明（第 7 节回退阶梯第 3 条）。Pause / Play 按钮依赖脚本，没有 JS 时不显示。
    - 静态截图（不发布录屏时的回退，以及第 02 区块的静态图）：身份说明 'Screenshot of app.sairn.ai, signed out · <date> UTC'（第二轮原型为 '24 Oct 2026 UTC'），市场与未登录写在 `alt` 里；采集视口桌面 1440×900、1.5 倍像素，手机 390×844、2 倍像素；与录屏共用第 9 节的守卫。
    - 画面下方一行区域标签（`aria-hidden`）：桌面 'Chart / Order book / Order form'，手机 'Order form / Order book'，录屏与截图相同。
    - 采集脚本与 DOM 守卫见第 9 节，来源待 D21，A 版的呈现方式待 D22。
  - **Live market**：Open Book（第 7 节）。身份说明：'Public market data · not a terminal feature'（不含市场名，切换市场不改变长度；市场名不与 'not a terminal feature' 写进同一短句，否则 'BTC-USD perpetual · not a terminal feature' 会被读成终端不能交易 BTC）。市场标签 BTC · ETH · SOL · HYPE（第二个 tablist，名为 'Market'；只显示当前 `meta` 里存在且未下架的市场）；状态标记（'RECORDED'、'LIVE' 等，见第 7 节状态表）；Pause 按钮（`aria-pressed`）；价格条：最新成交价（NumberFlow，带可见的 'Last trade' 标签，只在该成交的交易所时间与盘口的交易所时间相差 ≤60 s 时显示，第 10 节）与 24h 涨跌（涨跌色加符号与 ▲▼，不用薄荷）、24h 迷你走势（手绘 SVG，数据来自 `candleSnapshot`）；绘图区、图例与时间刻度（第 7 节）；窗口宽 ≥900px 时（容器查询）右侧有前五档买卖盘（`role=table`，有表头与 caption，表头 'Price (USD) / Size (BTC)'，单位随市场，Plex Mono 12px，订单簿令牌，显示协议原始字符串；行不可点击，避免让人以为能在官网下单），更窄时只有一行最优买卖价。窗口底部两行，允许换行，按最窄宽度预留行高（状态变化不改变高度）：第一行是状态（第 7 节状态表），Live 时 'Live from the Hyperliquid public API. Last trade hh:mm:ss UTC.'，BTC 冷启动的录制阶段 'Recorded <date> HH:MM–HH:MM UTC. Switches to live after 15 s of live data.'，减少动态（Still）时 'Recorded <date> HH:MM–HH:MM UTC. Live view on request.'，设备回退与非选主标签页只写 'Recorded <date> HH:MM–HH:MM UTC.'，Waiting 时 'Waiting for Hyperliquid public data.'，其余不可用的情况 'Live data is unavailable right now.'；第二行是 '<coin>-USD perpetual · Not advice.'（市场随所选标签）。'not a terminal feature' 只用于这个视图。
  - 'Live market' 标签上的圆点只看后台实时数据是否有效（第 10 节 LIVE 判定的数据条件：连接打开、币种匹配、满足新鲜度），不看视图处在哪个状态：选中 Terminal 视图时、以及 BTC 还在录制阶段时，只要后台数据有效圆点就亮。这是有意的，提示实时数据已在积累；LIVE 标记则只在 Live 状态出现。连接按第 10 节的可见性规则打开，与选中哪个视图无关，所以切到 Live market 时海报或实时画面立即可用，圆点也如实反映数据。
- **手机（≤640px）**：
  - 顺序：眉标题、H1（32/35）、副标题（≤2 行）、全宽 CTA 组（主按钮 44px 高、次级链接、风险句、「需要什么」）、Preview 窗口；
  - 390×844 的验收目标（不计原型底部的切换条，那是原型自己的界面）：主按钮顶边 ≤340px，窗口顶边 ≤520px，首屏至少露出 160px 窗口内容（默认是 Terminal 录屏或它的首帧海报；切到 Live market 时至少 120px 绘图区）；
  - Live market 窄版：市场标签横向滚动，一行最优买卖价（WebSocket `bbo`）代替五档，保留状态标记与 Pause，绘图区宽高比约 9:10（第 7 节），没有二维码。
- **首屏性能**：
  - 预加载 Plex Sans 拉丁子集，用 Astro 6 Fonts API 生成的回退度量，换字不引起重排（D9 不同意升级时的备选见阶段 2）；
  - Terminal 视图的海报（录屏首帧）写明宽高，AVIF/WebP，按第 13 节预算（原型的海报是 JPEG，超出预算，第 13 节）；视频本身 `preload="none"`，不进交互前总量；Live market 的海报（标 'Recorded <date> HH:MM–HH:MM UTC'）在标签获得指针、焦点或页面空闲时预取，不进交互前总量；
  - 只有副标题、CTA 与窗口在 400 ms 内淡入，H1 不参与。
- **删除**：'No KYC'、'Live on mainnet' 状态点、'Connected · 12ms'、'each market's full leverage'、假浏览器框与旧截图（含 40x、10x 的两张）；第一轮草稿的 H1 'Trade Hyperliquid perps and spot from an independent web terminal.'、作眉标题的口号、副标题 'Sign in with email or connect your own wallet. {BRAND_NAME} never holds your funds; they stay at your own Hyperliquid address.'，以及次级链接 'No wallet yet? Start with email'（`utm_content=hero_email`）。

### `/ja/` 首屏（待律师与母语审阅）

- 眉标题「Hyperliquid向けの取引ツール」。H1「運営会社に資産を預けずに、Hyperliquidで取引を。」（BudouX 断句，`palt`）。
- 副标题取自已核对证据的邮件第 4 版：「BTC・ETHをはじめHyperliquidの100以上の無期限先物を、24時間取引できます。メールアドレスで登録できます。」
- CTA「取引を始める」→ `/trade/BTC`，默认 `utm_campaign=ja_home`；从邮件进入时透传邮件的 `utm_campaign=jp_2026_trust`（第 16 节）。正下方先是 15px 粗体、正文色的「※無期限先物はレバレッジを伴う取引で、証拠金の全額を失うおそれがあります。」，再下是 13px 的「※取引画面は英語表示です。ご利用の通信環境によっては、注文・入金・出金をご利用いただけない場合があります。」
- 没有 Open Book 画布与盘口。实时数据只有 BTC、ETH 的美元价格（24h 涨跌要律师同意才显示），说明写「Hyperliquidの公開データ」与 `hh:mm:ss JST`。
- 是否放终端截图（标「※画面はイメージです」）由律师意见决定；截图来源随 D21（未登录实拍的画面里有采集时的真实价格，律师看的是那一版）。这里指静态截图；英文首屏的录屏能否用于 `/ja/`，同样由律师意见决定。

## 7 标志性视觉：Open Book

### 画什么

Open Book 是 Preview 窗口里的 Live market 视图（第 6 节），第二轮修订后不再是首屏的默认视图。

- 一个 Hyperliquid 永续（默认 BTC）的「时间 × 价格」流动性画面：
  - 横轴：桌面最近 120 s，手机 60 s，右端是「现在」；绘图区下方有时间刻度，满窗时桌面为 '−120 s / −60 s / Now'、手机为 '−60 s / −30 s / Now'，窗口增长期间刻度跟随当前的窗口宽度；
  - 纵轴：中间价附近的价格，右侧 68px 价格刻度槽（中间价标签在槽里，不压画布）；
  - 中间价离开中央区域时，纵轴按离散步长重新居中，最多每 10 s 一次，不做动画缩放。
- 固定几何：绘图区的宽高比跟随 Preview 窗口的宽度（容器查询），不跟随 A/B 变体：窗口窄于 900px 为 16:5，≥900px 为 13:7，手机（视口 ≤640px）为 9:10。这些是近似取值，实现时可按实测各调一档；第一版的「A 桌面 3:1、B 桌面 16:9、手机 4:5」作废（第二轮审查 L-N3：按变体固定的比例在 1440 宽以外对不齐两个视图）。两个视图叠在同一个网格单元里，窗口取较高者；目标是在第 6 节列出的布局检查宽度下，两个视图的内容高度相差 ≤15px（第 25 节实测：1024–1440 的六种宽度与 390×844 下 ≤14px；视口 641–690px 时图例换行，相差约 60px，未处理）。海报、实时画布与各种回退状态共用同一尺寸，切换状态不改变窗口高度（S10）。桌面绘图区在 1024px 及以上的每个宽度都 ≥560px（由第 6 节 A 的 ≥1200px 两栏断点保证）；窗口宽 ≥900px 时右侧才放五档表，更窄时改为一行最优买卖价（L5、V5）。
- 第 1 层，挂单流动性：
  - 每次盘口快照加一列，每档挂单量用对数映射到亮度，按滚动 95 百分位归一化；
  - 颜色是中性灰梯度（色度 C*ab < 8），最高不透明度 ≤0.65，梯度没有近白的终点，不与中间价线争亮度（V3）。A 用原型的暗中性灰阶；B 用 #263138 → #68747D → #AAB4BC（C*ab 6.5 / 6.9 / 5.6，见第 9 节的表），B 在任何地方都不用琥珀，所以 D5 与 ADR 0028 都不必为 B 修改（V2、S5）；买卖两侧最多带终端 15% 深度填充那样的色调。
- 第 2 层，成交：
  - 同一交易所时间（成交的 `time` 是区块时间）、同一主动方向的成交在显示上合并为一个点，画在按成交额加权的均价处，金额为合计（第二轮原型实现；第一轮把每个价位各画一点，一笔大单会画成一串）。这是显示合并，不是订单识别：一笔吃单扫过多个价位时，它的成交都在同一区块，会并成一点；但同一区块里同方向的几笔吃单也会并成一点。能区分它们的 `hash` 与 `users` 已被校验器丢弃（第 10 节），也不为此保留。`side` 按主动方理解，Hyperliquid 文档没有明说，实施时核实；
  - 在（时间，价格）处画点，半径与 √名义金额成正比，限制在桌面 2–8 px、手机 2–6 px；
  - 买单是 `--orderbook-price-bid` 实心点，卖单是 `--orderbook-price-ask` 空心环，方向同时由形状表达；
  - 历史成交点没有光晕；光晕只出现在新成交到达时的一次性描边脉冲上，320 ms（≤400 ms，即不超过品牌 `feedback` 时长），每帧最多 8 个新脉冲。
- 第 3 层，中间价轨迹：1.5px #EDEEF2（与 `--action` 同值）细线，下面一道深色衬底，不加光晕（第 9 节；用琥珀需决定 D5）。悬停时出现中性十字线，DOM 提示框描述最近的那个点：它合并了几笔成交（'N trades'）、合计数量与加权均价、交易所时间，例如 'Buy · 3 trades · 0.0450 BTC · avg 67,012 · 21:03:11 UTC'（合计与均价是计算值，用 Big.js 并按第 10 节的精度规则取）；不把一个点写成一条协议记录。
- 图例（绘图区上方一行，文字在不透明底板上；L8、V8）：'Resting orders (brighter = more size)'、'Buy trades'、'Sell trades'、'Dot size = trade value'、'Mid price'。合并后点的大小是该点的合计金额，'Dot size' 一项的措辞随 D7 定。
- 删除第一轮原型 B 的暖色背景光、窗口入场的 0.99→1 缩放与历史成交光晕；整页网格底纹若保留，不透明度 ≤1%（V9）。
- 盘口只从访客到达时开始画，不回填历史；切换标签时清空全部缓冲区，就像终端在身份变化时重置。

### 冷启动（第二轮修订：录制海报）

- 默认市场 BTC 到达时显示录制海报（静态图，标记 'RECORDED'，说明 'Recorded <date> HH:MM–HH:MM UTC'）。海报上的价格条、五档、坐标与中间价标签全部取自同一份录制的元数据快照（见下文海报管线），所以显示的每个数字都来自同一时刻。
- Worker 同时在后台建立实时状态（REST 种子加 WebSocket，第 10 节）；只有连续 15 s 收到有效实时数据之后，才以一次场景替换（下一条）切到实时画面，标记随场景一起换成 LIVE。
- 场景替换（录制 → 实时与实时 → 录制两个方向相同；第二轮审查 V-N1、S-N2）：
  - 数据区（价格条、图例、绘图区、坐标、五档、最优买卖价一行与说明行）约 100 ms 淡出；顶栏的状态标记不淡出，在数据区不可见时与内容同一步替换；
  - 在不可见时，一个同步步骤里替换全部内容：画面、每一个数字、坐标、标记与状态文字；
  - 淡入的时机：去实时时等 Worker 确认已画出一帧（超时 300 ms），回海报时等海报图片解码完成（同样最多等 300 ms）；
  - 减少动态时直接替换，没有淡化；
  - 不做两套画面的交叉淡化：交叉期间两套数字同时半透明可见，本身就违反「每一帧的数字只来自一个来源」；
  - 24h 走势在录制阶段就预取（只缓存、不绘制），实时场景出现时一起带上，不再先隐藏再补画；这条 `candleSnapshot` 请求计入第 10 节的 REST 权重。
- 一个视图里绝不混用录制值与实时值：海报显示期间，价格条与五档也显示录制值，不提前换成实时数字。
- 其他市场没有海报，切过去时直接进入实时：用一次 REST `l2Book` 快照画出最右侧的当前深度列，用 `recentTrades` 在窗口内播种成交点；时间轴宽度是 max(已过时间, 15 s)，随数据增长到满窗，所以第一帧就有内容。只有 BTC 有海报，V3 的结论也只覆盖 BTC。
- 减少动态：海报作为静止画面一直保留，直到访客按 'Show live view'。
- 实时数据失败（被拒、校验不通过、不满足新鲜度）：海报保留，说明行写明实时数据不可用（下面的 Unavailable 状态）。
- 生产版每次发布重新录制、重新生成海报（AVIF/WebP），海报上始终保留录制日期。

### 状态

Live market 视图在任何时刻只处于下表的一个状态，每个状态都使用同一个固定尺寸的绘图区。标记与说明文字是草稿（D7）。

| 状态 | 何时 | 标记 | 画的是什么 | 显示哪些数字 |
| --- | --- | --- | --- | --- |
| Recorded | BTC 冷启动，实时数据连续有效未满 15 s；或设备条件只允许海报（见回退阶梯） | 'RECORDED'；说明 'Recorded <date> HH:MM–HH:MM UTC'。后台实时数据有效时 Live market 标签上的圆点照样亮（有意，第 6 节） | BTC 海报 | 只有海报元数据快照里的值（最新价、24h 涨跌、前五档、坐标与中间价标签、走势收盘价），都是回放最后一刻的值 |
| Waiting | 没有海报的市场（或已离开海报的 BTC）开始一条新数据流（到达、切换市场、恢复之后），还没有收到一帧通过校验的 `l2Book` 或 `bbo`；最长 6 s，之后转为 Unavailable | 没有 LIVE 与圆点 | 同尺寸的空绘图区，数据到达后逐列填入 | 不显示数字（预留宽度的空白槽）。说明行写 'Waiting for Hyperliquid public data.' |
| Live | 满足第 10 节的新鲜度条件；BTC 还要先连续有效 15 s 并完成场景替换 | 'LIVE'；Live market 标签上有圆点 | 实时画布 | 只有实时值，带第 10 节归属规则的更新时间；最新成交价带 'Last trade' 标签，只在它与盘口的交易所时间相差 ≤60 s 时显示 |
| Paused | 访客按下 Pause | 'PAUSED' | 按下时的最后一帧，不再更新 | 冻结在按下那一刻的值，说明行写 'Paused · numbers and chart are frozen'；Recorded 状态没有 Pause 按钮（海报本来就是静止的） |
| Still（减少动态） | `prefers-reduced-motion: reduce`，访客还没按 'Show live view' | BTC：'RECORDED'；其他市场：'STILL'，说明行写 'Still snapshot · hh:mm:ss UTC.'（沿用原型现有写法） | BTC：海报；其他市场：到达时画出的一帧，不再更新 | BTC：海报元数据；其他市场：那一帧的值与时间 |
| Unavailable | 实时数据失败、被拒、校验不通过、不满足新鲜度、Waiting 超过 6 s，或调速器超预算（第 10 节） | 没有 LIVE 与圆点；BTC 保留 'RECORDED' | BTC：海报；其他市场：空的绘图区（同一尺寸） | BTC：海报元数据；其他市场：价格位置是预留宽度的空白槽，不显示任何数字。说明行写 'Live data is unavailable right now.' |

- 「没有数据」指没有通过校验的 `l2Book` 或 `bbo` 帧（成交与 `activeAssetCtx` 不算）。Worker 只维护一个单调的 `lastDataAt`（`performance.now()`，只在接受这两种帧时更新，切换市场与恢复时重新起算），并把 `silentMs`（距 `lastDataAt` 的时长）发给主线程。
- 新鲜度一旦不满足，LIVE 标记、标签圆点与所有实时数字立即消失（绘图区留下空列，不补画）；连接按预算停止（fail closed）或 `silentMs ≥ 20 s` 时，BTC 以场景替换回到海报。20 s 的视图重置（第 10 节）用同一个时钟，两者同时发生；第二轮原型最初从 LIVE 撤下那一刻起再等 20 s（全断流时约 26 s），与本规则不符，已改并重测（第 25 节）。恢复后按冷启动规则重新连续计满 15 s 才回到 Live。短暂断流不回海报，避免在海报与实时之间来回闪。
- 说明行只说明状态，不显示传输错误原文、'offline'、'stale' 或错误代码。

### 怎样构建

- Astro `<script>` 注册 `<sairn-open-book>` 自定义元素（不用 UI 框架）。它先做特性检测，再调用 `canvas.transferControlToOffscreen()`，启动模块 Worker：`new Worker(new URL('./open-book.worker.ts', import.meta.url), { type: 'module' })`。
- Worker 持有 WebSocket、校验、场景模型与渲染。渲染器是 Canvas 2D：
  - 收到新数据时才重绘，按动画帧合并；
  - 上限桌面 30 fps、手机 20 fps，DPR 桌面 ≤1.5、手机 1，渲染分辨率 ≤1.2 MP；
  - 用 `putImageData` 写新列、`drawImage` 滚动，成交点最多 1500 个；
  - 颜色启动时用 `getComputedStyle` 从 CSS 变量读一次，令牌仍是唯一来源。
- 主线程只更新 DOM 片段（标签、盘口表、标记、提示框、NumberFlow 数字），按 Worker 发来的显示字符串，≤4 Hz。
- 离屏（IntersectionObserver）、页面隐藏、按下 Pause、或 Preview 窗口选中的不是 Live market 时停止绘制；选中的不是 Live market 时，Worker 照常接收与校验数据，以便切回时状态正确；离屏与页面隐藏按第 10 节的连接策略关闭连接，Pause 按第 8 节停下所有实时更新。
- WebGL2 不在首版：只有当阶段 1 的测量证明 Canvas 2D 在目标设备上达不到预算，并有人在真机上验证后，才在同一 Worker 里加 WebGL2（`failIfMajorPerformanceCaveat: true`、`powerPreference: 'low-power'`，拆卸时 `WEBGL_lose_context`），那时再加两个渲染器的比对测试。

### 回退阶梯（自动）

1. Worker 里的 Canvas 2D 实时画面（Live）。
2. 海报或一帧静止画面（上表的 Recorded、Still、Unavailable），出现于以下任一情况：
   - 冷启动，实时数据连续有效未满 15 s（只限 BTC，Recorded）；
   - 没有 OffscreenCanvas（为保护 INP，绝不在主线程渲染）、Save-Data 或 `effectiveType` 为 2g、slow-2g、`prefers-contrast: more`：BTC 停在 Recorded 不切实时，其他市场显示同尺寸的空绘图区，说明行写明原因（文案随 D7）；
   - `prefers-reduced-motion: reduce`：Still，提供 'Show live view' 按钮让访客自行开启；
   - 数据未通过校验、不满足新鲜度，或调速器超预算：Unavailable。
3. 没有 JS：Preview 窗口显示默认 Terminal 视图的海报（录屏首帧，静态 `<picture>`）与它的身份说明，Live market 标签不出现（第二轮这里是 Terminal 截图；第 6 节）。

第一轮的「只看成交的窄条」（64px 高的成交打印条）删除：它会改变窗口高度，违背固定几何（S10）；调速器超预算时直接进入 Unavailable（第 10 节）。

### 海报管线（生成文件）

1. `apps/website/scripts/record-market.mjs`（官网的脚本统一放在 `apps/website/scripts/`，该目录现在还不存在）在一条公共 WebSocket 上录约 135 s，订阅与实时视图相同（`l2Book` 加 `nSigFigs: 5`、`bbo`、`trades`、`activeAssetCtx`，第 10 节的数据路径表），结束时再取一次 24h `candleSnapshot` 的收盘价供走势用，写入 `apps/website/src/data/recorded/<coin>-<utc>.json`，记录来源、起止 UTC 与 SHA-256。成交只保留 `coin`、`side`、`px`、`sz`、`time`、`tid`，丢弃 `users`（买卖双方地址，`@nktkas/hyperliquid` 0.33.3 的 `recentTrades.d.ts` 第 41–42 行写明了这个字段）与 `hash`；盘口档位只保留 `px`、`sz`；`activeAssetCtx` 只保留 `markPx`、`prevDayPx`。不把第三方地址提交进仓库，schema 测试断言 `src/data/recorded/**` 与 `market-structure.json` 里没有 `/0x[0-9a-fA-F]{40}/`。原型里对应的脚本是 `designs/website-hero-prototype/tools/record-sample.mjs`。
2. `pnpm --filter @sairn/website poster:render` 在 Playwright Chromium（`@playwright/test` 1.59.1）里让同一个 Worker 渲染器用虚拟时钟回放这份录制，按配色与绘图区比例输出海报（三种比例：窗口窄于 900px 的 16:5、≥900px 的 13:7、手机 9:10；原型另按 A/B 两套配色各出一套，共六张，生产版只用选定的一套配色），每种三个宽度的 AVIF/WebP 写入 `src/assets`，文件名带内容哈希；同时输出一份元数据快照，即回放最后一刻的界面状态：最新价、24h 涨跌、前五档、坐标与中间价标签、走势收盘价。Recorded 状态显示的每个数字都只取自这份快照。
3. 说明文字 'Recorded <date> HH:MM–HH:MM UTC' 由录制的起止时间生成，测试校验两者一致；海报永远写 'Recorded'，不写 'Live'。这些是生成文件，不手改；每次官网发布重新录制、重新生成。

### 测试

- `node --test`：校验器、场景分箱、字符串格式化、`bbo` 与 `l2Book` 的合并规则（含第 10 节卖侧与买侧的例子）；校验器的输出、Worker 发往主线程的消息与录制文件里不含 `users`、`hash` 或任何 `0x` 加 40 位十六进制的地址。
- Playwright `page.routeWebSocket` 故障矩阵：正常、盘口交叉、过期、畸形字符串、币种不符、断线、成交暴涨、超预算。每种故障下 LIVE 标记都不出现，窗口进入 Unavailable，实时区域里不出现 '...'、'—'、'NaN'、'Loading'、'$0'。矩阵另加五种（第二轮审查 S-N3），每种的预期写进用例：
  - socket 已关闭：立即撤下 LIVE，不等新鲜度过期；
  - 仅深度帧无效（`bbo` 正常）：`l2Book` 的坏帧计数不被 `bbo` 清零，连续 3 帧后丢弃深度，撤下 LIVE；
  - 仅深度停更（`bbo` 正常）：最近一帧 `l2Book` 早于 20 s 时在同一连接上重订 `l2Book`，不新建连接；
  - 仅成交停更：LIVE 不受影响，最新成交价按 60 s 规则移除；
  - 仅 `activeAssetCtx` 停更：本规划还没有给它定新鲜度阈值（第 10 节数据路径表里是「—」），阶段 1 定下后写进用例。
- 状态表的六个状态各有用例：标记文字；状态切换前后绘图区与窗口的尺寸相等；Recorded 与 Still（BTC）下显示的每个数字等于元数据快照，Live 下没有一个数字来自快照；Waiting 超过 6 s 转为 Unavailable。
- 冷启动时间点（V3）：在 0、1、2、5、15 s 截图并断言：15 s 连续有效数据之前只有录制值，之后场景替换完成、标记换成 LIVE；中途注入一次无效帧时重新计时。
- 单一来源（V3）：页面内的逐帧采样器（`requestAnimationFrame`）记录数据区、海报与画布的计算不透明度和每个数据元素标明的来源，断言没有一帧同时可见录制与实时两种来源；录制 → 实时、实时 → 录制、减少动态各测一次。它只能证明主线程每一帧的 DOM 与计算样式，不是合成器输出的像素。
- 文字与底板：断言 Preview 窗口里所有文字节点的背景底板计算后不透明度为 1、对比度 ≥4.5:1，且没有文字框与画布区相交（提示框也在不透明底板上）。
- 减少动态模拟下，BTC（海报）的 Worker 渲染帧数为 0；切到其他市场时只渲染那一帧静止画面（Still 状态），之后为 0。
- 关于真实输入（指针、触控、iOS 低电量模式）的任何结论，都要由人在实体设备上验证；注入的事件不算证据。

## 8 动效系统

### 令牌

构建时读取 `brand/loader/sairn-motion.tokens.json`（只读，生成文件不手改），输出为 CSS 自定义属性：

- 时长：`feedback` 400、`confirm` 560、`brand` 800、`loop-fast` 1400、`loop` 2000、`loop-calm` 2800 ms；
- 入场缓动 `cubic-bezier(.22,.7,.28,1)`；深色循环最暗帧 0.55。

一条 `node --test` 断言官网输出的变量与 JSON 相等。官网不复制这些数值，也不给 `scripts/brand.mjs` 加生成目标（工程评审：读 JSON 加等值测试就够，少一层生成耦合）。

### 分层

- **第 0 层，静态契约**：每个元素的默认样式就是终态，动效只做加法。修掉现在 `.reveal` 从 opacity 0 开始、脚本失败时内容一直不可见的问题。
- **第 1 层，纯 CSS（0 KB JS）**，全部放在 `@media (prefers-reduced-motion: no-preference)` 里：
  - 入场：`@starting-style` 配 opacity 与 12px 位移，用 `sibling-index()` 错开（Baseline 2026-08-18），构建时写 `--i` 作回退；每项 ≤400 ms，合计 ≤800 ms。
  - 分节显现：`@supports (animation-timeline: view())` 下用 `animation-timeline: view()`，`animation-range: entry 0% cover 30%`，只动 transform 与 opacity。Chrome 115、Safari 26、Firefox 159（计划 2026-10-27）支持；更早的 Safari 直接显示终态，不加 JS 回退。调研没有在 24 个加密与金融首页里检测到它。
  - Fig. 1 的连线用 `view()` 时间线画出；减少动态时完整显示。
  - （第二轮修订删除：原「终端内部」一节的吸顶设备框与 `view-timeline` 加 `timeline-scope` 换屏。第 02 区块是一张截图加三张卡，只用上面的分节显现。）
  - FAQ 的 `<details>` 用 `interpolate-size: allow-keywords` 与 `::details-content` 渐进增强。
  - 站内页面之间用原生跨文档 View Transitions：`@view-transition { navigation: auto }`，根元素交叉淡化 ≤250 ms，页头用 `view-transition-name` 保持不动。Chrome 126、Safari 18.2 支持；Firefox 退化为普通导航。不用 Astro `ClientRouter`：它改变脚本生命周期，WebSocket 要重新初始化。
  - 首屏的 Preview 视图切换：局部不透明度过渡 ≤180–200 ms，过渡结束后才给旧视图设 `visibility: hidden`（例如 `transition: opacity 180ms, visibility 0s 180ms`），隐藏的视图不能被聚焦，也不被读屏读到；减少动态时即时切换。
  - 市场标签切换不做交叉淡化，复用第 7 节的场景替换：淡出 → 清空 → 淡入到同尺寸的空绘图区，随数据到达逐步填满，旧市场的价格与画面不会叠在新市场的标签下（第 7 节「切换标签时清空全部缓冲区」）。数据迟到时停在空绘图区，不把等待拉长成动画。
  - 这两处都不用同文档 `document.startViewTransition`：它的默认效果是新旧两张快照交叉淡化（原稿写的是用它，第二轮审查 V9 后改）。
- **第 2 层，延迟加载的 JS**：
  - Open Book（Worker，按事件重绘）；
  - 实时数字用 NumberFlow 0.6.2 滚动：首次渲染不滚；同一数值每 2 s 最多滚一次；只是格式变化时不滚；
  - 成交脉冲（320 ms，一次性，第 7 节）；
  - 录制与实时之间的场景替换（约 100 ms 淡出、不可见时整体替换、淡入，两个方向相同，第 7 节冷启动）。
  - 除实时更新外，唯一的持续运动是首屏 Terminal 视图的静音录屏（A9，第 6 节），没有装饰性循环、跑马灯或粒子。

### 规则

- CSS 只动 transform 与 opacity，不动 filter、backdrop-filter、box-shadow 或布局属性。入场不做缩放（删除第一轮原型 B 窗口的 0.99→1），不加暖色背景光，历史成交点不加光晕（第 7 节）。
- 不做滚动劫持（包括 Lenis 一类的平滑滚动）、随滚动的视差或相机移动（WCAG 2.3.3）。这是行为规则；动效库按第 11 节的「原生优先」规则取舍，不再一概禁止（第二轮修订，S8）。
- 文字背后不放全宽动效；不做点击触发的全视口过渡；不自动播放视频。唯一例外（A9，第三轮修订）：首屏 Terminal 视图的真实终端录屏静音、循环、`playsinline`，只在该视图与页面都可见时播放，带 Pause / Play 按钮，减少动态或 Save-Data 时只显示海报；细则见第 6 节。
- 一个共享的动效偏好模块读取 `prefers-reduced-motion` 并监听变化，统一驱动 CSS 开关、Worker、NumberFlow、View Transitions 与 Terminal 录屏。减少动态时页面上什么都不动：画布换成海报，录屏只显示首帧海报且不加载视频，数字直接替换，过渡与滚动动画关闭。现有全局 0.01 ms 规则保留，但滚动驱动动画不依赖它，显式门控。
- 页面级暂停：首屏与页脚各一个 Pause 控件（WCAG 2.2.2），停下画布、数字滚动、所有实时更新与 Terminal 录屏（录屏另有自己的 Pause / Play 按钮；页面恢复时录屏回到自己的状态，第三轮修订，原型已实现）。状态只存在内存里，不写 localStorage 或 Cookie（Cookie 政策只覆盖 app.sairn.ai）；跨页记忆等政策覆盖 sairn.ai 后再议。
- 页面隐藏时全部停止；离屏的区块停止循环。
- 闪烁安全（WCAG 2.3.1）：成交脉冲小、每帧最多 8 个，不做大面积闪烁。
- 删除：Base.astro 的 IntersectionObserver `.reveal` 脚本与 `data-countup` 计数脚本、`.marquee` 跑马灯、`animate-ping` 状态点、Manifesto 逐词出现。
- 品牌入场动效 `brand-intro` 不在页面加载时播放（品牌迁移计划 D12 的动效子项 (h)，见决定 D6）。

## 9 视觉系统与待定品牌决策

### 画布与表面（推荐值，待决定 D3）

- 页面画布保持石墨色 #12131a（官网现在的 `--bg-base`，也是共享 UI 的深色默认）。产品窗口（首屏的 Preview 窗口、第 02 区块的截图框）用终端自己的表面色 #0F1A1F 与浮层 #212d33；Terminal 视图的录屏（及其海报与截图回退）本身就是终端的 #0F1A1F 画面。这一组从 `apps/terminal/src/styles.css` 复制，由跨应用测试钉住。
- 理由：
  - #12131a（C*ab 5.0）与 #0F1A1F（C*ab 6.0）都是近黑中性色，按本节仿冒规则第 3 条豁免 ΔE 检查，所以不拿底色的 ΔE 作理由：用这个指标的话，#12131a 与 Hyper Foundation 的 #04060c 只差 5.1，结论反而相反。与 Hyperliquid 的区分靠色相与色度（#03211c 是有色相的深绿，C*ab 12.8、h 179.5°），以及字体与母题，不靠底色；
  - 首屏窗口与终端启动画面同为 #0F1A1F，「Start trading」之后的连续性由窗口承担；
  - 不改官网画布，令牌改动最少。
- 品牌青 #0A3038 不用作画布：它与 #03211c 的 ΔE76 为 12.0，与 #23524C 为 17.6；品牌迁移计划 D5 还算过，它会让终端订单簿买盘的对比度降到 4.31。
- 只用深色主题上线。以后若做浅色主题，不用 paper #F5F4EE：它与 Hyperliquid 的 #f8f9f9 同为近白中性色，浅色编辑式的页面本身就接近 Hyperliquid 2026-08 改版的样子（区分要靠色相、字体与母题，不靠近白底色的 ΔE）。
- `seo.ts` 的 themeColor 字面量 #0a0a0a 改为读取 `brand.json` 的 `pwa.themeColor`（#0F1A1F）。

### 强调色角色

- `--action` 中性 #edeef2 配 `text-on-action`，用于所有填充按钮（ADR 0028 决策 3）。
- 薄荷 `--signal` #86e5d3 只用于焦点环、链接、Logo 与每节最多一个强调词，不作大面积填充、渐变或光晕，不放在数字或盈亏旁边。它与 Hyperliquid 的 #97fce3 ΔE76 只有 8.5，所以用量要刻意小。
- 琥珀 #E6B766 默认只在 Logo 里（ADR 0028 决策 6）。在标志图形里用它（中间价线、十字线）需要先修订 ADR 0028（决定 D5），而且永远不能靠近风险句或警告。第二轮修订：原型 B 的热度改为灰阶 #263138 → #68747D → #AAB4BC，B 的任何部分都不再用琥珀，选 B 不需要修订 ADR 0028（V2、S5）。
- 涨跌与订单簿颜色复制终端令牌，由跨应用测试钉住。

### 字体（待决定 D4）

- IBM Plex Sans Variable（`@fontsource-variable/ibm-plex-sans` 5.2.8，与终端同包同版本）用于标题与正文：标题 500，字距 -0.02em；首屏 H1 的上限是 A 48/52、B 60/64、手机 32/35（第二轮修订，第 6 节；第一轮是 64/68）；正文 16/26。
- IBM Plex Mono 400/500 拉丁子集，用于行情、数字、标签与眉标题；版本在实施时固定，并按本规划提出的「发布至少两周」规则选择（见第 11 节依赖表下的说明；仓库现在没有这条规定）。
- 日语标题与正文用 IBM Plex Sans JP 构建时子集（第 12 节）。
- 去掉 Instrument Serif 与 Inter。衬线大标题是 midday 式「传统感」的标志，编辑衬线又正是 Hyperliquid 改版用的 Teodor；Instrument Serif 也没有日文字形。终端改版后的交易界面本来就用 Plex（`font-market-close`），官网与产品因此一致。
- 数字一律 `tabular-nums`，用 ch 预留宽度。

### 版式与图像

- 12 列网格，最大宽度 1280；页面表面 12px 圆角，内部卡片 8px。
- 图标在构建时从 `@phosphor-icons/core` 2.1.1（已是依赖）内联。
- 图像与视频只有三种：真实界面截图（AVIF/WebP）、真实终端录屏（H.264 MP4 与 AV1 WebM，海报是录屏首帧；第三轮修订，第 6 节）与生成的 Live market 海报；不用素材库 3D、AI 渲染、币标球。行情用 Plex Mono 文字显示，不外链 `app.hyperliquid.xyz` 的币标（CSP 的 `img-src` 因此只需 `'self' data:`）。
- 截图采集管线 `apps/website/scripts/capture-ui.mjs` 与录屏管线（第二轮修订；录屏是第三轮加入的，生产脚本名实施时定；来源待决定 D21）：
  - 推荐来源：在未登录状态下用 Playwright 实拍 app.sairn.ai 的现货市场（首屏是 HYPE/USDC：现货没有杠杆控件），裁切到账户表格之上；视口桌面 1440×900、1.5 倍像素，手机 390×844、2 倍像素（这是截图；桌面录屏是 1 倍像素，见下面的演示录屏一条），`locale` 为 en-US，时区 UTC。原型的对应脚本是 `designs/website-hero-prototype/tools/capture-terminal.cjs`；
  - DOM 守卫保留，只读裁切区内可见的内容（第三轮修订后按元素读，从 `<html>` 开始：每个可见元素自己的整段文字，杠杆写成 "40" 与 "x" 两个文本节点时合起来读；输入框的值、占位符与 `aria-valuetext`；同源 iframe 按偏移读入，跨源 iframe 记为未检查）：杠杆数字（数字后接 x 或 ×）、leverage / cross / isolated 整词、HIP-3 市场（`xyz:TSLA` 式前缀名、部署方简称徽章、去掉前缀后的 `TSLA-USDC` 式显示名）、钱包地址（含 `0x12…abcd` 缩写）、钱包品牌名、testnet、PnL / realized / unrealized、账户摘要标签（例如 portfolio value、margin ratio）、金额，任何一项就拒绝采集；裁切区里必须有可见的 Connect 控件与所采集现货市场的标题及其 Spot 徽章（首屏是 `HYPE/USDC`；第 02 区块若换市场，守卫要改为该现货市场），否则也拒绝。Connect 只是一致性检查，未登录的真正保证是每次采集都用没有任何存储的新浏览器上下文；canvas 上的文字（TradingView 价格轴与 K 线）、CSS 生成内容、shadow DOM 与跨源 iframe 读不到。原型的规则与测试在 `tools/guard.cjs`、`tools/guard.test.cjs`（规则）与 `tools/guard.dom.test.cjs`（读法）；
  - 未登录画面里没有钱包地址与真实余额（只有市场头部的代币合约缩写地址、'Available' 后的零值占位，以及桌面盘口悬停提示里公开的累计名义额 'Total (USDC)'）；需要账户状态的画面（持仓、余额、`/deposit/` 里的 Deposit 窗口）不实拍，只能用下面备选来源的夹具管线；
  - 清单记录采集 URL、UTC 时间、线上终端的构建标识（`build-meta.json`）与守卫检查过的文本数，每次官网发布重拍；录屏同样每次发布重录并记录构建标识（2026-10-25 的原型录制报告 `media/demo-capture.json` 没有记录它）；
  - 演示录屏（第三轮修订）：原型的 `designs/website-hero-prototype/tools/record-demo.cjs` 按 `demo-scenarios.cjs` 的步骤操作未登录终端，与截图共用 `tools/guard.cjs`，分两层检查：页面内每个 DOM 有变化、发生悬停 / 焦点 / 按压 / 滚动 / 过渡等事件或有动画在播放的动画帧都检查一次并带浏览器时间戳（没有任何事件就生效的样式变化要等下一次 Node 端检查），Node 端在每一步之后与每 400 ms 再检查一次；手机截图只保留前后两次检查都通过的帧；只编码最后一次通过的检查之前的帧；任何一层命中即停止、不写视频。只录现货市场，并且不打开市场选择器：永续页面显示杠杆倍数，选择器未筛选的现货列表按成交量排序，会出现代币化股票、隐私币与不雅代币名（2026-10-25 实测）。录屏里点击位置的小圆环是录制时叠加的演示指针，不是产品界面；桌面用 Chrome 屏幕广播（1 倍像素，视口 1440×900、录制区域 1440×732，比截图的 1.5 倍少；约 50 fps，重采样到 30 fps），手机用 2 倍像素的连续截图（不检查时约 24 fps，每张前后各检查一次后更低，2026-10-25 第三次录制约 24 fps；实际帧率以 `media/demo-capture.json` 为准），H.264 MP4 与 AV1 WebM 两种编码；
  - 守卫对余额与金额的规则（第三轮修订，原型 `tools/guard.cjs` 的实际行为）：手机现货页未登录时也显示 'Available 0.00 USDC'（数值与代币符号是两个元素）。'Available' 标签（单独一个元素，或带文字不带数字，如 'Available to Trade'）之后，同一元素里的数字算一项，与其后的元素合计最多三项（遇到输入框、滑块或下一个 'Available' 为止），其中每个带数字的词都只能是零（'0'、'0.00'、'0.00USDC'；代币符号、标签与 '-' 不限），所以 '0 1234'、'Max 12.30'、'$0.00' 都拒绝。裁切区其他位置的金额也拒绝：同一元素内的 `$` 加数字、数字加 USD 系代币符号、USD 系符号加数字（中间可有 `:` 或 `=`）、`≈` 或 `<` 加数字（百分比除外），以及拆在相邻两个元素里的金额（数字 + USD 系符号、USD 系符号 + 数字、`$` / `≈` / `<` + 数字；输入框的值不参与拼读，因为限价输入框的占位符 '0.00' 后面就是 'USDC' 单位）；以括号里的 USD 系单位结尾的标签（如 'Total (USDC)'）后接数字，同一元素或下一个元素，也算金额。例外只有四处公开行情，按终端标记绑定到元素而不按位置：`data-market-stat` 为 `volume24h` / `marketCap` 的市场头部统计里紧跟 '24h Volume' / 'Market Cap' 标签、整段只是一个数值（可带 `$`、K/M/B/T 与代币符号）的值；`data-market-stat="contract"` 里紧跟 'Contract' 标签的代币合约缩写地址；手机盘口 `data-slot="compact-orderbook-mid-price"` 里与标题旁市场价相差 1% 以内的 `$` 中间价；桌面盘口悬停提示（`data-slot="orderbook-cumulative-tooltip"`，`apps/terminal/src/components/trade/orderbook/orderbook-hover-tooltip.tsx`）里紧跟 'Total (USDC)' 标签的纯数值（报价代币取自市场标题，标签与数值是两个都带这个标记的元素）。副作用：以报价币显示的盘口或成交表头（'Total (USDC)' 后接第一行数值）会被拒绝；新会话默认按基础代币显示，录屏步骤也不切换。这把第一轮「拒绝含余额的画面」细化为「拒绝账户金额，只放行未登录的零值占位与上面四处公开行情」，需要运营方确认（D25）；
  - 说明文字写来源与日期，录屏与截图分开写（第 6 节）：
    - 录屏（首屏 Terminal 视图的默认画面）：可见的身份说明 'Screen recording of app.sairn.ai, signed out · <date> UTC'，录制日期写在这一行里；视频的 `aria-label` 写市场、未登录状态与录屏里发生的操作（第 14 节）。没有 JS 时显示的首帧海报（静态 `<picture>`）沿用这一行说明，`alt` 写市场与未登录状态；
    - 静态截图（不发布录屏时的回退与第 02 区块）：身份说明 'Screenshot of app.sairn.ai, signed out · <date> UTC'，市场与未登录写在 `alt` 里；
    - 日语为「※画面はイメージです」（第 6 节「`/ja/` 首屏」）；
  - 备选来源（第一轮 A7 的规则）：驱动终端的 Playwright 夹具，只用夹具数据，地址打码（如 `0x12…ab`）、不出现可用的存款地址，夹具服务器按 [runtime-guardrails](runtime-guardrails.md) §9 使用与应用开发服务器分开、互不嵌套的 Vite `cacheDir`，截图标注 'Sample data'；DOM 守卫同上（不要求 Connect 按钮；第三轮的规则会拒绝打码地址与夹具金额，走这条路线时要为它们另定放行规则）。

### 仿冒防护（Lookalike guard）

扩展 `brand-contract.test.mjs`：

1. 官网 CSS 与内联 SVG 不得定义 Hyperliquid 的 #97fce3、#03211c、#23524C、#f8f9f9、#04060c，不得加载 Teodor 或 Diatype。
2. 页面画布、标志图形与热度梯度里每个有色相的颜色（C*ab ≥8），与 #97fce3、#03211c、#23524C 的 ΔE76 都要 ≥15。测试同时扫描 CSS 与内联 SVG 的 `fill`、`stroke` 值（Fig. 1 只用 `glyphs/mono/`，第 5 节）。
3. 中性色（C*ab <8）豁免第 2 条。近黑与近白在 Lab 空间里天然彼此接近，例如 #edeef2 与 #f8f9f9 只有 4.3，一刀切的阈值无法满足，也没有意义。
4. 从终端复制的产品窗口令牌豁免第 2 条，但由跨应用测试钉住与终端相等。`brand.json` 的薄荷豁免，靠用量规则约束。

另外，每个改动首屏的 PR 都附一张与 hyperliquid.xyz 并排的截图，供人工审阅。

本节色差与对比度为 Agent 计算的参考值：

| 颜色 | 用途 | 对比 | 值 |
| --- | --- | --- | --- |
| #12131a | 页面画布（推荐） | C*ab / h | 5.0 / 285.6°（中性，豁免第 2 条） |
| #0F1A1F | 产品窗口、终端画布 | C*ab / h | 6.0 / 237.6°（中性，豁免第 2 条） |
| #212d33 | 终端浮层 | C*ab / h | 6.4 / 239.0°（中性，豁免第 2 条） |
| #03211c | Hyperliquid 深绿 | C*ab / h | 12.8 / 179.5°（有色相） |
| #04060c | Hyper Foundation 底色 | C*ab；与 #12131a、#0F1A1F 的 ΔE76 | 2.5；5.1、8.1（中性之间的 ΔE 没有意义，只为说明为什么不用它作理由） |
| #0A3038 | 品牌青（不作画布） | ΔE76 对 #03211c / #23524C | 12.0 / 17.6 |
| #2B5055 | 原稿梯度中段（已弃用） | ΔE76 对 #23524C | 8.3 |
| #263138 / #68747D / #AAB4BC | B 的灰阶热度（第二轮修订） | C*ab / h | 6.5 / 246.1°、6.9 / 249.3°、5.6 / 250.3°（都是中性，豁免第 2 条）；#AAB4BC 对 #0F1A1F 的对比度 8.39（最高不透明度 ≤0.65，实际合成后更暗） |
| #86e5d3 | 薄荷 signal | ΔE76 对 #97fce3 | 8.5 |
| #E6B766 | 琥珀 choice | ΔE76 对 #97fce3 | 63.7 |
| #edeef2 / #86e5d3 / #E6B766 | 文字与强调 | 对 #0F1A1F 的对比度 | 15.25 / 11.92 / 9.54 |
| #27d29f / #f08b9e | 终端订单簿买卖价格 | 对 #0F1A1F 的对比度 | 9.10 / 7.49 |

## 10 实时数据架构

### 接口（公开，无需钱包）

2026-10-24 实测 `api.hyperliquid.xyz/info` 对 Origin `https://sairn.ai` 返回 `access-control-allow-origin: *`，不需要后端。

### 数据路径（唯一来源，第二轮修订）

下表是官网实时数据路径的唯一来源。第一轮正文里「桌面订阅 `l2Book`、手机订阅 `bbo`」的分法、「盘口 5 s 过期」与第一轮原型的两条连接都由它取代（S4）。

决定：桌面与手机每页都只开一条 WebSocket `wss://api.hyperliquid.xyz/ws`，由 Worker 持有，通过 `postMessage` 供首屏与市场表使用。一条连接上只订阅一个 `l2Book`：帧里既不标明分组参数，也不标明是否 `fast`，同一连接上两个 `l2Book` 订阅的帧无法区分（本仓库 AGENTS.md 订单簿契约），第一轮原型正是为了 `fast: true` 才开了第二条连接；现在快速的最优价改由 `bbo` 提供，帧的来源因此不会有歧义。

| 来源 | 方式 | 用途 | 推送或请求周期 | 新鲜度与记账 |
| --- | --- | --- | --- | --- |
| `l2Book {coin, nSigFigs: 5}`（20 档） | WebSocket，所选市场 | 热度层的深档位；五档表（只显示一帧完整快照，见合并规则） | 2026-10-24 实测 BTC 约每 5.3 s 推送一次（p90 约 5.6 s） | Live 要求 12 s 内有一帧 |
| `bbo {coin}` | WebSocket，所选市场 | 最优买卖价、中间价、热度层的最优一档、窄窗口与手机的一行最优价 | 实测 BTC 约每 0.2 s（最长约 1.6 s） | 与 `l2Book` 合起来，Live 要求 6 s 内有一次顶档更新 |
| `trades {coin}` | WebSocket，所选市场 | 成交点、价格条的最新成交价（'Last trade'） | 实测约 1 s；订阅后的第一条消息是最近约 30 笔成交的快照，没有 `isSnapshot` 标记，按快照处理并按 `tid` 去重 | 最新成交价只在它的交易所时间与盘口的交易所时间相差 ≤60 s 时显示 |
| `activeAssetCtx {coin}` | WebSocket，所选市场与市场表白名单 | 市场表的标记价；价格条与市场表的 24h 涨跌（`markPx` 对 `prevDayPx`）。价格条的主数字是最新成交价，不是标记价 | 实测约 1 s | — |
| `l2Book` + `recentTrades` 种子 | REST，到达时与切换市场时 | 当前深度列与窗口内的成交点 | 防抖 300 ms；切换市场时中止上一次请求（`AbortController`） | 计入下文的 REST 权重滑动窗口 |
| `candleSnapshot`（1h × 24） | REST，每个市场一条 | 24h 迷你走势 | 缓存 10 分钟 | 同上 |
| `metaAndAssetCtxs`（权重 20） | REST | 网络统计行与 szDecimals | 区块可见时取一次，之后可见期间每 60 s | 同上 |
| `metaAndAssetCtxs`（回退） | REST，WebSocket 被拒时（例如公司代理） | 价格 | 每 60 s，每次访问最多 5 次，状态显示为带时间的快照 | 同上 |

- 最多 7 个订阅：`l2Book`、`bbo`、`trades` 各一个，`activeAssetCtx` 按所选市场与市场表白名单去重（首版 4 个）。不订阅 `allMids` 流：它推送整个主场所的数据，体积与需求不成比例。
- 合并规则（只用于热度层与中间价）：最优买卖价取 `bbo` 与 `l2Book` 中交易所时间较新的那一个；更深的档位只来自 `l2Book`；旧档位只保留在新最优价之外的一侧：卖侧保留价格高于新最优卖价的旧卖档，买侧保留价格低于新最优买价的旧买档；与新最优价同价的旧档由新顶档替代，其余（已被新最优价越过的）丢弃。例子：旧卖档 101、102、103，新最优卖价 100 时三档都保留；新最优卖价 102 时，101 丢弃、102 由新顶档替代、103 保留。买侧对称：旧买档 99、98、97，新最优买价 100 时三档都保留；新最优买价 98 时，99 丢弃、98 由新顶档替代、97 保留。被丢弃的价位不补画，留空（第二轮原型 `open-book.worker.js` 的 `mergedBook` 按此实现）。交易所时间只在两条交易所消息之间比较，绝不与用户的墙钟比较。
- 五档表不合并：只显示最近一帧完整的 `l2Book` 快照（五档同出一帧），caption 写这一帧的交易所时间，例如 'Top 5 · step 1 · 16:20:31 UTC'。窗口窄于 900px 时不显示五档表，只显示一行最新的最优买卖价（第 6 节）；两者不同时出现，表可见时最新顶档体现在中间价标签与热度层。原因：第二轮原型最初把 `bbo` 拼进五档表，价格下行时表里出现 79,819 之后直接是 79,811 的假缺口（2026-10-24 实测截图），因为 79,812–79,818 这几档在旧快照里不存在、新快照还没到。
- 新鲜度（接收时间用 `performance.now()`，见下文 Fail-closed 规则）：Live 要求 6 s 内有一次顶档更新（来自 `bbo` 或 `l2Book`）且 12 s 内有一帧 `l2Book`；连续 20 s 没有通过校验的 `l2Book` 或 `bbo` 帧时（按 `lastDataAt` 计，见 Fail-closed 规则），视图重置并重新播种，BTC 同时回到海报（第 7 节）。
- 表里的推送间隔来自第一轮原型的单次短时采样（下文「原型实测」小节），每种订阅当时单独一个连接。第二轮在一条连接上录了 135 s 的 BTC（2026-10-24 15:54–15:57 UTC，`tools/record-sample.mjs`）：`l2Book` 26 帧（约每 5.2 s）、`bbo` 1261 帧（约每 0.11 s）、`trades` 324 条消息、`activeAssetCtx` 132 帧（约每 1 s）。这只是一次采样，录制文件也去掉了未使用的字段，不能代表线上字节数；写成预算之前，阶段 1 与 V2（第 19 节）要按这一组订阅重测每分钟消息数与字节数。
- **初始负载**：方向稿估计约 125 权重（到达时一次：`metaAndAssetCtxs`、`l2Book` 种子、`recentTrades` 与各条 `candleSnapshot`），阶段 1 测量后确认。按 IP 的预算是每分钟 1200，而手机网络普遍走运营商级 NAT，同一出口 IP 后面还有其他访客与他们（包括同一访客点进之后）打开的终端，所以官网自己的稳态权重按下表设上限：

  | 路径 | 稳态 REST 请求 | 每分钟权重 | 上限 |
  | --- | --- | --- | --- |
  | 桌面与手机（WebSocket 正常） | `metaAndAssetCtxs` 每 60 s（20）；四条 `candleSnapshot` 每 10 分钟（约 8）；盘口、最优价、成交与市场表都走 WebSocket，手机也不再轮询 REST `l2Book` | 约 28 | ≤30 |
  | WebSocket 被拒的回退 | `metaAndAssetCtxs` 每 60 s，每次访问最多 5 次（20，之后为 0）；不轮询 `l2Book`；走势每 10 分钟（约 8） | ≤28 | ≤30 |

  - 权重按 Hyperliquid 文档写成常量（`l2Book` 2，多数 info 20，`recentTrades` 每 20 条加 1，`candleSnapshot` 每 60 条加 1）。调速器在运行时按 60 s 滑动窗口统计本页已发出的 REST 权重，超出所在路径的上限时依次降级：先停走势刷新，再停网络统计行刷新，最后只保留 WebSocket；初始负载单独记账，不触发降级。访客切换市场触发的种子请求计入滑动窗口，表里的稳态数字不含它；V2 测出切换频率后再定是否另设上限。单元测试覆盖两种路径的权重合计、上限与降级顺序。
  - 所有 REST 请求与 WebSocket 一样，只在 Web Lock 选主的标签页发出（下一小节）；其他标签页不发任何请求，Live market 视图停在 Recorded（BTC）或 Unavailable，网络统计与市场表的实时值按 fail-closed 规则移除。
- **不使用**：
  - 未见文档的 `globalStats` 与 explorer `blockList`；
  - `stats-data.hyperliquid.xyz`（响应最大 64 MB，排行榜与金库也是对日本刻意不写的内容）；
  - 终端在 app.sairn.ai 上的 `/api/*`（只供同源）；
  - 仓库自建的 `pac`、`sac`、增量 `l2` 频道；
  - 与其他交易所的资金费率比较；
  - 律师意见前的 HIP-3 `xyz:` 市场。

### 客户端与连接策略

- 手写客户端，约 2 KB：订阅、换订阅前先退订、静默 20 s 后发一次 `{method:'ping'}`（30 s 内仍没有任何消息才按下文重连）。不用打了补丁的 `@nktkas/hyperliquid`，也不用 hl-react：后者依赖 React、TanStack Query 与 wagmi，且官网 README 要求官网不依赖 workspace 包。
- 只在首屏或市场表至少 10% 可见、且文档可见时连接，与 Preview 窗口选中哪个视图无关（第 6 节）；页面隐藏 30 s、或离屏 30 s 后关闭（第一轮写的是隐藏 15 s）。
- 跨标签页只开一个连接：用 Web Lock `sairn-site-live`（内部标识按品牌契约用 `sairn` 字面量）在 sairn.ai 的可见标签页之间选出一个持有连接并发出全部 REST 请求，其他标签页保持海报、不发请求；隐藏的标签页会放锁，所以可见的那一页很快能拿到。终端的订单簿传输池自己就可能开到 4 个连接，两边是不同源，无法协调，官网只占 1 个。
- 连接预算不变：每页每 60 s 最多新建 3 个连接、每 300 s 最多 6 个；重连用全抖动退避（1、2、4、8、16、30 s），收到一帧有效数据后退避重置；30 s 没有收到任何消息时主动重连；被拒绝时 fail closed。重新订阅后的快照替换全部状态。
- 消息按动画帧合并，DOM 更新 ≤4 Hz。
- 数据调速器：Worker 统计每分钟收到的字节数。桌面超过 400 KB/min、手机超过 120 KB/min 时，首屏退订 `l2Book`、`bbo` 与 `trades`，Live market 视图进入 Unavailable（第 7 节状态表）；市场表的 `activeAssetCtx` 保留。第一轮「先把盘口从 `l2Book` 改为 `bbo`，再降到只订阅成交」的阶梯取消：`bbo` 已在订阅里，「只看成交」的窄条也已删除（第 7 节回退阶梯）。降级不改用 REST 轮询，REST 权重另由上表约束。阈值在阶段 1 与 V2 实测后固定。

### Fail-closed 规则

共享校验器放在 `src/lib/live/validate.ts`，有单元测试。

- **盘口帧**：
  - 频道匹配，`data.coin` 等于订阅的币种，其他币种的串扰直接丢弃；
  - 两侧都存在；每个 `px`、`sz` 符合 `/^\d+(\.\d+)?$/`；
  - 买盘严格递减、卖盘严格递增，最优买价 < 最优卖价，`sz > 0`，时间不倒退；
  - 只有一侧的 `bbo` 帧（盘口一侧暂时为空）跳过，不更新顶档，也不计为坏帧；
  - 坏帧按频道计数（`l2Book`、`bbo` 各一个计数器），一个频道的有效帧只清零它自己的计数。第二轮原型最初共用一个计数器，约每 0.1 s 一帧的 `bbo` 会不断清零深度的坏帧计数，「连续 3 帧」永远达不到（第二轮审查 S-N3）；
  - 同一频道连续 3 帧无效，就丢弃该频道已有的数据，LIVE 随之撤下（第二轮原型同时关闭连接并按退避重连，重连计入连接预算，持续坏帧会在几轮后 fail closed；生产是否这样做在阶段 1 决定，并写进第 7 节故障矩阵的预期）。
- **仅深度停更的恢复**：`bbo` 健康而最近一帧 `l2Book` 早于 20 s 时，在同一连接上先退订再订阅 `l2Book`，不新建连接，不占连接预算。这种情况下 `lastDataAt` 一直被 `bbo` 刷新，20 s 重置与 30 s 静默重连都不会触发，没有这一条市场会一直停在 Unavailable。
- **成交**：方向是 `B` 或 `A`，`px`、`sz` 是十进制字符串，按 `(time, coin, tid)` 去重（与终端最近成交契约一致）。校验器在解析时就丢弃 `users`（买卖双方地址）与 `hash`，只保留 `coin`、`side`、`px`、`sz`、`time`、`tid`；提示框与 Read snapshot 也不显示地址。价格条的最新成交价带可见的 'Last trade' 标签（不只放在 `title` 里：触屏看不到，读屏也不可靠），只在该成交的交易所时间与盘口的交易所时间相差 ≤60 s 时显示，否则是预留宽度的空白槽；两个都是交易所时间，不与墙钟比较。
- **新鲜度**：用 `performance.now()` 的接收时间，绝不拿用户的墙钟比较交易所时间戳（同 [ADR 0022](adr/0022-subscription-staleness-monotonic-clock.md) 的思路）。阈值以上面的数据路径表为准：6 s 内有顶档更新、12 s 内有 `l2Book`，20 s 没有通过校验的 `l2Book` 或 `bbo` 帧时重置并重新播种，30 s 静默重连。20 s 从 Worker 唯一的 `lastDataAt` 起算（只在接受这两种帧时更新，切换市场与恢复时重新起算；第 7 节状态表下的说明）。`silentMs` 以时长跨线程传递，绝不传时间戳：Worker 与页面的 `performance.timeOrigin` 不同，两边的时间戳不能直接比较。第一轮的「盘口 5 s 没有有效帧即为过期并冻结」作废：完整深度的 `l2Book` 本身约 5.3 s 一帧，用它会让 LIVE 反复闪断。
- **LIVE 标记**：只在 Live 状态显示（第 7 节状态表）：WebSocket 处于打开状态（`readyState === OPEN`；连接一关闭就撤下，不等新鲜度过期；海报管线的回放没有连接，豁免这一条）、币种匹配、满足上面的新鲜度条件，BTC 还要先连续有效 15 s。条件一旦不满足，LIVE 与 Live market 标签上的圆点立即消失，实时数字移除（圆点在录制阶段也按同样的数据条件亮，第 6 节）；何时回到海报见第 7 节状态表下的说明（fail closed 或 `silentMs ≥ 20 s`）。说明行只写 'Waiting for Hyperliquid public data.'、'Live data is unavailable right now.' 这类状态说明，不显示 'offline'、'stale' 或错误文字。
- **网络统计行**（第一轮的「证明卡」，第二轮降为市场区的一行，第 5 节）：
  - `universe.length` 等于 `assetCtxs.length`，排除已下架与 HIP-3；
  - 成交额 = Σ `Big(dayNtlVlm)`（美元名义值）；持仓量 = Σ `Big(openInterest).times(markPx)`：`openInterest` 是基础币单位，直接求和得到的是各币张数之和，量级可能正好落在下面的合理范围里，校验拦不住（终端同样先换算：`apps/terminal/src/domain/market/calculations.ts` 的 `getOiUsd`、`funding-comparison.ts` 第 240 行）；只对未下架项求和，任一项 `markPx` 缺失、为 0 或不是十进制字符串时，持仓量一项 fail closed；
  - 求和用 Big.js 7.0.1，显示时向下取整（主张绝不向上取整）；
  - 合理范围：永续数量 50–1000，24h 成交额与持仓量各 $1M–$1T；
  - 不通过的项从固定高度的行里移除，不留占位，也不编造；
  - `validate.ts` 的单测至少有两个持仓量用例：把基础单位直接求和的实现必须失败；按名义值求和的样本必须通过。
- **价格**：
  - 协议直接给出的值（`px`、`markPx`、盘口与成交价）原样显示协议字符串，只换分隔符（整数部分插入千分位），不重新取精度；
  - szDecimals 与 Hyperliquid 的 5 位有效数字规则（永续小数位 ≤ 6 − szDecimals，现货 ≤ 8 − szDecimals）只用于计算出的值：中间价、名义金额、涨跌幅与累计深度，在渲染器之外用 Big.js 计算并按该规则取精度；
  - 不从价格字符串的位数推精度，不用 `Number().toFixed`。
- **缺失值**：显示为预留宽度的空白槽，带 `aria-busy` 与仅读屏可见的说明；不显示 '—'、'...'、'0.00%'、'$0'、NaN 或未来时间。
- **归属**：每张实时卡写 'Source: Hyperliquid info API · updated hh:mm:ss UTC'（日语页为 JST），日期经 `Intl` 输出拉丁数字。网络数字一律标为 Hyperliquid 的数字，不当作 Sairn 的。

### 结构快照与主张检查

- 提交 `apps/website/src/data/market-structure.json`，只含结构信息：市场名、szDecimals、是否下架、主场所未下架永续数量、`fetchedAt`。有 schema 测试；CI 构建完全离线、可复现。
- 价格、成交额、持仓量等易变数值绝不写进 HTML。
- 发布手册增加一步：`pnpm --filter @sairn/website snapshot`（脚本在 `apps/website/scripts/`）刷新快照。主场所未下架永续少于 100 个，或 `/markets/` 白名单里有币种不存在或已下架时，命令失败、本次发布停止，静态的 '100+ perpetual markets' 与邮件的「100以上の無期限先物」因此每次发布都成立。
- 顺序固定为「刷新快照 → 提交（进 `dev` 的 PR 或发布提交）→ 从该提交构建」，发布产物因此对应一个提交；禁止从脏工作区构建发布产物，构建前 `git status --porcelain` 必须为空。

### 2026-10-24 原型实测（证据；结论已并入上面的数据路径表）

做首屏原型时直接测了公共 WebSocket 的推送节奏（本机 Node 订阅 BTC，30–120 s，每种订阅单独一个连接；不是长期统计）。下表保留为证据，设计以上面的数据路径表为准：

| 订阅 | 推送间隔中位数 | 档数 |
| --- | --- | --- |
| `l2Book`（不带参数，或 `nSigFigs` 4、5，或带 `mantissa`） | 约 5.3 s（p90 约 5.6 s） | 20 / 20 |
| `l2Book` 加 `fast: true`（含 `nSigFigs: 5`） | 约 0.53 s（最长约 1 s） | 5 / 5 |
| `bbo` | 约 0.2 s（最长约 1.6 s） | 最优一档 |
| `trades`、`activeAssetCtx` | 约 1 s | — |
| `l2`（增量流） | 公共接口拒绝订阅（`Error parsing JSON into valid websocket request`） | — |

另外，订阅 `trades` 之后的第一条消息是最近约 30 笔成交的快照（ETH 实测最早约 84 s 前），没有 `isSnapshot` 标记，要按快照处理并按 `tid` 去重。

第一轮据此写下的推论，以及第二轮的处理（已被数据路径表取代的部分照原样保留，便于追溯）：

- 「盘口 5 s 没有有效帧即为过期」不能用在完整深度的 `l2Book` 上，它本身就约 5.3 s 一帧，LIVE 会反复闪断。原型最初就是这样，改为用快速流判定后，四个场景约 60–94 s 的逐秒采样里中断 0 次。→ 第二轮改为 6 s 顶档、12 s `l2Book` 的阈值。第二轮原型在一条连接上做了短时逐秒采样（2026-10-24，无头 Chromium）：BTC 90 s、SOL 与 HYPE 各 45 s，LIVE 中断 0 次，每页 1 条 WebSocket；24 小时浸泡仍是 V2 的验收项。
- 「LIVE、五档表与中间价要来自快速流（`fast: true`）或 `bbo`；20 档深度只适合画热度层，并按快速流覆盖的规则合并。」→ 第二轮选 `bbo`，不再用 `fast: true`；合并规则见数据路径表。
- 「要么像原型那样开两条连接（快速流一条、深度流一条），要么一条连接只订阅一种 `l2Book`，配 `bbo` 判定新鲜度，由阶段 1 决定并记入 D8。」→ 第二轮选定后者：每页一条连接，D8 不再需要裁决这一项。五档表只显示一帧完整的 `l2Book` 快照并写明交易所时间（见合并规则），正常推送时最多旧一个推送间隔（约 5 s），Live 状态下不超过 12 s（数据路径表的新鲜度条件）。
- 原型的其余实现与限制见它的 README。

## 11 技术栈决定

### 保留 Astro 静态输出，不引入客户端 UI 框架

传统感来自内容、动效与视觉，不是框架：EverSwap 在 Astro 上跑获奖级 WebGL，Rainbow 用约 25 KB 原生 JS 做出顶级滚动编排（调研第 4 节）。Astro 也保住了仓库的所有契约：`brand.json` 经 `config/brand.ts`、法律页由 `legal/*.md` 渲染、文案与品牌契约测试、静态 S3/CloudFront 托管。

### 依赖

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| astro | 5.14.6 → 6.x（见下方「版本路径」） | 静态站 |
| tailwindcss / @tailwindcss/vite | 4.1.18 / 4.1.18 | 先把 `tailwindcss` 从 4.0.6 对齐 |
| @astrojs/sitemap | 3.7.2（i18n 选项） | hreflang |
| @fontsource-variable/ibm-plex-sans | 5.2.8（与终端同版本） | 正文与标题 |
| @fontsource/ibm-plex-mono | 实施时固定，按下方的两周规则选择 | 数字与标签 |
| IBM Plex Sans JP | 构建时子集；源文件用 Fontsource 或 Google Fonts 发布的版本，LICENSE 文本与哈希记在字体来源清单（同 `designs/og-cards` 对 Noto Sans SC 的做法），见第 12 节「OFL 核对」 | 日语 |
| big.js | 7.0.1（与终端同版本） | 求和与涨跌 |
| number-flow | 0.6.2（1.0 之前，旁边始终保留纯文本值） | 数字滚动 |
| qrcode | 1.5.3（与终端同版本），仅构建时 | 二维码 SVG |
| budoux | 0.9.3（0.10.0 于 2026-10-19 发布，按下方的两周规则太新），仅构建时 | 日语断句 |
| subset-font | 实施时固定，仅构建时 | 日语子集 |
| @playwright/test | 1.59.1（仓库版本） | 海报、截图、录屏（原型的录屏另用系统 ffmpeg 编码 H.264 与 AV1）、浏览器测试 |
| @axe-core/playwright | 实施时固定精确版本，仅开发依赖 | Playwright 套件里的 axe 检查（第 14 节） |

「发布至少两周」是本规划提出的新规则：AGENTS.md、agent.md、Agent 工作手册与 `pnpm-workspace.yaml` 里都没有这条规定。实施时把它写进官网 README 的依赖说明，只约束官网新增或升级的依赖；若要全仓执行，可改用 pnpm 的 `minimumReleaseAge` 设置（pnpm 10.16 起支持，属先验知识，实施时核实；它写在 `pnpm-workspace.yaml`，影响所有包，需要单独决定）。

原生优先（第二轮修订，S8；取代第一轮的「不使用」清单）：默认用 CSS、WAAPI、Canvas 2D 与手写客户端。一个库只有在同一交互的实测比较里胜过原生实现（压缩体积、实现复杂度、降级与减少动态行为、维护边界），并放得进第 13 节预算时才加入；比较结果写进引入它的 PR 与官网 README。例如要做的交互如果用 `motion/mini`（约 3.4 KB，调研的 brotli 实测）比手写 WAAPI 更简单可靠，就可以加。按调研体积与本规划现在的需求，下列目前不入选，这是取舍而不是禁令：React 岛（react-dom 59.5 KB）、three.js（110–177 KB）、OGL（11.1 KB，两个手写程序用不着）、GSAP（25.6–44.1 KB）、Motion 的完整原生 API（27.1 KB）、Rive（51 KB + 262 KB WASM）、dotLottie（12 KB + 388 KB WASM）、Spline（863 KB）。另有三项不是体积问题：Lenis（5 KB）做平滑滚动，属于第 8 节不做的滚动劫持；hls.js：第 2 节非目标不做营销视频，首屏的终端录屏是几百 KB 的静态文件，用原生 `<video>` 播放（第三轮修订，第 6 节），用不着流媒体库；Lightweight Charts（47.5 KB）的 NOTICE 要求的 TradingView 归属与日本的图表库商标规则冲突，[资金费率历史](market-funding-history.md)第 148 行也否决过为小图表引入图表库。体积均为调研的 brotli 实测。

### 代码布局

- `src/components/islands/OpenBook.astro`：`<sairn-open-book>` 自定义元素。
- `src/lib/live/`：`client`、`validate`、`format`、`governor`，纯 TS，不导入 workspace 包。
- `src/lib/live/open-book.worker.ts`：Canvas 2D 渲染器。
- `src/config/claims.ts`：主张登记表。
- `src/data/market-structure.json`：结构快照。
- `src/config/markets.ts`：首页市场表的四个币种（阶段 2）与 `/markets/` 的白名单（阶段 5）。
- `scripts/`（即 `apps/website/scripts/`，现在还不存在）：`record-market.mjs`、`snapshot-market.mjs`（`snapshot` 命令）、`subset-ja-fonts.mjs`、`capture-ui.mjs` 与海报渲染脚本。本文所有脚本路径都指这个目录。
- 注意：`copy-contract.test.mjs` 扫描 `src` 下所有文本文件（`.astro`、`.ts`、`.json`、`.css` 等），注释里也不能出现 'self-host' 等禁用词；禁用清单本身放在 `tests/`。因此会命中 CSS 与动效代码的模式（例如毫秒延迟数字，`global.css` 的减少动态规则就写着 `0.01ms`）不放进这个测试，改为扫描 `dist` 的可见文本（第 18 节）。

### 版本路径

1. 先单独一个 PR 把 `tailwindcss` 对齐到 4.1.18。
2. 在实时层之前，单独一个 PR 升到 Astro 6.x（npm engines 要求 Node ≥22.12，仓库写的是 ≥22.15.0，兼容）。这一步要做到：
   - 启用稳定的 Fonts API（生成回退度量，替代手调的回退字体）与 CSP API（给内联脚本和 JSON-LD 算哈希）；
   - 在 Zod 4 下核对 `content.config.ts`；
   - 确认 i18n `redirectToDefaultLocale` 的新默认值 false 正是需要的；
   - 仓库没有用 `<ViewTransitions />`，不受其移除影响；
   - 对比升级前后的构建产物；
   - `@tailwindcss/vite` 4.1.18 的 peer 包含 `^7`（已核对安装包的 `peerDependencies`：`vite` `^5.2.0 || ^6 || ^7`），可以随 Astro 6 的 Vite 7 保留；要求 Vite `^8` 的是 4.3.3，所以升 Astro 7 时再升到 4.3.x。
   - 具体 6.x 版本实施时固定：方向稿引用 6.4.8，本次未复核。
3. Astro 7.4（Vite 8、Rolldown；npm engines 要求 Node ≥22.23.4）推迟，直到全仓决定把 Node 提到 22.23.4 以上，并重新测量终端的包体基线。只在官网的 CI 任务里换 Node 隔离不了：网站工作流要跑 `pnpm test:brand`（其中有终端的 vitest），`scripts/ci-workflows.test.mjs` 钉住了工作流结构，本地开发也共用一个 Node 与一份锁文件。

### 备选

| 备选 | 结论 |
| --- | --- |
| Next.js 16.4（App Router，静态导出） | 不采用。每页要付 React 运行时，现在接近零 JS；Cache Components 将在 Next 17 成为默认，模型在变；静态导出丢掉服务端特性，i18n 要自建；要重写 13 个组件、布局、法律页、博客集合与测试；最佳体验绑定 Vercel。好处（React 生态、可复用 `@sairn/ui` 与 hl-react）在本规划里用不上：官网不依赖 workspace 包，实时组件用原生 TS 就够 |
| Framer 或 Webflow | 不采用。打破 `brand.json` 单一来源、`pnpm brand:check` 与法律文本对齐，没有 PR 审查与 CI；供应商锁定与月费（Framer Pro $30/月，本地化每种语言 $20/月）；实时 WebSocket 只能靠代码组件；CSP 与响应头控制有限；Hyperliquid 自己就用 Framer，同框架还会加重相似感 |
| SvelteKit 3 | 不采用。3.0 于 2026-10-01 才发布，破坏性改动多；不能与 React 终端共享代码；i18n 要第三方库；相对 Astro 收益小。若以后需要有状态的交互组件，可在 Astro 里用 Svelte 岛 |

## 12 多语言与日语排版

### 路由与开关

- Astro i18n：`locales: ['en','ja']`、`defaultLocale: 'en'`、`routing: { prefixDefaultLocale: false }`。
- 构建开关 `SAIRN_SITE_LOCALES`，默认 `en`。值为 `en` 时，不生成 `/ja` 路由、不输出 ja 的 hreflang、站点地图里也没有 ja 条目；日语内容可以在仓库里写好、测好。
- 值包含 `ja` 时，还必须设置环境变量 `SAIRN_JA_GATE_RECORD=<闸门记录路径>`（同终端 `--allow-mainnet-card-funding` 的思路；`astro build` 没有自定义参数的入口，官网也没有构建或发布脚本，所以用环境变量）。`astro.config.mjs` 在配置加载时校验：`SAIRN_SITE_LOCALES` 含 `ja` 而记录缺失或格式不对，构建直接失败。
- 记录是一份机器可读的 JSON（例如 `docs/marketing/jp-launch-email/ja-site-gate.json`，由运营方在取得意见后填写；意见书本身不进仓库），固定字段：`gate1Date`、`gate1Conclusion`（只接受 `approved`）、`gate1Scope`（必须逐一列出要构建的每个 `/ja` 路径）、`gate2Date`、`gate2Commit`（含删除 `JP` 的已发布提交）。任务记录引用这份文件；校验函数有单测（缺字段、日期格式错、结论不是 `approved`、范围漏掉某个将要生成的 `/ja` 路径都必须失败）。发布手册另加一步人工核对。
- 不按语言或 IP 自动跳转：OKX 的强制跳转把全球页藏起来了，地理定向还会加重「以日本居民为对象」的认定。只有页头的显式链接与 hreflang（en、ja、x-default）。英文页上的「日本語」链接加 `lang="ja"`（WCAG 3.1.2）。
- `/ja/` 页面：`<html lang="ja">`、`og:locale` ja_JP；ja 分享卡由 `pnpm og:generate` 生成，需要在 `designs/og-cards/fonts` 加日文子集并记录哈希。

### 内容

- 日语内容是独立的内容集合，原生撰写，不是英文的镜像，也不机翻。每句都取自邮件 README §5 证据表里已核对的主张，用律师批准的措辞。
- 第一版只上 `/ja/` 与 `/ja/deposit/`。实时数据只有 BTC、ETH 的美元价格（24h 涨跌要律师同意）；「100以上の無期限先物」是由结构快照检查保证的静态主张，不是实时数字（与 A5 同一口径）；没有盘口、持仓量、成交额、资金费率、`/ja/markets/`，也不换算日元（没有汇率来源，还可能被读成日元入金）。时间显示 `hh:mm:ss JST`（明确 `Asia/Tokyo`），拉丁数字。
- 日语页的搜索定向（Search Console 提交、外链）等律师意见。
- 每个 CTA 旁都有「ご利用前にご確認ください」或首屏的两句 ※；终端没有日语界面，每个 CTA 都带「※取引画面は英語表示です。」。
- ja 的风险、免责与未登记声明放在一个文件里（例如 `docs/marketing/jp-launch-email/disclosures.ja.json`），同时供邮件生成脚本与 `/ja/` 使用；做不到共用时，加一个同步测试逐字比对两边，避免官网与邮件漂移。
- 结构化数据：`/ja` 只输出 Organization 与 WebSite，加一个只含登记表里 `approved` 且允许 ja 的条目的 FAQPage；不输出 SoftwareApplication：`src/lib/seo.ts` 第 110 行的 `offers` 带 `price: "0"`，在日语语境下读作「無料」，正是禁用词。

### 排版

- 字体栈：
  - `'IBM Plex Sans Variable'` 放在最前，拉丁文字与数字与英文页一致；
  - 其后是日文子集，内部族名不含 'Plex'，例如 `'Sairn JP Text'` 与 `'Sairn JP Heading'`（见下面的 OFL 核对）；
  - 再后是 `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'BIZ UDPGothic', 'Yu Gothic', YuGothic, Meiryo, 'Noto Sans JP', sans-serif`；Yu Gothic 用 500 字重，避免 Windows 上过细。
- 子集：
  - `apps/website/scripts/subset-ja-fonts.mjs` 从构建后的 `dist/ja/**/*.html` 收集实际用到的字符，生成 Plex Sans JP 400 与 600 的 woff2。CSS 在这之前已经构建，所以二选一并在实施时固定：两阶段构建（build → 收集字符 → 子集 → 再 build，第二次构建读取生成的字体），或在构建后的后处理里写入带内容哈希的 `_astro/` 文件名并改写 CSS 里的引用。两种做法的产物都在 `_astro/` 下，属于发布手册的 immutable 缓存组；
  - 方向稿的实测：邮件第 4 版的 470 个不同字符，子集后每个字重 47–50 KB，而 Fontsource 的 unicode-range 方式要拉 38 个切片、每个字重约 340 KB；
  - 目标每个字重 ≤60 KB，硬上限 120 KB；只在 ja 页预加载 600；
  - 覆盖测试：`dist/ja` 里任何 CJK 字符不在子集中，测试就失败；运行时缺字由系统字体兜底。
- OFL 核对：结论取决于子集的源文件出自哪里。仓库里 `@fontsource-variable/ibm-plex-sans` 5.2.8 的 LICENSE 是 OFL 1.1，版权行没有 Reserved Font Name（2026-10-24 已核对安装包）；上游 IBM/plex 仓库的许可可能声明保留名「Plex」（先验知识，未核实）。所以日文子集的源文件用 Fontsource 或 Google Fonts 发布的 IBM Plex Sans JP，把它的 LICENSE 文本与哈希记入字体来源清单；若改用上游 IBM/plex 的文件，先核对保留名，有保留名就必须改内部族名（上面的 `'Sairn JP Text'` 等族名在两种情况下都可用）。
- 正文 16px、行高 1.8、`line-break: strict`、`max-inline-size: 38ic`。标题行高 1.4，只在标题上用 `font-feature-settings: 'palt'` 与 0.02em 字距，`text-wrap: balance`；段落 `text-wrap: pretty`。
- 断句：BudouX 在构建时把标题切成短语，输出 `<wbr>` 与 `keep-all` 片段；320px 下给 `keep-all` 标题加 `overflow-wrap` 回退。`word-break: auto-phrase`（只有 Chrome）与 `text-autospace` 作渐进增强。
- 不用斜体、全大写或加字距的等宽标签；全角「」、。配半角数字与拉丁字母；日期写作 2026年10月24日。
- ※ 注释紧跟在主张下方，用正文颜色与悬挂缩进，不放到远处的边栏（景表法打消し表示要求贴近）。

### 测试与审阅

- `tests/ja-copy-contract.test.mjs` 检查构建后 `dist/ja/**` 的可见文本（HTML 文本节点、`alt`、`title`、`aria-label`）与 JSON-LD，不扫描源码与 CSS。日文词按可见文本匹配，拉丁词带词界（例如 `/\bEarn\b/`，区分大小写，不会命中 Learn 或 `/learn/`）。另维护一份带理由与数量的例外清单，只收律师批准的风险与免责文字里的合法用法（例如「必ずしも」「株式会社」「限定されません」）；清单里的条目不再出现时测试也失败。禁用清单覆盖邮件 README §5 的全部条目，含全角写法：
  - 注册门槛与 KYC：No KYC、KYC不要、本人確認不要；
  - 杠杆：`\d+倍`、`\d+x`；
  - 品类：日経、JP225、`xyz:`、株、指数；
  - 入金：カード入金、日本円、自動入金、自動で入金、ガス代無料、画面を開いたまま；以及同一句里把免 gas 与入金连在一起的写法 `/ガス代(は)?(不要|無料|かかりません)[^。]*入金|入金[^。]*ガス代(は)?(不要|無料|かかりません)/`（限定在一句之内：手续费一节的「注文ごとのガス代はかかりません。」后面紧跟着讲入金手续费的句子，跨句匹配会误报）；
  - 夸大用语：No.1、最安、無料、業界初、必ず、絶対；
  - 规避与语言支持：VPN、プロキシ、日本語対応、日本語サポート；
  - 赠品与收益：ボーナス、キャッシュバック、エアドロップ、ポイント、今だけ、限定、利回り、Earn、Vault；
  - 其他：12ms、交易所名称；
  - 登记类主张：登録済、登録業者、金融庁に登録、認可を受け、国内基準。只禁这些主张，不禁「登録」这个词，因为「メールアドレスで登録できます」、3 步里的「登録」与未登记声明「登録を受けておらず」都必须出现。
- 风险相邻测试：日语页上每个指向 app.sairn.ai 的链接，都在 `[data-cta-group]` 里，且同组有逐字一致的风险句（`[data-risk-note]`）；每个 ja 页都有未登记声明、「Hyperliquidが運営または推奨するものではありません」与 `brand.json` 的法律实体；`lang="ja"` 正确；ja 未构建时不存在指向 ja 的 hreflang；`/ja/deposit/` 不点名国内交易所。
- 母语审阅者与律师的签字（日期、范围）记入任务记录后才能上线。律师审阅构建好的预览：以文件与截图交付，不放公开 URL。

## 13 性能预算与 Core Web Vitals

新增 `apps/website/tests/budget.test.mjs`，用 Node 自带的 zlib brotli 统计 `dist` 体积，回归即失败，与终端钉住包体预算的方式相同。基线（2026-10-24 线上实测）：HTML 13.8 KB、CSS 7.2 KB、字体约 70 KB、截图 190 KB 与 111 KB、无外部 JS。

| 项目（传输、压缩后） | 手机首屏预算 |
| --- | --- |
| HTML | ≤25 KB |
| CSS | ≤14 KB |
| 内联启动 JS（动效偏好、暂停状态、特性检测、延迟启动观察器、UTM 透传） | ≤2 KB |
| Terminal 录屏播放脚本（按断点换源、可见性与页面级暂停、减少动态与 Save-Data、Pause / Play 按钮；第三轮修订，延迟加载，计入下面的全部 JS） | ≤2 KB |
| 岛的主线程部分（自定义元素、DOM 片段、客户端胶水） | ≤8 KB，另加 NumberFlow 4.9 KB |
| Worker（Canvas 2D 渲染器、WebSocket 客户端、校验器、调速器） | ≤12 KB |
| 全部 JS（除启动脚本外都延迟加载） | ≤30 KB |
| 字体（拉丁页；Plex Sans 拉丁预加载，Plex Mono 不预加载） | ≤75 KB |
| 首屏图像 AVIF（默认 Terminal 视图的海报，即录屏首帧；第二轮这里是 Terminal 截图。Live market 的海报同样适用，但在首次可能打开该视图前才预取，不计入下一行） | 手机 ≤45 KB，桌面 ≤80 KB（目标，实测后固定）。原型的海报是首帧 JPEG（2026-10-25：桌面约 146 KB、手机约 75 KB），两端都超出；生产版改为 AVIF/WebP 海报后重新测量 |
| 交互前总量（不含实时数据流） | 手机 ≤250 KB，桌面 ≤350 KB |
| `/ja/` 首屏（加 400 与 600 两个子集，没有画布与海报） | ≤280 KB |

- **首屏以下**（`content-visibility: auto` 配 `contain-intrinsic-size`）：第 02 区块最多 4 张 AVIF（一张大截图与至多三张卡片裁切），每张 ≤60 KB；走势线是内联 SVG；第三轮修订：首屏 Terminal 视图的录屏在页面加载后、视图可见时才加载（`preload="none"`），不计入首屏交互前预算，但计入页面总量；它的海报（首帧）是上表的首屏图像，计入交互前总量；原型实测（2026-10-25 第三次录制）桌面 MP4 约 0.76 MB、AV1 WebM 约 0.55 MB，手机 MP4 约 0.23 MB、AV1 WebM 约 0.18 MB；Save-Data 时不加载。
- **实时数据**：前 10 s ≤60 KB；稳态桌面 ≤400 KB/min、手机 ≤120 KB/min，REST 权重桌面与手机都 ≤30/min（第 10 节的表；第一轮手机是 ≤35/min，因为要轮询 REST `l2Book`），都由调速器在运行时执行，阈值以阶段 1 与 V2 实测为准。
- **运行时**：渲染不在主线程；加载后没有超过 50 ms 的长任务。
- **Core Web Vitals**：
  - 实验室（Lighthouse 移动限速配置）：LCP ≤1.8 s、TBT ≤50 ms、CLS ≤0.02；
  - 现场（有足够流量后看 CrUX 的 p75）：必须满足 LCP ≤2.5 s、INP ≤200 ms、CLS ≤0.1，目标是 LCP ≤1.8 s、INP ≤100 ms；
  - LCP 元素永远是 H1 文字或默认 Terminal 视图的海报（录屏首帧），不是画布或视频。
- **执行**：
  - 体积测试进 `node --test`，很便宜；
  - 官网的 Playwright 套件只对 `astro build` 产出的 `dist` 用静态服务器跑，不跑 `astro dev`，因此不碰任何 Vite 依赖缓存；`capture-ui.mjs` 驱动终端夹具时，按 [runtime-guardrails](runtime-guardrails.md) §9 使用独立的 Vite `cacheDir`，与终端开发服务器的缓存互不嵌套；
  - Playwright 的 WebSocket 故障套件放在网站工作流的路径过滤之内；
  - Lighthouse 每次发布前在本地跑一次并把结果记入任务记录，不加到 GitHub Actions：私有仓库每月 3,000 分钟；
  - 改工作流时同步 `scripts/ci-workflows.test.mjs`；
  - 中端 Android 与低电量模式 iPhone 的实测由人完成，与单元测试分开记录。

## 14 无障碍

目标是 WCAG 2.2 AA，可行处满足 2.3.3。

- **静态优先**：所有主张、数字标签与 CTA 都是真实 HTML 文本。画布 `aria-hidden`，含义放在说明、DOM 盘口表与 'Read snapshot' 按钮里。按下这个按钮，一个礼貌的 live region 读出一段摘要，例如 'BTC: best bid 67,012, best ask 67,013, last trade buy 0.015 BTC at 21:03:11 UTC'；Recorded 与 Still 状态下读的是海报元数据，开头先读 'Recorded <date> HH:MM–HH:MM UTC'。Terminal 视图的录屏有 `aria-label`，写市场、未登录状态与录屏里发生的操作；录屏只有画面、没有声音，这段文字就是它的文字替代，是否满足 WCAG 1.2.1（仅视频的预录内容）在阶段 2 的无障碍检查里确认。录制日期写在可见的身份说明里（原型的 `aria-label` 不含日期）。没有 JS 时的首帧海报 `<picture>` 与静态截图回退（第 02 区块同）用描述画面的 `alt`（市场、未登录），日期同样在说明行（第 6、9 节）。快速跳动的数字不进 `aria-live`；NumberFlow 本身 `aria-hidden`，旁边有同频更新的读屏文本。
- **会动和自动更新的内容**（WCAG 2.2.2 的例子就是股票行情条）：首屏与页脚的 Pause（`aria-pressed`）停下画布、数字滚动与所有实时数字。Terminal 视图的录屏有自己的 Pause / Play 按钮（只换文字，不用 `aria-pressed`，第 6 节）。
- **减少动态**：见第 8 节；Live market 视图停在 Still 状态（第 7 节），并提供 'Show live view' 让访客自行开启。
- 没有滚动劫持、随滚动的相机或视差；滚动驱动效果只有 `no-preference` 下的 opacity 与 transform 显现；文字背后没有全宽动效。
- **颜色**：方向由形状（实心与空心）、盘口中的位置以及符号和 ▲▼ 表达，不只靠颜色；第 9 节的对比度满足 4.5:1；现有 `--text-faint` ≥4.5:1 的检查扩展到新表面（#0F1A1F、#212d33）；焦点环 `var(--signal)` 永不移除。
- **输入**：Preview 视图与市场标签是两个各有可访问名称（'Preview'、'Market'）、键盘可用的 tablist（方向键）；Pause 与 Read snapshot 是真正的按钮；悬停十字线与提示框只是增强，信息不只靠悬停获得；目标尺寸 ≥24×24（2.5.8），触控 ≥44px 并有按下反馈；吸顶页头不遮挡获得焦点的元素（2.4.11，用 `scroll-padding-top`）；二维码弹层可用键盘打开，Esc 关闭。
- **结构**：HTML 里只有一个 H1，就是看得见的首屏句子；每页 `lang` 正确；有跳转链接与地标区域；FAQ 用原生 `<details>`；文字放大到 200%、宽 320px 时重排且没有横向滚动。※ 注释的标记是带可访问名称的链接（「注3: 根拠」），并有返回链接。
- **验证**：Playwright 套件里用 `@axe-core/playwright` 跑 axe；英文与日语各做一次 VoiceOver 与 NVDA 手动检查；纯键盘走查；减少动态模拟下统计 rAF 帧数，断言 Worker 除 Still 状态的那一帧静止画面外不再渲染（第 7 节「测试」）。

## 15 SEO 与增长

- **可爬取的基础**：全部文案是静态 HTML，H1 在标记里；不重蹈 Insilico、Axiom、Rabby 的客户端文案与空 H1。
- **结构化数据**：保留 `seo.ts`（Organization、WebSite、SoftwareApplication、FAQPage，FAQPage 里去掉 No KYC 与股票、杠杆问答）；`/ja` 只输出 Organization、WebSite 与只含 `approved` 条目的 FAQPage，不输出带 `price: "0"` 的 SoftwareApplication（第 12 节）；`/markets/` 与 `/learn/` 加 BreadcrumbList；canonical 保留结尾斜杠；robots 指向 `sitemap-index.xml`（`brand:check` 校验）。
- **多语言**：日语上线后，Astro i18n 与站点地图的 i18n 选项输出 en、ja、x-default 的 hreflang；每种语言一张分享卡。调研里 Liquid（10 种语言）、Based（en、zh-CN、x-default）、Binance（约 100 个）、OKX（约 60 个）、Coincheck（ja、en）、Drift（en、ko、zh）与 Stripe（89 个，含 ja-JP 与 en-JP）都有 hreflang；Hyperliquid 前端里只有 Liquid 有完整的日语 hreflang。（调研动效一节「24 个站只有 Drift 暴露 hreflang」只来自对 24 个首页的动效检查，不能当全体结论。）
- **程序化市场页**（英文，阶段 5）：见第 5 节；带真实结构数据与实时岛，低成交的长尾不生成或 noindex，不做 OKX 页脚那种链接农场。
- **指南与新鲜度**：`/learn/`、`/deposit/`、获批后的 `/ja/deposit/`；`/changelog/` 显示交付速度；`/llms.txt` 与以后的 `/llms-full.txt`（Linear、Vercel、Stripe、Resend 都发布了）。
- **Search Console 与 Bing Webmaster**：用 DNS TXT 记录验证，页面上不加标签；这是 Cloudflare DNS 的改动，由运营方操作。日语页的提交等律师意见。
- **站外分发**：由运营方申请 Hyperliquid `/apps` 目录收录（'Exchanges'、'Mobile apps' 类别，标准未核实），与开发并行。调研认为它比任何视觉改动的杠杆都大。日语获批后，营销邮件的「ウェブサイト」链接才能改指 `/ja/`（同样要律师同意）。
- **不做**：机器人挑战、抓取拼凑的薄页面、付费投放像素。

## 16 衡量（在现行隐私政策下）

隐私政策 §4 与 Cookie 政策 §3 写明不集成产品分析 SDK、不用广告 Cookie，但两处说的都是 the Interface（app.sairn.ai）；隐私政策开头的 Services 另含「related Sairn websites」。隐私政策 §3 列出的用途里有「了解聚合的服务可靠性与性能」，没有营销分析。

第二轮修订（S7）把衡量分成上线前与上线后两类，并分别写明能证明什么、不能证明什么。

### 上线前：首屏理解测试（V1）

- 方法：5 秒测试（看首屏 5 秒后回答问题）与首次点击测试（给一个任务，记录第一次点在哪里）。每个变体至少 10 位目标用户：用过或考虑过 Hyperliquid 的交易者，或持有加密资产但没有自托管钱包的人（第 3 节受众 1、2），此前不熟悉 Sairn。变体指要比较的首屏稿，例如 Terminal 默认与 Live market 默认（D20），需要时再加 A/B 两种构图。测试用本地原型或不公开的预览，不放公开 URL；招募方式与测试工具由运营方选择。
- 5 秒测试的三个问题：Sairn 是什么？资金由谁持有？怎样登录？（第一轮的「开始需要什么」拆成「怎样登录」与「存款要准备什么」两问，第二轮审查 L-N4：原来只答出 USDC 或只答出登录方式之一就能通过。）「存款要准备什么」在 5 秒时只记录，判分见下面的通过标准。
- 检查误解的问题：
  - 行情画面是不是终端里的功能？Live market 默认稿在 5 秒后直接问；Terminal 默认稿在下面的自由浏览结束后，由主持人切到 Live market 再问。这是有提示的曝光，测的是看到后会不会误认，不是自然发现；
  - 看到 Terminal 录屏时问「你能直接在这个窗口里下单吗？」（它是录屏，答案是不能；L-N1。第二轮这里问的是截图）；
  - 录屏的误解题（第三轮修订新增，在 5 秒题之后问；演示指针见第 6 节）：「窗口里的价格和盘口是现在的实时行情吗？」（不是，是录制日期的画面）；「这是谁的账户？」（不是任何人的账户，是未登录的终端）；「画面里移动、点击的小圆环是什么？」（录制时叠加的演示指针，不是真实用户在操作）。三题分别编码，答成实时行情、别人的账户或真人操作都记为误解。
- 首次点击的任务（草稿）：「你想开始交易」「你没有钱包，想知道能不能用」「你想知道存款需要准备什么」。主按钮 'Trade <coin>' 与页头 'Open terminal' 都算对，分别记录槽位；点到录屏里的控件（'Connect'、'Buy' 等）单列为「点录屏」，计为未命中（第二轮写作「点截图」）。
- 只记录、不设门槛的度量（第二轮审查 S-N1、L-N4，新增项都不是 go / no-go 条件）：
  - 第二视图发现率：Terminal 默认稿在 5 秒题与点击任务之后给 30 s 自由浏览，记录是否、何时主动打开 Live market；
  - 现代感成对比较：每位参与者最后与基线做一次组内比较，基线是阶段 0 修正后的现站首屏，阶段 0 尚未上线时用当前现站；两稿各看 5 s，顺序平衡，问「哪个更现代、更不像传统网站，为什么」。不另加组，每个变体仍是 10 人（两个变体时共 20 人，每多一个变体多 10 人）。参与者此前已看过新稿，熟悉度会偏向新稿，结果只是方向性证据；
  - 「怎样登录」的回答是否提到邮箱，单独编码（差异点，第 3 节受众 2）；
  - 「点录屏」的次数、「能否直接下单」的回答，以及三道录屏误解题的回答。
- 通过标准（拟议，运营方确认后使用）：
  - 至少 8/10 说出它是交易 Hyperliquid 永续与现货的网页终端（答成 Hyperliquid 本身或交易所算错）；
  - 至少 8/10 说出资金留在自己的 Hyperliquid 地址、Sairn 不持有；
  - 至少 7/10 说出可以用邮箱或自己的钱包登录（5 秒时判分）；
  - 存款要准备什么：由任务 3 的首次点击（下一条）与一道不限时的追问判分，追问至少 7/10 答出 Arbitrum 上的 USDC；
  - 至多 1/10 认为 Live market 画面是终端功能（S1）；Terminal 默认稿只在全部参与者都由主持人切到 Live market 看过之后才计算；
  - 三个点击任务各有至少 7/10 的第一次点击落在对应目标上（任务 1 为 'Trade <coin>' 或页头 'Open terminal'，任务 2 为 'How email sign-in works'，任务 3 为 'Deposit guide'）。
- 点击任务只测入口能否被发现，不测 `#start` 等落点的内容：三步说明与存款指南的内容在阶段 2 用整页稿另测（第 19 节）。
- 能证明：在小样本下，首屏文案与默认视图是否把这几件事讲清楚，以及变体之间的方向性差别；发现率与现代感比较只给 D20、D2 提供方向。不能证明：转化率、存款或留存；5 秒后的回答是即时理解，不是记忆；每组 10 人也不足以区分很接近的两个变体；维护成本用户测试测不到。

### 上线后：趋势

- 指标：带官网 CTA 槽位的应用文档请求数（日志代理指标，不是点击数、会话数或用户数），按 `utm_content` 分槽统计，再按 `utm_source`、`utm_campaign` 分成直接到访与邮件透传两类（透传后 `utm_source` 是 `email`，只按 `utm_source=website` 筛会漏掉它们，官网来源靠 `utm_content` 槽位识别）；改版上线前后各四周对比，用官网分发同期的页面文档请求数归一化。计数口径：
  - 数据源：终端分发的 CloudFront 标准日志；
  - 计入：`cs-method` 为 GET；`sc-status` 为 200 或 304；`cs-uri-stem` 属于 CTA 生成器（由 `APP_URL` 构造）产出的路径集合，`/tradeHistory/<address>` 这类带地址的路径因此不在内；`cs-uri-query` 里的 `utm_content` 在下面统一命名表的槽位内；
  - 排除：HEAD 请求，以及已知爬虫与链接预览的 User-Agent（名单随统计脚本做版本管理；app.sairn.ai 的 `robots.txt` 允许全部抓取，爬虫沿官网 CTA 抓取会产生同样带 UTM 的请求），报告同时给出被过滤掉的量；
  - 不去重：重复点击、多开标签与刷新各计一次，报告写明；
  - 开启日志选字段时，必须保留 `cs-uri-query`、`cs-user-agent`、`sc-status` 与 `cs-method`（`c-ip` 仍去掉，D10）。
- 会话数：现行政策下无法定义（没有 Cookie、浏览器存储与 `c-ip`，也没有会话化规则），不报告。第一轮列的「来自官网的应用会话数」删除；若运营方坚持要会话指标，属于 D10 的范围扩展，先改隐私政策并经法律审阅，不能用指纹或 IP 哈希凑出会话。
- 不做 A/B 分流：现在的流量分成两组后每组样本太少，稳定分组还需要 Cookie 或浏览器存储（A10）。
- 服务器日志从阶段 1 开始（第一轮放在阶段 5），在现行隐私政策下运行：去掉 `c-ip`、短期保存、只做聚合（D10）。用于营销衡量之前仍需律师确认（第 18 节）：确认前不出到达与转化报告，确认后用已积累的数据作基线；没有日志就明确不评估 CTA 文档请求的变化。
- 能证明：改版前后到达与 CTA 文档请求的相关变化。不能证明因果：同期的行情、日本邮件等推广与季节都会影响，也不能把变化归因到画布或某一句文案。首次存款与首笔交易仍未测（要产品侧事件）；builder 聚合收入分不出新访客与已有用户，不用它替代转化。每个观察期只改一个主要因素，并记录同期的市场与推广变化。

### 手段与前提

| 手段 | 现在能否用 | 前提 |
| --- | --- | --- |
| 每个指向 app.sairn.ai 的链接按下面的统一命名表带 `utm_*`，不用 `?ref=` | 能 | 无。参数不含任何标识；终端的 `validateSearch` 首次导航后会丢掉它们，但首个文档请求已经带上 |
| ESP 的邮件点击统计 | 能 | 按邮件 README 闸门 6 的决定 |
| Lighthouse 实验室数据、CrUX 现场数据（公开、聚合，站上不加代码） | 能 | CrUX 需要足够流量 |
| Hyperliquid 公开的 builder 聚合数据。优先用 `referral` 返回的 builder 收入等聚合字段（字段使用前要实测），它不含逐地址数据。方向稿引用的每日 builder 成交文件 `stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4`（本次未复核）是 Sairn 自己用户的逐地址成交，即使只统计每日笔数、名义金额与费用，也是在为营销目的处理逐地址数据，而隐私政策 §3 的用途里没有营销分析；律师确认前不用 | `referral` 聚合：能；`builder_fills`：等律师（第 18 节） | 不保存任何地址；`builder_fills` 只在律师确认后离线处理、只留聚合结果 |
| CloudFront 标准访问日志（官网与终端两个分发），按路径、语言与 `utm_content` 统计到达；短期保存（例如 30 天） | 需要运营方在 AWS 开启；第二轮修订提前到阶段 1 | 律师确认隐私政策覆盖用于营销分析的服务器日志。终端分发的日志会记下 `/tradeHistory/<address>` 这类路径（`apps/terminal/src/routes/tradeHistory.$address.tsx`，另有 `fundingHistory`、`historicalOrders`）与 `c-ip`，把地址和 IP 关联在一起：开启时去掉 `c-ip` 字段（CloudFront 标准日志 v2 可以选字段，属先验知识，运营方实施时核实），或对这些带地址的路径不记录；字段选择、保存期限与处理方式写进 D10 的批准事项 |
| 任何地址级指标（每日唯一地址、首次出现的地址） | 不能 | 先改隐私政策并经法律审阅 |
| 站上的第一方事件请求（例如 `/e/<event>`）、Cookie 或 localStorage、分析 SDK、A/B 工具、热图 | 不能 | 先改政策与 Cookie 政策（目前只覆盖 app.sairn.ai）并经法律审阅 |

统一 UTM 命名表（与[邮件 README](marketing/jp-launch-email/README.md) 对齐：全部小写，词之间用下划线，不用连字符；不含任何标识）：

| 来源 | `utm_source` | `utm_medium` | `utm_campaign` | `utm_content` |
| --- | --- | --- | --- | --- |
| 日本邮件（现行，邮件 README 闸门 6） | `email` | `email` | `jp_2026_trust` | 无（以后若按按钮加槽位，要同步修改邮件 README 与三份邮件文件） |
| 官网 | `website`（固定的非域名标记，不写 `sairn.ai`：品牌契约要求域名只从 `brand.json` 读取） | `site` | `<locale>_<page>`，例如 `en_home`、`en_deposit`、`ja_home` | 槽位，例如 `header`、`hero_cta_btc`、`start_cta`、`markets_btc`、`final_cta`（第一轮的 `hero_email`、`entry_email`、`entry_wallet` 随同链接换 UTM 的入口一起删除，L9、S6） |

- CTA 链接由 `config/brand.ts` 的 `APP_URL` 加路径构造，不写域名字面量。
- 透传：进入页面的地址同时带合法的 `utm_source`、`utm_medium`、`utm_campaign`（各自匹配 `/^[a-z0-9_]{1,40}$/`）时，CTA 保留这三个值，只把 `utm_content` 换成本页槽位；否则用上表的官网默认值。这样邮件以后改指 `/ja/` 时，点进终端的请求仍带 `utm_campaign=jp_2026_trust`，不会被官网的 `ja_home` 覆盖。实现是内联启动脚本只读一次 `location.search` 并改写链接的 `href`，不写任何存储（A10）；没有 JS 时链接保持官网默认值。

- **基线**：改版上线前，至少取四周的 `referral` 聚合数据，以及阶段 1 开启日志后积累的到达数据（律师确认后才出报告），记入任务记录。
- **比较**：不做 A/B；上线前后各四周对比（上文「上线后：趋势」），用日志里的页面浏览数归一化，发布日期记入任务记录；主张登记表让每次文案变化可审计。第一轮的「两周时间窗」改为四周。
- **已知盲点**：终端的 Service Worker 对同源导航用 stale-while-revalidate，每次仍发出网络请求（`apps/terminal/public/sw.js`），HTML 又是 `max-age=0`（`deploy/cloudfront/deploy.mjs`），按此推断导航请求仍会到达 CloudFront（可能记为 304），离线时不计；第一轮写的「Service Worker 会少算回访」没有证据支持，阶段 1 开启日志后用一次自测点击核对。官网不对 app.sairn.ai 的链接做预取或 speculation rules。归因止于进入应用的第一个请求；注册、首次存款与首笔交易要在产品侧另做事件（邮件 README §6 第 7 条）。

## 17 安全响应头与 CSP

- **现状**：2026-10-24 `curl -sI https://sairn.ai/` 没有 Content-Security-Policy、Strict-Transport-Security、X-Frame-Options、X-Content-Type-Options 与 Referrer-Policy。发布身份 `gatu-edge` 不能创建或挂载响应头策略，也读不到、改不了 viewer-request 函数 `gatu-rewrite-index`。
- **第一步（代码内，随 Astro 6）**：用 Astro CSP API 输出 meta CSP，并给内联启动脚本与 JSON-LD 算哈希。
  - `default-src 'self'`
  - `script-src 'self'` 加哈希
  - `worker-src 'self'`
  - `connect-src 'self' https://api.hyperliquid.xyz wss://api.hyperliquid.xyz`
  - `img-src 'self' data:`
  - `font-src 'self'`
  - `style-src`：不含 `'unsafe-inline'`；NumberFlow 能否在它下面正常渲染列为阶段 3 的验收项（第 19 节），做不到就回退为纯文本数字。
  - 若 D19 决定在 sairn.ai 上放表单，再加 `form-action`，只允许那个子路径。
- **meta CSP 只覆盖文档，管不到专用 Worker**：Worker 的策略取自它自己脚本的响应头，而 S3 不发 CSP 头，所以握有 WebSocket 的 `open-book.worker` 的 `connect-src` 在阶段 5 的 CloudFront 响应头策略生效之前不受浏览器限制，只靠主机白名单测试约束：该测试同时扫描 `dist/_astro/` 下的 Worker 包，只允许 `https://api.hyperliquid.xyz` 与 `wss://api.hyperliquid.xyz` 两个外部地址。
- **第二步（运营方在 AWS 操作，需逐项批准）**：
  - 给 sairn.ai 分发挂一个 CloudFront Response Headers Policy，设置 HSTS、`frame-ancestors 'none'`（meta CSP 不支持它）、`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin` 与 Permissions-Policy，并让 CSP 头也覆盖 Worker 脚本的响应；完整 CSP 若超过响应头策略的 1,783 字符上限，改用 viewer-response 函数，参照终端的 `render-functions.mjs`；
  - 把 `gatu-rewrite-index` 的源码导出并收进仓库；
  - D19 若需要 sairn.ai 下的退订或同意路径，在同一分发上新建指向 ESP 源站的缓存行为（第 18 节）。

## 18 合规闸门

### 英文站

- 阶段 0 删除闸门 1 列出的矛盾内容。删除不需要等律师；把改动对照交给律师，英文站最终还要改到什么程度由律师决定。
- 主张登记表、copy-contract 的扩展与风险相邻测试，一起保证不会退回去：
  - copy-contract（扫描 `src`）新增禁止：No KYC、'12ms'、杠杆数字、`xyz:`、Nikkei、JP225、'full leverage'、"each market's maximum"、'max leverage'、`fundingComparison`、'New markets appear automatically'、股票与 HIP-3 品类（`/stocks?|equit(y|ies)|indices|metal perps|TSLA|NVDA|AAPL/i`）、交易所品牌钱包名，以及不分登录方式的签名说法 `/signed with your keys|signed by your (own )?wallet|signed locally|from your own wallet|your keys sign/i`（不禁 'your own wallet' 本身：第二轮首屏副标题草稿 'Sign in with email or your own wallet.' 要用，它说的是登录方式，不是签名，也不命中上面的模式）和 `/gas-sponsored/i`；现有费用断言保留；
  - 「任何毫秒延迟数字」不放进扫描 `src` 的测试（会命中 `global.css` 的 `0.01ms` 与动效时长代码），改为扫描 `dist` HTML 的可见文本节点：`/\b\d+\s?ms\b/`；
  - 每条新模式都做变异检查（把文字加回去，测试必须失败），结果记入任务记录。
- CTA 的定义：凡指向 app.sairn.ai 的链接都是 CTA。英文页上，首屏（01）、三步开始（03）、市场表（04）与结尾（07）都要在同一 `[data-cta-group]` 里带 `[data-risk-note]`，风险句用正文颜色、≥14px；只有页头与页脚导航里的链接列入测试的豁免清单，带数量。
- 法律页继续由 `legal/*.md` 渲染；任何改动要律师对当时版本的书面确认。

### 日语

- 面向日本的任何内容，都要在律师就闸门 1、2 出具书面批准之后才上线（[邮件 README](marketing/jp-launch-email/README.md) §1；[ADR 0042](adr/0042-japan-allowed-trading-region.md) 自己也建议在取得意见之前不发布）。
- 书面意见必须明确覆盖：
  - 每一个 `/ja` 页面；
  - 日语页上的实时价格、手续费及任何盘口；
  - `/ja` 的 hreflang、站点地图、索引与 Search Console；
  - 存款指南及其国内交易所一句；
  - 官网是否需要「特定商取引法に基づく表記」；
  - 浏览器直连 `api.hyperliquid.xyz` 是否适用電気通信事業法的外部送信規律（来自 Agent 的先验知识，未核实）；
  - 隐私政策是否覆盖用 CloudFront 日志做的转化衡量；
  - 为营销衡量处理 `builder_fills` 的聚合数据：源文件是 Sairn 用户的逐地址成交（第 16 节）；
  - 终端分发日志里地址与 IP 的关联（`/tradeHistory/<address>` 等路径加 `c-ip`），以及去掉 `c-ip` 或不记录这些路径是否足够；
  - 首屏 H1 与眉标题里「Hyperliquid」一词的使用；
  - 「Hyperliquidが運営または推奨するものではありません」里「推奨」一半的依据（条款 §1.1 只写独立、不是 Hyperliquid Corp. 与 Hyper Foundation）。
- **律师不同意时**：
  - 不建日语链接与 ja hreflang；
  - `JP` 保持受限（ADR 0042 不发布）；
  - 英文页脚加律师措辞的担保文言（说明本站不以日本居民为对象）；
  - 只做英文仍是一个完整的结果。

### 品牌

品牌值只经 `config/brand.ts` 与 `astro.config.mjs` 从 `brand/brand.json` 读取，产品名用 `BRAND_NAME`，不写域名或邮箱字面量。生成文件归生成器所有：海报来自 `poster:render`，分享卡来自 `og:generate`，动效令牌只读。改动 `brand/`、`legal/` 或品牌读取方之后，`pnpm brand:check` 与 `pnpm test:brand` 必须通过。Logo 至少 24px、留 25% 安全空间，不变形，不被数据驱动做动画（`brand/LOGO-KIT.md`）。

- 现有测试不拦截官网里的品牌名与域名字面量，而 ja 内容集合里会大量出现产品名。新增官网测试：
  - `src` 的文案（`.astro` 文本、内容集合、`config/` 里的文案）不得出现 `/\b(sairn|gatu)\b/i` 与 `domains.primary` 各值的字面量，产品名经 `BRAND_NAME` 插值，ja 内容同样；
  - 内部标识按品牌契约保留 `sairn` 字面量（Web Lock `sairn-site-live`、`<sairn-open-book>`、`SAIRN_SITE_LOCALES`、`SAIRN_JA_GATE_RECORD`、`@sairn/website`、内部字体族名、`brand/` 下的文件名），列入带理由与数量的例外清单；
  - `dist` 里品牌名与域名必然出现（来自插值），所以 `dist` 只断言没有 `gatu`，并由主机白名单测试校验每个外部地址都来自 `brand.json` 或 `api.hyperliquid.xyz`。
- 法律文本同步：`sairn.ai/privacy/` 等四页是同一份 `legal/*.md` 的另一份静态构建。邮件闸门 3 会改隐私政策；发布手册加一步：`legal/*.md` 有改动时，当天重建并发布官网，核对 `sairn.ai/privacy/` 的 Last Updated 与 `app.sairn.ai/privacy` 一致。

### 日本邮件依赖的 sairn.ai 能力

[邮件 README](marketing/jp-launch-email/README.md) 有几处依赖 sairn.ai，而第 2 节把表单列为非目标、只写静态托管，等于默认了一个与邮件闸门冲突的前提。逐项列出，由决定 D19 定：

| 邮件依赖 | 出处 | 对官网的要求 |
| --- | --- | --- |
| 人群 (b)：「在官网或应用内主动订阅的人」 | 邮件 README §6 第 2 条 | 官网上要有订阅同意入口，或只在应用内收集 |
| 事先 opt-in 同意及其记录（时间、方式、文案版本、IP 国家、双重确认 token） | 闸门 4 | 同意入口若在官网，记录由 ESP 保存，官网不存任何数据 |
| `{{unsubscribe_url}}` 与 `List-Unsubscribe` 的 HTTPS 地址必须以 `https://sairn.ai/` 或 `https://app.sairn.ai/` 开头（例如由 sairn.ai 反向代理到 ESP） | 闸门 6、7 | sairn.ai 要托管退订路径，或改由 app.sairn.ai 托管 |
| 可选的 sairn.ai 之下的自有追踪子域 | 闸门 6 | 子域是 DNS 与 ESP 的配置，不在官网构建里；若采用，要写进三份邮件的「正規のURL」 |

- **同意入口**：只在应用内（不改官网），或 ESP 托管页挂在 sairn.ai 的一个子路径下（官网只放一个指向它的链接）。
- **退订路径**：例如 `/u/*`，由运营方在分发 `EP2DIBP3T7M3G` 上新建指向 ESP 源站的缓存行为（并入 D10，逐项批准）。它必须排除在 `gatu-rewrite-index`（给目录路径补 `index.html`）与 403、404 → `/404.html` 的错误映射之外，否则退订请求会被改写或变成 404；退订页不缓存。官网构建与 `dist` 里不出现这个路径的任何文件。
- **若官网出现表单**：CSP 加 `form-action`，只允许那个子路径（第 17 节）；隐私政策要覆盖它（邮件闸门 3），Cookie 政策目前只覆盖 app.sairn.ai，ESP 页若写 Cookie 也要覆盖。
- **若决定官网不做订阅**：同步修改邮件 README §6 第 2 条 (b) 的「在官网或应用内主动订阅的人」，避免两份文档矛盾；退订路径仍可放在 app.sairn.ai 下，那属于终端分发的改动，同样由运营方批准。

## 19 分阶段路线图

### 阶段 0：英文站主张修正（数天；待运营方决定 D1）

- **交付**（一个小 PR 进 `dev`，只删不加新主张；补的风险句是披露，不是主张）。逐项清单如下，行号是 2026-10-24 的 `apps/website/src`（与线上一致），实施时按当时源码复核；改写后的英文是草稿，由运营方确认：

  | 文件:行 | 现在的内容 | 删除或改写后的文字 |
  | --- | --- | --- |
  | `components/Hero.astro:12-24` | 带 `animate-ping` 状态点的 'Live on mainnet' 徽标链接 | 整个删除 |
  | `components/Hero.astro:32` | 'Crypto, stocks, and indices — perps and spot in one workspace, with pro charts, every order type, and each market's full leverage, streamed live from Hyperliquid's WebSocket.' | 'Perps and spot on Hyperliquid in one workspace, with pro charts and every order type, streamed live from Hyperliquid's WebSocket.' |
  | `components/Hero.astro:35-51` | CTA 组没有风险句 | 在 'Open the terminal' 所在的 `data-cta-group` 里加 `data-risk-note` 风险句（14px、正文色，不用淡色）：'Perpetual futures use leverage. You can lose all of your margin. Risk disclosure →'，链到 `/risk/` |
  | `components/Hero.astro:54` | 'Non-custodial · Wallet or email · No KYC' | 'Non-custodial · Wallet or email' |
  | `components/Hero.astro:76-93` | 两张截图，画面里有 40x、10x | 用终端 Playwright 设施与夹具数据重拍，画面不含杠杆倍数；暂时做不到时，先换成不含杠杆区域的裁切 |
  | `components/Hero.astro:95-103` | 带 `animate-ping` 的 'Connected · 12ms' 状态条 | 整个删除 |
  | `components/Ticker.astro:7-11` | TSLA、NVDA、AAPL、SILVER、JP225（`xyz:`） | 删除 |
  | `components/Ticker.astro:16-29` | 悬停才暂停的 `.marquee` 跑马灯 | 改为不滚动的静态一行 |
  | `components/Ticker.astro:33-75` | 一次性 `allMids`（含 `dex: "xyz"`）、`Number()` 加 `toLocaleString`/`toFixed`、失败保持「—」 | 一次 `metaAndAssetCtxs` 同时取价格与 szDecimals，按第 10 节规则从协议字符串格式化；失败时是预留宽度的空白槽 |
  | `components/Markets.astro:3-7` | 五个 `xyz:` 市场 | 删除；卡片留 BTC、ETH、HYPE，加 SOL |
  | `components/Markets.astro:13-26` | 'Around the clock'（equity and index perps）、'Your wallet is the account'、'Perps, not securities' 三点 | 整个删除（三点都在讲股票永续） |
  | `components/Markets.astro:34` | 'Stocks, indices, metals, crypto — one venue.' | 'Hyperliquid perps and spot — one venue.' |
  | `components/Markets.astro:37-38` | 'Trade TSLA, NVDA, and AAPL perps next to BTC and HYPE — live prices below are streamed straight from Hyperliquid, the same source the terminal uses.' | 'Trade BTC, ETH, SOL, and HYPE perps. Prices below are read from Hyperliquid's public API when the page loads, the same source the terminal uses.'（阶段 0 是一次性快照，不写 live） |
  | `components/FeatureSpeed.astro:21` | 'Orders are signed with your keys and sent from your browser straight to Hyperliquid — no relayer in between.' | 'Orders are sent from your browser straight to Hyperliquid — no relayer in between.'（签名方只在信任清单与 `/how-it-works/` 按登录方式分别写） |
  | `components/Features.astro:19-20` | 'Per-market leverage' / "Up to each market's maximum, cross or isolated, with live margin checks" | 'Margin modes' / 'Cross or isolated margin where the market allows it, with live margin checks' |
  | `components/Features.astro:35` | 'MetaMask, Coinbase, OKX, Binance, WalletConnect and more — or sign in with email' | 'Connect an Ethereum wallet, or sign in with email' |
  | `components/Fees.astro:33-39` | 外链 `app.hyperliquid.xyz/fundingComparison`（跨交易所资金费率比较） | 删除链接与该句 |
  | `components/Trust.astro:5` | 'Your wallet is your account. Funds never pass through us — orders are signed locally and settle on Hyperliquid.' | 'Funds never pass through us. Orders settle on Hyperliquid, signed by the wallet Privy creates for your email account, or by the trading key you approve for your own wallet.'（第 3 节登记的签名主张） |
  | `components/Manifesto.astro`（`pages/index.astro` 引用） | 'No KYC. No custody. No middlemen.' 逐词出现，以及第 30 行 'Your keys sign…' | 整节从 `index.astro` 移除 |
  | `config/faq.ts:15-16` | 'Do I need to sign up or KYC?' / "There's no KYC. Connect an Ethereum wallet — MetaMask, Coinbase, OKX, Binance, WalletConnect…" | 'Who can use {BRAND_NAME}?' / 按条款 §2 的资格说明（法定成年、不是受限人员、不得用 VPN 或代理规避限制，详见 Terms），连接方式写 'Connect an Ethereum wallet, or sign in with email to get an embedded wallet.' |
  | `config/faq.ts:19-20` | 'Can I really trade stocks here?' 整条（经 `faqSchema` 写进 JSON-LD） | 删除 |
  | `config/faq.ts:27-28` | "What's the max leverage?" | 'How do margin and leverage work?' / 'Perpetual futures use leverage, so a small price move can cause a large loss, and a position can be liquidated, losing all of the margin behind it. Margin is cross or isolated where the market allows both. Read the Risk Disclosure before you trade.' |
  | `config/faq.ts:31-32` | 'All Hyperliquid perp markets, the spot order book, and builder-deployed DEXs — including equity, index, and metal perps. New markets appear automatically as they launch.' | "Hyperliquid's perpetual markets and its spot order book." |
  | `config/faq.ts:36` | 'Orders are signed with your keys…' 与 'gas-sponsored deposits' | 'Orders are sent from your browser straight to Hyperliquid…'；'gas-sponsored deposits' 改为 'deposit transactions'；列进交给律师的改动对照 |
  | `config/seo.ts:10` | 'Perpetual and spot trading on Hyperliquid—direct on-chain access from your own wallet.' | 'Perpetual and spot trading on Hyperliquid from an independent web terminal.' |
  | `config/seo.ts:12` | themeColor 字面量 `#0a0a0a` | 读 `brand.json` 的 `pwa.themeColor` |
  | `config/seo.ts:28`、`:40` | 关键词 'hip-3'、'leverage' | 删除 |
  | `components/Footer.astro:42-48` | 结尾 'Open terminal' CTA 没有风险句 | 同 Hero 加 `data-cta-group` 与 `data-risk-note` 风险句 |
  | `components/Footer.astro:119-125` | 带 `animate-ping` 的 'Live on mainnet' | 删除 |
  | `pages/404.astro:16-21` | 'Open the terminal' 没有风险句 | 同 Hero 加风险句 |
  | `components/Nav.astro:19-27`、`components/Footer.astro:8` | 页头与页脚导航的 'Open terminal' | 不改，列入风险相邻测试的豁免清单（带数量） |
  | `components/Footer.astro:10`、站点地图、`pages/blog/` | 页脚的 Blog 链接，空博客显示「No posts yet」 | 移出页脚导航与站点地图，`/blog/` 设 noindex |
  | `CHANGELOG.md` | — | `Unreleased` 下加一条用户可见条目（官网删去哪些说法、加了风险句） |

  - copy-contract 增加第 18 节「英文站」列出的禁用模式；最小版的风险相邻测试（每个指向 app.sairn.ai 的 `<a>` 都在带逐字一致 `[data-risk-note]` 的 `[data-cta-group]` 里，豁免清单只有页头与页脚导航）随阶段 0 进入。
- **验收**：
  - 对除四个法律页以外的 `dist` HTML 与 JSON-LD 运行 `grep -Ei "stocks?|equit(y|ies)|indices|metal perps|Nikkei|JP225|xyz:|TSLA|NVDA|AAPL|full leverage|each market's maximum|max leverage|fundingComparison|New markets appear automatically|no kyc|12 ?ms|signed with your keys|signed locally|gas-sponsored|MetaMask|Coinbase|OKX|Binance|WalletConnect|animate-ping"`，结果为空（法律页由律师确认，不在本清单里改；2026-10-24 它们也不命中这些模式）；
  - 把任意一条加回去，copy-contract 失败（变异检查，并记录）；
  - 最小版风险相邻测试通过；
  - `pnpm --filter @sairn/website test`、`pnpm test:brand` 与官网构建通过，`grep gatu` 为空；
  - 运营方批准后按发布手册上线，用 curl 核对线上 HTML；
  - 律师收到改动对照，记入任务记录；
  - 日本营销邮件在此之前不发送。

### 阶段 1：决定与去风险（约 1 周，另加下面 V1–V3 的限时验证）

- **交付**：
  - 运营方对第 21 节各项作出决定，并记录（V1–V3 开始前需要的决定见第 21 节开头）；
  - 把第 18 节的问题清单交给律师；
  - 新 ADR「官网静态架构与实时行情画布」（编号取当时的下一个），记录方向、颜色与字体、数据规则与衡量的取舍，含第 4 节的加权重评与第 10 节的单连接数据路径；
  - 新 Reference `docs/website-live-data.md`：数据路径表、fail-closed 规则、状态表、限额、回退；
  - 测量实验：
    - 在 BTC、ETH、SOL、HYPE 上，按第 10 节数据路径表的订阅组合（一条连接上的 `l2Book` `nSigFigs: 5`、`bbo`、`trades`、`activeAssetCtx`）测每分钟消息数与字节数，桌面与手机分开；
    - 核实 `metaAndAssetCtxs`、`recentTrades`、`candleSnapshot` 与 `referral` 的返回形状；
    - 在 Safari 18 与 26、低电量模式的 iPhone 与中端 Android 上测 Worker 里 Canvas 2D 的帧时间；
    - 录第一份海报数据（V3）；
  - 首屏原型按第二轮修订更新（Terminal 与 Live market 两个视图、录制海报冷启动、压缩后的手机首屏），桌面与手机各一版，供运营方评审与 V1 使用；
  - `tailwindcss` 对齐 4.1.18 的 PR；
  - CloudFront 标准日志在两个分发上开启（D10，运营方操作，去掉 `c-ip`），衡量基线开始积累（第 16 节）；
  - 任务记录在每个阶段的检查点追加，阶段 1 结束时写明各决定、测量结果与 V1–V3 的结论。
- **验收**：
  - 预算有实测依据，或者按证据降级（按下文「验证结果与首版产物」表）；REST 权重表（第 10 节）的两种路径按实测重算并固定；
  - 每条设备结论写明输入路径与设备；
  - V1–V3 各有 go / no-go 结论，记入任务记录；
  - 原型经运营方确认；
  - ADR 与 Reference 进入审阅。

### 验证包 V1–V3（阶段 1 内，全面实施之前）

第二轮修订（S9）：在承诺阶段 2 与阶段 3 的完整建设之前，先用三个限时的验证包检验最贵、最不确定的三件事；V3 分成 V3a（海报冷启动）与 V3b（录制到实时的交接）两项判定（第二轮审查 S-N6），以便决定下文的首版产物。通过标准是拟议值，运营方确认后使用；结果按实际版本与范围记入任务记录，没有做的检查写明未做。

| 包 | 时限 | 内容 | 通过（go） | 不通过（no-go）时 |
| --- | --- | --- | --- | --- |
| V1 首屏理解测试 | 约 1 周 | 第 16 节「上线前」的 5 秒测试与首次点击测试，每个变体至少 10 位目标用户；变体至少包括 Terminal 默认与 Live market 默认（D20）；另记录第二视图发现率与对基线的现代感成对比较（只报告，不设门槛） | 第 16 节的通过标准全部满足；按结果确认 D20 与 D7 | 改文案或默认视图后重测一次；仍不通过就停在阶段 0 的修正版官网，重新评审方向，不进入阶段 2 |
| V2 数据路径浸泡测试 | 24 h 运行，加准备与分析，上限 3–5 个工作日 | 一条连接、第 10 节数据路径表的订阅组合，连续 24 h，桌面与手机各一次；记录 LIVE 中断（离开 Live 状态）次数与时长、重连次数与原因、每分钟字节数、REST 权重、Worker 与页面的内存 | 拟议：网络正常时 LIVE 中断平均每小时不超过 1 次、单次不超过 30 s；重连全部在连接预算内（每 60 s ≤3、每 300 s ≤6）；字节数与 REST 权重在第 13 节预算内；运行 1 h 后内存不再持续增长 | 按下表产物 B 发布（V3a 也不通过时为产物 C），Terminal 视图与静态站照常；按数据调整阈值后可重测 |
| V3a 海报冷启动 | 与 V3b 合计上限 3–5 个工作日 | 录制（约 135 s）→ 回放生成海报与元数据快照 → 页面里显示；减少动态与无 JS 各一次 | 0 s 就有海报、'RECORDED' 标记与录制时间说明；海报期间显示的每个数字等于元数据快照；减少动态时停在海报；无 JS 时只有 Terminal 录屏的首帧海报与说明（第 7 节回退阶梯第 3 条） | 按下表产物 C 发布 |
| V3b 录制到实时的交接 | 同上 | 页面里从海报以场景替换切到实时，再从实时回到海报；在 0、1、2、5、15 s 截图检查，加第 7 节「测试」的逐帧采样，断网一次 | 15 s 连续有效数据之前只显示录制值，之后场景替换完成、标记换成 LIVE；正反两个方向的每一帧都只有一种来源；状态切换前后窗口尺寸不变；断网时回到海报并写明实时数据不可用 | 修好后重测；在此之前按下表产物 B 发布 |

验证包只验证方向与关键风险，不是发布：它们的结果不能当作阶段 2、3 的验收，也不能当作真机验收（第 7 节「测试」最后一条）。

### 验证结果与首版产物

V2、V3a、V3b 的结论决定首版发哪一种首屏。第 4 节的止损说法、阶段 2 的海报交付与阶段 3 的开关关闭形态都以本表为准（第二轮审查 S-N6）。文案是 D7 草稿。

| 产物 | 条件 | Preview 窗口 | 说明 |
| --- | --- | --- | --- |
| A：Terminal + Live market | V2、V3a、V3b 都通过 | Terminal（默认，D20）加 'Live market'。BTC 用录制海报冷启动，连续 15 s 有效后以场景替换切到实时；第 7 节状态表全部适用 | 阶段 2 发布时 `PUBLIC_LIVE_CANVAS` 关闭，第二视图先按产物 B 上线；阶段 3 验收通过后打开开关，成为产物 A |
| B：Terminal + Recorded market | V2 不通过而 V3a 通过（V3b 未通过、V3a 通过时同样按 B，直到 V3b 修好重测） | Terminal 固定为默认，D20 不再保留 Live market 默认的备选。第二个标签改名为 'Recorded market'，只有 BTC 海报；不显示市场标签、Pause、标签圆点与 LIVE。状态行只写 'Recorded <date> HH:MM–HH:MM UTC'，没有「切到实时」的承诺；第二行 'BTC-USD perpetual. A recorded website view of public market data, not a terminal feature. Not advice.'；上方身份说明随 D7 相应改写 | 主按钮固定为 'Trade BTC'；'Read snapshot' 读海报元数据；不打包 WebSocket 客户端 |
| C：只有 Terminal | V3a 不通过 | 只有 Terminal 视图（录屏与说明；没有 JS 时是首帧海报，与第 7 节回退阶梯第 3 条相同），不渲染视图切换的 tablist（第二轮这里是 Terminal 截图） | 阶段 2 不做海报管线。第一轮的冷启动不作为自动备选：若要在 V2 通过的前提下保留实时视图，作为阶段 3 的单独变更，先过 0、1、2、5、15 s 截图检查与 V1 式的 5 秒测试。首屏只剩终端录屏，没有实时市场视图（第二轮写作「只剩截图」），第 20 节「仍被认为传统」的风险更突出 |

任何产物只要默认视图、标签或可见文案与 V1 测过的稿子不同，就按阶段 2 的验收重测，不沿用另一种产物的 V1 结果；产物 A 在阶段 2 先以产物 B 的形态上线时同样适用。可以在 V1 里把产物 B 的首屏列为第三个变体，省一轮重测，代价是多招一组参与者。

### 阶段 2：基础与静态信息架构（英文，约 2 周）

- **交付**：
  - Astro 6 的独立 PR（若 D9 同意）。D9 不同意时的备选：留在 Astro 5，手写带 `size-adjust`、`ascent-override`、`descent-override`、`line-gap-override` 度量的回退 `@font-face`，并参照 `scripts/collect-inline-script-hashes.mjs` 在构建后给内联脚本与 JSON-LD 生成 meta CSP 哈希（Astro 5 的实验性 Fonts 与 CSP 选项也是一条路，属先验知识，实施时核实）；两条路都不选，就把 D9 写成阶段 2 的前提条件；
  - 令牌：产品窗口与订单簿令牌及其跨应用测试；动效令牌的读取与等值测试；
  - IBM Plex 与回退度量（Fonts API 或上面的备选）；
  - 主张登记表；
  - 第 5 节的七个首页区块（首屏按上文「验证结果与首版产物」表：产物 A、B 都先以产物 B 的形态上线，即 Terminal 录屏加只有 BTC 海报的 'Recorded market'；产物 C 只有 Terminal。市场表与网络统计行的实时值随阶段 3 加入）；
  - `/deposit/`、法律页样式、`/404/`；
  - 第 8 节的 CSS 动效层；
  - 截图与录屏采集管线（共用 DOM 守卫，第 9 节）；海报管线（产物 A、B 才做，产物 C 不做）；
  - 测试：重写的 brand-contract 与 copy-contract（含仿冒防护、内联 SVG 颜色扫描与风险相邻）；品牌名与域名字面量测试（第 18 节「品牌」）；体积测试；主机白名单测试（只允许 sairn.ai 与 https、wss 的 `api.hyperliquid.xyz`，`dist` 里没有外部 `<script src>`，`dist/_astro/` 的 Worker 包也在扫描范围内）；`dist` 可见文本的毫秒延迟扫描；
  - Playwright（对 `dist` 的静态服务器）在第 6 节列出的宽度（1024、1100、1200、1280、1366、1440、390）与 320 下的布局检查与 `@axe-core/playwright`，含第 6 节 390×844 的首屏目标（主按钮顶边 ≤340px、窗口顶边 ≤520px、露出 ≥160px 窗口内容）；
  - 更新官网 README 的设计说明与依赖规则（含两周规则）；
  - 发布手册增加五步：快照刷新并提交后再构建、主张检查、截图、演示录屏与海报重拍（录屏与截图都记录终端构建标识）、`legal/*.md` 有改动时当天重建发布官网并核对 Last Updated、构建前工作区必须干净；
  - `CHANGELOG.md` 的用户可见条目。
- **验收**：
  - 第 13 节预算全部满足；
  - 关闭 JS 时内容完整；
  - 减少动态时没有任何动画；
  - axe 无严重问题；
  - V1 已通过；构建版本的首屏与 V1 测试稿一致（文案、顺序、默认视图与尺寸），不一致时按第 16 节重测（第一轮这里是至少 5 人的五秒测试，已由 V1 取代）；
  - 第 03 区块的三步说明与存款指南的内容用整页稿另做一次读后测试（V1 的点击任务只测入口能否被发现，第 16 节），结果记入任务记录；
  - 与 hyperliquid.xyz 的并排截图经人审阅；
  - 契约测试经变异检查；
  - `pnpm test:brand` 通过；
  - 运营方批准后发布。

### 阶段 3：实时层（2–3 周）

- **交付**：
  - Worker、Canvas 2D 渲染器、WebSocket 客户端、调速器、校验器、Web Lock 选主；
  - 网络统计行与市场表的实时值；Live market 视图的六个状态（第 7 节）与录制、实时之间的场景替换；Pause 与 Read snapshot；NumberFlow；
  - Playwright `routeWebSocket` 故障矩阵；状态表与冷启动时间点的用例（第 7 节「测试」）；减少动态的帧数断言；文字底板与对比度测试；`bbo` 与 `l2Book` 合并规则、REST 权重与降级顺序的单测；
  - 构建开关 `PUBLIC_LIVE_CANVAS` 默认关闭；关闭时是阶段 2 的静态站：首屏 Terminal 视图照常，第二视图是产物 B 的 'Recorded market'（只有 BTC 海报，不承诺切到实时；上文「验证结果与首版产物」表），打开后成为产物 A；
  - `CHANGELOG.md` 的用户可见条目。
- **验收**：
  - 故障矩阵全部通过（LIVE 标记不出现，进入 Unavailable，没有禁用占位）；
  - 实测数据量、REST 权重与帧时间在预算内；V2 的标准在生产构建上复测通过；
  - 在选定的 `style-src`（不含 `'unsafe-inline'`）下 NumberFlow 正常渲染，浏览器控制台没有 CSP 违规；做不到就回退为纯文本数字，并记录；
  - 主机白名单测试覆盖 Worker 包，Worker 只连 `api.hyperliquid.xyz`；
  - 由人在中端 Android、低电量模式 iPhone、Safari 18（回退路径）、Safari 26、Chrome 与 Firefox 上实际拖动与触摸，验证并记录输入路径；
  - 之后才打开开关发布。
- **止损线**：任一设备检查失败、实测超预算、或故障矩阵有遗漏时，保持开关关闭发布（产物 B），静态站本身就是完整的产品页；修好再开。

### 阶段 4：日语（只在闸门 1、2 的书面批准之后）

- **交付**：
  - `/ja/` 与 `/ja/deposit/`；日文子集管线与字形覆盖测试；BudouX 断句；
  - hreflang 与站点地图；ja 分享卡；ja copy-contract 与风险相邻测试；律师措辞的未登记声明；
  - 母语审阅；
  - 律师审阅构建好的预览（文件与截图，不放公开 URL）；
  - ja 披露文字的单一来源（或同步测试）；`/ja` 的结构化数据只含 Organization、WebSite 与 `approved` 的 FAQPage；
  - 发布时 `SAIRN_SITE_LOCALES=en,ja` 加 `SAIRN_JA_GATE_RECORD` 指向的闸门记录；
  - `CHANGELOG.md` 的用户可见条目。
- **验收**：
  - 测试全部通过；
  - 闸门记录齐全；
  - 律师同意后才把邮件的「ウェブサイト」改指 `/ja/`，并同步邮件 README §1 与任务记录。

### 阶段 5：增长与平台（持续）

- **交付**：
  - `/markets/[symbol]/`（英文，主场所，只来自运营方审阅的白名单）与下架页删除步骤；
  - `/how-it-works/`、`/fees/`、`/learn/`、`/changelog/`、`llms.txt`；
  - Search Console 与 Bing 的 DNS 验证；`/apps` 收录申请；
  - 响应头策略（运营方在 AWS 操作；CloudFront 日志已提前到阶段 1，第 16 节）；
  - 全仓 Node 决定之后再做 Astro 7（同时把 `@tailwindcss/vite` 升到 4.3.x）；
  - 每项上线时的 `CHANGELOG.md` 条目。
- **验收**：每项单独审阅与发布；市场页只来自白名单，删除下架市场时先 `--dryrun`；每次发布后按第 16 节的时间窗记录结果。

## 20 风险

| 风险 | 缓解 |
| --- | --- |
| 律师限制或拒绝 `/ja`，或要求英文站改更多；面向日本居民的实时行情与费用可能被认定为劝诱（金融厅 2000-12-11 指引、ADR 0042） | 阶段 0 先删；主张登记表按语言审批；默认关闭的 ja 开关与闸门记录；不做地理定向或跳转；只做英文也是完整结果 |
| 看起来像 Hyperliquid 官方：薄荷与 #97fce3 ΔE 8.5，Hyperliquid 首屏是薄荷粒子视频 | 中性梯度与墨色线；没有粒子与编辑衬线；仿冒防护测试与人工并排审阅；首屏的独立声明；官方网址区块 |
| 实时数据当众出错（Paradex、GMX、Drift、Uniswap） | 共享校验器、单调时钟、只在有效时显示 LIVE、移除而不是填占位、海报标 'Recorded'、发布时的主张检查、故障矩阵 |
| 按 IP 共享的限额（10 个连接、每分钟新建 30 个、每分钟 1200 权重），手机走运营商级 NAT，同一出口 IP 下还有其他访客与终端标签页 | 桌面与手机都是每页一个连接，跨标签页选主，REST 也只在选主标签页发出；最多 7 个订阅（第 10 节数据路径表）；有上限的退避；最优买卖价走 WebSocket `bbo`，不轮询 REST；按路径设 REST 权重上限（桌面与手机 ≤30/min、回退 ≤30/min），调速器运行时统计并降级 |
| 手机流量与电量 | 先测量（阶段 1 与 V2）；手机与桌面同一组订阅，`l2Book` 只有约 5.3 s 一帧，最优价走 `bbo`；字节超预算时首屏进入 Unavailable；限帧与 DPR；离屏与隐藏时停止；Save-Data 用海报；绝不在主线程渲染 |
| 未见文档或会变化的接口字段 | 不用 `globalStats` 与 `blockList`；阶段 1 实测返回形状；校验器拒绝未知形状，变化时 fail closed |
| 会动的内容带来无障碍回退 | Pause；减少动态时切到海报；不报跳动；DOM 表格；CI 里跑 axe；人工读屏检查 |
| 浏览器直连 Hyperliquid，Hyperliquid 能看到访客 IP（现在的 Ticker 也是如此） | 律师确认隐私政策覆盖与外部送信規律问题；不加任何遥测 |
| 自写渲染器的维护 | 只有一个 Canvas 2D 渲染器与一个场景模型；ADR 记录设计；WebGL2 只在有证据时才加 |
| 手工发布与过期数据 | HTML 里没有易变数值；结构快照与「100+」检查是发布步骤；海报写明录制日期 |
| 不写 HIP-3 股票与商品，放弃同行主打的「什么都能交易」叙事 | 在律师决定前接受；主张登记表可以按语言恢复 |
| 品牌流程的摩擦：本规划的 D3–D6 需要运营方决定，琥珀需要修订 ADR | 默认方案不依赖琥珀与新生成器；决定集中在阶段 1 |
| 邮件依赖 sairn.ai 的订阅、退订与追踪路径，而官网是纯静态站 | 第 18 节「日本邮件依赖的 sairn.ai 能力」与 D19；退订路径由 CloudFront 单独路由到 ESP，排除在 `gatu-rewrite-index` 与 404 映射之外 |
| 第三方地址进入仓库或页面（成交数据带 `users`） | 录制脚本与 Worker 校验器丢弃 `users` 与 `hash`；schema 测试扫描地址模式 |
| 没有分析工具，归因弱 | 接受；槽位 UTM、日志与聚合 builder 数据给方向；产品侧事件另做 |
| 1.0 之前的依赖（number-flow、budoux） | 精确固定版本；number-flow 旁保留纯文本；BudouX 只在构建时运行，输出写进 HTML |
| 第一屏仍被认为「传统」；第二轮默认的 Terminal 截图又让首屏回到「截图式」 | 第三轮修订把 Terminal 视图改为终端录屏，默认视图本身就有动效（第 6、26 节）；阶段 1 的原型先给运营方看，「太传统」的最终裁决是运营方看原型；Preview 窗口的 Live market 视图提供实时市场，标签上的圆点提示它在动；V1 记录第二视图发现率与对现站基线的现代感比较（只是方向性证据），供 D20、D2 决定默认视图与是否保留两个视图 |
| 实拍截图或录屏出现不该展示的内容（杠杆、HIP-3、钱包品牌、测试网、盈亏或账户数字），或采集时其实已登录；录屏还会录下两次检查之间的短暂画面（悬停提示、菜单） | 只拍、只录未登录的现货市场，录屏不打开市场选择器；DOM 守卫拒绝这些文字并要求可见的 Connect 按钮，录屏另有页面内逐帧检查，只编码最后一次通过的检查之前的帧（第 9 节）；每次重拍、重录附人工审阅；夹具数据是 D21 的备选 |
| 录屏被读成现在的实时行情、别人的账户，或把演示指针读成真实用户在操作 | 身份说明写 'Screen recording of app.sairn.ai, signed out · <date> UTC'；V1 的录屏误解题记录这三种误解（第 16 节）；推荐（D20、D22）不变，V1 结果交运营方 |
| 录制画面与实时画面混在一起，或切换突兀、改变窗口高度 | 第 7 节状态表与固定几何；15 s 连续有效后才以场景替换切换（淡出、不可见时整体替换、淡入，不交叉）；V3b 在 0、1、2、5、15 s 截图并逐帧采样 |

## 21 需要运营方决定的事项

本节的 D1–D25 只指本规划的决定（D20、D21 是第二轮修订新增，D22、D23 是第二轮审查后新增，D24、D25 是第三轮修订新增）。V1–V3（第 19 节）开始前需要的决定是 D2、D5、D7、D20、D21，其中 D20 在 V1 之前只批准进入测试的候选与推荐默认；D22 与 A/B 构图的选择一起定，V1 若用 A 的构图就在 V1 之前定；D23 在 D20 定案后再定；其余在阶段 1 结束前作出即可（S9）。[品牌迁移计划](brand-migration-plan.md)也有一套 D1–D20，本文提到它们时一律写全称，例如「品牌迁移计划 D2」「品牌迁移计划 D5」「品牌迁移计划 D12 (h)」。

| 编号 | 事项 | 选项与推荐 |
| --- | --- | --- |
| D1 | 阶段 0 的范围与发布时机 | 推荐：现在就删全部闸门 1 矛盾内容（含英文站的 HIP-3 股票、指数、金属与 JP225），批准后发布，律师事后看对照；备选：等律师意见再删 |
| D2 | 是否批准本规划为方向，并先做一页原型 | 推荐：批准为方向，先做原型；第二轮修订后，全面实施（阶段 2、3）要等 V1–V3 的结论 |
| D3 | 官网画布（品牌迁移计划 D5 的官网部分） | 推荐：页面石墨 #12131a + 产品窗口 #0F1A1F。两者都是近黑中性色，与 Hyperliquid 的区分靠色相（#03211c 是 C*ab 12.8、h 179.5° 的深绿）、字体与母题，不靠底色的 ΔE；选石墨的理由是不改官网画布、令牌改动最少，连续性由同为 #0F1A1F 的首屏窗口与终端启动画面承担；第二轮修订后首屏窗口的默认视图本身就是 #0F1A1F 的终端画面（第二轮是截图，第三轮是录屏）。原型 B 的整页青黑底与 64px 网格若采用，网格不透明度 ≤1%，不加暖色背景光（V9）。备选：整页 #0F1A1F（连续性更强）；不推荐：品牌青 #0A3038（有色相，与 #03211c 的 ΔE76 只有 12.0） |
| D4 | 字体 | 推荐：改用 IBM Plex Sans 与 Plex Mono（日语用 Plex Sans JP 子集），去掉 Inter 与 Instrument Serif |
| D5 | 标志图形里是否用琥珀 | 推荐：不用，琥珀只在 Logo。第二轮修订：原型 B 的热度改为灰阶 #263138 → #68747D → #AAB4BC，B 的任何部分都不用琥珀，选 B 不需要修订 ADR 0028（V2、S5）。备选：修订 ADR 0028，只在中间价线与十字线上用，远离风险句与警告。若有人要琥珀色的热度层，那超出本备选的范围，需要另写一份明确的授权（允许区域、强度上限、与警告色的隔离、图例规则）并修订 ADR，本规划不推荐 |
| D6 | 页面加载时是否播放 `brand-intro`（品牌迁移计划 D12 (h)） | 推荐：不播放。入场动画会推迟首屏内容与 LCP（H1 是 LCP 元素，第 6 节），占用第 8 节的动效预算；动效库（`brand/tools/Sairn-Motion-Library-v1.3.html`）也写明 brand-intro「不用于延长启动等待」 |
| D7 | 首屏英文文案（眉标题、H1、副标题、按钮、次级链接、风险句、存款一行、小字、状态标记与说明） | 推荐：以第 6 节第二轮草稿为起点（眉标题 'Independent web terminal for Hyperliquid'，H1 'Trade Hyperliquid perps and spot.'，次级链接 'No wallet? How email sign-in works →' 跳到 `#start`），经 V1 理解测试后定稿；口号移出首屏，放在首屏以下的位置一并定。另：Live market 里密集成交点的画法也由运营方看对比海报后选定（第 7 节；第二轮审查 V3）：(a) 减薄每个点的底色描边、降低小额成交的不透明度或把最小半径降到 1.5px，不改数据含义；(b) 显示聚合，按数据空间分桶（时间格与价格步长对齐，买卖分开；按屏幕像素分桶会随画面平移闪烁），合计与均价用 Big.js 计算，提示框逐笔列出所含成交，图例写明一点可代表多笔成交。推荐先出 (a) 的对比海报 |
| D8 | 实时层的止损线与 WebGL2 | 推荐：按阶段 3 的止损线，并以 V2 为前置检查；WebGL2 只在实测证明需要时再议。第一轮原型实测追加里「两条连接还是一条」的取舍已在第 10 节定为每页一条，不再由本项裁决 |
| D9 | Astro 6 升级时机 | 推荐：阶段 2 开头单独一个 PR；Astro 7 等全仓 Node 决定。不同意时，阶段 2 走 Astro 5 的备选路径（手写回退度量与构建后算 CSP 哈希，第 19 节） |
| D10 | AWS 操作（各自单独批准） | 开启两个分发的 CloudFront 标准日志（第二轮修订提前到阶段 1，以便上线前积累四周基线；字段选择去掉 `c-ip`，或不记录带地址的终端路径；保存期限与处理方式随批准写明）；给 sairn.ai 挂响应头策略；导出 `gatu-rewrite-index` 源码入库；D19 需要时新建指向 ESP 源站的退订路径缓存行为 |
| D11 | Search Console 与 Bing 的 DNS 验证（Cloudflare） | 推荐：英文先做，日语等律师 |
| D12 | 申请 Hyperliquid `/apps` 目录收录 | 推荐：与开发并行提交 |
| D13 | 是否为地址级指标或站上事件请求修改隐私政策 | 推荐：暂不，先用聚合数据 |
| D14 | 日语：把第 18 节问题交给律师，指定母语审阅者 | 推荐：与邮件闸门 1 一并提问 |
| D15 | `/markets/` 程序化页面的范围 | 推荐：阶段 5 做，由运营方审阅一份稳定白名单（例如 20–30 个主场所、未下架的永续），写在 `src/config/markets.ts`，其余不生成。理由：避免长尾薄页，不做 OKX 页脚那种链接农场（调研第 9 节）；用白名单而不是构建时按成交额排名，是因为排名每次发布都会变，页面随之增删，造成 404 与站点地图抖动，还要在构建时读易变数值（违反 E1） |
| D16 | `/blog/` 在第一篇文章前移出导航、站点地图并 noindex | 推荐：同意，随阶段 0 |
| D17 | 社交链接 | 等品牌迁移计划 D2 提供账号；之前不放 |
| D18 | 是否把「阶段 0 已上线」设为日本邮件的硬性发送条件 | 邮件 README 闸门 1 已经列了「官网与邮件是否矛盾（2026-10-24 审计新增）」一问；待决的只是要不要把「阶段 0 已上线」写成硬性发送条件。推荐：是 |
| D19 | 日本邮件依赖的 sairn.ai 能力（第 18 节） | 同意入口：推荐只在应用内（官网不加表单）；备选：ESP 托管页挂在 sairn.ai 子路径。退订路径：推荐 sairn.ai 的 `/u/*` 由 CloudFront 单独路由到 ESP 源站（并入 D10，排除在 `gatu-rewrite-index` 与 404 映射之外）；备选：放在 app.sairn.ai 下。若决定官网不做订阅，同步修改邮件 README §6 第 2 条 (b)。出现表单时 CSP 加 `form-action`，隐私政策覆盖（邮件闸门 3） |
| D20 | 首屏 Preview 窗口的默认视图 | 推荐：Terminal（未登录终端的真实画面；第二轮是截图，第三轮改为录屏）。理由：产品理解在第 4 节重评里权重最高，Live market 画面证明的是 Hyperliquid 在交易，不是 Sairn 的产品（L1、S1）；Terminal 视图不依赖实时数据，没有 JS 或减少动态时显示录屏的首帧海报，实时数据失败也不影响它。第三轮的录屏带演示指针，可能被读成真人操作、别人的账户或现在的行情（第 6 节），V1 的录屏误解题记录这一点；推荐不因此改变。备选：Live market 默认，条件是 V1 里误认画面为终端功能的人不超过 1/10，且其余通过标准同样满足。V1 之前只批准进入测试的候选（Terminal 默认、Live market 默认）与推荐默认；V1 之后按理解测试结果、第二视图发现率与现代感比较（第 16 节）定默认视图，以及是否保留两个视图：推荐两项记录不都指向正面时退为单视图，省掉一套管线（第 4 节「组合」）；现代感比较的基线按第 16 节，由运营方确认。发现率与现代感要不要升为硬门槛、数值多少，由运营方在 V1 前决定，本规划不设 |
| D21 | 截图与录屏的来源（首屏 Terminal 视图的录屏与截图回退、第 02 区块） | 推荐：未登录状态下实拍、实录 app.sairn.ai 的现货市场（首屏是 HYPE/USDC），DOM 守卫拒绝杠杆文字、`xyz:`、钱包品牌、testnet、盈亏与账户摘要，并要求可见的 Connect 按钮；录屏与截图共用守卫（第 9 节）；说明写来源与 UTC 日期；每次官网发布重拍、重录；生产管线 `apps/website/scripts/capture-ui.mjs` 保留守卫（第 9 节）。这改变第一轮 A7「截图只用夹具数据」的规则。备选：沿用 A7，用终端夹具与夹具数据并标 'Sample data'；需要账户状态的画面（持仓、余额、`/deposit/` 里的 Deposit 窗口）只能用这个备选。日语页用哪一种由律师意见决定。阶段 0 的临时重拍按阶段 0 清单原文（夹具数据或不含杠杆区域的裁切），不受本项影响 |
| D22 | A 版首屏终端画面的呈现（第二轮审查 L-N2、V-N2；当时是截图，第三轮起是录屏） | 背景：A 在视口 ≥1280 时把 1440 宽的采集按约 48% 显示，终端 11–13px 的字只剩约 5–6px，导航、盘口数字与下单输入难以阅读（源码推算）。(a) 保留整张截图：首屏只证明「这是真实终端」，细节由第 02 区块的大截图承担（第 5 节）；成本最低。(b) 对同一张 1440 采集做一个连续的右侧裁切（约 x 440–1440、y 0–545，约 69%）：会失去截图里的市场名，市场身份只靠 `alt` 与说明；DOM 守卫要加横向边界（现在只按纵向过滤，横向裁切时 Connect 检查会误判通过），`alt` 与第 6 节的截图描述同步改写；对录屏同样适用：裁切作用于录制区域，`record-demo.cjs` 的守卫要加同样的横向边界，视频的 `aria-label` 与说明行一起改写；坐标是对截图的目测估计，实施时实测。(c) 把 A 的窗口移到文案下方，向 B 靠拢，A/B 的构图差别随之消失。推荐与 A/B 构图一起决定。不推荐在 md 宽度重拍：终端的 md 布局把盘口排到裁切线以下（2026-10-24 观察），缩放比例也只升到约 58–63%（推算）。三种做法都只取同一次采集里的一个连续矩形，不拼接、不锐化、不描边。第三轮修订（2026-10-25）：首屏改为录屏后，桌面录屏是 1 倍像素（1440×732，第 6 节），比上面推算所依据的 1.5 倍截图（2160×1098）像素少；(a)–(c) 的可读性要按录屏重新检查，B 版把窗口放到近全宽，在高像素密度屏幕上要放大视频（收尾验证按 2 倍屏推算约 1.7 倍，未实测），清晰度同样要复核；也可以考虑按 1.5 倍重录。推荐不变 |
| D23 | Open Book 的品牌识别（第一轮审查 V7） | 推荐：D20 定案前不加。若要加，只用现成的单色小标 `brand/svg/mark-small/sairn-mark-small-mono.svg`，中性前景色，不用 `--logo-*`，不用琥珀，也不自行派生新几何（ADR 0028 决策 6）；完成命名与商标检查之前，不把 'Open Book' 用作可见名称（第二轮核验指出 Solana 上有名为 OpenBook 的订单簿 DEX，属先验知识，没有做商标检索）。另要注意：'Sairn / Open Book' 一类标题会把 Hyperliquid 公开数据的可视化包装成 Sairn 的功能，与同一视图的 'not a terminal feature' 相抵，可能推高 V1 的误认率；手机窗口顶栏也没有余量放标题 |
| D24 | 「加密之外的市场」：英文站是否展示第三方部署的、参考美股与未上市公司（例如 OpenAI、Anthropic）的 HIP-3 永续，以及能否做对应的视频 | 推荐：先由律师按[审阅包](marketing/beyond-crypto-review.md)回答问题清单（地区、日本、美国、未上市公司表述、商标、责任划分、数据展示、条款修改），律师书面意见之前不做、不上线；即使同意，也只做英文、`never-ja`，不写杠杆倍数、不用 Logo，并要先改本规划第 5 节「不放 HIP-3 股票」与 copy-contract 的禁用模式。审阅包的设计部分在 `designs/beyond-crypto-review/`（区块草稿、通用版与命名版两段视频、终端现状截图），只供审阅 |
| D25 | 截图与录屏守卫对未登录零值余额与公开行情的处理 | 推荐：'Available' 之后只放行零值占位（同一元素里的数字与其后的元素合计最多三项，带数字的词都只能是 0 / 0.00）；另按终端标记放行四处公开行情：`data-market-stat` 为 `volume24h` / `marketCap` 的市场头部数值、`data-market-stat="contract"` 里的代币合约缩写地址、手机盘口 `data-slot="compact-orderbook-mid-price"` 里与标题旁市场价相差 1% 以内的 `$` 中间价、桌面盘口悬停提示 `data-slot="orderbook-cumulative-tooltip"` 里 'Total (USDC)' 后的累计名义额；其他任何金额（含拆在相邻元素里的、括号单位标签后的）都拒绝（第 9 节）。备选：严格版，取消零值放行与四处例外，代价是放弃手机录屏（未登录也显示 'Available 0.00 USDC'），桌面要把市场头部（成交量、市值、合约地址）裁出画面，录屏步骤也不能让指针停在盘口上 |

## 22 本文的验证与限制

- 这是拟议文档：没有改任何代码、配置或测试，也没有运行测试或构建。
- 三个方向与三份评审由 Agent 生成，原文未取得（见开头）；本文第 4 节是摘要，评分只能追溯到本文与任务记录。调研的原始证据在本机 `.worklog/`（Git 忽略，见开头），任务记录在 `docs/work-memory/sessions/2026-10-24-website-research-and-rebuild-plan.md`。
- 2026-10-24 同日经过一轮评审（25 条意见），已按仓库与调研证据核对后修改；本文中引用的源码行号（第 19 节阶段 0 清单、`seo.ts`、`faq.ts` 等）是当日的读数，实施时要按当时源码复核。
- 外部事实来自调研的单次取证，限制见调研第 1 节；版本、支持数据与页面重量在实施前要重新核对。
- 色差与对比度是 Agent 计算的，未经设计方复核；仿冒防护的阈值（ΔE76 ≥15、中性色 C*ab <8）是本规划的提议，需要在测试里落实，并经运营方确认。
- 文中出现的法律问题都不是法律意见；面向日本的一切以律师的书面意见为准。
- 第二轮修订（第 24、25 节）对本文只是文字改动；设计原型 `designs/website-hero-prototype/` 由主会话另行修改，并用 Playwright 无头 Chromium 做了短时测量（第 24、25 节），不是仓库测试、不是真机，也不是 V2 浸泡；文中新增的尺寸、阈值与通过标准都是目标或拟议值，第 4 节的重评分数是 Agent 的判断。
- 第三轮修订（第 26 节，2026-10-25）对本文同样只是文字改动；演示录屏、录制脚本与守卫由主会话在原型里实现，用 Playwright 无头 Chromium 录制与检查，原型守卫的 `node --test` 规则测试与 DOM 读法测试也只在 `designs/` 下运行，不是仓库测试，不是真机，没有在 Safari 或 iOS 上播放。
- 第 23–25 节是第二轮的记录，其中的「Terminal 截图」「首屏露出截图」指当时的静态截图，保留原样；第三轮起默认视图是录屏（第 6 节），静态截图只作回退与第 02 区块的图。

## 23 外部对抗审查（2026-10-24，追加）

运营方要求用 GPT 对本规划与首屏原型做一次对抗审查并评分。用 Codex CLI 调 `gpt-6-astra`（只读沙箱、`medium` 推理强度，附 6 张截图：现官网首屏与原型 A/B 的桌面、手机），分三路并行：布局与信息架构（L）、视觉审美与品牌（V）、方案整体证伪（S）。每路约 9–11 万 token。提示词、三份原始报告与截图存在本机 `.worklog/2026-10-24/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-gpt-review/`（Git 忽略）。

| 审查路 | 总分 | 分项 |
| --- | --- | --- |
| L 布局 | 6.7 | 首屏层级 7.0、转化路径 7.0、实时窗口布局 6.5、移动端 6.0、整页信息架构 6.5、相对现站进步 7.0 |
| V 视觉 | 6.6 | 审美精致度 6.5、招牌图形 6.0、配色对比 7.0、字体层级 6.8、动效 6.8、品牌区分度 6.5；A 版 6.4、B 版 6.8 |
| S 方案 | 6.3 | 方向 6.0、回应「太传统」5.5、技术取舍 7.0、可行性 5.5、完整一致 6.0、风险处理 7.5 |

三路都没有 P0，结论一致：保留 Astro 静态底座，方向值得继续，但不能按现稿批准实施。三路共同指出的 P1：

1. **首屏主视觉不能证明 Sairn 的产品**：本规划第 2 节目标 1 要求首屏展示真实产品，第 6 节的窗口说明却写着 'not a terminal feature'；画布证明的是 Hyperliquid 在交易，不是为什么用 Sairn（L1、S1）。S 路还指出第 4 节的三方向比较不公平：Live Window 因可以单独删掉的实现缺陷被整体否决，A/B 也只是同一画布的配色版式差异（S2）。
2. **最好的画面出现得太晚**：原型要积累约 100 秒才饱满，1.5 秒时大部分为空（L2、S3、V1）。
3. **手机首屏仍是长篇文字**：主会话实测 390×844 下实时窗口顶边 613px、画布顶边 817px，首屏露出的画布为 0；主按钮底部到风险句 96px（L3、L6、S3、V4）。
4. **B 的琥珀超出决定 D5 的备选范围**：D5 备选只允许中间价线与十字线，B 用在整个热度层、时间边与背景暖光（S5、V2）。
5. **画面主次不清**：A 像条形码、B 像木纹，高亮挂单带接近中间价白线的亮度，B 的历史成交光晕连成发光珠串（V3）。
6. **规划自相矛盾**：第 10 节正文仍是「每页一个连接、盘口 5 s 过期」，与第 10 节末尾的原型实测小节（当时名为「2026-10-24 原型实测（追加）」）互斥；数据路径要在视觉批准前定下（S4）。
7. **整页信息架构冗长**：行情出现三次，进入方式重复，真实终端到第 08 区块（第一轮编号，现为第 02 区块，见第 5 节对照表）才出现；L 路建议收敛为七段（首屏 → 真实终端与三项能力 → 三步开始 → 市场 → 费用 → 机制与信任 → FAQ 与结尾）（L4）。
8. **邮箱入口只是同一链接换 UTM**（L9、S6）；**衡量方案回答不了改版是否有效**（S7）。

主会话的核验：
- 引用的规划原文（提交 `69a4e7a2` 版本的第 23、259、450、499、992 行，本轮修订后行号已变）与 ADR 0028 决策 6 都对得上。
- 用 Playwright 实测了它推算的尺寸，全部吻合：手机窗口顶边 613px（推算约 615）、主按钮到风险句 96px（约 100）、B 在 1366×768 画布可见 148px（约 150）、1440×900 为 275px、A 画布宽 393px，占窗口 57%。
- 设计判断部分没有找到与仓库事实冲突之处。

这些意见的处理见第 24 节（第二轮修订）。

## 24 第二轮修订（2026-10-24）

运营方要求按第 23 节的 GPT 审查意见修订：首屏加入真实终端预览，冷启动用录制海报，压缩手机首屏，收敛整页信息架构和数据路径。下表逐条列出三路报告里全部 P1 与 P2 意见（编号是各路报告「主要问题」的序号：L 布局、V 视觉、S 方案）、处理方式、在本规划中的位置与状态。状态只说明本规划的文字：「已改」是规划已按意见改写，「部分」是只采纳了一部分，「未改」是没有采纳；原型的实现由主会话负责，不在本表的状态里。采纳的数值（尺寸、阈值、通过标准）都是目标或拟议值，不是实测结果。

| 意见 | 级别 | 处理 | 位置 | 状态 |
| --- | --- | --- | --- | --- |
| L1 首要展示物不能证明正在销售的产品 | P1 | Preview 窗口默认是未登录终端的真实截图（Terminal），Open Book 改为第二视图 Live market；'not a terminal feature' 只用于 Live market | 第 2、4、6 节；D20 | 已改 |
| L2 B 的首屏卖点在冷启动时不成立 | P1 | BTC 用录制海报冷启动，连续 15 s 有效后以场景替换切到实时；V3b 在 0、1、2、5、15 s 检查；绘图区比例随窗口宽度（第 7 节，原为 B 固定 16:9）；第二轮审查后，B 在短桌面视口（`min-width: 1024px` 且 `max-height: 820px`）收紧页头间距 | 第 6、7 节；第 19 节 V3a、V3b | 部分：1366×768 下窗口顶边 ≤380px 已写为第 6 节的目标，原型已加短视口间距；第 25 节实测窗口顶边 374px 达标，画布露出 235px（L2 建议 260px）；L2 的头部 ≤120px 与 ≥260px 画布仍没有写入。第一版原型实测：B 在 1366×768 下首屏露出终端截图 288px，切到 Live market 时画布露出约 208px（第一轮 148px）；新加的身份说明会占去一部分高度，旧读数不能沿用 |
| L3 手机首屏仍主要是说明文字 | P1 | H1 'Trade Hyperliquid perps and spot.'，独立身份移到眉标题，副标题 ≤2 行，H1 32/35；390×844 目标：主按钮顶边 ≤340px、窗口顶边 ≤520px、首屏露出 ≥160px 窗口内容（Live market 视图 ≥120px 绘图区），不计原型切换条 | 第 6 节；阶段 2 布局检查 | 已改 |
| L4 整页先证明 Hyperliquid 活跃，后证明 Sairn 值得用 | P1 | 页头页脚之间收敛为七段：首屏 → 终端与三项能力 → 三步开始 → 市场 → 费用 → 机制与信任 → FAQ 与结尾 CTA；网络统计降为市场区一行；订单流转并入机制区；附旧编号对照 | 第 5 节；第 8 节 | 已改；手机按普通纵向顺序排列，没有采用 L4 提的「可直接选择的静态标签」 |
| L5 A 的固定五档侧栏挤压绘图宽度 | P2 | 窗口宽 ≥900px（容器查询）才放五档表，更窄时一行最优价；价格刻度槽 68px；桌面绘图区 ≥560px | 第 6、7 节 | 部分：没有加 L5 的 `Depth` 展开控件，手机刻度槽没有单独定为 60–64px。第二轮审查 L-N3 后，A 的两栏断点改为视口 ≥1200px（1024 宽两栏时画布约 471px，源码推算），A 桌面 3:1 由随窗口宽度的比例取代（第 7 节） |
| L6 风险句与 CTA 之间隔了两个决策层 | P2 | 顺序改为主按钮与次级链接 → 8px → 风险句 → 8px → 存款条件一行 | 第 6 节 | 已改 |
| L7 手机窗口的辅助信息占用接近画布的高度 | P2 | 绘图区比例（手机现为约 9:10，原为 4:5）与「首屏露出 ≥160px 窗口内容」目标；图例改写 | 第 6、7 节 | 部分：L7 的标签栏 56px、报价区 72px、图例 36px 没有写成固定值；图例仍是五项，亮度说明没有移进可点击说明。第二轮审查后，两个视图的身份说明常显，计入窗口辅助区的高度；图例压成一行要删除或缩写标签，作为 V1 的可选变体，由运营方决定 |
| L8 图例分不清挂单与成交 | P2 | 图例 'Resting orders (brighter = more size)'、'Buy trades'、'Sell trades'、'Dot size = trade value'、'Mid price'；表头 'Price (USD) / Size (BTC)'；时间刻度 '−120 s / −60 s / Now' 跟随增长的窗口 | 第 7 节 | 已改 |
| L9 邮箱入口只是同一终端链接 | P2 | 次级链接改为 'No wallet? How email sign-in works →'，跳到第 03 区块 `#start`；删除 `hero_email`、`entry_email`、`entry_wallet` 槽位 | 第 5、6、16 节 | 已改 |
| V1 招牌图形的最佳状态来得太晚 | P1 | 带日期的录制海报，15 s 有效后以场景替换切到实时：数据区淡出，在不可见时整体替换画面、数字、坐标、标记与状态文字，确认新画面就绪后淡入，两个方向相同，不交叉；V3b 检查 0、1、2、5、15 s 并逐帧采样 | 第 7、8 节；V3a、V3b | 已改。如实记录：本行原写「200 ms 整体交叉淡化……不拼接录制与实时」，第二轮审查（V-N1、S-N2）发现原型第一版只淡化了画布，数字、标记与坐标在海报仍可见时已换成实时值，反向回海报是硬切，与本行和第 7 节当时的文字都不符；规划改为场景替换，原型随之修改，逐帧验证结果另记 |
| V2 B 的琥珀改变了品牌主视觉角色 | P1 | B 的热度改为 #263138 → #68747D → #AAB4BC，删除暖色背景光，按钮仍为 #EDEEF2；B 不用琥珀，D5 与 ADR 0028 不变；D5 写明琥珀热度不在备选范围内 | 第 7、9 节；D5 | 已改 |
| V3 热图、成交与中间价没有主次 | P1 | 热度最高不透明度 ≤0.65、无近白终点；中间价 1.5px #EDEEF2 加深色衬底、无光晕；成交点桌面 2–8px、手机 2–6px；历史点无光晕，只有 320 ms 的到达脉冲 | 第 7 节 | 部分：同一区块时间（成交的 `time`）、同一方向的成交在显示上合并为一点（按成交额加权的均价，第 7 节）；这是显示合并，不是订单识别，同一区块里同方向的几笔吃单也会并成一点（本行原写「按一笔吃单合并」，第二轮审查后更正）。不同时间、位置重叠的点没有合并，密集点的画法交 D7 |
| V4 手机首屏仍是长篇介绍 | P1 | 与 L3 合并处理：H1 32/35，主按钮 44px，风险句在按钮组下 8px；窗口顶边取 L3 的 ≤520px，露出量取 V4 的 160px，用于窗口内容 | 第 6 节 | 部分：眉标题与 H1 用 L3 的写法（H1 保留 'Hyperliquid'），没有用 V4 的 'Trade perps and spot.'；V4 的窗口顶边 ≤480px 未采用；副标题与风险句的行高未逐项写入 |
| V5 A 的侧栏盘口占用招牌图形宽度 | P2 | 与 L5 合并：以 900px 容器宽为界（V5 提 800px），刻度槽 68px（V5 提 64px）；第一版 A 的绘图区固定 3:1（1440 宽时 621×207px），第二轮审查后改为随窗口宽度的比例（第 7 节） | 第 7 节 | 部分：阈值取 L5 与主会话的值 |
| V6 标题强调身份声明，品牌承诺不利落 | P2 | 独立身份放眉标题；H1 统一近白、不分色；A 最大 48/52、B 最大 60/64，字重 500 | 第 6、9 节 | 部分：H1 文案用 'Trade Hyperliquid perps and spot.'，没有用 V6 的两行写法；B 标题约 900px 宽未写入 |
| V7 Open Book 还没有 Sairn 识别度 | P2 | 没有处理：可见标题 'Sairn / Open Book'、Logo 双片几何的角标与编号、去掉字标的并排识别测试都没有写入 | — | 未改：本轮先解决产品证明与冷启动；默认视图改为终端截图后，母题承担的作用也变了，待 D20 定案后再议 |
| V8 图例解释了颜色，没解释在看什么 | P2 | 图例改写、时间刻度、点大小说明（同 L8） | 第 7 节 | 部分：没有加 'Orders over time. Dots are executed trades.' 一句；图例文字用主会话选定的写法；说明文字的字体没有改为 Sans 12/16 |
| V9 动效要补状态衔接，不是装饰 | P2 | 删除 B 的 0.99→1 缩放、历史点光晕与暖光；整页网格 ≤1%；录制与实时之间的场景替换；视图切换 ≤180–200 ms 的不透明度过渡（结束后才隐藏），市场切换走场景替换 | 第 7、8 节 | 部分：触控可用的检查十字线、NumberFlow 只用于一个主价格没有写入 |
| S1 核心视觉没有证明为什么用 Sairn | P1 | Terminal 默认；V1 问「资金由谁持有」等三个问题，并检查误认，误认画面为终端功能的人 ≤1/10 | 第 4、6、16 节；V1；D20 | 部分：S1 的「8/10 能说出一个已验证的产品特点」改写为三个问题的通过标准；资金归属一问覆盖一个已验证特点，邮箱登录这一差异点按 V1 的「怎样登录」一问单独编码报告，不设门槛（第二轮核验） |
| S2 三个方向不是公平比较 | P1 | 按产品理解 30、差异记忆 25、现代感 20、手机 15、维护 10 的权重重评，按最佳实现打分并写出算式；A/B 视为同一方向的两个变体 | 第 4 节 | 已改；分数是 Agent 的判断。V1 校正产品理解，现代感与差异记忆只有方向性证据，维护分仍是估计；第二轮审查后补了「组合」一段（第 4 节） |
| S3 关键视觉收益出现在等待之后 | P1 | 录制海报；V3 在 0、1、2、5、15 s 与断网时检查（S3 提 0、2、5、10 s）；手机首屏露出 ≥160px 窗口内容 | 第 6、7 节；V3 | 已改 |
| S4 实测已经否定旧架构，正文仍有两套要求 | P1 | 第 10 节改为一张数据路径表作唯一来源：每页一条连接，`l2Book`（`nSigFigs: 5`）+ `bbo` + `trades` + `activeAssetCtx`；合并规则；6 s / 12 s / 20 s 新鲜度；旧实测保留为证据并标明被取代 | 第 10 节 | 已改；与 S4 的首轮建议不同，手机与桌面同一组订阅，不是只有 `bbo` 加 `trades`；短时采样中断 0 次（见下），24 h 浸泡仍是 V2 的验收项。第二轮审查（S-N4）发现合并规则的例子方向写反（原写「新的最优卖价已低于某个旧卖档，那一档不画」，那一档其实是合法的更深卖档），已按原型的实际规则更正并补了买侧例子。原型的 LIVE 判定不检查连接、坏帧计数共用、回海报的计时与第 7 节不一致，属原型实现，规划写明了规则（第 7、10 节） |
| S5 B 的视觉差异超出 D5 允许的范围 | P1 | 与 V2 合并：B 直接改用灰阶，D5 不变，琥珀热度需另行授权 | 第 7、9 节；D5 | 已改；没有另做「B 布局加 A 灰阶」的对比稿，B 本身就换成灰阶 |
| S6 邮箱差异只落实为链接文案 | P1 | 采用 S6 的第二种做法：不改终端，次级链接 'How email sign-in works' 跳到三步说明 | 第 5、6 节 | 部分：没有加「首次用户进入终端后 10 秒内找到邮箱入口」的验收；把意图带进终端连接窗口的入口不做（第 2 节非目标：不改终端） |
| S7 衡量回答不了改版是否有效 | P1 | 第 16 节分为上线前理解测试与上线后四周对比，写明能证明与不能证明什么；不做 A/B；日志提前到阶段 1；首次存款仍标为未测，不用 builder 收入替代 | 第 16、19 节；D10 | 已改；第二轮审查（S-N7）后，第 16 节把「CTA 点击」改称带官网 CTA 槽位的应用文档请求数，写明计数口径，并删除没有数据来源的「会话数」 |
| S8 「不用库」成了前提 | P2 | 原生优先：库在实测比较中胜过原生实现并放得进预算才加入，以 `motion/mini` 为例；第 8 节只保留行为规则 | 第 8、11 节 | 已改 |
| S9 路线图先扩建，后验证最贵的核心 | P2 | 阶段 1 内加限时验证包 V1（约 1 周）、V2（24 h 浸泡，上限 3–5 个工作日）、V3（上限 3–5 个工作日），各有 go / no-go；写明 V1–V3 前需要的决定；日志提前到阶段 1 | 第 19、21 节 | 部分：响应头仍在阶段 5（需要运营方的 AWS 操作）；首版范围没有按 S9 收窄；阶段 0 不变 |
| S10 降级可能留下无法理解的界面变化 | P2 | 固定几何；Recorded / Live / Paused / Still / Unavailable 五状态表，写明标记、画面与数字来源；删除 64px 成交窄条；网络统计项移除但行高不变；第二轮审查后加 Waiting 状态，20 s 从 `lastDataAt` 起算 | 第 7、10 节 | 部分（第二轮审查更正，原记「已改」）：原稿缺「等待首帧」状态，也没写 20 s 从哪里起算、哪些频道算数据；两项现已补上（第 7 节 Waiting 行，第 7、10 节的 `lastDataAt`）。原型回海报计时的偏差见第 7 节状态表下的说明 |

### 原型实测（2026-10-24 UTC，主会话）

原型 `designs/website-hero-prototype/` 按上表的决定改为第二版（README「第二版改了什么」）。用仓库的 Playwright 无头 Chromium 连接真实的 Hyperliquid 公共接口测得：

- 手机 390×844（A、B 相同）：主按钮顶边 263px，按钮到风险句 8px，窗口顶边 403px，首屏露出终端截图 383px；Live market 视图的画布顶边 593px，首屏露出 251px。第一轮为窗口顶边 613px、画布 0px、按钮到风险句 96px。
- 桌面 1440×900：A 窗口顶边 147px，两个视图的内容高 391 / 401px，画布 621×207；B 窗口顶边 437px，首屏露出截图 417px，画布 922×519。
- 录制到实时：A 桌面在 0.5、1、2、5、10、14 s 都是 `RECORDED` 与录制数值，约 16 s 交叉淡化，数值同时换成实时值（当时只淡化画布，数值在淡化开始时就已换成实时值，正是上表 V1 行记录的混用）；B 手机约 18 s 切换。减少动态效果时 22 s 后仍是海报，按 'Show live view' 才进入实时。录制阶段切到 ETH 立即离开海报。
- 单连接：BTC 90 s、SOL 与 HYPE 各 45 s，LIVE 中断 0 次，每页 1 条 WebSocket，控制台零错误；暂停时画布像素、最新价与盘口 3 s 不变。
- 断网（Playwright 离线模式）：约 6 s 后 LIVE 与实时数字消失，约 26 s 回到 `RECORDED` 海报；恢复网络后 15–20 s 重新进入实时。这里原注「第 7 节状态表下的规则」是错的：26 s 来自当时的实现（LIVE 撤下后再等 20 s，即 6 s + 20 s），不符合「20 s 没有数据」的规则，而且当时的回海报其实是硬切，不是淡化。原型按第 7 节改为从 `lastDataAt` 起算之后已重测，重测结果见下一节。
- 实测中发现并修正：非 BTC 初始市场时画布与 Pause 不显示（状态属性未初始化）；五档表拼入 `bbo` 后出现假缺口（改为只显示一帧完整快照，第 10 节）；回到海报时旧的海报元数据缺快照时间，页面抛出 'Invalid time value'（重新生成海报并加了防御）。

这些是无头浏览器的短时结果，不是真机，也不是 V2 的 24 小时浸泡。对修订稿的第二轮 GPT 审查记录在第 25 节。

## 25 第二轮外部审查（2026-10-24，追加）

运营方要求修订后再让 GPT 复审一轮。方法同第 23 节：Codex CLI 调 `gpt-6-astra`，只读沙箱、`medium`，三路并行。每路附上自己第一轮的报告并逐条复核，另附 11 张截图：第二版原型的 Terminal 与 Live market 视图（1440×900、1366×768、390×844，含录制海报与交接后的实时画面），以及第一轮原型 A 的桌面与手机首屏作对比。提示词、三份报告与截图存在本机 `.worklog/2026-10-24/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-gpt-review2/`（Git 忽略）。

| 审查路 | 第一轮 | 第二轮 | 新问题 |
| --- | --- | --- | --- |
| L 布局 | 6.7 | 7.9 | 1 个 P1（两个视图的身份说明放得太晚、手机上被截断）；3 个 P2（A 的截图尺度、A 的两栏断点、V1 判分） |
| V 视觉 | 6.6（A 6.4、B 6.8） | 7.4（A 7.1、B 7.7） | 1 个 P1（录制到实时只淡化画布）；2 个 P2（A 的截图尺度、手机的身份说明） |
| S 方案 | 6.3 | 7.2 | 3 个 P1（默认视图绕开「太传统」的验收、交接混用来源、LIVE 判定与坏帧处理）；4 个 P2（合并示例写反、验证不通过时的产物、20 s 口径与失效文案、指标命名） |

三路都没有 P0，结论一致：可以进入 V1–V3 验证包，不宜按现稿批准全面实施。L 建议以 A 为布局基础，V 建议以 B 为主方向，A/B 的选择仍由运营方定。

### 核验与处理

主会话用 Workflow 起 7 个只读代理，按主题分组对抗核验新意见（默认去证伪，逐条核对引用的行号与源码），再按结论处理：

| 意见 | 核验结论 | 处理 |
| --- | --- | --- |
| V N1、S N2 交接混用来源 | 属实：正向只有画布与海报做透明度过渡，价格、标记、坐标与盘口在海报仍可见时已换成实时值，违反 V3 的判据与原型 README 的说法；反向其实是硬切，S 说的「反向也混用」被高估 | 原型改为整幕替换（第 7 节），逐帧采样验证（见下） |
| S N3 LIVE 判定与坏帧 | 部分属实：不检查连接、坏帧计数共用（`bbo` 每帧清零深度的计数）属实；「仍为 LIVE」夸大，被拒的帧不写入状态 | 原型修正；第 10 节写入连接条件、按频道计数、只有深度停更时重订阅 |
| S N5 失效文案与 20 s 口径 | 属实：主线程从 LIVE 撤下后再等 20 s，第 24 节把 26 s 归为规则是错的 | 原型改为 Worker 的 `lastDataAt` 与 `silentMs`；状态表加 Waiting |
| L N1、V N3 身份说明 | 属实 | 原型在视图上方加常显说明与截图区域标签（第 6 节） |
| L N3 A 的两栏断点 | 属实（源码推算 1024 宽画布约 471px） | A 改为视口 ≥1200px 才两栏；绘图区比例跟随窗口宽度（第 7 节） |
| L N2、V N2 A 的截图尺度 | 属实；V 提的 900–1000px 局部裁切在 1440 采集里装不下市场名、图表、盘口与下单区；主会话在 1100–1180 宽重拍试过，终端用中等布局，盘口落到裁切线以下 | 交运营方：D22 |
| S N4 合并示例 | 属实，方向写反 | 已改（第 10 节），原型实现本来就对 |
| S N6 不通过时的产物 | 属实 | 第 19 节「验证结果与首版产物」A/B/C；V3 拆为 V3a、V3b |
| S N7 指标命名 | 部分属实：规划把文档请求叫「CTA 点击」，另列一个没有数据来源的「会话数」 | 第 16 节改名并写计数口径，删除会话数 |
| S N1 默认视图与「太传统」 | 属实 | 第 16 节 V1 加只记录、不设门槛的第二视图发现率与现站基线的成对现代感比较；D20 改为 V1 后再定；门槛交运营方，基线按第 16 节、由运营方确认 |
| L N4 V1 判分 | 属实 | 第 16 节改写（页头入口也算对、拆分「开始需要什么」、误认题的时机） |
| V V7 识别度 | 属实 | 交运营方：D23 |
| V V3 密集成交成串 | 部分属实 | 交运营方：D7 下的画法选项 |
| V V9 视图切换 | 属实 | 原型加 180 ms 不透明度过渡，切换市场也走整幕替换 |
| L L2 B 的矮屏 | 属实 | B 在视口 ≥1024 且高 ≤820 时收紧间距；窗口顶边达标，画布露出量未达标（见下） |
| V 对「一笔吃单」的质疑 | 属实：同一区块里同方向的几笔吃单也会并成一点，能区分它们的 `hash` 与 `users` 已被丢弃 | 第 7 节与原型 README 改为「显示合并，不是订单识别」 |

### 修正后的原型实测（2026-10-24 UTC，主会话）

仓库的 Playwright 无头 Chromium，连接真实的 Hyperliquid 公共接口：

- 逐帧采样：页面里每个动画帧记录数据区不透明度、海报与画布是否可见、价格与状态标记。正向（录制到实时）1,320 帧、反向（断网后回到海报）1,384 帧，没有一帧在可见状态下混用录制与实时；正向替换占 12 帧（约 200 ms）。这只证明主线程每帧的 DOM 状态与计算样式，不是合成器层的像素证据。
- 断网：约 6 s 后 LIVE 与实时数字消失，约 21 s 整幕换回 `RECORDED` 海报（规则是最后一帧有效数据后 20 s，按 1 s 采样）；第 24 节里的 26 s 是修正前的实现。
- 录制到实时：A 桌面与 B 手机在 0.5、1、2、5、10、14 s 都是 `RECORDED` 与录制数值，约 16 s 整幕替换；状态行写出最新成交的交易所时间。减少动态效果时 22 s 后仍是海报，按 'Show live view' 才进入实时。
- 版式：A、B 在 1024、1100、1200、1280、1366、1440 宽与 390×844 下两个视图的内容高度相差 ≤14px，没有横向溢出。A 在 1200 宽两栏、画布 574px，1100 / 1024 宽单列、画布 742 / 666px。手机主按钮顶边 263px、按钮到风险句 8px、窗口顶边 403px，首屏露出截图 350px，Live 视图画布露出 212px。B 在 1366×768 窗口顶边 374px（L2 目标 ≤380px，达标），Live 视图画布首屏露出 235px（L2 建议 ≥260px，本规划未采纳为目标，见第 24 节 L2 行与本节末尾的待决项）。视口 641–690px 时图例换成两行，两个视图相差约 60px，未处理。
- 单连接：BTC 90 s、SOL 与 HYPE 各 45 s，LIVE 中断 0 次，每页 1 条 WebSocket，控制台零错误；暂停时画布像素、最新价与盘口 3 s 不变。
- 修正过程中发现并修了两个回归：海报元数据缺最新成交时间时页面抛出 'Invalid time value'，海报阶段被整段跳过；交接中出现异常时数据区停在透明（改为 `finally` 里清除）。两者都已用上面的检查复测。

这些是无头浏览器的短时结果，不是真机，也不是 V2 的 24 小时浸泡；没有对修正后的版本再做第三轮外部审查。

### 待运营方决定（本轮新增或改变）

- D20：V1 之后再定默认视图与是否保留两个视图；V1 的门槛（基线按第 16 节，由运营方确认）。
- D21：截图来源（未登录实拍现货，或夹具）。
- D22：A 首屏终端截图的呈现；与 A/B 的选择一起定。
- D23：Open Book 的品牌识别标记。
- D7 之下：密集成交点的画法（(a) 细描边、小额降透明度或最小半径 1.5px；(b) 按数据空间分桶的显示聚合，见 D7）。
- B 若入选：矮屏 1366×768 下画布露出 235px 是否接受，还是继续压缩首屏。

## 26 第三轮修订：产品演示录屏与「加密之外的市场」审阅包（2026-10-25，追加）

运营方看过第二版原型后指出：首屏只有一张截图，没有动效，也没有介绍功能的区块，并参照 hyperliquid.xyz（首屏是两段循环视频加实时行情条，调研第 4 节）；随后要求做产品演示视频，并另做一版「加密之外的市场」视频与区块草稿，只供律师审阅、不上线。

### 产品演示录屏（已做，原型）

- 首屏 Terminal 视图改为真实终端录屏（第 6 节），录制管线与守卫见第 9 节，体积见第 13 节，播放规则见第 6、8 节与 A9。
- 原型实测（2026-10-25，Playwright 无头 Chromium）：第一次录制桌面 15.5 s、手机 8 s（守卫只在 Node 端每 400 ms 与每步之后检查，审查指出两次检查之间的短暂画面没人看过）；按审查修过守卫与录制器后重录，桌面 18.25 s，页面内检查 907 次、Node 端 57 次，手机 7.46 s，页面内 450 次、Node 端 194 次，全部通过；收尾修复（括号单位标签规则与第四处例外、构建标识、读取页面内守卫前先等一个动画帧）后第三次录制：第一次尝试在桌面因「页面内守卫在最后一次通过的检查之前停止」被拒、没有写出视频（读数时序问题，已修），重试后桌面 17.55 s（视频 17.53 s），页面内 766 次、Node 端 55 次，手机 7.44 s，页面内 443 次、Node 端 201 次，全部通过，报告记录了线上终端构建 `cloudfront-2026-10-14-p32`（commit `9ccb88c0`）；页面里桌面加载 AV1 WebM、手机加载手机版，暂停按钮可用，切到 Live market 视图时自动暂停，减少动态时不加载、只显示海报，控制台零错误。
- 录屏画面的价格是录制时的实时数据；每次发布重录，说明行写录制日期。
- 没有做：整页其余区块（第 02–07 区块）还没有做成原型；视频的真机播放、Safari 与 iOS 低电量模式未测。
- 生产版还要补的（2026-10-25 收尾验证指出；第 6、7、9、13、14、16 节的规划文字已按此改写，原型已做到无 JS 静态海报与构建标识）：海报改为 AVIF/WebP 并按第 13 节重测（原型是约 146 / 75 KB 的首帧 JPEG）；没有 JS 时显示静态海报（第 7 节回退阶梯第 3 条，原型用 `<picture>` 实现）；录屏与截图的清单都记录终端构建标识（第 9 节，原型已记录）；桌面录屏是 1 倍像素（第 6 节），D22 与 B 版的清晰度要按它复核；身份说明与无障碍文字分清录屏与截图回退（第 9、14 节）；V1 加录屏误解题（第 16 节）。

### 「加密之外的市场」审阅包（只供律师，D24）

- 审阅文档：[docs/marketing/beyond-crypto-review.md](marketing/beyond-crypto-review.md)（问题清单、事实底稿与来源、英文文案草稿与主张对照、两版视频字幕）。
- 设计部分：`designs/beyond-crypto-review/`：区块草稿页（主要元素旁标出对应的问题编号；表格只有 SNDK、NBIS、ANTH、OAI 四个挑出的示例，不是完整清单；价格与成交额两列默认隐藏）、通用版视频（15 s，不出现公司名与价格）、命名版视频（18 s，加市场代码、部署方给的公司名与部署方的说法；没有第三方 Logo、价格与杠杆倍数，左上角有 Sairn 字标）、终端现状截图（含杠杆徽标与部署方风险声明弹窗，标注「产品原样，不是营销材料」）。
- 与本规划的冲突：第 5 节首页市场区「不放 HIP-3 股票」、阶段 0 删除现站的股票永续内容、计划中的 copy-contract 禁用模式。审阅包不改变这些决定；律师书面意见与运营方决定（D24）之前，它们继续有效。
- 主要事实（来源在审阅文档）：这些市场由第三方部署方运营（截图里的 `io` 是 EntropyIO，运营方 Bursa Global Inc.；`xyz` 是 trade[XYZ]）；上市股票类合约参考公开股价，休市时按部署方的内部规则定价；OpenAI、Anthropic 是未上市公司，EntropyIO 按其文档所述方法以公司市值（EntropyIO 的说法）报价（价格 1 代表 10 亿美元市值；EntropyIO 给的理由是私募轮次的股数不确定；上市后仍按市值报价，因为 Hyperliquid HIP-3 还不支持拆股；评分标准（时效、深度、历史可靠性）公开，评分与聚合程序是内部的，聚合结果由 RedStone 上链），未上市满 2 年到期结算，其文档对结算均价的窗口前后矛盾；持有合约不是持有股票。
