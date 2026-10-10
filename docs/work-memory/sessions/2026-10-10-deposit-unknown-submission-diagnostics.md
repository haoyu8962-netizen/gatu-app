<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-10-deposit-unknown-submission-diagnostics",
  "date": "2026-10-10",
  "title": "线上存款重试无哈希：未知授权提示与脱敏诊断修复",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "account-funding"
  ],
  "summary": "用户重新点击线上存款后继续排查。p28/d74dd616 产生新的 submission-unresolved 授权但无源哈希，链上余额仍在且授权未用；原始失败响应已不在调试缓冲，不能认定具体上游故障。本地修正无哈希仍声称已提交和两类 pending 混用，接入现有脱敏错误上报。保留有效授权与防重复提交；随后有效期内再次点击，捕获到同一本地 pending 守卫，未重新发起交易。真实提交故障仍待到期后捕获响应，未发布。",
  "thread": null,
  "baseCommit": "82ac5c7b",
  "commits": [],
  "sources": [
    {
      "path": "docs/cctp-deposits.md"
    },
    {
      "path": "docs/funds-dialog-outcome-plan.md"
    },
    {
      "path": "docs/work-memory/sessions/2026-10-10-mainnet-deposit-manual-trigger-investigation.md"
    },
    {
      "path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts"
    },
    {
      "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx"
    },
    {
      "path": "apps/terminal/src/lib/error-reporting/report.ts"
    },
    {
      "path": "apps/terminal/src/lib/error-reporting/client.ts"
    },
    {
      "path": "apps/terminal/src/lib/tests/client-error-report.test.ts"
    },
    {
      "path": "apps/terminal/src/lib/tests/client-error-report-server.test.ts"
    },
    {
      "path": "apps/terminal/src/lib/tests/use-deposit-routing-guard.test.tsx"
    },
    {
      "path": "apps/terminal/src/lib/tests/deposit-modal-withdrawal-routing-guard.test.tsx"
    }
  ],
  "supersedes": []
}
-->
# 线上存款重试无哈希：未知授权提示与脱敏诊断修复

## 背景与范围

用户已在当前内置浏览器再次点击存款，要求继续检查请求、找出无法入账的原因并修复。本轮沿用 `codex/deposit-auto-investigation` 独立工作树，起点 HEAD `82ac5c7b`，工作区干净。只读检查指定的内置浏览器和源链；没有清理授权、签名、发送交易、发布或更改线上资金流程。记录为本轮同步摘要，未获得可核对的 thread 标识或原始会话导出，不重建缺失响应。

## 结论与依据

- 线上仍是 `cloudfront-2026-10-08-p28` / `d74dd616173dd96d0106449ea2709e375db3e57e`，不含此前本地恢复自动存款的 `068f7cb2`，也不含本轮修改。
- 相比前一轮，浏览器出现新的未到期 `submission-unresolved` 授权，仍无源交易跟踪记录或哈希。Portfolio 的 Deposits & Withdrawals 为空，通知说“Deposit status unknown”，却同时声称 Arbitrum 交易已提交。
- Arbitrum 公共 RPC 在块 `513517073`（2026-10-10T12:49:19Z）返回：源钱包 native USDC 余额仍等于本次拟转入金额，`authorizationState` 为 false。只能证明该块时未消耗授权、尚未从源钱包扣走这一余额；不能证明请求从未到过 Bundler，或今后不能执行。
- 原始失败响应已不在调试事件缓冲中，读取结果标记 truncated；页面日志、资源列表与可读错误对象也未保留对应失败。原执行状态在关闭弹窗后已 reset。没有把这种缺失写成“Paymaster 拒绝”或“Circle 故障”。
- 在当前页安装临时、内存中的执行状态订阅，捕获下一次错误后才 reset 的原因链并脱敏 URL、长十六进制值和 token；不持久化、不发送数据、不触发资金操作。后续捕获结果见下一条。刷新会丢失该临时订阅。
- 用户随后反馈“还是失败，是不是线上 CCTP 没开启”。新捕获的错误是 `LocalizedActionError`，编译消息 ID `T/zkAs`；在英文编译目录核对其对应原 pending 文案，`hasHash=false`、`outcomeUnknown=false`。同一条旧授权仍未到期、源记录仍为零，所以这次在前端守卫被拦截，没有再次执行 Smart Wallet 交易提交，不能视为新的上游拒绝。重新读取线上 build-meta 确认 `mainnetSponsoredWallet=true`；开关开启不等于 Paymaster 配额或策略可用，本轮仍未获得最初的上游错误。
- Git 历史：`69b10403`（署名 Mark，2026-08-13，`feat(funds): migrate deposits to Circle CCTP`）引入本次涉及的无哈希未知提交路径与授权记录。相同 pending 文案在 `209471a0` 已出现，`69b10403` 用于无哈希授权拦截。它们解释提示与保护的来源，不证明是本次上游失败的起因；署名不推定为特定真人或模型。

## 本地已实施修改

1. 无哈希未知提交通知明确“钱包没有返回交易哈希；已签署授权可能仍有效”，有源哈希的待确认文案与浏览器链接保留。
2. 无哈希授权的重复提交拦截改用独立文案，不再说另一笔 Circle 存款正在处理中。六种语言同步。
3. 在存款 Hook 捕获提交失败、弹窗 reset 之前，使用现有 `reportClientError` 上报 `deposit_submission`，阶段为 `before_source_hash` 或 `source_confirmation`。最多读取八层原因链，仅输出白名单错误类别；不记录原始消息、地址、金额、nonce、calldata、签名或服务端点。它是诊断分类，不改变成功/失败判定。
4. 沿用既有上报限流、去重和同源接口；上报异常不会阻止存款状态结束或替代原错误。服务端同一 schema 验证新字段，拒绝未知类别。没有建立另一套遥测通道。
5. 资金、签名、路由、确切 owner、有效授权、过期和防重复扣款机制保持。变更前已把目标、约束、替代方案和验收标准写入 CCTP 文档；本次修复不宣称资金已到账。

## 验证与限制

验证版本：`82ac5c7b` 加本轮工作树，Node 22.15.0 / pnpm 10.21.0。

- 第一组定向回归：3 文件 229 项通过（客户端脱敏上报、真实 useDeposit 提交 Hook、真实存款弹层；钱包与请求模拟）。覆盖新文案、关闭后原错误清理但诊断已发起、有效授权阻止重签、诊断失败不阻止结局。原有余额轮询用例有一次 React act 警告，测试通过。
- Lingui 提取与六语编译通过。新增两个消息均已翻译；提取时显示的其他历史缺译不在本轮扩展范围。
- 首次 typecheck 失败：遍历所有上报 kind 的限流测试未给新增类型提供 depositStage。补上相应分支后，完整 typecheck 通过。
- 第一次全量未限制 worker 数，同时有独立类型检查等任务：`mobile-agent-sync-modal` 出现失败和 act 级联警告（26 项失败），`adaptive-modal-dismissal` 与 `tp-sl-section` 各一项失败；该运行未完成，主动中止（退出 130）。没有改动这些测试或放宽断言。降低并发后，三文件原样通过；前后运行差异包括并发负载，未单独证明所有初次失败的原因，也未把它当本次业务修复。
- 最终全量 `pnpm --filter @sairn/terminal test --maxWorkers=4`：676 文件通过、1 文件跳过；8997 项通过、1 项跳过，303.21 秒。该运行开始前已完成最终文案和类型测试修正，覆盖最终应用代码与测试。跳过的是需显式启用的 websocket soak。
- `pnpm exec biome check` 对 9 个改动 TS/TSX 文件通过；`pnpm --filter @sairn/terminal build:lambda` 通过（index 226.62 kB）；最终六语编译通过。本轮未重新构建完整客户端发布产物，未部署。
- `git diff --check` 通过，70 个改动文档中的本地链接目标存在。首次 memory:index/check 因新记录缺少规定标题而失败，修正标题后 index、check 与 memory:test（8/8）通过；最终补记验证结果后再次运行。
- 本地验证日志在 Git 忽略的 `.worklog/2026-10-10/deposit-retry/`。真实账户、金额、nonce、签名与失败响应原文未写入 Git；本次只记录源链只读核对的结论。

## 后续与替代关系

真实不能入账的根因尚未确认。需要在当前有效授权自然到期后，由用户在保留临时订阅的页面发起下一次存款，再读取具体 SDK 原因链及对应失败响应；不绕过授权记录，不由 Agent 代点资金提交。若页面刷新，先重新安装观察再由用户操作。按新响应修复确定的问题后，还需验证对应发布版本的源链确认与最终 HyperCore 余额；本地单测或提示修复不能替代这个验收。
