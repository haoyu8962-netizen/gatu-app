<!-- work-memory
{"schemaVersion":1,"id":"2026-09-21-reduce-only-implementation","date":"2026-09-21","title":"只减仓容量、表单与执行边界修复","kind":"task","status":"recorded","topics":["order-entry"],"summary":"按官方表单审查计划实施共享持仓容量、精确数量草稿、零开仓余额流程、全入口执行守卫和保证金占位，已完成实现；自动化验证与已知基线失败见正文。","thread":null,"baseCommit":"0fafbc7f","commits":[],"sources":[{"path":"docs/reduce-only-repair-plan.md"},{"path":"docs/order-entry-surface-parity.md"},{"path":"apps/terminal/src/domain/trade/order/reduce-only.ts"}],"supersedes":[]}
-->
# 只减仓修复实施

## 背景与范围

同步记录，用户明确要求开始执行修复；基线 0fafbc7f，工作区干净。未取得任务标识。未发送真实交易或修改登录/签名配置。

## 结论与依据

已接入共享精确持仓容量、桌面/手机只减仓输入、临时基础币数量来源、确认/协议字符串，以及全订单主单执行守卫。额外发现主按钮的零余额充值分支也会阻止减仓，已独立传递 reduceOnly 语义，保留其余资金/签名/数据守卫。现有 trigger 错误 ID 保留兼容，语义扩大为通用减仓校验。

首轮旧测试 154/155 通过，唯一失败是扩大守卫后旧错误文本期望未更新。第二轮新增测试 161/162 通过，失败是精度案例误用买方向面对多仓（命中正确方向拦截），已纠正测试为卖方向。两者都不作为最终验证结果。

## 验证与限制

实现已完成，全部结果针对基线 `0fafbc7f` 上本任务工作区；最终提交可由此记录的 Git 历史定位。

- 共享域模型保留持仓原始十进制字符串，以 Big.js 计算反方向容量、百分比和 Scale 合计。100% 金额模式保留量化后的基础币来源，不反算舍入后的金额。
- 桌面/手机共用入口与临时数量来源；手输、方向、类型、只减仓和显式限价变更使来源失效，取消滑杆手势恢复原始来源；断点重挂载和语言切换保留共享草稿。
- 市价、限价、四类条件单、TWAP、Scale 都验证减仓持仓；SDK 边界复核最新持仓。normalTpsl 附带保护单不计入当前减仓主单总量。保留其他交易、最低价值、身份和 freshness 门槛。
- 数值零余额不再阻止有效减仓或强制充值；保证金显示 `—`。通用字段错误和提交前持仓变化反馈覆盖六种语言。
- 快照 owner 不匹配、非法 szi、畸形结构或重复身份不会被当成确定空仓；没有新增订阅，也没有修改签名模型。

### 实际检查

最终 `pnpm --filter @gatu/terminal test`：6800 通过、1 失败、1 跳过（594 文件；108.02s）；唯一失败为下述已复现的基线 SSR 问题。`pnpm --filter @gatu/terminal typecheck` 通过；35 个纳入仓库 Biome 范围的变更 TS/TSX 检查通过，浏览器测试文件另按同一格式配置格式化。全订单 Playwright 首次完整结果 34 通过 / 4 失败；修正 TWAP 零余额旧断言后 `--last-failed` 的 4 项全部通过（46.8s），该组 38 项均取得通过结果。另布局/高度/滑杆组 36 项通过，共覆盖 74 项浏览器检查，其中新增只减仓 9 项。确认弹窗至 SDK mock 的 24 项测试使用真实确认、提交、跟踪与执行守卫，但签名提供者、会话和 SDK 客户端均为替身；证明请求不变量，不证明真实授权或成交。全量执行前针对最新接口与反馈的 7 文件 / 214 项检查通过；新增桌面 ARIA mock 修复后另 10 项通过，畸形快照结构用例修正后 15 项通过。

### 失败与边界

保留初期失败：旧触发单文本断言、精度测试方向、持仓夹具缺 user / leverage、可访问标签、百分比同值不触发变更、集成夹具缺包导出路径/浏览器锁/合成会话，以及新共享接口的旧 mock 缺失。均已修复后重跑对应检查。中间完整 Vitest 的 4 项失败与随后 54 项失败不能作为最终结果。

`trade-form-views.test.tsx` 的 disabled slider SSR 等同性失败已在干净基线 `0fafbc7f` 的临时 worktree 单独复现（1 失败 / 11 通过）：placeholder 有原生 disabled 属性，runtime 首次 SSR 没有。该滑杆实现不在本次改动内，不扩大修复范围。

首轮两组 Playwright 运行结束/推进停滞：布局/滑杆组在中断收尾后报告 36 passed，全订单组没有完成结果，终止本任务进程后独立重跑；未将未完成的组计作通过。重跑中 1421px 语言用例超时（等待中文时页面仍是英文，运行时曾修改语言目录与夹具，推测受 HMR 干扰，未据此认定产品缺陷）；另三种手机宽度仍断言零余额要禁用只减仓，已更新为本次设计的可恢复开关。四项在文件稳定后全部复跑通过。

未执行真实签名、撮合、零可用余额实盘、手机真机或生产发布；不将合成夹具升级为实盘证据。不增加新的清算价估算、小额平仓豁免或扣除全部既有挂单的算法。仅本地提交，不推送。


## 后续与替代关系

实施范围兑现前两轮审查与修复方案，不改写其历史现场观察；当前规则以双端表单、草稿、确认和滑杆专题为准。已知基线 SSR 问题与真实账户/真机验收是独立后续事项，本任务不声称修复或验证这些范围。

首次 `memory:index` 因任务记录缺标准标题失败，补齐模板结构后 `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8 项）通过。最终 `git diff --check` 通过。本地 `http://localhost:3006/trade/HYPE` HTTP 200。


本地脱敏结果摘要与已查看的 1440/1108/375px 合成夹具截图保存在 Git 忽略目录 `.worklog/reduce-only-implementation-2026-09-21/`。截图可见只减仓选项、100% 金额数量和保证金占位，没有真实账户数据。

浏览器复现命令：

```bash
pnpm --dir apps/terminal exec playwright test --config tests/browser/mobile-trade-all-orders.playwright.config.ts
pnpm --dir apps/terminal exec playwright test --last-failed --config tests/browser/mobile-trade-all-orders.playwright.config.ts
pnpm --dir apps/terminal exec playwright test tests/browser/trade-panel-all-orders.pw.ts tests/browser/mobile-trade-height.pw.ts tests/browser/trade-size-slider-performance.pw.ts --config tests/browser/playwright.config.ts
```
