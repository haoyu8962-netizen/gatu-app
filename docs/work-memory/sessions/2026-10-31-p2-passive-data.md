<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-31-p2-passive-data",
  "date": "2026-10-31",
  "title": "第二批 P2 被动数据：TP/SL 弹窗的 Loading 提示与桌面存提款页签的红字报错",
  "kind": "task",
  "status": "recorded",
  "topics": ["market-recovery", "order-entry"],
  "summary": "运营方要求继续修复 P2，修复方案先核对官方开发文档并与官方终端对比。本组为全功能审查的被动数据与全局项，先做两项明确违反现行契约、不需要决策的：B21 持仓 TP/SL 弹窗在标记价未就绪时用警告框显示「Loading...」（守卫本来就不靠它），B17 桌面「存款与提款」页签读取失败时红字「Failed to load deposits and withdrawals.」（手机已静默，规范要求保留主动重试与已确认的上限说明）。依据官方前端包（TP/SL 弹窗无加载文字、确认只按校验禁用；存提款为空数组渲染、无错误文字）与 docs/mobile-data-presentation.md。分支 claude/p2-passive-data，基于本地集成分支 claude/p1-integration 的 329f241d。变异均被测试抓到；未推送。",
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

## 验证与限制

- B21：`position-tpsl-modal.test.tsx` 的「标记价订阅过期」用例加断言不出现「Loading...」；变异（把分支加回）同时被该用例与契约抓到。
- B17：`account-ledger-export-availability.test.tsx` 改为桌面与手机都不出现报错句、没有 `.text-error`，桌面 Retry 仍调用 `retry`；契约新用例扫描源码。`Failed to load deposits and withdrawals.` 已不再使用，`pnpm i18n:extract` 从各语言目录移除，缺失数不变。
- 两个文件共 108 项（TP/SL 与契约）、18 项（存提款与契约）通过；typecheck 与 Biome 在提交前复核。

## 后续与替代关系

- E9（三张历史页的 `role=alert` 横条与「空缓存 + 刷新失败」仍得出没有记录）、E13（组合页回到标签页时误判过期）、E12（质押拒绝原文丢失）、F1（四种语言 31 条缺译）、F2（RTL 带符号数值）、M3（⌘K 打开英文旧列表）、F3（设置弹窗初始焦点与手机布局项）按顺序处理；E5、E15、F4 待运营方决定。
