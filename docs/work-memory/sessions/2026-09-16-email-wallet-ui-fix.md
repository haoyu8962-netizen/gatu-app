<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-email-wallet-ui-fix",
  "date": "2026-09-16",
  "title": "邮箱钱包标识、密钥导出入口及发送网络说明修复",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "account-funding"
  ],
  "summary": "修复紧凑布局邮箱身份显示，补齐精确所有者邮箱钱包导出入口，区分 HyperCore 发送与 Arbitrum 提款；真实密钥导出未执行。",
  "thread": null,
  "baseCommit": "f5010ee7",
  "commits": [],
  "sources": [
    {
      "path": "docs/runtime-guardrails.md"
    },
    {
      "path": "docs/withdrawals.md"
    },
    {
      "path": "apps/terminal/src/hooks/wallet/use-email-wallet-export.ts"
    },
    {
      "url": "https://docs.privy.io/wallets/wallets/export"
    }
  ],
  "supersedes": []
}
-->
# 邮箱钱包 UI 修复

## 背景与范围

按用户要求修复前次检查确认的三个问题：紧凑桌面邮箱被地址替代、运行版本缺少邮箱钱包导出入口、发送与提款网络说明不明确。实际修改位于运行 localhost:3005 的 claude/mobile-shell-parity 工作树，基线 f5010ee7，包含已有未提交移动端改动。根目录 Across 分支没有纳入本次实现。未取得可核对的线程 ID。

## 结论与依据

1. 所有宽度保留邮箱身份，使用省略号收缩文字；复制地址和外部钱包标签维持原行为。
2. 账户菜单和设置共用独立导出 hook，显式传入当前 Privy 用户唯一确定的 embedded owner；身份不匹配、外部钱包和 Agent 会话不允许导出。导出不依赖 Across、资金或交易授权。点击才调用 Privy，重复点击受限，身份切换后的旧回调和过期错误保持无效。
3. Send 标明 Hyperliquid (HyperCore)，提示 Arbitrum USDC 应使用 Withdraw；不更改发送、提现路由或签名逻辑。
4. 六种语言补齐新增文案。规范与发布说明同步；通过模拟测试验证安全边界，浏览器只核查入口和布局，不读取真实私钥或提交资金操作。

2026-09-16 复核 Privy 官方 Export a wallet 文档：指定 address 导出目标钱包，省略时默认 index 0；客户端导出由 Privy 隔离界面承载。因此这里不采用省略地址的默认调用。

## 验证与限制

- 在上述运行工作树加本次改动的组合上执行验证，不等同于干净 HEAD 或部署验收。
- 初次新增 hook 测试因 Lingui harness 缺失失败，替换为项目 I18nProvider harness 后，3 文件 56 项通过；相关钱包、提现、国际化 21 文件 447 项通过。
- terminal typecheck、受支持路径的 Biome、Lingui extract/compile 通过。
- 浏览器已检查 1100px 邮箱标签和账户导出菜单、1440px 设置与发送说明、375px 发送弹窗及设置导出入口。手机检查发现 Wallet 标题缺翻译，已补齐并截图复核。使用模拟 viewport，并非真实设备/PWA 验收；未执行真实导出、MFA 或资金操作。窗口尺寸恢复，返回交易页。
- 新增英文/中文切换保留设置草稿的测试后，本次 3 文件 57 项通过。另一份旧设置滑点测试补齐新 hook mock 后，仍有 2 个既存行为断言失败；隔离基线副本复现了相同断言。
- 默认并发全量测试出现多处超时，主动中断（130）后改用 maxWorkers=2 复跑；复跑再次出现已复现的基线失败后中断，不宣称全量通过。隔离基线两组分别为 9 文件（8 失败、30 断言失败）和 5 文件（4 失败、6 断言失败），覆盖旧样式契约、资产详情、桌面仓位壳、图表资源完整性、连接弹窗与滑点断言。mobile-agent-sync-route 和 portfolio-overview 在隔离基线组通过，初次并发失败不作为确定性回归结论。
- memory:index/check 首次因摘要标题未使用模板要求的“结论与依据”失败，标题已修正并重建索引；memory:test 8 项通过。
- 只暂存本次文件和共享文件的本次差异。提交包装器完整运行原 pre-commit/commit-msg，随后将 Lingui hook 全量暂存的语言文件收窄回已审查条目，避免带入既有移动端翻译引用改动。
- `pnpm build` 最终退出 0；391 个客户端分块无循环静态导入，包体预算通过，预渲染及 shell preload/inline-script-hash 校验完成。构建后的中文目录包含导出及 Arbitrum 提示。构建发起后补入了“钱包”标题翻译和测试，最终标题另经 Lingui compile 与开发浏览器验证，未因这条翻译重复完整构建。
- 最终 terminal typecheck、memory:check 和 memory:test（8 项）通过。图表完整性与连接弹窗在基线组的失败属于 5 秒超时，不应解释为资源损坏或已确认功能缺陷。
- 本地验证日志与初始文件快照：.worklog/2026-09-16/email-wallet-ui-fix/，不是完整对话归档；截图只用于本轮工具视觉核验，不纳入 Git。

## 后续与替代关系

真实用户可从账户菜单或设置进入 Privy 导出界面；系统浏览器、MFA 和用户实际复制密钥仍需用户自行验收。本任务没有验证 Across 权限或充值，也没有重新解释历史资金记录。既有移动端工作保持独立。
