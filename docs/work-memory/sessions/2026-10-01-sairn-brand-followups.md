<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-01-sairn-brand-followups",
  "date": "2026-10-01",
  "title": "Sairn 品牌迁移的五项遗留：页头、设计稿、官网、跨浏览器、状态动效",
  "kind": "task",
  "status": "verified",
  "topics": ["brand-identity", "docs-governance", "static-hosting"],
  "summary": "处理品牌迁移执行记录的五项遗留（未推送、未发布）：已连接页头在 1182–约 1450 px 重叠，紧凑宽度改为 1379 px、不可存款按钮只显示图标并加回归测试；动效库缺的部分成交、提示、警告由库自己的引擎补做，状态符号、插图与按钮加载从导出文件生成后接入通知、状态页与握手按钮（ADR 0029，总包体基线 +6,544）；官网纠正开源/MIT/50×/无邮箱/无后端等不实说法并重拍截图、写发布手册；法律文本补日期并更新手机连接与充值说明；Privy 登录邮件 PNG Logo；三引擎品牌表面回归；补写 ADR 0027–0031 与 AGENTS 品牌契约；设计稿只换名称标签。sairn.ai 已于 2026-10-01 11:40Z 在 Cloudflare 注册，其余上线步骤未做。",
  "thread": null,
  "baseCommit": "f440fa1b",
  "commits": ["5a3bea4a", "7c6c4ae8", "471eb453", "ba846c58", "86fae41c", "9e90d6d9", "7a511af3", "09f67c3f", "cce48fa7", "1925425b", "38133264", "2baa44e2"],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-10-01-sairn-brand-migration-execution.md" },
    { "path": "docs/brand-assets.md" },
    { "path": "docs/adr/0029-brand-status-motion.md" },
    { "path": "docs/adr/0013-desktop-navigation-collapse.md" },
    { "path": "docs/adr/0027-brand-single-source-and-identifier-rename.md" },
    { "path": "docs/adr/0031-domain-move-to-sairn-ai.md" },
    { "path": "deploy/website/README.md" },
    { "path": "brand/loader-supplement/README.md" },
    { "path": "apps/terminal/tests/browser/top-nav-connected.pw.ts" },
    { "path": "apps/terminal/tests/browser/brand-surfaces.pw.ts" },
    { "path": "apps/terminal/src/lib/tests/status-motion-surface-contract.test.ts" },
    { "path": "designs/mockups.pen" }
  ],
  "supersedes": []
}
-->
# Sairn 品牌迁移的五项遗留：页头、设计稿、官网、跨浏览器、状态动效

## 背景与范围

同步记录，未取得可核对的任务标识。分支 `claude/from-dev-1001`，基线 `f440fa1b`（品牌迁移执行记录 [2026-10-01-sairn-brand-migration-execution](2026-10-01-sairn-brand-migration-execution.md) 的最后一个提交）。

用户要求继续审查执行记录列出的五项遗留，规划并执行修复；缺失的状态动效素材依据设计方动效库补做后替换旧的：

1. 状态动效没有接入，动效库缺「部分成交」「提示」「警告」三个符号；
2. 已连接钱包的页头没有测量（法语在 1182 px 未连接时只剩 29 px）；
3. 没有在 Safari、Firefox 和手机真机上看过；
4. `designs/mockups.pen` 仍是旧品牌；
5. 官网从 2026-07-19 起没有发布，累计差异未审查。

先用一个只读调研工作流（五路并行，每路报告保存在会话草稿目录，不入库）取证，再逐项修复。调研报告的结论在下文按项引用，引用处注明是调研结果还是本次复核。

## 结论与依据

### 设计稿 `designs/mockups.pen`

- 调研结果：文件里的旧品牌只有名称标签（`GATU` ×3、`gatu` ×3、`Hype UI` ×1）、三个 `HT` 字母徽标方块，以及上游早期探索稿的占位名 `ANVIL` 和字母 `A`（各 3 处）。没有路径或图片节点，没有旧品牌柠檬绿，也没有网址。颜色变量是上游 Anvil 的蓝紫色板，既不是 gatu 色也不是 Sairn 色。
- 采用：用只改叶子值的脚本替换 10 个名称标签（含 `ANVIL`，因为它占着产品名的位置，用户要求全部品牌标识换成 Sairn）。序列化与原文件逐字节往返一致，差异正好 10 行，叶子数、键顺序、末尾无换行、`\u` 转义数量都不变；`HYPE-USDC` 是 Hyperliquid 交易对，不改。
- 未改：`HT` / `A` 字母徽标方块和蓝紫色板。文件是 pen.dev 2.10 格式，没有任何路径节点可以参照写法，本机没有 pen.dev 无法渲染核对；一个路径节点只能填一种颜色，Sairn 横版组合需要三个；组件实例 `8GFpt` 按 id 覆盖了徽标节点的位置。用脚本造这些节点可能让文件打不开，所以留给在 pen.dev 里手工替换（步骤写在 `docs/brand-assets.md`）。色板不是令牌来源（唯一来源是 `brand/brand.json`），同步色板是另一个设计决定。

### 已连接页头

- 调研结果（夹具挂载真实 `TopNav`、`UserMenu`、存款可用性、语言目录与样式表，钱包会话、地区判定、配对开关与弹窗为桩；本地开发服务器、Chrome 154、每个宽度重新加载）：1182 px 到约 1450 px 之间已连接页头重叠，西班牙语、法语在 1182 px 为负间距，点 More 中心命中存款按钮，27 种组合 Settings 被推出视口；最宽组合（es、邮箱、`Deposit unavailable`、配对开）要到 1450 px 才留出 16 px。紧凑区（≤1181）最少余 294 px。WebKit 26.4、Firefox 140 与 Chrome 相差不超过 0.2 px。夹具的未连接校准与 §11 原有实测相差不超过 0.5 px。
- 采用：不可存款时存款按钮在所有桌面宽度只显示图标（可见文字与无障碍名称不一致会违反 WCAG 2.5.3，所以不显示「Deposit」）；紧凑宽度 1181 → 1379。修复后完整矩阵（804 次测量）显示最宽组合在 1370 px 余 16.3 px，于是在 1370 上加 10 px 余量给不同平台的字形度量，回归矩阵在 1380 px 余 26.3 px。
- 未采用：只改常量（要 1450，1440 屏也会紧凑）；只对已连接状态用更宽的断点（第二个变体、约十处分支类名、连接钱包时导航重新收纳）；宽屏账户标签上限降到 8rem（邮箱更早截断，留作后备）。取舍写在 ADR 0013 补充。
- 夹具改为回归测试 `top-nav-connected.pw.ts`：默认矩阵只测拉丁语言（字形来自打包的 IBM Plex，各平台一致）、地址与邮箱、两种存款状态、配对开，宽度取两个断点两侧；`TOP_NAV_CONNECTED_MATRIX=full` 跑完整矩阵。加入 CI 浏览器任务的两个分片，`ci-workflows.test.mjs` 固定这一步。

### 状态动效

- 调研结果：动效库 v1.3 交付 16 种动效和 7 个状态符号，只有 `page-loading` 已接入；通知与状态页仍是 Phosphor 图标加旋转图标，金库弹层把「结果未知」画成红色。库缺部分成交、提示、警告；设计方的按钮加载配色在实心按钮上对比度只有 1.28:1（深）和 2.83:1（浅）；交付的 `sairn-motion.js` 在本仓库无法 `require`。
- 采用（ADR 0029）：补充符号放在 `brand/loader-supplement/`，由导出命令用库自己的引擎渲染（先逐字节复现 66 个已交付符号），`brand:check` 校验来源哈希；几何与关键帧由 `brand:sync` 生成（不手抄），按加载层级拆成符号、按钮加载、插图三个模块；颜色映射到 `--text-*` 语义令牌，镂空记号 `--on-action`；组件 `StatusGlyph`、`BrandMotion`、`ButtonLoading`。接入订单通知、Sonner、未知结果通知、资金恢复提醒、充值/金库/API 钱包/跨链状态页、握手按钮和 16 px 复制反馈；被动加载保留转圈并在 `status-motion-surface-contract` 逐处登记。
- 先加固测试：8 个「没有转圈」的断言改用同时匹配旧转圈和新组件的选择器，避免换组件后空转。
- 包体：按加载层级拆分后，与 `f440fa1b` 的本地构建相比总包体 +6,544、桌面运行时启动 +769、移动 +151、交易启动闭包 +2,734（闭包预算仍有约 19 KB 余量）。超出总包体允许的 +10,000，按 Logo 先例带理由上调基线（`scripts/check-client-bundle-budget.mjs`）。拆分前总量多 297 字节、交易启动闭包多 502 字节。
- 取舍：API 钱包「用户拒签」从红叉改为中性的已取消符号（什么都没有提交）；充值「已提交到 Hyperliquid」沿用成功插图，与改动前一致，是否改为中间态待产品决定；partial 用成功色、info 用提示色待设计方确认。

### 跨浏览器与真机

- 调研结果：Chromium 147、WebKit 26.4、Firefox 140（本机已有的旧版内核，经 `executablePath` 启动，没有下载浏览器）中 Logo 填色、加载器动画与减少动态效果一致；带生产 CSP 也没有违规。iOS 模拟器（iPhone 16）的 Safari 中 Logo 深浅色正确（迁移阶段已核对）。
- 新增 `tests/browser/brand-surfaces.pw.ts`：在三个引擎、两种主题下核对 Logo、加载器、状态符号、插图、按钮加载与 Sonner 图标的实际填色等于令牌，动画只在标记为进行中的组件上循环，减少动态效果时没有运行中的 CSS 动画。CI 只跑 Chromium。调试时发现 CSS 过渡也被 `getAnimations()` 计入，断言只统计 `CSSAnimation`。
- 修正：Privy 后台 Logo 用在登录验证码邮件里，`appearance.logo` 管不到，且 Privy 只接受 PNG；派生 `brand/web/email-logo.png`（360×180 白底），同步到 `/brand/email-logo.png`，上线步骤与迁移计划已更正。
- 未修：WebKit 把 `favicon.svg` 当图片显示时不跟随模拟的深色（本机是浅色外观，无法区分是模拟还是真实行为）；`theme-color` 浅色主题下仍是深色（旧问题，已作为后续任务提出）。

### 官网与法律文本

- 调研结果：线上官网对应 2026-07-17 的内容；当时的「开源、MIT、可 fork、自托管」「50× 杠杆」「无邮箱、无账户」「无后端」「19+ 链 LiFi」等说法与私有仓库、条款 §10、邮箱登录、边缘服务和 CCTP 充值不符；首页截图仍是 GATU；页脚锚点在内页失效；占位博文会公开发布。
- 采用：逐条改为与代码一致的说法（费率写明 0.01% builder fee），截图从当前构建重拍并改为 Astro 带哈希导入，删除占位博文，canonical 与站点地图统一带结尾斜杠，新增文案契约测试（对旧文案 30 处违规失败）和发布手册 `deploy/website/README.md`（未执行）。
- 法律文本：改名提交改了六份法律文本却没更新 Last Updated，违反 `legal/README.md`，本次统一为 2026-10-01；`support.md`、`docs.md` 的手机连接改为现行的扫码流程（并注明「在可用时」），充值改为 Arbitrum USDC 经 CCTP。法务复核仍未进行，列为发布前提。

### 文档缺口

- 迁移计划预留的 ADR 0027–0031 与 AGENTS「品牌标识契约」在执行阶段都没写。本次补写（0029 由我写，其余由子任务起草、我复核）：只记录已实施的决定，状态写明未推送、未发布，并纠正了几处残留（`i18n-presentation.md` 的禁用名单写成两个 `sairn`、ADR 0010 的 `Loading GATU...` 追加更正、证书范围漏了旧主机名、`docs/work-memory/README.md` 增加名称对照）。
- 起草子任务发现 `sairn.ai` 已委派到 Cloudflare；我复核 WHOIS：创建于 2026-10-01T11:40:28Z，注册商 Cloudflare。早先 11:24 的权威查询还是 NXDOMAIN。归属账号仓库里没有记录。

## 对抗审查

`2baa44e2` 之后对 `f440fa1b..2baa44e2` 跑了一次只读审查工作流（状态动效、页头、官网与法律文本、文档、工具链五个视角，每个视角的发现再由一个独立代理尝试反驳）：确认 28 条（去重后约 20 条），驳回 6 条。确认并已修复的主要问题：

- 订单通知的 `partial` 状态一律画成成功色的半实心「部分成交」，但这个状态也用于只部分受理、带拒绝或撤销的批次；改为只在已核实的部分成交（交易所回包的部分成交，或按成交计数且没有错误）上用它，其余用 warning，并补测试。
- 循环中的 `submitting` 用了成功色，违反「等待指示不用成功色」的既有规则；生成器区分校验用的设计方颜色与终端渲染色，`submitting` 改为中性色，契约测试禁止进行中的循环用成功色。
- 生成器对未知元素、分组属性、标志路径的额外属性会静默丢弃；改为一律失败，并用变异输入测试。补充目录删除后脚本会直接崩溃；改为缺失时跳过、生成器优先取 `brand/loader`。
- 不可存款的纯图标按钮在紧凑宽度以上偏右约 5 px（按钮组件的左侧图标内边距覆盖了 `px-0`）；改为把图标作为子元素渲染，回归测试加「图标居中、紧凑宽度及不可存款时为纯图标」断言，对旧写法做过变异检查。
- `status-motion-surface-contract` 没有进 CI；已加入品牌测试步骤与 `test:brand`，`ci-workflows.test.mjs` 固定。
- 官网说 builder fee 适用于「每一笔订单」，实际 TWAP 与现货买入不收（`domain/trade/order-fee-quote.ts`）；措辞改为永续订单与现货卖出，文案测试同时拒绝「every order」与写死的杠杆上限（「up to 40×」）。隐私 FAQ 补上经 Privy 的钱包登录。
- 发布手册：DNS 改为在证书、别名、`curl --resolve` 预验证之后；首次发布要删除已撤下的 `/blog/welcome/`（只对 HTML 做带 `--delete` 的同步，先 `--dryrun`）；回滚改用 `aws s3 cp --recursive`（`sync` 会跳过同大小的旧备份文件）。
- 支持页与产品文档把「批准 Agent」写成所有用户的必经步骤；改为只适用于外部钱包，邮箱登录由内嵌钱包签名。
- 文档：模块名、`brand:sync` / `brand:export-motion` / `brand:derive-icons` 的分工、ADR 0031 的过期说法、移动端数据规范被拆开的验证句、CHANGELOG 的插图尺寸、ADR 0029 与通知文档里「符号与旁边文字同色」「部分成交通知总附带已成交 x / y」两处不实说法，以及本记录缺少状态动效的验证。

驳回的 6 条包括：CHANGELOG 未逐项列出 1280/1366 宽度的变化（文档没有错误说法）、ADR 0028 关于 Logo 令牌使用方的表述（回溯记录描述的是当时的决定）、两个新夹具的 Vite 缓存隔离没有专门测试（当前隔离正确）、`brand:check` 不检测邮件 Logo 是否需要重新派生（没有承诺过）。

## 验证与限制

- 设计稿：替换脚本自带往返校验与差异行数断言，另一个独立脚本逐叶子比对原文件与结果（变化 10 个、增删 0、键顺序变化 0）；`grep -i -E 'gatu|hype ui|hyperterminal'` 无命中。没有用 pen.dev 打开或渲染。
- 页头：修复后的完整矩阵先在 1369 断点版本上运行（74 通过、1 失败；那一次测量时字体集仍在加载，推测与运行期间样式表被热更新有关，几何不变，测试已加「字体未就绪则等待后重测」）；改为 1379 后回归矩阵 13 项通过（1.7 分钟）。审查修复后（图标居中）在 1379 上重跑完整矩阵：75 项全部通过、804 次测量没有重叠、换行或越界，1380 px 最窄 26.3 px（es）、28 px（fr），紧凑区最少 294 px，660 次纯图标测量全部居中；新断言对旧写法（按钮左侧图标内边距）做过变异检查，在 1380、1440 px 失败。`top-nav.test.tsx`、`desktop-nav-layout.test.ts` 通过；`node --test scripts/ci-workflows.test.mjs` 通过。Windows 字体、真机与真实钱包会话未测。
- 状态动效与通知：相关单测、契约测试与组件测试通过（`status-motion-contract`、`status-glyph`、`status-motion-surface-contract`、`order-toast-placement`、`toaster-config`、资金与 Earn 未知通知、资金恢复提醒、充值状态页、金库与 API 钱包弹层、`trading-action-button`）；`status-motion-surface-contract` 对把金库未知结果改回转圈的变异失败；补充符号的导出 `--check` 复现一致，`brand:check` 对篡改符号、定义文件与多余文件三种变异都失败。
- 三引擎：`tests/browser/brand-surfaces.pw.ts` 在 Chromium、WebKit 26.4、Firefox 140（本机已有的 firefox-1489 内核）× 深浅主题 6 项通过（审查修复前后各跑一次）；截图人工查看过。iOS 模拟器 Safari 的 Logo 检查是迁移阶段做的，本阶段没有在模拟器或真机上看状态动效。
- 包体：Node 22.15、`NODE_ENV=production` 的 `pnpm build`，与 `f440fa1b` 的本地构建相比总包体 +6,544（审查修复前测量），已上调基线；审查修复后重新构建：总包体 3,193,461（新基线 +7,540，允许 +10,000），桌面运行时启动 +9,254、移动 +6,909（相对各自基线，允许 +10,000），交易启动闭包 −18,819；与修复前相比总包体多 374 字节，原因没有逐块拆分。
- 全量：`pnpm typecheck` 通过；终端完整 Vitest 在审查前（`2baa44e2` 之前的工作区，含全部状态动效改动）644 个文件 7,966 项通过（1 个文件跳过）；审查修复后跑了两次：第一次与浏览器矩阵并行，3 个文件超时（单独重跑 33 项通过）；第二次单独运行时本机负载均值约 30（其他会话），644 个文件中 4 个文件 5 项超时（`positions-panel-preload`、`dashboard-chrome`、`global-modals-hip3-disclaimer`、`user-menu`，都是动态导入大模块图的用例），其余 7,958 项通过；这 4 个文件单独重跑 72 项全部通过。没有取得一次全绿的完整运行。`pnpm test:brand`、`node --test scripts/*.test.mjs`（51 项）、`pnpm test:cloudfront`（44 项）、`tests/brand-cross-app`（4 项）、官网测试 9 项与构建通过，构建产物里没有 `gatu`。
- 浏览器回归（审查修复前的工作区，本机 Chrome）：notifications 19、account-actions 24、mobile-trade-all-orders 47、position-close-all 41、brand-surfaces 2、top-nav-connected 13（含新居中断言）、user-menu-recovery 10 全部通过；共享配置 138 项通过（审查修复后的工作区）。
- 官网：首页两张截图从 `94175c1c` 的终端构建用 Playwright 截取并人工查看；构建、三引擎爬取由官网子任务完成（子任务报告，未在本记录逐项复核），我复跑了测试与构建。没有发布，也没有运行任何 `aws` 命令。
- 没有推送，也没有执行任何仓库外操作；`sairn.ai` 的注册不是本任务做的，归属未核实。

## 后续与替代关系

- 在 pen.dev 中把三个 `HT` 徽标方块与 `A` 方块换成 Sairn 横版组合（见 `docs/brand-assets.md`「设计稿」）。
- 设计方确认：补充的 partial、info、warning 三个符号，partial 的颜色，`submitting` 在终端改为中性色，悬停色。
- 产品决定：充值「已提交到 Hyperliquid」是否继续用成功插图；`gatu.ai` 在新域名上线后的去向；官网首页浮动标签里写死的延迟数字、`Non-custodial` 等措辞的法务确认、空博客是否继续收录。
- 法务：Sairn Corp. 是否已存在、改名后法律文本的书面复核（发布前提）。
- 仓库外上线步骤（`docs/brand-assets.md`「域名切换到 sairn.ai」与 `deploy/website/README.md`）：确认 `sairn.ai` 的 Cloudflare 区归属、DNS、证书（覆盖新旧两组主机名）、CloudFront 别名、Privy 后台（含邮件 Logo）、邮件、源站请求策略。
- 已提出两个单独任务：移动端下单按钮提交时仍转圈（与桌面不一致）；`theme-color` 在浅色主题下仍是深色。
- 真机与真实浏览器外壳：macOS 深色外观下 Safari 标签页 favicon（WebKit 把 `favicon.svg` 当图片时不跟随模拟深色）、iOS/Android 添加到主屏、真实钱包与真实订单下的通知与状态页。
- 迁移计划中尚未实现的部分（ADR 0031 列出）：迁移闸门、kill-switch Service Worker、旧主机重定向；计划里的 `brand-source` zod 校验、ΔE 契约测试未实现。
