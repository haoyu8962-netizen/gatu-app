<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-04-integrate-chart-precision-silent-wallet",
  "date": "2026-10-04",
  "title": "集成 PR：图表价格精度（ADR 0035）与邮箱静默建钱包（ADR 0033）合并进 dev",
  "kind": "task",
  "status": "verified",
  "topics": ["pr-review", "wallet-onboarding", "hyperliquid-api"],
  "summary": "用户要求把两条未推送的分支合成一个 PR 提交到 dev。从 origin/dev（498ea17a）建 claude/integrate-chart-precision-silent-wallet，先合图表价格精度（3 个提交），再合邮箱静默建钱包（4 个提交），都用 --no-ff 保留原哈希。文本冲突只在 CHANGELOG、ADR 目录和生成的记录索引；语义冲突一处：dev 后来加的小数显示契约要求登记每处 toFixed，图表的 tick size 在合并提交里登记。类型检查、源码契约、钱包与引导测试组、全量单测和生产构建通过。ADR 0033 的两项待用户决定事项仍未决定；没有做浏览器或真实邮箱注册验收，也没有对集成结果另做 Codex 审查。",
  "thread": null,
  "baseCommit": "498ea17a",
  "commits": ["399dbbd9", "3d6a8000", "20d0e01f", "176c5a2a", "04394b08", "0bbbb248", "1de833b8", "15538d88", "f285d3bd"],
  "sources": [
    { "path": "docs/adr/0033-silent-email-wallet-creation.md" },
    { "path": "docs/adr/0035-chart-price-precision-from-market-rules.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-silent-email-wallet-creation.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-chart-price-precision.md" },
    { "path": "apps/terminal/src/lib/tests/decimal-display-contract.test.ts" },
    { "path": "scripts/check-client-bundle-budget.mjs" }
  ],
  "supersedes": []
}
-->
# 集成 PR：图表价格精度（ADR 0035）与邮箱静默建钱包（ADR 0033）合并进 dev

## 背景与范围

2026-10-04，用户在整理工作区之后，要求把剩下的两条未合并分支「合并到一个 PR 提交到 dev」：

| 分支 | 提交 | 基线 | 内容 |
|---|---|---|---|
| `claude/infallible-goldstine-02a7e3` | `399dbbd9`、`3d6a8000`、`20d0e01f` | `682430ba` | 图表价格精度按市场规则取档，价格跨 10 的幂不重建图表（[ADR 0035](../../adr/0035-chart-price-precision-from-market-rules.md)，[记录](2026-10-02-chart-price-precision.md)） |
| `claude/silent-email-wallet` | `176c5a2a`、`04394b08`、`0bbbb248`、`1de833b8` | `04a52301` | 邮箱注册后静默创建钱包，协议弹窗等 Privy 窗口关闭后再出现（[ADR 0033](../../adr/0033-silent-email-wallet-creation.md)，[记录](2026-10-02-silent-email-wallet-creation.md)） |

合并前核对过：

- 两条分支都没有推送。`git cherry` 显示 7 个提交都还不在 `dev` 里。
- 两个工作树都没有未提交的改动，也没有进程占用。

## 结论与依据

### 合并

- 从 `origin/dev`（`498ea17a`）新建 `claude/integrate-chart-precision-silent-wallet`，先合较小的图表分支（`15538d88`），再合钱包分支（`f285d3bd`），都用 `--no-ff`，保留原提交哈希，因为两份记录都引用了它们。
- 文本冲突两次都只在三个文件：
  - `CHANGELOG.md`：两边的条目都保留；
  - `docs/adr/README.md`：按编号排成 0032–0037；
  - `docs/work-memory/INDEX.md`：用 `pnpm memory:index` 重新生成。
- 语义冲突一处。`dev` 在图表分支之后新增的小数显示契约（ADR 0037）要求登记每处 `toFixed`/`toPrecision`。`lib/chart/price-format.ts` 的 `getTickSize` 用 `toFixed` 生成 TradingView `variable_tick_size` 的档位，这是交给图表库的协议值，不是显示文字。所以在合并提交 `15538d88` 里按契约登记，写明用途、次数 1。
- 其他代码自动合并：钱包分支与 `dev` 的 Privy 3.46.0 升级、银行卡入金都动过 `client-root.tsx`、`deposit-modal.tsx`、`config/privy.ts`。Privy 升级的会话当时已确认保留 `createOnLogin: "off"`（见钱包分支记录）。合并后的检查见下。

### 文档

- ADR 0033、0035 的状态行追加了日期补记，原文不动；ADR 目录这两行改为「随 PR #77 提交到 `dev`」。0035 那行原写「0033、0034 由其他未推送分支使用」，已经过时，一并删去。
- 两条分支的记录各追加一条补记，指向本记录。

## 验证与限制

版本：`f285d3bd`（两次合并之后），文档补记只改 Markdown。本机 Node 22.15.0、pnpm 10.21.0。

- `pnpm --filter @sairn/terminal typecheck`：通过。
- 源码契约 12 个文件、492 项通过：数字、日期、语言、小数显示、本地化格式、Lingui 辅助、移动端数据提示、弹窗退出控件、弹窗提示圆角、状态动效、进度文案、品牌目录。
- `AGENTS.md` 的钱包签名、首次交易引导与连接界面一组，加上钱包分支自己的测试、充值与卡入金测试：32 个文件、620 项通过。
- `node --test scripts/ci-workflows.test.mjs` 10 项通过。CI 清单没有新增重复条目（唯一的重复 `deposit-modal-withdrawal-routing-guard.test.tsx` 在 `dev` 上本来就有）。本 PR 改动或新增的 17 个终端测试文件都在 CI 里。
- `pnpm i18n:extract` 没有改动目录；五种语言的缺译条目与合并前相同，没有丢失译文。
- 全量 `pnpm --filter @sairn/terminal test -- --maxWorkers=4`（01:44:57 起，144 秒）：663 个文件中 662 个通过、1 个跳过；8,631 项中 8,630 项通过、1 项跳过。
- 生产构建：在草稿目录里建两个隔离 worktree，都切到 `f285d3bd`。各自执行 `pnpm install --frozen-lockfile --prefer-offline`；构建前当场存档了状态：两边都没有改动，只有 `.env.example`，已安装的锁文件与 `pnpm-lock.yaml` 排序后逐行相同。Node 22.15.0，配对关闭，`NODE_ENV=production`、`NITRO_PRESET=node-server`。两次构建的 chunk 循环检查（441 个）和预算检查都通过，产物都是 443 个资产。

  | 项（gzip 字节） | 固定元数据 | CI 式元数据 | 基线 + 容差 |
  |---|---:|---:|---:|
  | 客户端总量 | 3,297,214 | 3,296,982 | 3,287,651 + 10,000 |
  | 路由预加载本身（6 个，诊断项） | 516,844 | 516,837 | — |
  | 交易页静态启动（101 个资产） | 1,631,973 | 1,631,915 | 1,643,929 + 10,000 |
  | 手机运行时增量（14 个资产） | 118,334 | 118,330 | 110,580 + 10,000 |
  | 桌面运行时增量（29 个资产） | 202,733 | 202,780 | 193,129 + 10,000 |

  - 两份构建第一次并行时，CI 式那份在预渲染时报「Failed to start the Vite preview server」，两份几乎同时进入预渲染。单独重跑后通过，表中是重跑的数字。
  - 与 `dev` 的产品代码相比（`fc5e10cd` 的固定元数据构建：总量 3,293,592、桌面 202,173；`fc5e10cd` 之后 `dev` 只合入了文档），本 PR 让总量增加约 3,622，桌面运行时增加约 560。
  - 余量很小：总量只剩 437（固定）/ 669（CI 式），桌面运行时只剩 396 / 349。真实 CI 与本地读数之间差过几十到几百字节。按 `docs/terminal-performance-baseline.md`，没有超出就不调整基线；如果真实 CI 超限，按 2026-10-03 那次的做法成对构建 `dev` 与 PR 头，按实测增量说明理由后重定基线。

限制：

- 没有做浏览器、真机或真实邮箱注册验收。ADR 0033 的验收清单（全新邮箱注册、已有钱包的邮箱登录、断网后的失败与恢复）要等发布后做。
- 两条分支各自做过 Codex 只读对抗审查（钱包三轮、图表三路加一次窄复审）；集成之后的结果没有再送审。
- 图表分支的记录写过「未做生产构建与真人目测」，这次集成构建是这部分改动第一次进生产构建；真人目测仍没有做。

## 后续与替代关系

- ADR 0033 的两项待用户决定事项，合入前后都需要用户拍板：
  - 登录后 Privy 智能钱包关联会在后台签一条 SIWE 消息，与 `AGENTS.md`「登录、刷新和状态检查绝不签名」字面冲突。可选：接受为有界例外并写进 `AGENTS.md`；或者把关联推迟到第一次充值。这是 Privy SDK 原有的行为，不是本 PR 引入的。
  - `docs/runtime-guardrails.md` 说普通断开不删本地 Agent 密钥，代码一直在删，以哪边为准。
- 发布编号：p25 留给旧域名清理（PR #73）。本 PR 如果先发布，要按当时的序号命名。
- 本记录不替代任何记录。
