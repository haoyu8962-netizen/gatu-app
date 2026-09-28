# ADR 0024：操作错误在显示时翻译，已知交易所拒绝文案按官方做法翻译

- 状态：已接受并实施（2026-09-28，分支 `claude/exchange-error-i18n-review`）；未合入、未发布。修订 [ADR 0019](0019-global-trading-notifications.md) 决策 3 中「原始交易所错误保持原文」一句，以及 [交易通知](../trading-notifications.md)的对应规则。
- 关联：[错误提示多语言审查](../work-memory/sessions/2026-09-28-exchange-error-i18n-review.md)（成因、全站清单与官方对照）；[运行时多语言](../i18n-presentation.md)；Hyperliquid 文档 [Error responses](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses)。

## 背景与约束

- 用户在中文界面的手机杠杆抽屉降杠杆失败，通知标题是中文，正文是交易所英文原文「Cross position does not have sufficient margin available to decrease leverage…」。当时的规则是交易所原文原样显示，这与官方终端一致：官方调杠杆失败也直接显示交易所原文，只在下单时把「Insufficient margin to place order.」（按仓位与挂单附加提示）和「Action already expired」换成翻译。
- 审查同时发现，原文通道并不只放行交易所原文：我们自己的英文、hl-react 的法务/签名/nonce/注册错误、SDK 的钱包包装文本与 HTTP 文本都会原样显示；有些文案在出错时就按当时语言翻译并冻结；三个辅助函数接收 `useLingui()` 的 `t` 后用模板标签调用，运行时返回空串；对账把订单状态代码原样当错误行；共享组件写死英文。
- 约束：交易所是最终裁决，原文是唯一准确的来源，不能猜测或改写未知原文，也不截断（[交易通知](../trading-notifications.md)「原始错误不猜测、不截断」）；显示中的文案要随语言切换（[运行时多语言](../i18n-presentation.md)）；普通 Sonner 短提示在弹出时按当前语言格式化是既有约定。

## 决策

1. **保存语义，显示时翻译。** 失败值分三类，由 `apps/terminal/src/lib/errors/action-error.ts` 的 `classifyActionError` 判定：交易所拒绝文案（`exchange-error`，逐条保存，保留批次序号）；稳定代码（`action-error`，来自 SDK 与 hl-react 错误的 `name`、`reason`、HTTP 状态、钱包拒签等）；我们自己的消息（`LocalizedActionError` 携带 `msg` 描述符）。通知任务、组件状态与内联提示保存这些值，渲染时用订阅语言的翻译函数生成文字。
2. **已知交易所文案翻译，未知的原样。** `apps/terminal/src/lib/errors/exchange-error-text.ts` 收录官方文档列出的 17 种下单与撤单错误、用户报告的降杠杆保证金不足、官方已翻译的「Action already expired」，以及原有的「Must deposit before performing actions」。翻译保留交易所给出的数值（金额、代币、最优买卖价）；匹配不到的文案逐字显示、不截断。新增规则只能来自文档或实际观测到的原文。
3. **按官方做法附加保证金不足提示。** 下单被拒为「Insufficient margin to place order.」、账户在该市场持有反向仓位且订单量不超过仓位的两倍时，与官方相同地提示改用只减仓（`domain/trade/insufficient-margin-hint.ts`），提示文案同样翻译。官方的另一种提示「先撤销该市场挂单」需要挂单数据，下单流程没有现成的挂单订阅，本次未实现；字典已支持该文案，接入挂单数据后即可使用。
4. **非交易所错误从不原样显示。** 分类不出的错误显示翻译后的通用文案或调用方的兜底文案；原英文只保留在 `Error.message`，供日志与错误上报使用。
5. **订单状态代码显示为原因。** 对账写入的 `perpMarginRejected` 等状态代码按官方状态提示的含义翻译（`apps/terminal/src/lib/trade/order-status-reasons.ts`）。
6. **辅助函数只接收描述符翻译器。** 渲染期辅助函数的翻译依赖使用 `apps/terminal/src/lib/translate.ts` 的 `Translate`（只接受 `MessageDescriptor`），用 `msg` 构造文案；禁止把宏 `t` 传进辅助函数再用模板标签调用，由契约测试检查。
7. **批次与前缀。** 同时识别我们的「Order N: …」与 SDK 的「order i: …」格式；只有一条时去掉前缀，多条时译出序号。
8. **共享组件文案可覆盖。** `packages/ui` 的分页与搜索框提供标签属性，应用传入翻译；Sonner 容器与关闭按钮的无障碍名称由应用覆盖。

## 备选方案与代价

- **维持原文（原规则，也是官方做法）。** 零误译风险、实现最简单；但非英文用户看到英文，而且非交易所文本也经同一通道泄漏。未采用。
- **模糊匹配或机器翻译所有交易所文案。** 覆盖广，但会把未知含义改写成错误解释，违背「不猜测」。未采用。
- **只在出错时翻译（原 `lib/errors/format.ts` 的做法）。** 切换语言后文案不更新；英文正则在非英文界面对已翻译文本失配。未采用。
- **让 hl-react 为每个错误提供稳定代码。** 更彻底，但要改动包接口；本次用现有类名与原因，加少量英文消息规则，后续可以逐步把规则换成代码。

## 后果与边界

- 交易所改写原文后，对应规则失配，文案回退为原文逐字显示，不会给出错误解释；`action-error.test.ts` 钉住每条已知原文。
- 无法识别的第三方钱包或提供方文本改为通用文案，用户看不到原始细节（日志仍有）。
- 普通 Sonner 短提示在弹出时按当前语言格式化，已显示的不重译，沿用既有约定。
- 对 API 规则之外的资金与其他操作错误没有官方原文清单，只映射已观测到的几条。

## 证据

- 代码：`lib/errors/action-error.ts`、`lib/errors/exchange-error-text.ts`、`lib/errors/localized-action-error.ts`、`lib/errors/format.ts`、`lib/translate.ts`、`lib/trade/order-status-reasons.ts`、`lib/trade/order-notification-copy.ts` 与各写入方。
- 测试：`lib/tests/action-error.test.ts`（每条已知原文、批次解析、官方提示、分类、语言切换后重译、未知错误不显示英文）、`lib/tests/errors.test.ts`，以及各写入方的组件测试。
- 官方对照：2026-09-28 只读下载的 `app.hyperliquid.xyz` 生产包 `config-B3kWIW3_.js`（调杠杆失败显示 `e.response`；下单 `convertError` 只处理两条原文）与主语言包。
- 验证结果：见[审查记录](../work-memory/sessions/2026-09-28-exchange-error-i18n-review.md)的实施与验证部分。
