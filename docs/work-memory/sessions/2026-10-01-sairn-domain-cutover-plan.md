<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-sairn-domain-cutover-plan",
  "date": "2026-10-01",
  "title": "gatu.ai 直接下线、切换到 sairn.ai 的规划",
  "kind": "task",
  "status": "recorded",
  "topics": ["brand-identity", "static-hosting"],
  "summary": "用户决定旧域名直接下线、不并存不 301；只读调查后写成执行方案 docs/sairn-domain-cutover-plan.md（拟议，未执行）：先接后断（窗口内过渡证书覆盖新旧 8 个名字，sairn 零中断、gatu 准时下线）、p24 保留旧组识别作回滚保险、p25 清理、只删网页记录、不做告别 SW；发现未记录的 gatu.ai SES 发信配置、另一个会话的并存方案被取代。用户随后答复五个待决问题：先接后断、gatu.ai 不永久续费（到 2028-05-06，到期前清单）、gatu.ai 邮件与 SES 推迟到品牌替换完成后、另登记 sairn 推荐码、不做告别 SW；用户按方案 A 在控制台挂上临时 IAM 策略。开始执行时用户改为先断后接，已申请 4 名 sairn 证书 b04a51c6（待 DNS 验证）。",
  "thread": null,
  "baseCommit": "5517ef70",
  "commits": ["64d63e20"],
  "sources": [
    { "path": "docs/sairn-domain-cutover-plan.md" },
    { "path": "docs/adr/0031-domain-move-to-sairn-ai.md" },
    { "path": "docs/brand-assets.md" },
    { "path": "deploy/website/README.md" },
    { "path": "deploy/cloudfront/README.md" }
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

## 验证与限制

只做了只读调查与文档检查（`git diff --check`、相对链接与引用路径检查、记录索引检查）。没有执行任何 AWS 写操作、Cloudflare、Privy 或 Hyperliquid 操作。本机经代理，系统解析器返回假地址，公共解析器结果不可信；文中 DNS 事实以 Cloudflare 权威服务器的应答为准。

## 后续与替代关系

- 权限已按方案 A 挂上；等用户同意开始阶段 0（先合并两个后台分支并推送 PR-A，再申请证书等）；执行前在 PR-A 新增 ADR 0032，执行后补执行记录。
- 品牌替换完成后处理 gatu.ai 的邮件与 SES（方案第 7 节后续事项 1）；2028-05-06 前做完到期前清单（后续事项 2）。
- 执行前确认只有一个会话操作 AWS 与 Cloudflare。
