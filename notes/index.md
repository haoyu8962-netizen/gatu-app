# 工作记忆索引

整理日期：2026-09-12。方法见[工作记忆说明](README.md)。本索引补充历史来源与文档审查，持续任务使用项目 `docs/work-memory/` 入口。本索引可持续整理；来源文件保留原文。条目是导航和证据状态，不是对全部历史问题的重新验收。

## 本轮及接手入口

| 主题 | 原始记录或证据 | 当前结论与接手入口 |
| --- | --- | --- |
| 文档审查与体系补齐 | [本次任务记录](session-logs/2026-09-12-documentation-review.md) | 新增分类地图、文档维护设计、两层工作记忆、教程与 ADR；更正路由、Provider、发布门槛、账户展示和 Changelog 漂移 |
| 钱包、邮箱及首次交易 | [历史钱包 review](../review-wallet-pwa-4commits.md)、[法律/Agent review](../review-legal-agent-10commits.md) | [签名 ADR](../docs/adr/0002-exact-owner-trading-signers.md)、[首次交易](../docs/trading-onboarding.md)；历史问题是否仍存在必须重查当前实现 |
| 订单簿分组隔离与反馈 | [终端审查修复](../docs/terminal-review-remediation.md)、[参考观察](../docs/orderbook-ui-reference-audit.md) | [传输 ADR](../docs/adr/0003-orderbook-transport-isolation.md)、[布局](../docs/orderbook-layout.md)、[动效](../docs/orderbook-new-level-animation.md) |
| 布局演进 | [2026-05-21 原始笔记](session-logs/2026-05-21-trade-layout-resize-notes.md) | 旧 react-resizable-panels 方案不作当前架构依据；以[桌面网格](../docs/desktop-grid-layout.md)为准 |
| 下单、资金和账户 | [字段复核](../docs/order-entry-field-review.md)、[双端核对](../docs/order-entry-surface-parity.md)、[账户 ADR](../docs/adr/0001-account-overview-cross-shell-model.md) | [草稿生命周期](../docs/order-draft-lifecycle.md)、[账户概要](../docs/account-overview.md)、[充值](../docs/cctp-deposits.md)、[提现](../docs/withdrawals.md) |
| 被动加载与回归 | [加载审查](../docs/terminal-loading-audit.md)、[测试修复](../docs/terminal-test-regression-repair.md) | [数据展示](../docs/mobile-data-presentation.md)、[运行时翻译](../docs/i18n-presentation.md)；已执行结果仅覆盖记录中的版本和场景 |
| 配对票据 v2 | 原修复计划、实施记录、后续防护计划、后续记录（`docs/mobile-sync-ticket-remediation-plan.md`、`mobile-sync-implementation-verification.md`、`mobile-sync-release-hardening-plan.md`、`mobile-sync-release-hardening-verification.md`）。2026-09-18 更正：服务端票据与 EC2 宿主均已退役，这四份连同 EC2 时期的发布流程 `mobile-sync-production-readiness.md` 已从工作树移除，原文保留在提交 `5d393572` | [无票据传输方案](../docs/mobile-sync-ticketless-transfer-plan.md)、[ADR 0015](../docs/adr/0015-link-device-alignment.md) D7；旧验证不能当作当前候选通过 |
| API 与产品页交付 | [SDK 升级 review](../review-sdk-0333-upgrade.md)、[API Wallet](../docs/api-wallet-redesign-notes.md)、[Leaderboard/Vaults/Staking](../docs/leaderboard-vaults-staking-redesign-notes.md) | [SDK 核对工作流](../docs/hyperliquid-sdk-reference.md)、当前代码与各记录的验证边界 |

## 仍需证据或产品决定

- **原始对话缺口**：旧任务没有随本次输入提供完整对话/工具导出。下方 review 文件和既有会话笔记是实际可用的来源；不据此伪造完整历史。新记录明确区分原始需求和行动摘要。
- **真机矩阵**：[11 行设备记录](../docs/mobile-phone-access-device-validation.md)保持 Not run。普通部署自动验收不依赖它；启用配对的严格 promote 候选需要匹配的真实设备证据。文档修复不代表已部署或通过真机。
- **SSR locale**：[Unreleased](../CHANGELOG.md)保留浏览器持久化语言与 SSR 默认语言之间的差异；完整 SSR 语言一致性仍需服务端可读来源的设计和实现。
- **仓库许可**：根 README 原 MIT 链接无对应 LICENSE 文件。本轮去掉无证据的许可断言；需要维护者确定并提供许可文本，不能由文档审查代为选择。
- **历史技术资料**：[历史资料地图](../docs/README.md)已经分类；早期市场设计、优化建议、功能计划和外部摘录尚未全部逐行对照当前实现。开始对应改动时再复核，不能把本次导航审查说成全库行为审计。
- **真实环境**：本轮自动化使用可控测试或独立浏览器夹具，未复验真实 Privy 登录、签名、交易、长时间 WS 稳定性及生产发布。

## 保留的原始 review 与会话记录

另外从 Git 恢复过 2026-09-11 配对生产核查原文（`docs/mobile-sync-production-readiness-2026-09-11.md`），保留后来改写当前流程时消失的实测与测试章节，修复旧计划的三个断裂锚点。来源提交与适用限制写在归档文件开头；它不属于下方 26 份基线未改动文件。2026-09-18 更正：该归档随票据时期文档一并从工作树移除，原文保留在提交 `5d393572`。

以下清单枚举本轮起始提交中仓库根目录的 review 文档与既有 `notes/session-logs/` 笔记，原路径与正文保持不变。标题直接取自文件；可能含当时的判断，不代表现在仍成立。标题无日期的记录不补造日期；需要准确时点时使用该文件的 Git 历史。`docs/` 中的专题审查另见上表及[文档地图](../docs/README.md)。

| 原始文件 | 原标题 |
| --- | --- |
| [launch-review-2026-07-21.md](../launch-review-2026-07-21.md) | Sairn 交易终端上线审查报告 |
| [launch-review-2026-07-30-round2.md](../launch-review-2026-07-30-round2.md) | Sairn 交易终端上线审查报告(第二轮) |
| [2026-05-21-trade-layout-resize-notes.md](session-logs/2026-05-21-trade-layout-resize-notes.md) | Trade Layout Resize Notes |
| [review-0e89a90a.md](../review-0e89a90a.md) | 对抗审查报告:`0e89a90a` fix(trading): prevent mobile order size overrides |
| [review-3965ddff-0bc72134.md](../review-3965ddff-0bc72134.md) | 对抗审查报告：3965ddff + 0bc72134（供独立核验） |
| [review-5341c3df-market-close.md](../review-5341c3df-market-close.md) | 对抗审查报告:`5341c3df` feat(terminal): align market close confirmation |
| [review-a2e6c5b2.md](../review-a2e6c5b2.md) | 对抗审查报告:`a2e6c5b2` fix(terminal): close launch-critical safety gaps |
| [review-legal-agent-10commits.md](../review-legal-agent-10commits.md) | 对抗审查报告:法律门控 + Agent 授权重构 十提交 |
| [review-sdk-0333-upgrade.md](../review-sdk-0333-upgrade.md) | 审查报告:Hyperliquid SDK 0.33.1 → 0.33.3 升级 |
| [review-wallet-pwa-4commits.md](../review-wallet-pwa-4commits.md) | 对抗审查报告:钱包连接 + PWA 四提交 |
| [review_43ba3f5f.md](../review_43ba3f5f.md) | 对抗式审查报告(第五轮):43ba3f5f `fix(trade): use exchange-reported order availability` |
| [review_476bdf15_c6a8b4ef.md](../review_476bdf15_c6a8b4ef.md) | 对抗审查合并报告:476bdf15 + c6a8b4ef(market selector 双提交) |
| [review_75aa7887_batch.md](../review_75aa7887_batch.md) | 对抗审查报告:responsive workspace 六提交批次 |
| [review_955ad977.md](../review_955ad977.md) | 对抗审查报告:955ad977 feat(portfolio): add account overview and stablecoin swaps |
| [review_aa88ef51.md](../review_aa88ef51.md) | 对抗式审查报告(第三轮):aa88ef51 `fix(sdk): complete hyperliquid 0.33 compatibility` |
| [review_c9c6843a.md](../review_c9c6843a.md) | 闭环审计报告(第八轮):c9c6843a `fix(markets): harden canonical asset identity` |
| [review_codex_latest3.md](../review_codex_latest3.md) | 对抗式审查报告:最近三个 commit(0488cfec / 75c72bef / 2b428265) |
| [review_codex_round2.md](../review_codex_round2.md) | 对抗式审查报告(第二轮):1d22aeed / 5f438814 / dfacac0e |
| [review_df37bd88_7b84592d.md](../review_df37bd88_7b84592d.md) | 对抗式审查报告(第四轮):df37bd88 / 7b84592d |
| [review_e228314a.md](../review_e228314a.md) | 闭环审计报告(第六轮):e228314a `fix(trade): harden availability state handling` |
| [review_ebe9c920_ae775fc6.md](../review_ebe9c920_ae775fc6.md) | 对抗审查报告:ebe9c920 + ae775fc6(portfolio 空数据处理 / TradingView 初始化遮罩) |
| [review_f26f7055.md](../review_f26f7055.md) | 对抗审查报告:f26f7055 fix(trading): prevent mobile market search zoom |
| [review_market_symbol_numbering.md](../review_market_symbol_numbering.md) | 交易对编号体系穷尽审查报告:URL 显示名 ↔ API 记号 ↔ asset id |
| [review_tv_bare_coin.md](../review_tv_bare_coin.md) | 根因分析报告:TradingView 图表对 HIP-3(XYZ)资产显示"出错了" —— 裸 coin 到达 candleSnapshot |
| [tv_stability_review_prompt.md](../tv_stability_review_prompt.md) | tv_stability_review_prompt.md |
| [tv_stability_review_result.md](../tv_stability_review_result.md) | tv_stability_review_result.md |

清单共 26 份既有来源；本次新增任务记录单独列在上表。整理时可增补替代关系，不能删除原始证据来掩盖过去的判断。
