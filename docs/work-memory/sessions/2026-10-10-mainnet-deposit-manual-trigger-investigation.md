<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-10-mainnet-deposit-manual-trigger-investigation",
  "date": "2026-10-10",
  "title": "邮箱主网存款未自动入账：手动触发限制与引入提交核对",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "用户要求先核对为何转入 USDC 后仍需点击 Deposit。确认 0c72fa857（2026-08-14，Git 作者与提交者 Mark）同时将自动转入限定为测试网、加入主网手动按钮和执行层拒绝自动请求的守卫；6140b378 后补两步说明。线上 p28/d74dd616 与当前 a310ade1 都有此限制，主网赞助开关已开。4 个相关测试文件 284 项通过；仅核对代码、提交、线上版本元数据及官方文档，未真实充值、未修改执行逻辑，也未取得原始授权对话或具体 agent 身份。",
  "thread": null,
  "baseCommit": "a310ade18291e86617021a44a00c07710844965c",
  "commits": ["0c72fa857687ffb789328ebeac8b2567044dd7f5", "6140b3784d9d519638c7f26e1b7c67f4ad0e5268"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit/deposit-form.tsx" },
    { "path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts" },
    { "path": "apps/terminal/src/lib/tests/embedded-deposit-auto-bridge.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/use-deposit-routing-guard.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/deposit-form-routing.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "url": "https://app.sairn.ai/build-meta.json" },
    { "url": "https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/how-to-start-trading" }
  ],
  "supersedes": []
}
-->
# 邮箱主网存款未自动入账：手动触发限制与引入提交核对

## 背景与范围

用户标注线上存款弹窗的 `Deposit 19.8 USDC` 按钮，询问为什么转账后不能自动入账、谁修改了代码，要求先核对实现，必要时对照官方终端。本次是同步排查记录；历史原因只引用可核实的 Git 与文档，不重建原始对话。

起点为干净的 `codex/sync-2026-10-10`，HEAD `a310ade1`。代码读取与测试在该基线完成；记录写入同一基线的独立工作树分支 `codex/deposit-auto-investigation`。未取得可核对的会话标识与原始会话文件，`thread` 为 null。用户提供的截图仅在本次对话可见，没有将其中的邮箱、钱包地址或未脱敏截图入库。

## 结论与依据

1. **主网自动转入被主动禁止。** `EmbeddedDepositAutoBridge` 中 `automaticDepositEnabled = isTestnet && sponsoredCctpReleaseEnabled`，主网不启动自动存款所需的路由查询、余额轮询与提交。已提交存款的恢复跟踪仍可运行；它不能发起新存款。
2. **手动要求有两层。** `DepositModal` 给邮箱主网表单传 `requiresExplicitFundingDeposit={isEmbeddedDeposit && !isTestnet}`；`DepositForm` 显示两步说明及余额按钮，点击后调用 `handleDepositSubmit`。`useDeposit` 对 `mainnet + smart` 又要求 `executionScope === manual`、已复核余额与手续费，并在资金锁内复查；单改自动组件的布尔条件仍会在执行层被拒绝。
3. **页面地址是嵌入式 owner 的 Arbitrum 钱包地址。** `fundingAddress` 来自 `depositEmbeddedWalletAddress`；按钮金额来自源链 USDC 余额。当前实现的路径是外部转账到该钱包，再由嵌入式 owner 签 EIP-3009、Smart Wallet 赞助提交 CCTP、后续转入 HyperCore。截图中按钮有余额与当前实现一致，但本次未查该用户链上余额或交易记录，不能据此证明其具体交易状态。
4. **根因提交：`0c72fa857`。** Git 作者与提交者都是 `Mark`，提交时间 `2026-08-14 19:08:31 +08:00`，标题 `feat(funds): enable explicit sponsored mainnet deposits`。同一个 diff 加入 `isTestnet` 限制、主网手动按钮、余额/手续费复核和执行层拒绝。父版本 `5b9c83d2` 的自动组件只检查赞助开关，没有测试网限定；这证明代码条件被收紧，不证明此前已在主网部署并成功自动充值。
5. **后续说明：`6140b378`。** 同为 `Mark`，时间 `2026-09-12 11:05:48 +08:00`，标题 `fix(funds): align funding forms and exact transfer amounts`，添加到账后返回点击 Deposit 的两步说明；不是首次关闭自动转入的提交。不能把最近的弹窗样式、余额轮询或壳层改造归为这次行为的起因。
6. **可核实的理由与缺口。** `0c72fa857` 同时修改的 `docs/cctp-deposits.md`、`docs/runtime-guardrails.md` 把发送到钱包与主网继续转入的授权分开，要求用户先复核整笔余额和手续费。仓库记录了该实现理由，但未找到该次变更的原始用户对话；提交没有 co-author 信息，`Mark` 仅是 Git 署名，不能据此认定具体真人、Claude 或 Codex，也不能认定这是用户当时明确要求的产品行为。
7. **官方资料对照。** 2026-10-10 读取 Hyperliquid 官方《How to start trading》：邮箱路径描述向充值地址/二维码转入，最终为 HyperCore USDC，没有列出到账后再次点击存款；外部钱包路径另列金额、Deposit 和钱包确认。项目现有额外点击是自身实现的要求。文档对照不证明官方当前内部 CCTP、代付或地址架构与本项目相同，本次未登录官方终端或进行真实充值。

## 验证与限制

日期均为 `2026-10-10`，本机时区 Asia/Shanghai。

- 通过 `git blame`、`git log -S`、`git show` 对照当前实现、根因提交及其父版本；`d74dd616` 上的自动测试网限定、执行层拒绝和表单手动要求也逐项核对。
- 线上版本：网页工具读取 `build-meta.json` 失败，改用只读 `curl --fail --silent --show-error --max-time 20` 成功。返回 commit `d74dd616173dd96d0106449ea2709e375db3e57e`、release `cloudfront-2026-10-08-p28`，`cctpDeposits.mainnetSponsoredWallet=true`。因此本次现象不能归因为主网赞助开关未开。该元数据证明当前响应的发布身份，不是对用户浏览器缓存或完整链路的验收。
- `gh pr list` 当时只显示待合并的 `dev → main` PR #96（p29 晋升）。这次未推送、合并或部署。
- 在 `a310ade1` 执行：

  ```bash
  pnpm --dir apps/terminal exec vitest run \
    src/lib/tests/embedded-deposit-auto-bridge.test.tsx \
    src/lib/tests/deposit-form-routing.test.tsx \
    src/lib/tests/use-deposit-routing-guard.test.tsx \
    src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx
  ```

  结果：4 文件、284 项通过（35 + 40 + 83 + 126）。现有测试明确断言主网自动宿主不读余额、不提交，执行层拒绝 automatic，弹窗必须点击才提交。`keeps the shown balance while a poll refreshes it in the background` 输出一次 React `act(...)` 警告，未导致失败；本次未修该测试。通过只证明当前手动设计被实现和覆盖，不证明它满足用户期待的自动入账体验。
- 未运行全量测试、类型检查、生产构建、浏览器交互或真实资金操作。本轮无应用代码变更，仅保存排查记录与索引。
- `pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test` 与 `git diff --check` 全部通过；记录工具测试 8/8。环境为 Node `22.13.0`、pnpm `10.21.0`，低于仓库要求的 Node `>=22.15.0`，记忆命令输出 engine 警告。上述通过结果限定于本机版本，不作为受支持环境或 CI 的验收。

## 后续与替代关系

用户本轮要求先查明原因，自动入账修复尚未实施。后续若按其期望实现邮箱主网自动转入，应同时调整自动宿主、执行 scope、界面和上述测试/文档，保留精确 owner、路由、地区、手续费、余额、资金锁以及未知结果去重/恢复守卫。需要明确自动行为的会话范围：现有组件依赖页面运行，不能承诺关闭浏览器后继续自动转入；不能仅删除按钮或改一个 `isTestnet` 条件就宣称完成。

本记录不替代现行资金契约，也不把历史实现理由当成用户当前产品意图。具体历史授权与实际 agent 身份仍缺证据。
