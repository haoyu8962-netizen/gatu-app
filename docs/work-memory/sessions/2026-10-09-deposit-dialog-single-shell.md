<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-09-deposit-dialog-single-shell",
  "date": "2026-10-09",
  "title": "桌面存款弹窗打开后抖动：壳层由宿主挂载一次，只有表单懒加载；余额轮询改为后台刷新",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding"],
  "summary": "用户在桌面端看到存款弹窗打开后抖动、不稳定。在用户 Chrome（localhost:3005，邮箱会话）实测：点击「存款」后先出现懒加载占位对话框（高 332.5px、转圈），约 1 秒后被另一个对话框元素（高 665.9px）替换并重新开始进入过渡；开发服务器上 import 存款弹窗模块耗时 1120ms，悬停预热赶不上点击。根因是 Suspense 的 fallback 本身是一个完整对话框：代码块到达时占位壳无退场卸载、真实壳重新淡入缩放，遮罩变暗、清空、再变暗，弹窗高度翻倍并重新居中。按用户选定的方案 1+3 实施：新增 DepositModalHost 在主包里挂载唯一的 FundsModalShell，懒加载的 DepositModal 改为壳旁的无渲染主体，用 useLayoutEffect 通过 onSurfaceChange 上报 tab、isPending、返回按钮、关闭处理与内容（或状态屏，状态屏仍是替换壳的独立对话框）；加载中壳内显示转圈；memo 包住主体避免宿主重渲染回流。useDepositUsdcBalance 的轮询在已有成功余额时保持 success 状态后台刷新，不再每 5 秒把按钮闪成「Deposit -- USDC」并置灰。改后在 Chrome 冷加载实测：对话框与遮罩元素在占位与表单之间同一节点，始终只有一个 dialog。",
  "thread": null,
  "baseCommit": "8d5f9308",
  "commits": ["b390a5c8"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/components/deposit-modal-host.tsx" },
    { "path": "apps/terminal/src/components/trade/components/deposit-modal-surface.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts" },
    { "path": "apps/terminal/src/lib/tests/deposit-modal-host.test.tsx" },
    { "path": ".claude/rules/style-ui-guide.md" }
  ],
  "supersedes": []
}
-->
# 桌面存款弹窗打开后抖动：壳层由宿主挂载一次，只有表单懒加载；余额轮询改为后台刷新

## 背景与范围

用户在开发服务器（分支 `claude/funds-sheet-edge`，8d5f9308）测试时报告「电脑端的存款弹窗打开后会抖动，似乎不太稳定」，要求审查相关代码；审查后用户选择推荐方案（方案 1 壳层只挂载一次 + 方案 3 余额后台刷新），要求双端一致、没有缺陷。同步记录，无任务标识。

## 结论与依据

- 复现（用户 Chrome 的 `localhost:3005/trade/BTC`，邮箱会话，标签页处于 hidden 状态，用 setInterval / MutationObserver 读 DOM）：点击「存款」后 240ms 出现 `role=dialog` 高 332.5px、带 `data-starting-style`，内容是懒加载占位转圈；1237ms 时变为高 665.9px、顶边从 351.8px 上移到 185px，并再次带 `data-starting-style`。页内 `import()` 存款弹窗模块耗时 1120ms（开发服务器，多模块按需加载）。模块已缓存后再开，直接以 665.9px 出现、几何稳定。
- 根因：`global-modals.tsx` 的 `Suspense` fallback 是 `DepositModalLoadingFallback`，它自己渲染一整个 `FundsModalShell`；代码块到达后 React 卸载占位树、挂载真实 `DepositModal`，两者是不同实例，真实弹窗重新走 `usePresentedOpen`（首帧 `open=false`，一帧无遮罩）和 Base UI 进入过渡：遮罩 0→0.6 再淡入一次，弹窗 95% 再缩放一次，高度从占位的 332px 跳到 666px 并重新居中。头部「存款」按钮的悬停预热（`depositModalIntentProps`）在开发服务器上赶不上点击。
- 次要缺陷：`use-deposit.ts` 的 `useDepositUsdcBalance.refetch` 每次轮询（邮箱钱包每 5 秒）都把 `status` 设为 `"loading"`（保留旧 `raw`），表单据此把按钮文字换成 `Deposit -- USDC` 并置灰（`deposit-form.tsx` 的 `balanceStatus === "success" ? balance : "--"`、`explicitFundingDepositDisabled`）。用户账户 Arbitrum 上没有 USDC，没有这个按钮，所以没看见；有余额的用户会看见每 5 秒闪一次。
- 采用（方案 1）：新增 `deposit-modal-host.tsx`（主包）：读 store 的 open/tab、`useIsMobile`，挂载唯一的 `FundsModalShell`；懒加载的 `DepositModal` 经 `memo` 包装后放在壳旁的 `Suspense fallback={null}` 里，它保留全部 hooks 与状态，渲染返回 `null`，把要显示的内容整理成 `DepositModalSurface`（`kind: "shell"`：tab、isPending、backButton、onOpenChange、content；或 `kind: "status"`：状态屏元素）并在 `useLayoutEffect` 里通过 `onSurfaceChange` 上报；宿主在壳内渲染 `surface.content`，没有上报前渲染转圈体（`DepositModalLoadingFallback` 现在只是 `<output>` 转圈，不再带壳）；状态屏仍替换壳（与改前一致，`StatusScreen` 是同一流程的独立对话框）。`global-modals.tsx` 改为渲染 `DepositModalHost`。双端同一宿主：桌面 `modal`、手机 `drawer` 由宿主的 `useIsMobile` 决定。
- 采用（方案 3）：`refetch` 在同一密钥且上一状态是 `success` 时保持原状态（后台刷新），仍由 requestId 只采用最新答案；首次加载与失败路径不变；显式 Retry 仍通过 `isDepositDataRetrying` 显示加载。
- 为什么用「主体上报元素」而不是把壳放回主体内：主体必须在壳与状态屏之间保持挂载（否则切到状态屏会丢状态，与改前相同的位置约束），而壳的 props（isPending、返回按钮、关闭处理、tab）又来自主体状态，所以主体与壳只能是兄弟，内容以元素形式交给宿主。`memo(DepositModal)` 保证宿主因上报而重渲染时主体不回流，循环不可能发生；生产里主体的所有输入都是响应式 hook。编译取证（babel-plugin-react-compiler 1.0.0，与 vitest/vite 同样的插件顺序）：`deposit-modal.tsx` 改前改后都没有被 React Compiler 编译（组件里的 `try … finally` 让编译器以 `Handle TryStatement with a finalizer` 放弃），所以 `surface` 每次主体渲染都是新对象、每次都上报，宿主随之重渲染一次；宿主本身已编译，传给主体的元素稳定，加上 `memo`，回流被两层阻断。
- 未采纳：方案 2（模块就绪后再打开，冷启动无反馈）；把弹窗并入主包（桌面运行时包体预算余量不足 1KB）；让占位体与表单同高（占位契约禁止第二个字面高度，冷加载仍会有一次平滑增高，但不再闪烁或重放动画）。
- 规则与契约：`.claude/rules/style-ui-guide.md`「Loading placeholders」改写第二类 fallback 的定义（宿主挂壳、主体懒加载），`AGENTS.md` 视觉契约同句更新；`loading-placeholder-contract` 改为钉住宿主含壳、主体不含壳且带 `onSurfaceChange` 上报、`global-modals` 渲染宿主、宿主列入可导入 `lazy-global-modals` 的文件；`funds-modal-scroll-contract` 把宿主列入流程入口、`lazy-global-modals.ts` 列为边界（否则会沿动态导入走进所有其他弹窗）、返回按钮形状检查改查宿主；`deposit-modal-withdrawal-routing-guard` 改为渲染真实宿主（通过 mock 的注册表拿真实主体，并用 `useSyncExternalStore` 把测试的 `rerender()` 接到被 memo 的主体上）；新增 `deposit-modal-host.test.tsx`（桌面与手机两种呈现：对话框、遮罩、体节点在代码块到达前后同一节点、主体只挂载一次、加载中关闭走 store、tab/pending/返回按钮/关闭处理来自主体、状态屏替换壳后换回主体不重挂）；`use-deposit-routing-guard` 新增后台刷新用例。

## 验证与限制

- 通过：`pnpm --filter @sairn/terminal typecheck`；Biome（12 个改动文件）；`deposit-modal-host`（8）、`global-modals-hip3-disclaimer`、`loading-placeholder-contract`、`funds-modal-scroll-contract`、`deposit-modal-withdrawal-routing-guard`（126）、`use-deposit-routing-guard`（83）、`deposit-modal-warm`、`global-modals-market-close-legal`、`global-modals-idle-preload`、`status-motion-surface-contract`、`action-progress-label-contract`，以及 i18n/number-format/date-locale 反应性契约、modal-surface、dialog-notice-radius、dialog-dismiss-control、design-token-ratchet、deposit-method-chooser、cctp-deposit-tracking-notifier、funds-action-balances、embedded-deposit-auto-bridge（两个）、deposit-broadcast、trading-onboarding-gate、privy-fiat-funding-host-gate、use-privy-fiat-funding-offer（21 文件 657 项）。全量单测（`--maxWorkers=4`）在本机与其他会话的 Codex、另一工作树的 vitest 和 ChatGPT 桌面端同时运行、负载均值 190–260 的情况下跑了 25 分钟被看门狗中止，没有汇总行；中止前失败的 7 个文件（`date-locale-reactivity-contract`、`global-modals-hip3-disclaimer`、`chart-store`、`deposit-modal-warm`、`mobile-agent-sync-route`、`mobile-history-cards`、`user-menu`）都是 10–140 秒的超时；与本改动相关的 `deposit-modal-warm`、`deposit-modal-host` 在串行、90 秒超时下通过，`global-modals-hip3-disclaimer` 的 30 项里只剩「renders the disclaimer instead of other global modals and blocks the command shortcut」在负载下超时，它在今天负载较低时（本改动之后的 5 文件与 21 文件运行）通过过，且在本改动之前的任务记录里已被标为本机高负载下的偶发项。CI 将再次运行全量。
- 变异核对：去掉 `refetch` 里的 `success` 保持分支，后台刷新用例失败；给宿主的 `FundsModalShell` 加 `key={surface ? "loaded" : "loading"}`（即代码块到达时重挂壳），宿主测试「keeps the one shell…」在桌面与手机两种呈现下都失败。
- 实机核对（用户 Chrome，冷加载后点击「存款」，MutationObserver）：22ms 时 dialog#1 / backdrop#2 高 332.5px 带转圈，878ms 时仍是 dialog#1 / backdrop#2 高 665.9px 带表单，全程只有一个 dialog。标签页处于 hidden 状态，过渡不出帧，所以动画本身与帧率没有看到；需要用户在可见窗口下确认观感。
- 手机呈现：宿主测试覆盖真实 `Drawer` 路径；Chrome 窗口改为 390px 宽后的实机核对见补记。
- Codex 对抗审查（gpt-6-astra，只读，medium）第 1 轮 9.0：唯一发现 P2，宿主测试里 `useDepositModalOpen` 固定为 true，没有验证 store 关闭后壳真的关闭、关闭期间主体继续上报不会重新打开；已补用例「closes the shell when the store closes and stays closed while the body keeps reporting」（响应式 open 桩，桌面与手机两种呈现），变异 `open={true}` 使它失败。审查确认：主体未编译但宿主元素缓存 + memo 阻断循环；layout effect 上报在绘制前处理，没有旧闭包窗口；状态屏切换时表单卸载与改前一致；会话键重挂不串 surface；余额复核（`refreshDepositBalance`、`assertReviewedBalanceUnchanged`）未被绕过；手机路径参数未变；静态契约能识别指定变异。第 2 轮（窄范围复审）9.5、无发现：确认新用例钉住了「关闭期间懒加载完成」与「lingering 期间上报不重开」，其余核对点未回退。
- 未做：生产构建与包体测量（主包新增约 70 行宿主代码，懒加载块不再含壳的那一份）；2px 背景模糊对帧率的影响仍待可见窗口下测。

## 后续与替代关系

- 本记录与 [弹窗遮罩规范](2026-10-09-dialog-scrim-standard.md) 同分支，前者解决层次，本记录解决加载时的重挂与余额闪烁。
