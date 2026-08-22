# 闭环审计报告(第六轮):e228314a `fix(trade): harden availability state handling`

> 方法:5 维闭环审计 finder(逐条核对 review_43ba3f5f.md 的 5 个行动项)+ 每条发现 2 名独立反驳者多数决。41 agent(1 个 verify 因连接中断失败,不影响结论)。验证手段:源码逐行核对、变异实验、tsc/vitest。**这是 codex 对上一轮 43ba3f5f 审查的闭环响应**。

## 评分

| Commit | 评分 | 一句话结论 |
|---|---|---|
| `e228314a` fix(trade): harden availability state handling | **8.5 / 10** | 高质量闭环响应:4/5 行动项 fixed(P2-C/P3-D/P3-E 完全修复、P2-B 核心逻辑修复),门控逻辑下沉纯函数并补齐判别力单测。P2-A(isStale)选择了"保留显示但仍禁止下单"—— 资金安全上可辩护且无回归,但与 balances-tab 软提示自相矛盾、连平仓也一并阻断,建议再放开。新引入问题全为 P3,无 P0/P1、无资金安全/额度算错。 |

## 闭环审计表(上一轮 5 个行动项)

| 行动项 | 状态 | 说明 |
|---|---|---|
| **P2-C** getAssetAvailabilityStatus 遗漏 error/idle 分支测试 | ✅ **FIXED** | 补齐 "surfaces subscription errors"(error 分支)、`it.each` 4 个 idle 守卫(disconnected/non-perp/missing coin/missing user)、"keeps coin identity matching case-sensitive"(XYZ:MU→loading,钉住 coin 走 `===`、user 走 `toLowerCase` 的契约) |
| **P3-D** spot error 屏蔽为永久 "Loading balances..." | ✅ **FIXED**(双保险) | `getStreamAvailabilityStatus` 先判 error 把它从 loading 分出 → `spotStateStatus="error"`、`isSpotStateLoading=false`、`hasError` 纳入;`balances-tab` renderPlaceholder 调换为先 hasError 后 isLoading。spot 终态错误现可达 "Failed to load balances." |
| **P3-E** 冷启动闪现 "Available $0.00" + Deposit | ✅ **FIXED** | `getOrderAvailabilityStatus` 对 `marketKind` 未解析(已连接)返回 "loading" → `isAvailabilityLoading=true`(formatAvailableBalance 返回占位符,不再 $0.00)且 `isAvailabilityBlocked=true`(Deposit 隐藏);测试 "treats an unresolved market as loading" 钉住 |
| **P2-B** 核心门控机制零测试覆盖 | 🟢 **FIXED(核心)/ partial(接线)** | 门控决策抽成纯函数 `getStreamAvailabilityStatus`/`getOrderAvailabilityStatus`/`getOrderAvailabilityFlags`,order-entry.test.ts 新增两个 describe 全分支覆盖(变异实验证实有判别力)。残留:`useOrderEntryData` 的接线映射与组件 `isFormDisabled` 仍无 hook/组件级直测 —— 但决策核心已覆盖,达成建议意图 |
| **P2-A** isStale 耦合(保留 last-known-value + **继续可下单**) | 🟡 **PARTIAL** | 显示侧 ✅:stale 时 `currentActiveAssetData` 保留旧值,Available 显示真实数值+spinner。可下单侧 ❌:`isBlocked` 含 stale → 表单仍禁用、handleSubmit 硬拦截。"继续显示"做到、"继续可下单"未做(详见下节) |

其中上一轮建议的"给 spotState 配专门 staleness 阈值"= **MISSED**(reliability.ts 未改,spotState 仍走 30s 默认;activeAssetData 是 20s)。

## 核心讨论:P2-A 的 stale 硬禁下单(P2,反驳者意见分裂)

**机制**(逐行核实):`availability.ts:92` `isBlocked = isConnected && status !== "success"` 把 "stale" 计入 blocked → `use-order-entry-data` 产出 `isAvailabilityBlocked=true` → `isFormDisabled`(trade-form-fields/mobile-trade-view)+ `handleSubmit` 硬拦截(trade-panel:295 / mobile:265 `if (isAvailabilityBlocked) return`)。即 **stale 时显示旧值+spinner,但表单禁用、无法提交**。

**两方论据**:
- 支持保守(codex 的选择):陈旧的 availableToTrade/maxTradeSzs 可能已不反映真实可开量,交易所服务端还有二次校验(最多拒单不会资金损失);staleness 触发即 reconnect,窗口小;**相对 43ba3f5f 无回归**(旧代码经 loading 路径同样禁用)。
- 应放开(上一轮建议):stale **常因盘面稳定(mark px 不变)触发而非真失联**,此时旧值仍准确;清淡/盘后 builderPerp/HIP-3 市场推送稀疏,20s/30s 阈值易误触发;last-known-value 通常足够。

**两个值得 codex 重新权衡的具体不一致**:
1. **与 balances-tab 自相矛盾**:同一 stale,余额面板选择"显示旧值(告知可能陈旧)",下单面板却选择"完全禁用"—— 两处对 stale 的态度相反。
2. **连平仓(reduce-only)也被阻断**:`if (isAvailabilityBlocked) return` 在任何 reduce-only 判断之前,即 **stale 期间用户无法平仓**。陈旧数据下阻止风险管理操作(平仓)比阻止开仓更有争议 —— 平仓减少敞口,不存在"超额开仓"风险。

**建议**(按优先级):
- 首选:`isBlocked = isConnected && status !== "success" && status !== "stale"`,让 stale 沿用 last-known-value 继续可下单,仅 `isStale` 驱动 spinner/Tooltip 软提示(loading/error/idle 维持拦截)—— 这才是 P2-A 原意,且消除与 balances-tab 的矛盾;
- 退一步:至少对 reduce-only/平仓单在 stale 时放行;
- 若维持阻断:在提交说明中明确记为"刻意的保守取舍",并给 spotState 配一个贴合真实推送节奏的专门 staleness 阈值缩短空窗。

## 本次 harden 新引入的问题(全 P3,打磨项)

- **NB-2 / 按钮态矛盾信号**:stale 时 `isBalanceLoading = isAvailabilityLoading || isAvailabilityStale` → 提交按钮显示 "Loading..." 且禁用,但 Available 行显示**具体旧数值**(非占位符)。"数据显示出来了但按钮说加载中"给用户矛盾信号,且 "Loading..." 语义不准(数据是陈旧-已存在,非加载中)。建议 stale 用区别于 loading 的按钮文案。与 P2-A 取舍绑定处理。
- **F4 / 按钮分支顺序 desktop≠mobile**:新增的 `hasBalanceError` 分支继承了两端各自历史结构 —— desktop 与 mobile 对 `needsApproval` 与 balance loading/error 分支的相对顺序不同,导致 mobile 可能因一次短暂的 availability 错误挡住 "Enable Trading" 流程。建议统一两端顺序(needsApproval 置于 balance 分支之前,与 desktop 对齐)。
- **F3 / P3-ACCOUNT-VIEW / mobile-account-view 缺 stale-error 指示**:`isLoading` 收窄后不再含 spot-stale(消除骨架闪烁,属预期改进),但 `mobile-account-view` 只消费 `isLoading`、不消费 `isSpotStateStale`/`hasError` → spot 陈旧/终态错误时静默显示旧值、无任何指示(与 balances-tab 的 spinner 不一致)。建议在 mobile-account-view(必要时含 account-panel)一并消费 hasError/isSpotStateStale 补齐对称性。
- **F4(test-and-standards)/ 近似死字段**:`isSpotStateLoading` 语义变更(现只等于 loading 态)后,外部消费者已基本不用它(下游改用 spotStateStatus/isSpotStateStale)。可评估是否精简。

## 被驳回项(记录以防复提)
- **perp 的 activeAssetData 订阅错误也文案 "Failed to load balances." 对 perp 略误导**(两维度提出):驳回为吹毛求疵 —— 该文案对 perp 语境虽不完美但可接受,统一错误提示优于分裂文案。
- **杠杆徽章 stale 时无提示**:驳回 —— 杠杆值切换到 last-known-value 已足够,不需额外 stale 徽章。

## 做得好的(保持)
- **门控决策逻辑下沉为纯函数**(getStreamAvailabilityStatus/getOrderAvailabilityStatus/getOrderAvailabilityFlags)是正确的重构方向,把散落在组件的布尔逻辑集中、可测、有判别力单测覆盖(变异实验红)—— 直接回应了 P2-B。
- **P3-D 双保险修复**(调换判定顺序 + error 从 loading 分出)彻底、不留死角。
- **use-asset-leverage 改读 currentActiveAssetData**(仅 success/stale 有值)实际是**改善**:切换市场时新市场 activeAssetData 未到 → onChainLeverage 回落 stored,避免了旧代码可能短暂串用旧市场杠杆的隐患(new-bugs 维度确认无 leverage 闪烁回归)。
- **P2-A 虽只完成一半,但方向诚实**:保留了 last-known-value 用于显示(而非清零),这是相对 43ba3f5f 的实质进步;剩下的"继续可下单"是一个明确的、可辩护的产品取舍点,而非疏漏。
- 无 P0/P1、无资金安全或额度算错问题;新增 UI(spinner/warning icon + Tooltip)i18n 与 design token 合规。
