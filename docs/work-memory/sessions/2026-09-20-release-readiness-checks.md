<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-09-20-release-readiness-checks",
  "date": "2026-09-20",
  "title": "dev 晋升 main 之前的本地预检：四个配对组合的生产构建与字号迁移等值对比",
  "kind": "task",
  "status": "verified",
  "topics": [
    "pairing-release",
    "docs-governance"
  ],
  "summary": "dev 5ea5d625 上四个配对组合在本地按 CI 原步骤全部通过，true/true 下 trade-terminal-page 余量 1,192 字节，本地与 CI 字节数相差约 10；127 处字号迁移去重为 86 对类串，在真实浏览器与应用样式表下 6,880 次对比零差异且阴性对照有效。随后在登录的主网账户上对真实组件做原地新旧对比：桌面与移动端各页签、八个弹窗、充值提现共 1,382 个元素零差异，覆盖 86 对中的 73 对，未执行任何交易。PR 进 main 的 CI 路径仍未验证。",
  "thread": null,
  "baseCommit": "5ea5d625f9e91705aa53d1511419b26d674112d4",
  "commits": [
    "2c015279",
    "97627bd7"
  ],
  "sources": [
    { "path": ".github/workflows/production-build.yml" },
    { "path": "scripts/check-client-bundle-budget.mjs" },
    { "path": "docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md" },
    { "path": "docs/work-memory/sessions/2026-09-20-font-practice-review.md" },
    { "path": ".claude/rules/design-tokens.md" }
  ],
  "supersedes": []
}
-->
# dev 晋升 main 之前的本地预检：四个配对组合的生产构建与字号迁移等值对比

## 背景与范围

同步记录。dev（`5ea5d625`）领先 main 47 个提交，准备晋升。ADR 0016 之后，进 dev 的 PR 只构建默认配对组合，其余三种组合、体积预算与懒加载图要到 dev → main 的 PR 才由 CI 验证，而这条路径还没有真正运行过；#33、#34 改的正是配对代码。另外，字号迁移（`2c015279`，127 处）里需要账户数据才出现的界面此前只有静态核对和单测覆盖。用户要求先把这两项风险在开 PR 之前处理掉。任务标识未取得（`thread: null`）。

本记录只覆盖两项本地预检，没有修改任何业务代码。

## 结论与依据

### 四个配对组合的生产构建

在独立工作树（dev `5ea5d625`，全新安装依赖，没有任何 `.env` 文件）里，用与 CI 相同的 Node 22.15.0 按 `production-build.yml` 的原步骤逐个组合执行：带 `GATU_BUILD_SHA`、`NODE_ENV=production`、`NITRO_PRESET=node-server` 和两个 `VITE_MOBILE_PAIRING_*` 开关的 `pnpm --filter @gatu/terminal build`（自带 chunk 环、体积预算、预加载注入、内联脚本哈希、首脚本断言），随后 `perf:startup`、启动产物并用 `deploy/resolve-client-asset.mjs` 校验懒加载图、`deploy/verify-chart-build.mjs`。

| 组合（create/import） | build | perf:startup | 懒加载图 | 图表校验 | `trade-terminal-page` gzip（vite 显示） |
| --- | --- | --- | --- | --- | --- |
| false/false | 通过 | 通过 | 通过 | 通过 | 126.02 kB |
| false/true | 通过 | 通过 | 通过 | 通过 | 126.03 kB |
| true/false | 通过 | 通过 | 通过 | 通过 | 126.02 kB |
| true/true | 通过 | 通过 | 通过 | 通过 | 126.05 kB |

- true/true 产物的 `build-meta.json` 为 `mobileSync: { createAndReveal: true, importFromQr: true }`，确认开关确实生效。
- 用预算脚本同样的 `gzipSync` 口径量 true/true 产物：`trade-terminal-page` 126,050 字节，上限 127,242，余量 1,192；`token-selector-popup` 余量 1,311；`api-wallet` 余量 1,252。四个组合之间这个块只差约 30 字节，配对代码没有进入它。此前记录的 126,297 字节是字号迁移之前的数值。
- 校准：同一份代码树（`97627bd7` 与 `5ea5d625` 的文件树相同）上 CI 的 false/false 为 398.94 kB / gzip 126.01 kB，本地为 398.94 kB / gzip 126.02 kB，相差约 10 字节。本机默认的 Node 24 带的 zlib 版本不同（1.3.1 对 1.3.0.1），所以没有用它。

### 字号迁移的等值对比

需要账户数据的组件各依赖 6 到 7 个数据 hook（TP/SL 弹窗 1,555 行、订单页签 1,633 行），为 23 个文件逐一造模拟数据夹具的成本高，模拟是否逼真也会成为新的不确定性，因此没有采用。改为证明类串等值：迁移只替换元素自身的字号 token，且同一元素带显式 `leading-*`，该元素的 `font-size` 与 `line-height` 在新旧两版都是显式设定的，不取决于数据或继承；源码 diff 已确认除该 token 外逐行相同。

- 从 `2c015279` 的 diff 提取新旧字面量，去重为 86 对（36 个文件，89 处 token 替换；127 处里有重复的相同类串）。被替换的 token 只有无前缀、`max-[360px]:`、`min-[1001px]:` 三种形式。
- 临时测试台由夹具用的 Vite 配置提供服务，加载应用真实样式表，用 Chrome 渲染。每对类串在 4 种父级上下文（异常继承值 23px/31px、`text-base leading-none`、`text-xs`、`font-market-close text-sm`）下各渲染两次：原样，以及经过项目的 `cn()`。比较两个元素的全部计算属性（857 个）和包围盒。
- 深色、浅色各在 1440、1001、1000、375、360 五个宽度运行，共 10 轮、6,880 次对比，差异 0；"字号规则缺失"为 0，即新旧类的规则都实际生成。
- 阴性对照：`text-[13px]`→`text-xs` 在全部 8 种情形下被报为 `font-size` 不同；不带显式 `leading-*` 的 `text-[13px]`→`text-2sm` 被报为 `line-height`、`height`、包围盒等不同；等值对照为 0。第二个对照也是当初没有迁移其余 87 处的原因。
- `2c015279` 之后到 dev 顶端，没有提交再改动这 41 个迁移过的源文件，结论适用于 `5ea5d625`。

### 登录态下的原地新旧对比（2026-09-20，同一会话稍后）

用户要求启动开发服务器做登录状态下的测试，并表示不必顾虑余额与仓位。主检出在 dev `5ea5d625`，用 `.claude/launch.json` 的 `terminal` 配置在 3005 端口启动（`lsof -d cwd` 确认进程目录为主检出，页脚版本号为 `V0.1.0+5EA5D625`）；`.env.local` 未设 `VITE_HYPERLIQUID_TESTNET`，因此是主网。内置浏览器里已有此前保留的邮箱登录会话，账户有未平仓位和成交、资金费、订单历史。本记录不保存邮箱、地址、余额或仓位明细。

操作边界：不执行任何交易或资金操作，不点任何确认、提交、签名按钮，弹窗一律用 Esc 关闭。市价平仓在偏好为 `dismissed` 时会直接提交（`use-position-market-close-action.ts`），点击前确认该浏览器里不存在 `gatu:position-market-close-confirmation` 键，结束时再次确认仍不存在；反手与全部平仓只设置本地状态并渲染确认弹窗，代码里没有直接提交的路径。每次关闭弹窗后核对仓位数、挂单数、TWAP 数、提示条与打开的弹窗数，全程未变。

方法：在页面里注入一个只读记录器。对页面上命中 86 对类串之一的每个可见元素，同步地把新字号 token 换回旧 token、读取 12 个排版属性与三层包围盒（元素、父级、所在行或弹窗），再换回，整个过程在一次同步任务内完成。四个已从源码绝迹、开发样式表不再生成规则的旧 token（`text-[14px]`、`max-[360px]:text-[13px]`、`min-[1001px]:text-[11px]`、`min-[1001px]:text-[10px]`）通过克隆对应新 token 的真实规则并去掉 `line-height` 声明来重建，插在同一父规则的相邻位置以保持媒体条件与层叠顺序；这种等价已由上一节用真实生成的规则证明。页面的 CSP 拦截了对本机文件服务的 `fetch`，数据与脚本改为随调用直接注入。

覆盖与结果：

| 表面 | 宽度 | 结果 |
| --- | --- | --- |
| 账户表七个页签（余额、持仓、挂单、TWAP、成交历史、资金费、订单历史） | 1192 | 零差异 |
| PnL 分享、TP/SL、限价平仓、市价平仓确认、反手确认、全部平仓确认 | 1192 | 零差异 |
| 充值、提现、代币选择器（含 Spot 分类）、资产信息 | 1192 | 零差异 |
| 紧凑导航下的用户菜单触发器 | 1100 | 零差异 |
| 移动端七个页签、展开的持仓卡片与市场详情 | 390 | 零差异 |
| 移动端限价平仓、市价平仓确认、TP/SL、反手确认、PnL 分享 | 390 | 零差异 |

合计检查 1,382 个元素，差异 0，碰到 86 对中的 73 对；其中成交历史 225、移动持仓卡片 225、订单历史 189、资金费 120、持仓行 65、平仓弹窗共用部分 60。同时目视检查了各弹窗截图，没有发现截断或重叠。

限制：
- 只在深色主题下运行；浅色主题的等值由上一节的测试台覆盖。
- 未碰到的 13 对：法律确认弹窗 3 对（需重置已接受的条款）、持仓行的 TP/SL 标签 2 对与移动端挂单页签和改单弹窗共 3 对（需真实的 TP/SL 或挂单）、未登录时的连接按钮 1 对、现货市场社交链接 1 对、代币选择器行 1 对、资产信息 1 对、充值表单某状态 1 对。没有为提高覆盖率去下单、设置 TP/SL 或重置条款。这 13 对的等值仍由测试台证明。
- 类串较短的字面量（如 `text-2sm leading-5`）会匹配到其他组件里同样写法的元素，所以按文件统计的元素数对这类字面量只是近似；差异统计不受影响。
- 这是一台 macOS 设备上的 Chrome，未测其他浏览器与真机。

## 验证与限制

- 以上均为 2026-09-20 在本机（macOS）执行；构建用 Node 22.15.0，测试台用本机 Chrome。
- 第一次运行测试台超过 10 分钟：每次挂载后读取全部计算样式会触发对整份样式表的重算，且当时生产构建在并行运行。脚本实际已完成并写出结果，是 `pnpm` 启动的 vite 子进程没有随 SIGTERM 退出而拖住了进程；已手工结束。
- 测试台证明的是类串在真实样式表下的计算样式等值，不是组件在真实账户数据下的渲染；后者见上文的登录态验证。
- CI 上"PR 进 main 才构建其余三个组合"这条路径仍未运行；本地通过不等于该工作流的触发条件与矩阵表达式正确，后者目前只有 `scripts/ci-workflows.test.mjs` 从结构上约束。
- 体积余量约 1.2 KB，仍然很薄；后续任何进入 `trade-terminal-page` 的改动都可能触线。
- 测试台的五个文件是未入库的临时文件，是否作为常驻回归测试入库尚未决定。没有运行 Playwright 既有套件和全量单测（dev 顶端的文件树已在 #32 的 CI 与本地全量单测中验证过，见字体审查记录）。

## 后续与替代关系

- 可以开 dev → main 的 PR；预期四路构建一次通过，是否合并由用户决定。合入 main 不等于上线（ADR 0016），真机验收与配对开关保持关闭仍是发布闸门。
- 待用户决定：测试台是否入库；是否开 dev → main 的 PR。
- 下一次先查：`docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md`、`scripts/check-client-bundle-budget.mjs` 的基线表、字体审查记录。
