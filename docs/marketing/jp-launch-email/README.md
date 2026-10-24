# 日本用户营销邮件（自托管主题）

> **状态：草案，禁止发送，直到下面的发送闸门全部满足。**
>
> - 日期：2026-10-24。
> - 本文不是法律意见。第 8 节的法规内容来自一个 Agent 在 2026-10-24 做的网页调研，必须由日本律师对照现行官方文本核实。
> - 这是一份放在硬性闸门之后的可用草稿，**没有获得发送批准**。调研结论是：未在日本登记的 Sairn Corp. 用日语向日本居民推广，很可能构成无登记业者的「勧誘」；删除地域限制也拿掉了一项「取引防止措置」。因此必须先取得日本律师的书面意见。
> - 配套决策：[ADR 0042](../../adr/0042-japan-allowed-trading-region.md)（日本改为允许交易地区；截至本文日期未合入 `dev`、未发布，线上仍是 p32 `9ccb88c0`，`JP` 仍在受限清单里）。
> - 任务记录：[2026-10-24 日本交易地区与营销邮件](../../work-memory/sessions/2026-10-24-japan-trading-region-and-email.md)。下文所说的「任务记录」都指这份文件，闸门证据以追加条目的方式记在里面。
> - 修订：2026-10-24 第 1 轮审阅（日文文案、合规、事实、邮件工程四个视角）已处理，处理方式与仍待决定的事项见第 2 节「第 1 轮审阅的处理」；同日第 2 轮审阅（日文文案、合规、事实三个视角）也已处理，见第 2 节「第 2 轮审阅的处理」。同日主会话又做了第 3 轮编辑精简：只删减和合并正文，页脚、法定表示与风险内容不变，见第 2 节「第 3 轮编辑精简」。

## 1 发送闸门

下面每一项都是硬性条件。全部满足，并在任务记录里写明日期、负责人与证据之后，才可以发送。任何一项不满足，都不发给真实收件人，小批量也不行（只发运营方自己的种子邮箱的测试除外）。

1. **日本律师的书面批准** [律师]
   - 要回答的问题：
     - 这封日语邮件发给日本居民，是否构成金商法第31条の3の2或資金決済法第63条の22意义下的「勧誘」；
     - Sairn 收取 builder fee 的路由行为，是否构成金融商品取引業（媒介・取次ぎ）或暗号資産交換業（媒介）；
     - USDC 在日本属于「電子決済手段」（2023 年修正的資金決済法）时，Sairn 经由 CCTP 的存款与提款是否涉及電子決済手段等取引業（含媒介）；页脚的未登记声明是否要加上「電子決済手段等取引業者」。这一问来自 Agent 自己的法规知识，调研（`reg`）没有覆盖，见第 8 节「调研缺口」。律师确认后，页脚可改为「…金融商品取引業者、暗号資産交換業者、電子決済手段等取引業者のいずれとしても登録を受けておらず…」，STEP 2 的「国内の暗号資産取引所が」可改为「国内の取引業者が」；答复之前文案不改；
     - 是否应该发布 ADR 0042；
     - 新闻句「日本からも注文・入金・出金の各機能をご利用いただけるようになりました」和主题 B「日本からも取引できるようになりました」能否保留：两者属于调研 `prohibitedOrRiskyClaims` 所列「日本で使える」类表示，可能被视为表示经营该业务（金商法第31条の3の2）；「ご利用前にご確認ください」里「ご利用の通信環境によっては、注文・入金・出金をご利用いただけない場合があります」一条的措辞是否合适；
     - STEP 2「※国内の暗号資産取引所が、Arbitrum上のUSDCの送金や受け取りに対応しているとは限りません…」一句，是否加重「以日本居民为对象」的认定（它假定读者从日本国内登记业者转出资金）；
     - 第 4 段「Hyperliquidの予測ファンディングレートを、他の主要な取引所と比較できるページもあります」：比较页的对象是 Binance 与 Bybit（[`docs/funding-comparison.md`](../../funding-comparison.md)），其中 Bybit 在金融厅警告名单上，Binance 也曾被警告。按文案规则这一条必须写，所以保留，请律师决定能否保留；不能保留就删掉这一条（第 7 节后续邮件按同样结论处理）；
     - 开头的早期链接「取引画面を見る→」与主按钮都指向 BTC 永续的下单页（`/trade/BTC`）：本轮已在早期链接正上方加了一行杠杆风险，请确认是否足够，或改指向非下单页；
     - 页脚「未登记」声明的措辞，以及它会降低还是加重风险；
     - 特定商取引法第11条与第12条の3是否适用（若适用，需要「特定商取引法に基づく表記」并可能要求电话号码）；
     - 景表法下手续费与风险表示是否充分，包括第 3 段小标题「手数料は、内訳まで明確に」：它指邮件里逐项写明的协议费与 builder fee。Sairn 的界面不逐笔显示这份明细（成交记录只显示 `fill.fee` 合计，下单界面只显示含 builder fee 的合计费率），所以第 3 轮删去了「約定ごとに確認できます」的说法（见第 2 节「第 3 轮编辑精简」）。这类质量表示也在景表法第48条第1号（著しい優良誤認）的直罚范围内（第 8 节）；
     - STEP 1 与页脚都以利用规约为前提，但 Sairn 没有自己的条款同意记录：同意状态完全取自 Hyperliquid `legalCheck` 的 `acceptedTerms`（[`apps/terminal/src/hooks/trade/use-legal-gate.ts`](../../../apps/terminal/src/hooks/trade/use-legal-gate.ts) 第 74 行），所以曾在别处（例如 Hyperliquid 官方前端）同意过条款的地址，不会看到列有 Sairn 利用规约、隐私政策与 Cookie 政策的确认框。这对 Sairn 条款（含 §13）能否对这些用户生效有何影响；
     - [条款](../../../legal/terms.md) §13：英格兰与威尔士法、伦敦 LCIA 英文仲裁、放弃集团诉讼，对日本消费者（消費者契約法、仲裁法附則）的效力；
     - 是否等 2026 年修正法的政省令确定后再面向日本；
     - Sairn Corp. 的注册地，以及这些风险对法人和董事的影响。
   - 风险概要（Agent 调研，日期见括号；详见第 8 节）：
     - 金融厅 2000-12-11 的境外网站指引：广告原则上视为劝诱，只有同时具备「不面向日本居民」的声明（担保文言）和实际阻止交易的措施（取引防止措置）时才例外。日语邮件发给日本居民正好相反；删除 `geo.ts` 里的 `JP` 也拿掉了取引防止措置。
     - 金融厅资金决济法无登记警告名单（页面 2026 年 9 月更新）：KuCoin、bitcastle、Bybit、MEXC、Bitget（2024-11）；LBank（2024-06）；Bybit、MEXC、Bitget、BitForex（2023-03）；Bybit（2021-05）；Binance（2021-06、2018-03）；Izakaya Limited（2026-09）。
     - 金融厅金商法无登记警告名单（2026-10-23 更新）：Bybit Fintech（2021-08）、MEXC 与 LBK（LBank，2025-06）、BTG Technology（Bitget，2025-07）。名单里还有 vermilionグループ（2025-06）：它通过介绍和返现网站「媒介」场外衍生品交易而被警告，这与按成交收费的前端很接近。
     - 据 The Block 2025-02-07 援引日经的报道，金融厅要求 Apple 与 Google 在日本下架 Bybit、MEXC、LBank、KuCoin、Bitget 的应用。没有找到金融厅的新闻稿，只能当作报道。
     - 处罚：无登记经营金融商品取引業可处 5 年以下拘禁刑及/或 500 万日元以下罚金，法人最高 5 亿日元；违反第31条の3の2（无登记表示或劝诱）可处 1 年以下及/或 100 万日元。
     - 2026 年修正法 2026-07-15 通过、2026-07-23 公布，加密资产相关条款在一年内施行，日期未定。施行后加密资产移入金商法，无登记加密资产业务的上限提高到 10 年、1,000 万日元，并新增法院紧急禁止令、推定无登记业者的部分销售无效、隐性营销规则。
     - 日本国内个人加密资产衍生品的杠杆上限是 2 倍（要求保证金为名义金额的 50%）。
     - 截至 2026-10-24，两份金融厅名单都没有 Hyperliquid 或其前端；金融厅自己说明，未列入不代表合法。新加坡 MAS 于 2026-06-26 把 Hyperliquid 列入 Investor Alert List（据 Cointelegraph 等报道）；英国 FCA 的警告见于 2026-06-05 前的报道，未在 FCA 登记簿上核对。
   - 核实：意见书必须明确结论为：可以把本目录的定稿（email.ja.html、email.ja.txt、主题 A/B/C 与预览文本）发给位于日本的收件人，且可以发布 ADR 0042。结论为否定、附条件或没有覆盖其中任一项时，本闸门不满足：按意见修改后，由律师再次书面确认。意见书的日期、结论和适用范围记入任务记录，意见书本身按运营方的方式保管，不放进仓库。律师不同意新闻句时，删除正文里的新闻段落和主题 B（「ご利用前にご確認ください」里的通信环境一条可以保留），改测 A 对 C；这类修改同样要律师再次书面确认后才算满足本闸门。

2. **ADR 0042 的版本已上线，并用真实日本 IP 验证** [运营方][律师]
   - 发布本身也以闸门 1 为前提：律师书面意见必须明确同意发布 `geo.ts` 删除 `JP` 的改动（ADR 0042 建议在此之前不发布）。没有这一条，不得为了满足本闸门而发布。
   - 核实：
     - `curl -s https://app.sairn.ai/build-meta.json` 的 `commit` 必须包含从 `TRADE_RESTRICTED_COUNTRIES` 删除 `JP` 的提交；2026-10-24 读到的仍是 `9ccb88c0`（p32）。
     - 用位于日本、不经代理的网络，实际确认能建立交易连接、下单、存款和提款。
     - 在同一网络下记录 Hyperliquid `legalCheck` 对测试地址的返回（`userAllowed`、`restrictions`，以及返回里若有的 `ipAllowed` 等字段）。每一次写操作还要过 Hyperliquid 自己的这道检查（[`packages/hl-react/src/legal.ts`](../../../packages/hl-react/src/legal.ts)：`canPerformActions` 要求 `userAllowed` 为真且限制已知、不为 `a`），仓库无法证明它对日本 IP 放行，所以必须实测。
   - 注意：[`apps/terminal/src/lib/geo/ipdata-geo.ts`](../../../apps/terminal/src/lib/geo/ipdata-geo.ts) 把 iCloud 专用代理（Private Relay，`is_icloud_relay`）判为代理，交易和资金操作会被禁用。日本 iPhone 占比高，验证时要分别测开启和关闭 Private Relay 的 Safari。正文「ご利用前にご確認ください」因此有中性的一条「ご利用の通信環境によっては、注文・入金・出金をご利用いただけない場合があります」（第 3 轮从新闻句下方移入，免得紧跟在新闻后面像是马上收回），措辞交律师确认（闸门 1）。按文案规则，邮件不提 VPN 或代理；更具体的说明放在客服 FAQ 里，同样交律师确认，不得暗示规避地域限制（条款 §2.3）。

3. **隐私政策已为营销用途更新** [运营方][律师]
   - [`legal/privacyPolicy.md`](../../../legal/privacyPolicy.md) §3 目前没有营销邮件这一用途，§7 没有提到把名单交给境外 ESP。
   - 个人信息保护法：第17条、第21条（利用目的）；第28条（向境外第三方提供）；第171条（适用于境外业者）。用地区检测或 IP 数据圈选「日本用户」属于新用途，也要律师确认。
   - 如开启打开或点击追踪（闸门 6），隐私政策写明收集的数据（打开时间、IP、点击）及 ESP 的处理。
   - 核实：线上 https://app.sairn.ai/privacy 显示新文本，并记录生效日期；新文本生效之前收集的同意不算数。

4. **按特定電子メール法第3条取得并记录同意** [运营方][律师]
   - 同意的要求：
     - 事先 opt-in：勾选框默认不勾；写明会发送广告邮件、发件人是 Sairn Corp.；最终确认页再写一次；建议双重确认（double opt-in）。
     - Privy 邮箱登录、钱包连接、客服往来留下的地址都不是广告同意，接受使用条款也不是。
     - 施行規則第2条第1項第2号允许发一封「征求同意的邮件」。只有律师确认可行时才用，而且那封邮件只能征求同意，不能推广交易。
   - 记录（施行規則第4条）：每个地址的同意时间、方式、当时显示的文案版本、同意时的 IP 国家和双重确认 token。至少保存到最后一次发送后一个月；收到措置命令后为一年。建议至少保存三年。
   - 核实：抽查发送名单的同意记录导出。

5. **收件人筛选** [运营方]
   - 只选在日本、未经代理时作出同意的地址。
   - 排除：已退订（含部分退订）、硬退信、投诉过，以及同意时或最近一次访问被标为代理或 VPN 的地址。
   - 核实：把筛选查询和名单数量记入任务记录；每次发送前重新套用退订名单。

6. **发送基础设施** [运营方]
   - 发件域：用营销专用子域发送（例如 `news.sairn.ai`，由运营方决定），与 Privy 的登录验证码邮件分开。SPF、DKIM（2048 位）和 DMARC 都要对齐，信封发件人与头部发件人同域。
   - 法第5条直接处罚伪造「送信者情報」（发信用的邮箱地址与发信设备的识别符号），不经措置命令：From 地址与发信域必须真实属于 Sairn，SPF/DKIM/DMARC 对齐。
   - 退订：
     - 加 `List-Unsubscribe`（HTTPS URL 加 `mailto:`）和 `List-Unsubscribe-Post: List-Unsubscribe=One-Click`（RFC 8058）。HTTPS URL 的主机名规则同闸门 7 的 `{{unsubscribe_url}}`。
     - 退订无需登录，两天内生效，并同步到所有 ESP 的屏蔽名单。
     - 邮件写了「メール（宛先：support@sairn.ai／件名：配信停止）でも…承ります」，所以 support@sairn.ai 必须真的有人处理这类回信，并在每次发送前同步。
     - 施行規則第5条允许收件人用电子邮件或其他任何方式提出退订，只要能识别其地址；回复 From 地址说「配信停止」也是法第3条第3項的有效通知。因此 From/Reply-To 邮箱（建议 Reply-To 设为 support@sairn.ai）、List-Unsubscribe 的 `mailto:` 邮箱、ESP 投诉反馈环（FBL）收到的退订都要有人处理，并在两天内同步到所有 ESP 的屏蔽名单；不使用不收信的 no-reply 地址。
   - 邮件格式：`multipart/alternative`，HTML 用 `email.ja.html`，纯文本用 `email.ja.txt`，两部分都用 UTF-8；主题按 RFC 2047 编码。
   - 链接追踪（发送前必须二选一并记入任务记录）：ESP 的点击追踪会把链接改写成追踪域名，打开追踪会插入 ESP 主机上的像素图片，这和正文「正規のURLは、次のとおりです」所列的两个地址矛盾，读者悬停看到的也不是 sairn.ai。两种做法：
     - 关闭点击追踪与打开追踪，用 CloudFront 访问日志统计首个请求里的 `utm_campaign=jp_2026_trust`，前提是日志已开启，这一点要先确认；
     - 使用 sairn.ai 之下的自有追踪子域，并把这个子域加进正文与纯文本「正規のURLは、次のとおりです」的列表，`email.ja.html`、`email.ja.txt`、`email.zh.md` 三份文件同步修改。这是事实层面的文案修正，不必交律师。
     - 开启任何一种追踪时，闸门 3 的隐私政策也要写明。
   - 注意：终端没有读取 UTM 的分析代码。根路由的 `validateSearch`（[`apps/terminal/src/routes/__root.tsx`](../../../apps/terminal/src/routes/__root.tsx)）只保留 `scope`，所以页面内一导航，UTM 就会从地址栏消失；归因只能靠 ESP 或首个请求的日志。纯文本部分按规则只显示不带参数的 `https://app.sairn.ai`，那部分的点击不会带 `utm_campaign`。
   - 核实：
     - 给种子邮箱发测试，检查原始邮件头（SPF/DKIM/DMARC pass、List-Unsubscribe 两个头）；点一次退订链接，确认无需登录、立即生效。
     - 在种子邮件原文（ESP 处理之后的 HTML）里列出所有 `href` 与 `img src` 的主机名，必须都是 `app.sairn.ai` 或 `sairn.ai`；若用自有追踪子域，它必须已经出现在三份文件的「正規のURL」列表里。`mailto:` 链接与 `{{unsubscribe_url}}` 按闸门 7 另查。

7. **占位符已填写** [运营方]
   - `{{company_address}}` 必须是 Sairn Corp. 真实的登记地址（施行規則第9条第2号）。仓库和 `brand/brand.json` 都没有这个地址，不得编造，也不得带着占位符发送：住所缺失或不实违反法第4条的表示义务（施行規則第9条第2号），可被下措置命令（法第7条），违反命令才适用刑罚。
   - `{{unsubscribe_url}}` 要用不透明 token，不得包含邮箱或用户 ID。
   - `{{unsubscribe_url}}` 与 List-Unsubscribe 的 HTTPS URL 必须以 `https://sairn.ai/` 或 `https://app.sairn.ai/` 开头（例如由 sairn.ai 反向代理到 ESP）；不得用 ESP 自有域名或其他子域。否则法定的退订链接会和正文的防钓鱼说明「正規のURLは、次のとおりです。取引画面：https://app.sairn.ai／ウェブサイト：https://sairn.ai」相矛盾，谨慎的读者反而不敢点。
   - 如果 ESP 的变量语法不同，就整体替换成 ESP 的写法。
   - 核实：在渲染后的测试邮件里搜索 `{{`，结果必须为零；检查退订链接与 List-Unsubscribe 头的主机名。

8. **发送当天复核事实** [运营方]
   - builder fee：`sed -n 1,6p apps/terminal/src/config/hyperliquid.ts`，应为 `f: 10`（0.01%）。
   - Hyperliquid 基础档费率：
     - 命令：`curl -s -X POST https://api.hyperliquid.xyz/info -H 'content-type: application/json' -d '{"type":"userFees","user":"0x0000000000000000000000000000000000000001"}'`
     - 2026-10-24 读到 `userCrossRate 0.00045`、`userAddRate 0.00015`、`userSpotCrossRate 0.0007`、`userSpotAddRate 0.0004`。永续（正文费率表与页脚）和现货（页脚的 0.07%／0.04%）两组数字都要对照。
   - 订单类型：`apps/terminal/src/config/trade.ts` 的 `ORDER_TYPES` 仍为 8 项，`SPOT_ALLOWED_TYPES` 仍只有 `twap`、`scale`（现货因此是成行・指値・TWAP・スケール四种）。
   - builder fee 的对象：[`packages/hl-react/src/registries/exchange.ts`](../../../packages/hl-react/src/registries/exchange.ts) 的 `BUILDER_INJECTED_METHODS` 仍只有 `order`；[`apps/terminal/src/components/trade/tradebox/trade-panel.tsx`](../../../apps/terminal/src/components/trade/tradebox/trade-panel.tsx) 仍是 `requiresBuilderFee = !twapOrder`。
   - 链接：`/trade/BTC`、`/terms`、`/privacy`、`/risk`、`/brand/email-logo.png` 都返回 200（2026-10-24 已确认；SPA 路由返回的是同一个外壳，路由是否存在以 `apps/terminal/src/routes/` 为准）。
   - 域名：仍是 `brand/brand.json` 的 `domains.primary`。
   - 日期：若发送日期不是 2026-10-24，要同时改：`email.ja.html` 与 `email.ja.txt` 里的「2026年10月24日時点」（正文费率说明一处）和「2026年10月24日時点の料率です」（页脚一处），`email.zh.md` 里的「截至 2026年10月24日」两处。

9. **在发布版本上走一遍真实的端到端流程** [运营方]
   - 环境：日本 IP，浏览器语言为 `ja-JP`，用发布后的版本。
   - 邮箱路径：
     - 邮箱注册：ADR 0033 的真实注册从未验收；
     - 存入 Arbitrum 原生 USDC：会走 ADR 0040 的自动赞助存款，主网没有真实资金验收；
     - 首单：包括静默的 builder fee 批准。
   - 外部钱包路径：若该地址尚未同意，先签 `acceptTerms2`（同意条款），再签 Enable Trading 的 `approveAgent`；首单走 ADR 0038 的无名默认 Agent，也没有真实验收。STEP 1 写了「外部ウォレットの場合は、取引用の鍵を承認する署名などを求められます」，验收时用一个未同意过的地址和一个已同意过的地址各走一次，核对实际弹出的签名：未同意的地址先签 `acceptTerms2` 再签 `approveAgent`，已同意的地址只签 `approveAgent`，两种都应在这一句的范围内。
   - 提款：首次转出（CCTP 路径、账户未激活时）可能收取账户激活费；金额以 `preTransferCheck` 返回为准，旧路径 `withdraw3` 不收这笔（[`docs/withdrawals.md`](../../withdrawals.md)）。
   - 赞助额度（硬性条件，不是建议）：邮箱用户存款的 gas 由 ZeroDev Sandbox 赞助，上限每天 0.003 ETH、每月 10 美元（[记录](../../work-memory/sessions/2026-10-11-zerodev-budget-adjustment.md)）。群发会带来峰值，发送前必须提高额度并安排发送期间的监控，否则存款可能卡在失败或「未知」状态。
   - STEP 2 的「※外部ウォレットから入金する場合は、ガス代としてArbitrum上のETHが少額必要です」按文案规则必须写，但它隐含邮箱用户存款无需 gas，也就是文案规则禁止宣传的 ADR 0040 赞助路径。第 2 轮在同一条后面加了「メールアドレスでご利用の場合の入金手順は、入金画面でご案内いたします」来中和对比（第 3 轮精简时曾改成对两种钱包通用的说法，独立复核指出中和作用因此消失，已恢复）。发送当天必须确认赞助存款可用、额度足够；做不到时把这一条整体改写为「※入金方法とガス代の扱いは、接続方法により異なります。」（HTML、纯文本、中文对照同步改）。
   - 核实：把每一步的结果和交易哈希写进任务记录。不得用页面截图或测试替代这一步。

10. **决定客服能否用日语回复** [运营方]
    - 正文写的是「回答は英語となる場合があります」。如果确认 support@sairn.ai 能用日语回复，就删掉这句，但不要写「日本語サポート」。
    - 客服 FAQ 需要提前准备：iCloud 专用代理、Arbitrum USDC 的来源（调研只找到以太坊上的国内 USDC，见第 5 节）、邮箱存款期间要保持页面打开（ADR 0040）、首次提款的激活费。

## 2 策略

### 评审结果

三个方案各由三个评审视角打分（满分 10 分）：

| 方案 | 读者 | 转化 | 合规 | 平均 |
| --- | --- | --- | --- | --- |
| self-custody（信任优先，胜出） | 7.5 | 8 | 6.5 | 7.33 |
| pro-tools（性能优先） | 7 | 5.5 | 5.5 | 6.00 |
| easy-start（轻松上手） | 5 | 6 | 4 | 5.00 |

信任优先方案胜出，原因有四个：

- 整封邮件只讲一件事：「預けない・オンチェーンで確かめられる」。它对应日本用户选择交易平台时排第二的标准，即运营方可信、安全（54.3%）。日本用户还记得托管平台的事故，这封邮件回应了这种记忆，但不点名任何公司。
- 手续费逐项写明协议费、builder fee 与合计（第 3 轮起小标题为「手数料は、内訳まで明確に」，不再声称能逐笔核对），回应排第一的标准，即手续费低（55.0%），同时不写「最安」，降低景表法有利误认的风险（是否足够由律师判断）。
- 三个方案里，它对衍生品的推销最少：不写市场数量、杠杆倍数、股票或指数永续。
- 先讲风险、主动说明英文界面，这种语气正是厌恶炒作、警惕钓鱼邮件的读者会奖励的。

### 受众与排除

- 受众：位于日本、事先明确同意接收 Sairn 广告邮件的人。画像是 20 到 40 多岁、以手机为主的现有加密资产用户。
- 日本此前在地域限制名单里，所以名单里大多数人可能注册过但从未交易。因此称呼写「お知らせの受信にご登録いただいた皆さまへ」，不写「いつもご利用いただき」。
- 排除对象见闸门 5。

### 语气

- 平静、写事实、先讲风险。正文用「です・ます」，公司自己的行为用谦让语「いたします」。
- 一段只讲一件事，手机上两三行。
- 不用恐惧式设问、紧迫感和优惠。

### 评审建议的落实

三位评审的 graftFromOthers 全部视为必须执行。下表列出每条建议落在邮件的哪里；与本任务文案规则冲突的，以规则为准，并在「调整」里说明。

| 来源 | 建议 | 落实位置与调整 |
| --- | --- | --- |
| 读者 | A 主标题 + pro-tools「注文はブラウザからHyperliquidへ直接」做变体 | A 为对照；按规则 B 必须是日本可用的新闻，pro-tools 标题改作备用 C |
| 读者 | 写明「中継サーバーを介さず」 | 第 2 段第一句 |
| 读者 | 回答「为什么不直接用官方」：清算价叠加、资金费率比较、手机专用界面 | 第 4 段；只陈述事实，不写「公式アプリ」也不作比较 |
| 读者 / 转化 | 可见文字只显示干净的 URL，UTM 藏在链接里 | HTML 只在 href 里带 UTM；纯文本按规则只显示 https://app.sairn.ai，不带 UTM（纯文本部分的点击不计入 `utm_campaign`，归因靠 ESP） |
| 读者 / 合规 | 防钓鱼说明列出两个正规域名并加入「確認コード」；退订也接受发信到 support | 「フィッシングにご注意ください」段与页脚；邮件退订以闸门 6 为前提。第 1 轮改为「正規のURLは、次のとおりです。取引画面：…／ウェブサイト：…」，不再说「2つ」（`brand.json` 还有 `www`、`testnet`），并补一句「確認コードは、ご自身で開いたログイン画面にのみ入力してください」，因为邮箱用户确实会收到 Privy 的验证码 |
| 读者 | 用「逆指値」 | 第 4 段；止盈写「利益確定」 |
| 读者 / 转化 / 合规 | 主屏幕：iPhone 从 Safari 共享菜单，需要联网 | 第 4 段小字 |
| 读者 / 合规 | 删除恐惧式设问，改为事实开头和中性目的句；用「取引ターミナル」 | 开头两段 |
| 读者 | 小标题改为「手数料の内訳を、約定ごとに確認できます」；说明批准 builder fee 不是交出私钥 | 第 3 段。调整：邮箱钱包设了 `showWalletUIs: false`，首单时静默签名（[`docs/trading-onboarding.md`](../../trading-onboarding.md)），所以分开写「外部ウォレットをお使いの場合は…ウォレット上でご確認」和「メールアドレスでご利用の場合は…自動で行われます」；不交私钥一句写成「この署名によって、秘密鍵がSairnに渡ることはありません」。小标题的问题见下面「第 1 轮审阅的处理」；第 3 轮已改为「手数料は、内訳まで明確に」（见「第 3 轮编辑精简」） |
| 读者 | 称呼改为「…皆さまへ」 | 开头 |
| 读者 | 存款一步：有经过验证的英文存款指南就链接，并说明国内交易所可能不支持 | STEP 2 加了国内交易所一句（第 1 轮改了措辞，见下面「第 1 轮审阅的处理」）。仓库里没有经过验证的存款指南，所以没有链接（见第 7 节后续） |
| 转化 | STEP 1/2/3 卡片排版；「シードフレーズの準備は不要」只写在步骤里 | 「はじめ方」 |
| 转化 | 按钮下放「英語表示」小字，intro 后放早期文字链接 | 按钮「Sairnを開く」下方小字；「取引画面を見る→」（第 1 轮去掉了箭头前的半角空格，并在它正上方加了一行杠杆风险小字） |
| 转化 / 合规 | 页脚加「画面上の見積もりと実際の金額が異なる場合があります」 | 页脚手续费条 |
| 转化 | 后续邮件编排 | 第 7 节 |
| 转化 | 链接指向不会丢参数的具体 `/trade/:symbol` | HTML 的两个行动链接（早期链接与主按钮）指向 `https://app.sairn.ai/trade/BTC`（纯文本只显示不带参数的根地址，见上）：`/` 会重定向并把查询参数换成 `scope`，`BTC` 是精确市场名，不触发规范化跳转。限制见闸门 6 |
| 合规 | 「ご利用前にご確認ください」放在按钮前 | 按钮正上方。第 1 轮起用独立的醒目框（白底、左侧 4px 粗边线、第一条粗体），不再与 STEP 卡片同样式，避免读成第四步 |
| 合规 | 签名主体写准确，覆盖外部钱包由 Agent 签名的情况 | 第 1 轮改为被动句「注文は、お客様ご自身のウォレット、またはそのウォレットで承認した取引専用の鍵で署名されます」，避免读成 Sairn 拿用户的钱包签名。没有用「端末上の鍵」：邮箱钱包的密钥由 Privy 管理，不只在终端上 |
| 合规 | 页脚加「…法令および利用規約で認められる範囲に限られます」 | 页脚，并按规则在确认块里也写了一次 |
| 合规 | 手续费分列 0.045%/0.015% + 0.01% = 0.055%/0.025%，builder fee 范围排除 TWAP，正文与页脚一致 | 第 3 段费率表和页脚。第 1 轮在费率说明句里直接限定标准市场，页脚补了现货基础档 0.07%／0.04%；第 2 轮把括号拆成独立的一句「独立した事業者が運営する市場では、料率が異なる場合があります」 |

### 第 1 轮审阅的处理

2026-10-24 的第 1 轮审阅分四个视角（日文文案、合规、事实、邮件工程），必须项与建议项全部处理，细节项能低成本处理的也处理了。两条意见冲突时，取法律上更稳妥、日文更自然的一方。下表只列冲突、偏离文案规则字面的改动、没有采纳的意见，以及仍要运营方或律师决定的事项。

| 事项 | 处理 | 理由 | 待谁决定 |
| --- | --- | --- | --- |
| 主题 A：文案视角要求回到规则原句「【Sairn】預けずに、Hyperliquidで取引する」（20），合规视角要求补「運営会社に」 | 采用「【Sairn】運営会社に預けずに、Hyperliquidで取引」（23） | 两方都认为「資産を預けずに」后接 STEP 2「入金」最像矛盾；合规版保留正文「運営会社に」这个限定，降低优良误认风险，前 20 个全角位仍能看到「運営会社に預けずに、Hyperliquid」。规则写的是「或更好的写法」 | 律师（闸门 1） |
| 第 3 段小标题「手数料の内訳を、約定ごとに確認できます」 | 按文案规则保留；正文第 1 轮改为指向 Hyperliquid 的成交记录，第 2 轮再改为「Hyperliquidの約定記録では、約定ごとに、手数料の合計と、そのうちのSairnのビルダー手数料の額を確認できます」，并补一句查看途径「この記録は、Hyperliquidが公開しているAPI（userFills）から誰でも取得できます」 | Hyperliquid 文档写明 `userFills` 的 `fee` 是含 builder fee 的合计，`builderFee` 只在非零时出现。Sairn 的任何界面都不显示明细：成交记录（[`history-tab.tsx`](../../../apps/terminal/src/components/trade/positions/history-tab.tsx)、[`mobile-history-tab.tsx`](../../../apps/terminal/src/components/trade/mobile/mobile-history-tab.tsx)）只显示 `fill.fee`，下单界面也只显示含 builder fee 的合计费率（第 5 节）。所以「逐笔明细」只能在 Hyperliquid 的公开成交数据里看到。小标题是规则指定的，改它会违反规则，所以没有改。第 1 轮列过的备选「手数料の内訳を、注文前に確認できます」已删除：下单界面同样只显示合计，那个说法也没有界面依据。第 2 轮起，重复这一主张的只剩小标题；主题 C 的预览文本已改掉（第 3 节） | 运营方二选一：（a）保留小标题，接受正文现在的写法（明细在 Hyperliquid 的公开数据里，由 API 取得）；（b）明确放弃规则原句，把小标题改为有依据的「手数料の内訳を、事前に確認できます」，依据是本邮件的费率表和外部钱包批准时显示的 0.01% 上限，三份文件同步修改。律师：景表法上是否足够（闸门 1）；第 3 轮已暂改为「手数料は、内訳まで明確に」（不在（a）（b）之内），运营方确认采用或改回 |
| STEP 2 国内交易所一句（规则原句「国内取引所によっては、Arbitrum上のUSDCの出金に対応していない場合があります」） | 改为「※国内の暗号資産取引所が、Arbitrum上のUSDCの送金や受け取りに対応しているとは限りません。ご利用の取引所の対応ネットワークを事前にご確認ください。」 | 文案视角：日本交易所的「出金」通常指日元，加密资产叫送金・送付，而且原句漏了从 Sairn 提到交易所的反方向；事实视角：原句暗示国内普遍支持、少数不支持，但调研只找到以太坊上的国内 USDC。新句意思与规则相同、不暗示普遍支持，并给出行动建议。偏离了规则字面 | 运营方确认措辞；律师确认这一句是否加重劝诱认定（闸门 1） |
| 新闻句后的「※ご利用の通信環境によっては…」 | 新增 | iCloud 专用代理和 Hyperliquid 自己的 `legalCheck` 都可能让日本用户用不了，无条件的新闻句对一部分读者不实。措辞不提 VPN 或代理 | 律师（闸门 1） |
| 第 4 段资金费率比较 | 按文案规则保留，列入闸门 1 的律师问题；第 7 节后续邮件改为按律师结论处理 | 比较对象 Binance、Bybit 都上过金融厅警告名单。删除会违反规则，所以没有删 | 律师 |
| 第 4 段小标题改为「取引に必要な機能を、ひとつの画面に」（文案视角，可选） | 未采纳 | 小标题由文案规则指定 | 运营方可改 |
| 纯文本里可见的 URL：两个视角建议 `https://app.sairn.ai/trade/BTC`，合规视角建议 `https://app.sairn.ai` | 采用 `https://app.sairn.ai`，两处都不带参数 | 文案规则写明可见文字只显示干净的 `https://app.sairn.ai`；根路径会跳到默认市场，没有 UTM 也不丢东西；和防钓鱼段列出的地址一致 | — |
| 页脚风险条补「自动减仓（ADL）」 | 采纳 | 合规视角说链接的风险披露已覆盖 ADL，这一点不准确：[`legal/riskDisclosure.md`](../../../legal/riskDisclosure.md) §3、§4、§10 覆盖标记价格、预言机与系统故障，但没有提 ADL。ADL 是 Hyperliquid 文档里的真实机制（[Auto-deleveraging](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/auto-deleveraging)），多披露无害，所以照加；风险披露是否补 ADL 属于法律文本，本轮不改 | 律师可顺带确认 |
| 邮件工程视角说 320px 去掉 `<style>` 后「唯一」溢出的是按钮 | 按钮按建议缩到 206px；另外发现费率表的最小宽度（264px）才是更宽的溢出源，同样修了 | 实测（无头 Chromium，macOS 字体）：只改按钮时去样式 320px 仍是 362px 宽，与改之前相同；把费率表的行名改为「取引手数料／Hyperliquid」两行、数字 14px、单元格内边距收窄后为 320px | — |

### 第 2 轮审阅的处理

2026-10-24 的第 2 轮审阅分三个视角（日文文案、合规、事实），共 26 条（1 条必须项、25 条建议项），全部采纳，没有拒绝的。日文措辞类的修改（导语、敬语、并列符号、页脚各条的句式）按建议原文照改，不再逐条列出；README 的闸门、证据指针与第 8 节也按建议改了。下表只列两条意见冲突时的取舍、没有照建议原文写的地方，以及仍要运营方或律师决定的事项。

| 事项 | 处理 | 理由 | 待谁决定 |
| --- | --- | --- | --- |
| STEP 1 外部钱包一句：文案视角要求「利用規約などへの同意と、取引用の鍵の承認のために…署名を求められます」，事实视角要求写成条件句 | 合并为「外部ウォレットの場合は、取引用の鍵の承認のために、ウォレット上で署名を求められます。利用規約などにまだ同意していない場合は、その前に同意の署名も求められます。」 | 两条不矛盾，各取一半：事实视角正确，`acceptTerms2` 只在 `legalCheck` 返回未同意时才签（`use-legal-gate.ts` 第 74 行），无条件的写法对已同意过的地址不实；文案视角的「利用規約など」「のために」更自然，也与全文用词一致。没有用事实视角的括号写法「（利用条件に未同意の場合は、その同意も）」：括号嵌在句中，还沿用了要被替换的「利用条件」。拆成两句并加「その前に」，顺序也与实际签名顺序一致 | 运营方在闸门 9 用两种地址核对 |
| 第 3 段小标题下的明细一句：文案视角要求改为「…を確認できます」，事实视角与合规视角指出读者在 Sairn 里无处核对 | 三条一起落实：采用文案视角的句子，补上事实视角方案（a）的查看途径「この記録は、Hyperliquidが公開しているAPI（userFills）から誰でも取得できます」（14px 小字，紧跟在主张下面），把原来的「注文画面にも…」改为单独一段「Sairnの注文画面には、合計の手数料率の目安が表示されます」 | 单写「確認できます」而不说在哪里看，是在 Sairn 无法兑现的地方加强主张；给出公开 API 这条可核对的途径，主张才有依据。「注文画面には」不再用「にも」，避免读成下单界面也显示明细 | 运营方：小标题选（a）或（b），见第 1 轮表中这一行；律师（闸门 1）；第 3 轮已暂改为「手数料は、内訳まで明確に」（不在（a）（b）之内），运营方确认采用或改回 |
| 第 3 段费率说明：文案视角建议两句写成一段 | 拆成两段：「…次のとおりです（基本ティア、2026年10月24日時点）。」与「独立した事業者が運営する市場では、料率が異なる場合があります。」都用正文字号放在费率表前 | 写成一段在 375px 宽时有 5 行，仍违反「手机上两三行」；放到表后的小字里会降低这个限定的显眼程度，所以留在表前、正文字号。纯文本两句本来就各占两行，没有加空行 | — |
| 页脚保证金共享一句：合规视角给的原句是「クロスマージンや統合型のアカウントモードでは、現物の残高を含むアカウント内の資産が証拠金として共有される…」 | 改为三句：「クロスマージンでは、証拠金が複数のポジションの間で共有されます。統合型やポートフォリオマージンのアカウントモードでは、現物の残高を含むアカウント内の資産も証拠金として共有されることがあります。このため、一部のポジションの損失や清算が、ほかの資産やポジションに影響することがあります。」 | 原句把「現物の残高を含む」同时套在全仓保证金上，不准确：`legal/riskDisclosure.md` §3 写的是全仓只在全仓仓位间共享，合并现货余额的是统一或组合保证金模式，而且用的是 \"may\"。照风险披露分开写，并保留「ことがあります」 | — |
| 资金费率比较一条：事实视角示例为「別ページの比較画面で、…」 | 写成「取引画面とは別のページで、…」 | 建议原文是「例如」。「取引画面とは別の」直接说明它不在交易画面上，正好回应「ひとつの画面に」这个小标题造成的误解，读起来也比「別ページの比較画面」自然 | — |
| 主题 C 的预览文本 | 改为「Sairnは資産をお預かりしません。板も約定も、オンチェーンで確認できます。」 | 合规视角写的是 36.5，按第 3 节的计数规则实为 35.5，在 30–50 的范围内 | — |
| 「電子決済手段」（事实视角） | 只在闸门 1 加律师问题、在第 8 节「调研缺口」补一条，文案不改 | 这是 Agent 自己的法规知识，调研与仓库都无法证明；按建议在律师答复前不改页脚与 STEP 2 | 律师（闸门 1） |
| Sairn 自己没有条款同意记录（第 2 轮核实 STEP 1 时发现，不在审阅意见里） | 只在闸门 1 加律师问题，文案与产品都不改 | `use-legal-gate.ts` 第 74 行：`acceptedTerms` 为真时不显示列有 Sairn 条款的确认框，所以在别处同意过的地址从未勾选 Sairn 的条款。这属于产品与法律问题，超出本目录的范围 | 律师（闸门 1）；运营方决定是否另立产品任务 |

### 第 3 轮编辑精简

2026-10-24 第 2 轮修订之后，主会话通读定稿：内容准确，但两轮审阅为了精确不断加说明，正文（页脚除外）约有 2,000 个全角字，手续费一节在纯文本里占 35 行，600px 宽时主按钮在约 3,700px 处。营销邮件的读者主要用手机扫读，所以做了一轮只减不增的编辑：页脚、法定表示、风险内容与「ご利用前にご確認ください」的条目都保留，没有新增主张。

| 改动 | 理由 |
| --- | --- |
| 删去导语「本日は、Sairnの仕組み、手数料、はじめ方についてご案内いたします。」 | 小标题已经说明结构 |
| 「※ご利用の通信環境によっては…」从新闻句下方移进「ご利用前にご確認ください」，改写为「…注文・入金・出金をご利用いただけない場合があります」 | 紧跟新闻像是马上收回；放进确认框仍在主按钮之前 |
| 删去「Sairnの約定履歴から、エクスプローラーで…（一部の約定を除く）」 | 带限定的次要证明，第 2 段第二句已说明链上可查 |
| 第 3 段小标题改为「手数料は、内訳まで明確に」；删去 `userFills` API 一句与「Sairnの注文画面には…目安」一句 | 原标题承诺在约定ごとに核对，Sairn 界面兑现不了。新标题不是第 1、2 轮表中给运营方的（a）（b）任一项，而是本轮另拟、同样偏离文案规则原句的写法，指邮件自己写明的明细；是否采用待运营方确认，景表法上是否足够由律师判断（闸门 1）。API 名称对营销读者过于技术 |
| 费率限定的位置不变：「標準の無期限先物市場」与「独立した事業者が運営する市場では…」仍在表前、正文字号 | 沿用第 2 轮的取舍，保证打消し表示的显眼程度 |
| 首次签名改写为「TWAP注文以外の最初のご注文の際に」；STEP 3 不再重复 | 把括号「（TWAP注文を除く）」并入句中，意思不变。不能写成「ビルダー手数料の対象となるご注文」：`requiresBuilderFee = !twapOrder` 不区分现货买卖，第一笔现货买入也会触发批准（本轮初稿这样写错了，独立复核指出后改正）；同一件事只说一次 |
| 第 4 段小标题改为「取引に必要な機能を、ひとつのターミナルに」；订单类型合并为一句「…など、8種類」；删去现货订单类型与 TWAP、スケール释义；资金费率一条写成「比較できるページもあります」 | 资金费率对比是单独页面，第 1 轮的可选方案「ひとつの画面に」会暗示它在交易画面上，所以沿用开头自称的「取引ターミナル」；本轮初稿用的「アプリ」与下文「アプリのように開けます」矛盾，已改。目标读者是活跃交易者 |
| STEP 1 合并为两条短注，Privy 只在页脚出现；外部钱包写「取引用の鍵を承認する署名などを求められます」 | 「など」同时覆盖条款同意签名，对两种地址都成立 |
| STEP 2 首句改为「入金したArbitrum上のネイティブUSDCは、CircleのCCTPを通じて、Hyperliquid上のお客様ご自身のアドレスに反映されます」；删去「最低入金額」一句；国内交易所一句删去「ご利用の取引所の」 | 合并重复；最低额存款界面会显示。「送金や受け取り」与邮箱用户的「入金手順」一句保留（本轮初稿删了，独立复核指出前者是第 1 轮补的提款方向、后者是闸门 9 的中和措施，已恢复） |
| 确认框英文一条合并为「取引画面・ログイン画面・利用規約などは英語表示です」 | 页脚仍写「利用規約とリスク開示（いずれも英語）」 |

结果：HTML 从 54,458 字节降到 51,350 字节，600px 宽时主按钮提前到约 3,100px；纯文本从 269 行降到 238 行。纯文本与 HTML 用脚本逐句对照，除费率表写成列表外一致。中文对照同步更新。本轮修改之后由三个视角（日文文案、合规、事实与同步）做了一次只报必须项的独立复核，发现本轮初稿引入的 3 处文案错误与若干 README 不同步，已全部改正，结论记在任务记录里。

## 3 主题行与预览文本

计数规则：全角字符记 1，半角记 0.5（按 `unicodedata.east_asian_width`，W/F/A 记 1）。主题不超过 30，有效信息要落在前 15 个全角位。

| 版本 | 主题行 | 全角折算 | 前 15 个全角位 | 作用 |
| --- | --- | --- | --- | --- |
| A（对照） | 【Sairn】運営会社に預けずに、Hyperliquidで取引 | 23 | 【Sairn】運営会社に預けずに、H | 信任主张；保留正文的限定「運営会社に」，不写「資産を」，避免与 STEP 2「入金」看起来矛盾。手机显示约 20 个全角位时可见「【Sairn】運営会社に預けずに、Hyperliquid」。规则原句「【Sairn】預けずに、Hyperliquidで取引する」（20）的取舍见第 2 节 |
| B（挑战） | 【Sairn】日本からも取引できるようになりました | 22.5 | 【Sairn】日本からも取引できる | 新闻主张；只有闸门 1、2 满足后才是真的，劝诱风险也最高。不在主题里列「入金・出金」，免得像模仿交易所入出金通知的钓鱼邮件；正文仍写注文・入金・出金 |
| C（备用） | 【Sairn】注文は直接Hyperliquidへ届きます | 20 | 【Sairn】注文は直接Hyperliquid | 直连主张，来自 pro-tools；「直接」放进前 15 位 |

| 预览文本 | 全角折算 | 用于 |
| --- | --- | --- |
| 注文はHyperliquidへ直接。板も約定も手数料も、オンチェーンで確認できます。 | 36.5 | A、B（已写在 HTML 隐藏预览里） |
| Sairnは資産をお預かりしません。板も約定も、オンチェーンで確認できます。 | 35.5 | C（用 C 时替换 HTML 开头隐藏 `div` 里的文字）。第 2 轮改掉了原来的「手数料の内訳は約定ごとに確認できます」：这个主张在 Sairn 界面里无法核对（第 2 节），不该放在收件箱预览里 |

刻意避免：主题里不用「シードフレーズ」「確認コード」「ログイン」，这些是日本加密资产钓鱼邮件的常见词；不用【重要】【緊急】，不用 emoji。

测试设计：

- 首批是名单的 10%（A、B 各 5%），与第 6 节的分批一致；C 不参加，留作替补。
- 观察 24 小时，判定指标是独立点击率（独立点击数除以送达数）和投诉率；退订率作参考。不看打开率，因为 Apple MPP 会虚高打开。
- 任一组投诉率超过 0.1% 就暂停该组。
- 每组送达不足约 1,000 封时，样本太小，不做测试，直接发 A。
- 律师不允许新闻句时，删除正文的新闻段落，改测 A 对 C。

## 4 文件与占位符

| 文件 | 用途 |
| --- | --- |
| `README.md` | 本文：闸门、策略、证据、发送建议与调研摘要 |
| `email.ja.html` | HTML 部分。600px 表格布局，内联样式，约 51.4 KB（第 3 轮后为 51,350 字节；低于本任务规定的 60 KB，也低于 Gmail 约 102 KB 的截断线），没有脚本、表单、追踪像素和网络字体 |
| `email.ja.txt` | 手写的 `text/plain` 部分，内容与 HTML 相同（费率表改写成列表），每行约 35 个全角字符；可见的链接只写不带参数的 `https://app.sairn.ai` 与条款等完整 URL |
| `email.zh.md` | 中文对照，仅供审阅、不发送 |

| 占位符 | 位置 | 由谁填写 | 规则 |
| --- | --- | --- | --- |
| `{{company_address}}` | 页脚「所在地：」 | 运营方 | Sairn Corp. 真实的登记地址；不得编造或留空 |
| `{{unsubscribe_url}}` | 页脚「配信停止：」（HTML 的链接地址与文字、纯文本） | ESP | 一键、免登录、不透明 token；退订说明紧挨在它前面（施行規則第7条）；主机必须是 `sairn.ai` 或 `app.sairn.ai`（闸门 7） |

其他说明：

- HTML 的 `<title>` 和隐藏预览用的是 A 和对应的预览文本。
- 没有收件人姓名变量：Sairn 不保存经过核实的姓名，所以统一用称呼「…皆さまへ」。
- `<head>` 里除了媒体查询与深色模式样式，只有两段 `<!--[if mso]>` 条件注释：Outlook 的 96 DPI 设置，和把字体强制为 Meiryo 的样式（Word 引擎不认 `-apple-system`，会退回西文字体）。其他客户端忽略这两段。`<style>` 开头另有 `:root` 的 `color-scheme` 声明和 iOS 数据识别链接（`a[x-apple-data-detectors]`）的复位，防止填入的地址或日期被 iOS 邮件自动加成系统蓝色链接。
- HTML 由 Agent 的一次性生成脚本输出，脚本不在仓库里；以后改文案直接改这三份文件，并保持 HTML、纯文本、中文对照同步。

## 5 正文主张与证据

| 邮件中的主张 | 仓库证据 |
| --- | --- |
| Sairn 是交易 Hyperliquid 永续合约与现货的交易终端 | [`apps/terminal/src/routes/perp.tsx`](../../../apps/terminal/src/routes/perp.tsx)、`spot.tsx`、`trade.$symbol.tsx`；[`apps/website/src/components/Hero.astro`](../../../apps/website/src/components/Hero.astro)；线上 `build-meta.json`（p32） |
| 「日本からも注文・入金・出金の各機能をご利用いただけるようになりました」 | 本分支的 [`apps/terminal/src/config/geo.ts`](../../../apps/terminal/src/config/geo.ts) 与 [ADR 0042](../../adr/0042-japan-allowed-trading-region.md)。**只有发布后才是真的**（闸门 2）。即使发布后也有两道检查：[`apps/terminal/src/lib/geo/ipdata-geo.ts`](../../../apps/terminal/src/lib/geo/ipdata-geo.ts) 把 `is_icloud_relay` 等判为代理并禁用交易与资金操作；每次写操作还要过 Hyperliquid 的 `legalCheck`（[`packages/hl-react/src/legal.ts`](../../../packages/hl-react/src/legal.ts)），仓库无法证明它对日本 IP 放行。所以「ご利用前にご確認ください」里有「ご利用の通信環境によっては…」一条 |
| 资产不托管；资金与仓位在 Hyperliquid 上用户自己的地址 | [`legal/terms.md`](../../../legal/terms.md) §1.3、§1.5；[`apps/website/src/components/Trust.astro`](../../../apps/website/src/components/Trust.astro)；[`AGENTS.md`](../../../AGENTS.md) 钱包签名契约 |
| 订单由用户自己的钱包或用该钱包批准的交易专用密钥签名（被动句，不暗示 Sairn 签名）；Sairn 不保管私钥 | [ADR 0038](../../adr/0038-unnamed-default-agent-for-trading-connection.md)（本地生成、主钱包批准的 Agent）；[`docs/hyperliquid-signing.md`](../../hyperliquid-signing.md)；[`docs/email-trading-signing.md`](../../email-trading-signing.md)（邮箱交易用精确的 embedded owner）；Agent 密钥保存在浏览器本地：[`packages/hl-react/src/signing/agent-storage.ts`](../../../packages/hl-react/src/signing/agent-storage.ts)（`localStorage`／`sessionStorage`），以及 [`docs/trading-onboarding.md`](../../trading-onboarding.md)「Mobile Agent QR client-only transfer」一节（"without any server state"） |
| 订单从浏览器直接发往 Hyperliquid，不经中继 | [`packages/hl-react/src/clients.ts`](../../../packages/hl-react/src/clients.ts)；[`apps/terminal/src/config/security-headers.ts`](../../../apps/terminal/src/config/security-headers.ts) 的 `connect-src`（`api.hyperliquid.xyz`）。这是传输路径；邮箱用户的签名经过 Privy，页脚已写明 |
| 订单簿在链上，订单、成交、手续费是任何人都能查看的记录 | `Trust.astro`（"Onchain order book"、"Fees on the record"）；这是 Hyperliquid 的属性，文案写成「Hyperliquidの板」 |
| 标准永续市场基础档 0.045%/0.015%；现货基础档 0.07%/0.04% | Hyperliquid `userFees`（2026-10-24 读取，命令见闸门 8）；[`apps/terminal/src/config/trade.ts`](../../../apps/terminal/src/config/trade.ts) 的 `ORDER_FEE_RATE_TAKER/MAKER` 后备值相同 |
| 费率表只适用于标准市场；独立运营方的市场不同 | Hyperliquid [Fees](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees) 的 `feeRates`：HIP-3 永续按 `deployerFeeScale` 放大（小于 1 时乘 dfs+1，否则乘 dfs×2），growth mode 乘 0.1，稳定币现货对乘 0.2；[`docs/fee-display.md`](../../fee-display.md) 同样记录。所以正文写「標準の無期限先物市場」，并另起一句「独立した事業者が運営する市場では、料率が異なる場合があります」。HIP-3 市场的费率由各 dex 的部署方通过 `deployerFeeScale` 与 growth mode 决定并可以改变（`docs/fee-display.md` 的公式与 `xyz:NFLX` 实测），所以页脚写「Hyperliquidや各市場を運営する事業者により改定されることがあります」 |
| builder fee 0.01%，上限 0.01% | [`apps/terminal/src/config/hyperliquid.ts`](../../../apps/terminal/src/config/hyperliquid.ts) `f: 10`；[`packages/hl-react/src/signing/use-builder-fee-approval.ts`](../../../packages/hl-react/src/signing/use-builder-fee-approval.ts)（`maxFeeRate` 取同一个 `f`） |
| builder fee 只收永续订单和现货卖出，TWAP 与现货买入不收 | [`apps/terminal/src/domain/trade/order-fee-quote.ts`](../../../apps/terminal/src/domain/trade/order-fee-quote.ts)；只有 `order` 动作注入 builder（[`packages/hl-react/src/registries/exchange.ts`](../../../packages/hl-react/src/registries/exchange.ts) 的 `BUILDER_INJECTED_METHODS`）。改单走 `batchModify`，不带 builder 字段，仓库没有确认改过的永续订单是否仍收 builder fee；如果有偏差，也是对用户有利的方向，所以文案不改 |
| 小标题「手数料は、内訳まで明確に」：邮件逐项写明协议费与 builder fee 及合计 | 数值依据见上下两行。明细的公开来源是 Hyperliquid [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint) 的 `userFills`（`fee` 含 `builderFee`）；Sairn 的成交记录（`history-tab.tsx`、[`mobile-history-tab.tsx`](../../../apps/terminal/src/components/trade/mobile/mobile-history-tab.tsx)）只显示 `fill.fee`，下单界面（[`order-fee-summary-value.tsx`](../../../apps/terminal/src/components/trade/components/order-fee-summary-value.tsx)）只显示含 builder fee 的合计费率。所以第 3 轮起正文不再声称能在约定ごとに核对明细，也删去了 `userFills` 与「注文画面には…目安」两句 |
| TWAP 以外的第一笔订单（含本身不收 builder fee 的现货买入）时批准 builder fee；外部钱包在钱包里确认，邮箱自动签名；不交出私钥 | `AGENTS.md` 首次交易契约（builder fee 由第一个需要它的交易动作批准）；`trade-panel.tsx` 的 `requiresBuilderFee = !twapOrder`；[`apps/terminal/src/config/privy.ts`](../../../apps/terminal/src/config/privy.ts) `showWalletUIs: false`；[`docs/trading-onboarding.md`](../../trading-onboarding.md)「Email Registration and Direct Signing」一节第 684–686 行（普通 L1 写操作与 builder fee 批准用同一个 owner 钱包，批准绑定第一个需要 builder 的动作）与「Mobile Agent QR client-only transfer」一节第 691 行（"which an email owner signs silently"） |
| 外部钱包连接时会被要求签名批准交易用密钥等（尚未同意条款的地址还要先签名同意） | `docs/trading-onboarding.md` 第 4 步（Enable Trading 的 `approveAgent`）与第 3 步（`acceptTerms2`）。第 3 步只在 `legalCheck` 返回未同意时发生：[`apps/terminal/src/hooks/trade/use-legal-gate.ts`](../../../apps/terminal/src/hooks/trade/use-legal-gate.ts) 第 74 行在 `acceptedTerms` 为真时直接返回 `accepted`，不弹确认框也不签名。第 2 轮写成条件句；第 3 轮概括为「取引用の鍵を承認する署名などを求められます」，对已同意与未同意条款的地址都成立。确认框列出的是 Sairn 的利用规约、隐私政策、Hyperliquid 的利用规约与 Cookie 政策，所以写「利用規約など」；邮箱用户的 `acceptTerms2` 在应用内的条款确认之后静默签名，正文没有单独写 |
| 永续 8 种订单：成行・指値・逆指値・利益確定（各成行／指値）・TWAP・スケール（第 3 轮起正文写「…など、8種類」，不再列现货的 4 种与 TWAP、スケール的释义） | `apps/terminal/src/config/trade.ts` `ORDER_TYPES`（market、limit、stopMarket、stopLimit、takeProfitMarket、takeProfitLimit、twap、scale）；同文件 `SPOT_ALLOWED_TYPES = ["twap", "scale"]`，[`apps/terminal/src/components/trade/tradebox/trade-header.tsx`](../../../apps/terminal/src/components/trade/tradebox/trade-header.tsx) 第 79 行在现货下过滤掉其余高级类型（桌面与手机共用这个头部），所以现货是成行・指値・TWAP・スケール |
| 图表叠加订单、仓位、清算价 | [`apps/terminal/src/lib/chart/tradingview-overlays.ts`](../../../apps/terminal/src/lib/chart/tradingview-overlays.ts)（`kind: "order" \| "position" \| "liquidation"`）；不写图表库的商标 |
| 在交易画面以外的单独页面，预测资金费率可与其他主要交易所的费率比较 | [`docs/funding-comparison.md`](../../funding-comparison.md)；`apps/terminal/src/routes/fundingComparison.tsx`（比较对象是 Binance 与 Bybit，邮件不点名；能否保留由律师决定，见闸门 1）。这是独立页面，入口是 [`apps/terminal/src/config/desktop-nav.ts`](../../../apps/terminal/src/config/desktop-nav.ts) 第 26 行的「More」菜单（`placement: "more"`）与手机抽屉，只含主 dex 永续、不含 HIP-3。第 3 轮把小标题改为「取引に必要な機能を、ひとつのターミナルに」，这一条写成「…比較できるページもあります」，不再暗示它在交易画面上 |
| 手机专用界面 | [`apps/terminal/src/config/layout.ts`](../../../apps/terminal/src/config/layout.ts)（1000px）；`apps/terminal/src/components/trade/mobile/` |
| 可添加到主屏幕；iPhone 从 Safari 共享菜单；需要联网 | [`apps/terminal/src/providers/pwa-install.tsx`](../../../apps/terminal/src/providers/pwa-install.tsx)（`ios-instructions`）；`wallet-modal.tsx` 的 iOS 说明文案；[`docs/runtime-guardrails.md`](../../runtime-guardrails.md) §8（不宣传离线可用） |
| 邮箱或 MetaMask 等钱包连接 | `config/privy.ts`（`loginMethods: ["wallet", "email"]`；`PRIVY_WALLET_LIST` 含 `metamask`） |
| 邮箱连接时自动创建交易用钱包，无需助记词（外部密钥管理服务 Privy 在页脚写明） | 自动创建：[ADR 0033](../../adr/0033-silent-email-wallet-creation.md)、[`apps/terminal/src/config/privy.ts`](../../../apps/terminal/src/config/privy.ts)（`embeddedWallets`，`createOnLogin: "off"`，由根部 provider 创建）。无需助记词：Privy 文档 [User wallets](https://docs.privy.io/wallets/overview/solutions/user-wallets)（"without needing to manage seed phrases or private keys directly"）；ADR 0033 本身没有提助记词 |
| CCTP 把 USDC 送到 Hyperliquid 上用户自己的地址；只认 Arbitrum 原生 USDC；外部钱包需要 ETH；具体步骤在存款界面说明（第 3 轮删去最低存款额一句） | [`docs/cctp-deposits.md`](../../cctp-deposits.md)「Supported Paths」：外部钱包是同一地址收到 HyperCore 入账，邮箱会话是精确的 embedded EOA，它必须等于所选的 Hyperliquid owner（写「不入账」而不是「丢失」，因为地址是用户自己的钱包）；[`CHANGELOG.md`](../../../CHANGELOG.md)（最低额为 Circle 手续费的两倍） |
| 国内交易所不一定支持 Arbitrum 上 USDC 的转出或接收 | 仓库里没有任何证据表明有国内交易所支持；调研（`practice.persona`）只找到 SBI VC Trade 的国内 USDC，且据报道只支持以太坊。所以第 1 轮改为「対応しているとは限りません」并请读者事先确认网络，不再写暗示普遍支持的「場合があります」 |
| 界面、登录、条款为英文 | [`apps/terminal/src/config/i18n.ts`](../../../apps/terminal/src/config/i18n.ts)（en、zh、hi、es、fr、ar）；`legal/*.md` 只有英文；Privy 登录界面不是日文 |
| 提款手续费的写法 | [`docs/withdrawals.md`](../../withdrawals.md)：路径由 Hyperliquid 的 `usdcRouting` 决定；CCTP 路径收 Circle 的转发费（`CoreDepositWallet` 的所有者设定，2026-09-29 读到 0.2 USDC），旧路径 `withdraw3` 收 1 USDC；账户激活费由 Hyperliquid 在首次转出时收取，只在 CCTP 路径且 `preTransferCheck` 返回费用时出现，旧路径按零处理。金额由协议返回，所以邮件不写数字，写「CCTP経路ではCircleの転送手数料」「アカウント有効化手数料を課す場合があります」 |
| 邮箱钱包由 Privy 提供、签名经过 Privy；Sairn 是独立界面 | Privy：`config/privy.ts`（`embeddedWallets`、`showWalletUIs: false`）与 Privy 的 embedded wallet 文档；`legal/terms.md` §1.5 只写了第三方密钥管理服务，没有点名 Privy。独立界面：`legal/terms.md` §1.1 |
| 不在日本登记的声明 | 调研 `requiredRiskDisclosureJa`；措辞与是否保留由律师决定（闸门 1） |
| 页脚风险：预言机价格延迟或错误、系统与通信故障、按标记价格判定保证金水平与清算、自动减仓（ADL）、全仓与统一账户等模式下保证金共享 | [`legal/riskDisclosure.md`](../../../legal/riskDisclosure.md) §3（全仓保证金在全仓仓位间共享；统一或组合保证金模式可能合并现货余额等，一部分的亏损或清算可能影响其他资产和仓位）、§4（mark 与 oracle 价格）、§10（技术与运营风险）。保证金共享这一条在第 2 轮补上，因为 [ADR 0041](../../adr/0041-automatic-unified-account-for-new-accounts.md) 已随 p32 上线（合并提交 `6525fd04` 是 `9ccb88c0` 的祖先），入金后的新账号会在统一账户模式下交易；正文不写模式会自动设置，那仍是不宣传的功能；ADL 不在风险披露里，依据是 Hyperliquid 文档 [Auto-deleveraging](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/auto-deleveraging) 与 [Margining](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining) |
| 条款、隐私、风险页面 | `apps/terminal/src/routes/terms.tsx`、`privacy.tsx`、`risk.tsx`；线上 2026-10-24 返回 200 |
| Logo | `apps/terminal/public/brand/email-logo.png`（360x180 RGB，无透明，6,085 字节；线上同大小） |
| 发件人、正规域名、客服邮箱 | [`brand/brand.json`](../../../brand/brand.json) |

### 刻意不写的卖点

| 卖点 | 原因 |
| --- | --- |
| No KYC | 对日本居民是监管红旗；facts 标为 `safeToClaim: false` |
| 杠杆倍数 | 国内个人上限 2 倍，高杠杆宣传最容易被认定为劝诱 |
| 股票、指数、金属永续，日经 225/JP225 | 涉及有价证券关联衍生品；日经是商标；JP225 是第三方 HIP-3 市场 |
| 「100以上の市場」 | 应用里的市场列表包含 HIP-3 股票和指数永续 |
| 刷卡或日元存款 | [卡存款清单](../../privy-card-funding-launch-checklist.md) CF-11 未通过，规定通过前不对外宣传；日本覆盖情况未核实 |
| 邮箱钱包自动、免 gas 存款 | [ADR 0040](../../adr/0040-automatic-email-wallet-deposits.md) 没有真实主网验收，页面必须开着，赞助额度很小。STEP 2 外部钱包需要 ETH 的一句会隐含这一点，处理见闸门 9 |
| 自动统一账户、Link mobile device | 没有真实账号或真机验收（[真机清单](../../mobile-phone-access-device-validation.md)） |
| Earn、Vault 收益率、排行榜盈亏 | 借贷收益与集合投资风险，以及业绩误导 |
| 推荐、奖励、空投、积分、限时 | 景表法赠品限制，也是金融厅眼中的劝诱信号 |
| 竞品与事故（交易所名称、盗币事件） | 比较广告与信用毁损风险，读起来也不得体 |
| 图表库商标、带交易所品牌的钱包 | 商标许可；部分钱包的发行方在金融厅警告名单上 |
| 12ms 等延迟数字 | `Hero.astro` 的装饰文字，没有实测依据 |
| 日本語対応、日本語サポート | 不是事实 |
| 金融厅、登记、认可、国内基准 | Sairn 没有日本登记，这类说法都是误导 |
| No.1、最安、無料、業界初、必ず、絶対 | 景表法优良误认与有利误认；全文没有这些词，包括「必ずお読みください」 |
| VPN、代理 | 条款 §2.3 禁止规避；产品会拦截代理访问 |
| TWAP 参数（5 分钟到 7 天、100 USD） | 配置可能变化，信息也过密 |
| 与 Hyperliquid 官方应用比较 | 需要比较依据；只陈述事实 |
| 首次提款激活费的具体金额 | 金额由协议返回（`docs/withdrawals.md`），写死会过时 |
| 「入金反映まで画面を開いたまま」 | 写进邮件就等于宣传自动存款；放进客服 FAQ |

### 本次核对（2026-10-24，Agent 执行）

- 用脚本检查文案（不是人工审读）：
  - 主题与预览文本的全角折算，结果见第 3 节；
  - 纯文本除 URL 和分隔线外，每行不超过 36 个全角位；
  - 日文 HTML 与纯文本里都没有日文与半角字母、数字之间的空格，没有半角片假名或全角英数，没有上表禁用词；
  - HTML 与纯文本逐句对照，全部句子都在两部分里出现，费率表在纯文本里改写成了列表。
- 用无头 Chromium 打开本地 `email.ja.html`，看了 375px 与 900px 的浅色和深色渲染：375px 没有横向滚动，深色模式下白色 Logo 卡片与深色正文卡片区分清楚。这只是浏览器渲染，不是邮件客户端测试；第 6 节的 QA 矩阵一项都还没做。
- 没有做：任何真实发送、种子邮箱测试、律师审阅、日本 IP 访问。

### 第 1 轮修订后的核对（2026-10-24，Agent 执行）

- 文案脚本检查（同上一轮的方法）：
  - 主题 A 23、B 22.5、C 20，预览文本 36.5 与 34.5（全角折算）；
  - 纯文本除 URL 和分隔线外每行不超过 36 个全角位；
  - 没有禁用词，没有日文与半角字母、数字之间的空格（`<title>` 也查了），没有半角片假名或全角英数；
  - 纯文本里没有 `utm_`；
  - HTML 与纯文本逐句比对：HTML 的每一句都在纯文本里，纯文本多出的只有费率表改写成的列表。
- 资料核对：Hyperliquid 文档的 `userFills` 注释、`SPOT_ALLOWED_TYPES` 与 `trade-header.tsx`、`requiresBuilderFee`、`BUILDER_INJECTED_METHODS`、`docs/withdrawals.md` 的路径费与激活费、`docs/cctp-deposits.md` 的收款地址、`docs/trading-onboarding.md` 第 3、4、8 步、`legal/riskDisclosure.md`、`legal/terms.md` §13、`brand/brand.json` 的域名、Hyperliquid 的 ADL 文档。
- 无头 Chromium（Playwright，macOS 字体）实测，浅色与深色都看了：
  - 320、375、600px：页面宽度等于视口，主按钮随宽度撑满（266、321、546px 宽，52px 高）；601 与 800px 时按钮 206×52px；
  - 页脚正文与卡片正文左右对齐（800px 时都在 133 到 667px，375px 时都在 27 到 348px）；
  - 「ご利用前にご確認ください」框浅色为白底加深色左边线，深色为 `#0f1a1f` 底加浅色左边线，和 STEP 卡片（`#f5f6fa`／`#1b2429`）区分开；
  - 去掉 `<style>`、320px 宽时页面宽度为 320px（上一轮是 362px）；
  - 页脚各条悬挂缩进，换行后不再从「・」下面开始。
- 这些都是浏览器渲染与脚本检查，不是邮件客户端测试；第 6 节 QA 矩阵仍一项未做。
- 没有做：任何真实发送、种子邮箱测试、律师审阅、日本 IP 访问、Outlook 中 VML 按钮的实际渲染。

### 第 2 轮修订后的核对（2026-10-24，Agent 执行）

- 仓库核对（读源码与文档，不是运行时验证）：`use-legal-gate.ts` 第 74 行（已同意的地址不签 `acceptTerms2`、不显示确认框）与 `legal-acceptance-modal.tsx` 确认框列出的四份文件；`config/desktop-nav.ts` 第 26 行与 `docs/funding-comparison.md` 的范围（独立页面、只含主 dex）；`order-summary.tsx` 第 110 行、`mobile-trade-view.tsx` 第 1110 行与 `order-fee-summary-value.tsx`（只渲染 `totalRate`），终端组件里没有渲染 `builderRate`、`protocolRate`、`builderAmount` 的地方；`agent-storage.ts` 的 `localStorage`／`sessionStorage`；`docs/trading-onboarding.md` 的节名与第 684–686、691 行；`legal/riskDisclosure.md` §3；`docs/fee-display.md` 的 HIP-3 公式；`git merge-base --is-ancestor 6525fd04 9ccb88c0` 成立（ADR 0041 在 p32 里）。
- 文案脚本检查（与第 1 轮同样的脚本）：
  - 主题 A 23、B 22.5、C 20，预览文本 36.5 与 35.5（全角折算）；
  - 纯文本除 URL 和分隔线外每行不超过 36 个全角位；
  - 没有禁用词，没有日文与半角字母、数字之间的空格，没有半角片假名或全角英数；日文 HTML 可见文字与纯文本里，除「©」外没有 CP932 编码不了的字符（用来查混入的简体字）；
  - 纯文本里没有 `utm_`；
  - HTML 与纯文本逐句比对：HTML 的每一句都在纯文本里，纯文本多出的只有费率表改写成的列表。
- 无头 Chromium（Playwright，macOS 字体），浅色与深色：320、375、600px 页面宽度等于视口，主按钮 266、321、546px 宽、52px 高；601 与 800px 时按钮 206×52px；页脚与卡片正文左右对齐；去掉 `<style>`、320px 宽时页面宽度仍为 320px。看了 375px 下第 3 段与「はじめ方」的截图：费率说明两段各三行、两行，STEP 1 的小字四句正常换行。
- 这些都是浏览器渲染、源码阅读与脚本检查，不是邮件客户端测试；第 6 节 QA 矩阵仍一项未做。
- 没有做：任何真实发送、种子邮箱测试、律师审阅、日本 IP 访问、用已同意与未同意两种地址实测 STEP 1 的签名、Outlook 中 VML 按钮的实际渲染。

## 6 发送建议

- 时间：周二到周四 21:00–22:30（日本时间）。避开周一、周五和节假日。多数打开发生在第一个小时。
- 分批：
  1. 先发给最近活跃、同意记录完整的 10%（A/B 各半，见第 3 节），观察 24 小时；
  2. 再发 25%；
  3. 剩余部分分两到三天发完。
- 停发阈值：
  - 投诉率是硬上限，必须低于 0.3%；达到 0.1% 就暂停排查。
  - 硬退信立即屏蔽。
  - 对 docomo、au、SoftBank 的域名限速。
- 发送期间要盯住：Gmail Postmaster Tools、support@sairn.ai 的退订与咨询、ZeroDev 赞助额度（闸门 9）。

QA 矩阵（种子邮箱，发送前）：

| 客户端 | 重点 |
| --- | --- |
| Gmail（网页、iOS、Android） | 汉字字形（`lang="ja"` 防止显示成中文字形）、深色模式反色、不被截断、预览文本 |
| iOS 邮件（浅色、深色） | 深色样式生效、白色 Logo 卡片、按钮配色、日期和地址不被自动链接 |
| Outlook（Windows 经典版与新版、Outlook.com） | VML 圆角按钮、Meiryo 字体、600px 宽度、`[data-ogsc]` 深色 |
| Yahoo!メール（网页、应用） | DMARC 通过、版式、退订链接 |
| docomo、au、SoftBank 运营商邮件应用 | 纯文本部分、换行、域名指定接收、DMARC |
| 所有客户端 | 按钮可点区域 44px 以上、页脚完整可见、`{{` 不残留、List-Unsubscribe 一键退订可用 |

## 7 后续邮件编排

每一封都要单独通过第 1 节的全部闸门和律师审阅，并且只发给同意范围包括这类邮件的人。

1. **轻松上手改写版**：第一封发出 3–5 天后，发给点击过但没有连接的人。
   - 用 STEP 1/2/3 讲清楚怎样取得 Arbitrum 上的 USDC。最好先写一篇经过验证的英文或日文存款指南，再链接过去。
   - 不写「簡単」「3ステップで」；主题和预览文本不用「シードフレーズ」「確認コード」。
   - 不宣传自动存款。
2. **专业工具精简版**：发给已经交易过或互动多的人。
   - 只保留 TWAP、スケール和图表叠加两个卖点。
   - 不写市场数量。资金费率比较按闸门 1 律师对第一封的结论处理：律师不同意保留时，第一封与后续邮件都删掉这一条。
   - 配置相关的数值发送当天复核。
3. 频率：同一个人每月不超过两封营销邮件。每封都附同样的页脚和退订方式。

与这几封邮件无关、但应当排期的后续：

- **邮件专用 Logo**：现在的 `email-logo.png` 是不透明的白底图，放在白色的 `logo-card` 里。Apple 邮件与 Outlook.com 靠媒体查询保持白卡，但 Gmail 应用的强制反色会把单元格背景压暗、图片仍是白色，结果是深色卡片上一块 180×90 的白方块。应通过品牌工具（`pnpm brand:derive-icons`）生成一张四角透明、自带留白圆角白底的邮件 Logo，让它在任何反色下都像一枚有意的徽章；不得手改 `brand/web`（`docs/brand-assets.md`）。
- **任务记录**：[2026-10-24 日本交易地区与营销邮件](../../work-memory/sessions/2026-10-24-japan-trading-region-and-email.md) 已创建，记录了本目录、三轮修订与复核；各闸门的证据以追加条目的方式记入。

## 8 法规调研摘要与来源

> 以下是一个 Agent 于 2026-10-24 通过网页调研得到的摘要，**不是法律意见**。日本律师必须对照现行官方文本核实。调研里有缺口，列在本节最后。

### 特定電子メール法

- 广告邮件只能发给事先同意的人（第3条第1項第1号）。收发任一端在日本的邮件都适用（第2条第2号）。
- 必须显示的事项：
  - 发件人名称（第4条第1号）；
  - 退订用的邮箱或 URL（第4条第2号、施行規則第8条）；
  - 可以拒收的说明，必须紧挨退订地址的前后（施行規則第7条第1項第2号、第9条第1号）；
  - 地址与投诉联系方式（施行規則第9条第2号、第3号），可以放在任何位置。
- 显示事项必须是与正文相同编码的文字，不能放进图片（施行規則第7条第2項）。
- 同意记录的保存见施行規則第4条。
- 处罚：
  - 违反第3条、第4条（包括住所等表示事项缺失或不实）先由主管大臣下措置命令（第7条）；违反命令可处 1 年以下拘禁刑或 100 万日元以下罚金，法人 3,000 万日元以下。
  - 伪造送信者情報（第5条：发信用的邮箱地址与发信设备的识别符号）直接适用刑罚，不经措置命令。

### 金商法与資金決済法

- 见闸门 1 的风险概要。
- 未登记业者在日本 2 倍杠杆上限之外推广衍生品，是最容易被注意到的行为。
- 2026 年修正法会大幅加重处罚。

### 景表法

- No.1、最安一类说法需要依据，没有依据就是优良误认或有利误认（第5条）。
- 消费者厅 2024-09-26 的 No.1 表示调查报告对依据提出了要求。
- 自 2024-10-01 起，著しい优良误认与著しい有利误认都可以不经措置命令直接处以 100 万日元以下罚金（第48条第1号、第2号），另有措置命令（第7条）与课征金（第8条）。调研只引用了第2号，第1号是第 2 轮审阅补充的，同样要律师确认。本邮件的「プロ仕様のチャート」「他の主要な取引所」「手数料の内訳を、約定ごとに確認できます」这类质量表示属于第1号的范围，不只是行政风险。
- 赠品受第4条限制。
- 隐性营销属于第5条第3号指定的不当表示。

### 個人情報保護法与特定商取引法

- 个人信息保护法：营销用途要写进利用目的；向境外 ESP 提供名单涉及第28条；第171条适用于境外业者。
- 特定商取引法第12条の3是否适用于按成交收费的服务，还没有定论。

### 投递规则

（来自实务调研，不是日本法律）

- Gmail 与 Yahoo 的批量发件规则：SPF、DKIM、DMARC 对齐；RFC 8058 一键退订；两天内处理退订；投诉率低于 0.3%。
- Yahoo! JAPAN 自 2020 年起看 DMARC。
- docomo 自 2025-02-13 把 DMARC quarantine 的邮件放进垃圾箱；au 与 SoftBank 也有 DMARC 过滤。

### 来源

法律原文（e-Gov）：

- 特定電子メール法：https://laws.e-gov.go.jp/law/414AC0100000026
- 同施行規則：https://laws.e-gov.go.jp/law/414M60000008066
- 金融商品取引法：https://laws.e-gov.go.jp/law/323AC0000000025
- 同施行令：https://laws.e-gov.go.jp/law/340CO0000000321
- 金融商品取引業等に関する内閣府令：https://laws.e-gov.go.jp/law/419M60000002052
- 資金決済に関する法律：https://laws.e-gov.go.jp/law/421AC0000000059
- 景品表示法：https://laws.e-gov.go.jp/law/337AC0000000134
- 特定商取引法：https://laws.e-gov.go.jp/law/351AC0000000057

监管机关与官方资料：

- 金融厅「無登録で暗号資産交換業を行う者」：https://www.fsa.go.jp/ordinary/chuui/angoushisan_mutouroku.html
- 金融厅「無登録で金融商品取引業を行う者」：https://www.fsa.go.jp/ordinary/chuui/mutouroku.html
- 金融厅，同名单 HTML 版：https://www.fsa.go.jp/ordinary/chuui/mutouroku/04.html
- 金融厅 2000-12-11 境外网站指引：https://www.fsa.go.jp/news/newsj/syouken/f-20001211-1.html
- 金融厅工作组报告（2025-12-10）：https://www.fsa.go.jp/singi/singi_kinyu/tosin/20251210.html
- 总务省与消费者厅「特定電子メールの送信等に関するガイドライン」：https://www.soumu.go.jp/main_content/000127185.pdf （本次未能提取正文）
- 总务省「特定電子メール法」宣传册：https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/pdf/m_mail_pamphlet.pdf
- 消费者厅「No.1表示に関する実態調査報告書」（2024-09-26）：https://www.caa.go.jp/policies/policy/representation/fair_labeling/survey/assets/representation_cms216_240926_02.pdf

解说与报道：

- 境外加密资产交换业者的劝诱（2018-01-12）：https://www.mc-law.jp/kigyohomu/26431/
- 2026 年修正法解说：https://www.businesslawyers.jp/articles/1568
- 大和总研（2026-04-20）：https://www.dir.co.jp/report/research/law-research/securities/20260420_025713.html
- 应用下架报道：https://www.theblock.co/post/339501/japan-apple-google-block-crypto-apps 、https://gigazine.net/news/20250210-apple-google-block-crypto-apps/
- MAS 警示报道：https://cointelegraph.com/news/hyperliquid-singapore-mas-investor-alert-list
- FCA 警告报道：https://www.valuethemarkets.com/index.php/cryptocurrency/news/fca-flags-hyperliquid-as-unauthorized-firm-for-uk-consumers
- 消费者厅关于「无料」表示的指引（报道）：https://internet.watch.impress.co.jp/docs/news/487626.html

投递：

- Google 发件人指南：https://support.google.com/a/answer/81126?hl=en 、https://support.google.com/a/answer/14229414?hl=en
- Yahoo 发件人最佳实践：https://senders.yahooinc.com/best-practices/
- Benchmark Email 日本（2026-02）：https://www.benchmarkemail.com/jp/blog/sender-guideline-update/
- LINEヤフー DMARC 公告：https://www.lycorp.co.jp/news/archive/Y/ja/ja20200129_A.pdf
- docomo（2025-02-13）：https://www.docomo.ne.jp/binary/pdf/info/news_release/topics_250213_00.pdf
- au：https://www.au.com/mobile/service/attention/spf-record/
- SoftBank：https://portal.business.mb.softbank.jp/portal/doc/announcement/dmarc_information.pdf

### 调研缺口

以下内容需要律师用一手资料核实：

- 总务省指引 PDF 与金融厅法案 PDF 没能提取正文；默认不勾选、最终确认页这两点来自搜索摘要。
- FCA 警告的日期、金融厅关于 2025 年应用下架的官方说明，都没有一手来源。
- 总付景品限额、消费者契约法第4条、隐性营销告示、Gmail/Yahoo 规则，来自已有知识，本次没有抓取原文。
- 调研没有涉及「電子決済手段」（2023 年修正的資金決済法，`reg` 里没有这个词）。在日本，USDC 很可能属于電子決済手段，国内由電子決済手段等取引業者经营（据公开报道，SBI VC Trade 于 2025 年 3 月以这一登记开始经营 USDC）。这封邮件的资金路径全是 USDC 的存入和提取，而页脚只声明未登记为金融商品取引業者与暗号資産交換業者，STEP 2 也把国内经营方统称为「暗号資産取引所」。这一条来自第 2 轮审阅（Agent 的法规知识），没有一手来源，问题列在闸门 1。

## 9 预览

- 浏览器预览：直接打开 `docs/marketing/jp-launch-email/email.ja.html`（例如 macOS 上 `open docs/marketing/jp-launch-email/email.ja.html`）。
  - 深色：把系统外观切到深色，浏览器会按 `prefers-color-scheme` 应用深色样式。
  - 手机宽度：用开发者工具的设备模式设为 375px。
- 无头渲染（可选）：`node_modules/.bin/playwright screenshot --viewport-size=375,812 --full-page --color-scheme=dark file://$PWD/docs/marketing/jp-launch-email/email.ja.html <输出路径>`。
- 截图不提交到仓库。
- 浏览器预览不代表邮件客户端的效果。各客户端的真实渲染以第 6 节 QA 矩阵里的种子邮箱测试为准。
