<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-22-notification-lifecycle-fix",
  "date": "2026-09-22",
  "title": "修复提交进度通知重复与异步关闭残留",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "修复 StrictMode 重复发布、Sonner 迟到插入残留及同批关闭/成交丢结果；11项生命周期与5项浏览器回归通过，保留单容器、时长、身份及业务守卫。",
  "thread": { "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507", "title": "启动开发服务器" },
  "baseCommit": "938983d4",
  "commits": ["a999806b"],
  "sources": [
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/work-memory/sessions/2026-09-22-stale-submitting-notification-review.md" },
    { "path": "apps/terminal/src/components/trade/order-notification-host.tsx" },
    { "path": "apps/terminal/src/components/trade/order-notification.tsx" },
    { "path": "apps/terminal/src/lib/trade/order-notification-presentation.ts" },
    { "path": "apps/terminal/src/lib/tests/order-notification-lifecycle.test.tsx" },
    { "path": "apps/terminal/tests/browser/notifications.pw.ts" },
    { "url": "https://react.dev/reference/react/useSyncExternalStore" },
    { "url": "https://react.dev/reference/react/useEffect" }
  ],
  "supersedes": []
}
-->
# 修复提交进度通知重复与异步关闭残留

## 背景与范围

用户在审查确认同一任务重复通知、旧 pending 常驻后要求执行修复并符合编码规范。基线 `938983d4`，分支 `codex/reviewceshi`，开始时工作区干净。本次范围是 Sonner 展示生命周期、聚焦回归与文档，不改变下单、签名、后台对账、时长或业务锁。

## 结论与依据

实施前设计与最终实现：

- Host 向外部 Sonner 的发布延后到可取消 microtask；Effect cleanup 撤销未发生的发布，StrictMode 首次被清理的 setup 不再创建旧卡。同一次有效展示持续原位更新；真实隐藏/卸载后重显仍有不同展示 ID。
- 每个展示拥有独立的 active 状态及订阅，Host 清理时不可逆地失效。内容用 `useSyncExternalStore` 订阅这个外部生命周期，同时订阅对应 queue 项，读取当前结果而非保存的 pending props。该实例状态仅管理 UI，不成为交易事实来源。
- 内容发现展示失效、任务缺失/隐藏、owner/env 不匹配时不显示内容，并向 Sonner 关闭自己的展示 ID。即使库第一次异步关闭早于插入，迟到挂载也能重新清理外层节点，避免空白卡片或无限旧状态。
- 自定义关闭、Sonner 手动关闭及自动关闭均核对展示身份与当前任务引用，旧回调不能修改新任务。获准关闭在同步路径先移除映射、失效展示并关闭自身 ID，再修改 queue；同批到达的新结果因此取得新展示 ID，不受旧退出动画影响。清理展示不改变未知任务软隐藏与后台核验语义。

备选：仅延后发布无法覆盖真实卸载早于 Sonner 插入；只 `return null` 留下空白外层；关闭 StrictMode 掩盖清理缺陷；固定永久 toast ID 会让旧退出回调影响新展示；无证据直接升级依赖扩大普通与资金通知回归范围。本次保持锁定依赖，使用库公开 API 补全生命周期。

验收标准：真实 Sonner + 根 StrictMode + Gate 冷/热挂载只产生一个有效展示；pending→success 原位更新；人为先执行 dismiss RAF 再执行新增 timer 后无残留；任务清空、身份快速切换、软隐藏和迟到结果后外层 Sonner 节点正确清理；时长、语言切换、对账及旧回调守卫保持。

## 验证与限制

验证版本：基线加本任务文件，最终提交由 Git 历史关联。2026-09-22（Asia/Shanghai）实际验证：

- **红测基线**：未修改 Host（SHA-256 `b0b0afdd316fb2a63bf8b477ae017300c1a1a2951c183916b04031eb7faa6d9d`）时新生命周期前 5 项有 3 失败、2 通过。先执行两层关闭 RAF 再执行插入 timer 后，活跃记录消失但外层 Sonner 节点仍残留；再推进 60 秒仍有两张。浏览器旧实现单任务有效卡片峰值为 2，排除了已标记退出的卡片。
- **中间修复缺陷**：首次实现保留了按钮先直接 `toast.dismiss` 再进守卫；独立复审后新增单个 `act` 内真实关闭点击紧接 success 的用例，成功任务被旧退出误删，明确红测。最终改为所有关闭入口先守卫，再同步结束展示实例；自定义和 Sonner 原生关闭同批结果两项均通过。
- **生命周期最终测试**：`pnpm --dir apps/terminal exec vitest run src/lib/tests/order-notification-lifecycle.test.tsx`：11/11 通过。覆盖上述原红测、真实卸载、快速账户往返、旧展示自定义/自动回调、同展示旧任务引用、未知软隐藏及迟到结果、两个关闭入口与成功同批，以及成功恰在旧三秒结果到期时到达。
- **临界计时调查**：曾依据源码提出同展示旧自动关闭可能先于 Sonner 更新的假设。对相同 deadline 的真实 timer 使用异步及同步推进均未复现丢失，最终保留用户行为回归，移除了临时 timer 内部检查；不把假设记为已证实缺陷，也不宣称覆盖所有浏览器调度。
- **浏览器最终测试**：`pnpm --dir apps/terminal exec playwright test --config tests/browser/notifications.playwright.config.ts`：5/5 通过（48.3 秒）。根 StrictMode + Gate 两次任务生命周期的有效卡片峰值为 1，更新保持同一内容节点，退出后 queue 和外层 toast 清空；软隐藏迟到结果、账户隔离、1280/390px 两主题共用栈通过。已人工查看 4 张展开截图，移动端位于底部导航上方。该 fixture 仅更新合成任务，无交易和签名请求。
- **测试更正**：首次浏览器运行中编辑夹具触发 HMR，作废该混合版本结果后重跑旧版红测。修复后一次测试把空队列时 Sonner 不渲染容器误判为失败，改在有通知时断言单容器、空时断言 toast 清空；截图 hover 最初错误指向零高度外壳而超时，改为可见内容后完整重跑通过。首次 TypeScript 检查发现新增浏览器 Window 扩展强制转换错误，改为 unknown 值的显式类型校验。
- **CI 与规范**：`node --test scripts/ci-workflows.test.mjs`：6/6 通过；新浏览器 suite 已接入现有两分片工作流，默认 suite 排除独立入口，不重复执行。6 个生产/单测 TS/TSX 文件 Biome 通过；4 个浏览器 TS/TSX 文件用相同根配置仅放开原本排除的路径检查，通过。已有 CI 测试脚本原有格式告警未顺带修改。

最终聚焦命令 `pnpm --dir apps/terminal exec vitest run src/lib/tests/order-toast-placement.test.tsx src/lib/tests/order-notification-gate.test.tsx src/lib/tests/order-notification-lifecycle.test.tsx src/lib/tests/order-reconciliation.test.tsx src/lib/tests/twap-reconciliation.test.tsx src/lib/tests/toaster-config.test.tsx src/lib/tests/cctp-deposit-notification-lifecycle.test.tsx src/lib/tests/i18n-hot-switch.test.tsx src/lib/tests/i18n-reactivity-contract.test.ts`：9 文件、239 项通过（10.66 秒），无 act 警告。`pnpm --filter @gatu/terminal typecheck`：通过。最终日志为本地 `unit/gatu-notification-lifecycle-regression-verified.log` 与 `unit/gatu-notification-lifecycle-typecheck-verified.log`。

文档检查 `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test` 均通过（8 项测试）；`git diff --check` 通过，修改文档及生成索引的 295 个本地链接目标有效。独立夹具端口 4189 已无监听进程，应用开发服务未改动。

本地脱敏日志与合成截图保存在 Git 忽略的 `.worklog/notification-lifecycle-fix/`（`browser-before`、`browser-after`、`unit`）。未将账户资料加入仓库；未运行全量终端测试或生产构建，未发起真实交易、刷新用户页面、推送或发布。人工控制 timer/RAF 可证明该缺陷与修复，不能证明用户截图时唯一的真实调度轨迹或物理设备验收。

## 后续与替代关系

Reference 已更新为实施状态，ADR 补充生命周期取舍，Changelog 记在 Unreleased，runtime guardrails 记录独立缓存与浏览器入口。历史审查保留实际观察及当时未稳定复现的限制；本轮确定性调度与红绿测试补足其缺口。没有新增通知容器或修改交易状态机；旧浏览器已经脱离跟踪的旧模块实例不能靠源码修改追溯清理，刷新页面可从新实现启动。
