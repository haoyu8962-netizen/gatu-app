# 对抗审查报告:钱包连接 + PWA 四提交

- 审查对象(时间序):
  - `5494ca5c` fix(wallet): unify connect entry flow
  - `244cc6c7` feat(wallet): align mobile connection chooser
  - `120116fb` feat(wallet): configure secure wallet catalog
  - `913dfacf` feat(pwa): add mobile install guidance
- 方式:8 维度并行对抗审查(逐条证伪 15 条作者声称)→ 反驳式核实 → 盲区批判 → 关键项人工实证(Privy 官方文档 + SDK .d.ts + PWA 规范)
- 规模:40 个 agent、约 380 万 token
- 基线:测试 1123 全通过,typecheck 通过
- 结论:**四个提交质量高、声称基本诚实(9 成立 / 6 部分成立 / 0 造假)。没有 blocker/high,唯一实质问题是一处 Privy 废弃 API 用法可导致外部钱包重连死循环(medium)。**

---

## 一、声称核对总表(你要的"逐条证伪")

| 提交 | 声称 | 裁定 | 说明 |
|---|---|---|---|
| 5494ca5c | (a) 统一所有 Connect 入口 | **部分** | UserMenu 未认证分支已改走 WalletModal,但 "Reconnect wallet"(top-nav + mobile-header)与 `deposit-modal.tsx:193` 三处仍直连 `reconnectWallet()`,未统一 |
| 5494ca5c | (b) 安全重连 | **部分** | "修复"成立(改前认证态关模态后是死路);"安全"打折——见 §二 |
| 5494ca5c | (c) 邮箱嵌入钱包精确匹配、失败关闭 | ✅ | `selectPrivyWagmiWallet` 严格地址相等 + 多嵌入钱包不唯一时返回 undefined + 提前 return 阻断回落。4 条测试覆盖 |
| 244cc6c7 | (a) 移动端官方风格底部弹窗 | ✅ | `presentation="drawer"` + 全宽列表行 + OR 分隔线;`modal.tsx` 只加 `showHandle` 默认 true,回归面为零 |
| 244cc6c7 | (b) 顺序 Link Desktop→Email→WalletConnect | **部分** | 顺序属实,开关 `VITE_MOBILE_PAIRING_IMPORT_ENABLED` 默认关(fail-closed);但仅在未认证时;认证态整体替换为单个 "Reconnect wallet",声称未提 |
| 244cc6c7 | (c) 桌面保持原有 Privy 流程 | **部分** | `PrivyWalletLauncher` 函数体逐字未变;但"桌面"判定含 `display-mode:standalone`——见 §三 |
| 120116fb | (a) 热门钱包顺序 | ✅ | 数组顺序完全匹配;Privy 文档"exact order you specify" |
| 120116fb | (b) 其他钱包进 WalletConnect 目录 | ✅ | 用 `wallet_connect`(非 `_qr`),官方定义即"searchable list of 100+ wallets",移动端走深链不退化为二维码;CSP 已放行 |
| 120116fb | (c) 没把 Gnosis Safe 错当 SafePal | ✅ | `WalletListEntry` 里 `safe` 就是 Gnosis Safe,SafePal 非合法值,列表无 `safe` |
| 120116fb | (d) 没并行引入 Reown 双栈 | ✅ | 全仓无 reown/appkit/web3modal 依赖;仅 CSP 被动放行 web3modal.com(Privy 内部 WalletConnect 用) |
| 913dfacf | (a) Chromium 仅收到事件后展示入口 | ✅ | `hasBrowserPrompt` 唯一来源是 `beforeinstallprompt` handler;`preventDefault` + 一次性 `prompt()` + `appinstalled` 清理都正确 |
| 913dfacf | (b) iOS 分享→添加说明 | ✅ | UA 正则 + iPadOS 桌面模式(`MacIntel` + `maxTouchPoints>1`)判定,正确处理 iPad 伪装 |
| 913dfacf | (c) 已安装/不支持时隐藏 | **部分** | `display-mode:standalone` + `navigator.standalone` 双检成立;但缺 iOS 专用 meta(见 §三) |
| 913dfacf | (d) 桌面不拦截原生提示 | ✅ | `preventDefault()` 被 `MOBILE_QR_SURFACE_MEDIA_QUERY` 门控,宽屏桌面 handler 提前 return |
| 913dfacf | (e) 颜色统一 #0F1A1F | ✅ | manifest + seo.ts 三处一致,且修正了与实际背景 `#0f1a1f` 不符的旧值 `#0a0e13` |

**0 条造假。** 主要瑕疵集中在"统一"与"安全"两个词的边界收得不够干净。

---

## 二、唯一 MEDIUM:外部钱包重连用废弃 API,可致静默死循环

**`use-wallet-session.ts:142`(规范性问题,你要求核对的重点)**

```ts
connectWallet({ walletChainType: "ethereum-only", suggestedAddress: user?.wallet?.address });
```

两处违反 Privy v3 官方规范,叠加成一个真实缺陷:

**1. `suggestedAddress` 是 v3 已移除的死参数。** 官方 3.0 迁移指南 "Removed/Deprecated Items" 明确写 **"Removed `suggestedAddress` from `connectWallet`"**,SDK 类型标 `@deprecated`,注释原文:*"This is only a suggestion for the user and the method will not error if they connect a different address"*。我对 `@privy-io/react-auth@3.30.0` **整包 360 个编译产物穷举 grep,`suggestedAddress` 零次出现**——它只存在于 `.d.ts` 类型声明,是运行时死参数,既不校验也不渲染任何提示。官方建议改用 `description`。

**2. `connectWallet` 是 fire-and-forget,错误处理接不住。** SDK 类型是 `(options?) => void`——返回 void 不是 Promise。所以 `120116fb` 新加的 `try/catch` 对连接失败(用户拒签、连错地址、超时)完全是死代码,`notifyWalletConnectionFailure()` 对外部钱包路径不可达。官方指定用 `useConnectWallet({ onSuccess, onError })`,代码是无参调用。

**叠加后果**:已认证但钱包未激活的用户(MetaMask 切到了别的子账户 / 多账户钱包)点 Reconnect → Privy 弹窗无任何地址提示 → 用户连了另一个地址 → `selectPrivyWagmiWallet` 严格地址过滤返回 undefined → wagmi 无 active wallet → UI 继续显示 "Reconnect wallet" 且**无任何错误提示,形成无出口的重连死循环**。

> 核实把它从 high 降到 medium:触发需要"多账户钱包 + 连错地址"这个较窄前提,且邮箱路径不受影响(邮箱会话在 `connectWallet` 之前就 return)。但技术事实完全成立,是这批提交里唯一值得上线前处理的。

---

## 三、盲区:跨提交净效果(逐个提交审查看不到)

这批是连续演进的四个提交,几个问题只在合并后才显现:

### 3.1 桌面用户装了 PWA 后,连接体验退化为移动抽屉(medium,窄路径)

`MOBILE_QR_SURFACE_MEDIA_QUERY = "(max-width:1000px), (pointer:coarse), (display-mode:standalone)"`(逗号是 OR)。**任何已安装的 PWA 窗口 `display-mode:standalone` 恒真**,于是桌面 PWA 用户被永久归类为"移动 QR 面",拿到 `244cc6c7` 的自建底部抽屉(含 "Link Desktop Wallet" 摄像头扫码入口)而非 Privy 官方模态——直接反证 `244cc6c7(c)`。

三个提交共同制造这一人群:`5494ca5c` 把 Connect 改走 WalletModal,`244cc6c7` 把移动分支换成自建选择器,`913dfacf` 主动鼓励桌面安装 PWA。

**我校准了严重级别(部分否定批判者)**:应用内的 "Install app" 按钮**不对宽屏桌面显示**——`beforeinstallprompt` 的 handler 里 `if (!matchMedia(MOBILE_QR_SURFACE_MEDIA_QUERY).matches) return`,宽屏桌面根本不捕获事件,`wallet-modal.tsx:30` 的 PWA 区块也只在 `isMobileQrSurface` 时渲染。所以这条路径只在"桌面用户**通过浏览器地址栏原生图标**(声称 d 特意保留的)安装"时成立,是真实但很窄的路径,故 medium 而非更高。

### 3.2 PWA 推广加重已知的 geo fail-open(medium)

geo 判定客户端 + 服务端都 fail-open(此前审查已确认,且 `244cc6c7`/`913dfacf` 未修),`isResolving` 仍无人消费。`913dfacf` 的全部目的是把用户从浏览器标签推向主屏图标,而**主屏冷启动恰是网络最不稳定的场景**(点击即渲染,`sw.js` 又不缓存导航请求,没有离线壳兜底)。原本偶发的 fail-open 被系统性放大成"每次冷启动一次抽签"。受限法域用户只需弱网下从主屏启动即可拿到完全可用的下单面板。

这条本身不是这批提交的新缺陷,但这批提交**加重**了它,值得和 geo 修复一起考虑。

### 3.3 iOS 引导缺 Apple 专用元数据(low)

`913dfacf` 唯一能**主动**引导安装的平台是 iOS(Chromium 侧只是被动等事件),但仓库无任何 Apple PWA meta:缺 `apple-mobile-web-app-status-bar-style`(manifest 的 `theme_color` 在 iOS 主屏应用不控制状态栏)、缺 `apple-touch-startup-image`(无启动屏兜底)。所以 (e) 的"颜色统一"在其目标人群 iOS 上收益最小。

---

## 四、值得注意的 LOW

- **`5494ca5c(a)` 未真正"统一"**:"Reconnect wallet"(top-nav + mobile-header)与 `deposit-modal.tsx` 三处 `WalletNotConnected` 仍直连 `reconnectWallet()`,绕过 WalletModal
- **`isReconnecting` 语义弱**:fire-and-forget 路径上 `finally` 同步复位,重入保护对 `connectWallet`/`login` 分支无效(但对 `await setActiveWallet` 主路径有效——核实推翻了"完全是死代码"的说法)
- **邮箱 fail-closed 依赖 Privy 未公开的 localStorage 键** `privy:<appId>:recent-login-method`——官方文档全无此键,仅存在于 SDK 打包产物;该键不可用时退化为更弱的 `!user?.wallet?.address && !!email` 启发式(旧问题,这批未引入)
- **`244cc6c7` 夹带了 user-menu 头部加载门控的未声明改动**:`walletSessionLoading` 条件变了(未认证时不再等 `walletsReady`),方向合理但藏在一个声称范围完全不同的提交里,且同批把回归测试改名重写背书新行为
- **测试判别力缺口**:`wallet-modal.test.tsx` 整体 mock 掉 `use-mobile`,`MOBILE_QR_SURFACE_MEDIA_QUERY` 的真实字符串(含 `display-mode:standalone`)零覆盖——3.1 的回归对 CI 完全不可见;"桌面不拦截"的唯一测试也 mock 掉了真实 media query
- **PWA 无离线壳**:`sw.js` 的 fetch 只处理三类子资源,导航请求零缓存,主屏断网冷启动 = 浏览器错误页(比留在标签页更糟,无地址栏无刷新)

---

## 五、对抗核实推翻的 6 条(体现审查纪律)

- "`isReconnecting` 完全是死代码" → 推翻:`await setActiveWallet` 是真实异步主路径,`isReconnecting` 在此确实为 true
- "桌面窄窗口/触屏笔记本被路由进移动弹窗" → 推翻因果:分流谓词非这四个提交引入(`9763a260` 已有);净效果问题在 3.1 用更准的路径重述
- "`shouldUsePrivyEmbeddedWallet` 内部键缺失致邮箱会话被判成外部钱包" → 推翻:`privy-wagmi.ts` 不在这四个提交改动集内,且逻辑上不可达
- **"es/fr/hi/ar 有未翻译文案" → 推翻,且方向相反**:我脚本核对,空翻译从上批 129/各 **降到 126/各**,这批**净译好了** "Link Desktop Wallet" 等,0 新增未翻译
- "`promptInstall` 返回值被丢弃、失败降级无测试" → 推翻:`pwa-install.test.tsx:133` 恰有专门用例锁定失败降级,且降级本身是规范正确行为
- "`verifiedExternalWalletOwner` 的 Testnet/Mainnet 边界零覆盖" → 推翻:该变量仅 8 处命中且描述的影响代码上不可能发生

---

## 六、方法与置信度

**我亲自实证**:读 SDK `types-sr2FRXdy.d.ts` 确认 `suggestedAddress` 的 `@deprecated` 与 `WalletListEntry` 全量取值;查 Privy 官方 3.0 迁移指南与 walletList 文档;读 `useConnectWallet` 返回类型确认 fire-and-forget;读 `pwa-install.tsx` 全部逻辑确认 `preventDefault` 的移动 media 门控、iPadOS 判定、SSR 快照;核对 manifest/seo.ts/styles.css 三处颜色;脚本核对 6 个 catalog 空翻译数;确认 `MOBILE_QR_SURFACE_MEDIA_QUERY` 含 `display-mode:standalone` 且应用内 PWA 入口不对宽屏桌面显示;跑 `pnpm test`(1123 通过)。

**未做**:真机 PWA 安装/深链回跳/iOS 状态栏实测(3.1/3.2/3.3 基于源码 + 规范推导);未在真实 Privy 弹窗验证连错地址的运行时行为(medium 的死循环基于类型契约 + 严格过滤器推导,链条确定)。
