<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-30-full-feature-audit",
  "date": "2026-10-30",
  "title": "全功能双端审查：对照官方终端实测、五路代码审查与 Codex 二审，修复规划待运营方定批次",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "order-entry", "market-recovery", "account-funding", "i18n-runtime"],
  "summary": "运营方要求遍历全部功能、对照 app.hyperliquid.xyz 找功能与 UI 缺陷、双端核对并请 Codex 二审后再规划。基线 dev d99c2bc9（线上 p35 同内容）。方法：Chrome 内对线上 p35 与官方终端只读并排实测、无头 Playwright 多尺寸与三种语言手机走查、五个只读代码审查代理（下单、持仓表格、行情图表、资金、仪表盘）、三路 Codex（gpt-6-astra、只读、medium）逐条证伪。实测复现：1W/1M 图表无数据、统一账户金库存入可用额为 $0、⌘K 菜单未本地化、成交价紧凑格式丢精度、盘口数量缩写、订单簿分组值被截断、四种语言各 31 条未译、阿拉伯语正负号错位、未设置 expiresAfter。未改代码；修复分批规划待运营方确认。限制：未连接真实下单与签名、未真机、注入事件不代表物理输入。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/src/components/trade/chart/datafeed.ts"},
    {"path": "apps/terminal/src/components/vaults/use-vault-action-controller.ts"},
    {"path": "apps/terminal/src/components/trade/components/command-menu.tsx"},
    {"path": "apps/terminal/src/components/trade/orderbook/orderbook-row.tsx"},
    {"path": "apps/terminal/src/components/trade/orderbook/orderbook-panel-view.tsx"},
    {"path": "apps/terminal/src/components/trade/positions/history-tab.tsx"},
    {"path": "apps/terminal/src/components/trade/components/historical-order-price.tsx"},
    {"path": "apps/terminal/src/components/trade/positions/send-modal.tsx"},
    {"path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx"},
    {"path": "apps/terminal/src/lib/trade/account-ledger.ts"},
    {"path": "apps/terminal/src/components/trade/tradebox/trade-panel.tsx"},
    {"path": "apps/terminal/src/stores/use-order-entry-store.ts"},
    {"path": "apps/terminal/src/domain/trade/open-order-modification.ts"},
    {"path": "packages/hl-react/src/clients.ts"},
    {"path": "apps/terminal/src/locales/es/messages.po"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/trade-outcome-looks-incorrect/what-does-action-already-expired-mean"}
  ],
  "supersedes": []
}
-->
# 全功能双端审查：对照官方终端实测、五路代码审查与 Codex 二审

## 背景与范围

同步记录，未取得任务标识。运营方 2026-10-30 要求：遍历当前项目全部功能块，找功能实现与 UI 设计上的缺陷；移动与电脑双端一起核对；以官方开发文档与官方终端 https://app.hyperliquid.xyz/trade 为准，不确定的到官方终端调试；先审查、核对、对比，再规划；发现的问题交 Codex 二审；分功能逐块进行；补充运营方可能遗漏的方面。

基线：`dev` 的 `d99c2bc9`（工作树 `project-testing-review-31bd6a`，分支 `claude/project-testing-review-31bd6a`）。线上 `https://app.sairn.ai/build-meta.json` 为 `cloudfront-2026-10-28-p35`、提交 `cdb47637`，与基线内容相同（`git diff origin/dev cdb47637` 为空），所以线上实测结论适用于基线。本任务只审查与规划，没有改产品代码。

## 结论与依据

### 方法

| 手段 | 范围 | 能证明什么 |
| --- | --- | --- |
| Chrome（运营方浏览器）并排实测 | 线上 p35 与官方终端，桌面 1959×1100 / 1440×757；我方为运营方已连接的外部钱包会话（未授权 Agent），官方为运营方邮箱会话，全程只读，没有点击下单、授权、签名控件 | 真实界面与数据、界面文案、交互结果；注入事件，不代表物理输入 |
| 无头 Playwright | 两站 1920×1080、1440×900、1300×900、1000×800、iPhone 13（390×844）；我方手机中文深色、日语浅色、阿拉伯语深色走查 | 布局几何、溢出、未连接状态；脚本读取，不是真人查看 |
| 五个只读代码审查代理 | 下单面板、持仓与表格、行情与图表、资金与账户面板、仪表盘页面；读码并读取 2026-10-30 抓取的官方前端包与公开 info 接口 | 代码路径与官方实现差异；静态推演 |
| Codex CLI 三路二审 | `gpt-6-astra`、`-s read-only`、medium；逐条给出成立/部分成立/不成立 | 独立复核；不能跑测试 |

### 实测复现的主要问题

- 图表选「1周」显示「这里没有数据」（1W/1M 周期不可用）。
- 统一账户（10.10 USDC）打开 HLP「存入金库」，弹窗显示「已验证的钱包余额：$0.00」，无法存入；新账户会被自动设为统一账户（ADR 0041）。
- ⌘K 命令菜单在中文界面显示英文「Search markets...」「Perp」。
- 成交历史价格显示为「$29.78K」（同一笔在委托历史的保护价为 $29,036.00）。
- kPEPE 盘口数量与累计显示为「14M」「811K」等缩写。
- 1920 宽桌面（订单簿面板约 360px）价格列表头的分组值「0.001」被截成「0…」。
- es/fr/hi/ar 各 31 条译文为空，回落英文，集中在关联移动设备、API 钱包邮箱签名与命名 Agent 上限文案；线上配对开关已开。
- 阿拉伯语手机行情栏 24h 涨跌显示为「18.50%+ / 14.531+」。
- 全仓没有 `expiresAfter`：官方默认开启「交易延迟保护」（L1 动作 15 秒未被接受即过期），我方下单、撤单可能在网络恢复后才上链。
- 设置弹窗打开即聚焦滑点输入框（手机会弹出数字键盘）；滑点值恒用错误红色。
- 选择器打开初期显示本地缓存的统计快照：ZEC 24h +29.788 / +2.39%（推得前日价 1244.8），同刻接口 prevDayPx 为 1237.0，约一分钟后才刷新。

### 二审结果

清单编号：A 下单、C 行情与图表、M 主会话实测（下单与行情）、B 持仓与表格、D 资金、E 仪表盘、F 主会话实测（多语言、移动端、布局与全局）。Codex 三路评分：下单与行情 8.0、表格与资金 7.6、仪表盘与全局 8.0。下表严重度以 Codex 二审为准；「部分成立」只计成立的部分。路径相对 `apps/terminal/src/`，另注明的除外。

#### P1（17 项，B4 与 D4 合并）

| 编号 | 问题 | 二审 | 主要位置 | 证据 |
| --- | --- | --- | --- | --- |
| M1 | 全仓没有 `expiresAfter`，官方默认开启的「交易延迟保护」（L1 动作 15 秒未被接受即过期）缺失，延迟的下单、撤单可能在网络恢复后才上链 | 成立 | `packages/hl-react/src/clients.ts:148-185`；SDK `_base/execute.js:27` | 读码；官方 FAQ 与设置项 |
| A8 | 限价、触发价输入不限位数，提交时静默四舍五入（可越过用户设的买入上限或卖出下限），官方报不可整除并给出合规价 | 成立（P3→P1） | `components/trade/tradebox/trade-form-fields.tsx:281,302`；`domain/trade/orders.ts:530-559` | 读码 |
| A1 | Scale 订单 USD 模式按标记价换算数量，订单价值和手续费按「数量×标记价」算（买入 80→60、标记价 100 时输入 $1000 实际名义约 $700） | 部分成立（手机保证金用标记价是已记录的决定） | `components/trade/tradebox/trade-panel.tsx:173`；`hooks/trade/use-order-entry-data.ts:148,343`；`domain/trade/order/derive.ts:130-140` | 读码 |
| C1 | 图表选 1W/1M 无 K 线也无实时：图表库用日线合成周线，`getBars` 收到 `1D` 与目标 `1W` 比较不等被丢弃 | 成立 | `components/trade/chart/datafeed.ts:335-343,547-548,584-587,709` | 实测「这里没有数据」 |
| B1 | 成交历史把对手方成交（他人被强平、本人挂单被吃）也标成「已强平」，未比较 `liquidatedUser` | 成立 | `components/trade/positions/history-tab.tsx:64,165-172`；手机与全页同 | 读码；官方前端区分三种文案 |
| B2 | 成交历史价格用紧凑格式（实测 XYZ100 成交价「$29.78K」，95001.5→「$95K」）；委托历史不缩写但只保留两位小数（0.18342→$0.18） | 部分成立 | `history-tab.tsx:186`；`components/trade/components/historical-order-price.tsx:18` | 实测 |
| B3 | 本终端下的单都由 `trackOrderRequest` 补上 cloid，而改单规则对非空 cloid 一律拒绝，所以桌面不出现编辑、手机「修改订单」只报不能修改；限价单不能改价 | 部分成立（触发单禁止改单是代码注释写明的安全取舍） | `domain/trade/open-order-modification.ts:172`；`domain/trade/order-tracking.ts:97-113` | 读码 |
| B4/D4 | 地区闸门没有覆盖余额表的发送、兑换和持仓的反手：受限地区或代理访客在下单面板、划转、提款被拦时，这三个入口照常可用 | 成立 | `components/trade/positions/balances-tab.tsx:143-144,223-234`；`positions/send-modal.tsx:213-235,305-312`；`components/trade/components/spot-swap-modal.tsx:288-345`；`hooks/trade/use-position-reverse-submit.ts` | 读码；ADR 0042 |
| B10 | 资金费历史（桌面面板与全页）取绝对值丢失多空方向；付款币种硬编码 USDC，非 USDC 抵押 DEX 误标 | 成立（P2→P1） | `positions/funding-tab.tsx:128-193`；`funding-history/funding-history-page.tsx:264` | 读码 |
| B16 | 非 USDC 抵押的 HIP-3 仓位：仓位价值用抵押币，未实现盈亏、保证金、资金费却按美元格式显示 | 部分成立（「-」与 N/A 只是细节） | `positions/position-row.tsx:119-140` | 读码 |
| D1 | 发送不做目的地址预检：不披露新地址 1 USDC 激活费，不要求确认，Max 未计费用；官方调用 `preTransferCheck` 并弹必须勾选的确认层 | 部分成立（系统地址、零地址是否会被接受未证实） | `positions/send-modal.tsx:303-414` | 读码；官方文档 Activation gas fee |
| D2 | 邮箱会话提现可以填自己的地址（到账 Arbitrum 后自动存款宿主会存回）或 USDC 合约地址；官方两者都禁止 | 部分成立（不是无限循环，需用户再次发起提现） | `components/trade/tradebox/deposit-modal.tsx:559-566` | 读码 |
| D3 | 「存款和提款」历史把 CCTP 存款与提现显示为「发送」，来源与去向误导 | 部分成立（金额正负正确） | `lib/trade/account-ledger.ts:298-322` | 实测：运营方账户 10-08 两笔入账显示「发送 现货→永续」，一笔 −10.49 USDC（手续费 0.001734 USDC）显示「发送 现货→现货」 |
| E1 | 统一账户与组合保证金账户向金库存入时，可存额与签名前预检都取主 dex 永续 `withdrawable`（统一账户为 0），新账户会被自动设为统一账户（ADR 0041） | 成立 | `components/vaults/use-vault-action-controller.ts:290-294,330-346`；`components/vaults/vault-action-domain.ts:78-86` | 实测：10.10 USDC 的统一账户打开 HLP 存入，显示「已验证的钱包余额：$0.00」 |
| E16 | 金库领导者在 `allowDeposits=false` 时不能向自己的金库补仓（官方条件为「是领导者或允许存入」） | 成立（P3→P1） | `components/vaults/domain/vaults.ts:234-238` | 读码 |
| E6 | Portfolio 14 日成交量取最后 14 条，包含当天未完结数据并丢掉最早一天；官方排除最后一条 | 成立（P2→P1） | `domain/portfolio.ts:61-70` | 读码；样本账户少约 5,339 万 |
| E14 | 推荐接口 zod 每层 `.strict()`，官方前端读取的可选字段 `benefits` 一旦出现，整页显示数据不可用 | 成立（P3→P1，触发条件尚未在 34 个样本中出现） | `lib/trade/referral.ts:47-73,139-142` | 读码 |

#### P2（按功能块）

- 下单：A2 永续限价与 Scale 的最大数量没按限价折算；A3 非只减仓条件单仍受可用余额与最大数量限制（官方豁免）；A4 TWAP 设触发价时最高/最低价仍对比标记价；A5 TWAP 摘要恒显示「每 30 秒」；A11 市价单附带 TP/SL 的构建按中间价、执行守卫按标记价，价差内互相否决；A12 现货市价买手输数量可过表单校验后被滑点预算守卫拒绝。
- 行情、盘口与图表：M2 1920 宽桌面订单簿表头分组值被截成「0…」（`styles.css:1065`）；C7 点击盘口档位把条件单、Scale、TWAP 改成普通限价；C12 最近成交与盘口订阅不按标签互斥，违反订阅契约；C2 缺官方默认的现货 Strict 名单（未进名单的同名代币可见，Popular 主动展示 PEPE/USDC）；C3 现货显示名映射造成重名与错名，`/trade/PUMP/USDC` 实测 404；C4 现货市值缺官方排除与校正（UBTC 的约 1.6 万亿与官方选择器口径一致，不算错误）；C9 选择器「最后价格」与 24h 涨跌用标记价（官方用中间价）；M4 选择器先用最多 5 分钟前的本地统计快照与新价格拼接显示；C14 图表叠加线「Liq.」硬编码英文、持仓数量绕过数字格式；C15 测试网浏览器链接域名错误、表头合约链接未传网络；C18 last-mark 缓存未按网络隔离。
- 表格：B5 资金费与委托历史 CSV 仍按展示格式导出；B6 成交历史基于最近 200 条 WS 成交再剔除 TWAP，可能显示错误空态；B7 委托历史状态原因被折叠为 Canceled/Rejected，桌面表缺方向文字、已成交数量、订单价值、只减仓、触发条件、订单号；B8 成交盈亏未扣手续费、缺成交价值列；B9 余额表缺现货盈亏与合约地址列、隐藏小额阈值 $1（官方 $5）；B11 不识别官方「Trailing Stop Market」类型；B13 批量撤单部分成功被整批报失败；B17 桌面「存款与提款」被动失败显示错误文字；B21 TP/SL 弹窗被动等待标记价时以警告样式显示「Loading...」；B20/D9 手机余额缺发送与兑换入口、手机委托卡缺订单价值与子单。
- 资金：D5 统一账户持有结果代币或无定价代币时组合价值整体不可用；D6 CCTP 提现未披露与预留 HyperEVM gas；D7 标准模式不能向 HIP-3 DEX 划转；D8 发送 Max 先转 Number，大额 8 位小数余额会被执行守卫拒绝。
- 仪表盘：E2 金库存入与提取没有 Max，最大提款不可靠；E3 金库存入无最低额（官方 5/10 USDC）；E4 推荐码不转大写、不限字母数字；E5、E9、E13 质押、推荐、金库详情、三个历史页与 Portfolio 违反被动数据展示契约（刷新文字、红色错误框、回到标签页时闪错误与 $0），`mobile-data-presentation-contract` 不扫描这些目录；E12 质押被拒丢失交易所原文（ADR 0024）；E15 API 钱包页看不到、也不能移除无名默认 Agent。
- 多语言与全局：F1 es/fr/hi/ar 各 31 条译文为空（2026-09-28 文档已撤销「允许长期回落英文」），集中在关联移动设备、API 钱包邮箱签名与命名 Agent 上限文案；F2 阿拉伯语带符号数值未做双向隔离，实测显示「18.50%+ / 14.531+」；M3 ⌘K 命令菜单整块硬编码英文，现货价格用永续小数规则；M9 订单簿计价单位两套来源，手机设置开关对交易页紧凑簿无效，桌面没有独立切换；F3 设置弹窗默认聚焦滑点输入（是否弹键盘需真机确认），手机设置出现「桌面布局 重置」。
- 布局：F4 ADR 0011 的前提是「官方窄桌面切两列」，本次无头实测官方在 1100、1200、1238、1280、1360、1420、1440 宽（高 900）均为图表、订单簿、下单三列并排；我方 ≤1420 堆叠后订单簿在下单面板下方，需要滚动才能看到。Codex 只看到 ADR 记录时判为待重核，本条补测后建议按 P2 交运营方重新决定。

#### P3 与不成立

- P3：A6（下单成功后 TIF、只减仓、TP/SL 勾选按仓库草稿生命周期重置，官方保留）、A7（默认滑点 2.5%、上限 5%，官方 8%、0.01–100%）、A9、A10、A13、A14、A15、C5（盘口数量缩写，悬浮框有完整值）、C6、C8、C10、C11、C13、C16、C17、M5、M6（行情头可横向滚动但没有滚动条，首屏看不到资金费率）、M7（最大滑点值固定红色）、M8、M10（缺 Chase、Trailing Stop）、B14、B15、B18、B19、D10–D16、E7、E8、E10、E11、F5–F9、F11–F13。另有两条只在本次实测、未送审的 P3：成交历史日期无年份而委托历史有年份；标签页隐藏后回到前台约 10–50 秒内清算价显示「-」（需真人复现）。
- 不成立：F10（我方与官方网格几何相同，只是我方整页滚动、官方内部滚动，不违反契约）、B12（仓位 TP/SL 列只管理仓位级 TP/SL 是有意设计）、D17（说明性数值不参与签名与 Max）。主会话的「已取消止盈单数量显示 0.00、原始数量丢失」也被代码反证：数量取 `origSz`，0 是仓位级 TP/SL 的原始数量。
- 已规划或已决定，只记录：M11 多资产多链存款（ADR 0004、`docs/across-deposit-addresses.md` 已规划未实施）；F7 子账户、多签、构建者授权管理等在 SDK 覆盖审查中列为未排期。

## 验证与限制

- 版本：线上 p35（`cdb47637`，内容同 `d99c2bc9`）；代码审查读 `d99c2bc9`。
- 未做：真实下单、签名、存提款、金库存入；真机触摸与软键盘（只用了脚本与模拟设备）；连接态下的手机端（Chrome 窗口无法缩到手机宽度，手机走查为未连接）；Codex 与代码审查代理均为静态审查，不能运行测试。
- 审查期间运营方 Chrome 里我方终端的语言（es）、主题、下单方向与类型、账户页签已恢复为审查前的值；官方终端只切换过账户页签与菜单。
- 无头会话出现过两次 429，确认 `/api/geo` 正常，判断为本机并发探测触发 Hyperliquid 公共接口限流，不计为缺陷。

## 后续与替代关系

### 修复规划（待运营方确认批次）

按手册，签名、下单、资金相关的改动各自单独开 PR；每个 PR 先写会失败的测试并做还原核对，推送前跑改动文件的 Biome、`typecheck`、全量终端 Vitest 与对应浏览器套件，再做一轮 Codex `low` 只读审查。

| 批次 | PR | 内容 | 涉及契约 |
| --- | --- | --- | --- |
| 第一批（P1） | 下单安全 | M1 给 L1 动作设置 `expiresAfter`（默认值与是否提供关闭开关待定）；A8 价格不合规时报错并给出合规价，不再静默四舍五入；A1 Scale 按档位加权价换算数量、订单价值与费用 | Order entry、Confirmation surface |
| | 历史与表格数据 | B2 价格按市场精度显示；B1 按 `liquidatedUser` 区分强平文案；B10 资金费方向与币种；B16 非 USDC 抵押仓位单位；D3 识别 CCTP 存提款；顺带 B5 CSV 原值、B19 方向翻译 | Number formatting、Operation feedback |
| | 资金安全 | D1 发送前 `preTransferCheck` 与激活费确认；D2 提现目的地址拒绝本人与 USDC 合约；B4/D4 发送、兑换、反手接入地区闸门与执行前复核 | Wallet signing、Confirmation surface |
| | 金库与仪表盘数据 | E1 按账户模式取金库可存额；E16 领导者例外；E6 14 日成交量排除当天；E14 推荐接口只校验用到的字段；可并入 E2 Max、E3 最低额、E4 推荐码规范化 | Confirmation surface（资金弹窗） |
| | 图表 | C1 周线、月线按实际拉取周期比较；可并入 C14 叠加线文案 | Trading terminal visual |
| | 改单 | B3 允许修改带 cloid 的本终端订单与限价单价格（触发单维持现状，除非运营方改决定） | Order entry |
| 第二批（P2） | 按功能块分 PR | 盘口与行情（M2、C7、C12、M9、C2、C3、C9、M4、C4、C15、C18）；下单校验（A2、A3、A4、A5、A11、A12）；表格（B6、B7、B8、B9、B11、B13、B20/D9）；资金（D5、D6、D7、D8）；被动数据契约（E5、E9、E13、B17、B21，并把契约测试扫描范围扩到仪表盘）；多语言（F1、F2、M3）；其余 E12、E15、F3 | 各自归属文档 |
| 第三批（P3） | 合批 | 文档同步（A14、B18、C12 文档部分）与其余展示细节 | — |

### 需要运营方决定

1. `expiresAfter` 的默认值（官方 15 秒）及是否像官方那样提供「关闭交易延迟保护」开关。
2. 市价单滑点默认 2.5%、上限 5% 是否改为接近官方（默认 8%、可调 0.01–100%）。
3. 下单成功或换市场后是否保留 TIF、只减仓、TP/SL 勾选（官方保留；`docs/order-draft-lifecycle.md` 目前规定重置）。
4. ADR 0011 的 md 堆叠布局是否保留（官方 1100–1440 宽均三列）。
5. 受限地区是否允许只减仓类动作（平仓、TP/SL、撤单、逐仓保证金调整）。
6. 是否补官方新功能：Chase、Trailing Stop、现货 Strict 名单的维护方式、多资产存款（ADR 0004 已规划）、子账户等。

### 下一次先查

本记录「二审结果」各表；Codex 三路报告与浏览器截图只在本机草稿目录，未入库。本记录不替代任何早先记录；2026-10-13 生产就绪审计的未修项仍以那份记录为准。
