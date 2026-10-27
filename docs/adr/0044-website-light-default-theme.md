# ADR 0044：官网改为浅色默认主题，产品窗口保持深色

- 状态：已接受并实施（2026-10-26，运营方看过截图后确认「采用浅色版」）。运营方对深色首页的反馈是「设计感觉太古老了，非常不新颖，技术比较落后，太暗了」，并选定方向：暖纸白画布 + 品牌深青墨色 + 琥珀点缀，产品（终端截图、实时订单簿、市场卡片）放在深色窗口里形成对比。与官网升级、ADR 0043 一起提交；`?theme=dark` 保留旧的深色版本供对比，正式上线时是否保留待运营方决定。分支 `claude/japan-user-email-template-d3e2b5`，未合入 `dev`、未发布。
- 关联：[ADR 0043](0043-website-marketing-accent.md)（营销强调琥珀，本 ADR 启用其浅色值）；[ADR 0028](0028-brand-accent-colors.md)（界面品牌色，不变）；[官网规划](../website-plan.md) §6；[品牌标识与素材](../brand-assets.md)；AGENTS.md「Brand identity contract」。

## 背景与约束

- 官网此前只有深色主题（石墨画布 `#12131a`、窗口 `#0f1a1f`）。参考对象是 Stripe、Linear 浅色营销页与 Mercury：留白、轻层级、细分隔线、柔和多层阴影、清晰字体。
- 颜色只能来自品牌来源：`brand/brand.json`（`colors.light`、`logo.light`、`websiteColors.light`、`pwa.lightThemeColor`）与 Logo 套件令牌 `brand/tokens/sairn.tokens.json`（纸色 `paper-50/100/200`）。
- 主按钮保持中性 `--action`（浅色 `#15171e` 配白字），不染品牌色；焦点仍是 `--signal`（浅色 `#176b64`）；琥珀只做营销强调，不进风险、警告与状态（ADR 0043）。
- 涨跌色在浅色表面上用终端浅色主题的 `--market-up/down`（`#067a57` / `#c73a3a`），深色产品窗口里继续用终端深色值。
- 必须可回退、可对比：深色令牌整套保留，不闪烁地切换。

## 方案

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| A 构建开关 | 构建时二选一 | 对比要两次构建与两套产物；运营方无法在同一个地址切换 |
| **B 浅色为 `:root` 默认，深色为 `:root[data-theme="dark"]`，`?theme=dark` 切换** | 同一样式表带两套令牌；`<head>` 里一段带 CSP 哈希的内联脚本在首帧前设 `data-theme` | 一次构建即可对比；多一段内联脚本（CSP 哈希）与一份深色令牌块 |
| C 跟随系统 `prefers-color-scheme` | 媒体查询切换 | 运营方要的是品牌默认浅色，不是跟随系统；对比也不方便 |

## 决策

1. **采用方案 B。** `apps/website/src/styles/global.css` 的第一个 `:root` 是浅色令牌；`.surface-dark, :root[data-theme="dark"]` 是原深色令牌（数值不变，另加新角色）。`src/lib/theme.ts` 的 `THEME_QUERY_SCRIPT`：`?theme=dark` 设 `data-theme="dark"`，同时把 `theme-color` 换成 `pwa.themeColor`、`color-scheme` 换成 `dark`，并在本次浏览器会话内保留（`sessionStorage`，`?theme=light` 返回）。`Base.astro` 用 `Astro.csp.insertScriptHash` 加入它的哈希。
2. **浅色令牌：**画布 `--bg-base` = `paper-50` `#fafaf5`；条带 `--bg-band` = `paper-100` `#f5f4ee`；`--bg-sunken` = `paper-200` `#f0f3ed`；卡片 `--bg-raised` / `--bg-panel` / `--bg-overlay` = 白；标题与主文字 `--text-strong` = `logo.light.wordmark` `#08262e`；正文、次要、最弱文字是中性 `--action` 墨色的 80% / 70% / 65%（`#15171ecc` / `#15171eb3` / `#15171ea6`）；细线、填充与高光是墨色 `#08262e` 的低透明度；营销强调 `--marketing-accent` = `websiteColors.light.marketingAccent` `#99621f`，氛围光取它的 7% / 3%（深色仍是 10% / 5%）。`theme-color` 改用 `pwa.lightThemeColor`。
3. **产品窗口保持深色：**首屏预览（终端截图与 Live market 的 Open Book 画布）和功能区每张截图的舞台加 `.surface-dark`，在浅色页面里继承整套深色令牌（含深色涨跌、坐标轴与图例颜色）。市场卡片、市场表格与统计条是浅色白卡加等宽数字，不是深色带。
4. **新增角色（两套都有）：**`--bg-band`（条带）、`--bg-panel`（放在条带或画布上的面板，深色时等于石墨画布）、`--bg-selected`（功能页签选中底）；阴影改为 `--elevation-soft/card/window`，经 `@theme inline` 映射为 `shadow-soft/card/window`，浅色是墨色多层柔和阴影，深色保留原深投影。原 `.edge-base` 改名 `.edge-panel`。
5. **Logo：**`Logo.astro` 同时输出套件的 on-light 与 on-dark 横版组合（及标志），样式表按主题只显示一个。
6. **正文墨色为什么不用青灰：**品牌青灰（如 `teal-600` `#2b5055`）与 Hyperliquid `#23524c` 的 ΔE76 只有 8.3，低于规划 §6 的 15；中性的 `--action` 墨色在 70–80% 时 ΔE ≥ 18，且对比度 6.5–9.2。

## 后果与边界

- 规划 §6「只做深色主题」对官网作废；深色版本只作为 `?theme=dark` 对比与产品窗口保留。终端、`packages/ui` 与 OG 卡不变。
- 防仿冒色差检查对两套令牌各跑一遍。浅色的待决例外有三项：`--signal` `#176b64`（与 `#23524c` ΔE 12.1，共享品牌色）、`--signal-hover` `#0f524d`（ΔE 3.9）、`--text-strong` `#08262e`（Logo 字标墨色，与 `#03211c` ΔE 10.4）。三者都是 `brand.json` 的既有品牌值，是否接受由运营方决定。
- 浅色琥珀在最深的浅色表面上只有 4.55:1，所以琥珀不放在比 `paper-200` 更深的底上（套件规则：浅色琥珀文字不放在 `surface.raised` `#e8efeb` 上，4.36:1）。
- 对比度（WCAG 相对亮度；文字在画布 / 白卡 / 条带 / 下沉底上）：

  | 文字 | `#fafaf5` | `#ffffff` | `#f5f4ee` | `#f0f3ed` |
  | --- | --- | --- | --- | --- |
  | 墨色 `#08262e` | 15.11 | 15.82 | 14.36 | 14.13 |
  | 正文 `#15171ecc` | 9.24 | 9.51 | 8.95 | 8.85 |
  | 次要 `#15171eb3` | 6.53 | 6.66 | 6.37 | 6.32 |
  | 最弱 `#15171ea6` | 5.47 | 5.57 | 5.36 | 5.33 |
  | 琥珀 `#99621f` | 4.87 | 5.10 | 4.62 | 4.55 |
  | 焦点/链接 `#176b64` | 6.04 | 6.32 | 5.73 | 5.64 |
  | 上涨 `#067a57` | 5.10 | 5.34 | 4.85 | 4.77 |
  | 下跌 `#c73a3a` | 4.90 | 5.13 | 4.65 | 4.58 |

  主按钮白字在 `#15171e` 上 17.90:1；选中文字（白字在 `#176b64` 上）6.32:1。

## 证据

- 代码：`apps/website/src/styles/global.css`（两套令牌、`.surface-dark`、阴影、Logo 切换）；`src/lib/theme.ts`；`src/layouts/Base.astro`；`src/components/Logo.astro`、`Hero.astro`、`Features.astro`、`Faq.astro`；`src/config/brand.ts`（`THEME_COLOR` = `pwa.lightThemeColor`，`DARK_THEME_COLOR`）；`scripts/brand.mjs`（`checkWebsiteMarketingAccent` 检查两套块）。
- 测试：`apps/website/tests/brand-contract.test.mjs`（两套主题的品牌角色、纸色与墨色来自套件、每种文字在本主题每个表面 ≥ 4.5:1、两套色差与例外清单、两套 Logo）；`tests/platform-contract.test.mjs`（第三段内联脚本的哈希，并在 `vm` 里实际执行脚本：默认浅色、`?theme=dark`、会话保留、`?theme=light` 返回）；`tests/built/site.test.mjs`；`tests/brand-cross-app.test.mjs`（官网两套块等于 `brand.json`，涨跌色等于终端同主题值）；`tests/copy-contract.test.mjs`（Logo 文件名例外）。

## 验证

- 验证命令：`pnpm --filter @sairn/website test`；`pnpm --filter @sairn/website build` 后 `test:dist`；`node --test tests/brand-cross-app.test.mjs`；`pnpm brand:check`；`node --test scripts/ci-workflows.test.mjs`；`git diff --check`。
- 本次执行结果见任务报告（2026-10-26，工作区未提交）；截图由 Playwright 读构建产物（真实 `api.hyperliquid.xyz`，减少动态），在 1440×900 与 390×844 下拍摄，`scrollWidth − clientWidth` 均为 0。
- 变异检查：把浅色 `--text-weak` 改成 `#2b5055`，色差测试失败；把 `--text-faint` 改成 `#15171e80`，AA 测试失败；把浅色或深色 `--marketing-accent` 改一位，`pnpm brand:check` 失败（深色时跨应用测试也失败）；把浅色 `--text-success` 改掉，跨应用涨跌色测试失败。
- 没有做的：真机、Safari 与 Firefox 人工查看；200% 缩放与键盘走查；运营方对浅色方案的最终确认。
