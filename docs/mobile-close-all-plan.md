# 移动持仓「全部平仓」入口审查与实施说明

状态：已实现，2026-09-21。实施基线：`f924c611`；前期审查基线：`307cc26f`。范围是移动持仓工具栏缺少批量平仓入口，以及接入现有全账户市价链路；不包含真实平仓或发布。实际验证、失败记录和限制见[实施任务记录](work-memory/sessions/2026-09-21-mobile-close-all-implementation.md)。

## 实施前确认的差异

以下保留审查时的观察；移动入口缺失已由本轮修复，当前行为见后文。

1. **入口缺失属实。** [MobilePositionsTab](../apps/terminal/src/components/trade/mobile/mobile-positions-tab.tsx) 的 `renderFilterRow` 只渲染筛选器和 [MobileBulkDisclosureActions](../apps/terminal/src/components/trade/mobile/mobile-bulk-disclosure-actions.tsx)。后者只有展开、收起详情的功能，移动持仓页没有调用 `openCloseAll`。本地浏览器也只显示这两个动作；本次本地账户处于交易未连接状态，有仓位状态的缺口由源码确认。
2. **项目已有可复用实现。** 桌面 [PositionsTab](../apps/terminal/src/components/trade/positions/positions-tab.tsx) 从未筛选的 `positions` 构造全账户快照，经 store 的 `openCloseAll` 打开确认面。[PositionDialogHost](../apps/terminal/src/components/trade/positions/position-dialog-host.tsx) 位于页面层，确认面已经根据 `useIsMobile` 适配移动外壳；缺的是移动入口，不需要再建一条签名或批量发单路径。
3. **官方「全部关闭」确实指批量平仓。** 在已登录的[官方移动终端](https://app.hyperliquid.xyz/trade/HYPE)展开持仓后，「全部展开」变为「全部折叠」，「全部关闭」仍独立存在。先读取当前公开脚本确认该入口仅设置 `confirmCloseAll` 弹窗状态，再打开确认面；它提供市价平仓和中间价限价平仓两种方式，默认市价，并提示关联 TP/SL 的处理。只查看后关闭，没有点击确认。临时展开状态已恢复。
4. **官方筛选范围不能直接套用现有提交器。** 当前公开脚本 `index-58uVNh8f.js` 的移动入口将持仓筛选器作为 `overrideFilter` 传入 `confirmCloseAll`，并按筛选后列表是否为空禁用入口。这是前端接线证据，未通过实际提交验证完整执行范围。gatu 当前入口和提交守卫明确要求全账户持仓集合，不能只把 `filteredPositions` 传入，否则会因集合不一致失败。

上述官方页面行为是本次观察，不是协议保证。公开脚本来自页面资源清单：[主脚本](https://app.hyperliquid.xyz/assets/index-58uVNh8f.js)、[移动工具栏](https://app.hyperliquid.xyz/assets/MobileTableControls-DKgyDKE9.js)；文件名随官方部署变化。

## API 与 SDK 核对

按 [SDK 核对工作流](hyperliquid-sdk-reference.md)查询官方文档、社区 SDK 的当前参考以及本地锁定的 `@nktkas/hyperliquid@0.33.3` 声明。本次未发现可直接调用的独立 `closeAllPositions` exchange action；现有实现使用批量 `order`。

| 核对点 | 协议与现有实现 | 修复时保留的行为 |
| --- | --- | --- |
| 下单字段 | 官方 `order` 接受 `orders[]`；`a` 是资产、`b` 是买入方向、`p` 是价格字符串、`s` 是基础币数量字符串、`r` 是只减仓；普通批量使用 `grouping: "na"` | 多仓卖出、空仓买入；每项 `r: true`，数量来自逐仓快照；金额计算继续使用 Big.js |
| 市价与滑点 | 官方订单说明包含 IOC；nktkas 在线 schema 和本地 `order.d.ts` 都包含 `FrontendMarket`，说明其语义类似 IOC。项目 `marketClose` 已生成 `t.limit.tif: "FrontendMarket"` | 复用当前计划器与用户滑点设置，不为新增入口擅自改成另一种 tif，不把市场价理解成保证全部成交 |
| 批量结果 | `statuses[]` 逐项返回 `filled`、`resting` 或错误等状态；顶层 `status: "ok"` 不代表每笔成功 | 保留部分成功、待对账、剩余仓位检查，不能承诺原子全成或自动重发整个批次 |
| 市场与身份 | 项目提交前按 DEX 刷新 `clearinghouseState` / `metaAndAssetCtxs`，复核资产、精度、方向、数量、保证金模式和 owner/env | 保留全部守卫、HIP-3 接受状态、活跃 TWAP 检查、资产锁及最终执行检查 |
| TP/SL | 官方页面说明会处理关联 TP/SL；官方文档区分仓位 TP/SL 与父订单 TP/SL，生命周期并不相同。gatu 当前全部平仓提交器没有显式撤单步骤 | 不把官方文案复制成现有代码的保证；另行确认各类 TP/SL 的交易所自动处理及是否需要按目标撤单，不扩大为取消账户所有委托 |

来源：[Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)、[订单类型](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/order-types)、[错误响应](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/error-responses)、[TP/SL](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/take-profit-and-stop-loss-orders-tp-sl)、[nktkas order](https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods/order)。本地声明位于 `apps/terminal/node_modules/@nktkas/hyperliquid/esm/api/exchange/_methods/order.d.ts`。协议事实与上述项目实现分别核对，未用 UI 操作推导 API 字段。

## 已采用的方案与边界

本轮提供**当前账户全部永续仓位的市价平仓入口**，包括已加载的默认 DEX 与 builder DEX；沿用桌面现有范围。列表方向、市场、保证金筛选只影响展示。确认面明确说明「包括被筛选隐藏的持仓」，展示实际目标数和按抵押币分组的金额，并展示目标市场及方向，避免只看到一张卡片却关闭多个仓位的误解。开窗后的快照仍冻结；数量、集合或身份变化时按现有守卫失败关闭，不自动扩大目标。

中文入口采用「全部平仓」，与「全部收起」区分；移动入口的可访问名称直接使用可见标签（英文 `Close all`），避免短标签与既有完整译文不同而违反 [Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)。确认面继续沿用 `Close All Positions`。按钮只打开确认面，开窗不签名、不发单。确认后的静态动词、立即收起和右下角结果通知遵循[确认面契约](confirmation-surfaces.md)，后台提交由页面宿主持有，移动页签切换或跨桌面断点不得卸载执行器。

移动持仓工具栏保留现有高度和筛选控件风格。持仓页的展开/收起使用一个切换控件，为最右侧固定的「全部平仓」留出空间；左侧筛选区允许横向滚动，动作区不能被挤出屏幕。该调整只作用于持仓页，其余列表继续保留既有展开/收起行为。沿用现有视觉高度与触控热区规则，检查相邻热区不重叠。

未连接、首份持仓未到达、数据错误/过期、市场映射不全、同账户已有会话时保持禁用；动作标签不变，不能展示被动错误或把未知快照当作空持仓。可用性由布尔状态决定，译文只负责展示。空持仓沿用当前明确空态；筛选后为空但账户仍有持仓时，入口仍按全账户范围判断，确认面必须说明范围。

不增加一键跳过确认，不自动撤销 TWAP，不新增 Agent/授权流程，也不在此入口修复任务里加入中间价批量限价订单。后者需要挂单、撤改单、价格与结果语义的单独设计。

### 备选方案

- **复制桌面入口逻辑到移动文件：不采用。** 两份身份、快照与会话可用性容易漂移；提取共享 action hook 更容易保证行为一致。
- **直接按筛选结果平仓：本轮不采用。** 更接近官方传递筛选器的做法，但现有全账户集合守卫不允许子集，需要明确新的作用范围模型并同时调整双端。不能仅放宽集合比较来让按钮可用。
- **本轮完全复制官方两种平仓模式与 TP/SL 撤销：拆为后续。** 入口缺失的修复可以复用已存在的市价链路；批量限价和撤单引入新的金融动作及结果组合，需独立验收。

## 实施任务与验收

| 顺序 | 修改范围 | 完成标准 |
| --- | --- | --- |
| 1 | 新增共享 `use-position-close-all-action.ts`，迁移桌面入口的快照构造、就绪和同账户会话判断 | 两端使用同一全账户集合；点击时重新构造快照；保持 Big.js 在 domain 中；开窗不进入签名或交易 API |
| 2 | `mobile-positions-tab.tsx`、持仓页展开切换、共享确认面和六语言目录 | 稳定可访问的「全部平仓」入口；筛选不缩小交易范围且确认面明确提示；目标列表与快照一致，抵押币分别汇总；语言热切换保留确认会话与筛选/展开状态 |
| 3 | 入口、store、真实确认控制器和提交器的联合测试 | 覆盖失效数据、身份/网络切换、30 秒快照过期、仓位增减/反向、新旧会话、防重复、TWAP 冲突、多 DEX、部分成交和待对账；网络边缘使用替身，不 mock 掉要验证的业务规则 |
| 4 | 移动浏览器夹具及共享弹窗响应式验收 | 320/375/390/565/1000 px 移动与 1001 px 桌面断点；中文、英文及最长译文；方向/保证金筛选、空结果、详情展开、底部安全区；按钮可见、热区不重叠、无页面横向溢出 |
| 5 | 文档与交付 | 同步确认面/移动展示规范和 CHANGELOG；记录实际通过、失败和未执行项；本地提交，按另行授权决定推送与发布 |

联合测试还要覆盖：点击后确认面立即关闭，异步提交中切到委托/账户页或改变断点，执行器继续更新实时数据，最终只报告一次结果；未发送前发现上下文变化不发单，已发送后的未知状态进入对账。不能只靠「组件在 GlobalModals 中」的源码断言证明该行为。

实施后的检查包括定向 Vitest、Biome、terminal typecheck、Lingui extract/compile；跨共享确认面、移动数据和会话边界后运行完整 terminal 测试，基线失败要单独标明。浏览器夹具使用与 3006 开发服务互不嵌套的独立 Vite 缓存。生产账户的实际提交不属于自动验收。

后续专项：如要求与官方完全一致，先确定按筛选还是全账户的产品语义，再设计作用范围快照与双端一致性；分别验证 `positionTpsl`、固定数量 TP/SL、父订单 OCO、普通委托和部分平仓时的清理规则，最后才考虑明确的取消步骤。测试网验证未完成前不宣称关联委托已全部撤销。

## 提交后的状态反馈：2026-09-21 复审

状态：当前行为已核对，以下队列改进仍为建议，未实施。代码基线为 `8770d86d`；移动入口与桌面共用同一提交器，因此结论同时适用两端。

### 当前项目

- 确认后通过 `isSubmitted` 关闭确认面，控制器保持挂载直到 `submission.submit()` 返回。`usePositionCloseAllSubmit` 有 `validating / submitting / reconciling / partial` 内部阶段，但控制器没有渲染这些阶段，也没有在等待期间创建 loading 通知。
- 项目已有 `OrderToast` 和 `use-order-queue-store`，普通下单先 `addOrder(status: "pending")`，再把 `queueId` 传给 `useTrackedOrder`。全部平仓没有创建 queue item，也没有传递 `queueId`，所以不会进入可见的「订单队列」。资产锁遇到冲突会阻止提交；它不是排队等待执行的 FIFO 队列。
- 全部平仓仍会为批次和子订单生成本地跟踪记录与 cloid。未知结果由 `OrderReconciliation` 结合 `orderUpdates` 和 `orderStatus` 继续核对。后台对账不依赖确认面继续显示，不等于状态已经向用户呈现。
- 提交返回后使用 Sonner 显示成功、部分接受、失败、冲突或待确认通知。默认显示 3 秒；待确认阶段的自动核对窗口最长 2 分钟。没有 `queueId` 时，最终对账另发通用通知，未沿同一批次通知更新，也不列出各市场结果。

因此已确认的体验缺口是：确认面退出后缺少即时反馈；未知结果的提示可能早于后台对账结束消失；部分成功和最终对账信息缺少可持续查看的批次与市场关联。不能描述为「没有订单跟踪」，也不能把既有普通下单队列当作全部平仓已接入的能力。

### 官方对照与证据边界

初次复审只打开并关闭了[官方全部平仓确认面](https://app.hyperliquid.xyz/trade/HYPE)，没有点击最终确认。当时对后续流程的结论依据页面加载的[公开配置脚本](https://app.hyperliquid.xyz/assets/config-DWLPMyx3.js)静态核对；同日后续用户自行操作时的实际通知观察补充在下方：

- `s2` 的确认处理先关闭弹窗，再调用 `i7`，传入 `notifications: "errorsOnly"` 与 `grouping: "na"`。
- `i7` 仅在 `notifications === "all"` 时创建普通下单的 loading toast。全部平仓跳过这一步，因此在这条路径没有发现持续的加载通知或逐仓进度队列。
- 内部按每批最多 50 个订单顺序发送请求并遍历 `statuses`，逐项错误走错误通知；存在成功结果时返回 `kind: "ok"`，外层显示「已提交全部平仓订单」类汇总通知。部分子单错误与汇总成功通知可以并存；这个汇总不证明每个仓位已归零。
- 公开通知封装的成功/错误时长为 6 秒。[主脚本](https://app.hyperliquid.xyz/assets/index-58uVNh8f.js)将普通通知放在移动/平板左上、桌面右下。位置规则来自公开实现，本轮未做双端截图验收。

同日后续监听中，用户确认自行操作「全部关闭 → 确认市价平仓」，代理只观察 DOM。采样记录先出现确认控件，控件消失后约 0.7 秒新增「以市场价格下单以平掉所有仓位。」汇总通知，约 7 秒后该通知节点移除；7 秒包含退出及延迟移除，不能当作精确可见时长。该次确认前已有的普通成交通知短暂与汇总通知并存，不能把它算作本批次的等待或成交阶段。该确认过程没有捕获新增「订单已提交」或持续进度通知，与上述 `errorsOnly` 路径一致。

这是一次实际界面反馈观察，不是逐笔成交、全部仓位归零、TP/SL 清理或多市场部分失败的验证。监听中另有「订单已提交 → 买入/卖出成交」的通用通知序列，仅凭文案不能确定其具体入口或归属。完整观察范围和失败记录见[官方反馈监听记录](work-memory/sessions/2026-09-21-official-trade-feedback-observation.md)。

[Exchange 文档](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)定义订单数组与逐项 `filled / resting / error` 结果，[WebSocket 文档](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions)定义 `orderUpdates`。可见进度属于应用层设计，不能把「已提交」「已被接受」「已成交」「仓位归零」合并成一个成功结论。

### 后续建议与验收条件

建议沿用项目右下角通知与移动安全区契约，为全部平仓加入一个有明确批次身份的可见任务；确认动作仍是静态按钮、点击即退场。优先复用订单队列，扩展其目前只有单市场/单方向的记录模型，支持批次总数与各市场子项；不能把多市场结果塞进现有 `market / side / size` 标量字段。

1. 用户确认后立即建立批次卡片，覆盖校验、提交、交易所待确认和终态；以账户、环境、批次及 cloid 关联子项，保持防重复、快照和资产锁守卫。
2. 请求返回、后台对账和超时更新同一记录。待确认不按普通短通知自动消失；未知结果保留「勿重复提交」及核查途径，不提供自动重发或把网络超时当作拒单。
3. 部分结果逐仓区分成交、未完全成交、拒绝、取消和未知；汇总状态由子项事实派生。声称「全部仓位已平」还须符合当前仓位核对规则，不能只凭接口 `status: "ok"` 或部分订单被接受。
4. 验证真实控制器、队列、跟踪器与全局对账共同挂载时的慢响应、部分成交、超时后晚到确认、切页/切断点、账户/网络切换、刷新恢复及语言切换。现有 close-all 浏览器夹具只挂载 Sonner，没有 `OrderToast` 与 `OrderReconciliation`，不能用其通过结果宣称已覆盖完整队列生命周期。

备选是同一 ID 的持久 loading toast，改动较小，但不足以呈现多市场的部分结果；仅延长现有通知时长仍无法覆盖首次等待或关联后续对账。以上是后续设计建议，本次没有改动交易代码、签名流程、订单参数或执行范围。详见[队列复审记录](work-memory/sessions/2026-09-21-close-all-queue-review.md)。

## 实施与验证入口

- 移动端进入「持仓」，工具栏最右侧为「全部平仓」，左边为单一「全部展开 / 全部收起」切换。`usePositionCloseAllAction` 同时供桌面与移动使用，开窗冻结未筛选的全账户仓位；确认面列出市场、方向、数量并说明筛选范围，金额仍按抵押币分别汇总。
- `position-close-all-action.test.tsx` 验证点击时刻快照、防重复和新旧会话隔离；现有 snapshot、submit、modal 与 ownership 测试保留。浏览器夹具连接真实入口、store、宿主、确认控制器与提交钩子，只替换网络和交易就绪边缘，不接触真实钱包。
- 浏览器命令：`pnpm --dir apps/terminal exec playwright test --config tests/browser/position-close-all.playwright.config.ts`。夹具缓存是 `node_modules/.vite-position-close-all`，与应用和其他夹具互为兄弟目录；已加入分片浏览器 CI，加入配置并不代表远端 CI 已运行。
- [前期审查记录](work-memory/sessions/2026-09-21-mobile-close-all-audit.md)保留当时的规划结论；[实施记录](work-memory/sessions/2026-09-21-mobile-close-all-implementation.md)记录最终版本的检查、实际结果和限制。没有真实订单、撤单、签名或发布，自动浏览器视口检查不等于真机验收。
