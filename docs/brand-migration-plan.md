# Sairn 品牌迁移计划（gatu → Sairn）

- **状态**：拟议，尚未实施。本文是规划，不是实现记录。这一版已经按两路审查意见修订，逐条处理见附录 C。
- **实施状态（2026-10-01 追加）**：已在 `claude/from-dev-1001` 上实施，过程与验证见 [执行记录](work-memory/sessions/2026-10-01-sairn-brand-migration-execution.md)，现行规则见 [品牌标识与素材](brand-assets.md)。用户的决定改变了下列推荐默认值：存储键、Web Lock 名、Agent 槽位名、请求头、环境变量和包作用域都改为 `sairn`（D8、D9，理由是目前没有用户）；域名为 `sairn.ai`，旧域名在过渡期继续识别（D2）；法律实体改为 Sairn Corp.（D16）；历史记录替换产品名、保留事实性内容（D10）；界面强调色按 b1（D4）。缺失素材由 Claude 依据基础稿补做：OG 卡按模板重画，`icon.svg` 与 `icon-maskable-192.png` 由脚本派生，盈亏分享卡在画布上绘制横版组合。状态动效（阶段 3）没有实施，仍以 Phosphor 图标与中性转圈表示状态。下文保留原计划，不按实施结果改写。
- **日期**：2026-10-01
- **起点**：分支 `claude/from-dev-1001`，HEAD `895c7cf9`。工作区里的 `brand/README.md` 有用户尚未提交的改动，内容是设计方的套件说明。设计交付物还没有纳入版本控制。
- **依据**：
  - 六份只读调查，分别覆盖素材、动效、分享卡、改名清单、品牌色和域名。
  - 两路审查（契约、完整性），共 32 条意见。
  - 规划者的只读抽查。写初稿时查了 `docs/adr/README.md`、`package.json`、`apps/terminal/public/sw.js`、`brand/` 目录结构，以及 `git log --all` 里的 ADR 编号。修订时逐条核对了审查意见引用的文件。
- **证据标注**：
  - 【事实】：已对照代码、文件或工具输出核实。
  - 【推断】：根据规范或常识推出，没有实测。
  - 【未验证】：明确还没做的检查。
- **修订时额外做的只读检查**（2026-10-01）：
  - 在仓库根目录执行 `node -e "import('zod')"` 和 `import('sharp')`，两者都报 `ERR_MODULE_NOT_FOUND`。`@playwright/test` 能正常解析。
  - 用 python 比对 `brand/svg/**` 五种颜色版本的路径数据和填充色。
  - 用仓库根目录的 `tsc` 5.7.2 在 scratchpad 里编译一个最小样例，确认 `moduleResolution: bundler` 下可以导入 JSON。
  - 向 `gatu.ai`、`app.gatu.ai` 的若干文件发 HEAD 请求读响应头，向 `https://gatu.ai/` 发一次 GET 读页面标题。
  - 读了调查期 scratchpad 里的实验脚本，确认 kill-switch 实验和减少动态效果实验的范围。
- **没有做过的事**：没跑任何仓库 vitest 或 Playwright 套件，没跑 `pnpm build` 测包体，没在 Safari、Firefox 或真机上测试，没登录 Privy、LI.FI、AWS、Cloudflare 后台。
- **调查用过的工具**：sharp 像素分析；Playwright Chromium 无头渲染；Python 对比度复算（移植了订单簿测试的逻辑，并没有运行那个测试本身）；`git grep` 计数。
- **临时产物**：都在 `/private/tmp/…/scratchpad/` 下，会话结束就会消失，所以关键数字已经抄进本文。

---

## 1. 现状摘要

### 1.1 已交付【事实】

| 交付物 | 内容 | 核验结论 |
|---|---|---|
| `brand/svg/{mark,mark-small,lockup,wordmark}/sairn-*-{on-light,on-dark,black,white,mono}.svg` | 20 个 SVG | 只用了 `svg`、`title`、`path` 三种元素，文字已转曲，没有位图和外链。viewBox 紧贴图形：mark `290 183.592 472 631`，lockup `90 75 1244 330`，wordmark `391.463 75 943 330`，mark-small `0 0 16 16`。五种颜色版本的路径数据逐条相同，顺序一致。mono 版每一块都是 `fill="currentColor"`，没有部件标识；signal、choice 和字标只能靠彩色版本的填充色区分 |
| `brand/png/{mark,mark-small,lockup,wordmark}/…` | 透明底 PNG，只有 on-light 和 on-dark 两种 | 尺寸与 README 一致 |
| `brand/web/` | `favicon.ico`、`favicon.svg`、`apple-touch-icon.png`、`icon-192/512.png`、`icon-maskable-512.png`、`site.webmanifest`、`head.html` | 位图的尺寸、通道和安全区都合格。maskable 图标主体最远点距中心 37.1%，小于 40%。`favicon.ico` 有 16、32、48 三帧 |
| `brand/social/sairn-avatar-{dark,light}-{400,1024}.png` | 社交头像 | 不透明，标志占 60% |
| `brand/ios/`、`brand/android/`、`brand/harmonyos/` | 原生图标集 | 自检合格。仓库里没有任何原生工程 |
| `brand/Sairn-Logo-v1.3.zip` | 与上面 112 个文件逐字节相同 | 内容重复，444 KB |
| `brand/Sairn-Motion-Library-v1.3.html` | 16 个动效、7 个状态符号的生成器 | 不发网络请求。可以导出 ZIP，共 163 个文件 |
| `brand/Sairn-Share-Studio-v1.3.html` | 分享卡工具：6 种模板 × 4 种画幅 × 深浅 2 种外观 | 不发网络请求。48 种组合全部渲染成功 |
| 内嵌令牌 `tokens/sairn.tokens.json` v1.3.0 | 两个 HTML 里各有一份，内容相同 | 包含深浅两套 surface、text、status、pnl、focus。原文件没有交付 |

### 1.2 缺件【事实】

- **`brand/brand-info.yaml` 还没更新。** 名称、域名、邮箱、社交账号和颜色都还是旧值，社交一栏为空。
- **OG 卡**：`brand/share-cards/og/` 下只有 `.gitkeep`。缺两张 1200×630 的图，而且两张必须不同（`tests/brand-cross-app.test.mjs:23-33`）。
- **PnL 分享卡标注稿**：`brand/share-cards/pnl/` 下只有 `.gitkeep`。
- **字体**：`brand/fonts/` 为空。Studio 用的是系统字体栈，没有附字体授权。
- **原交付清单里的 `brand/loader/` 三件**：`loader.svg`、`loader-motion.md`、`loader-reduced-motion.svg` 没有交，改由 Motion Library 代替，但它的导出结果没有放进 `loader/`。
- **Web 图标缺件**：
  - 缺 `icon-maskable-192.png`。
  - 缺 manifest 用的 `icon.svg`。
  - ICO 缺 64px 一帧。现在线上的 ICO 有 16/32/48/64 四帧。
- **设计方源码和授权**：
  - 缺 `Sairn-Brand-Tools-v1.3.zip`，里面应该有 studio、catalog 和 tokens 源码。Studio 第 3223 行引用了它。
  - Motion 和 Studio 的代码没有版权与许可说明。Studio 头部的 Apache-2.0 是第三方 QR 库的声明，版权行仍是模板里的占位符。
- **状态符号缺三种**：部分成交（partial）、info、warning。
- **悬停色**：`--signal-hover` 没有给值。
- **已入库的空目录**：`brand/logo/` 和 `brand/icons/` 里只有 `.gitkeep`。它们来自 `895c7cf9` 版 README 的旧清单，实际交付用的是 `svg/`、`png/` 和 `web/`。

### 1.3 素材质量问题

**Logo 套件【事实】**
- `favicon.svg` 没有底块，`favicon.ico` 和 `apple-touch-icon` 有 `#0A3038` 底块，所以不同浏览器标签页上显示得不一样。
- 每个 SVG 都带 `<title>sairn</title>`。内联使用时要去掉，否则悬停会出提示，读屏也会重复朗读。

**`site.webmanifest`**：有四处和仓库现状冲突【事实】，见 §1.4。
- `"lang": "zh-CN"`，但终端支持六种语言（`apps/terminal/lingui.config.ts:11-12`）。
- `theme_color` 是 `#0A3038`，违反 `docs/runtime-guardrails.md` §8（第 679–680 行）。
- 图标的 `src` 用的是绝对路径。
- 文件名是 `site.webmanifest`，仓库现在用的是 `/manifest.json`。

**`head.html`**：不能原样粘贴，只有 ICO 的 `sizes="32x32"` 写法可以借用【事实】。

**Motion Library【事实】**
- 设成 `decorative:true` 时仍会输出中文 `<title>`，例如"已确认"。
- 颜色写死为十六进制，默认标签是中文。
- mono 外观下所有状态符号都变成空心，"实心表示终态"的区分就没了。
- 导出的 `sairn-motion.js` 没有导出 `CATALOG`。
- 外层是 UMD 包装，预渲染时可能出错【推断】。

**Share Studio【事实】**
- 文案写死为中文。
- 不支持 RTL。实测阿拉伯语标题的句末标点落在了错误一侧。
- 用 `Intl.NumberFormat('en-US')` 格式化数字，金额用浮点数计算，会出现 `gross: 670.0000000000003` 这样的值。
- 文字溢出时直接拒绝导出。
- 杠杆上限写死为 50，代码长度上限写死为 12，真实的 HIP-3 市场会被这两条校验拦下。
- 杠杆 20 倍时 ROE 显示 −100.22%，没有考虑强平。
- 大数字定位用的字高常数 `CAP = 0.716` 是按 Arial 写的。
- 草稿以明文存在 localStorage。

**品牌名大小写不统一【事实】**：manifest 写 "Sairn"，SVG 的 title 写 "sairn"，Studio 里还有 "SAIRN"。现有界面里 GATU、Gatu、gatu 三种写法混用。

**颜色【事实】**
- 浅色琥珀 `#99621F` 放在 `#E8EFEB` 上，对比度只有 4.36:1。设计方自己的规则也禁止这样用。
- 深色薄荷 `#86E5D3` 在设计方体系里同时是 `status.success`。它和终端涨色 `#77C7AF` 的 ΔE2000 只有 7.7，而现在的荧光绿是 30.3。

### 1.4 仓库里的冲突点【事实】

1. **主题色**
   - 交付的 `#0A3038` 与三处冲突：`runtime-guardrails.md` §8（第 679–680 行）、`pwa-manifest.test.ts:26-28`、`apps/terminal/src/config/seo.ts:16`。这三处都要求 `#0F1A1F`。
   - `pwa-manifest.test.ts` 里的字面量断言，是 §8 目前唯一的测试保护。

2. **Logo 尺寸**
   - 新规则要求标志或横版组合的高度至少 24px。现有页头的三处 logo 都不达标：
     - 桌面横版 18px：`top-nav-view.tsx:42`
     - 紧凑态和移动页头的标志 22px：`top-nav-view.tsx:44`、`mobile-header.tsx:29`
     - 抽屉横版 16px：`mobile-nav-drawer.tsx:186`
   - 页头收纳规则写在 `docs/runtime-guardrails.md` §11（第 876 行起），归 ADR 0013 管。窄屏阈值后来按 ADR 0021 D8 从 1100 改成了 1150。
   - 现行常量是 `DESKTOP_NAV_COMPACT_MAX_PX = 1181` 和 `DESKTOP_NAV_NARROW_MAX_PX = 1150`（`config/layout.ts:11-12`）。
   - §11 的记录（第 940–943 行）：1151px 未连接钱包时，法语导航只剩 56px 余量；已连接状态从来没有测过。
   - 仓库现有的 Playwright 夹具都没有挂载 `TopNav`。`apps/terminal/tests/browser/user-menu-recovery.fixture.tsx:37` 明确写了不挂载。

3. **加载器依赖旧 logo**：`GatuOrbitLoader`（`components/brand/gatu-orbit-loader.tsx:3,20-36`）依赖 `GATU_MARK_PATH` 和 `--logo-ink`、`--logo-node`。只换 logo 不换加载器，要么编译失败，要么页面上留着旧几何。

4. **`APP_NAME` 一身二用**
   - `APP_NAME = "gatu"` 定义在 `config/build-meta.ts:3`，由 `config/app.ts:1` 转出。它既是显示用的品牌名，又是 Hyperliquid Agent 槽位名的回退值（`config/trading-agent.ts:6`）。
   - 生产槽位靠构建环境变量 `VITE_HYPERLIQUID_AGENT_NAME=gatu`。`deploy/env.build.example:17` 只是示例文件。发布手册写明这一项没有机器校验，靠发布前人工核对（`deploy/cloudfront/README.md:137`）。
   - p22、p23 两次发布记录里做过"产物里没有 `gatu-dev`"的核对，核对时不打印值（`docs/work-memory/sessions/2026-09-21-cloudfront-release-p22.md:39`、`2026-09-24-cloudfront-release-p23.md:38`）。
   - 守住回退值的 `trading-agent-config.test.ts` 既不在 AGENTS.md 的 Wallet signing 验证组里，也不在任何 CI 步骤里。

5. **存储键和锁名带品牌名**
   - 资金操作、CCTP 跟踪、下单资产锁、LI.FI、登录意图等用到的存储键和 Web Lock 名都带 `gatu`，完整清单见改名报告的 C1 表。
   - 改名会让进行中操作的恢复失效，也会让跨标签页互斥失效。下面几项是失败关闭的防重复守卫，作用不只是显示进度：
     - **资金动作标记**：键 `gatu.funds_action.pending.v1`，锁 `gatu_funds_action_marker_storage_v1`（`components/funds-action/funds-action-marker.ts:5-6`）。`FundsActionRecoveryHost`（挂在 `components/app-toaster.tsx:12`）靠它把用户带回核验弹层。
     - **CCTP 充值跟踪和赞助授权意图**：键 `gatu:cctp-deposit-tracking:v1` 和 `gatu:cctp-sponsored-authorization-intent:v1`（`lib/trade/cctp-deposit-tracking.ts:108,110`）。有跟踪记录时，第二笔充值会被拒绝（`lib/hyperliquid/use-deposit.ts:1236-1245`）。授权意图起"墓碑"作用：在授权被确认消费之前，防止新签的充值和已经暴露的授权同时成功（`docs/cctp-deposits.md:240-244`）。
     - **下单资产锁和占位**：键 `gatu-order-asset-v1` 和 `gatu-order-asset-reservations-v1`（`lib/trade/order-asset-lock.ts:3-4`）。订单待对账时，占位会拦住重复提交（`docs/confirmation-surfaces.md:25`）。
     - **内嵌钱包自动跨链锁**：Web Lock `gatu:embedded-cctp-deposit:*`（`components/trade/tradebox/embedded-deposit-auto-bridge.tsx:249`）。
     - **其他记录**：LI.FI 执行记录 `gatu:lifi-bridge-execution:v1`（`lib/lifi/bridge-execution-persistence.ts:5`）、待处理 TWAP（`stores/use-pending-twap-store.ts:40`）、登录意图 `gatu:privy-login-intent:v2:`（`lib/wallet/privy-login-method.ts:11`）。
   - **换域名的效果和改键名完全一样。** localStorage、sessionStorage 和 Web Locks 都按 origin 隔离，到了新域名，上面这些守卫一个都不存在。新旧域名并存期间，两边的锁也互相看不见（D23）。

6. **i18n 目录**
   - msgid 就是英文原文，改英文就等于换了键。
   - 只要某个语言的 msgid 集合和英文对不上，整个语言会静默退回英文（`lib/i18n-catalog.ts:26`、`lib/i18n.ts:89,107`）。
   - lefthook 会自动暂存所有 `.po` 文件（`lefthook.yml:7-9`）。

7. **会静默失效的检查**
   - `scripts/measure/measure-boot-timing.mjs:913` 用 `header a[aria-label="GATU"]` 选元素。改名后结果变成 `null`，但不报错。
   - 8 个"这里没有转圈"的断言靠 `.animate-spin` 类名判断。换成新动效后，这些断言会一直通过。
   - `root-startup-fallback.test.tsx:61` 只禁止了 `header,nav,footer,button,input`，往启动占位里加 SVG 不会失败。
   - `order-summary.test.tsx:82,122,150` 和 `twap-order-summary.test.tsx:61` 断言下单摘要里不出现 "GATU fee"。改名后这条断言恒为真，界面上出现 "Sairn fee" 也查不出来。
   - `legal-policy-contract.test.ts:88` 断言官网页脚里不出现 `hi@gatu.ai`。换域名后它同样恒为真。

8. **OG 像素比对**：`og:check` 是 `pnpm test` 和 `test:brand` 的第一步（`package.json:14-15`），CI 跑在 ubuntu-latest 上。如果卡片依赖系统字体，比对结果会不稳定。

9. **官网部署不在仓库里**
   - **实际部署**：S3 桶 `gatu-dist-2026`、分发 `EP2DIBP3T7M3G`、CloudFront 函数 `gatu-rewrite-index`（`deploy/cloudfront/README.md:23`）。函数源码和发布命令都不在仓库里，`apps/website/README.md:16-37` 写的还是 Vercel。
   - **现有发布脚本只能发终端**：`deploy/cloudfront/deploy.mjs` 的默认目录是 `apps/terminal/.output/public`（第 493 行），`sync` 要求有 `_shell.html` 和 `build-meta.json` 闸门（第 677–679 行）。
   - **发布身份权限不够**：发布身份 `gatu-edge` 能同步官网的桶，也能对 `EP2DIBP3T7M3G` 做失效，但不能读取或更新 `gatu-rewrite-index`。`deploy/cloudfront/iam/gatu-edge-release-policy.json` 的 `EdgeFunctionsRelease` 只列了 `gatu-terminal-request` 和 `gatu-terminal-response` 两个函数。
   - **官网线上版本很旧**【事实，2026-10-01 读取线上响应】：
     - `https://gatu.ai/` 的 `Last-Modified` 是 2026-07-19，页面标题仍是 "gatu — Open-source trading terminal for Hyperliquid"。
     - 仓库里已有的 `/og-website-1200x630.png`、`/logo-mark.svg`、`/favicon.ico`、`/apple-touch-icon.png`、`/gatu-logo-1024.png` 在线上都返回 404。
     - 由此可知，2026-08-23 以来的官网改动一直没有发布，例如 `8c4d8e8e feat: apply GATU v2 brand identity`。
   - **官网缓存策略**：
     - 【事实】线上官网的 `logo.svg`、`favicon.svg`、`og.png`、`robots.txt` 带 `cache-control: public,max-age=31536000,immutable`。同名文件原地替换后，回访者的浏览器最长一年内仍会用旧文件。
     - 【推断】此前使用的官网发布命令把所有非 HTML 文件都按 immutable 上传，这和线上响应头一致。命令本身不在仓库里，也没有任何仓库记录；来源是会话外的个人笔记，阶段 1a 入库发布手册时要以实际命令为准重新核对。
     - 【事实】终端对非哈希文件用的是 `public, max-age=0, must-revalidate`（`deploy/cloudfront/deploy.mjs:20`）。线上 `app.gatu.ai/favicon.ico` 和 `manifest.json` 的响应头也是这样。

10. **品牌素材没有归属文档**：`docs/` 和 `.claude/` 里没有任何地方规定 logo、favicon，以及 `--signal`、`--action`、`--focus`、`--logo-*` 这些令牌。

11. **CI 覆盖缺口**
    - `terminal-tests.yml` 只跑显式列出的测试文件，另加 `chart-*`、`tradingview-*`、`mobile-sync-*` 几个 glob。
    - `src/lib/tests/` 下共有 611 个测试文件。本计划依赖的下列测试都不在 CI 里：`pwa-manifest`、`network-storage`、`referral-join`、`referral`、`terms-content`、`legal-policy-contract`、`trading-agent-config`、`order-summary`、`twap-order-summary`、`i18n-reactivity-contract`、`i18n-hot-switch`、`locale-format-contract`、`position-pnl-share`、`position-pnl-share-modal`、`design-token-ratchet`、`footer-bar`、`orderbook-color-contrast`。`tradingview-chart` 和 `chart-theme-colors` 由 glob 覆盖。
    - 路径过滤：`terminal-tests.yml:5-23`、`production-build.yml:5-23`、`static-checks.yml:7-20` 都不含 `brand/**` 和 `legal/**`，而终端用 `?raw` 把 `legal/*.md` 打进了包（`routes/{cookies,docs,privacy,risk,support,terms}.tsx:5`）。`website-build.yml:8-19` 不含 `legal/**`、`apps/terminal/public/manifest.json`、`robots.txt`、`sitemap.xml` 和 `apps/terminal/src/config/**`。
    - `test:brand` 只在 website-build 里运行。`scripts/ci-workflows.test.mjs:98-121` 有两条要求：`test:brand` 里的每个终端测试都必须同时出现在 terminal-tests 里；production-build 不能跑 vitest 或 `test:brand`。

12. **回访用户第一次打开仍是旧版**
    - Service Worker 处理导航时先返回缓存的壳（`apps/terminal/public/sw.js:68,83-102`）。
    - 旧壳引用的哈希资源在发布时不会被删除（`deploy/cloudfront/deploy.mjs:85-89`）。
    - 所以发布后，回访用户第一次打开看到的是旧品牌，第二次打开才是新的。

13. **根目录脚本的依赖**
    - 根 `package.json` 只声明了 `@ai-hero/sandcastle`、biome、commitlint、`@playwright/test`、es-module-lexer、lefthook 和 typescript。
    - zod 只在 `apps/terminal/package.json:70` 和 `packages/hl-react/package.json:64` 里声明，sharp 只是传递依赖。
    - 修订时实测，根目录脚本导入 zod 或 sharp 都会报 `ERR_MODULE_NOT_FOUND`。

14. **生成文件与 Biome**
    - `biome.json` 的检查范围是 `**/src/**/*`，只排除了 `routeTree.gen.ts`、`styles.css` 等少数文件。
    - lefthook 提交时会对暂存文件执行 `biome check --write`，然后重新暂存（`lefthook.yml:5-6`）。
    - 如果生成到 `src/` 下的文件格式和 Biome 不一致，提交进去的内容就会和生成器的输出不一样。

### 1.5 改名量级【事实】

- `git grep -niI gatu`（排除图表库）命中 769 个文件、2,678 行、2,991 处。
- 用户可见部分：
  - 10 条在用的 Lingui msgid，乘以 6 个 `.po` 文件
  - 33 处不走 Lingui 的界面字符串
  - 法律文本 76 处，分布在 7 个文件
  - 官网 18 处
- `@gatu/*` 包作用域：920 行、494 个文件。
- 历史记录：1,131 处、203 个文件。
- 域名和邮箱：302 处。
- 下面几类用 grep 查不到，必须截图或人工核对：
  - 运行时拼出的 "GATU"：`position-pnl-share-modal.tsx:149` 里的 `APP_NAME.toLocaleUpperCase()`
  - SVG 路径里的 logo 图形
  - OG 图和官网截图里的像素（`apps/website/public/app-desktop.jpeg`、`app-mobile.jpeg`）
  - 上次改名漏掉的旧名 "HyperTerminal"：`.claude/rules/ui-library.md:1`、`apps/terminal/src/styles.css` 里 7 处、`packages/ui/src/globals.css:4`、`features/color-system.md:15`

---

## 2. 需要用户决定的事项

每一项都写明选项、推荐默认值和它卡住的阶段。推荐默认值只是规划者的建议，**不代表已经替用户做了决定**。

**第一批需要拍板的**
- **D18、D19**：卡住阶段 0b 的目录整理和阶段 1b。另外，处理 `brand/README.md` 需要用户明确同意，因为那是用户还没提交的改动。
- **D1、D4、D6、D14、D21**：决定品牌发布批次 B 能不能动工。

**不用等任何决定就能开工的**
- 阶段 0a 的文档草稿：计划文档、`docs/brand-assets.md` 骨架、ADR 写成"拟议"。前提是不碰 `brand/` 目录。
- 阶段 1a 全部：CI 覆盖、防静默失效、官网发布流程入库。官网函数的源码要由有权限的身份从 AWS 导出，见阶段 1a。
- 阶段 4b 的第一个提交。
- 向设计方发补件清单（附录 B）。

---

**D1 显示名写法**
- 选项：`Sairn`、`sairn`、`SAIRN`；中文界面要不要另起中文名。
- 推荐：
  - 所有语言的文字一律写 `Sairn`，不翻译。
  - 字标图形保持设计稿里的小写 `sairn`。
  - 文件名前缀用 `sairn`。
  - 全大写只用在设计明确要求的装饰位置。
- 卡住：阶段 5（全部名称）、阶段 4b（品牌字样和文件名）、manifest 的 name。

**D2 新域名、邮箱、社交账号**
- 必须由用户给出具体值：apex、www、app、testnet、support 邮箱，以及各社交账号。
- 推荐：
  - DNS 继续放在 Cloudflare，用 DNS-only（灰云）。
  - 只启用 `support@<新域名>`。
  - 不建 preview，因为没有任何部署证据表明需要它。
  - 不启用 `hi@`。契约测试 `legal-policy-contract.test.ts:88` 目前禁止它出现，阶段 1a 会把这条断言改成禁止任何域名的 `hi@`。
- 卡住：阶段 7 全部、阶段 5b 里的域名和邮箱、官网的社交链接。

**D3 品牌和域名是否同一次对外发布**
- 选项：
  - A：分开发布，品牌先在 `gatu.ai` 上发布。
  - B：合并发布。
- 推荐 A。域名切换本身就需要两次发布加一系列外部操作（阶段 7），和视觉改动捆在一起会放大风险。
- 卡住：发布排期，以及法律文本分几批送审。

**D4 界面强调色**
- 选项：
  - a：只换 logo，`--signal` 保留荧光绿。
  - b1：`--signal` 及其 hover、soft 换成青色和薄荷色，`--action` 保持中性。
  - b2：`--action` 也换成品牌色。
- 推荐 b1。b2 会让"提交"按钮和绿色"买入"按钮难以区分。
- 子项：
  - (b) 深色焦点色用薄荷（与 signal 一致），还是用设计方指定的琥珀 `#E6B766`？推荐薄荷，因为琥珀和警告色的 ΔE 只有 3.9。
  - (c) 悬停色。推荐请设计方确认 `#A8EEE1`（深色）和 `#0F524D`（浅色），这两个值是调查者提议的。
  - (d) 10 个用 `text-signal` 的等待转圈。推荐改成中性色，否则薄荷色的"等待"会被看成"成功"。
  - (e) 色相相近怎么处理。深色下，薄荷和涨色的 ΔE 是 7.7，和 Spot 分类色是 7.3；浅色下，青色和 Spot 分类色是 3.8。推荐先接受，并登记为待定例外：signal 不放在数字或盈亏旁边，Spot 分类色请设计方复核。
- 卡住：阶段 6。

**D5 终端背景与 PWA 主题色**
- 推荐：
  - 终端深色画布、manifest 的 `theme_color` 和 `background_color`、`seo.ts` 的 `themeColor`，都保持 `#0F1A1F`。
  - `#0A3038` 只用在图标底块。
  - 浅色终端保持白色，不改用 paper `#F5F4EE`。
  - 官网画布要不要改成品牌青，留到官网改版时再定。
  - `pwa-manifest.test.ts` 保留字面量断言，并在阶段 1a 新增一条：manifest 的主题色必须等于 `styles.css` 深色块里的 `--bg-base`。
- 依据：如果背景改成 `#0A3038`，复算结果是：订单簿买盘对比度只有 4.31，`--market-neutral` 只有 3.78，浮层 `#212D33` 对底色是 1.00。这还会违反 AGENTS.md 的「Trading terminal visual contract」。
- 卡住：阶段 2（manifest）、阶段 6。

**D6 页头 Logo 尺寸**
- 选项：按 24px 规则统一调整；或者请设计方为 18px 和 22px 开例外。
- 推荐 24px：
  - 桌面横版改 `h-6`，约 90.5×24，比现在宽 9px。
  - 紧凑态和移动页头改用完整标志 `h-6 w-auto`，约 18×24。
  - 抽屉横版改 `h-6`。
- 必须按 `docs/runtime-guardrails.md` §11 的方法实测，具体做法见阶段 2：
  - 宽度：1440、1300、1182、1181、1151、1150、1101、1001px
  - 语言：六种
  - 状态：已连接、未连接
- 如果余量不够，先改 `DESKTOP_NAV_NARROW_MAX_PX`，再在 ADR 0013 追加更正，不改 Logo 尺寸规则。
- 卡住：阶段 2。

**D7 Web 缺件怎么补**
- 推荐：
  - **`icon-maskable-192.png`**：先请设计方补交（附录 B 第 3 项）。如果拿不到，就在 `scripts/brand.mjs` 里用 Chromium canvas 从 512 版缩放。`@playwright/test` 已经是根依赖，不需要新增 sharp。派生的结果交设计方过目。
  - **`icon.svg`**：
    - manifest 里这一项没写 `purpose`，等于 any。
    - 交付的 any 图标 `icon-192/512` 是圆角方形，四周内缩、边缘透明。`ios/icon-composer/background.svg` 却是 1024 的满版直角底。两者合成出来的图会和 PNG 外观不一致。
    - 推荐从 manifest 里删掉 `icon.svg`，同时修改 `pwa-manifest.test.ts:65`。这个文件只有 manifest 用到；`seo.ts` 和官网用的都是 `favicon.svg`。
    - 设计方另交了 `icon.svg` 时再加回去。
  - **ICO**：不补 64px 一帧，`sizes` 改为 `16x16 32x32 48x48`。manifest、`lib/seo.ts:64` 和官网 `Base.astro` 同步修改。
- 卡住：阶段 2。

**D8 内部标识保留清单**
- 推荐全部保留：
  - 存储键和 Web Lock 名
  - `@gatu/*` 包名
  - `GATU_*` 和 `VITE_GATU_*` 环境变量
  - AWS 资源名：S3 桶、CloudFront 函数、Lambda、IAM
  - 内部请求头 `x-gatu-*`、`<meta name="gatu-route">`、预加载标记
  - `ht-mobile-sync`、`LEGACY_*`
  - `LIFI_INTEGRATOR = "gatu"`（`config/app.ts:48`）
  - 测试夹具 `gatuappweb3`（推断是团队在链上登记的推荐码）
  - `.deepsec` 项目 id
- `__gatu*` 全局变量和 Vite 插件名对用户不可见，以后可以顺手改。包作用域如果要改，等所有在途分支都合并后，单独做一次提交。
- 注意：保留这些键，只能避免"在同一个 origin 里改名"造成的失效。换域名时它们照样会失效，那是 D23 要解决的问题。
- 卡住：ADR 0027 的内容、阶段 5 的范围。

**D9 Hyperliquid Agent 槽位名**
- 选项：保持 `gatu`；改为 `sairn`。
- 推荐保持 `gatu`。
- 改名的后果：
  - 所有外部钱包用户都会被判为 `agent_name_mismatch`，必须重新签名。
  - 旧槽位继续占着。每个账户只有 3 个命名槽位，槽位已满的用户会授权失败。
- 保持 `gatu` 的额外好处：用户在新域名上授权时，旧域名 localStorage 里的私钥会自动作废。
- 代价：
  - 用户在 API 钱包页上仍会看到 "gatu"。
  - 域名并存期（阶段 7e 到 7h）里，如果同一个外部钱包用户在两个域名之间来回使用，同名授权会互相顶掉对方的 Agent（`docs/trading-onboarding.md:185-194`），每次都要主钱包重新签名。邮箱用户走内嵌钱包直接签名，不受影响。缓解办法见 D17 和风险 #26。
- 改用新槽位名可以避免互相顶替，但要多占一个命名槽位，而且旧域名上的私钥不会因为新授权而作废，所以仍不推荐。
- 卡住：阶段 1（拆常量）、阶段 7。

**D10 历史记录怎么处理**
- 选项：
  - A：像 2026-09-13 那次一样全量替换。
  - B：保留原文，在 ADR 0027 和 `docs/work-memory/README.md` 里各加一份名称对照。
  - B′：在 B 的基础上，替换 `research/` 下纯文字的品牌词。
- 推荐 B 或 B′。
- 理由：`docs/work-memory/**` 的 633 处命中里，只有 66 处是纯文字品牌词，其余是命令、仓库链接、域名和 AWS 名称。机械替换会编造出从没发生过的"sairn 发布验证"，而 `memory:check` 拦不住这种情况。
- 注意：上次用户明确要求过"历史文档也改"，这次需要用户再确认一次。
- 卡住：阶段 5 的文档部分。

**D11 启动阶段要不要显示品牌动效**
- 推荐：不显示，ADR 0010 不变。动效库自己也写明 brand-intro "不用于延长启动等待"。
- 卡住：阶段 3 的范围。

**D12 动效细则**
- 子项和推荐默认值：
  - (a) 图表首次加载器从 36px 放大到 48px，因为动效库要求最小 48。推荐同意。**这一项卡住阶段 2。**
  - (b) 状态符号用应用现有的语义色（`--text-success`、`--text-error`、`--text-warning` 和中性色），不用动效库的配色。
  - (c) partial、info、warning 三个符号请设计方补。补齐之前，Sonner 和订单通知整体保留 Phosphor 图标，不混用两套。
  - (d) IOC 订单未成交被撤，用 cancelled 符号，文案不变（那是交易所确认的撤单结果）。
  - (e) Enable Trading 这类钱包握手按钮，用 16px 的 button-loading。
  - (f) 存款、金库、API 钱包的状态页插图放大到 64px。
  - (g) 骨架屏不染品牌色。
  - (h) 官网暂时不用 brand-intro。
  - (i) 被动指示、图表重建时的小转圈、懒加载弹层的占位保持现状。
  - (j) 手机下单主按钮提交时的转圈（`mobile-trade-view.tsx:1144`）不在这次迁移里改，另开任务。
  - (k) 不做应用内的"减少动态效果"开关。
- 卡住：阶段 3。

**D13 分享卡范围**
- 推荐：
  - 只做持仓 PnL 卡，保留现有字段：品牌字样、时间、交易对、多空与杠杆、ROE、盈亏、开仓价、标记价、测试网标签、二维码。
  - 借用 Studio `trade` 模板的视觉，但不用"已平仓""已扣费用"这类说法，也不放费用和持仓时长。
  - 4:5 画幅，固定深色品牌底，标题用市场名。
  - 首版不加"隐藏金额"，也不加红涨绿跌，以后再议。
  - 页脚免责声明交法务定。
  - 其余五种模板不进产品，Studio 留作内部运营工具。
- 卡住：阶段 4b。

**D14 OG 卡的来源**
- 选项：
  - A：设计方交两张最终 PNG，流程改为"复制并校验"。
  - B：按 Sairn 视觉重写 `designs/og-cards/cards.html`，继续用仓库自带的 OFL 字体。
  - C：用 Studio 的 landscape 版式导出。
- 推荐 A，设计方交不了时退回 B。不推荐 C：系统字体会让 `og:check` 在 ubuntu 上不稳定，而且 Studio 的类型标签和法律行是写死的。
- 补充推荐：
  - 卡面上不印域名，这样阶段 7 不用重新出图。
  - 用英文。
  - 换成中性、带版本的文件名，用来刷新社交平台的缓存。官网线上的同名文件是按 immutable 缓存的（§1.4 第 9 条），这一点对官网尤其必要。
- 卡住：阶段 4a，也就卡住了品牌发布。

**D15 manifest 字段**
- 推荐：
  - `name` 和 `short_name` 取 D1 的值。
  - 加 `"id": "/"`。
  - 不写 `lang`。
  - 文件名保持 `/manifest.json`。
  - 图标 `src` 保持相对路径。
- 卡住：阶段 2 和阶段 5。

**D16 法律相关**
- 待定事项：
  - 法律实体 "Gatu Corp." 要不要更名。
  - Terms 修改后，是否需要用户重新接受。
  - 免责声明的措辞和各语言版本。
- 推荐交法律审阅。审阅结论出来之前，技术侧不动 `legal/` 目录，也不动法律确认弹窗里的两条文案。
- 【事实】应用没有自己的条款版本和接受记录。
  - 法律门控只认 Hyperliquid 的 `legalCheck` 和 `acceptTerms2`（`docs/runtime-guardrails.md:20`）。
  - 在 `apps/terminal/src` 和 `packages/hl-react/src` 里搜不到 `TERMS_VERSION` 一类的版本号。
- 所以，如果法务要求用户重新接受条款，就要新建一个门控。这会改变 AGENTS.md「First-use trading onboarding contract」规定的系统边界：
  - 先在 `docs/trading-onboarding.md` 里写设计，并写 ADR。
  - 评估对所有已登录用户的影响。
  - 阶段 5b 和 7f 的排期要为这部分工作留出时间。
- 卡住：阶段 5b、阶段 7f。

**D17 旧域名退役细节**
- 推荐：
  - **kill-switch**：旧域名的 `/sw.js` 返回 kill-switch 版本。
    - install 时执行 `skipWaiting`；activate 时删除全部缓存，然后 `unregister`。
    - **不**调用 `clients.claim()`，**不**导航任何已打开的标签页。
    - 原稿让 kill-switch 把所有标签页导航到新域名，已撤回。主动导航会卸载正在后台提交的页面级宿主，或正在等待结果的资金弹层，违反「Confirmation surface contract」。
    - 迁移改由下一次真实导航（被 301 带走）或 D23 的迁移入口完成。
  - **不下发** `Clear-Site-Data`。这样就不会和 `runtime-guardrails.md` §1 冲突：本地私钥只能在 reset、revoke 或 rotation 流程里删除。旧私钥的安全靠两点保证：旧域名永久由我们持有；用户在新域名上用 `gatu` 槽位重新授权时，旧 Agent 会被顶掉。
  - **不交接偏好设置**。进行中操作的待处理记录怎么办，见 D23。
  - **并存期长度由用户决定**。
    - 取舍：并存期越长，在两个域名之间来回使用的外部钱包用户越容易互相顶掉 Agent（D9）；越短，留在旧域名上的待处理记录越多，越要靠 D23 的迁移闸门兜底。
    - 推荐默认两周。原稿写的是"不少于两周"，审查后改成默认值，可以按公告覆盖情况缩短或延长。
    - 并存期内，旧域名上一直显示迁移提示。公告里提醒外部钱包用户只在一个域名上交易。
  - 旧域名、证书、邮件转发永久续费。
- 卡住：阶段 7h。

**D18 单一来源用什么格式**
- 选项：用 `brand/brand.json`；或者保留 YAML，再新增一个解析依赖。
- 推荐 `brand/brand.json`：
  - **JSON 本身不需要新依赖**。终端、Lambda 构建、Astro 和 Node 脚本都能直接导入 JSON，Node 里用 `with { type: "json" }`。
  - 终端的 TypeScript 用的是 `moduleResolution: "bundler"`（`tsconfig.base.json`）。修订时用仓库的 `tsc` 5.7.2 在 scratchpad 里试过，导入 JSON 可以编译【事实。只是最小样例，不是终端工程本身】。
  - **结构校验用 zod，放在终端的 vitest 里**，因为终端已经依赖 zod。根目录的 `scripts/brand.mjs` 只读 JSON、做字符串比对，不导入 zod（根目录解析不到 zod，见 §1.4 第 13 条）。如果坚持在根目录脚本里用 zod，就要在根 `package.json` 里声明依赖，并在 ADR 0027 写明，这会改动 `pnpm-lock.yaml`。
  - 仓库已有从根目录导入的先例：终端的 `legal/*.md?raw`，以及官网 `content.config.ts:19`。
  - `brand-info.yaml` 的内容迁进 JSON 后退役。
- 卡住：阶段 0b、阶段 1b。

**D19 `brand/` 目录整理**
- 推荐：
  - **`brand/README.md`**：**先征得用户同意。**
    - 同意之后，先把用户当前的版本原样另存为 `brand/LOGO-KIT.md`，再按实际目录重写 README。不是恢复 `895c7cf9` 版。
    - 不恢复旧版的原因：`895c7cf9` 版的交付清单用的是 `logo/` 和 `icons/` 两个目录，还写着"`favicon.ico` 由它生成（16/32/48/64）"和"三份 CSS 里的品牌色改成引用同一个文件"。这几处分别和实际交付、D7、附录 A 第 5 条冲突。
    - 新 README 按 `svg/`、`png/`、`web/`、`social/`、`ios/`、`android/`、`harmonyos/`、`loader/`、`tokens/` 写交付状态表，并删掉或改写和本计划冲突的"替换计划"。
  - **空目录**：删除 `brand/logo/` 和 `brand/icons/`，在 README 里说明它们已经由 `svg/` 和 `web/` 代替。
  - **zip**：移到已被 Git 忽略的 `brand/_source/`（`.gitignore:64-65`）。
  - **原生图标集**：入库，只作存档，不接入任何构建。
  - **Motion 和 Studio 两个 HTML**：版权与许可说清之前放在 `_source/`，说清之后放到 `brand/tools/`。
  - **动效导出物**：
    - 只把设计产物入库到 `brand/loader/`：`svg/<theme>/*.svg`、`static/`、`glyphs/`、`sairn-motion.tokens.json`。
    - 在 `brand/loader/README.md` 里记录来源：源 HTML 的 SHA-256、导出时间、浏览器和工具版本、导出步骤。
    - `sairn-motion.js` 和 `sairn-motion.d.ts` 属于代码，等许可说清楚再决定。
- 卡住：阶段 0b 的目录整理、阶段 3 的生成器。

**D20 官网细节**
- 推荐：
  - **JSON-LD 的 logo**：用浅色头像 `sairn-avatar-light-1024.png`。依据是外部指南建议 logo 在白底上也能正常显示，这一条属于推断。
  - **文件名**：用中性的 `logo-1024.png`。
  - **标语**："Gateway to on-chain transactions" 需要用户提供新的英文文案，可以参考"看清市场，自主判断。"。
  - **themeColor**：官网的 `themeColor "#0a0a0a"` 和页面底色不一致，这是原有问题，这次不改。
  - **发布流程和函数源码入库**：放在阶段 1a 完成。原稿安排在阶段 7a，现在提前了，因为它是批次 B 的前提。
  - **缓存策略**：
    - 发布流程入库时，非哈希文件改成 `max-age=0, must-revalidate`，和终端保持一致。
    - 此前已经按 immutable 下发过的 URL（线上的 `logo.svg`、`favicon.svg`、`og.png`），回访者的浏览器最长会缓存一年。所以批次 B 里，官网的品牌文件一律换新路径：
      - Logo 由 Astro 资源管线导入，输出带哈希的文件名。
      - `favicon.svg` 的链接加版本参数，或者换一个文件名。
      - OG 换成带版本号的文件名（D14）。
  - **发布前审查**：官网下一次发布会连带上线 2026-07-19 以来所有未发布的官网改动，发布前要单独审一遍这些差异。【未验证】线上版本对应仓库里的哪个提交。
- 卡住：阶段 1a 的发布流程、阶段 2 的官网部分、阶段 5a 的官网文案。

**D21 分支与发布批次**
- 推荐：
  - 不可见的阶段（0a、0b、1a、1b、4b 的第一个提交、7a）各自开 PR 进 `dev`。
  - 可见的阶段（2、4a、5a，以及选了 b1 或 b2 时的阶段 6）在一个集成分支上累积，最后合成一个 PR 进 `dev`。用户以前用过这种流程。
  - 官网发布和终端发布同属批次 B（§4.1）。
- 备选：逐阶段合进 `dev`，同时冻结 `dev → main` 的晋升，直到品牌批次全部完成。
- 卡住：发布流程本身，不卡具体实现。

**D22 组件和文件命名**
- 推荐用与品牌无关的名字：`BrandLogo`、`brand-logo.tsx`、`data-brand-logo`、`BrandPageLoader`。不用 `SairnLogo`，免得下次改名时还要再改一遍。
- 卡住：阶段 2。

**D23 换域名时的本地待处理记录（新增）**
- 背景：§1.4 第 5 条列出的守卫在新域名上全部不存在；并存期间，两个域名的锁也互相看不见。
- 选项：
  - **A：迁移闸门。**
    - 从 R1 开始，代码能汇总出当前 origin 上的待处理记录：资金动作标记、CCTP 跟踪记录和授权意图、下单资产占位、LI.FI 执行记录、待处理 TWAP。
    - 从 R2 开始，旧域名上显示迁移入口。有待处理记录时，入口禁用并说明原因；没有记录时，才跳转到新域名。
    - kill-switch 不主动导航（D17）。
  - **B：在 A 的基础上，一次性交接不含密钥的待处理记录。** 做法是通过 URL 片段把记录带到新域名，新域名校验后写入。可以参照 ADR 0015 D7/D8 的明文片段先例。
  - **C：只靠公告。**
  - **D：在新域名上增加基于交易所或链上状态的失败关闭检查。**
- 推荐 A。
  - 不推荐 B 的理由：B 等于新开一个跨源数据入口。伪造的记录能拦住用户的操作，也能弹出误导性的核验弹层，需要安全审查。它的收益只覆盖迁移那一刻仍在途的少量记录，可以等 A 实测之后再议。
  - 不推荐 D 的理由：工作量大，不适合作为本次迁移的前提。
- 卡住：阶段 7a、7f、7h。

**D24 Privy 登录窗口 Logo 的来源（新增）**
- 选项：
  - A：只在 Privy 后台改 `logo_url`，与发布同步操作。
  - B：在代码里按主题传入 `appearance.logo`，可以是同源 URL，也可以是 React 元素。锁定版本 `@privy-io/react-auth` 3.32.2 的类型声明写明，这个字段会覆盖后台的 `logo_url`（`types-sr2FRXdy.d.ts:1513-1517`）。它随批次 B 一起发布。
- 推荐 B。随代码发布即生效，可以回退，也可以测试。后台只需要改应用名和 OTP 邮件的发件名。
- 约束：
  - ADR 0026 规定主题切换只能改外观，`useWallets()` 必须保持稳定。
  - 需要跑 `privy-config`、`privy-theme-switch-wallet-stability`、`client-root-theme-lifecycle` 这几组测试。
  - 在 `docs/runtime-guardrails.md` §1 记录这个做法。
- 卡住：阶段 2（如果选 B）、§4.1 第 3 行。

---

## 3. 分阶段计划

### 3.0 总览

| 阶段 | 内容 | 用户可见 | 发布批次 | 依赖 | 能否在决定前开工 |
|---|---|---|---|---|---|
| 0a | ADR 草稿、Reference 骨架、计划文档 | 否 | A | — | 能 |
| 0b | `brand/` 目录整理、交付物入库、`brand.json` | 否 | A | D18、D19；用户同意处理 `brand/README.md` | 否 |
| 1a | CI 覆盖、防静默失效、官网发布流程入库 | 否（零视觉变化） | A | — | 能（官网函数源码要由有权限的身份导出） |
| 1b | 单一来源接线；域名按组的结构 | 否（规范化比对无差异） | A | 0b、1a；D18 | 否 |
| 2 | Logo、图标、manifest、图表加载器、官网 Logo、Privy logo | 是 | B | 1b；D5–D7、D12a、D15、D20、D22、D24 | 几何代码生成可以先做 |
| 3 | 状态动效 | 是 | B 之后 | 2；D11、D12、D19；设计方源码 | 第一个提交（测试加固）能 |
| 4a | OG 卡 | 是 | B | D14；设计方 PNG 或阶段 2 | 否 |
| 4b | PnL 分享卡 | 是 | B 之后 | D13、D1、阶段 2；设计方标注稿 | 第一个提交（懒加载）能 |
| 5a | 名称、i18n、路由 head、官网文案、现行文档 | 是 | B | 1b、2；D1、D8、D10、D20 | 否 |
| 5b | 法律文本 | 是 | B 或 C | D16 法律审阅 | 否 |
| 6 | 品牌色令牌（仅当 D4 选 b1 或 b2） | 是 | 选了 b1 才纳入 B | D4、D5 | 契约测试框架能先写 |
| 7 | 域名切换：R1 → 外部准备 → 别名 → DNS → R2 → 重定向 | 是 | C | D2、D3、D9、D16、D17、D23 | 按组的结构已在 1b 完成 |

- **发布批次 A**：对用户不可见，跟随正常的 `dev → main` 晋升发布。
- **发布批次 B**：一次对外的品牌切换。终端和官网都要发布，官网按阶段 1a 入库的手册发布，并且要和 Privy 同步（§4.1）。
- **发布批次 C**：域名迁移，按阶段 7 的顺序进行。

**ADR 编号【事实】**
- 0025 已由公告方案预留（`docs/adr/README.md` 第 31 行），0026 已经用掉。
- `git log --all` 显示，所有本地分支都没用过 0027 及以后的编号。
- 下面是建议的分配，动笔前要再查一次：
  - 0027：品牌迁移总则。内容包括单一来源、显示名、保留的内部标识、Agent 槽位、历史记录策略、发布批次、Logo 令牌。
  - 0028：品牌色（D4、D5 的结论）。
  - 0029：品牌动效与状态符号。
  - 0030：PnL 分享卡的渲染边界。
  - 0031：域名迁移。内容包括双识别加两次发布、迁移闸门、kill-switch 不主动导航、本地守卫在迁移时失效的清单、同名 Agent 互相顶替、旧域名退役。

**每个阶段都要遵守的通用要求**
- **任务记录**：在 `docs/work-memory/sessions/` 里写或更新任务记录，然后运行 `pnpm memory:index && pnpm memory:check && pnpm memory:test`。
- **提交和 PR**：提交格式为 `type(scope): subject`，PR 的目标分支是 `dev`。
- **提交前检查**：核对 HEAD 有没有漂移，只暂存本阶段的文件。
- **批量替换**：只能基于 `git ls-files` 或 `git grep`。不要用 `find` 加 `sed -i`，否则会改到 `.claude/worktrees/` 里另一个会话的工作区。
- **lefthook**：注意 lefthook 会自动暂存 `.po` 文件。
- **包体测量**：用 Node 22.15，并设置 `NODE_ENV=production`。
- **测试在哪跑**：每个阶段的验证一节，都要写明每个测试是在 CI 里跑还是只在本地跑。本计划新增的或改到的品牌相关测试，放进阶段 1a 新建的 CI 品牌组。
- **生成文件**：
  - 生成到 `src/` 下的文件统一命名为 `*.gen.ts` 或 `*.gen.tsx`，并在 `biome.json` 里排除，沿用 `routeTree.gen.ts` 的先例。生成器的 `--check` 逐字节比对。
  - 不采用"生成后再跑 `biome format`"的做法，因为排除更简单，也不依赖格式化工具的版本。

---

### 阶段 0：决策记录、单一来源与目录整理

**目标**：把第 2 节的决定写成文档，让 `brand/` 目录可以追溯，并向设计方发出补件请求。这一阶段不改任何运行时代码。

**分两步做**
- **0a 文档草稿**：不用等任何决定，也不碰 `brand/` 目录。
- **0b 目录整理与交付物入库**：等 D18、D19 有了答复，并且用户明确同意处理 `brand/README.md` 之后再做。

**0a 的改动文件**
- `docs/brand-migration-plan.md`：本文件。
- `docs/brand-assets.md`：新增的 Reference 文档骨架。写清以下内容：
  - 单一来源
  - 交付文件到目标路径的映射（即本文 §6）
  - 尺寸规则：不低于 24px，mark-small 只用于 23px 以下
  - 令牌
  - 重新生成的命令
  - 保留清单
- `docs/adr/0027-…`：先写成"拟议"，用户决定后改为"已接受"。同时在 `docs/adr/README.md` 加一行索引。
- `docs/README.md`：在导航里加上本计划和 `brand-assets.md`。
- `AGENTS.md`：**等 ADR 0027 被接受后**，再加一个简短的「Brand identity contract」节，只写指针：
  - `docs/brand-assets.md` 和 ADR 0027 管品牌规则。
  - 品牌值只从 `brand/brand.json` 读取。
  - 公共品牌文件由 `brand:sync` 生成，禁止手工修改。
  - 保留清单见 ADR 0027。

  原稿把这一节放在阶段 0 无条件加入。现在改为等 ADR 接受，因为 AGENTS.md 只记录已经确定的规则。

**0b 的改动文件**
- `brand/README.md`：用户同意后，先把用户当前的版本原样另存为 `brand/LOGO-KIT.md`，再按 D19 重写。
- `brand/brand.json`：新增。
  - 初值等于现状：GATU、gatu.ai、旧颜色、`pwa_theme #0F1A1F`。
  - 另加一个 `logo` 段，写入套件的深浅两套颜色，以及 `icon_background #0A3038`。
  - `domains` 采用按组的结构，见阶段 7。
  - `brand/brand-info.yaml` 的内容迁进来后退役，或者只留一行说明，指向这个 JSON（D18）。
- `brand/tokens/sairn.tokens.json`：优先放设计方原件。拿不到原件时，放从 HTML 里提取的版本，并注明来源是 v1.3 HTML。
- `brand/loader/`：
  - 按 D19 只放设计产物。
  - 写 `brand/loader/README.md`，记录源 HTML 的 SHA-256、导出时间、浏览器和工具版本、导出步骤。
  - 导出步骤必须能复现：写一个仓库内的 Playwright 导出脚本（打开 HTML、触发导出、解压到 `brand/loader/`），或者把手工步骤写清楚。
  - 阶段 1b 的 `brand:check` 会校验 `brand/loader/` 里各文件和 README 记录的哈希一致。
- 交付物入库：
  - `brand/svg/**`、`brand/png/**`、`brand/web/**`、`brand/social/**`、`brand/ios|android|harmonyos/**`。
  - `.DS_Store` 已经被 `.gitignore:50` 忽略。
  - zip 移到 `brand/_source/`。
- 删除 `brand/logo/.gitkeep` 和 `brand/icons/.gitkeep`。

**不改的**：`apps/`、`packages/`、`deploy/`、`scripts/`、`.github/` 下的任何文件。

**验证**：`git diff --check`；检查链接和路径；运行三条 memory 命令。这一阶段只改了文字和素材，**不要声称运行过运行时测试**。

**提交**
1. `docs(brand): add brand migration plan and asset reference`（0a）
2. `chore(brand): add sairn logo kit v1.3 deliverables`（0b）
3. `chore(brand): add motion exports with provenance`（0b，等 D19 的许可结论）

每一步各开一个 PR 进 `dev`。

**设计方补件清单**：见附录 B。

---

### 阶段 1a：CI 覆盖、防静默失效与官网发布流程（零视觉变化，不依赖 D18）

**目标**：在任何可见改动之前，先把会静默失效的检查修好，让品牌相关的守卫真正在 CI 里运行，并让官网能按仓库里的流程发布。

**改动文件**

*CI*
- **新增 CI 步骤**：`terminal-tests.yml` 新增 "Test brand identity contracts" 步骤。
  - 列入 `pwa-manifest`、`network-storage`、`referral-join`、`referral`、`terms-content`、`legal-policy-contract`、`trading-agent-config`、`order-summary`、`twap-order-summary`。
  - `seo` 和 `document-title` 已经在其他步骤里（`terminal-tests.yml:66,119`），不重复列。
  - 以后各阶段新增的品牌相关测试也放进这一步，包括 `brand-logo`、品牌来源、目录、动效、分享卡、对比度契约。
- **路径过滤**：
  - `terminal-tests.yml`、`production-build.yml`：加 `brand/**`、`legal/**`，以及阶段 1b 新增的 `scripts/brand*.mjs`。
  - `static-checks.yml`：加 `brand/brand.json`。
  - `website-build.yml`：加 `brand/**`、`legal/**`、`apps/terminal/public/manifest.json`、`apps/terminal/public/robots.txt`、`apps/terminal/public/sitemap.xml`、`apps/terminal/src/config/**`。
- `scripts/ci-workflows.test.mjs`：把上面这些路径和测试固定下来。现有的一致性检查（第 98–121 行）要继续通过。
- 【推断】新增的路径只在 PR 改到这些文件时才触发，对 Actions 计费分钟的影响应该有限。这一点没有测算。

*防静默失效*
- **首页链接属性**：三个首页链接加 `data-brand-home-link` 属性：`trade/header/top-nav.tsx:136`、`trade/mobile/mobile-header.tsx:28`、`trade/mobile/mobile-nav-drawer.tsx:183`。`scripts/measure/measure-boot-timing.mjs:913` 改用这个属性选元素。
- **测试定位方式**：`top-nav.test.tsx:527,589`、`mobile-nav-drawer-navigation.test.tsx:198`、`mobile-header-brand.test.tsx:76` 改用 `[data-brand-home-link]` 定位，同时保留对可访问名称的断言。名称的值在阶段 1b 改为 `BRAND_NAME`。
- **启动占位**：`root-startup-fallback.test.tsx:61` 的禁止选择器加上 `svg, img, [role="img"]`，以守住 ADR 0010。
- **费用行断言**：`order-summary.test.tsx:82,122,150` 和 `twap-order-summary.test.tsx:61` 改用与品牌无关的正则 `/\b(gatu|sairn)\s+fee\b/i`。
- **邮箱断言**：`legal-policy-contract.test.ts:88` 改为不允许出现任何 `hi@` 邮箱，不再只查 `hi@gatu.ai`。
- **PWA manifest**：`pwa-manifest.test.ts` **保留** `#0F1A1F` 字面量断言。另外新增一条：manifest 的 `theme_color` 和 `background_color`，要等于 `apps/terminal/src/styles.css` 深色块（第 441 行）里的 `--bg-base`（第 450 行）。这样 §8 绑定的是画布令牌，而不是可以随手修改的数据源。
- **Agent 槽位回退值**：`trading-agent-config.test.ts` 新增断言 `APP_NAME === "gatu"`，失败信息指向 ADR 0027。

*官网发布流程入库*（这是批次 B 的前提）
- **发布手册**：新增 `deploy/website/README.md`。
  - 写清构建、同步、失效、验证和回滚的命令，发布身份用 `gatu-edge`。
  - 非哈希文件的缓存策略改为 `max-age=0, must-revalidate`（D20）。
  - 【未验证】桶 `gatu-dist-2026` 是否开启了版本控制。这决定了回滚方式是"重建上一版再同步"还是"恢复对象版本"。
- **重写函数**：`gatu-rewrite-index` 的源码入库并配测试。测试接入 `pnpm test:cloudfront`，或者新开一个脚本，并加入 CI。导出源码需要能读取这个函数的身份，`gatu-edge` 的策略不允许（§1.4 第 9 条），所以要由用户或运维执行。
- **官网 README**：`apps/website/README.md:16-37` 里的 Vercel 说明改成实际的部署方式。原稿安排在 7i，现在提前到这里。

**不改的**：任何可见的像素或文字、存储键、锁名、Agent 槽位、包名、环境变量、终端的部署配置。

**文档**：在 AGENTS.md 的 Verification 一节加一个 "Brand identity" 组，列出 `pnpm test:brand` 和上面 CI 品牌组里的测试，包括 `trading-agent-config`。`brand:check` 到阶段 1b 再补进去。

**测试与验证**
- 本地运行：
  - `pnpm exec biome check <改动文件>`
  - `pnpm --filter @gatu/terminal typecheck`
  - 改到的各个测试
  - `node --test scripts/ci-workflows.test.mjs`
  - 官网函数的测试
- 在 CI 里：新建的品牌组会运行上面那些测试。

**提交**
1. CI 品牌组和路径过滤
2. 防静默失效
3. 官网发布流程和函数源码

开一个 PR 进 `dev`。

**依赖**：不用等任何用户决定。函数源码要靠外部身份导出。

---

### 阶段 1b：单一来源接线（零视觉变化，依赖 D18）

**目标**：所有品牌值都改为从 `brand/brand.json` 读取，但值本身不变，所以对外呈现不变。核对方法见本节末尾。

**改动文件**

*脚本与校验*
- `scripts/brand.mjs`，不导入 zod，提供两个命令：
  - `brand:check`：检查各消费方和 JSON 一致，包括 manifest 的名称和颜色、`seo.ts`、`robots.txt` 和 `sitemap.xml` 里的 origin、官网的 `site`；检查 `brand/loader/` 的哈希。
  - `brand:sync`：先搭好复制框架，文件映射到阶段 2 才启用。
- 新增 `apps/terminal/src/lib/tests/brand-source.test.ts`：用 zod 校验 `brand.json` 的结构，并放进 CI 品牌组。
- `package.json`：新增 `brand:sync` 和 `brand:check` 两个脚本，并把 `brand:check` 加进 `test:brand`。

*终端*
- **新增 `apps/terminal/src/config/brand.ts`**：导入 `brand.json`，导出这些常量：
  - `BRAND_NAME`：初值 "GATU"
  - `BRAND_FILE_PREFIX`：取 `name.lowercase`，初值 "gatu"
  - `BRAND_DOMAINS`
  - `SUPPORT_EMAIL`
- **`config/build-meta.ts`**：
  - **`APP_NAME` 保持 `"gatu"`，也不从 `brand.json` 取值**。它只作为内部标识和 Agent 槽位的回退值（D9）。
  - 新增一条源码扫描断言：`build-meta.ts` 和 `trading-agent.ts` 不能导入 `brand.json`。
- **原来把 `APP_NAME` 当显示名用的地方**，改用新常量：
  - PnL 分享卡：
    - `position-pnl-share-modal.tsx:149,210` 改用 `BRAND_NAME`。初值 "GATU"，和现在的 `APP_NAME.toLocaleUpperCase()` 结果相同。
    - `:169` 的下载文件名改用 `BRAND_FILE_PREFIX`。初值 "gatu"，下载文件名不变。如果误用 `BRAND_NAME`，文件名会从 `gatu-…` 变成 `GATU-…`。
  - SEO：`config/seo.ts:4-13`。
  - 启动播报 5 处：`components/startup-fallback.tsx:4`、`trade/layout/desktop-terminal-surface.tsx:39`、`trade/layout/main-workspace.tsx:136`、`trade/mobile/mobile-terminal.tsx:45,102`。
    - 统一写成单个模板字符串表达式 ``{`Loading ${BRAND_NAME}...`}``。
    - 不要写成 `Loading {BRAND_NAME}...`。那样会产生三个相邻的文本节点，React 预渲染时会在它们之间插入 `<!-- -->`，壳的输出和 `trade-terminal-page-boot.test.tsx:438` 的断言都会变化【推断：这是 React 服务端渲染的已知行为，本仓库没有实测】。
    - `responsive-panel-layout.test.ts:133` 按源码字符串钉住了 `Loading GATU...`，它在 CI 的 "recent trade rendering contracts" 步骤里，要同步改成新的源码写法。
  - Logo 链接的 `aria-label` 3 处：`trade/header/top-nav.tsx:136`、`trade/mobile/mobile-header.tsx:28`、`trade/mobile/mobile-nav-drawer.tsx:183`。
- **`config/public-origins.ts`**：改成按组实现，暂时只有一组 `gatu`，`phase` 为 `serve`。规范主机名仍然**精确匹配**，对外行为不变。

*官网*
- `apps/website/astro.config.mjs:6` 和 `src/config/seo.ts:1-15` 改为从 JSON 取值。
- `Footer.astro:4,18`、`Hero.astro:2`、`Nav.astro:3` 里的 4 份 `appUrl` 字面量合并为一个导入。
- `layouts/Base.astro:68-69` 的 preconnect 地址取自配置。
- `Logo.astro:23` 的 alt 取自配置。

*跨应用测试*
- 扩展 `tests/brand-cross-app.test.mjs`，它用 node 运行，不用 zod。断言以下几处出现的域名和邮箱，都属于 `phase: serve` 的那一组，并且等于 JSON 里的值：
  - manifest、SEO、robots、sitemap
  - 官网的 `site` 和 `appUrl`
  - `legal/*.md`
- **同时保留与 JSON 无关的不变量断言**，不能只写"等于 JSON"。例如 manifest 主题色必须等于画布的 `--bg-base`（阶段 1a），品牌色的契约见阶段 6。

**不改的**：任何可见的像素或文字、存储键、锁名、Agent 槽位、包名、环境变量、部署配置。

**文档**：ADR 0027 的接线部分；在 `docs/brand-assets.md` 里写明消费方清单；在 AGENTS.md 的 "Brand identity" 组里补上 `brand:check`。

**测试与验证组**
- 基础检查：`pnpm exec biome check <改动文件>`、`pnpm --filter @gatu/terminal typecheck`、`pnpm test:brand`。
- 验证组：
  - Startup rendering 组。
  - Wallet signing, onboarding and connection UI 组，外加**单独列出**的 `trading-agent-config.test.ts`。这个测试不在该组的清单里，靠阶段 1a 加入了 CI 品牌组。
- 单独运行：`responsive-panel-layout.test.ts`（在 CI 里），以及 `brand-source.test.ts`、`network-storage.test.ts`、`referral-join.test.ts`、`referral.test.ts`、`seo.test.ts`、`document-title.test.tsx`、`terms-content.test.ts`、`legal-policy-contract.test.ts`。后面这些经阶段 1a 都已进入 CI。
- 其他：`node --test scripts/ci-workflows.test.mjs`；`pnpm --filter @gatu/website test` 和官网构建；`pnpm build`，检查包体预算。

**零视觉变化的核对方法**（取代原稿的逐字节比对）
- 【事实】逐字节比对做不到，原因有两个：
  - `_shell.html` 里有哈希化的 modulepreload 地址和带时间戳的路由状态，现有构建产物里就有 `u:1790251670187` 这样的值，所以逐字节比对不可能通过。
  - `data-brand-home-link` 加在页头上，而壳里只有 `StartupFallback`，所以在壳里看不到这个属性。
- 改为下面三步：
  1. 规范化后比对 `_shell.html`：去掉哈希文件名、路由状态和构建标识，然后比较 `<head>` 里的 title、meta、link 和启动播报的文本。期望没有差异。
  2. 官网 `dist` 也一样：去掉 `_astro/` 的哈希后比对 HTML 文本。期望没有差异。
  3. 用单测读取真实组件的文本和属性，与改动前的期望值逐项对比：页头 `aria-label`、启动播报、PnL 卡的品牌字样和下载文件名、manifest、SEO。

**提交**
1. JSON、脚本和结构校验测试
2. 终端消费方和相关测试
3. 官网消费方

开一个 PR 进 `dev`。

**依赖**：阶段 0b、阶段 1a；D18。

---

### 阶段 2：Logo、图标、manifest 与图表加载器

**目标**：把应用内外所有静态标识换成 Sairn 套件，并且不留下任何旧几何。显示名不在这一阶段改，放到阶段 5，两个阶段同属批次 B。

**使用的 `brand/` 素材**：
- `svg/*/sairn-*-{mono,on-light,on-dark,black,white}.svg`：生成几何模块，并校验路径一致。
- `svg/lockup|mark/*-on-dark.svg`、`*-on-light.svg`：官网和 Privy。
- `web/*`。
- `social/*-1024.png`。
- `loader/svg/<theme>/page-loading.svg`、`loader/sairn-motion.tokens.json`。

**改动文件**

*几何与组件*
- **几何模块**：`brand:sync` 生成 `apps/terminal/src/components/brand/brand-logo-geometry.gen.ts`。
  - **识别部件**：以 on-light 文件为准，按填充色识别 signal、choice 和字标。同时断言 mono 和其余四种颜色版本的路径 `d` 值逐条相同。修订时已经核对过，当前交付物满足这一点。以后设计方调整了路径顺序，这条断言会报错，两种颜色不会悄悄对调。`brand:check` 也包含这条断言。
  - **横版组合**：要用横版文件自己的标志路径，因为它的坐标和独立 mark 不同。字标路径可以和 wordmark 共用。
  - **生成文件规则**：在 `biome.json` 里排除这个文件（§3.0）；文件头注明"由 `pnpm brand:sync` 生成"；`brand:check` 逐字节比对。
- **新增 `brand-logo.tsx`**：
  - 组件名 `BrandLogo`，变体有 `lockup | mark | mark-small | wordmark`。原来的 `micro` 改叫 `mark-small`。
  - 纯 SVG，不用 hook，只靠 props，符合 `.claude/rules/startup-rendering.md` 对视图的要求。
  - SVG 设 `aria-hidden="true"` 和 `focusable="false"`，不输出 `<title>`，标记属性为 `data-brand-logo`。
  - 颜色写成 `var(--logo-signal|--logo-choice|--logo-wordmark, currentColor)`。
- **删除旧文件**：`gatu-logo.tsx` 和 `GATU_MARK_PATH` 放在第 2 个提交里删除，见本节"提交"。

*图表加载器*
- **新组件**：`components/brand/gatu-orbit-loader.tsx` 换成 `brand-page-loader.tsx`，实现 `page-loading` 动效：
  - 两块面板交替改变透明度，周期 2000ms，缓动 `ease-in-out`。
  - 最暗一帧的透明度：深色 0.55，浅色 0.78。
  - 开启减少动态效果时，显示完整的静态标志。
- **实现方式**：只有这一种动效，所以手工移植，以导出的 SVG 和 tokens 为依据，不在运行时引入 `sairn-motion.js`。
- **CSS**：替换 `styles.css:923-956` 里的 `.gatu-orbit-loader__*`，新样式放在 `@layer components` 里。
- **图表接入**：
  - `trade/chart/tradingview-chart.tsx:1617` 改为 48px（D12a）。
  - 遮罩继续放在宿主页面，不放进 iframe（runtime-guardrails §4）。"重建一开始就完全不透明"的规则不变。
  - 标记属性改为 `data-brand-loader`。

*令牌*
- `apps/terminal/src/styles.css` 新增：
  - `:root`（约第 278 行）：`--logo-signal:#176b64; --logo-choice:#99621f; --logo-wordmark:#08262e`
  - `.dark`（约第 472 行）：`#86e5d3 / #e6b766 / #ffffff`
- 旧的 `--logo-ink` 和 `--logo-node` 在第 2 个提交里删除，涉及 `styles.css:278-279,472-473` 和官网 `global.css:72-73`。

*使用方*
- `top-nav-view.tsx:42,44`：`TOP_NAV_WORDMARK_CLASS` 改为 `h-6 w-auto`；紧凑态改用完整标志，同样是 `h-6 w-auto`。
- `mobile-header.tsx:29`：完整标志 `h-6 w-auto`，仍放在 44px 的触控区域里。
- `mobile-nav-drawer.tsx:186`：`h-6`。

*静态文件*（`brand:sync` 在这一阶段启用文件映射，见 §6）
- favicon、apple-touch、icon-192/512、maskable-512 直接复制。
- `icon-maskable-192.png`：用设计方补交的文件。拿不到时，由 `scripts/brand.mjs` 用 Chromium canvas 从 512 版缩放（D7），再交设计方过目。
- `icon.svg`：按 D7 从 manifest 里删除。

*manifest 与 head*
- `apps/terminal/public/manifest.json`：
  - 图标列表按 D7 更新：`favicon.ico` 的 `sizes` 改为 `16x16 32x32 48x48`，删掉 `icon.svg`。
  - 加 `"id": "/"`。【推断】不写 `id` 时，浏览器会用 `start_url "/"` 推导出同一个 id，所以加上它不会改变已安装 PWA 的身份。
  - 不写 `lang`；`src` 保持相对路径；`theme_color` 和 `background_color` 保持 `#0F1A1F`（D5）。
  - `name` 留到阶段 5 再改。
- `apps/terminal/src/lib/seo.ts:64`：ICO 的 `sizes` 改为 `16x16 32x32 48x48`。

*Privy 登录窗口*（D24 选 B 时）
- 在 `config/privy.ts:14-23` 的 `PRIVY_APPEARANCE_BY_THEME` 里按主题加上 `logo`。
- 取值有两种：
  - 同源 URL：例如由 `brand:sync` 复制的 `apps/terminal/public/brand-lockup-on-dark.svg` 和 `-on-light.svg`。现行 CSP 的 `img-src` 已经包含 `'self'`（`config/security-headers.ts:87`）。
  - React 元素。
- 约束：ADR 0026。

*官网*
- **Logo**：线上的 `logo.svg` 一直按 immutable 缓存（§1.4 第 9 条），所以不能原地替换。
  - 改由 `Logo.astro` 通过 Astro 资源管线导入 `sairn-lockup-on-dark.svg` 和 `sairn-mark-on-dark.svg`，构建产物带哈希文件名。
  - 做不到的话，就换成带版本号的中性文件名。【推断】具体做法在实施时确认。
  - 官网只有深色主题，见 `Base.astro:21`。
- **尺寸**：`Logo.astro:9-23` 的宽高按新比例修改。24px 高时，横版约 90.5×24，标志约 18×24。
- **结构化数据用图**：`public/gatu-logo-1024.png` 换成 `logo-1024.png`（D20），同时修改 `config/seo.ts:14`。JSON-LD（`lib/seo.ts:80,142-145`）会随之更新。
- **head**：
  - `Base.astro:25-29` 里 ICO 的 `sizes` 同步修改。
  - `favicon.svg` 的链接加版本参数，例如 `?v=…`。
- **清理**：删除不再被引用的旧文件。

**不改的**
- `--signal`、`--action`、`--focus` 和背景色（阶段 6）
- OG 卡（阶段 4a）
- 所有文案和 `name`（阶段 5）
- 状态动效（阶段 3）
- TradingView iframe 的样式表

**文档**
- `docs/brand-assets.md`：组件、尺寸、令牌。
- `.claude/rules/design-tokens.md`：按清单第 5 步登记 logo 令牌。
- `docs/runtime-guardrails.md`：§8 记图标和 ICO 尺寸；§11 记导航余量的证据；D24 选 B 时，§1 记 Privy logo。
- ADR 0027 的 Logo 令牌一段。
- `CHANGELOG.md`。

如果实测余量不够、要改窄屏阈值：先改 `DESKTOP_NAV_NARROW_MAX_PX` 和 §11，再在 ADR 0013 追加更正，引用 ADR 0021 D8 的先例。原稿把这件事指向 `docs/desktop-grid-layout.md`，那份文档不管导航，已改正。

**测试**
- **`brand-logo.test.tsx`（新）**：
  - 断言几何路径等于 `brand/svg` 原文件、标记里没有十六进制颜色、没有 `<title>`、设置了 `aria-hidden`。
  - 第 1 个提交加入这个测试，并登记到 `package.json` 的 `test:brand` 和 `terminal-tests.yml` 的品牌步骤。
  - 第 2 个提交删除 `gatu-logo.test.tsx` 及其两处登记。
  - 两个提交都要让 `scripts/ci-workflows.test.mjs:116-120` 的一致性检查通过。
- **`brand-semantics-contract.test.ts:22-50`**：logo 令牌等于 `brand.json` 中的值，并检查加载器的 CSS 类名。
- **`mobile-header-brand.test.tsx:76-83`**：选择器改为 `[data-brand-logo="mark"]`，检查尺寸类名，不再检查 `stroke-width`。
- **`tradingview-chart.test.tsx:423-425,1757,1797,1845`**：改为检查 `data-brand-loader`。这个测试经由 `tradingview-*` glob 在 CI 里运行。
- **`pwa-manifest.test.ts`、`seo.test.ts:81-86`**：更新图标列表，`#0F1A1F` 的字面量断言保留。
- **`apps/website/tests/brand-contract.test.mjs:12-17`**：删掉 logo 变量的断言，新增"官网用的 Logo 文件等于 brand 源文件"。
- **`brand:check`**：
  - 检查派生图的尺寸，以及 maskable 图不透明、主体在安全区内（离中心不超过 40%）。像素检查用 Chromium canvas 做，不引入 sharp。
  - 检查几何生成的路径一致性。
- **加载器**：减少动态效果下的测试。
- **D24 选 B 时**：跑 `privy-config`、`privy-theme-switch-wallet-stability`、`client-root-theme-lifecycle`。这三项都在 CI 的 "Privy theme and wallet identity" 步骤里。

**验证组**
- 本地运行：
  - Startup rendering 组：`top-nav`、`desktop-nav-layout`、`mobile-nav-drawer*`、`root-startup-fallback`、`trade-terminal-page-boot`。
  - Trading terminal visual contract 组：`tradingview-chart`、`chart-theme-colors`。
  - `pwa-install`（不在 CI 里）、`pwa-manifest`。
  - `pnpm test:brand`。
  - 官网测试和构建。
- `pnpm build`：检查包体预算。内联的横版字标约 1.9 KB（未压缩），会进入首屏的 TopNav 块。
- `apps/terminal/tests/browser/boot-milestones.mjs`。
- 原稿列入的 `docs/desktop-grid-layout.md` 布局套件都不挂载 `TopNav`，证明不了导航余量，不再作为本阶段的证据。

**导航余量实测**（D6，按 `docs/runtime-guardrails.md` §11 的方法）
- **宽度**：1440、1300、1182、1181、1151、1150、1101、1001px。宽度不写死，从 `config/layout.ts` 读取常量。1182 是已连接时不收纳的最窄宽度，1151 是未连接时不收纳的最窄宽度。
- **语言**：en、zh、hi、es、fr、ar。
- **状态**：已连接和未连接。§11 从没测过已连接状态。要测它，需要新写一个浏览器夹具：挂载真实的 `TopNav`，用替身提供钱包会话。仓库里现在没有这样的夹具。也可以用真实账户手工测量。
- **测量**：量导航最后一项到右侧控件的距离。结果写回 §11 的 Evidence，注明日期、构建类型和工具。

**浏览器与视觉检查**（写明用的是哪种输入方式和环境）
- 移动端 375 和 390：页头和抽屉。
- 深浅两种主题；开启减少动态效果时的图表加载器。
- 官网 1440 和 375，并用 HEAD 请求确认新路径已经生效。
- favicon：在 Chrome、Safari、Firefox 的标签页上看，系统分别处于浅色和深色时的样子。
- 真机：Android 安装时的 maskable 图标预览；iOS 添加到主屏幕。

**提交**（每个提交都要能单独通过 typecheck 和 `test:brand`）
1. 生成几何模块，新增 `BrandLogo` 和新的 logo 令牌（旧令牌暂时保留），页头三处改用 `BrandLogo`。`gatu-logo.tsx` 暂时留给旧加载器使用。
2. 图表加载器换成 `BrandPageLoader`，然后删除 `gatu-logo.tsx`、`GATU_MARK_PATH`、`--logo-ink`、`--logo-node` 和 `.gatu-orbit-loader__*`。
3. 静态图标、manifest 和 head，以及 D24 选 B 时的 Privy logo。
4. 官网。

这些提交进入集成分支（D21）。

**依赖**：阶段 1b；D5、D6、D7、D12a、D15、D20、D22、D24。几何生成可以在这些决定之前先做。

---

### 阶段 3：状态动效

**目标**：在**允许**品牌化的加载和状态位置用上 Sairn 动效。不新增被动提示，不违反确认面契约。当前的状态图标是和品牌无关的 Phosphor 图标，所以这一阶段可以在批次 B 之后再做。

**使用的 `brand/` 素材**：`loader/**`、`tokens/sairn.tokens.json`。生成器的前提是 D19 已经把许可说清楚，并且设计方交了源码（`lib/catalog` 和 tokens）。补齐的三个符号也要用到。

**改动文件**
1. **第一个提交，不改外观**：给现有的转圈加上 `data-loading-indicator` 属性，并把下面这些测试从 `.animate-spin` 改为检查这个属性：
   - `account-mode-modal.test.tsx:137`
   - `desktop-orders-cancel-all.test.tsx:470`
   - `funds-action-balances.test.tsx:770`
   - `global-modals-hip3-disclaimer.test.tsx:398`
   - `leverage-modal.test.tsx:291`
   - `margin-mode-modal.test.tsx:629`
   - `withdraw-form-ui.test.tsx:205`
   - `footer-bar.test.tsx:80`（正向断言）

   其中 `global-modals-hip3-disclaimer`、`withdraw-form-ui`、`footer-bar` 目前不在 CI 里，要一并加入阶段 1a 建的品牌组。
2. **生成器** `scripts/generate-motion-components.mjs`，支持 `--check`：
   - **输入**：只能是已入库、权属清楚的产物，也就是 `brand/loader/` 下的 SVG 和 tokens，或设计方交来的 catalog 源码。不能读被 Git 忽略的 `brand/_source/`，因为 CI 拿不到那里的文件。输入缺失时，`--check` 必须报错，不能静默跳过。
   - **输出**：`apps/terminal/src/components/brand/motion/*.gen.tsx`，以及 `styles.css` 里 `@layer components` 的一段。`styles.css` 本来就在 biome 的排除范围里。
   - 调色板全部用 CSS 变量。去掉 `<title>`。图形设 `aria-hidden`，读屏文字由调用方通过 Lingui 传入。
   - 生成器接入 `test:brand`。
   - 【事实，有范围】已验证两点：
     - 给 `CATALOG[i].body(palette)` 传入变量调色板后，十六进制颜色残留为 0。
     - 开启减少动态效果时，正在运行的动画为 0，并且显示终态。
     - 验证范围：用的是 scratchpad 里的动效库导出物，再加一条从 `styles.css:913-917` 抄来的全局减少动态效果规则，在 Playwright 无头 Chromium 里跑。验证的对象不是生成后的组件，也不是真实的应用页面。所以生成后还要对组件重新验证。
3. **订单通知** `trade/tradebox/order-toast.tsx:46,66-70`，映射如下：
   - pending → submitting
   - confirming → pending 符号
   - unconfirmed → unknown
   - failed → error
   - success → success，文案继续区分"已受理"和"已成交"
   - partial、canceled 按 D12c、D12d 处理
4. **Sonner** `ui/sonner.tsx:45-51`：三个缺失的符号补齐之后，整组一起替换（D12c）。
5. **握手按钮**，改用 16px 的 button-loading：
   - `trading-action-button.tsx:85-88`
   - `trade-panel.tsx:912`（只在 isRegistering 时）
   - `establish-connection-modal.tsx:221,236,242`
   - `wallet-modal.tsx:198,275`
   - `deposit/shared-ui.tsx:134`
   - `wrong-network-screen.tsx:60`
6. **状态页**，插图改为 64px：`deposit/shared-ui.tsx:66-90`、`vaults/vault-action-modal.tsx:224`、`api-wallet-action-modal.tsx:227-236,352`。
7. **复制反馈**：`referral-code-card.tsx:174,192`、`user-menu.tsx:235-236`、`api-wallet-copy-button.tsx:35-53`、`market-overview.tsx:355`。

**明确不改的**
- `StartupFallback` 和工作区的 busy 态：ADR 0010；`docs/architecture/hyperliquid-first-load-investigation.md:369`。
- 交易和资金确认弹层里的确认控件：`docs/confirmation-surfaces.md`、AGENTS「Confirmation surface contract」。
- 被动指示：页脚的"连接中"、账户模式加载、手机订单簿蒙层、平仓弹层里的仓位加载、"Refreshing…"（`docs/mobile-data-presentation.md`）。
- 骨架屏（D12g）。
- CSV 导出进度：拿不到真实的分母，而动效库禁止模拟进度。
- 保证金率和 TWAP 的计量条。
- 订单行。
- 手机下单主按钮（D12j）。
- TradingView iframe 内部。

**文档**
- ADR 0029。
- `docs/trading-notifications.md`：通知图标对应表。
- `docs/confirmation-surfaces.md`：哪些按钮允许用 button-loading。
- `docs/mobile-data-presentation.md`：写明不新增被动提示类别。
- `.claude/rules/design-tokens.md`：如果新增了 motion 变量。
- `docs/brand-assets.md`。
- `CHANGELOG.md`。

**测试**
- 生成器 `--check`，包括输入缺失时报错。
- 每个动效组件：没有十六进制颜色、没有 `<title>`、开启减少动态效果时显示终态。
- 订单通知的映射：unknown 不能显示成 error；"已受理"的文案不能和"已成交"相同。
- Sonner 图标。
- 以上都加入 CI 品牌组。

**验证组**
- Confirmation surfaces 组（完整列表）。
- Mobile data presentation 组。
- Runtime translation contract 组。注意 `i18n-reactivity-contract` 和 `i18n-hot-switch` 只在本地跑。
- Startup rendering 组。
- 改动跨了多个契约，所以还要跑全量的 `pnpm --filter @gatu/terminal test`。
- 最后用 `pnpm build` 检查预算：`sonner.tsx` 在公共模块里，`tradingview-chart.tsx` 在桌面运行时的预算闭包里。

**浏览器与视觉检查**：上面每个位置都要在以下条件下看一遍：深浅两种主题、桌面和移动端、减少动态效果。【未验证】Safari 对展示属性里的 `var()`、对进度条 `width` 过渡的支持，必须实测。

**提交**：改动文件里的第 1 到第 7 项各自一个提交。可以在批次 B 之后单独开 PR 进 `dev`。

**依赖**：阶段 2；D11、D12、D19；设计方源码。原稿在这里还列了 D10，它和动效无关，已删除。

---

### 阶段 4a：OG 卡

**目标**：把两张 1200×630 的链接预览卡换成 Sairn 版，两张必须不同，CI 校验要稳定。

**使用的素材**
- 方案 A：`brand/share-cards/og/og-terminal.png`、`og-website.png`，目前尚未交付。
- 方案 B：`brand/svg/lockup/sairn-lockup-on-dark.svg`，加上套件颜色。

**改动文件**
- **方案 A**：
  - `scripts/generate-og-cards.mjs` 改为"复制并校验"：检查尺寸为 1200×630、不透明、两张不同、哈希和 `designs/og-cards/output-manifest.json` 一致。
  - `cards.html` 和字体退役，同时更新 `designs/og-cards/README.md`。
- **方案 B**：
  - 重写 `designs/og-cards/cards.html:283-327`：底色 `#0A3038`，signal `#86E5D3`，choice `#E6B766`。
  - 继续用仓库自带的 OFL 字体：重新生成 Noto Sans SC 子集，更新 `font-sources.json`，同时修改 `generate-og-cards.mjs:175-192` 里写死的字体族名和样字。
  - 运行 `pnpm og:generate`。
- **两种方案都要改的**：文件名换成带版本号的中性名称（D14），因为官网线上的同名文件按 immutable 缓存（§1.4 第 9 条）。下面几处要同步修改：
  - `apps/terminal/src/config/seo.ts:9`（`ogImagePath`、`ogImageAlt`）
  - 官网 `src/config/seo.ts`
  - `seo.test.ts:39`
  - `tests/brand-cross-app.test.mjs:23-33`
  - `apps/website/tests/brand-contract.test.mjs:41-46`
  - `.github/workflows/website-build.yml:14`
  - `scripts/ci-workflows.test.mjs:100-115`

**不改的**：不用 Studio 的 landscape 版式出 OG；卡面不印域名。

**验证**
- 运行 `pnpm og:check`、`node --test tests/brand-cross-app.test.mjs`、官网测试和 `seo.test.ts`。
- 确认 CI 的 website-build 在 ubuntu 上通过。
- 发布后，到各平台的调试工具里重新抓取。这是外部操作，见 §4。

**依赖**：D14；方案 A 要等设计方的 PNG，方案 B 要等阶段 2。**属于批次 B，必须有。**

---

### 阶段 4b：PnL 分享卡

**目标**：用 Sairn 视觉重做持仓 PnL 卡，同时满足数字格式、i18n 和 Big.js 三条契约。

**使用的素材**：Studio 的 `trade` 模板只作视觉参考；`brand/share-cards/pnl/` 的标注稿目前缺失；`BrandLogo` 的几何。

**改动文件**
1. **第一个提交，不改外观，可以先做**：
   - 弹窗改用 `createRetryableLazyComponent`（`lib/lazy.ts:67`）加 `LazyDialogHost`（`components/ui/lazy-dialog-host.tsx:9`），在分享按钮获得 pointer 或 focus 时预热。
   - 不能用 `createLazyComponent`：交易页持有下单草稿，chunk 缺失时它会整页刷新，草稿就丢了（style-ui-guide 的 Dialog transitions 一节）。
   - 同步修改：
     - `vi.mock` 的路径：`i18n-hot-switch.test.tsx:152`、`desktop-positions-readiness.test.tsx:43`。
     - 浏览器夹具里的桩：`apps/terminal/tests/browser/position-close-all.browser.tsx:220`。
     - 如果路径变了，还要改契约登记表：`action-progress-label-contract.test.ts:40`、`dialog-dismiss-control-contract.test.ts:40-42`、`i18n-reactivity-contract.test.ts:57`。
   - 【推断】桌面运行时的包体预计净减约 7 KB（gzip）。
2. **渲染器** `apps/terminal/src/lib/share-card/`：用 TypeScript 重写 `trade` 模板的一个子集。
   - 只接收已经格式化好的字符串（来自 `lib/format.ts`）、已翻译的标签和书写方向（支持 RTL）。
   - 需要计算的值用 Big.js，在 lib 里算好。
   - 文字放不下时，缩小字号、加省略号，或按优先级隐藏可选行，**不能拒绝导出**。
   - 二维码复用现有依赖 `qrcode`（`apps/terminal/package.json:59`），用 `create(url,{errorCorrectionLevel:"M"}).modules` 取点阵。**不复制** Studio 内置的 QR 代码，这样就没有 Apache 和 MIT 的声明义务。
   - 测试网标签要留出位置，需要设计。
   - 尽量不用 `Intl.Segmenter`。必须用时，经 `lib/format.ts` 调用，并按 `locale-format-contract` 登记。
3. **弹窗**：
   - 预览改为用 `<img>` 显示同一段 SVG，取代 `position-pnl-share-modal.tsx:192-292` 那套单独的 DOM 卡片。
   - 导出改为 SVG → canvas → PNG。
   - **只删除卡片画布专用的令牌**：profit、loss、long、short、divider、muted，以及只给画布用的 card。弹窗里的操作按钮（保存、复制、关闭，`position-pnl-share-modal.tsx:300-322`）还在用 `position-share-fg`、`-card`、`-button-hover`、`-hover`、`-outline`。这些按钮改用 `trading-panel` 或 `market-close` 的共享令牌，或者保留这几个令牌。
   - `apps/terminal/tests/browser/font-migration-pairs.ts:64-69` 里引用的旧类名是历史对照数据，要么标为历史，要么删除对应条目。
   - 按实际删除的个数下调 `design-token-ratchet` 的基线。
4. **必须保留的**：`capturedAtMs`、`useNumberFormatRevision`、测试网不生成链接、`createPositionPnlShareData` 只在数据完整时返回、二维码 URL 的生成方式。

**不改的**：其余五种模板；Studio 的 localStorage 草稿机制；`APP_NAME`。没有批准就不加营销标题文案。

**文档**：新增 `docs/pnl-share-card.md`；ADR 0030；`docs/trading-toolbar-redesign.md:145`；`docs/neutral-surface-audit.md:124`；`CHANGELOG.md`。

**测试**
- `position-pnl-share.test.ts`、`position-pnl-share-modal.test.tsx`。这两个目前都不在 CI 里，要加入 CI 品牌组。
- 新的渲染器测试：字段映射、RTL 的 `direction`、溢出降级、测试网不出二维码。
- `locale-format-contract`、`i18n-reactivity-contract`。
- 一个 Playwright 夹具，覆盖：深浅两种外观 × en、zh、ar 三种语言 × `en-US`、`de-DE` 两种数字格式。

**验证组**：Number and date formatting 组、Runtime translation contract 组、Confirmation surfaces 组（弹层契约）、Desktop trading layout and order entry 组、包体预算。

**真机验证**：在 iOS Safari 和 Android 上走一遍系统分享面板，验证 SVG → canvas 的解码，并记录输入方式。

**依赖**：D13、D1、阶段 2、设计方标注稿。默认排在批次 B 之后。在那之前，旧卡片上的品牌字样经阶段 1b 接线后读取 `BRAND_NAME`。

---

### 阶段 5a：用户可见名称、i18n、官网文案、现行文档

**目标**：把显示名统一改成 D1 定下的写法，并把翻译完整迁移过去。

**改动文件**

*名称值*
- `brand/brand.json`：`name.display` 改为 `Sairn`，`name.lowercase` 改为 `sairn`。`name.lowercase` 只用于文件名，**不是** Agent 槽位。
- 阶段 1b 已经接好线，所以下面这些会自动生效：SEO 标题、`document-title`、启动播报 `Loading Sairn...`、`aria-label`、PnL 卡的品牌字样和下载文件名。
- `manifest.json` 的 `name` 和 `short_name` 改掉。

*规则与测试*
- `.claude/rules/startup-rendering.md:5` 改写。ADR 0010 第 17 行**追加**更正说明，不改写原文。
- 测试：
  - `root-route-transition.test.tsx:315`、`trade-terminal-page-boot.test.tsx:438`：渲染输出变为 `Loading Sairn...`。
  - `seo.test.ts:34-52`、`document-title.test.tsx:65-123`、`pwa-manifest.test.ts:30-31`、`position-pnl-share.test.ts:37`。
  - `responsive-panel-layout.test.ts:133` 固定的是源码写法，阶段 1b 已经改过，这里不用再动。

*Lingui*
- **品牌占位变量**：8 条非法律的 msgid 改用品牌占位变量，例如 msgid 写成 `Install {brandName}`，以后再改名就不用再动目录。占位符的写法要先用宏实测：此前移动配对工作中遇到过 Lingui `t` 宏传参不符合预期的问题（来源是会话外的个人笔记，仓库里没有记录）。涉及：
  - `use-email-wallet-export.ts:52`
  - `api-wallet-credential-box.tsx:87`
  - `api-wallet-view.tsx:170`
  - `referral-code-card.tsx:180`
  - `wallet-modal.tsx:149,163`
  - `mobile-agent-sync-modal.tsx:176`
  - `mobile-agent-qr-scanner.tsx:188`
- **迁移翻译**：然后**只跑一次** `pnpm i18n:extract`，人工把 5 种语言的旧译文迁到新条目，顺手补上 ar、es、fr、hi 里缺的那一条，再运行 `pnpm i18n:compile`。
- **新增目录测试**，并加入 CI 品牌组：
  - 在用的 msgid 和 msgstr 里不能出现 `/gatu/i`；新条目在所有语言里都不能为空。
  - **待办例外**：法律确认弹窗的两条 msgid，对应 `legal-acceptance-modal.tsx:182,218`，也就是 `messages.po:4047,4059`。例外要写明理由"等法律审阅（D16、阶段 5b）"和个数（每种语言 2 条）。
  - 按 style-ui-guide「Checking a visual rule」的做法，例外不再命中时测试也要失败。阶段 5b 落地时删掉这个例外。
  - 如果没有这个例外，新测试一合入就是红的。

*路由与官网*
- 路由 head：`routes/join.$code.tsx:21-22`，以及 `routes/{cookies,docs,privacy,risk,support,terms}.tsx:13`。
- 官网：
  - `src/config/seo.ts:2-14,43`（标语按 D20 定）
  - `Footer.astro:108`、`Hero.astro:77,86`、`faq.ts:3`、`pages/*.astro:10`、`content/blog/welcome.md:2`
- 官网截图 `public/app-desktop.jpeg`、`app-mobile.jpeg`：等阶段 2 和阶段 6 定稿后重拍，用新文件名。

*现行文档*
- 要改的范围：
  - `AGENTS.md` 和 `agent.md` 的标题与第 1 行
  - 根目录 `README.md`、`apps/*/README.md`
  - `docs/` 下现行文档里的品牌词，约 44 个文件
  - `docs/runtime-guardrails.md:131`
- 只改品牌词，不改命令、包名、域名和路径。
- 顺手清掉 HyperTerminal 残留：`.claude/rules/ui-library.md:1`、`styles.css:83,85,154,353,547,807,868`、`packages/ui/src/globals.css:4`、`features/color-system.md:15`。

*历史记录（D10）*
- ADR 0027 和 `docs/work-memory/README.md` 各加一份名称对照："gatu 是 Sairn 的旧名；以下标识符保留不变……"
- 如果选 B′，替换 `research/` 下纯文字的品牌词。

**不改的**：D8 和 D9 列出的所有保留项；域名和邮箱（阶段 7）；`legal/` 和法律确认弹窗的两条 msgid（阶段 5b）。

**文档**：在 `docs/i18n-presentation.md` 里加上品牌占位符的规则；`CHANGELOG.md`。

**验证**
- Runtime translation contract 组、Startup rendering 组。
- Wallet signing 组，外加**单独列出**的 `trading-agent-config.test.ts`，用来证明 `APP_NAME` 和 Agent 槽位都没变。
- 上面列出的各项测试，并注明哪些在 CI 里跑。
- `pnpm i18n:extract` 之后没有差异，这是 `static-checks.yml:53-61` 的要求。
- 全量 `pnpm --filter @gatu/terminal test`。
- `pnpm build`，它会校验目录哈希。

**人工检查**
- 在浏览器里依次切到 zh、es、fr、hi、ar，确认翻译真的加载出来了，没有整体静默退回英文。
- 截图核对钱包弹窗的安装文案、推荐卡、API 钱包页；在无障碍树里看启动播报。
- 跑一遍 §7 的残留检索。

**提交**
1. `brand.json` 的名称切换，加上规则和测试
2. Lingui 消息和目录
3. 路由 head
4. 官网文案和截图
5. 现行文档

这些提交进入集成分支。

### 阶段 5b：法律文本

- **前提**：D16 的法律审阅已经通过。如果审阅要求用户重新接受条款，先完成 D16 写的门控设计和 ADR。
- **改动**：
  - `legal/*.md`：76 处，分布在 7 个文件，包括 `legal/terms.md:9` 和 `legal/README.md:32` 里的 "Gatu Corp."。
  - 更新 Last Updated。
  - 检查两条渲染路径：终端的 `?raw`，官网的 `content.config.ts:16-23`。
  - 法律确认弹窗的两条 msgid（`legal-acceptance-modal.tsx:182,218`），同时删掉阶段 5a 目录测试里的待办例外。
- **测试**：`terms-content.test.ts:10-15`、`legal-policy-contract.test.ts:35-88`。阶段 1a 已经把它们加入 CI，并且 `legal/**` 已经进了各工作流的路径过滤。
- **域名和邮箱**：如果 D2 到这时已经确定，可以并到阶段 7f 一起送审，避免审两次。

---

### 阶段 6：品牌色令牌（仅当 D4 选 b1 或 b2）

**目标**：把强调色换成品牌青和薄荷色，同时守住对比度和交易语义。

**改动文件**
- **前置步骤**：把 10 个 `text-signal` 等待转圈改用中性令牌（D4d）。
  - 已知位置有 `order-toast.tsx:67`、`global-modals.tsx:300`、`tradingview-chart.tsx:1615,1634`、`lazy-dialog-boundary.tsx:38` 等，完整清单要用 grep 重新统计。
  - 已经在阶段 3 里替换过的不用再改。
- **三份 CSS 改值**：
  - `packages/ui/src/globals.css:136,139,234`，以及对应的 hover 和 soft
  - `apps/terminal/src/styles.css` 里对应的覆盖值
  - `apps/website/src/styles/global.css:64-73`
- **值**：
  - `--signal`：深色 `#86e5d3`，浅色 `#176b64`
  - hover：按 D4c
  - soft：深色 `rgb(134 229 211 / 14%)`，浅色 `rgb(23 107 100 / 10%)`
  - `--focus`：按 D4b
- **其他位置**：`lib/bootstrap-error-page.ts:43` 的按钮底色；`brand/brand.json` 的 colors 段。
- **焦点环审查**：偏移为 0 或向内偏移的焦点环要逐个检查，包括 11 处 `outline-offset-[-2px]`、1 处 `offset-0`、2 处 `-outline-offset-2`。浅色下，青色紧贴 `#15171E` 时对比度只有 2.83:1。
- **只有选 b2 才做**：`--action` 的三态色、`config/privy.ts:14-23` 的 `accentColor`、`privy-config.test.ts:26-33`、`connect-cta-state-contract`。

**不改的**：背景 `#0F1A1F`、浮层 `#212d33`、遮罩 `#03090ca8`、网格 `#1b2429`、仪表盘画布 `#04251f`、TradingView 的两份样式表、`--orderbook-*`、`market-up/down`、`--chart-accent`。

**文档**
- ADR 0028。
- `.claude/rules/design-tokens.md`：补上目前缺的 signal、action、focus、logo 的角色说明和色相规则。
- 如有必要，在 `.claude/rules/style-ui-guide.md` 加焦点环规则。
- `CHANGELOG.md`。
- AGENTS.md 的「Trading terminal visual contract」不用改，因为背景不变。

**测试**
- **要修改的**：
  - `brand-semantics-contract.test.ts:11-20`
  - 官网 `brand-contract.test.mjs:12-21`
  - `brand-cross-app.test.mjs:11-21`：扩展为三份 CSS 都要和 `brand.json` 比对。目前官网不在跨应用测试的覆盖范围内。
  - `bootstrap-error-page.test.ts:39`
  - `trading-panel-theme-contract.test.ts:39-43,97-101,135`
  - `hip3-deployer-disclaimer.test.tsx:119-120`
  - `design-token-ratchet`
- **新增契约测试**：
  - 写法按 style-ui-guide「Checking a visual rule」：例外要列出理由和次数，并用改样式的办法验证测试真的会失败。
  - 断言用独立的数值下限，不写成"等于 JSON"：
    - signal 对每个表面令牌不低于 4.5:1
    - focus 不低于 3:1
    - signal 与 `market-up/down`、`scope-*` 之间的 ΔE2000 有下限，待定例外按 D4e 登记

**验证组**
- Trading terminal visual contract 组。
- Order book 组：用来证明订单簿没有受影响，要**实际运行** `orderbook-color-contrast`。这个测试目前不在 CI 里，在本阶段加入 CI 品牌组。
- `pnpm test:brand`、typecheck、biome。

**视觉检查**
- 检查对象：链接、焦点环、徽章、提示框、选中高亮，选 b2 时还有 Connect 按钮。焦点环要用键盘 Tab 走一遍页头、下单表单和弹窗。
- 覆盖范围：桌面、紧凑、移动三档，深浅两种主题。官网也要看。

**依赖**：D4、D5。可以和阶段 2–5 并行。如果选了 b1，就纳入批次 B，避免生产环境出现"荧光绿界面配青色 logo"的过渡期。

---

### 阶段 7：域名切换

**目标**：从 `gatu.ai` 迁到新域名，过程中满足四条要求：
- 服务不中断。
- 推荐链接和网络判定不失效。
- 老用户不会被困在旧版本上。
- 正在提交的页面不会被强制带走。

**先写进 ADR 0031 的前提**
- 换 origin 等于让 §1.4 第 5 条列出的本地守卫全部失效。新旧并存期间，两边的锁互相看不见。
- 外部钱包用户如果在两个域名上分别授权，同名 Agent 会互相顶掉（D9）。
- kill-switch 不主动导航（D17）。迁移由 301 和迁移入口完成。

**7a：R1，同时识别两组域名（代码改动，用户不可见）**
- `brand/brand.json` 加入 sairn 组，`phase` 为 `serve`。主域名（primary）仍是 gatu。
- `getPublicOrigin(network, currentHost)` 改成：当前主机属于哪一组，就返回同组的 origin；不属于任何一组时，返回主域名那一组。这样切网络时不会跳到还没解析的新主机。
- 新增测试：两组主机名都要覆盖后缀攻击、端口和协议。
- **迁移闸门**（D23 选 A 时）：
  - 新增一个只读模块，汇总当前 origin 上的待处理记录：资金动作标记、CCTP 跟踪记录和赞助授权意图、下单资产占位、LI.FI 执行记录、待处理 TWAP。键名见 §1.4 第 5 条，实现时按代码重新清点一遍。
  - 读不到存储时，按"有待处理记录"处理，即失败关闭。
  - 迁移入口从 R2 开始启用。当前主机属于非主组时，显示迁移提示：
    - 有待处理记录时，"前往新域名"按钮禁用，并说明原因。
    - 没有记录时，执行 `location.replace(新 origin + 路径 + 查询串 + hash)`。
    - 入口不签名，也不改任何记录。
  - 迁移提示是一种新的常驻提示。实现前二选一：在 `docs/mobile-data-presentation.md` 里写明它不属于被动数据提示，并给出呈现规则；或者改走全局 Sonner 宿主（`docs/trading-notifications.md`）。
  - 单测覆盖：每一类记录都会让入口禁用；存储不可读时入口禁用；没有记录时，目标 URL 保留路径、查询串和 hash。
- **官网函数**：源码已在阶段 1a 入库，这里加入旧主机重定向的逻辑。
- **终端的旧主机重定向表**：在 `deploy/cloudfront/render-functions.mjs` 里加一个模板，只渲染 `phase` 为 `redirect` 的组。没有这样的组时，渲染结果和现在完全一样。规则如下：
  - 只对导航请求，以及 `robots.txt`、`sitemap.xml` 这类入口返回 301，并保留路径和查询串。
  - `/sw.js` 返回 kill-switch 版本。
  - `/assets/*`、`/charting_library/*`、`/tradingview-theme-*.css`、字体和 `/api/*` 继续由原分发返回。理由是开着的旧标签页还要做三件事：懒加载 chunk、重建图表 iframe、调用同源 API。【推断，未实测】
    - 浏览器跟随跨源 301 之后，模块加载会因为没有 CORS 头而失败。`deploy/cloudfront/` 里没有配置任何 `Access-Control-*`。
    - `createLazyComponent` 遇到缺失的 chunk 会整页刷新（`lib/lazy.ts:60-62`），刷新又会被 301 带走，下单草稿就丢了。
  - `manifest.json` 要不要跳转：跨源跳转后，已安装 PWA 的更新行为未知，在 7a 实测后再决定。
- **kill-switch SW 模板**：install 时执行 `skipWaiting`；activate 时删除全部缓存，然后 `unregister`。**不**调用 `clients.claim()`，**不**导航任何已打开的标签页。
- **`functions.test.mjs` 新增用例**：
  - 旧主机的导航请求返回 301，保留路径和查询串，不解码 `/join/%` 这类畸形路径。
  - 子资源和 API 请求放行。
  - `/sw.js` 返回 kill-switch 版本。
- **文档**：新增操作手册 `deploy/cloudfront/domain-migration.md`；新增 ADR 0031。
- 按正常流程发布。

**7b：外部准备（不影响用户）**
- 邮件和搜索：
  - 建立新域名的 DNS zone；配置邮件的 MX、SPF、DKIM、DMARC；`support@gatu.ai` 设置转发。
  - 在 Search Console 验证新域名。
- 第三方白名单：
  - Privy 的 Allowed origins 里**添加**新的 app 和 testnet origin，旧的保留。
  - 核对 Reown 和 ZeroDev 的白名单（是否需要，见 §4）。
- 旧域名设为自动续费。
- **官网函数的权限**：读取、更新和发布 `gatu-rewrite-index` 需要 `gatu-edge` 没有的权限（§1.4 第 9 条）。
  - 两个做法选一个：扩展 `gatu-edge` 的 IAM 策略，或者指定一个有权限的身份。
  - 修改 IAM 属于安全配置变更，要由用户在 AWS 控制台执行，或者由用户明确批准。
  - 结论写进手册和回退表。
- **证书**：需要一个有权限的身份来申请，`gatu-edge` 没有这个权限。
  - 终端证书覆盖 `app.<新>`、`testnet.<新>`、`app.gatu.ai`、`testnet.gatu.ai`。
  - 官网证书覆盖新旧两组的 apex 和 www。
  - 用 `aws acm describe-certificate` 确认状态为 `ISSUED`。

**7c：挂别名（DNS 仍不动）**
- 运行 `deploy.mjs aliases --distribution ET9CNVE6L1GWN --alias app.gatu.ai --alias app.<新> --certificate-arn <新证书> --execute`。
- 测试网分发 `E3Q2SAX402CR9F` 和官网分发 `EP2DIBP3T7M3G` 同样处理。官网分发的别名更新在 `gatu-edge` 的 `DistributionsRelease` 范围内。
- 等分发状态变为 `Deployed`。

**7d：切 DNS 之前的验证**
- 用 `curl --resolve` 或修改本机 hosts，运行 `deploy.mjs verify --origin https://app.<新> --network mainnet`，测试网同理。
- 运行 `csp-coverage.mjs`。
- 人工检查：Privy 邮箱登录、外部钱包连接、Agent 授权、`/join/<code>`、`/join/%`，以及 `/api/geo` 返回 200。
- 在测试网上：先在新域名授权外部钱包，再回到旧域名，确认出现"同名连接已被替换"的提示（`docs/trading-onboarding.md:191-194`）。

**7e：最后才切 DNS**
- `app.<新>` 加 CNAME 指向 `d2i25dhfjwco8b.cloudfront.net`，`testnet.<新>` 指向 `dg9o2gpw3mt8q.cloudfront.net`，都用 DNS-only。
- 用 `dig @<权威 NS>` 核对，再通过公网 DNS 重新跑一遍 `verify`。
- 从这时起两组域名同时提供服务，并存期开始。公告要提醒外部钱包用户只在一个域名上交易（D9、D17）。

**7f：R2，主域名切到 sairn**
- **改动**：
  - SEO 的 `siteUrl`。
  - `robots.txt` 和 `sitemap.xml`。
  - 法律文本里的域名和邮箱，要在法律审阅之后改。
  - 官网的 `site` 和各处链接。
  - 如果 OG 卡上印了域名，也要改。
- **迁移入口验证**：R2 在旧主机上显示迁移提示（D23）。在测试网上验证两点：旧域名上有待处理记录时，迁移入口是禁用的；没有记录时，跳转会保留路径、查询串和 hash。
- **`CHANGELOG.md`**：写明对用户的影响：
  - 需要重新登录。
  - 外部钱包用户和开了 Stay Connected 的用户，要重新授权 Agent。
  - 需要重新安装 PWA。
  - 设置会回到默认值。
  - 外部钱包用户不要同时使用两个域名。
- **官网**：先在新 apex 上线，同样按"挂别名、验证、最后切 DNS"的顺序进行。

**7g：公告与等待期**
- 提醒用户在切换前完成进行中的充值和跨链。
- 邮箱用户和外部钱包用户的操作步骤不同，分开说明。
- 等待期的长度按 D17。

**7h：开启旧域名重定向**
- 把 gatu 组改为 `phase: redirect`，重新渲染函数后运行 `deploy.mjs functions --execute`。官网用 7b 安排好的身份同样处理。
- **旧 Service Worker 的行为**：
  - 开启重定向后，装着 v10 SW 的回访者第一次导航时，拿到的仍是缓存的旧壳，因为 `sw.js:83-102` 先返回缓存。同时，更新检查会装上 kill-switch 并注销 SW。
  - 子资源都放行了，所以旧壳能正常启动；从 R2 起的版本还会显示迁移提示。
  - 下一次导航才会被 301 带走。
- **多浏览器实测**：在 Chromium、Safari、iOS 主屏 PWA、Firefox 上测试。
  - 旧书签、已安装的 PWA、`/join` 外链、PnL 分享图里的二维码链接，都要跳到新域名，并保留路径和查询串。
  - 正在提交的标签页不能被强制导航。
  - 开着的旧标签页里，懒加载弹层和图表重建都要正常。
  - 有待处理记录时，迁移入口要禁用。
- 在 Search Console 提交地址更改。
- **回退**：重新发布不含重定向表的函数。生效需要多久以实测为准，原稿写的"秒级生效"已撤回。

**7i：收尾**
- 经过 N 周、确认旧主机的流量已经下降后，从 Privy 白名单里移除旧 origin。
- 旧域名、证书和邮件转发**永久保留**。
- ADR 0005 追加更正。
- `docs/trading-onboarding.md:184-190` 补一句，说明槽位名为什么保持 `gatu`，以及并存期会互相顶替。
- 写任务记录。

**测试与验证组**
- 本地运行：`network-storage`、`referral-join`、`referral`、`seo`、`terms-content`、`legal-policy-contract`、`trading-agent-config`。经阶段 1a，这些都已在 CI 品牌组里。
- 迁移闸门的单测。
- `pnpm test:cloudfront`（包括新增的 functions 用例）和官网函数测试。
- 官网测试。
- Wallet signing 组。
- 阶段 1b 加的品牌来源测试：法律文本、robots 和 sitemap 里只能出现主域名，不能出现处于 redirect 阶段的主机名。

**不改的**：S3 桶名、Lambda 和函数名、IAM 资源名、`x-gatu-*` 请求头、`GATU_*` 环境变量名、Agent 槽位名。

---

## 4. 外部系统清单（仓库外）

### 4.1 批次 B：品牌对外切换

| 顺序 | 系统 | 操作 | 回退 |
|---|---|---|---|
| 1 | 终端发布 | 按现有 CloudFront 流程跑 `deploy.mjs` 的 sync、invalidate、verify。【事实】非哈希文件是 `max-age=0, must-revalidate`（`deploy/cloudfront/deploy.mjs:20,35-42`）。构建后按 p22、p23 的不打印值方式核对：产物里 Agent 槽位的构建值是 `gatu`，并且没有 `gatu-dev` | 用上一个提交重新构建并同步，或者恢复 S3 对象版本 |
| 2 | 官网发布 | 按阶段 1a 入库的手册：构建，同步到 `gatu-dist-2026`（非哈希文件用 revalidate），对 `EP2DIBP3T7M3G` 做失效，再验证。这是 2026-07-19 之后的第一次官网发布，会把所有未发布的官网改动一起带上线，发布前要单独审一遍差异。顺序是终端先发并 verify，再发官网 | 重建上一版后再同步。【未验证】桶有没有开启版本控制 |
| 3 | Privy | D24 选 B：logo 随终端代码发布，后台只改应用名，以及 OTP 邮件的发件名（如果配置了）。D24 选 A：后台同时改 logo，与发布同步操作。【未验证】后台当前的配置 | 在后台恢复旧名；选 B 时 logo 随代码一起回滚 |
| 4 | 社交平台 | 头像用 `brand/social/*-400.png`，同时更新简介。账号目前未知（D2） | 换回旧头像 |
| 5 | 链接预览缓存 | 【推断】在 X、Facebook、LinkedIn 的调试工具，以及 Telegram 的 @WebpageBot 里重新抓取 | 无需回退 |
| 6 | LI.FI | 可选：更新合作方后台的显示信息。integrator 仍是 `gatu` | — |
| 7 | Hyperliquid | 不需要任何操作。Agent 槽位仍是 `gatu`，API 钱包页显示旧名，这是已接受的代价 | — |
| 8 | 用户沟通 | 【推断】已安装 PWA 的用户，Chrome 可能弹窗请他们确认名称或图标的变更；iOS 主屏图标要重新添加才会更新。【事实】回访用户第一次打开看到的仍是旧品牌，因为 SW 先返回缓存的壳（§1.4 第 12 条），第二次打开才是新品牌。公告和截图要考虑这个时间差。如果 Privy 的名称或 logo 在后台修改，这一次会话里会出现新旧混用 | — |

### 4.2 批次 C：域名切换（顺序很重要：DNS 永远最后切）

| 顺序 | 系统 | 操作 | 怎么核对 | 回退 |
|---|---|---|---|---|
| 1 | 注册商 | 注册新域名；**旧域名永久自动续费**。理由：HSTS 是 1 年加 `includeSubdomains`，而且旧 origin 的 localStorage 里有 Agent 私钥 | 查注册商后台 | — |
| 2 | Cloudflare DNS | 建新 zone，先不建 app 和 testnet 记录。如果设置 CAA，要放行 amazon | 查权威 NS | 删除 zone |
| 3 | 邮件服务商 | 配置 MX、SPF、DKIM、DMARC；`support@gatu.ai` 设置转发 | 发信测试 | 保留旧邮箱 |
| 4 | Search Console | 验证新域名 | 后台 | — |
| 5 | Privy | Allowed origins **只添加，不删除** | 在新 origin 上登录 | 删掉新增的 origin |
| 6 | Reown、ZeroDev | 【推断】如果后台有 origin 白名单，加入新域名 | 在新 origin 上连接钱包、使用赞助 gas | 撤销 |
| 7 | ACM（us-east-1） | 申请覆盖新旧主机名的证书，需要有权限的身份 | `describe-certificate` 返回 `ISSUED` | 不使用即可 |
| 8 | IAM 或有权限的身份 | 安排官网函数 `gatu-rewrite-index` 的读取、更新和发布权限。由用户在 AWS 控制台执行，或由用户明确批准 | 用该身份对函数做只读 describe | 撤销新增的权限 |
| 9 | CloudFront 别名 | `deploy.mjs aliases`，新旧别名同时挂 | 状态为 `Deployed` | 用旧证书 ARN 和旧别名列表重新运行 |
| 10 | 预验证 | 用 `--resolve` 或 hosts 运行 `verify` 和 `csp-coverage`，再做人工检查 | 看命令输出 | — |
| 11 | Cloudflare DNS | 新主机名用 CNAME 指向分发 | `dig @权威NS`，再走公网跑 `verify` | 删除新记录（旧记录从未动过） |
| 12 | 发布 R2 | 主域名切到 sairn；旧主机上显示迁移提示 | `verify`，并在测试网验证迁移入口 | 用上一个提交重新构建 |
| 13 | CloudFront 函数 | 开启旧主机重定向和 kill-switch。终端用 `deploy.mjs functions`，官网用第 8 行安排的身份 | 多浏览器实测（7h 清单） | 重新发布不含重定向表的函数，生效时间以实测为准 |
| 14 | Search Console | 提交地址更改 | 后台 | 撤回 |
| 15 | Privy | N 周后移除旧 origin | — | 重新添加 |
| 16 | Lambda | 确认 `GATU_PUBLIC_ORIGIN` 仍然没有设置（依据 2026-09-17 的记录） | `aws lambda get-function-configuration` | — |

**不需要改的外部项**：CSP 报告地址（它是 Lambda 函数 URL）、S3 桶名、Hyperliquid 的 builder 授权、条款接受状态、推荐码。

**不可逆的项**
- 已经执行过 kill-switch 的用户，SW 已被注销。这没有害处，只是缓存要重建。kill-switch 不会导航已打开的页面。
- 如果下发了 `Clear-Site-Data`，被删掉的私钥无法恢复。本计划默认不下发。
- 迁移时如果已经因为守卫丢失发生了重复操作，那就无法撤回，只能靠迁移闸门预防。

---

## 5. 风险与回退

| # | 风险 | 触发条件 | 缓解 | 回退 |
|---|---|---|---|---|
| 1 | 资金恢复和跨标签页互斥失效 | 改了存储键或锁名 | D8 全部保留；阶段 1b 的品牌来源测试不碰这些键。换域名导致的同类风险见 #23 | 回滚提交 |
| 2 | 全体用户被迫重新授权，命名槽位被占满 | 改了 Agent 槽位名，或误把 `APP_NAME` 改成 sairn | 拆分常量（阶段 1b）；`trading-agent-config.test.ts` 加了 `APP_NAME === "gatu"` 断言，并进入 CI 品牌组（阶段 1a）；源码断言保证 `build-meta.ts` 不读 `brand.json`；发布时核对产物里的槽位值（§4.1 第 1 行） | 恢复 `APP_NAME`。已经上链的授权无法撤回 |
| 3 | 某个语言整体静默退回英文 | 手工编辑 `.po`，导致 msgid 集合和英文不一致 | 所有 `.po` 由同一次 extract 生成；新增目录测试；人工逐个切换语言核对 | 回滚目录提交 |
| 4 | 提交里混进其他会话的 `.po` 改动 | lefthook 自动暂存 | 提交前用 `git diff --cached` 核对，只保留本任务的文件 | 用 `reset --soft` 重做提交 |
| 5 | 检查静默失效 | 选择器或类名改了，测试仍然通过 | 阶段 1a 和阶段 3 的第一个提交先改测试；"GATU fee"、`hi@` 改成与品牌无关的断言 | — |
| 6 | 页面上残留旧几何，或编译失败 | 只换了 logo，没换加载器；提交拆分不当 | 加载器替换放在阶段 2；旧文件在第 2 个提交、与加载器一起删除，每个提交都能单独通过 typecheck | — |
| 7 | 导航拥挤或被裁切 | 24px 横版宽了 9px；已连接状态从没测过 | 按 §11 的方法在 1182、1151 等宽度、六种语言、两种连接状态下实测；必要时调整窄屏阈值并更正 ADR 0013，或者向设计方申请例外 | 恢复旧尺寸类名 |
| 8 | 包体超出预算 | 内联字标；引入了运行时动效库；PnL 渲染器没有懒加载 | 动效用生成的方式，不用运行时库；PnL 懒加载；每个阶段都跑 `pnpm build` | 回滚 |
| 9 | 品牌色和涨跌、成功、Spot 色混淆 | 选了 b1，ΔE 分别为 7.7、7.3、3.8 | 等待转圈改用中性色；signal 不放在数字旁边；契约测试登记例外 | 恢复令牌值 |
| 10 | `og:check` 在 CI 上不稳定 | OG 卡用了系统字体 | 用方案 A，或者用方案 B 并配自带字体 | 回滚 OG 提交 |
| 11 | 生产环境出现新旧品牌混合 | 可见阶段被零散晋升到 main；终端和官网没有同期发布 | 用集成分支，或冻结晋升（D21）；终端和官网同属批次 B（§4.1）。SW 造成的首开旧版另见 #28 | 回滚 main 上的合并 |
| 12 | 状态语义被弱化 | "已受理"显示成"已成交"，或"未知"显示成"失败" | 阶段 3 的映射测试；`docs/trading-notifications.md` | 回滚 |
| 13 | 动效带进十六进制颜色或中文 title | 直接使用库的输出 | 生成器去掉这些内容，并用 `--check` 守住；输入缺失时报错 | — |
| 14 | 新旧域名耦合，推荐链接和网络判定失效 | 只发一个版本就把规范域名换掉 | 分两次发布：R1 同时识别两组域名，R2 再切主域名 | 用上一个提交重新构建 |
| 15 | 老用户被永远困在旧版本 | 旧域名整站 301，但 `/sw.js` 没有返回 kill-switch | 用 kill-switch，修订后的版本不导航。调查期的实验只在无头 Chromium 里做过：用 localhost 的两个端口模拟新旧 origin，用的是简化的壳，验证的还是"主动导航"的旧版本。真实域名、Safari/iOS PWA、Firefox 和真实的 CloudFront 函数都没有验证，必须在 7h 之前实测 | 重新发布函数 |
| 16 | 证书错误（重演 2026-09-15 的事故） | 在证书和别名就绪之前切了 DNS | DNS 永远最后切；每一步都用权威 DNS 和 AWS API 核对 | 删除新的 DNS 记录 |
| 17 | 旧私钥泄露 | 旧域名过期后被他人注册 | 永久续费；保持 `gatu` 槽位 | 无法回退，只能预防 |
| 18 | 用户体验断层 | origin 变化导致本地状态全部归零 | 公告；避开进行中的资金操作；CHANGELOG 写明影响；迁移闸门（#23） | — |
| 19 | 法律风险 | 未经审阅就改法律文本，或用错实体名；需要重新接受条款却没有门控 | 阶段 5b 等法律审阅通过再动；如需重新接受，先按 D16 设计门控 | 回滚 |
| 20 | 许可风险 | 复制了 Studio 里的 QR 代码，或用了权属不明的设计方代码 | 二维码复用已有的 `qrcode`；HTML 工具和 `sairn-motion.js`、`.d.ts` 在权属明确之前不入库；生成器只读已入库的产物 | 删除 |
| 21 | 在部分浏览器上表现不一致 | Safari 对 `var()` 和 SVG 过渡的支持；iOS PWA 的 SW 行为 | 【未验证】必须用真机和真浏览器测试 | — |
| 22 | 官网部署无法审查或无法执行 | 在后台手工修改 `gatu-rewrite-index`；`gatu-edge` 没有函数权限 | 阶段 1a 把发布流程和函数源码纳入仓库；7b 安排权限，由用户批准 | 回到后台的上一个版本 |
| 23 | 换域名后本地守卫全部失效 | 用户还有待处理记录时被带到新域名；并存期同时开着两个域名 | D23 迁移闸门；子资源放行，让旧标签页能把在途操作做完；公告提醒先完成充值和跨链、不要同时用两个域名 | 已发生的重复操作无法撤回，只能预防 |
| 24 | 提交中的页面被强制卸载 | kill-switch 主动导航已打开的标签页 | kill-switch 不 claim、不导航（D17）；7h 实测清单里专门检查 | 重新发布函数 |
| 25 | 开着的旧标签页懒加载失败、图表重建失败，草稿丢失 | 旧主机对子资源也返回 301 | 重定向只针对导航和入口文件；放行清单写进 functions 测试 | 重新发布函数 |
| 26 | 并存期同名 Agent 互相顶替 | 外部钱包用户在两个域名之间来回使用 | 旧域名上显示迁移提示；公告提醒；并存期长度由用户定（D17）；ADR 0031 写明这一点 | 用户在单一域名上重新授权 |
| 27 | CI 没有运行品牌守卫 | PR 只改了 `brand.json` 或 `legal/`；相关测试没进 CI | 阶段 1a 的 CI 品牌组和路径过滤，由 `ci-workflows.test.mjs` 固定 | — |
| 28 | 回访用户首次打开仍是旧品牌，与 Privy 新名混用 | SW 先返回缓存的壳 | 公告和截图考虑这个时间差；Privy logo 走代码发布（D24） | — |
| 29 | 官网旧文件被浏览器按 immutable 长期缓存；官网首发带出未审过的改动 | 同名文件原地替换；官网自 2026-07-19 以来没有发布过 | 品牌文件换新路径；发布流程改缓存策略；发布前审查差异（D20） | 重建上一版后再同步 |
| 30 | PWA 主题色契约失去独立的测试保护 | 测试被改成"等于 JSON" | 保留字面量断言，并绑定画布令牌（阶段 1a） | 回滚 |

---

## 6. 交付文件 → 目标路径映射

| 交付文件 | 目标路径 | 处理方式 | 阶段 |
|---|---|---|---|
| `brand/svg/mark/sairn-mark-{mono,on-light,on-dark,black,white}.svg` | `apps/terminal/src/components/brand/brand-logo-geometry.gen.ts`（生成） | `brand:sync` 抽取路径，按彩色版本的填充色识别部件，并断言五个版本的路径相同；`brand:check` 比对 | 2 |
| `brand/svg/lockup/sairn-lockup-*.svg` | 同上（横版的标志路径和字标路径） | 同上 | 2 |
| `brand/svg/wordmark/sairn-wordmark-*.svg` | 同上 | 同上 | 2 |
| `brand/svg/mark-small/sairn-mark-small-*.svg` | 同上（`mark-small` 变体，只用于 23px 以下） | 同上 | 2 |
| `brand/svg/lockup/sairn-lockup-on-dark.svg` | 官网：经 Astro 资源管线导入，输出带哈希的文件名；做不到时改用带版本号的中性文件名 | 不能原地替换线上的 `logo.svg`（它是 immutable 缓存）；同时改 `Logo.astro` 的宽高 | 2 |
| `brand/svg/mark/sairn-mark-on-dark.svg` | 官网：同上，取代 `logo-mark.svg` | 同上 | 2 |
| `brand/svg/lockup/sairn-lockup-on-{dark,light}.svg` | `apps/terminal/public/brand-lockup-on-{dark,light}.svg` | 复制；D24 选 B 时供 Privy 使用 | 2 |
| `brand/svg/**` 的其他颜色版本 | 留在 `brand/` | 作为媒体素材包 | — |
| `brand/png/**` | 留在 `brand/` | 作为媒体素材包 | — |
| `brand/web/favicon.ico` | `apps/terminal/public/favicon.ico`、`apps/website/public/favicon.ico` | 复制；`sizes` 改为 16/32/48（manifest、`lib/seo.ts:64`、`Base.astro`）。官网线上这个路径目前是 404，没有旧缓存 | 2 |
| `brand/web/favicon.svg` | 两个应用的 `public/favicon.svg` | 复制；官网的链接加版本参数，因为线上同名文件是 immutable 缓存 | 2 |
| `brand/web/apple-touch-icon.png` | 两个应用的 `public/apple-touch-icon.png` | 复制 | 2 |
| `brand/web/icon-192.png`、`icon-512.png` | `apps/terminal/public/` | 复制 | 2 |
| `brand/web/icon-maskable-512.png` | `apps/terminal/public/icon-maskable-512.png` | 复制 | 2 |
| （待补交或派生）`icon-maskable-192.png` | `apps/terminal/public/icon-maskable-192.png` | 优先用设计方补交的文件；否则用 Chromium canvas 从 512 版缩放，交设计方过目（D7） | 2 |
| （不派生）`icon.svg` | 从 `apps/terminal/public/manifest.json` 里删除这一项，并删除文件 | D7；设计方另交时再加回 | 2 |
| `brand/web/site.webmanifest` | 合并进 `apps/terminal/public/manifest.json` | 只取 `name` 和 `id`；**不取** `lang`、`#0A3038`、绝对路径的 `src` 和文件名 | 2、5 |
| `brand/web/head.html` | 参考：`apps/terminal/src/lib/seo.ts:51-74`、`apps/website/src/layouts/Base.astro:25-29` | 只借用 ICO 的 `sizes` 写法 | 2 |
| `brand/social/sairn-avatar-light-1024.png`（D20） | `apps/website/public/logo-1024.png` | 复制，同时改 `config/seo.ts:14` | 2 |
| `brand/social/*-400.png` | 外部社交平台 | 仓库外操作 | 批次 B |
| `brand/ios/`、`android/`、`harmonyos/` | 留在 `brand/` | 存档入库，不接入构建 | 0b |
| `brand/Sairn-Logo-v1.3.zip` | `brand/_source/` | 已被 Git 忽略，不入库 | 0b |
| `brand/README.md`（用户当前版本） | `brand/LOGO-KIT.md` | 征得用户同意后原样另存；README 按实际目录重写，不恢复 `895c7cf9` 版 | 0b |
| `brand/logo/.gitkeep`、`brand/icons/.gitkeep` | 删除 | 已由 `svg/`、`web/` 代替，在 README 中说明 | 0b |
| `brand/brand-info.yaml` | `brand/brand.json` | 迁移后退役（D18） | 0b |
| `Sairn-Motion-Library-v1.3.html` 导出的 ZIP | `brand/loader/{svg,static,glyphs}/`、`sairn-motion.tokens.json` | 入库；`brand/loader/README.md` 记录源 HTML 的 SHA-256、导出时间、工具版本和导出步骤；`brand:check` 校验哈希 | 0b |
| 导出的 `sairn-motion.js`、`sairn-motion.d.ts` | 暂不入库 | 等许可说清再定（D19）；运行时不引用 | — |
| `Sairn-Motion-Library-v1.3.html` | 权属明确后放 `brand/tools/`，否则放 `brand/_source/` | D19 | 0b |
| `brand/loader/svg/<theme>/page-loading.svg` | `apps/terminal/src/components/brand/brand-page-loader.tsx` 与 `styles.css` | 手工移植 | 2 |
| 其余动效和符号 | `apps/terminal/src/components/brand/motion/*.gen.tsx` | 由生成器生成，输入只用已入库的产物 | 3 |
| 内嵌的 `tokens/sairn.tokens.json` | `brand/tokens/sairn.tokens.json` | 优先用设计方原件 | 0b |
| `Sairn-Share-Studio-v1.3.html` | `brand/tools/` 或 `brand/_source/` | D19；产品代码不引用 | 0b |
| Studio 的 `trade` 模板 | `apps/terminal/src/lib/share-card/`（用 TypeScript 重写的子集） | 只作视觉参考 | 4b |
| （缺）`brand/share-cards/og/og-terminal.png`、`og-website.png` | `apps/terminal/public/og-terminal-*.png`、`apps/website/public/og-website-*.png`，都用带版本号的文件名 | 方案 A：复制并校验 | 4a |
| （缺）`brand/share-cards/pnl/` 标注稿 | 作为 `docs/pnl-share-card.md` 的设计依据 | — | 4b |
| （缺）`brand/fonts/` | 只有方案 B 需要；OG 用仓库自带的 OFL 字体 | — | 4a |

---

## 7. 完成判据与残留检索

**批次 B（品牌对外切换）的完成判据**
- **残留检索**：每条命中都要归类，而且只允许属于以下几类：
  - ADR 0027 的保留清单
  - 历史记录
  - 域名和邮箱：在批次 C 处理
  - 如果阶段 5b 延后：`legal/` 和法律确认弹窗的两条 msgid。这些要登记在目录测试的待办例外和任务记录的后续项里。
- **截图核对**：覆盖桌面、紧凑、移动三档，深浅两种主题，六种语言，OG 卡，以及官网（包括官网截图）。
- **发布**：终端和官网都已发布并验证（§4.1）；Privy 已同步。
- **验证记录**：本文列出的验证组都已**实际运行**，结果写进任务记录。记录时要区分"计划运行""实际运行""失败""未运行"，并注明每项是在 CI 里跑还是只在本地跑。
- `CHANGELOG.md` 已更新。

**批次 C（域名迁移）的完成判据**
- 残留检索中，旧域名只出现在三处：保留清单、历史记录、ADR 0031 的迁移说明。
- 7h 的多浏览器实测全部完成，包括：提交中的标签页不被导航；旧标签页的懒加载和图表重建正常；有待处理记录时迁移入口禁用。
- 已排期从 Privy 移除旧 origin（7i）。旧域名、证书和邮件转发已设为永久续费。

**残留检索**：只用 `git grep`，不要用 `find`。

```bash
git grep -niI -e gatu -e hyperterminal -- ':!apps/terminal/public/charting_library' ':!docs/work-memory' ':!research' ':!docs/adr' ':!launch-review*'
```

每条命中都要判断属于哪一类：保留清单、历史记录、批次 C 待办、法律待办，还是漏改。

**grep 查不到、必须人工核对的**
- 运行时拼出的品牌名
- SVG 路径
- OG 图和官网截图里的像素
- Privy 登录窗口
- 官网线上的旧缓存文件：换了路径后，用 HEAD 请求确认新路径已经生效

**范围提醒**：本计划不包括与品牌无关的行为改动，例如手机下单按钮的转圈，以及确认面之外的交互变化。调查中顺带发现的问题都记为后续任务。

---

## 附录 A：调查报告之间的分歧，以及本文采用的结论

1. **ADR 编号**：品牌色和域名两份报告都想用 0027。抽查结果：0025 已预留，0026 已用掉，所有本地分支都没用过 0027 及以后的编号。本文按 0027–0031 重新分配，动笔前再查一次。
2. **Service Worker 会不会缓存品牌图标**：
   - 改名报告认为 `ICON_CACHE` 会让旧图标多显示一次。
   - 抽查 `apps/terminal/public/sw.js:3,77-78`：`ICON_CACHE` 只缓存 `app.hyperliquid.xyz/coins/` 下的币种图标。
   - 所以在图标问题上**以素材报告为准**：SW 不缓存品牌图标和 manifest。旧图标残留来自浏览器自己的 favicon 缓存、HTTP 缓存和 iOS 主屏幕。
   - 补充：SW 会缓存导航用的壳，所以回访者第一次打开时会看到整个旧版页面（§1.4 第 12 条）。这和图标缓存是两回事。
3. **OG 卡的来源**：
   - 素材报告给了两个选项："改模板"和"用 Studio 导出"。
   - 分享卡报告推荐"设计方交 PNG"，不推荐 Studio。
   - 本文的默认值：设计方交 PNG；交不了就改模板，并用仓库自带的字体。Studio 不作为 OG 的来源（D14）。
4. **PnL 导出倍数**：原交付清单写"放大 3 倍"，代码里是 `EXPORT_SCALE = 2`（`lib/trade/position-pnl-share.ts:3-6`）。以代码为准。
5. **单一来源的格式**：
   - 域名报告建议用 `brand/brand.json`。
   - 品牌色报告建议用 `packages/ui` 下的 `brand.css`，配合 tokens JSON。
   - 本文的做法：
     - `brand/brand.json` 管名称、域名、邮箱和颜色值。
     - 第二层的角色令牌在三份 CSS 里仍写字面值，由测试和 JSON 对照。原因是现有测试只在同一个选择器块内解析 `var()`。
     - 契约测试另外保留与 JSON 无关的不变量断言。
     - `packages/ui` 下的 `brand.css` 以后可以加，但不作为本次的前提。

## 附录 B：设计方补件清单（可以立刻发出）

1. **两张 OG 卡**：1200×630，不透明，两张不同，卡面不印域名。或者确认由我们按方案 B 改模板。
2. **PnL 分享卡标注稿**，放在 `brand/share-cards/pnl/`：
   - 效果图要有盈利和亏损两种。
   - 标注画布尺寸、各字段的位置和字号、测试网标签的位置、二维码区域。
3. **Web 图标**：
   - `icon-maskable-192.png`。
   - 要不要 manifest 用的 `icon.svg`？如果要，必须和 `icon-512` 的圆角、内缩一致；否则我们从 manifest 里删掉这一项。
   - ICO 要不要 64px 一帧。
   - 如果由我们派生，请确认派生结果可以用。
4. **悬停色**：给出 `--signal-hover` 在深浅两种主题下的值，或者确认用 `#A8EEE1` 和 `#0F524D`。
5. **状态符号**：补 partial、info、warning 三个。
6. **源码**：`tokens/sairn.tokens.json` 原件，以及 `Sairn-Brand-Tools-v1.3.zip`（studio 和 catalog 源码）。如果 Motion Library 有命令行或脚本方式的导出，也请一并提供，方便我们复现导出。
7. **版权与许可**：Motion Library 和 Share Studio 代码的版权与许可说明（Studio 的 Apache 头部里，版权行还是占位符）。另外，`sairn-motion.js` 和 `sairn-motion.d.ts` 能不能入库。
8. **页头小尺寸**：18px 和 22px 能不能开例外，或者确认统一用 24px。
9. **Spot 分类色**：浅色主题下的 Spot 分类色和品牌青太接近（ΔE 3.8），请复核。

---

## 附录 C：审查意见处理

处理原则：
- 每条意见都对照仓库只读核实过，个别还读取了线上响应。
- 实质成立的就采纳。意见本身有细节不准确，或修复方案做了调整的，标为"部分采纳"并写明原因。
- 这次没有整条不成立的意见，所以没有标"不采纳"的。

| 编号 | 角度 / 严重度 | 意见摘要 | 处理 | 理由与落点 |
|---|---|---|---|---|
| 契约-1 | contracts / major | 换 origin 等同于存储键和锁全部失效，资金守卫丢失；kill-switch 不检查是否有进行中的操作 | 采纳 | 核实了 `use-deposit.ts:1236-1245`、`cctp-deposit-tracking.ts:108,110`、`order-asset-lock.ts:3-4`、`funds-action-marker.ts:5-6`、`embedded-deposit-auto-bridge.tsx:249`，均属实。落点：§1.4 第 5 条、D8 的注意、新增 D23、阶段 7a 迁移闸门、7e/7f/7h、风险 #23。交接记录（D23 选项 B）列为待用户决定，不作默认 |
| 契约-2 | contracts / major | kill-switch 主动导航会卸载正在提交的页面 | 采纳 | `__root.tsx:29-31` 的 `updateViaCache: "none"` 属实；调查期实验脚本里的 kill-switch 确实是先 `claim` 再 `navigate` 全部窗口。落点：D17、阶段 7a 模板、7h 实测清单、风险 #24 |
| 契约-3 | contracts / major | pwa-manifest 测试改为"从 brand.json 推导"会变成同义反复 | 采纳 | `pwa-manifest.test.ts:26-28`、`runtime-guardrails.md:679-680` 属实，交付的 `site.webmanifest` 用的也确实是 `#0A3038`。落点：D5、阶段 1a（保留字面量，并绑定 `styles.css:441,450`）、阶段 1b 跨应用测试的写法、阶段 6、风险 #30 |
| 契约-4 | contracts / major | `trading-agent-config` 不在 Wallet signing 验证组里；示例环境文件不等于"固定" | 采纳 | AGENTS.md 该组的 15 个文件里没有它，CI 里也没有；`deploy/cloudfront/README.md:137` 写明这一项靠人工核对。落点：§1.4 第 4 条改写、阶段 1a（加入 CI 品牌组，加 `APP_NAME === "gatu"` 断言）、1b（源码断言）、5a 和 7 的验证、§4.1 第 1 行的产物核对、风险 #2 |
| 契约-5 | contracts / minor | 旧主机对 `/assets/*` 返回 301，会让开着的旧标签页懒加载失败 | 部分采纳 | 放行子资源和 API 的建议全部采纳。`deploy/cloudfront/` 里没有配置 CORS 响应头，跨源跟随后模块加载会失败【推断，未实测】。意见里建议 `manifest.json` 也 301，这一点没有直接采纳：跨源跳转后已安装 PWA 的更新行为未知，改为 7a 实测后再定。落点：阶段 7a 重定向规则、functions 测试、7h、风险 #25 |
| 契约-6 | contracts / minor | "零视觉变化"的核对判据做不到 | 部分采纳 | 核心成立：`_shell.html` 里有哈希化的 modulepreload 和路由时间戳，现有产物里有 `u:1790251670187`；`data-brand-home-link` 不在壳里；文件名会从 `gatu-` 变成 `GATU-`。不准确之处：意见说"`position-pnl-share.test.ts` 固定了这个文件名"，实际上该测试只固定了 sanitizer 处理 `GATU` 输入的行为（`:82,155-158`），弹窗测试也 mock 掉了下载。落点：阶段 1b 的核对方法、`BRAND_FILE_PREFIX` |
| 契约-7 | contracts / minor | terminal-tests、production-build、static-checks 的路径过滤里没有 `brand/**` | 采纳（与完整性-1 合并） | 属实。落点：阶段 1a 的 CI 部分 |
| 契约-8 | contracts / minor | 根目录解析不到 zod 和 sharp | 采纳（与完整性-2 合并） | 修订时实测报 `ERR_MODULE_NOT_FOUND`。落点：§1.4 第 13 条、D7、D18、阶段 1b、阶段 2 |
| 契约-9 | contracts / minor | 生成器的输入在被 Git 忽略的 `_source/` 里，CI 拿不到 | 采纳 | `.gitignore:64-65` 属实。落点：阶段 3 第 2 项（输入只用已入库的产物，缺失时报错）、D19、风险 #13 和 #20 |
| 契约-10 | contracts / minor | 实测宽度用的是旧阈值 1100 | 采纳（与完整性-4 合并） | `config/layout.ts:11-12` 属实。落点：D6、阶段 2 的导航余量实测 |
| 契约-11 | contracts / minor | §2 说阶段 0 不用等决定，与 D18、D19 矛盾；README 是用户未提交的改动 | 采纳（与完整性-7 合并） | 属实。落点：§2 开头、D19、阶段 0 拆成 0a 和 0b |
| 契约-12 | contracts / minor | 两处验证结论没写明范围 | 采纳 | 读了 scratchpad 里的 `sw-origin-move.mjs`（localhost 41801/41802、无头 Chromium、简化的壳、带主动导航）和 `reduced.mjs`（动效库导出物加一条抄来的全局规则），属实。落点：阶段 3 第 2 项、风险 #15、阶段 7h |
| 契约-13 | contracts / minor | `gatu-edge` 不能更新官网的 CloudFront 函数 | 采纳 | IAM 策略属实；读取函数源码同样需要权限。落点：§1.4 第 9 条、阶段 1a、7b、§4.2 第 8 和 13 行；回退时效不再写"秒级"，改为以实测为准 |
| 完整性-1 | completeness / major | CI 不跑计划依赖的大部分测试，路径过滤也缺 `brand/` 和 `legal/` | 采纳 | 逐个核对属实。补充：`tradingview-chart` 和 `chart-theme-colors` 由 glob 覆盖，不在缺口里。落点：§1.4 第 11 条、阶段 1a、每个阶段的验证一节标注 CI 还是本地、风险 #27 |
| 完整性-2 | completeness / major | 同契约-8 | 采纳（合并） | 同上。D18 里"不需要新依赖"改为"JSON 本身不需要；zod 放在终端 vitest 里" |
| 完整性-3 | completeness / major | 批次 B 缺少官网发布流程 | 采纳，并补充线上事实 | `deploy.mjs:493,677-679` 属实。修订时读取线上响应头发现：官网最后一次发布是 2026-07-19，仓库里的多个官网文件在线上是 404，同名文件按 immutable 缓存。落点：§1.4 第 9 条、D20、阶段 1a（流程入库，从原稿的 7a 提前）、阶段 2 的官网部分、§4.1 第 2 行、风险 #29 |
| 完整性-4 | completeness / major | 导航文档的归属、实测宽度、Playwright 没挂载 TopNav | 采纳 | `runtime-guardrails.md:876-946`、`user-menu-recovery.fixture.tsx:37` 属实。落点：D6；阶段 2 的文档、验证组（删除"布局套件能证明导航余量"的说法）、实测方法（需要新夹具或手工测量） |
| 完整性-5 | completeness / major | 阶段 5a 的目录测试会被法律 msgid 打红；§7 的判据不可达 | 采纳并扩展 | `messages.po:4047,4059` 属实。规划者另外发现：批次 B 时域名和邮箱也还在（它们属于批次 C），§7 的判据同样无法满足。落点：阶段 5a 加待办例外、阶段 5b 删除例外、§7 按批次分开写 |
| 完整性-6 | completeness / major | 并存期同名 Agent 互相顶替 | 采纳 | `trading-onboarding.md:185-194` 属实。落点：D9、D17（并存期从"不少于两周"改为"默认两周、由用户定"）、7e 和 7f 的公告、风险 #26、ADR 0031。缓解手段列为选项，由用户决定 |
| 完整性-7 | completeness / major | §2 自相矛盾；`895c7cf9` 版 README 已过时；`brand/logo/`、`brand/icons/` 没有交代 | 采纳 | `git show 895c7cf9:brand/README.md` 的内容属实。落点：§1.2、§2 开头、D19（重写，不恢复）、阶段 0b、§6 |
| 完整性-8 | completeness / minor | 启动播报的字面量测试、JSX 产生的注释节点、下载文件名 | 采纳 | `responsive-panel-layout.test.ts:133` 属实。相邻文本节点会产生 `<!-- -->`，这是 React 服务端渲染的已知行为【推断，本仓库未实测】。落点：阶段 1b 的启动播报写法、测试同步、`BRAND_FILE_PREFIX` |
| 完整性-9 | completeness / minor | "GATU fee" 的负向断言会静默失效 | 采纳并扩展 | 属实。规划者另外补上 `legal-policy-contract.test.ts:88` 对 `hi@gatu.ai` 的负向断言。落点：§1.4 第 7 条、阶段 1a |
| 完整性-10 | completeness / minor | Privy 支持在客户端配置 `appearance.logo` | 采纳 | `@privy-io/react-auth` 3.32.2 的 `types-sr2FRXdy.d.ts:1513-1517` 属实。原稿"只能在后台改"的说法已改正。落点：新增 D24、阶段 2、§4.1 第 3 行 |
| 完整性-11 | completeness / minor | SW 先返回缓存的壳，回访用户首次打开仍是旧版 | 采纳 | `sw.js:68,83-102`、`deploy.mjs:85-89` 属实。落点：§1.4 第 12 条、附录 A 第 2 条的补充、§4.1 第 8 行、风险 #28、阶段 7h |
| 完整性-12 | completeness / minor | 要求重新接受条款就需要新门控 | 采纳 | `runtime-guardrails.md:20` 属实（意见里写的是 `:19`，实际是第 20 行），也搜不到条款版本号。落点：D16、阶段 5b 的前提、风险 #19 |
| 完整性-13 | completeness / minor | 删掉全部 `position-share-*` 令牌会破坏弹窗按钮 | 采纳 | `position-pnl-share-modal.tsx:300-322`、`font-migration-pairs.ts:64-69` 属实。落点：阶段 4b 第 3 项 |
| 完整性-14 | completeness / minor | 派生的 `icon.svg` 是满版直角，与圆角透明边的 any 图标不一致 | 采纳 | `background.svg` 是 1024 满版直角，`icon.svg` 只在 manifest 里被引用。默认改为从 manifest 删除。落点：D7、阶段 2、§6、附录 B 第 3 项 |
| 完整性-15 | completeness / minor | 生成文件会被 biome 改写，与 `--check` 冲突 | 采纳（选排除方案） | `biome.json` 和 `lefthook.yml:5-6` 属实。两种修法里选了"`*.gen.ts(x)` 加入 biome 排除"，沿用 `routeTree.gen.ts` 的先例。落点：§1.4 第 14 条、§3.0 通用要求、阶段 2、阶段 3 |
| 完整性-16 | completeness / minor | 动效导出物的来源无法复现 | 采纳 | `brand/loader/` 里只有 `.gitkeep`，属实。落点：D19、阶段 0b（导出脚本或手工步骤、哈希记录、`brand:check` 校验）、§6 |
| 完整性-17 | completeness / minor | 阶段 2 的第一个提交会编译失败 | 采纳 | `gatu-orbit-loader.tsx:3,21,36` 属实。落点：阶段 2 的提交顺序（删除操作挪到第 2 个提交）、风险 #6 |
| 完整性-18 | completeness / minor | mono 版没有部件标识，颜色归属只能靠路径顺序 | 采纳 | 修订时比对了五个版本：路径数据逐条相同，mono 全部是 `currentColor`。落点：§1.1、阶段 2 的生成器断言、§6 |
| 完整性-19 | completeness / minor | `trading-agent-config` 不在验证组里（与契约-4 重复） | 采纳（与契约-4 合并） | 同契约-4 |

**规划者复核时的额外更正**（审查意见之外，对照仓库或线上核实）
1. §1.1 原稿写 SVG "只用 `path`、`title`、`style`"。实际只有 `svg`、`title`、`path` 三种元素，没有 `<style>`。
2. 官网线上状态，2026-10-01 用 HEAD 和 GET 请求读取：
   - 最后一次发布是 2026-07-19，标题仍是旧版。
   - `logo.svg`、`favicon.svg`、`og.png`、`robots.txt` 带 immutable 一年的缓存。
   - 仓库里多个官网文件在线上是 404。

   这些事实已写进 §1.4 第 9 条、D20、阶段 1a、阶段 2、阶段 4a、§4.1、风险 #29。
3. 原稿阶段 3 的依赖里列了 D10（历史记录），和动效无关，已删除。
4. AGENTS.md 的「Brand identity contract」原本安排在阶段 0 无条件加入，现在改为等 ADR 0027 被接受后再加，因为 AGENTS.md 只记录已经确定的规则。
5. `scripts/ci-workflows.test.mjs:116-120` 是通用的一致性检查，测试改名时不需要编辑它，只要让它继续通过。原稿把它列成了"必须同时修改的三处"之一，已改正。
6. 阶段 3 第一个提交改到的 8 个测试里，`global-modals-hip3-disclaimer`、`withdraw-form-ui`、`footer-bar` 不在 CI 里，已列入 CI 品牌组。`tradingview-chart` 和 `chart-theme-colors` 由 CI 的 glob 覆盖，不算缺口。
7. 修订时用仓库的 `tsc` 5.7.2 在 scratchpad 里做了最小样例：`moduleResolution: bundler` 下导入 JSON 可以编译（写在 D18）。这个检查不能代替终端工程本身的 typecheck。
