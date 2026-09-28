<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-28-user-menu-recovery-link-mobile-assertion",
  "date": "2026-09-28",
  "title": "user-menu-recovery 套件的 Link mobile device 断言过时：按 ADR 0015 D8 改为断言菜单无此项并显式固定配对开关",
  "kind": "task",
  "status": "verified",
  "topics": ["vite-cache", "pairing-release"],
  "summary": "user-menu-recovery 套件 2/10 失败（两个宽度的迟到钱包恢复用例都在断言菜单里有启用的 Link mobile device）。原因是断言过时而非产品回归：e62e4733 按 ADR 0015 D8 删除了用户菜单条目，入口只剩头部二维码图标，单测当时已改为不含此项，浏览器用例（约 20 小时前由 6cd0bb1a 修过）未同步。改为断言菜单无此项，夹具 Vite 配置用 define 把 VITE_MOBILE_PAIRING_ENABLED 固定为 true 且用例先核对该前提，桌面宽度再按头部图标的路径打开 UserMenu 托管的唯一弹窗。修改后 10/10，两处变异都被捕获；首轮出现过一次无法复现的圆点颜色比较失败。Codex 只读对抗审查无 P0–P2，两项 P3（记录误称此前结果依赖 shell 环境、辅助函数少了预加载失败时的 catch）已修正。未改产品代码，套件仍不在 CI。",
  "thread": null,
  "baseCommit": "e3b5dd82",
  "commits": [],
  "sources": [
    { "path": "apps/terminal/tests/browser/user-menu-recovery.pw.ts" },
    { "path": "apps/terminal/tests/browser/user-menu-recovery.fixture.tsx" },
    { "path": "apps/terminal/tests/browser/user-menu-recovery.browser.tsx" },
    { "path": "apps/terminal/tests/browser/user-menu-recovery.vite.config.ts" },
    { "path": "apps/terminal/src/components/trade/header/user-menu.tsx" },
    { "path": "apps/terminal/src/components/trade/header/top-nav.tsx" },
    { "path": "apps/terminal/src/components/trade/header/mobile-agent-sync-modal-loader.ts" },
    { "path": "apps/terminal/src/config/mobile-pairing.ts" },
    { "path": "apps/terminal/src/lib/tests/user-menu.test.tsx" },
    { "path": "apps/terminal/src/lib/tests/top-nav.test.tsx" },
    { "path": "docs/adr/0015-link-device-alignment.md" },
    { "path": "docs/runtime-guardrails.md" },
    { "path": "AGENTS.md" }
  ],
  "supersedes": []
}
-->
# user-menu-recovery 套件的 Link mobile device 断言过时：按 ADR 0015 D8 改为断言菜单无此项并显式固定配对开关

## 背景与范围

用户报告 `user-menu-recovery.playwright.config.ts` 10 项里 2 项失败：`user-menu-recovery.pw.ts:104`「recovers late wallets in place, preserves drafts, and updates open-menu translations」在 390px 与 1333px 都停在第 136 行，`getByRole("menuitem", { name: "Link mobile device" })` 找不到元素。用户称已在 `dbc6036e`（main `e3b5dd82` 加纯文档提交）上复现，属于既有问题；该套件不在 CI 里。本会话以 `e3b5dd82` 为基线（worktree 分支 `claude/nifty-hofstadter-afde70`，开始时工作区干净），先在基线上复现了同样的 2 项失败（8 通过，38.3 秒），`dbc6036e` 上的复现来自用户报告，本会话未重跑。同步记录，没有可核对的会话标识。

## 结论与依据

判断为用例过时，不是产品回归，依据按时间排列：

1. `6cd0bb1a`（2026-09-24 00:16 +0800）修夹具时，用户菜单在 `hasWalletAccess` 时仍列出「Link mobile device」，所以用例断言它可用。
2. `e62e4733`（同日 20:17 +0800 作者时间，提交时间 20:19，「simplify link mobile device pairing」）按 ADR 0015 D8 删除了该菜单条目（「入口只保留头部图标…删除工具菜单与用户菜单条目和撤销面板」），同一提交把 `src/lib/tests/user-menu.test.tsx` 的三处断言改成菜单「不含」此项；浏览器用例没有同步。`0a067ab7`（20:59）把弹窗懒组件移到 `header/mobile-agent-sync-modal-loader.ts`，头部图标在点击前预加载。
3. 当前契约：AGENTS.md「Mobile connection and PWA contract」写明桌面入口只有头部二维码图标，只对精确所有者会话且配对开关开启时渲染，打开由用户菜单托管的唯一弹窗；`docs/runtime-guardrails.md` §8 写明 `UserMenu` 保留懒加载宿主、错误边界与重试，「no longer lists a menu item」。

因此按契约修测试，不改产品代码：

- 第 136 行改为断言菜单里没有「Link mobile device」（`toHaveCount(0)`），并删掉对应的中文「关联移动设备」可用断言；切换语言后的菜单翻译仍由「复制地址」「断开连接」覆盖。
- 配对开关前提显式化。`UserMenu` 本身不读开关（开关只在 `TopNav`、钱包弹窗与配对弹窗里读，后两者在夹具里都被别名成桩），所以开关此前对这个夹具的结果没有任何影响（被删掉的菜单项当时也只看 `hasWalletAccess`，不看开关）。固定开关是为了建立一个明确的「配对开启」回归场景，并让这个前提不受 shell 环境左右：夹具 Vite 配置用 `define` 把 `import.meta.env.VITE_MOBILE_PAIRING_ENABLED` 固定为 `"true"`（Vite 7.3 开发模式会把 `import.meta.env.*` 的用户 define 并入整个 `import.meta.env` 对象，`resolveMobilePairingFeatureFlags(import.meta.env)` 因此读得到），夹具在 `window.__gatuUserMenuRecovery.pairingEnabled` 暴露 `MOBILE_PAIRING_FEATURES.enabled`，用例先断言它为 true，再断言菜单无此项。选择开启而不是关闭，是因为开启时断言更强：即使在打开配对的构建里，账户菜单也不提供入口。
- 保留原断言的意图（恢复后的钱包会话仍能到达 Link mobile device）。夹具新增 `openLinkMobileDevice()`，按头部图标 `handleOpenMobileSync` 的路径先 `preloadMobileAgentSyncModal().catch(() => undefined)` 再打开模态 store（预加载失败也照样打开，交给宿主的错误边界与重试）；用例只在桌面宽度（入口只在桌面头部）打开，断言恢复后的 `UserMenu` 恰好渲染一个弹窗、关闭后消失、账户按钮 DOM 与草稿值不变。图标自身的可见性规则（`hasWalletAccess && enabled`）仍由 `top-nav.test.tsx` 覆盖，因为夹具不渲染 `TopNav`。
- `docs/runtime-guardrails.md` §9 的夹具段落补充了上述开关固定与弹窗打开方式。

未采用：把菜单条目加回产品（与 ADR 0015 D8 和 AGENTS.md 冲突）；在夹具里渲染真实 `TopNav`（需要路由、存款可用性等大量提供者，超出这个夹具的职责）；只删掉失败行（会丢掉恢复后能到达配对弹窗这层覆盖，也不交代开关前提）。

## 验证与限制

均在 `e3b5dd82` 加本次工作区改动上运行，2026-09-28，本机 Chrome 通道、Node v24.15.0。

- 修改前（基线）：套件 8 通过、2 失败，失败点即第 136 行，与报告一致。
- 修改后第一次运行（刚清空 `.vite-user-menu-recovery` 缓存）：9 通过，1 失败，失败的是 390px 的同一用例第 142 行 `expect(connectedDot).not.toBe(neutralDot)`（连接后账户圆点颜色与未连接时相同）。紧接着单跑该用例通过；随后冷缓存全量 4 次 40/40、`--grep "recovers late" --repeat-each 6` 12/12、`--grep 390px --repeat-each 12` 60/60，都没有再现。这条断言不是本次新增，390px 也不走本次新增的桌面弹窗分支；首次失败的期望值与实际值没有保存下来（下一次运行覆盖了 `test-results/`），原因未查明，只记为一次无法复现的偶发失败。
- 最终：`pnpm --dir apps/terminal test:browser:user-menu-recovery` 清空缓存后 1 次、保留缓存 2 次，均 10/10 通过（约 46 秒）。
- 变异检查（改完即 `git checkout` 还原，还原后 `apps/terminal/src` 无差异）：在 `user-menu.tsx` 重新加回 `hasWalletAccess` 时的「Link mobile device」菜单项，两个宽度都在新断言处失败（期望 0，实际 1）；让 `UserMenu` 不再渲染配对弹窗宿主，1333px 在「恰好一个弹窗」处失败（期望 1，实际 0）。
- `pnpm --filter @gatu/terminal typecheck` 0 错误（tsconfig 覆盖 `tests/browser`）。Biome 的 `files.includes` 不含 `tests/browser`，直接传路径会被忽略；改用 `biome check --write --stdin-file-path=apps/terminal/src/__biome_probe__/<文件名>` 逐个检查四个夹具文件，输出与原文件逐字相同（stdin 模式对干净的对照文件 `src/config/mobile-pairing.ts` 同样打印通用提示 “The contents aren't fixed”，不是诊断）。
- Vitest：`tests/browser/user-menu-recovery-cache.test.ts`、`src/lib/tests/user-menu.test.tsx`、`src/lib/tests/top-nav.test.tsx`、`src/lib/tests/mobile-pairing-feature-gate.test.ts` 4 文件 56 项通过。
- 执行前确认 shell 里没有设置 `VITE_MOBILE_PAIRING_ENABLED`，`tests/browser/` 下也没有 `.env*` 文件，所以 `pairingEnabled === true` 只能来自夹具的 define。
- 未执行：CI（该套件不在 `.github/workflows` 里）、真实 Privy 登录与真机。这些断言依据当前代码与契约文档，不等于设计验收。

### Codex 只读对抗审查（同日，对 `f8ee170f`）

- 调用：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"medium"'`，11 条命令、约 8.0 万 token，未改文件、未起服务、未跑测试；它能核对的只有代码、Git 历史与 `node_modules` 里的 Vite 源码，本记录的运行结果对它而言仍是作者报告。
- 结论：无 P0–P2。确认了过时判断（`e62e4733` 改了单测三处断言）、`define` 在 Vite 7.3 里会覆盖到整个 `import.meta.env`、别名确实把加载器的导入指到桩、缓存与扫描隔离不受影响、Window 类型声明与用法一致。
- 两项 P3，核对后都成立，已在后续提交修正：一是本记录原先说「夹具此前的结果取决于 shell 环境」，实际上开关此前对夹具没有影响；二是夹具的 `openLinkMobileDevice` 少了 TopNav 的 `.catch(() => undefined)`，只模拟了预加载成功的路径。Vite 配置注释与 `runtime-guardrails.md` §9 的同类措辞一并改正。修正后在清空缓存与保留缓存下各跑一次套件，均 10/10；类型检查 0 错误；两个改动的夹具文件经 Biome stdin `check --write` 输出不变。
- 它的变异推演里这个夹具抓不到的：TopNav 图标的点击处理被删（由 `top-nav.test.tsx` 覆盖）、真实弹窗与 store 内部（夹具里都是桩）、只在中文出现的菜单项（无此项断言只在英文下跑）、去掉预加载但懒加载宿主仍能渲染（数量断言会等到最终渲染）。这些是覆盖边界，不算缺陷。
- 第 142 行偶发失败：它只给出推断（样式表被替换的瞬间两次取色都可能是透明），同时指出圆点没有过渡、类名是静态字面量、`@source "../../src"` 首次扫描就包含两个类，所以这个解释并不有力；没有原始取值与 trace，原因仍未查明。

## 后续与替代关系

- 接续 [user-menu-recovery 浏览器夹具修复](2026-09-24-user-menu-recovery-fixture-repair.md)；那次记录的 10/10 通过属于 `6cd0bb1a` 版本，`e62e4733` 之后不再成立，本记录给出修复后的版本与结果。
- 与 [关联移动设备按 ADR 0015 D8 收敛](2026-09-24-link-mobile-device-simplification.md) 相关：那次删除菜单条目时同步了单测，漏了这个不在 CI 里的浏览器套件。改动入口或菜单结构时，除 `user-menu.test.tsx`、`top-nav.test.tsx` 外也要跑 `pnpm --dir apps/terminal test:browser:user-menu-recovery`。
- 偶发失败：若再出现第 142 行的圆点颜色相等，先保留 `test-results/` 里的 trace 与错误上下文，再判断是样式注入时序还是测量对象问题；不要在原因不明时把它改成轮询断言掩盖掉。
- 是否把该套件加入 CI 仍由维护者决定。
- 合并去向（同日）：Codex 审查通过后，按用户决定以合并提交 `f3ce177f` 并入 [PR #55](https://github.com/zora4523-bot/gatu-app/pull/55) 的分支 `fix/docs-pages-and-translations`（base `dev`）。合并前 #55 的 CI 已全绿，推送后整套 CI 会重跑一次；合并时 `INDEX.md` 冲突用 `pnpm memory:index` 重建，合并后的代码树在该工作树里重跑：套件清空缓存 10/10、类型检查 0 错误、相关单测 4 文件 57 项通过。
