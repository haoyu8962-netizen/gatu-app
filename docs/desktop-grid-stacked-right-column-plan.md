# 桌面 md 断点右列堆叠计划：订单簿位于下单面板下方

日期：2026-09-17。状态：**已实施**（产品负责人 2026-09-17 确认，选 55 行方案；决策见 [ADR 0011](adr/0011-desktop-md-stacked-right-column.md)，验证见[任务记录](work-memory/sessions/2026-09-17-desktop-md-stacked-right-column.md)）。基线代码：`dc275f7c`（分支 `claude/placeholder-parity`）。范围：桌面网格 md 断点（容器宽 1001–1420 px，14 列）的默认几何、边界规则、持久化与回归套件。lg 断点（>1420 px，16 列）与移动端（≤1000 px）不在范围内。

本计划是[桌面网格布局](desktop-grid-layout.md)与 AGENTS.md 桌面布局契约的修改提案；实施时以 ADR 记录取舍，并同步更新上述文档。原契约（任何桌面宽度下三列同时可见）已被 ADR 0011 取代为按断点描述。

## 1. 目标与非目标

- 目标：md 断点下右列改为官方式纵向堆叠——下单面板在上、订单簿在下、账户信息再下；图表列放宽到 10/14；账户表位于图表列下方。
- 非目标：不改 lg 几何、断点常量、移动端、启动渲染、订阅/签名/数据守卫；不引入官方的自定义拖拽布局或订单簿 Large 模式；不把断点依据从容器宽度改为窗口宽度。

## 2. 官方参考（2026-09-17 实测）

从 `app.hyperliquid.xyz/trade/BTC` 的 React fiber 读取 `Responsive` 属性：`breakpoints {lg: 1420, md: 1000, xs: 480, xxs: 0}`，`cols {lg: 16, md: 14}`，`margin [3, 3]`，`rowHeight 30`；宽度取 `window.innerWidth`（把网格容器强制压到 1300 px 而窗口保持 1600 时仍用 lg）。react-grid-layout 以 `width > breakpoint` 选断点：冷加载二分 1420 用 md、1421 用 lg，实时 resize 同样切换。

md 布局（14 列）：

| 面板 | x | y | w | h |
| --- | --- | --- | --- | --- |
| favoriteCoins / coinInfo / chart | 0 | 0 / 1.3 / 3.3 | 10 | 1.3 / 2 / 17.3 |
| tradingInterface | 10 | 0 | 4 | 20.6 |
| marketData | 10 | 20.6 | 4 | 20.4 |
| accountTable | 0 | 20.6 | 10 | 10 |
| accountInfo | 10 | 41 | 4 | 10 |

像素实测：1316 px 时图表列 935、右列 372、下单面板 677 px、订单簿 670 px、账户表/账户信息各 327 px，网格 1686 px；1421 px 起为 lg 三列（chart 10 | marketData 3 | tradingInterface 3）。官方另有订单簿显示模式 Tab / Stacked / Large（`extended`）会切换到另一套布局，且自定义布局按断点持久化到 `hyperliquid.layouts.4`；这两项本计划不复制。

我们当前（生产构建同宽度冷加载）：断点常量与官方一致，但 md 默认为 8 / 3 / 3 三列并排（1316 px：图表 747 | 订单簿 279 | 下单 278，账户表 1029 + 账户信息 278），这是[桌面网格布局](desktop-grid-layout.md)明文规定的现行契约。

## 3. 新的 md 默认几何（14 列）

| 面板 | x | y | w | h | 说明 |
| --- | --- | --- | --- | --- | --- |
| favoriteCoins / coinInfo | 0 | 0 / 1.3 | 10 | 1.3 / 1.4 | 高度不变 |
| chart | 0 | 2.7 | 10 | 17.9 | 底边 20.6，与现行相同 |
| tradingInterface | 10 | 0 | 4 | 20.6 | 677 px，与官方及[订单表单审计](order-entry-layout-audit.md)一致 |
| accountTable | 0 | 20.6 | 10 | 14 | 去掉 `minW/maxW 11` 固定宽，随列边界 |
| marketData | 10 | 20.6 | 4 | 20.4 | 670 px，与 lg 订单簿同高 |
| accountInfo | 10 | 41 | 4 | 14 | `minH` 仍由内容测量决定 |

网格总高 55 行（1818 px），页面纵向滚动，与官方 51 行同量级。备选：订单簿 h14 与账户表共底边、账户信息从 34.6 行开始（总高 48.6 行），少显示约四档盘口；不采用，记入 ADR 备选。

## 4. 代码改动

### 4.1 `apps/terminal/src/config/desktop-grid-layout.ts`

- 对齐规则按拓扑分支。lg 沿用"上层共底边、下层共顶底边"。md 改为"两列"：唯一跨列共享边界 A = 图表列底边 = 下单面板底边 = 账户表顶边 = 订单簿顶边；右列内部依次贴合（`accountInfo.y` = 订单簿底边）；`accountInfo` 的内容 `minH` 只作用于自身，不再抬高账户表。拓扑由 `cols`（14 / 16）判定：react-grid-layout 2.2.3 的 `Compactor.compact(layout, cols)` 已传入 `cols`，`alignDesktopGridLayout` 增加 `cols` 参数后，compact、restore、resize 三条路径共用同一判定。
- `resizeDesktopGridLayout` 的 md 分支：宽度手柄（chart e/se、marketData w/sw、tradingInterface w、accountInfo w）只移动一条列边界，左列四个面板 `w = 边界`，右列三个面板 `x = 边界`；边界范围由 `minW` 约束（右列 ≥ 3，左列 ≥ 7）。高度手柄：chart s/se 改变 A（下单面板同步）；favoriteCoins/coinInfo 的高度变化沿用现有的 `boundary = max(下单面板底边, chart.y + chart.minH)` 逻辑；marketData s 只改订单簿高度；账户表保持 `resizeHandles: []`。
- 存储键 `trade-desktop-grid-layout-v11 → v12`：迁移时保留合法的 lg 几何，md 一律回到新默认（拓扑已变，旧 md 几何不可复用）；v11 进入清理列表，更旧版本直接丢弃；设置里的重置路径不变。restore 后仍执行对齐与碰撞检查，旧拓扑的 md 存储被拒绝并回退默认。

### 4.2 `components/trade/layout/use-desktop-grid-layout.ts` 与 `main-workspace.tsx`

`desktopGridCompactor.compact` 把库传入的 `cols` 转给对齐函数；网格键名不变，`main-workspace.tsx` 预计无需改动。

### 4.3 单元测试

- `lib/tests/desktop-grid-layout.test.ts`：重写 md 用例——堆叠几何、A 边界、`accountInfo` 内容增长只影响自身、列边界联动、高度手柄、v11→v12 迁移、旧拓扑存储被拒绝；"keeps market data and trading beside the chart at both desktop breakpoints"改为只断言 lg；"uses an eleven-three lower row beneath the compact desktop workspace"与"resets a previously narrowed compact account table to the fixed column width"按新几何重写；md 账户表随账户信息增高到 21.31 行的断言改为账户表不变。
- `lib/tests/grid-content-height.test.tsx` 只观测 `accountInfo` 的内容高度，不断言账户表几何，预计无需改动。

## 5. 契约与文档

- AGENTS.md 桌面布局契约第三条按断点描述：lg 三列共边不变；md 两列，图表与下单面板共底边，订单簿与账户信息在右列纵向堆叠。
- [桌面网格布局](desktop-grid-layout.md)：默认跨度段、Shared boundaries、Height ownership、持久化 v12 迁移、验证宽度；删除"Sairn retains its documented three-column desktop contract"。
- 新增 ADR 0011（背景、约束、决策、备选、后果、验证）；CHANGELOG；任务记录；[订单表单审计](order-entry-layout-audit.md)与[订单簿布局](orderbook-layout.md)补充 md 面板宽度区间；本计划状态改为已实施并链接 ADR。

## 6. 对其他功能的影响与核对点

- 订单簿：md 宽度从 211–301 px 变为 282–402 px，`orderbook-panel` 容器查询里 ≤279 px 的紧凑档在 md 不再出现；高度 670 px 与 lg 相同；桌面订单簿仍是默认 `l2Book` 完整盘，feed 选择不变。
- 下单面板：宽度 282–402 px，窗口约 1260 px 以上会离开 `trade-panel` ≤22.25rem 的紧凑标签档，属容器驱动的既有行为；高度 677 px 不变，八种订单类型仍需在 1001 / 1400 / 1420 px 无内部滚动。
- 账户表：从 11 列变 10 列，需核对 1001 px（约 710 px 宽）下列表的横向滚动与列可见性。账户信息移到右列底部，需要滚动才可见，与官方相同。
- 页面高度约 1818 px，`DesktopTerminalFrameView` 的 `min-h-dvh` 纵向滚动与固定页眉页脚已在 lg 900 px 视口下存在，无新机制。
- 启动、chrome、market header、订阅、签名与数据守卫不触碰；包体只有配置常量变化，预算不受影响。

## 7. 浏览器套件更新

- `tests/browser/desktop-grid-layout.pw.ts`：`expectAligned` 按宽度分支，≤1420 断言 A 边界、订单簿与账户表顶边、`accountInfo` 贴合订单簿底边、无碰撞；拖拽用例补 md 的 chart s 与 marketData w/s。
- `tests/browser/account-actions.pw.ts`：1001 / 1363 的配对边界改为与订单簿配对。
- `tests/browser/desktop-order-entry-layout.pw.ts`：1001 / 1400 / 1420 的面板几何快照更新，保留"无内部滚动、CTA 与费用可达"断言。实施结果：该套件在运行时捕获几何并与自身比较，无需改动，7/7 直接通过。
- `tests/browser/orderbook-level-pulse.pw.ts`："medium desktop"与"desktop breakpoint"夹具宽度按新的 md 网格项宽度重取（1238 px 约 350、1001 px 约 282）；现有 240 / 280 本身不是精确网格项宽度（对应 262 / 308），实施时以夹具实测为准。

## 8. 验证顺序

1. 单测组：desktop-grid-layout、grid-content-height、trade-terminal-page-boot、order-entry 组；`pnpm --filter @sairn/terminal typecheck`；Biome。
2. 浏览器：desktop-grid-layout、desktop-order-entry-layout、trade-panel-layout、orderbook-layout 与 account-actions 五套在 1001 / 1280 / 1363 / 1420 / 1421 / 1545 px 全绿。
3. 生产构建后冷加载 1001 / 1238 / 1316 / 1420 / 1421 / 1440 px，对照官方数字（1316 px：图表列 935、右列 372、下单面板 677、订单簿 y 683）；复跑 `tests/browser/boot-milestones.mjs` 与市场头抖动测量确认启动无回归。
4. 全量 Vitest 与既有基线红比对，build 预算，memory 索引检查，一次提交。

实施顺序：ADR 与文档草案 → 配置与单测 → 浏览器套件 → 构建实测 → 文档定稿与提交。工作量约一个工作日；配置与单测可派 Codex 执行，浏览器套件、实测与对抗审查由主会话负责。
