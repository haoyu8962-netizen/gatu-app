<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-13-agents-brand-cleanup",
  "date": "2026-09-13",
  "title": "AGENTS.md 指针化重构与 HypeTerminal 品牌残留清理",
  "kind": "task",
  "status": "verified",
  "topics": ["docs-governance"],
  "summary": "AGENTS.md 由 24.7KB 压到 17.7KB：细节回归归属文档，新增 recent-trades.md 与 Order entry 节，每个契约配回归入口；全仓文档、测试夹具、bin 名、死存储键与 deepsec id 的旧品牌清理完成，仅保留两处刻意残留。",
  "thread": null,
  "baseCommit": "32b73f6892fc6882692c8a0964471a26ab63f272",
  "commits": ["d736df7bf8bdeeb35413f56995d11031ca2f8b60", "80c2361975ab1a6fb4137a96b57e883e302161f2", "61d44a8fc4d793b368989e4b0af3d4a5b004cce7", "683dc7ac6c9b6331f5b3ffd0d4db4d287ca090ad", "f6d850b065add669b29029ddde014b374d5765dd", "95b9e082ca4b9d6e389e1898bafb39de8bd9e644", "7ef764037086731bfd55666b02c01ec72a3e0bb3", "d4794bceab64c17cfa84de8fd44dc6981f995964", "6c4875041533f0b62bb65aeb3816126fb0ce4259", "e6221ebb"],
  "sources": [
    { "path": "AGENTS.md" },
    { "path": "docs/recent-trades.md" },
    { "path": "docs/orderbook-layout.md" },
    { "path": "docs/orderbook-new-level-animation.md" },
    { "path": "docs/adr/0003-orderbook-transport-isolation.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "docs/desktop-grid-layout.md" },
    { "path": "apps/terminal/src/config/app.ts" },
    { "path": ".deepsec/deepsec.config.ts" }
  ],
  "supersedes": []
}
-->
# AGENTS.md 指针化重构与 HypeTerminal 品牌残留清理

## 背景与范围

本记录为同步摘要，不是完整会话导出。用户依次要求：审视 AGENTS.md 的写法；把 Order book 节压回指针形式并修掉品牌名；按同一标准复审其余各节；补齐 Verification；清除历史文档中的旧品牌；处理测试夹具与 bin 名；最后用 Codex CLI 处理存储键与 deepsec 工作区并由本会话审查。分支 `codex/UIreview`，基线 `32b73f68`。未取得可核验的任务标识，`thread` 为 null。工作区在期间被其他会话多次推进（`8a2283bf`、`540cfc54`、`dce07587`、`a8fc8962` 等），每次提交前核对 HEAD，只暂存本任务文件。

## 结论与依据

采用「AGENTS.md 只保留不变量与检索指针，精确数值只在一处归属文档存在」的原则，逐条在代码中核对后再搬家，未删除任何规则：

- Order book 节 19 条 → 8 条（7,289 → 2,741 字符）。深度条宽度公式、对齐方向、容器查询表头进 `orderbook-layout.md`；深度色值（含此前只存在于 AGENTS.md 的浅色 `--text-success/--text-error`）进动效文档配色表；缓存身份 `env:coin:grouping:source`、`performance.now()` 十秒过期、fast/full 串话过滤进 ADR 0003。事实核对点：`getDepthPercentage` 按侧取 `maxTotal`；`ORDERBOOK_SNAPSHOT_CACHE_TTL_MS = 10_000`、12 键上限；`useOrderbookFeed` 三态与 `bookMatchesSource`。
- 复审其余各节：钱包连接 UI、PWA、TradingView iframe 两条规则、桌面网格默认跨度与底衬 token 分别落到 `runtime-guardrails.md` §1/§4/§8 与 `desktop-grid-layout.md`；最近成交面板此前没有任何文档承载，新建 `docs/recent-trades.md` 并登记到文档地图；下单表单五条从桌面布局节拆出为 Order entry contract；删去与前言重复的元规则。
- Verification 节从 5 组扩为按契约分组的 43 个测试文件，并指向 `apps/terminal/tests/browser/` 的 Playwright 配置。
- 品牌：`AGENTS.md`、`agent.md`、`README.md`、`package.json` name 先改；随后 68 个文档文件 427 处（含 `research/` 53 文件、`designs/mockups.pen` 标签）、10 个测试文件 21 处夹具（agent 名取 `APP_NAME`，域名统一 `app.gatu.test` 以免与 `public-origins.ts` 的真实域名撞车）、`@gatu/hyperliquid-api-skill` 的 bin 改为 `gatu-install-hyperliquid-api-skill`。
- `STORAGE_KEYS.RECENT_WALLETS` 与 `RECENT_WALLETS_LIMIT` 经检索为零消费者的死常量，不需要迁移；改为 `LEGACY_RECENT_WALLETS` 并沿用 `client-root.tsx` 既有的一次性 `removeItem` 清理，字面量必须保留。`.deepsec` 项目 id 改为 `gatu`，目录以重命名方式提交。这两项由 `codex exec -m gpt-6-astra`（codex-cli 0.154.0、`workspace-write`、免审批、禁止提交）执行，本会话逐项复验。
- 刻意保留：`launch-review-2026-07-21.md:171` 记录旧句柄的事实陈述；`#ht-mobile-sync` 为同步协议常量而非品牌文字；`docs/linear.md`、`redesign.md` 起初按“不改写历史”保留，后经用户明确要求一并替换。

## 验证与限制

在上述提交序列上实际执行：

- 链接与路径：AGENTS.md 及各改动文档的相对链接、反引号路径、`{dark,light}` 展开路径与 43 个测试文件路径全部存在；AGENTS.md 引用的代码标识符（`MOBILE_QR_SURFACE_MEDIA_QUERY`、`PRIVY_WALLET_LIST`、`animateOrderbook`、`bg-grid-container`、`DESKTOP_GRID_STORAGE_KEY`、`getTradeKey` 等）均在代码中存在。
- Vitest：Verification 清单 43 个文件分三批实跑（27+5+11），741 项通过；夹具改名后的 10 个文件 162 项通过。
- Biome check（改动的 TS/TSX）、`pnpm --filter @gatu/terminal typecheck`、`pnpm og:check`、`tests/brand-cross-app.test.mjs`、`pnpm memory:check` 均通过。
- Codex 第一次运行因 `gpt-6-astra` 要求更新 CLI 而失败（`gpt-6` 在 ChatGPT 账号下不可用），零改动；升级至 0.154.0 后成功。Codex 因沙箱索引权限改用普通 `mv`，由审查者暂存为重命名。
- 审查时 `git add -N .deepsec` 把旧目录删除记录带进了 terminal 提交，发现后 `reset --soft` 重做两个提交；最终树未变。

未运行：完整生产构建、Playwright 浏览器套件、i18n 目录（`.po` 未受影响，缺失计数 12/12/12/12/3 为既有状态）。`research/` 与 `.scratch/` 属历史资料，仅做机械替换，未复核其内容时效。`tech.json` 的 `rootPath` 现为本机绝对路径，与其原本的外来绝对路径同性质。

## 后续与替代关系

- Verification 清单与测试文件位置耦合，移动或删除测试时需同步该节。
- `LEGACY_RECENT_WALLETS` 与 `LEGACY_METADATA` 的启动清理可在若干版本后一并移除。
- 本记录不替代既有记录；订单簿相关数值以各归属文档为准，AGENTS.md 不再重述。
