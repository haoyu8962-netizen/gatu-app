# 交易终端审查修复与官方依据

## 范围与执行顺序

针对 `969c4c4a..3bd11b32` 的审查，先明确状态和订阅契约，再修复测试环境、账户限制、持仓错误展示、订单簿分组隔离和翻译依赖，最后完成生产包体积及全量回归。保留签名、资金可用性、首快照、新鲜度、减少动态效果和网格几何保护。规范维护使用具名设计令牌与 `type(scope): subject`，不改写历史提交。

## 结论与修复范围

- 三项 P1 成立：修复前完整构建超总包上限 1,217 gzip 字节；原七项单测失败可复现（其中触控目标源码断言为既有失败）；资金限制把未解析和已确认不支持合成同一个静默原因。
- 包体积通过完整提取后清理六语废弃翻译解决，保留全部现用翻译和动态 descriptor，不调整预算。测试修复使用类型化局部 mock、显式媒体查询环境和真实渲染断言，不通过关闭动效或放宽断言规避问题。
- 账户模式按官方语义拆分。原审查把全部 `unknown` 归为“已确认不支持”不够准确：本项目还用它表示来源冲突，因此继续静默并禁用；已确认 `default` / `dexAbstraction` 保留限制说明。
- P2 同时修复公共订单簿分组串流、桌面持仓错误被加载状态遮挡、TWAP 翻译隐式依赖，补齐分组缓存行为测试并去除两处嵌套三元。全局翻译默认参数违反本项目契约，但不能仅凭这一行认定当前每次热切语言都失败；回归覆盖保持挂载的真实表单及移动终端。
- 规范维护补齐订单簿令牌目录、测试文档入口和提交 scope 校验；展示维护修复桌面成交错误被意外静默、邮箱存款禁用时仍要求打开存款、断连概览说明仅存在于 title 的问题。历史提交不改写；`aria-busy` 已允许表达加载，未将缺少可选 sr-only 文案认定为阻塞缺陷，也未重复添加已有的平仓忙碌状态。

## 官方与固定版本依据（2026-09-09 核对）

- [Hyperliquid WebSocket subscriptions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions)：请求包含 `nSigFigs`、`mantissa`、`fast`；`WsBook` 数据不携带分组身份。退订应发送原订阅参数，但该页没有承诺退订 ACK 是旧帧全部排空的边界。
- [SDK 0.33.3 l2Book](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/api/subscription/_methods/l2Book.ts)：回调按 coin 过滤，分组参数没有参与事件过滤。参数和十进制字符串仍由原 SDK 处理，不依赖更新版本的未验证行为。
- [SDK 0.33.3 subscription manager](https://github.com/nktkas/hyperliquid/blob/v0.33.3/src/transport/websocket/_subscriptionManager.ts)：同请求共享订阅，退订移除监听器并等待服务端确认。有效的新监听器仍可能收到同通道的另一分组数据；UI generation 不能证明帧的分组。
- [SDK 0.33.3 transports](https://github.com/nktkas/hyperliquid/blob/v0.33.3/docs/transports.md)：支持独立 WebSocketTransport、自动重连及 `resubscribe: false`。后者在连接中断时通过订阅失败通道通知，由应用现有重试生命周期重新订阅。
- [官方限额](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)：每 IP 最多 10 个 WebSocket、每分钟 30 次新连接。应用自身必须控制连接池，不能为每行、每消费者或每次切换无限建连。
- 账户状态及 React/Lingui/Vitest 的具体依据分别记录在移动数据、语言展示及测试修复文档。
- 原七项红测的归因、类型约束 mock 和媒体查询环境要求见[测试修复记录](terminal-test-regression-repair.md)。
- TWAP 字段、安全门禁和触发语义的既有回归入口见 [TWAP 回归测试](twap-regression-tests.md)。

## 分组隔离方案

这是根据协议缺少帧身份作出的应用设计，不是声称官方推荐某一种连接池实现。

- 公共 `l2Book` 使用不可改变分组身份的专用 transport；身份为 network、nSigFigs、mantissa、fast。同身份的币种和消费者共享连接；不同身份永不复用同一物理流。
- 其他订阅、交易/账户连接、二十档增量 `l2` 和 SDK 请求解析保持原路径。原 coin/fast 过滤仍保留。
- 连接池跨网络最多四个 transport；空闲连接保留一分钟以支持 A→B→A，再关闭。需要新身份时只能回收空闲连接，不得驱逐有消费者的流。
- 新建专用连接每分钟最多二十四次，为共享连接留出余量；限制只控制本页面，不能假装协调同 IP 的其他客户端。额度不足时走现有失败/重试流程，数据保持不可交互，不用旧分组充当新数据。
- 专用 transport 禁用 SDK 自动重连与重新订阅，由应用的错误/重试流程重新获取当前快照；这使失败后的新连接也经过同一建连限额。失败流立即失效并关闭，其消费者通过 SDK 失败通知恢复，不把已终止的 transport 留给重试。普通 AbortSignal 取消仅释放自己的租约。关闭、首次订阅失败、主动取消、异步退订失败必须释放租约；失败回调最多一次。空闲回收关闭 SDK transport，避免遗留自动重连。
- 不依赖固定等待时长、忽略首帧、价格整除或新 UI key 判断旧帧。首个有效快照仍静默，原始价格和数量保持字符串。

## 验收

展示维护范围：桌面最近成交保留本地化的读取失败状态，手机两个订单簿入口继续静默，不显示原始网络错误。邮箱存款不可操作时不显示“打开 Deposit”指令。断连概览的禁用原因通过可聚焦禁用按钮与关联读屏说明提供，不新增被动警告横条。

确定性回归覆盖分组并发、A→B→A、首订阅尚未确认即取消、失败与重连、同身份共享、空闲回收、连接/建连限额；旧流不得进入新状态、缓存、选价或动效基线。组件测试覆盖分组缓存和恢复。账户入口覆盖未确认、明确不支持、冲突、恢复与禁用点击；语言切换保持组件和输入。

依次运行相关 Vitest、终端全量单测、hl-react/terminal TypeScript、Biome、受影响桌面/移动浏览器回归及固定构建输入的完整生产构建。总包预算须真实通过；不为绿灯直接提高阈值。记录最终测量和仍存在的环境限制。

## 最终验证（2026-09-09）

- 完整生产 `pnpm build` 通过，使用性能基线文档的固定构建标识和 Node 22.15.0。总客户端 gzip 为 3,106,750 字节，比现有基线少 47,957 字节；总包、静态启动、手机/桌面增量启动预算及 378 个 chunk 的循环依赖检查全部通过。六语现用翻译完整保留，预算没有改动，详见[性能基线](terminal-performance-baseline.md)。
- `pnpm --dir apps/terminal exec vitest run --maxWorkers=2 --reporter=dot` 最终退出码 0：499 文件通过、1 文件跳过；4,957 用例通过、1 用例跳过、0 失败。唯一跳过为已有的 `websocket-soak.test.ts` 长时间稳定性测试，需 `WS_SOAK_RUN=true` 显式运行；没有新增 skip 或放宽超时。
- 根 `pnpm test` 的其余环节分别执行：`pnpm og:check` 通过，网站 3 项和跨应用品牌 2 项通过。终端全量按上述 worker 限制单独运行，不把这些分步验证写成执行过一次完整根脚本。
- `pnpm typecheck` 覆盖 hl-react、UI、terminal，全通过。47 个变更源码/测试文件通过 Biome；配置文件及 src 目录外滑点测试通过相同配置的 stdin 检查与格式输出一致性比较。`git diff --check` 通过，commitlint 接受带 scope 的消息并拒绝缺少 scope 的消息。
- Chromium 的 `orderbook-level-pulse`、`orderbook-layout`、`trade-panel-all-orders` 共 46 项：首次 45 项通过、1 项在等待页面导航时超时；代码稳定后独立复跑该数量渐变用例通过。没有放宽测试或修改动效来处理这次超时。
- 实际本地终端核对 1661×1265 桌面和 390×844 手机视口的深浅主题；桌面切换价格分组后收到新分组行情，图表实例保持；移动 TWAP 中英往返后输入节点和值保留，最高价标签及时更新，无启动错误页。未连接钱包的禁用控件保持禁用，未发送资金或交易请求。移动检查使用浏览器视口，不声称进行了真机验收。

确定性测试负责故障注入与跨分组隔离；实时浏览器观察用于检查真实 SDK 连通、显示与交互，不以短时观察替代长期稳定性测试。3006 开发服务器保留运行，测试 fixture 和独立调试浏览器已退出。
