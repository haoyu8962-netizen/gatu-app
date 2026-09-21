# 架构决策记录

ADR 记录采用某个方案的理由、备选方案和后果，完整实现契约保留在主题 Reference。编号稳定；后续替代决策应新增 ADR 并链接旧记录。回溯补写不代表当时已经存在该文档。

| ADR | 状态 | 决策 |
| --- | --- | --- |
| [0001](0001-account-overview-cross-shell-model.md) | 已采用；展示规则随后修订 | 桌面与移动端共享账户数据契约，独立渲染；Portfolio 保持独立语义 |
| [0002](0002-exact-owner-trading-signers.md) | 已实现决策的回溯记录 | 精确 owner 签名身份与邮箱/外部钱包/Agent-only 的 signer 分工 |
| [0003](0003-orderbook-transport-isolation.md) | 已实现决策的回溯记录 | 通过有界共享 transport 池隔离公共 l2Book 流身份 |
| [0004](0004-across-deposit-addresses.md) | 拟议，尚未实施 | 邮箱充值新增 Across 持久地址，保留 CCTP 与恢复；服务端身份、两张地址表及按需转账查询 |
| [0005](0005-spa-static-shell.md) | 已采用；CloudFront + S3 + Lambda 首发到 `*.cloudfront.net`，正式域名待切换 | 以预渲染 SPA 壳与静态文档页交付客户端产物，运行时不再 SSR；`/api/*` 处理器跑在 Lambda 函数 URL 上，Nitro 退为过渡宿主 |
| [0007](0007-csp-report-only-hardening.md) | 已采用；report-only 已上线 | 候选 CSP 先以 report-only 下发，报告进独立的公开 Lambda 接收器；内联脚本哈希留到第二步 |
| [0006](0006-startup-preloads-and-edge-caching.md) | 已采用；阶段 1、2 已发布 | 壳内预加载交易页启动闭包，壳与文档页边缘缓存并后台刷新，图表哈希 bundle immutable，地区判定从引导入口预取，Lambda 保温；不做边缘初判 |
| [0008](0008-compact-market-context-channels.md) | 已采用；p16 首发，p18 改为快照 + 增量累积 | 全市场行情改订公开 WebSocket 的紧凑压缩频道 `pac`/`sac`，现货按市场名索引，解码失败回退原频道并上报一次 |
| [0009](0009-startup-placeholder-single-source.md) | 已被 ADR 0010 部分取代 | 决策 2–5、7 被取代；保留真实组件的纯 view 单一标记来源及市场头布局 |
| [0010](0010-blank-until-ready-startup.md) | 已接受（2026-09-16） | 统一空播报，持久语言/主题的真实 chrome 优先，市场就绪后内容；删除启动骨架 |
| [0011](0011-desktop-md-stacked-right-column.md) | 已接受并实施（2026-09-17） | 桌面 md 断点右列改为下单面板在上、订单簿在下、账户信息再下，图表列 10/14，账户表在图表列下方；存储键升到 v12 |
| [0012](0012-trade-route-reveal-after-surface-preload.md) | 已接受（2026-09-17） | `/trade` 路由的 `beforeLoad` 等待首屏惰性片段（面板、页脚、导航片段、全局弹层）预加载完成再揭示，避免重试渲染再次挂起触发 React 300 ms fallback 节流；等待上限 1500 ms |
| [0013](0013-desktop-navigation-collapse.md) | 已接受（2026-09-17） | 桌面导航断点命名为 1181/1100 常量并以 `nav-compact` 变体钉住；Earn（Soon）在紧凑宽度进 More，低优先级入口仅在“已连接且 ≤1181”或“≤1100”时收纳；入口与 More 由同一配置派生 |
| [0014](0014-market-close-submit-and-dismiss.md) | 已接受（2026-09-17） | 市价平仓点击确认后立即关闭弹窗，会话进入 `dismissed` 但组件保持挂载以保留执行守卫；结果只用通知，会话不再携带错误；对账走通用通知并在任何结局关闭会话 |
| [0015](0015-link-device-alignment.md) | D1–D6 已接受并实施（2026-09-18）；D7 方案 B 代码已实施，真机验收未执行 | 链接移动设备对齐官方：顶栏二维码入口、单步审批、官方文案与屏幕共享警告、圆环按住显示、可见倒计时、手机端 Agent-only 资金动作原因与扫描器相机选择；凭证传输选定去票据的纯客户端传输（规划见 docs/mobile-sync-ticketless-transfer-plan.md） |
| [0016](0016-dev-first-pull-requests-and-ci-tiers.md) | D1、D2′、D3、D4、D6、D7 已接受并实施（2026-09-19，D2 同日被 D2′ 取代）；D5 `main` 保护规则未执行 | 工作分支只向 `dev` 开 PR，`main` 只接受 `dev`；每个 PR 构建生产默认的配对组合并跑两片浏览器回归，其余三组只在进 `main` 的 PR、发版标签与手动运行时构建；测试移出矩阵只跑一次，小 job 合并，网站工作流按输入过滤，同一 PR 的新推送取消旧运行；必选检查推迟到全量单测稳定之后 |
| [0017](0017-market-close-confirmed-size-ceiling.md) | 已接受并实施（2026-09-20） | 市价平仓确认按钮改为静态动词，保留实时联动；点击时展示的数量作为执行上限，重算结果超出即失败关闭；弹窗期间仓位数量与开窗时不同要明示；确立「展示值必须约束执行」的确认面契约 |
| [0018](0018-slider-gestures-end-on-release.md) | 已接受并实施（2026-09-20）；兼作缺陷复盘 | 滑杆手势只在 `pointerup`、`pointercancel` 或编辑上下文结束时结束，`lostpointercapture` 不是取消；移动与松手由文档级监听处理；每条结束路径写入 `data-gesture-end`；新增取消路径须有真实输入证据；手势改动以物理输入验证，报告的缺陷以报告人的场景确认 |

新 ADR 至少包含：状态与日期、上下文、目标/约束、决策、备选方案及利弊、后果与边界、代码/测试/Reference 证据。验证命令与本次执行结果分别标明。文档维护要求见[文档体系](../documentation-system.md)。
