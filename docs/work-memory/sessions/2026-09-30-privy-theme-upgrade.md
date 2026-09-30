<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-30-privy-theme-upgrade",
  "date": "2026-09-30",
  "title": "承接 Privy 方案 B：升级、即时主题与钱包列表稳定性",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "account-funding"],
  "summary": "方案 B 升级 Privy、恢复即时主题并稳定钱包数组；提交后复核补齐 CI 覆盖遗漏，CI 同版 Node 下 7869 项终端测试、60 项 Privy 专项、全仓类型与 Biome 检查通过；真实钱包验收及历史浏览器异常归因未完成，未发布。",
  "thread": null,
  "baseCommit": "5bac5ac7",
  "commits": ["dca93a04"],
  "sources": [
    { "path": "docs/adr/0026-privy-follows-theme-after-upgrade.md" },
    { "path": "apps/terminal/src/providers/client-root.tsx" },
    { "path": "apps/terminal/src/lib/tests/privy-theme-switch-wallet-stability.test.tsx" },
    { "path": "patches/@privy-io__react-auth@3.32.2.patch" },
    { "path": ".github/workflows/terminal-tests.yml" },
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

## 2026-09-30：提交后完整性复核

用户要求再次 review 和测试，起点为干净的 `dca93a04`。复核确认一项持续验证遗漏：`terminal-tests.yml` 使用显式测试名单，原提交新增的真实 SDK 主题回归和 Provider 生命周期回归均不在名单中。补入独立的 Privy theme / wallet identity 步骤，同时运行已有的配置、精确 owner 选择和钱包会话测试；加入 `patches/**` 触发路径，避免单改补丁不启动该检查。未改生产实现或放松断言。

重新冻结安装通过。另从 npm 官方 registry 获取 3.32.2 原始发布包，核对 SHA-512 与锁文件相同；只提取补丁涉及的两份发布产物到本地忽略目录，`git apply --check` 及实际应用均成功。应用后的 ESM/CJS 文件与本 worktree 安装文件逐字节相同，没有依赖上次人工恢复的结果猜测补丁有效。本轮本地日志目录为 `.worklog/2026-09-30/privy-theme-review/`。

核对 `useSyncPrivyWallets` 的实际依赖：钱包数组、Privy user 或选择回调变化都会进入连接同步；本补丁只处理主题引起的空数组引用变化。真实 SDK 回归中的外部钱包来自测试 provider，选择回调为测试探针；精确 owner 与 `useWalletSession` 另由应用测试覆盖。这些测试不能替代真实认证、iframe、扩展事件和手机后台恢复的端到端验收。

本轮验证（除冻结安装使用 Node 24.15.0 外，以下运行与 CI 相同的 Node 22.15.0，均为 pnpm 10.21.0）：

- `pnpm --filter @gatu/terminal test --maxWorkers=2`：635 文件、7869 测试通过，1 个长时间 WebSocket soak 测试按配置跳过，无 worker 错误，退出码 0，353.40 秒。
- 解析修改后的 workflow YAML，确认 `patches/**` 触发路径及五份测试路径有效；直接读取新增步骤的命令并按其工作目录执行，5 文件 / 60 测试通过。这包括真实 SDK 主题回归 3 项、Provider 生命周期 1 项、配置 4 项、精确 owner 选择 19 项和钱包会话 33 项。
- `node --test scripts/ci-workflows.test.mjs`：6/6 通过。
- `pnpm typecheck`：hl-react、UI、terminal 三包均通过。`pnpm check`：1596 文件通过，无自动修改。
- 本轮未修改生产源码、依赖版本或锁文件；没有再次运行生产构建或浏览器交互，前一轮构建和未登录浏览器结果仍仅代表前述执行及边界，不能计作本轮执行。GitHub 远端 CI 未触发，本轮验证的是修改后的本地命令。

复核结论：确认并补齐一项 CI 覆盖遗漏，未发现新的生产代码缺陷。代码与已列出的自动化验证完成，但端到端验收并不完整：

1. 真实邮箱嵌入式钱包与外部扩展钱包登录后，切换主题能否保持正确账户/签名身份且不触发无谓重连，尚未实测；刷新、退出重登时的身份恢复与清理也未实测。
2. 手机实际切后台、恢复、钱包跳转流程尚未验收。
3. 先前 Privy iframe 超时和偶发图表错误尚未取得足够网络/事件证据完成归因，不能把未复现当作已修复。

既有 viem peer 版本不匹配仍保留，不属于本次升级新引入的错误，也未被自动化通过证明消除；若要消除警告，需要单独评估版本升级与真实钱包回归。本轮提交仅包含 workflow、该复核记录和生成的索引，未推送、未发布。
