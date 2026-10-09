<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-09-funds-sheet-edge",
  "date": "2026-10-09",
  "title": "深色主题手机端存款抽屉与页面融为一体：恢复边框与完整遮罩",
  "kind": "task",
  "status": "superseded",
  "topics": ["account-funding"],
  "summary": "用户在深色主题、窄视口下看到存款弹层与页面同色、看不出是弹窗。原因：资金弹层外壳在手机抽屉上去掉边框（max-[1000px]:!border-0）与阴影，遮罩又压到 bg-scrim/60（实际透明度 0.395），而终端深色主题的 bg-modal 本来就等于页面色，于是只剩 16px 暗条、20px 圆角和把手作为分界；桌面弹窗有 1px 边框与阴影，没有这个问题。按用户对照「建立连接」抽屉的要求，资金外壳改用同样的完整遮罩加 2px 模糊，手机抽屉保留 UI 原语的 1px border-stroke-weak 边框；订单确认弹窗仍用改版交接的 bg-scrim/60，未动。夹具计算样式核对通过；HIP-3 免责声明测试在本机单跑超时且与本改动无关。",
  "thread": null,
  "baseCommit": "805ee5a1",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/src/components/trade/components/funds-modal-shell.tsx" },
    { "path": "apps/terminal/tests/browser/funds-forms.fixture.tsx" },
    { "path": ".claude/rules/style-ui-guide.md" }
  ],
  "supersedes": []
}
-->
# 深色主题手机端存款抽屉与页面融为一体：恢复边框与完整遮罩

## 背景与范围

用户在本工作树的开发服务器（`dev` 805ee5a1）上用内置浏览器面板（约 449px 宽，走手机布局）打开存款弹层，截图显示弹层与页面同色、没有弹窗感；随后用「建立连接」抽屉的截图对照，要求存款弹层有同样的视觉层次。同步记录，无任务标识。

## 结论与依据

- 复现（资金表单夹具 `account-actions.html?surface=funds`，375px 深色，脚本读取计算样式）：改前抽屉底色 `rgb(15, 26, 31)` 与页面相同，边框 0px，阴影无，遮罩 `oklab(… / 0.395)`（`!bg-scrim/60` 叠在本身 66% 透明度的 `--fill-overlay` 上），被遮住的页面只压到约 `#0a1318`；桌面形态为 1px 12% 白边框、16px 圆角、`shadow-overlay`。
- 规则对照：`.claude/rules/style-ui-guide.md`「Dialog chrome」允许用 `max-[1000px]:!border-0` 压平手机抽屉、桌面保留边框，代码本身合规；`bg-modal` 等于页面色是终端深色主题的既定契约（`.claude/rules/design-tokens.md`）。`!bg-scrim/60` 出自 `docs/trading-toolbar-redesign.md` 的交接值，订单确认弹窗同用。问题是「压平 + 60% 遮罩」在深色主题下没有可见边缘，属设计缺口而非行为违规。
- 采用：`funds-modal-shell.tsx` 的遮罩改为与建立连接弹窗相同的 `backdrop-blur-[2px] duration-100`（完整 `bg-scrim`，0.66 透明度加 2px 模糊），去掉 `max-[1000px]:!border-0`，手机抽屉保留原语的 1px `border-stroke-weak`；桌面不变。改后夹具计算样式：边框 `1px rgba(255,255,255,0.12)`，遮罩 `rgba(3, 9, 12, 0.66)`，`backdrop-filter: blur(2px)`。
- 未动：订单确认弹窗与手机改单弹窗的遮罩（改版交接值），`!shadow-none`（边框已足够分界），只恢复遮罩不恢复边框的方案（两色都很暗，WCAG 对比约 1.1:1，看不出差别）。

## 验证与限制

- `funds-modal-scroll-contract`、`modal-surface-contract`、`design-token-ratchet`、`dialog-notice-radius-contract`、`deposit-modal-withdrawal-routing-guard` 通过（295 项）；Biome 通过。
- `global-modals-hip3-disclaimer.test.tsx` 的「renders the disclaimer instead of other global modals」在本机单跑三次都 15 秒超时，把 `funds-modal-shell.tsx` 还原到 805ee5a1 后同样超时，所以与本改动无关（手册列为高负载下的偶发项；本机同时运行着 3005 开发服务器）。CI 将再次运行它。
- 夹具截图与计算样式是脚本读取，不是真机观感；用户在开发服务器上的页面经 HMR 已更新，可直接对照。

## 后续与替代关系

- 同日被 [弹窗遮罩规范](2026-10-09-dialog-scrim-standard.md) 整体取代：遮罩与手机抽屉边框改由 UI 原语按官方值统一处理，本记录的资金外壳局部覆盖已随之删除。
