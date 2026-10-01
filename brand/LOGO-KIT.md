# Sairn 标志与图标 v1.3

几何取自已批准的 A / Signal Gate 路径，未改动。共 112 个文件。

## 文件
| 目录 | 内容 |
|---|---|
| svg/mark | 标志，紧贴轮廓：on-light、on-dark、black、white、mono（currentColor） |
| svg/mark-small | 简化轮廓，16 × 16 网格，同上 5 种 |
| svg/lockup | 横版组合：标志 + 字标，同上 5 种 |
| svg/wordmark | 字标，同上 5 种（on-dark 与 white 均为 #FFFFFF） |
| png/mark、png/lockup、png/wordmark | 透明底，按高度命名：h32 = 高 32 px |
| png/mark-small | 透明底，16 网格方形：16 / 24 / 32 / 48 px |
| ios/AppIcon.appiconset | 默认（RGB，无透明通道）、深色（透明底）、着色（灰度），均 1024 |
| ios/icon-composer | Icon Composer 图层：背景 #0A3038、信号面板、选择面板 |
| android/app/src/main/res | 自适应图标（前景、背景色、单色）、5 个密度的 mipmap PNG |
| android/play-store-icon-512.png | Google Play 图标，32 位 PNG，直角 |
| harmonyos | 分层图标（前景 + 纯色背景，各 1024）、启动图标与启动背景色 |
| web | favicon.ico（16 / 32 / 48）、favicon.svg、apple-touch-icon、PWA 图标、site.webmanifest、head.html |
| social | 头像，深 / 浅 × 400 / 1024 |

## 规则
- 标志高度 ≥ 24 px 用完整标志；更小用 svg/mark-small，按 16 / 32 / 48 px 显示时边缘对齐整像素。png/mark-small 的 24 px 版左移 0.5 px，边缘同样对齐。
- 横版组合高度 ≥ 24 px；更小只用标志。
- 安全空间：四周留标志高度的 25%；组合同样以标志高度计。
- 浅底：信号 #176B64、选择 #99621F、字标 #08262E。深底：信号 #86E5D3、选择 #E6B766、字标 #FFFFFF。
- 单色：黑、白或 currentColor，两块面板同色。

## 图标中的标志比例
| 文件 | 画布 | 标志高度 |
|---|---|---|
| iOS、Play、鸿蒙前景、apple-touch、maskable、头像 | 全出血方形 | 画布高度的 60% |
| Android 自适应前景（含单色层） | 108 dp，安全圆 66 dp | 50 dp |
| Android 旧版 ic_launcher / ic_launcher_round | 圆角方 / 圆，四周内缩 1/24 | 可见区域的 58% / 56% |
| web/icon-192、icon-512 | 圆角方，内缩 8 / 20 px | 可见区域的 60% |
| favicon.ico 16 / 32 | 圆角方 | 简化轮廓，16 网格 1 倍 / 2 倍 |
| favicon.ico 48 | 圆角方 | 可见区域的 62% |
| 鸿蒙 startIcon | 256 px，透明底 | 画布高度的 80% |

图标底色 #0A3038。

## 接入
- iOS：用 ios/AppIcon.appiconset 替换 Assets.xcassets/AppIcon.appiconset。
- Android：先删除工程 res/mipmap-*/ 下的 ic_launcher*.webp（与同名 PNG 冲突），再把 android/app/src/main/res 合并进工程。
- 鸿蒙：复制两个 media 目录下的文件；把 start_window_background 这一条颜色合并进工程的 element/color.json（不要整文件覆盖）。app.json5 的 icon 与 module.json5 的 abilities[].icon 设为 `$media:layered_image`，startWindowIcon 设为 `$media:startIcon`，startWindowBackground 设为 `$color:start_window_background`。
- Web：web 目录的文件放到站点根目录，head.html 的内容放进 `<head>`。
