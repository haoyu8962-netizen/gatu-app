<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-10-mainnet-deposit-manual-trigger-investigation",
  "date": "2026-10-10",
  "title": "邮箱主网存款未自动入账：手动触发限制与引入提交核对",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "用户要求核对为何转入 USDC 后仍需点击 Deposit。0c72fa857（Git 署名 Mark）引入主网手动限制；修复另有记录。线上 p28/d74dd616 尚不含本地 068f7cb2。Important 是固定网络/资产提醒，不是报错。用户随后报告 Another Circle CCTP deposit 长时间拦截；经其指定内置浏览器，只读确认存在未到期 submission-unresolved 授权、无源交易跟踪记录，链上源钱包余额仍在且授权未使用。该文案混用了待转发交易和无哈希未知提交两种状态；原始提交失败响应缺失，未认定具体钱包/Bundler/Paymaster 故障。未清除记录、重签、广播或发布。",
  "thread": null,
  "baseCommit": "a310ade18291e86617021a44a00c07710844965c",
  "commits": ["0c72fa857687ffb789328ebeac8b2567044dd7f5", "6140b3784d9d519638c7f26e1b7c67f4ad0e5268", "783f50f0d84cd7016677ceb657b55282728c7c45", "068f7cb24904935ebe2018118bed11f95e13180c"],
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

2026-10-10 后续：用户已明确要求恢复自动流程，实施与验证见[邮箱自动存款修复](2026-10-10-automatic-email-deposits.md)及 [ADR 0040](../../adr/0040-automatic-email-wallet-deposits.md)。本记录保留修复前事实，旧二次点击要求不再代表当前产品决定。

## 同日后续：线上 Important 网络提醒复核

用户继续询问线上「Important: send only native USDC on Arbitrum…」是否为报错。本次基线为干净的 `codex/deposit-auto-investigation` / `068f7cb2`，只核对并追加记录，没有修改应用代码。

- 再次只读请求线上 `build-meta.json`，返回 `cloudfront-2026-10-08-p28` / `d74dd616173dd96d0106449ea2709e375db3e57e`，主网赞助开关仍为 true。本地自动存款修复尚未发布；该响应不证明用户浏览器缓存身份。
- 直接读取该发布提交的 `deposit-form.tsx`：310–314 行的 `showFundingDestinationDetails` 只要求路由已确定为 CCTP、赞助开关已开、无存款不可用原因、地址状态为 loading 或 ready；324–329 行定义固定的 `fundingNetworkNotice`，409–416 行随目的地址详情显示。因此这段文字不由交易失败、RPC 异常或检测到错误币种触发，也不参与存款提交守卫。
- 红色外观来自 `border-stroke-error-weak bg-error-soft text-market-close-danger`。真正的 `embeddedDepositStatus` 与 `preflightError` 是其他条件分支，并各自使用 `role="alert"`。固定提醒本身没有该角色。其视觉容易被理解为报错，但不能据此判断用户转错资产或存款失败。
- 当前措辞来自 `783f50f0`，Git 作者/提交者 `zora4523-bot`，时间 `2026-10-04 21:07:47 +08:00`，提交 trailer 为 `Co-Authored-By: Claude Fable 5.1`。diff 将既有提醒中的旧最低额说明移除，改为当前网络/资产措辞；不是首次新增固定警示框，也不是关闭主网自动存款的提交。理由见[当时的最低额记录](2026-10-04-cctp-deposit-minimum.md)：按 CCTP 规则去掉旧桥的 5 USDC 文案，提醒只描述支持的网络和资产。记录不是原始完整对话，Git 署名也不等于本次取得了具体执行过程。
- `068f7cb2` 保留了这条固定网络提醒；恢复自动存款不意味着提示消失。应用代码及 `docs/cctp-deposits.md` 把它定义为充值入口说明，不是某笔资金状态的证据。

本次验证限于发布元数据、对应 Git 源码、历史 diff 和既有测试断言的阅读。没有登录或操作线上钱包，没有核对个人交易、运行新的应用测试或执行发布。记录追加后，`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）及 `git diff --check` 全部通过，环境为 Node `22.15.0`、pnpm `10.21.0`；这些是记录维护检查，不是新的应用功能验收。

## 同日后续：另一笔 CCTP 存款待处理的实际拦截

用户补充「Another Circle CCTP deposit is still pending for this account…」，并说明持续很久、一直无法入账。本轮基线为干净的 `5919efe8`。用户明确指定「直接检查当前内置浏览器」后，才读取已有生产页面；未在其他浏览器重建会话。账户地址、金额、授权 nonce 及具体账户请求不写入仓库。

- 线上版本再次核对仍为 p28 / `d74dd616`。该版本 `use-deposit.ts` 1229–1238 行将两个情况映射到同一句提示：存在源链交易跟踪记录；或 smart 模式存在尚未过期的 `CctpSponsoredAuthorizationIntent`。检查发生在新签名与广播前，不能把文案理解为 Circle 返回了该笔交易仍在处理的状态。
- 页面只读证据：只存在一份 `submission-unresolved` 授权意向，没有 source-submitted 跟踪记录或源交易哈希；该意向创建约 41 分钟，观察时仍在有效期内。它在 `smartClient.sendTransaction` 之前写入；未返回哈希的异常、未知结果或页面中断会保留它。因此定位到的直接拦截原因是未知提交的本地授权保护，而非已证明 CCTP 转发很慢。
- 通过代码配置的 Arbitrum 公共 RPC，在同一块 `513507793`（2026-10-10 12:07:09 UTC）只读查询原生 USDC `balanceOf` 与 `authorizationState`：源钱包余额仍与待存款金额一致，授权状态为 false。该授权在查询时未被使用/取消，不能由此断言仍有效的签名以后不会执行。未发起链上写入。
- `CCTP_AUTHORIZATION_WINDOW_SECONDS` 为 3,600；`readCctpSponsoredAuthorizationIntent` 在下次读取发现 `validBefore` 已到时删除过期意向。保留中的源交易记录则走独立恢复流程，不适用一小时授权过期规则；不得笼统承诺一小时后所有待处理存款都会解除。
- 正常恢复会先核对源链精确事件，再查询 Circle。纯意向没有源哈希，当前恢复 Hook 无法按源哈希跟踪它；没有实现按该意向主动查找源交易的恢复。现有提示也没有区分这两种情况或显示授权到期时间。这些是代码能力与呈现的事实，不是本轮已实施的修复。
- 原始提交的异常未保留在当前可读取的页面日志；当前页面资源状态不能反推旧提交失败原因。因此无法认定具体 Privy、Bundler、Paymaster 策略、RPC 或网络故障。已为该页启用只读 Network 调试观察，便于用户后续操作时核对失败响应；没有让 agent 点击 Deposit、清除存储或生成新授权。
- 提交历史：待处理拦截始于 `209471a0`，`69b10403` 加入当前记录检查和 sponsored intent 分支，Git 均署名 Mark；`eaa6567f` 后续替换为本地化错误类型。它们与主网自动执行限制的 `0c72fa857` 不同，自动流程修复保留这些去重/未知结果保护。

本轮只追加诊断记录及索引，不修改应用逻辑；尚未复现并取得最初无哈希提交的错误响应，也未证明资金已进入 HyperCore。下一步由用户在旧授权失效后操作存款，观察具体失败响应或交易哈希；失败原因确认前不以清空记录或删除保护作为修复。`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）及 `git diff --check` 通过；未重跑应用测试或构建，因为应用代码未变。
