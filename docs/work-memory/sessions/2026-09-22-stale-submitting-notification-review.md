<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-22-stale-submitting-notification-review",
  "date": "2026-09-22",
  "title": "单次提交产生重复及残留进度通知审查",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "真实 Chrome 页面确认同一任务出现不同 Sonner 展示 ID，队列清空后旧 pending 卡片仍残留；StrictMode 诊断复现短暂重复，长期残留的精确调度时序尚未稳定复现。本轮仅审查与记录，未修改生产代码。",
  "thread": {
    "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507",
    "title": "启动开发服务器"
  },
  "baseCommit": "15b0d1c83df19d6490bb2f3012296f4c69954108",
  "commits": [],
  "sources": [
    { "path": "docs/trading-notifications.md" },
    { "path": "apps/terminal/src/components/trade/order-notification-host.tsx" },
    { "path": "apps/terminal/src/components/trade/order-notification-gate.tsx" },
    { "path": "apps/terminal/src/client-hydrate.tsx" },
    { "path": "apps/terminal/tests/browser/notifications.fixture.tsx" },
    { "url": "https://react.dev/reference/react/StrictMode" },
    { "url": "https://raw.githubusercontent.com/emilkowalski/sonner/v2.0.7/src/index.tsx" },
    { "url": "https://raw.githubusercontent.com/emilkowalski/sonner/v2.0.7/src/state.ts" },
    { "url": "https://github.com/emilkowalski/sonner/issues/322" }
  ],
  "supersedes": []
}
-->
# 单次提交产生重复及残留进度通知审查

状态：审查结论已验证；修复未实施。验证基线为上述提交，分支 `codex/reviewceshi`，开始时工作区干净。

## 背景与范围

用户提供两张同市场、方向、数量和价格的通知截图，一张「正在提交」、一张「已成交」，要求 review 原因；随后明确只提交了一次，提交中一直保留。截图来源是本次用户附件 `截屏2026-09-22 11.03.59.png`，未把包含账户交易细节的图片加入 Git。

本次读取代码、锁定的 Sonner 2.0.7、官方资料及用户 Chrome 页面现存通知，并用无签名、无交易请求的临时夹具诊断。没有执行新交易、签名、刷新或关闭用户页面的通知；未修改生产实现、依赖或通知时长。

## 结论与依据

### P2：重复展示实例可能留下脱离队列的永久 pending 卡片

实际页面只有一个 `[data-sonner-toaster]`，不是两个容器各显示一次。只读 Sonner 历史中，与用户截图市场、方向、数量和价格匹配的同一逻辑任务分别有序号 6、7 的展示 ID：旧项 pending / Infinity，新项 success / 5000。后来的一笔任务也有序号 8、9 的同样分裂。

读取后来任务时，OrderQueue 与 `toast.getToasts()` 均为空，页面却仍显示序号 8 的 pending 卡片，且 `data-removed="false"`。React 组件检查中通知 Host 已卸载，旧卡片仍由全局 Toaster 持有并渲染最初的 pending props。截图对应任务的卡片当时已不在 DOM，不能把后来任务的 DOM 当成原截图的直接持续录像；但两者历史均证明同一逻辑任务产生两个展示 ID。

代码链路：

1. `client-hydrate.tsx:16` 的根 StrictMode 在开发模式额外执行 effect setup / cleanup / setup；React 官方文档说明这是用于检验清理是否正确的开发行为。
2. `order-notification-host.tsx:68-75` 在 cleanup 中清空 `displayed`，并异步调用 Sonner dismiss。下次 setup 在第 46 行无法复用旧展示 ID，分配新 ID。StrictMode 诊断已观察到同任务两张 DOM 卡片；新实例接收后续成功，旧实例保留提交快照。
3. 第 57 行把当次 `order` 快照传给 custom 内容；`OrderNotification` 第 21-24 行只核对账户与环境，不订阅当前逻辑任务或核对当前展示身份。旧卡片一旦未从 Sonner DOM 移除，即使任务结束、队列清空，仍可继续显示旧 pending。
4. 第 16 行的 pending / confirming 为 Infinity，因此旧卡片没有自动超时兜底。三秒设置属于结果状态，无法消除已经脱离任务更新的 pending。旧卡片的自定义关闭只按逻辑 ID 调用 queue dismiss，队列已无该 ID 时也不能据此清除孤立的 Sonner 展示。

Sonner 2.0.7 的 observer dismissal 经 `requestAnimationFrame` 发布，Toaster 对 dismissal 另经 RAF 更新本地状态，而新增/更新通过 `setTimeout` 与 `flushSync` 排队；`getToasts()` 则按 observer 的 dismissed 集合过滤。因此 observer 已标记关闭不等于 DOM 已退出。现有页面确认二者已分离，但没有捕获问题发生当时的全部调度轨迹，不能把某个 timer/RAF 先后顺序或热更新直接断言为本次唯一触发原因。

上游 [StrictMode 重复通知报告 #322](https://github.com/emilkowalski/sonner/issues/322) 提供相近 effect 创建/cleanup dismiss 案例，只作为交叉证据，不能替代本项目实测。另查到 [#592](https://github.com/emilkowalski/sonner/issues/592) 与合入主线的 [#777](https://github.com/emilkowalski/sonner/pull/777) 涉及异步 dismiss 后重建竞态；本轮未核实对应发布版本，也未验证升级是否能解决本例。

### 验证缺口

既有 `notifications.fixture.tsx` 直接挂载 Host，不包含根 StrictMode 与实际按需挂载 Gate；因此之前布局/堆叠测试通过，不能覆盖本次出现的 effect 重放、卸载后再挂载路径。业务队列是一项与页面呈现是一项必须分别断言，单看 store 数量不足以发现此缺陷。

## 验证与限制

2026-09-22（Asia/Shanghai），生产代码保持基线不变，仅加临时诊断文件：

- `pnpm --dir apps/terminal exec vitest run src/lib/tests/notification-duplicate-review.test.tsx`：首轮基本路径 1 项通过；后续矩阵 4 项通过。真实 Sonner、真实 queue、Gate、根 StrictMode，结果分别延迟 0 / 100 / 1000ms，另含不启用 StrictMode 的对照。StrictMode 下曾同时出现 success 和旧 pending（旧项 `data-removed=true`），再推进时间后正确移除。**未复现永久残留，不能以通过结果否认真实页面缺陷。**
- 临时浏览器夹具使用独立 `.vite-notifications-review` 缓存和端口 4194，复用既有 Hyperliquid mock，仅改为 StrictMode + Gate，并增加合成结果按钮。IAB 与 Chrome 基础更新正常；Chrome 在首次任务结束后再次挂载 Host 时读到两张提交卡，后续旧卡消失。仍未稳定复现永久残留。
- 实际 Chrome 页面只读检查，确认单容器、同任务两展示 ID、活跃队列为空而旧 DOM 仍在。没有据此验证交易所执行次数或成交账本；证据足以解释 UI 重复，不应把两张通知等同于重复下单。
- 临时诊断源码及脱敏日志已移入 Git 忽略的 `.worklog/2026-09-22/01a0c3b4-5aec-7f93-bc8b-6ecf0e661507/notification-duplicate-review/`，不作为正式回归或原始会话全文。`browser-evidence.redacted.json` 明确为人工整理的观察摘要，账户和实际交易参数省略。临时夹具页面关闭、4194 服务停止，应用 dev 服务保留。
- 本轮仅提交审查记录与 Reference 已知缺陷说明；未运行完整终端测试、构建或主网交易验收。此前 77 项通过属于上一提交的实际验证，不能用作本次缺陷已修复的证据。

文档检查：`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test` 均通过（8 项 memory 测试）；`git diff --check` 通过，两份手工修改文档的 10 个本地 Markdown 链接目标存在。最终提交由 Git 历史关联，不为记录自身 SHA 循环修改。

## 后续与替代关系

建议修复顺序（均未实施）：

1. 先建立包含真实 Sonner、根 StrictMode、Gate 冷/热加载、队列清空后再挂载的回归；进一步捕获 timer/RAF 时序，稳定复现关闭已记账而 DOM 残留。
2. 让通知发布在 effect 重放下保持幂等。可评估可取消的延后发布，避免被立即清理的首次 setup 向 Sonner 创建项；继续区分真实隐藏后重新展示的 generation，保留旧关闭回调不能删除新实例的现有守卫。最终方案需先通过迟到成功、快速切账户与退出动画回归，不能简单永久复用一个 ID。
3. 内容与清理机制共同校验任务和展示身份，避免捕获的旧 props 永久显示。仅返回 null 可能留下空白容器，验收应检查 Sonner 外层 DOM 和占位也被移除。
4. 必须保持一个全局容器、owner/env 隔离、未知软隐藏及后台对账、既定通知时长。不通过关闭 StrictMode、把所有 pending 改成三秒或删除 OrderToast 展示内容来掩盖问题。依赖升级仅在核实发布与回归兼容后考虑。

本记录补充全局通知及三秒时长任务的验证边界，不整体替代其架构决策或历史结果；当前实现仍待修复。
