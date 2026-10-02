<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-privy-card-funding",
  "date": "2026-10-02",
  "title": "Privy 银行卡入金（阶段二）：精确 owner 收款、分网开关与发布闸门",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "static-hosting"],
  "summary": "按用户决定（只做法币、邮箱与外部钱包都开放、主网测试网分开开关）在阶段一升级之上实现银行卡入金：useFiatOnramp 显式收款到精确的 Hyperliquid owner（须在 Privy 已连接列表中），不用会退回第一个嵌入式钱包的 useDepositFunds；用户看过官方终端后要求独立入口，充值弹层第一屏改为「转入 USDC」与「用银行卡购买 USDC」两个入口；购买窗口默认美元 100；选购买先关充值弹层，页面级宿主（由充值弹层的块加载）持有请求，确认/提交都不声称到账，可能已扣款的拒绝报常驻的状态未知；独立审查 1 项 P2、9 项 P3 已修；build-meta 记录开关，主网发布需 --allow-mainnet-card-funding；CSP 静态放行 Stripe 公布的来源并重新生成 CloudFront 响应函数；总量基线按 CI 同口径实测 +14,142；ADR 0034。后续同日：选择页显示时预热宿主；生产构建实测点击到 Privy 首个请求 22–29 ms，此前记录的 8–14 秒是被遮挡窗口里定时器被限速所致；控制台只读核对线上应用的卡入金已开启（Stripe、MoonPay）、应用处于 development mode；待人工完成的各项写成上线验收清单，法律文本写成待审草案。法律文本未改（需合格法律审阅），permissions-policy 未改（Apple/Google Pay 与页面内摄像头不可用）。未做沙盒与真实购买、外部钱包与手机实测。Codex 对抗审查后：购买结果与无法打开的提示改为渲染时核对 owner 与网络的自定义通知卡片（与订单通知同一套生命周期，覆盖 Sonner 先撤下后插入）；测试网沙盒的结果只说明没有扣款、不会到账；只有明确拒卡的原因判为未完成；上线清单分为发布之前、沙盒发布、主网发布之后三个阶段。",
  "thread": null,
  "baseCommit": "c0e550c7",
  "commits": ["ca2cae61", "a7b48b21", "789d3202", "12ec99ac", "1e64a5fb", "30991cff", "eec28ce2"],
  "sources": [
    { "path": "docs/adr/0034-privy-card-funding.md" },
    { "path": "docs/privy-upgrade-and-funding-plan.md" },
    { "path": "apps/terminal/src/domain/trade/privy-fiat-funding.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/privy-fiat-funding-host.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit/deposit-method-chooser.tsx" },
    { "path": "apps/terminal/src/hooks/trade/use-privy-fiat-funding-offer.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit-modal.tsx" },
    { "path": "apps/terminal/src/config/security-headers.ts" },
    { "path": "deploy/cloudfront/deploy.mjs" },
    { "path": "docs/cctp-deposits.md" },
    { "path": "docs/privy-card-funding-launch-checklist.md" },
    { "path": "docs/privy-card-funding-legal-draft.md" },
    { "path": "docs/terminal-performance-baseline.md" },
    { "path": "apps/terminal/src/stores/use-privy-fiat-funding-store.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/privy-fiat-funding-host-gate.tsx" },
    { "path": "docs/trading-notifications.md" },
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "path": "docs/confirmation-surfaces.md" },
    { "path": "apps/terminal/src/lib/trade/privy-fiat-funding-launch.ts" },
    { "path": "apps/terminal/src/lib/trade/privy-fiat-funding-notice-presentation.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/privy-fiat-funding-notice-card.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/privy-fiat-funding-notice-toast.tsx" },
    { "path": "apps/terminal/src/lib/trade/privy-fiat-funding-feedback.ts" }
  ],
  "supersedes": []
}
-->
# Privy 银行卡入金（阶段二）：精确 owner 收款、分网开关与发布闸门

## 背景与范围

承接 [Privy SDK 升级与 Funding 接入的规划与阶段一](2026-10-02-privy-upgrade-funding-plan.md)。用户 2026-10-02 决定：只做法币；邮箱与外部钱包用户都开放；其余按推荐（两个 PR、主网与测试网分开开关、viem 不动）。阶段二在阶段一提交 `c0e550c7` 之上新开分支 `claude/privy-fiat-funding`，同一 worktree，同步记录，未取得任务标识。

## 结论与依据

决策与上线前提见 [ADR 0034](../../adr/0034-privy-card-funding.md)。要点与依据：

- 读 3.46.0 的类型声明：`useDepositFunds` 的收款钱包可省略并默认第一个嵌入式钱包；`useFiatOnramp` 要求 `destination.address`、CAIP-2 链与代币地址，因此采用后者。两者都标为实验接口。
- 读 3.46.0 产物（`use-headless-crypto-deposit-*.mjs`、`FiatOnrampScreen-*.mjs`）：关闭窗口时无错误且未到确认态则以 `Error("User exited flow")` 拒绝，返回按钮以 `BackNavigationError` 拒绝，已有流程时以 `Error("Existing fiat onramp flow in progress")` 拒绝；Stripe 是页内嵌入，其他服务商由 Privy 新开窗口；`signWalletOwnershipMessage` 在 Privy 的已连接钱包里按地址找签名钱包。分类逻辑据此实现，测试钉住三段字面值仍在安装的产物里。
- Stripe 官方 CSP 清单（Stripe.js、Link、嵌入式 crypto onramp）决定新增的来源；没有放开整域 `*.stripe.com` 的脚本或框架。CloudFront 响应函数由 `render-functions.mjs` 从同一来源重新生成（6,694 字节）。
- 法律目录 README 要求数据处理与风险措辞先经合格法律审阅才能上生产，所以没有改 `legal/`，拟议措辞写进 ADR。
- 现行 `permissions-policy`（`payment=()`、`camera=(self)`）会挡住 Stripe 嵌入流程里的 Apple Pay / Google Pay 与页内摄像头，按单独决策保留未改。
- 收到另一工作区（`claude/silent-email-wallet`）的协调说明：ADR 0033 已被占用，本决策用 0034；该分支把 `createOnLogin` 设为 `"off"`，本分支未改该配置。应其请求静态核对 3.46.0：客户端 `createOnLogin` 仍优先于控制台值，代理就绪时 `createWallet()` 不打开界面，`isModalOpen` 仍是「窗口打开或 MFA 进行中」，`initializeWalletProxy` 仍只保存一个等待者（`Pe.current`），代理就绪时只唤醒最后一个调用者，与 3.32.2 相同，因此该分支的单请求逻辑仍需要。
- 首版宿主静态挂在 `AppToaster`，构建显示运行时与总量都超出余量；改为 `PrivyFiatFundingHostGate` 在首次请求时懒加载宿主，加载失败时结束尝试并显示固定提示。入口拆成纯视图 `PrivyFiatFundingCard` 与容器，资金表单浏览器夹具可以直接渲染卡片。

- 用户看过首版后要求「学习官方终端的存款弹窗设计，给法币购买单独的入口，而不是集成在一个地方」。在用户 Chrome 中已登录的 `app.hyperliquid.xyz/trade/HYPE` 只读查看：页头与账户面板的「存款」打开同一弹窗，第一屏「充值」是「转入加密货币」与「使用法币购买 USDC」两个并列入口；转入路径第二屏有返回箭头；法币路径在同一弹窗内嵌 swapped.com 组件（iframe 授权 `payment`、`camera`）。据此把充值弹层改为第一屏两个入口（`DepositMethodChooser`），选「转入」进入原表单（带返回按钮），选「购买」关闭弹层后由宿主打开 Privy 窗口；开关关闭或无精确 owner 时直达表单；每次打开回到选择页；外部钱包的切网络提示在选「转入」之后。表单内的卡片与插槽删除，入口逻辑改为 `usePrivyFiatFundingOffer`。「Transfer USDC」原文已被永续/现货划转弹窗使用（中文「划转」），这里用 `context="Deposit method"` 单独翻译为「转入 USDC」。

- 用户在 Chrome 里登录本地开发服务器（3005，两网开关打开）后实测：Privy 购买窗口按浏览器语言选了 CNY 且金额为 0，一打开就提示金额过低；用户决定像官方一样预填约 100 美元并固定默认币种为美元（`source.defaultAsset: "usd"`、`defaultAmount: "100"`，读 3.46.0 产物确认 `defaultAsset` 覆盖语言推断、`defaultAmount` 即初始金额）。

- 用户要求「review 一遍」：启动独立代理对 `git diff c0e550c7`（含未提交与未跟踪文件）做只读审查，结论无 P0/P1，1 项 P2、9 项 P3，逐条核实后全部处理：P2 可能已扣款的拒绝被显示成红色失败（读产物确认 Privy 在 `Could not confirm payment status yet.`、`Unable to check payment status. Please try again.` 与未识别异常时都以错误结束流程）→ 只有结账准备阶段的三条错误与服务商报告的 `Transaction failed` 算失败，其余为常驻「状态未知」；P3 宿主启动前不复核身份、首屏随会话状态翻转、切网页回不到选择页、外部钱包的转入说明不准、不确定通知 10 秒消失、测试缺口（关闭回调、准备提交期间禁用返回、首屏只决定一次、切网页返回）、嵌套三元与 `market-close-*` 令牌、悬停未加 `not-data-disabled`、两段译文用空格拼接、文档数字落后，均已修复或更新。

- 用户要求继续处理上一轮留下的三件事（包体数字含本地配置、点购买后的空白、上线前提）。做法与依据：
  - 包体：在不含 `.env.local` 的隔离 worktree 里补测升级前的 `682430ba`，与同口径的 `c0e550c7` 相比 +84,032 / 首屏 +62,911（原记录 +83,687 / +62,713），差值在构建抖动内，基线不动；预算脚本在构建旁有 `.env*.local` 时打印提示（`findLocalEnvFiles`），避免再把本地配置量进基线。
  - 点购买后的空白：读 3.46.0 产物，`fund()` 同步调用 `openModal`，后者用 `setTimeout(…, 15)` 打开窗口，购买页是窗口内部的懒加载块并自带加载态。在生产构建上实测，点击到 Privy 第一个请求 22–29 ms。操作的 Chrome 窗口被遮挡（`visibilityState` 为 `hidden`），15 ms 的定时器实际要 590–1001 ms、页面不出帧，上一轮看到的「8–14 秒」和「空白退出框」是这个状态造成的，不是产品行为。我们这一侧能省的只有宿主块的下载：选择页显示且入口可用时预热。
  - 预热的实现选型：单独的加载器模块会把动态导入的块清单搬进运行时首屏的共享小块，手机与桌面运行时各多约 420 字节（在带开关并读 `.env.local` 的构建里桌面只剩 155 字节余量）；改为在 store 里记标记、下载仍留在闸门里，实测各多 93 与 173 字节。
  - 上线前提：读 Privy 文档与产物确认控制台要求、沙盒测试值和 Stripe 流程会收集的资料；线上 `app.sairn.ai` 与本地用的是同一个 Privy 应用；在用户 Chrome 已登录的控制台里只读查看了 Funding 页。点 `Continue` 之后的步骤会把登录邮箱交给 Stripe 并创建 Link 账户，测试网还要先签署条款，都需要用户本人，没有做。

- 用户要求开 PR 前用 Codex 做至少三轮对抗审查：对照开发文档核对实践与编码规范、查遗漏，发现分 blocker / major / minor，评分要高于 9.5。做法：每轮三路只读审查（行为与正确性、规范与文档、遗漏），`gpt-6-astra`、medium、`-s read-only`，审查期间不改工作区；每条发现先核实再修复或说明，修复后用变异核对测试确实钉得住。各轮的发现与处理记在「验证与限制」。

## 验证与限制

工作区基线 `c0e550c7`，2026-10-02 本机执行（机器负载高，load average 12–41）。

首版（购买卡片放在充值表单里，提交 `ca2cae61`；其入口文件与测试后来删除）：

- 新增测试：`privy-fiat-funding.test.ts` 20 项、`privy-fiat-funding-host.test.tsx` 7 项、`privy-fiat-funding-host-gate.test.tsx` 2 项、`privy-fiat-funding-entry.test.tsx` 8 项，均通过且无 act 警告；`deposit-form-routing.test.tsx` 新增插槽用例后 41 项通过。
- 相关契约与充值测试（最终一轮 17 个文件 448 项）通过：模态表面、设计 token 棘轮、i18n 响应式、Lingui 辅助函数翻译器、充值弹层守卫、HIP-3 弹窗、构建元数据、CSP 文档、手动分块等。
- `pnpm typecheck` 通过；`deploy/cloudfront/deploy.test.mjs` 18 项、`pnpm test:cloudfront` 45 项、`check-client-bundle-budget.test.mjs` 16 项通过（Node 22.15.0）。
- 终端全量测试两轮：第一轮 5 个文件超时失败、第二轮 8,035 项通过 1 项失败（`mobile-agent-sync-modal` 的定时器用例），失败的文件单独重跑全部通过；HIP-3 弹窗用例在阶段一提交下 2.7–3.5 秒、阶段二下 3.2–3.8 秒，超时来自负载而非本次改动。
- 浏览器：`account-actions` Playwright 套件 28 项通过（系统 Chrome，当时新增的 4 项检查夹具里的纯视图卡片）。
- 生产构建（固定构建身份、Node 22.15.0、配对关闭）：静态挂载宿主时桌面运行时超限（202,247 对上限 201,988）；改为懒加载后总量 +9,725，据此上调总量基线到 3,279,333。这组构建两边都读了开发用 `.env.local`，已被下面的 CI 同口径测量替代。

选择页、默认美元 100 与审查修复（提交前的工作区）：

- 用户 Chrome、本地 3005、Privy 邮箱会话、桌面浅色（审查修复前）：选择页显示正确；「转入 USDC」进入收款地址表单，左上角返回回到选择页；「用银行卡购买 USDC」关闭充值弹层并打开 Privy「Buy USDC」窗口，改默认值后显示 $100 USD、Continue 可用；未输入金额或支付信息即关闭，关闭后约 3–5 秒 Privy 自身的空白退出框，随后无通知（退出静默），再次打开时两个入口均可用；控制台无应用错误（只有用户 Chrome 里钱包扩展的报错）。中文界面显示「存款」「转入 USDC」「用银行卡购买 USDC」，测试后语言已切回英文。同一会话还观察到切换语言后图表 K 线不再出现、订单簿始终为空（直接请求 Hyperliquid 接口正常返回），与本改动无关，已另开后续任务。
- 审查修复后在同一 Chrome 标签页复测（15:28）：选择页文案为修复后的版本（邮箱会话「从交易所或钱包转入」）；转入→返回正常；选购买后充值弹层立即关闭，约 8–14 秒后 Privy 窗口出现（开发服务器按需转译懒加载块，当时两路生产构建并行、负载约 30），显示 $100 USD；关闭后空白退出框消失、无通知，再打开时两个入口都可用；控制台无应用错误。未输入任何支付信息。
- 单测（最终代码）：`privy-fiat-funding.test.ts` 21 项、`privy-fiat-funding-host.test.tsx` 9 项、`privy-fiat-funding-host-gate.test.tsx` 2 项、`use-privy-fiat-funding-offer.test.tsx` 9 项、`deposit-method-chooser.test.tsx` 3 项、`deposit-modal-withdrawal-routing-guard.test.tsx` 110 项、`deposit-form-routing.test.tsx` 39 项（删除表单插槽用例后），均通过。
- 终端全量测试：649 个文件通过、1 个跳过，8,053 项通过、1 项跳过，无失败（Node 22.15.0，159 秒，负载约 12–18）。
- 浏览器：`account-actions` Playwright 套件 28 项通过（系统 Chrome；其中 4 项是 375/1363 px、深浅主题下的选择页，邮箱与外部钱包各走一遍：两个入口及外部钱包的 ETH 说明、购买入口完整在视口内、无横向溢出、选「转入」进入表单、选「购买」关闭弹层）。这是夹具，不经过 Privy、钱包会话或真实弹层叠放。
- `pnpm --filter @sairn/terminal typecheck` 通过；`check-client-bundle-budget.test.mjs` 16 项通过；`git diff --check` 无输出。
- 包体：修复后的构建桌面运行时增量只剩 196 字节余量（201,792 对上限 201,988）。原因是闸门为一条「无法打开」提示引用了整个通知文案模块；改为闸门自带这一条（同一 msgid，目录不变），文案模块留在懒加载宿主块里，同口径构建的桌面增量降到 201,373、手机 117,793（各少约 420 和 350 字节）。随后发现此前所有构建都读了开发用 `apps/terminal/.env.local`（Privy 应用 ID 与三个 CCTP 开关会进入每个整体 `import.meta.env` 字面量），而 CI 没有这个文件；改在两个不含该文件的隔离 worktree 里重测：`c0e550c7` 总量 3,274,893、交易首屏 1,624,100、手机 117,422、桌面 200,714，最终工作区 3,286,669、1,626,692、117,794、201,375，即总量 +11,776、首屏 +2,592、手机 +372、桌面 +661，逐块拆分写进性能基线文档。总量基线改为 3,269,608 + 11,776 = 3,281,384（替代首版的 +9,725），预算脚本对最终产物通过（总量比基线多 5,285，这部分在 `c0e550c7` 上已存在），桌面增量余量 613 字节。升级那一节两边同样读了 `.env.local`，差值不受影响，已在性能基线文档追加更正（CI 同口径的绝对值低 531 / 327 字节）。
- 五种语言的翻译补齐，抽取后缺译回到原有的 43/3（总条目 2,422）。

未做：Privy 控制台入金方式的确认、沙盒与真实购买（未点 Continue）、外部钱包会话与手机/PWA 的真实测试、Stripe 嵌入组件在我们 CSP 下的加载、法律审阅与发布。

预热、复测与上线材料（提交 `a7b48b21` 之上的工作区，2026-10-02 16:00–17:45）：

- 更正上文两处观察：「约 8–14 秒后 Privy 窗口出现」与「关闭后约 3–5 秒的空白退出框」都发生在被遮挡的 Chrome 窗口里，原因是定时器限速与不出帧（见「结论与依据」最后一条），不是开发服务器转译，也不是产品行为；同一状态下页面加载后的第一次点击不命中，先截图出一帧后正常。
- 单测：`privy-fiat-funding-host-gate.test.tsx` 5 项（新增预热后提前加载、预热失败不提示且下次请求重试、预热期间发起的购买在加载失败时仍报告）、`deposit-modal-withdrawal-routing-guard.test.tsx` 112 项（新增只在入口显示且可用时预热）通过；变异核对：去掉闸门里的清除标记、把预热条件放宽为弹层打开，各有 1 项失败。`check-client-bundle-budget.test.mjs` 17 项通过。类型检查通过。
- 终端全量测试两轮（Node 22.15.0）：第一轮 8,057 项通过、1 项跳过、1 项失败（`client-bootstrap-error.test.ts` 的遥测模块加载失败用例，1,008 ms 超时；该文件单独重跑三次均为 2 项通过，本次没有改动它涉及的代码，当时负载约 17–47）；第二轮 649 个文件通过、1 个跳过，8,058 项通过、1 项跳过，无失败。`account-actions` 浏览器套件这一轮没有重跑（夹具不经过充值弹层与 store）。
- CI 同口径构建（不含 `.env.local`，固定构建身份，Node 22.15.0）：`682430ba` 3,190,861 / 1,561,189 / 117,427 / 201,008；带预热的工作区 3,287,254 / 1,626,872 / 117,887 / 201,548，预算通过，桌面运行时余量 440 字节。
- 生产构建实测（两个开关打开并读 `.env.local` 的构建、本地 Nitro、强制 CSP；`/api/geo` 由只回答该路径的本地代理返回 GB，因为 IP 归属服务不认回环地址、存款按设计保持关闭）：用户 Chrome 的邮箱会话、主网。选择页出现前 5 ms 宿主块开始下载；两次点击「购买」后 29 ms 与 22 ms Privy 发出 `sessions` / `quotes` 请求；窗口显示 Buy USDC、$100、USD，`Continue` 可用（报价 1 条，未看到服务商名）；关闭后无通知、入口恢复；全程 `securitypolicyviolation` 为空。输入路径是扩展注入的鼠标事件，窗口处于 hidden。
- 策略探测（同一页面）：preload `js.stripe.com/crypto-onramp/v1/crypto-onramp.js`（3.46.0 实际加载的 SDK）与 `crypto-js.stripe.com/crypto-onramp-outer.js`、no-cors 请求 `api.stripe.com` 与 `link.com`、隐藏 iframe `js.stripe.com` 与 `hooks.stripe.com` 均无违规；对照 `example.com` 的脚本、请求、框架各触发一次违规。这只证明策略放行这些来源，不是 Stripe 流程的验证。
- 线上核对：`app.sairn.ai` 首屏 130 个脚本里 5 个含本地 Privy 应用 ID（不输出值）；`build-meta.json` 为 p24，`cctpDeposits.testnetSponsoredWallet` 为 false。
- Privy 控制台（用户 Chrome 已登录，只读）：Sairn 应用的 Card onramps 开启，Stripe、MoonPay 为 Enabled，Meld 未配置，Bank transfer、Exchange、Crypto deposits 关闭；页面提示应用处于 development mode。没有改任何设置。
- 测试中切到过 Testnet：弹出条款接受窗口，未接受也未拒绝；用本地存储键改回 Mainnet 并刷新。测试后清除了本地 3005 的 Service Worker 壳缓存，开发服务器已恢复。
- 窗口尺寸调整在被遮挡的窗口里不生效，没有做手机宽度下真实 Privy 窗口的检查。

Codex 对抗审查（2026-10-02 18:00 起，基线 `682430ba`）：

- 审查前自查（提交 `12ec99ac`）：CI 只跑手选清单，五个入金测试不在其中，已加入；选择页的不可用说明改成与充值表单一致的提示框，夹具浏览器用例补了这个状态（4 项通过，查看了 375 px 深色与 1363 px 浅色两张截图）。
- 第一轮审 `682430ba..12ec99ac`（Codex 会话 `01a0fc18-675c…`、`01a0fc18-7261…`、`01a0fc18-72eb…`），评分 5.7、5.7、5.5。逐条核实后的处理（提交 `1e64a5fb`，升级分支上的 `cf7e8d8b`、`26a999aa` 经 `30991cff` 合入，以及本记录所在的提交）：
  - blocker，三路一致：常驻的购买通知发布之后不再跟身份绑定，也不随语言重译；宿主加载失败的提示没有身份核对。成立。充值、提现等资金弹层的常驻提示是同样的做法，但购买结果与钱包强相关、可能长时间停留。改为宿主按尝试保存发起时的 owner 与网络、结果、钱包类型，照 `CctpDepositTrackingNotifier` 的做法用展示 ID 发布：别的身份为当前时撤下并保留记录，回到该身份再显示；切语言原位重译；迟到的结果记在原 owner 名下。闸门的加载失败提示先核对身份。
  - major：钱包身份变化时全局弹窗宿主按身份 key 重建充值弹层，「首屏每次打开只决定一次」在这种情况下不成立。成立。重建是既有的资金上下文保护，重建后按新身份重新决定首屏也更合理（刚创建钱包的邮箱用户应当看到两个入口），所以改的是 ADR 的表述并补了用例，没有把这个决定提到身份之外。
  - major：弹层关闭后的退出动画期间仍能发起购买。成立；`available` 加入 `open`。
  - major：开关解析、运行时取值和构建元数据里的取值没有被测试钉住；宿主的测试网用例自相矛盾；StrictMode 用例没有覆盖带着请求首次挂载。成立；补了开关输入矩阵、两网四种组合的运行时取值、构建元数据取值、网络身份用例。核实时发现更大的问题：测试用的 `createI18nRoot` 把 StrictMode 放在 Provider 里面，Effect 并没有被重放（探针实测 1 次，StrictMode 在最外层时 2 次），原记录「StrictMode 下只调用一次」从未真正被验证。改为 StrictMode 在最外层后，去掉启动去重的变异会失败。
  - major：`build-meta`、`security-policy-docs`、`vite-manual-chunks` 三个测试不在任何工作流里，生产构建的路径过滤没有 `patches/**`。成立；前两个随入金测试进终端测试工作流，分块测试与 `patches/**` 提交在升级分支上，`ci-workflows.test.mjs` 加了对应断言（9 项通过）。
  - major：上线清单自相矛盾（真实购买要求已发布的构建，发布又要求它先通过；「任何时候关闭都没有通知」与 SDK 不符）。成立；改成「公开发布之前」与「发布与发布之后」两步，真实购买在不公开的本地构建上做；关闭窗口按付款前、处理中、出错后三种时机分别写预期；补了发布后冒烟、异常与恢复、关闭与回滚、责任边界。
  - minor：选择页的提示框不在圆角契约的扫描范围，四个新文件不在语言响应契约的清单里；升级测量的更正只在后续提交里。都成立；前者已登记，后者把更正和说明提交到升级分支。
  - 核实过程中自己发现并一起修的：服务商报告取消（`Transaction cancelled`）和卡被拒（`StripePaymentMethodError`）原先落进「状态未知」，改为「未完成」；`fund` 同步抛出时尝试会一直挂着，改为按拒绝处理；测试钉住关闭窗口时 SDK 走哪个分支。
  - 变异核对（逐个改源码、跑对应测试、再还原）：去掉按身份撤下、去掉语言重译、去掉过期关闭回调的保护、去掉启动去重、去掉同步抛出保护、去掉闸门的身份核对、`available` 去掉 `open`、忽略提款进行中、提示框圆角改成 `rounded-8`，九项都有测试失败。
  - 修复时用同名新文件覆盖了已有的 `wrong-network-screen.test.tsx`（两个既有用例），提交前从目录的来源注释变化发现，已恢复原文件并把新用例并入（5 项通过）。
  - CI 同口径构建（第一轮修复后的代码）：总量 3,286,913、交易首屏 1,626,723、手机 117,968、桌面 201,590，预算通过，桌面运行时余量 398 字节。
  - 第一轮修复后的终端全量测试（Node 22.15.0）：649 个文件通过、1 个跳过，8,094 项通过、1 项跳过，无失败；类型检查通过；`check-client-bundle-budget.test.mjs` 18 项、`ci-workflows.test.mjs` 9 项通过。
- 第二轮审 `682430ba..eec28ce2`（Codex 会话 `01a0fc42-16b5…`、`01a0fc42-1fed…`、`01a0fc42-21c2…`），三路都是 6.0（有 blocker 时封顶 6）。逐条核实后的处理（本记录所在的提交）：
  - blocker，三路一致：第一轮的通知修复只保护了宿主里的记录，交给 Sonner 的是已经生成的字符串。Sonner 撤下走两帧动画、插入走定时器；撤下的帧先跑完时，旧身份的常驻通知会在新身份的页面上插入并留下，而宿主已经忘了它的 ID。闸门的加载失败提示只在发布那一刻核对身份，宿主卸载也不清理。成立：审查者在内存里按这个顺序驱动安装的 Sonner 得到了残留，仓库的订单通知也早有同类用例。改为与订单通知同一套生命周期：展示实例加 `toast.custom` 内容组件 `PrivyFiatFundingNoticeCard`，内容在渲染时核对展示实例、当前 owner 与网络并原位翻译，不符时不呈现、结束自己的展示实例并关闭自己的 Sonner ID；宿主卸载时结束全部展示。
  - 闸门的失败提示没法照此处理：闸门在运行时首屏里，桌面余量只有 398 字节，放不下带身份核对的卡片。于是把动态导入和失败提示移到发起购买的一侧（`launchPrivyFiatFunding`，在充值弹层的块里），闸门只渲染 store 里已加载的宿主；预热改为弹层直接调用同一个加载函数，store 的预热标记删除。运行时首屏因此变小（见下面的构建读数）。
  - 写新测试时自己发现的缺陷：身份在同一拍里离开又回来时，内容组件已经要求 Sonner 移除通知，而 Sonner 对程序化移除同样调用 `onDismiss`，会被当成用户关闭，常驻的「状态未知」就此丢失。先写出失败的用例，再改：内容组件发现不可见时先结束自己的展示实例；宿主在 Effect 里直接发布和撤下（最初照订单宿主放在可取消的 microtask 里，正是这一步延迟留出了窗口），所以身份变化的那次提交里展示实例就已结束。订单通知宿主有同样的路径，但那里的关闭是软隐藏，没有改它。
  - major（B）：测试网沙盒结束后的通知仍说 USDC 在路上、到账后去存款。成立。通知记录带上网络；沙盒的确认、提交、未知、失败都只显示一句「这是沙盒测试，没有扣款也不会到账」，不带 ETH 说明、不常驻。依据是 Privy 文档 Test in sandbox mode 的 no real funds move。新增一条消息，五种语言补齐，抽取后缺译仍是 43/3（总条目 2,423）。
  - major（B）：回滚说明要求用旧源码重建，而当前 `deploy.mjs` 拒绝没有 `privyFiatFunding` 字段的产物。成立。改为：关闭功能用当前源码发开关关闭的构建；整版回退在旧提交的检出里用它自己的发布工具；注明这条路径没有演练。
  - major（B）：钉 SDK 关闭分支的三个正则漏掉 Stripe 结账确认中的条件，把它换成 `false` 测试仍通过。成立。改为从安装的产物里取出判定表达式并对七种状态求值，另加三个用例验证改掉任一操作数都会被发现。
  - major（C）：开关的解析有测试，但充值弹层把哪个网络的开关传给入口没有测试。成立。守卫测试的网络改为可配置并桩住开关，两网四种组合断言传给入口的 `enabled`。
  - major（C）与 minor（A、B）：上线清单的 CF-12 不属于任何阶段，生产产物上没有完整流程的要求，表格被空行截断。成立。清单改为三个阶段（发布之前、沙盒发布、主网发布之后），每行写明执行环境。核对发布文档后确认主网与测试网站点共用一份产物、测试网开关不需要确认参数，所以沙盒发布可以在线上测试网站点的发布产物与响应头下完成沙盒验收而不影响主网；主网发布后必须用最低金额真实购买一次；CF-12 拆成必须项与只记录项；写明没有覆盖的组合（邮箱钱包在发布产物上的沙盒流程，因为测试网站点没有打开邮箱钱包的测试网存款）及其替代；加了测试人所在地区的要求。
  - minor（C）：`dialog-notice-radius-contract` 与 `i18n-reactivity-contract` 不在 CI，ADR 索引仍写控制台未开启，规划文档保留了没有身份限定的旧表述。都成立；两个契约测试加入工作流和 `ci-workflows.test.mjs` 的断言，索引与规划文档已更正。预算脚本的本地环境文件提示补了一条钉住调用处的源码断言。
  - 「无法确认」里采纳的一条：`StripePaymentMethodError` 不只在明确拒卡时出现。读产物确认 SDK 有两处构造它：按错误文本匹配（其中有 `processing_error`），以及结账结果里含 decline、insufficient 字样的任意服务商代码（集合里有 `transaction_failed`）。改为只有十个明确拒卡原因判为「未完成」，其余按「状态未知」；测试钉住 SDK 有文案的原因清单正好是这十个加另外两个。
  - 没有采纳的：`fund` 调用之后、Privy 用 15 ms 定时器开窗之前身份变化时窗口仍会打开。3.46.0 的类型声明里没有让应用关闭这个窗口的接口，购买会付到点击时核对过的 owner，结果也记在它名下；写进 ADR 0034 决策 7 的已知边界。
  - 变异核对（最终代码，逐个改源码、跑对应测试、再还原，三十三项全部有测试失败）：内容不核对身份、不核对展示实例、不自行关闭、自行关闭但不结束展示实例；宿主不撤下、卸载不清理、为别的身份发布、重复发布；关闭回调不核对展示实例、撤下不结束展示实例、关闭后记录不移除；去掉启动去重、去掉启动前的身份核对、同步抛出不捕获、退出也提示、尝试不结束；通知或宿主的身份不含网络、常驻通知带计时、沙盒用真实文案、沙盒常驻、未证实的拒卡判为失败、错误不作为 alert；弹层读另一网络的开关、弹层不预热、入口先发起后关弹层；加载失败时结束了别的尝试、不结束尝试、不提示，加载器不挂载、闸门不渲染宿主、预热失败也提示、加载结束后才登记尝试。过程中有四个变异一度存活，分别说明宿主里有三处多余的判断（已删除）和一处没被钉住的行为（宿主不为别的身份发布，已补断言）。
  - 单测（最终代码）：`privy-fiat-funding.test.ts` 44 项、`privy-fiat-funding-host.test.tsx` 23 项、`privy-fiat-funding-host-gate.test.tsx` 11 项（两者都用真实 Sonner 与真实 Toaster、假定时器加受控动画帧、StrictMode 在最外层、断言实际 DOM）、`use-privy-fiat-funding-offer.test.tsx` 9 项、`deposit-modal-withdrawal-routing-guard.test.tsx` 118 项通过；`check-client-bundle-budget.test.mjs` 19 项、`ci-workflows.test.mjs` 9 项通过；类型检查与 Biome 通过。
  - 通知卡片的渲染读数：无头 Chromium 经 Playwright 访问本地开发服务器（3005，未连接钱包），在页面里动态导入发布函数直接发布七条通知，不经过购买流程。1440 与 375 px、深浅主题、英文、中文、阿拉伯文：属于当前身份的六条各渲染一张卡片，属于另一网络的那条不渲染；卡片宽 320 px（手机 343 px），页面无横向溢出；错误类为 `role="alert"`，其余为 `role="status"`；阿拉伯文下方向为 RTL。看了三张截图（桌面深色、手机浅色中文、桌面深色阿拉伯文）。第一次读数只看到两张卡片：脚本里的悬停等待超过了 10 秒，非常驻的四张已经按时关闭，去掉悬停后重测得到上面的结果。这是脚本读数，不是人工视觉验收。
  - CI 同口径构建（不含 `.env.local`，固定构建身份，Node 22.15.0，隔离 worktree）：最终代码总量 3,289,035、交易首屏 1,626,859、手机 117,653、桌面 201,275，预算通过；同一天重建第一轮提交 `eec28ce2` 得到 3,286,913 / 1,626,723 / 117,968 / 201,590，与当时的记录逐字节相同。逐块对比：充值弹层的块 +2,332（通知卡片、发布函数、展示实例、发起函数和并入的领域模块），原先单独的领域模块块 -669，通知宿主所在的块 -257（闸门不再导入、核对身份和带文案），六种语言目录 +225，懒加载宿主块 +165，路由 vendor 块 +149，其余 245 个块合计 +177。两个运行时增量各少 315 字节，桌面余量从 398 增加到 713 字节。总量基线按「相对升级提交的实测增量」改为 3,269,608 + 14,142 = 3,283,750，替代 3,281,384。
  - 第二轮修复后的终端全量测试（Node 22.15.0，239 秒）：649 个文件通过、1 个跳过，8,116 项通过、1 项跳过，无失败。`account-actions` 浏览器套件这一轮没有重跑：它的夹具直接渲染选择页，不经过本轮改动的宿主、加载与通知模块。

## 后续与替代关系

- 打开主网开关前按 ADR 0034「上线前提」逐条完成并记录。
- `permissions-policy` 是否为 Stripe 放开 `payment` 与 `camera`，待沙盒实测后单独决定。
- 应用 viem 去重（见阶段一记录）仍是后续。
- 合并 `claude/silent-email-wallet` 时保留 `createOnLogin: "off"` 与 `EmailEmbeddedWalletProvider`，并重跑其列出的四个测试。
- （已由上文更正并处理：实测间隔为几十毫秒，宿主块改为预热。）选「购买」后到 Privy 窗口出现之间没有进度提示。生产环境里我们懒加载的只有约 1.3 KB 的宿主块（Privy 入金模块已在交易首屏闭包里），其余是 Privy 自己的购买窗口块，等待应远短于开发服务器上的 8–14 秒（未在生产构建上测量）；若真机上仍明显，可在指向或聚焦购买入口时预热宿主块。
- 桌面运行时增量余量 613 字节，加入预热后为 440 字节，第一轮审查修复后为 398 字节，第二轮把加载移出闸门后为 713 字节：下一个进入桌面首屏的改动仍需要自己的缩减或评审。
- 待人工完成的验收逐行写在[上线验收清单](../../privy-card-funding-launch-checklist.md)；法律文本的[待审草案](../../privy-card-funding-legal-draft.md)需要合格法律审阅。
- 待用户决定：是否把购买窗口的币种收窄到有服务商的四种（USD、EUR、AUD、BRL）；Privy 应用是否从 development mode 升级；是否做 Meld KYB。
- 订单通知宿主（`order-notification-host.tsx`）在可取消的 microtask 里发布，身份在同一拍里离开又回来时，内容组件要求的移除会经 Sonner 的 `onDismiss` 被当成用户关闭；那里的关闭是软隐藏、状态推进会重新显示，所以这次没有改，留作单独评估。
- 展示实例的工厂函数与订单通知的 `createOrderNotificationPresentation` 结构相同；这次没有合并，避免改动订单通知的代码。
- 断网恢复后不刷新页面能否再次加载宿主块，取决于浏览器是否缓存失败的动态导入，没有验证；上线清单 CF-12 的只记录项。
