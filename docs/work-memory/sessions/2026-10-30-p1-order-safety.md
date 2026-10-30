<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-30-p1-order-safety",
  "date": "2026-10-30",
  "title": "第一批 P1 下单安全：L1 动作 15 秒过期、限价与触发价不再静默取整、Scale 按档位加权均价换算",
  "kind": "task",
  "status": "recorded",
  "topics": ["order-entry", "hyperliquid-api"],
  "summary": "运营方选「先修第一批 P1」后的第一组（全功能审查 M1、A8、A1）。M1：createExchangeClient 与 getTradingClient 设置 SDK defaultExpiresAfter，L1 动作过期时间为 exchangeStatus 估计的交易所时间加 15 秒（墙钟与单调时钟取大，取不到时回落本机时间），ADR 0045；没有关闭开关，待运营方决定。A8：限价与触发价不在最小变动单位上时校验器拦截并给出合规示例价，提交时限价只向用户边界方向取整，确认弹窗与通知同口径。A1：Scale 的换算价改为各档按数量加权的均价（对齐官方 Gq），USD 数量、订单价值、费用与手机保证金随之改变，reduce-only 浏览器测试的 Scale 保证金预期由 $10.00 改为 $8.00。全量单测与下单浏览器套件通过（vite-development-cache 在沙箱内因端口 EPERM 失败，沙箱外通过）。未推送。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": [],
  "sources": [
    {"path": "packages/hl-react/src/internal/exchange/server-clock.ts"},
    {"path": "packages/hl-react/src/clients.ts"},
    {"path": "apps/terminal/src/lib/errors/definitions/price-tick.ts"},
    {"path": "apps/terminal/src/domain/trade/orders.ts"},
    {"path": "apps/terminal/src/domain/trade/order/entry-limit-price.ts"},
    {"path": "docs/adr/0045-l1-action-expiry.md"},
    {"path": "docs/order-entry-surface-parity.md"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/support/faq/trade-outcome-looks-incorrect/what-does-action-already-expired-mean"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint"}
  ],
  "supersedes": []
}
-->
# 第一批 P1 下单安全：L1 动作过期、价格最小变动单位与 Scale 换算价

## 背景与范围

同步记录，未取得任务标识。2026-10-30 运营方在[全功能审查](2026-10-30-full-feature-audit.md)后选「先修第一批 P1」。本记录是第一组（下单安全）：M1、A8、A1。分支 `claude/p1-order-safety`，基于 `dev` `d99c2bc9`，带上审查记录的提交 `8fb9ee29`。

## 结论与依据

- **M1 L1 动作过期。** 官方前端包（2026-10-30 抓取）：`Hce` 发送 L1 动作时 `expiresAfter = disable_expires_after ? null : y8.expiresAfter()`，`y8.expiresAfter() = serverTime + Date.now() - localTimeSet + 15000`，`serverTime` 取自账户快照 `userState.serverTime`；交易所对过期动作返回 `Action already expired`，官方把它转成指向 FAQ 的说明。SDK 0.33.3 的 `executeL1Action` 读取 `defaultExpiresAfter`（可为异步函数），用户签名动作不读。本终端的 L1 动作只走交易客户端（Agent 或 `showWalletUIs: false` 的内嵌钱包），`expiresAfter` 在请求排队、法律与资金锁之后、签名之前才计算。实现与取舍见 [ADR 0045](../../adr/0045-l1-action-expiry.md)。`exchangeStatus` 在主网与测试网可用，实测服务器时间与本机相差约 0.1 秒。
- **A8 价格最小变动单位。** 官方 `preSubmitValidation` 对限价用 `F3(x, …, "floor")` 取整后与输入比较，不等就报 `Price must be divisible by tick size, with at most 5 significant figures. E.g., {roundedPx}` 并阻止提交。本终端改为表单校验器 `limit-price-tick` / `trigger-price-tick`（文案沿用仓库已有的 multiple of the tick size 措辞），限价示例买单向下、卖单向上，触发价向下；提交时 `formatLimitPriceForOrder` 只向用户边界一侧取整，确认弹窗与下单通知同口径。
- **A1 Scale 换算价。** 官方 `Gq` 以名义数量 1000 生成档位后取数量加权均价，作为表单的限价（`setLimitPx`）参与换算。本终端 `getScaleAveragePrice` 用同一套档位价格与精确偏斜权重计算加权均价，经 `getOrderEntryLimitPx` 作为 `useOrderEntryData` 的 `limitPx`。旧文档「Scale 区间中点不改变手机保证金」是 reduce-only 修复时「不顺带改」的范围限制；本次有意改为加权均价，已在 `order-entry-surface-parity.md` 与 `reduce-only-repair-plan.md` 补记。

## 验证与限制

- 单元与组件：`exchange-action-expiry.test.ts`（8 项）、`order-validation.test.ts`、`order-intent.test.ts`、`scale-conversion-price.test.ts`、`trade-form-fields-order-entry-data.test.tsx`、`tests/trade-panel-open-interest-cap.test.tsx`、`tests/mobile-trade-size-validation-a11y.test.tsx` 新增用例通过。
- 变异：删去两处 `defaultExpiresAfter`，交易客户端测试失败；去掉两个价格校验器并把提交取整改回四舍五入，6 项失败；手机端把 `limitPx` 改回旧表达式、去掉限价校验器，2 项失败；均已还原。
- 全量：`pnpm --filter @sairn/terminal test --maxWorkers=4`，689 个文件 9300 项中 9298 通过、1 跳过、1 失败；失败项 `vite-development-cache.test.ts` 为沙箱禁止监听 5173 端口（`listen EPERM`），沙箱外单独重跑通过。
- 浏览器：`playwright.config.ts` 下 `trade-panel-all-orders`、`trade-panel-layout` 12 项通过；`mobile-trade-all-orders.playwright.config.ts`（含 `desktop-order-entry-layout`、`reduce-only`）首轮 46 通过、1 失败（Scale 保证金预期 $10.00），改为 $8.00 后 `reduce-only.pw.ts` 16 项通过。浏览器测试需要监听端口，在沙箱外运行。
- `pnpm typecheck`、改动文件的 Biome 通过；`pnpm i18n:extract` 后新文案的六种语言译文已补，缺失数与改动前相同（zh 3、ja 0、ar/es/fr/hi 66，均为原有）。
- 未做：真实下单、过期拒绝的真实网络验证、真机；Codex 推送前审查待做（与其他组一起）。附带 TP/SL、TWAP 触发价与最高/最低价、持仓弹窗的价格取整方式没有改。

## 后续与替代关系

- 待运营方决定：是否像官方那样提供「关闭交易延迟保护」开关（审查记录「需要运营方决定」第 1 项）。
- 第一批其余各组（资金安全、金库与仪表盘、历史与表格、图表、改单）在各自分支进行。
