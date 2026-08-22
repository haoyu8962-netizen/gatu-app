# 对抗式审查报告(第二轮):1d22aeed / 5f438814 / dfacac0e

> 方法同上轮:4 个独立深审(含上轮 16 条发现的闭环审计)→ 每条发现 2 个独立反驳者验证。本轮反驳者做了 **revert 实验**(换回修复前代码验证测试变红)与**变异实验**(注释关键逻辑验证测试防护),结论可信度高于纯静态审查。15 条存活(12 CONFIRMED / 3 PLAUSIBLE)。

## 评分

| Commit | 评分 | 一句话结论 |
|---|---|---|
| `1d22aeed` fix(deposit): unblock wallet and bridge | **7 / 10** | 核心修复经**合约源码级**验证成立(Bridge2 的 depositWithPermit 成功路径根本不 emit Deposit 事件——旧断言对每笔成功 permit 存款必误报,这才是被 unblock 的阻塞);钱包红线守住;测试非"两边绿"。扣分:静默换身份根因未修、auto-bridge 熔断过宽 |
| `5f438814` fix(i18n): harden locale sync | **8 / 10** | B1 真落地且**双向实验证实**(pre-fix 代码在新管线下测试变红);A3/F-14 闭合;372 测试 6.8s。扣分:B2 清扫仅 4/76、死 mock 反向保险 |
| `dfacac0e` fix(chart): harden lifecycle | **8 / 10**(竞态专项 9) | A1 watchdog 全要素落库 + **变异实验**验证测试钉行为;F-8/F-13 owner 身份校验彻底修复,五组对抗时序未击穿。扣分:**新引入 inactive-cancel 陈旧簿记竞态**(已复现) |

## 上轮行动项闭环(审计结果)

| 项 | 状态 | 说明 |
|---|---|---|
| A1 watchdog 落库 | ✅ **fixed** | 8s 超时+1 重试+`getActiveChartSymbol` 实际校验+错误面板;卸载/快速切换/theme 交错清理路径干净 |
| A2 = F-8/F-13 竞态 | ✅ **fixed** | "条目对象身份即纪元":回调/.then/.catch/onFailure 四处 owner 守卫;零监听旁路删除,teardown 收敛 releaseStream 单点;revert 后 3 条测试直接红 |
| A3 bottom-nav | ✅ **fixed** | `_(msg\`...\`)` 迁移完成,pre-fix 换回测试变红 |
| B1 vitest × Compiler | ✅ **fixed** | 与生产 babel 插件/顺序一致;"两边绿"时代终结 |
| F-5 完成判定校验 | ✅ fixed | 两条完成路径均经 `isChartSymbolApplied` 多键比对 |
| F-6 测试防线 | ✅ fixed | 变异实验:注释重试→4 红;旁路校验→2 红 |
| F-14 spinner/price-input 等 | ✅ fixed | 全部迁移响应式 useLingui |
| F-16 死代码 | ✅ fixed | QUOTE_ASSET 别名清除 |
| CTX 静默换身份 | ⚠️ **partial** | 症状缓解(displayAddress 不再撒谎+显式 Reconnect 按钮),**根因 `?? wallets[0]` 回落原样保留** |
| B2 core-macro t 清扫 | ❌ **missed** | 76→72,无 lint 禁令;新代码还引入了未 i18n 的裸英文 |
| B3 断言解耦 | ⚠️ partial | 新测试习惯已改善(data-*/viem 构造);存量 font-semibold/sha256 仍在 |
| F-15 useMemo 违规 | ❌ missed | positions-panel:58 原样 |

## 本轮新行动项(按优先级)

1. **修 dfacac0e 新引入的 MAJOR**(F2-4):inactive 取消在途切换时使 `appliedSymbolRef` 失效(置 null),否则被取消的 setSymbol 后台落地后切回原 symbol 会因 `applied===target` 早退,永久静默停在错误市场(反驳者已写复现测试证实,20s 无恢复无面板)。一行级修复。
2. **静默换身份根因**(F2-1):`selectPrivyWagmiWallet` 的 `?? wallets[0]` 回落 + root.tsx 自动同步——建议:回落发生时发身份变更提示(toast/header 徽章),或去掉自动回落改为进入"未连接"态。显式 reconnect 复用同一函数,同款风险。
3. **auto-bridge 熔断收窄**(F2-2):FailedPermitDeposit(资金未动)与广播超时(RPC 抖动)应保留退避重试,只对"资金可能已动"的不确定态熔断。
4. **watchdog 迟到成功清面板**(F2-9):超时报错后迟到的切换成功应清除 initError,否则成功图表被错误 overlay 遮挡。
5. **B2 收口**:一次性 sweep 剩余 72 文件 + biome/eslint 禁令,别再逐 commit 漏。

## 全部发现(15 条)

### F2-1 [MAJOR][CONFIRMED] `apps/terminal/src/hooks/wallet/use-wallet-session.ts`:65(1d22aeed)

**Reconnect wallet 复用 selectPrivyWagmiWallet 的 wallets[0] 回落，显式重连仍可静默换成 embedded 身份；自动同步根因未修**

- 证据:use-wallet-session.ts:65-69 `selectPrivyWagmiWallet({wallets,user})` 有结果即 `setActiveWallet`。privy-wagmi.ts:98-103 非 embedded 路径为 `wallets.find(匹配 user.wallet.address) ?? wallets[0]`。时序推演：MetaMask 用户（账号同时挂有 email/embedded）外部断开 → Privy useWallets 只剩 embedded → find(MetaMask 地址) 落空 → 返回 wallets[0]=embedded → setActiveWallet(embedded) → wagmi connectedWalletAddress=embedded → useWalletSession.walletAd…
- 建议:reconnectWallet 中只在 `hasSameWalletAddress(preferredWallet.address, user?.wallet?.address)`（或上次活跃地址）成立时才 setActiveWallet，否则一律走 connectWallet 打开连接器；根治则改 selectPrivyWagmiWallet：非 embedded 路径当 userWalletAddress 存在但 wallets 中无匹配时返回 undefined（禁止跨身份回落到 wallets[0]/embedded），如需回落必须经用户可见的确认 UI。并给『wallets 只剩 embedded 且 recentLoginMethod=wallet』场景补一条不 mock 选择函数的回归测试。

### F2-2 [MAJOR][PLAUSIBLE] `apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx`:117(1d22aeed)

**error+hash 一刀切熔断过宽：回执已证明资金未动的 FailedPermitDeposit（及广播超时的 RPC 抖动）也永久停摆 auto-bridge，直到刷新页面**

- 证据:effect 中 `if (depositStatus === "error") { if (depositHash) { ...; return; } ... }`（:116-124）无条件早退，且先于 :126-130 的 eligibleDepositKey 变化重置——用户后续再充值（key 变化）也不会恢复；唯一自愈是余额跌破 5 USDC 走 :87-96 的 key=null 分支。可复现时序 1：Bridge2.sol 实证 permit 失败/transferFrom 失败只 emit FailedPermitDeposit 不 revert、资金必未动，此时 assertSmartBridge2DepositReceipt 抛错（hash 已在 confirming 时写入 state，use-deposit.ts:1107/1128 error 分支保留 previo…
- 建议:让 assertSmartBridge2DepositReceipt 对『有 FailedPermitDeposit 且无匹配 Transfer』抛类型化错误（如 PermitRejectedError，语义=回执已证明资金未动），auto-bridge 对该类型保留原退避重试（或清空 hash）；对广播/确认不确定类错误保留熔断但允许 eligibleDepositKey 变化（新资金到账）时重置。至少把 :117 的 hash 早退移到 :126 key 变化重置之后。

### F2-3 [MAJOR][CONFIRMED] `apps/terminal/src/components/trade/positions/orders-tab.tsx`:2(5f438814)

**B2 清扫仅完成 4/76：HEAD 仍有 72 个 components/hooks/routes 文件用非响应式 core-macro t，且未加 lint 禁令**

- 证据:git grep 统计（同一精确模式 `import { t } from "@lingui/core/macro"`）：0488cfec 时 76 个文件 → 5f438814/HEAD 72 个（本 commit 只迁移 spinner/price-input/chart-source-toggle 三个 + bottom-nav 的 t→msg）；全 src 范围 HEAD 仍有 90 行该 import。biome.json 无任何 noRestrictedImports/lingui 限制规则。而本 commit 自己的实验证明该 bug 类是真实的：把 5f438814^ 的 mobile-bottom-nav 换回后，新管线下测试立即复现『激活 zh 后 UI 冻结在英文』。即热切语言后 orders 表头、footer、mobile-market-bar 等 72 个文件的…
- 建议:把工作区正在进行的 sweep 尽快分批落库；同时立即加 biome/eslint 规则（src/components|hooks|routes 禁止从 @lingui/core/macro 导入 t，允许 msg），让新增违例在 lint 层灭绝——现在管线已能复现该 bug，lint + 一个代表性测试即构成完整防线。

### F2-4 [MAJOR][CONFIRMED] `apps/terminal/src/components/trade/chart/tradingview-chart.tsx`:384(dfacac0e)

**inactive 取消在途切换后 appliedSymbolRef 陈旧化:被取消的 setSymbol 在后台落地、目标又切回原 symbol 时,图表永久静默停在错误市场且无 watchdog/错误面板兜底(已写复现测试在 HEAD 上跑红)**

- 证据:时序(全部对照 HEAD 代码行为,并用临时 vitest 复现,断言失败为证):1) active=true 图表在 BTC(appliedSymbolRef="BTC",tradingview-chart.tsx:351 initWidget 或上次 completeSymbolSwitch 设置);2) 用户切到 ETH → applySymbol 置 pending=ETH、发出 widget.setSymbol("ETH");3) 完成前用户在移动端把 topView 切走 → active=false → :384-387 effect 走 cancelSymbolSwitchRef()(=clearPendingSymbolSwitch),只清 pending/监听/定时器,不动 appliedSymbolRef(仍="BTC");4) TradingView 在隐藏的 if…
- 建议:cancel 时使簿记失效:在 :384 的 `if (!active)` 分支中,若 `pendingSymbolRef.current !== null`(存在被取消的在途切换),在调用 cancelSymbolSwitchRef.current() 后将 appliedSymbolRef.current/appliedIntervalRef.current 置 null——重新激活时 applySymbol 必然重发 setSymbol 并挂 watchdog,由 isChartSymbolApplied 实际校验收敛(chart 已在目标 symbol 时 8s 内静默完成,不误报)。或者在 applySymbol 的 applied===target 早退前增加一次 `isChartSymbolApplied(getActiveChartSymbol(widget), nextSymbol)` 实际校验。现有测试 "cancels a pending symbol retry while the chart is inactive" 在该修复下仍应通过(reactivate 后 setSymbol 恰为 2 次);建议把上述复现场景补成正式回归测试。

### F2-5 [MINOR][CONFIRMED] `apps/terminal/src/components/trade/header/user-menu.tsx`:103(1d22aeed)

**displayAddress 去掉 linked 地址回落后，『已认证但 wagmi 无签名者』的纯钱包用户头部菜单标签渲染为空字符串，且头部无任何重连入口**

- 证据:HEAD 版 user-menu.tsx: `if (!authenticated && !isConnected)` 才渲染 Connect Wallet 按钮；authenticated=true、address=undefined（无 agent、无 email/ENS）时落入菜单渲染，`displayLabel = emailAddress ?? ensName ?? (displayAddress ? shorten : "")` = ""（:103），触发器只剩空标签。该状态正是本 commit 为 DepositModal 增设 Reconnect 按钮所针对的状态，但用户不开入金弹窗就没有任何恢复入口——修复前至少还显示 linked 地址（虽有误导性）。方向正确（不再把无签名者伪装成已连接），呈现不完整。工作区未提交的 user-menu.tsx 改动已在往这个方向迭代，…
- 建议:该状态下让 UserMenu 渲染『Reconnect wallet』触发器（复用 useReconnectWallet，与 DepositModal 同语义），或至少给 displayLabel 提供明确回落文案，避免空标签按钮。

### F2-6 [MINOR][PLAUSIBLE] `apps/terminal/src/lib/lifi/config.ts`:14(1d22aeed)

**新增的两处错误文案硬编码英文，脱离全站 lingui 运行时热切换体系**

- 证据::14 与 :31 `throw new Error("Wallet connection unavailable. Reconnect your wallet and try again.")` 为裸字符串。同一错误面（use-deposit.ts 全文、formatTransferError 链路）均用 @lingui/core/macro 的 t`` 在调用时求值，bridge tab 的失败提示会把此英文原文直接透出到 zh/es/fr/hi/ar 界面。CSP 侧无问题：li.quest 已在 connect-src 白名单，本改动未新增端点。
- 建议:两处改为 t``（函数体内调用时求值，与 use-deposit.ts 模式一致），并跑 lingui extract 让 5 个 catalog 收录。

### F2-7 [MINOR][CONFIRMED] `apps/terminal/src/lib/tests/language-switcher.test.tsx`:27(5f438814)

**vi.mock("@lingui/react/macro") 在新管线下已是死代码，且构成潜在掩蔽危害**

- 证据:实验证实：把该 mock 工厂改为 `throw new Error("MOCK-ENGAGED")` 后测试仍 2 passed——lingui babel 插件已把组件里的 macro import 编译掉，该模块运行时从未被加载，17 行 mock（含又一份手搓 sha256）纯属死代码。更糟的是它是反向保险：若将来有人把 babel 插件从 vitest.config.ts 移除（如嫌慢），mock 会静默重新接管 @lingui/react/macro，测试回到『未编译语义』继续绿，本 commit 好不容易建立的判别力无声蒸发。另外 :53 的 `Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })` 与新增 setup.ts:4 重复。
- 建议:删除整个 vi.mock("@lingui/react/macro") 块与 :53 的重复全局赋值（上一轮 F-8 建议原文即『顺带可删除手写 mock』）；未跟踪草稿 i18n-hot-switch.test.tsx 落库前同样清理。

### F2-8 [MINOR][CONFIRMED] `apps/terminal/src/lib/tests/language-switcher.test.tsx`:13(5f438814)

**getMessageId 仍手搓复刻 lingui 内部哈希，且与未跟踪草稿重复第三份**

- 证据:B3 只做了一半：断言已从 font-semibold/svg 解耦为 aria-current（好），但 :13-14 仍用 createHash("sha256").update(`${message}\x1f`).digest("base64").slice(0,6) 复刻 @lingui/message-utils 的 generateMessageId；mock 内 :37 又一份；未跟踪的 i18n-hot-switch.test.tsx 再一份。lingui 若调整算法，症状是『querySelector 找不到 aria-label=语言』这类间接失败，定位成本高。@lingui+message-utils@5.7.0 已在 node_modules/.pnpm 依赖树中。
- 建议:在 apps/terminal devDependencies 显式声明 @lingui/message-utils 并 `import { generateMessageId }`，或抽到 src/lib/tests/harness/ 共享一份（草稿落库时同步收敛）。

### F2-9 [MINOR][CONFIRMED] `apps/terminal/src/components/trade/chart/tradingview-chart.tsx`:196(dfacac0e)

**symbol-switch 超时报错后迟到的切换成功不清除错误面板，成功的图表被全屏 overlay 永久遮挡**

- 证据:时序：setSymbol 卡顿 >16s（8s 超时 + 1 次重试 ×8s）→ 195-196 行 finishSymbolSwitch()+setInitError("symbol-switch") 弹出错误面板；随后 TradingView 真正完成切换，setSymbol 第三参回调仍会触发 handleSymbolSwitchComplete()（159-168 行），四项守卫全部通过（widget 相同、target 未变、isChartSymbolApplied 为真）→ completeSymbolSwitch（114-118 行）更新 appliedSymbolRef 但全路径无任何 setInitError(null)。渲染层 402-417 行：initError 非空即渲染 absolute inset-0 z-20 bg-surface 全屏遮罩，切换已成功的图表…
- 建议:在 handleSymbolSwitchComplete 的成功分支（或 completeSymbolSwitch 内）清除超时错误：setInitError((prev) => (prev === "symbol-switch" ? null : prev))，让迟到成功自动撤下面板；并补一条对应测试（16s 超时出面板 → 之后 staleCallback 触发+__setActiveSymbol 对齐 → 断言面板消失且 widget 未重建）。

### F2-10 [MINOR][CONFIRMED] `apps/terminal/src/lib/tests/chart-store.test.ts`:59(dfacac0e)

**fake timers 只在各测试体末尾恢复、无 afterEach 兜底，断言失败即泄漏到后续用例造成误导性连锁超时**

- 证据:文件仅有 5 处 vi.useRealTimers() 且全部位于测试体最后一行（115/149/186/233/276 行），无 afterEach 恢复。实证：将 subscribe-with-reconnect.ts 回退到 dfacac0e^ 运行本套件，"reuses a pending subscription..." 在 259 行断言失败提前抛出、未执行 useRealTimers，泄漏的 fake timers 使下一条与竞态无关的 "resets chart listeners when the subscription reports a failure" 直接 5005ms 超时假失败（4 failed 中 1 条为连锁误报）。一旦竞态修复回归，CI 报告会多出无关失败，掩盖真实根因，与上轮 B3（测试断言解耦/稳健性）方向一致。
- 建议:在 describe 内加 afterEach(() => { vi.useRealTimers(); })，并可顺手删除各测试体末尾重复的 vi.useRealTimers() 调用。

### F2-11 [NIT][CONFIRMED] `apps/terminal/src/hooks/wallet/use-wallet-session.ts`:55(1d22aeed)

**useReconnectWallet 用非语义必需的 useCallback（违反 React 19 编译器项目规则），且 isReconnecting 只覆盖 setActiveWallet 分支**

- 证据::55-78 `const reconnectWallet = useCallback(async () => ...)` 无任何依赖引用稳定性的消费方（DepositModal 仅在 onClick 调用），项目规则 code-style.md 明确编译器启用下禁为性能加 useCallback。另外 login()/connectWallet() 均为 fire-and-forget，finally 立即把 isReconnecting 置 false，按钮 disabled 态只在 setActiveWallet await 期间生效，Privy 弹窗仍开着时按钮已恢复可点。
- 建议:改为普通 async function 声明；若要 isReconnecting 覆盖 connectWallet 流程，改用 useConnectWallet 的 onSuccess/onError 回调收口，或干脆只保留 setActiveWallet 分支的 pending 态并接受现状（注明即可）。

### F2-12 [NIT][PLAUSIBLE] `apps/terminal/src/lib/tests/transport-reconnect.test.ts`:30(5f438814)

**instanceof 断言弱化为 constructor.name，掩盖了 @nktkas/hyperliquid 双副本的根因**

- 证据:node_modules/.pnpm 中存在两份 @nktkas+hyperliquid@0.31.0（typescript@5.7.2 与 typescript@5.9.3 两个 peer 变体，疑为本 commit 新增 devDeps 触发 lockfile 重解析所致），测试从 apps/terminal 侧 import 的 WebSocketTransport 与 @gatu/hl-react 内部实例化的类身份不同，instanceof 假红，于是改为 `transport.constructor.name === "WebSocketTransport"`。测试 :25 注释仍声称 『against a real WebSocketTransport』，但 name 匹配已无法保证同一份类（也检测不到未来真正的双副本回归）。经查 apps/terminal/src 运行时 …
- 建议:统一 workspace 的 typescript 版本（或 pnpm overrides）消除 peer 分裂后恢复 instanceof；或让 @gatu/hl-react/clients 再导出 WebSocketTransport 供测试从同一模块图导入。

### F2-13 [NIT][CONFIRMED] `apps/terminal/src/components/trade/components/global-settings-modal.tsx`:122(5f438814)

**GlobalSettingsModal 的语言 Select 仍零测试覆盖（F-13 另一半未闭环）**

- 证据:本 commit 补上了 dynamicActivate 的两条分支断言（language-switcher.test.tsx:93 点击当前语言 not.toHaveBeenCalled、:100 点击 English 后 toHaveBeenCalledWith("en")），但 git grep 确认 HEAD 的 lib/tests 下仍无任何文件引用 GlobalSettingsModal——75c72bef 修的 Select value=activeLocale 同步至今没有测试面，且该组件已在新管线判别力下可低成本覆盖。
- 建议:在 language-switcher.test.tsx 同一 harness 下（或草稿 i18n-hot-switch.test.tsx 落库时）挂载 GlobalSettingsModal，断言 activateLocale("zh") 后 Select 选中项与文案更新。

### F2-14 [NIT][CONFIRMED] `apps/terminal/src/components/trade/mobile/mobile-chart-view.tsx`:4(dfacac0e)

**Props 接口命名违反项目规范:本 commit 修改了该接口(新增 active)却保留 MobileChartViewProps 命名**

- 证据:mobile-chart-view.tsx:4 `interface MobileChartViewProps`、:9 使用之;.claude/rules/code-style.md 明确 "Name props interface `Props` - Always use `interface Props`"。同一 commit 内 chart-panel.tsx:14 与 tradingview-chart.tsx:35 都是 `interface Props`,本文件是 diff 触及三处 Props 接口中唯一未合规的。
- 建议:改名为 `interface Props`(该文件单组件,无歧义)。

### F2-15 [NIT][CONFIRMED] `apps/terminal/src/components/trade/mobile/mobile-trade-layout.tsx`:72(dfacac0e)

**MarketsDataView 内 tabs.map 的局部 `const active` 遮蔽同名 active prop,本 commit 让该 prop 首次参与图表生命周期(:97),遮蔽的误用风险被放大**

- 证据:mobile-trade-layout.tsx:72 `const active = topView === tab.value`(map 块级作用域)遮蔽 :51 的 `active` prop;:97 `<MobileChartView active={active && topView === "chart"} />` 在 map 之外读取的是 prop——当前正确,但两个语义完全不同的 `active`(tab 选中态 vs 视图激活态)相距 25 行同名共存。遮蔽先于本 commit 存在,但此前 prop 在该函数内只用于渲染门控,本 commit 起它还决定 TradingViewChart 的 symbol-switch 生命周期(错传会复现被本 commit 修复的僵死类缺陷),未来在 map 内外移动这行 JSX 时极易踩中。
- 建议:将 :72 重命名为 `isSelected`(或把 tab 按钮提为小内部组件),消除同名遮蔽。
