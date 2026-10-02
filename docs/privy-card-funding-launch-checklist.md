# 银行卡入金上线验收清单

更新：2026-10-02。范围：[ADR 0034](adr/0034-privy-card-funding.md)「上线前提」的逐项验收。状态：两个开关在仓库默认值与线上构建里都是关闭；下表除注明外均未执行。这是人工清单，没有校验脚本。

本文件只记录要求和已核对的事实。填好的证据（截图、交易号、测试账户）保存在仓库之外；不要记录卡号、证件、手机号、验证码或访问令牌。

## 发布规则

分三个阶段，顺序不能反；一个阶段要求的行全部通过后才进入下一个，任何一行失败按「关闭与回滚」处理。清单表的「执行环境」列写明每一行在哪里做。

1. **发布之前（不公开）**：CF-1、CF-8、CF-10 有结论；CF-2 与 CF-7 在本地由人操作并通过。本地指带开关的开发服务器或本地构建（见「准备」）。开发服务器的分块和响应头与线上不同，所以本地结果只对这两行算数：CF-2 验证邮箱钱包的购买流程与通知，CF-7 验证服务商的生产流程、收款地址与到账，都不依赖分块与 CSP。
2. **沙盒发布**：按 CF-9 第一步发布只打开测试网开关的构建。主网与测试网站点共用同一份产物，这一步之后主网站点的入口仍然关闭，购买入口只出现在测试网站点。之后在测试网站点上、前台浏览器窗口里由人完成 CF-3 至 CF-6，以及 CF-12 中标为「必须」的各项。这一阶段的全部操作都在发布产物和线上实际下发的响应头下进行，不扣款。测试网站点目前没有打开邮箱钱包的测试网存款（见「准备」第 3 条），这些行用外部钱包做。
3. **主网发布与发布之后**：按 CF-9 第二步发布两个开关都打开的构建，随后立即在主网站点做 CF-11，包括一次最低金额的真实购买。CF-11 通过之前不对外告知这个功能。

没有覆盖的组合：邮箱钱包在发布产物上的沙盒流程（原因见第 2 条）。它与外部钱包共用同一个购买窗口和同一份 CSP，差别只在收款地址与所有权签名，由 CF-2（本地）与 CF-11（线上，用邮箱钱包真实购买）覆盖。

开关关闭的发布不需要本清单，也不代表入金已验收。单元测试、夹具浏览器测试、`csp-coverage.mjs`（它用未登录的浏览器检查通用页面，不走购买流程）和下面「已核对的事实」都不能代替这些行。

## 已核对的事实（2026-10-02）

| 事实 | 依据与范围 |
| --- | --- |
| 本地 `apps/terminal/.env.local` 与线上 `app.sairn.ai`（发布 p24）使用同一个 Privy 应用，即控制台里名为 Sairn 的应用 | 脚本在线上首屏的 130 个脚本里找到 5 个含本地应用 ID（不输出值）；控制台里该应用的 ID 与本地值相等 |
| 该应用 Funding 页：Card onramps 已开启，Stripe 与 MoonPay 为 Enabled，Meld 未配置；Bank transfer、Exchange、Crypto deposits 关闭。页面注明未做 Meld KYB 时只支持 Stripe 的 USD、EUR 与 MoonPay 的 AUD、BRL | 用户 Chrome 里已登录的 Privy 控制台，只读查看，没有改任何设置 |
| 控制台提示该应用处于 development mode（Upgrade to production） | 同上。它对线上用户数或入金的限制没有查证 |
| 线上 p24 的 `/build-meta.json`（主网与测试网站点相同）：`cctpDeposits` 为 `{ mainnetSponsoredWallet: true, testnetExternalWallet: true, testnetSponsoredWallet: false }`，还没有 `privyFiatFunding` 字段 | 2026-10-02 读取两个站点的公开文件。含义见「准备」第 3 条 |
| 生产构建在强制 CSP 下能打开购买窗口，USD 100 有可用报价 | 提交 `789d3202` 的构建，本地 Nitro 预览（见「测量注意」）、邮箱会话、主网；`Continue` 可用，没有点击。之后宿主的加载改由发起一侧负责（ADR 0034 决策 7），没有重测 |
| 选择页出现时宿主块已下载；点击「购买」后 22–29 ms Privy 发出第一个请求 | 同上（同一提交），两次。时间取自资源计时，不受「测量注意」第一条的影响 |
| Stripe SDK 脚本、`api.stripe.com`、`link.com` 的请求以及 `js.stripe.com`、`hooks.stripe.com` 的框架没有触发违规；对照的 `example.com` 三类都被拦截 | 同一页面里用 preload、no-cors 请求和隐藏 iframe 探测策略，没有执行 Stripe 流程 |

没有做：点击 `Continue` 之后的任何步骤（会把登录邮箱交给服务商并要求手机号与身份信息）、沙盒购买、真实购买、外部钱包、手机与 PWA。

### 测量注意

- Claude in Chrome 操作的窗口被其他窗口遮挡时，`document.visibilityState` 是 `hidden`：Chrome 把定时器对齐到 1 秒（实测 15 ms 的定时器要 590–1001 ms），也不出帧。Privy 用 15 ms 的定时器打开窗口，关闭动画要等出帧，所以在这种窗口里看到的「点击后约 0.7–1 秒才出现」「关闭后留一个空白框」都是该状态造成的，不是产品行为；同一状态下页面加载后的第一次点击要先截图出一帧才会命中。前一轮记录的「8–14 秒」也属于这一类（当时还叠加了开发服务器与机器负载）。
- 生产构建在本地预览时，IP 归属服务不认回环地址，`/api/geo` 返回不可用，存款与购买入口会按设计保持关闭。上面的观察用了一个只回答 `/api/geo`（GB）并转发其余请求的本地代理；应用代码没有为此改动。
- 因此时间与动画的结论只能在前台窗口由人确认，对应 CF-2。

## 准备

购买入口只有在这个钱包自己的存款路径已经放开时才能点击（它与存款表单用同一个可用性判断），否则显示为禁用并说明原因。各组合需要的开关（`use-privy-fiat-funding-offer.test.tsx` 钉住这张表）：

| 网络 | 钱包 | 除银行卡开关之外还需要 |
| --- | --- | --- |
| Testnet | 邮箱钱包 | `VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=true` |
| Testnet | 外部钱包 | `VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true` |
| Mainnet | 邮箱钱包 | `VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true` |
| Mainnet | 外部钱包 | 无 |

1. 本地沙盒（CF-2）：带上银行卡开关和测试网的两个存款开关启动开发服务器（`VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=true VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true pnpm --filter @sairn/terminal exec vite dev --port 3005 --strictPort`），在 Settings → Network 切到 Testnet。该钱包第一次用 Testnet 时会先要求接受条款（钱包签名）。购买窗口应显示 `You're in a sandbox environment`。沙盒不动真钱，目的链仍是 Arbitrum 主网，不会到账；结束后的通知应写明这是沙盒测试。这里只验收购买流程，不需要真的做测试网存款。
2. Stripe 沙盒测试值（Privy 文档）：金额低于 200 美元；美国或欧盟手机号；验证码 `000000`；卡号 `4242 4242 4242 4242`、任意三位 CVC、未来的有效期。
3. 测试网站点（`testnet.sairn.ai`）当前放开了外部钱包的测试网存款、没有放开邮箱钱包的（见「已核对的事实」里的 `cctpDeposits`），所以沙盒发布阶段用外部钱包；发布后先确认 `/build-meta.json` 的 `cctpDeposits.testnetExternalWallet` 仍为 true，否则这一阶段的行都做不了。
4. 本地真实购买（CF-7）：同第 1 条的命令，界面保持 Mainnet，用服务商允许的最低金额。用外部钱包最直接（主网外部钱包存款不需要开关，随后的存款自付 Arbitrum gas）；用邮箱钱包时命令里还要加 `VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true`，并且本地要有赞助存款所需的配置。这是真实扣款，收款地址是当前登录的 owner 钱包。
5. 测试人所在地区：必须既不在本终端的地区限制里，又在服务商的服务范围内。Stripe 只在美国（不含纽约州）与欧盟提供，而美国在本终端的限制里；MoonPay 目前只有 AUD、BRL。因此真实购买（CF-7、CF-11）要由身在欧盟国家或 MoonPay 上述币种地区的测试人完成。没有这样的测试人时这两行不能记为通过。

## 清单

| ID | 场景 | 执行环境 | 要求的结果 | 状态 |
| --- | --- | --- | --- | --- |
| CF-1 | Privy 控制台 Funding 页 | 控制台 | Card onramps 开启并记录服务商；决定是否做 Meld KYB；确认 development mode 是否要升级 | 部分：2026-10-02 只读核对 Card onramps 已开启（Stripe、MoonPay）；Meld 与 development mode 待业务决定 |
| CF-2 | 沙盒购买，邮箱钱包，桌面前台窗口 | 本地 | 存款弹窗先显示两个入口；选「购买」后弹窗关闭、购买窗口随即出现并带沙盒提示；用测试值走完；通知标题为「Card purchase confirmed」，或过早关闭时为「Card purchase submitted」，说明只有一句沙盒说明（没有扣款、不会到账），不提示等待到账或去存款，10 秒后自行关闭 | 未执行 |
| CF-3 | 沙盒里在三种时机关闭窗口 | 沙盒发布 | 付款之前关闭（金额、支付方式、身份资料各步）：没有通知，再次打开时两个入口可用。付款处理中关闭（服务商确认中、Stripe 结账进行中）：「Card purchase submitted」。窗口里已经显示错误之后关闭：明确拒卡、服务商报告失败或取消为红色的「Card purchase did not complete」，其他错误为「Card purchase status unknown」。沙盒里这些通知都带沙盒说明并自行关闭（主网上后两种不确定结果会常驻，由单元测试覆盖）。任何情况都不出现服务商的原始错误文本 | 未执行 |
| CF-4 | CSP 与权限，随 CF-3、CF-5 全程开着控制台 | 沙盒发布 | 没有 `Refused to …` 或 `securitypolicyviolation`；记录 Apple Pay、Google Pay 与页内摄像头证件验证是否出现、能否完成（现行 `permissions-policy` 下预期不可用）。证件验证因此无法完成时，先做 ADR 0034 第 10 条的决定 | 未执行；策略探测见上表 |
| CF-5 | 外部钱包走完沙盒购买，桌面 | 沙盒发布 | 选择页写明从已连接钱包存入并提示需要 ETH；用测试值走完购买；记录购买流程是否要求所有权签名、出现在哪一步；通知带沙盒说明；之后选「转入」仍能进入存款表单 | 未执行 |
| CF-6 | 手机浏览器（iOS Safari、Android Chrome）与已安装的 PWA | 沙盒发布 | 选择页是底部抽屉，两个入口完整可见，返回可用；购买窗口可操作，键盘弹出时继续按钮可达；关闭后回到页面；通知卡片完整可见、可关闭 | 未执行；夹具只覆盖 375 px 的选择页 |
| CF-7 | 最低金额真实购买，带主网开关的本地构建；钱包类型与开关见「准备」第 4 条 | 本地 | USDC 到达与所选 Hyperliquid owner 相同的地址（区块浏览器核对）；随后存款弹窗里完成一次 CCTP 存款并到账；记录用的是哪种钱包 | 未执行 |
| CF-8 | 法律文本 | 仓库与线上 | [草案](privy-card-funding-legal-draft.md)经合格法律审阅后写入 `legal/`、两个路由面，并更新 Last Updated；在主网发布之前上线 | 未执行；草案待审 |
| CF-9 | 发布顺序 | 线上 | 第一步（沙盒发布）：`deploy.mjs functions --execute` 发布含 Stripe 来源的响应函数，再发布只打开 `VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED` 的构建（测试网开关不需要确认参数）；线上 `/build-meta.json` 的 `privyFiatFunding` 为 `{ mainnet: false, testnet: true }`。第二步（主网发布）：发布两个开关都打开的构建并传 `--allow-mainnet-card-funding`；`/build-meta.json` 的 `privyFiatFunding` 为 `{ mainnet: true, testnet: true }`。每一步之后 `deploy.mjs verify`（两个站点）与 `apps/terminal/tests/browser/csp-coverage.mjs` 都通过。`verify` 只比较需要确认参数的主网闸门，`privyFiatFunding.testnet` 与 `cctpDeposits.testnetExternalWallet` 要打开线上文件人工核对 | 未执行 |
| CF-10 | 地区与币种 | 业务决定 | 业务确认实际可用的地区（见「准备」第 5 条）。不传 `source.assets` 时 Privy 3.46.0 的币种列表有 49 种（读产物得出），而未做 Meld KYB 时只有 USD、EUR、AUD、BRL 有服务商；决定是否把列表收窄到这四种 | 未决定 |
| CF-11 | 发布后验收，线上主网，邮箱钱包 | 主网发布后 | `/build-meta.json` 的 `privyFiatFunding.mainnet` 为 true；存款弹窗先显示两个入口；选「购买」后窗口打开到金额页并有报价；全程开着控制台，用最低金额完成一次真实购买，没有 `Refused to …` 或 `securitypolicyviolation`；USDC 到达 owner 地址；通知不声称到账。另外核对一次：在 Privy 控制台关闭 Card onramps 后入口与购买窗口的表现（见「关闭与回滚」），核对后恢复 | 未执行 |
| CF-12 | 异常与恢复 | 沙盒发布 | **必须**：(a) 断网时选「购买」，出现「Card purchase could not open」或购买窗口里的错误，入口不会停在禁用状态；(b) 购买窗口打开期间登出或换账户，结果不显示给新账户，页面没有刷新时回到原账户后才显示；(c) 只用键盘能到达两个入口、返回、关闭和通知卡片的关闭按钮，读屏能读出它们的名称和通知内容。**只记录现象**：(d) 断网恢复后不刷新页面能否再次打开购买窗口；(e) 同一账户在两个标签页各发起一次时服务商与 Privy 的表现（本应用「同时只有一笔」的限制只在单个页面内）；(f) 服务商不支持所在地区、会话过期或维护时购买窗口里的提示，关闭后的通知按 CF-3 判定 | 未执行 |

## 关闭与回滚

- 关闭这个功能（首选）：入口是构建期开关，不是在线开关。用当前源码发布一个开关关闭的构建（不传 `--allow-mainnet-card-funding`），耗时等于一次发布。功能代码仍在产物里，但入口不出现，购买宿主的块不会被下载。
- 更快的止损是在 Privy 控制台关闭 Card onramps。预期购买窗口拿不到报价、无法继续，而存款弹窗里的入口仍会显示；这一点没有验证，CF-11 时确认一次并记录。
- 回退到本功能合入之前的提交（例如怀疑 SDK 升级本身）：这是整版回退。在那个提交的检出里重新构建，并用它自己的 `deploy/cloudfront/deploy.mjs` 按[发布目录](../deploy/cloudfront/README.md)「日常发布」的完整顺序执行：`functions --execute`、`sync --execute`、两个分发的 `invalidate`、两个站点的 `verify`。先发布函数不能省：重新构建会得到新的内联脚本哈希，线上策略里没有它们时 `sync --execute` 会拒绝上传。不要把旧提交的产物交给当前检出的 `deploy.mjs`：当前版本要求 `build-meta.json` 带 `privyFiatFunding` 字段，旧产物没有这个字段，会被拒绝。旧提交的函数不含 Stripe 的 CSP 来源，回退后页面里也不再有用到它们的代码。这条路径没有演练过。
- 本应用只在浏览器里知道一次购买流程是怎么结束的：通知不随刷新恢复，也收不到服务商事后的退款或拒付。这些由服务商通过邮件通知用户；处理用户问题时以服务商的记录和链上到账为准。

## 证据模板

每行复制一份到仓库之外的记录里。

| 字段 | 值 |
| --- | --- |
| 行 | CF-N |
| 测试人 | <姓名> |
| 日期时间 | <YYYY-MM-DDTHH:mm:ssZ> |
| 提交与发布号 | <`/build-meta.json` 的 commit 与 release> |
| 站点与阶段 | <https://origin 或 localhost:3005；本地、沙盒发布或主网发布后> |
| 环境 | 沙盒或生产 |
| 钱包类型、设备、系统、浏览器 | <值> |
| 结果 | 通过或失败 |
| 说明 | <看到了什么，脱敏截图的位置> |
