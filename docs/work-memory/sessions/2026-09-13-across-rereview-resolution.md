<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-13-across-rereview-resolution",
  "date": "2026-09-13",
  "title": "Across 二轮复审：N1–N8 验收与恢复边界",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "docs-governance"],
  "summary": "补 legal 可判定验收、导出兼容、token、密钥和受控恢复；不采用 WebView 一律禁用、10 USDC 通用引导或交易 hash 主键，生产依赖仍未完成。",
  "thread": null,
  "baseCommit": "965e05900e4f4252d592beaf158967fb2fe74a6e",
  "commits": ["2c44be20"],
  "sources": [
    {"path": "docs/across-deposit-addresses.md"},
    {"path": "docs/adr/0004-across-deposit-addresses.md"},
    {"path": "packages/hl-react/src/legal.ts"},
    {"path": "apps/terminal/src/domain/trade/order/metrics.ts"},
    {"url": "https://docs.privy.io/recipes/mobile-key-export"},
    {"url": "https://docs.across.to/api-reference/deposits/get"}
  ],
  "supersedes": []
}
-->
# Across 二轮复审：N1–N8 验收与恢复边界

## 背景与范围

用户提供对 `965e0590` 的二轮报告摘要，继续要求核对和完善前述方案。读取用户摘要及约定位置 `/tmp/across-pda-plan-rereview.md` 的完整报告，起始 HEAD 如元数据、工作区干净；没有可核对的原始任务 ID，thread 为 null。本轮仅修订开发设计、ADR 和工作记录，不实现资金路径或提前改写当前运行契约。

报告完整副本保存在 Git 忽略的 `.worklog/2026-09-13/across-rereview-resolution/claude-rereview.md`，SHA-256 为 `8d014e9e58813ea80b68bf96b3c1013cdf9474b7eeb3d6378fbcc00bfd76bb76`。这是报告证据，不是完整会话归档；报告声称的官方核验/代码检查不自动成为本轮验证。

## 结论与依据

根代理核对 N1/N5、修改文档；两个只读子代理分别复核 Privy 和金额/地址恢复/转账身份，再交叉检查修改 diff。没有子代理修改仓库或进行真实钱包操作。逐项处置如下，章节指向[当前方案](../../across-deposit-addresses.md)：

| 项目 | 判断及修订 |
| --- | --- |
| N1 legalCheck | 可判定标准缺失成立，生产依赖仍未解决。§5/§9 增加已知条款状态与 missing owner 的出口矩阵、官方字段适用性依据、正常放行/错误拒绝 fixture 和失败分支。拒绝“三出口一致即证明地址状态”和“最坏权重20”两项推断；不能把 SDK 有类型等同于 HL 已公开其代理语义/权重。mock 可继续，生产仍 off |
| N2 导出环境 | 补浏览器回退和 PWA/MFA 验收成立，但“内嵌浏览器不支持”不成立。[Privy 移动导出实践](https://docs.privy.io/recipes/mobile-key-export)明确 WebView 加载 React 导出页；§7 不按 UA/standalone 一律禁用，实际阻断才引导系统/桌面浏览器同源登录原 owner。SDK exportWallet resolve 仅表示模态框退出，不证明私钥已复制或资金已取回 |
| N3 首充引导 | 用户应知道路线最低额不保证下一笔订单可用；$10 名义值不是最低现金余额。官方[保证金](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining)与[错误分类](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses)区分保证金、永续和现货最小名义值，本地 metrics.ts 同样按杠杆算保证金。§7 不采用激活费+费用+10 的通用公式或低于10不可交易判断，继续复用订单 guards |
| N4 绑定恢复 | 同参可重取成立；当前/退役不是恢复能力分界。§6 允许在原 App/环境/DID/owner、完整请求和残存地址证据齐全时受控重建，提交 DB、复验许可后才恢复曝光；缺证据/不匹配继续关闭，退役绑定只恢复历史。确定性不能补出丢失的归属和全量用户清单 |
| N5 现行契约 | 需点名修改位置成立；§9 列出 CCTP 文档开头、runtime-guardrails §2 唯一路由及 bridge 停止新充值、onboarding 第7步和后续路由不变量。实现前改为按方式约束，Across 不依赖 usdcRouting，CCTP/提现/Bridge2 禁用保持；本轮不提前把当前 Reference 写成已实现 |
| N6 App Secret | 凭据不是只读查询权限成立；官方删除用户示例使用 App ID/Secret。§8 补运行时注入、0600、轮换/泄露处理、模块只封装验签/用户查询；不推断能签任意现有钱包、不虚构受限 scope。原始用户 token 同样不能进入缓存/日志 |
| N7 token 获取 | 成立；§4 使用公开 usePrivy().getAccessToken()，null/失败不请求、明确认证失效至多一次重试，重试校验会话/owner/环境；SDK 只是过期/将过期时尝试刷新，没有 forceRefresh 参数。非认证错误不引发刷新/登录循环；不另存 token，不改变 SDK 自有存储 |
| N8 两阶段身份 | 需要关联规则成立，但 depositTxnRef 单独主键不成立；[列表文档](https://docs.across.to/api-reference/deposits/get)允许同交易多转入和批量 sweep。§7 要求供应商证明事件身份与阶段映射；hash/sweep/分页序号/临时引用不能作业务主键，缺证据不合并，无法唯一定位不展示单笔确认详情 |

另外采纳报告的轻量工单取证：核实归属后按需存受控脱敏快照、记录覆盖范围/时间/查询条件及失败；不代表完整账本或最终交付，不增加 worker、镜像表或自动外发消息。架构仍为单 Nitro、SQLite 两表、按需代理。

## 核对范围

根代理实时读取 [SDK legalCheck schema](https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/legalcheck)和 [HL 限频](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)，对照 legal.ts 的30秒新鲜度与 n/a/o/u 的动作语义；逐段核对 CCTP、runtime-guardrails 和 onboarding 现行文字。没有执行跨地区 legalCheck 或任何真实地址探测。

Privy 子代理实时读取[导出](https://docs.privy.io/wallets/wallets/export)、移动导出、[MFA](https://docs.privy.io/authentication/user-authentication/mfa/verify/overview)、[access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens)、[删除用户](https://docs.privy.io/user-management/users/managing-users/deleting-users)及配置/用户授权资料，对照已安装 React SDK 3.30.0 的 getAccessToken/exportWallet 声明。客户端源码未找到 getAccessToken 调用；签名和存储结论只针对本设计，不推断配置已上线。

资金子代理实时读取 HL margining/error responses、Across PDA/列表/详情、Privy 删除语义，并对照订单 metrics/size/input-error 源码；HTML 正文读取成功，部分 `.mdx` 的 web 读取失败，未据失败页面下结论。双方对实际文档 diff 的只读复核未发现新增问题，这不是运行时验收。

## 验证与限制

本轮验证基于 `965e0590` 的纯文档工作区。2026-09-13 完成 `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）及 `git diff --check`，均通过；检查本次修改/新增 Markdown（含索引）的78个本地文件/目录链接，全部存在，不覆盖页内 anchor 或远端链接可用性。未跑应用 tsc/lint/build、浏览器或资金测试；未创建地址、读取秘密、签名、导出钱包、部署或推送。未取得 Sairn 权限、legalCheck 字段/权重确认、费用净额和真实退款证据；这些依赖仍阻止生产启用。

## 后续与替代关系

本次细化[首轮复核](2026-09-13-across-plan-review-followup.md)的验收与恢复范围，不整体替代其事实纠正或历史检查。先按方案 P0 收集外部证据，可同步做明确标识的 mock；P3 仍需授权操作员完成首充与退款取回。交给 Claude 的下一轮审查应聚焦 N1–N8 实际 diff 和上述未采纳推断，不重新扩展首期架构。
