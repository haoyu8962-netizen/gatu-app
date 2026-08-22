# 对抗审查报告:法律门控 + Agent 授权重构 十提交

- 审查对象(全部 2026-08-03,按时间序):`59c49518` 法律条款合约 → `12384b56` 法律接受门控 → `1077bab6` 分离 agent/builder fee → `c2ebcb02` 首次交易引导 → `6ca0c090` 后台暂停超时 → `aab23ae2` 会话级 Agent Key → `9312ecb2` Stay Connected → `78ca9de5` 体积预算 → `88366e3e` 注册后重验 → `7b83d79a` 遵循持久化偏好
- 方式:8 维度并行对抗审查 → 逐条反驳式核实 → 盲区批判 → 关键项人工实证(Hyperliquid 官方文档 + SDK schema + 上游源码 + 线上 API 只读探测)
- 规模:66 个 agent、约 630 万 token
- confirmed 50 条:**2 high、17 medium、31 low**;refuted 7 条
- 结论:**法律门控实现质量很高,是真正的合规改进;但 `c2ebcb02` 的引导门引入了一个 high 级合规倒退——它绕过 geo 主动引导受限用户签授权并自动弹入金。**

---

## 一、先说做得好的(这批的主体是扎实的)

**法律门控不是 localStorage 标志位,而是有密码学留痕的真同意机制。** 这实质闭合了我第一轮报告的"Terms 是纯 browsewrap、无任何主动同意留痕":

- **读**:`useLegalStatus` 走 Hyperliquid 官方 `legalCheck` info 端点——**服务端权威判定**,不是客户端猜测
- **写**:`acceptHyperliquidTerms` 用 EIP-712 `Hyperliquid:AcceptTerms` 签名后提交 `acceptTerms2`,并有 `WalletAccountMismatchError` 确保签名钱包 === 用户地址。**不可抵赖**
- **fail-closed**:`deriveLegalGateState` 在 `isError || acceptedTerms === undefined` 时返回 `"error"`,`!userAllowed` 时返回 `"blocked"`
- **未知限制码 fail-closed**:`parseLegalStatus` 认 4 个码 `["n","a","o","u"]`,未知码 → `canPerformActions = false`

核实者查了**上游最新 SDK 源码**,确认这 4 个码与官方语义一致(`n`=无限制、`a`=平台动作被封、`o`=隐藏 outcome 市场、`u`=英国用户限制),本地 pin 的 0.33.1 只声明了 2 个且标 FIXME——**应用侧比 SDK 类型更准确**。

另一位核实者对线上 API 做了**只读判别性探测**(签名用 r=s=0 不可恢复,无写入副作用):`acceptTerms2` 缺字段返回 422、完整字段返回 500(签名校验失败),证明该端点确实被 `/info` 识别且字段形状正确。

**我第一轮报的"legal/ 目录三套互相矛盾的受限名单草案"被主动删除了**,还加了测试 `does not retain superseded eligibility drafts as competing sources` 断言这四份文件必须不存在。

**B7 闭合**:会话级 key 默认 fail-closed 到 sessionStorage(仅当值恰为 `"true"` 才用 localStorage),配合 `a2e6c5b2` 已加的登出清理。

**agent/builder fee 分离经官方文档核对无误**:两者确为独立 user-signed action;builder-codes 文档明确 "must be signed by the user's main wallet, not an agent",代码把 `approveBuilderFee` 放进 `USER_SIGNED_METHODS` 正确;`maxFeeRate` 的 Percent 正则、`f=10`→`"0.01%"` 的单位换算(十分之一基点)、`agentName="gatu"` 的 ≤16 字符约束,逐项命中 SDK schema。`c2ebcb02` 还把顺序从 fee→agent 翻转为 agent→fee,中途放弃两种情况都可恢复,不会重复消耗 agent 配额。

---

## 二、HIGH:引导门绕过 geo,主动引导受限用户签授权并自动入金

**`trading-onboarding-gate.tsx`(`c2ebcb02` 新引入)** —— 已人工验证

该文件对 geo **零引用**(`grep geo|tradeRestricted|useGeoRestriction` 零命中):

```js
const shouldAutoOpen = activeModal === null && !wasDismissed;
const shouldShowConnection = hasWalletAccess && !!identity && !isAgentLoading && !isAgentReady && (wasRequested || shouldAutoOpen);
// ...
if (fundingState === "empty") deposit.open("deposit");
```

任何连了钱包但 agent 未就绪的用户 → **自动弹出**(非用户发起)"建立连接"弹窗要求签 `approveAgent`;注册成功后 → **自动打开入金弹窗**。

**为什么这是倒退而非既有问题**:我此前报的 geo 缺口是"受限用户仍能找到入口";这次是**应用主动把受限用户推向链上授权和入金**。而且它与既有实现自相矛盾——`account-panel.tsx:129` 和 `top-nav.tsx:125` 都明确对 `tradeRestricted` 用户**隐藏入金入口**,本批新增的引导门却自动打开同一个入金弹窗。这与我第一轮报的 `embedded-deposit-auto-bridge` 同形,但更主动。

配套的 medium(同一文件):**HIP-3 第三方市场风险披露被抢占**。`TradingOnboardingGate` 包裹的正是全局弹窗集合,`shouldShowConnection` 时 `return <EstablishConnectionModal/>` 提前返回,HIP-3 免责声明在 children 内被卸载 → **用户在看到第三方市场风险披露之前就被要求签名授权**。

---

## 三、HIGH(校准后):新用户引导顺序与 Hyperliquid「必须先入金」硬约束相反

**`trading-onboarding-gate.tsx:70`**

官方 Signing 文档的错误列表明确包含:

> **"Must deposit before performing actions. User: 0x123..."**

即从未入金的账户无法执行任何已签名 exchange action,`approveAgent` 也不例外。而引导门的逻辑是:自动弹出"建立连接" → 用户签 `approveAgent` → **被 Hyperliquid 拒绝** → `handleConnected` 永不触发 → `setPendingDepositIdentity` 永不执行 → **自动入金提示对"从未入金的新用户"这一目标人群永远不可达**。

**我校准了批判者的结论**:`TradingOnboardingGate` 只包裹 `content`(全局弹窗集合),**不包裹交易页与导航**。所以交易页和 top-nav 仍可见;被阻断的是 DepositModal 等其他全局弹窗。用户关掉引导弹窗后(`handleClose` 置 `dismissedIdentity`)children 恢复,手动入金可用。

所以**不是永久硬阻断,而是新用户首次体验的死胡同**:自动引导路径必然失败,且失败时用户得到的是一个签名被拒的报错,而不是"请先入金"的指引。需要用户自己想到关掉弹窗再去导航入金。

---

## 四、MEDIUM 精选(17 条中最值得处理的)

**法律门控的覆盖面(与 geo 同形的老毛病):**

- **`checking` 期间 fail-open**:`legalStatus.isPending` → `"checking"` → 不渲染弹窗,而弹窗只是兄弟层覆盖物、**不包裹交易界面**。legalCheck 往返(含重试)期间交易面板完全可用,最长约 33 秒
- **agent-only 会话完全绕过法律网关**:`useLegalGate` 依赖 `hasWalletAccess`,手机 QR 导入的 agent-only 会话不满足该条件 → 网关 `"inactive"` → 受限账户在该模式下不被封禁
- **法律页面的 GlobalModals 未挂门控**:`legal-doc-page.tsx:62` 渲染的全局弹窗没有门控,从条款弹窗内的链接一键即可打开入金/提现/跨链弹窗

**把 Hyperliquid 的同意当成 gatu 的同意(规范性):**

`canPerformActions` 依据的是 Hyperliquid 全局 `acceptedTerms`。**已在 Hyperliquid 官方前端接受过条款的老用户,永远看不到 gatu 自己的 clickwrap**;签名载荷只有 `hyperliquidChain + time`,**不含任何文档 URL/版本/哈希**,gatu 侧零留痕 → 条款更新后无法强制重新接受,事后也无法证明用户接受的是哪一版。

**会话级 key 的多标签页代价:**

- `agentName` 恒为常量 `"gatu"` 且不带 `valid_until`。官方文档明确"同名 ApproveAgent 会注销旧的同名 API wallet 并可能裁剪其 nonce 状态"。sessionStorage 每标签页独立 → 开第二个标签页会重新注册 → **静默注销第一个标签页正在用的 agent**,造成反复签名弹窗
- 注册 epoch 记录 `hyperliquid_agent_registration_session_*` 仍只读写 **localStorage**(跨标签共享),而私钥已搬进 sessionStorage → 两者维度不一致,另一标签页登出后本标签页 UI 显示就绪却无法下单
- "安全断开"无法清除**其他标签页** sessionStorage 中的私钥

**授权链的最终确认过弱:**

`88366e3e` 的重验是对**最终一致**的 `extraAgents` 做单次读取、无重试。info 端点滞后会把两次成功签名判成失败并丢弃排队订单。

**`/cookies` 是孤儿页**:除门控弹窗外无任何入口,营销站也未发布,而 `legal/README.md` 自己规定"新增公开政策必须同步更新 README 表格、两个站点路由和所有导航入口"——新增的 contract test 反而把这个缺口固化成"通过"。

---

## 五、测试与构建

**测试套件 flaky(我用 5 次运行实证)**:2 次失败、3 次通过。我这边失败集中在 `establish-connection-modal.test.tsx`(本批新增)与 `mobile-agent-sync-route.test.tsx`,耗时 5064–6889ms 贴着 vitest 默认 5000ms 超时;某 agent 在并发负载下实测到 **54 failed / 12 files**。typecheck 稳定通过。

**但核实者用实验推翻了"本批新增测试是主因"**:全套最慢的两个用例是 `chart-store.test.ts`(3308ms)与 `chart-store-benchmark.test.ts`(2982ms),均未被本批触及。结论修正为:**这是默认 5000ms 超时下的系统性 flaky,本批不是主因**。真正的问题是 —— CI **根本不跑测试**,1241 个用例完全不参与 PR 门禁,所以这个 flaky 至今无人察觉。

**`78ca9de5` 确实是"抬高阈值让构建变绿"**,不是实测刷新:`totalGzipBytes` 2_620_000 → 2_650_000,已是**连续第三次单调上调**,当前余量仅剩 0.43%。批判者进一步找到了体积来源:`global-modals.tsx` 对所有既有 modal 一致使用 `createLazyComponent`(6 个无一例外),而本批新增的 `LegalAcceptanceModal` 与 `TradingOnboardingGate` **破例改用静态 import**,后者又静态引入 `EstablishConnectionModal` 和 `useDefaultDexBalances`(订阅全部 dex 状态),被强制并入共享 chunk。

---

## 六、被对抗核实推翻的 7 条(体现审查纪律)

- "`acceptTerms2` 无依据/primaryType 偏离约定" → **线上探测证伪**:该端点真实存在且字段形状正确
- "无上限暂停把迟到签名窗口从 60 秒放大到无限" → 推翻:该窗口**本来就是无限的**,`withWalletApprovalTimeout` 自 `f5b12fcb` 起就只是 `Promise.race`,从不取消底层签名请求
- "dangling approveAgent 阻塞提款转账" → 机制属实但**纯旧问题**,这批未加重
- "接受弹窗不含受限地区自我声明" → 被仓库现行规范否定:`legal/README.md` 明文禁止在该目录创建独立的 region/KYC/self-attestation 清单,且有测试守护
- "builder fee 第二次签名无 UI 披露" → 事实错误:三处都渲染 `Builder Fee 0.01%`
- "本批新增测试是 flaky 主因" → 实测反驳(见上)
- "后台暂停无上限是遗漏" → 推翻:这是 `6ca0c090` **刻意确立的契约**(加绝对上限会重新引入它要消除的误超时),测试第 44-64 行精确断言了该行为

---

## 七、方法与置信度

**我亲自实证**:5 次运行测试确认 flaky 并定位失败文件;读 `use-legal-gate.ts` / `use-legal-status.ts` / `legal.ts` 全部逻辑确认 fail-closed 与 `legalCheck` 数据源;核对 SDK `legalCheck.d.ts` 的响应字段与 FIXME 标注;查官方文档确认 `acceptTerms2`/`legalCheck` 均未收录;确认 `legal/` 四份草案已删除且有测试守护;确认 `trading-onboarding-gate.tsx` 对 geo 零引用、自动弹窗与自动入金逻辑、以及它只包裹 global-modals 而非交易页;确认 `account-panel`/`top-nav` 对受限用户隐藏入金形成矛盾;确认 `readPersistTradingConnection` 的 fail-closed 默认。

**未做**:真机多标签页/多设备实测(会话级 key 互相注销基于官方"同名 agent 被注销"语义 + 代码推导);未实测从未入金账户的 `approveAgent` 真实拒绝行为(基于官方 Signing 文档错误列表 + 代码路径推导);未切换出口 IP 验证 `restrictions` 字段缺失的真实场景。
