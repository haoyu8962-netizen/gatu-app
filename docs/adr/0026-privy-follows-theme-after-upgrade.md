# ADR 0026：升级 Privy 后恢复随主题更新的登录窗口

状态：已接受并实施，自动化检查与未登录浏览器主题验证通过。日期：2026-09-30。此记录承接用户选择的方案 B；2026-10-01 经 PR 63 合入 dev（b4b0ae1b），未晋升 main、未发布，真实钱包验收尚未执行。0025 已由另一工作区的公告方案预留，本任务使用 0026。

## 背景、目标与约束

现有客户端在模块加载时固定 Privy 配置，避免旧 SDK 在主题变化时重建钱包列表并触发 wagmi 重连，代价是登录窗口只有刷新后才跟随主题。目标是恢复即时主题更新，同时保留钱包身份、连接和应用子树。

遵循 [Privy 官方主题方案](https://docs.privy.io/recipes/system-theme)：将当前主题的配置传给同一个 `PrivyProvider`。项目继续使用自己的持久化主题设置，不新增系统主题监听。身份、登录方式、推荐钱包顺序、签名与 Provider 层级保持现行 [运行约束](../runtime-guardrails.md)。

## 决策

- 精确锁定 `@privy-io/react-auth` 3.32.2 与 `@privy-io/wagmi` 4.0.13，升级时重新验证补丁。不能用可漂移的版本范围配合只适用于 3.32.2 的补丁。
- `ClientRootProvider` 订阅已有 `useTheme()`，传入 `PRIVY_CONFIG_BY_THEME[theme]`；不改 Provider 的 key，不重挂载，不增加主题 effect。
- 3.32.2 已对非空嵌入式钱包列表做字段比较，但空列表分支仍无条件写入新数组。pnpm 补丁只让已经为空的 `ethereumEmbedded` 保留数组引用，非空变空时仍清空。CommonJS 与 ESM 两个产物保持同一逻辑。
- 不拦截或替换 wagmi 的重连功能：真实钱包、账户、链和登录状态变化仍应经过现有 SDK 与精确 owner 选择路径。
- 终端显式声明与根一致的 TypeScript 5.7.2，保证包内 `tsc` 不被安装残留的 5.9.3 启动脚本覆盖。

## 备选方案与代价

- 保持启动时固定配置：已避免主题触发重连，但不能即时更新登录窗口，不满足本次要求。
- 单独覆盖 Privy 的主题 CSS 变量：是前一会话的方案 A，用户选择升级后恢复官方配置方式，本次不采用。
- 只升级、不补丁：空列表分支仍生成新数组，外部钱包与未登录状态仍可能触发 wagmi 的钱包选择 effect。
- 在应用层冻结钱包列表或拦截重连：会混入 SDK 的身份与连接生命周期，可能吞掉真实钱包变化，不采用。

代价是维护一个针对发布产物的版本化补丁。产物被压缩成大行，补丁文件较大，但语义变化只有两个格式各一处。下一次升级先在不带补丁的新版本上运行回归，确认空列表稳定且真实状态变化正常后才移除补丁。

## 验证标准与边界

1. 实际 `ClientRootProvider` 在深浅主题间切换配置，应用子树保持挂载与输入状态。
2. 使用安装的真实 Privy / wagmi 运行主题切换回归；确认数组身份与钱包选择保持稳定，真实钱包变化仍生效。移除补丁的对照应失败。
3. `pnpm install --frozen-lockfile` 成功；终端 `tsc --version` 为 5.7.2；Biome、类型检查、钱包/连接回归与终端全量测试通过。升级运行时依赖后检查生产构建及包体约束。
4. 浏览器验证登录窗口深浅主题；自动化不能证明真实邮箱钱包 iframe、浏览器扩展或手机切后台的完整生命周期。未执行的验收明确保留。
5. 非空嵌入式钱包路径（普通邮箱交易）没有行为测试：测试无法登录真实的嵌入式 owner。回归文件只检查 SDK 的字段比较（地址、链、连接器类型、连接时间）仍在 ESM 与 CJS 两个产物中各出现一次；升级后此检查失败时，发布前须用已登录的邮箱账户手动切换主题确认不重连。连接历史写不进存储、`connectedAt` 退回 `Date.now()` 时比较失效，该会话每次切换主题仍会重连，这是已知限制。

## 证据

- 代码：`apps/terminal/src/providers/client-root.tsx`、`apps/terminal/src/config/privy.ts`（`PRIVY_CONFIG_BY_THEME`）。
- 补丁与版本：`patches/@privy-io__react-auth@3.32.2.patch`（2026-10-02 起由 `@3.46.0.patch` 取代，见下方更正）、`pnpm-workspace.yaml`（`patchedDependencies`）、`apps/terminal/package.json`。
- 测试：`apps/terminal/src/lib/tests/privy-theme-switch-wallet-stability.test.tsx`、`apps/terminal/src/lib/tests/client-root-theme-lifecycle.test.tsx`。
- 参考：[运行约束 §1](../runtime-guardrails.md#privy-authentication-and-connection-ui)。

本次实际执行结果见[任务记录](../work-memory/sessions/2026-09-30-privy-theme-upgrade.md)。

## 更正：升级到 3.46.0（2026-10-02）

本段追加，不改写上文。`@privy-io/react-auth` 升到 3.46.0、`@privy-io/wagmi` 升到 4.0.17，仍精确锁定；3.36.0 起必需的 `@stripe/crypto` 以 1.1.3 精确声明。决策本身不变，变化如下：

- 3.46.0 的空列表分支仍是 `setState({ethereumEmbedded:[]})`。不带补丁运行 `privy-theme-switch-wallet-stability` 时，未登录与外部钱包两项失败（钱包数组 5 对 2、6 对 3），因此补丁按新产物重做为 `patches/@privy-io__react-auth@3.46.0.patch`，语义与原补丁相同，ESM 与 CJS 各一处；加补丁后 4 项通过。非空列表的字段比较仍在两个产物中各出现一次。
- `@privy-io/wagmi` 4.0.13 与 4.0.17 的发布文件除 `package.json` 的版本与 peer 版本外逐字节相同，`setActiveWalletForWagmi` / `reconnect` 行为没有变化。
- 4.0.17 的 peer 精确要求 viem 2.56.0，终端仍为 2.42.1（与升级前 4.0.13 要求 2.52.0 时同样不满足）；Privy 自带的 viem 随之从 2.52.0 变为 2.56.0。本次按规划不去重。
- 验证见 [升级与入金规划](../privy-upgrade-and-funding-plan.md) 的阶段一与对应任务记录；真实钱包验收仍未执行。
