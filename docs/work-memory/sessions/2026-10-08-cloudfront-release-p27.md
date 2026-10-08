<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-08-cloudfront-release-p27",
  "date": "2026-10-08",
  "title": "CloudFront 生产发布 p27：资金弹窗重做（#78）与邮箱/钱包存款头部一致",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding", "static-hosting"],
  "summary": "用户要求核对邮箱用户与钱包用户的存款弹窗样式是否一致并一并处理。线上 p26 两条路径共用无图标的 Asset/Network 方框，钱包头部有 USDC 标记、邮箱头部没有；用户记得的链上图标来自未合并的 PR #78。把 #78 与 dev 合并（包体基线 3,296,759+340=3,297,099、INDEX 重生成），给邮箱存款表单加同样的 USDC 标记与标题带类；CI 浏览器回归在 1363×260 失败，根因是 #78 的 sr-only 路由标签绝对定位且包含块落在弹窗，下移 52px 后探出弹窗 4px，给路由方框加 relative 修复并钉住。#78 五项 CI 全绿合入 dev（56bcd973），晋升 PR #85 七项全绿合入 main（6ff8ee75），从该提交构建 cloudfront-2026-10-08-p27（开关同 p26）发布：functions、lambda 版本 12、sync（首批 immutable 上传一次失败后重跑成功）、两次分发失效；verify 主网 15/15、测试网 16/16，csp-coverage 33 步 0 违规。真机验收未做；#80 由另一会话处理，#79 待对齐，#73 保持草稿。",
  "thread": null,
  "baseCommit": "c972b1f2",
  "commits": ["d803da44", "5ba0d20f", "57b29ed9", "56bcd973", "6ff8ee75"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit/funds-route-details.tsx" },
    { "path": "apps/terminal/src/lib/tests/deposit-form-routing.test.tsx" },
    { "path": "apps/terminal/tests/browser/account-actions.pw.ts" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "deploy/cloudfront/README.md" },
    { "path": "docs/work-memory/sessions/2026-10-08-cloudfront-release-p26.md" },
    { "path": "docs/work-memory/sessions/2026-10-05-funds-dialog-status-screens.md" }
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p27：资金弹窗重做（#78）与邮箱/钱包存款头部一致

## 背景与范围

同步记录，未取得任务标识（`thread: null`）。p26 发布后用户问：邮箱用户与钱包用户的存款弹窗 UI 是否一致，记得「链上」一行有图标。核对 `dev`（p26 同树）：两条路径共用 `FundsRouteDetails`（Asset / Network 方框，无图标）；外部钱包头部有 40px USDC 标记 + 标题 + 手续费行，邮箱（嵌入式钱包）头部只有标题。用户记得的图标在未合并的 [PR #78](https://github.com/zora4523-bot/gatu-app/pull/78)（资金弹窗重做，`FundsRouteDetails` 的 Asset 行带 USDC、Network 行带 `/coins/ARB.svg`），该 PR 当时落后 `dev` 16 个提交且有冲突；即使合入，邮箱头部仍无标记。用户决定「一并处理掉」。

## 结论与依据

**合并与修改**（分支 `claude/sync-code-start-dev-08b8d0`，该分支当时没有被任何工作树检出）：
- `d803da44` 合并 `origin/dev`：`scripts/check-client-bundle-budget.mjs` 取 dev 的 p26 基线 3,296,759 加 #78 实测的 +340 = 3,297,099（注释保留两段归因）；`docs/work-memory/INDEX.md` 重新生成；`memory:check/test` 通过。
- `5ba0d20f` 邮箱存款表单（`data-deposit-layout="funding-address"`）头部加同样的 `<img USDC size-10 self-center>`，标题带从 `FUNDS_MODAL_LEADING_HEADING_CLASS` 改为与钱包表单相同的 `FUNDS_MODAL_HEADING_CLASS` + `-mt-1 -mb-3 pb-3`；`deposit-form-routing.test.tsx` 断言头部图标在标题带之前；`docs/cctp-deposits.md`、CHANGELOG 各补一句。夹具（`account-actions.html?surface=funds`）截图：两种变体头部一致。
- `57b29ed9` 修 CI 浏览器回归失败：`account-actions.pw.ts:430`「1363×260 下每个资金表单内容不能滚到关闭按钮下面」对第一个（邮箱）表单报 `popupScrolls=true`（弹窗 `scrollHeight` 215 对 `clientHeight` 210）。在夹具里逐元素量：同一图标在两种表单几何相同；去掉图标、步骤列表或 gap 都回到 210；列出所有绝对/粘性定位后代后发现 #78 新加的两个 `sr-only` `<dt>`（绝对定位）的 `offsetParent` 是弹窗，底部 239–240 超出弹窗底 236；内容下移 52px 后它们探出弹窗，弹窗因此可滚 5px。给 `ROUTE_DETAIL_CLASS` 加 `relative`（DOM 实验后 210），单测钉住每个标签父元素带 `relative`。本地资金表单浏览器套件 36/36 通过。
- #78 五个工作流全绿，merge commit 合入 dev（`56bcd973`）。

**发布。** 晋升 PR #85（dev → main）七项 CI 全绿，merge commit `6ff8ee75`。发布工作树 `gatu-release-p26` 先在 dev 头演练（总量 +1,025），再检出 `6ff8ee75` 正式构建 `cloudfront-2026-10-08-p27`（环境变量与 p26 相同；总量 3,297,725，比基线 +626；桌面运行时 202,490，余 639；Lambda 225,916 字节；`verify-chart-build.mjs` 通过；无 `sairn-dev` 槽位）。执行：`functions --execute --origin`（LIVE 11:50:15Z）；`lambda`（版本 12）；`sync` 首次在第一批 immutable 上传时报 `Command failed: aws s3 sync …`（错误原文被当时的过滤管道吞掉，未保留），且因管道未设 pipefail、失效命令仍先执行了一次（11:56Z）；重跑 `sync` 成功（闸门行 `sponsored-mainnet-deposits=on mobile-pairing=off mainnet-card-funding=on`，剩余 11 个文件上传，发布标记与本地一致），随后再次对两个分发失效（12:03Z）。

## 验证与限制

- 线上两网 `/build-meta.json` 都是 p27 / `6ff8ee75`；`verify` 主网 15/15、测试网 16/16，metadata parity 一致。
- `csp-coverage.mjs https://app.sairn.ai`：33 步、2 步跳过、0 违规、0 控制台错误。
- 未做：真机验收（邮箱与外部钱包各开一次存款弹窗）；线上 WebKit 图表探针本次未重跑（加载器与 p26 相同哈希 `6d17e2dafb1007c4`）。
- 首次 `sync` 失败的根因未知；执行脚本时不要把 `deploy.mjs` 的输出接到 `grep | tail` 后再 `&&`，否则失败不会中断链路。

## 后续与替代关系

- #80（外部钱包按需切网络）：其分支所在工作树有另一会话在活动并已推送「merge dev」（`d8158d90`，早于 #78 合入），需要再合一次 dev；#79（agent 文档交接）等 #80 之后对齐；#73 保持草稿。
- 桌面运行时余量 639 字节。
- 上一次发布记录：[p26](2026-10-08-cloudfront-release-p26.md)。
