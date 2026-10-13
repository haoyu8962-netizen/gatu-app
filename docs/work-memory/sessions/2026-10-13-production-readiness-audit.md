<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-13-production-readiness-audit",
  "date": "2026-10-13",
  "title": "按模块与风险的生产就绪审计：五路审查、按功能测试与两批修复",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "order-entry", "account-funding", "wallet-onboarding", "static-hosting"],
  "summary": "运营方要求审查当前代码、按模块与风险找出不符合生产要求之处并按功能测试。基线 dev 6525fd04。五路只读审查（签名与注册、下单执行、资金流转、数据层、平台与安全）共报告 26 项，经本人逐项核对并实测 CSV 格式化输出。按功能测试：28 个路由 × 桌面与手机的冒烟无错误，全量单测与两套浏览器回归通过。本记录的第一批修复：成交/TWAP CSV 导出改写协议原值并修正负数前缀；TP/SL 改单在撤单后被明确拒绝时报已知失败而不是占位 2 分钟；自动存款签名前失败按退避重试；质押/金库/API 钱包共用遍历 cause 的拒签判定，金库守卫只在 SDK 边界置位并把本地中止归为确定失败；邮箱签名会话不再绑定 Privy 的函数身份；推荐地区接口按 IP 限流并限制请求体；订阅上限条目在释放时删除；跳过确认时的双击锁。每项修复都有会失败的测试并做了还原核对。未修复项见后续。",
  "thread": null,
  "baseCommit": "6525fd04",
  "commits": [],
  "sources": [
    {"path": "apps/terminal/src/lib/csv.ts"},
    {"path": "apps/terminal/src/components/trade/positions/history-tab.tsx"},
    {"path": "apps/terminal/src/components/trade/positions/position-tpsl-modal.tsx"},
    {"path": "apps/terminal/src/components/trade/tradebox/embedded-deposit-auto-bridge.tsx"},
    {"path": "apps/terminal/src/lib/errors/action-error.ts"},
    {"path": "apps/terminal/src/components/staking/use-staking-actions.ts"},
    {"path": "apps/terminal/src/components/vaults/use-vault-action-controller.ts"},
    {"path": "apps/terminal/src/components/vaults/vault-action-domain.ts"},
    {"path": "apps/terminal/src/hooks/wallet/use-privy-owner-signer.ts"},
    {"path": "apps/terminal/src/lib/geo/geo-api.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-order-confirmation.ts"},
    {"path": "packages/hl-react/src/store.ts"},
    {"path": "packages/hl-react/src/internal/exchange/request-scheduler.ts"},
    {"path": "packages/hl-react/src/hooks/useExchange.ts"},
    {"path": "apps/terminal/src/lib/hyperliquid/use-deposit.ts"},
    {"path": "apps/terminal/src/lib/hyperliquid/deposit-submission-outcome.ts"},
    {"path": "apps/terminal/src/components/trade/components/spot-swap-modal.tsx"},
    {"path": "apps/terminal/src/lib/trade/account-ledger.ts"},
    {"path": "apps/terminal/src/lib/server/fixed-window-ip-limiter.ts"},
    {"path": "apps/terminal/src/lib/error-reporting/server.ts"},
    {"path": "apps/terminal/src/lib/markdown.tsx"},
    {"path": "apps/terminal/src/components/pages/not-found-page.tsx"},
    {"path": ".github/workflows/static-checks.yml"},
    {"path": "docs/adr/0023-open-interest-cap-advisory-check.md"},
    {"path": "scripts/check-client-bundle-budget.mjs"},
    {"path": "docs/confirmation-surfaces.md"},
    {"path": "docs/cctp-deposits.md"},
    {"path": "CHANGELOG.md"}
  ],
  "supersedes": []
}
-->
# 按模块与风险的生产就绪审计：五路审查、按功能测试与第一批修复

## 背景与范围

同步记录，未取得任务标识。运营方要求「审当前代码，按模块和风险挑，查看哪里不符合生产要求，分功能测试」，随后要求「核对官方开发文档或调试交易终端，规划修复任务并执行，再调用 Codex 对抗审查」。基线是 `dev` 的 `6525fd04`（PR #107 合并后），工作树 `version-hint`，分支 `claude/prod-audit-fixes`。

审查方式：五个只读审查代理各负责一个模块（签名与注册、下单与执行、资金流转、市场与账户数据、平台与安全），要求每项发现给出 file:line 与具体失败场景；本人对每项高优先级发现重读代码核对，对 CSV 格式化用真实的 `lib/format.ts` 跑出实际输出。

## 结论与依据

### 按功能测试（修复前，基线 6525fd04）

- 终端全量单测：682 个文件、9161 条，全部通过（含昨日对同一代码树的运行）。
- 浏览器回归：CI 两个分片 + 本机下单面板 47 条、账户与资金 36 条，通过。
- 路由冒烟：28 个路由（交易、分类入口、仪表盘、历史、文档、法律、推荐、404）× 桌面 1440 与手机 390，连真实主网数据；无控制台错误、页面异常、5xx、错误边界、启动占位卡住。脚本在 `.claude` 之外的草稿目录，未入库。唯一观察：`/trade/<不存在的市场>` 显示 404 页但标题仍是通用标题。

### 审查发现与处置

| 模块 | 发现 | 核对 | 处置 |
| --- | --- | --- | --- |
| 数据层 | 成交/TWAP CSV 用展示格式写数字：实测 `95001.5`→`$95K`、`12345.67`→`+$12.35K`、`0.00001234`→`$0.00`；`lib/csv.ts` 给所有负数加 `'` 前缀 | 实测 | **已修**：导出写协议原值，手续费币种单独一列，纯数字不加前缀 |
| 下单 | TP/SL 改单：撤单成功、新单被明确拒绝时判为「不明」，丢弃交易所原文，写入无人释放的排他资产占位（2 分钟内该市场平仓/反手/开仓都被拦） | 读码确认：`uncertain = mutationStarted && (completedMutation || …)`；占位只由 pending store 对账释放 | **已修**：撤单后执行守卫或交易所明确拒绝新单→失败，通知说明旧单已撤、新单未下，附原文，不占位 |
| 资金 | 邮箱自动存款在签名前失败后停在错误状态直到余额变化；ADR 0040 已去掉手动按钮 | 读码确认 | **已修**：无哈希、无授权意向、结果不是未知时按退避重试 |
| 资金 | 质押/金库把 SDK 包进 `cause` 的钱包拒签判成「未知」，标记滞留，金库与质押入口禁用 | 读 SDK `_abstractWallet.js` 确认包装 | **已修**：共用 `isWalletRejectionError`（遍历 cause）；API 钱包页同改 |
| 资金 | 金库 `guardPassed` 在入队前的第一次守卫就置位，锁超时等本地中止被判「未知」 | 读码确认 | **已修**：第二次（SDK 边界）才置位；锁超时/法律/身份/钱包不匹配错误归为确定失败 |
| 签名 | 邮箱签名会话 memo 依赖 Privy 的 `signTypedData`，Privy provider 值每次渲染新建，任何重渲染作废进行中请求 | 读 Privy 3.46 产物确认未 memo | **已修**：函数放 ref，会话只比较 owner/userId/env/钱包地址 |
| 平台 | `/api/referral-geo` 无限流、请求体无上限，可耗尽 IPdata 配额使全站 fail-closed | 读码确认 | **已修**：每 IP 每分钟 12 次，超出 429；请求体上限 1 KiB |
| 数据层 | 订阅上限命中后的错误条目永不清除，`wsStatus` 卡 error | 读码 + 测试复现 | **已修** |
| 下单 | 跳过确认时无同步点击锁，双击多出一条假失败通知 | 读码确认 | **已修** |
| 签名 | 外部钱包会话里用户签名与 Agent 签名共用 generation 槽位互相作废 | 读码确认 | 未修：涉及调度器身份模型，需单独设计 |
| 平台 | `main`/`dev` 无分支保护，工作流只跑 `pull_request` | 事实 | 未修：GitHub 设置属运营方 |
| 平台 | 桌面运行时包体余量约 460 字节 | 本机构建读数 | 未修：需重定基线决定 |
| 数据层 | 现货余额无价格时用入场成本冒充市值并参与小额过滤 | 读码确认 | 未修：改变余额消费方的类型，需设计 |
| 数据层 | 账本 Big.js `toString` 可出 `-1e-7` | 读码 | 未修：需登记 toFixed 契约，另开 |
| 下单 | OI 上限未知时按未封顶放行限价开仓 | 读码 | 未修：未就绪期间会把限价单置灰，需产品决定 |
| 资金 | 外部钱包存款在钱包报错时无「可能已广播」标记；现货兑换 Max 用浮点余额；资金锁内 Circle 请求无超时 | 读码 | 未修，列入后续 |
| 平台 | 错误上报限流为全局；图表 iframe 同源 `unsafe-inline`；SW 缓存 opaque 图标；Markdown 链接不校验协议；工作流无 `permissions` | 读码 | 未修，列入后续 |

审查代理也核对并排除了：精确 owner 签名与 Agent 核验、资金锁跨签名与广播、存款目的地与授权绑定、提款锁内重读、下单数量/价格展示即提交、ADR 0017 平仓上限、CSP 无 `unsafe-inline`、无 XSS 汇入点、网络切换只跳固定域名、服务端密钥不进客户端。

## 验证与限制

版本：`claude/prod-audit-fixes` 工作区，基线 `6525fd04`，提交前。

- `pnpm exec biome check`（28 个改动文件）、`pnpm typecheck`：通过。
- 改动相关测试：csv、desktop-history-exports、history-csv-twap、trade-history-page、mobile-history-cards、position-tpsl-modal（含新用例）、embedded-deposit-auto-bridge（含新用例）、staking-actions、use-vault-action-controller（含两条新用例）、use-privy-owner-signer（新用例替换一条断言相反行为的旧用例）、geo-api、order-confirmation-gate、subscription-limit-release（新文件）、privy-owner-signer：全部通过。
- 还原核对：逐个把修复文件还原到 `HEAD` 再跑对应测试，csv、geo-api、确认门、签名会话、自动存款、TP/SL、质押、金库守卫、金库分类、订阅上限各自失败，恢复后通过。
- `node --test scripts/ci-workflows.test.mjs`：14 条通过（新增两个测试文件登记进 CI 清单）。
- 全量单测（第一批修复后）：683 个文件、9171 条，除沙箱内不能绑定端口的 `vite-development-cache` 外全部通过。
- Codex CLI（`gpt-6-astra`、只读、`low`）第一轮：7 项（无 P0/P1；评分 7/8/6）全部处理：自动存款的重试定时器在 effect 重跑时被重置并加倍退避（改为同一资格键保留已排定的定时器，并用费率报价对象身份变化的重渲染测试钉住）；共用拒签判定漏掉旧实现的两句钱包文案（恢复并补测试）；签名函数 ref 在渲染期更新（改为 layout effect 内同步发布）；订阅上限条目没有引用计数（加 `overflowConsumers`，两个消费者的测试）；CHANGELOG 对限流的措辞改为「每实例」；CSV 的 PNL 仍经 `getToolbarNonZeroPnl`（改为原样导出 `closedPnl`）；确认门的双击测试不能失败（改为用显式闸门挂起 `execute`，还原后确认失败）。第二轮（评分 8/9/7）：前 7 项中 6 项确认解决，订阅上限条目的引用计数仍有缺口（容量恢复后、同键的新消费者创建 runtime 时没有把被拒的旧消费者计入 `refCount`，任一方释放都会停掉另一方的数据），已改为创建 runtime 时吸收 `overflowConsumers` 的计数并加测试；另一项 P3 是文档把自动存款的重试边界写成「签名前」，实际边界是「授权尚未交给 bundler」（签名后、保存意向前的费用复核失败也会重试，该授权未发出，下一次用新 nonce 覆盖），文档、CHANGELOG 与代码注释已改。第三轮（评分 9/9/8）确认两项已解决、无新发现。最终全量单测：683 个文件、9172 条，除沙箱内不能绑定端口的一条外全部通过。
- 限制：没有真实钱包、真实签名或真实存款；TP/SL 的修复只覆盖了单测模拟的交易所响应形状；审查代理未读纯展示视图与测试文件；线上 AWS 实配、依赖漏洞库未核对。

## 第二批修复（2026-10-13，分支 `claude/prod-audit-fixes-2`，叠在第一批 `bd5e3fe0` 上）

第一批经 PR #108 推送，CI 七项通过后以合并提交 `f63def71` 进入 `dev`（基线 `dev` 6525fd04）；GitHub 的 Codex 机器人对首个提交给出两条 P2，并入本批处理（见表末两行）。运营方要求「CI 过了就合并到 dev，跟着继续挑第二批」。第二批从未修项里挑出能在不改产品决定的前提下修的：

| 项 | 处置 |
| --- | --- |
| 调度器身份槽位 | `captureExchangeRequestGeneration` 的身份键加入签名方（`signer: "user" | "agent"`），`useExchange` 按是否需要 Agent 传入。外部钱包会话里 owner 签名的请求（授权 Agent/builder fee、提款、划转）不再作废 Agent 已排队的下单，反之亦然；Agent 密钥在存储层被更换、移除或清除时（`agent-storage.ts`）只作废 Agent 队列（`invalidateExchangeRequestIdentity` 新增 `signer` 参数）；注册会话结束、owner 签名者或会话切换仍作废全部签名方。`exchange-request-scheduler.test.ts` 三条新用例，`agent-storage-removal.test.ts` 的移除用例补上 owner 队列存活的断言 |
| 外部钱包存款广播标记 | `use-deposit.ts` 在 `writeContract` 前置 `directSubmissionStarted`；失败且无哈希时由新模块 `deposit-submission-outcome.ts` 判定：钱包拒签或广播前的 provider 错误码（4001/4100/4200/−32003/−32600/−32601/−32602，沿 `cause` 最多 6 层）为确定失败，断连码 4900/4901 与通用服务端码保持未知，其余为未知结果，复用既有「状态未知」常驻通知。`deposit-submission-outcome.test.ts` |
| 资金锁内请求超时 | `fetchCctpDepositTerms` 与锁内余额复读带 15 秒期限（`DEPOSIT_LOCKED_REQUEST_TIMEOUT_MS`）。`deposit-broadcast.test.ts` 用假定时器验证到期失败 |
| 现货兑换 Max 浮点 | Max 与余额不足判断改用 `fromBalanceExact`。`spot-swap-modal.test.tsx` 用 `100000000000.123454` 证明数值路径会丢位 |
| 账本指数记法 | `account-ledger.ts` 五处 `toString` 改 `toFixed`，登记进 `decimal-display-contract`。`account-ledger.test.ts` |
| 错误上报按 IP | 抽出 `lib/server/fixed-window-ip-limiter.ts`（推荐地区接口也改用它），错误上报每 IP 每实例 10/分钟叠加全局 60/分钟；Nitro 路由用 `getRequestIP`，Lambda 用 `x-sairn-client-ip`。`client-error-report-server.test.ts`、`fixed-window-ip-limiter.test.ts` |
| Markdown 协议白名单 | 只放行 `http`/`https`/`mailto` 与相对路径，其余协议（含用空白或控制字符拆开的）渲染为文本。`markdown.test.tsx` |
| 工作流 `permissions` | `static-checks`、`production-build`、`website-build` 加顶层 `contents: read`（其余工作流原有）。`ci-workflows.test.mjs` 14/14 |
| `/trade/<不存在市场>` 标题 | `NotFoundPage` 挂载时设置 `Page Not Found | Sairn`、卸载时恢复；`lib/seo.ts` 抽出 `buildPageTitle`。`not-found-page.test.tsx` |
| OI 未知放行 | **不改**：ADR 0023 已明确决定未知状态放行、交易所保持权威，审查代理把既定决定报成了缺陷 |
| PR #108 机器人 P2：推荐地区接口的 1 KiB 上限只对 `application/json` 生效 | `readJsonBody` 对任何 content-type 都先做有界读取再决定是否解析；`geo-api.test.ts` 补 text/plain 2000 字节 → 413 |
| PR #109 机器人 P2：404 页卸载时无条件写回旧标题，会覆盖新路由刚装好的标题 | 只在 `document.title` 仍是本组件写入的 404 标题时才恢复（与 `useDocumentTitle` 同一规则）；`not-found-page.test.tsx` 新增用例 |
| PR #108 机器人 P2：自动存款在错误分支同步读取授权意向，存储抛错会进错误边界 | 读取包进 `hasNoSponsoredAuthorizationIntent`，抛错按「可能有未决授权」处理、不重试；`embedded-deposit-auto-bridge.test.tsx` 新增用例 |

还原核对（实际运行）：调度器、Markdown、账本、兑换、404、错误上报、推荐地区 body 上限、自动存款意向读取八处分别还原到 `HEAD` 后对应用例变红。Biome、`pnpm typecheck`、`ci-workflows.test.mjs` 14/14、`pnpm memory:check` 通过；全量单测 685 个文件、9187 条通过（沙箱内不能绑定端口的 `vite-development-cache` 一条在沙箱外单跑通过）。

Codex CLI（`gpt-6-astra`、只读、`low`）第一轮 7/6/6 不通过，两项：P1 把断连码 4900/4901 当作确定未广播会诱导重复存款（已改为未知）；P2 `invalidateExchangeRequestIdentity` 仍按 owner 作废全部签名方、Agent 存储换钥会作废 owner 队列（已加 `signer` 参数并按调用点划分）。第二轮 9/9/8 通过：两项确认解决、机器人两条修复成立，内存替换验证五处还原都让测试失败，无新发现。

限制：`use-deposit.ts` 里 `directSubmissionStarted` 的接线没有 hook 级异常路径测试，只有判定模块的单元测试与 `fetchCctpDepositTerms` 的到期测试；没有真实钱包、生产构建或真机验收。

## 后续与替代关系

- 仍未修：分支保护（运营方在 GitHub 设置）、包体基线（桌面运行时余量约 460 字节）、现货余额无价格时用入场成本冒充市值（改余额消费方类型）、图表 iframe 同源 `unsafe-inline`、SW 缓存 opaque 图标；OI 未知放行按 ADR 0023 维持。
- 本记录不替代任何早先记录。
