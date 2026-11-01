<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-12-cloudfront-release-p31",
  "date": "2026-10-12",
  "title": "CloudFront 生产发布 p31：自动存款审查修复、滑杆数量闪烁修复、版本号移到设置",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding", "order-entry", "static-hosting"],
  "summary": "运营方要求 #104 的 CI 通过后合入 dev、晋升 main 并发布。#104 合入 dev（2b3a85ea），晋升 PR #105 八项 CI 全绿（含配对开启构建）后以 merge commit 合入 main（74e69f77）。在仓库外工作树 gatu-release-p31 用 Node 22.15.0 构建 cloudfront-2026-10-12-p31（三个闸门全开，总量 3,309,099），按 functions → lambda（版本 15）→ sync（1,644 个文件，发布标记一致）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。线上自 p30 升到 p31。真实邮箱钱包自动存款、真实拖动滑杆、外部钱包建立连接与真机配对清单均未做。",
  "thread": null,
  "baseCommit": "2b3a85ea",
  "commits": ["b2c8a4bd", "b98f2fe8", "4c0da2b8", "2b3a85ea", "74e69f77", "a2c9e209"],
  "sources": [
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "docs/work-memory/sessions/2026-10-12-codex-cli-review-followups.md"},
    {"path": "docs/work-memory/sessions/2026-10-12-slider-percent-basis-flicker.md"},
    {"path": "docs/work-memory/sessions/2026-10-12-ci-terminal-test-shards.md"},
    {"path": "docs/work-memory/sessions/2026-10-11-cloudfront-release-p30.md"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p31：自动存款审查修复、滑杆数量闪烁修复、版本号移到设置

## 背景与范围

同步记录，未取得任务标识。运营方先后要求「CI 过了就合并到 dev，然后晋升 main 并发布」「合并到 dev 完成后请部署到生产服务器」。线上此前是 p30（`ff11eee5`，2026-10-11）。时间均为 UTC。

## 结论与依据

**合并。** p30 之后进入 `dev` 的 PR：[#101](https://github.com/zora4523-bot/gatu-app/pull/101)（版本号从页脚移到设置弹窗，`b2c8a4bd`）、[#102](https://github.com/zora4523-bot/gatu-app/pull/102)（数量滑杆手势期间冻结百分比基准，`b98f2fe8`）、[#103](https://github.com/zora4523-bot/gatu-app/pull/103)（Terminal Tests 两片并行，`4c0da2b8`）、[#104](https://github.com/zora4523-bot/gatu-app/pull/104)（Codex CLI 补审修复，`2b3a85ea`），以及纯文档的 #99、#100。#104 在首轮 CI 全绿后因 GitHub 机器人指出的清单外测试失败又推了一次（见[补审记录](2026-10-12-codex-cli-review-followups.md)），第二轮六项全绿后合入。

**晋升。** [PR #105](https://github.com/zora4523-bot/gatu-app/pull/105)（`dev` → `main`）八项 CI 全绿，含配对开启的生产构建，以 merge commit 合入：`main` `74e69f77`。PR 上机器人的一条 P2（新增的 `order-entry-percent-basis.test.tsx` 不在 CI 手选清单里）成立，不影响发布的代码，随本记录的 PR 补进 `terminal-tests.yml` 的滑杆步骤，并把 #104 涉及的三个资金测试补进 AGENTS.md 的回归清单。

**闸门。** 按运营方 2026-10-11 的决定，三个闸门默认全开，未再询问。

**构建。** 仓库外工作树 `gatu-release-p31`（`.env.local` 软链主检出、不读内容，Node 22.15.0、pnpm 10.21.0）。命令行显式写出：`SAIRN_BUILD_SHA=74e69f77d0d154fdd48b128fc5face3a70b6bcc7 SAIRN_RELEASE_ID=cloudfront-2026-10-12-p31 VITE_HYPERLIQUID_TESTNET= VITE_MOBILE_PAIRING_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm build`，再 `build:lambda`。442 个客户端 chunk 无环；总量 3,309,099 gzip（基线 +4,620）、静态启动 1,637,527、手机运行时 118,394、桌面运行时 202,401、`api-wallet` 18,253（单 chunk）；Lambda 226,852 字节。`build-meta.json`：commit `74e69f77`、release `cloudfront-2026-10-12-p31`、`mobileSync.enabled=true`、`cctpDeposits` 主网赞助 true / 测试网外部 true / 测试网赞助 false、`privyFiatFunding` 两网 true、图表入口同 p30。`verify-chart-build.mjs` 通过；产物中无 `gatu.ai`。

**发布。**
1. `functions --execute --origin https://app.sairn.ai`（03:46:12Z）：3 个当前 + 1 个上一版内联脚本哈希，两个函数 LIVE。
2. `lambda --function-name gatu-terminal-api --execute`（03:46:35Z）：版本 15。
3. `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（03:46:53Z）：闸门行 `sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`，1,644 个文件上传、0 个失败，`Release markers match the local build: _shell.html, build-meta.json`。
4. 失效：主网 `IB1YBIC6C2M41OBTIANSE0W5EG`（03:50:41Z）、测试网 `ID00V9O2ISDXF4P5KSE9A8RKG7`（03:50:39Z），03:51:02Z 均 Completed。

## 验证与限制

- `verify --network mainnet`：15/15 ok；`--network testnet`：16/16 ok。两网 `build metadata parity` 为 `74e69f77 / cloudfront-2026-10-12-p31 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`；签名 `POST` allowed；壳预加载 114 个链接；壳与图表 bundle 边缘命中。
- `csp-coverage.mjs https://app.sairn.ai`：33 步、2 步跳过（桌面 WalletConnect 与手机图表页，同前几次）、0 违规、0 控制台错误。
- 发布日志在会话暂存目录，未入库。
- 未做：真实邮箱钱包的主网自动存款（含「余额已在、条款未接受」与授权到期后恢复两种场景）；在 HYPE 等小最大值交易对上真实拖动滑杆；真实外部钱包建立连接；真机配对清单 RD-1..RD-3。CHANGELOG 仍在 Unreleased 下。
- 发布工作树 `gatu-release-p31` 保留到下次发布；`gatu-release-p30` 是回滚产物；`gatu-release-p28`、`gatu-release-p26` 可删除。

## 后续与替代关系

- 待做：上面四项真实验收。
- 上一次发布记录：[p30](2026-10-11-cloudfront-release-p30.md)。
