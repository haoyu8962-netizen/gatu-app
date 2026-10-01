# 品牌素材交付目录

这里是新品牌设计的唯一投放点。设计稿按下面的清单放进对应子目录，文字信息（名称、域名、邮箱、颜色）填在 [brand-info.yaml](brand-info.yaml)。素材到齐后，代码会改为从本目录同步到各应用，替换计划见文末。

| 目录 | 放什么 | 是否进 Git |
|---|---|---|
| `logo/` | 图形标、字标、横排组合 | 是 |
| `icons/` | 网站图标、App 图标源图 | 是 |
| `loader/` | 加载动效 | 是 |
| `share-cards/og/` | 链接预览卡片（社交平台抓取的 1200×630 图） | 是 |
| `share-cards/pnl/` | 持仓盈亏分享卡设计稿 | 是 |
| `fonts/` | 新品牌字体及其授权文件 | 是 |
| `_source/` | 原始工程文件（.fig / .ai / .psd / .sketch） | 否，已加入 `.gitignore` |

## 通用要求

- 矢量素材交 SVG：文字全部转曲，不嵌入位图，不引用外部字体或链接。
- 位图交 PNG，按标注尺寸导出，不要额外留白边。
- 每种素材都要能在浅色和深色两种主题下使用。做法二选一：交两份文件（文件名带 `-light` / `-dark`），或者只用两种颜色、并标注哪一部分是主体色（ink）、哪一部分是点缀色（node）。现在的 Logo 用的是第二种做法，主题切换时只换颜色变量。
- 文件名用小写英文和连字符，例如 `logo-mark.svg`。

## 交付清单

### logo/

| 文件 | 规格 | 用在哪里 |
|---|---|---|
| `logo-mark.svg` | 正方形画板，只有图形 | 移动端页头、菜单抽屉，也是图标的来源 |
| `logo-wordmark.svg` | 只有文字 | 官网 |
| `logo-lockup.svg` | 图形加文字横排 | 桌面端顶部导航、官网页头 |
| `logo-mark-micro.svg`（可选） | 16–24px 下仍能看清的加粗版 | 极小尺寸 |

现状：Logo 是代码里的 [gatu-logo.tsx](../apps/terminal/src/components/brand/gatu-logo.tsx)，按主题换色；官网用的是 `apps/website/public/logo.svg` 和 `logo-mark.svg`。

### icons/

| 文件 | 规格 | 生成哪些文件 |
|---|---|---|
| `app-icon-1024.png` | 1024×1024，**不透明背景** | `icon-192/512.png`，以及 180×180 的 `apple-touch-icon.png`（iOS 会把透明区域显示成黑色） |
| `app-icon-maskable-1024.png` | 1024×1024，铺满底色，主体放在中心 80% 的安全区内 | Android 自适应图标 `icon-maskable-192/512.png` |
| `favicon.svg` | 正方形，在 16px 下仍能辨认 | 浏览器标签图标 `favicon.svg`、`icon.svg`，`favicon.ico` 由它生成（16/32/48/64） |

PWA 启动画面和浏览器地址栏的颜色填在 `brand-info.yaml` 的 `pwa_theme` / `pwa_background`。

### loader/

| 文件 | 规格 |
|---|---|
| `loader.svg` | 正方形画板，**静态**帧 |
| `loader-motion.md`（或标注图） | 动效说明：哪个部分动、时长、缓动、是否循环、颜色分别对应哪个变量 |
| `loader-reduced-motion.svg` | 系统开启「减少动态效果」时显示的静态帧 |

- 最好用 SVG 加 CSS 就能实现的动效（描边位移、透明度、旋转、缩放）。如果交的是 Lottie、GIF 或视频，就要多引入一个播放库，会突破首屏包体预算，需要单独评估。
- 现状：[gatu-orbit-loader.tsx](../apps/terminal/src/components/brand/gatu-orbit-loader.tsx)，48×48。一段高亮沿 Logo 路径循环移动，1.5 秒一圈、匀速，底轨透明度 20%。它只出现在图表加载时。
- 应用启动阶段按项目约定是空白页（ADR 0010），不显示任何加载动画。如果新设计希望启动时也显示品牌动效，这属于产品决策，需要先单独确认。

### share-cards/og/

| 文件 | 规格 |
|---|---|
| `og-terminal.png` | 1200×630，交易终端的链接预览图 |
| `og-website.png` | 1200×630，官网的链接预览图，必须和终端那张不同 |

- 如果卡片上有文字，请把用到的字体放进 `fonts/`。现在的卡片不是直接放图片，而是由 `designs/og-cards/cards.html` 模板生成，再用 `pnpm og:check` 防止图片和模板不一致。
- 你可以只交最终 PNG（流程会改为直接复制并校验尺寸），也可以交设计稿让我按它改模板。请注明选哪种。

### share-cards/pnl/

持仓盈亏分享卡不是一张固定图片：用户点击分享时，浏览器才把实时数据画出来。所以这里需要交的是**带标注的设计稿**：

| 文件 | 内容 |
|---|---|
| `pnl-card.png` | 设计效果图，盈利和亏损各一张 |
| `pnl-card-spec.md`（或标注图） | 画布尺寸、每个字段的位置和字号、颜色、圆角、二维码的位置和大小 |
| `pnl-card-background.svg/png`（可选） | 固定不变的背景或装饰层 |

现在卡片上画的字段：品牌字样、时间、交易对、多空与杠杆、收益率（ROE）、盈亏金额、开仓价、标记价格、网络标签（测试网时显示）、指向该市场的二维码。画布 360×260，圆角 16，导出时放大 3 倍。如果要增删字段，请在标注里写明。

### fonts/

放 `.woff2` 字体文件和对应的授权文件（例如 `OFL-xxx.txt`）。只有新品牌要换字体时才需要。现在界面用 Inter 和 IBM Plex Sans，预览卡片用 Barlow 和 Noto Sans SC。

## 替换计划

素材和 `brand-info.yaml` 到齐后分三步做，每一步单独提交、单独验证：

1. **集中**（不改外观）：把现有素材迁进本目录，加上 `brand:sync`（同步到 `apps/*/public/`）和 `brand:check`（检查同步结果）。三份 CSS 里的品牌色改成引用同一个文件，Logo 和加载动效组件改为读取本目录的 SVG，域名和邮箱改为读取 `brand-info.yaml`。用现有的 `pnpm test:brand` 和页面截图对比证明外观完全没变。
2. **换设计**：用新素材替换本目录里的文件，运行 `brand:sync`，再更新对应测试的期望值，并在桌面端、窄屏和移动端，浅色和深色主题下逐一截图核对。
3. **换域名**：代码和文本里的引用改成新值，并写一份 ADR 和上线清单。DNS、HTTPS 证书、CloudFront 绑定的域名、Privy 后台的允许域名、内容安全策略的上报地址和邮箱服务都需要在各自后台操作，代码合入不等于新域名可以上线。
