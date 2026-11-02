<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-31-p2-passive-data",
  "date": "2026-10-31",
  "title": "第二批 P2 被动数据：TP/SL 加载提示、桌面存提款页签、三张历史页的告警与手机设置弹窗",
  "kind": "task",
  "status": "recorded",
  "topics": ["market-recovery", "order-entry"],
  "summary": "TP/SL 与历史表读取中的错误或未确认空状态保持静默，手机打开设置时避免弹起键盘。#131/#132 接续组合、质押、推荐与金库的展示，相关修复进入 p36。",
  "thread": null,
  "baseCommit": "329f241d",
  "commits": ["9e932c0c", "7833ae79", "5c51e514", "0fa4b79c", "9cf10b51"],
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

- B21：`position-tpsl-modal.test.tsx` 的「标记价订阅过期」用例加断言不出现「Loading...」；变异（把分支加回）同时被该用例与契约抓到。B21 提交时漏改了 `action-progress-label-contract.test.ts` 里对这句「Loading...」的登记（该契约要求登记表与源码一致），合并预览分支的全量运行发现后单独提交删除这条登记。
- B17：`account-ledger-export-availability.test.tsx` 改为桌面与手机都不出现报错句、没有 `.text-error`，桌面 Retry 仍调用 `retry`；契约新用例扫描源码。`Failed to load deposits and withdrawals.` 已不再使用，`pnpm i18n:extract` 从各语言目录移除，缺失数不变。
- 两个文件共 108 项（TP/SL 与契约）、18 项（存提款与契约）通过；typecheck 与 Biome 在提交前复核。

### E9

- 原测试把横条当需求（`trade-history-page.test.tsx`、`historical-orders-page.test.tsx` 还断言「刷新失败 + 空缓存」时显示「No … found」），已改为：刷新失败保留行、没有 `[role=alert]` 与「Refresh failed」；空缓存加失败不出现空结论、有 Retry 且可调用刷新；离线时不出现 Retry。`funding-history-page.test.tsx` 补同样用例；三页的错误态断言改为读屏描述。
- 变异 4 个（`m-e9.json`：三页各把「空缓存 + 失败」分支去掉、Retry 一律隐藏）均被抓到；三页 36 项、契约 15 项通过；`pnpm i18n:extract` 移除不再使用的横条、标题与离线说明文案，缺失数不变。

### F3

- `global-settings-modal.test.tsx` 的 `ModalPopup` 替身改为记录属性，新增用例：手机上 `initialFocus` 就是弹层的 ref、没有「Desktop layout」；桌面 `initialFocus` 未设置、仍有布局项。该文件 30 项通过。真实焦点与键盘行为没有在浏览器或真机上验证（替身不渲染 Base UI 的焦点管理）。

## Codex 推送前审查与修复

- 范围 `329f241d..7833ae79`（B21、B17、E9；F3 之后提交，未在这轮范围内），`gpt-6-astra` 只读 low：7.5/10，2 项 P2、1 项 P3、1 项既有 P2，均成立，已修：
  - **P2 空缓存在刷新进行中仍会给出「没有记录」。** 例如恢复联网后、带过期空缓存重进页面时，`status` 已是 `ready`、`isRefreshing` 为真。三张页面的「空缓存」分支加上 `history.isRefreshing`，刷新中显示忙碌占位、读屏描述用各页已有的加载文案（`getUnconfirmedEmptyDescription`）。
  - **P2 Retry 在刷新中仍可点击，会取消并重启请求。** 三个历史 hook 的 `refresh` 改为 `query.refetch({ cancelRefetch: false })`；`HistoryPageUnavailable` 新增 `refreshing`，刷新或离线时不给 Retry。
  - **P3 离线说明放在 `aria-busy` 容器里可能不播报。** 读屏 `output` 移到忙碌区域之外，`aria-busy` 只标在占位区域上。
  - **P2（既有）存提款：空 REST 快照刷新失败时 hook 仍报 `ready` 且不暴露错误，页签给出「No deposits or withdrawals found.」。** `useAccountLedger` 新增 `canConfirmEmpty`（最近一次 REST 成功且没有刷新进行或失败）与 `isRefreshing`；桌面页签只在能确认时下空结论，刷新中为忙碌占位，否则给中性 Retry；手机页签不能确认时为 `DataPendingState`。
- 新增与改写的用例：三张页面各一条「刷新中的空缓存保持忙碌、无 Retry、读屏节点不在忙碌区内；刷新失败后 Retry 调用 refresh」；`account-ledger-export-availability.test.tsx` 桌面与手机「未确认的空快照不下结论」；`use-account-ledger.test.tsx`「成功的空快照可确认，刷新失败后不可确认」；契约扫描共享占位组件（不得有图标、`text-error`/`text-warning`、`role="alert"`，必须有 `sr-only` 描述）。
- 变异 6 个（`m-e9b.json`：刷新中的空缓存下结论、刷新中给 Retry、读屏节点放回忙碌区、hook 忽略刷新失败、桌面与手机页签无条件下空结论）均被抓到；三张页面 39 项、存提款 6 项、hook 15 项、契约 15 项通过；typecheck 与 Biome 通过。`refetch({ cancelRefetch: false })` 本身没有用例覆盖（页面测试替换了 hook）。
- 合并预览分支（`claude/p2-preview`）的全量运行还发现 B21 漏改的进度文案契约登记，已单独提交 `6bc60969`。

## 五个 P2 分支的合并预览验证

- 本地预览分支 `claude/p2-preview`（只用于验证，不推送）把 `claude/p2-order-validation`、`claude/p2-tables`、`claude/p2-funds`、`claude/p2-market`、`claude/p2-passive-data` 依次 `--no-ff` 合并，最终为 `8fd11013`。冲突只有 CHANGELOG（取并集）、`docs/work-memory/INDEX.md`（重新生成）、`balances.test.ts` 末尾两个 describe 块（两边都保留）与 `historical-orders-page.tsx` 的导入行（两条都保留）。
- 第一次全量（合并到被动数据分支 `7833ae79` 时）：695 个文件通过、3 个失败——`action-progress-label-contract` 为 B21 漏改的登记（已修 `6bc60969`），`mobile-agent-sync-modal` 为与 Codex 审查并行时的负载超时（单独 27 项通过），`vite-development-cache` 为沙箱禁止监听端口。
- 第二次全量（`8fd11013`，`pnpm --filter @sairn/terminal test -- --maxWorkers=4`，没有与其他重负载并行）：697 个文件、9535 项通过，唯一失败 `vite-development-cache` 在沙箱外单独重跑通过。`pnpm typecheck`（hl-react、ui、terminal）、`pnpm memory:check`、`scripts/ci-workflows.test.mjs` 通过；各分支相对 `329f241d` 的 `git diff --check` 无问题。
- 未做：合并结果上的浏览器套件；真实账户与真机验收。

## 后续与替代关系

- E13（组合页回到标签页时误判过期）、E12（质押拒绝原文丢失）、F1（四种语言 31 条缺译）、F2（RTL 带符号数值）、M3（⌘K 打开英文旧列表）按顺序处理；E5、E15、F4 待运营方决定。
