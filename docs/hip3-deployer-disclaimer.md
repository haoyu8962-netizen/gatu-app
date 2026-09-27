# HIP-3 部署者免责声明

状态：已实施（2026-09-25），2026-09-27 按 Codex 审查修订，未发布。本文是免责声明行为的归属文档。与官方终端的取证对照见任务记录 [2026-09-24-hip3-disclaimer-parity-review](work-memory/sessions/2026-09-24-hip3-disclaimer-parity-review.md)，本次实施与验证见 [2026-09-25-hip3-disclaimer-alignment](work-memory/sessions/2026-09-25-hip3-disclaimer-alignment.md)。

## 1. 目标与约束

- 用户在 gatu 里第一次与第三方部署的永续市场（builder perp）交互之前，必须勾选并确认一次免责声明。这里的「签署」是勾选加确认，不涉及钱包签名。
- 每个浏览器只问一次：接受是全局、永久、不分 deployer 的，只有 `HIP3_DISCLAIMER_VERSION` 升版才会重新询问。
- 每个出现免责声明的界面都要有明确出口，并在 `dialog-dismiss-control-contract` 登记（`.claude/rules/style-ui-guide.md`「Dialog chrome」）。
- 免责声明不改变签名、确认上限、资产锁与提交守卫；它只决定确认面何时出现。

## 2. 何时出现

| 界面 | 条件 | 出口 |
| --- | --- | --- |
| 交易页（`/trade/...`、`/builders-perp`） | 选中市场是 builder 永续且未接受 | 勾选后「确认」，或「离开此市场」 |
| 市价平仓 | 会话仓位是 builder 永续且未接受；交易页与 Portfolio 页都适用 | 勾选后「确认」，或「取消」 |
| 限价平仓、反手 | 目标仓位是 builder 永续且未接受 | 同上 |
| 全部平仓 | 目标列表中任一市场是 builder 永续且未接受 | 同上 |

Portfolio 页不因选中市场弹出（`enableSelectedMarketHip3Disclaimer={false}`），与官方「只在交易页」一致。全部平仓的文档链接取目标列表里第一个 builder 市场的 deployer；接受本来就不分 deployer。

## 3. 两种出口

两个副本共用 `components/trade/components/hip3-deployer-disclaimer.tsx`，都没有右上角关闭按钮，出口在底部按钮行：

- **交易页副本（`leave-market`）**：点遮罩和 Esc 都不关闭。唯一的出口是「离开此市场」，经 `useMarketNavigation` 跳到默认市场 `DEFAULT_MARKET_NAME`（BTC），和切换市场一样重置下单表单并同步 scope。
- **平仓副本（`cancel`）**：「取消」结束当前会话，点遮罩和 Esc 同样结束会话。

`dialog-dismiss-control-contract.test.ts` 登记这两个出口；`showClose={false}` 会被契约的探测器发现，不能漏登。

## 4. 平仓流程

- 市价平仓的免责声明由 `GlobalModals` 在确认弹窗之前渲染，目标是会话仓位，而不是交易页选中的市场。它只推迟确认弹窗的出现；市价平仓的提交宿主由页面层的 `PositionMarketCloseSubmitHostGate` 承载，按意图加载，与免责声明无关。
- 限价平仓、反手、全部平仓在页面层 `PositionDialogHost` 的各自会话组件里先显示免责声明，接受后才挂载确认面与提交钩子。会话 ID 不变，所以「会话存在期间入口不能再次打开」的规则照常成立。
- **全部平仓的快照**：快照在点击入口时生成，提交时超过 `POSITION_CLOSE_ALL_SNAPSHOT_MAX_AGE_MS`（30 秒）即失败关闭。为了不让阅读免责声明的时间占用这 30 秒，接受时按当时的账户重新解析快照并替换会话中的快照（`refreshCloseAll`），确认面展示的就是新快照。身份或网络不同、会话已换、或持仓与市场数据未就绪时不替换，保留原快照，提交时照常按过期或数据变化失败关闭。
- 提交钩子里的 `accept-hip3-market(s)` 守卫保留为纵深防御。正常路径不会再触发它；它只在绕过界面的情况下拒绝提交。

## 5. 退出过渡

`useHip3DisclaimerPresentation` 在免责声明不再需要（已接受或离开市场）后让它以 `open=false` 保持挂载 250 ms，播放 Base UI 的退出动画；展示期间的出口类型同时保留，避免按钮文字在淡出时变化。关闭中的「确认」与出口按钮都禁用，`handleConfirm` 对 `!open` 直接返回。接受后确认面在退出动画结束时才挂载。

取消结束会话时，退出动画由各流程保留会话的方式负责：全部平仓、反手与限价平仓的控制器用 `useLingeringValue` 把会话保留 250 ms 并传入 `open=false`（限价平仓自 2026-09-27 起，此前会话一结束就卸载，连同确认面也没有退出动画）；市价平仓的会话结束后，`GlobalModals` 的需求随之解除，由上面的钩子保留。关闭中的限价平仓确认面同样禁用「Place Limit Close」，处理函数对 `!open` 直接返回。

## 6. 存储与版本

- 键 `hip3-deployer-disclaimer-v1`（`STORAGE_KEYS.HIP3_DISCLAIMER`），值 `{"state":{"acceptedVersion":1},"version":1}`，由 zustand `persist` 同步补水，经 `createValidatedStorage` 校验。
- 需要重新询问所有用户时只升 `HIP3_DISCLAIMER_VERSION`。另外两个版本号不是这个机制：改键名后缀会丢掉全部接受记录；改 `persist` 的 `version` 而不提供 `migrate` 时，zustand 会在控制台报错并按没有存储记录补水，效果同样是重新询问，但不是有意的路径。
- 首次访问没有存储记录时，zustand 以 `undefined` 调用 `merge`。`merge` 用 `persisted ?? {}` 兜底（2026-09-26 加入），补水照常完成；此前抛出的错误被 persist 吞掉，状态恰好停在 0，但 `hasHydrated()` 一直为 false。
- `hip3-disclaimer-store.test.tsx` 钉住补水：已存 `acceptedVersion: 1` 时重新加载模块即视为已接受；格式错误或版本过低视为未接受。`persisted-store-hydration.test.ts` 钉住首次访问与版本不同时补水完成。

## 7. 与官方终端的对照（官方 2026-09-24 产物）

| 项目 | 官方 | gatu |
| --- | --- | --- |
| 次数 | 每个浏览器一次，全局、永久、无版本 | 相同，另有版本号可在文案实质变化时重新询问 |
| 交易页不接受时 | 点遮罩关闭，继续浏览和操作；换市场、刷新再弹 | 不可关闭；「离开此市场」回到 BTC |
| 平仓流程 | 不把关 | 四个平仓流程先显示可取消的免责声明 |
| 关闭按钮与 Esc | 都没有 | 都没有；出口在按钮行 |

## 8. 备选方案

- **照官方点遮罩关闭**：未采用。官方点遮罩后弹窗关闭而接受标志不变，用户留在该市场的页面上；gatu 不留下「未接受却停留在该市场」的状态，「离开此市场」同样一步退出。官方关闭后是否还能在该市场下单未取证。
- **平仓流程不把关（官方做法）**：未采用，用户选择与市价、限价平仓一致的可取消弹窗。代价是全部平仓需要在接受时重新生成快照（第 4 节）。
- **在持仓页签的入口处把关**：未采用。页签组件会在断点与页签切换时卸载，而接受后重新生成快照的逻辑仍要放在页面层；放在会话组件里只有一处实现。

## 9. 验证与限制

回归入口：

```bash
pnpm --dir apps/terminal exec vitest run \
  src/lib/tests/hip3-deployer-disclaimer.test.tsx \
  src/lib/tests/hip3-disclaimer-hooks.test.tsx \
  src/lib/tests/hip3-disclaimer-store.test.tsx \
  src/lib/tests/hip3-disclaimer-requirement.test.ts \
  src/lib/tests/global-modals-hip3-disclaimer.test.tsx \
  src/lib/tests/position-limit-close-modal.test.tsx \
  src/lib/tests/position-close-all-modal.test.tsx \
  src/lib/tests/position-close-all-action.test.tsx \
  src/lib/tests/position-reverse-confirmation-controller.test.tsx \
  src/lib/tests/persisted-store-hydration.test.ts \
  src/lib/tests/dialog-dismiss-control-contract.test.ts
```

`hip3-deployer-disclaimer.test.tsx` 用真实的 `AdaptiveModal` 在桌面弹窗与手机抽屉两种形态下按 Esc：交易页副本不关闭，平仓副本结束会话。

全部平仓的浏览器套件 `tests/browser/position-close-all.playwright.config.ts` 默认把免责声明桩为已接受。其中「recaptures the snapshot when the HIP-3 disclaimer is accepted and sends what it then shows」一例改为需要免责声明：打开后改变持仓并把时钟拨过 30 秒，再勾选确认，核对确认面展示的数量等于实际发出的订单数量。这是确认面契约要求的真实弹窗加真实提交路径的测试，只替换账户数据与交易所边缘。

限制：市价平仓、限价平仓与反手的免责声明只由单元测试覆盖；四个流程都没有在持有 HIP-3 仓位的真实账户上操作过（需要开仓）。交易页两条出口的实测记录见任务记录，点击由应用内浏览器的工具注入，不是物理输入。
