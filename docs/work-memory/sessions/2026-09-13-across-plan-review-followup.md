<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-13-across-plan-review-followup",
  "date": "2026-09-13",
  "title": "Across 地址方案：Claude 审查逐项复核与首期收缩",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "docs-governance"],
  "summary": "复核 P0/P1/P2 建议，补激活、首次账户和导出恢复，首期改两表与按需查询；纠正 recipient、request ID、index-0、最低额和部署状态推断，生产契约与真实资金验收仍待完成。",
  "thread": null,
  "baseCommit": "8153b7b74cd3bf02d91f9a0eb79a2688b123de9d",
  "commits": [],
  "sources": [
    {"path": "docs/across-deposit-addresses.md"},
    {"path": "docs/adr/0004-across-deposit-addresses.md"},
    {"path": "docs/across-reference.md"},
    {"path": "apps/terminal/src/lib/wallet/privy-wagmi.ts"},
    {"path": "packages/hl-react/src/legal.ts"},
    {"url": "https://docs.across.to/api-reference/deposit-addresses/post"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/activation-gas-fee"},
    {"url": "https://docs.privy.io/wallets/wallets/export"}
  ],
  "supersedes": []
}
-->
# Across 地址方案：Claude 审查逐项复核与首期收缩

## 背景与范围

用户提供 `across-pda-plan-review-2026-09-13.md`，要求核对真实问题、修订开发方案与 ADR，并提供 Claude 再审提示词。本轮只修改设计、导航和工作记录，不实施充值功能。起始分支 `codex/UIreview`、工作区干净，基线见元数据；无法核对当前原始任务 ID，故 thread 为 null。报告以 `0662cae1` 为基线，不能继承其 HEAD/部署或验证结论作为本轮事实。

报告完整副本及本轮读取的公开资料保留于 Git 忽略的 `.worklog/2026-09-13/across-plan-review-followup/`；`claude-review.md` SHA-256 为 `58f7179a4d15aad124fea33bb6eab2c599f443d16b763f561f0e4277e7c4f5c7`。该目录不是完整会话归档：有用户指定的原报告、部分官方页面、来源清单、解析的创建接口类型及 npm 版本元数据，没有私有推理、账户凭证、钱包内容或完整工具流水。

## 结论与依据

下表的 P0/P1 编号沿用原报告；P2 原文未编号，按七条项目分别登记。章节指向[当前方案](../../across-deposit-addresses.md)，架构取舍同步 [ADR 0004](../../adr/0004-across-deposit-addresses.md)。

| 报告项 | 复核与处置 |
| --- | --- |
| P0-1 激活费 | 缺口成立；§2/§7/§9 增加首次目的账户 1 报价币、字段净额和代付口径核验。空余额不证明新账户，不能断言所有邮箱用户必扣；“净到账至少 5”的公式、约 3.7 估算及无条件容忍 1 USDC 差额均不采纳 |
| P0-2 首次账户模式 | 设计缺口成立；§3/§9 分离充值接收和交易资格，将成功 missing、既有 default、支持模式分别验收。报告“曝光完全不看模式”的范围过宽；未知/失败不能等同新账户，旧 dexAbstraction 不直接开放 |
| P0-3 退款取回 | 具体恢复路径缺失成立；§4/§7/§9 增加显式 Privy 导出、原链 Gas、自助导入及实际取回验收。应用当前无导出入口，但 SDK 有能力；不能断言资金事实上不可取回，也不能忽略已启用 sponsored 对旧 Arbitrum 余额的作用。MFA 按实际配置，不假设所有用户已启用 |
| P0-4 legal 语义 | 出口语义与总配额需要验证成立；§5/§6/§9 保留现有 parse/assert 和真实用户 IP 判定。`u` 的 UK 描述不足以证明字段仅依赖出口；不采纳只检查 acceptedTerms 或 5–10 分钟许可缓存，未知时失败关闭 |
| P0-5 误存退款 | 来源适用范围差异成立；§2/§7/§9 要求 GATU 自己的权限实测或供应商答复。HL 自家十分钟、5/1 USDC 规则和通用退款时间均不是 GATU 的默认承诺 |
| P1-1 后端过大 | 采纳两张地址表与按需代理；§1/§4/§6–§10 移除 worker、租约、全量镜像，也不添加报告中可选的五分钟巡检。记录代价：无离线主动告警/独立完整交易档案、依赖 API 保留期；不能承诺“随时取到全部历史”。备份/旧地址/停服责任仍保留 |
| P1-2 环境来源 | 成立；§5 采用现有 canonical Host，主网/测试域同进程隔离。Host 不是认证，反代/Origin/IP 信任仍需校验；开发 mock 使用独立环境 |
| P1-3 native 与部署 | 成立；§8/ADR 明选 better-sqlite3，保留 Node 22.15+，核对锁定 Nitro 的 traceDeps/外置实现，要求 Linux 实际加载和备份恢复。增加持久目录权限与 ReadWritePaths；不虚称它使 ProtectSystem=full 全盘只读。首期只有 gatu unit，回滚仍须保留恢复能力 |
| P1-4 Privy 服务端 | 方法/字段适配与原 DID 隔离建议成立；§5 固定 Node SDK 方法并以锁定类型复核。报告的“强制 index-0 与客户端一致”不成立：当前代码先 primary、再唯一、再唯一 index-0，且兼容 privy-v2；服务端没有可信 primary 时不能信前端。验签本地化不能替代钱包关联查询 |
| P1-5 Across schema | 部分成立：§2/§7 补指示性费用、秒单位、可空性、状态/过滤差异、主机和重报价。深入读取页面自带 Request Body 类型后，确认 recipient 是 string，200 返回才是 Account；200 类型的 id 明确为报障 request ID。报告这两项与当前页面不符，不保留伪缺口。费用倍率/包含项仍未明确，真实 Key 契约仍须验证 |
| P1-6 当前部署 | 条件性采纳 §1/§3 的 sponsored 可用才展示；报告“示例和文档均为 external-only”不成立，部署文档含 both，真实运行配置本轮未读取。默认 false 不证明生产状态，不能宣称 Across 一定是唯一可用入口 |
| P1-7 缓存预算 | 成立；§6 加单进程有界缓存/合并、Privy App/DID/sid 关联短缓存、身份及许可新鲜度、HL 总权重和供应商预算。legalCheck 权重未公开证实，不固定推导每次恰为 100；多实例前需要共享预算 |
| P2 routeRules/CSP | §4/§8 增加所有 API 成功/错误 no-store 与 no-referrer、同源调用及导出 CSP 验收，不新增 Across 浏览器 connect-src |
| P2 QR 复用 | §4 复用现有 qrcode/card，补充不能复用其 warning/unavailable 态展示被动获取失败 |
| P2 reason 与资金 guards | §3/§10 同步能力原因类别及资金可用性回归，原有 CCTP guards 保持 |
| P2 Across 查询页 | §7 提供用户主动点击的 transfers 兜底，不猜查询参数，也不把该页对 GATU 历史的可用性当作已验收 |
| P2 当前契约同步 | §9 保留实施前先修改相关 Reference 的顺序；本轮不把 runtime-guardrails、onboarding 或 CHANGELOG 写成已支持 Across |
| P2 README 状态 | 保留拟议/未实施标记，ADR 导航同步为两表及按需查询 |
| P2 历史链接验证 | 原记录 122 个链接是旧版本检查；本轮另查修改文档与导航的本地路径，不冒用旧结果 |

额外一致性修正：仅服务端已启用 recipe 可创建；临时详情引用不能绕过身份与归属，也不增加签名秘密或持久转账表；完整参数相同的兼容 recipe 复用原绑定，不让一个物理地址归属多份不同参数；主 DB/WAL/SHM/备份权限一致；公开 pilot 与仅授权操作员可达的首次资金验收环境分开；回滚到旧无 PDA 版本前必须先有经验证的恢复入口。

## 核对来源与方法

- Across：按[共享阅读入口](../../across-reference.md)读取 PDA、创建、列表、详情、FAQ、退款、鉴权及 HyperCore。静态可见正文未呈现完整类型，继续解析官方创建页自身携带的 Request Body/200 TypeScript 定义和字段图，不执行网页脚本、不猜私有 OpenAPI 地址。Request Body 虽被生成器命名为 `Response`，其位置明确来自 request body；recipient 是 string、refundAddresses 必填。200 的费用/ETA 可为 null、ETA 为秒、id 有 request ID 注释。该页面证据纠正了本轮最初的“未取得 schema/id 未文档化”中间判断；原始页面和解析文本保留。没有获得独立原始 OpenAPI 文件或真实鉴权响应。
- Hyperliquid：读取[激活费](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/activation-gas-fee)、[账户模式](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes)、[限额](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)、[邮箱充值 FAQ](https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/deposit-or-transfer-issues-missing-lost/deposited-usdc)及[导出实践](https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/export-your-email-wallet)。搜索缓存与即时 FAQ 不同，直接读取实时 `.md` 正文，不将旧搜索摘要当作当前“仅 Arbitrum”事实。
- SDK legalCheck：读取[方法 schema](https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/legalcheck)及本地 0.33.3 声明/项目 legal 纯函数；web 工具无法读取该 Markdown 时使用只读 GET 获取 `.md`，返回 200。没有执行真实 legalCheck 出口对照；报告的地域机制推断未被本文升级为事实。
- Privy：读取[访问令牌](https://docs.privy.io/authentication/user-authentication/access-tokens)、[用户查询](https://docs.privy.io/user-management/users/managing-users/querying-users)、[导出](https://docs.privy.io/wallets/wallets/export)、[MFA](https://docs.privy.io/authentication/user-authentication/mfa/verify/overview)、[删除用户](https://docs.privy.io/user-management/users/managing-users/deleting-users)和 Node 初始化；只读 npm 0.34.0 tarball 的 auth/user 类型，不安装依赖。对照本地 getPrivyEmbeddedWalletAddress 分支及已安装 React SDK 的 exportWallet 声明；不把官方通用能力视为当前部署已配置。
- 运行约束：读取 Node 22.15 SQLite、better-sqlite3、Nitro 官方资料，对照锁定 Nitro 的类型和 native 追踪代码、Vite routeRules、systemd、Caddy、deploy.sh、CCTP/Host/geo/onboarding/资金能力与已有测试源文件。只读已有测试不是执行测试。

## 验证与限制

本次检查绑定于 `8153b7b7` 上的文档工作区，不沿用原报告或原方案的检查数字。未运行应用 tsc/lint/build、浏览器钱包测试或真实资金/导出测试；未使用生产 Key、创建地址、签名、改运行配置、部署或推送。审查不能替代 P0 契约验证与 P3 授权小额验收。

首次 `pnpm memory:index` 失败：新记录使用了自定义章节名，缺少模板必需的“背景与范围”；已将背景和结论两处标题改为规定名称，不修改校验器。

2026-09-13 修正后完成 `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）及 `git diff --check`，均通过。检查本次修改的 Markdown（含生成索引和新增记录）及 `docs/README.md` 的 182 个本地文件/目录链接，均存在；该检查不覆盖页内 anchor、远端链接可用性或任何运行时行为。

## 后续与替代关系

本版替代[原规划记录](2026-09-13-across-deposit-address-plan.md)中的 worker/镜像等首期架构结论，原记录其余事实、历史验证与未决边界保留。生产契约问题已进入当前方案 P0；新账户、激活、模式落点和退款取回属于 P3。完成本轮文档修正不意味着这些真实接入任务完成。

提供 Claude 复审提示词，要求以当前 HEAD、官方实时文档和实际代码独立核对上表，重点复审未采纳建议及收缩后失去的能力；输出有证据的剩余问题，不把未实现 P0/P3 一律标成代码缺陷，也不把“已列计划”当作验收通过。

2026-09-13 后续：[N1–N8 二轮处置](2026-09-13-across-rereview-resolution.md)进一步补齐 legal 可判定标准、Web 导出兼容、受控重建、token/Secret 和跨阶段身份边界；未采纳 WebView 一律不支持、10 USDC 通用充值引导及交易哈希单独主键。本文的原始验证数字保留，本次追加不代表生产阻塞已解除。
