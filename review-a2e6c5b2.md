# 对抗审查报告:`a2e6c5b2` fix(terminal): close launch-critical safety gaps

- 审查对象:`a2e6c5b2`,139 文件、+12360/-508
- 方式:10 维度并行对抗审查 → 每条 high/medium 逐条反驳式核实 → 盲区批判 → 关键项人工实证(含实测 Hyperliquid 线上 API、核对 Caddy 源码、核对 SDK valibot schema、核对官方文档)
- 规模:75 个 agent、约 810 万 token
- 结论:**提交整体质量高,但引入了一个生产环境专属的合规 blocker,且一个 feature gate 的实际封锁面远超其命名暗示。这两条必须在上线前处理。**

---

## 一、总评

先说好的:这个提交的**工程质量明显高于前两轮**。

- 测试 **821 → 1112 全通过**(新增约 291 个),`pnpm typecheck` 通过
- SDK 字段核对**几乎全部正确**:`updateIsolatedMargin{asset,isBuy,ntli}`、`topUpIsolatedOnlyMargin`、`approveAgent`、`userSetAbstraction`/`userPortfolioMargin`/`agentSetAbstraction` 等逐字段命中 0.33.1 的 valibot schema;`ntli` 的 6 位小数整数编码与符号约定、`agentName` 的 `valid_until` 剥离后 ≤16 字符、PM 三条激活路径的完整覆盖,都经官方文档 + SDK 双向核对无误
- nonce 机制经官方 `Nonces and API wallets` 逐条核对**正确**:`Math.max(now, prev+1)` + Web Locks 独占 + 持久化回读,满足"大于最近 100 个 nonce 的最小值、从未用过、落在 (T-2d, T+1d)";SDK 侧 `nonceManager` 收到的确实是签名者地址,与"nonce 按 signer 跟踪"一致
- 错误上报的隐私设计**超出预期**:报文是纯枚举白名单,error message 只用于分类不外传,堆栈帧削成 `asset:行:列`(文件名整个丢弃)。我专门找泄漏面(私钥/地址/fragment 凭据/localStorage),没有找到
- 对抗核实**推翻了 10 条**发现(含 1 条 high),说明本轮报出的问题经得起反驳

confirmed 54 条:**1 blocker、2 high、21 medium、30 low**。

---

## 二、BLOCKER:Caddyfile 头部顺序错误 → 生产环境 geo 管制全局失效

**`deploy/Caddyfile:32-39`(本提交新引入)**

本提交为了让一次性 QR 端点能按客户端 IP 限流,新增:

```
reverse_proxy 127.0.0.1:3000 {
    header_up -X-Forwarded-For
    header_up X-Forwarded-For {remote_host}
    header_up -X-Real-IP
    header_up X-Real-IP {remote_host}
}
```

意图是"替换而非追加",但 **Caddy 的 `header_up` 不按 Caddyfile 书写顺序执行**。我拉取了 Caddy 源码 `modules/caddyhttp/headers/headers.go` 的 `HeaderOps.ApplyTo` 原文,里面有**两个** delete 循环:

```go
// 第一个 delete 循环 —— 只处理通配符
for _, fieldName := range ops.Delete {
    if fieldName == "*" { clear(hdr) }        // 具名字段在此被跳过
}
// add ...
// set
for fieldName, vals := range ops.Set {
    hdr.Set(fieldName, strings.Join(newVals, ","))   // ① XFF = remote_host
}
// delete —— 具名字段真正的删除在这里
for _, fieldName := range ops.Delete {
    if fieldName == "*" { continue // handled above }
    default: hdr.Del(fieldName)                       // ② 又把 XFF 删掉
}
```

具名字段的 `Del` 在 `Set` **之后**执行。净效果:**`X-Forwarded-For` 与 `X-Real-IP` 被彻底删除**,上游收到的请求根本没有这两个头。

后果链(已逐环确认):

1. `get-geo.ts:45` 的 `getRequestIP({ xForwardedFor: true })` 取不到 XFF → 回退到 socket 远端地址 = **`127.0.0.1`**(Caddy 就在本机 `reverse_proxy 127.0.0.1:3000`)
2. 该值非空,通过 `if (!apiKey || !ip) return UNKNOWN` 检查 → 拿 `127.0.0.1` 去查 ipdata → 私有 IP 报错 → `catch { return UNKNOWN }` → `tradeRestricted: false`
3. **全站 geo 管制静默失效,所有受限辖区用户畅通无阻**
4. 附带:`cache.set(ip, ...)` 现在全体用户共用 `"127.0.0.1"` 一个缓存键;若某次查询侥幸成功,那一个判定会被发给所有人
5. 附带:`mobile-agent-sync-ticket.ts:10` 的 `sourceKey` 同样恒为 `127.0.0.1`,**按 IP 限流退化成全站单桶**——恰好是这段配置想要防止的事情

**为什么危险**:只在生产环境(经 Caddy)复现。本地开发直连 Nitro、单测、typecheck、CI 全都发现不了。一个为"加固"而做的改动,反而把上一轮报告里唯一还算生效的合规控制彻底关掉了。

修法很简单:删掉两行 `-X-Forwarded-For` / `-X-Real-IP` 即可——`hdr.Set` 本身就是覆写语义。

> 说明:官方 Caddy 文档没有记载这个操作顺序,`reverse_proxy` 和 `header` 两页都查过。我一开始据文档摘要判断此条不成立,读到源码原文后确认判断有误——这是 Caddy 一个有实际杀伤力的暗坑。

---

## 三、HIGH:逐仓风控闸门让 HIP-3 builder 市场大面积无法开仓

**`apps/terminal/src/config/isolated-risk.ts` + `hooks/trade/use-tracked-order.ts:43`(本提交新引入)**

机制链(逐环确认):

1. `resolveIsolatedRiskFeatureFlags` 只在 `VITE_ISOLATED_RISK_INCREASE_ENABLED === "true"` 时开启;而 `.env.example:27` 与 `deploy/env.build.example:29` **两个模板里该值都是空的** → 默认 `increaseEnabled = false`
2. `use-asset-leverage.ts:97-99` 的 `computeMarginMode()` 对 `isOnlyIsolated` 市场**无条件返回 `"isolated"`**(不看链上杠杆、不看用户选择——因为这类市场本来就不允许 cross)
3. `use-tracked-order.ts:43`:任何非 reduce-only 订单 + `marginMode==="isolated"` + 闸门关闭 → 直接 `throw`

即:**在 isolated-only 市场上,用户根本没有"改用 cross"这个选项,所以"禁止增加逐仓风险"等价于"该市场完全不能开仓"。**

我实测线上 API 确认了影响面:

| dex | 总资产 | isolated-only | 占比 |
|---|---|---|---|
| **xyz** | 103 | 84 | **82%** |
| **km** | 23 | 20 | **87%** |
| **mkts** | 23 | 20 | **87%** |
| **para** | 18 | 15 | **83%** |
| hyna | 25 | 3 | 12% |
| 主网默认 dex | 232 | 9 | 4% |

主网默认 dex 只有 9 个 legacy 资产受影响(RLB/UNIBOT/HPOS 等),问题不大;但 **HIP-3 builder dex 上 82%-87% 的资产完全无法开仓**——而 builders-perp 正是本产品主打的差异化场景。

两个加重因素:
- **没有按钮级前置禁用**:错误在提交时才抛出,用户填完表单点买入才看到"Opening or increasing isolated positions is temporarily unavailable"
- 该文案是本次新增的 21 条未翻译文案之一(见下节),非英文用户看到英文

这个 gate 本身是有意的("a separately reviewed rollout",fail-closed 设计合理)。问题是**它的封锁半径远大于名字暗示的范围**,而且两个 env 模板都以关闭状态发货。上线前需要明确:是打算开启它,还是接受 builder 市场只能看不能开。

---

## 四、HIGH:一次性票据没有解决 B5 的机密性问题

**`lib/mobile-sync/sync-core.ts:481`**

新增的一次性票据是**应用层门禁**,不是加密改进:AES 密钥仍与密文同处 QR 的 URL fragment。拿到 QR 图像的人(投屏、录屏、肩窥、拍照)依然可以离线解出 agent 私钥,完全绕过票据机制。票据只能防"同一个链接被兑换两次",防不住"凭据本身被看见"。

配套两条本提交新引入的可用性问题:

- **`one-time-ticket-server.ts:3` TTL 60s 与 QR 的 60s 展示窗口重叠且票据先启动** → 正常扫码路径大概率赶上 410,而错误文案还误报为"已被使用"
- **`routes/mobile-agent-sync.tsx:289` 票据消费失败会把手机上已有的 agent 注册槽永久写成 `closing`** → 手机现有交易权限立即失效且无法再导入,只能清站点数据。`:331` 的中止路径(Discard/卸载/草稿过期)同样触发 rollback 写 `closing`,但随后 `return` 使用户看不到任何提示——静默损坏

---

## 五、i18n:安全警告本身没翻译(我用脚本实测)

各语言 catalog 空 `msgstr` 统计:

| 语言 | 空翻译 |
|---|---|
| en | 0 |
| zh | 21 |
| **es / fr / hi / ar** | **各 129** |

比上一轮(各 23 条)显著恶化。而且本提交为修复 B5 新增的那句安全警告就在未翻译之列:

```
msgid "Anyone who scans or captures the QR can trade as this Agent."
zh → "任何扫描或截取此二维码的人都能使用该交易密钥进行交易。"
es/fr/hi/ar → ""
```

等于给 4 种语言的用户加了一条他们看不懂的安全警告。上一轮点名的 `i18n-check.yml` 只校验 catalog 新鲜度、不检测空翻译,所以 CI 依然全绿。

---

## 六、MEDIUM 精选(完整 21 条见工作流输出)

**本提交新引入:**

- **`provider.tsx:158` 把"钱包瞬时断连"当成"换账号",静默删除本地 agent 私钥。** 新增的 `useLayoutEffect` 依赖 `clientKey`,而 `clientKey` 变成 `"disconnected"` 也算变化 → 触发 `closeAgentRegistrationSessionAndRemove`,真正删掉私钥。用户没点过 Disconnect,只是钱包锁屏/切链一次,回来就得重新签 `approveAgent`
- **`useExchange.ts:55` / `agent-registration-session.ts:580` 的 `closing`/`closed` 墓碑无自愈路径**,可导致撤单、平仓、提现等动作被误杀直到刷新
- **`request-scheduler.ts:48` 的 generation identityKey 未区分 user-signed 与 agent 交易客户端**,两者交替调用会互相作废对方排队中的请求
- **`exchange-policy.tsx:68` 这道"SDK 边界最后防线"根本不覆盖 `order` / `twapOrder` / `batchModify`**,只有 `updateLeverage` 和 `updateIsolatedMargin` 两个 case。开/加逐仓仓位这个最主要的风险动作零覆盖,只靠 app 层手写 `riskContext`;`position-tpsl-modal.tsx:140` 现在就是一条已存在的未受保护通道
- **`use-bridge.ts:303` 源链交易 revert 后进入"只能 Resume tracking / 永远失败 / 不能放弃"死循环**,资金仍在钱包却无法重新发起桥接
- **`bridge-execution-persistence.ts:244` 的 `hasCommittedBridgeFunds` 是 fail-open 判定**:任一校验不通过就回落到"重放整条路由"的旧危险路径
- **`position-isolated-margin-modal.tsx:69` 新增的逐仓保证金模态零 geo 门控**——本提交给受限辖区新开了一个资金操作入口
- **`historical-orders.ts:41` 纯 Market 单把滑点保护价 `limitPx` 当"委托价"展示**,与本提交自己对触发-市价单的处理自相矛盾
- **`account-mode-modal.tsx:141` 把弹窗里原本正确的 PM 资格提示(<$25M)换成了官方文档查不到的 "<$1,000" 说法**

**旧问题未修:**

- **B6 geo 全线未动**:`positions/` 目录 geo 仍零命中(Swap/Send/To Spot/To Perp 全部绕过)、embedded 自动入金不看 geo、缅甸与乌克兰占领区未封、`isResolving` 仍无人消费
- **`account-panel.tsx:54` Portfolio margin 账户的净值与清算风险仍用普通 cross margin 公式**,官方 PMR 与 `borrowed` 字段被完全丢弃
- **`use-bridge.ts:118` LI.FI 的 `status=DONE` 包含 REFUNDED/PARTIAL**,被当作桥接成功
- **`historical-order-price.tsx:17` 价格列固定 2 位小数**,亚分资产整列显示 $0.00/$0.01
- **`get-geo.ts:46` IPDATA_API_KEY 缺失仍静默 fail-open**

---

## 七、值得记下的 LOW(挑影响真实的)

- **`clients.ts:123` `getTradingClient` 从永久 Map 降级为 `LRU(4)`,但容量溢出的淘汰路径不调用 `invalidateExchangeClientRequests`** — 第 5 个 agent 地址出现时,最早的 client 被静默淘汰,其排队请求悬挂不决
- **`testing.tsx:36` / `use-sub.test.tsx` 的 mock 每次渲染都新建 `exchangeLifecycle`,与生产的 `useRef` 稳定租约相反** — 而 `request-scheduler.ts:65` 用引用相等判断 generation。本提交最核心的新机制之一在测试夹具下行为与生产相反,**该机制的回归无法被现有测试捕获**
- **`report.ts` 上报载荷丢弃了文件名与 message** — 隐私设计到位,但生产多 chunk + 内容哈希命名下,`asset:31427:912` 这种帧无法映射回源码。上报通道建起来了,可定位性还没闭环
- **`server.ts:26` 上报限流是全进程单一计数器且在校验前消费** — 60 req/min 全站共享,一次坏部署的 chunk_load 风暴会瞬间打满;报文又不含任何用户标识,无法判断 60 条来自 60 个用户还是 1 个
- **`router.tsx:15` 顶层 fallback 挂在 `<html>` 之外**,触发时连 `<head>` 一起卸载,"安全恢复页"在生产完全无样式
- **`cross-tab-nonce-manager.ts` 损坏记录/时钟前跳后无自愈路径**,永久锁死交易(fail-closed 是有意的,有测试断言;缺的是恢复出口和用户可读的报错)
- **`exchange-policy.tsx:75` `ntli` 只匹配 `number`,而 SDK `Integer` schema 接受 `string|number`** — 字符串入参可绕过闸门

---

## 八、被对抗核实推翻的 10 条(说明审查质量)

值得一提的几条,理由都很扎实:

- "注册中途钱包变更 → 会话永久钉在 closing" — 漏看了 `provider.tsx:158-194` 的身份变更清理路径
- "逐仓闸门把降杠杆也挡掉" — 官方 Margining 页明确 "Leverage is only checked upon opening a position",降杠杆不在降风险动作之列,前提错误
- "isolated 模式杠杆控件静默死锁" — `LeverageControl` 在该提交处是死代码,零渲染点,复现路径不可达
- "`getPerpMarginConstraint` legacy 映射错误" — 核实者实测 API,473 个资产中"有 onlyIsolated 无 marginMode"的数量为 0,触发数据形态不存在
- "桥接恢复用 sessionStorage 扛不住关标签页" — 同提交的 `deploy/README.md` 逐字写明了这是有意作用域
- "componentFrames 生产恒为空" — 读 react-dom 源码证伪

---

## 九、方法与置信度

**我亲自实证的部分**(不依赖 agent):
- 拉取 Caddy `headers.go` 源码原文,确认两个 delete 循环与具名字段删除位于 set 之后
- 实测 `https://api.hyperliquid.xyz/info` 主网默认 dex 与 5 个 HIP-3 dex 的 isolated-only 资产分布
- 脚本统计 6 个 catalog 的空 `msgstr`,并逐条确认新增安全警告的翻译状态
- 通读 `error-reporting/{report,client,server}.ts` 全文找泄漏面
- 通读 `cross-tab-nonce-manager.ts` 并对照官方 nonce 规则与 SDK `nonceManager` 契约
- 跑 `pnpm test`(1112 通过)与 `pnpm typecheck`(通过)
- 确认 B6 geo 三处未修、`isolated-risk` 两个 env 模板均为空

**未做**:真机/浏览器 E2E;未在真实 Caddy 实例上抓包验证 XFF 删除(Caddy 未安装,结论基于源码原文推导,但该推导是确定性的);盲区批判的 6 条未经二次对抗核实(其中最重的一条我已用线上 API 独立验证)。
