# ADR 0041：新账号自动设为统一账户

- 状态：已接受并实施（2026-10-12；运营方当日明确决定「按官方做法去做」）；2026-10-12 经 PR #107 合入 `dev`（合并提交 `6525fd04`），未晋升 `main`、未发布，真实账号验收未做，见文末。
- 关联：[取证记录](../work-memory/sessions/2026-10-12-new-account-default-mode-review.md)、[首次交易](../trading-onboarding.md)、[移动数据呈现「账户模式与资金限制」](../mobile-data-presentation.md)、[账户概要](../account-overview.md)、[签名机制](../hyperliquid-signing.md)。

## 背景

Hyperliquid 上每个新账号都处于协议的 `default` 状态：`userAbstraction` 返回 `"default"`，`webData3` 的 `userState` 没有 `abstraction` 字段。官方终端不让用户看到这个状态：账号进入 `readyToTrade`（已接受条款、已入金、Agent 已登记）且订单历史为空时，它用 Agent 签名发送 `agentSetAbstraction { abstraction: "u" }`，把账号设为统一账户，没有任何界面，每个地址最多 3 次、失败后 5 秒重试，交易所返回 `Abstraction transition not allowed` 或 `Cannot set abstraction for deployer or fee recipient` 即停止（官方打包代码 `config-DgrJgRxr.js` 的 `Doe` / `Ooe`，2026-10-11 取证）。

本项目自 2026-09-09 起把 `default` 归为不支持的模式（只接受三种文档化模式、不猜测 `default` 的语义），但没有任何一步让新账号离开 `default`：权益与余额显示为 0，下单被阻断，资金动作被禁用，下单按钮是置灰的「Place Order」而不是「Deposit」，余额页签显示「Select a supported account mode to view balances.」，用户只能自己找到账户类型弹窗并选择；未入金时选择还必然被交易所以 `Must deposit before performing actions` 拒绝。2026-10-12 运营方用新邮箱注册时遇到了这个状态。

## 目标与约束

- 新账号入金后不需要任何选择即可使用，结果与官方终端一致：统一账户。
- 这是在「账号已就绪」这一状态路径上新增的一次无点击签名。AGENTS.md 规定登录、刷新与状态检查不得签名，此前只有两项例外（ADR 0033 的智能钱包关联、ADR 0040 的邮箱自动存款）。本 ADR 是第三项，范围必须同样有界：只改账户配置，不移动资金，不批准 Agent、builder fee 或条款，可由用户事后在账户类型弹窗改回。
- 不改变 `default` 的数值语义：除本 ADR 列出的呈现外，`default` 仍是不支持的模式，不把它当成 Standard 来计算余额或放行资金动作。
- 不覆盖用户已经作出的选择：只处理协议值恰为 `default` 的账号。
- 所有不确定都失败关闭：任一条件读不到、过期或冲突时不签名。

## 决策

### 触发条件（全部满足才尝试）

1. 钱包会话且 `sessionMode === "wallet"`。手机导入密钥的 Agent-only 会话不触发，由桌面会话处理。
2. 法律状态已知且允许操作：`userAllowed`、`canPerformActions`、`acceptedTerms` 均为真。
3. 交易签名者就绪（`useTradingStatus().isSignerReady`）：邮箱会话是精确的 Privy embedded owner，外部钱包会话是已核验的 Agent。
4. 账户模式解析结果恰为 `default`：HTTP `userAbstraction` 为 `"default"`，且 `webData3` 没有给出与之冲突的值。`dexAbstraction`、未知值、来源冲突都不触发。
5. 完整、成功且未过期的永续与现货快照显示账号已入金（`getTradingAccountFundingState` 为 `funded`，且两路快照状态均为 `success`）。只要有一路缺失、失败、加载中或过期，哪怕缓存里有正余额，也按加载处理，不签名；「确认为空」的结论同样只认当前快照。余额只取全 DEX 永续快照与现货快照这两路 WebSocket 数据：所选 DEX 的摘要在快照缺该 DEX 时会回退到一次可能已缓存的 HTTP 请求，它不能让账号变成已入金；它显示有余额而当前快照显示为空时，两者矛盾，账号既不算已入金也不算空：不自动设置，直接交给手动选择（`manual`），不会一直停在加载。未入金的账号在 HyperCore 上不存在，任何动作都会被拒绝。
6. `historicalOrders` 请求成功且返回空数组：入金后才发起，每次挂载都重新请求，读取中或失败都不算空。已有订单历史的账号不自动改，沿用手动选择（官方对这类账号用强制确认弹窗，本 ADR 不实现）。这个条件在签名边界还会再核一次，见下文。
7. owner 不是本终端配置的 builder 地址（`DEFAULT_BUILDER_CONFIG.b`）：builder 地址必须保持 Standard 才能累计 builder fee。
8. 本页面会话内该 `env:owner` 的尝试少于 3 次，且没有收到终局拒绝。

### 动作

- 邮箱会话：由精确 embedded owner 静默签名的 `userSetAbstraction { user, abstraction: "unifiedAccount" }`，即账户类型弹窗已经在用的文档化用户签名动作。邮箱会话没有 Agent；由 owner 自己签 L1 的 `agentSetAbstraction` 是否被交易所接受没有验证过，所以不用它。
- 外部钱包会话：由已核验 Agent 签名的 `agentSetAbstraction { abstraction: "u" }`，与官方终端相同，不弹钱包。协议只允许 Agent 把账号从 `default` 设出去，不能覆盖用户已选的模式。
- 两条路径都经过 `useExchange`：提交前强制刷新法律状态、跨标签页资金动作锁、身份与会话租约、SDK 层不自动重试。`agentSetAbstraction` 加入 `TRADING_PRE_EXECUTION_GUARD_METHODS`，两条路径都带同一个 `preExecutionGuard`，在资金锁内、签名之前依次重读：`userAbstraction` 不再是 `default` 就放弃；`historicalOrders` 读不到或不是数组按一次失败处理，非空则把结果写入缓存并终止（该账号转为手动选择）。也就是说，判定时读到的空订单历史只决定是否发起尝试，是否签名由锁内的这次读取决定。两条路径还带同一个同步的 `executionGuard`：入队前和 SDK 边界各读一次宿主当前的判定，任何条件已不成立（快照过期或失败、资金转走、法律状态或签名者变化、宿主已因身份或模式变化卸载）即放弃，不签名，按一次普通失败处理。
- 成功后把查询缓存里的模式写成 `unifiedAccount` 并使 `userAbstraction`、`clearinghouseState`、`spotClearinghouseState` 失效。全程不显示通知：这不是用户请求的动作（[操作反馈契约](../trading-notifications.md)）。

### 重试与终止

- 每个 `env:owner` 在一次页面会话内最多 3 次，两次之间间隔 5 秒。
- 交易所返回 `Abstraction transition not allowed` 或 `Cannot set abstraction for deployer or fee recipient` 是终局拒绝，立即停止。
- 资金锁内发现模式已不是 `default`：停止并刷新，不计为失败。
- 资金锁内发现账号已有订单历史：与终局拒绝同样处理，立即停止，回到手动选择。
- 其他失败（包括结果不明的网络错误）计一次尝试。重试是安全的：动作幂等，不移动资金，每次尝试前都在锁内重读模式，上一次若其实已成功，本次不会再签名。
- 尝试按 `env:owner` 记在模块级登记表里，保存到页面结束：重挂载、StrictMode 重放、切换账号再切回都不会重置计数，也不会为同一次尝试再发一个请求。等待重试的定时器只改写自己那一项，较早账号的结果不写入新账号的状态。
- 一次尝试已结算（成功，或锁内发现模式已变）之后，账号本应立刻离开 `default`。如果 45 秒后（长于账户模式 30 秒一次的刷新）读到的仍是 `default`，说明两次读取互相矛盾，该项改为「用尽」，界面回到手动选择，不再自动尝试，也不会一直停在加载。

### 呈现

页面级宿主把当前账号的状态发布到 `useAccountModeSetupStore`，下单数据、桌面与手机余额页签、账户类型弹窗读取同一个值：

| 状态 | 条件 | 呈现 |
| --- | --- | --- |
| `awaiting-funds` | `default` 且资金快照完整、当前、确认为空 | 看起来与普通空账号相同：下单按钮为「Deposit」（下单动作阶段的呈现决定，排在连接与建立签名者之后），桌面与手机余额页签为「No balances found. Deposit funds to start trading.」及存款入口。下单可用性本身仍为 error：表单、提交条件与执行守卫照旧阻断，不看交易额度流报了什么。提款与划转仍禁用，原因为「New accounts are set to Unified account automatically after the first deposit.」。交易面板的账户模式显示「Unified」。账户类型弹窗预选统一账户，三个选项与 Confirm 禁用，并显示同一句说明加「You can change the mode here afterwards.」 |
| `pending` | `default`、已入金，自动设置仍可能发生（等待快照、法律状态、签名者状态或订单历史，尝试进行中、等待重试、刚结算），以及宿主尚未为该账号发布状态的首帧 | 被动加载：下单可用性为 loading，桌面余额页签为忙碌占位，手机余额页签为忙碌的待定状态；资金原因、账户模式标签与账户类型弹窗同 `awaiting-funds` |
| `manual` | `default` 但自动设置不会发生：Agent-only、builder 地址、已有订单历史、订单历史读取失败或答复不是列表、缓存摘要与当前快照对资金的结论矛盾、法律状态明确不允许、外部钱包尚未建立 Agent、尝试用尽、终局拒绝、结算 45 秒后仍为 `default`。其中 Agent-only、builder 地址、终局拒绝、尝试用尽与已知的订单历史排在空账号呈现之前：这些账号即使资金变空也保持手动选择，不再承诺自动设置 | 沿用改动前的呈现：下单可用性为 error，桌面余额页签显示「Select a supported account mode to view balances.」，手机余额页签保持静默的待定状态，资金原因为「Select a supported account mode before moving funds.」，账户模式显示「Select mode」。账户类型弹窗预选统一账户并显示黄色提示：钱包会话可直接 Confirm；Agent-only 会话的选项与 Confirm 仍禁用，显示需到桌面的原因 |
| `not-applicable` | 其他模式 | 不变 |

账户类型弹窗在 `default` 时预选统一账户（官方的 `mQ` 对 `undefined` 也预选统一账户）；`dexAbstraction` 仍不预选，必须显式选择。交易面板在自动设置适用期间显示「Unified」，是把即将生效的结果告诉用户，与弹窗的预选和说明一致；它只改标签，不改任何数值或门控。数值与门控不变：`default` 的权益与余额行仍按不支持的模式返回 0，资金动作的 `available` 仍为假，下单仍被阻断，只是 `awaiting-funds` 时这些 0 本来就是事实，`pending` 通常只持续几秒。使用方在宿主为当前账号发布状态之前读到的是 `pending`，所以「请选择账户模式」不会在即将被自动设置的账号上闪现。

## 替代方案与取舍

- 把 `default` 当成 Standard 显示和放行（官方的余额计算把 `undefined` 与 `disabled` 归为一类）：能让入金后立即显示余额，但要逐一确认划转、发送、兑换、提现在 `default` 下的语义，并推翻 2026-09-09 的决定；改动面是二十多处门控。不采用。
- 把设置挂在首笔订单上（像 builder fee 那样）：`default` 下下单本身被阻断，仍要先放行 `default`，同上。不采用。
- 只做引导（入金后弹出账户类型并预选统一账户）：不新增签名，但用户仍要多一步，与官方不一致。运营方选择了自动设置。
- 邮箱会话也用 `agentSetAbstraction`：单一路径，且协议层保证只能从 `default` 转出；但 owner 自签是否被接受未验证，失败会让主要注册路径停在手动选择。改用确定可用的用户签名动作，由锁内重读保证只在 `default` 时发送。
- 为已有订单历史的 `default` / `dexAbstraction` 账号实现官方的强制迁移弹窗：会改变已有交易者的保证金行为，属于单独的产品决定，留作后续。

## 后果与边界

- 这是登录后状态路径上的第三种无点击签名。它不移动资金，但会改变保证金的计算方式（各 DEX 独立余额变为统一余额），用户可在账户类型弹窗改回。
- 已有订单历史的 `default` 账号和 `dexAbstraction` 账号不自动处理，仍需手动选择；官方的强制迁移弹窗没有实现，留作后续的产品决定。
- 外部钱包账号入金后、建立 Agent 之前处于 `manual`：余额页签仍显示「请选择支持的账户模式」。建立 Agent 后转为 `pending` 并自动设置；用户也可以在此之前自己用钱包签名选择。
- 自动设置只在页面运行时发生。用户入金后关闭页面，下次打开时才设置。
- 页面级宿主对每个会话只观察一次账户模式（挂载与窗口重新聚焦时读取，不自带定时刷新），模式不是 `default` 时什么都不挂载；只有 `default` 账号才挂载运行器，并由它的余额订阅每 30 秒刷新模式。宿主不显示任何消息，终局拒绝的文本直接从 SDK 错误里读取，不为此在启动路径加载错误文案模块。
- 呈现与执行许可是分开的。不支持的模式下，下单可用性永远不是 `success`（`awaiting-funds` 与 `manual` 为 error，`pending` 为 loading），所以提交条件与 SDK 边界的执行守卫始终拒绝；`awaiting-funds` 只是让下单动作阶段显示「Deposit」。入金后交易额度流可能比资金快照先报出正额度，这段时间里订单仍然提交不了。
- 邮箱路径在主网的端到端结果（入金后无点击变为统一账户）尚未用真实账号验证；外部钱包路径的 `agentSetAbstraction` 同样未实测。两者失败时的表现是三次尝试后回到手动选择。

## 验证标准

- 纯函数判定覆盖上表每个分支与每个触发条件的缺失。
- 宿主测试：邮箱路径只调用一次 `userSetAbstraction("unifiedAccount")`，外部钱包路径只调用一次 `agentSetAbstraction("u")`；任一条件不满足时两者都不调用，包括正余额来自缺失、失败、加载中或过期的快照；锁内重读不是 `default` 时不签名；锁内读到订单历史时不签名并终止，读不到时不签名并重试；请求在锁内等待期间条件失效或宿主卸载时不签名；只有缓存摘要显示余额时不签名；初始订单历史答复不是列表时转为手动选择；终局拒绝后不重试；普通失败按 5 秒间隔最多 3 次；StrictMode 重放与重挂载不重复发送；身份变化后较早的结果不影响新身份；builder 地址不触发。
- 呈现测试：新注册且未入金的 `default` 账号下单按钮为「Deposit」而下单可用性仍阻断（含交易额度流先报正额度的情形，并渲染真实的桌面与手机下单面板确认点击只打开存款、不提交订单）、余额页签为空账号提示；`pending` 为加载；`manual` 保留现有提示。账户类型弹窗在 `default` 时预选统一账户，`awaiting-funds` 时禁用 Confirm 并显示说明。
- 真实验收（不能由自动化替代）：一个新邮箱账号入金后，不经任何点击变为统一账户，余额与下单可用；一个新外部钱包账号入金并建立 Agent 后同样如此，且全程没有额外的钱包弹窗。

## 实施与验证结果

见[任务记录](../work-memory/sessions/2026-10-12-automatic-unified-account.md)：实现位置、测试与变异核对、本机开发服务器上对一个未入金新邮箱账号的页面读数，以及未做的真实验收。
