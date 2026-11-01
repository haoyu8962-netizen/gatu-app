<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-28-cloudfront-release-p35-link-language",
  "date": "2026-10-28",
  "title": "链接语言参数 ?lang= 与 CloudFront 生产发布 p35",
  "kind": "task",
  "status": "verified",
  "topics": ["i18n-runtime", "static-hosting", "jurisdiction-marketing"],
  "summary": "日本邮件的落地链接需要直接打开日语终端。p34 已有日语，但首访只读已保存语言，日语浏览器打开 /trade/xyz:ANT 仍是英文，HIP-3 免责弹窗也先以英文出现。新增 lib/link-locale.ts：链接 ?lang=<语言> 在客户端入口第一条同步语句（client.ts，任何动态导入之前）和 lib/i18n.ts 求值时按语言菜单的方式存下，再用 history.replaceState 去掉参数，保留路径、UTM、hash 与 history state；首访不跟随浏览器语言。推送前 Codex 审查 1 项 P2（启动错误页可能读不到链接语言）已修。PR #121 合入 dev（d99c2bc9），晋升 PR #122 七项 CI 全绿后合入 main（cdb47637）。在仓库外工作树 gatu-release-p35 用 Node 22.15.0 构建 cloudfront-2026-10-28-p35（三个闸门全开，总量 3,353,976），按 functions → lambda（版本 19）→ sync（1,646 个文件、发布标记一致）→ 两次失效 → verify 主网 15/15、测试网 16/16 → csp-coverage 33 步 0 违规发布。线上用 ja-JP 无头浏览器打开邮件链接，手机与桌面都是日语、免责弹窗为日语、参数已去掉且 UTM 保留；邮件 v3 的切换语言说明已删。真机、Safari 与真实钱包未验证。",
  "thread": null,
  "baseCommit": "eaf9c202",
  "commits": ["a1a68f41", "160a5c6a", "d99c2bc9", "cdb47637"],
  "sources": [
    {"path": "apps/terminal/src/lib/link-locale.ts"},
    {"path": "apps/terminal/src/lib/i18n.ts"},
    {"path": "apps/terminal/src/client.ts"},
    {"path": "docs/i18n-presentation.md"},
    {"path": "deploy/cloudfront/README.md"},
    {"path": "docs/work-memory/sessions/2026-10-28-cloudfront-release-p34.md"},
    {"url": "https://app.sairn.ai/build-meta.json"}
  ],
  "supersedes": []
}
-->
# 链接语言参数 ?lang= 与 CloudFront 生产发布 p35

## 背景与范围

同步记录，未取得任务标识。运营方要求日本 ANT 邮件的落地链接是日语入口，随后同意整条流程：推送 `claude/link-language` 开 PR 到 `dev`、CI 通过后合入，再晋升 `main`，从 `main` 发布终端 p35，发布后用日语浏览器验证邮件链接，并精简邮件里切换语言的说明。线上此前是 p34（`2047ee8d`，已有日语界面）。时间均为 UTC。

## 结论与依据

**问题。** p34 起终端有日语，但 `getPersistedLocale()` 只读 localStorage，不看浏览器语言，也没有链接参数。2026-10-28 用 `locale: ja-JP` 的无头 Chromium 打开 `https://app.sairn.ai/trade/xyz:ANT?…` 得到 `<html lang="en">` 与英文的 HIP-3 Deployer Disclaimer，而该弹窗挡在语言菜单前面。

**做法。** `apps/terminal/src/lib/link-locale.ts`：`parseLinkLocale` 读 `?lang=`（大小写不敏感，`ja-JP` 退回 `ja`，未知值忽略）；`applyLinkLocale` 用与语言菜单相同的 `storeLocale` 存下，再以 `history.replaceState` 去掉参数（有效与否都去掉），保留路径、其余参数、hash 与 history state。`src/client.ts` 第一条同步语句调用 `applyWindowLinkLocale()`，所以启动错误页也读得到；`lib/i18n.ts` 求值时再调用一次（参数已去掉，无副作用），都在启动门读取已保存语言与路由读取地址之前。决定：不加首访浏览器语言识别——链接显式写出语言，访客自己的选择不被猜测覆盖（`docs/i18n-presentation.md`）。CHANGELOG 已记。

**审查与合并。** 推送前 Codex（gpt-6-astra，只读 low）1 项 P2：启动脚本在加载 `i18n.ts` 前失败时，错误页读不到链接语言；改为入口先应用（`160a5c6a`）。[PR #121](https://github.com/zora4523-bot/gatu-app/pull/121) 六项 CI 通过、机器人无发现，合入 `dev`（`d99c2bc9`）；[PR #122](https://github.com/zora4523-bot/gatu-app/pull/122)（`dev` → `main`）七项 CI 全绿（含配对开启构建），合入 `main`（`cdb47637`，代码树与 `d99c2bc9` 相同）。

**构建与发布。** 仓库外工作树 `gatu-release-p35`（先检出 `d99c2bc9` 装依赖，合并后切到 `cdb47637`），`.env.local` 软链主检出、不读内容，Node 22.15.0。命令行显式写出 `SAIRN_BUILD_SHA=cdb47637… SAIRN_RELEASE_ID=cloudfront-2026-10-28-p35 VITE_HYPERLIQUID_TESTNET= VITE_MOBILE_PAIRING_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_MAINNET_ENABLED=true VITE_CCTP_SPONSORED_DEPOSIT_TESTNET_ENABLED=false VITE_CCTP_EXTERNAL_DEPOSIT_TESTNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_MAINNET_ENABLED=true VITE_PRIVY_FIAT_FUNDING_TESTNET_ENABLED=true pnpm build`，再 `build:lambda`。总量 3,353,976 gzip（基线 +3,483）、手机运行时 118,309、桌面运行时 202,599；`build-meta.json` 提交、release 与三个闸门正确；`verify-chart-build.mjs` 退出码 0；产物无 `gatu.ai`。`functions --execute --origin https://app.sairn.ai`（3 个当前 + 1 个上一版哈希）→ `lambda`（版本 19，Active / Successful）→ `sync --allow-sponsored-mainnet-deposits --allow-mobile-pairing --allow-mainnet-card-funding --execute`（闸门行三项 on，1,646 个文件、0 失败，发布标记一致）→ 失效主网 `I66A746GR5I8Q7N2CHBOVXKDOP`、测试网 `I6BIGGLMX1YKW8JQ3W0BUQDTUA`（均 Completed）。

## 验证与限制

- 本地（提交 `160a5c6a`，即 PR #121 的头，2026-10-28）：`pnpm --dir apps/terminal exec vitest run src/lib/tests/link-locale.test.ts src/lib/tests/i18n-reactivity-contract.test.ts src/lib/tests/i18n-hot-switch.test.tsx src/lib/tests/lingui-helper-translator-contract.test.ts src/lib/tests/root-startup-fallback.test.tsx src/lib/tests/root-route-transition.test.tsx src/lib/tests/theme-bootstrap.test.ts src/lib/tests/trade-terminal-page-boot.test.tsx src/lib/tests/root-provider-split.test.ts src/lib/tests/language-switcher.test.tsx src/lib/tests/i18n-catalog.test.ts src/lib/tests/client-root-fatal.test.tsx src/lib/tests/market-catalog-bootstrap-dependency.test.ts`：13 个文件 392 项通过，其中 `link-locale.test.ts` 14 项。另跑 `pnpm exec biome check`（四个改动文件）、`pnpm --filter @sairn/terminal typecheck`，以及 Node 22.15 下 `SAIRN_BUILD_SHA=local SAIRN_RELEASE_ID=local-lang VITE_MOBILE_PAIRING_ENABLED=false pnpm --filter @sairn/terminal build`（预渲染 1 页，总量 3,351,027）。**未跑全量终端 Vitest**；当时 `link-locale.test.ts` 不在 CI 的手选清单里，所以 PR #121 与 #122 的「CI 全绿」不包含这 14 项。本地开发服务器（`vite dev --port 3025`）上 `ja-JP` 浏览器打开 `/trade/xyz:ANT?lang=ja&utm_…`：日语、参数去掉、UTM 保留、刷新仍为日语、无参数仍为英语。开发环境没有弹出 HIP-3 免责弹窗，当时改在线上 p34 预设日语核对其日语文案。
- 线上 p35：`verify --origin https://app.sairn.ai --network mainnet` 15/15、`--origin https://testnet.sairn.ai --network testnet` 16/16，两网 parity 为 `cdb47637 / cloudfront-2026-10-28-p35 / sponsored-mainnet-deposits=on mobile-pairing=on mainnet-card-funding=on`；`csp-coverage.mjs` 33 步、2 步跳过（同前几次）、0 违规、0 控制台错误。
- 线上邮件链接：`ja-JP` 无头 Chromium（390 与 1440 宽）打开 `https://app.sairn.ai/trade/xyz:ANT?lang=ja&utm_source=newsletter&utm_medium=email&utm_campaign=anthropic_ipo_jp&utm_content=preipo_trade_cta`：`<html lang="ja">`，免责弹窗为「HIP-3 デプロイヤー免責事項」，地址变为不含 `lang` 的同一路径与 UTM，localStorage 存 `ja`，无页面错误；不带参数时仍为英语。
- 邮件 v3（仓库外 `~/Downloads/sairn-ant-preipo-email-v3.html`）：两个按钮带 `lang=ja`，删去「英文确认画面、用地球图标切换」的说明，只保留「首次打开会出现第三方市场的确认画面」。
- 未做：真机与 Safari、Firefox；真实钱包登录与交易；`replaceState` 在其他浏览器上的行为只由规范与 Chromium 支撑。
- 发布工作树 `gatu-release-p35` 保留到下次发布；`gatu-release-p34` 是回滚产物；更早的发布工作树可删除（未删除）。

## 后续与替代关系

- 2026-10-29 Codex 对抗审查（gpt-6-astra，只读 high）：无 P0/P1、无安全发现；四项问题在分支 `claude/link-language-review-fixes`（`23fb89c0` 起，未推送）处理：Service Worker 对带 `lang` 的导航改为网络优先，避免回访者第一次点语言链接启动上一版缓存壳（已受旧 SW 控制的那一次导航仍可能是旧壳）；启动顺序测试改为真实执行客户端入口并补启动错误页、重复参数与存储写入失败用例，变异验证会失败；`link-locale.test.ts`、`client-bootstrap-error.test.ts`、`sw-navigation-cache.test.ts` 加入 CI 与 AGENTS 回归清单；本记录补上命令与版本。另记产品语义：链接语言会覆盖回访者此前的选择，`lang=en` 会清除它。 第二、三轮复审：三项已修复；为补剩余的旧 SW 首次导航，曾让新 SW 激活时重载带 `lang` 的页面（`c606864e`），第三轮指出 Firefox 的 `Client.url` 是创建地址会误重载并丢输入、带 fragment 时可能不取新壳、且拖住激活，已撤回（`518ea8a0`），取舍写入 `docs/i18n-presentation.md`（`e577bcc6`）；剩余情况为发布后回访者的第一次点击仍可能是旧壳。

- 上一次发布记录：[p34](2026-10-28-cloudfront-release-p34.md)。

- 2026-11-02 更正与补充（[语言链接 Service Worker 修复带到 dev](2026-11-02-link-language-sw-fixes-to-dev.md)）：上文写分支「未推送」时它止于 `e577bcc6`。2026-10-30 分支又加了 `452a2247`（带 `lang` 的导航遇到 5xx 时回退缓存壳），本记录没有写到，它也不在上述三轮审查之内。2026-11-02 该分支与本记录分支一起以合并（不变基）带到 `origin/dev`（`26c06d02`）上，成为分支 `claude/link-language-sw-fixes`；`452a2247` 补做一轮 Codex 只读审查（gpt-6-astra，low）：8.3/10、两项 P2（文档说只有旧 SW 回答的那一次导航会是旧壳，过度表述；测试钉不住 500 边界与 4xx、重定向的透传），已由 `658f5ddd`、`3a50a097` 修复。上文的构建、发布与线上验证只覆盖 p35（`cdb47637`），不覆盖这些 Service Worker 改动，它们没有发布；推送与 PR 情况见新记录。
