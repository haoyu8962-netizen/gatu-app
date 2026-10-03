# ADR 0031：域名迁移到 sairn.ai：两组域名并存识别与上线顺序

- 状态：代码部分已接受并实施（2026-10-01，分支 `claude/from-dev-1001`，提交 `5cd45ab8`；请求头与环境变量改名在 `7e228768`）。本 ADR 是实施后同日补写的回溯记录。分支没有推送，未合入 `dev`，也未发布。按执行记录，仓库外的步骤（注册、DNS、证书、CloudFront 别名、源站请求策略、Privy、邮件）一项都没有执行。撰写本 ADR 时观察到 `sairn.ai` 已委派给 Cloudflare 名称服务器，但归属没有记录，详见「背景与约束」。
- 关联：[ADR 0027](0027-brand-single-source-and-identifier-rename.md)（单一来源、内部标识）；[ADR 0005](0005-spa-static-shell.md)（CloudFront 托管）；[迁移计划](../brand-migration-plan.md) D2、D9、D17、D23、阶段 7、§4.2、风险 #14–#18、#23–#26；[品牌标识与素材](../brand-assets.md)「域名切换到 sairn.ai」；[部署说明](../../deploy/cloudfront/README.md)顶部的过渡说明；[首次交易](../trading-onboarding.md)；[执行记录](../work-memory/sessions/2026-10-01-sairn-brand-migration-execution.md)。

## 背景与约束

- 生产终端目前在 `app.gatu.ai`、`testnet.gatu.ai`，跑在 CloudFront 分发上（ADR 0005）；官网 `gatu.ai` 用另一个分发。用户选定的新域名是 `sairn.ai`。
- 换域名等于换浏览器存储的 origin。localStorage、sessionStorage 和 Web Locks 都按 origin 隔离，下面这些都不会带到新域名：
  - 设置和登录状态；
  - Stay Connected 的 Agent 私钥；
  - 资金动作标记、CCTP 跟踪与授权意图、下单资产占位、LI.FI 执行记录、待处理 TWAP 等防重复守卫（计划 §1.4 第 5 条）。
- 响应头策略下发 HSTS，有效期 31,536,000 秒并带 `IncludeSubdomains`（`deploy/cloudfront/response-headers-policies.mjs`）。
- Hyperliquid 遇到同名的 `approveAgent` 时，会注销已有的同名 Agent；每个账户只有 3 个命名槽位（[首次交易](../trading-onboarding.md)）。
- 计划阶段 7 的做法：先发 R1（同时识别两组域名，主域名仍是 gatu），切 DNS 后再发 R2（主域名切到 sairn）。另外还有迁移闸门（D23）、不主动导航的 kill-switch Service Worker（D17）和旧主机重定向表。
- 约束：
  - DNS 永远最后切，每一步都用权威 DNS 和 AWS API 核对（2026-09-15 证书事故的教训，计划风险 #16）。
  - 两组域名上，网络都要按主机名判定，测试网不能被当成主网；`/join/<code>` 推荐链接在两组域名上都要有效。
  - API 源站要靠转发的主机名还原公网 origin，同源校验依赖它。
- 域名的注册状态：
  - 迁移会话当天早些时候查询，`dig +norecurse @v0n1.nic.ai sairn.ai NS` 返回 `NXDOMAIN`。
  - 2026-10-01 12:01 UTC 撰写本 ADR 时复查：`.ai` 的 `v0n0`、`v0n1`、`v0n2`、`v2n0` 都把 `sairn.ai` 委派给 `holly.ns.cloudflare.com` 和 `lakas.ns.cloudflare.com`；`1.1.1.1` 返回 Cloudflare 的 SOA；apex、`app.sairn.ai` 都查不到 A 记录，apex 也没有 MX 记录。查询经过本机代理（服务器地址是 `198.18.x.x`）。
  - 12:14 UTC 再查 WHOIS（`whois -h whois.nic.ai sairn.ai`）：创建时间 2026-10-01T11:40:28Z，注册商 Cloudflare, Inc.，名称服务器同上。
  - 注册人、这个 Cloudflare 区是否属于本项目，仓库里没有任何记录。所以只能认定第 1 步的注册已经发生，不能据此认定归属与第 2 步已经完成。

## 决策

1. **`brand.json` 按组列出域名。**
   - `domains.primary` 是规范域名组：`sairn.ai`、`www.sairn.ai`、`app.sairn.ai`、`testnet.sairn.ai`。
   - `domains.legacy` 是仍需识别的旧域名组，目前只有 `gatu.ai` 一组。
   - `scripts/brand.mjs` 校验：域名小写；子域名等于「键名.apex」；主机不重复；邮箱使用主域名。
2. **两组域名并存识别**（`apps/terminal/src/config/public-origins.ts`）：
   - 规范 origin（`PUBLIC_ORIGINS`）只取主域名组。
   - 各组的 `app`、`testnet` 主机都精确匹配到主网和测试网；apex、`www`、后缀伪装和端口不同的 origin 一律不识别。
   - 切换网络时留在用户当前所在的组；不属于任何组的主机回到主域名组。
   - SEO、站点地图、`robots.txt`、法律文本、客服邮箱和品牌推荐链接（`getBrandReferralUrl`）只用主域名组，`brand:check` 校验静态文件。
3. **只有一种代码状态，不分 R1、R2 两次发布。** 代码里主域名已经是 sairn.ai，gatu.ai 只作为旧域名组被识别。执行记录与 [brand-assets.md](../brand-assets.md) 给出的理由只有「目前没有用户，不需要迁移本地数据」；没有单独记录为什么不按计划分两次发布。
4. **转发主机名请求头分步过渡。**
   - viewer-request 函数同时写 `x-sairn-forwarded-host` 和旧的 `x-gatu-forwarded-host`；Lambda 先读新头，再读旧头（`LEGACY_FORWARDED_HOST_HEADER`）。
   - 仓库生成的源站请求策略已经只放行 `X-Sairn-Forwarded-Host`（`deploy/cloudfront/distribution-config.mjs`）。但据部署说明，线上策略 `gatu-terminal-api` 的白名单里仍只有 `X-Gatu-Forwarded-Host`，需要由有权限的身份更新（本 ADR 没有读取线上配置）。发布并验证之后，再删除代码里的旧头。
   - Lambda 环境变量改为 `SAIRN_*`。据部署说明，线上当前的 `GATU_TRUST_VIEWER_ADDRESS=true` 和留空的 `GATU_PUBLIC_ORIGIN` 都等于新代码的默认值，所以暂时不改名也不影响行为。
5. **上线顺序**以 [brand-assets.md](../brand-assets.md) 的八步为准：
   1. 注册 `sairn.ai`，`gatu.ai` 保持自动续费；
   2. 在 Cloudflare 建区（DNS-only），配置邮件；
   3. ACM 签发证书（每张证书覆盖该分发的新旧两组主机名）；
   4. 在 Privy 的 Allowed origins 里只添加新 origin，改应用名，并把后台 Logo 换成登录邮件用的 `/brand/email-logo.png`（PNG，`appearance.logo` 管不到邮件）；
   5. 更新源站请求策略的转发头；
   6. 发布终端与官网，用 `deploy.mjs aliases` 同时挂上新旧别名并换上新证书；
   7. 用 `curl --resolve` 预验证，然后加 CNAME，再用公网 DNS 复验；
   8. 新域名稳定后，把旧域名 301 跳转到新域名（保留路径和查询串），在 Search Console 提交地址更改，从 `brand.json` 删除旧域名组，并从 Privy 移除旧 origin。
6. **不迁移本地数据。** 计划 D23 的迁移闸门、D17 的 kill-switch Service Worker、以及旧主机重定向表都没有实现；`deploy/cloudfront/` 里没有对应的模板或测试。也不下发 `Clear-Site-Data`。
7. **退役旧域名组。** 第 8 步之后旧主机不再被识别。旧域名必须一直续费：HSTS 有效期一年并覆盖子域名，旧 origin 的存储里也可能留有 Agent 私钥（计划风险 #17）。

## 备选方案与代价

- **按计划分两次发布（R1、R2）**：
  - 好处：规范地址和推荐链接永远不会指向还没解析的主机；有用户以后更稳妥。
  - 代价：要多发一次版本，`brand.json` 还要多一个阶段字段。
  - 代码没有采用。
- **迁移闸门（D23 选项 A）**：可以在用户还有在途记录时拦住跳转。没有用户时用不上，没有实现。如果在切换前已经有了用户，要重新评估。
- **只识别新域名**：旧域名上的主机会被判成未知主机，网络不再按主机名判定，生产构建里旧域名的 `/join/<code>` 也解析不出推荐意图（`lib/trade/referral-join.ts`）。否决。
- **立即删除旧转发头**：在线上策略更新之前，API 源站会还原不出公网 origin，同源校验会失败。否决。

## 后果与边界

- 新 origin 上，设置、登录、Stay Connected 私钥、待处理记录和 Web Locks 全部从零开始。外部钱包需要重新授权 Agent；槽位改名本身也会要求重新授权（ADR 0027）。
- 并存期间，两组域名运行同一份构建，都用 `sairn` 槽位。外部钱包用户在两个域名上分别授权，会互相顶掉对方的同名 Agent（计划风险 #26）。应用里没有迁移提示，只能靠公告提醒用户只在一个域名上交易。邮箱用户由内嵌钱包直接签名，不受影响。
- 【推断，未实测】在第 6 步发布之后、第 7 步 CNAME 生效之前，用户在 `gatu.ai` 上看到的页面，生成的规范地址、站点地图、法律文本链接和品牌推荐链接都指向还不能解析的 `sairn.ai` 主机。
- 一个 CloudFront 分发只能挂一张证书。第 6 步同时挂新旧别名，证书就必须覆盖该分发的全部别名（计划阶段 7b：终端证书覆盖新旧两组的 `app`、`testnet`，官网证书覆盖新旧两组的 apex 和 `www`）。撰写本 ADR 时 brand-assets.md 第 3 步只列了 `sairn.ai` 的四个主机名；同日已改为按分发同时覆盖新旧两组主机名，与计划一致。
- 官网分发的函数 `gatu-rewrite-index` 不在发布身份 `gatu-edge` 的权限范围内（计划 §1.4 第 9 条），官网的别名和跳转需要另行安排有权限的身份。
- 回访用户第一次打开时，Service Worker 仍返回缓存的旧壳（计划 §1.4 第 12 条）。旧域名开启 301 之后，这一点在 Safari、iOS PWA 和 Firefox 上的表现都没有验证（计划风险 #15、#21）。

## 证据

- 代码：
  - `brand/brand.json` 的 `domains`；`apps/terminal/src/config/brand.ts`、`apps/terminal/src/config/public-origins.ts`、`apps/terminal/src/lib/trade/referral.ts`（`getBrandReferralUrl`）；
  - `apps/terminal/src/edge/lambda-handler.ts`（`FORWARDED_HOST_HEADER`、`LEGACY_FORWARDED_HOST_HEADER`）；
  - `deploy/cloudfront/functions/terminal-request.js`、`deploy/cloudfront/distribution-config.mjs`、`deploy/cloudfront/response-headers-policies.mjs`；`scripts/brand.mjs`。
- 测试：
  - `apps/terminal/src/lib/tests/public-origins.test.ts`：两组域名、伪装主机、端口与协议、切换网络留在原组；
  - `network-storage.test.ts`、`referral-join.test.ts`：旧域名仍被识别；
  - `lambda-handler.test.ts`：新旧转发头的读取顺序；
  - `deploy/cloudfront/functions/functions.test.mjs`：双写；
  - `legal-policy-contract.test.ts`。
- Reference：[品牌标识与素材](../brand-assets.md)、[部署说明](../../deploy/cloudfront/README.md)顶部的「Sairn 改名后的过渡」。

## 验证

- **执行记录**：
  - `5cd45ab8`：终端完整测试 7,938 项通过；`brand:check`、CloudFront 测试通过；官网构建通过，canonical 为 `https://sairn.ai/`。
  - `7e228768`：终端完整测试、CloudFront 44 项、脚本测试、全仓类型检查通过。
  - 后续最终一轮的结果见 ADR 0027「验证」。
- **撰写本 ADR 时的复查**（HEAD `7a511af3`，工作区含另一会话未提交的改动）：
  - `public-origins`、`network-storage`、`referral-join`、`lambda-handler`、`legal-policy-contract` 共 44 项通过；
  - `node --test deploy/cloudfront/functions/functions.test.mjs` 11 项通过；
  - 上文的 DNS 查询。
- **没有做的**：第 1 至 8 步的任何一步（第 1、2 步的现状见「背景与约束」）；新域名上的 `deploy.mjs verify` 与 `csp-coverage`；Privy 登录；外部钱包在两个域名之间的 Agent 互相顶替；旧域名跳转在各浏览器上的表现。

## 补充（2026-10-01，用户决定旧域名直接下线）

用户决定不设新旧并存期、不做 301：gatu.ai 直接下线，由 sairn.ai 接替。本 ADR 决策 5 的上线顺序（第 6 步同时挂新旧别名后长期并存、第 8 步 301 跳转与 Search Console 地址更改）和决策 7（退役前继续识别旧域名组）的并存部分不再执行；决策 2 的双组识别只作为切换版本的回滚保险，下一个版本删除。执行方案见 [gatu.ai 下线、切换到 sairn.ai](../sairn-domain-cutover-plan.md)（拟议，未执行），执行后另立 ADR 0032。

更正：「背景与约束」说 sairn.ai 没有 MX，同日复查已有 Cloudflare Email Routing 的 MX 与 SPF，但没有 DMARC；gatu.ai 上还有一套此前没有记录的 Amazon SES 发信配置（`support.gatu.ai`）。HSTS 不足以作为保留旧域名的理由（新持有者能签出合法证书）；保留注册的理由是旧 origin 的浏览器存储与 Service Worker 可能被接管、邮箱找回与钓鱼风险。

同日用户答复切换方案的待决问题（方案第 7 节）：gatu.ai 不永久续费，目前没有用户；域名已注册到 2028-05-06，到期前再决定续不续。上一段列出的接管、邮箱找回与钓鱼风险由用户接受，并由方案的「到期前清单」覆盖，所以决策 5 第 1 步「`gatu.ai` 保持自动续费」与决策 7「旧域名必须一直续费」不再适用。gatu.ai 的邮件与 SES 发信配置等品牌替换完成后再处理，切换时不动任何邮件记录；对外推荐改用另行登记的 sairn 推荐码；不做告别 Service Worker。

2026-10-02 补充：上述执行方案已开始执行，切换顺序改为先断后接，并决定换用新的 Privy 应用。决策另立为 [ADR 0032](0032-gatu-offline-cutover-to-sairn.md)，它取代本 ADR 决策 5 与决策 7 的相应部分。

## 补充（2026-10-03，旧域名组在代码中退役）

本 ADR 的代码已于 2026-10-02 经 PR #68 合入 `dev`、经 PR #67 晋升 `main`，并随 p24 发布；状态行里的「没有推送、未合入、未发布」是撰写时的状态。

决策 1、2、4 的过渡部分随切换方案 PR-B（对应发布 p25）从代码中删除：

- `brand.json` 只剩 `domains.primary`；
- `public-origins.ts` 只认主组，`gatu.ai` 主机与其他未知主机同样处理；
- 转发主机名只用 `x-sairn-forwarded-host`。

「证据」一节列出的测试相应改写：双组识别、新旧头读取顺序和双写的用例，改为断言旧主机不被识别、旧头与旧标记不被读写。

[品牌标识与素材](../brand-assets.md)的「域名切换到 sairn.ai」一节改名为「域名」，内容改为现状；原来的八步顺序以本 ADR 决策 5 为准。

这部分代码在 PR #73，未合入、未发布，状态见 [ADR 0032](0032-gatu-offline-cutover-to-sairn.md) 的补充。
