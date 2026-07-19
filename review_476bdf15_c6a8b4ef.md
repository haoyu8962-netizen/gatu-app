# 对抗审查合并报告:476bdf15 + c6a8b4ef(market selector 双提交)

- 审查对象:`476bdf15 feat(trading): enhance desktop market selector` + `c6a8b4ef feat(trading): align mobile market selector`(当前 HEAD)
- 审查方法:主审 + 6 个并行对抗 agent(官方字段链路 / 编码规范 / 测试判别力 ×2 轮),Hyperliquid mainnet 只读实测(156 条 perpConciseAnnotations、313 spot、291 perp)、node 复算格式化、11 组变异实验、隔离 worktree 工具链核验
- 基线:两提交合计 tsc 无新增错误(仅 1 个既有 viem 双版本错误在 l1-agent-signing.test.ts)、biome 全绿、vitest 全量 466 用例绿、modal-surface-contract 3/3 绿、六语言 .po 零缺失零空翻译
- 行号均为当前 HEAD(c6a8b4ef)行号
- 时间线:c6a8b4ef 提交早于 476bdf15 审查报告产出,悬置项属预期而非无视

---

## 修复清单(按优先级)

### P1 — 桌面撞名区分 chip 缺失(476bdf15 引入,c6a8b4ef 仅修了 mobile 侧)

`apps/terminal/src/components/trade/chart/token-selector-row.tsx:282`

桌面分支 `mobile && spotApiToken && spotApiToken !== market.shortName` 中 `mobile` 恒为 false(mobile 已于 :160 提前 return),chip 永不渲染。mainnet 实测 **5 对撞名 spot**(PUMP/MOG/MON/ANSEM/SPYX 各有原生盘 + Unit 盘,如 @20 PUMP 与 @188 UPUMP 桌面都显示 "PUMP/USDC"),用户可能点错并交易错的市场(价格差数个数量级)。c6a8b4ef 的 mobile 新分支(:195-197)chip 无门控、正常显示 UPUMP —— 桌面照此办理:删掉 :282 的 `mobile &&` 门控即可。

### P2-1 — crypto scope 无注解加载/失败门控(双端)

`apps/terminal/src/components/trade/chart/use-token-selector.ts:379-383` + `token-selector-categories.ts:69`

isLoading 只 gate `traditional`/`prelaunch`,漏了同样依赖注解的 `crypto`;`isError` 完全未解构(:150)。注解请求在途(RTT 窗口)或失败(3 次重试后无失败态)时:实测 **150 个传统资产**(stocks 91 + indices 25 + commodities 23 + fx 6 + preipo 5)会涌入 Crypto tab(先显示后闪退;失败则永久误归),同时 Traditional tab 误导性显示 "No markets found."。c6a8b4ef 后 mobile 也走注解,暴露面已双端。

修法:isLoading 条件补 `scope === "crypto"`;解构 isError 并做降级展示(如失败时 Traditional/Crypto 显示重试提示而非空态)。

### P2-2 — Pre-launch tab 恒空且判定源错误(双端)

`token-selector-categories.ts:32`(PRELAUNCH_CATEGORIES)+ `token-selector-content.tsx:84`

实测 156 条注解的类别全集 = {crypto, stocks, commodities, indices, FX, fx, preipo},**无任何 prelaunch 变体**(三种拼写均为猜测);且注解只覆盖 builder dex(flx/km/mkts/para/vntl/xyz 前缀),官方真正的 pre-launch 市场(hyperps)是核心 perp,**该判定源在数据形态上永远捕获不到**。双端用户点 "Pre-launch" 永远空。

修法:短期直接下架该 tab(或注解出现该类别前数据驱动隐藏);要真支持 hyperps 需换判定源(核心 meta 的 onlyIsolated/杠杆特征或官方标记)。

### P2-3 — spot 价格误用 perp 小数规则(双端,203/313 市场受影响)

`apps/terminal/src/lib/format.ts:143-145`(szDecimalsToPriceDecimals = max(0, 6−szDecimals))+ row.tsx priceText

官方规则:perp 价格 5 位有效数字 / 最多 6−szDecimals 位小数;**spot 是 8−szDecimals**。当前对 spot 也用 6−szDecimals,实测 **203/313** 个 spot 市场丢有效数字,极端例:HREKT markPx "0.00000011" 渲染为 **"0"**,UBONK "0.00000319" → "0.000003"。注:node 复算证实旧 mobile 的 formatPrice 内部走同一规则,mobile 一直截断,非 c6a8b4ef 退化(该提交只是统一去掉了 $ 前缀)。

修法:formatter 增加 market kind 感知(spot 用 max(0, 8−szDecimals)),或对字符串 markPx 无损直通(更符合 hyperliquid.md 的 keep-strings 原则)。

### P2-4 — iOS 背景滚动穿透风险(c6a8b4ef 新引入)

`token-selector.tsx:80`(`modal="trap-focus"`)+ `token-selector-popup.tsx:89`

Base UI 1.3.0 官方语义(DrawerRoot.d.ts:31):trap-focus 困住焦点但**不锁页面滚动**、保留外部指针交互。全屏 popup 挡住了外部点击,但触摸拖动抽屉的标题/tab 行/footer 等**非滚动区域**时滚动会链到 body(`overscroll-none` 只作用于滚动容器边缘)→ iOS Safari 下背景终端可被橡皮筋滚动/地址栏收缩。

修法:改回带 scroll lock 的 `modal`(默认 true);若 scroll lock 在 iOS 有既有问题,则在 popup 根加 `touch-action: none` 并对滚动列表例外。需真机验证。

---

### P3 批次

1. **OrderToast 被全屏抽屉遮挡(层级回归)**:popup `z-[90]`(全库最高)vs `order-toast.tsx:169` 的 `z-[60]`。旧版抽屉 85dvh/z-50 时 toast 可见;现在选择器打开期间订单回执完全不可见。全库 z 盘点:内部元素 z-10/20 < header/footer z-40 < drawer/popover/bottom-nav z-50 < OrderToast z-[60] < 本提交 z-[90](sonner 1200/tooltip 1100 不受影响)。修法:OrderToast 提层或建 z 常量尺度(config/layout 或 styles.css)消除魔数。
2. **选中行样式零效(双端)**:row.tsx:173(mobile)与 :239(桌面)的 `isSelected && !isHighlighted && "bg-surface"` —— 实测 light 下 surface=modal=#ffffff、terminal dark 下 surface=modal=background=#0f1a1f,**两主题下选中态均不可见**;搜索后高亮重置,当前市场无任何视觉标识。修法:换 `bg-brand-soft`(与 scope tab 选中态呼应)或 `bg-fill-weak`,双端一并。
3. **静态 spot quote 子类缺 USDE(双端)**:`use-token-selector.ts:31-36` 仅 All/USDC/USDH/USDT;实测 quote 分布 USDC 296 / USDH 11 / USDT0 5(归"USDT"✓)/ **USDE 1**(@255 HYPE/USDE)。修法:补 USDE 或恢复按 spotMarkets 动态生成(c6a8b4ef^ 的 mobile 实现可参考)。
4. **popular 静态表过时**:`config/tokens.ts` categoryMapping 的 trending 仅 {BTC,ETH,SOL,DOGE,PEPE},**无 HYPE**,与真实交易量无关;Popular scope 现已双端可见,影响面扩大。修法:按 `dayNtlVlm` 动态 top-N。
5. **未来新类别双侧消失**:官方若新增注解类别(如 "etf"),TRADITIONAL 集合与 crypto 分支都不认 → 从 Crypto/Traditional 双 tab 静默消失。修法:traditional 改排除法(非 crypto 即 traditional)。
6. **命令面板搜不到注解**:command-menu.tsx 仍用无注解的原始 markets(搜 "QQQ" 无结果),与选择器能力分裂。

---

## 编码规范(违规-必须修)

1. **嵌套三元 ×2**(规则:"Never nest ternary operators - use a helper function with early returns"):
   - `token-selector-content.tsx:277-282` visibilityClass —— 476bdf15 三层,c6a8b4ef 降为两层,**仍是嵌套**;提取 `getHeaderVisibilityClass(columnId)` 早返回。
   - `token-selector-row.tsx:154-158` secondaryMobileMetric —— c6a8b4ef 新写的两层嵌套;提取 `getSecondaryMobileMetric()` 早返回。
2. **死代码群(c6a8b4ef 直接产物,一次清理)**:
   - `mobile/mobile-markets-view.tsx` **整文件死代码**(全库零引用,Markets tab 自 377ebe6f 起走 MobileTradeLayout)→ 删除;
   - `UseTokenSelectorOptions.mobile?: boolean`(use-token-selector.ts:63)死字段 + `token-selector-popup.tsx:54` 死传参 → 删除;
   - row.tsx 桌面 return 内 6 处恒假 `mobile` 分支(:238/:251/:267/:277/:281/:282,其中 :282 即 P1 根因,清理与修复合并做);
   - `getMarketTableColumnClass` 的 mobile 参数全库死参数(token-selector-columns.ts:26-34 分支 + :9-10 两个 TOKEN_SELECTOR_MOBILE_* 常量)→ 删参数;
   - `PERP_CATEGORIES` + `PerpCategory`(config/markets.ts:13-26)零消费者 → 删除;连带 content.tsx:114-125 getSubcategoryLabel 的 trending/new/defi/layer1/layer2/meme 六个不可达 case 与 categories.ts isMarketInSubcategory 的 perp 死分支;清完重跑 lingui extract 同步 .po;
   - content.tsx:86-88 `showScopeTabs = true` 恒真变量内联;:344 `mobile ?? false` 改解构默认值。
3. **`Set<TraditionalMarketSubcategory>` 迫使调用处 as 强转**(categories.ts:23-29/70):改 `ReadonlySet<string>` 去掉 as。
4. **columns 死元数据**:`token-selector-columns.ts` 的 `header: "Market"` 等字符串全库无消费(表头文案走 getColumnSortLabel)→ 删。

## UI 规范(建议)

- **动效第三种模式**:popup 的 `duration-300` + `-translate-y-[5px]` 全库唯一(既有:modal 200ms/scale-95、popover 150ms/scale-95、drawer 200ms/translate-full)。对齐 200ms 或将全屏抽屉动效收进 drawerContentVariants 新 variant。
- **`overlayClassName` 新 prop 或非必要**:packages/ui/src/drawer.tsx 的这个新 API,本用例(透明遮罩)用既有 `overlay={false}` 即可达成(全屏 inset-0 无点击外部区域),且 Modal 无对称 prop。建议回退 drawer.tsx 改动改用 `overlay={false}`;若保留则给 Modal 补对称。
- **`scrollbar-none` 残留 3 处**:content.tsx 两处已修为有效写法 ✓;`header/favorites-strip.tsx:27`、`layout/main-workspace.tsx:42`、`positions-panel.tsx:88` 仍是无效类。建议 styles.css 定义 `@utility scrollbar-none` 统一修复。
- **`min-[848px]` 魔数断点**(6 处,仅 token-selector 三文件):提取常量或对齐标准断点。
- **ARIA combobox 缺口(沿袭)**:trigger 无 `aria-controls`、option 行无 id、`aria-activedescendant` 全库零使用,键盘高亮仅视觉。行级 onKeyDown(row.tsx:165-167)在 tabIndex=-1 上永不触发,属死交互。
- **zh 术语**:"Last Price" 译"最后价格"(交易所惯用"最新价"),c6a8b4ef 后 mobile 排序头也从"价格"变"最后价格",建议改译;"Close" msgid 与仓位"平仓"共用无 msgctxt,本用例恰好无害,建议后续拆分。

## 测试补强

1. **F1(高优先)**:`market-calculations.test.ts:27` funding ×8 断言用默认精度 `toBeCloseTo(0.0001)`(容差 ±0.005)—— 变异 ×1/×0 全绿,本系列最关键数值修正零保护。改 `toBeCloseTo(0.0001, 7)`。
2. row 测试盲区(变异实验实证):收藏按钮删除测不出(零覆盖)、volume/OI 两行互换测不出(同一 textContent 双 toContain)、NEW badge 断言恒空(fixture 用 HYPE 而 categoryMapping 无 HYPE)。补:favoriteButton 存在性 + aria-pressed、分行断言(按 span 定位)、fixture 换 categoryMapping 内的币。
3. TokenSelectorContent 零测试(排序点击、spot 时 mobile 第二排序头切 market-cap、onClose、9-tab 渲染)。
4. popular/hip3 scope 分支零覆盖(变异全绿)。

## 确认正确、请勿"顺手修改"的面

- funding ×8 换算正确(SDK funding 字段实测为 1h 费率,×8 与官方 8h 口径吻合);
- displayName 官方语义用法正确("instead of the L1 name",路由/收藏仍用 canonical name,B1 routeName 修复无回归);
- normalizePerpCategory 的 lowercase 正确(实测存在 1 条大写 "FX" 注解);
- 注解键带 dex 前缀与 market.name 精确匹配,`new Map(annotations)` 合法;
- keepMounted 移除无状态丢失(搜索索引在常驻 hook,退出动画不截断);
- twMerge 覆盖链可靠(inset-0/max-h-none 正确压过 variant);
- safe-area 顶/底均已处理;bg-modal 契约满足;USDT0 归"USDT"经 ASSET_REPLACEMENTS 保留;
- 打开时 scope 跟随 exchange scope 的 effect 分工正确;
- getMarketCapUsd 用 Big 保串精度、计价随 quote token。

## 建议执行顺序

1. P1 chip(一行)+ row.tsx 死分支清理(同文件合并做)
2. P2-4 trap-focus → scroll-lock modal(真机验证)
3. P2-1 crypto 门控 + isError 降级
4. P2-3 spot 8−szDecimals(或 string 直通)
5. P2-2 prelaunch 下架
6. P3 批次(OrderToast z、选中态 token、USDE、popular 动态化)
7. 死代码清理(mobile-markets-view / mobile 死字段 / PERP_CATEGORIES / columns 死参数)+ 两处嵌套三元提 helper + lingui extract
8. 测试补强(F1 精度参数最优先)
