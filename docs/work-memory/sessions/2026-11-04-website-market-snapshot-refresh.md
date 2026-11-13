<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-04-website-market-snapshot-refresh",
  "date": "2026-11-04",
  "title": "官网行情快照刷新：xyz:JIO 上市后转为股票，补记 Paragon 的 para:ANTH 按每股报价",
  "kind": "task",
  "status": "verified",
  "topics": ["jurisdiction-marketing", "hyperliquid-api"],
  "summary": "PR #151 的 Build website（运行 41850227401）因提交的快照已 8.4 天未刷新而失败；每日 Website Market Snapshot 检查自 10-28 起天天失败（xyz:JIO 已被交易所改为 stocks，11-04 起另报快照超龄）。从 origin/dev 2230c64e 刷新快照（fetchedAt 2026-11-04T15:02:32Z）：核对接口注解与 XYZ 文档（Pre-IPO 规格页标 Converted，普通规格页按 NSE: JPL 列为股票永续）后从 PRE_IPO_DOCS 删去 xyz:JIO；新出现的 para:ANTH 按 Paragon 合约规格页（Pre-Listing，跟踪 Anthropic, PBC 一股的预期价值）以每股报价补进 PRE_IPO_DOCS；mkts 的四个市场下架，Indices 只剩 XYZ 的 5 个，实时请求计划降为 4 个 dex。两份测试里写死 JIO 的断言改为现存市场，5 个变异全被抓到，推送前的 Codex 只读轻度审查 9/10、无发现；官网源码测试 97 项、产物测试 56 项、test:brand、构建与 markets:snapshot --check 都通过（构建、产物测试与 test:brand 因沙盒禁止监听端口和启动 Chromium，在沙盒外运行）。推送与开 PR 等运营方同意；没有在真实浏览器里查看页面，也没有部署官网。",
  "thread": null,
  "baseCommit": "2230c64e",
  "commits": [],
  "sources": [
    {"path": "apps/website/src/config/deployers.ts"},
    {"path": "apps/website/src/data/market-structure.json"},
    {"path": "apps/website/src/data/market-icons.json"},
    {"path": "apps/website/tests/markets-structure.test.mjs"},
    {"path": "apps/website/tests/built/live-markets-dom.test.mjs"},
    {"path": "apps/website/README.md"},
    {"path": "deploy/website/README.md"},
    {"path": "docs/website-plan.md"},
    {"path": "docs/work-memory/sessions/2026-11-02-weekly-memory-review.md"},
    {"url": "https://github.com/zora4523-bot/gatu-app/actions/runs/41850227401"},
    {"url": "https://github.com/zora4523-bot/gatu-app/actions/runs/41835047911"},
    {"url": "https://docs.trade.xyz/perpetuals/specifications-and-schedules/pre-ipo-specification-index"},
    {"url": "https://docs.trade.xyz/consolidated-resources/specification-index"},
    {"url": "https://docs.paragon.trade/resources/specifications"}
  ],
  "supersedes": []
}
-->
# 官网行情快照刷新：xyz:JIO 上市后转为股票，补记 Paragon 的 para:ANTH 按每股报价

## 背景与范围

同步记录，未取得本会话的任务标识；任务由另一个 Claude Code 会话（`local_4fc50bf0-d3bd-495d-b681-e2bd7ae10100`）派出。目标：在独立工作树里刷新官网的行情快照，让官网构建重新通过，并核实市场分类变化。范围只到本地提交；推送、开 PR 与官网部署（`deploy/website/README.md`）不在本任务内。

起因（2026-11-04 用 `gh` 读取）：

- PR #151（分支 `claude/order-summary-official-rows`，头 `6bfaa1b8`）的 `Website and Brand` 运行 41850227401（14:42Z）在 `Build website` 失败：`Market structure check failed`，快照 `fetchedAt 2026-10-27T05:46:52.566Z` 已 8.4 天（上限 7 天）。构建只读已提交的快照，不联网。
- 每日的 `Website Market Snapshot`（`markets:snapshot --check`，跑默认分支）从 10-30 到 11-04 每天失败；最近一次 41835047911（11-04 13:06Z，main `493f3d56`）报三项：`deployers.ts xyz:JIO is no longer preipo`、`published Pre-IPO row xyz:JIO changed category to "stocks"`、快照 8.3 天超龄。10-28 起的失败已记在 [11-02 周整理](2026-11-02-weekly-memory-review.md)（后续第 1 项），本记录处理它。

基线：工作树从 `origin/dev` `2230c64e` 切出新分支 `claude/website-market-snapshot`（`git fetch` 后用 `git ls-remote` 核对远端 dev 与 main 未变；`origin/main` `4608bc7c` 的树与它相同）。

## 结论与依据

**快照变化**（已提交 `2026-10-27T05:46:52Z` → 新 `2026-11-04T15:02:32Z`；在收录的 dex 中按「未下架」计）：

| 项目 | 变化 |
| --- | --- |
| 各 dex 市场数 | 主 dex 178→179，xyz 118→120，para 32→33，mkts 5→1，io 11→14；合计 344→347，HIP-3 部署方仍是 4 家（XYZ、Paragon、Markets By Kinetiq、EntropyIO） |
| 新增 | `XTEN`（主 dex）、`xyz:RELIANCE`、`xyz:ICE`、`io:AAPL`、`io:CRCL`（股票），`para:ANTH`（Pre-IPO），`io:NVDA`（接口没有分类注解，不进品类卡） |
| 不再上架 | `mkts:US500`、`mkts:SMALL2000`、`mkts:USTECH`（指数），`mkts:USBOND`（股票，显示名 TLT）；mkts 只剩没有分类的 `mkts:BVIV` |
| 字段变化 | `xyz:JIO` 的分类 preipo → stocks；`xyz:ANT` 的 `onlyIsolated` true → false |
| 品类卡 | Indices 8→5（只剩 XYZ，新增示例 `xyz:NIFTY`），Stocks 129→133（部署方里不再有 Markets By Kinetiq；示例由 MU、META 换成 NVDA、AMD），Commodities 示例 COPPER 换成 PLATINUM，Pre-IPO 仍是 5 个 |
| 图标 | 新增 `xyz:AMD`、`xyz:NIFTY`、`xyz:NVDA`、`xyz:PLATINUM` 的图标，`xyz:ANT` 由字母圆标改为来源图标；`para:ANTH` 来源没有图标，用字母圆标；`xyz:MU` 的图标文件随页面不再展示它而删除 |

**xyz:JIO 的分类。** 三处来源一致：`perpConciseAnnotations` 给出 `{"category":"stocks","displayName":"JIO","keywords":["jpl","india"]}`；XYZ 的 Pre-IPO 规格页把 JIO 的状态标为 `Converted`（预计上市日 2026-10-28）；XYZ 的普通规格页把它列为 Jio Platforms Limited（NSE: JPL）一股的股票永续，INR 价格按 USD/INR 换算。`deployers.ts` 原注释写明 XYZ 的 Pre-IPO 市场上市后转为普通股票永续，并在条目与快照于一次审阅过的提交里更新之前让检查失败，所以按这条现行规则从 `PRE_IPO_DOCS` 删去 `xyz:JIO`。JIO 现在只是普通股票市场，24h 成交额排不进 Stocks 页签的前 6 行，首页不再出现它（产物 `dist/index.html` 中 `JIO` 出现 0 次）。

**para:ANTH 的报价方式。** 快照刷新后它是未下架的 `preipo` 市场（2026-10-25 的[调研](../../marketing/beyond-crypto-review.md)里还是已下架）。Paragon 的合约规格页把 ANT 列为 Pre-Listing，说明它跟踪 Anthropic, PBC 一股的预期价值，逐仓，启动参考价 $110.00，预计上市日 TBD，上市缓冲 60 天；终端链接的 Paragon 文档首页不列这个市场。`tests/markets-structure.test.mjs` 要求每个没有核实单位的 Pre-IPO 行都链到列出它的页面（「every Pre-IPO row without verified units links to the page that lists it」），10-27 的刷新（`6d430d27`）对 `xyz:ANT` 也是这样处理的，所以把它以 `quotedPerShare: true` 写进 `PRE_IPO_DOCS`，来源为 `https://docs.paragon.trade/resources/specifications#market-specifications`（2026-11-04 读取）。没有新的展示决定：Pre-IPO 行写「Quoted per share of the company」，链接写「Deployer documentation →」，FAQ 的报价问题按 `faq.ts` 现有逻辑多出一句 Paragon 按每股报价，都由现有代码按配置生成。三个参考 Anthropic 的市场的显示名都是 ANT：品类卡示例按显示名去重，只显示 EntropyIO 的 Anthropic；Pre-IPO 列表按规则列出全部，所以有「ANT · by XYZ」与「ANT · by Paragon」两行。

**其他核对。** XYZ 的 Pre-IPO 规格页在 2026-11-04 重新读取：ANT 仍是一股 Anthropic, PBC A 类普通股（Nasdaq: ANT）、按每股报价，保证金模式为全仓（与 `onlyIsolated` 变为 false 一致），预计上市日 2026-11-20；OURA 仍为 Live，预计上市日 2026-10-02，宽限期到 2026-12-01。据此把 `XYZ_PRE_IPO_INDEX.readOn` 改为 2026-11-04，并在注释里写明这几个日期。

**测试改动。** 快照变了，两份测试里写死 JIO 的断言随之改为现存市场，测试的意图不变：

- `tests/markets-structure.test.mjs`：转换与重复条目的例子由 `xyz:JIO` 换成 `xyz:OURA`；报价基准断言改为 `xyz:OURA`、`xyz:ANT`、`para:ANTH` 按每股；原来的 `preIpoInputs.length >= 4` 在新快照里只有 3 个输入（`io:OAI`、`io:ANTH`、`xyz:OURA`，另两个 ANT 被去重），改为断言输入同时含有 valuation 与 per-share 两种基准，保证下面的循环两条分支都被走到。
- `tests/built/live-markets-dom.test.mjs`：报价基准表去掉 `xyz:JIO`；「Quoted per share」的检查改看 `xyz:OURA`；页面上只剩一个按每股报价的 Pre-IPO 行，所以「基准未知」与「缺少基准」两种情况分开在两个页面里检查；03 页签额外请求的 dex 由 `mkts`、`para` 变为只有 `para`。

**文档。** 官网 README 的数据表补上 `PRE_IPO_DOCS`，写明 Pre-IPO 市场转换或新出现时刷新提交要做什么，并把实时请求的 dex 列表改为按快照描述；发布手册的行情快照一段补同样的处理办法；[官网规划](../../website-plan.md)第 7 节加一条 2026-11-04 实施修订（其中实时请求计划由 5 个 dex、200 s 刷新变为 4 个 dex、160 s，数值由 `createRequestPlan` 对新输入算出）。没有写 CHANGELOG：例行快照刷新沿用 `6d430d27` 的做法，不记入变更日志。

## 验证与限制

工作树 `claude/website-market-snapshot`，基线 `2230c64e`。下表的命令都在提交前的工作树里运行，其内容就是 `106c1190`（快照、图标、`deployers.ts` 与两份测试）；文档与本记录在其后的提交里，不影响这些结果。Node v24.15.0（本机 nvm 默认版本，满足官网 `>=22.23.4`；CI 用 22.23.4），pnpm 10.21.0。时间均为 2026-11-04 UTC。

| 命令 | 结果 |
| --- | --- |
| `NODE_USE_ENV_PROXY=1 pnpm --filter @sairn/website markets:snapshot`（改配置前，`fetchedAt` 14:57:15Z） | 写入快照后退出码 1，只报 `deployers.ts xyz:JIO is no longer preipo`，所以没有更新图标；接口数据如上表 |
| 同上（改 `deployers.ts` 后，`fetchedAt` 15:02:32Z，即提交的快照） | 退出码 0：`snapshot and configs are consistent`，写入 29 个图标，5 个用字母圆标（`xyz:NATGAS`、`para:10Y`、`para:2Y`、`para:30Y`、`para:ANTH`） |
| `pnpm --filter @sairn/website markets:snapshot --check`（15:09:56Z） | `markets:snapshot --check passed` |
| `pnpm --filter @sairn/website test` | 97 项全部通过 |
| `pnpm --filter @sairn/website build` | 沙盒内失败：Astro Fonts API 在构建时监听本机端口，`listen EPERM`；沙盒外通过，7 个页面（`blog` 集合为空的警告原本就有） |
| `pnpm --filter @sairn/website test:dist` | 第一次 56 项中 9 项失败：1 项是数据断言（03 额外请求的 dex 不再含 `mkts`），已改；8 项是沙盒拦下 Chromium（`bootstrap_check_in … Permission denied`）。改后在沙盒外重跑 56 项全部通过 |
| `pnpm test:brand`（沙盒外，因为 `og:check` 要启动 Chromium） | 通过：`Brand check passed`；`og:check` 两张卡零差异；终端 8 个文件 47 项；官网 97 项；`brand-cross-app` 7 项 |
| 变异（逐个改源码、跑对应测试、还原） | 5 个全被抓到：删去 `para:ANTH` 的 `PRE_IPO_DOCS`（2 项失败）；保留 `xyz:JIO` 条目（导入即抛出 `Market structure check failed`，3 个测试文件失败，即原来的故障）；基准 `unknown` 当作每股显示、缺少基准当作每股显示（各让分开检查的用例失败）；去掉「Quoted per share」标签（每股行用例失败） |

推送前按[手册](../../agent-handbook.md)第 7 节跑了一轮 Codex 只读审查（`codex exec -m gpt-6-astra -s read-only`，推理强度 low，范围 `2230c64e..ff2c06df`）：9/10，无 P0–P3 发现；它在自己的只读沙盒里跑了两份相关测试，26 项通过；它没有联网核对外部网页，没有重新构建，也没有在 Node 22.23.4 下跑 CI。

在构建产物里核对：首页写「Markets not delisted on Hyperliquid as of 4 Nov 2026 (UTC)」，市场数 347、部署方 4 家，Pre-IPO 列表为 OpenAI、Anthropic（EntropyIO）、ANT（XYZ，不再写逐仓）、ANT（Paragon，逐仓）、OURA（XYZ），FAQ 多出 Paragon 按每股报价一句。新增的 5 个图标文件为 340–1124 字节，没有脚本或外部引用。

未做：真实浏览器里查看页面（只读了构建产物的文本，jsdom 与无头 Chromium 的测试不等于人工观感）；CI（未推送）；官网部署；全量终端 Vitest（没有改终端代码，`test:brand` 跑了其中的品牌子集）。Biome 的配置整体排除 `apps/website`，所以这些文件不经过 Biome。快照只在 7 天内有效：2026-11-11T15:02Z 之后，任何改到 `website-build.yml` 输入路径的 PR 又会在 `Build website` 失败，下次发布官网前也要再刷新一次。

## 后续与替代关系

1. 推送分支并开 PR 进 `dev` 要运营方同意。按各工作流的 `paths`，这个 PR（改了 `apps/**` 与 `deploy/**`）会触发 `Website and Brand`、`Terminal Tests`（两片）与 `Production Builds`（配对关闭），不触发浏览器回归与 `Static Checks`（两者只看终端、`packages/*` 的源码路径与 `brand/brand.json`）。合入 `dev` 后，每日检查跑的是默认分支 `main`，要等下一次晋升才会转绿。
2. 接下来可能还会转换的 Pre-IPO 市场：`xyz:ANT`（XYZ 预计 2026-11-20 上市）、`xyz:OURA`（宽限期到 2026-12-01）、`para:ANTH`（Paragon 写 TBD）。交易所改了分类，每日检查就会报红，按 README 与发布手册新写的办法删掉对应条目并刷新快照。
3. 仍待运营方决定、本次未处理：Pre-IPO 与股票市场的图标是公司标识，商标使用是否另加说明（[官网规划](../../website-plan.md)第 6 节 2026-10-26 实施修订）；`xyz:ANT` 这次开始显示来源图标。
4. 顺带看到（未改）：`apps/website/src/scripts/live-markets.ts` 声明的常量 `PRE_IPO_QUOTE_BASES` 没有被使用。另外，`tests/fixtures/meta-and-asset-ctxs-xyz.json` 的注释说夹具含首页展示的每个市场，实际上从 10-27 的刷新起就缺几个页签行的录制数据：基线缺 `xyz:SOXL`、`xyz:META`、`xyz:COPPER`，新快照下缺 `xyz:SOXL`、`xyz:AMD`、`xyz:NIFTY`（用 `getLiveMarketInputs()` 与五份夹具的 universe 比对）。这些行在 jsdom 测试里保持空白，所以测试通过证明不了它们能填上数字；补录要重新抓接口响应，本次未做。
5. 11-02 周整理后续第 1 项（核对 JIO 分类、更新 Pre-IPO 配置与快照、在同一提交重跑 `--check`）由本记录处理，待本分支合入后完成。

2026-11-13 补记：本记录的两个提交（原仓库 `106c1190`、`ff2c06df`）在一个没有合入原 `dev` 的分支上，仓库迁移时没有带过来，所以元数据里的提交列表清空。它的源码改动（`deployers.ts`、两份测试与文档）在 2026-11-13 原样移植进新仓库，快照则重新抓取，见 [2026-11-13 的记录](2026-11-13-website-market-snapshot-refresh.md)。
