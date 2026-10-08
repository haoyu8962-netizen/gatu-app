<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-04-funds-dialog-layout",
  "date": "2026-10-04",
  "title": "存款弹窗对照官方终端重排：头部固定、内容区滚动且隐藏滚动条，桌面与手机同一外壳",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding"],
  "summary": "用户给出官方终端存款弹窗截图，要求学习其实现并优化我们的同一弹窗、移除内容滚动条、桌面与手机一致，并用 Codex 对抗审查到 9.5 分以上。读取官方样式表与组件代码后采用：弹层裁剪、头部固定、仅内容区滚动并隐藏滚动条（Deposit / Withdraw / Bridge 与加载回退共用 FundsModalShell）；资产与网络一行带图标；二维码中心叠加 USDC 图标并提高纠错级别；地址与复制按钮同一字段；占位与就绪同结构。审查六轮，评分 8.0/8.1 → 8.5 → 8.5 → 8.5 → 8.5 → 9.8，发现全部核实并修复；后四轮的发现都在最低额计算上，见同日的最低额记录。未做真机、真实扫码与真实存款验证。",
  "thread": null,
  "baseCommit": "783f50f0",
  "commits": ["88a39941", "0f39c7aa", "03304a61", "c9162005", "6744499e", "cc91a87b"],
  "sources": [
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "apps/terminal/src/components/trade/components/funds-modal-shell.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit/funding-address-card.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit/funds-route-details.tsx" },
    { "path": "apps/terminal/src/lib/tests/funds-modal-scroll-contract.test.ts" },
    { "path": "apps/terminal/tests/browser/account-actions.pw.ts" },
    { "path": "docs/work-memory/sessions/2026-10-04-cctp-deposit-minimum.md" }
  ],
  "supersedes": []
}
-->
# 存款弹窗对照官方终端重排：头部固定、内容区滚动且隐藏滚动条，桌面与手机同一外壳

## 背景与范围

同步记录，2026-10-04，与[加载占位审查](2026-10-04-loading-placeholder-review.md)、[存款最低额](2026-10-04-cctp-deposit-minimum.md)同一会话、同一分支。用户贴出官方终端（app.hyperliquid.xyz）邮箱账户存款弹窗的两张截图和所选元素，要求：学习官方的 UI 实现方式并优化我们同一个存款弹窗；移除内容滚动条；完成后用 Codex 对抗审查，评分 9.5 以上；修改必须在所有客户端生效并保持一致，不能只改电脑端。未取得任务标识。

## 结论与依据

官方实现（2026-10-04 读取其公开样式表 `config-*.css` 与脚本块）：

- 弹窗 `overflow: hidden`、纵向 flex、`max-height: calc(100vh - 32px)`；头部 `flex-shrink: 0`；内容区 `overflow-y: auto; scrollbar-width: none` 并隐藏 WebKit 滚动条。1000px 及以下同一组件改为贴底弹层。
- 资产与网络是 `1fr auto 1fr` 的一行，各带 18px 图标；二维码用 `react-qrcode-logo`，纠错级别 H、深底白点、中心 39px 代币图标；地址字段内联复制；费用三行在带边框的卡片里；红色警示框 8px 圆角。
- 官方邮箱存款走 Across 存款地址，与我们的 CCTP 流程不同。

采用的做法：

- `FundsModalShell`：弹层 `!overflow-hidden`，头部 `shrink-0`，内容区 `min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`，对 Deposit / Withdraw / Bridge 三个页签和代码块回退都生效。桌面弹窗与手机底部弹层由同一外壳得到同一结构；用 `!` 是因为 `ModalPopup` 在调用方类名之后追加 `overflow-y-auto`，改原件会影响约 60 个使用方。
- `FundsRouteDetails`：两列、每格带图标，`dt` 仅读屏，提款表单共用。网络图标取 `https://app.hyperliquid.xyz/coins/ARB.svg`（与现有代币图标同源），加载失败时隐藏。按 `docs/cctp-deposits.md` 既有规则仍是固定信息，没有做成下拉。
- `FundingAddressCard`：二维码纠错级别 M→H，中心叠加 28px USDC 图标；地址与复制按钮同一字段，窄屏换行时两行均衡；占位字段与就绪字段同结构（隐形的 42 字符地址形状加按钮尺寸占位），不再只共用类名。
- 表单间距收紧，提示统一 `rounded-16`，`deposit-form.tsx` 纳入 `dialog-notice-radius-contract`。
- 浏览器夹具 `funds-forms.fixture.tsx` 改用真实外壳。

没有照搬官方的三处及理由：二维码保持白底黑码（反色码部分扫码器识别较差，明暗主题一致）；费用三行保持无卡片（`style-ui-guide.md` 的 Dialog content blocks 规则，2026-09-12 已去掉装饰性卡片）；两步说明、显式 Deposit 与 Done 按钮是我们流程特有的（主网需要用户自己点 Deposit），保留。

Codex 只读对抗审查（`gpt-6-astra`，medium，均为静态推演）：

| 轮次 | 评分 | 发现 | 处理 |
| --- | --- | --- | --- |
| 1（两路） | 行为 8.0、规范 8.1 | 最低额错误未接入金额输入框；点击时手续费上调被误报为路由失败；地址占位与就绪高度不同且测试只比类名；滚动测试不能证明用户可滚与头部固定；父组件接线无测试；文档措辞 | `0f39c7aa` |
| 2 | 8.5 | 比例手续费时提示的最低额不可直接采用 | `03304a61` |
| 3 | 8.5 | 搜索轮数耗尽被当成无解 | `c9162005` |
| 4 | 8.5 | 注释里的终止证明用了固定上界 | `6744499e` |
| 5（总评） | 8.5 | 证明假设取整针对精确值，而实现的除法会先按 20 位小数舍入；其余未发现问题 | `cc91a87b` |
| 6（总评） | 9.8 | 无 P0–P3；指出两处表述应收窄（见下） | 已在本记录中按其意见表述 |

七次运行合计约 74 万 token。第二轮起的发现都在最低额计算及其证明上，细节记在最低额记录的后续一节。

## 验证与限制

最终代码 `cc91a87b`，2026-10-04：

- `pnpm --filter @sairn/terminal typecheck` 通过；`vitest run --maxWorkers=4` 665 个文件、8662 项通过（另 1 项跳过）。此前在 `cc91a87b` 提交前的一次全量运行中，`chart-build-assets` 与 `mobile-agent-sync-route` 各一项在机器负载下超时，单独重跑通过，随后的全量运行全部通过。
- Playwright `tests/browser/account-actions.playwright.config.ts` 28 项通过（本机 Chrome）。其中资金表单用例在 375×666、393×852、1363×852 与明暗主题下断言：内容区计算样式 `overflowY` 为 `auto`、`scrollbarWidth` 为 `none`，弹层为 `hidden` 且自身不滚动；393 与 1363 不溢出；375 的存款页确实溢出，用滚轮滚到底后关闭按钮的 `boundingBox` 前后完全相等；地址卡片、字段、二维码框在占位与就绪两种状态下 `offsetHeight` 相等。夹具直接渲染 `DepositForm`，不经过 `deposit-modal.tsx`，所以这些结果不覆盖弹窗里最低额的计算与接线，那部分由单测覆盖。
- Chrome（Claude in Chrome 扩展，开发服务器，邮箱账户）：桌面 1512×745 内容区 667px 不滚动；手机布局 606×745 底部弹层不滚动；叠加图标后的二维码经 `BarcodeDetector` 解码回原地址（浏览器内解码，不是手机扫码）。这些观察在 `88a39941` 上做，之后的提交没有改样式。
- 变异验证（改源码后跑对应测试，确认失败再还原）：去掉 `scrollbar-width:none`、Bridge 页签丢失滚动类、占位字段自带高度、纠错级别改回 M、去掉图标 `onError`、占位去掉按钮尺寸占位（浏览器测试 44≠46）、内容区追加 `overflow-hidden`（浏览器测试），共 7 个，全部被抓到。
- 未做：真实手机触摸滚动与软键盘、真实手机扫码、读屏实测、Safari 与 Firefox、Bridge 页签（功能开关默认关）目测、真实或测试网存款、生产构建与包体预算。同一弹窗的 `StatusScreen` 与 `WrongNetworkScreen` 是独立的 `AdaptiveModal`，没有用新结构。五种语言译文未经母语者审校。

## 后续与替代关系

- 推送前按 CI 口径量一次包体预算（本会话新增的 `FundsModalShell` 与图标常量在主包可达模块里）。
- 状态屏与错误网络屏若要与新结构一致，需要单独改造。
- 浏览器测试的夹具启动时，Vite 依赖扫描会打印 `account-actions.browser.ts` 缺少 `getPositionMarketCloseActions` 等导出的错误，测试仍通过；是否为本会话之前就存在没有核对。
- 开发服务器默认配置不带银行卡入金开关，存款窗口第一屏直接是转账表单；带开关的配置是 `.claude/launch.json` 里的 `terminal-card-funding`。
- 无被替代的记录。
- 2026-10-05 追加：本节前两项（包体预算、状态屏与错误网络屏）以及「未做」里的 Safari（以 WebKit 代替）已在[后续记录](2026-10-05-funds-dialog-status-screens.md)里处理；真机、读屏、Firefox 与母语者审校仍未做。
- 2026-10-05 追加：上面第三项的依赖扫描报错已查明是本分支引入的（存款入口直接导入了全局弹窗的懒加载注册表），在 PR #78 的 CI 里使另一个夹具的第一条用例超时；原因与修复见[后续记录](2026-10-05-funds-dialog-status-screens.md)的「PR #78 的 CI」一节。
