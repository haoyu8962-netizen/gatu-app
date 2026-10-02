<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-privy-card-funding",
  "date": "2026-10-02",
  "title": "Privy 银行卡入金（阶段二）：精确 owner 收款、分网开关与发布闸门",
  "kind": "task",
  "status": "recorded",
  "topics": ["account-funding", "static-hosting"],
  "summary": "按用户决定（只做法币、邮箱与外部钱包都开放、主网测试网分开开关）在阶段一升级之上实现银行卡入金：useFiatOnramp 显式收款到精确的 Hyperliquid owner（须在 Privy 已连接列表中），不用会退回第一个嵌入式钱包的 useDepositFunds；入口先关充值弹层，页面级宿主持有请求，确认/提交都不声称到账；build-meta 记录开关，主网发布需 --allow-mainnet-card-funding；CSP 静态放行 Stripe 公布的来源并重新生成 CloudFront 响应函数；ADR 0034。法律文本未改（需合格法律审阅），permissions-policy 未改（Apple/Google Pay 与页面内摄像头不可用）。未开启 Privy 控制台、未做沙盒与真实购买。",
  "thread": null,
  "baseCommit": "c0e550c7",
  "commits": [],
  "sources": [
    { "path": "docs/adr/0034-privy-card-funding.md" },
    { "path": "docs/privy-upgrade-and-funding-plan.md" },
    { "path": "apps/terminal/src/domain/trade/privy-fiat-funding.ts" },
    { "path": "apps/terminal/src/components/trade/tradebox/privy-fiat-funding-host.tsx" },
    { "path": "apps/terminal/src/components/trade/tradebox/deposit/privy-fiat-funding-entry.tsx" },
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

## 验证与限制

工作区基线 `c0e550c7`，2026-10-02 本机执行（机器负载高，load average 20–41）：

- 新增测试：`privy-fiat-funding.test.ts` 20 项、`privy-fiat-funding-host.test.tsx` 7 项、`privy-fiat-funding-host-gate.test.tsx` 2 项、`privy-fiat-funding-entry.test.tsx` 8 项，均通过且无 act 警告；`deposit-form-routing.test.tsx` 新增插槽用例后 41 项通过。
- 相关契约与充值测试（最终一轮 17 个文件 448 项）通过：模态表面、设计 token 棘轮、i18n 响应式、Lingui 辅助函数翻译器、充值弹层守卫、HIP-3 弹窗、构建元数据、CSP 文档、手动分块等。
- `pnpm typecheck` 通过；`deploy/cloudfront/deploy.test.mjs` 18 项、`pnpm test:cloudfront` 45 项、`check-client-bundle-budget.test.mjs` 16 项通过（Node 22.15.0）。
- 终端全量测试两轮：第一轮 5 个文件超时失败、第二轮 8,035 项通过 1 项失败（`mobile-agent-sync-modal` 的定时器用例），失败的文件单独重跑全部通过；HIP-3 弹窗用例在阶段一提交下 2.7–3.5 秒、阶段二下 3.2–3.8 秒，超时来自负载而非本次改动。
- 浏览器：`account-actions` Playwright 套件 28 项通过（系统 Chrome，含新增 4 项：375/1363 px、深浅主题、邮箱与外部钱包的卡片可见、无横向溢出、按钮在视口内可点）；截图人工查看了 375 px 深色外部钱包与 1363 px 浅色邮箱两张。这是夹具里的纯视图卡片，不经过 Privy、钱包会话或真实弹层叠放。
- 生产构建（固定构建身份、Node 22.15.0、配对关闭）：静态挂载宿主时桌面运行时超限（202,247 对上限 201,988）；改为懒加载后与阶段一提交逐块比较，总量 +9,725，按规则上调总量基线到 3,279,333；最终完整构建通过（总量 3,285,514、交易首屏 1,627,095、手机 118,097、桌面 201,735），`build-meta.json` 记录 `privyFiatFunding` 两网均为 false。两次相同源码的构建相差几百字节，已在性能基线文档注明。
- 五种语言新增 12 条翻译，抽取后缺译回到原有的 43/3。

未做：Privy 控制台开启入金方式、沙盒与真实购买、真实钱包下的 Privy 窗口与弹层叠放、移动端与 PWA、CSP 覆盖脚本、法律审阅与发布。

## 后续与替代关系

- 打开主网开关前按 ADR 0034「上线前提」逐条完成并记录。
- `permissions-policy` 是否为 Stripe 放开 `payment` 与 `camera`，待沙盒实测后单独决定。
- 应用 viem 去重（见阶段一记录）仍是后续。
- 合并 `claude/silent-email-wallet` 时保留 `createOnLogin: "off"` 与 `EmailEmbeddedWalletProvider`，并重跑其列出的四个测试。
