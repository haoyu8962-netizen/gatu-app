<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-30-privy-theme-upgrade",
  "date": "2026-09-30",
  "title": "承接 Privy 方案 B：升级、即时主题与钱包列表稳定性",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "account-funding"],
  "summary": "承接 Claude 中断的 11 个未提交文件，按方案 B 升级 Privy、恢复登录窗口即时主题并稳定钱包数组；冻结安装、类型检查、全量终端测试复跑和两应用构建通过，未做真实钱包验收或发布。",
  "thread": null,
  "baseCommit": "5bac5ac7",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0026-privy-follows-theme-after-upgrade.md" },
    { "path": "apps/terminal/src/providers/client-root.tsx" },
    { "path": "apps/terminal/src/lib/tests/privy-theme-switch-wallet-stability.test.tsx" },
    { "path": "patches/@privy-io__react-auth@3.32.2.patch" },
    { "url": "https://docs.privy.io/recipes/system-theme" }
  ],
  "supersedes": []
}
-->
# 承接 Privy 方案 B：升级、即时主题与钱包列表稳定性

## 背景与范围

同步记录。用户要求在 `other-workspace-recent-commits-e0c7a2` 继续 Claude 中断的方案 B。起点为 `claude/privy-theme-css-vars` / `5bac5ac7`，9 个已跟踪文件修改、2 个未跟踪文件；全部属于获授权承接的任务，未取得本次可核对的任务标识。交接时源文件副本及状态存于 Git 忽略的 `.worklog/2026-09-30/privy-theme-upgrade/handoff/`，不是完整对话归档。

原有修改包括 Privy 升级与空钱包数组补丁、恢复实时配置、两项测试及相关文档；缺少被引用的 ADR、交付记录和最终验证。与公告方案的 ADR 0025 预留冲突，改用 0026。

## 结论与依据

方案与边界见 [ADR 0026](../../adr/0026-privy-follows-theme-after-upgrade.md)。核对已安装 3.32.2 的 ESM/CJS 产物：非空钱包列表已按字段比较，空列表分支补丁保留空数组引用；3.32.2 的上游修复起始版本本轮未核查，不沿用来源会话的版本断言。

## 验证与限制

接手时，本次实际运行的两个测试文件（主题生命周期、真实 SDK 空钱包数组稳定性）共 2 项通过。后者只覆盖未登录状态，不作为已连接钱包验收。

环境问题：默认 PATH 是 Node 22.13.0 / pnpm 11.19.0，首次 `pnpm --filter @gatu/terminal exec tsc --version` 被 pnpm 的依赖目录重建确认中止。后续使用本机 Node 24.15.0 / pnpm 10.21.0。该工具链下根 TypeScript 为 5.7.2，但终端 `.bin/tsc` 指向 5.9.3；这是需要消除的包内命令漂移。

阶段验证（完成实现后的工作区）：

- Node 24.15.0 / pnpm 10.21.0：依赖安装成功；精确锁定 React Auth 3.32.2、Privy wagmi 4.0.13。终端新增 TypeScript 5.7.2 开发依赖，包内 `tsc --version` 为 5.7.2。
- Biome（本次 3 个 TSX 文件）与 `pnpm --filter @gatu/terminal typecheck` 通过。
- 两个主题测试文件共 4 项通过：真实 SDK 的未登录数组稳定、模拟连接的外部钱包稳定及切换/断开、非空嵌入式列表在无 owner 时清空，以及实际 ClientRootProvider 配置与子树/输入保持。SDK 内部 store 只用作钱包发现的测试输入，网络请求被阻断；没有模拟 `useWallets` 或 wagmi。
- 反向对照：临时将本 worktree 已安装 ESM 产物还原为空列表的上游写法，3 项中前两项失败（数组变化次数分别 2→5、3→6），清空测试仍通过；已在 finally 恢复补丁。日志 `unpatched-control.log`，不会修改 pnpm 共享 store 的硬链接。
- 真实 Chrome、本地 3037 端口、浏览器工具注入点击（不是物理输入）：深色登录窗口 → 关闭 → 切换浅色 → 再打开，窗口立即呈现浅色且钱包选项相同，无页面刷新；之后恢复深色。只打开窗口，没有登录、连接钱包或签名。`agent-browser` CLI 未安装，本次使用已连接的 Chrome 浏览器工具。
- 浏览器限制：首次开发依赖优化时页面加载较慢；扩展注入属性导致 hydration 警告，并存在扩展广播错误；Privy iframe 后续报告超时。图表曾出现错误面；临时恢复基线 Provider 后刷新并切换主题未复现，恢复最终实现、刷新后连续浅→深→浅→深也未复现（图表就绪、无 alert）。原因未确认，不能据此认定与本次修改有关或无关。临时源码已恢复，测试标签页和开发服务器已关闭。上述观察不作为完整钱包或图表验收。
- `memory:index`、`memory:check`、`memory:test`（8 项）通过。
- 安装仍报告 peer 警告。核对 npm 版本元数据：Privy wagmi 4.0.12 与 4.0.13 都要求 viem 2.52.0，仓库沿用 2.42.1，属于升级前已存在的版本不匹配；此任务不扩大到全仓 viem 升级。其余传递依赖警告保留于 `install.log`。

- 冻结安装 `pnpm install --frozen-lockfile` 通过，锁文件无需更新。重新核对补丁 ESM/CJS 各一处语义变化，SHA-256 与锁文件一致。
- Node 22.15.0 / pnpm 10.21.0：`pnpm build` 通过，包含 Lingui、客户端/服务端构建、预渲染、chunk 循环检查、包体预算、shell preload 和 inline script hash；未放宽包体预算。日志 `build.log`。
- 首次全量 `pnpm --filter @gatu/terminal test --maxWorkers=4`：632 文件通过、1 文件失败、1 文件跳过；7851 测试通过、1 失败、1 跳过。失败是 `position-reverse-confirmation-modal.test.tsx` 首例超过 5000ms，另有 2 个 worker 响应超时；报告后进程未退出，手动中止（退出码 130）。单独以 `--maxWorkers=1` 重跑该文件 5/5 通过。第一次全量与构建/浏览器验证有并行，资源压力是可能因素，不作为已证明的根因。日志 `terminal-tests.log`。
- 关闭开发服务器和测试标签页、完成构建后，`pnpm --filter @gatu/terminal test --maxWorkers=2` 完整复跑通过：635 文件 / 7869 测试通过、1 文件 / 1 测试按配置跳过（长时间 WebSocket soak），无 worker 错误，退出码 0，316.19 秒。首轮没有报告的 `orderbook-row-tooltip.test.tsx` 与 `persisted-store-hydration.test.ts` 也在本轮通过，因此两轮的总数不同。日志 `terminal-tests-retry.log`。
- 锁文件在承接的升级基础上精确固定版本并添加终端 TypeScript 声明。pnpm 同时将已有 Astro 的 TypeScript peer 从 5.7.2 重新解析为已存在的 5.9.3；终端明确使用 5.7.2。其余钱包传递依赖的小版本刷新来自交接锁文件。
- 为覆盖锁文件中 Astro peer 的重新解析，额外运行 `pnpm --filter @gatu/website test`（4/4，通过，Node 24.15.0）和 `pnpm --filter @gatu/website build`（8 个静态页面，通过，Node 22.15.0）；均使用 pnpm 10.21.0。

以上检查绑定本任务相对 `5bac5ac7` 的最终实现与锁文件；`verified` 仅指这里列出的自动化与浏览器工具验证。尚未发布，未做真实钱包登录、签名或资金操作。

测试开发时的失败保留：新增夹具最初给 wagmi 设置 `storage: null` 导致 SDK hydration 异常，并漏填外部钱包 `meta.id` 导致两个测试钱包复用连接器。移除该夹具设置、补齐钱包 ID 后消除；没有因此更改生产连接逻辑。

## 后续与替代关系

实现、依赖安装、连接状态回归、两应用构建与文档已完成，按项目约定创建一个本地提交；提交号从本记录的 Git 历史获取，避免为写入自身 SHA 再次提交。未推送或部署，未修改其他工作区。

后续 Privy 升级须重跑真实 SDK 回归、核对内部 store 测试入口，并以不带补丁的对照结果决定是否移除补丁。真实邮箱/扩展钱包及移动端生命周期验收仍需专门执行；浏览器曾出现的 iframe 超时和暂未复现的图表错误保留为本次验证限制。
