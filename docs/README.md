# 文档地图

从任务进入文档，而不是靠文件名猜当前方案。维护方法见[文档体系](documentation-system.md)。本轮导航整理于 2026-09-12；这里区分当前契约、历史材料和外部参考，不表示所有旧资料已逐行验证。

## 开始使用与交付

| 需要完成的事 | 入口 |
| --- | --- |
| 了解项目并启动本地环境 | [仓库 README](../README.md)、[本地开发教程](tutorials/local-development.md) |
| 查目录、路由、Provider、命令 | [Terminal Reference](../apps/terminal/README.md)、[开发约定](../agent.md) |
| 查共享包与营销站点 | [hl-react](../packages/hl-react/README.md)、[UI](../packages/ui/README.md)、[Website](../apps/website/README.md) |
| 看用户可见变化 | [Changelog / Unreleased](../CHANGELOG.md)，不代表已经发布 |
| 部署、入口保护与回滚 | [CloudFront 发布](../deploy/cloudfront/README.md)（现行宿主；移动配对为纯客户端传输、无服务端路由，配对开关在真机清单记录前保持关闭，见 [ADR 0015](adr/0015-link-device-alignment.md) D7 与 D8）、[产物清单](../deploy/manifests/README.md)、[部署夹具](../deploy/fixtures/README.md) |
| 接手续作与查历史证据 | 持续任务使用项目 `docs/work-memory/` 入口；[历史资料说明](../notes/README.md)、[历史与文档审查索引](../notes/index.md)补足原始 review |
| 理解决策利弊 | [ADR 索引](adr/README.md)；移动配对去票据实施规划见 [方案 B 规划](mobile-sync-ticketless-transfer-plan.md)，其后续加固见 [配对页加固规划](pairing-page-hardening-plan.md)（已随 p22 上线，开关关闭）；对齐官方量级的收敛方案见 [关联移动设备简化规划](link-mobile-device-simplification-plan.md)（2026-09-24 已实施，ADR 0015 D8） |

## 当前设计与 Reference

这些是相关任务的首选契约入口。修改行为时先阅读并同步更新，具体的实测范围以各文档证据部分为准。

| 主题 | 设计、行为与验证入口 |
| --- | --- |
| 产品稳定约束与运行边界 | [AGENTS](../AGENTS.md)、[Runtime guardrails](runtime-guardrails.md) |
| 钱包身份与首次交易 | [首次交易](trading-onboarding.md)、[邮箱签名](email-trading-signing.md)、[签名机制](hyperliquid-signing.md)、[签名 ADR](adr/0002-exact-owner-trading-signers.md) |
| 钱包调试与桌面配对 | [初始化调试](wallet-initialization-debugging.md)、[Privy 主题与钱包稳定性](adr/0026-privy-follows-theme-after-upgrade.md)、[手机访问与扫码设计](mobile-phone-access-scanner-prd.md)、[设备验证清单](mobile-phone-access-device-validation.md) |
| 充值、提现与资金 | [CCTP 充值](cctp-deposits.md)、[提现路由](withdrawals.md)、[账户概要](account-overview.md)、[Portfolio 统计](portfolio-statistics.md) |
| Earn 借贷储备池 | [Earn](earn.md)、[ADR 0021](adr/0021-earn-borrow-lend-page.md)：数据来源、Max 与清算价公式、按钮门控、提交核验、与官方终端的偏差；未做真实钱包验收 |
| 账户共享模型 | [账户 ADR](adr/0001-account-overview-cross-shell-model.md)；账户概要与 Portfolio 的就绪条件不同 |
| 市场身份、路由与展示价格 | [单交易路由迁移](architecture/trade-single-route-migration.md)、[价格来源审查](price-source-audit.md)、[资产资料来源](spot-asset-information.md) |
| 下单状态与桌面/移动表单 | [草稿生命周期](order-draft-lifecycle.md)、[双端一致性](order-entry-surface-parity.md)、[表单布局](order-entry-layout-audit.md)、[TWAP 回归](twap-regression-tests.md)（含 TWAP 成交 CSV 导出）、[未平仓量上限拦截](open-interest-cap.md)（[ADR 0023](adr/0023-open-interest-cap-advisory-check.md)）；[只减仓修复方案](reduce-only-repair-plan.md)记录已实施设计、官方有仓位表单观察与验收矩阵 |
| 确认弹窗：展示与执行 | [确认面契约](confirmation-surfaces.md)、[ADR 0017](adr/0017-market-close-confirmed-size-ceiling.md)、[ADR 0014](adr/0014-market-close-submit-and-dismiss.md)；当前实施状态与保留例外见契约。[TP/SL 大额滑点提示](position-tpsl-slippage-warning.md)与[杠杆弹窗仓位上限](leverage-position-limit.md)是只读提示，不参与提交 |
| HIP-3 部署者免责声明 | [行为、出口与官方对照](hip3-deployer-disclaimer.md)：交易页只能确认或「离开此市场」，四个平仓流程先显示可取消的声明，全部平仓在接受时重新生成快照 |
| 交易通知与订单队列 | [全局操作通知规范](trading-notifications.md)、[ADR 0019](adr/0019-global-trading-notifications.md)：已实现单一 Sonner 宿主、带身份任务、批次明细与 pending 恢复；[反馈组件审查](trading-feedback-review.md)保留修复前证据与替代说明。通知不是完整交易历史，实际验证范围见[交付记录](work-memory/sessions/2026-09-21-global-sonner-notifications.md) |
| 订单簿数据、交互与动画 | [分组隔离修复依据](terminal-review-remediation.md)、[传输 ADR](adr/0003-orderbook-transport-isolation.md)、[累计悬浮](orderbook-hover.md)、[行几何](orderbook-layout.md)、[新增档位及数量反馈](orderbook-new-level-animation.md)、[最近成交面板](recent-trades.md) |
| 响应式布局与控件 | [桌面网格](desktop-grid-layout.md)、[交易滑杆](slider-interactions.md)（含手势改动的验证规则与「滑杆跳回」的诊断步骤；缘由见 [ADR 0018](adr/0018-slider-gestures-end-on-release.md)）、[工具栏](trading-toolbar-redesign.md) |
| 行情数据页面 | [资金费率历史](market-funding-history.md)（图表区 Funding 页签）、[资金费率对比页](funding-comparison.md)（`/fundingComparison`） |
| 被动加载与语言切换 | [数据展示契约](mobile-data-presentation.md)、[加载审查与证据](terminal-loading-audit.md)、[运行时翻译](i18n-presentation.md)、[ADR 0024 错误在显示时翻译](adr/0024-translate-action-errors-at-render.md) |
| 视觉与启动性能 | [UI 入口及优先级](ui-ux-guidelines.md)、[启动性能基线](terminal-performance-baseline.md)、[OG 资产](../designs/og-cards/README.md) |
| 数字格式与日期 locale | [数字格式设置](number-format-setting.md)：数字跟随设置、日期跟随语言且固定拉丁数字、图表随设置重建、组件不得直接调用 `Intl` |
| Hyperliquid API 核对 | [核对工作流](hyperliquid-sdk-reference.md)、[方法目录](hyperliquid-sdk-directory.md)、[独立 API Skill 资料](../packages/hyperliquid-api/README.md)、[接口覆盖审查](hyperliquid-sdk-coverage-review.md)（`e3b5dd82` 基线的 SDK 调用覆盖与未接入接口分类）、[第一批接入规划与实施记录](sdk-feature-integration-plan.md) |
| Across API 核对 | [共享阅读入口](across-reference.md)：官方索引、按需读取与接口 schema 核验；供 Codex、Claude 共用 |

## 拟实施方案

这些文档是开发计划，不代表当前产品已经支持。

| 主题 | 方案与前置条件 |
| --- | --- |
| 数字格式与图表翻译对齐官方 | [规划](number-format-and-chart-translation-plan.md)：图表传 `numeric_formatting` 并随数字格式设置重建、日期/排序规则收口、输入框与阿拉伯语数字系统待决策；图表库内错译用 `custom_translate_function` 定点修补，先审计后收录、每条绑定库条目；数字格式四项（A-1/A-2a/A-3/A-4）已实施，归属见[数字格式设置](number-format-setting.md)，方案 B 待 zh + ar 审计 |
| 移动持仓全部平仓 | [入口审查与实施说明](mobile-close-all-plan.md)：持仓工具栏已接入共享全账户市价链路；确认面列出实际目标并明示包含筛选隐藏仓位，后台提交跨页签和断点保持；批量限价和 TP/SL 清理仍为后续专项 |
| Across 持久充值地址 | [接入设计](across-deposit-addresses.md)、[ADR 0004](adr/0004-across-deposit-addresses.md)：邮箱用户独立入口；生产权限、服务端身份/持久化、账户模式及资金验收待完成 |
| 静态 SPA 壳与无服务器托管 | [ADR 0005](adr/0005-spa-static-shell.md)：运行时不再 SSR，Node 进程用预渲染的 `_shell.html` 回答导航（文档页自 [ADR 0020](adr/0020-legal-pages-in-app-shell.md) 起并入应用外壳），只执行可移植的 `/api/*` 处理器；发布健康检查含真实 geo 探针；把 `public/` 搬到 CDN 与边缘运行时挂载待完成 |
| 启动渲染 | [ADR 0010](adr/0010-blank-until-ready-startup.md)、[规则](../.claude/rules/startup-rendering.md)：统一空播报 → 持久语言真实 chrome → 市场内容；[ADR 0009](adr/0009-startup-placeholder-single-source.md) 的纯 runtime view 决策保留，占位决策已被部分取代 |
| 启动性能对齐官方站 | [修复计划](terminal-startup-performance-plan.md)：壳内预加载交易页静态闭包、壳与图表包边缘缓存、地区判定预取与 Lambda 保温、分块整理；含同环境冷缓存对比数据与需要决策的事项；各项状态见文内 |
| CSP 第二步：内联脚本哈希 | [计划](csp-inline-script-hashes-plan.md)：`script-src` 去掉 `'unsafe-inline'`，哈希随发布轮换并保留上一版集合，先 report-only 观察再强制；含现状数据、备选方案与需要决策的事项；B、C、D 阶段均已执行 |
| 桌面 md 断点右列堆叠 | [计划](desktop-grid-stacked-right-column-plan.md)：1001–1420 px 时下单面板在上、订单簿在下、账户信息再下，图表列 10/14；含官方 fiber 实测几何、新默认几何、边界规则、v12 迁移与回归套件清单；已实施，决策见 ADR 0011 |
| 资金类弹层的结果反馈 | [方案](funds-dialog-outcome-plan.md)：划转、发送、提现、充值对照官方终端的做法（保持打开到请求结束、无论成败都关闭、结果走通知、长时间状态放在通知与持久化的待处理列表）；分三步，含官方前端包取证、Sairn 现状、三项需要决策的事项与验收标准；三步均已实施，未发布，未做真实钱包验收，偏差见文内「实施记录」 |
| 公告功能 | [方案](announcements-plan.md)：参照官方终端的静态公告源，Sairn 自有内容放在同源 `/feeds/announcements/`，Markdown 正文不注入 HTML，桌面提示走共享通知宿主、手机只显示圆点；含官方做法对照、分步实施、四项需要决定的事项与验收标准；未实施 |
| SDK 未接入接口 | [覆盖审查的收益排序](hyperliquid-sdk-coverage-review.md#收益排序)：第一批六项已在集成分支实现（见[接入规划](sdk-feature-integration-plan.md)的实施记录，未合入 `dev`、未发布）；服务端账户通知、子账户、HIP-4 预测市场与 Agent 代签资金操作需先有设计与 ADR，未排期 |
| 品牌迁移 gatu → Sairn | [品牌标识与素材](brand-assets.md)（唯一来源 `brand/brand.json`、读取方与校验）；[计划](brand-migration-plan.md)：设计交付物核验、改名范围、需要用户决定的 24 项、分阶段实施（单一来源、Logo 与图标、动效、分享卡、名称与多语言、品牌色、域名切换）、仓库外清单与风险；已按用户决定实施（内部标识、Agent 槽位名、包作用域与域名都改为 sairn），过程见[执行记录](work-memory/sessions/2026-10-01-sairn-brand-migration-execution.md)，域名切换按用户决定改为 gatu.ai 直接下线，执行方案见 [gatu.ai 下线、切换到 sairn.ai](sairn-domain-cutover-plan.md)（执行中，决策见 [ADR 0032](adr/0032-gatu-offline-cutover-to-sairn.md)） |

## 历史设计、调查与交付证据

这些文件保留当时的方案、观察或执行结果。使用其中的“当前”“已完成”“通过”前必须核对范围和日期；本表不把它们提升为现行契约。

| 主题 | 原文 | 当前接手入口 |
| --- | --- | --- |
| 早期市场架构 | [market-system](architecture/market-system.md)、[markets-arch](architecture/markets-arch.md)、[实现草案](architecture/unified-markets-implementation.md) | Terminal Reference、单交易路由、当前 `domain/market` 实现 |
| 早期 Provider / 签名 | [Provider 方案](hyperliquid-provider-architecture.md)、[签名方案](signing-architecture-proposal.md) | Runtime guardrails、签名 ADR |
| 配对票据修复演进（原文已移除） | 票据时期的六份文档（票据修复方案、旧生产核查原文、实施记录、发布防护方案、防护验证、EC2 时期配对发布流程）随服务端票据与 EC2 宿主退役，2026-09-18 从工作树移除；需要原文时从提交 `5d393572` 的 `docs/mobile-sync-*.md` 取回 | [无票据传输方案](mobile-sync-ticketless-transfer-plan.md)、[ADR 0015](adr/0015-link-device-alignment.md) D7（方案 B，已实施，开关仍关闭）、[CloudFront 发布](../deploy/cloudfront/README.md) |
| 产品页面交付 | [API Wallet](api-wallet-redesign-notes.md)、[Leaderboard / Vaults / Staking](leaderboard-vaults-staking-redesign-notes.md) | 对应代码与各记录内的验证范围；共用 frame 见 [ADR 0009](adr/0009-startup-placeholder-single-source.md) |
| 终端专项审查 | [字段审查](order-entry-field-review.md)、[订单簿参考观察](orderbook-ui-reference-audit.md)、[回归修复](terminal-test-regression-repair.md)、[中性底色全量清单](neutral-surface-audit.md) | 对应当前主题契约；底色清单为源码审查，视觉精简尚未实施 |
| API 与交易调查 | [集成审计](hyperliquid-integration-audit.md)、[订单验证排查](order-validation-analysis.md) | SDK 核对工作流、当前订单提交路径 |
| 启动与性能建议 | [首次加载观察](architecture/hyperliquid-first-load-investigation.md)、[Web3 包优化](web3-bundle-optimization.md)、[并发渲染](concurrent-rendering.md)、[TanStack 优化](tanstack-start-optimization.md) | Runtime guardrails、性能基线；旧字节数字不能作当前预算 |
| WebSocket 与内存研究 | [优化分析](websocket-optimization.md)、[加固路线图](websocket-hardening-roadmap.md)、[待收集输入](websocket-info-needed.md)、[内存与泄漏](memory-management.md)、[错误管理方案](error-handling-architecture.md) | 当前 hl-react 实现、传输 ADR、测试；路线图勾选不代表生产验收 |
| 旧视觉方案 | [redesign](redesign.md)、[Linear 分析](linear.md)、[Refactoring UI 资料](refactoring-ui.md)、[命名资料](file-naming.md) | AGENTS、UI Reference 与实际主题令牌 |
| 原始 review 与会话 | [工作记忆索引](../notes/index.md) | 索引指向保留的原始文件及后续契约 |

## 外部资料与其他目录

| 资料 | 定位 |
| --- | --- |
| [SDK 快照 1](hyperliquid-sdk-1.md)、[快照 2](hyperliquid-sdk-2.md) | 已归档的 0.33.1 schema；不能覆盖仓库锁定版本 |
| [前端校验摘录](hyperliquid-frontend-checks.md)、[Wagmi 规则](wagmi.md)、[TanStack 链接](tanstack.md)、[iOS 输入资料](best-practices-ios-safari-inputs.md) | 外部技术参考；修改相关技术行为前重新查官方资料及本地版本 |
| [features](../features/README.md) | 功能说明与早期计划；各项成熟度不同，需对照实现 |
| [research](../research/) | 产品/协议研究，不能视为已承诺或已实现功能；[移动钱包 PWA 早期 PRD 与议题拆分](../research/mobile-wallet-pwa/PRD.md) 是历史草稿，现行契约见 Runtime guardrails §8 与移动配对文档 |
| [pipeline/features](../pipeline/features/README.md)、[pipeline/blog](../pipeline/blog/README.md) | 规划与内容生产资料 |
| [legal](../legal/README.md) | 法务内容入口，本文档审查未做法律有效性评估 |
| [移动钱包研究](../outputs/wallet-mobile-pwa-research.md)、[来源记录](../outputs/wallet-mobile-pwa-research.provenance.md) | 当时的外部研究，不替代当前钱包契约 |
| [旧 onboarding 指南](../codex-onboard.md) | 历史开发资料；当前起点是 `agent.md` 与本地开发教程 |

发现未覆盖主题时，在现有主题文档中补充或新增专门页面，再链接到本页。待验证事项放进工作索引，不能隐藏在“全部完成”的总结中。
