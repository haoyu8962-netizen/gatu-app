<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-23-claude-eight-commit-adversarial-review",
  "date": "2026-09-23",
  "title": "Claude 署名八提交对抗审查：市价平仓等待窗口与 TP/SL 说明",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "pr-review",
    "order-entry"
  ],
  "summary": "审查 b82dd443..cf76c54a 的 8 个 Claude 联署提交：确认 3 项 P2，涉及懒加载等待期间确认未封存、重复调用提前清除宿主运行标记，以及 TP/SL 文案遗漏保证金不足取消的官方例外；现有 439 项聚焦单测与 9 项浏览器布局测试通过，另以隔离复现验证前两项；未改交易实现、未执行真实交易。",
  "thread": null,
  "baseCommit": "cf76c54a",
  "commits": [
    "85525d49",
    "9fb13653",
    "ab060288",
    "40ca2237",
    "1cc83fbf",
    "79542991",
    "683f7590",
    "cf76c54a"
  ],
  "sources": [
    {
      "path": "apps/terminal/src/lib/trade/position-market-close-submitter.ts"
    },
    {
      "path": "apps/terminal/src/components/trade/components/position-market-close-submit-host.tsx"
    },
    {
      "path": "apps/terminal/src/components/trade/positions/position-market-close-modal.tsx"
    },
    {
      "path": "apps/terminal/src/lib/trade/order-notification-copy.ts"
    },
    {
      "path": "packages/hl-react/src/hooks/useTradingGuard.ts"
    },
    {
      "path": "packages/hl-react/src/hooks/useExchange.ts"
    },
    {
      "path": "packages/ui/src/modal.tsx"
    },
    {
      "path": "docs/confirmation-surfaces.md"
    },
    {
      "path": "docs/trading-notifications.md"
    },
    {
      "path": "docs/hyperliquid-sdk-reference.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-23-codex-legal-notification-review-fixes.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-09-23-market-close-page-level-submit-host.md"
    },
    {
      "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl"
    },
    {
      "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint"
    },
    {
      "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint"
    },
    {
      "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods/order"
    },
    {
      "url": "https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/orderstatus"
    },
    {
      "url": "https://react.dev/reference/react/useEffect"
    }
  ],
  "supersedes": []
}
-->
# Claude 署名八提交对抗审查

## 背景与范围

用户要求核对 Hyperliquid 官方开发文档、项目使用的 SDK 文档，对最近 8 个 Claude 署名提交做对抗审查。本记录为当次审查记录，不是实现或上线验收；未取得已核对的任务标识，`thread: null`。代码审查基线为 `cf76c54a`，分支 `codex/reviewceshi`，差异范围 `b82dd443..cf76c54a`。署名依据是提交正文的 `Co-Authored-By: Claude Opus 5.5`，不是仅凭作者用户名推断工具来源。

| 提交 | 内容 | 本轮结论 |
| --- | --- | --- |
| `85525d49` | 持仓弹窗宿主移出 legal gate；移除被动法律检查提示 | 未发现新增签名门控绕过；相关回归通过 |
| `9fb13653` | 部分成交 TP/SL 提示、六语言目录、对账类型收窄 | F3：提示与官方例外不符 |
| `ab060288` | 普通订单选项的点击区域 | 未发现新的点击区域或布局回归 |
| `40ca2237` | 审查修复记录 | 属于历史证据；其中“中性规则”结论受 F3 限定 |
| `1cc83fbf` | 桌面 TWAP 选项点击区域 | 未发现新的点击区域或布局回归 |
| `79542991` | TWAP 修复记录 | 文档提交，无独立运行时代码 |
| `683f7590` | 页面级 Market Close 提交宿主 | F1、F2：等待及重复调用生命周期缺口 |
| `cf76c54a` | 提交宿主工作记录 | 常规卸载场景通过，但不能涵盖 F1 组合场景 |

审查开始时检出干净；期间发现其他工作产生的 `apps/terminal/tests/browser/position-close-all.pw.ts` 和 `docs/work-memory/sessions/2026-09-23-market-close-page-level-submit-host.md` 未提交修改，保留且不纳入本次提交。下面的 9 项浏览器验证只运行 `desktop-order-entry-layout.pw.ts`，不把别人更新的 close-all 断言或其“40/40”描述计为本轮证据。

## 结论与依据

本轮发现 3 项 P2，未发现可确认的新增 P0/P1。

### F1 — P2：重复调用清除了仍在执行的宿主运行标记

**引入：** `683f7590`。位置：`apps/terminal/src/components/trade/components/position-market-close-submit-host.tsx:17-19`，清理依赖同文件 `:24-28`。

宿主对每次调用都 `Set.add(sessionId)`，并无条件在该调用结束时 `Set.delete(sessionId)`。同一个会话的第二次调用会被真实 submit hook 的 `phase !== idle` 检查立即拒绝，但它的 `finally` 仍删除第一次调用的运行标记。随后宿主在 `validating` 或 `submitting` 阶段卸载时，`runningSessionIds.has(...)` 已是 false，无法丢弃原会话；原请求恢复后仍能通过依赖会话与被冻结实时数据的执行守卫。

**可达条件：** 同一按钮的普通连续点击有 `useTradingGuard.inFlight` 保护，不会直接重入。本轮进一步核对真实 `TradingActionButton` / `useTradingGuard`：宿主尚未加载时点击确认，弹窗仍在；跨桌面/移动断点使 `AdaptiveModal` 从 `Modal` 切到 `Drawer`，其按钮和局部锁重新挂载，第二次确认可以再加入等待。宿主随后注册，第一条等待开始校验，第二条立即返回并误删标记；此时页面离开或 `marketReady` 使宿主卸载，就会出现上述缺口。

**复现：** 真实 modal、submit hook、store、按钮和 trading guard；网络与 exchange 边界模拟；展示外壳用保留 `presentation` 分支重挂载语义的透传替身。两次确认后挂载宿主、保持仓位查询未返回、卸载宿主，再释放查询。观察 `phaseAfterUnmount: validating`，模拟 exchange 执行次数为 **1**，期望为 **0**。基础 hook 级复现也得到相同结果。这里证明的是丢失卸载保护，不是“发送了两笔订单”；没有真实账户成交证据。

**建议：** 在提交入口按 session 保存唯一 Promise/尝试对象，对重复调用复用它；结束时只有拥有该尝试的调用可以清除记录。清理不能依赖一个会被无操作调用删除的字符串 Set。保留“重复确认 → 断点重挂载 → 宿主卸载 → 零 exchange 调用”的回归。

### F2 — P2：等待懒加载期间确认未封存，后续编辑会改变本次执行

**引入：** `683f7590`。位置：`apps/terminal/src/lib/trade/position-market-close-submitter.ts:48-50`；调用处 `positions/position-market-close-modal.tsx:200-206`。

未注册宿主时先等待最多 5 秒，直到注册后 submit hook 才创建 pending 通知、dismiss 弹窗并把 phase 改为 validating。因此确认点击后 session 仍是 `idle/confirmation`，数量输入仍可编辑，通知也尚未出现。新的 submit input 只带 `confirmedCloseSize` 上限，未带当次 sizing intent；稍后 hook 从 live session 读意图。用户看到 2.5 并确认，等待时改为 1，宿主到达后发出 1，期间仓位本身完全未变。

**复现：** 使用真实 modal、按钮、trading guard、submit hook 和 store，模拟延迟宿主注册。确认后 `editableAfterClick: true`、`presentationAfterClick: confirmation`；改变 store 的可编辑意图为 1，宿主注册后模拟 exchange 参数 `s: "1"`。输入控件的 enabled 状态也已核对。没有物理输入或主网交易验收。

这不是执行量超出确认上限：现有数量上限仍然有效。但点击未立即关闭、无请求通知、后台使用确认后的表单编辑，违反确认面生命周期约定；部分平仓还可能留下用户以为会被全部关闭的敞口。

**建议：** 在首次确认的同步阶段创建不可变的提交尝试，保存当次意图及显示上限、dismiss 并建立单一 pending 通知，再等待宿主。区分“等待宿主”与“尚未确认的 idle”；超时或初始化失败为同一任务报告失败，不能靠编辑中的 session 继续提交。与 F1 联合验证。

### F3 — P2：TP/SL 提示遗漏官方明确的保证金不足例外

**引入：** `9fb13653`。位置：`apps/terminal/src/lib/trade/order-notification-copy.ts:39-46`，其六语言目录及 CHANGELOG 同步包含此断言。

`execution.completeness === partial` 且有 `tpPrice/slPrice` 时，无条件提示附带 TP/SL **只有完全成交后**才下达，并要求在仓位上另设保护。官方 [TP/SL 规则](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl) 明确区分：用户取消部分成交父单会取消子单；父单部分成交后因保证金不足取消，附属 TP/SL 则会像完全成交一样下达。项目锁定的 SDK `orderStatus` 也单列 `marginCanceled`。

当前 helper 没有检查取消原因或子单状态；“无法在提交时区分”不足以支持“只有完全成交”的绝对断言。该提示可能让用户误判已有保护不存在并重复设置。规范 `docs/trading-notifications.md` 已列出正确例外，运行时短文案却没包含，历史记录的“中性规则”表述不能证明文案正确。

**证据边界：** 属于官方协议文档与代码条件的确定性矛盾；没有捕获真实 `marginCanceled` 交易回包，也不声称本轮证明了某个主网账户的子单状态。原单测只验证新文案出现在通用 partial 摘要，没有针对已下达子单或保证金不足取消的反例。

**建议：** 无确切子单证据时提示“部分成交，请核对持仓的 TP/SL”，或完整表达官方例外；有可靠子单状态后再细分。同步六语言、CHANGELOG 和通知规范，并为普通取消、保证金取消、子单已接受、状态未知分别验证文案。

## 官方与 SDK 文档核对

查阅日期：**2026-09-23**。这是本轮访问日期，不是官方文档发布日期或更新时间。按 `docs/hyperliquid-sdk-reference.md`，协议以 Hyperliquid 官方文档为准，TypeScript 签名以安装的 `@nktkas/hyperliquid@0.33.3` 为准；nktkas 是项目使用的社区 SDK，不称其为 Hyperliquid 官方 SDK。本会话没有对应文档 MCP，使用网页读取官方及 SDK 维护者站点。

- [官方 Exchange](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint) 与 [nktkas order](https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods/order)：订单 `a/b/p/s/r/t/c` 字段与 grouping 含义相符。项目平仓计划仍是反向、reduce-only，价格和数量为十进制字符串；没有因本轮提交迁移字段或改成浮点金融运算。安装的 `order.d.ts` 支持 `FrontendMarket`，说明其类似 IOC；不能仅因官方简略订单示例未列该值就判为错误。
- [官方 Info](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint) 与安装的 `clearinghouseState.d.ts`、`metaAndAssetCtxs.d.ts`：查询使用实际账户 owner 和匹配 DEX；元数据与行情 tuple 按市场索引配对。本次搬迁没有改写这些 API 参数。
- [nktkas orderStatus](https://nktkas.gitbook.io/hyperliquid/api-reference/info-methods/orderstatus) 与安装声明：`marginCanceled` 与普通 `canceled` 分开；订单执行响应的 `filled.totalSz/avgPx/oid`、`waitingForFill`、`waitingForTrigger` 均不能被无证据推广为“子单已下达”或“仓位已归零”。
- [React useEffect](https://react.dev/reference/react/useEffect)：effect 在卸载时清理，依赖变化时先清理旧实例；开发 StrictMode 的额外 setup/cleanup 需要对称。页面级宿主方向合理，F1 是尝试所有权记录错误，不能通过去掉卸载保护解决。
- `useExchange` 仍在排队和 SDK 调用边界执行 guard，并在执行前复核 legal 与签名会话。持仓宿主移出 legal gate 不等于绕过交易许可。F1 的风险条件是 provider/身份仍有效而提交宿主卸载；若 provider 生命周期或 owner 同时失效，底层还有独立保护，本轮未声称绕过它们。

## 验证与限制

实际执行版本：上述实现文件均为 `cf76c54a`；本轮未改生产实现。复现测试是独立临时文件，结束前移出测试目录，源码与输出保留在 Git 忽略的 `.worklog/2026-09-23-claude-eight-review/`，避免把刻意失败的测试提交为常规套件。

| 检查 | 本轮结果 |
| --- | --- |
| 提交范围内仍存在的 24 个 TS/TSX 文件：`pnpm exec biome check ...` | 通过，无修复 |
| `pnpm --filter @gatu/terminal typecheck` | 通过 |
| Market Close、legal 分支、通知 copy/reconciliation、紧凑表单/TWAP：10 文件 | **177 项通过**；global-modals-market-close-legal 有 act 包裹警告 |
| dialog ownership、HIP-3、legal gate、onboarding、mobile presentation、i18n、toast placement：8 文件 | **262 项通过** |
| `pnpm --dir apps/terminal exec playwright test tests/browser/desktop-order-entry-layout.pw.ts --config tests/browser/mobile-trade-all-orders.playwright.config.ts` | **9 项通过**；中英文、375/1001/1400/1420/1421/1545px 的相关布局与命中几何覆盖 |
| 隔离 hook 级反例测试 | **2 项按预期失败**，分别暴露 F1/F2；其余 9 项因 `-t` 过滤而跳过 |
| 真实 modal/TradingActionButton/useTradingGuard 的隔离反例 | **2 项按预期失败**，F1/F2 各复现一次；Modal/Drawer 外壳的重挂载语义为替身模拟 |

以上正常套件合计 **18 文件、439 项单测通过**，不把反例失败计为套件成功。未重跑全量单测、全量 Playwright、生产构建；未执行任何真实下单、钱包签名、物理触控、屏幕阅读器或发布验收。浏览器用例是 Chromium 协议驱动的夹具测试，其 Vite 缓存与应用开发缓存隔离。

工作记录校验：首次 `pnpm memory:index` 因报告小节名称没有使用模板要求的 `背景与范围` 而失败；已将必需小节名对齐模板后重新验证：`memory:index`、`memory:check` 均通过，`memory:test` 8/8 通过；未修改校验工具。

本地证据：`repro-output.txt`、`ui-repro-output.txt`、两份 `review-claude-eight-*.test.tsx.txt`、`browser-output.txt`、`typecheck-output.txt`、`biome-output.txt`、`legal-i18n-output.txt`。最初 177 项单测输出见本次工具结果；没有伪造为原始日志文件。模拟用户地址和 mock 回包仅供复现，不对应真实账户。

## 后续与替代关系

建议把 F1/F2 作为一个提交生命周期修复任务，F3 作为通知语义修复任务。保留当前页面级宿主和 reduce-only/owner/legal/数量上限保护，不回退到列表或弹窗内的提交 hook。本次仅审查并记录问题，没有实施这三个修复。

本记录只限定两个历史结论：“只有全成才下达 TP/SL”的说明不完整；“宿主卸载始终失败关闭”的验证没有覆盖重复尝试组合。不整体废弃前述历史记录，也不改写其已发生的测试结果。
