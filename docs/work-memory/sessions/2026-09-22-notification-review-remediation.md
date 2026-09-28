<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-22-notification-review-remediation",
  "date": "2026-09-22",
  "title": "精简通知对抗审查复核与修复",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry", "pr-review"],
  "summary": "复核并修复 Scale 受理/成交进度混淆、IOC 恢复对账取消误报、均价数字偏好和多余焦点；保留用户指定三秒时长，补记历史 SHA 并隔离测试冷导入。6972 项终端测试及 19 项浏览器回归通过，未真实交易或发布。",
  "thread": { "id": "01a0c3b4-5aec-7f93-bc8b-6ecf0e661507", "title": "启动开发服务器" },
  "baseCommit": "966dca1c",
  "commits": ["75a7fb01", "46f50c64", "e52739d2"],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-09-22-compact-notification-adversarial-review.md" },
    { "path": "docs/trading-notifications.md" },
    { "path": "apps/terminal/src/hooks/trade/use-order-submit.ts" },
    { "path": "apps/terminal/src/components/trade/order-reconciliation.tsx" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/nodes/l1-data-schemas" }
  ],
  "supersedes": []
}
-->
# 精简通知对抗审查复核与修复

## 背景与范围

本任务接续通知精简实施，复核用户提供的 2 项 P2、5 项 P3 报告。基线 `966dca1c`，开始时工作区干净；只调整通知结果表达及相关验证，不改签名、下单协议或业务锁，不执行真实账户交易。

## 结论与依据

实施前设计：接受结果与即时成交进度分开。全部 GTC 阶梯被接受时正常的部分即时成交不等于提交失败；保留实际成交量和均价，不虚构后续挂单成交。IOC 对账必须限定有可信部分成交证据的主单普通取消，保留附属委托和异常取消的错误。

文案格式复用共享数字格式偏好，但均价不是委托价格 tick，不按 `szDecimals` 截断加权均价。通知正文只在实际溢出时提供键盘滚动停靠点，保留状态播报和全部错误。生命周期测试将冷模块准备与计时行为断言区分。备选的统一延长部分成交展示时间不采用：用户已明确要求三秒，且通知不是唯一交易历史。

逐项复核与实施：

- **P2-1 限定成立**：普通单笔 IOC 的有效部分成交 HTTP 回包在 `useTrackedOrder` 完成 accepted resolution 后立即移除 pending，不会再收到本地该记录的 canceled 对账；问题位于仍需对账/恢复的路径。官方 exchange endpoint 确认 IOC 剩余量取消；报告引用的 L1 示例实际 `tif: Alo`，不能充当 IOC 实测。生成摘要时新增可选 `partialIoc`，只在实际单主单 `tif: Ioc`、合法提交 cloid、回包 oid 与正数部分成交通过校验时记录。恢复对账以同一 cloid 匹配普通 `canceled` 为余量取消，保留部分成交；oid 只与保存的执行摘要关联验证，不声称在只有 cloid/status 的后续推送里再次取得 oid。附属取消与 `marginCanceled` 等保持异常。损坏可选字段独立丢弃，旧记录无此证据时保守处理。
- **P2-2 成立**：Scale 在 accepted 模式下所有子项被接受即成功，包含正常的部分即时成交与剩余挂单；`execution.completeness: partial` 继续表示真实成交进度，不决定提交警告。存在拒绝、取消、未知或要求完整成交确认时不放宽。
- **P3-1 部分成立**：修复的是用户数字预设未生效，复用共享 `formatPrice` / `formatToken` 并订阅数字格式变化。全站数字格式与语言独立，阿拉伯语不自动变阿拉伯数字；加权均价可能不在价格 tick 上，不套 `szDecimals`。保留 Big.js 八位有效数字及原始证据，末端显示禁用 K/M 压缩。
- **P3-2 有意保留**：用户已明确要求部分成交三秒隐藏；这不是本次需变更的缺陷，规范已说明通知不是持续交易历史。
- **P3-3 测试结构改进**：真实宿主在 collection 转换，移除首条三十秒特例；受控异步 Gate 测试仍覆盖懒加载就绪和完整通知寿命。单独运行非首条用例不会再把模块转换算进行为断言时限。
- **P3-4 补记**：原实施记录现回填 `4f7e046f`。原创建时 `commits: []` 避免自引用循环，符合工作记忆约定，不是伪造或遗漏实现；本次 SHA 仍由 Git 历史定位。
- **P3-5 改进**：live status/alert 不再无条件可聚焦。命名的原生 section 仅在实际溢出时提供 Tab 停靠点；正文和子项都用 ResizeObserver 观察可用高度与内部内容，短通知及变短后的通知移除多余停靠点。保留完整错误、显式关闭和原生键盘滚动。

## 验证与限制

本轮验证基于 `966dca1c` 上的本任务工作区，不复用历史通过数；日志在 `.worklog/2026-09-22/notification-review-remediation/`。

- `pnpm --filter @gatu/terminal typecheck` 通过；14 个变更源码/单测文件 Biome 通过。浏览器 fixture/pw 被默认 includes 排除，另用 Biome stdin 写出流核对且与原文件字节一致。
- 数据链五套 129 项通过：execution-summary 24、pending-store 17、reconciliation 42、tracked-order-hook 27、submit-surface-reset 19；覆盖 Scale 成交+挂单、已知 partial 子项、拒绝/取消/filled 模式、IOC 余量取消与附属异常、缺失/损坏证据及普通 IOC 已移除 pending 的可达性。
- copy/lifecycle/gate 三套 32 项通过；单独筛选非首条 lifecycle 用例 1 项通过、10 项因筛选跳过，模块转换不再挤占行为测试时限。展示、错误及生命周期三套 36 项通过，包含数字偏好原位更新。以上聚焦统计有重叠，不相加作独立总量。
- 浏览器最终 19/19 通过（1.8 分钟），四个 UI/copy/fixture/pw 源码起止 SHA256 一致。覆盖 390/800/1000/1280px 两主题与语言、数字格式独立热切换、短卡 Tab 跳过正文、长正文和子项 Tab/End 滚动、变短后移除停靠点、800×360 双滚动区和 CDP 触摸滚动。最终日志 `browser-final.log`，50 张合成数据截图在 `browser-final-artifacts/`；已检查桌面短卡、紧凑中文深色卡、390px 长错和短视口双滚动区。首轮 18/18 也通过；最终轮新增数字格式编译路径验证，不以首轮替代最终验收。
- `pnpm i18n:extract` / `pnpm i18n:compile` 通过，无目录变化；此前未翻译条目（zh 5、其余目标语言各 36）不属此次变更。
- `pnpm --filter @gatu/terminal test` 全量 601 文件通过、1 文件跳过；6,972 项通过、1 项显式长时 WebSocket soak 跳过，135.35 秒。日志 `terminal-tests.log`。独立只读复审未发现新增可行动缺陷；不是生产发布或真实设备验收。
- `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）及 `git diff --check` 通过。

本轮浏览器/单测均使用合成数据；未取得 IOC 真实交易回包，不将官方 ALO 示例称作实测。未执行真实交易、实体触屏或屏幕阅读器验收、生产构建、发布或推送。Biome 初次 stdin 校验因缺少 `--write` 返回用法错误，改为写出流后通过且没有文件差异；没有把该工具调用记为源码 lint 失败。

## 后续与替代关系

原审查和实施记录均保留，已追加局部更正和链接；当前行为同步到 `docs/trading-notifications.md` 和 CHANGELOG。旧 pending 没有新 IOC 证据时维持保守取消提示，后续成交归集不属此次范围。没有新增真实交易或发布任务。

2026-09-22 二次对抗审查更正：`partialIoc` 只匹配 `tif: "Ioc"`，而市价单实际发送 `FrontendMarket`，因此上文「IOC 恢复对账取消误报」的修复对市价单主场景未生效，仅覆盖手选 IOC 的限价单；本节其余结论不变。详见[75a7fb01 对抗审查](2026-09-22-notification-remediation-adversarial-review.md)。

2026-09-22 后续修复：市价 `FrontendMarket` 现纳入即时成交余量取消语义；主单有匹配部分成交证据且普通 `canceled` 时，已绑定的同批 TP/SL 普通取消保持中性，`marginCanceled` / rejected / unknown 不放宽。数字格式 helper owner 登记、正文区域名称及无生产来源的 Scale partial 子项放行分支一并处理。此段是对上文的局部更正，实际验证以[后续任务记录](2026-09-22-notification-remediation-followup.md)为准。
