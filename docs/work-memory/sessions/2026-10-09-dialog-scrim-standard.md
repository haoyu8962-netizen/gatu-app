<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-09-dialog-scrim-standard",
  "date": "2026-10-09",
  "title": "弹窗遮罩与手机抽屉边缘按官方终端统一：原语持有遮罩、模糊与边框",
  "kind": "task",
  "status": "recorded",
  "topics": ["docs-governance", "account-funding"],
  "summary": "用户在深色主题手机布局下发现存款抽屉与页面融为一体，而建立连接抽屉有层次。对照 app.hyperliquid.xyz 移动端实测：弹层底色与页面同为 #0f1a1f，手机全屏抽屉无边框、顶部 16px 圆角，靠 rgba(15,18,29,0.75) 的海军蓝遮罩分层（无模糊），桌面弹窗用 rgba(15,18,29,0.6) 加 2px 模糊并保留 1px 边框。本项目原来每个弹窗各自覆盖遮罩与模糊（/60、无模糊、2px 模糊、trading-panel-scrim 混用），遮罩又是同色相近黑，所以层次不一。按用户决定执行：新增 --fill-overlay-sheet / bg-scrim-sheet，终端深色遮罩改为官方的两个值（浅色只改透明度），Modal 背景加 2px 模糊、Drawer 用 sheet 遮罩且底部抽屉无边框，删除 13 个弹窗的 overlayClassName 遮罩/模糊覆盖与 7 处 max-[1000px]:!border-0，modal-surface-contract 钉住 token 与「弹窗不得自行覆盖遮罩、模糊、opacity、!border-0」（市场选择弹层登记为唯一无遮罩例外）。design-tokens 里「拒绝海军蓝遮罩」的旧决定被取代。夹具计算样式核对通过。",
  "thread": null,
  "baseCommit": "805ee5a1",
  "commits": [],
  "sources": [
    { "path": "packages/ui/src/drawer.tsx" },
    { "path": "packages/ui/src/modal.tsx" },
    { "path": "apps/terminal/src/styles.css" },
    { "path": "apps/terminal/src/lib/tests/modal-surface-contract.test.ts" },
    { "path": ".claude/rules/style-ui-guide.md" },
    { "path": ".claude/rules/design-tokens.md" }
  ],
  "supersedes": ["2026-10-09-funds-sheet-edge"]
}
-->
# 弹窗遮罩与手机抽屉边缘按官方终端统一：原语持有遮罩、模糊与边框

## 背景与范围

用户在本工作树开发服务器的手机布局（深色）看到存款抽屉与页面同色、没有弹窗感，而「建立连接」抽屉有明显层次，要求对照 app.hyperliquid.xyz 移动端的做法并规范本项目。同步记录，无任务标识。基线 `dev` 805ee5a1，分支 `claude/funds-sheet-edge`（先有一个只改资金外壳的提交 bb1b9652，本记录把它纳入统一规则）。

## 结论与依据

- 官方实测（2026-10-09，内置浏览器 375px 深色，脚本读计算样式；桌面值取自打包代码 `config-DgrJgRxr.js` 的 modal styled-component）：页面 `rgb(15, 26, 30)`；Connect 全屏抽屉 `rgb(15, 26, 31)`、无边框、圆角 `16px 16px 0 0`、遮罩 `rgba(15, 18, 29, 0.75)` 无模糊（z 81）；桌面弹窗同一 `gray_50` 底色、`1px solid border50`、16px 圆角、遮罩 `rgba(15, 18, 29, 0.6)` + `blur(2px)`；设置弹出层 `#1b2429` 加 `#273035` 边框、10px 圆角、无遮罩。官方的分层来自海军蓝遮罩对青绿色页面的色相偏移，不来自弹层换色或边框。
- 本项目改前：页面与 `bg-modal` 同为 `#0f1a1f`（与官方相同）；遮罩 `#03090ca8`（同色相、66%）；13 个弹窗各自 `overlayClassName` 覆盖（`!bg-scrim/60 !backdrop-blur-none`、`backdrop-blur-[2px]`、`bg-trading-panel-scrim` 等），7 个弹窗用 `max-[1000px]:!border-0` 去掉手机边框；资金类抽屉在 375px 实测遮罩透明度 0.395、无边框、无阴影。
- 采用：`--fill-overlay`（桌面弹窗）终端深色 `#0f121d99`、浅色 `#000d4d99`；新增 `--fill-overlay-sheet`（手机抽屉）深色 `#0f121dbf`、浅色 `#000d4dbf`，`@theme inline` 增 `--color-scrim-sheet`；共享包 `packages/ui/src/globals.css` 同步加 sheet token。`Modal` 背景 `bg-scrim backdrop-blur-[2px]`；`DrawerOverlay` 用 `bg-scrim-sheet`，底部抽屉 `border-0`。删除上述所有覆盖（`market-asset-info`、`leverage`、`margin-mode`、`account-mode`、`legal-acceptance`、`hip3-deployer-disclaimer`、`establish-connection`、`funds-modal-shell`、`order-confirmation`、`position-risk`、`position-pnl-share`、`cancel-all-orders`、`position-close-dialog-shell`、`position-reverse-confirmation`）。`token-selector-popup` 的透明遮罩是设计上的无遮罩弹出层，登记为例外；`mobile-order-modification-modal` 的过渡覆盖与遮罩无关，未动。`--trading-panel-scrim` 仍是 `--fill-overlay` 的别名，保留给非弹窗用途。
- 规则与契约：`.claude/rules/style-ui-guide.md`「Dialog chrome」改写为原语持有遮罩、模糊与手机边框；`.claude/rules/design-tokens.md` 的「终端色相家族」一节把遮罩改为官方值并说明旧决定被取代（`bg-overlay` 的同色相理由保留）；`AGENTS.md` 终端视觉契约新增一条；`modal-surface-contract` 钉住 token、原语类与「组件不得通过 overlayClassName 覆盖 scrim/backdrop-blur/opacity、不得出现 !border-0」。
- 未采纳：弹层换成抬高色（官方也不这样做，且违反 `bg-modal` 契约）；只改资金弹层（层次不一的根源是各弹窗各自覆盖）。

## 验证与限制

- 通过：`pnpm --filter @sairn/terminal typecheck`、`pnpm typecheck`、Biome（22 个改动的 TS/TSX 文件）；弹窗相关 18 个测试文件 453 项（`modal-surface-contract`、`design-token-ratchet`、`funds-modal-scroll-contract`、`dialog-notice-radius-contract`、`dialog-dismiss-control-contract`、`class-merge-theme-scales`、`deposit-modal-withdrawal-routing-guard`、`account-mode`/`legal-acceptance`/`leverage`/`margin-mode`/`establish-connection`/`order-confirmation`/`cancel-all-orders`/`position-reverse-confirmation`/`position-market-close`/`position-limit-close`/`mobile-order-modification` 弹窗测试）。四个组件测试原本断言 `bg-trading-panel-scrim`，改为断言原语的 `bg-scrim` 且没有覆盖类。
- 契约测试的变异核对：杠杆弹窗加 `overlayClassName="backdrop-blur-[2px]"`、抽屉改回 `bg-scrim`、资金外壳加 `max-[1000px]:!border-0`，三处都只让「lets the primitives own the scrim, the blur and the phone sheet edge」失败；还原后通过。
- 夹具计算样式（`account-actions.html?surface=funds`，内置浏览器面板，存款表单）：375px 深色抽屉边框 0px、圆角 20px（资金交接值）、遮罩 `rgba(15, 18, 29, 0.75)`、无模糊；375px 浅色遮罩 `rgba(0, 13, 77, 0.75)`；1363px 深色弹窗边框 `1px rgba(255,255,255,0.12)`、圆角 16px、遮罩 `rgba(15, 18, 29, 0.6)` + `blur(2px)`；浅色遮罩 `rgba(0, 13, 77, 0.6)`。与官方的 0.75 / 0.6 + 2px 一致。
- 限制：夹具与官方站的数值都是脚本读取，不是真机观感；浅色主题只改了透明度，没有视觉验收；只在资金夹具里读了计算样式，其余 13 个去掉覆盖的弹窗靠契约测试与各自的单测覆盖，没有逐个在浏览器里打开；全量单测未跑。Playwright 在沙箱内启动不了 Chromium（mach port 权限），用内置浏览器面板代替。

## 后续与替代关系

- 本记录取代 [2026-10-09-funds-sheet-edge](2026-10-09-funds-sheet-edge.md)。
- 官方桌面弹窗边框色 `border50` 未实测（取自设置弹出层的 `#273035`），本项目继续用 `border-stroke-weak`。
