<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-10-automatic-email-deposits",
  "date": "2026-10-10",
  "title": "恢复邮箱主网 USDC 到账后自动存款",
  "kind": "task",
  "status": "verified",
  "topics": [
    "account-funding"
  ],
  "summary": "恢复邮箱主网自动存款已由 PR #97 接续：补齐资金锁内余额重读、签名前法律核验及持久未知结果通知，随 p30 发布。原本地测试数字保留；p28 的一次手动成功不能替代 p30 自动流程的真实资金验收。",
  "thread": null,
  "baseCommit": "51ee48a8894d6603c85f10e83110908ce8c9897a",
  "commits": ["068f7cb2"],
  "sources": [
    {
      "path": "docs/adr/0040-automatic-email-wallet-deposits.md"
    },
    {
      "path": "docs/cctp-deposits.md"
    },
    {
      "path": "docs/runtime-guardrails.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-10-mainnet-deposit-manual-trigger-investigation.md"
    },
    {
      "path": "apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx"
    },
    {
      "path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts"
    },
    {
      "path": "apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx"
    },
    {
      "path": "apps/terminal/src/lib/tests/use-deposit-routing-guard.test.tsx"
    },
    {
      "path": "apps/terminal/src/lib/tests/embedded-deposit-auto-bridge.test.tsx"
    },
    {
      "path": "apps/terminal/tests/browser/account-actions.pw.ts"
    }
  ],
  "supersedes": []
}
-->
# 恢复邮箱主网 USDC 到账后自动存款

## 背景与范围

用户在前一轮核对原因后明确要求「请移除限制主网自动执行的代码，恢复到正常的流程，确保功能正常」。此次是实施任务，起点为独立工作树的干净分支 `codex/deposit-auto-investigation`，HEAD `51ee48a8`（应用基线 `a310ade1`，加前轮排查记录）。没有取得可核对的 thread 标识，未导出原始会话文件。主检出和其他分支保持原状。

## 结论与依据

- 先记录 ADR 0040 的目标、约束、替代方案和验收标准，再修改实现。用户当前要求取代旧主网强制二次点击决定；不以旧文档阻止该更改。
- 自动宿主按各环境自己的赞助开关启用；`useDeposit` 不再拒绝主网 automatic scope，手动调用仍要求复核余额与费用。
- 邮箱表单移除第二次 Deposit 和返回手动操作的说明，六种语言改为自动转入说明；Done 只关闭表单。外部钱包仍手动提交。
- 精确 owner、最新路由/地区/法律状态/费用/限额、Smart Wallet 链与 paymaster、跨标签页锁、授权 nonce、回执、未知结果与恢复去重均沿用原实现。完整自动宿主测试同时覆盖主网和测试网。
- 自动处理包含会话恢复时已存在的合格 USDC 余额，需要页面运行，不承诺浏览器关闭后的服务端自动发起。

## 验证与限制

版本口径：`51ee48a8` 加本任务工作树改动，Node 22.15.0、pnpm 10.21.0，已在独立工作树完成 frozen-lockfile 安装。未复制真实环境文件，未使用真实账户和签名。

- 回归先红后绿：新增主网自动 scope 单测以及真实 `EmbeddedDepositAutoBridge` + 真实 `useDeposit` 联动测试（钱包、RPC、Circle 和回执为模拟）在旧生产实现上 2/2 失败；放开两个执行边界后 2/2 通过。联动断言 owner、金额、主网合约、无钱包 UI 的赞助提交、恢复记录以及重挂载不重复发送，不把源链确认当最终 HyperCore 到账。
- 首次联动测试运行因全局弹层 store 导入引出未模拟的 `canUseL2Decompression` 而失败；通过只模拟弹层开关修正夹具后取得上述有效回归。随后旧表单测试改写中曾有 `onClose`/实际 `onDone` 名称不符和外部钱包未填金额的两项夹具失败，修正后通过。
- 四个核心文件通过：`embedded-deposit-auto-bridge` 70、`use-deposit-routing-guard` 84、`deposit-form-routing` 40、`deposit-modal-withdrawal-routing-guard` 126，共 320 项。原有余额轮询测试仍输出一次 React act 警告，结果通过。
- 全量命令 `pnpm --filter @sairn/terminal test --maxWorkers=4`：677 文件中 675 通过、1 失败、1 跳过；8972 项通过、2 项失败、1 项跳过，626.52 秒。唯一失败文件为 `design-token-ratchet.test.ts`：删除按钮让任意字号从 112 降为 111、圆角从 200 降为 199，按设计 token 规范下调基线，未增加样式例外。跳过的是需显式启用的 `websocket-soak.test.ts`。
- 最终定向复测：四个核心文件加 `design-token-ratchet.test.ts`，5 文件、324 项全部通过。此版本同时收紧无 Deposit 按钮断言，并为迁移为外部钱包的身份变更用例填写有效金额；应用代码与全量运行时一致，最后只修改测试/计数与文档。没有把第一次全量的失败写成全绿。
- `pnpm --filter @sairn/terminal typecheck` 通过；按仓库 Biome 配置检查 9 个变更的源代码/测试文件通过。Lingui 提取、六语文案补齐和编译通过。883 个相关 Markdown 本地链接目标存在，`git diff --check` 通过。
- 浏览器命令 `pnpm --dir apps/terminal exec playwright test --config tests/browser/account-actions.playwright.config.ts -g 'funding forms readable'`：Chrome 无头、Playwright 协议输入，375/393/1363 px × 深浅主题共 6 项通过，含中文自动说明、无第二次按钮、地址与二维码、Done、中英文草稿保持及外部钱包手动表单。初次验证临时允许 375 px 有无滚动，复核时恢复原有 required 滚动断言，再跑 6/6 通过，最终没有放宽滚动契约。已查看桌面和手机深色截图。浏览器夹具渲染真实表单，但资金调用为模拟；它不证明真实钱包、触屏输入或链上入账。
- 生产构建通过：`pnpm --filter @sairn/terminal build`，环境 `NODE_ENV=production`、`NITRO_PRESET=node-server`、`VITE_MOBILE_PAIRING_ENABLED=false`、`VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true`；无 `.env.local`，构建身份 `SAIRN_BUILD_SHA=51ee48a8894d6603c85f10e83110908ce8c9897a`、`SAIRN_RELEASE_ID=local-mainnet-auto`，执行的是该基线加本任务工作树。客户端、SSR、Nitro 与预渲染通过；441 个客户端 chunk 无静态循环，包体预算通过（总 gzip 3,303,073 字节，移动运行时增量 118,395、桌面 202,386）。构建含第三方 use-client/纯函数注释及大 chunk 警告，没有因此修改依赖或预算。这不是已提交 SHA 的发布构建，也不是发布或真实资金验收。
- 工作记录与索引先前检查通过（工具测试 8/8）；完成时再次生成索引、检查和运行记忆工具测试，最终命令结果见同目录验证日志。
- 本地验证日志放在 Git 忽略的 `.worklog/2026-10-10/automatic-email-deposits/`；没有将真实邮箱、地址、签名或密钥写入记录。

## 后续与替代关系

本记录仅替代前轮排查后的「修复尚未实施」状态，保留其原因、历史提交和验证范围；不整体废弃排查记录。未推送、未部署，真实钱包的赞助提交与最终 HyperCore 入账仍须在发布版本验收。

## 周整理补注（2026-10-12）

068f7cb2 之后 b0a37333 与 525f38c0 修正余额锁定、法律核验和未知结果三项边界，均随 PR #97 和 p30 发布。原未发布状态局部失效，实际自动入金验收仍需独立记录。

后续来源：[2026-10-11-codex-deposit-branch-review](2026-10-11-codex-deposit-branch-review.md)；[2026-10-11-cloudfront-release-p30](2026-10-11-cloudfront-release-p30.md)。

本补注为事后核对，原正文、失败与验证版本保留。本轮只核对 Git、任务记录和相关当前规范；来源执行结果不视为本次重跑。查询时间与实际 head 见[本周整理](2026-10-12-weekly-memory-review.md)。
