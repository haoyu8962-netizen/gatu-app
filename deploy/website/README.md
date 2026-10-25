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
6. **记录线上终端的版本，并按它核对功能主张**（[官网规划](../../docs/website-plan.md)第 9 节 R14）。取 `curl -s https://app.sairn.ai/build-meta.json`，在任务记录里写明其中的 `release` 与 `commit`；再按这个版本逐项核对官网写到的功能（订单类型、语言、登录方式、存款方式、移动端安装、Earn 等入口）在该版本里确实存在、默认开启。官网写了而该版本没有的，先改官网文案，不要先发布。按规划 R13，卡入金、邮箱钱包自动存款与 Link mobile device 在真实验收之前不写进官网。
7. **线上终端已经带上官网依赖的改动，否则不发布。** 官网首页深链到快照里每个部署方的市场，并说受限地区以条款 §2.2 为准，所以线上终端必须已经：(a) 在 `apps/terminal/src/config/hip3-deployers.ts` 里给快照中的每个 dex 配了文档链接（规划第 10 节 T1：`io` → EntropyIO），否则访客从官网点进 `io:OAI`、`io:ANTH`，终端的 HIP-3 免责弹窗里没有部署方文档链接；(b) 包含 ADR 0042 的 `geo.ts`（不再拦截条款 §2.2 没有列出的日本）。先 `git fetch origin`，再跑 `NODE_USE_ENV_PROXY=1 pnpm --filter @sairn/website terminal:check`：它读线上 `build-meta.json` 的 commit，在本地 Git 对象里读该提交的这两个文件，有一项不满足就以退出码 1 结束，这时不发布官网，先发布终端。它对缅甸 `MM`（规划 T4）只打印警告：T4 不是阶段 1 的前置，但发布记录里要写明线上终端与条款 §2.2 的这一差异。

## 构建与本地检查

包名已从 `@gatu/website` 改为 `@sairn/website`，旧的 `pnpm --filter @gatu/website build` 不再匹配任何包，会静默什么都不构建。

```bash
pnpm install --frozen-lockfile
pnpm --filter @sairn/website markets:snapshot   # 每次发布前刷新行情快照（见下文）
git diff --stat apps/website/src/data/          # 快照的改动写进任务记录
pnpm --filter @sairn/website test        # 只读源码：品牌、文案契约与行情数据规则
pnpm --filter @sairn/website build       # → apps/website/dist/
pnpm --filter @sairn/website test:dist   # 读构建产物：风险句、部署方、FAQPage、/blog noindex、无 gatu 等
grep -rli gatu apps/website/dist         # 期望没有任何输出（test:dist 也会检查）
git rev-parse HEAD                       # 记下本次发布对应的提交
git fetch origin && NODE_USE_ENV_PROXY=1 pnpm --filter @sairn/website terminal:check   # 发布前提 7：线上终端已含 T1 与 ADR 0042
```

**行情快照。** 首页的市场名、部署方、市场数与 Pre-IPO 行来自提交进仓库的 `apps/website/src/data/market-structure.json`。精选市场下架或换了品类、出现没有文档链接的部署方、`deployers.ts` 的条目与快照不符时，`astro build` 直接失败；快照超过 7 天、`deployers.ts` 的来源超过 90 天没有复核、或预定结算日已过时，首页（`src/pages/index.astro` 调用 `assertMarketStructureCurrent()`）的构建失败，所以整个 `astro build` 也失败，包括只改法律页或品牌文件的 PR 在 CI 里的构建。源码测试（`test`、`test:brand`）不读时钟，不受快照年龄影响。所以每次发布前都要重跑 `markets:snapshot`，把快照的改动作为一次单独的提交审阅，并在任务记录里写明 `fetchedAt` 与 diff 的要点（新增或下架的市场、部署方、品类数的变化）。脚本报出问题时退出码为 1：先按提示改 `src/config/featured-markets.ts` 或 `src/config/deployers.ts`，不要手改快照。每日的 `Website Market Snapshot` 工作流（`.github/workflows/website-markets-check.yml`）只跑 `--check`，它报红说明下一次发布前需要刷新，它自己不改任何文件。沙箱或代理环境里本地运行需要 `NODE_USE_ENV_PROXY=1`。

在浏览器里看一遍构建结果（`python3 -m http.server 3035 -d apps/website/dist`，或 `pnpm --filter @sairn/website preview`）：首页、`/blog/`、`/terms/`、`/privacy/`、`/risk/`、`/support/`、`/404.html`，桌面与手机宽度各一次。

## 缓存分组

| 分组 | 匹配 | `Cache-Control` | 原因 |
|---|---|---|---|
| 内容哈希资源 | `_astro/*` | `public,max-age=31536000,immutable` | 文件名带内容哈希，内容变了 URL 就变 |
| 其余非 HTML | `favicon.ico`、`apple-touch-icon.png`、`og-website-1200x630.png`、`robots.txt`、`sitemap-*.xml` 等 | `public,max-age=0,must-revalidate` | 文件名固定，换内容时必须让浏览器重新验证 |
| HTML | `*.html` | `no-cache` | 页面每次都要回源验证，才能拿到新的资源地址 |

### 视频分组（预留，视频上线时启用）

规划第 5 节的视频交付之前，`dist` 里没有视频，这一组不执行。启用时按以下约定补全本节并在任务记录里写明：

| 分组 | 匹配 | `Cache-Control` | 原因 |
|---|---|---|---|
| 视频 | `media/<sha256>.<ext>` | `public,max-age=31536000,immutable` | 文件名就是内容哈希，内容变了 URL 就变 |

- 视频文件不进 git；仓库只提交清单（每个文件的哈希、字节数、时长与码率）以及海报和字幕。上传前用清单核对本地文件的 `sha256` 与字节数，对不上就停。
- 上传顺序排在「内容哈希资源」之后、HTML 之前，并显式写 `--content-type`（`video/mp4`、`video/webm`）。
- 不对 `media/` 加 `--delete`：旧页面与外部引用可能还在请求旧视频。
- 上线后用 `curl -sI` 与 `curl -s -r 0-1023 -o /dev/null -w '%{http_code}'` 核对 `content-type`、`immutable` 与 Range 请求返回 206。

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

**已撤下的页面必须删除，而且先 `--dryrun`。** 本次构建比线上少了页面时（例如以后从 `FEATURED_MARKETS` 删掉一个市场，它的 `/markets/<slug>/` 不再生成），先跑下面带 `--delete --dryrun` 的命令，核对将被删除的只有撤下的页面，再去掉 `--dryrun` 执行，并把删除清单写进任务记录；撤下的页面也要已经不在站点地图里（`test:dist` 只检查构建产物）。页面从构建里撤下后，旧的 HTML 还在桶里，函数会继续把对应路径改写到它。2026-10-02 的发布就这样删除了占位博文 `blog/welcome/index.html`（标题和正文含「公开仓库」等已撤回的说法）。做法是只对 HTML 做一次带 `--delete` 的同步，先核对清单：

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
