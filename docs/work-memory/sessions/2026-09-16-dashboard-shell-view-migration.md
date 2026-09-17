<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-16-dashboard-shell-view-migration",
  "date": "2026-09-16",
  "title": "Dashboard 壳：单一来源 frame 迁移",
  "kind": "task",
  "status": "recorded",
  "topics": [
    "static-hosting"
  ],
  "summary": "表面 7 统一 dashboard 页面与占位 frame、路由 preset 和 chrome；341 项自动回归及类型、格式检查通过，盒子实测留给 reviewer。",
  "thread": null,
  "baseCommit": "cde152e54ae32ed6dd63e9d7a3cc08d787bd73e1",
  "commits": [],
  "sources": [
    {
      "path": "docs/adr/0009-startup-placeholder-single-source.md"
    }
  ],
  "supersedes": []
}
-->
# Dashboard 壳：单一来源 frame 迁移

## 背景与范围

同步任务记录；未取得会话标识。基线仅有未跟踪 `.build/`，按用户要求不触碰、不安装依赖、不暂存或提交、不切换分支。

## 结论与依据

共享 props-only DashboardFrameView，保留页面原始 canvas/main 类、桌面固定 header/footer 留位、移动 sticky header 和 fixture 隐藏 chrome 行为。页面继续持有 hooks、守卫和模态框。路由 preset 由 root 已提交的 pathname 选择；首次水合继续复现 terminal 静态壳。

内容不复制各页的数据 UI：纯占位内容视图使用统一中性块配置，框架和 chrome 共用真实视图。拒绝复制页面内容 JSX 或在壳引入运行时页面。结构/class parity、导入边界、路由及页面回归、类型和格式检查验证代码；浏览器像素验证由 reviewer 完成。

`canvasClassName` 保留整个原始 canvas class 字符串（包括字体、前景与原顺序），避免 Portfolio 的不同 class 顺序被重写。`isMobile` 为 boolean 时完全复现页面原始留位类；未传入时供壳/fixture 使用 CSS 响应式等价类。`headerOffset=false` 保留 fixture 无顶栏留位，`testnet` 与 `bannerOffset` 分离，保留 API Wallet fixture 的 testnet 背景。

未知路由使用 `/funding-history` preset：三个历史页面的 canvas/main 完全相同，是出现最多的完整配置。壳 footer 与真实 footer 一样 fixed，仅桌面显示；没有 in-flow footer 分支。壳不读取网络状态，不绘制 TestnetBanner，遵循已有 terminal 壳边界。

## 配置来源（基线源码行）

以下行号均属于基线 `cde152e54ae32ed6dd63e9d7a3cc08d787bd73e1`，依次为 canvas / main。Vaults、Staking、Leaderboard 的 main 首次出现在 fixture 中，live 使用相同字符串。

| Route | Canvas className | Main className | Source |
| --- | --- | --- | --- |
| /portfolio | `min-h-dvh bg-portfolio-canvas text-fg font-sans` | `mx-auto w-full max-w-[1440px] px-4 py-6 min-[1001px]:px-8 min-[1200px]:px-16 min-[1001px]:py-8` | `apps/terminal/src/components/portfolio/portfolio-page.tsx:121, :136` |
| /vaults | `min-h-dvh bg-dashboard-canvas font-sans text-fg` | `mx-auto w-full max-w-[var(--earn-frame-wide-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6` | `apps/terminal/src/components/vaults/vaults-page.tsx:166, :152` |
| /staking | `min-h-dvh bg-dashboard-canvas font-sans text-fg` | `mx-auto w-full max-w-[var(--staking-frame-max)] px-4 py-4 min-[1001px]:px-8 min-[1001px]:py-6 min-[1200px]:px-16` | `apps/terminal/src/components/staking/staking-page.tsx:48, :29` |
| /referrals | `min-h-dvh bg-dashboard-canvas font-sans text-fg` | `mx-auto w-full max-w-[1440px] py-5 min-[1001px]:px-10 min-[1001px]:py-6` | `apps/terminal/src/components/referrals/referrals-page.tsx:27, :42` |
| /leaderboard | `min-h-dvh bg-dashboard-canvas font-sans text-fg` | `mx-auto w-full max-w-[var(--earn-frame-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6` | `apps/terminal/src/components/leaderboard/leaderboard-page.tsx:39, :22` |
| /funding-history | `min-h-dvh bg-grid-container font-sans text-fg` | `mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6` | `apps/terminal/src/components/funding-history/funding-history-page.tsx:434, :448` |
| /historical-orders | `min-h-dvh bg-grid-container font-sans text-fg` | `mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6` | `apps/terminal/src/components/historical-orders/historical-orders-page.tsx:542, :556` |
| /api-wallet | `min-h-dvh bg-dashboard-canvas font-sans text-fg` | `mx-auto w-full max-w-[var(--api-wallet-frame-max)] py-4 min-[1001px]:px-10 min-[1001px]:py-6` | `apps/terminal/src/components/api-wallet/api-wallet-page.tsx:27, :41` |
| /trade-history | `min-h-dvh bg-grid-container font-sans text-fg` | `mx-auto w-full max-w-[1440px] px-4 py-5 min-[1001px]:px-10 min-[1001px]:py-6` | `apps/terminal/src/components/trade-history/trade-history-page.tsx:547, :561` |

实际路由与 preset 映射：`/vaults/$vaultAddress` 共用 `/vaults`；`/join/$code` 与 `/join/$` 共用 `/referrals`。实际历史路由 `/fundingHistory/$address`、`/historicalOrders/$address`、`/tradeHistory/$address` 对应表中的三个连字符 preset 名称，未新增或改名路由。尾斜杠会归一化；未匹配路径回退到通用历史 preset。

## 文件变更

新增：

- `apps/terminal/src/components/dashboard/dashboard-frame-view.tsx`
- `apps/terminal/src/components/dashboard/dashboard-content-placeholder-view.tsx`
- `apps/terminal/src/config/dashboard-frames.ts`
- `apps/terminal/src/lib/tests/dashboard-frame-view-parity.test.tsx`
- 本任务记录。

修改：

- 上表九个页面文件（Vaults 详情与列表共享同一个文件），以及 `components/dashboard/dashboard-shell-skeleton.tsx`、`routes/__root.tsx`。
- 下表八个现有测试文件。
- `.claude/rules/placeholder-parity.md`、`CHANGELOG.md`、`docs/README.md`、`docs/adr/0009-startup-placeholder-single-source.md`、生成的 `docs/work-memory/INDEX.md`。

## 测试断言变更清单

测试路径均为 `apps/terminal/src/lib/tests/`。

| 文件 | 新增或修改的断言（未列出的断言保持原义） |
| --- | --- |
| `dashboard-frame-view-parity.test.tsx`（新增，41 项） | 九个 preset 分别比较 sample page 与 shell 的 frame/main/双端 chrome 结构与几何类；只排除颜色、clock invisible 和移动头的显示开关，响应式 padding 归一化后与运行时类比较；顶栏激活项相同时桌面 header/footer markup 完全相等、移动去掉唯一显示类后完全相等；固定 CSS 可见性 wrapper；八条路由的 nav 与 More 激活态；主网/testnet × desktop/mobile 精确 canvas 类；headerless fixture、API Wallet testnet fixture；八个路由映射/未知回退；九个页面的共享视图、preset、真实 chrome、mobile/testnet props 及不再内联 main/offset；两个新视图纯度；所有配置字段与迁移前源码字符串完全相等。 |
| `dashboard-shell-skeleton.test.tsx` | 原来的“无交互元素、main 不被隐藏且单独 busy”改为“根 busy、单一输出不在装饰层、一个 main 在 aria-hidden/inert 中、两个响应式 header、真实按钮且所有控件均 inert、无动画”；safe-area 与左右内距在真实 MobileHeaderView 元素上验证；水合从默认配置扩为全部九个 preset，保持 fallback/main DOM 身份且无 recoverable error。 |
| `root-route-transition.test.tsx` | 新增 Portfolio/Vaults 在 runtime 未就绪时接收正确 preset/pathname；向文档页 pending 导航不提前改变 fallback preset；文档提交后可见。mock 记录 props 并允许 runtime readiness 控制，既有 provider lifetime 断言保留。 |
| `root-provider-split.test.ts` | 将无参数 DashboardShellSkeleton 的整行断言拆为 terminal 分支、AppShellSkeleton 和含 `getDashboardFrame(pathname)`/`pathname` 的 dashboard props 断言。 |
| `boot-placeholder-contract.test.ts` | 无动画源码范围加入两个新视图；无 timer 范围加入 dashboard 壳；dashboard 从手写 main/禁止 TopNav 改为共享 frame/content、TopNav/MobileHeader/FooterBar、inert wrapper；仍禁止手写 nav/button 及 terminal grid。 |
| `app-shell-import-boundary.test.ts` | 原单壳 allowlist 断言改为覆盖两个壳；相对路径与 alias 解析为相同规范路径，现有 desktop/mobile placeholder 数据模块等纯展示例外保持同一 allowlist，未开放 runtime imports。 |
| `earn-page-surface-contract.test.ts` | Staking/Leaderboard/Vaults 原始 fixture/live 内联 canvas 字符串断言改为两个 DashboardFrameView、两处正确 preset 及 preset 的精确 dashboard canvas；禁止 grid/portfolio canvas 和 leaderboard radius 断言保留。 |
| `portfolio-surface-contract.test.ts` | 页面包含 canvas token 的断言改为页面使用 portfolio preset 且 preset 包含原 canvas token；所有金融动作与 token 定义断言保留。 |
| `i18n-reactivity-contract.test.ts` | 两个新 dashboard view 加入纯展示 props 契约（Props 存在，无 Lingui/hooks/store/browser/clock/random）；原响应式翻译组件断言保留。 |

## 验证与限制

2026-09-16，基线加本任务未提交工作区，最终实际执行：

```bash
pnpm --filter @gatu/terminal exec vitest run --maxWorkers=2 src/lib/tests/dashboard-frame-view-parity.test.tsx src/lib/tests/dashboard-shell-skeleton.test.tsx src/lib/tests/root-route-transition.test.tsx src/lib/tests/root-provider-split.test.ts src/lib/tests/boot-placeholder-contract.test.ts src/lib/tests/app-shell-import-boundary.test.ts src/lib/tests/app-shell-frame.test.tsx src/lib/tests/top-nav-footer-view-parity.test.tsx src/lib/tests/i18n-reactivity-contract.test.ts src/lib/tests/i18n-hot-switch.test.tsx src/lib/tests/historical-orders-page.test.tsx src/lib/tests/rtl-financial-ui-contract.test.ts src/lib/tests/earn-page-surface-contract.test.ts src/lib/tests/history-table-scroll-accessibility.test.ts src/lib/tests/funding-history-page.test.tsx src/lib/tests/trade-history-page.test.tsx src/lib/tests/portfolio-surface-contract.test.ts src/lib/tests/account-activity-feed-owner.test.tsx skeleton-fallback
# Test Files 19 passed (19); Tests 341 passed (341)

pnpm --filter @gatu/terminal typecheck
# exit 0

pnpm exec biome check <23 个本任务变更/新增的 TypeScript、TSX 文件>
# Checked 23 files. No fixes applied.

pnpm memory:index && pnpm memory:check && pnpm memory:test
# Work-memory index updated / verified; tests 8, pass 8, fail 0

git diff --check
# exit 0
```

页面相关测试由 `rg -l` 搜索九个页面 import/source 路径取得：历史订单、成交、资金费率三个 page suite，RTL 金融 UI、earn/portfolio surface、history table scroll、account activity feed owner 共八个文件，均包含在最终命令内。没有更改描述符所属文件或英文源串，因此未执行 `pnpm i18n:extract`；仅 JSX 结构与缩进变化。

首轮指定组：333 项中 332 通过，1 项精确 header markup 失败；归一化 `/` 错变为空串，修复为保留根路径后 parity 单独复验 41/41。随后增加九个 preset 的水合覆盖，最终指定组全部 341 通过。没有掩盖或删除失败断言。类型检查首轮及最终均 exit 0。

Memory 首次 `memory:index` 因任务记录缺少模板必需的 `## 结论与依据` 标题而 exit 1，链中后续两个命令未执行；已改正标题后依序运行 `pnpm memory:index && pnpm memory:check && pnpm memory:test`：索引生成与校验成功，8/8 测试通过。未执行完整应用构建、全量 terminal suite、发布或浏览器实测；用户指定本轮将盒子测量交给 reviewer。自动测试验证源码与 DOM/class 契约，不等于实际像素验收。

## Reviewer 盒子测量

待 reviewer：`/portfolio`、`/vaults`，1440 / 1280 / 1030 / 390 px；深浅主题、en / zh。本轮未执行浏览器实测，不填写推测数字。

## 后续与替代关系

Reviewer 完成上述盒子测量并记录结果后，才能声明表面 7 视觉验收完成。本轮不替代既有终端 1–6 实测记录，也不改变首次水合的 terminal 壳策略。未执行 Git add/commit/stash/mv/branch switch/push，未修改 `.build/`。

## Reviewer 复核与 Playwright 实测（2026-09-16，同一未提交工作区）

复核方式：通读全部 diff（24 文件），对照 HEAD 的九个页面源码核对 `DASHBOARD_FRAMES` 预设与 `DashboardFrameView` 的 offset 逻辑；用 scratchpad 的 `dashboard-diff.mjs` 在开发服务器（:3005）记录仪表盘壳与真实页面的键控盒。仪表盘壳只在水合后、客户端运行时/i18n 就绪前显示（`getHydrationRouteSurface` 在水合前仍用终端壳），开发服务器上一闪而过，因此脚本对 `client-root` 模块请求延迟 3 s 以捕获壳帧（壳取字体就绪后的最后一帧，真实取内容渲染且字体就绪的帧）。

| 路由 / 视口 | 结果 |
| --- | --- |
| /portfolio 1440×900 | fixed 顶栏 0,0 1440×56、logo 81.4×18、nav 547.4×34、右侧簇 322.1×34、fixed 页脚 0,868 1440×32 全等；`main` 同起点 0,56、同宽，首个内容块同起点 64,88 同宽 1312；高度差（壳通用内容 592 vs 真实 90/563）为设计上的内容泛化 |
| /vaults 1440×900 | 顶栏、页脚全等；`main` 0,56 同宽，首块 40,80 1360 宽同起点；高度差同上 |
| /portfolio 1280×900 | 全等（右簇 937.9,10.5），仅内容高度差 |
| /portfolio 1030×900（≤1181 紧凑态） | nav 244.2、右簇 272 与真实全等，仅内容高度差 |
| /portfolio 390×664 | sticky 移动头 0,0 390×57、logo、六个动作槽（10/60/112/232/284/336，44×44 与钱包 112×44）全等；`main` 0,57 同宽，首块 16,81 358 宽同起点；无页脚（真实亦无） |
| /vaults 390×664 | 头栏全等；`main` 0,57、首块 0,73 390 宽同起点 |

差异只剩内容高度（通用占位 vs 各页数据 UI，ADR 已声明不承诺等高）。指定回归 15 文件 316 用例、Biome 23 文件、terminal typecheck 通过。页面相关测试补跑：`historical-orders-page`、`funding-history-page`、`trade-history-page`、`rtl-financial-ui-contract`、`history-table-scroll-accessibility`、`account-activity-feed-owner` 通过；`referral-ui-contract` 与 `api-wallet-ui-contract` 各有一条断言仍读取页面源码里的旧 frame 类字符串（已迁入 `DASHBOARD_FRAMES`），reviewer 改为读取预设并核对接线（见下）。

## 全量套件与生产构建（reviewer，同一工作区）

- `pnpm --filter @gatu/terminal test`（571 文件 / 6440 用例，在契约修正前启动）：12 文件失败——9 个基线红文件失败数不变；`api-wallet-ui-contract`(1) 与 `referral-ui-contract` 多出的 1 条即上文两条读取旧 frame 类的断言，修正后单独运行分别 4/4 通过、回到基线 3 条无关失败；`mobile-agent-sync-route`(18) 与 `portfolio-overview`(1) 为并发敏感（此前单独运行通过）。本表面未引入其他失败。
- `pnpm build` 通过：trade 静态启动闭包 1,582,399 gzip 字节（较表面 6 重设后的基线 +1,183）；客户端总 gzip 3,086,848（较总基线 −67,859）；移动运行时增量 111,634、桌面 194,046。构建不是发布。
