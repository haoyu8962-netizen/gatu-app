<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-19-cloudfront-release-gates",
  "date": "2026-09-19",
  "title": "CloudFront 发布闸门：暴露资金或凭证路径的构建需要上传时再确认",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "按 build-meta 实际开关阻止未确认的充值或配对上传；PR #29 已合入 dev，并随 PR #30 进入 main。原本地测试/演练保留，生产部署及真机验收未在本轮核验。",
  "thread": null,
  "baseCommit": "a7cef26a",
  "commits": ["a59dfca8", "9264b04d"],
  "sources": [
    { "path": "deploy/cloudfront/deploy.mjs" },
    { "path": "deploy/cloudfront/README.md" },
    { "path": "apps/terminal/src/config/build-meta.ts" },
    { "path": "apps/terminal/src/config/cctp-deposit-flags.ts" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "docs/work-memory/sessions/2026-09-18-retire-ec2-deploy-files.md" },
    { "url": "https://github.com/zora4523-bot/gatu-app/blob/5d3935721f070075c5d976d61a3c27d12b5dc607/deploy/validate-production-env.mjs" }
  ],
  "supersedes": []
}
-->
# CloudFront 发布闸门

## 背景与范围

`2026-09-18-retire-ec2-deploy-files` 记录了一处迁移遗留缺口：已移除的 `deploy/validate-production-env.mjs` 会在构建前核对 `VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED` 与运营方在主机运行时环境文件里的二次确认 `GATU_CCTP_MAINNET_RELEASE_MODE`，CloudFront 发布流程没有等价物。PR #27、#28 合入 `dev` 后用户说「继续任务」；未完成项里不需要用户另行决定、也不涉及发布或删除的只有这一件，据此在新分支 `feat/cloudfront-build-env-check`（基于 `dev` 的 `a7cef26a`）实现。本记录为同步记录。`dev → main` 发版、线上发布与删除已合并分支都未做。

## 结论与依据

- **核对构建产物，不核对环境文件。** 旧校验器读的是主机上的两个 env 文件，并额外禁止 `.env.production*` 覆盖 `.env.local`。CloudFront 流程是运营方本机 `pnpm build` 后再 `sync`，两步之间环境文件可以变，而且 `GATU_RELEASE_ID` 默认是 `local`，同一提交换一套开关重建后 `commit`/`release` 完全相同。`build-meta.json` 由 `loadEnv` 的合并结果生成，记录的是真正进入 bundle 的值，所以把闸门状态写进它，再让 `sync` 与 `verify` 读它。
- **`build-meta.json` 新增 `cctpDeposits`**（`mainnetSponsoredWallet`、`testnetExternalWallet`、`testnetSponsoredWallet`）。为了让 Vite 配置与运行时共用同一个解析函数，把 `resolveCctpDepositFeatureFlags` 拆到不访问 `import.meta.env`、不用 `@/` 别名的 `config/cctp-deposit-flags.ts`，`cctp-deposit.ts` 重新导出，做法与既有的 `mobile-pairing-flags.ts` 一致；`/build-meta.json` 服务端路由同步输出。这些值本来就编译在公开的客户端 bundle 里，`mobileSync` 已有先例，没有新增敏感信息。
- **两个闸门，双向精确匹配。** `deploy.mjs` 导出 `RELEASE_GATES`、`releaseGateState`、`evaluateReleaseGates`：主网赞助充值对应 `--allow-sponsored-mainnet-deposits`，移动配对（`importFromQr` 或 `createAndReveal` 任一为真）对应 `--allow-mobile-pairing`。构建开了而没带参数、带了参数而构建没开、`build-meta.json` 缺字段或字段不是布尔值，`sync --execute` 都拒绝；不带 `--execute` 的演练只打印警告，并始终打印一行 `release gates: …`。旧校验器同样要求模式与开关精确一致。
- **移动配对闸门是新增的约束，不是移植。** 旧校验器只检查 CREATE 开启时 IMPORT 也开启，这条已由 `resolveMobilePairingFeatureFlags` 在代码里保证。现行文档要求两个开关在真机矩阵验收前保持关闭，闸门把这条顺序落到发布工具上；`--allow-mobile-pairing` 只应在验收记录完成后使用，工具本身无法核对验收是否完成。
- **`verify` 的 build metadata parity** 现在同时比较线上与本地的闸门状态，并在结果里打印。
- **未移植**：`VITE_PRIVY_APP_ID` 非空、`VITE_HYPERLIQUID_AGENT_NAME=gatu`、`VITE_HYPERLIQUID_TESTNET` 为空。它们是环境文件拼写检查而不是暴露确认；要共用应用的解析函数还得再拆 `trading-agent.ts` 与 `lib/network.ts`，本次未做，已在 CloudFront 手册写明仍靠人工核对 `env.build.example`。与 EC2 主机文件、监听端口、Caddy 相关的规则不适用于现架构。

## 验证与限制

2026-09-19 本地，工作区基于 `a7cef26a`：

- `pnpm test:cloudfront` 39 通过（原 36，新增 3：闸门判定、参数与构建不一致及缺字段、`verify` 闸门不一致）。
- 命令行演练（临时目录伪造 `_shell.html` 与 `build-meta.json`，不带 `--execute`，没有任何 AWS 调用）：赞助开关打开时打印「An executing sync would refuse this build」；带 `--allow-sponsored-mainnet-deposits` 时无警告；旧格式 `build-meta.json` 报「does not record sponsored Mainnet CCTP deposits; rebuild with the current source」。
- `pnpm --filter @gatu/terminal typecheck` 通过；改动文件 Biome 通过。全量 `pnpm --filter @gatu/terminal test` 单独运行：576 个文件中 575 通过、1 跳过，6,367 用例通过、0 失败。
- `pnpm build` 通过全部预算检查（`trade-terminal-page` 126,297 B，上限 127,242 B）。产物 `build-meta.json` 含 `cctpDeposits`。用这份真实构建演练 `sync`：本机 `.env.local` 把配对与三个充值开关都设成了 `true`，工具打印 `release gates: sponsored-mainnet-deposits=on mobile-pairing=on` 并给出两条「An executing sync would refuse this build」。这正是闸门要拦的情形：从这台机器的环境直接构建发布会把尚未验收的配对带上线。
- 限制：`--execute` 路径在闸门判定之前先调用 `aws sts get-caller-identity`，本机没有跑真实的 `--execute`，拒绝分支由单元测试与演练输出覆盖；未发布，线上 `build-meta.json` 仍是旧格式，下一次发布必须用本分支之后的源码构建，否则 `sync --execute` 会以「does not record」拒绝。

## 后续与替代关系

- 本记录关闭 `2026-09-18-retire-ec2-deploy-files` 的「发现的遗留缺口」一节，并替换 `docs/cctp-deposits.md` 里的 Known gap 段落。
- 会话里为同一件事生成的任务卡片 `task_7ec2a709` 已不再需要。

## 周整理追加（2026-09-21）

原“只在本地、未推送”是本记录建立时状态。2026-09-21 的 GitHub 查询确认 PR #29 与 #30 已合并，检查绑定各自 head；查询详情见周整理记录。未查询线上 build-meta，不将合并等同部署，也不将 --allow-* 参数等同验收证据。 本次依据与版本边界见 [周整理记录](2026-09-21-weekly-memory-review.md)。
