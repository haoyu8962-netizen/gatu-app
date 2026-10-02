<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-privy-upgrade-funding-plan",
  "date": "2026-10-02",
  "title": "Privy SDK 升级与 Funding 接入规划",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "用户要求在单独分支规划 Privy SDK 升级与 Funding 接入。只读取证：3.46.0 无破坏性变更但空嵌入式钱包列表仍写新数组，ADR 0026 补丁须按新产物重做；@stripe/crypto 与 Base UI combobox 只在法币页懒加载；官方入口为 useDepositFunds。规划两阶段：先单独升级，再为邮箱精确 owner 加默认关闭的法币入金（Arbitrum USDC，沿用手动 CCTP 赞助充值）。六项决定待用户答复；未改代码、未跑应用测试、未登录真实账户、未改 Privy 控制台。",
  "thread": null,
  "baseCommit": "682430ba",
  "commits": [],
  "sources": [
    { "path": "docs/privy-upgrade-and-funding-plan.md" },
    { "path": "docs/adr/0026-privy-follows-theme-after-upgrade.md" },
    { "path": "apps/terminal/src/config/privy.ts" },
    { "path": "apps/terminal/src/config/security-headers.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx" }
  ],
  "supersedes": []
}
-->
# Privy SDK 升级与 Funding 接入规划

## 背景与范围

2026-10-02 用户要求「规划 Privy SDK 升级加 Funding 接入，单独开分支做」。本会话在 worktree 分支 `claude/privy-sdk-upgrade-funding-feac6f` 上进行；该分支原本停在 main（3ced842e，只比 dev 多两个合并提交），没有自己的提交，已对齐到 `origin/dev`（682430ba）以便日后向 `dev` 开 PR。同步记录，未取得任务标识。

## 结论与依据

规划见 [privy-upgrade-and-funding-plan.md](../../privy-upgrade-and-funding-plan.md)。关键依据：

- Privy changelog 3.33.0–3.46.0 无破坏性 API 变更；3.36.0 起 `@stripe/crypto` 为必需依赖，3.39.0 起内置 viem 2.56.0。
- `npm pack` 3.46.0 后读产物：`ethereumEmbedded` 空列表分支仍无条件写新数组，ADR 0026 补丁仍需要；`@stripe/crypto` 与 `@base-ui/react/combobox` 只在 `FiatOnrampScreen` 中动态 `import()`。
- `@privy-io/wagmi` 4.0.17 的 peer 精确要求 viem 2.56.0，终端为 2.42.1。
- 官方 React 入金为 `useDepositFunds`；省略 `destination.wallet` 会取第一个嵌入式钱包，与本项目钱包签名契约冲突，规划要求永远显式传精确 owner。
- 主网邮箱充值是手动赞助 CCTP，自动充值只在测试网；CSP 尚未放行任何入金服务商。

推荐只做法币、只给邮箱用户：外部钱包买到 USDC 后走 CCTP 需要自付 Arbitrum gas；Privy 加密存款地址与现有 LI.FI、ZeroDev 赞助重复。

## 验证与限制

只读取证：Privy 文档（privy-docs MCP 与 changelog 页面）、`npm view` / `npm pack` 产物、仓库源码与锁文件。没有改代码，没有安装依赖，没有运行类型检查、单测、构建或浏览器；没有登录真实账户，没有访问 Privy 控制台。规划中的 CSP 域名以沙盒实测为准，文中未列死。

## 后续与替代关系

待用户答复规划末尾的六项决定（入金方式、开放对象、PR 拆分、开关形式、viem 去重、控制台与商务操作）后实施阶段一。下次先读本记录、规划文档与 ADR 0026。
