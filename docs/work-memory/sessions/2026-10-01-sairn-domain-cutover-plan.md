<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-sairn-domain-cutover-plan",
  "date": "2026-10-01",
  "title": "gatu.ai 直接下线、切换到 sairn.ai 的规划",
  "kind": "task",
  "status": "recorded",
  "topics": ["brand-identity", "static-hosting"],
  "summary": "用户决定旧域名直接下线、不并存不 301；只读调查后写成执行方案 docs/sairn-domain-cutover-plan.md（拟议，未执行）：先接后断（窗口内过渡证书覆盖新旧 8 个名字，sairn 零中断、gatu 准时下线）、p24 保留旧组识别作回滚保险、p25 清理、旧域名永久续费只删网页记录、不做告别 SW；发现未记录的 gatu.ai SES 发信配置、另一个会话的并存方案被取代；六个待决问题。",
  "thread": null,
  "baseCommit": "5517ef70",
  "commits": [],
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

## 验证与限制

只做了只读调查与文档检查（`git diff --check`、相对链接与引用路径检查、记录索引检查）。没有执行任何 AWS 写操作、Cloudflare、Privy 或 Hyperliquid 操作。本机经代理，系统解析器返回假地址，公共解析器结果不可信；文中 DNS 事实以 Cloudflare 权威服务器的应答为准。

## 后续与替代关系

- 等用户回答方案第 7 节的六个问题，再按阶段 0 开始执行；执行后写 ADR 0032 与执行记录。
- 执行前确认只有一个会话操作 AWS 与 Cloudflare。
