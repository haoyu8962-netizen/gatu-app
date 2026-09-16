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

- [移动端六个表面迁移到共享占位视图](sessions/2026-09-16-mobile-views-migration.md) — 2026-09-16；已整理，验证见正文。表面 6 六个移动表面与外框改用共享纯视图；旧 class 模块删除，浏览器服务被 EPERM 阻止，盒子实测待 reviewer。
- [中性卡片底色与相邻弱填充全量源码审查](sessions/2026-09-12-neutral-surface-audit.md) — 2026-09-12；已整理，验证见正文。同色卡片 43 次引用涉及 28 文件；扩展 hover 与弱填充后覆盖 106 文件，区分只读精简候选、交互状态、共享覆盖和未启用分支；未修改 UI、未逐页视觉验收。
- [下单布局：自然高度、TWAP 与双端表单](sessions/2026-09-12-order-entry-layout.md) — 2026-09-12；已整理，验证见正文。保留双端草稿与字段语义，移动表单自然增长；桌面遵守独立网格约束。
- [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) — 2026-09-12；已整理，验证见正文。核对构建中断与包预算失败，删除未使用的成交错误分支、共用订单类型消息描述并修复过期语言测试夹具；保留快照与交互检查。

### 行情字段与被动恢复展示

当前规范：[docs/mobile-data-presentation.md](../../docs/mobile-data-presentation.md) · [docs/price-source-audit.md](../../docs/price-source-audit.md) · [docs/terminal-loading-audit.md](../../docs/terminal-loading-audit.md)

- [移动端六个表面迁移到共享占位视图](sessions/2026-09-16-mobile-views-migration.md) — 2026-09-16；已整理，验证见正文。表面 6 六个移动表面与外框改用共享纯视图；旧 class 模块删除，浏览器服务被 EPERM 阻止，盒子实测待 reviewer。
- [热访问启动：为什么第 2..n 次仍出现占位壳，以及经核实的改进计划](sessions/2026-09-16-warm-visit-startup-plan.md) — 2026-09-16；已整理，验证见正文。三次连续访问实测：热访问壳 0.16–0.28 s、真实终端 0.43–0.65 s（4× CPU 1.36–1.42 s，全是 JS 求值与 provider 挂载）；官方站热访问空白 1.4–1.7 s（4× 3.1–3.6 s）且资源每次重验证，照抄是回归。真正多余的等待是持久化目录丢失（尾沿节流无隐藏时写回）、24 h 播种上限、壳 HTML 每次 304。P1 三项已实现；Round 2 修复 SW 响应体克隆竞态并实现 Markets Activity 与弹窗 matchMedia 两项 P2。未发布，性能与真机复测待完成。
- [移动占位壳与真实终端逐像素对齐](sessions/2026-09-15-mobile-shell-parity.md) — 2026-09-15；已验证，范围见正文。移动启动占位原与真实终端完全不同（头部缺三个控件、48px 市场栏、按比例分配的交易区、4 个标签）；改为复用真实组件的 class 常量绘制同一套 chrome，Playwright 在 360/390/430 三档视口、深浅主题、中英文下实测所有结构盒子一致；运行时回退改用翻译标签与持久化页签。
- [行情恢复：字段来源、静默占位与操作守卫](sessions/2026-09-12-market-recovery.md) — 2026-09-12；已整理，验证见正文。被动恢复不闪烁错误提示，展示回退与交易可用性分开，区分 midPx、markPx 和空快照。
- [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) — 2026-09-12；已整理，验证见正文。核对构建中断与包预算失败，删除未使用的成交错误分支、共用订单类型消息描述并修复过期语言测试夹具；保留快照与交互检查。

### Vite 依赖缓存与浏览器夹具

当前规范：[docs/runtime-guardrails.md](../../docs/runtime-guardrails.md)

- [PR #22：复审、夹具隔离及版本化验证](sessions/2026-09-12-pr22-review.md) — 2026-09-12；已整理，验证见正文。旧版本 CI 全绿不能继承到新提交；最新基线有三项构建失败，待独立排查。
- [Vite 缓存：应用与浏览器夹具独立](sessions/2026-09-12-vite-cache.md) — 2026-09-12；已整理，验证见正文。端口和 root 不足以隔离依赖缓存；专用夹具还需独立入口和完整 mock。

### 账户模式与资金操作

当前规范：[docs/account-overview.md](../../docs/account-overview.md) · [docs/withdrawals.md](../../docs/withdrawals.md) · [docs/cctp-deposits.md](../../docs/cctp-deposits.md)

- [邮箱钱包标识、密钥导出入口及发送网络说明修复](sessions/2026-09-16-email-wallet-ui-fix.md) — 2026-09-16；已整理，验证见正文。修复紧凑布局邮箱身份显示，补齐精确所有者邮箱钱包导出入口，区分 HyperCore 发送与 Arbitrum 提款；真实密钥导出未执行。
- [Across 持久充值地址接入规划](sessions/2026-09-13-across-deposit-address-plan.md) — 2026-09-13；已整理，验证见正文。规划邮箱用户的 Across 持久充值地址入口，保留外部 CCTP 与旧余额恢复；权限、持久存储、资金落点和真实转账验证仍是实施前置条件。
- [Across 官方文档共享阅读入口](sessions/2026-09-13-across-docs-entry.md) — 2026-09-13；已整理，验证见正文。以官方索引和按需页面核验接入 Across 文档，Codex 与 Claude 共用项目入口；不安装交易工具，API Markdown 与 MCP 的覆盖缺口需回退正式页面。
- [Across 地址方案：Claude 审查逐项复核与首期收缩](sessions/2026-09-13-across-plan-review-followup.md) — 2026-09-13；已整理，验证见正文。复核 P0/P1/P2 建议，补激活、首次账户和导出恢复，首期改两表与按需查询；纠正 recipient、request ID、index-0、最低额和部署状态推断，生产契约与真实资金验收仍待完成。
- [Across 二轮复审：N1–N8 验收与恢复边界](sessions/2026-09-13-across-rereview-resolution.md) — 2026-09-13；已整理，验证见正文。补 legal 可判定验收、导出兼容、token、密钥和受控恢复；不采用 WebView 一律禁用、10 USDC 通用引导或交易 hash 主键，生产依赖仍未完成。
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

### 静态托管与 SPA 壳

当前规范：[docs/adr/0005-spa-static-shell.md](../../docs/adr/0005-spa-static-shell.md) · [deploy/README.md](../../deploy/README.md)

- [桌面账户面板：单一来源展示组件迁移](sessions/2026-09-16-account-panels-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 5 共享账户页签、概览与按钮纯视图；394 项通过，18 项既有 mock 失败前后不变；类型、Biome 与 memory 检查通过，浏览器因沙箱 EPERM 待 reviewer。
- [桌面市场头与收藏条：单一来源展示组件迁移](sessions/2026-09-16-market-header-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 1 抽取五个纯视图，真实界面与静态及运行时占位共用标记；指标改为内容宽度和 32px 间距，标签统一首字母大写。初轮指定回归 207 项通过；round 2 改用隐形典型文本预留宽度及路由已知名称/类型，指定回归 81 项、补充回归 102 项通过，浏览器复测留给 reviewer。
- [移动端六个表面迁移到共享占位视图](sessions/2026-09-16-mobile-views-migration.md) — 2026-09-16；已整理，验证见正文。表面 6 六个移动表面与外框改用共享纯视图；旧 class 模块删除，浏览器服务被 EPERM 阻止，盒子实测待 reviewer。
- [桌面订单簿 chrome 单一来源迁移](sessions/2026-09-16-orderbook-chrome-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 3：桌面订单簿列头、侧容器、价差共用纯视图，页签和分组按钮与真实 primitive 对照；数据前分组显示 —，Playwright 留给 reviewer。
- [启动占位单一来源：ADR 0009 与展示组件规则](sessions/2026-09-16-placeholder-single-source-adr.md) — 2026-09-16；已整理，验证见正文。核对确认桌面壳九个 frame、移动壳与运行时占位是三份手写实现，唯一共享的是网格几何；采纳「展示组件是几何唯一来源」的架构：只接 props 的 *-view.tsx 由运行时容器与壳共同渲染，占位 props 单一来源，导入边界与一致性测试钉住，inert 取代禁止交互元素；本轮只落 ADR、规则与索引，迁移未开始。
- [桌面顶栏、页脚与外框单一来源迁移](sessions/2026-09-16-top-nav-footer-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 2：六个纯视图共享桌面顶栏、页脚、外框与按钮几何；Dropdown 增加 opt-in renderTrigger；匿名 CTA 144px、时钟占位及 compact 收折统一。自动验证见正文，Playwright 待 reviewer。
- [桌面交易面板框架：单一来源展示组件迁移](sessions/2026-09-16-trade-panel-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 4 桌面下单共享视图迁移；Round 2 删除 slider/percent 应用复制树、共用纯输入样式、同步持久化滑点；reviewer 前版几何测量与本轮验证范围分别记录。
- [热访问启动：为什么第 2..n 次仍出现占位壳，以及经核实的改进计划](sessions/2026-09-16-warm-visit-startup-plan.md) — 2026-09-16；已整理，验证见正文。三次连续访问实测：热访问壳 0.16–0.28 s、真实终端 0.43–0.65 s（4× CPU 1.36–1.42 s，全是 JS 求值与 provider 挂载）；官方站热访问空白 1.4–1.7 s（4× 3.1–3.6 s）且资源每次重验证，照抄是回归。真正多余的等待是持久化目录丢失（尾沿节流无隐藏时写回）、24 h 播种上限、壳 HTML 每次 304。P1 三项已实现；Round 2 修复 SW 响应体克隆竞态并实现 Markets Activity 与弹窗 matchMedia 两项 P2。未发布，性能与真机复测待完成。
- [SPA 壳：在分支上跑通静态托管构建](sessions/2026-09-13-spa-shell-spike.md) — 2026-09-13；已整理，验证见正文。TanStack Start SPA 模式在 claude/spa-mode 分支构建通过并本地静态托管验证；第二检查点把 geo/错误上报改为可移植的 /api/* 处理器并静态化 build-meta.json；第三检查点关闭运行时 SSR（静态壳中间件）、补 /join 标记、旧路径别名与发布 geo 探针；CDN 搬迁与边缘挂载仍未完成。

### Agent 规则与文档治理

当前规范：[AGENTS.md](../../AGENTS.md) · [docs/documentation-system.md](../../docs/documentation-system.md) · [docs/README.md](../../docs/README.md)

- [启动占位单一来源：ADR 0009 与展示组件规则](sessions/2026-09-16-placeholder-single-source-adr.md) — 2026-09-16；已整理，验证见正文。核对确认桌面壳九个 frame、移动壳与运行时占位是三份手写实现，唯一共享的是网格几何；采纳「展示组件是几何唯一来源」的架构：只接 props 的 *-view.tsx 由运行时容器与壳共同渲染，占位 props 单一来源，导入边界与一致性测试钉住，inert 取代禁止交互元素；本轮只落 ADR、规则与索引，迁移未开始。
- [Across 官方文档共享阅读入口](sessions/2026-09-13-across-docs-entry.md) — 2026-09-13；已整理，验证见正文。以官方索引和按需页面核验接入 Across 文档，Codex 与 Claude 共用项目入口；不安装交易工具，API Markdown 与 MCP 的覆盖缺口需回退正式页面。
- [Across 地址方案：Claude 审查逐项复核与首期收缩](sessions/2026-09-13-across-plan-review-followup.md) — 2026-09-13；已整理，验证见正文。复核 P0/P1/P2 建议，补激活、首次账户和导出恢复，首期改两表与按需查询；纠正 recipient、request ID、index-0、最低额和部署状态推断，生产契约与真实资金验收仍待完成。
- [Across 二轮复审：N1–N8 验收与恢复边界](sessions/2026-09-13-across-rereview-resolution.md) — 2026-09-13；已整理，验证见正文。补 legal 可判定验收、导出兼容、token、密钥和受控恢复；不采用 WebView 一律禁用、10 USDC 通用引导或交易 hash 主键，生产依赖仍未完成。
- [AGENTS.md 指针化重构与 HypeTerminal 品牌残留清理](sessions/2026-09-13-agents-brand-cleanup.md) — 2026-09-13；已验证，范围见正文。AGENTS.md 由 24.7KB 压到 17.7KB：细节回归归属文档，新增 recent-trades.md 与 Order entry 节，每个契约配回归入口；全仓文档、测试夹具、bin 名、死存储键与 deepsec id 的旧品牌清理完成，仅保留两处刻意残留。

## 按记录日期检索

| 记录日期 | 任务记录 | 来源任务 | 基线提交 | 状态 |
| --- | --- | --- | --- | --- |
| 2026-09-16 | [桌面账户面板：单一来源展示组件迁移](sessions/2026-09-16-account-panels-view-migration.md) | 未取得任务标识，见正文 | `bfdae535adcb567dd8a763d71c31eb9b94b284bd` | 已整理，验证见正文 |
| 2026-09-16 | [邮箱钱包标识、密钥导出入口及发送网络说明修复](sessions/2026-09-16-email-wallet-ui-fix.md) | 未取得任务标识，见正文 | `f5010ee7` | 已整理，验证见正文 |
| 2026-09-16 | [桌面市场头与收藏条：单一来源展示组件迁移](sessions/2026-09-16-market-header-view-migration.md) | 未取得任务标识，见正文 | `0c8127456044390c95f7e5b4301fbbdd43a658e1` | 已整理，验证见正文 |
| 2026-09-16 | [移动端六个表面迁移到共享占位视图](sessions/2026-09-16-mobile-views-migration.md) | 未取得任务标识，见正文 | `b77a87909046a20469f71449525d619680daa4f1` | 已整理，验证见正文 |
| 2026-09-16 | [桌面订单簿 chrome 单一来源迁移](sessions/2026-09-16-orderbook-chrome-view-migration.md) | 未取得任务标识，见正文 | `7d80e46bbbf221a6f4256bf4008b9632c289627a` | 已整理，验证见正文 |
| 2026-09-16 | [启动占位单一来源：ADR 0009 与展示组件规则](sessions/2026-09-16-placeholder-single-source-adr.md) | 未取得任务标识，见正文 | `ade94020` | 已整理，验证见正文 |
| 2026-09-16 | [桌面顶栏、页脚与外框单一来源迁移](sessions/2026-09-16-top-nav-footer-view-migration.md) | 未取得任务标识，见正文 | `d43d50683a2641aa79d4a851d629e68568e3c4af` | 已整理，验证见正文 |
| 2026-09-16 | [桌面交易面板框架：单一来源展示组件迁移](sessions/2026-09-16-trade-panel-view-migration.md) | 未取得任务标识，见正文 | `3ecb960e8df1e2360be9c62ac59881b9f56ec622` | 已整理，验证见正文 |
| 2026-09-16 | [热访问启动：为什么第 2..n 次仍出现占位壳，以及经核实的改进计划](sessions/2026-09-16-warm-visit-startup-plan.md) | 未取得任务标识，见正文 | `f5010ee7` | 已整理，验证见正文 |
| 2026-09-15 | [移动占位壳与真实终端逐像素对齐](sessions/2026-09-15-mobile-shell-parity.md) | 未取得任务标识，见正文 | `f5010ee7` | 已验证，范围见正文 |
| 2026-09-13 | [Across 持久充值地址接入规划](sessions/2026-09-13-across-deposit-address-plan.md) | 未取得任务标识，见正文 | `9750ccffd051e2b49bb4f90ba2a8f5afb5c7f961` | 已整理，验证见正文 |
| 2026-09-13 | [Across 官方文档共享阅读入口](sessions/2026-09-13-across-docs-entry.md) | 未取得任务标识，见正文 | `0662cae1d921ef71a3e60edef9f9c736ceacccb5` | 已整理，验证见正文 |
| 2026-09-13 | [Across 地址方案：Claude 审查逐项复核与首期收缩](sessions/2026-09-13-across-plan-review-followup.md) | 未取得任务标识，见正文 | `8153b7b74cd3bf02d91f9a0eb79a2688b123de9d` | 已整理，验证见正文 |
| 2026-09-13 | [Across 二轮复审：N1–N8 验收与恢复边界](sessions/2026-09-13-across-rereview-resolution.md) | 未取得任务标识，见正文 | `965e05900e4f4252d592beaf158967fb2fe74a6e` | 已整理，验证见正文 |
| 2026-09-13 | [AGENTS.md 指针化重构与 HypeTerminal 品牌残留清理](sessions/2026-09-13-agents-brand-cleanup.md) | 未取得任务标识，见正文 | `32b73f6892fc6882692c8a0964471a26ab63f272` | 已验证，范围见正文 |
| 2026-09-13 | [SPA 壳：在分支上跑通静态托管构建](sessions/2026-09-13-spa-shell-spike.md) | 未取得任务标识，见正文 | `2c44be20` | 已整理，验证见正文 |
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
