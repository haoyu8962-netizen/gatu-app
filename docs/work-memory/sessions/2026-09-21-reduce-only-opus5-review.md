<!-- work-memory
{"schemaVersion":1,"id":"2026-09-21-reduce-only-opus5-review","date":"2026-09-21","title":"372460f2 只减仓修复的 Claude Opus 5 对抗审查","kind":"task","status":"recorded","topics":["order-entry"],"summary":"终端实际调用 claude-opus-5 审查 372460f2；复核后保留 Max 命名、有效余额被置零、普通手机订单保证金口径改变三项，排除未证实精度拒单及既定金额重输取舍；未改业务代码。","thread":null,"baseCommit":"372460f2fa94e72309d0140dc7941681bf6fe535","commits": ["26b7bbf0"],"sources":[{"path":"docs/reduce-only-repair-plan.md"},{"path":"docs/order-draft-lifecycle.md"},{"path":"docs/work-memory/sessions/2026-09-21-reduce-only-implementation.md"},{"path":"apps/terminal/src/hooks/trade/use-order-entry-data.ts"},{"path":"apps/terminal/src/components/trade/tradebox/trade-form-fields.tsx"},{"path":"apps/terminal/src/components/trade/mobile/mobile-trade-view.tsx"}],"supersedes":[]}
-->
# 372460f2 只减仓修复的 Claude Opus 5 对抗审查

状态：审查完成，三项问题待修复。仅新增工作记录与索引，不修改交易实现。

## 背景与范围

用户明确要求通过终端调用 Claude Code，使用 Opus 5 对抗审查 `372460f2`。起始分支 `codex/reviewceshi`，HEAD 为该提交，工作区干净。范围为其相对父提交 `0fafbc7f` 的变化与相关调用链。未取得 Codex 任务标识，保留 `thread: null`。

首次调用遇到认证失败；用户完成登录后重新执行。Claude Code 2.1.241 的初始化事件与回复模型字段均为 `claude-opus-5`，不是由默认别名推断。使用 `--effort max`、`--no-chrome`、空 MCP 配置及 Read/Grep/Glob/受限 Bash 工具；禁止编辑、提交及真实交易。最终进程退出 0，结果 `success` / `is_error: false`，103 次工具调用。没有让 Claude 修改代码或 Git 状态。

## 结论与依据

没有发现 P0/P1；这不等于对真实撮合或所有资金路径的安全证明。Claude 原报告把缺陷、风险、既定取舍和旧问题混合编号，且总数与逐条编号不一致。以下是主助手结合父版本、当前源码和精确计算复核后的结论，严重性为复核后的评价。

### 保留的问题

1. **P2：普通手机订单的保证金价格来源被改变。** `mobile-trade-view.tsx:431-436` 从父版本的 `orderValue / leverage` 改为 `getOrderMetrics({ sizeValue, price, ... })`。共享 `orderValue` 来自 `conversionPrice`，而 `getOrderPrice` 对止损/止盈市价取触发价，对 Scale 取区间中点。于是关闭只减仓时也改变了原来的展示。例如标记价 100、数量 1、杠杆 10、触发价 80，原保证金 10 变为 8，订单价值仍是 100。此为源码与 Big.js 算术确认的行为变化，未做真实浏览器复现。`docs/reduce-only-repair-plan.md` §4 明确要求普通订单计算保持原样，不能仅以“与桌面对齐”推断为改进。后续应在域模型保留普通单原计算口径，只让只减仓返回不适用；若要统一价格口径，应另行明确设计、文档和回归标准。
2. **P2：桌面 Max 的可访问名称仍宣称使用可用余额。** `trade-form-fields.tsx:223-231` 的点击动作已通过共享入口按可减仓持仓生成 100% 数量，ARIA 名仍为 `Use max available balance`。有可减仓持仓且开仓余额为零时，这个按钮依然可用，名称错误描述其动作。保留余额展示和通过该行应用持仓 Max 本身符合计划，不作为缺陷；需要让可访问名称和必要提示准确表达“最大可减仓数量”，并检查手机对应入口。此问题只影响输入语义，未发现由此绕过确认或执行校验。
3. **P3：持仓不可用会覆盖健康的余额展示。** `use-order-entry-data.ts:262` 把 `reduceOnlyCapacity.status === "unavailable"` 并入 `isAvailabilityBlocked`；桌面 `trade-form-fields.tsx:204` 与手机 `mobile-trade-view.tsx:817` 随后把该标志映射为余额 0，桌面 `:235` 还隐藏 Swap。只减仓开启、持仓快照缺失/陈旧/失败但余额快照有效时，应禁用相关交易动作，却不应把有效余额置零。此结论来自两端调用链，未在真实账户故障注入。后续应分开余额可用性和只减仓持仓可用性，在交易守卫处组合，展示处使用各自状态。

### 未计入本提交缺陷的条目与更正

- **原 P3-2 精度拒单窗口：未证实，所给链路不成立。** 报告以 `szi=7.159`、`szDecimals=2` 推导表单放行而执行守卫拒绝，但正常提交先经过 `use-order-submit.ts:182` 的 `formatSizeForOrder`。`orders.ts:561-568` 会把请求向下量化为 7.15，与容量 7.15 一致。不能把缺少正常提交复现的假设计为“持仓变化”误报缺陷。
- **原 P3-3 手动重输报价金额：既定取舍，数字示例有误。** `docs/order-draft-lifecycle.md` 已规定手动修改清除基础币来源，再按当前价格向下量化。Big.js 核算 `7.15 × 95.997 = 686.37855`，显示值应为 686.37；手动重输 686.37 会得到 7.14，而报告写的 686.38 会得到 7.15。确认与提交均使用实际基础币数量。等值基础币提示可作为后续体验改善，不计作本次违反契约。
- **原 P3-5 严格快照校验：验证缺口。** 拒绝错 owner、畸形或重复身份快照符合要求。没有拿到“合法真实帧被错误拒绝”的证据；builder dex 实际帧覆盖仍需补验。
- **原 P3-6 只减仓附带 TP/SL：父版本已有，非本提交引入。** 后续可单独评估，不能归入当前新增回归。
- **原 P3-7 无生产调用的导出：清理建议，不是功能缺陷。**

原报告作为独立工具输出保留，不回写为好像没有发生过这些误判。以上更正决定本次保留清单。

## 验证与限制

以下测试结果针对 `372460f2`，来自已核对的 Claude 工具结果，而不只来自其最终文字报告。共同命令前缀为 `pnpm --dir apps/terminal exec vitest run`；完整参数和结果摘要保存在本地证据的 `test-evidence.json`。

| 范围 | 实际结果 |
| --- | --- |
| 只减仓域模型、提交、执行守卫、订单校验及草稿，6 文件 | 225 通过，7.37s |
| 网格、表单、移动数据、持仓 readiness 和提交反馈，13 文件 | 177 通过，6.34s |
| 滑杆生命周期、无障碍、确认及动作标签，12 文件 | 206 通过，7.65s |
| 翻译、摘要、数量、协议和提交生命周期，12 文件 | 328 通过，8.49s |
| `src/lib/tests/trade-form-views.test.tsx` | 11 通过、1 失败，3.30s；disabled slider SSR 等同性 |

各批次有重复用例，不能将其相加宣称为独立测试总数。SSR 失败在之前实施任务已于干净父提交复现，证据范围见[实施记录](2026-09-21-reduce-only-implementation.md)。本次再次观察到失败，但没有再次建立父版本 worktree。原报告描述 SSR 属性差异的方向不准确；以实施记录和实际差异为准。

Claude 的两次 typecheck 调用因本次给它的 Bash 白名单拒绝，随后主助手运行 `pnpm --filter @gatu/terminal typecheck`，退出 0。原报告称 Biome 也遭拒，调用记录未支持该说法；本次没有执行 Biome，不把之前实施任务的通过结果算作本次验证。首次带 `timeout` 的 Vitest 尝试没有成功结果，随后直接执行同组测试取得表中结果。

主助手另外用已安装 Big.js 核算上述量化、金额与保证金示例，结果与本记录一致。这是确定性算术检查，不等价于浏览器复现或协议实测。本次未重跑全量 Vitest 或 Playwright，未执行真实签名、下单、撤单或资金操作。

本地 Git 忽略目录 `.worklog/claude-opus-5-review-372460f2/` 包含独立报告 `claude-report.md`、白名单公开文本与工具名称 `public-events.jsonl`、调用元数据 `review-metadata.json`、测试摘要 `test-evidence.json` 和主助手 `typecheck.log`。没有保留内部推理；完整 verbose 临时流在提取公开证据后移除。本地材料不是完整 Codex 对话归档，也未纳入 Git。

文档检查：`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8 项）及 `git diff --check` 均通过。仅本记录和生成的 `INDEX.md` 纳入本地文档提交。

## 后续与替代关系

建议修复顺序：恢复非只减仓手机保证金口径；拆分余额与持仓可用性；修正 Max 名称并补双端回归。新增回归应分别覆盖非只减仓各订单类型、健康余额叠加持仓缺失/陈旧/错误，以及零开仓余额下的只减仓 Max 无障碍语义。

浏览器夹具目前对持仓只模拟 loading，且固定 `isStale: false` / `hasError: false`，部分 `getPosition` 忽略市场身份。后续需要补双端错误/陈旧/错市场场景，不能把现有通过结果扩大解释为这些组合已验收。确认至 SDK 测试使用签名、会话及 SDK 替身，真实授权和成交仍是独立验收范围。

本记录补充实施任务，不整体替代历史记录或擅自改变规范。三项修复尚未实施；本次仅交付审查结果和后续建议，不推送。
