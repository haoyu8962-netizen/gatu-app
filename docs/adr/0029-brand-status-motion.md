# ADR 0029：品牌动效与状态符号的接入

- 状态：已接受并实施（2026-10-01）；未合入 `dev`、未发布，未做真机与真实钱包验收。 2026-10-08 补记：之后随 p24 发布（main `3ced842e`，2026-10-02）。
- 相关：[品牌标识与素材](../brand-assets.md)「状态动效」、[交易通知](../trading-notifications.md)、[确认面契约](../confirmation-surfaces.md)、[移动端数据展示](../mobile-data-presentation.md)、[ADR 0010](0010-blank-until-ready-startup.md)、[ADR 0019](0019-global-trading-notifications.md)、[品牌迁移计划](../brand-migration-plan.md)（本编号由其「ADR 编号」一节预留）。

## 上下文

设计方的 Sairn 动效库 v1.3（`brand/tools/Sairn-Motion-Library-v1.3.html`，导出在 `brand/loader/`）交付了 16 种动效和 7 个状态符号。品牌迁移只接入了图表首次加载的 `page-loading`（`BrandPageLoader`）；通知、资金与签名状态页、握手按钮仍是 Phosphor 图标加旋转图标，其中金库弹层把「结果未知」画成红色警告，与「未知 ≠ 失败」的通知语义冲突。

动效库缺三个通知需要的符号：订单「部分成交」、标准通知的「提示」和「警告」。设计方的配色是按设计稿底色（`#0A3038`、`#F5F4EE`）调的，没有提示色；`button-loading` 的配色放在实心按钮上，深色主题对比度 1.28:1、浅色 2.83:1。交付的 `sairn-motion.js` 在本仓库 `"type": "module"` 下 `require` 只得到空对象。

约束：

- 通知语义（ADR 0019、`docs/trading-notifications.md`）：已受理与已成交靠文案区分，未知从不显示成失败。
- 确认面契约：确认控件和资金按钮不显示提交状态；钱包握手可以显示进度。
- 移动端数据展示：不新增被动提示类别。
- 启动渲染（ADR 0010）：`StartupFallback` 不出现任何动效或 SVG。
- 设计令牌：组件里不写字面颜色；i18n：组件不调用 Lingui，切换语言不重挂载。
- 系统开启「减少动态效果」时必须停住，且动画结束不能驱动业务状态（动效库规则）。
- 包体预算：总包体与启动闭包都有上限。

## 决策

1. **补做缺失符号，放在独立目录。** `brand/loader-supplement/definitions.js` 用动效库目录的写法定义 `partial`、`info`、`warning`；`pnpm brand:export-motion` 在导出动效库的同一个 Chromium 页面里，先用库自己的 `renderGlyph` 逐字节复现全部已交付符号，再补调色板的 attention 与 info 角色、追加定义并渲染。`PROVENANCE.json` 记录引擎、定义与每个文件的哈希，`pnpm brand:check` 校验。设计方原件和 `brand/loader/` 不改；设计方交付新版后删除这个目录。partial 用成功色的环加右半实心扇面（一次性扫入 560 ms，表示交易所已回报的部分成交），info 用中性实心圆加镂空 i，warning 用 attention 实心圆加镂空感叹号。
2. **生成数据，不手抄。** `scripts/brand-status-motion.mjs` 读 on-light 文件，生成 `lib/brand/status-glyph.gen.ts`（类型与 10 个符号的 16、24 网格）、`button-loading.gen.ts`、`brand-motion.gen.ts`（7 个状态插图与复制反馈）和 `status-motion.gen.css`（交付文件里的关键帧与每个动效的规则原文，共用规则只保留用到的部分）。生成器核对深浅两套文件的几何与配色角色一致、插图里的标志与 Logo 套件路径完全相同，未知属性或颜色直接失败。按加载层级拆模块：通知和交易面板在启动闭包里，只带符号和按钮加载；插图只进懒加载的弹层。
3. **颜色用终端的语义令牌。** 组件只输出 `data-tone` 与 CSS 变量；`styles.css` 把 success、error、attention、neutral、info 映射到 `--text-success`、`--text-error`、`--text-warning`、`--text-weak`、`--text-info`，镂空记号映射到 `--on-action`，插图里的标志用 `--logo-*`，循环最暗帧 `--srm-floor` 跟随 `--logo-loader-floor`，mono 按钮加载固定 0.78（令牌 `loopFloor.mono`）。理由：标准通知的文字已用这些令牌，符号与之同色；令牌已有两种主题的对比度保证。进行中的循环从不用成功色（`.claude/rules/design-tokens.md`：成功色的等待指示读起来像「已完成」），所以设计方画成成功色的 `submitting` 在终端里渲染为中性色；生成器仍按设计方颜色校验几何（`kitTone`）。
4. **三个组件，一处渲染。** `StatusGlyph`（≤18 px 用 16 网格，其余用 24 网格）、`BrandMotion`（插图、复制反馈）、`ButtonLoading`（16 px、`currentColor`）。默认 `aria-hidden`，单独出现时由调用方传已翻译的 `label`；不输出 `<title>`；循环中的组件带 `data-loading-indicator`。状态切换时调用方用 `key` 重新挂载，让一次性动画只在状态变化时播放。
5. **接入范围。** 订单通知（`partial` 状态只在已核实的部分成交上用半实心符号：交易所回包的部分成交，或按成交计数且没有错误；只是部分受理或带拒绝、撤销、未知子项的批次用 warning）、Sonner 五种类型、资金与 Earn 的「状态未知」通知（调用方传 `unknown` 图标）、待核验资金操作提醒、充值状态页、金库弹层（顺带把未知改为 attention）、API 钱包弹层（用户拒签用 `cancelled`，表示什么都没有提交）、跨链执行页、钱包握手与扫码等按钮、16 px 的复制反馈。映射表在 `docs/brand-assets.md`「状态动效」。
6. **保留的旋转图标。** 被动数据刷新、懒加载占位、图表重建与限流、页脚连接状态、认证初始化（会让测量过的页头变宽）、移动端下单按钮（另待决定，与桌面不一致）。`status-motion-surface-contract.test.ts` 逐文件登记数量和理由，新增转圈或回退已接入的界面都会失败。后续（2026-10-01）：移动端下单按钮已与桌面一致，提交订单时不显示任何指示，启用交易的签名阶段显示 `ButtonLoading`，已从保留列表移入接入列表（[确认面契约](../confirmation-surfaces.md)第 6 条）。
7. **减少动态效果。** 生成的 `@media (prefers-reduced-motion:reduce){.srm .srm-anim{animation:none!important}}` 加既有的全局规则；动画元素停在自然几何，即终态。没有应用内开关，任何业务状态都不读 `animationend`。

## 备选方案

| 方案 | 不采用的原因 |
|---|---|
| 运行时引入 `sairn-motion.js` | 在本仓库无法 `require`；每个实例内联 `<style>` 与字面颜色；配色不跟应用令牌；包体更大 |
| 用 `?raw` 内联交付的 SVG 文件 | 文件带中文 `<title>`/`aria-label` 与十六进制颜色，每个实例重复一份样式 |
| 手工把几何抄进组件 | 与交付物漂移无法发现；生成器加 `brand:check` 可以逐字节核对 |
| 直接用设计方配色 | 与旁边的通知文字不同色；没有提示色；按钮上对比度不足 |
| 在设计方 HTML 里加符号 | 原件有哈希记录，规定不手改；补充目录可以独立删除 |
| partial 用 attention 色 | 会出现第四个琥珀色符号；已成交部分是服务端确认的事实。若设计方改判，只改生成器里的一行映射 |
| Sonner 保留 Phosphor 图标 | 订单通知换了符号后，同一个堆叠里会出现两套图标语言 |
| 单个生成模块 | 首次实测包体时插图数据跟着通知进了启动闭包，拆分后只在弹层里加载 |

## 后果与边界

- 视觉变化：通知图标、状态页（64 px 插图，去掉 `animate-ping` 光晕）、握手按钮（两块面板交替呼吸）、复制反馈（成功色勾）。金库未知结果从红色变为琥珀色；API 钱包拒签从红叉变为中性方块。
- `partial` 的半圆可能被读成「50% 进度」：通知同时有「Partially filled / Partially completed」文字，按成交计数时还有「Fully filled x/y」，单笔成交量未核实时不显示数量。partial 的颜色、info 的颜色、`submitting` 在终端改为中性色、悬停与动效节奏待设计方确认。
- 充值「已提交到 Hyperliquid」沿用成功插图（与改动前的成功勾一致），是否应改为中间态由产品决定。
- 包体：与改动前（`f440fa1b`）的本地 Node 22.15 生产构建相比，总包体 +6,544 字节 gzip，桌面运行时启动 +769、移动 +151，交易启动闭包 +2,734（该预算仍有约 19 KB 余量）；超过总包体的 +10,000 允许增量，按 Logo 先例在 `scripts/check-client-bundle-budget.mjs` 上调基线并写明原因。拆模块前总量多 297 字节、启动闭包多 502 字节。
- 设计方交付含这三个符号的动效库后：删除 `brand/loader-supplement/`，把生成器的来源改回 `brand/loader`，重新 `brand:sync` 并审阅差异。

## 证据与验证

代码：`scripts/brand-status-motion.mjs`、`scripts/brand.mjs`、`scripts/brand-export-motion.mjs`、`apps/terminal/src/components/brand/`、`apps/terminal/src/lib/brand/*.gen.*`、`apps/terminal/src/styles.css`、`apps/terminal/src/lib/trade/order-notification-glyph.ts`。

测试（2026-10-01 本地运行；版本、范围与结果见任务记录 [2026-10-01-sairn-brand-followups](../work-memory/sessions/2026-10-01-sairn-brand-followups.md)「验证与限制」）：

- `status-motion-contract`（生成结果最新、按层级拆分、生成器拒绝组件无法复现的元素与属性、没有字面颜色与 `<title>`、语调映射、进行中不用成功色、未知不为 error、减少动态效果规则与令牌时长）、`status-glyph`、`status-motion-surface-contract`；`order-toast-placement`、`toaster-config`、资金与 Earn 未知通知、资金恢复提醒、状态页与 API 钱包、金库弹层的映射断言；`trading-action-button` 握手指示。
- 原先断言「没有转圈」的 8 个测试改用 `harness/loading-indicator.ts` 的选择器，换成动效组件后仍会生效。
- `tests/browser/brand-surfaces.pw.ts`：Chromium、WebKit 26.4、Firefox 140（本机已安装的旧版内核，经 `executablePath` 启动）× 深浅主题，核对 Logo、加载器、符号、插图、按钮加载与 Sonner 图标的实际填色等于令牌、只有标记为进行中的组件在循环、一次性动画落在终态、减少动态效果时没有运行中的 CSS 动画。CI 只跑 Chromium。
- 对比度：调研阶段在草稿原型上用应用令牌测了 104 组组合，全部 ≥ 3:1（含循环最暗帧），没有在每个最终界面上重测。

未验证：真实 Safari、iOS 与 Android 设备；真实钱包、真实订单与资金操作中的通知；设计方对补充符号的确认。

2026-11-13 补记：`status-motion-surface-contract` 的登记从只数 `animate-spin` 改为按文件分别计数旋转类名、Phosphor 转圈图标和共享 `Spinner` 组件的引用；此前有三处 `Spinner` 用法从未登记。
