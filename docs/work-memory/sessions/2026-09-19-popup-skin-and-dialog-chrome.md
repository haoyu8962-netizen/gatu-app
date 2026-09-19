<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-19-popup-skin-and-dialog-chrome",
  "date": "2026-09-19",
  "title": "菜单共享皮肤、弹窗统一圆角与边框，并让 cn() 认识项目刻度",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "docs-governance"
  ],
  "summary": "根因是 tailwind-merge 不认识项目的圆角、阴影、字体刻度，覆盖基础组件时两个类都保留、由样式表顺序决定，于是各处堆 !important；修复 cn() 后把 5 份菜单皮肤收敛为一份、桌面弹窗统一 16px 圆角加 1px 边、底部抽屉默认 16px，并用棘轮测试钉住 241 处任意字号、228 处任意圆角、18 处 ! 表面覆盖。全仓批量替换与 market-close 令牌改名未做。",
  "thread": null,
  "baseCommit": "c8d3031f",
  "commits": [
    "82f49853",
    "be864398",
    "68ace62c",
    "eb9423d0"
  ],
  "sources": [
    { "path": "apps/terminal/src/lib/cn.ts" },
    { "path": "packages/ui/src/utils.ts" },
    { "path": "apps/terminal/src/lib/ui/menu-popup-skin.ts" },
    { "path": "packages/ui/src/modal.tsx" },
    { "path": "packages/ui/src/drawer.tsx" },
    { "path": "apps/terminal/src/lib/tests/class-merge-theme-scales.test.ts" },
    { "path": "apps/terminal/src/lib/tests/design-token-ratchet.test.ts" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": ".claude/rules/design-tokens.md" },
    { "path": "docs/work-memory/sessions/2026-09-19-dark-overlay-hue-family.md" }
  ],
  "supersedes": []
}
-->
# 菜单共享皮肤、弹窗统一圆角与边框，并让 cn() 认识项目刻度

## 背景与范围

接续 [暗色浮层与遮罩改为终端色相](2026-09-19-dark-overlay-hue-family.md) 的审查清单，用户要求在 worktree `.claude/worktrees/worktree-01`（分支 `claude/overlay-surface-tint`，基于 `origin/dev` `0af67e47`）继续处理未完成项。本记录为同步记录；任务标识未取得。

## 结论与依据

根因：两个 `cn()`（`apps/terminal/src/lib/cn.ts`、`packages/ui/src/utils.ts`）用未配置的 `twMerge`。tailwind-merge 只认识 t-shirt 尺寸的主题键，不认识项目的数字圆角刻度（`rounded-12`）、命名阴影（`shadow-overlay`）和 `font-market-close`，所以 `cn("rounded-12", "rounded-[10px]")` 两个类都保留，谁生效由样式表顺序决定。实测旧页面上 More 菜单的类列表同时含 `rounded-12 rounded-[10px]`。这就是各处用 `!rounded-[12px]`、`!shadow-*` 的原因。

采用的方案：

- `cn()` 用 `extendTailwindMerge` 列出圆角刻度、命名阴影，终端侧再加 `font-market-close`。`class-merge-theme-scales.test.ts` 从两份主题 CSS 读出键名与配置比对，新增主题键而不登记会失败。
- 新增 `menu-popup-skin.ts`：`menuPopupSurfaceClass`、`menuPopupSkinClass`（动作菜单，条目保持 `text-fg` 与 `text-error`）、`menuPopupSelectionSkinClass`（单选菜单，未选项弱化、选中项卡片底加粗）。头部 More、账户、语言菜单、显示菜单（Popover）和订单面板下拉都改用它；`--language-settings-*` 三个一次性令牌删除。订单类型菜单原先在 IBM Plex Sans 触发器下用 Inter 打开，现随触发区域用 Plex。
- 两级菜单：导航与表单菜单用共享皮肤；表格内筛选与订单簿控件保留 `@gatu/ui` Dropdown 默认样式（价格分组菜单 58px 宽、24px 条目，套 34px 条目会失衡）。
- `ModalPopup` 默认 `rounded-32`（16px）加 `border border-stroke-weak`，底部 `Drawer` 默认 `rounded-t-32`。暗色下 `bg-modal` 与页面同色，边框是弹窗的边界；8 处不分端的 `!border-0` 收窄为 `max-[1000px]:!border-0`，4 个弹窗删除更小的命名圆角覆盖。
- `global-settings-modal.tsx` 的嵌套三元改为 `msg` 描述符映射，消息文本未变。
- 重新判定：桌面市场选择器用 `bg-overlay` 是对的。表面选择取决于有无遮罩而非尺寸，无遮罩时 `bg-modal` 与页面同色会消失；已写入 `design-tokens.md`。

未采用：

- 全仓把 `text-[Npx]`、`rounded-[Npx]` 批量换成命名刻度。命名字号同时设置行高，249 处里只有 134 处（同一类串里有显式 `leading-*`）可证明等价；批量改动约 130 个文件，会与在途分支（Across 分支改了 84 个终端文件）全面冲突，而界面零变化。改用棘轮测试阻止新增、随改随清。
- 把弹窗统一到设计稿的 18px、20px 抽屉圆角：这两个值不在命名刻度上，需要设计决定；相关类仍由市价平仓的测试钉住。
- `market-close-*` 改名为 `trading-panel-*`：两族中性令牌取值相同，但涉及 60 多个文件和多处测试钉子，纯命名收益；已在 `design-tokens.md` 注明新代码用 `trading-panel-*`。

## 验证与限制

2026-09-19，worktree-01 独立依赖，开发服务器 3026。

- 每步提交前：Biome、`pnpm typecheck`（hl-react、ui、terminal）通过；`pnpm --filter @gatu/terminal test` 全量在菜单皮肤后与弹窗改动后各跑一次，均为 576 文件 6377 通过、1 跳过。`cn()` 改动后的首次全量有 2 个超时失败（`positions-panel-preload` 30 s 导入钩子、`establish-connection-modal` 5 s 用例），当时同机有两个开发服务器和两个实时标签页；两文件单独重跑 21/21 通过，之后两次全量未复现。
- `cn()` 改动的渲染中性验证：对 `origin/main` 服务器（3025，旧 `cn`）与 3026 在暗色 1440×900 下逐个打开 11 个表面（页面、语言、More、价格分组、市场选择器、资产信息、保证金、杠杆、账户模式、高级订单、设置），比较全部元素的计算圆角；去掉兄弟序号后 10 个表面哈希一致，市场选择器只多 3 个随行情加载的行内标签，其余一致。
- 菜单皮肤实测：语言、More、订单类型菜单均为 12px 圆角、4px 内边距、34px 条目、8px 条目圆角、13/18 Plex、0 个 `!`；375px 下语言、订单类型、价格精度菜单条目 44px 且不出视口。
- 弹窗实测（桌面暗色）：资产信息、保证金、杠杆、账户模式、设置均为 16px 圆角、1px `rgba(255,255,255,.12)` 边、`rgb(15,26,31)` 底。
- 未覆盖：需要钱包会话才能打开的弹窗与菜单（账户菜单、充值、下单确认、平仓等）只有单测与类串核对，未在浏览器实测；浅色主题只核对令牌未截图；移动端底部抽屉的 16px 默认圆角未实测；Playwright 套件未运行；`memory:*` 之外没有跑网站测试（网站不使用 `@gatu/ui`）。

## 后续与替代关系

- 需要设计决定：抽屉 18px / 20px 与桌面 `min-[1001px]:!rounded-[16px]` 是否并入命名刻度；无命名等价的 3、5、7、9、14px 圆角；是否让阻塞弹窗比页面更亮（现由 AGENTS.md 钉住同色）。
- 随改随清：棘轮基线 241 / 228 / 18，清理时同步下调。
- `market-close-*` → `trading-panel-*` 改名与 `font-market-close` 更名待排期。
- 下次先查 `.claude/rules/style-ui-guide.md` 的 Menu popups、Dialog chrome 两节和三个测试：`class-merge-theme-scales`、`design-token-ratchet`、`modal-surface-contract`。
