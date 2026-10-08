<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-03-cloudfront-release-p24b",
  "date": "2026-10-03",
  "title": "CloudFront 生产发布 p24b：main 6da4c15a，银行卡入金主网与测试网打开",
  "kind": "task",
  "status": "verified",
  "topics": ["account-funding", "static-hosting"],
  "summary": "用户要求合并到 main 并发布、开启所有开关；确认范围时用户选择银行卡入金主网与测试网都打开、其余开关沿用 p24，知情于上线清单的前两个阶段（律师审阅、沙盒验收、本地最低金额真实购买）都未完成、Privy 应用仍是 development mode。文档 PR #74 合入 dev（edba5624），晋升 PR #75 七项 CI 全绿后合入 main（6da4c15a）。仓库外工作树从 main 构建 cloudfront-2026-10-03-p24b，产物与 p24 逐项比对只有两个入金开关与构建标识不同；functions、lambda（版本 10）、sync（带 --allow-sponsored-mainnet-deposits 与 --allow-mainnet-card-funding）、两个分发失效依次执行；verify 主网 15/15、测试网 16/16，csp-coverage 33 步 0 违规。线上真实购买（CF-11）尚未做。",
  "thread": null,
  "baseCommit": "edba5624",
  "commits": ["8a2a6de2", "edba5624", "6da4c15a"],
  "sources": [
    { "path": "deploy/cloudfront/README.md" },
    { "path": "docs/privy-card-funding-launch-checklist.md" },
    { "path": "docs/adr/0034-privy-card-funding.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-privy-card-funding.md" },
    { "path": "docs/work-memory/sessions/2026-10-01-sairn-domain-cutover-plan.md" }
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p24b：main 6da4c15a，银行卡入金主网与测试网打开

## 背景与范围

同步记录，未取得任务标识（`thread: null`）。2026-10-03 用户要求「合并到 main 并且发布 开启所有开关」。发布前线上是 p24（`cloudfront-2026-10-02-p24`，main `3ced842e`）：主网赞助存款开、测试网外部钱包存款开、测试网赞助存款关、移动配对关，还没有银行卡入金。

「所有开关」有歧义：构建期开关共十个，其中移动配对按 AGENTS 规定在真机清单记录前保持关闭，另有组合保证金激活、LI.FI 跨链创建等高风险交易能力和开发用的性能分析开关。我请用户在三项里选：先只开测试网沙盒（按上线清单的第二阶段，我的推荐）、入金主网与测试网都开、字面意义的全部开关。提问里写明了主网的上线前提（律师审阅法律文本、沙盒验收、一次最低金额真实购买）都还没做，Privy 应用仍是 development mode，打开主网就是线上用户可以真实付款。**用户选择「入金主网与测试网都开」**，其余开关沿用 p24。

发布号用 `p24b`：仓库文档里的「p25」已指定给退役旧域名的清理发布（草稿 PR #73、ADR 0032、切换方案），这次不占用这个名字。

## 结论与依据

**这次发布没有按[上线验收清单](../../privy-card-funding-launch-checklist.md)的三阶段顺序进行**：跳过了「发布之前」与「沙盒发布」两个阶段，`legal/` 的法律文本没有经过审阅、也没有修改，Privy 应用没有升级出 development mode。这是运营方知情后的决定；发布工具本身只要求 `--allow-mainnet-card-funding`，不检查清单。

**合并。**

- 文档 PR #74（Meld 已开通与新窗口限制）合入 `dev`（`edba5624`）。合并前 Codex 机器人审查给了一条 P2，称入金的合并提交早已因 PR #71 进入 `main`，所以「未晋升 main」写错了。核对 git 历史不成立：PR #71 的目标分支是 `dev`（合并提交 `2846a6f8`），`main` 当时仍是 `3ced842e`，`a0c05740` 与 `2846a6f8` 都不是它的祖先。没有据此修改。
- 晋升 PR #75（`dev` → `main`）的七项 CI 全部通过：静态检查、终端测试、浏览器回归两个分片、配对关闭与开启两种终端构建、官网构建。之后以 merge commit 合入 `main`（`6da4c15a`），树与 `edba5624` 相同（`main` 上只有前两次晋升的合并提交）。Codex 机器人因额度用完没有审查 #75。

**构建。**

- 仓库外的工作树 `gatu-release-p25`：目录名沿用先前的计划，内容是 p24b。先在 `dev` 头上装依赖并做一次相同开关的演练构建，合并后再检出 `6da4c15a`，清掉演练产物后正式构建。
- 主检出的 `apps/terminal/.env.local` 只软链、不读取内容；Node 22.15.0，`pnpm install --frozen-lockfile`。
- 命令行环境变量：
  - 构建标识：`SAIRN_BUILD_SHA=6da4c15a…`、`SAIRN_RELEASE_ID=cloudfront-2026-10-03-p24b`。
  - 网络与应用：`VITE_HYPERLIQUID_AGENT_NAME=sairn`、`VITE_HYPERLIQUID_TESTNET=`（空）、`VITE_PRIVY_APP_ID=<Sairn 应用>`。
  - 开关：`VITE_MOBILE_PAIRING_ENABLED=false`、`VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true`、`VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false`、`VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true`、`VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true`、`VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true`。
  - 构建命令：`pnpm build && pnpm --filter @sairn/terminal build:lambda`。
- 包体：总量 3,294,400（比基线多 6,749，允许 10,000），交易首屏 1,630,657，手机运行时 118,024，桌面运行时 202,168（比基线多 9,039，余 961）。这是读了 `.env.local` 的构建，比 CI 口径大几百字节。
- `build-meta.json`：commit `6da4c15a`、release `cloudfront-2026-10-03-p24b`；`privyFiatFunding` 为 `{ mainnet: true, testnet: true }`；`cctpDeposits` 与 p24 相同；`mobileSync` 关闭。
- 产物核对：
  - Sairn 的 Privy 应用 ID 出现在 5 个文件，Veyra 的 0 个，没有开发用的 `sairn-dev` Agent 槽位。
  - 与保留的 p24 产物逐项比对打包进去的 `VITE_*` 值：只有两个入金开关与三项构建标识不同。组合保证金激活、LI.FI 跨链创建、订单簿 `l2`、性能分析四个开关在两次构建里都未设置。
  - Lambda 包 225,917 字节。

**执行**（profile `gatu-edge`，受限 IAM 用户）：

1. 空跑：合并前用演练产物空跑了 `functions` 与 `sync`。`sync` 打印 `release gates: sponsored-mainnet-deposits=on mobile-pairing=off mainnet-card-funding=on`，与要带的确认参数一致。
2. `functions --execute --origin https://app.sairn.ai`：请求与响应两个函数都已发布。响应函数含 3 个本次内联脚本哈希和 1 个上一版的哈希，CSP 新增 Stripe 与 Link 的来源。
3. `lambda --function-name gatu-terminal-api --execute`：发布为版本 10，并等到更新完成。
4. `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mainnet-card-funding --execute`：上传前确认线上策略放行全部 3 个哈希，共上传 1,643 个文件，上传后发布标记（`_shell.html`、`build-meta.json`）与本地一致。
5. 两个分发失效（主网 `ET9CNVE6L1GWN`、测试网 `E3Q2SAX402CR9F`）：16:57Z 创建，16:57:50Z 都已完成。

**验证。**

- `verify`：主网 15/15、测试网 16/16。build metadata parity 为 `6da4c15a / cloudfront-2026-10-03-p24b / sponsored-mainnet-deposits=on mobile-pairing=off mainnet-card-funding=on`；geo 接口返回真实判定（SG）。
- 线上两个站点的 `/build-meta.json` 都是 p24b，`privyFiatFunding` 两网都是 `true`。
- 主网交易页的 CSP 响应头：含 `js.stripe.com`、`crypto-js.stripe.com`、`api.stripe.com`、`hooks.stripe.com`、`link.com`、`*.link.com`，`frame-ancestors 'none'` 仍在。
- `csp-coverage.mjs https://app.sairn.ai`：33 步 0 违规，没有控制台错误。跳过 WalletConnect 二维码与手机图表两步，与 p24 相同。第一次调用时我给命令加了 macOS 上没有的 `timeout`（退出码 127，检查没有执行），去掉后重跑。

## 验证与限制

- **没有在线上打开购买窗口，也没有购买。** 清单的 CF-11 要求主网发布后立即用最低金额真实购买一次，需要用户在普通浏览器里用邮箱账号完成。
- 清单「发布之前」与「沙盒发布」两个阶段的各行都没有做：CF-2 至 CF-8，以及 CF-12 里标为必须的各项。法律文本未审，Privy development mode 未处理。上面的验证只说明构建、上传、响应头与公开页面正确，不能证明购买流程、到账或服务商行为。
- **关闭与回滚**：入口是构建期开关。关闭要用当前源码发布一个主网开关关闭的构建（不带 `--allow-mainnet-card-funding`），按 functions → lambda → sync → 失效 → verify 的顺序执行。更快的止损是在 Privy 控制台关闭 Card onramps，这一点没有验证（见上线清单「关闭与回滚」）。p24 的工作树与产物仍保留，便于整版回到 p24。

## 后续与替代关系

- 用户在普通浏览器里用邮箱账号完成 CF-11：主网购买窗口能打开并有报价；是否做一次最低金额真实购买由用户决定，做了要在清单里记录。
- 按上线清单补做跳过的各行，至少包括法律文本审阅（CF-8）与 CF-12 的必须项；Privy development mode 是否升级待决定。
- 工作树 `gatu-release-p25` 保留到下一次发布，供 `verify` 比对与回滚使用；p24 的工作树在确认 p24b 正常后可以删除。
- 旧域名清理发布（PR #73）仍按原计划叫 p25。
- 上一次生产发布的记录见 [Sairn 域名切换（p24）](2026-10-01-sairn-domain-cutover-plan.md)；银行卡入金的实现与审查见 [银行卡入金任务记录](2026-10-02-privy-card-funding.md)。
