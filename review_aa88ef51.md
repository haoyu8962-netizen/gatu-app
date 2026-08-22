# 对抗式审查报告(第三轮):aa88ef51 `fix(sdk): complete hyperliquid 0.33 compatibility`

> 方法:6 维独立 finder(SDK 语义 / 类型重写 / 运行时回归 / 遗漏扫描 / transport-monitor / 测试判别力)→ 每条发现 2 名独立反驳者多数决。本轮验证手段:双份独立 tsc 探针实测、npm 0.31.0 实包下载对照、**mainnet WSS 只读订阅实测**、官方文档 MCP 检索、valibot 1.2.0 序列化实测。64 agent,23 条 CONFIRMED / 5 条 PLAUSIBLE / 1 条 REFUTED,去重后 5 个独立问题 + 6 个小项。

## 评分

| Commit | 评分 | 一句话结论 |
|---|---|---|
| `aa88ef51` fix(sdk): complete 0.33 compatibility | **7 / 10** | Node 22.12 工程基线三处同步与 failureSignal→onError 测试迁移扎实(soak 的 delete-before-call 精确模拟 SDK "报错即自移除"语义);coverage 扫描零残留。扣分:`ExchangeParams` 重写误伤唯一重载方法(潜伏 P1)、outcome-market 余额被静默丢弃、`ignorePortfolioMargin: false` 空操作分支、类型断言防线在 CI 中不生效 |

## 行动项(按优先级)

1. **[A/P1] 修 `ExchangeParams` 重载退化**:恢复重载双签名匹配分支(解析 `P | undefined`)置于首位,其余保留新的元组推导以保住 noop 收紧;同时补两条类型断言:`ExchangeParams<"claimRewards"> = undefined`(opts-only)与 `ScheduleCancelParameters` matchable(重载)。
2. **[B/P2] 删除 `ignorePortfolioMargin` 条件展开**,恒传 `{ user: address ?? "0x0" }`。该分支是服务端空操作,唯一实际效果是 PM 解析后触发无谓退订/重订并可致 `Already subscribed` 竞态。
3. **[C/P2] outcome-market 余额**:估值/展示路径(`getSpotBalanceRows`/`getSpotUsdValue`/`getSpotAccountValue`)保留完整 union,仅在真正需要 `token: number` 的路径(send/transfer 元数据、tokenToAvailableAfterMaintenance 查找)做 `isTokenSpotBalance` 窄化;若产品决定不支持 outcome,须显式声明数据截断。
4. **[D/P2] CI 接入类型检查**:加 `typecheck: tsc --noEmit` script 并进 workflow,或启用 vitest `test.typecheck` 把类型断言移入 `*.test-d.ts`——否则第 1 项的防回归断言仍是摆设。
5. **[E/P3] 清理 `RawSpotState`** 手工扩展与 `as RawSpotState` 断言(0.33 SDK 原生已含 `tokenToAvailableAfterMaintenance` 等字段,本地版本还把元组首元素放宽为 `number | string` 与 SDK 分叉)。

⚠️ **部署提醒(非本提交缺陷)**:本提交将 engines.node 提到 >=22.12.0(SDK 0.33 ESM-only 的硬要求)。**下次部署前必须确认生产 EC2 的 Node ≥ 22.12**,否则 SSR 加载 SDK 直接崩。

## 确认的问题

### A [P1][CONFIRMED] `packages/hl-react/src/types/clients.ts:36` — ExchangeParams 重写使 scheduleCancel 参数类型退化为 undefined

新写法 `Parameters<F> extends [infer P, ...unknown[]] ? P : undefined` 依赖 TS 的 `Parameters<>`,它对重载函数**只取最后一个重载**。`scheduleCancel` 是 ExchangeClient 唯一的重载方法(`(params?: ScheduleCancelParameters, opts?)` / `(opts?)`),末重载可选元组 `[opts?]` 最小长度 0,不满足 `[infer P, ...unknown[]]` → 解析为恰好 `undefined`。

**验证**:两名反驳者各自独立写 tsc 探针(TS 5.9.3 + SDK 0.33.1)实测:旧定义在 0.33.1 下解析出 `ScheduleCancelParameters | undefined`(退化确由本提交引入);新定义下 `@ts-expect-error` 探针证实传 `{ time: 123 }` 被类型系统拒绝。`useExchange.ts:12-13` 以 `ExchangeParams<M>` 作 mutation variables,运行时 `fn.call(exchange, params)` 本可传参 → dead-man's-switch 的 time 参数从此无法通过类型层传入。全仓 grep 无现有调用点(潜伏,触发时是响亮的编译错而非静默错误,故 P1 不升 P0)。

**同时证实重写动机真实**:旧定义会把 `order` 等所有必填参方法放宽为 `P | undefined`,且旧 noop 实为 `NoopParameters | undefined`,无法通过本提交新增的 `expectTypeOf<undefined>().not.toMatchTypeOf<NoopParams>()` 断言——重写有正当理由,只是误伤了唯一的重载方法。修复须两全。

### B [P2][CONFIRMED] `apps/terminal/src/hooks/trade/use-account-balances.ts:139` — ignorePortfolioMargin: false 是服务端空操作,附带 Already subscribed 竞态

证据链(四路独立验证):
- **0.31 实包**(npm 下载对照):`spotState()` 实现逐字为 `v.parse(SpotStateRequest, { type: "spotState", user: params.user })` —— **只转发 user 字段**,旧代码 `isPortfolioMargin: true` 从未上送;valibot 默认值注入使 0.31 wire 恒为 `{type, user, ignorePortfolioMargin: false}`。即 6b6742f3 的 PM 分支自引入起就是死的,本提交无 wire 回归。
- **0.33.1 schema**:`ignorePortfolioMargin: v.optional(v.boolean())` 无默认;显式 false 与缺省在服务端语义等价。
- **mainnet WSS 只读实测**:订阅 `{type:"spotState",user}` 的 ack 被服务端规范化为 `{...,"ignorePortfolioMargin":false}`(默认即 false);再显式订阅 `ignorePortfolioMargin:false` 返回 `Already subscribed`(同一 channel);订阅旧字段 `isPortfolioMargin:true` 同样 `Already subscribed` —— 服务端直接丢弃未知字段。
- **官方文档分歧**:docs 页仍写 `isPortfolioMargin`(可选参数),与 SDK 字段名 `ignorePortfolioMargin` 不一致;实测表明 docs 已过时。
- **竞态**:初始 `{user}` 订阅 pending 时 accountAbstraction 解析为 PM → key 变化(serializeKey=JSON.stringify)→ store 对 pending 订阅延迟退订而新 key 立即 subscribe → 服务端对同一规范化 channel 回 `Already subscribed` → spotStatus 短暂 error,靠重连退避自愈。

若产品语义本意是 PM 账户"排除组合保证金计算",正确开关是 `ignorePortfolioMargin: true`——需产品确认;按"保持 0.31 实际行为"标准,答案就是不传。

### C [P2][CONFIRMED] `use-account-balances.ts:152` — filter(isTokenSpotBalance) 静默丢弃 outcome-market 余额

SDK 0.33 `balances` 为 union,第二形态是预测市场持仓 `{ coin: "+${number}", total, hold, entryNtl }`(无 token 字段)。下游估值与展示只需要 `coin/total/hold/entryNtl`(`getSpotBalanceRows` 355-383、`getSpotUsdValue` 61-70 以 entryNtl 兜底、`getSpotAvailableValue` 229-241 有 total−hold 兜底)—— outcome 条目在旧 `as` 断言下能正常渲染并计入账户价值;filter 后整条消失,**持有 outcome 仓位的账户总值被静默低估**。两种失败模式中,静默丢资金数据(新)比显示原始 '+N' 标签(旧)更糟。guard 本身的类型安全意图正确,问题在应用面过宽。

### D [P2][CONFIRMED] `apps/terminal/src/lib/tests/hyperliquid-types.test.ts:70` — 本提交强化的类型断言防线实际不生效

`expectTypeOf` 断言只在 tsc 编译或 `vitest --typecheck` 下生效;本仓库 vitest 配置无 typecheck、package.json 无 typecheck script、三个 CI workflow 均不跑 tsc —— 断言在 esbuild 转换时被类型擦除,**写反了也照样通过**(实测 17 tests passed)。这正是问题 A 没被本文件既有 `toMatchTypeOf<ExchangeParams<"cancel">>` 系列断言拦住的原因。另:noop 新用例顶替了原"无参方法→undefined"用例,opts-only(`claimRewards`)与重载(`scheduleCancel`)失去覆盖。

### E [P2→P3][CONFIRMED] `use-account-balances.ts:15` — RawSpotState 手工扩展未随"补全兼容"清理

`esm/api/info/_methods/spotClearinghouseState.d.ts` 原生声明 `tokenToAvailableAfterMaintenance?: [token: number, amount: string][]`(还含 `portfolioMarginEnabled?`、`portfolioMarginRatio?`),本地交叉扩展与 `as RawSpotState` 断言已冗余,且本地版本把元组首元素放宽为 `number | string` 与 SDK 分叉。违反 hyperliquid.md "No wrapper types - use SDK types directly"。四个维度的 finder 独立发现此项。

## 小项(P3,择要)

- **F5(type-rewrite)**:同文件三种映射类型写法并存;`InfoParams<"exchangeStatus">` 在旧双重载模式下解析出 `AbortSignal | undefined`(tsc 探针实证,既有问题非本提交引入)。统一为"元组 + 可选参数白名单"时注意 `InfoClient.allMids` 也是重载,不能照搬裸元组写法。
- **TM-1**:FakeSocket.reconnect 模拟(readyState=2 + 同步 close)与真实 rews v4 不符——rews readyState getter 只可能返回 0/1/3(重连期恒报 CONNECTING),close 事件由 _runLoop 异步派发。当前监控只做 `!== OPEN` 比较故测试结论未失真,但建议模拟置 0 并用 queueMicrotask 派发 close。
- **TM-3(改进建议)**:rews v4 `reconnect()` 在退避睡眠中调用会 skip-delay 立即重连;transport-monitor 的 OPEN-only 守卫使 visibility/network 恢复无法利用这一点(休眠唤醒恢复延迟最多 30s)。放宽守卫至排除终止态(readyState===3)可显著加速前台恢复,需配套调整 reconnectRequested 复位并补测试。
- **TM-2**:reconnect() 无参调用在 rews v4 下不抛错,try/catch 近乎不可达(沿袭代码非本提交引入,无害);若保留注意 catch 只回滚 reconnectRequested 未回滚 disconnectedAfterOpen 的不对称。

## 存疑项(单票反驳,不列为缺陷)

- **useMemo 包 filter**:一票认定违反 code-style.md 的 React Compiler 条款,另一票用同文件 hl-react Subscriptions 节 "Only memoize array transformations, not trivial calculations" 反驳——spotBalances 正是订阅数据的数组变换,属该更具体条款明确批准的场景。**判定:可辩护,不要求修改**。
- **engines 无 pnpm 约束**:反驳者指出 pnpm 10 默认 `manage-package-manager-versions` 会按 packageManager 字段自动切换版本,核心风险不成立;补 `engines.pnpm` 仍可作为纵深防御(pnpm 对 engines.pnpm 不匹配是硬失败)。

## 做得好的(保持)

- **Node 22.12 基线三处同步**(CI/README/engines)是 SDK 0.33 ESM-only 的关键运维项,上一提交 8b8f87d4 遗漏、本提交补上。CI 侧核实无遗漏:pnpm/action-setup@v4 读 packageManager 字段,其余 workflow 不装 Node,无 Dockerfile/.nvmrc 残留。
- 五个测试文件 failureSignal→onError 迁移干净;websocket-soak 的 "先 delete 再调 onError" 精确模拟 SDK "报错即自移除"语义;unsubscribe 闭包用 `failureCallbacks.get(key) === onError` 防误删新回调,细节到位。
- transport-monitor close()→reconnect() 接口+实现+测试三处同步,与 rews v4 对齐。
- 修正了 `isPortfolioMargin` 这个自 0.31 起就从未上送的无效字段(尽管新写法仍是空操作,类型层至少合法了)。
- coverage 扫描零残留:全仓无 failureSignal / isPortfolioMargin / node 20 引用遗漏。
