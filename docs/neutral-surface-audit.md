# 中性底色使用审查

状态：源码审查已记录；视觉简化建议待实施。本轮没有修改组件或主题样式。

2026-09-21 补注：`position-close-dialog-ui.tsx` 已拆分并删除，下文指向它的文件名、行号与链接只对基线有效；`PositionCloseSummary` 现位于 `apps/terminal/src/components/trade/positions/position-close-summary.tsx`，弹窗外壳位于 `position-close-dialog-shell.tsx`。

日期：2026-09-12。源码基线：`43ce177c384377c3f1f84a92623d4892b0859624`。起点是用户在 `/trade` 资产资料弹窗中指出的“标的资产 / 最大杠杆”卡片。截图只证明这个弹窗的当时显示状态，不能代表其他页面、主题和设备已经验收。

## 结论与范围

这类底色并非资产资料弹窗独有。三个卡片令牌在终端浅色主题下都是 `#F7F9FB`，用于只读摘要、选择状态、二维码与地址区、移动端折叠表头和加载占位。只读摘要可以优先减少卡片装饰；不能把共享令牌直接改成透明，否则会同时改变这些不同用途。

本次从令牌定义、直接引用、共享组件调用和条件分支四个方向核对，并扩展到相近的 hover 与 `fill-weak/weaker`。扫描 `apps/`、`packages/` 下 TS/TSX、JS/JSX/MJS/CJS、CSS/SCSS、HTML、Astro、Vue、Svelte 源文件；排除 `public/`、`locales/`、`tests/`、`*.test.*`、`*.spec.*` 和 `routeTree.gen.ts`。另外补查 CSS 变量别名与颜色字面量。

| 检索族 | 匹配源代码行 | 文件 | 样式词出现次数 |
| --- | ---: | ---: | ---: |
| C：`bg-{trading-panel,market-close,api-wallet}-card` | 42 | 28 | 43 |
| H：相同三个前缀的 `-hover` | 78 | 40 | 88 |
| F：`bg-fill-weak`、`bg-fill-weaker` | 127 | 58 | 133 |
| 三族合并去重 | 245 | 106 | 264 |

同一行可能包含多个状态词或多个族，所以行数不能直接相加。这些是**源码声明数量，不是页面数、实际渲染卡片数或问题数量**。附录逐文件列出全部匹配行；共享消费者和非 class 的 CSS 用法另列。完整性限于上述检索范围，不包含第三方认证界面、TradingView 内部界面、图片中的底色，以及其他未列入的表面令牌。

## 颜色实际上如何解析

| 令牌 | 终端浅色 | 终端深色 | 定义与意义 |
| --- | --- | --- | --- |
| `trading-panel-card` | `#F7F9FB` | `var(--fill-weak)` | `styles.css:345,541,683`，下单与市场资料卡片 |
| `market-close-card` | `#F7F9FB` | `var(--fill-weak)` | `styles.css:319,516,657`，交易操作与资金卡片 |
| `api-wallet-card` | 随 `market-close-card` | 随 `market-close-card` | `styles.css:160,590`，不是独立固定颜色 |
| 三族 `-hover` | `#F1F4F8` | `var(--fill-press)` | `styles.css:161,320,346,517,542`；也被直接用作徽标和占位底色 |
| `fill-weak` | `#0015800A`，半透明 | `#FFFFFF0F`，半透明 | `styles.css:234,431`；实际颜色取决于下层表面 |
| `fill-weaker` | `#00158005`，半透明 | `#FFFFFF08`，半透明 | `styles.css:235,432`；不等于固定 `#F7F9FB` |

以上 `styles.css` 指 [终端主题](../apps/terminal/src/styles.css)。卡片边框另外使用 `*-stroke-card`，浅色为 `#E3E8EE`。背景、边框、圆角是三项独立装饰。移除背景后，如果仍保留边框和大圆角，嵌套卡片感仍然存在。

深色模态表面、图表画布、网格缝隙及订单簿深度色各有独立契约。本审查不建议修改 `bg-modal`、`bg-overlay`、网格底板或订单簿深度令牌。当前视觉约束见 [UI 入口](ui-ux-guidelines.md) 与 [AGENTS](../AGENTS.md)。

## 优先精简的只读块

以下为设计建议，不是已经实施的变更，也不是交易逻辑缺陷。行号按上述基线固定，完整路径见附录。

| 功能块 | 来源 | 当前用途与建议 |
| --- | --- | --- |
| 资产资料 | `market-asset-info.tsx:391` | 标的资产、最大杠杆等定义列表。最明确的精简点：去掉灰底、装饰边框和圆角，用标签/数值对齐与间距分组；保留不同市场实际提供的资料字段。 |
| 固定杠杆说明 | `margin-mode-modal.tsx:517` | 移动端固定杠杆的简短说明，可直接作为正文；保留说明内容与出现条件。 |
| 调整逐仓保证金摘要 | `position-isolated-margin-modal.tsx:417` | 当前保证金、有效杠杆、强平价。可变为普通摘要列表，保持与可编辑控件的间距。 |
| 持仓 TP/SL 摘要 | `position-tpsl-modal.tsx:1231` | 数量、开仓价、标记价、强平价、未实现盈亏。可去掉外层填充，保留盈亏分隔与数值强调；不涉及下方输入框。 |
| 平仓确认摘要 | `position-close-dialog-ui.tsx:109` | 共享 `PositionCloseSummary`，影响市价平仓、限价平仓和全部平仓；可用无底色列表，保留重点值和操作复核信息。 |
| 充值费用与到账说明 | `unit-deposit-info.tsx:18` | 预计到账、费用、时间等只读说明，可简化外框；保留费用等待与数据就绪判断。 |
| 提现费用与到账摘要 | `withdraw-form.tsx:282` | 提现费、条件性开户费、净到账、预计时间。可简化底色，保留所有金额、路由复核条件与占位值。 |
| API Wallet 操作复核摘要 | `api-wallet-action-modal.tsx:166` | 操作前标签/值列表，可使用普通摘要；同文件的结果不确定核验区须单独处理。 |
| 市场选择器页脚 | `token-selector-content.tsx:397` | 市场数量、排序和更新说明，已有顶部分隔线，可移除重复的灰底层。 |
| API Wallet 授权边界说明 | `api-wallet-view.tsx:153` | 次优先：可减少底色与外框层级，但必须保留授权范围解释及其可发现性。 |

不建议全局更换这些令牌的取舍：逐块简化需要多处修改，但能保留状态识别，避免把交互卡片、加载状态和确认结果一起抹平。若继续实施，应先处理本表，再逐项判断下一节中的边界，而不是批量删除所有 `bg-*-card`。

## 同色但用途不同的全部剩余位置

| 功能块 | 来源行 | 判断 |
| --- | --- | --- |
| API Wallet 结果不确定后的核验信息 | `api-wallet-action-modal.tsx:308` | 保留清晰的核验分组；包含操作标识与核验上下文，不与普通说明一并弱化。 |
| API Wallet 凭证区 | `api-wallet-credential-box.tsx:30` | 地址、密钥展示/隐藏、复制、下载与已保存确认共用区域。保留交互边界；底色本身不提供安全保证。 |
| API Wallet 有效期 | `api-wallet-form.tsx:141` | 移动单选项的 checked 与 hover，保留选择反馈。 |
| 市场选择器行 | `token-selector-row.tsx:180,251` | 桌面/移动行 hover。另有 H 族高亮与选中状态，不能作为常驻装饰删除。 |
| 充值弹窗整块占位 | `deposit-modal-loading-fallback.tsx:86,88,93,101,107,119` | 六处路由、二维码、地址、费用与网络说明占位；应与真实组件一起调整，维持占位可见性与几何稳定。 |
| 法律确认按钮与复选项 | `legal-acceptance-modal.tsx:139,175,211` | 拒绝按钮在桌面的 hover，以及条款/政策选项 hover；保留交互反馈。 |
| 语言与数字格式菜单 | `language-switcher.tsx:83` | 同行两次声明：`aria-current` 与 radio checked；不是两个静态卡片。 |
| 移动订单簿模式 | `mobile-book-view.tsx:790` | 买卖双方/单边视图的当前选择，保留。 |
| 移动列表折叠头 | `mobile-disclosure-header.tsx:15` | 整行可展开，五个业务消费者，见下一节；若减弱底色须仍能识别展开入口。 |
| 桌面资金费、成交、历史订单行 | `funding-tab.tsx:171`、`history-tab.tsx:150`、`orders-history-tab.tsx:294` | 三个表格的 hover，保留状态反馈。 |
| 反向开仓确认说明 | `position-reverse-confirmation-modal.tsx:113` | 请求反向操作时，对无法提供可靠交易前强平价的说明。保留明显且可读的提示，不归为可直接删除的资料卡片。 |
| 共享表头样式 | `positions-panel-table-styles.ts:5` | 转账表头实际采用；订单表头覆盖为 `bg-modal`，见下一节。表头填充有列结构用途，可单独做密度设计。 |
| 账户模式与保证金模式 | `account-mode-modal.tsx:182`、`margin-mode-modal.tsx:142` | 当前选项卡的 selected 状态；不得连同只读说明一起清空。 |
| 充值表单内部占位 | `deposit-form.tsx:371,402` | 费用和网络说明占位，由 `showFundingDestinationPlaceholders` 控制；不是已加载的正文卡片。 |
| 充值二维码与地址 | `funding-address-card.tsx:67,87,106,119` | 分别是二维码占位、地址占位、就绪二维码框、地址/复制区。外框灰色可另评估，但二维码内层白底、留白、尺寸与复制入口必须保持可用。 |
| TP/SL compact 输入分支 | `tp-sl-section.tsx:222` | 源码存在、当前业务调用未启用；不可算作用户当前已经看见的卡片。 |
| 共用交易菜单选择态 | `lib/ui/trading-dropdown.ts:6` | `aria-current` 高亮，保留；消费者见下一节。 |

## 共享组件、覆盖和未启用分支

- `PositionCloseSummary` 的三个消费者：`position-market-close-modal.tsx:232`、`position-limit-close-modal.tsx:327`、`position-close-all-modal.tsx:160`。在共享组件中改动会同时影响这三个对话框；普通下单确认不应被误算成消费者。
- `MobileDisclosureHeader` 的五个消费者：`mobile-position-card.tsx:276`、`mobile-orders-tab.tsx:1257`、`mobile-orders-history-tab.tsx:335`、`mobile-history-tab.tsx:307`、`mobile-funding-tab.tsx:222`。它以覆盖整行的 button 提供展开操作，外围 div 的底色不是静态说明卡片。
- `positionsPanelTableHeaderClass`：`account-transfers-tab.tsx:85` 直接采用；`orders-tab.tsx:1268` 通过 `cn()` 加入后置 `bg-modal`。`lib/cn.ts` 使用 `twMerge`，因此后者不能按共享定义推断为灰色表头。
- 共用交易下拉样式出现在 `trade-header.tsx:148,271` 及 `mobile-book-view.tsx:742`。选中状态从样式常量带入，不能仅搜索 JSX 中的颜色名称。
- `TpSlSection` 的 `compact` 为可选参数；`trade-form-tp-sl.tsx:348` 和 `position-tpsl-modal.tsx:1271` 两个业务调用都未传入 `compact`。前者使用 `framed` 分支。该灰底输入分支是潜在维护范围，不是本次截图问题的当前复现。

## 相近底色也纳入了检查

### H 族不只用于 hover

资产标题中的“永续”和杠杆徽标（`market-asset-info.tsx:328,334`、`token-selector-trigger.tsx:61,65`）直接使用 H 族底色。它们是分类标签，可与资料列表分开决定；不应因名字含 hover 就漏掉。

其他常驻 H 族还包括：市场类型筛选选中项与搜索空结果图标；API Wallet 空列表图标；余额、订单、TWAP 的空状态图标；历史订单状态、成交方向和 Reduce Only 徽标；顶部账户加载占位。相应文件和全部 H 行号在附录。空图标的装饰可简化；选中、状态文字、占位可见性仍须保留。其余 H 声明主要用于按钮、关闭入口、菜单、表格行的 hover、active 或当前选项反馈。

### F 族应用功能块

| 页面/模块 | 已核对的弱底色块 | 建议 |
| --- | --- | --- |
| 推荐奖励 | 推荐码提交摘要、邀请说明、资格说明、四项统计、奖励解释展开区、下级交易者奖励资产列表、推荐码复制框和进度 | 摘要、说明和统计卡片是第二批精简候选；复制入口、展开识别和进度反馈分别保留。 |
| 质押 | 余额分解、指标卡、操作确认、步骤进度、操作核验引用、列表骨架 | 余额与确认摘要可减少装饰；操作核验与进度不能作为普通说明一起弱化。 |
| 金库 | 总 TVL 与详情指标、操作核验区、徽标及骨架 | 指标卡可统一评估层级；核验信息与加载状态单独处理。 |
| 排行榜 | 移动交易者卡、头像、搜索空结果图标与骨架 | 列表卡片有分行用途；可评估用间距/分隔线代替，头像与骨架不是只读说明框。 |
| 资金费/成交/历史订单独立页面 | 表头、状态徽标、表格骨架 | 表头用于列结构，徽标用于状态；不能误当成同一个弹窗卡片问题。 |
| 现货兑换 | 预计到账、汇率/最小到账/滑点摘要，以及金额输入块 | 两组只读摘要是候选；输入区边界及其错误态须保留。 |
| 手机交易授权与配对路由 | 主钱包摘要、就绪结果、不可用说明、审批说明、审核提醒、成功提示、按住显示二维码、二维码、撤销入口 | 混合只读、请求结果和敏感操作；仅钱包摘要可先评估，必须保留明确授权边界、二维码保护与撤销操作。 |
| 充值待恢复转账 | `deposit-form.tsx:480` 的 CCTP 恢复提示 | 请求操作的恢复状态，保留“不要重复提交”含义与可见性。 |
| 交易终端其他控件 | 连接钱包按钮、收藏市场、资产分类、保证金/DEX/划转账户徽标、资产选择、风险进度条、订单 toast、百分比按钮、单位菜单 | 分别是可交互、状态、身份或数值结构，不统一移除。 |
| 文档渲染与共用占位 | Markdown 行内代码/引用/表头、Skeleton、仪表盘骨架 | 内容语义与加载反馈，保留；同色嵌套另按具体页面检查。 |

### 共享 UI 和官网

共享 UI 有 15 个直接含 F 族的组件文件，全部列在附录：中性 Alert/AlertGlobal、Autocomplete/Combobox 已选项、Avatar、Badge/BadgeCount、Card、ProgressIndicator、SegmentedControls、Slider、Table、Tabs、Tag、Toggle。它们包含变体和条件状态：例如 `Card` 的 filled 变体、`Table` 的 striped 变体、`Tabs` 的 pills 变体，不能推断所有调用都渲染灰底。这里登记组件定义，不把未逐一展开的所有消费者算作已视觉验收。

官网的六个 Astro 文件另有 12 行：FeatureSpeed/Features/Trust 图标底座，Footer 行动区及链接 hover，Hero 公告入口/模拟浏览器圆点/地址标签，Markets 卡片 hover。它们使用官网自身主题映射，属于相邻检索范围，不是终端 `#F7F9FB` 卡片的直接消费者。官网 Footer 行动区可另评估装饰密度，其余保留各自的识别或交互用途。

### 不在上述 class 统计中的补充

| 来源 | 作用与结论 |
| --- | --- |
| `apps/terminal/src/styles.css:1295` | 桌面网格拖动占位直接使用 `var(--fill-weak)`；是布局反馈，应保留。 |
| `apps/website/src/styles/global.css:345` | 正文行内代码直接使用 `var(--fill-weak)`；是语义区分，应保留。 |
| `apps/terminal/src/styles.css:304,501,1117,1121,1130` | 订单簿 hover/选中使用独立 `--orderbook-hover`；浅色值与 F 族相同，但有单独的悬浮、选中和对比度契约，应保留。 |
| `position-pnl-share-modal.tsx:287,297` | 收益分享按钮在桌面 hover 使用 `position-share-button-hover`，同为 `#F1F4F8`；保留按钮反馈。分享画布自身是不同底色，不归入浅灰卡片。 |
| `--fill-brand-weak` | 主题中别名指向 `--fill-weak`；补查未发现业务 `bg-fill-brand-weak` 用法，不虚增实际功能块。 |

## 核对方式与后续实施验收

完整 class 检索表达式为 `bg-(?:(?:trading-panel|market-close|api-wallet)-(?:card|hover)|fill-weak(?:er)?)\b`。按前述文件扩展名和排除项对源码逐行匹配，并将结果按文件、族和行号生成附录；另外搜索颜色字面量及原始 CSS 变量引用，检查共享组件调用、参数和后置类名覆盖。附录是此基线的审查证据，未来源码变化后应重新扫描，不能沿用旧行号保证新版本无遗漏。

本轮验证的是清单与源文件匹配、相对链接可解析和工作记忆完整性。没有执行交易、签名、充值、复制私钥或二维码配对，也没有逐页进行深浅色和设备视觉验收；没有修改运行代码，所以未运行应用构建及业务回归测试。当前材料不足以声称所有运行时样式组合或可访问性对比度已通过。

若实施精简，需在实际被修改的桌面和移动布局、深浅主题中检查：只读信息仍易读；输入、选择、悬浮、焦点和禁用态清晰；所有共享消费者同步；加载占位与已加载几何一致；长标签、数字与翻译不溢出；二维码白底/留白和复制按钮可用。验证命令按最终改动选择，工作记录必须区分真实通过与待测项目。

## 全量 class 位置附录

C/H/F 含义见开头。行号链接到当前文件，数字固定对应基线；括号不表示渲染次数。按源码定义保留 hover、条件分支、共享样式和未启用分支，具体判断以前文为准。

<!-- BEGIN NEUTRAL SURFACE INVENTORY -->
| 文件 | C 行 | H 行 | F 行 |
| --- | --- | --- | --- |
| [apps/terminal/src/components/api-wallet/api-wallet-action-modal.tsx](../apps/terminal/src/components/api-wallet/api-wallet-action-modal.tsx) | [166](../apps/terminal/src/components/api-wallet/api-wallet-action-modal.tsx#L166)、[308](../apps/terminal/src/components/api-wallet/api-wallet-action-modal.tsx#L308) | — | [83](../apps/terminal/src/components/api-wallet/api-wallet-action-modal.tsx#L83) |
| [apps/terminal/src/components/api-wallet/api-wallet-credential-box.tsx](../apps/terminal/src/components/api-wallet/api-wallet-credential-box.tsx) | [30](../apps/terminal/src/components/api-wallet/api-wallet-credential-box.tsx#L30) | — | — |
| [apps/terminal/src/components/api-wallet/api-wallet-form.tsx](../apps/terminal/src/components/api-wallet/api-wallet-form.tsx) | [141](../apps/terminal/src/components/api-wallet/api-wallet-form.tsx#L141) | [141](../apps/terminal/src/components/api-wallet/api-wallet-form.tsx#L141) | — |
| [apps/terminal/src/components/api-wallet/api-wallet-list.tsx](../apps/terminal/src/components/api-wallet/api-wallet-list.tsx) | — | [136](../apps/terminal/src/components/api-wallet/api-wallet-list.tsx#L136)、[229](../apps/terminal/src/components/api-wallet/api-wallet-list.tsx#L229) | [86](../apps/terminal/src/components/api-wallet/api-wallet-list.tsx#L86)、[87](../apps/terminal/src/components/api-wallet/api-wallet-list.tsx#L87)、[88](../apps/terminal/src/components/api-wallet/api-wallet-list.tsx#L88)、[91](../apps/terminal/src/components/api-wallet/api-wallet-list.tsx#L91)、[92](../apps/terminal/src/components/api-wallet/api-wallet-list.tsx#L92) |
| [apps/terminal/src/components/api-wallet/api-wallet-view.tsx](../apps/terminal/src/components/api-wallet/api-wallet-view.tsx) | [153](../apps/terminal/src/components/api-wallet/api-wallet-view.tsx#L153) | — | — |
| [apps/terminal/src/components/dashboard/dashboard-shell-skeleton.tsx](../apps/terminal/src/components/dashboard/dashboard-shell-skeleton.tsx) | — | — | [31](../apps/terminal/src/components/dashboard/dashboard-shell-skeleton.tsx#L31) |
| [apps/terminal/src/components/funding-history/funding-history-page.tsx](../apps/terminal/src/components/funding-history/funding-history-page.tsx) | — | — | [154](../apps/terminal/src/components/funding-history/funding-history-page.tsx#L154)、[157](../apps/terminal/src/components/funding-history/funding-history-page.tsx#L157)、[324](../apps/terminal/src/components/funding-history/funding-history-page.tsx#L324) |
| [apps/terminal/src/components/historical-orders/historical-orders-page.tsx](../apps/terminal/src/components/historical-orders/historical-orders-page.tsx) | — | — | [59](../apps/terminal/src/components/historical-orders/historical-orders-page.tsx#L59)、[220](../apps/terminal/src/components/historical-orders/historical-orders-page.tsx#L220)、[223](../apps/terminal/src/components/historical-orders/historical-orders-page.tsx#L223)、[425](../apps/terminal/src/components/historical-orders/historical-orders-page.tsx#L425) |
| [apps/terminal/src/components/leaderboard/leaderboard-view.tsx](../apps/terminal/src/components/leaderboard/leaderboard-view.tsx) | — | — | [359](../apps/terminal/src/components/leaderboard/leaderboard-view.tsx#L359)、[415](../apps/terminal/src/components/leaderboard/leaderboard-view.tsx#L415)、[482](../apps/terminal/src/components/leaderboard/leaderboard-view.tsx#L482)、[523](../apps/terminal/src/components/leaderboard/leaderboard-view.tsx#L523) |
| [apps/terminal/src/components/referrals/referral-action-modal.tsx](../apps/terminal/src/components/referrals/referral-action-modal.tsx) | — | — | [134](../apps/terminal/src/components/referrals/referral-action-modal.tsx#L134) |
| [apps/terminal/src/components/referrals/referral-code-card.tsx](../apps/terminal/src/components/referrals/referral-code-card.tsx) | — | — | [93](../apps/terminal/src/components/referrals/referral-code-card.tsx#L93)、[141](../apps/terminal/src/components/referrals/referral-code-card.tsx#L141)、[165](../apps/terminal/src/components/referrals/referral-code-card.tsx#L165) |
| [apps/terminal/src/components/referrals/referral-dashboard.tsx](../apps/terminal/src/components/referrals/referral-dashboard.tsx) | — | — | [115](../apps/terminal/src/components/referrals/referral-dashboard.tsx#L115)、[173](../apps/terminal/src/components/referrals/referral-dashboard.tsx#L173)、[178](../apps/terminal/src/components/referrals/referral-dashboard.tsx#L178)、[179](../apps/terminal/src/components/referrals/referral-dashboard.tsx#L179)、[180](../apps/terminal/src/components/referrals/referral-dashboard.tsx#L180) |
| [apps/terminal/src/components/referrals/referral-rewards-card.tsx](../apps/terminal/src/components/referrals/referral-rewards-card.tsx) | — | — | [90](../apps/terminal/src/components/referrals/referral-rewards-card.tsx#L90) |
| [apps/terminal/src/components/referrals/referral-summary-cards.tsx](../apps/terminal/src/components/referrals/referral-summary-cards.tsx) | — | — | [19](../apps/terminal/src/components/referrals/referral-summary-cards.tsx#L19)、[28](../apps/terminal/src/components/referrals/referral-summary-cards.tsx#L28)、[37](../apps/terminal/src/components/referrals/referral-summary-cards.tsx#L37)、[46](../apps/terminal/src/components/referrals/referral-summary-cards.tsx#L46) |
| [apps/terminal/src/components/referrals/referred-traders.tsx](../apps/terminal/src/components/referrals/referred-traders.tsx) | — | — | [137](../apps/terminal/src/components/referrals/referred-traders.tsx#L137) |
| [apps/terminal/src/components/staking/staking-action-modal.tsx](../apps/terminal/src/components/staking/staking-action-modal.tsx) | — | — | [134](../apps/terminal/src/components/staking/staking-action-modal.tsx#L134)、[201](../apps/terminal/src/components/staking/staking-action-modal.tsx#L201)、[301](../apps/terminal/src/components/staking/staking-action-modal.tsx#L301) |
| [apps/terminal/src/components/staking/staking-view.tsx](../apps/terminal/src/components/staking/staking-view.tsx) | — | — | [196](../apps/terminal/src/components/staking/staking-view.tsx#L196)、[386](../apps/terminal/src/components/staking/staking-view.tsx#L386)、[387](../apps/terminal/src/components/staking/staking-view.tsx#L387)、[837](../apps/terminal/src/components/staking/staking-view.tsx#L837)、[888](../apps/terminal/src/components/staking/staking-view.tsx#L888)、[889](../apps/terminal/src/components/staking/staking-view.tsx#L889)、[890](../apps/terminal/src/components/staking/staking-view.tsx#L890) |
| [apps/terminal/src/components/trade-history/trade-history-page.tsx](../apps/terminal/src/components/trade-history/trade-history-page.tsx) | — | — | [220](../apps/terminal/src/components/trade-history/trade-history-page.tsx#L220)、[223](../apps/terminal/src/components/trade-history/trade-history-page.tsx#L223)、[412](../apps/terminal/src/components/trade-history/trade-history-page.tsx#L412) |
| [apps/terminal/src/components/trade/chart/token-selector-content.tsx](../apps/terminal/src/components/trade/chart/token-selector-content.tsx) | [397](../apps/terminal/src/components/trade/chart/token-selector-content.tsx#L397) | [202](../apps/terminal/src/components/trade/chart/token-selector-content.tsx#L202)、[260](../apps/terminal/src/components/trade/chart/token-selector-content.tsx#L260)、[356](../apps/terminal/src/components/trade/chart/token-selector-content.tsx#L356) | — |
| [apps/terminal/src/components/trade/chart/token-selector-row.tsx](../apps/terminal/src/components/trade/chart/token-selector-row.tsx) | [180](../apps/terminal/src/components/trade/chart/token-selector-row.tsx#L180)、[251](../apps/terminal/src/components/trade/chart/token-selector-row.tsx#L251) | [181](../apps/terminal/src/components/trade/chart/token-selector-row.tsx#L181)、[182](../apps/terminal/src/components/trade/chart/token-selector-row.tsx#L182)、[253](../apps/terminal/src/components/trade/chart/token-selector-row.tsx#L253)、[254](../apps/terminal/src/components/trade/chart/token-selector-row.tsx#L254) | — |
| [apps/terminal/src/components/trade/chart/token-selector-trigger.tsx](../apps/terminal/src/components/trade/chart/token-selector-trigger.tsx) | — | [8](../apps/terminal/src/components/trade/chart/token-selector-trigger.tsx#L8)、[11](../apps/terminal/src/components/trade/chart/token-selector-trigger.tsx#L11)、[61](../apps/terminal/src/components/trade/chart/token-selector-trigger.tsx#L61)、[65](../apps/terminal/src/components/trade/chart/token-selector-trigger.tsx#L65) | — |
| [apps/terminal/src/components/trade/components/asset-badge.tsx](../apps/terminal/src/components/trade/components/asset-badge.tsx) | — | — | [32](../apps/terminal/src/components/trade/components/asset-badge.tsx#L32) |
| [apps/terminal/src/components/trade/components/command-menu.tsx](../apps/terminal/src/components/trade/components/command-menu.tsx) | — | — | [70](../apps/terminal/src/components/trade/components/command-menu.tsx#L70)、[71](../apps/terminal/src/components/trade/components/command-menu.tsx#L71)、[72](../apps/terminal/src/components/trade/components/command-menu.tsx#L72) |
| [apps/terminal/src/components/trade/components/deposit-modal-loading-fallback.tsx](../apps/terminal/src/components/trade/components/deposit-modal-loading-fallback.tsx) | [86](../apps/terminal/src/components/trade/components/deposit-modal-loading-fallback.tsx#L86)、[88](../apps/terminal/src/components/trade/components/deposit-modal-loading-fallback.tsx#L88)、[93](../apps/terminal/src/components/trade/components/deposit-modal-loading-fallback.tsx#L93)、[101](../apps/terminal/src/components/trade/components/deposit-modal-loading-fallback.tsx#L101)、[107](../apps/terminal/src/components/trade/components/deposit-modal-loading-fallback.tsx#L107)、[119](../apps/terminal/src/components/trade/components/deposit-modal-loading-fallback.tsx#L119) | [28](../apps/terminal/src/components/trade/components/deposit-modal-loading-fallback.tsx#L28) | — |
| [apps/terminal/src/components/trade/components/legal-acceptance-modal.tsx](../apps/terminal/src/components/trade/components/legal-acceptance-modal.tsx) | [139](../apps/terminal/src/components/trade/components/legal-acceptance-modal.tsx#L139)、[175](../apps/terminal/src/components/trade/components/legal-acceptance-modal.tsx#L175)、[211](../apps/terminal/src/components/trade/components/legal-acceptance-modal.tsx#L211) | — | — |
| [apps/terminal/src/components/trade/components/market-asset-info.tsx](../apps/terminal/src/components/trade/components/market-asset-info.tsx) | [391](../apps/terminal/src/components/trade/components/market-asset-info.tsx#L391) | [328](../apps/terminal/src/components/trade/components/market-asset-info.tsx#L328)、[334](../apps/terminal/src/components/trade/components/market-asset-info.tsx#L334) | — |
| [apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx) | — | — | [1190](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx#L1190)、[1209](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx#L1209)、[1364](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx#L1364)、[1380](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx#L1380)、[1398](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx#L1398)、[1445](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx#L1445)、[1459](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx#L1459)、[1527](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx#L1527)、[1586](../apps/terminal/src/components/trade/components/mobile-agent-sync-modal.tsx#L1586) |
| [apps/terminal/src/components/trade/components/spot-market-social-links.tsx](../apps/terminal/src/components/trade/components/spot-market-social-links.tsx) | — | [36](../apps/terminal/src/components/trade/components/spot-market-social-links.tsx#L36) | — |
| [apps/terminal/src/components/trade/components/spot-swap-modal.tsx](../apps/terminal/src/components/trade/components/spot-swap-modal.tsx) | — | — | [462](../apps/terminal/src/components/trade/components/spot-swap-modal.tsx#L462)、[490](../apps/terminal/src/components/trade/components/spot-swap-modal.tsx#L490)、[661](../apps/terminal/src/components/trade/components/spot-swap-modal.tsx#L661) |
| [apps/terminal/src/components/trade/components/wallet-modal.tsx](../apps/terminal/src/components/trade/components/wallet-modal.tsx) | — | — | [24](../apps/terminal/src/components/trade/components/wallet-modal.tsx#L24) |
| [apps/terminal/src/components/trade/header/desktop-utilities-menu.tsx](../apps/terminal/src/components/trade/header/desktop-utilities-menu.tsx) | — | [38](../apps/terminal/src/components/trade/header/desktop-utilities-menu.tsx#L38)、[56](../apps/terminal/src/components/trade/header/desktop-utilities-menu.tsx#L56)、[64](../apps/terminal/src/components/trade/header/desktop-utilities-menu.tsx#L64)、[71](../apps/terminal/src/components/trade/header/desktop-utilities-menu.tsx#L71) | — |
| [apps/terminal/src/components/trade/header/favorites-strip.tsx](../apps/terminal/src/components/trade/header/favorites-strip.tsx) | — | — | [83](../apps/terminal/src/components/trade/header/favorites-strip.tsx#L83)、[84](../apps/terminal/src/components/trade/header/favorites-strip.tsx#L84) |
| [apps/terminal/src/components/trade/header/language-switcher.tsx](../apps/terminal/src/components/trade/header/language-switcher.tsx) | [83](../apps/terminal/src/components/trade/header/language-switcher.tsx#L83) | [63](../apps/terminal/src/components/trade/header/language-switcher.tsx#L63)、[83](../apps/terminal/src/components/trade/header/language-switcher.tsx#L83) | — |
| [apps/terminal/src/components/trade/header/top-nav.tsx](../apps/terminal/src/components/trade/header/top-nav.tsx) | — | [117](../apps/terminal/src/components/trade/header/top-nav.tsx#L117)、[127](../apps/terminal/src/components/trade/header/top-nav.tsx#L127)、[138](../apps/terminal/src/components/trade/header/top-nav.tsx#L138)、[148](../apps/terminal/src/components/trade/header/top-nav.tsx#L148)、[158](../apps/terminal/src/components/trade/header/top-nav.tsx#L158)、[168](../apps/terminal/src/components/trade/header/top-nav.tsx#L168)、[181](../apps/terminal/src/components/trade/header/top-nav.tsx#L181)、[195](../apps/terminal/src/components/trade/header/top-nav.tsx#L195)、[234](../apps/terminal/src/components/trade/header/top-nav.tsx#L234)、[239](../apps/terminal/src/components/trade/header/top-nav.tsx#L239)、[245](../apps/terminal/src/components/trade/header/top-nav.tsx#L245)、[293](../apps/terminal/src/components/trade/header/top-nav.tsx#L293) | — |
| [apps/terminal/src/components/trade/header/user-menu.tsx](../apps/terminal/src/components/trade/header/user-menu.tsx) | — | [260](../apps/terminal/src/components/trade/header/user-menu.tsx#L260) | — |
| [apps/terminal/src/components/trade/market-overview.tsx](../apps/terminal/src/components/trade/market-overview.tsx) | — | [443](../apps/terminal/src/components/trade/market-overview.tsx#L443) | — |
| [apps/terminal/src/components/trade/mobile/mobile-account-view.tsx](../apps/terminal/src/components/trade/mobile/mobile-account-view.tsx) | — | — | [164](../apps/terminal/src/components/trade/mobile/mobile-account-view.tsx#L164) |
| [apps/terminal/src/components/trade/mobile/mobile-balances-tab.tsx](../apps/terminal/src/components/trade/mobile/mobile-balances-tab.tsx) | — | [102](../apps/terminal/src/components/trade/mobile/mobile-balances-tab.tsx#L102)、[164](../apps/terminal/src/components/trade/mobile/mobile-balances-tab.tsx#L164) | — |
| [apps/terminal/src/components/trade/mobile/mobile-book-view.tsx](../apps/terminal/src/components/trade/mobile/mobile-book-view.tsx) | [790](../apps/terminal/src/components/trade/mobile/mobile-book-view.tsx#L790) | [791](../apps/terminal/src/components/trade/mobile/mobile-book-view.tsx#L791) | [1100](../apps/terminal/src/components/trade/mobile/mobile-book-view.tsx#L1100)、[1107](../apps/terminal/src/components/trade/mobile/mobile-book-view.tsx#L1107) |
| [apps/terminal/src/components/trade/mobile/mobile-disclosure-header.tsx](../apps/terminal/src/components/trade/mobile/mobile-disclosure-header.tsx) | [15](../apps/terminal/src/components/trade/mobile/mobile-disclosure-header.tsx#L15) | — | — |
| [apps/terminal/src/components/trade/mobile/mobile-market-bar.tsx](../apps/terminal/src/components/trade/mobile/mobile-market-bar.tsx) | — | [166](../apps/terminal/src/components/trade/mobile/mobile-market-bar.tsx#L166)、[293](../apps/terminal/src/components/trade/mobile/mobile-market-bar.tsx#L293)、[301](../apps/terminal/src/components/trade/mobile/mobile-market-bar.tsx#L301) | — |
| [apps/terminal/src/components/trade/mobile/mobile-order-modification-modal.tsx](../apps/terminal/src/components/trade/mobile/mobile-order-modification-modal.tsx) | — | [90](../apps/terminal/src/components/trade/mobile/mobile-order-modification-modal.tsx#L90) | — |
| [apps/terminal/src/components/trade/mobile/mobile-orders-history-tab.tsx](../apps/terminal/src/components/trade/mobile/mobile-orders-history-tab.tsx) | — | [406](../apps/terminal/src/components/trade/mobile/mobile-orders-history-tab.tsx#L406) | — |
| [apps/terminal/src/components/trade/mobile/mobile-orders-tab.tsx](../apps/terminal/src/components/trade/mobile/mobile-orders-tab.tsx) | — | [1066](../apps/terminal/src/components/trade/mobile/mobile-orders-tab.tsx#L1066) | — |
| [apps/terminal/src/components/trade/mobile/mobile-twap-tab.tsx](../apps/terminal/src/components/trade/mobile/mobile-twap-tab.tsx) | — | [113](../apps/terminal/src/components/trade/mobile/mobile-twap-tab.tsx#L113)、[171](../apps/terminal/src/components/trade/mobile/mobile-twap-tab.tsx#L171)、[238](../apps/terminal/src/components/trade/mobile/mobile-twap-tab.tsx#L238) | — |
| [apps/terminal/src/components/trade/positions/balances-table-styles.ts](../apps/terminal/src/components/trade/positions/balances-table-styles.ts) | — | [9](../apps/terminal/src/components/trade/positions/balances-table-styles.ts#L9) | — |
| [apps/terminal/src/components/trade/positions/funding-tab.tsx](../apps/terminal/src/components/trade/positions/funding-tab.tsx) | [171](../apps/terminal/src/components/trade/positions/funding-tab.tsx#L171) | — | — |
| [apps/terminal/src/components/trade/positions/history-tab.tsx](../apps/terminal/src/components/trade/positions/history-tab.tsx) | [150](../apps/terminal/src/components/trade/positions/history-tab.tsx#L150) | [174](../apps/terminal/src/components/trade/positions/history-tab.tsx#L174) | — |
| [apps/terminal/src/components/trade/positions/orders-history-tab.tsx](../apps/terminal/src/components/trade/positions/orders-history-tab.tsx) | [294](../apps/terminal/src/components/trade/positions/orders-history-tab.tsx#L294) | [73](../apps/terminal/src/components/trade/positions/orders-history-tab.tsx#L73) | — |
| [apps/terminal/src/components/trade/positions/orders-tab.tsx](../apps/terminal/src/components/trade/positions/orders-tab.tsx) | — | [1233](../apps/terminal/src/components/trade/positions/orders-tab.tsx#L1233)、[1421](../apps/terminal/src/components/trade/positions/orders-tab.tsx#L1421)、[1508](../apps/terminal/src/components/trade/positions/orders-tab.tsx#L1508)、[1585](../apps/terminal/src/components/trade/positions/orders-tab.tsx#L1585) | — |
| [apps/terminal/src/components/trade/positions/position-close-dialog-ui.tsx](../apps/terminal/src/components/trade/positions/position-close-dialog-ui.tsx) | [109](../apps/terminal/src/components/trade/positions/position-close-dialog-ui.tsx#L109) | [47](../apps/terminal/src/components/trade/positions/position-close-dialog-ui.tsx#L47) | — |
| [apps/terminal/src/components/trade/positions/position-isolated-margin-modal.tsx](../apps/terminal/src/components/trade/positions/position-isolated-margin-modal.tsx) | [417](../apps/terminal/src/components/trade/positions/position-isolated-margin-modal.tsx#L417) | — | — |
| [apps/terminal/src/components/trade/positions/position-market-filter.tsx](../apps/terminal/src/components/trade/positions/position-market-filter.tsx) | — | [94](../apps/terminal/src/components/trade/positions/position-market-filter.tsx#L94)、[102](../apps/terminal/src/components/trade/positions/position-market-filter.tsx#L102)、[114](../apps/terminal/src/components/trade/positions/position-market-filter.tsx#L114) | — |
| [apps/terminal/src/components/trade/positions/position-reverse-confirmation-modal.tsx](../apps/terminal/src/components/trade/positions/position-reverse-confirmation-modal.tsx) | [113](../apps/terminal/src/components/trade/positions/position-reverse-confirmation-modal.tsx#L113) | [62](../apps/terminal/src/components/trade/positions/position-reverse-confirmation-modal.tsx#L62) | — |
| [apps/terminal/src/components/trade/positions/position-row.tsx](../apps/terminal/src/components/trade/positions/position-row.tsx) | — | [344](../apps/terminal/src/components/trade/positions/position-row.tsx#L344)、[387](../apps/terminal/src/components/trade/positions/position-row.tsx#L387) | [264](../apps/terminal/src/components/trade/positions/position-row.tsx#L264)、[303](../apps/terminal/src/components/trade/positions/position-row.tsx#L303) |
| [apps/terminal/src/components/trade/positions/position-table-styles.ts](../apps/terminal/src/components/trade/positions/position-table-styles.ts) | — | [28](../apps/terminal/src/components/trade/positions/position-table-styles.ts#L28) | — |
| [apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx](../apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx) | [1231](../apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx#L1231) | [1323](../apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx#L1323)、[1337](../apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx#L1337) | — |
| [apps/terminal/src/components/trade/positions/positions-panel-table-styles.ts](../apps/terminal/src/components/trade/positions/positions-panel-table-styles.ts) | [5](../apps/terminal/src/components/trade/positions/positions-panel-table-styles.ts#L5) | — | — |
| [apps/terminal/src/components/trade/positions/positions-tab.tsx](../apps/terminal/src/components/trade/positions/positions-tab.tsx) | — | [326](../apps/terminal/src/components/trade/positions/positions-tab.tsx#L326) | — |
| [apps/terminal/src/components/trade/positions/transfer-modal.tsx](../apps/terminal/src/components/trade/positions/transfer-modal.tsx) | — | — | [293](../apps/terminal/src/components/trade/positions/transfer-modal.tsx#L293)、[312](../apps/terminal/src/components/trade/positions/transfer-modal.tsx#L312) |
| [apps/terminal/src/components/trade/positions/twap-fill-history-table.tsx](../apps/terminal/src/components/trade/positions/twap-fill-history-table.tsx) | — | [82](../apps/terminal/src/components/trade/positions/twap-fill-history-table.tsx#L82) | — |
| [apps/terminal/src/components/trade/positions/twap-history-table.tsx](../apps/terminal/src/components/trade/positions/twap-history-table.tsx) | — | [83](../apps/terminal/src/components/trade/positions/twap-history-table.tsx#L83) | — |
| [apps/terminal/src/components/trade/positions/twap-tab.tsx](../apps/terminal/src/components/trade/positions/twap-tab.tsx) | — | [62](../apps/terminal/src/components/trade/positions/twap-tab.tsx#L62)、[169](../apps/terminal/src/components/trade/positions/twap-tab.tsx#L169) | — |
| [apps/terminal/src/components/trade/tradebox/account-mode-modal.tsx](../apps/terminal/src/components/trade/tradebox/account-mode-modal.tsx) | [182](../apps/terminal/src/components/trade/tradebox/account-mode-modal.tsx#L182) | [183](../apps/terminal/src/components/trade/tradebox/account-mode-modal.tsx#L183) | — |
| [apps/terminal/src/components/trade/tradebox/bridge/asset-selection-screen.tsx](../apps/terminal/src/components/trade/tradebox/bridge/asset-selection-screen.tsx) | — | — | [20](../apps/terminal/src/components/trade/tradebox/bridge/asset-selection-screen.tsx#L20) |
| [apps/terminal/src/components/trade/tradebox/deposit-modal.tsx](../apps/terminal/src/components/trade/tradebox/deposit-modal.tsx) | — | [1506](../apps/terminal/src/components/trade/tradebox/deposit-modal.tsx#L1506) | — |
| [apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx](../apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx) | [371](../apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx#L371)、[402](../apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx#L402) | — | [480](../apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx#L480) |
| [apps/terminal/src/components/trade/tradebox/deposit/funding-address-card.tsx](../apps/terminal/src/components/trade/tradebox/deposit/funding-address-card.tsx) | [67](../apps/terminal/src/components/trade/tradebox/deposit/funding-address-card.tsx#L67)、[87](../apps/terminal/src/components/trade/tradebox/deposit/funding-address-card.tsx#L87)、[106](../apps/terminal/src/components/trade/tradebox/deposit/funding-address-card.tsx#L106)、[119](../apps/terminal/src/components/trade/tradebox/deposit/funding-address-card.tsx#L119) | — | — |
| [apps/terminal/src/components/trade/tradebox/deposit/unit-deposit-info.tsx](../apps/terminal/src/components/trade/tradebox/deposit/unit-deposit-info.tsx) | [18](../apps/terminal/src/components/trade/tradebox/deposit/unit-deposit-info.tsx#L18) | — | — |
| [apps/terminal/src/components/trade/tradebox/deposit/withdraw-form.tsx](../apps/terminal/src/components/trade/tradebox/deposit/withdraw-form.tsx) | [282](../apps/terminal/src/components/trade/tradebox/deposit/withdraw-form.tsx#L282) | — | — |
| [apps/terminal/src/components/trade/tradebox/margin-mode-modal.tsx](../apps/terminal/src/components/trade/tradebox/margin-mode-modal.tsx) | [142](../apps/terminal/src/components/trade/tradebox/margin-mode-modal.tsx#L142)、[517](../apps/terminal/src/components/trade/tradebox/margin-mode-modal.tsx#L517) | [143](../apps/terminal/src/components/trade/tradebox/margin-mode-modal.tsx#L143) | — |
| [apps/terminal/src/components/trade/tradebox/order-confirmation-modal.tsx](../apps/terminal/src/components/trade/tradebox/order-confirmation-modal.tsx) | — | [69](../apps/terminal/src/components/trade/tradebox/order-confirmation-modal.tsx#L69) | — |
| [apps/terminal/src/components/trade/tradebox/order-toast.tsx](../apps/terminal/src/components/trade/tradebox/order-toast.tsx) | — | — | [73](../apps/terminal/src/components/trade/tradebox/order-toast.tsx#L73)、[252](../apps/terminal/src/components/trade/tradebox/order-toast.tsx#L252) |
| [apps/terminal/src/components/trade/tradebox/price-input-with-percent.tsx](../apps/terminal/src/components/trade/tradebox/price-input-with-percent.tsx) | — | — | [100](../apps/terminal/src/components/trade/tradebox/price-input-with-percent.tsx#L100)、[152](../apps/terminal/src/components/trade/tradebox/price-input-with-percent.tsx#L152) |
| [apps/terminal/src/components/trade/tradebox/tp-sl-section.tsx](../apps/terminal/src/components/trade/tradebox/tp-sl-section.tsx) | [222](../apps/terminal/src/components/trade/tradebox/tp-sl-section.tsx#L222) | [501](../apps/terminal/src/components/trade/tradebox/tp-sl-section.tsx#L501) | — |
| [apps/terminal/src/components/trade/tradebox/trade-form-tif.tsx](../apps/terminal/src/components/trade/tradebox/trade-form-tif.tsx) | — | [45](../apps/terminal/src/components/trade/tradebox/trade-form-tif.tsx#L45) | — |
| [apps/terminal/src/components/ui/skeleton.tsx](../apps/terminal/src/components/ui/skeleton.tsx) | — | — | [23](../apps/terminal/src/components/ui/skeleton.tsx#L23)、[34](../apps/terminal/src/components/ui/skeleton.tsx#L34) |
| [apps/terminal/src/components/vaults/vault-action-modal.tsx](../apps/terminal/src/components/vaults/vault-action-modal.tsx) | — | — | [304](../apps/terminal/src/components/vaults/vault-action-modal.tsx#L304)、[331](../apps/terminal/src/components/vaults/vault-action-modal.tsx#L331) |
| [apps/terminal/src/components/vaults/vault-detail-view.tsx](../apps/terminal/src/components/vaults/vault-detail-view.tsx) | — | — | [475](../apps/terminal/src/components/vaults/vault-detail-view.tsx#L475) |
| [apps/terminal/src/components/vaults/vaults-list.tsx](../apps/terminal/src/components/vaults/vaults-list.tsx) | — | — | [103](../apps/terminal/src/components/vaults/vaults-list.tsx#L103)、[448](../apps/terminal/src/components/vaults/vaults-list.tsx#L448)、[471](../apps/terminal/src/components/vaults/vaults-list.tsx#L471) |
| [apps/terminal/src/components/vaults/vaults-page.tsx](../apps/terminal/src/components/vaults/vaults-page.tsx) | — | — | [205](../apps/terminal/src/components/vaults/vaults-page.tsx#L205)、[208](../apps/terminal/src/components/vaults/vaults-page.tsx#L208)、[211](../apps/terminal/src/components/vaults/vaults-page.tsx#L211) |
| [apps/terminal/src/lib/markdown.tsx](../apps/terminal/src/lib/markdown.tsx) | — | — | [57](../apps/terminal/src/lib/markdown.tsx#L57)、[133](../apps/terminal/src/lib/markdown.tsx#L133)、[164](../apps/terminal/src/lib/markdown.tsx#L164) |
| [apps/terminal/src/lib/ui/trading-cta.ts](../apps/terminal/src/lib/ui/trading-cta.ts) | — | — | [16](../apps/terminal/src/lib/ui/trading-cta.ts#L16) |
| [apps/terminal/src/lib/ui/trading-dropdown.ts](../apps/terminal/src/lib/ui/trading-dropdown.ts) | [6](../apps/terminal/src/lib/ui/trading-dropdown.ts#L6) | — | — |
| [apps/terminal/src/routes/mobile-agent-sync.tsx](../apps/terminal/src/routes/mobile-agent-sync.tsx) | — | — | [420](../apps/terminal/src/routes/mobile-agent-sync.tsx#L420)、[491](../apps/terminal/src/routes/mobile-agent-sync.tsx#L491)、[527](../apps/terminal/src/routes/mobile-agent-sync.tsx#L527)、[581](../apps/terminal/src/routes/mobile-agent-sync.tsx#L581)、[590](../apps/terminal/src/routes/mobile-agent-sync.tsx#L590) |
| [apps/website/src/components/FeatureSpeed.astro](../apps/website/src/components/FeatureSpeed.astro) | — | — | [28](../apps/website/src/components/FeatureSpeed.astro#L28) |
| [apps/website/src/components/Features.astro](../apps/website/src/components/Features.astro) | — | — | [68](../apps/website/src/components/Features.astro#L68) |
| [apps/website/src/components/Footer.astro](../apps/website/src/components/Footer.astro) | — | — | [35](../apps/website/src/components/Footer.astro#L35)、[67](../apps/website/src/components/Footer.astro#L67)、[90](../apps/website/src/components/Footer.astro#L90) |
| [apps/website/src/components/Hero.astro](../apps/website/src/components/Hero.astro) | — | — | [12](../apps/website/src/components/Hero.astro#L12)、[62](../apps/website/src/components/Hero.astro#L62)、[63](../apps/website/src/components/Hero.astro#L63)、[64](../apps/website/src/components/Hero.astro#L64)、[65](../apps/website/src/components/Hero.astro#L65) |
| [apps/website/src/components/Markets.astro](../apps/website/src/components/Markets.astro) | — | — | [44](../apps/website/src/components/Markets.astro#L44) |
| [apps/website/src/components/Trust.astro](../apps/website/src/components/Trust.astro) | — | — | [40](../apps/website/src/components/Trust.astro#L40) |
| [packages/ui/src/alert-global.tsx](../packages/ui/src/alert-global.tsx) | — | — | [23](../packages/ui/src/alert-global.tsx#L23) |
| [packages/ui/src/alert.tsx](../packages/ui/src/alert.tsx) | — | — | [24](../packages/ui/src/alert.tsx#L24) |
| [packages/ui/src/autocomplete.tsx](../packages/ui/src/autocomplete.tsx) | — | — | [127](../packages/ui/src/autocomplete.tsx#L127) |
| [packages/ui/src/avatar.tsx](../packages/ui/src/avatar.tsx) | — | — | [92](../packages/ui/src/avatar.tsx#L92)、[100](../packages/ui/src/avatar.tsx#L100)、[150](../packages/ui/src/avatar.tsx#L150) |
| [packages/ui/src/badge-count.tsx](../packages/ui/src/badge-count.tsx) | — | — | [17](../packages/ui/src/badge-count.tsx#L17) |
| [packages/ui/src/badge.tsx](../packages/ui/src/badge.tsx) | — | — | [15](../packages/ui/src/badge.tsx#L15) |
| [packages/ui/src/card.tsx](../packages/ui/src/card.tsx) | — | — | [15](../packages/ui/src/card.tsx#L15) |
| [packages/ui/src/combobox.tsx](../packages/ui/src/combobox.tsx) | — | — | [122](../packages/ui/src/combobox.tsx#L122) |
| [packages/ui/src/progress-indicator.tsx](../packages/ui/src/progress-indicator.tsx) | — | — | [47](../packages/ui/src/progress-indicator.tsx#L47) |
| [packages/ui/src/segmented-controls.tsx](../packages/ui/src/segmented-controls.tsx) | — | — | [20](../packages/ui/src/segmented-controls.tsx#L20) |
| [packages/ui/src/slider.tsx](../packages/ui/src/slider.tsx) | — | — | [101](../packages/ui/src/slider.tsx#L101) |
| [packages/ui/src/table.tsx](../packages/ui/src/table.tsx) | — | — | [9](../packages/ui/src/table.tsx#L9) |
| [packages/ui/src/tabs.tsx](../packages/ui/src/tabs.tsx) | — | — | [51](../packages/ui/src/tabs.tsx#L51) |
| [packages/ui/src/tag.tsx](../packages/ui/src/tag.tsx) | — | — | [17](../packages/ui/src/tag.tsx#L17) |
| [packages/ui/src/toggle.tsx](../packages/ui/src/toggle.tsx) | — | — | [12](../packages/ui/src/toggle.tsx#L12) |
<!-- END NEUTRAL SURFACE INVENTORY -->
