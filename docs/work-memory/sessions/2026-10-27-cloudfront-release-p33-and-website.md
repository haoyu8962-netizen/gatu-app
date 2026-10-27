<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-27-cloudfront-release-p33-and-website",
  "date": "2026-10-27",
  "title": "CloudFront 生产发布 p33（日本解封、EntropyIO 文档链接）与官网首页改版上线",
  "kind": "task",
  "status": "verified",
  "topics": ["static-hosting", "website", "geo-restriction", "hip3"],
  "summary": "运营方同意整条流程：PR #115 合入 dev（c2d57946），晋升 PR #116 八项 CI 全绿后合入 main（2dcfd3e0）。在仓库外工作树 gatu-release-p33 用 Node 22.15.0 构建 cloudfront-2026-10-27-p33（三个闸门全开，总量 3,314,849），按 functions → lambda（版本 17）→ sync（1,645 个文件，发布标记一致）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规。线上终端自 p32 升到 p33，带上 ADR 0042（日本不再受限）与 T1（io → EntropyIO 文档链接），terminal:check 随后通过。官网从同一提交构建（test 97、test:dist 56），备份线上 34 个对象后按资源 → 其余非 HTML → HTML 上传并失效 EP2DIBP3T7M3G，手册的发布后检查全部符合，线上无头浏览器桌面与手机均无控制台错误。真实日本 IP 交易、真实钱包与社交卡片抓取未做。",
  "thread": null,
  "baseCommit": "9ccb88c0",
  "commits": ["712df93c", "c39df181", "e8bb774f", "6d430d27", "d6a32618", "6858ffba", "c2d57946", "2dcfd3e0"],
  "sources": [
    {"path": "deploy/cloudfront/README.md"},
    {"path": "deploy/website/README.md"},
    {"path": "docs/agent-handbook.md"},
    {"path": "docs/website-plan.md"},
    {"path": "docs/work-memory/sessions/2026-10-14-cloudfront-release-p32.md"},
    {"path": "docs/work-memory/sessions/2026-10-24-website-research-and-rebuild-plan.md"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# CloudFront 生产发布 p33（日本解封、EntropyIO 文档链接）与官网首页改版上线

## 背景与范围

同步记录，未取得任务标识。运营方要求把官网部署到生产，随后同意整条流程：「推送分支并开 PR 到 dev，CI 通过后合入；再开 dev→main 的 PR，CI 通过后合入；从 main 发布终端 p33（含 EntropyIO 链接与日本解封）；最后刷新行情快照并发布官网」。官网发布手册的发布前提 7 要求线上终端先带上 T1 与 ADR 0042，发布前 `terminal:check` 对 p32 报两项问题，所以终端必须先发。时间均为 UTC。

## 结论与依据

**合并。** 推送前刷新行情快照（`fetchedAt` 2026-10-27T05:46:52Z；新增 `xyz:ANT`，核对 XYZ Pre-IPO 规格页为 1 股 Anthropic, PBC A 类普通股、按每股报价，补进 `PRE_IPO_DOCS`；`io:ANTH` 的 displayName 由 ANTH 变 ANT；`xyz:META` 图标超过 256 KB 被拒、改用字母圆标），并按惯例做推送前 Codex 只读审查：两项 P2（SVG 清理可被 CSS 转义与 `xml:base` 绕过）在 `d6a32618` 修复。[PR #115](https://github.com/zora4523-bot/gatu-app/pull/115) 与 `dev` 只在生成的 `INDEX.md` 冲突，合入 `origin/dev` 后重新生成。Codex 机器人在 `open-book.ts` 提的两项 P2（交接期断线不重连、聚合深度覆盖精确报价）核实成立，在 `6858ffba` 修复。七项 CI 通过后以 merge commit 合入 `dev`（`c2d57946`）。

**晋升。** [PR #116](https://github.com/zora4523-bot/gatu-app/pull/116)（`dev` → `main`）八项 CI 全绿（含配对开启构建），以 merge commit 合入 `main`（`2dcfd3e0`）。

**终端构建。** 仓库外工作树 `gatu-release-p33`（`origin/main` `2dcfd3e0`，`.env.local` 软链主检出、不读内容，Node 22.15.0、pnpm 10.21.0、依赖按锁文件安装）。命令行显式写出 `SAIRN_BUILD_SHA=2dcfd3e0… SAIRN_RELEASE_ID=cloudfront-2026-10-27-p33 VITE_HYPERLIQUID_TESTNET= VITE_MOBILE_PAIRING_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm build`，再 `build:lambda`。总量 3,314,849 gzip（基线 +3,092）、手机运行时 118,310、桌面运行时 202,581（−102）；Lambda `index.mjs` 229.42 kB。`build-meta.json` 的提交、release 与三个闸门正确，图表入口同 p32；`verify-chart-build.mjs` 退出码 0；产物无 `gatu.ai`，含 `docs.entropy.io`，`geo.ts` 不含 `JP`。

**终端发布。** `functions --execute --origin https://app.sairn.ai`（06:46Z，3 个当前 + 1 个上一版内联脚本哈希，两个函数 LIVE）→ `lambda --function-name gatu-terminal-api --execute`（版本 17，Active / Successful）→ `sync --bucket gatu-terminal-2026 --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（闸门行三项 on，1,645 个文件、0 个失败，`Release markers match the local build`）→ 失效主网 `IDRMLZMDZTWZ275MXMQBM6TLMH`、测试网 `I3C83Z5CSEY6OQSQS497H30B1Z`，均 Completed。

**官网发布。** 发布前提：`sairn.ai` 与 `www.sairn.ai` 200；法律页正文自上次官网发布（2026-10-02 02:39Z）以来没有改动（最后一次 `legal/` 提交 `d582a801` 在 2026-10-01 17:13Z；线上与新构建的四个法律页只差导航与页脚外框），无须另行书面确认；`terminal:check` 对 p33 通过（缅甸 MM 仍只是警告，规划 T4）；功能主张按 p33 核对（订单类型、六种语言、邮箱与钱包登录、Arbitrum USDC 存款、可安装的手机布局、Earn 等入口均为已上线功能，卡入金与自动存款未写进官网）。官网从 `gatu-release-p33`（`2dcfd3e0`）构建，`test` 97、`test:dist` 56 通过，`dist` 无 gatu。桶未开版本控制；线上 34 个对象备份到本机 `~/website-backups/2026-10-27-p33`（另存对象清单）。新构建没有撤下页面，未做删除。按手册三段上传，抽查 `index.html` no-cache、固定文件名 must-revalidate、`_astro/` 资源 immutable，AVIF、WebP、SVG、woff2 的 content-type 正确。失效 `EP2DIBP3T7M3G` `I743H8FTBPNCKFWJRINW528SLJ` Completed。

## 验证与限制

- 终端 `verify --origin https://app.sairn.ai --network mainnet`：15/15 ok；`--origin https://testnet.sairn.ai --network testnet`：16/16 ok；两网 `build metadata parity` 为 `2dcfd3e0 / cloudfront-2026-10-27-p33 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`。注意 `verify` 需要 `--origin`，只给 `--network` 会以 `--origin is required` 失败。
- `csp-coverage.mjs https://app.sairn.ai`：33 步、2 步跳过（桌面 WalletConnect 与手机图表页，同前几次）、0 违规、0 控制台错误；桌面 7 个面板、手机 3 个导航项。
- 官网发布后检查：首页、`www`、`/risk`、`/risk/` 200 no-cache；favicon、OG 图、robots、站点地图 200 must-revalidate；不存在的路径与 `/blog/welcome/` 404；二次请求边缘命中。线上无头 Chromium（桌面 1440、手机 390）无控制台错误与 CSP 违规，49 个实时价格就绪，功能区切换正常，无横向滚动。
- 未做：真实日本 IP 下的交易与地区判定；真实钱包登录、存款与下单；社交卡片调试器抓取；Safari、Firefox、真机与读屏。发布日志在会话暂存目录，未入库。CHANGELOG 仍在 Unreleased 下。
- 发布工作树 `gatu-release-p33` 保留到下次发布；`gatu-release-p32` 是终端回滚产物；`gatu-release-p26`、`p28`、`p30`、`p31` 可删除（未删除）。官网回滚用本机备份。

## 后续与替代关系

- 待做：上面的真实验收；规划 T4（缅甸）；日本营销邮件的发送仍按其闸门（[日本记录](2026-10-24-japan-trading-region-and-email.md)）。
- 上一次终端发布记录：[p32](2026-10-14-cloudfront-release-p32.md)；官网改版过程：[官网调研与重做](2026-10-24-website-research-and-rebuild-plan.md)。
