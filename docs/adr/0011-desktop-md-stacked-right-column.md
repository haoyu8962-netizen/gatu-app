# ADR 0011：桌面 md 断点右列纵向堆叠

- 状态：已接受（产品负责人，2026-09-17）；实施与验证记录见[任务记录](../work-memory/sessions/2026-09-17-desktop-md-stacked-right-column.md)。
- 来源：[桌面 md 断点右列堆叠计划](../desktop-grid-stacked-right-column-plan.md)。
- 修改：[桌面网格布局](../desktop-grid-layout.md)的默认跨度与共享边界；AGENTS.md 桌面布局契约第三条。

## 背景与约束

桌面网格在容器宽 1001–1420 px（md，14 列）沿用 `8 / 3 / 3` 三列并排：1316 px 时图表 747、订单簿 279、下单面板 278 px。官方终端同宽度用 `10 / 4` 两列：图表列 935 px，右列 372 px 内下单面板（677 px）在上、订单簿（670 px）在下、账户信息再下，账户表在图表列下方。官方实测数据来自 2026-09-17 对 `app.hyperliquid.xyz/trade/BTC` 的 React fiber 读取（`breakpoints {lg: 1420, md: 1000}`、`cols {lg: 16, md: 14}`、`margin [3, 3]`、`rowHeight 30`），见计划文档第 2 节。

约束：lg（>1420 px，16 列）几何、断点常量（容器宽度判定）、移动端（≤1000 px）、启动渲染、订阅、签名与数据守卫不变；不复制官方的自定义拖拽布局、订单簿 Large 模式和按断点持久化的自定义布局。

## 决策

1. md 默认几何改为两列：favoriteCoins / coinInfo / chart 占 `x 0, w 10`，chart 底边 20.6 行；tradingInterface `x 10, y 0, w 4, h 20.6`；marketData `x 10, y 20.6, w 4, h 20.4`；accountTable `x 0, y 20.6, w 10, h 14`，去掉 `minW/maxW 11` 固定宽；accountInfo `x 10, y 41, w 4, h 14`。网格总高 55 行（1818 px），页面纵向滚动。
2. 对齐规则按拓扑分支，拓扑由 `cols`（14 / 16）判定，react-grid-layout 2.2.3 的 `Compactor.compact(layout, cols)` 已传入 `cols`。lg 沿用"上层共底边、下层共顶底边"。md 只有一条跨列共享边界 A：图表列底边 = 下单面板底边 = 账户表顶边 = 订单簿顶边；右列内部依次贴合（accountInfo.y = 订单簿底边）；accountInfo 的内容 `minH` 只作用于自身，不再抬高账户表。compact、restore、resize 三条路径共用同一判定。
3. md 手柄：宽度手柄只移动一条列边界，左列四个面板 `w = 边界`，右列三个面板 `x = 边界`，范围由 `minW` 约束（右列 ≥ 3，左列 ≥ 7）。chart s/se 改变 A（下单面板同步）；favoriteCoins/coinInfo 高度变化沿用 `boundary = max(下单面板底边, chart.y + chart.minH)`；marketData s 只改订单簿高度；账户表保持 `resizeHandles: []`。
4. 存储键 `trade-desktop-grid-layout-v11 → v12`。迁移保留合法的 lg 几何；md 因拓扑已变一律回到新默认。v11 进入清理列表，更旧版本直接丢弃；设置里的重置路径不变。restore 后仍执行对齐与碰撞检查，旧拓扑的 md 存储被拒绝并回退默认。

## 备选方案

- 订单簿 h 14 与账户表共底边、账户信息从 34.6 行开始（总高 48.6 行）：少显示约四档盘口，且右列两个共享边界会把账户表高度重新和账户信息耦合；否决，产品负责人 2026-09-17 选择 55 行。
- 保留三列并排、仅放宽右两列：1001 px 下每列不足 220 px，订单簿仍落在 ≤279 px 紧凑档，下单面板仍需紧凑标签；与官方差距不变；否决。
- 以窗口宽度而非容器宽度选断点以完全复制官方：改变现有契约与浏览器套件基线，与本次目标无关；否决。

## 后果

- md 订单簿宽度从 211–301 px 变为 282–402 px，高度 670 px 与 lg 相同；`orderbook-panel` 容器查询 ≤279 px 档在 md 不再出现。下单面板宽度同样变为 282–402 px，高度 677 px 不变，八种订单类型仍需在 1001 / 1400 / 1420 px 无内部滚动。
- 账户表从 11 列变 10 列（1001 px 约 710 px 宽）；账户信息移到右列底部，需要滚动才可见，与官方相同。
- 现有 md 用户几何在升级后回到默认；lg 几何保留。
- "任何桌面宽度下三列同时可见"的契约被本 ADR 取代为按断点描述。

## 验证

单测：`desktop-grid-layout.test.ts`（堆叠几何、A 边界、accountInfo 内容增长只影响自身、列边界联动、高度手柄、v11→v12 迁移、旧拓扑存储被拒绝）、`grid-content-height.test.tsx`、`trade-terminal-page-boot.test.tsx`、order-entry 组；typecheck；Biome。浏览器：desktop-grid-layout、account-actions、desktop-order-entry-layout、trade-panel-layout、orderbook-layout 与 orderbook-level-pulse 套件在 1001 / 1280 / 1363 / 1420 / 1421 / 1545 px。生产构建冷加载 1001 / 1316 / 1420 / 1421 px 对照官方数字。实际结果记录在任务记录中，本 ADR 不宣称已执行。
