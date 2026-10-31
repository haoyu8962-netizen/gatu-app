<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-31-p2-passive-data",
  "date": "2026-10-31",
  "title": "第二批 P2 被动数据：TP/SL 加载提示、桌面存提款页签、三张历史页的告警与手机设置弹窗",
  "kind": "task",
  "status": "recorded",
  "topics": ["market-recovery", "order-entry"],
  "summary": "运营方要求继续修复 P2，修复方案先核对官方开发文档并与官方终端对比。本组为全功能审查的被动数据与全局项，先做两项明确违反现行契约、不需要决策的：B21 持仓 TP/SL 弹窗在标记价未就绪时用警告框显示「Loading...」（守卫本来就不靠它），B17 桌面「存款与提款」页签读取失败时红字「Failed to load deposits and withdrawals.」（手机已静默，规范要求保留主动重试与已确认的上限说明）。依据官方前端包（TP/SL 弹窗无加载文字、确认只按校验禁用；存提款为空数组渲染、无错误文字）与 docs/mobile-data-presentation.md。分支 claude/p2-passive-data，基于本地集成分支 claude/p1-integration 的 329f241d。E9：交易、委托、资金费三张历史页删掉 role=alert 告警横条与大号警告图标，首次失败与离线改为共享的中性占位（HistoryPageUnavailable：读屏描述 + 中性 Retry，离线时只留忙碌占位），空缓存加刷新失败不再得出没有记录；上限说明改用 stroke-warning-weak 与 warning-soft。F3：手机上设置弹窗打开时焦点放在弹层本身（不聚焦滑点输入、不弹键盘），并隐藏「Desktop layout · Reset」。变异均被测试抓到；未推送。",
  "thread": null,
  "baseCommit": "329f241d",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx"},
    {"path": "apps/terminal/src/components/trade/positions/account-transfers-tab.tsx"},
    {"path": "docs/mobile-data-presentation.md"},
    {"url": "https://app.hyperliquid.xyz/trade"}
  ],
  "supersedes": []
}
-->
# 第二批 P2 被动数据：TP/SL 加载提示与存提款页签

## 背景与范围

同步记录，未取得任务标识。运营方 2026-10-31：「继续修复P2 问题 修复方案确保核对官方开发文档 以及调试交易终端 对比过」。全功能审查（`2026-10-30-full-feature-audit`，在 `claude/p1-order-safety` 分支上）的被动数据与全局项里，先做违反现行契约、不需要决策的 B21、B17；E5（质押、推荐、金库页，需先扩 `docs/mobile-data-presentation.md` 的范围）、E15（无名 Agent 的数据源，需补 ADR 0038）、F4（布局，需新 ADR）留待决定。

- 分支 `claude/p2-passive-data`，基于本地集成分支 `claude/p1-integration` 的 `329f241d`。
- 官方依据：2026-10-31 下载的官方生产前端包（`/tmp/claude-501/hl-official-1031/assets/config-BhZylSmU.js`）。没有连接钱包或操作官方页面。

## 结论与依据

| 编号 | 官方做法（证据） | 本终端修改前 | 修改 |
| --- | --- | --- | --- |
| B21 | 持仓 TP/SL 弹窗（键 `tp.sl.for.position`）直接列出市场、仓位、开仓价、标记价、强平价，标记价直接格式化，没有加载文字，确认按钮只按校验禁用 | 标记价未就绪时 `guardMessage = t\`Loading...\``，用 `bg-warning-soft` 警告框显示；`canSubmit` 已通过 `tpValid`/`slMarkValid` 在标记价未就绪时为 false，提示不是守卫 | 删掉这个分支，守卫不变；`mobile-data-presentation-contract` 的共享弹窗清单加入该标记 |
| B17 | 存提款列表无数据时为空数组，空态文案 `no.deposits.no.withdrawals`，没有错误文字；完整历史另有独立页，失败静默 | 读取失败或不可用时 `<Placeholder variant="error">` 红字「Failed to load deposits and withdrawals.」（手机已用 `DataPendingState` 静默；`account-ledger-export-availability.test.tsx` 反而断言桌面要显示） | 中性占位：只留中性 Retry，超出安全显示上限时只留上限说明（普通灰色文字）；不下空态结论；契约新增一条扫描该文件不得出现这句与 `variant="error"`。规范（`docs/mobile-data-presentation.md`「受约束的入口」：充值提现历史保留主动重试和已确认显示上限说明）不变 |

### E9 三张历史页

| 方面 | 官方做法（证据） | 本终端修改前 | 修改 |
| --- | --- | --- | --- |
| 刷新失败与离线 | 官方独立历史页（`TradeHistory-jzCdXQLs.js`、`HistoricalOrders-DdXnc3h2.js`、`FundingHistory-DHHERYON.js`）只用 `data ?? []` 渲染，没有错误、离线或刷新失败提示 | 有数据时插入 `role="alert"` 横条（`bg-warning/10`、`border-warning/30`，透明度修饰违反样式规则）「Refresh failed / You are offline. Previously loaded … remains visible.」；首次失败与离线为大号警告图标加标题 | 删除横条；首次失败、离线以及「空缓存 + 刷新失败或离线」统一用新组件 `components/ui/history-page-unavailable.tsx`：只有读屏描述（沿用原文案），失败时一个中性 Retry，离线时 `aria-busy` 空白；地址无效的输入校验块保留 |
| 空结论 | — | 缓存为空且刷新失败或离线时仍显示「No … found」（资金费页连横条都没有） | 不再得出没有记录，改为上一行的中性占位 |
| 上限说明 | — | `border-warning/30 bg-warning/10` | `border-stroke-warning-weak bg-warning-soft`（内容不变） |

规范早已写明（`docs/mobile-data-presentation.md`「数据与操作边界」与「受约束的入口」：静态历史刷新失败不新增横条、失效空快照不得得出没有记录），本次是让代码符合规范；`mobile-data-presentation-contract` 新增一条扫描三张页面的横条、透明度修饰与组件使用。

### F3 手机设置弹窗

| 方面 | 官方做法（证据） | 本终端修改前 | 修改 |
| --- | --- | --- | --- |
| 初始焦点 | 官方设置是页头齿轮下拉，只有开关和链接，没有文字输入 | 设置弹窗由 store 打开、不经过 `Dialog.Trigger`，Base UI 的「触摸打开时聚焦弹层本身」不生效，落到第一个可聚焦元素即滑点 `NumberInput`，手机上会弹数字键盘 | 手机上给 `ModalPopup` 传 `initialFocus` 指向弹层本身（`popupRef`），桌面保持原行为 |
| 布局项 | 布局行 `actionRow:i?void 0:oe`，`i` 为 `isMobileOrTablet`（≤1000px），手机和平板不显示 | 「Desktop layout · Reset」不分端都显示（同组件的订单簿单位开关已按 `isMobile` 门控） | 包 `!isMobile` |

## 验证与限制

- B21：`position-tpsl-modal.test.tsx` 的「标记价订阅过期」用例加断言不出现「Loading...」；变异（把分支加回）同时被该用例与契约抓到。
- B17：`account-ledger-export-availability.test.tsx` 改为桌面与手机都不出现报错句、没有 `.text-error`，桌面 Retry 仍调用 `retry`；契约新用例扫描源码。`Failed to load deposits and withdrawals.` 已不再使用，`pnpm i18n:extract` 从各语言目录移除，缺失数不变。
- 两个文件共 108 项（TP/SL 与契约）、18 项（存提款与契约）通过；typecheck 与 Biome 在提交前复核。

### E9

- 原测试把横条当需求（`trade-history-page.test.tsx`、`historical-orders-page.test.tsx` 还断言「刷新失败 + 空缓存」时显示「No … found」），已改为：刷新失败保留行、没有 `[role=alert]` 与「Refresh failed」；空缓存加失败不出现空结论、有 Retry 且可调用刷新；离线时不出现 Retry。`funding-history-page.test.tsx` 补同样用例；三页的错误态断言改为读屏描述。
- 变异 4 个（`m-e9.json`：三页各把「空缓存 + 失败」分支去掉、Retry 一律隐藏）均被抓到；三页 36 项、契约 15 项通过；`pnpm i18n:extract` 移除不再使用的横条、标题与离线说明文案，缺失数不变。

### F3

- `global-settings-modal.test.tsx` 的 `ModalPopup` 替身改为记录属性，新增用例：手机上 `initialFocus` 就是弹层的 ref、没有「Desktop layout」；桌面 `initialFocus` 未设置、仍有布局项。该文件 30 项通过。真实焦点与键盘行为没有在浏览器或真机上验证（替身不渲染 Base UI 的焦点管理）。

## 后续与替代关系

- E13（组合页回到标签页时误判过期）、E12（质押拒绝原文丢失）、F1（四种语言 31 条缺译）、F2（RTL 带符号数值）、M3（⌘K 打开英文旧列表）按顺序处理；E5、E15、F4 待运营方决定。
