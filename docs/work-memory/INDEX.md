# 工作记忆索引

由 `pnpm memory:index` 生成；请编辑任务记录，不直接修改此文件。

历史记录用于检索证据，不覆盖当前 AGENTS.md、专题规范或代码。记录日期不等于事件发生日期；测试结论只对正文注明的版本和范围有效。

[使用与维护说明](README.md)

## 按议题检索

### PR 复审与回归验证

当前规范：[docs/terminal-review-remediation.md](../../docs/terminal-review-remediation.md)

- [字体实践审查：对照官方终端，修复图表字体栈、共享字号刻度与错误页字体](sessions/2026-09-20-font-practice-review.md) — 2026-09-20；已验证，范围见正文。webfont 加载契约合规；图表 iframe 里的 IBM Plex 从未生效，改为系统字体栈（iframe 内新旧栈 measureText 80 组完全相同）；packages/ui 字号刻度对齐规范并加契约测试；bootstrap 错误页不再依赖 webfont；相对单位字号纳入棘轮。250 处任意 px 字号按现行规则不横扫，仍是受控债务。移动端图表与生产构建未验证。
- [Grok 4.6 对抗审查六个弹窗/平仓提交：2 P1 属实并修复](sessions/2026-09-18-grok-dialog-commits-review.md) — 2026-09-18；已整理，验证见正文。grok-4.6 只读审查 0ad17aea…08e2057d 冻结快照，报告 2 P1 / 2 P2 / 3 P3；F1/F2/F4/F5/F6/F7 已修（守卫经变异检查钉住），F3 记为 ADR 已知限制；逐条核实：反手与全部平仓退场窗口内确认按钮仍可点（P1）、市价平仓取消退场期间 canSubmit 未含 isClosing（P1）属实；后台执行绑在随路由卸载的弹窗实例（P2）与 PnL 分享退场仍直接卸载（P2）属实；ADR §6 引用、CHANGELOG「一条通知」措辞、idle 预热测试不覆盖 requestIdleCallback 三条 P3 属实。其「无过渡时 onOpenChangeComplete 同步触发会卡会话」的存疑项经 Base UI 源码核实不成立。未修改代码。
- [Grok 对抗审查 PR #26（启动、md 堆叠、路由揭示、导航收纳）](sessions/2026-09-17-grok-pr26-review.md) — 2026-09-17；已整理，验证见正文。grok-4.6-build 只读审查 PR #26 冻结快照，报告 2 P1 / 4 P2 / 1 P3；本会话逐条核实全部成立，其中 5 条为 PR 之前既有、被首帧真实 chrome 放大；未修改代码，修复待决策。
- [部署包预算：订单队列去重与固定参数复验](sessions/2026-09-12-deploy-bundle-margin.md) — 2026-09-12；已验证，范围见正文。服务器交易页面 gzip 超限 11 字节；统一订单队列计数与徽标渲染，保留预算和状态优先级，本地完整构建通过，交易页面距上限 227 字节，线上待验证。
- [中性卡片底色与相邻弱填充全量源码审查](sessions/2026-09-12-neutral-surface-audit.md) — 2026-09-12；已整理，验证见正文。同色卡片 43 次引用涉及 28 文件；扩展 hover 与弱填充后覆盖 106 文件，区分只读精简候选、交互状态、共享覆盖和未启用分支；未修改 UI、未逐页视觉验收。
- [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) — 2026-09-12；已整理，验证见正文。核对构建中断与包预算失败，删除未使用的成交错误分支、共用订单类型消息描述并修复过期语言测试夹具；保留快照与交互检查。
- [PR #22：复审、夹具隔离及版本化验证](sessions/2026-09-12-pr22-review.md) — 2026-09-12；已整理，验证见正文。旧版本 CI 全绿不能继承到新提交；最新基线有三项构建失败，待独立排查。

### 移动端与桌面下单布局

当前规范：[docs/order-entry-layout-audit.md](../../docs/order-entry-layout-audit.md) · [docs/order-entry-surface-parity.md](../../docs/order-entry-surface-parity.md) · [docs/desktop-grid-layout.md](../../docs/desktop-grid-layout.md)

- [PR #27 预算超限：下单表单三个弹窗改为按意图懒加载](sessions/2026-09-18-trade-terminal-page-budget.md) — 2026-09-18；已整理，验证见正文。PR #27 的四个 Build terminal 任务因 trade-terminal-page 128,778 B 超出 127,242 B 上限而失败（main 为 127,085）；增量来自 MobileAccountView 去掉提前 return 后被 React Compiler 编译，以及移动端订单簿表头芯片。未重定基线，改为把保证金模式、杠杆、账户模式三个弹窗移出启动 chunk：首次打开才加载、指针或焦点到达下单表单时按意图预热，失败时不刷新页面而是给出重试与显式刷新。trade-terminal-page 降到 126,255 B，桌面与移动端总启动分别减少 5.7 KB 与 4.1 KB。最初的空闲预热版本按基线文档的计数规则会让桌面运行时预算超限，已弃用。
- [桌面 md 断点右列堆叠实施](sessions/2026-09-17-desktop-md-stacked-right-column.md) — 2026-09-17；已整理，验证见正文。按 ADR 0011 把 1001–1420 px 桌面网格改为图表列 10/14 + 右列堆叠（下单面板、订单簿、账户信息），存储键升到 v12；验证结果与限制见正文。
- [移动端六个表面迁移到共享占位视图](sessions/2026-09-16-mobile-views-migration.md) — 2026-09-16；已整理，验证见正文。表面 6 六个移动表面与外框改用共享纯视图；旧 class 模块删除，浏览器服务被 EPERM 阻止，盒子实测待 reviewer。
- [中性卡片底色与相邻弱填充全量源码审查](sessions/2026-09-12-neutral-surface-audit.md) — 2026-09-12；已整理，验证见正文。同色卡片 43 次引用涉及 28 文件；扩展 hover 与弱填充后覆盖 106 文件，区分只读精简候选、交互状态、共享覆盖和未启用分支；未修改 UI、未逐页视觉验收。
- [下单布局：自然高度、TWAP 与双端表单](sessions/2026-09-12-order-entry-layout.md) — 2026-09-12；已整理，验证见正文。保留双端草稿与字段语义，移动表单自然增长；桌面遵守独立网格约束。
- [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) — 2026-09-12；已整理，验证见正文。核对构建中断与包预算失败，删除未使用的成交错误分支、共用订单类型消息描述并修复过期语言测试夹具；保留快照与交互检查。

### 行情字段与被动恢复展示

当前规范：[docs/mobile-data-presentation.md](../../docs/mobile-data-presentation.md) · [docs/price-source-audit.md](../../docs/price-source-audit.md) · [docs/terminal-loading-audit.md](../../docs/terminal-loading-audit.md)

- [移动端六个表面迁移到共享占位视图](sessions/2026-09-16-mobile-views-migration.md) — 2026-09-16；已整理，验证见正文。表面 6 六个移动表面与外框改用共享纯视图；旧 class 模块删除，浏览器服务被 EPERM 阻止，盒子实测待 reviewer。
- [移除启动占位体系](sessions/2026-09-16-remove-startup-placeholders.md) — 2026-09-16；已整理，验证见正文。按 ADR 0010 移除启动占位；类型、格式、翻译与全部产物预算通过，全量测试保留已知基线失败，完整构建受沙箱 preview 监听限制。
- [热访问启动：为什么第 2..n 次仍出现占位壳，以及经核实的改进计划](sessions/2026-09-16-warm-visit-startup-plan.md) — 2026-09-16；已整理，验证见正文。三次连续访问实测：热访问壳 0.16–0.28 s、真实终端 0.43–0.65 s（4× CPU 1.36–1.42 s，全是 JS 求值与 provider 挂载）；官方站热访问空白 1.4–1.7 s（4× 3.1–3.6 s）且资源每次重验证，照抄是回归。真正多余的等待是持久化目录丢失（尾沿节流无隐藏时写回）、24 h 播种上限、壳 HTML 每次 304。P1 三项已实现；Round 2 修复 SW 响应体克隆竞态并实现 Markets Activity 与弹窗 matchMedia 两项 P2。未发布，性能与真机复测待完成。
- [移动占位壳与真实终端逐像素对齐](sessions/2026-09-15-mobile-shell-parity.md) — 2026-09-15；已验证，范围见正文。移动启动占位原与真实终端完全不同（头部缺三个控件、48px 市场栏、按比例分配的交易区、4 个标签）；改为复用真实组件的 class 常量绘制同一套 chrome，Playwright 在 360/390/430 三档视口、深浅主题、中英文下实测所有结构盒子一致；运行时回退改用翻译标签与持久化页签。
- [行情恢复：字段来源、静默占位与操作守卫](sessions/2026-09-12-market-recovery.md) — 2026-09-12；已整理，验证见正文。被动恢复不闪烁错误提示，展示回退与交易可用性分开，区分 midPx、markPx 和空快照。
- [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) — 2026-09-12；已整理，验证见正文。核对构建中断与包预算失败，删除未使用的成交错误分支、共用订单类型消息描述并修复过期语言测试夹具；保留快照与交互检查。

### Vite 依赖缓存与浏览器夹具

当前规范：[docs/runtime-guardrails.md](../../docs/runtime-guardrails.md)

- [PR #22：复审、夹具隔离及版本化验证](sessions/2026-09-12-pr22-review.md) — 2026-09-12；已整理，验证见正文。旧版本 CI 全绿不能继承到新提交；最新基线有三项构建失败，待独立排查。
- [Vite 缓存：应用与浏览器夹具独立](sessions/2026-09-12-vite-cache.md) — 2026-09-12；已整理，验证见正文。端口和 root 不足以隔离依赖缓存；专用夹具还需独立入口和完整 mock。

### 账户模式与资金操作

当前规范：[docs/account-overview.md](../../docs/account-overview.md) · [docs/withdrawals.md](../../docs/withdrawals.md) · [docs/cctp-deposits.md](../../docs/cctp-deposits.md)

- [链接移动设备：官方机制实测、17 项差距图与体验对齐实施](sessions/2026-09-18-link-device-alignment.md) — 2026-09-18；已验证，范围见正文。从官方产物实测「Link Mobile Device」：右上角图标一键 approveAgent（永久 Mobile QR）、4 秒按住显示、60 秒自动关闭、二维码为 /trade?link= 明文私钥、手机解析后以 API 钱包身份连接。我方实现更严格但生产不可达（Lambda 对票据路由固定 503、开关关闭）。41 代理工作流产出 17 项差距并逐项对抗核验；按 ADR 0015 实施 D1–D6（顶栏入口、单步审批、官方文案、圆环按住、倒计时、手机端 Agent-only 原因、扫描器相机选择、显式 local scope），D7 票据存储三备选待用户决定。
- [邮箱钱包标识、密钥导出入口及发送网络说明修复](sessions/2026-09-16-email-wallet-ui-fix.md) — 2026-09-16；已整理，验证见正文。修复紧凑布局邮箱身份显示，补齐精确所有者邮箱钱包导出入口，区分 HyperCore 发送与 Arbitrum 提款；真实密钥导出未执行。
- [Across 持久充值地址接入规划](sessions/2026-09-13-across-deposit-address-plan.md) — 2026-09-13；已整理，验证见正文。规划邮箱用户的 Across 持久充值地址入口，保留外部 CCTP 与旧余额恢复；权限、持久存储、资金落点和真实转账验证仍是实施前置条件。
- [Across 官方文档共享阅读入口](sessions/2026-09-13-across-docs-entry.md) — 2026-09-13；已整理，验证见正文。以官方索引和按需页面核验接入 Across 文档，Codex 与 Claude 共用项目入口；不安装交易工具，API Markdown 与 MCP 的覆盖缺口需回退正式页面。
- [Across 地址方案：Claude 审查逐项复核与首期收缩](sessions/2026-09-13-across-plan-review-followup.md) — 2026-09-13；已整理，验证见正文。复核 P0/P1/P2 建议，补激活、首次账户和导出恢复，首期改两表与按需查询；纠正 recipient、request ID、index-0、最低额和部署状态推断，生产契约与真实资金验收仍待完成。
- [Across 二轮复审：N1–N8 验收与恢复边界](sessions/2026-09-13-across-rereview-resolution.md) — 2026-09-13；已整理，验证见正文。补 legal 可判定验收、导出兼容、token、密钥和受控恢复；不采用 WebView 一律禁用、10 USDC 通用引导或交易 hash 主键，生产依赖仍未完成。
- [账户与资金：模式语义、共享概览与精确转账](sessions/2026-09-12-account-funding.md) — 2026-09-12；已整理，验证见正文。模式标签依赖已解析服务器状态；桌面与移动共享账户语义，金额及签名身份严格校验。
- [中性卡片底色与相邻弱填充全量源码审查](sessions/2026-09-12-neutral-surface-audit.md) — 2026-09-12；已整理，验证见正文。同色卡片 43 次引用涉及 28 文件；扩展 hover 与弱填充后覆盖 106 文件，区分只读精简候选、交互状态、共享覆盖和未启用分支；未修改 UI、未逐页视觉验收。

### 移动配对与发布校验

当前规范：[docs/adr/0015-link-device-alignment.md](../../docs/adr/0015-link-device-alignment.md) · [deploy/cloudfront/README.md](../../deploy/cloudfront/README.md)

- [链接移动设备：官方机制实测、17 项差距图与体验对齐实施](sessions/2026-09-18-link-device-alignment.md) — 2026-09-18；已验证，范围见正文。从官方产物实测「Link Mobile Device」：右上角图标一键 approveAgent（永久 Mobile QR）、4 秒按住显示、60 秒自动关闭、二维码为 /trade?link= 明文私钥、手机解析后以 API 钱包身份连接。我方实现更严格但生产不可达（Lambda 对票据路由固定 503、开关关闭）。41 代理工作流产出 17 项差距并逐项对抗核验；按 ADR 0015 实施 D1–D6（顶栏入口、单步审批、官方文案、圆环按住、倒计时、手机端 Agent-only 原因、扫描器相机选择、显式 local scope），D7 票据存储三备选待用户决定。
- [移动配对方案 B 实施：去服务端票据的纯客户端传输（信封 v3）](sessions/2026-09-18-mobile-sync-ticketless-implementation.md) — 2026-09-18；已整理，验证见正文。按 ADR 0015 D7 方案 B 完成代码与文档：信封 v3、TTL 2 分钟、揭示后 60 秒单调时钟窗口、桌面本地 syncId、手机端 syncId 本地去重、v1/v2 信封提示刷新；删除票据客户端/服务端/路由、Lambda 503 桩、CloudFront 转发与 EC2 时代 mobile-sync 发布脚本。定向测试与 typecheck 通过；pnpm build 因既有 trade-terminal-page 预算超限失败（改动不在该 chunk）；全量 vitest 余 8 个文件 32 项基线红（干净 HEAD 同样失败）。静态托管实测、真机矩阵、对抗安全复核未执行，生产开关保持关闭。
- [部署第 2 步：已安装 Caddy 配置与仓库不一致](sessions/2026-09-12-caddy-config-mismatch.md) — 2026-09-12；已整理，验证见正文。Caddy 转发头警告不是中止原因；管理员依次验证、安装、reload 仓库配置后重跑部署，服务器恢复尚待验证。
- [部署包预算：订单队列去重与固定参数复验](sessions/2026-09-12-deploy-bundle-margin.md) — 2026-09-12；已验证，范围见正文。服务器交易页面 gzip 超限 11 字节；统一订单队列计数与徽标渲染，保留预算和状态优先级，本地完整构建通过，交易页面距上限 227 字节，线上待验证。
- [移动配对：常规发布自动门控与可选真机晋级](sessions/2026-09-12-pairing-release.md) — 2026-09-12；已整理，验证见正文。普通部署允许配对开关开启；自动边缘门控与可选 promote 真机验收是不同路径。

### 工作记录与索引维护

当前规范：[docs/work-memory/README.md](../../docs/work-memory/README.md)

- [建立可追溯工作记录与定期索引](sessions/2026-09-12-work-memory.md) — 2026-09-12；已验证，范围见正文。三份本地可见记录快照、六个历史议题、生成与校验脚本，以及每周维护任务。

### 静态托管与 SPA 壳

当前规范：[docs/adr/0005-spa-static-shell.md](../../docs/adr/0005-spa-static-shell.md) · [deploy/cloudfront/README.md](../../deploy/cloudfront/README.md)

- [CloudFront 发布闸门：暴露资金或凭证路径的构建需要上传时再确认](sessions/2026-09-19-cloudfront-release-gates.md) — 2026-09-19；已整理，验证见正文。补上 2026-09-18 清理 EC2 部署代码时发现的缺口：旧脚本会拒绝「主网赞助充值开关」与运营方二次确认不一致的构建，CloudFront 流程没有等价检查。现在构建把实际生效的赞助充值开关写进 build-meta.json（cctpDeposits，与应用同一个解析函数），deploy.mjs sync 读取构建产物：开了主网赞助充值或移动配对而没带 --allow-* 参数、带了参数而构建没开、或构建没有记录闸门，--execute 一律拒绝；verify 比较线上与本地的闸门状态。环境文件拼写类检查（Privy ID、Agent 名、默认网络）未移植并已写明。只在本地分支实现，未推送、未发布。
- [从仓库移除已退役的 EC2 部署代码与票据时期文档](sessions/2026-09-18-retire-ec2-deploy-files.md) — 2026-09-18；已整理，验证见正文。EC2 宿主 2026-09-17 停机、服务端票据 2026-09-18 移除之后，仓库里仍留着 12 个 EC2 部署文件和 6 份票据时期文档。本次把它们从工作树移除（原文保留在提交 5d393572），四个读取这些文件的 Vitest 契约改为钉住 CloudFront 模块或去掉已无对象的断言，现行文档的链接改指 CloudFront 手册，四份旧工作记录的 sources 改为该提交的永久链接。核对中发现一处迁移遗留缺口：旧脚本对 CCTP 主网赞助开关的二次确认校验在 CloudFront 发布流程里没有等价物，已在 cctp-deposits.md 如实写明，未补实现。
- [生产发布 cloudfront-2026-09-17-p21（PR #26 分支 c59d13a8）](sessions/2026-09-17-cloudfront-release-p21.md) — 2026-09-17；已验证，范围见正文。按 CloudFront 日常发布 runbook 把 claude/placeholder-parity@c59d13a8 发布到 app.gatu.ai 与 testnet.gatu.ai：函数、Lambda、S3 同步、两个失效、两个 verify 全部通过；发布前后线上加载与几何对比见正文。
- [退役 EC2 + Caddy + Nitro 常驻进程，仓库切换为 CloudFront 单一架构](sessions/2026-09-17-ec2-retirement.md) — 2026-09-17；已整理，验证见正文。用户 2026-09-17 10:35Z 停机 EC2 i-058ca09d0533fc11d；仓库随之关闭 Nitro 预压缩、CI 去掉 Caddyfile 校验与 EC2 发布脚本测试并改跑 CloudFront 工具测试、deploy/README.md 标为历史资料、ADR 0005 与计划文档补退役状态；routeRules CSP 因两个契约测试仍钉住而留待后续。
- [旧架构（EC2 + Caddy + Nitro）到新架构（CloudFront + S3 + Lambda）迁移完成度核对](sessions/2026-09-17-ec2-to-cloudfront-migration-audit.md) — 2026-09-17；已整理，验证见正文。流量层已完全切到 CloudFront/S3/Lambda（DNS、分发源、Lambda、verify 全部核实）；旧 EC2 仍在运行且其 Caddy 已被改为代理到 CloudFront、22/80/443 对全网开放，尚未按 runbook 第 11 步退役；deploy/README.md 与两份计划文档仍把 EC2 描述为现状。
- [交易路由在首屏惰性片段解析后揭示（ADR 0012）](sessions/2026-09-17-trade-route-reveal.md) — 2026-09-17；已整理，验证见正文。热刷新路由揭示被 React 300 ms fallback 节流拖到 447 ms；bootTradeRoute 改为返回等待首屏惰性片段的 Promise 并由 beforeLoad await，带 1500 ms 上限；改动前后本地时间线与验证见正文。
- [二三次刷新对照：app.gatu.ai 与官方终端](sessions/2026-09-17-warm-reload-comparison.md) — 2026-09-17；已整理，验证见正文。热刷新时 app.gatu.ai 零网络字节（SW 回壳 + immutable 资源），官方每次刷新约 61 个 304 条件请求；两站网格就绪都约 0.45–0.7 s，时间花在 JS 编译执行与初始化；我们的导航栏要等钱包运行时块，是可见的优化点。
- [桌面账户面板：单一来源展示组件迁移](sessions/2026-09-16-account-panels-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 5 共享账户页签、概览与按钮纯视图；394 项通过，18 项既有 mock 失败前后不变；类型、Biome 与 memory 检查通过，浏览器因沙箱 EPERM 待 reviewer。
- [Dashboard 壳：单一来源 frame 迁移](sessions/2026-09-16-dashboard-shell-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 7 统一 dashboard 页面与占位 frame、路由 preset 和 chrome；341 项自动回归及类型、格式检查通过，盒子实测留给 reviewer。
- [桌面市场头与收藏条：单一来源展示组件迁移](sessions/2026-09-16-market-header-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 1 抽取五个纯视图，真实界面与静态及运行时占位共用标记；指标改为内容宽度和 32px 间距，标签统一首字母大写。初轮指定回归 207 项通过；round 2 改用隐形典型文本预留宽度及路由已知名称/类型，指定回归 81 项、补充回归 102 项通过，浏览器复测留给 reviewer。
- [移动端六个表面迁移到共享占位视图](sessions/2026-09-16-mobile-views-migration.md) — 2026-09-16；已整理，验证见正文。表面 6 六个移动表面与外框改用共享纯视图；旧 class 模块删除，浏览器服务被 EPERM 阻止，盒子实测待 reviewer。
- [桌面订单簿 chrome 单一来源迁移](sessions/2026-09-16-orderbook-chrome-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 3：桌面订单簿列头、侧容器、价差共用纯视图，页签和分组按钮与真实 primitive 对照；数据前分组显示 —，Playwright 留给 reviewer。
- [启动占位单一来源：ADR 0009 与展示组件规则](sessions/2026-09-16-placeholder-single-source-adr.md) — 2026-09-16；已整理，验证见正文。核对确认桌面壳九个 frame、移动壳与运行时占位是三份手写实现，唯一共享的是网格几何；采纳「展示组件是几何唯一来源」的架构：只接 props 的 *-view.tsx 由运行时容器与壳共同渲染，占位 props 单一来源，导入边界与一致性测试钉住，inert 取代禁止交互元素；本轮只落 ADR、规则与索引，迁移未开始。
- [移除启动占位体系](sessions/2026-09-16-remove-startup-placeholders.md) — 2026-09-16；已整理，验证见正文。按 ADR 0010 移除启动占位；类型、格式、翻译与全部产物预算通过，全量测试保留已知基线失败，完整构建受沙箱 preview 监听限制。
- [桌面顶栏、页脚与外框单一来源迁移](sessions/2026-09-16-top-nav-footer-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 2：六个纯视图共享桌面顶栏、页脚、外框与按钮几何；Dropdown 增加 opt-in renderTrigger；匿名 CTA 144px、时钟占位及 compact 收折统一。自动验证见正文，Playwright 待 reviewer。
- [桌面交易面板框架：单一来源展示组件迁移](sessions/2026-09-16-trade-panel-view-migration.md) — 2026-09-16；已整理，验证见正文。表面 4 桌面下单共享视图迁移；Round 2 删除 slider/percent 应用复制树、共用纯输入样式、同步持久化滑点；reviewer 前版几何测量与本轮验证范围分别记录。
- [热访问启动：为什么第 2..n 次仍出现占位壳，以及经核实的改进计划](sessions/2026-09-16-warm-visit-startup-plan.md) — 2026-09-16；已整理，验证见正文。三次连续访问实测：热访问壳 0.16–0.28 s、真实终端 0.43–0.65 s（4× CPU 1.36–1.42 s，全是 JS 求值与 provider 挂载）；官方站热访问空白 1.4–1.7 s（4× 3.1–3.6 s）且资源每次重验证，照抄是回归。真正多余的等待是持久化目录丢失（尾沿节流无隐藏时写回）、24 h 播种上限、壳 HTML 每次 304。P1 三项已实现；Round 2 修复 SW 响应体克隆竞态并实现 Markets Activity 与弹窗 matchMedia 两项 P2。未发布，性能与真机复测待完成。
- [SPA 壳：在分支上跑通静态托管构建](sessions/2026-09-13-spa-shell-spike.md) — 2026-09-13；已整理，验证见正文。TanStack Start SPA 模式在 claude/spa-mode 分支构建通过并本地静态托管验证；第二检查点把 geo/错误上报改为可移植的 /api/* 处理器并静态化 build-meta.json；第三检查点关闭运行时 SSR（静态壳中间件）、补 /join 标记、旧路径别名与发布 geo 探针；CDN 搬迁与边缘挂载仍未完成。

### Agent 规则与文档治理

当前规范：[AGENTS.md](../../AGENTS.md) · [docs/documentation-system.md](../../docs/documentation-system.md) · [docs/README.md](../../docs/README.md)

- [字体实践审查：对照官方终端，修复图表字体栈、共享字号刻度与错误页字体](sessions/2026-09-20-font-practice-review.md) — 2026-09-20；已验证，范围见正文。webfont 加载契约合规；图表 iframe 里的 IBM Plex 从未生效，改为系统字体栈（iframe 内新旧栈 measureText 80 组完全相同）；packages/ui 字号刻度对齐规范并加契约测试；bootstrap 错误页不再依赖 webfont；相对单位字号纳入棘轮。250 处任意 px 字号按现行规则不横扫，仍是受控债务。移动端图表与生产构建未验证。
- [Connect Wallet 按钮悬停态：去掉整体淡出，补上暗色面板按钮的悬停反馈](sessions/2026-09-19-connect-cta-hover-states.md) — 2026-09-19；已整理，验证见正文。头部 Connect Wallet 同时用 hover:bg-action-hover 和 hover:opacity-90，暗色下两者抵消（#edeef2 → 合成约 #e7e8e9，反而略暗）且 opacity 不在过渡列表里会跳变；订单面板同名按钮暗色下静止与悬停填充同为 6% 白。改为只走 action 令牌、过渡含 scale，面板暗色悬停用 fill-press（12% 白）。暗色下两个同名按钮一实心一幽灵的层级差异未动，待设计决定。
- [暗色浮层与遮罩改为终端色相，并修复语言菜单禁用文字](sessions/2026-09-19-dark-overlay-hue-family.md) — 2026-09-19；已整理，验证见正文。实测暗色下菜单 bg-overlay 仍是共享库紫灰 #292b33（色相 228°）、遮罩仍是藏蓝 #000626，而终端基色是青黑 #0f1a1f（199°）；改为等亮度的 #212d33 与 #03090ca8，语言菜单禁用文字由 12% 白改为 60% 白（1.46:1 → 6.09:1）。圆角、字体、菜单皮肤重复等其余审查项未处理。
- [菜单共享皮肤、弹窗统一圆角与边框，并让 cn() 认识项目刻度](sessions/2026-09-19-popup-skin-and-dialog-chrome.md) — 2026-09-19；已整理，验证见正文。根因是 tailwind-merge 不认识项目的圆角、阴影、字体刻度，覆盖基础组件时两个类都保留、由样式表顺序决定，于是各处堆 !important；修复 cn() 后把 5 份菜单皮肤收敛为一份、桌面弹窗统一 16px 圆角加 1px 边、底部抽屉默认 16px，并用棘轮测试钉住 241 处任意字号、228 处任意圆角、18 处 ! 表面覆盖。全仓批量替换与 market-close 令牌改名未做。
- [弹窗首开转圈与关闭闪现：预热惰性弹窗并恢复进出场过渡](sessions/2026-09-18-dialog-transitions-and-preload.md) — 2026-09-18；已整理，验证见正文。实测确认首开转圈是全局弹窗惰性块的 Suspense 回退（被 React 至少保留 300 ms），关闭闪现是七个对话框壳强制 !transition-none 加上 Base UI 对「挂载即打开 / 关闭即卸载」不跑过渡；修复为空闲预热弹窗块、去掉壳的过渡覆盖、@gatu/ui Modal/Drawer 首帧门控、宿主为关闭中的弹窗保留 250 ms、市价平仓取消先动画再释放会话；开发服务器逐帧采样确认抽屉与模态均有 200 ms 进出场。
- [头部账户芯片与 Connect 统一 36 px：可见高度与 44 px 热区分离](sessions/2026-09-18-header-chip-height.md) — 2026-09-18；已整理，验证见正文。375 px 登录态实测账户芯片 149×44、描边加投影，56 px 头部里上下只剩 6 px；根因是 headerAccount 槽位用 [&_button]:h-11 把可见高度和触控热区绑在一起，桌面芯片 34、设计系统 32、移动端 44 三种高度并存。用户决定移动端与桌面端都统一到 36 px 可见高度，热区用伪元素保住 44 px，去掉移动端芯片投影，邮箱标签优先显示本地名。
- [移动端账户标签工具栏纵向密度：去掉面板顶距并压缩工具栏行高](sessions/2026-09-18-mobile-account-toolbar-density.md) — 2026-09-18；已整理，验证见正文。实测 390 px 下我们标签行 47 + 面板顶距 8 + 工具栏 48 = 103 px，官方 36 + 0 + 31 = 67 px；用户决定先做两项：移动端账户面板去掉共享 TabsPanel 的 pt-2，五个标签的工具栏行从 48 px 压到 36 px（触控热区仍由 after:h-11 伪元素保证 44 px）；标签行高度另行决策。
- [移动端订单簿头部：36 px 芯片行、单位下拉、价差并入列头、列头带单位](sessions/2026-09-18-mobile-book-header.md) — 2026-09-18；已整理，验证见正文。实测 390 px 下我们订单簿头部到首档占 111 px（60 px 头部行 + 27 px 价差行 + 24 px 列头），官方 46 px；单位切换是 44 px 描边按钮、档位是 30 px 强边下拉，两者与新统一的 27 px 筛选芯片是三套样式。按用户决定四条一起做：头部行改 36 px 芯片行（档位左、单位右）、单位改为下拉、价差并入列头行、列头显示当前单位。
- [移动端未登录状态对齐官方：账户零值概览与持仓工具栏常驻](sessions/2026-09-18-mobile-disconnected-alignment.md) — 2026-09-18；已整理，验证见正文。核对确认 7f2f66ac 只对齐了桌面未登录账户面板，移动端 Account 页与持仓区仍是引导文案加 Connect 按钮；无头对比官方 390 px 后按三条实施：Account 页改为零值概览加禁用 Deposit/Withdraw（保留邮箱赞助充值例外），持仓区未登录保留禁用的筛选工具栏与空列表，规则写入 AGENTS.md 与 desktop-grid-layout.md。
- [移动端顶部导航对齐官方：主题移出头部、品牌填充 Connect、图标统一](sessions/2026-09-18-mobile-header-alignment.md) — 2026-09-18；已整理，验证见正文。390 px 实测：头部五个 44 px 控件只给 CTA 留 112 px，「Connect Wallet」被截成「Connect …」；语言按钮圆角 10 与其余 4 不一致；连接按钮描边加投影而官方用品牌填充。用户决定全部实施：主题切换移出移动端头部（抽屉已有）、移动端 CTA 改短标签「Connect」并品牌填充、桌面端连接按钮同步品牌填充、三个图标按钮统一令牌与圆角、清理 redesign.md 过期条目；Logo 链接指向所选「全部」市场为既有设计，保留。
- [移动端账户标签筛选芯片统一：同一规格、占位式文案、TWAP 子视图行同高](sessions/2026-09-18-mobile-toolbar-chip-unification.md) — 2026-09-18；已整理，验证见正文。逐标签实测发现持仓用 Dropdown 芯片（26 px、内边距 9、自适应宽）、历史类用 Select（27 px、内边距 6、固定 96/112 px 宽、「All …」文案）、TWAP 子视图行 44 px；按用户决定抽共享芯片类（27 px、7 px 圆角、9 px 内边距、自适应宽）套到六个标签，历史类改为「Type / Direction / Role / Status」占位式文案，TWAP 子视图行改 36 px 并用 before 伪元素保住 44 px 热区。Market 筛选与余额工具栏另立任务。
- [从仓库移除已退役的 EC2 部署代码与票据时期文档](sessions/2026-09-18-retire-ec2-deploy-files.md) — 2026-09-18；已整理，验证见正文。EC2 宿主 2026-09-17 停机、服务端票据 2026-09-18 移除之后，仓库里仍留着 12 个 EC2 部署文件和 6 份票据时期文档。本次把它们从工作树移除（原文保留在提交 5d393572），四个读取这些文件的 Vitest 契约改为钉住 CloudFront 模块或去掉已无对象的断言，现行文档的链接改指 CloudFront 手册，四份旧工作记录的 sources 改为该提交的永久链接。核对中发现一处迁移遗留缺口：旧脚本对 CCTP 主网赞助开关的二次确认校验在 CloudFront 发布流程里没有等价物，已在 cctp-deposits.md 如实写明，未补实现。
- [桌面 md 断点右列堆叠实施](sessions/2026-09-17-desktop-md-stacked-right-column.md) — 2026-09-17；已整理，验证见正文。按 ADR 0011 把 1001–1420 px 桌面网格改为图表列 10/14 + 右列堆叠（下单面板、订单簿、账户信息），存储键升到 v12；验证结果与限制见正文。
- [桌面顶部导航：命名断点、收纳规则与单一配置（ADR 0013）](sessions/2026-09-17-desktop-nav-collapse.md) — 2026-09-17；已整理，验证见正文。1181 魔法数改为 DESKTOP_NAV_COMPACT/NARROW 常量与 nav-compact 变体；Earn（Soon）紧凑时进 More，低优先级入口仅在已连接且 ≤1181 或 ≤1100 时收纳；入口与 More 由 DESKTOP_NAV_ITEMS 单一派生；官方对照与六语言余量实测见正文。
- [退役 EC2 + Caddy + Nitro 常驻进程，仓库切换为 CloudFront 单一架构](sessions/2026-09-17-ec2-retirement.md) — 2026-09-17；已整理，验证见正文。用户 2026-09-17 10:35Z 停机 EC2 i-058ca09d0533fc11d；仓库随之关闭 Nitro 预压缩、CI 去掉 Caddyfile 校验与 EC2 发布脚本测试并改跑 CloudFront 工具测试、deploy/README.md 标为历史资料、ADR 0005 与计划文档补退役状态；routeRules CSP 因两个契约测试仍钉住而留待后续。
- [市价平仓确认后立即关闭弹窗，结果只用通知](sessions/2026-09-17-market-close-submit-and-dismiss.md) — 2026-09-17；已整理，验证见正文。按 ADR 0014 实施：submit 先 dismiss 会话再校验，弹窗组件在 dismissed 期间保持挂载但对话框关闭；删除会话 error 字段与 setError/resetError；失败与被锁走通知并关闭会话，对账在任何结局释放会话；7 个测试文件 112 pass，唯一红项为分支既有的 440px 摘要样式断言。
- [移动端 Markets 页切换后保留 TradingView 图表](sessions/2026-09-17-mobile-chart-retention.md) — 2026-09-17；已整理，验证见正文。实测确认 Markets→Trade→Markets 每次重建 TradingView iframe，根因是 ade94020 引入的 Activity hidden 卸载效果；改为首次展示后常驻 visible，单测红绿与无头探针均确认同一 iframe 贯穿切换，与官方终端做法一致。
- [非模态表面改用 bg-surface 并补齐移动端按压反馈](sessions/2026-09-17-surface-tokens-touch-feedback.md) — 2026-09-17；已整理，验证见正文。盘点 bg-modal 语义误用（16 文件 36 处，终端两主题下视觉零变化）与 6 处无按压反馈的可点击表面；换为 bg-surface、加共享 active 类，契约测试与设计规则同步；双色卡结构保留并记录。
- [启动占位单一来源：ADR 0009 与展示组件规则](sessions/2026-09-16-placeholder-single-source-adr.md) — 2026-09-16；已整理，验证见正文。核对确认桌面壳九个 frame、移动壳与运行时占位是三份手写实现，唯一共享的是网格几何；采纳「展示组件是几何唯一来源」的架构：只接 props 的 *-view.tsx 由运行时容器与壳共同渲染，占位 props 单一来源，导入边界与一致性测试钉住，inert 取代禁止交互元素；本轮只落 ADR、规则与索引，迁移未开始。
- [移除启动占位体系](sessions/2026-09-16-remove-startup-placeholders.md) — 2026-09-16；已整理，验证见正文。按 ADR 0010 移除启动占位；类型、格式、翻译与全部产物预算通过，全量测试保留已知基线失败，完整构建受沙箱 preview 监听限制。
- [Across 官方文档共享阅读入口](sessions/2026-09-13-across-docs-entry.md) — 2026-09-13；已整理，验证见正文。以官方索引和按需页面核验接入 Across 文档，Codex 与 Claude 共用项目入口；不安装交易工具，API Markdown 与 MCP 的覆盖缺口需回退正式页面。
- [Across 地址方案：Claude 审查逐项复核与首期收缩](sessions/2026-09-13-across-plan-review-followup.md) — 2026-09-13；已整理，验证见正文。复核 P0/P1/P2 建议，补激活、首次账户和导出恢复，首期改两表与按需查询；纠正 recipient、request ID、index-0、最低额和部署状态推断，生产契约与真实资金验收仍待完成。
- [Across 二轮复审：N1–N8 验收与恢复边界](sessions/2026-09-13-across-rereview-resolution.md) — 2026-09-13；已整理，验证见正文。补 legal 可判定验收、导出兼容、token、密钥和受控恢复；不采用 WebView 一律禁用、10 USDC 通用引导或交易 hash 主键，生产依赖仍未完成。
- [AGENTS.md 指针化重构与 HypeTerminal 品牌残留清理](sessions/2026-09-13-agents-brand-cleanup.md) — 2026-09-13；已验证，范围见正文。AGENTS.md 由 24.7KB 压到 17.7KB：细节回归归属文档，新增 recent-trades.md 与 Order entry 节，每个契约配回归入口；全仓文档、测试夹具、bin 名、死存储键与 deepsec id 的旧品牌清理完成，仅保留两处刻意残留。

## 按记录日期检索

| 记录日期 | 任务记录 | 来源任务 | 基线提交 | 状态 |
| --- | --- | --- | --- | --- |
| 2026-09-20 | [字体实践审查：对照官方终端，修复图表字体栈、共享字号刻度与错误页字体](sessions/2026-09-20-font-practice-review.md) | 未取得任务标识，见正文 | `3b0a84cb91dd322725c7c0b16a4403dae36fe29a` | 已验证，范围见正文 |
| 2026-09-19 | [CloudFront 发布闸门：暴露资金或凭证路径的构建需要上传时再确认](sessions/2026-09-19-cloudfront-release-gates.md) | 未取得任务标识，见正文 | `a7cef26a` | 已整理，验证见正文 |
| 2026-09-19 | [Connect Wallet 按钮悬停态：去掉整体淡出，补上暗色面板按钮的悬停反馈](sessions/2026-09-19-connect-cta-hover-states.md) | 未取得任务标识，见正文 | `e837e8ce` | 已整理，验证见正文 |
| 2026-09-19 | [暗色浮层与遮罩改为终端色相，并修复语言菜单禁用文字](sessions/2026-09-19-dark-overlay-hue-family.md) | 未取得任务标识，见正文 | `0af67e47722409bb350f61500d58ab0f0bac30c1` | 已整理，验证见正文 |
| 2026-09-19 | [菜单共享皮肤、弹窗统一圆角与边框，并让 cn() 认识项目刻度](sessions/2026-09-19-popup-skin-and-dialog-chrome.md) | 未取得任务标识，见正文 | `c8d3031f` | 已整理，验证见正文 |
| 2026-09-18 | [弹窗首开转圈与关闭闪现：预热惰性弹窗并恢复进出场过渡](sessions/2026-09-18-dialog-transitions-and-preload.md) | 未取得任务标识，见正文 | `82d81313` | 已整理，验证见正文 |
| 2026-09-18 | [Grok 4.6 对抗审查六个弹窗/平仓提交：2 P1 属实并修复](sessions/2026-09-18-grok-dialog-commits-review.md) | 未取得任务标识，见正文 | `08e2057d` | 已整理，验证见正文 |
| 2026-09-18 | [头部账户芯片与 Connect 统一 36 px：可见高度与 44 px 热区分离](sessions/2026-09-18-header-chip-height.md) | 未取得任务标识，见正文 | `67d4212e` | 已整理，验证见正文 |
| 2026-09-18 | [链接移动设备：官方机制实测、17 项差距图与体验对齐实施](sessions/2026-09-18-link-device-alignment.md) | 未取得任务标识，见正文 | `d6225648` | 已验证，范围见正文 |
| 2026-09-18 | [移动端账户标签工具栏纵向密度：去掉面板顶距并压缩工具栏行高](sessions/2026-09-18-mobile-account-toolbar-density.md) | 未取得任务标识，见正文 | `ba5a580b` | 已整理，验证见正文 |
| 2026-09-18 | [移动端订单簿头部：36 px 芯片行、单位下拉、价差并入列头、列头带单位](sessions/2026-09-18-mobile-book-header.md) | 未取得任务标识，见正文 | `6a96f9b7` | 已整理，验证见正文 |
| 2026-09-18 | [移动端未登录状态对齐官方：账户零值概览与持仓工具栏常驻](sessions/2026-09-18-mobile-disconnected-alignment.md) | 未取得任务标识，见正文 | `6df02047` | 已整理，验证见正文 |
| 2026-09-18 | [移动端顶部导航对齐官方：主题移出头部、品牌填充 Connect、图标统一](sessions/2026-09-18-mobile-header-alignment.md) | 未取得任务标识，见正文 | `22a1d566` | 已整理，验证见正文 |
| 2026-09-18 | [移动配对方案 B 实施：去服务端票据的纯客户端传输（信封 v3）](sessions/2026-09-18-mobile-sync-ticketless-implementation.md) | 未取得任务标识，见正文 | `2242015f` | 已整理，验证见正文 |
| 2026-09-18 | [移动端账户标签筛选芯片统一：同一规格、占位式文案、TWAP 子视图行同高](sessions/2026-09-18-mobile-toolbar-chip-unification.md) | 未取得任务标识，见正文 | `707657d5` | 已整理，验证见正文 |
| 2026-09-18 | [从仓库移除已退役的 EC2 部署代码与票据时期文档](sessions/2026-09-18-retire-ec2-deploy-files.md) | 未取得任务标识，见正文 | `5d393572` | 已整理，验证见正文 |
| 2026-09-18 | [PR #27 预算超限：下单表单三个弹窗改为按意图懒加载](sessions/2026-09-18-trade-terminal-page-budget.md) | 未取得任务标识，见正文 | `35146f69` | 已整理，验证见正文 |
| 2026-09-17 | [生产发布 cloudfront-2026-09-17-p21（PR #26 分支 c59d13a8）](sessions/2026-09-17-cloudfront-release-p21.md) | 未取得任务标识，见正文 | `c59d13a8188093e1de0c5f247a9bc625f4a18a34` | 已验证，范围见正文 |
| 2026-09-17 | [桌面 md 断点右列堆叠实施](sessions/2026-09-17-desktop-md-stacked-right-column.md) | 未取得任务标识，见正文 | `a7fb284656651e6f8440cdfd584ed056ed158ff1` | 已整理，验证见正文 |
| 2026-09-17 | [桌面顶部导航：命名断点、收纳规则与单一配置（ADR 0013）](sessions/2026-09-17-desktop-nav-collapse.md) | 未取得任务标识，见正文 | `8dd0f1a9b5ebf65c190067755b9403336e2ef27f` | 已整理，验证见正文 |
| 2026-09-17 | [退役 EC2 + Caddy + Nitro 常驻进程，仓库切换为 CloudFront 单一架构](sessions/2026-09-17-ec2-retirement.md) | 未取得任务标识，见正文 | `bde33928b43c1823ddd716d728accce71ef979e5` | 已整理，验证见正文 |
| 2026-09-17 | [旧架构（EC2 + Caddy + Nitro）到新架构（CloudFront + S3 + Lambda）迁移完成度核对](sessions/2026-09-17-ec2-to-cloudfront-migration-audit.md) | 未取得任务标识，见正文 | `74c80c1a9e61d2045848dca2389e1af627c23609` | 已整理，验证见正文 |
| 2026-09-17 | [Grok 对抗审查 PR #26（启动、md 堆叠、路由揭示、导航收纳）](sessions/2026-09-17-grok-pr26-review.md) | 未取得任务标识，见正文 | `e4c0c4129f1c48cda50d365f347bacc5b6a9893c` | 已整理，验证见正文 |
| 2026-09-17 | [市价平仓确认后立即关闭弹窗，结果只用通知](sessions/2026-09-17-market-close-submit-and-dismiss.md) | 未取得任务标识，见正文 | `44a4d411b859c06827a8fd4c4675e487938e3231` | 已整理，验证见正文 |
| 2026-09-17 | [移动端 Markets 页切换后保留 TradingView 图表](sessions/2026-09-17-mobile-chart-retention.md) | 未取得任务标识，见正文 | `0ad17aea771213eae608d5d0dff78de0e249b94b` | 已整理，验证见正文 |
| 2026-09-17 | [非模态表面改用 bg-surface 并补齐移动端按压反馈](sessions/2026-09-17-surface-tokens-touch-feedback.md) | 未取得任务标识，见正文 | `3a80b36081648b8bb3a8b5efa1087fd24c69fcec` | 已整理，验证见正文 |
| 2026-09-17 | [交易路由在首屏惰性片段解析后揭示（ADR 0012）](sessions/2026-09-17-trade-route-reveal.md) | 未取得任务标识，见正文 | `b80bd533bbf7c66e41817615a441e0cd973989ab` | 已整理，验证见正文 |
| 2026-09-17 | [二三次刷新对照：app.gatu.ai 与官方终端](sessions/2026-09-17-warm-reload-comparison.md) | 未取得任务标识，见正文 | `4fca2b34d91d75aa18c596017301bacf268f19f7` | 已整理，验证见正文 |
| 2026-09-16 | [桌面账户面板：单一来源展示组件迁移](sessions/2026-09-16-account-panels-view-migration.md) | 未取得任务标识，见正文 | `bfdae535adcb567dd8a763d71c31eb9b94b284bd` | 已整理，验证见正文 |
| 2026-09-16 | [Dashboard 壳：单一来源 frame 迁移](sessions/2026-09-16-dashboard-shell-view-migration.md) | 未取得任务标识，见正文 | `cde152e54ae32ed6dd63e9d7a3cc08d787bd73e1` | 已整理，验证见正文 |
| 2026-09-16 | [邮箱钱包标识、密钥导出入口及发送网络说明修复](sessions/2026-09-16-email-wallet-ui-fix.md) | 未取得任务标识，见正文 | `f5010ee7` | 已整理，验证见正文 |
| 2026-09-16 | [桌面市场头与收藏条：单一来源展示组件迁移](sessions/2026-09-16-market-header-view-migration.md) | 未取得任务标识，见正文 | `0c8127456044390c95f7e5b4301fbbdd43a658e1` | 已整理，验证见正文 |
| 2026-09-16 | [移动端六个表面迁移到共享占位视图](sessions/2026-09-16-mobile-views-migration.md) | 未取得任务标识，见正文 | `b77a87909046a20469f71449525d619680daa4f1` | 已整理，验证见正文 |
| 2026-09-16 | [桌面订单簿 chrome 单一来源迁移](sessions/2026-09-16-orderbook-chrome-view-migration.md) | 未取得任务标识，见正文 | `7d80e46bbbf221a6f4256bf4008b9632c289627a` | 已整理，验证见正文 |
| 2026-09-16 | [启动占位单一来源：ADR 0009 与展示组件规则](sessions/2026-09-16-placeholder-single-source-adr.md) | 未取得任务标识，见正文 | `ade94020` | 已整理，验证见正文 |
| 2026-09-16 | [移除启动占位体系](sessions/2026-09-16-remove-startup-placeholders.md) | 未取得任务标识，见正文 | `0f7e97acb95a4211195b1ac4dd742def7f72bbc0` | 已整理，验证见正文 |
| 2026-09-16 | [桌面顶栏、页脚与外框单一来源迁移](sessions/2026-09-16-top-nav-footer-view-migration.md) | 未取得任务标识，见正文 | `d43d50683a2641aa79d4a851d629e68568e3c4af` | 已整理，验证见正文 |
| 2026-09-16 | [桌面交易面板框架：单一来源展示组件迁移](sessions/2026-09-16-trade-panel-view-migration.md) | 未取得任务标识，见正文 | `3ecb960e8df1e2360be9c62ac59881b9f56ec622` | 已整理，验证见正文 |
| 2026-09-16 | [热访问启动：为什么第 2..n 次仍出现占位壳，以及经核实的改进计划](sessions/2026-09-16-warm-visit-startup-plan.md) | 未取得任务标识，见正文 | `f5010ee7` | 已整理，验证见正文 |
| 2026-09-15 | [移动占位壳与真实终端逐像素对齐](sessions/2026-09-15-mobile-shell-parity.md) | 未取得任务标识，见正文 | `f5010ee7` | 已验证，范围见正文 |
| 2026-09-13 | [Across 持久充值地址接入规划](sessions/2026-09-13-across-deposit-address-plan.md) | 未取得任务标识，见正文 | `9750ccffd051e2b49bb4f90ba2a8f5afb5c7f961` | 已整理，验证见正文 |
| 2026-09-13 | [Across 官方文档共享阅读入口](sessions/2026-09-13-across-docs-entry.md) | 未取得任务标识，见正文 | `0662cae1d921ef71a3e60edef9f9c736ceacccb5` | 已整理，验证见正文 |
| 2026-09-13 | [Across 地址方案：Claude 审查逐项复核与首期收缩](sessions/2026-09-13-across-plan-review-followup.md) | 未取得任务标识，见正文 | `8153b7b74cd3bf02d91f9a0eb79a2688b123de9d` | 已整理，验证见正文 |
| 2026-09-13 | [Across 二轮复审：N1–N8 验收与恢复边界](sessions/2026-09-13-across-rereview-resolution.md) | 未取得任务标识，见正文 | `965e05900e4f4252d592beaf158967fb2fe74a6e` | 已整理，验证见正文 |
| 2026-09-13 | [AGENTS.md 指针化重构与 HypeTerminal 品牌残留清理](sessions/2026-09-13-agents-brand-cleanup.md) | 未取得任务标识，见正文 | `32b73f6892fc6882692c8a0964471a26ab63f272` | 已验证，范围见正文 |
| 2026-09-13 | [SPA 壳：在分支上跑通静态托管构建](sessions/2026-09-13-spa-shell-spike.md) | 未取得任务标识，见正文 | `2c44be20` | 已整理，验证见正文 |
| 2026-09-12 | [账户与资金：模式语义、共享概览与精确转账](sessions/2026-09-12-account-funding.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [部署第 2 步：已安装 Caddy 配置与仓库不一致](sessions/2026-09-12-caddy-config-mismatch.md) | 未取得任务标识，见正文 | `42349cb1` | 已整理，验证见正文 |
| 2026-09-12 | [部署包预算：订单队列去重与固定参数复验](sessions/2026-09-12-deploy-bundle-margin.md) | 未取得任务标识，见正文 | `23966794` | 已验证，范围见正文 |
| 2026-09-12 | [行情恢复：字段来源、静默占位与操作守卫](sessions/2026-09-12-market-recovery.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [中性卡片底色与相邻弱填充全量源码审查](sessions/2026-09-12-neutral-surface-audit.md) | 未取得任务标识，见正文 | `43ce177c384377c3f1f84a92623d4892b0859624` | 已整理，验证见正文 |
| 2026-09-12 | [下单布局：自然高度、TWAP 与双端表单](sessions/2026-09-12-order-entry-layout.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [移动配对：常规发布自动门控与可选真机晋级](sessions/2026-09-12-pairing-release.md) | 解释 gatu 服务配置不匹配（`01a09457-b938-7862-8278-681459added6`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [PR #22 合并前校验：清理成交旧提示与重复订单标签](sessions/2026-09-12-pr22-merge-validation.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `e2affd06` | 已整理，验证见正文 |
| 2026-09-12 | [PR #22：复审、夹具隔离及版本化验证](sessions/2026-09-12-pr22-review.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [Vite 缓存：应用与浏览器夹具独立](sessions/2026-09-12-vite-cache.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已整理，验证见正文 |
| 2026-09-12 | [建立可追溯工作记录与定期索引](sessions/2026-09-12-work-memory.md) | 启动3006端口开发服务器（`01a08f6b-26ae-7642-a9a5-a074d906c899`） | `422ea8a6` | 已验证，范围见正文 |
