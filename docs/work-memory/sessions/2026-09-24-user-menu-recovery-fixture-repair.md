<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-user-menu-recovery-fixture-repair",
  "date": "2026-09-24",
  "title": "user-menu-recovery 浏览器夹具修复",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "vite-cache"],
  "summary": "user-menu-recovery 套件 10 项全红的原因是夹具缺口而非产品缺陷：df4ed89f 给页头加的 useEmailWalletExport 需要 PrivyProvider 且引入了桩没有的导出，8cb1b98a 起未就绪页头只对已有会话显示 Connecting...，51c5ace3/67d4212e 改了移动端文案。补桩、种会话标记、按宽度更新断言后 10/10 通过；未改产品代码，套件仍不在 CI。",
  "thread": null,
  "baseCommit": "145adad5",
  "commits": ["6cd0bb1a", "15196136"],
  "sources": [
    { "path": "apps/terminal/tests/browser/user-menu-recovery.vite.config.ts" },
    { "path": "apps/terminal/tests/browser/user-menu-recovery.browser.tsx" },
    { "path": "apps/terminal/tests/browser/user-menu-recovery.fixture.tsx" },
    { "path": "apps/terminal/tests/browser/user-menu-recovery.pw.ts" },
    { "path": "apps/terminal/src/components/trade/header/user-menu.tsx" },
    { "path": "apps/terminal/src/hooks/wallet/use-email-wallet-export.ts" },
    { "path": "apps/terminal/src/lib/wallet/privy-session-hint.ts" },
    { "path": "docs/runtime-guardrails.md" },
    { "url": "https://vite.dev/guide/dep-pre-bundling" },
    { "url": "https://vite.dev/config/dep-optimization-options" },
    { "url": "https://vite.dev/config/shared-options" }
  ],
  "supersedes": []
}
-->
# user-menu-recovery 浏览器夹具修复

## 背景与范围

上一记录（[点击即封存与 TP/SL 例外修复](2026-09-23-market-close-attempt-sealing-fix.md)）留下 `user-menu-recovery.playwright.config.ts` 在 `origin/dev` 上就 10 项全红的问题。用户要求修复并核对官方文档实践。基线 `145adad5`，开始时工作区干净。该套件不在 CI 里，本会话同步记录，没有可核对的会话标识。

## 结论与依据

套件测的是页头账户菜单的初始化恢复：未就绪时显示禁用的「Connecting...」，认证停滞 30 秒后给出「重新加载页面」且不自动刷新并保留草稿，钱包列表加载中下拉菜单仍可操作，迟到的钱包原地恢复，未登录可点连接，Agent-only 保留自己的菜单，阶段或身份变化时计时重启。失败链条分三层，都是夹具与断言落后于产品，不是产品缺陷：

1. 夹具起不来。`df4ed89f`（2026-09-16）让 `UserMenu` 引入 `useEmailWalletExport`。该钩子从 `@/lib/wallet/privy-wagmi` 引入桩里没有的 `getPrivyEmbeddedWalletAddress`、`hasSameWalletAddress`，又用相对路径 `./use-wallet-session` 绕过夹具别名把真实 `use-wallet-session.ts` 拉进依赖图，后者的 `@privy-io/wagmi` 预构建时去找被整体替换为桩的 `wagmi`，缺 `WagmiProvider`/`createConfig` 而失败。即使补齐这些导出，钩子内部的 Privy `useExportWallet` 在没有 `PrivyProvider` 的夹具里也会抛错（SDK 源码：`must be used within a PrivyProvider`）。按该夹具既有做法，把 `@/hooks/wallet/use-email-wallet-export` 也别名到桩，桩里的 `useEmailWalletExport` 按会话推导 `visible`，`canExport` 恒为 false。
2. 初始断言过时。`8cb1b98a`（2026-09-17，PR 26 审查修复）起，Privy 未就绪时只有本机 localStorage 含 SDK 会话令牌键（`privy-session-hint.ts`）或恢复到期时才显示「Connecting...」，否则直接显示连接按钮；该规则写在 `docs/runtime-guardrails.md` 连接 UI 一节。套件的每个场景都是「已有会话、初始化停滞」，所以让夹具在渲染前写入 `privy:token`，而不是改产品。
3. 移动端文案与菜单顺序。`51c5ace3`（09-18）起 390px 的账户按钮只显示邮箱用户名部分、完整邮箱放在 `title`；`67d4212e`（09-18）起移动端连接按钮是「Connect」；桌面仍是「Connect Wallet」与完整邮箱。菜单第一项现在是「Export email wallet」，Home 键会停在这个禁用项上。断言改为按宽度取值，键盘流程改为 Home → Export（禁用，Enter 不导航）→ Reconnect（禁用，Enter 不重连）→ Reload page（Enter 导航一次）。

官方文档核对（2026-09-24 查阅）：Vite 文档说明依赖预构建会「crawl your source code and automatically discover dependency imports」，`resolve.alias` 用于替换 `import` 语句里的值；文档没有明说别名在扫描 node_modules 依赖时也生效，但本次 esbuild 报错证实它会作用于 `@privy-io/wagmi` 内部对 `wagmi` 的导入。所以把整包 `wagmi` 替换成桩时，夹具依赖图里不能再出现任何未桩的 `@privy-io/wagmi` 引用；`optimizeDeps.exclude` 只适合小型纯 ESM 依赖，不用于绕过这个问题。这条实践已补进 `docs/runtime-guardrails.md` §9。

## 验证与限制

- 修复前在内置浏览器里直接打开夹具页确认：页面空白，Vite 日志「Failed to run dependency scan」；补别名后页面渲染但显示「Connect」；再种会话标记后显示「Connecting...」。
- `user-menu-recovery.playwright.config.ts`（清空 `.vite-user-menu-recovery` 缓存后）：10/10 通过，48.5 秒；类型检查 0 错误；`git diff --check` 通过。Biome 不扫描 `tests/browser`。
- 调查过程中一次 `git bisect` 因与主检出共用 4182 端口而作废，已终止并删除临时 worktree；根因改由导入链分析与 Vite 日志确认。
- 未执行：真实 Privy 登录、真机、CI（该套件不在 CI 里）。断言依据当前产品行为与规范文档，不代表这些行为经过设计验收。

## 后续与替代关系

- 更正上一记录「dev 上本来就有」的表述：问题自 `df4ed89f`（2026-09-16）起存在，随后的 `8cb1b98a`、`51c5ace3`、`67d4212e` 又各自让断言过时。
- 是否把该套件加入 CI 由维护者决定；加入前应先在 CI 环境跑一次。
