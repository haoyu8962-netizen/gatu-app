# 移动端数据加载与提示规范

## 目的与范围

移动端的行情、交易、账户、资产组合，以及这些入口使用的共享资金和仓位弹窗，在首次加载、后台刷新和重连期间保持安静、稳定。数据尚未返回不代表账户为空、连接故障、账户模式不受支持或平台不支持充值提现。质押、推荐、金库列表与金库详情页在桌面与手机上同样遵循本规范（2026-11-01 起，见下文「受约束的入口」）。

本规范先于实现更新。修改上述界面时必须同时检查本规范与 `AGENTS.md`，不得重新引入被动数据状态警告。

## 展示规则

| 情况 | 展示 | 禁止 |
| --- | --- | --- |
| 账户数值未就绪 | 仅在展示层使用格式化的零；恢复后显示实际值 | 把占位零写回业务模型、缓存或资金分类 |
| 列表首次加载、订阅已建立但首份快照未到达 | 稳定空容器或骨架；可设置 `aria-busy` | “暂无持仓/订单/余额”、充值引导 |
| 数据过期、重连、后台刷新失败 | 空容器、骨架，或允许保留的只读历史记录 | “余额已过期”“更新已暂停”“加载失败”等被动文字、警告图标和原始错误 |
| 完整、当前、成功的空快照 | 正常的空列表说明 | 用数组长度单独判断账户/列表为空 |
| 数据依赖尚未就绪的操作按钮 | 保留操作名称并禁用；执行中的明确用户操作可以显示进度 | 把按钮改名为“加载余额失败”“不可用”等数据状态 |
| 钱包或地区规则尚未解析 | 等待解析，保留动作禁用状态 | 提前断言“不支持充值提现”“请选择账户模式”“等待连接恢复” |
| 已确认的地区、网络或账户限制 | 必要、准确的限制说明 | 用未知状态代替已确认限制 |
| 已确认的市场未平仓量上限（当前、成功、未过期、同一账户的 `webData3` 快照在 `perpsAtOpenInterestCap` 中列出该永续市场的精确名称） | 选中限价、止损限价、止盈限价时，在各端既有的校验提示行显示一条准确的限制说明（「未平仓量已达上限，限价单挂出后会被撤销。请使用市价单平仓。」），提交按钮保留静态名称并由 `canSubmit` 禁用；市价、止损市价、止盈市价、TWAP、分段订单和现货不受影响（[OI 上限说明](open-interest-cap.md)） | 快照缺失、订阅中、过期、错误、重连或账户不匹配时显示或执行上限限制；用提示是否存在决定能否提交；在行情区、按钮名称或未连接状态下展示被动上限徽标 |
| 已确认的 Agent-only 会话（手机使用桌面授权的交易密钥） | Deposit / Withdraw / Transfer 及其他需要主钱包的入口保留并禁用，给出「需要在桌面连接主钱包」的一句原因（`agent-only-session`）；缺少 Agent 或 builder fee 授权时，下单与确认按钮保留静态名称并禁用，给出「请先在电脑端下第一笔订单完成交易授权」的一句原因（[ADR 0039](adr/0039-link-mobile-device-builder-fee-and-session-priority.md)） | 整体隐藏资金入口；把该原因归入被动数据原因集合；在手机上提供无法签名的 Enable / Connect / Reconnect 入口 |
| 已确认的命名 API 钱包基础名额用完（关联移动设备弹窗：本次打开后成功返回的 `extraAgents` 里，有效的命名 Agent 已达文档基础上限 3 个且没有 `Mobile QR`） | 签名前在弹窗里显示一条 warning 提示，用条件句说明授权可能被拒绝（子账户与成交量会提高上限），列出占用的名字与到期日，附 API 钱包页入口；授权按钮不因此禁用（[ADR 0039](adr/0039-link-mobile-device-builder-fee-and-session-priority.md)） | 加载中、失败、过期或格式不符时显示任何名额文字；用提示是否存在决定能否授权 |
| 已确认的手机访问结束（状态检查确认导入的密钥已过期或被电脑端替换，并已删除） | 一条常驻通知「手机访问已结束」，说明需要在电脑端重新生成二维码扫码（[ADR 0039](adr/0039-link-mobile-device-builder-fee-and-session-priority.md)） | 在答案不确定（请求失败、刷新中、快照早于导入）时提示或删除；把它当作被动加载失败文案 |
| 用户实际提交的操作失败或结果待确认 | 保留与该操作有关的错误、重试与追踪反馈 | 静默吞掉提交失败，或把待确认交易当作失败后允许重复提交 |
| 质押、推荐与金库页（桌面与手机）：某一来源刷新失败，但本页开始读取后已收到过它的数据（同一 owner、网络与金库，按 `useDataReceivedSinceMount` 判断，界定与[资产组合 E13](portfolio-statistics.md) 相同） | 静默保留这份数据；依赖它的操作按可用性布尔值禁用，直到刷新成功，并在操作旁提供中性「Retry」；空列表不下结论，改为中性「Retry」。进入本页之前缓存、本页没有收到过的数据在请求失败后不保留，按首次失败处理 | 用错误页、红色提示框或警告图标替换已显示的数据；把余额置 0；用保留的数据启用操作或得出「没有记录」 |
| 质押、推荐与金库页的数值未知（未连接、加载中、首次读取失败） | 稳定占位符 `--` | `0 HYPE`、`$0` 等看似确定的零 |
| 由市场静态元数据推导的说明值（目前仅杠杆编辑器的「最大仓位」行，桌面弹窗与移动抽屉共用） | 是否出现只取决于该市场的保证金分档表：有效且多于一档才显示，数值随编辑器显示的杠杆变化；「无档位上限」只能由有效分档表得出；杠杆超出分档范围、缺少计价币符号或截断后的下界超出 JavaScript 安全整数范围（合成情形）时用稳定占位符（[杠杆仓位上限](leverage-position-limit.md)） | 分档表缺失、无效或单档时显示「加载中」「不可用」等文字；让该行随预览杠杆出现或消失；用该行是否存在或其数值决定确认按钮能否点击 |
| 确认弹窗打开期间，待确认对象与开窗时不同（目前仅市价平仓的仓位数量） | 在需要重新核对的内容旁明示一条 `aria-live="polite"` 提示，说明哪一项与开窗时不同；只在可见、可编辑的确认阶段显示；执行仍以点击时展示的数量为上限（[确认面契约](confirmation-surfaces.md)） | 静默改写待确认数值；把变化写进确认按钮名称；用提示是否存在决定能否提交；弹窗关闭后的后台执行期继续播报 |
| 手机成交历史开启任一筛选（类型、方向、角色）：列表平时只显示最近 30 条实时成交，页签同时补拉 `userFills` 快照（最多 2,000 条），与订阅保留的全部实时成交（`useUserFills().bufferedFills`，hl-react 最多保留 200 条）按 `(time, coin, tid)` 去重合并（[筛选映射](trading-toolbar-redesign.md#mobile-filter-mappings)） | 有匹配就显示匹配的成交（最多 30 张卡片），补拉之后到达、又被更新的成交挤出最近 30 条的匹配成交仍然显示。只有补拉属于当前 owner 与网络、最近一次请求成功、没有请求在进行、未离线，实时成交快照当前（就绪、未过期、未离线、无错误），且订阅保留的最早一条实时成交不晚于快照里最新的一条（两者之间不会漏掉成交，`fillSnapshotReachesLiveFills`；两个时间都算上 TWAP 成交，因为订阅的保留上限也算它们，而列表不显示它们）时，无匹配才显示「No fills match these filters.」；订阅里一时没有普通成交（例如只剩 TWAP 成交）时，已开启的筛选照常显示筛选行与快照里的匹配，不退回「No fills found.」；补拉恰好返回 2,000 条上限时改为「No fills match these filters among the latest 2,000.」，不声称检查过更早的成交。补拉加载、重新请求、离线或实时快照不当前时为空白列表加 `aria-busy` 与读屏说明；补拉失败（包括已有快照后的刷新失败），或实时成交已不能与快照衔接时，只给中性「Retry」，重试会重新补拉 | 补拉未完成、失败、刷新中、实时快照不当前或两者之间可能漏掉成交时得出「无匹配」结论；在不到上限或达到上限的检查范围外声称没有匹配；显示补拉的错误文字或警告图标 |
| 仓位 TP/SL 弹窗：`maxMarketOrderNtls` 成功返回、整表格式有效，且仓位价值严格大于按仓位当前杠杆选出的分档上限 | 在说明段落之后显示一条语义 warning 提示，说明市价 TP/SL 可能因仓位规模产生较大滑点，建议改用限价执行或配置更小的数量；不含数值、不设 `aria-live`、不参与提交判断（[TP/SL 大额滑点提示](position-tpsl-slippage-warning.md)） | 分档表加载中、失败、格式异常、没有适用分档时显示任何文字（如「无法判断滑点」）、图标或占位；把提示写进确认按钮名称；用提示是否存在决定能否提交，或因提示改变提交负载 |

屏幕阅读器专用的简短加载说明与 `aria-busy` 可以保留。禁用按钮可关联准确的无障碍说明，但不得把首次加载描述成连接故障。全局真实离线/恢复提示、已确认地区限制、签名确认、法律条款、交易提交结果、确认对象与开窗时不同的提示，以及仓位 TP/SL 大额滑点提示，均不属于普通数据加载文案。

## 双端下单与账户概览

启动阶段遵循 [ADR 0010](adr/0010-blank-until-ready-startup.md) 和 [启动渲染规则](../.claude/rules/startup-rendering.md)：预渲染及 runtime/i18n 未就绪时只保留空播报，没有可见骨架。runtime 和持久语言目录就绪后，移动端在同一个 MobileTerminalFrameView 中显示真实 MobileHeader 与 MobileBottomNav；市场目录/路由市场未就绪时 main 为空且 aria-busy，数据就绪后挂载内容。头部与底栏不重挂载，底栏使用现有 useMobileTerminalTab 对导航持久状态的校验与 trade 默认值，不改写用户偏好。真实组件继续使用纯 view；已挂载数据组件的被动数据展示和守卫仍按上表执行。

桌面与移动下单面板共同遵循静默恢复规则。校验结果继续完整保留用于禁止提交；展示层只呈现依赖数据已经就绪的输入错误。行情、账户或钱包未就绪不得进入表单错误汇总；行情不可靠时不展示依赖其计算的金额、数量、止盈止损和 TWAP 价格方向判断。仓位未知不得展示“先开仓”。字段错误与汇总同步清除，不能在恢复、切换市场或语言后保留过时文案。

字段红框、文字与 `aria-invalid` 使用同一份可展示校验结果，不能只隐藏文案而残留红框。限价与分段订单的 Mid 控件复用当前市场上下文，mid 优先、空值时 mark 回退，检查对应来源的成功状态和接收时间。无新鲜价格时保持按钮原位禁用，不消耗自动预填机会，不覆盖已有输入或手动清空。TWAP 的默认 30 分钟属于真实初始值，实际零分钟必须显示为零。参考与边界见 [下单字段核对](order-entry-field-review.md)。

操作按钮使用显式阻断状态，不得依赖提示文案是否存在。保留已确认限制和用户主动操作反馈。账户概览不再显示“可用资金在现货账户”警告或重复划转入口；余额仍由正常资产列表展示，划转继续使用原有操作区入口和能力校验。该调整不改变用户主动提款时的资金来源说明。

独立数据源的展示状态不得相互覆盖。下单面板余额快照健康、只减仓持仓快照尚未就绪时，保留实际可用余额，数量和提交动作仍按组合门槛禁用。仅余额自身不可判定时才使用余额占位；桌面同源余额行与 Swap 遵循相同边界。

## 认证初始化的恢复入口

认证界面只以 `usePrivy().ready` 判断就绪；签名仍须等待 `useWallets().ready` 与精确的当前 owner 钱包。认证已就绪时，已登录用户的身份菜单在钱包目录初始化期间仍可打开；未登录用户的登录入口不等待钱包目录。

认证持续未就绪，或已登录用户的钱包目录持续初始化超过 30 秒，可提供用户主动点击的“重新加载页面”入口；已登录用户的菜单使用中性的钱包状态指示。钱包目录尚未就绪时，重连与安全退出保持禁用。就绪状态或身份变化须重置计时。这是应用的恢复交互，不是 SDK 的超时或重试规则，也不代表已复现 Hyperliquid 相同故障的处理方式。点击后沿用 Privy 正常会话恢复；不得自动刷新、退出登录、重挂载认证 Provider 或将未知状态标记为就绪，不改变签名、授权、资金判断及动作保护。不得显示原始错误、故障结论或警告横条。

该入口仅适用于认证与钱包目录初始化，不扩展为行情、余额或订单被动加载提示。与 [交易引导规范](trading-onboarding.md) 和 [邮箱签名规范](email-trading-signing.md) 同步验证：认证与钱包目录独立恢复、30 秒入口出现、身份或就绪变化重置计时，以及未点击时没有刷新或交易副作用。

## 邮箱钱包的静默创建

邮箱会话登录后，钱包由根部 `EmailEmbeddedWalletProvider` 在后台创建（[ADR 0033](adr/0033-silent-email-wallet-creation.md)）。创建和激活期间不显示任何文字、图标或占位：协议门控保持 `checking`，页面可以浏览，交易和资金弹窗照常挂起。

创建失败或 20 秒内没有完成，属于用户注册这个动作的结果，不是被动数据提示：

- 带协议门控的页面由协议弹窗的「钱包尚未就绪」状态呈现，提供 Retry 和「断开连接」。文案不显示原始错误，也不断言创建一定失败。
- 没有协议门控的页面不弹提示。恢复入口是账户菜单的「重新连接钱包」（重试创建）和「断开连接」。
- 刷新后恢复的缺钱包会话沿用同一规则：自动补建一次，失败后不再自动重试。

钱包目录就绪后，没有钱包的邮箱会话必须能登出。目录还没就绪时，重连和安全退出按上一节保持禁用，只有 30 秒后的「重新加载页面」。这些入口不扩展为行情、余额或订单的被动加载提示。

## 品牌状态动效

品牌状态动效（[ADR 0029](adr/0029-brand-status-motion.md)）只用于用户发起的动作的状态与结果（通知、资金与签名状态页、握手按钮、复制反馈），不是新的被动提示类别：被动数据加载、懒加载占位、刷新按钮和图表重建继续使用原有的中性转圈或空白占位，`status-motion-surface-contract.test.ts` 登记这些保留位置及理由。

## 账户模式与资金限制

账户标题和模式选项遵循 [账户概要规范](account-overview.md)，桌面与移动复用同一套标签。未知模式使用中性“账户概要”；被动加载期间，账户类型表单保持“确认”名称并禁用提交，不展示连接故障结论。实际用户提交失败仍保留反馈。

资金能力必须区分 `supported`、`unresolved` 与 `unsupported`，不能仅凭 `accountModeReady` 布尔决定限制文案。

- `disabled`、`unifiedAccount`、`portfolioMargin` 属于当前终端支持的模式；可操作性仍由钱包、地区、余额新鲜度和具体动作规则共同决定。
- 明确解析出的 `default`、`dexAbstraction` 使用 `account-mode-unsupported`，保留“移动资金前请选择支持的账户模式”的限制说明。`default` 不能当成 Standard / `disabled`，也不能当成尚未收到数据。
- `default` 是新账号的协议初始状态，页面级宿主会在入金后把它自动设为统一账户（[ADR 0041](adr/0041-automatic-unified-account-for-new-accounts.md)）。数值与可用性不变（权益与余额仍为 0，资金动作的 `available` 仍为假，下单可用性永远不是 success），只有呈现跟随宿主发布的状态：
  - `awaiting-funds`（资金快照完整、当前且确认为空）：看起来与普通空账号相同。下单按钮为「Deposit」，但下单可用性仍为 error，表单与提交照旧阻断；余额页签为“No balances found. Deposit funds to start trading.”及存款入口；提款/划转仍禁用，原因改为“New accounts are set to Unified account automatically after the first deposit.”；交易面板的账户模式显示统一账户，账户类型弹窗预选统一账户、选项与确认禁用并显示同一句说明。这里的空账号结论来自完整快照，不是来自模式本身。
  - `pending`（已入金，自动设置仍可能发生，含宿主尚未发布状态的首帧）：被动加载。下单可用性为 loading，桌面余额页签为忙碌占位，移动余额页签为忙碌的待定状态，不显示“请选择账户模式”。
  - `manual`（Agent-only 会话、builder 地址、已有订单历史或读取失败、法律状态不允许、外部钱包尚未建立 Agent、尝试用尽或被交易所终局拒绝）：保留改动前的呈现与手动选择。桌面余额页签显示“请选择支持的账户模式”，手机余额页签保持静默的待定状态；弹窗预选统一账户，钱包会话可直接确认，Agent-only 会话仍禁用并显示需到桌面的原因。缓存摘要显示有余额而当前快照显示为空时也归入这一类，不会停在加载。
  - `dexAbstraction` 不受影响：始终是手动选择，不预选。
- 缺少模式、未识别值以及 HTTP / WebSocket 模式冲突使用 `account-mode-unresolved`，保持静默并禁用动作。当前归一化的 `unknown` 也包括来源冲突，不能把它全部当成已确认的不支持模式。
- 两类禁用原因不改变 `available`、资金分类或提交前账户模式与身份复核。恢复和切换模式不得卸载已打开的弹窗或丢失输入草稿。
- 桌面与移动持仓均安静展示读取状态。读取错误/过期优先于加载占位，且不标记为正在加载；订阅已 active 但首份快照未到达的保护必须保留，错误、过期和未知快照不得显示确认空持仓。

依据：2026-09-09 核对 [Hyperliquid 账户模式文档](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes)，Standard / Manual、统一账户与组合保证金为当前模式，DEX abstraction 已停用；[官方 Python SDK 示例](https://github.com/hyperliquid-dex/hyperliquid-python-sdk/blob/master/examples/user_abstraction.py) 将 `default` 明确作为 Agent 设置模式前的状态。项目锁定的 [SDK 0.33.3 userAbstraction](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/info/_methods/userAbstraction.ts) 返回类型包含 `default`；该方法只校验请求并直接返回传输结果，因此终端仍须防御未识别响应。以上区分仅修正展示与原因分类，不新增模式支持。2026-10-12 的 [ADR 0041](adr/0041-automatic-unified-account-for-new-accounts.md) 同样不新增对 `default` 的支持：它让新账号离开 `default`，并规定离开之前各处显示什么。

## 数据与操作边界

- 移动持仓工具栏保留独立的「全部平仓」入口与单一展开/收起切换。未连接、首快照未到达、错误、过期、市场映射不全或同账户存在平仓会话时禁用入口，按钮仍显示静态动作名称；原因仅作辅助技术描述，不显示被动错误。确认空仓位保持原有空态。筛选为空不等于账户空仓位：入口按全账户可用性判断，确认面说明包含筛选隐藏的仓位并列出实际目标，见[全部平仓说明](mobile-close-all-plan.md)。
- 数据模型继续保留 loading、error、stale、unavailable 等状态，供重试、恢复与安全检查使用。删除的是不合理的展示代码，不是数据校验。
- 订阅状态 `active` 与首份快照存在必须分别检查。重新连接期间还必须检查新鲜度；账户、网络或市场身份不匹配的数据不能作为当前数据。
- 操作是否可执行由 `available`、`canSubmit` 等显式布尔值决定，不得使用 `!!unavailableReason` 作为权限判断。
- 不得为了隐藏提示而跳过 Agent、主钱包匹配、账户模式、合法性、地区、资金快照、订单簿新鲜度或金额校验。
- 资金列表只有在当前快照完整成功时才允许显示空余额及充值引导；历史缓存为空时不得声称“没有记录”。
- 静态历史记录可以保留已加载内容；其刷新失败不应新增横条或暴露 `error.message`。
- 刷新或重连时保持已打开的操作弹窗及输入草稿；禁用提交，不得因为列表占位切换而卸载弹窗。
- 充值弹窗的余额、费用与地址准备状态遵循同样规则：缺少数据时使用占位或地址骨架；读取失败可保留中性的“重试”，不得显示原始错误。重试只读且必须隔离旧弹窗上下文；用户主动重试失败可以显示该次请求反馈。
- 数据提示与用户操作反馈分离。撤单、改单、平仓、划转、兑换、充值提现提交后的错误反馈必须保留。

## 受约束的入口

- 桌面最近成交、账户概要、余额、持仓、当前委托、TWAP 与交易/委托/资金费用历史使用相同的静默数据恢复规则。最近成交与当前委托只显示当前有效快照；历史列表可保留已加载记录，但失效空快照不得得出“没有记录”的结论。TWAP 历史保留中性的主动重试和分页控件，不再插入被动警告条。充值提现历史保留主动重试和已确认显示上限说明。详见 [加载体验审查](terminal-loading-audit.md)。
- 移动端账户概览、余额、持仓、当前委托、TWAP 当前/历史/成交列表。
- 成交历史、委托历史、资金费用、充值提现记录。
- 下单面板的可用余额、主操作按钮与地区检查状态。
- 移动订单簿、最近成交、资产组合图表。
- 资金费率历史图（桌面图表区与手机行情区的 Funding 页签，桌面同样适用）：首次加载、重试和惰性块加载为空白绘图区加 `aria-busy` 与读屏专用加载说明；首次失败只给中性「重试」，不显示原因；已加载的非空快照刷新失败时静默保留；离线保持空白；只有分页未截断、当前键、最近一次请求成功、未超过 5 分钟新鲜期（取本地单调时钟与墙钟中较大的年龄，墙钟退到接收时间之前即视为过期，系统时间回拨不会延长）、没有刷新在进行或暂停且在线时的空快照显示「暂无资金费率历史」；视图可见期间空快照一过期就自动刷新（非空快照不轮询），刷新失败只给中性「重试」，刷新中、页面在后台尚未刷新、暂停或离线时保持空白。它使用上表已有的类别，不新增被动提示类别；详见[资金费率历史](market-funding-history.md)。
- 移动端使用的兑换、发送、划转、充值提现、仓位设置和平仓弹窗。
- 资金费率对比页（`/fundingComparison`，桌面与手机）：首份快照、市场目录或离线等待期间只显示数据骨架与 `aria-busy`；首份快照失败、格式不符或市场目录失败时，数据区只保留中性的「重试」按钮，不显示错误文字或警告图标；已有非空快照的刷新失败只在快照自本地接收起不到 120 秒（两个刷新周期，以本地单调时钟计龄，本地墙钟年龄只会让它更早失效，系统时间回拨不会延长）时保留原数据且不提示，满 120 秒或查询因离线暂停时数据区换成骨架或中性「重试」，不显示旧数值；只有解析成功、在该时限内、目录就绪且最近一次请求成功的空快照才显示「暂无资金费率对比数据」；搜索无匹配单独显示为搜索结果。缺少换算间隔或资产上下文的数值使用 `--` 占位；Hyperliquid OI 另外只在持仓量所在的资产上下文来自当前实时订阅（`useMarketsInfo().perpContextsLive`，未送达、过期、失败或恢复中都不算；本地不保存行情快照，见 [ADR 0047](adr/0047-no-local-market-stats-snapshot.md)）且该市场标记价格实时（与行情头同一规则）时显示，否则为 `--` 并在两个排序方向都排在最后，资金费率照常显示。详见 [资金费率对比页](funding-comparison.md)。
- 质押（`/staking`）、推荐（`/referrals`）、金库列表（`/vaults`）与金库详情（`/vaults/<地址>`），桌面与手机相同（2026-11-01，审查项 E5）。每个数据来源（质押的验证人与六个账户查询、推荐快照、金库公开列表、账户金库份额与领先金库、金库详情）按 `lib/passive-query-state.ts` 分为四态：`loading`（还没有可用数据、没有失败）为空白或既有骨架加 `aria-busy` 与读屏说明；`failed`（没有可用数据且最近一次请求失败或响应格式不符）时数据区只有中性「Retry」，没有错误文字、警告图标或 `role="alert"`，金库详情另保留「Back to Vaults」导航；`ready`（最近一次请求成功，可以正在后台刷新）照常显示数据、空列表结论与操作，金库存款、提款按钮不再因后台刷新禁用；`retained` 按上表静默保留本页收到过的数据，质押页在操作按钮旁、推荐页在内容顶部、金库详情在存款与提款按钮下方提供中性「Retry」，金库列表保留已显示的行，刷新入口仍是原有的「Refresh」；筛选或搜索结果为空时，只有公开列表为 `ready`，且账户筛选（Deposited、Leading）的账户份额与领先金库也为 `ready`，才显示「No Vaults in this filter」或搜索的「No matching Vaults」，否则只给中性「Retry」。推荐的领取记录是历史列表：加载时为空白加 `aria-busy` 与读屏说明，读取失败只给中性「Retry」，已加载的记录在刷新失败后保留，「No recent reward claims.」只在最近一次快照成功且没有刷新在进行（`useAccountLedger().canConfirmEmpty`）时出现。不显示被动刷新文字或转圈（原「Refreshing staking data…」「Refreshing referral data…」「Refreshing Vault data. Actions are temporarily unavailable.」与领取记录的「Loading recent reward claims…」可见文字）。操作只由可用性布尔值禁用：质押的四个操作要求账户快照为 `ready`，委托与解除委托另要求验证人列表为 `ready`；推荐的领取、创建与使用邀请码要求推荐快照为 `ready`；金库存款要求详情为 `ready`，提款另要求账户份额为 `ready`（`deriveVaultActionsAvailability`）；详情或份额保留期间，已打开的存款或提款弹窗停在输入步骤（`canReview` 为假），已在复核步骤的确认按钮与确认处理都暂停（`canConfirm` 为假，`confirm()` 直接返回），刷新成功后恢复，弹窗本身与输入不卸载；弹窗在输入与复核步骤另给一个中性「Retry」（与页面的 Retry 是同一个重新读取，只在 `needsRetry` 时出现），因为阻断式弹窗盖住了页面上的 Retry，确认前的预检读取失败后也要能在弹窗里恢复，而不必关掉弹窗丢掉金额。只有已确认的限制显示说明（地区受限、Agent-only 会话、金库已关闭、不接受存款、未连接 owner、提款锁定、没有可提金额、「No unclaimed rewards are currently available.」只在推荐快照为 `ready` 时）；地区检查中或无法确认、详情或份额加载中或读取失败、刷新中这类被动原因不显示文字。用户发起的提交、失败与待确认结果仍按原有弹窗与通知反馈，执行路径各自的新鲜数据预检（质押 `loadStakingPreflightSnapshot`、推荐提交前 `refetchReferral`、金库 `verifyVaultActionPreflight`）不变。与官方终端的差异（2026-10-31 生产包）：官方质押页读取失败时弹出错误通知（`provideDelegations-CJcxKbEv.js`：`An error occurred while fetching validators`），推荐页读取失败时整页显示 `Unexpected error loading referral data`（`Referrals-DzsUY3Ry.js`），未知余额显示 0；本终端按本规范保持静默、只给中性重试并显示 `--`。官方金库详情刷新失败时保留上一份详情、首次失败时整页空白（`VaultDetailsPage-NS0z_PHx.js` 只在响应含 `response` 时更新），金库列表失败时列表为空（`VaultMainPage-Biimvm9f.js`）；本终端同样保留已收到的数据，首次失败时给中性重试。

## 验证与防回归

1. 首次进入：包括 `active` 但 `data === undefined`，不得出现错误文字、空账户结论或错误的充值引导。
2. 切换账户/市场、重连及数据过期：不得闪现旧账户空状态，不得使过期数据可操作。
3. 错误与恢复：被动读取失败保持安静，恢复后显示真实数值和记录。
4. 当前成功的空快照：仍可显示准确的空状态。
5. 操作安全：缺数据时点击禁用动作不能提交请求；真实用户操作失败仍有反馈。
6. 布局：检查普通手机、窄屏以及共享弹窗的桌面布局，不得残留空警告条或移动操作区域。
7. 自动检查：运行相关行为测试和移动数据提示契约检查，再运行 Biome 与 TypeScript 检查。
8. 模式限制：覆盖未解析、来源冲突、明确不支持、支持模式、地区限制和恢复；在手机账户页及共享划转/提款入口验证提示、禁用状态与请求未发送，不能只检查源码或构造好的 reason。

新增被动数据提示必须先明确修改本规范并取得产品需求依据；不得仅为了调试或展示内部状态而添加用户可见提示。市价平仓的「仓位数量与开窗时不同」提示的产品依据与取舍见 [ADR 0017](adr/0017-market-close-confirmed-size-ceiling.md)；它由开窗快照与当前有效仓位纯推导，数量回到开窗值时提示消失，不记录「期间曾变化」。仓位 TP/SL 大额滑点提示的产品依据是与官方终端对齐：官方持仓 TP/SL 弹窗读取同一接口，在仓位价值超过分档上限时显示滑点警告，读取失败时不显示任何内容；条件、与协议规格的差异和取舍见 [TP/SL 大额滑点提示](position-tpsl-slippage-warning.md)。它由成功的分档表与弹窗正在使用的实时仓位（价值与当前杠杆）纯推导，加载、失败和格式异常都保持静默；例外只在展示层面，共两处：数量滑杆手势期间保持手势开始时的有无，手势结束后再按推导结果显示，以免滑杆行在指针下移动（[滑杆手势](slider-interactions.md)）；弹窗外壳关闭（会话结束后的退出动画，或点击确认后外壳关闭、提交仍在后台进行）时保持关闭那一刻的有无，退出期间才到达的成功结果或刷新失败都不再改变它。

手机成交历史筛选的补拉对齐官方终端：官方 2026-10-31 生产包（`config-BhZylSmU.js`）的筛选行在任一筛选开启时调用 `ensureCompleteHistory`，请求完整的 `userFills`，与 WebSocket 数据按 `` `${time}-${coin}-${tid}` `` 去重合并（实时数据优先），列表同样只截取 30 条。官方在补拉加载中和失败时也直接显示「No results match your filters.」；本终端按上表更严：无匹配结论要求补拉成功且当前，失败只给中性「Retry」，达到 2,000 条上限时写明检查范围。手机委托历史与资金费的筛选仍只在各自最近 30 条里查找（官方同样分别补拉 `historicalOrders` 与 `userFunding`），这一差距尚未处理。另有两点尚未处理：补拉快照为空（当时账户没有成交）、之后的新成交又超过订阅保留上限（200 条）时，缺口判断识别不出被挤掉的成交；最近的实时成交里没有普通成交时，页签显示「No fills found.」且不显示筛选行，无法开启筛选去找更早的成交（官方始终显示筛选）。

未平仓量上限说明属于「已确认的市场限制」，不是被动数据提示。产品依据是官方终端对等（2026-09-27 对 `app.hyperliquid.xyz` 生产包的静态阅读：提交限价类订单时若当前市场在 `perpsAtOpenInterestCap` 集合中则拦截并提示同一句话）。它只在当前、成功、同一账户的快照明确列出该市场时出现；未知状态放行且不显示任何文字，交易所仍是最终裁决，取舍见 [ADR 0023](adr/0023-open-interest-cap-advisory-check.md)。HIP-3 资产信息弹窗里的「未平仓量上限」一行是用户打开弹窗后的只读元数据，加载、失败、空值或畸形响应时整行不出现，也不显示加载或错误文字。

## 回归入口

`apps/terminal/src/lib/tests/mobile-data-presentation-contract.test.ts` 检查已移除的移动文案、共享弹窗被动警告和规范入口，并扫描质押、推荐与金库目录：不得出现已移除的被动刷新、读取失败与未知数值文案（含 `0 HYPE` 占位）；`role="alert"` 与警告图标只留在逐个登记理由与次数的已确认状态和操作反馈里（金库未找到、金库操作弹窗的失败与未知结果、操作弹窗与金库详情的风险说明、分类不可用的警告），新增一处即失败；金库操作按钮不得由说明文字是否存在决定禁用；`user-positions-readiness.test.tsx` 验证订阅确认与首份数据的区别。余额、委托、TWAP、历史和仓位弹窗的组件测试同时验证静默展示、恢复和操作保护。

质押、推荐与金库页：`passive-query-state.test.ts` 覆盖四态与合并规则；`staking-passive-data.test.tsx`、`referral-passive-data.test.tsx` 与 `vault-passive-data.test.tsx` 用真实的控制器、视图与 QueryClient（只替换传输层）验证首次失败只有中性重试、刷新失败保留本页收到的数据并禁用依赖它的操作、进入页面前缓存的数据在失败后不保留、后台刷新时没有文字且操作可用、`--` 占位，以及失败或保留的快照不得出「没有记录」结论；`use-referrals.test.tsx`、`vaults-domain.test.ts` 与 `use-vault-action-controller.test.tsx` 分别钉住推荐快照的当前性、`deriveVaultActionsAvailability` 的 `detailCurrent` 与被动原因分类、保留详情时暂停复核步骤、保留详情或份额未验证时暂停已在复核步骤的确认；`vault-passive-data.test.tsx` 另钉住公开列表或账户份额保留时不下筛选与搜索的空结论，以及详情、份额与公开列表在进入页面前缓存、页面自己的请求失败时不被保留；`vault-action-modal.test.tsx` 与 `vault-detail-page-outcomes.test.tsx` 钉住弹窗的确认按钮跟随 `canConfirm`、数据 Retry 只在页面需要重试时出现；`referral-ui-contract.test.ts` 与 `status-motion-surface-contract.test.ts` 登记已移除的刷新文字与转圈。

`mobile-fill-filter-backfill.test.tsx` 用真实的手机成交页签、`useUserFills`、`useTradeHistory` 与 QueryClient 验证：只在筛选开启时补拉（三种筛选各自都会触发，只开「Type」时也补拉）、按 `(time, coin, tid)` 合并且保留实时副本、补拉之后到达的匹配成交被挤出最近 30 条后仍显示、实时成交与快照衔接不上时（包括被 TWAP 成交挤占时）只给中性重试且重试后恢复结论、订阅里没有普通成交时已开启的筛选仍显示快照里的匹配、加载与重新请求时安静、失败只给中性重试、实时快照过期时不下结论、2,000 条上限的说明，以及清除筛选后回到实时列表；`fill-filter-presentation.test.ts` 覆盖其判定函数与衔接判断。

`open-interest-cap.test.ts` 验证上限集合只在活跃、有数据、未过期、同一账户的快照上得出，其余状态为未知；`mobile-trade-size-validation-a11y.test.tsx` 与 `trade-panel-open-interest-cap.test.tsx` 在真实移动与桌面下单面板上验证已确认上限时的限制说明、禁用与未提交，以及未知或未上限时保持安静；`market-asset-info.test.tsx` 验证 HIP-3 上限行在加载、失败、空值和畸形响应时不出现。

`market-selector-quote.test.ts`、`token-selector-row.test.tsx` 与 `token-selector-wiring.test.tsx` 验证市场选择器的价格只来自实时价格上下文、涨跌只对实时资产上下文的 `prevDayPx` 计算，失效时为占位，排序用同样的值；`use-markets-info-subscriptions.test.tsx` 验证首帧前不读本地快照、每行的 `assetContextLive`，并把真实 `useMarketsInfoInternal` 的行交给真实选择器行渲染。

`account-mode-query.test.ts` 验证模式来源解析与三态分类；`mobile-account-view.test.tsx`、`funds-action-balances.test.tsx` 和 `deposit-modal-withdrawal-routing-guard.test.tsx` 使用真实资金能力计算验证未解析静默、确认限制、按钮禁用和未发起请求。`desktop-positions-readiness.test.tsx` 连接真实持仓 hook 与桌面页，验证首快照等待、错误优先和恢复，不依赖源码匹配。

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/mobile-data-presentation-contract.test.ts \
  src/lib/tests/account-mode-query.test.ts \
  src/lib/tests/funds-action-availability.test.ts \
  src/lib/tests/funds-action-balances.test.tsx \
  src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx \
  src/lib/tests/desktop-positions-readiness.test.tsx \
  src/lib/tests/user-positions-readiness.test.tsx \
  src/lib/tests/mobile-account-view.test.tsx \
  src/lib/tests/deposit-empty-balances-entry.test.tsx \
  src/lib/tests/mobile-orders-card.test.tsx \
  src/lib/tests/mobile-twap-card.test.tsx \
  src/lib/tests/mobile-history-cards.test.tsx \
  src/lib/tests/mobile-fill-filter-backfill.test.tsx \
  src/lib/tests/fill-filter-presentation.test.ts \
  src/lib/tests/open-interest-cap.test.ts \
  src/lib/tests/market-asset-info.test.tsx \
  tests/mobile-trade-size-validation-a11y.test.tsx \
  tests/trade-panel-open-interest-cap.test.tsx \
  src/lib/tests/funding-history-panel.test.tsx \
  src/lib/tests/funding-history-panel-snapshot.test.tsx \
  src/lib/tests/market-selector-quote.test.ts \
  src/lib/tests/token-selector-row.test.tsx \
  src/lib/tests/token-selector-wiring.test.tsx \
  src/lib/tests/use-markets-info-subscriptions.test.tsx \
  src/lib/tests/passive-query-state.test.ts \
  src/components/staking/__tests__/staking-passive-data.test.tsx \
  src/lib/tests/referral-passive-data.test.tsx \
  src/lib/tests/vault-passive-data.test.tsx \
  src/lib/tests/use-referrals.test.tsx \
  src/lib/tests/vaults-domain.test.ts \
  src/lib/tests/referral-ui-contract.test.ts \
  src/lib/tests/status-motion-surface-contract.test.ts
```

契约测试的文案清单不能替代行为审查；新增入口仍须覆盖未知、失败、恢复和确认空快照，检查禁用逻辑是否独立于文案。

## 行情标题的数据来源

移动端顶部价格与桌面现货价格统一取当前有效资产上下文的 `midPx`，仅在其缺失或为 null 时回退到同一上下文的 `markPx`。价格和 24 小时变化使用同一上下文的 `prevDayPx`，不混入 BBO、allMids 或其他市场的值。失效、错市场及缺少接收时间的上下文保持安静占位；非法或非正 mid 不作为正常空值回退。数据源、市场、网络切换或重连时建立新的颜色反馈基准。桌面合约“标记”仍使用标记价，盘口中间价仍只使用服务端 mid。

市场选择器（桌面弹层与手机全屏列表是同一组件 `TokenSelectorRow`，共用 `useTokenSelector` 与列定义）按同一规则取价（`domain/market/selector-quote.ts`）：

- 价格取该行实时价格上下文（`fastAssetCtxs`，合并进 `useMarketsInfo` 的行）的 `midPx`，仅在它缺失或为 null 时回退到同一上下文的 `markPx`；上下文须为 `success`、标记价为正、本地接收不超过 `LIVE_MARK_MAX_STALE_MS`（`isLiveMarkPriceReady`，与行情头相同），否则价格与涨跌都显示既有占位 `-`。共享的快价解析（`resolveFastMarketPrice`）只把正数或 null 的 mid 放进行里，非法或非正的 mid 到不了选择器，在那里按缺失处理；2026-11-01 的公开流样本（1,976 个币）里没有这样的 mid，697 个为 null。
- 24 小时涨跌是该价格对同一行 `prevDayPx` 的变化，并要求这份资产上下文来自当前实时帧（行字段 `assetContextLive`：`pac`/`sac` 或回退后的原频道有帧、`active`、未过期，且该行自己的条目已到达）；上下文过期、失败、恢复中或未到达时只显示价格，涨跌为占位。实时价格不与过期的 `prevDayPx` 拼在一起（[ADR 0047](adr/0047-no-local-market-stats-snapshot.md)）。
- 按价格、按 24 小时涨跌排序用同样的值（Big.js 比较），没有值的行在两个方向都排在最后。市值与未平仓量仍按 `markPx` 计算。
- 位数与官方选择器相同：至多五位有效数字，小数位不超过永续 `6 - szDecimals`、现货 `8 - szDecimals`，保留尾零（与行情头共用 `getTradePriceDecimals`）；桌面的涨跌额取当前价与前日价两者中较多的位数。涨跌为零时与官方一样显示 `+`（`+0.00%`），颜色为默认文字色。
- 与官方的差异：官方选择器在 mid 缺失时价格显示 `--`、涨跌按 0 计算显示 `-100.00%`（2026-10-31 生产包：`CoinSelector.provider-hKfAGsw-.js` 的 ``midPx:u?.midPx||0``；`series-BBY5PmtX.js` 的 ``lastPrice:{value:w??0,element:w?`${ne(w,v,P)}`:`--`}``；涨跌格式化 `config-BhZylSmU.js` 的 `Fce` 只在 `G3(prev)||G3(cur)||prev===0` 时显示 `--`，`G3` 只判断 null 与 NaN）；本终端按行情头规则回退到同一上下文的标记价并据此计算涨跌。价格恰为 1,000 时官方用浮点 `Math.log(x)/Math.log(10)`（得 2.9999999999999996）算出 2 位小数，本终端按精确的五位有效数字得到 1 位。官方不检查行情新鲜度，本终端按上文显示占位。

来源审查与验证范围见 [价格来源审查](price-source-audit.md)。
