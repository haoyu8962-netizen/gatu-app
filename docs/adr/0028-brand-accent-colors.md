# ADR 0028：品牌色：青色与薄荷色强调，主按钮保持中性，终端画布不变

- 状态：已接受并实施（2026-10-01，分支 `claude/from-dev-1001`，提交 `cf9479d0`；Logo 颜色令牌来自 `a19e7cd3`）。本 ADR 是实施后同日补写的回溯记录。分支没有推送，未合入 `dev`，也未发布。悬停色由调查者提议，仍待设计方确认。决定是用户在执行前选择的[迁移计划](../brand-migration-plan.md) D4 b1；D4 子项与 D5 沿用计划的推荐默认值。 2026-10-08 补记：之后随 p24 发布（main `3ced842e`，2026-10-02）。
- 关联：[ADR 0027](0027-brand-single-source-and-identifier-rename.md)（单一来源）；[品牌标识与素材](../brand-assets.md)「界面品牌色」；`.claude/rules/design-tokens.md`「Brand roles」；AGENTS.md「Trading terminal visual contract」；[执行记录](../work-memory/sessions/2026-10-01-sairn-brand-migration-execution.md)。

## 背景与约束

- 改名前，`--signal` 是荧光绿：浅色 `#667311`，深色 `#d7ff3f`（`8274cc3d` 版的 `packages/ui/src/globals.css` 与 `apps/terminal/src/styles.css`）。Sairn 套件的主色是信号青/薄荷和选择琥珀，图标底色是 `#0A3038`（[LOGO-KIT.md](../../brand/LOGO-KIT.md)）。
- 计划 D4 给了三个选项：
  - a：只换 Logo，界面强调色保留荧光绿；
  - b1：`--signal` 及其悬停色、soft 色换成青色和薄荷色，`--action` 保持中性；
  - b2：`--action` 也换成品牌色。
- 计划调查记录的色差（未在本 ADR 复测）：
  - 套件的深色薄荷 `#86E5D3` 同时是它的 `status.success`。
  - 深色主题下，它与终端涨色 `#77C7AF` 的 ΔE2000 是 7.7，与 Spot 分类色是 7.3；浅色主题下，青色与 Spot 分类色只有 3.8（计划 §1.3、D4e）。
- 约束：
  - 终端深色画布与图表画布保持 `#0F1A1F`；浮层、遮罩、订单簿 `--orderbook-*` 和涨跌色都不改（AGENTS.md「Trading terminal visual contract」「Order book contract」）。
  - PWA 主题色必须等于深色 `--bg-base`（[运行约束](../runtime-guardrails.md) §8）。
  - 品牌色不能让「提交」「等待」被看成「买入」「成功」。

## 决策

1. **采用 b1。** `--signal`、`--signal-hover`、`--signal-soft` 的取值：

   | 主题 | `--signal` | `--signal-hover` | `--signal-soft` |
   | --- | --- | --- | --- |
   | 浅色 | 青色 `#176b64` | `#0f524d` | `rgb(23 107 100 / 10%)` |
   | 深色 | 薄荷色 `#86e5d3` | `#a8eee1` | `rgb(134 229 211 / 14%)` |

   `text-brand`、`text-signal`、`bg-signal-soft` 和焦点环都使用它。
2. **焦点色等于 signal。** 两种主题都是 `--focus: var(--signal)`，深色不用设计方提议的琥珀 `#E6B766`，因为琥珀和警告色的 ΔE 只有 3.9（计划 D4b）。
3. **`--action` 保持黑白中性。**
   - 浅色 `#15171e` / `#32363d` / `#08090d`，深色 `#edeef2` / `#ffffff` / `#d5d7de`。
   - Privy 的 `accentColor` 仍是 `#EDEEF2` / `#15171E`（`apps/terminal/src/config/privy.ts`）。
   - 理由：主按钮染成品牌色后，会和绿色的买入按钮难以区分。
4. **等待中的转圈改用中性色 `text-fg-muted`。** `cf9479d0` 改了 10 处，分布在订单提示、全局弹层、用户菜单弹层、图表加载与限流提示、懒加载弹层、存款与金库弹层。理由：薄荷色在套件里也是成功色，薄荷色的转圈会被看成「已完成」。启动出错页的按钮底色从 `#D7FF3F` 改为 `#86E5D3`（`lib/bootstrap-error-page.ts`）。
5. **画布与主题色不变（D5）。**
   - 深色 `--bg-base` 仍是 `#0f1a1f`，浮层 `#212d33`；浅色终端仍是白色。
   - manifest 的主题色和背景色仍是 `#0F1A1F`。
   - `#0A3038` 只用作图标底色（`brand.json` 的 `logo.iconBackground`）。
   - `--chart-accent`、TradingView 样式表、订单簿和涨跌色都不变。
6. **Logo 颜色与界面强调色分开。** `--logo-signal`、`--logo-choice`、`--logo-wordmark` 只给 `BrandLogo` 和 `BrandPageLoader` 用，不是界面强调色（ADR 0027 决策 6）。
7. **三份样式表写字面值，由测试与 `brand.json` 对照。** 涉及：
   - `packages/ui/src/globals.css`：`:root` 和 `.dark`；
   - `apps/terminal/src/styles.css`：`:root` 和 `.dark`；
   - `apps/website/src/styles/global.css`：只有深色。

   这里不改成从 JSON 生成，因为现有测试只在同一个选择器块内解析 `var()`（计划附录 A 第 5 条）。`tests/brand-cross-app.test.mjs` 断言三份样式表的七个品牌变量都等于 `brand.json` 的 `colors`，`--focus` 都是 `var(--signal)`。它还断言，在终端两种主题的 `--bg-base`、`--bg-raised`、`--bg-overlay`、`--bg-sunken` 上，signal 和悬停色的对比度都不低于 4.5:1。`brand-semantics-contract.test.ts` 另外用字面量钉住终端的取值、画布、订单簿、Spot 和涨跌色，与 JSON 无关。这样单改 JSON 时测试也会失败。

### 对比度（WCAG 相对亮度公式）

| 组合 | 对比度 |
| --- | --- |
| 深色 `#86e5d3` 在 `#0f1a1f` / `#212d33` 上 | 11.92 / 9.52 |
| 浅色 `#176b64` 在 `#ffffff` / `#f5f6fa` 上 | 6.32 / 5.85 |
| 深色悬停 `#a8eee1` 在 `#0f1a1f` / `#212d33` 上 | 13.45 / 10.74 |
| 浅色悬停 `#0f524d` 在 `#ffffff` / `#f5f6fa` 上 | 9.00 / 8.33 |

前两行是 [brand-assets.md](../brand-assets.md) 记录的值，后两行是撰写本 ADR 时用同一公式补算的；前两行也复算过，结果一致。

## 备选方案与代价

- **a（保留荧光绿）**：零视觉风险，但界面强调色和新 Logo 不属于同一套颜色。否决。
- **b2（主按钮也用品牌色）**：品牌感更强，但「提交」按钮和绿色「买入」按钮难以区分（计划 D4）。否决。
- **深色焦点用琥珀**：符合设计方的建议，但和警告色太接近。否决。
- **终端画布改成 `#0A3038`**：计划 D5 复算过，订单簿买盘对比度会降到 4.31，`--market-neutral` 降到 3.78，浮层 `#212D33` 对底色只有 1.00，还违反终端视觉契约。否决。
- **品牌色只放一份共享 CSS**（例如 `packages/ui` 的 `brand.css`）：可以减少字面量，但要改变现有测试解析变量的方式，留作以后再做。

## 后果与边界

- 链接、品牌文字、徽章、选中高亮和焦点环从荧光绿变为青色（浅色）或薄荷色（深色）。主按钮、Privy 强调色、图表和订单簿不变。
- 悬停色 `#A8EEE1` / `#0F524D` 是调查者提议的值，还在等设计方确认（计划附录 B 第 4 项；执行记录「后续」）。
- 色相相近的问题（D4e）只靠一条规则约束：signal 不放在数字或盈亏旁边。没有契约测试登记 ΔE 下限或例外。浅色 Spot 分类色和青色太接近的问题，在等设计方复核（附录 B 第 9 项）。
- 中性转圈只由 `.claude/rules/design-tokens.md` 的规则约束，没有测试禁止 `animate-spin` 与 `text-signal` 同时出现。
- 计划阶段 6 要求逐个审查向内偏移或零偏移的焦点环：浅色青色紧贴 `#15171e` 时对比度只有 2.83:1，`apps/terminal/src` 里还有 10 行 `outline-offset-[-2px]`。执行记录没有这项审查的结果，也没有记载用键盘 Tab 走查过焦点环。

## 证据

- 代码：`brand/brand.json` 的 `colors`；三份样式表里的 `--signal`、`--action`、`--focus`；`apps/terminal/src/config/privy.ts`；`apps/terminal/src/lib/bootstrap-error-page.ts`。
- 测试：`tests/brand-cross-app.test.mjs`；`apps/terminal/src/lib/tests/brand-semantics-contract.test.ts`；`apps/terminal/src/lib/tests/bootstrap-error-page.test.ts`；`apps/website/tests/brand-contract.test.mjs`。
- Reference：[品牌标识与素材](../brand-assets.md)「界面品牌色」；`.claude/rules/design-tokens.md`「Brand roles」；[运行约束](../runtime-guardrails.md) §8。

## 验证

- **执行记录中 `cf9479d0` 一行**：
  - 终端完整测试通过；颜色改动后只有 `bootstrap-error-page` 一项需要更新期望值。
  - 对比度契约做过变异检查。
  - 用无头 Chromium 截图核对了深浅两种主题下的桌面和手机交易页。
  - 后续最终一轮的全量结果见 ADR 0027「验证」。
- **撰写本 ADR 时的复查**（HEAD `7a511af3`，工作区含另一会话未提交的改动）：`node --test tests/brand-cross-app.test.mjs` 4 项通过，`brand-semantics-contract.test.ts` 4 项通过。
- **没有做的**：官网配色的人工检查与焦点环的键盘走查（执行记录没有记载）；真机、Safari、Firefox；发布。
