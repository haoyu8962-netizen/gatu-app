# 官网重建规划

状态：拟议（未批准）。日期：2026-10-24。范围：营销官网 `apps/website`（https://sairn.ai）的内容、信息架构、视觉与动效、实时数据、技术栈、本地化、衡量、安全响应头、合规闸门与分阶段实施；不改终端 `apps/terminal` 的行为。

- 依据：[官网行业调研（2026-10）](website-industry-research-2026-10.md)（下称「调研」）；同日由工作流生成的三个设计方向与三份评审（转化与品牌、工程、合规与无障碍），由 Agent 完成，本文第 4 节记录其结论与取舍。
- 任务记录：[官网行业调研与重建规划](work-memory/sessions/2026-10-24-website-research-and-rebuild-plan.md)，写明原始需求、方法、证据位置、评分与取舍和未决项。调研的原始证据（`research-web.json`、`research-digest.md`、Playwright 的 JSON 输出与采集脚本）脱敏后复制在本机 Git 忽略的 `.worklog/2026-10-24/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-website-research/`，不进远端。三个方向与三份评审的原文**未取得**：写记录时会话的临时目录与任务输出目录里都没有它们，第 4 节的评分（7.5、6、8 等）只能追溯到本文与任务记录，不能追溯到原文。
- 本文不是实施记录，也不是法律意见。文中所有英文与日文文案都是草稿，需要运营方确认；面向日本的一切内容还需要日本律师的书面意见。
- 本文没有改动任何代码，也没有运行任何测试；第 9 节的色差与对比度是 Agent 按 sRGB（D65）计算的 CIE76 ΔE 与 WCAG 对比度，未经设计方复核。
- 关联：[日本用户营销邮件](marketing/jp-launch-email/README.md) §1 闸门 1（官网与邮件的矛盾）、§5「刻意不写的卖点」、§6 转化率方案；[ADR 0042](adr/0042-japan-allowed-trading-region.md)（未发布）；[ADR 0028](adr/0028-brand-accent-colors.md)；[品牌迁移计划](brand-migration-plan.md) D2、D5 与 D12 的动效子项 (h)；[品牌标识与素材](brand-assets.md)；[官网 README](../apps/website/README.md)；[官网发布手册](../deploy/website/README.md)。

## 1 背景

- 运营方认为现官网「太传统」，希望用现代前端与加密原生的技术重做。
- 现官网（调研第 8 节）：Astro 5.14.6 静态站，参照 midday.ai 的单列布局，Instrument Serif 大标题配静态截图；没有标志性动效，也没有市场原生的内容。调研把这种形式认定为「传统感」的来源。现站很轻：HTML 13.8 KB、CSS 7.2 KB、没有外部 JS。
- 现站仍写着 No KYC、'Connected · 12ms'、'each market's full leverage'、xyz: 股票与 JP225 行情，截图里有 40x、10x，还点名交易所品牌钱包。日本营销邮件把 `https://sairn.ai` 列为「正規のURL」，这些内容因此进入了闸门 1 的律师问题。
- 日本交易（ADR 0042）未发布，等待日本法律意见。

## 2 目标与非目标

### 目标

1. 第一屏展示真实的产品与真实的 Hyperliquid 市场，而不是描述它们；五秒内让访客知道 Sairn 是什么、在哪里交易、怎样开始。
2. 每个数字都有来源与时间，数据不可信时不显示（fail closed），绝不出现 '...'、'—'、'NaN'、'$0'、'Loading' 这类占位当作事实。
3. 视觉上与 Hyperliquid 官方站明确区分，并在首屏写明 Sairn 是独立界面。
4. 每条主张都能用仓库或条款证明，并由测试钉住；风险句紧贴每一个进入应用的按钮。
5. 页面轻：手机首屏交互前 ≤250 KB。调研中同行首页的单次加载为 0.76–12.6 MB（桌面 1440 宽、不限速、只算首屏加载，不含滚动与视频播完，口径不一，见调研第 3 节与第 4 节第 8 条）；那不是手机首屏交互前的数字，所以本规划不写「轻一个数量级」之类的比较。
6. 服务存款这一步，而不只是点击：首个英文版本就带 Arbitrum USDC 存款指南。
7. 在现行隐私政策下可衡量转化；需要改政策的手段明确列出，不默认采用。
8. 日语页按日本惯例原生撰写、预先建好，闸门满足前不上线。

### 非目标

- 不改终端的界面、签名、资金或地区规则；终端没有日语界面这件事不在本规划内。
- 不加分析 SDK、像素、热图、A/B 工具、广告 Cookie、第三方嵌入，也不由官网自己实现表单或新闻订阅。日本邮件依赖 sairn.ai 的订阅同意入口、退订路径与追踪子域，处理见第 18 节「日本邮件依赖的 sairn.ai 能力」与决定 D19。
- 不加后端、SSR 或 API 路由；数据只来自浏览器直连 Hyperliquid 公共接口，或构建时的结构快照。若 D19 决定在 sairn.ai 主机名下放 ESP 托管的同意或退订页面，那是运营方在 CloudFront 上把指定子路径路由到 ESP 源站，官网构建本身仍不含后端。
- 不展示 Sairn 自己的用户数、成交量、审计、投资人或状态徽标（这些都不存在）。
- 不做营销视频、3D 场景、滚动劫持或粒子背景。
- 不在本规划里改法律文本；`legal/*.md` 的任何改动另需律师书面确认。

## 3 受众与核心信息

### 受众（按优先级）

1. 已在用或正在考虑 Hyperliquid 的交易者：要一个快速、非托管、费用清楚的网页终端。
2. 没有自托管钱包的加密用户：可以用邮箱开始，Privy 为该账户创建钱包，由它签名（调研：Uniswap 用 Privy 做 'Create account'，Privy 把 Hyperliquid 列为客户，说明这种入口已经主流）。这是相对「先连钱包」的同行最清楚的差异。
3. 日语用户：只在律师对闸门 1、2 的书面批准之后（[邮件 README](marketing/jp-launch-email/README.md) §1）。

### 核心信息

- 一句话：Sairn 是 Hyperliquid 永续与现货的独立网页终端，可以用邮箱或自己的钱包登录，资金留在自己的 Hyperliquid 地址。
- 品牌口号 'See the market clearly. Decide for yourself.' 保留，但不作 H1：首屏的实时市场让「看清」成立，可证明的签名与托管事实让「自己决定」成立。

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

### 选定：Open Book 为底，嫁接另两个方向的部件

两份评审选 Open Book，工程评审选 Live Window。本规划以 Open Book 为底，按三份评审的嫁接清单与必改项调整：

- **来自 Live Window**：
  - 首屏放可辨认的终端元素：价格条、24h 迷你走势、前五档盘口，用终端的表面色与订单簿令牌；
  - 主按钮的名称与链接跟随所选市场；
  - 结构快照让构建保持离线、可复现；
  - 截图采集管线带 DOM 内容守卫；
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
| Live Window 整体 | 品牌没有辨识度（石墨底、薄荷只用于焦点）；全屏点阵着色器是 Hyperliquid 自己的插画语言（粒子、点阵），放在文字背后还违反前庭安全；H1 'Hyperliquid's order book, in your own account.' 用所有格，暗示归属；构建快照超过 6 小时就被 JS 清空，几乎每个访客都会看到数字先出现再变空 |
| Plain Sight 整体 | 不满足运营方「不要传统」的要求：编号小节、细线与脚注边栏正是要离开的编辑风；paper #F5F4EE（C*ab 3.1）与 Hyperliquid 的 #f8f9f9（C*ab 0.4）同为近白中性色，按第 9 节规则第 3 条它们之间的 ΔE 没有意义，问题在于浅色编辑页本身正是 Hyperliquid 2026-08 改版的样子；把琥珀色当界面强调色与 ADR 0028 决策 6 冲突；浅色营销站进入深色终端会断开；`?ref=` 参数读起来像推荐计划 |
| Open Book 原稿里的琥珀「决策线」 | ADR 0028 测得琥珀与警告色 ΔE 只有 3.9，且 Logo 颜色不是界面强调色；动效令牌里琥珀还是 `pending` 色。默认改用中性墨色线，用琥珀需要先修订 ADR 0028（决定 D5） |
| Open Book 原稿的青色热度梯度（#0F1A1F → #2B5055 → #A5BFBC → #F4F8F4） | #2B5055 与 Hyper Foundation 的 #23524C ΔE76 只有 8.3；青色光场叠在青黑底上，呼应 Hyperliquid 的「深绿底上的薄荷粒子」。改为中性灰梯度（第 7 节） |
| WebGL2 主渲染器与两个渲染器之间的像素比对测试 | 工程评审：首屏核心用 Canvas 2D 按数据事件重绘即可；双渲染器加倍维护，无头 SwiftShader 下的像素比对容易不稳。WebGL2 只在实测证明需要时再加（第 7 节） |
| 点击 CTA 时把窗口「展开」到全屏再进入终端 | 合规评审：点击触发的全视口缩放属于前庭触发；工程评审：要处理修饰键、中键、bfcache 恢复，换来的只是装饰。连续性改由颜色承担：首屏窗口与终端启动画面同为 #0F1A1F |
| 把带日期的价格快照烘焙进 HTML | 发布靠手工，HTML 里的价格可能是几周前的；工程与合规评审都要求只提交结构快照。爬虫与无 JS 访客看到的是静态主张与标明 'Recorded' 的海报 |
| 页面级暂停偏好写进 localStorage | Cookie 政策只覆盖 app.sairn.ai；在它覆盖 sairn.ai 之前，官网不写任何浏览器存储 |
| 以「每周首次出现的交易地址」为北极星指标 | 需要保存地址历史，隐私政策 §3 没有这种用途；改用聚合总量，地址级指标等政策更新与法律审阅 |
| 首屏全宽画布放在文字背后、Pause 偏好跨页记忆、`deviceMemory` 门控 | 前庭安全与可读性；存储同上；Safari 没有 `deviceMemory` |

### 评审必改项的处理

编号 C 为转化与品牌评审，E 为工程评审，A 为合规与无障碍评审。

| 编号 | 必改项 | 处理 | 位置 |
| --- | --- | --- | --- |
| C1 | H1 改成具体的价值主张，口号移走，做五秒测试 | 采用；口号改作眉标题 | 第 6 节；阶段 2 验收 |
| C2 | 热度梯度去青色；仿冒检查改为最小色差 | 采用中性灰梯度；有色相的颜色要求 ΔE76 ≥15，近黑近白的中性色豁免（理由见第 9 节） | 第 7、9 节 |
| C3 | 修冷启动的空画布 | 用一次盘口快照与 `recentTrades` 播种，时间轴随数据增长，不把录制数据和实时数据拼进同一帧 | 第 7 节 |
| C4 | 画布加一行图例与说明，注明是官网视图而非终端功能 | 采用 | 第 6、7 节 |
| C5 | 服务存款这一步 | 首个英文版本带存款指南、按钮组里的「需要 Arbitrum 上的 USDC」一行与三步开始 | 第 5 节；阶段 2 |
| C6 | 日本邮件发送前先修正英文站主张 | 阶段 0，含 Hero 与 Footer 两处 CTA 的风险句；邮件闸门 1 已列官网矛盾问题，是否把「阶段 0 已上线」设为硬性发送条件由运营方定 | 第 19 节；决定 D1、D18 |
| C7 | 用琥珀前先修订 ADR 0028，并记录品牌迁移计划 D5 与 D12 (h) | 默认不用琥珀；三项都列为待决 | 第 9、21 节 |
| C8 | 明确复杂度的止损线 | 先发静态版加海报；实时层在开关后，未过真机检查或预算就保持关闭 | 第 19 节阶段 3 |
| C9 | 首屏附近不用终端术语 | 'Agent'、'Stay Connected' 只出现在 `/how-it-works/` | 第 5、6 节 |
| C10 | 衡量的前提列为运营方操作 | CloudFront 日志、统一 UTM、上线前先取基线 | 第 16 节；阶段 1 |
| C11 | 日本全程受闸门约束 | 默认关闭的构建开关等 | 第 12、18 节 |
| C12 | 申请 Hyperliquid `/apps` 收录 | 与开发并行，由运营方提交 | 第 15 节；决定 D12 |
| E1 | 不把易变数值烘焙进 HTML；只提交结构快照 | 采用；刷新快照与主张检查是发布手册步骤，不在 CI 里联网 | 第 10 节 |
| E2 | 先测量再定预算；不订阅 `allMids` 流；手机走轻量路径 | 阶段 1 测量；卡片用逐币 `activeAssetCtx`；手机的一行最优买卖价用 WebSocket `bbo`，不轮询 REST；REST 权重按路径设上限，由调速器执行 | 第 10 节 |
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
| E16 | 更新发布手册：快照与主张检查、重拍截图与海报、删除下架市场页、真机记录 | 采用 | 第 19 节各阶段交付物 |
| A1 | 英文站风险主张现在就删，删除不必等律师 | 阶段 0；发布由运营方批准，律师收到改动对照 | 第 19 节；决定 D1 |
| A2 | 日语禁用词表禁的是登记类主张，不是「登録」这个词 | 采用；禁用清单放在 `tests/`，因为 copy-contract 会扫描 `src` 下所有文本 | 第 12 节 |
| A3 | 凡链到 app.sairn.ai 的都算 CTA；日语页每个都要配风险句，否则去掉；英文首屏、结尾与市场卡组配 14px 以上正文色风险句 | 采用；英文只有页头页脚导航列入豁免清单；现站 Hero、Footer 与 404 的 CTA 风险句提前到阶段 0 | 第 6、18、19 节 |
| A4 | 写明律师意见必须覆盖的范围，并规划「律师不同意」的分支 | 采用 | 第 18 节 |
| A5 | 第一版日语只上 `/ja/` 与 `/ja/deposit/`，实时数据只有 BTC、ETH 的美元价格 | 采用；「100以上の無期限先物」是由结构快照检查保证的静态主张，不是实时数字（第 12 节同一口径） | 第 12 节 |
| A6 | 每条主张精确可证 | 见第 3 节「不写的内容」 | 第 3 节 |
| A7 | 截图只用夹具数据并标注；海报永远写 'Recorded' | 采用 | 第 7、9 节 |
| A8 | 画布上的文字要有不透明底板，并测对比度 | 文字一律放在不透明底板上，不叠在光场上 | 第 6、7 节 |
| A9 | 不在文字背后放全宽动效，不做点击触发的全视口缩放，不自动播放视频；页面级暂停 | 采用 | 第 8、14 节 |
| A10 | sairn.ai 不写 Cookie 与 localStorage；只用 `utm_*`；日志短期保存；只用聚合数据；主机白名单测试 | 采用；暂停状态只存在内存 | 第 8、16 节 |
| A11 | 日语排版细节：※ 紧跟主张、OFL 保留名核对、签字记录 | 采用；保留名的结论取决于子集的源文件出自哪里 | 第 12 节 |

## 5 信息架构

本站顺序对应调研第 4 节第 14 条「信息架构与转化路径」里交易所一段的惯例（首屏 → 实时市场条 → 三支柱 → 分项特性 → 3 步 → 安全 → FAQ → 结尾 CTA → 风险），首屏用永续 DEX 的公式（4–8 个词的主张、一句副标题、一个主 CTA），并借用 Hyperliquid 前端的深链与槽位 UTM、桌面二维码转手机。偏离之处与原因：

- 没有 Logo 条、投资人、用户数或审计徽标：这些都不存在（第 2 节非目标）；
- 首屏没有交易所式的内联邮箱注册：官网没有后端，注册在终端的连接窗口里完成，CTA 直接深链到 `/trade/BTC`；
- 证明条放 Hyperliquid 的网络数字并标明来源，不放 Sairn 自己的数字；
- 没有产品站的更新日志与公告条在首版首页上，二者随 `/changelog/` 在阶段 5 加入。

### 首页 `/`（英文）

| 序号 | 区块 | 作用与内容 |
| --- | --- | --- |
| 01 | 跳转链接与官方网址一行 | 纯文本，不是链接（链到 app.sairn.ai 就成了 A3 意义上的 CTA，会让风险相邻测试失败）：'Official addresses: <apex> · <www> · <app>'，从 `brand.json` 的 `domains.primary` 读取（`www.sairn.ai` 也直接返回 200，见[官网发布手册](../deploy/website/README.md)），是否列 `testnet` 由运营方定；不写「只」。只放在首页与 `/ja/` 顶部，其他页在页脚列出，避免每页重复朗读。测试断言该行不含 `<a>` |
| 02 | 页头 | 横版 Logo（≥24px）；锚点 Markets、How it works、Fees、Security、FAQ；`/ja/` 上线后才出现的 EN \| 日本語 链接（不自动跳转）；`bg-action` 的 'Open terminal'，链到 `/trade/BTC` 并带 `utm_content=header` |
| 03 | 首屏 | 见第 6 节 |
| 04 | 实时证明条「Hyperliquid, right now」 | 实时卡：主场所未下架永续数量；主场所 24h 永续名义成交额（Σ `Big(dayNtlVlm)`，`dayNtlVlm` 已是美元名义值）与持仓量（Σ `Big(openInterest).times(markPx)`：`openInterest` 是基础币数量，不是美元，同终端的 `getOiUsd`；只对未下架项求和，任一项 `markPx` 缺失或为 0 时整张卡 fail closed），都用 Big.js 求和、向下取整。静态卡（契约测试钉住）：0.01% builder fee；taker 0.055% / maker 0.025%（含 builder fee）。每张实时卡写来源与更新时间，附「How we compute this」说明。验证不通过的卡直接移除，条高不变 |
| 05 | 市场 | BTC、ETH、SOL、HYPE 四张主场所永续卡：实时标记价、24h 涨跌（带符号与 ▲▼）、手绘 24h SVG 走势；各自深链 `/trade/:symbol` 并带独立 `utm_content`；卡组配风险句；一行说明现货在同一界面交易。不放 HIP-3 股票、指数、金属或 JP225。替代悬停才暂停的跑马灯 |
| 06 | 三步开始 | 用邮箱或钱包登录 → 存入 Arbitrum 上的 USDC（链到存款指南） → 下第一单；每步一句话加一张截图裁切，不写耗时承诺 |
| 07 | 订单怎样流转（Fig. 1） | 四个节点：浏览器 → 你的签名（邮箱：Privy 为账户创建的钱包；外部钱包：你批准的交易密钥） → Hyperliquid 订单簿 → 在你自己的 Hyperliquid 地址结算。Sairn 的方框只标「界面 + builder fee」。标明「Illustration」，不显示他人订单；节点只用 `brand/loader/glyphs/mono/` 的状态符号（`currentColor`，颜色由官网令牌决定），不用 `on-dark/`：其中 `pending.svg`、`unknown.svg`、`wallet.svg` 含琥珀 #E6B766，动效令牌 on-dark 的 surface 是品牌青 #0A3038（C*ab 13.3，与 #03211c 的 ΔE76 只有 12.0），会把琥珀与青色带进标志图形（违反本规划 D5 的默认、ADR 0028 决策 6 与仿冒防护第 2 条） |
| 08 | 终端内部 | 吸顶的设备框随滚动换四屏：图表与订单簿；订单类型（市价、限价、TP/SL、TWAP、Scale，不写 TWAP 参数）；同屏的持仓与现货；手机与 PWA。截图来自采集管线，AVIF/WebP，经 Astro `<Picture>`；不支持滚动时间线时是普通的纵向排列 |
| 09 | 两种进入方式 | 邮箱与钱包各一句事实、各一个 CTA（同链到 `/trade/BTC`，`utm_content` 不同，配风险句）；桌面二维码在此处给手机与 PWA |
| 10 | 费用 | 永续合计 taker 0.055% / maker 0.025%，配分解条：Hyperliquid 基础 0.045 / 0.015 加 0.01% builder fee；现货 'builder fee on sells only'；'TWAP orders carry no builder fee'；HIP-3 场所可能另定费率；注明日期。数字由现有 copy-contract 钉在 `config/hyperliquid.ts` |
| 11 | 记录在案（信任清单） | 编号清单，每条带 ※ 链到证据：托管（条款 §1.3）；签名（第 3 节的三条签名主张）；费用（builder fee 与核对方式，核对路径实施时按 Hyperliquid 文档写）；数据去向（浏览器直连 `api.hyperliquid.xyz`，不加分析工具）；独立声明（条款 §1.1）；官方网址（纯文本）；'We will never ask for your private key, seed phrase, verification code or password'（第 3 节登记表）；文档、支持与风险披露链接。没有审计、投资人、用户数或状态徽标 |
| 12 | FAQ | 继续由 `config/faq.ts` 同时生成页面与 FAQPage 结构化数据。删掉 'There's no KYC'，改为条款 §2 的资格说明；删掉股票问答 'Can I really trade stocks here?'；删掉市场问答里的 HIP-3 品类（'equity, index, and metal perps'）与 'New markets appear automatically'；把杠杆问答 'What's the max leverage?' 改为风险与保证金说明（FAQ 里本来没有杠杆数字，有的是这两条问答）；删掉交易所钱包名；'Orders are signed with your keys' 按登录方式改写，'gas-sponsored deposits' 改为 'deposit transactions'；保留 'TWAP orders and spot buys carry none'。新增：Who holds my funds?、What does a trade cost?、What do I need to deposit?、Where does the live data come from?、Why might a number not show?、Is this investment advice?。区域与代理拦截的问答措辞交律师 |
| 13 | 结尾 CTA 与风险摘要 | 'Start trading' 配同一风险句，下接风险摘要，链到 `/risk`（由 `legal/riskDisclosure.md` 渲染） |
| 14 | 页脚 | `brand.json` 的法律实体 Sairn Corp.；`/terms`、`/privacy`、`/risk`、`/support`；官方网址；页面级 'Pause live data'；语言链接（`/ja/` 上线后）；'Not financial advice'；构建时计算的版权年份与构建日期。品牌迁移计划 D2 提供账号前不放社交链接 |

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

### 英文首屏（文案均为草稿）

桌面（≥1024px，12 列网格，最大宽度 1280）：

- **左 5 列**：
  - 可选的公告条（仅英文，带日期，来自 `config/announcement.ts`，链到 `/changelog/`）。
  - 眉标题（IBM Plex Mono 12px，`text-fg-muted`）：'See the market clearly. Decide for yourself.'
  - H1（IBM Plex Sans 500，64/68，字距 -0.02em）：'Trade Hyperliquid perps and spot from an independent web terminal.' H1 在静态 HTML 里，是 LCP 元素，从不为入场动画隐藏。
  - 副标题（18/28，`text-fg-muted`）：'Sign in with email or connect your own wallet. {BRAND_NAME} never holds your funds; they stay at your own Hyperliquid address.'
  - CTA 组（`data-cta-group`）：
    - 主按钮 `bg-action` / `text-on-action`（`--action` 保持中性，ADR 0028），名称与链接跟随所选市场：'Trade BTC' → `{APP_URL}/trade/BTC?utm_source=website&utm_medium=site&utm_campaign=en_home&utm_content=hero_cta_btc`（`APP_URL` 来自 `config/brand.ts`，不写域名字面量；命名与透传规则见第 16 节）；
    - 次级链接 'No wallet yet? Start with email'，同一路由，`utm_content=hero_email`；终端连接窗口里有 'Log in with Email'；
    - 「需要什么」一行：'To deposit, you need USDC on Arbitrum. Deposit guide →'；
    - 风险句（`data-risk-note`，14px，正文色，不用淡色）：'Perpetual futures use leverage. You can lose all of your margin. Risk disclosure →'；
    - 仅桌面：'Open on your phone' 弹层（Popover API），构建时用 qrcode 1.5.3 生成内联 SVG 二维码，指向同一链接。
  - 小字（Plex Mono 12px）：'Non-custodial · Email or wallet · 0.01% builder fee · Independent interface: not Hyperliquid Corp. or the Hyper Foundation'（'endorsed' 等证据，第 3 节）。
- **右 7 列：Live Window**。一个用终端表面色（#0F1A1F、浮层 #212d33、`--orderbook-*`、涨跌色）绘制的产品窗口，最小高度 440px，内部分区，文字一律放在不透明底板上：
  - 顶栏：市场标签 BTC · ETH · SOL · HYPE（`role=tablist`，方向键切换；只显示当前 `meta` 里存在且未下架的市场）；'LIVE · Hyperliquid' 标记（只在数据有效时出现，见第 10 节）；Pause 按钮（`aria-pressed`）。
  - 价格条：最新成交价（NumberFlow）与 24h 涨跌（涨跌色加符号与 ▲▼，不用薄荷）；24h 迷你走势（手绘 SVG，数据来自 `candleSnapshot`）。
  - 主区：Open Book 画布（第 7 节），上方一行图例：'Brighter = more resting orders · ● buy ○ sell = trades · line = mid price'。
  - 右侧或底部：前五档买卖盘（`role=table`，有表头与 caption，Plex Mono 12px，订单簿令牌），显示协议原始字符串；行不可点击，避免让人以为能在官网下单。
  - 窗口下方说明：'Hyperliquid BTC-USD perpetual, live from the public API. A website view of public market data, not a terminal feature. Not a recommendation.'
- **手机（≤640px）**：
  - 顺序：眉标题、H1（40/44）、副标题、全宽 CTA 组（含风险句与「需要什么」）、Live Window 窄版；
  - 窄版：标签横向滚动，一行最优买卖价（WebSocket `bbo`，不轮询 REST）代替五档，保留 LIVE 标记与 Pause，画布高 56vw（至少 220px），没有二维码。
- **首屏性能**：
  - 预加载 Plex Sans 拉丁子集，用 Astro 6 Fonts API 生成的回退度量，换字不引起重排（D9 不同意升级时的备选见阶段 2）；
  - 画布区先显示 ≤45 KB 的 AVIF 海报，写明宽高；海报的说明文字是 'Recorded <date> UTC'；
  - 只有副标题、CTA 与窗口在 400 ms 内淡入，H1 不参与。
- **删除**：'No KYC'、'Live on mainnet' 状态点、'Connected · 12ms'、'each market's full leverage'、假浏览器框与旧截图。

### `/ja/` 首屏（待律师与母语审阅）

- 眉标题「Hyperliquid向けの取引ツール」。H1「運営会社に資産を預けずに、Hyperliquidで取引を。」（BudouX 断句，`palt`）。
- 副标题取自已核对证据的邮件第 4 版：「BTC・ETHをはじめHyperliquidの100以上の無期限先物を、24時間取引できます。メールアドレスで登録できます。」
- CTA「取引を始める」→ `/trade/BTC`，默认 `utm_campaign=ja_home`；从邮件进入时透传邮件的 `utm_campaign=jp_2026_trust`（第 16 节）。正下方先是 15px 粗体、正文色的「※無期限先物はレバレッジを伴う取引で、証拠金の全額を失うおそれがあります。」，再下是 13px 的「※取引画面は英語表示です。ご利用の通信環境によっては、注文・入金・出金をご利用いただけない場合があります。」
- 没有 Open Book 画布与盘口。实时数据只有 BTC、ETH 的美元价格（24h 涨跌要律师同意才显示），说明写「Hyperliquidの公開データ」与 `hh:mm:ss JST`。
- 是否放一张夹具数据的终端截图（标「※画面はイメージです」）由律师意见决定。

## 7 标志性视觉：Open Book

### 画什么

- 一个 Hyperliquid 永续（默认 BTC）的「时间 × 价格」流动性画面：
  - 横轴：桌面最近 120 s，手机 60 s，右端是「现在」；
  - 纵轴：中间价附近的价格；
  - 中间价离开中央区域时，纵轴按离散步长重新居中，最多每 10 s 一次，不做动画缩放。
- 第 1 层，挂单流动性：
  - 每次盘口快照加一列，每档挂单量用对数映射到亮度，按滚动 95 百分位归一化；
  - 颜色是中性灰梯度（色度 C*ab < 8，草案取值实施时由测试计算），买卖两侧最多带终端 15% 深度填充那样的色调。
- 第 2 层，成交：
  - 在（时间，价格）处画点，半径与 √名义金额成正比，限制在 2–14 px；
  - 买单是 `--orderbook-price-bid` 实心点，卖单是 `--orderbook-price-ask` 空心环，方向同时由形状表达；
  - 新成交只脉冲一次，400 ms（品牌 `feedback` 时长），每帧最多 8 个新脉冲。
- 第 3 层，中间价轨迹：中性墨色细线（第 9 节；用琥珀需决定 D5）。悬停时出现中性十字线，DOM 提示框显示最近一笔成交的协议原文，例如 'Buy 0.0150 BTC @ 67,012 · 21:03:11 UTC'。
- 盘口只从访客到达时开始画，不回填历史；切换标签时清空全部缓冲区，就像终端在身份变化时重置。

### 冷启动

到达时先用一次 REST `l2Book` 快照画出最右侧的当前深度列，并用 `recentTrades` 在窗口内播种成交点；时间轴宽度是 max(已过时间, 15 s)，随数据增长到 120 s，所以第一帧就有内容。录制的海报数据与实时数据绝不拼进同一帧：从海报切到实时是整体淡入切换。

### 怎样构建

- Astro `<script>` 注册 `<sairn-open-book>` 自定义元素（不用 UI 框架）。它先做特性检测，再调用 `canvas.transferControlToOffscreen()`，启动模块 Worker：`new Worker(new URL('./open-book.worker.ts', import.meta.url), { type: 'module' })`。
- Worker 持有 WebSocket、校验、场景模型与渲染。渲染器是 Canvas 2D：
  - 收到新数据时才重绘，按动画帧合并；
  - 上限桌面 30 fps、手机 20 fps，DPR 桌面 ≤1.5、手机 1，渲染分辨率 ≤1.2 MP；
  - 用 `putImageData` 写新列、`drawImage` 滚动，成交点最多 1500 个；
  - 颜色启动时用 `getComputedStyle` 从 CSS 变量读一次，令牌仍是唯一来源。
- 主线程只更新 DOM 片段（标签、盘口表、标记、提示框、NumberFlow 数字），按 Worker 发来的显示字符串，≤4 Hz。
- 离屏（IntersectionObserver）、页面隐藏、按下 Pause 时停止绘制。
- WebGL2 不在首版：只有当阶段 1 的测量证明 Canvas 2D 在目标设备上达不到预算，并有人在真机上验证后，才在同一 Worker 里加 WebGL2（`failIfMajorPerformanceCaveat: true`、`powerPreference: 'low-power'`，拆卸时 `WEBGL_lose_context`），那时再加两个渲染器的比对测试。

### 回退阶梯（自动）

1. Worker 里的 Canvas 2D 实时画面。
2. 只看成交的窄条：数据调速器（第 10 节）降级到只订阅成交时，画面换成 64px 高的成交打印条，每笔成交一条竖线，在基线上方是买、下方是卖。
3. 海报（标 'Recorded <date> UTC'），出现于以下任一情况：
   - 没有 OffscreenCanvas（为保护 INP，绝不在主线程渲染）；
   - `prefers-reduced-motion: reduce`（提供 'Show live view' 按钮让访客自行开启）；
   - Save-Data，或 `effectiveType` 为 2g、slow-2g；
   - `prefers-contrast: more`；
   - 数据未通过校验。
4. 没有 JS：海报加文字。

### 海报管线（生成文件）

1. `apps/website/scripts/record-market.mjs`（官网的脚本统一放在 `apps/website/scripts/`，该目录现在还不存在）从公共 WebSocket 录 120 s 的真实 BTC 成交与盘口快照，写入 `apps/website/src/data/recorded/<coin>-<utc>.json`，记录来源、起止 UTC 与 SHA-256。成交只保留 `coin`、`side`、`px`、`sz`、`time`、`tid`，丢弃 `users`（买卖双方地址，`@nktkas/hyperliquid` 0.33.3 的 `recentTrades.d.ts` 第 41–42 行写明了这个字段）与 `hash`，不把第三方地址提交进仓库。schema 测试断言 `src/data/recorded/**` 与 `market-structure.json` 里没有 `/0x[0-9a-fA-F]{40}/`。
2. `pnpm --filter @sairn/website poster:render` 在 Playwright Chromium（`@playwright/test` 1.59.1）里用同一个渲染器渲染这份数据，输出三种宽度的 AVIF/WebP 到 `src/assets`，文件名带内容哈希。
3. 说明文字的日期从 JSON 旁注读取，测试校验两者一致；海报永远写 'Recorded'，不写 'Live'。这些是生成文件，不手改。

### 测试

- `node --test`：校验器、场景分箱、字符串格式化；校验器的输出与 Worker 发往主线程的消息里不含 `users`、`hash` 或任何 `0x` 加 40 位十六进制的地址。
- Playwright `page.routeWebSocket` 故障矩阵：正常、盘口交叉、过期、畸形字符串、币种不符、断线、成交暴涨。每种故障下 LIVE 标记都不出现、改显示海报，实时区域里不出现 '...'、'—'、'NaN'、'Loading'、'$0'。
- 文字与底板：断言 Live Window 里所有文字节点的背景底板计算后不透明度为 1、对比度 ≥4.5:1，且没有文字框与画布区相交（提示框也在不透明底板上）。
- 减少动态模拟下，Worker 的渲染帧数为 0。
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
  - 终端内部一节的吸顶设备框用 `view-timeline` 加 `timeline-scope` 交叉淡化屏幕；不支持时是纵向排列。
  - FAQ 的 `<details>` 用 `interpolate-size: allow-keywords` 与 `::details-content` 渐进增强。
  - 站内页面之间用原生跨文档 View Transitions：`@view-transition { navigation: auto }`，根元素交叉淡化 ≤250 ms，页头用 `view-transition-name` 保持不动。Chrome 126、Safari 18.2 支持；Firefox 退化为普通导航。不用 Astro `ClientRouter`：它改变脚本生命周期，WebSocket 要重新初始化。
  - 同文档 `document.startViewTransition` 只用于首屏标签切换，≤200 ms。
- **第 2 层，延迟加载的 JS**：
  - Open Book（Worker，按事件重绘）；
  - 实时数字用 NumberFlow 0.6.2 滚动：首次渲染不滚；同一数值每 2 s 最多滚一次；只是格式变化时不滚；
  - 成交脉冲（400 ms，一次性）。
  - 实时更新是页面上唯一的持续运动，没有装饰性循环、跑马灯或粒子。

### 规则

- CSS 只动 transform 与 opacity，不动 filter、backdrop-filter、box-shadow 或布局属性。
- 不用滚动劫持、Lenis、GSAP、Motion、Rive、Lottie、Spline 或视频；不做随滚动的视差或相机移动（WCAG 2.3.3）。
- 文字背后不放全宽动效；不做点击触发的全视口过渡；不自动播放视频。
- 一个共享的动效偏好模块读取 `prefers-reduced-motion` 并监听变化，统一驱动 CSS 开关、Worker、NumberFlow 与 View Transitions。减少动态时页面上什么都不动：画布换成海报，数字直接替换，过渡与滚动动画关闭。现有全局 0.01 ms 规则保留，但滚动驱动动画不依赖它，显式门控。
- 页面级暂停：首屏与页脚各一个 Pause 控件（WCAG 2.2.2），停下画布、数字滚动与所有实时更新。状态只存在内存里，不写 localStorage 或 Cookie（Cookie 政策只覆盖 app.sairn.ai）；跨页记忆等政策覆盖 sairn.ai 后再议。
- 页面隐藏时全部停止；离屏的区块停止循环。
- 闪烁安全（WCAG 2.3.1）：成交脉冲小、每帧最多 8 个，不做大面积闪烁。
- 删除：Base.astro 的 IntersectionObserver `.reveal` 脚本与 `data-countup` 计数脚本、`.marquee` 跑马灯、`animate-ping` 状态点、Manifesto 逐词出现。
- 品牌入场动效 `brand-intro` 不在页面加载时播放（品牌迁移计划 D12 的动效子项 (h)，见决定 D6）。

## 9 视觉系统与待定品牌决策

### 画布与表面（推荐值，待决定 D3）

- 页面画布保持石墨色 #12131a（官网现在的 `--bg-base`，也是共享 UI 的深色默认）。产品窗口（Live Window、终端内部的设备框、两种进入方式里的截图框）用终端自己的表面色 #0F1A1F 与浮层 #212d33。这一组从 `apps/terminal/src/styles.css` 复制，由跨应用测试钉住。
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
- 琥珀 #E6B766 默认只在 Logo 里（ADR 0028 决策 6）。在标志图形里用它（中间价线、十字线）需要先修订 ADR 0028（决定 D5），而且永远不能靠近风险句或警告。
- 涨跌与订单簿颜色复制终端令牌，由跨应用测试钉住。

### 字体（待决定 D4）

- IBM Plex Sans Variable（`@fontsource-variable/ibm-plex-sans` 5.2.8，与终端同包同版本）用于标题与正文：标题 500，64/68，字距 -0.02em；正文 16/26。
- IBM Plex Mono 400/500 拉丁子集，用于行情、数字、标签与眉标题；版本在实施时固定，并按本规划提出的「发布至少两周」规则选择（见第 11 节依赖表下的说明；仓库现在没有这条规定）。
- 日语标题与正文用 IBM Plex Sans JP 构建时子集（第 12 节）。
- 去掉 Instrument Serif 与 Inter。衬线大标题是 midday 式「传统感」的标志，编辑衬线又正是 Hyperliquid 改版用的 Teodor；Instrument Serif 也没有日文字形。终端改版后的交易界面本来就用 Plex（`font-market-close`），官网与产品因此一致。
- 数字一律 `tabular-nums`，用 ch 预留宽度。

### 版式与图像

- 12 列网格，最大宽度 1280；页面表面 12px 圆角，内部卡片 8px。
- 图标在构建时从 `@phosphor-icons/core` 2.1.1（已是依赖）内联。
- 图像只有两种：真实界面截图（AVIF/WebP）与生成的海报；不用素材库 3D、AI 渲染、币标球。行情用 Plex Mono 文字显示，不外链 `app.hyperliquid.xyz` 的币标（CSP 的 `img-src` 因此只需 `'self' data:`）。
- 截图采集管线 `apps/website/scripts/capture-ui.mjs`：
  - 驱动终端的 Playwright 夹具，只用夹具数据；夹具服务器按 [runtime-guardrails](runtime-guardrails.md) §9 使用与应用开发服务器分开、互不嵌套的 Vite `cacheDir`；
  - 采集前用 DOM 守卫拒绝含杠杆文字、`xyz:`、交易所品牌钱包、测试网徽标、盈亏、余额或收益的画面；
  - 地址打码（如 `0x12…ab`），不出现可用的存款地址；
  - 清单记录终端提交号，每次官网发布重拍；
  - 截图标注 'Sample data'，日语为「※画面はイメージです」。

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
| #86e5d3 | 薄荷 signal | ΔE76 对 #97fce3 | 8.5 |
| #E6B766 | 琥珀 choice | ΔE76 对 #97fce3 | 63.7 |
| #edeef2 / #86e5d3 / #E6B766 | 文字与强调 | 对 #0F1A1F 的对比度 | 15.25 / 11.92 / 9.54 |
| #27d29f / #f08b9e | 终端订单簿买卖价格 | 对 #0F1A1F 的对比度 | 9.10 / 7.49 |

## 10 实时数据架构

### 接口（公开，无需钱包）

2026-10-24 实测 `api.hyperliquid.xyz/info` 对 Origin `https://sairn.ai` 返回 `access-control-allow-origin: *`，不需要后端。

- **WebSocket** `wss://api.hyperliquid.xyz/ws`，每页一个，由 Worker 持有，通过 `postMessage` 供卡片使用。最多 6 个订阅：
  - 桌面首屏所选市场的 `l2Book {coin, nSigFigs}`：`nSigFigs` 取 4 还是 5，由阶段 1 的测量决定；
  - 手机首屏所选市场的 `bbo {coin}`：一行最优买卖价，代替五档盘口与 REST 轮询，不占 REST 权重（阶段 1 的测量清单里本来就有 `bbo`）；
  - `trades {coin}`；
  - 四张市场卡的 `activeAssetCtx {coin}`：标记价，用 `prevDayPx` 算 24h 涨跌；
  - 不订阅 `allMids` 流：它推送整个主场所的数据，体积与卡片需求不成比例。
- **REST** `POST /info`：
  - `metaAndAssetCtxs`（权重 20）：证明条与 szDecimals 用，区块可见时取一次，之后可见期间每 60 s 一次；
  - `l2Book`（权重 2）：首屏种子快照；手机画布的深度列每 ≥20 s 拉一次（约每分钟 6 权重），或手机不画深度层，由阶段 1 的测量决定；不再每 2 s 轮询（那样约每分钟 60 权重，单这一项就超过下表的上限）；
  - `recentTrades`：播种成交点；
  - 四条走势各一次 `candleSnapshot`（1h × 24），每 10 分钟刷新；
  - WebSocket 被拒（例如公司代理）时，改用 `metaAndAssetCtxs` 刷新价格，每 60 s 一次、每次访问最多 5 次，状态显示为带时间的快照。
- **初始负载**：方向稿估计约 125 权重（到达时一次：`metaAndAssetCtxs`、`l2Book` 种子、`recentTrades` 与四条 `candleSnapshot`），阶段 1 测量后确认。按 IP 的预算是每分钟 1200，而手机网络普遍走运营商级 NAT，同一出口 IP 后面还有其他访客与他们（包括同一访客点进之后）打开的终端，所以官网自己的稳态权重按下表设上限：

  | 路径 | 稳态 REST 请求 | 每分钟权重 | 上限 |
  | --- | --- | --- | --- |
  | 桌面（WebSocket 正常） | `metaAndAssetCtxs` 每 60 s（20）；四条 `candleSnapshot` 每 10 分钟（约 8）；盘口、成交与卡片都走 WebSocket | 约 28 | ≤30 |
  | 手机（WebSocket 正常） | 同桌面（约 28）；画布深度列 `l2Book` 每 ≥20 s（约 6），或不画深度层（0）；最优买卖价走 `bbo` | 约 28–34 | ≤35 |
  | WebSocket 被拒的回退 | `metaAndAssetCtxs` 每 60 s，每次访问最多 5 次（20，之后为 0）；不轮询 `l2Book`；走势每 10 分钟（约 8） | ≤28 | ≤30 |

  - 权重按 Hyperliquid 文档写成常量（`l2Book` 2，多数 info 20，`recentTrades` 每 20 条加 1，`candleSnapshot` 每 60 条加 1）。调速器在运行时按 60 s 滑动窗口统计本页已发出的 REST 权重，超出所在路径的上限时依次降级：先停走势刷新，再停深度列，再停证明条刷新，最后只保留 WebSocket；初始负载单独记账，不触发降级。单元测试覆盖三种路径的权重合计、上限与降级顺序。
  - 所有 REST 请求与 WebSocket 一样，只在 Web Lock 选主的标签页发出（下一小节）；其他标签页不发任何请求，保持海报，实时卡按 fail-closed 规则移除。
- **不使用**：
  - 未见文档的 `globalStats` 与 explorer `blockList`；
  - `stats-data.hyperliquid.xyz`（响应最大 64 MB，排行榜与金库也是对日本刻意不写的内容）；
  - 终端在 app.sairn.ai 上的 `/api/*`（只供同源）；
  - 仓库自建的 `pac`、`sac`、增量 `l2` 频道；
  - 与其他交易所的资金费率比较；
  - 律师意见前的 HIP-3 `xyz:` 市场。

### 客户端与连接策略

- 手写客户端，约 2 KB：订阅、换订阅前先退订、静默 50 s 后发 `{method:'ping'}`。不用打了补丁的 `@nktkas/hyperliquid`，也不用 hl-react：后者依赖 React、TanStack Query 与 wagmi，且官网 README 要求官网不依赖 workspace 包。
- 只在首屏或卡片至少 10% 可见、且文档可见时连接；页面隐藏 15 s、或离屏 30 s 后关闭。
- 跨标签页只开一个连接：用 Web Lock `sairn-site-live`（内部标识按品牌契约用 `sairn` 字面量）在 sairn.ai 的可见标签页之间选出一个持有连接并发出全部 REST 请求，其他标签页保持海报、不发请求；隐藏的标签页会放锁，所以可见的那一页很快能拿到。终端的订单簿传输池自己就可能开到 4 个连接，两边是不同源，无法协调，官网只占 1 个。
- 重连用全抖动退避（1、2、4、8、16、30 s），每 5 分钟最多 6 次、每页每分钟最多新建 3 个连接；被拒绝时 fail closed。重新订阅后的快照替换全部状态。
- 消息按动画帧合并，DOM 更新 ≤4 Hz。
- 数据调速器：Worker 统计每分钟收到的字节数。桌面超过 400 KB/min、手机超过 120 KB/min 时，先把盘口从 `l2Book` 改为 `bbo`，再降到只订阅成交；降级不改用 REST 轮询，REST 权重另由上表约束。阈值在阶段 1 实测后固定。

### Fail-closed 规则

共享校验器放在 `src/lib/live/validate.ts`，有单元测试。

- **盘口帧**：
  - 频道匹配，`data.coin` 等于订阅的币种，其他币种的串扰直接丢弃；
  - 两侧都存在；每个 `px`、`sz` 符合 `/^\d+(\.\d+)?$/`；
  - 买盘严格递减、卖盘严格递增，最优买价 < 最优卖价，`sz > 0`，时间不倒退；
  - 连续 3 帧无效，就把数据源标为无效。
- **成交**：方向是 `B` 或 `A`，`px`、`sz` 是十进制字符串，按 `(time, coin, tid)` 去重（与终端最近成交契约一致）。校验器在解析时就丢弃 `users`（买卖双方地址）与 `hash`，只保留 `coin`、`side`、`px`、`sz`、`time`、`tid`；提示框与 Read snapshot 也不显示地址。
- **新鲜度**：用 `performance.now()` 的接收时间，绝不拿用户的墙钟比较交易所时间戳（同 [ADR 0022](adr/0022-subscription-staleness-monotonic-clock.md) 的思路）。盘口 5 s 没有有效帧即为过期并冻结，30 s 后重连。
- **LIVE 标记**：只在连接打开、最近一次有效盘口不到 5 s、最近一条消息不到 10 s、币种匹配时显示。否则隐藏；5 s 后画布交叉淡化为海报（'Recorded <date>'）。不显示 'offline'、'stale' 或错误文字。
- **证明卡**：
  - `universe.length` 等于 `assetCtxs.length`，排除已下架与 HIP-3；
  - 成交额 = Σ `Big(dayNtlVlm)`（美元名义值）；持仓量 = Σ `Big(openInterest).times(markPx)`：`openInterest` 是基础币单位，直接求和得到的是各币张数之和，量级可能正好落在下面的合理范围里，校验拦不住（终端同样先换算：`apps/terminal/src/domain/market/calculations.ts` 的 `getOiUsd`、`funding-comparison.ts` 第 240 行）；只对未下架项求和，任一项 `markPx` 缺失、为 0 或不是十进制字符串时，整张持仓量卡 fail closed；
  - 求和用 Big.js 7.0.1，显示时向下取整（主张绝不向上取整）；
  - 合理范围：永续数量 50–1000，24h 成交额与持仓量各 $1M–$1T；
  - 不通过的卡从固定高度的条里移除，不留占位，也不编造；
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
| @playwright/test | 1.59.1（仓库版本） | 海报、截图、浏览器测试 |
| @axe-core/playwright | 实施时固定精确版本，仅开发依赖 | Playwright 套件里的 axe 检查（第 14 节） |

「发布至少两周」是本规划提出的新规则：AGENTS.md、agent.md、Agent 工作手册与 `pnpm-workspace.yaml` 里都没有这条规定。实施时把它写进官网 README 的依赖说明，只约束官网新增或升级的依赖；若要全仓执行，可改用 pnpm 的 `minimumReleaseAge` 设置（pnpm 10.16 起支持，属先验知识，实施时核实；它写在 `pnpm-workspace.yaml`，影响所有包，需要单独决定）。

不使用：React 岛（react-dom 59.5 KB）、three.js（110–177 KB）、OGL（11.1 KB，两个手写程序用不着）、GSAP（25.6–44.1 KB）、Motion（27.1 KB）、Lenis（5 KB）、Rive（51 KB + 262 KB WASM）、dotLottie（12 KB + 388 KB WASM）、Spline（863 KB）、hls.js 与视频、Lightweight Charts（47.5 KB，其 NOTICE 要求的 TradingView 归属与日本的图表库商标规则冲突，[资金费率历史](market-funding-history.md)第 148 行也否决过为小图表引入图表库）。体积均为调研的 brotli 实测。

### 代码布局

- `src/components/islands/OpenBook.astro`：`<sairn-open-book>` 自定义元素。
- `src/lib/live/`：`client`、`validate`、`format`、`governor`，纯 TS，不导入 workspace 包。
- `src/lib/live/open-book.worker.ts`：Canvas 2D 渲染器。
- `src/config/claims.ts`：主张登记表。
- `src/data/market-structure.json`：结构快照。
- `src/config/markets.ts`：`/markets/` 的白名单（阶段 5）。
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
| 岛的主线程部分（自定义元素、DOM 片段、客户端胶水） | ≤8 KB，另加 NumberFlow 4.9 KB |
| Worker（Canvas 2D 渲染器、WebSocket 客户端、校验器、调速器） | ≤12 KB |
| 全部 JS（除启动脚本外都延迟加载） | ≤30 KB |
| 字体（拉丁页；Plex Sans 拉丁预加载，Plex Mono 不预加载） | ≤75 KB |
| 海报 AVIF | 手机 ≤45 KB，桌面 ≤80 KB |
| 交互前总量（不含实时数据流） | 手机 ≤250 KB，桌面 ≤350 KB |
| `/ja/` 首屏（加 400 与 600 两个子集，没有画布与海报） | ≤280 KB |

- **首屏以下**（`content-visibility: auto` 配 `contain-intrinsic-size`）：终端内部一节最多 4 张 AVIF，每张 ≤60 KB；走势线是内联 SVG；首版没有视频。
- **实时数据**：前 10 s ≤60 KB；稳态桌面 ≤400 KB/min、手机 ≤120 KB/min，REST 权重桌面 ≤30/min、手机 ≤35/min（第 10 节的表），都由调速器在运行时执行，阈值以阶段 1 实测为准。
- **运行时**：渲染不在主线程；加载后没有超过 50 ms 的长任务。
- **Core Web Vitals**：
  - 实验室（Lighthouse 移动限速配置）：LCP ≤1.8 s、TBT ≤50 ms、CLS ≤0.02；
  - 现场（有足够流量后看 CrUX 的 p75）：必须满足 LCP ≤2.5 s、INP ≤200 ms、CLS ≤0.1，目标是 LCP ≤1.8 s、INP ≤100 ms；
  - LCP 元素永远是 H1 文字或海报，不是画布。
- **执行**：
  - 体积测试进 `node --test`，很便宜；
  - 官网的 Playwright 套件只对 `astro build` 产出的 `dist` 用静态服务器跑，不跑 `astro dev`，因此不碰任何 Vite 依赖缓存；`capture-ui.mjs` 驱动终端夹具时，按 [runtime-guardrails](runtime-guardrails.md) §9 使用独立的 Vite `cacheDir`，与终端开发服务器的缓存互不嵌套；
  - Playwright 的 WebSocket 故障套件放在网站工作流的路径过滤之内；
  - Lighthouse 每次发布前在本地跑一次并把结果记入任务记录，不加到 GitHub Actions：私有仓库每月 3,000 分钟；
  - 改工作流时同步 `scripts/ci-workflows.test.mjs`；
  - 中端 Android 与低电量模式 iPhone 的实测由人完成，与单元测试分开记录。

## 14 无障碍

目标是 WCAG 2.2 AA，可行处满足 2.3.3。

- **静态优先**：所有主张、数字标签与 CTA 都是真实 HTML 文本。画布 `aria-hidden`，含义放在说明、DOM 盘口表与 'Read current snapshot' 按钮里。按下这个按钮，一个礼貌的 live region 读出一段摘要，例如 'BTC: best bid 67,012, best ask 67,013, last trade buy 0.015 BTC at 21:03:11 UTC'。快速跳动的数字不进 `aria-live`；NumberFlow 本身 `aria-hidden`，旁边有同频更新的读屏文本。
- **会动和自动更新的内容**（WCAG 2.2.2 的例子就是股票行情条）：首屏与页脚的 Pause（`aria-pressed`）停下画布、数字滚动与所有实时数字。
- **减少动态**：见第 8 节；画布换海报，并提供 'Show live view' 让访客自行开启。
- 没有滚动劫持、随滚动的相机或视差；滚动驱动效果只有 `no-preference` 下的 opacity 与 transform 显现；文字背后没有全宽动效。
- **颜色**：方向由形状（实心与空心）、盘口中的位置以及符号和 ▲▼ 表达，不只靠颜色；第 9 节的对比度满足 4.5:1；现有 `--text-faint` ≥4.5:1 的检查扩展到新表面（#0F1A1F、#212d33）；焦点环 `var(--signal)` 永不移除。
- **输入**：市场标签是键盘可用的 tablist（方向键）；Pause 与 Read snapshot 是真正的按钮；悬停十字线与提示框只是增强，信息不只靠悬停获得；目标尺寸 ≥24×24（2.5.8），触控 ≥44px 并有按下反馈；吸顶页头不遮挡获得焦点的元素（2.4.11，用 `scroll-padding-top`）；二维码弹层可用键盘打开，Esc 关闭。
- **结构**：HTML 里只有一个 H1，就是看得见的首屏句子；每页 `lang` 正确；有跳转链接与地标区域；FAQ 用原生 `<details>`；文字放大到 200%、宽 320px 时重排且没有横向滚动。※ 注释的标记是带可访问名称的链接（「注3: 根拠」），并有返回链接。
- **验证**：Playwright 套件里用 `@axe-core/playwright` 跑 axe；英文与日语各做一次 VoiceOver 与 NVDA 手动检查；纯键盘走查；减少动态模拟下统计 rAF 帧数，断言 Worker 渲染为 0。

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

| 手段 | 现在能否用 | 前提 |
| --- | --- | --- |
| 每个指向 app.sairn.ai 的链接按下面的统一命名表带 `utm_*`，不用 `?ref=` | 能 | 无。参数不含任何标识；终端的 `validateSearch` 首次导航后会丢掉它们，但首个文档请求已经带上 |
| ESP 的邮件点击统计 | 能 | 按邮件 README 闸门 6 的决定 |
| Lighthouse 实验室数据、CrUX 现场数据（公开、聚合，站上不加代码） | 能 | CrUX 需要足够流量 |
| Hyperliquid 公开的 builder 聚合数据。优先用 `referral` 返回的 builder 收入等聚合字段（字段使用前要实测），它不含逐地址数据。方向稿引用的每日 builder 成交文件 `stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4`（本次未复核）是 Sairn 自己用户的逐地址成交，即使只统计每日笔数、名义金额与费用，也是在为营销目的处理逐地址数据，而隐私政策 §3 的用途里没有营销分析；律师确认前不用 | `referral` 聚合：能；`builder_fills`：等律师（第 18 节） | 不保存任何地址；`builder_fills` 只在律师确认后离线处理、只留聚合结果 |
| CloudFront 标准访问日志（官网与终端两个分发），按路径、语言与 `utm_content` 统计到达；短期保存（例如 30 天） | 需要运营方在 AWS 开启 | 律师确认隐私政策覆盖用于营销分析的服务器日志。终端分发的日志会记下 `/tradeHistory/<address>` 这类路径（`apps/terminal/src/routes/tradeHistory.$address.tsx`，另有 `fundingHistory`、`historicalOrders`）与 `c-ip`，把地址和 IP 关联在一起：开启时去掉 `c-ip` 字段（CloudFront 标准日志 v2 可以选字段，属先验知识，运营方实施时核实），或对这些带地址的路径不记录；字段选择、保存期限与处理方式写进 D10 的批准事项 |
| 任何地址级指标（每日唯一地址、首次出现的地址） | 不能 | 先改隐私政策并经法律审阅 |
| 站上的第一方事件请求（例如 `/e/<event>`）、Cookie 或 localStorage、分析 SDK、A/B 工具、热图 | 不能 | 先改政策与 Cookie 政策（目前只覆盖 app.sairn.ai）并经法律审阅 |

统一 UTM 命名表（与[邮件 README](marketing/jp-launch-email/README.md) 对齐：全部小写，词之间用下划线，不用连字符；不含任何标识）：

| 来源 | `utm_source` | `utm_medium` | `utm_campaign` | `utm_content` |
| --- | --- | --- | --- | --- |
| 日本邮件（现行，邮件 README 闸门 6） | `email` | `email` | `jp_2026_trust` | 无（以后若按按钮加槽位，要同步修改邮件 README 与三份邮件文件） |
| 官网 | `website`（固定的非域名标记，不写 `sairn.ai`：品牌契约要求域名只从 `brand.json` 读取） | `site` | `<locale>_<page>`，例如 `en_home`、`en_deposit`、`ja_home` | 槽位，例如 `header`、`hero_cta_btc`、`hero_email`、`markets_btc`、`entry_email`、`entry_wallet`、`final_cta` |

- CTA 链接由 `config/brand.ts` 的 `APP_URL` 加路径构造，不写域名字面量。
- 透传：进入页面的地址同时带合法的 `utm_source`、`utm_medium`、`utm_campaign`（各自匹配 `/^[a-z0-9_]{1,40}$/`）时，CTA 保留这三个值，只把 `utm_content` 换成本页槽位；否则用上表的官网默认值。这样邮件以后改指 `/ja/` 时，点进终端的请求仍带 `utm_campaign=jp_2026_trust`，不会被官网的 `ja_home` 覆盖。实现是内联启动脚本只读一次 `location.search` 并改写链接的 `href`，不写任何存储（A10）；没有 JS 时链接保持官网默认值。

- **基线**：改版上线前，至少取四周的 `referral` 聚合数据，若日志已开启也取四周的到达数据，记入任务记录。
- **实验**：不做 A/B；按两周的时间窗依次比较，用日志里的页面浏览数归一化，发布日期记入任务记录；主张登记表让每次文案变化可审计。
- **已知盲点**：终端的 Service Worker 会少算回访；归因止于进入应用的第一个请求；注册、首次存款与首笔交易要在产品侧另做事件（邮件 README §6 第 7 条）。

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
  - copy-contract（扫描 `src`）新增禁止：No KYC、'12ms'、杠杆数字、`xyz:`、Nikkei、JP225、'full leverage'、"each market's maximum"、'max leverage'、`fundingComparison`、'New markets appear automatically'、股票与 HIP-3 品类（`/stocks?|equit(y|ies)|indices|metal perps|TSLA|NVDA|AAPL/i`）、交易所品牌钱包名，以及不分登录方式的签名说法 `/signed with your keys|signed by your (own )?wallet|signed locally|from your own wallet|your keys sign/i`（不禁 'connect your own wallet'：首屏副标题草稿要用，它说的是连接，不是签名）和 `/gas-sponsored/i`；现有费用断言保留；
  - 「任何毫秒延迟数字」不放进扫描 `src` 的测试（会命中 `global.css` 的 `0.01ms` 与动效时长代码），改为扫描 `dist` HTML 的可见文本节点：`/\b\d+\s?ms\b/`；
  - 每条新模式都做变异检查（把文字加回去，测试必须失败），结果记入任务记录。
- CTA 的定义：凡指向 app.sairn.ai 的链接都是 CTA。英文页上，首屏、两种进入方式、市场卡组与结尾都要在同一 `[data-cta-group]` 里带 `[data-risk-note]`，风险句用正文颜色、≥14px；只有页头与页脚导航里的链接列入测试的豁免清单，带数量。
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

### 阶段 1：决定与去风险（约 1 周）

- **交付**：
  - 运营方对第 21 节各项作出决定，并记录；
  - 把第 18 节的问题清单交给律师；
  - 新 ADR「官网静态架构与实时行情画布」（编号取当时的下一个），记录方向、颜色与字体、数据规则与衡量的取舍；
  - 新 Reference `docs/website-live-data.md`：fail-closed 规则、限额、回退；
  - 测量实验：
    - 在 BTC、ETH、SOL、HYPE 上测 `l2Book`（20 档的 `nSigFigs` 4 与 5，以及 5 档快速模式）、`trades`、`activeAssetCtx`、`bbo` 的每分钟消息数与字节数，桌面与手机分开；
    - 核实 `metaAndAssetCtxs`、`recentTrades`、`candleSnapshot` 与 `referral` 的返回形状；
    - 在 Safari 18 与 26、低电量模式的 iPhone 与中端 Android 上测 Worker 里 Canvas 2D 的帧时间；
    - 录第一份海报数据；
  - 一页式首屏原型（静态，用录制数据），桌面与手机各一版，供运营方评审；
  - `tailwindcss` 对齐 4.1.18 的 PR；
  - 衡量基线开始积累；
  - 任务记录在每个阶段的检查点追加，阶段 1 结束时写明各决定与测量结果。
- **验收**：
  - 预算有实测依据，或者按证据降级（例如只做成交打印条）；REST 权重表（第 10 节）的三种路径按实测重算并固定；
  - 每条设备结论写明输入路径与设备；
  - 原型经运营方确认；
  - ADR 与 Reference 进入审阅。

### 阶段 2：基础与静态信息架构（英文，约 2 周）

- **交付**：
  - Astro 6 的独立 PR（若 D9 同意）。D9 不同意时的备选：留在 Astro 5，手写带 `size-adjust`、`ascent-override`、`descent-override`、`line-gap-override` 度量的回退 `@font-face`，并参照 `scripts/collect-inline-script-hashes.mjs` 在构建后给内联脚本与 JSON-LD 生成 meta CSP 哈希（Astro 5 的实验性 Fonts 与 CSP 选项也是一条路，属先验知识，实施时核实）；两条路都不选，就把 D9 写成阶段 2 的前提条件；
  - 令牌：产品窗口与订单簿令牌及其跨应用测试；动效令牌的读取与等值测试；
  - IBM Plex 与回退度量（Fonts API 或上面的备选）；
  - 主张登记表；
  - 第 5 节的全部首页区块（首屏用海报，证明条只有静态卡）；
  - `/deposit/`、法律页样式、`/404/`；
  - 第 8 节的 CSS 动效层；
  - 海报管线与截图采集管线；
  - 测试：重写的 brand-contract 与 copy-contract（含仿冒防护、内联 SVG 颜色扫描与风险相邻）；品牌名与域名字面量测试（第 18 节「品牌」）；体积测试；主机白名单测试（只允许 sairn.ai 与 https、wss 的 `api.hyperliquid.xyz`，`dist` 里没有外部 `<script src>`，`dist/_astro/` 的 Worker 包也在扫描范围内）；`dist` 可见文本的毫秒延迟扫描；
  - Playwright（对 `dist` 的静态服务器）在 1440、1024、390、320 宽度下的布局检查与 `@axe-core/playwright`；
  - 更新官网 README 的设计说明与依赖规则（含两周规则）；
  - 发布手册增加五步：快照刷新并提交后再构建、主张检查、截图与海报重拍、`legal/*.md` 有改动时当天重建发布官网并核对 Last Updated、构建前工作区必须干净；
  - `CHANGELOG.md` 的用户可见条目。
- **验收**：
  - 第 13 节预算全部满足；
  - 关闭 JS 时内容完整；
  - 减少动态时没有任何动画；
  - axe 无严重问题；
  - 五秒测试：至少 5 位不熟悉 Sairn 的人看首屏 5 秒后，能说出它是 Hyperliquid 的交易终端、可以用邮箱开始，结果记入任务记录；
  - 与 hyperliquid.xyz 的并排截图经人审阅；
  - 契约测试经变异检查；
  - `pnpm test:brand` 通过；
  - 运营方批准后发布。

### 阶段 3：实时层（2–3 周）

- **交付**：
  - Worker、Canvas 2D 渲染器、WebSocket 客户端、调速器、校验器、Web Lock 选主；
  - 实时证明卡与市场卡；Pause 与 Read snapshot；NumberFlow；
  - Playwright `routeWebSocket` 故障矩阵；减少动态的帧数断言；文字底板与对比度测试；REST 权重与降级顺序的单测；
  - 构建开关 `PUBLIC_LIVE_CANVAS` 默认关闭；关闭时是阶段 2 的静态站加海报；
  - `CHANGELOG.md` 的用户可见条目。
- **验收**：
  - 故障矩阵全部通过（LIVE 标记不出现，没有禁用占位）；
  - 实测数据量、REST 权重与帧时间在预算内；
  - 在选定的 `style-src`（不含 `'unsafe-inline'`）下 NumberFlow 正常渲染，浏览器控制台没有 CSP 违规；做不到就回退为纯文本数字，并记录；
  - 主机白名单测试覆盖 Worker 包，Worker 只连 `api.hyperliquid.xyz`；
  - 由人在中端 Android、低电量模式 iPhone、Safari 18（回退路径）、Safari 26、Chrome 与 Firefox 上实际拖动与触摸，验证并记录输入路径；
  - 之后才打开开关发布。
- **止损线**：任一设备检查失败、实测超预算、或故障矩阵有遗漏时，保持开关关闭发布，静态站本身就是完整的产品页；修好再开。

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
  - CloudFront 日志（去掉 `c-ip`）与响应头策略（运营方在 AWS 操作）；
  - 全仓 Node 决定之后再做 Astro 7（同时把 `@tailwindcss/vite` 升到 4.3.x）；
  - 每项上线时的 `CHANGELOG.md` 条目。
- **验收**：每项单独审阅与发布；市场页只来自白名单，删除下架市场时先 `--dryrun`；每次发布后按第 16 节的时间窗记录结果。

## 20 风险

| 风险 | 缓解 |
| --- | --- |
| 律师限制或拒绝 `/ja`，或要求英文站改更多；面向日本居民的实时行情与费用可能被认定为劝诱（金融厅 2000-12-11 指引、ADR 0042） | 阶段 0 先删；主张登记表按语言审批；默认关闭的 ja 开关与闸门记录；不做地理定向或跳转；只做英文也是完整结果 |
| 看起来像 Hyperliquid 官方：薄荷与 #97fce3 ΔE 8.5，Hyperliquid 首屏是薄荷粒子视频 | 中性梯度与墨色线；没有粒子与编辑衬线；仿冒防护测试与人工并排审阅；首屏的独立声明；官方网址区块 |
| 实时数据当众出错（Paradex、GMX、Drift、Uniswap） | 共享校验器、单调时钟、只在有效时显示 LIVE、移除而不是填占位、海报标 'Recorded'、发布时的主张检查、故障矩阵 |
| 按 IP 共享的限额（10 个连接、每分钟新建 30 个、每分钟 1200 权重），手机走运营商级 NAT，同一出口 IP 下还有其他访客与终端标签页 | 每页一个连接，跨标签页选主，REST 也只在选主标签页发出；最多 6 个订阅；有上限的退避；手机的最优买卖价走 WebSocket `bbo`，不轮询 REST；按路径设 REST 权重上限（桌面 ≤30/min、手机 ≤35/min、回退 ≤30/min），调速器运行时统计并降级 |
| 手机流量与电量 | 先测量；手机不订阅 `l2Book` 盘口流，只订阅 `bbo`；限帧与 DPR；离屏与隐藏时停止；Save-Data 用海报；绝不在主线程渲染 |
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
| 第一屏仍被认为「传统」 | 阶段 1 的原型先给运营方看；首屏是实时市场，不是截图 |

## 21 需要运营方决定的事项

本节的 D1–D19 只指本规划的决定。[品牌迁移计划](brand-migration-plan.md)也有一套 D1–D20，本文提到它们时一律写全称，例如「品牌迁移计划 D2」「品牌迁移计划 D5」「品牌迁移计划 D12 (h)」。

| 编号 | 事项 | 选项与推荐 |
| --- | --- | --- |
| D1 | 阶段 0 的范围与发布时机 | 推荐：现在就删全部闸门 1 矛盾内容（含英文站的 HIP-3 股票、指数、金属与 JP225），批准后发布，律师事后看对照；备选：等律师意见再删 |
| D2 | 是否批准本规划为方向，并先做一页原型 | 推荐：批准，先做原型 |
| D3 | 官网画布（品牌迁移计划 D5 的官网部分） | 推荐：页面石墨 #12131a + 产品窗口 #0F1A1F。两者都是近黑中性色，与 Hyperliquid 的区分靠色相（#03211c 是 C*ab 12.8、h 179.5° 的深绿）、字体与母题，不靠底色的 ΔE；选石墨的理由是不改官网画布、令牌改动最少，连续性由同为 #0F1A1F 的首屏窗口与终端启动画面承担。备选：整页 #0F1A1F（连续性更强）；不推荐：品牌青 #0A3038（有色相，与 #03211c 的 ΔE76 只有 12.0） |
| D4 | 字体 | 推荐：改用 IBM Plex Sans 与 Plex Mono（日语用 Plex Sans JP 子集），去掉 Inter 与 Instrument Serif |
| D5 | 标志图形里是否用琥珀 | 推荐：不用，琥珀只在 Logo；备选：修订 ADR 0028，只在中间价线与十字线上用，远离风险句与警告 |
| D6 | 页面加载时是否播放 `brand-intro`（品牌迁移计划 D12 (h)） | 推荐：不播放。入场动画会推迟首屏内容与 LCP（H1 是 LCP 元素，第 6 节），占用第 8 节的动效预算；动效库（`brand/tools/Sairn-Motion-Library-v1.3.html`）也写明 brand-intro「不用于延长启动等待」 |
| D7 | 首屏英文文案（H1、副标题、按钮、风险句） | 推荐：以第 6 节草稿为起点，经五秒测试后定稿 |
| D8 | 实时层的止损线与 WebGL2 | 推荐：按阶段 3 的止损线；WebGL2 只在实测证明需要时再议 |
| D9 | Astro 6 升级时机 | 推荐：阶段 2 开头单独一个 PR；Astro 7 等全仓 Node 决定。不同意时，阶段 2 走 Astro 5 的备选路径（手写回退度量与构建后算 CSP 哈希，第 19 节） |
| D10 | AWS 操作（各自单独批准） | 开启两个分发的 CloudFront 标准日志（字段选择去掉 `c-ip`，或不记录带地址的终端路径；保存期限与处理方式随批准写明）；给 sairn.ai 挂响应头策略；导出 `gatu-rewrite-index` 源码入库；D19 需要时新建指向 ESP 源站的退订路径缓存行为 |
| D11 | Search Console 与 Bing 的 DNS 验证（Cloudflare） | 推荐：英文先做，日语等律师 |
| D12 | 申请 Hyperliquid `/apps` 目录收录 | 推荐：与开发并行提交 |
| D13 | 是否为地址级指标或站上事件请求修改隐私政策 | 推荐：暂不，先用聚合数据 |
| D14 | 日语：把第 18 节问题交给律师，指定母语审阅者 | 推荐：与邮件闸门 1 一并提问 |
| D15 | `/markets/` 程序化页面的范围 | 推荐：阶段 5 做，由运营方审阅一份稳定白名单（例如 20–30 个主场所、未下架的永续），写在 `src/config/markets.ts`，其余不生成。理由：避免长尾薄页，不做 OKX 页脚那种链接农场（调研第 9 节）；用白名单而不是构建时按成交额排名，是因为排名每次发布都会变，页面随之增删，造成 404 与站点地图抖动，还要在构建时读易变数值（违反 E1） |
| D16 | `/blog/` 在第一篇文章前移出导航、站点地图并 noindex | 推荐：同意，随阶段 0 |
| D17 | 社交链接 | 等品牌迁移计划 D2 提供账号；之前不放 |
| D18 | 是否把「阶段 0 已上线」设为日本邮件的硬性发送条件 | 邮件 README 闸门 1 已经列了「官网与邮件是否矛盾（2026-10-24 审计新增）」一问；待决的只是要不要把「阶段 0 已上线」写成硬性发送条件。推荐：是 |
| D19 | 日本邮件依赖的 sairn.ai 能力（第 18 节） | 同意入口：推荐只在应用内（官网不加表单）；备选：ESP 托管页挂在 sairn.ai 子路径。退订路径：推荐 sairn.ai 的 `/u/*` 由 CloudFront 单独路由到 ESP 源站（并入 D10，排除在 `gatu-rewrite-index` 与 404 映射之外）；备选：放在 app.sairn.ai 下。若决定官网不做订阅，同步修改邮件 README §6 第 2 条 (b)。出现表单时 CSP 加 `form-action`，隐私政策覆盖（邮件闸门 3） |

## 22 本文的验证与限制

- 这是拟议文档：没有改任何代码、配置或测试，也没有运行测试或构建。
- 三个方向与三份评审由 Agent 生成，原文未取得（见开头）；本文第 4 节是摘要，评分只能追溯到本文与任务记录。调研的原始证据在本机 `.worklog/`（Git 忽略，见开头），任务记录在 `docs/work-memory/sessions/2026-10-24-website-research-and-rebuild-plan.md`。
- 2026-10-24 同日经过一轮评审（25 条意见），已按仓库与调研证据核对后修改；本文中引用的源码行号（第 19 节阶段 0 清单、`seo.ts`、`faq.ts` 等）是当日的读数，实施时要按当时源码复核。
- 外部事实来自调研的单次取证，限制见调研第 1 节；版本、支持数据与页面重量在实施前要重新核对。
- 色差与对比度是 Agent 计算的，未经设计方复核；仿冒防护的阈值（ΔE76 ≥15、中性色 C*ab <8）是本规划的提议，需要在测试里落实，并经运营方确认。
- 文中出现的法律问题都不是法律意见；面向日本的一切以律师的书面意见为准。
