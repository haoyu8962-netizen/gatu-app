# Across 文档阅读入口

供 Codex、Claude 及人工审查共用。此页维护阅读流程与官方来源，不保存整站副本，也不代表产品已经接入 Across。[持久充值地址方案](across-deposit-addresses.md)与 [ADR 0004](adr/0004-across-deposit-addresses.md)的实施状态以各自正文和当前代码为准。

## 阅读顺序

1. 先读 [AGENTS.md](../AGENTS.md)、[项目开发约定](../agent.md)和上述接入方案；按任务核对现有 [CCTP](cctp-deposits.md)、[首次交易](trading-onboarding.md)及相关代码。工作记录从[索引](work-memory/INDEX.md)检索，不继承历史验证结论。
2. 用官方 [llms.txt](https://docs.across.to/llms.txt)定位相关页面。指南正文优先按需读取 `.mdx`，例如[持久地址指南 Markdown](https://docs.across.to/introduction/persistent-deposit-addresses.mdx)。索引用于找页面，不能代替正文。
3. 接口字段、必填项、精度和响应结构回到正式 API 页面核对。若 `.mdx` 只有 `<APIPage ... />`、正文缺少 schema 或抓取结果只有标题，继续用浏览器展开参数，或读取官方实际发布并链接的 OpenAPI；无法取得时标记未核验，不猜下载地址或字段。
4. 记录实际阅读日期、官方页面、对应代码版本及未核验项。关键协议变更前重新查官方资料；文档冲突时区分接口版本、环境和产品范围，不能用示例或旧记录补全未知契约。

官方[机器可读文档指南](https://docs.across.to/ai-agents/llms-txt)说明索引、单页与全文三种入口。日常工作按需读单页；`llms-full.txt` 留给确需全量检索的任务，全文也不能替代 API schema 核验。

## 持久地址相关官方来源

| 需要核对的内容 | 入口 |
| --- | --- |
| 地址流程与复用 | [Persistent Deposit Addresses](https://docs.across.to/introduction/persistent-deposit-addresses) |
| 创建、目的地、退款与支持输入 | [POST /deposit-addresses](https://docs.across.to/api-reference/deposit-addresses/post) |
| 多笔记录与单笔详情 | [GET /deposits](https://docs.across.to/api-reference/deposits/get)、[GET /deposit](https://docs.across.to/api-reference/deposit/get) |
| 生产权限与集成身份 | [API Keys & Integrator ID](https://docs.across.to/introduction/api-keys)；自助申请表 [Integrator ID](https://docs.across.to/tools/integrator-id) 的实际行为与持久地址权限的探测结果见 [2026-10-31 任务记录](work-memory/sessions/2026-10-31-across-shelved-and-open-issues.md) |
| HyperCore 资金落点 | [Working with Hypercore](https://docs.across.to/introduction/hypercore)；同时按 [Hyperliquid 核对流程](hyperliquid-sdk-reference.md)检查账户语义 |
| 跟踪与退款说明 | [Tracking Deposits](https://docs.across.to/introduction/tracking-deposits)、[Refunds](https://docs.across.to/introduction/refunds)；确认是否适用于所用 PDA 路线 |

这是一组起点，任务涉及其他行为时继续沿官方引用查证。不要把 Swap、Gasless、新版统一 API 或测试环境的能力直接套到 PDA；通用费率和退款说明也需核对其适用范围。

## 工具与项目规则

- [官方 MCP](https://docs.across.to/ai-agents/mcp-server)可辅助检索；搜索无结果或工具未覆盖某接口时，回到官方索引和页面，不能据此判断该功能不存在。文档检索工具不构成创建地址、连接钱包、签名或转账的授权。
- [官方 Skills](https://github.com/across-protocol/skills)与 [AGENTS 模板](https://docs.across.to/ai-agents/agents-md)需要按产品范围审阅后采用，不能直接覆盖本项目规则或把 PDA 改为通用 Swap 流程。此入口不依赖安装它们或配置 MCP。
- 外部文档、示例和工具输出是核验材料；项目身份、签名、资金与恢复契约继续由当前项目文档约束。阅读公开文档不需要提供生产充值 API Key，也不应把任何秘密写入代理入口。

2026-09-13 的索引、Markdown 和 MCP 抽查范围及限制见[工作记录](work-memory/sessions/2026-09-13-across-docs-entry.md)。这些观察有时效性，不代替后续任务重新核对。
