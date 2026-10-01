# 品牌素材目录

本目录是品牌标识的唯一来源：名称、域名、邮箱、颜色、Logo、图标、动效和分享卡素材都从这里出发，应用里的副本由脚本同步或校验。迁移计划见 [docs/brand-migration-plan.md](../docs/brand-migration-plan.md)。

## 目录

| 路径 | 内容 | 来源 |
|---|---|---|
| `brand.json` | 名称、域名（主域名与仍需识别的旧域名）、邮箱、界面品牌色、Logo 颜色、PWA 主题色 | 仓库维护；应用与脚本只读这里 |
| `LOGO-KIT.md` | Logo 与图标套件 v1.3 的说明：尺寸规则、安全空间、颜色、各平台接入方式 | 设计方原文 |
| `svg/`、`png/` | 标志、简化标志、横版组合、字标；SVG 五种配色（on-light、on-dark、black、white、mono） | 设计方原件 |
| `web/` | favicon、apple-touch、PWA 图标、`site.webmanifest`、`head.html` | 设计方原件；`icon.svg`、`icon-maskable-192.png` 与 Privy 登录邮件用的 `email-logo.png`（360×180、白底横版组合）由 `pnpm brand:derive-icons` 按套件几何派生 |
| `social/` | 社交平台头像（深、浅 × 400、1024） | 设计方原件 |
| `ios/`、`android/`、`harmonyos/` | 原生 App 图标集 | 设计方原件；仓库没有原生工程，仅存档 |
| `tools/` | Motion Library 与 Share Studio 两个离线 HTML 工具 | 设计方原件；产品代码不引用 |
| `loader/` | 动效库导出：16 种动效（三种外观、动态与静态终态）、7 个状态符号、时长令牌；`PROVENANCE.json` 记录来源哈希 | 由 `node scripts/brand-export-motion.mjs` 从 `tools/` 导出 |
| `loader-supplement/` | 动效库缺少的三个状态符号（部分成交、提示、警告），三种外观 × 两种网格 | Claude 依据 v1.3 规则补做、待设计方确认；由同一条导出命令用库自己的引擎渲染 `definitions.js`，`PROVENANCE.json` 记录哈希，说明见其 `README.md` |
| `tokens/sairn.tokens.json` | 设计令牌（调色板、深浅主题的表面、文字、状态色） | 由同一脚本从两个 HTML 工具中提取，并校验两者一致 |
| `share-cards/` | 分享卡与链接预览卡素材 | 设计方未交付；两张 1200×630 链接预览卡由 `designs/og-cards/cards.html` 按 Sairn 视觉生成（`pnpm og:generate`），持仓盈亏分享卡在终端代码里绘制 |
| `fonts/` | 品牌字体与授权文件 | 当前没有专用字体 |
| `_source/` | 原始压缩包与设计工程文件 | 不进 Git |

## 规则摘要

完整规则以 [LOGO-KIT.md](LOGO-KIT.md) 为准。

- 标志高度 ≥ 24 px 用完整标志，更小用 `svg/mark-small`；横版组合高度 ≥ 24 px。
- 浅底：信号 `#176B64`、选择 `#99621F`、字标 `#08262E`。深底：信号 `#86E5D3`、选择 `#E6B766`、字标 `#FFFFFF`。图标底色 `#0A3038`。
- 不旋转标志，不变形路径，不加滤镜。

## 更新素材

1. 设计方的新版本覆盖到对应目录，原始压缩包放进 `_source/`。
2. 动效库或分享卡工具更新后，运行 `pnpm brand:export-motion` 重新导出，再用 `node scripts/brand-export-motion.mjs --check` 确认导出可以复现。
3. 不要手工修改 `loader/`、`loader-supplement/glyphs/` 与 `tokens/` 下的文件，它们以 `PROVENANCE.json` 与工具原件为准；补充符号只改 `loader-supplement/definitions.js` 后重新导出。设计方交付含这三个符号的新版动效库后，删除 `loader-supplement/`，再运行 `pnpm brand:export-motion` 与 `pnpm brand:sync`：脚本在补充目录缺失时自动跳过它，生成器优先从 `brand/loader` 取符号；导出时若新版库已含某个补充符号而目录还在，会提示先删除目录。
4. 改了 `brand.json` 或任何素材后运行 `pnpm brand:check` 与 `pnpm test:brand`；读取方和校验清单见 [docs/brand-assets.md](../docs/brand-assets.md)。
