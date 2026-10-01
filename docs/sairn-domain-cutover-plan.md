# gatu.ai 下线、切换到 sairn.ai：执行方案

> **状态：执行中（阶段 0）。** 2026-10-01 用户决定「旧的直接下线、替换为新的」：不设新旧并存期，不做 301 跳转。同日用户答复了第 7 节的问题：gatu.ai 不永久续费；gatu.ai 的邮件与 SES 等品牌替换完成后再处理；另登记一个 sairn 推荐码；不做告别 Service Worker；权限按方案 A，由用户在控制台给 `gatu-edge` 挂上了临时策略。切换顺序起初选先接后断，开始执行时用户改为「直接下线 gatu，跟着替换新的域名」，即先断后接（第 3.2 节）。本文据此替换 [ADR 0031](adr/0031-domain-move-to-sairn-ai.md) 决策 5、7 与 [品牌标识与素材](brand-assets.md)「域名切换到 sairn.ai」中的并存与跳转步骤。已执行的步骤在步骤表里写明结果，其余命令都没有执行；执行前在 PR-A 新增 ADR 0032 记录这些决定，执行后补执行记录。标注：【核实】有命令或文件依据；【推断】未实测。

## 1. 目标与约束

**目标**：在一个维护窗口里，让终端（主网、测试网）和官网从 gatu.ai 换到 sairn.ai。gatu 先下线、sairn 随即接上；目前没有用户，接受两者都打不开的几分钟空档。窗口结束后 gatu.ai 不再提供任何网页。

**约束**

- 没有并存期，也没有 301。旧链接、书签、已安装的 PWA、旧推荐链接全部失效；浏览器存储按 origin 隔离，设置、登录和本地 Agent 私钥都不会带到新域名（`docs/trading-onboarding.md`「Stay Connected」）。
- DNS 永远最后切，每一步都用权威 DNS 和 AWS API 核对（`deploy/cloudfront/README.md` 记录的 2026-09-15 证书事故）。
- 两个终端分发共用一个 S3 桶、一个 Lambda 和一个源站请求策略；网络按主机名判断，主机名认不出来时回退到本地存储，再回退到主网（`apps/terminal/src/lib/network.ts:29-44`）。所以线上构建必须先认得新主机名，才能把新主机名挂到分发上，否则测试网会跑成主网。
- 线上终端仍是 p23（`121e8e76`），只认 gatu、只写旧转发头 `x-gatu-forwarded-host`。改名代码在 `claude/from-dev-1001`，尚未推送。
- `gatu-edge` 能改三个分发的别名与证书、发布两个终端函数、上传文件、更新 Lambda 代码；**不能**申请或删除 ACM 证书、读改源站请求策略、改 Lambda 环境变量、读官网函数 `gatu-rewrite-index`（`deploy/cloudfront/iam/gatu-edge-release-policy.json`）。本机 `default` 是已停用的 root 密钥。证书申请、源站请求策略读写与别名冲突查询由 2026-10-01 挂上的临时策略补上（0.1）。

## 2. 现状（2026-10-01 只读核对）

| 项目 | 现状 |
|---|---|
| 分发 | 主网 `ET9CNVE6L1GWN`（`d2i25dhfjwco8b.cloudfront.net`，别名 `app.gatu.ai`）；测试网 `E3Q2SAX402CR9F`（`dg9o2gpw3mt8q.cloudfront.net`，`testnet.gatu.ai`）；官网 `EP2DIBP3T7M3G`（`d1bgo95x2hobvu.cloudfront.net`，`gatu.ai`、`www.gatu.ai`）【核实：`aws cloudfront list-distributions --profile gatu-edge`】 |
| ACM（us-east-1） | 只有两张 gatu 证书：`548ac30d…`（gatu.ai、www，2027-02-03 到期）、`ff5677c6…`（app、testnet，2027-04-01 到期）；2026-10-01 已申请 sairn 证书 `b04a51c6…`（`sairn.ai`、`www`、`app`、`testnet`，RSA-2048，DNS 验证，见 0.5）【核实：`aws acm list-certificates`、`describe-certificate`】。gatu 的验证 CNAME 仍在 gatu.ai 区里【核实：`describe-certificate` 加权威 DNS】 |
| Lambda `gatu-terminal-api` | 环境变量只有 `GATU_TRUST_VIEWER_ADDRESS=true` 与 `IPDATA_API_KEY`；新代码在 `SAIRN_TRUST_VIEWER_ADDRESS` 未设置时按 true 处理（`apps/terminal/src/edge/lambda-handler.ts:176`） |
| 源站请求策略 `b4401266-…`（`gatu-terminal-api`） | 2026-10-01 挂上临时策略后读出：头部白名单 9 个（`Origin`、`X-Gatu-Forwarded-Host`、`CloudFront-Viewer-Address`、`Accept`、`CloudFront-Viewer-Country`、`Referer`、`User-Agent`、`Sec-Fetch-Site`、`Content-Type`），Cookie 不转发，查询串全部转发，ETag `E23ZP02F085DFQ`；原配置存于 Git 忽略的 `.worklog/2026-10-01/2026-10-01-sairn-domain-cutover-plan/aws/`。CloudFront 上限 10 个【核实】 |
| 本机 AWS 身份（2026-10-01 复核） | 只有两个 profile。`default` 的密钥无效（`InvalidClientTokenId`，即 2026-09-17 停用的 root 访问密钥；凭据文件 9 月 13 日后没有改过）；`gatu-edge` 有效。`gatu-edge` 实测：`get-origin-request-policy-config` 与 `list-conflicting-aliases` 都返回 AccessDenied；`iam list-attached-user-policies`、`get-policy`、`simulate-principal-policy` 也被拒，所以 `acm:RequestCertificate` 只有实际申请才能验证，本次没有申请。ACM 仍只有两张 gatu 证书，三个分发的别名没有变化【核实：只读调用】。同日用户按方案 A 挂上临时策略后复测：读源站请求策略成功；`list-conflicting-aliases` 不再被拒，但对四个 sairn 名都返回 `InvalidArgument`（分发当前证书不覆盖要查的名字，见 0.4）；`acm:RequestCertificate` 留到 0.5 实际申请时验证 |
| sairn.ai | 2026-10-01 11:40:28Z 在 Cloudflare 注册；有 Email Routing 的 MX 与 SPF；没有 DMARC、CAA；网页主机名都没有记录；SOA 负缓存 1800 s【核实：权威服务器】 |
| gatu.ai | 网页记录：apex（CNAME 拉平，TTL 60）、`www`、`app`、`testnet`（CNAME，TTL 300）；邮件：Email Routing、SPF、DMARC `p=none`；另有一套**仓库从未记录的 Amazon SES 发信配置**：`support.gatu.ai` MX `feedback-smtp.us-east-1.amazonses.com`、SPF `include:amazonses.com`【核实：权威服务器】；注册到 2028-05-06 |
| HSTS | 只有 `app`、`testnet` 下发（一年、`includeSubDomains`、无 preload），apex 不下发 |
| Service Worker | 线上 v9，导航先返回缓存的壳（`apps/terminal/public/sw.js`） |

另外两点会影响执行：

- 另一个会话「sairn.ai 域名和 AWS 配置」（工作树 `.claude/worktrees/sairn-domain-aws-setup-dfe47f`）做过只读核对，提出了并存加 301 的方案，正在等你给 `gatu-edge` 加权限，没有改任何东西。它的方案被本文取代，执行时只保留一个会话操作 AWS 和 Cloudflare。
- 两个后台任务各有 1 个未合并提交（`claude/awesome-hypatia-e96adf` 的 theme-color、`claude/brave-mestorf-f0cab6` 的移动端下单按钮），都从 `2baa44e2` 分出，要先合进 `claude/from-dev-1001` 再一起走 PR。

## 3. 设计

### 3.1 「下线」的含义

- **做**：三个分发摘掉 gatu 别名；删除 gatu.ai 的 apex、`www`、`app`、`testnet` 网页记录。之后这些主机名没有 A/AAAA/CNAME 答案（因为 ACM 验证 CNAME 还挂在子名下面，权威返回的是 NODATA 而不是 NXDOMAIN；apex 有 MX，同样是 NODATA）。
- **不做**：不删 Cloudflare 区，不做 301，不动任何邮件记录。gatu.ai 的邮件与 SES 等品牌替换完成后再处理（第 7 节后续事项 1）。
- **不永久续费**（用户 2026-10-01 决定）：gatu.ai 已注册到 2028-05-06，本次不改它的续费设置，到期前再决定续不续。用户接受的风险：域名到期后如果被别人注册，对方可以签出合法证书，在 `app.gatu.ai` 上读取旧 origin 的浏览器存储（Stay Connected 打开时 Agent 私钥明文存在 localStorage），或借 SW 更新装入自己的脚本；还可能借 `@gatu.ai` 邮箱找回第三方账号，或冒用旧品牌钓鱼。HSTS 挡不住拿到合法证书的新持有者。目前没有外部用户，这些风险只落在团队自己的设备和账号上，由第 7 节后续事项 2 的「到期前清单」覆盖。

### 3.2 先断后接（2026-10-01 用户改定）

用户起初选先接后断，开始执行时改为「直接下线 gatu，跟着替换新的域名」。每个分发用一次 `aliases` 调用，把 gatu 别名和 gatu 证书一起换成 sairn 别名和 sairn 证书：分发 `Deployed` 时 gatu 即下线；随后在 Cloudflare 加 sairn 的 CNAME，sairn 上线。

| 证书 | 名字 | 用途 |
|---|---|---|
| sairn 证书 `b04a51c6…` | `sairn.ai`、`www`、`app`、`testnet`，共 4 个 | 三个分发共用；2026-10-01 已申请（0.5） |

代价与处理：

- 从别名替换生效到 sairn DNS 生效之间，两个域名都打不开，预计几分钟；公共解析器如果已经缓存了 sairn 名的否定答案，最长还要等 1800 s。目前没有用户，可以接受；验收用权威 DNS 和 `curl --resolve`，不受这层缓存影响。
- 无法预检别名冲突：CloudFront 只在分发当前挂的证书覆盖待查名字时才回答（0.4），而 sairn 证书不覆盖现有 gatu 别名，所以换证书和换别名必须同一次完成。如果 sairn 名被别的分发占用，替换会整体失败、不改动任何东西，gatu 照常在线，再按 AWS 文档处理冲突后重试。
- 回滚：用同一命令换回 gatu 别名和原证书，按 0.2 的快照恢复 gatu DNS。

### 3.3 两次发布

- **p24（切换前）**：从合并后的 `main` 构建，仍认得 gatu 主机名（`domains.legacy`），请求函数同时写新旧转发头，Lambda 先读新头再读旧头。p24 先发布到现有的 gatu 主机，做完真实钱包验收再进窗口。p24 认得两组主机名，所以别名的任何顺序、任何回滚都不会把测试网当主网。**进入窗口后不能再回滚到 p23**（p23 不认 sairn）。
- **p25（稳定后）**：删除旧域名组和请求头过渡代码（第 4.2 节），只在 gatu 别名全部摘除、源站请求策略确认含 `X-Sairn-Forwarded-Host` 之后发布。

p24 发布到窗口之间，站内推荐链接、法律页链接、站点地图都已指向还解析不了的 sairn 主机，所以 p24 与窗口安排在**同一天**，间隔 1–2 小时，期间不对外分享链接。

### 3.4 不做告别 Service Worker（已决定）

用户确认目前没有外部用户。旧访客的 v9 SW 会留着缓存的旧应用。不另建墓碑分发，靠四件事让残留失效：在 Hyperliquid 撤销 `gatu` Agent（旧私钥随之作废）；在 Privy 删除旧 origin（旧应用无法再登录）；团队设备手动清除站点数据；gatu.ai 到期前做完「到期前清单」。如果切换前出现了外部用户，要重新评估告别方案：另建墓碑分发挂 gatu 别名，返回自注销 SW 和迁移页，保留若干天后再删 DNS，需要新的代码与 ADR。

### 3.5 备选方案

| 方案 | 不采用的原因 |
|---|---|
| 并存加 301（原 ADR 0031、另一个会话的方案） | 用户决定不并存；301 还要求先改 SW 放行 `/sw.js` 并提供自注销 SW |
| 先接后断（过渡证书覆盖新旧 8 个名字，窗口内新旧短暂同时可用） | 原推荐，用户起初选定；开始执行时用户改为直接下线 gatu：没有用户，不需要 gatu 在切换中保持可用，省掉过渡证书、提前换证、别名冲突预检与第二次换证 |
| 切换版本直接删 legacy | 必须先摘别名再上传，窗口内两个域名都不可用；回滚还要另备一份认两组的构建 |
| 永久续费 gatu.ai（原推荐） | 用户决定不永久续费：目前没有外部用户，风险由到期前清单覆盖 |
| 切换时就删除 gatu.ai 区或停止续费 | 邮件与 SES 推迟处理，区里的邮件记录还在用；5.4 删除证书之前还要用区里的 ACM 验证记录 |
| 只签 sairn 证书、窗口前预建 DNS | 可行，空档约 3–5 分钟，但违反「DNS 最后切」，且新证书一签发，证书透明度日志会引来扫描，公共解析器可能提前缓存 NODATA（最长 1800 s） |

## 4. 仓库改动

### 4.1 PR-A：切换前合入 `dev` → `main`（p24 从 `main` 构建）

1. 把两个后台任务的分支合进 `claude/from-dev-1001`，`pnpm memory:index`，全量检查。
2. 只改文档，不动域名代码：新增 ADR 0032（硬切换决策、先断后接、不永久续费与到期前清单、邮件推迟、新推荐码、p24/p25、证书、不做告别 SW）；ADR 0031 追加「被 0032 取代」（「无 MX」已过时、HSTS 理由偏弱、不永久续费三处更正已在 2026-10-01 的补充里）；`docs/brand-assets.md` 的上线顺序改为指向本文；`deploy/cloudfront/README.md`（`:10` 变量实际未设置、`:31` ACM 现状、`:73` 超时 30 s）；`deploy/website/README.md`（证书与别名改为替换、首次发布 `--delete`）；`AGENTS.md` Brand identity contract 一句；`CHANGELOG.md`；`docs/brand-migration-plan.md` 实施状态。
3. CI 全绿后 `gh pr create --base dev`，再开 `dev → main`，都用 merge commit。推送前征得你同意。

### 4.2 PR-B：p25 清理

`brand/brand.json` 删除 `domains.legacy`；`scripts/brand.mjs` 只校验主组，并新增退役名单让 `gatu.ai` 一旦再出现就报错；`config/brand.ts`、`config/public-origins.ts`、`lib/network.ts` 只认主组；删除 `LEGACY_FORWARDED_HOST_HEADER` 回退（`edge/lambda-handler.ts`）和请求函数的旧头双写（`deploy/cloudfront/functions/terminal-request.js`）；测试改为断言 gatu 主机返回 null、只带旧头被忽略（`public-origins`、`network-storage`、`referral-join`、`lambda-handler`、`functions.test.mjs`）；文档同步（`docs/brand-assets.md` 旧域名组一段、`brand/README.md`、ADR 0027/0031 追加「已退役」）。

## 5. 执行步骤

角色：**[你]** 在 Cloudflare、Privy、钱包与 AWS 控制台操作；**[E]** `gatu-edge` 命令行（由我执行，需要你确认）；**[仓库]** 代码与构建。

### 阶段 0：准备（不影响线上）

| # | 步骤 | 执行者 | 验证 |
|---|---|---|---|
| 0.1 | 权限（问题 4）：用户选 A，2026-10-01 已在 IAM 控制台新建临时策略 `gatu-edge-domain-cutover`（正文同第 7 节）并挂到用户 `gatu-edge`；0.5、0.6 与 5.2 由我用命令行做，5.2 完成后你摘除并删除这份策略 | [你]，已完成 | 读源站请求策略成功、证书申请成功（0.5）【核实】 |
| 0.2 | Cloudflare：确认 sairn.ai 在项目账号下，sairn.ai 开自动续费和转移锁；gatu.ai 的续费设置本次不改（已注册到 2028-05-06，不永久续费，第 3.1 节）；导出 gatu.ai 区全部记录（含 `support.gatu.ai`、`*._domainkey`、`_…acm-validations`） | [你] | 截图与导出文件 |
| 0.3 | 邮件（只涉及 sairn.ai）：加 `_dmarc`；`support@sairn.ai` 实测收信（法律页和支持页写的就是这个地址）。gatu.ai 的邮件与 SES 本次不动（第 7 节后续事项 1） | [你] | 测试信；`dig … _dmarc.sairn.ai TXT` |
| 0.4 | 别名冲突预检：取消。CloudFront 只在分发当前挂的证书覆盖待查名字时才回答，2026-10-01 对四个 sairn 名实测都返回 `InvalidArgument`【核实】；先断后接下不提前换证书，所以无法预检。冲突会让 2.2、3.1 的替换整体失败而不改动任何东西（第 3.2 节） | — | — |
| 0.5 | 申请 sairn 证书（4 名，三个分发共用），`--validation-method DNS`；你在 sairn.ai 区添加 4 条验证 CNAME，**DNS only**，并**永久保留**（续期要用）；`aws acm wait certificate-validated`。2026-10-01 已申请：`arn:aws:acm:us-east-1:018252911946:certificate/b04a51c6-126d-4f9b-a0be-cbea432551b5`，RSA-2048，`PENDING_VALIDATION`；申请与验证记录的原始输出存于 `.worklog/2026-10-01/2026-10-01-sairn-domain-cutover-plan/aws/`【核实】 | [E] 申请（已完成）；[你] 加记录 | `ISSUED`、SAN 为 4 个 sairn 名 |
| 0.6 | 源站请求策略：现行配置已于 2026-10-01 读出并保存（第 2 节）。执行时先重读，ETag 仍是 `E23ZP02F085DFQ`、仍是 9 个头且含 `X-Gatu-Forwarded-Host`，就取 `.OriginRequestPolicyConfig` 内层，**加入** `X-Sairn-Forwarded-Host` 成 10 个后更新；p23 不写新头，提前加入不影响线上 | [E] | 读回确认含 `X-Sairn-Forwarded-Host` 并留存输出（p25 前提） |
| 0.7 | Privy：Allowed origins **加入** `https://app.sairn.ai`、`https://testnet.sairn.ai`（旧的先保留），应用名改为 Sairn；确认 WalletConnect 项目 ID 是默认还是自建 Reown 项目（自建就加新域名）；确认 ZeroDev 有无来源限制；截图保存全部设置 | [你] | 截图 |
| 0.8 | LI.FI：p24 起 integrator 是 `sairn`（`config/app.ts:48`），若合作方后台登记的是 `gatu`，在 p24 前更新 | [你] | — |
| 0.9 | Hyperliquid：在主网、测试网和每个子账户查 `extraAgents`；撤销 `gatu`、`gatu-dev` 和过期的 Mobile Agent（每账户只有 3 个命名槽位，`docs/trading-onboarding.md:185-190`），否则 1.4 授权 `sairn` 可能失败；处理完旧域名上的在途操作（CCTP 跟踪、资金待处理、TWAP）；在 gatu 上记下团队邮箱账户的内嵌钱包地址 | [你]（主钱包签名） | `extraAgents` 不再有 `gatu` |
| 0.10 | 备份三个分发配置（`get-distribution-config > <backup>/<ID>.json`）；官网桶按 `deploy/website/README.md` 备份 | [E] | 文件与 ETag |
| 0.11 | 可选加固：sairn.ai 加 `CAA 0 issue "amazon.com"`、开启 DNSSEC；向 MetaMask、OKX 等钱包的钓鱼检测与 Safe Browsing 提交新域名 | [你] | — |
| 0.12 | 登记 sairn 推荐码（问题 5）：用累计交易量已满 $10,000 的主网地址（Hyperliquid 文档 Referrals 页的门槛），在应用 Referrals 页「Create referral code」或官方 `app.hyperliquid.xyz/referrals` 登记，1–20 个字符，名字由你定（测试夹具里的 `sairnappweb3` 只是占位，不代表已登记）。推荐人接口每个地址只返回一个 `code`（`apps/terminal/src/lib/trade/referral.ts` 的 `referrerState`），创建入口只在 `needToCreateCode` 阶段出现，所以已经登记 `gatuappweb3` 的地址多半不能再登记第二个【推断，未实测】，要换一个达到门槛的地址；推荐奖励归登记地址。链上登记与域名无关，窗口前后都可以做；对外分享 `https://app.sairn.ai/join/<新码>` 要等 2.6 通过。旧码 `gatuappweb3` 链上继续有效，已绑定的被推荐人不受影响，只是不再对外分享 | [你]（签名） | Referrals 页显示新码 |

### 阶段 1：p24 发布到现有 gatu 主机（窗口当天上午）

| # | 步骤 | 验证 |
|---|---|---|
| 1.1 | [仓库] PR-A 已合入 `main`；在临时工作树构建 p24（Node 22.15，`SAIRN_BUILD_SHA`、`SAIRN_RELEASE_ID=cloudfront-<日期>-p24`、`VITE_HYPERLIQUID_AGENT_NAME=sairn`、`VITE_MOBILE_PAIRING_ENABLED=false`、`VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true`，并**显式**写出 `VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED`、`VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED`），加 `build:lambda`。**保留该工作树与 `.output/public` 到 p25 之后**，`verify` 要比对它 | `build-meta.json` 的提交、发布号、闸门 |
| 1.2 | [E] `deploy.mjs functions --execute --origin https://app.gatu.ai` → `lambda --function-name gatu-terminal-api --execute` → `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --execute` → 两个终端分发 `invalidate` | 命令全部成功 |
| 1.3 | [E] `verify --origin https://app.gatu.ai --network mainnet`、测试网同理、`csp-coverage https://app.gatu.ai` | 全部 ok，违规数组为空 |
| 1.4 | [你] 真实钱包冒烟：邮箱登录、外部钱包授权 `sairn` Agent、`/join/<code>`、主网与测试网互切；测试网各下一笔最小限价单再撤单 | 全部成功 |

回滚（进入窗口前）：按 functions → lambda → sync → invalidate 重新发布 p23；若 0.6 已执行，策略仍含 `X-Gatu`，p23 不受影响。

### 阶段 2：终端切换窗口

| # | 步骤 | 验证 / 停机 |
|---|---|---|
| 2.1 | [E] 检查：sairn 证书 `ISSUED`；1.3 已通过；0.7 已加 Privy 来源；备份齐全 | — |
| 2.2 | [E] 替换终端别名与证书：`aliases --distribution ET9CNVE6L1GWN --alias app.sairn.ai --certificate-arn <sairn 证书>`，测试网 `aliases --distribution E3Q2SAX402CR9F --alias testnet.sairn.ai --certificate-arn <sairn 证书>`（先不加 `--execute` 核对 ETag，再加），等 `Deployed` | **gatu 终端从此下线**；sairn 加 DNS 前两边都打不开 |
| 2.3 | [E] `--resolve` 预检：取 `d2i25dhfjwco8b.cloudfront.net` 的真实 IP（排除代理假地址 `198.18.0.0/15`），`curl -s --noproxy '*' --resolve app.sairn.ai:443:<IP>` 请求 `/trade/HYPE`（200）、`GET /api/geo`（200）、`/api/health`（204）、`/join/__sairn_healthcheck__`（`no-store`、`x-sairn-route`），测试网同理 | TLS 正常；HSTS、CSP、preconnect 正确 |
| 2.4 | [你] sairn.ai 区加 `app` → `d2i25dhfjwco8b.cloudfront.net`、`testnet` → `dg9o2gpw3mt8q.cloudfront.net`，**DNS only** | 权威应答（带 `aa`）有 CNAME；sairn 终端从此可用 |
| 2.5 | [E] `verify --origin https://app.sairn.ai --network mainnet`、测试网同理、`csp-coverage https://app.sairn.ai` | 全部 ok |
| 2.6 | [你] 冒烟：邮箱登录后比对 0.9 记下的内嵌钱包地址，并在测试网下单撤单（证明新 origin 上能签名）；插件钱包与 WalletConnect 扫码（MetaMask、OKX、Binance、Coinbase 无安全警告）；外部钱包重新授权 `sairn`；`/join/<新推荐码>`（0.12 未完成时用 `gatuappweb3`）；主网测试网互切后留在 sairn；打开赞助充值页（不实际充值） | 全部成功 |
| 2.7 | [你] 删除 gatu.ai 区的 `app`、`testnet` CNAME | 权威应答无 A/AAAA/CNAME（NODATA） |

回滚：2.7 之前，用 `aliases` 换回 `app.gatu.ai`、`testnet.gatu.ai` 与 `ff5677c6…`，删除 sairn 的 CNAME；2.7 之后再按 0.2 的快照恢复 gatu CNAME（已缓存否定答案的解析器最多等 1800 s）。p24 内容都不用动。

### 阶段 3：官网切换（紧接阶段 2）

| # | 步骤 | 验证 / 停机 |
|---|---|---|
| 3.1 | [E] 替换官网别名与证书：`aliases --distribution EP2DIBP3T7M3G --alias sairn.ai --alias www.sairn.ai --certificate-arn <sairn 证书>`，等 `Deployed` | **gatu 官网从此下线** |
| 3.2 | [仓库][E] 从发布提交重新构建官网（`pnpm --filter @sairn/website test && build`，`dist` 里没有 `gatu`），按 `deploy/website/README.md` 三组上传；再 `aws s3 sync … --delete --dryrun`，确认只删除已撤下的页面（含 `blog/welcome/index.html`）和 7 月版旧资源后执行；失效 `/*` 并等待完成 | 命令全部成功 |
| 3.3 | [E] `--resolve` 预检 sairn apex 与 `www`（取 `d1bgo95x2hobvu.cloudfront.net` 的真实 IP） | 200 |
| 3.4 | [你] sairn.ai 加 apex（CNAME 拉平）与 `www` → `d1bgo95x2hobvu.cloudfront.net`，**DNS only** | 权威应答 |
| 3.5 | [E] `deploy/website/README.md`「发布后检查」 | 全部通过，`/blog/welcome/` 404 |
| 3.6 | [你] 删除 gatu.ai 的 apex 与 `www` 网页记录；**保留** MX、SPF、DMARC、SES 的 `support.gatu.ai` 与 DKIM（邮件推迟处理）、`_…acm-validations`（5.4 前还要用） | 权威应答无网页记录；邮件记录与 0.2 的快照一致 |

回滚：用 `aliases` 换回 `gatu.ai`、`www.gatu.ai` 与 `548ac30d…`，按快照恢复 DNS；内容按 `deploy/website/README.md` 用 `aws s3 cp --recursive` 从备份恢复。

### 阶段 4：当天收尾

| # | 步骤 | 执行者 |
|---|---|---|
| 4.1 | Privy：Logo 填 `https://app.sairn.ai/brand/email-logo.png`；**删除** `https://app.gatu.ai`、`https://testnet.gatu.ai`；再登录一次确认邮件 Logo 与无 `invalid_origin`。必须在 2.6 的内嵌钱包核对通过后做。若 0.7 查明 WalletConnect 用的是自建 Reown 项目，同时从它的域名白名单删除 gatu 域名 | [你] |
| 4.2 | 复核 `extraAgents`：每个账户只剩 `sairn` 和有效的 Mobile Agent，没有 `gatu` | [你] |
| 4.3 | 团队设备：清除 `app.gatu.ai`、`testnet.gatu.ai`、`gatu.ai` 的站点数据，卸载 PWA，在钱包里断开这些站点与 WalletConnect 会话（4.2 之后做） | [你]、团队 |
| 4.4 | Search Console 用 DNS TXT 验证 sairn.ai，提交 `https://app.sairn.ai/sitemap.xml`、`https://sairn.ai/sitemap-index.xml`；更新社交资料、GitHub 仓库主页、TradingView 许可方登记（如有）；对外推荐链接改用 `https://app.sairn.ai/join/<新码>` | [你] |
| 4.5 | 写执行记录（命令、输出、时间点、没有执行的项），在 ADR 0032 补实际结果 | [仓库] |

### 阶段 5：稳定后清理（7 天以上）

| # | 步骤 | 前提 |
|---|---|---|
| 5.1 | PR-B 合入、发布 p25（`--origin https://app.sairn.ai`），`verify` 的签名 POST 返回 200 | 0.6 的读回输出证明策略含 `X-Sairn-Forwarded-Host` |
| 5.2 | 源站请求策略删除 `X-Gatu-Forwarded-Host`；选 A 时之后由你摘除并删除临时策略 `gatu-edge-domain-cutover` | p25 已验证 |
| 5.3 | Lambda：**在控制台**删除 `GATU_TRUST_VIEWER_ADDRESS`，可显式设 `SAIRN_TRUST_VIEWER_ADDRESS=true`（命令行更新会整表替换，漏写会丢掉 `IPDATA_API_KEY`） | `verify` 的 geo 返回真实国家 |
| 5.4 | 30 天后删除两张 gatu 证书 `548ac30d…`、`ff5677c6…`，再删 gatu 区的 `_…acm-validations`（之后旧主机名才会是 NXDOMAIN）；证书删除不可恢复，需你确认 | 无回滚需要 |
| 5.5 | gatu.ai 邮件与 SES：本方案不处理，品牌替换完成后按第 7 节后续事项 1 另行处理 | — |

## 6. 风险

| 风险 | 缓解 |
|---|---|
| 测试网被当成主网 | p24 认两组主机名；窗口内不回滚到 p23；p25 只在 gatu 别名全部摘除后发布 |
| 同源 POST 403（转发头与策略不匹配） | p24 双写双读；p25 前读回策略确认含新头 |
| 旧浏览器里的 SW 与本地 Agent 私钥 | 0.9 撤销 `gatu`；4.1 删除 Privy 旧 origin；4.3 团队清理；gatu.ai 到期前做完到期前清单 |
| 内嵌钱包在新 origin 上不可用 | 2.6 比对地址并实际签名，通过后才删旧 origin |
| 命名 Agent 槽位已满 | 0.9 先撤销旧 Agent |
| 新域名被钱包或浏览器标为可疑 | 0.11 提交新域名；2.6 逐个钱包检查 |
| 本机代理让 DNS 与 curl 结果失真（假地址 `198.18.x.x`、成批 REFUSED、公共解析器被劫持） | 只采信带 `aa` 的权威应答并重试 REFUSED；`curl` 加 `--noproxy '*'`；公网复验在没有代理的网络（手机流量或云端终端）做 |
| `verify` 找不到本地构建 | 1.1 保留 p24 工作树 |
| 未记录的 SES 发信中断 | 本方案不动任何邮件记录（3.6）；品牌替换完成后另行处理 |
| 旧链接与推荐链接失效 | 目前没有外部用户；对外改用新 sairn 推荐码（0.12）。旧码 `gatuappweb3` 链上仍有效，`app.sairn.ai/join/gatuappweb3` 与官方 `app.hyperliquid.xyz/join/gatuappweb3` 都能用，只是不再对外分享 |
| gatu.ai 到期后被别人注册 | 用户接受（第 3.1 节）；到期前清单（第 7 节后续事项 2） |
| 新推荐码登记不了（地址没到门槛、名字已被占） | 换达到门槛的地址或换名字；不影响域名切换，2.6 先用 `gatuappweb3` |
| 别名冲突无法预检（第 3.2 节） | 替换整体失败、不改动任何东西，gatu 保持在线；按 AWS 文档处理冲突后重试 |
| 切换空档 | 预计几分钟（替换生效到加 DNS）；目前没有用户；验收用 `--resolve` 与权威 DNS |
| 两个会话同时操作外部系统 | 执行时只由一个会话操作，另一个会话的方案作废 |

## 7. 决定记录与待定事项

| # | 问题 | 决定（2026-10-01 用户答复） | 落实位置 |
|---|---|---|---|
| 1 | 先接后断还是先断后接 | 起初选先接后断；开始执行时改为先断后接（「直接下线 gatu，跟着替换新的域名」） | 第 3.2 节，阶段 2、3 |
| 2 | gatu.ai 注册 | 不永久续费；目前没有用户。已注册到 2028-05-06，到期前再决定续不续 | 第 3.1 节，0.2，后续事项 2 |
| 3 | gatu.ai 邮件与 SES | 先不处理，记录下来，品牌替换完成后再处理；本方案不动任何邮件记录 | 0.3，3.6，5.5，后续事项 1 |
| 4 | 权限 | 方案 A：2026-10-01 用户已在控制台新建并挂上临时策略 | 0.1，0.4–0.6，5.2 |
| 5 | 推荐码 `gatuappweb3` | 另登记一个 sairn 推荐码 | 0.12，2.6，4.4 |
| 6 | 告别 Service Worker | 不做（目前没有外部用户） | 第 3.4 节 |

### 问题 4：权限给法（已选 A，已挂上）

本机执行 AWS 命令用的是 IAM 用户 `gatu-edge`。它挂着客户管理策略 `gatu-edge-deploy`（正文即 `deploy/cloudfront/iam/gatu-edge-release-policy.json`），只够日常发布；账号 root 的访问密钥已停用，本机没有其他可用身份（第 2 节）。这次切换有三件事超出它的权限：查询别名冲突（0.4，后来因改为先断后接而取消）、申请 ACM 证书（0.5）、读改 API 源站请求策略（0.6、5.2）。

- **A（推荐）**：你用管理员身份在 IAM 控制台新建一份客户管理策略 `gatu-edge-domain-cutover`，正文如下，挂到用户 `gatu-edge`。之后这几步由我用命令行执行，每一步先演练，执行后保存原始输出。5.2 做完后，你把这份策略从用户上摘除并删除。`gatu-edge-deploy` 本身不改，仓库里的发布策略文件也不变。
- **B**：不加权限，这几步由你在 AWS 控制台操作。执行到那一步时我给出逐步说明，你把证书 ARN 和读回的策略配置发给我。

2026-10-01 用户选 A：在 IAM 控制台按下面的 JSON 新建 `gatu-edge-domain-cutover` 并挂到 `gatu-edge`（规则不允许我代为修改 IAM 权限或输入管理员密码，所以由用户操作，我只准备内容、给出步骤并复测）。复测结果见第 2 节；5.2 完成后摘除并删除。

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "AliasConflictCheck",
			"Effect": "Allow",
			"Action": ["cloudfront:ListConflictingAliases"],
			"Resource": [
				"arn:aws:cloudfront::018252911946:distribution/ET9CNVE6L1GWN",
				"arn:aws:cloudfront::018252911946:distribution/E3Q2SAX402CR9F",
				"arn:aws:cloudfront::018252911946:distribution/EP2DIBP3T7M3G"
			]
		},
		{
			"Sid": "CertificateRequest",
			"Effect": "Allow",
			"Action": ["acm:RequestCertificate"],
			"Resource": "*",
			"Condition": { "StringEquals": { "aws:RequestedRegion": "us-east-1" } }
		},
		{
			"Sid": "ApiOriginRequestPolicy",
			"Effect": "Allow",
			"Action": [
				"cloudfront:GetOriginRequestPolicy",
				"cloudfront:GetOriginRequestPolicyConfig",
				"cloudfront:UpdateOriginRequestPolicy"
			],
			"Resource": "arn:aws:cloudfront::018252911946:origin-request-policy/b4401266-2fa0-4c6f-9e55-f232a32b94de"
		}
	]
}
```

这份临时策略只能在 us-east-1 申请证书，不能删除证书（5.4 的删除仍由你做）；只能读改 `b4401266-…` 这一个源站请求策略；别名冲突查询是只读的，只对三个分发生效：2026-10-01 的拒绝信息点名的资源就是 `…:distribution/ET9CNVE6L1GWN`，说明这个操作按分发授权【核实】。

### 后续事项（不在本次切换范围）

1. **gatu.ai 邮件与 SES**（用户决定品牌替换完成后再处理）：Email Routing 收信转发保留多久；`support.gatu.ai` 的 SES 发信身份是谁在用，要不要在 sairn.ai 建 SES 身份；停收时改为 Null MX、`v=spf1 -all`、DMARC `p=reject`。在此之前不动 gatu.ai 的任何邮件记录。
2. **gatu.ai 到期前清单**（2028-05-06 到期，不永久续费）。全部完成后再决定续不续：
   - 团队设备已清除 gatu 站点数据、卸载 PWA，并在钱包里断开旧站点（4.3）；
   - 各账户的 `extraAgents` 里没有 `gatu`（4.2）；
   - Privy、自建 Reown 项目等白名单里没有 gatu origin（4.1）；
   - 没有任何账号用 `@gatu.ai` 地址登录或找回，例如 AWS、Cloudflare、GitHub、Privy、域名注册商的联系邮箱（与事项 1 一起清点）；
   - gatu 证书与验证记录已删除（5.4）。

## 8. 上线后验证清单

- **DNS**（权威应答，带 `aa`）：sairn 的 `app`、`testnet`、apex、`www` 指向正确分发；gatu 的四个网页主机名没有 A/AAAA/CNAME；`_dmarc.sairn.ai` 存在；gatu.ai 的邮件记录（MX、SPF、DMARC、`support.gatu.ai`、DKIM）与 0.2 的快照一致。
- **AWS**：`list-distributions` 中没有任何含 `gatu.ai` 的别名，三个分发都用 sairn 证书 `b04a51c6…`、`Deployed`；`describe-certificate` 显示它 `InUseBy` 三个分发，两张 gatu 证书不再被使用。
- **终端**：`verify` 主网与测试网全部 ok（build-meta 为 p24、闸门正确、geo 返回真实国家、签名 POST 200、`/join` 与配对页头正确）；`csp-coverage` 违规为空；测试网显示测试网；推荐卡片生成 `app.sairn.ai` 链接；Privy 邮箱与钱包登录正常；`extraAgents` 没有 `gatu`；Lambda 与 CSP 报告日志没有 403 或违规激增。
- **官网**：`deploy/website/README.md`「发布后检查」全部通过；社交卡片抓取正常。
- **外部**：`support@sairn.ai` 收信；Search Console 已提交站点地图；Privy 后台没有 gatu origin；新推荐码已登记（若 0.12 已做）。
- **仓库**：执行记录与 ADR 0032 写入；p25 之后 `git grep -n "gatu.ai" -- apps packages scripts` 只剩退役名单与反向断言。

## 9. 依据

本方案由一次只读规划工作流产出（代码、AWS、外部系统、浏览器残留、官网五路调查，汇总后经运维与完整性两路审查），再由我核对并修订；调查报告保存在会话草稿目录，不入库。经审查修正的要点：先接后断避免双域停机；验收用 NODATA 而不是 NXDOMAIN；本机代理下的 DNS 检查方法；未记录的 SES 发信配置；撤销旧 Agent 提前到授权新 Agent 之前；`HEAD /api/geo` 返回 405，改用 GET 或 `/api/health`；保留 p24 构建产物供 `verify`；内嵌钱包在新 origin 上的身份与签名核对；LI.FI integrator 在 p24 即生效；别名冲突预检；p24 与窗口同日。2026-10-01 用户答复第 7 节后再次修订：先接后断、不永久续费、邮件推迟、另登记 sairn 推荐码、不做告别 SW 定为决定，问题 4 补充了临时策略的正文。开始执行时用户把切换顺序改为先断后接，取消过渡证书与别名冲突预检。
