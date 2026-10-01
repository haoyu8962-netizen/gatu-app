<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-hip3-disclaimer-parity-review",
  "date": "2026-09-24",
  "title": "HIP-3 部署者免责声明：签署次数与官方终端对照审查",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review"],
  "summary": "HIP-3 官方取证及本地签署持久化审查；出口、平仓接受入口和补水测试已在 09-25/09-27 实施并修复复审发现。非 USDC builder 缺失已更正为资产全部下架；四种平仓仍待真实 HIP-3 仓位验证。",
  "thread": null,
  "baseCommit": "f736d8a9",
  "commits": ["cd2176a1", "7c9b3f21"],
  "sources": [
    { "url": "https://app.hyperliquid.xyz/assets/index-58uVNh8f.js" },
    { "url": "https://app.hyperliquid.xyz/assets/config-DWLPMyx3.js" },
    { "path": "apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx" },
    { "path": "apps/terminal/src/stores/use-hip3-disclaimer-store.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-hip3-disclaimer.ts" },
    { "path": "apps/terminal/src/components/trade/components/global-modals.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-position-close-all-submit.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-position-reverse-submit.ts" },
    { "path": "apps/terminal/src/lib/tests/dialog-dismiss-control-contract.test.ts" },
    { "path": "apps/terminal/src/lib/hyperliquid/markets/use-markets.tsx" }
  ],
  "supersedes": []
}
-->
# HIP-3 部署者免责声明：签署次数与官方终端对照审查

## 背景与范围

同步记录。用户选中 HIP-3 部署者免责声明弹窗的「确认」按钮，问「这个签署的功能次数是否符合规范，对齐 app.hyperliquid.xyz/trade/HYPE 实践」。这里的「签署」是勾选并确认免责声明，不涉及钱包签名。取证对象：官方 2026-09-24 线上产物（`index-58uVNh8f.js`、`config-DWLPMyx3.js`、`en-US`/`zh-CN` 目录）与 Sairn `f736d8a9` 的实现；另用应用内浏览器在开发构建上实测 Sairn 的触发次数。一名主审阅读后由两名独立代理（官方侧、Sairn 侧）对抗核验，下文已按核验修正。未改代码。

## 结论与依据

### 官方实现（2026-09-24 产物）

- 组件 `uC({ titleId, discardKey, marketKey, paragraphs })` 由 `dC` 在交易页（桌面 `SC`、移动 `Mw`）渲染，条件是当前币种带 `dex:` 前缀的任意 builder 永续；portfolio 等页面不渲染。HIP-4 结果市场另有独立组件 `fC` 与独立键。
- 读 `hyperliquid.discard_hip3_disclaimer`（默认 `false`，`localStorage`，应用初始化读取一次，无 `storage` 事件同步，不按地址或 deployer 区分，无版本）。复选框「您确认已阅读并理解上述免责声明，并接受与该部署者所部署的无需许可市场进行交互所带来的风险」勾选后「确认」才可用；确认把标志写成 `true` 并关闭——之后永不再弹。
- 无 X、无 Esc 处理；点击遮罩会调用 `onClose` 把局部 `closed` 置 true，不接受也能关闭，但 `useEffect(() => setClosed(false), [marketKey])` 与交易页卸载/重挂会在换币、离开交易页再回来或刷新时再次弹出。
- 文案：标题「HIP-3 部署者免责声明」，两段正文，第二段以「请查阅该部署者的{文档}以及{使用条款}」收尾。

### Sairn 实现（`f736d8a9`）

- 页面级：选中市场为 `builderPerp` 且 `acceptedVersion < HIP3_DISCLAIMER_VERSION`（1）时渲染（`global-modals.tsx:207`）；复选框必勾；确认把 `acceptedVersion: 1` 写入 `hip3-deployer-disclaimer-v1`（zustand persist，同步补水，无补水前闪现）。Portfolio 页传 `enableSelectedMarketHip3Disclaimer={false}`，与官方「只在交易页」一致。
- 实测（应用内浏览器、开发构建）：`/builders-perp`（SP500，xyz）首次弹出、勾选后确认、存储写入；刷新后不弹；切到同 deployer 的 `xyz:GOLD` 与另一 deployer 的 `para:TOTAL2` 都不弹。
- 平仓流程：市价平仓与限价平仓对 HIP-3 仓位给带 Cancel 的副本；全部平仓（`use-position-close-all-submit.ts:490`）与反手（`use-position-reverse-submit.ts:383`）不弹窗，提交时以 `accept-hip3-market(s)` 拒绝并通知「Accept the HIP-3 deployer disclaimer before trading these markets.」，流程内没有接受入口；持仓面板按全部 dex 订阅，所以在 `/trade/BTC` 或 Portfolio 页都可能遇到。

### 对照结论

| 项目 | 官方 | Sairn | 判断 |
| --- | --- | --- | --- |
| 次数 | 每个浏览器一次（点确认后永久，全局，不分 deployer） | 相同，多一个版本号可在文案实质变更时重新询问 | **一致** |
| 触发面 | 交易页，任意 builder 永续 | 相同；另在平仓流程按仓位触发 | 一致（平仓触发为 Sairn 自加） |
| 不接受时 | 点遮罩可关闭，换币/刷新再弹 | 页面级不可关闭：无 X、无 Cancel、遮罩不关 | 差异；且 `showClose={!!onCancel}` 逃过 `dialog-dismiss-control-contract` 的探测，未登记明确出口（对照 `legal-acceptance-modal` 登记了「Disconnect」） |
| 全部平仓 / 反手 | 不把关 | 提交时拒绝、无接受入口 | Sairn 内部不一致（市价/限价给弹窗，这两个只拒绝） |
| 复选框文案 | 「与该部署者所部署的…」（标志却是全局的） | 「与第三方部署的…」 | 语义等价，Sairn 更符合全局语义 |
| 正文 | 两段，链接句在第二段末 | 三段，第三段为链接句，无文档时有兜底句 | 等价 |
| 版本旋钮 | 无 | 三个：键后缀 `-v1`、persist `version: 1`（无 `migrate`）、`HIP3_DISCLAIMER_VERSION`；只有最后一个是有意机制 | 需要注意 |
| 退出过渡 | — | `open` 为字面量 true，接受后父级直接卸载，无 200 ms 退出过渡 | 与样式规范「store 驱动弹窗从 store 派生 open」有出入 |

### 顺路发现（与免责声明无关）

抵押品为 USDC 的 builder dex（xyz、para）正常；抵押品为其它代币的 hyna（token 235）、flx / vntl / km（360）、cash（268）的市场没有进入目录：市场选择器搜索不到，直接打开 `/trade/hyna:BTC`、`/trade/flx:TSLA`、`/trade/cash:TSLA` 都是客户端 404，而 API 的 `allPerpMetas` 与 `perpDexs` 都含这些 dex。`use-markets.tsx` 的派生循环本身不过滤抵押品，原因未定位。

## 验证与限制

- 官方结论来自静态产物与两名核验代理对 `Bf`（弹窗容器）、`L9`/`setGlobalValue`（存储）、`Sx`（dex 判定）源码的逐段核对；未在官方账户上实际操作。
- Sairn 结论来自代码阅读与上述实机操作；未运行测试、未改代码。核验指出 `hip3-disclaimer-store.test.tsx` 只测写入，没有「已存 `acceptedVersion: 1` 时补水后不再弹」的用例，「刷新后不再出现」目前只靠实机检查。
- 目录缺失问题只做了症状确认（API 有、客户端无），未定位到具体代码行。

## 后续与替代关系

- 不替代任何记录。候选处理（待用户决定）：页面级弹窗补一个明确出口并在 dismiss 契约登记，或在文档记录偏离；全部平仓与反手改为与市价/限价一致的可取消弹窗，或与官方一致不再把关；补一条补水回归测试；用 store 派生 `open` 以恢复退出过渡；单独排查非 USDC 抵押品 builder dex 缺失。

## 更正（2026-09-25）

「顺路发现」一节的归因有误。用户指出这些市场全部已下架，随后用公开 API 复核（`meta`，按 dex 查询）：hyna 25/25、flx 16/16、vntl 15/15、km 23/23、cash 17/17 以及 abcd 1/1 的资产全部带 `isDelisted: true`。目录构建在 `use-markets.tsx` 跳过已下架资产，所以这些市场不在目录里、直接打开是 404，属于预期行为，与抵押品不是 USDC 无关。当时只核对了抵押品字段，没有核对 `isDelisted`。仍在交易的 builder 市场（xyz、para、mkts、io）抵押品都是 USDC，目前没有抵押品非 USDC 且仍在交易的市场，非 USDC 抵押品的路径无法据此验证。候选处理中的「单独排查非 USDC 抵押品 builder dex 缺失」撤销；其余候选处理由 [2026-09-25-hip3-disclaimer-alignment](2026-09-25-hip3-disclaimer-alignment.md) 实施。

另一条在独立 worktree 进行的[后续排查](2026-09-25-builder-market-delisting-investigation.md)独立得出同一结论（API 标记下架、目录按下架标志剔除）；它没有重审免责声明结论。

## 周整理补注（2026-09-28）

保留 09-25 的 isDelisted 归因更正；其余候选已有实施和复审修复，不能继续把候选清单当作当前未实现行为。

后续来源：[2026-09-25-hip3-disclaimer-alignment](2026-09-25-hip3-disclaimer-alignment.md)；[2026-09-27-hip3-alignment-review-fixes](2026-09-27-hip3-alignment-review-fixes.md)。

本条为事后整理；本轮仅核对 Git、现行文档和相关实现入口，原验证结果仍归属来源任务，未重跑业务测试。详见 [本周整理](2026-09-28-weekly-memory-review.md)。
