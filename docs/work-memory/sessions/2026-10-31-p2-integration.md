<!-- work-memory
{
  "schemaVersion": 1,
  "id": "2026-10-31-p2-integration",
  "date": "2026-10-31",
  "title": "第二批 P2 集成 PR：五个 P2 分支合成一个分支，建在 P1 集成之上",
  "kind": "task",
  "status": "recorded",
  "topics": ["pr-review", "order-entry"],
  "summary": "运营方 2026-10-31 选择把五个 P2 分支（下单校验、表格、资金、行情、被动数据）合成一个集成 PR 推到 dev。分支 claude/p2-integration 从 claude/p2-order-validation（已含本地 P1 集成 329f241d：dev d99c2bc9 + #123–#128 + #124 夹具修复）起，依次 --no-ff 合并其余四个分支；冲突只在 CHANGELOG、INDEX.md、balances.test.ts 末尾与 historical-orders-page.tsx 的导入行。合并结果与已跑过全量的本地预览只差任务记录与 CI 清单。按 CI 元数据的生产构建只超出总量预算（+15,813，允许 10,000）；按固定构建身份依次构建 dev、P1 集成与本分支，测得 +15,708（P1 +8,360、P2 +7,348），基线上调到 3,366,201（docs/terminal-performance-baseline.md，提交 1178a94d）。Codex 只读审查集成本身 9.5/10、无发现；本地按 CI 跑完八组浏览器回归共 240 项通过。",
  "thread": null,
  "baseCommit": "d99c2bc9",
  "commits": [],
  "sources": [
    {"path": "docs/work-memory/sessions/2026-10-31-p2-order-validation.md"},
    {"path": "docs/work-memory/sessions/2026-10-31-p2-tables.md"},
    {"path": "docs/work-memory/sessions/2026-10-31-p2-funds.md"},
    {"path": "docs/work-memory/sessions/2026-10-31-p2-market.md"},
    {"path": "docs/work-memory/sessions/2026-10-31-p2-passive-data.md"},
    {"path": "scripts/check-client-bundle-budget.mjs"}
  ],
  "supersedes": []
}
-->
# 第二批 P2 集成 PR

## 背景与范围

同步记录，未取得任务标识。运营方 2026-10-31 对「五个 P2 分支要合成一个集成 PR 推送到 dev 吗？」答「合成一个 PR」。这一次同意覆盖推送集成分支并开一个指向 `dev` 的 PR；#124 夹具修复单独推到 #124、文档分支 `claude/across-shelved-record` 推送，仍未取得同意。

- 分支 `claude/p2-integration`：从 `claude/p2-order-validation` 起（其中已合入本地 P1 集成 `329f241d`：`origin/dev` `d99c2bc9` + #123–#128 六个分支 + #124 的 `position-close-all` 夹具修复 `21ca05c5`/`8ee75309`），依次 `--no-ff` 合并 `claude/p2-tables`、`claude/p2-funds`、`claude/p2-market`、`claude/p2-passive-data`。
- 因为建在 P1 集成之上，这个 PR 在 #123–#128 合并前也包含它们的提交；先合本 PR 会一并合入它们，GitHub 会把它们标为已合并（PR #53 的先例，见仓库集成 PR 做法）。
- `origin/dev` 在推送前仍是 `d99c2bc9`，没有前进。

## 结论与依据

- 冲突与处理：`CHANGELOG.md`（各分支都在 Unreleased › Fixed 顶部加条目，取并集，核对无重复条目）、`docs/work-memory/INDEX.md`（`node scripts/work-memory.mjs --write` 重建）、`apps/terminal/src/lib/tests/balances.test.ts`（表格分支与资金分支各在末尾加一个 describe 块，两段都保留）、`apps/terminal/src/components/historical-orders/historical-orders-page.tsx`（两边各加一行导入，都保留）。
- 与本地预览分支 `claude/p2-preview`（`8fd11013`，已跑全量）相比，集成分支多出的只有文档（这份任务记录与被动数据记录的补充）、CI 清单 `a5aa0d7f` 与预算基线 `1178a94d`，都不改应用代码和测试；`git cherry -v origin/dev` 没有已进 dev 的重复补丁。
- `a5aa0d7f` 给 `.github/workflows/terminal-tests.yml` 补上 23 个相对 `origin/dev` 新增或改动、却未被列出的测试路径（用路径匹配核对，不用子串计数）。
- `.github/workflows/terminal-tests.yml` 里 `deposit-modal-withdrawal-routing-guard.test.tsx` 出现两次，`origin/dev` 上就如此（两个步骤各列一次），不是本次引入，未改。

## 验证与限制

- 全量单测：在 `8fd11013`（应用代码与测试和本分支相同）上 `pnpm --filter @sairn/terminal test -- --maxWorkers=4`，697 个文件、9535 项通过；唯一失败 `vite-development-cache` 在沙箱外单独重跑通过。
- 生产构建（CI 方式，`wt-p1-build` 工作树，Node 22.15.0，`VITE_MOBILE_PAIRING_ENABLED=false`，无 `.env.local`，构建元数据仿 CI）：`512082a3` 只在总量预算处失败，3,366,306，比 3,350,493 的基线多 15,813（允许 10,000）；交易页静态启动 +3,660、手机运行时 +7,813、桌面运行时 +75，均在允许范围内。
- 重定基线：在各自工作树里按 `docs/terminal-performance-baseline.md` 的固定构建身份依次构建 `dev` `d99c2bc9`（3,350,856）、P1 集成 `329f241d`（3,359,216）与本分支 `a5aa0d7f`（3,366,564），总量 +15,708；按 chunk 名比较，六个懒加载目录 +4,246，内含英文目录的 `vendor-tanstack-router` +1,541（多出的唯一模块是 ADR 0045 的交易所时钟），其余 +9,921；锁文件与各 `package.json` 与 dev 相同。六个 P1 PR 的 CI 构建相对 dev 的 CI 读数（3,350,598）各 +874 到 +3,096，合计 +10,225。总量基线按实测增量抬到 3,366,201（提交 `1178a94d`）；改后对同一产物重跑预算检查通过（+363），`node --test scripts/check-client-bundle-budget.test.mjs` 19 项通过，补跑 `inject-shell-preloads` 与 `collect-inline-script-hashes` 成功。CI 元数据不同，读数可能差几百字节。
- 浏览器回归（本分支工作树，与 `.github/workflows/slider-browser.yml` 八个步骤相同的规格与配置，单进程不分片）：滑块 22、订单簿 CLS/抽屉/订单簿悬停/Vault 列表/推荐码卡片 55、下单面板 47、资金操作 36、全部平仓 46、通知 19、品牌表面 2、已连接头部宽度 13，共 240 项全部通过；其间有生产构建在同一台机器上并行。
- Codex 只读审查（`gpt-6-astra`，low，范围为集成本身：五个合并提交（四个 P2 合并与 `d007ba56`）的冲突处理、被多个 P2 分支改过的文件、`a5aa0d7f` 的 CI 清单）：9.5/10，无 P1/P2/P3；`--remerge-diff` 被它的只读沙箱拒绝，改用合并差异与双父提交交叉核对，未运行测试。它指出 `ar/es/fr/hi` 各有 31 条空译文，`origin/dev` 上同样各 31 条，不是本次引入。
- 未做：真实账户与真机验收。

## 后续与替代关系

- 合并后在新的 `dev` 上补跑 typecheck、全量单测与 `memory:check`；若合并前 `dev` 被别的 PR 推进，本 PR 要先合并 `dev` 再验证。
- 待运营方决定的事项见各 P2 任务记录的「后续与替代关系」。
- 包体余量：`trade-terminal-page` 126,853，余 389（本批 +761，主要来自 #123）；`vaults-page` 29,849，余 226（+646，全部来自 #125）；手机运行时增量余 2,195。下一个让它们增长的改动需要单独实测重定基线。
- #124 单独的浏览器回归在 CI 上失败（缺 `position-close-all` 夹具修复，修复只在本分支）；把修复推到 #124 需要运营方另行同意。
