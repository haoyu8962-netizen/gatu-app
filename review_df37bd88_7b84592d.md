# 对抗式审查报告(第四轮):df37bd88 / 7b84592d

> 方法:6 维独立 finder(账号模式链路 / live-localization / 组件正确性 / 行为回归 / 文档准确性 / 测试判别力)→ 每条发现 2 名独立反驳者多数决。96 agent。验证手段:React Compiler 编译产物分析 + 隔离 worktree 运行时实验、变异/revert 实验(实验后均已恢复工作区)、SDK 0.33.1 与 rews 4.1.0 实包对照、官方文档 MCP 检索、六语言 .po 逐条 grep、文档代码示例实际运行。**39 条 CONFIRMED / 1 条 PLAUSIBLE / 5 条 REFUTED**,去重后约 15 个独立问题。

## 评分

| Commit | 评分 | 一句话结论 |
|---|---|---|
| `df37bd88` feat(trade): improve controls and live localization | **6 / 10** | 账号模式 modal 比旧 Dropdown 一键盲切是净改善(确认步骤 + Current 徽标);i18n 测试有真实判别力(变异实验:trade-option-checkboxes 回退 core-t 测试变红)。扣分:**提交主题是 live localization,但它自己触碰的 user-menu/top-nav 仍是非响应式 core-t**;UI_TEXT getter 在 React Compiler 下热切换失效(本提交还写了错误注释);Manual 选择会被自动切换链路跨设备逆转;认证但钱包不可用时桌面失去登出入口 |
| `7b84592d` docs(sdk): align guides with hyperliquid 0.33 | **5 / 10** | 删除 failureSignal 时代过时内容方向正确。但自称"对齐 0.33"却:重连默认值写反(3 次 vs 实际 Infinity)、虚构 SDK 类型导出、响应 schema 仍是 0.31 形态、25+ 方法缺文档(含本项目在用的 userSetAbstraction)、保留会运行时抛 ValiError 的示例 |

## 行动项(按优先级)

1. **[AM-2/P1] Manual 豁免自动切换**:`use-default-unified-account.ts:53` 的豁免列表加入 `"disabled"`(用户处于 Manual 本身即偏好)——一行级修复。现状:显式选 Manual 后换设备/清存储,`useDefaultUnifiedAccount` 会零确认签署 `userSetAbstraction("unifiedAccount")`(Privy 嵌入钱包 `showWalletUIs:false` 下零 UI),且官方明文 "Builder code addresses must be in standard mode to accrue builder fees" —— 自动切换直接中断 builder 费累积。
2. **[P1] Reconnect 态保留登出入口**:`user-menu.tsx:85-101` 的 Reconnect-only 分支使认证但钱包不可用(外部钱包锁定/撤销授权)的用户无法从桌面登出(rg 证实 useDisconnectWallet 桌面唯一消费者就是该菜单)。给 Reconnect 按钮加次级 Disconnect 操作。
3. **[P1×2] live localization 收口**:
   - `user-menu.tsx` / `top-nav.tsx`(本提交触碰过)补 `const { t } = useLingui()`,否则热切换后同一菜单中英混排(Trans 子项更新、t 字符串冻结);
   - **UI_TEXT getter 在 React Compiler 下失效**:编译产物证实 JSX 读 getter 的块进 `memo_cache_sentinel` 一次性缓存槽,re-render 不重新求值——本提交给 ui-text.ts 写的注释("consumers must still subscribe with useLingui so a locale change reevaluates each getter")机制错误。4 个 mobile 组件(mobile-trade-view/book/account/header)整面板热切换失效(隔离 worktree 运行时实验证实 en→zh 后仍显示 "Reduce Only")。迁移方案与本提交对 orderbook-panel/account-panel 的做法一致;
   - Buy/Long/Sell/Short 经 `deriveOrderEntry` 被 compiler 记忆化(11 个依赖均与 locale 无关),热切换后侧边按钮残留旧语言——让 locale/t 进入参数。
4. **[AM-1+BR-2+BR-4/P2] modal 边界态**:currentMode=null(查询失败 / dexAbstraction 用户——SDK 返回值真实存在该值)时不预选、禁用 Apply 并提示无法获取当前模式;恢复 Loading 标签(本提交删除了它,加载期恒显 "Unified";注意旧 Loading 分支自身有 bug:disabled 查询 status 恒 pending,未连接用户会永久 Loading——需一并用 `fetchStatus` 修正);Cancel 不绑 isBusy(未连接钱包时 Cancel 被永久禁用,只能 Esc 关闭);"Separate"(按钮)与 "Manual"(弹窗)统一命名;"Default account setting" 文案与 `normalizeAccountAbstraction` 把 API "default" 归为 disabled 自相矛盾——文案与归一化必须取其一改。
5. **[DOC-1/P1 + DOC-2/P2] 文档立即修正**:重连小节改为 rews v4 实际默认(maxRetries **Infinity**、2^n×150 封顶 10s 带 equal jitter、stableTimeout 3s 重置计数、补 shouldReconnect/keepAlive)——"重试 3 次放弃" vs "无限重连"是完全相反的运维心智模型;删掉虚构的 "helper-specific parameter types exported by the SDK"(signing 模块只导出函数与 AbstractWallet 系列,grep 全包无任何 *Parameters 类型导出)。
6. **[P2 批次]**:补空翻译(zh 3 条:Primary navigation/Toggle display units/Transfer between Perps and Spot;es/fr/hi/ar 各 10 条:Account mode/Account mode updated/Unified/Separate/Advanced/Order type 等);"All" scope 给可寻址表示(现状:落地 "/" 重定向后 All 降级为运行时状态,刷新丢失,跨路由点击 All 被 pathname 重置覆盖不生效);account-mode-modal 选中态 `border-brand`/`bg-brand/10` 改 `border-stroke-selected`/`bg-brand-soft`;文档 DOC-3/4(spotState schema 补 0.33 形态、方法目录补 25+ 缺失方法并修正 explorer 归属)。

## 主要发现详情(去重后)

### AM-2 [P1][CONFIRMED×2 维持 P1] Manual 被跨设备静默逆转 + builder 费中断
`use-default-unified-account.ts:50-76`:仅豁免 unifiedAccount/portfolioMargin,链上 "disabled" 不豁免;偏好仅存 localStorage(按设备隔离)。反驳者加强了危害:`config/privy.ts:16` `showWalletUIs:false` → 嵌入钱包用户被零 UI 链上签名逆转其显式选择。官方文档引文逐字核实。根因在 06d11680,但本提交把 Manual 做成一等公民选项(modal 正式推荐给自动化交易者)却未与自动切换链路对账,遗漏定性成立。

### AM-1 [P1→P2][CONFIRMED] currentMode=null 时谎报 "Unified" + 可盲签
两个真实场景:userAbstraction 查询 error(retry:1,error 态无任何 UI 呈现)或用户实际处于 dexAbstraction(SDK `UserAbstractionResponse` 含该值,官方称 "to be discontinued" 但仍是真实当前态)。此时 header 显示 "Unified",modal 预选 unifiedAccount、isDirty 恒 true、Apply 启用,`trade-panel.tsx:268` 守卫对 null 不拦截——端到端可签。反驳者澄清:null→Unified 兜底是既有行为,旧 Dropdown 更易误切,modal 是净改善;但新组件对 null 的预选+启用 Apply 是新代码的健壮性缺陷。

### LL-1 [P1→P1/P2][CONFIRMED] UI_TEXT × React Compiler:getter 模式失效
双实验:① 项目同款 babel 配置编译 `<span>{ORDER_TEXT.AVAILABLE_LABEL}</span>` → `memo_cache_sentinel` 一次性槽;② 隔离 worktree 运行时:订阅 useLingui 的组件 en→zh 后 textContent 仍 "Reduce Only"。新测试恰好只覆盖已迁移组件,刻意绕开了 4 个仍用 UI_TEXT 的 mobile 组件。**注意:这修正了"UI_TEXT 已重构为响应式 t getter 即完成"的既有认知——getter 在 Compiler 下不随 re-render 重新求值。**

### usermenu-no-logout [P1→P1/P2][CONFIRMED] / BR-1 [P1][CONFIRMED×2] / BR-2 [P2] / BR-3 [P2]
详见行动项 2/3/4/6。BR-1 的变异实验证明测试防线对该类回归有判别力(把 trade-option-checkboxes 回退 core-t → i18n-hot-switch 红),即防线有效但本提交自己的文件没过自己的防线;另有约 60 个文件属同一迁移未完成面(与第二轮 B2 行动项延续),优先迁移与已迁移组件同屏的(如 trade-form-tif,恰好渲染在新 TradeOptionCheckboxes 内)。

### 文档(7b84592d)
- **DOC-1 [P1][CONFIRMED×2 维持]**:rews 4.1.0 d.ts `maxRetries @default Infinity`;SDK `new ReconnectingWebSocket(url, options?.reconnect)` 直传无默认——文档的 `{ maxRetries: 3 }` 是主动写入的错误。
- **DOC-6 [P3]**:sdk-2.md:915 的 v.parse 示例实测抛 ValiError(type "cancel" vs 字面量 "cancelByCloid"、cloid 12345 vs 34 字符 hex)——文档示例应可运行。
- **DOC-4 [P2]**:方法差集精确复现:info 缺 12、exchange 缺 13(含 userSetAbstraction/userPortfolioMargin——本项目账号模式正在用)、explorer 5 方法误标为 Info/Subscription。

### 测试质量
- **F4 [P3][CONFIRMED]**:两个测试文件的 `vi.mock("@lingui/react/macro")` 是死代码——工厂首行插 throw,3 测试照常通过(babel 宏编译期消除 import)。本提交对 language-switcher 的 3 行改动是对死代码的等价重构。建议删除,避免误导。
- **F2/F3 [P2]**:测试面缺插值/复数(本提交唯一新增插值 msgid "Switch to {selectedModeLabel}" 恰不在测试面)、缺 ui-text getter 与 use-button-content 路径。

## 被驳回项(记录以防复提)

- **AM-3**(PM 前置条件 $25M vs <$5M 文案冲突):双票驳回,modal 文案与官方文档实际无冲突。
- **LL-2**(移动端账户模式死按钮):移动端布局本就从不渲染该控件,不是本提交移除的能力——但由此确认的 AM-7/BR-7(死接线 props + 移动端无切换入口)成立为 P3。
- **BR-9**(macro mock 未导出 Trans 会崩):三个独立实验证伪——未来组件引入 macro Trans 也会被 babel 编译掉,mock 路径无人 import(这也正是 F4 判其为死代码的同一机制)。

## 做得好的(保持)

- 账号模式从一键 Dropdown 升级为带确认、Current 徽标、显式 "Switch to X" 按钮的 modal,是交互安全性的净改善。
- i18n-hot-switch 测试对已迁移组件有真实判别力(变异实验红),断言节点身份不变(锁定"无需 remount"),六组件覆盖面选取合理。
- `userSetAbstraction` 映射合法(SDK picklist:dexAbstraction/unifiedAccount/portfolioMargin/disabled,UI 三值均在内),EIP-712 principal 签名路径正确,未触碰 wallet.md 红线(HL 签名者恒 EOA)。
- 文档删除 failureSignal/0.31 订阅签名等确属过时的 265 行,方向正确。
