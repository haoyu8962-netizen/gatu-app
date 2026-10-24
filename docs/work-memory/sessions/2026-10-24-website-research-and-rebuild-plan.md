<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-24-website-research-and-rebuild-plan",
  "date": "2026-10-24",
  "title": "官网行业调研与重建规划",
  "kind": "task",
  "status": "recorded",
  "topics": ["brand-identity", "jurisdiction-marketing"],
  "summary": "运营方认为官网 sairn.ai 太传统，要求用现代前端与加密原生技术重做。Agent 调研约 40 个同行站点、动效技术与仓库约束（docs/website-industry-research-2026-10.md），按三个设计方向与三份评审写出拟议、未批准的重建规划（docs/website-rebuild-plan.md：保留 Astro 静态站，首屏用 Worker 里的 Canvas 2D 实时行情画布，fail-closed 数据层与 REST 权重上限，主张登记表，阶段 0 先删英文站与日本邮件矛盾的说法并补风险句，默认关闭的日语页，日本邮件依赖的 sairn.ai 能力与 19 项待决事项），同日按 25 条评审意见核对后修订。只有文档：未改官网代码，未运行官网测试或构建，未发布；三个方向与三份评审的原文未取得，原始调研证据只在本机 .worklog。",
  "thread": null,
  "baseCommit": "32125377",
  "commits": [],
  "sources": [
    {"path": "docs/website-rebuild-plan.md"},
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
- 工作树分支 `claude/japan-user-email-template-d3e2b5`，基线 `32125377`。影响面只有文档：两份新文档 `docs/website-industry-research-2026-10.md`、`docs/website-rebuild-plan.md`，`docs/README.md` 的一行导航，本记录。`apps/website` 的代码、测试与线上站点都没有改。
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

## 后续与替代关系

- 运营方决定规划第 21 节的 D1–D19，先是 D1（阶段 0 的范围与时机）、D18（是否把阶段 0 上线设为日本邮件的硬性发送条件）与 D19（邮件依赖的 sairn.ai 能力）。
- 阶段 0 实施时按规划第 19 节的逐项清单与 grep 验收，并按当时源码复核行号；把改动对照交给律师。
- 若 D19 决定官网不做订阅，同步修改邮件 README §6 第 2 条 (b)。
- 规划批准后按阶段 1 新建 ADR 与 `docs/website-live-data.md`，再在本文件追加阶段检查点。
- 下次先查：本记录、规划第 4、19、21 节、调研第 4 节，以及邮件 README §1 与 §5。
