<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-18-header-chip-height",
  "date": "2026-09-18",
  "title": "头部账户芯片与 Connect 统一 36 px：可见高度与 44 px 热区分离",
  "kind": "task",
  "status": "recorded",
  "summary": "375 px 登录态实测账户芯片 149×44、描边加投影，56 px 头部里上下只剩 6 px；根因是 headerAccount 槽位用 [&_button]:h-11 把可见高度和触控热区绑在一起，桌面芯片 34、设计系统 32、移动端 44 三种高度并存。用户决定移动端与桌面端都统一到 36 px 可见高度，热区用伪元素保住 44 px，去掉移动端芯片投影，邮箱标签优先显示本地名。",
  "topics": [
    "docs-governance"
  ],
  "thread": null,
  "baseCommit": "67d4212e",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/mobile/mobile-header-view.tsx" },
    { "path": "apps/terminal/src/components/trade/header/user-menu.tsx" },
    { "path": "apps/terminal/src/components/trade/header/wallet-cta-view.tsx" }
  ],
  "supersedes": []
}
-->
# 头部账户芯片与 Connect 统一 36 px：可见高度与 44 px 热区分离

## 背景与范围

用户选中移动端头部的账户芯片（登录态邮箱下拉触发器）询问上下高度是否过高。内置浏览器 375×812 实测：头部 56 px；芯片 149 × 44，1 px 描边加 `shadow-raised`，上下留白 6 px；邮箱截成「haoyu8962@gm…」（可用 97 px，全文 137 px）；同排 Connect（未登录）与图标按钮亦为 44 px。官方 53 px 头部里控件约 33 px，上下留白约 10 px。

根因：芯片自身类为 `h-8 min-h-8 max-h-8`（32 px，`APP_BAR_BUTTON_HEIGHT_CLASS`），但 `mobile-header-view.tsx` 的 `headerAccount` 用 `[&_button]:h-11 [&_button]:min-h-11` 把槽位内所有按钮拉到 44 px 以满足触控热区，可见高度与热区绑定；桌面芯片与 CTA 为 34 px，形成 32 / 34 / 44 三种高度。

用户决定：移动端与桌面端的账户芯片、Connect CTA 及等待会话按钮统一 36 px 可见高度；移动端热区用 `after:h-11` 伪元素保住 44 px（与筛选芯片、标签行同一做法）；去掉移动端芯片投影；邮箱标签在移动端优先显示 @ 前本地名，完整邮箱保留在 `title`。头部高度 56 与底线不动。分支 `claude/surface-tokens-touch-feedback`，基线 67d4212e。

## 结论与依据

- `config/layout.ts` 新增 `HEADER_ACCOUNT_CONTROL_HEIGHT_CLASS = "h-9 min-h-9 max-h-9"` 与 `HEADER_TOUCH_HIT_AREA_CLASS`（`after:h-11` 伪元素）。`APP_BAR_BUTTON_HEIGHT_CLASS`（32 px）仍由页脚与顶部 Deposit 使用，未动。
- `user-menu.tsx`：账户下拉触发器与等待会话按钮改用 36 px 常量；移动端追加伪元素热区，去掉 `shadow-raised`；桌面端删除 `h-[34px]` 系列覆盖。邮箱在移动端显示 `@` 前本地名（`getEmailLocalPart`），完整邮箱写入 `title`；桌面端仍显示完整邮箱。
- `mobile-wallet-cta-view.tsx` 同样改为 36 px 加伪元素热区；`wallet-cta-view.tsx`（桌面）34 → 36。
- `mobile-header-view.tsx` 的 `headerAccount` 不再用 `[&_button]:h-11` 强制后代高度，按钮自带高度与热区。
- 桌面导航其余 34 px 控件（More、语言、设置、Deposit）未改，与 36 px 芯片在 `items-center` 下各差 1 px，肉眼不可辨；如需整排统一另议。
- 测试：`mobile-header-layout` 改为断言槽位不再强制 `h-11`；`user-menu` 初始化态用例改为期望本地名「owner」且 `title` 为完整邮箱；`mobile-view-controls` SSR 钉住改用两个新常量。

## 验证与限制

- 内置浏览器 375×812 登录态实测：芯片 117 × 36（改前 149 × 44），`::after` 高 44 px，文字「haoyu8962」不再截断；头部 56 px 上下各 10 px。1300 px 桌面：芯片 197 × 36，More 60 × 34。
- 6 个测试文件通过（用户菜单、头部布局、SSR 钉住、顶部导航、页脚）；typecheck、Biome 通过。未做真机验收。

## 后续与替代关系

- 补充 `2026-09-18-mobile-header-alignment.md`；不替代任何记录。
