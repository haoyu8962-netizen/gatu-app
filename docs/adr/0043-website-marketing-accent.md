# ADR 0043：官网营销强调色改用 Logo 的选择琥珀

- 状态：已接受并实施（2026-10-26，运营方在对话中选定方案 B，此前已对比 CSS 覆盖预览的并排截图）；分支 `claude/japan-user-email-template-d3e2b5`，与未提交的首页改版一起提交；未合入 `dev`、未发布。
- 关联：[ADR 0027](0027-brand-single-source-and-identifier-rename.md)（单一来源）；[ADR 0028](0028-brand-accent-colors.md)（界面品牌色，本 ADR 只为官网新增一个角色，不改它的任何决定）；[品牌标识与素材](../brand-assets.md)「界面品牌色」；`.claude/rules/design-tokens.md`「Brand roles」；[官网规划](../website-plan.md) §6；AGENTS.md「Brand identity contract」。

## 背景与约束

- 官网只有深色主题。改版后的首页用薄荷 `--signal`（`#86e5d3`）做营销强调：首屏轮播词「Every market」、市场区标题的「one account」、FAQ 结尾的「One account.」、各处宣传图标、Fig. 1 的连线与箭头，以及首屏氛围光。
- 2026-10-26 的设计复评指出三个问题：
  - **仿冒距离不够。** 薄荷与 Hyperliquid 品牌色 `#97fce3` 的 ΔE76 只有 8.5，悬停色 `#a8eee1` 是 11.7，都低于规划 §6 要求的 15；`brand-contract.test.mjs` 把它们登记为待运营方决定的例外。大面积薄荷标题加青绿氛围光，让人先认出 Hyperliquid 生态，再认出 Sairn。
  - **品牌与上涨难以区分。** 官网的上涨/买入色是 `#77c7af`（复制终端深色 `--market-up`），与薄荷属于同一色域。两者是不同的令牌，但同屏出现（标题、行情条、Open Book 的买入点）时削弱了「品牌强调」和「市场状态」的区别。
  - **琥珀已在品牌里，但只授权给 Logo。** ADR 0028 规定 `--logo-choice`（深色 `#e6b766`、浅色 `#99621f`）只给 Logo 用，不是界面强调色；深色焦点不用琥珀，因为琥珀与警告色太接近。
- 约束：
  - 不改共享的 `--signal` 与终端：终端继续按 ADR 0028 执行，`packages/ui` 与终端样式表的取值不变。
  - 焦点环等于 signal（`--focus: var(--signal)`）是跨应用契约，不动。
  - 主按钮 `--action` 保持中性；涨跌色继续复制终端令牌（`#77c7af` / `#ff9c9c`），由跨应用测试钉住。
  - 新颜色只能来自 `brand/brand.json`（AGENTS.md 品牌契约），不能在官网写一个没有来源的新色值。

## 方案

| 方案 | 做法 | 优点 | 代价 |
| --- | --- | --- | --- |
| A 保留薄荷，缩小覆盖面 | 只留一个标题强调用薄荷，宣传图标和连线改灰白，压低薄荷光晕 | 改动最小；不新增品牌角色 | 与 Hyperliquid 的 ΔE 8.5 仍在，只是面积变小；品牌识别更弱 |
| **B 琥珀负责营销强调，薄荷退出营销** | 新增官网专用角色 `--marketing-accent` = `logo.dark.choice` `#e6b766`；营销强调全部改用它；薄荷只留焦点、选中、正文链接、实时指示与 Logo | 与 Hyperliquid 的 ΔE76 ≥ 63；与上涨色 ΔE 57；与 Logo 的另一半呼应，形成「石墨 + 克制琥珀 + 真实工作区」的识别 | 琥珀接近警告色（与官网 `--text-warning` `#e0be70` 的 ΔE76 只有 6.5），必须禁止它进入警告、风险与状态；需要新增品牌角色、ADR、文档与测试 |
| C 中性标题，双色只作签名 | 标题用白色，薄荷/琥珀只在小面积品牌图形里成对出现 | 最克制，最突出产品截图 | 品牌识别依赖图形与排版，容易成为通用产品站；把双色扩展成图形母题同样需要新角色 |

## 决策

1. **采用方案 B。** `brand/brand.json` 新增 `websiteColors`：`websiteColors.dark.marketingAccent` = `#e6b766`，`websiteColors.light.marketingAccent` = `#99621f`（官网目前没有浅色主题，浅色值只为完整，与 `logo.light.choice` 相同）。两者必须分别等于 `logo.dark.choice` 与 `logo.light.choice`：这个角色是 Logo 选择色的另一种用法，不是新颜色。
2. **只在官网使用。** `apps/website/src/styles/global.css` 的 `:root` 定义 `--marketing-accent: #e6b766`，主题映射 `--color-marketing-accent`，工具类是 `text-marketing-accent`（不用 `text-accent`，避免与 ADR 0028 称 signal 为 accent 混淆，也没有前缀重复）。氛围光令牌 `--glow-accent`（`rgb(230 183 102 / 10%)`）与 `--glow-accent-faint`（`5%`）取代原来的 `--glow-signal` 与 `--glow-signal-faint`。`packages/ui` 与终端样式表不得定义 `--marketing-accent`。实施时发现，三组页签的「选中」文字色与功能页签选中图标色写在 `@layer components` 里，被标签上的文字工具类覆盖，从未生效；这两条规则移到层外，测试钉住它们不在任何 `@layer` 内。
3. **用途清单（只限这些）：**
   - 首屏轮播词（「Every market」等）；市场区标题的「one account」；FAQ 结尾 CTA 的「One account.」；
   - 宣传图标：首屏三条理由、`#account` 三张卡、`#security` 清单的勾、Official links 的盾牌、Fig. 1 节点图标；
   - 功能页签选中时的图标；Fig. 1 的连线与箭头；
   - 首屏与 FAQ 结尾卡片的氛围光。
4. **保持不变：** `--action` 中性实心按钮；涨跌色；`--signal` 继续用于焦点环（`--focus: var(--signal)`）、`::selection`、实时指示（`--live`）、正文链接（`--text-brand`）与 Logo。
5. **禁止：** 琥珀不得用于警告、风险、错误或任何状态。具体是：风险句所在段落、`[data-cta-group]` 里的风险文字、事实块（Before you trade）、页头、页脚都不出现 `text-marketing-accent`；官网组件不使用 `text-warning` 一类的警告色（两者几乎同色，警告会被读成强调）。将来官网真需要警告色，要先另做设计决定。
6. **终端不变。** ADR 0028 的所有决定照旧，包括「深色焦点不用琥珀」。

## 后果与边界

- 官网的营销强调从薄荷变为琥珀；薄荷在官网只剩焦点、选中、正文链接、实时指示与 Logo，面积大幅缩小。共享的 `--signal` 取值没有变，所以 `brand-contract.test.mjs` 里 `--signal` 与 `--signal-hover` 的 ΔE 待决例外仍然保留，理由改写为「只用于焦点、选中、链接、实时指示与 Logo，不再做营销强调」。改共享取值仍是品牌决定。
- `--text-warning` 仍留在官网令牌里（与终端语义一致），但没有组件使用；测试要求 `global.css` 之外没有任何警告色用法。
- OG 卡（`designs/og-cards/`）本来就用选择琥珀标「自主判断」，不受影响。
- 对比度与色差（WCAG 相对亮度公式；ΔE76 用 CIELAB）：

  | 组合 | 结果 |
  | --- | --- |
  | `#e6b766` 在画布 `#12131a` / 窗口 `#0f1a1f` / 卡片 `#1d1e26` / 浮层 `#212d33` 上 | 9.99 / 9.54 / 8.95 / 7.62 : 1 |
  | `#e6b766` 与 Hyperliquid `#97fce3` / `#03211c` / `#23524c` | ΔE76 63.7 / 84.1 / 71.2 |
  | `#e6b766` 与 signal `#86e5d3` / 上涨 `#77c7af` / 下跌 `#ff9c9c` | ΔE76 62.4 / 57.2 / 42.9 |
  | `#e6b766` 与官网警告色 `#e0be70` | ΔE76 6.5（所以第 5 条禁止官网使用警告色） |
  | 浅色 `#99621f` 在 `#ffffff` 上（官网暂不使用） | 5.10 : 1 |

- 以后若出现琥珀实心按钮，按钮文字必须是深色（`#08090d` 在 `#e6b766` 上 10.74:1，白字只有 1.85:1）；本决定不包含这一步。

## 补记（2026-10-26，ADR 0044）

- 官网改为浅色默认主题后（[ADR 0044](0044-website-light-default-theme.md)，待运营方确认），浅色值 `websiteColors.light.marketingAccent` `#99621f` 开始使用：浅色 `:root` 的 `--marketing-accent` 取它，氛围光为 7% / 3%；深色值 `#e6b766` 留在 `:root[data-theme="dark"]` 与深色产品窗口（`.surface-dark`）里，氛围光仍是 10% / 5%。上文「官网目前没有浅色主题」与表中「官网暂不使用」两处由此过时。
- 浅色琥珀在画布 `#fafaf5` / 白卡 / 条带 `#f5f4ee` / 下沉底 `#f0f3ed` 上为 4.87 / 5.10 / 4.62 / 4.55 : 1，与 Hyperliquid 三色 ΔE76 ≥ 59。用途清单与禁止项不变。

## 证据

- 代码：`brand/brand.json` 的 `websiteColors`；`scripts/brand.mjs` 的 `checkSource`（角色只有 `light`/`dark` 两个主题、只有 `marketingAccent`、是六位十六进制、等于 `logo.*.choice`）与 `checkWebsiteMarketingAccent`（官网 `--marketing-accent` 等于 JSON、两个氛围光令牌是同一颜色的半透明、共享 UI 与终端没有定义它）；`apps/website/src/styles/global.css`；`Hero.astro`、`Markets.astro`、`Faq.astro`、`Trust.astro`、`AccountExecution.astro`。
- 测试：
  - `tests/brand-cross-app.test.mjs`：JSON 角色等于 Logo 选择色、官网令牌等于 JSON、与 signal 不同、`packages/ui` 与终端不定义它；
  - `apps/website/tests/brand-contract.test.mjs`：营销组件不再用 `text-signal` / `var(--signal)`，轮播词与市场标题用新工具类，功能页签、氛围光与 Fig. 1 连线用新令牌，焦点/选中/实时/正文链接仍是 signal；琥珀在四种表面上 ≥ 4.5:1、与 Hyperliquid 三色 ΔE76 ≥ 15；`global.css` 之外没有警告色；
  - `apps/website/tests/built/site.test.mjs`：构建产物的 CSS 带 JSON 的琥珀；首屏轮播、市场标题、FAQ 结尾用琥珀；营销页没有 `text-signal`；琥珀只出现在首页的营销区块，不在页头、页脚、事实块或风险句里。
- Reference：[品牌标识与素材](../brand-assets.md)「界面品牌色」；`.claude/rules/design-tokens.md`「Brand roles」；[官网规划](../website-plan.md) §6。

## 验证

- 验证命令：`pnpm brand:check`；`node --test tests/brand-cross-app.test.mjs`；`pnpm --filter @sairn/website test`；`pnpm --filter @sairn/website build` 后 `pnpm --filter @sairn/website test:dist`；`pnpm og:check`；`pnpm --dir apps/terminal exec vitest run src/lib/tests/brand-semantics-contract.test.ts`。
- 本次执行结果（2026-10-26，工作区含未提交的首页改版，HEAD `d4bd4f9c`）：`pnpm brand:check` 通过；`node --test tests/brand-cross-app.test.mjs` 7 项通过；`pnpm --filter @sairn/website test` 64 项通过；构建后 `test:dist` 36 项通过；`pnpm og:check` 两张卡逐像素一致；终端 `brand-semantics-contract` 等 11 个品牌相关测试文件 189 项通过；`node --test scripts/ci-workflows.test.mjs` 16 项通过；`git diff --check` 无输出。用 Playwright 读构建产物（真实 `api.hyperliquid.xyz`，减少动态）在 1440 与 390 宽确认轮播词、市场标题、FAQ 结尾与选中功能页签图标的计算颜色都是 `rgb(230, 183, 102)`，页面上没有 `text-signal` 元素，没有横向溢出。变异检查做了三项：把 FAQ 结尾的强调改回 `text-signal`、把琥珀加到 FAQ 结尾的风险句上，`test:dist` 的新测试都失败；把 `websiteColors.dark.marketingAccent` 改成 `#e6b767`，`pnpm brand:check` 与跨应用新测试都失败。
- 没有做的：真机与 Safari、Firefox 上的人工查看；200% 缩放与键盘走查；终端没有改动，不涉及终端构建。
