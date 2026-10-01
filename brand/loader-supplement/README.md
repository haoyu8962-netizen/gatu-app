# 动效库补充符号（非设计方交付）

设计方的 Sairn 动效库 v1.3（`brand/tools/Sairn-Motion-Library-v1.3.html`，导出在 `brand/loader/`）没有「部分成交」「提示」「警告」三个状态符号，但终端的通知需要它们。本目录是依据 v1.3 的符号规则补做的版本，**待设计方确认**。设计方交付包含这三个符号的新版动效库后，删除本目录，再运行 `pnpm brand:export-motion` 与 `pnpm brand:sync`（脚本在本目录缺失时自动跳过它，生成器改从 `brand/loader` 取符号）。

## 文件

| 路径 | 内容 |
|---|---|
| `definitions.js` | 三个符号的定义，用动效库目录（`/lib/catalog.js` 的 `G`）的写法写成的 JavaScript 表达式 |
| `glyphs/<外观>/<符号>.svg`、`glyphs/<外观>/16/<符号>.svg` | 24 网格与 16 网格，外观为 on-dark、on-light、mono |
| `glyphs/<外观>/{,16/}static/partial.svg` | partial 的静态终态（另外两个没有动画） |
| `PROVENANCE.json` | 引擎与定义文件的哈希、补加的调色板角色、每个文件的哈希 |

## 生成方式

`pnpm brand:export-motion` 在导出动效库的同一个 Chromium 页面里：先用库自己的 `renderGlyph` 逐字节复现全部已交付符号（不一致就失败），再给三种外观的调色板补上 `attention`（取设计令牌的 `status.attention`）和 `info`（设计令牌没有提示色，取 `neutral`），把 `definitions.js` 追加到 `GLYPHS`，最后用 `renderGlyph` 渲染。`pnpm brand:check` 校验这里的每个文件与 `PROVENANCE.json` 一致；不要手改 SVG，改定义后重新导出。

## 设计依据

| 符号 | 底形与颜色 | 记号 | 动画 |
|---|---|---|---|
| partial（部分成交） | 成功色空心环，与动效库 submitting 同一种环 | 右半圆实心：空心的一半表示未成交的余量，实心的一半表示交易所已回报的成交（终端只在已核实的部分成交上用它，只是部分受理的批次用 warning） | 扇面扫入一次，560 ms（令牌 `confirm`），入场缓动；不循环，避免读成「进行中」 |
| info（提示） | 中性色实心圆 | 镂空字母 i：圆点 r1.25，竖线线宽 2.3 | 无 |
| warning（警告） | attention 色实心圆（令牌规定与 pending 同色，靠形状和静止区分） | 镂空感叹号，与 info 上下镜像；圆点与 unknown 一致 | 无 |

直线笔画统一线宽 2.3（同勾和叉），圆点统一 r1.25（同 unknown）；16 网格的竖条和圆点落在整像素上（同 wallet 和 cancelled）；mono 外观按引擎规则自动画成环。终端不直接使用这里的颜色：符号颜色映射到应用的语义令牌（见 `docs/brand-assets.md`「状态动效」）。

## 待设计方确认

- partial 用成功色还是 attention 色。选成功色是因为已成交的部分是服务端确认的事实，而且已有四个琥珀色符号（pending、wallet、unknown、warning）。
- 半圆可能被读成「50% 进度」。终端的部分成交通知同时有「部分成交」文字，按成交计数时还有「Fully filled x/y」；单笔成交量未核实时不显示数量。
- info 的颜色：令牌没有提示色。
