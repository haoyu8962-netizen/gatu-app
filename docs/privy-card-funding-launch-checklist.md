# 银行卡入金上线验收清单

更新：2026-10-02。范围：[ADR 0034](adr/0034-privy-card-funding.md)「上线前提」的逐项验收。状态：两个开关在仓库默认值与线上构建里都是关闭；下表除注明外均未执行。这是人工清单，没有校验脚本。

本文件只记录要求和已核对的事实。填好的证据（截图、交易号、测试账户）保存在仓库之外；不要记录卡号、证件、手机号、验证码或访问令牌。

## 发布规则

分两步，顺序不能反：

1. **公开发布之前**：CF-1 至 CF-8、CF-10 都要有结论，其中 CF-2 至 CF-7 须在前台浏览器窗口里由人操作并记录为通过。这些行都不需要先发布带开关的构建：沙盒用测试网模式；真实购买（CF-7）在不对外公开的环境里做，目前是本地带主网开关的构建（2026-10-02 实测线上使用的 Privy 应用可以从 `localhost:3005` 登录并打开购买窗口；以后若收紧该应用允许的来源，改用允许列表里不公开的来源）。
2. **发布与发布之后**：按 CF-9 的顺序发布打开 `VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED` 的构建，随后在线上做 CF-11 的冒烟检查。任何一步失败按「关闭与回滚」处理。

开关关闭的发布不需要本清单，也不代表入金已验收。单元测试、夹具浏览器测试和下面「已核对的事实」都不能代替这些行。

## 已核对的事实（2026-10-02）

| 事实 | 依据与范围 |
| --- | --- |
| 本地 `apps/terminal/.env.local` 与线上 `app.sairn.ai`（发布 p24）使用同一个 Privy 应用，即控制台里名为 Sairn 的应用 | 脚本在线上首屏的 130 个脚本里找到 5 个含本地应用 ID（不输出值）；控制台里该应用的 ID 与本地值相等 |
| 该应用 Funding 页：Card onramps 已开启，Stripe 与 MoonPay 为 Enabled，Meld 未配置；Bank transfer、Exchange、Crypto deposits 关闭。页面注明未做 Meld KYB 时只支持 Stripe 的 USD、EUR 与 MoonPay 的 AUD、BRL | 用户 Chrome 里已登录的 Privy 控制台，只读查看，没有改任何设置 |
| 控制台提示该应用处于 development mode（Upgrade to production） | 同上。它对线上用户数或入金的限制没有查证 |
| 生产构建在强制 CSP 下能打开购买窗口，USD 100 有可用报价 | 本地 Nitro 预览（见「测量注意」）、邮箱会话、主网；`Continue` 可用，没有点击 |
| 选择页出现时宿主块已下载；点击「购买」后 22–29 ms Privy 发出第一个请求 | 同上，两次。时间取自资源计时，不受下一条的影响 |
| Stripe SDK 脚本、`api.stripe.com`、`link.com` 的请求以及 `js.stripe.com`、`hooks.stripe.com` 的框架没有触发违规；对照的 `example.com` 三类都被拦截 | 同一页面里用 preload、no-cors 请求和隐藏 iframe 探测策略，没有执行 Stripe 流程 |

没有做：点击 `Continue` 之后的任何步骤（会把登录邮箱交给服务商并要求手机号与身份信息）、沙盒购买、真实购买、外部钱包、手机与 PWA。

### 测量注意

- Claude in Chrome 操作的窗口被其他窗口遮挡时，`document.visibilityState` 是 `hidden`：Chrome 把定时器对齐到 1 秒（实测 15 ms 的定时器要 590–1001 ms），也不出帧。Privy 用 15 ms 的定时器打开窗口，关闭动画要等出帧，所以在这种窗口里看到的「点击后约 0.7–1 秒才出现」「关闭后留一个空白框」都是该状态造成的，不是产品行为；同一状态下页面加载后的第一次点击要先截图出一帧才会命中。前一轮记录的「8–14 秒」也属于这一类（当时还叠加了开发服务器与机器负载）。
- 生产构建在本地预览时，IP 归属服务不认回环地址，`/api/geo` 返回不可用，存款与购买入口会按设计保持关闭。上面的观察用了一个只回答 `/api/geo`（GB）并转发其余请求的本地代理；应用代码没有为此改动。
- 因此时间与动画的结论只能在前台窗口由人确认，对应 CF-2。

## 准备

1. 沙盒在本地做：带两个开关启动开发服务器（`VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm --filter @sairn/terminal exec vite dev --port 3005 --strictPort`），在 Settings → Network 切到 Testnet。该钱包第一次用 Testnet 时会先要求接受条款（钱包签名）。购买窗口应显示 `You're in a sandbox environment`。沙盒不动真钱，目的链仍是 Arbitrum 主网，不会到账。
2. Stripe 沙盒测试值（Privy 文档）：金额低于 200 美元；美国或欧盟手机号；验证码 `000000`；卡号 `4242 4242 4242 4242`、任意三位 CVC、未来的有效期。
3. 线上测试网站点当前没有打开邮箱钱包的测试网存款（`build-meta.json` 的 `cctpDeposits.testnetSponsoredWallet` 为 false），购买入口会随存款一起不可用；在那里做沙盒要用外部钱包，或者先打开该开关。
4. 真实购买在本地带主网开关的构建上做（同第 1 条的命令，界面保持 Mainnet），用服务商允许的最低金额。这是真实扣款，收款地址是当前登录的 owner 钱包。

## 清单

| ID | 场景 | 要求的结果 | 状态 |
| --- | --- | --- | --- |
| CF-1 | Privy 控制台 Funding 页 | Card onramps 开启并记录服务商；决定是否做 Meld KYB；确认 development mode 是否要升级 | 部分：2026-10-02 只读核对 Card onramps 已开启（Stripe、MoonPay）；Meld 与 development mode 待业务决定 |
| CF-2 | 沙盒购买，邮箱钱包，桌面前台窗口 | 存款弹窗先显示两个入口；选「购买」后弹窗关闭、购买窗口随即出现并带沙盒提示；用测试值走完；通知为「Card purchase confirmed」，或过早关闭时为常驻的「Card purchase submitted」；通知不声称到账 | 未执行 |
| CF-3 | 沙盒里在三种时机关闭窗口 | 付款之前关闭（金额、支付方式、身份资料各步）：没有通知，再次打开时两个入口可用。付款处理中关闭（服务商确认中、Stripe 结账进行中）：常驻的「Card purchase submitted」。窗口里已经显示错误之后关闭：卡被拒、服务商报告失败或取消为红色的「Card purchase did not complete」，其他错误为常驻的「Card purchase status unknown」。任何情况都不出现服务商的原始错误文本 | 未执行 |
| CF-4 | CSP 与权限，随 CF-2 全程开着控制台 | 没有 `Refused to …` 或 `securitypolicyviolation`；记录 Apple Pay、Google Pay 与页内摄像头证件验证是否出现、能否完成（现行 `permissions-policy` 下预期不可用）。证件验证因此无法完成时，先做 ADR 0034 第 10 条的决定 | 未执行；策略探测见上表 |
| CF-5 | 外部钱包，桌面 | 选择页写明从已连接钱包存入并提示需要 ETH；记录购买流程是否要求所有权签名、出现在哪一步；通知带 ETH 说明；之后选「转入」能完成存款 | 未执行 |
| CF-6 | 手机浏览器（iOS Safari、Android Chrome）与已安装的 PWA | 选择页是底部抽屉，两个入口完整可见，返回可用；购买窗口可操作，键盘弹出时继续按钮可达；关闭后回到页面 | 未执行；夹具只覆盖 375 px 的选择页 |
| CF-7 | 最低金额真实购买，本地带主网开关的构建 | USDC 到达与所选 Hyperliquid owner 相同的地址（区块浏览器核对）；随后存款弹窗里完成一次 CCTP 存款并到账 | 未执行 |
| CF-8 | 法律文本 | [草案](privy-card-funding-legal-draft.md)经合格法律审阅后写入 `legal/`、两个路由面，并更新 Last Updated | 未执行；草案待审 |
| CF-9 | 发布顺序 | 先 `deploy.mjs functions --execute` 发布含 Stripe 来源的响应函数，再发布带开关的构建并传 `--allow-mainnet-card-funding`；线上 `/build-meta.json` 的 `privyFiatFunding.mainnet` 为 true；`apps/terminal/tests/browser/csp-coverage.mjs` 通过 | 未执行 |
| CF-10 | 地区与币种 | 业务确认实际可用的地区：Stripe 只在美国（不含纽约州）与欧盟提供，而美国在本终端的地区限制里；MoonPay 目前只有 AUD、BRL。不传 `source.assets` 时 Privy 3.46.0 的币种列表有 49 种（读产物得出），而未做 Meld KYB 时只有 USD、EUR、AUD、BRL 有服务商；决定是否把列表收窄到这四种 | 未决定 |

| CF-11 | 发布后冒烟，线上主网 | `/build-meta.json` 的 `privyFiatFunding.mainnet` 为 true；存款弹窗先显示两个入口；选「购买」后窗口打开到金额页并有报价；关闭后没有通知。是否再做一次最低金额购买由业务决定 | 未执行 |
| CF-12 | 异常与恢复，沙盒 | 断网时选「购买」：出现「Card purchase could not open」或购买窗口里的错误，入口恢复可用。购买窗口打开期间登出或换账户：结果不显示给新账户，回到原账户后才显示。同一账户在两个标签页各发起一次：记录服务商与 Privy 的表现（本应用「同时只有一笔」的限制只在单个页面内）。服务商不支持所在地区：提示留在购买窗口里，关闭后按 CF-3。读屏与键盘：两个入口、返回、关闭都可达并有名称 | 未执行 |

## 关闭与回滚

- 入口是构建期开关，不是在线开关。关闭它要发布一个开关关闭的构建（不传 `--allow-mainnet-card-funding`），耗时等于一次发布。
- 更快的止损是在 Privy 控制台关闭 Card onramps。预期购买窗口拿不到报价、无法继续，而存款弹窗里的入口仍会显示；这一点没有验证，CF-11 时确认一次并记录。
- 回滚到本功能之前的版本：用那个版本的源码重新构建再发布。当前的 `deploy.mjs` 会拒绝 `build-meta.json` 里没有 `privyFiatFunding` 字段的旧产物（见 [发布闸门](../deploy/cloudfront/README.md)）。
- 本应用只在浏览器里知道一次购买流程是怎么结束的：通知不随刷新恢复，也收不到服务商事后的退款或拒付。这些由服务商通过邮件通知用户；处理用户问题时以服务商的记录和链上到账为准。

## 证据模板

每行复制一份到仓库之外的记录里。

| 字段 | 值 |
| --- | --- |
| 行 | CF-N |
| 测试人 | <姓名> |
| 日期时间 | <YYYY-MM-DDTHH:mm:ssZ> |
| 提交与发布号 | <`/build-meta.json` 的 commit 与 release> |
| 站点 | <https://origin 或 localhost:3005> |
| 环境 | 沙盒或生产 |
| 钱包类型、设备、系统、浏览器 | <值> |
| 结果 | 通过或失败 |
| 说明 | <看到了什么，脱敏截图的位置> |
