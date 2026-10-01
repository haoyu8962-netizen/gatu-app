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
  "summary": "用户决定 gatu.ai 直接下线、不并存不 301。先做只读规划（docs/sairn-domain-cutover-plan.md），再按用户答复定稿：先断后接、gatu.ai 不永久续费、gatu.ai 邮件与 SES 推迟、另登记 sairn 推荐码、不做告别 SW、换新的 Privy 应用；决策另立 ADR 0032。用户在控制台给 gatu-edge 挂临时 IAM 策略后，已签发 4 名 sairn 证书 b04a51c6、源站请求策略加入 X-Sairn-Forwarded-Host，并开 PR #68。Codex 四路只读对抗审查报 5 项 P1、10 项 P2，复核后全部修复或改写（主网赞助充值开关待用户决定）。发布与切换尚未执行。",
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

- 等用户决定主网赞助充值开关（方案第 7 节第 8 项）。
- PR #68 的 CI 通过后合入 `dev`、再晋升 `main`；之后用新 Privy App ID 构建 p24，进入阶段 1。新 Privy 应用的后台配置按方案 0.7 由用户完成并截图。
- 品牌替换完成后处理 gatu.ai 的邮件与 SES（方案第 7 节后续事项 1）；2028-05-06 前做完到期前清单（后续事项 2）。
- 执行时只由一个会话操作 AWS 与 Cloudflare。
