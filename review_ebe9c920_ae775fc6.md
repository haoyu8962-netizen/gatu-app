# 对抗审查报告:ebe9c920 + ae775fc6(portfolio 空数据处理 / TradingView 初始化遮罩)

- 审查对象:
  - `ebe9c920 fix(portfolio): handle unavailable history data`(portfolio-overview/performance-chart/domain/portfolio.ts + portfolio-overview.test.tsx 162 行 + .po)
  - `ae775fc6 fix(trading): smooth tradingview initialization`(tradingview-chart/chart-panel/main-workspace + tradingview-chart.test.tsx +30)
- 审查方法:主审全 diff 精读 + 实证 agent(9 组变异实验、四疑点逐项实证、隔离 worktree 工具链)
- 工具链基线:vitest 全量 551 passed + 1 skip(较 955ad977 基线 +3,用例对账吻合);tsc 仅既有 viem 双实例错误,零新增;biome 9 文件零诊断;commit 格式合规
- 评分:两提交均 9/10 —— 声明逐条实证成立、实现干净,各余一个测试保护缺口

---

## 一、ebe9c920:声明四条全部实证 ✅

### 1. 不可用显示 "—"
PNL / Volume / Max Drawdown / 14 Day Volume / Fees 五处在查询失败或空数据时均显示 "—"。变异「getLatestHistoryValue 空历史改回返回 "0"」被**双杀**(portfolio-overview.test 的 `'$0.00' ≠ '—'` + portfolio.test 的 `'0' ≠ null`)。

### 2. 真实零保留 —— 实现比声明更精细,四指标口径全部自洽

| 指标 | 真实零输入 | 显示 | 不可用输入 | 显示 |
|---|---|---|---|---|
| PNL | pnlHistory 末值 "0.0" | **$0.00**(exceptZero 对零不加号) | history 空/查询失败 → null | — |
| Volume | snapshot.vlm="0.0" | **$0.00** | snapshot null | — |
| Max Drawdown | 历史全平 | **0.00%**(big.js 无 -0,核实无负号) | history 空 → null | — |
| 14D Volume | `dailyUserVlm = []`(真实 14 天零成交) | **$0** | `dailyUserVlm == null` | — |

`calculateFourteenDayVolume` 对 `null`(不可用)与 `[]`(真实零)的区分是本提交的语义核心,已被单元测试钉住(变异「[] 改返回 null」被杀)。

### 3. 加载/错误/重试状态
- `isPortfolioLoading` 纳入 `isFetching` → **点 Retry 有 loading 反馈**(与 f0577fee 轮同类问题的正确修法一致),且 `!snapshot` 前置保证有旧数据时后台刷新不闪 loading;
- onRetry 接线有测试(变异改空函数被杀);
- Fees 卡从 `?? 0`(把未知伪造成 0.0000% 费率)改为 `== null → "—"` —— 修复正确。

### 4. 测试与本地化
portfolio-overview.test.tsx 新 2 用例 + portfolio.test.ts 加 4 断言;.po 六语言各 +3 行**全部是 `#:` 引用注释**(复用既有 Loading.../Retry/Something went wrong msgid),零新翻译负担。

### 残留(均低,建议合入后小补)

1. **Fees 卡伪造修复零测试保护**(本批最大判别缺口):变异「改回 `?? 0`」存活 —— mock 恒返回完整费率且两用例都不断言 Fees 卡。补一条「费率缺失 → 显示 —」断言即可。
2. **fees 查询无手动重试入口**:图表 Retry 只 `portfolioQuery.refetch()`。实证:两查询共用 `refetchInterval: 60_000`(error 态照常触发)+ RQ v5 默认聚焦/重连自动重拉 → 前台最长 60s 自愈,属 UX 不一致非缺陷。建议 onRetry 顺带 `feesQuery.refetch()`。
3. `perpsSnapshot === null` 判据:SDK PortfolioResponse 为固定 8 元组类型,「combined 有 / perps 缺」场景实际不可达 —— 纯防御冗余,无害,可留。
4. `isFetching` 分支无测试(变异删除后 mock 无判别)—— 真实后果仅 60s 重拉期间显示错误面板而非 Loading,轻微。
5. 备注:显式 null → "—"(em-dash)与 formatUSD 内部 invalid → "-"(hyphen)是两种占位符风格并存(既有,非本提交引入),显式 null 检查因此并非冗余。

---

## 二、ae775fc6:声明四条全部实证 ✅

### 1. 稳定背景遮罩
`data-chart-initializing` 遮罩(z-10, `bg-background`, pointer-events-none, aria-busy)。**同色链实证**:styles.css 中 terminal 主题 light 下 background=surface=#ffffff、dark 下均 #0f1a1f —— 遮罩与父面板(bg-surface)、Suspense fallback(同步改 bg-background 并去掉 `animate-pulse`)、未挂载骨架(bg-grid-container)形成从 lazy 加载到 widget ready 的**无缝背景链**,这正是"解决页面切换闪烁"的机制。

### 2. 就绪平滑淡出
150ms opacity 过渡 + `motion-reduce:transition-none`;onChartReady → 清遮罩**有测试钉住**(变异删除被杀:`expected ... to contain 'opacity-0'`)。

### 3. 重试恢复遮罩
Retry onClick → `setIsInitializing(true)` 逻辑正确,但**该分支零测试**(变异删除后 20 用例全绿 —— 无一点击 Retry 按钮)。

### 4. 初始化状态测试
+1 用例("keeps a stable background mask until TradingView is ready")。

### 关键疑点排除(请勿据此"加固")

- **widget 重建路径逐 dep 排查**:创建 effect deps 精确为 `[retryNonce]`。theme → changeTheme 不重建(有测试);symbol/interval/active → setSymbol 路径不重建(多测试);yAxisInside → 纯 CSS 变量;测试网/路由/mobile 切换 → 组件 remount → useState(true) 重新初始化遮罩。**不存在"重建期无遮罩"的裸露闪烁场景**。
- 变异「失败路径不清遮罩」存活,但推演视觉无后果:error 面板 z-20 bg-surface 完整覆盖 z-10 遮罩;真实残害仅 aria-busy 卡 true(a11y 级)。

### 残留

1. 补一个「点击 Retry → 遮罩恢复 opacity-100」用例(变异 h 缺口)。
2. (a11y 级)失败路径若不清 isInitializing,aria-busy 停留 true —— 当前代码是清的,建议同用例顺带断言。

---

## 三、给 codex 的三步小补

1. Fees 卡「费率缺失 → —」断言(ebe9c920 缺口 e)
2. TV 测试补「Retry → 遮罩恢复」用例(ae775fc6 缺口 h)
3. onRetry 顺带 `feesQuery.refetch()`

## 四、确认正确、请勿改动的面

- 真零/不可用四指标口径(上表)——特别是 `[]` → "$0" 与 `null` → "—" 的区分是有意语义,勿"统一";
- `perpsSnapshot === null` 防御分支可留;
- 遮罩 `bg-background` 的选色依赖 terminal 主题 background=surface 同色覆盖(styles.css 有意设计),换 token 会破坏同色链;
- widget 创建 effect 只依赖 `[retryNonce]` 是正确设计(theme/symbol 走 setter),勿扩依赖;
- `animate-pulse` 的移除是"smooth"意图的组成部分,勿恢复。

---

注:本报告完成时 HEAD 已被并行进程推进至 `bf6d5afc`(涉及 portfolio/swap/fees,疑似正在响应 review_955ad977.md),其内容未在本报告范围内,可另行审查采纳度。
