# 下单字段修复与参考核对

## 范围与依据

本次修复限价/分段订单的参考价格填充、桌面字段错误反馈和 TWAP 时长零值。保持交易签名、账户及行情新鲜度、提交参数校验、订单类型和布局边界不变。

2026-09-11 在 Hyperliquid HYPE 交易页检查了桌面与 393px 手机视窗：

- Mid 按钮将参考价格写入限价输入框；不会因为后续报价变动持续覆盖草稿。
- TWAP 输入 1 小时、0 分钟，输入框实际值为 `0`，摘要为 1 小时；默认 30 来自真实输入值，分钟输入没有 `30` 占位。
- 未进行真实下单，未复现参考站点的后台断网/恢复错误，因此不宣称其完整故障处理逻辑与本项目相同。

公开 [config-BdRWrCoz.js](https://app.hyperliquid.xyz/assets/config-BdRWrCoz.js) 的限价取价链为 `fastAssetCtxs → mids[coin] = midPx ?? markPx → Mid 按钮`，不使用 BBO 均价。自动预填按价格精度四舍五入；显式 Mid 点击在该版本按买/卖方向向下/上取整。本次保留本项目现有、符合协议精度约束的格式化逻辑，不把参考站点的定价偏好误当 SDK 必须规则。

锁定 SDK 为 `@nktkas/hyperliquid@0.33.3` 加仓库已有补丁：

- `activeAssetCtx` / `activeSpotAssetCtx` 的 `ctx.midPx` 为十进制字符串或 null，`markPx` 为字符串。[订阅文档](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions)
- 标记价用于保证金、清算及触发等用途，不能用缓存值的存在证明新鲜度。[价格说明](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/robust-price-indices)
- 限价提交需要明确的正价格与正确精度；SDK 不负责自动预填。[交易接口](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)、[价格与数量精度](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size)
- TWAP `m` 为安全整数总分钟，当前范围 5–10080。[订单类型](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types)明确 5 分钟至 7 天。原版 SDK 0.33.3 的 1440 上限已由 `patches/@nktkas__hyperliquid.patch` 同步修正运行时与类型，本次保留该补丁。

## 实施约定

1. 预填复用已经按市场隔离的 `useSelectedMarketInfo` 上下文，不新增 `fastAssetCtxs` 或 BBO 订阅。mid 优先，仅为空时选择 mark；检查被选中来源自己的接收时间与成功状态。已有 mid 失效时保持禁用，不回退 mark。无新鲜参考时不消耗预填机会；新报价不覆盖手输或手动清空的草稿。
2. 删除无条件 `getMidReferencePrice(mid, mark)` 回退工具。BBO hook 继续服务盘口价差，未删除其正确用途。
3. 桌面字段接收父级过滤后的校验结果，数量红框、文字、滑块和 `aria-invalid` 同源；数量错误只在字段旁显示一次，不再重复出现在底部汇总。限价/触发红框也从该结果读取。原始验证器、`canSubmit` 与执行守卫保留。
4. TWAP 小时/分钟明确显示零；默认 30 仍由表单初始值表示。0 小时 0 分钟不因显示修复变成有效订单，168 小时仍强制零分钟。
5. Mid 依赖的价格缺失时保留按钮位置并禁用，避免输入框宽度因被动恢复而变化；真实手动填写仍保留。

## 验证重点

- 价格选择：有效 mid、null mid 与新鲜 mark、缺少/过期/未来接收时间、错误/恢复状态，以及非正值。
- 真实双端面板：过期状态切换至限价保持空白，新鲜快照只预填一次，手输和手动清空在恢复后保留。
- 字段：真实校验错误出现；账户或行情未就绪同步清除红框、文字与无障碍错误；恢复后保持输入并重新验证。
- TWAP：默认 30、1h0m、0h0m、168h0m、清空重输、整数和上限，以及无效时长的执行拦截。
- 恢复期间不提交请求；未做真实交易或签名。

本次验证结果：16 组相关 Vitest 文件共 199 项通过；真实双端订单套件 22 项和桌面网格表单套件 6 项通过，字段反馈去重后再跑 4 项相关场景通过。TypeScript、Biome 与 diff 空白检查通过；检查桌面/手机截图以及限价、Scale 输入框在价格恢复前后的实际宽度。测试边界覆盖 320/375/393px 手机和 1001/1238/1545/2016px 桌面；不等同于真实资金订单的端到端执行。
