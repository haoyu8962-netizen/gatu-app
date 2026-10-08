<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-08-gatu-retirement-cleanup",
  "date": "2026-10-08",
  "title": "gatu.ai 退役收尾：阶段 5.2 执行、5.3/5.4 权限不足、旧发布工作树清理",
  "kind": "task",
  "status": "recorded",
  "topics": ["brand-identity", "static-hosting"],
  "summary": "p28 发布后用户说「gatu 相关的产物可以全部清理掉了，不需要等了」。只读核对后执行：5.2 从 API 源站请求策略删除 X-Gatu-Forwarded-Host（ETag ETVPDKIKX0DER → E3UN6WX5RRO2AG，9 个头，/api/geo 仍 200）；5.3 Lambda 变量改名被 lambda:UpdateFunctionConfiguration 拒绝（线上仍是 GATU_TRUST_VIEWER_ADDRESS，p28 处理器已不读它、缺省信任，geo 正常）；5.4 删除两张 gatu 证书被 acm:DeleteCertificate 拒绝（都 ISSUED、未被使用）；临时 IAM 策略 gatu-edge-domain-cutover 是账号级操作。删除发布工作树 gatu-release-p24、p25，保留 p26（p27 回滚产物）与 p28。待用户在控制台完成 5.3、5.4 与临时策略摘除。",
  "thread": null,
  "baseCommit": "ae220c41",
  "commits": [],
  "sources": [
    { "path": "docs/sairn-domain-cutover-plan.md" },
    { "path": "docs/adr/0032-gatu-offline-cutover-to-sairn.md" },
    { "path": "docs/work-memory/sessions/2026-10-08-cloudfront-release-p28.md" },
    { "path": "deploy/cloudfront/README.md" }
  ],
  "supersedes": []
}
-->
# gatu.ai 退役收尾：阶段 5.2 执行、5.3/5.4 权限不足、旧发布工作树清理

## 背景与范围

同步记录，未取得任务标识（`thread: null`）。[p28 发布](2026-10-08-cloudfront-release-p28.md)完成阶段 5.1 后，用户说「gatu 相关的产物可以全部清理掉了，不需要等了」，即不再等切换方案给 5.4 定的 30 天。身份为 IAM 用户 `gatu-edge`。

## 结论与依据

- **只读核对**：策略 `b4401266-…` ETag `ETVPDKIKX0DER`、10 个头（含新旧两个转发头）；Lambda 环境变量只有 `GATU_TRUST_VIEWER_ADDRESS` 与 `IPDATA_API_KEY`（只读键名、不读值）；ACM 三张证书：`gatu.ai`、`app.gatu.ai` 都 ISSUED、`InUse=False`、`InUseBy=[]`，`sairn.ai` 在用；`gatu-release-p24`、`p25`、`p26` 工作区都干净、无进程以其为工作目录。
- **5.2 已执行**：取 `.OriginRequestPolicyConfig` 去掉 `X-Gatu-Forwarded-Host` 后 `update-origin-request-policy --if-match ETVPDKIKX0DER`；读回 9 个头、新 ETag `E3UN6WX5RRO2AG`；`GET https://app.sairn.ai/api/geo` 200 并返回真实国家。p28 的请求函数只写 `x-sairn-forwarded-host`，Lambda 只读它，所以删除旧头不影响线上。
- **5.3 未成**：按方案用命令行整表替换（从现有变量表删 `GATU_TRUST_VIEWER_ADDRESS`、加 `SAIRN_TRUST_VIEWER_ADDRESS=true`，经临时文件传递、不打印值），`update-function-configuration` 报 `AccessDeniedException: lambda:UpdateFunctionConfiguration`；读回键名不变，临时文件已删。p28 处理器 `trustViewerAddress = process.env.SAIRN_TRUST_VIEWER_ADDRESS !== "false"`，旧变量无效、缺省信任，行为与改名后相同。
- **5.4 未成**：两张证书 `acm:DeleteCertificate` 都被拒绝（`gatu-edge` 只有 ACM 只读）；Cloudflare 里 gatu 区的 `_…acm-validations` 记录本会话没有访问途径。
- **临时 IAM 策略** `gatu-edge-domain-cutover`：账号级操作，只能由用户在控制台摘除。
- **工作树**：`git worktree remove --force` 删除 `gatu-release-p24`（p24 产物）与 `gatu-release-p25`（p24b 产物）；保留 `gatu-release-p26`（p27 产物，p28 的回滚）与 `gatu-release-p28`。
- 本仓库的 `gatu-*` 名称（AWS 资源、仓库名、CI 名）按 ADR 0027 保留，不属于本次清理。

## 验证与限制

- 5.2 读回与 `/api/geo` 200 为实测；未重跑完整 `verify`。
- 5.3、5.4 的拒绝输出为实测；两项都没有改变线上状态。
- 工作树删除后 `git worktree list` 只剩 `gatu-release-p26`、`gatu-release-p28`。

## 后续与替代关系

- 待用户在控制台：Lambda 把 `GATU_TRUST_VIEWER_ADDRESS` 改为 `SAIRN_TRUST_VIEWER_ADDRESS=true`（保留 `IPDATA_API_KEY`）；删除 ACM 证书 `548ac30d…`、`ff5677c6…` 与 Cloudflare 的验证记录；摘除并删除 `gatu-edge-domain-cutover`。完成后在本记录追加。
- 回滚边界：自 5.2 起回滚到 p23 及更早要先把 `X-Gatu-Forwarded-Host` 加回白名单；p24–p27 不受影响。
