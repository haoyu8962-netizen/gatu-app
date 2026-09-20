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
  "summary": "dev 5ea5d625 上四个配对组合在本地按 CI 原步骤全部通过，true/true 下 trade-terminal-page 余量 1,192 字节，本地与 CI 字节数相差约 10；127 处字号迁移去重为 86 对类串，在真实浏览器与应用样式表下 6,880 次对比零差异且阴性对照有效。真实账户数据下的组件渲染、PR 进 main 的 CI 路径仍未验证。",
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

## 验证与限制

- 以上均为 2026-09-20 在本机（macOS）执行；构建用 Node 22.15.0，测试台用本机 Chrome。
- 第一次运行测试台超过 10 分钟：每次挂载后读取全部计算样式会触发对整份样式表的重算，且当时生产构建在并行运行。脚本实际已完成并写出结果，是 `pnpm` 启动的 vite 子进程没有随 SIGTERM 退出而拖住了进程；已手工结束。
- 测试台证明的是类串在真实样式表下的计算样式等值，不是组件在真实账户数据下的渲染。持仓行、订单行、平仓与 TP/SL 弹窗、PnL 分享卡仍没有人在登录状态下看过。
- CI 上"PR 进 main 才构建其余三个组合"这条路径仍未运行；本地通过不等于该工作流的触发条件与矩阵表达式正确，后者目前只有 `scripts/ci-workflows.test.mjs` 从结构上约束。
- 体积余量约 1.2 KB，仍然很薄；后续任何进入 `trade-terminal-page` 的改动都可能触线。
- 测试台的五个文件是未入库的临时文件，是否作为常驻回归测试入库尚未决定。没有运行 Playwright 既有套件和全量单测（dev 顶端的文件树已在 #32 的 CI 与本地全量单测中验证过，见字体审查记录）。

## 后续与替代关系

- 可以开 dev → main 的 PR；预期四路构建一次通过，是否合并由用户决定。合入 main 不等于上线（ADR 0016），真机验收与配对开关保持关闭仍是发布闸门。
- 待用户决定：是否用 testnet 账户或只读方式在登录状态下看一遍账户界面；测试台是否入库。
- 下一次先查：`docs/adr/0016-dev-first-pull-requests-and-ci-tiers.md`、`scripts/check-client-bundle-budget.mjs` 的基线表、字体审查记录。
