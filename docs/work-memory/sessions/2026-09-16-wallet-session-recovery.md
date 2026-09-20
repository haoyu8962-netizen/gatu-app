<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-wallet-session-recovery",
  "date": "2026-09-16",
  "title": "本地 3005 钱包会话失败与手动刷新恢复",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "account-funding"
  ],
  "summary": "旧页出现 Privy token 刷新与认证失败；手动刷新后 sessions/钱包 iframe 200、余额持仓及资金入口恢复。3005 来自另一工作树，非 Across 分支。",
  "thread": null,
  "baseCommit": "99766205",
  "commits": [],
  "sources": [
    {
      "path": "docs/wallet-initialization-debugging.md"
    },
    {
      "path": "apps/terminal/src/hooks/wallet/use-wallet-session.ts"
    }
  ],
  "supersedes": []
}
-->
# 本地钱包会话恢复检查

## 背景与范围

用户报告 `http://localhost:3005/trade/BTC` 无法连接钱包。2026-09-16 00:56 左右（北京时间）在当前 Codex 内置浏览器检查。记录仓库基线 99766205；既有工作记忆修改保留。独立任务标识未取得。

3005 的监听进程为 PID 80432，Vite `dev --port 3005 --strictPort`，cwd 属于 `.claude/worktrees/previous-task-review-b5a831/apps/terminal`。该工作树查询时 HEAD 为 f5010ee7，刷新前页面显示构建标识 D76B12F9；两者不能等同，也不能把本根目录 HEAD 当运行页面版本。本次未修改另一工作树。

## 结论与依据

初始页面仍显示邮箱身份，但数量输入禁用、主按钮为连接钱包，账户面板无有效连接。控制台 2026-09-15T16:56:01.498Z 出现两条 Privy 警告：`Unable to refresh tokens - token is missing or no longer valid` 和 `Error authenticating session`。点击连接钱包后未观察到连接恢复。

启用网络观察后执行一次普通页面刷新。Privy `/api/v1/sessions` 的 OPTIONS 为 204、实际响应为 200；`/apps/<app>/embedded-wallets` 文档响应 200。刷新后原邮箱会话恢复，钱包菜单有复制地址/断开连接入口，可用余额、已有持仓与统一账户概要显示，存款/提款入口恢复。未填写订单、提交签名或操作资金；检查后收起菜单并关闭网络采集。

现有证据支持旧页 Privy 会话刷新失败导致钱包未就绪；没有捕获旧页首次故障的请求，因此不能确认 token 为何失效，也不能排除当时短暂网络或 iframe 故障。刷新后的采集中未复现旧文档里的 iframe 客户端拦截；不能把历史 ERR_BLOCKED_BY_CLIENT 直接当作本次根因。账户邮箱和行情连接标识均不能证明钱包 ready。

读取运行工作树当前 `useWalletSession` 的 reconnect 逻辑，钱包未 ready 时会返回；这是无响应的可能机制，但未读取故障时 React 内部状态，不能断言该分支实际命中。未绕过 ready、owner 或签名保护。Across 建址权限不参与这次 Privy 会话恢复。

## 验证与限制

验证为当前浏览器实际刷新、网络响应及 UI 恢复；未做私钥导出、资金交易、跨浏览器或长期稳定性验收。未清理浏览器存储、迁移 token、修改环境变量或重启服务器。业务代码未变，不运行无关构建和单元测试。

工作记忆验证：`corepack pnpm memory:index`、`memory:check`、`memory:test`（8/8）及 `git diff --check` 通过。仅提交本记录与对应索引。

## 后续与替代关系

本次已恢复可用连接。若再出现，刷新前捕获首次失败的认证请求和 iframe 加载状态，再区分会话撤销、网络失败和浏览器拦截。保留历史案例，不替代不同环境下的既有结论。

## 2026-09-20 迁移补记

本记录从原提交 `f89117943cde34b1d05d0de32a2bd5013889a248` 迁入基于 `d6cc4f3e` 的 `codex/wallet-review-04`，保留原始日期、版本与历史验证结论。当前复核结果见 [worktree-04 迁移记录](2026-09-20-wallet-review-04.md)。

本次未重新登录或复现当时失效 token；不把历史普通刷新恢复推断成根因已永久修复。当前保留身份与钱包目录就绪校验和手动恢复入口。
