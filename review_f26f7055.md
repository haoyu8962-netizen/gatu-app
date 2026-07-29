# 对抗审查报告:f26f7055 fix(trading): prevent mobile market search zoom

- 审查对象:`f26f7055`(3 文件 +49:packages/ui/search-input.tsx 加 `inputClassName` 透传、token-selector-content mobile 传 `text-base leading-5`、wiring 测试 +1 用例)
- 审查方法:主审全链路核验(viewport 配置、全库 SearchInput 调用点、移动端输入字号链逐层追踪),新测试实跑通过
- 结论:**提交本身 9/10,全部合规;但同类缩放问题在移动端至少还剩两处未修**,其中一处在下单主路径

---

## 一、提交本身:全部合规,请勿改动

| 核查项 | 结论 |
|---|---|
| 修复机制 | ✅ iOS Safari 对 font-size<16px 的输入框聚焦自动放大页面;`text-base`(16px)是标准修法 |
| viewport 前提 | ✅ seo.ts:85 的 viewport **没有** `maximum-scale=1`(保住 a11y 手动缩放)→ 16px 是必要且唯一正路,勿改为 maximum-scale 偏方 |
| 根因 | ✅ `searchInputTextClasses` 的 md = `text-sm`(14px)确实触发缩放;测试 `not.toContain("text-sm")` 精确针对根因 |
| 架构 | ✅ 符合 ui-library 规则:packages/ui 只加通用 `inputClassName` 透传(内部 input 类无法从外部触达,透传是唯一路径),16px 决策留在 app 调用点,未污染设计系统 md 尺寸 |
| cn 覆盖链 | ✅ inputClassName 追加在 cn 链末尾,twMerge 保证 text-base 压过 text-sm |
| 测试 | ✅ 判别力直接(回退任一类名即红),复用既有 wiring 结构,实跑 1 文件全过 |
| 规范 | ✅ 单层三元、无注释、text-base/leading-5 均为标准 scale、commit 格式合规 |
| SearchInput 覆盖面 | ✅ 全库唯一调用点即市场选择器,无其他 SearchInput 遗漏 |

## 二、遗漏:同类问题还剩两处(修法与本提交同款)

移动端输入字号链逐层追踪结果(app 层 Input 尺寸表:sm/default=`text-xs` 12px、lg=`text-sm` 14px、xl=`text-base` 16px):

### 1.【中】移动 Trade 主页三个下单输入仍会缩放

- `apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx:360`:`const entryInputSize = embedded ? "lg" : "xl"`
- `apps/terminal/src/components/trade/mobile/mobile-trade-layout.tsx:37`:移动 Trade 页主形态(两栏布局)传的正是 `embedded` → **size 输入(:465)、触发价(:536)、限价(:554)三个输入走 lg = 14px**,iOS 聚焦照样放大。
- 非 embedded 形态用 xl(16px)是安全的 —— 说明该问题已知,embedded 分支被漏掉。
- 修法:embedded 也用 `"xl"`;若 lg 高度是 embedded 紧凑布局的刻意选择,则保留 lg 高度、仅覆盖字号(照搬本提交的 className 覆盖手法)。

### 2.【低】swap 弹窗金额输入

- `apps/terminal/src/components/trade/components/spot-swap-modal.tsx:536`:NumberInput 未传 `inputSize` → default = **12px** —— 移动端从 portfolio 打开稳定币兑换聚焦金额框同样缩放。
- 修法:传 `inputSize="xl"` 或覆盖字号。

两处用户感知与本提交修的搜索框完全相同(聚焦瞬间页面猛地放大、失焦不回弹),且下单输入比市场搜索更高频。建议一并收掉,并给两处补与本提交同款的 className 断言测试。

## 三、长期建议(非阻塞)

移动端 16px 规则目前已出现三处各修各的痕迹(entryInputSize 的 xl 分支、本提交的覆盖、上述两处待修)。可考虑收敛为单一机制:packages/ui 输入类组件加语义化 mobile-safe 尺寸,或全局 `@media (hover: none)` 把输入字号钳到 16px —— 避免每个新输入框都要单独记住这条 iOS 规则。
