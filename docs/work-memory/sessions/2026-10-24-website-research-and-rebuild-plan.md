<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-24-website-research-and-rebuild-plan",
  "date": "2026-10-24",
  "title": "官网行业调研与重建规划",
  "kind": "task",
  "status": "recorded",
  "topics": ["brand-identity", "jurisdiction-marketing"],
  "summary": "官网从原型推进到阶段 2，采用浅色首页、官网专用强调色与 Astro 7。p33 先交付终端依赖，terminal:check 通过后发布官网。其后每日检查报告 xyz:JIO 分类过期，市场配置待校正。",
  "thread": null,
  "baseCommit": "32125377",
  "commits": ["c32fb14c", "a237ed5a", "69a4e7a2", "371674ba", "33267066", "3d994e3d", "c39df181", "d4bd4f9c", "84c8eb1c", "e8bb774f", "6d430d27", "d6a32618", "6858ffba", "2dcfd3e0"],
  "sources": [
    {"path": "docs/website-plan.md"},
    {"path": "docs/adr/0043-website-marketing-accent.md"},
    {"path": "docs/adr/0044-website-light-default-theme.md"},
    {"path": "apps/website/src/lib/markets/live.js"},
    {"path": "apps/website/src/config/featured-markets.ts"},
    {"path": "docs/website-rebuild-plan.md"},
    {"path": "designs/website-hero-prototype/README.md"},
    {"path": "designs/website-hero-prototype/tools/guard.cjs"},
    {"path": "designs/website-hero-prototype/tools/record-demo.cjs"},
    {"path": "designs/website-hero-prototype/media/demo-capture.json"},
    {"path": "docs/marketing/beyond-crypto-review.md"},
    {"path": "designs/beyond-crypto-review/README.md"},
    {"path": "docs/website-industry-research-2026-10.md"},
    {"path": "docs/marketing/jp-launch-email/README.md"},
    {"path": "apps/website/src/config/faq.ts"},
    {"path": "apps/website/src/config/seo.ts"},
    {"path": "apps/website/src/components/Hero.astro"},
    {"path": "apps/website/src/components/Markets.astro"},
    {"path": "apps/website/tests/copy-contract.test.mjs"},
    {"path": "apps/terminal/src/domain/market/calculations.ts"},
    {"path": "deploy/website/README.md"},
    {"path": "brand/brand.json"},
    {"path": "legal/terms.md"},
    {"path": "legal/privacyPolicy.md"},
    {"path": "legal/cookies.md"}
  ],
  "supersedes": []
}
-->
# 官网行业调研与重建规划

## 背景与范围

- 同步记录，与[日本交易地区与营销邮件](2026-10-24-japan-trading-region-and-email.md)同一个 Claude Code 桌面会话，但是另一个任务：那份记录的「官网 sairn.ai 审计」一节之后，运营方认为现官网「太传统」，希望用现代前端与加密原生的技术重做。这句需求转述自工作流的任务说明，运营方原话未取得。会话任务 ID 未取得（`thread: null`）；本机会话目录名是 `c1e345bd-069b-4821-ab73-a7bd5e2b03b2`，只作为 `.worklog/` 的目录名，不是已核对的任务 ID。
- 工作树分支 `claude/japan-user-email-template-d3e2b5`，基线 `32125377`。影响面是文档与 `designs/` 下的设计文件：两份新文档 `docs/website-industry-research-2026-10.md`、`docs/website-rebuild-plan.md`，`docs/README.md` 的导航，本记录；首屏原型 `designs/website-hero-prototype/`（2026-10-24 起；2026-10-25 加入演示录屏 `media/`、录制脚本 `tools/record-demo.cjs` 与 `tools/demo-scenarios.cjs`、DOM 守卫 `tools/guard.cjs` 及其测试）；2026-10-25 的「加密之外的市场」审阅包 `docs/marketing/beyond-crypto-review.md` 与 `designs/beyond-crypto-review/`。`apps/website`、`apps/terminal` 的代码、测试与线上站点都没有改；这两个 `designs/` 目录不进任何构建（2026-10-25 收尾验证核对：只有 `designs/og-cards` 接入官网构建）。2026-10-25 的改动没有提交。
- 关联：现官网的矛盾内容已在邮件 README 闸门 1 列为律师问题（提交 `32125377`）。

## 结论与依据

- 方法（Agent 执行，工作流编排）：
  1. 调研：一个 7 代理的工作流（会话任务输出的摘要行是「Research official websites across crypto and modern fintech: tech stack, motion, messaging, content; plus motion tech and repo assets」），按永续 DEX、Hyperliquid 前端、钱包、交易所（含日本）、现代产品站五段取证约 40 个站点，另查动效技术与仓库资产约束。取证方式是 curl、无头 Chromium（Playwright 1.59.1）与 Wayback 快照；WebFetch 与 WebSearch 在本次运行中因模型错误失败，竞品名单来自已知名单。限制写在调研第 1 节。
  2. 设计：工作流生成三个方向（Open Book 实时市场画布、Live Window 产品即首屏、Plain Sight 编辑式信任与日本优先），由转化与品牌、工程、合规与无障碍三份评审打分。评分（Open Book 7.5 / 6 / 8，Live Window 7 / 7.5 / 6.5，Plain Sight 5.5 / 6.5 / 7.5）与取舍记在规划第 4 节；原文未取得，评分只能追溯到规划与本记录。
  3. 规划：以 Open Book 为底，嫁接另两个方向的部件，按评审必改项 C1–C12、E1–E16、A1–A11 调整。
  4. 评审修订：同日一轮评审对两份文档提出 25 条意见（6 条必须、19 条应该），由子代理逐条对照仓库源码、已安装依赖与调研证据核对后修改。
- 主要取舍（详见规划）：
  - 保留 Astro 静态输出，不引入 UI 框架；首版只用 Worker 里的 Canvas 2D，WebGL2 等实测证明需要再加。依据：同行没有在首页跑实时 WebGL 业务数据，「现代感」来自内容、动效与视觉系统（调研第 4 节第 1、3 条）。
  - 实时数据 fail closed：校验不过的卡移除，不显示 '...'、'—'、'$0'；持仓量按 `openInterest × markPx` 换算（`openInterest` 是基础币单位，终端的 `getOiUsd` 同样换算）；REST 权重按桌面、手机、回退三种路径设上限，手机的最优买卖价改用 WebSocket `bbo`。
  - 阶段 0 先删英文站与日本邮件矛盾的说法（No KYC、12ms、满杠杆、股票与 JP225、交易所钱包名、杠杆与股票问答等，规划第 19 节有逐项的「文件:行」清单），并给 Hero、Footer 与 404 的 CTA 补风险句；日语页由默认关闭的构建开关与机器可校验的闸门记录挡住。
  - 衡量只用聚合数据与统一命名的 UTM（与邮件对齐，进入页面时带的 `utm_*` 透传）；`builder_fills` 的逐地址数据与终端日志里地址和 IP 的关联交给律师。
  - 邮件依赖的 sairn.ai 能力（订阅同意入口、退订路径、追踪子域）列为规划第 18 节的一小节与决定 D19，不再默认官网与邮件闸门互不相干。
- 评审意见的处理：25 条都核对过，大部分按原文采用，以下几处按核对结果改了做法：
  - 存款指南的日语中和句用邮件第 4 版的原句「メールアドレスで登録した場合の入金方法は、入金画面に表示されます。」，不用意见里引用的第 2 轮写法；
  - 签名说法的禁用模式不禁 'your own wallet'（会命中规划首屏副标题草稿的 'connect your own wallet'），改为只禁签名与访问类说法；
  - 品牌名字面量测试只用于 `src` 的文案，内部标识按品牌契约保留 `sairn` 字面量并列例外；`dist` 里品牌名必然出现，只断言没有 `gatu`；
  - 手机画布深度列按 ≥20 s 拉取，才能落在手机 ≤35/min 的权重上限内（≥10 s 约为 40/min）；
  - 日语「免 gas」与「入金」的组合模式限定在一句之内，跨句会误报手续费一节；
  - 截图没有复制进 `.worklog/`（未逐张检查）；方向与评审原文记为未取得；
  - 本规划的 D1–D19 保留编号，提到品牌迁移计划的决定一律写全称，没有改成 W 编号；
  - 邮件 README §6 第 2 条 (b) 没有改：是否修改取决于 D19 的决定。

## 验证与限制

- 这一步只改文档。核对时读取了 `apps/website/src` 的相关文件（行号为 2026-10-24、基线 `32125377` 的读数）、`apps/terminal/src/domain/market/calculations.ts` 第 75 行与 `funding-comparison.ts` 第 240 行、已安装的 `@tailwindcss/vite` 4.1.18（`peerDependencies.vite` 为 `^5.2.0 || ^6 || ^7`）与 `@fontsource-variable/ibm-plex-sans` 5.2.8 的 LICENSE（OFL 1.1，版权行没有 Reserved Font Name）、`@nktkas/hyperliquid` 0.33.3 的 `recentTrades.d.ts`（第 41–42 行有 `users`）、品牌与法律文件、发布手册与邮件 README。
- 用 Python 按 sRGB（D65）复算了 CIELAB 色度与 CIE76 ΔE：#12131a C*ab 5.0、#0F1A1F 6.0、#212d33 6.4、#0A3038 13.3、#03211c 12.8；#12131a 对 #04060c 的 ΔE76 5.1。未经设计方复核。
- 没有运行官网测试、构建或浏览器检查；规划里的测试、预算与开关都是提议，没有实现。所有法律相关内容都不是法律意见。
- 本地证据：`.worklog/2026-10-24/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-website-research/`（Git 忽略，约 0.8 MB）：`research-web.json`、`research-digest.md`、`playwright/exchanges/*.json`、`playwright/wallets/*.json`、采集脚本与 `manifest.json`（每个文件的 SHA-256、脱敏说明、未复制的 46 张截图的文件名、大小与 SHA-256）。脱敏只替换了本机用户名；文件里的邮箱是公开的企业地址与示例地址，没有发现钱包地址、密钥或令牌。原件在会话临时目录，不保证保留。
- 未取得：三个设计方向与三份评审的原文；运营方的原话。
- 以上是 2026-10-24 第一轮的验证与证据；之后各轮的验证、证据位置与未保存的证据写在下面各节「追加」里。

## 追加：首屏原型（2026-10-24，同一会话）

- 运营方要求做一页首屏原型：实时 Open Book 画布加 Live Window，分「克制版」和「更大胆版」两套配色与动效对比选择。原型放在 [`designs/website-hero-prototype/`](../../../designs/website-hero-prototype/README.md)，静态文件，用 `.claude/launch.json` 现有的 `design-handoff` 配置（端口 3020）预览，不进官网构建。
- 做的过程中实测出两件规划没有覆盖的接口事实，已追加到[重建规划](../../website-rebuild-plan.md)第 10 节「2026-10-24 原型实测（追加）」：完整深度 `l2Book`（20 档，任何 `nSigFigs`）约每 5.3 秒才推送一次，只有 `fast: true`（5 档，约 0.5 秒）或 `bbo`（约 0.2 秒）适合判定新鲜度；订阅后第一条 `trades` 消息是约 30 笔、可早至 80 多秒前的历史快照。原型因此用两条连接（快速流与深度流）并合并两本簿；这与规划「每页一个连接」的取舍留给阶段 1 与决定 D8。
- 一轮三视角审查（数据与资源、无障碍与动效安全、设计；Agent 执行，只读）提出 36 条意见，必须项全部修正，详见原型 README「实测」一节。设计视角指出 B 原稿把琥珀用在 8 个地方、超出 ADR 0028，修正后 B 只在流动性热度与「现在」标记上用琥珀，标题改为灰白双色。
- 验证（Playwright 无头 Chromium，不是真机）：桌面 1440×900 与手机 390×844 各约 100 秒与 70 秒，控制台零错误、无横向溢出、LIVE 逐秒采样 0 次中断；暂停与减少动态效果下画布 3–4 秒内像素不变；连按 6 次方向键切换市场只发出 3 个 REST 请求。Safari、Firefox、真机触控与长时间运行没有测。
- 待运营方：看原型选 A 或 B（或各取部分），据此定规划第 21 节的 D3（画布）、D4（字体）、D5（琥珀）。

## 追加：GPT 对抗审查（2026-10-24，同一会话）

- 运营方要求调 GPT 对规划做对抗审查、看布局与审美并评分。Codex CLI `gpt-6-astra`，只读、`medium`，附 6 张截图，三路并行（布局 L、视觉 V、方案 S），各约 9–11 万 token。
- 评分：L 6.7、V 6.6（A 6.4、B 6.8）、S 6.3；无 P0。共同的 P1：首屏画布不证明 Sairn 的产品、最佳画面要等约 100 秒、手机首屏看不到画布、B 的琥珀超出 D5、画面主次不清、第 10 节单连接与原型实测矛盾、信息架构冗长、邮箱入口与衡量方案不成立。摘要与主会话核验写在[重建规划](../../website-rebuild-plan.md)第 23 节。
- 核验：引用的规划行号与 ADR 0028 决策 6 属实；Playwright 实测手机窗口顶边 613px、画布首屏露出 0、主按钮到风险句 96px、B 在 1366×768 画布可见 148px、A 画布占窗口 57%，与 GPT 推算一致。
- 证据：提示词、三份报告与截图在本机 `.worklog/2026-10-24/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-gpt-review/`（附 SHA256SUMS，Git 忽略）。
- 待运营方：是否按审查意见修订规划与原型。

## 追加：按 GPT 意见修订（2026-10-24 UTC，同一会话）

- 运营方要求：「按 GPT 的审查意见修订：首屏加入真实终端预览，冷启动用录制海报，压缩手机首屏，收敛整页信息架构和数据路径，然后再让 GPT 复审一轮」。
- 规划由一个子代理按主会话给定的决定改写（开头与第 2–11、13–14、16、18–23 节，新增第 24 节逐条处理表），主会话随后按原型实测校正了宽高比、五档表来源、回到海报的条件与第 24 节状态，并写入实测小节。
- 原型改为第二版（[README](../../../designs/website-hero-prototype/README.md)「第二版改了什么」）：Preview 窗口默认显示 app.sairn.ai 未登录的 HYPE/USDC 现货截图，Live market 为第二视图；BTC 用 135 秒公开数据录制（不写 `users` 与 `hash`）经同一 Worker 虚拟时钟回放生成的海报冷启动，连续 15 秒有效实时数据后 200 ms 交叉淡化；每页一条 WebSocket（`l2Book` + `bbo` + `trades` + `activeAssetCtx`）；B 改为灰阶、两版都不再用琥珀；成交按同一时间同方向合并为一点；五档表只显示一帧完整快照并写交易所时间。
- 截图来源：永续页面有 `40x`、`10x`，所以改拍现货；DOM 守卫要求可见的 Connect 按钮，并拒绝杠杆、`xyz:`、钱包品牌、testnet、PnL 与账户摘要字样（第一次运行时把手机中间价 `$74.852` 误判为金额，改为未登录断言）。这改变了规划 A7「截图只用夹具数据」的规则，列为决定 D21。
- 验证（Playwright 无头 Chromium，连接真实公共接口，不是真机）：手机 390×844 主按钮顶边 263px、按钮到风险句 8px、窗口顶边 403px、露出截图 383px、Live 视图画布露出 251px；录制到实时在约 16–18 秒切换且数值同时更换；减少动态时停在海报；单连接 BTC 90 秒、SOL 与 HYPE 各 45 秒 LIVE 中断 0 次；断网约 26 秒淡回海报、恢复后重新进入实时；六种版式组合无横向溢出、控制台零错误。实测中修正了三个缺陷：非 BTC 初始市场时画布不显示、五档表拼入 `bbo` 的假缺口、回到海报时旧元数据缺快照时间导致 'Invalid time value'。
- 没有做：24 小时浸泡（V2）、真机与 Safari、理解测试（V1）；Biome 配置忽略 `designs/`，原型脚本只做了 `node --check`。
- 更正（第二轮审查后补记）：本节的「200 ms 交叉淡化」「数值同时更换」是第二版首次实现时的说法，实际只淡化了画布，数值先换成实时值；「断网约 26 秒淡回海报」实为 LIVE 撤下后再等 20 秒的实现偏差，回海报是硬切。原型已改为整幕替换，断网约 21 秒回海报（下一节、规划第 7、24、25 节）。规划第 10 节的「2026-10-24 原型实测（追加）」已改名为「2026-10-24 原型实测（证据；结论已并入上面的数据路径表）」，上文原型首版的两条连接已由每页一条取代，D8 不再裁决这一项。

## 追加：第二轮 GPT 审查与修正（2026-10-24 UTC，同一会话）

- 第二轮审查：同样三路、只读、`medium`，附 11 张截图（第二版 9 张、第一轮对比 2 张），每路带上自己第一轮的报告并逐条复核。评分 L 6.7→7.9、V 6.6→7.4（A 6.4→7.1、B 6.8→7.7）、S 6.3→7.2，无 P0。第一次启动三路都失败：zsh 不按空格拆分未加引号的 `$IMGS`，整串图片参数被当成一个位置参数；改用数组后成功。
- 核验：用 Workflow 起 7 个只读代理分组对抗核验新意见（交接混用、LIVE 判定、规划文字、身份说明、A 截图与断点、验证设计、视觉打磨）。确认属实并当场修正的有：录制到实时只淡化画布而数字先换（与 README「从不混用」的说法不符）、LIVE 不检查连接与坏帧计数共用、失效时状态行仍写 Live 且 20 秒有三种口径、身份说明放得太晚并被单行省略、A 在 1024–1199 宽时画布不到 560px、规划合并规则的例子方向写反、「同一时间同方向 = 一笔吃单」的说法不成立（只是显示合并）。交运营方的有：A 截图缩放（D22）、Open Book 识别标记（D23）、密集点的处理、B 矮屏画布仍不足 260px、V1 的门槛与基线。
- 修正后实测（无头 Chromium，真实公共接口）：逐帧采样正反两向各约 1,300 帧，没有一帧在可见状态下混用录制与实时；断网约 21 秒回海报（规则 20 秒）；1024–1440 六种宽度与 390×844（共七种尺寸）两版的两视图高差 ≤14px；手机主按钮顶边 263px、窗口顶边 403px；B 在 1366×768 窗口顶边 374px、画布露出 235px（风险句改为桌面也紧贴按钮 8px 后的读数）；BTC 90 秒与 SOL、HYPE 各 45 秒单连接 LIVE 中断 0 次。修正过程中又发现并修了两个回归：海报元数据缺成交时间导致 'Invalid time value' 使海报整段跳过、交接异常时数据区一直透明（改为 `finally` 清除）。
- 规划文字由一个子代理按核验结论修订，主会话复核后追加第 25 节记录本轮审查。证据：提示词、三份报告、核验结果与截图在 `.worklog/2026-10-24/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-gpt-review2/`（Git 忽略）。

## 追加：产品演示录屏与「加密之外的市场」审阅包（2026-10-25 UTC，同一会话）

- 运营方看第二版原型后指出首屏只有一张截图、没有动效与功能介绍，参照 hyperliquid.xyz；问视频怎么做，并认为美股与未上市公司（例如 OpenAI）的 HIP-3 永续是好卖点。随后决定：产品演示之外，再做一版「加密之外的市场」视频与区块草稿，只供律师审阅，不上线。
- 调研（Workflow，3 个只读代理）：终端录屏可脚本化的步骤与守卫通过情况；HIP-3 事实（截图里的 `io` 是 EntropyIO，运营方 Bursa Global Inc.；OpenAI、Anthropic 按部署方对公司估值的估计定价，1 USD 对应 10 亿美元市值，外部数据权重不公开，未上市满 2 年到期结算且文档前后矛盾；PEARL 是加密资产；5 个「已下架」io 市场更像注册后从未开盘）；律师问题清单与英文文案草稿。
- 产品演示：`tools/record-demo.cjs` 按 `demo-scenarios.cjs` 操作未登录终端（只录现货、不打开市场选择器，因为永续页有杠杆倍数、选择器的现货列表会出现代币化股票与不雅代币名），与截图共用 `tools/guard.cjs`；桌面 15.5 秒（守卫 50 次通过），手机 8 秒（26 次通过），接入首屏 Terminal 视图，带暂停按钮、减少动态与省流量时不播放。制作中修了三处：ffmpeg 的 concat 把每帧至少算 1/25 秒导致视频拉长到 29 秒（改为自己重采样到 30 fps）；无头 Chrome 屏幕广播在手机模拟下只给 CSS 像素（手机改用 2 倍像素连续截图）；演示指针在 TradingView iframe 上收不到鼠标事件（改由录制脚本直接定位）。
- 守卫规则细化：手机现货页未登录时显示 'Available 0.00 USDC'，守卫只放行紧跟 'Available' 的零值占位，非零金额拒绝（规划 D25，待运营方确认）。
- 审阅包：`docs/marketing/beyond-crypto-review.md`（子代理按两份调研合并并更正）；`designs/beyond-crypto-review/`（区块草稿页、通用版 15 秒与命名版 18 秒视频、终端现状截图）。部署方风险声明没有人代为确认；研究代理另拍的「用 CSS 隐藏弹窗」截图改动了产品画面，没有收进审阅包。命名版视频原稿里「not affiliated with these companies or deployers」仓库无法证明，先改为「Sairn is an independent interface」；审阅文档定稿后，命名版视频与区块表格按文档第 5.3 节与第 4.4 节模板 R1、R2 重做（代码 `OAI`、部署方给的公司名、上市与未上市分屏、方法页深链），第 6 屏的「not affiliated with these companies」标为待 E4，两版视频重新渲染。
- 规划：第 2 节非目标与 A9 改为允许静音循环的真实终端录屏；第 6、9、13 节写入录屏；新增 D24（加密之外的市场，待律师）、D25（零值余额规则）与第 26 节。
- 没有做：整页其余区块（02–07）还没有做成原型；视频真机播放与 Safari 未测；审阅包没有发给律师，也没有上线任何内容。
- 更正（收尾验证后补记）：上面「按部署方对公司估值的估计定价，1 USD 对应 10 亿美元市值」是调研时的转述。EntropyIO 文档的说法是以公司市值（market cap）报价，价格 1 代表 10 亿美元市值，理由是私募轮次的股数不确定；上市后仍按市值报价，因为 Hyperliquid HIP-3 还不支持拆股；评分标准公开，评分与聚合程序是内部的，聚合结果由 RedStone 上链（`snapshot-deployer-docs/web2/docs.entropy.io_market-types_pre-ipo-perpetuals.txt`）。规划第 26 节已改为「公司市值（EntropyIO 的说法）」。
- 证据：本节的调研工作流（3 个只读代理：terminal-script、hip3-facts、legal-questions）的结果没有复制进 `.worklog/`（不在 2026-10-25 整理证据时指定的来源里），只在本机会话目录的 `subagents/workflows/wf_d276bfb7-7ca/`，不保证保留。第一次录制（桌面 15.5 秒、手机 8 秒）的视频与报告已被下一节的重录替换，`media/` 里只有重录的文件，第一次的没有另存。研究代理另拍的「用 CSS 隐藏弹窗」截图没有保存。

## 追加：对抗审查与修复（2026-10-25 UTC，同一会话）

- 两个只读审查代理：审阅包 16 条（P1：页面把挑出的示例写成「其余全部列出」；上市前两行漏了「无 IPO 配售权」），录屏 18 条（P1：守卫只在 Node 端每 400 ms 与每步之后检查，两次之间的短暂画面没人看过；正则逐个文本节点匹配，终端把杠杆写成 "40"、"x" 两个节点，HIP-3 名称去掉前缀显示，都漏检）。
- 修复用工作流：两组文件各一个修复代理，各两个只读代理交叉验证，再修一轮；8 个代理无报错。
  - 录屏：`tools/guard.cjs` 改为纯规则函数加按元素读取（含输入框与同源 iframe），页面内 MutationObserver 加 requestAnimationFrame 逐帧检查并打浏览器时间戳，Node 端仍每步与每 400 ms 检查；手机帧前后两次检查都通过才保留；只编码最后一次通过的检查之前的帧；编码在暂存目录完成并经 ffprobe 校验后整体移入 `media/`，TV 范围 BT.709；`tools/guard.test.cjs` 12 项与 `tools/guard.dom.test.cjs`。为让未登录页面能录，守卫按终端标记放行三处公开行情（市场头部成交量与市值、代币合约缩写地址、手机盘口中间价），写进规划 D25，待运营方确认。
  - 首屏播放：去掉 `aria-pressed`，按钮跟随 play / pause 事件，`play()` 被拒绝时显示 Play，中途开启减少动态或 Save-Data 即暂停，按断点换源、海报与 `aria-label`。
  - 审阅包：表格只留 SNDK、NBIS、ANTH、OAI（与具名版视频一致），DRAM、EWY 因没有 ETF 模板删除；加选取说明（示例、不完整、不是审计或批准）；上市前行补「无 IPO 配售权」并改写方法归属（评分方法不公开、RedStone 上链）；地区限制改为 'persons in the United States or other restricted locations'，主张状态改为部分有证据；主张编号 H3-n 改为 BC-n；可选列改为 Mark price、USDC、上市前行不显示价格；方法链接改到具体文档页。
- 主会话：重录两段演示（桌面 18.25 s，页面内检查 907 次、Node 端 57 次；手机 7.46 s，页面内 450 次、Node 端 194 次；全部通过），重新渲染两版审阅视频并逐屏取中点帧核对字幕；通用版第 2 屏改为 'Some of these markets reference companies that are not publicly listed.'（原句易被读成名词短语）；7 个部署方文档页 2026-10-25 均返回 200，EntropyIO 页原文确认 'IPO allocation' 与 RedStone；无头 Playwright 核对首屏：手机与桌面各自的源、暂停、减少动态只显示海报、跨 640px 换源，控制台零错误。应用内浏览器面板隐藏时视频不加载，是面板隐藏的假象，不是缺陷。
- 规划同步：第 6 节循环与播放规则、第 8 节例外、第 13 节体积、第 21 节 D25、第 26 节实测与审阅包描述。
- 证据（2026-10-25 补存，Git 忽略；路径前缀 `.worklog/2026-10-25/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/`，每个快照有 `manifest.json` 与 `SHA256SUMS`；本机用户名替换为 `<user>`，会话临时目录写作 `<session-tmp>`，扫描后没有发现邮箱、钱包地址或令牌）：
  - `snapshot-adversarial-review/`：两个只读审查代理的最终报告（审阅包、录屏），只抽取各自转录的最后一条助手消息；
  - `snapshot-fix-verify/`：修复工作流 8 个代理的结果对象（修复、两路验证、返修）与事件顺序。README 列出的干跑检查次数（桌面 584 / 手机 350、桌面 673 / 手机 449）出自其中 `results/04-fix-recorder.json` 与 `results/08-repair-recorder.json` 的 `checksRun`；
  - `snapshot-deployer-docs/`：审查代理（`web/`，2 页）与主会话（`web2/`，9 页）用 curl 取得的 EntropyIO 与 trade[XYZ] 文档页，只保留去掉标签后的文本，HTML 原件只记了大小、SHA-256 与文件时间。`web2/` 里 7 页的文件时间是 06:49–06:50Z（上文「7 个部署方文档页」），另外两页（EntropyIO Pre-IPO Assets、XYZ Holiday Closures）是 07:15Z 为下一节的收尾验证意见补取的；
  - `snapshot-frame-sheets/`：主会话核对重录后的录屏与重渲染的审阅视频用的四张帧拼图（按文件时间推断对应 06:49Z 的录制与随后的渲染；复制前逐张目视检查过）。
- 守卫测试的结果（代理报告，本记录没有重跑这一版本）：返修代理报告 `tools/guard.test.cjs` 12/12、`tools/guard.dom.test.cjs` 5/5 通过（后者在沙箱外启动无头 Chromium），并报告把这两个测试套到改动前的守卫上分别有 4 项与 3 项失败；收尾验证代理之后同样报告 12/12 与 5/5。
- 没有保存：审查与修复代理的完整转录（只存了最终报告或结果对象）；审查代理抽出的帧（`scratchpad/frames/`）；13 张单帧 PNG（没有逐张检查，只在 `snapshot-frame-sheets/manifest.json` 记了文件名、大小与 SHA-256）；部署方页面的 HTML 原件。

## 追加：收尾验证与文档同步（2026-10-25 UTC，同一会话）

- 重录与重渲染之后，主会话用 Workflow 起 3 个只读验证代理（审阅包一致性、录屏与文档、完整性）。主要意见：
  - 守卫实际放行了第四处公开行情：盘口悬停时的累计提示框 'Total (USDC)' 加数值（重录的桌面录屏约 7–8 秒处可见），规划第 9 节与 D25 只写了三处，运营方确认 D25 时会依据不完整的描述；
  - 原型的 Terminal 视图没有不依赖 JS 的画面（海报、尺寸与 `aria-label` 都由脚本设置），与规划第 6、7 节的无 JS 回退不符；
  - 规划第 13 节的首屏图像预算仍按截图写，而原型海报是首帧 JPEG（桌面 146,608 B、手机 76,942 B），两端都超出预算；
  - 桌面录屏是 1 倍像素（1440×732），少于它取代的 1.5 倍截图（2160×1098），规划与 README 都没写，D22 与 B 版清晰度的判断依据随之改变；
  - 规划第 9、14 节的说明与无障碍文字、第 16 节 V1 的误解题与「点截图」仍以静态截图为前提，演示指针带来的误解风险没有记录；
  - 录制报告没有记录终端构建标识；原型现有的截图是 2026-10-24 用旧守卫拍的；
  - 审阅包仍说视频待重渲染，几处部署方说法与引用的页面不符（例如把 EntropyIO 以市值报价说成因为没有交易所价格）；
  - 2026-10-25 各轮没有保存本地证据，本记录的摘要、来源、范围与后续事项没有跟上。
- 主会话据此起修复工作流，分规划与任务记录、审阅包、原型三组。本条只记规划与任务记录这一组（Agent 执行）；审阅包与原型两组的结果、之后的重录、重拍与重渲染由主会话补记。
  - 规划（第三轮修订的同步）：文档头日期；第 1 节目标、第 4 节（加一段说明重评是按第二轮的静态截图打的分，没有重评）、第 6 节 Terminal 视图（录屏与截图回退的说明分开写、录制像素、演示指针、无 JS 时的首帧海报）、第 7 节回退阶梯第 3 条、第 9 节、第 11 节依赖说明、第 13 节首屏图像预算（录屏海报；原型 JPEG 超出，生产改 AVIF/WebP 后重测）、第 14 节、第 16 节 V1（三道录屏误解题、「点录屏」）、第 19 节验证包与产物、第 20 节风险（新增录屏误解一行）、D20–D22 的背景（推荐不变）、第 22、26 节；EntropyIO 的单位改为「公司市值（EntropyIO 的说法）」。D25 一行与第 9 节列守卫例外的一条由主会话改，本组没有动。
  - 本记录：摘要、来源、范围，2026-10-25 各节的证据位置，后续事项。
- 证据：收尾验证 3 个代理的结果对象在 `.worklog/2026-10-25/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-final-verify/`（Git 忽略，有 `manifest.json` 与 `SHA256SUMS`）。没有保存：这 3 个代理的完整转录；修复工作流本身（进行中，结果由主会话补存）。
- 验证（本组）：`git diff --check` 通过；重读了规划改动的段落；用 grep 复核规划里剩下的「截图」都指现站、第 02 区块、测试方法、律师预览或第二轮的记录（第 23–25 节由第 22 节的一条说明统一标注）。2026-10-25T07:31Z 运行 `node --test designs/website-hero-prototype/tools/guard.test.cjs`：14/14 通过；这是修复工作流进行中的版本（`guard.cjs` SHA-256 `eb9f7a62…`、`guard.test.cjs` `761ea802…`），不是收尾验证时 12 项的那一版，重录前后还可能再变。没有运行 `guard.dom.test.cjs`（要在沙箱外启动 Chromium）。`pnpm memory:index`、`memory:check`、`memory:test` 的结果见本节最后一条。
- 记录检查（2026-10-25 约 07:33–07:35Z，本组依次运行两遍，工作区未提交）：`pnpm memory:index` 只改了 `INDEX.md` 里本记录的两行摘要；`pnpm memory:check` 输出 'Work-memory index verified.'；`pnpm memory:test` 8/8 通过。主会话补记另两组之后要重新运行这三条。

## 追加：最后一轮修复、第三次录制与提交（2026-10-25 UTC，同一会话）

- 最终核查（工作流 3 个只读代理）提出约 25 条，按三组文件交给修复工作流（各一个修复代理与一个只读核查代理，6 个代理无报错），结果存于 `.worklog/2026-10-25/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-final-round-fixes/workflow-results.json`。
  - 审阅包：R1 的「节假日」补上 XYZ Holiday Closures 页并在 BC-18 写明是推断；R2 的可调边界补上 EntropyIO pre-ipo-assets 页（'may be updated at the market operator's discretion'）；计价单位改用 EntropyIO 的说法 'company market capitalisation'；具名版第 3 屏去掉因果 'so'；R2 评分句由主会话定为被动语态 'the criteria that data is scored on'，不把评分归于 EntropyIO（与审阅文档第 10 项一致）；视频状态说明、编号前缀与依赖文件说明更正。
  - 首屏原型：括号单位标签（如 'Total (USDC)'）后接数字算金额，第四处例外绑定 `data-slot="orderbook-cumulative-tooltip"`；无 JS 时显示静态 `<picture>` 首帧海报，视频与按钮在 JS 就绪前隐藏；报告写入终端构建标识与按取帧方式区分的时钟说明；主会话另加：页面级 Pause 同时暂停录屏（恢复时回到录屏自己的状态），截图脚本去掉已失效的路由参数，读页面内守卫前先等一个动画帧。
  - 规划与记录：第 6、7、8、9、13、14、16、21、26 节按录屏改写（无 JS 海报、说明与 `aria-label`、V1 录屏误解题、播放脚本预算、D22 的录屏裁切、D25 四处例外、EntropyIO 的原文理由）。
- 第三次录制：第一次尝试在桌面被录制器自己拒绝（页面内守卫最后一次运行时间早于最后一次 Node 检查几毫秒，读数时序问题，没有写出任何视频），改为读数前先等一个动画帧后重试通过：桌面 17.55 s（视频 17.53 s），页面内检查 766 次、Node 端 55 次；手机 7.44 s，176 帧，页面内 443 次、Node 端 201 次；报告记录线上终端 `cloudfront-2026-10-14-p32`（commit `9ccb88c0`）。截图按现行守卫重拍（桌面 2160×1098、手机 780×1210，前后两次检查都通过，同源 iframe 都读到）。两版审阅视频重新渲染，具名版 6 屏按完全显示阶段中点取帧核对，与审阅文档第 5.3 节一致；两段录屏抽帧（桌面每 2 s、手机每 1 s 与片尾）看过，没有杠杆、HIP-3 市场、钱包地址或账户金额，片尾回到 Market / Buy。
- 无头 Playwright（`http://localhost:3020`）：无 JS 时桌面与手机各显示自己的首帧海报、按钮与视频隐藏、只下载海报；有 JS 时两端播放各自的源、海报对辅助技术隐藏；在 Live 视图按页面级 Pause 后切回 Terminal，录屏暂停，取消后恢复；用户自己暂停的录屏在页面暂停与恢复后仍保持暂停；控制台零错误。`guard.test.cjs` 14 项通过。
- 提交在本地分支，没有推送，没有发布；审阅包没有发给律师。


## 追加：运营方决定与新版官网规划（2026-10-25 UTC，同一会话）

- 运营方看过录屏后说：演示动画目的不明确、没有声音，视频由运营方自己创作；先把官网规划好。运营方问律师是否需要做决策；Agent 说明律师只关系到日本与 HIP-3 股票两件事，并用选择题请运营方决定。
- 运营方决定：
  1. 「肯定要宣传」HIP-3 美股与 OpenAI 等未上市公司的永续，学习 Hyperliquid 官方的实现，不要因为单一市场的限制否定产品规划；
  2. 「律师已经完全同意到日本展开」，放行这条历史限制，不要再询问（运营方陈述，书面意见原文不在仓库）；
  3. 这一版不做日语页；
  4. 视频放哪里等视频做好再定。
- 新规划用工作流完成（8 个代理无报错：三路调研、起草、产品/准确性/工程三路审查与一轮修订），结果存于 `.worklog/2026-10-25/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-website-plan-v2/workflow-results.json`；主会话通读全文，并对照代码核实了首屏截图依赖的 Traditional Finance → Pre-IPO 子页签与六种界面语言。
- 产物：[官网规划](../../website-plan.md)（334 行，取代 `docs/website-rebuild-plan.md`，旧规划保留为历史）。按 W1、W2 同批更新：旧规划、审阅包与两个设计目录加取代说明；ADR 0042 追加更新一节；日本邮件 README 的闸门 1 按运营方陈述视为已满足；`deploy/website/README.md` 第 4 条改为运营方书面确认；`docs/agent-handbook.md` 增加「不设律师闸门」一条；`docs/README.md` 入口改指新规划。
- 本轮没有改代码，没有运行官网测试或构建；新规划里的公共接口读数与第三方站点读法是调研代理 2026-10-25 用 curl 做的，原始输出只在上面的工作流结果里。

## 追加：阶段 1 实施（2026-10-26 UTC，同一会话）

- 运营方要求按规划开始阶段 1：先做终端 T1，再改写现站。
- T1：`hip3-deployers.ts` 加 `io → https://docs.entropy.io/`，测试与 CHANGELOG 同步，提交 `c39df181`；HIP-3 相关 5 个测试文件 53 项通过、终端 typecheck 通过。
- 官网阶段 1 用工作流实施（数据层、页面、契约与 CI 三段顺序实施，规划符合度、工程、渲染三路审查，一轮修复；7 个代理无报错），结果存于 `.worklog/2026-10-26/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-website-phase-1/workflow-results.json`。
- 主会话复核时发现行情条要约 2 分钟才出齐数字（≤30 权重/分钟的自设预算只能每 60 s 发一次请求），改为 ≤60 权重/分钟、首轮同时请求，并同步规划第 7 节与测试；实测行情条进入视口后约 1 秒数字出齐。另按原页把 io:OAI 结算日更正为 2028-09-02（规划第 7 节同步）。
- 验证（本工作树当前版本）：`pnpm --filter @sairn/website test` 42 项、`build` 7 页、`test:dist` 19 项、`node --test scripts/ci-workflows.test.mjs` 16 项全部通过；无头 Chromium 在 1440 与 390 宽截图看过（减少动态模式下各区块都显示，没有横向溢出，控制台零错误）；开启动效时区块要滚进视口才淡入，整页一次截图拍不到，属截图手法而非缺陷。没有在真实浏览器里人工查看，没有记录首屏 10 s 传输字节。
- 发布阻断：`pnpm --filter @sairn/website terminal:check` 对线上 p32（`9ccb88c0`）失败，因为 T1 与 ADR 0042 都还没有随终端发布；终端发布后重跑通过才能发布官网。
- 待运营方决定：品牌主色 `--signal` 与 Hyperliquid 主色的 ΔE76 只有 8.5（规划第 6 节要求 ≥15），已作为待决例外列在 `brand-contract.test.mjs`；快照满 7 天后首页构建失败，会连带阻断只改法律页或品牌的 PR，是否只在发布构建里拦截待定。
- 预期事件：xyz:JIO 预计 2026-10-28 上市后转为普通股票永续，届时每日检查会报红，需要更新快照与 `deployers.ts`。

## 追加：阶段 2 首页重做、两轮 GPT 评审、琥珀强调、平台升级与浅色版（2026-10-26 UTC，同一会话）

- 运营方三次反馈推动方向：阶段 1 后「样式颜色跟之前的官网一模一样」；只换字体与底色的第一版阶段 2 后「样式还是没有什么变化，要学习应用调研里其他官方的做法」；按调研重做后又说「设计太古老、不新颖、技术落后、太暗」。
- 实施（子代理，主会话审看每轮截图）：
  - 按调研第 4、9 节重做首页结构：轮换品类词首屏、Terminal / Live market 预览窗口（实时订单簿画布从原型移植）、统计带、跑马灯行情条、分标签行情表、分标签功能截图（新采集 6 张）、订单流转图与官方网址防钓鱼区块、CSS 滚动驱动显现。
  - gpt-6-astra（Codex CLI，只读，medium）两轮评审：7.4 → 8.2 / 10。第一轮的 8 条全部落实（首屏写明资金在自己账户与链上订单簿执行、手机首屏压缩、订单簿画布加坐标与图例、统计分「市场目录 / 实时活动」两组并附方法、`#account` 账户与执行说明等）。报告存于 `.worklog/2026-10-26/c1e345bd-069b-4821-ab73-a7bd5e2b03b2/snapshot-website-redesign/`。
  - 运营方看过薄荷与琥珀并排对比后选定方案 B：官网营销强调色用 Logo 的选择琥珀，`brand.json` 新增 `websiteColors.*.marketingAccent`，[ADR 0043](../../adr/0043-website-marketing-accent.md)，ADR 0028 追加更新；琥珀不进风险、警告与状态（测试钉住）。
  - 平台升级（只限官网）：Astro 5.14.6 → 7.4.2（Vite 8）、Tailwind 4.0.6 → 4.3.3、`@tailwindcss/vite` 4.3.3；官网工作流 Node 22.15.0 → 22.23.4（Astro 7 拒绝在 22.18 上运行）；lockfile 合并后只有官网 importer 变化。新特性：CSP meta（含 `wss://api.hyperliquid.xyz`）、Fonts API（回退度量因 Astro 7.4.2 缺 `unicode-range` 而关闭）、跨文档 View Transitions（减少动态守卫内）、`sibling-index()` 错开显现、`@starting-style`、容器查询、`color-mix(in oklab)` 派生光晕、`text-wrap`。构建 wall 时间 2.4–3.0 s → 1.6–2.2 s。
  - 运营方选定浅色明亮版并确认采用：纸色画布 `#fafaf5`、字标墨色标题、中性墨色正文、浅色琥珀 `#99621f`，产品窗口保持深色，`?theme=dark` 保留深色令牌对比；[ADR 0044](../../adr/0044-website-light-default-theme.md) 已接受。
- 本轮还修了：Live 行情条首轮要约 2 分钟才出齐（自设预算 ≤30 权重 → ≤60 权重/分钟，首轮同时请求）；页签选中样式在 `@layer components` 里被工具类覆盖从未生效；首页卡片滚动行第一张贴窗口边。
- 验证（2026-10-26，本工作树，Node 24.15）：`pnpm --filter @sairn/website test` 73 项、`build`、`test:dist` 37 项、`node --test tests/brand-cross-app.test.mjs` 7 项、`pnpm brand:check`、`pnpm og:check`、`node --test scripts/ci-workflows.test.mjs` 17 项全部通过（以提交前主会话复跑为准，见下一条）；无头 Chromium 1440 / 390 截图，无 CSP 违规、无横向溢出。没有在 Node 22.23.x、Safari、Firefox、真机、200% 缩放与键盘走查下验证；Live market 底部指标在本机未确认实时连接；终端包体积未测（终端读取 `brand.json`，新增 `websiteColors` 可能占用约 460 字节余量中的几十字节）。
- 待运营方决定：三个与 Hyperliquid 色差不足 15 的既有品牌值（标题墨色 `#08262e`、浅色焦点 `#176b64` 及其悬停色）；`?theme=dark` 上线后是否保留；Astro 字体回退度量待上游修复后再开。
- 运营方另问 Tailwind 与前端技术现状：主会话按 npm 官方仓库 2026-10-26 的版本作答（Tailwind 4.3.3 无 v5、Vite 8.3、React 19.3、TypeScript 7.0、Astro 7.4）；终端的 Vite 8 / TypeScript 7 / Biome 2.6 升级建议另行立项，未做。

## 后续与替代关系

- 本节取代此前按旧规划 D1–D25 列出的后续（旧条目见本文件的历史版本）。现行后续以[官网规划](../../website-plan.md)第 10、11 节为准：
  - 阶段 1 现站修正与 HIP-3 改写（前置：终端 T1 补 `io` 部署方文档链接）；
  - 阶段 2 新版首页、阶段 2b 搜索内容、阶段 3 视频、阶段 4 可选 Open Book；
  - 终端并行任务 T1–T5，以及 ADR 0042 的发布排期。
- 运营方提供：视频母版与字幕（放法 A 或 B 视频完成后定）、AWS 日志与响应头、Cloudflare DNS 验证、`/apps` 收录申请、一次卡购买与一次主网自动存款、与部署方及被参考公司没有赞助或付费关系的确认、更强的差异化理由（如有）。
- 首屏原型与录屏工具（`designs/website-hero-prototype/`）只作参考与技术占位；`designs/beyond-crypto-review/` 只作事实表与草稿参考。两段视频在真机与 Safari 上的播放没有测。
- 没有发布或上线任何内容；2026-10-25 的改动在本地分支提交，没有推送。
- 下次先查：本记录、`docs/website-plan.md`、审阅文档第 2 节事实表、`docs/agent-handbook.md` 第 2 节。

## 追加：按钮统一、首屏减密、交易对图标与第三轮 GPT 评审修复（2026-10-27 UTC，同一会话，未提交）

- 按钮：运营方选定「胶囊 + 右侧圆形箭头」，全站统一为 `ButtonLink` / `Button` / `ButtonChip`（`src/lib/buttons.ts` 生成类名，`.btn*` 规则在 `@layer` 外）；切换按钮无箭头、保留 `aria-pressed`。`tests/button-contract.test.mjs`、`tests/built/buttons.test.mjs` 钉住；`motion-contract` 只为 `.btn` 放开 box-shadow 过渡。
- 首屏减密：运营方认为首屏字太密。执行事实移交 01b，builder fee 只留 07 与 FAQ，受限地区短版只留 FAQ（R7 修订）；CTA 下只留一条风险脚注（R4/R6 仍满足）。
- 交易对图标：从 `app.hyperliquid.xyz/coins` 本地化 27 个 SVG（清理白名单、单文件 ≤8 KB、合计 35 KB），7 个无官方图标的市场用字母圆标；ETH、NEAR、ANTH 按实测在深色上加白底。首屏公司按钮不带图标，可见写出部署方与 'not shares'。
- 第三轮 gpt-6-astra 对抗评审：8.0/10（较 8.2 降，主因功能缺陷）。已核实并修复：无 JS 时页签面板被 preflight `[hidden]` 隐藏；JIO/OURA 按每股报价导致行情为空；功能页签方向固定为 vertical；安全文案「never ask for verification code」与邮箱登录冲突；320px 市场表溢出。十项建议全部实施（另含首屏截图改为完整工作区并出 AVIF/WebP，达到 72 KB / 39 KB；三步上手补全；按钮阴影减轻）。
- 验证（构建产物，2026-10-27）：`pnpm --filter @sairn/website test` 96 通过，`test:dist` 55 通过（含禁用 JS、拦截页签模块与 320/360/390 窄屏的 Chromium 测试），`tests/brand-cross-app.test.mjs` 7 通过，`pnpm brand:check` 通过。未做：Safari/Firefox、真机、VoiceOver/axe、线上 LCP；390px 下 LCP 是首屏文字段落而非 H1；公司图标的商标使用范围待运营方决定。
- 功能区切换卡顿（运营方 2026-10-27 电脑实测反馈）：逐帧取证为整面板淡入导致深色窗口闪灰（12ms 透明度 0、约 210ms 才不透明）、截图懒加载到首次点击才下载、说明行数不同导致高度差 24px；主线程无长帧。修复为叠放交叉淡入、提前预加载解码、固定区块高度，`tabs-browser` 逐帧测试钉住；构建版录屏已给运营方。`test` 96、`test:dist` 56 通过。

## 周整理补记（2026-11-02）

后续以 website-plan.md、ADR 0043/0044 和 p33 发布记录为准。p32 的 terminal:check 失败保留于阶段 1。对 p33 的该项检查已通过，发布记录报告官网单测 97 项、产物测试 56 项通过。上周对 xyz:JIO 的预计已有每日检查结果，详见本周整理。 [本周核对记录](2026-11-02-weekly-memory-review.md)
