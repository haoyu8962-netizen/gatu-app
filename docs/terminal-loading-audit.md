# 交易终端加载体验审查

## 范围与证据

本次审查覆盖刷新到首份行情、最近成交、桌面账户概要与账户标签页，以及首份快照缺失、过期、订阅恢复、失败和确认空列表。通过组件行为测试控制数据状态，通过浏览器检查真实终端与账户布局。未连接真实钱包、签名或提交交易；已登录账户的失败场景使用测试快照，不能当作真实账户故障复现。

Hyperliquid HYPE 刷新的浏览器对照见 [订单簿实测记录](orderbook-ui-reference-audit.md)：正常网络下先出现标签、随后出现报价，中间未观察到等待文字。这里只借鉴可见行为，不推断其内部缓存或网络实现。

## 确认的问题与修复

| 入口 | 原行为与影响 | 修复 |
| --- | --- | --- |
| 最近成交 | 桌面订阅失败显示错误文字；展示分支未检查过期和市场身份，过期空快照可能被当成没有成交 | 默认静默；只显示 active、非过期、属于当前市场的快照，其他状态保留表头与空容器 |
| 当前委托 | 只以 idle/subscribing 判断加载，active 但无首份数据时会落入“没有订单”；过期时撤单控件仍可能让用户先点击再报错 | 首份快照、active、新鲜度共同决定展示；无有效快照不作空结论，批量撤单显式禁用，执行前原有复核仍保留 |
| TWAP 当前订单 | 过期空快照可能显示“没有 TWAP”和创建引导；共享状态函数把有缓存的非 active 订阅也判为 ready | 共享状态函数要求 active；桌面在未就绪时保持空容器，不显示创建引导或终止操作。移动端复用修正后的状态判断 |
| 持仓 | 加载和读取失败占据整块文字区域；空旧快照未在展示前检查过期 | 静默占位；错误/过期优先于加载，只有当前成功快照可显示空持仓 |
| 持仓标记价 | 每行标记价未就绪时显示黄色转圈或警告图标 | 使用数值占位，保留原有价格新鲜度校验与风险降低操作入口 |
| 余额 | 加载、失败、过期有可见提示，首份余额或账户模式未就绪时可能提前显示空余额与充值引导 | 加入完整账户数据与新鲜度判断，未知账户模式保持等待；只有成功的当前空快照才显示充值入口 |
| 账户概要 | 后台失败、过期和估值不可用插入警告条，增加视觉干扰与内容高度 | 删除被动警告条，沿用原有数值占位、骨架及独立的资金操作禁用判断 |
| 成交/委托/资金费用历史 | 首次等待有大段文字；恢复时在已加载记录上方插入暂停更新提示 | 首次等待与失败安静展示；保留可用的历史记录，不增加被动横条；过期空记录不被当作确认无历史 |
| TWAP 历史/分片成交 | 首次等待/失败有可见文案及原始错误；实时流失败插入黄色警告 | 静默首帧与失败，历史记录保留；实时恢复仅保留中性“重试”，分页及交易本身的状态/失败原因继续显示 |
| 充值提现历史 | 首次请求显示加载文案 | 首次等待改为空容器；保留明确重试交互与已确认的历史显示上限说明 |

共同占位组件为 `positions/passive-data-placeholder.tsx`。展示规则见 [数据呈现规范](mobile-data-presentation.md)。本次没有修改订阅数量、行情精度、签名、资金计算、网格尺寸持久化或订单提交逻辑。

## 区分被动加载与主动操作

- 应用启动壳、市场工作区、移动端工作区和图表加载已使用骨架或屏幕阅读器说明，本次未发现与可见“等待订单簿”相同的文案问题。
- 撤单、改单、终止 TWAP、导出等主动操作的提交结果与未确认结果继续显示；不得用静默读取规则隐藏它们。
- 主动打开弹窗时的代码加载反馈、市场选择器查询/分类重试、资产资料查询与重试，不作为刷新交易终端的错误证据。本次保留这些明确请求的交互；未将所有包含 Loading 的字符串机械删除。
- 全局真实离线状态、已确认的地区/账户模式限制、历史交易本身的失败原因与历史显示上限也继续保留。

## 验证重点

组件回归验证最近成交的缺失/过期/错市场快照、当前委托首帧与禁用撤单、TWAP 缓存恢复、持仓和余额确认空数据，以及账户概要占位与资金按钮保护。历史回归验证已有记录在后台失败后继续显示、静默恢复和导出/分页/重试仍可使用。浏览器检查桌面账户布局、真实 ARB 页刷新与移动布局；不会以未登录浏览器结果代替已登录状态测试。

本次验证结果：19 个 Vitest 文件共 230 项通过，账户布局与资金入口的 24 项 Playwright 测试通过；修改源码的 Biome、terminal typecheck 和 Lingui 提取通过。真实 ARB 刷新采样中，订单簿从等待到报价约 356ms，两阶段都没有可见等待/失败文案；该间隔不代表整页加载时间，也不是生产性能基准。

复验入口：

```bash
pnpm exec biome check <本次修改的 TypeScript/TSX 文件>
pnpm --filter @gatu/terminal typecheck
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/trades-panel.test.tsx \
  src/lib/tests/account-panel.test.tsx \
  src/lib/tests/desktop-positions-readiness.test.tsx \
  src/lib/tests/desktop-orders-cancel-all.test.tsx \
  src/lib/tests/desktop-twap-tab.test.tsx \
  src/lib/tests/desktop-history-exports.test.tsx \
  src/lib/tests/deposit-empty-balances-entry.test.tsx \
  src/lib/tests/twap.test.ts \
  src/lib/tests/mobile-twap-card.test.tsx \
  src/lib/tests/history-table-scroll-accessibility.test.ts \
  src/lib/tests/desktop-history-scroll-contract.test.ts \
  src/lib/tests/mobile-data-presentation-contract.test.ts \
  src/lib/tests/positions-table-visual-contract.test.ts \
  src/lib/tests/position-market-close-entry.test.tsx \
  src/lib/tests/desktop-orders-history-direction.test.tsx \
  src/lib/tests/orderbook-panel-safety.test.tsx \
  src/lib/tests/account-panel-catalogs.test.ts \
  src/lib/tests/orderbook-catalogs.test.ts \
  src/lib/tests/mobile-history-cards.test.tsx
pnpm --dir apps/terminal exec playwright test --config tests/browser/account-actions.playwright.config.ts
```
