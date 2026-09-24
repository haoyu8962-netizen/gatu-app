<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-21-local-email-session-recovery",
  "date": "2026-09-21",
  "title": "本地 3006 邮箱身份可见但钱包不可用，普通刷新恢复",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "内置浏览器显示邮箱身份，但交易输入与钱包菜单禁用；一次普通刷新后持仓、账户数值和钱包菜单恢复。首次失败请求未捕获，网络事件截断，不确认 token 或 iframe 根因。",
  "thread": null,
  "baseCommit": "246c57bc",
  "commits": [],
  "sources": [
    { "path": "docs/wallet-initialization-debugging.md" },
    { "path": "docs/work-memory/sessions/2026-09-16-wallet-session-recovery.md" },
    { "path": "apps/terminal/src/hooks/wallet/use-wallet-session.ts" },
    { "path": "apps/terminal/src/components/trade/header/user-menu.tsx" }
  ],
  "supersedes": []
}
-->
# 本地 3006 邮箱身份可见但钱包不可用，普通刷新恢复

## 背景与范围

同步记录。用户报告当前 localhost:3006 的邮箱账户不可用。本任务此前把 codex/reviewceshi 从 5ea5d625 快进至 origin/main 的 246c57bc，Vite 服务未重启。排查开始时工作区干净；未取得来源任务标识。

## 结论与依据

- 内置浏览器初始页面显示邮箱身份及实时行情，但数量输入禁用、交易按钮为连接钱包，账户菜单的导出、重新连接和断开连接均禁用。
- 当前代码把认证、钱包目录就绪和精确所有者激活分开判断；邮箱身份可见不能证明交易连接可用。界面现象支持钱包会话尚未就绪，但没有读取 React 内部状态以确定具体门控。
- 开启临时网络观察后执行一次普通页面刷新，已有持仓、持续变化的账户数值、数量输入、存款/提款和钱包菜单恢复。未重新登录、清理存储、修改环境或业务代码，也未签名、导出密钥或提交资金操作。检查后关闭网络观察并收起菜单。

## 验证与限制

- 验证来自本次浏览器可访问性树的刷新前后对照。控制台 warn/error 查询为空；刷新后的网络事件报告 truncated，筛选没有取得完整 Privy 请求证据。因此不宣称 sessions 或钱包 iframe 返回 200，也不将历史 token 失败或 ERR_BLOCKED_BY_CLIENT 当作本次根因。
- 刷新后页脚仍显示 V0.1.0+5EA5D625；Git HEAD 为 246c57bc。未重启服务或审计全部模块，不能把工作区版本等同于整个运行页面的构建标识，也不能证明此次异常由快进或热更新导致。
- 只确认连接和账户读取恢复，未执行真实交易验收。未保存含账户标识、余额或凭证的原始浏览器记录。
- 仅新增本记录与生成索引，不运行应用单测或生产构建。`pnpm memory:index`、`pnpm memory:check`、`pnpm memory:test`（8/8）与 `git diff --check` 通过。

## 后续与替代关系

不替代历史记录。若复发，应在首次失败时保留有界、脱敏的认证与 iframe 请求证据，再区分认证失败、加载阻断和钱包激活问题；独立浏览器对照遵循钱包初始化文档。
