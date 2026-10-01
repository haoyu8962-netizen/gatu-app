# Sairn 动效 v1.3

SVG 文件自带 CSS，不含脚本、字体与外部资源。

## 文件
| 路径 | 内容 |
|---|---|
| `svg/<外观>/<动效>.svg` | 动态版，16 种 |
| `svg/<外观>/static/<动效>.svg` | 静态终态（减少动态效果时使用） |
| `glyphs/<外观>/<符号>.svg` | 状态符号，24 网格，20–32 px |
| `glyphs/<外观>/16/<符号>.svg` | 状态符号，16 网格，16 px |
| `sairn-motion.js` | 内联渲染：renderMotion、renderGlyph、motionCSS、setProgress 等。`<script>` 引入后为 `window.SairnMotion`，也可 `require` |
| `sairn-motion.d.ts` | TypeScript 类型 |
| `sairn-motion.tokens.json` | 时长、缓动、最暗帧透明度、业务状态映射 |

外观：on-dark、on-light、mono（currentColor，需内联才能继承颜色）。

## 规则
- 交易进行中插图 ≥ 64 px，结果插图 ≥ 48 px；更小处用状态符号。按钮加载用 16 px 专用轮廓。
- 循环动效最暗帧：深色底透明度 ≥ 0.55，浅色底 ≥ 0.78（对比度 ≥ 3:1）。骨架占位除外。
- 「结果未知」不映射为失败，不自动重试。
- 进度只接受 0–100 的实测值；`progress.svg` 默认 0%。
