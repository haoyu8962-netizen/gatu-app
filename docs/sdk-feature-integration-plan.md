# SDK 未接入接口的接入规划（第一批）

状态：拟实施（本文件落库时尚未开始编码）。日期：2026-09-27。基线：`claude/sdk-api-review-51a3ea`（`b0e10030`，树与 `origin/dev` 相同再加覆盖审查文档）。依据：[接口覆盖审查](hyperliquid-sdk-coverage-review.md)的收益排序、2026-09-27 在内置浏览器对 `app.hyperliquid.xyz` 的只读取证（生产包源码与界面），以及八路只读代码侦察。本文记录范围取舍、每项的设计要点、并行与集成方式和验收标准；每项功能的完整契约写在它自己的归属文档里，实施时同步落库。

## 范围取舍

本批实施六项。它们都是只读接口或纯展示，不改变签名模型、账户模型和资金流，官方终端都有对应功能：

| 顺序 | 功能 | 接口 | 归属文档（实施时新建或更新） |
| ---: | --- | --- | --- |
| 1 | 资金费率历史（图表区 Funding 页签） | `fundingHistory` | `docs/market-funding-history.md` |
| 2 | OI 上限：限价类订单拦截与 HIP-3 每币上限 | `webData3.perpDexStates[].perpsAtOpenInterestCap`、`perpDexLimits` | `docs/open-interest-cap.md`、`docs/adr/0021-open-interest-cap-advisory-check.md` |
| 3 | 跨交易所资金费率对比页 | `predictedFundings` | `docs/funding-comparison.md` |
| 4 | 持仓 TP/SL 大额滑点提示 | `maxMarketOrderNtls` | `docs/position-tpsl-slippage-warning.md` |
| 5 | TWAP 成交历史 CSV 导出 | `userTwapSliceFillsByTime` | `docs/twap-regression-tests.md`（导出一节） |
| 6 | 杠杆弹窗显示当前杠杆下的仓位上限 | 已有的 `allPerpMetas.marginTables`（官方用 `marginTable`） | `docs/leverage-position-limit.md` |

本批不实施、只记录原因：

| 项目 | 不在本批的原因 | 进入实施的前提 |
| --- | --- | --- |
| 服务端账户通知（订阅 `notification`） | SDK 0.33.3 按频道分发帧、帧内没有用户字段，同一共享 socket 上切换账户时旧账户的帧可能进入新账户的监听；隔离需要在 hl-react 传输层为该频道加专用 socket，属于 runtime-guardrails §6 要求的架构决策。消息内容与频率没有真实样本，可能与现有订单通知重复（官方把它挂在「后台成交通知」开关下） | ADR（传输隔离方案）、真实账户观察消息样本、默认关闭的构建开关 |
| 子账户、HIP-4 预测市场、金库管理 | 改变账户或市场模型；HIP-4 还涉及合规与地区限制 | 产品与合规决策、设计文档与 ADR |
| Agent 代签资金操作（`agentSendAsset`、`agentSetAbstraction`） | 改变 ADR 0002 的签名模型；生产配对开关仍关闭 | 签名 ADR 更新 |
| `scheduleCancel`、`cancelByCloid`、`noop` | 牵涉订单生命周期与「结果未确认」语义；官方前端未用 | 订单通知与 nonce 管理设计 |
| `userRateLimit`、`approvedBuilders`、`userToMultiSigSigners`、`linkStakingUser`、`spotUser`、`setDisplayName`、`exchangeStatus` | 收益低；后四项需要签名或语义未公开 | 按需排期 |
| `userBorrowLendInterest` | 依赖未合入的 `claude/earn-page` | Earn 页合入 |

## 共同约束

- 业务计算放在 `domain/` 或 `lib/`，金额与费率用 Big.js，协议字段保持字符串；组件只做展示。
- 被动数据遵循 [数据展示契约](mobile-data-presentation.md)：加载、过期、失败不显示文字；只有完整、当前、成功的快照才能得出「空」；新增的被动提示类别先改该文档再写代码。
- 数字经 `lib/format.ts` 格式化并订阅数字格式设置；日期跟随界面语言；翻译用 `@lingui/react/macro` 的响应式 `t` / `Trans`，新增渲染文件登记到 `i18n-reactivity-contract`。新文案在六个语言目录都给出翻译。
- 首屏不新增惰性块；新面板在首次激活后挂载并按意图预热，用 `createRetryableLazyComponent`，交易页草稿不能因缺块被重载。`pnpm build` 的分块与包体预算是最终依据。
- 不签名、不触发 Agent 注册或 builder 授权；确认面的按钮名称、提交路径与负载不变。
- 桌面网格几何、存储键和滑杆手势契约不变；新增内容不在拖动中改变滑杆所在布局。

## 各项设计要点

### 1. 资金费率历史

- 官方：图表面板顶部 `Chart | Funding` 页签；Funding 为双轴折线图，区间 1h（7 天）、8h（30 天，默认）、D（90 天），按区间把每小时费率求和，并画累计曲线；从 `now - 窗口` 起分页，每页 500 条，最多 20 页；现货没有该页签；手机端为行情区第四个页签。
- 方案：桌面 `ChartPanel` 增加固定高度的页签条（现货只有 Chart，保证 TradingView 高度不随市场类型变化）；TradingView 保持挂载，用现有 `active={false}` 路径与可见性分层隐藏，不重建；手机 `MarketsDataView` 为永续增加第四个 Funding 页签。数据经 `fetchTimeRangeHistory` 分页、完整快照才绘图；桶按 UTC 纪元对齐，含首尾不完整桶。图表为按需加载的手绘 SVG，不新增图表依赖。
- 状态：首次加载为空白绘图区加 `aria-busy`；失败只给中性「重试」；完整成功的空快照显示「暂无资金费率历史」；页签与区间不持久化。

### 2. OI 上限

- 官方：市场处于 OI 上限时，提交限价、止损限价、止盈限价订单被拦截并提示「限价单挂出后会因未平仓量上限被撤销，请用市价单平仓」；市价、触发市价、TWAP、分段订单不拦截；HIP-3 按 dex 查询 `perpDexLimits`。
- 方案：从现有 `webData3` 订阅（同一订阅键，不新增订阅）派生上限币种集合，经账户余额与下单数据传到桌面与手机共用的校验栈；新增校验项在选中限价类订单时给出准确的限制说明并禁用提交；执行守卫在提交时复核。只有当前、成功、同一账户的快照明确列出该币时才拦截，未知状态放行，交易所仍是最终裁决（理由写入 ADR 0021）。HIP-3 资产信息弹窗在打开时查询 `perpDexLimits`，显示该币的 OI 上限。
- 非目标：限价平仓弹窗拦截、官方的 HIP-3 市价买单限价钳制、交易所错误原文映射、行情区上限徽标。
- 现状说明：2026-09-27 主 dex 处于上限的 7 个市场全部已下架，10 个 HIP-3 dex 为空，功能上线后暂时处于休眠，只能靠单元与界面测试验证。

### 3. 资金费率对比页

- 官方：`/fundingComparison`，列为 Market、Hyperliquid OI、Hyperliquid、Binance、Binance-HL 套利、Bybit、Bybit-HL 套利；周期为每小时、8 小时（默认）、每日、每周、每年；费率按各场所 `fundingIntervalHours` 折算为每小时再乘周期；套利值为场所费率减 HL 费率，显示绝对值并说明方向；过滤已下架币。
- 方案：新增仪表盘路由 `/fundingComparison`，挂在桌面「更多」菜单与手机抽屉的「更多」区；`useInfo("predictedFundings")` 每 60 秒刷新、不持久化；Hyperliquid OI 用主 dex 资产上下文的 `openInterest × markPx`（与行情头一致）；缺 `fundingIntervalHours` 的 CEX 数据显示 `--`，不照搬官方的硬编码币种表；只含主 dex（协议限制）。桌面为可排序表格，手机为卡片；搜索、排序、分页在领域模块里完成。
- 预算：为该路由增加包体预算条目，数值取实测。

### 4. 持仓 TP/SL 大额滑点提示

- 官方：持仓 TP/SL 弹窗加载 `maxMarketOrderNtls`，按持仓当前杠杆选出分档上限，持仓价值超过时显示滑点警告；不影响提交。
- 方案：领域函数按「不高于当前杠杆的最高档」取上限并用 Big.js 严格比较；分档表格式异常时整表视为不可用、不提示；提示为语义 warning 块，放在数量滑杆下方、确认按钮上方；文案不照搬官方「分多个触发价下多笔部分 TP/SL」的建议（与 gatu 的单一 TP/SL 模型冲突）。与协议规格按资产最大杠杆分档的差异写入归属文档。

### 5. TWAP 成交 CSV 导出

- 官方：TWAP 成交页签的导出使用 `userTwapSliceFillsByTime`。
- 方案：新导出 hook 复用 `useHistoryExportRunner`（身份切换即中止、单次运行），按时间正向分页、升序校验、最多保留最新 10,000 条并在截断时提示；列与现有成交 CSV 相同，类型列为 TWAP；桌面与手机的 Fill History 子视图底部增加「导出 CSV」；表格仍显示最近 2,000 条；SDK 会剥离 `aggregateByTime`，本批不发送。

### 6. 杠杆仓位上限

- 官方：杠杆弹窗对多档市场显示「当前杠杆下的最大仓位」，取第一个 `maxLeverage < 所选杠杆` 的档位下界；单档市场不显示。
- 方案：在 `liquidation.ts` 旁新增领域函数，复用现有分档规范化；在共用的 `LeverageEditor` 输入框下方增加一行固定高度的键值行，是否出现只取决于市场分档，拖动中只改文字，不改变高度；不参与确认按钮，也不改变 `updateLeverage` 的负载。

## 并行与集成

- 六项各自在独立 git worktree（基于本规划提交）开发，分支 `claude/sdk-feat-<名称>`，完成后由独立审查代理对照本规划与项目契约审查、修复一轮。
- 各分支不修改集成文件：`CHANGELOG.md`、`docs/README.md`、`docs/hyperliquid-sdk-coverage-review.md`、`docs/work-memory/`、`AGENTS.md`。这些由集成方在合并后一次写入。
- 翻译目录：各分支可以运行 `pnpm i18n:extract` 并为自己的新文案补齐六个语言；集成时按顺序合并，目录冲突以合并后的源码重新提取，再把各分支的译文逐条回填。
- 集成顺序：杠杆上限 → TP/SL 提示 → TWAP 导出 → OI 上限 → 资金费率历史 → 对比页（从改动小到改动大，最后处理路由与包体预算）。每合一项跑该项的定向测试，全部合入后跑完整终端测试、类型检查、Biome 与 Node 22.15 的生产构建（含预算）。
- 对抗审查：集成后按功能并行发起 Codex 只读审查（`-s read-only`、`approval_policy="never"`、medium 强度，提示词禁止提交），逐条核对发现并修复，再发起下一轮，直到没有 P0–P2 发现；每轮的发现与处理写入工作记录。
- 浏览器核对：在本 worktree 启动开发服务器（空闲端口），检查桌面 lg、md、紧凑宽度与手机 375px 下的新界面，写明输入路径；不连接真实钱包下单。

## 验收标准

- 每项的归属文档写明目标、约束、方案、备选与代价、状态表和验证结果，并与实现一致。
- 新增单元、组件测试覆盖领域规则、状态映射、身份与语言切换；受影响的契约测试组全部通过；完整终端测试的失败逐一单跑核实并如实记录。
- `pnpm typecheck`、Biome、`pnpm build`（分块环检查与包体预算）通过；预算变化写明原因。
- Codex 最后一轮无 P0–P2 发现，残留 P3 记录在工作记录。
- CHANGELOG Unreleased、文档地图、覆盖审查追加记录、工作记录与索引在同一批提交中更新；没有真实钱包与真机验收的项目明确写出。
