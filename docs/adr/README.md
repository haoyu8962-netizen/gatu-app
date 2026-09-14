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

新 ADR 至少包含：状态与日期、上下文、目标/约束、决策、备选方案及利弊、后果与边界、代码/测试/Reference 证据。验证命令与本次执行结果分别标明。文档维护要求见[文档体系](../documentation-system.md)。
