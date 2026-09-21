<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-mobile-header-alignment",
  "date": "2026-09-18",
  "title": "移动端顶部导航对齐官方：主题移出头部、品牌填充 Connect、图标统一",
  "kind": "task",
  "status": "recorded",
  "summary": "390 px 实测：头部五个 44 px 控件只给 CTA 留 112 px，「Connect Wallet」被截成「Connect …」；语言按钮圆角 10 与其余 4 不一致；连接按钮描边加投影而官方用品牌填充。用户决定全部实施：主题切换移出移动端头部（抽屉已有）、移动端 CTA 改短标签「Connect」并品牌填充、桌面端连接按钮同步品牌填充、三个图标按钮统一令牌与圆角、清理 redesign.md 过期条目；Logo 链接指向所选「全部」市场为既有设计，保留。",
  "topics": [
    "docs-governance"
  ],
  "thread": null,
  "baseCommit": "22a1d566",
  "commits": ["67d4212e"],
  "sources": [
    { "path": "apps/terminal/src/components/trade/mobile/mobile-header.tsx" },
    { "path": "apps/terminal/src/components/trade/mobile/mobile-header-view.tsx" },
    { "path": "apps/terminal/src/components/trade/header/user-menu.tsx" },
    { "path": "docs/redesign.md" }
  ],
  "supersedes": []
}
-->
# 移动端顶部导航对齐官方：主题移出头部、品牌填充 Connect、图标统一

## 背景与范围

用户要求 review 移动端顶部导航。无头 390 px 实测（未登录）：

| 项目 | 我们（改前） | 官方 |
|---|---|---|
| 高度 | 56 px + 1 px 底线 | 53 px |
| 左侧 | 汉堡 44、Logo 44 | 汉堡、Logo |
| 连接按钮 | 「Connect Wallet」描边 112 × 44，390 px 下截成「Connect …」 | 「Connect」品牌填充 82 × 33，圆角 8 |
| 右侧图标 | 主题、语言、设置各 44 × 44；语言圆角 10、其余 4 | 语言、设置两个 33 × 33 |

用户决定：主题切换移出移动端头部（导航抽屉已有 `ThemeToggle`）、移动端 CTA 改短标签「Connect」并品牌填充、桌面端 Connect Wallet 同步品牌填充、三个图标按钮统一令牌与圆角、清理 `docs/redesign.md` 里指向已不存在代码的移动端头部条目。Logo 链接 `useTradeHomePath` 指向「全部」范围下最近选择的市场（现货无名对显示为 `@序号`），属既有路由设计，保留。分支 `claude/surface-tokens-touch-feedback`，基线 22a1d566。

## 结论与依据

- `mobile-header.tsx` / `mobile-header-view.tsx`：删除 `theme` 槽位与 `ThemeToggle`（导航抽屉第 254 行仍提供主题切换）；语言与设置共用 `headerIconButton`（`size-11 !rounded-8 text-trading-panel-*`），`!rounded-8` 是因为 `rounded-8` 是自定义刻度，`tailwind-merge` 不把它与 `NavMenuTriggerView` 的 `rounded-[10px]` 视为冲突。
- `mobile-wallet-cta-view.tsx`：改为 `buttonVariants({ variant: "filled", intent: "brand", size: "sm" })` 加 `APP_BAR_BUTTON_HEIGHT_CLASS`、`px-3.5`，去掉钱包图标；`user-menu.tsx` 移动端标签改为 `t\`Connect\``（桌面端仍为 Connect Wallet）。
- `wallet-cta-view.tsx`（桌面）：`market-close-control` 一族令牌换成 `bg-action text-on-action hover:bg-action-hover active:bg-action-active`。
- `docs/redesign.md` 删除指向已不存在的 `mobile-header.tsx:29/43/52` 的两行问题与两条清单项，优先级第一条去掉「mobile header」。
- 测试：`mobile-header-layout` 改为断言头部没有主题按钮；`user-menu` 五处默认变体标签改为 Connect；`mobile-view-controls` 的 SSR 钉住改为对比 `Button filled/brand/sm`；六个 mock 了 `@gatu/ui` 的测试补 `buttonVariants` 导出。

## 验证与限制

- 改后实测 390 px：汉堡 44、Logo 44、Connect 69 × 44 品牌填充（`--action`，深色主题下为浅色）、语言 44（圆角 4）、设置 44（圆角 4），无截断。
- 14 个测试文件 248 用例通过（头部布局、品牌、用户菜单、顶部导航、移动端视图控件、导航抽屉、三个历史页面、i18n 契约）；typecheck、Biome 通过。
- 未做真机验收；头部高度 56 与底线保留（官方 53、无底线），属风格差异未改。新文案 `Connect` 由提交钩子进入六语言目录，非英文翻译待补。

## 后续与替代关系

- 不替代任何记录。
