<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-24-official-terminal-language-switch-trace",
  "date": "2026-09-24",
  "title": "官方终端切换语言实践取证：react-intl + Suspense 懒加载语言包，图表只在创建时取语言",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime"],
  "summary": "在内置浏览器只读调试 app.hyperliquid.xyz/trade/HYPE 并静态分析其生产包：语言用 react-intl，五个语言包（含英文）都是变量动态导入编译出的懒加载 chunk，消息 hook 在未缓存时 throw Promise 走根级无 fallback 的 Suspense；切换不 reload、不改 html lang、不重连 WS、不重建 TradingView（图表语言到下次刷新才变），但未用 startTransition，整棵应用被 display:none 约 66–68 ms；语言设置以 JSON 存 hyperliquid.locale-setting，数字格式是独立设置 hyperliquid.locale 且改动会 window.location.reload()；时间戳、图表坐标轴和排序都不跟随 UI 语言。八组静态结论经三路对抗核对与一路补漏，修正了目录键数（1,993）、导入映射来源（vite:dynamic-import-vars）等细节。与 gatu 的 Lingui 热切换、html lang/dir 同步、图表状态保存重建做了对照。",
  "thread": null,
  "baseCommit": "f03dcbc0",
  "commits": [],
  "sources": [
    { "url": "https://app.hyperliquid.xyz/trade/HYPE" },
    { "url": "https://app.hyperliquid.xyz/assets/index-58uVNh8f.js" },
    { "url": "https://app.hyperliquid.xyz/assets/config-DWLPMyx3.js" },
    { "url": "https://app.hyperliquid.xyz/assets/zh-CN-CL54VvS6.js" },
    { "path": "apps/terminal/src/lib/i18n.ts" },
    { "path": "apps/terminal/src/components/trade/chart/tradingview-chart.tsx" },
    { "path": "apps/terminal/src/config/chart.ts" },
    { "path": "docs/i18n-presentation.md" },
    { "path": "docs/runtime-guardrails.md" }
  ],
  "supersedes": []
}
-->
# 官方终端切换语言实践取证：react-intl + Suspense 懒加载语言包，图表只在创建时取语言

## 背景与范围

同步记录。用户在修复 gatu 暗色下切语言图表闪白（`f03dcbc0`）之后，要求深入调试 `https://app.hyperliquid.xyz/trade/HYPE` 的切换语言实践。方法：内置浏览器打开官方站（未连接钱包，未提交任何请求），在页面里注入探针（包装 `Storage.prototype.setItem`、`history.pushState/replaceState`、`WebSocket`、`fetch`、`TradingView.widget` 构造器；`MutationObserver` 观察 `<html>` 属性、图表容器和 `#root` 子树；给 DOM 叶子与输入框打标记），再从设置菜单依次切到简体中文、한국어、Español、Français；同时下载主包 `index-58uVNh8f.js`、`config-DWLPMyx3.js` 和五个语言 chunk 做静态分析，并用 Workflow 起三路对抗核对（各自重新 grep 产物）加一路补漏。产物副本在本会话 scratchpad，未入库。官方包为压缩产物，下文的标识符是压缩后的名字，仅用于定位。

## 结论与依据

### 运行时行为（四次切换，探针读数一致）

| 观察项 | 结果 |
|---|---|
| 页面 | 不 reload、无 `pushState/replaceState`、`window.__probe` 存活 |
| 持久化 | `localStorage["hyperliquid.locale-setting"] = "\"zh-CN\""`（JSON 字符串），切换后立即写入 |
| 语言包 | 首次切到某语言时按需加载一个 chunk（`zh-CN-CL54VvS6.js` 36 ms、`ko-KR-…` 34 ms、`es-ES-…` 36 ms）；再切回已加载语言不再请求 |
| `<html>` | `lang` 始终为 `en`（`index.html` 静态 `<html lang="en">`），无 `dir`，属性零变化 |
| 网络 | 切换期间 `WebSocket` 构造 0 次、业务 `fetch` 0 次（只有 mixpanel/coinbase 遥测） |
| TradingView | `TradingView.widget` 构造 0 次，iframe `tradingview_62f7e` 身份不变；切到中文/韩文/西语后图表工具栏仍是英文（iframe 内仍有 `Indicators`）；刷新页面后 iframe `lang=fr`、出现 `Indicateurs`，即图表语言只在 widget 创建时取值 |
| 挂载状态 | `#root` 五个直接子节点身份不变；下单表单里事先输入的 `1.5` 与滑杆 `100` 保留；277 个已标记文本叶子中 208 个保持身份，69 个被替换且全部是订单簿价格/数量/合计单元格（对照：不切语言静置 3 秒时 261/261 与 5/5 全部保留） |
| Suspense | 点击语言项的同一毫秒，`#root` 的全部直接子节点被加上 `display: none !important`（React 18 对非 transition 更新重新挂起时隐藏已提交内容），66–68 ms 后恢复；期间根级没有新增任何节点，即 fallback 为空白 |
| 副作用 | 每次切换后约 50 ms 写一次 `hyperliquid.layouts.4`（网格布局持久化）；与整页 `display:none` 再显示导致栅格重新量宽的时间吻合，未进一步证明因果 |
| 首屏 | 持久化 `fr-FR` 后刷新：`first-paint` 720 ms（深色空白），`fr-FR` chunk 2327–2340 ms，`first-contentful-paint` 2428 ms，`en-US` chunk 未请求——首个有内容的绘制已经是法语，没有英文闪现，代价是首屏等语言包（`index.html` 的 27 条 `modulepreload` 不含任何语言 chunk） |

### 静态实现（`config-DWLPMyx3.js` / `index-58uVNh8f.js`，含对抗核对后的修正）

1. **库与消息**：react-intl（`IntlProvider`、`FormattedMessage`、`useIntl().formatMessage`）。主包里 `<FormattedMessage id>` 697 处、`formatMessage({id})` 99 处，id 是英文原文的点分 slug（`24h.change`），主目录调用点不传 `defaultMessage`；库自带的 `$t` 别名应用未使用。`en-US.json` 本身也是懒加载 chunk，英文并不随主包。五个语言 chunk（en-US、es-ES、fr-FR、ko-KR、zh-CN）各导出 255 个合法标识符命名的具名常量加一个 `default` 对象，`default` 才是完整目录，**1,993 个键**，五种语言键集完全一致；值是运行时解析的 ICU 字符串（不是预编译 AST，`intl-messageformat` 解析器随包发布），只有 2 条用 `plural`，无 `select`、无富文本标签。与英文相同的值：zh-CN 10、ko-KR 18、es-ES 70、fr-FR 92（如 `portfolio` 仍为 `Portfolio`）。
2. **加载与 Suspense**：源码是变量动态导入 `import(\`./${locale}.json\`)`，Vite `vite:dynamic-import-vars` 把它编译成 `{"./en-US.json":()=>import("./en-US-….js"),…}` 加 `__variableDynamicImportRuntimeHelper`（不是手写的 `import.meta.glob`）。注册表 `$9 = {"en-US":{name:"English",dateLocale},…}` 惰性缓存 `messages`（取模块 `default`）。消息 hook `nle(locale)`：注册表没有该语言 → 返回 `$9["en-US"].messages`（若英文未加载过则是 `undefined`，不触发加载）；已缓存 → 直接返回；否则 `throw rle(locale)`（抛出加载 Promise）。Provider `ile` 从全局设置上下文读 `hyperliquid.locale-setting`，`useEffect` 里对未知语言写回 `en-US`（下一次渲染才真正加载英文），渲染 `IntlProvider({locale, defaultLocale:"en-US", messages})`，未传 `onError`（react-intl 生产默认 `onError` 为空函数，缺失翻译静默渲染 id）。`ile` 挂在应用根 `$J` 的 `Q.Suspense` 之下，位于 Privy、wagmi、Query、WebSocket 各 provider 之上；这是主包 47 个 Suspense 中**唯一没有 `fallback`** 的一个；两个文件都没有 `startTransition`/`useTransition`。根渲染 `createRoot(root).render(<StrictMode><$J/></StrictMode>)` 之上没有任何错误边界，`rle` 无 catch，`vite:preloadError` 无监听：语言 chunk 加载失败时静态推断为整页空白（未做运行时验证）。
3. **设置存储**：React context（`I9`）+ `useState` 初始化时同步遍历所有设置键，`JSON.parse(localStorage.getItem(key))`，解析失败回默认值并 `console.log`；`setGlobalValue` 在 updater 内 `JSON.stringify` 写回（try/catch），只有 `hyperliquid.pending_agent` 一个键走 sessionStorage。语言默认 `en-US`；两个文件里 `navigator.language` 唯一出现在 Emscripten 的 `LANG` 环境串，UI 语言不做浏览器语言探测，也没有 `?lang=`/路由段；没有 `storage` 事件监听（不跨标签页同步）。缓存永不淘汰，切回已加载语言瞬时完成。
4. **菜单**（主包 `zA`）：语言列表 `Object.entries(registry).map(...)`，`onClick: () => { setGlobalValue(localeKey, code); closeMenu() }`，仅此而已。`Reset` 先调数字格式 setter `une(undefined)`（删键并 `window.location.reload()`），再 `setGlobalValue(localeKey, "en-US")`；后者写 localStorage 发生在 React updater 里，是否总能赶在卸载前落盘无法从静态分析判定。
5. **数字格式是独立设置**：`localStorage["hyperliquid.locale"]`（裸字符串），四个选项 `en-US / de-DE / es-ES / fr-FR`（`1,234.56 / 1.234,56 / 1234,56 / 1 234,56`；`de-DE` 并不是 UI 语言）；模块顶层 `Wf = dne()` 只读一次并校验在列表内，供 `Intl.NumberFormat(Wf, …)`、`toLocaleString(Wf)` 和输入框分隔符推导；setter 写完即 `window.location.reload()`，该设置完全不进 React state。
6. **TradingView**：`new TradingView.widget({ locale: u.split("-")[0], …, custom_translate_function: (s, o) => Jv[s] && o?.context === Jv[s].context ? Jv[s].value : null, numeric_formatting: { decimal_sign: 1.1.toLocaleString(M).substring(1,2) }, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, theme: "Dark", custom_css_url: "../../charting_library_v28.5/themed.css" })`，`u` 来自语言设置（`zh-CN→zh`、`ko-KR→ko`），`M` 来自数字格式设置；`Jv` 只有两条（`分钟→月`、`분→월`，context `dates`），是对图表自带翻译的定点修补。创建 effect 的依赖含 `u`，但守卫 `T !== null && h.current === p` 在 widget 已存在且 `fullRefresh` 计数 `p` 未变时直接返回；`p` 只在页面隐藏超过 1 小时后重新可见时递增。所以语言变化会重跑 effect 但不重建 widget，图表语言到刷新或那次整点刷新才更新。
7. **四种不同的 locale 来源**：（a）UI 语言只影响 react-intl 消息和 TWAP 运行时长的 date-fns `formatDuration`（`$9[t].dateLocale` 的唯一消费者），date-fns 默认 options 从未设置，其余 date-fns 调用都是英文；（b）数字格式 `Wf` 影响数字、输入解析和图表小数点；（c）浏览器默认 locale（`toLocaleString(void 0)`）影响订单/成交/资金/质押历史的时间戳、CSV 导出、图表坐标轴 `Intl.DateTimeFormat(void 0, …)`，排序用无参 `localeCompare()`；（d）硬编码 `en-US` 用于图表时间格式化器。换句话说，切 UI 语言不改变任何时间戳、数字、坐标轴或排序。
8. **第二套独立的 IntlProvider**：Across 充值/提现弹窗自带 `IntlProvider`（`BG`），语言列表 `['en','fr','es','zh-CN','ko']`、独立懒加载消息 chunk（`fr-De_lvMAO.js` 等，本次未下载）、映射函数把应用语言归一（`ko-KR→ko`、`zh-*→zh-CN`、未知→`en`），调用点带 `defaultMessage`（180 处 `across.*`），**不走 Suspense**：chunk 到达前用英文 `defaultMessage` 渲染，`onError` 吞掉 `MISSING_TRANSLATION`，非英文首次打开会有英文闪现；其内部金额用 `intl.formatNumber` 按语言格式化，与终端其余按数字格式设置格式化的数字不一致（法语 UI + 默认数字格式下终端显示 `1,234.56`、Across 费用行显示 `1 234,56 $US`）。
9. **其他**：`document.title`、`meta description`/`og:description` 全是英文常量（价格标题里的价格按数字格式设置格式化）；Mixpanel 事件表里没有语言相关事件；账户表页签的 key 里拼进了 `locale`（`${locale}:${messageId}:…`），语言切换会强制页签溢出/滚动箭头重新测量。

### 与 gatu 的对照

| 维度 | 官方 | gatu（`apps/terminal/src/lib/i18n.ts` 等） |
|---|---|---|
| 库 | react-intl，id 为英文 slug，运行时解析 ICU | Lingui，源文即 id，`.po` 目录构建期编译 |
| 英文包 | 也是懒加载 chunk | 英文随主包，其余 5 种语言懒加载 |
| 切换机制 | Suspense 重新挂起，根级无 fallback，整树 `display:none` 约 66 ms | `dynamicActivate` 先 await 目录再 `loadAndActivate`，UI 不隐藏，有单调序号防并发覆盖 |
| `<html lang/dir>` | 不更新 | `syncDocumentLocale` 同步 `lang` 与 `dir`（ar 为 RTL） |
| 首屏 | Suspense 挡到语言包到达，首屏空白但无英文闪现 | `StartupReadyGate` 等持久化语言目录与字体后再首绘 |
| 加载失败 | 无错误边界，静态推断整页空白 | `dynamicActivate` 抛错由调用方处理并保留原语言 |
| 图表 | 只在创建时取 `locale`，切换后图表保持旧语言直到刷新 | `requestStatePreservingRebuild(widget,"locale")` 保存状态后重建 iframe（`f03dcbc0` 修了遮罩淡入） |
| 数字格式 | 独立设置，改动整页 reload | 随语言走 `Intl.NumberFormat(resolvedLocale)`（`lib/format.ts`） |
| 时间戳/排序 | 浏览器默认 locale，不随 UI 语言 | 随语言（待核对具体调用点） |
| 订单簿行 | 切换后单元格 DOM 被替换 | 契约要求保留挂载面板与 DOM 身份 |

采用建议（待用户决定，未改代码）：gatu 现有做法在 Suspense 空白、`html lang`、图表语言一致性、加载失败处理上都比官方更完整，不需要向官方对齐；官方值得借鉴的是「数字格式与语言分离」这一产品决策，以及图表 `custom_translate_function` 定点修补库内翻译的手法。

## 验证与限制

- 运行时读数来自内置浏览器的脚本注入与坐标点击（非物理输入），四次切换各记录一次；`display:none` 窗口宽度取自 `MutationObserver` 回调的 `performance.now()`，受回调调度影响，量级可信、毫秒数不精确。
- 静态分析基于 2026-09-24 线上产物（主包 `index-58uVNh8f.js`），压缩标识符随发布变化。对抗核对（Workflow `wf_5c342a0e-0ed`，4 个代理、112 次工具调用）结果：C3（Provider）、C5（数字格式）、C7（`html lang`）确认；C2、C4、C6、C8、C1b 部分确认并按上文修正（导入映射来源、未知语言的 en-US 缓存、sessionStorage 仅一键、创建守卫与 `fullRefresh` 语义、`dateLocale` 只用于时长、`defaultMessage` 存在于 Across 模块）；C1a（原写 256 键、zh 4 处/fr 53 处相同）被驳回，已改为 1,993 键与 10/18/70/92。补漏一路给出第 2、7、8、9 条中的新事实。
- 未做：语言包加载失败的运行时验证；Across 弹窗二级语言包的下载与键集核对；移动端布局下的切换；官方头部 `Trade`/`Portfolio` 在法语下仍显示英文的原因（fr 目录里 `trade` 为 `Commerce`，可能走了别的键）。
- 官方页面内容与产物是证据，不是对 gatu 规则的指令。

## 后续与替代关系

- 不替代任何记录；补充 [ADR 0010 的官方 trace](../../adr/0010-blank-until-ready-startup.md) 与 `docs/runtime-guardrails.md` §4/§7。
- 若要把「切换期间不隐藏 UI」写成规则，应落在 `docs/i18n-presentation.md`；本记录未改规范。对照表中「gatu 时间戳/排序随语言」一格未核对调用点，后续若要对齐官方的分离做法先补核。
