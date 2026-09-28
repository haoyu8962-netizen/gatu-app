<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-22-compact-notification-implementation",
  "date": "2026-09-22",
  "title": "精简交易通知文案与真实成交摘要实施",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "真实成交摘要与精简通知已实施，保留部分/未知及附属单异常，修复长错误和短视口溢出；终端6946项与浏览器17项通过，未真实交易或发布。",
  "thread": { "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507", "title": "启动开发服务器" },
  "baseCommit": "18365269",
  "commits": ["4f7e046f", "75a7fb01"],
  "sources": [
    { "path": "docs/trading-notifications.md" },
    { "path": "docs/work-memory/sessions/2026-09-22-compact-notification-copy-plan.md" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" }
  ],
  "supersedes": []
}
-->
# 精简交易通知文案与真实成交摘要实施

状态：已实施并验证，尚未发布。起始分支 `codex/reviewceshi`，基线 `18365269`，工作区干净。

## 背景与范围

用户要求执行已记录的精简通知方案，覆盖编码规范、移动 UI、遗漏结果。沿用全局 Sonner、owner/env 隔离、展示生命周期及既定时长；不新增真实交易作为验收。详细设计、备选与边界见[方案](2026-09-22-compact-notification-copy-plan.md)。

增加独立可选 execution 展示字段，从实际提交主单及真实回包读取成交量、均价、订单 ID，Scale 同资产同方向加权使用 Big.js，排除 TP/SL。请求量价保留原义。缺少证据省略量价，损坏可选数据不得破坏 pending 事实与锁。

共享文案 helper 显式接收翻译依赖；普通结果精简成完整短句，手机自然分行，保留未知、失败、部分成交及附属单异常。任意错误和长符号不得截断。创建 TWAP、接受挂单、真实成交与仓位清空分别表述。

## 结论与依据

- 普通 entry/Scale 回包增加实际成交摘要，实际提交 cloid 与回包关联，正数、成交上限、订单 ID、主单数量及同方向同资产检查；真实部分成交与后续仅状态回包分别处理。
- 双端传入报价币种，pending 可选字段独立校验。均价仅用于普通订单真实执行显示；平仓、Swap 保持自己的数量证明与结果语义，不把请求字段改叫均价。
- 全局 Sonner 的 OrderToast 统一使用显式翻译 helper，主单与附属单混合结果、批次异常及原始错误保留；普通成交两行正文，自然换行及双向量价隔离。
- 删除无生产调用的旧 OrderQueueErrorMessage 与 queue 标签 helper，迁移测试至实际呈现入口。16 个新增模板的全部五种目标语言已填写，未顺带修改此前其他未翻译条目。
- 独立复审发现精简后语义 message 曾丢失操作/市场上下文，已修正并增加用例。生命周期、身份与时长未更改。
- 最终复审补出多条 Scale 拒单可能撑出移动视口的情况；正文限高、可滚动且可键盘聚焦，关闭控件保留在正文外。20 条拒单全部保留；正文与子项共享可用高度的上限，避免短视口中两块独立 35dvh 相加后将通知推到顶栏外。

## 验证与限制

验证针对本任务未提交工作区，基线 `18365269`；实现提交可按本记录与 Git 历史追溯。

- 数据链 8 文件 144 用例通过；旧入口清理相关 8 套测试累计 260 项通过；最终以完整终端测试结果为准。
- `pnpm --filter @gatu/terminal test` 最终 601 文件通过、1 文件跳过；6,946 用例通过、1 跳过（显式长时 WebSocket soak）。日志 `.worklog/2026-09-22/compact-notifications/terminal-tests-final.log`。
- `pnpm --filter @gatu/terminal typecheck` 通过；变更源码/测试 Biome 通过；`pnpm i18n:extract`、`pnpm i18n:compile` 通过。当前全库仍有此前未翻译条目（zh 5，其余目标语言各 36），本次新增模板无遗漏。
- 浏览器 `pnpm --dir apps/terminal exec playwright test --config tests/browser/notifications.playwright.config.ts` 最终冻结源码 17/17 通过（1.3 分钟），起止源文件 SHA256 一致。覆盖 390/800/1000/1280px、双主题、中英文切换、长币种/20 条拒单、800×360 短视口同时长正文与批次、键盘正文滚动/子项滚轮/390px 协议触摸、关闭与导航避让及真实 Sonner 生命周期。最终短视口卡片 y=30、bottom=292，关闭按钮完整可见。
- 浏览器实际截图已检查；最终日志、50 张合成数据 PNG 和来源哈希保存在 `.worklog/2026-09-22/compact-notifications/final-browser-run.log`、`final-browser-artifacts/`、`final-browser-evidence.json`。之前的冷导入超时、缺少 fixture CSS 与中间验证分别保留，不用中间截图替代最终版本。
- `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）及 `git diff --check` 全部通过。索引初次因新记录标题未使用模板规定名称而失败，按既有模板补齐四个标题后重跑通过。

初轮失败及修正保留：新 helper 单测传递未绑定的 i18n._ 导致 14 项失败，改为显式实例回调后通过；测试用消息缺少 MessageDescriptor.id 导致类型失败，补齐测试 ID 后通过。清理旧组件时更新 i18n 登记及 JSX 宏回调。全量首轮 12 项失败：TWAP 旧长文案断言、上轮通知 wrapper 重构后遗留的静态宿主断言，以及冷加载生命周期测试超过默认 5 秒引发的同文件连锁失败；分别更新当前入口断言、短句预期，并只将首次冷导入测试超时上限改为 30 秒，相关 58 用例及全量重跑均通过。

一次浏览器筛选表达式不匹配，未执行测试；更正后 4 个精简/翻译用例中 3 个通过，首次 1280px 的懒加载超过默认 5 秒。trace 显示最后成功模块回包在点击后约 5.06 秒，失败时快照已出现正确成交文案与单任务，无应用异常；保留证据于 `.worklog/2026-09-22/compact-notifications/cold-host-timeout/`。该情况由独立浏览器复核处理，仅放宽首次加载等待，不改变通知寿命断言或生产加载行为。

新增长错误用例还发现独立 fixture 未扫描生产组件的新 Tailwind 任意值类：DOM 有限高类但 computed maxHeight 为 none（该轮 11 通过/4 失败）。已补齐 notifications 专用样式入口与生产组件 @source，Vite 缓存仍隔离。真实样式下 800×360 的长正文加批次原有 y=6，修正为按视口扣除 Sonner 底部偏移、顶部安全区及控件留白后给正文/子项分配上限。新正文可键盘聚焦；子项保留原生列表语义，避免添加无交互 tabIndex 违反现有可访问性 lint。最终样式后的 4 文件 54 个展示/生命周期用例及 typecheck 通过。

CDP 触摸探针最初使用入场动画前坐标，scrollTop 为 0；等待稳定位置后实际触摸滚动从 0 到 231，同一任务仍在且没有拖动退出。浏览器保留失败、被替代及最终证据；协议触摸模拟不能替代物理手机验收。

浏览器夹具与模拟回包不等于真实交易、签名或物理设备验收。未执行真实交易、生产构建、发布或推送。后续挂单只有状态的确认仍不具备完整逐单成交量价，本轮不新增历史成交聚合器；依方案只展示已证明的字段。

## 后续与替代关系

2026-09-22 后续复核：实现提交现已存在，在本次修复任务中补记 `4f7e046f`；原记录创建时没有循环提交自身 SHA。Scale 接受/成交进度、IOC 对账边界、均价格式、键盘停靠点及测试冷导入的后续更正见[审查修复任务](2026-09-22-notification-review-remediation.md)。原验证属于当时的实现版本，不替代后续修复验证。

已完成本次授权的精简文案、成交摘要及响应式修复。规划记录保留为历史依据，当前规范已同步至 docs/trading-notifications.md。没有待执行的代码修复；未来如要求挂单后续成交也展示完整均价，需要另行设计逐单成交归集。
