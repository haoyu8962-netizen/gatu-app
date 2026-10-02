<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-privy-card-funding",
  "date": "2026-10-02",
  "title": "Privy 银行卡入金（阶段二）：精确 owner 收款、分网开关与发布闸门",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "static-hosting"],
  "summary": "按用户决定（只做法币、邮箱与外部钱包都开放、主网测试网分开开关）在阶段一升级之上实现银行卡入金：useFiatOnramp 显式收款到精确的 Hyperliquid owner（须在 Privy 已连接列表中），不用会退回第一个嵌入式钱包的 useDepositFunds；用户看过官方终端后要求独立入口，充值弹层第一屏改为「转入 USDC」与「用银行卡购买 USDC」两个入口；购买窗口默认美元 100；选购买先关充值弹层，页面级宿主（首次请求时懒加载）持有请求，确认/提交都不声称到账，可能已扣款的拒绝报常驻的状态未知；独立审查 1 项 P2、9 项 P3 已修；build-meta 记录开关，主网发布需 --allow-mainnet-card-funding；CSP 静态放行 Stripe 公布的来源并重新生成 CloudFront 响应函数；总量基线按 CI 同口径实测 +11,776；ADR 0034。法律文本未改（需合格法律审阅），permissions-policy 未改（Apple/Google Pay 与页面内摄像头不可用）。未开启 Privy 控制台、未做沙盒与真实购买。",
  "thread": null,
  "baseCommit": "c0e550c7",
  "commits": ["ca2cae61"],
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
    { "path": "docs/confirmation-surfaces.md" }
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

## 后续与替代关系

- 打开主网开关前按 ADR 0034「上线前提」逐条完成并记录。
- `permissions-policy` 是否为 Stripe 放开 `payment` 与 `camera`，待沙盒实测后单独决定。
- 应用 viem 去重（见阶段一记录）仍是后续。
- 合并 `claude/silent-email-wallet` 时保留 `createOnLogin: "off"` 与 `EmailEmbeddedWalletProvider`，并重跑其列出的四个测试。
- 选「购买」后到 Privy 窗口出现之间没有进度提示。生产环境里我们懒加载的只有约 1.3 KB 的宿主块（Privy 入金模块已在交易首屏闭包里），其余是 Privy 自己的购买窗口块，等待应远短于开发服务器上的 8–14 秒（未在生产构建上测量）；若真机上仍明显，可在指向或聚焦购买入口时预热宿主块。
- 桌面运行时增量余量 613 字节：下一个进入桌面首屏的改动需要自己的缩减或评审。
