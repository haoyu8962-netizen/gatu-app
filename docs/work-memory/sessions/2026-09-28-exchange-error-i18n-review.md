<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-exchange-error-i18n-review",
  "date": "2026-09-28",
  "title": "错误提示多语言：中文界面出现英文交易所错误的审查、修复与对抗审查",
  "kind": "task",
  "status": "recorded",
  "topics": ["i18n-runtime", "pr-review"],
  "summary": "用户在中文界面的手机杠杆抽屉降杠杆失败，通知正文是交易所英文原文、标题误为「保证金模式」。审查发现原文按当时规则有意原样显示（官方同），但同一通道还泄漏我们自己的与 SDK/钱包/网络英文，金库、质押、API 钱包的辅助函数因把宏 t 当参数返回空串，另有冻结翻译、状态代码原样显示与共享组件写死英文。用户决定修复并像官方一样翻译已知交易所原文：按 ADR 0024 改为保存分类后的失败值、显示时翻译，已知交易所原文翻译、未知的逐字显示；四路 Codex 对抗审查的 1 项 P1 与 10 项 P2 中 10 项已修复、1 项经官方包核对不改、1 项疑似问题记为限制，复核补修契约测试。类型检查、完整单测与 Node 22.15 生产构建已跑；包体总量预算按惯例刷新；2026-09-29 推送并开 PR #60 → dev（未合并），未做浏览器与真实钱包验收。",
  "thread": null,
  "baseCommit": "8cc8a323",
  "commits": [
    "ee94163c",
    "a10f37df",
    "5c21a665",
    "f3e59eb3",
    "fc48158f",
    "9b1147ff",
    "9f1e3367",
    "0b069fd5",
    "eec147aa",
    "33e7a820",
    "9848d8a8",
    "b2f24808",
    "eaa6567f",
    "dd409f67",
    "834aaab7",
    "1e99b672",
    "bba30bd3",
    "610bc8bf",
    "60ee6ab3",
    "34f8a4ed",
    "8434c692",
    "656ced36",
    "bbc03d11",
    "0b4b070b",
    "77a10abb"
  ],
  "sources": [
    { "path": "docs/adr/0024-translate-action-errors-at-render.md" },
    { "path": "apps/terminal/src/lib/errors/action-error.ts" },
    { "path": "apps/terminal/src/lib/errors/exchange-error-text.ts" },
    { "path": "apps/terminal/src/lib/errors/localized-action-error.ts" },
    { "path": "apps/terminal/src/lib/trade/order-status-reasons.ts" },
    { "path": "apps/terminal/src/lib/trade/order-notification-copy.ts" },
    { "path": "apps/terminal/src/domain/trade/order-tracking.ts" },
    { "path": "apps/terminal/src/domain/trade/insufficient-margin-hint.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/margin-mode-modal.tsx" },
    { "path": "apps/terminal/src/components/vaults/use-vault-action-controller.ts" },
    { "path": "apps/terminal/src/components/staking/staking-action-modal.tsx" },
    { "path": "apps/terminal/src/components/api-wallet/use-api-wallet-controller.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "path": "apps/terminal/src/lib/lifi/config.ts" },
    { "path": "apps/terminal/src/lib/tests/action-error.test.ts" },
    { "path": "apps/terminal/src/lib/tests/lingui-helper-translator-contract.test.ts" },
    { "path": "packages/ui/src/pagination.tsx" },
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/adr/0019-global-trading-notifications.md" },
    { "path": "docs/i18n-presentation.md" },
    { "url": "https://app.hyperliquid.xyz/trade" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing" }
  ],
  "supersedes": []
}
-->
# 错误提示多语言：中文界面出现英文交易所错误的审查、修复与对抗审查

## 背景与范围

同步记录。用户在本地开发服务器（`dev` `8cc8a323`，中文界面，手机布局）降低杠杆失败，通知标题为「保证金模式 · 更新失败」，正文是英文「Cross position does not have sufficient margin available to decrease leverage. To decrease leverage, deposit more collateral.」。用户问这是否缺陷、其他语言是否一样，要求审查相关代码并排查全站同类问题，允许新开 worktree。本次在新 worktree `exchange-error-i18n-review`（分支 `claude/exchange-error-i18n-review`，基线 `8cc8a323`）先只读审查：本人核对根因、文档与官方做法，另派三个只读代理分别覆盖交易操作、资金与账户、共享层与被动数据，本人再抽查其关键结论（`ee94163c`）。

2026-09-28 用户看完审查后决定「先做第 1 步，交易所原文也按官方做法翻译」：修空文案与标题，非交易所错误改为按代码或描述符保存并在显示时翻译，去掉冻结翻译，翻译订单状态代码，共享组件文案可翻译，并像官方那样翻译已知的交易所原文、未知的原样显示。2026-09-29 用户要求「等代理完成后调用 codex 来对抗 review 一遍」。实施、审查与修复都在同一 worktree 与分支上进行。2026-09-29 用户要求推送并开 PR：推送前后两次合并最新 `dev`（#58 的 `504e9ca0`、#59 的 `79e0ba68`），两次都只有生成文件 `docs/work-memory/INDEX.md` 冲突，用 `pnpm memory:index` 重建解决；随后开 [PR #60](https://github.com/zora4523-bot/gatu-app/pull/60) 到 `dev`。

## 结论与依据

### 截图这一条（审查阶段）

- 成因（本人核对）：`margin-mode-modal.tsx` 失败时把 `error.message` 原样存进通知任务（约第 441–446 行），`order-notification-copy.ts` 对字符串错误原样返回（第 125、127 行），`order-toast.tsx` 直接渲染。这句英文来自 Hyperliquid 交易所响应。
- 当时的规则：`docs/trading-notifications.md:50`「交易所原始错误按原文展示」，ADR 0019 决策 3「原始交易所错误保持原文」；有 4 个测试在阿拉伯语下钉住原文展示（如 `deposit-modal-withdrawal-routing-guard.test.tsx` 的 "reports a raw exchange error unchanged in any locale"）。所以这句英文本身属于当时的设计，不是回归。其他非英文语言（zh、es、fr、hi、ar）表现相同。
- 官方对照（本人核对，2026-09-28 生产包）：官方调杠杆失败时把交易所返回的原文作为提示显示（`$(e.response,"error")`），只有网络失败才显示翻译的通用文案；下单只特殊处理两条原文（`Insufficient margin to place order.`，按仓位与挂单给出翻译后的提示；`Action already expired`），其余原样显示。
- 同一通知的真实缺陷（本人核对）：手机杠杆抽屉复用 `MarginModeModal`（`mobileView="leverage"`，抽屉自身标题是「调整杠杆」），但 `handleConfirm` 固定用 `title: msg\`Margin mode\``，成功与失败通知都标成「保证金模式」。

### 全站同类问题（审查阶段，按严重程度）

1. 所有语言都显示空文本（本人用项目的 Vitest 编译流程写临时探针测试确认：辅助函数里 `` t`…` `` 输出空串；目录中也没有这些文案）：`use-vault-action-controller.ts` 的 `getVaultActionErrorMessage`（除一处 `t(msg…)` 外全部为空，金库错误 toast 为空、弹窗内提示不显示）、`staking-action-modal.tsx` 的 `getAmountError`、`use-api-wallet-controller.ts` 的名称校验与「今天到期」「剩余 N 天」等状态/有效期标签。原因是把 `useLingui()` 的 `t` 当参数传进辅助函数后用模板标签调用，宏不会转换，运行时等于把字符串数组交给 `i18n._`。
2. 不属于「交易所原文」的英文也走原文通道（代理报告，本人抽查部分）：保证金/杠杆/账户模式、下单、平仓、撤单改单、TWAP、推荐、划转/发送/充值、API 钱包、建立连接、启用交易等路径会原样显示我们自己的英文（如 `use-asset-leverage.ts` 的 "Margin mode data is unavailable"）、hl-react 的法务/签名/nonce/注册错误、SDK 包装文本（如钱包拒签时的 "Failed to sign the typed data using the wallet"）以及 HTTP 4xx 文本。这与 AGENTS.md「Use semantic messages for task feedback and translate at render time」不符；规则只豁免交易所原文。
3. 翻译在出错时冻结或渲染期读全局 `t`：`use-asset-leverage.ts:171`（本人核对）、推荐通知、`trade-panel` 兜底文案、`formatTransferError` 在 `TradingActionButton` 渲染时调用（代理从编译产物推断会按 `error` 缓存而不随语言更新）、平仓输入错误与表单校验辅助函数。违反 `docs/i18n-presentation.md` 第 6–7 行；`i18n-reactivity-contract` 只检查清单内文件自身的导入，发现不了。
4. 稳定代码原样显示：订单对账把 `perpMarginRejected` 等状态代码写进每笔订单的错误行（`order-reconciliation.tsx` 约第 500 行，本人核对）；hl-react 的 `LegalActionNotAllowedError.reason="terms_required"` 等已有代码没有被用来翻译。
5. 交易所原文被改写或截断：我们加的 "Order N: " 前缀、SDK 加的 "cancel 0: " 前缀、`formatTransferError` 只取首行并截到 100 字符（与 `trading-notifications.md:104`「原始错误不猜测、不截断」冲突）；市价平仓拒绝时主行与每市场行重复同一句。
6. 共享组件写死英文（本人核对）：`packages/ui` 分页的 "Previous"/"Next"/"Page N"（三个历史页可见）、搜索框 "Clear search"，以及 Sonner 默认的 "Notifications"/"Close toast" 无障碍名称未覆盖。
7. 被动数据（代理报告，可见性未核实）：图表数据源把原始传输错误传给 TradingView；充值弹窗的钱包提供方检查显示原文（是否算被动数据有争议）。

当时已有的交易所原文映射只有三处：`format.ts` 的 "must deposit before performing actions"、兑换的 "could not immediately match"、Earn 的 "Minimum amount supplied is $1"。Hyperliquid 文档「Error responses」列出 17 种下单/撤单错误及原文，可作为映射依据；资金与其他操作的错误没有文档列表。

### 实施（2026-09-28 至 2026-09-29）

- 规则：新增 [ADR 0024](../../adr/0024-translate-action-errors-at-render.md)，修订 ADR 0019 决策 3 与 `trading-notifications.md` 的原文规则；失败值分为交易所拒绝文案、稳定代码与我们自己的描述符三类，保存语义值、显示时翻译。已知交易所原文翻译并保留数值，未知的逐字显示、不截断；非交易所错误从不原样显示。
- 分工：本人实现核心分类器、交易所原文字典、订单状态原因与 ADR（`a10f37df`、`5c21a665`、`f3e59eb3`）。三个代理在各自 worktree 并行改写入方：交易（`33e7a820`、`9848d8a8`）、界面与辅助函数（`fc48158f`、`9b1147ff`、`9f1e3367`、`0b069fd5`、`eec147aa`）、资金与连接（`b2f24808`、`eaa6567f`、`dd409f67`、`834aaab7`）。合并后本人补五种语言译文（`1e99b672`、`610bc8bf`）、修正 ADR（`bba30bd3`）、Privy 授权确认框文案（`60ee6ab3`）、跨链桥标签并删除未被调用且会返回英文原文的 `formatOrderSubmissionCause`（`34f8a4ed`）、CHANGELOG（`8434c692`）。
- 保证金不足提示（本人核对官方生产包 `config-B3kWIW3_.js`）：官方 `convertError` 在原文以「Insufficient margin to place order.」开头时调用提示函数，传入的订单量是交易按钮组件的 `userSz` 参数，即表单输入的数量，仓位取回包时的当前活跃账户状态。我们用表单数量（Scale 也是总量），仓位改在提交时读取（见下节 B1）。「先撤销挂单」提示需要挂单数据，未接入。

### 对抗审查与修复（2026-09-29）

四路 Codex（`gpt-6-astra`，只读沙箱，`model_reasoning_effort=medium`）审查 `8cc8a323..8434c692`，提示词列出作者声称并要求逐条证伪、禁止提交。结果无 P0；本人逐条对照源码核实后处理如下。

| 编号 | 发现 | 处理 |
|---|---|---|
| A1 P2 | 普通 `Error("Error 0: Device disconnected")` 因形状像 SDK 批次被当作交易所原文显示 | 普通 `Error` 只有整条消息是已知交易所原文时才算交易所拒绝（`656ced36`） |
| A2 P2 | 钱包拒签关键词先于 `ApiRequestError` 判断，含 "user denied" 的整批拒单被吞 | `ApiRequestError`、`HttpRequestError`、`OrderBatchResolutionError` 先判断（`656ced36`） |
| A3/B3 P2 | 批次先拼成 "; " 字符串再解析，原文内的分号使序号丢失、已知文案不翻译 | `OrderBatchResolution.errors` 改为 `{ index, text }[]`，调用方直接使用；解析只在下一条前缀处拆分；单条原文不再解析（`656ced36`） |
| A4 P2 | 「Must deposit…」规则无结尾锚点，会截掉后缀 | 只认原句与 Signing 文档中附加「User: 0x…」的形式，译文保留地址，其他后缀按未知原文显示（`656ced36`） |
| B1 P2 | 保证金提示在回包时读取仓位，提交后切换账户会用到另一个账户的仓位 | 改为提交时读取（`656ced36`） |
| B2 P2 | Scale 用总量而非被拒子单数量判断提示 | 不改：官方同样传入表单数量 `userSz`，提示的含义是整张订单改用只减仓；ADR 注明 |
| C1 P2 | LI.FI 适配层的链或钱包不匹配错误被 SDK 包装后降级为通用文案 | 适配层改抛 `LocalizedActionError`/`createActionError`，分类器沿 `cause` 链找回（`656ced36`、`bbc03d11`） |
| D1 P1 | 金库把普通网络失败误报为「当前所有者钱包或网络已变化」（宽泛正则 `/wallet\|network\|owner/`，修空串后才变得可见） | 金库自有前置错误改抛 `LocalizedActionError`，其余走共享分类器（`bbc03d11`） |
| D2 P2 | 金库丢弃交易所拒绝原文 | 金库状态保存 `ActionFailure`，交易所拒绝保留原文（`bbc03d11`） |
| D3 P2 | 契约测试只认参数名 `t`，漏掉重命名参数 | 拒绝任何绑定到函数参数的标签、`x.t`/`x._` 标签与 `ReturnType<typeof useLingui>`（`0b4b070b`） |
| D4 疑似 P2 | 英语与印地语共用 TradingView `en`，互切不重建图表，已显示的图表错误原因不换语言 | 不改，记为已知限制（ADR 0024 后果一节） |

第五路 Codex 复核 `8434c692..0b4b070b` 与未提交的文档改动：确认 A1–A4、B1、B3、C1、D1、D2 已修复，未发现修复引入的交易、签名或资金回归，`OrderBatchResolution.errors` 未进入所查的持久化结构；另报契约测试仍漏检标签与模板之间的注释和括号包着的标签（P2），并误报声明为模板标签函数的参数（P3），已在 `77a10abb` 修复（扫描含反引号的所有文件、剥去括号与类型断言、放行首参数为 `TemplateStringsArray` 的参数）。复核还指出当前检出里没有官方生产包，不能独立确认 B2 的官方依据；该依据是本人 2026-09-28 只读下载的公开资源，未入库。

### 包体预算

第一次 Node 22.15 构建只在「客户端 gzip 总量」一项失败：3,178,001 字节，比基线 3,154,707 多 23,294，允许增量 10,000；无分块环，其余预算通过。这次构建没有像 CI 那样设置 `NODE_ENV=production`，比 CI 口径多 2,445 字节。按 CI 的环境变量（Node 22.15.0、`NODE_ENV=production`、`NITRO_PRESET=node-server`、`VITE_MOBILE_PAIRING_ENABLED=false`）重建后总量 3,175,556；对照 PR #57 的 CI 构建（run `36416081897`，同口径，总量 3,157,661），本分支净增 17,895 字节。其中五个非英文目录合计由 170.65 kB 增至 182.68 kB（Vite 报告的 gzip，+12.0 kB），用户只加载当前语言的一个；首屏闭包 1,550,326 → 1,554,798（仍比首屏基线低 26,418），手机与桌面运行时分别 +204 与 +427 字节，`trade-terminal-page` 124,829 → 124,965。按 `docs/api-wallet-redesign-notes.md` 记录的既有做法，把总量基线刷新为同口径实测值 3,175,556 并保留 10,000 字节余量，脚本注释写明原因。

## 验证与限制

- 审查阶段（2026-09-28，基线 `8cc8a323`）：本人核对根因与标题、文档规则与 4 个钉住原文的测试、官方生产包（`config-B3kWIW3_.js` 与主语言包，只读下载公开资源）、空串问题（临时探针测试输出 `"[]"`，测试文件已删除）、分页与搜索框写死英文、`use-asset-leverage.ts:171` 全局 `t`、对账状态代码；代理报告的完整清单与编译产物推断未逐条复核。
- `pnpm typecheck`（hl-react、ui、terminal）在 `8434c692` 与 `77a10abb` 上均通过。
- 完整终端单测 `pnpm --filter @gatu/terminal test`：`8434c692` 上 633 个文件通过、1 个失败，失败的是 `chart-build-assets.test.ts` 在四个 Codex 进程并行时 5 秒超时，单独重跑 17 项通过（该用例 507 ms）；`0b4b070b` 上 634 个文件通过、1 个跳过，7,850 项通过。`77a10abb` 只改契约测试，单独运行 21 项通过。
- 变异检查（改回旧行为确认测试变红，随后恢复）：Privy 授权文案、跨链桥倒计时标签、提交时读取仓位、分类顺序、契约测试扫描（临时放入括号加注释的违规文件后被报告，文件已删除）。
- 目录：`pnpm i18n:extract` 后 ar/es/fr/hi 各 44、zh 3（含废弃条目，与实施前相同）；非废弃的空译文 es 18、zh 0（本人核对，Codex 报告 ar/fr/hi 同为 18，与基线一致）。
- 生产构建（Node 22.15.0，CI 环境变量，配对关闭，代码同 `77a10abb`）：`pnpm --filter @gatu/terminal build` 通过（429 个分块无环、总量与各分块预算、shell 预加载注入与内联脚本哈希；当时脚本里是中间值 3,178,001，改为最终基线 3,175,556 后对同一产物重跑预算脚本，+0、退出码 0）；随后按 `production-build.yml` 跑 `perf:startup`（client-root 静态闭包 34 块、1,202,785 gzip 字节）、生产懒加载图核对（本地 3099 端口，解析到 `trade-terminal-page`）与 `deploy/verify-chart-build.mjs`，均通过；`scripts/check-client-bundle-budget.test.mjs` 16 项通过。配对开启的同口径构建（进 `main` 的 PR 与发布标签才运行）也通过：总量 3,176,963（比新基线 +1,407），`trade-terminal-page` 124,974。
- 未做：浏览器中实际切换语言查看通知、真实钱包签名与交易所拒单、Privy 确认框在真机上的中文显示；这些不能由单元测试证明。

## 后续与替代关系

- [PR #60](https://github.com/zora4523-bot/gatu-app/pull/60) → `dev` 待 CI 与合并，未晋升 `main`、未发布；合并后清理三个代理 worktree 与 `claude/err-i18n-trading`、`claude/err-i18n-ui`、`claude/err-i18n-funds` 分支。
- 后续事项：下单表单校验器（`apps/terminal/src/lib/errors/definitions/*`）仍在校验时读全局 `t`，依赖组件重渲染更新；「先撤销该市场挂单」提示待接入挂单数据；图表错误原因的 en↔hi 限制待浏览器确认；发送前失败的 `HttpRequestError` 仍保守地报告为「未确认」；`throwIfAnyResponseError` 仍抛普通 `Error`（SDK 会先抛 `ApiRequestError`，此路径实际不可达）。
- 本记录取代自身 2026-09-28 版本中「待用户决定修复范围」的后续结论；没有其他被替代的记录。
