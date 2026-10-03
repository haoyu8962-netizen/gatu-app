<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-privy-upgrade-funding-plan",
  "date": "2026-10-02",
  "title": "Privy SDK 升级与 Funding 接入：规划与阶段一升级",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "用户要求单独开分支规划并执行 Privy SDK 升级与 Funding 接入，决定只做法币、邮箱与外部钱包都开放、其余按推荐（两个 PR、开关分网、viem 不动）。阶段一把 react-auth 升到 3.46.0、wagmi 升到 4.0.17：空嵌入式钱包列表补丁按新产物重做（不带补丁对照 2 项失败、加补丁 4 项通过），手动分块只收应用自己的 Base UI（首屏省约 40 kB），其余增量来自 Privy 核心库静态引入 libphonenumber-js 与自带 viem 变大，按规则用固定元数据前后构建重设基线（总量 +83,687、交易首屏 +62,713）。类型检查、钱包回归 264 项、终端全量 7,996 项通过（1 项 TradingView 摘要用例负载下超时、单跑通过）。未做真实钱包验收；阶段二未实施。",
  "thread": null,
  "baseCommit": "682430ba",
  "commits": ["283f9cb0", "c0e550c7"],
  "sources": [
    { "path": "docs/privy-upgrade-and-funding-plan.md" },
    { "path": "docs/adr/0026-privy-follows-theme-after-upgrade.md" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "patches/@privy-io__react-auth@3.46.0.patch" },
    { "path": "apps/terminal/vite.config.ts" },
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "path": "apps/terminal/src/config/privy.ts" },
    { "path": "apps/terminal/src/config/security-headers.ts" }
  ],
  "supersedes": []
}
-->
# Privy SDK 升级与 Funding 接入：规划与阶段一升级

## 背景与范围

2026-10-02 用户要求「规划 Privy SDK 升级加 Funding 接入，单独开分支做」，看过规划后答复：只做法币；外部钱包也开放；其余按推荐执行。本会话在 worktree 分支 `claude/privy-sdk-upgrade-funding-feac6f` 上进行；该分支原本停在 main（3ced842e，只比 dev 多两个合并提交）且没有自己的提交，已对齐到 `origin/dev`（682430ba），以便向 `dev` 开 PR。同步记录，未取得任务标识。规划提交为 283f9cb0；阶段一的提交见 Git 历史中本记录之后的提交。

## 结论与依据

规划与决定见 [privy-upgrade-and-funding-plan.md](../../privy-upgrade-and-funding-plan.md)。

规划取证：

- Privy changelog 3.33.0–3.46.0 无破坏性 API 变更；3.36.0 起 `@stripe/crypto` 为必需依赖，3.39.0 起内置 viem 2.56.0。
- `npm pack` 3.46.0 后读产物：`ethereumEmbedded` 空列表分支仍无条件写新数组；`@stripe/crypto` 与 `@base-ui/react/combobox` 只在 `FiatOnrampScreen` 中动态 `import()`。
- 官方 React 入金为 `useDepositFunds`，省略收款钱包时取第一个嵌入式钱包，与钱包签名契约冲突；`useFiatOnramp` 要求显式收款地址，阶段二改用它（实施时再写入 ADR 0034）。

阶段一（升级）：

- 依赖精确锁定 `@privy-io/react-auth` 3.46.0、`@privy-io/wagmi` 4.0.17、`@stripe/crypto` 1.1.3；`@privy-io/wagmi` 两个版本的发布文件除 `package.json` 外逐字节相同（重连逻辑未变）。
- 补丁：删除 3.32.2 补丁，按 3.46.0 的 ESM 与 CJS 产物各重做一处「已为空则保留数组引用」，语义与原补丁相同。
- 包体：首次构建总量 +91,394、交易首屏 +84,413（相对仓库基线）。逐模块统计（自写的 Rollup `generateBundle` 报告与预算脚本的首屏清单）显示：`vendor-base-ui` 手动分块匹配所有 `@base-ui` 路径，把 Privy 自带的 Base UI 1.8 拉进首屏。改为只收应用自己的 Base UI 后首屏少约 40 kB，Privy 的副本回到懒加载的法币页块。剩余增量来自 `@privy-io/js-sdk-core` 0.77.0 静态引入 `libphonenumber-js/min`（旧 0.67.4 没有）与 Privy 自带 viem 从 2.52.0 变为 2.56.0；去掉它需要改 Privy 的导入图，未做。
- 按 `docs/terminal-performance-baseline.md` 的规则，用相同构建身份、Node 22.15.0、配对关闭，对 `origin/dev`（独立 worktree）与升级后工作区各做一次构建，重设总量与交易首屏两个基线，读数表写在该文档。
- 应答另一工作区（邮箱钱包静默创建，ADR 0033，分支 `claude/silent-email-wallet`）的协调请求：本次升级不改 `createOnLogin`；静态核对 3.46.0 与 3.32.2 中客户端 `createOnLogin` 优先、代理就绪时 `createWallet()` 不打开界面、`isModalOpen` 含义三项一致。阶段二的 ADR 改用 0034。

## 验证与限制

工作区基线 682430ba，2026-10-02 本机执行：

- `pnpm install`（升级后锁文件）成功；终端 `tsc` 为 5.7.2；`pnpm typecheck` 通过。
- `privy-theme-switch-wallet-stability.test.tsx`：不带补丁 2 项失败（钱包数组 5 对 2、6 对 3），加补丁 4 项通过。
- AGENTS.md 钱包签名、首次交易与连接界面整组加全部 `privy-*` 单测：20 个文件 264 项通过。
- `vite-manual-chunks.test.ts` 16 项通过（新增 Base UI 归属用例）；`node --test scripts/check-client-bundle-budget.test.mjs` 16 项通过。
- 终端全量（Node 24.15）：7,996 项通过，1 项失败为 `chart-build-assets.test.ts` 的 TradingView 摘要校验在全量负载下超过 5 秒，单独重跑 17 项全部通过；与本次改动无关。
- 生产构建（Node 22.15.0、上述固定构建身份、配对关闭）：重设基线后完整构建通过，含无循环检查、包体预算、壳预加载注入与内联脚本哈希收集；客户端总量 3,275,424（新基线下 +5,816）、交易首屏 1,624,427、手机与桌面运行时增量 117,413 与 200,718，与测量构建逐字节一致。

- 更正（2026-10-02，提交 `c0e550c7` 之后）：上面的生产构建两边都读了开发用的 `apps/terminal/.env.local`，CI 没有这个文件。在不含它的两个隔离 worktree 里用同一构建身份重测：`682430ba` 总量 3,190,861、交易首屏 1,561,189、手机与桌面运行时增量 117,427 与 201,008；`c0e550c7` 为 3,274,893、1,624,100、117,422 与 200,714，即总量 +84,032、首屏 +62,911。与原记录的 +83,687、+62,713 相差 345 与 198 字节，在两次构建的抖动之内，基线不动；更正表写进性能基线文档。
- CI：`vite-manual-chunks.test.ts` 原先不在任何工作流里，`production-build.yml` 的路径过滤也没有 `patches/**`（只改补丁不会触发生产构建）。两处都已补上，`scripts/ci-workflows.test.mjs` 增加对应断言（8 项通过）。

未做：真实钱包验收（邮箱登录后切换主题不重连、外部钱包登录与 Agent 注册、普通下单签名、赞助 CCTP 小额充值）、浏览器时序测量（LCP/INP）、Privy 控制台配置。三项 SDK 行为核对是读发布产物的静态结论，没有运行真实登录。

## 后续与替代关系

- 阶段二（法币入金，ADR 0034）按规划实施，叠在阶段一之上另开分支。
- 应用 viem 升到 2.56.0 去重：能抵消本次首屏增量，需另行决定并做签名路径回归。
- 与 `claude/silent-email-wallet` 合并时保留 `createOnLogin: "off"` 与 `EmailEmbeddedWalletProvider`，并重跑 `privy-config`、`email-embedded-wallet-provider`、`legal-gate-hooks`、`legal-gate` 四个测试。
- 下次先读本记录、规划文档、ADR 0026 的更正段与性能基线文档的对应小节。
