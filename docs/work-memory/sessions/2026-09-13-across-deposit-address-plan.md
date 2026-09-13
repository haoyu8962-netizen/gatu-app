<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-13-across-deposit-address-plan",
  "date": "2026-09-13",
  "title": "Across 持久充值地址接入规划",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "规划邮箱用户的 Across 持久充值地址入口，保留外部 CCTP 与旧余额恢复；权限、持久存储、资金落点和真实转账验证仍是实施前置条件。",
  "thread": null,
  "baseCommit": "9750ccffd051e2b49bb4f90ba2a8f5afb5c7f961",
  "commits": [],
  "sources": [{"path": "docs/across-deposit-addresses.md"}, {"path": "docs/adr/0004-across-deposit-addresses.md"}, {"path": "docs/cctp-deposits.md"}, {"url": "https://docs.across.to/introduction/persistent-deposit-addresses"}],
  "supersedes": []
}
-->
# Across 持久充值地址接入规划

## 背景与范围

用户要求核对开发文档并规划当前项目接入 Across 持久充值地址。本轮为设计交付，不实现或上线资金路径。开始时工作区干净，基线为元数据所列提交。未取得可核对的原始任务 ID，故 `thread` 为 null。

## 结论与依据

完成公开文档、现有服务端边界、精确 owner、充值入口与恢复逻辑核对。交付 [接入设计](../../across-deposit-addresses.md)、[拟议 ADR](../../adr/0004-across-deposit-addresses.md) 及两处导航。独立子代理分别核对供应商文档和仓库落点，并只读复核设计；根代理吸收退款归属、指令数组唯一匹配、legal/geo 对历史读取的例外、最终 HyperCore 交付证据和可空元数据更正。

首期邮箱 USDC 地址使用同源 REST、服务端 Privy owner 验证、单主机 SQLite 及独立对账 worker。Across 新入口门控与旧 CCTP 路由/恢复独立。新增永久地址的服务责任无法靠隐藏页面撤销；保留旧余额显式存款、历史查询和退款对账。

公开指南/鉴权页主机名不同，Integrator ID 用法、PDA 实际目标和额度须凭项目权限联调。子代理本轮只读一般 token 目录观察到 SPOT/PERPS，明确不作为 PDA 已获权限的证据。此前本任务可见对话中的浏览器与脚本审查属于来源报告，本轮不将它们视为真实资金验收。

## 验证与限制

首次 `pnpm memory:index` 失败：本记录误将 HTTPS 来源填入 `path`，已改为 schema 支持的 `url`，不修改验证工具绕过。2026-09-13，在基线 `9750ccff` 上仅文档变更的工作区完成：`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）、`git diff --check`；检查设计、ADR、任务记录和导航中的 122 个本地 Markdown 链接，均存在。网页已通过只读浏览核对；本地链接检查不等于所有远端 URL 的可用性测试。

本轮未跑 tsc/lint/build 或资金测试，因为没有修改运行代码。没有使用生产 API Key，没有申请真实充值地址，没有签名、充值或部署；不保存账户邮箱、地址、令牌或官方构建中的凭证内容。文档已完成；供应商联调、实现和灰度验收属于后续开发，不能由本次文档验证代替。

## 后续与替代关系

下一步按设计 P0 核实供应商权限/路线/退款/退出条件；可同步开发 mock，但 P1 后端基础与真实资金灰度完成前保持生产关闭。现有 CCTP 与 onboarding 契约继续有效，本轮不替代，不新增产品发布声明。
