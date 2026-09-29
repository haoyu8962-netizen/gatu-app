<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-29-funds-ui-followups",
  "date": "2026-09-29",
  "title": "通知审查的后续：划转/发送结果不明、金库与推荐卡显示、中文存款/提款用词、Bridge2 残留",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "i18n-runtime"],
  "summary": "处理通知文案审查留下的待决项。用户要求先审查规划，再「按建议执行」：发送结果不明时清掉草稿；用词按「按钮、标签、名词用存款/提款，带宾语的动词短语保留存入/提取」全量统一。五批：1 划转/发送结果不明改为与提款一致的常驻警告，发送不再保留可一键重发的草稿；2 金库名称完整换行（计划的两行上限在 320 宽放不下真实长名称，改为不限行）、详情图表数值移到图表上方、11 条中文 Vault 改为金库；3 推荐码完整换行、步骤标签窄屏内边距与 text-balance，并修复实测发现的既有缺陷：手机网格没有显式列，邀请链接把卡片撑宽、被外层 overflow-hidden 裁掉；4 中文 30 条存入/提取标签改为存款/提款（含桌面持仓工具栏按钮）；5 删除不可达的 Bridge2 存款成功通知、自动存款暂停提示与旧桥网络配置，更正 4 份文档里并不存在的 Bridge2 恢复说法。每批浏览器或单测断言都在改动前的代码上验证过会失败。",
  "thread": null,
  "baseCommit": "ddb7b566",
  "commits": ["60b2a01a", "51fbdd8c", "1be6acba", "dca75db8", "a41c2292", "c6df45fb"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/positions/transfer-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/send-modal.tsx" },
    { "path": "apps/terminal/src/components/vaults/vault-performance-chart.tsx" },
    { "path": "apps/terminal/src/components/vaults/vaults-list.tsx" },
    { "path": "apps/terminal/src/components/referrals/referral-code-card.tsx" },
    { "path": "apps/terminal/src/components/referrals/referral-dashboard.tsx" },
    { "path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts" },
    { "path": "apps/terminal/tests/browser/vaults-list.pw.ts" },
    { "path": "apps/terminal/tests/browser/referral-code-card.pw.ts" },
    { "path": "docs/funds-dialog-outcome-plan.md" },
    { "path": "docs/i18n-presentation.md" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": "docs/work-memory/sessions/2026-09-29-notification-copy-review.md" },
    { "path": "CHANGELOG.md" }
  ],
  "supersedes": []
}
-->
# 通知审查的后续：划转/发送结果不明、金库与推荐卡显示、中文存款/提款用词、Bridge2 残留

## 背景与范围

同步记录，没有取得可核对的会话 ID。[通知文案审查](2026-09-29-notification-copy-review.md)留下几项待决。用户要求继续审查并规划其中三类：划转与发送结果不明、Bridge2 存款成功通知走不到、界面遗留（推荐码截断、推荐步骤中文单字成行、金库长名称、金库详情图表压字、11 条中文「Vault」）。审查阶段由两个只读子代理分别查划转/发送与 Bridge2，UI 在内置浏览器实测；每条代理结论都对照代码复核。审查另外发现两处用词问题：桌面持仓工具栏的存款/提款按钮是「存入 / 提取」，金库、质押、Earn 的按钮是「提款」而弹窗与提示写「提取」。

用户决定「按建议执行」：发送结果不明时清掉草稿；用词规则定为按钮、标签和名词用「存款/提款」，带宾语的动词短语保留「存入/提取」。工作在 `.claude/worktrees/funds-ui-followups`（分支 `claude/funds-ui-followups`，基线 `ddb7b566`），完成后快进合并回 `claude/from-dev-0928`，未推送。

## 结论与依据

### 第 1 批：划转与发送结果不明（`60b2a01a`）

交易所请求超时、断网、5xx 或 408（`isAmbiguousExchangeActionError`）时请求可能已经执行，以前只弹 3 秒自动消失的红色错误；发送还把目的地址和数量存成草稿，重开即回填，一键就能再发一次，违反 `trading-notifications.md`「未知不能显示为失败」。执行前守卫里的信息查询失败都被包装成确定的资金错误，不会被误判为结果不明。改为与提款一致的常驻警告（`Transfer status unknown` / `Send status unknown`，说明指向划转与发送都记录在内的「存款和提款」页签）；发送结果不明时不保存并清掉草稿，已不是当前尝试的旧请求同样清草稿但不通知；确定失败（含 429）仍保存草稿。没有为划转、发送新增持久标记或账本对账。

### 第 2 批：金库页面（`51fbdd8c`）

- 详情图表：「账户价值 / PNL」数值原来绝对定位盖在折线上。实测 HLP 30 天账户价值，375 宽 400 个采样点里 66 个落在数值框内，1466 宽 29 个。改为数值在上方正常排版、折线占剩余高度，图表总高度不变。
- 名称：375 宽中文下前 40 个真实金库里 6 个名称被截断（含 HLP）。计划是最多两行，但夹具里的「[ Systemic Strategies ] ♾️ HyperGrowth ♾️」在 320 宽需要三行，两行上限仍会截断；按样式指南「名称要完整显示」改为不限行完整换行，手机卡片与桌面表格一致。
- 11 条中文「Vault」全部在金库详情页的提示里，改为「金库」。

### 第 3 批：推荐卡（`1be6acba`）

- 推荐码由单行截断改为 `break-all` 完整换行。注入同款标记实测：375 宽约 14 个字符、320 宽约 10 个字符就会被截断，推荐码最长 20 个。
- 编写浏览器用例时发现一个既有缺陷：推荐页手机网格没有显式列（`referral-dashboard.tsx`），`nowrap` 的邀请链接把隐式列撑宽，320 宽下即使是 4 个字符的推荐码，卡片也比所在列宽 25px，被外层 `overflow-hidden` 静默裁掉右缘。这和金库列表此前的问题同类，用同样的 `grid-cols-1` 修复，并把「单列手机网格要显式 `grid-cols-1`」写入 `.claude/rules/style-ui-guide.md`。最初的断言只拿推荐码与自身比较，看不到整张卡被撑宽，改为比较卡片与所在列的内容框，并且检查左右两侧（阿拉伯语从右往左排版，卡片会向左撑出）。
- 步骤标签：手机上内边距改为 `px-1.5`，375 宽「创建推荐码」「邀请交易者」可一行放下；另加 `text-balance`，必须换行时平均分行（5 个字折成 3+2）。修好网格后 320 与 375 宽即使没有 `text-balance` 也不会单字成行，但常见的 360 宽标签区约 52px，仍会折成 4+1；`c6df45fb` 把 360 宽加入用例，去掉 `text-balance` 时该用例失败。

### 第 4 批：中文存款/提款用词（`dca75db8`）

按上述规则改了 30 条：工具栏按钮「存入 / 提取」→「存款 / 提款」（来自 2026-08-05 的 `cc2e225b` 给这两个按钮单独加的语境译文），金库、质押的提款标签（提款已锁定、提款规则、从金库提款、待处理提款、提款队列），恢复提醒标题（金库/质押存款与提款，与账本里已有的「金库存款 / 金库提款」一致），HIP-3 清算人账本条目，以及「本次存款未提交」等名词用法。保留的：带宾语的「提取金库权益」「提取抵押品」「提取资金」「提取 USDC 至 Arbitrum」，Earn 的 Supply（「存入借贷」）体系。规则写入 `docs/i18n-presentation.md`；CHANGELOG 里第一轮「everywhere」的说法同时更正。

### 第 5 批：Bridge2 残留（`a41c2292`）

- 充值成功状态只会在 `use-deposit.ts` 放行 CCTP 路径之后写入（非 CCTP 路由在签名前抛出），弹层里「成功但不是当前 CCTP 充值」的 `Deposit submitted` 分支自 2026-08-13 迁移起不可达，只有把执行路由强设为 `bridge` 的测试能走到；自动存款里 Bridge2 暂停提示同样不可达（路由为 `bridge` 时同一次渲染里 `sponsoredCctpEnabled` 为假，外层条件不成立）。两处连同那条只测不可能状态的用例删除，三条词条成为废弃词条。
- `config/contracts.ts` 的旧桥网络配置只在 Hyperliquid 返回 `bridge` 路由、存款暂停时用来读余额；删除后统一读 CCTP 配置，测试网暂停时的余额改读 Circle USDC（主网地址相同）。这是唯一可见的差异，只在测试网暂停状态出现，未写入 CHANGELOG。
- 迁移前的提交里，与 "bridge" 相关的存储只有 LI.FI 跨链桥的执行恢复，Bridge2 存款从未存过恢复数据；过去的存款和其他存款一样出现在账本里。`hyperliquid-signing.md`、`runtime-guardrails.md`、`trading-onboarding.md`、`cctp-deposits.md` 所写的「保留 Bridge2 恢复」描述的是不存在的东西，已更正。执行边界拒绝 Bridge2 的守卫、`bridge` 路由时的暂停提示、`withdraw3` 提款路径保留。

## 验证与限制

均在该 worktree（新装依赖，`tsc` 为锁定的 5.7.2），2026-09-29，本地 macOS。浏览器用例是 Playwright 在夹具页面里以脚本读取布局，不是真人操作；推荐卡的步骤与推荐码只在连接钱包后显示，审查阶段的数据是把同款标记插入实际页面测得的。

- 第 1 批：`funds-action-balances.test.tsx` 75 项通过；把两个弹窗换回改动前版本，新用例中 4 条失败（429 保留草稿那条是保护用例，新旧都通过）。资金、错误文案、多语言、资金锁、数字格式等 12 个文件 360 项通过；typecheck 退出码 0。
- 第 2 批：`vaults-list.pw.ts` 8 项通过；改动前的组件下 6 项失败（4 项名称被截断、2 项数值框压在绘图区上）。金库与多语言相关 11 个文件 252 项通过；typecheck 退出码 0。
- 第 3 批：`referral-code-card.pw.ts` 16 项通过。只换回旧卡片组件时 3 项失败（两个宽度下推荐码被截断、375 宽中文单字成行）；只去掉 `grid-cols-1` 时 320 宽 en/zh/fr/es/hi 与两条推荐码用例共 7 项失败，改为左右两侧检查后阿拉伯语 320 宽那条也失败。推荐相关 7 个文件 62 项通过；typecheck 退出码 0。
- 第 4 批：只改中文目录，缺译数仍为 ar/es/fr/hi 各 44、zh 3；账本、恢复提醒、质押、金库、Earn、多语言相关 18 个文件 463 项通过。
- 第 5 批：删除分支后 Biome 指出自动存款 effect 的依赖多了 `usdcRoutingQuery.data?.depositRoute`，已去掉。存款、CCTP、自动存款、提款、资金锁与多语言相关 30 个文件 855 项通过；typecheck 退出码 0；三条词条成为废弃词条，缺译数不变。
- 360 宽用例：`referral-code-card.pw.ts` 18 项通过；第一次完整运行时原有的「320 宽英文步骤标签」用例在 30 秒处超时（整轮的第一条，承担夹具冷启动，整轮 1.7 分钟），不是断言失败，重跑 18 项全过（49.5 秒）。
- 全量 `pnpm --filter @gatu/terminal test`（`c6df45fb`，即五批与 360 宽用例之后）：635 个文件中 633 通过、1 跳过、1 失败；7,879 项中 7,877 通过、1 跳过。唯一失败仍是 `chart-build-assets.test.ts` 的 TradingView 源树摘要校验在全量并行负载下超过 5 秒（9.7 秒），与本次改动无关；单独重跑 17 项通过，该用例 512ms。总数比上一轮 7,881 少 2：第 1 批新增 5 条，第 5 批删 1 条用例、目录测试少 1 条词条 × 6 种语言。
- 与 `claude/withdrawal-fee-review-bound`（`e890a5a2`）的合并预演（`git merge-tree`）：`deposit-modal.tsx`、存款路由测试与六个语言目录都能自动合并；冲突只在 `CHANGELOG.md`、`docs/confirmation-surfaces.md`、`docs/funds-dialog-outcome-plan.md`，都是两边在同一处追加内容，保留两边即可。
- 未做：真实钱包的划转、发送与存款，真实网络下的超时，真机截图。

## 后续与替代关系

- 本记录处理了[通知文案审查](2026-09-29-notification-copy-review.md)「后续」里除 CCTP 手续费（另一会话 `claude/withdrawal-fee-review-bound` 处理）与圆角统一之外的各项，以及[页面边距对抗审查](2026-09-29-gutter-adversarial-review.md)里推荐码截断与中文单字成行两项；不整体替代它们。
- 仍未做：推荐领取历史与被推荐交易者卡片的浏览器覆盖；三个整页白底页面的浏览器夹具；各页卡片圆角是否统一；金库列表只有一组时的重复组名。
- 与另一会话的分支 `claude/withdrawal-fee-review-bound` 同改 `deposit-modal.tsx`、存款路由测试与各语言目录，改动区域不重叠；合并预演结果见「验证与限制」。
