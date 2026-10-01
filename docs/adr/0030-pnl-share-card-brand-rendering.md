# ADR 0030：盈亏分享卡的品牌渲染边界

- 状态：已接受并实施（2026-10-01，分支 `claude/from-dev-1001`，提交 `3f502cb7`；品牌名和文件名前缀的接线在 `4bba29b1`）。本 ADR 是实施后同日补写的回溯记录。分支没有推送，未合入 `dev`，也未发布。没有在真机上分享过真实持仓。
- 关联：[ADR 0027](0027-brand-single-source-and-identifier-rename.md)（单一来源、`BrandLogo`、Logo 令牌）；[ADR 0028](0028-brand-accent-colors.md)（品牌色）；[迁移计划](../brand-migration-plan.md) D13、阶段 4b；[品牌标识与素材](../brand-assets.md)「Logo、图标与加载动效」；[执行记录](../work-memory/sessions/2026-10-01-sairn-brand-migration-execution.md)。

## 背景与约束

- 现有的持仓盈亏分享卡由 `apps/terminal/src/lib/trade/position-pnl-share.ts` 在画布上绘制：
  - 卡面 360×260，导出倍数 `EXPORT_SCALE = 2`，二维码用已有依赖 `qrcode` 生成；
  - 弹窗 `position-pnl-share-modal.tsx` 另有一份 DOM 预览；
  - 改名前，卡上的品牌是一行文字，取值为 `APP_NAME.toLocaleUpperCase()`，即「GATU」。
- 卡面颜色来自 `--position-share-*` 令牌。`apps/terminal/src/styles.css` 写明这些令牌在两种主题下固定为同一块深色画布，所以分享卡在浅色主题下也是深色的。
- 计划阶段 4b 提出用 Share Studio 的 `trade` 模板重写渲染器：SVG 转画布、懒加载弹窗、RTL、溢出降级等。它依赖设计方的标注稿，但 `brand/share-cards/pnl/` 没有交付（计划 §1.2）。
- 约束：
  - 套件规定横版组合的高度不低于 24 px（[LOGO-KIT.md](../../brand/LOGO-KIT.md)）。
  - 不新增运行时依赖，不复制 Studio 里的二维码代码（计划风险 #20）。
  - 保留现有的数据契约：数据完整才生成、`capturedAtMs`、数字格式、测试网不出链接。
  - Logo 几何只能来自生成模块，不能另抄一份路径。

## 决策

1. **画布用 `Path2D` 绘制 24 px 高的横版组合。**
   - `drawBrandLockup` 读取 `BRAND_LOGO_GEOMETRY.lockup`，按 viewBox 缩放到 24 px 高，放在 (26, 18)。
   - 信号、选择、字标三部分分别填色。原来的品牌文字行和图像模型里的 `brand` 字段一并删除。
   - 几何模块从 `components/brand/` 移到 `apps/terminal/src/lib/brand/logo-geometry.gen.ts`，这样 `lib/` 里的绘制代码不用从组件目录导入。生成器 `scripts/brand.mjs` 的输出路径同步修改。
2. **弹窗预览用 `BrandLogo`。** 预览与画布共用同一份几何，并在类名里把 `--logo-signal`、`--logo-choice`、`--logo-wordmark` 覆盖为分享卡令牌。
3. **Logo 固定用深底配色，不随主题变化。**
   - 新增 `--position-share-logo-signal: #86e5d3` 和 `--position-share-logo-choice: #e6b766`，等于 `brand.json` 的 `logo.dark`。它们只定义在 `:root`，与其他 `--position-share-*` 一样不随主题变化。
   - 字标用卡面正文色 `--position-share-fg`（`#ffffff`）。
   - 画布调色板由 `readPositionPnlSharePalette` 读取，缺少任何一个令牌就抛错，不会自己编一个颜色。
4. **下载文件名前缀取 `BRAND_FILE_STEM`。** 文件名是 `${BRAND_FILE_STEM}-${coin}-pnl-${ISO 时间}.png`，再交给 `sanitizePositionPnlShareFilename` 清理。
5. **品牌名的可访问名称来自 `BRAND_NAME`。** `BrandLogo` 自身是 `aria-hidden`，旁边放一个 `sr-only` 的 `BRAND_NAME`。卡片容器原有的 `aria-label`（「PNL share card for …」）不变。
6. **这次不实施计划 4b 的完整重写。** SVG 渲染器、Studio 模板、懒加载弹窗、RTL、溢出降级和令牌清理仍是计划里的后续项。

## 备选方案与代价

- **保留文字品牌，只把名称换成 `Sairn`**：改动最小，但卡上没有 Logo，和其他品牌表面不一致。没有采用。
- **把 `/brand/lockup-on-dark.svg` 当图片加载，再 `drawImage`**：可以直接复用同步的公共文件。代价是导出前要多一次异步加载和 SVG 解码，各浏览器把 SVG 画进画布的行为需要逐个验证（计划风险 #21，【推断】）。`Path2D` 用的几何已经在打包产物里，不发网络请求。没有采用。
- **Logo 用随主题变化的 `--logo-*`**：首版就是这样做的。在浅色主题下，深色卡面上的 Logo 看不清（执行记录），所以改为固定深底配色。
- **按计划 4b 完整重写**：能解决 RTL、溢出和预览与导出的一致性，但范围大，而且依赖还没交付的标注稿。留作后续。

## 后果与边界

- 分享卡没有新增素材或依赖。几何模块本来就在页头的共享块里。
- 卡面其余部分不变：盈亏和多空颜色、二维码、测试网标签、字段与布局。
- 单元测试只覆盖两点：调色板包含两个 Logo 令牌，以及文件名清理器的行为。没有单测断言画布上真的画出了横版组合，也没有单测钉住 `sairn-` 前缀（弹窗测试把下载函数换成了桩）。画布上的 Logo 只经过无头 Chromium 的人工查看。
- 没有验证的：在 iOS、Android 真机上走系统分享面板；Safari、Firefox 的 `Path2D` 绘制和导出；RTL 语言下的卡面；用真实账户持仓生成的分享图。

## 证据

- 代码：`apps/terminal/src/lib/trade/position-pnl-share.ts`（`drawBrandLockup`、`readPositionPnlSharePalette`、`sanitizePositionPnlShareFilename`）、`apps/terminal/src/components/trade/positions/position-pnl-share-modal.tsx`、`apps/terminal/src/lib/brand/logo-geometry.gen.ts`、`apps/terminal/src/components/brand/brand-logo.tsx`、`apps/terminal/src/config/brand.ts`，以及 `apps/terminal/src/styles.css` 的 `--position-share-*`。
- 测试：`apps/terminal/src/lib/tests/position-pnl-share.test.ts`（调色板、文件名、浏览器失败路径）、`apps/terminal/src/lib/tests/position-pnl-share-modal.test.tsx`。
- Reference：[品牌标识与素材](../brand-assets.md)「Logo、图标与加载动效」中的「持仓盈亏分享卡」一行。

## 验证

- **执行记录中 `3f502cb7` 一行**：相关的 10 个测试文件共 306 项通过。另外经开发服务器加载模块，用无头 Chromium 渲染了深浅两种主题下的分享卡并人工查看；首版在浅色主题下 Logo 看不清，已改为固定深底配色。后续最终一轮的全量结果见 ADR 0027「验证」。
- **撰写本 ADR 时的复查**（HEAD `7a511af3`，工作区含另一会话未提交的改动）：`position-pnl-share.test.ts` 10 项、`position-pnl-share-modal.test.tsx` 7 项通过。
- **没有做的**：真机分享、非 Chromium 浏览器、真实持仓、发布。
