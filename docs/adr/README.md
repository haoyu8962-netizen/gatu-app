# 架构决策记录

ADR 记录采用某个方案的理由、备选方案和后果，完整实现契约保留在主题 Reference。编号稳定；后续替代决策应新增 ADR 并链接旧记录。回溯补写不代表当时已经存在该文档。

| ADR | 状态 | 决策 |
| --- | --- | --- |
| [0001](0001-account-overview-cross-shell-model.md) | 已采用；展示规则随后修订 | 桌面与移动端共享账户数据契约，独立渲染；Portfolio 保持独立语义 |
| [0002](0002-exact-owner-trading-signers.md) | 已实现决策的回溯记录 | 精确 owner 签名身份与邮箱/外部钱包/Agent-only 的 signer 分工 |
| [0003](0003-orderbook-transport-isolation.md) | 已实现决策的回溯记录 | 通过有界共享 transport 池隔离公共 l2Book 流身份 |
| [0004](0004-across-deposit-addresses.md) | 拟议，尚未实施 | 邮箱充值新增 Across 持久地址，保留 CCTP 与恢复；服务端身份、两张地址表及按需转账查询 |
| [0005](0005-spa-static-shell.md) | 已采用；CloudFront + S3 + Lambda 首发到 `*.cloudfront.net`，正式域名待切换；静态文档页部分被 ADR 0020 取代 | 以预渲染 SPA 壳与静态文档页交付客户端产物，运行时不再 SSR；`/api/*` 处理器跑在 Lambda 函数 URL 上，Nitro 退为过渡宿主 |
| [0007](0007-csp-report-only-hardening.md) | 已采用；report-only 已上线 | 候选 CSP 先以 report-only 下发，报告进独立的公开 Lambda 接收器；内联脚本哈希留到第二步 |
| [0006](0006-startup-preloads-and-edge-caching.md) | 已采用；阶段 1、2 已发布；文档页缓存与地区预取例外被 ADR 0020 取代 | 壳内预加载交易页启动闭包，壳与文档页边缘缓存并后台刷新，图表哈希 bundle immutable，地区判定从引导入口预取，Lambda 保温；不做边缘初判 |
| [0008](0008-compact-market-context-channels.md) | 已采用；p16 首发，p18 改为快照 + 增量累积 | 全市场行情改订公开 WebSocket 的紧凑压缩频道 `pac`/`sac`，现货按市场名索引，解码失败回退原频道并上报一次 |
| [0009](0009-startup-placeholder-single-source.md) | 已被 ADR 0010 部分取代 | 决策 2–5、7 被取代；保留真实组件的纯 view 单一标记来源及市场头布局 |
| [0010](0010-blank-until-ready-startup.md) | 已接受（2026-09-16）；决策 2 的文档路由部分被 ADR 0020 取代 | 统一空播报，持久语言/主题的真实 chrome 优先，市场就绪后内容；删除启动骨架 |
| [0011](0011-desktop-md-stacked-right-column.md) | 已接受并实施（2026-09-17） | 桌面 md 断点右列改为下单面板在上、订单簿在下、账户信息再下，图表列 10/14，账户表在图表列下方；存储键升到 v12 |
| [0012](0012-trade-route-reveal-after-surface-preload.md) | 已接受（2026-09-17） | `/trade` 路由的 `beforeLoad` 等待首屏惰性片段（面板、页脚、导航片段、全局弹层）预加载完成再揭示，避免重试渲染再次挂起触发 React 300 ms fallback 节流；等待上限 1500 ms |
| [0013](0013-desktop-navigation-collapse.md) | 已接受（2026-09-17）；2026-10-01 补充 | 桌面导航断点命名为常量并以 `nav-compact` 变体钉住；Earn（Soon）在紧凑宽度进 More，低优先级入口仅在“已连接且紧凑”或“窄屏”时收纳；入口与 More 由同一配置派生。补充：已连接页头实测后紧凑宽度 1181 → 1379，不可存款时存款按钮只显示图标 |
| [0014](0014-market-close-submit-and-dismiss.md) | 已接受（2026-09-17） | 市价平仓点击确认后立即关闭弹窗，会话进入 `dismissed` 但组件保持挂载以保留执行守卫；结果只用通知，会话不再携带错误；对账走通用通知并在任何结局关闭会话 |
| [0015](0015-link-device-alignment.md) | D1–D6 已接受并实施（2026-09-18）；D7 方案 B 代码已实施，真机验收未执行 | 链接移动设备对齐官方：顶栏二维码入口、单步审批、官方文案与屏幕共享警告、圆环按住显示、可见倒计时、手机端 Agent-only 资金动作原因与扫描器相机选择；凭证传输选定去票据的纯客户端传输（规划见 docs/mobile-sync-ticketless-transfer-plan.md） |
| [0016](0016-dev-first-pull-requests-and-ci-tiers.md) | D1、D2′、D3、D4、D6、D7 已接受并实施（2026-09-19，D2 同日被 D2′ 取代）；D5 `main` 保护规则未执行 | 工作分支只向 `dev` 开 PR，`main` 只接受 `dev`；每个 PR 构建生产默认的配对组合并跑两片浏览器回归，其余三组只在进 `main` 的 PR、发版标签与手动运行时构建；测试移出矩阵只跑一次，小 job 合并，网站工作流按输入过滤，同一 PR 的新推送取消旧运行；必选检查推迟到全量单测稳定之后 |
| [0017](0017-market-close-confirmed-size-ceiling.md) | 已接受并实施（2026-09-20） | 市价平仓确认按钮改为静态动词，保留实时联动；点击时展示的数量作为执行上限，重算结果超出即失败关闭；弹窗期间仓位数量与开窗时不同要明示；确立「展示值必须约束执行」的确认面契约 |
| [0018](0018-slider-gestures-end-on-release.md) | 已接受并实施（2026-09-20）；兼作缺陷复盘 | 滑杆手势只在 `pointerup`、`pointercancel` 或编辑上下文结束时结束，`lostpointercapture` 不是取消；移动与松手由文档级监听处理；每条结束路径写入 `data-gesture-end`；新增取消路径须有真实输入证据；手势改动以物理输入验证，报告的缺陷以报告人的场景确认 |
| [0019](0019-global-trading-notifications.md) | 已接受并实施（2026-09-21）；未发布 | 订单、平仓与普通提示共用全局 Sonner 堆叠；任务绑定 owner/env，同 ID 更新并从现有 pending 恢复，成功到最前台才计时；保留资金核验与密钥保存面板 |
| [0020](0020-legal-pages-in-app-shell.md) | 已接受并实施（2026-09-27）；未发布 | Docs、Support、Terms、Privacy、Risk、Cookies 六页并入应用外壳：桌面用 TopNav/FooterBar、移动用 MobileHeader，删除文档路由表面与 DocumentChrome；只预渲染 SPA 壳，边缘函数与 SW（v10）不再区分文档页；照官方把 Cookie 入口放进隐私政策、手机抽屉加 Docs/Support、发布时用壳覆盖遗留文档页 |
| [0021](0021-earn-borrow-lend-page.md) | 已接受并实施（2026-09-27）；未发布 | Earn 页接入借贷储备池：交易签名方发送 `borrowLend`，存入与借入发送展示的精确数量并按最新状态二次封顶，取出与偿还点 Max 且可全额时发 `null`（交易所 $1 下限），资金锁内复核本金，资金类弹层生命周期，`borrowLend` 入跨标签页资金锁；组合保证金下禁用手动操作；Earn 常驻导航一级，窄屏收纳阈值 1100 → 1150 |
| [0022](0022-subscription-staleness-monotonic-clock.md) | 已接受并实施（2026-09-28）；未发布 | 订阅过期以单调与墙钟两个年龄中较大者判断，系统时间回拨不再让静默流保持新鲜；每帧携带两种接收时间，`lastMessageAt` 保持墙钟；节流间隔同样两个时钟取大；阈值、订阅键与恢复路径不变。补充：socket 静默检测与增量 l2 闸门的等待同样取大；撤单、改单与 TWAP 撤单对账用 `monotonicLastMessageAt` 只按单调时间判断快照先后，15 秒超时取大；写入存储、跨标签页共享的时间仍用墙钟 |
| [0023](0023-open-interest-cap-advisory-check.md) | 已接受并实施（2026-09-27）；已合入 `dev`、未发布，功能当前休眠 | 未平仓量上限只在当前、成功、同账户的 `webData3` 快照列出该市场时拦截限价、止损限价、止盈限价，未知状态放行、交易所保持权威；从现有订阅派生，不新增订阅；HIP-3 弹窗只读显示 `perpDexLimits` 每币上限 |
| [0024](0024-translate-action-errors-at-render.md) | 已接受并实施（2026-09-28）；未合入、未发布 | 操作错误保存语义、显示时翻译：已知交易所拒绝文案（官方文档 17 种下单/撤单错误、降杠杆保证金不足、操作已过期、请先充值）翻译并保留数值，未知的逐字显示不截断，下单保证金不足按官方附加只减仓/撤单提示；我们自己的、SDK、网络与钱包错误不再原样显示；订单状态代码显示为原因；辅助函数只接收描述符翻译器；修订 ADR 0019 决策 3 |
| 0025 | 预留，尚未编写 | 由[公告方案](../announcements-plan.md)预留给公告数据源决策；实施时编写 |
| [0026](0026-privy-follows-theme-after-upgrade.md) | 已接受并实施（2026-09-30）；2026-10-01 合入 dev（b4b0ae1b），未发布，真实钱包验收未执行 | 精确锁定 Privy 并补齐空钱包数组稳定性，以当前主题配置更新登录窗口，同时保持应用与钱包连接生命周期 |

新 ADR 至少包含：状态与日期、上下文、目标/约束、决策、备选方案及利弊、后果与边界、代码/测试/Reference 证据。验证命令与本次执行结果分别标明。文档维护要求见[文档体系](../documentation-system.md)。
