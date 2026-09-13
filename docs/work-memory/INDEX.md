# 工作记忆索引

由 `pnpm memory:index` 生成；请编辑任务记录，不直接修改此文件。

历史记录用于检索证据，不覆盖当前 AGENTS.md、专题规范或代码。记录日期不等于事件发生日期；测试结论只对正文注明的版本和范围有效。

[使用与维护说明](README.md)

## 按议题检索

### PR 复审与回归验证

当前规范：[docs/terminal-review-remediation.md](../../docs/terminal-review-remediation.md)

- [部署包预算：订单队列去重与固定参数复验](sessions/2026-09-12-deploy-bundle-margin.md) — 2026-09-12；已验证，范围见正文。服务器交易页面 gzip 超限 11 字节；统一订单队列计数与徽标渲染，保留预算和状态优先级，本地完整构建通过，交易页面距上限 227 字节，线上待验证。
- [中性卡片底色与相邻弱填充全量源码审查](sessions/2026-09-12-neutral-surface-audit.md) — 2026-09-12；已整理，验证见正文。同色卡片 43 次引用涉及 28 文件；扩展 hover 与弱填充后覆盖 106 文件，区分只读精简候选、交互状态、共享覆盖和未启用分支；未修改 UI、未逐页视觉验收。
- [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) — 2026-09-12；已整理，验证见正文。核对构建中断与包预算失败，删除未使用的成交错误分支、共用订单类型消息描述并修复过期语言测试夹具；保留快照与交互检查。
- [PR #22：复审、夹具隔离及版本化验证](sessions/2026-09-12-pr22-review.md) — 2026-09-12；已整理，验证见正文。旧版本 CI 全绿不能继承到新提交；最新基线有三项构建失败，待独立排查。

### 移动端与桌面下单布局

当前规范：[docs/order-entry-layout-audit.md](../../docs/order-entry-layout-audit.md) · [docs/order-entry-surface-parity.md](../../docs/order-entry-surface-parity.md) · [docs/desktop-grid-layout.md](../../docs/desktop-grid-layout.md)

- [中性卡片底色与相邻弱填充全量源码审查](sessions/2026-09-12-neutral-surface-audit.md) — 2026-09-12；已整理，验证见正文。同色卡片 43 次引用涉及 28 文件；扩展 hover 与弱填充后覆盖 106 文件，区分只读精简候选、交互状态、共享覆盖和未启用分支；未修改 UI、未逐页视觉验收。
- [下单布局：自然高度、TWAP 与双端表单](sessions/2026-09-12-order-entry-layout.md) — 2026-09-12；已整理，验证见正文。保留双端草稿与字段语义，移动表单自然增长；桌面遵守独立网格约束。
- [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) — 2026-09-12；已整理，验证见正文。核对构建中断与包预算失败，删除未使用的成交错误分支、共用订单类型消息描述并修复过期语言测试夹具；保留快照与交互检查。

### 行情字段与被动恢复展示

当前规范：[docs/mobile-data-presentation.md](../../docs/mobile-data-presentation.md) · [docs/price-source-audit.md](../../docs/price-source-audit.md) · [docs/terminal-loading-audit.md](../../docs/terminal-loading-audit.md)

- [行情恢复：字段来源、静默占位与操作守卫](sessions/2026-09-12-market-recovery.md) — 2026-09-12；已整理，验证见正文。被动恢复不闪烁错误提示，展示回退与交易可用性分开，区分 midPx、markPx 和空快照。
- [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) — 2026-09-12；已整理，验证见正文。核对构建中断与包预算失败，删除未使用的成交错误分支、共用订单类型消息描述并修复过期语言测试夹具；保留快照与交互检查。

### Vite 依赖缓存与浏览器夹具

当前规范：[docs/runtime-guardrails.md](../../docs/runtime-guardrails.md)

- [PR #22：复审、夹具隔离及版本化验证](sessions/2026-09-12-pr22-review.md) — 2026-09-12；已整理，验证见正文。旧版本 CI 全绿不能继承到新提交；最新基线有三项构建失败，待独立排查。
- [Vite 缓存：应用与浏览器夹具独立](sessions/2026-09-12-vite-cache.md) — 2026-09-12；已整理，验证见正文。端口和 root 不足以隔离依赖缓存；专用夹具还需独立入口和完整 mock。

### 账户模式与资金操作

当前规范：[docs/account-overview.md](../../docs/account-overview.md) · [docs/withdrawals.md](../../docs/withdrawals.md) · [docs/cctp-deposits.md](../../docs/cctp-deposits.md)

- [Across 持久充值地址接入规划](sessions/2026-09-13-across-deposit-address-plan.md) — 2026-09-13；已整理，验证见正文。规划邮箱用户的 Across 持久充值地址入口，保留外部 CCTP 与旧余额恢复；权限、持久存储、资金落点和真实转账验证仍是实施前置条件。
- [Across 官方文档共享阅读入口](sessions/2026-09-13-across-docs-entry.md) — 2026-09-13；已整理，验证见正文。以官方索引和按需页面核验接入 Across 文档，Codex 与 Claude 共用项目入口；不安装交易工具，API Markdown 与 MCP 的覆盖缺口需回退正式页面。
- [账户与资金：模式语义、共享概览与精确转账](sessions/2026-09-12-account-funding.md) — 2026-09-12；已整理，验证见正文。模式标签依赖已解析服务器状态；桌面与移动共享账户语义，金额及签名身份严格校验。
- [中性卡片底色与相邻弱填充全量源码审查](sessions/2026-09-12-neutral-surface-audit.md) — 2026-09-12；已整理，验证见正文。同色卡片 43 次引用涉及 28 文件；扩展 hover 与弱填充后覆盖 106 文件，区分只读精简候选、交互状态、共享覆盖和未启用分支；未修改 UI、未逐页视觉验收。

### 移动配对与发布校验

当前规范：[docs/mobile-sync-production-readiness.md](../../docs/mobile-sync-production-readiness.md) · [deploy/README.md](../../deploy/README.md)

- [部署第 2 步：已安装 Caddy 配置与仓库不一致](sessions/2026-09-12-caddy-config-mismatch.md) — 2026-09-12；已整理，验证见正文。Caddy 转发头警告不是中止原因；管理员依次验证、安装、reload 仓库配置后重跑部署，服务器恢复尚待验证。
- [部署包预算：订单队列去重与固定参数复验](sessions/2026-09-12-deploy-bundle-margin.md) — 2026-09-12；已验证，范围见正文。服务器交易页面 gzip 超限 11 字节；统一订单队列计数与徽标渲染，保留预算和状态优先级，本地完整构建通过，交易页面距上限 227 字节，线上待验证。
- [移动配对：常规发布自动门控与可选真机晋级](sessions/2026-09-12-pairing-release.md) — 2026-09-12；已整理，验证见正文。普通部署允许配对开关开启；自动边缘门控与可选 promote 真机验收是不同路径。

### 工作记录与索引维护

当前规范：[docs/work-memory/README.md](../../docs/work-memory/README.md)

- [建立可追溯工作记录与定期索引](sessions/2026-09-12-work-memory.md) — 2026-09-12；已验证，范围见正文。三份本地可见记录快照、六个历史议题、生成与校验脚本，以及每周维护任务。

### Agent 规则与文档治理

当前规范：[AGENTS.md](../../AGENTS.md) · [docs/documentation-system.md](../../docs/documentation-system.md) · [docs/README.md](../../docs/README.md)

- [Across 官方文档共享阅读入口](sessions/2026-09-13-across-docs-entry.md) — 2026-09-13；已整理，验证见正文。以官方索引和按需页面核验接入 Across 文档，Codex 与 Claude 共用项目入口；不安装交易工具，API Markdown 与 MCP 的覆盖缺口需回退正式页面。
- [AGENTS.md 指针化重构与 HypeTerminal 品牌残留清理](sessions/2026-09-13-agents-brand-cleanup.md) — 2026-09-13；已验证，范围见正文。AGENTS.md 由 24.7KB 压到 17.7KB：细节回归归属文档，新增 recent-trades.md 与 Order entry 节，每个契约配回归入口；全仓文档、测试夹具、bin 名、死存储键与 deepsec id 的旧品牌清理完成，仅保留两处刻意残留。

## 按记录日期检索

| 记录日期 | 任务记录 | 来源任务 | 基线提交 | 状态 |
| --- | --- | --- | --- | --- |
| 2026-09-13 | [Across 持久充值地址接入规划](sessions/2026-09-13-across-deposit-address-plan.md) | 未取得任务标识，见正文 | `9750ccffd051e2b49bb4f90ba2a8f5afb5c7f961` | 已整理，验证见正文 |
| 2026-09-13 | [Across 官方文档共享阅读入口](sessions/2026-09-13-across-docs-entry.md) | 未取得任务标识，见正文 | `0662cae1d921ef71a3e60edef9f9c736ceacccb5` | 已整理，验证见正文 |
| 2026-09-13 | [AGENTS.md 指针化重构与 HypeTerminal 品牌残留清理](sessions/2026-09-13-agents-brand-cleanup.md) | 未取得任务标识，见正文 | `32b73f6892fc6882692c8a0964471a26ab63f272` | 已验证，范围见正文 |
| 2026-09-12 | [账户与资金：模式语义、共享概览与精确转账](sessions/2026-09-12-account-funding.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [部署第 2 步：已安装 Caddy 配置与仓库不一致](sessions/2026-09-12-caddy-config-mismatch.md) | 未取得任务标识，见正文 | `42349cb1` | 已整理，验证见正文 |
| 2026-09-12 | [部署包预算：订单队列去重与固定参数复验](sessions/2026-09-12-deploy-bundle-margin.md) | 未取得任务标识，见正文 | `23966794` | 已验证，范围见正文 |
| 2026-09-12 | [行情恢复：字段来源、静默占位与操作守卫](sessions/2026-09-12-market-recovery.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [中性卡片底色与相邻弱填充全量源码审查](sessions/2026-09-12-neutral-surface-audit.md) | 未取得任务标识，见正文 | `43ce177c384377c3f1f84a92623d4892b0859624` | 已整理，验证见正文 |
| 2026-09-12 | [下单布局：自然高度、TWAP 与双端表单](sessions/2026-09-12-order-entry-layout.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [移动配对：常规发布自动门控与可选真机晋级](sessions/2026-09-12-pairing-release.md) | 解释 gatu 服务配置不匹配（`01a09457-b938-7862-8278-681459added6`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `e2affd06` | 已整理，验证见正文 |
| 2026-09-12 | [PR #22：复审、夹具隔离及版本化验证](sessions/2026-09-12-pr22-review.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [Vite 缓存：应用与浏览器夹具独立](sessions/2026-09-12-vite-cache.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [建立可追溯工作记录与定期索引](sessions/2026-09-12-work-memory.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已验证，范围见正文 |
