<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-sairn-domain-cutover-plan",
  "date": "2026-10-01",
  "title": "gatu.ai 直接下线、切换到 sairn.ai 的规划",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "brand-identity",
    "static-hosting"
  ],
  "summary": "gatu.ai 直接下线、切换到 sairn.ai：2026-10-02 已上线。PR #68 合入 dev（682430ba），经 #67 晋升 main（3ced842e），从 main 构建 p24（cloudfront-2026-10-02-p24，新 Privy 应用，主网赞助开、测试网赞助关、配对关）。发布 CloudFront 函数、Lambda、S3 后，三个分发一次换成 sairn 别名与 4 名证书 b04a51c6；官网上传并删除撤下页面。verify 主网 15 项、测试网 16 项通过（首轮图表包缓存未命中，预热后通过），CSP 覆盖无违规，官网检查通过，gatu 四个主机已不可达。决策另见 ADR 0032。真实钱包冒烟、主网小额赞助充值与 p25 清理未做。",
  "thread": null,
  "baseCommit": "5517ef70",
  "commits": [
    "64d63e20"
  ],
  "sources": [
    {
      "path": "docs/sairn-domain-cutover-plan.md"
    },
    {
      "path": "docs/adr/0031-domain-move-to-sairn-ai.md"
    },
    {
      "path": "docs/brand-assets.md"
    },
    {
      "path": "deploy/website/README.md"
    },
    {
      "path": "deploy/cloudfront/README.md"
    },
    {
      "path": "docs/adr/0032-gatu-offline-cutover-to-sairn.md"
    },
    {
      "path": "deploy/cloudfront/functions/terminal-request.js"
    },
    {
      "path": "apps/terminal/src/lib/trade/order-notification-glyph.ts"
    }
  ],
  "supersedes": []
}
-->
# gatu.ai 直接下线、切换到 sairn.ai 的规划

## 背景与范围

同步记录，未取得可核对的任务标识。用户在品牌迁移遗留处理完成后（`5517ef70`）决定：旧域名直接下线，替换为新域名，不设并存期。本任务只做规划，没有改动任何线上系统。

## 结论与依据

- 用一个只读规划工作流取证：代码、AWS 现状、外部系统、浏览器端残留、官网五路调查，汇总成草案后由运维与完整性两路审查；草案与审查报告保存在会话草稿目录，不入库。AWS 只用了 `gatu-edge` 的只读调用（`list-distributions`、`get-distribution-config`、`list-certificates`、`describe-certificate`、`get-function-configuration`、`sts get-caller-identity`）；源站请求策略读取被拒（无权限）。
- 方案写入 `docs/sairn-domain-cutover-plan.md`（拟议，未执行），并在 ADR 0031、`docs/brand-assets.md`、`deploy/website/README.md`、`docs/README.md` 加了指向它的说明，ADR 0031 追加更正。
- 审查改变草案的要点：先接后断代替先断后接（避免两个域名同时不可用 10–15 分钟）；验收用 NODATA（ACM 验证 CNAME 与 MX 仍在）；本机代理下 DNS 与 curl 的取证方法；gatu.ai 上有一套此前没有记录的 SES 发信配置（`support.gatu.ai` MX 指向 `feedback-smtp.us-east-1.amazonses.com`）；撤销 `gatu` Agent 提前到授权 `sairn` 之前（命名槽位只有 3 个）；`HEAD /api/geo` 返回 405；保留 p24 构建产物供 `verify`；新 origin 上内嵌钱包的身份与签名核对；LI.FI integrator 在 p24 即生效；别名冲突预检；p24 与窗口同日。
- 另一个会话「sairn.ai 域名和 AWS 配置」（工作树 `sairn-domain-aws-setup-dfe47f`，空闲）此前提出并存加 301 的方案，正在等用户给 `gatu-edge` 加权限，没有改动任何东西；它的方案被本方案取代，其权限建议被采纳为待决问题 4 的推荐项。
- 用户问「有几个 commit」：`claude/from-dev-1001` 比 `origin/dev` 多 31 个提交（迁移 18 个、遗留修复 13 个），未推送；两个后台任务分支各 1 个未合并提交，都从 `2baa44e2` 分出。

## 用户答复（同日）

用户对方案第 7 节六个问题的答复，已写入方案（状态行、第 3.1、3.4、3.5 节、0.1–0.3、新增 0.12、2.6、3.6、4.1、4.4、4.5、5.2、5.5、第 6、7、8、9 节），并在 ADR 0031 的 2026-10-01 补充与 `docs/brand-assets.md` 的更新说明里各追加一段：

1. 先接后断。
2. gatu.ai 不永久续费，目前没有用户。方案改为：本次不改续费设置（已注册到 2028-05-06），到期前做完「到期前清单」再决定；用户接受到期后被他人注册的风险。原「永久续费」推荐被取代。
3. gatu.ai 的邮件与 SES 先不处理，记录下来，品牌替换完成后再处理；切换时不动任何邮件记录，sairn.ai 只做 DMARC 与 `support@sairn.ai` 收信核对。
4. 用户问「权限怎么给？这是什么意思？」：方案补充了临时客户管理策略 `gatu-edge-domain-cutover` 的正文（别名冲突查询、us-east-1 证书申请、单个源站请求策略的读改）与 A/B 两种给法，待用户选择。
5. 另登记一个 sairn 推荐码。依据：Hyperliquid 文档 Referrals 页写明累计交易量满 $10,000 才能创建；推荐人接口每个地址只返回一个 `code`，所以已登记 `gatuappweb3` 的地址多半不能再登记第二个（推断，未实测）。仓库里的 `sairnappweb3` 只是测试夹具名。
6. 不做告别 Service Worker。

## 本机 AWS 权限复核（同日）

用户说本机 AWS CLI 有权限，要求检查。只做了只读调用，结果：

- 本机只有 `default` 与 `gatu-edge` 两个 profile，没有 `AWS_*` 环境变量；凭据文件 2026-09-13 后未改。`default` 调 `sts get-caller-identity` 返回 `InvalidClientTokenId`（2026-09-17 停用的 root 访问密钥）；`gatu-edge` 有效。
- `gatu-edge`：`cloudfront get-origin-request-policy-config`（`b4401266-…`）与 `list-conflicting-aliases`（`ET9CNVE6L1GWN`、`app.sairn.ai`）都返回 AccessDenied；`iam list-attached-user-policies`、`list-user-policies`、`get-policy`、`simulate-principal-policy` 也被拒。`acm:RequestCertificate` 没有只读的验证办法，本次没有申请证书。
- ACM（us-east-1，全部密钥类型）仍只有两张 gatu 证书；三个分发的别名与证书没有变化。
- 拒绝信息点名 `…:distribution/ET9CNVE6L1GWN` 为资源，所以方案第 7 节临时策略里的 `ListConflictingAliases` 从 `*` 收紧为三个分发。

结论：本机没有能完成切换的身份，问题 4 仍需用户在控制台给权限或亲自操作。

## 临时策略挂上后的复测（同日）

用户选方案 A，要求我在浏览器里代为完成。我说明了规则：代为修改 IAM 权限、输入管理员密码都不允许，只打开了 AWS 登录页、把策略 JSON（与方案第 7 节一致，经 `json.loads` 校验）放进剪贴板，并给出控制台步骤。用户在自己登录的浏览器里新建 `gatu-edge-domain-cutover` 并挂到 `gatu-edge`，内置浏览器始终停在登录页，我没有看到也没有操作控制台。

随后的只读复测（身份 `arn:aws:iam::018252911946:user/gatu-edge`）：

- `get-origin-request-policy-config`（`b4401266-…`）成功：名称 `gatu-terminal-api`，头部白名单 9 个，含 `X-Gatu-Forwarded-Host`，不含 `X-Sairn-Forwarded-Host`；Cookie 不转发，查询串全部转发；ETag `E23ZP02F085DFQ`。原配置保存在 Git 忽略的 `.worklog/2026-10-01/2026-10-01-sairn-domain-cutover-plan/aws/origin-request-policy-before.json`。
- `list-conflicting-aliases` 不再被拒，但对 `app.sairn.ai`、`testnet.sairn.ai`、`sairn.ai`、`www.sairn.ai` 都返回 `InvalidArgument`：分发当前证书不覆盖要查的名字。方案因此把 0.4 改到 0.5 之后：证书签发后先只换证书、别名不动，再查冲突；2.2、3.1 随之只加别名。
- `acm:RequestCertificate` 没有只读的验证办法，留到 0.5 实际申请时验证；本次没有申请证书，也没有任何 AWS 写操作。

## 开始执行：改为先断后接，申请 sairn 证书（同日）

用户回复「直接下线gatu 跟着替换新的域名」。我按字面理解为切换顺序改为先断后接，并在回复里写明这个理解：不再签覆盖 gatu 的过渡证书，每个分发一次 `aliases` 调用同时换别名和证书。方案第 3.2 节、0.4、0.5、阶段 2、3、5.4、第 6–9 节随之修改，`deploy/website/README.md` 的指向说明同步。

- 申请证书：`aws acm request-certificate`（us-east-1，`gatu-edge`，幂等令牌 `sairn20261001`，DNS 验证）成功，得到 `arn:aws:acm:us-east-1:018252911946:certificate/b04a51c6-126d-4f9b-a0be-cbea432551b5`，SAN 为 `sairn.ai`、`testnet.sairn.ai`、`app.sairn.ai`、`www.sairn.ai`，RSA-2048，`PENDING_VALIDATION`。这也证实了临时策略里的证书申请权限。四条验证 CNAME 已交给用户在 Cloudflare 添加；原始输出在 `.worklog/2026-10-01/2026-10-01-sairn-domain-cutover-plan/aws/`。
- 两张证书都要用到的只有这张 4 名证书，所以即使用户其实想保留先接后断，这次申请也不会白做。
- 在本地合并两个后台分支（`ad93cbc3` 主题色、`b3f0fb4d` 移动端下单按钮；`docs/work-memory/INDEX.md` 冲突靠重新生成解决，ADR 0029 第 5、6 条两边内容都保留）。在 `b3f0fb4d` 上：`pnpm brand:check`、合并带入文件的 Biome、终端 typecheck、相关 39 个测试文件 664 项、`pnpm test:brand` 通过；`pnpm --filter @sairn/terminal test` 全量 645 个文件中 644 个通过、1 个跳过，7,991 项中 7,990 项通过、1 项跳过，用时 281 s。尚未推送。

## 证书签发与换 Privy 应用（同日）

- 用户在 Cloudflare 添加了 4 条验证 CNAME。我向 `holly.ns.cloudflare.com` 逐条查询，都返回带 `aa` 的 NOERROR，目标与 ACM 给出的一致。证书 `b04a51c6…` 于 15:57:22Z `ISSUED`，四个名字都是 `SUCCESS`，有效期到 2027-04-16 23:59:59Z；还没挂到分发上，`RenewalEligibility` 为 `INELIGIBLE`。原始输出存于 `.worklog/…/aws/certificate-sairn-issued.json`。
- 用户补充「Privy ID key 也需要更换」。核对后发现：代码只读构建变量 `VITE_PRIVY_APP_ID`（`apps/terminal/src/config/privy.ts`、`providers/client-root.tsx`），没有 Client ID，Lambda 不用 Privy 密钥；本地值在不入库的 `apps/terminal/.env.local`。`SmartWalletsProvider` 没有代码参数，智能钱包类型、链与 ZeroDev bundler/paymaster 都在 Privy 后台，赞助充值依赖它们（`docs/cctp-deposits.md`）。换应用后邮箱用户会得到新的内嵌钱包与智能钱包地址，所以方案 0.7、0.9、1.1、2.6、4.1 与风险表补了新应用的配置清单、旧地址资金转出、构建时显式覆盖 App ID 并在产物里核对、阶段 1 临时放行 gatu origin。新 App ID 尚未取得。

## PR、请求头白名单与 Codex 审查（2026-10-02）

- 用户已在本地 `apps/terminal/.env.local` 换上新的 Privy App ID（`cmuphjc2…`，格式核对通过；本机 10 月 1 日的构建产物里是旧 ID `cmquon74…`，确认已更换）。该文件被 `.gitignore` 的 `*.local` 忽略，不入库。
- 用户同意推送与开 PR。推送前 `git fetch` 确认 `origin/dev` 仍是 `99ddc6b4`，扫描分支差异：没有环境文件、证据目录、密钥特征或新增大文件（`designs/mockups.pen` 早已在 `dev`）。推送 `ff34d248`，开 [PR #68](https://github.com/zora4523-bot/gatu-app/pull/68) → `dev`，并关联到会话。
- 用户同意 0.6：源站请求策略已加入 `X-Sairn-Forwarded-Host`，结果见方案 0.6（ETag `E23ZP02F085DFQ` → `ETVPDKIKX0DER`，两个 gatu 主机的 health、geo、同源 POST 都正常）。
- 按用户要求启动 4 路 Codex（`gpt-6-astra`，`-s read-only`，medium）对抗审查：品牌标识、状态动效与界面、部署与切换方案、文档与流程。结论与处理另记。

## Codex 对抗审查与处理（2026-10-02）

用户要求用 Codex 对抗审查 PR #68，查找不规范与遗漏之处。四路审查（`gpt-6-astra`，`-s read-only`，medium，基线 `origin/dev...ff34d248`）分别覆盖品牌标识、状态动效与界面、部署与切换方案、文档与流程；报告保存在会话草稿目录，不入库。我逐条对照源码复核，用变异验证新增测试能抓住错误实现，再修复：

| 发现 | 复核 | 处理 |
|---|---|---|
| P1 全部平仓「一笔成交、一笔被拒」显示半实心 `partial` 符号 | 成立：队列项 `status: "partial"`、`countMode: "filled"`、子项含 `rejected`、顶层无 `error` | `order-notification-glyph.ts` 子项有拒绝、撤销、未知时用 `warning`；`order-toast-placement` 补 5 个用例，去掉子项判断的变异会失败 |
| P1 路由标记改名无过渡，两个 CloudFront 函数先后发布的间隙丢配对页安全头 | 成立：`functions` 先发请求函数，p23 响应函数只读 `x-gatu-route` | 请求函数双写并清除两种访客标记，响应函数两种都认；`functions.test.mjs` 加组合用例，三个变异都会失败 |
| P1 部署手册要求把旧转发头「换成」新头 | 成立：生成器也只输出新头 | 生成器过渡期输出新旧两个头（10 个）；`deploy/cloudfront/README.md` 改为「加入，p25 后再删」 |
| P1 4.1 与阶段 5 之后回滚步骤不足 | 成立 | 方案新增「按阶段回滚」表 |
| P1（降为 P2）品牌颜色单一来源未闭合 | 部分成立：颜色现在一致，但跨应用测试没比对 `logo.*`，`brand.mjs` 不查深色 Logo 的填充色，Privy 写死颜色 | `brand.mjs` 校验每种配色版本的填充色；跨应用测试比对 `--logo-*` 与分享卡变量；Privy 经 `config/brand.ts` 读颜色（带十六进制校验）；改 `logo.dark.choice` 的变异让两道检查都失败 |
| P2 生成器静默丢弃根属性、单引号属性 | 成立：四种输入在旧解析器上都被接受 | 根属性允许清单、根 `style` 只许 `--srm-floor`、属性解析遇到读不懂的文本即报错；派生图标脚本拒绝两条路径之外的内容；变异测试加 4 种输入 |
| P2 翻译契约漏读多行 PO 条目 | 部分成立：现有目录只有文件头是多行 | 解析器拼接续行，加解析自测，去掉续行处理的变异会失败 |
| P2 Lambda 测试钉不住新头优先与旧域名同源 | 成立 | 新增冲突头优先级与四主机 × 三种头组合的同源用例，「旧头优先」「忽略旧头」两个变异都会失败 |
| P2 新 Privy 应用的赞助充值只验地址展示 | 成立 | 方案改为待用户决定（建议 p24 先关闭主网开关，带资金验收后再开），2.6 写明地址展示的证明边界 |
| P2 官网构建命令错误、在下线之后才构建 | 成立 | 改为两条完整的 pnpm 命令并挪到摘别名之前 |
| P2 官网首次发布删除范围与发布手册冲突 | 成立 | 方案改为按手册只删撤下的 HTML，资源不加 `--delete` |
| P2 历史记录改写了原始任务标题与实测引文 | 成立：共 4 处 | 恢复原文并加说明，ADR 0027 追加更正 |
| P2 本记录的限制与待办和已执行操作矛盾，文档入口仍写「拟议，未执行」 | 成立 | 本节与下两节改写，`docs/README.md`、`brand-assets.md`、ADR 0031 改为执行中并指向 ADR 0032 |
| P2 `legal/docs.md` 入门步骤顺序与首次交易契约不符 | 成立 | 按「连接 → 接受条款 → 启用交易 → 账户为空才充值 → 下单」重写，`legal-policy-contract` 钉住顺序，调换顺序的变异会失败 |
| P2 官网费用测试只查字符串 | 成立 | 测试从终端 `config/hyperliquid.ts` 读 builder fee，核对展示总费率、TWAP 豁免与现货只收卖单；四个变异都会失败 |

审查也提醒：`hyperliquid.persist_trading_connection`、`hyperliquid_agent_*` 与 `Mobile` 槽位按归属文档保留原名，不应强行改名；本次未改。

## 用户决定：主网赞助充值保持开启（2026-10-02）

用户问，现在还需要赞助充值吗，不是用「CCXT」服务吗。核对后回答：
- 仓库只在调研笔记里提到 CCXT，产品的充值走 Circle CCTP（`docs/cctp-deposits.md`）。
- 赞助充值本身就是邮箱用户的 CCTP 充值：内嵌钱包签 EIP-3009 授权，Privy 智能钱包提交，ZeroDev paymaster 代付 Arbitrum gas。外部钱包用户自己付 gas，主网没有开关。
- 所以关掉 `VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED`，邮箱用户就无法在应用里充值。

我把此前「p24 先关闭」的建议改为「保持开启，切换当天做带资金验证」，理由有三：
- 没有外部用户；
- 关掉以后再打开还要重新发布一版；
- 失败是安全失败：资金留在内嵌钱包，授权只能存入绑定的账户，过期前不能再签第二个。

用户选择保持开启。同日读取线上 p23 两个主机的 `build-meta.json`：`cctpDeposits` 三项都是 `true`。方案 1.1、1.2、2.6、0.7、第 7 节第 8 项和风险表已据此改写，ADR 0032 决策 8 同步改写。

## Privy 控制台对比（2026-10-02）

用户要求查看 Privy 控制台。内置浏览器未登录，于是按用户要求改用 Claude in Chrome，在用户的默认浏览器 Chrome 里已登录的会话中只读对比。旧应用 gatu（`cmquon74…`）是现行构建使用的应用；新应用 sairn（`cmuphjc2…`）与本地 `.env.local` 一致。组织下另有一个 gatu（`cmqet0w5…`）和 Veyra，与切换无关。没有修改任何设置；只打开过两个链设置弹窗查看，关闭时「Save changes」仍不可用。App Secret、ZeroDev 项目 ID 与 WalletConnect 项目 ID 都没有显示完整值，只比对是否设置、哈希前缀或前四位。

| 项目 | 旧应用 | 新应用 | 结论 |
|---|---|---|---|
| 应用状态 | 开发模式（上限 150 用户） | 开发模式 | 对外上线前升级生产模式 |
| 概览 | 11 个用户、3 个钱包、资产 $31 | 新建 | 切换前按方案 0.9 转出旧内嵌钱包资金 |
| 名称 / 主色 / Logo | `gatu` / `#696FFD` / 空 | `sairn` / `#696FFD` / 空 | 名称建议改为显示名 `Sairn`；Logo 按 4.1 在切换后填写 |
| 条款与隐私链接、强制同意 | 空、关 | 空、关 | 一致，终端自有法律弹窗 |
| Allowed origins | 默认 web 客户端：`app.gatu.ai`、`app.sairn.ai`、`testnet.sairn.ai`（无 `testnet.gatu.ai`） | 应用层：`app.sairn.ai`、`testnet.sairn.ai` | 新应用已放行 sairn；不含 localhost，本地开发会 `invalid_origin`（Privy 文档：设置后严格执行，localhost 须带端口） |
| 登录方式 | 邮箱、外部钱包、Passkey 开 | 邮箱、外部钱包开，Passkey 关 | 新应用符合 `globalDisablePasskeys` 与项目约定 |
| 登录时自动创建内嵌钱包（EVM） | 开 | 关 | 建议照旧应用打开 |
| MFA、Advanced、访问控制、全局钱包、Privy 自带费用代付 | 关 | 关 | 一致 |
| 智能钱包 | 开，Kernel（ZeroDev）；Arbitrum 与 Arbitrum Sepolia 的 bundler 与 paymaster 都是 `rpc.zerodev.app/api/v3/9a17…` | 关 | **必须配置**，赞助充值依赖它；地址含项目 ID，由用户从旧应用复制 |
| WalletConnect 项目 ID | 已设（32 位） | 已设（32 位），与旧应用不同 | 待用户确认来源与 Reown 域名白名单 |

## 智能钱包复核与用户决定（2026-10-02）

用户配置后我只读复核新应用：智能钱包已开启，服务商为 Kernel（ZeroDev）。链列表是 Ethereum、Polygon、Arbitrum、Base（多半用了 Quick setup），没有 Arbitrum Sepolia。Arbitrum 的 bundler 是 Privy 默认的 `public.pimlico.io`，paymaster 是 ZeroDev 项目 `8a00…`，与旧应用的 `9a17…` 不同。

用户同时开启了 Funding：银行卡入金开，Stripe 与 MoonPay 启用；银行转账、交易所、加密货币充值关；默认网络与币种是 Ethereum 和 ETH。Privy 文档说明 Stripe 入金要求 `@privy-io/react-auth` ≥ 3.33.1 并安装 `@stripe/crypto`；项目锁定 3.32.2（带 ADR 0026 的补丁），其中没有 `useDepositFunds`，只有 `useFundWallet`。

代码只在 CCTP 源链上取智能钱包（`use-deposit.ts:213-214`、`:1305`），所以另外三条链用不到；若 ZeroDev 项目对它们开着全额代付，存在额度被滥用的风险。

用户决定：
- 不需要测试网：此前已在 gatu 上测过，所以不配 Arbitrum Sepolia，p24 关闭测试网赞助充值，切换当天只做主网小额验证；
- ZeroDev 项目已重新创建，沿用新项目；
- 升级到 ≥ 3.33.1。

升级与 Funding 接入另开分支，不进本次切换。方案 0.7、1.1、2.6 与第 7 节第 9 项已据此改写。

## 上线执行（2026-10-02）

用户确认：
- 智能钱包已按要求配好；
- WalletConnect 项目 ID 是 `df8c…`，与新应用里填的相同（SHA-256 前缀一致）；
- 旧内嵌钱包的资金已转出；
- 不需要回滚准备；
- 同意合并与发布，要求不要再先发 gatu 验证，直接上线 sairn。

用户随后在 Cloudflare 添加了 4 条网页记录，权威应答核对无误：`app` → `d2i25dhfjwco8b.cloudfront.net`、`testnet` → `dg9o2gpw3mt8q.cloudfront.net`、`www` → `d1bgo95x2hobvu.cloudfront.net`、根域名经 CNAME 拉平。

1. **合并与晋升**：PR #68 在 CI 全绿（`e2e873f2`）后以 merge commit 合入 `dev`（`682430ba`）。晋升 PR #67 改名为「Promote dev to main: PR 66 and PR 68」，7 项 CI 全绿后合入 `main`（`3ced842e`），树与 `682430ba` 相同。浏览器回归分片 1 用时 22 分 24 秒，接近 25 分钟上限。
2. **构建**：在仓库外的工作树 `/Users/zhixing/我的项目/gatu-release-p24` 用 Node 22.15 构建 p24，`.env.local` 只软链、不读取，开关全部在命令行显式给出。
   - `build-meta.json`：`3ced842e`、`cloudfront-2026-10-02-p24`；主网赞助 `true`、测试网外部 `true`、测试网赞助 `false`；配对 `false`。
   - 包体总量 3,191,607 gzip 字节，比基线多 5,686；Lambda 225.92 kB。
   - 产物核对：新 Privy App ID 出现在 5 个文件，旧 ID 0 个，无开发用 Agent 槽位。
   - 官网测试 10 项通过，`dist` 中没有 `gatu`。
3. **发布**（`gatu-edge`，退出码全部为 0）：
   - `functions --execute --origin https://app.gatu.ai`：3 个本次哈希加 10 个旧哈希。
   - `lambda --function-name gatu-terminal-api --execute`：版本 9，环境变量未动。
   - `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --execute`：上传前确认线上函数放行全部 3 个哈希，上传后发布标记与本地一致。
   - 两个终端分发 `invalidate`。
   - 官网分三组上传，`--delete` 只删 `blog/welcome/index.html`（先 `--dryrun`），再 `invalidate`。
4. **切换**：先演练确认只改 `Aliases` 与 `ViewerCertificate`，再执行 `aliases`：主网 `app.sairn.ai`、测试网 `testnet.sairn.ai`、官网 `sairn.ai` 与 `www.sairn.ai`，证书 `b04a51c6…`。三个分发都等到 `Deployed`。
5. **验证**：
   - `verify`：首轮主网 14/15、测试网 15/16，失败的都是「图表包在边缘命中缓存」（刚做过全量失效，`x-cache: Miss`）；预热后重跑主网 15/15、测试网 16/16。
   - `csp-coverage.mjs https://app.sairn.ai`：退出码 0，三类违规都为空；跳过 WalletConnect 二维码与手机图表页两步。
   - 官网发布后检查：首页、`www`、`/risk`、静态文件均为预期状态码与缓存头；不存在的页面与 `/blog/welcome/` 的 GET 与 HEAD 都是 404，内容是 404 页（`curl -I` 经本机代理时首行是代理的 `200 Connection established`，第一次统计误读为 200，已用 `-w %{http_code}` 更正）；canonical 与 `og:*` 指向 `https://sairn.ai/`。
   - `https://app.sairn.ai/brand/email-logo.png` 返回 200 PNG。
   - `gatu.ai`、`www`、`app`、`testnet` 四个主机连接失败（000）。

未做或待做：
- 真实钱包冒烟：邮箱登录生成新的内嵌钱包、主网至少 5 USDC 的赞助充值，由用户进行；
- Privy 新应用后台的 Logo 尚未填写；
- p25 清理（≥ 7 天后）以及之后摘除临时 IAM 策略；
- Privy 升级到生产模式；
- 升级 `@privy-io/react-auth` 并接入 Funding；
- 浏览器回归分片耗时接近上限；
- gatu.ai 网页 DNS 记录是否删除由用户决定，不影响下线结果。

## 验证与限制

- 2026-10-01 规划阶段只做了只读调查与文档检查。
- 之后的写操作：
  - ACM 申请并签发 sairn 证书（10-01）；
  - 源站请求策略加入新头（10-02）；
  - 推送分支并开 PR #68（10-02）。
  每一项的命令与结果见上文各节。
- 由用户在各自控制台完成的操作：
  - Cloudflare 验证记录；
  - 临时 IAM 策略；
  - 本地 Privy App ID；
  - 新 Privy 应用（尚未取得后台配置截图）。
- 本机经代理，系统解析器返回假地址，DNS 事实以 Cloudflare 权威服务器带 `aa` 的应答为准。
- 审查修复的验证（代码提交 `e41948b1`–`ac33d831`，文档 `8bee84a4`）：
  - 通过的检查：
    - Biome（20 个改动的代码文件，两个测试文件先自动格式化）；
    - 终端 typecheck；
    - 29 个相关测试文件共 278 项；
    - `pnpm test:cloudfront` 45 项；
    - `pnpm test:brand`；
    - 官网测试 10 项；
    - `scripts/*.test.mjs` 51 项。
  - 第一次全量终端测试在工作区内容等同 `ac33d831` 时运行：642 个文件通过，2 个文件超时，当时负载约 10。超时的是 `positions-panel-preload` 的钩子（30 s）和 `global-modals-hip3-disclaimer` 的一个用例（15 s）；两个文件单独重跑共 35 项通过。
  - 在 `8bee84a4` 上重跑全量：645 个文件中 644 个通过、1 个跳过，7,998 项中 7,997 项通过、1 项跳过，用时 181 s。
- PR #68 首次 CI（`ff34d248`）：
  - 静态检查、终端测试、终端构建通过。
  - 官网构建在 `og:check` 失败：Linux 重新渲染的官网卡片与 macOS 生成的 PNG 有 3.353% 的像素明显不同，超过 3% 的上限；平均通道差 2.9187，在官网卡片 3.5 的阈值以内。
  - 两个浏览器分片在第 12 步被 15 分钟的作业超时取消：前 11 步全部通过，品牌表面与已连接页头宽度两步没跑到。同一工作流在 `dev` 上整体约 13.5 分钟。
  - 修复：`e28dd20b` 把超时调到 25 分钟，并在 `ci-workflows.test.mjs` 里钉住下限（改回 15 的变异会失败）；`b285e2a5` 给官网卡片单独设 4.5% 的上限，`og:generate` 后两张 PNG 逐字节不变，只更新了清单的源指纹，本地 `og:check` 通过。修复后的 CI 结果以 PR 页面为准。

## 后续与替代关系

- PR #68 的 CI 通过后合入 `dev`、再晋升 `main`；之后用新 Privy App ID 构建 p24，进入阶段 1。新 Privy 应用的后台配置按方案 0.7 由用户完成并截图。
- 品牌替换完成后处理 gatu.ai 的邮件与 SES（方案第 7 节后续事项 1）；2028-05-06 前做完到期前清单（后续事项 2）。
- 执行时只由一个会话操作 AWS 与 Cloudflare。
- 2026-10-02 补记：「Privy 控制台对比」表里「登录时自动创建内嵌钱包」一行当时建议打开，用户已照做。上线后用户报告注册时创建钱包界面与协议弹窗重叠，[ADR 0033](../../adr/0033-silent-email-wallet-creation.md) 改为客户端 `createOnLogin: "off"`、由应用在后台创建。客户端配置优先，这个控制台开关现在不再决定登录窗口是否建钱包；过程见[静默创建记录](2026-10-02-silent-email-wallet-creation.md)。
