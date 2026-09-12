# 2026-09-12 文档审查与补齐记录

类型：任务事实记录，包含本次完整用户需求和操作/结果摘要；不是完整对话或逐条工具输出导出。历史任务原始对话未随本次输入提供，不作补造。

基线：`422ea8a6`，任务开始 `git status --short` 为空。范围：设计、工作记忆、参考与交付文档；未改变应用逻辑、签名路径、资金行为或部署配置。

## 原始用户需求

以下保留本次用户需求全文：

```text
**你应该把文档当成跟代码一样重要、甚至更重要的东西来处理。**

文档具体可以分成几种：

1. **设计文档**：写清目标、约束、方案、边界与架构取舍；
2. **工作记忆文档**：也就是上面说的两层——完整原始记录，加定期整理的索引；
3. **参考与交付文档**：描述系统怎么工作的 Reference、带用户走通流程的教程、版本发布的 Release Notes，以及记录架构利弊权衡的决策文档。

请继续review 并且补充缺失的文档
```

## 范围、方法与观察

读取项目指导、现有主题文档、近期 Git 历史、包脚本及相关代码。并行核查三个有限主题：开发 Reference；Changelog/教程；签名与传输 ADR。主审负责分类地图、工作记忆、文档维护设计及跨文档一致性。无外部网页复验；外部资料使用已有日期与来源，不声称本轮重新验证。

| 发现 | 证据 | 处理 |
| --- | --- | --- |
| 文档没有统一分类与当前/历史入口 | 起始版本没有 `docs/README.md`，ADR 仅一份，`notes/` 仅一份会话笔记 | 新增地图、维护设计、ADR 索引和两层工作记忆说明 |
| 开发入口含旧路径、路由、Provider 和断点 | 当前 `src/routes/`、`providers/`、`config/privy.ts`、包脚本与 README/agent 指南不符 | 更新 `agent.md`、Terminal README 和根 README，增加有预期结果的开发教程 |
| hl-react Reference 仍以 Agent 为默认签名说明并引用旧 SDK 范围 | `useClients.ts`、owner signer、Agent storage、Provider 与 package.json | 补明 owner/Agent 分工、session/local 两种存储、合法最小 Provider 示例及实际宿主接线，版本对齐 0.33.3 |
| Changelog 仍称 ticker 来自默认 l2Book | [当前价格契约](../../docs/price-source-audit.md)与近期实现已改为 asset context | 改写 Unreleased，保留替代关系和未发布边界 |
| 签名与旧配对方案残留“必须关闭” | [当前发布流程](../../docs/mobile-sync-production-readiness.md)区分普通部署与严格 promote | 同步签名/引导文档、设备矩阵措辞，在旧计划追加历史更正 |
| 账户 ADR 的被动状态文字与静态零值规则过时 | 当前 `account-panel.tsx`、`disconnected-account-overview.tsx` 及[数据展示契约](../../docs/mobile-data-presentation.md) | 增加有日期的展示修订；保留共享模型和 Portfolio 独立就绪语义 |
| 旧 Provider 方案容易被当成当前接口 | 旧单一客户端工厂说明不符合当前 public transport/session/policy 分层 | 保留原方案并加历史状态和当前入口 |
| 旧计划三处章节链接失效 | 生产核查文件改写为当前发布流程后，原第 2/5/6 节不存在 | 从 `1b71e15b224b432a117f8cb553697ede2ef1c2f6` 恢复带来源声明的历史快照，正文与 Git 原文逐字节一致，链接恢复到实际证据 |
| 根 README 存在假设与失效链接 | Vite 不执行 typecheck；构建脚本没有协议检查；不存在仓库级 LICENSE | 纠正脚本说明，删除无证据的 MIT 断言，将许可文本缺口留在索引 |
| Website README 混淆终端部署和旧字体说明 | 现有部署手册与 `apps/website/src/styles/global.css` | 链接终端 Node 部署流程，说明两种字体，移除未经本轮核实的 DNS 固定值 |

## 交付文件

- 设计与导航：[文档体系](../../docs/documentation-system.md)、[地图](../../docs/README.md)、`AGENTS.md` 的稳定文档约定。
- 工作记忆：[说明](../README.md)、[索引](../index.md)和本记录。26 份既有根 review/会话来源保留原文和路径。
- 决策：[ADR 索引](../../docs/adr/README.md)、[精确 owner 签名](../../docs/adr/0002-exact-owner-trading-signers.md)、[订单簿传输隔离](../../docs/adr/0003-orderbook-transport-isolation.md)；两份新增 ADR 均明确是回溯记录。
- 参考与交付：[开发教程](../../docs/tutorials/local-development.md)、[Changelog](../../CHANGELOG.md)、根/应用/hl-react README、`agent.md` 及上述发生冲突的主题文档。

## 实际执行的验证

下列结果由本任务协作执行，并非复制此前文档中的通过数字。

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/orderbook.test.ts \
  src/lib/tests/vite-cache-isolation.test.ts \
  src/lib/tests/vite-development-cache.test.ts
pnpm --dir apps/terminal test:browser:orderbook-cls
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/l2-book-transport-pool.test.ts \
  src/lib/tests/owner-trading-signer.test.tsx \
  src/lib/tests/privy-owner-signer.test.ts \
  src/lib/tests/use-privy-owner-signer.test.tsx \
  src/lib/tests/owner-trading-status.test.tsx \
  src/lib/tests/trading-guard-session.test.tsx \
  src/lib/tests/trading-onboarding-gate.test.tsx \
  --maxWorkers=2
```

结果：前一组 3 文件/20 项通过；独立 Chrome 浏览器夹具 1 项通过；后一组 7 文件/99 项通过。浏览器检查使用 412×823 模拟视口，CLS 正向对照 0.001975，初始化/数量变化/档位切换采样为 0。它不是物理手机、真实钱包或生产性能验收。

文档链接、差异与原文保留检查的最终结果在下方追加。没有修改 TypeScript/TSX；本轮不把未运行的完整 typecheck/build/全量测试记作通过。

## 并行工作边界

审查期间工作区新增另一组工作记忆采集/索引工具、配置和 `AGENTS.md` 的 Work memory 节。该组修改不是本任务或本任务子代理所作，保留在工作区，不纳入本次提交。本轮将 `notes/` 明确为历史目录及文档审查记录，持续任务沿用项目 `docs/work-memory/` 入口，避免两套新任务记录规则。`AGENTS.md` 只暂存本次 Documentation contract 段落。

## 未完成证据与交接

[索引](../index.md)明确保留：未取得的历史完整对话、11 行真机 Not run、SSR locale 设计差异、缺失的仓库许可文本、未逐行复核的历史研究资料。本轮文档变更不代表已发布、已部署或完成全库安全审计。

## 收尾验证追加

针对 23 份任务文档检查了 429 个本地链接（包括 Markdown 章节锚点），全部解析有效；未将 HTTPS 链接的语法检查说成远端可访问性测试。26 份既有 review/会话文件与起始提交逐字节一致。恢复的生产核查快照去掉归档说明后，与其来源 Git blob 逐字节一致。`git diff --check` 通过。提交前继续检查暂存差异及提交消息；本记录使用基线与文件 Git 历史定位提交，不循环改写自己的提交号。
