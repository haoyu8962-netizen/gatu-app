# ADR 0032：gatu.ai 直接下线，先断后接切换到 sairn.ai

- 状态：已接受并实施，2026-10-02 上线（p24 `cloudfront-2026-10-02-p24`，main `3ced842e`），gatu.ai 网页已下线；真实钱包冒烟、主网小额赞助充值与 p25 清理未完成。2026-10-03 追记：p25 的代码已写成 PR #73，未合入、未发布，见文末补充。以下为执行前写的状态：已接受，执行中。用户 2026-10-01 决定，2026-10-02 开始执行。已执行的有三项：sairn 证书 `b04a51c6…` 已签发；API 源站请求策略已加入 `X-Sairn-Forwarded-Host`；用户已在控制台给 `gatu-edge` 挂上临时策略 `gatu-edge-domain-cutover`。p24 发布、别名与 DNS 切换、Privy 与 Hyperliquid 侧的操作都还没有做。步骤、命令与每一步的结果以 [切换方案](../sairn-domain-cutover-plan.md) 为准。
- 关联：取代 [ADR 0031](0031-domain-move-to-sairn-ai.md) 决策 5 的上线顺序（长期并存、301 跳转），以及决策 7 中「旧域名必须一直续费」的部分；决策 2 的双组识别降为切换版本的回滚保险。另见 [ADR 0027](0027-brand-single-source-and-identifier-rename.md)、[ADR 0005](0005-spa-static-shell.md)、[任务记录](../work-memory/sessions/2026-10-01-sairn-domain-cutover-plan.md)、[CCTP 充值](../cctp-deposits.md)。

## 背景与约束

- 目前没有外部用户，线上终端是 p23：它只认 gatu 主机，只写旧转发头 `x-gatu-forwarded-host` 与旧路由标记 `x-gatu-route`。
- 网络按主机名判定，认不出的主机回退到本地存储，再回退到主网。所以线上构建必须先认得新主机名，才能把新主机名挂到分发上，否则测试网会跑成主网。
- 两个终端分发共用一个 S3 桶、一个 Lambda 和一个源站请求策略。源站请求策略的头部白名单上限是 10 个；一个分发只能挂一张证书。
- 发布身份 `gatu-edge` 原本不能申请证书、读改源站请求策略、查询别名冲突。本机的 root 密钥已停用。
- 本机经代理，系统解析器会返回假地址，DNS 只采信带 `aa` 标志的权威应答。

## 决策

1. **不设并存期、不做 301。** gatu.ai 直接下线，由 sairn.ai 接替。
2. **先断后接。** 每个分发用一次 `deploy.mjs aliases` 调用，把别名和证书一起换成 sairn 的（4 名证书，三个分发共用）。分发 `Deployed` 时 gatu 即下线，随后在 Cloudflare 加上 sairn 的 CNAME，接受几分钟的空档。用户起初选了先接后断，开始执行时改为「直接下线 gatu，跟着替换新的域名」。
3. **两次发布。**
   - p24 仍识别 gatu 组，作为回滚保险；转发头和路由标记都新旧双写，Lambda 与响应函数新旧都认，所以两个 CloudFront 函数先后发布的间隙和回滚时都能工作。
   - p25 删除旧域名组与这些过渡代码，验证通过后再从白名单删除 `X-Gatu-Forwarded-Host`。
4. **换新的 Privy 应用。**
   - App ID 随 p24 构建更换，代码只读 `VITE_PRIVY_APP_ID`。
   - 邮箱用户会得到新的内嵌钱包与智能钱包地址，所以先转出旧地址里的资金，并保留旧应用。
   - 智能钱包、ZeroDev bundler/paymaster 与 WalletConnect 的后台配置照旧应用复制。
5. **gatu.ai 不永久续费。**
   - 它已注册到 2028-05-06，到期前按方案的「到期前清单」处理后再决定续不续；用户接受到期后被他人注册的风险。
   - 切换时不删 Cloudflare 区，只删网页记录。
   - gatu.ai 的邮件与 SES 等品牌替换完成后再处理，在此之前不动任何邮件记录。
6. **不做告别 Service Worker。** 旧访客的残留由三件事处理：撤销 `gatu` Agent、删除 Privy 的旧 origin、清理团队设备。
7. **另登记一个 sairn 推荐码。** 旧码 `gatuappweb3` 在链上继续有效，只是不再对外分享。
8. **主网赞助充值保持开启**（用户 2026-10-02 决定）。
   - 赞助充值就是邮箱用户的 CCTP 充值：内嵌钱包签 EIP-3009 授权，Privy 智能钱包提交交易，ZeroDev paymaster 代付 Arbitrum gas。关掉这个开关，邮箱用户就无法在应用里充值。
   - 换了 Privy 应用后这条链路还没验证过；能显示充值地址只说明就绪检查通过。所以切换当天用团队邮箱账户在测试网与主网各做一笔带资金验证。（2026-10-03 更正：测试网那一笔不做。用户 2026-10-02 说明测试网此前已在 gatu 上测过，p24 关闭了测试网赞助充值，切换当天只做主网小额验证，见[切换方案](../sairn-domain-cutover-plan.md)第 7 节第 9 项与步骤 2.6。）
   - 配置有误时充值会安全失败，资金留在内嵌钱包里，改后台即可，不用重新构建。

## 备选方案与代价

| 方案 | 不采用的原因 |
|---|---|
| 并存加 301（ADR 0031 原方案） | 用户决定不并存；301 还要求先改 SW 放行 `/sw.js`，并提供自注销 SW |
| 先接后断（8 名过渡证书，窗口内新旧短暂同时可用） | 用户改为直接下线：没有用户，gatu 不需要在切换中保持可用。代价是失去别名冲突预检，CloudFront 只在分发当前证书覆盖待查名字时才回答这个查询 |
| 切换版本直接删除旧域名组 | 必须先摘别名再上传，回滚还要另备一份认两组的构建 |
| 永久续费 gatu.ai | 用户决定不永久续费 |
| 沿用旧 Privy 应用 | 用户决定换新应用；代价是邮箱用户的钱包地址改变 |
| p24 先关闭主网赞助充值，验证后再发一版打开 | 期间邮箱用户无法充值，还要多发一版；没有外部用户时开启的风险只落在团队测试账户上，而且失败是安全失败 |

## 后果与边界

- 旧链接、书签、已安装的 PWA 全部失效。浏览器存储按 origin 隔离，设置、登录和 Stay Connected 的 Agent 私钥都不会迁移；外部钱包需要重新授权 `sairn` Agent。
- 别名冲突无法预检。如果 sairn 名被别的分发占用，替换会整体失败、不改动任何东西，gatu 照常在线。
- 回滚条件随阶段变化：4.1 删除新 Privy 应用里的 gatu origin、p25 发布、5.4 删除 gatu 证书之后，各要多做几步，见方案「按阶段回滚」。不要靠换回旧 App ID 回滚，那会再次改变邮箱钱包身份。
- gatu.ai 到期后如果被他人注册，对方能签出合法证书，接管旧 origin 的存储与 SW。到期前清单要保证这些都已失效，并且没有账号再靠 `@gatu.ai` 邮箱找回。

## 验证

已做（2026-10-01 至 10-02，记录在方案步骤表与任务记录里）：
- **证书**：4 条验证 CNAME 经权威 DNS 核对，证书 `ISSUED`。
- **源站请求策略**：带 ETag 更新为 10 个头。之后两个 gatu 主机的 `/api/health`、`/api/geo` 与带签名哈希的同源 `POST /api/referral-geo` 都正常。
- **单元测试**：CloudFront 函数加了「只发布了一个函数」的组合用例，Lambda 加了新旧转发头的优先级与两组域名同源用例，并用变异验证测试能抓到错误实现。
- **Codex 只读对抗审查**：4 路，发现与处理见任务记录。

尚未做：
- p24 构建与在 gatu 上的 `verify`；
- 切换后在 sairn 上的 `verify`、`csp-coverage`；
- 新 Privy 应用上的真实登录与签名；
- 赞助充值的带资金验收；
- 官网发布后检查；
- p25。

## 补充（2026-10-08，p25 清理已发布）

阶段 5.1 已完成：PR #73 于 2026-10-08 合入 `dev`（`d6033daf`）并随 PR #87 晋升 `main`（`d74dd616`），作为 `cloudfront-2026-10-08-p28` 发布，两网 `verify` 通过（签名 POST allowed）、`csp-coverage` 0 违规；线上自此不再识别 gatu 主机。阶段 5.2（白名单删除 `X-Gatu-Forwarded-Host`）、5.3（Lambda 环境变量改名）、5.4（删除 gatu 证书）仍未做。回滚到 p27 不需要恢复白名单（仍含旧头）。见[发布记录](../work-memory/sessions/2026-10-08-cloudfront-release-p28.md)。

## 补充（2026-10-03，p25 的代码部分）

决策 3 的 p25 清理已写成代码，范围与[切换方案](../sairn-domain-cutover-plan.md) 4.2（PR-B）一致：

- `brand/brand.json` 删除 `domains.legacy`；`config/brand.ts`、`config/public-origins.ts`、`lib/network.ts` 只认主组。
- `scripts/brand.mjs` 只校验主组，并加了退役名单（`gatu.ai`）。
- Lambda 删除 `LEGACY_FORWARDED_HOST_HEADER` 回退。
- 请求函数不再写 `x-gatu-forwarded-host` 与 `x-gatu-route`，也不再删除访客自带的 `x-gatu-route`；响应函数不再读 `x-gatu-route`（改模板后重新渲染）。
- `distribution-config.mjs` 生成的源站请求策略白名单删除 `X-Gatu-Forwarded-Host`，剩 9 个头。
- 测试改为断言：`gatu.ai` 主机不被识别；只带旧转发头的请求还原不出公网 origin；旧路由标记不影响响应。

**状态**：分支 `claude/retire-gatu-domain-group`，PR #73，未合入、未发布。用户决定等上线满 7 天（2026-10-09）之后再合入和发布。方案阶段 5 的线上步骤都没有做：

- 5.1 发布 p25 并 `verify`；
- 5.2 从线上白名单删除 `X-Gatu-Forwarded-Host`（线上目前仍有这个头）；
- 5.3 Lambda 环境变量改名；
- 5.4 删除旧证书。

**发布间隙的行为**（按代码推演，没有在线上验证）：

- p25 发布时，请求函数先于响应函数生效。间隙里线上的旧响应函数仍会读 `x-gatu-route`（2026-10-03 起线上是 p24b，它的函数与 Lambda 代码和 p24 相同，只多了两个银行卡入金开关），而 p25 请求函数不再删除访客自带的这个头。所以访客可以让自己这一次响应带上配对页的 `no-store`、`no-referrer` 和 `x-sairn-route` 响应头。viewer-response 在缓存之后按请求执行，这只影响请求者自己的响应；响应函数发布后这个现象消失。
- 配对页与推荐页的标记，两个版本都用 `x-sairn-route`，所以发布与回滚的间隙里都有效。
- 回滚到 p24b：它的请求函数写新旧两个头，Lambda 先读新头，不依赖白名单里的旧头（方案「按阶段回滚」的 5.1、5.2 两行）。回滚目标是 p24b 而不是 p24：重新发布 p24 会关掉银行卡入金。p24b 的产物保留在工作树 `gatu-release-p25` 里，构建 p25 要用另一个工作树，不能覆盖它（[p24b 发布记录](../work-memory/sessions/2026-10-03-cloudfront-release-p24b.md)）。

本地验证与变异测试的结果见[任务记录](../work-memory/sessions/2026-10-03-retire-gatu-domain-group.md)。
