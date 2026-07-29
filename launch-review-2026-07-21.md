# gatu 交易终端上线审查报告

- 审查对象:`test-pr102` @ `14f4368a`(领先 `main` 171 个 commit)
- 审查方式:12 个功能维度并行只读审查 → 53 条发现逐条对抗性核实 → 2 路覆盖盲区批判 → 关键项人工复核
- 审查规模:124 个 agent、约 750 万 token、2300 次工具调用
- 结论:**不建议按现状上线。** 有 7 项需要在上线前处理,其中 3 项是直接的资金损失路径。功能完成度本身相当高,问题集中在"失败路径"和"上线后运维能力"两块。

---

## 一、结论摘要

产品的**正常路径**做得扎实:下单、持仓、订单簿、图表、入金、组合页在顺利场景下都能走通,628 个单元测试全绿,部署脚本有原子发布、回滚和资产级健康检查。

问题几乎全部集中在三类:

1. **失败路径没有出口** —— 请求超时、撤单失败、订阅断流、存储写入失败,大量场景要么静默无反馈,要么把"不确定"当成"失败"报给用户。在交易产品里,"不确定"被误报为"失败"会诱导用户重试,而重试没有幂等保护。
2. **上线后没有眼睛也没有刹车** —— 全仓零错误上报、零告警、零埋点、无 kill switch。出事既发现不了,也停不下来。
3. **对外承诺与实现不一致** —— Terms 列了缅甸但代码没封;营销站宣称 MIT 开源但仓库私有且无 LICENSE 文件;隐私政策比条款早 18 个月且法域冲突。

---

## 二、上线拦截项(建议全部处理后再上线)

### B1. 下单超时被判为"失败",且全仓无 cloid 幂等 → 重复开仓

**[已人工验证]** `apps/terminal/src/hooks/trade/use-order-submit.ts:169`

SDK 的 HTTP transport 默认 10 秒超时(`packages/hl-react/src/clients.ts:33` 从未设置 timeout)。超时抛出 `HttpRequestError`,但请求已经发出,交易所很可能已经受理并成交。`use-order-submit` 的 catch 分支不加区分地把订单标为 `status: "failed"`。

同时全仓生产代码**没有任何 `cloid`(client order id)** —— grep 全仓只在两个测试 fixture 里出现 `cloid: null`。因此用户重试时没有任何幂等保护,交易所会当作全新订单接受。

行情剧烈波动或移动网络抖动时(正是最容易触发 10s 超时的场景),一笔已成交的市价单显示为"失败",用户重新点击 → 持仓翻倍。

对照:入金链路在 `lib/errors/format.ts` 里专门写了"Check your wallet activity before retrying to avoid sending the deposit twice"这类提示,说明团队清楚这个模式,但下单链路完全没有。

### B2. 全仓零错误边界 + 零错误上报 → 白屏且无人知晓

**[已人工验证]** `apps/terminal/src/routes/__root.tsx`

`grep -r "ErrorBoundary|errorComponent|componentDidCatch|getDerivedStateFromError"` 在 `apps/terminal/src` 与 `packages/*/src` 中**零命中**。根路由只有 `notFoundComponent`,没有 `errorComponent`;`router.tsx` 也没有 `defaultErrorComponent`。全仓没有 `window.onerror` / `unhandledrejection` 全局钩子。

任意一个组件渲染期抛错(某个 Hyperliquid 字段为 null、格式化函数越界)→ 用户白屏,而且团队零感知。对一个持仓可被强平的杠杆产品,用户可能在有仓位的状态下失去界面。

### B3. 零可观测性 + 无 kill switch → 出事发现不了也停不下来

**[已人工验证部署配置]** `deploy/README.md`、`deploy/gatu.service`

- sentry / datadog / bugsnag / rollbar / posthog 全仓零命中
- 无 `/health`、无 `/version` 端点
- 日志只进 journald 和 Caddy 本地文件(`roll_keep 5`),无外送、无告警
- 部署健康检查只在发布那一刻跑一次,之后无周期性探测
- `deploy/README.md` 给出的全部运维手段是人工敲 `journalctl -u gatu -f`

同时 feature flag / kill switch / maintenance mode 全仓零命中。运行期变量只有 `PORT` / `HOST` / `IPDATA_API_KEY`,没有一个能影响业务行为。要临时关掉下单或桥接,唯一路径是改代码 → push → 在 EC2 上跑一次 8GB heap 的完整构建 → 重启。

故障发现完全依赖用户邮件到 `support@gatu.ai`,而该邮箱的目标首次响应是 1-2 个工作日。MTTD 以小时到天计。 

- [ ] ### B4. Transfer / Send 的可用余额算法错误,同屏两个数字打架


**[已人工验证]** `apps/terminal/src/components/trade/positions/transfer-modal.tsx:62`、`send-modal.tsx:111`

两个弹窗用 `getPerpAvailable(accountValue, totalMarginUsed)` 计算可转出金额,而 `useDefaultDexBalances()` 已经返回了 API 的 `withdrawable` 字段,两处都没有解构它。

`domain/trade/balances.ts:353-357` 的注释**自己写明了这个算法是错的**:

> The API's withdrawable already accounts for margin held by open orders, which totalMarginUsed (position margin only) does not. Transfers are additionally floored at 10% of open notional...

而 `balances-tab.tsx:84` 走的是正确的 `getPerpBalanceRows(..., withdrawable)`。所以同一屏上 Balances 表的 "Available" 和点开 Transfer 后的 "Available" 是两个不同的数字。有挂单或 >10x 杠杆仓位的用户(即多数活跃用户)点 Max 必然被 L1 拒绝。

`TransferModal` 经 `global-modals.tsx:56` 全局挂载,portfolio 页、移动端账户页、account-panel、deposit-modal 都是入口,影响面覆盖桌面+移动端所有转账路径。

另:`toPerp` 方向用 `getSpotAvailable(..., spotAvailableAfterMaintenance)`,而 `balances.ts:196-199` 的注释同样指出 maintenance 值是"距离清算的距离",不是能转出去的量。

### B5. 手机同步二维码等价于明文的 30 天交易凭据,UI 却称之为 "secure"

`apps/terminal/src/lib/mobile-sync/sync-core.ts:426`、`components/trade/components/mobile-agent-sync-modal.tsx:322`

生成的链接形如 `.../mobile-agent-sync#ht-mobile-sync=<AES-GCM密文>&k=<base64url(32字节密钥)>` —— **密钥和密文在同一个 fragment 里**,一起编码进同一个 QR。AES-GCM 在这里只提供完整性,对任何拿到 QR 或链接的人零机密性。这串字符本身就是一份 30 天的 bearer 凭据,持有者可以对该账户下单、撤单、改杠杆。

而 UI 文案是 "Create secure phone access",会让用户以为二维码被拍到也安全,从而在投屏、直播、录屏、肩窥场景毫无戒备。QR 用 `errorCorrectionLevel "L"` + `width 320`,远处摄像头也能还原。

配套的 "Copy phone link" 按钮把这串凭据直接写进系统剪贴板(会同步到 iCloud 通用剪贴板 / Windows 云剪贴板 / Gboard 剪贴板历史),无警示文案,无超时清空。用户很自然会复制后用微信/Telegram 发给自己手机,凭据因此进入第三方服务器。

### B6. 合规:受限用户仍可正常交易和转移资金

三条独立缺口,叠加后 geo 封锁在产品层面基本形同虚设:

- **多个交易入口未封锁**(`positions/` 目录 `useGeoRestriction` 零命中):Balances 每行的 Send 按钮(等效提现)、Swap 按钮(真实下单)、To Spot/To Perp 转账、持仓的 TP/SL 修改、Reverse(开反向双倍仓,是实质新开仓)全部不受限。同一页面一边显示"Deposits and withdrawals are not allowed"一边提供 Send 按钮。
- **邮箱用户入金完全不检查 geo**(`embedded-deposit-auto-bridge.tsx`):该组件在 `providers/root.tsx:99` 无条件挂载,全文件无 geo import。邮箱登录用户的 embedded 钱包一旦收到 ≥5 USDC 就自动签 permit 存入 bridge2。而普通钱包用户的入金按钮是被封的。
- **缅甸未封锁**:`config/geo.ts:9` 的文件头注释写着"Keep this in sync with Restricted Persons in the Terms of Use (§2.2)",但已发布的 `legal/terms.md:96` 明列 Myanmar,`TRADE_RESTRICTED_COUNTRIES` 里没有 `MM`。这是"条款声称阻断、实现未阻断"这种最难辩解的形态。乌克兰被占领区(克里米亚/顿涅茨克/卢甘斯克)同样没有任何 region 映射。

另外:geo 判定期间(server fn 往返 + ipdata 外部 API,数百毫秒到数秒)`tradeRestricted` 恒为 `false`,`isResolving` 在 5 个消费方中零使用,存在首屏放行窗口;`retry: 1` 用尽后同样永久放行。

> 关于"纯客户端 + fail-open"本身:这是已知的设计决策,但上线前需要合规方明确签字接受。当前状态下,受限用户只需用 adblock 屏蔽 `getGeo` 这一个请求即全量解锁。

### B7. agent 交易私钥明文存 localStorage,且登出不清除

`packages/hl-react/src/signing/agent-storage.ts:70`、`hooks/wallet/use-wallet-session.ts:111`

私钥以明文 JSON 写入 `hyperliquid_agent_<env>_<address>`。桌面注册路径不传 metadata,因此没有 `agentValidUntilMs`,本地过期检查恒为 false —— 凭据在浏览器里永久留存。

`useDisconnectWallet` 只调用 `clearActiveAgentOwner()` 和 Privy `logout()`,**从不调用 `clearAgent()`**。用户点"断开连接"后私钥依然在 localStorage 里。共享电脑、二手设备、或一次 XSS 都能直接取走这把可以下单/撤单/改杠杆的钥匙。

附带一条同文件的问题:`writeAgentToStorage` 用 `catch { }` 吞掉全部异常(Safari 无痕、iOS 隐私模式、配额满都会抛 `QuotaExceededError`)且返回 void,而两个调用点都在其后无条件进入成功态。用户已经在钱包里签了 `approveBuilderFee` + `approveAgent`(链上已授权、已消耗 agent 槽位),前端却什么都没存下,形成"签名成功但永远无法交易"的死循环;手机端还会明确显示 "Phone access ready" 的**虚假成功提示**,而草稿此时已被清除,用户连重试的凭据都没有。

---

## 三、工程流程问题(上线前应修,成本低)

### `pnpm typecheck` 当前是失败的

**[已人工验证]** 唯一一个错误在 `apps/terminal/src/lib/tests/l1-agent-signing.test.ts:48`。

根因:`pnpm-lock.yaml` 里 `viem@2.42.1` 有**五条不同的解析记录**(跨 typescript 5.7.2/5.9.3 与 zod 3.22.4/3.25.76/4.3.4)。terminal 和 `packages/hl-react` 各自解析到不同的 viem 实例,类型结构相同但名义不同,导致 `createL1AgentWallet(account)` 类型不兼容。根 `package.json` 只声明了 typescript 5.7.2,5.9.3 是被某个包作为 optional peer 拖进来的。

因为 lockfile 是提交进仓库的,CI 的 `pnpm install --frozen-lockfile` 会原样复现。运行时是好的(该测试本身通过),纯类型层问题。

### CI 挡不住任何东西

- `.github/workflows/` 只有 4 个:两个 AI 评审、一个 i18n catalog 新鲜度、一个 typecheck
- **没有任何 workflow 跑 `pnpm test`** —— 102 个测试文件、628 个用例从不在 CI 执行
- **没有任何 workflow 跑 `pnpm build`** —— 而 build 包含 `lingui compile`、8GB heap 的 vite build、以及 `check-client-chunk-cycles.mjs` 循环依赖检查,这些只在部署机上第一次跑,失败会直接卡在生产部署环节
- 所有 workflow 都只在 `pull_request` 触发,而这 171 个 commit 是直接推到 `test-pr102` 的,**从没走过 PR,等于全程无门禁**
- lefthook 的 pre-commit 只跑 biome
- i18n 检查只验证 catalog 有没有重新提取,**不验证 `msgstr` 是否为空** —— 这正好解释了下面那条

### 5 个语言各有 22-23 条未翻译

`apps/terminal/src/locales/{zh,es,fr,hi,ar}/messages.po`

全部集中在近期新增功能:(1) 存款失败指引(如 "Bridge2 deposit was not credited. Check Arbiscan before retrying.");(2) mobile-agent-sync 手机导入整个流程;(3) 若干导航 aria-label。

存款失败恰恰是资金最敏感的时刻,"先查 Arbiscan 再重试、避免重复充值"这类关键指引对非英文用户显示英文,看不懂的用户可能直接重试导致重复充值。

### `main` 落后 171 个 commit

要上线的代码全在 `test-pr102` 上,`main` 领先 0 个。`deploy/README.md` 的迁移示例写的也是 `deploy.sh test-pr102`。

---

## 四、对外可信度问题(上线首日就会被发现)

### 营销站宣称 MIT 开源,但仓库私有且无 LICENSE 文件

**[已人工验证]** `find . -iname "LICENSE*"` 排除 node_modules 后**返回空**。

而 `apps/website` 把"开源"当核心信任卖点,至少 5 处:
- `Footer.astro:114` 徽标 "MIT LICENSED"
- `Footer.astro:54` "Read it, fork it, run it yourself"
- `Trust.astro:14` 信任三支柱之一是 "Open source — The client that signs your trades is code you can read, audit, fork, and run yourself"
- `Hero.astro:19/26/53` 三处
- `faq.ts:4` 用"keeping the terminal open-source and free to run"正当化 builder fee 收费

而实际仓库是私有的,营销站和终端都没有一个指向代码仓库的链接。

"代码可审计"是说服用户把签名权交给一个匿名前端的核心论据,这个论据当前完全无法兑现。MIT 徽标还是一个明确的法律陈述。

### /docs 是占位骨架,直接对用户展示

`legal/docs.md` 经 `routes/docs.tsx` 原样渲染成 `app.gatu.ai/docs`。"Table of Contents"整节 22 个条目(Connecting a Wallet、Placing Orders、TWAP Orders、Security Model、Fees……)`href` 全部是 `#`。第 72 行还有一句写给作者自己的内部备注直接展示给用户:

> The sections below are placeholders for more detailed documentation. Replace each link as your docs expand.

Support 页会把遇阻的用户引导到 Docs,而这里自助支持路径实际为零。

### 社交分享卡片全部损坏

`lib/seo.ts:69` 的默认 `ogImage` 硬编码为 `https://app.gatu.ai/og-image.png`,但该文件在 `apps/terminal/public/` 和已构建的 `.output/public/` 中都不存在,也没有任何运行时生成逻辑。对照:营销站的 `og.png` 是真实存在的,说明是终端侧单独漏掉。

`twitter:card` 设为 `summary_large_image` 更放大了这个缺陷。另 `config/seo.ts:9` 的 `twitter:site` 仍是旧品牌 `@hypeterminal`。

### 法务文档相互矛盾

- **隐私政策比条款早 18 个月**:`privacyPolicy.md` 的 Last Updated 是 2025-01-26,Terms 是 2026-07-20;隐私政策第 96 行称适用巴拿马法,而 Terms §13.3 约定英格兰及威尔士法 + LCIA 仲裁
- **隐私政策已披露使用 Mixpanel**,但全仓零埋点代码
- **风险披露页从未上线**:50 倍杠杆衍生品产品没有可访问的 Risk Disclosure
- **营销站对地域限制只字不提**,FAQ 反而承诺"连上任意钱包就能交易"
- **联系方式不一致**:营销站用 `hi@gatu.ai`,全部法律文档用 `support@gatu.ai`
- `legal/` 目录下还有三份标注 DRAFT 的草案(`restricted-territories.md` 把加拿大全国+英国列为受限、`permitted-regions.md` 把日本列为目标市场),与已上线的 Terms 互相矛盾,未被任何路由引用但极易成为后续维护的错误依据

### CSP 文档与实现矛盾

`deploy/Caddyfile` 的注释和 `deploy/README.md:222` 都说"CSP 有意默认不设",但 `apps/terminal/src/config/security-headers.ts:70-71` 实际下发了 CSP,且 `script-src` 含 `'unsafe-inline'`(即 CSP 的 XSS 防护基本被抵消)。两处描述不一致会误导后续加固工作。

---

## 五、功能缺口与数据准确性(不拦截上线,但用户会立刻发现)

### 静默失败集中区:TWAP

`positions/twap-tab.tsx` 与 `mobile/mobile-twap-tab.tsx` 两端一致地存在两个问题:
- **撤单失败完全静默**:`useExchange("twapCancel")` 只解构了 `mutate` 和 `isPending`,没有 `onError`,也没有渲染 mutation 的 error。用户点 Cancel 后按钮闪一下恢复,TWAP 依然在跑,用户会以为已撤销。对照组:`orders-tab.tsx` 有内联红字,`positions-tab.tsx` 有 `toast.error`
- **订阅错误态未处理**:状态被简化成 `twapStatesEvent ? "active" : "loading"`,WS 出错时永久停在 "Loading TWAP orders...",既看不到在跑的 TWAP 也无法撤销

同目录的 `orders-tab` / `history-tab` / `funding-tab` / `orders-history-tab` 都正确处理了 `status === "error"`,只有 TWAP 漏了。

### 撤单在 assetId 解析不到时静默 no-op

`orders-tab.tsx:102` 的 `handleCancel` 把解析不到 assetId 的订单静默丢弃,全部解析不到时直接 return,点击完全无反应。两个现实触发场景:openOrders 走 WS 通常比元数据的 HTTP 请求先到;`use-markets.tsx:42` 对 `isDelisted` 资产 `continue` 跳过,导致已下架市场上的挂单**永远无法在本终端撤销**。"Cancel all"场景下部分订单被悄悄跳过,用户会以为全撤完了。

### 金额格式化:核心数字被压缩

`config/app.ts` 的 `FORMAT_COMPACT_DEFAULT = true` + 阈值 10000,导致所有未显式传 `{ compact: false }` 的 `formatUSD` 在 ≥ $10,000 时压缩。受影响的是最核心的数字:账户面板的 Portfolio Value / Maintenance Margin / Unrealized PNL、订单摘要的 Order Value / Margin Required。

而且因为 defaults 里仍带着 `minimumFractionDigits/maximumFractionDigits = 2`,实际输出是 `$150.00K` 而不是 `format.ts` 自己 JSDoc 里写的 `$150K` —— 说明这条路径从未被实测过。5 万美元权益的用户在账户面板只能看到 `$50.00K`。

### Portfolio 页数值问题

- **加载中/失败/未连接时显示 `$0.00` 而非占位符**:持仓用户在 API 抖动时会看到总资产 $0.00 长达最多 60 秒,极易被误认为资金丢失
- **只统计默认 dex**:HIP-3 builder dex 上的永续权益被漏算,与交易页数值对不上
- **统一账户模式下 Total ≠ Perps + Spot**:`domain/portfolio.ts:107` 在共享保证金模式只返回 spot 权益,但页面同时渲染非零的 Perps Account Equity 行

### 订单簿与图表

- **Spread 硬编码 2 位小数**:`orderbook-panel.tsx:183` 用 `formatNumber(spread, 2)`,任何小于 0.005 的 spread 都显示 `0.00`。除 BTC/ETH 外绝大多数币种该栏位完全失效(移动端 `mobile-book-view.tsx:266` 同样)
- **成交历史外链指向 Arbiscan**:桌面和移动端的 history-tab 都 import 了 `@/lib/explorer` 版本的 `getExplorerTxUrl`(默认 arbitrum),把 Hyperliquid L1 的 `fill.hash` 拼到 Arbiscan 上,必然 404。而订单簿的 `trade-row.tsx` 用的是正确的 `@/lib/hyperliquid` 版本
- **KLine 图表整套是死代码**:`grep KlineChart` 除定义文件外无结果,`chart-panel.tsx` 只渲染 TradingView。这意味着已实现好的挂单线、持仓入场线、爆仓价线全部不可达,TradingView 路径没有等价实现 —— 线上图表看不到持仓成本线和挂单价位线
- **订单簿最细档比官方粗 10 倍**:只支持 `nSigFigs` 2/3/4/5,不支持 `null`(完整精度)。BTC 在 10 万美元以上时官方是 $1 粒度,本产品最细 $10

### 下单校验

- **Scale 部分成功被整体报失败**:HL 对 orders 数组逐单处理可部分成功,但 SDK 只要有一条 error 就抛异常,catch 把整个队列项标 failed。其余档位实际已挂出,用户重试会重复挂单
- **Scale 每档数量向下取整且不分配余量**:szDecimals=0 的市场,size=7/levels=4 实际只下 4(缩水 43%),无任何提示;极端时生成 `s: "0"` 被全部拒绝
- **Scale 最小名义只用平均价校验**:start=10/end=30 时平均名义刚好过线,但价格 10 那档只有 $5,会被交易所拒 —— 这正是最容易触发上一条的路径
- **Spot 的 Scale/TWAP 完全没有专用校验**:可带空价格提交;TWAP 设 1 分钟被 `clampInt` 静默改成 5 分钟运行
- **触发单被强制 reduce-only**:无法用 Stop/TP 开仓(与 HL 官方前端能力不一致),且无仓位时本地不拦截,提交后才报交易所错误
- **USD 模式沿用 szDecimals 小数限制**:szDecimals=0 的市场切到 USD 模式后无法输入小数金额,用百分比按钮填充后输入框对逐字符编辑完全无响应

### 入金/桥接

- **LiFi 失败后 Try Again 从头重放整条路由**:`convertQuoteToRoute` 生成全新路由,不是 resume。若失败发生在源链交易已上链之后,重试会再转出一遍资金
- **执行中可关弹窗**:`reset()` 清空执行锁但没有 `stopRouteExecution`,旧路由回调继续 setState 复活状态,可并发第二笔桥接;关掉整个弹窗后执行仍在后台跑,签名弹窗会凭空出现
- **钱包 60 秒未返回 hash 即报错并给 Retry**:WalletConnect 移动端切 app 场景极常见,首笔若已广播会双重入金
- **报价过期后仍可确认**:倒计时到 0 不禁用按钮,刷新失败因 `quoteError && !quote` 恒为 false 被完全吞掉
- **无最小额校验**:不前置提示 HL 的 5 USDC 最低入金,用户输 $1 只会看到笼统的 "No route available"

### 移动端

- **无法创建 TWAP / Scale 订单**:`hideAlgoOrders` 把这两种类型从选择器滤掉,但移动端有 TWAP 管理 tab(只能查看/取消)。若是刻意分期,建议在发布说明中写明
- **成交历史买卖方向判错**:用 `fill.dir.startsWith("Open Long")` 判定,现货的 `"Buy"`/`"Sell"` 和反手的 `"Long > Short"` 全部落空。桌面端用的是正确的 `fill.side === "B"`
- **sonner toast 覆盖底部导航**:自定义 OrderToast 已抬高并有测试保障,但 sonner Toaster 仍是 `position="bottom-right"` 且未配 `mobileOffset`。平仓/反手的 toast 会压住底部导航约 3 秒 —— 这是"toast 被底部导航遮挡"问题在第二套 toast 系统上的残留
- **限价平仓弹窗输入框缺 mobileSafe**:最近两个 commit 修了下单表单、TP/SL、swap、市场搜索,但 `position-limit-close-modal.tsx` 的 PriceInput/NumberInput 漏了,`mobile-input-zoom-contract.test` 也没覆盖这个文件

### 阿拉伯语 RTL

`lib/i18n.ts:39` 切到 ar 时会设 `<html dir="rtl">`,但全仓(含 packages/ui)`rtl:` variant 零处、逻辑属性(`ms-/me-/ps-/pe-`)零处,却有 23 处物理 `ml-/mr-` 和 21 处 `left-/right-` 绝对定位,两个 CSS 文件均无 `[dir=rtl]` 规则。结果是布局整体镜像但间距、绝对定位元素、图表(locale 固定 en)未跟随的混合界面。交易终端信息密度高,半翻转布局可能导致买卖方向、数字列错位误读。

---

## 六、其他值得知道的

- **SSR 服务端会常驻一条到 Hyperliquid 的 WebSocket**(`packages/hl-react/src/provider.tsx:79`),与 `deploy/README.md` 声称"行情 WebSocket 不经过本机、服务端负载很轻"矛盾
- **无 429 / 限流处理**:QueryClient 全默认配置,被限流时会放大请求
- **SDK 对同一钱包的 exchange 请求串行加锁**,单个 10s 超时会阻塞后续所有撤单/平仓 —— 在需要紧急平仓时是危险的
- **多标签页**:zustand persist 无跨标签同步,任一标签写设置会把 mainnet/testnet 选择覆盖回旧值
- **WS 超限载荷生产环境静默丢弃**:`useSub` 的告警被 `import.meta.env.DEV` 包裹,生产构建剔除。`webData3` 不在 `perMethodMaxBytes` 表内,回落到 256KB 默认上限,而尺寸估算按 UTF-16 计(×2),等效阈值仅约 128KB 真实 JSON。持仓/挂单多的账户很容易越线,面板会长期停在过期数据上且无提示
- **`h3@2.0.0-beta.4`** 生产运行时依赖存在 middleware bypass 漏洞(pnpm audit 全仓 92 条告警,1 critical / 35 high)
- **全部路由 `ssr: false`** + 根组件被 `ClientOnly` 包裹,服务端只输出骨架屏。交易终端这样做合理,但 `/terms`、`/privacy` 是纯静态 markdown,对不执行 JS 的抓取方(合规审核脚本、监管存档工具、链接预览服务)是空白页
- **每页两个冲突的 canonical**:根路由和子路由各产出一个,而 TanStack Router 的 links 只按整条 JSON 全等去重,两个 href 不同的 canonical 会同时渲染
- **无效交易对返回 200 可索引页面**:`/trade/FAKECOIN` 有正常 SEO meta、自引用 canonical、无 noindex,客户端再静默重定向到 BTC。市场名是大小写敏感精确匹配,所以 `/trade/eth` 也算无效 —— 用户想看 ETH 会被悄悄丢到 BTC
- **无 sitemap.xml**,robots.txt 全量放行且不声明 Sitemap
- **`APP_VERSION` 是从未改动的硬编码 `v0.1.0`**,没有构建元数据端点,线上跑的是哪个 commit 无从判断
- **首屏入口 chunk 1.11MB gzip**,无体积预算门禁,`perf:compare` 脚本因缺少基线永远失效
- **PWA manifest 把交易终端锁死为竖屏**
- **`apps/website` 完全不在任何 CI 覆盖范围内**

---

## 七、做得好的部分(不要动)

审查过程中确认质量不错、不建议在上线压力下改动的部分:

- **部署链路**:原子 release 切换、明确的回滚路径、健康检查会实拉 hashed asset 并在失败时自动回滚、新 release 携带上一版 hashed chunk 避免老客户端 404。这套设计明显是踩过坑之后写的
- **测试资产**:102 个文件 / 628 个用例全绿,包含 order-toast 位置、mobile 输入缩放契约等专门写来防回归的测试。问题只是它们没接进 CI
- **permit 签名实现**:deadline(20 分钟)、nonce 链上实时读取、`FailedPermitDeposit` 回执校验,审查 agent 明确表示实现良好未发现问题
- **WS 重连链路**:SDK `maxRetries=Infinity` 自动重订 + TradingView 侧 `subscribeWsReconnect → resetRealtimeCache`,未发现重复订阅或泄漏
- **HIP-3 免责声明持久化**:zod 校验、版本号支持强制重签、损坏数据回退为未接受(方向安全)
- **Service Worker**:只拦截 charting_library / 字体 / 图标,从不缓存文档和 `/assets/*`,配合 Caddy 的 `must-revalidate` 解决了 WebKit 热缓存下 TradingView 初始化卡死的问题,还有测试锁定这个策略
- **i18n 基础设施**:`t` 宏均为惰性求值无模块级冻结,语言竞态切换有 `activationSeq` 防护,占位符 `{x}` 在全部 5 种语言零错配

---

## 八、方法与置信度说明

- **第一轮**(9 个维度、101 条发现):每条 medium 以上的发现都经过一个独立的对抗性核实 agent 复查(要求它尽力反驳)。53 条中 **50 条 confirmed、2 条 refuted、1 条 uncertain**。核实过程把大量 medium 降级为 low,报告中的严重级别已采用核实后的判定。
  - 被推翻的 2 条:"JP 在 Terms 中未列出"(实际 Terms 有对应表述)、"保证金/杠杆 hook 的硬编码英文错误直接渲染"(实际有格式化层拦截)
- **第二轮**(3 个维度 + 2 路盲区批判、77 条发现):因第一轮耗尽额度后补跑,**未经对抗核实**。其中我人工逐条复核了拦截项 B1/B2/B4 和第四节的 LICENSE、CSP 两条,均属实。其余条目请以"高置信度但未经二次核实"看待
- **我亲自执行并验证的**:`pnpm test`(628 通过)、`pnpm typecheck`(1 个错误,已定位到 lockfile 重复解析)、CI workflow 内容、分支与 main 的差异、部署配置、LICENSE 缺失、CSP 实际下发内容、错误边界 grep、cloid grep
- **未做**:真机/浏览器实测。所有结论基于源码静态分析。RTL 实际观感、语言热切换残留、移动端触控体验等需要真机验证的项,置信度相应下调
