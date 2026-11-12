# ADR 0051：发布脚本按内容上传与核对壳、Lambda 更新后立即探活

- 状态：已接受并实施（2026-11-12）。分支 `claude/fix-release-script`，未合入 `dev`、未发布。没有做过回滚演练，也没有用 `--execute` 跑过新脚本：下文的上传顺序、内容核对与探活只在不触网的测试里验证过。
- 关联：[CloudFront 发布手册](../../deploy/cloudfront/README.md)（「日常发布」「回滚」）；[Agent 工作手册](../agent-handbook.md)第 8 节；[ADR 0016](0016-dev-first-pull-requests-and-ci-tiers.md)（CI 分层，本次在 `Production Builds` 加一步）；[ADR 0020](0020-legal-pages-in-app-shell.md)（六个遗留法律页由壳覆盖）；审查记录 `docs/work-memory/sessions/2026-11-12-global-defect-review.md`（提交 `9395acca`）的 P1-2、P2-7、P2-8；[任务记录](../work-memory/sessions/2026-11-12-release-script-rollback-and-lambda-probe.md)。

## 背景

2026-11-12 的全局审查核实了发布脚本 `deploy/cloudfront/deploy.mjs` 的三个问题：

1. **回滚时壳与发布标记不上传，脚本却报成功（P1-2）。** `sync` 对所有文件用 `aws s3 sync`。它只在对象缺失、大小不同或本地文件比对象新时上传。回滚用的是保留的旧发布工作树，文件比桶里的旧；`_shell.html` 与 `build-meta.json` 在 p38–p41 四个版本里字节数相同（14,264 与 428），所以两者都会被跳过。结束时的标记核对只比字节数，于是通过并打印成功。与此同时 Lambda 与 CloudFront 函数真的回滚了，六个遗留的 `<route>/index.html` 也被 `s3 cp` 写成旧壳：线上处于半回滚状态，要到最后的 `verify` 才报错。
2. **`lambda --execute` 把函数配置原样打印（P2-7）。** `update-function-code` 返回完整的 FunctionConfiguration，其中 `Environment.Variables` 含 IPdata 的 API 密钥；脚本让子进程直接继承标准输出。p41 的发布日志里确实出现了这一段。
3. **Lambda 更新即生效，脚本不探活；CI 从不构建 Lambda 包（P2-8）。** 两个网络共用一个函数，坏包会让 `/api/geo` 返回 5xx，两站的交易、存款与提款立即 fail-closed；`/api/health` 与 `/api/geo` 只在最后的 `verify` 里检查，中间还隔着 `sync` 与失效（p41 约 11 分钟）。`zip -j` 只打入口一个文件，构建一旦拆出公共块，包在运行时就缺模块。

## 决策

1. **只有带内容哈希的文件走 `aws s3 sync`。** 以 `objectCacheControl` 的分类为准：`immutable` 的文件（`assets/*`、文件名带 20 位哈希的 TradingView bundle、带 16 位哈希的图表入口副本）文件名就是内容，桶里已有同名对象时跳过是正确的。其余文件（`sw.js`、`manifest.json`、图标、`robots.txt`、`sitemap.xml`、主题样式、未哈希的 `charting_library.js` 等、`sameorigin.html`、`404.html`、`build-meta.json`、`_shell.html`）一律用 `aws s3 cp` 上传，不看修改时间与大小。
2. **上传顺序：** 内容哈希文件 → 其余非 HTML 文件 → 壳以外的 HTML → `build-meta.json` → 六个遗留法律页的壳副本 → `_shell.html`。壳是最后一条命令；任何一步失败时，线上可能出现「标记已是新版、壳仍是旧版」，但不会出现「新壳已上线、标记还是旧的」。中途失败时脚本按停下的阶段说明桶里的状态（哪些已经是新版、壳与标记各是哪一版），提示重跑同一条 `sync`。
3. **标记按内容核对。** `sync --execute` 结束后用 `aws s3 cp s3://<桶>/<键> -` 取回 `_shell.html` 与 `build-meta.json`，与本地文件比较 SHA-256。不用 `head-object` 的 ETag（KMS 加密或分段上传时不是 MD5），也不依赖上传时附带的校验和设置；取回两个小文件只需要发布身份已有的 `s3:GetObject`。
4. **Lambda 更新只打印白名单字段。** `update-function-code` 带 `--query` 只取 `Version`、`CodeSize`、`CodeSha256`、`State`、`LastUpdateStatus`，脚本再捕获输出、按同一白名单拼一行打印；即使 `--query` 被删，原始应答也不会进日志。脚本里其余直接打印输出的命令已逐个核对：CloudFront 函数的 `update-function` / `publish-function` 返回函数摘要（不含代码），`update-distribution` 返回分发配置，`create-invalidation` 返回失效记录，都不含密钥；读取配置的命令（`get-function`、`describe-function`、`get-distribution-config`、`sts get-caller-identity`）一直是捕获后只取所需字段。
5. **Lambda 更新后立即探活。** `lambda --execute` 在 `wait function-updated` 之后经 `--origin` 请求 `/api/health`（204、`no-store`）与 `/api/geo`（200、两位国家码），检查与 `verify` 共用同一实现；最多试 3 次、间隔 3 秒，全部失败即以非零退出，并给出用上一版发布工作树的 `dist-lambda` 重传的命令。`--execute` 没有 `--origin` 时拒绝运行；不提供这两个路径的函数（CSP 报告接收器）显式传 `--skip-probe`。
6. **打包前拒绝拆块的入口。** `lambda` 在 zip 之前检查入口文件没有相对导入（静态 `import`/`export … from`、副作用导入、动态 `import()`），新增 `check-lambda` 子命令对两个入口（`index.mjs`、`csp-report.mjs`）做同样检查，不碰 AWS。`Production Builds` 在安装依赖之后、客户端构建之前跑 `build:lambda`、`check-lambda` 与两个入口的 `node --check`（本机约 9 秒）。
7. **回滚用当前脚本读旧产物。** 保留的发布工作树里是旧版 `deploy.mjs`，仍有上面的缺陷，所以回滚时用当前检出的脚本，经 `--public-dir`、`--lambda-dir` 与新增的 `--functions-dir` 指向旧工作树的产物与 CloudFront 函数源码。步骤写在发布手册「回滚」一节与工作手册第 8 节。
8. **`sync` 拒绝 source map。** 构建不产出 `.map`；万一出现就拒绝上传，免得把源码发到公网。

## 备选方案

- **全部文件改用 `aws s3 cp --recursive`。** 最简单，但每次发布都要重传桶里已有的全部内容哈希文件，其中仅 TradingView 的 bundle 就约 1,150 个、版本之间通常不变；上传越多，本机代理的瞬时断开（p41 第一次 `sync` 就因此失败了一个文件）越容易打断一次发布。哈希文件同名即同内容，跳过它们没有风险。
- **`aws s3 sync --exact-timestamps` 或 `--size-only` 以外的比较方式。** `--exact-timestamps` 只对「从 S3 下载」生效，上传方向仍按大小与修改时间；CLI 没有按内容比较的上传模式。
- **回滚时先 `touch` 旧工作树的文件。** 能绕过跳过逻辑，但要求操作者记住这一步，脚本仍会对大小相同的跳过报成功；把规则放进脚本更可靠。
- **标记核对用 `head-object` 的 `ChecksumSHA256`。** 要求每次上传都带 `--checksum-algorithm SHA256`，并依赖 CLI 版本与分段上传的组合校验和格式；取回文件比较字节更直接。
- **Lambda 先发布新版本、探活后再切别名。** 能做到「探活不通过不生效」，但函数 URL 现在指向未限定版本（据部署手册第 4 步的建立方式推断，未在控制台核对），改成别名要改函数 URL 与 IAM 权限，属于运营方的 AWS 设置变更，不在本次范围。现方案把坏包的暴露时间从约 11 分钟缩短到探活的十几秒加重传时间。

## 后果与边界

- 每次 `sync` 会重传约三十个未哈希文件（图标、样式、`sw.js`、图表入口等），以及壳与遗留法律页；它们的 `Cache-Control` 每次都会被重写，所以这些文件的缓存策略变化不再需要 `reupload`。`reupload` 只剩一个用途：改写已在桶里、`sync` 会跳过的内容哈希文件的元数据。
- 新的失败形态是「标记已新、壳仍旧」。此时导航仍拿到旧壳，`verify` 的壳对比与标记核对都会失败；处理方式是重跑同一条 `sync`。
- 探活经过公网与 CloudFront，`/api/geo` 还依赖 IPdata：IPdata 自身故障也会让探活失败并建议重传，操作者要看失败明细再决定。探活不能阻止坏包生效，只能缩短发现时间。
- 回滚的可行性只在读码与不触网的测试里确认，没有演练。跨 ADR 0020 之前的版本回滚、S3 版本控制恢复，都没有在本次核对；桶是否开启了版本控制也未核实。
- 此前发布的日志与会话记录可能含有 IPdata 密钥。是否轮换由运营方决定，本次不处理。

## 证据

- 代码：`deploy/cloudfront/deploy.mjs`（`buildSyncPlan`、`runSyncPlan`、`describeSyncFailure`、`assertReleaseMarkersUploaded`、`buildLambdaCommands`、`summarizeLambdaUpdate`、`releaseLambda`、`probeApiAfterLambdaUpdate`、`findRelativeImports`、`check-lambda`）；`.github/workflows/production-build.yml`。
- 测试：`deploy/cloudfront/deploy.test.mjs`（用内存桶模拟 `s3 sync` 的跳过规则：本地文件更旧、大小相同的回滚必须写回壳、标记与 `manifest.json`；在修复前的代码上该用例失败，报 `_shell.html kept the newer release`）；`scripts/ci-workflows.test.mjs` 钉住 Lambda 检查步骤。
- 本次执行结果见任务记录：`pnpm test:cloudfront` 53/53，`node --test scripts/ci-workflows.test.mjs` 20/20；对部署脚本做的 14 个变异与对工作流做的 4 个变异全部被测试抓到。
