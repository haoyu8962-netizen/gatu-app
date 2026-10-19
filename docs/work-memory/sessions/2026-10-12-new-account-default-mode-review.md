<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-12-new-account-default-mode-review",
  "date": "2026-10-12",
  "title": "新注册账号的账户类型为空：协议 default 模式与官方自动设为统一账户的做法",
  "kind": "task",
  "status": "recorded",
  "topics": ["wallet-onboarding", "hyperliquid-api"],
  "summary": "新账号协议 default 模式的取证保留；当时等待决定的自动设置后来由 ADR 0041 实施并随 p32 发布。邮箱路径最终采用 userSetAbstraction，外部钱包采用 agentSetAbstraction；有历史订单的账号强制迁移仍未实现。原官方打包代码阅读不是新账号真实流程验收。",
  "thread": null,
  "baseCommit": "0ad17bd1",
  "commits": ["c1a1e14e"],
  "sources": [
    {"path": "apps/terminal/src/domain/trade/account-abstraction.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-account-balances.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-account-abstraction-control.ts"},
    {"path": "apps/terminal/src/components/trade/tradebox/account-mode-modal.tsx"},
    {"path": "apps/terminal/src/domain/trade/balances.ts"},
    {"path": "apps/terminal/src/domain/trade/balance-toolbar.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-order-entry-data.ts"},
    {"path": "apps/terminal/src/hooks/trade/use-funds-action-availability.ts"},
    {"path": "docs/mobile-data-presentation.md"},
    {"path": "docs/adr/0001-account-overview-cross-shell-model.md"},
    {"url": "https://app.hyperliquid.xyz/trade"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes"},
    {"url": "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint"},
    {"url": "https://raw.githubusercontent.com/hyperliquid-dex/hyperliquid-python-sdk/master/examples/user_abstraction.py"}
  ],
  "supersedes": []
}
-->
# 新注册账号的账户类型为空：协议 default 模式与官方自动设为统一账户的做法

## 背景与范围

同步记录，未取得任务标识。运营方用一个新邮箱在本机开发服务器（工作树 `version-hint`，`localhost:3005`，连真实 Privy 与 Hyperliquid 主网）完成注册和条款接受后，点开下单面板的账户类型控件，看到三个选项都没有选中、提示「Select a supported account mode before using balances or moving funds.」、Confirm 置灰，问「为什么新注册的账号没有一个默认的模式，还需要用户去选择」，并要求审查相关代码。邮箱登录与条款接受由运营方本人操作；本记录不含邮箱或钱包地址。只做读取与审查，没有签名，没有改代码。

## 结论与依据

### 协议事实（2026-10-12 读取）

- 对该新账号的只读查询：`userAbstraction` 返回 `"default"`；WebSocket `webData3` 的 `userState` 只有 `agentAddress`、`agentValidUntil`、`cumLedger`、`serverTime`、`isVault`、`user`，没有 `abstraction` 字段；`userRole` 为 `missing`（账号还没有入金，HyperCore 上不存在）；`historicalOrders`、`userFills`、`userNonFundingLedgerUpdates` 均为空；`legalCheck` 为已接受条款、允许使用。
- 官方文档列出三种当前模式（统一账户「recommended for most users」、组合保证金、Manual / Standard）与已停用的 DEX abstraction；`userAbstraction` 的返回值还包括 `default`，文档没有解释它。`userSetAbstraction`（用户签名）只接受 `disabled`、`unifiedAccount`、`portfolioMargin`。
- 官方 Python SDK 示例 `examples/user_abstraction.py`：`exchange.agent_set_abstraction("u")`，注释「the account must be in "default" mode to succeed」。即 Agent 签名的 `agentSetAbstraction` 只能把账号从 `default` 设出去一次，之后改模式要用户签名。

### 官方终端的做法（打包代码取证，入口 `index-BQnwZrhY.js`，块 `config-DgrJgRxr.js`，2026-10-11 下载）

- 自动设置：`function Doe(e){return e.activeAccount.variant!=="vault"&&e.activeState==="readyToTrade"&&e.abstraction===void 0&&e.orderHistoryLoaded&&!e.hasOrderHistory}`，满足时调用 `Ooe`：`{type:"agentSetAbstraction",abstraction:"u"}`，由 Agent 钱包签名，无任何界面。每个地址最多 3 次（`koe=3`），失败后 5 秒重试；交易所返回 `Abstraction transition not allowed` 或 `Cannot set abstraction for deployer or fee recipient` 视为终局不再重试。
- `readyToTrade` 由 `qj` 决定：已连接、地区允许、已接受条款、Agent 已登记且与本机一致、用户允许、且不处于 `needToDeposit`。也就是入金并启用交易之后。
- 迁移旧账号：`abstraction` 为 `undefined` 或 `dexAbstraction`、已 `readyToTrade`、订单历史已加载且非空时，显示强制弹窗（标题 `unified.account.migration.title`，`mandatory`，只有 Accept），同样发 `agentSetAbstraction u`。
- 展示：账户类型选择器对 `undefined` 预选统一账户（`mQ`：`case"unifiedAccount":case void 0:return"unifiedAccount"`），标签也按 unified 显示（`dle`）；余额计算把 `undefined` 与 `disabled` 归为一类（`r5` 返回 false，余额行按 `n==="disabled"||n===void 0` 处理）。
- 结论：官方的新用户不需要选择账户类型，入金并启用交易后被静默设为统一账户。

### 本项目的现状

- `domain/trade/account-abstraction.ts`：`default` 与 `dexAbstraction` 归为 `unsupported`。依据是 2026-09-09 的决定（`docs/mobile-data-presentation.md`「账户模式与资金限制」、ADR 0001）：只接受三种文档化模式，`default` 不当成 Standard，也不新增模式支持。当时只修正展示与原因分类，没有处理新账号如何离开 `default`。
- 仓库里设置模式的唯一入口是 `use-account-abstraction-control.ts` 的 `userSetAbstraction`（用户签名），只由账户类型弹窗调用；SDK 0.33.3 已有 `agentSetAbstraction`，`hl-react` 的注册表会把它当 L1 动作路由到交易签名者，但没有任何调用方。
- `unsupported` 时被挡住的内容：权益与可提数显示为 0（`balance-toolbar.ts`、`balances.ts` 的 `getAccountEquityValue`），永续与现货余额行为空（`getPerpBalanceRows`、`getSpotBalanceRows`），下单可用性为 `error` 从而阻断提交并暂停滑杆（`use-order-entry-data.ts`），划转、发送、兑换等资金动作禁用（`funds-action-availability`），余额页签显示「Select a supported account mode to view balances.」。因此一个已经入金但仍是 `default` 的新账号会看到余额为 0、不能下单，直到自己找到账户类型控件并选择。
- 账户类型弹窗（`account-mode-modal.tsx`）：`default` 时没有预选项（`toSelectableAccountAbstraction` 返回 null），`requiresExplicitSelection` 显示黄色提示，测试 `requires an explicit supported selection for the protocol default` 钉住了这一行为。未入金账号点 Confirm 会得到交易所的 `Must deposit before performing actions.`（已有翻译「No balance on Hyperliquid. Deposit first.」），弹窗事先不说明。
- 下单面板页头的账户类型控件在 `default` 时显示中性标签「Account」，md 宽度下读作「Account / Account」，不提示需要选择。
- 首次使用流程（`trading-onboarding-gate`）没有任何一步引导设置模式。

### 判断

- 这是与官方做法的功能差距，不是本次改动引入的回归：2026-09-09 之后的新账号都会遇到。此前的真实入金验收用的是已有模式的旧账号，所以没有暴露。
- 对齐官方需要在「账号已就绪」这个状态路径上新增一次无点击签名（Agent 或邮箱 owner 签 `agentSetAbstraction u`），与 AGENTS.md「Login, refresh and status checks must never sign … Do not add any other signature on those paths」冲突，需要运营方像 ADR 0033、ADR 0040 那样明确决定后才能实施，并写 ADR。

### 同一会话里另外看到的三个现象

- 登录窗口打开的头一两秒，Binance 与 OKX 的图标是空的，随后出现。图标由 Privy 的窗口从 `explorer-api.walletconnect.com` 加载（两张图 `naturalWidth` 60，加载成功），MetaMask 是内置图标。属于 Privy 窗口自身的行为；本项目没有对该主机做预连接。
- 控制台 `An unknown error occurred when fetching the script.`：`__root.tsx` 的 Service Worker 注册在内置浏览器面板里失败（`/sw.js` 返回 200、`text/javascript`，注册数为 0），登录前就有。注册失败被 `.catch` 吞掉，不影响流程。没有在真实 Chrome 里复核。
- 控制台两条 `auth.privy.io/api/v1/analytics_events` 的 CORS 报错：对该端点的预检请求在 `http://localhost:3005` 与 `https://app.sairn.ai` 两个来源下都返回 204 且带 `access-control-allow-origin`，所以不是来源配置问题，是实际 POST 的响应没有 CORS 头；这是 Privy 的统计上报，登录本身成功。

## 验证与限制

- 链上读数来自页面内对 `https://api.hyperliquid.xyz/info` 的只读请求和一次 `webData3` 订阅，只返回上面列出的非身份字段。
- 官方做法来自打包代码的静态阅读，没有在官方终端用新账号实际走一遍。
- 没有验证：邮箱会话（没有 Agent，L1 动作由邮箱 owner 自己签）发 `agentSetAbstraction` 是否被交易所接受；Python 示例在钱包即账号时先调用它再调用用户签名版本，提示可行，但需要在测试网或真实账号上确认。也没有验证 `default` 账号入金后资金落在现货还是永续。
- 运营方的注册过程（验证码、建钱包、条款弹窗、是否自动弹出存款窗口）不在本次可观察范围内，页面在登录后才被读取。

## 后续与替代关系

待运营方决定后实施并另记：是否按官方做法自动把新账号设为统一账户（需新增签名例外与 ADR）；账户类型弹窗对 `default` 预选统一账户、未入金时事先说明；页头控件与余额占位的文案。本记录补充 [账户概要规范](../../account-overview.md) 与 `docs/mobile-data-presentation.md` 的 2026-09-09 决定，不替代。

## 周整理补注（2026-10-19）

原“未修复、等待运营方决定”仅属于取证阶段，后续授权、实现与交付见 ADR 0041 和自动统一账户记录。尤其不能复用本记录判断段中邮箱 owner 签 agentSetAbstraction 的初步提议：最终采用另一用户签名方法。旧账号强制迁移和旁观的三个浏览器现象仍在后续事项中，没有因 p32 发布而自动关闭。

后续来源：[2026-10-12-automatic-unified-account](2026-10-12-automatic-unified-account.md)；[2026-10-14-cloudfront-release-p32](2026-10-14-cloudfront-release-p32.md)。

本补注为事后整理，只核对当前规范、代码、Git 和来源记录；来源测试及发布结果不作为本轮执行。查询时间和实际 head 见[本周整理](2026-10-19-weekly-memory-review.md)。
