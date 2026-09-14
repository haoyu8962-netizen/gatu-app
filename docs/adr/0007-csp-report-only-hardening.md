# ADR 0007：内容安全策略分两步收紧

- 状态：已接受（2026-09-14）；代码与函数已就位，但 report-only 头暂未开启——接收器的公开函数 URL 在本账号一律 403（见"后果与边界"），`edge-config.json` 的 `cspReportUri` 保持为空，解除阻断后填入即可启用
- 前置：[ADR 0005](0005-spa-static-shell.md)（CSP 由 viewer-response 函数下发）、[ADR 0006](0006-startup-preloads-and-edge-caching.md)

## 背景与约束

主文档策略的 `script-src` 与 `style-src` 含 `'unsafe-inline'`，`img-src` 放行任意 `https:`，`script-src` 还带应用代码并不使用的 `blob:`。官方站完全没有 CSP，所以这是收紧空间而不是退步，但收紧不能靠猜：内联脚本有三段（主题引导、TanStack 的流屏障、每页一段 `$R[n]` 恢复脚本），图片来源涉及 Privy、WalletConnect、Coinbase 等第三方。约束：CloudFront 的 Lambda 源用 OAC 签名，浏览器自动发出的 CSP 报告不带 `x-amz-content-sha256`，进不了签名源；CloudFront Functions 拿不到请求体；静态托管没有 nonce。

## 决策

1. **候选策略先以 report-only 观察。** `security-headers.ts` 新增 `cspReportOnlyDirectives`：`img-src` 收窄为 `'self' data: blob:` 加 `app.hyperliquid.xyz`、`*.privy.io`、`explorer-api.walletconnect.com`、`*.walletconnect.com`、`*.coinbase.com`，`script-src` 去掉 `blob:`；其余与现行策略相同。viewer-response 函数在非图表路径上把它作为 `Content-Security-Policy-Report-Only` 下发，附 `report-uri`。现行 `Content-Security-Policy` 不变。
2. **报告接收器独立于签名源。** 新增 Lambda `gatu-terminal-api-csp-report`（128 MB、3 s、公开函数 URL；预留并发因账号并发下限暂未设置），处理器 `src/edge/csp-report-lambda.ts` 无任何依赖：只接受 `POST` 与 CSP 报告的三种内容类型，正文 ≤ 8 KB，每实例每分钟 120 条，解析旧格式 `{"csp-report"}` 与 Reporting API 批次后把裁剪过的摘要写进 CloudWatch，返回 204。它不持有密钥、不写存储，被滥用的上限是日志量。
3. **接收器地址是部署配置。** `deploy/cloudfront/edge-config.json` 的 `cspReportUri` 由 `render-functions.mjs` 读取；为空时函数不发 report-only 头，`pnpm test:cloudfront` 的漂移检查保证提交的函数代码与配置一致。`deploy.mjs functions` 从文件更新并发布两个 CloudFront Functions。
4. **第二步的门槛。** 报告连续一个发布周期没有本应用自己的资源被拦截后，把候选目录并入 `cspDirectives`；`script-src` 去掉 `'unsafe-inline'` 需要构建后为 7 个预渲染页的内联脚本算哈希并渲染进函数，届时另立提交。`style-src` 的 `'unsafe-inline'` 保留：Base UI、react-grid-layout 与 TradingView 依赖内联样式。

## 备选方案与取舍

- 把报告发到签名源 `/api/csp-report`：浏览器不会附带载荷哈希，OAC 直接拒绝，否决。
- Lambda@Edge 收报告：需要 us-east-1 的另一套部署与更高成本，否决。
- 直接收紧不观察：`img-src` 的第三方来源无法从代码穷举，误伤钱包图标与头像，否决。

## 后果与边界

- 报告只反映真实用户会话，本机与 Playwright 验证不会触发第三方图片；需要等真实流量。
- 接收器是公开端点，任何人都能写日志；预留并发、正文上限与每分钟限额把成本封顶。
- 过渡期 Nitro（EC2）不发 report-only 头，只有 CloudFront 目标参与观察。
- 2026-09-14 实测：接收器函数经 IAM 直接调用返回 204，但 `AuthType=NONE` 的函数 URL 对任何请求都回 403 `AccessDeniedException`，资源策略（`Principal: *`、`FunctionUrlAuthType: NONE`）正确，重建 URL 无效，与账号级"Lambda 函数 URL 公开访问阻断"一致；本机 `aws-cli 2.36.2` 没有 `get/put-public-access-block-config`，`put-function-concurrency 2` 也因账号并发下限被拒。启用步骤：升级 AWS CLI 后对函数或账号执行 `put-public-access-block-config --public-access-block-config BlockPublicPolicy=false,RestrictPublicResource=false`（或在控制台关闭），确认 `curl -X POST` 返回 204，再把函数 URL 写进 `edge-config.json`、渲染并 `deploy.mjs functions --execute`。
