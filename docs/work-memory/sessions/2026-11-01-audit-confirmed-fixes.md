<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-11-01-audit-confirmed-fixes",
  "date": "2026-11-01",
  "title": "全功能审查确认仍存在的问题：第一组按官方做法修复（F1、F2、M3、E12、E13、M7、成交日期，B6 更正）",
  "kind": "task",
  "status": "recorded",
  "topics": ["i18n-runtime", "pr-review", "hyperliquid-api"],
  "summary": "PR #129 合入 dev（90658436）后，运营方要求修复 2026-10-30 全功能审查里确认仍存在的问题，并「请你调试 app.hyperliquid.xyz/trade/HYPE，根据实践来修复」。分支 claude/audit-confirmed-fixes，基于 90658436。第一组不需要运营方决定的项全部修完：F1 四种语言 31 条空译文补齐并加 catalog-completeness-contract；F2 阿拉伯语带符号数值按 CLDR 加 U+200E（useNumberFormat 在从右到左界面返回另一套函数）；M3 ⌘K 命令菜单本地化、现货价格按现货规则；E12 质押被拒显示交易所原文（ADR 0024）；E13 组合页切回时刷新期间保留上一份数据（官方无年龄门槛）；M7 最大滑点改强调色；成交历史日期带年份。B6 经主网只读实测不成立，只改文档。每项有会失败的测试与变异核对。第二组（订单簿 M2/M9/C5、选择器 M4/C9、显示名 C3、无价代币计 0、E5、手机成交筛选）留到下一批。未推送。",
  "thread": null,
  "baseCommit": "90658436",
  "commits": [],
  "sources": [
    {"path": "docs/work-memory/sessions/2026-10-30-full-feature-audit.md"},
    {"path": "docs/number-format-setting.md"},
    {"path": "docs/i18n-presentation.md"},
    {"path": "docs/portfolio-statistics.md"},
    {"path": "docs/adr/0024-translate-action-errors-at-render.md"},
    {"path": "docs/hyperliquid-sdk-reference.md"}
  ],
  "supersedes": []
}
-->
# 全功能审查确认仍存在的问题：第一组修复

## 背景与范围

同步记录，未取得任务标识。PR #129（P1 与 P2 集成）2026-10-31 合入 `dev`（`90658436`）后，运营方问「还有哪些问题没有修复的 证实确实存在问题的」。按审查记录（`2026-10-30-full-feature-audit.md`）与两批修复逐项核对当前代码，列出第一组 8 项「确认存在、不需要决定」与第二组约 10 项「确认存在、修法要决定」。运营方随后答「修复 请你调试。https://app.hyperliquid.xyz/trade/HYPE 根据实践来修复」。

- 分支 `claude/audit-confirmed-fixes`，基于 `origin/dev` `90658436`，未推送。
- 官方依据：运营方 Chrome 里只读打开官方终端（未连接钱包、未点交易控件），以及 2026-10-31 下载的官方生产前端包（`/tmp/claude-501/hl-official-1031/assets/`，未入库）。B6、E12、E13 由三个只读调研代理核对我方代码与官方包，B6 的代理另用公开 info 接口与 WebSocket 做了只读实测。

## 结论与依据

| 编号 | 问题 | 依据 | 修改 | 提交 |
| --- | --- | --- | --- | --- |
| F1 | 西、法、印地、阿拉伯语各 31 条空译文（关联手机、手机导入、API 钱包邮箱签名） | 2026-09-28 更正：维护语言不长期回落英文 | 补齐 124 条译文，占位符逐条核对；新增 `catalog-completeness-contract.test.ts`，活动条目空译文即失败（`#~` 废弃条目除外） | `cd49cb62` |
| F2 | 阿拉伯语带符号数值显示成 `18.50%+` | CLDR：`Intl.NumberFormat("ar-u-nu-latn", { signDisplay: "always" })` 输出 `‎+1.5`；官方终端不支持阿拉伯语 | 界面从右到左时 `useNumberFormat()` 返回另一套函数，结果以正负号开头且带数字时加 U+200E；`markLeadingSign` 处理 helper 自己拼的符号（手机行情条、手机下单页涨跌、下单面板持仓数量、金库金额与比例）；`getNumberFormatters()` 不分方向，导出与事件回调不带标记 | `5d226361` |
| M3 | ⌘K 命令菜单英文、现货价格用永续规则 | 代币选择器已有的同名文案；现货 8 − szDecimals | 文案改 `t`，市场类型同选择器（HIP-3 显示 DEX 名），价格传 `marketType`；新增描述文案六种语言译文 | `6f2942b8` |
| E12 | 质押被交易所拒绝时只显示「No changes were made.」 | 官方质押弹层把交易所 `response` 直接放进通知；ADR 0024 | 会话存 `classifyActionErrorOr` 的分类值，通知经 `describeActionFailure` 显示；判定顺序改为交易所拒绝先于钱包关键词 | `b426535a` |
| E13 | 组合页切回时闪 "Something went wrong" 与 $0 | 官方组合页无年龄门槛，刷新期间保留旧数据，无加载或错误文字 | 新状态 `refreshing`：过期或上次失败、且新请求在途时继续显示上一份成功数据；过期而无请求在途（`stale`）显示为等待；Retry 改 `cancelRefetch: false` | `4e452818` |
| M7 | 下单摘要的最大滑点恒为错误红 | 官方 `Est: 0% / Max: 2.00%` 为强调色（实测 `rgb(80, 210, 193)`） | 改 `text-signal` | `eea1add5` |
| — | 成交历史日期无年份、委托历史有 | 官方成交时间 `toLocaleString(…, { hourCycle: "h23" })`，带年份 | 桌面页签、全页与 CSV 用与委托历史相同的 `formatDateTime(…, { dateStyle: "short", timeStyle: "short" })`；手机卡片保持紧凑格式 | `eea1add5` |
| B6 | 成交历史剔除 TWAP 后可能误报空态 | 2026-11-01 主网只读实测：`userFills`（快照、推送、查询）与 `userFillsByTime` 都不返回 TWAP 子单，`twapId` 恒为 null；官方完全不按 `twapId` 过滤 | 判为不成立，只改 `trading-toolbar-redesign.md` 与 `hyperliquid-sdk-reference.md` | `55d7ae52` |

## 验证与限制

- 每项都先写在旧代码上会失败的测试，再做变异：F2 9 个、M3 7 个、E12 4 个、E13 6 个、M7 与日期 2 个，全部被抓到；F1 的契约测试用修改前的 `es` 目录跑会失败。
- 相关测试组、`pnpm typecheck`、Biome、`pnpm i18n:extract`（活动条目缺失为 0；Lingui 统计里剩下的是 `#~` 废弃条目）、`node --test scripts/ci-workflows.test.mjs` 通过。全量单测（`--maxWorkers=4`）第一次与 Codex 审查同时运行：`action-progress-label-contract` 1 项失败，是 M3 把搜索框占位符改成翻译文案后被识别为以省略号结尾的标签，已按代币选择器的先例登记为输入框占位符（`c3e605b4`）；`mobile-agent-sync-modal` 27 项失败，单独重跑全部通过，是工作记忆里记过的高负载 `vi.waitFor` 超时。在 `c3e605b4` 上不与其他任务并行重跑：701 个文件、9,566 项通过（1 个文件跳过）。`pnpm typecheck`（hl-react、ui、terminal）通过。
- Codex 只读审查（`gpt-6-astra`，low，范围 `90658436..55d7ae52`）：9/10，无 P1/P2；唯一 P3 是 E13 的组件测试 `portfolio-overview.test.tsx` 未进 CI 与 AGENTS 回归清单，已补。它确认 F2 下从左到右的语言仍拿到原来的对象、U+200E 不进入输入与 CSV 数值列，E13 的 `refreshing` 不参与资金动作可用性、请求有 15 秒超时不会无限保持。扣分在 E13 的 CI 遗漏与未覆盖真实超时、SSR 水合与从右到左的浏览器视觉。
- 限制：F2 的手机下单页涨跌与下单面板持仓数量没有单独的从右到左渲染测试（共用已测的 `markLeadingSign`）；E13 只修了 HTTP 一路，系统休眠或断网后 WebSocket 余额被标为过期时，权益行仍会显示 $0（调研代理的「次因」）；浏览器回归套件留给 CI；未做真机与真实账户验收。

## 后续与替代关系

- 第二组按官方做法的下一批：订单簿表头分组值截断（M2）与计价单位（M9）、盘口完整数字（C5，官方 kPEPE 实测显示 `11,780,616` 而非缩写）、选择器价格口径与本地统计缓存（M4/C9，涉及 ADR 0008 启动取舍，先测首帧）、现货显示名与 `/trade/PUMP/USDC` 404（C3，会改链接）、余额表无价代币计 0、质押与推荐页被动数据（E5）、手机成交历史筛选只在最近 30 条里找（官方启用筛选时补拉最多 2000 条）。
- 仍需运营方决定：F4 布局、D6、D7、C2、C4、E15 与新功能（Chase、Trailing Stop 等）。
- E13 的桌面原因说明（`portfolio-statistics.md` 允许桌面显示）与 WebSocket 休眠后的 $0 仍待另议。
