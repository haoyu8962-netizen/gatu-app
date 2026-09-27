<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-25-hip3-disclaimer-alignment",
  "date": "2026-09-25",
  "title": "HIP-3 部署者免责声明：补出口、统一平仓把关与退出过渡",
  "kind": "task",
  "status": "verified",
  "topics": ["order-entry"],
  "summary": "按用户决定实施 2026-09-24 审查的候选处理：交易页免责声明加「离开此市场」（回到 BTC，遮罩与 Esc 仍不关闭）并在 dismiss 契约登记两个出口；全部平仓与反手改为与市价、限价平仓一致的可取消免责声明，接受后才挂载确认面；全部平仓的快照 30 秒有效，接受时按当时账户重新生成（refreshCloseAll）；open 由接受状态派生，关闭后保留 250 ms 播放退出动画，出口类型同步保留；补补水回归测试。新增归属文档 docs/hip3-deployer-disclaimer.md。Biome、类型检查、完整单测（600 文件 6842 项）与全部平仓浏览器套件（40 项）通过，应用内浏览器实测交易页两条出口与手机抽屉；四个平仓流程未在持有 HIP-3 仓位的真实账户上操作。补记：Codex 只读对抗审查 7c9b3f21，无 P0、P1，3 项 P2 经核对均成立（全部平仓快照刷新缺真实提交路径测试、限价平仓取消时无退出动画而文档称有、确认面文档误称市价平仓提交钩子接受后才挂载），另核实 store merge 在首次访问时补水不完成的既有问题；均未修复。",
  "thread": null,
  "baseCommit": "cd2176a1",
  "commits": [],
  "sources": [
    { "path": "docs/hip3-deployer-disclaimer.md" },
    { "path": "apps/terminal/src/components/trade/components/hip3-deployer-disclaimer.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-hip3-disclaimer-presentation.ts" },
    { "path": "apps/terminal/src/hooks/trade/use-hip3-disclaimer.ts" },
    { "path": "apps/terminal/src/components/trade/components/global-modals.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-close-all-modal.tsx" },
    { "path": "apps/terminal/src/components/trade/positions/position-reverse-confirmation-controller.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-position-close-all-action.ts" },
    { "path": "apps/terminal/src/stores/use-position-dialog-store.ts" },
    { "path": "apps/terminal/src/lib/tests/dialog-dismiss-control-contract.test.ts" },
    { "path": "apps/terminal/src/lib/tests/hip3-disclaimer-store.test.tsx" }
  ],
  "supersedes": []
}
-->
# HIP-3 部署者免责声明：补出口、统一平仓把关与退出过渡

## 背景与范围

同步记录，基线 `cd2176a1`。上一条记录 [2026-09-24-hip3-disclaimer-parity-review](2026-09-24-hip3-disclaimer-parity-review.md) 列出候选处理后，用户先说「请你对齐 开始规划修复任务」，随后给出三项要求：页面级弹窗补一个明确出口「离开此市场」（返回默认市场）并在退出契约测试里登记；全部平仓、反手改成与市价/限价一致的可取消弹窗，用户能当场接受，或者和官方一样不在平仓流程把关；补一条补水回归测试，`open` 改为由 store 派生以恢复退出过渡。用户同时指出 hyna、flx、vntl、km、cash 缺失的原因是这些市场全部已下架，该更正追加在上一条记录末尾。

## 结论与依据

- **交易页出口**：`leave-market` 副本保持不可点遮罩、不可 Esc 关闭，底部按钮行为「离开此市场」与「确认」。离开经 `useMarketNavigation` 跳到 `DEFAULT_MARKET_NAME`（BTC），与切换市场一样重置下单表单。导航钩子只在该副本显示时挂载（`global-modals.tsx` 的内部组件 `SelectedMarketHip3Disclaimer`），不让全局弹窗层订阅路由位置。
- **平仓流程**：两项里选了第一项（可取消弹窗），与用户列出的顺序一致。限价平仓、反手、全部平仓在 `PositionDialogHost` 的会话组件里先显示 `cancel` 副本，接受后才挂载确认面与提交钩子；市价平仓维持在 `GlobalModals` 里。`useHip3DisclaimerRequirement` 新增接受市场列表，全部平仓取列表中第一个 builder 市场。
- **全部平仓的快照**：实施中发现快照在点击入口时生成、提交时超过 30 秒即失败关闭（`POSITION_CLOSE_ALL_SNAPSHOT_MAX_AGE_MS`），阅读免责声明的时间会占用这 30 秒。改为接受时按当时的账户重新解析快照，经新的 store 动作 `refreshCloseAll` 替换会话中的快照；会话 ID、owner 或网络不一致时不替换。快照解析逻辑从 `usePositionCloseAllAction` 抽成 `usePositionCloseAllSnapshotResolver`，入口与把关组件共用。未采用的做法：在持仓页签入口把关，因为页签组件会在断点与页签切换时卸载，重新生成快照的逻辑仍要放在页面层。
- **退出过渡**：新钩子 `useHip3DisclaimerPresentation` 由接受状态派生 `open`，不再需要时保留 250 ms 并以 `open=false` 渲染；出口类型用第二个 `useLingeringValue` 同步保留，否则取消市价平仓的声明时按钮文字会在淡出中从「取消」变成「离开此市场」。关闭中两个按钮都禁用。
- **关闭按钮**：两个副本都不显示右上角关闭按钮（`showClose={false}`），出口在按钮行；契约探测器能发现 `false`，登记了「Leave this market」与「Cancel」两个出口。原先平仓副本同时有关闭按钮和「取消」，属于重复出口。
- **补水测试**：`hip3-disclaimer-store.test.tsx` 新增「已存 `acceptedVersion: 1` 时重新加载模块即视为已接受」与「格式错误或版本过低视为未接受」。
- 新增文案「Leave this market」五种语言均已翻译（离开此市场 / Salir de este mercado / Quitter ce marché / इस बाज़ार से बाहर निकलें / مغادرة هذا السوق）。

## 验证与限制

在基线 `cd2176a1` 加本次工作区改动上执行，2026-09-25：

- `pnpm exec biome check`（本次改动的 19 个受检文件）通过；`pnpm --filter @gatu/terminal typecheck` 通过。
- 聚焦运行：免责声明相关测试加 AGENTS.md「Confirmation surfaces」回归组共 54 个文件，首次运行 1 项失败：新写的「接受后保持挂载做退出过渡」用例用相同 props 重新渲染 `GlobalModals`，React Compiler 缓存了子元素，桩没有被重新调用。把桩改为经 `useSyncExternalStore` 订阅后该文件与另两个免责声明测试共 35 项通过。
- 完整单测 `pnpm --filter @gatu/terminal test`：600 个文件通过、1 个跳过（`websocket-soak`），6842 项通过。
- 浏览器套件 `pnpm exec playwright test --config tests/browser/position-close-all.playwright.config.ts`：40 项通过。该夹具把免责声明桩为不需要，只证明把关层没有破坏原流程。
- 应用内浏览器，开发服务器 `terminal`（端口 3005），点击由工具经协议注入，不是物理输入：删除 `hip3-deployer-disclaimer-v1` 后打开 `/trade/mkts:US500`，弹窗只有「离开此市场」与「确认」（勾选前禁用），无关闭按钮；Esc 与点遮罩都不关闭。在 `/trade/xyz:GOLD` 点「离开此市场」：221 ms 时已在 `/trade/BTC`、按钮禁用、透明度 0.06，314 ms 卸载。勾选后点「确认」：74 ms 时写入 `acceptedVersion: 1` 且按钮禁用，透明度约 190 ms 内从 1 降到 0，293 ms 卸载；刷新后不再弹出，控制台无错误。375×812 视口下为底部抽屉，按钮行相同。测完重新接受，存储恢复为测试前的已接受状态，视口已复位。
- 采样时面板处于隐藏状态（`document.visibilityState` 为 `hidden`），入场过渡要等工具点击把面板带到前台才运行，所以第一次采样看到的透明度 0 是入场前的状态，不是缺陷。
- 未覆盖：四个平仓流程的免责声明只有单元测试，没有在持有 HIP-3 仓位的真实账户上操作（需要开仓，未执行交易）；平仓副本的 Esc 与点遮罩关闭只由 `AdaptiveModal` 的 `dismissible` 行为保证，未单独实测。

## 后续与替代关系

- 不替代任何记录。上一条审查记录的候选处理除「单独排查非 USDC 抵押品 builder dex 缺失」外均已实施；那一项已在上一条记录末尾更正为无需处理。
- 下次改动免责声明先读 [docs/hip3-deployer-disclaimer.md](../../hip3-deployer-disclaimer.md)；要重新询问所有用户只升 `HIP3_DISCLAIMER_VERSION`。
- 仍待办：有 HIP-3 仓位时的四个平仓流程实测。

## 补记：Codex 对抗审查（2026-09-25）

- 调用：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"medium"'`，codex-cli 0.154.0，对象 `7c9b3f21`，父提交 `cd2176a1`。共 14 条只读命令、约 12.2 万 token。Codex 没有运行测试，它对测试数量的复述不是独立验证。
- 结论：无 P0、P1。3 项 P2 由本会话逐条对照代码核对，均成立：
  1. 全部平仓的快照刷新没有「真实弹窗加真实提交路径」的测试。`position-close-all-modal.test.tsx` 把 store 与提交钩子都桩掉，只断言调用了 `refreshCloseAll`；浏览器夹具的 `useHip3DisclaimerRequirement` 固定返回不需要。AGENTS.md「Confirmation surface contract」要求改变确认面展示或承诺内容的改动保留这种测试。实现本身有误尚未证实。
  2. 限价平仓的免责声明在取消时立即卸载：`PositionLimitCloseModal` 在会话结束时直接返回 null，没有退出动画。父提交已是这样，但 `docs/hip3-deployer-disclaimer.md` 第 5 节把「会话结束」写进了保留 250 ms 的情形，保证过宽。
  3. `docs/confirmation-surfaces.md` 新增的一行把市价平仓也写成「接受后才挂载提交钩子」。实际上市价平仓的提交宿主由 `GlobalModals` 在页面层渲染，与免责声明无关。
- Codex 的变异推演另外指出：交易页副本的 `dismissible={false}` 没有测试钉住，Esc 与点遮罩只在应用内浏览器实测过。
- 本会话另外核实的既有问题，不在本提交的改动里：免责声明 store 的 `merge` 直接读 `persisted.acceptedVersion`。首次访问没有存储记录时，zustand 以 `undefined` 调用 `merge`，抛出的错误被 persist 吞掉，补水不完成，状态停在默认的 0，行为恰好正确。用已安装的 zustand 5.0.9 写脚本复现：现写法首次访问时 `hasHydrated()` 为 false，加 `persisted ?? {}` 后为 true；老用户两种写法都正常。全局设置 store 的 `merge` 同样没有空值保护。仓库里没有代码依赖补水回调，目前没有可见影响。
- 状态：以上发现均未修复，等待用户决定。
- 2026-09-27 更新：以上发现已修复，store 的空值保护由后台任务完成并 cherry-pick 进本分支，见 [2026-09-27-hip3-alignment-review-fixes](2026-09-27-hip3-alignment-review-fixes.md)。
