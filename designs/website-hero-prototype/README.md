# 官网首屏原型：真实终端预览 + Live market（A 克制版 / B 大胆版）

状态：设计原型，供运营方在[官网重建规划](../../docs/website-rebuild-plan.md)的视觉决定之间对比选择。**不是生产代码，不进官网构建，不发布。** 第一版 2026-10-24；第二版按 GPT 第一轮对抗审查（规划第 23、24 节）修订，再按第二轮审查（规划第 25 节）修正，同日（UTC）。第三版 2026-10-25：Terminal 视图从静态截图改为真实终端录屏（规划第 26 节）。

## 运行

1. 在 Claude 桌面应用里用预览配置 `design-handoff`（`.claude/launch.json`，Python 静态服务器，端口 3020，根目录 `designs/`）；或在仓库根目录运行 `python3 -m http.server 3020 --bind 127.0.0.1 --directory designs`。
2. 打开 `http://localhost:3020/website-hero-prototype/?v=a`（克制版）或 `?v=b`（大胆版）。页面底部的切换条或键盘 `1` / `2` 随时切换。参数 `&view=live` 直接打开 Live market 视图，`&coin=ETH` 等选择初始市场。

## 第二版改了什么

| GPT 意见 | 原型里的处理 |
| --- | --- |
| 首屏证明的是 Hyperliquid，不是 Sairn（L1、S1） | 产品窗口分两个视图：默认 **Terminal**（app.sairn.ai 未登录的真实截图），第二个 **Live market**（Open Book）。实时数据在后台照常积累，Live 标签上的圆点在有实时数据时变实心 |
| 冷启动要等约 100 秒（L2、S3、V1） | BTC 先显示录制海报，标 `RECORDED` 与录制时段；连续 15 秒有效实时数据后整幕替换（见下一节）。海报期间价格、涨跌、盘口与刻度全部来自同一份录制的最后状态 |
| 手机首屏是长篇文字（L3、L6、S3、V4） | 标题缩短为一句，副标题两行；按钮与邮箱说明同一行，风险句紧贴按钮（8px），再是存款条件；原型切换条移到页底 |
| B 的琥珀超出 D5（S5、V2） | B 改为灰阶热度 `#263138 → #68747D → #AAB4BC`，去掉暖光、0.99 缩放、历史成交光晕；页面网格 1%。两版都不再用琥珀，品牌色只留在 Logo |
| 画面主次不清（V3） | 热度最高不透明度 0.60 / 0.65，无近白端；中间价线 1.5px 加深色衬线、无辉光；同一交易所时间、同一主动方向的成交在显示上合并为一点（按成交额加权均价；这是显示合并，不是订单识别，同一区块里同方向的几笔吃单也会并成一点），半径桌面 2–8px、手机 2–6px；到达脉冲 320 ms |
| 图例与坐标（V3） | 图例写明 Buy trades / Sell trades / Dot size = trade value；画布下有时间刻度（实时：−120 s / −60 s / Now，录制：起止 UTC 时间），价格槽标 USD；盘口表头 Price (USD) / Size (BTC) |
| A 的侧栏把画布挤窄（L5） | 窗口宽于 900px 才显示前 5 档表（容器查询），否则只显示最优买卖价一行；A 在 1440 宽时画布 621px |
| 状态切换会改变高度（S、L） | 两个视图叠在同一个网格单元，窗口高度取两者较大值；画布区按窗口宽度取固定比例（见下一节）；状态说明预留固定行数 |
| 数据路径自相矛盾（S4） | 改为每页一条 WebSocket（见下文），与规划第 10 节一致 |
| 邮箱入口只是换了 UTM 的同一链接（L9、S6） | 改为说明链接「No wallet? How email sign-in works →」，指向第 03 段「三步开始」的锚点（原型里是占位） |

## 第二轮审查后的修正

第二轮 GPT 审查（L 7.9、V 7.4、S 7.2，无 P0）的新意见经 7 个只读核验代理逐条复核后，下列确认属实的问题在原型里修正（全部记录见规划第 25 节）：

| 意见 | 修正 |
| --- | --- |
| 录制到实时只淡化画布，数字与标记先换成实时值（V N1、S N2，P1） | 改为整幕替换：数据区（价格、图例、画布、坐标、盘口、最优价、状态行）约 100 ms 淡出，在不可见时一次同步替换全部内容与标记，等 Worker 回报新画面已绘制（或海报已解码，超时 300 ms）后再淡入；反向（回到海报）同样处理；减少动态时直接替换。走势线在录制阶段预取 |
| LIVE 不检查连接、坏帧计数共用（S N3，P1） | 连接未打开就不算实时；`l2Book` 与 `bbo` 各自计数，某一频道连续 3 帧无效就丢弃该频道数据，并关闭连接、按退避重连（计入 60 秒 3 次、5 分钟 6 次的预算）；单边 `bbo` 跳过不计；只有深度停更超过 20 秒时在同一连接上重订 `l2Book`；最新成交价只在其交易所时间与盘口相差 60 秒以内时显示，状态行写出成交时间 |
| 失效时状态行仍写 Live、20 秒有三种口径（S N5） | Worker 只维护一个「最后有效数据时间」，跨线程只传时长 `silentMs`；连接按预算停止或 20 秒无数据时回海报；状态行分为实时、等待首帧（超过 6 秒转为不可用）、不可用、暂停、静止 |
| 两个视图的身份说明太晚、会被截断（L N1、V N3，P1） | 每个视图内容上方常显一行，允许换行、不省略：Terminal「**Screenshot** of app.sairn.ai, signed out · 24 Oct 2026 UTC」，Live「**Public market data** · not a terminal feature」；截图下方标出区域（Chart / Order book / Order form，手机为 Order form / Order book）；Live 底部第二行「BTC-USD perpetual · Not advice.」 |
| A 到 1023px 才单列，1024 宽时画布约 471px（L N3） | A 只在视口 ≥1200px 时两栏；画布区比例改按窗口宽度：窗口 <900px 为 16:5，≥900px 为 13:7，手机 9:10；海报按调色板 × 比例共六张 |
| B 在 1366×768 下窗口顶边约 434px（L2） | 视口 ≥1024 且高 ≤820 时，B 收紧导航与首屏间距 |
| 视图切换硬切、切换市场先清空（V9） | 视图切换 180 ms 不透明度过渡；切换市场也走整幕替换 |

## 第三版：终端录屏

- Terminal 视图播放未登录 app.sairn.ai 的真实录屏（HYPE/USDC 现货）。桌面约 17.5 秒（视频 17.53 s，取帧窗口 17.55 s，以 media/demo-capture.json 为准）：图表 1h → 5m、最近成交、盘口、限价、点盘口填价、卖出、TWAP、Scale，再回到初始状态；手机约 7.4 秒（视频 7.43 s，取帧窗口 7.44 s，以同一报告为准）：下单类型、限价、点盘口、卖出、只看卖盘、恢复。循环点上界面状态（图表周期、标签、下单类型与方向）与开头相同，但行情一直在变，价格、盘口与图表会在循环点跳一下，不是无缝循环（首末帧 PSNR 约 27–29 dB，审查实测）。
- 静音、循环、只在 Terminal 视图可见且页面可见时播放；右下角 Pause / Play 按钮（只换文字，不用 `aria-pressed`），按钮跟随视频的 `play` / `pause` 事件；`play()` 被浏览器拒绝（例如 iOS 低电量模式）或浏览器自行暂停时显示 Play。减少动态效果或 Save-Data 时不加载视频，只显示海报（首帧），按 Play 才播放；浏览中途开启减少动态效果或 Save-Data（`navigator.connection` 的 `change` 事件，浏览器支持时）会暂停；切到 Live market 时暂停。
- 视频按 640px 断点选择桌面或手机版本，AV1 WebM 优先、H.264 MP4 兜底；海报、宽高与 `aria-label` 由 `main.js` 按所选版本设置（手机与桌面的说明各写各自录到的操作）。已加载过视频后跨过断点会立即换源并 `load()`，画面与宽高比随版式一起变。
- 无 JS 与 JS 运行前：HTML 里视频下面是一个 `<picture class="demo-poster">`，`<source media="(max-width: 640px)">` 给手机首帧、`<img>` 给桌面首帧（都写明 `width` / `height`，`alt` 说明这是录屏首帧、未登录、HYPE/USDC 现货；`fetchpriority="high"`），断点与 `main.js` 的 `mqMobile` 和样式表一致，都是 640px。视频与 Pause / Play 按钮在 HTML 里带 `hidden`，所以没有 JS 时只显示这张图、没有按钮；`main.js` 接管后去掉两者的 `hidden`，视频（带同一张首帧作 `poster`，同一 URL，不重复下载）盖在图片上，并给 `<picture>` 加 `aria-hidden="true"`，读屏只读到视频的 `aria-label`。宽高比放在共同的外框 `.demo` 上（桌面 1440 / 732、手机 780 / 1210），图片与视频都绝对定位铺满外框，所以加载前后、有无 JS 都不移位。`<head>` 里原来的两条海报 `preload` 已删除：`<picture>` 写在 HTML 里，预加载扫描器直接发现，按断点只取一张。
- 录屏里点击处的小圆环是录制时叠加的演示指针，不是产品界面。
- 无头检查（2026-10-25，Agent 执行，仓库 Playwright 的 Chromium，本机 3020 静态服务器，`?v=b`）：关闭 JS 时 1440×900 显示桌面首帧（1440×732）、390×844 显示手机首帧（780×1210），各只请求这一张图，视频与按钮不可见，没有布局偏移记录，外框尺寸在图片加载前后相同（这时页面是 A 版）；打开 JS 时桌面与手机都播放 AV1 WebM，首帧图只请求一次，`<picture>` 带 `aria-hidden="true"`，按钮可见，Pause → Play → Pause 正常；视口 1440 → 390 → 1440 时视频、海报与 `<picture>` 都换到对应版本；减少动态效果时不请求视频、按钮为 Play、只显示首帧；首帧图由解析器与 `main.js` 同时发出、优先级 High；控制台零错误。布局偏移只出现在点击与改视口之后（`hadRecentInput`）。这是无头浏览器结果，不是真机。

## 两版的差别

| 项目 | A 克制版 | B 大胆版 |
| --- | --- | --- |
| 页面底色 | 石墨 `#12131a` | 青黑 `#091114`，1% 的 64px 网格 |
| 版式 | 视口 ≥1200px 时左 5 列文案、右 7 列产品窗口，更窄时单列 | 标题居中一行；产品窗口全宽，终端截图接近原尺寸；矮屏收紧间距 |
| 标题 | IBM Plex Sans 500，最大 48/52 | IBM Plex Sans 600，最大 60/64；两版都是统一的近白色 |
| 挂单热度 | 暗中性灰，买卖两侧各带 12% 色调 | 冷灰三段梯度 |
| 画布区 | 两版同一规则：窗口 <900px 为 16:5 并只显示最优买卖价，≥900px 为 13:7 并在右侧显示前 5 档表，手机 9:10 | 同左 |
| 其他 | 无网格 | 画布内 15 秒竖线与价格横线（3.5%），「现在」处一个中性色圆点 |

两版共用：英文文案草稿（规划第 6 节，D7 待定）、中性色主按钮（ADR 0028）、`Pause` 冻结画布与全部数字、`Read snapshot` 把当前（或录制时）盘口读给读屏软件；系统开启减少动态效果时，BTC 的录制海报一直保留，其他市场停在到达时画出的一帧（标记 `STILL`，说明行写时间）；点「Show live view」后进入正常更新的实时视图（标记 `LIVE`）。

## 终端截图与录屏

- `tools/capture-terminal.cjs`（仓库根目录运行，需要网络）用仓库的 Playwright 打开 `https://app.sairn.ai/trade/HYPE/USDC`：桌面 1440×900 @1.5x、手机 390×844 @2x，每张都用新的浏览器上下文、未登录，等待 15 秒后截到账户表格上沿为止；截图前后各由 Node 端检查一次，期间页面内守卫逐帧检查，两张都通过才写文件。采集前先读线上的 `build-meta.json`，只保留构建标识（`name`、`version`、`commit`、`release`、`builtAt`，另记读取地址 `url` 与读取时间 `readAt`），读不到时记 `terminalBuild: null` 与原因、照常采集。
- `assets/terminal-desktop.jpg`、`assets/terminal-mobile.jpg` 与 `assets/terminal-capture.json` 由现行守卫（下一节，含括号单位规则与四处例外）采集生成；`terminal-capture.json` 写出采集时间（`capturedAt`）、终端构建（`terminalBuild`）、每张的视口与裁切、前后两次 Node 检查读到的条目数、页面内检查次数、未检查的 iframe，以及守卫规则全文（`guards`）。截图是采集当时的公开行情。
- `index.html` 不引用 `assets/terminal-*.jpg`：页面的无 JS 回退是录屏首帧（`media/demo-*.jpg` 的静态 `<picture>`，见上一节），与规划第 6、7 节一致。规划里的静态截图指两种情况：还没有发布录屏时的回退，以及第 02 区块的大图；原型没有实现这两种情况，截图管线保留给它们。
- 选现货市场是因为现货没有杠杆控件；永续页面会出现 `40x` 与 `10x`（2026-10-24 实测）。
- 第二轮核验时试过在 1100–1180 宽采集（字更大），但终端在这个宽度用中等布局，盘口被挤到裁切线以下，所以没有采用；A 的截图缩放（约 48%）怎样处理列为规划决定 D22。
- 录屏：`node designs/website-hero-prototype/tools/record-demo.cjs [desktop|mobile|all]`（仓库根目录运行，需要网络与 ffmpeg 的 libx264、libsvtav1）。步骤在 `tools/demo-scenarios.cjs`。只录现货，也不打开市场选择器：永续页面有杠杆倍数；选择器未筛选的现货列表会出现代币化股票、隐私币与不雅代币名（2026-10-25 实测）。
- 取帧：桌面用 Chrome 屏幕广播（约 50 fps，重采样到 30 fps）；无头 Chrome 的屏幕广播在手机模拟下只给 CSS 像素，所以手机改用 2 倍像素的连续截图，每张截图前后各检查一次、两次都通过才保留（第三版不检查时约 24 fps；加检查后 2026-10-25 第三次录制：取帧窗口 7.44 秒、采到并编码 176 帧，约 24 fps，视频 7.43 秒，以报告为准）。
- 桌面录屏按 1 倍设备像素采集（1440×732，`demo-scenarios.cjs` 的 `dpr: 1`），原因是帧率与体积：屏幕广播的每一帧都是整幅 JPEG，像素越多，Chrome 发出的帧率越低，编码后的视频也越大。代价是清晰度：在 2 倍屏上、窗口宽于约 720 CSS px 时（B 版，以及 A 版的单列宽度），它比此前 1.5 倍像素的截图（`assets/terminal-desktop.jpg`，2160 像素宽）更软；A 版两栏时窗口约 574–689 px，两者都不需要放大。生产实现可以改按 1.5 倍重录；那样要重新核对规划 D22（A 版按约 48% 缩放显示时的可读性），也要按第 13 节重新量体积。
- 编码：MP4（libx264）与 AV1 WebM（libsvtav1）都直接从帧序列编码，TV 范围、BT.709 标记（`scale` 转换范围与矩阵，`setparams` 写入原色与传递特性）；海报取自帧序列第一帧。先在暂存目录编码，用 ffprobe 核对编码器、尺寸、像素格式、色彩标记、帧数与时长，再从 AV1 序列头读出编码字符串（如 `av01.0.05M.08`）；`main.js` 的 `DEMO_SOURCES` 写的编码字符串与像素尺寸、`styles.css` 的 `aspect-ratio`、`index.html` 里 `<picture>` 海报的 `width` / `height` 必须与文件一致，否则录屏失败、不动 `media/`。三个文件一起移入 `media/`，临时目录无论成败都删除；每个场景录完就把结果并入 `media/demo-capture.json`（含每个文件的字节数与 SHA-256）。
- 时钟：检查用页面时钟（页面内 `performance.timeOrigin + performance.now()`）。帧的时间按取帧方式不同：屏幕广播帧用 CDP `Page.screencastFrame` 的时间戳，与页面时钟同源（实测相差 2–16 ms）；截图帧用截图前后两次 Node 端检查读到的页面时间的中点。报告里每段录屏的 `guard.clock` 按它的取帧方式写出这一条。只编码最后一次通过的检查之前的帧；停止时等所有在途检查结束，再做一次检查。报告写出检查次数、首末时间与每次检查相对首帧的时间。
- 构建标识：开录前读线上的 `https://app.sairn.ai/build-meta.json`（经浏览器，在单独的上下文里），只把 `name`、`version`、`commit`、`release`、`builtAt` 这几个构建标识字段、且形状符合预期的值写进每段录屏的 `terminalBuild`（另记读取地址 `url` 与读取时间 `readAt`）（文件里的功能开关等其他字段不写；值看起来像密钥或令牌的也丢弃）；读不到时写 `terminalBuild: null` 与 `terminalBuildError`，照常录制。

### DOM 守卫（`tools/guard.cjs`）

- 读法：页面内从 `<html>` 开始（挂在 `<body>` 之外的节点也算）逐个可见元素读它自己的整段 `innerText`（杠杆写成 `{x}x` 时 "40" 与 "x" 是同一元素的两个文本节点，合起来读作 "40x"）；可见性按文字自身的排版矩形判断，所以 `display: contents` 父元素下的文字也算；输入框读 `value`、`placeholder` 与 `aria-valuetext`，滑块读 `aria-valuetext`。每个条目带上所在的 `data-market-stat` 与 `data-slot`（终端自己的标记）。同源 iframe（TradingView 的 `sameorigin.html`）按偏移读入；跨源 iframe 读不到，记在报告的 `uncheckedIframes` 里。
- 拒绝：杠杆数字（数字后接 `x` 或 `×`，同一元素内或相邻两个元素之间）；`leverage` / `cross` / `isolated` 整词（不分大小写）；HIP-3 市场：带前缀的名称（`xyz:TSLA`，不分大小写）、`xyz` 一词、整段文字等于某个 HIP-3 部署方简称的徽章（终端 `config/hip3-deployers.ts` 与实时 `perpDexs` 列表的并集，读不到列表就失败）、新会话收藏栏默认的 `BTC-USDC` / `ETH-USDC` / `HYPE-USDC` 之外的永续显示名（HIP-3 显示名去掉前缀后是 `TSLA-USDC` 这种形式）；钱包地址（`0x` 加至少 6 位十六进制，或 `0x12…abcd` 这类缩写）；钱包品牌；testnet；PnL；账户摘要字样；金额：同一元素内的 `$` 加数字、数字加 USD 系代币符号、USD 系符号加数字（中间可以有 `:` 或 `=`，如 'USDC: 12.30'）、`≈` / `<` 加数字（百分比除外），以及拆在相邻两个元素里的金额（'12.30' + 'USDC'、'USDC' + '12.30'、'$' 或 'US$' 或 `≈` / `<` + '1,234'）；标签以括号里的 USD 系单位结尾时，后面的数字也算金额，不论在同一元素（'Total (USDC) 11,411'）还是下一个元素（'Total (USDC)' + '11,411'，括号里也可以是 USDH、USDT、`$`、`US$`，数字可带正负号）。所以盘口或成交表头改成按 USDC 显示数量时（'Total (USDC)' 后紧跟第一行价格）也会被拒绝；新会话默认按基础代币显示，录屏不切换。输入框的值不与相邻元素拼读：限价输入框的 '0.00' 占位符后面就是 'USDC' 单位，拼读会拒绝公开价格。
- 'Available'（单独的标签，或带文字不带数字的标签，如 'Available to Trade'）：同一元素里的数字算一项，与其后的条目合计最多三项（遇到输入框、滑块或下一个 'Available' 为止），其中带数字的词只能是零（'0'、'0.00'、'0.00USDC'），不带数字的词（代币符号、标签、'-'）不限。所以 'Available 0.00 USDC' 写在一个元素里、或拆成 'Available' / '0.00' / 'USDC' 三个元素都放行；'0 1234'、'Max 12.30'、'Available to Trade' 后的 '12.30'、'$0.00' 都拒绝。这几个条目里的金额只按这条规则判断（规划决定 D25）。
- 公开行情例外只有四处，都按终端自己的标记绑定到元素，不按位置：市场头部 `data-market-stat="volume24h"` / `"marketCap"` 里紧跟 '24h Volume' / 'Market Cap' 标签的数值，整段只能是一个数字加可选的 `$`、`K`/`M`/`B`/`T` 与代币符号（或一个破折号）；`data-market-stat="contract"` 里紧跟 'Contract' 标签的缩写合约地址；手机盘口 `data-slot="compact-orderbook-mid-price"` 里与市场标题旁价格相差 1% 以内的 `$` 价格；桌面盘口悬停提示（`OrderbookHoverTooltip`，`role="tooltip"` 的弹层带 `data-slot="orderbook-cumulative-tooltip"`）里紧跟 'Total (USDC)' 标签的累计报价金额，标签与数值是同一弹层里相邻的两个元素（`<dt>` / `<dd>`），数值整段只能是一个不带符号的数字，标签里的代币取自市场标题（HYPE/USDC 的 USDC）。TradingView 图例里的 'Volume' 标签、'24h Vol'、桌面任何位置的 '$76.50'、标记之外的 'Contract' 后的地址、标记之外（或写在同一元素里）的 'Total (USDC)' 加数字都不放行（规划决定 D25）。
- 必须同时看到：一个写着 Connect（或 Connect Wallet）的可见控件，以及市场标题 `HYPE/USDC` 与相邻的 `Spot` 徽章。
- 两层检查：页面内由 MutationObserver（主文档与读到的同源 iframe）以及悬停、焦点、按压、键盘、滚动、尺寸变化、过渡与动画的开始与结束、图片与字体加载这些事件标记变化，每个有变化或有动画在播放的动画帧都重读一遍，违规带浏览器时间戳；Node 端在每一步之后与每 400 毫秒再检查一次。任何一层命中都停止、不写视频。
- 干跑（2026-10-25，Agent 执行，都不取帧、不写文件；点击用 Playwright 的 click / tap，不走录制时的滑动轨迹）：第一轮修正后的守卫在线上页面桌面 11 秒 584 次页面内检查、单次最长 8.8 ms，手机 7 秒 350 次、最长 5.2 ms，都没有违规；页面内守卫在注入后 3 ms 记下一个只存在 50 ms 的 "40"+"x" 元素，Node 端的检查没有看到；盘口悬停提示（Average Price、Total (USDC) 等）通过（当时的规则不把 'Total (USDC)' 加数字当金额；现在它按第四处例外放行）。第二轮修正后的守卫再跑两次：只用 Node 端读取（每一步之后与停留期间每 150 ms 一次）桌面 87 次、手机 56 次，`data-market-stat` 与 `data-slot` 标记都读到；注入页面内守卫、桌面点击走与录制相同的滑动轨迹（手机用 tap），桌面 15 秒 673 次页面内检查（818 个动画帧）、单次最长 10 ms，手机 7.6 秒 449 次、最长 5.3 ms，每一步之后另有 Node 端检查（桌面 12 次、手机 7 次）。两次都没有违规。加入括号单位规则与第四处例外后再跑一次（同日，Agent 执行，注入页面内守卫，开始前与每一步之后由 Node 端检查，不取帧、不写文件；点击用 Playwright 的 click / tap，不走滑动轨迹）：桌面 531 次页面内检查、单次最长 9.9 ms，Node 端 13 次，点盘口那一步读到的悬停提示条目都带 `orderbook-cumulative-tooltip` 标记（'Total (USDC)' 后是 '3,676'）；手机 374 次、最长 5.6 ms，Node 端 8 次；都没有违规。
- 限制：画在 canvas 上的文字（TradingView 的价格轴与 K 线）、CSS 生成内容、shadow DOM 与跨源 iframe 内容读不到；被其他元素遮住的文字仍算可见（只会多拒绝）。页面内守卫只在上面那些事件、DOM 变化或动画之后重读，浏览器不发事件就生效的样式变化（例如光标不动时内容移到光标下而浏览器没有派发进出事件）要等 Node 端下一次检查。Connect 控件只是一致性检查，不是未登录的证明：真正保证未登录的是每次采集都用没有任何存储的新浏览器上下文。
- 规则测试：`node --test designs/website-hero-prototype/tools/guard.test.cjs`，覆盖审查列出的全部绕过写法与未登录现货页的正常文字（2026-10-25 从线上页面读到的条目，含标记）；其中括号单位规则在弹层外（无标记、标记不全、另一个标记、另一个标签或代币、带符号或带单位的数值、写在同一元素）都拒绝，在弹层内的 'Total (USDC)' + 数字放行；另测 `build-meta.json` 只保留构建标识字段。`node --test designs/website-hero-prototype/tools/guard.dom.test.cjs` 在无头 Chromium 里用本地夹具页（不联网）检查读法：`<body>` 之外的节点、`display: contents`、同源 iframe 偏移、被隐藏的文字、标记、照终端结构写的盘口悬停提示（去掉 `data-slot` 后被拒绝），以及只靠 `:hover` 显示的文字被页面内守卫看到；另用本机临时 HTTP 服务检查读取 `build-meta.json` 的成功、404 与非 JSON 三种情况。

## 录制海报

1. `node tools/record-sample.mjs BTC 135`（本目录运行，需要网络）用与实时视图相同的订阅录 135 秒，写入 `recorded/btc-<时间>Z.json`。成交只保留方向、价格、数量、时间与 `tid`；`users`（双方地址）与 `hash` 从不写入。
2. `node designs/website-hero-prototype/tools/render-posters.cjs <录制文件名>`（仓库根目录运行，需要 3020 端口的静态服务器）打开 `tools/poster.html`，让同一个 Worker 用虚拟时钟回放录制、走与实时相同的校验、场景与渲染代码（回放不检查连接，也不重连、不播种），输出 A/B × 三种画布比例（宽、高、手机）六张 JPEG 与 `posters/btc.json`（每张海报对应的最后状态：价格、涨跌、前 5 档、刻度与中间价标签、24h 走势）。
3. 当前海报：2026-10-24 15:54–15:57 UTC 的 BTC。生产实现按规划每次发布重录重生成（AVIF/WebP），并保留录制日期。

## 数据

- 全部来自 Hyperliquid 公共接口，浏览器直连 `api.hyperliquid.xyz`；没有后端、没有分析脚本、不写浏览器存储。
- **每页一条 WebSocket**，订阅 `l2Book`（`nSigFigs: 5`，20 档，实测约每 5.3 秒推送）、`bbo`（BTC 约每 0.2 秒）、`trades`、`activeAssetCtx`。一条连接上只有一个 `l2Book` 订阅，所以盘口帧不会有归属歧义。
- 合并规则（只用于热度层与中间价）：最优买卖价取 `bbo` 与 `l2Book` 中交易所时间较新的一个；更深的档位来自 `l2Book`，已被更新的最优价穿过的档位丢弃，不补画。
- 前 5 档表不合并：只显示最近一帧完整的 `l2Book` 快照，caption 写这一帧的交易所时间；窗口窄于 900px 时不显示表，只显示一行最新的最优买卖价；窗口 ≥900px 时这一行隐藏，最新顶档只体现在中间价标签与热度层。最初把 `bbo` 拼进表里，价格下行时出现过 79,819 之后直接是 79,811 的假缺口。
- 新鲜度：连接打开、6 秒内有最优价更新、12 秒内有 `l2Book` 才算实时。不满足时 LIVE 与全部实时数字立即消失；「没有数据」指没有通过校验的 `l2Book` 或 `bbo` 帧，从最后一帧有效数据起算 20 秒后清空并重新播种，BTC 同时整幕换回录制海报，恢复后再连续计满 15 秒才回到实时。其余保持第一版：REST 播种（去抖 300 ms、切换时取消）、按 `时间:tid` 去重、订阅后第一条成交按交易所时间放回原位、连接预算（60 秒 3 次、5 分钟 6 次）、静默 30 秒重连、页面隐藏 30 秒断开。
- 视图不可见（在 Terminal 视图、滚出屏幕或仍在录制阶段）时只积累数据、不绘制；只有页面隐藏才会断开连接。
- 价格步长按 Hyperliquid 规则推算（5 位有效数字与 `6 − szDecimals` 小数位上限），不从价格字符串的位数推断。原型的合计与涨跌幅用 JavaScript 浮点数，生产实现改用 Big.js 与协议字符串。

## 实测（2026-10-24 UTC，Agent 执行，第二轮修正后）

仓库的 Playwright 无头 Chromium（`apps/terminal` 的 `@playwright/test`），连接真实的 Hyperliquid 公共接口：

| 检查 | 结果 |
| --- | --- |
| 手机 390×844（A、B 相同） | 主按钮顶边 263px、按钮到风险句 8px、窗口顶边 403px，首屏露出终端截图 350px；Live 视图画布顶边 632px，首屏露出 212px；两视图内容高 618 / 623px |
| 桌面 1440×900 | A：窗口顶边 147px，两视图内容高 416 / 421px，画布 621×194；B：窗口顶边 433px，首屏露出截图 388px，画布 922×496 |
| 桌面 1366×768 | B：窗口顶边 374px（L2 目标 ≤380px）；Live 视图画布顶边 533px，首屏露出 235px（L2 建议 ≥260px，未达到） |
| 桌面 1024–1280 | A：1200 宽两栏、画布 574px，1100 / 1024 宽单列、画布 742 / 666px；按钮到风险句在所有宽度都是 8px；两视图内容高差 ≤14px（1024–1440 的六种宽度与 390×844，两版共十四种组合） |
| 录制 → 实时 | A 桌面与 B 手机：0.5、1、2、5、10、14 秒为 `RECORDED` 与录制数值，约 16 秒整幕替换 |
| 逐帧采样（每个动画帧记录数据区不透明度、海报与画布是否可见、价格与标记） | 正向 1,320 帧、反向 1,384 帧，没有一帧在可见状态下混用录制与实时；正向替换占 12 帧（约 200 ms） |
| 断网（Playwright 离线模式） | 约 6 秒后 LIVE 与实时数字消失，约 21 秒整幕换回 `RECORDED` 海报（规则：最后有效数据后 20 秒，按 1 秒采样） |
| 减少动态效果 | 22 秒后仍是录制海报，「Show live view」可见；点击后进入实时，焦点移到 Pause |
| 录制阶段切换到 ETH | 立即离开录制状态、隐藏海报，约 0.6 秒后显示 ETH 实时数值 |
| 单连接稳定性 | BTC 90 秒、SOL 与 HYPE 各 45 秒：LIVE 中断 0 次，每页 1 条 WebSocket，控制台零错误 |
| 暂停 | 3 秒内画布像素、最新价与盘口不变，状态写 `PAUSED`；恢复后继续移动 |
| 横向溢出 | 十四种组合（两版 × 七个尺寸）都没有 |

逐帧采样只证明主线程每一帧的 DOM 状态与计算样式，不是合成器层的像素证据。这些都是无头浏览器的结果，不是真机：Safari、Firefox、iOS 低电量模式、真实触控、长时间运行的内存与耗电都没有测；24 小时浸泡测试是规划里的验证包 V2，尚未做。截图在会话临时目录，不进仓库。

## 与生产实现的差距

- 海报只有 BTC；其他市场从 15 秒起的增长窗口开始。生产要按发布重录、改用 AVIF/WebP、在构建里校验海报日期。
- 没有 Web Lock 多标签页单连接、没有按字节的数据调速器、没有「仅成交」降级状态。
- 除守卫的 `tools/guard.test.cjs` 与 `tools/guard.dom.test.cjs` 外，没有单元测试、故障矩阵测试与契约测试；热度层在每个采样周期整体重绘。
- 视口 641–690px 时图例换成两行，两个视图高度相差约 60px；没有十字线与提示框。
- 密集成交仍会排成点串（V3），Open Book 没有 Sairn 自己的识别标记（V7），A 的截图只按约 48% 显示（D22）：都等运营方决定（规划第 21 节）。
- 「How email sign-in works」与「Deposit guide」链接是占位（规划第 03 段与阶段 2 的页面）；没有桌面二维码；「Read snapshot」在手机上隐藏。
- 终端截图与录屏是采集当时的线上界面与行情；生产管线要在每次发布前重拍重录，并在终端界面改版时同步。
- 录屏的真机播放、Safari 与 iOS 低电量模式没有测；录屏里看不到系统光标，点击位置靠叠加的演示圆环表示。
- 录屏海报是 JPEG：桌面约 146 KB（`demo-desktop.jpg`）、手机约 75 KB（`demo-mobile.jpg`），超出规划第 13 节的首屏图像预算（手机 ≤45 KB、桌面 ≤80 KB）。B 版桌面与手机上它就是 LCP 元素（无头 Chromium 测得）。生产要改用 AVIF / WebP 海报，并重新量体积与 LCP。
- 没有 JS 时只有这张海报图片：没有视频、没有 Pause / Play，Terminal / Live market 标签、Live market 视图与它的按钮都不起作用，`?v=b` 也不生效（变体由内联脚本设置，没有 JS 时总是 A）；除海报外没有别的无 JS 回退。

## 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 首屏结构、两个视图与原型切换条 |
| `styles.css` | 两套变体的令牌、版式与动效 |
| `main.js` | 主线程：视图与市场标签、录制到实时的切换、暂停、减少动态、走势线、把 Worker 发来的显示字符串写进 DOM |
| `open-book.worker.js` | Worker：单条 WebSocket、校验、场景模型、Canvas 2D 渲染，以及生成海报用的回放模式 |
| `assets/terminal-desktop.jpg`、`assets/terminal-mobile.jpg`、`assets/terminal-capture.json` | 终端截图与采集记录（`index.html` 已不引用，截图管线的产物） |
| `recorded/btc-20261024T1554Z.json` | 海报用的公开数据录制（无地址、无哈希） |
| `posters/` | 六张海报与 `btc.json`（海报对应的最后状态） |
| `tools/` | `capture-terminal.cjs`、`record-demo.cjs` 与 `demo-scenarios.cjs`（终端录屏）、`guard.cjs`（共用守卫，也负责读取终端构建标识）、`guard.test.cjs`（规则测试）与 `guard.dom.test.cjs`（读法测试）、`record-sample.mjs`、`poster.html`、`render-posters.cjs` |
| `media/` | 终端录屏：`demo-desktop.*`、`demo-mobile.*`（MP4、AV1 WebM、首帧海报；海报也是 `<picture>` 里的无 JS 回退）与 `demo-capture.json` |
| `fonts/` | IBM Plex Sans Variable 拉丁与拉丁扩展子集（`@fontsource-variable/ibm-plex-sans@5.2.8`，SIL OFL，许可证附在目录里） |
| `assets/sairn-lockup-on-dark.svg` | `brand/svg/lockup/` 的副本；改 Logo 改品牌源文件，不改这份 |
| `asset-sources.json` | 字体与素材的来源与 SHA-256 |
