# ADR 0023：未平仓量上限检查只在确认的快照上生效，未知状态放行

- 状态：已接受并实施（2026-09-27，分支 `claude/sdk-feat-oi-cap`，基线 `dbc6036e`）；2026-09-28 经 PR #50 合入 `dev`（`ac11f81b`），未发布，没有真实账户验收（当前没有可触发的市场）。
- 关联：[OI 上限说明](../open-interest-cap.md)（完整实现契约）；[数据展示规范](../mobile-data-presentation.md)（新增「已确认的市场未平仓量上限」一行）；[SDK 接入规划](../sdk-feature-integration-plan.md)第 2 项；[下单面板对照](../order-entry-surface-parity.md)；`AGENTS.md`「First-use trading onboarding contract」中「Errors or missing snapshots fail closed」的适用范围。编号说明：起初取 0021（当时 0020 已被尚未合入的分支使用）；合入 `dev` 时 0021 已由 Earn 借贷页占用、0022 由订阅单调时钟占用，改为 0023。

## 背景与约束

- Hyperliquid 会把处于未平仓量上限的永续市场列入 `perpsAtOpenInterestCap`。这些市场上的限价单挂出后会被撤销（`openInterestCapCanceled`），或在下单时被拒（`positionIncreaseAtOpenInterestCapRejected`、`tooAggressiveAtOpenInterestCapRejected`、`openInterestIncreaseRejected`）。改动前终端从不读取上限数据，只在交易所返回后给这些状态贴标签。
- 官方终端（2026-09-27 对生产包的静态阅读）在提交限价、止损限价、止盈限价时检查当前币是否在集合里，是则 toast 拦截并建议用市价单；市价、触发市价、TWAP、Scale 不拦截；只减仓与 TIF 不豁免。
- 已连接账户的集合可以从已有的 `webData3` 订阅派生。该订阅的 `refreshKey` 随每次账本更新变化，因此每次入金、出金、划转后都会重订阅，数据有一段时间是 `undefined`。
- 项目契约里「错误或缺失的快照失败关闭」针对的是授予能力的门槛：法律条款、签名者、Agent 授权、资金分类和「账户为空」结论。数据展示规范禁止用未知状态代替已确认的限制。
- 交易所始终是上限的最终裁决者：即使终端放行，上限市场的限价单也会被拒绝或撤销，不会造成超出用户意图的成交。

## 决策

1. **只在确认的快照上拦截。** 快照必须是活跃订阅、有数据、未过期、属于当前连接账户，并在 `perpsAtOpenInterestCap` 中列出该市场的精确名称；否则视为未知，校验与执行守卫都不拦截，也不显示任何文字。
2. **检查是建议性的前置提示，交易所保持权威。** 它移除一项能力（限价类下单），而不是授予能力，因此不适用「失败关闭」；放行未知状态的后果是一次会被交易所拒绝或撤销的下单，已有状态标签。
3. **拦截集合与官方一致。** 限价、止损限价、止盈限价在上限市场上被拦截，只减仓与所有 TIF（包括 IOC）不豁免；市价、触发市价、TWAP、Scale 与现货永不拦截。
4. **实时校验，提交时复核。** 选中限价类订单时由共享校验栈给出限制说明并禁用提交；`assertEntryOrderExecutionAllowed` 用同一快照结论在 SDK 调用前复核，失败以 `open-interest-capped` 反馈码经全局通知报告。TWAP 守卫不变。
5. **不新增订阅。** 集合在 `useAllDexsAccountState` 内从现有 `webData3` 派生，订阅参数、选项与 `refreshKey` 不变。
6. **HIP-3 每币上限只作只读元数据。** 资产信息弹窗打开时按 dex 查询 `perpDexLimits`，只显示合法、为正、精确匹配的值；不据此改价或拦截。

## 备选方案

- **失败关闭（未知即拦截）**：每次账本更新引起的重订阅、快照过期或订阅错误时，所有永续市场的限价单都会被禁用，并把未知状态当作已确认限制展示，改变了本功能范围之外的行为，也违反数据展示规范。否决。
- **只在提交时提示（官方做法）**：不改变表单，但用户要填完价格和数量、点击后才知道不能下单；本终端的校验体系是实时的，同一规则放在校验栈里还能让双端通过类型检查保持一致。否决，差异写入 OI 上限说明。
- **未连接时用 Info `perpsAtOpenInterestCap({ dex })` 轮询**：每次会话需要主 dex 加 10 个 HIP-3 dex 共 11 个请求，而未连接用户不能下单、官方也没有未连接指示，得不到可见收益。否决；若以后需要被动徽标，另行决策。
- **新建独立 hook 调用 `useSubscription("webData3")`**：会产生第二个订阅键（`refreshKey` 必须完全一致才能共享），并且许多测试和移动浏览器夹具替换了 `@/lib/hyperliquid`，新调用点会让它们崩溃。否决。
- **对 IOC 豁免**：文案「挂出后会被撤销」对不挂单的 IOC 不准确，但没有协议证据说明 IOC 在上限时一定能成交；为对齐官方保留拦截，把文案不精确记为已知限制。
- **同时拦截 Scale**：Scale 的挂单子单同样可能被撤销，但官方不拦截，也没有协议证据。保持对等，不拦截。

## 后果与边界

- 重订阅窗口里上限市场的限价单可以到达交易所，由交易所拒绝或撤销；这是有意接受的差距。
- 2026-09-27 主 dex 的 7 个上限币全部已下架（终端目录不包含），HIP-3 与测试网为空，功能上线后处于休眠，只有单元与界面测试证据。
- 移动与桌面的提示位置沿用各自已有的校验行；约 130 字符的说明在最窄宽度可能折成三行，需要浏览器布局套件核对不撑开网格。
- 限价平仓弹窗、HIP-3 市价买单价格钳制、原始错误文案映射与被动徽标不在本决策内，各需单独决策。
  - 2026-09-28 更新：原始错误文案映射已由 [ADR 0024](0024-translate-action-errors-at-render.md) 统一决定，三种上限相关拒绝文案都在其交易所文案字典中。

## 证据

- 代码：`apps/terminal/src/domain/trade/open-interest-cap.ts`、`hooks/trade/use-account-balances.ts`、`hooks/trade/use-order-entry-data.ts`、`lib/errors/definitions/open-interest-cap.ts`、`domain/trade/order/entry-execution-guard.ts`、`lib/trade/order-submission-feedback.ts`、`components/trade/components/market-asset-info.tsx`。
- 测试：`open-interest-cap.test.ts`、`open-interest-cap-hooks.test.tsx`、`order-validation.test.ts`、`entry-order-execution-guard.test.ts`、`order-submission-feedback.test.ts`、`market-asset-info.test.tsx`、`tests/mobile-trade-size-validation-a11y.test.tsx`、`tests/trade-panel-open-interest-cap.test.tsx`。
- 验证命令与本次实际结果见 [OI 上限说明](../open-interest-cap.md#验证)；公开 Info 的查询结果与官方前端取证来源见该文「证据」一节。
