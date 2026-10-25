# 官网发布手册：S3 + CloudFront

> **状态：2026-10-02 按本手册发布过一次。** 那次发布随 gatu.ai 下线、sairn.ai 上线一起做，执行记录见[任务记录](../../docs/work-memory/sessions/2026-10-01-sairn-domain-cutover-plan.md)「上线执行」。之后每次发布仍要逐项核对「发布前提」，并以执行当天 AWS 与 DNS 的实际状态为准。

官网是 `apps/website` 的 Astro 静态构建（`dist/`）。它和终端是两套独立的托管：终端走 [CloudFront 全静态部署](../cloudfront/README.md)（`deploy/cloudfront/deploy.mjs` 只认终端构建，不能拿来发官网）；官网没有发布脚本，按本手册手工执行。

## 现有资源

AWS 资源名保留 `gatu-*`，这是有意的：它们只是现有资源的标识，改名不迁移资源，与终端部署的约定一致。

| 资源 | 标识 | 说明 |
|---|---|---|
| S3 桶 | `gatu-dist-2026`（`ap-northeast-1`） | 私有，阻止全部公共访问，只允许分发经 OAC 读取 |
| CloudFront 分发 | `EP2DIBP3T7M3G` | 别名是 `sairn.ai` 与 `www.sairn.ai`（2026-10-02 从 `gatu.ai`、`www.gatu.ai` 换成这两个），两者都直接返回 200，没有互相跳转 |
| CloudFront Function | `gatu-rewrite-index`（viewer-request） | 给目录形态的路径补 `index.html`（`/risk` 与 `/risk/` 都落到 `/risk/index.html`）。**源码不在仓库里** |
| 错误响应 | 403、404 → `/404.html`，状态码 404 | OAC 读不到对象时返回 403，所以 403 也必须映射 |
| 发布身份 | AWS CLI profile `gatu-edge` | 权限见 [`gatu-edge-release-policy.json`](../cloudfront/iam/gatu-edge-release-policy.json)：可读写该桶、更新并失效该分发、只读 ACM；**不能**读取或更新 `gatu-rewrite-index` |
| ACM 证书 | `us-east-1` | 4 名 sairn 证书 `b04a51c6…`，覆盖 `sairn.ai`、`www.sairn.ai`、`app.sairn.ai`、`testnet.sairn.ai`，与两个终端分发共用（有效期到 2027-04-16）。两张旧的 gatu 证书按[切换方案](../../docs/sairn-domain-cutover-plan.md) 5.4 在切换 30 天后删除 |

## 发布前提

域名、证书、别名与 DNS 已在 2026-10-02 的切换里完成（[ADR 0032](../../docs/adr/0032-gatu-offline-cutover-to-sairn.md)、[切换方案](../../docs/sairn-domain-cutover-plan.md)阶段 3）。`gatu.ai` 的官网已下线，不再是发布目标。常规发布前核对以下各项：

1. **域名与证书仍然有效。** `curl -sI https://sairn.ai/` 与 `https://www.sairn.ai/` 返回 200；分发 `EP2DIBP3T7M3G` 的别名与证书没有被改动。`sairn.ai` 的 DNS 在 Cloudflare，记录保持 DNS only（灰云）；开代理会改变 CloudFront 的证书与缓存行为。
2. **支持邮箱。** `support@sairn.ai` 能收信：页脚的 Contact 与法律页都链接到它。
3. **终端在 `https://app.sairn.ai` 正常提供服务。** 官网所有 CTA 都指向它，`<head>` 里也对它做了 `preconnect`。
4. **法律页签字。** `/terms`、`/privacy`、`/risk`、`/support` 直接渲染仓库根目录的 `legal/*.md`。签约主体是 Sairn Corp.；这四页有改动时，发布前由运营方对当前版本书面确认（记录确认人、日期和对应的提交）；2026-10-25 运营方决定取消律师确认这一步（[官网规划](../../docs/website-plan.md)第 1 节）。
5. **构建检查通过**（见下一节）。

## 构建与本地检查

包名已从 `@gatu/website` 改为 `@sairn/website`，旧的 `pnpm --filter @gatu/website build` 不再匹配任何包，会静默什么都不构建。

```bash
pnpm install --frozen-lockfile
pnpm --filter @sairn/website test        # 品牌与文案契约
pnpm --filter @sairn/website build       # → apps/website/dist/
grep -rli gatu apps/website/dist         # 期望没有任何输出
git rev-parse HEAD                       # 记下本次发布对应的提交
```

在浏览器里看一遍构建结果（`python3 -m http.server 3035 -d apps/website/dist`，或 `pnpm --filter @sairn/website preview`）：首页、`/blog/`、`/terms/`、`/privacy/`、`/risk/`、`/support/`、`/404.html`，桌面与手机宽度各一次。

## 缓存分组

| 分组 | 匹配 | `Cache-Control` | 原因 |
|---|---|---|---|
| 内容哈希资源 | `_astro/*` | `public,max-age=31536000,immutable` | 文件名带内容哈希，内容变了 URL 就变 |
| 其余非 HTML | `favicon.ico`、`apple-touch-icon.png`、`og-website-1200x630.png`、`robots.txt`、`sitemap-*.xml` 等 | `public,max-age=0,must-revalidate` | 文件名固定，换内容时必须让浏览器重新验证 |
| HTML | `*.html` | `no-cache` | 页面每次都要回源验证，才能拿到新的资源地址 |

2026-10-02 之前的发布方式把**所有**非 HTML 文件都标成一年 `immutable`。同名文件原地替换后，访问过的浏览器最长一年都看不到新内容。所以首页截图已改为从 `src/assets/` 导入、由 Astro 输出到带哈希的 `_astro/` 路径，旧的 `/app-desktop.jpeg`、`/app-mobile.jpeg` 不再使用；以后不要再把会更新的图片放进 `public/`。

## 发布步骤

以下命令都在仓库根目录执行，`<backup-dir>` 换成一个新的本地空目录（例如 `~/website-backups/2026-10-xx`）。

### 0. 核对身份

```bash
aws sts get-caller-identity --profile gatu-edge
aws s3api get-bucket-versioning --bucket gatu-dist-2026 --profile gatu-edge
```

记下桶是否开启了版本控制：开启时回滚还可以按对象版本恢复，未开启时只能依赖下一步的本地备份。

### 1. 备份线上内容

```bash
aws s3 sync s3://gatu-dist-2026 <backup-dir> --profile gatu-edge
aws s3api list-objects-v2 --bucket gatu-dist-2026 --profile gatu-edge > <backup-dir>.objects.json
```

本地备份不保存对象的 `Cache-Control`，回滚时要按「缓存分组」重新设置（见「回滚」）。

### 2. 上传（顺序固定：资源 → 其余非 HTML → HTML）

先传页面引用的资源，最后传 HTML，保证新页面上线时它引用的文件都已经在桶里。

```bash
aws s3 sync apps/website/dist s3://gatu-dist-2026 --profile gatu-edge \
  --exclude "*" --include "_astro/*" \
  --cache-control "public,max-age=31536000,immutable"

aws s3 sync apps/website/dist s3://gatu-dist-2026 --profile gatu-edge \
  --exclude "*.html" --exclude "_astro/*" \
  --cache-control "public,max-age=0,must-revalidate"

aws s3 sync apps/website/dist s3://gatu-dist-2026 --profile gatu-edge \
  --exclude "*" --include "*.html" \
  --cache-control "no-cache"
```

**不要随手对资源加 `--delete`。** 2026-10-02 的发布没有清理资源：桶里还有 2026-07 版本留下的文件（如 `logo.svg`、`og.png`、`app-desktop.jpeg`、`app-mobile.jpeg`），已打开旧页面的浏览器和外部引用可能还在用。确认新站稳定、旧文件确实没有引用后，再在之后的某次发布里先 `--dryrun` 后 `--delete` 清理。

**已撤下的页面必须删除。** 页面从构建里撤下后，旧的 HTML 还在桶里，函数会继续把对应路径改写到它。2026-10-02 的发布就这样删除了占位博文 `blog/welcome/index.html`（标题和正文含「公开仓库」等已撤回的说法）。做法是只对 HTML 做一次带 `--delete` 的同步，先核对清单：

```bash
aws s3 sync apps/website/dist s3://gatu-dist-2026 --profile gatu-edge \
  --exclude "*" --include "*.html" --cache-control "no-cache" --delete --dryrun
# 确认只删除已撤下的页面后，去掉 --dryrun 再执行一次
```

`aws s3 sync` 只上传大小不同或本地更新的文件；新构建的文件时间都比线上新，因此会全部重传并写上新的 `Cache-Control`。上传后抽查元数据：

```bash
for key in index.html robots.txt favicon.ico og-website-1200x630.png sitemap-index.xml; do
  echo "$key"
  aws s3api head-object --bucket gatu-dist-2026 --key "$key" --profile gatu-edge \
    --query '{cache: CacheControl, type: ContentType}' --output text
done
```

如果某个固定文件名的对象仍是 `immutable`，用 `aws s3 cp <file> s3://gatu-dist-2026/<key> --cache-control "public,max-age=0,must-revalidate" --metadata-directive REPLACE --profile gatu-edge` 单独重写。

### 3. 失效

```bash
aws cloudfront create-invalidation --distribution-id EP2DIBP3T7M3G --paths "/*" --profile gatu-edge
aws cloudfront wait invalidation-completed --distribution-id EP2DIBP3T7M3G --id <invalidation-id> --profile gatu-edge
```

## 发布后检查

每条都看状态码和 `cache-control`；`x-cache` 首次可能是 `Miss`，再请求一次应为 `Hit` 或 `RefreshHit`。

```bash
curl -sI https://sairn.ai/                          # 200, no-cache
curl -sI https://www.sairn.ai/                      # 200, no-cache
curl -sI https://sairn.ai/risk                      # 200, no-cache（函数补 index.html）
curl -sI https://sairn.ai/risk/                     # 200, no-cache
curl -sI https://sairn.ai/favicon.ico               # 200, public,max-age=0,must-revalidate
curl -sI https://sairn.ai/og-website-1200x630.png   # 200, public,max-age=0,must-revalidate, image/png
curl -sI https://sairn.ai/robots.txt                # 200, public,max-age=0,must-revalidate
curl -sI https://sairn.ai/sitemap-index.xml         # 200, public,max-age=0,must-revalidate
curl -sI https://sairn.ai/this-page-does-not-exist  # 404, 内容是 /404.html, no-cache
curl -sI https://sairn.ai/blog/welcome/             # 404（已撤下的占位博文）
```

再取首页里任意一个 `_astro/` 地址（截图或字体），确认是 `public,max-age=31536000,immutable`，字体的 `content-type` 是 `font/woff2`（若为 `binary/octet-stream`，记录下来，按需用 `--content-type` 重传）。

社交卡片：用 Facebook Sharing Debugger、LinkedIn Post Inspector 抓取 `https://sairn.ai/`，在 X 的发帖框里预览链接，确认标题、描述与 `og-website-1200x630.png` 正确显示；必要时在调试器里强制重新抓取。

最后在浏览器里打开首页，确认截图、行情条、页脚的 `/#features`、`/#faq` 链接与"打开终端"按钮都正常。

## 回滚

1. 从备份按同样的三个分组传回。**不要用 `aws s3 sync`**：备份文件的修改时间是旧对象的时间，比新发布的对象旧，`sync` 会跳过大小相同的文件，回滚就不完整。改用 `aws s3 cp --recursive`，它总是上传：

   ```bash
   aws s3 cp <backup-dir> s3://gatu-dist-2026 --recursive --profile gatu-edge \
     --exclude "*" --include "_astro/*" --cache-control "public,max-age=31536000,immutable"
   aws s3 cp <backup-dir> s3://gatu-dist-2026 --recursive --profile gatu-edge \
     --exclude "*.html" --exclude "_astro/*" --cache-control "public,max-age=0,must-revalidate"
   aws s3 cp <backup-dir> s3://gatu-dist-2026 --recursive --profile gatu-edge \
     --exclude "*" --include "*.html" --cache-control "no-cache"
   ```

   旧站的非 HTML 文件原本都是 `immutable`，回滚时按「其余非 HTML」分组设为 `must-revalidate` 也无害。如果桶开启了版本控制，也可以恢复对象的上一版本。
2. 新发布增加的对象（例如 `/risk/index.html`、新的 `_astro/*`）在第 1 步之后仍然存在。若要完全回到旧状态，先 `aws s3 sync <backup-dir> s3://gatu-dist-2026 --delete --dryrun --profile gatu-edge` 核对将被删除的清单，确认后去掉 `--dryrun` 执行。
3. 按第 3 步失效 `/*` 并等待完成。
4. 如果问题出在域名、证书或别名，恢复分发的上一份配置（`aws cloudfront get-distribution-config` 在改动前保存一份），DNS 改回原记录。

## 未决事项与已知缺口

- `gatu-rewrite-index` 的源码不在仓库里，`gatu-edge` 也读不到它。下一步应由有权限的身份导出函数代码，提交到 `deploy/website/`，并把它加进发布身份的策略，否则换域名或调整路由时无法审查和复现。
- 官网目前没有发布脚本；以上命令全部手工执行。
- `apps/website/vercel.json` 是 Vercel 时期的遗留配置，仓库里的 CI 与脚本都不使用它，线上官网由 CloudFront 提供。
