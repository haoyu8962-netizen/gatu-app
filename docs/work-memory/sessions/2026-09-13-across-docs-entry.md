<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-13-across-docs-entry",
  "date": "2026-09-13",
  "title": "Across 官方文档共享阅读入口",
  "kind": "task",
  "status": "recorded",
  "topics": ["docs-governance", "account-funding"],
  "summary": "以官方索引和按需页面核验接入 Across 文档，Codex 与 Claude 共用项目入口；不安装交易工具，API Markdown 与 MCP 的覆盖缺口需回退正式页面。",
  "thread": null,
  "baseCommit": "0662cae1d921ef71a3e60edef9f9c736ceacccb5",
  "commits": [],
  "sources": [{"path": "docs/across-reference.md"}, {"path": "CLAUDE.md"}, {"path": "AGENTS.md"}, {"url": "https://docs.across.to/ai-agents"}, {"url": "https://docs.across.to/ai-agents/llms-txt"}, {"url": "https://docs.across.to/ai-agents/mcp-server"}],
  "supersedes": []
}
-->
# Across 官方文档共享阅读入口

## 背景与范围

用户先要求比较 Across 的 AI 文档接入方式，随后授权执行共享阅读入口方案。基线工作区干净。本记录涵盖本任务可见的只读选型观察与后续文档落地；未取得独立核对的原始任务标识，故 `thread` 为 null。

## 结论与依据

采用一份 `docs/across-reference.md`，通过 AGENTS、Claude 入口和文档地图发现。按官方 `llms.txt` 找页面、指南按需读 Markdown、接口回到正式页面核验；不复制整站、不新增 Skill 或 MCP 配置、不改变充值行为。接入设计与 ADR 仍为拟议方案。

2026-09-13 在此前选型轮次实际读取官方 AI Agents、机器可读文档、MCP、AGENTS 模板及 Skills 仓库。`llms.txt` 可读；curl 获取持久地址指南 `.mdx` 为 HTTP 200、6,929 字节，创建接口 `.mdx` 为 HTTP 200、310 字节，后者仅含 APIPage 占位；`llms-full.txt` 为 322,071 字节。Web 工具打开指南 `.mdx` 返回工具级错误，改用 curl 成功，不能将前者误记成官方 404。猜测的 Skills 根 `SKILL.md` 原始 URL 为 404，改以已打开的官方仓库说明为依据，未执行安装命令。

同日对 `https://mcp.across.to/mcp` 执行无凭证的 initialize、tools/list 和三项只读 tools/call：服务版本 2.0.0，列出 14 个工具，包括钱包交换工具；`search_across_docs` 的持久地址搜索返回旧路径的概述，`get_page` 查询 `/api-reference/deposit-addresses/post` 返回 Page not found，`get_api_reference` 同端点返回空 endpoints。仅说明当次检索覆盖不足，不证明官方 API 不存在，也不把该服务标为纯文档工具。未调用重抓取、报价或交易工具。后续页面变化需重新核对。

独立只读代理核对 [Claude Code 官方导入规则](https://code.claude.com/docs/en/memory#import-additional-files)及 [AGENTS.md 共享方式](https://code.claude.com/docs/en/memory#agentsmd)：根 `CLAUDE.md` 使用裸 `@AGENTS.md`、`@agent.md`，相对路径以所在文件为基准；Across 阅读指针由共享规则提供。没有维护第二份 Across 说明。

## 验证与限制

2026-09-13，在上述基线上的本次文档工作区完成 `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）及 `git diff --check`。检查 167 个本地 Markdown 链接与 2 个 Claude 导入目标，均存在；确认 AGENTS 与文档地图均指向共享入口。检查不覆盖远端链接状态或新代理会话的运行时加载。外部核验是有限页面和工具抽查，不是全站完整性验证。

仅文档变更，无应用构建、资金测试、生产权限联调或部署；不声称已经在新的 Claude/Codex 会话中验证自动加载。没有读取或存储秘密。

## 后续与替代关系

无需安装即可从仓库入口读取。后续 Across 开发按共享流程读取最新官方材料；本任务不替代持久地址接入方案，不启用产品功能。
