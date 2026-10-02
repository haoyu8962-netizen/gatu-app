<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-02-integrate-locale-number-format",
  "date": "2026-10-02",
  "title": "集成 PR：页脚时钟、Vault 语言依赖与数字格式刷新三条分支合并进 dev，Codex 多轮对抗审查",
  "kind": "task",
  "status": "recorded",
  "topics": ["i18n-runtime", "pr-review"],
  "summary": "进行中：把 claude/laughing-engelbart-b9dbe6（页脚时钟）、claude/relaxed-roentgen-fd0316（Vault 与组合收益图语言依赖）、claude/wonderful-goldberg-e47b19（数字格式刷新，ADR 0036）三条叠放的未推送分支以 --no-ff 合进从 origin/dev 建的 claude/integrate-locale-number-format，新增 CI 步骤，并按用户要求用 Codex 做至少 3 轮只读对抗审查、评分大于 9。",
  "thread": null,
  "baseCommit": "682430ba",
  "commits": ["b99a1190", "2b7973b4", "5425b7c1", "04469b52", "41c585cb"],
  "sources": [
    { "path": "docs/work-memory/sessions/2026-10-02-footer-clock-live-minute.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-vault-fetched-time-locale.md" },
    { "path": "docs/work-memory/sessions/2026-10-02-number-format-reactive-formatters.md" },
    { "path": "docs/adr/0036-render-time-number-formatters.md" },
    { "path": ".github/workflows/terminal-tests.yml" },
    { "path": "apps/terminal/src/lib/tests/number-format-reactivity-contract.test.ts" }
  ],
  "supersedes": []
}
-->
# 集成 PR：页脚时钟、Vault 语言依赖与数字格式刷新三条分支合并进 dev，Codex 多轮对抗审查

## 背景与范围

同步记录。Claude Code 桌面应用会话，工作树 `wonderful-goldberg-e47b19`；未取得可核对的任务标识。

用户要求：

- 把三条分支合成一个集成 PR 开到 `dev`；
- 调用 Codex 对抗审查这个 PR，至少 3 轮，评分大于 9。

三条分支都未推送，且依次叠放：

| 分支 | 提交 | 内容 | 记录 |
|---|---|---|---|
| `claude/laughing-engelbart-b9dbe6` | `b99a1190`、`2b7973b4` | 页脚时钟按整分钟走时 | [页脚时钟](2026-10-02-footer-clock-live-minute.md) |
| `claude/relaxed-roentgen-fd0316` | `5425b7c1` | Vault 获取时间与组合收益图跟随语言/数字格式，编译器依赖契约 | [Vault](2026-10-02-vault-fetched-time-locale.md) |
| `claude/wonderful-goldberg-e47b19` | `04469b52` | 数字格式刷新（ADR 0036）与 15 处日期 `locale` | [数字格式](2026-10-02-number-format-reactive-formatters.md) |

合并前的核对：

- `origin/dev` 仍为 `682430ba`，三个分支头与叠放关系一致，没有新提交。
- 另两个会话在 `list_sessions` 里为 `isRunning: false`（最后活动 08:24 与 09:37），工作树干净；它们的 `claude` 进程仍在，会话是打开的，只是空闲。

## 结论与依据

### 合并

- `git merge-tree --write-tree --name-only origin/dev <分支>` 对三条分支都没有冲突。
- `git cherry -v origin/dev <分支>` 显示 4 个提交都还未进入 `dev`。
- 从 `origin/dev` 建 `claude/integrate-locale-number-format`，按叠放顺序 `git merge --no-ff`，得到 `564b93de`、`e75a76aa`、`5d3ff8e7`。工作记录引用提交哈希，所以不 squash、不 rebase。
- `git diff 04469b52 5d3ff8e7` 为空：合并结果的代码树与最上层分支完全相同。

### CI

`terminal-tests.yml` 只跑显式列出的测试文件。合并时本 PR 涉及的 31 个测试文件中有 20 个不在清单里，包括 3 个新测试文件、AGENTS.md「Number and date formatting」与「Runtime translation contract」两组的大部分文件。

新增步骤「Test number format and runtime locale contracts」（`41c585cb`）。第 1 轮审查后又补了 4 个被本 PR 改动的测试文件，共 30 个。本机用单工作进程跑最初的 26 个文件，554 项通过、47 秒（负载 12–22）。`scripts/ci-workflows.test.mjs` 7 项通过，Ruby 解析 YAML 正常。

### Codex 对抗审查

调用方式：`codex exec -m gpt-6-astra -s read-only -c approval_policy='"never"' -c model_reasoning_effort='"medium"' --output-last-message …`，在本工作树只读运行，审查期间不改工作树、不跑 vitest。

本机默认模型 `gpt-6.1-sol` 在 ChatGPT 账号下返回 400「not supported」，三路都在 10 秒内退出，改用 `gpt-6-astra`。

提示词由三部分组成：共享背景（被审范围、作者意图、硬性约束、输出格式与评分规则）、一份写明「需要你去证伪」的作者意图，以及各路的攻击面清单。

**第 1 轮（三路并行，20:36–20:42）**

| 路 | 重点 | 用量 | 评分 |
|---|---|---|---|
| A | 运行时行为 | 26 条命令、约 26 万 token | 9.2 |
| B | 规范、文档与评分表 | 24 条命令、约 10.7 万 token | 8.6 |
| C | 遗漏与测试强度、变异推演 | 23 条命令、约 11.2 万 token | 8.0 |

A 路无 P0–P3 发现。它抽查了 12 个文件的编译产物、98 处 Hook 位置、helper 接线、确认面提交值和时钟生命周期，扣分来自它的环境没有实际运行测试。

B、C 两路的发现，经本会话逐条核实全部成立：

- **B-P2**：数字格式与 Vault 两条记录的摘要把验证概括为「通过」，与正文记载的失败不符；「89 个组件改用 Hook」应为 85 个（另 4 个只改日期）。已改写摘要并在两条记录里加「更正记录」，正文未改。
- **C-P2**：契约检查器漏掉四种写法，C 路在内存里复现了它们：
  - 命名空间解构后经 helper 使用；
  - `memo(function render…)` 这种内部函数名小写的包装；
  - 带括号的匿名默认导出；
  - 字符串键的路由 `component`。

  已补齐，并加入审查给出的样例。
- **C-P2**：Earn 异步成功提示缺少「挂载中切换」测试。新用例走真实提交路径，挂载捕获的提示，先切数字格式、再切语言，断言同一节点更新。在基线 `5425b7c1` 上它停在 `5,029.4` 并失败。
- **B-P3**：「结果未用到」只按名字匹配，同名内层参数会掩盖。C 路另指出 `void fmt` 也会被放过。已改为按绑定判断，并排除 `void` 与单独的表达式语句。
- **C-P3**：模块顶层只保存函数引用（`const fmt = formatUSD`）被误报。已改为只报实际调用；别名仍会传播，引用它的组件照样会被拦下。
- **B-P3**：组合收益图的手写 `useMemo` 与代码风格规则冲突。已在 `.claude/rules/code-style.md` 登记这一条有编译证据的例外。
- **C-P3**：Known 清单漏了跨链各屏金额（`formatTokenBalance`、`formatSendAmount`）和订单簿价格分组标签（`formatTickSize`）。已补进归属文档、ADR 与 CHANGELOG。
- **C 路的覆盖缺口**：
  - `referred-traders` 的日期修复只有编译证据。已补运行时用例，基线上 3 个用例全部失败；
  - 4 个被改动的测试文件不在 CI 里。已加入新步骤。

修复后，扩展的契约有 36 项：26 个应报出样例、6 个应放行样例、4 项真实源码树检查。它在基线 worktree 上仍报 356 处违规、4 项失败。

## 验证与限制

（进行中，后续轮次与最终验证完成后补全。）

## 后续与替代关系

（进行中。）
