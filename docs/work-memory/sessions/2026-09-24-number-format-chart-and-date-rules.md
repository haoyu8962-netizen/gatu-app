<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-number-format-chart-and-date-rules",
  "date": "2026-09-24",
  "title": "图表跟随数字格式设置、日期固定拉丁数字、原生 Intl 调用收口（规划 A-1/A-3/A-4）",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "按用户决策实施对齐规划的 A-1、A-3、A-4：TradingView 创建时收到 numeric_formatting，数字格式变化走与语言相同的保存状态重建（新 reason numeric-format，值未变不重建）；format.ts 的日期函数强制 numberingSystem latn 并接受界面语言代码；6 处绕过 format.ts 的 toLocale*/Intl.DateTimeFormat 调用改走 formatTime/formatDateTime，3 处用户可见名称排序加 sensitivity base；新增 locale-format-contract 扫描测试与归属文档 docs/number-format-setting.md、AGENTS.md 契约。内置浏览器实测 1.234,56 下图表轴、图例、订单簿、标题分隔符一致。",
  "thread": null,
  "baseCommit": "ce9fb539",
  "commits": [],
  "sources": [
    { "path": "docs/number-format-and-chart-translation-plan.md" },
    { "path": "docs/number-format-setting.md" },
    { "path": "apps/terminal/src/lib/format.ts" },
    { "path": "apps/terminal/src/config/i18n.ts" },
    { "path": "apps/terminal/src/components/trade/chart/chart-panel.tsx" },
    { "path": "apps/terminal/src/components/trade/chart/tradingview-chart.tsx" },
    { "path": "apps/terminal/src/lib/tests/locale-format-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/tradingview-chart.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/format.test.ts" },
    { "path": "apps/terminal/src/lib/tests/chart-panel.test.tsx" }
  ],
  "supersedes": []
}
-->
# 图表跟随数字格式设置、日期固定拉丁数字、原生 Intl 调用收口（规划 A-1/A-3/A-4）

## 背景与范围

同步记录。用户对[对齐规划](../../number-format-and-chart-translation-plan.md)的决策：全部采纳建议（输入框 A-2a、阿拉伯语日期改拉丁数字、图表翻译审计先 zh + ar），并要求先做 A-1 与 A-3。A-4（拉丁数字）是 A-3 把最近成交时间改走 `formatTime` 的前提——否则阿拉伯语界面的成交时间会从浏览器默认 locale 的拉丁数字变成阿拉伯-印度数字——所以一并实施。基线 `ce9fb539`，开始时工作区干净。A-2a 与方案 B 未做。

## 结论与依据

1. **图表跟随数字格式（A-1）。** `numberSeparatorsByFormatLocale` 从 `lib/format.ts` 上移到 `config/i18n.ts`；`ChartPanel` 读 `useGlobalSettings().numberFormatLocale` 传给 `TradingViewChart`；widget 创建时传 `numeric_formatting: { decimal_sign, grouping_separator }`（v28.3 类型两个字段都必填）。变化走 `requestStatePreservingRebuild(widget, "numeric-format")`：新增 `numericFormatRebuild` 标记、`appliedNumberFormatRef`（创建时记录、`removeWidget` 清空），`finishStatePreservingRebuild` 只在目标值与已应用值不同时重建。语言与数字格式的切换请求收敛到同一个 `requestCreationOptionRebuild(reason, alreadyApplied)`，已应用时清掉自己的标记并在没有其他待重建原因时取消状态保存。
2. **日期固定拉丁数字并接受语言代码（A-4 / A-3）。** `getFormatter("date")` 强制 `numberingSystem: "latn"`（Node 22 实测 `ar-SA` 由 `٧:٠٥ ص` 变为 `7:05 ص`）；新增 `resolveDateLocale`，显式 `locale` 为界面语言代码（`zh`、`fr`）时按 `languageToIntlLocale` 映射，否则原样交给 Intl。
3. **收口绕过（A-3）。** 改走 `lib/format.ts` 的 6 处：`lib/trade/trades.ts`（最近成交时间，原 `toLocaleTimeString([])` 浏览器默认 locale）、`mobile-agent-sync-modal.tsx` 与 `routes/mobile-agent-sync.tsx`（配对到期时间，同上；后者是写扫描测试后才发现的第 6 处）、`vaults-list.tsx`、`vault-detail-view.tsx`、`use-api-wallet-controller.ts`（原直接 `new Intl.DateTimeFormat(locale, …)`，`locale` 是 Lingui 语言代码）。三处用户可见名称排序（报价币种分类、Swap 代币 `displayName`、API 钱包 `name`）改为 `localeCompare(other, undefined, { sensitivity: "base" })`。
4. **契约与文档。** 新增 `locale-format-contract.test.ts`：扫描 `apps/terminal/src`（测试目录与 `.d.ts` 除外）中 `lib/format.ts` 之外的 `.toLocale*(`、`new Intl.NumberFormat(`、`new Intl.DateTimeFormat(`，要求为空。归属文档 `docs/number-format-setting.md`（规则、选项、存储、与官方差异、未完成、回归入口），AGENTS.md 新增「Number and date formatting contract」与验证分组，`docs/runtime-guardrails.md` §4/§7 各加一条，`docs/README.md` 导航，CHANGELOG 两条，规划文档状态改为 A-1/A-3/A-4 已实施。
5. **未变的行为。** 数字格式选项仍是设计钉住的三种；输入框仍只接受 `.`；`Reset` 先切语言再切数字格式，两次变化若落在同一状态保存窗口内只重建一次，否则第二次重新初始化（测试钉住同一 commit 内两者同时变化只构造两次 widget 且最后一次同时带 `locale: "fr"` 与法式分隔符）。

## 验证与限制

- `pnpm exec biome check`（16 个改动的 TS/TSX 文件）无问题；`pnpm --filter @gatu/terminal typecheck` 0 错误；`git diff --check` 通过。
- 定向组：`tradingview-chart`、`format`、`locale-format-contract`、`number-format-settings`、`number-format-reactivity-contract`、`trades`、`trades-panel`、`trade-row`、`i18n-hot-switch`、`i18n-reactivity-contract`、`global-settings-store`、`language-switcher`：12 文件 332 项通过；vault / api-wallet / mobile-agent-sync / spot-swap / token-selector / chart-theme-colors / trade-terminal-page-boot 相关 25 文件 346 项通过。全量 `pnpm --filter @gatu/terminal test`：607 文件中 605 通过、1 跳过、1 失败——`chart-panel.test.tsx` 的设置 store 桩缺少新用到的 `useGlobalSettings`（夹具缺口，非产品缺陷），补桩后该文件 2/2 通过；其余 7,016 项通过。
- 内置浏览器（脚本注入点击，非物理输入）在 `localhost:3005/trade/HYPE`：把数字格式切到 `1.234,56` 后约 7 秒，图表价格轴 `92,342`、图例 `62,839 K`、订单簿 `92,789`、标题 `92,789 HYPE/USDC` 分隔符一致，遮罩透明度已回到 0；切回 `1,234.56` 后图表轴恢复 `.`。
- 新增测试中阿拉伯语日期只断言含 `14:35` 且不含阿拉伯-印度数字：`ar-SA` 的短日期含 RTL 标记与阿拉伯逗号（`12‏/08، 14:35`），不宜按固定字符串断言。
- 未做：真实浏览器/真机验收；`Reset` 连续操作的真实页面观察；阿拉伯语界面整体检查；A-2a 输入框；方案 B 审计。

## 后续与替代关系

- 接续 [官方切换语言取证](2026-09-24-official-terminal-language-switch-trace.md) 与规划文档；不替代任何记录。
- 待做：A-2a（输入框在 `,` 小数点格式下接受 `,`），方案 B 的 zh + ar 图表面审计。
